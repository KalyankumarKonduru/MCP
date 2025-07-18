Package["core-runtime"].queue("random",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;
var ECMAScript = Package.ecmascript.ECMAScript;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var Random;

var require = meteorInstall({"node_modules":{"meteor":{"random":{"main_server.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/random/main_server.js                                                                    //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      Random: () => Random
    });
    let NodeRandomGenerator;
    module.link("./NodeRandomGenerator", {
      default(v) {
        NodeRandomGenerator = v;
      }
    }, 0);
    let createRandom;
    module.link("./createRandom", {
      default(v) {
        createRandom = v;
      }
    }, 1);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    const Random = createRandom(new NodeRandomGenerator());
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
///////////////////////////////////////////////////////////////////////////////////////////////////////

},"AbstractRandomGenerator.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/random/AbstractRandomGenerator.js                                                        //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      default: () => RandomGenerator
    });
    let Meteor;
    module.link("meteor/meteor", {
      Meteor(v) {
        Meteor = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    const UNMISTAKABLE_CHARS = '23456789ABCDEFGHJKLMNPQRSTWXYZabcdefghijkmnopqrstuvwxyz';
    const BASE64_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' + '0123456789-_';

    // `type` is one of `RandomGenerator.Type` as defined below.
    //
    // options:
    // - seeds: (required, only for RandomGenerator.Type.ALEA) an array
    //   whose items will be `toString`ed and used as the seed to the Alea
    //   algorithm
    class RandomGenerator {
      /**
       * @name Random.fraction
       * @summary Return a number between 0 and 1, like `Math.random`.
       * @locus Anywhere
       */
      fraction() {
        throw new Error("Unknown random generator type");
      }

      /**
       * @name Random.hexString
       * @summary Return a random string of `n` hexadecimal digits.
       * @locus Anywhere
       * @param {Number} n Length of the string
       */
      hexString(digits) {
        return this._randomString(digits, '0123456789abcdef');
      }
      _randomString(charsCount, alphabet) {
        let result = '';
        for (let i = 0; i < charsCount; i++) {
          result += this.choice(alphabet);
        }
        return result;
      }

      /**
       * @name Random.id
       * @summary Return a unique identifier, such as `"Jjwjg6gouWLXhMGKW"`, that is
       * likely to be unique in the whole world.
       * @locus Anywhere
       * @param {Number} [n] Optional length of the identifier in characters
       *   (defaults to 17)
       */
      id(charsCount) {
        // 17 characters is around 96 bits of entropy, which is the amount of
        // state in the Alea PRNG.
        if (charsCount === undefined) {
          charsCount = 17;
        }
        return this._randomString(charsCount, UNMISTAKABLE_CHARS);
      }

      /**
       * @name Random.secret
       * @summary Return a random string of printable characters with 6 bits of
       * entropy per character. Use `Random.secret` for security-critical secrets
       * that are intended for machine, rather than human, consumption.
       * @locus Anywhere
       * @param {Number} [n] Optional length of the secret string (defaults to 43
       *   characters, or 256 bits of entropy)
       */
      secret(charsCount) {
        // Default to 256 bits of entropy, or 43 characters at 6 bits per
        // character.
        if (charsCount === undefined) {
          charsCount = 43;
        }
        return this._randomString(charsCount, BASE64_CHARS);
      }

      /**
       * @name Random.choice
       * @summary Return a random element of the given array or string.
       * @locus Anywhere
       * @param {Array|String} arrayOrString Array or string to choose from
       */
      choice(arrayOrString) {
        const index = Math.floor(this.fraction() * arrayOrString.length);
        if (typeof arrayOrString === 'string') {
          return arrayOrString.substr(index, 1);
        }
        return arrayOrString[index];
      }
    }
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
///////////////////////////////////////////////////////////////////////////////////////////////////////

},"AleaRandomGenerator.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/random/AleaRandomGenerator.js                                                            //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      default: () => AleaRandomGenerator
    });
    let RandomGenerator;
    module.link("./AbstractRandomGenerator", {
      default(v) {
        RandomGenerator = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    // Alea PRNG, which is not cryptographically strong
    // see http://baagoe.org/en/wiki/Better_random_numbers_for_javascript
    // for a full discussion and Alea implementation.
    function Alea(seeds) {
      function Mash() {
        let n = 0xefc8249d;
        const mash = data => {
          data = data.toString();
          for (let i = 0; i < data.length; i++) {
            n += data.charCodeAt(i);
            let h = 0.02519603282416938 * n;
            n = h >>> 0;
            h -= n;
            h *= n;
            n = h >>> 0;
            h -= n;
            n += h * 0x100000000; // 2^32
          }
          return (n >>> 0) * 2.3283064365386963e-10; // 2^-32
        };
        mash.version = 'Mash 0.9';
        return mash;
      }
      let s0 = 0;
      let s1 = 0;
      let s2 = 0;
      let c = 1;
      if (seeds.length === 0) {
        seeds = [+new Date()];
      }
      let mash = Mash();
      s0 = mash(' ');
      s1 = mash(' ');
      s2 = mash(' ');
      for (let i = 0; i < seeds.length; i++) {
        s0 -= mash(seeds[i]);
        if (s0 < 0) {
          s0 += 1;
        }
        s1 -= mash(seeds[i]);
        if (s1 < 0) {
          s1 += 1;
        }
        s2 -= mash(seeds[i]);
        if (s2 < 0) {
          s2 += 1;
        }
      }
      mash = null;
      const random = () => {
        const t = 2091639 * s0 + c * 2.3283064365386963e-10; // 2^-32
        s0 = s1;
        s1 = s2;
        return s2 = t - (c = t | 0);
      };
      random.uint32 = () => random() * 0x100000000; // 2^32
      random.fract53 = () => random() + (random() * 0x200000 | 0) * 1.1102230246251565e-16; // 2^-53

      random.version = 'Alea 0.9';
      random.args = seeds;
      return random;
    }

    // options:
    // - seeds: an array
    //   whose items will be `toString`ed and used as the seed to the Alea
    //   algorithm
    class AleaRandomGenerator extends RandomGenerator {
      constructor() {
        let {
          seeds = []
        } = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
        super();
        if (!seeds) {
          throw new Error('No seeds were provided for Alea PRNG');
        }
        this.alea = Alea(seeds);
      }

      /**
       * @name Random.fraction
       * @summary Return a number between 0 and 1, like `Math.random`.
       * @locus Anywhere
       */
      fraction() {
        return this.alea();
      }
    }
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
///////////////////////////////////////////////////////////////////////////////////////////////////////

},"NodeRandomGenerator.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/random/NodeRandomGenerator.js                                                            //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      default: () => NodeRandomGenerator
    });
    let crypto;
    module.link("crypto", {
      default(v) {
        crypto = v;
      }
    }, 0);
    let RandomGenerator;
    module.link("./AbstractRandomGenerator", {
      default(v) {
        RandomGenerator = v;
      }
    }, 1);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    class NodeRandomGenerator extends RandomGenerator {
      /**
       * @name Random.fraction
       * @summary Return a number between 0 and 1, like `Math.random`.
       * @locus Anywhere
       */
      fraction() {
        const numerator = Number.parseInt(this.hexString(8), 16);
        return numerator * 2.3283064365386963e-10; // 2^-3;
      }

      /**
       * @name Random.hexString
       * @summary Return a random string of `n` hexadecimal digits.
       * @locus Anywhere
       * @param {Number} n Length of the string
       */
      hexString(digits) {
        const numBytes = Math.ceil(digits / 2);
        let bytes;
        // Try to get cryptographically strong randomness. Fall back to
        // non-cryptographically strong if not available.
        try {
          bytes = crypto.randomBytes(numBytes);
        } catch (e) {
          // XXX should re-throw any error except insufficient entropy
          bytes = crypto.pseudoRandomBytes(numBytes);
        }
        const result = bytes.toString('hex');
        // If the number of digits is odd, we'll have generated an extra 4 bits
        // of randomness, so we need to trim the last digit.
        return result.substring(0, digits);
      }
    }
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
///////////////////////////////////////////////////////////////////////////////////////////////////////

},"createAleaGenerator.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/random/createAleaGenerator.js                                                            //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      default: () => createAleaGenerator
    });
    let AleaRandomGenerator;
    module.link("./AleaRandomGenerator", {
      default(v) {
        AleaRandomGenerator = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    // instantiate RNG.  Heuristically collect entropy from various sources when a
    // cryptographic PRNG isn't available.

    // client sources
    const height = typeof window !== 'undefined' && window.innerHeight || typeof document !== 'undefined' && document.documentElement && document.documentElement.clientHeight || typeof document !== 'undefined' && document.body && document.body.clientHeight || 1;
    const width = typeof window !== 'undefined' && window.innerWidth || typeof document !== 'undefined' && document.documentElement && document.documentElement.clientWidth || typeof document !== 'undefined' && document.body && document.body.clientWidth || 1;
    const agent = typeof navigator !== 'undefined' && navigator.userAgent || '';
    function createAleaGenerator() {
      return new AleaRandomGenerator({
        seeds: [new Date(), height, width, agent, Math.random()]
      });
    }
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
///////////////////////////////////////////////////////////////////////////////////////////////////////

},"createRandom.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/random/createRandom.js                                                                   //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      default: () => createRandom
    });
    let AleaRandomGenerator;
    module.link("./AleaRandomGenerator", {
      default(v) {
        AleaRandomGenerator = v;
      }
    }, 0);
    let createAleaGeneratorWithGeneratedSeed;
    module.link("./createAleaGenerator", {
      default(v) {
        createAleaGeneratorWithGeneratedSeed = v;
      }
    }, 1);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    function createRandom(generator) {
      // Create a non-cryptographically secure PRNG with a given seed (using
      // the Alea algorithm)
      generator.createWithSeeds = function () {
        for (var _len = arguments.length, seeds = new Array(_len), _key = 0; _key < _len; _key++) {
          seeds[_key] = arguments[_key];
        }
        if (seeds.length === 0) {
          throw new Error('No seeds were provided');
        }
        return new AleaRandomGenerator({
          seeds
        });
      };

      // Used like `Random`, but much faster and not cryptographically
      // secure
      generator.insecure = createAleaGeneratorWithGeneratedSeed();
      return generator;
    }
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
///////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});


/* Exports */
return {
  export: function () { return {
      Random: Random
    };},
  require: require,
  eagerModulePaths: [
    "/node_modules/meteor/random/main_server.js"
  ],
  mainModulePath: "/node_modules/meteor/random/main_server.js"
}});

//# sourceURL=meteor://💻app/packages/random.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvcmFuZG9tL21haW5fc2VydmVyLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9yYW5kb20vQWJzdHJhY3RSYW5kb21HZW5lcmF0b3IuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL3JhbmRvbS9BbGVhUmFuZG9tR2VuZXJhdG9yLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9yYW5kb20vTm9kZVJhbmRvbUdlbmVyYXRvci5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvcmFuZG9tL2NyZWF0ZUFsZWFHZW5lcmF0b3IuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL3JhbmRvbS9jcmVhdGVSYW5kb20uanMiXSwibmFtZXMiOlsibW9kdWxlIiwiZXhwb3J0IiwiUmFuZG9tIiwiTm9kZVJhbmRvbUdlbmVyYXRvciIsImxpbmsiLCJkZWZhdWx0IiwidiIsImNyZWF0ZVJhbmRvbSIsIl9fcmVpZnlXYWl0Rm9yRGVwc19fIiwiX19yZWlmeV9hc3luY19yZXN1bHRfXyIsIl9yZWlmeUVycm9yIiwic2VsZiIsImFzeW5jIiwiUmFuZG9tR2VuZXJhdG9yIiwiTWV0ZW9yIiwiVU5NSVNUQUtBQkxFX0NIQVJTIiwiQkFTRTY0X0NIQVJTIiwiZnJhY3Rpb24iLCJFcnJvciIsImhleFN0cmluZyIsImRpZ2l0cyIsIl9yYW5kb21TdHJpbmciLCJjaGFyc0NvdW50IiwiYWxwaGFiZXQiLCJyZXN1bHQiLCJpIiwiY2hvaWNlIiwiaWQiLCJ1bmRlZmluZWQiLCJzZWNyZXQiLCJhcnJheU9yU3RyaW5nIiwiaW5kZXgiLCJNYXRoIiwiZmxvb3IiLCJsZW5ndGgiLCJzdWJzdHIiLCJBbGVhUmFuZG9tR2VuZXJhdG9yIiwiQWxlYSIsInNlZWRzIiwiTWFzaCIsIm4iLCJtYXNoIiwiZGF0YSIsInRvU3RyaW5nIiwiY2hhckNvZGVBdCIsImgiLCJ2ZXJzaW9uIiwiczAiLCJzMSIsInMyIiwiYyIsIkRhdGUiLCJyYW5kb20iLCJ0IiwidWludDMyIiwiZnJhY3Q1MyIsImFyZ3MiLCJjb25zdHJ1Y3RvciIsImFyZ3VtZW50cyIsImFsZWEiLCJjcnlwdG8iLCJudW1lcmF0b3IiLCJOdW1iZXIiLCJwYXJzZUludCIsIm51bUJ5dGVzIiwiY2VpbCIsImJ5dGVzIiwicmFuZG9tQnl0ZXMiLCJlIiwicHNldWRvUmFuZG9tQnl0ZXMiLCJzdWJzdHJpbmciLCJjcmVhdGVBbGVhR2VuZXJhdG9yIiwiaGVpZ2h0Iiwid2luZG93IiwiaW5uZXJIZWlnaHQiLCJkb2N1bWVudCIsImRvY3VtZW50RWxlbWVudCIsImNsaWVudEhlaWdodCIsImJvZHkiLCJ3aWR0aCIsImlubmVyV2lkdGgiLCJjbGllbnRXaWR0aCIsImFnZW50IiwibmF2aWdhdG9yIiwidXNlckFnZW50IiwiY3JlYXRlQWxlYUdlbmVyYXRvcldpdGhHZW5lcmF0ZWRTZWVkIiwiZ2VuZXJhdG9yIiwiY3JlYXRlV2l0aFNlZWRzIiwiX2xlbiIsIkFycmF5IiwiX2tleSIsImluc2VjdXJlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztJQUFBQSxNQUFNLENBQUNDLE1BQU0sQ0FBQztNQUFDQyxNQUFNLEVBQUNBLENBQUEsS0FBSUE7SUFBTSxDQUFDLENBQUM7SUFBQyxJQUFJQyxtQkFBbUI7SUFBQ0gsTUFBTSxDQUFDSSxJQUFJLENBQUMsdUJBQXVCLEVBQUM7TUFBQ0MsT0FBT0EsQ0FBQ0MsQ0FBQyxFQUFDO1FBQUNILG1CQUFtQixHQUFDRyxDQUFDO01BQUE7SUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0lBQUMsSUFBSUMsWUFBWTtJQUFDUCxNQUFNLENBQUNJLElBQUksQ0FBQyxnQkFBZ0IsRUFBQztNQUFDQyxPQUFPQSxDQUFDQyxDQUFDLEVBQUM7UUFBQ0MsWUFBWSxHQUFDRCxDQUFDO01BQUE7SUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0lBQUMsSUFBSUUsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTUEsb0JBQW9C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c2UgY3J5cHRvZ3JhcGhpY2FsbHkgc3Ryb25nIFBSTkdzIChjcnlwdG8uZ2V0UmFuZG9tQnl0ZXMoKSlcbi8vIFdoZW4gdXNpbmcgY3J5cHRvLmdldFJhbmRvbVZhbHVlcygpLCBvdXIgcHJpbWl0aXZlIGlzIGhleFN0cmluZygpLFxuLy8gZnJvbSB3aGljaCB3ZSBjb25zdHJ1Y3QgZnJhY3Rpb24oKS5cblxuaW1wb3J0IE5vZGVSYW5kb21HZW5lcmF0b3IgZnJvbSAnLi9Ob2RlUmFuZG9tR2VuZXJhdG9yJztcbmltcG9ydCBjcmVhdGVSYW5kb20gZnJvbSAnLi9jcmVhdGVSYW5kb20nO1xuXG5leHBvcnQgY29uc3QgUmFuZG9tID0gY3JlYXRlUmFuZG9tKG5ldyBOb2RlUmFuZG9tR2VuZXJhdG9yKCkpO1xuIiwiLy8gV2UgdXNlIGNyeXB0b2dyYXBoaWNhbGx5IHN0cm9uZyBQUk5HcyAoY3J5cHRvLmdldFJhbmRvbUJ5dGVzKCkgb24gdGhlIHNlcnZlcixcbi8vIHdpbmRvdy5jcnlwdG8uZ2V0UmFuZG9tVmFsdWVzKCkgaW4gdGhlIGJyb3dzZXIpIHdoZW4gYXZhaWxhYmxlLiBJZiB0aGVzZVxuLy8gUFJOR3MgZmFpbCwgd2UgZmFsbCBiYWNrIHRvIHRoZSBBbGVhIFBSTkcsIHdoaWNoIGlzIG5vdCBjcnlwdG9ncmFwaGljYWxseVxuLy8gc3Ryb25nLCBhbmQgd2Ugc2VlZCBpdCB3aXRoIHZhcmlvdXMgc291cmNlcyBzdWNoIGFzIHRoZSBkYXRlLCBNYXRoLnJhbmRvbSxcbi8vIGFuZCB3aW5kb3cgc2l6ZSBvbiB0aGUgY2xpZW50LiAgV2hlbiB1c2luZyBjcnlwdG8uZ2V0UmFuZG9tVmFsdWVzKCksIG91clxuLy8gcHJpbWl0aXZlIGlzIGhleFN0cmluZygpLCBmcm9tIHdoaWNoIHdlIGNvbnN0cnVjdCBmcmFjdGlvbigpLiBXaGVuIHVzaW5nXG4vLyB3aW5kb3cuY3J5cHRvLmdldFJhbmRvbVZhbHVlcygpIG9yIGFsZWEsIHRoZSBwcmltaXRpdmUgaXMgZnJhY3Rpb24gYW5kIHdlIHVzZVxuLy8gdGhhdCB0byBjb25zdHJ1Y3QgaGV4IHN0cmluZy5cblxuaW1wb3J0IHsgTWV0ZW9yIH0gZnJvbSAnbWV0ZW9yL21ldGVvcic7XG5cbmNvbnN0IFVOTUlTVEFLQUJMRV9DSEFSUyA9ICcyMzQ1Njc4OUFCQ0RFRkdISktMTU5QUVJTVFdYWVphYmNkZWZnaGlqa21ub3BxcnN0dXZ3eHl6JztcbmNvbnN0IEJBU0U2NF9DSEFSUyA9ICdhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ekFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaJyArXG4gICcwMTIzNDU2Nzg5LV8nO1xuXG4vLyBgdHlwZWAgaXMgb25lIG9mIGBSYW5kb21HZW5lcmF0b3IuVHlwZWAgYXMgZGVmaW5lZCBiZWxvdy5cbi8vXG4vLyBvcHRpb25zOlxuLy8gLSBzZWVkczogKHJlcXVpcmVkLCBvbmx5IGZvciBSYW5kb21HZW5lcmF0b3IuVHlwZS5BTEVBKSBhbiBhcnJheVxuLy8gICB3aG9zZSBpdGVtcyB3aWxsIGJlIGB0b1N0cmluZ2BlZCBhbmQgdXNlZCBhcyB0aGUgc2VlZCB0byB0aGUgQWxlYVxuLy8gICBhbGdvcml0aG1cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFJhbmRvbUdlbmVyYXRvciB7XG5cbiAgLyoqXG4gICAqIEBuYW1lIFJhbmRvbS5mcmFjdGlvblxuICAgKiBAc3VtbWFyeSBSZXR1cm4gYSBudW1iZXIgYmV0d2VlbiAwIGFuZCAxLCBsaWtlIGBNYXRoLnJhbmRvbWAuXG4gICAqIEBsb2N1cyBBbnl3aGVyZVxuICAgKi9cbiAgZnJhY3Rpb24gKCkge1xuICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biByYW5kb20gZ2VuZXJhdG9yIHR5cGVgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAbmFtZSBSYW5kb20uaGV4U3RyaW5nXG4gICAqIEBzdW1tYXJ5IFJldHVybiBhIHJhbmRvbSBzdHJpbmcgb2YgYG5gIGhleGFkZWNpbWFsIGRpZ2l0cy5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBuIExlbmd0aCBvZiB0aGUgc3RyaW5nXG4gICAqL1xuICBoZXhTdHJpbmcgKGRpZ2l0cykge1xuICAgIHJldHVybiB0aGlzLl9yYW5kb21TdHJpbmcoZGlnaXRzLCAnMDEyMzQ1Njc4OWFiY2RlZicpO1xuICB9XG5cbiAgX3JhbmRvbVN0cmluZyAoY2hhcnNDb3VudCwgYWxwaGFiZXQpIHtcbiAgICBsZXQgcmVzdWx0ID0gJyc7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjaGFyc0NvdW50OyBpKyspIHtcdFxuICAgICAgcmVzdWx0ICs9IHRoaXMuY2hvaWNlKGFscGhhYmV0KTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBAbmFtZSBSYW5kb20uaWRcbiAgICogQHN1bW1hcnkgUmV0dXJuIGEgdW5pcXVlIGlkZW50aWZpZXIsIHN1Y2ggYXMgYFwiSmp3amc2Z291V0xYaE1HS1dcImAsIHRoYXQgaXNcbiAgICogbGlrZWx5IHRvIGJlIHVuaXF1ZSBpbiB0aGUgd2hvbGUgd29ybGQuXG4gICAqIEBsb2N1cyBBbnl3aGVyZVxuICAgKiBAcGFyYW0ge051bWJlcn0gW25dIE9wdGlvbmFsIGxlbmd0aCBvZiB0aGUgaWRlbnRpZmllciBpbiBjaGFyYWN0ZXJzXG4gICAqICAgKGRlZmF1bHRzIHRvIDE3KVxuICAgKi9cbiAgaWQgKGNoYXJzQ291bnQpIHtcbiAgICAvLyAxNyBjaGFyYWN0ZXJzIGlzIGFyb3VuZCA5NiBiaXRzIG9mIGVudHJvcHksIHdoaWNoIGlzIHRoZSBhbW91bnQgb2ZcbiAgICAvLyBzdGF0ZSBpbiB0aGUgQWxlYSBQUk5HLlxuICAgIGlmIChjaGFyc0NvdW50ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGNoYXJzQ291bnQgPSAxNztcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5fcmFuZG9tU3RyaW5nKGNoYXJzQ291bnQsIFVOTUlTVEFLQUJMRV9DSEFSUyk7XG4gIH1cblxuICAvKipcbiAgICogQG5hbWUgUmFuZG9tLnNlY3JldFxuICAgKiBAc3VtbWFyeSBSZXR1cm4gYSByYW5kb20gc3RyaW5nIG9mIHByaW50YWJsZSBjaGFyYWN0ZXJzIHdpdGggNiBiaXRzIG9mXG4gICAqIGVudHJvcHkgcGVyIGNoYXJhY3Rlci4gVXNlIGBSYW5kb20uc2VjcmV0YCBmb3Igc2VjdXJpdHktY3JpdGljYWwgc2VjcmV0c1xuICAgKiB0aGF0IGFyZSBpbnRlbmRlZCBmb3IgbWFjaGluZSwgcmF0aGVyIHRoYW4gaHVtYW4sIGNvbnN1bXB0aW9uLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQHBhcmFtIHtOdW1iZXJ9IFtuXSBPcHRpb25hbCBsZW5ndGggb2YgdGhlIHNlY3JldCBzdHJpbmcgKGRlZmF1bHRzIHRvIDQzXG4gICAqICAgY2hhcmFjdGVycywgb3IgMjU2IGJpdHMgb2YgZW50cm9weSlcbiAgICovXG4gIHNlY3JldCAoY2hhcnNDb3VudCkge1xuICAgIC8vIERlZmF1bHQgdG8gMjU2IGJpdHMgb2YgZW50cm9weSwgb3IgNDMgY2hhcmFjdGVycyBhdCA2IGJpdHMgcGVyXG4gICAgLy8gY2hhcmFjdGVyLlxuICAgIGlmIChjaGFyc0NvdW50ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGNoYXJzQ291bnQgPSA0MztcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5fcmFuZG9tU3RyaW5nKGNoYXJzQ291bnQsIEJBU0U2NF9DSEFSUyk7XG4gIH1cblxuICAvKipcbiAgICogQG5hbWUgUmFuZG9tLmNob2ljZVxuICAgKiBAc3VtbWFyeSBSZXR1cm4gYSByYW5kb20gZWxlbWVudCBvZiB0aGUgZ2l2ZW4gYXJyYXkgb3Igc3RyaW5nLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQHBhcmFtIHtBcnJheXxTdHJpbmd9IGFycmF5T3JTdHJpbmcgQXJyYXkgb3Igc3RyaW5nIHRvIGNob29zZSBmcm9tXG4gICAqL1xuICBjaG9pY2UgKGFycmF5T3JTdHJpbmcpIHtcbiAgICBjb25zdCBpbmRleCA9IE1hdGguZmxvb3IodGhpcy5mcmFjdGlvbigpICogYXJyYXlPclN0cmluZy5sZW5ndGgpO1xuICAgIGlmICh0eXBlb2YgYXJyYXlPclN0cmluZyA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiBhcnJheU9yU3RyaW5nLnN1YnN0cihpbmRleCwgMSk7XG4gICAgfVxuICAgIHJldHVybiBhcnJheU9yU3RyaW5nW2luZGV4XTtcbiAgfVxufVxuIiwiaW1wb3J0IFJhbmRvbUdlbmVyYXRvciBmcm9tICcuL0Fic3RyYWN0UmFuZG9tR2VuZXJhdG9yJztcblxuLy8gQWxlYSBQUk5HLCB3aGljaCBpcyBub3QgY3J5cHRvZ3JhcGhpY2FsbHkgc3Ryb25nXG4vLyBzZWUgaHR0cDovL2JhYWdvZS5vcmcvZW4vd2lraS9CZXR0ZXJfcmFuZG9tX251bWJlcnNfZm9yX2phdmFzY3JpcHRcbi8vIGZvciBhIGZ1bGwgZGlzY3Vzc2lvbiBhbmQgQWxlYSBpbXBsZW1lbnRhdGlvbi5cbmZ1bmN0aW9uIEFsZWEoc2VlZHMpIHtcbiAgZnVuY3Rpb24gTWFzaCgpIHtcbiAgICBsZXQgbiA9IDB4ZWZjODI0OWQ7XG5cbiAgICBjb25zdCBtYXNoID0gKGRhdGEpID0+IHtcbiAgICAgIGRhdGEgPSBkYXRhLnRvU3RyaW5nKCk7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGRhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgbiArPSBkYXRhLmNoYXJDb2RlQXQoaSk7XG4gICAgICAgIGxldCBoID0gMC4wMjUxOTYwMzI4MjQxNjkzOCAqIG47XG4gICAgICAgIG4gPSBoID4+PiAwO1xuICAgICAgICBoIC09IG47XG4gICAgICAgIGggKj0gbjtcbiAgICAgICAgbiA9IGggPj4+IDA7XG4gICAgICAgIGggLT0gbjtcbiAgICAgICAgbiArPSBoICogMHgxMDAwMDAwMDA7IC8vIDJeMzJcbiAgICAgIH1cbiAgICAgIHJldHVybiAobiA+Pj4gMCkgKiAyLjMyODMwNjQzNjUzODY5NjNlLTEwOyAvLyAyXi0zMlxuICAgIH07XG5cbiAgICBtYXNoLnZlcnNpb24gPSAnTWFzaCAwLjknO1xuICAgIHJldHVybiBtYXNoO1xuICB9XG5cbiAgbGV0IHMwID0gMDtcbiAgbGV0IHMxID0gMDtcbiAgbGV0IHMyID0gMDtcbiAgbGV0IGMgPSAxO1xuICBpZiAoc2VlZHMubGVuZ3RoID09PSAwKSB7XG4gICAgc2VlZHMgPSBbK25ldyBEYXRlXTtcbiAgfVxuICBsZXQgbWFzaCA9IE1hc2goKTtcbiAgczAgPSBtYXNoKCcgJyk7XG4gIHMxID0gbWFzaCgnICcpO1xuICBzMiA9IG1hc2goJyAnKTtcblxuICBmb3IgKGxldCBpID0gMDsgaSA8IHNlZWRzLmxlbmd0aDsgaSsrKSB7XG4gICAgczAgLT0gbWFzaChzZWVkc1tpXSk7XG4gICAgaWYgKHMwIDwgMCkge1xuICAgICAgczAgKz0gMTtcbiAgICB9XG4gICAgczEgLT0gbWFzaChzZWVkc1tpXSk7XG4gICAgaWYgKHMxIDwgMCkge1xuICAgICAgczEgKz0gMTtcbiAgICB9XG4gICAgczIgLT0gbWFzaChzZWVkc1tpXSk7XG4gICAgaWYgKHMyIDwgMCkge1xuICAgICAgczIgKz0gMTtcbiAgICB9XG4gIH1cbiAgbWFzaCA9IG51bGw7XG5cbiAgY29uc3QgcmFuZG9tID0gKCkgPT4ge1xuICAgIGNvbnN0IHQgPSAoMjA5MTYzOSAqIHMwKSArIChjICogMi4zMjgzMDY0MzY1Mzg2OTYzZS0xMCk7IC8vIDJeLTMyXG4gICAgczAgPSBzMTtcbiAgICBzMSA9IHMyO1xuICAgIHJldHVybiBzMiA9IHQgLSAoYyA9IHQgfCAwKTtcbiAgfTtcblxuICByYW5kb20udWludDMyID0gKCkgPT4gcmFuZG9tKCkgKiAweDEwMDAwMDAwMDsgLy8gMl4zMlxuICByYW5kb20uZnJhY3Q1MyA9ICgpID0+IHJhbmRvbSgpICtcbiAgICAgICAgKChyYW5kb20oKSAqIDB4MjAwMDAwIHwgMCkgKiAxLjExMDIyMzAyNDYyNTE1NjVlLTE2KTsgLy8gMl4tNTNcblxuICByYW5kb20udmVyc2lvbiA9ICdBbGVhIDAuOSc7XG4gIHJhbmRvbS5hcmdzID0gc2VlZHM7XG4gIHJldHVybiByYW5kb207XG59XG5cbi8vIG9wdGlvbnM6XG4vLyAtIHNlZWRzOiBhbiBhcnJheVxuLy8gICB3aG9zZSBpdGVtcyB3aWxsIGJlIGB0b1N0cmluZ2BlZCBhbmQgdXNlZCBhcyB0aGUgc2VlZCB0byB0aGUgQWxlYVxuLy8gICBhbGdvcml0aG1cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEFsZWFSYW5kb21HZW5lcmF0b3IgZXh0ZW5kcyBSYW5kb21HZW5lcmF0b3Ige1xuICBjb25zdHJ1Y3RvciAoeyBzZWVkcyA9IFtdIH0gPSB7fSkge1xuICAgIHN1cGVyKCk7XG4gICAgaWYgKCFzZWVkcykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBzZWVkcyB3ZXJlIHByb3ZpZGVkIGZvciBBbGVhIFBSTkcnKTtcbiAgICB9XG4gICAgdGhpcy5hbGVhID0gQWxlYShzZWVkcyk7XG4gIH1cblxuICAvKipcbiAgICogQG5hbWUgUmFuZG9tLmZyYWN0aW9uXG4gICAqIEBzdW1tYXJ5IFJldHVybiBhIG51bWJlciBiZXR3ZWVuIDAgYW5kIDEsIGxpa2UgYE1hdGgucmFuZG9tYC5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqL1xuICBmcmFjdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuYWxlYSgpO1xuICB9XG59XG4iLCJpbXBvcnQgY3J5cHRvIGZyb20gJ2NyeXB0byc7XG5pbXBvcnQgUmFuZG9tR2VuZXJhdG9yIGZyb20gJy4vQWJzdHJhY3RSYW5kb21HZW5lcmF0b3InO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBOb2RlUmFuZG9tR2VuZXJhdG9yIGV4dGVuZHMgUmFuZG9tR2VuZXJhdG9yIHtcbiAgLyoqXG4gICAqIEBuYW1lIFJhbmRvbS5mcmFjdGlvblxuICAgKiBAc3VtbWFyeSBSZXR1cm4gYSBudW1iZXIgYmV0d2VlbiAwIGFuZCAxLCBsaWtlIGBNYXRoLnJhbmRvbWAuXG4gICAqIEBsb2N1cyBBbnl3aGVyZVxuICAgKi9cbiAgZnJhY3Rpb24gKCkge1xuICAgIGNvbnN0IG51bWVyYXRvciA9IE51bWJlci5wYXJzZUludCh0aGlzLmhleFN0cmluZyg4KSwgMTYpO1xuICAgIHJldHVybiBudW1lcmF0b3IgKiAyLjMyODMwNjQzNjUzODY5NjNlLTEwOyAvLyAyXi0zO1xuICB9XG5cbiAgLyoqXG4gICAqIEBuYW1lIFJhbmRvbS5oZXhTdHJpbmdcbiAgICogQHN1bW1hcnkgUmV0dXJuIGEgcmFuZG9tIHN0cmluZyBvZiBgbmAgaGV4YWRlY2ltYWwgZGlnaXRzLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQHBhcmFtIHtOdW1iZXJ9IG4gTGVuZ3RoIG9mIHRoZSBzdHJpbmdcbiAgICovXG4gIGhleFN0cmluZyAoZGlnaXRzKSB7XG4gICAgY29uc3QgbnVtQnl0ZXMgPSBNYXRoLmNlaWwoZGlnaXRzIC8gMik7XG4gICAgbGV0IGJ5dGVzO1xuICAgIC8vIFRyeSB0byBnZXQgY3J5cHRvZ3JhcGhpY2FsbHkgc3Ryb25nIHJhbmRvbW5lc3MuIEZhbGwgYmFjayB0b1xuICAgIC8vIG5vbi1jcnlwdG9ncmFwaGljYWxseSBzdHJvbmcgaWYgbm90IGF2YWlsYWJsZS5cbiAgICB0cnkge1xuICAgICAgYnl0ZXMgPSBjcnlwdG8ucmFuZG9tQnl0ZXMobnVtQnl0ZXMpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIC8vIFhYWCBzaG91bGQgcmUtdGhyb3cgYW55IGVycm9yIGV4Y2VwdCBpbnN1ZmZpY2llbnQgZW50cm9weVxuICAgICAgYnl0ZXMgPSBjcnlwdG8ucHNldWRvUmFuZG9tQnl0ZXMobnVtQnl0ZXMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBieXRlcy50b1N0cmluZygnaGV4Jyk7XG4gICAgLy8gSWYgdGhlIG51bWJlciBvZiBkaWdpdHMgaXMgb2RkLCB3ZSdsbCBoYXZlIGdlbmVyYXRlZCBhbiBleHRyYSA0IGJpdHNcbiAgICAvLyBvZiByYW5kb21uZXNzLCBzbyB3ZSBuZWVkIHRvIHRyaW0gdGhlIGxhc3QgZGlnaXQuXG4gICAgcmV0dXJuIHJlc3VsdC5zdWJzdHJpbmcoMCwgZGlnaXRzKTtcbiAgfVxufVxuIiwiaW1wb3J0IEFsZWFSYW5kb21HZW5lcmF0b3IgZnJvbSAnLi9BbGVhUmFuZG9tR2VuZXJhdG9yJztcblxuLy8gaW5zdGFudGlhdGUgUk5HLiAgSGV1cmlzdGljYWxseSBjb2xsZWN0IGVudHJvcHkgZnJvbSB2YXJpb3VzIHNvdXJjZXMgd2hlbiBhXG4vLyBjcnlwdG9ncmFwaGljIFBSTkcgaXNuJ3QgYXZhaWxhYmxlLlxuXG4vLyBjbGllbnQgc291cmNlc1xuY29uc3QgaGVpZ2h0ID0gKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnICYmIHdpbmRvdy5pbm5lckhlaWdodCkgfHxcbiAgICAgICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnXG4gICAgICAgJiYgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50XG4gICAgICAgJiYgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudEhlaWdodCkgfHxcbiAgICAgICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnXG4gICAgICAgJiYgZG9jdW1lbnQuYm9keVxuICAgICAgICYmIGRvY3VtZW50LmJvZHkuY2xpZW50SGVpZ2h0KSB8fFxuICAgICAgMTtcblxuY29uc3Qgd2lkdGggPSAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgd2luZG93LmlubmVyV2lkdGgpIHx8XG4gICAgICAodHlwZW9mIGRvY3VtZW50ICE9PSAndW5kZWZpbmVkJ1xuICAgICAgICYmIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudFxuICAgICAgICYmIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5jbGllbnRXaWR0aCkgfHxcbiAgICAgICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnXG4gICAgICAgJiYgZG9jdW1lbnQuYm9keVxuICAgICAgICYmIGRvY3VtZW50LmJvZHkuY2xpZW50V2lkdGgpIHx8XG4gICAgICAxO1xuXG5jb25zdCBhZ2VudCA9ICh0eXBlb2YgbmF2aWdhdG9yICE9PSAndW5kZWZpbmVkJyAmJiBuYXZpZ2F0b3IudXNlckFnZW50KSB8fCAnJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gY3JlYXRlQWxlYUdlbmVyYXRvcigpIHtcbiAgcmV0dXJuIG5ldyBBbGVhUmFuZG9tR2VuZXJhdG9yKHtcbiAgICBzZWVkczogW25ldyBEYXRlLCBoZWlnaHQsIHdpZHRoLCBhZ2VudCwgTWF0aC5yYW5kb20oKV0sXG4gIH0pO1xufVxuIiwiaW1wb3J0IEFsZWFSYW5kb21HZW5lcmF0b3IgZnJvbSAnLi9BbGVhUmFuZG9tR2VuZXJhdG9yJ1xuaW1wb3J0IGNyZWF0ZUFsZWFHZW5lcmF0b3JXaXRoR2VuZXJhdGVkU2VlZCBmcm9tICcuL2NyZWF0ZUFsZWFHZW5lcmF0b3InO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBjcmVhdGVSYW5kb20oZ2VuZXJhdG9yKSB7XG4gIC8vIENyZWF0ZSBhIG5vbi1jcnlwdG9ncmFwaGljYWxseSBzZWN1cmUgUFJORyB3aXRoIGEgZ2l2ZW4gc2VlZCAodXNpbmdcbiAgLy8gdGhlIEFsZWEgYWxnb3JpdGhtKVxuICBnZW5lcmF0b3IuY3JlYXRlV2l0aFNlZWRzID0gKC4uLnNlZWRzKSA9PiB7XG4gICAgaWYgKHNlZWRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBzZWVkcyB3ZXJlIHByb3ZpZGVkJyk7XG4gICAgfVxuICAgIHJldHVybiBuZXcgQWxlYVJhbmRvbUdlbmVyYXRvcih7IHNlZWRzIH0pO1xuICB9O1xuXG4gIC8vIFVzZWQgbGlrZSBgUmFuZG9tYCwgYnV0IG11Y2ggZmFzdGVyIGFuZCBub3QgY3J5cHRvZ3JhcGhpY2FsbHlcbiAgLy8gc2VjdXJlXG4gIGdlbmVyYXRvci5pbnNlY3VyZSA9IGNyZWF0ZUFsZWFHZW5lcmF0b3JXaXRoR2VuZXJhdGVkU2VlZCgpO1xuXG4gIHJldHVybiBnZW5lcmF0b3I7XG59XG4iXX0=
