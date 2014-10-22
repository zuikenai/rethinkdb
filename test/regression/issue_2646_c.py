#!/usr/bin/env python
# Copyright 2010-2014 RethinkDB, all rights reserved.
import sys, os, time, threading, traceback, random
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), os.path.pardir, 'common')))
import http_admin, driver, scenario_common, utils
from vcoptparse import *
# r = utils.import_python_driver()
import rethinkdb as r

op = OptParser()
scenario_common.prepare_option_parser_mode_flags(op)
opts = op.parse(sys.argv)

class ConcurrentWriter(object):
    def __init__(self, proc, max_id, batch):
        self.proc = proc
        self.max_id = max_id
        self.batch = batch
    def __enter__(self):
        self.counter = 0
        self.stopping = False
        self.thread = threading.Thread(target = self.run)
        self.thread.start()
        time.sleep(1)
    def __exit__(self, a, b, c):
        self.stopping = True
        self.thread.join()
        print "Did %d operations in side thread." % self.counter
    def run(self):
        conn2 = r.connect("localhost", self.proc.driver_port)
        try:
            while not self.stopping:
                start_id = random.randint(0, self.max_id - self.batch)
                res = r.table("test") \
                       .between(start_id, start_id + self.batch) \
                       .update({"votes": r.row["votes"] + 1}) \
                       .run(conn2, durability="soft")
                assert res["replaced"] == self.batch and res["errors"] == 0
                self.counter += 1
                time.sleep(0.03)
        except Exception, e:
            traceback.print_exc(e)
            print "Aborting because of error in side thread"
            sys.exit(1)

with driver.Metacluster() as metacluster:
    print "Starting cluster..."
    cluster = driver.Cluster(metacluster)
    executable_path, command_prefix, serve_options = scenario_common.parse_mode_flags(opts)
    files = driver.Files(metacluster, db_path = "db", log_path = "create-output",
        executable_path = executable_path, command_prefix = command_prefix)
    process = driver.Process(cluster, files, log_path = "serve-output",
        executable_path = executable_path, command_prefix = command_prefix,
        extra_options = serve_options + ["--cache-size", "10"])
    process.wait_until_started_up()

    print "Creating table..."
    conn = r.connect("localhost", process.driver_port);
    r.db_create("test").run(conn)
    r.table_create("test").run(conn)

    print "Inserting data..."
    start = time.time()
    num_rows = 1000000
    batch_size = 1000
    for i in xrange(0, num_rows, batch_size):
        r.table("test") \
         .insert([{"id": j, "bytes": "x"*100, "votes": 0}
                  for j in xrange(i, i+batch_size)]) \
         .run(conn, durability = "soft", noreply = True)
        # assert res["inserted"] == batch_size
        # assert res["errors"] == 0
        if (i + batch_size) % 10000 == 0:
            print "%d / %d" % (i + batch_size, num_rows)
    r.table("test").sync().run(conn)
    print "Done after %.2f seconds." % (time.time() - start)

    for i in xrange(3):
        print "Count without concurrent writes..."
        start = time.time()
        res = r.table("test").map(r.row).count().run(conn)
        assert res == num_rows
        print "Done after %.2f seconds." % (time.time() - start)

        with ConcurrentWriter(process, num_rows, 10000):
            print "Count with concurrent writes..."
            start = time.time()
            res = r.table("test").map(r.row).count().run(conn)
            assert res == num_rows
            print "Done after %.2f seconds." % (time.time() - start)

