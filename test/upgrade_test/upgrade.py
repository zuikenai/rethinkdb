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

print("old_repository: " + old_repository)
print("new_repository: " + new_repository)
