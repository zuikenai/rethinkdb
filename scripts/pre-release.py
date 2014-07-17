#!/usr/bin/env python

from __future__ import print_function, division, unicode_literals

from os import path
from re import search, findall, MULTILINE, DOTALL
from subprocess import check_output

root = path.normpath(path.join(path.dirname(__file__), path.pardir))

def report_all():
    previous_version = report_version()
    report_dirty()
    report_serializer_version(previous_version)
    report_cluster_version(previous_version)
    report_magic_number(previous_version)

def report_version():
    version = check_output([root + '/scripts/gen-version.sh']).rstrip('\n')
    print("Version:", version)
    previous_version = git("describe","--tags","--match","v[0-9]*","--abbrev=0","HEAD")
    if previous_version == 'v' + version:
        previous_version = git("describe","--tags","--match","v[0-9]*","--abbrev=0","HEAD^")
    print("Previous version:", previous_version)
    return previous_version

def report_dirty():
    git("update-index","-q","--refresh")
    dirty = "" != git("diff-index","--name-only","HEAD","--")
    print("Dirty:", dirty and "yes" or "no")

def git(cmd, *args, **kwargs):
    if not kwargs.get('shell'):
        return check_output(["git", "--git-dir=" + root + "/.git", cmd] + list(args)).rstrip('\n')
    else:
        assert args == []
        return check_output(["git --git-dir='" + root + "/.git' " + cmd], shell=True).rstrip('\n')

def git_show(path, ref="HEAD"):
    return git("show", ref + ":" + path)

def extract_version(path, type, version='HEAD'):
    args_hpp = git_show(path, ref=version)
    res = search('^#define %s_VERSION_STRING "(.*)"' % type.upper(), args_hpp, flags=MULTILINE)
    if not res:
        raise Exception("Missing %s version in %s:%s" % (path, ref, path))
    return res.groups()[0]

def print_compare(name, cur, prev, previous_version):
    if cur == prev:
        print(name + ":", cur, "(No change since " + previous_version + ")")
    else:
        print(name + ":", cur, "(Was " + prev + " in " + previous_version + ")")


def report_serializer_version(previous_version):
    path = "src/config/args.hpp"
    current_version = extract_version(path, 'serializer')
    prev_version = extract_version(path, 'serializer', previous_version)
    print_compare("Serializer version", current_version, prev_version, previous_version)

def report_cluster_version(previous_version):
    path = "src/rpc/connectivity/cluster.cc"
    current_version = extract_version(path, 'cluster')
    prev_version = extract_version(path, 'cluster', previous_version)
    print_compare("Cluster version", current_version, prev_version, previous_version)

def report_magic_number(previous_version):
    def magic_numbers(version='HEAD'):
        path = 'src/rdb_protocol/ql2.proto'
        ql2_proto = git_show(path, ref=version)
        res = search('enum Version {(.*?)}', ql2_proto, flags=DOTALL)
        if not res:
            raise Exception("Missing enum Version in %s:%s" % (version, path))
        numbers = findall("(V.*?) += (.*?);", res.groups()[0])
        return numbers[-1][0]
    cur_magic = magic_numbers()
    prev_magic = magic_numbers(previous_version)
    print_compare("Driver magic number", cur_magic, prev_magic, previous_version)

if __name__ == '__main__':
    report_all()
