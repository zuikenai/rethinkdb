#!/usr/bin/env python

'''Collection of the shared exceptions used in testing'''

class TestingFrameworkException(Exception):
    '''Generic exception for this testing framework, mostly a base class for others'''
    
    _message = 'A generic testing framework error occured'
    detail = None
    debugInfo = None
    
    def __init__(self, detail=None, debugInfo=None):
        if detail is not None:
            self.detail = str(detail)
        if debugInfo is not None:
            if hasattr(debugInfo, 'read'):
                debugInfo.seek(0)
                self.debugInfo = debugInfo.read()
            else:
                self.debugInfo = debugInfo
    
    def __str__(self):
        if self.detail is not None:
            return "%s: %s" % (self.message(), self.detail)
        else:
            return self.message()
    
    def message(self):
        return self._message
        

class NotBuiltException(TestingFrameworkException):
    '''Exception to raise when an item that was expected to be built was not'''
    
    _message = 'An item was not built'

class TestFailedException(TestingFrameworkException):
    '''Generic failure signal for something in test execution'''
    
    _messgae = 'Failed while running a test'
    name = None
    testPath = None
    testOutput = None
    
    def __init__(self, name=None, testPath=None, testOutput=None, detail=None, debugInfo=None):
        super(TestFailedException, self).__init__(detail=detail, debugInfo=debugInfo)
        if name is not None:
            name = str(name)
        if testPath is not None:
            testPath = str(testPath)
        self.testOutput = testOutput
    
    def message(self):
        if not any([self.name, self.testPath]):
            return super(TestFailedException, self).message()
        elif all([self.name, self.testPath]):
            return 'Test %s (%s) failed'
        elif self.name is not None:
            return 'Test %s failed' % self.name
        else:
            return 'Test %s failed' % self.testPath

class TestMissingException(TestFailedException):
    '''Test was not able to be found when the tester went to run it'''
    
    def message(self):
        return super(TestMissingException, self).message() + ' because it could not be found'
