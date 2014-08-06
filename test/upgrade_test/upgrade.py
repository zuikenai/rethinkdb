#!/usr/bin/env python

# test-issue-url: https://github.com/rethinkdb/rethinkdb/issues/2821
# test-description: In-place upgrade works.

import os, subprocess, sys, tempfile, time

thisDir = os.path.abspath(os.path.dirname(__file__))
sys.path.append(os.path.join(thisDir, os.path.pardir, 'common'))
import driver, utils

if len(sys.argv) != 3:
    raise Exception("Expected two arguments, a path to an old version of the " +
                    "rethinkdb repository and a path to a new version of rethinkdb " +
                    "repository")

old_repository = sys.argv[1]
new_repository = sys.argv[2]

print "old_repository: ", old_repository
print "new_repository: ", new_repository

old_executable_path = os.path.join(old_repository, "build/debug/rethinkdb")
new_executable_path = os.path.join(new_repository, "build/debug/rethinkdb")

# RSI: Assert somehow that the CPU sharding factor of the executables
# is 1.  Or make this be a run-time option.

r = utils.import_python_driver(new_repository)

# Issue 2789 was that secondary indexes had bad key ordering.  We want
# to make sure they still work.
def old_2789(conn):
    print "old_2789"

    res = r.table_create('2789').run(conn)
    assert res['created'] == 1, res
    table = r.table('2789')
    res = table.insert([{'id': 1, 'idx': ''}, {'id': 2, 'idx': ' '}]).run(conn)
    assert res['inserted'] == 2, res

    res = table.index_create('idx').run(conn)
    assert res['created'] == 1, res

    res = table.index_wait('idx').run(conn)
    assert len(res) == 1 and res[0]['ready'], res

    res = table.order_by(index = 'idx').map(r.row['id']).coerce_to('array').run(conn)
    assert res == [2,1], res

def new_2789(conn):
    print "new_2789"

    table = r.table('2789')
    # Create a new index, which should obey new-style ordering.
    res = table.index_create('idx2', lambda x: x['idx']).run(conn)
    assert res['created'] == 1, res

    def check_order(idx_res, idx2_res):
        # See the wrong order with the old index.
        res = table.order_by(index = 'idx').map(r.row['id']).coerce_to('array').run(conn)
        assert res == idx_res, res

        # See the right order with the new index.
        res = table.order_by(index = 'idx2').map(r.row['id']).coerce_to('array').run(conn)
        assert res == idx2_res, res

    check_order([2, 1], [1, 2])

    # Do a modification that doesn't affect secondary index ordering.
    res = table.get(1).update({'a': 3}).run(conn)
    assert res['replaced'] == 1, res

    check_order([2, 1], [1, 2])

    # Do another modification that doesn't affect secondary index ordering.
    res = table.get(2).update({'a': -1}).run(conn)
    assert res['replaced'] == 1, res

    check_order([2, 1], [1, 2])

    # Do another modification, that should affect ordering (both get it right).
    res = table.get(1).update({'idx': '!'}).run(conn)
    assert res['replaced'] == 1, res

    check_order([2, 1], [2, 1])

    # Add a new value, that should have incorrect ordering in 'idx'.
    res = table.insert({'id': 3, 'idx': ''}).run(conn)
    assert res['inserted'] == 1, res

    check_order([2, 1, 3], [3, 2, 1])

    # Dropping indexes works, I hope.
    res = table.index_drop('idx').run(conn)
    assert res['dropped'] == 1, res

    res = r.table_drop('2789').run(conn)
    assert res['dropped'] == 1, res

def create_2697_index(conn, index_name):
    table = r.table('2697')
    array_ten = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    array_99998 = r.expr(array_ten).do(lambda ten: ten.concat_map(lambda x: ten).do(lambda hundred: ten.concat_map(lambda x: hundred).concat_map(lambda x: hundred))).delete_at(0, 2)

    res = table.index_create(index_name, lambda x: array_99998.splice_at(0, x['a']).count()).run(conn)
    assert res['created'] == 1, res

    res = table.index_wait(index_name).run(conn)
    assert len(res) == 1 and res[0]['ready'], res

def values_for_2697(begin, end):
    return [{'id': i, 'a': range(0, i)} for i in range(begin, end)]

# Issue 2697 is that insert_at and splice_at didn't obey the array size limit.
def old_2697(conn):
    print "old_2697"

    res = r.table_create('2697').run(conn)
    assert res['created'] == 1, res
    table = r.table('2697')
    create_2697_index(conn, 'a_len')

    values = values_for_2697(0, 5)
    res = table.insert(values).run(conn)
    assert res['inserted'] == 5, res

    print "old_2697 inserted values"

    res = table.between(99995, 100010, index='a_len').coerce_to('array').run(conn)
    assert res == values, res

    print "old_2697 between query worked as expected"


def new_2697(conn):
    print "new_2697"

    table = r.table('2697')

    res = table.between(99995, 100010, index='a_len').coerce_to('array').run(conn)
    assert res == values_for_2697(0, 5), res

    print "new_2697 between query with old index worked"

    create_2697_index(conn, 'a_len_2')

    print "new_2697 created new index"

    res = table.between(99995, 100010, index='a_len_2').coerce_to('array').run(conn)
    # Only 3 of the values wouldn't overflow the 100k array size
    # limit, which is now in effect.
    assert res == values_for_2697(0, 3)

    print "new_2697 between query with new index worked"

    res = table.insert(values_for_2697(5, 6)).run(conn)
    assert res['inserted'] == 1

    # The old index still doesn't error with the old value.
    res = table.between(99995, 100010, index='a_len').coerce_to('array').run(conn)
    assert res == values_for_2697(0, 6), res

    # The new index does error with the new value.
    res = table.between(99995, 100010, index='a_len_2').coerce_to('array').run(conn)
    assert res == values_for_2697(0, 3), res

    print "new_2697 between query after insertion worked"

    res = r.table_drop('2697').run(conn)
    assert res['dropped'] == 1, res

with driver.Metacluster() as metacluster:
    cluster = driver.Cluster(metacluster)
    files = driver.Files(metacluster,
                         db_path = "data",
                         log_path = "old_create_log",
                         executable_path = old_executable_path,
                         )
    process = driver.Process(cluster,
                             files,
                             log_path = "old_process_log",
                             executable_path = old_executable_path)
    try:
        process.wait_until_started_up()

        with r.connect('localhost', process.driver_port) as conn:
            res = r.db_create('test').run(conn)
            assert res['created'] == 1, res

            old_2789(conn)
            old_2697(conn)

    finally:
        process.check_and_stop()

    process = driver.Process(cluster,
                             files,
                             log_path = "new_process_log",
                             executable_path = new_executable_path)

    try:
        process.wait_until_started_up()

        with r.connect('localhost', process.driver_port) as conn:
            new_2789(conn)
            new_2697(conn)

    finally:
        process.check_and_stop()
