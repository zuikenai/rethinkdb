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

# TODO(2014-08): Assert somehow that the CPU sharding factor of the executables
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

def create_2697_indexes(conn, splice_name, insert_name):
    table = r.table('2697')
    array_ten = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    array_99998 = r.expr(array_ten).do(lambda ten: ten.concat_map(lambda x: ten).do(lambda hundred: ten.concat_map(lambda x: hundred).concat_map(lambda x: hundred))).delete_at(0, 2)

    res = table.index_create(splice_name, lambda x: array_99998.splice_at(0, x['a']).count()).run(conn)
    assert res['created'] == 1, res

    res = table.index_create(insert_name, lambda x: array_99998.splice_at(0, x['a']).insert_at(0, -1).count()).run(conn)
    assert res['created'] == 1, res

    res = table.index_wait(splice_name).run(conn)
    assert len(res) == 1 and res[0]['ready'], res

    res = table.index_wait(insert_name).run(conn)
    assert len(res) == 1 and res[0]['ready'], res

def array_values(begin, end):
    return [{'id': i, 'a': range(0, i)} for i in range(begin, end)]

def values_for_2697(begin, end):
    return array_values(begin, end)

# Issue 2697 is that insert_at and splice_at didn't obey the array size limit.
def old_2697(conn):
    print "old_2697"

    res = r.table_create('2697').run(conn)
    assert res['created'] == 1, res
    table = r.table('2697')
    create_2697_indexes(conn, 'a_splice', 'a_insert')

    values = values_for_2697(0, 5)
    res = table.insert(values).run(conn)
    assert res['inserted'] == 5, res

    print "old_2697 inserted values"

    res = table.between(99995, 100010, index='a_splice').coerce_to('array').run(conn)
    assert res == values, res

    # We expect only 0, 1, and 2-length arrays to survive the a_insert
    # index, because the datum_ptr_t in insert_at_term_t (in v1.13)
    # checks the array size limit.  This means its count must be <=
    # 100000 before the insertion, and <= 100001 after the insertion.
    res = table.between(99995, 100010, index='a_insert').coerce_to('array').run(conn)
    assert res == values_for_2697(0, 3), res

    print "old_2697 between queries worked as expected"


def new_2697(conn):
    print "new_2697"

    table = r.table('2697')

    res = table.between(99995, 100010, index='a_splice').coerce_to('array').run(conn)
    assert res == values_for_2697(0, 5), res

    res = table.between(99995, 100010, index='a_insert').coerce_to('array').run(conn)
    assert res == values_for_2697(0, 3), res

    print "new_2697 between queries with old indexes worked"

    create_2697_indexes(conn, 'a_splice_2', 'a_insert_2')

    print "new_2697 created new indexes"

    res = table.between(99995, 100010, index='a_splice_2').coerce_to('array').run(conn)
    # Only 3 of the values wouldn't overflow the 100k array size
    # limit, which is now in effect.
    assert res == values_for_2697(0, 3)

    res = table.between(99995, 100010, index='a_insert_2').coerce_to('array').run(conn)
    # Only 2 of the values wouldn't overflow the 100k array size
    # limit, which is now in effect.
    assert res == values_for_2697(0, 2)

    print "new_2697 between queries with new index worked"

    res = table.insert(values_for_2697(5, 6)).run(conn)
    assert res['inserted'] == 1

    # The old indexes still don't error with the old value.
    res = table.between(99995, 100010, index='a_splice').coerce_to('array').run(conn)
    assert res == values_for_2697(0, 6), res

    res = table.between(99995, 100010, index='a_insert').coerce_to('array').run(conn)
    assert res == values_for_2697(0, 3), res

    # The new indexes do error with the new value.
    res = table.between(99995, 100010, index='a_splice_2').coerce_to('array').run(conn)
    assert res == values_for_2697(0, 3), res

    res = table.between(99995, 100010, index='a_insert_2').coerce_to('array').run(conn)
    assert res == values_for_2697(0, 2), res

    print "new_2697 between queries after insertion worked"

    res = r.table_drop('2697').run(conn)
    assert res['dropped'] == 1, res

def insert_2774(conn):
    res = r.table('2774').insert([{'id': 1, 'a': 'hello', 'b': r.now()},
                                  {'id': 2, 'a': r.now(), 'b': 'hello'}]).run(conn)
    assert res['inserted'] == 2, res

def old_2774(conn):
    print "old_2774"

    res = r.table_create('2774').run(conn)
    assert res['created'] == 1, res
    table = r.table('2774')
    res = table.index_create('idx', lambda x: x['a'] < x['b']).run(conn)
    assert res['created'] == 1, res
    res = table.index_wait('idx').run(conn)
    assert len(res) == 1 and res[0]['ready'], res

    insert_2774(conn)

    res = table.get_all(True, index = 'idx').map(r.row['id']).coerce_to('array').run(conn)
    assert res == [1], res

    res = table.get_all(False, index = 'idx').map(r.row['id']).coerce_to('array').run(conn)
    assert res == [2], res


def new_2774(conn):
    print "new_2774"

    table = r.table('2774')
    res = table.index_create('idx2', lambda x: x['a'] < x['b']).run(conn)
    assert res['created'] == 1, res
    res = table.index_wait('idx2').run(conn)
    assert len(res) == 1 and res[0]['ready'], res

    def check_results():
        # Expect the ordering to still be bad with the old index.
        res = table.get_all(True, index = 'idx').map(r.row['id']).coerce_to('array').run(conn)
        assert res == [1], res

        res = table.get_all(False, index = 'idx').map(r.row['id']).coerce_to('array').run(conn)
        assert res == [2], res

        # Expect the ordering to still be good with the new index.
        res = table.get_all(True, index = 'idx2').map(r.row['id']).coerce_to('array').run(conn)
        assert res == [2], res

        res = table.get_all(False, index = 'idx2').map(r.row['id']).coerce_to('array').run(conn)
        assert res == [1], res

    check_results()

    # Delete everything from the table... and reinsert!
    res = table.delete().run(conn)
    assert res['deleted'] == 2, res
    insert_2774(conn)

    # And check again.
    print "new_2774 reinserted, checking again"
    check_results()

    res = r.table_drop('2774').run(conn)
    assert res['dropped'] == 1, res

def insert_2696(conn):
    res = r.table('2696').insert(array_values(0, 5)).run(conn)
    assert res['inserted'] == 5, res

def old_2696(conn):
    print "old_2696"

    res = r.table_create('2696').run(conn)
    assert res['created'] == 1, res
    table = r.table('2696')

    res = table.index_create('idx', lambda x: x['a'].delete_at(2, 2)).run(conn)
    assert res['created'] == 1, res

    res = table.index_wait('idx').run(conn)
    assert len(res) == 1 and res[0]['ready'], res

    insert_2696(conn)

    # The value whose array is of length 2 is excluded because of the
    # v1.13 delete_at bug.
    res = table.order_by(index='idx').coerce_to('array').run(conn)
    # We have the reverse order because of #2789?
    assert res == array_values(3, 5)[::-1], res


def new_2696(conn):
    print "new_2696"

    table = r.table('2696')

    res = table.index_create('idx2', lambda x: x['a'].delete_at(2, 2)).run(conn)
    assert res['created'] == 1, res

    res = table.index_wait('idx2').run(conn)
    assert len(res) == 1 and res[0]['ready'], res

    def check_ordering():
        res = table.order_by(index='idx').coerce_to('array').run(conn)
        # We're asserting buggy v1.13 (#2789?) behavior is maintained.
        assert res == array_values(3, 5)[::-1], res

        # Now the 2-element array's included, so we see the extra
        # value in the new index.
        res = table.order_by(index='idx2').coerce_to('array').run(conn)
        assert res == array_values(2, 5), res

    check_ordering()

    # Delete everything and insert it again.

    res = table.delete().run(conn)
    assert res['deleted'] == 5, res

    insert_2696(conn)

    # Check ordering a second time.
    check_ordering()

    res = r.table_drop('2696')
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
            old_2774(conn)
            old_2696(conn)

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
            new_2774(conn)
            new_2696(conn)

    finally:
        process.check_and_stop()
