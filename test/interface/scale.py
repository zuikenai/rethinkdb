#!/usr/bin/env python
# Copyright 2010-2014 RethinkDB, all rights reserved.
import sys, os, time, traceback, socket, pprint
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), os.path.pardir, 'common')))
import driver, scenario_common, utils
from vcoptparse import *
r = utils.import_python_driver()

op = OptParser()
scenario_common.prepare_option_parser_mode_flags(op)
op["servers"] = IntFlag("--servers", 5)
op["shards"] = IntFlag("--shards", 5)
op["replicas"] = IntFlag("--replicas", 3)
op["dump"] = BoolFlag("--dump")
opts = op.parse(sys.argv)

with open(__file__) as this_script:
    datum = {
        "num_servers": opts["servers"],
        "num_shards": opts["shards"],
        "num_replicas": opts["replicas"],
        "host_name": socket.gethostname(),
        "time_stamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "script_hash": hash(this_script.read()),
        "observations": { }
        }
ob = datum["observations"]

with driver.Metacluster() as metacluster:
    cluster = driver.Cluster(metacluster)
    executable_path, command_prefix, serve_options = scenario_common.parse_mode_flags(opts)

    num_servers = opts["servers"]
    print "Spinning up %d processes..." % num_servers
    start = time.time()
    files = [driver.Files(metacluster,
                          log_path = "/dev/null",
                          machine_name = "s%d" % (i+1),
                          executable_path = executable_path,
                          command_prefix = command_prefix)
        for i in xrange(num_servers)]
    procs = [driver.Process(cluster,
                            files[i],
                            log_path = "serve-output-%d" % (i+1),
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

    print "Creating a table..."
    start = time.time()
    r.table_create("test").run(conns[0])
    ob["create_table"] = time.time() - start
    print "Done (%.2f seconds)" % ob["create_table"]

    pprint.pprint(r.table_config("test").run(conns[0])["shards"])
    primary = int(r.table_config("test").run(conns[0])["shards"][0]["director"][1:]) - 1

    print "Inserting 1000 documents..."
    start = time.time()
    r.table("test").insert([{"id": i} for i in xrange(1000)]).run(conns[primary])
    ob["insert_a"] = time.time() - start
    print "Done (%.2f seconds)" % ob["insert_a"]

    print "Reading all documents..."
    start = time.time()
    res = list(r.table("test").run(conns[primary]))
    assert len(res) == 1000
    ob["read_all_a"] = time.time() - start
    print "Done (%.2f seconds)" % ob["read_all_a"]

    print "Reading one document..."
    start = time.time()
    r.table("test").get(1).run(conns[primary])
    ob["read_one_a"] = time.time() - start
    print "Done (%.2f seconds)" % ob["read_one_a"]

    print "Reconfiguring table..."
    start = time.time()
    new = r.table("test").reconfigure(opts["shards"], opts["replicas"]).run(conns[0])
    ob["reconfigure_a"] = time.time() - start
    print "Done (%.2f seconds)" % ob["reconfigure_a"]
    pprint.pprint(new["shards"])

    print "Waiting for reconfigure to take effect..."
    start = time.time()
    while True:
        st = r.table_status("test").run(conns[0])
        keys = ["dt", "db", "dr", "rt", "rl", "rb", "rr", "nt", "no", "ne"]
        counts = dict((key, 0) for key in keys)
        for shard in st["shards"]:
            for row in shard:
                key = row["role"][0] + row["state"][0]
                counts[key] += 1
        print "%6.2fs" % (time.time() - start),
        for key in keys:
            print key, "%3d" % counts[key],
        print
        if st["ready_completely"]:
            break
        time.sleep(0.1)
    while True:
        try:
            st = r.table("test").run(conns[0])
        except r.RqlRuntimeError:
            pass
        else:
            break
        time.sleep(1)
    ob["reconfigure_b"] = time.time() - start
    print "Done (%.2f seconds)" % ob["reconfigure_b"]

    print "Inserting 1000 documents..."
    start = time.time()
    r.table("test").insert([{"id": i} for i in xrange(1000, 2000)]).run(conns[0])
    ob["insert_b"] = time.time() - start
    print "Done (%.2f seconds)" % ob["insert_b"]

    print "Reading all documents..."
    start = time.time()
    res = list(r.table("test").run(conns[0]))
    assert len(res) == 2000
    ob["read_all_b"] = time.time() - start
    print "Done (%.2f seconds)" % ob["read_all_b"]

    print "Reading one document..."
    start = time.time()
    r.table("test").get(1001).run(conns[0])
    ob["read_one_b"] = time.time() - start
    print "Done (%.2f seconds)" % ob["read_one_b"]

    print "Shutting down..."
    start = time.time()
    cluster.check_and_stop()
    ob["stop"] = time.time() - start
    print "Done (%.2f seconds)" % ob["stop"]

if opts["dump"]:
    with open("scale-" + datum["time_stamp"], "w") as f:
        f.write(repr(datum))


