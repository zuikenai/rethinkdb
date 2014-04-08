
def dict_eq(a, b):
    if isinstance(a, dict) and isinstance(b, dict):
        return ComparableDict(a) == ComparableDict(b)
    return a == b

class ComparableDict(object):
    def __init__(self, d):
        assert isinstance(d, dict)
        self.dict = d

    def __cmp__(self, other):
        if isinstance(other, dict):
            other = ComparableDict(other)
        elif not isinstance(other, ComparableDict):
            return False
        ret = cmp(self.items(), other.items())
        return ret

    def items(self):
        def ret():
            for k in sorted(self.dict.keys()):
                v = self.dict[k]
                if isinstance(v, dict):
                    yield k, ComparableDict(v)
                yield k, v
        return list(ret())

def test():
    assert ComparableDict({'a':1, 'b': {'c': {'d': 2}}}) == ComparableDict({'a':1, 'b':{'c': {'d': 2}}})
    assert ComparableDict({'a':1, 'b': {'c': {'d': 2}}}) != ComparableDict({'a':1, 'b':{'c': {'d': 3}}})
    print 'All tests pass'

if __name__ == '__main__':
    test()
