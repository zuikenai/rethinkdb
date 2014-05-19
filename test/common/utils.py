#!/usr/bin/env python

import os, subprocess, sys, tempfile, time

import test_exceptions

# -- constants

driverPaths = {
    'javascript': { 'extension':'js', 'relDriverPath':'build/packages/js', 'relSourcePath':'drivers/javascript' },
    'python': { 'extension':'js', 'relDriverPath':'drivers/python/rethinkdb', 'relSourcePath':'drivers/python' },
    'ruby': { 'extension':'js', 'relDriverPath':'drivers/ruby/lib', 'relSourcePath':'drivers/ruby' }
}

# --

def module(module):
    __import__(module, level=0)
    return sys.modules[module]

# non-printable ascii characters and invalid utf8 bytes
non_text_bytes = \
  range(0x00, 0x09+1) + [0x0B, 0x0C] + range(0x0F, 0x1F+1) + \
  [0xC0, 0xC1] + range(0xF5, 0xFF+1)

def guess_is_text_file(name):
    with file(name, 'rb') as f:
        data = f.read(100)
    for byte in data:
        if ord(byte) in non_text_bytes:
            return False
    return True

def project_root_dir():
    '''Return the root directory for this project'''
    
    # warn: hard-coded both for location of this file and the name of the build dir
    masterBuildDir = os.path.join(os.path.dirname(os.path.realpath(__file__)), os.pardir, os.pardir)
    if not os.path.isdir(masterBuildDir):
        raise Exception('The project build directory does not exist where expected: %s' % str(masterBuildDir))
    
    return os.path.realpath(masterBuildDir)

def latest_build_dir(check_executable=True):
    '''Look for the most recently built version of this project'''
    
    masterBuildDir = os.path.join(project_root_dir(), 'build')
    
    if not os.path.isdir(masterBuildDir):
        raise test_exceptions.NotBuiltException(detail='no version of this project have yet been built')
    
    # -- find the build directory with the most recent mtime
    
    canidatePath    = None
    canidateMtime   = None
    for name in os.listdir(masterBuildDir):
        path = os.path.join(masterBuildDir, name)
        if os.path.isdir(path) and (name in ('release', 'debug') or name.startswith('debug_') or name.startswith('release_')):
            if check_executable == True:
                if not os.path.isfile(os.path.join(path, 'rethinkdb')):
                    continue
            
            mtime = os.path.getmtime(path)
            if canidateMtime is None or mtime > canidateMtime:
                canidateMtime = mtime
                canidatePath = path
    
    if canidatePath is None:
        raise test_exceptions.NotBuiltException(detail='no version of this project have yet been built')
    else:
        return canidatePath

def import_pyton_driver(importName='r', targetDir=None, buildDriver=True):
    '''import the latest built version of the python driver into the caller's namespace, ensuring that the drivers are built'''
    import inspect, importlib
    
    # TODO: modify this to allow for system-installled drivers
    
    callingModule = inspect.getmodule(inspect.currentframe().f_back.f_code)
    if callingModule is None:
        callingModule = sys.modules['__main__']
    
    # -- figure out what sort of path we got
    
    if targetDir is None:
        if 'PYTHON_DRIVER_DIR' in os.environ:
            targetDir = os.environ['PYTHON_DRIVER_DIR']
        elif 'PYTHON_DRIVER_SRC_DIR' in os.environ:
            targetDir = os.environ['PYTHON_DRIVER_SRC_DIR']
        else:
            targetDir = project_root_dir()
    
    driverDir = None
    srcDir = None
    
    if not os.path.isdir(targetDir):
        raise ValueError('import_pyton_driver got a non-directory path: %s' % str(targetDir))
    targetDir = os.path.realpath(targetDir)
    
    # - project directory
    if all(map(lambda x: os.path.isdir(os.path.join(targetDir, x)), ['src', 'drivers', 'admin'])):
        driverDir = os.path.join(targetDir, driverPaths['python']['relDriverPath'])
        srcDir = os.path.join(targetDir, driverPaths['python']['relSourcePath'])
    
    # - driver directory (direct)
    elif os.path.basename(targetDir) == 'rethinkdb' and all(map(lambda x: os.path.isfile(os.path.join(targetDir, x)), ['__init__.py', 'ast.py', 'docs.py'])):
        driverDir = targetDir
        srcDir = os.path.join(targetDir, os.path.relpath(driverPaths['python']['relSourcePath'], driverPaths['python']['relDriverPath']))
    
    # - driver directory (one up)
    elif os.path.exists(os.path.join(targetDir, 'rethinkdb')) and all(map(lambda x: os.path.isfile(os.path.join(targetDir, x)), ['__init__.py', 'ast.py', 'docs.py'])):
        driverDir = os.path.join(targetDir, os.path.relpath(driverPaths['python']['relDriverPath'], driverPaths['python']['relSourcePath']))
        srcDir = targetDir
    
    # - source directory - Note: at the moment this is the same as driver directory (one up)
    elif all(map(lambda x: os.path.exists(os.path.join(targetDir, x)), ['Makefile', 'MANIFEST.in', 'rethinkdb'])):
        driverDir = os.path.join(targetDir, os.path.relpath(driverPaths['python']['relDriverPath'], driverPaths['python']['relSourcePath']))
        srcDir = targetDir
    
    else:
        raise ValueError('import_pyton_driver was unable to determine the locations from: %s' % targetDir)
    
    # -- build if asked for
    
    if buildDriver == True:
        outputFile = tempfile.NamedTemporaryFile()
        notificationDeadline = time.time() + 2
        makeProcess = subprocess.Popen(['make', '-C', srcDir], stdout=outputFile, stderr=subprocess.STDOUT)
        while makeProcess.poll() is None and time.time() < notificationDeadline:
            time.sleep(.1)
        if time.time() > notificationDeadline:
            print('Building the python drivers. This make take a few moments.')
        if makeProcess.wait() != 0:
            sys.stderr.write('Error making python driver from <<%s>>. Make output follows:\n\n' % srcDir)
            outputFile.seek(0)
            print(outputFile.read())
            raise test_exceptions.NotBuiltException(detail='Failed making python driver from: %s' % srcDir)
    
    # --
    
    if not os.path.isdir(driverDir) or not os.path.basename(driverDir) == 'rethinkdb':
        raise ValueError('import_pyton_driver got an invalid driverDir: %s' % driverDir)
    
    # - inject this into the callers name space
    
    keptPaths = sys.path
    try:
        sys.path.insert(0, os.path.dirname(driverDir))
        driverModule = importlib.import_module('rethinkdb')
        assert(os.path.realpath(inspect.getfile(driverModule)).startswith(driverDir))
        callingModule.__dict__[importName] = driverModule
    finally:
        sys.path = keptPaths
