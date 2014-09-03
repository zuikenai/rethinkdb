#!/usr/bin/env python
# -*- coding: utf-8 -*-

'''Create the dmg for MacOS deployment'''

import atexit, copy, os, re, struct, subprocess, sys, tempfile

thisFolder = os.path.dirname(os.path.realpath(__file__))
sys.path.append(thisFolder)
import dmgbuild, markdown2

# == defaults

packagePosition = (565, 165)

defaultOptions = {
	'format': 'UDBZ',
	'badge_icon': '/Users/larkost/Projects/rethinkdb/packaging/osx/Thinker.icns',
	'files': [
		os.path.join(thisFolder, os.path.pardir, os.path.pardir, 'COPYRIGHT')
	],
	'icon_size': 64,
	'text_size': 14,
	'icon_locations': {
		'Release Notes.html': (450, 300),
		'Uninstall.app': (565, 300),
		'COPYRIGHT': (680, 300)
	},
	'background': os.path.join(thisFolder, 'dmg_background.png'),
	'window_rect': ((200, 200), (780, 429)),
	'default_view': 'icon-view',
	'show_icon_preview': True
}

# ==

foldersToRemove = []
@atexit.register
def removeAtExit():
	global foldersToRemove
	for folder in copy.copy(foldersToRemove):
		try:
			if os.path.isfile(folder):
				os.unlink(folder)
			elif os.path.isdir(folder):
				shutil.rmtree(folder, ignore_errors=True)
			foldersToRemove.remove(folder)
		except Exception:
			pass

def compileUninstallApp():
	global foldersToRemove
	
	outputFolderPath = tempfile.mkdtemp()
	foldersToRemove.append(outputFolderPath)
	
	outputPath = os.path.join(outputFolderPath, 'Uninstall.app')
	
	subprocess.check_call(['/usr/bin/osacompile', '-o', outputPath, os.path.join(thisFolder, 'uninstall.scpt')], stdout=tempfile.TemporaryFile())
	return outputPath

def convertReleaseNotes():
	notesDir = tempfile.mkdtemp()
	notesPath = os.path.join(notesDir, 'Release Notes.html')
	with open(os.path.join(thisFolder, os.path.pardir, os.path.pardir, 'NOTES.md'), 'r') as sourceFile:
		releaseNotes = markdown2.markdown(sourceFile.read().encode('utf-8'))
				
		# replace bug urls
		for match in set([x for x in re.finditer(r'((?P<pre>[\s\(]+))#(?P<number>\d+)(?P<post>[, \)])', releaseNotes)]):
			releaseNotes = releaseNotes.replace(match.group(), '%s<a href="http://github.com/rethinkdb/rethinkdb/issues/%s">#%s</a>%s' % (match.group('pre'), match.group('number'), match.group('number'), match.group('post')))
		
		# contributors
		for pattern in set([x.group() for x in re.finditer(r'(@(\w+))', releaseNotes)]):
			releaseNotes = releaseNotes.replace(pattern, '<a href="http://github.com/%s">%s</a>' % (pattern.lstrip('@'), pattern))
		
		with open(notesPath, 'w') as outputFile:
			outputFile.write(releaseNotes)
	return notesPath

def buildPackage(versionString, serverRootPath, signingName=None):
	'''Generate a .pkg with all of our customizations'''
	global foldersToRemove
	
	buildTemp = tempfile.mkdtemp()
	
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
	
	# - create temp folder for packages
	
	packageFolder = tempfile.mkdtemp()
	foldersToRemove.append(packageFolder)
	
	# - make the server package
	
	serverPackagePath = os.path.join(packageFolder, 'rethinkdb.pkg')
	subprocess.check_call(['/usr/bin/pkgbuild', '--root', serverRootPath, '--identifier', 'com.rethinkdb.server', '--version', versionString, serverPackagePath], stdout=tempfile.TemporaryFile())
	
	# == assemble the archive
	
	outputPath = os.path.join(buildTemp, 'rethinkdb-%s.pkg' % versionString)
	
	productBuildCommand = ['/usr/bin/productbuild', '--distribution', os.path.join(thisFolder, 'Distribution.xml'), '--package-path', packageFolder, '--resources', os.path.join(thisFolder, 'installer_resources'), outputPath]
	if signingName is not None:
		productBuildCommand += ['--sign', signingName]
	
	subprocess.check_call(productBuildCommand, stdout=tempfile.TemporaryFile())
	
	return outputPath

def main():
	
	# == process input
	
	import optparse
	parser = optparse.OptionParser()
	parser.add_option('-s', '--server-root',     dest='serverRoot',  default=None,        help='path to root of the server component')
	parser.add_option('-o', '--ouptut-location', dest='outputPath',                       help='location for the output file')
	parser.add_option(      '--rethinkdb-name',  dest='binaryName',  default='rethinkdb', help='name of the rethinkdb server binary')
	parser.add_option(      '--signing-name',    dest='signingName', default=None,        help='signing identifier')
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
	elif not (os.path.isdir(os.path.dirname(options.outputPath))):
		parser.error('the output path given is not valid: %s' % options.outputPath)
	
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
	
	dmgOptions['files'].append(convertReleaseNotes)
	
	# == dmg creation
	
	dmgbuild.build_dmg(options.outputPath, 'RethinkDB ' + versionString, defines=dmgOptions)

if __name__ == '__main__':
	main()
