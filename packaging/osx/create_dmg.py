#!/usr/bin/env python
# -*- coding: utf-8 -*-

'''Create the dmg for MacOS deployment'''

import atexit, copy, os, re, shutil, subprocess, sys, tempfile

thisFolder = os.path.dirname(os.path.realpath(__file__))
sys.path.append(thisFolder)
import dmgbuild, markdown2

# == defaults

scratchFolder = tempfile.mkdtemp()

packagePosition = (470, 170)

defaultOptions = {
	'format': 'UDBZ',
	'badge_icon': os.path.join(thisFolder, 'Thinker.icns'),
	'files': [
		os.path.join(thisFolder, os.path.pardir, os.path.pardir, 'COPYRIGHT')
	],
	'icon_size': 64,
	'text_size': 14,
	'icon_locations': {
		'Uninstall RethinkDB.app': (630, 170),
		'Release Notes.html': (470, 303),
		'COPYRIGHT': (630, 303)
	},
	'background': os.path.join(thisFolder, 'dmg_background.png'),
	'window_rect': ((200, 200), (739, 435)),
	'default_view': 'icon-view',
	'show_icon_preview': True
}

# ==

def removeAtExit(removePath):
	if os.path.exists(removePath):
		try:
			if os.path.isfile(removePath):
				os.unlink(removePath)
			elif os.path.isdir(removePath):
				shutil.rmtree(removePath, ignore_errors=True)
		except Exception as e:
			sys.stderr.write('Unable to delete item: %s -- %s\n' % (removePath, str(e)))
atexit.register(removeAtExit, scratchFolder)

def compileUninstallApp():
	outputPath = os.path.join(scratchFolder, 'Uninstall RethinkDB.app')
	logFile = open(os.path.join(scratchFolder, 'uninstall-compile.log'), 'w+')
	try:
		subprocess.check_call(['/usr/bin/osacompile', '-o', outputPath, os.path.join(thisFolder, 'uninstall.scpt')], stdout=logFile, stderr=logFile)
	except Exception as e:
		logFile.seek(0)
		sys.stderr.write('Failed while compiling %s: %s\n%s' % (os.path.join(thisFolder, 'uninstall.scpt'), str(e), logFile.read()))
		raise
	return outputPath

def convertReleaseNotes():
	notesPath = os.path.join(scratchFolder, 'Release Notes.html')
	with open(os.path.join(thisFolder, os.path.pardir, os.path.pardir, 'NOTES.md'), 'r') as sourceFile:
		releaseNotes = markdown2.markdown(sourceFile.read().encode('utf-8'))
	        
	        # note: percentages are escaped ('%%') for string interpolation
	        template = """
<!doctype html>
<html>
    <head>
        <style type="text/css">
            html, body {
                font-family: 'Helvetica Neue', 'Arial', sans-serif;
                font-size: 100%%;
                margin: 0;
                padding: 0;
                border: 0;
                color: #333;
            }

            div.container {
                position: relative;
                width: 960px;
                margin: 0 auto;
                padding: 0;
            }

            a { color: #4075ad;}

            p, li {
                line-height: 1.3em;
            }

            hr{
                border: 0;
                border-bottom: thin solid #dfdfdf;
                margin: 2em 0;
            }

            code {
                background-color: #f7f7f7;
                padding: 0.25em 0.4em;
                font-size: 0.8em;
                color: #c51244;
                font-family: 'Monaco', 'Courier', monospace;
            }
        </style>
    </head>
    <body>
        <div class="container">%s</div>
    </body>
</html>
"""
		# replace bug urls
		releaseNotes = re.sub(r'((?P<pre>[\s\(]+))#(?P<number>\d+)(?P<post>[, \)])', '\g<pre><a href="http://github.com/rethinkdb/rethinkdb/issues/\g<number>">#\g<number></a>\g<post>', releaseNotes)
		
		# contributors
		releaseNotes = re.sub(r'(@(?P<name>\w+))', '<a href="http://github.com/\g<name>">\g<0></a>', releaseNotes)
		
		with open(notesPath, 'w') as outputFile:
			outputFile.write(template % releaseNotes)
	return notesPath

def buildPackage(versionString, serverRootPath, signingName=None):
	'''Generate a .pkg with all of our customizations'''
	
	# == check for the identity
	
	if signingName is not None:
		signingName = str(signingName)
		foundSigningIdentity = False
		for line in subprocess.check_output(['/usr/bin/security', 'find-identity', '-p', 'macappstore', '-v']).splitlines():
			if signingName in line:
				foundSigningIdentity = True
				break
		if foundSigningIdentity is False:
			raise ValueError('Could not find the requested signingName: %s' % signingName)
	
	# == build the component packages
	
	# - make the server package
	
	packageFolder = os.path.join(scratchFolder, 'packages')
	if not os.path.isdir(packageFolder):
		os.mkdir(packageFolder)
	
	serverPackagePath = os.path.join(packageFolder, 'rethinkdb_server.pkg')
	logFile = open(os.path.join(scratchFolder, 'rethinkdb_server_pkg.log'), 'w+')
	try:
		subprocess.check_call(['/usr/bin/pkgbuild', '--root', serverRootPath, '--identifier', 'com.rethinkdb.server', '--version', versionString, serverPackagePath], stdout=logFile, stderr=logFile)
	except Exception as e:
		logFile.seek(0)
		sys.stderr.write('Failed while building server package: %s\n%s' % (str(e), logFile.read()))
		raise
	
	# == assemble the archive
	
	distributionPath = os.path.join(scratchFolder, 'rethinkdb-%s.pkg' % versionString)
	
	productBuildCommand = ['/usr/bin/productbuild', '--distribution', os.path.join(thisFolder, 'Distribution.xml'), '--package-path', packageFolder, '--resources', os.path.join(thisFolder, 'installer_resources'), distributionPath]
	if signingName is not None:
		productBuildCommand += ['--sign', signingName]
	
	logFile = open(os.path.join(scratchFolder, 'rethinkdb_pkg.log'), 'w+')
	try:
		subprocess.check_call(productBuildCommand, stdout=logFile, stderr=logFile)
	except Exception as e:
		logFile.seek(0)
		sys.stderr.write('Failed while compiling %s: %s\n%s' % (os.path.join(thisFolder, 'uninstall.scpt'), str(e), logFile.read()))
		raise
	return distributionPath

def main():
	'''Parse command line input and run'''
	
	global scratchFolder
	
	# == process input
	
	import optparse
	parser = optparse.OptionParser()
	parser.add_option('-s', '--server-root',     dest='serverRoot',    default=None,        help='path to root of the server component')
	parser.add_option('-o', '--ouptut-location', dest='outputPath',                         help='location for the output file')
	parser.add_option(      '--rethinkdb-name',  dest='binaryName',    default='rethinkdb', help='name of the rethinkdb server binary')
	parser.add_option(      '--signing-name',    dest='signingName',   default=None,        help='signing identifier')
	parser.add_option(      '--scratch-folder',  dest='scratchFolder', default=None,        help='folder for intermediate products')
	options, args = parser.parse_args()
	
	if len(args) > 0:
		parser.error('no non-keyword options are allowed')
	
	# = -s/--server-root 
	
	if options.serverRoot is None:
		parser.error('-s/--server-root is required')
	if not os.path.isdir(options.serverRoot):
		parser.error('-s/--server-root must be a folder: %s' % options.serverRoot)
	options.serverRoot = os.path.realpath(options.serverRoot)
	
	# = get the version of rethinkdb
	
	# find the binary
	
	rethinkdbPath = None
	for root, dirs, files in os.walk(options.serverRoot):
		if options.binaryName in files:
			canidatePath = os.path.join(root, options.binaryName)
			if os.access(canidatePath, os.X_OK):
				rethinkdbPath = canidatePath
				break
	if rethinkdbPath is None:
		parser.error('Unable to find a RethinkDB executable')
	
	# get the version string
	
	versionString = ''
	try:
		versionString = subprocess.check_output([rethinkdbPath, '--version']).strip().split()[1].decode('utf-8')
	except Exception as e:
		print(e)
		parser.error('the executable given is not a valid RethinkDB executable: %s' % rethinkdbPath)
	
	strictVersion = re.match('^(\d+\.?)+', versionString)
	if strictVersion is None:
		parser.error('version string from executable does not have a regular version string: %s' % versionString)
	strictVersion = strictVersion.group()
	
	# = -o/--ouptut-location
	
	if options.outputPath is None:
		options.outputPath = os.path.join(thisFolder, 'RethinkDB ' + versionString + '.dmg')
	elif os.path.isdir(options.outputPath):
		options.outputPath = os.path.join(options.outputPath, 'RethinkDB ' + versionString + '.dmg')
	elif not os.path.isdir(os.path.dirname(options.outputPath)):
		parser.error('the output path given is not valid: %s' % options.outputPath)
	
	# = --scratch-folder
	
	if options.scratchFolder is not None:
		if not os.path.isdir(options.scratchFolder):
			parser.error('the --scratch-folder given is not an existing folder: %s' % options.scratchFolder)
		scratchFolder = options.scratchFolder
	
	# == build the pkg	
	
	pkgPath = buildPackage(strictVersion, options.serverRoot, signingName=options.signingName)
	
	# == add dynamic content to settings
	
	dmgOptions = copy.deepcopy(defaultOptions)
	
	# = package
	
	dmgOptions['files'].append(pkgPath)
	dmgOptions['icon_locations'][os.path.basename(pkgPath)] = packagePosition
	
	# = uninstall script
	
	uninstallAppPath = compileUninstallApp()
	dmgOptions['files'].append(uninstallAppPath)
	
	# = release notes
	
	dmgOptions['files'].append(convertReleaseNotes())
	
	# == dmg creation
	
	dmgbuild.build_dmg(options.outputPath, 'RethinkDB ' + versionString, defines=dmgOptions)

if __name__ == '__main__':
	main()
