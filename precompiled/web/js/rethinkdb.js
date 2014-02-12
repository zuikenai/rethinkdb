require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
module.exports=require(1)
},{}],3:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        throw TypeError('Uncaught, unspecified "error" event.');
      }
      return false;
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      console.trace();
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],4:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],5:[function(require,module,exports){
var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `Buffer._useTypedArrays`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
Buffer._useTypedArrays = (function () {
   // Detect if browser supports Typed Arrays. Supported browsers are IE 10+,
   // Firefox 4+, Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+.
   if (typeof Uint8Array === 'undefined' || typeof ArrayBuffer === 'undefined')
      return false

  // Does the browser support adding properties to `Uint8Array` instances? If
  // not, then that's the same as no `Uint8Array` support. We need to be able to
  // add all the node Buffer API methods.
  // Relevant Firefox bug: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var arr = new Uint8Array(0)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() &&
        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Workaround: node's base64 implementation allows for non-padded strings
  // while base64-js does not.
  if (encoding === 'base64' && type === 'string') {
    subject = stringtrim(subject)
    while (subject.length % 4 !== 0) {
      subject = subject + '='
    }
  }

  // Find the length
  var length
  if (type === 'number')
    length = coerce(subject)
  else if (type === 'string')
    length = Buffer.byteLength(subject, encoding)
  else if (type === 'object')
    length = coerce(subject.length) // Assume object is an array
  else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (Buffer._useTypedArrays) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer._useTypedArrays && typeof Uint8Array === 'function' &&
      subject instanceof Uint8Array) {
    // Speed optimization -- use set if we're copying from a Uint8Array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    for (i = 0; i < length; i++) {
      if (Buffer.isBuffer(subject))
        buf[i] = subject.readUInt8(i)
      else
        buf[i] = subject[i]
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b !== null && b !== undefined && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list, [totalLength])\n' +
      'list should be an Array.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (typeof totalLength !== 'number') {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

// BUFFER INSTANCE METHODS
// =======================

function _hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  Buffer._charsWritten = i * 2
  return i
}

function _utf8Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function _asciiWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function _binaryWrite (buf, string, offset, length) {
  return _asciiWrite(buf, string, offset, length)
}

function _base64Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  switch (encoding) {
    case 'hex':
      return _hexWrite(this, string, offset, length)
    case 'utf8':
    case 'utf-8':
    case 'ucs2': // TODO: No support for ucs2 or utf16le encodings yet
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return _utf8Write(this, string, offset, length)
    case 'ascii':
      return _asciiWrite(this, string, offset, length)
    case 'binary':
      return _binaryWrite(this, string, offset, length)
    case 'base64':
      return _base64Write(this, string, offset, length)
    default:
      throw new Error('Unknown encoding')
  }
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end !== undefined)
    ? Number(end)
    : end = self.length

  // Fastpath empty strings
  if (end === start)
    return ''

  switch (encoding) {
    case 'hex':
      return _hexSlice(self, start, end)
    case 'utf8':
    case 'utf-8':
    case 'ucs2': // TODO: No support for ucs2 or utf16le encodings yet
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return _utf8Slice(self, start, end)
    case 'ascii':
      return _asciiSlice(self, start, end)
    case 'binary':
      return _binarySlice(self, start, end)
    case 'base64':
      return _base64Slice(self, start, end)
    default:
      throw new Error('Unknown encoding')
  }
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  // copy!
  for (var i = 0; i < end - start; i++)
    target[i + target_start] = this[i + start]
}

function _base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function _utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function _asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++)
    ret += String.fromCharCode(buf[i])
  return ret
}

function _binarySlice (buf, start, end) {
  return _asciiSlice(buf, start, end)
}

function _hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

// http://nodejs.org/api/buffer.html#buffer_buf_slice_start_end
Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = clamp(start, len, 0)
  end = clamp(end, len, len)

  if (Buffer._useTypedArrays) {
    return augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function _readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return _readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return _readUInt16(this, offset, false, noAssert)
}

function _readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return _readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return _readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function _readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return _readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return _readInt16(this, offset, false, noAssert)
}

function _readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return _readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return _readInt32(this, offset, false, noAssert)
}

function _readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return _readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return _readFloat(this, offset, false, noAssert)
}

function _readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return _readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return _readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
}

function _writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, false, noAssert)
}

function _writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
}

function _writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, false, noAssert)
}

function _writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, false, noAssert)
}

function _writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, false, noAssert)
}

function _writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (typeof value === 'string') {
    value = value.charCodeAt(0)
  }

  assert(typeof value === 'number' && !isNaN(value), 'value is not a number')
  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  for (var i = start; i < end; i++) {
    this[i] = value
  }
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array === 'function') {
    if (Buffer._useTypedArrays) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1)
        buf[i] = this[i]
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

var BP = Buffer.prototype

/**
 * Augment the Uint8Array *instance* (not the class!) with Buffer methods
 */
function augment (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

// slice(start, end)
function clamp (index, len, defaultValue) {
  if (typeof index !== 'number') return defaultValue
  index = ~~index;  // Coerce to integer.
  if (index >= len) return len
  if (index >= 0) return index
  index += len
  if (index >= 0) return index
  return 0
}

function coerce (length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length)
  return length < 0 ? 0 : length
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F)
      byteArray.push(str.charCodeAt(i))
    else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16))
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  var pos
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value == 'number', 'cannot write a non-number as a number')
  assert(value >= 0,
      'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint(value, max, min) {
  assert(typeof value == 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754(value, max, min) {
  assert(typeof value == 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

},{"base64-js":6,"ieee754":7}],6:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var ZERO   = '0'.charCodeAt(0)
	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS)
			return 62 // '+'
		if (code === SLASH)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	module.exports.toByteArray = b64ToByteArray
	module.exports.fromByteArray = uint8ToBase64
}())

},{}],7:[function(require,module,exports){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],8:[function(require,module,exports){
(function (process){// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;
}).call(this,require("/home/ssd1/atnnn/code/rethinkdb/build/external/browserify_3.24.13/node_modules/packed-browserify/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js"))
},{"/home/ssd1/atnnn/code/rethinkdb/build/external/browserify_3.24.13/node_modules/packed-browserify/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":4}],9:[function(require,module,exports){
// Generated by CoffeeScript 1.7.1
var Add, All, Any, Append, Asc, Between, Branch, ChangeAt, CoerceTo, ConcatMap, Contains, Count, DatumTerm, Day, DayOfWeek, DayOfYear, Db, DbCreate, DbDrop, DbList, Default, Delete, DeleteAt, Desc, Difference, Distinct, Div, Downcase, During, EpochTime, Eq, EqJoin, Filter, ForEach, FunCall, Func, Ge, Get, GetAll, GetField, GroupBy, GroupedMapReduce, Gt, HasFields, Hours, ISO8601, ImplicitVar, InTimezone, IndexCreate, IndexDrop, IndexList, IndexStatus, IndexWait, IndexesOf, Info, InnerJoin, Insert, InsertAt, IsEmpty, JavaScript, Json, Keys, Le, Limit, Literal, Lt, MakeArray, MakeObject, Map, Match, Merge, Minutes, Mod, Month, Mul, Ne, Not, Now, Nth, Object_, OrderBy, OuterJoin, Pluck, Prepend, RDBOp, RDBVal, RQLDate, Reduce, Replace, Sample, Seconds, SetDifference, SetInsert, SetIntersection, SetUnion, Skip, Slice, SpliceAt, Sub, Sync, Table, TableCreate, TableDrop, TableList, TermBase, Time, TimeOfDay, Timezone, ToEpochTime, ToISO8601, TypeOf, Union, Upcase, Update, UserError, Var, WithFields, Without, Year, Zip, ar, aropt, err, funcWrap, hasImplicit, intsp, intspallargs, isJSON, kved, rethinkdb, shouldWrap, translateOptargs, util, varar,
  __slice = [].slice,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

util = require('./util');

err = require('./errors');

ar = util.ar;

varar = util.varar;

aropt = util.aropt;

rethinkdb = function() {
  var args;
  args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
  return rethinkdb.expr.apply(rethinkdb, args);
};

funcWrap = function(val) {
  var ivarScan;
  if (val === void 0) {
    return val;
  }
  val = rethinkdb.expr(val);
  ivarScan = function(node) {
    var k, v;
    if (!(node instanceof TermBase)) {
      return false;
    }
    if (node instanceof ImplicitVar) {
      return true;
    }
    if ((node.args.map(ivarScan)).some(function(a) {
      return a;
    })) {
      return true;
    }
    if (((function() {
      var _ref, _results;
      _ref = node.optargs;
      _results = [];
      for (k in _ref) {
        if (!__hasProp.call(_ref, k)) continue;
        v = _ref[k];
        _results.push(v);
      }
      return _results;
    })()).map(ivarScan).some(function(a) {
      return a;
    })) {
      return true;
    }
    return false;
  };
  if (ivarScan(val)) {
    return new Func({}, function(x) {
      return val;
    });
  }
  return val;
};

hasImplicit = function(args) {
  var arg, _i, _len;
  if (Array.isArray(args)) {
    for (_i = 0, _len = args.length; _i < _len; _i++) {
      arg = args[_i];
      if (hasImplicit(arg) === true) {
        return true;
      }
    }
  } else if (args === 'r.row') {
    return true;
  }
  return false;
};

TermBase = (function() {
  function TermBase() {
    var self;
    self = ar(function(field) {
      return self.getField(field);
    });
    self.__proto__ = this.__proto__;
    return self;
  }

  TermBase.prototype.run = function(connOrOptions, cb) {
    var conn, e, key, opts, useOutdated;
    useOutdated = void 0;
    if ((connOrOptions != null) && connOrOptions.constructor === Object) {
      for (key in connOrOptions) {
        if (!__hasProp.call(connOrOptions, key)) continue;
        if (key !== 'connection' && key !== 'useOutdated' && key !== 'noreply' && key !== 'timeFormat' && key !== 'profile' && key !== 'durability') {
          throw new err.RqlDriverError("First argument to `run` must be an open connection or { connection: <connection>, useOutdated: <bool>, noreply: <bool>, timeFormat: <string>, profile: <bool>, durability: <string>}.");
        }
      }
      conn = connOrOptions.connection;
      opts = connOrOptions;
    } else {
      conn = connOrOptions;
      opts = {};
    }
    if (!((conn != null) && (conn._start != null))) {
      throw new err.RqlDriverError("First argument to `run` must be an open connection or { connection: <connection>, useOutdated: <bool>, noreply: <bool>, timeFormat: <string>, profile: <bool>, durability: <string>}.");
    }
    if (!opts.noreply && typeof cb !== 'function') {
      throw new err.RqlDriverError("Second argument to `run` must be a callback to invoke " + "with either an error or the result of the query.");
    }
    try {
      return conn._start(this, cb, opts);
    } catch (_error) {
      e = _error;
      if (typeof cb === 'function') {
        return cb(e);
      } else {
        throw e;
      }
    }
  };

  TermBase.prototype.toString = function() {
    return err.printQuery(this);
  };

  return TermBase;

})();

RDBVal = (function(_super) {
  __extends(RDBVal, _super);

  function RDBVal() {
    return RDBVal.__super__.constructor.apply(this, arguments);
  }

  RDBVal.prototype.eq = varar(1, null, function() {
    var others;
    others = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(Eq, [{}, this].concat(__slice.call(others)), function(){});
  });

  RDBVal.prototype.ne = varar(1, null, function() {
    var others;
    others = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(Ne, [{}, this].concat(__slice.call(others)), function(){});
  });

  RDBVal.prototype.lt = varar(1, null, function() {
    var others;
    others = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(Lt, [{}, this].concat(__slice.call(others)), function(){});
  });

  RDBVal.prototype.le = varar(1, null, function() {
    var others;
    others = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(Le, [{}, this].concat(__slice.call(others)), function(){});
  });

  RDBVal.prototype.gt = varar(1, null, function() {
    var others;
    others = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(Gt, [{}, this].concat(__slice.call(others)), function(){});
  });

  RDBVal.prototype.ge = varar(1, null, function() {
    var others;
    others = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(Ge, [{}, this].concat(__slice.call(others)), function(){});
  });

  RDBVal.prototype.not = ar(function() {
    return new Not({}, this);
  });

  RDBVal.prototype.add = varar(1, null, function() {
    var others;
    others = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(Add, [{}, this].concat(__slice.call(others)), function(){});
  });

  RDBVal.prototype.sub = varar(1, null, function() {
    var others;
    others = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(Sub, [{}, this].concat(__slice.call(others)), function(){});
  });

  RDBVal.prototype.mul = varar(1, null, function() {
    var others;
    others = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(Mul, [{}, this].concat(__slice.call(others)), function(){});
  });

  RDBVal.prototype.div = varar(1, null, function() {
    var others;
    others = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(Div, [{}, this].concat(__slice.call(others)), function(){});
  });

  RDBVal.prototype.mod = ar(function(other) {
    return new Mod({}, this, other);
  });

  RDBVal.prototype.append = ar(function(val) {
    return new Append({}, this, val);
  });

  RDBVal.prototype.prepend = ar(function(val) {
    return new Prepend({}, this, val);
  });

  RDBVal.prototype.difference = ar(function(val) {
    return new Difference({}, this, val);
  });

  RDBVal.prototype.setInsert = ar(function(val) {
    return new SetInsert({}, this, val);
  });

  RDBVal.prototype.setUnion = ar(function(val) {
    return new SetUnion({}, this, val);
  });

  RDBVal.prototype.setIntersection = ar(function(val) {
    return new SetIntersection({}, this, val);
  });

  RDBVal.prototype.setDifference = ar(function(val) {
    return new SetDifference({}, this, val);
  });

  RDBVal.prototype.slice = aropt(function(left, right, opts) {
    return new Slice(opts, this, left, right);
  });

  RDBVal.prototype.skip = ar(function(index) {
    return new Skip({}, this, index);
  });

  RDBVal.prototype.limit = ar(function(index) {
    return new Limit({}, this, index);
  });

  RDBVal.prototype.getField = ar(function(field) {
    return new GetField({}, this, field);
  });

  RDBVal.prototype.contains = varar(1, null, function() {
    var fields;
    fields = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(Contains, [{}, this].concat(__slice.call(fields.map(funcWrap))), function(){});
  });

  RDBVal.prototype.insertAt = ar(function(index, value) {
    return new InsertAt({}, this, index, value);
  });

  RDBVal.prototype.spliceAt = ar(function(index, value) {
    return new SpliceAt({}, this, index, value);
  });

  RDBVal.prototype.deleteAt = varar(1, 2, function() {
    var others;
    others = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(DeleteAt, [{}, this].concat(__slice.call(others)), function(){});
  });

  RDBVal.prototype.changeAt = ar(function(index, value) {
    return new ChangeAt({}, this, index, value);
  });

  RDBVal.prototype.indexesOf = ar(function(which) {
    return new IndexesOf({}, this, funcWrap(which));
  });

  RDBVal.prototype.hasFields = varar(0, null, function() {
    var fields;
    fields = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(HasFields, [{}, this].concat(__slice.call(fields)), function(){});
  });

  RDBVal.prototype.withFields = varar(0, null, function() {
    var fields;
    fields = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(WithFields, [{}, this].concat(__slice.call(fields)), function(){});
  });

  RDBVal.prototype.keys = ar(function() {
    return new Keys({}, this);
  });

  RDBVal.prototype.pluck = function() {
    var fields;
    fields = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(Pluck, [{}, this].concat(__slice.call(fields)), function(){});
  };

  RDBVal.prototype.without = function() {
    var fields;
    fields = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(Without, [{}, this].concat(__slice.call(fields)), function(){});
  };

  RDBVal.prototype.merge = varar(1, null, function() {
    var fields;
    fields = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(Merge, [{}, this].concat(__slice.call(fields.map(funcWrap))), function(){});
  });

  RDBVal.prototype.between = aropt(function(left, right, opts) {
    return new Between(opts, this, left, right);
  });

  RDBVal.prototype.reduce = varar(1, 2, function(func) {
    return new Reduce({}, this, funcWrap(func));
  });

  RDBVal.prototype.map = ar(function(func) {
    return new Map({}, this, funcWrap(func));
  });

  RDBVal.prototype.filter = aropt(function(predicate, opts) {
    return new Filter(opts, this, funcWrap(predicate));
  });

  RDBVal.prototype.concatMap = ar(function(func) {
    return new ConcatMap({}, this, funcWrap(func));
  });

  RDBVal.prototype.distinct = ar(function() {
    return new Distinct({}, this);
  });

  RDBVal.prototype.count = varar(0, 1, function() {
    var fun;
    fun = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(Count, [{}, this].concat(__slice.call(fun.map(funcWrap))), function(){});
  });

  RDBVal.prototype.union = varar(1, null, function() {
    var others;
    others = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(Union, [{}, this].concat(__slice.call(others)), function(){});
  });

  RDBVal.prototype.nth = ar(function(index) {
    return new Nth({}, this, index);
  });

  RDBVal.prototype.match = ar(function(pattern) {
    return new Match({}, this, pattern);
  });

  RDBVal.prototype.upcase = ar(function() {
    return new Upcase({}, this);
  });

  RDBVal.prototype.downcase = ar(function() {
    return new Downcase({}, this);
  });

  RDBVal.prototype.isEmpty = ar(function() {
    return new IsEmpty({}, this);
  });

  RDBVal.prototype.groupedMapReduce = varar(3, 4, function(group, map, reduce) {
    return new GroupedMapReduce({}, this, funcWrap(group), funcWrap(map), funcWrap(reduce));
  });

  RDBVal.prototype.innerJoin = ar(function(other, predicate) {
    return new InnerJoin({}, this, other, predicate);
  });

  RDBVal.prototype.outerJoin = ar(function(other, predicate) {
    return new OuterJoin({}, this, other, predicate);
  });

  RDBVal.prototype.eqJoin = aropt(function(left_attr, right, opts) {
    return new EqJoin(opts, this, funcWrap(left_attr), right);
  });

  RDBVal.prototype.zip = ar(function() {
    return new Zip({}, this);
  });

  RDBVal.prototype.coerceTo = ar(function(type) {
    return new CoerceTo({}, this, type);
  });

  RDBVal.prototype.typeOf = ar(function() {
    return new TypeOf({}, this);
  });

  RDBVal.prototype.update = aropt(function(func, opts) {
    return new Update(opts, this, funcWrap(func));
  });

  RDBVal.prototype["delete"] = aropt(function(opts) {
    return new Delete(opts, this);
  });

  RDBVal.prototype.replace = aropt(function(func, opts) {
    return new Replace(opts, this, funcWrap(func));
  });

  RDBVal.prototype["do"] = ar(function(func) {
    return new FunCall({}, funcWrap(func), this);
  });

  RDBVal.prototype["default"] = ar(function(x) {
    return new Default({}, this, x);
  });

  RDBVal.prototype.or = varar(1, null, function() {
    var others;
    others = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(Any, [{}, this].concat(__slice.call(others)), function(){});
  });

  RDBVal.prototype.and = varar(1, null, function() {
    var others;
    others = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(All, [{}, this].concat(__slice.call(others)), function(){});
  });

  RDBVal.prototype.forEach = ar(function(func) {
    return new ForEach({}, this, funcWrap(func));
  });

  RDBVal.prototype.groupBy = function() {
    var attrs, collector, numArgs, _i;
    attrs = 2 <= arguments.length ? __slice.call(arguments, 0, _i = arguments.length - 1) : (_i = 0, []), collector = arguments[_i++];
    if (!((collector != null) && attrs.length >= 1)) {
      numArgs = attrs.length + (collector != null ? 1 : 0);
      throw new err.RqlDriverError("Expected 2 or more argument(s) but found " + numArgs + ".");
    }
    return new GroupBy({}, this, attrs, collector);
  };

  RDBVal.prototype.info = ar(function() {
    return new Info({}, this);
  });

  RDBVal.prototype.sample = ar(function(count) {
    return new Sample({}, this, count);
  });

  RDBVal.prototype.orderBy = function() {
    var attr, attrs, attrsAndOpts, opts, perhapsOptDict;
    attrsAndOpts = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    opts = {};
    attrs = attrsAndOpts;
    perhapsOptDict = attrsAndOpts[attrsAndOpts.length - 1];
    if (perhapsOptDict && (Object.prototype.toString.call(perhapsOptDict) === '[object Object]') && !(perhapsOptDict instanceof TermBase)) {
      opts = perhapsOptDict;
      attrs = attrsAndOpts.slice(0, attrsAndOpts.length - 1);
    }
    attrs = (function() {
      var _i, _len, _results;
      _results = [];
      for (_i = 0, _len = attrs.length; _i < _len; _i++) {
        attr = attrs[_i];
        if (attr instanceof Asc || attr instanceof Desc) {
          _results.push(attr);
        } else {
          _results.push(funcWrap(attr));
        }
      }
      return _results;
    })();
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(OrderBy, [opts, this].concat(__slice.call(attrs)), function(){});
  };

  RDBVal.prototype.tableCreate = aropt(function(tblName, opts) {
    return new TableCreate(opts, this, tblName);
  });

  RDBVal.prototype.tableDrop = ar(function(tblName) {
    return new TableDrop({}, this, tblName);
  });

  RDBVal.prototype.tableList = ar(function() {
    return new TableList({}, this);
  });

  RDBVal.prototype.table = aropt(function(tblName, opts) {
    return new Table(opts, this, tblName);
  });

  RDBVal.prototype.get = ar(function(key) {
    return new Get({}, this, key);
  });

  RDBVal.prototype.getAll = function() {
    var keys, keysAndOpts, opts, perhapsOptDict;
    keysAndOpts = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    opts = {};
    keys = keysAndOpts;
    perhapsOptDict = keysAndOpts[keysAndOpts.length - 1];
    if (perhapsOptDict && ((Object.prototype.toString.call(perhapsOptDict) === '[object Object]') && !(perhapsOptDict instanceof TermBase))) {
      opts = perhapsOptDict;
      keys = keysAndOpts.slice(0, keysAndOpts.length - 1);
    }
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(GetAll, [opts, this].concat(__slice.call(keys)), function(){});
  };

  RDBVal.prototype.insert = aropt(function(doc, opts) {
    return new Insert(opts, this, rethinkdb.exprJSON(doc));
  });

  RDBVal.prototype.indexCreate = varar(1, 3, function(name, defun_or_opts, opts) {
    if (opts != null) {
      return new IndexCreate(opts, this, name, funcWrap(defun_or_opts));
    } else if (defun_or_opts != null) {
      if ((Object.prototype.toString.call(defun_or_opts) === '[object Object]') && !(defun_or_opts instanceof Function) && !(defun_or_opts instanceof TermBase)) {
        return new IndexCreate(defun_or_opts, this, name);
      } else {
        return new IndexCreate({}, this, name, funcWrap(defun_or_opts));
      }
    } else {
      return new IndexCreate({}, this, name);
    }
  });

  RDBVal.prototype.indexDrop = ar(function(name) {
    return new IndexDrop({}, this, name);
  });

  RDBVal.prototype.indexList = ar(function() {
    return new IndexList({}, this);
  });

  RDBVal.prototype.indexStatus = varar(0, null, function() {
    var others;
    others = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(IndexStatus, [{}, this].concat(__slice.call(others)), function(){});
  });

  RDBVal.prototype.indexWait = varar(0, null, function() {
    var others;
    others = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(IndexWait, [{}, this].concat(__slice.call(others)), function(){});
  });

  RDBVal.prototype.sync = ar(function() {
    return new Sync({}, this);
  });

  RDBVal.prototype.toISO8601 = ar(function() {
    return new ToISO8601({}, this);
  });

  RDBVal.prototype.toEpochTime = ar(function() {
    return new ToEpochTime({}, this);
  });

  RDBVal.prototype.inTimezone = ar(function(tzstr) {
    return new InTimezone({}, this, tzstr);
  });

  RDBVal.prototype.during = aropt(function(t2, t3, opts) {
    return new During(opts, this, t2, t3);
  });

  RDBVal.prototype.date = ar(function() {
    return new RQLDate({}, this);
  });

  RDBVal.prototype.timeOfDay = ar(function() {
    return new TimeOfDay({}, this);
  });

  RDBVal.prototype.timezone = ar(function() {
    return new Timezone({}, this);
  });

  RDBVal.prototype.year = ar(function() {
    return new Year({}, this);
  });

  RDBVal.prototype.month = ar(function() {
    return new Month({}, this);
  });

  RDBVal.prototype.day = ar(function() {
    return new Day({}, this);
  });

  RDBVal.prototype.dayOfWeek = ar(function() {
    return new DayOfWeek({}, this);
  });

  RDBVal.prototype.dayOfYear = ar(function() {
    return new DayOfYear({}, this);
  });

  RDBVal.prototype.hours = ar(function() {
    return new Hours({}, this);
  });

  RDBVal.prototype.minutes = ar(function() {
    return new Minutes({}, this);
  });

  RDBVal.prototype.seconds = ar(function() {
    return new Seconds({}, this);
  });

  return RDBVal;

})(TermBase);

DatumTerm = (function(_super) {
  __extends(DatumTerm, _super);

  DatumTerm.prototype.args = [];

  DatumTerm.prototype.optargs = {};

  function DatumTerm(val) {
    var self;
    self = DatumTerm.__super__.constructor.call(this);
    self.data = val;
    return self;
  }

  DatumTerm.prototype.compose = function() {
    switch (typeof this.data) {
      case 'string':
        return '"' + this.data + '"';
      default:
        return '' + this.data;
    }
  };

  DatumTerm.prototype.build = function() {
    var datum, term;
    datum = {};
    if (this.data === null) {
      datum.type = "R_NULL";
    } else {
      switch (typeof this.data) {
        case 'number':
          datum.type = "R_NUM";
          datum.r_num = this.data;
          break;
        case 'boolean':
          datum.type = "R_BOOL";
          datum.r_bool = this.data;
          break;
        case 'string':
          datum.type = "R_STR";
          datum.r_str = this.data;
          break;
        default:
          throw new err.RqlDriverError("Cannot convert `" + this.data + "` to Datum.");
      }
    }
    term = {
      type: "DATUM",
      datum: datum
    };
    return term;
  };

  return DatumTerm;

})(RDBVal);

translateOptargs = function(optargs) {
  var key, result, val;
  result = {};
  for (key in optargs) {
    if (!__hasProp.call(optargs, key)) continue;
    val = optargs[key];
    key = (function() {
      switch (key) {
        case 'primaryKey':
          return 'primary_key';
        case 'returnVals':
          return 'return_vals';
        case 'useOutdated':
          return 'use_outdated';
        case 'nonAtomic':
          return 'non_atomic';
        case 'cacheSize':
          return 'cache_size';
        case 'leftBound':
          return 'left_bound';
        case 'rightBound':
          return 'right_bound';
        case 'defaultTimezone':
          return 'default_timezone';
        default:
          return key;
      }
    })();
    if (key === void 0 || val === void 0) {
      continue;
    }
    result[key] = rethinkdb.expr(val);
  }
  return result;
};

RDBOp = (function(_super) {
  __extends(RDBOp, _super);

  function RDBOp() {
    var arg, args, i, optargs, self;
    optargs = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
    self = RDBOp.__super__.constructor.call(this);
    self.args = (function() {
      var _i, _len, _results;
      _results = [];
      for (i = _i = 0, _len = args.length; _i < _len; i = ++_i) {
        arg = args[i];
        if (arg !== void 0) {
          _results.push(rethinkdb.expr(arg));
        } else {
          throw new err.RqlDriverError("Argument " + i + " to " + (this.st || this.mt) + " may not be `undefined`.");
        }
      }
      return _results;
    }).call(this);
    self.optargs = translateOptargs(optargs);
    return self;
  }

  RDBOp.prototype.build = function() {
    var arg, key, pair, term, val, _i, _len, _ref, _ref1;
    term = {
      args: [],
      optargs: []
    };
    term.type = this.tt;
    _ref = this.args;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      arg = _ref[_i];
      term.args.push(arg.build());
    }
    _ref1 = this.optargs;
    for (key in _ref1) {
      if (!__hasProp.call(_ref1, key)) continue;
      val = _ref1[key];
      pair = {
        key: key,
        val: val.build()
      };
      term.optargs.push(pair);
    }
    return term;
  };

  RDBOp.prototype.compose = function(args, optargs) {
    if (this.st) {
      return ['r.', this.st, '(', intspallargs(args, optargs), ')'];
    } else {
      if (shouldWrap(this.args[0])) {
        args[0] = ['r(', args[0], ')'];
      }
      return [args[0], '.', this.mt, '(', intspallargs(args.slice(1), optargs), ')'];
    }
  };

  return RDBOp;

})(RDBVal);

intsp = function(seq) {
  var e, res, _i, _len, _ref;
  if (seq[0] == null) {
    return [];
  }
  res = [seq[0]];
  _ref = seq.slice(1);
  for (_i = 0, _len = _ref.length; _i < _len; _i++) {
    e = _ref[_i];
    res.push(', ', e);
  }
  return res;
};

kved = function(optargs) {
  var k, v;
  return [
    '{', intsp((function() {
      var _results;
      _results = [];
      for (k in optargs) {
        if (!__hasProp.call(optargs, k)) continue;
        v = optargs[k];
        _results.push([k, ': ', v]);
      }
      return _results;
    })()), '}'
  ];
};

intspallargs = function(args, optargs) {
  var argrepr;
  argrepr = [];
  if (args.length > 0) {
    argrepr.push(intsp(args));
  }
  if (Object.keys(optargs).length > 0) {
    if (argrepr.length > 0) {
      argrepr.push(', ');
    }
    argrepr.push(kved(optargs));
  }
  return argrepr;
};

shouldWrap = function(arg) {
  return arg instanceof DatumTerm || arg instanceof MakeArray || arg instanceof MakeObject;
};

MakeArray = (function(_super) {
  __extends(MakeArray, _super);

  function MakeArray() {
    return MakeArray.__super__.constructor.apply(this, arguments);
  }

  MakeArray.prototype.tt = "MAKE_ARRAY";

  MakeArray.prototype.st = '[...]';

  MakeArray.prototype.compose = function(args) {
    return ['[', intsp(args), ']'];
  };

  return MakeArray;

})(RDBOp);

MakeObject = (function(_super) {
  __extends(MakeObject, _super);

  MakeObject.prototype.tt = "MAKE_OBJ";

  MakeObject.prototype.st = '{...}';

  function MakeObject(obj) {
    var key, self, val;
    self = MakeObject.__super__.constructor.call(this, {});
    self.optargs = {};
    for (key in obj) {
      if (!__hasProp.call(obj, key)) continue;
      val = obj[key];
      if (typeof val === 'undefined') {
        throw new err.RqlDriverError("Object field '" + key + "' may not be undefined");
      }
      self.optargs[key] = rethinkdb.expr(val);
    }
    return self;
  }

  MakeObject.prototype.compose = function(args, optargs) {
    return kved(optargs);
  };

  return MakeObject;

})(RDBOp);

Var = (function(_super) {
  __extends(Var, _super);

  function Var() {
    return Var.__super__.constructor.apply(this, arguments);
  }

  Var.prototype.tt = "VAR";

  Var.prototype.compose = function(args) {
    return ['var_' + args[0]];
  };

  return Var;

})(RDBOp);

JavaScript = (function(_super) {
  __extends(JavaScript, _super);

  function JavaScript() {
    return JavaScript.__super__.constructor.apply(this, arguments);
  }

  JavaScript.prototype.tt = "JAVASCRIPT";

  JavaScript.prototype.st = 'js';

  return JavaScript;

})(RDBOp);

Json = (function(_super) {
  __extends(Json, _super);

  function Json() {
    return Json.__super__.constructor.apply(this, arguments);
  }

  Json.prototype.tt = "JSON";

  Json.prototype.st = 'json';

  return Json;

})(RDBOp);

UserError = (function(_super) {
  __extends(UserError, _super);

  function UserError() {
    return UserError.__super__.constructor.apply(this, arguments);
  }

  UserError.prototype.tt = "ERROR";

  UserError.prototype.st = 'error';

  return UserError;

})(RDBOp);

ImplicitVar = (function(_super) {
  __extends(ImplicitVar, _super);

  function ImplicitVar() {
    return ImplicitVar.__super__.constructor.apply(this, arguments);
  }

  ImplicitVar.prototype.tt = "IMPLICIT_VAR";

  ImplicitVar.prototype.compose = function() {
    return ['r.row'];
  };

  return ImplicitVar;

})(RDBOp);

Db = (function(_super) {
  __extends(Db, _super);

  function Db() {
    return Db.__super__.constructor.apply(this, arguments);
  }

  Db.prototype.tt = "DB";

  Db.prototype.st = 'db';

  return Db;

})(RDBOp);

Table = (function(_super) {
  __extends(Table, _super);

  function Table() {
    return Table.__super__.constructor.apply(this, arguments);
  }

  Table.prototype.tt = "TABLE";

  Table.prototype.st = 'table';

  Table.prototype.compose = function(args, optargs) {
    if (this.args[0] instanceof Db) {
      return [args[0], '.table(', args[1], ')'];
    } else {
      return ['r.table(', args[0], ')'];
    }
  };

  return Table;

})(RDBOp);

Get = (function(_super) {
  __extends(Get, _super);

  function Get() {
    return Get.__super__.constructor.apply(this, arguments);
  }

  Get.prototype.tt = "GET";

  Get.prototype.mt = 'get';

  return Get;

})(RDBOp);

GetAll = (function(_super) {
  __extends(GetAll, _super);

  function GetAll() {
    return GetAll.__super__.constructor.apply(this, arguments);
  }

  GetAll.prototype.tt = "GET_ALL";

  GetAll.prototype.mt = 'getAll';

  return GetAll;

})(RDBOp);

Eq = (function(_super) {
  __extends(Eq, _super);

  function Eq() {
    return Eq.__super__.constructor.apply(this, arguments);
  }

  Eq.prototype.tt = "EQ";

  Eq.prototype.mt = 'eq';

  return Eq;

})(RDBOp);

Ne = (function(_super) {
  __extends(Ne, _super);

  function Ne() {
    return Ne.__super__.constructor.apply(this, arguments);
  }

  Ne.prototype.tt = "NE";

  Ne.prototype.mt = 'ne';

  return Ne;

})(RDBOp);

Lt = (function(_super) {
  __extends(Lt, _super);

  function Lt() {
    return Lt.__super__.constructor.apply(this, arguments);
  }

  Lt.prototype.tt = "LT";

  Lt.prototype.mt = 'lt';

  return Lt;

})(RDBOp);

Le = (function(_super) {
  __extends(Le, _super);

  function Le() {
    return Le.__super__.constructor.apply(this, arguments);
  }

  Le.prototype.tt = "LE";

  Le.prototype.mt = 'le';

  return Le;

})(RDBOp);

Gt = (function(_super) {
  __extends(Gt, _super);

  function Gt() {
    return Gt.__super__.constructor.apply(this, arguments);
  }

  Gt.prototype.tt = "GT";

  Gt.prototype.mt = 'gt';

  return Gt;

})(RDBOp);

Ge = (function(_super) {
  __extends(Ge, _super);

  function Ge() {
    return Ge.__super__.constructor.apply(this, arguments);
  }

  Ge.prototype.tt = "GE";

  Ge.prototype.mt = 'ge';

  return Ge;

})(RDBOp);

Not = (function(_super) {
  __extends(Not, _super);

  function Not() {
    return Not.__super__.constructor.apply(this, arguments);
  }

  Not.prototype.tt = "NOT";

  Not.prototype.mt = 'not';

  return Not;

})(RDBOp);

Add = (function(_super) {
  __extends(Add, _super);

  function Add() {
    return Add.__super__.constructor.apply(this, arguments);
  }

  Add.prototype.tt = "ADD";

  Add.prototype.mt = 'add';

  return Add;

})(RDBOp);

Sub = (function(_super) {
  __extends(Sub, _super);

  function Sub() {
    return Sub.__super__.constructor.apply(this, arguments);
  }

  Sub.prototype.tt = "SUB";

  Sub.prototype.mt = 'sub';

  return Sub;

})(RDBOp);

Mul = (function(_super) {
  __extends(Mul, _super);

  function Mul() {
    return Mul.__super__.constructor.apply(this, arguments);
  }

  Mul.prototype.tt = "MUL";

  Mul.prototype.mt = 'mul';

  return Mul;

})(RDBOp);

Div = (function(_super) {
  __extends(Div, _super);

  function Div() {
    return Div.__super__.constructor.apply(this, arguments);
  }

  Div.prototype.tt = "DIV";

  Div.prototype.mt = 'div';

  return Div;

})(RDBOp);

Mod = (function(_super) {
  __extends(Mod, _super);

  function Mod() {
    return Mod.__super__.constructor.apply(this, arguments);
  }

  Mod.prototype.tt = "MOD";

  Mod.prototype.mt = 'mod';

  return Mod;

})(RDBOp);

Append = (function(_super) {
  __extends(Append, _super);

  function Append() {
    return Append.__super__.constructor.apply(this, arguments);
  }

  Append.prototype.tt = "APPEND";

  Append.prototype.mt = 'append';

  return Append;

})(RDBOp);

Prepend = (function(_super) {
  __extends(Prepend, _super);

  function Prepend() {
    return Prepend.__super__.constructor.apply(this, arguments);
  }

  Prepend.prototype.tt = "PREPEND";

  Prepend.prototype.mt = 'prepend';

  return Prepend;

})(RDBOp);

Difference = (function(_super) {
  __extends(Difference, _super);

  function Difference() {
    return Difference.__super__.constructor.apply(this, arguments);
  }

  Difference.prototype.tt = "DIFFERENCE";

  Difference.prototype.mt = 'difference';

  return Difference;

})(RDBOp);

SetInsert = (function(_super) {
  __extends(SetInsert, _super);

  function SetInsert() {
    return SetInsert.__super__.constructor.apply(this, arguments);
  }

  SetInsert.prototype.tt = "SET_INSERT";

  SetInsert.prototype.mt = 'setInsert';

  return SetInsert;

})(RDBOp);

SetUnion = (function(_super) {
  __extends(SetUnion, _super);

  function SetUnion() {
    return SetUnion.__super__.constructor.apply(this, arguments);
  }

  SetUnion.prototype.tt = "SET_UNION";

  SetUnion.prototype.mt = 'setUnion';

  return SetUnion;

})(RDBOp);

SetIntersection = (function(_super) {
  __extends(SetIntersection, _super);

  function SetIntersection() {
    return SetIntersection.__super__.constructor.apply(this, arguments);
  }

  SetIntersection.prototype.tt = "SET_INTERSECTION";

  SetIntersection.prototype.mt = 'setIntersection';

  return SetIntersection;

})(RDBOp);

SetDifference = (function(_super) {
  __extends(SetDifference, _super);

  function SetDifference() {
    return SetDifference.__super__.constructor.apply(this, arguments);
  }

  SetDifference.prototype.tt = "SET_DIFFERENCE";

  SetDifference.prototype.mt = 'setDifference';

  return SetDifference;

})(RDBOp);

Slice = (function(_super) {
  __extends(Slice, _super);

  function Slice() {
    return Slice.__super__.constructor.apply(this, arguments);
  }

  Slice.prototype.tt = "SLICE";

  Slice.prototype.mt = 'slice';

  return Slice;

})(RDBOp);

Skip = (function(_super) {
  __extends(Skip, _super);

  function Skip() {
    return Skip.__super__.constructor.apply(this, arguments);
  }

  Skip.prototype.tt = "SKIP";

  Skip.prototype.mt = 'skip';

  return Skip;

})(RDBOp);

Limit = (function(_super) {
  __extends(Limit, _super);

  function Limit() {
    return Limit.__super__.constructor.apply(this, arguments);
  }

  Limit.prototype.tt = "LIMIT";

  Limit.prototype.mt = 'limit';

  return Limit;

})(RDBOp);

GetField = (function(_super) {
  __extends(GetField, _super);

  function GetField() {
    return GetField.__super__.constructor.apply(this, arguments);
  }

  GetField.prototype.tt = "GET_FIELD";

  GetField.prototype.st = '(...)';

  GetField.prototype.compose = function(args) {
    return [args[0], '(', args[1], ')'];
  };

  return GetField;

})(RDBOp);

Contains = (function(_super) {
  __extends(Contains, _super);

  function Contains() {
    return Contains.__super__.constructor.apply(this, arguments);
  }

  Contains.prototype.tt = "CONTAINS";

  Contains.prototype.mt = 'contains';

  return Contains;

})(RDBOp);

InsertAt = (function(_super) {
  __extends(InsertAt, _super);

  function InsertAt() {
    return InsertAt.__super__.constructor.apply(this, arguments);
  }

  InsertAt.prototype.tt = "INSERT_AT";

  InsertAt.prototype.mt = 'insertAt';

  return InsertAt;

})(RDBOp);

SpliceAt = (function(_super) {
  __extends(SpliceAt, _super);

  function SpliceAt() {
    return SpliceAt.__super__.constructor.apply(this, arguments);
  }

  SpliceAt.prototype.tt = "SPLICE_AT";

  SpliceAt.prototype.mt = 'spliceAt';

  return SpliceAt;

})(RDBOp);

DeleteAt = (function(_super) {
  __extends(DeleteAt, _super);

  function DeleteAt() {
    return DeleteAt.__super__.constructor.apply(this, arguments);
  }

  DeleteAt.prototype.tt = "DELETE_AT";

  DeleteAt.prototype.mt = 'deleteAt';

  return DeleteAt;

})(RDBOp);

ChangeAt = (function(_super) {
  __extends(ChangeAt, _super);

  function ChangeAt() {
    return ChangeAt.__super__.constructor.apply(this, arguments);
  }

  ChangeAt.prototype.tt = "CHANGE_AT";

  ChangeAt.prototype.mt = 'changeAt';

  return ChangeAt;

})(RDBOp);

Contains = (function(_super) {
  __extends(Contains, _super);

  function Contains() {
    return Contains.__super__.constructor.apply(this, arguments);
  }

  Contains.prototype.tt = "CONTAINS";

  Contains.prototype.mt = 'contains';

  return Contains;

})(RDBOp);

HasFields = (function(_super) {
  __extends(HasFields, _super);

  function HasFields() {
    return HasFields.__super__.constructor.apply(this, arguments);
  }

  HasFields.prototype.tt = "HAS_FIELDS";

  HasFields.prototype.mt = 'hasFields';

  return HasFields;

})(RDBOp);

WithFields = (function(_super) {
  __extends(WithFields, _super);

  function WithFields() {
    return WithFields.__super__.constructor.apply(this, arguments);
  }

  WithFields.prototype.tt = "WITH_FIELDS";

  WithFields.prototype.mt = 'withFields';

  return WithFields;

})(RDBOp);

Keys = (function(_super) {
  __extends(Keys, _super);

  function Keys() {
    return Keys.__super__.constructor.apply(this, arguments);
  }

  Keys.prototype.tt = "KEYS";

  Keys.prototype.mt = 'keys';

  return Keys;

})(RDBOp);

Object_ = (function(_super) {
  __extends(Object_, _super);

  function Object_() {
    return Object_.__super__.constructor.apply(this, arguments);
  }

  Object_.prototype.tt = "OBJECT";

  Object_.prototype.mt = 'object';

  return Object_;

})(RDBOp);

Pluck = (function(_super) {
  __extends(Pluck, _super);

  function Pluck() {
    return Pluck.__super__.constructor.apply(this, arguments);
  }

  Pluck.prototype.tt = "PLUCK";

  Pluck.prototype.mt = 'pluck';

  return Pluck;

})(RDBOp);

IndexesOf = (function(_super) {
  __extends(IndexesOf, _super);

  function IndexesOf() {
    return IndexesOf.__super__.constructor.apply(this, arguments);
  }

  IndexesOf.prototype.tt = "INDEXES_OF";

  IndexesOf.prototype.mt = 'indexesOf';

  return IndexesOf;

})(RDBOp);

Without = (function(_super) {
  __extends(Without, _super);

  function Without() {
    return Without.__super__.constructor.apply(this, arguments);
  }

  Without.prototype.tt = "WITHOUT";

  Without.prototype.mt = 'without';

  return Without;

})(RDBOp);

Merge = (function(_super) {
  __extends(Merge, _super);

  function Merge() {
    return Merge.__super__.constructor.apply(this, arguments);
  }

  Merge.prototype.tt = "MERGE";

  Merge.prototype.mt = 'merge';

  return Merge;

})(RDBOp);

Between = (function(_super) {
  __extends(Between, _super);

  function Between() {
    return Between.__super__.constructor.apply(this, arguments);
  }

  Between.prototype.tt = "BETWEEN";

  Between.prototype.mt = 'between';

  return Between;

})(RDBOp);

Reduce = (function(_super) {
  __extends(Reduce, _super);

  function Reduce() {
    return Reduce.__super__.constructor.apply(this, arguments);
  }

  Reduce.prototype.tt = "REDUCE";

  Reduce.prototype.mt = 'reduce';

  return Reduce;

})(RDBOp);

Map = (function(_super) {
  __extends(Map, _super);

  function Map() {
    return Map.__super__.constructor.apply(this, arguments);
  }

  Map.prototype.tt = "MAP";

  Map.prototype.mt = 'map';

  return Map;

})(RDBOp);

Filter = (function(_super) {
  __extends(Filter, _super);

  function Filter() {
    return Filter.__super__.constructor.apply(this, arguments);
  }

  Filter.prototype.tt = "FILTER";

  Filter.prototype.mt = 'filter';

  return Filter;

})(RDBOp);

ConcatMap = (function(_super) {
  __extends(ConcatMap, _super);

  function ConcatMap() {
    return ConcatMap.__super__.constructor.apply(this, arguments);
  }

  ConcatMap.prototype.tt = "CONCATMAP";

  ConcatMap.prototype.mt = 'concatMap';

  return ConcatMap;

})(RDBOp);

OrderBy = (function(_super) {
  __extends(OrderBy, _super);

  function OrderBy() {
    return OrderBy.__super__.constructor.apply(this, arguments);
  }

  OrderBy.prototype.tt = "ORDERBY";

  OrderBy.prototype.mt = 'orderBy';

  return OrderBy;

})(RDBOp);

Distinct = (function(_super) {
  __extends(Distinct, _super);

  function Distinct() {
    return Distinct.__super__.constructor.apply(this, arguments);
  }

  Distinct.prototype.tt = "DISTINCT";

  Distinct.prototype.mt = 'distinct';

  return Distinct;

})(RDBOp);

Count = (function(_super) {
  __extends(Count, _super);

  function Count() {
    return Count.__super__.constructor.apply(this, arguments);
  }

  Count.prototype.tt = "COUNT";

  Count.prototype.mt = 'count';

  return Count;

})(RDBOp);

Union = (function(_super) {
  __extends(Union, _super);

  function Union() {
    return Union.__super__.constructor.apply(this, arguments);
  }

  Union.prototype.tt = "UNION";

  Union.prototype.mt = 'union';

  return Union;

})(RDBOp);

Nth = (function(_super) {
  __extends(Nth, _super);

  function Nth() {
    return Nth.__super__.constructor.apply(this, arguments);
  }

  Nth.prototype.tt = "NTH";

  Nth.prototype.mt = 'nth';

  return Nth;

})(RDBOp);

Match = (function(_super) {
  __extends(Match, _super);

  function Match() {
    return Match.__super__.constructor.apply(this, arguments);
  }

  Match.prototype.tt = "MATCH";

  Match.prototype.mt = 'match';

  return Match;

})(RDBOp);

Upcase = (function(_super) {
  __extends(Upcase, _super);

  function Upcase() {
    return Upcase.__super__.constructor.apply(this, arguments);
  }

  Upcase.prototype.tt = "UPCASE";

  Upcase.prototype.mt = 'upcase';

  return Upcase;

})(RDBOp);

Downcase = (function(_super) {
  __extends(Downcase, _super);

  function Downcase() {
    return Downcase.__super__.constructor.apply(this, arguments);
  }

  Downcase.prototype.tt = "DOWNCASE";

  Downcase.prototype.mt = 'downcase';

  return Downcase;

})(RDBOp);

IsEmpty = (function(_super) {
  __extends(IsEmpty, _super);

  function IsEmpty() {
    return IsEmpty.__super__.constructor.apply(this, arguments);
  }

  IsEmpty.prototype.tt = "IS_EMPTY";

  IsEmpty.prototype.mt = 'isEmpty';

  return IsEmpty;

})(RDBOp);

GroupedMapReduce = (function(_super) {
  __extends(GroupedMapReduce, _super);

  function GroupedMapReduce() {
    return GroupedMapReduce.__super__.constructor.apply(this, arguments);
  }

  GroupedMapReduce.prototype.tt = "GROUPED_MAP_REDUCE";

  GroupedMapReduce.prototype.mt = 'groupedMapReduce';

  return GroupedMapReduce;

})(RDBOp);

GroupBy = (function(_super) {
  __extends(GroupBy, _super);

  function GroupBy() {
    return GroupBy.__super__.constructor.apply(this, arguments);
  }

  GroupBy.prototype.tt = "GROUPBY";

  GroupBy.prototype.mt = 'groupBy';

  return GroupBy;

})(RDBOp);

GroupBy = (function(_super) {
  __extends(GroupBy, _super);

  function GroupBy() {
    return GroupBy.__super__.constructor.apply(this, arguments);
  }

  GroupBy.prototype.tt = "GROUPBY";

  GroupBy.prototype.mt = 'groupBy';

  return GroupBy;

})(RDBOp);

InnerJoin = (function(_super) {
  __extends(InnerJoin, _super);

  function InnerJoin() {
    return InnerJoin.__super__.constructor.apply(this, arguments);
  }

  InnerJoin.prototype.tt = "INNER_JOIN";

  InnerJoin.prototype.mt = 'innerJoin';

  return InnerJoin;

})(RDBOp);

OuterJoin = (function(_super) {
  __extends(OuterJoin, _super);

  function OuterJoin() {
    return OuterJoin.__super__.constructor.apply(this, arguments);
  }

  OuterJoin.prototype.tt = "OUTER_JOIN";

  OuterJoin.prototype.mt = 'outerJoin';

  return OuterJoin;

})(RDBOp);

EqJoin = (function(_super) {
  __extends(EqJoin, _super);

  function EqJoin() {
    return EqJoin.__super__.constructor.apply(this, arguments);
  }

  EqJoin.prototype.tt = "EQ_JOIN";

  EqJoin.prototype.mt = 'eqJoin';

  return EqJoin;

})(RDBOp);

Zip = (function(_super) {
  __extends(Zip, _super);

  function Zip() {
    return Zip.__super__.constructor.apply(this, arguments);
  }

  Zip.prototype.tt = "ZIP";

  Zip.prototype.mt = 'zip';

  return Zip;

})(RDBOp);

CoerceTo = (function(_super) {
  __extends(CoerceTo, _super);

  function CoerceTo() {
    return CoerceTo.__super__.constructor.apply(this, arguments);
  }

  CoerceTo.prototype.tt = "COERCE_TO";

  CoerceTo.prototype.mt = 'coerceTo';

  return CoerceTo;

})(RDBOp);

TypeOf = (function(_super) {
  __extends(TypeOf, _super);

  function TypeOf() {
    return TypeOf.__super__.constructor.apply(this, arguments);
  }

  TypeOf.prototype.tt = "TYPEOF";

  TypeOf.prototype.mt = 'typeOf';

  return TypeOf;

})(RDBOp);

Info = (function(_super) {
  __extends(Info, _super);

  function Info() {
    return Info.__super__.constructor.apply(this, arguments);
  }

  Info.prototype.tt = "INFO";

  Info.prototype.mt = 'info';

  return Info;

})(RDBOp);

Sample = (function(_super) {
  __extends(Sample, _super);

  function Sample() {
    return Sample.__super__.constructor.apply(this, arguments);
  }

  Sample.prototype.tt = "SAMPLE";

  Sample.prototype.mt = 'sample';

  return Sample;

})(RDBOp);

Update = (function(_super) {
  __extends(Update, _super);

  function Update() {
    return Update.__super__.constructor.apply(this, arguments);
  }

  Update.prototype.tt = "UPDATE";

  Update.prototype.mt = 'update';

  return Update;

})(RDBOp);

Delete = (function(_super) {
  __extends(Delete, _super);

  function Delete() {
    return Delete.__super__.constructor.apply(this, arguments);
  }

  Delete.prototype.tt = "DELETE";

  Delete.prototype.mt = 'delete';

  return Delete;

})(RDBOp);

Replace = (function(_super) {
  __extends(Replace, _super);

  function Replace() {
    return Replace.__super__.constructor.apply(this, arguments);
  }

  Replace.prototype.tt = "REPLACE";

  Replace.prototype.mt = 'replace';

  return Replace;

})(RDBOp);

Insert = (function(_super) {
  __extends(Insert, _super);

  function Insert() {
    return Insert.__super__.constructor.apply(this, arguments);
  }

  Insert.prototype.tt = "INSERT";

  Insert.prototype.mt = 'insert';

  return Insert;

})(RDBOp);

DbCreate = (function(_super) {
  __extends(DbCreate, _super);

  function DbCreate() {
    return DbCreate.__super__.constructor.apply(this, arguments);
  }

  DbCreate.prototype.tt = "DB_CREATE";

  DbCreate.prototype.st = 'dbCreate';

  return DbCreate;

})(RDBOp);

DbDrop = (function(_super) {
  __extends(DbDrop, _super);

  function DbDrop() {
    return DbDrop.__super__.constructor.apply(this, arguments);
  }

  DbDrop.prototype.tt = "DB_DROP";

  DbDrop.prototype.st = 'dbDrop';

  return DbDrop;

})(RDBOp);

DbList = (function(_super) {
  __extends(DbList, _super);

  function DbList() {
    return DbList.__super__.constructor.apply(this, arguments);
  }

  DbList.prototype.tt = "DB_LIST";

  DbList.prototype.st = 'dbList';

  return DbList;

})(RDBOp);

TableCreate = (function(_super) {
  __extends(TableCreate, _super);

  function TableCreate() {
    return TableCreate.__super__.constructor.apply(this, arguments);
  }

  TableCreate.prototype.tt = "TABLE_CREATE";

  TableCreate.prototype.mt = 'tableCreate';

  return TableCreate;

})(RDBOp);

TableDrop = (function(_super) {
  __extends(TableDrop, _super);

  function TableDrop() {
    return TableDrop.__super__.constructor.apply(this, arguments);
  }

  TableDrop.prototype.tt = "TABLE_DROP";

  TableDrop.prototype.mt = 'tableDrop';

  return TableDrop;

})(RDBOp);

TableList = (function(_super) {
  __extends(TableList, _super);

  function TableList() {
    return TableList.__super__.constructor.apply(this, arguments);
  }

  TableList.prototype.tt = "TABLE_LIST";

  TableList.prototype.mt = 'tableList';

  return TableList;

})(RDBOp);

IndexCreate = (function(_super) {
  __extends(IndexCreate, _super);

  function IndexCreate() {
    return IndexCreate.__super__.constructor.apply(this, arguments);
  }

  IndexCreate.prototype.tt = "INDEX_CREATE";

  IndexCreate.prototype.mt = 'indexCreate';

  return IndexCreate;

})(RDBOp);

IndexDrop = (function(_super) {
  __extends(IndexDrop, _super);

  function IndexDrop() {
    return IndexDrop.__super__.constructor.apply(this, arguments);
  }

  IndexDrop.prototype.tt = "INDEX_DROP";

  IndexDrop.prototype.mt = 'indexDrop';

  return IndexDrop;

})(RDBOp);

IndexList = (function(_super) {
  __extends(IndexList, _super);

  function IndexList() {
    return IndexList.__super__.constructor.apply(this, arguments);
  }

  IndexList.prototype.tt = "INDEX_LIST";

  IndexList.prototype.mt = 'indexList';

  return IndexList;

})(RDBOp);

IndexStatus = (function(_super) {
  __extends(IndexStatus, _super);

  function IndexStatus() {
    return IndexStatus.__super__.constructor.apply(this, arguments);
  }

  IndexStatus.prototype.tt = "INDEX_STATUS";

  IndexStatus.prototype.mt = 'indexStatus';

  return IndexStatus;

})(RDBOp);

IndexWait = (function(_super) {
  __extends(IndexWait, _super);

  function IndexWait() {
    return IndexWait.__super__.constructor.apply(this, arguments);
  }

  IndexWait.prototype.tt = "INDEX_WAIT";

  IndexWait.prototype.mt = 'indexWait';

  return IndexWait;

})(RDBOp);

Sync = (function(_super) {
  __extends(Sync, _super);

  function Sync() {
    return Sync.__super__.constructor.apply(this, arguments);
  }

  Sync.prototype.tt = "SYNC";

  Sync.prototype.mt = 'sync';

  return Sync;

})(RDBOp);

FunCall = (function(_super) {
  __extends(FunCall, _super);

  function FunCall() {
    return FunCall.__super__.constructor.apply(this, arguments);
  }

  FunCall.prototype.tt = "FUNCALL";

  FunCall.prototype.st = 'do';

  FunCall.prototype.compose = function(args) {
    if (args.length > 2) {
      return ['r.do(', intsp(args.slice(1)), ', ', args[0], ')'];
    } else {
      if (shouldWrap(this.args[1])) {
        args[1] = ['r(', args[1], ')'];
      }
      return [args[1], '.do(', args[0], ')'];
    }
  };

  return FunCall;

})(RDBOp);

Default = (function(_super) {
  __extends(Default, _super);

  function Default() {
    return Default.__super__.constructor.apply(this, arguments);
  }

  Default.prototype.tt = "DEFAULT";

  Default.prototype.mt = 'default';

  return Default;

})(RDBOp);

Branch = (function(_super) {
  __extends(Branch, _super);

  function Branch() {
    return Branch.__super__.constructor.apply(this, arguments);
  }

  Branch.prototype.tt = "BRANCH";

  Branch.prototype.st = 'branch';

  return Branch;

})(RDBOp);

Any = (function(_super) {
  __extends(Any, _super);

  function Any() {
    return Any.__super__.constructor.apply(this, arguments);
  }

  Any.prototype.tt = "ANY";

  Any.prototype.mt = 'or';

  return Any;

})(RDBOp);

All = (function(_super) {
  __extends(All, _super);

  function All() {
    return All.__super__.constructor.apply(this, arguments);
  }

  All.prototype.tt = "ALL";

  All.prototype.mt = 'and';

  return All;

})(RDBOp);

ForEach = (function(_super) {
  __extends(ForEach, _super);

  function ForEach() {
    return ForEach.__super__.constructor.apply(this, arguments);
  }

  ForEach.prototype.tt = "FOREACH";

  ForEach.prototype.mt = 'forEach';

  return ForEach;

})(RDBOp);

Func = (function(_super) {
  __extends(Func, _super);

  Func.prototype.tt = "FUNC";

  Func.nextVarId = 0;

  function Func(optargs, func) {
    var argNums, args, argsArr, body, i;
    args = [];
    argNums = [];
    i = 0;
    while (i < func.length) {
      argNums.push(Func.nextVarId);
      args.push(new Var({}, Func.nextVarId));
      Func.nextVarId++;
      i++;
    }
    body = func.apply(null, args);
    if (body === void 0) {
      throw new err.RqlDriverError("Anonymous function returned `undefined`. Did you forget a `return`?");
    }
    argsArr = (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(MakeArray, [{}].concat(__slice.call(argNums)), function(){});
    return Func.__super__.constructor.call(this, optargs, argsArr, body);
  }

  Func.prototype.compose = function(args) {
    var arg, i, varStr, _i, _len, _ref;
    if (hasImplicit(args[1]) === true) {
      return [args[1]];
    } else {
      varStr = "";
      _ref = args[0][1];
      for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
        arg = _ref[i];
        if (i % 2 === 0) {
          varStr += Var.prototype.compose(arg);
        } else {
          varStr += arg;
        }
      }
      return ['function(', varStr, ') { return ', args[1], '; }'];
    }
  };

  return Func;

})(RDBOp);

Asc = (function(_super) {
  __extends(Asc, _super);

  function Asc() {
    return Asc.__super__.constructor.apply(this, arguments);
  }

  Asc.prototype.tt = "ASC";

  Asc.prototype.st = 'asc';

  return Asc;

})(RDBOp);

Desc = (function(_super) {
  __extends(Desc, _super);

  function Desc() {
    return Desc.__super__.constructor.apply(this, arguments);
  }

  Desc.prototype.tt = "DESC";

  Desc.prototype.st = 'desc';

  return Desc;

})(RDBOp);

Literal = (function(_super) {
  __extends(Literal, _super);

  function Literal() {
    return Literal.__super__.constructor.apply(this, arguments);
  }

  Literal.prototype.tt = "LITERAL";

  Literal.prototype.st = 'literal';

  return Literal;

})(RDBOp);

ISO8601 = (function(_super) {
  __extends(ISO8601, _super);

  function ISO8601() {
    return ISO8601.__super__.constructor.apply(this, arguments);
  }

  ISO8601.prototype.tt = 'ISO8601';

  ISO8601.prototype.st = 'ISO8601';

  return ISO8601;

})(RDBOp);

ToISO8601 = (function(_super) {
  __extends(ToISO8601, _super);

  function ToISO8601() {
    return ToISO8601.__super__.constructor.apply(this, arguments);
  }

  ToISO8601.prototype.tt = 'TO_ISO8601';

  ToISO8601.prototype.mt = 'toISO8601';

  return ToISO8601;

})(RDBOp);

EpochTime = (function(_super) {
  __extends(EpochTime, _super);

  function EpochTime() {
    return EpochTime.__super__.constructor.apply(this, arguments);
  }

  EpochTime.prototype.tt = 'EPOCH_TIME';

  EpochTime.prototype.st = 'epochTime';

  return EpochTime;

})(RDBOp);

ToEpochTime = (function(_super) {
  __extends(ToEpochTime, _super);

  function ToEpochTime() {
    return ToEpochTime.__super__.constructor.apply(this, arguments);
  }

  ToEpochTime.prototype.tt = 'TO_EPOCH_TIME';

  ToEpochTime.prototype.mt = 'toEpochTime';

  return ToEpochTime;

})(RDBOp);

Now = (function(_super) {
  __extends(Now, _super);

  function Now() {
    return Now.__super__.constructor.apply(this, arguments);
  }

  Now.prototype.tt = 'NOW';

  Now.prototype.st = 'now';

  return Now;

})(RDBOp);

InTimezone = (function(_super) {
  __extends(InTimezone, _super);

  function InTimezone() {
    return InTimezone.__super__.constructor.apply(this, arguments);
  }

  InTimezone.prototype.tt = 'IN_TIMEZONE';

  InTimezone.prototype.mt = 'inTimezone';

  return InTimezone;

})(RDBOp);

During = (function(_super) {
  __extends(During, _super);

  function During() {
    return During.__super__.constructor.apply(this, arguments);
  }

  During.prototype.tt = 'DURING';

  During.prototype.mt = 'during';

  return During;

})(RDBOp);

RQLDate = (function(_super) {
  __extends(RQLDate, _super);

  function RQLDate() {
    return RQLDate.__super__.constructor.apply(this, arguments);
  }

  RQLDate.prototype.tt = 'DATE';

  RQLDate.prototype.mt = 'date';

  return RQLDate;

})(RDBOp);

TimeOfDay = (function(_super) {
  __extends(TimeOfDay, _super);

  function TimeOfDay() {
    return TimeOfDay.__super__.constructor.apply(this, arguments);
  }

  TimeOfDay.prototype.tt = 'TIME_OF_DAY';

  TimeOfDay.prototype.mt = 'timeOfDay';

  return TimeOfDay;

})(RDBOp);

Timezone = (function(_super) {
  __extends(Timezone, _super);

  function Timezone() {
    return Timezone.__super__.constructor.apply(this, arguments);
  }

  Timezone.prototype.tt = 'TIMEZONE';

  Timezone.prototype.mt = 'timezone';

  return Timezone;

})(RDBOp);

Year = (function(_super) {
  __extends(Year, _super);

  function Year() {
    return Year.__super__.constructor.apply(this, arguments);
  }

  Year.prototype.tt = 'YEAR';

  Year.prototype.mt = 'year';

  return Year;

})(RDBOp);

Month = (function(_super) {
  __extends(Month, _super);

  function Month() {
    return Month.__super__.constructor.apply(this, arguments);
  }

  Month.prototype.tt = 'MONTH';

  Month.prototype.mt = 'month';

  return Month;

})(RDBOp);

Day = (function(_super) {
  __extends(Day, _super);

  function Day() {
    return Day.__super__.constructor.apply(this, arguments);
  }

  Day.prototype.tt = 'DAY';

  Day.prototype.mt = 'day';

  return Day;

})(RDBOp);

DayOfWeek = (function(_super) {
  __extends(DayOfWeek, _super);

  function DayOfWeek() {
    return DayOfWeek.__super__.constructor.apply(this, arguments);
  }

  DayOfWeek.prototype.tt = 'DAY_OF_WEEK';

  DayOfWeek.prototype.mt = 'dayOfWeek';

  return DayOfWeek;

})(RDBOp);

DayOfYear = (function(_super) {
  __extends(DayOfYear, _super);

  function DayOfYear() {
    return DayOfYear.__super__.constructor.apply(this, arguments);
  }

  DayOfYear.prototype.tt = 'DAY_OF_YEAR';

  DayOfYear.prototype.mt = 'dayOfYear';

  return DayOfYear;

})(RDBOp);

Hours = (function(_super) {
  __extends(Hours, _super);

  function Hours() {
    return Hours.__super__.constructor.apply(this, arguments);
  }

  Hours.prototype.tt = 'HOURS';

  Hours.prototype.mt = 'hours';

  return Hours;

})(RDBOp);

Minutes = (function(_super) {
  __extends(Minutes, _super);

  function Minutes() {
    return Minutes.__super__.constructor.apply(this, arguments);
  }

  Minutes.prototype.tt = 'MINUTES';

  Minutes.prototype.mt = 'minutes';

  return Minutes;

})(RDBOp);

Seconds = (function(_super) {
  __extends(Seconds, _super);

  function Seconds() {
    return Seconds.__super__.constructor.apply(this, arguments);
  }

  Seconds.prototype.tt = 'SECONDS';

  Seconds.prototype.mt = 'seconds';

  return Seconds;

})(RDBOp);

Time = (function(_super) {
  __extends(Time, _super);

  function Time() {
    return Time.__super__.constructor.apply(this, arguments);
  }

  Time.prototype.tt = 'TIME';

  Time.prototype.st = 'time';

  return Time;

})(RDBOp);

rethinkdb.expr = varar(1, 2, function(val, nestingDepth) {
  var k, obj, v;
  if (nestingDepth == null) {
    nestingDepth = 20;
  }
  if (val === void 0) {
    throw new err.RqlDriverError("Cannot wrap undefined with r.expr().");
  }
  if (nestingDepth <= 0) {
    throw new err.RqlDriverError("Nesting depth limit exceeded");
  } else if (val instanceof TermBase) {
    return val;
  } else if (val instanceof Function) {
    return new Func({}, val);
  } else if (val instanceof Date) {
    return new ISO8601({}, val.toISOString());
  } else if (Array.isArray(val)) {
    val = (function() {
      var _i, _len, _results;
      _results = [];
      for (_i = 0, _len = val.length; _i < _len; _i++) {
        v = val[_i];
        _results.push(rethinkdb.expr(v, nestingDepth - 1));
      }
      return _results;
    })();
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(MakeArray, [{}].concat(__slice.call(val)), function(){});
  } else if (val === Object(val)) {
    obj = {};
    for (k in val) {
      if (!__hasProp.call(val, k)) continue;
      v = val[k];
      if (typeof v === 'undefined') {
        throw new err.RqlDriverError("Object field '" + k + "' may not be undefined");
      }
      obj[k] = rethinkdb.expr(v, nestingDepth - 1);
    }
    return new MakeObject(obj);
  } else {
    return new DatumTerm(val);
  }
});

rethinkdb.exprJSON = varar(1, 2, function(val, nestingDepth) {
  var k, v, wrapped;
  if (nestingDepth == null) {
    nestingDepth = 20;
  }
  if (nestingDepth <= 0) {
    throw new err.RqlDriverError("Nesting depth limit exceeded");
  }
  if (isJSON(val, nestingDepth - 1)) {
    return rethinkdb.json(JSON.stringify(val));
  } else if (val instanceof TermBase) {
    return val;
  } else if (val instanceof Date) {
    return rethinkdb.expr(val);
  } else {
    if (Array.isArray(val)) {
      wrapped = [];
    } else {
      wrapped = {};
    }
    for (k in val) {
      v = val[k];
      wrapped[k] = rethinkdb.exprJSON(v, nestingDepth - 1);
    }
    return rethinkdb.expr(wrapped, nestingDepth - 1);
  }
});

isJSON = function(val, nestingDepth) {
  var k, v;
  if (nestingDepth == null) {
    nestingDepth = 20;
  }
  if (nestingDepth <= 0) {
    throw new err.RqlDriverError("Nesting depth limit exceeded");
  }
  if (val instanceof TermBase) {
    return false;
  } else if (val instanceof Function) {
    return false;
  } else if (val instanceof Date) {
    return false;
  } else if (val instanceof Object) {
    for (k in val) {
      if (!__hasProp.call(val, k)) continue;
      v = val[k];
      if (!isJSON(v, nestingDepth - 1)) {
        return false;
      }
    }
    return true;
  } else {
    return true;
  }
};

rethinkdb.js = aropt(function(jssrc, opts) {
  return new JavaScript(opts, jssrc);
});

rethinkdb.json = ar(function(jsonsrc) {
  return new Json({}, jsonsrc);
});

rethinkdb.error = varar(0, 1, function() {
  var args;
  args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
  return (function(func, args, ctor) {
    ctor.prototype = func.prototype;
    var child = new ctor, result = func.apply(child, args);
    return Object(result) === result ? result : child;
  })(UserError, [{}].concat(__slice.call(args)), function(){});
});

rethinkdb.row = new ImplicitVar({});

rethinkdb.table = aropt(function(tblName, opts) {
  return new Table(opts, tblName);
});

rethinkdb.db = ar(function(dbName) {
  return new Db({}, dbName);
});

rethinkdb.dbCreate = ar(function(dbName) {
  return new DbCreate({}, dbName);
});

rethinkdb.dbDrop = ar(function(dbName) {
  return new DbDrop({}, dbName);
});

rethinkdb.dbList = ar(function() {
  return new DbList({});
});

rethinkdb.tableCreate = aropt(function(tblName, opts) {
  return new TableCreate(opts, tblName);
});

rethinkdb.tableDrop = ar(function(tblName) {
  return new TableDrop({}, tblName);
});

rethinkdb.tableList = ar(function() {
  return new TableList({});
});

rethinkdb["do"] = varar(1, null, function() {
  var args;
  args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
  return (function(func, args, ctor) {
    ctor.prototype = func.prototype;
    var child = new ctor, result = func.apply(child, args);
    return Object(result) === result ? result : child;
  })(FunCall, [{}, funcWrap(args.slice(-1)[0])].concat(__slice.call(args.slice(0, -1))), function(){});
});

rethinkdb.branch = ar(function(test, trueBranch, falseBranch) {
  return new Branch({}, test, trueBranch, falseBranch);
});

rethinkdb.count = {
  'COUNT': true
};

rethinkdb.sum = ar(function(attr) {
  return {
    'SUM': attr
  };
});

rethinkdb.avg = ar(function(attr) {
  return {
    'AVG': attr
  };
});

rethinkdb.asc = function(attr) {
  return new Asc({}, funcWrap(attr));
};

rethinkdb.desc = function(attr) {
  return new Desc({}, funcWrap(attr));
};

rethinkdb.eq = varar(2, null, function() {
  var args;
  args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
  return (function(func, args, ctor) {
    ctor.prototype = func.prototype;
    var child = new ctor, result = func.apply(child, args);
    return Object(result) === result ? result : child;
  })(Eq, [{}].concat(__slice.call(args)), function(){});
});

rethinkdb.ne = varar(2, null, function() {
  var args;
  args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
  return (function(func, args, ctor) {
    ctor.prototype = func.prototype;
    var child = new ctor, result = func.apply(child, args);
    return Object(result) === result ? result : child;
  })(Ne, [{}].concat(__slice.call(args)), function(){});
});

rethinkdb.lt = varar(2, null, function() {
  var args;
  args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
  return (function(func, args, ctor) {
    ctor.prototype = func.prototype;
    var child = new ctor, result = func.apply(child, args);
    return Object(result) === result ? result : child;
  })(Lt, [{}].concat(__slice.call(args)), function(){});
});

rethinkdb.le = varar(2, null, function() {
  var args;
  args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
  return (function(func, args, ctor) {
    ctor.prototype = func.prototype;
    var child = new ctor, result = func.apply(child, args);
    return Object(result) === result ? result : child;
  })(Le, [{}].concat(__slice.call(args)), function(){});
});

rethinkdb.gt = varar(2, null, function() {
  var args;
  args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
  return (function(func, args, ctor) {
    ctor.prototype = func.prototype;
    var child = new ctor, result = func.apply(child, args);
    return Object(result) === result ? result : child;
  })(Gt, [{}].concat(__slice.call(args)), function(){});
});

rethinkdb.ge = varar(2, null, function() {
  var args;
  args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
  return (function(func, args, ctor) {
    ctor.prototype = func.prototype;
    var child = new ctor, result = func.apply(child, args);
    return Object(result) === result ? result : child;
  })(Ge, [{}].concat(__slice.call(args)), function(){});
});

rethinkdb.or = varar(2, null, function() {
  var args;
  args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
  return (function(func, args, ctor) {
    ctor.prototype = func.prototype;
    var child = new ctor, result = func.apply(child, args);
    return Object(result) === result ? result : child;
  })(Any, [{}].concat(__slice.call(args)), function(){});
});

rethinkdb.and = varar(2, null, function() {
  var args;
  args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
  return (function(func, args, ctor) {
    ctor.prototype = func.prototype;
    var child = new ctor, result = func.apply(child, args);
    return Object(result) === result ? result : child;
  })(All, [{}].concat(__slice.call(args)), function(){});
});

rethinkdb.not = ar(function(x) {
  return new Not({}, x);
});

rethinkdb.add = varar(2, null, function() {
  var args;
  args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
  return (function(func, args, ctor) {
    ctor.prototype = func.prototype;
    var child = new ctor, result = func.apply(child, args);
    return Object(result) === result ? result : child;
  })(Add, [{}].concat(__slice.call(args)), function(){});
});

rethinkdb.sub = varar(2, null, function() {
  var args;
  args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
  return (function(func, args, ctor) {
    ctor.prototype = func.prototype;
    var child = new ctor, result = func.apply(child, args);
    return Object(result) === result ? result : child;
  })(Sub, [{}].concat(__slice.call(args)), function(){});
});

rethinkdb.mul = varar(2, null, function() {
  var args;
  args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
  return (function(func, args, ctor) {
    ctor.prototype = func.prototype;
    var child = new ctor, result = func.apply(child, args);
    return Object(result) === result ? result : child;
  })(Mul, [{}].concat(__slice.call(args)), function(){});
});

rethinkdb.div = varar(2, null, function() {
  var args;
  args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
  return (function(func, args, ctor) {
    ctor.prototype = func.prototype;
    var child = new ctor, result = func.apply(child, args);
    return Object(result) === result ? result : child;
  })(Div, [{}].concat(__slice.call(args)), function(){});
});

rethinkdb.mod = ar(function(a, b) {
  return new Mod({}, a, b);
});

rethinkdb.typeOf = ar(function(val) {
  return new TypeOf({}, val);
});

rethinkdb.info = ar(function(val) {
  return new Info({}, val);
});

rethinkdb.literal = varar(0, 1, function() {
  var args;
  args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
  return (function(func, args, ctor) {
    ctor.prototype = func.prototype;
    var child = new ctor, result = func.apply(child, args);
    return Object(result) === result ? result : child;
  })(Literal, [{}].concat(__slice.call(args)), function(){});
});

rethinkdb.ISO8601 = aropt(function(str, opts) {
  return new ISO8601(opts, str);
});

rethinkdb.epochTime = ar(function(num) {
  return new EpochTime({}, num);
});

rethinkdb.now = ar(function() {
  return new Now({});
});

rethinkdb.time = varar(3, 7, function() {
  var args;
  args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
  return (function(func, args, ctor) {
    ctor.prototype = func.prototype;
    var child = new ctor, result = func.apply(child, args);
    return Object(result) === result ? result : child;
  })(Time, [{}].concat(__slice.call(args)), function(){});
});

rethinkdb.monday = new ((function(_super) {
  __extends(_Class, _super);

  function _Class() {
    return _Class.__super__.constructor.apply(this, arguments);
  }

  _Class.prototype.tt = 'MONDAY';

  return _Class;

})(RDBOp))();

rethinkdb.tuesday = new ((function(_super) {
  __extends(_Class, _super);

  function _Class() {
    return _Class.__super__.constructor.apply(this, arguments);
  }

  _Class.prototype.tt = 'TUESDAY';

  return _Class;

})(RDBOp))();

rethinkdb.wednesday = new ((function(_super) {
  __extends(_Class, _super);

  function _Class() {
    return _Class.__super__.constructor.apply(this, arguments);
  }

  _Class.prototype.tt = 'WEDNESDAY';

  return _Class;

})(RDBOp))();

rethinkdb.thursday = new ((function(_super) {
  __extends(_Class, _super);

  function _Class() {
    return _Class.__super__.constructor.apply(this, arguments);
  }

  _Class.prototype.tt = 'THURSDAY';

  return _Class;

})(RDBOp))();

rethinkdb.friday = new ((function(_super) {
  __extends(_Class, _super);

  function _Class() {
    return _Class.__super__.constructor.apply(this, arguments);
  }

  _Class.prototype.tt = 'FRIDAY';

  return _Class;

})(RDBOp))();

rethinkdb.saturday = new ((function(_super) {
  __extends(_Class, _super);

  function _Class() {
    return _Class.__super__.constructor.apply(this, arguments);
  }

  _Class.prototype.tt = 'SATURDAY';

  return _Class;

})(RDBOp))();

rethinkdb.sunday = new ((function(_super) {
  __extends(_Class, _super);

  function _Class() {
    return _Class.__super__.constructor.apply(this, arguments);
  }

  _Class.prototype.tt = 'SUNDAY';

  return _Class;

})(RDBOp))();

rethinkdb.january = new ((function(_super) {
  __extends(_Class, _super);

  function _Class() {
    return _Class.__super__.constructor.apply(this, arguments);
  }

  _Class.prototype.tt = 'JANUARY';

  return _Class;

})(RDBOp))();

rethinkdb.february = new ((function(_super) {
  __extends(_Class, _super);

  function _Class() {
    return _Class.__super__.constructor.apply(this, arguments);
  }

  _Class.prototype.tt = 'FEBRUARY';

  return _Class;

})(RDBOp))();

rethinkdb.march = new ((function(_super) {
  __extends(_Class, _super);

  function _Class() {
    return _Class.__super__.constructor.apply(this, arguments);
  }

  _Class.prototype.tt = 'MARCH';

  return _Class;

})(RDBOp))();

rethinkdb.april = new ((function(_super) {
  __extends(_Class, _super);

  function _Class() {
    return _Class.__super__.constructor.apply(this, arguments);
  }

  _Class.prototype.tt = 'APRIL';

  return _Class;

})(RDBOp))();

rethinkdb.may = new ((function(_super) {
  __extends(_Class, _super);

  function _Class() {
    return _Class.__super__.constructor.apply(this, arguments);
  }

  _Class.prototype.tt = 'MAY';

  return _Class;

})(RDBOp))();

rethinkdb.june = new ((function(_super) {
  __extends(_Class, _super);

  function _Class() {
    return _Class.__super__.constructor.apply(this, arguments);
  }

  _Class.prototype.tt = 'JUNE';

  return _Class;

})(RDBOp))();

rethinkdb.july = new ((function(_super) {
  __extends(_Class, _super);

  function _Class() {
    return _Class.__super__.constructor.apply(this, arguments);
  }

  _Class.prototype.tt = 'JULY';

  return _Class;

})(RDBOp))();

rethinkdb.august = new ((function(_super) {
  __extends(_Class, _super);

  function _Class() {
    return _Class.__super__.constructor.apply(this, arguments);
  }

  _Class.prototype.tt = 'AUGUST';

  return _Class;

})(RDBOp))();

rethinkdb.september = new ((function(_super) {
  __extends(_Class, _super);

  function _Class() {
    return _Class.__super__.constructor.apply(this, arguments);
  }

  _Class.prototype.tt = 'SEPTEMBER';

  return _Class;

})(RDBOp))();

rethinkdb.october = new ((function(_super) {
  __extends(_Class, _super);

  function _Class() {
    return _Class.__super__.constructor.apply(this, arguments);
  }

  _Class.prototype.tt = 'OCTOBER';

  return _Class;

})(RDBOp))();

rethinkdb.november = new ((function(_super) {
  __extends(_Class, _super);

  function _Class() {
    return _Class.__super__.constructor.apply(this, arguments);
  }

  _Class.prototype.tt = 'NOVEMBER';

  return _Class;

})(RDBOp))();

rethinkdb.december = new ((function(_super) {
  __extends(_Class, _super);

  function _Class() {
    return _Class.__super__.constructor.apply(this, arguments);
  }

  _Class.prototype.tt = 'DECEMBER';

  return _Class;

})(RDBOp))();

rethinkdb.object = varar(0, null, function() {
  var args;
  args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
  return (function(func, args, ctor) {
    ctor.prototype = func.prototype;
    var child = new ctor, result = func.apply(child, args);
    return Object(result) === result ? result : child;
  })(Object_, [{}].concat(__slice.call(args)), function(){});
});

module.exports = rethinkdb;

},{"./errors":11,"./util":20}],10:[function(require,module,exports){
// Generated by CoffeeScript 1.7.1
var ArrayResult, Cursor, IterableResult, ar, aropt, deconstructDatum, err, mkErr, nextCbCheck, pb, setImmediate, util, varar,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

err = require('./errors');

util = require('./util');

pb = require('./protobuf');

ar = util.ar;

varar = util.varar;

aropt = util.aropt;

deconstructDatum = util.deconstructDatum;

mkErr = util.mkErr;

if (typeof setImmediate === "undefined" || setImmediate === null) {
  setImmediate = function(cb) {
    return setTimeout(cb, 0);
  };
}

IterableResult = (function() {
  function IterableResult() {}

  IterableResult.prototype.hasNext = function() {
    throw "Abstract Method";
  };

  IterableResult.prototype.next = function() {
    throw "Abstract Method";
  };

  IterableResult.prototype.each = varar(1, 2, function(cb, onFinished) {
    var brk, n;
    if (typeof cb !== 'function') {
      throw new err.RqlDriverError("First argument to each must be a function.");
    }
    if ((onFinished != null) && typeof onFinished !== 'function') {
      throw new err.RqlDriverError("Optional second argument to each must be a function.");
    }
    brk = false;
    n = (function(_this) {
      return function() {
        if (!brk && _this.hasNext()) {
          return _this.next(function(err, row) {
            brk = cb(err, row) === false;
            return n();
          });
        } else if (onFinished != null) {
          return onFinished();
        }
      };
    })(this);
    return n();
  });

  IterableResult.prototype.toArray = ar(function(cb) {
    var arr;
    if (typeof cb !== 'function') {
      throw new err.RqlDriverError("Argument to toArray must be a function.");
    }
    arr = [];
    if (!this.hasNext()) {
      cb(null, arr);
    }
    return this.each((function(_this) {
      return function(err, row) {
        if (err != null) {
          cb(err);
        } else {
          arr.push(row);
        }
        if (!_this.hasNext()) {
          return cb(null, arr);
        }
      };
    })(this));
  });

  return IterableResult;

})();

Cursor = (function(_super) {
  __extends(Cursor, _super);

  Cursor.prototype.stackSize = 100;

  function Cursor(conn, token, opts, root) {
    this._conn = conn;
    this._token = token;
    this._opts = opts;
    this._root = root;
    this._responses = [];
    this._responseIndex = 0;
    this._outstandingRequests = 1;
    this._iterations = 0;
    this._endFlag = false;
    this._contFlag = false;
    this._cont = null;
    this._cbQueue = [];
  }

  Cursor.prototype._addResponse = function(response) {
    this._responses.push(response);
    this._outstandingRequests -= 1;
    pb.ResponseTypeSwitch(response, {
      "SUCCESS_PARTIAL": (function(_this) {
        return function() {
          return _this._endFlag = false;
        };
      })(this)
    }, (function(_this) {
      return function() {
        return _this._endFlag = true;
      };
    })(this));
    this._contFlag = false;
    this._promptNext();
    return this;
  };

  Cursor.prototype._getCallback = function() {
    var cb, immediateCb;
    this._iterations += 1;
    cb = this._cbQueue.shift();
    if (this._iterations % this.stackSize === this.stackSize - 1) {
      immediateCb = (function(err, row) {
        return setImmediate(function() {
          return cb(err, row);
        });
      });
      return immediateCb;
    } else {
      return cb;
    }
  };

  Cursor.prototype._handleRow = function() {
    var cb, response, row;
    response = this._responses[0];
    row = deconstructDatum(response.response[this._responseIndex], this._opts);
    cb = this._getCallback();
    this._responseIndex += 1;
    if (this._responseIndex === response.response.length) {
      this._responses.shift();
      this._responseIndex = 0;
    }
    return cb(null, row);
  };

  Cursor.prototype._promptNext = function() {
    var cb, response;
    while (this._cbQueue[0] != null) {
      if (!this.hasNext()) {
        cb = this._getCallback();
        cb(new err.RqlDriverError("No more rows in the cursor."));
      } else {
        response = this._responses[0];
        if (this._responses.length === 1) {
          this._promptCont();
          if (!this._endFlag && (response.response != null) && this._responseIndex === response.response.length - 1) {
            return;
          }
        }
        pb.ResponseTypeSwitch(response, {
          "SUCCESS_PARTIAL": (function(_this) {
            return function() {
              return _this._handleRow();
            };
          })(this),
          "SUCCESS_SEQUENCE": (function(_this) {
            return function() {
              if (response.response.length === 0) {
                return _this._responses.shift();
              } else {
                return _this._handleRow();
              }
            };
          })(this),
          "COMPILE_ERROR": (function(_this) {
            return function() {
              _this._responses.shift();
              cb = _this._getCallback();
              return cb(mkErr(err.RqlCompileError, response, _this._root));
            };
          })(this),
          "CLIENT_ERROR": (function(_this) {
            return function() {
              _this._responses.shift();
              cb = _this._getCallback();
              return cb(mkErr(err.RqlClientError, response, _this._root));
            };
          })(this),
          "RUNTIME_ERROR": (function(_this) {
            return function() {
              _this._responses.shift();
              cb = _this._getCallback();
              return cb(mkErr(err.RqlRuntimeError, response, _this._root));
            };
          })(this)
        }, (function(_this) {
          return function() {
            _this._responses.shift();
            cb = _this._getCallback();
            return cb(new err.RqlDriverError("Unknown response type for cursor"));
          };
        })(this));
      }
    }
  };

  Cursor.prototype._promptCont = function() {
    if (!this._contFlag && !this._endFlag) {
      this._contFlag = true;
      this._outstandingRequests += 1;
      return this._conn._continueQuery(this._token);
    }
  };

  Cursor.prototype.hasNext = ar(function() {
    return (this._responses[0] != null) && this._responses[0].response.length > 0;
  });

  Cursor.prototype.next = ar(function(cb) {
    nextCbCheck(cb);
    this._cbQueue.push(cb);
    return this._promptNext();
  });

  Cursor.prototype.close = ar(function() {
    if (!this._endFlag) {
      this._outstandingRequests += 1;
      return this._conn._endQuery(this._token);
    }
  });

  Cursor.prototype.toString = ar(function() {
    return "[object Cursor]";
  });

  return Cursor;

})(IterableResult);

ArrayResult = (function(_super) {
  __extends(ArrayResult, _super);

  function ArrayResult() {
    return ArrayResult.__super__.constructor.apply(this, arguments);
  }

  ArrayResult.prototype.stackSize = 100;

  ArrayResult.prototype.hasNext = ar(function() {
    if (this.__index == null) {
      this.__index = 0;
    }
    return this.__index < this.length;
  });

  ArrayResult.prototype.next = ar(function(cb) {
    var self;
    nextCbCheck(cb);
    if (this.__index == null) {
      this.__index = 0;
    }
    if (this.hasNext() === true) {
      self = this;
      if (self.__index % this.stackSize === this.stackSize - 1) {
        return setImmediate(function() {
          return cb(null, self[self.__index++]);
        });
      } else {
        return cb(null, self[self.__index++]);
      }
    } else {
      return cb(new err.RqlDriverError("No more rows in the cursor."));
    }
  });

  ArrayResult.prototype.toArray = ar(function(cb) {
    if (this.__index != null) {
      return cb(null, this.slice(this.__index, this.length));
    } else {
      return cb(null, this);
    }
  });

  ArrayResult.prototype.makeIterable = function(response) {
    var method, name, _ref;
    _ref = ArrayResult.prototype;
    for (name in _ref) {
      method = _ref[name];
      if (name !== 'constructor') {
        response.__proto__[name] = method;
      }
    }
    return response;
  };

  return ArrayResult;

})(IterableResult);

nextCbCheck = function(cb) {
  if (typeof cb !== 'function') {
    throw new err.RqlDriverError("Argument to next must be a function.");
  }
};

module.exports.deconstructDatum = deconstructDatum;

module.exports.Cursor = Cursor;

module.exports.makeIterable = ArrayResult.prototype.makeIterable;

},{"./errors":11,"./protobuf":17,"./util":20}],11:[function(require,module,exports){
// Generated by CoffeeScript 1.7.1
var RqlClientError, RqlCompileError, RqlDriverError, RqlQueryPrinter, RqlRuntimeError, RqlServerError,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

RqlDriverError = (function(_super) {
  __extends(RqlDriverError, _super);

  function RqlDriverError(msg) {
    this.name = this.constructor.name;
    this.msg = msg;
    this.message = msg;
  }

  return RqlDriverError;

})(Error);

RqlServerError = (function(_super) {
  __extends(RqlServerError, _super);

  function RqlServerError(msg, term, frames) {
    this.name = this.constructor.name;
    this.msg = msg;
    this.frames = frames.slice(0);
    if (term != null) {
      this.message = "" + msg + " in:\n" + (RqlQueryPrinter.prototype.printQuery(term)) + "\n" + (RqlQueryPrinter.prototype.printCarrots(term, frames));
    } else {
      this.message = "" + msg;
    }
  }

  return RqlServerError;

})(Error);

RqlRuntimeError = (function(_super) {
  __extends(RqlRuntimeError, _super);

  function RqlRuntimeError() {
    return RqlRuntimeError.__super__.constructor.apply(this, arguments);
  }

  return RqlRuntimeError;

})(RqlServerError);

RqlCompileError = (function(_super) {
  __extends(RqlCompileError, _super);

  function RqlCompileError() {
    return RqlCompileError.__super__.constructor.apply(this, arguments);
  }

  return RqlCompileError;

})(RqlServerError);

RqlClientError = (function(_super) {
  __extends(RqlClientError, _super);

  function RqlClientError() {
    return RqlClientError.__super__.constructor.apply(this, arguments);
  }

  return RqlClientError;

})(RqlServerError);

RqlQueryPrinter = (function() {
  var carrotify, composeCarrots, composeTerm, joinTree;

  function RqlQueryPrinter() {}

  RqlQueryPrinter.prototype.printQuery = function(term) {
    var tree;
    tree = composeTerm(term);
    return joinTree(tree);
  };

  composeTerm = function(term) {
    var arg, args, key, optargs, _ref;
    args = (function() {
      var _i, _len, _ref, _results;
      _ref = term.args;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        arg = _ref[_i];
        _results.push(composeTerm(arg));
      }
      return _results;
    })();
    optargs = {};
    _ref = term.optargs;
    for (key in _ref) {
      if (!__hasProp.call(_ref, key)) continue;
      arg = _ref[key];
      optargs[key] = composeTerm(arg);
    }
    return term.compose(args, optargs);
  };

  RqlQueryPrinter.prototype.printCarrots = function(term, frames) {
    var tree;
    tree = composeCarrots(term, frames);
    return (joinTree(tree)).replace(/[^\^]/g, ' ');
  };

  composeCarrots = function(term, frames) {
    var arg, argNum, args, i, key, optargs, _ref;
    argNum = frames.shift();
    if (argNum == null) {
      argNum = -1;
    }
    args = (function() {
      var _i, _len, _ref, _results;
      _ref = term.args;
      _results = [];
      for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
        arg = _ref[i];
        if (i === argNum) {
          _results.push(composeCarrots(arg, frames));
        } else {
          _results.push(composeTerm(arg));
        }
      }
      return _results;
    })();
    optargs = {};
    _ref = term.optargs;
    for (key in _ref) {
      if (!__hasProp.call(_ref, key)) continue;
      arg = _ref[key];
      optargs[key] = key === argNum ? composeCarrots(arg, frames) : composeTerm(arg);
    }
    if (argNum !== -1) {
      return term.compose(args, optargs);
    } else {
      return carrotify(term.compose(args, optargs));
    }
  };

  carrotify = function(tree) {
    return (joinTree(tree)).replace(/./g, '^');
  };

  joinTree = function(tree) {
    var str, term, _i, _len;
    str = '';
    for (_i = 0, _len = tree.length; _i < _len; _i++) {
      term = tree[_i];
      if (Array.isArray(term)) {
        str += joinTree(term);
      } else {
        str += term;
      }
    }
    return str;
  };

  return RqlQueryPrinter;

})();

module.exports.RqlDriverError = RqlDriverError;

module.exports.RqlRuntimeError = RqlRuntimeError;

module.exports.RqlCompileError = RqlCompileError;

module.exports.RqlClientError = RqlClientError;

module.exports.printQuery = RqlQueryPrinter.prototype.printQuery;

},{}],12:[function(require,module,exports){
(function (process,Buffer){// Generated by CoffeeScript 1.7.1
var Connection, HttpConnection, TcpConnection, ar, aropt, cursors, deconstructDatum, err, events, mkAtom, mkErr, mkSeq, net, pb, r, util, varar,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  __slice = [].slice;

net = require('net');

events = require('events');

util = require('./util');

err = require('./errors');

cursors = require('./cursor');

pb = require('./protobuf');

r = require('./ast');

ar = util.ar;

varar = util.varar;

aropt = util.aropt;

deconstructDatum = util.deconstructDatum;

mkAtom = util.mkAtom;

mkErr = util.mkErr;

mkSeq = util.mkSeq;

Connection = (function(_super) {
  __extends(Connection, _super);

  Connection.prototype.DEFAULT_HOST = 'localhost';

  Connection.prototype.DEFAULT_PORT = 28015;

  Connection.prototype.DEFAULT_AUTH_KEY = '';

  Connection.prototype.DEFAULT_TIMEOUT = 20;

  function Connection(host, callback) {
    var conCallback, errCallback;
    if (typeof host === 'undefined') {
      host = {};
    } else if (typeof host === 'string') {
      host = {
        host: host
      };
    }
    this.host = host.host || this.DEFAULT_HOST;
    this.port = host.port || this.DEFAULT_PORT;
    this.db = host.db;
    this.authKey = host.authKey || this.DEFAULT_AUTH_KEY;
    this.timeout = host.timeout || this.DEFAULT_TIMEOUT;
    this.outstandingCallbacks = {};
    this.nextToken = 1;
    this.open = false;
    this.buffer = new Buffer(0);
    this._events = this._events || {};
    errCallback = (function(_this) {
      return function(e) {
        _this.removeListener('connect', conCallback);
        if (e instanceof err.RqlDriverError) {
          return callback(e);
        } else {
          return callback(new err.RqlDriverError("Could not connect to " + _this.host + ":" + _this.port + ".\n" + e.message));
        }
      };
    })(this);
    this.once('error', errCallback);
    conCallback = (function(_this) {
      return function() {
        _this.removeListener('error', errCallback);
        _this.open = true;
        return callback(null, _this);
      };
    })(this);
    this.once('connect', conCallback);
  }

  Connection.prototype._data = function(buf) {
    var response, responseBuffer, responseLength, _results;
    this.buffer = Buffer.concat([this.buffer, buf]);
    _results = [];
    while (this.buffer.length >= 4) {
      responseLength = this.buffer.readUInt32LE(0);
      if (!(this.buffer.length >= (4 + responseLength))) {
        break;
      }
      responseBuffer = this.buffer.slice(4, responseLength + 4);
      response = pb.ParseResponse(responseBuffer);
      this._processResponse(response);
      _results.push(this.buffer = this.buffer.slice(4 + responseLength));
    }
    return _results;
  };

  Connection.prototype._delQuery = function(token) {
    delete this.outstandingCallbacks[token];
    if (Object.keys(this.outstandingCallbacks).length < 1 && !this.open) {
      return this.cancel();
    }
  };

  Connection.prototype._processResponse = function(response) {
    var cb, cursor, opts, profile, root, token, _ref;
    token = response.token;
    profile = response.profile;
    if (profile != null) {
      profile = deconstructDatum(profile, {});
    }
    if (this.outstandingCallbacks[token] != null) {
      _ref = this.outstandingCallbacks[token], cb = _ref.cb, root = _ref.root, cursor = _ref.cursor, opts = _ref.opts;
      if (cursor != null) {
        cursor._addResponse(response);
        if (cursor._endFlag && cursor._outstandingRequests === 0) {
          return this._delQuery(token);
        }
      } else if (cb != null) {
        return pb.ResponseTypeSwitch(response, {
          "COMPILE_ERROR": (function(_this) {
            return function() {
              cb(mkErr(err.RqlCompileError, response, root));
              return _this._delQuery(token);
            };
          })(this),
          "CLIENT_ERROR": (function(_this) {
            return function() {
              cb(mkErr(err.RqlClientError, response, root));
              return _this._delQuery(token);
            };
          })(this),
          "RUNTIME_ERROR": (function(_this) {
            return function() {
              cb(mkErr(err.RqlRuntimeError, response, root));
              return _this._delQuery(token);
            };
          })(this),
          "SUCCESS_ATOM": (function(_this) {
            return function() {
              response = mkAtom(response, opts);
              if (Array.isArray(response)) {
                response = cursors.makeIterable(response);
              }
              if (profile != null) {
                response = {
                  profile: profile,
                  value: response
                };
              }
              cb(null, response);
              return _this._delQuery(token);
            };
          })(this),
          "SUCCESS_PARTIAL": (function(_this) {
            return function() {
              cursor = new cursors.Cursor(_this, token, opts, root);
              _this.outstandingCallbacks[token].cursor = cursor;
              if (profile != null) {
                return cb(null, {
                  profile: profile,
                  value: cursor._addResponse(response)
                });
              } else {
                return cb(null, cursor._addResponse(response));
              }
            };
          })(this),
          "SUCCESS_SEQUENCE": (function(_this) {
            return function() {
              cursor = new cursors.Cursor(_this, token, opts, root);
              _this._delQuery(token);
              if (profile != null) {
                return cb(null, {
                  profile: profile,
                  value: cursor._addResponse(response)
                });
              } else {
                return cb(null, cursor._addResponse(response));
              }
            };
          })(this),
          "WAIT_COMPLETE": (function(_this) {
            return function() {
              _this._delQuery(token);
              return cb(null, null);
            };
          })(this)
        }, (function(_this) {
          return function() {
            return cb(new err.RqlDriverError("Unknown response type"));
          };
        })(this));
      }
    } else {
      return this.emit('error', new err.RqlDriverError("Unexpected token " + token + "."));
    }
  };

  Connection.prototype.close = varar(0, 2, function(optsOrCallback, callback) {
    var cb, key, noreplyWait, opts, wrappedCb;
    if (callback != null) {
      opts = optsOrCallback;
      if (Object.prototype.toString.call(opts) !== '[object Object]') {
        throw new err.RqlDriverError("First argument to two-argument `close` must be an object.");
      }
      cb = callback;
    } else if (Object.prototype.toString.call(optsOrCallback) === '[object Object]') {
      opts = optsOrCallback;
      cb = null;
    } else {
      opts = {};
      cb = optsOrCallback;
    }
    for (key in opts) {
      if (!__hasProp.call(opts, key)) continue;
      if (key !== 'noreplyWait') {
        throw new err.RqlDriverError("First argument to two-argument `close` must be { noreplyWait: <bool> }.");
      }
    }
    if (!((cb == null) || typeof cb === 'function')) {
      throw new err.RqlDriverError("Final argument to `close` must be a callback function or object.");
    }
    wrappedCb = (function(_this) {
      return function() {
        var args;
        args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        _this.open = false;
        if (cb != null) {
          return cb.apply(null, args);
        }
      };
    })(this);
    noreplyWait = ((opts.noreplyWait == null) || opts.noreplyWait) && this.open;
    if (noreplyWait) {
      return this.noreplyWait(wrappedCb);
    } else {
      return wrappedCb();
    }
  });

  Connection.prototype.noreplyWait = ar(function(callback) {
    var query, token;
    if (typeof callback !== 'function') {
      throw new err.RqlDriverError("First argument to noreplyWait must be a callback function.");
    }
    if (!this.open) {
      callback(new err.RqlDriverError("Connection is closed."));
      return;
    }
    token = this.nextToken++;
    query = {};
    query.type = "NOREPLY_WAIT";
    query.token = token;
    this.outstandingCallbacks[token] = {
      cb: callback,
      root: null,
      opts: null
    };
    return this._sendQuery(query);
  });

  Connection.prototype.cancel = ar(function() {
    return this.outstandingCallbacks = {};
  });

  Connection.prototype.reconnect = varar(1, 2, function(optsOrCallback, callback) {
    var cb, closeCb, opts;
    if (callback != null) {
      opts = optsOrCallback;
      cb = callback;
    } else {
      opts = {};
      cb = optsOrCallback;
    }
    if (typeof cb !== 'function') {
      throw new err.RqlDriverError("Final argument to `reconnect` must be a callback function.");
    }
    closeCb = (function(_this) {
      return function(err) {
        var constructCb;
        if (err != null) {
          return cb(err);
        } else {
          constructCb = function() {
            return _this.constructor.call(_this, {
              host: _this.host,
              port: _this.port
            }, cb);
          };
          return setTimeout(constructCb, 0);
        }
      };
    })(this);
    return this.close(opts, closeCb);
  });

  Connection.prototype.use = ar(function(db) {
    return this.db = db;
  });

  Connection.prototype._start = function(term, cb, opts) {
    var pair, query, token;
    if (!this.open) {
      throw new err.RqlDriverError("Connection is closed.");
    }
    token = this.nextToken++;
    query = {
      'global_optargs': []
    };
    query.type = "START";
    query.query = term.build();
    query.token = token;
    if (this.db != null) {
      pair = {
        key: 'db',
        val: r.db(this.db).build()
      };
      query.global_optargs.push(pair);
    }
    if (opts.useOutdated != null) {
      pair = {
        key: 'use_outdated',
        val: r.expr(!!opts.useOutdated).build()
      };
      query.global_optargs.push(pair);
    }
    if (opts.noreply != null) {
      pair = {
        key: 'noreply',
        val: r.expr(!!opts.noreply).build()
      };
      query.global_optargs.push(pair);
    }
    if (opts.profile != null) {
      pair = {
        key: 'profile',
        val: r.expr(!!opts.profile).build()
      };
      query.global_optargs.push(pair);
    }
    if (opts.durability != null) {
      pair = {
        key: 'durability',
        val: r.expr(opts.durability).build()
      };
      query.global_optargs.push(pair);
    }
    if ((opts.noreply == null) || !opts.noreply) {
      this.outstandingCallbacks[token] = {
        cb: cb,
        root: term,
        opts: opts
      };
    }
    this._sendQuery(query);
    if ((opts.noreply != null) && opts.noreply && typeof cb === 'function') {
      return cb(null);
    }
  };

  Connection.prototype._continueQuery = function(token) {
    var query;
    query = {
      type: "CONTINUE",
      token: token
    };
    return this._sendQuery(query);
  };

  Connection.prototype._endQuery = function(token) {
    var query;
    query = {
      type: "STOP",
      token: token
    };
    return this._sendQuery(query);
  };

  Connection.prototype._sendQuery = function(query) {
    var data, i, lengthBuffer, totalBuf;
    query.accepts_r_json = true;
    data = pb.SerializeQuery(query);
    if (pb.protobuf_implementation === 'cpp') {
      lengthBuffer = new Buffer(4);
      lengthBuffer.writeUInt32LE(data.length, 0);
      totalBuf = Buffer.concat([lengthBuffer, data]);
    } else {
      totalBuf = new Buffer(data.length + 4);
      totalBuf.writeUInt32LE(data.length, 0);
      i = 0;
      while (i < data.length) {
        totalBuf.set(i + 4, data.get(i));
        i++;
      }
    }
    return this.write(totalBuf);
  };

  return Connection;

})(events.EventEmitter);

TcpConnection = (function(_super) {
  __extends(TcpConnection, _super);

  TcpConnection.isAvailable = function() {
    return !process.browser;
  };

  function TcpConnection(host, callback) {
    var timeout;
    if (!TcpConnection.isAvailable()) {
      throw new err.RqlDriverError("TCP sockets are not available in this environment");
    }
    TcpConnection.__super__.constructor.call(this, host, callback);
    if (this.rawSocket != null) {
      this.close({
        noreplyWait: false
      });
    }
    this.rawSocket = net.connect(this.port, this.host);
    this.rawSocket.setNoDelay();
    timeout = setTimeout(((function(_this) {
      return function() {
        _this.rawSocket.destroy();
        return _this.emit('error', new err.RqlDriverError("Handshake timedout"));
      };
    })(this)), this.timeout * 1000);
    this.rawSocket.once('error', (function(_this) {
      return function() {
        return clearTimeout(timeout);
      };
    })(this));
    this.rawSocket.once('connect', (function(_this) {
      return function() {
        var buf, handshake_callback;
        buf = new Buffer(8);
        buf.writeUInt32LE(0x723081e1, 0);
        buf.writeUInt32LE(_this.authKey.length, 4);
        _this.write(buf);
        _this.rawSocket.write(_this.authKey, 'ascii');
        handshake_callback = function(buf) {
          var b, i, status_buf, status_str, _i, _len, _ref;
          _this.buffer = Buffer.concat([_this.buffer, buf]);
          _ref = _this.buffer;
          for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
            b = _ref[i];
            if (b === 0) {
              _this.rawSocket.removeListener('data', handshake_callback);
              status_buf = _this.buffer.slice(0, i);
              _this.buffer = _this.buffer.slice(i + 1);
              status_str = status_buf.toString();
              clearTimeout(timeout);
              if (status_str === "SUCCESS") {
                _this.rawSocket.on('data', function(buf) {
                  return _this._data(buf);
                });
                _this.emit('connect');
                return;
              } else {
                _this.emit('error', new err.RqlDriverError("Server dropped connection with message: \"" + status_str.trim() + "\""));
                return;
              }
            }
          }
        };
        return _this.rawSocket.on('data', handshake_callback);
      };
    })(this));
    this.rawSocket.on('error', (function(_this) {
      return function() {
        var args;
        args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        return _this.emit.apply(_this, ['error'].concat(__slice.call(args)));
      };
    })(this));
    this.rawSocket.on('close', (function(_this) {
      return function() {
        _this.open = false;
        return _this.emit('close', {
          noreplyWait: false
        });
      };
    })(this));
    this.rawSocket.on('timeout', (function(_this) {
      return function() {
        _this.open = false;
        return _this.emit('timeout');
      };
    })(this));
  }

  TcpConnection.prototype.close = varar(0, 2, function(optsOrCallback, callback) {
    var cb, opts, wrappedCb;
    if (callback != null) {
      opts = optsOrCallback;
      cb = callback;
    } else if (Object.prototype.toString.call(optsOrCallback) === '[object Object]') {
      opts = optsOrCallback;
      cb = null;
    } else {
      opts = {};
      cb = optsOrCallback;
    }
    if (!((cb == null) || typeof cb === 'function')) {
      throw new err.RqlDriverError("Final argument to `close` must be a callback function or object.");
    }
    wrappedCb = (function(_this) {
      return function() {
        var args;
        args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        _this.rawSocket.end();
        if (cb != null) {
          return cb.apply(null, args);
        }
      };
    })(this);
    return TcpConnection.__super__.close.call(this, opts, wrappedCb);
  });

  TcpConnection.prototype.cancel = function() {
    this.rawSocket.destroy();
    return TcpConnection.__super__.cancel.call(this);
  };

  TcpConnection.prototype.write = function(chunk) {
    return this.rawSocket.write(chunk);
  };

  return TcpConnection;

})(Connection);

HttpConnection = (function(_super) {
  __extends(HttpConnection, _super);

  HttpConnection.prototype.DEFAULT_PROTOCOL = 'http';

  HttpConnection.isAvailable = function() {
    return typeof XMLHttpRequest !== "undefined";
  };

  function HttpConnection(host, callback) {
    var protocol, url, xhr;
    if (!HttpConnection.isAvailable()) {
      throw new err.RqlDriverError("XMLHttpRequest is not available in this environment");
    }
    HttpConnection.__super__.constructor.call(this, host, callback);
    protocol = host.protocol === 'https' ? 'https' : this.DEFAULT_PROTOCOL;
    url = "" + protocol + "://" + this.host + ":" + this.port + host.pathname + "ajax/reql/";
    xhr = new XMLHttpRequest;
    xhr.open("GET", url + "open-new-connection", true);
    xhr.responseType = "arraybuffer";
    xhr.onreadystatechange = (function(_this) {
      return function(e) {
        if (xhr.readyState === 4) {
          if (xhr.status === 200) {
            _this._url = url;
            _this._connId = (new DataView(xhr.response)).getInt32(0, true);
            return _this.emit('connect');
          } else {
            return _this.emit('error', new err.RqlDriverError("XHR error, http status " + xhr.status + "."));
          }
        }
      };
    })(this);
    xhr.send();
  }

  HttpConnection.prototype.cancel = function() {
    var xhr;
    xhr = new XMLHttpRequest;
    xhr.open("POST", "" + this._url + "close-connection?conn_id=" + this._connId, true);
    xhr.send();
    this._url = null;
    this._connId = null;
    return HttpConnection.__super__.cancel.call(this);
  };

  HttpConnection.prototype.write = function(chunk) {
    var array, i, view, xhr;
    xhr = new XMLHttpRequest;
    xhr.open("POST", "" + this._url + "?conn_id=" + this._connId, true);
    xhr.responseType = "arraybuffer";
    xhr.onreadystatechange = (function(_this) {
      return function(e) {
        var b, buf;
        if (xhr.readyState === 4 && xhr.status === 200) {
          buf = new Buffer((function() {
            var _i, _len, _ref, _results;
            _ref = new Uint8Array(xhr.response);
            _results = [];
            for (_i = 0, _len = _ref.length; _i < _len; _i++) {
              b = _ref[_i];
              _results.push(b);
            }
            return _results;
          })());
          return _this._data(buf);
        }
      };
    })(this);
    array = new ArrayBuffer(chunk.length);
    view = new Uint8Array(array);
    i = 0;
    while (i < chunk.length) {
      view[i] = chunk.get(i);
      i++;
    }
    return xhr.send(array);
  };

  return HttpConnection;

})(Connection);

module.exports.connect = ar(function(host, callback) {
  if (!(typeof host === 'string' || Object.prototype.toString.call(host) === '[object Object]')) {
    throw new err.RqlDriverError("First argument to `connect` must be a string giving the " + "host to `connect` to or an object giving `host` and `port`.");
  }
  if (typeof callback !== 'function') {
    throw new err.RqlDriverError("Second argument to `connect` must be a callback to invoke with " + "either an error or the successfully established connection.");
  }
  if (TcpConnection.isAvailable()) {
    new TcpConnection(host, callback);
  } else if (HttpConnection.isAvailable()) {
    new HttpConnection(host, callback);
  } else {
    throw new err.RqlDriverError("Neither TCP nor HTTP avaiable in this environment");
  }
});
}).call(this,require("/home/ssd1/atnnn/code/rethinkdb/build/external/browserify_3.24.13/node_modules/packed-browserify/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js"),require("buffer").Buffer)
},{"./ast":9,"./cursor":10,"./errors":11,"./protobuf":17,"./util":20,"/home/ssd1/atnnn/code/rethinkdb/build/external/browserify_3.24.13/node_modules/packed-browserify/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":4,"buffer":5,"events":3,"net":1}],13:[function(require,module,exports){
(function (process){/*
 Copyright 2013 Daniel Wirtz <dcode@dcode.io>

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

/**
 * @license ProtoBuf.js (c) 2013 Daniel Wirtz <dcode@dcode.io>
 * Released under the Apache License, Version 2.0
 * see: https://github.com/dcodeIO/ProtoBuf.js for details
 */
(function(global) {
    "use strict";
    
    function loadProtoBuf(ByteBuffer) {

        /**
         * The ProtoBuf namespace.
         * @exports ProtoBuf
         * @namespace
         * @expose
         */
        var ProtoBuf = {};
        
        /**
         * ProtoBuf.js version.
         * @type {string}
         * @const
         * @expose
         */
        ProtoBuf.VERSION = "2.0.4";

        /**
         * Wire types.
         * @type {Object.<string,number>}
         * @const
         * @expose
         */
        ProtoBuf.WIRE_TYPES = {};

        /**
         * Varint wire type.
         * @type {number}
         * @expose
         */
        ProtoBuf.WIRE_TYPES.VARINT = 0;

        /**
         * Fixed 64 bits wire type.
         * @type {number}
         * @const
         * @expose
         */
        ProtoBuf.WIRE_TYPES.BITS64 = 1;

        /**
         * Length delimited wire type.
         * @type {number}
         * @const
         * @expose
         */
        ProtoBuf.WIRE_TYPES.LDELIM = 2;

        /**
         * Start group wire type.
         * @type {number}
         * @const
         * @deprecated Not supported.
         * @expose
         */
        ProtoBuf.WIRE_TYPES.STARTGROUP = 3;

        /**
         * End group wire type.
         * @type {number}
         * @const
         * @deprecated Not supported.
         * @expose
         */
        ProtoBuf.WIRE_TYPES.ENDGROUP = 4;

        /**
         * Fixed 32 bits wire type.
         * @type {number}
         * @const
         * @expose
         */
        ProtoBuf.WIRE_TYPES.BITS32 = 5;

        /**
         * Types.
         * @dict
         * @type {Object.<string,{name: string, wireType: number}>}
         * @const
         * @expose
         */
        ProtoBuf.TYPES = {
            // According to the protobuf spec.
            "int32": {
                name: "int32",
                wireType: ProtoBuf.WIRE_TYPES.VARINT
            },
            "uint32": {
                name: "uint32",
                wireType: ProtoBuf.WIRE_TYPES.VARINT
            },
            "sint32": {
                name: "sint32",
                wireType: ProtoBuf.WIRE_TYPES.VARINT
            },
            "int64": {
                name: "int64",
                wireType: ProtoBuf.WIRE_TYPES.VARINT
            },
            "uint64": {
                name: "uint64",
                wireType: ProtoBuf.WIRE_TYPES.VARINT
            },
            "sint64": {
                name: "sint64",
                wireType: ProtoBuf.WIRE_TYPES.VARINT
            },
            "bool": {
                name: "bool",
                wireType: ProtoBuf.WIRE_TYPES.VARINT
            },
            "double": {
                name: "double",
                wireType: ProtoBuf.WIRE_TYPES.BITS64
            },
            "string": {
                name: "string",
                wireType: ProtoBuf.WIRE_TYPES.LDELIM
            },
            "bytes": {
                name: "bytes",
                wireType: ProtoBuf.WIRE_TYPES.LDELIM
            },
            "fixed32": {
                name: "fixed32",
                wireType: ProtoBuf.WIRE_TYPES.BITS32
            },
            "sfixed32": {
                name: "sfixed32",
                wireType: ProtoBuf.WIRE_TYPES.BITS32
            },
            "fixed64": {
                name: "fixed64",
                wireType: ProtoBuf.WIRE_TYPES.BITS64
            },
            "sfixed64": {
                name: "sfixed64",
                wireType: ProtoBuf.WIRE_TYPES.BITS64
            },
            "float": {
                name: "float",
                wireType: ProtoBuf.WIRE_TYPES.BITS32
            },
            "enum": {
                name: "enum",
                wireType: ProtoBuf.WIRE_TYPES.VARINT
            },
            "message": {
                name: "message",
                wireType: ProtoBuf.WIRE_TYPES.LDELIM
            }
        };

        /**
         * @type {?Long}
         */
        ProtoBuf.Long = ByteBuffer.Long;

        /**
         * If set to `true`, field names will be converted from underscore notation to camel case. Defaults to `false`.
         *  Must be set prior to parsing.
         * @type {boolean}
         * @expose
         */
        ProtoBuf.convertFieldsToCamelCase = false;
        
        /**
         * @alias ProtoBuf.Util
         * @expose
         */
        ProtoBuf.Util = (function() {
            "use strict";
        
            // Object.create polyfill
            // ref: https://developer.mozilla.org/de/docs/JavaScript/Reference/Global_Objects/Object/create
            if (!Object.create) {
                /** @expose */
                Object.create = function (o) {
                    if (arguments.length > 1) {
                        throw new Error('Object.create implementation only accepts the first parameter.');
                    }
                    function F() {}
                    F.prototype = o;
                    return new F();
                };
            }
        
            /**
             * ProtoBuf utilities.
             * @exports ProtoBuf.Util
             * @namespace
             */
            var Util = {};
        
            /**
             * Flag if running in node or not.
             * @type {boolean}
             * @const
             * @expose
             */
            Util.IS_NODE = (typeof window === 'undefined' || !window.window) && typeof require === 'function' && typeof process !== 'undefined' && typeof process["nextTick"] === 'function';
            
            /**
             * Constructs a XMLHttpRequest object.
             * @return {XMLHttpRequest}
             * @throws {Error} If XMLHttpRequest is not supported
             * @expose
             */
            Util.XHR = function() {
                // No dependencies please, ref: http://www.quirksmode.org/js/xmlhttp.html
                var XMLHttpFactories = [
                    function () {return new XMLHttpRequest()},
                    function () {return new ActiveXObject("Msxml2.XMLHTTP")},
                    function () {return new ActiveXObject("Msxml3.XMLHTTP")},
                    function () {return new ActiveXObject("Microsoft.XMLHTTP")}
                ];
                /** @type {?XMLHttpRequest} */
                var xhr = null;
                for (var i=0;i<XMLHttpFactories.length;i++) {
                    try { xhr = XMLHttpFactories[i](); }
                    catch (e) { continue; }
                    break;
                }
                if (!xhr) throw(new Error("XMLHttpRequest is not supported"));
                return xhr;
            };
        
            /**
             * Fetches a resource.
             * @param {string} path Resource path
             * @param {function(?string)=} callback Callback receiving the resource's contents. If omitted the resource will
             *   be fetched synchronously. If the request failed, contents will be null.
             * @return {?string|undefined} Resource contents if callback is omitted (null if the request failed), else undefined.
             * @expose
             */
            Util.fetch = function(path, callback) {
                if (callback && typeof callback != 'function') callback = null;
                if (Util.IS_NODE) {
                    if (callback) {
                        require("fs").readFile(path, function(err, data) {
                            if (err) {
                                callback(null);
                            }
                            else callback(""+data);
                        });
                    } else {
                        try {
                            return require("fs").readFileSync(path);
                        } catch (e) {
                            return null;
                        }
                    }
                } else {
                    var xhr = Util.XHR();
                    xhr.open('GET', path, callback ? true : false);
                    // xhr.setRequestHeader('User-Agent', 'XMLHTTP/1.0');
                    xhr.setRequestHeader('Accept', 'text/plain');
                    if (typeof xhr.overrideMimeType === 'function') xhr.overrideMimeType('text/plain');
                    if (callback) {
                        xhr.onreadystatechange = function() {
                            if (xhr.readyState != 4) return;
                            if (/* remote */ xhr.status == 200 || /* local */ (xhr.status == 0 && typeof xhr.responseText === 'string')) {
                                callback(xhr.responseText);
                            } else {
                                callback(null);
                            }
                        };
                        if (xhr.readyState == 4) return;
                        xhr.send(null);
                    } else {
                        xhr.send(null);
                        if (/* remote */ xhr.status == 200 || /* local */ (xhr.status == 0 && typeof xhr.responseText === 'string')) {
                            return xhr.responseText;
                        }
                        return null;
                    }
                }
            };
        
            /**
             * Tests if an object is an array.
             * @param {*} obj Object to test
             * @returns {boolean} true if it is an array, else false
             * @expose
             */
            Util.isArray = function(obj) {
                if (!obj) return false;
                if (obj instanceof Array) return true;
                if (Array.isArray) return Array.isArray(obj);
                return Object.prototype.toString.call(obj) === "[object Array]";
            };
            
            return Util;
        })();        
        /**
         * @alias ProtoBuf.Lang
         * @expose
         */
        ProtoBuf.Lang = (function() {
            "use strict";
            
            /**
             * ProtoBuf Language.
             * @exports ProtoBuf.Lang
             * @type {Object.<string,string|RegExp>}
             * @namespace
             * @expose
             */
            var Lang = { // Look, so cute!
                OPEN: "{",
                CLOSE: "}",
                OPTOPEN: "[",
                OPTCLOSE: "]",
                OPTEND: ",",
                EQUAL: "=",
                END: ";",
                STRINGOPEN: '"',
                STRINGCLOSE: '"',
                COPTOPEN: '(',
                COPTCLOSE: ')',
        
                DELIM: /[\s\{\}=;\[\],"\(\)]/g,
                
                KEYWORD: /^(?:package|option|import|message|enum|extend|service|syntax|extensions)$/,
                RULE: /^(?:required|optional|repeated)$/,
                TYPE: /^(?:double|float|int32|uint32|sint32|int64|uint64|sint64|fixed32|sfixed32|fixed64|sfixed64|bool|string|bytes)$/,
                NAME: /^[a-zA-Z][a-zA-Z_0-9]*$/,
                OPTNAME: /^(?:[a-zA-Z][a-zA-Z_0-9]*|\([a-zA-Z][a-zA-Z_0-9]*\))$/,
                TYPEDEF: /^[a-zA-Z][a-zA-Z_0-9]*$/,
                TYPEREF: /^(?:\.?[a-zA-Z][a-zA-Z_0-9]*)+$/,
                FQTYPEREF: /^(?:\.[a-zA-Z][a-zA-Z_0-9]*)+$/,
                NUMBER: /^-?(?:[1-9][0-9]*|0|0x[0-9a-fA-F]+|0[0-7]+|[0-9]*\.[0-9]+)$/,
                NUMBER_DEC: /^(?:[1-9][0-9]*|0)$/,
                NUMBER_HEX: /^0x[0-9a-fA-F]+$/,
                NUMBER_OCT: /^0[0-7]+$/,
                NUMBER_FLT: /^[0-9]*\.[0-9]+$/,
                ID: /^(?:[1-9][0-9]*|0|0x[0-9a-fA-F]+|0[0-7]+)$/,
                NEGID: /^\-?(?:[1-9][0-9]*|0|0x[0-9a-fA-F]+|0[0-7]+)$/,
                WHITESPACE: /\s/,
                STRING: /"([^"\\]*(\\.[^"\\]*)*)"/g,
                BOOL: /^(?:true|false)$/i,
        
                ID_MIN: 1,
                ID_MAX: 0x1FFFFFFF
            };
            return Lang;
        })();
                
        /**
         * Utilities to parse .proto files.
         * @namespace
         * @expose
         */
        ProtoBuf.DotProto = {}; // Not present in "noparse" builds
        
        /**
         * @alias ProtoBuf.DotProto.Tokenizer
         * @expose
         */
        ProtoBuf.DotProto.Tokenizer = (function(Lang) {
        
            /**
             * Constructs a new Tokenizer.
             * @exports ProtoBuf.DotProto.Tokenizer
             * @class A ProtoBuf .proto Tokenizer.
             * @param {string} proto Proto to tokenize
             * @constructor
             */
            var Tokenizer = function(proto) {
                
                /**
                 * Source to parse.
                 * @type {string}
                 * @expose
                 */
                this.source = ""+proto;
                
                /**
                 * Current index.
                 * @type {number}
                 * @expose
                 */
                this.index = 0;
        
                /**
                 * Current line.
                 * @type {number}
                 * @expose
                 */
                this.line = 1;
        
                /**
                 * Stacked values.
                 * @type {Array}
                 * @expose
                 */
                this.stack = [];
        
                /**
                 * Whether currently reading a string or not.
                 * @type {boolean}
                 * @expose
                 */
                this.readingString = false;
            };
        
            /**
             * Reads a string beginning at the current index.
             * @return {string} The string
             * @throws {Error} If it's not a valid string
             * @private
             */
            Tokenizer.prototype._readString = function() {
                Lang.STRING.lastIndex = this.index-1; // Include the open quote
                var match;
                if ((match = Lang.STRING.exec(this.source)) !== null) {
                    var s = match[1];
                    this.index = Lang.STRING.lastIndex;
                    this.stack.push(Lang.STRINGCLOSE);
                    return s;
                }
                throw(new Error("Illegal string value at line "+this.line+", index "+this.index));
            };
        
            /**
             * Gets the next token and advances by one.
             * @return {?string} Token or `null` on EOF
             * @throws {Error} If it's not a valid proto file
             * @expose
             */
            Tokenizer.prototype.next = function() {
                if (this.stack.length > 0) {
                    return this.stack.shift();
                }
                if (this.index >= this.source.length) {
                    return null; // No more tokens
                }
                if (this.readingString) {
                    this.readingString = false;
                    return this._readString();
                }
                var repeat, last;
                do {
                    repeat = false;
                    // Strip white spaces
                    while (Lang.WHITESPACE.test(last = this.source.charAt(this.index))) {
                        this.index++;
                        if (last === "\n") this.line++;
                        if (this.index === this.source.length) return null;
                    }
                    // Strip comments
                    if (this.source.charAt(this.index) === '/') {
                        if (this.source.charAt(++this.index) === '/') { // Single line
                            while (this.source.charAt(this.index) !== "\n") {
                                this.index++;
                                if (this.index == this.source.length) return null;
                            }
                            this.index++;
                            this.line++;
                            repeat = true;
                        } else if (this.source.charAt(this.index) === '*') { /* Block */
                            last = '';
                            while (last+(last=this.source.charAt(this.index)) !== '*/') {
                                this.index++;
                                if (last === "\n") this.line++;
                                if (this.index === this.source.length) return null;
                            }
                            this.index++;
                            repeat = true;
                        } else {
                            throw(new Error("Invalid comment at line "+this.line+": /"+this.source.charAt(this.index)+" ('/' or '*' expected)"));
                        }
                    }
                } while (repeat);
                if (this.index === this.source.length) return null;
        
                // Read the next token
                var end = this.index;
                Lang.DELIM.lastIndex = 0;
                var delim = Lang.DELIM.test(this.source.charAt(end));
                if (!delim) {
                    end++;
                    while(end < this.source.length && !Lang.DELIM.test(this.source.charAt(end))) {
                        end++;
                    }
                } else {
                    end++;
                }
                var token = this.source.substring(this.index, this.index = end);
                if (token === Lang.STRINGOPEN) {
                    this.readingString = true;
                }
                return token;
            };
        
            /**
             * Peeks for the next token.
             * @return {?string} Token or `null` on EOF
             * @throws {Error} If it's not a valid proto file
             * @expose
             */
            Tokenizer.prototype.peek = function() {
                if (this.stack.length == 0) {
                    var token = this.next();
                    if (token === null) return null;
                    this.stack.push(token);
                }
                return this.stack[0];
            };
        
            /**
             * Returns a string representation of this object.
             * @return {string} String representation as of "Tokenizer(index/length)"
             * @expose
             */
            Tokenizer.prototype.toString = function() {
                return "Tokenizer("+this.index+"/"+this.source.length+" at line "+this.line+")";
            };
            
            return Tokenizer;
            
        })(ProtoBuf.Lang);
                
        /**
         * @alias ProtoBuf.DotProto.Parser
         * @expose
         */
        ProtoBuf.DotProto.Parser = (function(ProtoBuf, Lang, Tokenizer) {
            "use strict";
            
            /**
             * Constructs a new Parser.
             * @exports ProtoBuf.DotProto.Parser
             * @class A ProtoBuf .proto parser.
             * @param {string} proto Protocol source
             * @constructor
             */
            var Parser = function(proto) {
        
                /**
                 * Tokenizer.
                 * @type {ProtoBuf.DotProto.Tokenizer}
                 * @expose
                 */
                this.tn = new Tokenizer(proto);
            };
        
            /**
             * Runs the parser.
             * @return {{package: string|null, messages: Array.<object>, enums: Array.<object>, imports: Array.<string>, options: object<string,*>}}
             * @throws {Error} If the source cannot be parsed
             * @expose
             */
            Parser.prototype.parse = function() {
                var topLevel = {
                    "name": "[ROOT]", // temporary
                    "package": null,
                    "messages": [],
                    "enums": [],
                    "imports": [],
                    "options": {},
                    "services": []
                };
                var token, header = true;
                do {
                    token = this.tn.next();
                    if (token == null) {
                        break; // No more messages
                    }
                    if (token == 'package') {
                        if (!header) {
                            throw(new Error("Illegal package definition at line "+this.tn.line+": Must be declared before the first message or enum"));
                        }
                        if (topLevel["package"] !== null) {
                            throw(new Error("Illegal package definition at line "+this.tn.line+": Package already declared"));
                        }
                        topLevel["package"] = this._parsePackage(token);
                    } else if (token == 'import') {
                        if (!header) {
                            throw(new Error("Illegal import definition at line "+this.tn.line+": Must be declared before the first message or enum"));
                        }
                        topLevel.imports.push(this._parseImport(token));
                    } else if (token === 'message') {
                        this._parseMessage(topLevel, token);
                        header = false;
                    } else if (token === 'enum') {
                        this._parseEnum(topLevel, token);
                        header = false;
                    } else if (token === 'option') {
                        if (!header) {
                            throw(new Error("Illegal option definition at line "+this.tn.line+": Must be declared before the first message or enum"));
                        }
                        this._parseOption(topLevel, token);
                    } else if (token === 'service') {
                        this._parseService(topLevel, token);
                    } else if (token === 'extend') {
                        this._parseExtend(topLevel, token);
                    } else if (token === 'syntax') {
                        this._parseIgnoredStatement(topLevel, token);
                    } else {
                        throw(new Error("Illegal top level declaration at line "+this.tn.line+": "+token));
                    }
                } while (true);
                delete topLevel["name"];
                return topLevel;
            };
        
            /**
             * Parses a number value.
             * @param {string} val Number value to parse
             * @return {number} Number
             * @throws {Error} If the number value is invalid
             * @private
             */
            Parser.prototype._parseNumber = function(val) {
                var sign = 1;
                if (val.charAt(0) == '-') {
                    sign = -1; val = val.substring(1);
                }
                if (Lang.NUMBER_DEC.test(val)) {
                    return sign*parseInt(val, 10);
                } else if (Lang.NUMBER_HEX.test(val)) {
                    return sign*parseInt(val.substring(2), 16);
                } else if (Lang.NUMBER_OCT.test(val)) {
                    return sign*parseInt(val.substring(1), 8);
                } else if (Lang.NUMBER_FLT.test(val)) {
                    return sign*parseFloat(val);
                }
                throw(new Error("Illegal number value at line "+this.tn.line+": "+(sign < 0 ? '-' : '')+val));
            };
        
            /**
             * Parses an ID value.
             * @param {string} val ID value to parse
             * @param {boolean=} neg Whether the ID may be negative, defaults to `false`
             * @returns {number} ID
             * @throws {Error} If the ID value is invalid
             * @private
             */
            Parser.prototype._parseId = function(val, neg) {
                var id = -1;
                var sign = 1;
                if (val.charAt(0) == '-') {
                    sign = -1; val = val.substring(1);
                }
                if (Lang.NUMBER_DEC.test(val)) {
                    id = parseInt(val);
                } else if (Lang.NUMBER_HEX.test(val)) {
                    id = parseInt(val.substring(2), 16);
                } else if (Lang.NUMBER_OCT.test(val)) {
                    id = parseInt(val.substring(1), 8);
                } else {
                    throw(new Error("Illegal ID value at line "+this.tn.line+": "+(sign < 0 ? '-' : '')+val));
                }
                id = (sign*id)|0; // Force to 32bit
                if (!neg && id < 0) {
                    throw(new Error("Illegal ID range at line "+this.tn.line+": "+(sign < 0 ? '-' : '')+val));
                }
                return id;
            };
        
            /**
             * Parses the package definition.
             * @param {string} token Initial token
             * @return {string} Package name
             * @throws {Error} If the package definition cannot be parsed
             * @private
             */
            Parser.prototype._parsePackage = function(token) {
                token = this.tn.next();
                if (!Lang.TYPEREF.test(token)) {
                    throw(new Error("Illegal package name at line "+this.tn.line+": "+token));
                }
                var pkg = token;
                token = this.tn.next();
                if (token != Lang.END) {
                    throw(new Error("Illegal end of package definition at line "+this.tn.line+": "+token+" ('"+Lang.END+"' expected)"));
                }
                return pkg;
            };
        
            /**
             * Parses an import definition.
             * @param {string} token Initial token
             * @return {string} Import file name 
             * @throws {Error} If the import definition cannot be parsed
             * @private
             */
            Parser.prototype._parseImport = function(token) {
                token = this.tn.next();
                if (token === "public") {
                    token = this.tn.next();
                }
                if (token !== Lang.STRINGOPEN) {
                    throw(new Error("Illegal begin of import value at line "+this.tn.line+": "+token+" ('"+Lang.STRINGOPEN+"' expected)"));
                }
                var imported = this.tn.next();
                token = this.tn.next();
                if (token !== Lang.STRINGCLOSE) {
                    throw(new Error("Illegal end of import value at line "+this.tn.line+": "+token+" ('"+Lang.STRINGCLOSE+"' expected)"));
                }
                token = this.tn.next();
                if (token !== Lang.END) {
                    throw(new Error("Illegal end of import definition at line "+this.tn.line+": "+token+" ('"+Lang.END+"' expected)"));
                }
                return imported;
            };
        
            /**
             * Parses a namespace option.
             * @param {Object} parent Parent definition
             * @param {string} token Initial token
             * @throws {Error} If the option cannot be parsed
             * @private
             */
            Parser.prototype._parseOption = function(parent, token) {
                token = this.tn.next();
                var custom = false;
                if (token == Lang.COPTOPEN) {
                    custom = true;
                    token = this.tn.next();
                }
                if (!Lang.NAME.test(token)) {
                    // we can allow options of the form google.protobuf.* since they will just get ignored anyways
                    if (!/google\.protobuf\./.test(token)) {
                        throw(new Error("Illegal option name in message "+parent.name+" at line "+this.tn.line+": "+token));
                    }
                }
                var name = token;
                token = this.tn.next();
                if (custom) { // (my_method_option).foo, (my_method_option), some_method_option
                    if (token !== Lang.COPTCLOSE) {
                        throw(new Error("Illegal custom option name delimiter in message "+parent.name+", option "+name+" at line "+this.tn.line+": "+token+" ('"+Lang.COPTCLOSE+"' expected)"));
                    }
                    name = '('+name+')';
                    token = this.tn.next();
                    if (Lang.FQTYPEREF.test(token)) {
                        name += token;
                        token = this.tn.next();
                    }
                }
                if (token !== Lang.EQUAL) {
                    throw(new Error("Illegal option operator in message "+parent.name+", option "+name+" at line "+this.tn.line+": "+token+" ('"+Lang.EQUAL+"' expected)"));
                }
                var value;
                token = this.tn.next();
                if (token === Lang.STRINGOPEN) {
                    value = this.tn.next();
                    token = this.tn.next();
                    if (token !== Lang.STRINGCLOSE) {
                        throw(new Error("Illegal end of option value in message "+parent.name+", option "+name+" at line "+this.tn.line+": "+token+" ('"+Lang.STRINGCLOSE+"' expected)"));
                    }
                } else {
                    if (Lang.NUMBER.test(token)) {
                        value = this._parseNumber(token, true);
                    } else if (Lang.TYPEREF.test(token)) {
                        value = token;
                    } else {
                        throw(new Error("Illegal option value in message "+parent.name+", option "+name+" at line "+this.tn.line+": "+token));
                    }
                }
                token = this.tn.next();
                if (token !== Lang.END) {
                    throw(new Error("Illegal end of option in message "+parent.name+", option "+name+" at line "+this.tn.line+": "+token+" ('"+Lang.END+"' expected)"));
                }
                parent["options"][name] = value;
            };
        
            /**
             * Parses an ignored block of the form ['keyword', 'typeref', '{' ... '}'].
             * @param {Object} parent Parent definition
             * @param {string} keyword Initial token
             * @throws {Error} If the directive cannot be parsed
             * @private
             */
            Parser.prototype._parseIgnoredBlock = function(parent, keyword) {
                var token = this.tn.next();
                if (!Lang.TYPEREF.test(token)) {
                    throw(new Error("Illegal "+keyword+" type in "+parent.name+": "+token));
                }
                var name = token;
                token = this.tn.next();
                if (token !== Lang.OPEN) {
                    throw(new Error("Illegal OPEN in "+parent.name+" after "+keyword+" "+name+" at line "+this.tn.line+": "+token));
                }
                var depth = 1;
                do {
                    token = this.tn.next();
                    if (token === null) {
                        throw(new Error("Unexpected EOF in "+parent.name+", "+keyword+" (ignored) at line "+this.tn.line+": "+name));
                    }
                    if (token === Lang.OPEN) {
                        depth++;
                    } else if (token === Lang.CLOSE) {
                        token = this.tn.peek();
                        if (token === Lang.END) this.tn.next();
                        depth--;
                        if (depth === 0) {
                            break;
                        }
                    }
                } while(true);
            };
        
            /**
             * Parses an ignored statement of the form ['keyword', ..., ';'].
             * @param {Object} parent Parent definition
             * @param {string} keyword Initial token
             * @throws {Error} If the directive cannot be parsed
             * @private
             */
            Parser.prototype._parseIgnoredStatement = function(parent, keyword) {
                var token;
                do {
                    token = this.tn.next();
                    if (token === null) {
                        throw(new Error("Unexpected EOF in "+parent.name+", "+keyword+" (ignored) at line "+this.tn.line));
                    }
                    if (token === Lang.END) break;
                } while (true);
            };
        
            /**
             * Parses a service definition.
             * @param {Object} parent Parent definition
             * @param {string} keyword Initial token
             * @throws {Error} If the service cannot be parsed
             * @private
             */
            Parser.prototype._parseService = function(parent, keyword) {
                var token = this.tn.next();
                if (!Lang.NAME.test(token)) {
                    throw(new Error("Illegal service name at line "+this.tn.line+": "+token));
                }
                var name = token;
                var svc = {
                    "name": name,
                    "rpc": {},
                    "options": {}
                };
                token = this.tn.next();
                if (token !== Lang.OPEN) {
                    throw(new Error("Illegal OPEN after service "+name+" at line "+this.tn.line+": "+token+" ('"+Lang.OPEN+"' expected)"));
                }
                do {
                    token = this.tn.next();
                    if (token === "option") {
                        this._parseOption(svc, token);
                    } else if (token === 'rpc') {
                        this._parseServiceRPC(svc, token);
                    } else if (token !== Lang.CLOSE) {
                        throw(new Error("Illegal type for service "+name+" at line "+this.tn.line+": "+token));
                    }
                } while (token !== Lang.CLOSE);
                parent["services"].push(svc);
            };
        
            /**
             * Parses a RPC service definition of the form ['rpc', name, (request), 'returns', (response)].
             * @param {Object} svc Parent definition
             * @param {string} token Initial token
             * @private
             */
            Parser.prototype._parseServiceRPC = function(svc, token) {
                var type = token;
                token = this.tn.next();
                if (!Lang.NAME.test(token)) {
                    throw(new Error("Illegal RPC method name in service "+svc["name"]+" at line "+this.tn.line+": "+token));
                }
                var name = token;
                var method = {
                    "request": null,
                    "response": null,
                    "options": {}
                };
                token = this.tn.next();
                if (token !== Lang.COPTOPEN) {
                    throw(new Error("Illegal start of request type in RPC service "+svc["name"]+"#"+name+" at line "+this.tn.line+": "+token+" ('"+Lang.COPTOPEN+"' expected)"));
                }
                token = this.tn.next();
                if (!Lang.TYPEREF.test(token)) {
                    throw(new Error("Illegal request type in RPC service "+svc["name"]+"#"+name+" at line "+this.tn.line+": "+token));
                }
                method["request"] = token;
                token = this.tn.next();
                if (token != Lang.COPTCLOSE) {
                    throw(new Error("Illegal end of request type in RPC service "+svc["name"]+"#"+name+" at line "+this.tn.line+": "+token+" ('"+Lang.COPTCLOSE+"' expected)"))
                }
                token = this.tn.next();
                if (token.toLowerCase() !== "returns") {
                    throw(new Error("Illegal request/response delimiter in RPC service "+svc["name"]+"#"+name+" at line "+this.tn.line+": "+token+" ('returns' expected)"));
                }
                token = this.tn.next();
                if (token != Lang.COPTOPEN) {
                    throw(new Error("Illegal start of response type in RPC service "+svc["name"]+"#"+name+" at line "+this.tn.line+": "+token+" ('"+Lang.COPTOPEN+"' expected)"));
                }
                token = this.tn.next();
                method["response"] = token;
                token = this.tn.next();
                if (token !== Lang.COPTCLOSE) {
                    throw(new Error("Illegal end of response type in RPC service "+svc["name"]+"#"+name+" at line "+this.tn.line+": "+token+" ('"+Lang.COPTCLOSE+"' expected)"))
                }
                token = this.tn.next();
                if (token === Lang.OPEN) {
                    do {
                        token = this.tn.next();
                        if (token === 'option') {
                            this._parseOption(method, token); // <- will fail for the custom-options example
                        } else if (token !== Lang.CLOSE) {
                            throw(new Error("Illegal start of option in RPC service "+svc["name"]+"#"+name+" at line "+this.tn.line+": "+token+" ('option' expected)"));
                        }
                    } while (token !== Lang.CLOSE);
                } else if (token !== Lang.END) {
                    throw(new Error("Illegal method delimiter in RPC service "+svc["name"]+"#"+name+" at line "+this.tn.line+": "+token+" ('"+Lang.END+"' or '"+Lang.OPEN+"' expected)"));
                }
                if (typeof svc[type] === 'undefined') svc[type] = {};
                svc[type][name] = method;
            };
        
            /**
             * Parses a message definition.
             * @param {Object} parent Parent definition
             * @param {string} token First token
             * @return {Object}
             * @throws {Error} If the message cannot be parsed
             * @private
             */
            Parser.prototype._parseMessage = function(parent, token) {
                /** @dict */
                var msg = {}; // Note: At some point we might want to exclude the parser, so we need a dict.
                token = this.tn.next();
                if (!Lang.NAME.test(token)) {
                    throw(new Error("Illegal message name"+(parent ? " in message "+parent["name"] : "")+" at line "+this.tn.line+": "+token));
                }
                msg["name"] = token;
                token = this.tn.next();
                if (token != Lang.OPEN) {
                    throw(new Error("Illegal OPEN after message "+msg.name+" at line "+this.tn.line+": "+token+" ('"+Lang.OPEN+"' expected)"));
                }
                msg["fields"] = []; // Note: Using arrays to support also browser that cannot preserve order of object keys.
                msg["enums"] = [];
                msg["messages"] = [];
                msg["options"] = {};
                // msg["extensions"] = undefined
                do {
                    token = this.tn.next();
                    if (token === Lang.CLOSE) {
                        token = this.tn.peek();
                        if (token === Lang.END) this.tn.next();
                        break;
                    } else if (Lang.RULE.test(token)) {
                        this._parseMessageField(msg, token);
                    } else if (token === "enum") {
                        this._parseEnum(msg, token);
                    } else if (token === "message") {
                        this._parseMessage(msg, token);
                    } else if (token === "option") {
                        this._parseOption(msg, token);
                    } else if (token === "extensions") {
                        msg["extensions"] = this._parseExtensions(msg, token);
                    } else if (token === "extend") {
                        this._parseExtend(msg, token);
                    } else {
                        throw(new Error("Illegal token in message "+msg.name+" at line "+this.tn.line+": "+token+" (type or '"+Lang.CLOSE+"' expected)"));
                    }
                } while (true);
                parent["messages"].push(msg);
                return msg;
            };
        
            /**
             * Parses a message field.
             * @param {Object} msg Message definition
             * @param {string} token Initial token
             * @throws {Error} If the message field cannot be parsed
             * @private
             */
            Parser.prototype._parseMessageField = function(msg, token) {
                /** @dict */
                var fld = {};
                fld["rule"] = token;
                token = this.tn.next();
                if (!Lang.TYPE.test(token) && !Lang.TYPEREF.test(token)) {
                    throw(new Error("Illegal field type in message "+msg.name+" at line "+this.tn.line+": "+token));
                }
                fld["type"] = token;
                token = this.tn.next();
                if (!Lang.NAME.test(token)) {
                    throw(new Error("Illegal field name in message "+msg.name+" at line "+this.tn.line+": "+token));
                }
                fld["name"] = token;
                token = this.tn.next();
                if (token !== Lang.EQUAL) {
                    throw(new Error("Illegal field number operator in message "+msg.name+"#"+fld.name+" at line "+this.tn.line+": "+token+" ('"+Lang.EQUAL+"' expected)"));
                }
                token = this.tn.next();
                try {
                    fld["id"] = this._parseId(token);
                } catch (e) {
                    throw(new Error("Illegal field id in message "+msg.name+"#"+fld.name+" at line "+this.tn.line+": "+token));
                }
                /** @dict */
                fld["options"] = {};
                token = this.tn.next();
                if (token === Lang.OPTOPEN) {
                    this._parseFieldOptions(msg, fld, token);
                    token = this.tn.next();
                }
                if (token !== Lang.END) {
                    throw(new Error("Illegal field delimiter in message "+msg.name+"#"+fld.name+" at line "+this.tn.line+": "+token+" ('"+Lang.END+"' expected)"));
                }
                msg["fields"].push(fld);
            };
        
            /**
             * Parses a set of field option definitions.
             * @param {Object} msg Message definition
             * @param {Object} fld Field definition
             * @param {string} token Initial token
             * @throws {Error} If the message field options cannot be parsed
             * @private
             */
            Parser.prototype._parseFieldOptions = function(msg, fld, token) {
                var first = true;
                do {
                    token = this.tn.next();
                    if (token === Lang.OPTCLOSE) {
                        break;
                    } else if (token === Lang.OPTEND) {
                        if (first) {
                            throw(new Error("Illegal start of message field options in message "+msg.name+"#"+fld.name+" at line "+this.tn.line+": "+token));
                        }
                        token = this.tn.next();
                    }
                    this._parseFieldOption(msg, fld, token);
                    first = false;
                } while (true);
            };
        
            /**
             * Parses a single field option.
             * @param {Object} msg Message definition
             * @param {Object} fld Field definition
             * @param {string} token Initial token
             * @throws {Error} If the mesage field option cannot be parsed
             * @private
             */
            Parser.prototype._parseFieldOption = function(msg, fld, token) {
                var custom = false;
                if (token === Lang.COPTOPEN) {
                    token = this.tn.next();
                    custom = true;
                }
                if (!Lang.NAME.test(token)) {
                    throw(new Error("Illegal field option in message "+msg.name+"#"+fld.name+" at line "+this.tn.line+": "+token));
                }
                var name = token;
                token = this.tn.next();
                if (custom) {
                    if (token !== Lang.COPTCLOSE) {
                        throw(new Error("Illegal custom field option name delimiter in message "+msg.name+"#"+fld.name+" at line "+this.tn.line+": "+token+" (')' expected)"));
                    }
                    name = '('+name+')';
                    token = this.tn.next();
                    if (Lang.FQTYPEREF.test(token)) {
                        name += token;
                        token = this.tn.next();
                    }
                }
                if (token !== Lang.EQUAL) {
                    throw(new Error("Illegal field option operation in message "+msg.name+"#"+fld.name+" at line "+this.tn.line+": "+token+" ('=' expected)"));
                }
                var value;
                token = this.tn.next();
                if (token === Lang.STRINGOPEN) {
                    value = this.tn.next();
                    token = this.tn.next();
                    if (token != Lang.STRINGCLOSE) {
                        throw(new Error("Illegal end of field value in message "+msg.name+"#"+fld.name+", option "+name+" at line "+this.tn.line+": "+token+" ('"+Lang.STRINGCLOSE+"' expected)"));
                    }
                } else if (Lang.NUMBER.test(token, true)) {
                    value = this._parseNumber(token, true);
                } else if (Lang.BOOL.test(token)) {
                    value = token.toLowerCase() === 'true';
                } else if (Lang.TYPEREF.test(token)) {
                    value = token; // TODO: Resolve?
                } else {
                    throw(new Error("Illegal field option value in message "+msg.name+"#"+fld.name+", option "+name+" at line "+this.tn.line+": "+token));
                }
                fld["options"][name] = value;
            };
        
            /**
             * Parses an enum.
             * @param {Object} msg Message definition
             * @param {string} token Initial token
             * @throws {Error} If the enum cannot be parsed
             * @private
             */
            Parser.prototype._parseEnum = function(msg, token) {
                /** @dict */
                var enm = {};
                token = this.tn.next();
                if (!Lang.NAME.test(token)) {
                    throw(new Error("Illegal enum name in message "+msg.name+" at line "+this.tn.line+": "+token));
                }
                enm["name"] = token;
                token = this.tn.next();
                if (token !== Lang.OPEN) {
                    throw(new Error("Illegal OPEN after enum "+enm.name+" at line "+this.tn.line+": "+token));
                }
                enm["values"] = [];
                enm["options"] = {};
                do {
                    token = this.tn.next();
                    if (token === Lang.CLOSE) {
                        token = this.tn.peek();
                        if (token === Lang.END) this.tn.next();
                        break;
                    }
                    if (token == 'option') {
                        this._parseOption(enm, token);
                    } else {
                        if (!Lang.NAME.test(token)) {
                            throw(new Error("Illegal enum value name in enum "+enm.name+" at line "+this.tn.line+": "+token));
                        }
                        this._parseEnumValue(enm, token);
                    }
                } while (true);
                msg["enums"].push(enm);
            };
        
            /**
             * Parses an enum value.
             * @param {Object} enm Enum definition
             * @param {string} token Initial token
             * @throws {Error} If the enum value cannot be parsed
             * @private
             */
            Parser.prototype._parseEnumValue = function(enm, token) {
                /** @dict */
                var val = {};
                val["name"] = token;
                token = this.tn.next();
                if (token !== Lang.EQUAL) {
                    throw(new Error("Illegal enum value operator in enum "+enm.name+" at line "+this.tn.line+": "+token+" ('"+Lang.EQUAL+"' expected)"));
                }
                token = this.tn.next();
                try {
                    val["id"] = this._parseId(token, true);
                } catch (e) {
                    throw(new Error("Illegal enum value id in enum "+enm.name+" at line "+this.tn.line+": "+token));
                }
                enm["values"].push(val);
                token = this.tn.next();
                if (token === Lang.OPTOPEN) {
                    var opt = { 'options' : {} }; // TODO: Actually expose them somehow.
                    this._parseFieldOptions(enm, opt, token);
                    token = this.tn.next();
                }
                if (token !== Lang.END) {
                    throw(new Error("Illegal enum value delimiter in enum "+enm.name+" at line "+this.tn.line+": "+token+" ('"+Lang.END+"' expected)"));
                }
            };
        
            /**
             * Parses an extensions statement.
             * @param {Object} msg Message object
             * @param {string} token Initial token
             * @throws {Error} If the extensions statement cannot be parsed
             * @private
             */
            Parser.prototype._parseExtensions = function(msg, token) {
                /** @type {Array.<number>} */
                var range = [];
                token = this.tn.next();
                if (token === "min") { // FIXME: Does the official implementation support this?
                    range.push(Lang.ID_MIN);
                } else if (token === "max") {
                    range.push(Lang.ID_MAX);
                } else {
                    range.push(this._parseNumber(token));
                }
                token = this.tn.next();
                if (token !== 'to') {
                    throw("Illegal extensions delimiter in message "+msg.name+" at line "+this.tn.line+" ('to' expected)");
                }
                token = this.tn.next();
                if (token === "min") {
                    range.push(Lang.ID_MIN);
                } else if (token === "max") {
                    range.push(Lang.ID_MAX);
                } else {
                    range.push(this._parseNumber(token));
                }
                token = this.tn.next();
                if (token !== Lang.END) {
                    throw(new Error("Illegal extension delimiter in message "+msg.name+" at line "+this.tn.line+": "+token+" ('"+Lang.END+"' expected)"));
                }
                return range;
            };
        
            /**
             * Parses an extend block.
             * @param {Object} parent Parent object
             * @param {string} token Initial token
             * @throws {Error} If the extend block cannot be parsed
             * @private
             */
            Parser.prototype._parseExtend = function(parent, token) {
                token = this.tn.next();
                if (!Lang.TYPEREF.test(token)) {
                    throw(new Error("Illegal extended message name at line "+this.tn.line+": "+token));
                }
                /** @dict */
                var ext = {};
                ext["ref"] = token;
                ext["fields"] = [];
                token = this.tn.next();
                if (token !== Lang.OPEN) {
                    throw(new Error("Illegal OPEN in extend "+ext.name+" at line "+this.tn.line+": "+token+" ('"+Lang.OPEN+"' expected)"));
                }
                do {
                    token = this.tn.next();
                    if (token === Lang.CLOSE) {
                        token = this.tn.peek();
                        if (token == Lang.END) this.tn.next();
                        break;
                    } else if (Lang.RULE.test(token)) {
                        this._parseMessageField(ext, token);
                    } else {
                        throw(new Error("Illegal token in extend "+ext.name+" at line "+this.tn.line+": "+token+" (rule or '"+Lang.CLOSE+"' expected)"));
                    }
                } while (true);
                parent["messages"].push(ext);
                return ext;
            };
        
            /**
             * Returns a string representation of this object.
             * @returns {string} String representation as of "Parser"
             */
            Parser.prototype.toString = function() {
                return "Parser";
            };
            
            return Parser;
            
        })(ProtoBuf, ProtoBuf.Lang, ProtoBuf.DotProto.Tokenizer);
                        
        /**
         * @alias ProtoBuf.Reflect
         * @expose
         */
        ProtoBuf.Reflect = (function(ProtoBuf) {
            "use strict";
            
            /**
             * @exports ProtoBuf.Reflect
             * @namespace
             */
            var Reflect = {};
        
            /**
             * Constructs a Reflect base class.
             * @exports ProtoBuf.Reflect.T
             * @constructor
             * @param {ProtoBuf.Reflect.T} parent Parent object
             * @param {string} name Object name
             */
            var T = function(parent, name) {
                /**
                 * Parent object.
                 * @type {ProtoBuf.Reflect.T|null}
                 * @expose
                 */
                this.parent = parent;
        
                /**
                 * Object name in namespace.
                 * @type {string}
                 * @expose
                 */
                this.name = name;
            };
        
            /**
             * Returns the fully qualified name of this object.
             * @returns {string} Fully qualified name as of ".PATH.TO.THIS"
             * @expose
             */
            T.prototype.fqn = function() {
                var name = this.name,
                    ptr = this;
                do {
                    ptr = ptr.parent;
                    if (ptr == null) break;
                    name = ptr.name+"."+name;
                } while (true);
                return name;
            };
        
            /**
             * Returns a string representation of this Reflect object (its fully qualified name).
             * @param {boolean=} includeClass Set to true to include the class name. Defaults to false.
             * @return String representation
             * @expose
             */
            T.prototype.toString = function(includeClass) {
                var name = this.fqn();
                if (includeClass) {
                    if (this instanceof Message) {
                        name = "Message "+name;
                    } else if (this instanceof Message.Field) {
                        name = "Message.Field "+name;
                    } else if (this instanceof Enum) {
                        name = "Enum "+name;
                    } else if (this instanceof Enum.Value) {
                        name = "Enum.Value "+name;
                    } else if (this instanceof Service) {
                        name = "Service "+name;
                    } else if (this instanceof Service.Method) {
                        if (this instanceof Service.RPCMethod) {
                            name = "Service.RPCMethod "+name;
                        } else {
                            name = "Service.Method "+name; // Should not happen as it is abstract
                        }
                    } else if (this instanceof Namespace) {
                        name = "Namespace "+name;
                    }
                }
                return name;
            };
        
            /**
             * Builds this type.
             * @throws {Error} If this type cannot be built directly
             * @expose
             */
            T.prototype.build = function() {
                throw(new Error(this.toString(true)+" cannot be built directly"));
            };
        
            /**
             * @alias ProtoBuf.Reflect.T
             * @expose
             */
            Reflect.T = T;
        
            /**
             * Constructs a new Namespace.
             * @exports ProtoBuf.Reflect.Namespace
             * @param {ProtoBuf.Reflect.Namespace|null} parent Namespace parent
             * @param {string} name Namespace name
             * @param {Object.<string,*>} options Namespace options
             * @constructor
             * @extends ProtoBuf.Reflect.T
             */
            var Namespace = function(parent, name, options) {
                T.call(this, parent, name);
        
                /**
                 * Children inside the namespace.
                 * @type {Array.<ProtoBuf.Reflect.T>}
                 */
                this.children = [];
        
                /**
                 * Options.
                 * @type {Object.<string, *>}
                 */
                this.options = options || {};
            };
        
            // Extends T
            Namespace.prototype = Object.create(T.prototype);
        
            /**
             * Returns an array of the namespace's children.
             * @param {ProtoBuf.Reflect.T=} type Filter type (returns instances of this type only). Defaults to null (all children).
             * @return {Array.<ProtoBuf.Reflect.T>}
             * @expose
             */
            Namespace.prototype.getChildren = function(type) {
                type = type || null;
                if (type == null) {
                    return this.children.slice();
                }
                var children = [];
                for (var i=0; i<this.children.length; i++) {
                    if (this.children[i] instanceof type) {
                        children.push(this.children[i]);
                    }
                }
                return children;
            };
        
            /**
             * Adds a child to the namespace.
             * @param {ProtoBuf.Reflect.T} child Child
             * @throws {Error} If the child cannot be added (duplicate)
             * @expose
             */
            Namespace.prototype.addChild = function(child) {
                var other;
                if (other = this.getChild(child.name)) {
                    // Try to revert camelcase transformation on collision
                    if (other instanceof Message.Field && other.name !== other.originalName && !this.hasChild(other.originalName)) {
                        other.name = other.originalName; // Revert previous first (effectively keeps both originals)
                    } else if (child instanceof Message.Field && child.name !== child.originalName && !this.hasChild(child.originalName)) {
                        child.name = child.originalName;
                    } else {
                        throw(new Error("Duplicate name in namespace "+this.toString(true)+": "+child.name));
                    }
                }
                this.children.push(child);
            };
        
            /**
             * Tests if this namespace has a child with the specified name.
             * @param {string|number} nameOrId Child name or id
             * @returns {boolean} true if there is one, else false
             * @expose
             */
            Namespace.prototype.hasChild = function(nameOrId) {
                var i;
                if (typeof nameOrId == 'number') {
                    for (i=0; i<this.children.length; i++) if (typeof this.children[i].id !== 'undefined' && this.children[i].id == nameOrId) return true;
                } else {
                    for (i=0; i<this.children.length; i++) if (typeof this.children[i].name !== 'undefined' && this.children[i].name == nameOrId) return true;
                }
                return false;
            };
        
            /**
             * Gets a child by its name.
             * @param {string|number} nameOrId Child name or id
             * @return {?ProtoBuf.Reflect.T} The child or null if not found
             * @expose
             */
            Namespace.prototype.getChild = function(nameOrId) {
                var i;
                if (typeof nameOrId == 'number') {
                    for (i=0; i<this.children.length; i++) if (typeof this.children[i].id !== 'undefined' && this.children[i].id == nameOrId) return this.children[i];
                } else {
                    for (i=0; i<this.children.length; i++) if (typeof this.children[i].name !== 'undefined' && this.children[i].name == nameOrId) return this.children[i];
                }
                return null;
            };
        
            /**
             * Resolves a reflect object inside of this namespace.
             * @param {string} qn Qualified name to resolve
             * @param {boolean=} excludeFields Excludes fields, defaults to `false`
             * @return {ProtoBuf.Reflect.Namespace|null} The resolved type or null if not found
             * @expose
             */
            Namespace.prototype.resolve = function(qn, excludeFields) {
                var part = qn.split(".");
                var ptr = this, i=0;
                if (part[i] == "") { // Fully qualified name, e.g. ".My.Message'
                    while (ptr.parent != null) {
                        ptr = ptr.parent;
                    }
                    i++;
                }
                var child;
                do {
                    do {
                        child = ptr.getChild(part[i]);
                        if (!child || !(child instanceof Reflect.T) || (excludeFields && child instanceof Reflect.Message.Field)) {
                            ptr = null;
                            break;
                        }
                        ptr = child; i++;
                    } while (i < part.length);
                    if (ptr != null) break; // Found
                    // Else search the parent
                    if (this.parent !== null) {
                        return this.parent.resolve(qn, excludeFields);
                    }
                } while (ptr != null);
                return ptr;
            };
        
            /**
             * Builds the namespace and returns the runtime counterpart.
             * @return {Object.<string,Function|Object>} Runtime namespace
             * @expose
             */
            Namespace.prototype.build = function() {
                /** @dict */
                var ns = {};
                var children = this.getChildren(), child;
                for (var i=0; i<children.length; i++) {
                    child = children[i];
                    if (child instanceof Namespace) {
                        ns[child.name] = child.build();
                    }
                }
                if (Object.defineProperty) {
                    Object.defineProperty(ns, "$options", {
                        "value": this.buildOpt(),
                        "enumerable": false,
                        "configurable": false,
                        "writable": false
                    });
                }
                return ns;
            };
        
            /**
             * Builds the namespace's '$options' property.
             * @return {Object.<string,*>}
             */
            Namespace.prototype.buildOpt = function() {
                var opt = {};
                var keys = Object.keys(this.options);
                for (var i=0; i<keys.length; i++) {
                    var key = keys[i];
                    var val = this.options[keys[i]];
                    // TODO: Options are not resolved, yet.
                    // if (val instanceof Namespace) {
                    //     opt[key] = val.build();
                    // } else {
                        opt[key] = val;
                    // }
                }
                return opt;
            };
        
            /**
             * Gets the value assigned to the option with the specified name.
             * @param {string=} name Returns the option value if specified, otherwise all options are returned.
             * @return {*|Object.<string,*>}null} Option value or NULL if there is no such option
             */
            Namespace.prototype.getOption = function(name) {
                if (typeof name == 'undefined') {
                    return this.options;
                }
                return typeof this.options[name] != 'undefined' ? this.options[name] : null;
            };
        
            /**
             * @alias ProtoBuf.Reflect.Namespace
             * @expose
             */
            Reflect.Namespace = Namespace;
        
            /**
             * Constructs a new Message.
             * @exports ProtoBuf.Reflect.Message
             * @param {ProtoBuf.Reflect.Namespace} parent Parent message or namespace
             * @param {string} name Message name
             * @param {Object.<string,*>} options Message options
             * @constructor
             * @extends ProtoBuf.Reflect.Namespace
             */
            var Message = function(parent, name, options) {
                Namespace.call(this, parent, name, options);
        
                /**
                 * Extensions range.
                 * @type {!Array.<number>}
                 * @expose
                 */
                this.extensions = [ProtoBuf.Lang.ID_MIN, ProtoBuf.Lang.ID_MAX];
        
                /**
                 * Runtime message class.
                 * @type {?function(new:ProtoBuf.Builder.Message)}
                 * @expose
                 */
                this.clazz = null;
            };
        
            // Extends Namespace
            Message.prototype = Object.create(Namespace.prototype);
        
            /**
             * Builds the message and returns the runtime counterpart, which is a fully functional class.
             * @see ProtoBuf.Builder.Message
             * @param {boolean=} rebuild Whether to rebuild or not, defaults to false
             * @return {ProtoBuf.Reflect.Message} Message class
             * @throws {Error} If the message cannot be built
             * @expose
             */
            Message.prototype.build = function(rebuild) {
                if (this.clazz && !rebuild) return this.clazz;
                
                // We need to create a prototyped Message class in an isolated scope
                var clazz = (function(ProtoBuf, T) {
                    var fields = T.getChildren(Reflect.Message.Field);
        
                    /**
                     * Constructs a new runtime Message.
                     * @name ProtoBuf.Builder.Message
                     * @class Barebone of all runtime messages.
                     * @param {Object.<string,*>|...[string]} values Preset values
                     * @constructor
                     * @throws {Error} If the message cannot be created
                     */
                    var Message = function(values) {
                        ProtoBuf.Builder.Message.call(this);
                        var i, field;
        
                        // Create fields on the object itself to allow setting and getting through Message#fieldname
                        for (i=0; i<fields.length; i++) {
                            field = fields[i];
                            this[field.name] = (field.repeated) ? [] : null;
                        }
                        // Set the default values
                        for (i=0; i<fields.length; i++) {
                            field = fields[i];
                            if (typeof field.options['default'] != 'undefined') {
                                try {
                                    this.set(field.name, field.options['default']); // Should not throw
                                } catch (e) {
                                    throw(new Error("[INTERNAL] "+e));
                                }
                            }
                        }
                        // Set field values from a values object
                        if (arguments.length == 1 && typeof values == 'object' &&
                            /* not another Message */ typeof values.encode != 'function' &&
                            /* not a repeated field */ !ProtoBuf.Util.isArray(values) &&
                            /* not a ByteBuffer */ !(values instanceof ByteBuffer) &&
                            /* not an ArrayBuffer */ !(values instanceof ArrayBuffer) &&
                            /* not a Long */ !(ProtoBuf.Long && values instanceof ProtoBuf.Long)) {
                            var keys = Object.keys(values);
                            for (i=0; i<keys.length; i++) {
                                this.set(keys[i], values[keys[i]]); // May throw
                            }
                            // Else set field values from arguments, in correct order
                        } else {
                            for (i=0; i<arguments.length; i++) {
                                if (i<fields.length) {
                                    this.set(fields[i].name, arguments[i]); // May throw
                                }
                            }
                        }
                    };
        
                    // Extends ProtoBuf.Builder.Message
                    Message.prototype = Object.create(ProtoBuf.Builder.Message.prototype);
        
                    /**
                     * Adds a value to a repeated field.
                     * @name ProtoBuf.Builder.Message#add
                     * @function
                     * @param {string} key Field name
                     * @param {*} value Value to add
                     * @throws {Error} If the value cannot be added
                     * @expose
                     */
                    Message.prototype.add = function(key, value) {
                        var field = T.getChild(key);
                        if (!field) {
                            throw(new Error(this+"#"+key+" is undefined"));
                        }
                        if (!(field instanceof ProtoBuf.Reflect.Message.Field)) {
                            throw(new Error(this+"#"+key+" is not a field: "+field.toString(true))); // May throw if it's an enum or embedded message
                        }
                        if (!field.repeated) {
                            throw(new Error(this+"#"+key+" is not a repeated field"));
                        }
                        if (this[field.name] === null) this[field.name] = [];
                        this[field.name].push(field.verifyValue(value, true));
                    };
        
                    /**
                     * Sets a field value.
                     * @name ProtoBuf.Builder.Message#set
                     * @function
                     * @param {string} key Key
                     * @param {*} value Value to set
                     * @throws {Error} If the value cannot be set
                     * @expose
                     */
                    Message.prototype.set = function(key, value) {
                        var field = T.getChild(key);
                        if (!field) {
                            throw(new Error(this+"#"+key+" is not a field: undefined"));
                        }
                        if (!(field instanceof ProtoBuf.Reflect.Message.Field)) {
                            throw(new Error(this+"#"+key+" is not a field: "+field.toString(true)));
                        }
                        this[field.name] = field.verifyValue(value); // May throw
                    };
        
                    /**
                     * Gets a value.
                     * @name ProtoBuf.Builder.Message#get
                     * @function
                     * @param {string} key Key
                     * @return {*} Value
                     * @throws {Error} If there is no such field
                     * @expose
                     */
                    Message.prototype.get = function(key) {
                        var field = T.getChild(key);
                        if (!field || !(field instanceof ProtoBuf.Reflect.Message.Field)) {
                            throw(new Error(this+"#"+key+" is not a field: undefined"));
                        }
                        if (!(field instanceof ProtoBuf.Reflect.Message.Field)) {
                            throw(new Error(this+"#"+key+" is not a field: "+field.toString(true)));
                        }
                        return this[field.name];
                    };
        
                    // Getters and setters
        
                    for (var i=0; i<fields.length; i++) {
                        var field = fields[i];
                        
                        (function(field) {
                            // set/get[SomeValue]
                            var Name = field.originalName.replace(/(_[a-zA-Z])/g,
                                function(match) {
                                    return match.toUpperCase().replace('_','');
                                }
                            );
                            Name = Name.substring(0,1).toUpperCase()+Name.substring(1);
            
                            // set/get_[some_value]
                            var name = field.originalName.replace(/([A-Z])/g,
                                function(match) {
                                    return "_"+match;
                                }
                            );
            
                            /**
                             * Sets a value. This method is present for each field, but only if there is no name conflict with
                             * another field.
                             * @name ProtoBuf.Builder.Message#set[SomeField]
                             * @function
                             * @param {*} value Value to set
                             * @abstract
                             * @throws {Error} If the value cannot be set
                             */
                            if (!T.hasChild("set"+Name)) {
                                Message.prototype["set"+Name] = function(value) {
                                    this.set(field.name, value);
                                }
                            }
            
                            /**
                             * Sets a value. This method is present for each field, but only if there is no name conflict with
                             * another field.
                             * @name ProtoBuf.Builder.Message#set_[some_field]
                             * @function
                             * @param {*} value Value to set
                             * @abstract
                             * @throws {Error} If the value cannot be set
                             */
                            if (!T.hasChild("set_"+name)) {
                                Message.prototype["set_"+name] = function(value) {
                                    this.set(field.name, value);
                                };
                            }
            
                            /**
                             * Gets a value. This method is present for each field, but only if there is no name conflict with
                             * another field.
                             * @name ProtoBuf.Builder.Message#get[SomeField]
                             * @function
                             * @abstract
                             * @return {*} The value
                             */
                            if (!T.hasChild("get"+Name)) {
                                Message.prototype["get"+Name] = function() {
                                    return this.get(field.name); // Does not throw, field exists
                                }
                            }
            
                            /**
                             * Gets a value. This method is present for each field, but only if there is no name conflict with
                             * another field.
                             * @name ProtoBuf.Builder.Message#get_[some_field]
                             * @function
                             * @return {*} The value
                             * @abstract
                             */
                            if (!T.hasChild("get_"+name)) {
                                Message.prototype["get_"+name] = function() {
                                    return this.get(field.name); // Does not throw, field exists
                                };
                            }
                            
                        })(field);
                    }
        
                    // En-/decoding
        
                    /**
                     * Encodes the message.
                     * @name ProtoBuf.Builder.Message#encode
                     * @function
                     * @param {(!ByteBuffer|boolean)=} buffer ByteBuffer to encode to. Will create a new one if omitted.
                     * @return {!ByteBuffer} Encoded message as a ByteBuffer
                     * @throws {Error} If the message cannot be encoded or if required fields are missing. The later still
                     *  returns the encoded ByteBuffer in the `encoded` property on the error.
                     * @expose
                     * @see ProtoBuf.Builder.Message#encode64
                     * @see ProtoBuf.Builder.Message#encodeHex
                     * @see ProtoBuf.Builder.Message#encodeAB
                     */
                    Message.prototype.encode = function(buffer) {
                        buffer = buffer || new ByteBuffer();
                        var le = buffer.littleEndian;
                        try {
                            return T.encode(this, buffer.LE()).flip().LE(le);
                        } catch (e) {
                            buffer.LE(le);
                            throw(e);
                        }
                    };
        
                    /**
                     * Directly encodes the message to an ArrayBuffer.
                     * @name ProtoBuf.Builder.Message#encodeAB
                     * @function
                     * @return {ArrayBuffer} Encoded message as ArrayBuffer
                     * @throws {Error} If the message cannot be encoded or if required fields are missing. The later still
                     *  returns the encoded ArrayBuffer in the `encoded` property on the error.
                     * @expose
                     */
                    Message.prototype.encodeAB = function() {
                        var enc;
                        try {
                            return this.encode().toArrayBuffer();
                        } catch (err) {
                            if (err["encoded"]) err["encoded"] = err["encoded"].toArrayBuffer();
                            throw(err);
                        }
                    };
        
                    /**
                     * Returns the message as an ArrayBuffer. This is an alias for {@link ProtoBuf.Builder.Message#encodeAB}.
                     * @name ProtoBuf.Builder.Message#toArrayBuffer
                     * @function
                     * @return {ArrayBuffer} Encoded message as ArrayBuffer
                     * @throws {Error} If the message cannot be encoded or if required fields are missing. The later still
                     *  returns the encoded ArrayBuffer in the `encoded` property on the error.
                     * @expose
                     */
                    Message.prototype.toArrayBuffer = Message.prototype.encodeAB;
        
                    /**
                     * Directly encodes the message to a node Buffer.
                     * @name ProtoBuf.Builder.Message#encodeNB
                     * @function
                     * @return {!Buffer}
                     * @throws {Error} If the message cannot be encoded, not running under node.js or if required fields are
                     *  missing. The later still returns the encoded node Buffer in the `encoded` property on the error.
                     * @expose
                     */
                    Message.prototype.encodeNB = function() {
                        try {
                            return this.encode().toBuffer();
                        } catch (err) {
                            if (err["encoded"]) err["encoded"] = err["encoded"].toBuffer();
                            throw(err);
                        }
                    };
        
                    /**
                     * Returns the message as a node Buffer. This is an alias for {@link ProtoBuf.Builder.Message#encodeNB}.
                     * @name ProtoBuf.Builder.Message#encodeNB
                     * @function
                     * @return {!Buffer}
                     * @throws {Error} If the message cannot be encoded or if required fields are missing. The later still
                     *  returns the encoded node Buffer in the `encoded` property on the error.
                     * @expose
                     */
                    Message.prototype.toBuffer = Message.prototype.encodeNB;
        
                    /**
                     * Directly encodes the message to a base64 encoded string.
                     * @name ProtoBuf.Builder.Message#encode64
                     * @function
                     * @return {string} Base64 encoded string
                     * @throws {Error} If the underlying buffer cannot be encoded or if required fields are missing. The later
                     *  still returns the encoded base64 string in the `encoded` property on the error.
                     * @expose
                     */
                    Message.prototype.encode64 = function() {
                        try {
                            return this.encode().toBase64();
                        } catch (err) {
                            if (err["encoded"]) err["encoded"] = err["encoded"].toBase64();
                            throw(err);
                        }
                    };
        
                    /**
                     * Returns the message as a base64 encoded string. This is an alias for {@link ProtoBuf.Builder.Message#encode64}.
                     * @name ProtoBuf.Builder.Message#toBase64
                     * @function
                     * @return {string} Base64 encoded string
                     * @throws {Error} If the message cannot be encoded or if required fields are missing. The later still
                     *  returns the encoded base64 string in the `encoded` property on the error.
                     * @expose
                     */
                    Message.prototype.toBase64 = Message.prototype.encode64;
        
                    /**
                     * Directly encodes the message to a hex encoded string.
                     * @name ProtoBuf.Builder.Message#encodeHex
                     * @function
                     * @return {string} Hex encoded string
                     * @throws {Error} If the underlying buffer cannot be encoded or if required fields are missing. The later
                     *  still returns the encoded hex string in the `encoded` property on the error.
                     * @expose
                     */
                    Message.prototype.encodeHex = function() {
                        try {
                            return this.encode().toHex();
                        } catch (err) {
                            if (err["encoded"]) err["encoded"] = err["encoded"].toHex();
                            throw(err);
                        }
                    };
        
                    /**
                     * Returns the message as a hex encoded string. This is an alias for {@link ProtoBuf.Builder.Message#encodeHex}.
                     * @name ProtoBuf.Builder.Message#toHex
                     * @function
                     * @return {string} Hex encoded string
                     * @throws {Error} If the message cannot be encoded or if required fields are missing. The later still
                     *  returns the encoded hex string in the `encoded` property on the error.
                     * @expose
                     */
                    Message.prototype.toHex = Message.prototype.encodeHex;
        
                    /**
                     * Decodes the message from the specified buffer or string.
                     * @name ProtoBuf.Builder.Message.decode
                     * @function
                     * @param {!ByteBuffer|!ArrayBuffer|!Buffer|string} buffer Buffer to decode from
                     * @param {string=} enc Encoding if buffer is a string: hex, utf8 (not recommended), defaults to base64
                     * @return {!ProtoBuf.Builder.Message} Decoded message
                     * @throws {Error} If the message cannot be decoded or if required fields are missing. The later still
                     *  returns the decoded message with missing fields in the `decoded` property on the error.
                     * @expose
                     * @see ProtoBuf.Builder.Message.decode64
                     * @see ProtoBuf.Builder.Message.decodeHex
                     */
                    Message.decode = function(buffer, enc) {
                        if (buffer === null) throw(new Error("buffer must not be null"));
                        if (typeof buffer === 'string') {
                            buffer = ByteBuffer.wrap(buffer, enc ? enc : "base64");
                        }
                        buffer = buffer instanceof ByteBuffer ? buffer : ByteBuffer.wrap(buffer); // May throw
                        var le = buffer.littleEndian;
                        try {
                            var msg = T.decode(buffer.LE());
                            buffer.LE(le);
                            return msg;
                        } catch (e) {
                            buffer.LE(le);
                            throw(e);
                        }
                    };
        
                    /**
                     * Decodes the message from the specified base64 encoded string.
                     * @name ProtoBuf.Builder.Message.decode64
                     * @function
                     * @param {string} str String to decode from
                     * @return {!ProtoBuf.Builder.Message} Decoded message
                     * @throws {Error} If the message cannot be decoded or if required fields are missing. The later still
                     *  returns the decoded message with missing fields in the `decoded` property on the error.
                     * @expose
                     */
                    Message.decode64 = function(str) {
                        return Message.decode(str, "base64");
                    };
        
                    /**
                     * Decodes the message from the specified hex encoded string.
                     * @name ProtoBuf.Builder.Message.decodeHex
                     * @function
                     * @param {string} str String to decode from
                     * @return {!ProtoBuf.Builder.Message} Decoded message
                     * @throws {Error} If the message cannot be decoded or if required fields are missing. The later still
                     *  returns the decoded message with missing fields in the `decoded` property on the error.
                     * @expose
                     */
                    Message.decodeHex = function(str) {
                        return Message.decode(str, "hex");
                    };
        
                    // Utility
        
                    /**
                     * Returns a string representation of this Message.
                     * @name ProtoBuf.Builder.Message#toString
                     * @function
                     * @return {string} String representation as of ".Fully.Qualified.MessageName"
                     * @expose
                     */
                    Message.prototype.toString = function() {
                        return T.toString();
                    };
        
                    // Static
                    
                    /**
                     * Options.
                     * @name ProtoBuf.Builder.Message.$options
                     * @type {Object.<string,*>}
                     * @expose
                     */
                    var O_o; // for cc
                    
                    if (Object.defineProperty) {
                        Object.defineProperty(Message, '$options', {
                            'value': T.buildOpt(),
                            'enumerable': false,
                            'configurable': false,
                            'writable': false
                        });
                    }
                    
                    return Message;
        
                })(ProtoBuf, this);
        
                // Static enums and prototyped sub-messages
                var children = this.getChildren();
                for (var i=0; i<children.length; i++) {
                    if (children[i] instanceof Enum) {
                        clazz[children[i]['name']] = children[i].build();
                    } else if (children[i] instanceof Message) {
                        clazz[children[i]['name']] = children[i].build();
                    } else if (children[i] instanceof Message.Field) {
                        // Ignore
                    } else {
                        throw(new Error("Illegal reflect child of "+this.toString(true)+": "+children[i].toString(true)));
                    }
                }
                return this.clazz = clazz;
            };
        
            /**
             * Encodes a runtime message's contents to the specified buffer.
             * @param {ProtoBuf.Builder.Message} message Runtime message to encode
             * @param {ByteBuffer} buffer ByteBuffer to write to
             * @return {ByteBuffer} The ByteBuffer for chaining
             * @throws {string} If requried fields are missing or the message cannot be encoded for another reason
             * @expose
             */
            Message.prototype.encode = function(message, buffer) {
                var fields = this.getChildren(Message.Field),
                    fieldMissing = null;
                for (var i=0; i<fields.length; i++) {
                    var val = message.get(fields[i].name);
                    if (fields[i].required && val === null) {
                        if (fieldMissing === null) fieldMissing = fields[i];
                    } else {
                        fields[i].encode(val, buffer);
                    }
                }
                if (fieldMissing !== null) {
                    var err = new Error("Missing at least one required field for "+this.toString(true)+": "+fieldMissing);
                    err["encoded"] = buffer; // Still expose what we got
                    throw(err);
                }
                return buffer;
            };
        
            /**
             * Decodes an encoded message and returns the decoded message.
             * @param {ByteBuffer} buffer ByteBuffer to decode from
             * @param {number=} length Message length. Defaults to decode all the available data.
             * @return {ProtoBuf.Builder.Message} Decoded message
             * @throws {Error} If the message cannot be decoded
             * @expose
             */
            Message.prototype.decode = function(buffer, length) {
                length = typeof length === 'number' ? length : -1;
                var start = buffer.offset;
                var msg = new (this.clazz)();
                while (buffer.offset < start+length || (length == -1 && buffer.remaining() > 0)) {
                    var tag = buffer.readVarint32();
                    var wireType = tag & 0x07,
                        id = tag >> 3;
                    var field = this.getChild(id); // Message.Field only
                    if (!field) {
                        // "messages created by your new code can be parsed by your old code: old binaries simply ignore the new field when parsing."
                        switch (wireType) {
                            case ProtoBuf.WIRE_TYPES.VARINT:
                                buffer.readVarint32();
                                break;
                            case ProtoBuf.WIRE_TYPES.BITS32:
                                buffer.offset += 4;
                                break;
                            case ProtoBuf.WIRE_TYPES.BITS64:
                                buffer.offset += 8;
                                break;
                            case ProtoBuf.WIRE_TYPES.LDELIM:
                                var len = buffer.readVarint32();
                                buffer.offset += len;
                                break;
                            default:
                                throw(new Error("Illegal wire type of unknown field "+id+" in "+this.toString(true)+"#decode: "+wireType));
                        }
                        continue;
                    }
                    if (field.repeated && !field.options["packed"]) {
                        msg.add(field.name, field.decode(wireType, buffer));
                    } else {
                        msg.set(field.name, field.decode(wireType, buffer));
                    }
                }
                // Check if all required fields are present
                var fields = this.getChildren(ProtoBuf.Reflect.Field);
                for (var i=0; i<fields.length; i++) {
                    if (fields[i].required && msg[fields[i].name] === null) {
                        var err = new Error("Missing at least one required field for "+this.toString(true)+": "+fields[i].name);
                        err["decoded"] = msg; // Still expose what we got
                        throw(err);
                    }
                }
                return msg;
            };
        
            /**
             * @alias ProtoBuf.Reflect.Message
             * @expose
             */
            Reflect.Message = Message;
        
            /**
             * Constructs a new Message Field.
             * @exports ProtoBuf.Reflect.Message.Field
             * @param {ProtoBuf.Reflect.Message} message Message reference
             * @param {string} rule Rule, one of requried, optional, repeated
             * @param {string} type Data type, e.g. int32
             * @param {string} name Field name
             * @param {number} id Unique field id
             * @param {Object.<string.*>=} options Options
             * @constructor
             * @extends ProtoBuf.Reflect.T
             */
            var Field = function(message, rule, type, name, id, options) {
                T.call(this, message, name);
        
                /**
                 * Message field required flag.
                 * @type {boolean}
                 * @expose
                 */
                this.required = rule == "required";
        
                /**
                 * Message field repeated flag.
                 * @type {boolean}
                 * @expose
                 */
                this.repeated = rule == "repeated";
        
                /**
                 * Message field type. Type reference string if unresolved, protobuf type if resolved.
                 * @type {string|{name: string, wireType: number}
                 * @expose
                 */
                this.type = type;
        
                /**
                 * Resolved type reference inside the global namespace.
                 * @type {ProtoBuf.Reflect.T|null}
                 * @expose
                 */
                this.resolvedType = null;
        
                /**
                 * Unique message field id.
                 * @type {number}
                 * @expose
                 */
                this.id = id;
        
                /**
                 * Message field options.
                 * @type {!Object.<string,*>}
                 * @dict
                 * @expose
                 */
                this.options = options || {};
        
                /**
                 * Original field name.
                 * @type {string}
                 * @expose
                 */
                this.originalName = this.name; // Used to revert camelcase transformation on naming collisions
                
                // Convert field names to camel case notation if the override is set
                if (ProtoBuf.convertFieldsToCamelCase) {
                    this.name = this.name.replace(/_([a-zA-Z])/g, function($0, $1) {
                        return $1.toUpperCase();
                    });
                }
            };
        
            // Extends T
            Field.prototype = Object.create(T.prototype);
        
            /**
             * Checks if the given value can be set for this field.
             * @param {*} value Value to check
             * @param {boolean=} skipRepeated Whether to skip the repeated value check or not. Defaults to false.
             * @return {*} Verified, maybe adjusted, value
             * @throws {Error} If the value cannot be set for this field
             * @expose
             */
            Field.prototype.verifyValue = function(value, skipRepeated) {
                skipRepeated = skipRepeated || false;
                if (value === null) { // NULL values for optional fields
                    if (this.required) {
                        throw(new Error("Illegal value for "+this.toString(true)+": "+value+" (required)"));
                    }
                    return null;
                }
                var i;
                if (this.repeated && !skipRepeated) { // Repeated values as arrays
                    if (!ProtoBuf.Util.isArray(value)) {
                        value = [value];
                    }
                    var res = [];
                    for (i=0; i<value.length; i++) {
                        res.push(this.verifyValue(value[i], true));
                    }
                    return res;
                }
                // All non-repeated fields expect no array
                if (!this.repeated && ProtoBuf.Util.isArray(value)) {
                    throw(new Error("Illegal value for "+this.toString(true)+": "+value+" (no array expected)"));
                }
                // Signed 32bit
                if (this.type == ProtoBuf.TYPES["int32"] || this.type == ProtoBuf.TYPES["sint32"] || this.type == ProtoBuf.TYPES["sfixed32"]) {
                    return isNaN(i = parseInt(value, 10)) ? i : i | 0; // Do not cast NaN as it'd become 0
                }
                // Unsigned 32bit
                if (this.type == ProtoBuf.TYPES["uint32"] || this.type == ProtoBuf.TYPES["fixed32"]) {
                    return isNaN(i = parseInt(value, 10)) ? i : i >>> 0; // Do not cast NaN as it'd become 0
                }
                if (ProtoBuf.Long) {
                    // Signed 64bit
                    if (this.type == ProtoBuf.TYPES["int64"] || this.type == ProtoBuf.TYPES["sint64"] || this.type == ProtoBuf.TYPES["sfixed64"]) {
                        if (!(typeof value == 'object' && value instanceof ProtoBuf.Long)) {
                            return ProtoBuf.Long.fromNumber(value, false);
                        }
                        return value.unsigned ? value.toSigned() : value;
                    }
                    // Unsigned 64bit
                    if (this.type == ProtoBuf.TYPES["uint64"] || this.type == ProtoBuf.TYPES["fixed64"]) {
                        if (!(typeof value == 'object' && value instanceof ProtoBuf.Long)) {
                            return ProtoBuf.Long.fromNumber(value, true);
                        }
                        return value.unsigned ? value : value.toUnsigned();
                    }
                }
                // Bool
                if (this.type == ProtoBuf.TYPES["bool"]) {
                    if (typeof value === 'string') return value === 'true';
                    else return !!value;
                }
                // Float
                if (this.type == ProtoBuf.TYPES["float"] || this.type == ProtoBuf.TYPES["double"]) {
                    return parseFloat(value); // May also become NaN, +Infinity, -Infinity
                }
                // Length-delimited string
                if (this.type == ProtoBuf.TYPES["string"]) {
                    return ""+value;
                }
                // Length-delimited bytes
                if (this.type == ProtoBuf.TYPES["bytes"]) {
                    if (value && value instanceof ByteBuffer) {
                        return value;
                    }
                    return ByteBuffer.wrap(value);
                }
                // Constant enum value
                if (this.type == ProtoBuf.TYPES["enum"]) {
                    var values = this.resolvedType.getChildren(Enum.Value);
                    for (i=0; i<values.length; i++) {
                        if (values[i].name == value) {
                            return values[i].id;
                        } else if (values[i].id == value) {
                            return values[i].id;
                        }
                    }
                    throw(new Error("Illegal value for "+this.toString(true)+": "+value+" (not a valid enum value)"));
                }
                // Embedded message
                if (this.type == ProtoBuf.TYPES["message"]) {
                    if (typeof value !== 'object') {
                        throw(new Error("Illegal value for "+this.toString(true)+": "+value+" (object expected)"));
                    }
                    if (value instanceof this.resolvedType.clazz) {
                        return value;
                    }
                    // Else let's try to construct one from a key-value object
                    return new (this.resolvedType.clazz)(value); // May throw for a hundred of reasons
                }
                // We should never end here
                throw(new Error("[INTERNAL] Illegal value for "+this.toString(true)+": "+value+" (undefined type "+this.type+")"));
            };
        
            /**
             * Encodes the specified field value to the specified buffer.
             * @param {*} value Field value
             * @param {ByteBuffer} buffer ByteBuffer to encode to
             * @return {ByteBuffer} The ByteBuffer for chaining
             * @throws {Error} If the field cannot be encoded
             * @expose
             */
            Field.prototype.encode = function(value, buffer) {
                value = this.verifyValue(value); // May throw
                if (this.type == null || typeof this.type != 'object') {
                    throw(new Error("[INTERNAL] Unresolved type in "+this.toString(true)+": "+this.type));
                }
                if (value === null || (this.repeated && value.length == 0)) return buffer; // Optional omitted
                try {
                    if (this.repeated) {
                        var i;
                        if (this.options["packed"]) {
                            // "All of the elements of the field are packed into a single key-value pair with wire type 2
                            // (length-delimited). Each element is encoded the same way it would be normally, except without a
                            // tag preceding it." 
                            buffer.writeVarint32((this.id << 3) | ProtoBuf.WIRE_TYPES.LDELIM);
                            buffer.ensureCapacity(buffer.offset += 1); // We do not know the length yet, so let's assume a varint of length 1
                            var start = buffer.offset; // Remember where the contents begin
                            for (i=0; i<value.length; i++) {
                                this.encodeValue(value[i], buffer);
                            }
                            var len = buffer.offset-start;
                            var varintLen = ByteBuffer.calculateVarint32(len);
                            if (varintLen > 1) { // We need to move the contents
                                var contents = buffer.slice(start, buffer.offset);
                                start += varintLen-1;
                                buffer.offset = start;
                                buffer.append(contents);
                            }
                            buffer.writeVarint32(len, start-varintLen);
                        } else {
                            // "If your message definition has repeated elements (without the [packed=true] option), the encoded
                            // message has zero or more key-value pairs with the same tag number"
                            for (i=0; i<value.length; i++) {
                                buffer.writeVarint32((this.id << 3) | this.type.wireType);
                                this.encodeValue(value[i], buffer);
                            }
                        }
                    } else {
                        buffer.writeVarint32((this.id << 3) | this.type.wireType);
                        this.encodeValue(value, buffer);
                    }
                } catch (e) {
                    throw(new Error("Illegal value for "+this.toString(true)+": "+value+" ("+e+")"));
                }
                return buffer;
            };
        
            /**
             * Encodes a value to the specified buffer. Does not encode the key.
             * @param {*} value Field value
             * @param {ByteBuffer} buffer ByteBuffer to encode to
             * @return {ByteBuffer} The ByteBuffer for chaining
             * @throws {Error} If the value cannot be encoded
             * @expose
             */
            Field.prototype.encodeValue = function(value, buffer) {
                if (value === null) return; // Nothing to encode
                // Tag has already been written
        
                // 32bit varint as-is
                if (this.type == ProtoBuf.TYPES["int32"] || this.type == ProtoBuf.TYPES["uint32"]) {
                    buffer.writeVarint32(value);
                    
                // 32bit varint zig-zag
                } else if (this.type == ProtoBuf.TYPES["sint32"]) {
                    buffer.writeZigZagVarint32(value);
                    
                // Fixed unsigned 32bit
                } else if (this.type == ProtoBuf.TYPES["fixed32"]) {
                    buffer.writeUint32(value);
                    
                // Fixed signed 32bit
                } else if (this.type == ProtoBuf.TYPES["sfixed32"]) {
                    buffer.writeInt32(value);
                
                // 64bit varint as-is
                } else if (this.type == ProtoBuf.TYPES["int64"] || this.type == ProtoBuf.TYPES["uint64"]) {
                    buffer.writeVarint64(value); // throws
                    
                // 64bit varint zig-zag
                } else if (this.type == ProtoBuf.TYPES["sint64"]) {
                    buffer.writeZigZagVarint64(value); // throws
                    
                // Fixed unsigned 64bit
                } else if (this.type == ProtoBuf.TYPES["fixed64"]) {
                    buffer.writeUint64(value); // throws
                    
                // Fixed signed 64bit
                } else if (this.type == ProtoBuf.TYPES["sfixed64"]) {
                    buffer.writeInt64(value); // throws
                    
                // Bool
                } else if (this.type == ProtoBuf.TYPES["bool"]) {
                    if (typeof value === 'string') buffer.writeVarint32(value.toLowerCase() === 'false' ? 0 : !!value);
                    else buffer.writeVarint32(value ? 1 : 0);
                    
                // Constant enum value
                } else if (this.type == ProtoBuf.TYPES["enum"]) {
                    buffer.writeVarint32(value);
                    
                // 32bit float
                } else if (this.type == ProtoBuf.TYPES["float"]) {
                    buffer.writeFloat32(value);
                    
                // 64bit float
                } else if (this.type == ProtoBuf.TYPES["double"]) {
                    buffer.writeFloat64(value);
                    
                // Length-delimited string
                } else if (this.type == ProtoBuf.TYPES["string"]) {
                    buffer.writeVString(value);
                    
                // Length-delimited bytes
                } else if (this.type == ProtoBuf.TYPES["bytes"]) {
                    if (value.offset > value.length) { // Forgot to flip?
                        buffer = buffer.clone().flip();
                    }
                    buffer.writeVarint32(value.remaining());
                    buffer.append(value);
                    
                // Embedded message
                } else if (this.type == ProtoBuf.TYPES["message"]) {
                    var bb = new ByteBuffer().LE();
                    this.resolvedType.encode(value, bb);
                    buffer.writeVarint32(bb.offset);
                    buffer.append(bb.flip());
                } else {
                    // We should never end here
                    throw(new Error("[INTERNAL] Illegal value to encode in "+this.toString(true)+": "+value+" (unknown type)"));
                }
                return buffer;
            };
        
            /**
             * Decode the field value from the specified buffer.
             * @param {number} wireType Leading wire type
             * @param {ByteBuffer} buffer ByteBuffer to decode from
             * @param {boolean=} skipRepeated Whether to skip the repeated check or not. Defaults to false.
             * @return {*} Decoded value
             * @throws {Error} If the field cannot be decoded
             * @expose
             */
            Field.prototype.decode = function(wireType, buffer, skipRepeated) {
                var value, nBytes;
                if (wireType != this.type.wireType && (skipRepeated || (wireType != ProtoBuf.WIRE_TYPES.LDELIM || !this.repeated))) {
                    throw(new Error("Illegal wire type for field "+this.toString(true)+": "+wireType+" ("+this.type.wireType+" expected)"));
                }
                if (wireType == ProtoBuf.WIRE_TYPES.LDELIM && this.repeated && this.options["packed"]) {
                    if (!skipRepeated) {
                        nBytes = buffer.readVarint32();
                        nBytes = buffer.offset + nBytes; // Limit
                        var values = [];
                        while (buffer.offset < nBytes) {
                            values.push(this.decode(this.type.wireType, buffer, true));
                        }
                        return values;
                    }
                    // Read the next value otherwise...
                    
                }
                // 32bit signed varint
                if (this.type == ProtoBuf.TYPES["int32"]) {
                    return buffer.readVarint32() | 0;
                }
                
                // 32bit unsigned varint
                if (this.type == ProtoBuf.TYPES["uint32"]) {
                    return buffer.readVarint32() >>> 0;
                }
                
                // 32bit signed varint zig-zag
                if (this.type == ProtoBuf.TYPES["sint32"]) {
                    return buffer.readZigZagVarint32() | 0;
                }
                
                // Fixed 32bit unsigned
                if (this.type == ProtoBuf.TYPES["fixed32"]) {
                    return buffer.readUint32() >>> 0;
                }
                
                // Fixed 32bit signed
                if (this.type == ProtoBuf.TYPES["sfixed32"]) {
                    return buffer.readInt32() | 0;
                }
                
                // 64bit signed varint
                if (this.type == ProtoBuf.TYPES["int64"]) {
                    return buffer.readVarint64();
                }
                
                // 64bit unsigned varint
                if (this.type == ProtoBuf.TYPES["uint64"]) {
                    return buffer.readVarint64().toUnsigned();
                }
                
                // 64bit signed varint zig-zag
                if (this.type == ProtoBuf.TYPES["sint64"]) {
                    return buffer.readZigZagVarint64();
                }
        
                // Fixed 64bit unsigned
                if (this.type == ProtoBuf.TYPES["fixed64"]) {
                    return buffer.readUint64();
                }
                
                // Fixed 64bit signed
                if (this.type == ProtoBuf.TYPES["sfixed64"]) {
                    return buffer.readInt64();
                }
                
                // Bool varint
                if (this.type == ProtoBuf.TYPES["bool"]) {
                    return !!buffer.readVarint32();
                }
                
                // Constant enum value varint)
                if (this.type == ProtoBuf.TYPES["enum"]) {
                    return buffer.readVarint32(); // The following Builder.Message#set will already throw
                }
                
                // 32bit float
                if (this.type == ProtoBuf.TYPES["float"]) {
                    return buffer.readFloat();
                }
                // 64bit float
                if (this.type == ProtoBuf.TYPES["double"]) {
                    return buffer.readDouble();
                }
                
                // Length-delimited string
                if (this.type == ProtoBuf.TYPES["string"]){
                    return buffer.readVString();
                }
                
                // Length-delimited bytes
                if (this.type == ProtoBuf.TYPES["bytes"]) {
                    nBytes = buffer.readVarint32();
                    if (buffer.remaining() < nBytes) {
                        throw(new Error("Illegal number of bytes for "+this.toString(true)+": "+nBytes+" required but got only "+buffer.remaining()));
                    }
                    value = buffer.clone(); // Offset already set
                    value.length = value.offset+nBytes;
                    buffer.offset += nBytes;
                    return value;
                }
                
                // Length-delimited embedded message
                if (this.type == ProtoBuf.TYPES["message"]) {
                    nBytes = buffer.readVarint32();
                    return this.resolvedType.decode(buffer, nBytes);
                }
                
                // We should never end here
                throw(new Error("[INTERNAL] Illegal wire type for "+this.toString(true)+": "+wireType));
            };
        
            /**
             * @alias ProtoBuf.Reflect.Message.Field
             * @expose
             */
            Reflect.Message.Field = Field;
        
            /**
             * Constructs a new Enum.
             * @exports ProtoBuf.Reflect.Enum
             * @param {!ProtoBuf.Reflect.T} parent Parent Reflect object
             * @param {string} name Enum name
             * @param {Object.<string.*>=} options Enum options
             * @constructor
             * @extends ProtoBuf.Reflect.Namespace
             */
            var Enum = function(parent, name, options) {
                Namespace.call(this, parent, name, options);
        
                /**
                 * Runtime enum object.
                 * @type {Object.<string,number>|null}
                 * @expose
                 */
                this.object = null;
            };
        
            // Extends Namespace
            Enum.prototype = Object.create(Namespace.prototype);
        
            /**
             * Builds this enum and returns the runtime counterpart.
             * @return {Object<string,*>}
             * @expose
             */
            Enum.prototype.build = function() {
                var enm = {};
                var values = this.getChildren(Enum.Value);
                for (var i=0; i<values.length; i++) {
                    enm[values[i]['name']] = values[i]['id'];
                }
                if (Object.defineProperty) {
                    Object.defineProperty(enm, '$options', {
                        'value': this.buildOpt(),
                        'enumerable': false,
                        'configurable': false,
                        'writable': false
                    });
                }
                return this.object = enm;
            };
        
            /**
             * @alias ProtoBuf.Reflect.Enum
             * @expose
             */
            Reflect.Enum = Enum;
        
            /**
             * Constructs a new Enum Value.
             * @exports ProtoBuf.Reflect.Enum.Value
             * @param {!ProtoBuf.Reflect.Enum} enm Enum reference
             * @param {string} name Field name
             * @param {number} id Unique field id
             * @constructor
             * @extends ProtoBuf.Reflect.T
             */
            var Value = function(enm, name, id) {
                T.call(this, enm, name);
        
                /**
                 * Unique enum value id.
                 * @type {number}
                 * @expose
                 */
                this.id = id;
            };
        
            // Extends T
            Value.prototype = Object.create(T.prototype);
        
            /**
             * @alias ProtoBuf.Reflect.Enum.Value
             * @expose
             */
            Reflect.Enum.Value = Value;
        
            /**
             * Constructs a new Service.
             * @exports ProtoBuf.Reflect.Service
             * @param {!ProtoBuf.Reflect.Namespace} root Root
             * @param {string} name Service name
             * @param {Object.<string,*>=} options Options
             * @constructor
             * @extends ProtoBuf.Reflect.Namespace
             */
            var Service = function(root, name, options) {
                Namespace.call(this, root, name, options);
        
                /**
                 * Built runtime service class.
                 * @type {?function(new:ProtoBuf.Builder.Service)}
                 */
                this.clazz = null;
            };
            
            // Extends Namespace
            Service.prototype = Object.create(Namespace.prototype);
        
            /**
             * Builds the service and returns the runtime counterpart, which is a fully functional class.
             * @see ProtoBuf.Builder.Service
             * @param {boolean=} rebuild Whether to rebuild or not
             * @return {Function} Service class
             * @throws {Error} If the message cannot be built
             * @expose
             */
            Service.prototype.build = function(rebuild) {
                if (this.clazz && !rebuild) return this.clazz;
                return this.clazz = (function(ProtoBuf, T) {
        
                    /**
                     * Constructs a new runtime Service.
                     * @name ProtoBuf.Builder.Service
                     * @param {function(string, ProtoBuf.Builder.Message, function(Error, ProtoBuf.Builder.Message=))=} rpcImpl RPC implementation receiving the method name and the message
                     * @class Barebone of all runtime services.
                     * @constructor
                     * @throws {Error} If the service cannot be created
                     */
                    var Service = function(rpcImpl) {
                        ProtoBuf.Builder.Service.call(this);
        
                        /**
                         * Service implementation.
                         * @name ProtoBuf.Builder.Service#rpcImpl
                         * @type {!function(string, ProtoBuf.Builder.Message, function(Error, ProtoBuf.Builder.Message=))}
                         * @expose
                         */
                        this.rpcImpl = rpcImpl || function(name, msg, callback) {
                            // This is what a user has to implement: A function receiving the method name, the actual message to
                            // send (type checked) and the callback that's either provided with the error as its first
                            // argument or null and the actual response message.
                            setTimeout(callback.bind(this, new Error("Not implemented, see: https://github.com/dcodeIO/ProtoBuf.js/wiki/Services")), 0); // Must be async!
                        };
                    };
                    
                    // Extends ProtoBuf.Builder.Service
                    Service.prototype = Object.create(ProtoBuf.Builder.Service.prototype);
                    
                    if (Object.defineProperty) {
                        Object.defineProperty(Service, "$options", {
                            "value": T.buildOpt(),
                            "enumerable": false,
                            "configurable": false,
                            "writable": false
                        });
                        Object.defineProperty(Service.prototype, "$options", {
                            "value": Service["$options"],
                            "enumerable": false,
                            "configurable": false,
                            "writable": false
                        });
                    }
        
                    /**
                     * Asynchronously performs an RPC call using the given RPC implementation.
                     * @name ProtoBuf.Builder.Service.[Method]
                     * @function
                     * @param {!function(string, ProtoBuf.Builder.Message, function(Error, ProtoBuf.Builder.Message=))} rpcImpl RPC implementation
                     * @param {ProtoBuf.Builder.Message} req Request
                     * @param {function(Error, (ProtoBuf.Builder.Message|ByteBuffer|Buffer|string)=)} callback Callback receiving
                     *  the error if any and the response either as a pre-parsed message or as its raw bytes
                     * @abstract
                     */
        
                    /**
                     * Asynchronously performs an RPC call using the instance's RPC implementation.
                     * @name ProtoBuf.Builder.Service#[Method]
                     * @function
                     * @param {ProtoBuf.Builder.Message} req Request
                     * @param {function(Error, (ProtoBuf.Builder.Message|ByteBuffer|Buffer|string)=)} callback Callback receiving
                     *  the error if any and the response either as a pre-parsed message or as its raw bytes
                     * @abstract
                     */
                    
                    var rpc = T.getChildren(Reflect.Service.RPCMethod);
                    for (var i=0; i<rpc.length; i++) {
                        (function(method) {
                            
                            // service#Method(message, callback)
                            Service.prototype[method.name] = function(req, callback) {
                                try {
                                    if (!req || !(req instanceof method.resolvedRequestType.clazz)) {
                                        setTimeout(callback.bind(this, new Error("Illegal request type provided to service method "+T.name+"#"+method.name)));
                                    }
                                    this.rpcImpl(method.fqn(), req, function(err, res) { // Assumes that this is properly async
                                        if (err) {
                                            callback(err);
                                            return;
                                        }
                                        try { res = method.resolvedResponseType.clazz.decode(res); } catch (notABuffer) {}
                                        if (!res || !(res instanceof method.resolvedResponseType.clazz)) {
                                            callback(new Error("Illegal response type received in service method "+ T.name+"#"+method.name));
                                            return;
                                        }
                                        callback(null, res);
                                    });
                                } catch (err) {
                                    setTimeout(callback.bind(this, err), 0);
                                }
                            };
        
                            // Service.Method(rpcImpl, message, callback)
                            Service[method.name] = function(rpcImpl, req, callback) {
                                new Service(rpcImpl)[method.name](req, callback);
                            };
        
                            if (Object.defineProperty) {
                                Object.defineProperty(Service[method.name], "$options", {
                                    "value": method.buildOpt(),
                                    "enumerable": false,
                                    "configurable": false,
                                    "writable": false
                                });
                                Object.defineProperty(Service.prototype[method.name], "$options", {
                                    "value": Service[method.name]["$options"],
                                    "enumerable": false,
                                    "configurable": false,
                                    "writable": false
                                });
                            }
                        })(rpc[i]);
                    }
                    
                    return Service;
                    
                })(ProtoBuf, this);
            };
            
            Reflect.Service = Service;
        
            /**
             * Abstract service method.
             * @exports ProtoBuf.Reflect.Service.Method
             * @param {!ProtoBuf.Reflect.Service} svc Service
             * @param {string} name Method name
             * @param {Object.<string,*>=} options Options
             * @constructor
             * @extends ProtoBuf.Reflect.T
             */
            var Method = function(svc, name, options) {
                T.call(this, svc, name);
        
                /**
                 * Options.
                 * @type {Object.<string, *>}
                 * @expose
                 */
                this.options = options || {};
            };
            
            // Extends T
            Method.prototype = Object.create(T.prototype);
        
            /**
             * Builds the method's '$options' property.
             * @name ProtoBuf.Reflect.Service.Method#buildOpt
             * @function
             * @return {Object.<string,*>}
             */
            Method.prototype.buildOpt = Namespace.prototype.buildOpt;
        
            /**
             * @alias ProtoBuf.Reflect.Service.Method
             * @expose
             */
            Reflect.Service.Method = Method;
        
            /**
             * RPC service method.
             * @exports ProtoBuf.Reflect.Service.RPCMethod
             * @param {!ProtoBuf.Reflect.Service} svc Service
             * @param {string} name Method name
             * @param {string} request Request message name
             * @param {string} response Response message name
             * @param {Object.<string,*>=} options Options
             * @constructor
             * @extends ProtoBuf.Reflect.Service.Method
             */
            var RPCMethod = function(svc, name, request, response, options) {
                Method.call(this, svc, name, options);
        
                /**
                 * Request message name.
                 * @type {string}
                 * @expose
                 */
                this.requestName = request;
        
                /**
                 * Response message name.
                 * @type {string}
                 * @expose
                 */
                this.responseName = response;
        
                /**
                 * Resolved request message type.
                 * @type {ProtoBuf.Reflect.Message}
                 * @expose
                 */
                this.resolvedRequestType = null;
        
                /**
                 * Resolved response message type.
                 * @type {ProtoBuf.Reflect.Message}
                 * @expose
                 */
                this.resolvedResponseType = null;
            };
            
            // Extends Method
            RPCMethod.prototype = Object.create(Method.prototype);
        
            /**
             * @alias ProtoBuf.Reflect.Service.RPCMethod
             * @expose
             */
            Reflect.Service.RPCMethod = RPCMethod;
            
            return Reflect;
        })(ProtoBuf);
                
        /**
         * @alias ProtoBuf.Builder
         * @expose
         */
        ProtoBuf.Builder = (function(ProtoBuf, Lang, Reflect) {
            "use strict";
            
            /**
             * Constructs a new Builder.
             * @exports ProtoBuf.Builder
             * @class Provides the functionality to build protocol messages.
             * @constructor
             */
            var Builder = function() {
        
                /**
                 * Namespace.
                 * @type {ProtoBuf.Reflect.Namespace}
                 * @expose
                 */
                this.ns = new Reflect.Namespace(null, ""); // Global namespace
        
                /**
                 * Namespace pointer.
                 * @type {ProtoBuf.Reflect.T}
                 * @expose
                 */
                this.ptr = this.ns;
        
                /**
                 * Resolved flag.
                 * @type {boolean}
                 * @expose
                 */
                this.resolved = false;
        
                /**
                 * The current building result.
                 * @type {Object.<string,ProtoBuf.Builder.Message|Object>|null}
                 * @expose
                 */
                this.result = null;
        
                /**
                 * Imported files.
                 * @type {Array.<string>}
                 * @expose
                 */
                this.files = {};
        
                /**
                 * Import root override.
                 * @type {?string}
                 * @expose
                 */
                this.importRoot = null;
            };
        
            /**
             * Resets the pointer to the global namespace.
             * @expose
             */
            Builder.prototype.reset = function() {
                this.ptr = this.ns;
            };
        
            /**
             * Defines a package on top of the current pointer position and places the pointer on it.
             * @param {string} pkg
             * @param {Object.<string,*>=} options
             * @return {ProtoBuf.Builder} this
             * @throws {Error} If the package name is invalid
             * @expose
             */
            Builder.prototype.define = function(pkg, options) {
                if (typeof pkg !== 'string' || !Lang.TYPEREF.test(pkg)) {
                    throw(new Error("Illegal package name: "+pkg));
                }
                var part = pkg.split("."), i;
                for (i=0; i<part.length; i++) { // To be absolutely sure
                    if (!Lang.NAME.test(part[i])) {
                        throw(new Error("Illegal package name: "+part[i]));
                    }
                }
                for (i=0; i<part.length; i++) {
                    if (!this.ptr.hasChild(part[i])) { // Keep existing namespace
                        this.ptr.addChild(new Reflect.Namespace(this.ptr, part[i], options));
                    }
                    this.ptr = this.ptr.getChild(part[i]);
                }
                return this;
            };
        
            /**
             * Tests if a definition is a valid message definition.
             * @param {Object.<string,*>} def Definition
             * @return {boolean} true if valid, else false
             * @expose
             */
            Builder.isValidMessage = function(def) {
                // Messages require a string name
                if (typeof def["name"] !== 'string' || !Lang.NAME.test(def["name"])) {
                    return false;
                }
                // Messages must not contain values (that'd be an enum) or methods (that'd be a service)
                if (typeof def["values"] !== 'undefined' || typeof def["rpc"] !== 'undefined') {
                    return false;
                }
                // Fields, enums and messages are arrays if provided
                var i;
                if (typeof def["fields"] !== 'undefined') {
                    if (!ProtoBuf.Util.isArray(def["fields"])) {
                        return false;
                    }
                    var ids = [], id; // IDs must be unique
                    for (i=0; i<def["fields"].length; i++) {
                        if (!Builder.isValidMessageField(def["fields"][i])) {
                            return false;
                        }
                        id = parseInt(def["id"], 10);
                        if (ids.indexOf(id) >= 0) {
                            return false;
                        }
                        ids.push(id);
                    }
                    ids = null;
                }
                if (typeof def["enums"] !== 'undefined') {
                    if (!ProtoBuf.Util.isArray(def["enums"])) {
                        return false;
                    }
                    for (i=0; i<def["enums"].length; i++) {
                        if (!Builder.isValidEnum(def["enums"][i])) {
                            return false;
                        }
                    }
                }
                if (typeof def["messages"] !== 'undefined') {
                    if (!ProtoBuf.Util.isArray(def["messages"])) {
                        return false;
                    }
                    for (i=0; i<def["messages"].length; i++) {
                        if (!Builder.isValidMessage(def["messages"][i]) && !Builder.isValidExtend(def["messages"][i])) {
                            return false;
                        }
                    }
                }
                if (typeof def["extensions"] !== 'undefined') {
                    if (!ProtoBuf.Util.isArray(def["extensions"]) || def["extensions"].length !== 2 || typeof def["extensions"][0] !== 'number' || typeof def["extensions"][1] !== 'number') {
                        return false;
                    }
                }
                return true;
            };
        
            /**
             * Tests if a definition is a valid message field definition.
             * @param {Object} def Definition
             * @return {boolean} true if valid, else false
             * @expose
             */
            Builder.isValidMessageField = function(def) {
                // Message fields require a string rule, name and type and an id
                if (typeof def["rule"] !== 'string' || typeof def["name"] !== 'string' || typeof def["type"] !== 'string' || typeof def["id"] === 'undefined') {
                    return false;
                }
                if (!Lang.RULE.test(def["rule"]) || !Lang.NAME.test(def["name"]) || !Lang.TYPEREF.test(def["type"]) || !Lang.ID.test(""+def["id"])) {
                    return false;
                }
                if (typeof def["options"] != 'undefined') {
                    // Options are objects
                    if (typeof def["options"] != 'object') {
                        return false;
                    }
                    // Options are <string,*>
                    var keys = Object.keys(def["options"]);
                    for (var i=0; i<keys.length; i++) {
                        if (!Lang.OPTNAME.test(keys[i]) || (typeof def["options"][keys[i]] !== 'string' && typeof def["options"][keys[i]] !== 'number' && typeof def["options"][keys[i]] !== 'boolean')) {
                            return false;
                        }
                    }
                }
                return true;
            };
        
            /**
             * Tests if a definition is a valid enum definition.
             * @param {Object} def Definition
             * @return {boolean} true if valid, else false
             * @expose
             */
            Builder.isValidEnum = function(def) {
                // Enums require a string name
                if (typeof def["name"] !== 'string' || !Lang.NAME.test(def["name"])) {
                    return false;
                }
                // Enums require at least one value
                if (typeof def["values"] === 'undefined' || !ProtoBuf.Util.isArray(def["values"]) || def["values"].length == 0) {
                    return false;
                }
                for (var i=0; i<def["values"].length; i++) {
                    // Values are objects
                    if (typeof def["values"][i] != "object") {
                        return false;
                    }
                    // Values require a string name and an id
                    if (typeof def["values"][i]["name"] !== 'string' || typeof def["values"][i]["id"] === 'undefined') {
                        return false;
                    }
                    if (!Lang.NAME.test(def["values"][i]["name"]) || !Lang.NEGID.test(""+def["values"][i]["id"])) {
                        return false;
                    }
                }
                // It's not important if there are other fields because ["values"] is already unique
                return true;
            };
        
            /**
             * Creates ths specified protocol types at the current pointer position.
             * @param {Array.<Object.<string,*>>} defs Messages, enums or services to create
             * @return {ProtoBuf.Builder} this
             * @throws {Error} If a message definition is invalid
             * @expose
             */
            Builder.prototype.create = function(defs) {
                if (!defs) return; // Nothing to create
                if (!ProtoBuf.Util.isArray(defs)) {
                    defs = [defs];
                }
                if (defs.length == 0) return;
                
                // It's quite hard to keep track of scopes and memory here, so let's do this iteratively.
                var stack = [], def, obj, subObj, i, j;
                stack.push(defs); // One level [a, b, c]
                while (stack.length > 0) {
                    defs = stack.pop();
                    if (ProtoBuf.Util.isArray(defs)) { // Stack always contains entire namespaces
                        while (defs.length > 0) {
                            def = defs.shift(); // Namespace always contains an array of messages, enums and services
                            if (Builder.isValidMessage(def)) {
                                obj = new Reflect.Message(this.ptr, def["name"], def["options"]);
                                // Create fields
                                if (def["fields"] && def["fields"].length > 0) {
                                    for (i=0; i<def["fields"].length; i++) { // i=Fields
                                        if (obj.hasChild(def['fields'][i]['id'])) {
                                            throw(new Error("Duplicate field id in message "+obj.name+": "+def['fields'][i]['id']));
                                        }
                                        if (def["fields"][i]["options"]) {
                                            subObj = Object.keys(def["fields"][i]["options"]);
                                            for (j=0; j<subObj.length; j++) { // j=Option names
                                                if (!Lang.OPTNAME.test(subObj[j])) {
                                                    throw(new Error("Illegal field option name in message "+obj.name+"#"+def["fields"][i]["name"]+": "+subObj[j]));
                                                }
                                                if (typeof def["fields"][i]["options"][subObj[j]] !== 'string' && typeof def["fields"][i]["options"][subObj[j]] !== 'number' && typeof def["fields"][i]["options"][subObj[j]] !== 'boolean') {
                                                    throw(new Error("Illegal field option value in message "+obj.name+"#"+def["fields"][i]["name"]+"#"+subObj[j]+": "+def["fields"][i]["options"][subObj[j]]));
                                                }
                                            }
                                            subObj = null;
                                        }
                                        obj.addChild(new Reflect.Message.Field(obj, def["fields"][i]["rule"], def["fields"][i]["type"], def["fields"][i]["name"], def["fields"][i]["id"], def["fields"][i]["options"]));
                                    }
                                }
                                // Push enums and messages to stack
                                subObj = [];
                                if (typeof def["enums"] !== 'undefined' && def['enums'].length > 0) {
                                    for (i=0; i<def["enums"].length; i++) {
                                        subObj.push(def["enums"][i]);
                                    }
                                }
                                if (def["messages"] && def["messages"].length > 0) {
                                    for (i=0; i<def["messages"].length; i++) {
                                        subObj.push(def["messages"][i]);
                                    }
                                }
                                // Set extension range
                                if (def["extensions"]) {
                                    obj.extensions = def["extensions"];
                                    if (obj.extensions[0] < ProtoBuf.Lang.ID_MIN) {
                                        obj.extensions[0] = ProtoBuf.Lang.ID_MIN;
                                    }
                                    if (obj.extensions[1] > ProtoBuf.Lang.ID_MAX) {
                                        obj.extensions[1] = ProtoBuf.Lang.ID_MAX;
                                    }
                                }
                                this.ptr.addChild(obj); // Add to current namespace
                                if (subObj.length > 0) {
                                    stack.push(defs); // Push the current level back
                                    defs = subObj; // Continue processing sub level
                                    subObj = null;
                                    this.ptr = obj; // And move the pointer to this namespace
                                    obj = null;
                                    continue;
                                }
                                subObj = null;
                                obj = null;
                            } else if (Builder.isValidEnum(def)) {
                                obj = new Reflect.Enum(this.ptr, def["name"], def["options"]);
                                for (i=0; i<def["values"].length; i++) {
                                    obj.addChild(new Reflect.Enum.Value(obj, def["values"][i]["name"], def["values"][i]["id"]));
                                }
                                this.ptr.addChild(obj);
                                obj = null;
                            } else if (Builder.isValidService(def)) {
                                obj = new Reflect.Service(this.ptr, def["name"], def["options"]);
                                for (i in def["rpc"]) {
                                    if (def["rpc"].hasOwnProperty(i)) {
                                        obj.addChild(new Reflect.Service.RPCMethod(obj, i, def["rpc"][i]["request"], def["rpc"][i]["response"], def["rpc"][i]["options"]));
                                    }
                                }
                                this.ptr.addChild(obj);
                                obj = null;
                            } else if (Builder.isValidExtend(def)) {
                                obj = this.lookup(def["ref"]);
                                if (obj) {
                                    for (i=0; i<def["fields"].length; i++) { // i=Fields
                                        if (obj.hasChild(def['fields'][i]['id'])) {
                                            throw(new Error("Duplicate extended field id in message "+obj.name+": "+def['fields'][i]['id']));
                                        }
                                        if (def['fields'][i]['id'] < obj.extensions[0] || def['fields'][i]['id'] > obj.extensions[1]) {
                                            throw(new Error("Illegal extended field id in message "+obj.name+": "+def['fields'][i]['id']+" ("+obj.extensions.join(' to ')+" expected)"));
                                        }
                                        obj.addChild(new Reflect.Message.Field(obj, def["fields"][i]["rule"], def["fields"][i]["type"], def["fields"][i]["name"], def["fields"][i]["id"], def["fields"][i]["options"]));
                                    }
                                    /* if (this.ptr instanceof Reflect.Message) {
                                        this.ptr.addChild(obj); // Reference the extended message here to enable proper lookups
                                    } */
                                } else {
                                    if (!/\.?google\.protobuf\./.test(def["ref"])) { // Silently skip internal extensions
                                        throw(new Error("Extended message "+def["ref"]+" is not defined"));
                                    }
                                }
                            } else {
                                throw(new Error("Not a valid message, enum, service or extend definition: "+JSON.stringify(def)));
                            }
                            def = null;
                        }
                        // Break goes here
                    } else {
                        throw(new Error("Not a valid namespace definition: "+JSON.stringify(defs)));
                    }
                    defs = null;
                    this.ptr = this.ptr.parent; // This namespace is s done
                }
                this.resolved = false; // Require re-resolve
                this.result = null; // Require re-build
                return this;
            };
        
            /**
             * Tests if the specified file is a valid import.
             * @param {string} filename
             * @returns {boolean} true if valid, false if it should be skipped
             * @expose
             */
            Builder.isValidImport = function(filename) {
                // Ignore google/protobuf/descriptor.proto (for example) as it makes use of low-level
                // bootstrapping directives that are not required and therefore cannot be parsed by ProtoBuf.js.
                return !(/google\/protobuf\//.test(filename));
            };
        
            /**
             * Imports another definition into this builder.
             * @param {Object.<string,*>} json Parsed import
             * @param {(string|{root: string, file: string})=} filename Imported file name
             * @return {ProtoBuf.Builder} this
             * @throws {Error} If the definition or file cannot be imported
             * @expose
             */
            Builder.prototype["import"] = function(json, filename) {
                if (typeof filename === 'string') {
                    if (ProtoBuf.Util.IS_NODE) {
                        var path = require("path");
                        filename = path.resolve(filename);
                    }
                    if (!!this.files[filename]) {
                        this.reset();
                        return this; // Skip duplicate imports
                    }
                    this.files[filename] = true;
                }
                if (!!json['imports'] && json['imports'].length > 0) {
                    var importRoot, delim = '/', resetRoot = false;
                    if (typeof filename === 'object') { // If an import root is specified, override
                        this.importRoot = filename["root"]; resetRoot = true; // ... and reset afterwards
                        importRoot = this.importRoot;
                        filename = filename["file"];
                        if (importRoot.indexOf("\\") >= 0 || filename.indexOf("\\") >= 0) delim = '\\';
                    } else if (typeof filename === 'string') {
                        if (this.importRoot) { // If import root is overridden, use it
                            importRoot = this.importRoot;
                        } else { // Otherwise compute from filename
                            if (filename.indexOf("/") >= 0) { // Unix
                                importRoot = filename.replace(/\/[^\/]*$/, "");
                                if (/* /file.proto */ importRoot === "") importRoot = "/";
                            } else if (filename.indexOf("\\") >= 0) { // Windows
                                importRoot = filename.replace(/\\[^\\]*$/, ""); delim = '\\';
                            } else {
                                importRoot = ".";
                            }
                        }
                    } else {
                        importRoot = null;
                    }
        
                    for (var i=0; i<json['imports'].length; i++) {
                        if (typeof json['imports'][i] === 'string') { // Import file
                            if (!importRoot) {
                                throw(new Error("Cannot determine import root: File name is unknown"));
                            }
                            var importFilename = importRoot+delim+json['imports'][i];
                            if (!Builder.isValidImport(importFilename)) continue; // e.g. google/protobuf/*
                            if (/\.proto$/i.test(importFilename) && !ProtoBuf.DotProto) {     // If this is a NOPARSE build
                                importFilename = importFilename.replace(/\.proto$/, ".json"); // always load the JSON file
                            }
                            var contents = ProtoBuf.Util.fetch(importFilename);
                            if (contents === null) {
                                throw(new Error("Failed to import '"+importFilename+"' in '"+filename+"': File not found"));
                            }
                            if (/\.json$/i.test(importFilename)) { // Always possible
                                this["import"](JSON.parse(contents+""), importFilename); // May throw
                            } else {
                                this["import"]((new ProtoBuf.DotProto.Parser(contents+"")).parse(), importFilename); // May throw
                            }
                        } else { // Import structure
                            if (!filename) {
                                this["import"](json['imports'][i]);
                            } else if (/\.(\w+)$/.test(filename)) { // With extension: Append _importN to the name portion to make it unique
                                this["import"](json['imports'][i], filename.replace(/^(.+)\.(\w+)$/, function($0, $1, $2) { return $1+"_import"+i+"."+$2; }));
                            } else { // Without extension: Append _importN to make it unique
                                this["import"](json['imports'][i], filename+"_import"+i);
                            }
                        }
                    }
                    if (resetRoot) { // Reset import root override when all imports are done
                        this.importRoot = null;
                    }
                }
                if (!!json['messages']) {
                    if (!!json['package']) this.define(json['package'], json["options"]);
                    this.create(json['messages']);
                    this.reset();
                }
                if (!!json['enums']) {
                    if (!!json['package']) this.define(json['package'], json["options"]);
                    this.create(json['enums']);
                    this.reset();
                }
                if (!!json['services']) {
                    if (!!json['package']) this.define(json['package'], json["options"]);
                    this.create(json['services']);
                    this.reset();
                }
                if (!!json['extends']) {
                    if (!!json['package']) this.define(json['package'], json["options"]);
                    this.create(json['extends']);
                    this.reset();
                }
                return this;
            };
        
            /**
             * Tests if a definition is a valid service definition.
             * @param {Object} def Definition
             * @return {boolean} true if valid, else false
             * @expose
             */
            Builder.isValidService = function(def) {
                // Services require a string name
                if (typeof def["name"] !== 'string' || !Lang.NAME.test(def["name"]) || typeof def["rpc"] !== 'object') {
                    return false;
                }
                return true;
            };
        
            /**
             * Tests if a definition is a valid extension.
             * @param {Object} def Definition
             * @returns {boolean} true if valid, else false
             * @expose
            */
            Builder.isValidExtend = function(def) {
                if (typeof def["ref"] !== 'string' || !Lang.TYPEREF.test(def["name"])) {
                    return false;
                }
                var i;
                if (typeof def["fields"] !== 'undefined') {
                    if (!ProtoBuf.Util.isArray(def["fields"])) {
                        return false;
                    }
                    var ids = [], id; // IDs must be unique (does not yet test for the extended message's ids)
                    for (i=0; i<def["fields"].length; i++) {
                        if (!Builder.isValidMessageField(def["fields"][i])) {
                            return false;
                        }
                        id = parseInt(def["id"], 10);
                        if (ids.indexOf(id) >= 0) {
                            return false;
                        }
                        ids.push(id);
                    }
                    ids = null;
                }
                return true;
            };
        
            /**
             * Resolves all namespace objects.
             * @throws {Error} If a type cannot be resolved
             * @expose
             */
            Builder.prototype.resolveAll = function() {
                // Resolve all reflected objects
                var res;
                if (this.ptr == null || typeof this.ptr.type === 'object') return; // Done (already resolved)
                if (this.ptr instanceof Reflect.Namespace) {
                    // Build all children
                    var children = this.ptr.getChildren();
                    for (var i=0; i<children.length; i++) {
                        this.ptr = children[i];
                        this.resolveAll();
                    }
                } else if (this.ptr instanceof Reflect.Message.Field) {
                    if (!Lang.TYPE.test(this.ptr.type)) { // Resolve type...
                        if (!Lang.TYPEREF.test(this.ptr.type)) {
                            throw(new Error("Illegal type reference in "+this.ptr.toString(true)+": "+this.ptr.type));
                        }
                        res = this.ptr.parent.resolve(this.ptr.type, true);
                        if (!res) {
                            throw(new Error("Unresolvable type reference in "+this.ptr.toString(true)+": "+this.ptr.type));
                        }
                        this.ptr.resolvedType = res;
                        if (res instanceof Reflect.Enum) {
                            this.ptr.type = ProtoBuf.TYPES["enum"];
                        } else if (res instanceof Reflect.Message) {
                            this.ptr.type = ProtoBuf.TYPES["message"];
                        } else {
                            throw(new Error("Illegal type reference in "+this.ptr.toString(true)+": "+this.ptr.type));
                        }
                    } else {
                        this.ptr.type = ProtoBuf.TYPES[this.ptr.type];
                    }
                } else if (this.ptr instanceof ProtoBuf.Reflect.Enum.Value) {
                    // No need to build enum values (built in enum)
                } else if (this.ptr instanceof ProtoBuf.Reflect.Service.Method) {
                    if (this.ptr instanceof ProtoBuf.Reflect.Service.RPCMethod) {
                        res = this.ptr.parent.resolve(this.ptr.requestName);
                        if (!res || !(res instanceof ProtoBuf.Reflect.Message)) {
                            throw(new Error("Illegal request type reference in "+this.ptr.toString(true)+": "+this.ptr.requestName));
                        }
                        this.ptr.resolvedRequestType = res;
                        res = this.ptr.parent.resolve(this.ptr.responseName);
                        if (!res || !(res instanceof ProtoBuf.Reflect.Message)) {
                            throw(new Error("Illegal response type reference in "+this.ptr.toString(true)+": "+this.ptr.responseName));
                        }
                        this.ptr.resolvedResponseType = res;
                    } else {
                        // Should not happen as nothing else is implemented
                        throw(new Error("Illegal service method type in "+this.ptr.toString(true)));
                    }
                } else {
                    throw(new Error("Illegal object type in namespace: "+typeof(this.ptr)+":"+this.ptr));
                }
                this.reset();
            };
        
            /**
             * Builds the protocol. This will first try to resolve all definitions and, if this has been successful,
             * return the built package.
             * @param {string=} path Specifies what to return. If omitted, the entire namespace will be returned.
             * @return {ProtoBuf.Builder.Message|Object.<string,*>}
             * @throws {Error} If a type could not be resolved
             * @expose
             */
            Builder.prototype.build = function(path) {
                this.reset();
                if (!this.resolved) {
                    this.resolveAll();
                    this.resolved = true;
                    this.result = null; // Require re-build
                }
                if (this.result == null) { // (Re-)Build
                    this.result = this.ns.build();
                }
                if (!path) {
                    return this.result;
                } else {
                    var part = path.split(".");
                    var ptr = this.result; // Build namespace pointer (no hasChild etc.)
                    for (var i=0; i<part.length; i++) {
                        if (ptr[part[i]]) {
                            ptr = ptr[part[i]];
                        } else {
                            ptr = null;
                            break;
                        }
                    }
                    return ptr;
                }
            };
        
            /**
             * Similar to {@link ProtoBuf.Builder#build}, but looks up the internal reflection descriptor.
             * @param {string=} path Specifies what to return. If omitted, the entire namespace wiil be returned.
             * @return {ProtoBuf.Reflect.T} Reflection descriptor or `null` if not found
             */
            Builder.prototype.lookup = function(path) {
                return path ? this.ns.resolve(path) : this.ns;
            };
        
            /**
             * Returns a string representation of this object.
             * @return {string} String representation as of "Builder"
             * @expose
             */
            Builder.prototype.toString = function() {
                return "Builder";
            };
        
            // Pseudo types documented in Reflect.js.
            // Exist for the sole purpose of being able to "... instanceof ProtoBuf.Builder.Message" etc.
            Builder.Message = function() {};
            Builder.Service = function() {};
            
            return Builder;
            
        })(ProtoBuf, ProtoBuf.Lang, ProtoBuf.Reflect);
        
        
        /**
         * Loads a .proto string and returns the Builder.
         * @param {string} proto .proto file contents
         * @param {(ProtoBuf.Builder|string|{root: string, file: string})=} builder Builder to append to. Will create a new one if omitted.
         * @param {(string|{root: string, file: string})=} filename The corresponding file name if known. Must be specified for imports.
         * @return {ProtoBuf.Builder} Builder to create new messages
         * @throws {Error} If the definition cannot be parsed or built
         * @expose
         */
        ProtoBuf.loadProto = function(proto, builder, filename) {
            if (typeof builder == 'string' || (builder && typeof builder["file"] === 'string' && typeof builder["root"] === 'string')) {
                filename = builder;
                builder = null;
            }
            return ProtoBuf.loadJson((new ProtoBuf.DotProto.Parser(proto+"")).parse(), builder, filename);
        };

        /**
         * Loads a .proto string and returns the Builder. This is an alias of {@link ProtoBuf.loadProto}.
         * @function
         * @param {string} proto .proto file contents
         * @param {(ProtoBuf.Builder|string)=} builder Builder to append to. Will create a new one if omitted.
         * @param {(string|{root: string, file: string})=} filename The corresponding file name if known. Must be specified for imports.
         * @return {ProtoBuf.Builder} Builder to create new messages
         * @throws {Error} If the definition cannot be parsed or built
         * @expose
         */
        ProtoBuf.protoFromString = ProtoBuf.loadProto; // Legacy

        /**
         * Loads a .proto file and returns the Builder.
         * @param {string|{root: string, file: string}} filename Path to proto file or an object specifying 'file' with
         *  an overridden 'root' path for all imported files.
         * @param {function(ProtoBuf.Builder)=} callback Callback that will receive the Builder as its first argument.
         *   If the request has failed, builder will be NULL. If omitted, the file will be read synchronously and this
         *   function will return the Builder or NULL if the request has failed.
         * @param {ProtoBuf.Builder=} builder Builder to append to. Will create a new one if omitted.
         * @return {?ProtoBuf.Builder|undefined} The Builder if synchronous (no callback specified, will be NULL if the
         *   request has failed), else undefined
         * @expose
         */
        ProtoBuf.loadProtoFile = function(filename, callback, builder) {
            if (callback && typeof callback === 'object') {
                builder = callback;
                callback = null;
            } else if (!callback || typeof callback !== 'function') {
                callback = null;
            }
            if (callback) {
                ProtoBuf.Util.fetch(typeof filename === 'object' ? filename["root"]+"/"+filename["file"] : filename, function(contents) {
                    callback(ProtoBuf.loadProto(contents, builder, filename));
                });
            } else {
                var contents = ProtoBuf.Util.fetch(typeof filename === 'object' ? filename["root"]+"/"+filename["file"] : filename);
                return contents !== null ? ProtoBuf.protoFromString(contents, builder, filename) : null;
            }
        };

        /**
         * Loads a .proto file and returns the Builder. This is an alias of {@link ProtoBuf.loadProtoFile}.
         * @function
         * @param {string|{root: string, file: string}} filename Path to proto file or an object specifying 'file' with
         *  an overridden 'root' path for all imported files.
         * @param {function(ProtoBuf.Builder)=} callback Callback that will receive the Builder as its first argument.
         *   If the request has failed, builder will be NULL. If omitted, the file will be read synchronously and this
         *   function will return the Builder or NULL if the request has failed.
         * @param {ProtoBuf.Builder=} builder Builder to append to. Will create a new one if omitted.
         * @return {?ProtoBuf.Builder|undefined} The Builder if synchronous (no callback specified, will be NULL if the
         *   request has failed), else undefined
         * @expose
         */
        ProtoBuf.protoFromFile = ProtoBuf.loadProtoFile; // Legacy


        /**
         * Constructs a new Builder with the specified package defined.
         * @param {string=} pkg Package name as fully qualified name, e.g. "My.Game". If no package is specified, the
         * builder will only contain a global namespace.
         * @param {Object.<string,*>=} options Top level options
         * @return {ProtoBuf.Builder} New Builder
         * @expose
         */
        ProtoBuf.newBuilder = function(pkg, options) {
            var builder = new ProtoBuf.Builder();
            if (typeof pkg !== 'undefined' && pkg !== null) {
                builder.define(pkg, options);
            }
            return builder;
        };

        /**
         * Loads a .json definition and returns the Builder.
         * @param {!*|string} json JSON definition
         * @param {(ProtoBuf.Builder|string|{root: string, file: string})=} builder Builder to append to. Will create a new one if omitted.
         * @param {(string|{root: string, file: string})=} filename The corresponding file name if known. Must be specified for imports.
         * @return {ProtoBuf.Builder} Builder to create new messages
         * @throws {Error} If the definition cannot be parsed or built
         * @expose
         */
        ProtoBuf.loadJson = function(json, builder, filename) {
            if (typeof builder === 'string' || (builder && typeof builder["file"] === 'string' && typeof builder["root"] === 'string')) {
                filename = builder;
                builder = null;
            }
            if (!builder || typeof builder !== 'object') builder = ProtoBuf.newBuilder();
            if (typeof json === 'string') json = JSON.parse(json);
            builder["import"](json, filename);
            builder.resolveAll();
            builder.build();
            return builder;
        };

        /**
         * Loads a .json file and returns the Builder.
         * @param {string|{root: string, file: string}} filename Path to json file or an object specifying 'file' with
         *  an overridden 'root' path for all imported files.
         * @param {function(ProtoBuf.Builder)=} callback Callback that will receive the Builder as its first argument.
         *   If the request has failed, builder will be NULL. If omitted, the file will be read synchronously and this
         *   function will return the Builder or NULL if the request has failed.
         * @param {ProtoBuf.Builder=} builder Builder to append to. Will create a new one if omitted.
         * @return {?ProtoBuf.Builder|undefined} The Builder if synchronous (no callback specified, will be NULL if the
         *   request has failed), else undefined
         * @expose
         */
        ProtoBuf.loadJsonFile = function(filename, callback, builder) {
            if (callback && typeof callback === 'object') {
                builder = callback;
                callback = null;
            } else if (!callback || typeof callback !== 'function') {
                callback = null;
            }
            if (callback) {
                ProtoBuf.Util.fetch(typeof filename === 'object' ? filename["root"]+"/"+filename["file"] : filename, function(contents) {
                    try {
                        callback(ProtoBuf.loadJson(JSON.parse(contents), builder, filename));
                    } catch (err) {
                        callback(err);
                    }
                });
            } else {
                var contents = ProtoBuf.Util.fetch(typeof filename === 'object' ? filename["root"]+"/"+filename["file"] : filename);
                return contents !== null ? ProtoBuf.loadJson(JSON.parse(contents), builder, filename) : null;
            }
        };

        return ProtoBuf;
    }

    // Enable module loading if available
    if (typeof module != 'undefined' && module["exports"]) { // CommonJS
        module["exports"] = loadProtoBuf(require("bytebuffer"));
    } else if (typeof define != 'undefined' && define["amd"]) { // AMD
        define("ProtoBuf", ["ByteBuffer"], loadProtoBuf);
    } else { // Shim
        if (!global["dcodeIO"]) {
            global["dcodeIO"] = {};
        }
        global["dcodeIO"]["ProtoBuf"] = loadProtoBuf(global["dcodeIO"]["ByteBuffer"]);
    }

})(this);}).call(this,require("/home/ssd1/atnnn/code/rethinkdb/build/external/browserify_3.24.13/node_modules/packed-browserify/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js"))
},{"/home/ssd1/atnnn/code/rethinkdb/build/external/browserify_3.24.13/node_modules/packed-browserify/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":4,"bytebuffer":14,"fs":1,"path":8}],14:[function(require,module,exports){
/*
 Copyright 2013 Daniel Wirtz <dcode@dcode.io>

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

/**
 * @license ByteBuffer.js (c) 2013 Daniel Wirtz <dcode@dcode.io>
 * Released under the Apache License, Version 2.0
 * see: https://github.com/dcodeIO/ByteBuffer.js for details
 */ //
(function(global) {
    "use strict";

    // Note that this library carefully avoids using the array access operator
    // (i.e. buffer[x]) on ArrayBufferView subclasses (e.g. Uint8Array), and
    // uses DataView instead. This is required for IE 8 compatibility.

    /**
     * @param {Function=} Long
     * @returns {Function}
     * @inner
     */
    function loadByteBuffer(Long) {

        // Support node's Buffer if available, see http://nodejs.org/api/buffer.html
        var Buffer = null;
        if (typeof require === 'function') {
            try {
                var nodeBuffer = require("buffer");
                Buffer = nodeBuffer && typeof nodeBuffer['Buffer'] === 'function' &&
                    typeof nodeBuffer['Buffer']['isBuffer'] === 'function' ? nodeBuffer['Buffer'] : null;
            } catch (e) {}
        }

        /**
         * Constructs a new ByteBuffer.
         * @class A full-featured ByteBuffer implementation in JavaScript using typed arrays.
         * @exports ByteBuffer
         * @param {number=} capacity Initial capacity. Defaults to {@link ByteBuffer.DEFAULT_CAPACITY}.
         * @param {boolean=} littleEndian `true` to use little endian multi byte values, defaults to `false` for big
         *  endian.
         * @param {boolean=} sparse If set to `true`, a ByteBuffer with array=view=null will be created which have to be
         *  set manually afterwards. Defaults to `false`.
         * @expose
         */
        var ByteBuffer = function(capacity, littleEndian, sparse) {
            capacity = typeof capacity !== 'undefined' ? parseInt(capacity, 10) : ByteBuffer.DEFAULT_CAPACITY;
            if (capacity < 1) capacity = ByteBuffer.DEFAULT_CAPACITY;

            /**
             * Backing ArrayBuffer.
             * @type {?ArrayBuffer}
             * @expose
             */
            this.array = sparse ? null : new ArrayBuffer(capacity);

            /**
             * DataView to mess with the ArrayBuffer.
             * @type {?DataView}
             * @expose
             */
            this.view = sparse ? null : new DataView(this.array);

            /**
             * Current read/write offset. Length- and capacity-independent index. Contents are the bytes between offset
             *  and length, which are both absolute indexes. There is no capacity property, use
             *  {@link ByteBuffer#capacity} instead.
             * @type {number}
             * @expose
             */
            this.offset = 0;

            /**
             * Marked offset set through {@link ByteBuffer#mark}. Defaults to `-1` (no marked offset).
             * @type {number}
             * @expose
             */
            this.markedOffset = -1;

            /**
             * Length of the contained data. Offset- and capacity-independent index. Contents are the bytes between
             *  offset and length, which are both absolute indexes. There is no capacity property, use
             *  {@link ByteBuffer#capacity} instead.
             * @type {number}
             * @expose
             */
            this.length = 0;

            /**
             * Whether to use little endian multi byte values, defaults to `false` for big endian.
             * @type {boolean}
             * @expose
             */
            this.littleEndian = typeof littleEndian != 'undefined' ? !!littleEndian : false;
        };

        /**
         * Version string.
         * @type {string}
         * @const
         * @expose
         */
        ByteBuffer.VERSION = "2.3.1";

        /**
         * Default buffer capacity of `16`. The ByteBuffer will be automatically resized by a factor of 2 if required.
         * @type {number}
         * @const
         * @expose
         */
        ByteBuffer.DEFAULT_CAPACITY = 16;

        /**
         * Little endian constant for usage in constructors instead of a boolean value. Evaluates to `true`.
         * @type {boolean}
         * @const
         * @expose
         */
        ByteBuffer.LITTLE_ENDIAN = true;

        /**
         * Big endian constant for usage in constructors instead of a boolean value. Evaluates to `false`.
         * @type {boolean}
         * @const
         * @expose
         */
        ByteBuffer.BIG_ENDIAN = false;

        /**
         * Long class for int64 support. May be `null` if the Long class has not been loaded and int64 support is
         *  not available.
         * @type {?Long}
         * @const
         * @expose
         */
        ByteBuffer.Long = Long || null;

        /**
         * Tests if the specified type is a ByteBuffer or ByteBuffer-like.
         * @param {*} bb ByteBuffer to test
         * @returns {boolean} true if it is a ByteBuffer or ByteBuffer-like, otherwise false
         * @expose
         */
        ByteBuffer.isByteBuffer = function(bb) {
            return bb && (
                (bb instanceof ByteBuffer) || (
                    typeof bb === 'object' &&
                    (bb.array === null || bb.array instanceof ArrayBuffer) &&
                    (bb.view === null || bb.view instanceof DataView) &&
                    typeof bb.offset === 'number' &&
                    typeof bb.markedOffset === 'number' &&
                    typeof bb.length === 'number' &&
                    typeof bb.littleEndian === 'boolean'
                )
            );
        };

        /**
         * Allocates a new ByteBuffer.
         * @param {number=} capacity Initial capacity. Defaults to {@link ByteBuffer.DEFAULT_CAPACITY}.
         * @param {boolean=} littleEndian `true` to use little endian multi byte values, defaults to `false` for big
         *  endian.
         * @returns {!ByteBuffer}
         * @expose
         */
        ByteBuffer.allocate = function(capacity, littleEndian) {
            return new ByteBuffer(capacity, littleEndian);
        };

        /**
         * Converts a node.js <= 0.8 Buffer to an ArrayBuffer.
         * @param {!Buffer} b Buffer to convert
         * @returns {?ArrayBuffer} Converted buffer
         * @inner
         */
        function b2ab(b) {
            var ab = new ArrayBuffer(b.length),
                view = new Uint8Array(ab);
            for (var i=0, k=b.length; i < k; ++i) view[i] = b[i];
            return ab;
        }

        /**
         * Wraps an ArrayBuffer, any object containing an ArrayBuffer, a node buffer or a string. Sets the created
         *  ByteBuffer's offset to 0 and its length to the wrapped object's byte length.
         * @param {!ArrayBuffer|!Buffer|!{array: !ArrayBuffer}|!{buffer: !ArrayBuffer}|string} buffer Anything that can
         *  be wrapped
         * @param {(string|boolean)=} enc String encoding if a string is provided (hex, utf8, binary, defaults to base64)
         * @param {boolean=} littleEndian `true` to use little endian multi byte values, defaults to `false` for big
         *  endian.
         * @returns {!ByteBuffer}
         * @throws {Error} If the specified object cannot be wrapped
         * @expose
         */
        ByteBuffer.wrap = function(buffer, enc, littleEndian) {
            if (typeof enc === 'boolean') {
                littleEndian = enc;
                enc = "utf8";
            }
            // Wrap a string
            if (typeof buffer === 'string') {
                switch (enc) {
                    case "base64":
                        return ByteBuffer.decode64(buffer, littleEndian);
                    case "hex":
                        return ByteBuffer.decodeHex(buffer, littleEndian);
                    case "binary":
                        return ByteBuffer.decodeBinary(buffer, littleEndian);
                    default:
                        return new ByteBuffer(ByteBuffer.DEFAULT_CAPACITY, littleEndian).writeUTF8String(buffer).flip();
                }
            }
            var b;
            // Wrap Buffer
            if (Buffer && Buffer.isBuffer(buffer)) {
                b = new Uint8Array(buffer).buffer; // noop on node <= 0.8
                buffer = (b === buffer) ? b2ab(buffer) : b;
            }
            // Refuse to wrap anything that's null or not an object
            if (buffer === null || typeof buffer !== 'object') {
                throw(new Error("Cannot wrap null or non-object"));
            }
            // Wrap ByteBuffer by cloning (preserve offsets)
            if (ByteBuffer.isByteBuffer(buffer)) {
                return ByteBuffer.prototype.clone.call(buffer); // Also makes ByteBuffer-like a ByteBuffer
            }
            // Wrap any object that is or contains an ArrayBuffer
            if (!!buffer["array"]) {
                buffer = buffer["array"];
            } else if (!!buffer["buffer"]) {
                buffer = buffer["buffer"];
            }
            if (!(buffer instanceof ArrayBuffer)) {
                throw(new Error("Cannot wrap buffer of type "+typeof(buffer)+", "+buffer.constructor.name));
            }
            b = new ByteBuffer(0, littleEndian, true);
            b.array = buffer;
            b.view = b.array.byteLength > 0 ? new DataView(b.array) : null;
            b.offset = 0;
            b.length = buffer.byteLength;
            return b;
        };

        /**
         * Switches little endian byte order.
         * @param {boolean=} littleEndian Defaults to `true`, otherwise uses big endian
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.LE = function(littleEndian) {
            this.littleEndian = typeof littleEndian !== 'undefined' ? !!littleEndian : true;
            return this;
        };

        /**
         * Switches big endian byte order.
         * @param {boolean=} bigEndian Defaults to `true`, otherwise uses little endian
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.BE = function(bigEndian) {
            this.littleEndian = typeof bigEndian !== 'undefined' ? !bigEndian : false;
            return this;
        };

        /**
         * Resizes the ByteBuffer to the given capacity. Will do nothing if already that large or larger.
         * @param {number} capacity New capacity
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.resize = function(capacity) {
            if (capacity < 1) return false;
            if (this.array === null) { // Silently recreate
                this.array = new ArrayBuffer(capacity);
                this.view = new DataView(this.array);
            }
            if (this.array.byteLength < capacity) {
                var src = this.array;
                var srcView = new Uint8Array(src);
                var dst = new ArrayBuffer(capacity);
                var dstView = new Uint8Array(dst);
                dstView.set(srcView);
                this.array = dst;
                this.view = new DataView(dst);
            }
            return this;
        };

        /**
         * Slices the ByteBuffer. This is independent of the ByteBuffer's actual offsets. Does not compact the underlying
         *  ArrayBuffer (use {@link ByteBuffer#compact} or {@link ByteBuffer.wrap} instead).
         * @param {number=} begin Begin offset, defaults to {@link ByteBuffer#offset}.
         * @param {number=} end End offset, defaults to {@link ByteBuffer#length}.
         * @returns {!ByteBuffer} Clone of this ByteBuffer with slicing applied, backed by the same ArrayBuffer
         * @throws {Error} If the buffer cannot be sliced
         * @expose
         */
        ByteBuffer.prototype.slice = function(begin, end) {
            if (this.array == null) {
                throw(new Error(this+" cannot be sliced: Already destroyed"));
            }
            if (typeof begin === 'undefined') begin = this.offset;
            if (typeof end === 'undefined') end = this.length;
            if (end <= begin) {
                var t = end; end = begin; begin = t;
            }
            if (begin < 0 || begin > this.array.byteLength || end < 1 || end > this.array.byteLength) {
                throw(new Error(this+" cannot be sliced: Index out of bounds (0-"+this.array.byteLength+" -> "+begin+"-"+end+")"));
            }
            var b = this.clone();
            b.offset = begin;
            b.length = end;
            return b;
        };

        /**
         * Makes sure that the specified capacity is available. If the current capacity is exceeded, it will be doubled.
         *  If double the previous capacity is less than the required capacity, the required capacity will be used.
         * @param {number} capacity Required capacity
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.ensureCapacity = function(capacity) {
            if (this.array === null)
                return this.resize(capacity);
            if (this.array.byteLength < capacity)
                return this.resize(this.array.byteLength*2 >= capacity ? this.array.byteLength*2 : capacity);
            return this;
        };

        /**
         * Makes the buffer ready for a new sequence of write or relative read operations. Sets `length=offset` and
         *  `offset=0`. Always make sure to flip a buffer when all relative writing operations are complete.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.flip = function() {
            this.length = this.array == null ? 0 : this.offset;
            this.offset = 0;
            return this;
        };

        /**
         * Marks an offset to be used with {@link ByteBuffer#reset}.
         * @param {number=} offset Offset to mark. Defaults to {@link ByteBuffer#offset}.
         * @returns {!ByteBuffer} this
         * @throws {Error} If the mark cannot be set
         * @see ByteBuffer#reset
         * @expose
         */
        ByteBuffer.prototype.mark = function(offset) {
            if (this.array == null) {
                throw(new Error(this+" cannot be marked: Already destroyed"));
            }
            offset = typeof offset !== 'undefined' ? parseInt(offset, 10) : this.offset;
            if (offset < 0 || offset > this.array.byteLength) {
                throw(new Error(this+" cannot be marked: Offset to mark is less than 0 or bigger than the capacity ("+this.array.byteLength+"): "+offset));
            }
            this.markedOffset = offset;
            return this;
        };

        /**
         * Resets the ByteBuffer. If an offset has been marked through {@link ByteBuffer#mark} before, the offset will
         *  be set to the marked offset and the marked offset will be discarded. Length will not be altered. If there is
         *  no marked offset, sets `offset=0` and `length=0`.
         * @returns {!ByteBuffer} this
         * @see ByteBuffer#mark
         * @expose
         */
        ByteBuffer.prototype.reset = function() {
            if (this.array === null) {
                throw(new Error(this+" cannot be reset: Already destroyed"));
            }
            if (this.markedOffset >= 0) {
                this.offset = this.markedOffset;
                this.markedOffset = -1;
            } else {
                this.offset = 0;
                this.length = 0;
            }
            return this;
        };

        /**
         * Clones this ByteBuffer. The returned cloned ByteBuffer shares the same backing array but will have its own
         *  offsets.
         * @returns {!ByteBuffer} Clone
         * @expose
         */
        ByteBuffer.prototype.clone = function() {
            var b = new ByteBuffer(-1, this.littleEndian, /* no init, undocumented */ true);
            b.array = this.array;
            b.view = this.view;
            b.offset = this.offset;
            b.markedOffset = this.markedOffset;
            b.length = this.length;
            return b;
        };

        /**
         * Copies this ByteBuffer. The copy has its own backing array and uses the same offsets as this one.
         * @returns {!ByteBuffer} Copy
         * @expose
         */
        ByteBuffer.prototype.copy = function() {
            if (this.array == null) {
                return this.clone();
            }
            var b = new ByteBuffer(this.array.byteLength, this.littleEndian);
            var src = new Uint8Array(this.array);
            var dst = new Uint8Array(b.array);
            dst.set(src);
            b.offset = this.offset;
            b.markedOffset = this.markedOffset;
            b.length = this.length;
            return b;
        };

        /**
         * Gets the number of remaining readable bytes. Contents are the bytes between offset and length, so this
         *  returns `length-offset`.
         * @returns {number} Remaining readable bytes. May be negative if `offset>length`.
         * @expose
         */
        ByteBuffer.prototype.remaining = function() {
            if (this.array === null) return 0;
            return this.length - this.offset;
        };

        /**
         * Gets the capacity of the backing buffer. This is independent from {@link ByteBuffer#length} and returns the
         *  size of the entire backing array.
         * @returns {number} Capacity of the backing array or 0 if destroyed
         * @expose
         */
        ByteBuffer.prototype.capacity = function() {
            return this.array != null ? this.array.byteLength : 0;
        };

        /**
         * Compacts the ByteBuffer to be backed by an ArrayBuffer of its actual length. Will set `offset=0` and
         *  `length=capacity`.
         * @returns {!ByteBuffer} this
         * @throws {Error} If the buffer cannot be compacted
         * @expose
         */
        ByteBuffer.prototype.compact = function() {
            if (this.array == null) {
                throw(new Error(this+" cannot be compacted: Already destroyed"));
            }
            if (this.offset > this.length) {
                this.flip();
            }
            if (this.offset === this.length) {
                this.array = new ArrayBuffer(0);
                this.view = null; // A DataView on a zero-length AB would throw
                return this;
            }
            if (this.offset === 0 && this.length === this.array.byteLength) {
                return this; // Already compacted
            }
            var srcView = new Uint8Array(this.array);
            var dst = new ArrayBuffer(this.length-this.offset);
            var dstView = new Uint8Array(dst);
            dstView.set(srcView.subarray(this.offset, this.length));
            this.array = dst;
            if (this.markedOffset >= this.offset) {
                this.markedOffset -= this.offset;
            } else {
                this.markedOffset = -1;
            }
            this.offset = 0;
            this.length = this.array.byteLength;
            return this;
        };

        /**
         * Manually destroys the ByteBuffer, releasing references to the backing array. Manually destroying a ByteBuffer
         *  is usually not required but may be useful in limited memory environments. Most successive operations will
         *  rise an error until {@link ByteBuffer#resize} or {@link ByteBuffer#ensureCapacity} is called to reinitialize
         *  the backing array.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.destroy = function() {
            if (this.array !== null) {
                this.array = null;
                this.view = null;
                this.offset = 0;
                this.markedOffset = -1;
                this.length = 0;
            }
            return this;
        };

        /**
         * Reverses the backing array and adapts offset and length to retain the same relative position on the reversed
         *  data in inverse order. Example: "00<01 02>03 04".reverse() = "04 03<02 01>00". Also clears the marked
         *  offset.
         * @returns {!ByteBuffer} this
         * @throws {Error} If the buffer is already destroyed
         * @expose
         */
        ByteBuffer.prototype.reverse = function() {
            if (this.array === null) {
                throw(new Error(this+" cannot be reversed: Already destroyed"));
            }
            Array.prototype.reverse.call(new Uint8Array(this.array));
            var o = this.offset;
            this.offset = this.array.byteLength - this.length;
            this.markedOffset = -1;
            this.length = this.array.byteLength - o;
            this.view = new DataView(this.array);
            return this;
        };

        /**
         * Appends another ByteBuffer to this one. Appends only the portion between offset and length of the specified
         *  ByteBuffer and overwrites any contents behind the specified offset up to the number of bytes contained in
         *  the specified ByteBuffer. Offset and length of the specified ByteBuffer will remain the same.
         * @param {!*} src ByteBuffer or any object that can be wrapped to append
         * @param {number=} offset Offset to append at. Defaults to {@link ByteBuffer#offset}.
         * @returns {!ByteBuffer} this
         * @throws {Error} If the specified buffer is already destroyed
         * @expose
         */
        ByteBuffer.prototype.append = function(src, offset) {
            if (!(src instanceof ByteBuffer)) {
                src = ByteBuffer.wrap(src);
            }
            if (src.array === null) {
                throw(new Error(src+" cannot be appended to "+this+": Already destroyed"));
            }
            var n = src.length - src.offset;
            if (n == 0) return this; // Nothing to append
            if (n < 0) {
                src = src.clone().flip();
                n = src.length - src.offset;
            }
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=n)-n;
            this.ensureCapacity(offset+n); // Reinitializes if required
            var srcView = new Uint8Array(src.array);
            var dstView = new Uint8Array(this.array);
            dstView.set(srcView.subarray(src.offset, src.length), offset);
            return this;
        };

        /**
         * Prepends another ByteBuffer to this one. Prepends only the portion between offset and length of the specified
         *  ByteBuffer and overwrites any contents before the specified offsets up to the number of bytes contained in
         *  the specified ByteBuffer. Offset and length of the specified ByteBuffer will remain the same.
         * @param {!*} src ByteBuffer or any object that can be wrapped to prepend
         * @param {number=} offset Offset to prepend at. Defaults to {@link ByteBuffer#offset}.
         * @returns {!ByteBuffer} this
         * @throws {Error} If the specified buffer is already destroyed
         * @expose
         */
        ByteBuffer.prototype.prepend = function(src, offset) {
            if (!(src instanceof ByteBuffer)) {
                src = ByteBuffer.wrap(src);
            }
            if (src.array === null) {
                throw(src+" cannot be prepended to "+this+": Already destroyed");
            }
            var n = src.length - src.offset;
            if (n == 0) return this; // Nothing to prepend
            if (n < 0) {
                src = src.clone().flip();
                n = src.length - src.offset;
            }
            var modify = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            var diff = n-offset;
            if (diff > 0) {
                // Doesn't fit, so maybe resize and move the contents that are already contained
                this.ensureCapacity(this.length+diff);
                this.append(this, n);
                this.offset += diff;
                this.length += diff;
                this.append(src, 0);
            } else {
                this.append(src, offset-n);
            }
            if (modify) {
                this.offset -= n;
            }
            return this;
        };

        /**
         * Writes an 8bit signed integer.
         * @param {number} value Value
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if
         *  omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeInt8 = function(value, offset) {
            offset = typeof offset != 'undefined' ? offset : (this.offset+=1)-1;
            this.ensureCapacity(offset+1);
            this.view.setInt8(offset, value);
            return this;
        };

        /**
         * Reads an 8bit signed integer.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readInt8 = function(offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=1)-1;
            if (offset >= this.array.byteLength) {
                throw(new Error("Cannot read int8 from "+this+" at "+offset+": Capacity overflow"));
            }
            return this.view.getInt8(offset);
        };

        /**
         * Writes a byte. This is an alias of {ByteBuffer#writeInt8}.
         * @function
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeByte = ByteBuffer.prototype.writeInt8;

        /**
         * Reads a byte. This is an alias of {@link ByteBuffer#readInt8}.
         * @function
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readByte = ByteBuffer.prototype.readInt8;

        /**
         * Writes an 8bit unsigned integer.
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeUint8 = function(value, offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=1)-1;
            this.ensureCapacity(offset+1);
            this.view.setUint8(offset, value);
            return this;
        };

        /**
         * Reads an 8bit unsigned integer.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readUint8 = function(offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=1)-1;
            if (offset+1 > this.array.byteLength) {
                throw(new Error("Cannot read uint8 from "+this+" at "+offset+": Capacity overflow"));
            }
            return this.view.getUint8(offset);
        };

        /**
         * Writes a 16bit signed integer.
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeInt16 = function(value, offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=2)-2;
            this.ensureCapacity(offset+2);
            this.view.setInt16(offset, value, this.littleEndian);
            return this;
        };

        /**
         * Reads a 16bit signed integer.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readInt16 = function(offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=2)-2;
            if (offset+2 > this.array.byteLength) {
                throw(new Error("Cannot read int16 from "+this+" at "+offset+": Capacity overflow"));
            }
            return this.view.getInt16(offset, this.littleEndian);
        };

        /**
         * Writes a short value. This is an alias of {@link ByteBuffer#writeInt16}.
         * @function
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeShort = ByteBuffer.prototype.writeInt16;

        /**
         * Reads a short value. This is an alias of {@link ByteBuffer#readInt16}.
         * @function
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readShort = ByteBuffer.prototype.readInt16;

        /**
         * Writes a 16bit unsigned integer.
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeUint16 = function(value, offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=2)-2;
            this.ensureCapacity(offset+2);
            this.view.setUint16(offset, value, this.littleEndian);
            return this;
        };

        /**
         * Reads a 16bit unsigned integer.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readUint16 = function(offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=2)-2;
            if (offset+2 > this.array.byteLength) {
                throw(new Error("Cannot read int16 from "+this+" at "+offset+": Capacity overflow"));
            }
            return this.view.getUint16(offset, this.littleEndian);
        };

        /**
         * Writes a 32bit signed integer.
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeInt32 = function(value, offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=4)-4;
            this.ensureCapacity(offset+4);
            this.view.setInt32(offset, value, this.littleEndian);
            return this;
        };

        /**
         * Reads a 32bit signed integer.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readInt32 = function(offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=4)-4;
            if (offset+4 > this.array.byteLength) {
                throw(new Error("Cannot read int32 from "+this+" at "+offset+": Capacity overflow"));
            }
            return this.view.getInt32(offset, this.littleEndian);
        };

        /**
         * Writes an integer. This is an alias of {@link ByteBuffer#writeInt32}.
         * @function
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeInt = ByteBuffer.prototype.writeInt32;

        /**
         * Reads an integer. This is an alias of {@link ByteBuffer#readInt32}.
         * @function
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readInt = ByteBuffer.prototype.readInt32;

        /**
         * Writes a 32bit unsigned integer.
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeUint32 = function(value, offset) {
            offset = typeof offset != 'undefined' ? offset : (this.offset+=4)-4;
            this.ensureCapacity(offset+4);
            this.view.setUint32(offset, value, this.littleEndian);
            return this;
        };

        /**
         * Reads a 32bit unsigned integer.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readUint32 = function(offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=4)-4;
            if (offset+4 > this.array.byteLength) {
                throw(new Error("Cannot read uint32 from "+this+" at "+offset+": Capacity overflow"));
            }
            return this.view.getUint32(offset, this.littleEndian);
        };

        /**
         * Writes a 32bit float.
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeFloat32 = function(value, offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=4)-4;
            this.ensureCapacity(offset+4);
            this.view.setFloat32(offset, value, this.littleEndian);
            return this;
        };

        /**
         * Reads a 32bit float.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readFloat32 = function(offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=4)-4;
            if (this.array === null || offset+4 > this.array.byteLength) {
                throw(new Error("Cannot read float32 from "+this+" at "+offset+": Capacity overflow"));
            }
            return this.view.getFloat32(offset, this.littleEndian);
        };

        /**
         * Writes a float. This is an alias of {@link ByteBuffer#writeFloat32}.
         * @function
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeFloat = ByteBuffer.prototype.writeFloat32;

        /**
         * Reads a float. This is an alias of {@link ByteBuffer#readFloat32}.
         * @function
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readFloat = ByteBuffer.prototype.readFloat32;

        /**
         * Writes a 64bit float.
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeFloat64 = function(value, offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=8)-8;
            this.ensureCapacity(offset+8);
            this.view.setFloat64(offset, value, this.littleEndian);
            return this;
        };

        /**
         * Reads a 64bit float.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readFloat64 = function(offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=8)-8;
            if (this.array === null || offset+8 > this.array.byteLength) {
                throw(new Error("Cannot read float64 from "+this+" at "+offset+": Capacity overflow"));
            }
            return this.view.getFloat64(offset, this.littleEndian);
        };

        /**
         * Writes a double. This is an alias of {@link ByteBuffer#writeFloat64}.
         * @function
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeDouble = ByteBuffer.prototype.writeFloat64;

        /**
         * Reads a double. This is an alias of {@link ByteBuffer#readFloat64}.
         * @function
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readDouble = ByteBuffer.prototype.readFloat64;

        // Available with Long.js only
        if (Long) {

            /**
             * Writes a 64bit integer. Requires Long.js.
             * @function
             * @param {number|!Long} value Value to write
             * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
             * @returns {!ByteBuffer} this
             * @expose
             */
            ByteBuffer.prototype.writeInt64 = function(value, offset) {
                offset = typeof offset !== 'undefined' ? offset : (this.offset+=8)-8;
                if (!(typeof value === 'object' && value instanceof Long)) value = Long.fromNumber(value, false);
                this.ensureCapacity(offset+8);
                if (this.littleEndian) {
                    this.view.setInt32(offset, value.getLowBits(), true);
                    this.view.setInt32(offset+4, value.getHighBits(), true);
                } else {
                    this.view.setInt32(offset, value.getHighBits(), false);
                    this.view.setInt32(offset+4, value.getLowBits(), false);
                }
                return this;
            };

            /**
             * Reads a 64bit integer. Requires Long.js.
             * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
             * @returns {!Long}
             * @throws {Error} If offset is out of bounds
             * @expose
             */
            ByteBuffer.prototype.readInt64 = function(offset) {
                offset = typeof offset !== 'undefined' ? offset : (this.offset+=8)-8;
                if (this.array === null || offset+8 > this.array.byteLength) {
                    this.offset -= 8;
                    throw(new Error("Cannot read int64 from "+this+" at "+offset+": Capacity overflow"));
                }
                var value;
                if (this.littleEndian) {
                    value = Long.fromBits(this.view.getInt32(offset, true), this.view.getInt32(offset+4, true), false);
                } else {
                    value = Long.fromBits(this.view.getInt32(offset+4, false), this.view.getInt32(offset, false), false);
                }
                return value;
            };

            /**
             * Writes a 64bit unsigned integer. Requires Long.js.
             * @function
             * @param {number|!Long} value Value to write
             * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
             * @returns {!ByteBuffer} this
             * @expose
             */
            ByteBuffer.prototype.writeUint64 = function(value, offset) {
                offset = typeof offset !== 'undefined' ? offset : (this.offset+=8)-8;
                if (!(typeof value === 'object' && value instanceof Long)) value = Long.fromNumber(value, true);
                this.ensureCapacity(offset+8);
                if (this.littleEndian) {
                    this.view.setUint32(offset, value.getLowBitsUnsigned(), true);
                    this.view.setUint32(offset+4, value.getHighBitsUnsigned(), true);
                } else {
                    this.view.setUint32(offset, value.getHighBitsUnsigned(), false);
                    this.view.setUint32(offset+4, value.getLowBitsUnsigned(), false);
                }
                return this;
            };

            /**
             * Reads a 64bit unsigned integer. Requires Long.js.
             * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
             * @returns {!Long}
             * @throws {Error} If offset is out of bounds
             * @expose
             */
            ByteBuffer.prototype.readUint64 = function(offset) {
                offset = typeof offset !== 'undefined' ? offset : (this.offset+=8)-8;
                if (this.array === null || offset+8 > this.array.byteLength) {
                    this.offset -= 8;
                    throw(new Error("Cannot read int64 from "+this+" at "+offset+": Capacity overflow"));
                }
                var value;
                if (this.littleEndian) {
                    value = Long.fromBits(this.view.getUint32(offset, true), this.view.getUint32(offset+4, true), true);
                } else {
                    value = Long.fromBits(this.view.getUint32(offset+4, false), this.view.getUint32(offset, false), true);
                }
                return value;
            };

            /**
             * Writes a long. This is an alias of {@link ByteBuffer#writeInt64}.
             * @function
             * @param {number|!Long} value Value to write
             * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
             * @returns {!ByteBuffer} this
             * @expose
             */
            ByteBuffer.prototype.writeLong = ByteBuffer.prototype.writeInt64;

            /**
             * Reads a long. This is an alias of {@link ByteBuffer#readInt64}.
             * @function
             * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
             * @returns {!Long}
             * @throws {Error} If offset is out of bounds
             * @expose
             */
            ByteBuffer.prototype.readLong = ByteBuffer.prototype.readInt64;

        }

        /**
         * Maximum number of bytes used by 32bit base 128 variable-length integer.
         * @type {number}
         * @const
         * @expose
         */
        ByteBuffer.MAX_VARINT32_BYTES = 5;

        /**
         * Writes a 32bit base 128 variable-length integer as used in protobuf.
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number of bytes written.
         * @expose
         */
        ByteBuffer.prototype.writeVarint32 = function(value, offset) {
            var advance = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            // ref: http://code.google.com/searchframe#WTeibokF6gE/trunk/src/google/protobuf/io/coded_stream.cc
            value = value >>> 0;
            this.ensureCapacity(offset+ByteBuffer.calculateVarint32(value));
            var dst = this.view,
                size = 0;
            dst.setUint8(offset, value | 0x80);
            if (value >= (1 << 7)) {
                dst.setUint8(offset+1, (value >> 7) | 0x80);
                if (value >= (1 << 14)) {
                    dst.setUint8(offset+2, (value >> 14) | 0x80);
                    if (value >= (1 << 21)) {
                        dst.setUint8(offset+3, (value >> 21) | 0x80);
                        if (value >= (1 << 28)) {
                            dst.setUint8(offset+4, (value >> 28) & 0x7F);
                            size = 5;
                        } else {
                            dst.setUint8(offset+3, dst.getUint8(offset+3) & 0x7F);
                            size = 4;
                        }
                    } else {
                        dst.setUint8(offset+2, dst.getUint8(offset+2) & 0x7F);
                        size = 3;
                    }
                } else {
                    dst.setUint8(offset+1, dst.getUint8(offset+1) & 0x7F);
                    size = 2;
                }
            } else {
                dst.setUint8(offset, dst.getUint8(offset) & 0x7F);
                size = 1;
            }
            if (advance) {
                this.offset += size;
                return this;
            } else {
                return size;
            }
        };

        /**
         * Reads a 32bit base 128 variable-length integer as used in protobuf.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number|!{value: number, length: number}} The value read if offset is omitted, else the value read
         *  and the actual number of bytes read.
         * @throws {Error} If it's not a valid varint
         * @expose
         */
        ByteBuffer.prototype.readVarint32 = function(offset) {
            var advance = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            // ref: src/google/protobuf/io/coded_stream.cc

            var count = 0, b,
                src = this.view;
            var value = 0 >>> 0;
            do {
                b = src.getUint8(offset+count);
                if (count < ByteBuffer.MAX_VARINT32_BYTES) {
                    value |= ((b&0x7F)<<(7*count)) >>> 0;
                }
                ++count;
            } while (b & 0x80);
            value = value | 0; // Make sure to discard the higher order bits
            if (advance) {
                this.offset += count;
                return value;
            } else {
                return {
                    "value": value,
                    "length": count
                };
            }
        };

        /**
         * Writes a zigzag encoded 32bit base 128 encoded variable-length integer as used in protobuf.
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number of bytes written.
         * @expose
         */
        ByteBuffer.prototype.writeZigZagVarint32 = function(value, offset) {
            return this.writeVarint32(ByteBuffer.zigZagEncode32(value), offset);
        };

        /**
         * Reads a zigzag encoded 32bit base 128 variable-length integer as used in protobuf.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number|!{value: number, length: number}} The value read if offset is omitted, else the value read
         *  and the actual number of bytes read.
         * @throws {Error} If it's not a valid varint
         * @expose
         */
        ByteBuffer.prototype.readZigZagVarint32 = function(offset) {
            var dec = this.readVarint32(offset);
            if (typeof dec === 'object') {
                dec['value'] = ByteBuffer.zigZagDecode32(dec['value']);
                return dec;
            }
            return ByteBuffer.zigZagDecode32(dec);
        };

        /**
         * Maximum number of bytes used by a 64bit base 128 variable-length integer.
         * @type {number}
         * @const
         * @expose
         */
        ByteBuffer.MAX_VARINT64_BYTES = 10;

        /**
         * @type {number}
         * @const
         * @inner
         */
        var TWO_PWR_7_DBL = 1 << 7;

        /**
         * @type {number}
         * @const
         * @inner
         */
        var TWO_PWR_14_DBL = TWO_PWR_7_DBL * TWO_PWR_7_DBL;

        /**
         * @type {number}
         * @const
         * @inner
         */
        var TWO_PWR_21_DBL = TWO_PWR_7_DBL * TWO_PWR_14_DBL;

        /**
         * @type {number}
         * @const
         * @inner
         */
        var TWO_PWR_28_DBL = TWO_PWR_14_DBL * TWO_PWR_14_DBL;

        // Available with Long.js only
        if (Long) {

            /**
             * Writes a 64bit base 128 variable-length integer as used in protobuf.
             * @param {number|Long} value Value to write
             * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
             * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number of bytes written.
             * @expose
             */
            ByteBuffer.prototype.writeVarint64 = function(value, offset) {
                var advance = typeof offset === 'undefined';
                offset = typeof offset !== 'undefined' ? offset : this.offset;
                if (!(typeof value === 'object' && value instanceof Long)) value = Long.fromNumber(value, false);
    
                var part0 = value.toInt() >>> 0,
                    part1 = value.shiftRightUnsigned(28).toInt() >>> 0,
                    part2 = value.shiftRightUnsigned(56).toInt() >>> 0,
                    size = ByteBuffer.calculateVarint64(value);
    
                this.ensureCapacity(offset+size);
                var dst = this.view;
                switch (size) {
                    case 10: dst.setUint8(offset+9, (part2 >>>  7) | 0x80);
                    case 9 : dst.setUint8(offset+8, (part2       ) | 0x80);
                    case 8 : dst.setUint8(offset+7, (part1 >>> 21) | 0x80);
                    case 7 : dst.setUint8(offset+6, (part1 >>> 14) | 0x80);
                    case 6 : dst.setUint8(offset+5, (part1 >>>  7) | 0x80);
                    case 5 : dst.setUint8(offset+4, (part1       ) | 0x80);
                    case 4 : dst.setUint8(offset+3, (part0 >>> 21) | 0x80);
                    case 3 : dst.setUint8(offset+2, (part0 >>> 14) | 0x80);
                    case 2 : dst.setUint8(offset+1, (part0 >>>  7) | 0x80);
                    case 1 : dst.setUint8(offset+0, (part0       ) | 0x80);
                }
                dst.setUint8(offset+size-1, dst.getUint8(offset+size-1) & 0x7F);
                if (advance) {
                    this.offset += size;
                    return this;
                } else {
                    return size;
                }
            };
    
            /**
             * Reads a 32bit base 128 variable-length integer as used in protobuf. Requires Long.js.
             * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
             * @returns {!Long|!{value: Long, length: number}} The value read if offset is omitted, else the value read and
             *  the actual number of bytes read.
             * @throws {Error} If it's not a valid varint
             * @expose
             */
            ByteBuffer.prototype.readVarint64 = function(offset) {
                var advance = typeof offset === 'undefined';
                offset = typeof offset !== 'undefined' ? offset : this.offset;
                var start = offset;
                // ref: src/google/protobuf/io/coded_stream.cc
    
                var src = this.view,
                    part0, part1 = 0, part2 = 0, b;
                b = src.getUint8(offset++); part0  = (b & 0x7F)      ; if (b & 0x80) {
                b = src.getUint8(offset++); part0 |= (b & 0x7F) <<  7; if (b & 0x80) {
                b = src.getUint8(offset++); part0 |= (b & 0x7F) << 14; if (b & 0x80) {
                b = src.getUint8(offset++); part0 |= (b & 0x7F) << 21; if (b & 0x80) {
                b = src.getUint8(offset++); part1  = (b & 0x7F)      ; if (b & 0x80) {
                b = src.getUint8(offset++); part1 |= (b & 0x7F) <<  7; if (b & 0x80) {
                b = src.getUint8(offset++); part1 |= (b & 0x7F) << 14; if (b & 0x80) {
                b = src.getUint8(offset++); part1 |= (b & 0x7F) << 21; if (b & 0x80) {
                b = src.getUint8(offset++); part2  = (b & 0x7F)      ; if (b & 0x80) {
                b = src.getUint8(offset++); part2 |= (b & 0x7F) <<  7; if (b & 0x80) {
                throw(new Error("Data must be corrupt: Buffer overrun")); }}}}}}}}}}
                
                var value = Long.from28Bits(part0, part1, part2, false);
                if (advance) {
                    this.offset = offset;
                    return value;
                } else {
                    return {
                        "value": value,
                        "length": offset-start
                    };
                }
            };
    
            /**
             * Writes a zigzag encoded 64bit base 128 encoded variable-length integer as used in protobuf.
             * @param {number} value Value to write
             * @param {number=} offset Offset to write to. Defaults to {@link ByteBuffer#offset} which will be modified only if omitted.
             * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number of bytes written.
             * @expose
             */
            ByteBuffer.prototype.writeZigZagVarint64 = function(value, offset) {
                return this.writeVarint64(ByteBuffer.zigZagEncode64(value), offset);
            };
    
            /**
             * Reads a zigzag encoded 64bit base 128 variable-length integer as used in protobuf.
             * @param {number=} offset Offset to read from. Defaults to {@link ByteBuffer#offset} which will be modified only if omitted.
             * @returns {Long|!{value: Long, length: number}} The value read if offset is omitted, else the value read and the actual number of bytes read.
             * @throws {Error} If it's not a valid varint
             * @expose
             */
            ByteBuffer.prototype.readZigZagVarint64 = function(offset) {
                var dec = this.readVarint64(offset);
                if (typeof dec === 'object' && !(dec instanceof Long)) {
                    dec['value'] = ByteBuffer.zigZagDecode64(dec['value']);
                    return dec;
                }
                return ByteBuffer.zigZagDecode64(dec);
            };
                
         }

        /**
         * Writes a base 128 variable-length integer as used in protobuf. This is an alias of {@link ByteBuffer#writeVarint32}.
         * @function
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Defaults to {@link ByteBuffer#offset} which will be modified only if omitted.
         * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number of bytes written.
         * @expose
         */
        ByteBuffer.prototype.writeVarint = ByteBuffer.prototype.writeVarint32;

        /**
         * Reads a base 128 variable-length integer as used in protobuf. This is an alias of {@link ByteBuffer#readVarint32}.
         * @function
         * @param {number=} offset Offset to read from. Defaults to {@link ByteBuffer#offset} which will be modified only if omitted.
         * @returns {number|{value: number, length: number}} The value read if offset is omitted, else the value read and the actual number of bytes read.
         * @expose
         */
        ByteBuffer.prototype.readVarint = ByteBuffer.prototype.readVarint32;

        /**
         * Writes a zigzag encoded base 128 encoded variable-length integer as used in protobuf. This is an alias of {@link ByteBuffer#writeZigZagVarint32}.
         * @function
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Defaults to {@link ByteBuffer#offset} which will be modified only if omitted.
         * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number of bytes written.
         * @expose
         */
        ByteBuffer.prototype.writeZigZagVarint = ByteBuffer.prototype.writeZigZagVarint32;

        /**
         * Reads a zigzag encoded base 128 variable-length integer as used in protobuf. This is an alias of {@link ByteBuffer#readZigZagVarint32}.
         * @function
         * @param {number=} offset Offset to read from. Defaults to {@link ByteBuffer#offset} which will be modified only if omitted.
         * @returns {number|{value: number, length: number}} The value read if offset is omitted, else the value read and the actual number of bytes read.
         * @throws {Error} If it's not a valid varint
         * @expose
         */
        ByteBuffer.prototype.readZigZagVarint = ByteBuffer.prototype.readZigZagVarint32;

        /**
         * Calculates the actual number of bytes required to encode a 32bit base 128 variable-length integer.
         * @param {number} value Value to encode
         * @returns {number} Number of bytes required. Capped to {@link ByteBuffer.MAX_VARINT32_BYTES}
         * @expose
         */
        ByteBuffer.calculateVarint32 = function(value) {
            // ref: src/google/protobuf/io/coded_stream.cc
            value = value >>> 0;
            if (value < TWO_PWR_7_DBL) {
                return 1;
            } else if (value < TWO_PWR_14_DBL) {
                return 2;
            } else if (value < TWO_PWR_21_DBL) {
                return 3;
            } else if (value < TWO_PWR_28_DBL) {
                return 4;
            } else {
                return 5;
            }
        };
        
        // Available with Long.js only
        if (Long) {
    
            /**
             * Calculates the actual number of bytes required to encode a 64bit base 128 variable-length integer.
             * @param {number|!Long} value Value to encode
             * @returns {number} Number of bytes required. Capped to {@link ByteBuffer.MAX_VARINT64_BYTES}
             * @expose
             */
            ByteBuffer.calculateVarint64 = function(value) {
                // ref: src/google/protobuf/io/coded_stream.cc
                if (!(typeof value === 'object' && value instanceof Long)) value = Long.fromNumber(value, false);
    
                var part0 = value.toInt() >>> 0,
                    part1 = value.shiftRightUnsigned(28).toInt() >>> 0,
                    part2 = value.shiftRightUnsigned(56).toInt() >>> 0;
    
                if (part2 == 0) {
                    if (part1 == 0) {
                        if (part0 < TWO_PWR_14_DBL) {
                            return part0 < TWO_PWR_7_DBL ? 1 : 2;
                        } else {
                            return part0 < TWO_PWR_21_DBL ? 3 : 4;
                        }
                    } else {
                        if (part1 < TWO_PWR_14_DBL) {
                            return part1 < TWO_PWR_7_DBL ? 5 : 6;
                        } else {
                            return part1 < TWO_PWR_21_DBL ? 7 : 8;
                        }
                    }
                } else {
                    return part2 < TWO_PWR_7_DBL ? 9 : 10;
                }
            };
            
        }

        /**
         * Encodes a signed 32bit integer so that it can be effectively used with varint encoding.
         * @param {number} n Signed 32bit integer
         * @returns {number} Unsigned zigzag encoded 32bit integer
         * @expose
         */
        ByteBuffer.zigZagEncode32 = function(n) {
            // ref: src/google/protobuf/wire_format_lite.h
            return (((n |= 0) << 1) ^ (n >> 31)) >>> 0;
        };

        /**
         * Decodes a zigzag encoded signed 32bit integer.
         * @param {number} n Unsigned zigzag encoded 32bit integer
         * @returns {number} Signed 32bit integer
         * @expose
         */
        ByteBuffer.zigZagDecode32 = function(n) {
            // ref: src/google/protobuf/wire_format_lite.h
            return ((n >>> 1) ^ -(n & 1)) | 0;
        };
        
        // Available with Long.js only
        if (Long) {
    
            /**
             * Encodes a signed 64bit integer so that it can be effectively used with varint encoding.
             * @param {number|!Long} n Signed long
             * @returns {!Long} Unsigned zigzag encoded long
             * @expose
             */
            ByteBuffer.zigZagEncode64 = function(n) {
                // ref: src/google/protobuf/wire_format_lite.h
                if (typeof n === 'object' && n instanceof Long) {
                    if (n.unsigned) n = n.toSigned();
                } else {
                    n = Long.fromNumber(n, false);
                }
                return n.shiftLeft(1).xor(n.shiftRight(63)).toUnsigned();
            };
    
            /**
             * Decodes a zigzag encoded signed 64bit integer.
             * @param {!Long|number} n Unsigned zigzag encoded long or JavaScript number
             * @returns {!Long} Signed long
             * @throws {Error} If long support is not available
             * @expose
             */
            ByteBuffer.zigZagDecode64 = function(n) {
                // ref: src/google/protobuf/wire_format_lite.h
                if (typeof n === 'object' && n instanceof Long) {
                    if (!n.unsigned) n = n.toUnsigned();
                } else {
                    n = Long.fromNumber(n, true);
                }
                return n.shiftRightUnsigned(1).xor(n.and(Long.ONE).toSigned().negate()).toSigned();
            };
            
        }

        /**
         * Decodes a single UTF8 character from the specified ByteBuffer. The ByteBuffer's offsets are not modified.
         * @param {!ByteBuffer} src
         * @param {number} offset Offset to read from
         * @returns {!{char: number, length: number}} Decoded char code and the actual number of bytes read
         * @throws {Error} If the character cannot be decoded or there is a capacity overflow
         * @expose
         */
        ByteBuffer.decodeUTF8Char = function(src, offset) {
            var a = src.readUint8(offset), b, c, d, e, f, start = offset, charCode;
            // ref: http://en.wikipedia.org/wiki/UTF-8#Description
            // It's quite huge but should be pretty fast.
            if ((a&0x80)==0) {
                charCode = a;
                offset += 1;
            } else if ((a&0xE0)==0xC0) {
                b = src.readUint8(offset+1);
                charCode = ((a&0x1F)<<6) | (b&0x3F);
                offset += 2;
            } else if ((a&0xF0)==0xE0) {
                b = src.readUint8(offset+1);
                c = src.readUint8(offset+2);
                charCode = ((a&0x0F)<<12) | ((b&0x3F)<<6) | (c&0x3F);
                offset += 3;
            } else if ((a&0xF8)==0xF0) {
                b = src.readUint8(offset+1);
                c = src.readUint8(offset+2);
                d = src.readUint8(offset+3);
                charCode = ((a&0x07)<<18) | ((b&0x3F)<<12) | ((c&0x3F)<<6) | (d&0x3F);
                offset += 4;
            } else if ((a&0xFC)==0xF8) {
                b = src.readUint8(offset+1);
                c = src.readUint8(offset+2);
                d = src.readUint8(offset+3);
                e = src.readUint8(offset+4);
                charCode = ((a&0x03)<<24) | ((b&0x3F)<<18) | ((c&0x3F)<<12) | ((d&0x3F)<<6) | (e&0x3F);
                offset += 5;
            } else if ((a&0xFE)==0xFC) {
                b = src.readUint8(offset+1);
                c = src.readUint8(offset+2);
                d = src.readUint8(offset+3);
                e = src.readUint8(offset+4);
                f = src.readUint8(offset+5);
                charCode = ((a&0x01)<<30) | ((b&0x3F)<<24) | ((c&0x3F)<<18) | ((d&0x3F)<<12) | ((e&0x3F)<<6) | (f&0x3F);
                offset += 6;
            } else {
                throw(new Error("Cannot decode UTF8 character at offset "+offset+": charCode (0x"+a.toString(16)+") is invalid"));
            }
            return {
                "char": charCode ,
                "length": offset-start
            };
        };

        /**
         * Encodes a single UTF8 character to the specified ByteBuffer. The ByteBuffer's offsets are not modified.
         * @param {number} charCode Character to encode as char code
         * @param {!ByteBuffer} dst ByteBuffer to encode to
         * @param {number} offset Offset to write to
         * @returns {number} Actual number of bytes written
         * @throws {Error} If the character cannot be encoded
         * @expose
         */
        ByteBuffer.encodeUTF8Char = function(charCode, dst, offset) {
            var start = offset;
            // ref: http://en.wikipedia.org/wiki/UTF-8#Description
            // It's quite huge but should be pretty fast.
            if (charCode < 0) {
                throw(new Error("Cannot encode UTF8 character: charCode ("+charCode+") is negative"));
            }
            if (charCode < 0x80) {
                dst.writeUint8(charCode&0x7F, offset);
                offset += 1;
            } else if (charCode < 0x800) {
                dst.writeUint8(((charCode>>6)&0x1F)|0xC0, offset)
                    .writeUint8((charCode&0x3F)|0x80, offset+1);
                offset += 2;
            } else if (charCode < 0x10000) {
                dst.writeUint8(((charCode>>12)&0x0F)|0xE0, offset)
                    .writeUint8(((charCode>>6)&0x3F)|0x80, offset+1)
                    .writeUint8((charCode&0x3F)|0x80, offset+2);
                offset += 3;
            } else if (charCode < 0x200000) {
                dst.writeUint8(((charCode>>18)&0x07)|0xF0, offset)
                    .writeUint8(((charCode>>12)&0x3F)|0x80, offset+1)
                    .writeUint8(((charCode>>6)&0x3F)|0x80, offset+2)
                    .writeUint8((charCode&0x3F)|0x80, offset+3);
                offset += 4;
            } else if (charCode < 0x4000000) {
                dst.writeUint8(((charCode>>24)&0x03)|0xF8, offset)
                    .writeUint8(((charCode>>18)&0x3F)|0x80, offset+1)
                    .writeUint8(((charCode>>12)&0x3F)|0x80, offset+2)
                    .writeUint8(((charCode>>6)&0x3F)|0x80, offset+3)
                    .writeUint8((charCode&0x3F)|0x80, offset+4);
                offset += 5;
            } else if (charCode < 0x80000000) {
                dst.writeUint8(((charCode>>30)&0x01)|0xFC, offset)
                    .writeUint8(((charCode>>24)&0x3F)|0x80, offset+1)
                    .writeUint8(((charCode>>18)&0x3F)|0x80, offset+2)
                    .writeUint8(((charCode>>12)&0x3F)|0x80, offset+3)
                    .writeUint8(((charCode>>6)&0x3F)|0x80, offset+4)
                    .writeUint8((charCode&0x3F)|0x80, offset+5);
                offset += 6;
            } else {
                throw(new Error("Cannot encode UTF8 character: charCode (0x"+charCode.toString(16)+") is too large (>= 0x80000000)"));
            }
            return offset-start;
        };

        /**
         * Calculates the actual number of bytes required to encode the specified char code.
         * @param {number} charCode Character to encode as char code
         * @returns {number} Number of bytes required to encode the specified char code
         * @throws {Error} If the character cannot be calculated (too large)
         * @expose
         */
        ByteBuffer.calculateUTF8Char = function(charCode) {
            if (charCode < 0) {
                throw(new Error("Cannot calculate length of UTF8 character: charCode ("+charCode+") is negative"));
            }
            if (charCode < 0x80) {
                return 1;
            } else if (charCode < 0x800) {
                return 2;
            } else if (charCode < 0x10000) {
                return 3;
            } else if (charCode < 0x200000) {
                return 4;
            } else if (charCode < 0x4000000) {
                return 5;
            } else if (charCode < 0x80000000) {
                return 6;
            } else {
                throw(new Error("Cannot calculate length of UTF8 character: charCode (0x"+charCode.toString(16)+") is too large (>= 0x80000000)"));
            }
        };

        /**
         * Calculates the number of bytes required to store an UTF8 encoded string.
         * @param {string} str String to calculate
         * @returns {number} Number of bytes required
         */
        ByteBuffer.calculateUTF8String = function(str) {
            str = ""+str;
            var bytes = 0;
            for (var i=0, k=str.length; i<k; ++i) {
                // Does not throw since JS strings are already UTF8 encoded
                bytes += ByteBuffer.calculateUTF8Char(str.charCodeAt(i));
            }
            return bytes;
        };

        /**
         * Base64 alphabet.
         * @type {string}
         * @inner
         */
        var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        B64 = B64+""; // Prevent CC from inlining this for less code size

        /**
         * Encodes a ByteBuffer's contents to a base64 string.
         * @param {!ByteBuffer} bb ByteBuffer to encode. Will be cloned and flipped if length < offset.
         * @returns {string} Base64 encoded string
         * @throws {Error} If the argument is not a valid ByteBuffer
         * @expose
         */
        ByteBuffer.encode64 = function(bb) {
            // ref: http://phpjs.org/functions/base64_encode/
             if (!(bb instanceof ByteBuffer)) {
                bb = ByteBuffer.wrap(bb);
            } else if (bb.length < bb.offset) {
                 bb = bb.clone().flip();
             }
            var o1, o2, o3, h1, h2, h3, h4, bits, i = bb.offset,
                oi = 0,
                out = [];
            do {
                o1 = bb.readUint8(i++);
                o2 = bb.length > i ? bb.readUint8(i++) : 0;
                o3 = bb.length > i ? bb.readUint8(i++) : 0;
                bits = o1 << 16 | o2 << 8 | o3;
                h1 = bits >> 18 & 0x3f;
                h2 = bits >> 12 & 0x3f;
                h3 = bits >> 6 & 0x3f;
                h4 = bits & 0x3f;
                out[oi++] = B64.charAt(h1) + B64.charAt(h2) + B64.charAt(h3) + B64.charAt(h4);
            } while (i < bb.length);
            var enc = out.join(''),
                r = (bb.length - bb.offset) % 3;
            return (r ? enc.slice(0, r - 3) : enc) + '==='.slice(r || 3);
        };

        /**
         * Decodes a base64 encoded string to a ByteBuffer.
         * @param {string} str Base64 encoded string
         * @param {boolean=} littleEndian `true` to use little endian byte order, defaults to `false` for big endian.
         * @returns {!ByteBuffer} ByteBuffer
         * @throws {Error} If the argument is not a valid base64 encoded string
         * @expose
         */
        ByteBuffer.decode64 = function(str, littleEndian) {
            // ref: http://phpjs.org/functions/base64_decode/
            if (typeof str !== 'string') {
                throw(new Error("Illegal argument: Not a string"));
            }
            var o1, o2, o3, h1, h2, h3, h4, bits, i = 0,
                out = new ByteBuffer(Math.ceil(str.length / 3), littleEndian);
            do {
                h1 = B64.indexOf(str.charAt(i++));
                h2 = B64.indexOf(str.charAt(i++));
                h3 = B64.indexOf(str.charAt(i++));
                h4 = B64.indexOf(str.charAt(i++));
                if (h1 < 0 || h2 < 0 || h3 < 0 || h4 < 0) {
                    throw(new Error("Illegal argument: Not a valid base64 encoded string"));
                }
                bits = h1 << 18 | h2 << 12 | h3 << 6 | h4;
                o1 = bits >> 16 & 0xff;
                o2 = bits >> 8 & 0xff;
                o3 = bits & 0xff;
                if (h3 == 64) {
                    out.writeUint8(o1);
                } else if (h4 == 64) {
                    out.writeUint8(o1)
                        .writeUint8(o2);
                } else {
                    out.writeUint8(o1)
                        .writeUint8(o2)
                        .writeUint8(o3);
                }
            } while (i < str.length);
            return out.flip();
        };

        /**
         * Encodes a ByteBuffer to a hex encoded string.
         * @param {!ByteBuffer} bb ByteBuffer to encode. Will be cloned and flipped if length < offset.
         * @returns {string} Hex encoded string
         * @throws {Error} If the argument is not a valid ByteBuffer
         * @expose
         */
        ByteBuffer.encodeHex = function(bb) {
            if (!(bb instanceof ByteBuffer)) {
                bb = ByteBuffer.wrap(bb);
            } else if (bb.length < bb.offset) {
                bb = bb.clone().flip();
            }
            if (bb.array === null) return "";
            var val, out = [];
            for (var i=bb.offset, k=bb.length; i<k; ++i) {
                val = bb.view.getUint8(i).toString(16).toUpperCase();
                if (val.length < 2) val = "0"+val;
                out.push(val);
            }
            return out.join('');
        };

        /**
         * Decodes a hex encoded string to a ByteBuffer.
         * @param {string} str Hex encoded string
         * @param {boolean=} littleEndian `true` to use little endian byte order, defaults to `false` for big endian.
         * @returns {!ByteBuffer} ByteBuffer
         * @throws {Error} If the argument is not a valid hex encoded string
         * @expose
         */
        ByteBuffer.decodeHex = function(str, littleEndian) {
            if (typeof str !== 'string') {
                throw(new Error("Illegal argument: Not a string"));
            }
            if (str.length % 2 !== 0) {
                throw(new Error("Illegal argument: Not a hex encoded string"));
            }
            var o,
                out = new ByteBuffer(str.length/2, littleEndian);
            for (var i=0, k=str.length; i<k; i+=2) {
                out.writeUint8(parseInt(str.substring(i, i+2), 16));
            }
            return out.flip();
        };

        // NOTE on binary strings: Binary strings as used here have nothing to do with frequently asked questions about
        // conversion between ArrayBuffer and String. What we do here is what libraries like node-forge do to simulate a
        // byte buffer: Conversion between 8 bit unsigned integers and the low 8 bit UTF8/UCS2 characters. This is not
        // perfect as it effectively uses 16 bit per character in memory to store the 8 bit values, but that's not our
        // concern as we just want it to be compatible. It's always better to use ArrayBuffer/Buffer (!) while base64
        // and hex should be slightly worse regarding memory consumption and encoding speed.

        /**
         * Encodes a ByteBuffer to a binary string. A binary string in this case is a string composed of 8bit values
         *  as characters with a char code between 0 and 255 inclusive.
         * @param {!ByteBuffer} bb ByteBuffer to encode. Will be cloned and flipped if length < offset.
         * @returns {string} Binary string
         * @throws {Error} If the argument is not a valid ByteBuffer
         * @expose
         */
        ByteBuffer.encodeBinary = function(bb) {
            if (!(bb instanceof ByteBuffer)) {
                bb = ByteBuffer.wrap(bb);
            } else if (bb.length < bb.offset) {
                bb = bb.clone().flip();
            }
            var out = [], view = bb.view;
            for (var i=bb.offset, k=bb.length; i<k; ++i) {
                out.push(String.fromCharCode(view.getUint8(i)));
            }
            return out.join('');
        };

        /**
         * Decodes a binary string to a ByteBuffer. A binary string in this case is a string composed of 8bit values
         *  as characters with a char code between 0 and 255 inclusive.
         * @param {string} str Binary string
         * @param {boolean=} littleEndian `true` to use little endian byte order, defaults to `false` for big endian.
         * @returns {!ByteBuffer} ByteBuffer
         * @throws {Error} If the argument is not a valid binary string
         * @expose
         */
        ByteBuffer.decodeBinary = function(str, littleEndian) {
            if (typeof str !== 'string') {
                throw(new Error("Illegal argument: Not a string"));
            }
            var k=str.length,
                dst = new ArrayBuffer(k),
                view = new DataView(dst),
                val;
            for (var i=0; i<k; ++i) {
                if ((val = str.charCodeAt(i)) > 255) throw(new Error("Illegal argument: Not a binary string (char code "+val+")"));
                view.setUint8(i, val);
            }
            var bb = new ByteBuffer(k, littleEndian, true);
            bb.array = dst;
            bb.view = view;
            bb.length = k;
            return bb;
        };

        /**
         * Writes an UTF8 string.
         * @param {string} str String to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number of bytes written.
         * @expose
         */
        ByteBuffer.prototype.writeUTF8String = function(str, offset) {
            var advance = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            var start = offset;
            var encLen = ByteBuffer.calculateUTF8String(str); // See [1]
            this.ensureCapacity(offset+encLen);
            for (var i=0, j=str.length; i<j; ++i) {
                // [1] Does not throw since JS strings are already UTF8 encoded
                offset += ByteBuffer.encodeUTF8Char(str.charCodeAt(i), this, offset);
            }
            if (advance) {
                this.offset = offset;
                return this;
            } else {
                return offset-start;
            }
        };

        /**
         * Reads an UTF8 string.
         * @param {number} chars Number of characters to read
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {string|!{string: string, length: number}} The string read if offset is omitted, else the string
         *  read and the actual number of bytes read.
         * @throws {Error} If the string cannot be decoded
         * @expose
         */
        ByteBuffer.prototype.readUTF8String = function(chars, offset) {
            var advance = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            var dec, result = "", start = offset;
            for (var i=0; i<chars; ++i) {
                dec = ByteBuffer.decodeUTF8Char(this, offset);
                offset += dec["length"];
                result += String.fromCharCode(dec["char"]);
            }
            if (advance) {
                this.offset = offset;
                return result;
            } else {
                return {
                    "string": result,
                    "length": offset-start
                }
            }
        };

        /**
         * Reads an UTF8 string with the specified byte length.
         * @param {number} length Byte length
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {string|!{string: string, length: number}} The string read if offset is omitted, else the string
         *  read and the actual number of bytes read.
         * @expose
         * @throws {Error} If the length did not match or the string cannot be decoded
         */
        ByteBuffer.prototype.readUTF8StringBytes = function(length, offset) {
            var advance = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            var dec, result = "", start = offset;
            length = offset + length; // Limit
            while (offset < length) {
                dec = ByteBuffer.decodeUTF8Char(this, offset);
                offset += dec["length"];
                result += String.fromCharCode(dec["char"]);
            }
            if (offset != length) {
                throw(new Error("Actual string length differs from the specified: "+((offset>length ? "+" : "")+offset-length)+" bytes"));
            }
            if (advance) {
                this.offset = offset;
                return result;
            } else {
                return {
                    "string": result,
                    "length": offset-start
                }
            }
        };

        /**
         * Writes a string with prepended number of characters, which is also encoded as an UTF8 character..
         * @param {string} str String to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number of bytes written.
         * @expose
         */
        ByteBuffer.prototype.writeLString = function(str, offset) {
            str = ""+str;
            var advance = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            var encLen = ByteBuffer.encodeUTF8Char(str.length, this, offset);
            encLen += this.writeUTF8String(str, offset+encLen);
            if (advance) {
                this.offset += encLen;
                return this;
            } else {
                return encLen;
            }
        };

        /**
         * Reads a string with a prepended number of characters, which is also encoded as an UTF8 character.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {string|{string: string, length: number}} The string read if offset is omitted, else the string read
         *  and the actual number of bytes read.
         * @throws {Error} If the string cannot be decoded
         * @expose
         */
        ByteBuffer.prototype.readLString = function(offset) {
            var advance = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            var lenDec = ByteBuffer.decodeUTF8Char(this, offset),
                dec = this.readUTF8String(lenDec["char"], offset+lenDec["length"]);
            if (advance) {
                this.offset += lenDec["length"]+dec["length"];
                return dec["string"];
            } else {
                return {
                    "string": dec["string"],
                    "length": lenDec["length"]+dec["length"]
                };
            }
        };

        /**
         * Writes a string with prepended number of characters, which is encoded as a 32bit base 128 variable-length
         *  integer.
         * @param {string} str String to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number of bytes written
         * @expose
         */
        ByteBuffer.prototype.writeVString = function(str, offset) {
            str = ""+str;
            var advance = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            var encLen = this.writeVarint32(ByteBuffer.calculateUTF8String(str), offset);
            encLen += this.writeUTF8String(str, offset+encLen);
            if (advance) {
                this.offset += encLen;
                return this;
            } else {
                return encLen;
            }
        };

        /**
         * Reads a string with prepended number of characters, which is encoded as a 32bit base 128 variable-length 
         *  integer.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {string|!{string: string, length: number}} The string read if offset is omitted, else the string
         *  read and the actual number of bytes read.
         * @throws {Error} If the string cannot be decoded or if it is not preceeded by a valid varint
         * @expose
         */
        ByteBuffer.prototype.readVString = function(offset) {
            var advance = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            var lenDec = this.readVarint32(offset);
            var dec = this.readUTF8StringBytes(lenDec["value"], offset+lenDec["length"]);
            if (advance) {
                this.offset += lenDec["length"]+dec["length"];
                return dec["string"];
            } else {
                return {
                    "string": dec["string"],
                    "length": lenDec["length"]+dec["length"]
                };
            }
        };

        /**
         * Writes a string followed by a NULL character (Uint8). Beware: The source string must not contain NULL
         *  characters unless this is actually intended. This is not checked. If you have the option it is recommended
         *  to use {@link ByteBuffer#writeLString} or {@link ByteBuffer#writeVString} with the corresponding reading
         *  methods instead.
         * @param {string} str String to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number of bytes written
         * @expose
         */
        ByteBuffer.prototype.writeCString = function(str, offset) {
            str = ""+str;
            var advance = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            var encLen = this.writeUTF8String(str, offset);
            this.writeUint8(0, offset+encLen);
            if (advance) {
                this.offset += encLen+1;
                return this;
            } else {
                return encLen+1;
            }
        };

        /**
         * Reads a string followed by a NULL character (Uint8).
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {string|!{string: string, length: number}} The string read if offset is omitted, else the string
         *  read and the actual number of bytes read.
         * @throws {Error} If the string cannot be decoded
         * @expose
         */
        ByteBuffer.prototype.readCString = function(offset) {
            var advance = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            var dec, result = "", start = offset;
            do {
                dec = ByteBuffer.decodeUTF8Char(this, offset);
                offset += dec["length"];
                if (dec["char"] != 0) result += String.fromCharCode(dec["char"]);
            } while (dec["char"] != 0);
            if (advance) {
                this.offset = offset;
                return result;
            } else {
                return {
                    "string": result,
                    "length": offset-start
                };
            }
        };

        /**
         * Serializes and writes a JSON payload.
         * @param {*} data Data payload to serialize
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @param {function(*)=} stringify Stringify implementation to use. Defaults to {@link JSON.stringify}.
         * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number if bytes written
         * @expose
         */
        ByteBuffer.prototype.writeJSON = function(data, offset, stringify) {
            stringify = typeof stringify === 'function' ? stringify : JSON.stringify;
            return this.writeLString(stringify(data), offset);
        };

        /**
         * Reads a JSON payload and unserializes it.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @param {function(string)=} parse Parse implementation to use. Defaults to {@link JSON.parse}.
         * @returns {!*|!{data: *, length: number}} Data payload if offset is omitted, else the data payload and the
         *  actual number of bytes read
         * @throws {Error} If the data cannot be decoded
         * @expose
         */
        ByteBuffer.prototype.readJSON = function(offset, parse) {
            parse = typeof parse === 'function' ? parse : JSON.parse;
            var result = this.readLString(offset);
            if (typeof result === 'string') {
                return parse(result);
            } else {
                return {
                    "data": parse(result["string"]),
                    "length":  result["length"]
                };
            }
        };

        /**
         * Returns a textual two columns (hex, ascii) representation of this ByteBuffer's backing array.
         * @param {number=} wrap Wrap length. Defaults to 16.
         * @returns {string} Hex representation as of " 00<01 02>03... ASCII DATA" with marked offsets
         * @expose
         */
        ByteBuffer.prototype.toColumns = function(wrap) {
            if (this.array === null) return "DESTROYED";
            wrap = typeof wrap !== 'undefined' ? parseInt(wrap, 10) : 16;
            if (wrap < 1) wrap = 16;

            // Left colum: hex with offsets
            var out = "",
                lines = [],
                val,
                view = this.view;
            if (this.offset == 0 && this.length == 0) {
                out += "|";
            } else if (this.length == 0) {
                out += ">";
            } else if (this.offset == 0) {
                out += "<";
            } else {
                out += " ";
            }
            for (var i=0, k=this.array.byteLength; i<k; ++i) {
                if (i>0 && i%wrap == 0) {
                    while (out.length < 3*wrap+1) out += "   "; // Make it equal to maybe show something on the right
                    lines.push(out);
                    out = " ";
                }
                val =  view.getUint8(i).toString(16).toUpperCase();
                if (val.length < 2) val = "0"+val;
                out += val;
                if (i+1 == this.offset && i+1 == this.length) {
                    out += "|";
                } else if (i+1 == this.offset) {
                    out += "<";
                } else if (i+1 == this.length) {
                    out += ">";
                } else {
                    out += " ";
                }
            }
            if (out != " ") {
                lines.push(out);
            }
            // Make it equal
            for (i=0, k=lines.length; i<k; ++i) {
                while (lines[i].length < 3*wrap+1) lines[i] += "   "; // Make it equal to maybe show something on the right
            }

            // Right column: ASCII, using dots for (usually) non-printable characters
            var n = 0;
            out = "";
            for (i=0, k=this.array.byteLength; i<k; ++i) {
                if (i>0 && i%wrap == 0) {
                    lines[n] += " "+out;
                    out = ""; n++;
                }
                val = view.getUint8(i);
                out += val > 32 && val < 127 ? String.fromCharCode(val) : ".";
            }
            if (out != "") {
                lines[n] += " "+out;
            }
            return lines.join("\n");
        };

        /**
         * Prints debug information about this ByteBuffer's contents.
         * @param {function(string)=} out Output function to call, defaults to console.log
         * @expose
         */
        ByteBuffer.prototype.printDebug = function(out) {
            if (typeof out !== 'function') out = console.log.bind(console);
            out(
                (this.array != null ? "ByteBuffer(offset="+this.offset+",markedOffset="+this.markedOffset+",length="+this.length+",capacity="+this.array.byteLength+")" : "ByteBuffer(DESTROYED)")+"\n"+
                    "-------------------------------------------------------------------\n"+
                    this.toColumns()+"\n"
            );
        };

        /**
         * Returns the ByteBuffer's contents between offset and length as a hex string.
         * @param {boolean=} debug `true` to return the entire backing array with marked offsets, defaults to `false`
         * @returns {string} Hex string or debug string
         * @expose
         */
        ByteBuffer.prototype.toHex = function(debug) {
            var out = "",
                val,
                view = this.view,
                i, k;
            if (!debug) {
                return ByteBuffer.encodeHex(this);
            } else {
                if (this.array === null) return "DESTROYED";
                if (this.offset == 0 && this.length == 0) {
                    out += "|";
                } else if (this.length == 0) {
                    out += ">";
                } else if (this.offset == 0) {
                    out += "<";
                } else {
                    out += " ";
                }
                for (i=0, k=this.array.byteLength; i<k; ++i) {
                    val =  view.getUint8(i).toString(16).toUpperCase();
                    if (val.length < 2) val = "0"+val;
                    out += val;
                    if (i+1 === this.offset && i+1 === this.length) {
                        out += "|";
                    } else if (i+1 == this.offset) {
                        out += "<";
                    } else if (i+1 == this.length) {
                        out += ">";
                    } else {
                        out += " ";
                    }
                }
                return out;
            }
        };

        /**
         * Returns the ByteBuffer's contents between offset and length as a binary string. A binary string in this case
         *  is a string composed of 8bit values as characters with a char code between 0 and 255 inclusive.
         * @returns {string} Binary string
         * @expose
         */
        ByteBuffer.prototype.toBinary = function() {
            return ByteBuffer.encodeBinary(this);
        };

        /**
         * Returns the base64 encoded representation of the ByteBuffer's contents.
         * @returns {string} Base 64 encoded string
         * @expose
         */
        ByteBuffer.prototype.toBase64 = function() {
            if (this.array === null || this.offset >= this.length) return "";
            return ByteBuffer.encode64(this);
        };

        /**
         * Returns the ByteBuffer's contents as an UTF8 encoded string.
         * @returns {string}
         * @expose
         */
        ByteBuffer.prototype.toUTF8 = function() {
            if (this.array === null || this.offset >= this.length) return "";
            return this.readUTF8StringBytes(this.length - this.offset, this.offset)["string"];
        };

        /**
         * Converts the ByteBuffer to a string.
         * @param {string=} enc Output encoding. Returns an informative string representation by default but also allows
         *  direct conversion to "utf8", "hex", "base64" and "binary" encoding. "debug" returns a hex representation with
         *  marked offsets.
         * @returns {string} String representation
         * @expose
         */
        ByteBuffer.prototype.toString = function(enc) {
            enc = enc || "";
            switch (enc) {
                case "utf8":
                    return this.toUTF8();
                case "base64":
                    return this.toBase64();
                case "hex":
                    return this.toHex();
                case "binary":
                    return this.toBinary();
                case "debug":
                    return this.toHex(true);
                default:
                    if (this.array === null) {
                        return "ByteBuffer(DESTROYED)";
                    }
                    return "ByteBuffer(offset="+this.offset+",markedOffset="+this.markedOffset+",length="+this.length+",capacity="+this.array.byteLength+")";
            }
        };

        /**
         * Returns an ArrayBuffer compacted to contain this ByteBuffer's actual contents. Will transparently
         *  {@link ByteBuffer#flip} the ByteBuffer if its offset is larger than its length. Will return a reference to
         *  the unmodified backing buffer if offset=0 and length=capacity unless forceCopy is set to true.
         * @param {boolean=} forceCopy `true` forces the creation of a copy, defaults to `false`
         * @returns {?ArrayBuffer} Compacted ArrayBuffer or null if already destroyed
         * @expose
         */
        ByteBuffer.prototype.toArrayBuffer = function(forceCopy) {
            if (this.array === null) return null;
            var b = this.clone();
            if (b.offset > b.length) {
                b.flip();
            }
            var copied = false;
            if (b.offset > 0 || b.length < b.array.byteLength) {
                b.compact(); // Will always create a new backing buffer because of the above condition
                copied = true;
            }
            return forceCopy && !copied ? b.copy().array : b.array;
        };
        
        // Available with node.js only
        if (Buffer) {
    
            /**
             * Returns a node Buffer compacted to contain this ByteBuffer's actual contents. Will transparently
             *  {@link ByteBuffer#flip} the ByteBuffer if its offset is larger than its length. Will also copy all data (not
             *  a reference).
             * @returns {?Buffer} Compacted node Buffer or null if already destroyed
             * @expose
             */
            ByteBuffer.prototype.toBuffer = function() {
                if (this.array === null) return null;
                var offset = this.offset, length = this.length;
                if (offset > length) {
                    var temp = offset;
                    offset = length;
                    length = temp;
                }
                return new Buffer(new Uint8Array(this.array).subarray(offset, length));
            };
            
        }

        return ByteBuffer;
    }
    
    // Enable module loading if available
    if (typeof module !== 'undefined' && module["exports"]) { // CommonJS
        module["exports"] = loadByteBuffer(require("long"));
    } else if (typeof define !== 'undefined' && define["amd"]) { // AMD
        define("ByteBuffer", ["Math/Long"], function(Long) { return loadByteBuffer(Long); });
    } else { // Shim
        if (!global["dcodeIO"]) global["dcodeIO"] = {};
        global["dcodeIO"]["ByteBuffer"] = loadByteBuffer(global["dcodeIO"]["Long"]);
    }

})(this);

},{"buffer":5,"long":15}],15:[function(require,module,exports){
/*
 Copyright 2013 Daniel Wirtz <dcode@dcode.io>
 Copyright 2009 The Closure Library Authors. All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS-IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

/**
 * @license Long.js (c) 2013 Daniel Wirtz <dcode@dcode.io>
 * Released under the Apache License, Version 2.0
 * see: https://github.com/dcodeIO/Long.js for details
 * 
 * Long.js is based on goog.math.Long from the Closure Library.
 * Copyright 2009 The Closure Library Authors. All Rights Reserved.
 * Released under the Apache License, Version 2.0
 * see: https://code.google.com/p/closure-library/ for details
 */

/**
 * Defines a Long class for representing a 64-bit two's-complement
 * integer value, which faithfully simulates the behavior of a Java "long". This
 * implementation is derived from LongLib in GWT.
 */
(function(global) {

    /**
     * Constructs a 64-bit two's-complement integer, given its low and high 32-bit
     * values as *signed* integers.  See the from* functions below for more
     * convenient ways of constructing Longs.
     *
     * The internal representation of a long is the two given signed, 32-bit values.
     * We use 32-bit pieces because these are the size of integers on which
     * Javascript performs bit-operations.  For operations like addition and
     * multiplication, we split each number into 16-bit pieces, which can easily be
     * multiplied within Javascript's floating-point representation without overflow
     * or change in sign.
     *
     * In the algorithms below, we frequently reduce the negative case to the
     * positive case by negating the input(s) and then post-processing the result.
     * Note that we must ALWAYS check specially whether those values are MIN_VALUE
     * (-2^63) because -MIN_VALUE == MIN_VALUE (since 2^63 cannot be represented as
     * a positive number, it overflows back into a negative).  Not handling this
     * case would often result in infinite recursion.
     * 
     * @exports Long
     * @class A Long class for representing a 64-bit two's-complement integer value.
     * @param {number} low The low (signed) 32 bits of the long.
     * @param {number} high The high (signed) 32 bits of the long.
     * @param {boolean=} unsigned Whether unsigned or not. Defaults to `false` (signed).
     * @constructor
     */
    var Long = function(low, high, unsigned) {
        
        /**
         * The low 32 bits as a signed value.
         * @type {number}
         * @expose
         */
        this.low = low | 0;

        /**
         * The high 32 bits as a signed value.
         * @type {number}
         * @expose
         */
        this.high = high | 0;

        /**
         * Whether unsigned or not.
         * @type {boolean}
         * @expose
         */
        this.unsigned = !!unsigned;
    };

    // NOTE: Common constant values ZERO, ONE, NEG_ONE, etc. are defined below the from* methods on which they depend.

    // NOTE: The following cache variables are used internally only and are therefore not exposed as properties of the
    // Long class.
    
    /**
     * A cache of the Long representations of small integer values.
     * @type {!Object}
     */
    var INT_CACHE = {};

    /**
     * A cache of the Long representations of small unsigned integer values.
     * @type {!Object}
     */
    var UINT_CACHE = {};

    /**
     * Returns a Long representing the given (32-bit) integer value.
     * @param {number} value The 32-bit integer in question.
     * @param {boolean=} unsigned Whether unsigned or not. Defaults to false (signed).
     * @return {!Long} The corresponding Long value.
     * @expose
     */
    Long.fromInt = function(value, unsigned) {
        var obj, cachedObj;
        if (!unsigned) {
            value = value | 0;
            if (-128 <= value && value < 128) {
                cachedObj = INT_CACHE[value];
                if (cachedObj) return cachedObj;
            }
            obj = new Long(value, value < 0 ? -1 : 0, false);
            if (-128 <= value && value < 128) {
                INT_CACHE[value] = obj;
            }
            return obj;
        } else {
            value = value >>> 0;
            if (0 <= value && value < 256) {
                cachedObj = UINT_CACHE[value];
                if (cachedObj) return cachedObj;
            }
            obj = new Long(value, (value | 0) < 0 ? -1 : 0, true);
            if (0 <= value && value < 256) {
                UINT_CACHE[value] = obj;
            }
            return obj;
        }
    };

    /**
     * Returns a Long representing the given value, provided that it is a finite
     * number.  Otherwise, zero is returned.
     * @param {number} value The number in question.
     * @param {boolean=} unsigned Whether unsigned or not. Defaults to false (signed).
     * @return {!Long} The corresponding Long value.
     * @expose
     */
    Long.fromNumber = function(value, unsigned) {
        unsigned = !!unsigned;
        if (isNaN(value) || !isFinite(value)) {
            return Long.ZERO;
        } else if (!unsigned && value <= -TWO_PWR_63_DBL) {
            return Long.MIN_SIGNED_VALUE;
        } else if (unsigned && value <= 0) {
            return Long.MIN_UNSIGNED_VALUE;
        } else if (!unsigned && value + 1 >= TWO_PWR_63_DBL) {
            return Long.MAX_SIGNED_VALUE;
        } else if (unsigned && value >= TWO_PWR_64_DBL) {
            return Long.MAX_UNSIGNED_VALUE;
        } else if (value < 0) {
            return Long.fromNumber(-value, false).negate();
        } else {
            return new Long((value % TWO_PWR_32_DBL) | 0, (value / TWO_PWR_32_DBL) | 0, unsigned);
        }
    };

    /**
     * Returns a Long representing the 64bit integer that comes by concatenating the given low and high bits. Each is
     *  assumed to use 32 bits.
     * @param {number} lowBits The low 32 bits.
     * @param {number} highBits The high 32 bits.
     * @param {boolean=} unsigned Whether unsigned or not. Defaults to false (signed).
     * @return {!Long} The corresponding Long value.
     * @expose
     */
    Long.fromBits = function(lowBits, highBits, unsigned) {
        return new Long(lowBits, highBits, unsigned);
    };

    /**
     * Returns a Long representing the 64bit integer that comes by concatenating the given low, middle and high bits.
     *  Each is assumed to use 28 bits.
     * @param {number} part0 The low 28 bits
     * @param {number} part1 The middle 28 bits
     * @param {number} part2 The high 28 (8) bits
     * @param {boolean=} unsigned Whether unsigned or not. Defaults to false (signed).
     * @return {!Long}
     * @expose
     */
    Long.from28Bits = function(part0, part1, part2, unsigned) {
        // 00000000000000000000000000001111 11111111111111111111111122222222 2222222222222
        // LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH
        return Long.fromBits(part0 | (part1 << 28), (part1 >>> 4) | (part2) << 24, unsigned);
    };

    /**
     * Returns a Long representation of the given string, written using the given
     * radix.
     * @param {string} str The textual representation of the Long.
     * @param {(boolean|number)=} unsigned Whether unsigned or not. Defaults to false (signed).
     * @param {number=} radix The radix in which the text is written.
     * @return {!Long} The corresponding Long value.
     * @expose
     */
    Long.fromString = function(str, unsigned, radix) {
        if (str.length == 0) {
            throw(new Error('number format error: empty string'));
        }
        if (str === "NaN" || str === "Infinity" || str === "+Infinity" || str === "-Infinity") {
            return Long.ZERO;
        }
        if (typeof unsigned === 'number') { // For goog.math.Long compatibility
            radix = unsigned;
            unsigned = false;
        }
        radix = radix || 10;
        if (radix < 2 || 36 < radix) {
            throw(new Error('radix out of range: ' + radix));
        }

        if (str.charAt(0) == '-') {
            return Long.fromString(str.substring(1), unsigned, radix).negate();
        } else if (str.indexOf('-') >= 0) {
            throw(new Error('number format error: interior "-" character: ' + str));
        }

        // Do several (8) digits each time through the loop, so as to
        // minimize the calls to the very expensive emulated div.
        var radixToPower = Long.fromNumber(Math.pow(radix, 8));

        var result = Long.ZERO;
        for (var i = 0; i < str.length; i += 8) {
            var size = Math.min(8, str.length - i);
            var value = parseInt(str.substring(i, i + size), radix);
            if (size < 8) {
                var power = Long.fromNumber(Math.pow(radix, size));
                result = result.multiply(power).add(Long.fromNumber(value));
            } else {
                result = result.multiply(radixToPower);
                result = result.add(Long.fromNumber(value));
            }
        }
        return result;
    };

    // NOTE: the compiler should inline these constant values below and then remove these variables, so there should be
    // no runtime penalty for these.
    
    // NOTE: The following constant values are used internally only and are therefore not exposed as properties of the
    // Long class.

    /**
     * @type {number}
     */
    var TWO_PWR_16_DBL = 1 << 16;

    /**
     * @type {number}
     */
    var TWO_PWR_24_DBL = 1 << 24;

    /**
     * @type {number}
     */
    var TWO_PWR_32_DBL = TWO_PWR_16_DBL * TWO_PWR_16_DBL;

    /**
     * @type {number}
     */
    var TWO_PWR_31_DBL = TWO_PWR_32_DBL / 2;

    /**
     * @type {number}
     */
    var TWO_PWR_48_DBL = TWO_PWR_32_DBL * TWO_PWR_16_DBL;

    /**
     * @type {number}
     */
    var TWO_PWR_64_DBL = TWO_PWR_32_DBL * TWO_PWR_32_DBL;

    /**
     * @type {number}
     */
    var TWO_PWR_63_DBL = TWO_PWR_64_DBL / 2;

    /**
     * @type {!Long}
     */
    var TWO_PWR_24 = Long.fromInt(1 << 24);

    /**
     * @type {!Long}
     * @expose
     */
    Long.ZERO = Long.fromInt(0);

    /**
     * @type {!Long}
     * @expose
     */
    Long.ONE = Long.fromInt(1);

    /**
     * @type {!Long}
     * @expose
     */
    Long.NEG_ONE = Long.fromInt(-1);

    /**
     * @type {!Long}
     * @expose
     */
    Long.MAX_SIGNED_VALUE = Long.fromBits(0xFFFFFFFF | 0, 0x7FFFFFFF | 0, false);

    /**
     * @type {!Long}
     * @expose
     */
    Long.MAX_UNSIGNED_VALUE = Long.fromBits(0xFFFFFFFF | 0, 0xFFFFFFFF | 0, true);

    /**
     * Alias of {@link Long.MAX_SIGNED_VALUE} for goog.math.Long compatibility.
     * @type {!Long}
     * @expose
     */
    Long.MAX_VALUE = Long.MAX_SIGNED_VALUE;

    /**
     * @type {!Long}
     * @expose
     */
    Long.MIN_SIGNED_VALUE = Long.fromBits(0, 0x80000000 | 0, false);

    /**
     * @type {!Long}
     * @expose
     */
    Long.MIN_UNSIGNED_VALUE = Long.fromBits(0, 0, true);

    /**
     * Alias of {@link Long.MIN_SIGNED_VALUE}  for goog.math.Long compatibility.
     * @type {!Long}
     * @expose
     */
    Long.MIN_VALUE = Long.MIN_SIGNED_VALUE;

    /**
     * @return {number} The value, assuming it is a 32-bit integer.
     * @expose
     */
    Long.prototype.toInt = function() {
        return this.unsigned ? this.low >>> 0 : this.low;
    };

    /**
     * @return {number} The closest floating-point representation to this value.
     * @expose
     */
    Long.prototype.toNumber = function() {
        if (this.unsigned) {
            return ((this.high >>> 0) * TWO_PWR_32_DBL) + (this.low >>> 0);
        }
        return this.high * TWO_PWR_32_DBL + (this.low >>> 0);
    };

    /**
     * @param {number=} radix The radix in which the text should be written.
     * @return {string} The textual representation of this value.
     * @override
     * @expose
     */
    Long.prototype.toString = function(radix) {
        radix = radix || 10;
        if (radix < 2 || 36 < radix) {
            throw(new Error('radix out of range: ' + radix));
        }
        if (this.isZero()) {
            return '0';
        }
        var rem;
        if (this.isNegative()) { // Unsigned Longs are never negative
            if (this.equals(Long.MIN_SIGNED_VALUE)) {
                // We need to change the Long value before it can be negated, so we remove
                // the bottom-most digit in this base and then recurse to do the rest.
                var radixLong = Long.fromNumber(radix);
                var div = this.div(radixLong);
                rem = div.multiply(radixLong).subtract(this);
                return div.toString(radix) + rem.toInt().toString(radix);
            } else {
                return '-' + this.negate().toString(radix);
            }
        }

        // Do several (6) digits each time through the loop, so as to
        // minimize the calls to the very expensive emulated div.
        var radixToPower = Long.fromNumber(Math.pow(radix, 6));
        rem = this;
        var result = '';
        while (true) {
            var remDiv = rem.div(radixToPower);
            var intval = rem.subtract(remDiv.multiply(radixToPower)).toInt();
            var digits = intval.toString(radix);
            rem = remDiv;
            if (rem.isZero()) {
                return digits + result;
            } else {
                while (digits.length < 6) {
                    digits = '0' + digits;
                }
                result = '' + digits + result;
            }
        }
    };

    /**
     * @return {number} The high 32 bits as a signed value.
     * @expose
     */
    Long.prototype.getHighBits = function() {
        return this.high;
    };

    /**
     * @return {number} The high 32 bits as an unsigned value.
     * @expose
     */
    Long.prototype.getHighBitsUnsigned = function() {
        return this.high >>> 0;
    };

    /**
     * @return {number} The low 32 bits as a signed value.
     * @expose
     */
    Long.prototype.getLowBits = function() {
        return this.low;
    };

    /**
     * @return {number} The low 32 bits as an unsigned value.
     * @expose
     */
    Long.prototype.getLowBitsUnsigned = function() {
        return this.low >>> 0;
    };

    /**
     * @return {number} Returns the number of bits needed to represent the absolute
     *     value of this Long.
     * @expose
     */
    Long.prototype.getNumBitsAbs = function() {
        if (this.isNegative()) { // Unsigned Longs are never negative
            if (this.equals(Long.MIN_SIGNED_VALUE)) {
                return 64;
            } else {
                return this.negate().getNumBitsAbs();
            }
        } else {
            var val = this.high != 0 ? this.high : this.low;
            for (var bit = 31; bit > 0; bit--) {
                if ((val & (1 << bit)) != 0) {
                    break;
                }
            }
            return this.high != 0 ? bit + 33 : bit + 1;
        }
    };

    /**
     * @return {boolean} Whether this value is zero.
     * @expose
     */
    Long.prototype.isZero = function() {
        return this.high == 0 && this.low == 0;
    };

    /**
     * @return {boolean} Whether this value is negative.
     * @expose
     */
    Long.prototype.isNegative = function() {
        return !this.unsigned && this.high < 0;
    };

    /**
     * @return {boolean} Whether this value is odd.
     * @expose
     */
    Long.prototype.isOdd = function() {
        return (this.low & 1) == 1;
    };

    /**
     * @return {boolean} Whether this value is even.
     */
    Long.prototype.isEven = function() {
        return (this.low & 1) == 0;
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long equals the other.
     * @expose
     */
    Long.prototype.equals = function(other) {
        if (this.unsigned != other.unsigned && (this.high >>> 31) != (other.high >>> 31)) return false;
        return (this.high == other.high) && (this.low == other.low);
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long does not equal the other.
     * @expose
     */
    Long.prototype.notEquals = function(other) {
        return !this.equals(other);
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long is less than the other.
     * @expose
     */
    Long.prototype.lessThan = function(other) {
        return this.compare(other) < 0;
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long is less than or equal to the other.
     * @expose
     */
    Long.prototype.lessThanOrEqual = function(other) {
        return this.compare(other) <= 0;
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long is greater than the other.
     * @expose
     */
    Long.prototype.greaterThan = function(other) {
        return this.compare(other) > 0;
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long is greater than or equal to the other.
     * @expose
     */
    Long.prototype.greaterThanOrEqual = function(other) {
        return this.compare(other) >= 0;
    };

    /**
     * Compares this Long with the given one.
     * @param {Long} other Long to compare against.
     * @return {number} 0 if they are the same, 1 if the this is greater, and -1
     *     if the given one is greater.
     * @expose
     */
    Long.prototype.compare = function(other) {
        if (this.equals(other)) {
            return 0;
        }
        var thisNeg = this.isNegative();
        var otherNeg = other.isNegative();
        if (thisNeg && !otherNeg) return -1;
        if (!thisNeg && otherNeg) return 1;
        if (!this.unsigned) {
            // At this point the signs are the same
            return this.subtract(other).isNegative() ? -1 : 1;
        } else {
            // Both are positive if at least one is unsigned
            return (other.high >>> 0) > (this.high >>> 0) || (other.high == this.high && (other.low >>> 0) > (this.low >>> 0)) ? -1 : 1;
        }
    };

    /**
     * @return {!Long} The negation of this value.
     * @expose
     */
    Long.prototype.negate = function() {
        if (!this.unsigned && this.equals(Long.MIN_SIGNED_VALUE)) {
            return Long.MIN_SIGNED_VALUE;
        }
        return this.not().add(Long.ONE);
    };

    /**
     * Returns the sum of this and the given Long.
     * @param {Long} other Long to add to this one.
     * @return {!Long} The sum of this and the given Long.
     * @expose
     */
    Long.prototype.add = function(other) {
        // Divide each number into 4 chunks of 16 bits, and then sum the chunks.
        
        var a48 = this.high >>> 16;
        var a32 = this.high & 0xFFFF;
        var a16 = this.low >>> 16;
        var a00 = this.low & 0xFFFF;

        var b48 = other.high >>> 16;
        var b32 = other.high & 0xFFFF;
        var b16 = other.low >>> 16;
        var b00 = other.low & 0xFFFF;

        var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
        c00 += a00 + b00;
        c16 += c00 >>> 16;
        c00 &= 0xFFFF;
        c16 += a16 + b16;
        c32 += c16 >>> 16;
        c16 &= 0xFFFF;
        c32 += a32 + b32;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c48 += a48 + b48;
        c48 &= 0xFFFF;
        return Long.fromBits((c16 << 16) | c00, (c48 << 16) | c32, this.unsigned);
    };

    /**
     * Returns the difference of this and the given Long.
     * @param {Long} other Long to subtract from this.
     * @return {!Long} The difference of this and the given Long.
     * @expose
     */
    Long.prototype.subtract = function(other) {
        return this.add(other.negate());
    };

    /**
     * Returns the product of this and the given long.
     * @param {Long} other Long to multiply with this.
     * @return {!Long} The product of this and the other.
     * @expose
     */
    Long.prototype.multiply = function(other) {
        if (this.isZero()) {
            return Long.ZERO;
        } else if (other.isZero()) {
            return Long.ZERO;
        }

        if (this.equals(Long.MIN_VALUE)) {
            return other.isOdd() ? Long.MIN_VALUE : Long.ZERO;
        } else if (other.equals(Long.MIN_VALUE)) {
            return this.isOdd() ? Long.MIN_VALUE : Long.ZERO;
        }

        if (this.isNegative()) {
            if (other.isNegative()) {
                return this.negate().multiply(other.negate());
            } else {
                return this.negate().multiply(other).negate();
            }
        } else if (other.isNegative()) {
            return this.multiply(other.negate()).negate();
        }
        // If both longs are small, use float multiplication
        if (this.lessThan(TWO_PWR_24) &&
            other.lessThan(TWO_PWR_24)) {
            return Long.fromNumber(this.toNumber() * other.toNumber(), this.unsigned);
        }

        // Divide each long into 4 chunks of 16 bits, and then add up 4x4 products.
        // We can skip products that would overflow.
        
        var a48 = this.high >>> 16;
        var a32 = this.high & 0xFFFF;
        var a16 = this.low >>> 16;
        var a00 = this.low & 0xFFFF;

        var b48 = other.high >>> 16;
        var b32 = other.high & 0xFFFF;
        var b16 = other.low >>> 16;
        var b00 = other.low & 0xFFFF;

        var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
        c00 += a00 * b00;
        c16 += c00 >>> 16;
        c00 &= 0xFFFF;
        c16 += a16 * b00;
        c32 += c16 >>> 16;
        c16 &= 0xFFFF;
        c16 += a00 * b16;
        c32 += c16 >>> 16;
        c16 &= 0xFFFF;
        c32 += a32 * b00;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c32 += a16 * b16;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c32 += a00 * b32;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48;
        c48 &= 0xFFFF;
        return Long.fromBits((c16 << 16) | c00, (c48 << 16) | c32, this.unsigned);
    };

    /**
     * Returns this Long divided by the given one.
     * @param {Long} other Long by which to divide.
     * @return {!Long} This Long divided by the given one.
     * @expose
     */
    Long.prototype.div = function(other) {
        if (other.isZero()) {
            throw(new Error('division by zero'));
        } else if (this.isZero()) {
            return Long.ZERO;
        }
        if (this.equals(Long.MIN_SIGNED_VALUE)) {
            if (other.equals(Long.ONE) || other.equals(Long.NEG_ONE)) {
                return min;  // recall that -MIN_VALUE == MIN_VALUE
            } else if (other.equals(Long.MIN_VALUE)) {
                return Long.ONE;
            } else {
                // At this point, we have |other| >= 2, so |this/other| < |MIN_VALUE|.
                var halfThis = this.shiftRight(1);
                var approx = halfThis.div(other).shiftLeft(1);
                if (approx.equals(Long.ZERO)) {
                    return other.isNegative() ? Long.ONE : Long.NEG_ONE;
                } else {
                    var rem = this.subtract(other.multiply(approx));
                    var result = approx.add(rem.div(other));
                    return result;
                }
            }
        } else if (other.equals(Long.MIN_VALUE)) {
            return Long.ZERO;
        }
        if (this.isNegative()) {
            if (other.isNegative()) {
                return this.negate().div(other.negate());
            } else {
                return this.negate().div(other).negate();
            }
        } else if (other.isNegative()) {
            return this.div(other.negate()).negate();
        }

        // Repeat the following until the remainder is less than other:  find a
        // floating-point that approximates remainder / other *from below*, add this
        // into the result, and subtract it from the remainder.  It is critical that
        // the approximate value is less than or equal to the real value so that the
        // remainder never becomes negative.
        var res = Long.ZERO;
        var rem = this;
        while (rem.greaterThanOrEqual(other)) {
            // Approximate the result of division. This may be a little greater or
            // smaller than the actual value.
            var approx = Math.max(1, Math.floor(rem.toNumber() / other.toNumber()));

            // We will tweak the approximate result by changing it in the 48-th digit or
            // the smallest non-fractional digit, whichever is larger.
            var log2 = Math.ceil(Math.log(approx) / Math.LN2);
            var delta = (log2 <= 48) ? 1 : Math.pow(2, log2 - 48);

            // Decrease the approximation until it is smaller than the remainder.  Note
            // that if it is too large, the product overflows and is negative.
            var approxRes = Long.fromNumber(approx, this.unsigned);
            var approxRem = approxRes.multiply(other);
            while (approxRem.isNegative() || approxRem.greaterThan(rem)) {
                approx -= delta;
                approxRes = Long.fromNumber(approx, this.unsigned);
                approxRem = approxRes.multiply(other);
            }

            // We know the answer can't be zero... and actually, zero would cause
            // infinite recursion since we would make no progress.
            if (approxRes.isZero()) {
                approxRes = Long.ONE;
            }

            res = res.add(approxRes);
            rem = rem.subtract(approxRem);
        }
        return res;
    };

    /**
     * Returns this Long modulo the given one.
     * @param {Long} other Long by which to mod.
     * @return {!Long} This Long modulo the given one.
     * @expose
     */
    Long.prototype.modulo = function(other) {
        return this.subtract(this.div(other).multiply(other));
    };

    /**
     * @return {!Long} The bitwise-NOT of this value.
     * @expose
     */
    Long.prototype.not = function() {
        return Long.fromBits(~this.low, ~this.high, this.unsigned);
    };

    /**
     * Returns the bitwise-AND of this Long and the given one.
     * @param {Long} other The Long with which to AND.
     * @return {!Long} The bitwise-AND of this and the other.
     * @expose
     */
    Long.prototype.and = function(other) {
        return Long.fromBits(this.low & other.low, this.high & other.high, this.unsigned);
    };

    /**
     * Returns the bitwise-OR of this Long and the given one.
     * @param {Long} other The Long with which to OR.
     * @return {!Long} The bitwise-OR of this and the other.
     * @expose
     */
    Long.prototype.or = function(other) {
        return Long.fromBits(this.low | other.low, this.high | other.high, this.unsigned);
    };

    /**
     * Returns the bitwise-XOR of this Long and the given one.
     * @param {Long} other The Long with which to XOR.
     * @return {!Long} The bitwise-XOR of this and the other.
     * @expose
     */
    Long.prototype.xor = function(other) {
        return Long.fromBits(this.low ^ other.low, this.high ^ other.high, this.unsigned);
    };

    /**
     * Returns this Long with bits shifted to the left by the given amount.
     * @param {number} numBits The number of bits by which to shift.
     * @return {!Long} This shifted to the left by the given amount.
     * @expose
     */
    Long.prototype.shiftLeft = function(numBits) {
        numBits &= 63;
        if (numBits == 0) {
            return this;
        } else {
            var low = this.low;
            if (numBits < 32) {
                var high = this.high;
                return Long.fromBits(low << numBits, (high << numBits) | (low >>> (32 - numBits)), this.unsigned);
            } else {
                return Long.fromBits(0, low << (numBits - 32), this.unsigned);
            }
        }
    };

    /**
     * Returns this Long with bits shifted to the right by the given amount.
     * @param {number} numBits The number of bits by which to shift.
     * @return {!Long} This shifted to the right by the given amount.
     * @expose
     */
    Long.prototype.shiftRight = function(numBits) {
        numBits &= 63;
        if (numBits == 0) {
            return this;
        } else {
            var high = this.high;
            if (numBits < 32) {
                var low = this.low;
                return Long.fromBits((low >>> numBits) | (high << (32 - numBits)), high >> numBits, this.unsigned);
            } else {
                return Long.fromBits(high >> (numBits - 32), high >= 0 ? 0 : -1, this.unsigned);
            }
        }
    };

    /**
     * Returns this Long with bits shifted to the right by the given amount, with
     * the new top bits matching the current sign bit.
     * @param {number} numBits The number of bits by which to shift.
     * @return {!Long} This shifted to the right by the given amount, with
     *     zeros placed into the new leading bits.
     * @expose
     */
    Long.prototype.shiftRightUnsigned = function(numBits) {
        numBits &= 63;
        if (numBits == 0) {
            return this;
        } else {
            var high = this.high;
            if (numBits < 32) {
                var low = this.low;
                return Long.fromBits((low >>> numBits) | (high << (32 - numBits)), high >>> numBits, this.unsigned);
            } else if (numBits == 32) {
                return Long.fromBits(high, 0, this.unsigned);
            } else {
                return Long.fromBits(high >>> (numBits - 32), 0, this.unsigned);
            }
        }
    };

    /**
     * @return {!Long} Signed long
     * @expose
     */
    Long.prototype.toSigned = function() {
        var l = this.clone();
        l.unsigned = false;
        return l;
    };

    /**
     * @return {!Long} Unsigned long
     * @expose
     */
    Long.prototype.toUnsigned = function() {
        var l = this.clone();
        l.unsigned = true;
        return l;
    };
    
    /**
     * @return {Long} Cloned instance with the same low/high bits and unsigned flag.
     * @expose
     */
    Long.prototype.clone = function() {
        return new Long(this.low, this.high, this.unsigned);
    };

    // Enable module loading if available
    if (typeof module != 'undefined' && module["exports"]) { // CommonJS
        module["exports"] = Long;
    } else if (typeof define != 'undefined' && define["amd"]) { // AMD
        define("Math/Long", [], function() { return Long; });
    } else { // Shim
        if (!global["dcodeIO"]) {
            global["dcodeIO"] = {};
        }
        global["dcodeIO"]["Long"] = Long;
    }

})(this);

},{}],16:[function(require,module,exports){
module.exports = require("protobufjs").newBuilder().import({
    "package": null,
    "messages": [
        {
            "name": "VersionDummy",
            "fields": [],
            "enums": [
                {
                    "name": "Version",
                    "values": [
                        {
                            "name": "V0_1",
                            "id": 1063369270
                        },
                        {
                            "name": "V0_2",
                            "id": 1915781601
                        }
                    ],
                    "options": {}
                }
            ],
            "messages": [],
            "options": {}
        },
        {
            "name": "Query",
            "fields": [
                {
                    "rule": "optional",
                    "type": "QueryType",
                    "name": "type",
                    "id": 1,
                    "options": {}
                },
                {
                    "rule": "optional",
                    "type": "Term",
                    "name": "query",
                    "id": 2,
                    "options": {}
                },
                {
                    "rule": "optional",
                    "type": "int64",
                    "name": "token",
                    "id": 3,
                    "options": {}
                },
                {
                    "rule": "optional",
                    "type": "bool",
                    "name": "OBSOLETE_noreply",
                    "id": 4,
                    "options": {
                        "default": false
                    }
                },
                {
                    "rule": "optional",
                    "type": "bool",
                    "name": "accepts_r_json",
                    "id": 5,
                    "options": {
                        "default": false
                    }
                },
                {
                    "rule": "repeated",
                    "type": "AssocPair",
                    "name": "global_optargs",
                    "id": 6,
                    "options": {}
                }
            ],
            "enums": [
                {
                    "name": "QueryType",
                    "values": [
                        {
                            "name": "START",
                            "id": 1
                        },
                        {
                            "name": "CONTINUE",
                            "id": 2
                        },
                        {
                            "name": "STOP",
                            "id": 3
                        },
                        {
                            "name": "NOREPLY_WAIT",
                            "id": 4
                        }
                    ],
                    "options": {}
                }
            ],
            "messages": [
                {
                    "name": "AssocPair",
                    "fields": [
                        {
                            "rule": "optional",
                            "type": "string",
                            "name": "key",
                            "id": 1,
                            "options": {}
                        },
                        {
                            "rule": "optional",
                            "type": "Term",
                            "name": "val",
                            "id": 2,
                            "options": {}
                        }
                    ],
                    "enums": [],
                    "messages": [],
                    "options": {}
                }
            ],
            "options": {}
        },
        {
            "name": "Frame",
            "fields": [
                {
                    "rule": "optional",
                    "type": "FrameType",
                    "name": "type",
                    "id": 1,
                    "options": {}
                },
                {
                    "rule": "optional",
                    "type": "int64",
                    "name": "pos",
                    "id": 2,
                    "options": {}
                },
                {
                    "rule": "optional",
                    "type": "string",
                    "name": "opt",
                    "id": 3,
                    "options": {}
                }
            ],
            "enums": [
                {
                    "name": "FrameType",
                    "values": [
                        {
                            "name": "POS",
                            "id": 1
                        },
                        {
                            "name": "OPT",
                            "id": 2
                        }
                    ],
                    "options": {}
                }
            ],
            "messages": [],
            "options": {}
        },
        {
            "name": "Backtrace",
            "fields": [
                {
                    "rule": "repeated",
                    "type": "Frame",
                    "name": "frames",
                    "id": 1,
                    "options": {}
                }
            ],
            "enums": [],
            "messages": [],
            "options": {}
        },
        {
            "name": "Response",
            "fields": [
                {
                    "rule": "optional",
                    "type": "ResponseType",
                    "name": "type",
                    "id": 1,
                    "options": {}
                },
                {
                    "rule": "optional",
                    "type": "int64",
                    "name": "token",
                    "id": 2,
                    "options": {}
                },
                {
                    "rule": "repeated",
                    "type": "Datum",
                    "name": "response",
                    "id": 3,
                    "options": {}
                },
                {
                    "rule": "optional",
                    "type": "Backtrace",
                    "name": "backtrace",
                    "id": 4,
                    "options": {}
                },
                {
                    "rule": "optional",
                    "type": "Datum",
                    "name": "profile",
                    "id": 5,
                    "options": {}
                }
            ],
            "enums": [
                {
                    "name": "ResponseType",
                    "values": [
                        {
                            "name": "SUCCESS_ATOM",
                            "id": 1
                        },
                        {
                            "name": "SUCCESS_SEQUENCE",
                            "id": 2
                        },
                        {
                            "name": "SUCCESS_PARTIAL",
                            "id": 3
                        },
                        {
                            "name": "WAIT_COMPLETE",
                            "id": 4
                        },
                        {
                            "name": "CLIENT_ERROR",
                            "id": 16
                        },
                        {
                            "name": "COMPILE_ERROR",
                            "id": 17
                        },
                        {
                            "name": "RUNTIME_ERROR",
                            "id": 18
                        }
                    ],
                    "options": {}
                }
            ],
            "messages": [],
            "options": {}
        },
        {
            "name": "Datum",
            "fields": [
                {
                    "rule": "optional",
                    "type": "DatumType",
                    "name": "type",
                    "id": 1,
                    "options": {}
                },
                {
                    "rule": "optional",
                    "type": "bool",
                    "name": "r_bool",
                    "id": 2,
                    "options": {}
                },
                {
                    "rule": "optional",
                    "type": "double",
                    "name": "r_num",
                    "id": 3,
                    "options": {}
                },
                {
                    "rule": "optional",
                    "type": "string",
                    "name": "r_str",
                    "id": 4,
                    "options": {}
                },
                {
                    "rule": "repeated",
                    "type": "Datum",
                    "name": "r_array",
                    "id": 5,
                    "options": {}
                },
                {
                    "rule": "repeated",
                    "type": "AssocPair",
                    "name": "r_object",
                    "id": 6,
                    "options": {}
                }
            ],
            "enums": [
                {
                    "name": "DatumType",
                    "values": [
                        {
                            "name": "R_NULL",
                            "id": 1
                        },
                        {
                            "name": "R_BOOL",
                            "id": 2
                        },
                        {
                            "name": "R_NUM",
                            "id": 3
                        },
                        {
                            "name": "R_STR",
                            "id": 4
                        },
                        {
                            "name": "R_ARRAY",
                            "id": 5
                        },
                        {
                            "name": "R_OBJECT",
                            "id": 6
                        },
                        {
                            "name": "R_JSON",
                            "id": 7
                        }
                    ],
                    "options": {}
                }
            ],
            "messages": [
                {
                    "name": "AssocPair",
                    "fields": [
                        {
                            "rule": "optional",
                            "type": "string",
                            "name": "key",
                            "id": 1,
                            "options": {}
                        },
                        {
                            "rule": "optional",
                            "type": "Datum",
                            "name": "val",
                            "id": 2,
                            "options": {}
                        }
                    ],
                    "enums": [],
                    "messages": [],
                    "options": {}
                }
            ],
            "options": {},
            "extensions": [
                10000,
                20000
            ]
        },
        {
            "name": "Term",
            "fields": [
                {
                    "rule": "optional",
                    "type": "TermType",
                    "name": "type",
                    "id": 1,
                    "options": {}
                },
                {
                    "rule": "optional",
                    "type": "Datum",
                    "name": "datum",
                    "id": 2,
                    "options": {}
                },
                {
                    "rule": "repeated",
                    "type": "Term",
                    "name": "args",
                    "id": 3,
                    "options": {}
                },
                {
                    "rule": "repeated",
                    "type": "AssocPair",
                    "name": "optargs",
                    "id": 4,
                    "options": {}
                }
            ],
            "enums": [
                {
                    "name": "TermType",
                    "values": [
                        {
                            "name": "DATUM",
                            "id": 1
                        },
                        {
                            "name": "MAKE_ARRAY",
                            "id": 2
                        },
                        {
                            "name": "MAKE_OBJ",
                            "id": 3
                        },
                        {
                            "name": "VAR",
                            "id": 10
                        },
                        {
                            "name": "JAVASCRIPT",
                            "id": 11
                        },
                        {
                            "name": "ERROR",
                            "id": 12
                        },
                        {
                            "name": "IMPLICIT_VAR",
                            "id": 13
                        },
                        {
                            "name": "DB",
                            "id": 14
                        },
                        {
                            "name": "TABLE",
                            "id": 15
                        },
                        {
                            "name": "GET",
                            "id": 16
                        },
                        {
                            "name": "GET_ALL",
                            "id": 78
                        },
                        {
                            "name": "EQ",
                            "id": 17
                        },
                        {
                            "name": "NE",
                            "id": 18
                        },
                        {
                            "name": "LT",
                            "id": 19
                        },
                        {
                            "name": "LE",
                            "id": 20
                        },
                        {
                            "name": "GT",
                            "id": 21
                        },
                        {
                            "name": "GE",
                            "id": 22
                        },
                        {
                            "name": "NOT",
                            "id": 23
                        },
                        {
                            "name": "ADD",
                            "id": 24
                        },
                        {
                            "name": "SUB",
                            "id": 25
                        },
                        {
                            "name": "MUL",
                            "id": 26
                        },
                        {
                            "name": "DIV",
                            "id": 27
                        },
                        {
                            "name": "MOD",
                            "id": 28
                        },
                        {
                            "name": "APPEND",
                            "id": 29
                        },
                        {
                            "name": "PREPEND",
                            "id": 80
                        },
                        {
                            "name": "DIFFERENCE",
                            "id": 95
                        },
                        {
                            "name": "SET_INSERT",
                            "id": 88
                        },
                        {
                            "name": "SET_INTERSECTION",
                            "id": 89
                        },
                        {
                            "name": "SET_UNION",
                            "id": 90
                        },
                        {
                            "name": "SET_DIFFERENCE",
                            "id": 91
                        },
                        {
                            "name": "SLICE",
                            "id": 30
                        },
                        {
                            "name": "SKIP",
                            "id": 70
                        },
                        {
                            "name": "LIMIT",
                            "id": 71
                        },
                        {
                            "name": "INDEXES_OF",
                            "id": 87
                        },
                        {
                            "name": "CONTAINS",
                            "id": 93
                        },
                        {
                            "name": "GET_FIELD",
                            "id": 31
                        },
                        {
                            "name": "KEYS",
                            "id": 94
                        },
                        {
                            "name": "OBJECT",
                            "id": 143
                        },
                        {
                            "name": "HAS_FIELDS",
                            "id": 32
                        },
                        {
                            "name": "WITH_FIELDS",
                            "id": 96
                        },
                        {
                            "name": "PLUCK",
                            "id": 33
                        },
                        {
                            "name": "WITHOUT",
                            "id": 34
                        },
                        {
                            "name": "MERGE",
                            "id": 35
                        },
                        {
                            "name": "BETWEEN",
                            "id": 36
                        },
                        {
                            "name": "REDUCE",
                            "id": 37
                        },
                        {
                            "name": "MAP",
                            "id": 38
                        },
                        {
                            "name": "FILTER",
                            "id": 39
                        },
                        {
                            "name": "CONCATMAP",
                            "id": 40
                        },
                        {
                            "name": "ORDERBY",
                            "id": 41
                        },
                        {
                            "name": "DISTINCT",
                            "id": 42
                        },
                        {
                            "name": "COUNT",
                            "id": 43
                        },
                        {
                            "name": "IS_EMPTY",
                            "id": 86
                        },
                        {
                            "name": "UNION",
                            "id": 44
                        },
                        {
                            "name": "NTH",
                            "id": 45
                        },
                        {
                            "name": "GROUPED_MAP_REDUCE",
                            "id": 46
                        },
                        {
                            "name": "GROUPBY",
                            "id": 47
                        },
                        {
                            "name": "INNER_JOIN",
                            "id": 48
                        },
                        {
                            "name": "OUTER_JOIN",
                            "id": 49
                        },
                        {
                            "name": "EQ_JOIN",
                            "id": 50
                        },
                        {
                            "name": "ZIP",
                            "id": 72
                        },
                        {
                            "name": "INSERT_AT",
                            "id": 82
                        },
                        {
                            "name": "DELETE_AT",
                            "id": 83
                        },
                        {
                            "name": "CHANGE_AT",
                            "id": 84
                        },
                        {
                            "name": "SPLICE_AT",
                            "id": 85
                        },
                        {
                            "name": "COERCE_TO",
                            "id": 51
                        },
                        {
                            "name": "TYPEOF",
                            "id": 52
                        },
                        {
                            "name": "UPDATE",
                            "id": 53
                        },
                        {
                            "name": "DELETE",
                            "id": 54
                        },
                        {
                            "name": "REPLACE",
                            "id": 55
                        },
                        {
                            "name": "INSERT",
                            "id": 56
                        },
                        {
                            "name": "DB_CREATE",
                            "id": 57
                        },
                        {
                            "name": "DB_DROP",
                            "id": 58
                        },
                        {
                            "name": "DB_LIST",
                            "id": 59
                        },
                        {
                            "name": "TABLE_CREATE",
                            "id": 60
                        },
                        {
                            "name": "TABLE_DROP",
                            "id": 61
                        },
                        {
                            "name": "TABLE_LIST",
                            "id": 62
                        },
                        {
                            "name": "SYNC",
                            "id": 138
                        },
                        {
                            "name": "INDEX_CREATE",
                            "id": 75
                        },
                        {
                            "name": "INDEX_DROP",
                            "id": 76
                        },
                        {
                            "name": "INDEX_LIST",
                            "id": 77
                        },
                        {
                            "name": "INDEX_STATUS",
                            "id": 139
                        },
                        {
                            "name": "INDEX_WAIT",
                            "id": 140
                        },
                        {
                            "name": "FUNCALL",
                            "id": 64
                        },
                        {
                            "name": "BRANCH",
                            "id": 65
                        },
                        {
                            "name": "ANY",
                            "id": 66
                        },
                        {
                            "name": "ALL",
                            "id": 67
                        },
                        {
                            "name": "FOREACH",
                            "id": 68
                        },
                        {
                            "name": "FUNC",
                            "id": 69
                        },
                        {
                            "name": "ASC",
                            "id": 73
                        },
                        {
                            "name": "DESC",
                            "id": 74
                        },
                        {
                            "name": "INFO",
                            "id": 79
                        },
                        {
                            "name": "MATCH",
                            "id": 97
                        },
                        {
                            "name": "UPCASE",
                            "id": 141
                        },
                        {
                            "name": "DOWNCASE",
                            "id": 142
                        },
                        {
                            "name": "SAMPLE",
                            "id": 81
                        },
                        {
                            "name": "DEFAULT",
                            "id": 92
                        },
                        {
                            "name": "JSON",
                            "id": 98
                        },
                        {
                            "name": "ISO8601",
                            "id": 99
                        },
                        {
                            "name": "TO_ISO8601",
                            "id": 100
                        },
                        {
                            "name": "EPOCH_TIME",
                            "id": 101
                        },
                        {
                            "name": "TO_EPOCH_TIME",
                            "id": 102
                        },
                        {
                            "name": "NOW",
                            "id": 103
                        },
                        {
                            "name": "IN_TIMEZONE",
                            "id": 104
                        },
                        {
                            "name": "DURING",
                            "id": 105
                        },
                        {
                            "name": "DATE",
                            "id": 106
                        },
                        {
                            "name": "TIME_OF_DAY",
                            "id": 126
                        },
                        {
                            "name": "TIMEZONE",
                            "id": 127
                        },
                        {
                            "name": "YEAR",
                            "id": 128
                        },
                        {
                            "name": "MONTH",
                            "id": 129
                        },
                        {
                            "name": "DAY",
                            "id": 130
                        },
                        {
                            "name": "DAY_OF_WEEK",
                            "id": 131
                        },
                        {
                            "name": "DAY_OF_YEAR",
                            "id": 132
                        },
                        {
                            "name": "HOURS",
                            "id": 133
                        },
                        {
                            "name": "MINUTES",
                            "id": 134
                        },
                        {
                            "name": "SECONDS",
                            "id": 135
                        },
                        {
                            "name": "TIME",
                            "id": 136
                        },
                        {
                            "name": "MONDAY",
                            "id": 107
                        },
                        {
                            "name": "TUESDAY",
                            "id": 108
                        },
                        {
                            "name": "WEDNESDAY",
                            "id": 109
                        },
                        {
                            "name": "THURSDAY",
                            "id": 110
                        },
                        {
                            "name": "FRIDAY",
                            "id": 111
                        },
                        {
                            "name": "SATURDAY",
                            "id": 112
                        },
                        {
                            "name": "SUNDAY",
                            "id": 113
                        },
                        {
                            "name": "JANUARY",
                            "id": 114
                        },
                        {
                            "name": "FEBRUARY",
                            "id": 115
                        },
                        {
                            "name": "MARCH",
                            "id": 116
                        },
                        {
                            "name": "APRIL",
                            "id": 117
                        },
                        {
                            "name": "MAY",
                            "id": 118
                        },
                        {
                            "name": "JUNE",
                            "id": 119
                        },
                        {
                            "name": "JULY",
                            "id": 120
                        },
                        {
                            "name": "AUGUST",
                            "id": 121
                        },
                        {
                            "name": "SEPTEMBER",
                            "id": 122
                        },
                        {
                            "name": "OCTOBER",
                            "id": 123
                        },
                        {
                            "name": "NOVEMBER",
                            "id": 124
                        },
                        {
                            "name": "DECEMBER",
                            "id": 125
                        },
                        {
                            "name": "LITERAL",
                            "id": 137
                        }
                    ],
                    "options": {}
                }
            ],
            "messages": [
                {
                    "name": "AssocPair",
                    "fields": [
                        {
                            "rule": "optional",
                            "type": "string",
                            "name": "key",
                            "id": 1,
                            "options": {}
                        },
                        {
                            "rule": "optional",
                            "type": "Term",
                            "name": "val",
                            "id": 2,
                            "options": {}
                        }
                    ],
                    "enums": [],
                    "messages": [],
                    "options": {}
                }
            ],
            "options": {},
            "extensions": [
                10000,
                20000
            ]
        }
    ],
    "enums": [],
    "imports": [],
    "options": {},
    "services": []
}).build();

},{"protobufjs":13}],17:[function(require,module,exports){
// Generated by CoffeeScript 1.7.1
var err, native_pb, pb, protodef,
  __hasProp = {}.hasOwnProperty;

pb = require('protobufjs');

try {
  native_pb = require('./native-protobuf');
} catch (_error) {
  err = _error;
  native_pb = {};
}

if (native_pb.SerializeQuery != null) {
  module.exports.protobuf_implementation = "cpp";
} else {
  module.exports.protobuf_implementation = "js";
}

protodef = require('./proto-def');

module.exports.SerializeQuery = function(query) {
  var querypb;
  if (native_pb.SerializeQuery != null) {
    return native_pb.SerializeQuery(query);
  } else {
    querypb = new protodef.Query(query);
    return querypb.toBuffer();
  }
};

module.exports.ParseResponse = function(data) {
  var array, i, response, view;
  if (native_pb.ParseResponse != null) {
    return native_pb.ParseResponse(data);
  } else {
    array = new ArrayBuffer(data.length);
    view = new Uint8Array(array);
    i = 0;
    while (i < data.length) {
      view[i] = data.get(i);
      i++;
    }
    response = protodef.Response.decode(array);
    response.token = response.token.toInt();
    return response;
  }
};

module.exports.ResponseTypeSwitch = function(response, map, dflt) {
  var type, type_str, type_val, _ref;
  type = response.type;
  if (typeof type === 'string') {
    type = protodef.Response.ResponseType[type];
  }
  _ref = protodef.Response.ResponseType;
  for (type_str in _ref) {
    if (!__hasProp.call(_ref, type_str)) continue;
    type_val = _ref[type_str];
    if (type === type_val) {
      if (map[type_str] != null) {
        return map[type_str]();
      } else {
        break;
      }
    }
  }
  return dflt();
};

module.exports.DatumTypeSwitch = function(datum, map, dflt) {
  var type, type_str, type_val, _ref;
  type = datum.type;
  if (typeof type === 'string') {
    type = protodef.Datum.DatumType[type];
  }
  _ref = protodef.Datum.DatumType;
  for (type_str in _ref) {
    if (!__hasProp.call(_ref, type_str)) continue;
    type_val = _ref[type_str];
    if (type === type_val) {
      if (map[type_str] != null) {
        return map[type_str]();
      } else {
        break;
      }
    }
  }
  return dflt();
};

},{"./native-protobuf":2,"./proto-def":16,"protobufjs":13}],"rethinkdb":[function(require,module,exports){
module.exports=require('47wpdj');
},{}],"47wpdj":[function(require,module,exports){
// Generated by CoffeeScript 1.7.1
var error, net, protobuf, rethinkdb;

rethinkdb = require('./ast');

net = require('./net');

protobuf = require('./protobuf');

error = require('./errors');

rethinkdb.connect = net.connect;

rethinkdb.protobuf_implementation = protobuf.protobuf_implementation;

rethinkdb.Error = error;

module.exports = rethinkdb;

},{"./ast":9,"./errors":11,"./net":12,"./protobuf":17}],20:[function(require,module,exports){
// Generated by CoffeeScript 1.7.1
var convertPseudotype, deconstructDatum, err, mkAtom, mkErr, mkSeq, pb, recursivelyConvertPseudotype,
  __slice = [].slice;

err = require('./errors');

pb = require('./protobuf');

module.exports.ar = function(fun) {
  return function() {
    var args;
    args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    if (args.length !== fun.length) {
      throw new err.RqlDriverError("Expected " + fun.length + " argument(s) but found " + args.length + ".");
    }
    return fun.apply(this, args);
  };
};

module.exports.varar = function(min, max, fun) {
  return function() {
    var args;
    args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    if (((min != null) && args.length < min) || ((max != null) && args.length > max)) {
      if ((min != null) && (max == null)) {
        throw new err.RqlDriverError("Expected " + min + " or more argument(s) but found " + args.length + ".");
      }
      if ((max != null) && (min == null)) {
        throw new err.RqlDriverError("Expected " + max + " or fewer argument(s) but found " + args.length + ".");
      }
      throw new err.RqlDriverError("Expected between " + min + " and " + max + " argument(s) but found " + args.length + ".");
    }
    return fun.apply(this, args);
  };
};

module.exports.aropt = function(fun) {
  return function() {
    var args, expectedPosArgs, numPosArgs, perhapsOptDict;
    args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    expectedPosArgs = fun.length - 1;
    perhapsOptDict = args[expectedPosArgs];
    if ((perhapsOptDict != null) && (Object.prototype.toString.call(perhapsOptDict) !== '[object Object]')) {
      perhapsOptDict = null;
    }
    numPosArgs = args.length - (perhapsOptDict != null ? 1 : 0);
    if (expectedPosArgs !== numPosArgs) {
      throw new err.RqlDriverError("Expected " + expectedPosArgs + " argument(s) but found " + numPosArgs + ".");
    }
    return fun.apply(this, args);
  };
};

module.exports.toArrayBuffer = function(node_buffer) {
  var arr, i, value, _i, _len;
  arr = new Uint8Array(new ArrayBuffer(node_buffer.length));
  for (i = _i = 0, _len = node_buffer.length; _i < _len; i = ++_i) {
    value = node_buffer[i];
    arr[i] = value;
  }
  return arr.buffer;
};

convertPseudotype = function(obj, opts) {
  switch (obj['$reql_type$']) {
    case 'TIME':
      switch (opts.timeFormat) {
        case 'native':
        case void 0:
          if (obj['epoch_time'] == null) {
            throw new err.RqlDriverError("pseudo-type TIME " + obj + " object missing expected field 'epoch_time'.");
          }
          return new Date(obj['epoch_time'] * 1000);
        case 'raw':
          return obj;
        default:
          throw new err.RqlDriverError("Unknown timeFormat run option " + opts.timeFormat + ".");
      }
      break;
    default:
      return obj;
  }
};

recursivelyConvertPseudotype = function(obj, opts) {
  var i, key, value, _i, _len;
  if (obj instanceof Array) {
    for (i = _i = 0, _len = obj.length; _i < _len; i = ++_i) {
      value = obj[i];
      obj[i] = recursivelyConvertPseudotype(value, opts);
    }
  } else if (obj instanceof Object) {
    for (key in obj) {
      value = obj[key];
      obj[key] = recursivelyConvertPseudotype(value, opts);
    }
    obj = convertPseudotype(obj, opts);
  }
  return obj;
};

deconstructDatum = function(datum, opts) {
  return pb.DatumTypeSwitch(datum, {
    "R_JSON": (function(_this) {
      return function() {
        var obj;
        obj = JSON.parse(datum.r_str);
        return recursivelyConvertPseudotype(obj, opts);
      };
    })(this),
    "R_NULL": (function(_this) {
      return function() {
        return null;
      };
    })(this),
    "R_BOOL": (function(_this) {
      return function() {
        return datum.r_bool;
      };
    })(this),
    "R_NUM": (function(_this) {
      return function() {
        return datum.r_num;
      };
    })(this),
    "R_STR": (function(_this) {
      return function() {
        return datum.r_str;
      };
    })(this),
    "R_ARRAY": (function(_this) {
      return function() {
        var dt, _i, _len, _ref, _results;
        _ref = datum.r_array;
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          dt = _ref[_i];
          _results.push(deconstructDatum(dt, opts));
        }
        return _results;
      };
    })(this),
    "R_OBJECT": (function(_this) {
      return function() {
        var obj, pair, _i, _len, _ref;
        obj = {};
        _ref = datum.r_object;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          pair = _ref[_i];
          obj[pair.key] = deconstructDatum(pair.val, opts);
        }
        return convertPseudotype(obj, opts);
      };
    })(this)
  }, (function(_this) {
    return function() {
      throw new err.RqlDriverError("Unknown Datum type");
    };
  })(this));
};

mkAtom = function(response, opts) {
  return deconstructDatum(response.response[0], opts);
};

mkSeq = function(response, opts) {
  var res, _i, _len, _ref, _results;
  _ref = response.response;
  _results = [];
  for (_i = 0, _len = _ref.length; _i < _len; _i++) {
    res = _ref[_i];
    _results.push(deconstructDatum(res, opts));
  }
  return _results;
};

mkErr = function(ErrClass, response, root) {
  var bt, frame, msg;
  msg = mkAtom(response);
  bt = (function() {
    var _i, _len, _ref, _ref1, _results;
    _ref = response.backtrace.frames;
    _results = [];
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      frame = _ref[_i];
      if (frame.type === "POS") {
        _results.push(parseInt(frame.pos));
      } else {
        if ((_ref1 = frame.pos) != null ? _ref1.toInt : void 0) {
          _results.push(frame.pos.toInt());
        } else {
          _results.push(frame.pos);
        }
      }
    }
    return _results;
  })();
  return new ErrClass(msg, root, bt);
};

module.exports.deconstructDatum = deconstructDatum;

module.exports.mkAtom = mkAtom;

module.exports.mkSeq = mkSeq;

module.exports.mkErr = mkErr;

},{"./errors":11,"./protobuf":17}]},{},[])