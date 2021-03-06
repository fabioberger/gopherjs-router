"use strict";
(function($topLevelThis) {

Error.stackTraceLimit = Infinity;

var $global, $module;
if (typeof window !== "undefined") { /* web page */
  $global = window;
} else if (typeof self !== "undefined") { /* web worker */
  $global = self;
} else if (typeof global !== "undefined") { /* Node.js */
  $global = global;
  $global.require = require;
} else { /* others (e.g. Nashorn) */
  $global = $topLevelThis;
}

if ($global === undefined || $global.Array === undefined) {
  throw new Error("no global object found");
}
if (typeof module !== "undefined") {
  $module = module;
}

var $packages = {}, $idCounter = 0;
var $keys = function(m) { return m ? Object.keys(m) : []; };
var $min = Math.min;
var $mod = function(x, y) { return x % y; };
var $parseInt = parseInt;
var $parseFloat = function(f) {
  if (f !== undefined && f !== null && f.constructor === Number) {
    return f;
  }
  return parseFloat(f);
};
var $flushConsole = function() {};

var $mapArray = function(array, f) {
  var newArray = new array.constructor(array.length);
  for (var i = 0; i < array.length; i++) {
    newArray[i] = f(array[i]);
  }
  return newArray;
};

var $methodVal = function(recv, name) {
  var vals = recv.$methodVals || {};
  recv.$methodVals = vals; /* noop for primitives */
  var f = vals[name];
  if (f !== undefined) {
    return f;
  }
  var method = recv[name];
  f = function() {
    $stackDepthOffset--;
    try {
      return method.apply(recv, arguments);
    } finally {
      $stackDepthOffset++;
    }
  };
  vals[name] = f;
  return f;
};

var $methodExpr = function(method) {
  if (method.$expr === undefined) {
    method.$expr = function() {
      $stackDepthOffset--;
      try {
        return Function.call.apply(method, arguments);
      } finally {
        $stackDepthOffset++;
      }
    };
  }
  return method.$expr;
};

var $subslice = function(slice, low, high, max) {
  if (low < 0 || high < low || max < high || high > slice.$capacity || max > slice.$capacity) {
    $throwRuntimeError("slice bounds out of range");
  }
  var s = new slice.constructor(slice.$array);
  s.$offset = slice.$offset + low;
  s.$length = slice.$length - low;
  s.$capacity = slice.$capacity - low;
  if (high !== undefined) {
    s.$length = high - low;
  }
  if (max !== undefined) {
    s.$capacity = max - low;
  }
  return s;
};

var $sliceToArray = function(slice) {
  if (slice.$length === 0) {
    return [];
  }
  if (slice.$array.constructor !== Array) {
    return slice.$array.subarray(slice.$offset, slice.$offset + slice.$length);
  }
  return slice.$array.slice(slice.$offset, slice.$offset + slice.$length);
};

var $decodeRune = function(str, pos) {
  var c0 = str.charCodeAt(pos);

  if (c0 < 0x80) {
    return [c0, 1];
  }

  if (c0 !== c0 || c0 < 0xC0) {
    return [0xFFFD, 1];
  }

  var c1 = str.charCodeAt(pos + 1);
  if (c1 !== c1 || c1 < 0x80 || 0xC0 <= c1) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xE0) {
    var r = (c0 & 0x1F) << 6 | (c1 & 0x3F);
    if (r <= 0x7F) {
      return [0xFFFD, 1];
    }
    return [r, 2];
  }

  var c2 = str.charCodeAt(pos + 2);
  if (c2 !== c2 || c2 < 0x80 || 0xC0 <= c2) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xF0) {
    var r = (c0 & 0x0F) << 12 | (c1 & 0x3F) << 6 | (c2 & 0x3F);
    if (r <= 0x7FF) {
      return [0xFFFD, 1];
    }
    if (0xD800 <= r && r <= 0xDFFF) {
      return [0xFFFD, 1];
    }
    return [r, 3];
  }

  var c3 = str.charCodeAt(pos + 3);
  if (c3 !== c3 || c3 < 0x80 || 0xC0 <= c3) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xF8) {
    var r = (c0 & 0x07) << 18 | (c1 & 0x3F) << 12 | (c2 & 0x3F) << 6 | (c3 & 0x3F);
    if (r <= 0xFFFF || 0x10FFFF < r) {
      return [0xFFFD, 1];
    }
    return [r, 4];
  }

  return [0xFFFD, 1];
};

var $encodeRune = function(r) {
  if (r < 0 || r > 0x10FFFF || (0xD800 <= r && r <= 0xDFFF)) {
    r = 0xFFFD;
  }
  if (r <= 0x7F) {
    return String.fromCharCode(r);
  }
  if (r <= 0x7FF) {
    return String.fromCharCode(0xC0 | r >> 6, 0x80 | (r & 0x3F));
  }
  if (r <= 0xFFFF) {
    return String.fromCharCode(0xE0 | r >> 12, 0x80 | (r >> 6 & 0x3F), 0x80 | (r & 0x3F));
  }
  return String.fromCharCode(0xF0 | r >> 18, 0x80 | (r >> 12 & 0x3F), 0x80 | (r >> 6 & 0x3F), 0x80 | (r & 0x3F));
};

var $stringToBytes = function(str) {
  var array = new Uint8Array(str.length);
  for (var i = 0; i < str.length; i++) {
    array[i] = str.charCodeAt(i);
  }
  return array;
};

var $bytesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "";
  for (var i = 0; i < slice.$length; i += 10000) {
    str += String.fromCharCode.apply(null, slice.$array.subarray(slice.$offset + i, slice.$offset + Math.min(slice.$length, i + 10000)));
  }
  return str;
};

var $stringToRunes = function(str) {
  var array = new Int32Array(str.length);
  var rune, j = 0;
  for (var i = 0; i < str.length; i += rune[1], j++) {
    rune = $decodeRune(str, i);
    array[j] = rune[0];
  }
  return array.subarray(0, j);
};

var $runesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "";
  for (var i = 0; i < slice.$length; i++) {
    str += $encodeRune(slice.$array[slice.$offset + i]);
  }
  return str;
};

var $copyString = function(dst, src) {
  var n = Math.min(src.length, dst.$length);
  for (var i = 0; i < n; i++) {
    dst.$array[dst.$offset + i] = src.charCodeAt(i);
  }
  return n;
};

var $copySlice = function(dst, src) {
  var n = Math.min(src.$length, dst.$length);
  $internalCopy(dst.$array, src.$array, dst.$offset, src.$offset, n, dst.constructor.elem);
  return n;
};

var $copy = function(dst, src, type) {
  switch (type.kind) {
  case $kindArray:
    $internalCopy(dst, src, 0, 0, src.length, type.elem);
    break;
  case $kindStruct:
    for (var i = 0; i < type.fields.length; i++) {
      var f = type.fields[i];
      switch (f.type.kind) {
      case $kindArray:
      case $kindStruct:
        $copy(dst[f.prop], src[f.prop], f.type);
        continue;
      default:
        dst[f.prop] = src[f.prop];
        continue;
      }
    }
    break;
  }
};

var $internalCopy = function(dst, src, dstOffset, srcOffset, n, elem) {
  if (n === 0 || (dst === src && dstOffset === srcOffset)) {
    return;
  }

  if (src.subarray) {
    dst.set(src.subarray(srcOffset, srcOffset + n), dstOffset);
    return;
  }

  switch (elem.kind) {
  case $kindArray:
  case $kindStruct:
    if (dst === src && dstOffset > srcOffset) {
      for (var i = n - 1; i >= 0; i--) {
        $copy(dst[dstOffset + i], src[srcOffset + i], elem);
      }
      return;
    }
    for (var i = 0; i < n; i++) {
      $copy(dst[dstOffset + i], src[srcOffset + i], elem);
    }
    return;
  }

  if (dst === src && dstOffset > srcOffset) {
    for (var i = n - 1; i >= 0; i--) {
      dst[dstOffset + i] = src[srcOffset + i];
    }
    return;
  }
  for (var i = 0; i < n; i++) {
    dst[dstOffset + i] = src[srcOffset + i];
  }
};

var $clone = function(src, type) {
  var clone = type.zero();
  $copy(clone, src, type);
  return clone;
};

var $pointerOfStructConversion = function(obj, type) {
  if(obj.$proxies === undefined) {
    obj.$proxies = {};
    obj.$proxies[obj.constructor.string] = obj;
  }
  var proxy = obj.$proxies[type.string];
  if (proxy === undefined) {
    var properties = {};
    for (var i = 0; i < type.elem.fields.length; i++) {
      (function(fieldProp) {
        properties[fieldProp] = {
          get: function() { return obj[fieldProp]; },
          set: function(value) { obj[fieldProp] = value; },
        };
      })(type.elem.fields[i].prop);
    }
    proxy = Object.create(type.prototype, properties);
    proxy.$val = proxy;
    obj.$proxies[type.string] = proxy;
    proxy.$proxies = obj.$proxies;
  }
  return proxy;
};

var $append = function(slice) {
  return $internalAppend(slice, arguments, 1, arguments.length - 1);
};

var $appendSlice = function(slice, toAppend) {
  return $internalAppend(slice, toAppend.$array, toAppend.$offset, toAppend.$length);
};

var $internalAppend = function(slice, array, offset, length) {
  if (length === 0) {
    return slice;
  }

  var newArray = slice.$array;
  var newOffset = slice.$offset;
  var newLength = slice.$length + length;
  var newCapacity = slice.$capacity;

  if (newLength > newCapacity) {
    newOffset = 0;
    newCapacity = Math.max(newLength, slice.$capacity < 1024 ? slice.$capacity * 2 : Math.floor(slice.$capacity * 5 / 4));

    if (slice.$array.constructor === Array) {
      newArray = slice.$array.slice(slice.$offset, slice.$offset + slice.$length);
      newArray.length = newCapacity;
      var zero = slice.constructor.elem.zero;
      for (var i = slice.$length; i < newCapacity; i++) {
        newArray[i] = zero();
      }
    } else {
      newArray = new slice.$array.constructor(newCapacity);
      newArray.set(slice.$array.subarray(slice.$offset, slice.$offset + slice.$length));
    }
  }

  $internalCopy(newArray, array, newOffset + slice.$length, offset, length, slice.constructor.elem);

  var newSlice = new slice.constructor(newArray);
  newSlice.$offset = newOffset;
  newSlice.$length = newLength;
  newSlice.$capacity = newCapacity;
  return newSlice;
};

var $equal = function(a, b, type) {
  switch (type.kind) {
  case $kindFloat32:
    return $float32IsEqual(a, b);
  case $kindComplex64:
    return $float32IsEqual(a.$real, b.$real) && $float32IsEqual(a.$imag, b.$imag);
  case $kindComplex128:
    return a.$real === b.$real && a.$imag === b.$imag;
  case $kindInt64:
  case $kindUint64:
    return a.$high === b.$high && a.$low === b.$low;
  case $kindPtr:
    if (a.constructor.elem) {
      return a === b;
    }
    return $pointerIsEqual(a, b);
  case $kindArray:
    if (a.length != b.length) {
      return false;
    }
    for (var i = 0; i < a.length; i++) {
      if (!$equal(a[i], b[i], type.elem)) {
        return false;
      }
    }
    return true;
  case $kindStruct:
    for (var i = 0; i < type.fields.length; i++) {
      var f = type.fields[i];
      if (!$equal(a[f.prop], b[f.prop], f.type)) {
        return false;
      }
    }
    return true;
  case $kindInterface:
    if (type === $js.Object) {
      return a === b;
    }
    return $interfaceIsEqual(a, b);
  default:
    return a === b;
  }
};

var $interfaceIsEqual = function(a, b) {
  if (a === $ifaceNil || b === $ifaceNil) {
    return a === b;
  }
  if (a.constructor !== b.constructor) {
    return false;
  }
  if (!a.constructor.comparable) {
    $throwRuntimeError("comparing uncomparable type " + a.constructor.string);
  }
  return $equal(a.$val, b.$val, a.constructor);
};

var $float32IsEqual = function(a, b) {
  if (a === b) {
    return true;
  }
  if (a === 1/0 || b === 1/0 || a === -1/0 || b === -1/0 || a !== a || b !== b) {
    return false;
  }
  var math = $packages["math"];
  return math !== undefined && math.Float32bits(a) === math.Float32bits(b);
};

var $pointerIsEqual = function(a, b) {
  if (a === b) {
    return true;
  }
  if (a.$get === $throwNilPointerError || b.$get === $throwNilPointerError) {
    return a.$get === $throwNilPointerError && b.$get === $throwNilPointerError;
  }
  var va = a.$get();
  var vb = b.$get();
  if (va !== vb) {
    return false;
  }
  var dummy = va + 1;
  a.$set(dummy);
  var equal = b.$get() === dummy;
  a.$set(va);
  return equal;
};

var $kindBool = 1;
var $kindInt = 2;
var $kindInt8 = 3;
var $kindInt16 = 4;
var $kindInt32 = 5;
var $kindInt64 = 6;
var $kindUint = 7;
var $kindUint8 = 8;
var $kindUint16 = 9;
var $kindUint32 = 10;
var $kindUint64 = 11;
var $kindUintptr = 12;
var $kindFloat32 = 13;
var $kindFloat64 = 14;
var $kindComplex64 = 15;
var $kindComplex128 = 16;
var $kindArray = 17;
var $kindChan = 18;
var $kindFunc = 19;
var $kindInterface = 20;
var $kindMap = 21;
var $kindPtr = 22;
var $kindSlice = 23;
var $kindString = 24;
var $kindStruct = 25;
var $kindUnsafePointer = 26;

var $newType = function(size, kind, string, name, pkg, constructor) {
  var typ;
  switch(kind) {
  case $kindBool:
  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8:
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindString:
  case $kindUnsafePointer:
    typ = function(v) { this.$val = v; };
    typ.prototype.$key = function() { return string + "$" + this.$val; };
    break;

  case $kindFloat32:
  case $kindFloat64:
    typ = function(v) { this.$val = v; };
    typ.prototype.$key = function() { return string + "$" + $floatKey(this.$val); };
    break;

  case $kindInt64:
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.prototype.$key = function() { return string + "$" + this.$high + "$" + this.$low; };
    break;

  case $kindUint64:
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >>> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.prototype.$key = function() { return string + "$" + this.$high + "$" + this.$low; };
    break;

  case $kindComplex64:
  case $kindComplex128:
    typ = function(real, imag) {
      this.$real = real;
      this.$imag = imag;
      this.$val = this;
    };
    typ.prototype.$key = function() { return string + "$" + this.$real + "$" + this.$imag; };
    break;

  case $kindArray:
    typ = function(v) { this.$val = v; };
    typ.ptr = $newType(4, $kindPtr, "*" + string, "", "", function(array) {
      this.$get = function() { return array; };
      this.$set = function(v) { $copy(this, v, typ); };
      this.$val = array;
    });
    typ.init = function(elem, len) {
      typ.elem = elem;
      typ.len = len;
      typ.comparable = elem.comparable;
      typ.prototype.$key = function() {
        return string + "$" + Array.prototype.join.call($mapArray(this.$val, function(e) {
          var key = e.$key ? e.$key() : String(e);
          return key.replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
        }), "$");
      };
      typ.ptr.init(typ);
      Object.defineProperty(typ.ptr.nil, "nilCheck", { get: $throwNilPointerError });
    };
    break;

  case $kindChan:
    typ = function(capacity) {
      this.$val = this;
      this.$capacity = capacity;
      this.$buffer = [];
      this.$sendQueue = [];
      this.$recvQueue = [];
      this.$closed = false;
    };
    typ.prototype.$key = function() {
      if (this.$id === undefined) {
        $idCounter++;
        this.$id = $idCounter;
      }
      return String(this.$id);
    };
    typ.init = function(elem, sendOnly, recvOnly) {
      typ.elem = elem;
      typ.sendOnly = sendOnly;
      typ.recvOnly = recvOnly;
      typ.nil = new typ(0);
      typ.nil.$sendQueue = typ.nil.$recvQueue = { length: 0, push: function() {}, shift: function() { return undefined; }, indexOf: function() { return -1; } };
    };
    break;

  case $kindFunc:
    typ = function(v) { this.$val = v; };
    typ.init = function(params, results, variadic) {
      typ.params = params;
      typ.results = results;
      typ.variadic = variadic;
      typ.comparable = false;
    };
    break;

  case $kindInterface:
    typ = { implementedBy: {}, missingMethodFor: {} };
    typ.init = function(methods) {
      typ.methods = methods;
    };
    break;

  case $kindMap:
    typ = function(v) { this.$val = v; };
    typ.init = function(key, elem) {
      typ.key = key;
      typ.elem = elem;
      typ.comparable = false;
    };
    break;

  case $kindPtr:
    typ = constructor || function(getter, setter, target) {
      this.$get = getter;
      this.$set = setter;
      this.$target = target;
      this.$val = this;
    };
    typ.prototype.$key = function() {
      if (this.$id === undefined) {
        $idCounter++;
        this.$id = $idCounter;
      }
      return String(this.$id);
    };
    typ.init = function(elem) {
      typ.elem = elem;
      typ.nil = new typ($throwNilPointerError, $throwNilPointerError);
    };
    break;

  case $kindSlice:
    typ = function(array) {
      if (array.constructor !== typ.nativeArray) {
        array = new typ.nativeArray(array);
      }
      this.$array = array;
      this.$offset = 0;
      this.$length = array.length;
      this.$capacity = array.length;
      this.$val = this;
    };
    typ.init = function(elem) {
      typ.elem = elem;
      typ.comparable = false;
      typ.nativeArray = $nativeArray(elem.kind);
      typ.nil = new typ([]);
    };
    break;

  case $kindStruct:
    typ = function(v) { this.$val = v; };
    typ.ptr = $newType(4, $kindPtr, "*" + string, "", "", constructor);
    typ.ptr.elem = typ;
    typ.ptr.prototype.$get = function() { return this; };
    typ.ptr.prototype.$set = function(v) { $copy(this, v, typ); };
    typ.init = function(fields) {
      typ.fields = fields;
      fields.forEach(function(f) {
        if (!f.type.comparable) {
          typ.comparable = false;
        }
      });
      typ.prototype.$key = function() {
        var val = this.$val;
        return string + "$" + $mapArray(fields, function(f) {
          var e = val[f.prop];
          var key = e.$key ? e.$key() : String(e);
          return key.replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
        }).join("$");
      };
      /* nil value */
      var properties = {};
      fields.forEach(function(f) {
        properties[f.prop] = { get: $throwNilPointerError, set: $throwNilPointerError };
      });
      typ.ptr.nil = Object.create(constructor.prototype, properties);
      typ.ptr.nil.$val = typ.ptr.nil;
      /* methods for embedded fields */
      var forwardMethod = function(target, m, f) {
        if (target.prototype[m.prop] !== undefined) { return; }
        target.prototype[m.prop] = function() {
          var v = this.$val[f.prop];
          if (f.type === $js.Object) {
            v = new $js.container.ptr(v);
          }
          if (v.$val === undefined) {
            v = new f.type(v);
          }
          return v[m.prop].apply(v, arguments);
        };
      };
      fields.forEach(function(f) {
        if (f.name === "") {
          f.type.methods.forEach(function(m) {
            forwardMethod(typ, m, f);
            forwardMethod(typ.ptr, m, f);
          });
          $ptrType(f.type).methods.forEach(function(m) {
            forwardMethod(typ.ptr, m, f);
          });
        }
      });
    };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  switch (kind) {
  case $kindBool:
  case $kindMap:
    typ.zero = function() { return false; };
    break;

  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8 :
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindUnsafePointer:
  case $kindFloat32:
  case $kindFloat64:
    typ.zero = function() { return 0; };
    break;

  case $kindString:
    typ.zero = function() { return ""; };
    break;

  case $kindInt64:
  case $kindUint64:
  case $kindComplex64:
  case $kindComplex128:
    var zero = new typ(0, 0);
    typ.zero = function() { return zero; };
    break;

  case $kindChan:
  case $kindPtr:
  case $kindSlice:
    typ.zero = function() { return typ.nil; };
    break;

  case $kindFunc:
    typ.zero = function() { return $throwNilPointerError; };
    break;

  case $kindInterface:
    typ.zero = function() { return $ifaceNil; };
    break;

  case $kindArray:
    typ.zero = function() {
      var arrayClass = $nativeArray(typ.elem.kind);
      if (arrayClass !== Array) {
        return new arrayClass(typ.len);
      }
      var array = new Array(typ.len);
      for (var i = 0; i < typ.len; i++) {
        array[i] = typ.elem.zero();
      }
      return array;
    };
    break;

  case $kindStruct:
    typ.zero = function() { return new typ.ptr(); };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  typ.size = size;
  typ.kind = kind;
  typ.string = string;
  typ.typeName = name;
  typ.pkg = pkg;
  typ.methods = [];
  typ.comparable = true;
  var rt = null;
  return typ;
};

var $Bool          = $newType( 1, $kindBool,          "bool",           "bool",       "", null);
var $Int           = $newType( 4, $kindInt,           "int",            "int",        "", null);
var $Int8          = $newType( 1, $kindInt8,          "int8",           "int8",       "", null);
var $Int16         = $newType( 2, $kindInt16,         "int16",          "int16",      "", null);
var $Int32         = $newType( 4, $kindInt32,         "int32",          "int32",      "", null);
var $Int64         = $newType( 8, $kindInt64,         "int64",          "int64",      "", null);
var $Uint          = $newType( 4, $kindUint,          "uint",           "uint",       "", null);
var $Uint8         = $newType( 1, $kindUint8,         "uint8",          "uint8",      "", null);
var $Uint16        = $newType( 2, $kindUint16,        "uint16",         "uint16",     "", null);
var $Uint32        = $newType( 4, $kindUint32,        "uint32",         "uint32",     "", null);
var $Uint64        = $newType( 8, $kindUint64,        "uint64",         "uint64",     "", null);
var $Uintptr       = $newType( 4, $kindUintptr,       "uintptr",        "uintptr",    "", null);
var $Float32       = $newType( 4, $kindFloat32,       "float32",        "float32",    "", null);
var $Float64       = $newType( 8, $kindFloat64,       "float64",        "float64",    "", null);
var $Complex64     = $newType( 8, $kindComplex64,     "complex64",      "complex64",  "", null);
var $Complex128    = $newType(16, $kindComplex128,    "complex128",     "complex128", "", null);
var $String        = $newType( 8, $kindString,        "string",         "string",     "", null);
var $UnsafePointer = $newType( 4, $kindUnsafePointer, "unsafe.Pointer", "Pointer",    "", null);

var $anonTypeInits = [];
var $addAnonTypeInit = function(f) {
  if ($anonTypeInits === null) {
    f();
    return;
  }
  $anonTypeInits.push(f);
};
var $initAnonTypes = function() {
  $anonTypeInits.forEach(function(f) { f(); });
  $anonTypeInits = null;
};

var $nativeArray = function(elemKind) {
  switch (elemKind) {
  case $kindInt:
    return Int32Array;
  case $kindInt8:
    return Int8Array;
  case $kindInt16:
    return Int16Array;
  case $kindInt32:
    return Int32Array;
  case $kindUint:
    return Uint32Array;
  case $kindUint8:
    return Uint8Array;
  case $kindUint16:
    return Uint16Array;
  case $kindUint32:
    return Uint32Array;
  case $kindUintptr:
    return Uint32Array;
  case $kindFloat32:
    return Float32Array;
  case $kindFloat64:
    return Float64Array;
  default:
    return Array;
  }
};
var $toNativeArray = function(elemKind, array) {
  var nativeArray = $nativeArray(elemKind);
  if (nativeArray === Array) {
    return array;
  }
  return new nativeArray(array);
};
var $arrayTypes = {};
var $arrayType = function(elem, len) {
  var string = "[" + len + "]" + elem.string;
  var typ = $arrayTypes[string];
  if (typ === undefined) {
    typ = $newType(12, $kindArray, string, "", "", null);
    $arrayTypes[string] = typ;
    $addAnonTypeInit(function() { typ.init(elem, len); });
  }
  return typ;
};

var $chanType = function(elem, sendOnly, recvOnly) {
  var string = (recvOnly ? "<-" : "") + "chan" + (sendOnly ? "<- " : " ") + elem.string;
  var field = sendOnly ? "SendChan" : (recvOnly ? "RecvChan" : "Chan");
  var typ = elem[field];
  if (typ === undefined) {
    typ = $newType(4, $kindChan, string, "", "", null);
    elem[field] = typ;
    $addAnonTypeInit(function() { typ.init(elem, sendOnly, recvOnly); });
  }
  return typ;
};

var $funcTypes = {};
var $funcType = function(params, results, variadic) {
  var paramTypes = $mapArray(params, function(p) { return p.string; });
  if (variadic) {
    paramTypes[paramTypes.length - 1] = "..." + paramTypes[paramTypes.length - 1].substr(2);
  }
  var string = "func(" + paramTypes.join(", ") + ")";
  if (results.length === 1) {
    string += " " + results[0].string;
  } else if (results.length > 1) {
    string += " (" + $mapArray(results, function(r) { return r.string; }).join(", ") + ")";
  }
  var typ = $funcTypes[string];
  if (typ === undefined) {
    typ = $newType(4, $kindFunc, string, "", "", null);
    $funcTypes[string] = typ;
    $addAnonTypeInit(function() { typ.init(params, results, variadic); });
  }
  return typ;
};

var $interfaceTypes = {};
var $interfaceType = function(methods) {
  var string = "interface {}";
  if (methods.length !== 0) {
    string = "interface { " + $mapArray(methods, function(m) {
      return (m.pkg !== "" ? m.pkg + "." : "") + m.name + m.type.string.substr(4);
    }).join("; ") + " }";
  }
  var typ = $interfaceTypes[string];
  if (typ === undefined) {
    typ = $newType(8, $kindInterface, string, "", "", null);
    $interfaceTypes[string] = typ;
    $addAnonTypeInit(function() { typ.init(methods); });
  }
  return typ;
};
var $emptyInterface = $interfaceType([]);
var $ifaceNil = { $key: function() { return "nil"; } };
var $error = $newType(8, $kindInterface, "error", "error", "", null);
$error.init([{prop: "Error", name: "Error", pkg: "", type: $funcType([], [$String], false)}]);

var $Map = function() {};
(function() {
  var names = Object.getOwnPropertyNames(Object.prototype);
  for (var i = 0; i < names.length; i++) {
    $Map.prototype[names[i]] = undefined;
  }
})();
var $mapTypes = {};
var $mapType = function(key, elem) {
  var string = "map[" + key.string + "]" + elem.string;
  var typ = $mapTypes[string];
  if (typ === undefined) {
    typ = $newType(4, $kindMap, string, "", "", null);
    $mapTypes[string] = typ;
    $addAnonTypeInit(function() { typ.init(key, elem); });
  }
  return typ;
};


var $throwNilPointerError = function() { $throwRuntimeError("invalid memory address or nil pointer dereference"); };
var $ptrType = function(elem) {
  var typ = elem.ptr;
  if (typ === undefined) {
    typ = $newType(4, $kindPtr, "*" + elem.string, "", "", null);
    elem.ptr = typ;
    $addAnonTypeInit(function() { typ.init(elem); });
  }
  return typ;
};

var $newDataPointer = function(data, constructor) {
  if (constructor.elem.kind === $kindStruct) {
    return data;
  }
  return new constructor(function() { return data; }, function(v) { data = v; });
};

var $sliceType = function(elem) {
  var typ = elem.Slice;
  if (typ === undefined) {
    typ = $newType(12, $kindSlice, "[]" + elem.string, "", "", null);
    elem.Slice = typ;
    $addAnonTypeInit(function() { typ.init(elem); });
  }
  return typ;
};
var $makeSlice = function(typ, length, capacity) {
  capacity = capacity || length;
  var array = new typ.nativeArray(capacity);
  if (typ.nativeArray === Array) {
    for (var i = 0; i < capacity; i++) {
      array[i] = typ.elem.zero();
    }
  }
  var slice = new typ(array);
  slice.$length = length;
  return slice;
};

var $structTypes = {};
var $structType = function(fields) {
  var string = "struct { " + $mapArray(fields, function(f) {
    return f.name + " " + f.type.string + (f.tag !== "" ? (" \"" + f.tag.replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"") : "");
  }).join("; ") + " }";
  if (fields.length === 0) {
    string = "struct {}";
  }
  var typ = $structTypes[string];
  if (typ === undefined) {
    typ = $newType(0, $kindStruct, string, "", "", function() {
      this.$val = this;
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        var arg = arguments[i];
        this[f.prop] = arg !== undefined ? arg : f.type.zero();
      }
    });
    $structTypes[string] = typ;
    $anonTypeInits.push(function() {
      /* collect methods for anonymous fields */
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (f.name === "") {
          f.type.methods.forEach(function(m) {
            typ.methods.push(m);
            typ.ptr.methods.push(m);
          });
          $ptrType(f.type).methods.forEach(function(m) {
            typ.ptr.methods.push(m);
          });
        }
      };
      typ.init(fields);
    });
  }
  return typ;
};

var $assertType = function(value, type, returnTuple) {
  var isInterface = (type.kind === $kindInterface), ok, missingMethod = "";
  if (value === $ifaceNil) {
    ok = false;
  } else if (!isInterface) {
    ok = value.constructor === type;
  } else {
    var valueTypeString = value.constructor.string;
    ok = type.implementedBy[valueTypeString];
    if (ok === undefined) {
      ok = true;
      var valueMethods = value.constructor.methods;
      var typeMethods = type.methods;
      for (var i = 0; i < typeMethods.length; i++) {
        var tm = typeMethods[i];
        var found = false;
        for (var j = 0; j < valueMethods.length; j++) {
          var vm = valueMethods[j];
          if (vm.name === tm.name && vm.pkg === tm.pkg && vm.type === tm.type) {
            found = true;
            break;
          }
        }
        if (!found) {
          ok = false;
          type.missingMethodFor[valueTypeString] = tm.name;
          break;
        }
      }
      type.implementedBy[valueTypeString] = ok;
    }
    if (!ok) {
      missingMethod = type.missingMethodFor[valueTypeString];
    }
  }

  if (!ok) {
    if (returnTuple) {
      return [type.zero(), false];
    }
    $panic(new $packages["runtime"].TypeAssertionError.ptr("", (value === $ifaceNil ? "" : value.constructor.string), type.string, missingMethod));
  }

  if (!isInterface) {
    value = value.$val;
  }
  if (type === $js.Object) {
    value = value.Object;
  }
  return returnTuple ? [value, true] : value;
};

var $coerceFloat32 = function(f) {
  var math = $packages["math"];
  if (math === undefined) {
    return f;
  }
  return math.Float32frombits(math.Float32bits(f));
};

var $floatKey = function(f) {
  if (f !== f) {
    $idCounter++;
    return "NaN$" + $idCounter;
  }
  return String(f);
};

var $flatten64 = function(x) {
  return x.$high * 4294967296 + x.$low;
};

var $shiftLeft64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high << y | x.$low >>> (32 - y), (x.$low << y) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(x.$low << (y - 32), 0);
  }
  return new x.constructor(0, 0);
};

var $shiftRightInt64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high >> y, (x.$low >>> y | x.$high << (32 - y)) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(x.$high >> 31, (x.$high >> (y - 32)) >>> 0);
  }
  if (x.$high < 0) {
    return new x.constructor(-1, 4294967295);
  }
  return new x.constructor(0, 0);
};

var $shiftRightUint64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high >>> y, (x.$low >>> y | x.$high << (32 - y)) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(0, x.$high >>> (y - 32));
  }
  return new x.constructor(0, 0);
};

var $mul64 = function(x, y) {
  var high = 0, low = 0;
  if ((y.$low & 1) !== 0) {
    high = x.$high;
    low = x.$low;
  }
  for (var i = 1; i < 32; i++) {
    if ((y.$low & 1<<i) !== 0) {
      high += x.$high << i | x.$low >>> (32 - i);
      low += (x.$low << i) >>> 0;
    }
  }
  for (var i = 0; i < 32; i++) {
    if ((y.$high & 1<<i) !== 0) {
      high += x.$low << i;
    }
  }
  return new x.constructor(high, low);
};

var $div64 = function(x, y, returnRemainder) {
  if (y.$high === 0 && y.$low === 0) {
    $throwRuntimeError("integer divide by zero");
  }

  var s = 1;
  var rs = 1;

  var xHigh = x.$high;
  var xLow = x.$low;
  if (xHigh < 0) {
    s = -1;
    rs = -1;
    xHigh = -xHigh;
    if (xLow !== 0) {
      xHigh--;
      xLow = 4294967296 - xLow;
    }
  }

  var yHigh = y.$high;
  var yLow = y.$low;
  if (y.$high < 0) {
    s *= -1;
    yHigh = -yHigh;
    if (yLow !== 0) {
      yHigh--;
      yLow = 4294967296 - yLow;
    }
  }

  var high = 0, low = 0, n = 0;
  while (yHigh < 2147483648 && ((xHigh > yHigh) || (xHigh === yHigh && xLow > yLow))) {
    yHigh = (yHigh << 1 | yLow >>> 31) >>> 0;
    yLow = (yLow << 1) >>> 0;
    n++;
  }
  for (var i = 0; i <= n; i++) {
    high = high << 1 | low >>> 31;
    low = (low << 1) >>> 0;
    if ((xHigh > yHigh) || (xHigh === yHigh && xLow >= yLow)) {
      xHigh = xHigh - yHigh;
      xLow = xLow - yLow;
      if (xLow < 0) {
        xHigh--;
        xLow += 4294967296;
      }
      low++;
      if (low === 4294967296) {
        high++;
        low = 0;
      }
    }
    yLow = (yLow >>> 1 | yHigh << (32 - 1)) >>> 0;
    yHigh = yHigh >>> 1;
  }

  if (returnRemainder) {
    return new x.constructor(xHigh * rs, xLow * rs);
  }
  return new x.constructor(high * s, low * s);
};

var $divComplex = function(n, d) {
  var ninf = n.$real === 1/0 || n.$real === -1/0 || n.$imag === 1/0 || n.$imag === -1/0;
  var dinf = d.$real === 1/0 || d.$real === -1/0 || d.$imag === 1/0 || d.$imag === -1/0;
  var nnan = !ninf && (n.$real !== n.$real || n.$imag !== n.$imag);
  var dnan = !dinf && (d.$real !== d.$real || d.$imag !== d.$imag);
  if(nnan || dnan) {
    return new n.constructor(0/0, 0/0);
  }
  if (ninf && !dinf) {
    return new n.constructor(1/0, 1/0);
  }
  if (!ninf && dinf) {
    return new n.constructor(0, 0);
  }
  if (d.$real === 0 && d.$imag === 0) {
    if (n.$real === 0 && n.$imag === 0) {
      return new n.constructor(0/0, 0/0);
    }
    return new n.constructor(1/0, 1/0);
  }
  var a = Math.abs(d.$real);
  var b = Math.abs(d.$imag);
  if (a <= b) {
    var ratio = d.$real / d.$imag;
    var denom = d.$real * ratio + d.$imag;
    return new n.constructor((n.$real * ratio + n.$imag) / denom, (n.$imag * ratio - n.$real) / denom);
  }
  var ratio = d.$imag / d.$real;
  var denom = d.$imag * ratio + d.$real;
  return new n.constructor((n.$imag * ratio + n.$real) / denom, (n.$imag - n.$real * ratio) / denom);
};

var $stackDepthOffset = 0;
var $getStackDepth = function() {
  var err = new Error();
  if (err.stack === undefined) {
    return undefined;
  }
  return $stackDepthOffset + err.stack.split("\n").length;
};

var $deferFrames = [], $skippedDeferFrames = 0, $jumpToDefer = false, $panicStackDepth = null, $panicValue;
var $callDeferred = function(deferred, jsErr) {
  if ($skippedDeferFrames !== 0) {
    $skippedDeferFrames--;
    throw jsErr;
  }
  if ($jumpToDefer) {
    $jumpToDefer = false;
    throw jsErr;
  }
  if (jsErr) {
    var newErr = null;
    try {
      $deferFrames.push(deferred);
      $panic(new $js.Error.ptr(jsErr));
    } catch (err) {
      newErr = err;
    }
    $deferFrames.pop();
    $callDeferred(deferred, newErr);
    return;
  }

  $stackDepthOffset--;
  var outerPanicStackDepth = $panicStackDepth;
  var outerPanicValue = $panicValue;

  var localPanicValue = $curGoroutine.panicStack.pop();
  if (localPanicValue !== undefined) {
    $panicStackDepth = $getStackDepth();
    $panicValue = localPanicValue;
  }

  var call, localSkippedDeferFrames = 0;
  try {
    while (true) {
      if (deferred === null) {
        deferred = $deferFrames[$deferFrames.length - 1 - localSkippedDeferFrames];
        if (deferred === undefined) {
          var msg;
          if (localPanicValue.constructor === $String) {
            msg = localPanicValue.$val;
          } else if (localPanicValue.Error !== undefined) {
            msg = localPanicValue.Error();
          } else if (localPanicValue.String !== undefined) {
            msg = localPanicValue.String();
          } else {
            msg = localPanicValue;
          }
          var e = new Error(msg);
          if (localPanicValue.Stack !== undefined) {
            e.stack = localPanicValue.Stack();
            e.stack = msg + e.stack.substr(e.stack.indexOf("\n"));
          }
          throw e;
        }
      }
      var call = deferred.pop();
      if (call === undefined) {
        if (localPanicValue !== undefined) {
          localSkippedDeferFrames++;
          deferred = null;
          continue;
        }
        return;
      }
      var r = call[0].apply(undefined, call[1]);
      if (r && r.$blocking) {
        deferred.push([r, []]);
      }

      if (localPanicValue !== undefined && $panicStackDepth === null) {
        throw null; /* error was recovered */
      }
    }
  } finally {
    $skippedDeferFrames += localSkippedDeferFrames;
    if ($curGoroutine.asleep) {
      deferred.push(call);
      $jumpToDefer = true;
    }
    if (localPanicValue !== undefined) {
      if ($panicStackDepth !== null) {
        $curGoroutine.panicStack.push(localPanicValue);
      }
      $panicStackDepth = outerPanicStackDepth;
      $panicValue = outerPanicValue;
    }
    $stackDepthOffset++;
  }
};

var $panic = function(value) {
  $curGoroutine.panicStack.push(value);
  $callDeferred(null, null);
};
var $recover = function() {
  if ($panicStackDepth === null || ($panicStackDepth !== undefined && $panicStackDepth !== $getStackDepth() - 2)) {
    return $ifaceNil;
  }
  $panicStackDepth = null;
  return $panicValue;
};
var $throw = function(err) { throw err; };
var $throwRuntimeError; /* set by package "runtime" */

var $BLOCKING = new Object();
var $nonblockingCall = function() {
  $panic(new $packages["runtime"].NotSupportedError.ptr("non-blocking call to blocking function, see https://github.com/gopherjs/gopherjs#goroutines"));
};

var $dummyGoroutine = { asleep: false, exit: false, panicStack: [] };
var $curGoroutine = $dummyGoroutine, $totalGoroutines = 0, $awakeGoroutines = 0, $checkForDeadlock = true;
var $go = function(fun, args, direct) {
  $totalGoroutines++;
  $awakeGoroutines++;
  args.push($BLOCKING);
  var goroutine = function() {
    var rescheduled = false;
    try {
      $curGoroutine = goroutine;
      $skippedDeferFrames = 0;
      $jumpToDefer = false;
      var r = fun.apply(undefined, args);
      if (r && r.$blocking) {
        fun = r;
        args = [];
        $schedule(goroutine, direct);
        rescheduled = true;
        return;
      }
      goroutine.exit = true;
    } catch (err) {
      if (!$curGoroutine.asleep) {
        goroutine.exit = true;
        throw err;
      }
    } finally {
      $curGoroutine = $dummyGoroutine;
      if (goroutine.exit && !rescheduled) { /* also set by runtime.Goexit() */
        $totalGoroutines--;
        goroutine.asleep = true;
      }
      if (goroutine.asleep && !rescheduled) {
        $awakeGoroutines--;
        if ($awakeGoroutines === 0 && $totalGoroutines !== 0 && $checkForDeadlock) {
          console.error("fatal error: all goroutines are asleep - deadlock!");
        }
      }
    }
  };
  goroutine.asleep = false;
  goroutine.exit = false;
  goroutine.panicStack = [];
  $schedule(goroutine, direct);
};

var $scheduled = [], $schedulerLoopActive = false;
var $schedule = function(goroutine, direct) {
  if (goroutine.asleep) {
    goroutine.asleep = false;
    $awakeGoroutines++;
  }

  if (direct) {
    goroutine();
    return;
  }

  $scheduled.push(goroutine);
  if (!$schedulerLoopActive) {
    $schedulerLoopActive = true;
    setTimeout(function() {
      while (true) {
        var r = $scheduled.shift();
        if (r === undefined) {
          $schedulerLoopActive = false;
          break;
        }
        r();
      };
    }, 0);
  }
};

var $send = function(chan, value) {
  if (chan.$closed) {
    $throwRuntimeError("send on closed channel");
  }
  var queuedRecv = chan.$recvQueue.shift();
  if (queuedRecv !== undefined) {
    queuedRecv([value, true]);
    return;
  }
  if (chan.$buffer.length < chan.$capacity) {
    chan.$buffer.push(value);
    return;
  }

  var thisGoroutine = $curGoroutine;
  chan.$sendQueue.push(function() {
    $schedule(thisGoroutine);
    return value;
  });
  var blocked = false;
  var f = function() {
    if (blocked) {
      if (chan.$closed) {
        $throwRuntimeError("send on closed channel");
      }
      return;
    };
    blocked = true;
    $curGoroutine.asleep = true;
    throw null;
  };
  f.$blocking = true;
  return f;
};
var $recv = function(chan) {
  var queuedSend = chan.$sendQueue.shift();
  if (queuedSend !== undefined) {
    chan.$buffer.push(queuedSend());
  }
  var bufferedValue = chan.$buffer.shift();
  if (bufferedValue !== undefined) {
    return [bufferedValue, true];
  }
  if (chan.$closed) {
    return [chan.constructor.elem.zero(), false];
  }

  var thisGoroutine = $curGoroutine, value;
  var queueEntry = function(v) {
    value = v;
    $schedule(thisGoroutine);
  };
  chan.$recvQueue.push(queueEntry);
  var blocked = false;
  var f = function() {
    if (blocked) {
      return value;
    };
    blocked = true;
    $curGoroutine.asleep = true;
    throw null;
  };
  f.$blocking = true;
  return f;
};
var $close = function(chan) {
  if (chan.$closed) {
    $throwRuntimeError("close of closed channel");
  }
  chan.$closed = true;
  while (true) {
    var queuedSend = chan.$sendQueue.shift();
    if (queuedSend === undefined) {
      break;
    }
    queuedSend(); /* will panic because of closed channel */
  }
  while (true) {
    var queuedRecv = chan.$recvQueue.shift();
    if (queuedRecv === undefined) {
      break;
    }
    queuedRecv([chan.constructor.elem.zero(), false]);
  }
};
var $select = function(comms) {
  var ready = [];
  var selection = -1;
  for (var i = 0; i < comms.length; i++) {
    var comm = comms[i];
    var chan = comm[0];
    switch (comm.length) {
    case 0: /* default */
      selection = i;
      break;
    case 1: /* recv */
      if (chan.$sendQueue.length !== 0 || chan.$buffer.length !== 0 || chan.$closed) {
        ready.push(i);
      }
      break;
    case 2: /* send */
      if (chan.$closed) {
        $throwRuntimeError("send on closed channel");
      }
      if (chan.$recvQueue.length !== 0 || chan.$buffer.length < chan.$capacity) {
        ready.push(i);
      }
      break;
    }
  }

  if (ready.length !== 0) {
    selection = ready[Math.floor(Math.random() * ready.length)];
  }
  if (selection !== -1) {
    var comm = comms[selection];
    switch (comm.length) {
    case 0: /* default */
      return [selection];
    case 1: /* recv */
      return [selection, $recv(comm[0])];
    case 2: /* send */
      $send(comm[0], comm[1]);
      return [selection];
    }
  }

  var entries = [];
  var thisGoroutine = $curGoroutine;
  var removeFromQueues = function() {
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var queue = entry[0];
      var index = queue.indexOf(entry[1]);
      if (index !== -1) {
        queue.splice(index, 1);
      }
    }
  };
  for (var i = 0; i < comms.length; i++) {
    (function(i) {
      var comm = comms[i];
      switch (comm.length) {
      case 1: /* recv */
        var queueEntry = function(value) {
          selection = [i, value];
          removeFromQueues();
          $schedule(thisGoroutine);
        };
        entries.push([comm[0].$recvQueue, queueEntry]);
        comm[0].$recvQueue.push(queueEntry);
        break;
      case 2: /* send */
        var queueEntry = function() {
          if (comm[0].$closed) {
            $throwRuntimeError("send on closed channel");
          }
          selection = [i];
          removeFromQueues();
          $schedule(thisGoroutine);
          return comm[1];
        };
        entries.push([comm[0].$sendQueue, queueEntry]);
        comm[0].$sendQueue.push(queueEntry);
        break;
      }
    })(i);
  }
  var blocked = false;
  var f = function() {
    if (blocked) {
      return selection;
    };
    blocked = true;
    $curGoroutine.asleep = true;
    throw null;
  };
  f.$blocking = true;
  return f;
};

var $js;

var $needsExternalization = function(t) {
  switch (t.kind) {
    case $kindBool:
    case $kindInt:
    case $kindInt8:
    case $kindInt16:
    case $kindInt32:
    case $kindUint:
    case $kindUint8:
    case $kindUint16:
    case $kindUint32:
    case $kindUintptr:
    case $kindFloat32:
    case $kindFloat64:
      return false;
    case $kindInterface:
      return t !== $js.Object;
    default:
      return true;
  }
};

var $externalize = function(v, t) {
  switch (t.kind) {
  case $kindBool:
  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8:
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindFloat32:
  case $kindFloat64:
    return v;
  case $kindInt64:
  case $kindUint64:
    return $flatten64(v);
  case $kindArray:
    if ($needsExternalization(t.elem)) {
      return $mapArray(v, function(e) { return $externalize(e, t.elem); });
    }
    return v;
  case $kindFunc:
    if (v === $throwNilPointerError) {
      return null;
    }
    if (v.$externalizeWrapper === undefined) {
      $checkForDeadlock = false;
      var convert = false;
      for (var i = 0; i < t.params.length; i++) {
        convert = convert || (t.params[i] !== $js.Object);
      }
      for (var i = 0; i < t.results.length; i++) {
        convert = convert || $needsExternalization(t.results[i]);
      }
      v.$externalizeWrapper = v;
      if (convert) {
        v.$externalizeWrapper = function() {
          var args = [];
          for (var i = 0; i < t.params.length; i++) {
            if (t.variadic && i === t.params.length - 1) {
              var vt = t.params[i].elem, varargs = [];
              for (var j = i; j < arguments.length; j++) {
                varargs.push($internalize(arguments[j], vt));
              }
              args.push(new (t.params[i])(varargs));
              break;
            }
            args.push($internalize(arguments[i], t.params[i]));
          }
          var result = v.apply(this, args);
          switch (t.results.length) {
          case 0:
            return;
          case 1:
            return $externalize(result, t.results[0]);
          default:
            for (var i = 0; i < t.results.length; i++) {
              result[i] = $externalize(result[i], t.results[i]);
            }
            return result;
          }
        };
      }
    }
    return v.$externalizeWrapper;
  case $kindInterface:
    if (t === $js.Object) {
      return v;
    }
    if (v === $ifaceNil) {
      return null;
    }
    return $externalize(v.$val, v.constructor);
  case $kindMap:
    var m = {};
    var keys = $keys(v);
    for (var i = 0; i < keys.length; i++) {
      var entry = v[keys[i]];
      m[$externalize(entry.k, t.key)] = $externalize(entry.v, t.elem);
    }
    return m;
  case $kindPtr:
    return $externalize(v.$get(), t.elem);
  case $kindSlice:
    if ($needsExternalization(t.elem)) {
      return $mapArray($sliceToArray(v), function(e) { return $externalize(e, t.elem); });
    }
    return $sliceToArray(v);
  case $kindString:
    if (v.search(/^[\x00-\x7F]*$/) !== -1) {
      return v;
    }
    var s = "", r;
    for (var i = 0; i < v.length; i += r[1]) {
      r = $decodeRune(v, i);
      s += String.fromCharCode(r[0]);
    }
    return s;
  case $kindStruct:
    var timePkg = $packages["time"];
    if (timePkg && v.constructor === timePkg.Time.ptr) {
      var milli = $div64(v.UnixNano(), new $Int64(0, 1000000));
      return new Date($flatten64(milli));
    }

    var searchJsObject = function(v, t) {
      if (t === $js.Object) {
        return v;
      }
      if (t.kind === $kindPtr) {
        var o = searchJsObject(v.$get(), t.elem);
        if (o !== undefined) {
          return o;
        }
      }
      if (t.kind === $kindStruct) {
        for (var i = 0; i < t.fields.length; i++) {
          var f = t.fields[i];
          var o = searchJsObject(v[f.prop], f.type);
          if (o !== undefined) {
            return o;
          }
        }
      }
      return undefined;
    };
    var o = searchJsObject(v, t);
    if (o !== undefined) {
      return o;
    }

    o = {};
    for (var i = 0; i < t.fields.length; i++) {
      var f = t.fields[i];
      if (f.pkg !== "") { /* not exported */
        continue;
      }
      o[f.name] = $externalize(v[f.prop], f.type);
    }
    return o;
  }
  $panic(new $String("cannot externalize " + t.string));
};

var $internalize = function(v, t, recv) {
  switch (t.kind) {
  case $kindBool:
    return !!v;
  case $kindInt:
    return parseInt(v);
  case $kindInt8:
    return parseInt(v) << 24 >> 24;
  case $kindInt16:
    return parseInt(v) << 16 >> 16;
  case $kindInt32:
    return parseInt(v) >> 0;
  case $kindUint:
    return parseInt(v);
  case $kindUint8:
    return parseInt(v) << 24 >>> 24;
  case $kindUint16:
    return parseInt(v) << 16 >>> 16;
  case $kindUint32:
  case $kindUintptr:
    return parseInt(v) >>> 0;
  case $kindInt64:
  case $kindUint64:
    return new t(0, v);
  case $kindFloat32:
  case $kindFloat64:
    return parseFloat(v);
  case $kindArray:
    if (v.length !== t.len) {
      $throwRuntimeError("got array with wrong size from JavaScript native");
    }
    return $mapArray(v, function(e) { return $internalize(e, t.elem); });
  case $kindFunc:
    return function() {
      var args = [];
      for (var i = 0; i < t.params.length; i++) {
        if (t.variadic && i === t.params.length - 1) {
          var vt = t.params[i].elem, varargs = arguments[i];
          for (var j = 0; j < varargs.$length; j++) {
            args.push($externalize(varargs.$array[varargs.$offset + j], vt));
          }
          break;
        }
        args.push($externalize(arguments[i], t.params[i]));
      }
      var result = v.apply(recv, args);
      switch (t.results.length) {
      case 0:
        return;
      case 1:
        return $internalize(result, t.results[0]);
      default:
        for (var i = 0; i < t.results.length; i++) {
          result[i] = $internalize(result[i], t.results[i]);
        }
        return result;
      }
    };
  case $kindInterface:
    if (t === $js.Object) {
      return v;
    }
    if (t.methods.length !== 0) {
      $panic(new $String("cannot internalize " + t.string));
    }
    if (v === null) {
      return $ifaceNil;
    }
    switch (v.constructor) {
    case Int8Array:
      return new ($sliceType($Int8))(v);
    case Int16Array:
      return new ($sliceType($Int16))(v);
    case Int32Array:
      return new ($sliceType($Int))(v);
    case Uint8Array:
      return new ($sliceType($Uint8))(v);
    case Uint16Array:
      return new ($sliceType($Uint16))(v);
    case Uint32Array:
      return new ($sliceType($Uint))(v);
    case Float32Array:
      return new ($sliceType($Float32))(v);
    case Float64Array:
      return new ($sliceType($Float64))(v);
    case Array:
      return $internalize(v, $sliceType($emptyInterface));
    case Boolean:
      return new $Bool(!!v);
    case Date:
      var timePkg = $packages["time"];
      if (timePkg) {
        return new timePkg.Time(timePkg.Unix(new $Int64(0, 0), new $Int64(0, v.getTime() * 1000000)));
      }
    case Function:
      var funcType = $funcType([$sliceType($emptyInterface)], [$js.Object], true);
      return new funcType($internalize(v, funcType));
    case Number:
      return new $Float64(parseFloat(v));
    case String:
      return new $String($internalize(v, $String));
    default:
      if ($global.Node && v instanceof $global.Node) {
        return new $js.container.ptr(v);
      }
      var mapType = $mapType($String, $emptyInterface);
      return new mapType($internalize(v, mapType));
    }
  case $kindMap:
    var m = new $Map();
    var keys = $keys(v);
    for (var i = 0; i < keys.length; i++) {
      var key = $internalize(keys[i], t.key);
      m[key.$key ? key.$key() : key] = { k: key, v: $internalize(v[keys[i]], t.elem) };
    }
    return m;
  case $kindPtr:
    if (t.elem.kind === $kindStruct) {
      return $internalize(v, t.elem);
    }
  case $kindSlice:
    return new t($mapArray(v, function(e) { return $internalize(e, t.elem); }));
  case $kindString:
    v = String(v);
    if (v.search(/^[\x00-\x7F]*$/) !== -1) {
      return v;
    }
    var s = "";
    for (var i = 0; i < v.length; i++) {
      s += $encodeRune(v.charCodeAt(i));
    }
    return s;
  case $kindStruct:
    var searchJsObject = function(v, t) {
      if (t === $js.Object) {
        return v;
      }
      if (t.kind === $kindPtr && t.elem.kind === $kindStruct) {
        var o = searchJsObject(v, t.elem);
        if (o !== undefined) {
          return o;
        }
      }
      if (t.kind === $kindStruct) {
        for (var i = 0; i < t.fields.length; i++) {
          var f = t.fields[i];
          var o = searchJsObject(v, f.type);
          if (o !== undefined) {
            var n = new t.ptr();
            n[f.prop] = o;
            return n;
          }
        }
      }
      return undefined;
    };
    var o = searchJsObject(v, t);
    if (o !== undefined) {
      return o;
    }
  }
  $panic(new $String("cannot internalize " + t.string));
};

$packages["github.com/gopherjs/gopherjs/js"] = (function() {
	var $pkg = {}, Object, container, Error, sliceType$1, ptrType, ptrType$1, init;
	Object = $pkg.Object = $newType(8, $kindInterface, "js.Object", "Object", "github.com/gopherjs/gopherjs/js", null);
	container = $pkg.container = $newType(0, $kindStruct, "js.container", "container", "github.com/gopherjs/gopherjs/js", function(Object_) {
		this.$val = this;
		this.Object = Object_ !== undefined ? Object_ : null;
	});
	Error = $pkg.Error = $newType(0, $kindStruct, "js.Error", "Error", "github.com/gopherjs/gopherjs/js", function(Object_) {
		this.$val = this;
		this.Object = Object_ !== undefined ? Object_ : null;
	});
		sliceType$1 = $sliceType($emptyInterface);
		ptrType = $ptrType(container);
		ptrType$1 = $ptrType(Error);
	container.ptr.prototype.Get = function(key) {
		var c;
		c = this;
		return c.Object[$externalize(key, $String)];
	};
	container.prototype.Get = function(key) { return this.$val.Get(key); };
	container.ptr.prototype.Set = function(key, value) {
		var c;
		c = this;
		c.Object[$externalize(key, $String)] = $externalize(value, $emptyInterface);
	};
	container.prototype.Set = function(key, value) { return this.$val.Set(key, value); };
	container.ptr.prototype.Delete = function(key) {
		var c;
		c = this;
		delete c.Object[$externalize(key, $String)];
	};
	container.prototype.Delete = function(key) { return this.$val.Delete(key); };
	container.ptr.prototype.Length = function() {
		var c;
		c = this;
		return $parseInt(c.Object.length);
	};
	container.prototype.Length = function() { return this.$val.Length(); };
	container.ptr.prototype.Index = function(i) {
		var c;
		c = this;
		return c.Object[i];
	};
	container.prototype.Index = function(i) { return this.$val.Index(i); };
	container.ptr.prototype.SetIndex = function(i, value) {
		var c;
		c = this;
		c.Object[i] = $externalize(value, $emptyInterface);
	};
	container.prototype.SetIndex = function(i, value) { return this.$val.SetIndex(i, value); };
	container.ptr.prototype.Call = function(name, args) {
		var c, obj;
		c = this;
		return (obj = c.Object, obj[$externalize(name, $String)].apply(obj, $externalize(args, sliceType$1)));
	};
	container.prototype.Call = function(name, args) { return this.$val.Call(name, args); };
	container.ptr.prototype.Invoke = function(args) {
		var c;
		c = this;
		return c.Object.apply(undefined, $externalize(args, sliceType$1));
	};
	container.prototype.Invoke = function(args) { return this.$val.Invoke(args); };
	container.ptr.prototype.New = function(args) {
		var c;
		c = this;
		return new ($global.Function.prototype.bind.apply(c.Object, [undefined].concat($externalize(args, sliceType$1))));
	};
	container.prototype.New = function(args) { return this.$val.New(args); };
	container.ptr.prototype.Bool = function() {
		var c;
		c = this;
		return !!(c.Object);
	};
	container.prototype.Bool = function() { return this.$val.Bool(); };
	container.ptr.prototype.String = function() {
		var c;
		c = this;
		return $internalize(c.Object, $String);
	};
	container.prototype.String = function() { return this.$val.String(); };
	container.ptr.prototype.Int = function() {
		var c;
		c = this;
		return $parseInt(c.Object) >> 0;
	};
	container.prototype.Int = function() { return this.$val.Int(); };
	container.ptr.prototype.Int64 = function() {
		var c;
		c = this;
		return $internalize(c.Object, $Int64);
	};
	container.prototype.Int64 = function() { return this.$val.Int64(); };
	container.ptr.prototype.Uint64 = function() {
		var c;
		c = this;
		return $internalize(c.Object, $Uint64);
	};
	container.prototype.Uint64 = function() { return this.$val.Uint64(); };
	container.ptr.prototype.Float = function() {
		var c;
		c = this;
		return $parseFloat(c.Object);
	};
	container.prototype.Float = function() { return this.$val.Float(); };
	container.ptr.prototype.Interface = function() {
		var c;
		c = this;
		return $internalize(c.Object, $emptyInterface);
	};
	container.prototype.Interface = function() { return this.$val.Interface(); };
	container.ptr.prototype.Unsafe = function() {
		var c;
		c = this;
		return c.Object;
	};
	container.prototype.Unsafe = function() { return this.$val.Unsafe(); };
	Error.ptr.prototype.Error = function() {
		var err;
		err = this;
		return "JavaScript error: " + $internalize(err.Object.message, $String);
	};
	Error.prototype.Error = function() { return this.$val.Error(); };
	Error.ptr.prototype.Stack = function() {
		var err;
		err = this;
		return $internalize(err.Object.stack, $String);
	};
	Error.prototype.Stack = function() { return this.$val.Stack(); };
	init = function() {
		var _tmp, _tmp$1, c, e;
		c = new container.ptr(null);
		e = new Error.ptr(null);
		
	};
	ptrType.methods = [{prop: "Bool", name: "Bool", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Call", name: "Call", pkg: "", type: $funcType([$String, sliceType$1], [Object], true)}, {prop: "Delete", name: "Delete", pkg: "", type: $funcType([$String], [], false)}, {prop: "Float", name: "Float", pkg: "", type: $funcType([], [$Float64], false)}, {prop: "Get", name: "Get", pkg: "", type: $funcType([$String], [Object], false)}, {prop: "Index", name: "Index", pkg: "", type: $funcType([$Int], [Object], false)}, {prop: "Int", name: "Int", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Int64", name: "Int64", pkg: "", type: $funcType([], [$Int64], false)}, {prop: "Interface", name: "Interface", pkg: "", type: $funcType([], [$emptyInterface], false)}, {prop: "Invoke", name: "Invoke", pkg: "", type: $funcType([sliceType$1], [Object], true)}, {prop: "Length", name: "Length", pkg: "", type: $funcType([], [$Int], false)}, {prop: "New", name: "New", pkg: "", type: $funcType([sliceType$1], [Object], true)}, {prop: "Set", name: "Set", pkg: "", type: $funcType([$String, $emptyInterface], [], false)}, {prop: "SetIndex", name: "SetIndex", pkg: "", type: $funcType([$Int, $emptyInterface], [], false)}, {prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}, {prop: "Uint64", name: "Uint64", pkg: "", type: $funcType([], [$Uint64], false)}, {prop: "Unsafe", name: "Unsafe", pkg: "", type: $funcType([], [$Uintptr], false)}];
	Error.methods = [{prop: "Bool", name: "Bool", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Call", name: "Call", pkg: "", type: $funcType([$String, sliceType$1], [Object], true)}, {prop: "Delete", name: "Delete", pkg: "", type: $funcType([$String], [], false)}, {prop: "Float", name: "Float", pkg: "", type: $funcType([], [$Float64], false)}, {prop: "Get", name: "Get", pkg: "", type: $funcType([$String], [Object], false)}, {prop: "Index", name: "Index", pkg: "", type: $funcType([$Int], [Object], false)}, {prop: "Int", name: "Int", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Int64", name: "Int64", pkg: "", type: $funcType([], [$Int64], false)}, {prop: "Interface", name: "Interface", pkg: "", type: $funcType([], [$emptyInterface], false)}, {prop: "Invoke", name: "Invoke", pkg: "", type: $funcType([sliceType$1], [Object], true)}, {prop: "Length", name: "Length", pkg: "", type: $funcType([], [$Int], false)}, {prop: "New", name: "New", pkg: "", type: $funcType([sliceType$1], [Object], true)}, {prop: "Set", name: "Set", pkg: "", type: $funcType([$String, $emptyInterface], [], false)}, {prop: "SetIndex", name: "SetIndex", pkg: "", type: $funcType([$Int, $emptyInterface], [], false)}, {prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}, {prop: "Uint64", name: "Uint64", pkg: "", type: $funcType([], [$Uint64], false)}, {prop: "Unsafe", name: "Unsafe", pkg: "", type: $funcType([], [$Uintptr], false)}];
	ptrType$1.methods = [{prop: "Bool", name: "Bool", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Call", name: "Call", pkg: "", type: $funcType([$String, sliceType$1], [Object], true)}, {prop: "Delete", name: "Delete", pkg: "", type: $funcType([$String], [], false)}, {prop: "Error", name: "Error", pkg: "", type: $funcType([], [$String], false)}, {prop: "Float", name: "Float", pkg: "", type: $funcType([], [$Float64], false)}, {prop: "Get", name: "Get", pkg: "", type: $funcType([$String], [Object], false)}, {prop: "Index", name: "Index", pkg: "", type: $funcType([$Int], [Object], false)}, {prop: "Int", name: "Int", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Int64", name: "Int64", pkg: "", type: $funcType([], [$Int64], false)}, {prop: "Interface", name: "Interface", pkg: "", type: $funcType([], [$emptyInterface], false)}, {prop: "Invoke", name: "Invoke", pkg: "", type: $funcType([sliceType$1], [Object], true)}, {prop: "Length", name: "Length", pkg: "", type: $funcType([], [$Int], false)}, {prop: "New", name: "New", pkg: "", type: $funcType([sliceType$1], [Object], true)}, {prop: "Set", name: "Set", pkg: "", type: $funcType([$String, $emptyInterface], [], false)}, {prop: "SetIndex", name: "SetIndex", pkg: "", type: $funcType([$Int, $emptyInterface], [], false)}, {prop: "Stack", name: "Stack", pkg: "", type: $funcType([], [$String], false)}, {prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}, {prop: "Uint64", name: "Uint64", pkg: "", type: $funcType([], [$Uint64], false)}, {prop: "Unsafe", name: "Unsafe", pkg: "", type: $funcType([], [$Uintptr], false)}];
	Object.init([{prop: "Bool", name: "Bool", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Call", name: "Call", pkg: "", type: $funcType([$String, sliceType$1], [Object], true)}, {prop: "Delete", name: "Delete", pkg: "", type: $funcType([$String], [], false)}, {prop: "Float", name: "Float", pkg: "", type: $funcType([], [$Float64], false)}, {prop: "Get", name: "Get", pkg: "", type: $funcType([$String], [Object], false)}, {prop: "Index", name: "Index", pkg: "", type: $funcType([$Int], [Object], false)}, {prop: "Int", name: "Int", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Int64", name: "Int64", pkg: "", type: $funcType([], [$Int64], false)}, {prop: "Interface", name: "Interface", pkg: "", type: $funcType([], [$emptyInterface], false)}, {prop: "Invoke", name: "Invoke", pkg: "", type: $funcType([sliceType$1], [Object], true)}, {prop: "Length", name: "Length", pkg: "", type: $funcType([], [$Int], false)}, {prop: "New", name: "New", pkg: "", type: $funcType([sliceType$1], [Object], true)}, {prop: "Set", name: "Set", pkg: "", type: $funcType([$String, $emptyInterface], [], false)}, {prop: "SetIndex", name: "SetIndex", pkg: "", type: $funcType([$Int, $emptyInterface], [], false)}, {prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}, {prop: "Uint64", name: "Uint64", pkg: "", type: $funcType([], [$Uint64], false)}, {prop: "Unsafe", name: "Unsafe", pkg: "", type: $funcType([], [$Uintptr], false)}]);
	container.init([{prop: "Object", name: "", pkg: "", type: Object, tag: ""}]);
	Error.init([{prop: "Object", name: "", pkg: "", type: Object, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_js = function() { while (true) { switch ($s) { case 0:
		init();
		/* */ } return; } }; $init_js.$blocking = true; return $init_js;
	};
	return $pkg;
})();
$packages["runtime"] = (function() {
	var $pkg = {}, js, NotSupportedError, TypeAssertionError, errorString, ptrType$5, ptrType$6, ptrType$7, init, GOROOT;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	NotSupportedError = $pkg.NotSupportedError = $newType(0, $kindStruct, "runtime.NotSupportedError", "NotSupportedError", "runtime", function(Feature_) {
		this.$val = this;
		this.Feature = Feature_ !== undefined ? Feature_ : "";
	});
	TypeAssertionError = $pkg.TypeAssertionError = $newType(0, $kindStruct, "runtime.TypeAssertionError", "TypeAssertionError", "runtime", function(interfaceString_, concreteString_, assertedString_, missingMethod_) {
		this.$val = this;
		this.interfaceString = interfaceString_ !== undefined ? interfaceString_ : "";
		this.concreteString = concreteString_ !== undefined ? concreteString_ : "";
		this.assertedString = assertedString_ !== undefined ? assertedString_ : "";
		this.missingMethod = missingMethod_ !== undefined ? missingMethod_ : "";
	});
	errorString = $pkg.errorString = $newType(8, $kindString, "runtime.errorString", "errorString", "runtime", null);
		ptrType$5 = $ptrType(NotSupportedError);
		ptrType$6 = $ptrType(TypeAssertionError);
		ptrType$7 = $ptrType(errorString);
	NotSupportedError.ptr.prototype.Error = function() {
		var err;
		err = this;
		return "not supported by GopherJS: " + err.Feature;
	};
	NotSupportedError.prototype.Error = function() { return this.$val.Error(); };
	init = function() {
		var e;
		$js = $packages[$externalize("github.com/gopherjs/gopherjs/js", $String)];
		$throwRuntimeError = (function(msg) {
			$panic(new errorString(msg));
		});
		e = $ifaceNil;
		e = new TypeAssertionError.ptr("", "", "", "");
		e = new NotSupportedError.ptr("");
	};
	GOROOT = $pkg.GOROOT = function() {
		var goroot, process;
		process = $global.process;
		if (process === undefined) {
			return "/";
		}
		goroot = process.env.GOROOT;
		if (!(goroot === undefined)) {
			return $internalize(goroot, $String);
		}
		return "/usr/local/go";
	};
	TypeAssertionError.ptr.prototype.RuntimeError = function() {
	};
	TypeAssertionError.prototype.RuntimeError = function() { return this.$val.RuntimeError(); };
	TypeAssertionError.ptr.prototype.Error = function() {
		var e, inter;
		e = this;
		inter = e.interfaceString;
		if (inter === "") {
			inter = "interface";
		}
		if (e.concreteString === "") {
			return "interface conversion: " + inter + " is nil, not " + e.assertedString;
		}
		if (e.missingMethod === "") {
			return "interface conversion: " + inter + " is " + e.concreteString + ", not " + e.assertedString;
		}
		return "interface conversion: " + e.concreteString + " is not " + e.assertedString + ": missing method " + e.missingMethod;
	};
	TypeAssertionError.prototype.Error = function() { return this.$val.Error(); };
	errorString.prototype.RuntimeError = function() {
		var e;
		e = this.$val;
	};
	$ptrType(errorString).prototype.RuntimeError = function() { return new errorString(this.$get()).RuntimeError(); };
	errorString.prototype.Error = function() {
		var e;
		e = this.$val;
		return "runtime error: " + e;
	};
	$ptrType(errorString).prototype.Error = function() { return new errorString(this.$get()).Error(); };
	ptrType$5.methods = [{prop: "Error", name: "Error", pkg: "", type: $funcType([], [$String], false)}];
	ptrType$6.methods = [{prop: "Error", name: "Error", pkg: "", type: $funcType([], [$String], false)}, {prop: "RuntimeError", name: "RuntimeError", pkg: "", type: $funcType([], [], false)}];
	errorString.methods = [{prop: "Error", name: "Error", pkg: "", type: $funcType([], [$String], false)}, {prop: "RuntimeError", name: "RuntimeError", pkg: "", type: $funcType([], [], false)}];
	ptrType$7.methods = [{prop: "Error", name: "Error", pkg: "", type: $funcType([], [$String], false)}, {prop: "RuntimeError", name: "RuntimeError", pkg: "", type: $funcType([], [], false)}];
	NotSupportedError.init([{prop: "Feature", name: "Feature", pkg: "", type: $String, tag: ""}]);
	TypeAssertionError.init([{prop: "interfaceString", name: "interfaceString", pkg: "runtime", type: $String, tag: ""}, {prop: "concreteString", name: "concreteString", pkg: "runtime", type: $String, tag: ""}, {prop: "assertedString", name: "assertedString", pkg: "runtime", type: $String, tag: ""}, {prop: "missingMethod", name: "missingMethod", pkg: "runtime", type: $String, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_runtime = function() { while (true) { switch ($s) { case 0:
		$r = js.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		init();
		/* */ } return; } }; $init_runtime.$blocking = true; return $init_runtime;
	};
	return $pkg;
})();
$packages["errors"] = (function() {
	var $pkg = {}, errorString, ptrType, New;
	errorString = $pkg.errorString = $newType(0, $kindStruct, "errors.errorString", "errorString", "errors", function(s_) {
		this.$val = this;
		this.s = s_ !== undefined ? s_ : "";
	});
		ptrType = $ptrType(errorString);
	New = $pkg.New = function(text) {
		return new errorString.ptr(text);
	};
	errorString.ptr.prototype.Error = function() {
		var e;
		e = this;
		return e.s;
	};
	errorString.prototype.Error = function() { return this.$val.Error(); };
	ptrType.methods = [{prop: "Error", name: "Error", pkg: "", type: $funcType([], [$String], false)}];
	errorString.init([{prop: "s", name: "s", pkg: "errors", type: $String, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_errors = function() { while (true) { switch ($s) { case 0:
		/* */ } return; } }; $init_errors.$blocking = true; return $init_errors;
	};
	return $pkg;
})();
$packages["math"] = (function() {
	var $pkg = {}, js, arrayType, math, zero, posInf, negInf, nan, pow10tab, init, Ldexp, Float32bits, Float32frombits, init$1;
	js = $packages["github.com/gopherjs/gopherjs/js"];
		arrayType = $arrayType($Float64, 70);
	init = function() {
		Float32bits(0);
		Float32frombits(0);
	};
	Ldexp = $pkg.Ldexp = function(frac, exp$1) {
		if (frac === 0) {
			return frac;
		}
		if (exp$1 >= 1024) {
			return frac * $parseFloat(math.pow(2, 1023)) * $parseFloat(math.pow(2, exp$1 - 1023 >> 0));
		}
		if (exp$1 <= -1024) {
			return frac * $parseFloat(math.pow(2, -1023)) * $parseFloat(math.pow(2, exp$1 + 1023 >> 0));
		}
		return frac * $parseFloat(math.pow(2, exp$1));
	};
	Float32bits = $pkg.Float32bits = function(f) {
		var e, r, s;
		if (f === 0) {
			if (1 / f === negInf) {
				return 2147483648;
			}
			return 0;
		}
		if (!(f === f)) {
			return 2143289344;
		}
		s = 0;
		if (f < 0) {
			s = 2147483648;
			f = -f;
		}
		e = 150;
		while (f >= 1.6777216e+07) {
			f = f / (2);
			e = e + (1) >>> 0;
			if (e === 255) {
				if (f >= 8.388608e+06) {
					f = posInf;
				}
				break;
			}
		}
		while (f < 8.388608e+06) {
			e = e - (1) >>> 0;
			if (e === 0) {
				break;
			}
			f = f * (2);
		}
		r = $parseFloat($mod(f, 2));
		if ((r > 0.5 && r < 1) || r >= 1.5) {
			f = f + (1);
		}
		return (((s | (e << 23 >>> 0)) >>> 0) | (((f >> 0) & ~8388608))) >>> 0;
	};
	Float32frombits = $pkg.Float32frombits = function(b) {
		var e, m, s;
		s = 1;
		if (!((((b & 2147483648) >>> 0) === 0))) {
			s = -1;
		}
		e = (((b >>> 23 >>> 0)) & 255) >>> 0;
		m = (b & 8388607) >>> 0;
		if (e === 255) {
			if (m === 0) {
				return s / 0;
			}
			return nan;
		}
		if (!((e === 0))) {
			m = m + (8388608) >>> 0;
		}
		if (e === 0) {
			e = 1;
		}
		return Ldexp(m, ((e >> 0) - 127 >> 0) - 23 >> 0) * s;
	};
	init$1 = function() {
		var _q, i, m, x;
		pow10tab[0] = 1;
		pow10tab[1] = 10;
		i = 2;
		while (i < 70) {
			m = (_q = i / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
			(i < 0 || i >= pow10tab.length) ? $throwRuntimeError("index out of range") : pow10tab[i] = ((m < 0 || m >= pow10tab.length) ? $throwRuntimeError("index out of range") : pow10tab[m]) * (x = i - m >> 0, ((x < 0 || x >= pow10tab.length) ? $throwRuntimeError("index out of range") : pow10tab[x]));
			i = i + (1) >> 0;
		}
	};
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_math = function() { while (true) { switch ($s) { case 0:
		$r = js.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		pow10tab = arrayType.zero();
		math = $global.Math;
		zero = 0;
		posInf = 1 / zero;
		negInf = -1 / zero;
		nan = 0 / zero;
		init();
		init$1();
		/* */ } return; } }; $init_math.$blocking = true; return $init_math;
	};
	return $pkg;
})();
$packages["unicode/utf8"] = (function() {
	var $pkg = {}, decodeRuneInStringInternal, DecodeRuneInString, EncodeRune, RuneCountInString;
	decodeRuneInStringInternal = function(s) {
		var _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$18, _tmp$19, _tmp$2, _tmp$20, _tmp$21, _tmp$22, _tmp$23, _tmp$24, _tmp$25, _tmp$26, _tmp$27, _tmp$28, _tmp$29, _tmp$3, _tmp$30, _tmp$31, _tmp$32, _tmp$33, _tmp$34, _tmp$35, _tmp$36, _tmp$37, _tmp$38, _tmp$39, _tmp$4, _tmp$40, _tmp$41, _tmp$42, _tmp$43, _tmp$44, _tmp$45, _tmp$46, _tmp$47, _tmp$48, _tmp$49, _tmp$5, _tmp$50, _tmp$6, _tmp$7, _tmp$8, _tmp$9, c0, c1, c2, c3, n, r = 0, short$1 = false, size = 0;
		n = s.length;
		if (n < 1) {
			_tmp = 65533; _tmp$1 = 0; _tmp$2 = true; r = _tmp; size = _tmp$1; short$1 = _tmp$2;
			return [r, size, short$1];
		}
		c0 = s.charCodeAt(0);
		if (c0 < 128) {
			_tmp$3 = (c0 >> 0); _tmp$4 = 1; _tmp$5 = false; r = _tmp$3; size = _tmp$4; short$1 = _tmp$5;
			return [r, size, short$1];
		}
		if (c0 < 192) {
			_tmp$6 = 65533; _tmp$7 = 1; _tmp$8 = false; r = _tmp$6; size = _tmp$7; short$1 = _tmp$8;
			return [r, size, short$1];
		}
		if (n < 2) {
			_tmp$9 = 65533; _tmp$10 = 1; _tmp$11 = true; r = _tmp$9; size = _tmp$10; short$1 = _tmp$11;
			return [r, size, short$1];
		}
		c1 = s.charCodeAt(1);
		if (c1 < 128 || 192 <= c1) {
			_tmp$12 = 65533; _tmp$13 = 1; _tmp$14 = false; r = _tmp$12; size = _tmp$13; short$1 = _tmp$14;
			return [r, size, short$1];
		}
		if (c0 < 224) {
			r = ((((c0 & 31) >>> 0) >> 0) << 6 >> 0) | (((c1 & 63) >>> 0) >> 0);
			if (r <= 127) {
				_tmp$15 = 65533; _tmp$16 = 1; _tmp$17 = false; r = _tmp$15; size = _tmp$16; short$1 = _tmp$17;
				return [r, size, short$1];
			}
			_tmp$18 = r; _tmp$19 = 2; _tmp$20 = false; r = _tmp$18; size = _tmp$19; short$1 = _tmp$20;
			return [r, size, short$1];
		}
		if (n < 3) {
			_tmp$21 = 65533; _tmp$22 = 1; _tmp$23 = true; r = _tmp$21; size = _tmp$22; short$1 = _tmp$23;
			return [r, size, short$1];
		}
		c2 = s.charCodeAt(2);
		if (c2 < 128 || 192 <= c2) {
			_tmp$24 = 65533; _tmp$25 = 1; _tmp$26 = false; r = _tmp$24; size = _tmp$25; short$1 = _tmp$26;
			return [r, size, short$1];
		}
		if (c0 < 240) {
			r = (((((c0 & 15) >>> 0) >> 0) << 12 >> 0) | ((((c1 & 63) >>> 0) >> 0) << 6 >> 0)) | (((c2 & 63) >>> 0) >> 0);
			if (r <= 2047) {
				_tmp$27 = 65533; _tmp$28 = 1; _tmp$29 = false; r = _tmp$27; size = _tmp$28; short$1 = _tmp$29;
				return [r, size, short$1];
			}
			if (55296 <= r && r <= 57343) {
				_tmp$30 = 65533; _tmp$31 = 1; _tmp$32 = false; r = _tmp$30; size = _tmp$31; short$1 = _tmp$32;
				return [r, size, short$1];
			}
			_tmp$33 = r; _tmp$34 = 3; _tmp$35 = false; r = _tmp$33; size = _tmp$34; short$1 = _tmp$35;
			return [r, size, short$1];
		}
		if (n < 4) {
			_tmp$36 = 65533; _tmp$37 = 1; _tmp$38 = true; r = _tmp$36; size = _tmp$37; short$1 = _tmp$38;
			return [r, size, short$1];
		}
		c3 = s.charCodeAt(3);
		if (c3 < 128 || 192 <= c3) {
			_tmp$39 = 65533; _tmp$40 = 1; _tmp$41 = false; r = _tmp$39; size = _tmp$40; short$1 = _tmp$41;
			return [r, size, short$1];
		}
		if (c0 < 248) {
			r = ((((((c0 & 7) >>> 0) >> 0) << 18 >> 0) | ((((c1 & 63) >>> 0) >> 0) << 12 >> 0)) | ((((c2 & 63) >>> 0) >> 0) << 6 >> 0)) | (((c3 & 63) >>> 0) >> 0);
			if (r <= 65535 || 1114111 < r) {
				_tmp$42 = 65533; _tmp$43 = 1; _tmp$44 = false; r = _tmp$42; size = _tmp$43; short$1 = _tmp$44;
				return [r, size, short$1];
			}
			_tmp$45 = r; _tmp$46 = 4; _tmp$47 = false; r = _tmp$45; size = _tmp$46; short$1 = _tmp$47;
			return [r, size, short$1];
		}
		_tmp$48 = 65533; _tmp$49 = 1; _tmp$50 = false; r = _tmp$48; size = _tmp$49; short$1 = _tmp$50;
		return [r, size, short$1];
	};
	DecodeRuneInString = $pkg.DecodeRuneInString = function(s) {
		var _tuple, r = 0, size = 0;
		_tuple = decodeRuneInStringInternal(s); r = _tuple[0]; size = _tuple[1];
		return [r, size];
	};
	EncodeRune = $pkg.EncodeRune = function(p, r) {
		var i;
		i = (r >>> 0);
		if (i <= 127) {
			(0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0] = (r << 24 >>> 24);
			return 1;
		} else if (i <= 2047) {
			(0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0] = (192 | ((r >> 6 >> 0) << 24 >>> 24)) >>> 0;
			(1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1] = (128 | (((r << 24 >>> 24) & 63) >>> 0)) >>> 0;
			return 2;
		} else if (i > 1114111 || 55296 <= i && i <= 57343) {
			r = 65533;
			(0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0] = (224 | ((r >> 12 >> 0) << 24 >>> 24)) >>> 0;
			(1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1] = (128 | ((((r >> 6 >> 0) << 24 >>> 24) & 63) >>> 0)) >>> 0;
			(2 < 0 || 2 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 2] = (128 | (((r << 24 >>> 24) & 63) >>> 0)) >>> 0;
			return 3;
		} else if (i <= 65535) {
			(0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0] = (224 | ((r >> 12 >> 0) << 24 >>> 24)) >>> 0;
			(1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1] = (128 | ((((r >> 6 >> 0) << 24 >>> 24) & 63) >>> 0)) >>> 0;
			(2 < 0 || 2 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 2] = (128 | (((r << 24 >>> 24) & 63) >>> 0)) >>> 0;
			return 3;
		} else {
			(0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0] = (240 | ((r >> 18 >> 0) << 24 >>> 24)) >>> 0;
			(1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1] = (128 | ((((r >> 12 >> 0) << 24 >>> 24) & 63) >>> 0)) >>> 0;
			(2 < 0 || 2 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 2] = (128 | ((((r >> 6 >> 0) << 24 >>> 24) & 63) >>> 0)) >>> 0;
			(3 < 0 || 3 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 3] = (128 | (((r << 24 >>> 24) & 63) >>> 0)) >>> 0;
			return 4;
		}
	};
	RuneCountInString = $pkg.RuneCountInString = function(s) {
		var _i, _ref, _rune, n = 0;
		_ref = s;
		_i = 0;
		while (_i < _ref.length) {
			_rune = $decodeRune(_ref, _i);
			n = n + (1) >> 0;
			_i += _rune[1];
		}
		return n;
	};
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_utf8 = function() { while (true) { switch ($s) { case 0:
		/* */ } return; } }; $init_utf8.$blocking = true; return $init_utf8;
	};
	return $pkg;
})();
$packages["strconv"] = (function() {
	var $pkg = {}, errors, math, utf8, NumError, sliceType$4, sliceType$5, sliceType$6, ptrType, arrayType$4, arrayType$5, isPrint16, isNotPrint16, isPrint32, isNotPrint32, shifts, syntaxError, rangeError, cutoff64, ParseUint, ParseInt, Atoi, FormatInt, Itoa, formatBits, quoteWith, Quote, bsearch16, bsearch32, IsPrint;
	errors = $packages["errors"];
	math = $packages["math"];
	utf8 = $packages["unicode/utf8"];
	NumError = $pkg.NumError = $newType(0, $kindStruct, "strconv.NumError", "NumError", "strconv", function(Func_, Num_, Err_) {
		this.$val = this;
		this.Func = Func_ !== undefined ? Func_ : "";
		this.Num = Num_ !== undefined ? Num_ : "";
		this.Err = Err_ !== undefined ? Err_ : $ifaceNil;
	});
		sliceType$4 = $sliceType($Uint16);
		sliceType$5 = $sliceType($Uint32);
		sliceType$6 = $sliceType($Uint8);
		ptrType = $ptrType(NumError);
		arrayType$4 = $arrayType($Uint8, 65);
		arrayType$5 = $arrayType($Uint8, 4);
	NumError.ptr.prototype.Error = function() {
		var e;
		e = this;
		return "strconv." + e.Func + ": " + "parsing " + Quote(e.Num) + ": " + e.Err.Error();
	};
	NumError.prototype.Error = function() { return this.$val.Error(); };
	syntaxError = function(fn, str) {
		return new NumError.ptr(fn, str, $pkg.ErrSyntax);
	};
	rangeError = function(fn, str) {
		return new NumError.ptr(fn, str, $pkg.ErrRange);
	};
	cutoff64 = function(base) {
		var x;
		if (base < 2) {
			return new $Uint64(0, 0);
		}
		return (x = $div64(new $Uint64(4294967295, 4294967295), new $Uint64(0, base), false), new $Uint64(x.$high + 0, x.$low + 1));
	};
	ParseUint = $pkg.ParseUint = function(s, base, bitSize) {
		var $args = arguments, $s = 0, $this = this, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, cutoff, d, err = $ifaceNil, i, maxVal, n = new $Uint64(0, 0), n1, s0, v, x, x$1;
		/* */ s: while (true) { switch ($s) { case 0:
		_tmp = new $Uint64(0, 0); _tmp$1 = new $Uint64(0, 0); cutoff = _tmp; maxVal = _tmp$1;
		if (bitSize === 0) {
			bitSize = 32;
		}
		s0 = s;
		/* if (s.length < 1) { */ if (s.length < 1) {} else if (2 <= base && base <= 36) { $s = 2; continue; } else if (base === 0) { $s = 3; continue; } else { $s = 4; continue; }
			err = $pkg.ErrSyntax;
			/* goto Error */ $s = 1; continue;
		/* } else if (2 <= base && base <= 36) { */ $s = 5; continue; case 2: 
		/* } else if (base === 0) { */ $s = 5; continue; case 3: 
			/* if ((s.charCodeAt(0) === 48) && s.length > 1 && ((s.charCodeAt(1) === 120) || (s.charCodeAt(1) === 88))) { */ if ((s.charCodeAt(0) === 48) && s.length > 1 && ((s.charCodeAt(1) === 120) || (s.charCodeAt(1) === 88))) {} else if (s.charCodeAt(0) === 48) { $s = 6; continue; } else { $s = 7; continue; }
				base = 16;
				s = s.substring(2);
				/* if (s.length < 1) { */ if (s.length < 1) {} else { $s = 9; continue; }
					err = $pkg.ErrSyntax;
					/* goto Error */ $s = 1; continue;
				/* } */ case 9:
			/* } else if (s.charCodeAt(0) === 48) { */ $s = 8; continue; case 6: 
				base = 8;
			/* } else { */ $s = 8; continue; case 7: 
				base = 10;
			/* } */ case 8:
		/* } else { */ $s = 5; continue; case 4: 
			err = errors.New("invalid base " + Itoa(base));
			/* goto Error */ $s = 1; continue;
		/* } */ case 5:
		n = new $Uint64(0, 0);
		cutoff = cutoff64(base);
		maxVal = (x = $shiftLeft64(new $Uint64(0, 1), (bitSize >>> 0)), new $Uint64(x.$high - 0, x.$low - 1));
		i = 0;
		/* while (i < s.length) { */ case 10: if(!(i < s.length)) { $s = 11; continue; }
			v = 0;
			d = s.charCodeAt(i);
			/* if (48 <= d && d <= 57) { */ if (48 <= d && d <= 57) {} else if (97 <= d && d <= 122) { $s = 12; continue; } else if (65 <= d && d <= 90) { $s = 13; continue; } else { $s = 14; continue; }
				v = d - 48 << 24 >>> 24;
			/* } else if (97 <= d && d <= 122) { */ $s = 15; continue; case 12: 
				v = (d - 97 << 24 >>> 24) + 10 << 24 >>> 24;
			/* } else if (65 <= d && d <= 90) { */ $s = 15; continue; case 13: 
				v = (d - 65 << 24 >>> 24) + 10 << 24 >>> 24;
			/* } else { */ $s = 15; continue; case 14: 
				n = new $Uint64(0, 0);
				err = $pkg.ErrSyntax;
				/* goto Error */ $s = 1; continue;
			/* } */ case 15:
			/* if ((v >> 0) >= base) { */ if ((v >> 0) >= base) {} else { $s = 16; continue; }
				n = new $Uint64(0, 0);
				err = $pkg.ErrSyntax;
				/* goto Error */ $s = 1; continue;
			/* } */ case 16:
			/* if ((n.$high > cutoff.$high || (n.$high === cutoff.$high && n.$low >= cutoff.$low))) { */ if ((n.$high > cutoff.$high || (n.$high === cutoff.$high && n.$low >= cutoff.$low))) {} else { $s = 17; continue; }
				n = new $Uint64(4294967295, 4294967295);
				err = $pkg.ErrRange;
				/* goto Error */ $s = 1; continue;
			/* } */ case 17:
			n = $mul64(n, (new $Uint64(0, base)));
			n1 = (x$1 = new $Uint64(0, v), new $Uint64(n.$high + x$1.$high, n.$low + x$1.$low));
			/* if ((n1.$high < n.$high || (n1.$high === n.$high && n1.$low < n.$low)) || (n1.$high > maxVal.$high || (n1.$high === maxVal.$high && n1.$low > maxVal.$low))) { */ if ((n1.$high < n.$high || (n1.$high === n.$high && n1.$low < n.$low)) || (n1.$high > maxVal.$high || (n1.$high === maxVal.$high && n1.$low > maxVal.$low))) {} else { $s = 18; continue; }
				n = new $Uint64(4294967295, 4294967295);
				err = $pkg.ErrRange;
				/* goto Error */ $s = 1; continue;
			/* } */ case 18:
			n = n1;
			i = i + (1) >> 0;
		/* } */ $s = 10; continue; case 11:
		_tmp$2 = n; _tmp$3 = $ifaceNil; n = _tmp$2; err = _tmp$3;
		return [n, err];
		/* Error: */ case 1:
		_tmp$4 = n; _tmp$5 = new NumError.ptr("ParseUint", s0, err); n = _tmp$4; err = _tmp$5;
		return [n, err];
		/* */ case -1: } return; }
	};
	ParseInt = $pkg.ParseInt = function(s, base, bitSize) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tuple, cutoff, err = $ifaceNil, i = new $Int64(0, 0), n, neg, s0, un, x, x$1;
		if (bitSize === 0) {
			bitSize = 32;
		}
		if (s.length === 0) {
			_tmp = new $Int64(0, 0); _tmp$1 = syntaxError("ParseInt", s); i = _tmp; err = _tmp$1;
			return [i, err];
		}
		s0 = s;
		neg = false;
		if (s.charCodeAt(0) === 43) {
			s = s.substring(1);
		} else if (s.charCodeAt(0) === 45) {
			neg = true;
			s = s.substring(1);
		}
		un = new $Uint64(0, 0);
		_tuple = ParseUint(s, base, bitSize); un = _tuple[0]; err = _tuple[1];
		if (!($interfaceIsEqual(err, $ifaceNil)) && !($interfaceIsEqual($assertType(err, ptrType).Err, $pkg.ErrRange))) {
			$assertType(err, ptrType).Func = "ParseInt";
			$assertType(err, ptrType).Num = s0;
			_tmp$2 = new $Int64(0, 0); _tmp$3 = err; i = _tmp$2; err = _tmp$3;
			return [i, err];
		}
		cutoff = $shiftLeft64(new $Uint64(0, 1), ((bitSize - 1 >> 0) >>> 0));
		if (!neg && (un.$high > cutoff.$high || (un.$high === cutoff.$high && un.$low >= cutoff.$low))) {
			_tmp$4 = (x = new $Uint64(cutoff.$high - 0, cutoff.$low - 1), new $Int64(x.$high, x.$low)); _tmp$5 = rangeError("ParseInt", s0); i = _tmp$4; err = _tmp$5;
			return [i, err];
		}
		if (neg && (un.$high > cutoff.$high || (un.$high === cutoff.$high && un.$low > cutoff.$low))) {
			_tmp$6 = (x$1 = new $Int64(cutoff.$high, cutoff.$low), new $Int64(-x$1.$high, -x$1.$low)); _tmp$7 = rangeError("ParseInt", s0); i = _tmp$6; err = _tmp$7;
			return [i, err];
		}
		n = new $Int64(un.$high, un.$low);
		if (neg) {
			n = new $Int64(-n.$high, -n.$low);
		}
		_tmp$8 = n; _tmp$9 = $ifaceNil; i = _tmp$8; err = _tmp$9;
		return [i, err];
	};
	Atoi = $pkg.Atoi = function(s) {
		var _tmp, _tmp$1, _tuple, err = $ifaceNil, i = 0, i64;
		_tuple = ParseInt(s, 10, 0); i64 = _tuple[0]; err = _tuple[1];
		_tmp = ((i64.$low + ((i64.$high >> 31) * 4294967296)) >> 0); _tmp$1 = err; i = _tmp; err = _tmp$1;
		return [i, err];
	};
	FormatInt = $pkg.FormatInt = function(i, base) {
		var _tuple, s;
		_tuple = formatBits(sliceType$6.nil, new $Uint64(i.$high, i.$low), base, (i.$high < 0 || (i.$high === 0 && i.$low < 0)), false); s = _tuple[1];
		return s;
	};
	Itoa = $pkg.Itoa = function(i) {
		return FormatInt(new $Int64(0, i), 10);
	};
	formatBits = function(dst, u, base, neg, append_) {
		var a, b, b$1, d = sliceType$6.nil, i, j, m, q, q$1, s = "", s$1, x, x$1, x$2, x$3;
		if (base < 2 || base > 36) {
			$panic(new $String("strconv: illegal AppendInt/FormatInt base"));
		}
		a = $clone(arrayType$4.zero(), arrayType$4);
		i = 65;
		if (neg) {
			u = new $Uint64(-u.$high, -u.$low);
		}
		if (base === 10) {
			while ((u.$high > 0 || (u.$high === 0 && u.$low >= 100))) {
				i = i - (2) >> 0;
				q = $div64(u, new $Uint64(0, 100), false);
				j = ((x = $mul64(q, new $Uint64(0, 100)), new $Uint64(u.$high - x.$high, u.$low - x.$low)).$low >>> 0);
				(x$1 = i + 1 >> 0, (x$1 < 0 || x$1 >= a.length) ? $throwRuntimeError("index out of range") : a[x$1] = "0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789".charCodeAt(j));
				(x$2 = i + 0 >> 0, (x$2 < 0 || x$2 >= a.length) ? $throwRuntimeError("index out of range") : a[x$2] = "0000000000111111111122222222223333333333444444444455555555556666666666777777777788888888889999999999".charCodeAt(j));
				u = q;
			}
			if ((u.$high > 0 || (u.$high === 0 && u.$low >= 10))) {
				i = i - (1) >> 0;
				q$1 = $div64(u, new $Uint64(0, 10), false);
				(i < 0 || i >= a.length) ? $throwRuntimeError("index out of range") : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt(((x$3 = $mul64(q$1, new $Uint64(0, 10)), new $Uint64(u.$high - x$3.$high, u.$low - x$3.$low)).$low >>> 0));
				u = q$1;
			}
		} else {
			s$1 = ((base < 0 || base >= shifts.length) ? $throwRuntimeError("index out of range") : shifts[base]);
			if (s$1 > 0) {
				b = new $Uint64(0, base);
				m = (b.$low >>> 0) - 1 >>> 0;
				while ((u.$high > b.$high || (u.$high === b.$high && u.$low >= b.$low))) {
					i = i - (1) >> 0;
					(i < 0 || i >= a.length) ? $throwRuntimeError("index out of range") : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt((((u.$low >>> 0) & m) >>> 0));
					u = $shiftRightUint64(u, (s$1));
				}
			} else {
				b$1 = new $Uint64(0, base);
				while ((u.$high > b$1.$high || (u.$high === b$1.$high && u.$low >= b$1.$low))) {
					i = i - (1) >> 0;
					(i < 0 || i >= a.length) ? $throwRuntimeError("index out of range") : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt(($div64(u, b$1, true).$low >>> 0));
					u = $div64(u, (b$1), false);
				}
			}
		}
		i = i - (1) >> 0;
		(i < 0 || i >= a.length) ? $throwRuntimeError("index out of range") : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt((u.$low >>> 0));
		if (neg) {
			i = i - (1) >> 0;
			(i < 0 || i >= a.length) ? $throwRuntimeError("index out of range") : a[i] = 45;
		}
		if (append_) {
			d = $appendSlice(dst, $subslice(new sliceType$6(a), i));
			return [d, s];
		}
		s = $bytesToString($subslice(new sliceType$6(a), i));
		return [d, s];
	};
	quoteWith = function(s, quote, ASCIIonly) {
		var _q, _ref, _tuple, buf, n, r, runeTmp, s$1, s$2, width;
		runeTmp = $clone(arrayType$5.zero(), arrayType$5);
		buf = $makeSlice(sliceType$6, 0, (_q = (3 * s.length >> 0) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")));
		buf = $append(buf, quote);
		width = 0;
		while (s.length > 0) {
			r = (s.charCodeAt(0) >> 0);
			width = 1;
			if (r >= 128) {
				_tuple = utf8.DecodeRuneInString(s); r = _tuple[0]; width = _tuple[1];
			}
			if ((width === 1) && (r === 65533)) {
				buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\x")));
				buf = $append(buf, "0123456789abcdef".charCodeAt((s.charCodeAt(0) >>> 4 << 24 >>> 24)));
				buf = $append(buf, "0123456789abcdef".charCodeAt(((s.charCodeAt(0) & 15) >>> 0)));
				s = s.substring(width);
				continue;
			}
			if ((r === (quote >> 0)) || (r === 92)) {
				buf = $append(buf, 92);
				buf = $append(buf, (r << 24 >>> 24));
				s = s.substring(width);
				continue;
			}
			if (ASCIIonly) {
				if (r < 128 && IsPrint(r)) {
					buf = $append(buf, (r << 24 >>> 24));
					s = s.substring(width);
					continue;
				}
			} else if (IsPrint(r)) {
				n = utf8.EncodeRune(new sliceType$6(runeTmp), r);
				buf = $appendSlice(buf, $subslice(new sliceType$6(runeTmp), 0, n));
				s = s.substring(width);
				continue;
			}
			_ref = r;
			if (_ref === 7) {
				buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\a")));
			} else if (_ref === 8) {
				buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\b")));
			} else if (_ref === 12) {
				buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\f")));
			} else if (_ref === 10) {
				buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\n")));
			} else if (_ref === 13) {
				buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\r")));
			} else if (_ref === 9) {
				buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\t")));
			} else if (_ref === 11) {
				buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\v")));
			} else {
				if (r < 32) {
					buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\x")));
					buf = $append(buf, "0123456789abcdef".charCodeAt((s.charCodeAt(0) >>> 4 << 24 >>> 24)));
					buf = $append(buf, "0123456789abcdef".charCodeAt(((s.charCodeAt(0) & 15) >>> 0)));
				} else if (r > 1114111) {
					r = 65533;
					buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\u")));
					s$1 = 12;
					while (s$1 >= 0) {
						buf = $append(buf, "0123456789abcdef".charCodeAt((((r >> $min((s$1 >>> 0), 31)) >> 0) & 15)));
						s$1 = s$1 - (4) >> 0;
					}
				} else if (r < 65536) {
					buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\u")));
					s$1 = 12;
					while (s$1 >= 0) {
						buf = $append(buf, "0123456789abcdef".charCodeAt((((r >> $min((s$1 >>> 0), 31)) >> 0) & 15)));
						s$1 = s$1 - (4) >> 0;
					}
				} else {
					buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\U")));
					s$2 = 28;
					while (s$2 >= 0) {
						buf = $append(buf, "0123456789abcdef".charCodeAt((((r >> $min((s$2 >>> 0), 31)) >> 0) & 15)));
						s$2 = s$2 - (4) >> 0;
					}
				}
			}
			s = s.substring(width);
		}
		buf = $append(buf, quote);
		return $bytesToString(buf);
	};
	Quote = $pkg.Quote = function(s) {
		return quoteWith(s, 34, false);
	};
	bsearch16 = function(a, x) {
		var _q, _tmp, _tmp$1, h, i, j;
		_tmp = 0; _tmp$1 = a.$length; i = _tmp; j = _tmp$1;
		while (i < j) {
			h = i + (_q = ((j - i >> 0)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0;
			if (((h < 0 || h >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + h]) < x) {
				i = h + 1 >> 0;
			} else {
				j = h;
			}
		}
		return i;
	};
	bsearch32 = function(a, x) {
		var _q, _tmp, _tmp$1, h, i, j;
		_tmp = 0; _tmp$1 = a.$length; i = _tmp; j = _tmp$1;
		while (i < j) {
			h = i + (_q = ((j - i >> 0)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0;
			if (((h < 0 || h >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + h]) < x) {
				i = h + 1 >> 0;
			} else {
				j = h;
			}
		}
		return i;
	};
	IsPrint = $pkg.IsPrint = function(r) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, i, i$1, isNotPrint, isNotPrint$1, isPrint, isPrint$1, j, j$1, rr, rr$1, x, x$1, x$2, x$3;
		if (r <= 255) {
			if (32 <= r && r <= 126) {
				return true;
			}
			if (161 <= r && r <= 255) {
				return !((r === 173));
			}
			return false;
		}
		if (0 <= r && r < 65536) {
			_tmp = (r << 16 >>> 16); _tmp$1 = isPrint16; _tmp$2 = isNotPrint16; rr = _tmp; isPrint = _tmp$1; isNotPrint = _tmp$2;
			i = bsearch16(isPrint, rr);
			if (i >= isPrint.$length || rr < (x = i & ~1, ((x < 0 || x >= isPrint.$length) ? $throwRuntimeError("index out of range") : isPrint.$array[isPrint.$offset + x])) || (x$1 = i | 1, ((x$1 < 0 || x$1 >= isPrint.$length) ? $throwRuntimeError("index out of range") : isPrint.$array[isPrint.$offset + x$1])) < rr) {
				return false;
			}
			j = bsearch16(isNotPrint, rr);
			return j >= isNotPrint.$length || !((((j < 0 || j >= isNotPrint.$length) ? $throwRuntimeError("index out of range") : isNotPrint.$array[isNotPrint.$offset + j]) === rr));
		}
		_tmp$3 = (r >>> 0); _tmp$4 = isPrint32; _tmp$5 = isNotPrint32; rr$1 = _tmp$3; isPrint$1 = _tmp$4; isNotPrint$1 = _tmp$5;
		i$1 = bsearch32(isPrint$1, rr$1);
		if (i$1 >= isPrint$1.$length || rr$1 < (x$2 = i$1 & ~1, ((x$2 < 0 || x$2 >= isPrint$1.$length) ? $throwRuntimeError("index out of range") : isPrint$1.$array[isPrint$1.$offset + x$2])) || (x$3 = i$1 | 1, ((x$3 < 0 || x$3 >= isPrint$1.$length) ? $throwRuntimeError("index out of range") : isPrint$1.$array[isPrint$1.$offset + x$3])) < rr$1) {
			return false;
		}
		if (r >= 131072) {
			return true;
		}
		r = r - (65536) >> 0;
		j$1 = bsearch16(isNotPrint$1, (r << 16 >>> 16));
		return j$1 >= isNotPrint$1.$length || !((((j$1 < 0 || j$1 >= isNotPrint$1.$length) ? $throwRuntimeError("index out of range") : isNotPrint$1.$array[isNotPrint$1.$offset + j$1]) === (r << 16 >>> 16)));
	};
	ptrType.methods = [{prop: "Error", name: "Error", pkg: "", type: $funcType([], [$String], false)}];
	NumError.init([{prop: "Func", name: "Func", pkg: "", type: $String, tag: ""}, {prop: "Num", name: "Num", pkg: "", type: $String, tag: ""}, {prop: "Err", name: "Err", pkg: "", type: $error, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_strconv = function() { while (true) { switch ($s) { case 0:
		$r = errors.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$r = math.$init($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		$r = utf8.$init($BLOCKING); /* */ $s = 3; case 3: if ($r && $r.$blocking) { $r = $r(); }
		$pkg.ErrRange = errors.New("value out of range");
		$pkg.ErrSyntax = errors.New("invalid syntax");
		isPrint16 = new sliceType$4([32, 126, 161, 887, 890, 895, 900, 1366, 1369, 1418, 1421, 1479, 1488, 1514, 1520, 1524, 1542, 1563, 1566, 1805, 1808, 1866, 1869, 1969, 1984, 2042, 2048, 2093, 2096, 2139, 2142, 2142, 2208, 2226, 2276, 2444, 2447, 2448, 2451, 2482, 2486, 2489, 2492, 2500, 2503, 2504, 2507, 2510, 2519, 2519, 2524, 2531, 2534, 2555, 2561, 2570, 2575, 2576, 2579, 2617, 2620, 2626, 2631, 2632, 2635, 2637, 2641, 2641, 2649, 2654, 2662, 2677, 2689, 2745, 2748, 2765, 2768, 2768, 2784, 2787, 2790, 2801, 2817, 2828, 2831, 2832, 2835, 2873, 2876, 2884, 2887, 2888, 2891, 2893, 2902, 2903, 2908, 2915, 2918, 2935, 2946, 2954, 2958, 2965, 2969, 2975, 2979, 2980, 2984, 2986, 2990, 3001, 3006, 3010, 3014, 3021, 3024, 3024, 3031, 3031, 3046, 3066, 3072, 3129, 3133, 3149, 3157, 3161, 3168, 3171, 3174, 3183, 3192, 3257, 3260, 3277, 3285, 3286, 3294, 3299, 3302, 3314, 3329, 3386, 3389, 3406, 3415, 3415, 3424, 3427, 3430, 3445, 3449, 3455, 3458, 3478, 3482, 3517, 3520, 3526, 3530, 3530, 3535, 3551, 3558, 3567, 3570, 3572, 3585, 3642, 3647, 3675, 3713, 3716, 3719, 3722, 3725, 3725, 3732, 3751, 3754, 3773, 3776, 3789, 3792, 3801, 3804, 3807, 3840, 3948, 3953, 4058, 4096, 4295, 4301, 4301, 4304, 4685, 4688, 4701, 4704, 4749, 4752, 4789, 4792, 4805, 4808, 4885, 4888, 4954, 4957, 4988, 4992, 5017, 5024, 5108, 5120, 5788, 5792, 5880, 5888, 5908, 5920, 5942, 5952, 5971, 5984, 6003, 6016, 6109, 6112, 6121, 6128, 6137, 6144, 6157, 6160, 6169, 6176, 6263, 6272, 6314, 6320, 6389, 6400, 6443, 6448, 6459, 6464, 6464, 6468, 6509, 6512, 6516, 6528, 6571, 6576, 6601, 6608, 6618, 6622, 6683, 6686, 6780, 6783, 6793, 6800, 6809, 6816, 6829, 6832, 6846, 6912, 6987, 6992, 7036, 7040, 7155, 7164, 7223, 7227, 7241, 7245, 7295, 7360, 7367, 7376, 7417, 7424, 7669, 7676, 7957, 7960, 7965, 7968, 8005, 8008, 8013, 8016, 8061, 8064, 8147, 8150, 8175, 8178, 8190, 8208, 8231, 8240, 8286, 8304, 8305, 8308, 8348, 8352, 8381, 8400, 8432, 8448, 8585, 8592, 9210, 9216, 9254, 9280, 9290, 9312, 11123, 11126, 11157, 11160, 11193, 11197, 11217, 11264, 11507, 11513, 11559, 11565, 11565, 11568, 11623, 11631, 11632, 11647, 11670, 11680, 11842, 11904, 12019, 12032, 12245, 12272, 12283, 12289, 12438, 12441, 12543, 12549, 12589, 12593, 12730, 12736, 12771, 12784, 19893, 19904, 40908, 40960, 42124, 42128, 42182, 42192, 42539, 42560, 42743, 42752, 42925, 42928, 42929, 42999, 43051, 43056, 43065, 43072, 43127, 43136, 43204, 43214, 43225, 43232, 43259, 43264, 43347, 43359, 43388, 43392, 43481, 43486, 43574, 43584, 43597, 43600, 43609, 43612, 43714, 43739, 43766, 43777, 43782, 43785, 43790, 43793, 43798, 43808, 43871, 43876, 43877, 43968, 44013, 44016, 44025, 44032, 55203, 55216, 55238, 55243, 55291, 63744, 64109, 64112, 64217, 64256, 64262, 64275, 64279, 64285, 64449, 64467, 64831, 64848, 64911, 64914, 64967, 65008, 65021, 65024, 65049, 65056, 65069, 65072, 65131, 65136, 65276, 65281, 65470, 65474, 65479, 65482, 65487, 65490, 65495, 65498, 65500, 65504, 65518, 65532, 65533]);
		isNotPrint16 = new sliceType$4([173, 907, 909, 930, 1328, 1376, 1416, 1424, 1757, 2111, 2436, 2473, 2481, 2526, 2564, 2601, 2609, 2612, 2615, 2621, 2653, 2692, 2702, 2706, 2729, 2737, 2740, 2758, 2762, 2820, 2857, 2865, 2868, 2910, 2948, 2961, 2971, 2973, 3017, 3076, 3085, 3089, 3113, 3141, 3145, 3159, 3200, 3204, 3213, 3217, 3241, 3252, 3269, 3273, 3295, 3312, 3332, 3341, 3345, 3397, 3401, 3460, 3506, 3516, 3541, 3543, 3715, 3721, 3736, 3744, 3748, 3750, 3756, 3770, 3781, 3783, 3912, 3992, 4029, 4045, 4294, 4681, 4695, 4697, 4745, 4785, 4799, 4801, 4823, 4881, 5760, 5901, 5997, 6001, 6431, 6751, 7415, 8024, 8026, 8028, 8030, 8117, 8133, 8156, 8181, 8335, 11209, 11311, 11359, 11558, 11687, 11695, 11703, 11711, 11719, 11727, 11735, 11743, 11930, 12352, 12687, 12831, 13055, 42654, 42895, 43470, 43519, 43815, 43823, 64311, 64317, 64319, 64322, 64325, 65107, 65127, 65141, 65511]);
		isPrint32 = new sliceType$5([65536, 65613, 65616, 65629, 65664, 65786, 65792, 65794, 65799, 65843, 65847, 65932, 65936, 65947, 65952, 65952, 66000, 66045, 66176, 66204, 66208, 66256, 66272, 66299, 66304, 66339, 66352, 66378, 66384, 66426, 66432, 66499, 66504, 66517, 66560, 66717, 66720, 66729, 66816, 66855, 66864, 66915, 66927, 66927, 67072, 67382, 67392, 67413, 67424, 67431, 67584, 67589, 67592, 67640, 67644, 67644, 67647, 67742, 67751, 67759, 67840, 67867, 67871, 67897, 67903, 67903, 67968, 68023, 68030, 68031, 68096, 68102, 68108, 68147, 68152, 68154, 68159, 68167, 68176, 68184, 68192, 68255, 68288, 68326, 68331, 68342, 68352, 68405, 68409, 68437, 68440, 68466, 68472, 68497, 68505, 68508, 68521, 68527, 68608, 68680, 69216, 69246, 69632, 69709, 69714, 69743, 69759, 69825, 69840, 69864, 69872, 69881, 69888, 69955, 69968, 70006, 70016, 70088, 70093, 70093, 70096, 70106, 70113, 70132, 70144, 70205, 70320, 70378, 70384, 70393, 70401, 70412, 70415, 70416, 70419, 70457, 70460, 70468, 70471, 70472, 70475, 70477, 70487, 70487, 70493, 70499, 70502, 70508, 70512, 70516, 70784, 70855, 70864, 70873, 71040, 71093, 71096, 71113, 71168, 71236, 71248, 71257, 71296, 71351, 71360, 71369, 71840, 71922, 71935, 71935, 72384, 72440, 73728, 74648, 74752, 74868, 77824, 78894, 92160, 92728, 92736, 92777, 92782, 92783, 92880, 92909, 92912, 92917, 92928, 92997, 93008, 93047, 93053, 93071, 93952, 94020, 94032, 94078, 94095, 94111, 110592, 110593, 113664, 113770, 113776, 113788, 113792, 113800, 113808, 113817, 113820, 113823, 118784, 119029, 119040, 119078, 119081, 119154, 119163, 119261, 119296, 119365, 119552, 119638, 119648, 119665, 119808, 119967, 119970, 119970, 119973, 119974, 119977, 120074, 120077, 120134, 120138, 120485, 120488, 120779, 120782, 120831, 124928, 125124, 125127, 125142, 126464, 126500, 126503, 126523, 126530, 126530, 126535, 126548, 126551, 126564, 126567, 126619, 126625, 126651, 126704, 126705, 126976, 127019, 127024, 127123, 127136, 127150, 127153, 127221, 127232, 127244, 127248, 127339, 127344, 127386, 127462, 127490, 127504, 127546, 127552, 127560, 127568, 127569, 127744, 127788, 127792, 127869, 127872, 127950, 127956, 127991, 128000, 128330, 128336, 128578, 128581, 128719, 128736, 128748, 128752, 128755, 128768, 128883, 128896, 128980, 129024, 129035, 129040, 129095, 129104, 129113, 129120, 129159, 129168, 129197, 131072, 173782, 173824, 177972, 177984, 178205, 194560, 195101, 917760, 917999]);
		isNotPrint32 = new sliceType$4([12, 39, 59, 62, 926, 2057, 2102, 2134, 2564, 2580, 2584, 4285, 4405, 4626, 4868, 4905, 4913, 4916, 9327, 27231, 27482, 27490, 54357, 54429, 54445, 54458, 54460, 54468, 54534, 54549, 54557, 54586, 54591, 54597, 54609, 60932, 60960, 60963, 60968, 60979, 60984, 60986, 61000, 61002, 61004, 61008, 61011, 61016, 61018, 61020, 61022, 61024, 61027, 61035, 61043, 61048, 61053, 61055, 61066, 61092, 61098, 61632, 61648, 61743, 62719, 62842, 62884]);
		shifts = $toNativeArray($kindUint, [0, 0, 1, 0, 2, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0]);
		/* */ } return; } }; $init_strconv.$blocking = true; return $init_strconv;
	};
	return $pkg;
})();
$packages["sync/atomic"] = (function() {
	var $pkg = {}, js, CompareAndSwapInt32, AddInt32, LoadUint32, StoreUint32;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	CompareAndSwapInt32 = $pkg.CompareAndSwapInt32 = function(addr, old, new$1) {
		if (addr.$get() === old) {
			addr.$set(new$1);
			return true;
		}
		return false;
	};
	AddInt32 = $pkg.AddInt32 = function(addr, delta) {
		var new$1;
		new$1 = addr.$get() + delta >> 0;
		addr.$set(new$1);
		return new$1;
	};
	LoadUint32 = $pkg.LoadUint32 = function(addr) {
		return addr.$get();
	};
	StoreUint32 = $pkg.StoreUint32 = function(addr, val) {
		addr.$set(val);
	};
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_atomic = function() { while (true) { switch ($s) { case 0:
		$r = js.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		/* */ } return; } }; $init_atomic.$blocking = true; return $init_atomic;
	};
	return $pkg;
})();
$packages["sync"] = (function() {
	var $pkg = {}, runtime, atomic, Pool, Mutex, Locker, Once, poolLocal, syncSema, RWMutex, rlocker, ptrType, sliceType, ptrType$2, ptrType$3, ptrType$5, sliceType$2, ptrType$7, ptrType$8, funcType, ptrType$10, funcType$1, ptrType$11, arrayType, allPools, runtime_registerPoolCleanup, runtime_Syncsemcheck, poolCleanup, init, indexLocal, raceEnable, runtime_Semacquire, runtime_Semrelease, init$1;
	runtime = $packages["runtime"];
	atomic = $packages["sync/atomic"];
	Pool = $pkg.Pool = $newType(0, $kindStruct, "sync.Pool", "Pool", "sync", function(local_, localSize_, store_, New_) {
		this.$val = this;
		this.local = local_ !== undefined ? local_ : 0;
		this.localSize = localSize_ !== undefined ? localSize_ : 0;
		this.store = store_ !== undefined ? store_ : sliceType$2.nil;
		this.New = New_ !== undefined ? New_ : $throwNilPointerError;
	});
	Mutex = $pkg.Mutex = $newType(0, $kindStruct, "sync.Mutex", "Mutex", "sync", function(state_, sema_) {
		this.$val = this;
		this.state = state_ !== undefined ? state_ : 0;
		this.sema = sema_ !== undefined ? sema_ : 0;
	});
	Locker = $pkg.Locker = $newType(8, $kindInterface, "sync.Locker", "Locker", "sync", null);
	Once = $pkg.Once = $newType(0, $kindStruct, "sync.Once", "Once", "sync", function(m_, done_) {
		this.$val = this;
		this.m = m_ !== undefined ? m_ : new Mutex.ptr();
		this.done = done_ !== undefined ? done_ : 0;
	});
	poolLocal = $pkg.poolLocal = $newType(0, $kindStruct, "sync.poolLocal", "poolLocal", "sync", function(private$0_, shared_, Mutex_, pad_) {
		this.$val = this;
		this.private$0 = private$0_ !== undefined ? private$0_ : $ifaceNil;
		this.shared = shared_ !== undefined ? shared_ : sliceType$2.nil;
		this.Mutex = Mutex_ !== undefined ? Mutex_ : new Mutex.ptr();
		this.pad = pad_ !== undefined ? pad_ : arrayType.zero();
	});
	syncSema = $pkg.syncSema = $newType(0, $kindStruct, "sync.syncSema", "syncSema", "sync", function(lock_, head_, tail_) {
		this.$val = this;
		this.lock = lock_ !== undefined ? lock_ : 0;
		this.head = head_ !== undefined ? head_ : 0;
		this.tail = tail_ !== undefined ? tail_ : 0;
	});
	RWMutex = $pkg.RWMutex = $newType(0, $kindStruct, "sync.RWMutex", "RWMutex", "sync", function(w_, writerSem_, readerSem_, readerCount_, readerWait_) {
		this.$val = this;
		this.w = w_ !== undefined ? w_ : new Mutex.ptr();
		this.writerSem = writerSem_ !== undefined ? writerSem_ : 0;
		this.readerSem = readerSem_ !== undefined ? readerSem_ : 0;
		this.readerCount = readerCount_ !== undefined ? readerCount_ : 0;
		this.readerWait = readerWait_ !== undefined ? readerWait_ : 0;
	});
	rlocker = $pkg.rlocker = $newType(0, $kindStruct, "sync.rlocker", "rlocker", "sync", function(w_, writerSem_, readerSem_, readerCount_, readerWait_) {
		this.$val = this;
		this.w = w_ !== undefined ? w_ : new Mutex.ptr();
		this.writerSem = writerSem_ !== undefined ? writerSem_ : 0;
		this.readerSem = readerSem_ !== undefined ? readerSem_ : 0;
		this.readerCount = readerCount_ !== undefined ? readerCount_ : 0;
		this.readerWait = readerWait_ !== undefined ? readerWait_ : 0;
	});
		ptrType = $ptrType(Pool);
		sliceType = $sliceType(ptrType);
		ptrType$2 = $ptrType($Uint32);
		ptrType$3 = $ptrType($Int32);
		ptrType$5 = $ptrType(poolLocal);
		sliceType$2 = $sliceType($emptyInterface);
		ptrType$7 = $ptrType(rlocker);
		ptrType$8 = $ptrType(RWMutex);
		funcType = $funcType([], [$emptyInterface], false);
		ptrType$10 = $ptrType(Mutex);
		funcType$1 = $funcType([], [], false);
		ptrType$11 = $ptrType(Once);
		arrayType = $arrayType($Uint8, 128);
	Pool.ptr.prototype.Get = function() {
		var p, x, x$1, x$2;
		p = this;
		if (p.store.$length === 0) {
			if (!(p.New === $throwNilPointerError)) {
				return p.New();
			}
			return $ifaceNil;
		}
		x$2 = (x = p.store, x$1 = p.store.$length - 1 >> 0, ((x$1 < 0 || x$1 >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + x$1]));
		p.store = $subslice(p.store, 0, (p.store.$length - 1 >> 0));
		return x$2;
	};
	Pool.prototype.Get = function() { return this.$val.Get(); };
	Pool.ptr.prototype.Put = function(x) {
		var p;
		p = this;
		if ($interfaceIsEqual(x, $ifaceNil)) {
			return;
		}
		p.store = $append(p.store, x);
	};
	Pool.prototype.Put = function(x) { return this.$val.Put(x); };
	runtime_registerPoolCleanup = function(cleanup) {
	};
	runtime_Syncsemcheck = function(size) {
	};
	Mutex.ptr.prototype.Lock = function() {
		var awoke, m, new$1, old;
		m = this;
		if (atomic.CompareAndSwapInt32(new ptrType$3(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), 0, 1)) {
			return;
		}
		awoke = false;
		while (true) {
			old = m.state;
			new$1 = old | 1;
			if (!(((old & 1) === 0))) {
				new$1 = old + 4 >> 0;
			}
			if (awoke) {
				new$1 = new$1 & ~(2);
			}
			if (atomic.CompareAndSwapInt32(new ptrType$3(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), old, new$1)) {
				if ((old & 1) === 0) {
					break;
				}
				runtime_Semacquire(new ptrType$2(function() { return this.$target.sema; }, function($v) { this.$target.sema = $v; }, m));
				awoke = true;
			}
		}
	};
	Mutex.prototype.Lock = function() { return this.$val.Lock(); };
	Mutex.ptr.prototype.Unlock = function() {
		var m, new$1, old;
		m = this;
		new$1 = atomic.AddInt32(new ptrType$3(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), -1);
		if ((((new$1 + 1 >> 0)) & 1) === 0) {
			$panic(new $String("sync: unlock of unlocked mutex"));
		}
		old = new$1;
		while (true) {
			if (((old >> 2 >> 0) === 0) || !(((old & 3) === 0))) {
				return;
			}
			new$1 = ((old - 4 >> 0)) | 2;
			if (atomic.CompareAndSwapInt32(new ptrType$3(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), old, new$1)) {
				runtime_Semrelease(new ptrType$2(function() { return this.$target.sema; }, function($v) { this.$target.sema = $v; }, m));
				return;
			}
			old = m.state;
		}
	};
	Mutex.prototype.Unlock = function() { return this.$val.Unlock(); };
	Once.ptr.prototype.Do = function(f) {
		var $deferred = [], $err = null, o;
		/* */ try { $deferFrames.push($deferred);
		o = this;
		if (atomic.LoadUint32(new ptrType$2(function() { return this.$target.done; }, function($v) { this.$target.done = $v; }, o)) === 1) {
			return;
		}
		o.m.Lock();
		$deferred.push([$methodVal(o.m, "Unlock"), []]);
		if (o.done === 0) {
			$deferred.push([atomic.StoreUint32, [new ptrType$2(function() { return this.$target.done; }, function($v) { this.$target.done = $v; }, o), 1]]);
			f();
		}
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); }
	};
	Once.prototype.Do = function(f) { return this.$val.Do(f); };
	poolCleanup = function() {
		var _i, _i$1, _ref, _ref$1, i, i$1, j, l, p, x;
		_ref = allPools;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			p = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			(i < 0 || i >= allPools.$length) ? $throwRuntimeError("index out of range") : allPools.$array[allPools.$offset + i] = ptrType.nil;
			i$1 = 0;
			while (i$1 < (p.localSize >> 0)) {
				l = indexLocal(p.local, i$1);
				l.private$0 = $ifaceNil;
				_ref$1 = l.shared;
				_i$1 = 0;
				while (_i$1 < _ref$1.$length) {
					j = _i$1;
					(x = l.shared, (j < 0 || j >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + j] = $ifaceNil);
					_i$1++;
				}
				l.shared = sliceType$2.nil;
				i$1 = i$1 + (1) >> 0;
			}
			p.local = 0;
			p.localSize = 0;
			_i++;
		}
		allPools = new sliceType([]);
	};
	init = function() {
		runtime_registerPoolCleanup(poolCleanup);
	};
	indexLocal = function(l, i) {
		var x;
		return (x = l, (x.nilCheck, ((i < 0 || i >= x.length) ? $throwRuntimeError("index out of range") : x[i])));
	};
	raceEnable = function() {
	};
	runtime_Semacquire = function() {
		$panic("Native function not implemented: sync.runtime_Semacquire");
	};
	runtime_Semrelease = function() {
		$panic("Native function not implemented: sync.runtime_Semrelease");
	};
	init$1 = function() {
		var s;
		s = $clone(new syncSema.ptr(), syncSema);
		runtime_Syncsemcheck(12);
	};
	RWMutex.ptr.prototype.RLock = function() {
		var rw;
		rw = this;
		if (atomic.AddInt32(new ptrType$3(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw), 1) < 0) {
			runtime_Semacquire(new ptrType$2(function() { return this.$target.readerSem; }, function($v) { this.$target.readerSem = $v; }, rw));
		}
	};
	RWMutex.prototype.RLock = function() { return this.$val.RLock(); };
	RWMutex.ptr.prototype.RUnlock = function() {
		var r, rw;
		rw = this;
		r = atomic.AddInt32(new ptrType$3(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw), -1);
		if (r < 0) {
			if (((r + 1 >> 0) === 0) || ((r + 1 >> 0) === -1073741824)) {
				raceEnable();
				$panic(new $String("sync: RUnlock of unlocked RWMutex"));
			}
			if (atomic.AddInt32(new ptrType$3(function() { return this.$target.readerWait; }, function($v) { this.$target.readerWait = $v; }, rw), -1) === 0) {
				runtime_Semrelease(new ptrType$2(function() { return this.$target.writerSem; }, function($v) { this.$target.writerSem = $v; }, rw));
			}
		}
	};
	RWMutex.prototype.RUnlock = function() { return this.$val.RUnlock(); };
	RWMutex.ptr.prototype.Lock = function() {
		var r, rw;
		rw = this;
		rw.w.Lock();
		r = atomic.AddInt32(new ptrType$3(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw), -1073741824) + 1073741824 >> 0;
		if (!((r === 0)) && !((atomic.AddInt32(new ptrType$3(function() { return this.$target.readerWait; }, function($v) { this.$target.readerWait = $v; }, rw), r) === 0))) {
			runtime_Semacquire(new ptrType$2(function() { return this.$target.writerSem; }, function($v) { this.$target.writerSem = $v; }, rw));
		}
	};
	RWMutex.prototype.Lock = function() { return this.$val.Lock(); };
	RWMutex.ptr.prototype.Unlock = function() {
		var i, r, rw;
		rw = this;
		r = atomic.AddInt32(new ptrType$3(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw), 1073741824);
		if (r >= 1073741824) {
			raceEnable();
			$panic(new $String("sync: Unlock of unlocked RWMutex"));
		}
		i = 0;
		while (i < (r >> 0)) {
			runtime_Semrelease(new ptrType$2(function() { return this.$target.readerSem; }, function($v) { this.$target.readerSem = $v; }, rw));
			i = i + (1) >> 0;
		}
		rw.w.Unlock();
	};
	RWMutex.prototype.Unlock = function() { return this.$val.Unlock(); };
	RWMutex.ptr.prototype.RLocker = function() {
		var rw;
		rw = this;
		return $pointerOfStructConversion(rw, ptrType$7);
	};
	RWMutex.prototype.RLocker = function() { return this.$val.RLocker(); };
	rlocker.ptr.prototype.Lock = function() {
		var r;
		r = this;
		$pointerOfStructConversion(r, ptrType$8).RLock();
	};
	rlocker.prototype.Lock = function() { return this.$val.Lock(); };
	rlocker.ptr.prototype.Unlock = function() {
		var r;
		r = this;
		$pointerOfStructConversion(r, ptrType$8).RUnlock();
	};
	rlocker.prototype.Unlock = function() { return this.$val.Unlock(); };
	ptrType.methods = [{prop: "Get", name: "Get", pkg: "", type: $funcType([], [$emptyInterface], false)}, {prop: "Put", name: "Put", pkg: "", type: $funcType([$emptyInterface], [], false)}, {prop: "getSlow", name: "getSlow", pkg: "sync", type: $funcType([], [$emptyInterface], false)}, {prop: "pin", name: "pin", pkg: "sync", type: $funcType([], [ptrType$5], false)}, {prop: "pinSlow", name: "pinSlow", pkg: "sync", type: $funcType([], [ptrType$5], false)}];
	ptrType$10.methods = [{prop: "Lock", name: "Lock", pkg: "", type: $funcType([], [], false)}, {prop: "Unlock", name: "Unlock", pkg: "", type: $funcType([], [], false)}];
	ptrType$11.methods = [{prop: "Do", name: "Do", pkg: "", type: $funcType([funcType$1], [], false)}];
	ptrType$5.methods = [{prop: "Lock", name: "Lock", pkg: "", type: $funcType([], [], false)}, {prop: "Unlock", name: "Unlock", pkg: "", type: $funcType([], [], false)}];
	ptrType$8.methods = [{prop: "Lock", name: "Lock", pkg: "", type: $funcType([], [], false)}, {prop: "RLock", name: "RLock", pkg: "", type: $funcType([], [], false)}, {prop: "RLocker", name: "RLocker", pkg: "", type: $funcType([], [Locker], false)}, {prop: "RUnlock", name: "RUnlock", pkg: "", type: $funcType([], [], false)}, {prop: "Unlock", name: "Unlock", pkg: "", type: $funcType([], [], false)}];
	ptrType$7.methods = [{prop: "Lock", name: "Lock", pkg: "", type: $funcType([], [], false)}, {prop: "Unlock", name: "Unlock", pkg: "", type: $funcType([], [], false)}];
	Pool.init([{prop: "local", name: "local", pkg: "sync", type: $UnsafePointer, tag: ""}, {prop: "localSize", name: "localSize", pkg: "sync", type: $Uintptr, tag: ""}, {prop: "store", name: "store", pkg: "sync", type: sliceType$2, tag: ""}, {prop: "New", name: "New", pkg: "", type: funcType, tag: ""}]);
	Mutex.init([{prop: "state", name: "state", pkg: "sync", type: $Int32, tag: ""}, {prop: "sema", name: "sema", pkg: "sync", type: $Uint32, tag: ""}]);
	Locker.init([{prop: "Lock", name: "Lock", pkg: "", type: $funcType([], [], false)}, {prop: "Unlock", name: "Unlock", pkg: "", type: $funcType([], [], false)}]);
	Once.init([{prop: "m", name: "m", pkg: "sync", type: Mutex, tag: ""}, {prop: "done", name: "done", pkg: "sync", type: $Uint32, tag: ""}]);
	poolLocal.init([{prop: "private$0", name: "private", pkg: "sync", type: $emptyInterface, tag: ""}, {prop: "shared", name: "shared", pkg: "sync", type: sliceType$2, tag: ""}, {prop: "Mutex", name: "", pkg: "", type: Mutex, tag: ""}, {prop: "pad", name: "pad", pkg: "sync", type: arrayType, tag: ""}]);
	syncSema.init([{prop: "lock", name: "lock", pkg: "sync", type: $Uintptr, tag: ""}, {prop: "head", name: "head", pkg: "sync", type: $UnsafePointer, tag: ""}, {prop: "tail", name: "tail", pkg: "sync", type: $UnsafePointer, tag: ""}]);
	RWMutex.init([{prop: "w", name: "w", pkg: "sync", type: Mutex, tag: ""}, {prop: "writerSem", name: "writerSem", pkg: "sync", type: $Uint32, tag: ""}, {prop: "readerSem", name: "readerSem", pkg: "sync", type: $Uint32, tag: ""}, {prop: "readerCount", name: "readerCount", pkg: "sync", type: $Int32, tag: ""}, {prop: "readerWait", name: "readerWait", pkg: "sync", type: $Int32, tag: ""}]);
	rlocker.init([{prop: "w", name: "w", pkg: "sync", type: Mutex, tag: ""}, {prop: "writerSem", name: "writerSem", pkg: "sync", type: $Uint32, tag: ""}, {prop: "readerSem", name: "readerSem", pkg: "sync", type: $Uint32, tag: ""}, {prop: "readerCount", name: "readerCount", pkg: "sync", type: $Int32, tag: ""}, {prop: "readerWait", name: "readerWait", pkg: "sync", type: $Int32, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_sync = function() { while (true) { switch ($s) { case 0:
		$r = runtime.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$r = atomic.$init($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		allPools = sliceType.nil;
		init();
		init$1();
		/* */ } return; } }; $init_sync.$blocking = true; return $init_sync;
	};
	return $pkg;
})();
$packages["io"] = (function() {
	var $pkg = {}, errors, runtime, sync, errWhence, errOffset;
	errors = $packages["errors"];
	runtime = $packages["runtime"];
	sync = $packages["sync"];
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_io = function() { while (true) { switch ($s) { case 0:
		$r = errors.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$r = runtime.$init($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		$r = sync.$init($BLOCKING); /* */ $s = 3; case 3: if ($r && $r.$blocking) { $r = $r(); }
		$pkg.ErrShortWrite = errors.New("short write");
		$pkg.ErrShortBuffer = errors.New("short buffer");
		$pkg.EOF = errors.New("EOF");
		$pkg.ErrUnexpectedEOF = errors.New("unexpected EOF");
		$pkg.ErrNoProgress = errors.New("multiple Read calls return no data or error");
		errWhence = errors.New("Seek: invalid whence");
		errOffset = errors.New("Seek: invalid offset");
		$pkg.ErrClosedPipe = errors.New("io: read/write on closed pipe");
		/* */ } return; } }; $init_io.$blocking = true; return $init_io;
	};
	return $pkg;
})();
$packages["unicode"] = (function() {
	var $pkg = {};
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_unicode = function() { while (true) { switch ($s) { case 0:
		/* */ } return; } }; $init_unicode.$blocking = true; return $init_unicode;
	};
	return $pkg;
})();
$packages["strings"] = (function() {
	var $pkg = {}, errors, js, io, unicode, utf8, sliceType$3, IndexByte, explode, hashStr, Count, Index, genSplit, SplitN, Split;
	errors = $packages["errors"];
	js = $packages["github.com/gopherjs/gopherjs/js"];
	io = $packages["io"];
	unicode = $packages["unicode"];
	utf8 = $packages["unicode/utf8"];
		sliceType$3 = $sliceType($String);
	IndexByte = $pkg.IndexByte = function(s, c) {
		return $parseInt(s.indexOf($global.String.fromCharCode(c))) >> 0;
	};
	explode = function(s, n) {
		var _tmp, _tmp$1, _tuple, a, ch, cur, i, l, size;
		if (n === 0) {
			return sliceType$3.nil;
		}
		l = utf8.RuneCountInString(s);
		if (n <= 0 || n > l) {
			n = l;
		}
		a = $makeSlice(sliceType$3, n);
		size = 0;
		ch = 0;
		_tmp = 0; _tmp$1 = 0; i = _tmp; cur = _tmp$1;
		while ((i + 1 >> 0) < n) {
			_tuple = utf8.DecodeRuneInString(s.substring(cur)); ch = _tuple[0]; size = _tuple[1];
			if (ch === 65533) {
				(i < 0 || i >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + i] = "\xEF\xBF\xBD";
			} else {
				(i < 0 || i >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + i] = s.substring(cur, (cur + size >> 0));
			}
			cur = cur + (size) >> 0;
			i = i + (1) >> 0;
		}
		if (cur < s.length) {
			(i < 0 || i >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + i] = s.substring(cur);
		}
		return a;
	};
	hashStr = function(sep) {
		var _tmp, _tmp$1, hash, i, i$1, pow, sq, x, x$1;
		hash = 0;
		i = 0;
		while (i < sep.length) {
			hash = ((((hash >>> 16 << 16) * 16777619 >>> 0) + (hash << 16 >>> 16) * 16777619) >>> 0) + (sep.charCodeAt(i) >>> 0) >>> 0;
			i = i + (1) >> 0;
		}
		_tmp = 1; _tmp$1 = 16777619; pow = _tmp; sq = _tmp$1;
		i$1 = sep.length;
		while (i$1 > 0) {
			if (!(((i$1 & 1) === 0))) {
				pow = (x = sq, (((pow >>> 16 << 16) * x >>> 0) + (pow << 16 >>> 16) * x) >>> 0);
			}
			sq = (x$1 = sq, (((sq >>> 16 << 16) * x$1 >>> 0) + (sq << 16 >>> 16) * x$1) >>> 0);
			i$1 = (i$1 >> $min((1), 31)) >> 0;
		}
		return [hash, pow];
	};
	Count = $pkg.Count = function(s, sep) {
		var _tuple, c, h, hashsep, i, i$1, i$2, lastmatch, n, pow, x, x$1;
		n = 0;
		if (sep.length === 0) {
			return utf8.RuneCountInString(s) + 1 >> 0;
		} else if (sep.length === 1) {
			c = sep.charCodeAt(0);
			i = 0;
			while (i < s.length) {
				if (s.charCodeAt(i) === c) {
					n = n + (1) >> 0;
				}
				i = i + (1) >> 0;
			}
			return n;
		} else if (sep.length > s.length) {
			return 0;
		} else if (sep.length === s.length) {
			if (sep === s) {
				return 1;
			}
			return 0;
		}
		_tuple = hashStr(sep); hashsep = _tuple[0]; pow = _tuple[1];
		h = 0;
		i$1 = 0;
		while (i$1 < sep.length) {
			h = ((((h >>> 16 << 16) * 16777619 >>> 0) + (h << 16 >>> 16) * 16777619) >>> 0) + (s.charCodeAt(i$1) >>> 0) >>> 0;
			i$1 = i$1 + (1) >> 0;
		}
		lastmatch = 0;
		if ((h === hashsep) && s.substring(0, sep.length) === sep) {
			n = n + (1) >> 0;
			lastmatch = sep.length;
		}
		i$2 = sep.length;
		while (i$2 < s.length) {
			h = (x = 16777619, (((h >>> 16 << 16) * x >>> 0) + (h << 16 >>> 16) * x) >>> 0);
			h = h + ((s.charCodeAt(i$2) >>> 0)) >>> 0;
			h = h - ((x$1 = (s.charCodeAt((i$2 - sep.length >> 0)) >>> 0), (((pow >>> 16 << 16) * x$1 >>> 0) + (pow << 16 >>> 16) * x$1) >>> 0)) >>> 0;
			i$2 = i$2 + (1) >> 0;
			if ((h === hashsep) && lastmatch <= (i$2 - sep.length >> 0) && s.substring((i$2 - sep.length >> 0), i$2) === sep) {
				n = n + (1) >> 0;
				lastmatch = i$2;
			}
		}
		return n;
	};
	Index = $pkg.Index = function(s, sep) {
		var _tuple, h, hashsep, i, i$1, n, pow, x, x$1;
		n = sep.length;
		if (n === 0) {
			return 0;
		} else if (n === 1) {
			return IndexByte(s, sep.charCodeAt(0));
		} else if (n === s.length) {
			if (sep === s) {
				return 0;
			}
			return -1;
		} else if (n > s.length) {
			return -1;
		}
		_tuple = hashStr(sep); hashsep = _tuple[0]; pow = _tuple[1];
		h = 0;
		i = 0;
		while (i < n) {
			h = ((((h >>> 16 << 16) * 16777619 >>> 0) + (h << 16 >>> 16) * 16777619) >>> 0) + (s.charCodeAt(i) >>> 0) >>> 0;
			i = i + (1) >> 0;
		}
		if ((h === hashsep) && s.substring(0, n) === sep) {
			return 0;
		}
		i$1 = n;
		while (i$1 < s.length) {
			h = (x = 16777619, (((h >>> 16 << 16) * x >>> 0) + (h << 16 >>> 16) * x) >>> 0);
			h = h + ((s.charCodeAt(i$1) >>> 0)) >>> 0;
			h = h - ((x$1 = (s.charCodeAt((i$1 - n >> 0)) >>> 0), (((pow >>> 16 << 16) * x$1 >>> 0) + (pow << 16 >>> 16) * x$1) >>> 0)) >>> 0;
			i$1 = i$1 + (1) >> 0;
			if ((h === hashsep) && s.substring((i$1 - n >> 0), i$1) === sep) {
				return i$1 - n >> 0;
			}
		}
		return -1;
	};
	genSplit = function(s, sep, sepSave, n) {
		var a, c, i, na, start;
		if (n === 0) {
			return sliceType$3.nil;
		}
		if (sep === "") {
			return explode(s, n);
		}
		if (n < 0) {
			n = Count(s, sep) + 1 >> 0;
		}
		c = sep.charCodeAt(0);
		start = 0;
		a = $makeSlice(sliceType$3, n);
		na = 0;
		i = 0;
		while ((i + sep.length >> 0) <= s.length && (na + 1 >> 0) < n) {
			if ((s.charCodeAt(i) === c) && ((sep.length === 1) || s.substring(i, (i + sep.length >> 0)) === sep)) {
				(na < 0 || na >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + na] = s.substring(start, (i + sepSave >> 0));
				na = na + (1) >> 0;
				start = i + sep.length >> 0;
				i = i + ((sep.length - 1 >> 0)) >> 0;
			}
			i = i + (1) >> 0;
		}
		(na < 0 || na >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + na] = s.substring(start);
		return $subslice(a, 0, (na + 1 >> 0));
	};
	SplitN = $pkg.SplitN = function(s, sep, n) {
		return genSplit(s, sep, 0, n);
	};
	Split = $pkg.Split = function(s, sep) {
		return genSplit(s, sep, 0, -1);
	};
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_strings = function() { while (true) { switch ($s) { case 0:
		$r = errors.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$r = js.$init($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		$r = io.$init($BLOCKING); /* */ $s = 3; case 3: if ($r && $r.$blocking) { $r = $r(); }
		$r = unicode.$init($BLOCKING); /* */ $s = 4; case 4: if ($r && $r.$blocking) { $r = $r(); }
		$r = utf8.$init($BLOCKING); /* */ $s = 5; case 5: if ($r && $r.$blocking) { $r = $r(); }
		/* */ } return; } }; $init_strings.$blocking = true; return $init_strings;
	};
	return $pkg;
})();
$packages["github.com/gopherjs/gopherjs/nosync"] = (function() {
	var $pkg = {};
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_nosync = function() { while (true) { switch ($s) { case 0:
		/* */ } return; } }; $init_nosync.$blocking = true; return $init_nosync;
	};
	return $pkg;
})();
$packages["bytes"] = (function() {
	var $pkg = {}, errors, io, unicode, utf8, IndexByte;
	errors = $packages["errors"];
	io = $packages["io"];
	unicode = $packages["unicode"];
	utf8 = $packages["unicode/utf8"];
	IndexByte = $pkg.IndexByte = function(s, c) {
		var _i, _ref, b, i;
		_ref = s;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			b = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			if (b === c) {
				return i;
			}
			_i++;
		}
		return -1;
	};
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_bytes = function() { while (true) { switch ($s) { case 0:
		$r = errors.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$r = io.$init($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		$r = unicode.$init($BLOCKING); /* */ $s = 3; case 3: if ($r && $r.$blocking) { $r = $r(); }
		$r = utf8.$init($BLOCKING); /* */ $s = 4; case 4: if ($r && $r.$blocking) { $r = $r(); }
		$pkg.ErrTooLarge = errors.New("bytes.Buffer: too large");
		/* */ } return; } }; $init_bytes.$blocking = true; return $init_bytes;
	};
	return $pkg;
})();
$packages["syscall"] = (function() {
	var $pkg = {}, bytes, errors, js, runtime, sync, mmapper, Errno, sliceType, sliceType$1, ptrType, ptrType$5, arrayType$2, structType, ptrType$24, mapType, funcType, funcType$1, warningPrinted, lineBuffer, syscallModule, alreadyTriedToLoad, minusOne, envOnce, envLock, env, envs, mapper, errors$1, init, printWarning, printToConsole, runtime_envs, syscall, Syscall, Syscall6, copyenv, Getenv, itoa, uitoa, mmap, munmap;
	bytes = $packages["bytes"];
	errors = $packages["errors"];
	js = $packages["github.com/gopherjs/gopherjs/js"];
	runtime = $packages["runtime"];
	sync = $packages["sync"];
	mmapper = $pkg.mmapper = $newType(0, $kindStruct, "syscall.mmapper", "mmapper", "syscall", function(Mutex_, active_, mmap_, munmap_) {
		this.$val = this;
		this.Mutex = Mutex_ !== undefined ? Mutex_ : new sync.Mutex.ptr();
		this.active = active_ !== undefined ? active_ : false;
		this.mmap = mmap_ !== undefined ? mmap_ : $throwNilPointerError;
		this.munmap = munmap_ !== undefined ? munmap_ : $throwNilPointerError;
	});
	Errno = $pkg.Errno = $newType(4, $kindUintptr, "syscall.Errno", "Errno", "syscall", null);
		sliceType = $sliceType($Uint8);
		sliceType$1 = $sliceType($String);
		ptrType = $ptrType($Uint8);
		ptrType$5 = $ptrType(Errno);
		arrayType$2 = $arrayType($Uint8, 32);
		structType = $structType([{prop: "addr", name: "addr", pkg: "syscall", type: $Uintptr, tag: ""}, {prop: "len", name: "len", pkg: "syscall", type: $Int, tag: ""}, {prop: "cap", name: "cap", pkg: "syscall", type: $Int, tag: ""}]);
		ptrType$24 = $ptrType(mmapper);
		mapType = $mapType(ptrType, sliceType);
		funcType = $funcType([$Uintptr, $Uintptr, $Int, $Int, $Int, $Int64], [$Uintptr, $error], false);
		funcType$1 = $funcType([$Uintptr, $Uintptr], [$error], false);
	init = function() {
		$flushConsole = (function() {
			if (!((lineBuffer.$length === 0))) {
				$global.console.log($externalize($bytesToString(lineBuffer), $String));
				lineBuffer = sliceType.nil;
			}
		});
	};
	printWarning = function() {
		if (!warningPrinted) {
			console.log("warning: system calls not available, see https://github.com/gopherjs/gopherjs/blob/master/doc/syscalls.md");
		}
		warningPrinted = true;
	};
	printToConsole = function(b) {
		var goPrintToConsole, i;
		goPrintToConsole = $global.goPrintToConsole;
		if (!(goPrintToConsole === undefined)) {
			goPrintToConsole(b);
			return;
		}
		lineBuffer = $appendSlice(lineBuffer, b);
		while (true) {
			i = bytes.IndexByte(lineBuffer, 10);
			if (i === -1) {
				break;
			}
			$global.console.log($externalize($bytesToString($subslice(lineBuffer, 0, i)), $String));
			lineBuffer = $subslice(lineBuffer, (i + 1 >> 0));
		}
	};
	runtime_envs = function() {
		var envkeys, envs$1, i, jsEnv, key, process;
		process = $global.process;
		if (process === undefined) {
			return sliceType$1.nil;
		}
		jsEnv = process.env;
		envkeys = $global.Object.keys(jsEnv);
		envs$1 = $makeSlice(sliceType$1, $parseInt(envkeys.length));
		i = 0;
		while (i < $parseInt(envkeys.length)) {
			key = $internalize(envkeys[i], $String);
			(i < 0 || i >= envs$1.$length) ? $throwRuntimeError("index out of range") : envs$1.$array[envs$1.$offset + i] = key + "=" + $internalize(jsEnv[$externalize(key, $String)], $String);
			i = i + (1) >> 0;
		}
		return envs$1;
	};
	syscall = function(name) {
		var $deferred = [], $err = null, require;
		/* */ try { $deferFrames.push($deferred);
		$deferred.push([(function() {
			$recover();
		}), []]);
		if (syscallModule === null) {
			if (alreadyTriedToLoad) {
				return null;
			}
			alreadyTriedToLoad = true;
			require = $global.require;
			if (require === undefined) {
				$panic(new $String(""));
			}
			syscallModule = require($externalize("syscall", $String));
		}
		return syscallModule[$externalize(name, $String)];
		/* */ } catch(err) { $err = err; return null; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); }
	};
	Syscall = $pkg.Syscall = function(trap, a1, a2, a3) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, array, err = 0, f, r, r1 = 0, r2 = 0, slice;
		f = syscall("Syscall");
		if (!(f === null)) {
			r = f(trap, a1, a2, a3);
			_tmp = (($parseInt(r[0]) >> 0) >>> 0); _tmp$1 = (($parseInt(r[1]) >> 0) >>> 0); _tmp$2 = (($parseInt(r[2]) >> 0) >>> 0); r1 = _tmp; r2 = _tmp$1; err = _tmp$2;
			return [r1, r2, err];
		}
		if ((trap === 4) && ((a1 === 1) || (a1 === 2))) {
			array = a2;
			slice = $makeSlice(sliceType, $parseInt(array.length));
			slice.$array = array;
			printToConsole(slice);
			_tmp$3 = ($parseInt(array.length) >>> 0); _tmp$4 = 0; _tmp$5 = 0; r1 = _tmp$3; r2 = _tmp$4; err = _tmp$5;
			return [r1, r2, err];
		}
		printWarning();
		_tmp$6 = (minusOne >>> 0); _tmp$7 = 0; _tmp$8 = 13; r1 = _tmp$6; r2 = _tmp$7; err = _tmp$8;
		return [r1, r2, err];
	};
	Syscall6 = $pkg.Syscall6 = function(trap, a1, a2, a3, a4, a5, a6) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, err = 0, f, r, r1 = 0, r2 = 0;
		f = syscall("Syscall6");
		if (!(f === null)) {
			r = f(trap, a1, a2, a3, a4, a5, a6);
			_tmp = (($parseInt(r[0]) >> 0) >>> 0); _tmp$1 = (($parseInt(r[1]) >> 0) >>> 0); _tmp$2 = (($parseInt(r[2]) >> 0) >>> 0); r1 = _tmp; r2 = _tmp$1; err = _tmp$2;
			return [r1, r2, err];
		}
		if (!((trap === 202))) {
			printWarning();
		}
		_tmp$3 = (minusOne >>> 0); _tmp$4 = 0; _tmp$5 = 13; r1 = _tmp$3; r2 = _tmp$4; err = _tmp$5;
		return [r1, r2, err];
	};
	copyenv = function() {
		var _entry, _i, _key, _ref, _tuple, i, j, key, ok, s;
		env = new $Map();
		_ref = envs;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			s = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			j = 0;
			while (j < s.length) {
				if (s.charCodeAt(j) === 61) {
					key = s.substring(0, j);
					_tuple = (_entry = env[key], _entry !== undefined ? [_entry.v, true] : [0, false]); ok = _tuple[1];
					if (!ok) {
						_key = key; (env || $throwRuntimeError("assignment to entry in nil map"))[_key] = { k: _key, v: i };
					} else {
						(i < 0 || i >= envs.$length) ? $throwRuntimeError("index out of range") : envs.$array[envs.$offset + i] = "";
					}
					break;
				}
				j = j + (1) >> 0;
			}
			_i++;
		}
	};
	Getenv = $pkg.Getenv = function(key) {
		var $deferred = [], $err = null, _entry, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tuple, found = false, i, i$1, ok, s, value = "";
		/* */ try { $deferFrames.push($deferred);
		envOnce.Do(copyenv);
		if (key.length === 0) {
			_tmp = ""; _tmp$1 = false; value = _tmp; found = _tmp$1;
			return [value, found];
		}
		envLock.RLock();
		$deferred.push([$methodVal(envLock, "RUnlock"), []]);
		_tuple = (_entry = env[key], _entry !== undefined ? [_entry.v, true] : [0, false]); i = _tuple[0]; ok = _tuple[1];
		if (!ok) {
			_tmp$2 = ""; _tmp$3 = false; value = _tmp$2; found = _tmp$3;
			return [value, found];
		}
		s = ((i < 0 || i >= envs.$length) ? $throwRuntimeError("index out of range") : envs.$array[envs.$offset + i]);
		i$1 = 0;
		while (i$1 < s.length) {
			if (s.charCodeAt(i$1) === 61) {
				_tmp$4 = s.substring((i$1 + 1 >> 0)); _tmp$5 = true; value = _tmp$4; found = _tmp$5;
				return [value, found];
			}
			i$1 = i$1 + (1) >> 0;
		}
		_tmp$6 = ""; _tmp$7 = false; value = _tmp$6; found = _tmp$7;
		return [value, found];
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); return [value, found]; }
	};
	itoa = function(val) {
		if (val < 0) {
			return "-" + uitoa((-val >>> 0));
		}
		return uitoa((val >>> 0));
	};
	uitoa = function(val) {
		var _q, _r, buf, i;
		buf = $clone(arrayType$2.zero(), arrayType$2);
		i = 31;
		while (val >= 10) {
			(i < 0 || i >= buf.length) ? $throwRuntimeError("index out of range") : buf[i] = (((_r = val % 10, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) + 48 >>> 0) << 24 >>> 24);
			i = i - (1) >> 0;
			val = (_q = val / (10), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
		}
		(i < 0 || i >= buf.length) ? $throwRuntimeError("index out of range") : buf[i] = ((val + 48 >>> 0) << 24 >>> 24);
		return $bytesToString($subslice(new sliceType(buf), i));
	};
	mmapper.ptr.prototype.Mmap = function(fd, offset, length, prot, flags) {
		var $deferred = [], $err = null, _key, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tuple, addr, b, data = sliceType.nil, err = $ifaceNil, errno, m, p, sl, x, x$1;
		/* */ try { $deferFrames.push($deferred);
		m = this;
		if (length <= 0) {
			_tmp = sliceType.nil; _tmp$1 = new Errno(22); data = _tmp; err = _tmp$1;
			return [data, err];
		}
		_tuple = m.mmap(0, (length >>> 0), prot, flags, fd, offset); addr = _tuple[0]; errno = _tuple[1];
		if (!($interfaceIsEqual(errno, $ifaceNil))) {
			_tmp$2 = sliceType.nil; _tmp$3 = errno; data = _tmp$2; err = _tmp$3;
			return [data, err];
		}
		sl = new structType.ptr(addr, length, length);
		b = sl;
		p = new ptrType(function() { return (x$1 = b.$capacity - 1 >> 0, ((x$1 < 0 || x$1 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + x$1])); }, function($v) { (x = b.$capacity - 1 >> 0, (x < 0 || x >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + x] = $v); }, b);
		m.Mutex.Lock();
		$deferred.push([$methodVal(m.Mutex, "Unlock"), []]);
		_key = p; (m.active || $throwRuntimeError("assignment to entry in nil map"))[_key.$key()] = { k: _key, v: b };
		_tmp$4 = b; _tmp$5 = $ifaceNil; data = _tmp$4; err = _tmp$5;
		return [data, err];
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); return [data, err]; }
	};
	mmapper.prototype.Mmap = function(fd, offset, length, prot, flags) { return this.$val.Mmap(fd, offset, length, prot, flags); };
	mmapper.ptr.prototype.Munmap = function(data) {
		var $deferred = [], $err = null, _entry, b, err = $ifaceNil, errno, m, p, x, x$1;
		/* */ try { $deferFrames.push($deferred);
		m = this;
		if ((data.$length === 0) || !((data.$length === data.$capacity))) {
			err = new Errno(22);
			return err;
		}
		p = new ptrType(function() { return (x$1 = data.$capacity - 1 >> 0, ((x$1 < 0 || x$1 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + x$1])); }, function($v) { (x = data.$capacity - 1 >> 0, (x < 0 || x >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + x] = $v); }, data);
		m.Mutex.Lock();
		$deferred.push([$methodVal(m.Mutex, "Unlock"), []]);
		b = (_entry = m.active[p.$key()], _entry !== undefined ? _entry.v : sliceType.nil);
		if (b === sliceType.nil || !($pointerIsEqual(new ptrType(function() { return ((0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0]); }, function($v) { (0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0] = $v; }, b), new ptrType(function() { return ((0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0]); }, function($v) { (0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0] = $v; }, data)))) {
			err = new Errno(22);
			return err;
		}
		errno = m.munmap($sliceToArray(b), (b.$length >>> 0));
		if (!($interfaceIsEqual(errno, $ifaceNil))) {
			err = errno;
			return err;
		}
		delete m.active[p.$key()];
		err = $ifaceNil;
		return err;
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); return err; }
	};
	mmapper.prototype.Munmap = function(data) { return this.$val.Munmap(data); };
	Errno.prototype.Error = function() {
		var e, s;
		e = this.$val;
		if (0 <= (e >> 0) && (e >> 0) < 106) {
			s = ((e < 0 || e >= errors$1.length) ? $throwRuntimeError("index out of range") : errors$1[e]);
			if (!(s === "")) {
				return s;
			}
		}
		return "errno " + itoa((e >> 0));
	};
	$ptrType(Errno).prototype.Error = function() { return new Errno(this.$get()).Error(); };
	Errno.prototype.Temporary = function() {
		var e;
		e = this.$val;
		return (e === 4) || (e === 24) || (e === 54) || (e === 53) || new Errno(e).Timeout();
	};
	$ptrType(Errno).prototype.Temporary = function() { return new Errno(this.$get()).Temporary(); };
	Errno.prototype.Timeout = function() {
		var e;
		e = this.$val;
		return (e === 35) || (e === 35) || (e === 60);
	};
	$ptrType(Errno).prototype.Timeout = function() { return new Errno(this.$get()).Timeout(); };
	mmap = function(addr, length, prot, flag, fd, pos) {
		var _tuple, e1, err = $ifaceNil, r0, ret = 0;
		_tuple = Syscall6(197, addr, length, (prot >>> 0), (flag >>> 0), (fd >>> 0), (pos.$low >>> 0)); r0 = _tuple[0]; e1 = _tuple[2];
		ret = r0;
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return [ret, err];
	};
	munmap = function(addr, length) {
		var _tuple, e1, err = $ifaceNil;
		_tuple = Syscall(73, addr, length, 0); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	ptrType$24.methods = [{prop: "Lock", name: "Lock", pkg: "", type: $funcType([], [], false)}, {prop: "Mmap", name: "Mmap", pkg: "", type: $funcType([$Int, $Int64, $Int, $Int, $Int], [sliceType, $error], false)}, {prop: "Munmap", name: "Munmap", pkg: "", type: $funcType([sliceType], [$error], false)}, {prop: "Unlock", name: "Unlock", pkg: "", type: $funcType([], [], false)}];
	Errno.methods = [{prop: "Error", name: "Error", pkg: "", type: $funcType([], [$String], false)}, {prop: "Temporary", name: "Temporary", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Timeout", name: "Timeout", pkg: "", type: $funcType([], [$Bool], false)}];
	ptrType$5.methods = [{prop: "Error", name: "Error", pkg: "", type: $funcType([], [$String], false)}, {prop: "Temporary", name: "Temporary", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Timeout", name: "Timeout", pkg: "", type: $funcType([], [$Bool], false)}];
	mmapper.init([{prop: "Mutex", name: "", pkg: "", type: sync.Mutex, tag: ""}, {prop: "active", name: "active", pkg: "syscall", type: mapType, tag: ""}, {prop: "mmap", name: "mmap", pkg: "syscall", type: funcType, tag: ""}, {prop: "munmap", name: "munmap", pkg: "syscall", type: funcType$1, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_syscall = function() { while (true) { switch ($s) { case 0:
		$r = bytes.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$r = errors.$init($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		$r = js.$init($BLOCKING); /* */ $s = 3; case 3: if ($r && $r.$blocking) { $r = $r(); }
		$r = runtime.$init($BLOCKING); /* */ $s = 4; case 4: if ($r && $r.$blocking) { $r = $r(); }
		$r = sync.$init($BLOCKING); /* */ $s = 5; case 5: if ($r && $r.$blocking) { $r = $r(); }
		lineBuffer = sliceType.nil;
		syscallModule = null;
		envOnce = new sync.Once.ptr();
		envLock = new sync.RWMutex.ptr();
		env = false;
		warningPrinted = false;
		alreadyTriedToLoad = false;
		minusOne = -1;
		envs = runtime_envs();
		errors$1 = $toNativeArray($kindString, ["", "operation not permitted", "no such file or directory", "no such process", "interrupted system call", "input/output error", "device not configured", "argument list too long", "exec format error", "bad file descriptor", "no child processes", "resource deadlock avoided", "cannot allocate memory", "permission denied", "bad address", "block device required", "resource busy", "file exists", "cross-device link", "operation not supported by device", "not a directory", "is a directory", "invalid argument", "too many open files in system", "too many open files", "inappropriate ioctl for device", "text file busy", "file too large", "no space left on device", "illegal seek", "read-only file system", "too many links", "broken pipe", "numerical argument out of domain", "result too large", "resource temporarily unavailable", "operation now in progress", "operation already in progress", "socket operation on non-socket", "destination address required", "message too long", "protocol wrong type for socket", "protocol not available", "protocol not supported", "socket type not supported", "operation not supported", "protocol family not supported", "address family not supported by protocol family", "address already in use", "can't assign requested address", "network is down", "network is unreachable", "network dropped connection on reset", "software caused connection abort", "connection reset by peer", "no buffer space available", "socket is already connected", "socket is not connected", "can't send after socket shutdown", "too many references: can't splice", "operation timed out", "connection refused", "too many levels of symbolic links", "file name too long", "host is down", "no route to host", "directory not empty", "too many processes", "too many users", "disc quota exceeded", "stale NFS file handle", "too many levels of remote in path", "RPC struct is bad", "RPC version wrong", "RPC prog. not avail", "program version wrong", "bad procedure for program", "no locks available", "function not implemented", "inappropriate file type or format", "authentication error", "need authenticator", "device power is off", "device error", "value too large to be stored in data type", "bad executable (or shared library)", "bad CPU type in executable", "shared library version mismatch", "malformed Mach-o file", "operation canceled", "identifier removed", "no message of desired type", "illegal byte sequence", "attribute not found", "bad message", "EMULTIHOP (Reserved)", "no message available on STREAM", "ENOLINK (Reserved)", "no STREAM resources", "not a STREAM", "protocol error", "STREAM ioctl timeout", "operation not supported on socket", "policy not found", "state not recoverable", "previous owner died"]);
		mapper = new mmapper.ptr(new sync.Mutex.ptr(), new $Map(), mmap, munmap);
		init();
		/* */ } return; } }; $init_syscall.$blocking = true; return $init_syscall;
	};
	return $pkg;
})();
$packages["time"] = (function() {
	var $pkg = {}, errors, js, nosync, runtime, strings, syscall, sliceType, atoiError, errBad, errLeadingInt, zoneinfo, badData, zoneDirs, _tuple;
	errors = $packages["errors"];
	js = $packages["github.com/gopherjs/gopherjs/js"];
	nosync = $packages["github.com/gopherjs/gopherjs/nosync"];
	runtime = $packages["runtime"];
	strings = $packages["strings"];
	syscall = $packages["syscall"];
		sliceType = $sliceType($String);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_time = function() { while (true) { switch ($s) { case 0:
		$r = errors.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$r = js.$init($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		$r = nosync.$init($BLOCKING); /* */ $s = 3; case 3: if ($r && $r.$blocking) { $r = $r(); }
		$r = runtime.$init($BLOCKING); /* */ $s = 4; case 4: if ($r && $r.$blocking) { $r = $r(); }
		$r = strings.$init($BLOCKING); /* */ $s = 5; case 5: if ($r && $r.$blocking) { $r = $r(); }
		$r = syscall.$init($BLOCKING); /* */ $s = 6; case 6: if ($r && $r.$blocking) { $r = $r(); }
		atoiError = errors.New("time: invalid number");
		errBad = errors.New("bad value for field");
		errLeadingInt = errors.New("time: bad [0-9]*");
		_tuple = syscall.Getenv("ZONEINFO"); zoneinfo = _tuple[0];
		badData = errors.New("malformed time zone information");
		zoneDirs = new sliceType(["/usr/share/zoneinfo/", "/usr/share/lib/zoneinfo/", "/usr/lib/locale/TZ/", runtime.GOROOT() + "/lib/time/zoneinfo.zip"]);
		/* */ } return; } }; $init_time.$blocking = true; return $init_time;
	};
	return $pkg;
})();
$packages["github.com/albrow/gopherjs-router"] = (function() {
	var $pkg = {}, js, strconv, strings, time, Router, funcType, sliceType, funcType$1, ptrType, mapType, getHash, setHash, New;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	strconv = $packages["strconv"];
	strings = $packages["strings"];
	time = $packages["time"];
	Router = $pkg.Router = $newType(0, $kindStruct, "router.Router", "Router", "github.com/albrow/gopherjs-router", function(routes_) {
		this.$val = this;
		this.routes = routes_ !== undefined ? routes_ : false;
	});
		funcType = $funcType([], [], false);
		sliceType = $sliceType($Int);
		funcType$1 = $funcType([sliceType], [], true);
		ptrType = $ptrType(Router);
		mapType = $mapType($String, funcType$1);
	getHash = function() {
		return $internalize($global.location.hash, $String);
	};
	setHash = function(param) {
		$global.location.hash = $externalize("/", $String);
	};
	New = $pkg.New = function() {
		var _key, _map;
		return new Router.ptr((_map = new $Map(), _map));
	};
	Router.ptr.prototype.HandleFunc = function(path, f) {
		var _key, r;
		r = this;
		_key = path; (r.routes || $throwRuntimeError("assignment to entry in nil map"))[_key] = { k: _key, v: f };
	};
	Router.prototype.HandleFunc = function(path, f) { return this.$val.HandleFunc(path, f); };
	Router.ptr.prototype.Start = function() {
		var r;
		r = this;
		r.setInitialHash();
		r.watchHash();
	};
	Router.prototype.Start = function() { return this.$val.Start(); };
	Router.ptr.prototype.setInitialHash = function() {
		var hash, r;
		r = this;
		hash = getHash();
		if (hash === "") {
			setHash("/");
		} else {
			r.hashChanged(hash);
		}
	};
	Router.prototype.setInitialHash = function() { return this.$val.setInitialHash(); };
	Router.ptr.prototype.watchHash = function() {
		var r;
		r = this;
		$global.onhashchange = $externalize((function() {
			r.hashChanged(getHash());
		}), funcType);
	};
	Router.prototype.watchHash = function() { return this.$val.watchHash(); };
	Router.ptr.prototype.hashChanged = function(hash) {
		var _entry, _tuple, _tuple$1, err, f, found, i, id, path, pathParts, r, x;
		r = this;
		path = (x = strings.SplitN(hash, "#", 2), ((1 < 0 || 1 >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + 1]));
		id = 0;
		err = $ifaceNil;
		i = strings.Index(path.substring(1), "/");
		if (!((i === -1))) {
			pathParts = strings.Split(path, "/");
			_tuple = strconv.Atoi(((2 < 0 || 2 >= pathParts.$length) ? $throwRuntimeError("index out of range") : pathParts.$array[pathParts.$offset + 2])); id = _tuple[0]; err = _tuple[1];
			if (!($interfaceIsEqual(err, $ifaceNil))) {
				$panic(err);
			}
			path = "/" + ((1 < 0 || 1 >= pathParts.$length) ? $throwRuntimeError("index out of range") : pathParts.$array[pathParts.$offset + 1]) + "/:id";
		}
		_tuple$1 = (_entry = r.routes[path], _entry !== undefined ? [_entry.v, true] : [$throwNilPointerError, false]); f = _tuple$1[0]; found = _tuple$1[1];
		if (found) {
			f(new sliceType([id]));
		}
	};
	Router.prototype.hashChanged = function(hash) { return this.$val.hashChanged(hash); };
	ptrType.methods = [{prop: "HandleFunc", name: "HandleFunc", pkg: "", type: $funcType([$String, funcType$1], [], false)}, {prop: "Start", name: "Start", pkg: "", type: $funcType([], [], false)}, {prop: "hashChanged", name: "hashChanged", pkg: "github.com/albrow/gopherjs-router", type: $funcType([$String], [], false)}, {prop: "legacyWatchHash", name: "legacyWatchHash", pkg: "github.com/albrow/gopherjs-router", type: $funcType([], [], false)}, {prop: "setInitialHash", name: "setInitialHash", pkg: "github.com/albrow/gopherjs-router", type: $funcType([], [], false)}, {prop: "watchHash", name: "watchHash", pkg: "github.com/albrow/gopherjs-router", type: $funcType([], [], false)}];
	Router.init([{prop: "routes", name: "routes", pkg: "github.com/albrow/gopherjs-router", type: mapType, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_router = function() { while (true) { switch ($s) { case 0:
		$r = js.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$r = strconv.$init($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		$r = strings.$init($BLOCKING); /* */ $s = 3; case 3: if ($r && $r.$blocking) { $r = $r(); }
		$r = time.$init($BLOCKING); /* */ $s = 4; case 4: if ($r && $r.$blocking) { $r = $r(); }
		/* */ } return; } }; $init_router.$blocking = true; return $init_router;
	};
	return $pkg;
})();
$packages["github.com/gopherjs/jquery"] = (function() {
	var $pkg = {}, js, JQuery, JQueryCoordinates, sliceType, funcType$1, mapType, sliceType$1, funcType$2, funcType$3, sliceType$2, ptrType, NewJQuery;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	JQuery = $pkg.JQuery = $newType(0, $kindStruct, "jquery.JQuery", "JQuery", "github.com/gopherjs/jquery", function(o_, Jquery_, Selector_, Length_, Context_) {
		this.$val = this;
		this.o = o_ !== undefined ? o_ : null;
		this.Jquery = Jquery_ !== undefined ? Jquery_ : "";
		this.Selector = Selector_ !== undefined ? Selector_ : "";
		this.Length = Length_ !== undefined ? Length_ : 0;
		this.Context = Context_ !== undefined ? Context_ : "";
	});
	JQueryCoordinates = $pkg.JQueryCoordinates = $newType(0, $kindStruct, "jquery.JQueryCoordinates", "JQueryCoordinates", "github.com/gopherjs/jquery", function(Left_, Top_) {
		this.$val = this;
		this.Left = Left_ !== undefined ? Left_ : 0;
		this.Top = Top_ !== undefined ? Top_ : 0;
	});
		sliceType = $sliceType($emptyInterface);
		funcType$1 = $funcType([$Int, $emptyInterface], [], false);
		mapType = $mapType($String, $emptyInterface);
		sliceType$1 = $sliceType($String);
		funcType$2 = $funcType([$Int, $String], [$String], false);
		funcType$3 = $funcType([], [], false);
		sliceType$2 = $sliceType($Bool);
		ptrType = $ptrType(JQuery);
	NewJQuery = $pkg.NewJQuery = function(args) {
		return new JQuery.ptr(new ($global.Function.prototype.bind.apply($global.jQuery, [undefined].concat($externalize(args, sliceType)))), "", "", 0, "");
	};
	JQuery.ptr.prototype.Each = function(fn) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.each($externalize(fn, funcType$1));
		return j;
	};
	JQuery.prototype.Each = function(fn) { return this.$val.Each(fn); };
	JQuery.ptr.prototype.Underlying = function() {
		var j;
		j = $clone(this, JQuery);
		return j.o;
	};
	JQuery.prototype.Underlying = function() { return this.$val.Underlying(); };
	JQuery.ptr.prototype.Get = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		return (obj = j.o, obj.get.apply(obj, $externalize(i, sliceType)));
	};
	JQuery.prototype.Get = function(i) { return this.$val.Get(i); };
	JQuery.ptr.prototype.Append = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.append.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Append = function(i) { return this.$val.Append(i); };
	JQuery.ptr.prototype.Empty = function() {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.empty();
		return j;
	};
	JQuery.prototype.Empty = function() { return this.$val.Empty(); };
	JQuery.ptr.prototype.Detach = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.detach.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Detach = function(i) { return this.$val.Detach(i); };
	JQuery.ptr.prototype.Eq = function(idx) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.eq(idx);
		return j;
	};
	JQuery.prototype.Eq = function(idx) { return this.$val.Eq(idx); };
	JQuery.ptr.prototype.FadeIn = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.fadeIn.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.FadeIn = function(i) { return this.$val.FadeIn(i); };
	JQuery.ptr.prototype.Delay = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.delay.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Delay = function(i) { return this.$val.Delay(i); };
	JQuery.ptr.prototype.ToArray = function() {
		var j;
		j = $clone(this, JQuery);
		return $assertType($internalize(j.o.toArray(), $emptyInterface), sliceType);
	};
	JQuery.prototype.ToArray = function() { return this.$val.ToArray(); };
	JQuery.ptr.prototype.Remove = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.remove.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Remove = function(i) { return this.$val.Remove(i); };
	JQuery.ptr.prototype.Stop = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.stop.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Stop = function(i) { return this.$val.Stop(i); };
	JQuery.ptr.prototype.AddBack = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.addBack.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.AddBack = function(i) { return this.$val.AddBack(i); };
	JQuery.ptr.prototype.Css = function(name) {
		var j;
		j = $clone(this, JQuery);
		return $internalize(j.o.css($externalize(name, $String)), $String);
	};
	JQuery.prototype.Css = function(name) { return this.$val.Css(name); };
	JQuery.ptr.prototype.CssArray = function(arr) {
		var j;
		j = $clone(this, JQuery);
		return $assertType($internalize(j.o.css($externalize(arr, sliceType$1)), $emptyInterface), mapType);
	};
	JQuery.prototype.CssArray = function(arr) { return this.$val.CssArray(arr); };
	JQuery.ptr.prototype.SetCss = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.css.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.SetCss = function(i) { return this.$val.SetCss(i); };
	JQuery.ptr.prototype.Text = function() {
		var j;
		j = $clone(this, JQuery);
		return $internalize(j.o.text(), $String);
	};
	JQuery.prototype.Text = function() { return this.$val.Text(); };
	JQuery.ptr.prototype.SetText = function(i) {
		var _ref, j;
		j = $clone(this, JQuery);
		_ref = i;
		if ($assertType(_ref, funcType$2, true)[1] || $assertType(_ref, $String, true)[1]) {
		} else {
			console.log("SetText Argument should be 'string' or 'func(int, string) string'");
		}
		j.o = j.o.text($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.SetText = function(i) { return this.$val.SetText(i); };
	JQuery.ptr.prototype.Val = function() {
		var j;
		j = $clone(this, JQuery);
		return $internalize(j.o.val(), $String);
	};
	JQuery.prototype.Val = function() { return this.$val.Val(); };
	JQuery.ptr.prototype.SetVal = function(i) {
		var j;
		j = $clone(this, JQuery);
		j.o.val($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.SetVal = function(i) { return this.$val.SetVal(i); };
	JQuery.ptr.prototype.Prop = function(property) {
		var j;
		j = $clone(this, JQuery);
		return $internalize(j.o.prop($externalize(property, $String)), $emptyInterface);
	};
	JQuery.prototype.Prop = function(property) { return this.$val.Prop(property); };
	JQuery.ptr.prototype.SetProp = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.prop.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.SetProp = function(i) { return this.$val.SetProp(i); };
	JQuery.ptr.prototype.RemoveProp = function(property) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.removeProp($externalize(property, $String));
		return j;
	};
	JQuery.prototype.RemoveProp = function(property) { return this.$val.RemoveProp(property); };
	JQuery.ptr.prototype.Attr = function(property) {
		var attr, j;
		j = $clone(this, JQuery);
		attr = j.o.attr($externalize(property, $String));
		if (attr === undefined) {
			return "";
		}
		return $internalize(attr, $String);
	};
	JQuery.prototype.Attr = function(property) { return this.$val.Attr(property); };
	JQuery.ptr.prototype.SetAttr = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.attr.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.SetAttr = function(i) { return this.$val.SetAttr(i); };
	JQuery.ptr.prototype.RemoveAttr = function(property) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.removeAttr($externalize(property, $String));
		return j;
	};
	JQuery.prototype.RemoveAttr = function(property) { return this.$val.RemoveAttr(property); };
	JQuery.ptr.prototype.HasClass = function(class$1) {
		var j;
		j = $clone(this, JQuery);
		return !!(j.o.hasClass($externalize(class$1, $String)));
	};
	JQuery.prototype.HasClass = function(class$1) { return this.$val.HasClass(class$1); };
	JQuery.ptr.prototype.AddClass = function(i) {
		var _ref, j;
		j = $clone(this, JQuery);
		_ref = i;
		if ($assertType(_ref, funcType$2, true)[1] || $assertType(_ref, $String, true)[1]) {
		} else {
			console.log("addClass Argument should be 'string' or 'func(int, string) string'");
		}
		j.o = j.o.addClass($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.AddClass = function(i) { return this.$val.AddClass(i); };
	JQuery.ptr.prototype.RemoveClass = function(property) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.removeClass($externalize(property, $String));
		return j;
	};
	JQuery.prototype.RemoveClass = function(property) { return this.$val.RemoveClass(property); };
	JQuery.ptr.prototype.ToggleClass = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.toggleClass.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.ToggleClass = function(i) { return this.$val.ToggleClass(i); };
	JQuery.ptr.prototype.Focus = function() {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.focus();
		return j;
	};
	JQuery.prototype.Focus = function() { return this.$val.Focus(); };
	JQuery.ptr.prototype.Blur = function() {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.blur();
		return j;
	};
	JQuery.prototype.Blur = function() { return this.$val.Blur(); };
	JQuery.ptr.prototype.ReplaceAll = function(i) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.replaceAll($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.ReplaceAll = function(i) { return this.$val.ReplaceAll(i); };
	JQuery.ptr.prototype.ReplaceWith = function(i) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.replaceWith($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.ReplaceWith = function(i) { return this.$val.ReplaceWith(i); };
	JQuery.ptr.prototype.After = function(i) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.after($externalize(i, sliceType));
		return j;
	};
	JQuery.prototype.After = function(i) { return this.$val.After(i); };
	JQuery.ptr.prototype.Before = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.before.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Before = function(i) { return this.$val.Before(i); };
	JQuery.ptr.prototype.Prepend = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.prepend.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Prepend = function(i) { return this.$val.Prepend(i); };
	JQuery.ptr.prototype.PrependTo = function(i) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.prependTo($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.PrependTo = function(i) { return this.$val.PrependTo(i); };
	JQuery.ptr.prototype.AppendTo = function(i) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.appendTo($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.AppendTo = function(i) { return this.$val.AppendTo(i); };
	JQuery.ptr.prototype.InsertAfter = function(i) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.insertAfter($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.InsertAfter = function(i) { return this.$val.InsertAfter(i); };
	JQuery.ptr.prototype.InsertBefore = function(i) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.insertBefore($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.InsertBefore = function(i) { return this.$val.InsertBefore(i); };
	JQuery.ptr.prototype.Show = function() {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.show();
		return j;
	};
	JQuery.prototype.Show = function() { return this.$val.Show(); };
	JQuery.ptr.prototype.Hide = function() {
		var j;
		j = $clone(this, JQuery);
		j.o.hide();
		return j;
	};
	JQuery.prototype.Hide = function() { return this.$val.Hide(); };
	JQuery.ptr.prototype.Toggle = function(showOrHide) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.toggle($externalize(showOrHide, $Bool));
		return j;
	};
	JQuery.prototype.Toggle = function(showOrHide) { return this.$val.Toggle(showOrHide); };
	JQuery.ptr.prototype.Contents = function() {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.contents();
		return j;
	};
	JQuery.prototype.Contents = function() { return this.$val.Contents(); };
	JQuery.ptr.prototype.Html = function() {
		var j;
		j = $clone(this, JQuery);
		return $internalize(j.o.html(), $String);
	};
	JQuery.prototype.Html = function() { return this.$val.Html(); };
	JQuery.ptr.prototype.SetHtml = function(i) {
		var _ref, j;
		j = $clone(this, JQuery);
		_ref = i;
		if ($assertType(_ref, funcType$2, true)[1] || $assertType(_ref, $String, true)[1]) {
		} else {
			console.log("SetHtml Argument should be 'string' or 'func(int, string) string'");
		}
		j.o = j.o.html($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.SetHtml = function(i) { return this.$val.SetHtml(i); };
	JQuery.ptr.prototype.Closest = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.closest.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Closest = function(i) { return this.$val.Closest(i); };
	JQuery.ptr.prototype.End = function() {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.end();
		return j;
	};
	JQuery.prototype.End = function() { return this.$val.End(); };
	JQuery.ptr.prototype.Add = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.add.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Add = function(i) { return this.$val.Add(i); };
	JQuery.ptr.prototype.Clone = function(b) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.clone.apply(obj, $externalize(b, sliceType)));
		return j;
	};
	JQuery.prototype.Clone = function(b) { return this.$val.Clone(b); };
	JQuery.ptr.prototype.Height = function() {
		var j;
		j = $clone(this, JQuery);
		return $parseInt(j.o.height()) >> 0;
	};
	JQuery.prototype.Height = function() { return this.$val.Height(); };
	JQuery.ptr.prototype.SetHeight = function(value) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.height($externalize(value, $String));
		return j;
	};
	JQuery.prototype.SetHeight = function(value) { return this.$val.SetHeight(value); };
	JQuery.ptr.prototype.Width = function() {
		var j;
		j = $clone(this, JQuery);
		return $parseInt(j.o.width()) >> 0;
	};
	JQuery.prototype.Width = function() { return this.$val.Width(); };
	JQuery.ptr.prototype.SetWidth = function(i) {
		var _ref, j;
		j = $clone(this, JQuery);
		_ref = i;
		if ($assertType(_ref, funcType$2, true)[1] || $assertType(_ref, $String, true)[1]) {
		} else {
			console.log("SetWidth Argument should be 'string' or 'func(int, string) string'");
		}
		j.o = j.o.width($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.SetWidth = function(i) { return this.$val.SetWidth(i); };
	JQuery.ptr.prototype.InnerHeight = function() {
		var j;
		j = $clone(this, JQuery);
		return $parseInt(j.o.innerHeight()) >> 0;
	};
	JQuery.prototype.InnerHeight = function() { return this.$val.InnerHeight(); };
	JQuery.ptr.prototype.InnerWidth = function() {
		var j;
		j = $clone(this, JQuery);
		return $parseInt(j.o.innerWidth()) >> 0;
	};
	JQuery.prototype.InnerWidth = function() { return this.$val.InnerWidth(); };
	JQuery.ptr.prototype.Offset = function() {
		var j, obj;
		j = $clone(this, JQuery);
		obj = j.o.offset();
		return new JQueryCoordinates.ptr($parseInt(obj.left) >> 0, $parseInt(obj.top) >> 0);
	};
	JQuery.prototype.Offset = function() { return this.$val.Offset(); };
	JQuery.ptr.prototype.SetOffset = function(jc) {
		var j;
		j = $clone(this, JQuery);
		jc = $clone(jc, JQueryCoordinates);
		j.o = j.o.offset($externalize(jc, JQueryCoordinates));
		return j;
	};
	JQuery.prototype.SetOffset = function(jc) { return this.$val.SetOffset(jc); };
	JQuery.ptr.prototype.OuterHeight = function(includeMargin) {
		var j;
		j = $clone(this, JQuery);
		if (includeMargin.$length === 0) {
			return $parseInt(j.o.outerHeight()) >> 0;
		}
		return $parseInt(j.o.outerHeight($externalize(((0 < 0 || 0 >= includeMargin.$length) ? $throwRuntimeError("index out of range") : includeMargin.$array[includeMargin.$offset + 0]), $Bool))) >> 0;
	};
	JQuery.prototype.OuterHeight = function(includeMargin) { return this.$val.OuterHeight(includeMargin); };
	JQuery.ptr.prototype.OuterWidth = function(includeMargin) {
		var j;
		j = $clone(this, JQuery);
		if (includeMargin.$length === 0) {
			return $parseInt(j.o.outerWidth()) >> 0;
		}
		return $parseInt(j.o.outerWidth($externalize(((0 < 0 || 0 >= includeMargin.$length) ? $throwRuntimeError("index out of range") : includeMargin.$array[includeMargin.$offset + 0]), $Bool))) >> 0;
	};
	JQuery.prototype.OuterWidth = function(includeMargin) { return this.$val.OuterWidth(includeMargin); };
	JQuery.ptr.prototype.Position = function() {
		var j, obj;
		j = $clone(this, JQuery);
		obj = j.o.position();
		return new JQueryCoordinates.ptr($parseInt(obj.left) >> 0, $parseInt(obj.top) >> 0);
	};
	JQuery.prototype.Position = function() { return this.$val.Position(); };
	JQuery.ptr.prototype.ScrollLeft = function() {
		var j;
		j = $clone(this, JQuery);
		return $parseInt(j.o.scrollLeft()) >> 0;
	};
	JQuery.prototype.ScrollLeft = function() { return this.$val.ScrollLeft(); };
	JQuery.ptr.prototype.SetScrollLeft = function(value) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.scrollLeft(value);
		return j;
	};
	JQuery.prototype.SetScrollLeft = function(value) { return this.$val.SetScrollLeft(value); };
	JQuery.ptr.prototype.ScrollTop = function() {
		var j;
		j = $clone(this, JQuery);
		return $parseInt(j.o.scrollTop()) >> 0;
	};
	JQuery.prototype.ScrollTop = function() { return this.$val.ScrollTop(); };
	JQuery.ptr.prototype.SetScrollTop = function(value) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.scrollTop(value);
		return j;
	};
	JQuery.prototype.SetScrollTop = function(value) { return this.$val.SetScrollTop(value); };
	JQuery.ptr.prototype.ClearQueue = function(queueName) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.clearQueue($externalize(queueName, $String));
		return j;
	};
	JQuery.prototype.ClearQueue = function(queueName) { return this.$val.ClearQueue(queueName); };
	JQuery.ptr.prototype.SetData = function(key, value) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.data($externalize(key, $String), $externalize(value, $emptyInterface));
		return j;
	};
	JQuery.prototype.SetData = function(key, value) { return this.$val.SetData(key, value); };
	JQuery.ptr.prototype.Data = function(key) {
		var j, result;
		j = $clone(this, JQuery);
		result = j.o.data($externalize(key, $String));
		if (result === undefined) {
			return $ifaceNil;
		}
		return $internalize(result, $emptyInterface);
	};
	JQuery.prototype.Data = function(key) { return this.$val.Data(key); };
	JQuery.ptr.prototype.Dequeue = function(queueName) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.dequeue($externalize(queueName, $String));
		return j;
	};
	JQuery.prototype.Dequeue = function(queueName) { return this.$val.Dequeue(queueName); };
	JQuery.ptr.prototype.RemoveData = function(name) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.removeData($externalize(name, $String));
		return j;
	};
	JQuery.prototype.RemoveData = function(name) { return this.$val.RemoveData(name); };
	JQuery.ptr.prototype.OffsetParent = function() {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.offsetParent();
		return j;
	};
	JQuery.prototype.OffsetParent = function() { return this.$val.OffsetParent(); };
	JQuery.ptr.prototype.Parent = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.parent.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Parent = function(i) { return this.$val.Parent(i); };
	JQuery.ptr.prototype.Parents = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.parents.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Parents = function(i) { return this.$val.Parents(i); };
	JQuery.ptr.prototype.ParentsUntil = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.parentsUntil.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.ParentsUntil = function(i) { return this.$val.ParentsUntil(i); };
	JQuery.ptr.prototype.Prev = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.prev.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Prev = function(i) { return this.$val.Prev(i); };
	JQuery.ptr.prototype.PrevAll = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.prevAll.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.PrevAll = function(i) { return this.$val.PrevAll(i); };
	JQuery.ptr.prototype.PrevUntil = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.prevUntil.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.PrevUntil = function(i) { return this.$val.PrevUntil(i); };
	JQuery.ptr.prototype.Siblings = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.siblings.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Siblings = function(i) { return this.$val.Siblings(i); };
	JQuery.ptr.prototype.Slice = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.slice.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Slice = function(i) { return this.$val.Slice(i); };
	JQuery.ptr.prototype.Children = function(selector) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.children($externalize(selector, $emptyInterface));
		return j;
	};
	JQuery.prototype.Children = function(selector) { return this.$val.Children(selector); };
	JQuery.ptr.prototype.Unwrap = function() {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.unwrap();
		return j;
	};
	JQuery.prototype.Unwrap = function() { return this.$val.Unwrap(); };
	JQuery.ptr.prototype.Wrap = function(obj) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.wrap($externalize(obj, $emptyInterface));
		return j;
	};
	JQuery.prototype.Wrap = function(obj) { return this.$val.Wrap(obj); };
	JQuery.ptr.prototype.WrapAll = function(i) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.wrapAll($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.WrapAll = function(i) { return this.$val.WrapAll(i); };
	JQuery.ptr.prototype.WrapInner = function(i) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.wrapInner($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.WrapInner = function(i) { return this.$val.WrapInner(i); };
	JQuery.ptr.prototype.Next = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.next.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Next = function(i) { return this.$val.Next(i); };
	JQuery.ptr.prototype.NextAll = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.nextAll.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.NextAll = function(i) { return this.$val.NextAll(i); };
	JQuery.ptr.prototype.NextUntil = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.nextUntil.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.NextUntil = function(i) { return this.$val.NextUntil(i); };
	JQuery.ptr.prototype.Not = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.not.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Not = function(i) { return this.$val.Not(i); };
	JQuery.ptr.prototype.Filter = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.filter.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Filter = function(i) { return this.$val.Filter(i); };
	JQuery.ptr.prototype.Find = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.find.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Find = function(i) { return this.$val.Find(i); };
	JQuery.ptr.prototype.First = function() {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.first();
		return j;
	};
	JQuery.prototype.First = function() { return this.$val.First(); };
	JQuery.ptr.prototype.Has = function(selector) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.has($externalize(selector, $String));
		return j;
	};
	JQuery.prototype.Has = function(selector) { return this.$val.Has(selector); };
	JQuery.ptr.prototype.Is = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		return !!((obj = j.o, obj.is.apply(obj, $externalize(i, sliceType))));
	};
	JQuery.prototype.Is = function(i) { return this.$val.Is(i); };
	JQuery.ptr.prototype.Last = function() {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.last();
		return j;
	};
	JQuery.prototype.Last = function() { return this.$val.Last(); };
	JQuery.ptr.prototype.Ready = function(handler) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.ready($externalize(handler, funcType$3));
		return j;
	};
	JQuery.prototype.Ready = function(handler) { return this.$val.Ready(handler); };
	JQuery.ptr.prototype.Resize = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.resize.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Resize = function(i) { return this.$val.Resize(i); };
	JQuery.ptr.prototype.Scroll = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.scroll.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Scroll = function(i) { return this.$val.Scroll(i); };
	JQuery.ptr.prototype.FadeOut = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.fadeOut.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.FadeOut = function(i) { return this.$val.FadeOut(i); };
	JQuery.ptr.prototype.Select = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.select.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Select = function(i) { return this.$val.Select(i); };
	JQuery.ptr.prototype.Submit = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.submit.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Submit = function(i) { return this.$val.Submit(i); };
	JQuery.ptr.prototype.Trigger = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.trigger.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Trigger = function(i) { return this.$val.Trigger(i); };
	JQuery.ptr.prototype.On = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.on.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.On = function(i) { return this.$val.On(i); };
	JQuery.ptr.prototype.One = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.one.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.One = function(i) { return this.$val.One(i); };
	JQuery.ptr.prototype.Off = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.off.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Off = function(i) { return this.$val.Off(i); };
	JQuery.ptr.prototype.Load = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.load.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Load = function(i) { return this.$val.Load(i); };
	JQuery.ptr.prototype.Serialize = function() {
		var j;
		j = $clone(this, JQuery);
		return $internalize(j.o.serialize(), $String);
	};
	JQuery.prototype.Serialize = function() { return this.$val.Serialize(); };
	JQuery.ptr.prototype.SerializeArray = function() {
		var j;
		j = $clone(this, JQuery);
		return j.o.serializeArray();
	};
	JQuery.prototype.SerializeArray = function() { return this.$val.SerializeArray(); };
	JQuery.methods = [{prop: "Add", name: "Add", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "AddBack", name: "AddBack", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "AddClass", name: "AddClass", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "After", name: "After", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Append", name: "Append", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "AppendTo", name: "AppendTo", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Attr", name: "Attr", pkg: "", type: $funcType([$String], [$String], false)}, {prop: "Before", name: "Before", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Blur", name: "Blur", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Children", name: "Children", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "ClearQueue", name: "ClearQueue", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "Clone", name: "Clone", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Closest", name: "Closest", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Contents", name: "Contents", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Css", name: "Css", pkg: "", type: $funcType([$String], [$String], false)}, {prop: "CssArray", name: "CssArray", pkg: "", type: $funcType([sliceType$1], [mapType], true)}, {prop: "Data", name: "Data", pkg: "", type: $funcType([$String], [$emptyInterface], false)}, {prop: "Delay", name: "Delay", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Dequeue", name: "Dequeue", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "Detach", name: "Detach", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Each", name: "Each", pkg: "", type: $funcType([funcType$1], [JQuery], false)}, {prop: "Empty", name: "Empty", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "End", name: "End", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Eq", name: "Eq", pkg: "", type: $funcType([$Int], [JQuery], false)}, {prop: "FadeIn", name: "FadeIn", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "FadeOut", name: "FadeOut", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Filter", name: "Filter", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Find", name: "Find", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "First", name: "First", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Focus", name: "Focus", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Get", name: "Get", pkg: "", type: $funcType([sliceType], [js.Object], true)}, {prop: "Has", name: "Has", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "HasClass", name: "HasClass", pkg: "", type: $funcType([$String], [$Bool], false)}, {prop: "Height", name: "Height", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Hide", name: "Hide", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Html", name: "Html", pkg: "", type: $funcType([], [$String], false)}, {prop: "InnerHeight", name: "InnerHeight", pkg: "", type: $funcType([], [$Int], false)}, {prop: "InnerWidth", name: "InnerWidth", pkg: "", type: $funcType([], [$Int], false)}, {prop: "InsertAfter", name: "InsertAfter", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "InsertBefore", name: "InsertBefore", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Is", name: "Is", pkg: "", type: $funcType([sliceType], [$Bool], true)}, {prop: "Last", name: "Last", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Load", name: "Load", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Next", name: "Next", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "NextAll", name: "NextAll", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "NextUntil", name: "NextUntil", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Not", name: "Not", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Off", name: "Off", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Offset", name: "Offset", pkg: "", type: $funcType([], [JQueryCoordinates], false)}, {prop: "OffsetParent", name: "OffsetParent", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "On", name: "On", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "One", name: "One", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "OuterHeight", name: "OuterHeight", pkg: "", type: $funcType([sliceType$2], [$Int], true)}, {prop: "OuterWidth", name: "OuterWidth", pkg: "", type: $funcType([sliceType$2], [$Int], true)}, {prop: "Parent", name: "Parent", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Parents", name: "Parents", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "ParentsUntil", name: "ParentsUntil", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Position", name: "Position", pkg: "", type: $funcType([], [JQueryCoordinates], false)}, {prop: "Prepend", name: "Prepend", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "PrependTo", name: "PrependTo", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Prev", name: "Prev", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "PrevAll", name: "PrevAll", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "PrevUntil", name: "PrevUntil", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Prop", name: "Prop", pkg: "", type: $funcType([$String], [$emptyInterface], false)}, {prop: "Ready", name: "Ready", pkg: "", type: $funcType([funcType$3], [JQuery], false)}, {prop: "Remove", name: "Remove", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "RemoveAttr", name: "RemoveAttr", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "RemoveClass", name: "RemoveClass", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "RemoveData", name: "RemoveData", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "RemoveProp", name: "RemoveProp", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "ReplaceAll", name: "ReplaceAll", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "ReplaceWith", name: "ReplaceWith", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Resize", name: "Resize", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Scroll", name: "Scroll", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "ScrollLeft", name: "ScrollLeft", pkg: "", type: $funcType([], [$Int], false)}, {prop: "ScrollTop", name: "ScrollTop", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Select", name: "Select", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Serialize", name: "Serialize", pkg: "", type: $funcType([], [$String], false)}, {prop: "SerializeArray", name: "SerializeArray", pkg: "", type: $funcType([], [js.Object], false)}, {prop: "SetAttr", name: "SetAttr", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "SetCss", name: "SetCss", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "SetData", name: "SetData", pkg: "", type: $funcType([$String, $emptyInterface], [JQuery], false)}, {prop: "SetHeight", name: "SetHeight", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "SetHtml", name: "SetHtml", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "SetOffset", name: "SetOffset", pkg: "", type: $funcType([JQueryCoordinates], [JQuery], false)}, {prop: "SetProp", name: "SetProp", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "SetScrollLeft", name: "SetScrollLeft", pkg: "", type: $funcType([$Int], [JQuery], false)}, {prop: "SetScrollTop", name: "SetScrollTop", pkg: "", type: $funcType([$Int], [JQuery], false)}, {prop: "SetText", name: "SetText", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "SetVal", name: "SetVal", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "SetWidth", name: "SetWidth", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Show", name: "Show", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Siblings", name: "Siblings", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Slice", name: "Slice", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Stop", name: "Stop", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Submit", name: "Submit", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Text", name: "Text", pkg: "", type: $funcType([], [$String], false)}, {prop: "ToArray", name: "ToArray", pkg: "", type: $funcType([], [sliceType], false)}, {prop: "Toggle", name: "Toggle", pkg: "", type: $funcType([$Bool], [JQuery], false)}, {prop: "ToggleClass", name: "ToggleClass", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Trigger", name: "Trigger", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Underlying", name: "Underlying", pkg: "", type: $funcType([], [js.Object], false)}, {prop: "Unwrap", name: "Unwrap", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Val", name: "Val", pkg: "", type: $funcType([], [$String], false)}, {prop: "Width", name: "Width", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Wrap", name: "Wrap", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "WrapAll", name: "WrapAll", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "WrapInner", name: "WrapInner", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}];
	ptrType.methods = [{prop: "Add", name: "Add", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "AddBack", name: "AddBack", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "AddClass", name: "AddClass", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "After", name: "After", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Append", name: "Append", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "AppendTo", name: "AppendTo", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Attr", name: "Attr", pkg: "", type: $funcType([$String], [$String], false)}, {prop: "Before", name: "Before", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Blur", name: "Blur", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Children", name: "Children", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "ClearQueue", name: "ClearQueue", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "Clone", name: "Clone", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Closest", name: "Closest", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Contents", name: "Contents", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Css", name: "Css", pkg: "", type: $funcType([$String], [$String], false)}, {prop: "CssArray", name: "CssArray", pkg: "", type: $funcType([sliceType$1], [mapType], true)}, {prop: "Data", name: "Data", pkg: "", type: $funcType([$String], [$emptyInterface], false)}, {prop: "Delay", name: "Delay", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Dequeue", name: "Dequeue", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "Detach", name: "Detach", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Each", name: "Each", pkg: "", type: $funcType([funcType$1], [JQuery], false)}, {prop: "Empty", name: "Empty", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "End", name: "End", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Eq", name: "Eq", pkg: "", type: $funcType([$Int], [JQuery], false)}, {prop: "FadeIn", name: "FadeIn", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "FadeOut", name: "FadeOut", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Filter", name: "Filter", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Find", name: "Find", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "First", name: "First", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Focus", name: "Focus", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Get", name: "Get", pkg: "", type: $funcType([sliceType], [js.Object], true)}, {prop: "Has", name: "Has", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "HasClass", name: "HasClass", pkg: "", type: $funcType([$String], [$Bool], false)}, {prop: "Height", name: "Height", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Hide", name: "Hide", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Html", name: "Html", pkg: "", type: $funcType([], [$String], false)}, {prop: "InnerHeight", name: "InnerHeight", pkg: "", type: $funcType([], [$Int], false)}, {prop: "InnerWidth", name: "InnerWidth", pkg: "", type: $funcType([], [$Int], false)}, {prop: "InsertAfter", name: "InsertAfter", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "InsertBefore", name: "InsertBefore", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Is", name: "Is", pkg: "", type: $funcType([sliceType], [$Bool], true)}, {prop: "Last", name: "Last", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Load", name: "Load", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Next", name: "Next", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "NextAll", name: "NextAll", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "NextUntil", name: "NextUntil", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Not", name: "Not", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Off", name: "Off", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Offset", name: "Offset", pkg: "", type: $funcType([], [JQueryCoordinates], false)}, {prop: "OffsetParent", name: "OffsetParent", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "On", name: "On", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "One", name: "One", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "OuterHeight", name: "OuterHeight", pkg: "", type: $funcType([sliceType$2], [$Int], true)}, {prop: "OuterWidth", name: "OuterWidth", pkg: "", type: $funcType([sliceType$2], [$Int], true)}, {prop: "Parent", name: "Parent", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Parents", name: "Parents", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "ParentsUntil", name: "ParentsUntil", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Position", name: "Position", pkg: "", type: $funcType([], [JQueryCoordinates], false)}, {prop: "Prepend", name: "Prepend", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "PrependTo", name: "PrependTo", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Prev", name: "Prev", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "PrevAll", name: "PrevAll", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "PrevUntil", name: "PrevUntil", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Prop", name: "Prop", pkg: "", type: $funcType([$String], [$emptyInterface], false)}, {prop: "Ready", name: "Ready", pkg: "", type: $funcType([funcType$3], [JQuery], false)}, {prop: "Remove", name: "Remove", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "RemoveAttr", name: "RemoveAttr", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "RemoveClass", name: "RemoveClass", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "RemoveData", name: "RemoveData", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "RemoveProp", name: "RemoveProp", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "ReplaceAll", name: "ReplaceAll", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "ReplaceWith", name: "ReplaceWith", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Resize", name: "Resize", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Scroll", name: "Scroll", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "ScrollLeft", name: "ScrollLeft", pkg: "", type: $funcType([], [$Int], false)}, {prop: "ScrollTop", name: "ScrollTop", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Select", name: "Select", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Serialize", name: "Serialize", pkg: "", type: $funcType([], [$String], false)}, {prop: "SerializeArray", name: "SerializeArray", pkg: "", type: $funcType([], [js.Object], false)}, {prop: "SetAttr", name: "SetAttr", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "SetCss", name: "SetCss", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "SetData", name: "SetData", pkg: "", type: $funcType([$String, $emptyInterface], [JQuery], false)}, {prop: "SetHeight", name: "SetHeight", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "SetHtml", name: "SetHtml", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "SetOffset", name: "SetOffset", pkg: "", type: $funcType([JQueryCoordinates], [JQuery], false)}, {prop: "SetProp", name: "SetProp", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "SetScrollLeft", name: "SetScrollLeft", pkg: "", type: $funcType([$Int], [JQuery], false)}, {prop: "SetScrollTop", name: "SetScrollTop", pkg: "", type: $funcType([$Int], [JQuery], false)}, {prop: "SetText", name: "SetText", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "SetVal", name: "SetVal", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "SetWidth", name: "SetWidth", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Show", name: "Show", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Siblings", name: "Siblings", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Slice", name: "Slice", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Stop", name: "Stop", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Submit", name: "Submit", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Text", name: "Text", pkg: "", type: $funcType([], [$String], false)}, {prop: "ToArray", name: "ToArray", pkg: "", type: $funcType([], [sliceType], false)}, {prop: "Toggle", name: "Toggle", pkg: "", type: $funcType([$Bool], [JQuery], false)}, {prop: "ToggleClass", name: "ToggleClass", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Trigger", name: "Trigger", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Underlying", name: "Underlying", pkg: "", type: $funcType([], [js.Object], false)}, {prop: "Unwrap", name: "Unwrap", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Val", name: "Val", pkg: "", type: $funcType([], [$String], false)}, {prop: "Width", name: "Width", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Wrap", name: "Wrap", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "WrapAll", name: "WrapAll", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "WrapInner", name: "WrapInner", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}];
	JQuery.init([{prop: "o", name: "o", pkg: "github.com/gopherjs/jquery", type: js.Object, tag: ""}, {prop: "Jquery", name: "Jquery", pkg: "", type: $String, tag: "js:\"jquery\""}, {prop: "Selector", name: "Selector", pkg: "", type: $String, tag: "js:\"selector\""}, {prop: "Length", name: "Length", pkg: "", type: $Int, tag: "js:\"length\""}, {prop: "Context", name: "Context", pkg: "", type: $String, tag: "js:\"context\""}]);
	JQueryCoordinates.init([{prop: "Left", name: "Left", pkg: "", type: $Int, tag: ""}, {prop: "Top", name: "Top", pkg: "", type: $Int, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_jquery = function() { while (true) { switch ($s) { case 0:
		$r = js.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		/* */ } return; } }; $init_jquery.$blocking = true; return $init_jquery;
	};
	return $pkg;
})();
$packages["/Users/fberger/gd/go/src/github.com/fabioberger/gopherjs-router/example"] = (function() {
	var $pkg = {}, router, jquery, sliceType, jq, main;
	router = $packages["github.com/albrow/gopherjs-router"];
	jquery = $packages["github.com/gopherjs/jquery"];
		sliceType = $sliceType($emptyInterface);
	main = function() {
		var r;
		console.log("Starting...");
		r = router.New();
		r.HandleFunc("/", (function(id) {
			console.log("At home page!");
			jq(new sliceType([new $String("#current-page")])).SetHtml(new $String("Home Page"));
		}));
		r.HandleFunc("/about", (function(id) {
			console.log("At about page!");
			jq(new sliceType([new $String("#current-page")])).SetHtml(new $String("About Page"));
		}));
		r.HandleFunc("/faq", (function(id) {
			console.log("At faq page!");
			jq(new sliceType([new $String("#current-page")])).SetHtml(new $String("FAQ Page"));
		}));
		r.HandleFunc("/post/:id", (function(id) {
			console.log("At Post Page for Post: ", ((0 < 0 || 0 >= id.$length) ? $throwRuntimeError("index out of range") : id.$array[id.$offset + 0]));
			jq(new sliceType([new $String("#current-page")])).SetHtml(new $String("Post Page"));
		}));
		r.Start();
	};
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_main = function() { while (true) { switch ($s) { case 0:
		$r = router.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$r = jquery.$init($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		jq = jquery.NewJQuery;
		main();
		/* */ } return; } }; $init_main.$blocking = true; return $init_main;
	};
	return $pkg;
})();
$initAnonTypes();
$packages["runtime"].$init()();
$go($packages["/Users/fberger/gd/go/src/github.com/fabioberger/gopherjs-router/example"].$init, [], true);
$flushConsole();

})(this);
//# sourceMappingURL=main.js.map
