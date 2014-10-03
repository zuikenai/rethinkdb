#!/usr/bin/env python
# Copyright 2010-2014 RethinkDB, all rights reserved.
import sys, os, time, traceback, socket, pprint, tempfile, subprocess
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), os.path.pardir, 'common')))
import driver, scenario_common, utils
from vcoptparse import *
r = utils.import_python_driver()

op = OptParser()
scenario_common.prepare_option_parser_mode_flags(op)
op["servers"] = IntFlag("--servers", 5)
op["tables"] = IntFlag("--tables", 1)
op["shards"] = IntFlag("--shards", 5)
op["replicas"] = IntFlag("--replicas", 3)
op["dump"] = BoolFlag("--dump")
op["start_prof"] = StringFlag("--start-prof", None)
op["stop_prof"] = StringFlag("--stop-prof", None)
op["directory"] = StringFlag("--directory", None)
opts = op.parse(sys.argv)

with open(__file__) as this_script:
    datum = {
        "num_servers": opts["servers"],
        "num_tables": opts["tables"],
        "num_shards": opts["shards"],
        "num_replicas": opts["replicas"],
        "host_name": socket.gethostname(),
        "time_stamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "script_hash": hash(this_script.read()),
        "observations": { }
        }
ob = datum["observations"]

if opts["directory"] is not None:
    assert os.path.exists(opts["directory"])
    directory = tempfile.mkdtemp(dir = opts["directory"])
else:
    directory = tempfile.mkdtemp(prefix = "scale_test_")
print "Using temporary directory %r" % directory

with driver.Metacluster() as metacluster:
    cluster = driver.Cluster(metacluster)
    executable_path, command_prefix, serve_options = scenario_common.parse_mode_flags(opts)

    num_servers = opts["servers"]
    print "Spinning up %d processes..." % num_servers
    start = time.time()
    files = [driver.Files(metacluster,
                          log_path = "/dev/null",
                          db_path = os.path.join(directory, "%d" % (i+1)),
                          machine_name = "s%d" % (i+1),
                          executable_path = executable_path,
                          command_prefix = command_prefix)
        for i in xrange(num_servers)]
    procs = [driver.Process(cluster,
                            files[i],
                            log_path = os.path.join(
                                directory, "serve-output-%d" % (i+1)),
                            executable_path = executable_path,
                            command_prefix = command_prefix,
                            extra_options = serve_options)
        for i in xrange(num_servers)]
    for p in procs:
        p.wait_until_started_up()
    cluster.check()
    ob["start"] = time.time() - start
    print "Done (%.2f seconds)" % ob["start"]

    conns = [r.connect("localhost", proc.driver_port) for proc in procs]
    print "Waiting for connectivity..."
    start = time.time()
    while True:
        for conn in conns:
            res = list(r.db("rethinkdb").table("server_status").run(conn))
            if len(res) != num_servers or any(r["status"] != "available" for r in res):
                break
        else:
            break
    ob["connect"] = time.time() - start
    print "Done (%.2f seconds)" % ob["connect"]

    datum["server_version"] = \
        r.db("rethinkdb").table("server_status").nth(0)["version"].run(conns[0])

    print "Creating a DB..."
    start = time.time()
    r.db_create("test").run(conns[0])
    ob["create_db"] = time.time() - start
    print "Done (%.2f seconds)" % ob["create_db"]

    for i in xrange(opts["tables"]):
        print "Creating a table (%d)..." % i
        start = time.time()
        r.table_create("test_%d" % i).run(conns[0])
        ob["create_table_%d" % i] = time.time() - start
        print "Done (%.2f seconds)" % ob["create_table_%d" % i]

        pprint.pprint(r.table_config("test_%d" % i).run(conns[0])["shards"])
        primary = int(r.table_config("test_%d" % i).run(conns[0])["shards"][0]["director"][1:]) - 1

        print "Inserting 1000 documents..."
        start = time.time()
        r.table("test_%d" % i).insert([{"id": j} for j in xrange(1000)]).run(conns[primary])
        ob["insert_a_%d" % i] = time.time() - start
        print "Done (%.2f seconds)" % ob["insert_a_%d" % i]

        print "Reading all documents..."
        start = time.time()
        res = list(r.table("test_%d" % i).run(conns[primary]))
        assert len(res) == 1000
        ob["read_all_a_%d" % i] = time.time() - start
        print "Done (%.2f seconds)" % ob["read_all_a_%d" % i]

        print "Reading one document..."
        start = time.time()
        r.table("test_%d" % i).get(1).run(conns[primary])
        ob["read_one_a_%d" % i] = time.time() - start
        print "Done (%.2f seconds)" % ob["read_one_a_%d" % i]

        if i == opts["tables"] - 1 and opts["start_prof"] is not None:
            print "Running %r..." % opts["start_prof"]
            subprocess.check_call(opts["start_prof"], shell=True)
            print "Done."

        print "Reconfiguring table..."
        start = time.time()
        new = r.table("test_%d" % i).reconfigure(opts["shards"], opts["replicas"]).run(conns[0])
        ob["reconfigure_a_%d" % i] = time.time() - start
        print "Done (%.2f seconds)" % ob["reconfigure_a_%d" % i]
        pprint.pprint(new["shards"])

        print "Waiting for reconfigure to take effect..."
        start = time.time()
        while True:
            st = r.table_status("test_%d" % i).run(conns[0])
            if st["ready_completely"]:
                break
            time.sleep(0.1)
        while True:
            try:
                st = r.table("test_%d" % i).run(conns[0])
            except r.RqlRuntimeError:
                pass
            else:
                break
            time.sleep(1)
        ob["reconfigure_b_%d" % i] = time.time() - start
        print "Done (%.2f seconds)" % ob["reconfigure_b_%d" % i]

        if i == opts["tables"] - 1 and opts["stop_prof"] is not None:
            print "Running %r..." % opts["stop_prof"]
            subprocess.check_call(opts["stop_prof"], shell=True)
            print "Done."

        print "Inserting 1000 documents..."
        start = time.time()
        r.table("test_%d" % i).insert([{"id": j} for j in xrange(1000, 2000)]).run(conns[0])
        ob["insert_b_%d" % i] = time.time() - start
        print "Done (%.2f seconds)" % ob["insert_b_%d" % i]

        print "Reading all documents..."
        start = time.time()
        res = list(r.table("test_%d" % i).run(conns[0]))
        assert len(res) == 2000
        ob["read_all_b_%d" % i] = time.time() - start
        print "Done (%.2f seconds)" % ob["read_all_b_%d" % i]

        print "Reading one document..."
        start = time.time()
        r.table("test_%d" % i).get(1001).run(conns[0])
        ob["read_one_b_%d" % i] = time.time() - start
        print "Done (%.2f seconds)" % ob["read_one_b_%d" % i]

    print "Shutting down..."
    start = time.time()
    cluster.check_and_stop()
    ob["stop"] = time.time() - start
    print "Done (%.2f seconds)" % ob["stop"]

if opts["dump"]:
    with open("scale-" + datum["time_stamp"], "w") as f:
        f.write(repr(datum))


