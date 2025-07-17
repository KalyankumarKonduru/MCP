Package["core-runtime"].queue("check",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;
var ECMAScript = Package.ecmascript.ECMAScript;
var EJSON = Package.ejson.EJSON;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var check, Match;

var require = meteorInstall({"node_modules":{"meteor":{"check":{"match.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// packages/check/match.js                                                                                           //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      check: () => check,
      Match: () => Match
    });
    let isPlainObject;
    module.link("./isPlainObject", {
      isPlainObject(v) {
        isPlainObject = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    // Things we explicitly do NOT support:
    //    - heterogenous arrays

    const currentArgumentChecker = new Meteor.EnvironmentVariable();
    const hasOwn = Object.prototype.hasOwnProperty;
    const format = result => {
      const err = new Match.Error(result.message);
      if (result.path) {
        err.message += " in field ".concat(result.path);
        err.path = result.path;
      }
      return err;
    };

    /**
     * @summary Check that a value matches a [pattern](#matchpatterns).
     * If the value does not match the pattern, throw a `Match.Error`.
     * By default, it will throw immediately at the first error encountered. Pass in { throwAllErrors: true } to throw all errors.
     *
     * Particularly useful to assert that arguments to a function have the right
     * types and structure.
     * @locus Anywhere
     * @param {Any} value The value to check
     * @param {MatchPattern} pattern The pattern to match `value` against
     * @param {Object} [options={}] Additional options for check
     * @param {Boolean} [options.throwAllErrors=false] If true, throw all errors
     */
    function check(value, pattern) {
      let options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {
        throwAllErrors: false
      };
      // Record that check got called, if somebody cared.
      //
      // We use getOrNullIfOutsideFiber so that it's OK to call check()
      // from non-Fiber server contexts; the downside is that if you forget to
      // bindEnvironment on some random callback in your method/publisher,
      // it might not find the argumentChecker and you'll get an error about
      // not checking an argument that it looks like you're checking (instead
      // of just getting a "Node code must run in a Fiber" error).
      const argChecker = currentArgumentChecker.getOrNullIfOutsideFiber();
      if (argChecker) {
        argChecker.checking(value);
      }
      const result = testSubtree(value, pattern, options.throwAllErrors);
      if (result) {
        if (options.throwAllErrors) {
          throw Array.isArray(result) ? result.map(r => format(r)) : [format(result)];
        } else {
          throw format(result);
        }
      }
    }
    ;

    /**
     * @namespace Match
     * @summary The namespace for all Match types and methods.
     */
    const Match = {
      Optional: function (pattern) {
        return new Optional(pattern);
      },
      Maybe: function (pattern) {
        return new Maybe(pattern);
      },
      OneOf: function () {
        for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
          args[_key] = arguments[_key];
        }
        return new OneOf(args);
      },
      Any: ['__any__'],
      Where: function (condition) {
        return new Where(condition);
      },
      ObjectIncluding: function (pattern) {
        return new ObjectIncluding(pattern);
      },
      ObjectWithValues: function (pattern) {
        return new ObjectWithValues(pattern);
      },
      // Matches only signed 32-bit integers
      Integer: ['__integer__'],
      // XXX matchers should know how to describe themselves for errors
      Error: Meteor.makeErrorType('Match.Error', function (msg) {
        this.message = "Match error: ".concat(msg);

        // The path of the value that failed to match. Initially empty, this gets
        // populated by catching and rethrowing the exception as it goes back up the
        // stack.
        // E.g.: "vals[3].entity.created"
        this.path = '';

        // If this gets sent over DDP, don't give full internal details but at least
        // provide something better than 500 Internal server error.
        this.sanitizedError = new Meteor.Error(400, 'Match failed');
      }),
      // Tests to see if value matches pattern. Unlike check, it merely returns true
      // or false (unless an error other than Match.Error was thrown). It does not
      // interact with _failIfArgumentsAreNotAllChecked.
      // XXX maybe also implement a Match.match which returns more information about
      //     failures but without using exception handling or doing what check()
      //     does with _failIfArgumentsAreNotAllChecked and Meteor.Error conversion

      /**
       * @summary Returns true if the value matches the pattern.
       * @locus Anywhere
       * @param {Any} value The value to check
       * @param {MatchPattern} pattern The pattern to match `value` against
       */
      test(value, pattern) {
        return !testSubtree(value, pattern);
      },
      // Runs `f.apply(context, args)`. If check() is not called on every element of
      // `args` (either directly or in the first level of an array), throws an error
      // (using `description` in the message).
      _failIfArgumentsAreNotAllChecked(f, context, args, description) {
        const argChecker = new ArgumentChecker(args, description);
        const result = currentArgumentChecker.withValue(argChecker, () => f.apply(context, args));

        // If f didn't itself throw, make sure it checked all of its arguments.
        argChecker.throwUnlessAllArgumentsHaveBeenChecked();
        return result;
      }
    };
    class Optional {
      constructor(pattern) {
        this.pattern = pattern;
      }
    }
    class Maybe {
      constructor(pattern) {
        this.pattern = pattern;
      }
    }
    class OneOf {
      constructor(choices) {
        if (!choices || choices.length === 0) {
          throw new Error('Must provide at least one choice to Match.OneOf');
        }
        this.choices = choices;
      }
    }
    class Where {
      constructor(condition) {
        this.condition = condition;
      }
    }
    class ObjectIncluding {
      constructor(pattern) {
        this.pattern = pattern;
      }
    }
    class ObjectWithValues {
      constructor(pattern) {
        this.pattern = pattern;
      }
    }
    const stringForErrorMessage = function (value) {
      let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      if (value === null) {
        return 'null';
      }
      if (options.onlyShowType) {
        return typeof value;
      }

      // Your average non-object things.  Saves from doing the try/catch below for.
      if (typeof value !== 'object') {
        return EJSON.stringify(value);
      }
      try {
        // Find objects with circular references since EJSON doesn't support them yet (Issue #4778 + Unaccepted PR)
        // If the native stringify is going to choke, EJSON.stringify is going to choke too.
        JSON.stringify(value);
      } catch (stringifyError) {
        if (stringifyError.name === 'TypeError') {
          return typeof value;
        }
      }
      return EJSON.stringify(value);
    };
    const typeofChecks = [[String, 'string'], [Number, 'number'], [Boolean, 'boolean'],
    // While we don't allow undefined/function in EJSON, this is good for optional
    // arguments with OneOf.
    [Function, 'function'], [undefined, 'undefined']];

    // Return `false` if it matches. Otherwise, returns an object with a `message` and a `path` field or an array of objects each with a `message` and a `path` field when collecting errors.
    const testSubtree = function (value, pattern) {
      let collectErrors = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
      let errors = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : [];
      let path = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : '';
      // Match anything!
      if (pattern === Match.Any) {
        return false;
      }

      // Basic atomic types.
      // Do not match boxed objects (e.g. String, Boolean)
      for (let i = 0; i < typeofChecks.length; ++i) {
        if (pattern === typeofChecks[i][0]) {
          if (typeof value === typeofChecks[i][1]) {
            return false;
          }
          return {
            message: "Expected ".concat(typeofChecks[i][1], ", got ").concat(stringForErrorMessage(value, {
              onlyShowType: true
            })),
            path: ''
          };
        }
      }
      if (pattern === null) {
        if (value === null) {
          return false;
        }
        return {
          message: "Expected null, got ".concat(stringForErrorMessage(value)),
          path: ''
        };
      }

      // Strings, numbers, and booleans match literally. Goes well with Match.OneOf.
      if (typeof pattern === 'string' || typeof pattern === 'number' || typeof pattern === 'boolean') {
        if (value === pattern) {
          return false;
        }
        return {
          message: "Expected ".concat(pattern, ", got ").concat(stringForErrorMessage(value)),
          path: ''
        };
      }

      // Match.Integer is special type encoded with array
      if (pattern === Match.Integer) {
        // There is no consistent and reliable way to check if variable is a 64-bit
        // integer. One of the popular solutions is to get reminder of division by 1
        // but this method fails on really large floats with big precision.
        // E.g.: 1.348192308491824e+23 % 1 === 0 in V8
        // Bitwise operators work consistantly but always cast variable to 32-bit
        // signed integer according to JavaScript specs.
        if (typeof value === 'number' && (value | 0) === value) {
          return false;
        }
        return {
          message: "Expected Integer, got ".concat(stringForErrorMessage(value)),
          path: ''
        };
      }

      // 'Object' is shorthand for Match.ObjectIncluding({});
      if (pattern === Object) {
        pattern = Match.ObjectIncluding({});
      }

      // Array (checked AFTER Any, which is implemented as an Array).
      if (pattern instanceof Array) {
        if (pattern.length !== 1) {
          return {
            message: "Bad pattern: arrays must have one type element ".concat(stringForErrorMessage(pattern)),
            path: ''
          };
        }
        if (!Array.isArray(value) && !isArguments(value)) {
          return {
            message: "Expected array, got ".concat(stringForErrorMessage(value)),
            path: ''
          };
        }
        for (let i = 0, length = value.length; i < length; i++) {
          const arrPath = "".concat(path, "[").concat(i, "]");
          const result = testSubtree(value[i], pattern[0], collectErrors, errors, arrPath);
          if (result) {
            result.path = _prependPath(collectErrors ? arrPath : i, result.path);
            if (!collectErrors) return result;
            if (typeof value[i] !== 'object' || result.message) errors.push(result);
          }
        }
        if (!collectErrors) return false;
        return errors.length === 0 ? false : errors;
      }

      // Arbitrary validation checks. The condition can return false or throw a
      // Match.Error (ie, it can internally use check()) to fail.
      if (pattern instanceof Where) {
        let result;
        try {
          result = pattern.condition(value);
        } catch (err) {
          if (!(err instanceof Match.Error)) {
            throw err;
          }
          return {
            message: err.message,
            path: err.path
          };
        }
        if (result) {
          return false;
        }

        // XXX this error is terrible

        return {
          message: 'Failed Match.Where validation',
          path: ''
        };
      }
      if (pattern instanceof Maybe) {
        pattern = Match.OneOf(undefined, null, pattern.pattern);
      } else if (pattern instanceof Optional) {
        pattern = Match.OneOf(undefined, pattern.pattern);
      }
      if (pattern instanceof OneOf) {
        for (let i = 0; i < pattern.choices.length; ++i) {
          const result = testSubtree(value, pattern.choices[i]);
          if (!result) {
            // No error? Yay, return.
            return false;
          }

          // Match errors just mean try another choice.
        }

        // XXX this error is terrible
        return {
          message: 'Failed Match.OneOf, Match.Maybe or Match.Optional validation',
          path: ''
        };
      }

      // A function that isn't something we special-case is assumed to be a
      // constructor.
      if (pattern instanceof Function) {
        if (value instanceof pattern) {
          return false;
        }
        return {
          message: "Expected ".concat(pattern.name || 'particular constructor'),
          path: ''
        };
      }
      let unknownKeysAllowed = false;
      let unknownKeyPattern;
      if (pattern instanceof ObjectIncluding) {
        unknownKeysAllowed = true;
        pattern = pattern.pattern;
      }
      if (pattern instanceof ObjectWithValues) {
        unknownKeysAllowed = true;
        unknownKeyPattern = [pattern.pattern];
        pattern = {}; // no required keys
      }
      if (typeof pattern !== 'object') {
        return {
          message: 'Bad pattern: unknown pattern type',
          path: ''
        };
      }

      // An object, with required and optional keys. Note that this does NOT do
      // structural matches against objects of special types that happen to match
      // the pattern: this really needs to be a plain old {Object}!
      if (typeof value !== 'object') {
        return {
          message: "Expected object, got ".concat(typeof value),
          path: ''
        };
      }
      if (value === null) {
        return {
          message: "Expected object, got null",
          path: ''
        };
      }
      if (!isPlainObject(value)) {
        return {
          message: "Expected plain object",
          path: ''
        };
      }
      const requiredPatterns = Object.create(null);
      const optionalPatterns = Object.create(null);
      Object.keys(pattern).forEach(key => {
        const subPattern = pattern[key];
        if (subPattern instanceof Optional || subPattern instanceof Maybe) {
          optionalPatterns[key] = subPattern.pattern;
        } else {
          requiredPatterns[key] = subPattern;
        }
      });
      for (let key in Object(value)) {
        const subValue = value[key];
        const objPath = path ? "".concat(path, ".").concat(key) : key;
        if (hasOwn.call(requiredPatterns, key)) {
          const result = testSubtree(subValue, requiredPatterns[key], collectErrors, errors, objPath);
          if (result) {
            result.path = _prependPath(collectErrors ? objPath : key, result.path);
            if (!collectErrors) return result;
            if (typeof subValue !== 'object' || result.message) errors.push(result);
          }
          delete requiredPatterns[key];
        } else if (hasOwn.call(optionalPatterns, key)) {
          const result = testSubtree(subValue, optionalPatterns[key], collectErrors, errors, objPath);
          if (result) {
            result.path = _prependPath(collectErrors ? objPath : key, result.path);
            if (!collectErrors) return result;
            if (typeof subValue !== 'object' || result.message) errors.push(result);
          }
        } else {
          if (!unknownKeysAllowed) {
            const result = {
              message: 'Unknown key',
              path: key
            };
            if (!collectErrors) return result;
            errors.push(result);
          }
          if (unknownKeyPattern) {
            const result = testSubtree(subValue, unknownKeyPattern[0], collectErrors, errors, objPath);
            if (result) {
              result.path = _prependPath(collectErrors ? objPath : key, result.path);
              if (!collectErrors) return result;
              if (typeof subValue !== 'object' || result.message) errors.push(result);
            }
          }
        }
      }
      const keys = Object.keys(requiredPatterns);
      if (keys.length) {
        const createMissingError = key => ({
          message: "Missing key '".concat(key, "'"),
          path: collectErrors ? path : ''
        });
        if (!collectErrors) {
          return createMissingError(keys[0]);
        }
        for (const key of keys) {
          errors.push(createMissingError(key));
        }
      }
      if (!collectErrors) return false;
      return errors.length === 0 ? false : errors;
    };
    class ArgumentChecker {
      constructor(args, description) {
        // Make a SHALLOW copy of the arguments. (We'll be doing identity checks
        // against its contents.)
        this.args = [...args];

        // Since the common case will be to check arguments in order, and we splice
        // out arguments when we check them, make it so we splice out from the end
        // rather than the beginning.
        this.args.reverse();
        this.description = description;
      }
      checking(value) {
        if (this._checkingOneValue(value)) {
          return;
        }

        // Allow check(arguments, [String]) or check(arguments.slice(1), [String])
        // or check([foo, bar], [String]) to count... but only if value wasn't
        // itself an argument.
        if (Array.isArray(value) || isArguments(value)) {
          Array.prototype.forEach.call(value, this._checkingOneValue.bind(this));
        }
      }
      _checkingOneValue(value) {
        for (let i = 0; i < this.args.length; ++i) {
          // Is this value one of the arguments? (This can have a false positive if
          // the argument is an interned primitive, but it's still a good enough
          // check.)
          // (NaN is not === to itself, so we have to check specially.)
          if (value === this.args[i] || Number.isNaN(value) && Number.isNaN(this.args[i])) {
            this.args.splice(i, 1);
            return true;
          }
        }
        return false;
      }
      throwUnlessAllArgumentsHaveBeenChecked() {
        if (this.args.length > 0) throw new Error("Did not check() all arguments during ".concat(this.description));
      }
    }
    const _jsKeywords = ['do', 'if', 'in', 'for', 'let', 'new', 'try', 'var', 'case', 'else', 'enum', 'eval', 'false', 'null', 'this', 'true', 'void', 'with', 'break', 'catch', 'class', 'const', 'super', 'throw', 'while', 'yield', 'delete', 'export', 'import', 'public', 'return', 'static', 'switch', 'typeof', 'default', 'extends', 'finally', 'package', 'private', 'continue', 'debugger', 'function', 'arguments', 'interface', 'protected', 'implements', 'instanceof'];

    // Assumes the base of path is already escaped properly
    // returns key + base
    const _prependPath = (key, base) => {
      if (typeof key === 'number' || key.match(/^[0-9]+$/)) {
        key = "[".concat(key, "]");
      } else if (!key.match(/^[a-z_$][0-9a-z_$.[\]]*$/i) || _jsKeywords.indexOf(key) >= 0) {
        key = JSON.stringify([key]);
      }
      if (base && base[0] !== '[') {
        return "".concat(key, ".").concat(base);
      }
      return key + base;
    };
    const isObject = value => typeof value === 'object' && value !== null;
    const baseIsArguments = item => isObject(item) && Object.prototype.toString.call(item) === '[object Arguments]';
    const isArguments = baseIsArguments(function () {
      return arguments;
    }()) ? baseIsArguments : value => isObject(value) && typeof value.callee === 'function';
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"isPlainObject.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// packages/check/isPlainObject.js                                                                                   //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
module.export({
  isPlainObject: () => isPlainObject
});
// Copy of jQuery.isPlainObject for the server side from jQuery v3.1.1.

const class2type = {};
const toString = class2type.toString;
const hasOwn = Object.prototype.hasOwnProperty;
const fnToString = hasOwn.toString;
const ObjectFunctionString = fnToString.call(Object);
const getProto = Object.getPrototypeOf;
const isPlainObject = obj => {
  let proto;
  let Ctor;

  // Detect obvious negatives
  // Use toString instead of jQuery.type to catch host objects
  if (!obj || toString.call(obj) !== '[object Object]') {
    return false;
  }
  proto = getProto(obj);

  // Objects with no prototype (e.g., `Object.create( null )`) are plain
  if (!proto) {
    return true;
  }

  // Objects with prototype are plain iff they were constructed by a global Object function
  Ctor = hasOwn.call(proto, 'constructor') && proto.constructor;
  return typeof Ctor === 'function' && fnToString.call(Ctor) === ObjectFunctionString;
};
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});


/* Exports */
return {
  export: function () { return {
      check: check,
      Match: Match
    };},
  require: require,
  eagerModulePaths: [
    "/node_modules/meteor/check/match.js"
  ],
  mainModulePath: "/node_modules/meteor/check/match.js"
}});

//# sourceURL=meteor://💻app/packages/check.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvY2hlY2svbWF0Y2guanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL2NoZWNrL2lzUGxhaW5PYmplY3QuanMiXSwibmFtZXMiOlsibW9kdWxlIiwiZXhwb3J0IiwiY2hlY2siLCJNYXRjaCIsImlzUGxhaW5PYmplY3QiLCJsaW5rIiwidiIsIl9fcmVpZnlXYWl0Rm9yRGVwc19fIiwiY3VycmVudEFyZ3VtZW50Q2hlY2tlciIsIk1ldGVvciIsIkVudmlyb25tZW50VmFyaWFibGUiLCJoYXNPd24iLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImZvcm1hdCIsInJlc3VsdCIsImVyciIsIkVycm9yIiwibWVzc2FnZSIsInBhdGgiLCJjb25jYXQiLCJ2YWx1ZSIsInBhdHRlcm4iLCJvcHRpb25zIiwiYXJndW1lbnRzIiwibGVuZ3RoIiwidW5kZWZpbmVkIiwidGhyb3dBbGxFcnJvcnMiLCJhcmdDaGVja2VyIiwiZ2V0T3JOdWxsSWZPdXRzaWRlRmliZXIiLCJjaGVja2luZyIsInRlc3RTdWJ0cmVlIiwiQXJyYXkiLCJpc0FycmF5IiwibWFwIiwiciIsIk9wdGlvbmFsIiwiTWF5YmUiLCJPbmVPZiIsIl9sZW4iLCJhcmdzIiwiX2tleSIsIkFueSIsIldoZXJlIiwiY29uZGl0aW9uIiwiT2JqZWN0SW5jbHVkaW5nIiwiT2JqZWN0V2l0aFZhbHVlcyIsIkludGVnZXIiLCJtYWtlRXJyb3JUeXBlIiwibXNnIiwic2FuaXRpemVkRXJyb3IiLCJ0ZXN0IiwiX2ZhaWxJZkFyZ3VtZW50c0FyZU5vdEFsbENoZWNrZWQiLCJmIiwiY29udGV4dCIsImRlc2NyaXB0aW9uIiwiQXJndW1lbnRDaGVja2VyIiwid2l0aFZhbHVlIiwiYXBwbHkiLCJ0aHJvd1VubGVzc0FsbEFyZ3VtZW50c0hhdmVCZWVuQ2hlY2tlZCIsImNvbnN0cnVjdG9yIiwiY2hvaWNlcyIsInN0cmluZ0ZvckVycm9yTWVzc2FnZSIsIm9ubHlTaG93VHlwZSIsIkVKU09OIiwic3RyaW5naWZ5IiwiSlNPTiIsInN0cmluZ2lmeUVycm9yIiwibmFtZSIsInR5cGVvZkNoZWNrcyIsIlN0cmluZyIsIk51bWJlciIsIkJvb2xlYW4iLCJGdW5jdGlvbiIsImNvbGxlY3RFcnJvcnMiLCJlcnJvcnMiLCJpIiwiaXNBcmd1bWVudHMiLCJhcnJQYXRoIiwiX3ByZXBlbmRQYXRoIiwicHVzaCIsInVua25vd25LZXlzQWxsb3dlZCIsInVua25vd25LZXlQYXR0ZXJuIiwicmVxdWlyZWRQYXR0ZXJucyIsImNyZWF0ZSIsIm9wdGlvbmFsUGF0dGVybnMiLCJrZXlzIiwiZm9yRWFjaCIsImtleSIsInN1YlBhdHRlcm4iLCJzdWJWYWx1ZSIsIm9ialBhdGgiLCJjYWxsIiwiY3JlYXRlTWlzc2luZ0Vycm9yIiwicmV2ZXJzZSIsIl9jaGVja2luZ09uZVZhbHVlIiwiYmluZCIsImlzTmFOIiwic3BsaWNlIiwiX2pzS2V5d29yZHMiLCJiYXNlIiwibWF0Y2giLCJpbmRleE9mIiwiaXNPYmplY3QiLCJiYXNlSXNBcmd1bWVudHMiLCJpdGVtIiwidG9TdHJpbmciLCJjYWxsZWUiLCJfX3JlaWZ5X2FzeW5jX3Jlc3VsdF9fIiwiX3JlaWZ5RXJyb3IiLCJzZWxmIiwiYXN5bmMiLCJjbGFzczJ0eXBlIiwiZm5Ub1N0cmluZyIsIk9iamVjdEZ1bmN0aW9uU3RyaW5nIiwiZ2V0UHJvdG8iLCJnZXRQcm90b3R5cGVPZiIsIm9iaiIsInByb3RvIiwiQ3RvciJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0lBQUFBLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDO01BQUNDLEtBQUssRUFBQ0EsQ0FBQSxLQUFJQSxLQUFLO01BQUNDLEtBQUssRUFBQ0EsQ0FBQSxLQUFJQTtJQUFLLENBQUMsQ0FBQztJQUFDLElBQUlDLGFBQWE7SUFBQ0osTUFBTSxDQUFDSyxJQUFJLENBQUMsaUJBQWlCLEVBQUM7TUFBQ0QsYUFBYUEsQ0FBQ0UsQ0FBQyxFQUFDO1FBQUNGLGFB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UUFBUTtBQUVwQyxNQUFNaEcsTUFBTSxHQUFHQyxNQUFNLENBQUNDLFNBQVMsQ0FBQ0MsY0FBYztBQUU5QyxNQUFNb0csVUFBVSxHQUFHdkcsTUFBTSxDQUFDZ0csUUFBUTtBQUVsQyxNQUFNUSxvQkFBb0IsR0FBR0QsVUFBVSxDQUFDckIsSUFBSSxDQUFDakYsTUFBTSxDQUFDO0FBRXBELE1BQU13RyxRQUFRLEdBQUd4RyxNQUFNLENBQUN5RyxjQUFjO0FBRS9CLE1BQU1qSCxhQUFhLEdBQUdrSCxHQUFHLElBQUk7RUFDbEMsSUFBSUMsS0FBSztFQUNULElBQUlDLElBQUk7O0VBRVI7RUFDQTtFQUNBLElBQUksQ0FBQ0YsR0FBRyxJQUFJWCxRQUFRLENBQUNkLElBQUksQ0FBQ3lCLEdBQUcsQ0FBQyxLQUFLLGlCQUFpQixFQUFFO0lBQ3BELE9BQU8sS0FBSztFQUNkO0VBRUFDLEtBQUssR0FBR0gsUUFBUSxDQUFDRSxHQUFHLENBQUM7O0VBRXJCO0VBQ0EsSUFBSSxDQUFDQyxLQUFLLEVBQUU7SUFDVixPQUFPLElBQUk7RUFDYjs7RUFFQTtFQUNBQyxJQUFJLEdBQUc3RyxNQUFNLENBQUNrRixJQUFJLENBQUMwQixLQUFLLEVBQUUsYUFBYSxDQUFDLElBQUlBLEtBQUssQ0FBQzFELFdBQVc7RUFDN0QsT0FBTyxPQUFPMkQsSUFBSSxLQUFLLFVBQVUsSUFDL0JOLFVBQVUsQ0FBQ3JCLElBQUksQ0FBQzJCLElBQUksQ0FBQyxLQUFLTCxvQkFBb0I7QUFDbEQsQ0FBQyxDIiwiZmlsZSI6Ii9wYWNrYWdlcy9jaGVjay5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8vIFhYWCBkb2NzXG5pbXBvcnQgeyBpc1BsYWluT2JqZWN0IH0gZnJvbSAnLi9pc1BsYWluT2JqZWN0JztcblxuLy8gVGhpbmdzIHdlIGV4cGxpY2l0bHkgZG8gTk9UIHN1cHBvcnQ6XG4vLyAgICAtIGhldGVyb2dlbm91cyBhcnJheXNcblxuY29uc3QgY3VycmVudEFyZ3VtZW50Q2hlY2tlciA9IG5ldyBNZXRlb3IuRW52aXJvbm1lbnRWYXJpYWJsZTtcbmNvbnN0IGhhc093biA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHk7XG5cbmNvbnN0IGZvcm1hdCA9IHJlc3VsdCA9PiB7XG4gIGNvbnN0IGVyciA9IG5ldyBNYXRjaC5FcnJvcihyZXN1bHQubWVzc2FnZSk7XG4gIGlmIChyZXN1bHQucGF0aCkge1xuICAgIGVyci5tZXNzYWdlICs9IGAgaW4gZmllbGQgJHtyZXN1bHQucGF0aH1gO1xuICAgIGVyci5wYXRoID0gcmVzdWx0LnBhdGg7XG4gIH1cblxuICByZXR1cm4gZXJyO1xufVxuXG4vKipcbiAqIEBzdW1tYXJ5IENoZWNrIHRoYXQgYSB2YWx1ZSBtYXRjaGVzIGEgW3BhdHRlcm5dKCNtYXRjaHBhdHRlcm5zKS5cbiAqIElmIHRoZSB2YWx1ZSBkb2VzIG5vdCBtYXRjaCB0aGUgcGF0dGVybiwgdGhyb3cgYSBgTWF0Y2guRXJyb3JgLlxuICogQnkgZGVmYXVsdCwgaXQgd2lsbCB0aHJvdyBpbW1lZGlhdGVseSBhdCB0aGUgZmlyc3QgZXJyb3IgZW5jb3VudGVyZWQuIFBhc3MgaW4geyB0aHJvd0FsbEVycm9yczogdHJ1ZSB9IHRvIHRocm93IGFsbCBlcnJvcnMuXG4gKlxuICogUGFydGljdWxhcmx5IHVzZWZ1bCB0byBhc3NlcnQgdGhhdCBhcmd1bWVudHMgdG8gYSBmdW5jdGlvbiBoYXZlIHRoZSByaWdodFxuICogdHlwZXMgYW5kIHN0cnVjdHVyZS5cbiAqIEBsb2N1cyBBbnl3aGVyZVxuICogQHBhcmFtIHtBbnl9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVja1xuICogQHBhcmFtIHtNYXRjaFBhdHRlcm59IHBhdHRlcm4gVGhlIHBhdHRlcm4gdG8gbWF0Y2ggYHZhbHVlYCBhZ2FpbnN0XG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnM9e31dIEFkZGl0aW9uYWwgb3B0aW9ucyBmb3IgY2hlY2tcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gW29wdGlvbnMudGhyb3dBbGxFcnJvcnM9ZmFsc2VdIElmIHRydWUsIHRocm93IGFsbCBlcnJvcnNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNoZWNrKHZhbHVlLCBwYXR0ZXJuLCBvcHRpb25zID0geyB0aHJvd0FsbEVycm9yczogZmFsc2UgfSkge1xuICAvLyBSZWNvcmQgdGhhdCBjaGVjayBnb3QgY2FsbGVkLCBpZiBzb21lYm9keSBjYXJlZC5cbiAgLy9cbiAgLy8gV2UgdXNlIGdldE9yTnVsbElmT3V0c2lkZUZpYmVyIHNvIHRoYXQgaXQncyBPSyB0byBjYWxsIGNoZWNrKClcbiAgLy8gZnJvbSBub24tRmliZXIgc2VydmVyIGNvbnRleHRzOyB0aGUgZG93bnNpZGUgaXMgdGhhdCBpZiB5b3UgZm9yZ2V0IHRvXG4gIC8vIGJpbmRFbnZpcm9ubWVudCBvbiBzb21lIHJhbmRvbSBjYWxsYmFjayBpbiB5b3VyIG1ldGhvZC9wdWJsaXNoZXIsXG4gIC8vIGl0IG1pZ2h0IG5vdCBmaW5kIHRoZSBhcmd1bWVudENoZWNrZXIgYW5kIHlvdSdsbCBnZXQgYW4gZXJyb3IgYWJvdXRcbiAgLy8gbm90IGNoZWNraW5nIGFuIGFyZ3VtZW50IHRoYXQgaXQgbG9va3MgbGlrZSB5b3UncmUgY2hlY2tpbmcgKGluc3RlYWRcbiAgLy8gb2YganVzdCBnZXR0aW5nIGEgXCJOb2RlIGNvZGUgbXVzdCBydW4gaW4gYSBGaWJlclwiIGVycm9yKS5cbiAgY29uc3QgYXJnQ2hlY2tlciA9IGN1cnJlbnRBcmd1bWVudENoZWNrZXIuZ2V0T3JOdWxsSWZPdXRzaWRlRmliZXIoKTtcbiAgaWYgKGFyZ0NoZWNrZXIpIHtcbiAgICBhcmdDaGVja2VyLmNoZWNraW5nKHZhbHVlKTtcbiAgfVxuXG4gIGNvbnN0IHJlc3VsdCA9IHRlc3RTdWJ0cmVlKHZhbHVlLCBwYXR0ZXJuLCBvcHRpb25zLnRocm93QWxsRXJyb3JzKTtcblxuICBpZiAocmVzdWx0KSB7XG4gICAgaWYgKG9wdGlvbnMudGhyb3dBbGxFcnJvcnMpIHtcbiAgICAgIHRocm93IEFycmF5LmlzQXJyYXkocmVzdWx0KSA/IHJlc3VsdC5tYXAociA9PiBmb3JtYXQocikpIDogW2Zvcm1hdChyZXN1bHQpXVxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBmb3JtYXQocmVzdWx0KVxuICAgIH1cbiAgfVxufTtcblxuLyoqXG4gKiBAbmFtZXNwYWNlIE1hdGNoXG4gKiBAc3VtbWFyeSBUaGUgbmFtZXNwYWNlIGZvciBhbGwgTWF0Y2ggdHlwZXMgYW5kIG1ldGhvZHMuXG4gKi9cbmV4cG9ydCBjb25zdCBNYXRjaCA9IHtcbiAgT3B0aW9uYWw6IGZ1bmN0aW9uKHBhdHRlcm4pIHtcbiAgICByZXR1cm4gbmV3IE9wdGlvbmFsKHBhdHRlcm4pO1xuICB9LFxuXG4gIE1heWJlOiBmdW5jdGlvbihwYXR0ZXJuKSB7XG4gICAgcmV0dXJuIG5ldyBNYXliZShwYXR0ZXJuKTtcbiAgfSxcblxuICBPbmVPZjogZnVuY3Rpb24oLi4uYXJncykge1xuICAgIHJldHVybiBuZXcgT25lT2YoYXJncyk7XG4gIH0sXG5cbiAgQW55OiBbJ19fYW55X18nXSxcbiAgV2hlcmU6IGZ1bmN0aW9uKGNvbmRpdGlvbikge1xuICAgIHJldHVybiBuZXcgV2hlcmUoY29uZGl0aW9uKTtcbiAgfSxcblxuICBPYmplY3RJbmNsdWRpbmc6IGZ1bmN0aW9uKHBhdHRlcm4pIHtcbiAgICByZXR1cm4gbmV3IE9iamVjdEluY2x1ZGluZyhwYXR0ZXJuKVxuICB9LFxuXG4gIE9iamVjdFdpdGhWYWx1ZXM6IGZ1bmN0aW9uKHBhdHRlcm4pIHtcbiAgICByZXR1cm4gbmV3IE9iamVjdFdpdGhWYWx1ZXMocGF0dGVybik7XG4gIH0sXG5cbiAgLy8gTWF0Y2hlcyBvbmx5IHNpZ25lZCAzMi1iaXQgaW50ZWdlcnNcbiAgSW50ZWdlcjogWydfX2ludGVnZXJfXyddLFxuXG4gIC8vIFhYWCBtYXRjaGVycyBzaG91bGQga25vdyBob3cgdG8gZGVzY3JpYmUgdGhlbXNlbHZlcyBmb3IgZXJyb3JzXG4gIEVycm9yOiBNZXRlb3IubWFrZUVycm9yVHlwZSgnTWF0Y2guRXJyb3InLCBmdW5jdGlvbiAobXNnKSB7XG4gICAgdGhpcy5tZXNzYWdlID0gYE1hdGNoIGVycm9yOiAke21zZ31gO1xuXG4gICAgLy8gVGhlIHBhdGggb2YgdGhlIHZhbHVlIHRoYXQgZmFpbGVkIHRvIG1hdGNoLiBJbml0aWFsbHkgZW1wdHksIHRoaXMgZ2V0c1xuICAgIC8vIHBvcHVsYXRlZCBieSBjYXRjaGluZyBhbmQgcmV0aHJvd2luZyB0aGUgZXhjZXB0aW9uIGFzIGl0IGdvZXMgYmFjayB1cCB0aGVcbiAgICAvLyBzdGFjay5cbiAgICAvLyBFLmcuOiBcInZhbHNbM10uZW50aXR5LmNyZWF0ZWRcIlxuICAgIHRoaXMucGF0aCA9ICcnO1xuXG4gICAgLy8gSWYgdGhpcyBnZXRzIHNlbnQgb3ZlciBERFAsIGRvbid0IGdpdmUgZnVsbCBpbnRlcm5hbCBkZXRhaWxzIGJ1dCBhdCBsZWFzdFxuICAgIC8vIHByb3ZpZGUgc29tZXRoaW5nIGJldHRlciB0aGFuIDUwMCBJbnRlcm5hbCBzZXJ2ZXIgZXJyb3IuXG4gICAgdGhpcy5zYW5pdGl6ZWRFcnJvciA9IG5ldyBNZXRlb3IuRXJyb3IoNDAwLCAnTWF0Y2ggZmFpbGVkJyk7XG4gIH0pLFxuXG4gIC8vIFRlc3RzIHRvIHNlZSBpZiB2YWx1ZSBtYXRjaGVzIHBhdHRlcm4uIFVubGlrZSBjaGVjaywgaXQgbWVyZWx5IHJldHVybnMgdHJ1ZVxuICAvLyBvciBmYWxzZSAodW5sZXNzIGFuIGVycm9yIG90aGVyIHRoYW4gTWF0Y2guRXJyb3Igd2FzIHRocm93bikuIEl0IGRvZXMgbm90XG4gIC8vIGludGVyYWN0IHdpdGggX2ZhaWxJZkFyZ3VtZW50c0FyZU5vdEFsbENoZWNrZWQuXG4gIC8vIFhYWCBtYXliZSBhbHNvIGltcGxlbWVudCBhIE1hdGNoLm1hdGNoIHdoaWNoIHJldHVybnMgbW9yZSBpbmZvcm1hdGlvbiBhYm91dFxuICAvLyAgICAgZmFpbHVyZXMgYnV0IHdpdGhvdXQgdXNpbmcgZXhjZXB0aW9uIGhhbmRsaW5nIG9yIGRvaW5nIHdoYXQgY2hlY2soKVxuICAvLyAgICAgZG9lcyB3aXRoIF9mYWlsSWZBcmd1bWVudHNBcmVOb3RBbGxDaGVja2VkIGFuZCBNZXRlb3IuRXJyb3IgY29udmVyc2lvblxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBSZXR1cm5zIHRydWUgaWYgdGhlIHZhbHVlIG1hdGNoZXMgdGhlIHBhdHRlcm4uXG4gICAqIEBsb2N1cyBBbnl3aGVyZVxuICAgKiBAcGFyYW0ge0FueX0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrXG4gICAqIEBwYXJhbSB7TWF0Y2hQYXR0ZXJufSBwYXR0ZXJuIFRoZSBwYXR0ZXJuIHRvIG1hdGNoIGB2YWx1ZWAgYWdhaW5zdFxuICAgKi9cbiAgdGVzdCh2YWx1ZSwgcGF0dGVybikge1xuICAgIHJldHVybiAhdGVzdFN1YnRyZWUodmFsdWUsIHBhdHRlcm4pO1xuICB9LFxuXG4gIC8vIFJ1bnMgYGYuYXBwbHkoY29udGV4dCwgYXJncylgLiBJZiBjaGVjaygpIGlzIG5vdCBjYWxsZWQgb24gZXZlcnkgZWxlbWVudCBvZlxuICAvLyBgYXJnc2AgKGVpdGhlciBkaXJlY3RseSBvciBpbiB0aGUgZmlyc3QgbGV2ZWwgb2YgYW4gYXJyYXkpLCB0aHJvd3MgYW4gZXJyb3JcbiAgLy8gKHVzaW5nIGBkZXNjcmlwdGlvbmAgaW4gdGhlIG1lc3NhZ2UpLlxuICBfZmFpbElmQXJndW1lbnRzQXJlTm90QWxsQ2hlY2tlZChmLCBjb250ZXh0LCBhcmdzLCBkZXNjcmlwdGlvbikge1xuICAgIGNvbnN0IGFyZ0NoZWNrZXIgPSBuZXcgQXJndW1lbnRDaGVja2VyKGFyZ3MsIGRlc2NyaXB0aW9uKTtcbiAgICBjb25zdCByZXN1bHQgPSBjdXJyZW50QXJndW1lbnRDaGVja2VyLndpdGhWYWx1ZShcbiAgICAgIGFyZ0NoZWNrZXIsXG4gICAgICAoKSA9PiBmLmFwcGx5KGNvbnRleHQsIGFyZ3MpXG4gICAgKTtcblxuICAgIC8vIElmIGYgZGlkbid0IGl0c2VsZiB0aHJvdywgbWFrZSBzdXJlIGl0IGNoZWNrZWQgYWxsIG9mIGl0cyBhcmd1bWVudHMuXG4gICAgYXJnQ2hlY2tlci50aHJvd1VubGVzc0FsbEFyZ3VtZW50c0hhdmVCZWVuQ2hlY2tlZCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cbn07XG5cbmNsYXNzIE9wdGlvbmFsIHtcbiAgY29uc3RydWN0b3IocGF0dGVybikge1xuICAgIHRoaXMucGF0dGVybiA9IHBhdHRlcm47XG4gIH1cbn1cblxuY2xhc3MgTWF5YmUge1xuICBjb25zdHJ1Y3RvcihwYXR0ZXJuKSB7XG4gICAgdGhpcy5wYXR0ZXJuID0gcGF0dGVybjtcbiAgfVxufVxuXG5jbGFzcyBPbmVPZiB7XG4gIGNvbnN0cnVjdG9yKGNob2ljZXMpIHtcbiAgICBpZiAoIWNob2ljZXMgfHwgY2hvaWNlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTXVzdCBwcm92aWRlIGF0IGxlYXN0IG9uZSBjaG9pY2UgdG8gTWF0Y2guT25lT2YnKTtcbiAgICB9XG5cbiAgICB0aGlzLmNob2ljZXMgPSBjaG9pY2VzO1xuICB9XG59XG5cbmNsYXNzIFdoZXJlIHtcbiAgY29uc3RydWN0b3IoY29uZGl0aW9uKSB7XG4gICAgdGhpcy5jb25kaXRpb24gPSBjb25kaXRpb247XG4gIH1cbn1cblxuY2xhc3MgT2JqZWN0SW5jbHVkaW5nIHtcbiAgY29uc3RydWN0b3IocGF0dGVybikge1xuICAgIHRoaXMucGF0dGVybiA9IHBhdHRlcm47XG4gIH1cbn1cblxuY2xhc3MgT2JqZWN0V2l0aFZhbHVlcyB7XG4gIGNvbnN0cnVjdG9yKHBhdHRlcm4pIHtcbiAgICB0aGlzLnBhdHRlcm4gPSBwYXR0ZXJuO1xuICB9XG59XG5cbmNvbnN0IHN0cmluZ0ZvckVycm9yTWVzc2FnZSA9ICh2YWx1ZSwgb3B0aW9ucyA9IHt9KSA9PiB7XG4gIGlmICggdmFsdWUgPT09IG51bGwgKSB7XG4gICAgcmV0dXJuICdudWxsJztcbiAgfVxuXG4gIGlmICggb3B0aW9ucy5vbmx5U2hvd1R5cGUgKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZTtcbiAgfVxuXG4gIC8vIFlvdXIgYXZlcmFnZSBub24tb2JqZWN0IHRoaW5ncy4gIFNhdmVzIGZyb20gZG9pbmcgdGhlIHRyeS9jYXRjaCBiZWxvdyBmb3IuXG4gIGlmICggdHlwZW9mIHZhbHVlICE9PSAnb2JqZWN0JyApIHtcbiAgICByZXR1cm4gRUpTT04uc3RyaW5naWZ5KHZhbHVlKVxuICB9XG5cbiAgdHJ5IHtcblxuICAgIC8vIEZpbmQgb2JqZWN0cyB3aXRoIGNpcmN1bGFyIHJlZmVyZW5jZXMgc2luY2UgRUpTT04gZG9lc24ndCBzdXBwb3J0IHRoZW0geWV0IChJc3N1ZSAjNDc3OCArIFVuYWNjZXB0ZWQgUFIpXG4gICAgLy8gSWYgdGhlIG5hdGl2ZSBzdHJpbmdpZnkgaXMgZ29pbmcgdG8gY2hva2UsIEVKU09OLnN0cmluZ2lmeSBpcyBnb2luZyB0byBjaG9rZSB0b28uXG4gICAgSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuICB9IGNhdGNoIChzdHJpbmdpZnlFcnJvcikge1xuICAgIGlmICggc3RyaW5naWZ5RXJyb3IubmFtZSA9PT0gJ1R5cGVFcnJvcicgKSB7XG4gICAgICByZXR1cm4gdHlwZW9mIHZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBFSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xufTtcblxuY29uc3QgdHlwZW9mQ2hlY2tzID0gW1xuICBbU3RyaW5nLCAnc3RyaW5nJ10sXG4gIFtOdW1iZXIsICdudW1iZXInXSxcbiAgW0Jvb2xlYW4sICdib29sZWFuJ10sXG5cbiAgLy8gV2hpbGUgd2UgZG9uJ3QgYWxsb3cgdW5kZWZpbmVkL2Z1bmN0aW9uIGluIEVKU09OLCB0aGlzIGlzIGdvb2QgZm9yIG9wdGlvbmFsXG4gIC8vIGFyZ3VtZW50cyB3aXRoIE9uZU9mLlxuICBbRnVuY3Rpb24sICdmdW5jdGlvbiddLFxuICBbdW5kZWZpbmVkLCAndW5kZWZpbmVkJ10sXG5dO1xuXG4vLyBSZXR1cm4gYGZhbHNlYCBpZiBpdCBtYXRjaGVzLiBPdGhlcndpc2UsIHJldHVybnMgYW4gb2JqZWN0IHdpdGggYSBgbWVzc2FnZWAgYW5kIGEgYHBhdGhgIGZpZWxkIG9yIGFuIGFycmF5IG9mIG9iamVjdHMgZWFjaCB3aXRoIGEgYG1lc3NhZ2VgIGFuZCBhIGBwYXRoYCBmaWVsZCB3aGVuIGNvbGxlY3RpbmcgZXJyb3JzLlxuY29uc3QgdGVzdFN1YnRyZWUgPSAodmFsdWUsIHBhdHRlcm4sIGNvbGxlY3RFcnJvcnMgPSBmYWxzZSwgZXJyb3JzID0gW10sIHBhdGggPSAnJykgPT4ge1xuICAvLyBNYXRjaCBhbnl0aGluZyFcbiAgaWYgKHBhdHRlcm4gPT09IE1hdGNoLkFueSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIC8vIEJhc2ljIGF0b21pYyB0eXBlcy5cbiAgLy8gRG8gbm90IG1hdGNoIGJveGVkIG9iamVjdHMgKGUuZy4gU3RyaW5nLCBCb29sZWFuKVxuICBmb3IgKGxldCBpID0gMDsgaSA8IHR5cGVvZkNoZWNrcy5sZW5ndGg7ICsraSkge1xuICAgIGlmIChwYXR0ZXJuID09PSB0eXBlb2ZDaGVja3NbaV1bMF0pIHtcbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09IHR5cGVvZkNoZWNrc1tpXVsxXSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIG1lc3NhZ2U6IGBFeHBlY3RlZCAke3R5cGVvZkNoZWNrc1tpXVsxXX0sIGdvdCAke3N0cmluZ0ZvckVycm9yTWVzc2FnZSh2YWx1ZSwgeyBvbmx5U2hvd1R5cGU6IHRydWUgfSl9YCxcbiAgICAgICAgcGF0aDogJycsXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIGlmIChwYXR0ZXJuID09PSBudWxsKSB7XG4gICAgaWYgKHZhbHVlID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIG1lc3NhZ2U6IGBFeHBlY3RlZCBudWxsLCBnb3QgJHtzdHJpbmdGb3JFcnJvck1lc3NhZ2UodmFsdWUpfWAsXG4gICAgICBwYXRoOiAnJyxcbiAgICB9O1xuICB9XG5cbiAgLy8gU3RyaW5ncywgbnVtYmVycywgYW5kIGJvb2xlYW5zIG1hdGNoIGxpdGVyYWxseS4gR29lcyB3ZWxsIHdpdGggTWF0Y2guT25lT2YuXG4gIGlmICh0eXBlb2YgcGF0dGVybiA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIHBhdHRlcm4gPT09ICdudW1iZXInIHx8IHR5cGVvZiBwYXR0ZXJuID09PSAnYm9vbGVhbicpIHtcbiAgICBpZiAodmFsdWUgPT09IHBhdHRlcm4pIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgbWVzc2FnZTogYEV4cGVjdGVkICR7cGF0dGVybn0sIGdvdCAke3N0cmluZ0ZvckVycm9yTWVzc2FnZSh2YWx1ZSl9YCxcbiAgICAgIHBhdGg6ICcnLFxuICAgIH07XG4gIH1cblxuICAvLyBNYXRjaC5JbnRlZ2VyIGlzIHNwZWNpYWwgdHlwZSBlbmNvZGVkIHdpdGggYXJyYXlcbiAgaWYgKHBhdHRlcm4gPT09IE1hdGNoLkludGVnZXIpIHtcblxuICAgIC8vIFRoZXJlIGlzIG5vIGNvbnNpc3RlbnQgYW5kIHJlbGlhYmxlIHdheSB0byBjaGVjayBpZiB2YXJpYWJsZSBpcyBhIDY0LWJpdFxuICAgIC8vIGludGVnZXIuIE9uZSBvZiB0aGUgcG9wdWxhciBzb2x1dGlvbnMgaXMgdG8gZ2V0IHJlbWluZGVyIG9mIGRpdmlzaW9uIGJ5IDFcbiAgICAvLyBidXQgdGhpcyBtZXRob2QgZmFpbHMgb24gcmVhbGx5IGxhcmdlIGZsb2F0cyB3aXRoIGJpZyBwcmVjaXNpb24uXG4gICAgLy8gRS5nLjogMS4zNDgxOTIzMDg0OTE4MjRlKzIzICUgMSA9PT0gMCBpbiBWOFxuICAgIC8vIEJpdHdpc2Ugb3BlcmF0b3JzIHdvcmsgY29uc2lzdGFudGx5IGJ1dCBhbHdheXMgY2FzdCB2YXJpYWJsZSB0byAzMi1iaXRcbiAgICAvLyBzaWduZWQgaW50ZWdlciBhY2NvcmRpbmcgdG8gSmF2YVNjcmlwdCBzcGVjcy5cbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJiAodmFsdWUgfCAwKSA9PT0gdmFsdWUpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgbWVzc2FnZTogYEV4cGVjdGVkIEludGVnZXIsIGdvdCAke3N0cmluZ0ZvckVycm9yTWVzc2FnZSh2YWx1ZSl9YCxcbiAgICAgIHBhdGg6ICcnLFxuICAgIH07XG4gIH1cblxuICAvLyAnT2JqZWN0JyBpcyBzaG9ydGhhbmQgZm9yIE1hdGNoLk9iamVjdEluY2x1ZGluZyh7fSk7XG4gIGlmIChwYXR0ZXJuID09PSBPYmplY3QpIHtcbiAgICBwYXR0ZXJuID0gTWF0Y2guT2JqZWN0SW5jbHVkaW5nKHt9KTtcbiAgfVxuXG4gIC8vIEFycmF5IChjaGVja2VkIEFGVEVSIEFueSwgd2hpY2ggaXMgaW1wbGVtZW50ZWQgYXMgYW4gQXJyYXkpLlxuICBpZiAocGF0dGVybiBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgaWYgKHBhdHRlcm4ubGVuZ3RoICE9PSAxKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBtZXNzYWdlOiBgQmFkIHBhdHRlcm46IGFycmF5cyBtdXN0IGhhdmUgb25lIHR5cGUgZWxlbWVudCAke3N0cmluZ0ZvckVycm9yTWVzc2FnZShwYXR0ZXJuKX1gLFxuICAgICAgICBwYXRoOiAnJyxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KHZhbHVlKSAmJiAhaXNBcmd1bWVudHModmFsdWUpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBtZXNzYWdlOiBgRXhwZWN0ZWQgYXJyYXksIGdvdCAke3N0cmluZ0ZvckVycm9yTWVzc2FnZSh2YWx1ZSl9YCxcbiAgICAgICAgcGF0aDogJycsXG4gICAgICB9O1xuICAgIH1cblxuXG4gICAgZm9yIChsZXQgaSA9IDAsIGxlbmd0aCA9IHZhbHVlLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBhcnJQYXRoID0gYCR7cGF0aH1bJHtpfV1gXG4gICAgICBjb25zdCByZXN1bHQgPSB0ZXN0U3VidHJlZSh2YWx1ZVtpXSwgcGF0dGVyblswXSwgY29sbGVjdEVycm9ycywgZXJyb3JzLCBhcnJQYXRoKTtcbiAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgcmVzdWx0LnBhdGggPSBfcHJlcGVuZFBhdGgoY29sbGVjdEVycm9ycyA/IGFyclBhdGggOiBpLCByZXN1bHQucGF0aClcbiAgICAgICAgaWYgKCFjb2xsZWN0RXJyb3JzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlW2ldICE9PSAnb2JqZWN0JyB8fCByZXN1bHQubWVzc2FnZSkgZXJyb3JzLnB1c2gocmVzdWx0KVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmICghY29sbGVjdEVycm9ycykgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiBlcnJvcnMubGVuZ3RoID09PSAwID8gZmFsc2UgOiBlcnJvcnM7XG4gIH1cblxuICAvLyBBcmJpdHJhcnkgdmFsaWRhdGlvbiBjaGVja3MuIFRoZSBjb25kaXRpb24gY2FuIHJldHVybiBmYWxzZSBvciB0aHJvdyBhXG4gIC8vIE1hdGNoLkVycm9yIChpZSwgaXQgY2FuIGludGVybmFsbHkgdXNlIGNoZWNrKCkpIHRvIGZhaWwuXG4gIGlmIChwYXR0ZXJuIGluc3RhbmNlb2YgV2hlcmUpIHtcbiAgICBsZXQgcmVzdWx0O1xuICAgIHRyeSB7XG4gICAgICByZXN1bHQgPSBwYXR0ZXJuLmNvbmRpdGlvbih2YWx1ZSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBpZiAoIShlcnIgaW5zdGFuY2VvZiBNYXRjaC5FcnJvcikpIHtcbiAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBtZXNzYWdlOiBlcnIubWVzc2FnZSxcbiAgICAgICAgcGF0aDogZXJyLnBhdGhcbiAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKHJlc3VsdCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIC8vIFhYWCB0aGlzIGVycm9yIGlzIHRlcnJpYmxlXG5cbiAgICByZXR1cm4ge1xuICAgICAgbWVzc2FnZTogJ0ZhaWxlZCBNYXRjaC5XaGVyZSB2YWxpZGF0aW9uJyxcbiAgICAgIHBhdGg6ICcnLFxuICAgIH07XG4gIH1cblxuICBpZiAocGF0dGVybiBpbnN0YW5jZW9mIE1heWJlKSB7XG4gICAgcGF0dGVybiA9IE1hdGNoLk9uZU9mKHVuZGVmaW5lZCwgbnVsbCwgcGF0dGVybi5wYXR0ZXJuKTtcbiAgfSBlbHNlIGlmIChwYXR0ZXJuIGluc3RhbmNlb2YgT3B0aW9uYWwpIHtcbiAgICBwYXR0ZXJuID0gTWF0Y2guT25lT2YodW5kZWZpbmVkLCBwYXR0ZXJuLnBhdHRlcm4pO1xuICB9XG5cbiAgaWYgKHBhdHRlcm4gaW5zdGFuY2VvZiBPbmVPZikge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGF0dGVybi5jaG9pY2VzLmxlbmd0aDsgKytpKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSB0ZXN0U3VidHJlZSh2YWx1ZSwgcGF0dGVybi5jaG9pY2VzW2ldKTtcbiAgICAgIGlmICghcmVzdWx0KSB7XG5cbiAgICAgICAgLy8gTm8gZXJyb3I/IFlheSwgcmV0dXJuLlxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIC8vIE1hdGNoIGVycm9ycyBqdXN0IG1lYW4gdHJ5IGFub3RoZXIgY2hvaWNlLlxuICAgIH1cblxuICAgIC8vIFhYWCB0aGlzIGVycm9yIGlzIHRlcnJpYmxlXG4gICAgcmV0dXJuIHtcbiAgICAgIG1lc3NhZ2U6ICdGYWlsZWQgTWF0Y2guT25lT2YsIE1hdGNoLk1heWJlIG9yIE1hdGNoLk9wdGlvbmFsIHZhbGlkYXRpb24nLFxuICAgICAgcGF0aDogJycsXG4gICAgfTtcbiAgfVxuXG4gIC8vIEEgZnVuY3Rpb24gdGhhdCBpc24ndCBzb21ldGhpbmcgd2Ugc3BlY2lhbC1jYXNlIGlzIGFzc3VtZWQgdG8gYmUgYVxuICAvLyBjb25zdHJ1Y3Rvci5cbiAgaWYgKHBhdHRlcm4gaW5zdGFuY2VvZiBGdW5jdGlvbikge1xuICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIHBhdHRlcm4pIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgbWVzc2FnZTogYEV4cGVjdGVkICR7cGF0dGVybi5uYW1lIHx8ICdwYXJ0aWN1bGFyIGNvbnN0cnVjdG9yJ31gLFxuICAgICAgcGF0aDogJycsXG4gICAgfTtcbiAgfVxuXG4gIGxldCB1bmtub3duS2V5c0FsbG93ZWQgPSBmYWxzZTtcbiAgbGV0IHVua25vd25LZXlQYXR0ZXJuO1xuICBpZiAocGF0dGVybiBpbnN0YW5jZW9mIE9iamVjdEluY2x1ZGluZykge1xuICAgIHVua25vd25LZXlzQWxsb3dlZCA9IHRydWU7XG4gICAgcGF0dGVybiA9IHBhdHRlcm4ucGF0dGVybjtcbiAgfVxuXG4gIGlmIChwYXR0ZXJuIGluc3RhbmNlb2YgT2JqZWN0V2l0aFZhbHVlcykge1xuICAgIHVua25vd25LZXlzQWxsb3dlZCA9IHRydWU7XG4gICAgdW5rbm93bktleVBhdHRlcm4gPSBbcGF0dGVybi5wYXR0ZXJuXTtcbiAgICBwYXR0ZXJuID0ge307ICAvLyBubyByZXF1aXJlZCBrZXlzXG4gIH1cblxuICBpZiAodHlwZW9mIHBhdHRlcm4gIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG1lc3NhZ2U6ICdCYWQgcGF0dGVybjogdW5rbm93biBwYXR0ZXJuIHR5cGUnLFxuICAgICAgcGF0aDogJycsXG4gICAgfTtcbiAgfVxuXG4gIC8vIEFuIG9iamVjdCwgd2l0aCByZXF1aXJlZCBhbmQgb3B0aW9uYWwga2V5cy4gTm90ZSB0aGF0IHRoaXMgZG9lcyBOT1QgZG9cbiAgLy8gc3RydWN0dXJhbCBtYXRjaGVzIGFnYWluc3Qgb2JqZWN0cyBvZiBzcGVjaWFsIHR5cGVzIHRoYXQgaGFwcGVuIHRvIG1hdGNoXG4gIC8vIHRoZSBwYXR0ZXJuOiB0aGlzIHJlYWxseSBuZWVkcyB0byBiZSBhIHBsYWluIG9sZCB7T2JqZWN0fSFcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4ge1xuICAgICAgbWVzc2FnZTogYEV4cGVjdGVkIG9iamVjdCwgZ290ICR7dHlwZW9mIHZhbHVlfWAsXG4gICAgICBwYXRoOiAnJyxcbiAgICB9O1xuICB9XG5cbiAgaWYgKHZhbHVlID09PSBudWxsKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG1lc3NhZ2U6IGBFeHBlY3RlZCBvYmplY3QsIGdvdCBudWxsYCxcbiAgICAgIHBhdGg6ICcnLFxuICAgIH07XG4gIH1cblxuICBpZiAoISBpc1BsYWluT2JqZWN0KHZhbHVlKSkge1xuICAgIHJldHVybiB7XG4gICAgICBtZXNzYWdlOiBgRXhwZWN0ZWQgcGxhaW4gb2JqZWN0YCxcbiAgICAgIHBhdGg6ICcnLFxuICAgIH07XG4gIH1cblxuICBjb25zdCByZXF1aXJlZFBhdHRlcm5zID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgY29uc3Qgb3B0aW9uYWxQYXR0ZXJucyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cbiAgT2JqZWN0LmtleXMocGF0dGVybikuZm9yRWFjaChrZXkgPT4ge1xuICAgIGNvbnN0IHN1YlBhdHRlcm4gPSBwYXR0ZXJuW2tleV07XG4gICAgaWYgKHN1YlBhdHRlcm4gaW5zdGFuY2VvZiBPcHRpb25hbCB8fFxuICAgICAgICBzdWJQYXR0ZXJuIGluc3RhbmNlb2YgTWF5YmUpIHtcbiAgICAgIG9wdGlvbmFsUGF0dGVybnNba2V5XSA9IHN1YlBhdHRlcm4ucGF0dGVybjtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVxdWlyZWRQYXR0ZXJuc1trZXldID0gc3ViUGF0dGVybjtcbiAgICB9XG4gIH0pO1xuXG4gIGZvciAobGV0IGtleSBpbiBPYmplY3QodmFsdWUpKSB7XG4gICAgY29uc3Qgc3ViVmFsdWUgPSB2YWx1ZVtrZXldO1xuICAgIGNvbnN0IG9ialBhdGggPSBwYXRoID8gYCR7cGF0aH0uJHtrZXl9YCA6IGtleTtcbiAgICBpZiAoaGFzT3duLmNhbGwocmVxdWlyZWRQYXR0ZXJucywga2V5KSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gdGVzdFN1YnRyZWUoc3ViVmFsdWUsIHJlcXVpcmVkUGF0dGVybnNba2V5XSwgY29sbGVjdEVycm9ycywgZXJyb3JzLCBvYmpQYXRoKTtcbiAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgcmVzdWx0LnBhdGggPSBfcHJlcGVuZFBhdGgoY29sbGVjdEVycm9ycyA/IG9ialBhdGggOiBrZXksIHJlc3VsdC5wYXRoKVxuICAgICAgICBpZiAoIWNvbGxlY3RFcnJvcnMpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIGlmICh0eXBlb2Ygc3ViVmFsdWUgIT09ICdvYmplY3QnIHx8IHJlc3VsdC5tZXNzYWdlKSBlcnJvcnMucHVzaChyZXN1bHQpO1xuICAgICAgfVxuXG4gICAgICBkZWxldGUgcmVxdWlyZWRQYXR0ZXJuc1trZXldO1xuICAgIH0gZWxzZSBpZiAoaGFzT3duLmNhbGwob3B0aW9uYWxQYXR0ZXJucywga2V5KSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gdGVzdFN1YnRyZWUoc3ViVmFsdWUsIG9wdGlvbmFsUGF0dGVybnNba2V5XSwgY29sbGVjdEVycm9ycywgZXJyb3JzLCBvYmpQYXRoKTtcbiAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgcmVzdWx0LnBhdGggPSBfcHJlcGVuZFBhdGgoY29sbGVjdEVycm9ycyA/IG9ialBhdGggOiBrZXksIHJlc3VsdC5wYXRoKVxuICAgICAgICBpZiAoIWNvbGxlY3RFcnJvcnMpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIGlmICh0eXBlb2Ygc3ViVmFsdWUgIT09ICdvYmplY3QnIHx8IHJlc3VsdC5tZXNzYWdlKSBlcnJvcnMucHVzaChyZXN1bHQpO1xuICAgICAgfVxuXG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICghdW5rbm93bktleXNBbGxvd2VkKSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHtcbiAgICAgICAgICBtZXNzYWdlOiAnVW5rbm93biBrZXknLFxuICAgICAgICAgIHBhdGg6IGtleSxcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKCFjb2xsZWN0RXJyb3JzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICBlcnJvcnMucHVzaChyZXN1bHQpO1xuICAgICAgfVxuXG4gICAgICBpZiAodW5rbm93bktleVBhdHRlcm4pIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gdGVzdFN1YnRyZWUoc3ViVmFsdWUsIHVua25vd25LZXlQYXR0ZXJuWzBdLCBjb2xsZWN0RXJyb3JzLCBlcnJvcnMsIG9ialBhdGgpO1xuICAgICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgICAgcmVzdWx0LnBhdGggPSBfcHJlcGVuZFBhdGgoY29sbGVjdEVycm9ycyA/IG9ialBhdGggOiBrZXksIHJlc3VsdC5wYXRoKVxuICAgICAgICAgIGlmICghY29sbGVjdEVycm9ycykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICBpZiAodHlwZW9mIHN1YlZhbHVlICE9PSAnb2JqZWN0JyB8fCByZXN1bHQubWVzc2FnZSkgZXJyb3JzLnB1c2gocmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhyZXF1aXJlZFBhdHRlcm5zKTtcbiAgaWYgKGtleXMubGVuZ3RoKSB7XG4gICAgY29uc3QgY3JlYXRlTWlzc2luZ0Vycm9yID0ga2V5ID0+ICh7XG4gICAgICBtZXNzYWdlOiBgTWlzc2luZyBrZXkgJyR7a2V5fSdgLFxuICAgICAgcGF0aDogY29sbGVjdEVycm9ycyA/IHBhdGggOiAnJyxcbiAgICB9KTtcblxuICAgIGlmICghY29sbGVjdEVycm9ycykge1xuICAgICAgcmV0dXJuIGNyZWF0ZU1pc3NpbmdFcnJvcihrZXlzWzBdKTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgICBlcnJvcnMucHVzaChjcmVhdGVNaXNzaW5nRXJyb3Ioa2V5KSk7XG4gICAgfVxuICB9XG5cbiAgaWYgKCFjb2xsZWN0RXJyb3JzKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiBlcnJvcnMubGVuZ3RoID09PSAwID8gZmFsc2UgOiBlcnJvcnM7XG59O1xuXG5jbGFzcyBBcmd1bWVudENoZWNrZXIge1xuICBjb25zdHJ1Y3RvciAoYXJncywgZGVzY3JpcHRpb24pIHtcblxuICAgIC8vIE1ha2UgYSBTSEFMTE9XIGNvcHkgb2YgdGhlIGFyZ3VtZW50cy4gKFdlJ2xsIGJlIGRvaW5nIGlkZW50aXR5IGNoZWNrc1xuICAgIC8vIGFnYWluc3QgaXRzIGNvbnRlbnRzLilcbiAgICB0aGlzLmFyZ3MgPSBbLi4uYXJnc107XG5cbiAgICAvLyBTaW5jZSB0aGUgY29tbW9uIGNhc2Ugd2lsbCBiZSB0byBjaGVjayBhcmd1bWVudHMgaW4gb3JkZXIsIGFuZCB3ZSBzcGxpY2VcbiAgICAvLyBvdXQgYXJndW1lbnRzIHdoZW4gd2UgY2hlY2sgdGhlbSwgbWFrZSBpdCBzbyB3ZSBzcGxpY2Ugb3V0IGZyb20gdGhlIGVuZFxuICAgIC8vIHJhdGhlciB0aGFuIHRoZSBiZWdpbm5pbmcuXG4gICAgdGhpcy5hcmdzLnJldmVyc2UoKTtcbiAgICB0aGlzLmRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XG4gIH1cblxuICBjaGVja2luZyh2YWx1ZSkge1xuICAgIGlmICh0aGlzLl9jaGVja2luZ09uZVZhbHVlKHZhbHVlKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIEFsbG93IGNoZWNrKGFyZ3VtZW50cywgW1N0cmluZ10pIG9yIGNoZWNrKGFyZ3VtZW50cy5zbGljZSgxKSwgW1N0cmluZ10pXG4gICAgLy8gb3IgY2hlY2soW2ZvbywgYmFyXSwgW1N0cmluZ10pIHRvIGNvdW50Li4uIGJ1dCBvbmx5IGlmIHZhbHVlIHdhc24ndFxuICAgIC8vIGl0c2VsZiBhbiBhcmd1bWVudC5cbiAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkgfHwgaXNBcmd1bWVudHModmFsdWUpKSB7XG4gICAgICBBcnJheS5wcm90b3R5cGUuZm9yRWFjaC5jYWxsKHZhbHVlLCB0aGlzLl9jaGVja2luZ09uZVZhbHVlLmJpbmQodGhpcykpO1xuICAgIH1cbiAgfVxuXG4gIF9jaGVja2luZ09uZVZhbHVlKHZhbHVlKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmFyZ3MubGVuZ3RoOyArK2kpIHtcblxuICAgICAgLy8gSXMgdGhpcyB2YWx1ZSBvbmUgb2YgdGhlIGFyZ3VtZW50cz8gKFRoaXMgY2FuIGhhdmUgYSBmYWxzZSBwb3NpdGl2ZSBpZlxuICAgICAgLy8gdGhlIGFyZ3VtZW50IGlzIGFuIGludGVybmVkIHByaW1pdGl2ZSwgYnV0IGl0J3Mgc3RpbGwgYSBnb29kIGVub3VnaFxuICAgICAgLy8gY2hlY2suKVxuICAgICAgLy8gKE5hTiBpcyBub3QgPT09IHRvIGl0c2VsZiwgc28gd2UgaGF2ZSB0byBjaGVjayBzcGVjaWFsbHkuKVxuICAgICAgaWYgKHZhbHVlID09PSB0aGlzLmFyZ3NbaV0gfHxcbiAgICAgICAgICAoTnVtYmVyLmlzTmFOKHZhbHVlKSAmJiBOdW1iZXIuaXNOYU4odGhpcy5hcmdzW2ldKSkpIHtcbiAgICAgICAgdGhpcy5hcmdzLnNwbGljZShpLCAxKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHRocm93VW5sZXNzQWxsQXJndW1lbnRzSGF2ZUJlZW5DaGVja2VkKCkge1xuICAgIGlmICh0aGlzLmFyZ3MubGVuZ3RoID4gMClcbiAgICAgIHRocm93IG5ldyBFcnJvcihgRGlkIG5vdCBjaGVjaygpIGFsbCBhcmd1bWVudHMgZHVyaW5nICR7dGhpcy5kZXNjcmlwdGlvbn1gKTtcbiAgfVxufVxuXG5jb25zdCBfanNLZXl3b3JkcyA9IFsnZG8nLCAnaWYnLCAnaW4nLCAnZm9yJywgJ2xldCcsICduZXcnLCAndHJ5JywgJ3ZhcicsICdjYXNlJyxcbiAgJ2Vsc2UnLCAnZW51bScsICdldmFsJywgJ2ZhbHNlJywgJ251bGwnLCAndGhpcycsICd0cnVlJywgJ3ZvaWQnLCAnd2l0aCcsXG4gICdicmVhaycsICdjYXRjaCcsICdjbGFzcycsICdjb25zdCcsICdzdXBlcicsICd0aHJvdycsICd3aGlsZScsICd5aWVsZCcsXG4gICdkZWxldGUnLCAnZXhwb3J0JywgJ2ltcG9ydCcsICdwdWJsaWMnLCAncmV0dXJuJywgJ3N0YXRpYycsICdzd2l0Y2gnLFxuICAndHlwZW9mJywgJ2RlZmF1bHQnLCAnZXh0ZW5kcycsICdmaW5hbGx5JywgJ3BhY2thZ2UnLCAncHJpdmF0ZScsICdjb250aW51ZScsXG4gICdkZWJ1Z2dlcicsICdmdW5jdGlvbicsICdhcmd1bWVudHMnLCAnaW50ZXJmYWNlJywgJ3Byb3RlY3RlZCcsICdpbXBsZW1lbnRzJyxcbiAgJ2luc3RhbmNlb2YnXTtcblxuLy8gQXNzdW1lcyB0aGUgYmFzZSBvZiBwYXRoIGlzIGFscmVhZHkgZXNjYXBlZCBwcm9wZXJseVxuLy8gcmV0dXJucyBrZXkgKyBiYXNlXG5jb25zdCBfcHJlcGVuZFBhdGggPSAoa2V5LCBiYXNlKSA9PiB7XG4gIGlmICgodHlwZW9mIGtleSkgPT09ICdudW1iZXInIHx8IGtleS5tYXRjaCgvXlswLTldKyQvKSkge1xuICAgIGtleSA9IGBbJHtrZXl9XWA7XG4gIH0gZWxzZSBpZiAoIWtleS5tYXRjaCgvXlthLXpfJF1bMC05YS16XyQuW1xcXV0qJC9pKSB8fFxuICAgICAgICAgICAgIF9qc0tleXdvcmRzLmluZGV4T2Yoa2V5KSA+PSAwKSB7XG4gICAga2V5ID0gSlNPTi5zdHJpbmdpZnkoW2tleV0pO1xuICB9XG5cbiAgaWYgKGJhc2UgJiYgYmFzZVswXSAhPT0gJ1snKSB7XG4gICAgcmV0dXJuIGAke2tleX0uJHtiYXNlfWA7XG4gIH1cblxuICByZXR1cm4ga2V5ICsgYmFzZTtcbn1cblxuY29uc3QgaXNPYmplY3QgPSB2YWx1ZSA9PiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsO1xuXG5jb25zdCBiYXNlSXNBcmd1bWVudHMgPSBpdGVtID0+XG4gIGlzT2JqZWN0KGl0ZW0pICYmXG4gIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChpdGVtKSA9PT0gJ1tvYmplY3QgQXJndW1lbnRzXSc7XG5cbmNvbnN0IGlzQXJndW1lbnRzID0gYmFzZUlzQXJndW1lbnRzKGZ1bmN0aW9uKCkgeyByZXR1cm4gYXJndW1lbnRzOyB9KCkpID9cbiAgYmFzZUlzQXJndW1lbnRzIDpcbiAgdmFsdWUgPT4gaXNPYmplY3QodmFsdWUpICYmIHR5cGVvZiB2YWx1ZS5jYWxsZWUgPT09ICdmdW5jdGlvbic7XG4iLCIvLyBDb3B5IG9mIGpRdWVyeS5pc1BsYWluT2JqZWN0IGZvciB0aGUgc2VydmVyIHNpZGUgZnJvbSBqUXVlcnkgdjMuMS4xLlxuXG5jb25zdCBjbGFzczJ0eXBlID0ge307XG5cbmNvbnN0IHRvU3RyaW5nID0gY2xhc3MydHlwZS50b1N0cmluZztcblxuY29uc3QgaGFzT3duID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcblxuY29uc3QgZm5Ub1N0cmluZyA9IGhhc093bi50b1N0cmluZztcblxuY29uc3QgT2JqZWN0RnVuY3Rpb25TdHJpbmcgPSBmblRvU3RyaW5nLmNhbGwoT2JqZWN0KTtcblxuY29uc3QgZ2V0UHJvdG8gPSBPYmplY3QuZ2V0UHJvdG90eXBlT2Y7XG5cbmV4cG9ydCBjb25zdCBpc1BsYWluT2JqZWN0ID0gb2JqID0+IHtcbiAgbGV0IHByb3RvO1xuICBsZXQgQ3RvcjtcblxuICAvLyBEZXRlY3Qgb2J2aW91cyBuZWdhdGl2ZXNcbiAgLy8gVXNlIHRvU3RyaW5nIGluc3RlYWQgb2YgalF1ZXJ5LnR5cGUgdG8gY2F0Y2ggaG9zdCBvYmplY3RzXG4gIGlmICghb2JqIHx8IHRvU3RyaW5nLmNhbGwob2JqKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBwcm90byA9IGdldFByb3RvKG9iaik7XG5cbiAgLy8gT2JqZWN0cyB3aXRoIG5vIHByb3RvdHlwZSAoZS5nLiwgYE9iamVjdC5jcmVhdGUoIG51bGwgKWApIGFyZSBwbGFpblxuICBpZiAoIXByb3RvKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICAvLyBPYmplY3RzIHdpdGggcHJvdG90eXBlIGFyZSBwbGFpbiBpZmYgdGhleSB3ZXJlIGNvbnN0cnVjdGVkIGJ5IGEgZ2xvYmFsIE9iamVjdCBmdW5jdGlvblxuICBDdG9yID0gaGFzT3duLmNhbGwocHJvdG8sICdjb25zdHJ1Y3RvcicpICYmIHByb3RvLmNvbnN0cnVjdG9yO1xuICByZXR1cm4gdHlwZW9mIEN0b3IgPT09ICdmdW5jdGlvbicgJiYgXG4gICAgZm5Ub1N0cmluZy5jYWxsKEN0b3IpID09PSBPYmplY3RGdW5jdGlvblN0cmluZztcbn07XG4iXX0=
