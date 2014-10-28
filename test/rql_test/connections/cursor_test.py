#!/usr/bin/env python

from __future__ import print_function

import os, random, subprocess, sys, tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), os.path.pardir, os.path.pardir, 'common')))
import driver, utils

r = utils.import_python_driver()

try:
    xrange
except NameError:
    xrange = range

executable_path = sys.argv[1] if len(sys.argv) > 1 else utils.find_rethinkdb_executable()
lang = sys.argv[2] if len(sys.argv) > 2 else None

res = 0

# -- make sure a server is avalible

server = None
serverHost = os.environ.get('RDB_SERVER_HOST')
serverPort = int(os.environ.get('RDB_DRIVER_PORT')) if 'RDB_DRIVER_PORT' in os.environ else None
serverOutput = None
if None in (serverHost, serverPort):
    serverOutput = tempfile.TemporaryFile(mode='w+')
    server = driver.Process(executable_path=executable_path, console_output=serverOutput)
    serverHost = server.host
    serverPort = server.driver_port

# -- setup the tables
    
c = r.connect(host=serverHost, port=serverPort)

if 'test' not in r.db_list().run(c):
    r.db_create('test').run(c)

# ensure a clean table
if 'test' in r.db('test').table_list().run(c):
    r.db('test').table_drop('test').run(c)
r.db('test').table_create('test').run(c)

tbl = r.table('test')

# -- generate the data

num_rows = random.randint(1111, 2222)

print("Inserting %d rows" % num_rows)
range500 = list(range(0, 500))
documents = [{'id':i, 'nums':range500} for i in xrange(0, num_rows)]
chunks = (documents[i : i + 100] for i in xrange(0, len(documents), 100))
for chunk in chunks:
    tbl.insert(chunk).run(c)
    print('.', end=' ')
    sys.stdout.flush()
print("Done\n")

# -- run the test(s)

basedir = os.path.dirname(__file__)

if not lang or lang == 'py':
    print("Running Python")
    res = res | subprocess.call([os.environ.get('INTERPRETER_PATH', 'python'), os.path.join(basedir, "cursor.py"), str(serverPort), str(num_rows)])
if not lang or lang == 'js':
    print("Running JS")
    res = res | subprocess.call(["node", os.path.join(basedir, "cursor.js"), str(serverPort), str(num_rows)])
if not lang or lang == 'js-promise':
    print("Running JS Promise")
    res = res | subprocess.call(["node", os.path.join(basedir, "promise.js"), str(serverPort), str(num_rows)])

print('')


if res is not 0:
    sys.exit(1)
