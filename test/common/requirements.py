import os
import subprocess
import sys
from test_framework import requirement

def SRC_ROOT(conf):
    return os.path.abspath(os.path.join(os.path.dirname(__file__), os.path.pardir, os.path.pardir))

def BUILD_DIR(conf):
    build_dir = conf.arg('build_dir')
    src_root = conf.require(SRC_ROOT)
    if not build_dir:
        build_dir = find_latest_build_dir(src_root)
    if build_dir:
        if os.path.basename(build_dir).startswith('release'):
            print("Warning: testing release mode RethinkDB")
        return build_dir
    conf.require(MAKE('DEBUG=1'))
    build_dir = find_latest_build_dir(src_root)
    if not build_dir:
        raise Exception('Building RethinkDB did not produce a build directory')
    return build_dir

@requirement
def BUILD_FILE(conf, path):
    build_dir = conf.require(BUILD_DIR)
    res = os.path.join(build_dir, path)
    if os.path.exists(res):
        return res
    src_root = conf.require(SRC_ROOT)
    if build_dir.startswith(src_root + '/'):
        rel_path = build_dir[len(src_root) + 1:]
    else:
        raise Exception('Could not determine relative path to build directory')
    target = os.path.join(rel_path, path)
    conf.require(MAKE(target, 'DEBUG=1'))
    if os.path.exists(res):
        return res
    raise Exception('Unable to build %s', (target,))

@requirement
def MAKE(conf, *args):
    src_root = conf.require(SRC_ROOT)
    jobs = conf.arg('jobs')
    command_line = ["make", "-C", src_root, '-j', str(jobs)] + list(args)
    if 0 == subprocess.call(['bash', '-c', '"$@" > /dev/null 2>&1', '--'] + command_line + ['-q']):
        return
    if not conf.arg('make'):
        exit("Requirement missing. Call test/run with `--make` or run `%s`" % (' '.join(command_line),))
    print("Building requirement: make", ' '.join(command_line))
    try:
        subprocess.check_call(command_line)
    except subprocess.CalledProcessError:
        exit("`make %s` was required but failed" % (' '.join(args),))

def find_latest_build_dir(src_root):
    build_dir = None
    build_dir_mtime = 0
    build_root_dir = os.path.join(src_root, 'build')
    if not os.path.exists(build_root_dir):
        return None
    for subdir in os.listdir(build_root_dir):
        path = os.path.join(build_root_dir, subdir)
        if os.path.isdir(path) and (subdir.startswith("debug") or subdir.startswith("release")):
            mtime = os.path.getmtime(path)
            if mtime > build_dir_mtime:
                build_dir_mtime = mtime
                build_dir = path
    return build_dir
