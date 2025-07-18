Package["core-runtime"].queue("ejson",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;
var ECMAScript = Package.ecmascript.ECMAScript;
var Base64 = Package.base64.Base64;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var EJSON;

var require = meteorInstall({"node_modules":{"meteor":{"ejson":{"ejson.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                 //
// packages/ejson/ejson.js                                                                                         //
//                                                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                   //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      EJSON: () => EJSON
    });
    let isFunction, isObject, keysOf, lengthOf, hasOwn, convertMapToObject, isArguments, isInfOrNaN, handleError;
    module.link("./utils", {
      isFunction(v) {
        isFunction = v;
      },
      isObject(v) {
        isObject = v;
      },
      keysOf(v) {
        keysOf = v;
      },
      lengthOf(v) {
        lengthOf = v;
      },
      hasOwn(v) {
        hasOwn = v;
      },
      convertMapToObject(v) {
        convertMapToObject = v;
      },
      isArguments(v) {
        isArguments = v;
      },
      isInfOrNaN(v) {
        isInfOrNaN = v;
      },
      handleError(v) {
        handleError = v;
      }
    }, 0);
    let canonicalStringify;
    module.link("./stringify", {
      default(v) {
        canonicalStringify = v;
      }
    }, 1);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    /**
     * @namespace
     * @summary Namespace for EJSON functions
     */
    const EJSON = {};

    // Custom type interface definition
    /**
     * @class CustomType
     * @instanceName customType
     * @memberOf EJSON
     * @summary The interface that a class must satisfy to be able to become an
     * EJSON custom type via EJSON.addType.
     */

    /**
     * @function typeName
     * @memberOf EJSON.CustomType
     * @summary Return the tag used to identify this type.  This must match the
     *          tag used to register this type with
     *          [`EJSON.addType`](#ejson_add_type).
     * @locus Anywhere
     * @instance
     */

    /**
     * @function toJSONValue
     * @memberOf EJSON.CustomType
     * @summary Serialize this instance into a JSON-compatible value.
     * @locus Anywhere
     * @instance
     */

    /**
     * @function clone
     * @memberOf EJSON.CustomType
     * @summary Return a value `r` such that `this.equals(r)` is true, and
     *          modifications to `r` do not affect `this` and vice versa.
     * @locus Anywhere
     * @instance
     */

    /**
     * @function equals
     * @memberOf EJSON.CustomType
     * @summary Return `true` if `other` has a value equal to `this`; `false`
     *          otherwise.
     * @locus Anywhere
     * @param {Object} other Another object to compare this to.
     * @instance
     */

    const customTypes = new Map();

    // Add a custom type, using a method of your choice to get to and
    // from a basic JSON-able representation.  The factory argument
    // is a function of JSON-able --> your object
    // The type you add must have:
    // - A toJSONValue() method, so that Meteor can serialize it
    // - a typeName() method, to show how to look it up in our type table.
    // It is okay if these methods are monkey-patched on.
    // EJSON.clone will use toJSONValue and the given factory to produce
    // a clone, but you may specify a method clone() that will be
    // used instead.
    // Similarly, EJSON.equals will use toJSONValue to make comparisons,
    // but you may provide a method equals() instead.
    /**
     * @summary Add a custom datatype to EJSON.
     * @locus Anywhere
     * @param {String} name A tag for your custom type; must be unique among
     *                      custom data types defined in your project, and must
     *                      match the result of your type's `typeName` method.
     * @param {Function} factory A function that deserializes a JSON-compatible
     *                           value into an instance of your type.  This should
     *                           match the serialization performed by your
     *                           type's `toJSONValue` method.
     */
    EJSON.addType = (name, factory) => {
      if (customTypes.has(name)) {
        throw new Error("Type ".concat(name, " already present"));
      }
      customTypes.set(name, factory);
    };
    const builtinConverters = [{
      // Date
      matchJSONValue(obj) {
        return hasOwn(obj, '$date') && lengthOf(obj) === 1;
      },
      matchObject(obj) {
        return obj instanceof Date;
      },
      toJSONValue(obj) {
        return {
          $date: obj.getTime()
        };
      },
      fromJSONValue(obj) {
        return new Date(obj.$date);
      }
    }, {
      // RegExp
      matchJSONValue(obj) {
        return hasOwn(obj, '$regexp') && hasOwn(obj, '$flags') && lengthOf(obj) === 2;
      },
      matchObject(obj) {
        return obj instanceof RegExp;
      },
      toJSONValue(regexp) {
        return {
          $regexp: regexp.source,
          $flags: regexp.flags
        };
      },
      fromJSONValue(obj) {
        // Replaces duplicate / invalid flags.
        return new RegExp(obj.$regexp, obj.$flags
        // Cut off flags at 50 chars to avoid abusing RegExp for DOS.
        .slice(0, 50).replace(/[^gimuy]/g, '').replace(/(.)(?=.*\1)/g, ''));
      }
    }, {
      // NaN, Inf, -Inf. (These are the only objects with typeof !== 'object'
      // which we match.)
      matchJSONValue(obj) {
        return hasOwn(obj, '$InfNaN') && lengthOf(obj) === 1;
      },
      matchObject: isInfOrNaN,
      toJSONValue(obj) {
        let sign;
        if (Number.isNaN(obj)) {
          sign = 0;
        } else if (obj === Infinity) {
          sign = 1;
        } else {
          sign = -1;
        }
        return {
          $InfNaN: sign
        };
      },
      fromJSONValue(obj) {
        return obj.$InfNaN / 0;
      }
    }, {
      // Binary
      matchJSONValue(obj) {
        return hasOwn(obj, '$binary') && lengthOf(obj) === 1;
      },
      matchObject(obj) {
        return typeof Uint8Array !== 'undefined' && obj instanceof Uint8Array || obj && hasOwn(obj, '$Uint8ArrayPolyfill');
      },
      toJSONValue(obj) {
        return {
          $binary: Base64.encode(obj)
        };
      },
      fromJSONValue(obj) {
        return Base64.decode(obj.$binary);
      }
    }, {
      // Escaping one level
      matchJSONValue(obj) {
        return hasOwn(obj, '$escape') && lengthOf(obj) === 1;
      },
      matchObject(obj) {
        let match = false;
        if (obj) {
          const keyCount = lengthOf(obj);
          if (keyCount === 1 || keyCount === 2) {
            match = builtinConverters.some(converter => converter.matchJSONValue(obj));
          }
        }
        return match;
      },
      toJSONValue(obj) {
        const newObj = {};
        keysOf(obj).forEach(key => {
          newObj[key] = EJSON.toJSONValue(obj[key]);
        });
        return {
          $escape: newObj
        };
      },
      fromJSONValue(obj) {
        const newObj = {};
        keysOf(obj.$escape).forEach(key => {
          newObj[key] = EJSON.fromJSONValue(obj.$escape[key]);
        });
        return newObj;
      }
    }, {
      // Custom
      matchJSONValue(obj) {
        return hasOwn(obj, '$type') && hasOwn(obj, '$value') && lengthOf(obj) === 2;
      },
      matchObject(obj) {
        return EJSON._isCustomType(obj);
      },
      toJSONValue(obj) {
        const jsonValue = Meteor._noYieldsAllowed(() => obj.toJSONValue());
        return {
          $type: obj.typeName(),
          $value: jsonValue
        };
      },
      fromJSONValue(obj) {
        const typeName = obj.$type;
        if (!customTypes.has(typeName)) {
          throw new Error("Custom EJSON type ".concat(typeName, " is not defined"));
        }
        const converter = customTypes.get(typeName);
        return Meteor._noYieldsAllowed(() => converter(obj.$value));
      }
    }];
    EJSON._isCustomType = obj => obj && isFunction(obj.toJSONValue) && isFunction(obj.typeName) && customTypes.has(obj.typeName());
    EJSON._getTypes = function () {
      let isOriginal = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;
      return isOriginal ? customTypes : convertMapToObject(customTypes);
    };
    EJSON._getConverters = () => builtinConverters;

    // Either return the JSON-compatible version of the argument, or undefined (if
    // the item isn't itself replaceable, but maybe some fields in it are)
    const toJSONValueHelper = item => {
      for (let i = 0; i < builtinConverters.length; i++) {
        const converter = builtinConverters[i];
        if (converter.matchObject(item)) {
          return converter.toJSONValue(item);
        }
      }
      return undefined;
    };

    // for both arrays and objects, in-place modification.
    const adjustTypesToJSONValue = obj => {
      // Is it an atom that we need to adjust?
      if (obj === null) {
        return null;
      }
      const maybeChanged = toJSONValueHelper(obj);
      if (maybeChanged !== undefined) {
        return maybeChanged;
      }

      // Other atoms are unchanged.
      if (!isObject(obj)) {
        return obj;
      }

      // Iterate over array or object structure.
      keysOf(obj).forEach(key => {
        const value = obj[key];
        if (!isObject(value) && value !== undefined && !isInfOrNaN(value)) {
          return; // continue
        }
        const changed = toJSONValueHelper(value);
        if (changed) {
          obj[key] = changed;
          return; // on to the next key
        }
        // if we get here, value is an object but not adjustable
        // at this level.  recurse.
        adjustTypesToJSONValue(value);
      });
      return obj;
    };
    EJSON._adjustTypesToJSONValue = adjustTypesToJSONValue;

    /**
     * @summary Serialize an EJSON-compatible value into its plain JSON
     *          representation.
     * @locus Anywhere
     * @param {EJSON} val A value to serialize to plain JSON.
     */
    EJSON.toJSONValue = item => {
      const changed = toJSONValueHelper(item);
      if (changed !== undefined) {
        return changed;
      }
      let newItem = item;
      if (isObject(item)) {
        newItem = EJSON.clone(item);
        adjustTypesToJSONValue(newItem);
      }
      return newItem;
    };

    // Either return the argument changed to have the non-json
    // rep of itself (the Object version) or the argument itself.
    // DOES NOT RECURSE.  For actually getting the fully-changed value, use
    // EJSON.fromJSONValue
    const fromJSONValueHelper = value => {
      if (isObject(value) && value !== null) {
        const keys = keysOf(value);
        if (keys.length <= 2 && keys.every(k => typeof k === 'string' && k.substr(0, 1) === '$')) {
          for (let i = 0; i < builtinConverters.length; i++) {
            const converter = builtinConverters[i];
            if (converter.matchJSONValue(value)) {
              return converter.fromJSONValue(value);
            }
          }
        }
      }
      return value;
    };

    // for both arrays and objects. Tries its best to just
    // use the object you hand it, but may return something
    // different if the object you hand it itself needs changing.
    const adjustTypesFromJSONValue = obj => {
      if (obj === null) {
        return null;
      }
      const maybeChanged = fromJSONValueHelper(obj);
      if (maybeChanged !== obj) {
        return maybeChanged;
      }

      // Other atoms are unchanged.
      if (!isObject(obj)) {
        return obj;
      }
      keysOf(obj).forEach(key => {
        const value = obj[key];
        if (isObject(value)) {
          const changed = fromJSONValueHelper(value);
          if (value !== changed) {
            obj[key] = changed;
            return;
          }
          // if we get here, value is an object but not adjustable
          // at this level.  recurse.
          adjustTypesFromJSONValue(value);
        }
      });
      return obj;
    };
    EJSON._adjustTypesFromJSONValue = adjustTypesFromJSONValue;

    /**
     * @summary Deserialize an EJSON value from its plain JSON representation.
     * @locus Anywhere
     * @param {JSONCompatible} val A value to deserialize into EJSON.
     */
    EJSON.fromJSONValue = item => {
      let changed = fromJSONValueHelper(item);
      if (changed === item && isObject(item)) {
        changed = EJSON.clone(item);
        adjustTypesFromJSONValue(changed);
      }
      return changed;
    };

    /**
     * @summary Serialize a value to a string. For EJSON values, the serialization
     *          fully represents the value. For non-EJSON values, serializes the
     *          same way as `JSON.stringify`.
     * @locus Anywhere
     * @param {EJSON} val A value to stringify.
     * @param {Object} [options]
     * @param {Boolean | Integer | String} [options.indent] Indents objects and
     * arrays for easy readability.  When `true`, indents by 2 spaces; when an
     * integer, indents by that number of spaces; and when a string, uses the
     * string as the indentation pattern.
     * @param {Boolean} [options.canonical] When `true`, stringifies keys in an
     *                                    object in sorted order.
     */
    EJSON.stringify = handleError((item, options) => {
      let serialized;
      const json = EJSON.toJSONValue(item);
      if (options && (options.canonical || options.indent)) {
        serialized = canonicalStringify(json, options);
      } else {
        serialized = JSON.stringify(json);
      }
      return serialized;
    });

    /**
     * @summary Parse a string into an EJSON value. Throws an error if the string
     *          is not valid EJSON.
     * @locus Anywhere
     * @param {String} str A string to parse into an EJSON value.
     */
    EJSON.parse = item => {
      if (typeof item !== 'string') {
        throw new Error('EJSON.parse argument should be a string');
      }
      return EJSON.fromJSONValue(JSON.parse(item));
    };

    /**
     * @summary Returns true if `x` is a buffer of binary data, as returned from
     *          [`EJSON.newBinary`](#ejson_new_binary).
     * @param {Object} x The variable to check.
     * @locus Anywhere
     */
    EJSON.isBinary = obj => {
      return !!(typeof Uint8Array !== 'undefined' && obj instanceof Uint8Array || obj && obj.$Uint8ArrayPolyfill);
    };

    /**
     * @summary Return true if `a` and `b` are equal to each other.  Return false
     *          otherwise.  Uses the `equals` method on `a` if present, otherwise
     *          performs a deep comparison.
     * @locus Anywhere
     * @param {EJSON} a
     * @param {EJSON} b
     * @param {Object} [options]
     * @param {Boolean} options.keyOrderSensitive Compare in key sensitive order,
     * if supported by the JavaScript implementation.  For example, `{a: 1, b: 2}`
     * is equal to `{b: 2, a: 1}` only when `keyOrderSensitive` is `false`.  The
     * default is `false`.
     */
    EJSON.equals = (a, b, options) => {
      let i;
      const keyOrderSensitive = !!(options && options.keyOrderSensitive);
      if (a === b) {
        return true;
      }

      // This differs from the IEEE spec for NaN equality, b/c we don't want
      // anything ever with a NaN to be poisoned from becoming equal to anything.
      if (Number.isNaN(a) && Number.isNaN(b)) {
        return true;
      }

      // if either one is falsy, they'd have to be === to be equal
      if (!a || !b) {
        return false;
      }
      if (!(isObject(a) && isObject(b))) {
        return false;
      }
      if (a instanceof Date && b instanceof Date) {
        return a.valueOf() === b.valueOf();
      }
      if (EJSON.isBinary(a) && EJSON.isBinary(b)) {
        if (a.length !== b.length) {
          return false;
        }
        for (i = 0; i < a.length; i++) {
          if (a[i] !== b[i]) {
            return false;
          }
        }
        return true;
      }
      if (isFunction(a.equals)) {
        return a.equals(b, options);
      }
      if (isFunction(b.equals)) {
        return b.equals(a, options);
      }

      // Array.isArray works across iframes while instanceof won't
      const aIsArray = Array.isArray(a);
      const bIsArray = Array.isArray(b);

      // if not both or none are array they are not equal
      if (aIsArray !== bIsArray) {
        return false;
      }
      if (aIsArray && bIsArray) {
        if (a.length !== b.length) {
          return false;
        }
        for (i = 0; i < a.length; i++) {
          if (!EJSON.equals(a[i], b[i], options)) {
            return false;
          }
        }
        return true;
      }

      // fallback for custom types that don't implement their own equals
      switch (EJSON._isCustomType(a) + EJSON._isCustomType(b)) {
        case 1:
          return false;
        case 2:
          return EJSON.equals(EJSON.toJSONValue(a), EJSON.toJSONValue(b));
        default: // Do nothing
      }

      // fall back to structural equality of objects
      let ret;
      const aKeys = keysOf(a);
      const bKeys = keysOf(b);
      if (keyOrderSensitive) {
        i = 0;
        ret = aKeys.every(key => {
          if (i >= bKeys.length) {
            return false;
          }
          if (key !== bKeys[i]) {
            return false;
          }
          if (!EJSON.equals(a[key], b[bKeys[i]], options)) {
            return false;
          }
          i++;
          return true;
        });
      } else {
        i = 0;
        ret = aKeys.every(key => {
          if (!hasOwn(b, key)) {
            return false;
          }
          if (!EJSON.equals(a[key], b[key], options)) {
            return false;
          }
          i++;
          return true;
        });
      }
      return ret && i === bKeys.length;
    };

    /**
     * @summary Return a deep copy of `val`.
     * @locus Anywhere
     * @param {EJSON} val A value to copy.
     */
    EJSON.clone = v => {
      let ret;
      if (!isObject(v)) {
        return v;
      }
      if (v === null) {
        return null; // null has typeof "object"
      }
      if (v instanceof Date) {
        return new Date(v.getTime());
      }

      // RegExps are not really EJSON elements (eg we don't define a serialization
      // for them), but they're immutable anyway, so we can support them in clone.
      if (v instanceof RegExp) {
        return v;
      }
      if (EJSON.isBinary(v)) {
        ret = EJSON.newBinary(v.length);
        for (let i = 0; i < v.length; i++) {
          ret[i] = v[i];
        }
        return ret;
      }
      if (Array.isArray(v)) {
        return v.map(EJSON.clone);
      }
      if (isArguments(v)) {
        return Array.from(v).map(EJSON.clone);
      }

      // handle general user-defined typed Objects if they have a clone method
      if (isFunction(v.clone)) {
        return v.clone();
      }

      // handle other custom types
      if (EJSON._isCustomType(v)) {
        return EJSON.fromJSONValue(EJSON.clone(EJSON.toJSONValue(v)), true);
      }

      // handle other objects
      ret = {};
      keysOf(v).forEach(key => {
        ret[key] = EJSON.clone(v[key]);
      });
      return ret;
    };

    /**
     * @summary Allocate a new buffer of binary data that EJSON can serialize.
     * @locus Anywhere
     * @param {Number} size The number of bytes of binary data to allocate.
     */
    // EJSON.newBinary is the public documented API for this functionality,
    // but the implementation is in the 'base64' package to avoid
    // introducing a circular dependency. (If the implementation were here,
    // then 'base64' would have to use EJSON.newBinary, and 'ejson' would
    // also have to use 'base64'.)
    EJSON.newBinary = Base64.newBinary;
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"stringify.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                 //
// packages/ejson/stringify.js                                                                                     //
//                                                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                   //
// Based on json2.js from https://github.com/douglascrockford/JSON-js
//
//    json2.js
//    2012-10-08
//
//    Public Domain.
//
//    NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.

function quote(string) {
  return JSON.stringify(string);
}
const str = (key, holder, singleIndent, outerIndent, canonical) => {
  const value = holder[key];

  // What happens next depends on the value's type.
  switch (typeof value) {
    case 'string':
      return quote(value);
    case 'number':
      // JSON numbers must be finite. Encode non-finite numbers as null.
      return isFinite(value) ? String(value) : 'null';
    case 'boolean':
      return String(value);
    // If the type is 'object', we might be dealing with an object or an array or
    // null.
    case 'object':
      {
        // Due to a specification blunder in ECMAScript, typeof null is 'object',
        // so watch out for that case.
        if (!value) {
          return 'null';
        }
        // Make an array to hold the partial results of stringifying this object
        // value.
        const innerIndent = outerIndent + singleIndent;
        const partial = [];
        let v;

        // Is the value an array?
        if (Array.isArray(value) || {}.hasOwnProperty.call(value, 'callee')) {
          // The value is an array. Stringify every element. Use null as a
          // placeholder for non-JSON values.
          const length = value.length;
          for (let i = 0; i < length; i += 1) {
            partial[i] = str(i, value, singleIndent, innerIndent, canonical) || 'null';
          }

          // Join all of the elements together, separated with commas, and wrap
          // them in brackets.
          if (partial.length === 0) {
            v = '[]';
          } else if (innerIndent) {
            v = '[\n' + innerIndent + partial.join(',\n' + innerIndent) + '\n' + outerIndent + ']';
          } else {
            v = '[' + partial.join(',') + ']';
          }
          return v;
        }

        // Iterate through all of the keys in the object.
        let keys = Object.keys(value);
        if (canonical) {
          keys = keys.sort();
        }
        keys.forEach(k => {
          v = str(k, value, singleIndent, innerIndent, canonical);
          if (v) {
            partial.push(quote(k) + (innerIndent ? ': ' : ':') + v);
          }
        });

        // Join all of the member texts together, separated with commas,
        // and wrap them in braces.
        if (partial.length === 0) {
          v = '{}';
        } else if (innerIndent) {
          v = '{\n' + innerIndent + partial.join(',\n' + innerIndent) + '\n' + outerIndent + '}';
        } else {
          v = '{' + partial.join(',') + '}';
        }
        return v;
      }
    default: // Do nothing
  }
};

// If the JSON object does not yet have a stringify method, give it one.
const canonicalStringify = (value, options) => {
  // Make a fake root object containing our value under the key of ''.
  // Return the result of stringifying the value.
  const allOptions = Object.assign({
    indent: '',
    canonical: false
  }, options);
  if (allOptions.indent === true) {
    allOptions.indent = '  ';
  } else if (typeof allOptions.indent === 'number') {
    let newIndent = '';
    for (let i = 0; i < allOptions.indent; i++) {
      newIndent += ' ';
    }
    allOptions.indent = newIndent;
  }
  return str('', {
    '': value
  }, allOptions.indent, '', allOptions.canonical);
};
module.exportDefault(canonicalStringify);
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"utils.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                 //
// packages/ejson/utils.js                                                                                         //
//                                                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                   //
module.export({
  isFunction: () => isFunction,
  isObject: () => isObject,
  keysOf: () => keysOf,
  lengthOf: () => lengthOf,
  hasOwn: () => hasOwn,
  convertMapToObject: () => convertMapToObject,
  isArguments: () => isArguments,
  isInfOrNaN: () => isInfOrNaN,
  checkError: () => checkError,
  handleError: () => handleError
});
const isFunction = fn => typeof fn === 'function';
const isObject = fn => typeof fn === 'object';
const keysOf = obj => Object.keys(obj);
const lengthOf = obj => Object.keys(obj).length;
const hasOwn = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);
const convertMapToObject = map => Array.from(map).reduce((acc, _ref) => {
  let [key, value] = _ref;
  // reassign to not create new object
  acc[key] = value;
  return acc;
}, {});
const isArguments = obj => obj != null && hasOwn(obj, 'callee');
const isInfOrNaN = obj => Number.isNaN(obj) || obj === Infinity || obj === -Infinity;
const checkError = {
  maxStack: msgError => new RegExp('Maximum call stack size exceeded', 'g').test(msgError)
};
const handleError = fn => function () {
  try {
    return fn.apply(this, arguments);
  } catch (error) {
    const isMaxStack = checkError.maxStack(error.message);
    if (isMaxStack) {
      throw new Error('Converting circular structure to JSON');
    }
    throw error;
  }
};
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});


/* Exports */
return {
  export: function () { return {
      EJSON: EJSON
    };},
  require: require,
  eagerModulePaths: [
    "/node_modules/meteor/ejson/ejson.js"
  ],
  mainModulePath: "/node_modules/meteor/ejson/ejson.js"
}});

//# sourceURL=meteor://💻app/packages/ejson.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvZWpzb24vZWpzb24uanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL2Vqc29uL3N0cmluZ2lmeS5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvZWpzb24vdXRpbHMuanMiXSwibmFtZXMiOlsibW9kdWxlIiwiZXhwb3J0IiwiRUpTT04iLCJpc0Z1bmN0aW9uIiwiaXNPYmplY3QiLCJrZXlzT2YiLCJsZW5ndGhPZiIsImhhc093biIsImNvbnZlcnRNYXBUb09iamVjdCIsImlzQXJndW1lbnRzIiwiaXNJbmZPck5hTiIsImhhbmRsZUVycm9yIiwibGluayIsInYiLCJjYW5vbmljYWxTdHJpbmdpZnkiLCJkZWZhdWx0IiwiX19yZWlmeVdhaXRGb3JEZXBzX18iLCJjdXN0b21UeXBlcyIsIk1hcCIsImFkZFR5cGUiLCJuYW1lIiwiZmFjdG9yeSIsImhhcyIsIkVycm9yIiwiY29uY2F0Iiwic2V0IiwiYnVpbHRpbkNvbnZlcnRlcnMiLCJtYXRjaEpTT05WYWx1ZSIsIm9iaiIsIm1hdGNoT2JqZWN0IiwiRGF0ZSIsInRvSlNPTlZhbHVlIiwiJGRhdGUiLCJnZXRUaW1lIiwiZnJvbUpTT05WYWx1ZSIsIlJlZ0V4cCIsInJlZ2V4cCIsIiRyZWdleHAiLCJzb3VyY2UiLCIkZmxhZ3MiLCJmbGFncyIsInNsaWNlIiwicmVwbGFjZSIsInNpZ24iLCJOdW1iZXIiLCJpc05hTiIsIkluZmluaXR5IiwiJEluZk5hTiIsIlVpbnQ4QXJyYXkiLCIkYmluYXJ5IiwiQmFzZTY0IiwiZW5jb2RlIiwiZGVjb2RlIiwibWF0Y2giLCJrZXlDb3VudCIsInNvbWUiLCJjb252ZXJ0ZXIiLCJuZXdPYmoiLCJmb3JFYWNoIiwia2V5IiwiJGVzY2FwZSIsIl9pc0N1c3RvbVR5cGUiLCJqc29uVmFsdWUiLCJNZXRlb3IiLCJfbm9ZaWVsZHNBbGxvd2VkIiwiJHR5cGUiLCJ0eXBlTmFtZSIsIiR2YWx1ZSIsImdldCIsIl9nZXRUeXBlcyIsImlzT3JpZ2luYWwiLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJ1bmRlZmluZWQiLCJfZ2V0Q29udmVydGVycyIsInRvSlNPTlZhbHVlSGVscGVyIiwiaXRlbSIsImkiLCJhZGp1c3RUeXBlc1RvSlNPTlZhbHVlIiwibWF5YmVDaGFuZ2VkIiwidmFsdWUiLCJjaGFuZ2VkIiwiX2FkanVzdFR5cGVzVG9KU09OVmFsdWUiLCJuZXdJdGVtIiwiY2xvbmUiLCJmcm9tSlNPTlZhbHVlSGVscGVyIiwia2V5cyIsImV2ZXJ5IiwiayIsInN1YnN0ciIsImFkanVzdFR5cGVzRnJvbUpTT05WYWx1ZSIsIl9hZGp1c3RUeXBlc0Zyb21KU09OVmFsdWUiLCJzdHJpbmdpZnkiLCJvcHRpb25zIiwic2VyaWFsaXplZCIsImpzb24iLCJjYW5vbmljYWwiLCJpbmRlbnQiLCJKU09OIiwicGFyc2UiLCJpc0JpbmFyeSIsIiRVaW50OEFycmF5UG9seWZpbGwiLCJlcXVhbHMiLCJhIiwiYiIsImtleU9yZGVyU2Vuc2l0aXZlIiwidmFsdWVPZiIsImFJc0FycmF5IiwiQXJyYXkiLCJpc0FycmF5IiwiYklzQXJyYXkiLCJyZXQiLCJhS2V5cyIsImJLZXlzIiwibmV3QmluYXJ5IiwibWFwIiwiZnJvbSIsIl9fcmVpZnlfYXN5bmNfcmVzdWx0X18iLCJfcmVpZnlFcnJvciIsInNlbGYiLCJhc3luYyIsInF1b3RlIiwic3RyaW5nIiwic3RyIiwiaG9sZGVyIiwic2luZ2xlSW5kZW50Iiwib3V0ZXJJbmRlbnQiLCJpc0Zpbml0ZSIsIlN0cmluZyIsImlubmVySW5kZW50IiwicGFydGlhbCIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImpvaW4iLCJPYmplY3QiLCJzb3J0IiwicHVzaCIsImFsbE9wdGlvbnMiLCJhc3NpZ24iLCJuZXdJbmRlbnQiLCJleHBvcnREZWZhdWx0IiwiY2hlY2tFcnJvciIsImZuIiwicHJvcCIsInByb3RvdHlwZSIsInJlZHVjZSIsImFjYyIsIl9yZWYiLCJtYXhTdGFjayIsIm1zZ0Vycm9yIiwidGVzdCIs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QUFDTyxRQUFRLENBQUNJLEtBQUssQ0FBQ0UsT0FBTyxDQUFDO0lBQ3JELElBQUlELFVBQVUsRUFBRTtNQUNkLE1BQU0sSUFBSWxJLEtBQUssQ0FBQyx1Q0FBdUMsQ0FBQztJQUMxRDtJQUNBLE1BQU1pSSxLQUFLO0VBQ2I7QUFDRixDQUFDLEMiLCJmaWxlIjoiL3BhY2thZ2VzL2Vqc29uLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgaXNGdW5jdGlvbixcbiAgaXNPYmplY3QsXG4gIGtleXNPZixcbiAgbGVuZ3RoT2YsXG4gIGhhc093bixcbiAgY29udmVydE1hcFRvT2JqZWN0LFxuICBpc0FyZ3VtZW50cyxcbiAgaXNJbmZPck5hTixcbiAgaGFuZGxlRXJyb3IsXG59IGZyb20gJy4vdXRpbHMnO1xuaW1wb3J0IGNhbm9uaWNhbFN0cmluZ2lmeSBmcm9tICcuL3N0cmluZ2lmeSc7XG5cbi8qKlxuICogQG5hbWVzcGFjZVxuICogQHN1bW1hcnkgTmFtZXNwYWNlIGZvciBFSlNPTiBmdW5jdGlvbnNcbiAqL1xuY29uc3QgRUpTT04gPSB7fTtcblxuLy8gQ3VzdG9tIHR5cGUgaW50ZXJmYWNlIGRlZmluaXRpb25cbi8qKlxuICogQGNsYXNzIEN1c3RvbVR5cGVcbiAqIEBpbnN0YW5jZU5hbWUgY3VzdG9tVHlwZVxuICogQG1lbWJlck9mIEVKU09OXG4gKiBAc3VtbWFyeSBUaGUgaW50ZXJmYWNlIHRoYXQgYSBjbGFzcyBtdXN0IHNhdGlzZnkgdG8gYmUgYWJsZSB0byBiZWNvbWUgYW5cbiAqIEVKU09OIGN1c3RvbSB0eXBlIHZpYSBFSlNPTi5hZGRUeXBlLlxuICovXG5cbi8qKlxuICogQGZ1bmN0aW9uIHR5cGVOYW1lXG4gKiBAbWVtYmVyT2YgRUpTT04uQ3VzdG9tVHlwZVxuICogQHN1bW1hcnkgUmV0dXJuIHRoZSB0YWcgdXNlZCB0byBpZGVudGlmeSB0aGlzIHR5cGUuICBUaGlzIG11c3QgbWF0Y2ggdGhlXG4gKiAgICAgICAgICB0YWcgdXNlZCB0byByZWdpc3RlciB0aGlzIHR5cGUgd2l0aFxuICogICAgICAgICAgW2BFSlNPTi5hZGRUeXBlYF0oI2Vqc29uX2FkZF90eXBlKS5cbiAqIEBsb2N1cyBBbnl3aGVyZVxuICogQGluc3RhbmNlXG4gKi9cblxuLyoqXG4gKiBAZnVuY3Rpb24gdG9KU09OVmFsdWVcbiAqIEBtZW1iZXJPZiBFSlNPTi5DdXN0b21UeXBlXG4gKiBAc3VtbWFyeSBTZXJpYWxpemUgdGhpcyBpbnN0YW5jZSBpbnRvIGEgSlNPTi1jb21wYXRpYmxlIHZhbHVlLlxuICogQGxvY3VzIEFueXdoZXJlXG4gKiBAaW5zdGFuY2VcbiAqL1xuXG4vKipcbiAqIEBmdW5jdGlvbiBjbG9uZVxuICogQG1lbWJlck9mIEVKU09OLkN1c3RvbVR5cGVcbiAqIEBzdW1tYXJ5IFJldHVybiBhIHZhbHVlIGByYCBzdWNoIHRoYXQgYHRoaXMuZXF1YWxzKHIpYCBpcyB0cnVlLCBhbmRcbiAqICAgICAgICAgIG1vZGlmaWNhdGlvbnMgdG8gYHJgIGRvIG5vdCBhZmZlY3QgYHRoaXNgIGFuZCB2aWNlIHZlcnNhLlxuICogQGxvY3VzIEFueXdoZXJlXG4gKiBAaW5zdGFuY2VcbiAqL1xuXG4vKipcbiAqIEBmdW5jdGlvbiBlcXVhbHNcbiAqIEBtZW1iZXJPZiBFSlNPTi5DdXN0b21UeXBlXG4gKiBAc3VtbWFyeSBSZXR1cm4gYHRydWVgIGlmIGBvdGhlcmAgaGFzIGEgdmFsdWUgZXF1YWwgdG8gYHRoaXNgOyBgZmFsc2VgXG4gKiAgICAgICAgICBvdGhlcndpc2UuXG4gKiBAbG9jdXMgQW55d2hlcmVcbiAqIEBwYXJhbSB7T2JqZWN0fSBvdGhlciBBbm90aGVyIG9iamVjdCB0byBjb21wYXJlIHRoaXMgdG8uXG4gKiBAaW5zdGFuY2VcbiAqL1xuXG5jb25zdCBjdXN0b21UeXBlcyA9IG5ldyBNYXAoKTtcblxuLy8gQWRkIGEgY3VzdG9tIHR5cGUsIHVzaW5nIGEgbWV0aG9kIG9mIHlvdXIgY2hvaWNlIHRvIGdldCB0byBhbmRcbi8vIGZyb20gYSBiYXNpYyBKU09OLWFibGUgcmVwcmVzZW50YXRpb24uICBUaGUgZmFjdG9yeSBhcmd1bWVudFxuLy8gaXMgYSBmdW5jdGlvbiBvZiBKU09OLWFibGUgLS0+IHlvdXIgb2JqZWN0XG4vLyBUaGUgdHlwZSB5b3UgYWRkIG11c3QgaGF2ZTpcbi8vIC0gQSB0b0pTT05WYWx1ZSgpIG1ldGhvZCwgc28gdGhhdCBNZXRlb3IgY2FuIHNlcmlhbGl6ZSBpdFxuLy8gLSBhIHR5cGVOYW1lKCkgbWV0aG9kLCB0byBzaG93IGhvdyB0byBsb29rIGl0IHVwIGluIG91ciB0eXBlIHRhYmxlLlxuLy8gSXQgaXMgb2theSBpZiB0aGVzZSBtZXRob2RzIGFyZSBtb25rZXktcGF0Y2hlZCBvbi5cbi8vIEVKU09OLmNsb25lIHdpbGwgdXNlIHRvSlNPTlZhbHVlIGFuZCB0aGUgZ2l2ZW4gZmFjdG9yeSB0byBwcm9kdWNlXG4vLyBhIGNsb25lLCBidXQgeW91IG1heSBzcGVjaWZ5IGEgbWV0aG9kIGNsb25lKCkgdGhhdCB3aWxsIGJlXG4vLyB1c2VkIGluc3RlYWQuXG4vLyBTaW1pbGFybHksIEVKU09OLmVxdWFscyB3aWxsIHVzZSB0b0pTT05WYWx1ZSB0byBtYWtlIGNvbXBhcmlzb25zLFxuLy8gYnV0IHlvdSBtYXkgcHJvdmlkZSBhIG1ldGhvZCBlcXVhbHMoKSBpbnN0ZWFkLlxuLyoqXG4gKiBAc3VtbWFyeSBBZGQgYSBjdXN0b20gZGF0YXR5cGUgdG8gRUpTT04uXG4gKiBAbG9jdXMgQW55d2hlcmVcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIEEgdGFnIGZvciB5b3VyIGN1c3RvbSB0eXBlOyBtdXN0IGJlIHVuaXF1ZSBhbW9uZ1xuICogICAgICAgICAgICAgICAgICAgICAgY3VzdG9tIGRhdGEgdHlwZXMgZGVmaW5lZCBpbiB5b3VyIHByb2plY3QsIGFuZCBtdXN0XG4gKiAgICAgICAgICAgICAgICAgICAgICBtYXRjaCB0aGUgcmVzdWx0IG9mIHlvdXIgdHlwZSdzIGB0eXBlTmFtZWAgbWV0aG9kLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZmFjdG9yeSBBIGZ1bmN0aW9uIHRoYXQgZGVzZXJpYWxpemVzIGEgSlNPTi1jb21wYXRpYmxlXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlIGludG8gYW4gaW5zdGFuY2Ugb2YgeW91ciB0eXBlLiAgVGhpcyBzaG91bGRcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF0Y2ggdGhlIHNlcmlhbGl6YXRpb24gcGVyZm9ybWVkIGJ5IHlvdXJcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZSdzIGB0b0pTT05WYWx1ZWAgbWV0aG9kLlxuICovXG5FSlNPTi5hZGRUeXBlID0gKG5hbWUsIGZhY3RvcnkpID0+IHtcbiAgaWYgKGN1c3RvbVR5cGVzLmhhcyhuYW1lKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgVHlwZSAke25hbWV9IGFscmVhZHkgcHJlc2VudGApO1xuICB9XG4gIGN1c3RvbVR5cGVzLnNldChuYW1lLCBmYWN0b3J5KTtcbn07XG5cbmNvbnN0IGJ1aWx0aW5Db252ZXJ0ZXJzID0gW1xuICB7IC8vIERhdGVcbiAgICBtYXRjaEpTT05WYWx1ZShvYmopIHtcbiAgICAgIHJldHVybiBoYXNPd24ob2JqLCAnJGRhdGUnKSAmJiBsZW5ndGhPZihvYmopID09PSAxO1xuICAgIH0sXG4gICAgbWF0Y2hPYmplY3Qob2JqKSB7XG4gICAgICByZXR1cm4gb2JqIGluc3RhbmNlb2YgRGF0ZTtcbiAgICB9LFxuICAgIHRvSlNPTlZhbHVlKG9iaikge1xuICAgICAgcmV0dXJuIHskZGF0ZTogb2JqLmdldFRpbWUoKX07XG4gICAgfSxcbiAgICBmcm9tSlNPTlZhbHVlKG9iaikge1xuICAgICAgcmV0dXJuIG5ldyBEYXRlKG9iai4kZGF0ZSk7XG4gICAgfSxcbiAgfSxcbiAgeyAvLyBSZWdFeHBcbiAgICBtYXRjaEpTT05WYWx1ZShvYmopIHtcbiAgICAgIHJldHVybiBoYXNPd24ob2JqLCAnJHJlZ2V4cCcpXG4gICAgICAgICYmIGhhc093bihvYmosICckZmxhZ3MnKVxuICAgICAgICAmJiBsZW5ndGhPZihvYmopID09PSAyO1xuICAgIH0sXG4gICAgbWF0Y2hPYmplY3Qob2JqKSB7XG4gICAgICByZXR1cm4gb2JqIGluc3RhbmNlb2YgUmVnRXhwO1xuICAgIH0sXG4gICAgdG9KU09OVmFsdWUocmVnZXhwKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICAkcmVnZXhwOiByZWdleHAuc291cmNlLFxuICAgICAgICAkZmxhZ3M6IHJlZ2V4cC5mbGFnc1xuICAgICAgfTtcbiAgICB9LFxuICAgIGZyb21KU09OVmFsdWUob2JqKSB7XG4gICAgICAvLyBSZXBsYWNlcyBkdXBsaWNhdGUgLyBpbnZhbGlkIGZsYWdzLlxuICAgICAgcmV0dXJuIG5ldyBSZWdFeHAoXG4gICAgICAgIG9iai4kcmVnZXhwLFxuICAgICAgICBvYmouJGZsYWdzXG4gICAgICAgICAgLy8gQ3V0IG9mZiBmbGFncyBhdCA1MCBjaGFycyB0byBhdm9pZCBhYnVzaW5nIFJlZ0V4cCBmb3IgRE9TLlxuICAgICAgICAgIC5zbGljZSgwLCA1MClcbiAgICAgICAgICAucmVwbGFjZSgvW15naW11eV0vZywnJylcbiAgICAgICAgICAucmVwbGFjZSgvKC4pKD89LipcXDEpL2csICcnKVxuICAgICAgKTtcbiAgICB9LFxuICB9LFxuICB7IC8vIE5hTiwgSW5mLCAtSW5mLiAoVGhlc2UgYXJlIHRoZSBvbmx5IG9iamVjdHMgd2l0aCB0eXBlb2YgIT09ICdvYmplY3QnXG4gICAgLy8gd2hpY2ggd2UgbWF0Y2guKVxuICAgIG1hdGNoSlNPTlZhbHVlKG9iaikge1xuICAgICAgcmV0dXJuIGhhc093bihvYmosICckSW5mTmFOJykgJiYgbGVuZ3RoT2Yob2JqKSA9PT0gMTtcbiAgICB9LFxuICAgIG1hdGNoT2JqZWN0OiBpc0luZk9yTmFOLFxuICAgIHRvSlNPTlZhbHVlKG9iaikge1xuICAgICAgbGV0IHNpZ247XG4gICAgICBpZiAoTnVtYmVyLmlzTmFOKG9iaikpIHtcbiAgICAgICAgc2lnbiA9IDA7XG4gICAgICB9IGVsc2UgaWYgKG9iaiA9PT0gSW5maW5pdHkpIHtcbiAgICAgICAgc2lnbiA9IDE7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzaWduID0gLTE7XG4gICAgICB9XG4gICAgICByZXR1cm4geyRJbmZOYU46IHNpZ259O1xuICAgIH0sXG4gICAgZnJvbUpTT05WYWx1ZShvYmopIHtcbiAgICAgIHJldHVybiBvYmouJEluZk5hTiAvIDA7XG4gICAgfSxcbiAgfSxcbiAgeyAvLyBCaW5hcnlcbiAgICBtYXRjaEpTT05WYWx1ZShvYmopIHtcbiAgICAgIHJldHVybiBoYXNPd24ob2JqLCAnJGJpbmFyeScpICYmIGxlbmd0aE9mKG9iaikgPT09IDE7XG4gICAgfSxcbiAgICBtYXRjaE9iamVjdChvYmopIHtcbiAgICAgIHJldHVybiB0eXBlb2YgVWludDhBcnJheSAhPT0gJ3VuZGVmaW5lZCcgJiYgb2JqIGluc3RhbmNlb2YgVWludDhBcnJheVxuICAgICAgICB8fCAob2JqICYmIGhhc093bihvYmosICckVWludDhBcnJheVBvbHlmaWxsJykpO1xuICAgIH0sXG4gICAgdG9KU09OVmFsdWUob2JqKSB7XG4gICAgICByZXR1cm4geyRiaW5hcnk6IEJhc2U2NC5lbmNvZGUob2JqKX07XG4gICAgfSxcbiAgICBmcm9tSlNPTlZhbHVlKG9iaikge1xuICAgICAgcmV0dXJuIEJhc2U2NC5kZWNvZGUob2JqLiRiaW5hcnkpO1xuICAgIH0sXG4gIH0sXG4gIHsgLy8gRXNjYXBpbmcgb25lIGxldmVsXG4gICAgbWF0Y2hKU09OVmFsdWUob2JqKSB7XG4gICAgICByZXR1cm4gaGFzT3duKG9iaiwgJyRlc2NhcGUnKSAmJiBsZW5ndGhPZihvYmopID09PSAxO1xuICAgIH0sXG4gICAgbWF0Y2hPYmplY3Qob2JqKSB7XG4gICAgICBsZXQgbWF0Y2ggPSBmYWxzZTtcbiAgICAgIGlmIChvYmopIHtcbiAgICAgICAgY29uc3Qga2V5Q291bnQgPSBsZW5ndGhPZihvYmopO1xuICAgICAgICBpZiAoa2V5Q291bnQgPT09IDEgfHwga2V5Q291bnQgPT09IDIpIHtcbiAgICAgICAgICBtYXRjaCA9XG4gICAgICAgICAgICBidWlsdGluQ29udmVydGVycy5zb21lKGNvbnZlcnRlciA9PiBjb252ZXJ0ZXIubWF0Y2hKU09OVmFsdWUob2JqKSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBtYXRjaDtcbiAgICB9LFxuICAgIHRvSlNPTlZhbHVlKG9iaikge1xuICAgICAgY29uc3QgbmV3T2JqID0ge307XG4gICAgICBrZXlzT2Yob2JqKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgIG5ld09ialtrZXldID0gRUpTT04udG9KU09OVmFsdWUob2JqW2tleV0pO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4geyRlc2NhcGU6IG5ld09ian07XG4gICAgfSxcbiAgICBmcm9tSlNPTlZhbHVlKG9iaikge1xuICAgICAgY29uc3QgbmV3T2JqID0ge307XG4gICAgICBrZXlzT2Yob2JqLiRlc2NhcGUpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgbmV3T2JqW2tleV0gPSBFSlNPTi5mcm9tSlNPTlZhbHVlKG9iai4kZXNjYXBlW2tleV0pO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4gbmV3T2JqO1xuICAgIH0sXG4gIH0sXG4gIHsgLy8gQ3VzdG9tXG4gICAgbWF0Y2hKU09OVmFsdWUob2JqKSB7XG4gICAgICByZXR1cm4gaGFzT3duKG9iaiwgJyR0eXBlJylcbiAgICAgICAgJiYgaGFzT3duKG9iaiwgJyR2YWx1ZScpICYmIGxlbmd0aE9mKG9iaikgPT09IDI7XG4gICAgfSxcbiAgICBtYXRjaE9iamVjdChvYmopIHtcbiAgICAgIHJldHVybiBFSlNPTi5faXNDdXN0b21UeXBlKG9iaik7XG4gICAgfSxcbiAgICB0b0pTT05WYWx1ZShvYmopIHtcbiAgICAgIGNvbnN0IGpzb25WYWx1ZSA9IE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkKCgpID0+IG9iai50b0pTT05WYWx1ZSgpKTtcbiAgICAgIHJldHVybiB7JHR5cGU6IG9iai50eXBlTmFtZSgpLCAkdmFsdWU6IGpzb25WYWx1ZX07XG4gICAgfSxcbiAgICBmcm9tSlNPTlZhbHVlKG9iaikge1xuICAgICAgY29uc3QgdHlwZU5hbWUgPSBvYmouJHR5cGU7XG4gICAgICBpZiAoIWN1c3RvbVR5cGVzLmhhcyh0eXBlTmFtZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDdXN0b20gRUpTT04gdHlwZSAke3R5cGVOYW1lfSBpcyBub3QgZGVmaW5lZGApO1xuICAgICAgfVxuICAgICAgY29uc3QgY29udmVydGVyID0gY3VzdG9tVHlwZXMuZ2V0KHR5cGVOYW1lKTtcbiAgICAgIHJldHVybiBNZXRlb3IuX25vWWllbGRzQWxsb3dlZCgoKSA9PiBjb252ZXJ0ZXIob2JqLiR2YWx1ZSkpO1xuICAgIH0sXG4gIH0sXG5dO1xuXG5FSlNPTi5faXNDdXN0b21UeXBlID0gKG9iaikgPT4gKFxuICBvYmogJiZcbiAgaXNGdW5jdGlvbihvYmoudG9KU09OVmFsdWUpICYmXG4gIGlzRnVuY3Rpb24ob2JqLnR5cGVOYW1lKSAmJlxuICBjdXN0b21UeXBlcy5oYXMob2JqLnR5cGVOYW1lKCkpXG4pO1xuXG5FSlNPTi5fZ2V0VHlwZXMgPSAoaXNPcmlnaW5hbCA9IGZhbHNlKSA9PiAoaXNPcmlnaW5hbCA/IGN1c3RvbVR5cGVzIDogY29udmVydE1hcFRvT2JqZWN0KGN1c3RvbVR5cGVzKSk7XG5cbkVKU09OLl9nZXRDb252ZXJ0ZXJzID0gKCkgPT4gYnVpbHRpbkNvbnZlcnRlcnM7XG5cbi8vIEVpdGhlciByZXR1cm4gdGhlIEpTT04tY29tcGF0aWJsZSB2ZXJzaW9uIG9mIHRoZSBhcmd1bWVudCwgb3IgdW5kZWZpbmVkIChpZlxuLy8gdGhlIGl0ZW0gaXNuJ3QgaXRzZWxmIHJlcGxhY2VhYmxlLCBidXQgbWF5YmUgc29tZSBmaWVsZHMgaW4gaXQgYXJlKVxuY29uc3QgdG9KU09OVmFsdWVIZWxwZXIgPSBpdGVtID0+IHtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBidWlsdGluQ29udmVydGVycy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGNvbnZlcnRlciA9IGJ1aWx0aW5Db252ZXJ0ZXJzW2ldO1xuICAgIGlmIChjb252ZXJ0ZXIubWF0Y2hPYmplY3QoaXRlbSkpIHtcbiAgICAgIHJldHVybiBjb252ZXJ0ZXIudG9KU09OVmFsdWUoaXRlbSk7XG4gICAgfVxuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59O1xuXG4vLyBmb3IgYm90aCBhcnJheXMgYW5kIG9iamVjdHMsIGluLXBsYWNlIG1vZGlmaWNhdGlvbi5cbmNvbnN0IGFkanVzdFR5cGVzVG9KU09OVmFsdWUgPSBvYmogPT4ge1xuICAvLyBJcyBpdCBhbiBhdG9tIHRoYXQgd2UgbmVlZCB0byBhZGp1c3Q/XG4gIGlmIChvYmogPT09IG51bGwpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGNvbnN0IG1heWJlQ2hhbmdlZCA9IHRvSlNPTlZhbHVlSGVscGVyKG9iaik7XG4gIGlmIChtYXliZUNoYW5nZWQgIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBtYXliZUNoYW5nZWQ7XG4gIH1cblxuICAvLyBPdGhlciBhdG9tcyBhcmUgdW5jaGFuZ2VkLlxuICBpZiAoIWlzT2JqZWN0KG9iaikpIHtcbiAgICByZXR1cm4gb2JqO1xuICB9XG5cbiAgLy8gSXRlcmF0ZSBvdmVyIGFycmF5IG9yIG9iamVjdCBzdHJ1Y3R1cmUuXG4gIGtleXNPZihvYmopLmZvckVhY2goa2V5ID0+IHtcbiAgICBjb25zdCB2YWx1ZSA9IG9ialtrZXldO1xuICAgIGlmICghaXNPYmplY3QodmFsdWUpICYmIHZhbHVlICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgIWlzSW5mT3JOYU4odmFsdWUpKSB7XG4gICAgICByZXR1cm47IC8vIGNvbnRpbnVlXG4gICAgfVxuXG4gICAgY29uc3QgY2hhbmdlZCA9IHRvSlNPTlZhbHVlSGVscGVyKHZhbHVlKTtcbiAgICBpZiAoY2hhbmdlZCkge1xuICAgICAgb2JqW2tleV0gPSBjaGFuZ2VkO1xuICAgICAgcmV0dXJuOyAvLyBvbiB0byB0aGUgbmV4dCBrZXlcbiAgICB9XG4gICAgLy8gaWYgd2UgZ2V0IGhlcmUsIHZhbHVlIGlzIGFuIG9iamVjdCBidXQgbm90IGFkanVzdGFibGVcbiAgICAvLyBhdCB0aGlzIGxldmVsLiAgcmVjdXJzZS5cbiAgICBhZGp1c3RUeXBlc1RvSlNPTlZhbHVlKHZhbHVlKTtcbiAgfSk7XG4gIHJldHVybiBvYmo7XG59O1xuXG5FSlNPTi5fYWRqdXN0VHlwZXNUb0pTT05WYWx1ZSA9IGFkanVzdFR5cGVzVG9KU09OVmFsdWU7XG5cbi8qKlxuICogQHN1bW1hcnkgU2VyaWFsaXplIGFuIEVKU09OLWNvbXBhdGlibGUgdmFsdWUgaW50byBpdHMgcGxhaW4gSlNPTlxuICogICAgICAgICAgcmVwcmVzZW50YXRpb24uXG4gKiBAbG9jdXMgQW55d2hlcmVcbiAqIEBwYXJhbSB7RUpTT059IHZhbCBBIHZhbHVlIHRvIHNlcmlhbGl6ZSB0byBwbGFpbiBKU09OLlxuICovXG5FSlNPTi50b0pTT05WYWx1ZSA9IGl0ZW0gPT4ge1xuICBjb25zdCBjaGFuZ2VkID0gdG9KU09OVmFsdWVIZWxwZXIoaXRlbSk7XG4gIGlmIChjaGFuZ2VkICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gY2hhbmdlZDtcbiAgfVxuXG4gIGxldCBuZXdJdGVtID0gaXRlbTtcbiAgaWYgKGlzT2JqZWN0KGl0ZW0pKSB7XG4gICAgbmV3SXRlbSA9IEVKU09OLmNsb25lKGl0ZW0pO1xuICAgIGFkanVzdFR5cGVzVG9KU09OVmFsdWUobmV3SXRlbSk7XG4gIH1cbiAgcmV0dXJuIG5ld0l0ZW07XG59O1xuXG4vLyBFaXRoZXIgcmV0dXJuIHRoZSBhcmd1bWVudCBjaGFuZ2VkIHRvIGhhdmUgdGhlIG5vbi1qc29uXG4vLyByZXAgb2YgaXRzZWxmICh0aGUgT2JqZWN0IHZlcnNpb24pIG9yIHRoZSBhcmd1bWVudCBpdHNlbGYuXG4vLyBET0VTIE5PVCBSRUNVUlNFLiAgRm9yIGFjdHVhbGx5IGdldHRpbmcgdGhlIGZ1bGx5LWNoYW5nZWQgdmFsdWUsIHVzZVxuLy8gRUpTT04uZnJvbUpTT05WYWx1ZVxuY29uc3QgZnJvbUpTT05WYWx1ZUhlbHBlciA9IHZhbHVlID0+IHtcbiAgaWYgKGlzT2JqZWN0KHZhbHVlKSAmJiB2YWx1ZSAhPT0gbnVsbCkge1xuICAgIGNvbnN0IGtleXMgPSBrZXlzT2YodmFsdWUpO1xuICAgIGlmIChrZXlzLmxlbmd0aCA8PSAyXG4gICAgICAgICYmIGtleXMuZXZlcnkoayA9PiB0eXBlb2YgayA9PT0gJ3N0cmluZycgJiYgay5zdWJzdHIoMCwgMSkgPT09ICckJykpIHtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYnVpbHRpbkNvbnZlcnRlcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgY29udmVydGVyID0gYnVpbHRpbkNvbnZlcnRlcnNbaV07XG4gICAgICAgIGlmIChjb252ZXJ0ZXIubWF0Y2hKU09OVmFsdWUodmFsdWUpKSB7XG4gICAgICAgICAgcmV0dXJuIGNvbnZlcnRlci5mcm9tSlNPTlZhbHVlKHZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gdmFsdWU7XG59O1xuXG4vLyBmb3IgYm90aCBhcnJheXMgYW5kIG9iamVjdHMuIFRyaWVzIGl0cyBiZXN0IHRvIGp1c3Rcbi8vIHVzZSB0aGUgb2JqZWN0IHlvdSBoYW5kIGl0LCBidXQgbWF5IHJldHVybiBzb21ldGhpbmdcbi8vIGRpZmZlcmVudCBpZiB0aGUgb2JqZWN0IHlvdSBoYW5kIGl0IGl0c2VsZiBuZWVkcyBjaGFuZ2luZy5cbmNvbnN0IGFkanVzdFR5cGVzRnJvbUpTT05WYWx1ZSA9IG9iaiA9PiB7XG4gIGlmIChvYmogPT09IG51bGwpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGNvbnN0IG1heWJlQ2hhbmdlZCA9IGZyb21KU09OVmFsdWVIZWxwZXIob2JqKTtcbiAgaWYgKG1heWJlQ2hhbmdlZCAhPT0gb2JqKSB7XG4gICAgcmV0dXJuIG1heWJlQ2hhbmdlZDtcbiAgfVxuXG4gIC8vIE90aGVyIGF0b21zIGFyZSB1bmNoYW5nZWQuXG4gIGlmICghaXNPYmplY3Qob2JqKSkge1xuICAgIHJldHVybiBvYmo7XG4gIH1cblxuICBrZXlzT2Yob2JqKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgY29uc3QgdmFsdWUgPSBvYmpba2V5XTtcbiAgICBpZiAoaXNPYmplY3QodmFsdWUpKSB7XG4gICAgICBjb25zdCBjaGFuZ2VkID0gZnJvbUpTT05WYWx1ZUhlbHBlcih2YWx1ZSk7XG4gICAgICBpZiAodmFsdWUgIT09IGNoYW5nZWQpIHtcbiAgICAgICAgb2JqW2tleV0gPSBjaGFuZ2VkO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICAvLyBpZiB3ZSBnZXQgaGVyZSwgdmFsdWUgaXMgYW4gb2JqZWN0IGJ1dCBub3QgYWRqdXN0YWJsZVxuICAgICAgLy8gYXQgdGhpcyBsZXZlbC4gIHJlY3Vyc2UuXG4gICAgICBhZGp1c3RUeXBlc0Zyb21KU09OVmFsdWUodmFsdWUpO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBvYmo7XG59O1xuXG5FSlNPTi5fYWRqdXN0VHlwZXNGcm9tSlNPTlZhbHVlID0gYWRqdXN0VHlwZXNGcm9tSlNPTlZhbHVlO1xuXG4vKipcbiAqIEBzdW1tYXJ5IERlc2VyaWFsaXplIGFuIEVKU09OIHZhbHVlIGZyb20gaXRzIHBsYWluIEpTT04gcmVwcmVzZW50YXRpb24uXG4gKiBAbG9jdXMgQW55d2hlcmVcbiAqIEBwYXJhbSB7SlNPTkNvbXBhdGlibGV9IHZhbCBBIHZhbHVlIHRvIGRlc2VyaWFsaXplIGludG8gRUpTT04uXG4gKi9cbkVKU09OLmZyb21KU09OVmFsdWUgPSBpdGVtID0+IHtcbiAgbGV0IGNoYW5nZWQgPSBmcm9tSlNPTlZhbHVlSGVscGVyKGl0ZW0pO1xuICBpZiAoY2hhbmdlZCA9PT0gaXRlbSAmJiBpc09iamVjdChpdGVtKSkge1xuICAgIGNoYW5nZWQgPSBFSlNPTi5jbG9uZShpdGVtKTtcbiAgICBhZGp1c3RUeXBlc0Zyb21KU09OVmFsdWUoY2hhbmdlZCk7XG4gIH1cbiAgcmV0dXJuIGNoYW5nZWQ7XG59O1xuXG4vKipcbiAqIEBzdW1tYXJ5IFNlcmlhbGl6ZSBhIHZhbHVlIHRvIGEgc3RyaW5nLiBGb3IgRUpTT04gdmFsdWVzLCB0aGUgc2VyaWFsaXphdGlvblxuICogICAgICAgICAgZnVsbHkgcmVwcmVzZW50cyB0aGUgdmFsdWUuIEZvciBub24tRUpTT04gdmFsdWVzLCBzZXJpYWxpemVzIHRoZVxuICogICAgICAgICAgc2FtZSB3YXkgYXMgYEpTT04uc3RyaW5naWZ5YC5cbiAqIEBsb2N1cyBBbnl3aGVyZVxuICogQHBhcmFtIHtFSlNPTn0gdmFsIEEgdmFsdWUgdG8gc3RyaW5naWZ5LlxuICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXVxuICogQHBhcmFtIHtCb29sZWFuIHwgSW50ZWdlciB8IFN0cmluZ30gW29wdGlvbnMuaW5kZW50XSBJbmRlbnRzIG9iamVjdHMgYW5kXG4gKiBhcnJheXMgZm9yIGVhc3kgcmVhZGFiaWxpdHkuICBXaGVuIGB0cnVlYCwgaW5kZW50cyBieSAyIHNwYWNlczsgd2hlbiBhblxuICogaW50ZWdlciwgaW5kZW50cyBieSB0aGF0IG51bWJlciBvZiBzcGFjZXM7IGFuZCB3aGVuIGEgc3RyaW5nLCB1c2VzIHRoZVxuICogc3RyaW5nIGFzIHRoZSBpbmRlbnRhdGlvbiBwYXR0ZXJuLlxuICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5jYW5vbmljYWxdIFdoZW4gYHRydWVgLCBzdHJpbmdpZmllcyBrZXlzIGluIGFuXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9iamVjdCBpbiBzb3J0ZWQgb3JkZXIuXG4gKi9cbkVKU09OLnN0cmluZ2lmeSA9IGhhbmRsZUVycm9yKChpdGVtLCBvcHRpb25zKSA9PiB7XG4gIGxldCBzZXJpYWxpemVkO1xuICBjb25zdCBqc29uID0gRUpTT04udG9KU09OVmFsdWUoaXRlbSk7XG4gIGlmIChvcHRpb25zICYmIChvcHRpb25zLmNhbm9uaWNhbCB8fCBvcHRpb25zLmluZGVudCkpIHtcbiAgICBzZXJpYWxpemVkID0gY2Fub25pY2FsU3RyaW5naWZ5KGpzb24sIG9wdGlvbnMpO1xuICB9IGVsc2Uge1xuICAgIHNlcmlhbGl6ZWQgPSBKU09OLnN0cmluZ2lmeShqc29uKTtcbiAgfVxuICByZXR1cm4gc2VyaWFsaXplZDtcbn0pO1xuXG4vKipcbiAqIEBzdW1tYXJ5IFBhcnNlIGEgc3RyaW5nIGludG8gYW4gRUpTT04gdmFsdWUuIFRocm93cyBhbiBlcnJvciBpZiB0aGUgc3RyaW5nXG4gKiAgICAgICAgICBpcyBub3QgdmFsaWQgRUpTT04uXG4gKiBAbG9jdXMgQW55d2hlcmVcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHIgQSBzdHJpbmcgdG8gcGFyc2UgaW50byBhbiBFSlNPTiB2YWx1ZS5cbiAqL1xuRUpTT04ucGFyc2UgPSBpdGVtID0+IHtcbiAgaWYgKHR5cGVvZiBpdGVtICE9PSAnc3RyaW5nJykge1xuICAgIHRocm93IG5ldyBFcnJvcignRUpTT04ucGFyc2UgYXJndW1lbnQgc2hvdWxkIGJlIGEgc3RyaW5nJyk7XG4gIH1cbiAgcmV0dXJuIEVKU09OLmZyb21KU09OVmFsdWUoSlNPTi5wYXJzZShpdGVtKSk7XG59O1xuXG4vKipcbiAqIEBzdW1tYXJ5IFJldHVybnMgdHJ1ZSBpZiBgeGAgaXMgYSBidWZmZXIgb2YgYmluYXJ5IGRhdGEsIGFzIHJldHVybmVkIGZyb21cbiAqICAgICAgICAgIFtgRUpTT04ubmV3QmluYXJ5YF0oI2Vqc29uX25ld19iaW5hcnkpLlxuICogQHBhcmFtIHtPYmplY3R9IHggVGhlIHZhcmlhYmxlIHRvIGNoZWNrLlxuICogQGxvY3VzIEFueXdoZXJlXG4gKi9cbkVKU09OLmlzQmluYXJ5ID0gb2JqID0+IHtcbiAgcmV0dXJuICEhKCh0eXBlb2YgVWludDhBcnJheSAhPT0gJ3VuZGVmaW5lZCcgJiYgb2JqIGluc3RhbmNlb2YgVWludDhBcnJheSkgfHxcbiAgICAob2JqICYmIG9iai4kVWludDhBcnJheVBvbHlmaWxsKSk7XG59O1xuXG4vKipcbiAqIEBzdW1tYXJ5IFJldHVybiB0cnVlIGlmIGBhYCBhbmQgYGJgIGFyZSBlcXVhbCB0byBlYWNoIG90aGVyLiAgUmV0dXJuIGZhbHNlXG4gKiAgICAgICAgICBvdGhlcndpc2UuICBVc2VzIHRoZSBgZXF1YWxzYCBtZXRob2Qgb24gYGFgIGlmIHByZXNlbnQsIG90aGVyd2lzZVxuICogICAgICAgICAgcGVyZm9ybXMgYSBkZWVwIGNvbXBhcmlzb24uXG4gKiBAbG9jdXMgQW55d2hlcmVcbiAqIEBwYXJhbSB7RUpTT059IGFcbiAqIEBwYXJhbSB7RUpTT059IGJcbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc11cbiAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0aW9ucy5rZXlPcmRlclNlbnNpdGl2ZSBDb21wYXJlIGluIGtleSBzZW5zaXRpdmUgb3JkZXIsXG4gKiBpZiBzdXBwb3J0ZWQgYnkgdGhlIEphdmFTY3JpcHQgaW1wbGVtZW50YXRpb24uICBGb3IgZXhhbXBsZSwgYHthOiAxLCBiOiAyfWBcbiAqIGlzIGVxdWFsIHRvIGB7YjogMiwgYTogMX1gIG9ubHkgd2hlbiBga2V5T3JkZXJTZW5zaXRpdmVgIGlzIGBmYWxzZWAuICBUaGVcbiAqIGRlZmF1bHQgaXMgYGZhbHNlYC5cbiAqL1xuRUpTT04uZXF1YWxzID0gKGEsIGIsIG9wdGlvbnMpID0+IHtcbiAgbGV0IGk7XG4gIGNvbnN0IGtleU9yZGVyU2Vuc2l0aXZlID0gISEob3B0aW9ucyAmJiBvcHRpb25zLmtleU9yZGVyU2Vuc2l0aXZlKTtcbiAgaWYgKGEgPT09IGIpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIC8vIFRoaXMgZGlmZmVycyBmcm9tIHRoZSBJRUVFIHNwZWMgZm9yIE5hTiBlcXVhbGl0eSwgYi9jIHdlIGRvbid0IHdhbnRcbiAgLy8gYW55dGhpbmcgZXZlciB3aXRoIGEgTmFOIHRvIGJlIHBvaXNvbmVkIGZyb20gYmVjb21pbmcgZXF1YWwgdG8gYW55dGhpbmcuXG4gIGlmIChOdW1iZXIuaXNOYU4oYSkgJiYgTnVtYmVyLmlzTmFOKGIpKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICAvLyBpZiBlaXRoZXIgb25lIGlzIGZhbHN5LCB0aGV5J2QgaGF2ZSB0byBiZSA9PT0gdG8gYmUgZXF1YWxcbiAgaWYgKCFhIHx8ICFiKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKCEoaXNPYmplY3QoYSkgJiYgaXNPYmplY3QoYikpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKGEgaW5zdGFuY2VvZiBEYXRlICYmIGIgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgcmV0dXJuIGEudmFsdWVPZigpID09PSBiLnZhbHVlT2YoKTtcbiAgfVxuXG4gIGlmIChFSlNPTi5pc0JpbmFyeShhKSAmJiBFSlNPTi5pc0JpbmFyeShiKSkge1xuICAgIGlmIChhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgZm9yIChpID0gMDsgaSA8IGEubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChhW2ldICE9PSBiW2ldKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNGdW5jdGlvbihhLmVxdWFscykpIHtcbiAgICByZXR1cm4gYS5lcXVhbHMoYiwgb3B0aW9ucyk7XG4gIH1cblxuICBpZiAoaXNGdW5jdGlvbihiLmVxdWFscykpIHtcbiAgICByZXR1cm4gYi5lcXVhbHMoYSwgb3B0aW9ucyk7XG4gIH1cblxuICAvLyBBcnJheS5pc0FycmF5IHdvcmtzIGFjcm9zcyBpZnJhbWVzIHdoaWxlIGluc3RhbmNlb2Ygd29uJ3RcbiAgY29uc3QgYUlzQXJyYXkgPSBBcnJheS5pc0FycmF5KGEpO1xuICBjb25zdCBiSXNBcnJheSA9IEFycmF5LmlzQXJyYXkoYik7XG5cbiAgLy8gaWYgbm90IGJvdGggb3Igbm9uZSBhcmUgYXJyYXkgdGhleSBhcmUgbm90IGVxdWFsXG4gIGlmIChhSXNBcnJheSAhPT0gYklzQXJyYXkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAoYUlzQXJyYXkgJiYgYklzQXJyYXkpIHtcbiAgICBpZiAoYS5sZW5ndGggIT09IGIubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGZvciAoaSA9IDA7IGkgPCBhLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoIUVKU09OLmVxdWFscyhhW2ldLCBiW2ldLCBvcHRpb25zKSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgLy8gZmFsbGJhY2sgZm9yIGN1c3RvbSB0eXBlcyB0aGF0IGRvbid0IGltcGxlbWVudCB0aGVpciBvd24gZXF1YWxzXG4gIHN3aXRjaCAoRUpTT04uX2lzQ3VzdG9tVHlwZShhKSArIEVKU09OLl9pc0N1c3RvbVR5cGUoYikpIHtcbiAgICBjYXNlIDE6IHJldHVybiBmYWxzZTtcbiAgICBjYXNlIDI6IHJldHVybiBFSlNPTi5lcXVhbHMoRUpTT04udG9KU09OVmFsdWUoYSksIEVKU09OLnRvSlNPTlZhbHVlKGIpKTtcbiAgICBkZWZhdWx0OiAvLyBEbyBub3RoaW5nXG4gIH1cblxuICAvLyBmYWxsIGJhY2sgdG8gc3RydWN0dXJhbCBlcXVhbGl0eSBvZiBvYmplY3RzXG4gIGxldCByZXQ7XG4gIGNvbnN0IGFLZXlzID0ga2V5c09mKGEpO1xuICBjb25zdCBiS2V5cyA9IGtleXNPZihiKTtcbiAgaWYgKGtleU9yZGVyU2Vuc2l0aXZlKSB7XG4gICAgaSA9IDA7XG4gICAgcmV0ID0gYUtleXMuZXZlcnkoa2V5ID0+IHtcbiAgICAgIGlmIChpID49IGJLZXlzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICBpZiAoa2V5ICE9PSBiS2V5c1tpXSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICBpZiAoIUVKU09OLmVxdWFscyhhW2tleV0sIGJbYktleXNbaV1dLCBvcHRpb25zKSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICBpKys7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBpID0gMDtcbiAgICByZXQgPSBhS2V5cy5ldmVyeShrZXkgPT4ge1xuICAgICAgaWYgKCFoYXNPd24oYiwga2V5KSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICBpZiAoIUVKU09OLmVxdWFscyhhW2tleV0sIGJba2V5XSwgb3B0aW9ucykpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgaSsrO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIHJldCAmJiBpID09PSBiS2V5cy5sZW5ndGg7XG59O1xuXG4vKipcbiAqIEBzdW1tYXJ5IFJldHVybiBhIGRlZXAgY29weSBvZiBgdmFsYC5cbiAqIEBsb2N1cyBBbnl3aGVyZVxuICogQHBhcmFtIHtFSlNPTn0gdmFsIEEgdmFsdWUgdG8gY29weS5cbiAqL1xuRUpTT04uY2xvbmUgPSB2ID0+IHtcbiAgbGV0IHJldDtcbiAgaWYgKCFpc09iamVjdCh2KSkge1xuICAgIHJldHVybiB2O1xuICB9XG5cbiAgaWYgKHYgPT09IG51bGwpIHtcbiAgICByZXR1cm4gbnVsbDsgLy8gbnVsbCBoYXMgdHlwZW9mIFwib2JqZWN0XCJcbiAgfVxuXG4gIGlmICh2IGluc3RhbmNlb2YgRGF0ZSkge1xuICAgIHJldHVybiBuZXcgRGF0ZSh2LmdldFRpbWUoKSk7XG4gIH1cblxuICAvLyBSZWdFeHBzIGFyZSBub3QgcmVhbGx5IEVKU09OIGVsZW1lbnRzIChlZyB3ZSBkb24ndCBkZWZpbmUgYSBzZXJpYWxpemF0aW9uXG4gIC8vIGZvciB0aGVtKSwgYnV0IHRoZXkncmUgaW1tdXRhYmxlIGFueXdheSwgc28gd2UgY2FuIHN1cHBvcnQgdGhlbSBpbiBjbG9uZS5cbiAgaWYgKHYgaW5zdGFuY2VvZiBSZWdFeHApIHtcbiAgICByZXR1cm4gdjtcbiAgfVxuXG4gIGlmIChFSlNPTi5pc0JpbmFyeSh2KSkge1xuICAgIHJldCA9IEVKU09OLm5ld0JpbmFyeSh2Lmxlbmd0aCk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB2Lmxlbmd0aDsgaSsrKSB7XG4gICAgICByZXRbaV0gPSB2W2ldO1xuICAgIH1cbiAgICByZXR1cm4gcmV0O1xuICB9XG5cbiAgaWYgKEFycmF5LmlzQXJyYXkodikpIHtcbiAgICByZXR1cm4gdi5tYXAoRUpTT04uY2xvbmUpO1xuICB9XG5cbiAgaWYgKGlzQXJndW1lbnRzKHYpKSB7XG4gICAgcmV0dXJuIEFycmF5LmZyb20odikubWFwKEVKU09OLmNsb25lKTtcbiAgfVxuXG4gIC8vIGhhbmRsZSBnZW5lcmFsIHVzZXItZGVmaW5lZCB0eXBlZCBPYmplY3RzIGlmIHRoZXkgaGF2ZSBhIGNsb25lIG1ldGhvZFxuICBpZiAoaXNGdW5jdGlvbih2LmNsb25lKSkge1xuICAgIHJldHVybiB2LmNsb25lKCk7XG4gIH1cblxuICAvLyBoYW5kbGUgb3RoZXIgY3VzdG9tIHR5cGVzXG4gIGlmIChFSlNPTi5faXNDdXN0b21UeXBlKHYpKSB7XG4gICAgcmV0dXJuIEVKU09OLmZyb21KU09OVmFsdWUoRUpTT04uY2xvbmUoRUpTT04udG9KU09OVmFsdWUodikpLCB0cnVlKTtcbiAgfVxuXG4gIC8vIGhhbmRsZSBvdGhlciBvYmplY3RzXG4gIHJldCA9IHt9O1xuICBrZXlzT2YodikuZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgcmV0W2tleV0gPSBFSlNPTi5jbG9uZSh2W2tleV0pO1xuICB9KTtcbiAgcmV0dXJuIHJldDtcbn07XG5cbi8qKlxuICogQHN1bW1hcnkgQWxsb2NhdGUgYSBuZXcgYnVmZmVyIG9mIGJpbmFyeSBkYXRhIHRoYXQgRUpTT04gY2FuIHNlcmlhbGl6ZS5cbiAqIEBsb2N1cyBBbnl3aGVyZVxuICogQHBhcmFtIHtOdW1iZXJ9IHNpemUgVGhlIG51bWJlciBvZiBieXRlcyBvZiBiaW5hcnkgZGF0YSB0byBhbGxvY2F0ZS5cbiAqL1xuLy8gRUpTT04ubmV3QmluYXJ5IGlzIHRoZSBwdWJsaWMgZG9jdW1lbnRlZCBBUEkgZm9yIHRoaXMgZnVuY3Rpb25hbGl0eSxcbi8vIGJ1dCB0aGUgaW1wbGVtZW50YXRpb24gaXMgaW4gdGhlICdiYXNlNjQnIHBhY2thZ2UgdG8gYXZvaWRcbi8vIGludHJvZHVjaW5nIGEgY2lyY3VsYXIgZGVwZW5kZW5jeS4gKElmIHRoZSBpbXBsZW1lbnRhdGlvbiB3ZXJlIGhlcmUsXG4vLyB0aGVuICdiYXNlNjQnIHdvdWxkIGhhdmUgdG8gdXNlIEVKU09OLm5ld0JpbmFyeSwgYW5kICdlanNvbicgd291bGRcbi8vIGFsc28gaGF2ZSB0byB1c2UgJ2Jhc2U2NCcuKVxuRUpTT04ubmV3QmluYXJ5ID0gQmFzZTY0Lm5ld0JpbmFyeTtcblxuZXhwb3J0IHsgRUpTT04gfTtcbiIsIi8vIEJhc2VkIG9uIGpzb24yLmpzIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL2RvdWdsYXNjcm9ja2ZvcmQvSlNPTi1qc1xuLy9cbi8vICAgIGpzb24yLmpzXG4vLyAgICAyMDEyLTEwLTA4XG4vL1xuLy8gICAgUHVibGljIERvbWFpbi5cbi8vXG4vLyAgICBOTyBXQVJSQU5UWSBFWFBSRVNTRUQgT1IgSU1QTElFRC4gVVNFIEFUIFlPVVIgT1dOIFJJU0suXG5cbmZ1bmN0aW9uIHF1b3RlKHN0cmluZykge1xuICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoc3RyaW5nKTtcbn1cblxuY29uc3Qgc3RyID0gKGtleSwgaG9sZGVyLCBzaW5nbGVJbmRlbnQsIG91dGVySW5kZW50LCBjYW5vbmljYWwpID0+IHtcbiAgY29uc3QgdmFsdWUgPSBob2xkZXJba2V5XTtcblxuICAvLyBXaGF0IGhhcHBlbnMgbmV4dCBkZXBlbmRzIG9uIHRoZSB2YWx1ZSdzIHR5cGUuXG4gIHN3aXRjaCAodHlwZW9mIHZhbHVlKSB7XG4gIGNhc2UgJ3N0cmluZyc6XG4gICAgcmV0dXJuIHF1b3RlKHZhbHVlKTtcbiAgY2FzZSAnbnVtYmVyJzpcbiAgICAvLyBKU09OIG51bWJlcnMgbXVzdCBiZSBmaW5pdGUuIEVuY29kZSBub24tZmluaXRlIG51bWJlcnMgYXMgbnVsbC5cbiAgICByZXR1cm4gaXNGaW5pdGUodmFsdWUpID8gU3RyaW5nKHZhbHVlKSA6ICdudWxsJztcbiAgY2FzZSAnYm9vbGVhbic6XG4gICAgcmV0dXJuIFN0cmluZyh2YWx1ZSk7XG4gIC8vIElmIHRoZSB0eXBlIGlzICdvYmplY3QnLCB3ZSBtaWdodCBiZSBkZWFsaW5nIHdpdGggYW4gb2JqZWN0IG9yIGFuIGFycmF5IG9yXG4gIC8vIG51bGwuXG4gIGNhc2UgJ29iamVjdCc6IHtcbiAgICAvLyBEdWUgdG8gYSBzcGVjaWZpY2F0aW9uIGJsdW5kZXIgaW4gRUNNQVNjcmlwdCwgdHlwZW9mIG51bGwgaXMgJ29iamVjdCcsXG4gICAgLy8gc28gd2F0Y2ggb3V0IGZvciB0aGF0IGNhc2UuXG4gICAgaWYgKCF2YWx1ZSkge1xuICAgICAgcmV0dXJuICdudWxsJztcbiAgICB9XG4gICAgLy8gTWFrZSBhbiBhcnJheSB0byBob2xkIHRoZSBwYXJ0aWFsIHJlc3VsdHMgb2Ygc3RyaW5naWZ5aW5nIHRoaXMgb2JqZWN0XG4gICAgLy8gdmFsdWUuXG4gICAgY29uc3QgaW5uZXJJbmRlbnQgPSBvdXRlckluZGVudCArIHNpbmdsZUluZGVudDtcbiAgICBjb25zdCBwYXJ0aWFsID0gW107XG4gICAgbGV0IHY7XG5cbiAgICAvLyBJcyB0aGUgdmFsdWUgYW4gYXJyYXk/XG4gICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpIHx8ICh7fSkuaGFzT3duUHJvcGVydHkuY2FsbCh2YWx1ZSwgJ2NhbGxlZScpKSB7XG4gICAgICAvLyBUaGUgdmFsdWUgaXMgYW4gYXJyYXkuIFN0cmluZ2lmeSBldmVyeSBlbGVtZW50LiBVc2UgbnVsbCBhcyBhXG4gICAgICAvLyBwbGFjZWhvbGRlciBmb3Igbm9uLUpTT04gdmFsdWVzLlxuICAgICAgY29uc3QgbGVuZ3RoID0gdmFsdWUubGVuZ3RoO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICBwYXJ0aWFsW2ldID1cbiAgICAgICAgICBzdHIoaSwgdmFsdWUsIHNpbmdsZUluZGVudCwgaW5uZXJJbmRlbnQsIGNhbm9uaWNhbCkgfHwgJ251bGwnO1xuICAgICAgfVxuXG4gICAgICAvLyBKb2luIGFsbCBvZiB0aGUgZWxlbWVudHMgdG9nZXRoZXIsIHNlcGFyYXRlZCB3aXRoIGNvbW1hcywgYW5kIHdyYXBcbiAgICAgIC8vIHRoZW0gaW4gYnJhY2tldHMuXG4gICAgICBpZiAocGFydGlhbC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgdiA9ICdbXSc7XG4gICAgICB9IGVsc2UgaWYgKGlubmVySW5kZW50KSB7XG4gICAgICAgIHYgPSAnW1xcbicgK1xuICAgICAgICAgIGlubmVySW5kZW50ICtcbiAgICAgICAgICBwYXJ0aWFsLmpvaW4oJyxcXG4nICtcbiAgICAgICAgICBpbm5lckluZGVudCkgK1xuICAgICAgICAgICdcXG4nICtcbiAgICAgICAgICBvdXRlckluZGVudCArXG4gICAgICAgICAgJ10nO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdiA9ICdbJyArIHBhcnRpYWwuam9pbignLCcpICsgJ10nO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHY7XG4gICAgfVxuXG4gICAgLy8gSXRlcmF0ZSB0aHJvdWdoIGFsbCBvZiB0aGUga2V5cyBpbiB0aGUgb2JqZWN0LlxuICAgIGxldCBrZXlzID0gT2JqZWN0LmtleXModmFsdWUpO1xuICAgIGlmIChjYW5vbmljYWwpIHtcbiAgICAgIGtleXMgPSBrZXlzLnNvcnQoKTtcbiAgICB9XG4gICAga2V5cy5mb3JFYWNoKGsgPT4ge1xuICAgICAgdiA9IHN0cihrLCB2YWx1ZSwgc2luZ2xlSW5kZW50LCBpbm5lckluZGVudCwgY2Fub25pY2FsKTtcbiAgICAgIGlmICh2KSB7XG4gICAgICAgIHBhcnRpYWwucHVzaChxdW90ZShrKSArIChpbm5lckluZGVudCA/ICc6ICcgOiAnOicpICsgdik7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBKb2luIGFsbCBvZiB0aGUgbWVtYmVyIHRleHRzIHRvZ2V0aGVyLCBzZXBhcmF0ZWQgd2l0aCBjb21tYXMsXG4gICAgLy8gYW5kIHdyYXAgdGhlbSBpbiBicmFjZXMuXG4gICAgaWYgKHBhcnRpYWwubGVuZ3RoID09PSAwKSB7XG4gICAgICB2ID0gJ3t9JztcbiAgICB9IGVsc2UgaWYgKGlubmVySW5kZW50KSB7XG4gICAgICB2ID0gJ3tcXG4nICtcbiAgICAgICAgaW5uZXJJbmRlbnQgK1xuICAgICAgICBwYXJ0aWFsLmpvaW4oJyxcXG4nICtcbiAgICAgICAgaW5uZXJJbmRlbnQpICtcbiAgICAgICAgJ1xcbicgK1xuICAgICAgICBvdXRlckluZGVudCArXG4gICAgICAgICd9JztcbiAgICB9IGVsc2Uge1xuICAgICAgdiA9ICd7JyArIHBhcnRpYWwuam9pbignLCcpICsgJ30nO1xuICAgIH1cbiAgICByZXR1cm4gdjtcbiAgfVxuXG4gIGRlZmF1bHQ6IC8vIERvIG5vdGhpbmdcbiAgfVxufTtcblxuLy8gSWYgdGhlIEpTT04gb2JqZWN0IGRvZXMgbm90IHlldCBoYXZlIGEgc3RyaW5naWZ5IG1ldGhvZCwgZ2l2ZSBpdCBvbmUuXG5jb25zdCBjYW5vbmljYWxTdHJpbmdpZnkgPSAodmFsdWUsIG9wdGlvbnMpID0+IHtcbiAgLy8gTWFrZSBhIGZha2Ugcm9vdCBvYmplY3QgY29udGFpbmluZyBvdXIgdmFsdWUgdW5kZXIgdGhlIGtleSBvZiAnJy5cbiAgLy8gUmV0dXJuIHRoZSByZXN1bHQgb2Ygc3RyaW5naWZ5aW5nIHRoZSB2YWx1ZS5cbiAgY29uc3QgYWxsT3B0aW9ucyA9IE9iamVjdC5hc3NpZ24oe1xuICAgIGluZGVudDogJycsXG4gICAgY2Fub25pY2FsOiBmYWxzZSxcbiAgfSwgb3B0aW9ucyk7XG4gIGlmIChhbGxPcHRpb25zLmluZGVudCA9PT0gdHJ1ZSkge1xuICAgIGFsbE9wdGlvbnMuaW5kZW50ID0gJyAgJztcbiAgfSBlbHNlIGlmICh0eXBlb2YgYWxsT3B0aW9ucy5pbmRlbnQgPT09ICdudW1iZXInKSB7XG4gICAgbGV0IG5ld0luZGVudCA9ICcnO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYWxsT3B0aW9ucy5pbmRlbnQ7IGkrKykge1xuICAgICAgbmV3SW5kZW50ICs9ICcgJztcbiAgICB9XG4gICAgYWxsT3B0aW9ucy5pbmRlbnQgPSBuZXdJbmRlbnQ7XG4gIH1cbiAgcmV0dXJuIHN0cignJywgeycnOiB2YWx1ZX0sIGFsbE9wdGlvbnMuaW5kZW50LCAnJywgYWxsT3B0aW9ucy5jYW5vbmljYWwpO1xufTtcblxuZXhwb3J0IGRlZmF1bHQgY2Fub25pY2FsU3RyaW5naWZ5O1xuIiwiZXhwb3J0IGNvbnN0IGlzRnVuY3Rpb24gPSAoZm4pID0+IHR5cGVvZiBmbiA9PT0gJ2Z1bmN0aW9uJztcblxuZXhwb3J0IGNvbnN0IGlzT2JqZWN0ID0gKGZuKSA9PiB0eXBlb2YgZm4gPT09ICdvYmplY3QnO1xuXG5leHBvcnQgY29uc3Qga2V5c09mID0gKG9iaikgPT4gT2JqZWN0LmtleXMob2JqKTtcblxuZXhwb3J0IGNvbnN0IGxlbmd0aE9mID0gKG9iaikgPT4gT2JqZWN0LmtleXMob2JqKS5sZW5ndGg7XG5cbmV4cG9ydCBjb25zdCBoYXNPd24gPSAob2JqLCBwcm9wKSA9PiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBwcm9wKTtcblxuZXhwb3J0IGNvbnN0IGNvbnZlcnRNYXBUb09iamVjdCA9IChtYXApID0+IEFycmF5LmZyb20obWFwKS5yZWR1Y2UoKGFjYywgW2tleSwgdmFsdWVdKSA9PiB7XG4gIC8vIHJlYXNzaWduIHRvIG5vdCBjcmVhdGUgbmV3IG9iamVjdFxuICBhY2Nba2V5XSA9IHZhbHVlO1xuICByZXR1cm4gYWNjO1xufSwge30pO1xuXG5leHBvcnQgY29uc3QgaXNBcmd1bWVudHMgPSBvYmogPT4gb2JqICE9IG51bGwgJiYgaGFzT3duKG9iaiwgJ2NhbGxlZScpO1xuXG5leHBvcnQgY29uc3QgaXNJbmZPck5hTiA9XG4gIG9iaiA9PiBOdW1iZXIuaXNOYU4ob2JqKSB8fCBvYmogPT09IEluZmluaXR5IHx8IG9iaiA9PT0gLUluZmluaXR5O1xuXG5leHBvcnQgY29uc3QgY2hlY2tFcnJvciA9IHtcbiAgbWF4U3RhY2s6IChtc2dFcnJvcikgPT4gbmV3IFJlZ0V4cCgnTWF4aW11bSBjYWxsIHN0YWNrIHNpemUgZXhjZWVkZWQnLCAnZycpLnRlc3QobXNnRXJyb3IpLFxufTtcblxuZXhwb3J0IGNvbnN0IGhhbmRsZUVycm9yID0gKGZuKSA9PiBmdW5jdGlvbigpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zdCBpc01heFN0YWNrID0gY2hlY2tFcnJvci5tYXhTdGFjayhlcnJvci5tZXNzYWdlKTtcbiAgICBpZiAoaXNNYXhTdGFjaykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb252ZXJ0aW5nIGNpcmN1bGFyIHN0cnVjdHVyZSB0byBKU09OJylcbiAgICB9XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn07XG4iXX0=
