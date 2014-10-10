#!/usr/bin/env python
# Copyright 2010-2014 RethinkDB, all rights reserved.

"""`driver.py` is a module for starting groups of RethinkDB cluster nodes and
connecting them to each other. It also supports netsplits.

It does not support administering a cluster, either through the HTTP interface
or using `rethinkdb admin`. It is meant to be used with other modules that
administer the cluster which it starts.

`driver.py` is designed to use the RethinkDB command line interface, not to
test it; if you want to do strange things like tell RethinkDB to `--join` an
invalid port, or delete the files out from under a running RethinkDB process,
or so on, you should start a RethinkDB process manually using some other
module. """

from __future__ import print_function

import atexit, os, random, re, shutil, signal, socket, subprocess, sys, tempfile, time, traceback

import utils

def block_path(source_port, dest_port):
    # `-A` means list all processes. `-www` prevents `ps` from truncating the output at
    # some column width. `-o command` means that the output format should be to print the
    # command being run.
    if "resunder" not in subprocess.check_output(["ps", "-A", "-www", "-o", "command"]):
        sys.stderr.write('\nPlease start resunder process in test/common/resunder.py (as root)\n\n')
        assert False, 'Resunder is not running, please start it from test/common/resunder.py (as root)'
    conn = socket.create_connection(("localhost", 46594))
    conn.sendall("block %s %s\n" % (str(source_port), str(dest_port)))
    # TODO: Wait for ack?
    conn.close()

def unblock_path(source_port, dest_port):
    assert "resunder" in subprocess.check_output(["ps", "-A", "-www", "-o", "command"])
    conn = socket.create_connection(("localhost", 46594))
    conn.sendall("unblock %s %s\n" % (str(source_port), str(dest_port)))
    conn.close()

def find_rethinkdb_executable(mode=None):
    return utils.latest_rethinkdb_executable(mode=mode)

def cleanupMetaclusterFolder(path):
    if os.path.isdir(str(path)):
        try:
            shutil.rmtree(path)
        except Exception as e:
            print('Warning: unable to cleanup Metacluster folder: %s - got error: %s' % (str(path), str(e)))

runningServers = []
def endRunningServers():
    for server in runningServers[:]:
        try:
            server.check_and_stop()
        except Exception as e:
            sys.stderr.write('Got error while shutting down server at exit: %s\n' % str(e))
atexit.register(endRunningServers)

def get_table_host(processes):
    server = random.choice(processes)
    return (server.host, server.driver_port)

class Metacluster(object):
    """A `Metacluster` is a group of clusters. It's responsible for maintaining
    `resunder` blocks between different clusters. It's also a context manager
    that cleans up all the processes and deletes all the files. """
    
    __unique_id_counter = None
    
    def __init__(self):
        self.clusters = set()
        self.dbs_path = tempfile.mkdtemp()
        atexit.register(cleanupMetaclusterFolder, self.dbs_path)
        self.__unique_id_counter = 0
        self.closed = False

    def close(self):
        """Kills all processes and deletes all files. Also, makes the
        `Metacluster` object invalid. Call `close()` xor `__exit__()`, not
        both, because `__exit__()` calls `close()`. """
        assert not self.closed
        self.closed = True
        while self.clusters:
            iter(self.clusters).next().check_and_stop()
        shutil.rmtree(self.dbs_path)

    def __enter__(self):
        return self

    def __exit__(self, exc, etype, tb):
        self.close()

    def get_new_unique_id(self):
        returnValue = self.__unique_id_counter
        self.__unique_id_counter += 1
        return returnValue
    
    def move_processes(self, source, dest, processes):
        """Moves a group of `Process`es from one `Cluster` to another. To split
        a cluster, create an empty cluster and use `move_processes()` to move
        some processes from the original one to the empty one; to join two
        clusters, move all the processes from one into the other. Note that
        this does not tell the servers to connect to each other; unless the
        incoming servers were connected to the existing servers before, or
        unless you start a new server in the destination cluster to bring the
        two groups of processes together, they may remain unconnected. """
        assert isinstance(source, Cluster)
        assert source.metacluster is self
        assert isinstance(dest, Cluster)
        assert dest.metacluster is self
        for process in processes:
            assert isinstance(process, Process)
            assert process.cluster is source
            process.cluster = None
            source.processes.remove(process)
        try:
            for process in processes:
                source._block_process(process)
            for process in processes:
                dest._unblock_process(process)
        except Exception:
            for process in processes:
                process.close()
            raise
        for process in processes:
            process.cluster = dest
            dest.processes.add(process)

class Cluster(object):
    """A `Cluster` represents a group of `Processes` that are all connected to
    each other (ideally, anyway; see the note in `move_processes`). """

    def __init__(self, metacluster=None):
        
        if metacluster is None:
            metacluster = Metacluster()
        assert isinstance(metacluster, Metacluster)
        assert not metacluster.closed

        self.metacluster = metacluster
        self.metacluster.clusters.add(self)
        self.processes = set()

    def check(self):
        """Throws an exception if any of the processes in the cluster has
        stopped or crashed. """
        for proc in self.processes:
            proc.check()

    def check_and_stop(self):
        """First checks that each process in the cluster is still running, then
        stops them by sending SIGINT. Throws an exception if any exit with a
        nonzero exit code. Also makes the cluster object invalid """
        try:
            while self.processes:
                iter(self.processes).next().check_and_stop()
        finally:
            assert self.metacluster is not None
            while self.processes:
                iter(self.processes).next().close()
            self.metacluster.clusters.remove(self)
            self.metacluster = None

    def _block_process(self, process):
        assert process not in self.processes
        for other_process in self.processes:
            block_path(process.cluster_port, other_process.outgoing_cluster_port)
            block_path(other_process.outgoing_cluster_port, process.cluster_port)
            block_path(process.outgoing_cluster_port, other_process.cluster_port)
            block_path(other_process.cluster_port, process.outgoing_cluster_port)

    def _unblock_process(self, process):
        assert process not in self.processes
        for other_process in self.processes:
            unblock_path(process.cluster_port, other_process.outgoing_cluster_port)
            unblock_path(other_process.outgoing_cluster_port, process.cluster_port)
            unblock_path(process.outgoing_cluster_port, other_process.cluster_port)
            unblock_path(other_process.cluster_port, process.outgoing_cluster_port)

class Files(object):
    """A `Files` object is a RethinkDB data directory. Each `Process` needs a
    `Files`. To "restart" a server, create a `Files`, create a `Process`, stop
    the process, and then start a new `Process` on the same `Files`. """
    
    id_number = None
    db_path = None
    machine_name = None
    
    def __init__(self, metacluster, machine_name=None, db_path=None, log_path=None, executable_path=None, command_prefix=None):
        assert isinstance(metacluster, Metacluster)
        assert not metacluster.closed
        assert machine_name is None or isinstance(machine_name, str)
        assert db_path is None or isinstance(db_path, str)

        if command_prefix is None:
            command_prefix = []
        
        if executable_path is None:
            executable_path = find_rethinkdb_executable()
        assert os.access(executable_path, os.X_OK), "no such executable: %r" % executable_path
        
        self.id_number = metacluster.get_new_unique_id()
        
        if db_path is None:
            self.db_path = os.path.join(metacluster.dbs_path, str(self.id_number))
        elif not os.path.exists(db_path):
            self.db_path = db_path
        else:
            # pre-existing folder, do not create files
            self.db_path = db_path
            return
        
        # -- create files
        
        if machine_name is None:
            self.machine_name = "node_%d" % self.id_number
        else:
            self.machine_name = machine_name

        create_args = command_prefix + [
            executable_path, "create",
            "--directory", self.db_path,
            "--machine-name", self.machine_name]

        if log_path is None:
            print("setting log_path to /dev/null.")
            log_path = "/dev/null"
        with open(log_path, "a") as log_file:
            subprocess.check_call(create_args, stdout=log_file, stderr=log_file)

class _Process(object):
    '''Base class for Process & ProxyProcess. Do not instantiate directly.'''
    
    # == instance variables
    
    cluster = None
    files = None
    log_path = None
    log_file = None # console output (stderr/stdout)
    logfile_path = None # server log file
    
    command_prefix = None
    executable_path = None
    command_line_options = None
    command = None # command_prefix + executable_path + command_line_options + default options
    
    running = False
    process = None
    process_group_id = None
    
    host = 'localhost'
    cluster_port = None
    driver_port = None
    http_port = None
    outgoing_cluster_port = None # used by resunder to block outgoing cluster communication
    
    # ==
    
    def __init__(self, cluster=None, files=None, logfile_path=None, log_path=None, executable_path=None, command_prefix=None):
        
        self.cluster = cluster or Cluster()
        assert isinstance(self.cluster, Cluster)
        assert self.cluster.metacluster is not None
        
        self.executable_path = executable_path or find_rethinkdb_executable()
        assert os.access(self.executable_path, os.X_OK), "no such executable: %r" % executable_path
        
        self.command_prefix = command_prefix or []
        
        self.files = files or Files(metacluster=self.cluster.metacluster, log_path=log_path, executable_path=self.executable_path, command_prefix=self.command_prefix)
        # ToDo: unify the log_path behavior here with what we do for the rest of the logs
        assert isinstance(self.files, Files)
        
        if log_path is not None:
            self.log_path = log_path
            self.log_file = open(log_path, "a")
        else:
            self.log_file = sys.stdout
        
        self.logfile_path = logfile_path or os.path.join(self.files.db_path, "log_file")
    
    def _start(self):
        global runningServers
        
        # -- setup default args
        
        args = self.command_line_options or []
        
        if not '--bind' in args:
            args += ['--bind', 'all']
        
        if not '--client-port' in args: # used by resunder to block outgoing cluster connections
            if self.outgoing_cluster_port is None:
                self.outgoing_cluster_port = utils.findOpenPort()
            args += ['--client-port', str(self.outgoing_cluster_port)]
        
        if not '--cluster-port' in args:
            if self.cluster_port is None:
                args += ['--cluster-port', '0']
            else:
                args += ['--cluster-port', str(self.cluster_port)]
        
        if not '--driver-port' in args:
            if self.driver_port is None:
                args += ['--driver-port', '0']
            else:
                args += ['--driver-port', str(self.driver_port)]
        
        if not '--http-port' in args:
            if self.http_port is None:
                args += ['--http-port', '0']
            else:
                args += ['--http-port', str(self.http_port)]
        
        if self.logfile_path is not None and '--log-file' not in args:
             args += ['--log-file', self.logfile_path]
        
        # - join all other machines in cluster (overkill)
        
        for peer in self.cluster.processes:
            if peer is not self:
                args += ["--join", peer.host + ":" + str(peer.cluster_port)]
        
        # - save command
        
        self.command = self.command_prefix + [self.executable_path] + args
        
        # -- start process
        
        try:
            for other_cluster in self.cluster.metacluster.clusters:
                if other_cluster is not self.cluster:
                    other_cluster._block_process(self)
            
            if os.path.exists(self.logfile_path): # read to get port info, so has to be fresh
                os.unlink(self.logfile_path)
            
            self.log_file.write("Launching:\n%s\n" % str(self.command))
            
            self.process = subprocess.Popen(self.command, stdout=self.log_file, stderr=self.log_file, preexec_fn=os.setpgrp)
            
            runningServers.append(self)
            self.process_group_id = self.process.pid
            self.running = True
            
            self._read_ports_from_log()

        except Exception:
            # `close()` won't be called because we haven't put ourself into
            #  `cluster.processes` yet, so we have to clean up manually
            for other_cluster in self.cluster.metacluster.clusters:
                if other_cluster is not self.cluster:
                    other_cluster._unblock_process(self)
            raise

        else:
            self.cluster.processes.add(self)

    def wait_until_started_up(self, timeout=30):
        deadline = time.time() + timeout
        while time.time() < deadline:
            self.check()
            s = socket.socket()
            try:
                s.connect(("localhost", self.http_port))
            except socket.error:
                time.sleep(1)
            else:
                break
            finally:
                s.close()
        else:
            raise RuntimeError("Process was not responding to HTTP traffic within %d seconds." % timeout)

    def _read_ports_from_log(self, timeout=30):
        deadline = time.time() + timeout
        while time.time() < deadline:
            self.check()
            try:
                log = open(self.logfile_path, 'r').read()
                cluster_ports = re.findall("(?<=Listening for intracluster connections on port )([0-9]+)", log)
                http_ports = re.findall("(?<=Listening for administrative HTTP connections on port )([0-9]+)", log)
                driver_ports = re.findall("(?<=Listening for client driver connections on port )([0-9]+)", log)
                if cluster_ports == [] or http_ports == []:
                    time.sleep(1)
                else:
                    self.cluster_port = int(cluster_ports[-1])
                    self.http_port = int(http_ports[-1])
                    self.driver_port = int(driver_ports[-1])
                    break
            except IOError:
                time.sleep(1)

        else:
            raise RuntimeError("Timeout while trying to read cluster port from log file")

    def check(self):
        """Throws an exception if the process has crashed or stopped. """
        assert self.process is not None
        if self.process.poll() is not None:
            raise RuntimeError("Process stopped unexpectedly with return code %d" % self.process.poll())

    def check_and_stop(self):
        """Asserts that the process is still running, and then shuts it down by
        sending `SIGINT`. Throws an exception if the exit code is nonzero. Also
        invalidates the `Process` object like `close()`. """
        
        global runningServers
        
        if self.running is False:
            return
        
        assert self.process is not None
        try:
            self.check()
            self.process.send_signal(signal.SIGINT)
            start_time = time.time()
            grace_period = 300
            while time.time() < start_time + grace_period:
                if self.process.poll() is not None:
                    break
                time.sleep(1)
            else:
                raise RuntimeError("Process failed to stop within %d seconds after SIGINT" % grace_period)
            if self.process.poll() != 0:
                raise RuntimeError("Process stopped unexpectedly with return code %d after SIGINT" % self.process.poll())
            
            if self in runningServers:
                runningServers.remove(self)
        finally:
            self.close()
    
    def kill(self):
        '''Suddenly terminate the process ungracefully'''
        
        global runningServers
        
        assert self.process is not None
        assert self.check() is None, 'When asked to kill a process it was already stopped!'
        
        try:
            os.killpg(self.process_group_id, signal.SIGKILL)
        except OSError:
            pass
        deadline = time.time() + 5
        while time.time() < deadline and self.process.poll() is None:
            time.sleep(.1)
        else:
            raise Exception('timed out waiting for server to be killed')
        
        self.running = False
        self.process = None
        
        if self in runningServers:
            runningServers.remove(self)
        
        if self.log_path is not None:
            self.log_file.close()
    
    def close(self):
        """Kills the process, removes it from the cluster, and invalidates the `Process` object. """
        
        global runningServers
        
        if self.process.poll() is None:
            self.kill()
        
        # `self.cluster` might be `None` if we crash in the middle of `move_processes()`.
        if self.cluster is not None and self.cluster.metacluster is not None:
            for other_cluster in self.cluster.metacluster.clusters:
                if other_cluster is not self.cluster:
                    other_cluster._unblock_process(self)

            self.cluster.processes.remove(self)
            self.cluster = None

class Process(_Process):
    """New instance of RethinkDB server. It cannot be restarted; stop it and then create a new one instead."""

    def __init__(self, cluster=None, files=None, logfile_path=None, log_path=None, executable_path=None, command_prefix=None, extra_options=None):
        super(Process, self).__init__(cluster=cluster, files=files, log_path=log_path, logfile_path=logfile_path, executable_path=executable_path, command_prefix=command_prefix)
        
        if extra_options is None:
            extra_options = []
        
        if not '--cache-size' in extra_options:
            extra_options += ['--cache-size', '512']
        
        self.command_line_options = ["serve", "--directory", self.files.db_path] + extra_options
        
        self._start()

class ExistingProcess(_Process):
    """An already running instance of RethinkDB"""
    
    def __init__(self, cluster_port, driver_port, http_port, outgoing_cluster_port=None, logfile_path=None):
        
        # -- input validation
        
        if not isinstance(cluster_port, int):
            raise ValueError('ExistingProcess given non-integer value for cluster_port: %s' % str(cluster_port))
        
        if not isinstance(driver_port, int):
            raise ValueError('ExistingProcess given non-integer value for driver_port: %s' % str(driver_port))
        
        if not isinstance(http_port, int):
            raise ValueError('ExistingProcess given non-integer value for http_port: %s' % str(http_port))
        
        if outgoing_cluster_port is not None and not isinstance(outgoing_cluster_port, int):
            raise ValueError('ExistingProcess given non-integer value for outgoing_cluster_port: %s' % str(outgoing_cluster_port))
        
        # --
        
        self.cluster_port = cluster_port
        self.driver_port = driver_port
        self.http_port = http_port
        self.outgoing_cluster_port = outgoing_cluster_port
        
        self.logfile_path = logfile_path        

class ProxyProcess(_Process):
    """New instance of a RethinkDB proxy. It cannot be restarted; stop it and then create a new one instead."""

    def __init__(self, cluster, files=None, logfile_path=None, log_path=None, executable_path=None, command_prefix=None, extra_options=None):
        
        assert isinstance(cluster, Cluster), 'ProxyProcess requires an already-existing cluster to join to'
        
        # create an empty folder files for the log file (if needed)
        if files is None:
            emptyFolder = tempfile.mkdtemp(prefix='proxy-files-', dir=cluster.metacluster.dbs_path)
            files = Files(metacluster=cluster.metacluster, db_path=emptyFolder)
        
        super(ProxyProcess, self).__init__(cluster=cluster, files=files, logfile_path=logfile_path, log_path=log_path, executable_path=executable_path, command_prefix=command_prefix)
        
        if extra_options is None:
            extra_options = []
        
        self.command_line_options = ["proxy"] + extra_options
        
        self._start()
