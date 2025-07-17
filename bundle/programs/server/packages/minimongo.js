Package["core-runtime"].queue("minimongo",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;
var DiffSequence = Package['diff-sequence'].DiffSequence;
var ECMAScript = Package.ecmascript.ECMAScript;
var EJSON = Package.ejson.EJSON;
var GeoJSON = Package['geojson-utils'].GeoJSON;
var IdMap = Package['id-map'].IdMap;
var MongoID = Package['mongo-id'].MongoID;
var OrderedDict = Package['ordered-dict'].OrderedDict;
var Random = Package.random.Random;
var Tracker = Package.tracker.Tracker;
var Deps = Package.tracker.Deps;
var Decimal = Package['mongo-decimal'].Decimal;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var MinimongoTest, MinimongoError, LocalCollection, Minimongo;

var require = meteorInstall({"node_modules":{"meteor":{"minimongo":{"minimongo_server.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// packages/minimongo/minimongo_server.js                                                                            //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.link("./minimongo_common.js");
    let hasOwn, isNumericKey, isOperatorObject, pathsToTree, projectionDetails;
    module.link("./common.js", {
      hasOwn(v) {
        hasOwn = v;
      },
      isNumericKey(v) {
        isNumericKey = v;
      },
      isOperatorObject(v) {
        isOperatorObject = v;
      },
      pathsToTree(v) {
        pathsToTree = v;
      },
      projectionDetails(v) {
        projectionDetails = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    Minimongo._pathsElidingNumericKeys = paths => paths.map(path => path.split('.').filter(part => !isNumericKey(part)).join('.'));

    // Returns true if the modifier applied to some document may change the result
    // of matching the document by selector
    // The modifier is always in a form of Object:
    //  - $set
    //    - 'a.b.22.z': value
    //    - 'foo.bar': 42
    //  - $unset
    //    - 'abc.d': 1
    Minimongo.Matcher.prototype.affectedByModifier = function (modifier) {
      // safe check for $set/$unset being objects
      modifier = Object.assign({
        $set: {},
        $unset: {}
      }, modifier);
      const meaningfulPaths = this._getPaths();
      const modifiedPaths = [].concat(Object.keys(modifier.$set), Object.keys(modifier.$unset));
      return modifiedPaths.some(path => {
        const mod = path.split('.');
        return meaningfulPaths.some(meaningfulPath => {
          const sel = meaningfulPath.split('.');
          let i = 0,
            j = 0;
          while (i < sel.length && j < mod.length) {
            if (isNumericKey(sel[i]) && isNumericKey(mod[j])) {
              // foo.4.bar selector affected by foo.4 modifier
              // foo.3.bar selector unaffected by foo.4 modifier
              if (sel[i] === mod[j]) {
                i++;
                j++;
              } else {
                return false;
              }
            } else if (isNumericKey(sel[i])) {
              // foo.4.bar selector unaffected by foo.bar modifier
              return false;
            } else if (isNumericKey(mod[j])) {
              j++;
            } else if (sel[i] === mod[j]) {
              i++;
              j++;
            } else {
              return false;
            }
          }

          // One is a prefix of another, taking numeric fields into account
          return true;
        });
      });
    };

    // @param modifier - Object: MongoDB-styled modifier with `$set`s and `$unsets`
    //                           only. (assumed to come from oplog)
    // @returns - Boolean: if after applying the modifier, selector can start
    //                     accepting the modified value.
    // NOTE: assumes that document affected by modifier didn't match this Matcher
    // before, so if modifier can't convince selector in a positive change it would
    // stay 'false'.
    // Currently doesn't support $-operators and numeric indices precisely.
    Minimongo.Matcher.prototype.canBecomeTrueByModifier = function (modifier) {
      if (!this.affectedByModifier(modifier)) {
        return false;
      }
      if (!this.isSimple()) {
        return true;
      }
      modifier = Object.assign({
        $set: {},
        $unset: {}
      }, modifier);
      const modifierPaths = [].concat(Object.keys(modifier.$set), Object.keys(modifier.$unset));
      if (this._getPaths().some(pathHasNumericKeys) || modifierPaths.some(pathHasNumericKeys)) {
        return true;
      }

      // check if there is a $set or $unset that indicates something is an
      // object rather than a scalar in the actual object where we saw $-operator
      // NOTE: it is correct since we allow only scalars in $-operators
      // Example: for selector {'a.b': {$gt: 5}} the modifier {'a.b.c':7} would
      // definitely set the result to false as 'a.b' appears to be an object.
      const expectedScalarIsObject = Object.keys(this._selector).some(path => {
        if (!isOperatorObject(this._selector[path])) {
          return false;
        }
        return modifierPaths.some(modifierPath => modifierPath.startsWith("".concat(path, ".")));
      });
      if (expectedScalarIsObject) {
        return false;
      }

      // See if we can apply the modifier on the ideally matching object. If it
      // still matches the selector, then the modifier could have turned the real
      // object in the database into something matching.
      const matchingDocument = EJSON.clone(this.matchingDocument());

      // The selector is too complex, anything can happen.
      if (matchingDocument === null) {
        return true;
      }
      try {
        LocalCollection._modify(matchingDocument, modifier);
      } catch (error) {
        // Couldn't set a property on a field which is a scalar or null in the
        // selector.
        // Example:
        // real document: { 'a.b': 3 }
        // selector: { 'a': 12 }
        // converted selector (ideal document): { 'a': 12 }
        // modifier: { $set: { 'a.b': 4 } }
        // We don't know what real document was like but from the error raised by
        // $set on a scalar field we can reason that the structure of real document
        // is completely different.
        if (error.name === 'MinimongoError' && error.setPropertyError) {
          return false;
        }
        throw error;
      }
      return this.documentMatches(matchingDocument).result;
    };

    // Knows how to combine a mongo selector and a fields projection to a new fields
    // projection taking into account active fields from the passed selector.
    // @returns Object - projection object (same as fields option of mongo cursor)
    Minimongo.Matcher.prototype.combineIntoProjection = function (projection) {
      const selectorPaths = Minimongo._pathsElidingNumericKeys(this._getPaths());

      // Special case for $where operator in the selector - projection should depend
      // on all fields of the document. getSelectorPaths returns a list of paths
      // selector depends on. If one of the paths is '' (empty string) representing
      // the root or the whole document, complete projection should be returned.
      if (selectorPaths.includes('')) {
        return {};
      }
      return combineImportantPathsIntoProjection(selectorPaths, projection);
    };

    // Returns an object that would match the selector if possible or null if the
    // selector is too complex for us to analyze
    // { 'a.b': { ans: 42 }, 'foo.bar': null, 'foo.baz': "something" }
    // => { a: { b: { ans: 42 } }, foo: { bar: null, baz: "something" } }
    Minimongo.Matcher.prototype.matchingDocument = function () {
      // check if it was computed before
      if (this._matchingDocument !== undefined) {
        return this._matchingDocument;
      }

      // If the analysis of this selector is too hard for our implementation
      // fallback to "YES"
      let fallback = false;
      this._matchingDocument = pathsToTree(this._getPaths(), path => {
        const valueSelector = this._selector[path];
        if (isOperatorObject(valueSelector)) {
          // if there is a strict equality, there is a good
          // chance we can use one of those as "matching"
          // dummy value
          if (valueSelector.$eq) {
            return valueSelector.$eq;
          }
          if (valueSelector.$in) {
            const matcher = new Minimongo.Matcher({
              placeholder: valueSelector
            });

            // Return anything from $in that matches the whole selector for this
            // path. If nothing matches, returns `undefined` as nothing can make
            // this selector into `true`.
            return valueSelector.$in.find(placeholder => matcher.documentMatches({
              placeholder
            }).result);
          }
          if (onlyContainsKeys(valueSelector, ['$gt', '$gte', '$lt', '$lte'])) {
            let lowerBound = -Infinity;
            let upperBound = Infinity;
            ['$lte', '$lt'].forEach(op => {
              if (hasOwn.call(valueSelector, op) && valueSelector[op] < upperBound) {
                upperBound = valueSelector[op];
              }
            });
            ['$gte', '$gt'].forEach(op => {
              if (hasOwn.call(valueSelector, op) && valueSelector[op] > lowerBound) {
                lowerBound = valueSelector[op];
              }
            });
            const middle = (lowerBound + upperBound) / 2;
            const matcher = new Minimongo.Matcher({
              placeholder: valueSelector
            });
            if (!matcher.documentMatches({
              placeholder: middle
            }).result && (middle === lowerBound || middle === upperBound)) {
              fallback = true;
            }
            return middle;
          }
          if (onlyContainsKeys(valueSelector, ['$nin', '$ne'])) {
            // Since this._isSimple makes sure $nin and $ne are not combined with
            // objects or arrays, we can confidently return an empty object as it
            // never matches any scalar.
            return {};
          }
          fallback = true;
        }
        return this._selector[path];
      }, x => x);
      if (fallback) {
        this._matchingDocument = null;
      }
      return this._matchingDocument;
    };

    // Minimongo.Sorter gets a similar method, which delegates to a Matcher it made
    // for this exact purpose.
    Minimongo.Sorter.prototype.affectedByModifier = function (modifier) {
      return this._selectorForAffectedByModifier.affectedByModifier(modifier);
    };
    Minimongo.Sorter.prototype.combineIntoProjection = function (projection) {
      return combineImportantPathsIntoProjection(Minimongo._pathsElidingNumericKeys(this._getPaths()), projection);
    };
    function combineImportantPathsIntoProjection(paths, projection) {
      const details = projectionDetails(projection);

      // merge the paths to include
      const tree = pathsToTree(paths, path => true, (node, path, fullPath) => true, details.tree);
      const mergedProjection = treeToPaths(tree);
      if (details.including) {
        // both selector and projection are pointing on fields to include
        // so we can just return the merged tree
        return mergedProjection;
      }

      // selector is pointing at fields to include
      // projection is pointing at fields to exclude
      // make sure we don't exclude important paths
      const mergedExclProjection = {};
      Object.keys(mergedProjection).forEach(path => {
        if (!mergedProjection[path]) {
          mergedExclProjection[path] = false;
        }
      });
      return mergedExclProjection;
    }
    function getPaths(selector) {
      return Object.keys(new Minimongo.Matcher(selector)._paths);

      // XXX remove it?
      // return Object.keys(selector).map(k => {
      //   // we don't know how to handle $where because it can be anything
      //   if (k === '$where') {
      //     return ''; // matches everything
      //   }

      //   // we branch from $or/$and/$nor operator
      //   if (['$or', '$and', '$nor'].includes(k)) {
      //     return selector[k].map(getPaths);
      //   }

      //   // the value is a literal or some comparison operator
      //   return k;
      // })
      //   .reduce((a, b) => a.concat(b), [])
      //   .filter((a, b, c) => c.indexOf(a) === b);
    }

    // A helper to ensure object has only certain keys
    function onlyContainsKeys(obj, keys) {
      return Object.keys(obj).every(k => keys.includes(k));
    }
    function pathHasNumericKeys(path) {
      return path.split('.').some(isNumericKey);
    }

    // Returns a set of key paths similar to
    // { 'foo.bar': 1, 'a.b.c': 1 }
    function treeToPaths(tree) {
      let prefix = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
      const result = {};
      Object.keys(tree).forEach(key => {
        const value = tree[key];
        if (value === Object(value)) {
          Object.assign(result, treeToPaths(value, "".concat(prefix + key, ".")));
        } else {
          result[prefix + key] = value;
        }
      });
      return result;
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
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"common.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// packages/minimongo/common.js                                                                                      //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      hasOwn: () => hasOwn,
      ELEMENT_OPERATORS: () => ELEMENT_OPERATORS,
      compileDocumentSelector: () => compileDocumentSelector,
      equalityElementMatcher: () => equalityElementMatcher,
      expandArraysInBranches: () => expandArraysInBranches,
      isIndexable: () => isIndexable,
      isNumericKey: () => isNumericKey,
      isOperatorObject: () => isOperatorObject,
      makeLookupFunction: () => makeLookupFunction,
      nothingMatcher: () => nothingMatcher,
      pathsToTree: () => pathsToTree,
      populateDocumentWithQueryFields: () => populateDocumentWithQueryFields,
      projectionDetails: () => projectionDetails,
      regexpElementMatcher: () => regexpElementMatcher
    });
    let LocalCollection;
    module.link("./local_collection.js", {
      default(v) {
        LocalCollection = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    const hasOwn = Object.prototype.hasOwnProperty;
    const ELEMENT_OPERATORS = {
      $lt: makeInequality(cmpValue => cmpValue < 0),
      $gt: makeInequality(cmpValue => cmpValue > 0),
      $lte: makeInequality(cmpValue => cmpValue <= 0),
      $gte: makeInequality(cmpValue => cmpValue >= 0),
      $mod: {
        compileElementSelector(operand) {
          if (!(Array.isArray(operand) && operand.length === 2 && typeof operand[0] === 'number' && typeof operand[1] === 'number')) {
            throw Error('argument to $mod must be an array of two numbers');
          }

          // XXX could require to be ints or round or something
          const divisor = operand[0];
          const remainder = operand[1];
          return value => typeof value === 'number' && value % divisor === remainder;
        }
      },
      $in: {
        compileElementSelector(operand) {
          if (!Array.isArray(operand)) {
            throw Error('$in needs an array');
          }
          const elementMatchers = operand.map(option => {
            if (option instanceof RegExp) {
              return regexpElementMatcher(option);
            }
            if (isOperatorObject(option)) {
              throw Error('cannot nest $ under $in');
            }
            return equalityElementMatcher(option);
          });
          return value => {
            // Allow {a: {$in: [null]}} to match when 'a' does not exist.
            if (value === undefined) {
              value = null;
            }
            return elementMatchers.some(matcher => matcher(value));
          };
        }
      },
      $size: {
        // {a: [[5, 5]]} must match {a: {$size: 1}} but not {a: {$size: 2}}, so we
        // don't want to consider the element [5,5] in the leaf array [[5,5]] as a
        // possible value.
        dontExpandLeafArrays: true,
        compileElementSelector(operand) {
          if (typeof operand === 'string') {
            // Don't ask me why, but by experimentation, this seems to be what Mongo
            // does.
            operand = 0;
          } else if (typeof operand !== 'number') {
            throw Error('$size needs a number');
          }
          return value => Array.isArray(value) && value.length === operand;
        }
      },
      $type: {
        // {a: [5]} must not match {a: {$type: 4}} (4 means array), but it should
        // match {a: {$type: 1}} (1 means number), and {a: [[5]]} must match {$a:
        // {$type: 4}}. Thus, when we see a leaf array, we *should* expand it but
        // should *not* include it itself.
        dontIncludeLeafArrays: true,
        compileElementSelector(operand) {
          if (typeof operand === 'string') {
            const operandAliasMap = {
              'double': 1,
              'string': 2,
              'object': 3,
              'array': 4,
              'binData': 5,
              'undefined': 6,
              'objectId': 7,
              'bool': 8,
              'date': 9,
              'null': 10,
              'regex': 11,
              'dbPointer': 12,
              'javascript': 13,
              'symbol': 14,
              'javascriptWithScope': 15,
              'int': 16,
              'timestamp': 17,
              'long': 18,
              'decimal': 19,
              'minKey': -1,
              'maxKey': 127
            };
            if (!hasOwn.call(operandAliasMap, operand)) {
              throw Error("unknown string alias for $type: ".concat(operand));
            }
            operand = operandAliasMap[operand];
          } else if (typeof operand === 'number') {
            if (operand === 0 || operand < -1 || operand > 19 && operand !== 127) {
              throw Error("Invalid numerical $type code: ".concat(operand));
            }
          } else {
            throw Error('argument to $type is not a number or a string');
          }
          return value => value !== undefined && LocalCollection._f._type(value) === operand;
        }
      },
      $bitsAllSet: {
        compileElementSelector(operand) {
          const mask = getOperandBitmask(operand, '$bitsAllSet');
          return value => {
            const bitmask = getValueBitmask(value, mask.length);
            return bitmask && mask.every((byte, i) => (bitmask[i] & byte) === byte);
          };
        }
      },
      $bitsAnySet: {
        compileElementSelector(operand) {
          const mask = getOperandBitmask(operand, '$bitsAnySet');
          return value => {
            const bitmask = getValueBitmask(value, mask.length);
            return bitmask && mask.some((byte, i) => (~bitmask[i] & byte) !== byte);
          };
        }
      },
      $bitsAllClear: {
        compileElementSelector(operand) {
          const mask = getOperandBitmask(operand, '$bitsAllClear');
          return value => {
            const bitmask = getValueBitmask(value, mask.length);
            return bitmask && mask.every((byte, i) => !(bitmask[i] & byte));
          };
        }
      },
      $bitsAnyClear: {
        compileElementSelector(operand) {
          const mask = getOperandBitmask(operand, '$bitsAnyClear');
          return value => {
            const bitmask = getValueBitmask(value, mask.length);
            return bitmask && mask.some((byte, i) => (bitmask[i] & byte) !== byte);
          };
        }
      },
      $regex: {
        compileElementSelector(operand, valueSelector) {
          if (!(typeof operand === 'string' || operand instanceof RegExp)) {
            throw Error('$regex has to be a string or RegExp');
          }
          let regexp;
          if (valueSelector.$options !== undefined) {
            // Options passed in $options (even the empty string) always overrides
            // options in the RegExp object itself.

            // Be clear that we only support the JS-supported options, not extended
            // ones (eg, Mongo supports x and s). Ideally we would implement x and s
            // by transforming the regexp, but not today...
            if (/[^gim]/.test(valueSelector.$options)) {
              throw new Error('Only the i, m, and g regexp options are supported');
            }
            const source = operand instanceof RegExp ? operand.source : operand;
            regexp = new RegExp(source, valueSelector.$options);
          } else if (operand instanceof RegExp) {
            regexp = operand;
          } else {
            regexp = new RegExp(operand);
          }
          return regexpElementMatcher(regexp);
        }
      },
      $elemMatch: {
        dontExpandLeafArrays: true,
        compileElementSelector(operand, valueSelector, matcher) {
          if (!LocalCollection._isPlainObject(operand)) {
            throw Error('$elemMatch need an object');
          }
          const isDocMatcher = !isOperatorObject(Object.keys(operand).filter(key => !hasOwn.call(LOGICAL_OPERATORS, key)).reduce((a, b) => Object.assign(a, {
            [b]: operand[b]
          }), {}), true);
          let subMatcher;
          if (isDocMatcher) {
            // This is NOT the same as compileValueSelector(operand), and not just
            // because of the slightly different calling convention.
            // {$elemMatch: {x: 3}} means "an element has a field x:3", not
            // "consists only of a field x:3". Also, regexps and sub-$ are allowed.
            subMatcher = compileDocumentSelector(operand, matcher, {
              inElemMatch: true
            });
          } else {
            subMatcher = compileValueSelector(operand, matcher);
          }
          return value => {
            if (!Array.isArray(value)) {
              return false;
            }
            for (let i = 0; i < value.length; ++i) {
              const arrayElement = value[i];
              let arg;
              if (isDocMatcher) {
                // We can only match {$elemMatch: {b: 3}} against objects.
                // (We can also match against arrays, if there's numeric indices,
                // eg {$elemMatch: {'0.b': 3}} or {$elemMatch: {0: 3}}.)
                if (!isIndexable(arrayElement)) {
                  return false;
                }
                arg = arrayElement;
              } else {
                // dontIterate ensures that {a: {$elemMatch: {$gt: 5}}} matches
                // {a: [8]} but not {a: [[8]]}
                arg = [{
                  value: arrayElement,
                  dontIterate: true
                }];
              }
              // XXX support $near in $elemMatch by propagating $distance?
              if (subMatcher(arg).result) {
                return i; // specially understood to mean "use as arrayIndices"
              }
            }
            return false;
          };
        }
      }
    };
    // Operators that appear at the top level of a document selector.
    const LOGICAL_OPERATORS = {
      $and(subSelector, matcher, inElemMatch) {
        return andDocumentMatchers(compileArrayOfDocumentSelectors(subSelector, matcher, inElemMatch));
      },
      $or(subSelector, matcher, inElemMatch) {
        const matchers = compileArrayOfDocumentSelectors(subSelector, matcher, inElemMatch);

        // Special case: if there is only one matcher, use it directly, *preserving*
        // any arrayIndices it returns.
        if (matchers.length === 1) {
          return matchers[0];
        }
        return doc => {
          const result = matchers.some(fn => fn(doc).result);
          // $or does NOT set arrayIndices when it has multiple
          // sub-expressions. (Tested against MongoDB.)
          return {
            result
          };
        };
      },
      $nor(subSelector, matcher, inElemMatch) {
        const matchers = compileArrayOfDocumentSelectors(subSelector, matcher, inElemMatch);
        return doc => {
          const result = matchers.every(fn => !fn(doc).result);
          // Never set arrayIndices, because we only match if nothing in particular
          // 'matched' (and because this is consistent with MongoDB).
          return {
            result
          };
        };
      },
      $where(selectorValue, matcher) {
        // Record that *any* path may be used.
        matcher._recordPathUsed('');
        matcher._hasWhere = true;
        if (!(selectorValue instanceof Function)) {
          // XXX MongoDB seems to have more complex logic to decide where or or not
          // to add 'return'; not sure exactly what it is.
          selectorValue = Function('obj', "return ".concat(selectorValue));
        }

        // We make the document available as both `this` and `obj`.
        // // XXX not sure what we should do if this throws
        return doc => ({
          result: selectorValue.call(doc, doc)
        });
      },
      // This is just used as a comment in the query (in MongoDB, it also ends up in
      // query logs); it has no effect on the actual selection.
      $comment() {
        return () => ({
          result: true
        });
      }
    };

    // Operators that (unlike LOGICAL_OPERATORS) pertain to individual paths in a
    // document, but (unlike ELEMENT_OPERATORS) do not have a simple definition as
    // "match each branched value independently and combine with
    // convertElementMatcherToBranchedMatcher".
    const VALUE_OPERATORS = {
      $eq(operand) {
        return convertElementMatcherToBranchedMatcher(equalityElementMatcher(operand));
      },
      $not(operand, valueSelector, matcher) {
        return invertBranchedMatcher(compileValueSelector(operand, matcher));
      },
      $ne(operand) {
        return invertBranchedMatcher(convertElementMatcherToBranchedMatcher(equalityElementMatcher(operand)));
      },
      $nin(operand) {
        return invertBranchedMatcher(convertElementMatcherToBranchedMatcher(ELEMENT_OPERATORS.$in.compileElementSelector(operand)));
      },
      $exists(operand) {
        const exists = convertElementMatcherToBranchedMatcher(value => value !== undefined);
        return operand ? exists : invertBranchedMatcher(exists);
      },
      // $options just provides options for $regex; its logic is inside $regex
      $options(operand, valueSelector) {
        if (!hasOwn.call(valueSelector, '$regex')) {
          throw Error('$options needs a $regex');
        }
        return everythingMatcher;
      },
      // $maxDistance is basically an argument to $near
      $maxDistance(operand, valueSelector) {
        if (!valueSelector.$near) {
          throw Error('$maxDistance needs a $near');
        }
        return everythingMatcher;
      },
      $all(operand, valueSelector, matcher) {
        if (!Array.isArray(operand)) {
          throw Error('$all requires array');
        }

        // Not sure why, but this seems to be what MongoDB does.
        if (operand.length === 0) {
          return nothingMatcher;
        }
        const branchedMatchers = operand.map(criterion => {
          // XXX handle $all/$elemMatch combination
          if (isOperatorObject(criterion)) {
            throw Error('no $ expressions in $all');
          }

          // This is always a regexp or equality selector.
          return compileValueSelector(criterion, matcher);
        });

        // andBranchedMatchers does NOT require all selectors to return true on the
        // SAME branch.
        return andBranchedMatchers(branchedMatchers);
      },
      $near(operand, valueSelector, matcher, isRoot) {
        if (!isRoot) {
          throw Error('$near can\'t be inside another $ operator');
        }
        matcher._hasGeoQuery = true;

        // There are two kinds of geodata in MongoDB: legacy coordinate pairs and
        // GeoJSON. They use different distance metrics, too. GeoJSON queries are
        // marked with a $geometry property, though legacy coordinates can be
        // matched using $geometry.
        let maxDistance, point, distance;
        if (LocalCollection._isPlainObject(operand) && hasOwn.call(operand, '$geometry')) {
          // GeoJSON "2dsphere" mode.
          maxDistance = operand.$maxDistance;
          point = operand.$geometry;
          distance = value => {
            // XXX: for now, we don't calculate the actual distance between, say,
            // polygon and circle. If people care about this use-case it will get
            // a priority.
            if (!value) {
              return null;
            }
            if (!value.type) {
              return GeoJSON.pointDistance(point, {
                type: 'Point',
                coordinates: pointToArray(value)
              });
            }
            if (value.type === 'Point') {
              return GeoJSON.pointDistance(point, value);
            }
            return GeoJSON.geometryWithinRadius(value, point, maxDistance) ? 0 : maxDistance + 1;
          };
        } else {
          maxDistance = valueSelector.$maxDistance;
          if (!isIndexable(operand)) {
            throw Error('$near argument must be coordinate pair or GeoJSON');
          }
          point = pointToArray(operand);
          distance = value => {
            if (!isIndexable(value)) {
              return null;
            }
            return distanceCoordinatePairs(point, value);
          };
        }
        return branchedValues => {
          // There might be multiple points in the document that match the given
          // field. Only one of them needs to be within $maxDistance, but we need to
          // evaluate all of them and use the nearest one for the implicit sort
          // specifier. (That's why we can't just use ELEMENT_OPERATORS here.)
          //
          // Note: This differs from MongoDB's implementation, where a document will
          // actually show up *multiple times* in the result set, with one entry for
          // each within-$maxDistance branching point.
          const result = {
            result: false
          };
          expandArraysInBranches(branchedValues).every(branch => {
            // if operation is an update, don't skip branches, just return the first
            // one (#3599)
            let curDistance;
            if (!matcher._isUpdate) {
              if (!(typeof branch.value === 'object')) {
                return true;
              }
              curDistance = distance(branch.value);

              // Skip branches that aren't real points or are too far away.
              if (curDistance === null || curDistance > maxDistance) {
                return true;
              }

              // Skip anything that's a tie.
              if (result.distance !== undefined && result.distance <= curDistance) {
                return true;
              }
            }
            result.result = true;
            result.distance = curDistance;
            if (branch.arrayIndices) {
              result.arrayIndices = branch.arrayIndices;
            } else {
              delete result.arrayIndices;
            }
            return !matcher._isUpdate;
          });
          return result;
        };
      }
    };

    // NB: We are cheating and using this function to implement 'AND' for both
    // 'document matchers' and 'branched matchers'. They both return result objects
    // but the argument is different: for the former it's a whole doc, whereas for
    // the latter it's an array of 'branched values'.
    function andSomeMatchers(subMatchers) {
      if (subMatchers.length === 0) {
        return everythingMatcher;
      }
      if (subMatchers.length === 1) {
        return subMatchers[0];
      }
      return docOrBranches => {
        const match = {};
        match.result = subMatchers.every(fn => {
          const subResult = fn(docOrBranches);

          // Copy a 'distance' number out of the first sub-matcher that has
          // one. Yes, this means that if there are multiple $near fields in a
          // query, something arbitrary happens; this appears to be consistent with
          // Mongo.
          if (subResult.result && subResult.distance !== undefined && match.distance === undefined) {
            match.distance = subResult.distance;
          }

          // Similarly, propagate arrayIndices from sub-matchers... but to match
          // MongoDB behavior, this time the *last* sub-matcher with arrayIndices
          // wins.
          if (subResult.result && subResult.arrayIndices) {
            match.arrayIndices = subResult.arrayIndices;
          }
          return subResult.result;
        });

        // If we didn't actually match, forget any extra metadata we came up with.
        if (!match.result) {
          delete match.distance;
          delete match.arrayIndices;
        }
        return match;
      };
    }
    const andDocumentMatchers = andSomeMatchers;
    const andBranchedMatchers = andSomeMatchers;
    function compileArrayOfDocumentSelectors(selectors, matcher, inElemMatch) {
      if (!Array.isArray(selectors) || selectors.length === 0) {
        throw Error('$and/$or/$nor must be nonempty array');
      }
      return selectors.map(subSelector => {
        if (!LocalCollection._isPlainObject(subSelector)) {
          throw Error('$or/$and/$nor entries need to be full objects');
        }
        return compileDocumentSelector(subSelector, matcher, {
          inElemMatch
        });
      });
    }

    // Takes in a selector that could match a full document (eg, the original
    // selector). Returns a function mapping document->result object.
    //
    // matcher is the Matcher object we are compiling.
    //
    // If this is the root document selector (ie, not wrapped in $and or the like),
    // then isRoot is true. (This is used by $near.)
    function compileDocumentSelector(docSelector, matcher) {
      let options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      const docMatchers = Object.keys(docSelector).map(key => {
        const subSelector = docSelector[key];
        if (key.substr(0, 1) === '$') {
          // Outer operators are either logical operators (they recurse back into
          // this function), or $where.
          if (!hasOwn.call(LOGICAL_OPERATORS, key)) {
            throw new Error("Unrecognized logical operator: ".concat(key));
          }
          matcher._isSimple = false;
          return LOGICAL_OPERATORS[key](subSelector, matcher, options.inElemMatch);
        }

        // Record this path, but only if we aren't in an elemMatcher, since in an
        // elemMatch this is a path inside an object in an array, not in the doc
        // root.
        if (!options.inElemMatch) {
          matcher._recordPathUsed(key);
        }

        // Don't add a matcher if subSelector is a function -- this is to match
        // the behavior of Meteor on the server (inherited from the node mongodb
        // driver), which is to ignore any part of a selector which is a function.
        if (typeof subSelector === 'function') {
          return undefined;
        }
        const lookUpByIndex = makeLookupFunction(key);
        const valueMatcher = compileValueSelector(subSelector, matcher, options.isRoot);
        return doc => valueMatcher(lookUpByIndex(doc));
      }).filter(Boolean);
      return andDocumentMatchers(docMatchers);
    }
    // Takes in a selector that could match a key-indexed value in a document; eg,
    // {$gt: 5, $lt: 9}, or a regular expression, or any non-expression object (to
    // indicate equality).  Returns a branched matcher: a function mapping
    // [branched value]->result object.
    function compileValueSelector(valueSelector, matcher, isRoot) {
      if (valueSelector instanceof RegExp) {
        matcher._isSimple = false;
        return convertElementMatcherToBranchedMatcher(regexpElementMatcher(valueSelector));
      }
      if (isOperatorObject(valueSelector)) {
        return operatorBranchedMatcher(valueSelector, matcher, isRoot);
      }
      return convertElementMatcherToBranchedMatcher(equalityElementMatcher(valueSelector));
    }

    // Given an element matcher (which evaluates a single value), returns a branched
    // value (which evaluates the element matcher on all the branches and returns a
    // more structured return value possibly including arrayIndices).
    function convertElementMatcherToBranchedMatcher(elementMatcher) {
      let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      return branches => {
        const expanded = options.dontExpandLeafArrays ? branches : expandArraysInBranches(branches, options.dontIncludeLeafArrays);
        const match = {};
        match.result = expanded.some(element => {
          let matched = elementMatcher(element.value);

          // Special case for $elemMatch: it means "true, and use this as an array
          // index if I didn't already have one".
          if (typeof matched === 'number') {
            // XXX This code dates from when we only stored a single array index
            // (for the outermost array). Should we be also including deeper array
            // indices from the $elemMatch match?
            if (!element.arrayIndices) {
              element.arrayIndices = [matched];
            }
            matched = true;
          }

          // If some element matched, and it's tagged with array indices, include
          // those indices in our result object.
          if (matched && element.arrayIndices) {
            match.arrayIndices = element.arrayIndices;
          }
          return matched;
        });
        return match;
      };
    }

    // Helpers for $near.
    function distanceCoordinatePairs(a, b) {
      const pointA = pointToArray(a);
      const pointB = pointToArray(b);
      return Math.hypot(pointA[0] - pointB[0], pointA[1] - pointB[1]);
    }

    // Takes something that is not an operator object and returns an element matcher
    // for equality with that thing.
    function equalityElementMatcher(elementSelector) {
      if (isOperatorObject(elementSelector)) {
        throw Error('Can\'t create equalityValueSelector for operator object');
      }

      // Special-case: null and undefined are equal (if you got undefined in there
      // somewhere, or if you got it due to some branch being non-existent in the
      // weird special case), even though they aren't with EJSON.equals.
      // undefined or null
      if (elementSelector == null) {
        return value => value == null;
      }
      return value => LocalCollection._f._equal(elementSelector, value);
    }
    function everythingMatcher(docOrBranchedValues) {
      return {
        result: true
      };
    }
    function expandArraysInBranches(branches, skipTheArrays) {
      const branchesOut = [];
      branches.forEach(branch => {
        const thisIsArray = Array.isArray(branch.value);

        // We include the branch itself, *UNLESS* we it's an array that we're going
        // to iterate and we're told to skip arrays.  (That's right, we include some
        // arrays even skipTheArrays is true: these are arrays that were found via
        // explicit numerical indices.)
        if (!(skipTheArrays && thisIsArray && !branch.dontIterate)) {
          branchesOut.push({
            arrayIndices: branch.arrayIndices,
            value: branch.value
          });
        }
        if (thisIsArray && !branch.dontIterate) {
          branch.value.forEach((value, i) => {
            branchesOut.push({
              arrayIndices: (branch.arrayIndices || []).concat(i),
              value
            });
          });
        }
      });
      return branchesOut;
    }
    // Helpers for $bitsAllSet/$bitsAnySet/$bitsAllClear/$bitsAnyClear.
    function getOperandBitmask(operand, selector) {
      // numeric bitmask
      // You can provide a numeric bitmask to be matched against the operand field.
      // It must be representable as a non-negative 32-bit signed integer.
      // Otherwise, $bitsAllSet will return an error.
      if (Number.isInteger(operand) && operand >= 0) {
        return new Uint8Array(new Int32Array([operand]).buffer);
      }

      // bindata bitmask
      // You can also use an arbitrarily large BinData instance as a bitmask.
      if (EJSON.isBinary(operand)) {
        return new Uint8Array(operand.buffer);
      }

      // position list
      // If querying a list of bit positions, each <position> must be a non-negative
      // integer. Bit positions start at 0 from the least significant bit.
      if (Array.isArray(operand) && operand.every(x => Number.isInteger(x) && x >= 0)) {
        const buffer = new ArrayBuffer((Math.max(...operand) >> 3) + 1);
        const view = new Uint8Array(buffer);
        operand.forEach(x => {
          view[x >> 3] |= 1 << (x & 0x7);
        });
        return view;
      }

      // bad operand
      throw Error("operand to ".concat(selector, " must be a numeric bitmask (representable as a ") + 'non-negative 32-bit signed integer), a bindata bitmask or an array with ' + 'bit positions (non-negative integers)');
    }
    function getValueBitmask(value, length) {
      // The field value must be either numerical or a BinData instance. Otherwise,
      // $bits... will not match the current document.

      // numerical
      if (Number.isSafeInteger(value)) {
        // $bits... will not match numerical values that cannot be represented as a
        // signed 64-bit integer. This can be the case if a value is either too
        // large or small to fit in a signed 64-bit integer, or if it has a
        // fractional component.
        const buffer = new ArrayBuffer(Math.max(length, 2 * Uint32Array.BYTES_PER_ELEMENT));
        let view = new Uint32Array(buffer, 0, 2);
        view[0] = value % ((1 << 16) * (1 << 16)) | 0;
        view[1] = value / ((1 << 16) * (1 << 16)) | 0;

        // sign extension
        if (value < 0) {
          view = new Uint8Array(buffer, 2);
          view.forEach((byte, i) => {
            view[i] = 0xff;
          });
        }
        return new Uint8Array(buffer);
      }

      // bindata
      if (EJSON.isBinary(value)) {
        return new Uint8Array(value.buffer);
      }

      // no match
      return false;
    }

    // Actually inserts a key value into the selector document
    // However, this checks there is no ambiguity in setting
    // the value for the given key, throws otherwise
    function insertIntoDocument(document, key, value) {
      Object.keys(document).forEach(existingKey => {
        if (existingKey.length > key.length && existingKey.indexOf("".concat(key, ".")) === 0 || key.length > existingKey.length && key.indexOf("".concat(existingKey, ".")) === 0) {
          throw new Error("cannot infer query fields to set, both paths '".concat(existingKey, "' and ") + "'".concat(key, "' are matched"));
        } else if (existingKey === key) {
          throw new Error("cannot infer query fields to set, path '".concat(key, "' is matched twice"));
        }
      });
      document[key] = value;
    }

    // Returns a branched matcher that matches iff the given matcher does not.
    // Note that this implicitly "deMorganizes" the wrapped function.  ie, it
    // means that ALL branch values need to fail to match innerBranchedMatcher.
    function invertBranchedMatcher(branchedMatcher) {
      return branchValues => {
        // We explicitly choose to strip arrayIndices here: it doesn't make sense to
        // say "update the array element that does not match something", at least
        // in mongo-land.
        return {
          result: !branchedMatcher(branchValues).result
        };
      };
    }
    function isIndexable(obj) {
      return Array.isArray(obj) || LocalCollection._isPlainObject(obj);
    }
    function isNumericKey(s) {
      return /^[0-9]+$/.test(s);
    }
    function isOperatorObject(valueSelector, inconsistentOK) {
      if (!LocalCollection._isPlainObject(valueSelector)) {
        return false;
      }
      let theseAreOperators = undefined;
      Object.keys(valueSelector).forEach(selKey => {
        const thisIsOperator = selKey.substr(0, 1) === '$' || selKey === 'diff';
        if (theseAreOperators === undefined) {
          theseAreOperators = thisIsOperator;
        } else if (theseAreOperators !== thisIsOperator) {
          if (!inconsistentOK) {
            throw new Error("Inconsistent operator: ".concat(JSON.stringify(valueSelector)));
          }
          theseAreOperators = false;
        }
      });
      return !!theseAreOperators; // {} has no operators
    }
    // Helper for $lt/$gt/$lte/$gte.
    function makeInequality(cmpValueComparator) {
      return {
        compileElementSelector(operand) {
          // Arrays never compare false with non-arrays for any inequality.
          // XXX This was behavior we observed in pre-release MongoDB 2.5, but
          //     it seems to have been reverted.
          //     See https://jira.mongodb.org/browse/SERVER-11444
          if (Array.isArray(operand)) {
            return () => false;
          }

          // Special case: consider undefined and null the same (so true with
          // $gte/$lte).
          if (operand === undefined) {
            operand = null;
          }
          const operandType = LocalCollection._f._type(operand);
          return value => {
            if (value === undefined) {
              value = null;
            }

            // Comparisons are never true among things of different type (except
            // null vs undefined).
            if (LocalCollection._f._type(value) !== operandType) {
              return false;
            }
            return cmpValueComparator(LocalCollection._f._cmp(value, operand));
          };
        }
      };
    }

    // makeLookupFunction(key) returns a lookup function.
    //
    // A lookup function takes in a document and returns an array of matching
    // branches.  If no arrays are found while looking up the key, this array will
    // have exactly one branches (possibly 'undefined', if some segment of the key
    // was not found).
    //
    // If arrays are found in the middle, this can have more than one element, since
    // we 'branch'. When we 'branch', if there are more key segments to look up,
    // then we only pursue branches that are plain objects (not arrays or scalars).
    // This means we can actually end up with no branches!
    //
    // We do *NOT* branch on arrays that are found at the end (ie, at the last
    // dotted member of the key). We just return that array; if you want to
    // effectively 'branch' over the array's values, post-process the lookup
    // function with expandArraysInBranches.
    //
    // Each branch is an object with keys:
    //  - value: the value at the branch
    //  - dontIterate: an optional bool; if true, it means that 'value' is an array
    //    that expandArraysInBranches should NOT expand. This specifically happens
    //    when there is a numeric index in the key, and ensures the
    //    perhaps-surprising MongoDB behavior where {'a.0': 5} does NOT
    //    match {a: [[5]]}.
    //  - arrayIndices: if any array indexing was done during lookup (either due to
    //    explicit numeric indices or implicit branching), this will be an array of
    //    the array indices used, from outermost to innermost; it is falsey or
    //    absent if no array index is used. If an explicit numeric index is used,
    //    the index will be followed in arrayIndices by the string 'x'.
    //
    //    Note: arrayIndices is used for two purposes. First, it is used to
    //    implement the '$' modifier feature, which only ever looks at its first
    //    element.
    //
    //    Second, it is used for sort key generation, which needs to be able to tell
    //    the difference between different paths. Moreover, it needs to
    //    differentiate between explicit and implicit branching, which is why
    //    there's the somewhat hacky 'x' entry: this means that explicit and
    //    implicit array lookups will have different full arrayIndices paths. (That
    //    code only requires that different paths have different arrayIndices; it
    //    doesn't actually 'parse' arrayIndices. As an alternative, arrayIndices
    //    could contain objects with flags like 'implicit', but I think that only
    //    makes the code surrounding them more complex.)
    //
    //    (By the way, this field ends up getting passed around a lot without
    //    cloning, so never mutate any arrayIndices field/var in this package!)
    //
    //
    // At the top level, you may only pass in a plain object or array.
    //
    // See the test 'minimongo - lookup' for some examples of what lookup functions
    // return.
    function makeLookupFunction(key) {
      let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      const parts = key.split('.');
      const firstPart = parts.length ? parts[0] : '';
      const lookupRest = parts.length > 1 && makeLookupFunction(parts.slice(1).join('.'), options);
      function buildResult(arrayIndices, dontIterate, value) {
        return arrayIndices && arrayIndices.length ? dontIterate ? [{
          arrayIndices,
          dontIterate,
          value
        }] : [{
          arrayIndices,
          value
        }] : dontIterate ? [{
          dontIterate,
          value
        }] : [{
          value
        }];
      }

      // Doc will always be a plain object or an array.
      // apply an explicit numeric index, an array.
      return (doc, arrayIndices) => {
        if (Array.isArray(doc)) {
          // If we're being asked to do an invalid lookup into an array (non-integer
          // or out-of-bounds), return no results (which is different from returning
          // a single undefined result, in that `null` equality checks won't match).
          if (!(isNumericKey(firstPart) && firstPart < doc.length)) {
            return [];
          }

          // Remember that we used this array index. Include an 'x' to indicate that
          // the previous index came from being considered as an explicit array
          // index (not branching).
          arrayIndices = arrayIndices ? arrayIndices.concat(+firstPart, 'x') : [+firstPart, 'x'];
        }

        // Do our first lookup.
        const firstLevel = doc[firstPart];

        // If there is no deeper to dig, return what we found.
        //
        // If what we found is an array, most value selectors will choose to treat
        // the elements of the array as matchable values in their own right, but
        // that's done outside of the lookup function. (Exceptions to this are $size
        // and stuff relating to $elemMatch.  eg, {a: {$size: 2}} does not match {a:
        // [[1, 2]]}.)
        //
        // That said, if we just did an *explicit* array lookup (on doc) to find
        // firstLevel, and firstLevel is an array too, we do NOT want value
        // selectors to iterate over it.  eg, {'a.0': 5} does not match {a: [[5]]}.
        // So in that case, we mark the return value as 'don't iterate'.
        if (!lookupRest) {
          return buildResult(arrayIndices, Array.isArray(doc) && Array.isArray(firstLevel), firstLevel);
        }

        // We need to dig deeper.  But if we can't, because what we've found is not
        // an array or plain object, we're done. If we just did a numeric index into
        // an array, we return nothing here (this is a change in Mongo 2.5 from
        // Mongo 2.4, where {'a.0.b': null} stopped matching {a: [5]}). Otherwise,
        // return a single `undefined` (which can, for example, match via equality
        // with `null`).
        if (!isIndexable(firstLevel)) {
          if (Array.isArray(doc)) {
            return [];
          }
          return buildResult(arrayIndices, false, undefined);
        }
        const result = [];
        const appendToResult = more => {
          result.push(...more);
        };

        // Dig deeper: look up the rest of the parts on whatever we've found.
        // (lookupRest is smart enough to not try to do invalid lookups into
        // firstLevel if it's an array.)
        appendToResult(lookupRest(firstLevel, arrayIndices));

        // If we found an array, then in *addition* to potentially treating the next
        // part as a literal integer lookup, we should also 'branch': try to look up
        // the rest of the parts on each array element in parallel.
        //
        // In this case, we *only* dig deeper into array elements that are plain
        // objects. (Recall that we only got this far if we have further to dig.)
        // This makes sense: we certainly don't dig deeper into non-indexable
        // objects. And it would be weird to dig into an array: it's simpler to have
        // a rule that explicit integer indexes only apply to an outer array, not to
        // an array you find after a branching search.
        //
        // In the special case of a numeric part in a *sort selector* (not a query
        // selector), we skip the branching: we ONLY allow the numeric part to mean
        // 'look up this index' in that case, not 'also look up this index in all
        // the elements of the array'.
        if (Array.isArray(firstLevel) && !(isNumericKey(parts[1]) && options.forSort)) {
          firstLevel.forEach((branch, arrayIndex) => {
            if (LocalCollection._isPlainObject(branch)) {
              appendToResult(lookupRest(branch, arrayIndices ? arrayIndices.concat(arrayIndex) : [arrayIndex]));
            }
          });
        }
        return result;
      };
    }
    // Object exported only for unit testing.
    // Use it to export private functions to test in Tinytest.
    MinimongoTest = {
      makeLookupFunction
    };
    MinimongoError = function (message) {
      let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      if (typeof message === 'string' && options.field) {
        message += " for field '".concat(options.field, "'");
      }
      const error = new Error(message);
      error.name = 'MinimongoError';
      return error;
    };
    function nothingMatcher(docOrBranchedValues) {
      return {
        result: false
      };
    }
    // Takes an operator object (an object with $ keys) and returns a branched
    // matcher for it.
    function operatorBranchedMatcher(valueSelector, matcher, isRoot) {
      // Each valueSelector works separately on the various branches.  So one
      // operator can match one branch and another can match another branch.  This
      // is OK.
      const operatorMatchers = Object.keys(valueSelector).map(operator => {
        const operand = valueSelector[operator];
        const simpleRange = ['$lt', '$lte', '$gt', '$gte'].includes(operator) && typeof operand === 'number';
        const simpleEquality = ['$ne', '$eq'].includes(operator) && operand !== Object(operand);
        const simpleInclusion = ['$in', '$nin'].includes(operator) && Array.isArray(operand) && !operand.some(x => x === Object(x));
        if (!(simpleRange || simpleInclusion || simpleEquality)) {
          matcher._isSimple = false;
        }
        if (hasOwn.call(VALUE_OPERATORS, operator)) {
          return VALUE_OPERATORS[operator](operand, valueSelector, matcher, isRoot);
        }
        if (hasOwn.call(ELEMENT_OPERATORS, operator)) {
          const options = ELEMENT_OPERATORS[operator];
          return convertElementMatcherToBranchedMatcher(options.compileElementSelector(operand, valueSelector, matcher), options);
        }
        throw new Error("Unrecognized operator: ".concat(operator));
      });
      return andBranchedMatchers(operatorMatchers);
    }

    // paths - Array: list of mongo style paths
    // newLeafFn - Function: of form function(path) should return a scalar value to
    //                       put into list created for that path
    // conflictFn - Function: of form function(node, path, fullPath) is called
    //                        when building a tree path for 'fullPath' node on
    //                        'path' was already a leaf with a value. Must return a
    //                        conflict resolution.
    // initial tree - Optional Object: starting tree.
    // @returns - Object: tree represented as a set of nested objects
    function pathsToTree(paths, newLeafFn, conflictFn) {
      let root = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
      paths.forEach(path => {
        const pathArray = path.split('.');
        let tree = root;

        // use .every just for iteration with break
        const success = pathArray.slice(0, -1).every((key, i) => {
          if (!hasOwn.call(tree, key)) {
            tree[key] = {};
          } else if (tree[key] !== Object(tree[key])) {
            tree[key] = conflictFn(tree[key], pathArray.slice(0, i + 1).join('.'), path);

            // break out of loop if we are failing for this path
            if (tree[key] !== Object(tree[key])) {
              return false;
            }
          }
          tree = tree[key];
          return true;
        });
        if (success) {
          const lastKey = pathArray[pathArray.length - 1];
          if (hasOwn.call(tree, lastKey)) {
            tree[lastKey] = conflictFn(tree[lastKey], path, path);
          } else {
            tree[lastKey] = newLeafFn(path);
          }
        }
      });
      return root;
    }
    // Makes sure we get 2 elements array and assume the first one to be x and
    // the second one to y no matter what user passes.
    // In case user passes { lon: x, lat: y } returns [x, y]
    function pointToArray(point) {
      return Array.isArray(point) ? point.slice() : [point.x, point.y];
    }

    // Creating a document from an upsert is quite tricky.
    // E.g. this selector: {"$or": [{"b.foo": {"$all": ["bar"]}}]}, should result
    // in: {"b.foo": "bar"}
    // But this selector: {"$or": [{"b": {"foo": {"$all": ["bar"]}}}]} should throw
    // an error

    // Some rules (found mainly with trial & error, so there might be more):
    // - handle all childs of $and (or implicit $and)
    // - handle $or nodes with exactly 1 child
    // - ignore $or nodes with more than 1 child
    // - ignore $nor and $not nodes
    // - throw when a value can not be set unambiguously
    // - every value for $all should be dealt with as separate $eq-s
    // - threat all children of $all as $eq setters (=> set if $all.length === 1,
    //   otherwise throw error)
    // - you can not mix '$'-prefixed keys and non-'$'-prefixed keys
    // - you can only have dotted keys on a root-level
    // - you can not have '$'-prefixed keys more than one-level deep in an object

    // Handles one key/value pair to put in the selector document
    function populateDocumentWithKeyValue(document, key, value) {
      if (value && Object.getPrototypeOf(value) === Object.prototype) {
        populateDocumentWithObject(document, key, value);
      } else if (!(value instanceof RegExp)) {
        insertIntoDocument(document, key, value);
      }
    }

    // Handles a key, value pair to put in the selector document
    // if the value is an object
    function populateDocumentWithObject(document, key, value) {
      const keys = Object.keys(value);
      const unprefixedKeys = keys.filter(op => op[0] !== '$');
      if (unprefixedKeys.length > 0 || !keys.length) {
        // Literal (possibly empty) object ( or empty object )
        // Don't allow mixing '$'-prefixed with non-'$'-prefixed fields
        if (keys.length !== unprefixedKeys.length) {
          throw new Error("unknown operator: ".concat(unprefixedKeys[0]));
        }
        validateObject(value, key);
        insertIntoDocument(document, key, value);
      } else {
        Object.keys(value).forEach(op => {
          const object = value[op];
          if (op === '$eq') {
            populateDocumentWithKeyValue(document, key, object);
          } else if (op === '$all') {
            // every value for $all should be dealt with as separate $eq-s
            object.forEach(element => populateDocumentWithKeyValue(document, key, element));
          }
        });
      }
    }

    // Fills a document with certain fields from an upsert selector
    function populateDocumentWithQueryFields(query) {
      let document = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      if (Object.getPrototypeOf(query) === Object.prototype) {
        // handle implicit $and
        Object.keys(query).forEach(key => {
          const value = query[key];
          if (key === '$and') {
            // handle explicit $and
            value.forEach(element => populateDocumentWithQueryFields(element, document));
          } else if (key === '$or') {
            // handle $or nodes with exactly 1 child
            if (value.length === 1) {
              populateDocumentWithQueryFields(value[0], document);
            }
          } else if (key[0] !== '$') {
            // Ignore other '$'-prefixed logical selectors
            populateDocumentWithKeyValue(document, key, value);
          }
        });
      } else {
        // Handle meteor-specific shortcut for selecting _id
        if (LocalCollection._selectorIsId(query)) {
          insertIntoDocument(document, '_id', query);
        }
      }
      return document;
    }
    function projectionDetails(fields) {
      // Find the non-_id keys (_id is handled specially because it is included
      // unless explicitly excluded). Sort the keys, so that our code to detect
      // overlaps like 'foo' and 'foo.bar' can assume that 'foo' comes first.
      let fieldsKeys = Object.keys(fields).sort();

      // If _id is the only field in the projection, do not remove it, since it is
      // required to determine if this is an exclusion or exclusion. Also keep an
      // inclusive _id, since inclusive _id follows the normal rules about mixing
      // inclusive and exclusive fields. If _id is not the only field in the
      // projection and is exclusive, remove it so it can be handled later by a
      // special case, since exclusive _id is always allowed.
      if (!(fieldsKeys.length === 1 && fieldsKeys[0] === '_id') && !(fieldsKeys.includes('_id') && fields._id)) {
        fieldsKeys = fieldsKeys.filter(key => key !== '_id');
      }
      let including = null; // Unknown

      fieldsKeys.forEach(keyPath => {
        const rule = !!fields[keyPath];
        if (including === null) {
          including = rule;
        }

        // This error message is copied from MongoDB shell
        if (including !== rule) {
          throw MinimongoError('You cannot currently mix including and excluding fields.');
        }
      });
      const projectionRulesTree = pathsToTree(fieldsKeys, path => including, (node, path, fullPath) => {
        // Check passed projection fields' keys: If you have two rules such as
        // 'foo.bar' and 'foo.bar.baz', then the result becomes ambiguous. If
        // that happens, there is a probability you are doing something wrong,
        // framework should notify you about such mistake earlier on cursor
        // compilation step than later during runtime.  Note, that real mongo
        // doesn't do anything about it and the later rule appears in projection
        // project, more priority it takes.
        //
        // Example, assume following in mongo shell:
        // > db.coll.insert({ a: { b: 23, c: 44 } })
        // > db.coll.find({}, { 'a': 1, 'a.b': 1 })
        // {"_id": ObjectId("520bfe456024608e8ef24af3"), "a": {"b": 23}}
        // > db.coll.find({}, { 'a.b': 1, 'a': 1 })
        // {"_id": ObjectId("520bfe456024608e8ef24af3"), "a": {"b": 23, "c": 44}}
        //
        // Note, how second time the return set of keys is different.
        const currentPath = fullPath;
        const anotherPath = path;
        throw MinimongoError("both ".concat(currentPath, " and ").concat(anotherPath, " found in fields option, ") + 'using both of them may trigger unexpected behavior. Did you mean to ' + 'use only one of them?');
      });
      return {
        including,
        tree: projectionRulesTree
      };
    }
    function regexpElementMatcher(regexp) {
      return value => {
        if (value instanceof RegExp) {
          return value.toString() === regexp.toString();
        }

        // Regexps only work against strings.
        if (typeof value !== 'string') {
          return false;
        }

        // Reset regexp's state to avoid inconsistent matching for objects with the
        // same value on consecutive calls of regexp.test. This happens only if the
        // regexp has the 'g' flag. Also note that ES6 introduces a new flag 'y' for
        // which we should *not* change the lastIndex but MongoDB doesn't support
        // either of these flags.
        regexp.lastIndex = 0;
        return regexp.test(value);
      };
    }
    // Validates the key in a path.
    // Objects that are nested more then 1 level cannot have dotted fields
    // or fields starting with '$'
    function validateKeyInPath(key, path) {
      if (key.includes('.')) {
        throw new Error("The dotted field '".concat(key, "' in '").concat(path, ".").concat(key, " is not valid for storage."));
      }
      if (key[0] === '$') {
        throw new Error("The dollar ($) prefixed field  '".concat(path, ".").concat(key, " is not valid for storage."));
      }
    }

    // Recursively validates an object that is nested more than one level deep
    function validateObject(object, path) {
      if (object && Object.getPrototypeOf(object) === Object.prototype) {
        Object.keys(object).forEach(key => {
          validateKeyInPath(key, path);
          validateObject(object[key], path + '.' + key);
        });
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
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"constants.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// packages/minimongo/constants.js                                                                                   //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
module.export({
  getAsyncMethodName: () => getAsyncMethodName,
  ASYNC_COLLECTION_METHODS: () => ASYNC_COLLECTION_METHODS,
  ASYNC_CURSOR_METHODS: () => ASYNC_CURSOR_METHODS,
  CLIENT_ONLY_METHODS: () => CLIENT_ONLY_METHODS
});
function getAsyncMethodName(method) {
  return "".concat(method.replace('_', ''), "Async");
}
const ASYNC_COLLECTION_METHODS = ['_createCappedCollection', 'dropCollection', 'dropIndex',
/**
 * @summary Creates the specified index on the collection.
 * @locus server
 * @method createIndexAsync
 * @memberof Mongo.Collection
 * @instance
 * @param {Object} index A document that contains the field and value pairs where the field is the index key and the value describes the type of index for that field. For an ascending index on a field, specify a value of `1`; for descending index, specify a value of `-1`. Use `text` for text indexes.
 * @param {Object} [options] All options are listed in [MongoDB documentation](https://docs.mongodb.com/manual/reference/method/db.collection.createIndex/#options)
 * @param {String} options.name Name of the index
 * @param {Boolean} options.unique Define that the index values must be unique, more at [MongoDB documentation](https://docs.mongodb.com/manual/core/index-unique/)
 * @param {Boolean} options.sparse Define that the index is sparse, more at [MongoDB documentation](https://docs.mongodb.com/manual/core/index-sparse/)
 * @returns {Promise}
 */
'createIndex',
/**
 * @summary Finds the first document that matches the selector, as ordered by sort and skip options. Returns `undefined` if no matching document is found.
 * @locus Anywhere
 * @method findOneAsync
 * @memberof Mongo.Collection
 * @instance
 * @param {MongoSelector} [selector] A query describing the documents to find
 * @param {Object} [options]
 * @param {MongoSortSpecifier} options.sort Sort order (default: natural order)
 * @param {Number} options.skip Number of results to skip at the beginning
 * @param {MongoFieldSpecifier} options.fields Dictionary of fields to return or exclude.
 * @param {Boolean} options.reactive (Client only) Default true; pass false to disable reactivity
 * @param {Function} options.transform Overrides `transform` on the [`Collection`](#collections) for this cursor.  Pass `null` to disable transformation.
 * @param {String} options.readPreference (Server only) Specifies a custom MongoDB [`readPreference`](https://docs.mongodb.com/manual/core/read-preference) for fetching the document. Possible values are `primary`, `primaryPreferred`, `secondary`, `secondaryPreferred` and `nearest`.
 * @returns {Promise}
 */
'findOne',
/**
 * @summary Insert a document in the collection.  Returns its unique _id.
 * @locus Anywhere
 * @method  insertAsync
 * @memberof Mongo.Collection
 * @instance
 * @param {Object} doc The document to insert. May not yet have an _id attribute, in which case Meteor will generate one for you.
 * @return {Promise}
 */
'insert',
/**
 * @summary Remove documents from the collection
 * @locus Anywhere
 * @method removeAsync
 * @memberof Mongo.Collection
 * @instance
 * @param {MongoSelector} selector Specifies which documents to remove
 * @return {Promise}
 */
'remove',
/**
 * @summary Modify one or more documents in the collection. Returns the number of matched documents.
 * @locus Anywhere
 * @method updateAsync
 * @memberof Mongo.Collection
 * @instance
 * @param {MongoSelector} selector Specifies which documents to modify
 * @param {MongoModifier} modifier Specifies how to modify the documents
 * @param {Object} [options]
 * @param {Boolean} options.multi True to modify all matching documents; false to only modify one of the matching documents (the default).
 * @param {Boolean} options.upsert True to insert a document if no matching documents are found.
 * @param {Array} options.arrayFilters Optional. Used in combination with MongoDB [filtered positional operator](https://docs.mongodb.com/manual/reference/operator/update/positional-filtered/) to specify which elements to modify in an array field.
 * @return {Promise}
 */
'update',
/**
 * @summary Modify one or more documents in the collection, or insert one if no matching documents were found. Returns an object with keys `numberAffected` (the number of documents modified)  and `insertedId` (the unique _id of the document that was inserted, if any).
 * @locus Anywhere
 * @method upsertAsync
 * @memberof Mongo.Collection
 * @instance
 * @param {MongoSelector} selector Specifies which documents to modify
 * @param {MongoModifier} modifier Specifies how to modify the documents
 * @param {Object} [options]
 * @param {Boolean} options.multi True to modify all matching documents; false to only modify one of the matching documents (the default).
 * @return {Promise}
 */
'upsert'];
const ASYNC_CURSOR_METHODS = [
/**
 * @deprecated in 2.9
 * @summary Returns the number of documents that match a query. This method is
 *          [deprecated since MongoDB 4.0](https://www.mongodb.com/docs/v4.4/reference/command/count/);
 *          see `Collection.countDocuments` and
 *          `Collection.estimatedDocumentCount` for a replacement.
 * @memberOf Mongo.Cursor
 * @method  countAsync
 * @instance
 * @locus Anywhere
 * @returns {Promise}
 */
'count',
/**
 * @summary Return all matching documents as an Array.
 * @memberOf Mongo.Cursor
 * @method  fetchAsync
 * @instance
 * @locus Anywhere
 * @returns {Promise}
 */
'fetch',
/**
 * @summary Call `callback` once for each matching document, sequentially and
 *          synchronously.
 * @locus Anywhere
 * @method  forEachAsync
 * @instance
 * @memberOf Mongo.Cursor
 * @param {IterationCallback} callback Function to call. It will be called
 *                                     with three arguments: the document, a
 *                                     0-based index, and <em>cursor</em>
 *                                     itself.
 * @param {Any} [thisArg] An object which will be the value of `this` inside
 *                        `callback`.
 * @returns {Promise}
 */
'forEach',
/**
 * @summary Map callback over all matching documents.  Returns an Array.
 * @locus Anywhere
 * @method mapAsync
 * @instance
 * @memberOf Mongo.Cursor
 * @param {IterationCallback} callback Function to call. It will be called
 *                                     with three arguments: the document, a
 *                                     0-based index, and <em>cursor</em>
 *                                     itself.
 * @param {Any} [thisArg] An object which will be the value of `this` inside
 *                        `callback`.
 * @returns {Promise}
 */
'map'];
const CLIENT_ONLY_METHODS = ["findOne", "insert", "remove", "update", "upsert"];
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"cursor.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// packages/minimongo/cursor.js                                                                                      //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      default: () => Cursor
    });
    let LocalCollection;
    module.link("./local_collection.js", {
      default(v) {
        LocalCollection = v;
      }
    }, 0);
    let hasOwn;
    module.link("./common.js", {
      hasOwn(v) {
        hasOwn = v;
      }
    }, 1);
    let ASYNC_CURSOR_METHODS, getAsyncMethodName;
    module.link("./constants", {
      ASYNC_CURSOR_METHODS(v) {
        ASYNC_CURSOR_METHODS = v;
      },
      getAsyncMethodName(v) {
        getAsyncMethodName = v;
      }
    }, 2);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    class Cursor {
      // don't call this ctor directly.  use LocalCollection.find().
      constructor(collection, selector) {
        let options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
        this.collection = collection;
        this.sorter = null;
        this.matcher = new Minimongo.Matcher(selector);
        if (LocalCollection._selectorIsIdPerhapsAsObject(selector)) {
          // stash for fast _id and { _id }
          this._selectorId = hasOwn.call(selector, '_id') ? selector._id : selector;
        } else {
          this._selectorId = undefined;
          if (this.matcher.hasGeoQuery() || options.sort) {
            this.sorter = new Minimongo.Sorter(options.sort || []);
          }
        }
        this.skip = options.skip || 0;
        this.limit = options.limit;
        this.fields = options.projection || options.fields;
        this._projectionFn = LocalCollection._compileProjection(this.fields || {});
        this._transform = LocalCollection.wrapTransform(options.transform);

        // by default, queries register w/ Tracker when it is available.
        if (typeof Tracker !== 'undefined') {
          this.reactive = options.reactive === undefined ? true : options.reactive;
        }
      }

      /**
       * @deprecated in 2.9
       * @summary Returns the number of documents that match a query. This method is
       *          [deprecated since MongoDB 4.0](https://www.mongodb.com/docs/v4.4/reference/command/count/);
       *          see `Collection.countDocuments` and
       *          `Collection.estimatedDocumentCount` for a replacement.
       * @memberOf Mongo.Cursor
       * @method  count
       * @instance
       * @locus Anywhere
       * @returns {Number}
       */
      count() {
        if (this.reactive) {
          // allow the observe to be unordered
          this._depend({
            added: true,
            removed: true
          }, true);
        }
        return this._getRawObjects({
          ordered: true
        }).length;
      }

      /**
       * @summary Return all matching documents as an Array.
       * @memberOf Mongo.Cursor
       * @method  fetch
       * @instance
       * @locus Anywhere
       * @returns {Object[]}
       */
      fetch() {
        const result = [];
        this.forEach(doc => {
          result.push(doc);
        });
        return result;
      }
      [Symbol.iterator]() {
        if (this.reactive) {
          this._depend({
            addedBefore: true,
            removed: true,
            changed: true,
            movedBefore: true
          });
        }
        let index = 0;
        const objects = this._getRawObjects({
          ordered: true
        });
        return {
          next: () => {
            if (index < objects.length) {
              // This doubles as a clone operation.
              let element = this._projectionFn(objects[index++]);
              if (this._transform) element = this._transform(element);
              return {
                value: element
              };
            }
            return {
              done: true
            };
          }
        };
      }
      [Symbol.asyncIterator]() {
        const syncResult = this[Symbol.iterator]();
        return {
          async next() {
            return Promise.resolve(syncResult.next());
          }
        };
      }

      /**
       * @callback IterationCallback
       * @param {Object} doc
       * @param {Number} index
       */
      /**
       * @summary Call `callback` once for each matching document, sequentially and
       *          synchronously.
       * @locus Anywhere
       * @method  forEach
       * @instance
       * @memberOf Mongo.Cursor
       * @param {IterationCallback} callback Function to call. It will be called
       *                                     with three arguments: the document, a
       *                                     0-based index, and <em>cursor</em>
       *                                     itself.
       * @param {Any} [thisArg] An object which will be the value of `this` inside
       *                        `callback`.
       */
      forEach(callback, thisArg) {
        if (this.reactive) {
          this._depend({
            addedBefore: true,
            removed: true,
            changed: true,
            movedBefore: true
          });
        }
        this._getRawObjects({
          ordered: true
        }).forEach((element, i) => {
          // This doubles as a clone operation.
          element = this._projectionFn(element);
          if (this._transform) {
            element = this._transform(element);
          }
          callback.call(thisArg, element, i, this);
        });
      }
      getTransform() {
        return this._transform;
      }

      /**
       * @summary Map callback over all matching documents.  Returns an Array.
       * @locus Anywhere
       * @method map
       * @instance
       * @memberOf Mongo.Cursor
       * @param {IterationCallback} callback Function to call. It will be called
       *                                     with three arguments: the document, a
       *                                     0-based index, and <em>cursor</em>
       *                                     itself.
       * @param {Any} [thisArg] An object which will be the value of `this` inside
       *                        `callback`.
       */
      map(callback, thisArg) {
        const result = [];
        this.forEach((doc, i) => {
          result.push(callback.call(thisArg, doc, i, this));
        });
        return result;
      }

      // options to contain:
      //  * callbacks for observe():
      //    - addedAt (document, atIndex)
      //    - added (document)
      //    - changedAt (newDocument, oldDocument, atIndex)
      //    - changed (newDocument, oldDocument)
      //    - removedAt (document, atIndex)
      //    - removed (document)
      //    - movedTo (document, oldIndex, newIndex)
      //
      // attributes available on returned query handle:
      //  * stop(): end updates
      //  * collection: the collection this query is querying
      //
      // iff x is a returned query handle, (x instanceof
      // LocalCollection.ObserveHandle) is true
      //
      // initial results delivered through added callback
      // XXX maybe callbacks should take a list of objects, to expose transactions?
      // XXX maybe support field limiting (to limit what you're notified on)

      /**
       * @summary Watch a query.  Receive callbacks as the result set changes.
       * @locus Anywhere
       * @memberOf Mongo.Cursor
       * @instance
       * @param {Object} callbacks Functions to call to deliver the result set as it
       *                           changes
       */
      observe(options) {
        return LocalCollection._observeFromObserveChanges(this, options);
      }

      /**
       * @summary Watch a query.  Receive callbacks as the result set changes.
       * @locus Anywhere
       * @memberOf Mongo.Cursor
       * @instance
       */
      observeAsync(options) {
        return new Promise(resolve => resolve(this.observe(options)));
      }

      /**
       * @summary Watch a query. Receive callbacks as the result set changes. Only
       *          the differences between the old and new documents are passed to
       *          the callbacks.
       * @locus Anywhere
       * @memberOf Mongo.Cursor
       * @instance
       * @param {Object} callbacks Functions to call to deliver the result set as it
       *                           changes
       */
      observeChanges(options) {
        const ordered = LocalCollection._observeChangesCallbacksAreOrdered(options);

        // there are several places that assume you aren't combining skip/limit with
        // unordered observe.  eg, update's EJSON.clone, and the "there are several"
        // comment in _modifyAndNotify
        // XXX allow skip/limit with unordered observe
        if (!options._allow_unordered && !ordered && (this.skip || this.limit)) {
          throw new Error("Must use an ordered observe with skip or limit (i.e. 'addedBefore' " + "for observeChanges or 'addedAt' for observe, instead of 'added').");
        }
        if (this.fields && (this.fields._id === 0 || this.fields._id === false)) {
          throw Error("You may not observe a cursor with {fields: {_id: 0}}");
        }
        const distances = this.matcher.hasGeoQuery() && ordered && new LocalCollection._IdMap();
        const query = {
          cursor: this,
          dirty: false,
          distances,
          matcher: this.matcher,
          // not fast pathed
          ordered,
          projectionFn: this._projectionFn,
          resultsSnapshot: null,
          sorter: ordered && this.sorter
        };
        let qid;

        // Non-reactive queries call added[Before] and then never call anything
        // else.
        if (this.reactive) {
          qid = this.collection.next_qid++;
          this.collection.queries[qid] = query;
        }
        query.results = this._getRawObjects({
          ordered,
          distances: query.distances
        });
        if (this.collection.paused) {
          query.resultsSnapshot = ordered ? [] : new LocalCollection._IdMap();
        }

        // wrap callbacks we were passed. callbacks only fire when not paused and
        // are never undefined
        // Filters out blacklisted fields according to cursor's projection.
        // XXX wrong place for this?

        // furthermore, callbacks enqueue until the operation we're working on is
        // done.
        const wrapCallback = fn => {
          if (!fn) {
            return () => {};
          }
          const self = this;
          return function /* args*/
          () {
            if (self.collection.paused) {
              return;
            }
            const args = arguments;
            self.collection._observeQueue.queueTask(() => {
              fn.apply(this, args);
            });
          };
        };
        query.added = wrapCallback(options.added);
        query.changed = wrapCallback(options.changed);
        query.removed = wrapCallback(options.removed);
        if (ordered) {
          query.addedBefore = wrapCallback(options.addedBefore);
          query.movedBefore = wrapCallback(options.movedBefore);
        }
        if (!options._suppress_initial && !this.collection.paused) {
          var _query$results, _query$results$size;
          const handler = doc => {
            const fields = EJSON.clone(doc);
            delete fields._id;
            if (ordered) {
              query.addedBefore(doc._id, this._projectionFn(fields), null);
            }
            query.added(doc._id, this._projectionFn(fields));
          };
          // it means it's just an array
          if (query.results.length) {
            for (const doc of query.results) {
              handler(doc);
            }
          }
          // it means it's an id map
          if ((_query$results = query.results) !== null && _query$results !== void 0 && (_query$results$size = _query$results.size) !== null && _query$results$size !== void 0 && _query$results$size.call(_query$results)) {
            query.results.forEach(handler);
          }
        }
        const handle = Object.assign(new LocalCollection.ObserveHandle(), {
          collection: this.collection,
          stop: () => {
            if (this.reactive) {
              delete this.collection.queries[qid];
            }
          },
          isReady: false,
          isReadyPromise: null
        });
        if (this.reactive && Tracker.active) {
          // XXX in many cases, the same observe will be recreated when
          // the current autorun is rerun.  we could save work by
          // letting it linger across rerun and potentially get
          // repurposed if the same observe is performed, using logic
          // similar to that of Meteor.subscribe.
          Tracker.onInvalidate(() => {
            handle.stop();
          });
        }

        // run the observe callbacks resulting from the initial contents
        // before we leave the observe.
        const drainResult = this.collection._observeQueue.drain();
        if (drainResult instanceof Promise) {
          handle.isReadyPromise = drainResult;
          drainResult.then(() => handle.isReady = true);
        } else {
          handle.isReady = true;
          handle.isReadyPromise = Promise.resolve();
        }
        return handle;
      }

      /**
       * @summary Watch a query. Receive callbacks as the result set changes. Only
       *          the differences between the old and new documents are passed to
       *          the callbacks.
       * @locus Anywhere
       * @memberOf Mongo.Cursor
       * @instance
       * @param {Object} callbacks Functions to call to deliver the result set as it
       *                           changes
       */
      observeChangesAsync(options) {
        return new Promise(resolve => {
          const handle = this.observeChanges(options);
          handle.isReadyPromise.then(() => resolve(handle));
        });
      }

      // XXX Maybe we need a version of observe that just calls a callback if
      // anything changed.
      _depend(changers, _allow_unordered) {
        if (Tracker.active) {
          const dependency = new Tracker.Dependency();
          const notify = dependency.changed.bind(dependency);
          dependency.depend();
          const options = {
            _allow_unordered,
            _suppress_initial: true
          };
          ['added', 'addedBefore', 'changed', 'movedBefore', 'removed'].forEach(fn => {
            if (changers[fn]) {
              options[fn] = notify;
            }
          });

          // observeChanges will stop() when this computation is invalidated
          this.observeChanges(options);
        }
      }
      _getCollectionName() {
        return this.collection.name;
      }

      // Returns a collection of matching objects, but doesn't deep copy them.
      //
      // If ordered is set, returns a sorted array, respecting sorter, skip, and
      // limit properties of the query provided that options.applySkipLimit is
      // not set to false (#1201). If sorter is falsey, no sort -- you get the
      // natural order.
      //
      // If ordered is not set, returns an object mapping from ID to doc (sorter,
      // skip and limit should not be set).
      //
      // If ordered is set and this cursor is a $near geoquery, then this function
      // will use an _IdMap to track each distance from the $near argument point in
      // order to use it as a sort key. If an _IdMap is passed in the 'distances'
      // argument, this function will clear it and use it for this purpose
      // (otherwise it will just create its own _IdMap). The observeChanges
      // implementation uses this to remember the distances after this function
      // returns.
      _getRawObjects() {
        let options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
        // By default this method will respect skip and limit because .fetch(),
        // .forEach() etc... expect this behaviour. It can be forced to ignore
        // skip and limit by setting applySkipLimit to false (.count() does this,
        // for example)
        const applySkipLimit = options.applySkipLimit !== false;

        // XXX use OrderedDict instead of array, and make IdMap and OrderedDict
        // compatible
        const results = options.ordered ? [] : new LocalCollection._IdMap();

        // fast path for single ID value
        if (this._selectorId !== undefined) {
          // If you have non-zero skip and ask for a single id, you get nothing.
          // This is so it matches the behavior of the '{_id: foo}' path.
          if (applySkipLimit && this.skip) {
            return results;
          }
          const selectedDoc = this.collection._docs.get(this._selectorId);
          if (selectedDoc) {
            if (options.ordered) {
              results.push(selectedDoc);
            } else {
              results.set(this._selectorId, selectedDoc);
            }
          }
          return results;
        }

        // slow path for arbitrary selector, sort, skip, limit

        // in the observeChanges case, distances is actually part of the "query"
        // (ie, live results set) object.  in other cases, distances is only used
        // inside this function.
        let distances;
        if (this.matcher.hasGeoQuery() && options.ordered) {
          if (options.distances) {
            distances = options.distances;
            distances.clear();
          } else {
            distances = new LocalCollection._IdMap();
          }
        }
        Meteor._runFresh(() => {
          this.collection._docs.forEach((doc, id) => {
            const matchResult = this.matcher.documentMatches(doc);
            if (matchResult.result) {
              if (options.ordered) {
                results.push(doc);
                if (distances && matchResult.distance !== undefined) {
                  distances.set(id, matchResult.distance);
                }
              } else {
                results.set(id, doc);
              }
            }

            // Override to ensure all docs are matched if ignoring skip & limit
            if (!applySkipLimit) {
              return true;
            }

            // Fast path for limited unsorted queries.
            // XXX 'length' check here seems wrong for ordered
            return !this.limit || this.skip || this.sorter || results.length !== this.limit;
          });
        });
        if (!options.ordered) {
          return results;
        }
        if (this.sorter) {
          results.sort(this.sorter.getComparator({
            distances
          }));
        }

        // Return the full set of results if there is no skip or limit or if we're
        // ignoring them
        if (!applySkipLimit || !this.limit && !this.skip) {
          return results;
        }
        return results.slice(this.skip, this.limit ? this.limit + this.skip : results.length);
      }
      _publishCursor(subscription) {
        // XXX minimongo should not depend on mongo-livedata!
        if (!Package.mongo) {
          throw new Error("Can't publish from Minimongo without the `mongo` package.");
        }
        if (!this.collection.name) {
          throw new Error("Can't publish a cursor from a collection without a name.");
        }
        return Package.mongo.Mongo.Collection._publishCursor(this, subscription, this.collection.name);
      }
    }
    // Implements async version of cursor methods to keep collections isomorphic
    ASYNC_CURSOR_METHODS.forEach(method => {
      const asyncName = getAsyncMethodName(method);
      Cursor.prototype[asyncName] = function () {
        try {
          for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
            args[_key] = arguments[_key];
          }
          return Promise.resolve(this[method].apply(this, args));
        } catch (error) {
          return Promise.reject(error);
        }
      };
    });
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

},"local_collection.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// packages/minimongo/local_collection.js                                                                            //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    let _objectSpread;
    module.link("@babel/runtime/helpers/objectSpread2", {
      default(v) {
        _objectSpread = v;
      }
    }, 0);
    module.export({
      default: () => LocalCollection
    });
    let Cursor;
    module.link("./cursor.js", {
      default(v) {
        Cursor = v;
      }
    }, 0);
    let ObserveHandle;
    module.link("./observe_handle.js", {
      default(v) {
        ObserveHandle = v;
      }
    }, 1);
    let hasOwn, isIndexable, isNumericKey, isOperatorObject, populateDocumentWithQueryFields, projectionDetails;
    module.link("./common.js", {
      hasOwn(v) {
        hasOwn = v;
      },
      isIndexable(v) {
        isIndexable = v;
      },
      isNumericKey(v) {
        isNumericKey = v;
      },
      isOperatorObject(v) {
        isOperatorObject = v;
      },
      populateDocumentWithQueryFields(v) {
        populateDocumentWithQueryFields = v;
      },
      projectionDetails(v) {
        projectionDetails = v;
      }
    }, 2);
    let getAsyncMethodName;
    module.link("./constants", {
      getAsyncMethodName(v) {
        getAsyncMethodName = v;
      }
    }, 3);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    class LocalCollection {
      constructor(name) {
        this.name = name;
        // _id -> document (also containing id)
        this._docs = new LocalCollection._IdMap();
        this._observeQueue = Meteor.isClient ? new Meteor._SynchronousQueue() : new Meteor._AsynchronousQueue();
        this.next_qid = 1; // live query id generator

        // qid -> live query object. keys:
        //  ordered: bool. ordered queries have addedBefore/movedBefore callbacks.
        //  results: array (ordered) or object (unordered) of current results
        //    (aliased with this._docs!)
        //  resultsSnapshot: snapshot of results. null if not paused.
        //  cursor: Cursor object for the query.
        //  selector, sorter, (callbacks): functions
        this.queries = Object.create(null);

        // null if not saving originals; an IdMap from id to original document value
        // if saving originals. See comments before saveOriginals().
        this._savedOriginals = null;

        // True when observers are paused and we should not send callbacks.
        this.paused = false;
      }
      countDocuments(selector, options) {
        return this.find(selector !== null && selector !== void 0 ? selector : {}, options).countAsync();
      }
      estimatedDocumentCount(options) {
        return this.find({}, options).countAsync();
      }

      // options may include sort, skip, limit, reactive
      // sort may be any of these forms:
      //     {a: 1, b: -1}
      //     [["a", "asc"], ["b", "desc"]]
      //     ["a", ["b", "desc"]]
      //   (in the first form you're beholden to key enumeration order in
      //   your javascript VM)
      //
      // reactive: if given, and false, don't register with Tracker (default
      // is true)
      //
      // XXX possibly should support retrieving a subset of fields? and
      // have it be a hint (ignored on the client, when not copying the
      // doc?)
      //
      // XXX sort does not yet support subkeys ('a.b') .. fix that!
      // XXX add one more sort form: "key"
      // XXX tests
      find(selector, options) {
        // default syntax for everything is to omit the selector argument.
        // but if selector is explicitly passed in as false or undefined, we
        // want a selector that matches nothing.
        if (arguments.length === 0) {
          selector = {};
        }
        return new LocalCollection.Cursor(this, selector, options);
      }
      findOne(selector) {
        let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
        if (arguments.length === 0) {
          selector = {};
        }

        // NOTE: by setting limit 1 here, we end up using very inefficient
        // code that recomputes the whole query on each update. The upside is
        // that when you reactively depend on a findOne you only get
        // invalidated when the found object changes, not any object in the
        // collection. Most findOne will be by id, which has a fast path, so
        // this might not be a big deal. In most cases, invalidation causes
        // the called to re-query anyway, so this should be a net performance
        // improvement.
        options.limit = 1;
        return this.find(selector, options).fetch()[0];
      }
      async findOneAsync(selector) {
        let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
        if (arguments.length === 0) {
          selector = {};
        }
        options.limit = 1;
        return (await this.find(selector, options).fetchAsync())[0];
      }
      prepareInsert(doc) {
        assertHasValidFieldNames(doc);

        // if you really want to use ObjectIDs, set this global.
        // Mongo.Collection specifies its own ids and does not use this code.
        if (!hasOwn.call(doc, '_id')) {
          doc._id = LocalCollection._useOID ? new MongoID.ObjectID() : Random.id();
        }
        const id = doc._id;
        if (this._docs.has(id)) {
          throw MinimongoError("Duplicate _id '".concat(id, "'"));
        }
        this._saveOriginal(id, undefined);
        this._docs.set(id, doc);
        return id;
      }

      // XXX possibly enforce that 'undefined' does not appear (we assume
      // this in our handling of null and $exists)
      insert(doc, callback) {
        doc = EJSON.clone(doc);
        const id = this.prepareInsert(doc);
        const queriesToRecompute = [];

        // trigger live queries that match
        for (const qid of Object.keys(this.queries)) {
          const query = this.queries[qid];
          if (query.dirty) {
            continue;
          }
          const matchResult = query.matcher.documentMatches(doc);
          if (matchResult.result) {
            if (query.distances && matchResult.distance !== undefined) {
              query.distances.set(id, matchResult.distance);
            }
            if (query.cursor.skip || query.cursor.limit) {
              queriesToRecompute.push(qid);
            } else {
              LocalCollection._insertInResultsSync(query, doc);
            }
          }
        }
        queriesToRecompute.forEach(qid => {
          if (this.queries[qid]) {
            this._recomputeResults(this.queries[qid]);
          }
        });
        this._observeQueue.drain();
        if (callback) {
          Meteor.defer(() => {
            callback(null, id);
          });
        }
        return id;
      }
      async insertAsync(doc, callback) {
        doc = EJSON.clone(doc);
        const id = this.prepareInsert(doc);
        const queriesToRecompute = [];

        // trigger live queries that match
        for (const qid of Object.keys(this.queries)) {
          const query = this.queries[qid];
          if (query.dirty) {
            continue;
          }
          const matchResult = query.matcher.documentMatches(doc);
          if (matchResult.result) {
            if (query.distances && matchResult.distance !== undefined) {
              query.distances.set(id, matchResult.distance);
            }
            if (query.cursor.skip || query.cursor.limit) {
              queriesToRecompute.push(qid);
            } else {
              await LocalCollection._insertInResultsAsync(query, doc);
            }
          }
        }
        queriesToRecompute.forEach(qid => {
          if (this.queries[qid]) {
            this._recomputeResults(this.queries[qid]);
          }
        });
        await this._observeQueue.drain();
        if (callback) {
          Meteor.defer(() => {
            callback(null, id);
          });
        }
        return id;
      }

      // Pause the observers. No callbacks from observers will fire until
      // 'resumeObservers' is called.
      pauseObservers() {
        // No-op if already paused.
        if (this.paused) {
          return;
        }

        // Set the 'paused' flag such that new observer messages don't fire.
        this.paused = true;

        // Take a snapshot of the query results for each query.
        Object.keys(this.queries).forEach(qid => {
          const query = this.queries[qid];
          query.resultsSnapshot = EJSON.clone(query.results);
        });
      }
      clearResultQueries(callback) {
        const result = this._docs.size();
        this._docs.clear();
        Object.keys(this.queries).forEach(qid => {
          const query = this.queries[qid];
          if (query.ordered) {
            query.results = [];
          } else {
            query.results.clear();
          }
        });
        if (callback) {
          Meteor.defer(() => {
            callback(null, result);
          });
        }
        return result;
      }
      prepareRemove(selector) {
        const matcher = new Minimongo.Matcher(selector);
        const remove = [];
        this._eachPossiblyMatchingDocSync(selector, (doc, id) => {
          if (matcher.documentMatches(doc).result) {
            remove.push(id);
          }
        });
        const queriesToRecompute = [];
        const queryRemove = [];
        for (let i = 0; i < remove.length; i++) {
          const removeId = remove[i];
          const removeDoc = this._docs.get(removeId);
          Object.keys(this.queries).forEach(qid => {
            const query = this.queries[qid];
            if (query.dirty) {
              return;
            }
            if (query.matcher.documentMatches(removeDoc).result) {
              if (query.cursor.skip || query.cursor.limit) {
                queriesToRecompute.push(qid);
              } else {
                queryRemove.push({
                  qid,
                  doc: removeDoc
                });
              }
            }
          });
          this._saveOriginal(removeId, removeDoc);
          this._docs.remove(removeId);
        }
        return {
          queriesToRecompute,
          queryRemove,
          remove
        };
      }
      remove(selector, callback) {
        // Easy special case: if we're not calling observeChanges callbacks and
        // we're not saving originals and we got asked to remove everything, then
        // just empty everything directly.
        if (this.paused && !this._savedOriginals && EJSON.equals(selector, {})) {
          return this.clearResultQueries(callback);
        }
        const {
          queriesToRecompute,
          queryRemove,
          remove
        } = this.prepareRemove(selector);

        // run live query callbacks _after_ we've removed the documents.
        queryRemove.forEach(remove => {
          const query = this.queries[remove.qid];
          if (query) {
            query.distances && query.distances.remove(remove.doc._id);
            LocalCollection._removeFromResultsSync(query, remove.doc);
          }
        });
        queriesToRecompute.forEach(qid => {
          const query = this.queries[qid];
          if (query) {
            this._recomputeResults(query);
          }
        });
        this._observeQueue.drain();
        const result = remove.length;
        if (callback) {
          Meteor.defer(() => {
            callback(null, result);
          });
        }
        return result;
      }
      async removeAsync(selector, callback) {
        // Easy special case: if we're not calling observeChanges callbacks and
        // we're not saving originals and we got asked to remove everything, then
        // just empty everything directly.
        if (this.paused && !this._savedOriginals && EJSON.equals(selector, {})) {
          return this.clearResultQueries(callback);
        }
        const {
          queriesToRecompute,
          queryRemove,
          remove
        } = this.prepareRemove(selector);

        // run live query callbacks _after_ we've removed the documents.
        for (const remove of queryRemove) {
          const query = this.queries[remove.qid];
          if (query) {
            query.distances && query.distances.remove(remove.doc._id);
            await LocalCollection._removeFromResultsAsync(query, remove.doc);
          }
        }
        queriesToRecompute.forEach(qid => {
          const query = this.queries[qid];
          if (query) {
            this._recomputeResults(query);
          }
        });
        await this._observeQueue.drain();
        const result = remove.length;
        if (callback) {
          Meteor.defer(() => {
            callback(null, result);
          });
        }
        return result;
      }

      // Resume the observers. Observers immediately receive change
      // notifications to bring them to the current state of the
      // database. Note that this is not just replaying all the changes that
      // happened during the pause, it is a smarter 'coalesced' diff.
      _resumeObservers() {
        // No-op if not paused.
        if (!this.paused) {
          return;
        }

        // Unset the 'paused' flag. Make sure to do this first, otherwise
        // observer methods won't actually fire when we trigger them.
        this.paused = false;
        Object.keys(this.queries).forEach(qid => {
          const query = this.queries[qid];
          if (query.dirty) {
            query.dirty = false;

            // re-compute results will perform `LocalCollection._diffQueryChanges`
            // automatically.
            this._recomputeResults(query, query.resultsSnapshot);
          } else {
            // Diff the current results against the snapshot and send to observers.
            // pass the query object for its observer callbacks.
            LocalCollection._diffQueryChanges(query.ordered, query.resultsSnapshot, query.results, query, {
              projectionFn: query.projectionFn
            });
          }
          query.resultsSnapshot = null;
        });
      }
      async resumeObserversServer() {
        this._resumeObservers();
        await this._observeQueue.drain();
      }
      resumeObserversClient() {
        this._resumeObservers();
        this._observeQueue.drain();
      }
      retrieveOriginals() {
        if (!this._savedOriginals) {
          throw new Error('Called retrieveOriginals without saveOriginals');
        }
        const originals = this._savedOriginals;
        this._savedOriginals = null;
        return originals;
      }

      // To track what documents are affected by a piece of code, call
      // saveOriginals() before it and retrieveOriginals() after it.
      // retrieveOriginals returns an object whose keys are the ids of the documents
      // that were affected since the call to saveOriginals(), and the values are
      // equal to the document's contents at the time of saveOriginals. (In the case
      // of an inserted document, undefined is the value.) You must alternate
      // between calls to saveOriginals() and retrieveOriginals().
      saveOriginals() {
        if (this._savedOriginals) {
          throw new Error('Called saveOriginals twice without retrieveOriginals');
        }
        this._savedOriginals = new LocalCollection._IdMap();
      }
      prepareUpdate(selector) {
        // Save the original results of any query that we might need to
        // _recomputeResults on, because _modifyAndNotify will mutate the objects in
        // it. (We don't need to save the original results of paused queries because
        // they already have a resultsSnapshot and we won't be diffing in
        // _recomputeResults.)
        const qidToOriginalResults = {};

        // We should only clone each document once, even if it appears in multiple
        // queries
        const docMap = new LocalCollection._IdMap();
        const idsMatched = LocalCollection._idsMatchedBySelector(selector);
        Object.keys(this.queries).forEach(qid => {
          const query = this.queries[qid];
          if ((query.cursor.skip || query.cursor.limit) && !this.paused) {
            // Catch the case of a reactive `count()` on a cursor with skip
            // or limit, which registers an unordered observe. This is a
            // pretty rare case, so we just clone the entire result set with
            // no optimizations for documents that appear in these result
            // sets and other queries.
            if (query.results instanceof LocalCollection._IdMap) {
              qidToOriginalResults[qid] = query.results.clone();
              return;
            }
            if (!(query.results instanceof Array)) {
              throw new Error('Assertion failed: query.results not an array');
            }

            // Clones a document to be stored in `qidToOriginalResults`
            // because it may be modified before the new and old result sets
            // are diffed. But if we know exactly which document IDs we're
            // going to modify, then we only need to clone those.
            const memoizedCloneIfNeeded = doc => {
              if (docMap.has(doc._id)) {
                return docMap.get(doc._id);
              }
              const docToMemoize = idsMatched && !idsMatched.some(id => EJSON.equals(id, doc._id)) ? doc : EJSON.clone(doc);
              docMap.set(doc._id, docToMemoize);
              return docToMemoize;
            };
            qidToOriginalResults[qid] = query.results.map(memoizedCloneIfNeeded);
          }
        });
        return qidToOriginalResults;
      }
      finishUpdate(_ref) {
        let {
          options,
          updateCount,
          callback,
          insertedId
        } = _ref;
        // Return the number of affected documents, or in the upsert case, an object
        // containing the number of affected docs and the id of the doc that was
        // inserted, if any.
        let result;
        if (options._returnObject) {
          result = {
            numberAffected: updateCount
          };
          if (insertedId !== undefined) {
            result.insertedId = insertedId;
          }
        } else {
          result = updateCount;
        }
        if (callback) {
          Meteor.defer(() => {
            callback(null, result);
          });
        }
        return result;
      }

      // XXX atomicity: if multi is true, and one modification fails, do
      // we rollback the whole operation, or what?
      async updateAsync(selector, mod, options, callback) {
        if (!callback && options instanceof Function) {
          callback = options;
          options = null;
        }
        if (!options) {
          options = {};
        }
        const matcher = new Minimongo.Matcher(selector, true);
        const qidToOriginalResults = this.prepareUpdate(selector);
        let recomputeQids = {};
        let updateCount = 0;
        await this._eachPossiblyMatchingDocAsync(selector, async (doc, id) => {
          const queryResult = matcher.documentMatches(doc);
          if (queryResult.result) {
            // XXX Should we save the original even if mod ends up being a no-op?
            this._saveOriginal(id, doc);
            recomputeQids = await this._modifyAndNotifyAsync(doc, mod, queryResult.arrayIndices);
            ++updateCount;
            if (!options.multi) {
              return false; // break
            }
          }
          return true;
        });
        Object.keys(recomputeQids).forEach(qid => {
          const query = this.queries[qid];
          if (query) {
            this._recomputeResults(query, qidToOriginalResults[qid]);
          }
        });
        await this._observeQueue.drain();

        // If we are doing an upsert, and we didn't modify any documents yet, then
        // it's time to do an insert. Figure out what document we are inserting, and
        // generate an id for it.
        let insertedId;
        if (updateCount === 0 && options.upsert) {
          const doc = LocalCollection._createUpsertDocument(selector, mod);
          if (!doc._id && options.insertedId) {
            doc._id = options.insertedId;
          }
          insertedId = await this.insertAsync(doc);
          updateCount = 1;
        }
        return this.finishUpdate({
          options,
          insertedId,
          updateCount,
          callback
        });
      }
      // XXX atomicity: if multi is true, and one modification fails, do
      // we rollback the whole operation, or what?
      update(selector, mod, options, callback) {
        if (!callback && options instanceof Function) {
          callback = options;
          options = null;
        }
        if (!options) {
          options = {};
        }
        const matcher = new Minimongo.Matcher(selector, true);
        const qidToOriginalResults = this.prepareUpdate(selector);
        let recomputeQids = {};
        let updateCount = 0;
        this._eachPossiblyMatchingDocSync(selector, (doc, id) => {
          const queryResult = matcher.documentMatches(doc);
          if (queryResult.result) {
            // XXX Should we save the original even if mod ends up being a no-op?
            this._saveOriginal(id, doc);
            recomputeQids = this._modifyAndNotifySync(doc, mod, queryResult.arrayIndices);
            ++updateCount;
            if (!options.multi) {
              return false; // break
            }
          }
          return true;
        });
        Object.keys(recomputeQids).forEach(qid => {
          const query = this.queries[qid];
          if (query) {
            this._recomputeResults(query, qidToOriginalResults[qid]);
          }
        });
        this._observeQueue.drain();

        // If we are doing an upsert, and we didn't modify any documents yet, then
        // it's time to do an insert. Figure out what document we are inserting, and
        // generate an id for it.
        let insertedId;
        if (updateCount === 0 && options.upsert) {
          const doc = LocalCollection._createUpsertDocument(selector, mod);
          if (!doc._id && options.insertedId) {
            doc._id = options.insertedId;
          }
          insertedId = this.insert(doc);
          updateCount = 1;
        }
        return this.finishUpdate({
          options,
          updateCount,
          callback,
          selector,
          mod
        });
      }

      // A convenience wrapper on update. LocalCollection.upsert(sel, mod) is
      // equivalent to LocalCollection.update(sel, mod, {upsert: true,
      // _returnObject: true}).
      upsert(selector, mod, options, callback) {
        if (!callback && typeof options === 'function') {
          callback = options;
          options = {};
        }
        return this.update(selector, mod, Object.assign({}, options, {
          upsert: true,
          _returnObject: true
        }), callback);
      }
      upsertAsync(selector, mod, options, callback) {
        if (!callback && typeof options === 'function') {
          callback = options;
          options = {};
        }
        return this.updateAsync(selector, mod, Object.assign({}, options, {
          upsert: true,
          _returnObject: true
        }), callback);
      }

      // Iterates over a subset of documents that could match selector; calls
      // fn(doc, id) on each of them.  Specifically, if selector specifies
      // specific _id's, it only looks at those.  doc is *not* cloned: it is the
      // same object that is in _docs.
      async _eachPossiblyMatchingDocAsync(selector, fn) {
        const specificIds = LocalCollection._idsMatchedBySelector(selector);
        if (specificIds) {
          for (const id of specificIds) {
            const doc = this._docs.get(id);
            if (doc && !(await fn(doc, id))) {
              break;
            }
          }
        } else {
          await this._docs.forEachAsync(fn);
        }
      }
      _eachPossiblyMatchingDocSync(selector, fn) {
        const specificIds = LocalCollection._idsMatchedBySelector(selector);
        if (specificIds) {
          for (const id of specificIds) {
            const doc = this._docs.get(id);
            if (doc && !fn(doc, id)) {
              break;
            }
          }
        } else {
          this._docs.forEach(fn);
        }
      }
      _getMatchedDocAndModify(doc, mod, arrayIndices) {
        const matched_before = {};
        Object.keys(this.queries).forEach(qid => {
          const query = this.queries[qid];
          if (query.dirty) {
            return;
          }
          if (query.ordered) {
            matched_before[qid] = query.matcher.documentMatches(doc).result;
          } else {
            // Because we don't support skip or limit (yet) in unordered queries, we
            // can just do a direct lookup.
            matched_before[qid] = query.results.has(doc._id);
          }
        });
        return matched_before;
      }
      _modifyAndNotifySync(doc, mod, arrayIndices) {
        const matched_before = this._getMatchedDocAndModify(doc, mod, arrayIndices);
        const old_doc = EJSON.clone(doc);
        LocalCollection._modify(doc, mod, {
          arrayIndices
        });
        const recomputeQids = {};
        for (const qid of Object.keys(this.queries)) {
          const query = this.queries[qid];
          if (query.dirty) {
            continue;
          }
          const afterMatch = query.matcher.documentMatches(doc);
          const after = afterMatch.result;
          const before = matched_before[qid];
          if (after && query.distances && afterMatch.distance !== undefined) {
            query.distances.set(doc._id, afterMatch.distance);
          }
          if (query.cursor.skip || query.cursor.limit) {
            // We need to recompute any query where the doc may have been in the
            // cursor's window either before or after the update. (Note that if skip
            // or limit is set, "before" and "after" being true do not necessarily
            // mean that the document is in the cursor's output after skip/limit is
            // applied... but if they are false, then the document definitely is NOT
            // in the output. So it's safe to skip recompute if neither before or
            // after are true.)
            if (before || after) {
              recomputeQids[qid] = true;
            }
          } else if (before && !after) {
            LocalCollection._removeFromResultsSync(query, doc);
          } else if (!before && after) {
            LocalCollection._insertInResultsSync(query, doc);
          } else if (before && after) {
            LocalCollection._updateInResultsSync(query, doc, old_doc);
          }
        }
        return recomputeQids;
      }
      async _modifyAndNotifyAsync(doc, mod, arrayIndices) {
        const matched_before = this._getMatchedDocAndModify(doc, mod, arrayIndices);
        const old_doc = EJSON.clone(doc);
        LocalCollection._modify(doc, mod, {
          arrayIndices
        });
        const recomputeQids = {};
        for (const qid of Object.keys(this.queries)) {
          const query = this.queries[qid];
          if (query.dirty) {
            continue;
          }
          const afterMatch = query.matcher.documentMatches(doc);
          const after = afterMatch.result;
          const before = matched_before[qid];
          if (after && query.distances && afterMatch.distance !== undefined) {
            query.distances.set(doc._id, afterMatch.distance);
          }
          if (query.cursor.skip || query.cursor.limit) {
            // We need to recompute any query where the doc may have been in the
            // cursor's window either before or after the update. (Note that if skip
            // or limit is set, "before" and "after" being true do not necessarily
            // mean that the document is in the cursor's output after skip/limit is
            // applied... but if they are false, then the document definitely is NOT
            // in the output. So it's safe to skip recompute if neither before or
            // after are true.)
            if (before || after) {
              recomputeQids[qid] = true;
            }
          } else if (before && !after) {
            await LocalCollection._removeFromResultsAsync(query, doc);
          } else if (!before && after) {
            await LocalCollection._insertInResultsAsync(query, doc);
          } else if (before && after) {
            await LocalCollection._updateInResultsAsync(query, doc, old_doc);
          }
        }
        return recomputeQids;
      }

      // Recomputes the results of a query and runs observe callbacks for the
      // difference between the previous results and the current results (unless
      // paused). Used for skip/limit queries.
      //
      // When this is used by insert or remove, it can just use query.results for
      // the old results (and there's no need to pass in oldResults), because these
      // operations don't mutate the documents in the collection. Update needs to
      // pass in an oldResults which was deep-copied before the modifier was
      // applied.
      //
      // oldResults is guaranteed to be ignored if the query is not paused.
      _recomputeResults(query, oldResults) {
        if (this.paused) {
          // There's no reason to recompute the results now as we're still paused.
          // By flagging the query as "dirty", the recompute will be performed
          // when resumeObservers is called.
          query.dirty = true;
          return;
        }
        if (!this.paused && !oldResults) {
          oldResults = query.results;
        }
        if (query.distances) {
          query.distances.clear();
        }
        query.results = query.cursor._getRawObjects({
          distances: query.distances,
          ordered: query.ordered
        });
        if (!this.paused) {
          LocalCollection._diffQueryChanges(query.ordered, oldResults, query.results, query, {
            projectionFn: query.projectionFn
          });
        }
      }
      _saveOriginal(id, doc) {
        // Are we even trying to save originals?
        if (!this._savedOriginals) {
          return;
        }

        // Have we previously mutated the original (and so 'doc' is not actually
        // original)?  (Note the 'has' check rather than truth: we store undefined
        // here for inserted docs!)
        if (this._savedOriginals.has(id)) {
          return;
        }
        this._savedOriginals.set(id, EJSON.clone(doc));
      }
    }
    LocalCollection.Cursor = Cursor;
    LocalCollection.ObserveHandle = ObserveHandle;

    // XXX maybe move these into another ObserveHelpers package or something

    // _CachingChangeObserver is an object which receives observeChanges callbacks
    // and keeps a cache of the current cursor state up to date in this.docs. Users
    // of this class should read the docs field but not modify it. You should pass
    // the "applyChange" field as the callbacks to the underlying observeChanges
    // call. Optionally, you can specify your own observeChanges callbacks which are
    // invoked immediately before the docs field is updated; this object is made
    // available as `this` to those callbacks.
    LocalCollection._CachingChangeObserver = class _CachingChangeObserver {
      constructor() {
        let options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
        const orderedFromCallbacks = options.callbacks && LocalCollection._observeChangesCallbacksAreOrdered(options.callbacks);
        if (hasOwn.call(options, 'ordered')) {
          this.ordered = options.ordered;
          if (options.callbacks && options.ordered !== orderedFromCallbacks) {
            throw Error('ordered option doesn\'t match callbacks');
          }
        } else if (options.callbacks) {
          this.ordered = orderedFromCallbacks;
        } else {
          throw Error('must provide ordered or callbacks');
        }
        const callbacks = options.callbacks || {};
        if (this.ordered) {
          this.docs = new OrderedDict(MongoID.idStringify);
          this.applyChange = {
            addedBefore: (id, fields, before) => {
              // Take a shallow copy since the top-level properties can be changed
              const doc = _objectSpread({}, fields);
              doc._id = id;
              if (callbacks.addedBefore) {
                callbacks.addedBefore.call(this, id, EJSON.clone(fields), before);
              }

              // This line triggers if we provide added with movedBefore.
              if (callbacks.added) {
                callbacks.added.call(this, id, EJSON.clone(fields));
              }

              // XXX could `before` be a falsy ID?  Technically
              // idStringify seems to allow for them -- though
              // OrderedDict won't call stringify on a falsy arg.
              this.docs.putBefore(id, doc, before || null);
            },
            movedBefore: (id, before) => {
              if (callbacks.movedBefore) {
                callbacks.movedBefore.call(this, id, before);
              }
              this.docs.moveBefore(id, before || null);
            }
          };
        } else {
          this.docs = new LocalCollection._IdMap();
          this.applyChange = {
            added: (id, fields) => {
              // Take a shallow copy since the top-level properties can be changed
              const doc = _objectSpread({}, fields);
              if (callbacks.added) {
                callbacks.added.call(this, id, EJSON.clone(fields));
              }
              doc._id = id;
              this.docs.set(id, doc);
            }
          };
        }

        // The methods in _IdMap and OrderedDict used by these callbacks are
        // identical.
        this.applyChange.changed = (id, fields) => {
          const doc = this.docs.get(id);
          if (!doc) {
            throw new Error("Unknown id for changed: ".concat(id));
          }
          if (callbacks.changed) {
            callbacks.changed.call(this, id, EJSON.clone(fields));
          }
          DiffSequence.applyChanges(doc, fields);
        };
        this.applyChange.removed = id => {
          if (callbacks.removed) {
            callbacks.removed.call(this, id);
          }
          this.docs.remove(id);
        };
      }
    };
    LocalCollection._IdMap = class _IdMap extends IdMap {
      constructor() {
        super(MongoID.idStringify, MongoID.idParse);
      }
    };

    // Wrap a transform function to return objects that have the _id field
    // of the untransformed document. This ensures that subsystems such as
    // the observe-sequence package that call `observe` can keep track of
    // the documents identities.
    //
    // - Require that it returns objects
    // - If the return value has an _id field, verify that it matches the
    //   original _id field
    // - If the return value doesn't have an _id field, add it back.
    LocalCollection.wrapTransform = transform => {
      if (!transform) {
        return null;
      }

      // No need to doubly-wrap transforms.
      if (transform.__wrappedTransform__) {
        return transform;
      }
      const wrapped = doc => {
        if (!hasOwn.call(doc, '_id')) {
          // XXX do we ever have a transform on the oplog's collection? because that
          // collection has no _id.
          throw new Error('can only transform documents with _id');
        }
        const id = doc._id;

        // XXX consider making tracker a weak dependency and checking
        // Package.tracker here
        const transformed = Tracker.nonreactive(() => transform(doc));
        if (!LocalCollection._isPlainObject(transformed)) {
          throw new Error('transform must return object');
        }
        if (hasOwn.call(transformed, '_id')) {
          if (!EJSON.equals(transformed._id, id)) {
            throw new Error('transformed document can\'t have different _id');
          }
        } else {
          transformed._id = id;
        }
        return transformed;
      };
      wrapped.__wrappedTransform__ = true;
      return wrapped;
    };

    // XXX the sorted-query logic below is laughably inefficient. we'll
    // need to come up with a better datastructure for this.
    //
    // XXX the logic for observing with a skip or a limit is even more
    // laughably inefficient. we recompute the whole results every time!

    // This binary search puts a value between any equal values, and the first
    // lesser value.
    LocalCollection._binarySearch = (cmp, array, value) => {
      let first = 0;
      let range = array.length;
      while (range > 0) {
        const halfRange = Math.floor(range / 2);
        if (cmp(value, array[first + halfRange]) >= 0) {
          first += halfRange + 1;
          range -= halfRange + 1;
        } else {
          range = halfRange;
        }
      }
      return first;
    };
    LocalCollection._checkSupportedProjection = fields => {
      if (fields !== Object(fields) || Array.isArray(fields)) {
        throw MinimongoError('fields option must be an object');
      }
      Object.keys(fields).forEach(keyPath => {
        if (keyPath.split('.').includes('$')) {
          throw MinimongoError('Minimongo doesn\'t support $ operator in projections yet.');
        }
        const value = fields[keyPath];
        if (typeof value === 'object' && ['$elemMatch', '$meta', '$slice'].some(key => hasOwn.call(value, key))) {
          throw MinimongoError('Minimongo doesn\'t support operators in projections yet.');
        }
        if (![1, 0, true, false].includes(value)) {
          throw MinimongoError('Projection values should be one of 1, 0, true, or false');
        }
      });
    };

    // Knows how to compile a fields projection to a predicate function.
    // @returns - Function: a closure that filters out an object according to the
    //            fields projection rules:
    //            @param obj - Object: MongoDB-styled document
    //            @returns - Object: a document with the fields filtered out
    //                       according to projection rules. Doesn't retain subfields
    //                       of passed argument.
    LocalCollection._compileProjection = fields => {
      LocalCollection._checkSupportedProjection(fields);
      const _idProjection = fields._id === undefined ? true : fields._id;
      const details = projectionDetails(fields);

      // returns transformed doc according to ruleTree
      const transform = (doc, ruleTree) => {
        // Special case for "sets"
        if (Array.isArray(doc)) {
          return doc.map(subdoc => transform(subdoc, ruleTree));
        }
        const result = details.including ? {} : EJSON.clone(doc);
        Object.keys(ruleTree).forEach(key => {
          if (doc == null || !hasOwn.call(doc, key)) {
            return;
          }
          const rule = ruleTree[key];
          if (rule === Object(rule)) {
            // For sub-objects/subsets we branch
            if (doc[key] === Object(doc[key])) {
              result[key] = transform(doc[key], rule);
            }
          } else if (details.including) {
            // Otherwise we don't even touch this subfield
            result[key] = EJSON.clone(doc[key]);
          } else {
            delete result[key];
          }
        });
        return doc != null ? result : doc;
      };
      return doc => {
        const result = transform(doc, details.tree);
        if (_idProjection && hasOwn.call(doc, '_id')) {
          result._id = doc._id;
        }
        if (!_idProjection && hasOwn.call(result, '_id')) {
          delete result._id;
        }
        return result;
      };
    };

    // Calculates the document to insert in case we're doing an upsert and the
    // selector does not match any elements
    LocalCollection._createUpsertDocument = (selector, modifier) => {
      const selectorDocument = populateDocumentWithQueryFields(selector);
      const isModify = LocalCollection._isModificationMod(modifier);
      const newDoc = {};
      if (selectorDocument._id) {
        newDoc._id = selectorDocument._id;
        delete selectorDocument._id;
      }

      // This double _modify call is made to help with nested properties (see issue
      // #8631). We do this even if it's a replacement for validation purposes (e.g.
      // ambiguous id's)
      LocalCollection._modify(newDoc, {
        $set: selectorDocument
      });
      LocalCollection._modify(newDoc, modifier, {
        isInsert: true
      });
      if (isModify) {
        return newDoc;
      }

      // Replacement can take _id from query document
      const replacement = Object.assign({}, modifier);
      if (newDoc._id) {
        replacement._id = newDoc._id;
      }
      return replacement;
    };
    LocalCollection._diffObjects = (left, right, callbacks) => {
      return DiffSequence.diffObjects(left, right, callbacks);
    };

    // ordered: bool.
    // old_results and new_results: collections of documents.
    //    if ordered, they are arrays.
    //    if unordered, they are IdMaps
    LocalCollection._diffQueryChanges = (ordered, oldResults, newResults, observer, options) => DiffSequence.diffQueryChanges(ordered, oldResults, newResults, observer, options);
    LocalCollection._diffQueryOrderedChanges = (oldResults, newResults, observer, options) => DiffSequence.diffQueryOrderedChanges(oldResults, newResults, observer, options);
    LocalCollection._diffQueryUnorderedChanges = (oldResults, newResults, observer, options) => DiffSequence.diffQueryUnorderedChanges(oldResults, newResults, observer, options);
    LocalCollection._findInOrderedResults = (query, doc) => {
      if (!query.ordered) {
        throw new Error('Can\'t call _findInOrderedResults on unordered query');
      }
      for (let i = 0; i < query.results.length; i++) {
        if (query.results[i] === doc) {
          return i;
        }
      }
      throw Error('object missing from query');
    };

    // If this is a selector which explicitly constrains the match by ID to a finite
    // number of documents, returns a list of their IDs.  Otherwise returns
    // null. Note that the selector may have other restrictions so it may not even
    // match those document!  We care about $in and $and since those are generated
    // access-controlled update and remove.
    LocalCollection._idsMatchedBySelector = selector => {
      // Is the selector just an ID?
      if (LocalCollection._selectorIsId(selector)) {
        return [selector];
      }
      if (!selector) {
        return null;
      }

      // Do we have an _id clause?
      if (hasOwn.call(selector, '_id')) {
        // Is the _id clause just an ID?
        if (LocalCollection._selectorIsId(selector._id)) {
          return [selector._id];
        }

        // Is the _id clause {_id: {$in: ["x", "y", "z"]}}?
        if (selector._id && Array.isArray(selector._id.$in) && selector._id.$in.length && selector._id.$in.every(LocalCollection._selectorIsId)) {
          return selector._id.$in;
        }
        return null;
      }

      // If this is a top-level $and, and any of the clauses constrain their
      // documents, then the whole selector is constrained by any one clause's
      // constraint. (Well, by their intersection, but that seems unlikely.)
      if (Array.isArray(selector.$and)) {
        for (let i = 0; i < selector.$and.length; ++i) {
          const subIds = LocalCollection._idsMatchedBySelector(selector.$and[i]);
          if (subIds) {
            return subIds;
          }
        }
      }
      return null;
    };
    LocalCollection._insertInResultsSync = (query, doc) => {
      const fields = EJSON.clone(doc);
      delete fields._id;
      if (query.ordered) {
        if (!query.sorter) {
          query.addedBefore(doc._id, query.projectionFn(fields), null);
          query.results.push(doc);
        } else {
          const i = LocalCollection._insertInSortedList(query.sorter.getComparator({
            distances: query.distances
          }), query.results, doc);
          let next = query.results[i + 1];
          if (next) {
            next = next._id;
          } else {
            next = null;
          }
          query.addedBefore(doc._id, query.projectionFn(fields), next);
        }
        query.added(doc._id, query.projectionFn(fields));
      } else {
        query.added(doc._id, query.projectionFn(fields));
        query.results.set(doc._id, doc);
      }
    };
    LocalCollection._insertInResultsAsync = async (query, doc) => {
      const fields = EJSON.clone(doc);
      delete fields._id;
      if (query.ordered) {
        if (!query.sorter) {
          await query.addedBefore(doc._id, query.projectionFn(fields), null);
          query.results.push(doc);
        } else {
          const i = LocalCollection._insertInSortedList(query.sorter.getComparator({
            distances: query.distances
          }), query.results, doc);
          let next = query.results[i + 1];
          if (next) {
            next = next._id;
          } else {
            next = null;
          }
          await query.addedBefore(doc._id, query.projectionFn(fields), next);
        }
        await query.added(doc._id, query.projectionFn(fields));
      } else {
        await query.added(doc._id, query.projectionFn(fields));
        query.results.set(doc._id, doc);
      }
    };
    LocalCollection._insertInSortedList = (cmp, array, value) => {
      if (array.length === 0) {
        array.push(value);
        return 0;
      }
      const i = LocalCollection._binarySearch(cmp, array, value);
      array.splice(i, 0, value);
      return i;
    };
    LocalCollection._isModificationMod = mod => {
      let isModify = false;
      let isReplace = false;
      Object.keys(mod).forEach(key => {
        if (key.substr(0, 1) === '$') {
          isModify = true;
        } else {
          isReplace = true;
        }
      });
      if (isModify && isReplace) {
        throw new Error('Update parameter cannot have both modifier and non-modifier fields.');
      }
      return isModify;
    };

    // XXX maybe this should be EJSON.isObject, though EJSON doesn't know about
    // RegExp
    // XXX note that _type(undefined) === 3!!!!
    LocalCollection._isPlainObject = x => {
      return x && LocalCollection._f._type(x) === 3;
    };

    // XXX need a strategy for passing the binding of $ into this
    // function, from the compiled selector
    //
    // maybe just {key.up.to.just.before.dollarsign: array_index}
    //
    // XXX atomicity: if one modification fails, do we roll back the whole
    // change?
    //
    // options:
    //   - isInsert is set when _modify is being called to compute the document to
    //     insert as part of an upsert operation. We use this primarily to figure
    //     out when to set the fields in $setOnInsert, if present.
    LocalCollection._modify = function (doc, modifier) {
      let options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      if (!LocalCollection._isPlainObject(modifier)) {
        throw MinimongoError('Modifier must be an object');
      }

      // Make sure the caller can't mutate our data structures.
      modifier = EJSON.clone(modifier);
      const isModifier = isOperatorObject(modifier);
      const newDoc = isModifier ? EJSON.clone(doc) : modifier;
      if (isModifier) {
        // apply modifiers to the doc.
        Object.keys(modifier).forEach(operator => {
          // Treat $setOnInsert as $set if this is an insert.
          const setOnInsert = options.isInsert && operator === '$setOnInsert';
          const modFunc = MODIFIERS[setOnInsert ? '$set' : operator];
          const operand = modifier[operator];
          if (!modFunc) {
            throw MinimongoError("Invalid modifier specified ".concat(operator));
          }
          Object.keys(operand).forEach(keypath => {
            const arg = operand[keypath];
            if (keypath === '') {
              throw MinimongoError('An empty update path is not valid.');
            }
            const keyparts = keypath.split('.');
            if (!keyparts.every(Boolean)) {
              throw MinimongoError("The update path '".concat(keypath, "' contains an empty field name, ") + 'which is not allowed.');
            }
            const target = findModTarget(newDoc, keyparts, {
              arrayIndices: options.arrayIndices,
              forbidArray: operator === '$rename',
              noCreate: NO_CREATE_MODIFIERS[operator]
            });
            modFunc(target, keyparts.pop(), arg, keypath, newDoc);
          });
        });
        if (doc._id && !EJSON.equals(doc._id, newDoc._id)) {
          throw MinimongoError("After applying the update to the document {_id: \"".concat(doc._id, "\", ...},") + ' the (immutable) field \'_id\' was found to have been altered to ' + "_id: \"".concat(newDoc._id, "\""));
        }
      } else {
        if (doc._id && modifier._id && !EJSON.equals(doc._id, modifier._id)) {
          throw MinimongoError("The _id field cannot be changed from {_id: \"".concat(doc._id, "\"} to ") + "{_id: \"".concat(modifier._id, "\"}"));
        }

        // replace the whole document
        assertHasValidFieldNames(modifier);
      }

      // move new document into place.
      Object.keys(doc).forEach(key => {
        // Note: this used to be for (var key in doc) however, this does not
        // work right in Opera. Deleting from a doc while iterating over it
        // would sometimes cause opera to skip some keys.
        if (key !== '_id') {
          delete doc[key];
        }
      });
      Object.keys(newDoc).forEach(key => {
        doc[key] = newDoc[key];
      });
    };
    LocalCollection._observeFromObserveChanges = (cursor, observeCallbacks) => {
      const transform = cursor.getTransform() || (doc => doc);
      let suppressed = !!observeCallbacks._suppress_initial;
      let observeChangesCallbacks;
      if (LocalCollection._observeCallbacksAreOrdered(observeCallbacks)) {
        // The "_no_indices" option sets all index arguments to -1 and skips the
        // linear scans required to generate them.  This lets observers that don't
        // need absolute indices benefit from the other features of this API --
        // relative order, transforms, and applyChanges -- without the speed hit.
        const indices = !observeCallbacks._no_indices;
        observeChangesCallbacks = {
          addedBefore(id, fields, before) {
            const check = suppressed || !(observeCallbacks.addedAt || observeCallbacks.added);
            if (check) {
              return;
            }
            const doc = transform(Object.assign(fields, {
              _id: id
            }));
            if (observeCallbacks.addedAt) {
              observeCallbacks.addedAt(doc, indices ? before ? this.docs.indexOf(before) : this.docs.size() : -1, before);
            } else {
              observeCallbacks.added(doc);
            }
          },
          changed(id, fields) {
            if (!(observeCallbacks.changedAt || observeCallbacks.changed)) {
              return;
            }
            let doc = EJSON.clone(this.docs.get(id));
            if (!doc) {
              throw new Error("Unknown id for changed: ".concat(id));
            }
            const oldDoc = transform(EJSON.clone(doc));
            DiffSequence.applyChanges(doc, fields);
            if (observeCallbacks.changedAt) {
              observeCallbacks.changedAt(transform(doc), oldDoc, indices ? this.docs.indexOf(id) : -1);
            } else {
              observeCallbacks.changed(transform(doc), oldDoc);
            }
          },
          movedBefore(id, before) {
            if (!observeCallbacks.movedTo) {
              return;
            }
            const from = indices ? this.docs.indexOf(id) : -1;
            let to = indices ? before ? this.docs.indexOf(before) : this.docs.size() : -1;

            // When not moving backwards, adjust for the fact that removing the
            // document slides everything back one slot.
            if (to > from) {
              --to;
            }
            observeCallbacks.movedTo(transform(EJSON.clone(this.docs.get(id))), from, to, before || null);
          },
          removed(id) {
            if (!(observeCallbacks.removedAt || observeCallbacks.removed)) {
              return;
            }

            // technically maybe there should be an EJSON.clone here, but it's about
            // to be removed from this.docs!
            const doc = transform(this.docs.get(id));
            if (observeCallbacks.removedAt) {
              observeCallbacks.removedAt(doc, indices ? this.docs.indexOf(id) : -1);
            } else {
              observeCallbacks.removed(doc);
            }
          }
        };
      } else {
        observeChangesCallbacks = {
          added(id, fields) {
            if (!suppressed && observeCallbacks.added) {
              observeCallbacks.added(transform(Object.assign(fields, {
                _id: id
              })));
            }
          },
          changed(id, fields) {
            if (observeCallbacks.changed) {
              const oldDoc = this.docs.get(id);
              const doc = EJSON.clone(oldDoc);
              DiffSequence.applyChanges(doc, fields);
              observeCallbacks.changed(transform(doc), transform(EJSON.clone(oldDoc)));
            }
          },
          removed(id) {
            if (observeCallbacks.removed) {
              observeCallbacks.removed(transform(this.docs.get(id)));
            }
          }
        };
      }
      const changeObserver = new LocalCollection._CachingChangeObserver({
        callbacks: observeChangesCallbacks
      });

      // CachingChangeObserver clones all received input on its callbacks
      // So we can mark it as safe to reduce the ejson clones.
      // This is tested by the `mongo-livedata - (extended) scribbling` tests
      changeObserver.applyChange._fromObserve = true;
      const handle = cursor.observeChanges(changeObserver.applyChange, {
        nonMutatingCallbacks: true
      });

      // If needed, re-enable callbacks as soon as the initial batch is ready.
      const setSuppressed = h => {
        var _h$isReadyPromise;
        if (h.isReady) suppressed = false;else (_h$isReadyPromise = h.isReadyPromise) === null || _h$isReadyPromise === void 0 ? void 0 : _h$isReadyPromise.then(() => suppressed = false);
      };
      // When we call cursor.observeChanges() it can be the on from
      // the mongo package (instead of the minimongo one) and it doesn't have isReady and isReadyPromise
      if (Meteor._isPromise(handle)) {
        handle.then(setSuppressed);
      } else {
        setSuppressed(handle);
      }
      return handle;
    };
    LocalCollection._observeCallbacksAreOrdered = callbacks => {
      if (callbacks.added && callbacks.addedAt) {
        throw new Error('Please specify only one of added() and addedAt()');
      }
      if (callbacks.changed && callbacks.changedAt) {
        throw new Error('Please specify only one of changed() and changedAt()');
      }
      if (callbacks.removed && callbacks.removedAt) {
        throw new Error('Please specify only one of removed() and removedAt()');
      }
      return !!(callbacks.addedAt || callbacks.changedAt || callbacks.movedTo || callbacks.removedAt);
    };
    LocalCollection._observeChangesCallbacksAreOrdered = callbacks => {
      if (callbacks.added && callbacks.addedBefore) {
        throw new Error('Please specify only one of added() and addedBefore()');
      }
      return !!(callbacks.addedBefore || callbacks.movedBefore);
    };
    LocalCollection._removeFromResultsSync = (query, doc) => {
      if (query.ordered) {
        const i = LocalCollection._findInOrderedResults(query, doc);
        query.removed(doc._id);
        query.results.splice(i, 1);
      } else {
        const id = doc._id; // in case callback mutates doc

        query.removed(doc._id);
        query.results.remove(id);
      }
    };
    LocalCollection._removeFromResultsAsync = async (query, doc) => {
      if (query.ordered) {
        const i = LocalCollection._findInOrderedResults(query, doc);
        await query.removed(doc._id);
        query.results.splice(i, 1);
      } else {
        const id = doc._id; // in case callback mutates doc

        await query.removed(doc._id);
        query.results.remove(id);
      }
    };

    // Is this selector just shorthand for lookup by _id?
    LocalCollection._selectorIsId = selector => typeof selector === 'number' || typeof selector === 'string' || selector instanceof MongoID.ObjectID;

    // Is the selector just lookup by _id (shorthand or not)?
    LocalCollection._selectorIsIdPerhapsAsObject = selector => LocalCollection._selectorIsId(selector) || LocalCollection._selectorIsId(selector && selector._id) && Object.keys(selector).length === 1;
    LocalCollection._updateInResultsSync = (query, doc, old_doc) => {
      if (!EJSON.equals(doc._id, old_doc._id)) {
        throw new Error('Can\'t change a doc\'s _id while updating');
      }
      const projectionFn = query.projectionFn;
      const changedFields = DiffSequence.makeChangedFields(projectionFn(doc), projectionFn(old_doc));
      if (!query.ordered) {
        if (Object.keys(changedFields).length) {
          query.changed(doc._id, changedFields);
          query.results.set(doc._id, doc);
        }
        return;
      }
      const old_idx = LocalCollection._findInOrderedResults(query, doc);
      if (Object.keys(changedFields).length) {
        query.changed(doc._id, changedFields);
      }
      if (!query.sorter) {
        return;
      }

      // just take it out and put it back in again, and see if the index changes
      query.results.splice(old_idx, 1);
      const new_idx = LocalCollection._insertInSortedList(query.sorter.getComparator({
        distances: query.distances
      }), query.results, doc);
      if (old_idx !== new_idx) {
        let next = query.results[new_idx + 1];
        if (next) {
          next = next._id;
        } else {
          next = null;
        }
        query.movedBefore && query.movedBefore(doc._id, next);
      }
    };
    LocalCollection._updateInResultsAsync = async (query, doc, old_doc) => {
      if (!EJSON.equals(doc._id, old_doc._id)) {
        throw new Error('Can\'t change a doc\'s _id while updating');
      }
      const projectionFn = query.projectionFn;
      const changedFields = DiffSequence.makeChangedFields(projectionFn(doc), projectionFn(old_doc));
      if (!query.ordered) {
        if (Object.keys(changedFields).length) {
          await query.changed(doc._id, changedFields);
          query.results.set(doc._id, doc);
        }
        return;
      }
      const old_idx = LocalCollection._findInOrderedResults(query, doc);
      if (Object.keys(changedFields).length) {
        await query.changed(doc._id, changedFields);
      }
      if (!query.sorter) {
        return;
      }

      // just take it out and put it back in again, and see if the index changes
      query.results.splice(old_idx, 1);
      const new_idx = LocalCollection._insertInSortedList(query.sorter.getComparator({
        distances: query.distances
      }), query.results, doc);
      if (old_idx !== new_idx) {
        let next = query.results[new_idx + 1];
        if (next) {
          next = next._id;
        } else {
          next = null;
        }
        query.movedBefore && (await query.movedBefore(doc._id, next));
      }
    };
    const MODIFIERS = {
      $currentDate(target, field, arg) {
        if (typeof arg === 'object' && hasOwn.call(arg, '$type')) {
          if (arg.$type !== 'date') {
            throw MinimongoError('Minimongo does currently only support the date type in ' + '$currentDate modifiers', {
              field
            });
          }
        } else if (arg !== true) {
          throw MinimongoError('Invalid $currentDate modifier', {
            field
          });
        }
        target[field] = new Date();
      },
      $inc(target, field, arg) {
        if (typeof arg !== 'number') {
          throw MinimongoError('Modifier $inc allowed for numbers only', {
            field
          });
        }
        if (field in target) {
          if (typeof target[field] !== 'number') {
            throw MinimongoError('Cannot apply $inc modifier to non-number', {
              field
            });
          }
          target[field] += arg;
        } else {
          target[field] = arg;
        }
      },
      $min(target, field, arg) {
        if (typeof arg !== 'number') {
          throw MinimongoError('Modifier $min allowed for numbers only', {
            field
          });
        }
        if (field in target) {
          if (typeof target[field] !== 'number') {
            throw MinimongoError('Cannot apply $min modifier to non-number', {
              field
            });
          }
          if (target[field] > arg) {
            target[field] = arg;
          }
        } else {
          target[field] = arg;
        }
      },
      $max(target, field, arg) {
        if (typeof arg !== 'number') {
          throw MinimongoError('Modifier $max allowed for numbers only', {
            field
          });
        }
        if (field in target) {
          if (typeof target[field] !== 'number') {
            throw MinimongoError('Cannot apply $max modifier to non-number', {
              field
            });
          }
          if (target[field] < arg) {
            target[field] = arg;
          }
        } else {
          target[field] = arg;
        }
      },
      $mul(target, field, arg) {
        if (typeof arg !== 'number') {
          throw MinimongoError('Modifier $mul allowed for numbers only', {
            field
          });
        }
        if (field in target) {
          if (typeof target[field] !== 'number') {
            throw MinimongoError('Cannot apply $mul modifier to non-number', {
              field
            });
          }
          target[field] *= arg;
        } else {
          target[field] = 0;
        }
      },
      $rename(target, field, arg, keypath, doc) {
        // no idea why mongo has this restriction..
        if (keypath === arg) {
          throw MinimongoError('$rename source must differ from target', {
            field
          });
        }
        if (target === null) {
          throw MinimongoError('$rename source field invalid', {
            field
          });
        }
        if (typeof arg !== 'string') {
          throw MinimongoError('$rename target must be a string', {
            field
          });
        }
        if (arg.includes('\0')) {
          // Null bytes are not allowed in Mongo field names
          // https://docs.mongodb.com/manual/reference/limits/#Restrictions-on-Field-Names
          throw MinimongoError('The \'to\' field for $rename cannot contain an embedded null byte', {
            field
          });
        }
        if (target === undefined) {
          return;
        }
        const object = target[field];
        delete target[field];
        const keyparts = arg.split('.');
        const target2 = findModTarget(doc, keyparts, {
          forbidArray: true
        });
        if (target2 === null) {
          throw MinimongoError('$rename target field invalid', {
            field
          });
        }
        target2[keyparts.pop()] = object;
      },
      $set(target, field, arg) {
        if (target !== Object(target)) {
          // not an array or an object
          const error = MinimongoError('Cannot set property on non-object field', {
            field
          });
          error.setPropertyError = true;
          throw error;
        }
        if (target === null) {
          const error = MinimongoError('Cannot set property on null', {
            field
          });
          error.setPropertyError = true;
          throw error;
        }
        assertHasValidFieldNames(arg);
        target[field] = arg;
      },
      $setOnInsert(target, field, arg) {
        // converted to `$set` in `_modify`
      },
      $unset(target, field, arg) {
        if (target !== undefined) {
          if (target instanceof Array) {
            if (field in target) {
              target[field] = null;
            }
          } else {
            delete target[field];
          }
        }
      },
      $push(target, field, arg) {
        if (target[field] === undefined) {
          target[field] = [];
        }
        if (!(target[field] instanceof Array)) {
          throw MinimongoError('Cannot apply $push modifier to non-array', {
            field
          });
        }
        if (!(arg && arg.$each)) {
          // Simple mode: not $each
          assertHasValidFieldNames(arg);
          target[field].push(arg);
          return;
        }

        // Fancy mode: $each (and maybe $slice and $sort and $position)
        const toPush = arg.$each;
        if (!(toPush instanceof Array)) {
          throw MinimongoError('$each must be an array', {
            field
          });
        }
        assertHasValidFieldNames(toPush);

        // Parse $position
        let position = undefined;
        if ('$position' in arg) {
          if (typeof arg.$position !== 'number') {
            throw MinimongoError('$position must be a numeric value', {
              field
            });
          }

          // XXX should check to make sure integer
          if (arg.$position < 0) {
            throw MinimongoError('$position in $push must be zero or positive', {
              field
            });
          }
          position = arg.$position;
        }

        // Parse $slice.
        let slice = undefined;
        if ('$slice' in arg) {
          if (typeof arg.$slice !== 'number') {
            throw MinimongoError('$slice must be a numeric value', {
              field
            });
          }

          // XXX should check to make sure integer
          slice = arg.$slice;
        }

        // Parse $sort.
        let sortFunction = undefined;
        if (arg.$sort) {
          if (slice === undefined) {
            throw MinimongoError('$sort requires $slice to be present', {
              field
            });
          }

          // XXX this allows us to use a $sort whose value is an array, but that's
          // actually an extension of the Node driver, so it won't work
          // server-side. Could be confusing!
          // XXX is it correct that we don't do geo-stuff here?
          sortFunction = new Minimongo.Sorter(arg.$sort).getComparator();
          toPush.forEach(element => {
            if (LocalCollection._f._type(element) !== 3) {
              throw MinimongoError('$push like modifiers using $sort require all elements to be ' + 'objects', {
                field
              });
            }
          });
        }

        // Actually push.
        if (position === undefined) {
          toPush.forEach(element => {
            target[field].push(element);
          });
        } else {
          const spliceArguments = [position, 0];
          toPush.forEach(element => {
            spliceArguments.push(element);
          });
          target[field].splice(...spliceArguments);
        }

        // Actually sort.
        if (sortFunction) {
          target[field].sort(sortFunction);
        }

        // Actually slice.
        if (slice !== undefined) {
          if (slice === 0) {
            target[field] = []; // differs from Array.slice!
          } else if (slice < 0) {
            target[field] = target[field].slice(slice);
          } else {
            target[field] = target[field].slice(0, slice);
          }
        }
      },
      $pushAll(target, field, arg) {
        if (!(typeof arg === 'object' && arg instanceof Array)) {
          throw MinimongoError('Modifier $pushAll/pullAll allowed for arrays only');
        }
        assertHasValidFieldNames(arg);
        const toPush = target[field];
        if (toPush === undefined) {
          target[field] = arg;
        } else if (!(toPush instanceof Array)) {
          throw MinimongoError('Cannot apply $pushAll modifier to non-array', {
            field
          });
        } else {
          toPush.push(...arg);
        }
      },
      $addToSet(target, field, arg) {
        let isEach = false;
        if (typeof arg === 'object') {
          // check if first key is '$each'
          const keys = Object.keys(arg);
          if (keys[0] === '$each') {
            isEach = true;
          }
        }
        const values = isEach ? arg.$each : [arg];
        assertHasValidFieldNames(values);
        const toAdd = target[field];
        if (toAdd === undefined) {
          target[field] = values;
        } else if (!(toAdd instanceof Array)) {
          throw MinimongoError('Cannot apply $addToSet modifier to non-array', {
            field
          });
        } else {
          values.forEach(value => {
            if (toAdd.some(element => LocalCollection._f._equal(value, element))) {
              return;
            }
            toAdd.push(value);
          });
        }
      },
      $pop(target, field, arg) {
        if (target === undefined) {
          return;
        }
        const toPop = target[field];
        if (toPop === undefined) {
          return;
        }
        if (!(toPop instanceof Array)) {
          throw MinimongoError('Cannot apply $pop modifier to non-array', {
            field
          });
        }
        if (typeof arg === 'number' && arg < 0) {
          toPop.splice(0, 1);
        } else {
          toPop.pop();
        }
      },
      $pull(target, field, arg) {
        if (target === undefined) {
          return;
        }
        const toPull = target[field];
        if (toPull === undefined) {
          return;
        }
        if (!(toPull instanceof Array)) {
          throw MinimongoError('Cannot apply $pull/pullAll modifier to non-array', {
            field
          });
        }
        let out;
        if (arg != null && typeof arg === 'object' && !(arg instanceof Array)) {
          // XXX would be much nicer to compile this once, rather than
          // for each document we modify.. but usually we're not
          // modifying that many documents, so we'll let it slide for
          // now

          // XXX Minimongo.Matcher isn't up for the job, because we need
          // to permit stuff like {$pull: {a: {$gt: 4}}}.. something
          // like {$gt: 4} is not normally a complete selector.
          // same issue as $elemMatch possibly?
          const matcher = new Minimongo.Matcher(arg);
          out = toPull.filter(element => !matcher.documentMatches(element).result);
        } else {
          out = toPull.filter(element => !LocalCollection._f._equal(element, arg));
        }
        target[field] = out;
      },
      $pullAll(target, field, arg) {
        if (!(typeof arg === 'object' && arg instanceof Array)) {
          throw MinimongoError('Modifier $pushAll/pullAll allowed for arrays only', {
            field
          });
        }
        if (target === undefined) {
          return;
        }
        const toPull = target[field];
        if (toPull === undefined) {
          return;
        }
        if (!(toPull instanceof Array)) {
          throw MinimongoError('Cannot apply $pull/pullAll modifier to non-array', {
            field
          });
        }
        target[field] = toPull.filter(object => !arg.some(element => LocalCollection._f._equal(object, element)));
      },
      $bit(target, field, arg) {
        // XXX mongo only supports $bit on integers, and we only support
        // native javascript numbers (doubles) so far, so we can't support $bit
        throw MinimongoError('$bit is not supported', {
          field
        });
      },
      $v() {
        // As discussed in https://github.com/meteor/meteor/issues/9623,
        // the `$v` operator is not needed by Meteor, but problems can occur if
        // it's not at least callable (as of Mongo >= 3.6). It's defined here as
        // a no-op to work around these problems.
      }
    };
    const NO_CREATE_MODIFIERS = {
      $pop: true,
      $pull: true,
      $pullAll: true,
      $rename: true,
      $unset: true
    };

    // Make sure field names do not contain Mongo restricted
    // characters ('.', '$', '\0').
    // https://docs.mongodb.com/manual/reference/limits/#Restrictions-on-Field-Names
    const invalidCharMsg = {
      $: 'start with \'$\'',
      '.': 'contain \'.\'',
      '\0': 'contain null bytes'
    };

    // checks if all field names in an object are valid
    function assertHasValidFieldNames(doc) {
      if (doc && typeof doc === 'object') {
        JSON.stringify(doc, (key, value) => {
          assertIsValidFieldName(key);
          return value;
        });
      }
    }
    function assertIsValidFieldName(key) {
      let match;
      if (typeof key === 'string' && (match = key.match(/^\$|\.|\0/))) {
        throw MinimongoError("Key ".concat(key, " must not ").concat(invalidCharMsg[match[0]]));
      }
    }

    // for a.b.c.2.d.e, keyparts should be ['a', 'b', 'c', '2', 'd', 'e'],
    // and then you would operate on the 'e' property of the returned
    // object.
    //
    // if options.noCreate is falsey, creates intermediate levels of
    // structure as necessary, like mkdir -p (and raises an exception if
    // that would mean giving a non-numeric property to an array.) if
    // options.noCreate is true, return undefined instead.
    //
    // may modify the last element of keyparts to signal to the caller that it needs
    // to use a different value to index into the returned object (for example,
    // ['a', '01'] -> ['a', 1]).
    //
    // if forbidArray is true, return null if the keypath goes through an array.
    //
    // if options.arrayIndices is set, use its first element for the (first) '$' in
    // the path.
    function findModTarget(doc, keyparts) {
      let options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      let usedArrayIndex = false;
      for (let i = 0; i < keyparts.length; i++) {
        const last = i === keyparts.length - 1;
        let keypart = keyparts[i];
        if (!isIndexable(doc)) {
          if (options.noCreate) {
            return undefined;
          }
          const error = MinimongoError("cannot use the part '".concat(keypart, "' to traverse ").concat(doc));
          error.setPropertyError = true;
          throw error;
        }
        if (doc instanceof Array) {
          if (options.forbidArray) {
            return null;
          }
          if (keypart === '$') {
            if (usedArrayIndex) {
              throw MinimongoError('Too many positional (i.e. \'$\') elements');
            }
            if (!options.arrayIndices || !options.arrayIndices.length) {
              throw MinimongoError('The positional operator did not find the match needed from the ' + 'query');
            }
            keypart = options.arrayIndices[0];
            usedArrayIndex = true;
          } else if (isNumericKey(keypart)) {
            keypart = parseInt(keypart);
          } else {
            if (options.noCreate) {
              return undefined;
            }
            throw MinimongoError("can't append to array using string field name [".concat(keypart, "]"));
          }
          if (last) {
            keyparts[i] = keypart; // handle 'a.01'
          }
          if (options.noCreate && keypart >= doc.length) {
            return undefined;
          }
          while (doc.length < keypart) {
            doc.push(null);
          }
          if (!last) {
            if (doc.length === keypart) {
              doc.push({});
            } else if (typeof doc[keypart] !== 'object') {
              throw MinimongoError("can't modify field '".concat(keyparts[i + 1], "' of list value ") + JSON.stringify(doc[keypart]));
            }
          }
        } else {
          assertIsValidFieldName(keypart);
          if (!(keypart in doc)) {
            if (options.noCreate) {
              return undefined;
            }
            if (!last) {
              doc[keypart] = {};
            }
          }
        }
        if (last) {
          return doc;
        }
        doc = doc[keypart];
      }

      // notreached
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
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"matcher.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// packages/minimongo/matcher.js                                                                                     //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    var _Package$mongoDecima;
    module.export({
      default: () => Matcher
    });
    let LocalCollection;
    module.link("./local_collection.js", {
      default(v) {
        LocalCollection = v;
      }
    }, 0);
    let compileDocumentSelector, hasOwn, nothingMatcher;
    module.link("./common.js", {
      compileDocumentSelector(v) {
        compileDocumentSelector = v;
      },
      hasOwn(v) {
        hasOwn = v;
      },
      nothingMatcher(v) {
        nothingMatcher = v;
      }
    }, 1);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    const Decimal = ((_Package$mongoDecima = Package['mongo-decimal']) === null || _Package$mongoDecima === void 0 ? void 0 : _Package$mongoDecima.Decimal) || class DecimalStub {};

    // The minimongo selector compiler!

    // Terminology:
    //  - a 'selector' is the EJSON object representing a selector
    //  - a 'matcher' is its compiled form (whether a full Minimongo.Matcher
    //    object or one of the component lambdas that matches parts of it)
    //  - a 'result object' is an object with a 'result' field and maybe
    //    distance and arrayIndices.
    //  - a 'branched value' is an object with a 'value' field and maybe
    //    'dontIterate' and 'arrayIndices'.
    //  - a 'document' is a top-level object that can be stored in a collection.
    //  - a 'lookup function' is a function that takes in a document and returns
    //    an array of 'branched values'.
    //  - a 'branched matcher' maps from an array of branched values to a result
    //    object.
    //  - an 'element matcher' maps from a single value to a bool.

    // Main entry point.
    //   var matcher = new Minimongo.Matcher({a: {$gt: 5}});
    //   if (matcher.documentMatches({a: 7})) ...
    class Matcher {
      constructor(selector, isUpdate) {
        // A set (object mapping string -> *) of all of the document paths looked
        // at by the selector. Also includes the empty string if it may look at any
        // path (eg, $where).
        this._paths = {};
        // Set to true if compilation finds a $near.
        this._hasGeoQuery = false;
        // Set to true if compilation finds a $where.
        this._hasWhere = false;
        // Set to false if compilation finds anything other than a simple equality
        // or one or more of '$gt', '$gte', '$lt', '$lte', '$ne', '$in', '$nin' used
        // with scalars as operands.
        this._isSimple = true;
        // Set to a dummy document which always matches this Matcher. Or set to null
        // if such document is too hard to find.
        this._matchingDocument = undefined;
        // A clone of the original selector. It may just be a function if the user
        // passed in a function; otherwise is definitely an object (eg, IDs are
        // translated into {_id: ID} first. Used by canBecomeTrueByModifier and
        // Sorter._useWithMatcher.
        this._selector = null;
        this._docMatcher = this._compileSelector(selector);
        // Set to true if selection is done for an update operation
        // Default is false
        // Used for $near array update (issue #3599)
        this._isUpdate = isUpdate;
      }
      documentMatches(doc) {
        if (doc !== Object(doc)) {
          throw Error('documentMatches needs a document');
        }
        return this._docMatcher(doc);
      }
      hasGeoQuery() {
        return this._hasGeoQuery;
      }
      hasWhere() {
        return this._hasWhere;
      }
      isSimple() {
        return this._isSimple;
      }

      // Given a selector, return a function that takes one argument, a
      // document. It returns a result object.
      _compileSelector(selector) {
        // you can pass a literal function instead of a selector
        if (selector instanceof Function) {
          this._isSimple = false;
          this._selector = selector;
          this._recordPathUsed('');
          return doc => ({
            result: !!selector.call(doc)
          });
        }

        // shorthand -- scalar _id
        if (LocalCollection._selectorIsId(selector)) {
          this._selector = {
            _id: selector
          };
          this._recordPathUsed('_id');
          return doc => ({
            result: EJSON.equals(doc._id, selector)
          });
        }

        // protect against dangerous selectors.  falsey and {_id: falsey} are both
        // likely programmer error, and not what you want, particularly for
        // destructive operations.
        if (!selector || hasOwn.call(selector, '_id') && !selector._id) {
          this._isSimple = false;
          return nothingMatcher;
        }

        // Top level can't be an array or true or binary.
        if (Array.isArray(selector) || EJSON.isBinary(selector) || typeof selector === 'boolean') {
          throw new Error("Invalid selector: ".concat(selector));
        }
        this._selector = EJSON.clone(selector);
        return compileDocumentSelector(selector, this, {
          isRoot: true
        });
      }

      // Returns a list of key paths the given selector is looking for. It includes
      // the empty string if there is a $where.
      _getPaths() {
        return Object.keys(this._paths);
      }
      _recordPathUsed(path) {
        this._paths[path] = true;
      }
    }
    // helpers used by compiled selector code
    LocalCollection._f = {
      // XXX for _all and _in, consider building 'inquery' at compile time..
      _type(v) {
        if (typeof v === 'number') {
          return 1;
        }
        if (typeof v === 'string') {
          return 2;
        }
        if (typeof v === 'boolean') {
          return 8;
        }
        if (Array.isArray(v)) {
          return 4;
        }
        if (v === null) {
          return 10;
        }

        // note that typeof(/x/) === "object"
        if (v instanceof RegExp) {
          return 11;
        }
        if (typeof v === 'function') {
          return 13;
        }
        if (v instanceof Date) {
          return 9;
        }
        if (EJSON.isBinary(v)) {
          return 5;
        }
        if (v instanceof MongoID.ObjectID) {
          return 7;
        }
        if (v instanceof Decimal) {
          return 1;
        }

        // object
        return 3;

        // XXX support some/all of these:
        // 14, symbol
        // 15, javascript code with scope
        // 16, 18: 32-bit/64-bit integer
        // 17, timestamp
        // 255, minkey
        // 127, maxkey
      },
      // deep equality test: use for literal document and array matches
      _equal(a, b) {
        return EJSON.equals(a, b, {
          keyOrderSensitive: true
        });
      },
      // maps a type code to a value that can be used to sort values of different
      // types
      _typeorder(t) {
        // http://www.mongodb.org/display/DOCS/What+is+the+Compare+Order+for+BSON+Types
        // XXX what is the correct sort position for Javascript code?
        // ('100' in the matrix below)
        // XXX minkey/maxkey
        return [-1,
        // (not a type)
        1,
        // number
        2,
        // string
        3,
        // object
        4,
        // array
        5,
        // binary
        -1,
        // deprecated
        6,
        // ObjectID
        7,
        // bool
        8,
        // Date
        0,
        // null
        9,
        // RegExp
        -1,
        // deprecated
        100,
        // JS code
        2,
        // deprecated (symbol)
        100,
        // JS code
        1,
        // 32-bit int
        8,
        // Mongo timestamp
        1 // 64-bit int
        ][t];
      },
      // compare two values of unknown type according to BSON ordering
      // semantics. (as an extension, consider 'undefined' to be less than
      // any other value.) return negative if a is less, positive if b is
      // less, or 0 if equal
      _cmp(a, b) {
        if (a === undefined) {
          return b === undefined ? 0 : -1;
        }
        if (b === undefined) {
          return 1;
        }
        let ta = LocalCollection._f._type(a);
        let tb = LocalCollection._f._type(b);
        const oa = LocalCollection._f._typeorder(ta);
        const ob = LocalCollection._f._typeorder(tb);
        if (oa !== ob) {
          return oa < ob ? -1 : 1;
        }

        // XXX need to implement this if we implement Symbol or integers, or
        // Timestamp
        if (ta !== tb) {
          throw Error('Missing type coercion logic in _cmp');
        }
        if (ta === 7) {
          // ObjectID
          // Convert to string.
          ta = tb = 2;
          a = a.toHexString();
          b = b.toHexString();
        }
        if (ta === 9) {
          // Date
          // Convert to millis.
          ta = tb = 1;
          a = isNaN(a) ? 0 : a.getTime();
          b = isNaN(b) ? 0 : b.getTime();
        }
        if (ta === 1) {
          // double
          if (a instanceof Decimal) {
            return a.minus(b).toNumber();
          } else {
            return a - b;
          }
        }
        if (tb === 2)
          // string
          return a < b ? -1 : a === b ? 0 : 1;
        if (ta === 3) {
          // Object
          // this could be much more efficient in the expected case ...
          const toArray = object => {
            const result = [];
            Object.keys(object).forEach(key => {
              result.push(key, object[key]);
            });
            return result;
          };
          return LocalCollection._f._cmp(toArray(a), toArray(b));
        }
        if (ta === 4) {
          // Array
          for (let i = 0;; i++) {
            if (i === a.length) {
              return i === b.length ? 0 : -1;
            }
            if (i === b.length) {
              return 1;
            }
            const s = LocalCollection._f._cmp(a[i], b[i]);
            if (s !== 0) {
              return s;
            }
          }
        }
        if (ta === 5) {
          // binary
          // Surprisingly, a small binary blob is always less than a large one in
          // Mongo.
          if (a.length !== b.length) {
            return a.length - b.length;
          }
          for (let i = 0; i < a.length; i++) {
            if (a[i] < b[i]) {
              return -1;
            }
            if (a[i] > b[i]) {
              return 1;
            }
          }
          return 0;
        }
        if (ta === 8) {
          // boolean
          if (a) {
            return b ? 0 : 1;
          }
          return b ? -1 : 0;
        }
        if (ta === 10)
          // null
          return 0;
        if (ta === 11)
          // regexp
          throw Error('Sorting not supported on regular expression'); // XXX

        // 13: javascript code
        // 14: symbol
        // 15: javascript code with scope
        // 16: 32-bit integer
        // 17: timestamp
        // 18: 64-bit integer
        // 255: minkey
        // 127: maxkey
        if (ta === 13)
          // javascript code
          throw Error('Sorting not supported on Javascript code'); // XXX

        throw Error('Unknown type to sort');
      }
    };
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

},"minimongo_common.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// packages/minimongo/minimongo_common.js                                                                            //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    let LocalCollection_;
    module.link("./local_collection.js", {
      default(v) {
        LocalCollection_ = v;
      }
    }, 0);
    let Matcher;
    module.link("./matcher.js", {
      default(v) {
        Matcher = v;
      }
    }, 1);
    let Sorter;
    module.link("./sorter.js", {
      default(v) {
        Sorter = v;
      }
    }, 2);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    LocalCollection = LocalCollection_;
    Minimongo = {
      LocalCollection: LocalCollection_,
      Matcher,
      Sorter
    };
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

},"observe_handle.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// packages/minimongo/observe_handle.js                                                                              //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
module.export({
  default: () => ObserveHandle
});
class ObserveHandle {}
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"sorter.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// packages/minimongo/sorter.js                                                                                      //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      default: () => Sorter
    });
    let ELEMENT_OPERATORS, equalityElementMatcher, expandArraysInBranches, hasOwn, isOperatorObject, makeLookupFunction, regexpElementMatcher;
    module.link("./common.js", {
      ELEMENT_OPERATORS(v) {
        ELEMENT_OPERATORS = v;
      },
      equalityElementMatcher(v) {
        equalityElementMatcher = v;
      },
      expandArraysInBranches(v) {
        expandArraysInBranches = v;
      },
      hasOwn(v) {
        hasOwn = v;
      },
      isOperatorObject(v) {
        isOperatorObject = v;
      },
      makeLookupFunction(v) {
        makeLookupFunction = v;
      },
      regexpElementMatcher(v) {
        regexpElementMatcher = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    class Sorter {
      constructor(spec) {
        this._sortSpecParts = [];
        this._sortFunction = null;
        const addSpecPart = (path, ascending) => {
          if (!path) {
            throw Error('sort keys must be non-empty');
          }
          if (path.charAt(0) === '$') {
            throw Error("unsupported sort key: ".concat(path));
          }
          this._sortSpecParts.push({
            ascending,
            lookup: makeLookupFunction(path, {
              forSort: true
            }),
            path
          });
        };
        if (spec instanceof Array) {
          spec.forEach(element => {
            if (typeof element === 'string') {
              addSpecPart(element, true);
            } else {
              addSpecPart(element[0], element[1] !== 'desc');
            }
          });
        } else if (typeof spec === 'object') {
          Object.keys(spec).forEach(key => {
            addSpecPart(key, spec[key] >= 0);
          });
        } else if (typeof spec === 'function') {
          this._sortFunction = spec;
        } else {
          throw Error("Bad sort specification: ".concat(JSON.stringify(spec)));
        }

        // If a function is specified for sorting, we skip the rest.
        if (this._sortFunction) {
          return;
        }

        // To implement affectedByModifier, we piggy-back on top of Matcher's
        // affectedByModifier code; we create a selector that is affected by the
        // same modifiers as this sort order. This is only implemented on the
        // server.
        if (this.affectedByModifier) {
          const selector = {};
          this._sortSpecParts.forEach(spec => {
            selector[spec.path] = 1;
          });
          this._selectorForAffectedByModifier = new Minimongo.Matcher(selector);
        }
        this._keyComparator = composeComparators(this._sortSpecParts.map((spec, i) => this._keyFieldComparator(i)));
      }
      getComparator(options) {
        // If sort is specified or have no distances, just use the comparator from
        // the source specification (which defaults to "everything is equal".
        // issue #3599
        // https://docs.mongodb.com/manual/reference/operator/query/near/#sort-operation
        // sort effectively overrides $near
        if (this._sortSpecParts.length || !options || !options.distances) {
          return this._getBaseComparator();
        }
        const distances = options.distances;

        // Return a comparator which compares using $near distances.
        return (a, b) => {
          if (!distances.has(a._id)) {
            throw Error("Missing distance for ".concat(a._id));
          }
          if (!distances.has(b._id)) {
            throw Error("Missing distance for ".concat(b._id));
          }
          return distances.get(a._id) - distances.get(b._id);
        };
      }

      // Takes in two keys: arrays whose lengths match the number of spec
      // parts. Returns negative, 0, or positive based on using the sort spec to
      // compare fields.
      _compareKeys(key1, key2) {
        if (key1.length !== this._sortSpecParts.length || key2.length !== this._sortSpecParts.length) {
          throw Error('Key has wrong length');
        }
        return this._keyComparator(key1, key2);
      }

      // Iterates over each possible "key" from doc (ie, over each branch), calling
      // 'cb' with the key.
      _generateKeysFromDoc(doc, cb) {
        if (this._sortSpecParts.length === 0) {
          throw new Error('can\'t generate keys without a spec');
        }
        const pathFromIndices = indices => "".concat(indices.join(','), ",");
        let knownPaths = null;

        // maps index -> ({'' -> value} or {path -> value})
        const valuesByIndexAndPath = this._sortSpecParts.map(spec => {
          // Expand any leaf arrays that we find, and ignore those arrays
          // themselves.  (We never sort based on an array itself.)
          let branches = expandArraysInBranches(spec.lookup(doc), true);

          // If there are no values for a key (eg, key goes to an empty array),
          // pretend we found one undefined value.
          if (!branches.length) {
            branches = [{
              value: void 0
            }];
          }
          const element = Object.create(null);
          let usedPaths = false;
          branches.forEach(branch => {
            if (!branch.arrayIndices) {
              // If there are no array indices for a branch, then it must be the
              // only branch, because the only thing that produces multiple branches
              // is the use of arrays.
              if (branches.length > 1) {
                throw Error('multiple branches but no array used?');
              }
              element[''] = branch.value;
              return;
            }
            usedPaths = true;
            const path = pathFromIndices(branch.arrayIndices);
            if (hasOwn.call(element, path)) {
              throw Error("duplicate path: ".concat(path));
            }
            element[path] = branch.value;

            // If two sort fields both go into arrays, they have to go into the
            // exact same arrays and we have to find the same paths.  This is
            // roughly the same condition that makes MongoDB throw this strange
            // error message.  eg, the main thing is that if sort spec is {a: 1,
            // b:1} then a and b cannot both be arrays.
            //
            // (In MongoDB it seems to be OK to have {a: 1, 'a.x.y': 1} where 'a'
            // and 'a.x.y' are both arrays, but we don't allow this for now.
            // #NestedArraySort
            // XXX achieve full compatibility here
            if (knownPaths && !hasOwn.call(knownPaths, path)) {
              throw Error('cannot index parallel arrays');
            }
          });
          if (knownPaths) {
            // Similarly to above, paths must match everywhere, unless this is a
            // non-array field.
            if (!hasOwn.call(element, '') && Object.keys(knownPaths).length !== Object.keys(element).length) {
              throw Error('cannot index parallel arrays!');
            }
          } else if (usedPaths) {
            knownPaths = {};
            Object.keys(element).forEach(path => {
              knownPaths[path] = true;
            });
          }
          return element;
        });
        if (!knownPaths) {
          // Easy case: no use of arrays.
          const soleKey = valuesByIndexAndPath.map(values => {
            if (!hasOwn.call(values, '')) {
              throw Error('no value in sole key case?');
            }
            return values[''];
          });
          cb(soleKey);
          return;
        }
        Object.keys(knownPaths).forEach(path => {
          const key = valuesByIndexAndPath.map(values => {
            if (hasOwn.call(values, '')) {
              return values[''];
            }
            if (!hasOwn.call(values, path)) {
              throw Error('missing path?');
            }
            return values[path];
          });
          cb(key);
        });
      }

      // Returns a comparator that represents the sort specification (but not
      // including a possible geoquery distance tie-breaker).
      _getBaseComparator() {
        if (this._sortFunction) {
          return this._sortFunction;
        }

        // If we're only sorting on geoquery distance and no specs, just say
        // everything is equal.
        if (!this._sortSpecParts.length) {
          return (doc1, doc2) => 0;
        }
        return (doc1, doc2) => {
          const key1 = this._getMinKeyFromDoc(doc1);
          const key2 = this._getMinKeyFromDoc(doc2);
          return this._compareKeys(key1, key2);
        };
      }

      // Finds the minimum key from the doc, according to the sort specs.  (We say
      // "minimum" here but this is with respect to the sort spec, so "descending"
      // sort fields mean we're finding the max for that field.)
      //
      // Note that this is NOT "find the minimum value of the first field, the
      // minimum value of the second field, etc"... it's "choose the
      // lexicographically minimum value of the key vector, allowing only keys which
      // you can find along the same paths".  ie, for a doc {a: [{x: 0, y: 5}, {x:
      // 1, y: 3}]} with sort spec {'a.x': 1, 'a.y': 1}, the only keys are [0,5] and
      // [1,3], and the minimum key is [0,5]; notably, [0,3] is NOT a key.
      _getMinKeyFromDoc(doc) {
        let minKey = null;
        this._generateKeysFromDoc(doc, key => {
          if (minKey === null) {
            minKey = key;
            return;
          }
          if (this._compareKeys(key, minKey) < 0) {
            minKey = key;
          }
        });
        return minKey;
      }
      _getPaths() {
        return this._sortSpecParts.map(part => part.path);
      }

      // Given an index 'i', returns a comparator that compares two key arrays based
      // on field 'i'.
      _keyFieldComparator(i) {
        const invert = !this._sortSpecParts[i].ascending;
        return (key1, key2) => {
          const compare = LocalCollection._f._cmp(key1[i], key2[i]);
          return invert ? -compare : compare;
        };
      }
    }
    // Given an array of comparators
    // (functions (a,b)->(negative or positive or zero)), returns a single
    // comparator which uses each comparator in order and returns the first
    // non-zero value.
    function composeComparators(comparatorArray) {
      return (a, b) => {
        for (let i = 0; i < comparatorArray.length; ++i) {
          const compare = comparatorArray[i](a, b);
          if (compare !== 0) {
            return compare;
          }
        }
        return 0;
      };
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
      LocalCollection: LocalCollection,
      Minimongo: Minimongo,
      MinimongoTest: MinimongoTest,
      MinimongoError: MinimongoError
    };},
  require: require,
  eagerModulePaths: [
    "/node_modules/meteor/minimongo/minimongo_server.js"
  ],
  mainModulePath: "/node_modules/meteor/minimongo/minimongo_server.js"
}});

//# sourceURL=meteor://💻app/packages/minimongo.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvbWluaW1vbmdvL21pbmltb25nb19zZXJ2ZXIuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21pbmltb25nby9jb21tb24uanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21pbmltb25nby9jb25zdGFudHMuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21pbmltb25nby9jdXJzb3IuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21pbmltb25nby9sb2NhbF9jb2xsZWN0aW9uLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9taW5pbW9uZ28vbWF0Y2hlci5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvbWluaW1vbmdvL21pbmltb25nb19jb21tb24uanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21pbmltb25nby9vYnNlcnZlX2hhbmRsZS5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvbWluaW1vbmdvL3NvcnRlci5qcyJdLCJuYW1lcyI6WyJtb2R1bGUiLCJsaW5rIiwiaGFzT3duIiwiaXNOdW1lcmljS2V5IiwiaXNPcGVyYXRvck9iamVjdCIsInBhdGhzVG9UcmVlIiwicHJvamVjdGlvbkRldGFpbHMiLCJ2IiwiX19yZWlmeVdhaXRGb3JEZXBzX18iLCJNaW5pbW9uZ28iLCJfcGF0aHNFbGlkaW5nTnVtZXJpY0tleXMiLCJwYXRocyIsIm1hcCIsInBhdGgiLCJzcGxpdCIsImZpbHRlciIsInBhcnQiLCJqb2luIiwiTWF0Y2hlciIsInByb3RvdHlwZSIsImFmZmVjdGVkQnlNb2RpZmllciIsIm1vZGlmaWVyIiwiT2JqZWN0IiwiYXNzaWduIiwiJHNldCIsIiR1bnNldCIsIm1lYW5pbmdmdWxQYXRocyIsIl9nZXRQYXRocyIsIm1vZGlmaWVkUGF0aHMiLCJjb25jYXQiLCJrZXlzIiwic29tZSIsIm1vZCIsIm1lYW5pbmdmdWxQYXRoIiwic2VsIiwiaSIsImoiLCJsZW5ndGgiLCJjYW5CZWNvbWVUcnVlQnlNb2RpZmllciIsImlzU2ltcGxlIiwibW9kaWZpZXJQYXRocyIsInBhdGhIYXNOdW1lcmljS2V5cyIsImV4cGVjdGVkU2NhbGFySXNPYmplY3QiLCJfc2VsZWN0b3IiLCJtb2RpZmllclBhdGgiLCJzdGFydHNXaXRoIiwibWF0Y2hpbmdEb2N1bWVudCIsIkVKU09OIiwiY2xvbmUiLCJMb2NhbENvbGxlY3Rpb24iLCJfbW9kaWZ5IiwiZXJyb3IiLCJuYW1lIiwic2V0UHJvcGVydHlFcnJvciIsImRvY3VtZW50TWF0Y2hlcyIsInJlc3VsdCIsImNvbWJpbmVJbnRvUHJvamVjdGlvbiIsInByb2plY3Rpb24iLCJzZWxlY3RvclBhdGhzIiwiaW5jbHVkZXMiLCJjb21iaW5lSW1wb3J0YW50UGF0aHNJbnRvUHJvamVjdGlvbiIsIl9tYXRjaGluZ0RvY3VtZW50IiwidW5kZWZpbmVkIiwiZmFsbGJhY2siLCJ2YWx1ZVNlbGVjdG9yIiwiJGVxIiwiJGluIiwibWF0Y2hlciIsInBsYWNlaG9sZGVyIiwiZmluZCIsIm9ubHlDb250YWluc0tleXMiLCJsb3dlckJvdW5kIiwiSW5maW5pdHkiLCJ1cHBlckJvdW5kIiwiZm9yRWFjaCIsIm9wIiwiY2FsbCIsIm1pZGRsZSIsIngiLCJTb3J0ZXIiLCJfc2VsZWN0b3JGb3JBZmZlY3RlZEJ5TW9kaWZpZXIiLCJkZXRhaWxzIiwidHJlZSIsIm5vZGUiLCJmdWxsUGF0aCIsIm1lcmdlZFByb2plY3Rpb24iLCJ0cmVlVG9QYXRocyIsImluY2x1ZGluZyIsIm1lcmdlZEV4Y2xQcm9qZWN0aW9uIiwiZ2V0UGF0aHMiLCJzZWxlY3RvciIsIl9wYXRocyIsIm9iaiIsImV2ZXJ5IiwiayIsInByZWZpeCIsImFyZ3VtZW50cyIsImtleSIsInZhbHVlIiwiX19yZWlmeV9hc3luY19yZXN1bHRfXyIsIl9yZWlmeUVycm9yIiwic2VsZiIsImFzeW5jIiwiZXhwb3J0IiwiRUxFTUVOVF9PUEVSQVRPUlMiLCJjb21waWxlRG9jdW1lbnRTZWxlY3RvciIsImVxdWFsaXR5RWxlbWVudE1hdGNoZXIiLCJleHBhbmRBcnJheXNJbkJyYW5jaGVzIiwiaXNJbmRleGFibGUiLCJtYWtlTG9va3VwRnVuY3Rpb24iLCJub3RoaW5nTWF0Y2hlciIsInBvcHVsYXRlRG9jdW1lbnRXaXRoUXVlcnlGaWVsZHMiLCJyZWdleHBFbGVtZW50TWF0Y2hlciIsImRlZmF1bHQiLCJoYXNPd25Qcm9wZXJ0eSIsIiRsdCIsIm1ha2VJbmVxdWFsaXR5IiwiY21wVmFsdWUiLCIkZ3QiLCIkbHRlIiwiJGd0ZSIsIiRtb2QiLCJjb21waWxlRWxlbWVudFNlbGVjdG9yIiwib3BlcmFuZCIsIkFycmF5IiwiaXNBcnJheSIsIkVycm9yIiwiZGl2aXNvciIsInJlbWFpbmRlciIsImVsZW1lbnRNYXRjaGVycyIsIm9wdGlvbiIsIlJlZ0V4cCIsIiRzaXplIiwiZG9udEV4cGFuZExlYWZBcnJheXMiLCIkdHlwZSIsImRvbnRJbmNsdWRlTGVhZkFycmF5cyIsIm9wZXJhbmRBbGlhc01hcCIsIl9mIiwiX3R5cGUiLCIkYml0c0FsbFNldCIsIm1hc2siLCJnZXRPcGVyYW5kQml0bWFzayIsImJpdG1hc2siLCJnZXRWYWx1ZUJpdG1hc2siLCJieXRlIiwiJGJpdHNBbnlTZXQiLCIkYml0c0FsbENsZWFyIiwiJGJpdHNBbnlDbGVhciIsIiRyZWdleCIsInJlZ2V4cCIsIiRvcHRpb25zIiwidGVzdCIsInNvdXJjZSIsIiRlbGVtTWF0Y2giLCJfaXNQbGFpbk9iamVjdCIsImlzRG9jTWF0Y2hlciIsIkxPR0lDQUxfT1BFUkFUT1JTIiwicmVkdWNlIiwiYSIsImIiLCJzdWJNYXRjaGVyIiwiaW5FbGVtTWF0Y2giLCJjb21waWxlVmFsdWVTZWxlY3RvciIsImFycmF5RWxlbWVudCIsImFyZyIsImRvbnRJdGVyYXRlIiwiJGFuZCIsInN1YlNlbGVjdG9yIiwiYW5kRG9jdW1lbnRNYXRjaGVycyIsImNvbXBpbGVBcnJheU9mRG9jdW1lbnRTZWxlY3RvcnMiLCIkb3IiLCJtYXRjaGVycyIsImRvYyIsImZuIiwiJG5vciIsIiR3aGVyZSIsInNlbGVjdG9yVmFsdWUiLCJfcmVjb3JkUGF0aFVzZWQiLCJfaGFzV2hlcmUiLCJGdW5jdGlvbiIsIiRjb21tZW50IiwiVkFMVUVfT1BFUkFUT1JTIiwiY29udmVydEVsZW1lbnRNYXRjaGVyVG9CcmFuY2hlZE1hdGNoZXIiLCIkbm90IiwiaW52ZXJ0QnJhbmNoZWRNYXRjaGVyIiwiJG5lIiwiJG5pbiIsIiRleGlzdHMiLCJleGlzdHMiLCJldmVyeXRoaW5nTWF0Y2hlciIsIiRtYXhEaXN0YW5jZSIsIiRuZWFyIiwiJGFsbCIsImJyYW5jaGVkTWF0Y2hlcnMiLCJjcml0ZXJpb24iLCJhbmRCcmFuY2hlZE1hdGNoZXJzIiwiaXNSb290IiwiX2hhc0dlb1F1ZXJ5IiwibWF4RGlzdGFuY2UiLCJwb2ludCIsImRpc3RhbmNlIiwiJGdlb21ldHJ5IiwidHlwZSIsIkdlb0pTT04iLCJwb2ludERpc3RhbmNlIiwiY29vcmRpbmF0ZXMiLCJwb2ludFRvQXJyYXkiLCJnZW9tZXRyeVdpdGhpblJhZGl1cyIsImRpc3RhbmNlQ29vcmRpbmF0ZVBhaXJzIiwiYnJhbmNoZWRWYWx1ZXMiLCJicmFuY2giLCJjdXJEaXN0YW5jZSIsIl9pc1VwZGF0ZSIsImFycmF5SW5kaWNlcyIsImFuZFNvbWVNYXRjaGVycyIsInN1Yk1hdGNoZXJzIiwiZG9jT3JCcmFuY2hlcyIsIm1hdGNoIiwic3ViUmVzdWx0Iiwic2VsZWN0b3JzIiwiZG9jU2VsZWN0b3IiLCJvcHRpb25zIiwiZG9jTWF0Y2hlcnMiLCJzdWJzdHIiLCJfaXNTaW1wbGUiLCJsb29rVXBCeUluZGV4IiwidmFsdWVNYXRjaGVyIiwiQm9vbGVhbiIsIm9wZXJhdG9yQnJhbmNoZWRNYXRjaGVyIiwiZWxlbWVudE1hdGNoZXIiLCJicmFuY2hlcyIsImV4cGFuZGVkIiwiZWxlbWVudCIsIm1hdGNoZWQiLCJwb2ludEEiLCJwb2ludEIiLCJNYXRoIiwiaHlwb3QiLCJlbGVtZW50U2VsZWN0b3IiLCJfZXF1YWwiLCJkb2NPckJyYW5jaGVkVmFsdWVzIiwic2tpcFRoZUFycmF5cyIsImJyYW5jaGVzT3V0IiwidGhpc0lzQXJyYXkiLCJwdXNoIiwiTnVtYmVyIiwiaXNJbnRlZ2VyIiwiVWludDhBcnJheSIsIkludDMyQXJyYXkiLCJidWZmZXIiLCJpc0JpbmFyeSIsIkFycmF5QnVmZmVyIiwibWF4IiwidmlldyIsImlzU2FmZUludGVnZXIiLCJVaW50MzJBcnJheSIsIkJZVEVTX1BFUl9FTEVNRU5UIiwiaW5zZXJ0SW50b0RvY3VtZW50IiwiZG9jdW1lbnQiLCJleGlzdGluZ0tleSIsImluZGV4T2YiLCJicmFuY2hlZE1hdGNoZXIiLCJicmFuY2hWYWx1ZXMiLCJzIiwiaW5jb25zaXN0ZW50T0siLCJ0aGVzZUFyZU9wZXJhdG9ycyIsInNlbEtleSIsInRoaXNJc09wZXJhdG9yIiwiSlNPTiIsInN0cmluZ2lmeSIsImNtcFZhbHVlQ29tcGFyYXRvciIsIm9wZXJhbmRUeXBlIiwiX2NtcCIsInBhcnRzIiwiZmlyc3RQYXJ0IiwibG9va3VwUmVzdCIsInNsaWNlIiwiYnVpbGRSZXN1bHQiLCJmaXJzdExldmVsIiwiYXBwZW5kVG9SZXN1bHQiLCJtb3JlIiwiZm9yU29ydCIsImFycmF5SW5kZXgiLCJNaW5pbW9uZ29UZXN0IiwiTWluaW1vbmdvRXJyb3IiLCJtZXNzYWdlIiwiZmllbGQiLCJvcGVyYXRvck1hdGNoZXJzIiwib3BlcmF0b3IiLCJzaW1wbGVSYW5nZSIsInNpbXBsZUVxdWFsaXR5Iiwic2ltcGxlSW5jbHVzaW9uIiwibmV3TGVhZkZuIiwiY29uZmxpY3RGbiIsInJvb3QiLCJwYXRoQXJyYXkiLCJzdWNjZXNzIiwibGFzdEtleSIsInkiLCJwb3B1bGF0ZURvY3VtZW50V2l0aEtleVZhbHVlIiwiZ2V0UHJvdG90eXBlT2YiLCJwb3B1bGF0ZURvY3VtZW50V2l0aE9iamVjdCIsInVucHJlZml4ZWRLZXlzIiwidmFsaWRhdGVPYmplY3QiLCJvYmplY3QiLCJxdWVyeSIsIl9zZWxlY3RvcklzSWQiLCJmaWVsZHMiLCJmaWVsZHNLZXlzIiwic29ydCIsIl9pZCIsImtleVBhdGgiLCJydWxlIiwicHJvamVjdGlvblJ1bGVzVHJlZSIsImN1cnJlbnRQYXRoIiwiYW5vdGhlclBhdGgiLCJ0b1N0cmluZyIsImxhc3RJbmRleCIsInZhbGlkYXRlS2V5SW5QYXRoIiwiZ2V0QXN5bmNNZXRob2ROYW1lIiwiQVNZTkNfQ09MTEVDVElPTl9NRVRIT0RTIiwiQVNZTkNfQ1VSU09SX01FVEhPRFMiLCJDTElFTlRfT05MWV9NRVRIT0RTIiwibWV0aG9kIiwicmVwbGFjZSIsIkN1cnNvciIsImNvbnN0cnVjdG9yIiwiY29sbGVjdGlvbiIsInNvcnRlciIsIl9zZWxlY3RvcklzSWRQZXJoYXBzQXNPYmplY3QiLCJfc2VsZWN0b3JJZCIsImhhc0dlb1F1ZXJ5Iiwic2tpcCIsImxpbWl0IiwiX3Byb2plY3Rpb25GbiIsIl9jb21waWxlUHJvamVjdGlvbiIsIl90cmFuc2Zvcm0iLCJ3cmFwVHJhbnNmb3JtIiwidHJhbnNmb3JtIiwiVHJhY2tlciIsInJlYWN0aXZlIiwiY291bnQiLCJfZGVwZW5kIiwiYWRkZWQiLCJyZW1vdmVkIiwiX2dldFJhd09iamVjdHMiLCJvcmRlcmVkIiwiZmV0Y2giLCJTeW1ib2wiLCJpdGVyYXRvciIsImFkZGVkQmVmb3JlIiwiY2hhbmdlZCIsIm1vdmVkQmVmb3JlIiwiaW5kZXgiLCJvYmplY3RzIiwibmV4dCIsImRvbmUiLCJhc3luY0l0ZXJhdG9yIiwic3luY1Jlc3VsdCIsIlByb21pc2UiLCJyZXNvbHZlIiwiY2FsbGJhY2siLCJ0aGlzQXJnIiwiZ2V0VHJhbnNmb3JtIiwib2JzZXJ2ZSIsIl9vYnNlcnZlRnJvbU9ic2VydmVDaGFuZ2VzIiwib2JzZXJ2ZUFzeW5jIiwib2JzZXJ2ZUNoYW5nZXMiLCJfb2JzZXJ2ZUNoYW5nZXNDYWxsYmFja3NBcmVPcmRlcmVkIiwiX2FsbG93X3Vub3JkZXJlZCIsImRpc3RhbmNlcyIsIl9JZE1hcCIsImN1cnNvciIsImRpcnR5IiwicHJvamVjdGlvbkZuIiwicmVzdWx0c1NuYXBzaG90IiwicWlkIiwibmV4dF9xaWQiLCJxdWVyaWVzIiwicmVzdWx0cyIsInBhdXNlZCIsIndyYXBDYWxsYmFjayIsImFyZ3MiLCJfb2JzZXJ2ZVF1ZXVlIiwicXVldWVUYXNrIiwiYXBwbHkiLCJfc3VwcHJlc3NfaW5pdGlhbCIsIl9xdWVyeSRyZXN1bHRzIiwiX3F1ZXJ5JHJlc3VsdHMkc2l6ZSIsImhhbmRsZXIiLCJzaXplIiwiaGFuZGxlIiwiT2JzZXJ2ZUhhbmRsZSIsInN0b3AiLCJpc1JlYWR5IiwiaXNSZWFkeVByb21pc2UiLCJhY3RpdmUiLCJvbkludmFsaWRhdGUiLCJkcmFpblJlc3VsdCIsImRyYWluIiwidGhlbiIsIm9ic2VydmVDaGFuZ2VzQXN5bmMiLCJjaGFuZ2VycyIsImRlcGVuZGVuY3kiLCJEZXBlbmRlbmN5Iiwibm90aWZ5IiwiYmluZCIsImRlcGVuZCIsIl9nZXRDb2xsZWN0aW9uTmFtZSIsImFwcGx5U2tpcExpbWl0Iiwic2VsZWN0ZWREb2MiLCJfZG9jcyIsImdldCIsInNldCIsImNsZWFyIiwiTWV0ZW9yIiwiX3J1bkZyZXNoIiwiaWQiLCJtYXRjaFJlc3VsdCIsImdldENvbXBhcmF0b3IiLCJfcHVibGlzaEN1cnNvciIsInN1YnNjcmlwdGlvbiIsIlBhY2thZ2UiLCJtb25nbyIsIk1vbmdvIiwiQ29sbGVjdGlvbiIsImFzeW5jTmFtZSIsIl9sZW4iLCJfa2V5IiwicmVqZWN0IiwiX29iamVjdFNwcmVhZCIsImlzQ2xpZW50IiwiX1N5bmNocm9ub3VzUXVldWUiLCJfQXN5bmNocm9ub3VzUXVldWUiLCJjcmVhdGUiLCJfc2F2ZWRPcmlnaW5hbHMiLCJjb3VudERvY3VtZW50cyIsImNvdW50QXN5bmMiLCJlc3RpbWF0ZWREb2N1bWVudENvdW50IiwiZmluZE9uZSIsImZpbmRPbmVBc3luYyIsImZldGNoQXN5bmMiLCJwcmVwYXJlSW5zZXJ0IiwiYXNzZXJ0SGFzVmFsaWRGaWVsZE5hbWVzIiwiX3VzZU9JRCIsIk1vbmdvSUQiLCJPYmplY3RJRCIsIlJhbmRvbSIsImhhcyIsIl9zYXZlT3JpZ2luYWwiLCJpbnNlcnQiLCJxdWVyaWVzVG9SZWNvbXB1dGUiLCJfaW5zZXJ0SW5SZXN1bHRzU3luYyIsIl9yZWNvbXB1dGVSZXN1bHRzIiwiZGVmZXIiLCJpbnNlcnRBc3luYyIsIl9pbnNlcnRJblJlc3VsdHNBc3luYyIsInBhdXNlT2JzZXJ2ZXJzIiwiY2xlYXJSZXN1bHRRdWVyaWVzIiwicHJlcGFyZVJlbW92ZSIsInJlbW92ZSIsIl9lYWNoUG9zc2libHlNYXRjaGluZ0RvY1N5bmMiLCJxdWVyeVJlbW92ZSIsInJlbW92ZUlkIiwicmVtb3ZlRG9jIiwiZXF1YWxzIiwiX3JlbW92ZUZyb21SZXN1bHRzU3luYyIsInJlbW92ZUFzeW5jIiwiX3JlbW92ZUZyb21SZXN1bHRzQXN5bmMiLCJfcmVzdW1lT2JzZXJ2ZXJzIiwiX2RpZmZRdWVyeUNoYW5nZXMiLCJyZXN1bWVPYnNlcnZlcnNTZXJ2ZXIiLCJyZXN1bWVPYnNlcnZlcnNDbGllbnQiLCJyZXRyaWV2ZU9yaWdpbmFscyIsIm9yaWdpbmFscyIsInNhdmVPcmlnaW5hbHMiLCJwcmVwYXJlVXBkYXRlIiwicWlkVG9PcmlnaW5hbFJlc3VsdHMiLCJkb2NNYXAiLCJpZHNNYXRjaGVkIiwiX2lkc01hdGNoZWRCeVNlbGVjdG9yIiwibWVtb2l6ZWRDbG9uZUlmTmVlZGVkIiwiZG9jVG9NZW1vaXplIiwiZmluaXNoVXBkYXRlIiwiX3JlZiIsInVwZGF0ZUNvdW50IiwiaW5zZXJ0ZWRJZCIsIl9yZXR1cm5PYmplY3QiLCJudW1iZXJBZmZlY3RlZCIsInVwZGF0ZUFzeW5jIiwicmVjb21wdXRlUWlkcyIsIl9lYWNoUG9zc2libHlNYXRjaGluZ0RvY0FzeW5jIiwicXVlcnlSZXN1bHQiLCJfbW9kaWZ5QW5kTm90aWZ5QXN5bmMiLCJtdWx0aSIsInVwc2VydCIsIl9jcmVhdGVVcHNlcnREb2N1bWVudCIsInVwZGF0ZSIsIl9tb2RpZnlBbmROb3RpZnlTeW5jIiwidXBzZXJ0QXN5bmMiLCJzcGVjaWZpY0lkcyIsImZvckVhY2hBc3luYyIsIl9nZXRNYXRjaGVkRG9jQW5kTW9kaWZ5IiwibWF0Y2hlZF9iZWZvcmUiLCJvbGRfZG9jIiwiYWZ0ZXJNYXRjaCIsImFmdGVyIiwiYmVmb3JlIiwiX3VwZGF0ZUluUmVzdWx0c1N5bmMiLCJfdXBkYXRlSW5SZXN1bHRzQXN5bmMiLCJvbGRSZXN1bHRzIiwiX0NhY2hpbmdDaGFuZ2VPYnNlcnZlciIsIm9yZGVyZWRGcm9tQ2FsbGJhY2tzIiwiY2FsbGJhY2tzIiwiZG9jcyIsIk9yZGVyZWREaWN0IiwiaWRTdHJpbmdpZnkiLCJhcHBseUNoYW5nZSIsInB1dEJlZm9yZSIsIm1vdmVCZWZvcmUiLCJEaWZmU2VxdWVuY2UiLCJhcHBseUNoYW5nZXMiLCJJZE1hcCIsImlkUGFyc2UiLCJfX3dyYXBwZWRUcmFuc2Zvcm1fXyIsIndyYXBwZWQiLCJ0cmFuc2Zvcm1lZCIsIm5vbnJlYWN0aXZlIiwiX2JpbmFyeVNlYXJjaCIsImNtcCIsImFycmF5IiwiZmlyc3QiLCJyYW5nZSIsImhhbGZSYW5nZSIsImZsb29yIiwiX2NoZWNrU3VwcG9ydGVkUHJvamVjdGlvbiIsIl9pZFByb2plY3Rpb24iLCJydWxlVHJlZSIsInN1YmRvYyIsInNlbGVjdG9yRG9jdW1lbnQiLCJpc01vZGlmeSIsIl9pc01vZGlmaWNhdGlvbk1vZCIsIm5ld0RvYyIsImlzSW5zZXJ0IiwicmVwbGFjZW1lbnQiLCJfZGlmZk9iamVjdHMiLCJsZWZ0IiwicmlnaHQiLCJkaWZmT2JqZWN0cyIsIm5ld1Jlc3VsdHMiLCJvYnNlcnZlciIsImRpZmZRdWVyeUNoYW5nZXMiLCJfZGlmZlF1ZXJ5T3JkZXJlZENoYW5nZXMiLCJkaWZmUXVlcnlPcmRlcmVkQ2hhbmdlcyIsIl9kaWZmUXVlcnlVbm9yZGVyZWRDaGFuZ2VzIiwiZGlmZlF1ZXJ5VW5vcmRlcmVkQ2hhbmdlcyIsIl9maW5kSW5PcmRlcmVkUmVzdWx0cyIsInN1YklkcyIsIl9pbnNlcnRJblNvcnRlZExpc3QiLCJzcGxpY2UiLCJpc1JlcGxhY2UiLCJpc01vZGlmaWVyIiwic2V0T25JbnNlcnQiLCJtb2RGdW5jIiwiTU9ESUZJRVJTIiwia2V5cGF0aCIsImtleXBhcnRzIiwidGFyZ2V0IiwiZmluZE1vZFRhcmdldCIsImZvcmJpZEFycmF5Iiwibm9DcmVhdGUiLCJOT19DUkVBVEVfTU9ESUZJRVJTIiwicG9wIiwib2JzZXJ2ZUNhbGxiYWNrcyIsInN1cHByZXNzZWQiLCJvYnNlcnZlQ2hhbmdlc0NhbGxiYWNrcyIsIl9vYnNlcnZlQ2FsbGJhY2tzQXJlT3JkZXJlZCIsImluZGljZXMiLCJfbm9faW5kaWNlcyIsImNoZWNrIiwiYWRkZWRBdCIsImNoYW5nZWRBdCIsIm9sZERvYyIsIm1vdmVkVG8iLCJmcm9tIiwidG8iLCJyZW1vdmVkQXQiLCJjaGFuZ2VPYnNlcnZlciIsIl9mcm9tT2JzZXJ2ZSIsIm5vbk11dGF0aW5nQ2FsbGJhY2tzIiwic2V0U3VwcHJlc3NlZCIsImgiLCJfaCRpc1JlYWR5UHJvbWlzZSIsIl9pc1Byb21pc2UiLCJjaGFuZ2VkRmllbGRzIiwibWFrZUNoYW5nZWRGaWVsZHMiLCJvbGRfaWR4IiwibmV3X2lkeCIsIiRjdXJyZW50RGF0ZSIsIkRhdGUiLCIkaW5jIiwiJG1pbiIsIiRtYXgiLCIkbXVsIiwiJHJlbmFtZSIsInRhcmdldDIiLCIkc2V0T25JbnNlcnQiLCIkcHVzaCIsIiRlYWNoIiwidG9QdXNoIiwicG9zaXRpb24iLCIkcG9zaXRpb24iLCIkc2xpY2UiLCJzb3J0RnVuY3Rpb24iLCIkc29ydCIsInNwbGljZUFyZ3VtZW50cyIsIiRwdXNoQWxsIiwiJGFkZFRvU2V0IiwiaXNFYWNoIiwidmFsdWVzIiwidG9BZGQiLCIkcG9wIiwidG9Qb3AiLCIkcHVsbCIsInRvUHVsbCIsIm91dCIsIiRwdWxsQWxsIiwiJGJpdCIsIiR2IiwiaW52YWxpZENoYXJNc2ciLCIkIiwiYXNzZXJ0SXNWYWxpZEZpZWxkTmFtZSIsInVzZWRBcnJheUluZGV4IiwibGFzdCIsImtleXBhcnQiLCJwYXJzZUludCIsIkRlY2ltYWwiLCJfUGFja2FnZSRtb25nb0RlY2ltYSIsIkRlY2ltYWxTdHViIiwiaXNVcGRhdGUiLCJfZG9jTWF0Y2hlciIsIl9jb21waWxlU2VsZWN0b3IiLCJoYXNXaGVyZSIsImtleU9yZGVyU2Vuc2l0aXZlIiwiX3R5cGVvcmRlciIsInQiLCJ0YSIsInRiIiwib2EiLCJvYiIsInRvSGV4U3RyaW5nIiwiaXNOYU4iLCJnZXRUaW1lIiwibWludXMiLCJ0b051bWJlciIsInRvQXJyYXkiLCJMb2NhbENvbGxlY3Rpb25fIiwic3BlYyIsIl9zb3J0U3BlY1BhcnRzIiwiX3NvcnRGdW5jdGlvbiIsImFkZFNwZWNQYXJ0IiwiYXNjZW5kaW5nIiwiY2hhckF0IiwibG9va3VwIiwiX2tleUNvbXBhcmF0b3IiLCJjb21wb3NlQ29tcGFyYXRvcnMiLCJfa2V5RmllbGRDb21wYXJhdG9yIiwiX2dldEJhc2VDb21wYXJhdG9yIiwiX2NvbXBhcmVLZXlzIiwia2V5MSIsImtleTIiLCJfZ2VuZXJhdGVLZXlzRnJvbURvYyIsImNiIiwicGF0aEZyb21JbmRpY2VzIiwia25vd25QYXRocyIsInZhbHVlc0J5SW5kZXhBbmRQYXRoIiwidXNlZFBhdGhzIiwic29sZUtleSIsImRvYzEiLCJkb2MyIiwiX2dldE1pbktleUZyb21Eb2MiLCJtaW5LZXkiLCJpbnZlcnQiLCJjb21wYXJlIiwiY29tcGFyYXRvckFycmF5Il0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7SUFBQUEsTUFBTSxDQUFDQyxJQUFJLENBQUMsdUJBQXVCLENBQUM7SUFBQyxJQUFJQyxNQUFNLEVBQUNDLFlBQVksRUFBQ0MsZ0JBQWdCLEVBQUNDLFdBQVcsRUFBQ0MsaUJBQWlCO0lBQUNOLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDLGFBQWEsRUFBQztNQUFDQyxNQUFNQSxDQUFDSyxDQUFDLEVBQUM7UUFBQ0wsTUFBTSxHQUFDSyxDQUFDO01BQUEsQ0FBQztNQUFDSixZQUFZQSxDQUFDSSxDQUFDLEVBQUM7UUFBQ0osWUFBWSxHQUFDSSxDQUFDO01BQUEsQ0FBQztNQUFDSCxnQkFBZ0JBLENBQUNHLENBQUMsRUFBQztRQUFDSCxnQkFBZ0IsR0FBQ0csQ0FBQztNQUFBLENBQUM7TUFBQ0YsV0FBV0EsQ0FBQ0UsQ0FBQyxFQUFDO1FBQUNGLFdBQVcsR0FBQ0UsQ0FBQztNQUFBLENBQUM7TUFBQ0QsaUJBQWlCQSxDQUFDQyxDQUFDLEVBQUM7UUFBQ0QsaUJBQWlCLEdBQUNDLENBQUM7TUFBQTtJQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7SUFBQyxJQUFJQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNQSxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQVMzV0MsU0FBUyxDQUFDQyx3QkFBd0IsR0FBR0MsS0FBSyxJQUFJQSxLQUFLLENBQUNDLEdBQUcsQ0FBQ0MsSUFBSSxJQUMxREEsSUFBSSxDQUFDQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUNDLE1BQU0sQ0FBQ0MsSUFBSSxJQUFJLENBQUNiLFlBQVksQ0FBQ2EsSUFBSSxDQUFDLENBQUMsQ0FBQ0MsSUFBSSxDQUFDLEdBQUcsQ0FDOUQsQ0FBQzs7SUFFRDtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0FSLFNBQVMsQ0FBQ1MsT0FBTyxDQUFDQyxTQUFTLENBQUNDLGtCQUFrQixHQUFHLFVBQVNDLFFBQVEsRUFBRTtNQUNsRTtNQUNBQSxRQUFRLEdBQUdDLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDO1FBQUNDLElBQUksRUFBRSxDQUFDLENBQUM7UUFBRUMsTUFBTSxFQUFFLENBQUM7TUFBQyxDQUFDLEVBQUVKLFFBQVEsQ0FBQztNQUUxRCxNQUFNSyxlQUFlLEdBQUcsSUFBSSxDQUFDQyxTQUFTLENBQUMsQ0FBQztNQUN4QyxNQUFNQyxhQUFhLEdBQUcsRUFBRSxDQUFDQyxNQUFNLENBQzdCUCxNQUFNLENBQUNRLElBQUksQ0FBQ1QsUUFBUSxDQUFDRyxJQUFJLENBQUMsRUFDMUJGLE1BQU0sQ0FBQ1EsSUFBSSxDQUFDVCxRQUFRLENBQUNJLE1BQU0sQ0FDN0IsQ0FBQztNQUVELE9BQU9HLGFBQWEsQ0FBQ0csSUFBSSxDQUFDbEIsSUFBSSxJQUFJO1FBQ2hDLE1BQU1tQixHQUFHLEdBQUduQixJQUFJLENBQUNDLEtBQUssQ0FBQyxHQUFHLENBQUM7UUFFM0IsT0FBT1ksZUFBZSxDQUFDSyxJQUFJLENBQUNFLGNBQWMsSUFBSTtVQUM1QyxNQUFNQyxHQUFHLEdBQUdELGNBQWMsQ0FBQ25CLEtBQUssQ0FBQyxHQUFHLENBQUM7VUFFckMsSUFBSXFCLENBQUMsR0FBRyxDQUFDO1lBQUVDLENBQUMsR0FBRyxDQUFDO1VBRWhCLE9BQU9ELENBQUMsR0FBR0QsR0FBRyxDQUFDRyxNQUFNLElBQUlELENBQUMsR0FBR0osR0FBRyxDQUFDSyxNQUFNLEVBQUU7WUFDdkMsSUFBSWxDLFlBQVksQ0FBQytCLEdBQUcsQ0FBQ0MsQ0FBQyxDQUFDLENBQUMsSUFBSWhDLFlBQVksQ0FBQzZCLEdBQUcsQ0FBQ0ksQ0FBQyxDQUFDLENBQUMsRUFBRTtjQUNoRDtjQUNBO2NBQ0EsSUFBSUYsR0FBRyxDQUFDQyxDQUFDLENBQUMsS0FBS0gsR0FBRyxDQUFDSSxDQUFDLENBQUMsRUFBRTtnQkFDckJELENBQUMsRUFBRTtnQkFDSEMsQ0FBQyxFQUFFO2NBQ0wsQ0FBQyxNQUFNO2dCQUNMLE9BQU8sS0FBSztjQUNkO1lBQ0YsQ0FBQyxNQUFNLElBQUlqQyxZQUFZLENBQUMrQixHQUFHLENBQUNDLENBQUMsQ0FBQyxDQUFDLEVBQUU7Y0FDL0I7Y0FDQSxPQUFPLEtBQUs7WUFDZCxDQUFDLE1BQU0sSUFBSWhDLFlBQVksQ0FBQzZCLEdBQUcsQ0FBQ0ksQ0FBQyxDQUFDLENBQUMsRUFBRTtjQUMvQkEsQ0FBQyxFQUFFO1lBQ0wsQ0FBQyxNQUFNLElBQUlGLEdBQUcsQ0FBQ0MsQ0FBQyxDQUFDLEtBQUtILEdBQUcsQ0FBQ0ksQ0FBQyxDQUFDLEVBQUU7Y0FDNUJELENBQUMsRUFBRTtjQUNIQyxDQUFDLEVBQUU7WUFDTCxDQUFDLE1BQU07Y0FDTCxPQUFPLEtBQUs7WUFDZDtVQUNGOztVQUVBO1VBQ0EsT0FBTyxJQUFJO1FBQ2IsQ0FBQyxDQUFDO01BQ0osQ0FBQyxDQUFDO0lBQ0osQ0FBQzs7SUFFRDtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0EzQixTQUFTLENBQUNTLE9BQU8sQ0FBQ0MsU0FBUyxDQUFDbUIsdUJBQXVCLEdBQUcsVUFBU2pCLFFBQVEsRUFBRTtNQUN2RSxJQUFJLENBQUMsSUFBSSxDQUFDRCxrQkFBa0IsQ0FBQ0MsUUFBUSxDQUFDLEVBQUU7UUFDdEMsT0FBTyxLQUFLO01BQ2Q7TUFFQSxJQUFJLENBQUMsSUFBSSxDQUFDa0IsUUFBUSxDQUFDLENBQUMsRUFBRTtRQUNwQixPQUFPLElBQUk7TUFDYjtNQUVBbEIsUUFBUSxHQUFHQyxNQUFNLENBQUNDLE1BQU0sQ0FBQztRQUFDQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQUVDLE1BQU0sRUFBRSxDQUFDO01BQUMsQ0FBQyxFQUFFSixRQUFRLENBQUM7TUFFMUQsTUFBTW1CLGFBQWEsR0FBRyxFQUFFLENBQUNYLE1BQU0sQ0FDN0JQLE1BQU0sQ0FBQ1EsSUFBSSxDQUFDVCxRQUFRLENBQUNHLElBQUksQ0FBQyxFQUMxQkYsTUFBTSxDQUFDUSxJQUFJLENBQUNULFFBQVEsQ0FBQ0ksTUFBTSxDQUM3QixDQUFDO01BRUQsSUFBSSxJQUFJLENBQUNFLFNBQVMsQ0FBQyxDQUFDLENBQUNJLElBQUksQ0FBQ1Usa0JBQWtCLENBQUMsSUFDekNELGFBQWEsQ0FBQ1QsSUFBSSxDQUFDVSxrQkFBa0IsQ0FBQyxFQUFFO1FBQzFDLE9BQU8sSUFBSTtNQUNiOztNQUVBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQSxNQUFNQyxzQkFBc0IsR0FBR3BCLE1BQU0sQ0FBQ1EsSUFBSSxDQUFDLElBQUksQ0FBQ2EsU0FBUyxDQUFDLENBQUNaLElBQUksQ0FBQ2xCLElBQUksSUFBSTtRQUN0RSxJQUFJLENBQUNULGdCQUFnQixDQUFDLElBQUksQ0FBQ3VDLFNBQVMsQ0FBQzlCLElBQUksQ0FBQyxDQUFDLEVBQUU7VUFDM0MsT0FBTyxLQUFLO1FBQ2Q7UUFFQSxPQUFPMkIsYUFBYSxDQUFDVCxJQUFJLENBQUNhLFlBQVksSUFDcENBLFlBQVksQ0FBQ0MsVUFBVSxJQUFBaEIsTUFBQSxDQUFJaEIsSUFBSSxNQUFHLENBQ3BDLENBQUM7TUFDSCxDQUFDLENBQUM7TUFFRixJQUFJNkIsc0JBQXNCLEVBQUU7UUFDMUIsT0FBTyxLQUFLO01BQ2Q7O01BRUE7TUFDQTtNQUNBO01BQ0EsTUFBTUksZ0JBQWdCLEdBQUdDLEtBQUssQ0FBQ0MsS0FBSyxDQUFDLElBQUksQ0FBQ0YsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDOztNQUU3RDtNQUNBLElBQUlBLGdCQUFnQixLQUFLLElBQUksRUFBRTtRQUM3QixPQUFPLElBQUk7TUFDYjtNQUVBLElBQUk7UUFDRkcsZUFBZSxDQUFDQyxPQUFPLENBQUNKLGdCQUFnQixFQUFFekIsUUFBUSxDQUFDO01BQ3JELENBQUMsQ0FBQyxPQUFPOEIsS0FBSyxFQUFFO1FBQ2Q7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBO1FBQ0E7UUFDQSxJQUFJQSxLQUFLLENBQUNDLElBQUksS0FBSyxnQkFBZ0IsSUFBSUQsS0FBSyxDQUFDRSxnQkFBZ0IsRUFBRTtVQUM3RCxPQUFPLEtBQUs7UUFDZDtRQUVBLE1BQU1GLEtBQUs7TUFDYjtNQUVBLE9BQU8sSUFBSSxDQUFDRyxlQUFlLENBQUNSLGdCQUFnQixDQUFDLENBQUNTLE1BQU07SUFDdEQsQ0FBQzs7SUFFRDtJQUNBO0lBQ0E7SUFDQTlDLFNBQVMsQ0FBQ1MsT0FBTyxDQUFDQyxTQUFTLENBQUNxQyxxQkFBcUIsR0FBRyxVQUFTQyxVQUFVLEVBQUU7TUFDdkUsTUFBTUMsYUFBYSxHQUFHakQsU0FBUyxDQUFDQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUNpQixTQUFTLENBQUMsQ0FBQyxDQUFDOztNQUUxRTtNQUNBO01BQ0E7TUFDQTtNQUNBLElBQUkrQixhQUFhLENBQUNDLFFBQVEsQ0FBQyxFQUFFLENBQUMsRUFBRTtRQUM5QixPQUFPLENBQUMsQ0FBQztNQUNYO01BRUEsT0FBT0MsbUNBQW1DLENBQUNGLGFBQWEsRUFBRUQsVUFBVSxDQUFDO0lBQ3ZFLENBQUM7O0lBRUQ7SUFDQTtJQUNBO0lBQ0E7SUFDQWhELFNBQVMsQ0FBQ1MsT0FBTyxDQUFDQyxTQUFTLENBQUMyQixnQkFBZ0IsR0FBRyxZQUFXO01BQ3hEO01BQ0EsSUFBSSxJQUFJLENBQUNlLGlCQUFpQixLQUFLQyxTQUFTLEVBQUU7UUFDeEMsT0FBTyxJQUFJLENBQUNELGlCQUFpQjtNQUMvQjs7TUFFQTtNQUNBO01BQ0EsSUFBSUUsUUFBUSxHQUFHLEtBQUs7TUFFcEIsSUFBSSxDQUFDRixpQkFBaUIsR0FBR3hELFdBQVcsQ0FDbEMsSUFBSSxDQUFDc0IsU0FBUyxDQUFDLENBQUMsRUFDaEJkLElBQUksSUFBSTtRQUNOLE1BQU1tRCxhQUFhLEdBQUcsSUFBSSxDQUFDckIsU0FBUyxDQUFDOUIsSUFBSSxDQUFDO1FBRTFDLElBQUlULGdCQUFnQixDQUFDNEQsYUFBYSxDQUFDLEVBQUU7VUFDbkM7VUFDQTtVQUNBO1VBQ0EsSUFBSUEsYUFBYSxDQUFDQyxHQUFHLEVBQUU7WUFDckIsT0FBT0QsYUFBYSxDQUFDQyxHQUFHO1VBQzFCO1VBRUEsSUFBSUQsYUFBYSxDQUFDRSxHQUFHLEVBQUU7WUFDckIsTUFBTUMsT0FBTyxHQUFHLElBQUkxRCxTQUFTLENBQUNTLE9BQU8sQ0FBQztjQUFDa0QsV0FBVyxFQUFFSjtZQUFhLENBQUMsQ0FBQzs7WUFFbkU7WUFDQTtZQUNBO1lBQ0EsT0FBT0EsYUFBYSxDQUFDRSxHQUFHLENBQUNHLElBQUksQ0FBQ0QsV0FBVyxJQUN2Q0QsT0FBTyxDQUFDYixlQUFlLENBQUM7Y0FBQ2M7WUFBVyxDQUFDLENBQUMsQ0FBQ2IsTUFDekMsQ0FBQztVQUNIO1VBRUEsSUFBSWUsZ0JBQWdCLENBQUNOLGFBQWEsRUFBRSxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDLEVBQUU7WUFDbkUsSUFBSU8sVUFBVSxHQUFHLENBQUNDLFFBQVE7WUFDMUIsSUFBSUMsVUFBVSxHQUFHRCxRQUFRO1lBRXpCLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDRSxPQUFPLENBQUNDLEVBQUUsSUFBSTtjQUM1QixJQUFJekUsTUFBTSxDQUFDMEUsSUFBSSxDQUFDWixhQUFhLEVBQUVXLEVBQUUsQ0FBQyxJQUM5QlgsYUFBYSxDQUFDVyxFQUFFLENBQUMsR0FBR0YsVUFBVSxFQUFFO2dCQUNsQ0EsVUFBVSxHQUFHVCxhQUFhLENBQUNXLEVBQUUsQ0FBQztjQUNoQztZQUNGLENBQUMsQ0FBQztZQUVGLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDRCxPQUFPLENBQUNDLEVBQUUsSUFBSTtjQUM1QixJQUFJekUsTUFBTSxDQUFDMEUsSUFBSSxDQUFDWixhQUFhLEVBQUVXLEVBQUUsQ0FBQyxJQUM5QlgsYUFBYSxDQUFDVyxFQUFFLENBQUMsR0FBR0osVUFBVSxFQUFFO2dCQUNsQ0EsVUFBVSxHQUFHUCxhQUFhLENBQUNXLEVBQUUsQ0FBQztjQUNoQztZQUNGLENBQUMsQ0FBQztZQUVGLE1BQU1FLE1BQU0sR0FBRyxDQUFDTixVQUFVLEdBQUdFLFVBQVUsSUFBSSxDQUFDO1lBQzVDLE1BQU1OLE9BQU8sR0FBRyxJQUFJMUQsU0FBUyxDQUFDUyxPQUFPLENBQUM7Y0FBQ2tELFdBQVcsRUFBRUo7WUFBYSxDQUFDLENBQUM7WUFFbkUsSUFBSSxDQUFDRyxPQUFPLENBQUNiLGVBQWUsQ0FBQztjQUFDYyxXQUFXLEVBQUVTO1lBQU0sQ0FBQyxDQUFDLENBQUN0QixNQUFNLEtBQ3JEc0IsTUFBTSxLQUFLTixVQUFVLElBQUlNLE1BQU0sS0FBS0osVUFBVSxDQUFDLEVBQUU7Y0FDcERWLFFBQVEsR0FBRyxJQUFJO1lBQ2pCO1lBRUEsT0FBT2MsTUFBTTtVQUNmO1VBRUEsSUFBSVAsZ0JBQWdCLENBQUNOLGFBQWEsRUFBRSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQyxFQUFFO1lBQ3BEO1lBQ0E7WUFDQTtZQUNBLE9BQU8sQ0FBQyxDQUFDO1VBQ1g7VUFFQUQsUUFBUSxHQUFHLElBQUk7UUFDakI7UUFFQSxPQUFPLElBQUksQ0FBQ3BCLFNBQVMsQ0FBQzlCLElBQUksQ0FBQztNQUM3QixDQUFDLEVBQ0RpRSxDQUFDLElBQUlBLENBQUMsQ0FBQztNQUVULElBQUlmLFFBQVEsRUFBRTtRQUNaLElBQUksQ0FBQ0YsaUJBQWlCLEdBQUcsSUFBSTtNQUMvQjtNQUVBLE9BQU8sSUFBSSxDQUFDQSxpQkFBaUI7SUFDL0IsQ0FBQzs7SUFFRDtJQUNBO0lBQ0FwRCxTQUFTLENBQUNzRSxNQUFNLENBQUM1RCxTQUFTLENBQUNDLGtCQUFrQixHQUFHLFVBQVNDLFFBQVEsRUFBRTtNQUNqRSxPQUFPLElBQUksQ0FBQzJELDhCQUE4QixDQUFDNUQsa0JBQWtCLENBQUNDLFFBQVEsQ0FBQztJQUN6RSxDQUFDO0lBRURaLFNBQVMsQ0FBQ3NFLE1BQU0sQ0FBQzVELFNBQVMsQ0FBQ3FDLHFCQUFxQixHQUFHLFVBQVNDLFVBQVUsRUFBRTtNQUN0RSxPQUFPRyxtQ0FBbUMsQ0FDeENuRCxTQUFTLENBQUNDLHdCQUF3QixDQUFDLElBQUksQ0FBQ2lCLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFDcEQ4QixVQUNGLENBQUM7SUFDSCxDQUFDO0lBRUQsU0FBU0csbUNBQW1DQSxDQUFDakQsS0FBSyxFQUFFOEMsVUFBVSxFQUFFO01BQzlELE1BQU13QixPQUFPLEdBQUczRSxpQkFBaUIsQ0FBQ21ELFVBQVUsQ0FBQzs7TUFFN0M7TUFDQSxNQUFNeUIsSUFBSSxHQUFHN0UsV0FBVyxDQUN0Qk0sS0FBSyxFQUNMRSxJQUFJLElBQUksSUFBSSxFQUNaLENBQUNzRSxJQUFJLEVBQUV0RSxJQUFJLEVBQUV1RSxRQUFRLEtBQUssSUFBSSxFQUM5QkgsT0FBTyxDQUFDQyxJQUNWLENBQUM7TUFDRCxNQUFNRyxnQkFBZ0IsR0FBR0MsV0FBVyxDQUFDSixJQUFJLENBQUM7TUFFMUMsSUFBSUQsT0FBTyxDQUFDTSxTQUFTLEVBQUU7UUFDckI7UUFDQTtRQUNBLE9BQU9GLGdCQUFnQjtNQUN6Qjs7TUFFQTtNQUNBO01BQ0E7TUFDQSxNQUFNRyxvQkFBb0IsR0FBRyxDQUFDLENBQUM7TUFFL0JsRSxNQUFNLENBQUNRLElBQUksQ0FBQ3VELGdCQUFnQixDQUFDLENBQUNYLE9BQU8sQ0FBQzdELElBQUksSUFBSTtRQUM1QyxJQUFJLENBQUN3RSxnQkFBZ0IsQ0FBQ3hFLElBQUksQ0FBQyxFQUFFO1VBQzNCMkUsb0JBQW9CLENBQUMzRSxJQUFJLENBQUMsR0FBRyxLQUFLO1FBQ3BDO01BQ0YsQ0FBQyxDQUFDO01BRUYsT0FBTzJFLG9CQUFvQjtJQUM3QjtJQUVBLFNBQVNDLFFBQVFBLENBQUNDLFFBQVEsRUFBRTtNQUMxQixPQUFPcEUsTUFBTSxDQUFDUSxJQUFJLENBQUMsSUFBSXJCLFNBQVMsQ0FBQ1MsT0FBTyxDQUFDd0UsUUFBUSxDQUFDLENBQUNDLE1BQU0sQ0FBQzs7TUFFMUQ7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBOztNQUVBO01BQ0E7TUFDQTtNQUNBOztNQUVBO01BQ0E7TUFDQTtNQUNBO01BQ0E7SUFDRjs7SUFFQTtJQUNBLFNBQVNyQixnQkFBZ0JBLENBQUNzQixHQUFHLEVBQUU5RCxJQUFJLEVBQUU7TUFDbkMsT0FBT1IsTUFBTSxDQUFDUSxJQUFJLENBQUM4RCxHQUFHLENBQUMsQ0FBQ0MsS0FBSyxDQUFDQyxDQUFDLElBQUloRSxJQUFJLENBQUM2QixRQUFRLENBQUNtQyxDQUFDLENBQUMsQ0FBQztJQUN0RDtJQUVBLFNBQVNyRCxrQkFBa0JBLENBQUM1QixJQUFJLEVBQUU7TUFDaEMsT0FBT0EsSUFBSSxDQUFDQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUNpQixJQUFJLENBQUM1QixZQUFZLENBQUM7SUFDM0M7O0lBRUE7SUFDQTtJQUNBLFNBQVNtRixXQUFXQSxDQUFDSixJQUFJLEVBQWU7TUFBQSxJQUFiYSxNQUFNLEdBQUFDLFNBQUEsQ0FBQTNELE1BQUEsUUFBQTJELFNBQUEsUUFBQWxDLFNBQUEsR0FBQWtDLFNBQUEsTUFBRyxFQUFFO01BQ3BDLE1BQU16QyxNQUFNLEdBQUcsQ0FBQyxDQUFDO01BRWpCakMsTUFBTSxDQUFDUSxJQUFJLENBQUNvRCxJQUFJLENBQUMsQ0FBQ1IsT0FBTyxDQUFDdUIsR0FBRyxJQUFJO1FBQy9CLE1BQU1DLEtBQUssR0FBR2hCLElBQUksQ0FBQ2UsR0FBRyxDQUFDO1FBQ3ZCLElBQUlDLEtBQUssS0FBSzVFLE1BQU0sQ0FBQzRFLEtBQUssQ0FBQyxFQUFFO1VBQzNCNUUsTUFBTSxDQUFDQyxNQUFNLENBQUNnQyxNQUFNLEVBQUUrQixXQUFXLENBQUNZLEtBQUssS0FBQXJFLE1BQUEsQ0FBS2tFLE1BQU0sR0FBR0UsR0FBRyxNQUFHLENBQUMsQ0FBQztRQUMvRCxDQUFDLE1BQU07VUFDTDFDLE1BQU0sQ0FBQ3dDLE1BQU0sR0FBR0UsR0FBRyxDQUFDLEdBQUdDLEtBQUs7UUFDOUI7TUFDRixDQUFDLENBQUM7TUFFRixPQUFPM0MsTUFBTTtJQUNmO0lBQUM0QyxzQkFBQTtFQUFBLFNBQUFDLFdBQUE7SUFBQSxPQUFBRCxzQkFBQSxDQUFBQyxXQUFBO0VBQUE7RUFBQUQsc0JBQUE7QUFBQTtFQUFBRSxJQUFBO0VBQUFDLEtBQUE7QUFBQSxHOzs7Ozs7Ozs7Ozs7OztJQ3pWRHRHLE1BQU0sQ0FBQ3VHLE1BQU0sQ0FBQztNQUFDckcsTUFBTSxFQUFDQSxDQUFBLEtBQUlBLE1BQU07TUFBQ3NHLGlCQUFpQixFQUFDQSxDQUFBLEtBQUlBLGlCQUFpQjtNQUFDQyx1QkFBdUIsRUFBQ0EsQ0FBQSxLQUFJQSx1QkFBdUI7TUFBQ0Msc0JBQXNCLEVBQUNBLENBQUEsS0FBSUEsc0JBQXNCO01BQUNDLHNCQUFzQixFQUFDQSxDQUFBLEtBQUlBLHNCQUFzQjtNQUFDQyxXQUFXLEVBQUNBLENBQUEsS0FBSUEsV0FBVztNQUFDekcsWUFBWSxFQUFDQSxDQUFBLEtBQUlBLFlBQVk7TUFBQ0MsZ0JBQWdCLEVBQUNBLENBQUEsS0FBSUEsZ0JBQWdCO01BQUN5RyxrQkFBa0IsRUFBQ0EsQ0FBQSxLQUFJQSxrQkFBa0I7TUFBQ0MsY0FBYyxFQUFDQSxDQUFBLEtBQUlBLGNBQWM7TUFBQ3pHLFdBQVcsRUFBQ0EsQ0FBQSxLQUFJQSxXQUFXO01BQUMwRywrQkFBK0IsRUFBQ0EsQ0FBQSxLQUFJQSwrQkFBK0I7TUFBQ3pHLGlCQUFpQixFQUFDQSxDQUFBLEtBQUlBLGlCQUFpQjtNQUFDMEcsb0JBQW9CLEVBQUNBLENBQUEsS0FBSUE7SUFBb0IsQ0FBQyxDQUFDO0lBQUMsSUFBSS9ELGVBQWU7SUFBQ2pELE1BQU0sQ0FBQ0MsSUFBSSxDQUFDLHVCQUF1QixFQUFDO01BQUNnSCxPQUFPQSxDQUFDMUcsQ0FBQyxFQUFDO1FBQUMwQyxlQUFlLEdBQUMxQyxDQUFDO01BQUE7SUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0lBQUMsSUFBSUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTUEsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFFcnRCLE1BQU1OLE1BQU0sR0FBR29CLE1BQU0sQ0FBQ0gsU0FBUyxDQUFDK0YsY0FBYztJQWM5QyxNQUFNVixpQkFBaUIsR0FBRztNQUMvQlcsR0FBRyxFQUFFQyxjQUFjLENBQUNDLFFBQVEsSUFBSUEsUUFBUSxHQUFHLENBQUMsQ0FBQztNQUM3Q0MsR0FBRyxFQUFFRixjQUFjLENBQUNDLFFBQVEsSUFBSUEsUUFBUSxHQUFHLENBQUMsQ0FBQztNQUM3Q0UsSUFBSSxFQUFFSCxjQUFjLENBQUNDLFFBQVEsSUFBSUEsUUFBUSxJQUFJLENBQUMsQ0FBQztNQUMvQ0csSUFBSSxFQUFFSixjQUFjLENBQUNDLFFBQVEsSUFBSUEsUUFBUSxJQUFJLENBQUMsQ0FBQztNQUMvQ0ksSUFBSSxFQUFFO1FBQ0pDLHNCQUFzQkEsQ0FBQ0MsT0FBTyxFQUFFO1VBQzlCLElBQUksRUFBRUMsS0FBSyxDQUFDQyxPQUFPLENBQUNGLE9BQU8sQ0FBQyxJQUFJQSxPQUFPLENBQUN0RixNQUFNLEtBQUssQ0FBQyxJQUMzQyxPQUFPc0YsT0FBTyxDQUFDLENBQUMsQ0FBQyxLQUFLLFFBQVEsSUFDOUIsT0FBT0EsT0FBTyxDQUFDLENBQUMsQ0FBQyxLQUFLLFFBQVEsQ0FBQyxFQUFFO1lBQ3hDLE1BQU1HLEtBQUssQ0FBQyxrREFBa0QsQ0FBQztVQUNqRTs7VUFFQTtVQUNBLE1BQU1DLE9BQU8sR0FBR0osT0FBTyxDQUFDLENBQUMsQ0FBQztVQUMxQixNQUFNSyxTQUFTLEdBQUdMLE9BQU8sQ0FBQyxDQUFDLENBQUM7VUFDNUIsT0FBT3pCLEtBQUssSUFDVixPQUFPQSxLQUFLLEtBQUssUUFBUSxJQUFJQSxLQUFLLEdBQUc2QixPQUFPLEtBQUtDLFNBQ2xEO1FBQ0g7TUFDRixDQUFDO01BQ0Q5RCxHQUFHLEVBQUU7UUFDSHdELHNCQUFzQkEsQ0FBQ0MsT0FBTyxFQUFFO1VBQzlCLElBQUksQ0FBQ0MsS0FBSyxDQUFDQyxPQUFPLENBQUNGLE9BQU8sQ0FBQyxFQUFFO1lBQzNCLE1BQU1HLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQztVQUNuQztVQUVBLE1BQU1HLGVBQWUsR0FBR04sT0FBTyxDQUFDL0csR0FBRyxDQUFDc0gsTUFBTSxJQUFJO1lBQzVDLElBQUlBLE1BQU0sWUFBWUMsTUFBTSxFQUFFO2NBQzVCLE9BQU9uQixvQkFBb0IsQ0FBQ2tCLE1BQU0sQ0FBQztZQUNyQztZQUVBLElBQUk5SCxnQkFBZ0IsQ0FBQzhILE1BQU0sQ0FBQyxFQUFFO2NBQzVCLE1BQU1KLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQztZQUN4QztZQUVBLE9BQU9wQixzQkFBc0IsQ0FBQ3dCLE1BQU0sQ0FBQztVQUN2QyxDQUFDLENBQUM7VUFFRixPQUFPaEMsS0FBSyxJQUFJO1lBQ2Q7WUFDQSxJQUFJQSxLQUFLLEtBQUtwQyxTQUFTLEVBQUU7Y0FDdkJvQyxLQUFLLEdBQUcsSUFBSTtZQUNkO1lBRUEsT0FBTytCLGVBQWUsQ0FBQ2xHLElBQUksQ0FBQ29DLE9BQU8sSUFBSUEsT0FBTyxDQUFDK0IsS0FBSyxDQUFDLENBQUM7VUFDeEQsQ0FBQztRQUNIO01BQ0YsQ0FBQztNQUNEa0MsS0FBSyxFQUFFO1FBQ0w7UUFDQTtRQUNBO1FBQ0FDLG9CQUFvQixFQUFFLElBQUk7UUFDMUJYLHNCQUFzQkEsQ0FBQ0MsT0FBTyxFQUFFO1VBQzlCLElBQUksT0FBT0EsT0FBTyxLQUFLLFFBQVEsRUFBRTtZQUMvQjtZQUNBO1lBQ0FBLE9BQU8sR0FBRyxDQUFDO1VBQ2IsQ0FBQyxNQUFNLElBQUksT0FBT0EsT0FBTyxLQUFLLFFBQVEsRUFBRTtZQUN0QyxNQUFNRyxLQUFLLENBQUMsc0JBQXNCLENBQUM7VUFDckM7VUFFQSxPQUFPNUIsS0FBSyxJQUFJMEIsS0FBSyxDQUFDQyxPQUFPLENBQUMzQixLQUFLLENBQUMsSUFBSUEsS0FBSyxDQUFDN0QsTUFBTSxLQUFLc0YsT0FBTztRQUNsRTtNQUNGLENBQUM7TUFDRFcsS0FBSyxFQUFFO1FBQ0w7UUFDQTtRQUNBO1FBQ0E7UUFDQUMscUJBQXFCLEVBQUUsSUFBSTtRQUMzQmIsc0JBQXNCQSxDQUFDQyxPQUFPLEVBQUU7VUFDOUIsSUFBSSxPQUFPQSxPQUFPLEtBQUssUUFBUSxFQUFFO1lBQy9CLE1BQU1hLGVBQWUsR0FBRztjQUN0QixRQUFRLEVBQUUsQ0FBQztjQUNYLFFBQVEsRUFBRSxDQUFDO2NBQ1gsUUFBUSxFQUFFLENBQUM7Y0FDWCxPQUFPLEVBQUUsQ0FBQztjQUNWLFNBQVMsRUFBRSxDQUFDO2NBQ1osV0FBVyxFQUFFLENBQUM7Y0FDZCxVQUFVLEVBQUUsQ0FBQztjQUNiLE1BQU0sRUFBRSxDQUFDO2NBQ1QsTUFBTSxFQUFFLENBQUM7Y0FDVCxNQUFNLEVBQUUsRUFBRTtjQUNWLE9BQU8sRUFBRSxFQUFFO2NBQ1gsV0FBVyxFQUFFLEVBQUU7Y0FDZixZQUFZLEVBQUUsRUFBRTtjQUNoQixRQUFRLEVBQUUsRUFBRTtjQUNaLHFCQUFxQixFQUFFLEVBQUU7Y0FDekIsS0FBSyxFQUFFLEVBQUU7Y0FDVCxXQUFXLEVBQUUsRUFBRTtjQUNmLE1BQU0sRUFBRSxFQUFFO2NBQ1YsU0FBUyxFQUFFLEVBQUU7Y0FDYixRQUFRLEVBQUUsQ0FBQyxDQUFDO2NBQ1osUUFBUSxFQUFFO1lBQ1osQ0FBQztZQUNELElBQUksQ0FBQ3RJLE1BQU0sQ0FBQzBFLElBQUksQ0FBQzRELGVBQWUsRUFBRWIsT0FBTyxDQUFDLEVBQUU7Y0FDMUMsTUFBTUcsS0FBSyxvQ0FBQWpHLE1BQUEsQ0FBb0M4RixPQUFPLENBQUUsQ0FBQztZQUMzRDtZQUNBQSxPQUFPLEdBQUdhLGVBQWUsQ0FBQ2IsT0FBTyxDQUFDO1VBQ3BDLENBQUMsTUFBTSxJQUFJLE9BQU9BLE9BQU8sS0FBSyxRQUFRLEVBQUU7WUFDdEMsSUFBSUEsT0FBTyxLQUFLLENBQUMsSUFBSUEsT0FBTyxHQUFHLENBQUMsQ0FBQyxJQUMzQkEsT0FBTyxHQUFHLEVBQUUsSUFBSUEsT0FBTyxLQUFLLEdBQUksRUFBRTtjQUN0QyxNQUFNRyxLQUFLLGtDQUFBakcsTUFBQSxDQUFrQzhGLE9BQU8sQ0FBRSxDQUFDO1lBQ3pEO1VBQ0YsQ0FBQyxNQUFNO1lBQ0wsTUFBTUcsS0FBSyxDQUFDLCtDQUErQyxDQUFDO1VBQzlEO1VBRUEsT0FBTzVCLEtBQUssSUFDVkEsS0FBSyxLQUFLcEMsU0FBUyxJQUFJYixlQUFlLENBQUN3RixFQUFFLENBQUNDLEtBQUssQ0FBQ3hDLEtBQUssQ0FBQyxLQUFLeUIsT0FDNUQ7UUFDSDtNQUNGLENBQUM7TUFDRGdCLFdBQVcsRUFBRTtRQUNYakIsc0JBQXNCQSxDQUFDQyxPQUFPLEVBQUU7VUFDOUIsTUFBTWlCLElBQUksR0FBR0MsaUJBQWlCLENBQUNsQixPQUFPLEVBQUUsYUFBYSxDQUFDO1VBQ3RELE9BQU96QixLQUFLLElBQUk7WUFDZCxNQUFNNEMsT0FBTyxHQUFHQyxlQUFlLENBQUM3QyxLQUFLLEVBQUUwQyxJQUFJLENBQUN2RyxNQUFNLENBQUM7WUFDbkQsT0FBT3lHLE9BQU8sSUFBSUYsSUFBSSxDQUFDL0MsS0FBSyxDQUFDLENBQUNtRCxJQUFJLEVBQUU3RyxDQUFDLEtBQUssQ0FBQzJHLE9BQU8sQ0FBQzNHLENBQUMsQ0FBQyxHQUFHNkcsSUFBSSxNQUFNQSxJQUFJLENBQUM7VUFDekUsQ0FBQztRQUNIO01BQ0YsQ0FBQztNQUNEQyxXQUFXLEVBQUU7UUFDWHZCLHNCQUFzQkEsQ0FBQ0MsT0FBTyxFQUFFO1VBQzlCLE1BQU1pQixJQUFJLEdBQUdDLGlCQUFpQixDQUFDbEIsT0FBTyxFQUFFLGFBQWEsQ0FBQztVQUN0RCxPQUFPekIsS0FBSyxJQUFJO1lBQ2QsTUFBTTRDLE9BQU8sR0FBR0MsZUFBZSxDQUFDN0MsS0FBSyxFQUFFMEMsSUFBSSxDQUFDdkcsTUFBTSxDQUFDO1lBQ25ELE9BQU95RyxPQUFPLElBQUlGLElBQUksQ0FBQzdHLElBQUksQ0FBQyxDQUFDaUgsSUFBSSxFQUFFN0csQ0FBQyxLQUFLLENBQUMsQ0FBQzJHLE9BQU8sQ0FBQzNHLENBQUMsQ0FBQyxHQUFHNkcsSUFBSSxNQUFNQSxJQUFJLENBQUM7VUFDekUsQ0FBQztRQUNIO01BQ0YsQ0FBQztNQUNERSxhQUFhLEVBQUU7UUFDYnhCLHNCQUFzQkEsQ0FBQ0MsT0FBTyxFQUFFO1VBQzlCLE1BQU1pQixJQUFJLEdBQUdDLGlCQUFpQixDQUFDbEIsT0FBTyxFQUFFLGVBQWUsQ0FBQztVQUN4RCxPQUFPekIsS0FBSyxJQUFJO1lBQ2QsTUFBTTRDLE9BQU8sR0FBR0MsZUFBZSxDQUFDN0MsS0FBSyxFQUFFMEMsSUFBSSxDQUFDdkcsTUFBTSxDQUFDO1lBQ25ELE9BQU95RyxPQUFPLElBQUlGLElBQUksQ0FBQy9DLEtBQUssQ0FBQyxDQUFDbUQsSUFBSSxFQUFFN0csQ0FBQyxLQUFLLEVBQUUyRyxPQUFPLENBQUMzRyxDQUFDLENBQUMsR0FBRzZHLElBQUksQ0FBQyxDQUFDO1VBQ2pFLENBQUM7UUFDSDtNQUNGLENBQUM7TUFDREcsYUFBYSxFQUFFO1FBQ2J6QixzQkFBc0JBLENBQUNDLE9BQU8sRUFBRTtVQUM5QixNQUFNaUIsSUFBSSxHQUFHQyxpQkFBaUIsQ0FBQ2xCLE9BQU8sRUFBRSxlQUFlLENBQUM7VUFDeEQsT0FBT3pCLEtBQUssSUFBSTtZQUNkLE1BQU00QyxPQUFPLEdBQUdDLGVBQWUsQ0FBQzdDLEtBQUssRUFBRTBDLElBQUksQ0FBQ3ZHLE1BQU0sQ0FBQztZQUNuRCxPQUFPeUcsT0FBTyxJQUFJRixJQUFJLENBQUM3RyxJQUFJLENBQUMsQ0FBQ2lILElBQUksRUFBRTdHLENBQUMsS0FBSyxDQUFDMkcsT0FBTyxDQUFDM0csQ0FBQyxDQUFDLEdBQUc2RyxJQUFJLE1BQU1BLElBQUksQ0FBQztVQUN4RSxDQUFDO1FBQ0g7TUFDRixDQUFDO01BQ0RJLE1BQU0sRUFBRTtRQUNOMUIsc0JBQXNCQSxDQUFDQyxPQUFPLEVBQUUzRCxhQUFhLEVBQUU7VUFDN0MsSUFBSSxFQUFFLE9BQU8yRCxPQUFPLEtBQUssUUFBUSxJQUFJQSxPQUFPLFlBQVlRLE1BQU0sQ0FBQyxFQUFFO1lBQy9ELE1BQU1MLEtBQUssQ0FBQyxxQ0FBcUMsQ0FBQztVQUNwRDtVQUVBLElBQUl1QixNQUFNO1VBQ1YsSUFBSXJGLGFBQWEsQ0FBQ3NGLFFBQVEsS0FBS3hGLFNBQVMsRUFBRTtZQUN4QztZQUNBOztZQUVBO1lBQ0E7WUFDQTtZQUNBLElBQUksUUFBUSxDQUFDeUYsSUFBSSxDQUFDdkYsYUFBYSxDQUFDc0YsUUFBUSxDQUFDLEVBQUU7Y0FDekMsTUFBTSxJQUFJeEIsS0FBSyxDQUFDLG1EQUFtRCxDQUFDO1lBQ3RFO1lBRUEsTUFBTTBCLE1BQU0sR0FBRzdCLE9BQU8sWUFBWVEsTUFBTSxHQUFHUixPQUFPLENBQUM2QixNQUFNLEdBQUc3QixPQUFPO1lBQ25FMEIsTUFBTSxHQUFHLElBQUlsQixNQUFNLENBQUNxQixNQUFNLEVBQUV4RixhQUFhLENBQUNzRixRQUFRLENBQUM7VUFDckQsQ0FBQyxNQUFNLElBQUkzQixPQUFPLFlBQVlRLE1BQU0sRUFBRTtZQUNwQ2tCLE1BQU0sR0FBRzFCLE9BQU87VUFDbEIsQ0FBQyxNQUFNO1lBQ0wwQixNQUFNLEdBQUcsSUFBSWxCLE1BQU0sQ0FBQ1IsT0FBTyxDQUFDO1VBQzlCO1VBRUEsT0FBT1gsb0JBQW9CLENBQUNxQyxNQUFNLENBQUM7UUFDckM7TUFDRixDQUFDO01BQ0RJLFVBQVUsRUFBRTtRQUNWcEIsb0JBQW9CLEVBQUUsSUFBSTtRQUMxQlgsc0JBQXNCQSxDQUFDQyxPQUFPLEVBQUUzRCxhQUFhLEVBQUVHLE9BQU8sRUFBRTtVQUN0RCxJQUFJLENBQUNsQixlQUFlLENBQUN5RyxjQUFjLENBQUMvQixPQUFPLENBQUMsRUFBRTtZQUM1QyxNQUFNRyxLQUFLLENBQUMsMkJBQTJCLENBQUM7VUFDMUM7VUFFQSxNQUFNNkIsWUFBWSxHQUFHLENBQUN2SixnQkFBZ0IsQ0FDcENrQixNQUFNLENBQUNRLElBQUksQ0FBQzZGLE9BQU8sQ0FBQyxDQUNqQjVHLE1BQU0sQ0FBQ2tGLEdBQUcsSUFBSSxDQUFDL0YsTUFBTSxDQUFDMEUsSUFBSSxDQUFDZ0YsaUJBQWlCLEVBQUUzRCxHQUFHLENBQUMsQ0FBQyxDQUNuRDRELE1BQU0sQ0FBQyxDQUFDQyxDQUFDLEVBQUVDLENBQUMsS0FBS3pJLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDdUksQ0FBQyxFQUFFO1lBQUMsQ0FBQ0MsQ0FBQyxHQUFHcEMsT0FBTyxDQUFDb0MsQ0FBQztVQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQzVELElBQUksQ0FBQztVQUVQLElBQUlDLFVBQVU7VUFDZCxJQUFJTCxZQUFZLEVBQUU7WUFDaEI7WUFDQTtZQUNBO1lBQ0E7WUFDQUssVUFBVSxHQUNSdkQsdUJBQXVCLENBQUNrQixPQUFPLEVBQUV4RCxPQUFPLEVBQUU7Y0FBQzhGLFdBQVcsRUFBRTtZQUFJLENBQUMsQ0FBQztVQUNsRSxDQUFDLE1BQU07WUFDTEQsVUFBVSxHQUFHRSxvQkFBb0IsQ0FBQ3ZDLE9BQU8sRUFBRXhELE9BQU8sQ0FBQztVQUNyRDtVQUVBLE9BQU8rQixLQUFLLElBQUk7WUFDZCxJQUFJLENBQUMwQixLQUFLLENBQUNDLE9BQU8sQ0FBQzNCLEtBQUssQ0FBQyxFQUFFO2NBQ3pCLE9BQU8sS0FBSztZQUNkO1lBRUEsS0FBSyxJQUFJL0QsQ0FBQyxHQUFHLENBQUMsRUFBRUEsQ0FBQyxHQUFHK0QsS0FBSyxDQUFDN0QsTUFBTSxFQUFFLEVBQUVGLENBQUMsRUFBRTtjQUNyQyxNQUFNZ0ksWUFBWSxHQUFHakUsS0FBSyxDQUFDL0QsQ0FBQyxDQUFDO2NBQzdCLElBQUlpSSxHQUFHO2NBQ1AsSUFBSVQsWUFBWSxFQUFFO2dCQUNoQjtnQkFDQTtnQkFDQTtnQkFDQSxJQUFJLENBQUMvQyxXQUFXLENBQUN1RCxZQUFZLENBQUMsRUFBRTtrQkFDOUIsT0FBTyxLQUFLO2dCQUNkO2dCQUVBQyxHQUFHLEdBQUdELFlBQVk7Y0FDcEIsQ0FBQyxNQUFNO2dCQUNMO2dCQUNBO2dCQUNBQyxHQUFHLEdBQUcsQ0FBQztrQkFBQ2xFLEtBQUssRUFBRWlFLFlBQVk7a0JBQUVFLFdBQVcsRUFBRTtnQkFBSSxDQUFDLENBQUM7Y0FDbEQ7Y0FDQTtjQUNBLElBQUlMLFVBQVUsQ0FBQ0ksR0FBRyxDQUFDLENBQUM3RyxNQUFNLEVBQUU7Z0JBQzFCLE9BQU9wQixDQUFDLENBQUMsQ0FBQztjQUNaO1lBQ0Y7WUFFQSxPQUFPLEtBQUs7VUFDZCxDQUFDO1FBQ0g7TUFDRjtJQUNGLENBQUM7SUFFRDtJQUNBLE1BQU15SCxpQkFBaUIsR0FBRztNQUN4QlUsSUFBSUEsQ0FBQ0MsV0FBVyxFQUFFcEcsT0FBTyxFQUFFOEYsV0FBVyxFQUFFO1FBQ3RDLE9BQU9PLG1CQUFtQixDQUN4QkMsK0JBQStCLENBQUNGLFdBQVcsRUFBRXBHLE9BQU8sRUFBRThGLFdBQVcsQ0FDbkUsQ0FBQztNQUNILENBQUM7TUFFRFMsR0FBR0EsQ0FBQ0gsV0FBVyxFQUFFcEcsT0FBTyxFQUFFOEYsV0FBVyxFQUFFO1FBQ3JDLE1BQU1VLFFBQVEsR0FBR0YsK0JBQStCLENBQzlDRixXQUFXLEVBQ1hwRyxPQUFPLEVBQ1A4RixXQUNGLENBQUM7O1FBRUQ7UUFDQTtRQUNBLElBQUlVLFFBQVEsQ0FBQ3RJLE1BQU0sS0FBSyxDQUFDLEVBQUU7VUFDekIsT0FBT3NJLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDcEI7UUFFQSxPQUFPQyxHQUFHLElBQUk7VUFDWixNQUFNckgsTUFBTSxHQUFHb0gsUUFBUSxDQUFDNUksSUFBSSxDQUFDOEksRUFBRSxJQUFJQSxFQUFFLENBQUNELEdBQUcsQ0FBQyxDQUFDckgsTUFBTSxDQUFDO1VBQ2xEO1VBQ0E7VUFDQSxPQUFPO1lBQUNBO1VBQU0sQ0FBQztRQUNqQixDQUFDO01BQ0gsQ0FBQztNQUVEdUgsSUFBSUEsQ0FBQ1AsV0FBVyxFQUFFcEcsT0FBTyxFQUFFOEYsV0FBVyxFQUFFO1FBQ3RDLE1BQU1VLFFBQVEsR0FBR0YsK0JBQStCLENBQzlDRixXQUFXLEVBQ1hwRyxPQUFPLEVBQ1A4RixXQUNGLENBQUM7UUFDRCxPQUFPVyxHQUFHLElBQUk7VUFDWixNQUFNckgsTUFBTSxHQUFHb0gsUUFBUSxDQUFDOUUsS0FBSyxDQUFDZ0YsRUFBRSxJQUFJLENBQUNBLEVBQUUsQ0FBQ0QsR0FBRyxDQUFDLENBQUNySCxNQUFNLENBQUM7VUFDcEQ7VUFDQTtVQUNBLE9BQU87WUFBQ0E7VUFBTSxDQUFDO1FBQ2pCLENBQUM7TUFDSCxDQUFDO01BRUR3SCxNQUFNQSxDQUFDQyxhQUFhLEVBQUU3RyxPQUFPLEVBQUU7UUFDN0I7UUFDQUEsT0FBTyxDQUFDOEcsZUFBZSxDQUFDLEVBQUUsQ0FBQztRQUMzQjlHLE9BQU8sQ0FBQytHLFNBQVMsR0FBRyxJQUFJO1FBRXhCLElBQUksRUFBRUYsYUFBYSxZQUFZRyxRQUFRLENBQUMsRUFBRTtVQUN4QztVQUNBO1VBQ0FILGFBQWEsR0FBR0csUUFBUSxDQUFDLEtBQUssWUFBQXRKLE1BQUEsQ0FBWW1KLGFBQWEsQ0FBRSxDQUFDO1FBQzVEOztRQUVBO1FBQ0E7UUFDQSxPQUFPSixHQUFHLEtBQUs7VUFBQ3JILE1BQU0sRUFBRXlILGFBQWEsQ0FBQ3BHLElBQUksQ0FBQ2dHLEdBQUcsRUFBRUEsR0FBRztRQUFDLENBQUMsQ0FBQztNQUN4RCxDQUFDO01BRUQ7TUFDQTtNQUNBUSxRQUFRQSxDQUFBLEVBQUc7UUFDVCxPQUFPLE9BQU87VUFBQzdILE1BQU0sRUFBRTtRQUFJLENBQUMsQ0FBQztNQUMvQjtJQUNGLENBQUM7O0lBRUQ7SUFDQTtJQUNBO0lBQ0E7SUFDQSxNQUFNOEgsZUFBZSxHQUFHO01BQ3RCcEgsR0FBR0EsQ0FBQzBELE9BQU8sRUFBRTtRQUNYLE9BQU8yRCxzQ0FBc0MsQ0FDM0M1RSxzQkFBc0IsQ0FBQ2lCLE9BQU8sQ0FDaEMsQ0FBQztNQUNILENBQUM7TUFDRDRELElBQUlBLENBQUM1RCxPQUFPLEVBQUUzRCxhQUFhLEVBQUVHLE9BQU8sRUFBRTtRQUNwQyxPQUFPcUgscUJBQXFCLENBQUN0QixvQkFBb0IsQ0FBQ3ZDLE9BQU8sRUFBRXhELE9BQU8sQ0FBQyxDQUFDO01BQ3RFLENBQUM7TUFDRHNILEdBQUdBLENBQUM5RCxPQUFPLEVBQUU7UUFDWCxPQUFPNkQscUJBQXFCLENBQzFCRixzQ0FBc0MsQ0FBQzVFLHNCQUFzQixDQUFDaUIsT0FBTyxDQUFDLENBQ3hFLENBQUM7TUFDSCxDQUFDO01BQ0QrRCxJQUFJQSxDQUFDL0QsT0FBTyxFQUFFO1FBQ1osT0FBTzZELHFCQUFxQixDQUMxQkYsc0NBQXNDLENBQ3BDOUUsaUJBQWlCLENBQUN0QyxHQUFHLENBQUN3RCxzQkFBc0IsQ0FBQ0MsT0FBTyxDQUN0RCxDQUNGLENBQUM7TUFDSCxDQUFDO01BQ0RnRSxPQUFPQSxDQUFDaEUsT0FBTyxFQUFFO1FBQ2YsTUFBTWlFLE1BQU0sR0FBR04sc0NBQXNDLENBQ25EcEYsS0FBSyxJQUFJQSxLQUFLLEtBQUtwQyxTQUNyQixDQUFDO1FBQ0QsT0FBTzZELE9BQU8sR0FBR2lFLE1BQU0sR0FBR0oscUJBQXFCLENBQUNJLE1BQU0sQ0FBQztNQUN6RCxDQUFDO01BQ0Q7TUFDQXRDLFFBQVFBLENBQUMzQixPQUFPLEVBQUUzRCxhQUFhLEVBQUU7UUFDL0IsSUFBSSxDQUFDOUQsTUFBTSxDQUFDMEUsSUFBSSxDQUFDWixhQUFhLEVBQUUsUUFBUSxDQUFDLEVBQUU7VUFDekMsTUFBTThELEtBQUssQ0FBQyx5QkFBeUIsQ0FBQztRQUN4QztRQUVBLE9BQU8rRCxpQkFBaUI7TUFDMUIsQ0FBQztNQUNEO01BQ0FDLFlBQVlBLENBQUNuRSxPQUFPLEVBQUUzRCxhQUFhLEVBQUU7UUFDbkMsSUFBSSxDQUFDQSxhQUFhLENBQUMrSCxLQUFLLEVBQUU7VUFDeEIsTUFBTWpFLEtBQUssQ0FBQyw0QkFBNEIsQ0FBQztRQUMzQztRQUVBLE9BQU8rRCxpQkFBaUI7TUFDMUIsQ0FBQztNQUNERyxJQUFJQSxDQUFDckUsT0FBTyxFQUFFM0QsYUFBYSxFQUFFRyxPQUFPLEVBQUU7UUFDcEMsSUFBSSxDQUFDeUQsS0FBSyxDQUFDQyxPQUFPLENBQUNGLE9BQU8sQ0FBQyxFQUFFO1VBQzNCLE1BQU1HLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQztRQUNwQzs7UUFFQTtRQUNBLElBQUlILE9BQU8sQ0FBQ3RGLE1BQU0sS0FBSyxDQUFDLEVBQUU7VUFDeEIsT0FBT3lFLGNBQWM7UUFDdkI7UUFFQSxNQUFNbUYsZ0JBQWdCLEdBQUd0RSxPQUFPLENBQUMvRyxHQUFHLENBQUNzTCxTQUFTLElBQUk7VUFDaEQ7VUFDQSxJQUFJOUwsZ0JBQWdCLENBQUM4TCxTQUFTLENBQUMsRUFBRTtZQUMvQixNQUFNcEUsS0FBSyxDQUFDLDBCQUEwQixDQUFDO1VBQ3pDOztVQUVBO1VBQ0EsT0FBT29DLG9CQUFvQixDQUFDZ0MsU0FBUyxFQUFFL0gsT0FBTyxDQUFDO1FBQ2pELENBQUMsQ0FBQzs7UUFFRjtRQUNBO1FBQ0EsT0FBT2dJLG1CQUFtQixDQUFDRixnQkFBZ0IsQ0FBQztNQUM5QyxDQUFDO01BQ0RGLEtBQUtBLENBQUNwRSxPQUFPLEVBQUUzRCxhQUFhLEVBQUVHLE9BQU8sRUFBRWlJLE1BQU0sRUFBRTtRQUM3QyxJQUFJLENBQUNBLE1BQU0sRUFBRTtVQUNYLE1BQU10RSxLQUFLLENBQUMsMkNBQTJDLENBQUM7UUFDMUQ7UUFFQTNELE9BQU8sQ0FBQ2tJLFlBQVksR0FBRyxJQUFJOztRQUUzQjtRQUNBO1FBQ0E7UUFDQTtRQUNBLElBQUlDLFdBQVcsRUFBRUMsS0FBSyxFQUFFQyxRQUFRO1FBQ2hDLElBQUl2SixlQUFlLENBQUN5RyxjQUFjLENBQUMvQixPQUFPLENBQUMsSUFBSXpILE1BQU0sQ0FBQzBFLElBQUksQ0FBQytDLE9BQU8sRUFBRSxXQUFXLENBQUMsRUFBRTtVQUNoRjtVQUNBMkUsV0FBVyxHQUFHM0UsT0FBTyxDQUFDbUUsWUFBWTtVQUNsQ1MsS0FBSyxHQUFHNUUsT0FBTyxDQUFDOEUsU0FBUztVQUN6QkQsUUFBUSxHQUFHdEcsS0FBSyxJQUFJO1lBQ2xCO1lBQ0E7WUFDQTtZQUNBLElBQUksQ0FBQ0EsS0FBSyxFQUFFO2NBQ1YsT0FBTyxJQUFJO1lBQ2I7WUFFQSxJQUFJLENBQUNBLEtBQUssQ0FBQ3dHLElBQUksRUFBRTtjQUNmLE9BQU9DLE9BQU8sQ0FBQ0MsYUFBYSxDQUMxQkwsS0FBSyxFQUNMO2dCQUFDRyxJQUFJLEVBQUUsT0FBTztnQkFBRUcsV0FBVyxFQUFFQyxZQUFZLENBQUM1RyxLQUFLO2NBQUMsQ0FDbEQsQ0FBQztZQUNIO1lBRUEsSUFBSUEsS0FBSyxDQUFDd0csSUFBSSxLQUFLLE9BQU8sRUFBRTtjQUMxQixPQUFPQyxPQUFPLENBQUNDLGFBQWEsQ0FBQ0wsS0FBSyxFQUFFckcsS0FBSyxDQUFDO1lBQzVDO1lBRUEsT0FBT3lHLE9BQU8sQ0FBQ0ksb0JBQW9CLENBQUM3RyxLQUFLLEVBQUVxRyxLQUFLLEVBQUVELFdBQVcsQ0FBQyxHQUMxRCxDQUFDLEdBQ0RBLFdBQVcsR0FBRyxDQUFDO1VBQ3JCLENBQUM7UUFDSCxDQUFDLE1BQU07VUFDTEEsV0FBVyxHQUFHdEksYUFBYSxDQUFDOEgsWUFBWTtVQUV4QyxJQUFJLENBQUNsRixXQUFXLENBQUNlLE9BQU8sQ0FBQyxFQUFFO1lBQ3pCLE1BQU1HLEtBQUssQ0FBQyxtREFBbUQsQ0FBQztVQUNsRTtVQUVBeUUsS0FBSyxHQUFHTyxZQUFZLENBQUNuRixPQUFPLENBQUM7VUFFN0I2RSxRQUFRLEdBQUd0RyxLQUFLLElBQUk7WUFDbEIsSUFBSSxDQUFDVSxXQUFXLENBQUNWLEtBQUssQ0FBQyxFQUFFO2NBQ3ZCLE9BQU8sSUFBSTtZQUNiO1lBRUEsT0FBTzhHLHVCQUF1QixDQUFDVCxLQUFLLEVBQUVyRyxLQUFLLENBQUM7VUFDOUMsQ0FBQztRQUNIO1FBRUEsT0FBTytHLGNBQWMsSUFBSTtVQUN2QjtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0EsTUFBTTFKLE1BQU0sR0FBRztZQUFDQSxNQUFNLEVBQUU7VUFBSyxDQUFDO1VBQzlCb0Qsc0JBQXNCLENBQUNzRyxjQUFjLENBQUMsQ0FBQ3BILEtBQUssQ0FBQ3FILE1BQU0sSUFBSTtZQUNyRDtZQUNBO1lBQ0EsSUFBSUMsV0FBVztZQUNmLElBQUksQ0FBQ2hKLE9BQU8sQ0FBQ2lKLFNBQVMsRUFBRTtjQUN0QixJQUFJLEVBQUUsT0FBT0YsTUFBTSxDQUFDaEgsS0FBSyxLQUFLLFFBQVEsQ0FBQyxFQUFFO2dCQUN2QyxPQUFPLElBQUk7Y0FDYjtjQUVBaUgsV0FBVyxHQUFHWCxRQUFRLENBQUNVLE1BQU0sQ0FBQ2hILEtBQUssQ0FBQzs7Y0FFcEM7Y0FDQSxJQUFJaUgsV0FBVyxLQUFLLElBQUksSUFBSUEsV0FBVyxHQUFHYixXQUFXLEVBQUU7Z0JBQ3JELE9BQU8sSUFBSTtjQUNiOztjQUVBO2NBQ0EsSUFBSS9JLE1BQU0sQ0FBQ2lKLFFBQVEsS0FBSzFJLFNBQVMsSUFBSVAsTUFBTSxDQUFDaUosUUFBUSxJQUFJVyxXQUFXLEVBQUU7Z0JBQ25FLE9BQU8sSUFBSTtjQUNiO1lBQ0Y7WUFFQTVKLE1BQU0sQ0FBQ0EsTUFBTSxHQUFHLElBQUk7WUFDcEJBLE1BQU0sQ0FBQ2lKLFFBQVEsR0FBR1csV0FBVztZQUU3QixJQUFJRCxNQUFNLENBQUNHLFlBQVksRUFBRTtjQUN2QjlKLE1BQU0sQ0FBQzhKLFlBQVksR0FBR0gsTUFBTSxDQUFDRyxZQUFZO1lBQzNDLENBQUMsTUFBTTtjQUNMLE9BQU85SixNQUFNLENBQUM4SixZQUFZO1lBQzVCO1lBRUEsT0FBTyxDQUFDbEosT0FBTyxDQUFDaUosU0FBUztVQUMzQixDQUFDLENBQUM7VUFFRixPQUFPN0osTUFBTTtRQUNmLENBQUM7TUFDSDtJQUNGLENBQUM7O0lBRUQ7SUFDQTtJQUNBO0lBQ0E7SUFDQSxTQUFTK0osZUFBZUEsQ0FBQ0MsV0FBVyxFQUFFO01BQ3BDLElBQUlBLFdBQVcsQ0FBQ2xMLE1BQU0sS0FBSyxDQUFDLEVBQUU7UUFDNUIsT0FBT3dKLGlCQUFpQjtNQUMxQjtNQUVBLElBQUkwQixXQUFXLENBQUNsTCxNQUFNLEtBQUssQ0FBQyxFQUFFO1FBQzVCLE9BQU9rTCxXQUFXLENBQUMsQ0FBQyxDQUFDO01BQ3ZCO01BRUEsT0FBT0MsYUFBYSxJQUFJO1FBQ3RCLE1BQU1DLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDaEJBLEtBQUssQ0FBQ2xLLE1BQU0sR0FBR2dLLFdBQVcsQ0FBQzFILEtBQUssQ0FBQ2dGLEVBQUUsSUFBSTtVQUNyQyxNQUFNNkMsU0FBUyxHQUFHN0MsRUFBRSxDQUFDMkMsYUFBYSxDQUFDOztVQUVuQztVQUNBO1VBQ0E7VUFDQTtVQUNBLElBQUlFLFNBQVMsQ0FBQ25LLE1BQU0sSUFDaEJtSyxTQUFTLENBQUNsQixRQUFRLEtBQUsxSSxTQUFTLElBQ2hDMkosS0FBSyxDQUFDakIsUUFBUSxLQUFLMUksU0FBUyxFQUFFO1lBQ2hDMkosS0FBSyxDQUFDakIsUUFBUSxHQUFHa0IsU0FBUyxDQUFDbEIsUUFBUTtVQUNyQzs7VUFFQTtVQUNBO1VBQ0E7VUFDQSxJQUFJa0IsU0FBUyxDQUFDbkssTUFBTSxJQUFJbUssU0FBUyxDQUFDTCxZQUFZLEVBQUU7WUFDOUNJLEtBQUssQ0FBQ0osWUFBWSxHQUFHSyxTQUFTLENBQUNMLFlBQVk7VUFDN0M7VUFFQSxPQUFPSyxTQUFTLENBQUNuSyxNQUFNO1FBQ3pCLENBQUMsQ0FBQzs7UUFFRjtRQUNBLElBQUksQ0FBQ2tLLEtBQUssQ0FBQ2xLLE1BQU0sRUFBRTtVQUNqQixPQUFPa0ssS0FBSyxDQUFDakIsUUFBUTtVQUNyQixPQUFPaUIsS0FBSyxDQUFDSixZQUFZO1FBQzNCO1FBRUEsT0FBT0ksS0FBSztNQUNkLENBQUM7SUFDSDtJQUVBLE1BQU1qRCxtQkFBbUIsR0FBRzhDLGVBQWU7SUFDM0MsTUFBTW5CLG1CQUFtQixHQUFHbUIsZUFBZTtJQUUzQyxTQUFTN0MsK0JBQStCQSxDQUFDa0QsU0FBUyxFQUFFeEosT0FBTyxFQUFFOEYsV0FBVyxFQUFFO01BQ3hFLElBQUksQ0FBQ3JDLEtBQUssQ0FBQ0MsT0FBTyxDQUFDOEYsU0FBUyxDQUFDLElBQUlBLFNBQVMsQ0FBQ3RMLE1BQU0sS0FBSyxDQUFDLEVBQUU7UUFDdkQsTUFBTXlGLEtBQUssQ0FBQyxzQ0FBc0MsQ0FBQztNQUNyRDtNQUVBLE9BQU82RixTQUFTLENBQUMvTSxHQUFHLENBQUMySixXQUFXLElBQUk7UUFDbEMsSUFBSSxDQUFDdEgsZUFBZSxDQUFDeUcsY0FBYyxDQUFDYSxXQUFXLENBQUMsRUFBRTtVQUNoRCxNQUFNekMsS0FBSyxDQUFDLCtDQUErQyxDQUFDO1FBQzlEO1FBRUEsT0FBT3JCLHVCQUF1QixDQUFDOEQsV0FBVyxFQUFFcEcsT0FBTyxFQUFFO1VBQUM4RjtRQUFXLENBQUMsQ0FBQztNQUNyRSxDQUFDLENBQUM7SUFDSjs7SUFFQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNPLFNBQVN4RCx1QkFBdUJBLENBQUNtSCxXQUFXLEVBQUV6SixPQUFPLEVBQWdCO01BQUEsSUFBZDBKLE9BQU8sR0FBQTdILFNBQUEsQ0FBQTNELE1BQUEsUUFBQTJELFNBQUEsUUFBQWxDLFNBQUEsR0FBQWtDLFNBQUEsTUFBRyxDQUFDLENBQUM7TUFDeEUsTUFBTThILFdBQVcsR0FBR3hNLE1BQU0sQ0FBQ1EsSUFBSSxDQUFDOEwsV0FBVyxDQUFDLENBQUNoTixHQUFHLENBQUNxRixHQUFHLElBQUk7UUFDdEQsTUFBTXNFLFdBQVcsR0FBR3FELFdBQVcsQ0FBQzNILEdBQUcsQ0FBQztRQUVwQyxJQUFJQSxHQUFHLENBQUM4SCxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLEdBQUcsRUFBRTtVQUM1QjtVQUNBO1VBQ0EsSUFBSSxDQUFDN04sTUFBTSxDQUFDMEUsSUFBSSxDQUFDZ0YsaUJBQWlCLEVBQUUzRCxHQUFHLENBQUMsRUFBRTtZQUN4QyxNQUFNLElBQUk2QixLQUFLLG1DQUFBakcsTUFBQSxDQUFtQ29FLEdBQUcsQ0FBRSxDQUFDO1VBQzFEO1VBRUE5QixPQUFPLENBQUM2SixTQUFTLEdBQUcsS0FBSztVQUN6QixPQUFPcEUsaUJBQWlCLENBQUMzRCxHQUFHLENBQUMsQ0FBQ3NFLFdBQVcsRUFBRXBHLE9BQU8sRUFBRTBKLE9BQU8sQ0FBQzVELFdBQVcsQ0FBQztRQUMxRTs7UUFFQTtRQUNBO1FBQ0E7UUFDQSxJQUFJLENBQUM0RCxPQUFPLENBQUM1RCxXQUFXLEVBQUU7VUFDeEI5RixPQUFPLENBQUM4RyxlQUFlLENBQUNoRixHQUFHLENBQUM7UUFDOUI7O1FBRUE7UUFDQTtRQUNBO1FBQ0EsSUFBSSxPQUFPc0UsV0FBVyxLQUFLLFVBQVUsRUFBRTtVQUNyQyxPQUFPekcsU0FBUztRQUNsQjtRQUVBLE1BQU1tSyxhQUFhLEdBQUdwSCxrQkFBa0IsQ0FBQ1osR0FBRyxDQUFDO1FBQzdDLE1BQU1pSSxZQUFZLEdBQUdoRSxvQkFBb0IsQ0FDdkNLLFdBQVcsRUFDWHBHLE9BQU8sRUFDUDBKLE9BQU8sQ0FBQ3pCLE1BQ1YsQ0FBQztRQUVELE9BQU94QixHQUFHLElBQUlzRCxZQUFZLENBQUNELGFBQWEsQ0FBQ3JELEdBQUcsQ0FBQyxDQUFDO01BQ2hELENBQUMsQ0FBQyxDQUFDN0osTUFBTSxDQUFDb04sT0FBTyxDQUFDO01BRWxCLE9BQU8zRCxtQkFBbUIsQ0FBQ3NELFdBQVcsQ0FBQztJQUN6QztJQUVBO0lBQ0E7SUFDQTtJQUNBO0lBQ0EsU0FBUzVELG9CQUFvQkEsQ0FBQ2xHLGFBQWEsRUFBRUcsT0FBTyxFQUFFaUksTUFBTSxFQUFFO01BQzVELElBQUlwSSxhQUFhLFlBQVltRSxNQUFNLEVBQUU7UUFDbkNoRSxPQUFPLENBQUM2SixTQUFTLEdBQUcsS0FBSztRQUN6QixPQUFPMUMsc0NBQXNDLENBQzNDdEUsb0JBQW9CLENBQUNoRCxhQUFhLENBQ3BDLENBQUM7TUFDSDtNQUVBLElBQUk1RCxnQkFBZ0IsQ0FBQzRELGFBQWEsQ0FBQyxFQUFFO1FBQ25DLE9BQU9vSyx1QkFBdUIsQ0FBQ3BLLGFBQWEsRUFBRUcsT0FBTyxFQUFFaUksTUFBTSxDQUFDO01BQ2hFO01BRUEsT0FBT2Qsc0NBQXNDLENBQzNDNUUsc0JBQXNCLENBQUMxQyxhQUFhLENBQ3RDLENBQUM7SUFDSDs7SUFFQTtJQUNBO0lBQ0E7SUFDQSxTQUFTc0gsc0NBQXNDQSxDQUFDK0MsY0FBYyxFQUFnQjtNQUFBLElBQWRSLE9BQU8sR0FBQTdILFNBQUEsQ0FBQTNELE1BQUEsUUFBQTJELFNBQUEsUUFBQWxDLFNBQUEsR0FBQWtDLFNBQUEsTUFBRyxDQUFDLENBQUM7TUFDMUUsT0FBT3NJLFFBQVEsSUFBSTtRQUNqQixNQUFNQyxRQUFRLEdBQUdWLE9BQU8sQ0FBQ3hGLG9CQUFvQixHQUN6Q2lHLFFBQVEsR0FDUjNILHNCQUFzQixDQUFDMkgsUUFBUSxFQUFFVCxPQUFPLENBQUN0RixxQkFBcUIsQ0FBQztRQUVuRSxNQUFNa0YsS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNoQkEsS0FBSyxDQUFDbEssTUFBTSxHQUFHZ0wsUUFBUSxDQUFDeE0sSUFBSSxDQUFDeU0sT0FBTyxJQUFJO1VBQ3RDLElBQUlDLE9BQU8sR0FBR0osY0FBYyxDQUFDRyxPQUFPLENBQUN0SSxLQUFLLENBQUM7O1VBRTNDO1VBQ0E7VUFDQSxJQUFJLE9BQU91SSxPQUFPLEtBQUssUUFBUSxFQUFFO1lBQy9CO1lBQ0E7WUFDQTtZQUNBLElBQUksQ0FBQ0QsT0FBTyxDQUFDbkIsWUFBWSxFQUFFO2NBQ3pCbUIsT0FBTyxDQUFDbkIsWUFBWSxHQUFHLENBQUNvQixPQUFPLENBQUM7WUFDbEM7WUFFQUEsT0FBTyxHQUFHLElBQUk7VUFDaEI7O1VBRUE7VUFDQTtVQUNBLElBQUlBLE9BQU8sSUFBSUQsT0FBTyxDQUFDbkIsWUFBWSxFQUFFO1lBQ25DSSxLQUFLLENBQUNKLFlBQVksR0FBR21CLE9BQU8sQ0FBQ25CLFlBQVk7VUFDM0M7VUFFQSxPQUFPb0IsT0FBTztRQUNoQixDQUFDLENBQUM7UUFFRixPQUFPaEIsS0FBSztNQUNkLENBQUM7SUFDSDs7SUFFQTtJQUNBLFNBQVNULHVCQUF1QkEsQ0FBQ2xELENBQUMsRUFBRUMsQ0FBQyxFQUFFO01BQ3JDLE1BQU0yRSxNQUFNLEdBQUc1QixZQUFZLENBQUNoRCxDQUFDLENBQUM7TUFDOUIsTUFBTTZFLE1BQU0sR0FBRzdCLFlBQVksQ0FBQy9DLENBQUMsQ0FBQztNQUU5QixPQUFPNkUsSUFBSSxDQUFDQyxLQUFLLENBQUNILE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBR0MsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFRCxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUdDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNqRTs7SUFFQTtJQUNBO0lBQ08sU0FBU2pJLHNCQUFzQkEsQ0FBQ29JLGVBQWUsRUFBRTtNQUN0RCxJQUFJMU8sZ0JBQWdCLENBQUMwTyxlQUFlLENBQUMsRUFBRTtRQUNyQyxNQUFNaEgsS0FBSyxDQUFDLHlEQUF5RCxDQUFDO01BQ3hFOztNQUVBO01BQ0E7TUFDQTtNQUNBO01BQ0EsSUFBSWdILGVBQWUsSUFBSSxJQUFJLEVBQUU7UUFDM0IsT0FBTzVJLEtBQUssSUFBSUEsS0FBSyxJQUFJLElBQUk7TUFDL0I7TUFFQSxPQUFPQSxLQUFLLElBQUlqRCxlQUFlLENBQUN3RixFQUFFLENBQUNzRyxNQUFNLENBQUNELGVBQWUsRUFBRTVJLEtBQUssQ0FBQztJQUNuRTtJQUVBLFNBQVMyRixpQkFBaUJBLENBQUNtRCxtQkFBbUIsRUFBRTtNQUM5QyxPQUFPO1FBQUN6TCxNQUFNLEVBQUU7TUFBSSxDQUFDO0lBQ3ZCO0lBRU8sU0FBU29ELHNCQUFzQkEsQ0FBQzJILFFBQVEsRUFBRVcsYUFBYSxFQUFFO01BQzlELE1BQU1DLFdBQVcsR0FBRyxFQUFFO01BRXRCWixRQUFRLENBQUM1SixPQUFPLENBQUN3SSxNQUFNLElBQUk7UUFDekIsTUFBTWlDLFdBQVcsR0FBR3ZILEtBQUssQ0FBQ0MsT0FBTyxDQUFDcUYsTUFBTSxDQUFDaEgsS0FBSyxDQUFDOztRQUUvQztRQUNBO1FBQ0E7UUFDQTtRQUNBLElBQUksRUFBRStJLGFBQWEsSUFBSUUsV0FBVyxJQUFJLENBQUNqQyxNQUFNLENBQUM3QyxXQUFXLENBQUMsRUFBRTtVQUMxRDZFLFdBQVcsQ0FBQ0UsSUFBSSxDQUFDO1lBQUMvQixZQUFZLEVBQUVILE1BQU0sQ0FBQ0csWUFBWTtZQUFFbkgsS0FBSyxFQUFFZ0gsTUFBTSxDQUFDaEg7VUFBSyxDQUFDLENBQUM7UUFDNUU7UUFFQSxJQUFJaUosV0FBVyxJQUFJLENBQUNqQyxNQUFNLENBQUM3QyxXQUFXLEVBQUU7VUFDdEM2QyxNQUFNLENBQUNoSCxLQUFLLENBQUN4QixPQUFPLENBQUMsQ0FBQ3dCLEtBQUssRUFBRS9ELENBQUMsS0FBSztZQUNqQytNLFdBQVcsQ0FBQ0UsSUFBSSxDQUFDO2NBQ2YvQixZQUFZLEVBQUUsQ0FBQ0gsTUFBTSxDQUFDRyxZQUFZLElBQUksRUFBRSxFQUFFeEwsTUFBTSxDQUFDTSxDQUFDLENBQUM7Y0FDbkQrRDtZQUNGLENBQUMsQ0FBQztVQUNKLENBQUMsQ0FBQztRQUNKO01BQ0YsQ0FBQyxDQUFDO01BRUYsT0FBT2dKLFdBQVc7SUFDcEI7SUFFQTtJQUNBLFNBQVNyRyxpQkFBaUJBLENBQUNsQixPQUFPLEVBQUVqQyxRQUFRLEVBQUU7TUFDNUM7TUFDQTtNQUNBO01BQ0E7TUFDQSxJQUFJMkosTUFBTSxDQUFDQyxTQUFTLENBQUMzSCxPQUFPLENBQUMsSUFBSUEsT0FBTyxJQUFJLENBQUMsRUFBRTtRQUM3QyxPQUFPLElBQUk0SCxVQUFVLENBQUMsSUFBSUMsVUFBVSxDQUFDLENBQUM3SCxPQUFPLENBQUMsQ0FBQyxDQUFDOEgsTUFBTSxDQUFDO01BQ3pEOztNQUVBO01BQ0E7TUFDQSxJQUFJMU0sS0FBSyxDQUFDMk0sUUFBUSxDQUFDL0gsT0FBTyxDQUFDLEVBQUU7UUFDM0IsT0FBTyxJQUFJNEgsVUFBVSxDQUFDNUgsT0FBTyxDQUFDOEgsTUFBTSxDQUFDO01BQ3ZDOztNQUVBO01BQ0E7TUFDQTtNQUNBLElBQUk3SCxLQUFLLENBQUNDLE9BQU8sQ0FBQ0YsT0FBTyxDQUFDLElBQ3RCQSxPQUFPLENBQUM5QixLQUFLLENBQUNmLENBQUMsSUFBSXVLLE1BQU0sQ0FBQ0MsU0FBUyxDQUFDeEssQ0FBQyxDQUFDLElBQUlBLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRTtRQUNyRCxNQUFNMkssTUFBTSxHQUFHLElBQUlFLFdBQVcsQ0FBQyxDQUFDZixJQUFJLENBQUNnQixHQUFHLENBQUMsR0FBR2pJLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDL0QsTUFBTWtJLElBQUksR0FBRyxJQUFJTixVQUFVLENBQUNFLE1BQU0sQ0FBQztRQUVuQzlILE9BQU8sQ0FBQ2pELE9BQU8sQ0FBQ0ksQ0FBQyxJQUFJO1VBQ25CK0ssSUFBSSxDQUFDL0ssQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBS0EsQ0FBQyxHQUFHLEdBQUcsQ0FBQztRQUNoQyxDQUFDLENBQUM7UUFFRixPQUFPK0ssSUFBSTtNQUNiOztNQUVBO01BQ0EsTUFBTS9ILEtBQUssQ0FDVCxjQUFBakcsTUFBQSxDQUFjNkQsUUFBUSx1REFDdEIsMEVBQTBFLEdBQzFFLHVDQUNGLENBQUM7SUFDSDtJQUVBLFNBQVNxRCxlQUFlQSxDQUFDN0MsS0FBSyxFQUFFN0QsTUFBTSxFQUFFO01BQ3RDO01BQ0E7O01BRUE7TUFDQSxJQUFJZ04sTUFBTSxDQUFDUyxhQUFhLENBQUM1SixLQUFLLENBQUMsRUFBRTtRQUMvQjtRQUNBO1FBQ0E7UUFDQTtRQUNBLE1BQU11SixNQUFNLEdBQUcsSUFBSUUsV0FBVyxDQUM1QmYsSUFBSSxDQUFDZ0IsR0FBRyxDQUFDdk4sTUFBTSxFQUFFLENBQUMsR0FBRzBOLFdBQVcsQ0FBQ0MsaUJBQWlCLENBQ3BELENBQUM7UUFFRCxJQUFJSCxJQUFJLEdBQUcsSUFBSUUsV0FBVyxDQUFDTixNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN4Q0ksSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHM0osS0FBSyxJQUFJLENBQUMsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDO1FBQzdDMkosSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHM0osS0FBSyxJQUFJLENBQUMsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDOztRQUU3QztRQUNBLElBQUlBLEtBQUssR0FBRyxDQUFDLEVBQUU7VUFDYjJKLElBQUksR0FBRyxJQUFJTixVQUFVLENBQUNFLE1BQU0sRUFBRSxDQUFDLENBQUM7VUFDaENJLElBQUksQ0FBQ25MLE9BQU8sQ0FBQyxDQUFDc0UsSUFBSSxFQUFFN0csQ0FBQyxLQUFLO1lBQ3hCME4sSUFBSSxDQUFDMU4sQ0FBQyxDQUFDLEdBQUcsSUFBSTtVQUNoQixDQUFDLENBQUM7UUFDSjtRQUVBLE9BQU8sSUFBSW9OLFVBQVUsQ0FBQ0UsTUFBTSxDQUFDO01BQy9COztNQUVBO01BQ0EsSUFBSTFNLEtBQUssQ0FBQzJNLFFBQVEsQ0FBQ3hKLEtBQUssQ0FBQyxFQUFFO1FBQ3pCLE9BQU8sSUFBSXFKLFVBQVUsQ0FBQ3JKLEtBQUssQ0FBQ3VKLE1BQU0sQ0FBQztNQUNyQzs7TUFFQTtNQUNBLE9BQU8sS0FBSztJQUNkOztJQUVBO0lBQ0E7SUFDQTtJQUNBLFNBQVNRLGtCQUFrQkEsQ0FBQ0MsUUFBUSxFQUFFakssR0FBRyxFQUFFQyxLQUFLLEVBQUU7TUFDaEQ1RSxNQUFNLENBQUNRLElBQUksQ0FBQ29PLFFBQVEsQ0FBQyxDQUFDeEwsT0FBTyxDQUFDeUwsV0FBVyxJQUFJO1FBQzNDLElBQ0dBLFdBQVcsQ0FBQzlOLE1BQU0sR0FBRzRELEdBQUcsQ0FBQzVELE1BQU0sSUFBSThOLFdBQVcsQ0FBQ0MsT0FBTyxJQUFBdk8sTUFBQSxDQUFJb0UsR0FBRyxNQUFHLENBQUMsS0FBSyxDQUFDLElBQ3ZFQSxHQUFHLENBQUM1RCxNQUFNLEdBQUc4TixXQUFXLENBQUM5TixNQUFNLElBQUk0RCxHQUFHLENBQUNtSyxPQUFPLElBQUF2TyxNQUFBLENBQUlzTyxXQUFXLE1BQUcsQ0FBQyxLQUFLLENBQUUsRUFDekU7VUFDQSxNQUFNLElBQUlySSxLQUFLLENBQ2IsaURBQUFqRyxNQUFBLENBQWlEc08sV0FBVyxrQkFBQXRPLE1BQUEsQ0FDeERvRSxHQUFHLGtCQUNULENBQUM7UUFDSCxDQUFDLE1BQU0sSUFBSWtLLFdBQVcsS0FBS2xLLEdBQUcsRUFBRTtVQUM5QixNQUFNLElBQUk2QixLQUFLLDRDQUFBakcsTUFBQSxDQUM4Qm9FLEdBQUcsdUJBQ2hELENBQUM7UUFDSDtNQUNGLENBQUMsQ0FBQztNQUVGaUssUUFBUSxDQUFDakssR0FBRyxDQUFDLEdBQUdDLEtBQUs7SUFDdkI7O0lBRUE7SUFDQTtJQUNBO0lBQ0EsU0FBU3NGLHFCQUFxQkEsQ0FBQzZFLGVBQWUsRUFBRTtNQUM5QyxPQUFPQyxZQUFZLElBQUk7UUFDckI7UUFDQTtRQUNBO1FBQ0EsT0FBTztVQUFDL00sTUFBTSxFQUFFLENBQUM4TSxlQUFlLENBQUNDLFlBQVksQ0FBQyxDQUFDL007UUFBTSxDQUFDO01BQ3hELENBQUM7SUFDSDtJQUVPLFNBQVNxRCxXQUFXQSxDQUFDaEIsR0FBRyxFQUFFO01BQy9CLE9BQU9nQyxLQUFLLENBQUNDLE9BQU8sQ0FBQ2pDLEdBQUcsQ0FBQyxJQUFJM0MsZUFBZSxDQUFDeUcsY0FBYyxDQUFDOUQsR0FBRyxDQUFDO0lBQ2xFO0lBRU8sU0FBU3pGLFlBQVlBLENBQUNvUSxDQUFDLEVBQUU7TUFDOUIsT0FBTyxVQUFVLENBQUNoSCxJQUFJLENBQUNnSCxDQUFDLENBQUM7SUFDM0I7SUFLTyxTQUFTblEsZ0JBQWdCQSxDQUFDNEQsYUFBYSxFQUFFd00sY0FBYyxFQUFFO01BQzlELElBQUksQ0FBQ3ZOLGVBQWUsQ0FBQ3lHLGNBQWMsQ0FBQzFGLGFBQWEsQ0FBQyxFQUFFO1FBQ2xELE9BQU8sS0FBSztNQUNkO01BRUEsSUFBSXlNLGlCQUFpQixHQUFHM00sU0FBUztNQUNqQ3hDLE1BQU0sQ0FBQ1EsSUFBSSxDQUFDa0MsYUFBYSxDQUFDLENBQUNVLE9BQU8sQ0FBQ2dNLE1BQU0sSUFBSTtRQUMzQyxNQUFNQyxjQUFjLEdBQUdELE1BQU0sQ0FBQzNDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssR0FBRyxJQUFJMkMsTUFBTSxLQUFLLE1BQU07UUFFdkUsSUFBSUQsaUJBQWlCLEtBQUszTSxTQUFTLEVBQUU7VUFDbkMyTSxpQkFBaUIsR0FBR0UsY0FBYztRQUNwQyxDQUFDLE1BQU0sSUFBSUYsaUJBQWlCLEtBQUtFLGNBQWMsRUFBRTtVQUMvQyxJQUFJLENBQUNILGNBQWMsRUFBRTtZQUNuQixNQUFNLElBQUkxSSxLQUFLLDJCQUFBakcsTUFBQSxDQUNhK08sSUFBSSxDQUFDQyxTQUFTLENBQUM3TSxhQUFhLENBQUMsQ0FDekQsQ0FBQztVQUNIO1VBRUF5TSxpQkFBaUIsR0FBRyxLQUFLO1FBQzNCO01BQ0YsQ0FBQyxDQUFDO01BRUYsT0FBTyxDQUFDLENBQUNBLGlCQUFpQixDQUFDLENBQUM7SUFDOUI7SUFFQTtJQUNBLFNBQVNySixjQUFjQSxDQUFDMEosa0JBQWtCLEVBQUU7TUFDMUMsT0FBTztRQUNMcEosc0JBQXNCQSxDQUFDQyxPQUFPLEVBQUU7VUFDOUI7VUFDQTtVQUNBO1VBQ0E7VUFDQSxJQUFJQyxLQUFLLENBQUNDLE9BQU8sQ0FBQ0YsT0FBTyxDQUFDLEVBQUU7WUFDMUIsT0FBTyxNQUFNLEtBQUs7VUFDcEI7O1VBRUE7VUFDQTtVQUNBLElBQUlBLE9BQU8sS0FBSzdELFNBQVMsRUFBRTtZQUN6QjZELE9BQU8sR0FBRyxJQUFJO1VBQ2hCO1VBRUEsTUFBTW9KLFdBQVcsR0FBRzlOLGVBQWUsQ0FBQ3dGLEVBQUUsQ0FBQ0MsS0FBSyxDQUFDZixPQUFPLENBQUM7VUFFckQsT0FBT3pCLEtBQUssSUFBSTtZQUNkLElBQUlBLEtBQUssS0FBS3BDLFNBQVMsRUFBRTtjQUN2Qm9DLEtBQUssR0FBRyxJQUFJO1lBQ2Q7O1lBRUE7WUFDQTtZQUNBLElBQUlqRCxlQUFlLENBQUN3RixFQUFFLENBQUNDLEtBQUssQ0FBQ3hDLEtBQUssQ0FBQyxLQUFLNkssV0FBVyxFQUFFO2NBQ25ELE9BQU8sS0FBSztZQUNkO1lBRUEsT0FBT0Qsa0JBQWtCLENBQUM3TixlQUFlLENBQUN3RixFQUFFLENBQUN1SSxJQUFJLENBQUM5SyxLQUFLLEVBQUV5QixPQUFPLENBQUMsQ0FBQztVQUNwRSxDQUFDO1FBQ0g7TUFDRixDQUFDO0lBQ0g7O0lBRUE7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDTyxTQUFTZCxrQkFBa0JBLENBQUNaLEdBQUcsRUFBZ0I7TUFBQSxJQUFkNEgsT0FBTyxHQUFBN0gsU0FBQSxDQUFBM0QsTUFBQSxRQUFBMkQsU0FBQSxRQUFBbEMsU0FBQSxHQUFBa0MsU0FBQSxNQUFHLENBQUMsQ0FBQztNQUNsRCxNQUFNaUwsS0FBSyxHQUFHaEwsR0FBRyxDQUFDbkYsS0FBSyxDQUFDLEdBQUcsQ0FBQztNQUM1QixNQUFNb1EsU0FBUyxHQUFHRCxLQUFLLENBQUM1TyxNQUFNLEdBQUc0TyxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRTtNQUM5QyxNQUFNRSxVQUFVLEdBQ2RGLEtBQUssQ0FBQzVPLE1BQU0sR0FBRyxDQUFDLElBQ2hCd0Usa0JBQWtCLENBQUNvSyxLQUFLLENBQUNHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQ25RLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRTRNLE9BQU8sQ0FDckQ7TUFFRCxTQUFTd0QsV0FBV0EsQ0FBQ2hFLFlBQVksRUFBRWhELFdBQVcsRUFBRW5FLEtBQUssRUFBRTtRQUNyRCxPQUFPbUgsWUFBWSxJQUFJQSxZQUFZLENBQUNoTCxNQUFNLEdBQ3RDZ0ksV0FBVyxHQUNULENBQUM7VUFBRWdELFlBQVk7VUFBRWhELFdBQVc7VUFBRW5FO1FBQU0sQ0FBQyxDQUFDLEdBQ3RDLENBQUM7VUFBRW1ILFlBQVk7VUFBRW5IO1FBQU0sQ0FBQyxDQUFDLEdBQzNCbUUsV0FBVyxHQUNULENBQUM7VUFBRUEsV0FBVztVQUFFbkU7UUFBTSxDQUFDLENBQUMsR0FDeEIsQ0FBQztVQUFFQTtRQUFNLENBQUMsQ0FBQztNQUNuQjs7TUFFQTtNQUNBO01BQ0EsT0FBTyxDQUFDMEUsR0FBRyxFQUFFeUMsWUFBWSxLQUFLO1FBQzVCLElBQUl6RixLQUFLLENBQUNDLE9BQU8sQ0FBQytDLEdBQUcsQ0FBQyxFQUFFO1VBQ3RCO1VBQ0E7VUFDQTtVQUNBLElBQUksRUFBRXpLLFlBQVksQ0FBQytRLFNBQVMsQ0FBQyxJQUFJQSxTQUFTLEdBQUd0RyxHQUFHLENBQUN2SSxNQUFNLENBQUMsRUFBRTtZQUN4RCxPQUFPLEVBQUU7VUFDWDs7VUFFQTtVQUNBO1VBQ0E7VUFDQWdMLFlBQVksR0FBR0EsWUFBWSxHQUFHQSxZQUFZLENBQUN4TCxNQUFNLENBQUMsQ0FBQ3FQLFNBQVMsRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUNBLFNBQVMsRUFBRSxHQUFHLENBQUM7UUFDeEY7O1FBRUE7UUFDQSxNQUFNSSxVQUFVLEdBQUcxRyxHQUFHLENBQUNzRyxTQUFTLENBQUM7O1FBRWpDO1FBQ0E7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBLElBQUksQ0FBQ0MsVUFBVSxFQUFFO1VBQ2YsT0FBT0UsV0FBVyxDQUNoQmhFLFlBQVksRUFDWnpGLEtBQUssQ0FBQ0MsT0FBTyxDQUFDK0MsR0FBRyxDQUFDLElBQUloRCxLQUFLLENBQUNDLE9BQU8sQ0FBQ3lKLFVBQVUsQ0FBQyxFQUMvQ0EsVUFDRixDQUFDO1FBQ0g7O1FBRUE7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBO1FBQ0EsSUFBSSxDQUFDMUssV0FBVyxDQUFDMEssVUFBVSxDQUFDLEVBQUU7VUFDNUIsSUFBSTFKLEtBQUssQ0FBQ0MsT0FBTyxDQUFDK0MsR0FBRyxDQUFDLEVBQUU7WUFDdEIsT0FBTyxFQUFFO1VBQ1g7VUFFQSxPQUFPeUcsV0FBVyxDQUFDaEUsWUFBWSxFQUFFLEtBQUssRUFBRXZKLFNBQVMsQ0FBQztRQUNwRDtRQUVBLE1BQU1QLE1BQU0sR0FBRyxFQUFFO1FBQ2pCLE1BQU1nTyxjQUFjLEdBQUdDLElBQUksSUFBSTtVQUM3QmpPLE1BQU0sQ0FBQzZMLElBQUksQ0FBQyxHQUFHb0MsSUFBSSxDQUFDO1FBQ3RCLENBQUM7O1FBRUQ7UUFDQTtRQUNBO1FBQ0FELGNBQWMsQ0FBQ0osVUFBVSxDQUFDRyxVQUFVLEVBQUVqRSxZQUFZLENBQUMsQ0FBQzs7UUFFcEQ7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBO1FBQ0EsSUFBSXpGLEtBQUssQ0FBQ0MsT0FBTyxDQUFDeUosVUFBVSxDQUFDLElBQ3pCLEVBQUVuUixZQUFZLENBQUM4USxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSXBELE9BQU8sQ0FBQzRELE9BQU8sQ0FBQyxFQUFFO1VBQ2hESCxVQUFVLENBQUM1TSxPQUFPLENBQUMsQ0FBQ3dJLE1BQU0sRUFBRXdFLFVBQVUsS0FBSztZQUN6QyxJQUFJek8sZUFBZSxDQUFDeUcsY0FBYyxDQUFDd0QsTUFBTSxDQUFDLEVBQUU7Y0FDMUNxRSxjQUFjLENBQUNKLFVBQVUsQ0FBQ2pFLE1BQU0sRUFBRUcsWUFBWSxHQUFHQSxZQUFZLENBQUN4TCxNQUFNLENBQUM2UCxVQUFVLENBQUMsR0FBRyxDQUFDQSxVQUFVLENBQUMsQ0FBQyxDQUFDO1lBQ25HO1VBQ0YsQ0FBQyxDQUFDO1FBQ0o7UUFFQSxPQUFPbk8sTUFBTTtNQUNmLENBQUM7SUFDSDtJQUVBO0lBQ0E7SUFDQW9PLGFBQWEsR0FBRztNQUFDOUs7SUFBa0IsQ0FBQztJQUNwQytLLGNBQWMsR0FBRyxTQUFBQSxDQUFDQyxPQUFPLEVBQW1CO01BQUEsSUFBakJoRSxPQUFPLEdBQUE3SCxTQUFBLENBQUEzRCxNQUFBLFFBQUEyRCxTQUFBLFFBQUFsQyxTQUFBLEdBQUFrQyxTQUFBLE1BQUcsQ0FBQyxDQUFDO01BQ3JDLElBQUksT0FBTzZMLE9BQU8sS0FBSyxRQUFRLElBQUloRSxPQUFPLENBQUNpRSxLQUFLLEVBQUU7UUFDaERELE9BQU8sbUJBQUFoUSxNQUFBLENBQW1CZ00sT0FBTyxDQUFDaUUsS0FBSyxNQUFHO01BQzVDO01BRUEsTUFBTTNPLEtBQUssR0FBRyxJQUFJMkUsS0FBSyxDQUFDK0osT0FBTyxDQUFDO01BQ2hDMU8sS0FBSyxDQUFDQyxJQUFJLEdBQUcsZ0JBQWdCO01BQzdCLE9BQU9ELEtBQUs7SUFDZCxDQUFDO0lBRU0sU0FBUzJELGNBQWNBLENBQUNrSSxtQkFBbUIsRUFBRTtNQUNsRCxPQUFPO1FBQUN6TCxNQUFNLEVBQUU7TUFBSyxDQUFDO0lBQ3hCO0lBRUE7SUFDQTtJQUNBLFNBQVM2Syx1QkFBdUJBLENBQUNwSyxhQUFhLEVBQUVHLE9BQU8sRUFBRWlJLE1BQU0sRUFBRTtNQUMvRDtNQUNBO01BQ0E7TUFDQSxNQUFNMkYsZ0JBQWdCLEdBQUd6USxNQUFNLENBQUNRLElBQUksQ0FBQ2tDLGFBQWEsQ0FBQyxDQUFDcEQsR0FBRyxDQUFDb1IsUUFBUSxJQUFJO1FBQ2xFLE1BQU1ySyxPQUFPLEdBQUczRCxhQUFhLENBQUNnTyxRQUFRLENBQUM7UUFFdkMsTUFBTUMsV0FBVyxHQUNmLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUN0TyxRQUFRLENBQUNxTyxRQUFRLENBQUMsSUFDakQsT0FBT3JLLE9BQU8sS0FBSyxRQUNwQjtRQUVELE1BQU11SyxjQUFjLEdBQ2xCLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDdk8sUUFBUSxDQUFDcU8sUUFBUSxDQUFDLElBQ2pDckssT0FBTyxLQUFLckcsTUFBTSxDQUFDcUcsT0FBTyxDQUMzQjtRQUVELE1BQU13SyxlQUFlLEdBQ25CLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDeE8sUUFBUSxDQUFDcU8sUUFBUSxDQUFDLElBQy9CcEssS0FBSyxDQUFDQyxPQUFPLENBQUNGLE9BQU8sQ0FBQyxJQUN0QixDQUFDQSxPQUFPLENBQUM1RixJQUFJLENBQUMrQyxDQUFDLElBQUlBLENBQUMsS0FBS3hELE1BQU0sQ0FBQ3dELENBQUMsQ0FBQyxDQUN0QztRQUVELElBQUksRUFBRW1OLFdBQVcsSUFBSUUsZUFBZSxJQUFJRCxjQUFjLENBQUMsRUFBRTtVQUN2RC9OLE9BQU8sQ0FBQzZKLFNBQVMsR0FBRyxLQUFLO1FBQzNCO1FBRUEsSUFBSTlOLE1BQU0sQ0FBQzBFLElBQUksQ0FBQ3lHLGVBQWUsRUFBRTJHLFFBQVEsQ0FBQyxFQUFFO1VBQzFDLE9BQU8zRyxlQUFlLENBQUMyRyxRQUFRLENBQUMsQ0FBQ3JLLE9BQU8sRUFBRTNELGFBQWEsRUFBRUcsT0FBTyxFQUFFaUksTUFBTSxDQUFDO1FBQzNFO1FBRUEsSUFBSWxNLE1BQU0sQ0FBQzBFLElBQUksQ0FBQzRCLGlCQUFpQixFQUFFd0wsUUFBUSxDQUFDLEVBQUU7VUFDNUMsTUFBTW5FLE9BQU8sR0FBR3JILGlCQUFpQixDQUFDd0wsUUFBUSxDQUFDO1VBQzNDLE9BQU8xRyxzQ0FBc0MsQ0FDM0N1QyxPQUFPLENBQUNuRyxzQkFBc0IsQ0FBQ0MsT0FBTyxFQUFFM0QsYUFBYSxFQUFFRyxPQUFPLENBQUMsRUFDL0QwSixPQUNGLENBQUM7UUFDSDtRQUVBLE1BQU0sSUFBSS9GLEtBQUssMkJBQUFqRyxNQUFBLENBQTJCbVEsUUFBUSxDQUFFLENBQUM7TUFDdkQsQ0FBQyxDQUFDO01BRUYsT0FBTzdGLG1CQUFtQixDQUFDNEYsZ0JBQWdCLENBQUM7SUFDOUM7O0lBRUE7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ08sU0FBUzFSLFdBQVdBLENBQUNNLEtBQUssRUFBRXlSLFNBQVMsRUFBRUMsVUFBVSxFQUFhO01BQUEsSUFBWEMsSUFBSSxHQUFBdE0sU0FBQSxDQUFBM0QsTUFBQSxRQUFBMkQsU0FBQSxRQUFBbEMsU0FBQSxHQUFBa0MsU0FBQSxNQUFHLENBQUMsQ0FBQztNQUNqRXJGLEtBQUssQ0FBQytELE9BQU8sQ0FBQzdELElBQUksSUFBSTtRQUNwQixNQUFNMFIsU0FBUyxHQUFHMVIsSUFBSSxDQUFDQyxLQUFLLENBQUMsR0FBRyxDQUFDO1FBQ2pDLElBQUlvRSxJQUFJLEdBQUdvTixJQUFJOztRQUVmO1FBQ0EsTUFBTUUsT0FBTyxHQUFHRCxTQUFTLENBQUNuQixLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUN2TCxLQUFLLENBQUMsQ0FBQ0ksR0FBRyxFQUFFOUQsQ0FBQyxLQUFLO1VBQ3ZELElBQUksQ0FBQ2pDLE1BQU0sQ0FBQzBFLElBQUksQ0FBQ00sSUFBSSxFQUFFZSxHQUFHLENBQUMsRUFBRTtZQUMzQmYsSUFBSSxDQUFDZSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7VUFDaEIsQ0FBQyxNQUFNLElBQUlmLElBQUksQ0FBQ2UsR0FBRyxDQUFDLEtBQUszRSxNQUFNLENBQUM0RCxJQUFJLENBQUNlLEdBQUcsQ0FBQyxDQUFDLEVBQUU7WUFDMUNmLElBQUksQ0FBQ2UsR0FBRyxDQUFDLEdBQUdvTSxVQUFVLENBQ3BCbk4sSUFBSSxDQUFDZSxHQUFHLENBQUMsRUFDVHNNLFNBQVMsQ0FBQ25CLEtBQUssQ0FBQyxDQUFDLEVBQUVqUCxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUNsQixJQUFJLENBQUMsR0FBRyxDQUFDLEVBQ25DSixJQUNGLENBQUM7O1lBRUQ7WUFDQSxJQUFJcUUsSUFBSSxDQUFDZSxHQUFHLENBQUMsS0FBSzNFLE1BQU0sQ0FBQzRELElBQUksQ0FBQ2UsR0FBRyxDQUFDLENBQUMsRUFBRTtjQUNuQyxPQUFPLEtBQUs7WUFDZDtVQUNGO1VBRUFmLElBQUksR0FBR0EsSUFBSSxDQUFDZSxHQUFHLENBQUM7VUFFaEIsT0FBTyxJQUFJO1FBQ2IsQ0FBQyxDQUFDO1FBRUYsSUFBSXVNLE9BQU8sRUFBRTtVQUNYLE1BQU1DLE9BQU8sR0FBR0YsU0FBUyxDQUFDQSxTQUFTLENBQUNsUSxNQUFNLEdBQUcsQ0FBQyxDQUFDO1VBQy9DLElBQUluQyxNQUFNLENBQUMwRSxJQUFJLENBQUNNLElBQUksRUFBRXVOLE9BQU8sQ0FBQyxFQUFFO1lBQzlCdk4sSUFBSSxDQUFDdU4sT0FBTyxDQUFDLEdBQUdKLFVBQVUsQ0FBQ25OLElBQUksQ0FBQ3VOLE9BQU8sQ0FBQyxFQUFFNVIsSUFBSSxFQUFFQSxJQUFJLENBQUM7VUFDdkQsQ0FBQyxNQUFNO1lBQ0xxRSxJQUFJLENBQUN1TixPQUFPLENBQUMsR0FBR0wsU0FBUyxDQUFDdlIsSUFBSSxDQUFDO1VBQ2pDO1FBQ0Y7TUFDRixDQUFDLENBQUM7TUFFRixPQUFPeVIsSUFBSTtJQUNiO0lBRUE7SUFDQTtJQUNBO0lBQ0EsU0FBU3hGLFlBQVlBLENBQUNQLEtBQUssRUFBRTtNQUMzQixPQUFPM0UsS0FBSyxDQUFDQyxPQUFPLENBQUMwRSxLQUFLLENBQUMsR0FBR0EsS0FBSyxDQUFDNkUsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDN0UsS0FBSyxDQUFDekgsQ0FBQyxFQUFFeUgsS0FBSyxDQUFDbUcsQ0FBQyxDQUFDO0lBQ2xFOztJQUVBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7O0lBRUE7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBOztJQUVBO0lBQ0EsU0FBU0MsNEJBQTRCQSxDQUFDekMsUUFBUSxFQUFFakssR0FBRyxFQUFFQyxLQUFLLEVBQUU7TUFDMUQsSUFBSUEsS0FBSyxJQUFJNUUsTUFBTSxDQUFDc1IsY0FBYyxDQUFDMU0sS0FBSyxDQUFDLEtBQUs1RSxNQUFNLENBQUNILFNBQVMsRUFBRTtRQUM5RDBSLDBCQUEwQixDQUFDM0MsUUFBUSxFQUFFakssR0FBRyxFQUFFQyxLQUFLLENBQUM7TUFDbEQsQ0FBQyxNQUFNLElBQUksRUFBRUEsS0FBSyxZQUFZaUMsTUFBTSxDQUFDLEVBQUU7UUFDckM4SCxrQkFBa0IsQ0FBQ0MsUUFBUSxFQUFFakssR0FBRyxFQUFFQyxLQUFLLENBQUM7TUFDMUM7SUFDRjs7SUFFQTtJQUNBO0lBQ0EsU0FBUzJNLDBCQUEwQkEsQ0FBQzNDLFFBQVEsRUFBRWpLLEdBQUcsRUFBRUMsS0FBSyxFQUFFO01BQ3hELE1BQU1wRSxJQUFJLEdBQUdSLE1BQU0sQ0FBQ1EsSUFBSSxDQUFDb0UsS0FBSyxDQUFDO01BQy9CLE1BQU00TSxjQUFjLEdBQUdoUixJQUFJLENBQUNmLE1BQU0sQ0FBQzRELEVBQUUsSUFBSUEsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQztNQUV2RCxJQUFJbU8sY0FBYyxDQUFDelEsTUFBTSxHQUFHLENBQUMsSUFBSSxDQUFDUCxJQUFJLENBQUNPLE1BQU0sRUFBRTtRQUM3QztRQUNBO1FBQ0EsSUFBSVAsSUFBSSxDQUFDTyxNQUFNLEtBQUt5USxjQUFjLENBQUN6USxNQUFNLEVBQUU7VUFDekMsTUFBTSxJQUFJeUYsS0FBSyxzQkFBQWpHLE1BQUEsQ0FBc0JpUixjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQztRQUMzRDtRQUVBQyxjQUFjLENBQUM3TSxLQUFLLEVBQUVELEdBQUcsQ0FBQztRQUMxQmdLLGtCQUFrQixDQUFDQyxRQUFRLEVBQUVqSyxHQUFHLEVBQUVDLEtBQUssQ0FBQztNQUMxQyxDQUFDLE1BQU07UUFDTDVFLE1BQU0sQ0FBQ1EsSUFBSSxDQUFDb0UsS0FBSyxDQUFDLENBQUN4QixPQUFPLENBQUNDLEVBQUUsSUFBSTtVQUMvQixNQUFNcU8sTUFBTSxHQUFHOU0sS0FBSyxDQUFDdkIsRUFBRSxDQUFDO1VBRXhCLElBQUlBLEVBQUUsS0FBSyxLQUFLLEVBQUU7WUFDaEJnTyw0QkFBNEIsQ0FBQ3pDLFFBQVEsRUFBRWpLLEdBQUcsRUFBRStNLE1BQU0sQ0FBQztVQUNyRCxDQUFDLE1BQU0sSUFBSXJPLEVBQUUsS0FBSyxNQUFNLEVBQUU7WUFDeEI7WUFDQXFPLE1BQU0sQ0FBQ3RPLE9BQU8sQ0FBQzhKLE9BQU8sSUFDcEJtRSw0QkFBNEIsQ0FBQ3pDLFFBQVEsRUFBRWpLLEdBQUcsRUFBRXVJLE9BQU8sQ0FDckQsQ0FBQztVQUNIO1FBQ0YsQ0FBQyxDQUFDO01BQ0o7SUFDRjs7SUFFQTtJQUNPLFNBQVN6SCwrQkFBK0JBLENBQUNrTSxLQUFLLEVBQWlCO01BQUEsSUFBZi9DLFFBQVEsR0FBQWxLLFNBQUEsQ0FBQTNELE1BQUEsUUFBQTJELFNBQUEsUUFBQWxDLFNBQUEsR0FBQWtDLFNBQUEsTUFBRyxDQUFDLENBQUM7TUFDbEUsSUFBSTFFLE1BQU0sQ0FBQ3NSLGNBQWMsQ0FBQ0ssS0FBSyxDQUFDLEtBQUszUixNQUFNLENBQUNILFNBQVMsRUFBRTtRQUNyRDtRQUNBRyxNQUFNLENBQUNRLElBQUksQ0FBQ21SLEtBQUssQ0FBQyxDQUFDdk8sT0FBTyxDQUFDdUIsR0FBRyxJQUFJO1VBQ2hDLE1BQU1DLEtBQUssR0FBRytNLEtBQUssQ0FBQ2hOLEdBQUcsQ0FBQztVQUV4QixJQUFJQSxHQUFHLEtBQUssTUFBTSxFQUFFO1lBQ2xCO1lBQ0FDLEtBQUssQ0FBQ3hCLE9BQU8sQ0FBQzhKLE9BQU8sSUFDbkJ6SCwrQkFBK0IsQ0FBQ3lILE9BQU8sRUFBRTBCLFFBQVEsQ0FDbkQsQ0FBQztVQUNILENBQUMsTUFBTSxJQUFJakssR0FBRyxLQUFLLEtBQUssRUFBRTtZQUN4QjtZQUNBLElBQUlDLEtBQUssQ0FBQzdELE1BQU0sS0FBSyxDQUFDLEVBQUU7Y0FDdEIwRSwrQkFBK0IsQ0FBQ2IsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFZ0ssUUFBUSxDQUFDO1lBQ3JEO1VBQ0YsQ0FBQyxNQUFNLElBQUlqSyxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxFQUFFO1lBQ3pCO1lBQ0EwTSw0QkFBNEIsQ0FBQ3pDLFFBQVEsRUFBRWpLLEdBQUcsRUFBRUMsS0FBSyxDQUFDO1VBQ3BEO1FBQ0YsQ0FBQyxDQUFDO01BQ0osQ0FBQyxNQUFNO1FBQ0w7UUFDQSxJQUFJakQsZUFBZSxDQUFDaVEsYUFBYSxDQUFDRCxLQUFLLENBQUMsRUFBRTtVQUN4Q2hELGtCQUFrQixDQUFDQyxRQUFRLEVBQUUsS0FBSyxFQUFFK0MsS0FBSyxDQUFDO1FBQzVDO01BQ0Y7TUFFQSxPQUFPL0MsUUFBUTtJQUNqQjtJQVFPLFNBQVM1UCxpQkFBaUJBLENBQUM2UyxNQUFNLEVBQUU7TUFDeEM7TUFDQTtNQUNBO01BQ0EsSUFBSUMsVUFBVSxHQUFHOVIsTUFBTSxDQUFDUSxJQUFJLENBQUNxUixNQUFNLENBQUMsQ0FBQ0UsSUFBSSxDQUFDLENBQUM7O01BRTNDO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBLElBQUksRUFBRUQsVUFBVSxDQUFDL1EsTUFBTSxLQUFLLENBQUMsSUFBSStRLFVBQVUsQ0FBQyxDQUFDLENBQUMsS0FBSyxLQUFLLENBQUMsSUFDckQsRUFBRUEsVUFBVSxDQUFDelAsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJd1AsTUFBTSxDQUFDRyxHQUFHLENBQUMsRUFBRTtRQUMvQ0YsVUFBVSxHQUFHQSxVQUFVLENBQUNyUyxNQUFNLENBQUNrRixHQUFHLElBQUlBLEdBQUcsS0FBSyxLQUFLLENBQUM7TUFDdEQ7TUFFQSxJQUFJVixTQUFTLEdBQUcsSUFBSSxDQUFDLENBQUM7O01BRXRCNk4sVUFBVSxDQUFDMU8sT0FBTyxDQUFDNk8sT0FBTyxJQUFJO1FBQzVCLE1BQU1DLElBQUksR0FBRyxDQUFDLENBQUNMLE1BQU0sQ0FBQ0ksT0FBTyxDQUFDO1FBRTlCLElBQUloTyxTQUFTLEtBQUssSUFBSSxFQUFFO1VBQ3RCQSxTQUFTLEdBQUdpTyxJQUFJO1FBQ2xCOztRQUVBO1FBQ0EsSUFBSWpPLFNBQVMsS0FBS2lPLElBQUksRUFBRTtVQUN0QixNQUFNNUIsY0FBYyxDQUNsQiwwREFDRixDQUFDO1FBQ0g7TUFDRixDQUFDLENBQUM7TUFFRixNQUFNNkIsbUJBQW1CLEdBQUdwVCxXQUFXLENBQ3JDK1MsVUFBVSxFQUNWdlMsSUFBSSxJQUFJMEUsU0FBUyxFQUNqQixDQUFDSixJQUFJLEVBQUV0RSxJQUFJLEVBQUV1RSxRQUFRLEtBQUs7UUFDeEI7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBO1FBQ0E7UUFDQSxNQUFNc08sV0FBVyxHQUFHdE8sUUFBUTtRQUM1QixNQUFNdU8sV0FBVyxHQUFHOVMsSUFBSTtRQUN4QixNQUFNK1EsY0FBYyxDQUNsQixRQUFBL1AsTUFBQSxDQUFRNlIsV0FBVyxXQUFBN1IsTUFBQSxDQUFROFIsV0FBVyxpQ0FDdEMsc0VBQXNFLEdBQ3RFLHVCQUNGLENBQUM7TUFDSCxDQUFDLENBQUM7TUFFSixPQUFPO1FBQUNwTyxTQUFTO1FBQUVMLElBQUksRUFBRXVPO01BQW1CLENBQUM7SUFDL0M7SUFHTyxTQUFTek0sb0JBQW9CQSxDQUFDcUMsTUFBTSxFQUFFO01BQzNDLE9BQU9uRCxLQUFLLElBQUk7UUFDZCxJQUFJQSxLQUFLLFlBQVlpQyxNQUFNLEVBQUU7VUFDM0IsT0FBT2pDLEtBQUssQ0FBQzBOLFFBQVEsQ0FBQyxDQUFDLEtBQUt2SyxNQUFNLENBQUN1SyxRQUFRLENBQUMsQ0FBQztRQUMvQzs7UUFFQTtRQUNBLElBQUksT0FBTzFOLEtBQUssS0FBSyxRQUFRLEVBQUU7VUFDN0IsT0FBTyxLQUFLO1FBQ2Q7O1FBRUE7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBbUQsTUFBTSxDQUFDd0ssU0FBUyxHQUFHLENBQUM7UUFFcEIsT0FBT3hLLE1BQU0sQ0FBQ0UsSUFBSSxDQUFDckQsS0FBSyxDQUFDO01BQzNCLENBQUM7SUFDSDtJQUVBO0lBQ0E7SUFDQTtJQUNBLFNBQVM0TixpQkFBaUJBLENBQUM3TixHQUFHLEVBQUVwRixJQUFJLEVBQUU7TUFDcEMsSUFBSW9GLEdBQUcsQ0FBQ3RDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRTtRQUNyQixNQUFNLElBQUltRSxLQUFLLHNCQUFBakcsTUFBQSxDQUNRb0UsR0FBRyxZQUFBcEUsTUFBQSxDQUFTaEIsSUFBSSxPQUFBZ0IsTUFBQSxDQUFJb0UsR0FBRywrQkFDOUMsQ0FBQztNQUNIO01BRUEsSUFBSUEsR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsRUFBRTtRQUNsQixNQUFNLElBQUk2QixLQUFLLG9DQUFBakcsTUFBQSxDQUNzQmhCLElBQUksT0FBQWdCLE1BQUEsQ0FBSW9FLEdBQUcsK0JBQ2hELENBQUM7TUFDSDtJQUNGOztJQUVBO0lBQ0EsU0FBUzhNLGNBQWNBLENBQUNDLE1BQU0sRUFBRW5TLElBQUksRUFBRTtNQUNwQyxJQUFJbVMsTUFBTSxJQUFJMVIsTUFBTSxDQUFDc1IsY0FBYyxDQUFDSSxNQUFNLENBQUMsS0FBSzFSLE1BQU0sQ0FBQ0gsU0FBUyxFQUFFO1FBQ2hFRyxNQUFNLENBQUNRLElBQUksQ0FBQ2tSLE1BQU0sQ0FBQyxDQUFDdE8sT0FBTyxDQUFDdUIsR0FBRyxJQUFJO1VBQ2pDNk4saUJBQWlCLENBQUM3TixHQUFHLEVBQUVwRixJQUFJLENBQUM7VUFDNUJrUyxjQUFjLENBQUNDLE1BQU0sQ0FBQy9NLEdBQUcsQ0FBQyxFQUFFcEYsSUFBSSxHQUFHLEdBQUcsR0FBR29GLEdBQUcsQ0FBQztRQUMvQyxDQUFDLENBQUM7TUFDSjtJQUNGO0lBQUNFLHNCQUFBO0VBQUEsU0FBQUMsV0FBQTtJQUFBLE9BQUFELHNCQUFBLENBQUFDLFdBQUE7RUFBQTtFQUFBRCxzQkFBQTtBQUFBO0VBQUFFLElBQUE7RUFBQUMsS0FBQTtBQUFBLEc7Ozs7Ozs7Ozs7O0FDLzNDRHRHLE1BQU0sQ0FBQ3VHLE1BQU0sQ0FBQztFQUFDd04sa0JBQWtCLEVBQUNBLENBQUEsS0FBSUEsa0JBQWtCO0VBQUNDLHdCQUF3QixFQUFDQSxDQUFBLEtBQUlBLHdCQUF3QjtFQUFDQyxvQkFBb0IsRUFBQ0EsQ0FBQSxLQUFJQSxvQkFBb0I7RUFBQ0MsbUJBQW1CLEVBQUNBLENBQUEsS0FBSUE7QUFBbUIsQ0FBQyxDQUFDO0FBR25NLFNBQVNILGtCQUFrQkEsQ0FBQ0ksTUFBTSxFQUFFO0VBQ3pDLFVBQUF0UyxNQUFBLENBQVVzUyxNQUFNLENBQUNDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDO0FBQ25DO0FBRU8sTUFBTUosd0JBQXdCLEdBQUcsQ0FDdEMseUJBQXlCLEVBQ3pCLGdCQUFnQixFQUNoQixXQUFXO0FBQ1g7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDRSxhQUFhO0FBQ2I7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDRSxTQUFTO0FBQ1Q7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0UsUUFBUTtBQUNSO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNFLFFBQVE7QUFDUjtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0UsUUFBUTtBQUNSO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNFLFFBQVEsQ0FDVDtBQUVNLE1BQU1DLG9CQUFvQixHQUFHO0FBQ2xDO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNFLE9BQU87QUFDUDtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0UsT0FBTztBQUNQO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNFLFNBQVM7QUFDVDtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0UsS0FBSyxDQUNOO0FBRU0sTUFBTUMsbUJBQW1CLEdBQUcsQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsUUFBUSxDQUFDLEM7Ozs7Ozs7Ozs7Ozs7O0lDcEp0RmxVLE1BQU0sQ0FBQ3VHLE1BQU0sQ0FBQztNQUFDVSxPQUFPLEVBQUNBLENBQUEsS0FBSW9OO0lBQU0sQ0FBQyxDQUFDO0lBQUMsSUFBSXBSLGVBQWU7SUFBQ2pELE1BQU0sQ0FBQ0MsSUFBSSxDQUFDLHVCQUF1QixFQUFDO01BQUNnSCxPQUFPQSxDQUFDMUcsQ0FBQyxFQUFDO1FBQUMwQyxlQUFlLEdBQUMxQyxDQUFDO01BQUE7SUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0lBQUMsSUFBSUwsTUFBTTtJQUFDRixNQUFNLENBQUNDLElBQUksQ0FBQyxhQUFhLEVBQUM7TUFBQ0MsTUFBTUEsQ0FBQ0ssQ0FBQyxFQUFDO1FBQUNMLE1BQU0sR0FBQ0ssQ0FBQztNQUFBO0lBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQztJQUFDLElBQUkwVCxvQkFBb0IsRUFBQ0Ysa0JBQWtCO0lBQUMvVCxNQUFNLENBQUNDLElBQUksQ0FBQyxhQUFhLEVBQUM7TUFBQ2dVLG9CQUFvQkEsQ0FBQzFULENBQUMsRUFBQztRQUFDMFQsb0JBQW9CLEdBQUMxVCxDQUFDO01BQUEsQ0FBQztNQUFDd1Qsa0JBQWtCQSxDQUFDeFQsQ0FBQyxFQUFDO1FBQUN3VCxrQkFBa0IsR0FBQ3hULENBQUM7TUFBQTtJQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7SUFBQyxJQUFJQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNQSxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQU1qWixNQUFNNlQsTUFBTSxDQUFDO01BQzFCO01BQ0FDLFdBQVdBLENBQUNDLFVBQVUsRUFBRTdPLFFBQVEsRUFBZ0I7UUFBQSxJQUFkbUksT0FBTyxHQUFBN0gsU0FBQSxDQUFBM0QsTUFBQSxRQUFBMkQsU0FBQSxRQUFBbEMsU0FBQSxHQUFBa0MsU0FBQSxNQUFHLENBQUMsQ0FBQztRQUM1QyxJQUFJLENBQUN1TyxVQUFVLEdBQUdBLFVBQVU7UUFDNUIsSUFBSSxDQUFDQyxNQUFNLEdBQUcsSUFBSTtRQUNsQixJQUFJLENBQUNyUSxPQUFPLEdBQUcsSUFBSTFELFNBQVMsQ0FBQ1MsT0FBTyxDQUFDd0UsUUFBUSxDQUFDO1FBRTlDLElBQUl6QyxlQUFlLENBQUN3Uiw0QkFBNEIsQ0FBQy9PLFFBQVEsQ0FBQyxFQUFFO1VBQzFEO1VBQ0EsSUFBSSxDQUFDZ1AsV0FBVyxHQUFHeFUsTUFBTSxDQUFDMEUsSUFBSSxDQUFDYyxRQUFRLEVBQUUsS0FBSyxDQUFDLEdBQUdBLFFBQVEsQ0FBQzROLEdBQUcsR0FBRzVOLFFBQVE7UUFDM0UsQ0FBQyxNQUFNO1VBQ0wsSUFBSSxDQUFDZ1AsV0FBVyxHQUFHNVEsU0FBUztVQUU1QixJQUFJLElBQUksQ0FBQ0ssT0FBTyxDQUFDd1EsV0FBVyxDQUFDLENBQUMsSUFBSTlHLE9BQU8sQ0FBQ3dGLElBQUksRUFBRTtZQUM5QyxJQUFJLENBQUNtQixNQUFNLEdBQUcsSUFBSS9ULFNBQVMsQ0FBQ3NFLE1BQU0sQ0FBQzhJLE9BQU8sQ0FBQ3dGLElBQUksSUFBSSxFQUFFLENBQUM7VUFDeEQ7UUFDRjtRQUVBLElBQUksQ0FBQ3VCLElBQUksR0FBRy9HLE9BQU8sQ0FBQytHLElBQUksSUFBSSxDQUFDO1FBQzdCLElBQUksQ0FBQ0MsS0FBSyxHQUFHaEgsT0FBTyxDQUFDZ0gsS0FBSztRQUMxQixJQUFJLENBQUMxQixNQUFNLEdBQUd0RixPQUFPLENBQUNwSyxVQUFVLElBQUlvSyxPQUFPLENBQUNzRixNQUFNO1FBRWxELElBQUksQ0FBQzJCLGFBQWEsR0FBRzdSLGVBQWUsQ0FBQzhSLGtCQUFrQixDQUFDLElBQUksQ0FBQzVCLE1BQU0sSUFBSSxDQUFDLENBQUMsQ0FBQztRQUUxRSxJQUFJLENBQUM2QixVQUFVLEdBQUcvUixlQUFlLENBQUNnUyxhQUFhLENBQUNwSCxPQUFPLENBQUNxSCxTQUFTLENBQUM7O1FBRWxFO1FBQ0EsSUFBSSxPQUFPQyxPQUFPLEtBQUssV0FBVyxFQUFFO1VBQ2xDLElBQUksQ0FBQ0MsUUFBUSxHQUFHdkgsT0FBTyxDQUFDdUgsUUFBUSxLQUFLdFIsU0FBUyxHQUFHLElBQUksR0FBRytKLE9BQU8sQ0FBQ3VILFFBQVE7UUFDMUU7TUFDRjs7TUFFQTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7TUFDRUMsS0FBS0EsQ0FBQSxFQUFHO1FBQ04sSUFBSSxJQUFJLENBQUNELFFBQVEsRUFBRTtVQUNqQjtVQUNBLElBQUksQ0FBQ0UsT0FBTyxDQUFDO1lBQUVDLEtBQUssRUFBRSxJQUFJO1lBQUVDLE9BQU8sRUFBRTtVQUFLLENBQUMsRUFBRSxJQUFJLENBQUM7UUFDcEQ7UUFFQSxPQUFPLElBQUksQ0FBQ0MsY0FBYyxDQUFDO1VBQ3pCQyxPQUFPLEVBQUU7UUFDWCxDQUFDLENBQUMsQ0FBQ3JULE1BQU07TUFDWDs7TUFFQTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO01BQ0VzVCxLQUFLQSxDQUFBLEVBQUc7UUFDTixNQUFNcFMsTUFBTSxHQUFHLEVBQUU7UUFFakIsSUFBSSxDQUFDbUIsT0FBTyxDQUFDa0csR0FBRyxJQUFJO1VBQ2xCckgsTUFBTSxDQUFDNkwsSUFBSSxDQUFDeEUsR0FBRyxDQUFDO1FBQ2xCLENBQUMsQ0FBQztRQUVGLE9BQU9ySCxNQUFNO01BQ2Y7TUFFQSxDQUFDcVMsTUFBTSxDQUFDQyxRQUFRLElBQUk7UUFDbEIsSUFBSSxJQUFJLENBQUNULFFBQVEsRUFBRTtVQUNqQixJQUFJLENBQUNFLE9BQU8sQ0FBQztZQUNYUSxXQUFXLEVBQUUsSUFBSTtZQUNqQk4sT0FBTyxFQUFFLElBQUk7WUFDYk8sT0FBTyxFQUFFLElBQUk7WUFDYkMsV0FBVyxFQUFFO1VBQ2YsQ0FBQyxDQUFDO1FBQ0o7UUFFQSxJQUFJQyxLQUFLLEdBQUcsQ0FBQztRQUNiLE1BQU1DLE9BQU8sR0FBRyxJQUFJLENBQUNULGNBQWMsQ0FBQztVQUFFQyxPQUFPLEVBQUU7UUFBSyxDQUFDLENBQUM7UUFFdEQsT0FBTztVQUNMUyxJQUFJLEVBQUVBLENBQUEsS0FBTTtZQUNWLElBQUlGLEtBQUssR0FBR0MsT0FBTyxDQUFDN1QsTUFBTSxFQUFFO2NBQzFCO2NBQ0EsSUFBSW1NLE9BQU8sR0FBRyxJQUFJLENBQUNzRyxhQUFhLENBQUNvQixPQUFPLENBQUNELEtBQUssRUFBRSxDQUFDLENBQUM7Y0FFbEQsSUFBSSxJQUFJLENBQUNqQixVQUFVLEVBQUV4RyxPQUFPLEdBQUcsSUFBSSxDQUFDd0csVUFBVSxDQUFDeEcsT0FBTyxDQUFDO2NBRXZELE9BQU87Z0JBQUV0SSxLQUFLLEVBQUVzSTtjQUFRLENBQUM7WUFDM0I7WUFFQSxPQUFPO2NBQUU0SCxJQUFJLEVBQUU7WUFBSyxDQUFDO1VBQ3ZCO1FBQ0YsQ0FBQztNQUNIO01BRUEsQ0FBQ1IsTUFBTSxDQUFDUyxhQUFhLElBQUk7UUFDdkIsTUFBTUMsVUFBVSxHQUFHLElBQUksQ0FBQ1YsTUFBTSxDQUFDQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQzFDLE9BQU87VUFDTCxNQUFNTSxJQUFJQSxDQUFBLEVBQUc7WUFDWCxPQUFPSSxPQUFPLENBQUNDLE9BQU8sQ0FBQ0YsVUFBVSxDQUFDSCxJQUFJLENBQUMsQ0FBQyxDQUFDO1VBQzNDO1FBQ0YsQ0FBQztNQUNIOztNQUVBO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7TUFDRTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO01BQ0V6UixPQUFPQSxDQUFDK1IsUUFBUSxFQUFFQyxPQUFPLEVBQUU7UUFDekIsSUFBSSxJQUFJLENBQUN0QixRQUFRLEVBQUU7VUFDakIsSUFBSSxDQUFDRSxPQUFPLENBQUM7WUFDWFEsV0FBVyxFQUFFLElBQUk7WUFDakJOLE9BQU8sRUFBRSxJQUFJO1lBQ2JPLE9BQU8sRUFBRSxJQUFJO1lBQ2JDLFdBQVcsRUFBRTtVQUNmLENBQUMsQ0FBQztRQUNKO1FBRUEsSUFBSSxDQUFDUCxjQUFjLENBQUM7VUFBRUMsT0FBTyxFQUFFO1FBQUssQ0FBQyxDQUFDLENBQUNoUixPQUFPLENBQUMsQ0FBQzhKLE9BQU8sRUFBRXJNLENBQUMsS0FBSztVQUM3RDtVQUNBcU0sT0FBTyxHQUFHLElBQUksQ0FBQ3NHLGFBQWEsQ0FBQ3RHLE9BQU8sQ0FBQztVQUVyQyxJQUFJLElBQUksQ0FBQ3dHLFVBQVUsRUFBRTtZQUNuQnhHLE9BQU8sR0FBRyxJQUFJLENBQUN3RyxVQUFVLENBQUN4RyxPQUFPLENBQUM7VUFDcEM7VUFFQWlJLFFBQVEsQ0FBQzdSLElBQUksQ0FBQzhSLE9BQU8sRUFBRWxJLE9BQU8sRUFBRXJNLENBQUMsRUFBRSxJQUFJLENBQUM7UUFDMUMsQ0FBQyxDQUFDO01BQ0o7TUFFQXdVLFlBQVlBLENBQUEsRUFBRztRQUNiLE9BQU8sSUFBSSxDQUFDM0IsVUFBVTtNQUN4Qjs7TUFFQTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtNQUNFcFUsR0FBR0EsQ0FBQzZWLFFBQVEsRUFBRUMsT0FBTyxFQUFFO1FBQ3JCLE1BQU1uVCxNQUFNLEdBQUcsRUFBRTtRQUVqQixJQUFJLENBQUNtQixPQUFPLENBQUMsQ0FBQ2tHLEdBQUcsRUFBRXpJLENBQUMsS0FBSztVQUN2Qm9CLE1BQU0sQ0FBQzZMLElBQUksQ0FBQ3FILFFBQVEsQ0FBQzdSLElBQUksQ0FBQzhSLE9BQU8sRUFBRTlMLEdBQUcsRUFBRXpJLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNuRCxDQUFDLENBQUM7UUFFRixPQUFPb0IsTUFBTTtNQUNmOztNQUVBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0E7O01BRUE7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtNQUNFcVQsT0FBT0EsQ0FBQy9JLE9BQU8sRUFBRTtRQUNmLE9BQU81SyxlQUFlLENBQUM0VCwwQkFBMEIsQ0FBQyxJQUFJLEVBQUVoSixPQUFPLENBQUM7TUFDbEU7O01BRUE7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO01BQ0VpSixZQUFZQSxDQUFDakosT0FBTyxFQUFFO1FBQ3BCLE9BQU8sSUFBSTBJLE9BQU8sQ0FBQ0MsT0FBTyxJQUFJQSxPQUFPLENBQUMsSUFBSSxDQUFDSSxPQUFPLENBQUMvSSxPQUFPLENBQUMsQ0FBQyxDQUFDO01BQy9EOztNQUVBO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO01BQ0VrSixjQUFjQSxDQUFDbEosT0FBTyxFQUFFO1FBQ3RCLE1BQU02SCxPQUFPLEdBQUd6UyxlQUFlLENBQUMrVCxrQ0FBa0MsQ0FBQ25KLE9BQU8sQ0FBQzs7UUFFM0U7UUFDQTtRQUNBO1FBQ0E7UUFDQSxJQUFJLENBQUNBLE9BQU8sQ0FBQ29KLGdCQUFnQixJQUFJLENBQUN2QixPQUFPLEtBQUssSUFBSSxDQUFDZCxJQUFJLElBQUksSUFBSSxDQUFDQyxLQUFLLENBQUMsRUFBRTtVQUN0RSxNQUFNLElBQUkvTSxLQUFLLENBQ2IscUVBQXFFLEdBQ25FLG1FQUNKLENBQUM7UUFDSDtRQUVBLElBQUksSUFBSSxDQUFDcUwsTUFBTSxLQUFLLElBQUksQ0FBQ0EsTUFBTSxDQUFDRyxHQUFHLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQ0gsTUFBTSxDQUFDRyxHQUFHLEtBQUssS0FBSyxDQUFDLEVBQUU7VUFDdkUsTUFBTXhMLEtBQUssQ0FBQyxzREFBc0QsQ0FBQztRQUNyRTtRQUVBLE1BQU1vUCxTQUFTLEdBQ2IsSUFBSSxDQUFDL1MsT0FBTyxDQUFDd1EsV0FBVyxDQUFDLENBQUMsSUFBSWUsT0FBTyxJQUFJLElBQUl6UyxlQUFlLENBQUNrVSxNQUFNLENBQUMsQ0FBQztRQUV2RSxNQUFNbEUsS0FBSyxHQUFHO1VBQ1ptRSxNQUFNLEVBQUUsSUFBSTtVQUNaQyxLQUFLLEVBQUUsS0FBSztVQUNaSCxTQUFTO1VBQ1QvUyxPQUFPLEVBQUUsSUFBSSxDQUFDQSxPQUFPO1VBQUU7VUFDdkJ1UixPQUFPO1VBQ1A0QixZQUFZLEVBQUUsSUFBSSxDQUFDeEMsYUFBYTtVQUNoQ3lDLGVBQWUsRUFBRSxJQUFJO1VBQ3JCL0MsTUFBTSxFQUFFa0IsT0FBTyxJQUFJLElBQUksQ0FBQ2xCO1FBQzFCLENBQUM7UUFFRCxJQUFJZ0QsR0FBRzs7UUFFUDtRQUNBO1FBQ0EsSUFBSSxJQUFJLENBQUNwQyxRQUFRLEVBQUU7VUFDakJvQyxHQUFHLEdBQUcsSUFBSSxDQUFDakQsVUFBVSxDQUFDa0QsUUFBUSxFQUFFO1VBQ2hDLElBQUksQ0FBQ2xELFVBQVUsQ0FBQ21ELE9BQU8sQ0FBQ0YsR0FBRyxDQUFDLEdBQUd2RSxLQUFLO1FBQ3RDO1FBRUFBLEtBQUssQ0FBQzBFLE9BQU8sR0FBRyxJQUFJLENBQUNsQyxjQUFjLENBQUM7VUFDbENDLE9BQU87VUFDUHdCLFNBQVMsRUFBRWpFLEtBQUssQ0FBQ2lFO1FBQ25CLENBQUMsQ0FBQztRQUVGLElBQUksSUFBSSxDQUFDM0MsVUFBVSxDQUFDcUQsTUFBTSxFQUFFO1VBQzFCM0UsS0FBSyxDQUFDc0UsZUFBZSxHQUFHN0IsT0FBTyxHQUFHLEVBQUUsR0FBRyxJQUFJelMsZUFBZSxDQUFDa1UsTUFBTSxDQUFDLENBQUM7UUFDckU7O1FBRUE7UUFDQTtRQUNBO1FBQ0E7O1FBRUE7UUFDQTtRQUNBLE1BQU1VLFlBQVksR0FBSWhOLEVBQUUsSUFBSztVQUMzQixJQUFJLENBQUNBLEVBQUUsRUFBRTtZQUNQLE9BQU8sTUFBTSxDQUFDLENBQUM7VUFDakI7VUFFQSxNQUFNeEUsSUFBSSxHQUFHLElBQUk7VUFFakIsT0FBTyxTQUFVO1VBQUEsR0FBVztZQUMxQixJQUFJQSxJQUFJLENBQUNrTyxVQUFVLENBQUNxRCxNQUFNLEVBQUU7Y0FDMUI7WUFDRjtZQUVBLE1BQU1FLElBQUksR0FBRzlSLFNBQVM7WUFFdEJLLElBQUksQ0FBQ2tPLFVBQVUsQ0FBQ3dELGFBQWEsQ0FBQ0MsU0FBUyxDQUFDLE1BQU07Y0FDNUNuTixFQUFFLENBQUNvTixLQUFLLENBQUMsSUFBSSxFQUFFSCxJQUFJLENBQUM7WUFDdEIsQ0FBQyxDQUFDO1VBQ0osQ0FBQztRQUNILENBQUM7UUFFRDdFLEtBQUssQ0FBQ3NDLEtBQUssR0FBR3NDLFlBQVksQ0FBQ2hLLE9BQU8sQ0FBQzBILEtBQUssQ0FBQztRQUN6Q3RDLEtBQUssQ0FBQzhDLE9BQU8sR0FBRzhCLFlBQVksQ0FBQ2hLLE9BQU8sQ0FBQ2tJLE9BQU8sQ0FBQztRQUM3QzlDLEtBQUssQ0FBQ3VDLE9BQU8sR0FBR3FDLFlBQVksQ0FBQ2hLLE9BQU8sQ0FBQzJILE9BQU8sQ0FBQztRQUU3QyxJQUFJRSxPQUFPLEVBQUU7VUFDWHpDLEtBQUssQ0FBQzZDLFdBQVcsR0FBRytCLFlBQVksQ0FBQ2hLLE9BQU8sQ0FBQ2lJLFdBQVcsQ0FBQztVQUNyRDdDLEtBQUssQ0FBQytDLFdBQVcsR0FBRzZCLFlBQVksQ0FBQ2hLLE9BQU8sQ0FBQ21JLFdBQVcsQ0FBQztRQUN2RDtRQUVBLElBQUksQ0FBQ25JLE9BQU8sQ0FBQ3FLLGlCQUFpQixJQUFJLENBQUMsSUFBSSxDQUFDM0QsVUFBVSxDQUFDcUQsTUFBTSxFQUFFO1VBQUEsSUFBQU8sY0FBQSxFQUFBQyxtQkFBQTtVQUN6RCxNQUFNQyxPQUFPLEdBQUl6TixHQUFHLElBQUs7WUFDdkIsTUFBTXVJLE1BQU0sR0FBR3BRLEtBQUssQ0FBQ0MsS0FBSyxDQUFDNEgsR0FBRyxDQUFDO1lBRS9CLE9BQU91SSxNQUFNLENBQUNHLEdBQUc7WUFFakIsSUFBSW9DLE9BQU8sRUFBRTtjQUNYekMsS0FBSyxDQUFDNkMsV0FBVyxDQUFDbEwsR0FBRyxDQUFDMEksR0FBRyxFQUFFLElBQUksQ0FBQ3dCLGFBQWEsQ0FBQzNCLE1BQU0sQ0FBQyxFQUFFLElBQUksQ0FBQztZQUM5RDtZQUVBRixLQUFLLENBQUNzQyxLQUFLLENBQUMzSyxHQUFHLENBQUMwSSxHQUFHLEVBQUUsSUFBSSxDQUFDd0IsYUFBYSxDQUFDM0IsTUFBTSxDQUFDLENBQUM7VUFDbEQsQ0FBQztVQUNEO1VBQ0EsSUFBSUYsS0FBSyxDQUFDMEUsT0FBTyxDQUFDdFYsTUFBTSxFQUFFO1lBQ3hCLEtBQUssTUFBTXVJLEdBQUcsSUFBSXFJLEtBQUssQ0FBQzBFLE9BQU8sRUFBRTtjQUMvQlUsT0FBTyxDQUFDek4sR0FBRyxDQUFDO1lBQ2Q7VUFDRjtVQUNBO1VBQ0EsS0FBQXVOLGNBQUEsR0FBSWxGLEtBQUssQ0FBQzBFLE9BQU8sY0FBQVEsY0FBQSxnQkFBQUMsbUJBQUEsR0FBYkQsY0FBQSxDQUFlRyxJQUFJLGNBQUFGLG1CQUFBLGVBQW5CQSxtQkFBQSxDQUFBeFQsSUFBQSxDQUFBdVQsY0FBc0IsQ0FBQyxFQUFFO1lBQzNCbEYsS0FBSyxDQUFDMEUsT0FBTyxDQUFDalQsT0FBTyxDQUFDMlQsT0FBTyxDQUFDO1VBQ2hDO1FBQ0Y7UUFFQSxNQUFNRSxNQUFNLEdBQUdqWCxNQUFNLENBQUNDLE1BQU0sQ0FBQyxJQUFJMEIsZUFBZSxDQUFDdVYsYUFBYSxDQUFDLENBQUMsRUFBRTtVQUNoRWpFLFVBQVUsRUFBRSxJQUFJLENBQUNBLFVBQVU7VUFDM0JrRSxJQUFJLEVBQUVBLENBQUEsS0FBTTtZQUNWLElBQUksSUFBSSxDQUFDckQsUUFBUSxFQUFFO2NBQ2pCLE9BQU8sSUFBSSxDQUFDYixVQUFVLENBQUNtRCxPQUFPLENBQUNGLEdBQUcsQ0FBQztZQUNyQztVQUNGLENBQUM7VUFDRGtCLE9BQU8sRUFBRSxLQUFLO1VBQ2RDLGNBQWMsRUFBRTtRQUNsQixDQUFDLENBQUM7UUFFRixJQUFJLElBQUksQ0FBQ3ZELFFBQVEsSUFBSUQsT0FBTyxDQUFDeUQsTUFBTSxFQUFFO1VBQ25DO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQXpELE9BQU8sQ0FBQzBELFlBQVksQ0FBQyxNQUFNO1lBQ3pCTixNQUFNLENBQUNFLElBQUksQ0FBQyxDQUFDO1VBQ2YsQ0FBQyxDQUFDO1FBQ0o7O1FBRUE7UUFDQTtRQUNBLE1BQU1LLFdBQVcsR0FBRyxJQUFJLENBQUN2RSxVQUFVLENBQUN3RCxhQUFhLENBQUNnQixLQUFLLENBQUMsQ0FBQztRQUV6RCxJQUFJRCxXQUFXLFlBQVl2QyxPQUFPLEVBQUU7VUFDbENnQyxNQUFNLENBQUNJLGNBQWMsR0FBR0csV0FBVztVQUNuQ0EsV0FBVyxDQUFDRSxJQUFJLENBQUMsTUFBT1QsTUFBTSxDQUFDRyxPQUFPLEdBQUcsSUFBSyxDQUFDO1FBQ2pELENBQUMsTUFBTTtVQUNMSCxNQUFNLENBQUNHLE9BQU8sR0FBRyxJQUFJO1VBQ3JCSCxNQUFNLENBQUNJLGNBQWMsR0FBR3BDLE9BQU8sQ0FBQ0MsT0FBTyxDQUFDLENBQUM7UUFDM0M7UUFFQSxPQUFPK0IsTUFBTTtNQUNmOztNQUVBO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO01BQ0VVLG1CQUFtQkEsQ0FBQ3BMLE9BQU8sRUFBRTtRQUMzQixPQUFPLElBQUkwSSxPQUFPLENBQUVDLE9BQU8sSUFBSztVQUM5QixNQUFNK0IsTUFBTSxHQUFHLElBQUksQ0FBQ3hCLGNBQWMsQ0FBQ2xKLE9BQU8sQ0FBQztVQUMzQzBLLE1BQU0sQ0FBQ0ksY0FBYyxDQUFDSyxJQUFJLENBQUMsTUFBTXhDLE9BQU8sQ0FBQytCLE1BQU0sQ0FBQyxDQUFDO1FBQ25ELENBQUMsQ0FBQztNQUNKOztNQUVBO01BQ0E7TUFDQWpELE9BQU9BLENBQUM0RCxRQUFRLEVBQUVqQyxnQkFBZ0IsRUFBRTtRQUNsQyxJQUFJOUIsT0FBTyxDQUFDeUQsTUFBTSxFQUFFO1VBQ2xCLE1BQU1PLFVBQVUsR0FBRyxJQUFJaEUsT0FBTyxDQUFDaUUsVUFBVSxDQUFDLENBQUM7VUFDM0MsTUFBTUMsTUFBTSxHQUFHRixVQUFVLENBQUNwRCxPQUFPLENBQUN1RCxJQUFJLENBQUNILFVBQVUsQ0FBQztVQUVsREEsVUFBVSxDQUFDSSxNQUFNLENBQUMsQ0FBQztVQUVuQixNQUFNMUwsT0FBTyxHQUFHO1lBQUVvSixnQkFBZ0I7WUFBRWlCLGlCQUFpQixFQUFFO1VBQUssQ0FBQztVQUU3RCxDQUFDLE9BQU8sRUFBRSxhQUFhLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRSxTQUFTLENBQUMsQ0FBQ3hULE9BQU8sQ0FDbkVtRyxFQUFFLElBQUk7WUFDSixJQUFJcU8sUUFBUSxDQUFDck8sRUFBRSxDQUFDLEVBQUU7Y0FDaEJnRCxPQUFPLENBQUNoRCxFQUFFLENBQUMsR0FBR3dPLE1BQU07WUFDdEI7VUFDRixDQUNGLENBQUM7O1VBRUQ7VUFDQSxJQUFJLENBQUN0QyxjQUFjLENBQUNsSixPQUFPLENBQUM7UUFDOUI7TUFDRjtNQUVBMkwsa0JBQWtCQSxDQUFBLEVBQUc7UUFDbkIsT0FBTyxJQUFJLENBQUNqRixVQUFVLENBQUNuUixJQUFJO01BQzdCOztNQUVBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQXFTLGNBQWNBLENBQUEsRUFBZTtRQUFBLElBQWQ1SCxPQUFPLEdBQUE3SCxTQUFBLENBQUEzRCxNQUFBLFFBQUEyRCxTQUFBLFFBQUFsQyxTQUFBLEdBQUFrQyxTQUFBLE1BQUcsQ0FBQyxDQUFDO1FBQ3pCO1FBQ0E7UUFDQTtRQUNBO1FBQ0EsTUFBTXlULGNBQWMsR0FBRzVMLE9BQU8sQ0FBQzRMLGNBQWMsS0FBSyxLQUFLOztRQUV2RDtRQUNBO1FBQ0EsTUFBTTlCLE9BQU8sR0FBRzlKLE9BQU8sQ0FBQzZILE9BQU8sR0FBRyxFQUFFLEdBQUcsSUFBSXpTLGVBQWUsQ0FBQ2tVLE1BQU0sQ0FBQyxDQUFDOztRQUVuRTtRQUNBLElBQUksSUFBSSxDQUFDekMsV0FBVyxLQUFLNVEsU0FBUyxFQUFFO1VBQ2xDO1VBQ0E7VUFDQSxJQUFJMlYsY0FBYyxJQUFJLElBQUksQ0FBQzdFLElBQUksRUFBRTtZQUMvQixPQUFPK0MsT0FBTztVQUNoQjtVQUVBLE1BQU0rQixXQUFXLEdBQUcsSUFBSSxDQUFDbkYsVUFBVSxDQUFDb0YsS0FBSyxDQUFDQyxHQUFHLENBQUMsSUFBSSxDQUFDbEYsV0FBVyxDQUFDO1VBQy9ELElBQUlnRixXQUFXLEVBQUU7WUFDZixJQUFJN0wsT0FBTyxDQUFDNkgsT0FBTyxFQUFFO2NBQ25CaUMsT0FBTyxDQUFDdkksSUFBSSxDQUFDc0ssV0FBVyxDQUFDO1lBQzNCLENBQUMsTUFBTTtjQUNML0IsT0FBTyxDQUFDa0MsR0FBRyxDQUFDLElBQUksQ0FBQ25GLFdBQVcsRUFBRWdGLFdBQVcsQ0FBQztZQUM1QztVQUNGO1VBQ0EsT0FBTy9CLE9BQU87UUFDaEI7O1FBRUE7O1FBRUE7UUFDQTtRQUNBO1FBQ0EsSUFBSVQsU0FBUztRQUNiLElBQUksSUFBSSxDQUFDL1MsT0FBTyxDQUFDd1EsV0FBVyxDQUFDLENBQUMsSUFBSTlHLE9BQU8sQ0FBQzZILE9BQU8sRUFBRTtVQUNqRCxJQUFJN0gsT0FBTyxDQUFDcUosU0FBUyxFQUFFO1lBQ3JCQSxTQUFTLEdBQUdySixPQUFPLENBQUNxSixTQUFTO1lBQzdCQSxTQUFTLENBQUM0QyxLQUFLLENBQUMsQ0FBQztVQUNuQixDQUFDLE1BQU07WUFDTDVDLFNBQVMsR0FBRyxJQUFJalUsZUFBZSxDQUFDa1UsTUFBTSxDQUFDLENBQUM7VUFDMUM7UUFDRjtRQUVBNEMsTUFBTSxDQUFDQyxTQUFTLENBQUMsTUFBTTtVQUNyQixJQUFJLENBQUN6RixVQUFVLENBQUNvRixLQUFLLENBQUNqVixPQUFPLENBQUMsQ0FBQ2tHLEdBQUcsRUFBRXFQLEVBQUUsS0FBSztZQUN6QyxNQUFNQyxXQUFXLEdBQUcsSUFBSSxDQUFDL1YsT0FBTyxDQUFDYixlQUFlLENBQUNzSCxHQUFHLENBQUM7WUFDckQsSUFBSXNQLFdBQVcsQ0FBQzNXLE1BQU0sRUFBRTtjQUN0QixJQUFJc0ssT0FBTyxDQUFDNkgsT0FBTyxFQUFFO2dCQUNuQmlDLE9BQU8sQ0FBQ3ZJLElBQUksQ0FBQ3hFLEdBQUcsQ0FBQztnQkFFakIsSUFBSXNNLFNBQVMsSUFBSWdELFdBQVcsQ0FBQzFOLFFBQVEsS0FBSzFJLFNBQVMsRUFBRTtrQkFDbkRvVCxTQUFTLENBQUMyQyxHQUFHLENBQUNJLEVBQUUsRUFBRUMsV0FBVyxDQUFDMU4sUUFBUSxDQUFDO2dCQUN6QztjQUNGLENBQUMsTUFBTTtnQkFDTG1MLE9BQU8sQ0FBQ2tDLEdBQUcsQ0FBQ0ksRUFBRSxFQUFFclAsR0FBRyxDQUFDO2NBQ3RCO1lBQ0Y7O1lBRUE7WUFDQSxJQUFJLENBQUM2TyxjQUFjLEVBQUU7Y0FDbkIsT0FBTyxJQUFJO1lBQ2I7O1lBRUE7WUFDQTtZQUNBLE9BQ0UsQ0FBQyxJQUFJLENBQUM1RSxLQUFLLElBQUksSUFBSSxDQUFDRCxJQUFJLElBQUksSUFBSSxDQUFDSixNQUFNLElBQUltRCxPQUFPLENBQUN0VixNQUFNLEtBQUssSUFBSSxDQUFDd1MsS0FBSztVQUU1RSxDQUFDLENBQUM7UUFDSixDQUFDLENBQUM7UUFFRixJQUFJLENBQUNoSCxPQUFPLENBQUM2SCxPQUFPLEVBQUU7VUFDcEIsT0FBT2lDLE9BQU87UUFDaEI7UUFFQSxJQUFJLElBQUksQ0FBQ25ELE1BQU0sRUFBRTtVQUNmbUQsT0FBTyxDQUFDdEUsSUFBSSxDQUFDLElBQUksQ0FBQ21CLE1BQU0sQ0FBQzJGLGFBQWEsQ0FBQztZQUFFakQ7VUFBVSxDQUFDLENBQUMsQ0FBQztRQUN4RDs7UUFFQTtRQUNBO1FBQ0EsSUFBSSxDQUFDdUMsY0FBYyxJQUFLLENBQUMsSUFBSSxDQUFDNUUsS0FBSyxJQUFJLENBQUMsSUFBSSxDQUFDRCxJQUFLLEVBQUU7VUFDbEQsT0FBTytDLE9BQU87UUFDaEI7UUFFQSxPQUFPQSxPQUFPLENBQUN2RyxLQUFLLENBQ2xCLElBQUksQ0FBQ3dELElBQUksRUFDVCxJQUFJLENBQUNDLEtBQUssR0FBRyxJQUFJLENBQUNBLEtBQUssR0FBRyxJQUFJLENBQUNELElBQUksR0FBRytDLE9BQU8sQ0FBQ3RWLE1BQ2hELENBQUM7TUFDSDtNQUVBK1gsY0FBY0EsQ0FBQ0MsWUFBWSxFQUFFO1FBQzNCO1FBQ0EsSUFBSSxDQUFDQyxPQUFPLENBQUNDLEtBQUssRUFBRTtVQUNsQixNQUFNLElBQUl6UyxLQUFLLENBQ2IsMkRBQ0YsQ0FBQztRQUNIO1FBRUEsSUFBSSxDQUFDLElBQUksQ0FBQ3lNLFVBQVUsQ0FBQ25SLElBQUksRUFBRTtVQUN6QixNQUFNLElBQUkwRSxLQUFLLENBQ2IsMERBQ0YsQ0FBQztRQUNIO1FBRUEsT0FBT3dTLE9BQU8sQ0FBQ0MsS0FBSyxDQUFDQyxLQUFLLENBQUNDLFVBQVUsQ0FBQ0wsY0FBYyxDQUNsRCxJQUFJLEVBQ0pDLFlBQVksRUFDWixJQUFJLENBQUM5RixVQUFVLENBQUNuUixJQUNsQixDQUFDO01BQ0g7SUFDRjtJQUVBO0lBQ0E2USxvQkFBb0IsQ0FBQ3ZQLE9BQU8sQ0FBQ3lQLE1BQU0sSUFBSTtNQUNyQyxNQUFNdUcsU0FBUyxHQUFHM0csa0JBQWtCLENBQUNJLE1BQU0sQ0FBQztNQUM1Q0UsTUFBTSxDQUFDbFQsU0FBUyxDQUFDdVosU0FBUyxDQUFDLEdBQUcsWUFBa0I7UUFDOUMsSUFBSTtVQUFBLFNBQUFDLElBQUEsR0FBQTNVLFNBQUEsQ0FBQTNELE1BQUEsRUFEb0N5VixJQUFJLE9BQUFsUSxLQUFBLENBQUErUyxJQUFBLEdBQUFDLElBQUEsTUFBQUEsSUFBQSxHQUFBRCxJQUFBLEVBQUFDLElBQUE7WUFBSjlDLElBQUksQ0FBQThDLElBQUEsSUFBQTVVLFNBQUEsQ0FBQTRVLElBQUE7VUFBQTtVQUUxQyxPQUFPckUsT0FBTyxDQUFDQyxPQUFPLENBQUMsSUFBSSxDQUFDckMsTUFBTSxDQUFDLENBQUM4RCxLQUFLLENBQUMsSUFBSSxFQUFFSCxJQUFJLENBQUMsQ0FBQztRQUN4RCxDQUFDLENBQUMsT0FBTzNVLEtBQUssRUFBRTtVQUNkLE9BQU9vVCxPQUFPLENBQUNzRSxNQUFNLENBQUMxWCxLQUFLLENBQUM7UUFDOUI7TUFDRixDQUFDO0lBQ0gsQ0FBQyxDQUFDO0lBQUNnRCxzQkFBQTtFQUFBLFNBQUFDLFdBQUE7SUFBQSxPQUFBRCxzQkFBQSxDQUFBQyxXQUFBO0VBQUE7RUFBQUQsc0JBQUE7QUFBQTtFQUFBRSxJQUFBO0VBQUFDLEtBQUE7QUFBQSxHOzs7Ozs7Ozs7Ozs7OztJQzVqQkgsSUFBSXdVLGFBQWE7SUFBQzlhLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDLHNDQUFzQyxFQUFDO01BQUNnSCxPQUFPQSxDQUFDMUcsQ0FBQyxFQUFDO1FBQUN1YSxhQUFhLEdBQUN2YSxDQUFDO01BQUE7SUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0lBQXJHUCxNQUFNLENBQUN1RyxNQUFNLENBQUM7TUFBQ1UsT0FBTyxFQUFDQSxDQUFBLEtBQUloRTtJQUFlLENBQUMsQ0FBQztJQUFDLElBQUlvUixNQUFNO0lBQUNyVSxNQUFNLENBQUNDLElBQUksQ0FBQyxhQUFhLEVBQUM7TUFBQ2dILE9BQU9BLENBQUMxRyxDQUFDLEVBQUM7UUFBQzhULE1BQU0sR0FBQzlULENBQUM7TUFBQTtJQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7SUFBQyxJQUFJaVksYUFBYTtJQUFDeFksTUFBTSxDQUFDQyxJQUFJLENBQUMscUJBQXFCLEVBQUM7TUFBQ2dILE9BQU9BLENBQUMxRyxDQUFDLEVBQUM7UUFBQ2lZLGFBQWEsR0FBQ2pZLENBQUM7TUFBQTtJQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7SUFBQyxJQUFJTCxNQUFNLEVBQUMwRyxXQUFXLEVBQUN6RyxZQUFZLEVBQUNDLGdCQUFnQixFQUFDMkcsK0JBQStCLEVBQUN6RyxpQkFBaUI7SUFBQ04sTUFBTSxDQUFDQyxJQUFJLENBQUMsYUFBYSxFQUFDO01BQUNDLE1BQU1BLENBQUNLLENBQUMsRUFBQztRQUFDTCxNQUFNLEdBQUNLLENBQUM7TUFBQSxDQUFDO01BQUNxRyxXQUFXQSxDQUFDckcsQ0FBQyxFQUFDO1FBQUNxRyxXQUFXLEdBQUNyRyxDQUFDO01BQUEsQ0FBQztNQUFDSixZQUFZQSxDQUFDSSxDQUFDLEVBQUM7UUFBQ0osWUFBWSxHQUFDSSxDQUFDO01BQUEsQ0FBQztNQUFDSCxnQkFBZ0JBLENBQUNHLENBQUMsRUFBQztRQUFDSCxnQkFBZ0IsR0FBQ0csQ0FBQztNQUFBLENBQUM7TUFBQ3dHLCtCQUErQkEsQ0FBQ3hHLENBQUMsRUFBQztRQUFDd0csK0JBQStCLEdBQUN4RyxDQUFDO01BQUEsQ0FBQztNQUFDRCxpQkFBaUJBLENBQUNDLENBQUMsRUFBQztRQUFDRCxpQkFBaUIsR0FBQ0MsQ0FBQztNQUFBO0lBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQztJQUFDLElBQUl3VCxrQkFBa0I7SUFBQy9ULE1BQU0sQ0FBQ0MsSUFBSSxDQUFDLGFBQWEsRUFBQztNQUFDOFQsa0JBQWtCQSxDQUFDeFQsQ0FBQyxFQUFDO1FBQUN3VCxrQkFBa0IsR0FBQ3hULENBQUM7TUFBQTtJQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7SUFBQyxJQUFJQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNQSxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQWdCaHNCLE1BQU15QyxlQUFlLENBQUM7TUFDbkNxUixXQUFXQSxDQUFDbFIsSUFBSSxFQUFFO1FBQ2hCLElBQUksQ0FBQ0EsSUFBSSxHQUFHQSxJQUFJO1FBQ2hCO1FBQ0EsSUFBSSxDQUFDdVcsS0FBSyxHQUFHLElBQUkxVyxlQUFlLENBQUNrVSxNQUFNLENBQUQsQ0FBQztRQUV2QyxJQUFJLENBQUNZLGFBQWEsR0FBR2dDLE1BQU0sQ0FBQ2dCLFFBQVEsR0FDaEMsSUFBSWhCLE1BQU0sQ0FBQ2lCLGlCQUFpQixDQUFDLENBQUMsR0FDOUIsSUFBSWpCLE1BQU0sQ0FBQ2tCLGtCQUFrQixDQUFDLENBQUM7UUFFbkMsSUFBSSxDQUFDeEQsUUFBUSxHQUFHLENBQUMsQ0FBQyxDQUFDOztRQUVuQjtRQUNBO1FBQ0E7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBLElBQUksQ0FBQ0MsT0FBTyxHQUFHcFcsTUFBTSxDQUFDNFosTUFBTSxDQUFDLElBQUksQ0FBQzs7UUFFbEM7UUFDQTtRQUNBLElBQUksQ0FBQ0MsZUFBZSxHQUFHLElBQUk7O1FBRTNCO1FBQ0EsSUFBSSxDQUFDdkQsTUFBTSxHQUFHLEtBQUs7TUFDckI7TUFFQXdELGNBQWNBLENBQUMxVixRQUFRLEVBQUVtSSxPQUFPLEVBQUU7UUFDaEMsT0FBTyxJQUFJLENBQUN4SixJQUFJLENBQUNxQixRQUFRLGFBQVJBLFFBQVEsY0FBUkEsUUFBUSxHQUFJLENBQUMsQ0FBQyxFQUFFbUksT0FBTyxDQUFDLENBQUN3TixVQUFVLENBQUMsQ0FBQztNQUN4RDtNQUVBQyxzQkFBc0JBLENBQUN6TixPQUFPLEVBQUU7UUFDOUIsT0FBTyxJQUFJLENBQUN4SixJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUV3SixPQUFPLENBQUMsQ0FBQ3dOLFVBQVUsQ0FBQyxDQUFDO01BQzVDOztNQUVBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBaFgsSUFBSUEsQ0FBQ3FCLFFBQVEsRUFBRW1JLE9BQU8sRUFBRTtRQUN0QjtRQUNBO1FBQ0E7UUFDQSxJQUFJN0gsU0FBUyxDQUFDM0QsTUFBTSxLQUFLLENBQUMsRUFBRTtVQUMxQnFELFFBQVEsR0FBRyxDQUFDLENBQUM7UUFDZjtRQUVBLE9BQU8sSUFBSXpDLGVBQWUsQ0FBQ29SLE1BQU0sQ0FBQyxJQUFJLEVBQUUzTyxRQUFRLEVBQUVtSSxPQUFPLENBQUM7TUFDNUQ7TUFFQTBOLE9BQU9BLENBQUM3VixRQUFRLEVBQWdCO1FBQUEsSUFBZG1JLE9BQU8sR0FBQTdILFNBQUEsQ0FBQTNELE1BQUEsUUFBQTJELFNBQUEsUUFBQWxDLFNBQUEsR0FBQWtDLFNBQUEsTUFBRyxDQUFDLENBQUM7UUFDNUIsSUFBSUEsU0FBUyxDQUFDM0QsTUFBTSxLQUFLLENBQUMsRUFBRTtVQUMxQnFELFFBQVEsR0FBRyxDQUFDLENBQUM7UUFDZjs7UUFFQTtRQUNBO1FBQ0E7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBO1FBQ0FtSSxPQUFPLENBQUNnSCxLQUFLLEdBQUcsQ0FBQztRQUVqQixPQUFPLElBQUksQ0FBQ3hRLElBQUksQ0FBQ3FCLFFBQVEsRUFBRW1JLE9BQU8sQ0FBQyxDQUFDOEgsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7TUFDaEQ7TUFDQSxNQUFNNkYsWUFBWUEsQ0FBQzlWLFFBQVEsRUFBZ0I7UUFBQSxJQUFkbUksT0FBTyxHQUFBN0gsU0FBQSxDQUFBM0QsTUFBQSxRQUFBMkQsU0FBQSxRQUFBbEMsU0FBQSxHQUFBa0MsU0FBQSxNQUFHLENBQUMsQ0FBQztRQUN2QyxJQUFJQSxTQUFTLENBQUMzRCxNQUFNLEtBQUssQ0FBQyxFQUFFO1VBQzFCcUQsUUFBUSxHQUFHLENBQUMsQ0FBQztRQUNmO1FBQ0FtSSxPQUFPLENBQUNnSCxLQUFLLEdBQUcsQ0FBQztRQUNqQixPQUFPLENBQUMsTUFBTSxJQUFJLENBQUN4USxJQUFJLENBQUNxQixRQUFRLEVBQUVtSSxPQUFPLENBQUMsQ0FBQzROLFVBQVUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO01BQzdEO01BQ0FDLGFBQWFBLENBQUM5USxHQUFHLEVBQUU7UUFDakIrUSx3QkFBd0IsQ0FBQy9RLEdBQUcsQ0FBQzs7UUFFN0I7UUFDQTtRQUNBLElBQUksQ0FBQzFLLE1BQU0sQ0FBQzBFLElBQUksQ0FBQ2dHLEdBQUcsRUFBRSxLQUFLLENBQUMsRUFBRTtVQUM1QkEsR0FBRyxDQUFDMEksR0FBRyxHQUFHclEsZUFBZSxDQUFDMlksT0FBTyxHQUFHLElBQUlDLE9BQU8sQ0FBQ0MsUUFBUSxDQUFDLENBQUMsR0FBR0MsTUFBTSxDQUFDOUIsRUFBRSxDQUFDLENBQUM7UUFDMUU7UUFFQSxNQUFNQSxFQUFFLEdBQUdyUCxHQUFHLENBQUMwSSxHQUFHO1FBRWxCLElBQUksSUFBSSxDQUFDcUcsS0FBSyxDQUFDcUMsR0FBRyxDQUFDL0IsRUFBRSxDQUFDLEVBQUU7VUFDdEIsTUFBTXJJLGNBQWMsbUJBQUEvUCxNQUFBLENBQW1Cb1ksRUFBRSxNQUFHLENBQUM7UUFDL0M7UUFFQSxJQUFJLENBQUNnQyxhQUFhLENBQUNoQyxFQUFFLEVBQUVuVyxTQUFTLENBQUM7UUFDakMsSUFBSSxDQUFDNlYsS0FBSyxDQUFDRSxHQUFHLENBQUNJLEVBQUUsRUFBRXJQLEdBQUcsQ0FBQztRQUV2QixPQUFPcVAsRUFBRTtNQUNYOztNQUVBO01BQ0E7TUFDQWlDLE1BQU1BLENBQUN0UixHQUFHLEVBQUU2TCxRQUFRLEVBQUU7UUFDcEI3TCxHQUFHLEdBQUc3SCxLQUFLLENBQUNDLEtBQUssQ0FBQzRILEdBQUcsQ0FBQztRQUN0QixNQUFNcVAsRUFBRSxHQUFHLElBQUksQ0FBQ3lCLGFBQWEsQ0FBQzlRLEdBQUcsQ0FBQztRQUNsQyxNQUFNdVIsa0JBQWtCLEdBQUcsRUFBRTs7UUFFN0I7UUFDQSxLQUFLLE1BQU0zRSxHQUFHLElBQUlsVyxNQUFNLENBQUNRLElBQUksQ0FBQyxJQUFJLENBQUM0VixPQUFPLENBQUMsRUFBRTtVQUMzQyxNQUFNekUsS0FBSyxHQUFHLElBQUksQ0FBQ3lFLE9BQU8sQ0FBQ0YsR0FBRyxDQUFDO1VBRS9CLElBQUl2RSxLQUFLLENBQUNvRSxLQUFLLEVBQUU7WUFDZjtVQUNGO1VBRUEsTUFBTTZDLFdBQVcsR0FBR2pILEtBQUssQ0FBQzlPLE9BQU8sQ0FBQ2IsZUFBZSxDQUFDc0gsR0FBRyxDQUFDO1VBRXRELElBQUlzUCxXQUFXLENBQUMzVyxNQUFNLEVBQUU7WUFDdEIsSUFBSTBQLEtBQUssQ0FBQ2lFLFNBQVMsSUFBSWdELFdBQVcsQ0FBQzFOLFFBQVEsS0FBSzFJLFNBQVMsRUFBRTtjQUN6RG1QLEtBQUssQ0FBQ2lFLFNBQVMsQ0FBQzJDLEdBQUcsQ0FBQ0ksRUFBRSxFQUFFQyxXQUFXLENBQUMxTixRQUFRLENBQUM7WUFDL0M7WUFFQSxJQUFJeUcsS0FBSyxDQUFDbUUsTUFBTSxDQUFDeEMsSUFBSSxJQUFJM0IsS0FBSyxDQUFDbUUsTUFBTSxDQUFDdkMsS0FBSyxFQUFFO2NBQzNDc0gsa0JBQWtCLENBQUMvTSxJQUFJLENBQUNvSSxHQUFHLENBQUM7WUFDOUIsQ0FBQyxNQUFNO2NBQ0x2VSxlQUFlLENBQUNtWixvQkFBb0IsQ0FBQ25KLEtBQUssRUFBRXJJLEdBQUcsQ0FBQztZQUNsRDtVQUNGO1FBQ0Y7UUFFQXVSLGtCQUFrQixDQUFDelgsT0FBTyxDQUFDOFMsR0FBRyxJQUFJO1VBQ2hDLElBQUksSUFBSSxDQUFDRSxPQUFPLENBQUNGLEdBQUcsQ0FBQyxFQUFFO1lBQ3JCLElBQUksQ0FBQzZFLGlCQUFpQixDQUFDLElBQUksQ0FBQzNFLE9BQU8sQ0FBQ0YsR0FBRyxDQUFDLENBQUM7VUFDM0M7UUFDRixDQUFDLENBQUM7UUFFRixJQUFJLENBQUNPLGFBQWEsQ0FBQ2dCLEtBQUssQ0FBQyxDQUFDO1FBQzFCLElBQUl0QyxRQUFRLEVBQUU7VUFDWnNELE1BQU0sQ0FBQ3VDLEtBQUssQ0FBQyxNQUFNO1lBQ2pCN0YsUUFBUSxDQUFDLElBQUksRUFBRXdELEVBQUUsQ0FBQztVQUNwQixDQUFDLENBQUM7UUFDSjtRQUVBLE9BQU9BLEVBQUU7TUFDWDtNQUNBLE1BQU1zQyxXQUFXQSxDQUFDM1IsR0FBRyxFQUFFNkwsUUFBUSxFQUFFO1FBQy9CN0wsR0FBRyxHQUFHN0gsS0FBSyxDQUFDQyxLQUFLLENBQUM0SCxHQUFHLENBQUM7UUFDdEIsTUFBTXFQLEVBQUUsR0FBRyxJQUFJLENBQUN5QixhQUFhLENBQUM5USxHQUFHLENBQUM7UUFDbEMsTUFBTXVSLGtCQUFrQixHQUFHLEVBQUU7O1FBRTdCO1FBQ0EsS0FBSyxNQUFNM0UsR0FBRyxJQUFJbFcsTUFBTSxDQUFDUSxJQUFJLENBQUMsSUFBSSxDQUFDNFYsT0FBTyxDQUFDLEVBQUU7VUFDM0MsTUFBTXpFLEtBQUssR0FBRyxJQUFJLENBQUN5RSxPQUFPLENBQUNGLEdBQUcsQ0FBQztVQUUvQixJQUFJdkUsS0FBSyxDQUFDb0UsS0FBSyxFQUFFO1lBQ2Y7VUFDRjtVQUVBLE1BQU02QyxXQUFXLEdBQUdqSCxLQUFLLENBQUM5TyxPQUFPLENBQUNiLGVBQWUsQ0FBQ3NILEdBQUcsQ0FBQztVQUV0RCxJQUFJc1AsV0FBVyxDQUFDM1csTUFBTSxFQUFFO1lBQ3RCLElBQUkwUCxLQUFLLENBQUNpRSxTQUFTLElBQUlnRCxXQUFXLENBQUMxTixRQUFRLEtBQUsxSSxTQUFTLEVBQUU7Y0FDekRtUCxLQUFLLENBQUNpRSxTQUFTLENBQUMyQyxHQUFHLENBQUNJLEVBQUUsRUFBRUMsV0FBVyxDQUFDMU4sUUFBUSxDQUFDO1lBQy9DO1lBRUEsSUFBSXlHLEtBQUssQ0FBQ21FLE1BQU0sQ0FBQ3hDLElBQUksSUFBSTNCLEtBQUssQ0FBQ21FLE1BQU0sQ0FBQ3ZDLEtBQUssRUFBRTtjQUMzQ3NILGtCQUFrQixDQUFDL00sSUFBSSxDQUFDb0ksR0FBRyxDQUFDO1lBQzlCLENBQUMsTUFBTTtjQUNMLE1BQU12VSxlQUFlLENBQUN1WixxQkFBcUIsQ0FBQ3ZKLEtBQUssRUFBRXJJLEdBQUcsQ0FBQztZQUN6RDtVQUNGO1FBQ0Y7UUFFQXVSLGtCQUFrQixDQUFDelgsT0FBTyxDQUFDOFMsR0FBRyxJQUFJO1VBQ2hDLElBQUksSUFBSSxDQUFDRSxPQUFPLENBQUNGLEdBQUcsQ0FBQyxFQUFFO1lBQ3JCLElBQUksQ0FBQzZFLGlCQUFpQixDQUFDLElBQUksQ0FBQzNFLE9BQU8sQ0FBQ0YsR0FBRyxDQUFDLENBQUM7VUFDM0M7UUFDRixDQUFDLENBQUM7UUFFRixNQUFNLElBQUksQ0FBQ08sYUFBYSxDQUFDZ0IsS0FBSyxDQUFDLENBQUM7UUFDaEMsSUFBSXRDLFFBQVEsRUFBRTtVQUNac0QsTUFBTSxDQUFDdUMsS0FBSyxDQUFDLE1BQU07WUFDakI3RixRQUFRLENBQUMsSUFBSSxFQUFFd0QsRUFBRSxDQUFDO1VBQ3BCLENBQUMsQ0FBQztRQUNKO1FBRUEsT0FBT0EsRUFBRTtNQUNYOztNQUVBO01BQ0E7TUFDQXdDLGNBQWNBLENBQUEsRUFBRztRQUNmO1FBQ0EsSUFBSSxJQUFJLENBQUM3RSxNQUFNLEVBQUU7VUFDZjtRQUNGOztRQUVBO1FBQ0EsSUFBSSxDQUFDQSxNQUFNLEdBQUcsSUFBSTs7UUFFbEI7UUFDQXRXLE1BQU0sQ0FBQ1EsSUFBSSxDQUFDLElBQUksQ0FBQzRWLE9BQU8sQ0FBQyxDQUFDaFQsT0FBTyxDQUFDOFMsR0FBRyxJQUFJO1VBQ3ZDLE1BQU12RSxLQUFLLEdBQUcsSUFBSSxDQUFDeUUsT0FBTyxDQUFDRixHQUFHLENBQUM7VUFDL0J2RSxLQUFLLENBQUNzRSxlQUFlLEdBQUd4VSxLQUFLLENBQUNDLEtBQUssQ0FBQ2lRLEtBQUssQ0FBQzBFLE9BQU8sQ0FBQztRQUNwRCxDQUFDLENBQUM7TUFDSjtNQUVBK0Usa0JBQWtCQSxDQUFDakcsUUFBUSxFQUFFO1FBQzNCLE1BQU1sVCxNQUFNLEdBQUcsSUFBSSxDQUFDb1csS0FBSyxDQUFDckIsSUFBSSxDQUFDLENBQUM7UUFFaEMsSUFBSSxDQUFDcUIsS0FBSyxDQUFDRyxLQUFLLENBQUMsQ0FBQztRQUVsQnhZLE1BQU0sQ0FBQ1EsSUFBSSxDQUFDLElBQUksQ0FBQzRWLE9BQU8sQ0FBQyxDQUFDaFQsT0FBTyxDQUFDOFMsR0FBRyxJQUFJO1VBQ3ZDLE1BQU12RSxLQUFLLEdBQUcsSUFBSSxDQUFDeUUsT0FBTyxDQUFDRixHQUFHLENBQUM7VUFFL0IsSUFBSXZFLEtBQUssQ0FBQ3lDLE9BQU8sRUFBRTtZQUNqQnpDLEtBQUssQ0FBQzBFLE9BQU8sR0FBRyxFQUFFO1VBQ3BCLENBQUMsTUFBTTtZQUNMMUUsS0FBSyxDQUFDMEUsT0FBTyxDQUFDbUMsS0FBSyxDQUFDLENBQUM7VUFDdkI7UUFDRixDQUFDLENBQUM7UUFFRixJQUFJckQsUUFBUSxFQUFFO1VBQ1pzRCxNQUFNLENBQUN1QyxLQUFLLENBQUMsTUFBTTtZQUNqQjdGLFFBQVEsQ0FBQyxJQUFJLEVBQUVsVCxNQUFNLENBQUM7VUFDeEIsQ0FBQyxDQUFDO1FBQ0o7UUFFQSxPQUFPQSxNQUFNO01BQ2Y7TUFHQW9aLGFBQWFBLENBQUNqWCxRQUFRLEVBQUU7UUFDdEIsTUFBTXZCLE9BQU8sR0FBRyxJQUFJMUQsU0FBUyxDQUFDUyxPQUFPLENBQUN3RSxRQUFRLENBQUM7UUFDL0MsTUFBTWtYLE1BQU0sR0FBRyxFQUFFO1FBRWpCLElBQUksQ0FBQ0MsNEJBQTRCLENBQUNuWCxRQUFRLEVBQUUsQ0FBQ2tGLEdBQUcsRUFBRXFQLEVBQUUsS0FBSztVQUN2RCxJQUFJOVYsT0FBTyxDQUFDYixlQUFlLENBQUNzSCxHQUFHLENBQUMsQ0FBQ3JILE1BQU0sRUFBRTtZQUN2Q3FaLE1BQU0sQ0FBQ3hOLElBQUksQ0FBQzZLLEVBQUUsQ0FBQztVQUNqQjtRQUNGLENBQUMsQ0FBQztRQUVGLE1BQU1rQyxrQkFBa0IsR0FBRyxFQUFFO1FBQzdCLE1BQU1XLFdBQVcsR0FBRyxFQUFFO1FBRXRCLEtBQUssSUFBSTNhLENBQUMsR0FBRyxDQUFDLEVBQUVBLENBQUMsR0FBR3lhLE1BQU0sQ0FBQ3ZhLE1BQU0sRUFBRUYsQ0FBQyxFQUFFLEVBQUU7VUFDdEMsTUFBTTRhLFFBQVEsR0FBR0gsTUFBTSxDQUFDemEsQ0FBQyxDQUFDO1VBQzFCLE1BQU02YSxTQUFTLEdBQUcsSUFBSSxDQUFDckQsS0FBSyxDQUFDQyxHQUFHLENBQUNtRCxRQUFRLENBQUM7VUFFMUN6YixNQUFNLENBQUNRLElBQUksQ0FBQyxJQUFJLENBQUM0VixPQUFPLENBQUMsQ0FBQ2hULE9BQU8sQ0FBQzhTLEdBQUcsSUFBSTtZQUN2QyxNQUFNdkUsS0FBSyxHQUFHLElBQUksQ0FBQ3lFLE9BQU8sQ0FBQ0YsR0FBRyxDQUFDO1lBRS9CLElBQUl2RSxLQUFLLENBQUNvRSxLQUFLLEVBQUU7Y0FDZjtZQUNGO1lBRUEsSUFBSXBFLEtBQUssQ0FBQzlPLE9BQU8sQ0FBQ2IsZUFBZSxDQUFDMFosU0FBUyxDQUFDLENBQUN6WixNQUFNLEVBQUU7Y0FDbkQsSUFBSTBQLEtBQUssQ0FBQ21FLE1BQU0sQ0FBQ3hDLElBQUksSUFBSTNCLEtBQUssQ0FBQ21FLE1BQU0sQ0FBQ3ZDLEtBQUssRUFBRTtnQkFDM0NzSCxrQkFBa0IsQ0FBQy9NLElBQUksQ0FBQ29JLEdBQUcsQ0FBQztjQUM5QixDQUFDLE1BQU07Z0JBQ0xzRixXQUFXLENBQUMxTixJQUFJLENBQUM7a0JBQUNvSSxHQUFHO2tCQUFFNU0sR0FBRyxFQUFFb1M7Z0JBQVMsQ0FBQyxDQUFDO2NBQ3pDO1lBQ0Y7VUFDRixDQUFDLENBQUM7VUFFRixJQUFJLENBQUNmLGFBQWEsQ0FBQ2MsUUFBUSxFQUFFQyxTQUFTLENBQUM7VUFDdkMsSUFBSSxDQUFDckQsS0FBSyxDQUFDaUQsTUFBTSxDQUFDRyxRQUFRLENBQUM7UUFDN0I7UUFFQSxPQUFPO1VBQUVaLGtCQUFrQjtVQUFFVyxXQUFXO1VBQUVGO1FBQU8sQ0FBQztNQUNwRDtNQUVBQSxNQUFNQSxDQUFDbFgsUUFBUSxFQUFFK1EsUUFBUSxFQUFFO1FBQ3pCO1FBQ0E7UUFDQTtRQUNBLElBQUksSUFBSSxDQUFDbUIsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDdUQsZUFBZSxJQUFJcFksS0FBSyxDQUFDa2EsTUFBTSxDQUFDdlgsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUU7VUFDdEUsT0FBTyxJQUFJLENBQUNnWCxrQkFBa0IsQ0FBQ2pHLFFBQVEsQ0FBQztRQUMxQztRQUVBLE1BQU07VUFBRTBGLGtCQUFrQjtVQUFFVyxXQUFXO1VBQUVGO1FBQU8sQ0FBQyxHQUFHLElBQUksQ0FBQ0QsYUFBYSxDQUFDalgsUUFBUSxDQUFDOztRQUVoRjtRQUNBb1gsV0FBVyxDQUFDcFksT0FBTyxDQUFDa1ksTUFBTSxJQUFJO1VBQzVCLE1BQU0zSixLQUFLLEdBQUcsSUFBSSxDQUFDeUUsT0FBTyxDQUFDa0YsTUFBTSxDQUFDcEYsR0FBRyxDQUFDO1VBRXRDLElBQUl2RSxLQUFLLEVBQUU7WUFDVEEsS0FBSyxDQUFDaUUsU0FBUyxJQUFJakUsS0FBSyxDQUFDaUUsU0FBUyxDQUFDMEYsTUFBTSxDQUFDQSxNQUFNLENBQUNoUyxHQUFHLENBQUMwSSxHQUFHLENBQUM7WUFDekRyUSxlQUFlLENBQUNpYSxzQkFBc0IsQ0FBQ2pLLEtBQUssRUFBRTJKLE1BQU0sQ0FBQ2hTLEdBQUcsQ0FBQztVQUMzRDtRQUNGLENBQUMsQ0FBQztRQUVGdVIsa0JBQWtCLENBQUN6WCxPQUFPLENBQUM4UyxHQUFHLElBQUk7VUFDaEMsTUFBTXZFLEtBQUssR0FBRyxJQUFJLENBQUN5RSxPQUFPLENBQUNGLEdBQUcsQ0FBQztVQUUvQixJQUFJdkUsS0FBSyxFQUFFO1lBQ1QsSUFBSSxDQUFDb0osaUJBQWlCLENBQUNwSixLQUFLLENBQUM7VUFDL0I7UUFDRixDQUFDLENBQUM7UUFFRixJQUFJLENBQUM4RSxhQUFhLENBQUNnQixLQUFLLENBQUMsQ0FBQztRQUUxQixNQUFNeFYsTUFBTSxHQUFHcVosTUFBTSxDQUFDdmEsTUFBTTtRQUU1QixJQUFJb1UsUUFBUSxFQUFFO1VBQ1pzRCxNQUFNLENBQUN1QyxLQUFLLENBQUMsTUFBTTtZQUNqQjdGLFFBQVEsQ0FBQyxJQUFJLEVBQUVsVCxNQUFNLENBQUM7VUFDeEIsQ0FBQyxDQUFDO1FBQ0o7UUFFQSxPQUFPQSxNQUFNO01BQ2Y7TUFFQSxNQUFNNFosV0FBV0EsQ0FBQ3pYLFFBQVEsRUFBRStRLFFBQVEsRUFBRTtRQUNwQztRQUNBO1FBQ0E7UUFDQSxJQUFJLElBQUksQ0FBQ21CLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQ3VELGVBQWUsSUFBSXBZLEtBQUssQ0FBQ2thLE1BQU0sQ0FBQ3ZYLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFO1VBQ3RFLE9BQU8sSUFBSSxDQUFDZ1gsa0JBQWtCLENBQUNqRyxRQUFRLENBQUM7UUFDMUM7UUFFQSxNQUFNO1VBQUUwRixrQkFBa0I7VUFBRVcsV0FBVztVQUFFRjtRQUFPLENBQUMsR0FBRyxJQUFJLENBQUNELGFBQWEsQ0FBQ2pYLFFBQVEsQ0FBQzs7UUFFaEY7UUFDQSxLQUFLLE1BQU1rWCxNQUFNLElBQUlFLFdBQVcsRUFBRTtVQUNoQyxNQUFNN0osS0FBSyxHQUFHLElBQUksQ0FBQ3lFLE9BQU8sQ0FBQ2tGLE1BQU0sQ0FBQ3BGLEdBQUcsQ0FBQztVQUV0QyxJQUFJdkUsS0FBSyxFQUFFO1lBQ1RBLEtBQUssQ0FBQ2lFLFNBQVMsSUFBSWpFLEtBQUssQ0FBQ2lFLFNBQVMsQ0FBQzBGLE1BQU0sQ0FBQ0EsTUFBTSxDQUFDaFMsR0FBRyxDQUFDMEksR0FBRyxDQUFDO1lBQ3pELE1BQU1yUSxlQUFlLENBQUNtYSx1QkFBdUIsQ0FBQ25LLEtBQUssRUFBRTJKLE1BQU0sQ0FBQ2hTLEdBQUcsQ0FBQztVQUNsRTtRQUNGO1FBQ0F1UixrQkFBa0IsQ0FBQ3pYLE9BQU8sQ0FBQzhTLEdBQUcsSUFBSTtVQUNoQyxNQUFNdkUsS0FBSyxHQUFHLElBQUksQ0FBQ3lFLE9BQU8sQ0FBQ0YsR0FBRyxDQUFDO1VBRS9CLElBQUl2RSxLQUFLLEVBQUU7WUFDVCxJQUFJLENBQUNvSixpQkFBaUIsQ0FBQ3BKLEtBQUssQ0FBQztVQUMvQjtRQUNGLENBQUMsQ0FBQztRQUVGLE1BQU0sSUFBSSxDQUFDOEUsYUFBYSxDQUFDZ0IsS0FBSyxDQUFDLENBQUM7UUFFaEMsTUFBTXhWLE1BQU0sR0FBR3FaLE1BQU0sQ0FBQ3ZhLE1BQU07UUFFNUIsSUFBSW9VLFFBQVEsRUFBRTtVQUNac0QsTUFBTSxDQUFDdUMsS0FBSyxDQUFDLE1BQU07WUFDakI3RixRQUFRLENBQUMsSUFBSSxFQUFFbFQsTUFBTSxDQUFDO1VBQ3hCLENBQUMsQ0FBQztRQUNKO1FBRUEsT0FBT0EsTUFBTTtNQUNmOztNQUVBO01BQ0E7TUFDQTtNQUNBO01BQ0E4WixnQkFBZ0JBLENBQUEsRUFBRztRQUNqQjtRQUNBLElBQUksQ0FBQyxJQUFJLENBQUN6RixNQUFNLEVBQUU7VUFDaEI7UUFDRjs7UUFFQTtRQUNBO1FBQ0EsSUFBSSxDQUFDQSxNQUFNLEdBQUcsS0FBSztRQUVuQnRXLE1BQU0sQ0FBQ1EsSUFBSSxDQUFDLElBQUksQ0FBQzRWLE9BQU8sQ0FBQyxDQUFDaFQsT0FBTyxDQUFDOFMsR0FBRyxJQUFJO1VBQ3ZDLE1BQU12RSxLQUFLLEdBQUcsSUFBSSxDQUFDeUUsT0FBTyxDQUFDRixHQUFHLENBQUM7VUFFL0IsSUFBSXZFLEtBQUssQ0FBQ29FLEtBQUssRUFBRTtZQUNmcEUsS0FBSyxDQUFDb0UsS0FBSyxHQUFHLEtBQUs7O1lBRW5CO1lBQ0E7WUFDQSxJQUFJLENBQUNnRixpQkFBaUIsQ0FBQ3BKLEtBQUssRUFBRUEsS0FBSyxDQUFDc0UsZUFBZSxDQUFDO1VBQ3RELENBQUMsTUFBTTtZQUNMO1lBQ0E7WUFDQXRVLGVBQWUsQ0FBQ3FhLGlCQUFpQixDQUMvQnJLLEtBQUssQ0FBQ3lDLE9BQU8sRUFDYnpDLEtBQUssQ0FBQ3NFLGVBQWUsRUFDckJ0RSxLQUFLLENBQUMwRSxPQUFPLEVBQ2IxRSxLQUFLLEVBQ0w7Y0FBQ3FFLFlBQVksRUFBRXJFLEtBQUssQ0FBQ3FFO1lBQVksQ0FDbkMsQ0FBQztVQUNIO1VBRUFyRSxLQUFLLENBQUNzRSxlQUFlLEdBQUcsSUFBSTtRQUM5QixDQUFDLENBQUM7TUFDSjtNQUVBLE1BQU1nRyxxQkFBcUJBLENBQUEsRUFBRztRQUM1QixJQUFJLENBQUNGLGdCQUFnQixDQUFDLENBQUM7UUFDdkIsTUFBTSxJQUFJLENBQUN0RixhQUFhLENBQUNnQixLQUFLLENBQUMsQ0FBQztNQUNsQztNQUNBeUUscUJBQXFCQSxDQUFBLEVBQUc7UUFDdEIsSUFBSSxDQUFDSCxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ3ZCLElBQUksQ0FBQ3RGLGFBQWEsQ0FBQ2dCLEtBQUssQ0FBQyxDQUFDO01BQzVCO01BRUEwRSxpQkFBaUJBLENBQUEsRUFBRztRQUNsQixJQUFJLENBQUMsSUFBSSxDQUFDdEMsZUFBZSxFQUFFO1VBQ3pCLE1BQU0sSUFBSXJULEtBQUssQ0FBQyxnREFBZ0QsQ0FBQztRQUNuRTtRQUVBLE1BQU00VixTQUFTLEdBQUcsSUFBSSxDQUFDdkMsZUFBZTtRQUV0QyxJQUFJLENBQUNBLGVBQWUsR0FBRyxJQUFJO1FBRTNCLE9BQU91QyxTQUFTO01BQ2xCOztNQUVBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0FDLGFBQWFBLENBQUEsRUFBRztRQUNkLElBQUksSUFBSSxDQUFDeEMsZUFBZSxFQUFFO1VBQ3hCLE1BQU0sSUFBSXJULEtBQUssQ0FBQyxzREFBc0QsQ0FBQztRQUN6RTtRQUVBLElBQUksQ0FBQ3FULGVBQWUsR0FBRyxJQUFJbFksZUFBZSxDQUFDa1UsTUFBTSxDQUFELENBQUM7TUFDbkQ7TUFFQXlHLGFBQWFBLENBQUNsWSxRQUFRLEVBQUU7UUFDdEI7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBLE1BQU1tWSxvQkFBb0IsR0FBRyxDQUFDLENBQUM7O1FBRS9CO1FBQ0E7UUFDQSxNQUFNQyxNQUFNLEdBQUcsSUFBSTdhLGVBQWUsQ0FBQ2tVLE1BQU0sQ0FBRCxDQUFDO1FBQ3pDLE1BQU00RyxVQUFVLEdBQUc5YSxlQUFlLENBQUMrYSxxQkFBcUIsQ0FBQ3RZLFFBQVEsQ0FBQztRQUVsRXBFLE1BQU0sQ0FBQ1EsSUFBSSxDQUFDLElBQUksQ0FBQzRWLE9BQU8sQ0FBQyxDQUFDaFQsT0FBTyxDQUFDOFMsR0FBRyxJQUFJO1VBQ3ZDLE1BQU12RSxLQUFLLEdBQUcsSUFBSSxDQUFDeUUsT0FBTyxDQUFDRixHQUFHLENBQUM7VUFFL0IsSUFBSSxDQUFDdkUsS0FBSyxDQUFDbUUsTUFBTSxDQUFDeEMsSUFBSSxJQUFJM0IsS0FBSyxDQUFDbUUsTUFBTSxDQUFDdkMsS0FBSyxLQUFLLENBQUUsSUFBSSxDQUFDK0MsTUFBTSxFQUFFO1lBQzlEO1lBQ0E7WUFDQTtZQUNBO1lBQ0E7WUFDQSxJQUFJM0UsS0FBSyxDQUFDMEUsT0FBTyxZQUFZMVUsZUFBZSxDQUFDa1UsTUFBTSxFQUFFO2NBQ25EMEcsb0JBQW9CLENBQUNyRyxHQUFHLENBQUMsR0FBR3ZFLEtBQUssQ0FBQzBFLE9BQU8sQ0FBQzNVLEtBQUssQ0FBQyxDQUFDO2NBQ2pEO1lBQ0Y7WUFFQSxJQUFJLEVBQUVpUSxLQUFLLENBQUMwRSxPQUFPLFlBQVkvUCxLQUFLLENBQUMsRUFBRTtjQUNyQyxNQUFNLElBQUlFLEtBQUssQ0FBQyw4Q0FBOEMsQ0FBQztZQUNqRTs7WUFFQTtZQUNBO1lBQ0E7WUFDQTtZQUNBLE1BQU1tVyxxQkFBcUIsR0FBR3JULEdBQUcsSUFBSTtjQUNuQyxJQUFJa1QsTUFBTSxDQUFDOUIsR0FBRyxDQUFDcFIsR0FBRyxDQUFDMEksR0FBRyxDQUFDLEVBQUU7Z0JBQ3ZCLE9BQU93SyxNQUFNLENBQUNsRSxHQUFHLENBQUNoUCxHQUFHLENBQUMwSSxHQUFHLENBQUM7Y0FDNUI7Y0FFQSxNQUFNNEssWUFBWSxHQUNoQkgsVUFBVSxJQUNWLENBQUNBLFVBQVUsQ0FBQ2hjLElBQUksQ0FBQ2tZLEVBQUUsSUFBSWxYLEtBQUssQ0FBQ2thLE1BQU0sQ0FBQ2hELEVBQUUsRUFBRXJQLEdBQUcsQ0FBQzBJLEdBQUcsQ0FBQyxDQUFDLEdBQy9DMUksR0FBRyxHQUFHN0gsS0FBSyxDQUFDQyxLQUFLLENBQUM0SCxHQUFHLENBQUM7Y0FFMUJrVCxNQUFNLENBQUNqRSxHQUFHLENBQUNqUCxHQUFHLENBQUMwSSxHQUFHLEVBQUU0SyxZQUFZLENBQUM7Y0FFakMsT0FBT0EsWUFBWTtZQUNyQixDQUFDO1lBRURMLG9CQUFvQixDQUFDckcsR0FBRyxDQUFDLEdBQUd2RSxLQUFLLENBQUMwRSxPQUFPLENBQUMvVyxHQUFHLENBQUNxZCxxQkFBcUIsQ0FBQztVQUN0RTtRQUNGLENBQUMsQ0FBQztRQUVGLE9BQU9KLG9CQUFvQjtNQUM3QjtNQUVBTSxZQUFZQSxDQUFBQyxJQUFBLEVBQWlEO1FBQUEsSUFBaEQ7VUFBRXZRLE9BQU87VUFBRXdRLFdBQVc7VUFBRTVILFFBQVE7VUFBRTZIO1FBQVcsQ0FBQyxHQUFBRixJQUFBO1FBR3pEO1FBQ0E7UUFDQTtRQUNBLElBQUk3YSxNQUFNO1FBQ1YsSUFBSXNLLE9BQU8sQ0FBQzBRLGFBQWEsRUFBRTtVQUN6QmhiLE1BQU0sR0FBRztZQUFFaWIsY0FBYyxFQUFFSDtVQUFZLENBQUM7VUFFeEMsSUFBSUMsVUFBVSxLQUFLeGEsU0FBUyxFQUFFO1lBQzVCUCxNQUFNLENBQUMrYSxVQUFVLEdBQUdBLFVBQVU7VUFDaEM7UUFDRixDQUFDLE1BQU07VUFDTC9hLE1BQU0sR0FBRzhhLFdBQVc7UUFDdEI7UUFFQSxJQUFJNUgsUUFBUSxFQUFFO1VBQ1pzRCxNQUFNLENBQUN1QyxLQUFLLENBQUMsTUFBTTtZQUNqQjdGLFFBQVEsQ0FBQyxJQUFJLEVBQUVsVCxNQUFNLENBQUM7VUFDeEIsQ0FBQyxDQUFDO1FBQ0o7UUFFQSxPQUFPQSxNQUFNO01BQ2Y7O01BRUE7TUFDQTtNQUNBLE1BQU1rYixXQUFXQSxDQUFDL1ksUUFBUSxFQUFFMUQsR0FBRyxFQUFFNkwsT0FBTyxFQUFFNEksUUFBUSxFQUFFO1FBQ2xELElBQUksQ0FBRUEsUUFBUSxJQUFJNUksT0FBTyxZQUFZMUMsUUFBUSxFQUFFO1VBQzdDc0wsUUFBUSxHQUFHNUksT0FBTztVQUNsQkEsT0FBTyxHQUFHLElBQUk7UUFDaEI7UUFFQSxJQUFJLENBQUNBLE9BQU8sRUFBRTtVQUNaQSxPQUFPLEdBQUcsQ0FBQyxDQUFDO1FBQ2Q7UUFFQSxNQUFNMUosT0FBTyxHQUFHLElBQUkxRCxTQUFTLENBQUNTLE9BQU8sQ0FBQ3dFLFFBQVEsRUFBRSxJQUFJLENBQUM7UUFFckQsTUFBTW1ZLG9CQUFvQixHQUFHLElBQUksQ0FBQ0QsYUFBYSxDQUFDbFksUUFBUSxDQUFDO1FBRXpELElBQUlnWixhQUFhLEdBQUcsQ0FBQyxDQUFDO1FBRXRCLElBQUlMLFdBQVcsR0FBRyxDQUFDO1FBRW5CLE1BQU0sSUFBSSxDQUFDTSw2QkFBNkIsQ0FBQ2paLFFBQVEsRUFBRSxPQUFPa0YsR0FBRyxFQUFFcVAsRUFBRSxLQUFLO1VBQ3BFLE1BQU0yRSxXQUFXLEdBQUd6YSxPQUFPLENBQUNiLGVBQWUsQ0FBQ3NILEdBQUcsQ0FBQztVQUVoRCxJQUFJZ1UsV0FBVyxDQUFDcmIsTUFBTSxFQUFFO1lBQ3RCO1lBQ0EsSUFBSSxDQUFDMFksYUFBYSxDQUFDaEMsRUFBRSxFQUFFclAsR0FBRyxDQUFDO1lBQzNCOFQsYUFBYSxHQUFHLE1BQU0sSUFBSSxDQUFDRyxxQkFBcUIsQ0FDOUNqVSxHQUFHLEVBQ0g1SSxHQUFHLEVBQ0g0YyxXQUFXLENBQUN2UixZQUNkLENBQUM7WUFFRCxFQUFFZ1IsV0FBVztZQUViLElBQUksQ0FBQ3hRLE9BQU8sQ0FBQ2lSLEtBQUssRUFBRTtjQUNsQixPQUFPLEtBQUssQ0FBQyxDQUFDO1lBQ2hCO1VBQ0Y7VUFFQSxPQUFPLElBQUk7UUFDYixDQUFDLENBQUM7UUFFRnhkLE1BQU0sQ0FBQ1EsSUFBSSxDQUFDNGMsYUFBYSxDQUFDLENBQUNoYSxPQUFPLENBQUM4UyxHQUFHLElBQUk7VUFDeEMsTUFBTXZFLEtBQUssR0FBRyxJQUFJLENBQUN5RSxPQUFPLENBQUNGLEdBQUcsQ0FBQztVQUUvQixJQUFJdkUsS0FBSyxFQUFFO1lBQ1QsSUFBSSxDQUFDb0osaUJBQWlCLENBQUNwSixLQUFLLEVBQUU0SyxvQkFBb0IsQ0FBQ3JHLEdBQUcsQ0FBQyxDQUFDO1VBQzFEO1FBQ0YsQ0FBQyxDQUFDO1FBRUYsTUFBTSxJQUFJLENBQUNPLGFBQWEsQ0FBQ2dCLEtBQUssQ0FBQyxDQUFDOztRQUVoQztRQUNBO1FBQ0E7UUFDQSxJQUFJdUYsVUFBVTtRQUNkLElBQUlELFdBQVcsS0FBSyxDQUFDLElBQUl4USxPQUFPLENBQUNrUixNQUFNLEVBQUU7VUFDdkMsTUFBTW5VLEdBQUcsR0FBRzNILGVBQWUsQ0FBQytiLHFCQUFxQixDQUFDdFosUUFBUSxFQUFFMUQsR0FBRyxDQUFDO1VBQ2hFLElBQUksQ0FBQzRJLEdBQUcsQ0FBQzBJLEdBQUcsSUFBSXpGLE9BQU8sQ0FBQ3lRLFVBQVUsRUFBRTtZQUNsQzFULEdBQUcsQ0FBQzBJLEdBQUcsR0FBR3pGLE9BQU8sQ0FBQ3lRLFVBQVU7VUFDOUI7VUFFQUEsVUFBVSxHQUFHLE1BQU0sSUFBSSxDQUFDL0IsV0FBVyxDQUFDM1IsR0FBRyxDQUFDO1VBQ3hDeVQsV0FBVyxHQUFHLENBQUM7UUFDakI7UUFFQSxPQUFPLElBQUksQ0FBQ0YsWUFBWSxDQUFDO1VBQ3ZCdFEsT0FBTztVQUNQeVEsVUFBVTtVQUNWRCxXQUFXO1VBQ1g1SDtRQUNGLENBQUMsQ0FBQztNQUNKO01BQ0E7TUFDQTtNQUNBd0ksTUFBTUEsQ0FBQ3ZaLFFBQVEsRUFBRTFELEdBQUcsRUFBRTZMLE9BQU8sRUFBRTRJLFFBQVEsRUFBRTtRQUN2QyxJQUFJLENBQUVBLFFBQVEsSUFBSTVJLE9BQU8sWUFBWTFDLFFBQVEsRUFBRTtVQUM3Q3NMLFFBQVEsR0FBRzVJLE9BQU87VUFDbEJBLE9BQU8sR0FBRyxJQUFJO1FBQ2hCO1FBRUEsSUFBSSxDQUFDQSxPQUFPLEVBQUU7VUFDWkEsT0FBTyxHQUFHLENBQUMsQ0FBQztRQUNkO1FBRUEsTUFBTTFKLE9BQU8sR0FBRyxJQUFJMUQsU0FBUyxDQUFDUyxPQUFPLENBQUN3RSxRQUFRLEVBQUUsSUFBSSxDQUFDO1FBRXJELE1BQU1tWSxvQkFBb0IsR0FBRyxJQUFJLENBQUNELGFBQWEsQ0FBQ2xZLFFBQVEsQ0FBQztRQUV6RCxJQUFJZ1osYUFBYSxHQUFHLENBQUMsQ0FBQztRQUV0QixJQUFJTCxXQUFXLEdBQUcsQ0FBQztRQUVuQixJQUFJLENBQUN4Qiw0QkFBNEIsQ0FBQ25YLFFBQVEsRUFBRSxDQUFDa0YsR0FBRyxFQUFFcVAsRUFBRSxLQUFLO1VBQ3ZELE1BQU0yRSxXQUFXLEdBQUd6YSxPQUFPLENBQUNiLGVBQWUsQ0FBQ3NILEdBQUcsQ0FBQztVQUVoRCxJQUFJZ1UsV0FBVyxDQUFDcmIsTUFBTSxFQUFFO1lBQ3RCO1lBQ0EsSUFBSSxDQUFDMFksYUFBYSxDQUFDaEMsRUFBRSxFQUFFclAsR0FBRyxDQUFDO1lBQzNCOFQsYUFBYSxHQUFHLElBQUksQ0FBQ1Esb0JBQW9CLENBQ3ZDdFUsR0FBRyxFQUNINUksR0FBRyxFQUNINGMsV0FBVyxDQUFDdlIsWUFDZCxDQUFDO1lBRUQsRUFBRWdSLFdBQVc7WUFFYixJQUFJLENBQUN4USxPQUFPLENBQUNpUixLQUFLLEVBQUU7Y0FDbEIsT0FBTyxLQUFLLENBQUMsQ0FBQztZQUNoQjtVQUNGO1VBRUEsT0FBTyxJQUFJO1FBQ2IsQ0FBQyxDQUFDO1FBRUZ4ZCxNQUFNLENBQUNRLElBQUksQ0FBQzRjLGFBQWEsQ0FBQyxDQUFDaGEsT0FBTyxDQUFDOFMsR0FBRyxJQUFJO1VBQ3hDLE1BQU12RSxLQUFLLEdBQUcsSUFBSSxDQUFDeUUsT0FBTyxDQUFDRixHQUFHLENBQUM7VUFDL0IsSUFBSXZFLEtBQUssRUFBRTtZQUNULElBQUksQ0FBQ29KLGlCQUFpQixDQUFDcEosS0FBSyxFQUFFNEssb0JBQW9CLENBQUNyRyxHQUFHLENBQUMsQ0FBQztVQUMxRDtRQUNGLENBQUMsQ0FBQztRQUVGLElBQUksQ0FBQ08sYUFBYSxDQUFDZ0IsS0FBSyxDQUFDLENBQUM7O1FBRzFCO1FBQ0E7UUFDQTtRQUNBLElBQUl1RixVQUFVO1FBQ2QsSUFBSUQsV0FBVyxLQUFLLENBQUMsSUFBSXhRLE9BQU8sQ0FBQ2tSLE1BQU0sRUFBRTtVQUN2QyxNQUFNblUsR0FBRyxHQUFHM0gsZUFBZSxDQUFDK2IscUJBQXFCLENBQUN0WixRQUFRLEVBQUUxRCxHQUFHLENBQUM7VUFDaEUsSUFBSSxDQUFDNEksR0FBRyxDQUFDMEksR0FBRyxJQUFJekYsT0FBTyxDQUFDeVEsVUFBVSxFQUFFO1lBQ2xDMVQsR0FBRyxDQUFDMEksR0FBRyxHQUFHekYsT0FBTyxDQUFDeVEsVUFBVTtVQUM5QjtVQUVBQSxVQUFVLEdBQUcsSUFBSSxDQUFDcEMsTUFBTSxDQUFDdFIsR0FBRyxDQUFDO1VBQzdCeVQsV0FBVyxHQUFHLENBQUM7UUFDakI7UUFHQSxPQUFPLElBQUksQ0FBQ0YsWUFBWSxDQUFDO1VBQ3ZCdFEsT0FBTztVQUNQd1EsV0FBVztVQUNYNUgsUUFBUTtVQUNSL1EsUUFBUTtVQUNSMUQ7UUFDRixDQUFDLENBQUM7TUFDSjs7TUFFQTtNQUNBO01BQ0E7TUFDQStjLE1BQU1BLENBQUNyWixRQUFRLEVBQUUxRCxHQUFHLEVBQUU2TCxPQUFPLEVBQUU0SSxRQUFRLEVBQUU7UUFDdkMsSUFBSSxDQUFDQSxRQUFRLElBQUksT0FBTzVJLE9BQU8sS0FBSyxVQUFVLEVBQUU7VUFDOUM0SSxRQUFRLEdBQUc1SSxPQUFPO1VBQ2xCQSxPQUFPLEdBQUcsQ0FBQyxDQUFDO1FBQ2Q7UUFFQSxPQUFPLElBQUksQ0FBQ29SLE1BQU0sQ0FDaEJ2WixRQUFRLEVBQ1IxRCxHQUFHLEVBQ0hWLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFc00sT0FBTyxFQUFFO1VBQUNrUixNQUFNLEVBQUUsSUFBSTtVQUFFUixhQUFhLEVBQUU7UUFBSSxDQUFDLENBQUMsRUFDL0Q5SCxRQUNGLENBQUM7TUFDSDtNQUVBMEksV0FBV0EsQ0FBQ3paLFFBQVEsRUFBRTFELEdBQUcsRUFBRTZMLE9BQU8sRUFBRTRJLFFBQVEsRUFBRTtRQUM1QyxJQUFJLENBQUNBLFFBQVEsSUFBSSxPQUFPNUksT0FBTyxLQUFLLFVBQVUsRUFBRTtVQUM5QzRJLFFBQVEsR0FBRzVJLE9BQU87VUFDbEJBLE9BQU8sR0FBRyxDQUFDLENBQUM7UUFDZDtRQUVBLE9BQU8sSUFBSSxDQUFDNFEsV0FBVyxDQUNyQi9ZLFFBQVEsRUFDUjFELEdBQUcsRUFDSFYsTUFBTSxDQUFDQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUVzTSxPQUFPLEVBQUU7VUFBQ2tSLE1BQU0sRUFBRSxJQUFJO1VBQUVSLGFBQWEsRUFBRTtRQUFJLENBQUMsQ0FBQyxFQUMvRDlILFFBQ0YsQ0FBQztNQUNIOztNQUVBO01BQ0E7TUFDQTtNQUNBO01BQ0EsTUFBTWtJLDZCQUE2QkEsQ0FBQ2paLFFBQVEsRUFBRW1GLEVBQUUsRUFBRTtRQUNoRCxNQUFNdVUsV0FBVyxHQUFHbmMsZUFBZSxDQUFDK2EscUJBQXFCLENBQUN0WSxRQUFRLENBQUM7UUFFbkUsSUFBSTBaLFdBQVcsRUFBRTtVQUNmLEtBQUssTUFBTW5GLEVBQUUsSUFBSW1GLFdBQVcsRUFBRTtZQUM1QixNQUFNeFUsR0FBRyxHQUFHLElBQUksQ0FBQytPLEtBQUssQ0FBQ0MsR0FBRyxDQUFDSyxFQUFFLENBQUM7WUFFOUIsSUFBSXJQLEdBQUcsSUFBSSxFQUFHLE1BQU1DLEVBQUUsQ0FBQ0QsR0FBRyxFQUFFcVAsRUFBRSxDQUFDLENBQUMsRUFBRTtjQUNoQztZQUNGO1VBQ0Y7UUFDRixDQUFDLE1BQU07VUFDTCxNQUFNLElBQUksQ0FBQ04sS0FBSyxDQUFDMEYsWUFBWSxDQUFDeFUsRUFBRSxDQUFDO1FBQ25DO01BQ0Y7TUFDQWdTLDRCQUE0QkEsQ0FBQ25YLFFBQVEsRUFBRW1GLEVBQUUsRUFBRTtRQUN6QyxNQUFNdVUsV0FBVyxHQUFHbmMsZUFBZSxDQUFDK2EscUJBQXFCLENBQUN0WSxRQUFRLENBQUM7UUFFbkUsSUFBSTBaLFdBQVcsRUFBRTtVQUNmLEtBQUssTUFBTW5GLEVBQUUsSUFBSW1GLFdBQVcsRUFBRTtZQUM1QixNQUFNeFUsR0FBRyxHQUFHLElBQUksQ0FBQytPLEtBQUssQ0FBQ0MsR0FBRyxDQUFDSyxFQUFFLENBQUM7WUFFOUIsSUFBSXJQLEdBQUcsSUFBSSxDQUFDQyxFQUFFLENBQUNELEdBQUcsRUFBRXFQLEVBQUUsQ0FBQyxFQUFFO2NBQ3ZCO1lBQ0Y7VUFDRjtRQUNGLENBQUMsTUFBTTtVQUNMLElBQUksQ0FBQ04sS0FBSyxDQUFDalYsT0FBTyxDQUFDbUcsRUFBRSxDQUFDO1FBQ3hCO01BQ0Y7TUFFQXlVLHVCQUF1QkEsQ0FBQzFVLEdBQUcsRUFBRTVJLEdBQUcsRUFBRXFMLFlBQVksRUFBRTtRQUM5QyxNQUFNa1MsY0FBYyxHQUFHLENBQUMsQ0FBQztRQUV6QmplLE1BQU0sQ0FBQ1EsSUFBSSxDQUFDLElBQUksQ0FBQzRWLE9BQU8sQ0FBQyxDQUFDaFQsT0FBTyxDQUFDOFMsR0FBRyxJQUFJO1VBQ3ZDLE1BQU12RSxLQUFLLEdBQUcsSUFBSSxDQUFDeUUsT0FBTyxDQUFDRixHQUFHLENBQUM7VUFFL0IsSUFBSXZFLEtBQUssQ0FBQ29FLEtBQUssRUFBRTtZQUNmO1VBQ0Y7VUFFQSxJQUFJcEUsS0FBSyxDQUFDeUMsT0FBTyxFQUFFO1lBQ2pCNkosY0FBYyxDQUFDL0gsR0FBRyxDQUFDLEdBQUd2RSxLQUFLLENBQUM5TyxPQUFPLENBQUNiLGVBQWUsQ0FBQ3NILEdBQUcsQ0FBQyxDQUFDckgsTUFBTTtVQUNqRSxDQUFDLE1BQU07WUFDTDtZQUNBO1lBQ0FnYyxjQUFjLENBQUMvSCxHQUFHLENBQUMsR0FBR3ZFLEtBQUssQ0FBQzBFLE9BQU8sQ0FBQ3FFLEdBQUcsQ0FBQ3BSLEdBQUcsQ0FBQzBJLEdBQUcsQ0FBQztVQUNsRDtRQUNGLENBQUMsQ0FBQztRQUVGLE9BQU9pTSxjQUFjO01BQ3ZCO01BRUFMLG9CQUFvQkEsQ0FBQ3RVLEdBQUcsRUFBRTVJLEdBQUcsRUFBRXFMLFlBQVksRUFBRTtRQUUzQyxNQUFNa1MsY0FBYyxHQUFHLElBQUksQ0FBQ0QsdUJBQXVCLENBQUMxVSxHQUFHLEVBQUU1SSxHQUFHLEVBQUVxTCxZQUFZLENBQUM7UUFFM0UsTUFBTW1TLE9BQU8sR0FBR3pjLEtBQUssQ0FBQ0MsS0FBSyxDQUFDNEgsR0FBRyxDQUFDO1FBQ2hDM0gsZUFBZSxDQUFDQyxPQUFPLENBQUMwSCxHQUFHLEVBQUU1SSxHQUFHLEVBQUU7VUFBQ3FMO1FBQVksQ0FBQyxDQUFDO1FBRWpELE1BQU1xUixhQUFhLEdBQUcsQ0FBQyxDQUFDO1FBRXhCLEtBQUssTUFBTWxILEdBQUcsSUFBSWxXLE1BQU0sQ0FBQ1EsSUFBSSxDQUFDLElBQUksQ0FBQzRWLE9BQU8sQ0FBQyxFQUFFO1VBQzNDLE1BQU16RSxLQUFLLEdBQUcsSUFBSSxDQUFDeUUsT0FBTyxDQUFDRixHQUFHLENBQUM7VUFFL0IsSUFBSXZFLEtBQUssQ0FBQ29FLEtBQUssRUFBRTtZQUNmO1VBQ0Y7VUFFQSxNQUFNb0ksVUFBVSxHQUFHeE0sS0FBSyxDQUFDOU8sT0FBTyxDQUFDYixlQUFlLENBQUNzSCxHQUFHLENBQUM7VUFDckQsTUFBTThVLEtBQUssR0FBR0QsVUFBVSxDQUFDbGMsTUFBTTtVQUMvQixNQUFNb2MsTUFBTSxHQUFHSixjQUFjLENBQUMvSCxHQUFHLENBQUM7VUFFbEMsSUFBSWtJLEtBQUssSUFBSXpNLEtBQUssQ0FBQ2lFLFNBQVMsSUFBSXVJLFVBQVUsQ0FBQ2pULFFBQVEsS0FBSzFJLFNBQVMsRUFBRTtZQUNqRW1QLEtBQUssQ0FBQ2lFLFNBQVMsQ0FBQzJDLEdBQUcsQ0FBQ2pQLEdBQUcsQ0FBQzBJLEdBQUcsRUFBRW1NLFVBQVUsQ0FBQ2pULFFBQVEsQ0FBQztVQUNuRDtVQUVBLElBQUl5RyxLQUFLLENBQUNtRSxNQUFNLENBQUN4QyxJQUFJLElBQUkzQixLQUFLLENBQUNtRSxNQUFNLENBQUN2QyxLQUFLLEVBQUU7WUFDM0M7WUFDQTtZQUNBO1lBQ0E7WUFDQTtZQUNBO1lBQ0E7WUFDQSxJQUFJOEssTUFBTSxJQUFJRCxLQUFLLEVBQUU7Y0FDbkJoQixhQUFhLENBQUNsSCxHQUFHLENBQUMsR0FBRyxJQUFJO1lBQzNCO1VBQ0YsQ0FBQyxNQUFNLElBQUltSSxNQUFNLElBQUksQ0FBQ0QsS0FBSyxFQUFFO1lBQzNCemMsZUFBZSxDQUFDaWEsc0JBQXNCLENBQUNqSyxLQUFLLEVBQUVySSxHQUFHLENBQUM7VUFDcEQsQ0FBQyxNQUFNLElBQUksQ0FBQytVLE1BQU0sSUFBSUQsS0FBSyxFQUFFO1lBQzNCemMsZUFBZSxDQUFDbVosb0JBQW9CLENBQUNuSixLQUFLLEVBQUVySSxHQUFHLENBQUM7VUFDbEQsQ0FBQyxNQUFNLElBQUkrVSxNQUFNLElBQUlELEtBQUssRUFBRTtZQUMxQnpjLGVBQWUsQ0FBQzJjLG9CQUFvQixDQUFDM00sS0FBSyxFQUFFckksR0FBRyxFQUFFNFUsT0FBTyxDQUFDO1VBQzNEO1FBQ0Y7UUFDQSxPQUFPZCxhQUFhO01BQ3RCO01BRUEsTUFBTUcscUJBQXFCQSxDQUFDalUsR0FBRyxFQUFFNUksR0FBRyxFQUFFcUwsWUFBWSxFQUFFO1FBRWxELE1BQU1rUyxjQUFjLEdBQUcsSUFBSSxDQUFDRCx1QkFBdUIsQ0FBQzFVLEdBQUcsRUFBRTVJLEdBQUcsRUFBRXFMLFlBQVksQ0FBQztRQUUzRSxNQUFNbVMsT0FBTyxHQUFHemMsS0FBSyxDQUFDQyxLQUFLLENBQUM0SCxHQUFHLENBQUM7UUFDaEMzSCxlQUFlLENBQUNDLE9BQU8sQ0FBQzBILEdBQUcsRUFBRTVJLEdBQUcsRUFBRTtVQUFDcUw7UUFBWSxDQUFDLENBQUM7UUFFakQsTUFBTXFSLGFBQWEsR0FBRyxDQUFDLENBQUM7UUFDeEIsS0FBSyxNQUFNbEgsR0FBRyxJQUFJbFcsTUFBTSxDQUFDUSxJQUFJLENBQUMsSUFBSSxDQUFDNFYsT0FBTyxDQUFDLEVBQUU7VUFDM0MsTUFBTXpFLEtBQUssR0FBRyxJQUFJLENBQUN5RSxPQUFPLENBQUNGLEdBQUcsQ0FBQztVQUUvQixJQUFJdkUsS0FBSyxDQUFDb0UsS0FBSyxFQUFFO1lBQ2Y7VUFDRjtVQUVBLE1BQU1vSSxVQUFVLEdBQUd4TSxLQUFLLENBQUM5TyxPQUFPLENBQUNiLGVBQWUsQ0FBQ3NILEdBQUcsQ0FBQztVQUNyRCxNQUFNOFUsS0FBSyxHQUFHRCxVQUFVLENBQUNsYyxNQUFNO1VBQy9CLE1BQU1vYyxNQUFNLEdBQUdKLGNBQWMsQ0FBQy9ILEdBQUcsQ0FBQztVQUVsQyxJQUFJa0ksS0FBSyxJQUFJek0sS0FBSyxDQUFDaUUsU0FBUyxJQUFJdUksVUFBVSxDQUFDalQsUUFBUSxLQUFLMUksU0FBUyxFQUFFO1lBQ2pFbVAsS0FBSyxDQUFDaUUsU0FBUyxDQUFDMkMsR0FBRyxDQUFDalAsR0FBRyxDQUFDMEksR0FBRyxFQUFFbU0sVUFBVSxDQUFDalQsUUFBUSxDQUFDO1VBQ25EO1VBRUEsSUFBSXlHLEtBQUssQ0FBQ21FLE1BQU0sQ0FBQ3hDLElBQUksSUFBSTNCLEtBQUssQ0FBQ21FLE1BQU0sQ0FBQ3ZDLEtBQUssRUFBRTtZQUMzQztZQUNBO1lBQ0E7WUFDQTtZQUNBO1lBQ0E7WUFDQTtZQUNBLElBQUk4SyxNQUFNLElBQUlELEtBQUssRUFBRTtjQUNuQmhCLGFBQWEsQ0FBQ2xILEdBQUcsQ0FBQyxHQUFHLElBQUk7WUFDM0I7VUFDRixDQUFDLE1BQU0sSUFBSW1JLE1BQU0sSUFBSSxDQUFDRCxLQUFLLEVBQUU7WUFDM0IsTUFBTXpjLGVBQWUsQ0FBQ21hLHVCQUF1QixDQUFDbkssS0FBSyxFQUFFckksR0FBRyxDQUFDO1VBQzNELENBQUMsTUFBTSxJQUFJLENBQUMrVSxNQUFNLElBQUlELEtBQUssRUFBRTtZQUMzQixNQUFNemMsZUFBZSxDQUFDdVoscUJBQXFCLENBQUN2SixLQUFLLEVBQUVySSxHQUFHLENBQUM7VUFDekQsQ0FBQyxNQUFNLElBQUkrVSxNQUFNLElBQUlELEtBQUssRUFBRTtZQUMxQixNQUFNemMsZUFBZSxDQUFDNGMscUJBQXFCLENBQUM1TSxLQUFLLEVBQUVySSxHQUFHLEVBQUU0VSxPQUFPLENBQUM7VUFDbEU7UUFDRjtRQUNBLE9BQU9kLGFBQWE7TUFDdEI7O01BRUE7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBckMsaUJBQWlCQSxDQUFDcEosS0FBSyxFQUFFNk0sVUFBVSxFQUFFO1FBQ25DLElBQUksSUFBSSxDQUFDbEksTUFBTSxFQUFFO1VBQ2Y7VUFDQTtVQUNBO1VBQ0EzRSxLQUFLLENBQUNvRSxLQUFLLEdBQUcsSUFBSTtVQUNsQjtRQUNGO1FBRUEsSUFBSSxDQUFDLElBQUksQ0FBQ08sTUFBTSxJQUFJLENBQUNrSSxVQUFVLEVBQUU7VUFDL0JBLFVBQVUsR0FBRzdNLEtBQUssQ0FBQzBFLE9BQU87UUFDNUI7UUFFQSxJQUFJMUUsS0FBSyxDQUFDaUUsU0FBUyxFQUFFO1VBQ25CakUsS0FBSyxDQUFDaUUsU0FBUyxDQUFDNEMsS0FBSyxDQUFDLENBQUM7UUFDekI7UUFFQTdHLEtBQUssQ0FBQzBFLE9BQU8sR0FBRzFFLEtBQUssQ0FBQ21FLE1BQU0sQ0FBQzNCLGNBQWMsQ0FBQztVQUMxQ3lCLFNBQVMsRUFBRWpFLEtBQUssQ0FBQ2lFLFNBQVM7VUFDMUJ4QixPQUFPLEVBQUV6QyxLQUFLLENBQUN5QztRQUNqQixDQUFDLENBQUM7UUFFRixJQUFJLENBQUMsSUFBSSxDQUFDa0MsTUFBTSxFQUFFO1VBQ2hCM1UsZUFBZSxDQUFDcWEsaUJBQWlCLENBQy9CckssS0FBSyxDQUFDeUMsT0FBTyxFQUNib0ssVUFBVSxFQUNWN00sS0FBSyxDQUFDMEUsT0FBTyxFQUNiMUUsS0FBSyxFQUNMO1lBQUNxRSxZQUFZLEVBQUVyRSxLQUFLLENBQUNxRTtVQUFZLENBQ25DLENBQUM7UUFDSDtNQUNGO01BRUEyRSxhQUFhQSxDQUFDaEMsRUFBRSxFQUFFclAsR0FBRyxFQUFFO1FBQ3JCO1FBQ0EsSUFBSSxDQUFDLElBQUksQ0FBQ3VRLGVBQWUsRUFBRTtVQUN6QjtRQUNGOztRQUVBO1FBQ0E7UUFDQTtRQUNBLElBQUksSUFBSSxDQUFDQSxlQUFlLENBQUNhLEdBQUcsQ0FBQy9CLEVBQUUsQ0FBQyxFQUFFO1VBQ2hDO1FBQ0Y7UUFFQSxJQUFJLENBQUNrQixlQUFlLENBQUN0QixHQUFHLENBQUNJLEVBQUUsRUFBRWxYLEtBQUssQ0FBQ0MsS0FBSyxDQUFDNEgsR0FBRyxDQUFDLENBQUM7TUFDaEQ7SUFDRjtJQUVBM0gsZUFBZSxDQUFDb1IsTUFBTSxHQUFHQSxNQUFNO0lBRS9CcFIsZUFBZSxDQUFDdVYsYUFBYSxHQUFHQSxhQUFhOztJQUU3Qzs7SUFFQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBdlYsZUFBZSxDQUFDOGMsc0JBQXNCLEdBQUcsTUFBTUEsc0JBQXNCLENBQUM7TUFDcEV6TCxXQUFXQSxDQUFBLEVBQWU7UUFBQSxJQUFkekcsT0FBTyxHQUFBN0gsU0FBQSxDQUFBM0QsTUFBQSxRQUFBMkQsU0FBQSxRQUFBbEMsU0FBQSxHQUFBa0MsU0FBQSxNQUFHLENBQUMsQ0FBQztRQUN0QixNQUFNZ2Esb0JBQW9CLEdBQ3hCblMsT0FBTyxDQUFDb1MsU0FBUyxJQUNqQmhkLGVBQWUsQ0FBQytULGtDQUFrQyxDQUFDbkosT0FBTyxDQUFDb1MsU0FBUyxDQUNyRTtRQUVELElBQUkvZixNQUFNLENBQUMwRSxJQUFJLENBQUNpSixPQUFPLEVBQUUsU0FBUyxDQUFDLEVBQUU7VUFDbkMsSUFBSSxDQUFDNkgsT0FBTyxHQUFHN0gsT0FBTyxDQUFDNkgsT0FBTztVQUU5QixJQUFJN0gsT0FBTyxDQUFDb1MsU0FBUyxJQUFJcFMsT0FBTyxDQUFDNkgsT0FBTyxLQUFLc0ssb0JBQW9CLEVBQUU7WUFDakUsTUFBTWxZLEtBQUssQ0FBQyx5Q0FBeUMsQ0FBQztVQUN4RDtRQUNGLENBQUMsTUFBTSxJQUFJK0YsT0FBTyxDQUFDb1MsU0FBUyxFQUFFO1VBQzVCLElBQUksQ0FBQ3ZLLE9BQU8sR0FBR3NLLG9CQUFvQjtRQUNyQyxDQUFDLE1BQU07VUFDTCxNQUFNbFksS0FBSyxDQUFDLG1DQUFtQyxDQUFDO1FBQ2xEO1FBRUEsTUFBTW1ZLFNBQVMsR0FBR3BTLE9BQU8sQ0FBQ29TLFNBQVMsSUFBSSxDQUFDLENBQUM7UUFFekMsSUFBSSxJQUFJLENBQUN2SyxPQUFPLEVBQUU7VUFDaEIsSUFBSSxDQUFDd0ssSUFBSSxHQUFHLElBQUlDLFdBQVcsQ0FBQ3RFLE9BQU8sQ0FBQ3VFLFdBQVcsQ0FBQztVQUNoRCxJQUFJLENBQUNDLFdBQVcsR0FBRztZQUNqQnZLLFdBQVcsRUFBRUEsQ0FBQ21FLEVBQUUsRUFBRTlHLE1BQU0sRUFBRXdNLE1BQU0sS0FBSztjQUNuQztjQUNBLE1BQU0vVSxHQUFHLEdBQUFrUSxhQUFBLEtBQVEzSCxNQUFNLENBQUU7Y0FFekJ2SSxHQUFHLENBQUMwSSxHQUFHLEdBQUcyRyxFQUFFO2NBRVosSUFBSWdHLFNBQVMsQ0FBQ25LLFdBQVcsRUFBRTtnQkFDekJtSyxTQUFTLENBQUNuSyxXQUFXLENBQUNsUixJQUFJLENBQUMsSUFBSSxFQUFFcVYsRUFBRSxFQUFFbFgsS0FBSyxDQUFDQyxLQUFLLENBQUNtUSxNQUFNLENBQUMsRUFBRXdNLE1BQU0sQ0FBQztjQUNuRTs7Y0FFQTtjQUNBLElBQUlNLFNBQVMsQ0FBQzFLLEtBQUssRUFBRTtnQkFDbkIwSyxTQUFTLENBQUMxSyxLQUFLLENBQUMzUSxJQUFJLENBQUMsSUFBSSxFQUFFcVYsRUFBRSxFQUFFbFgsS0FBSyxDQUFDQyxLQUFLLENBQUNtUSxNQUFNLENBQUMsQ0FBQztjQUNyRDs7Y0FFQTtjQUNBO2NBQ0E7Y0FDQSxJQUFJLENBQUMrTSxJQUFJLENBQUNJLFNBQVMsQ0FBQ3JHLEVBQUUsRUFBRXJQLEdBQUcsRUFBRStVLE1BQU0sSUFBSSxJQUFJLENBQUM7WUFDOUMsQ0FBQztZQUNEM0osV0FBVyxFQUFFQSxDQUFDaUUsRUFBRSxFQUFFMEYsTUFBTSxLQUFLO2NBQzNCLElBQUlNLFNBQVMsQ0FBQ2pLLFdBQVcsRUFBRTtnQkFDekJpSyxTQUFTLENBQUNqSyxXQUFXLENBQUNwUixJQUFJLENBQUMsSUFBSSxFQUFFcVYsRUFBRSxFQUFFMEYsTUFBTSxDQUFDO2NBQzlDO2NBRUEsSUFBSSxDQUFDTyxJQUFJLENBQUNLLFVBQVUsQ0FBQ3RHLEVBQUUsRUFBRTBGLE1BQU0sSUFBSSxJQUFJLENBQUM7WUFDMUM7VUFDRixDQUFDO1FBQ0gsQ0FBQyxNQUFNO1VBQ0wsSUFBSSxDQUFDTyxJQUFJLEdBQUcsSUFBSWpkLGVBQWUsQ0FBQ2tVLE1BQU0sQ0FBRCxDQUFDO1VBQ3RDLElBQUksQ0FBQ2tKLFdBQVcsR0FBRztZQUNqQjlLLEtBQUssRUFBRUEsQ0FBQzBFLEVBQUUsRUFBRTlHLE1BQU0sS0FBSztjQUNyQjtjQUNBLE1BQU12SSxHQUFHLEdBQUFrUSxhQUFBLEtBQVEzSCxNQUFNLENBQUU7Y0FFekIsSUFBSThNLFNBQVMsQ0FBQzFLLEtBQUssRUFBRTtnQkFDbkIwSyxTQUFTLENBQUMxSyxLQUFLLENBQUMzUSxJQUFJLENBQUMsSUFBSSxFQUFFcVYsRUFBRSxFQUFFbFgsS0FBSyxDQUFDQyxLQUFLLENBQUNtUSxNQUFNLENBQUMsQ0FBQztjQUNyRDtjQUVBdkksR0FBRyxDQUFDMEksR0FBRyxHQUFHMkcsRUFBRTtjQUVaLElBQUksQ0FBQ2lHLElBQUksQ0FBQ3JHLEdBQUcsQ0FBQ0ksRUFBRSxFQUFHclAsR0FBRyxDQUFDO1lBQ3pCO1VBQ0YsQ0FBQztRQUNIOztRQUVBO1FBQ0E7UUFDQSxJQUFJLENBQUN5VixXQUFXLENBQUN0SyxPQUFPLEdBQUcsQ0FBQ2tFLEVBQUUsRUFBRTlHLE1BQU0sS0FBSztVQUN6QyxNQUFNdkksR0FBRyxHQUFHLElBQUksQ0FBQ3NWLElBQUksQ0FBQ3RHLEdBQUcsQ0FBQ0ssRUFBRSxDQUFDO1VBRTdCLElBQUksQ0FBQ3JQLEdBQUcsRUFBRTtZQUNSLE1BQU0sSUFBSTlDLEtBQUssNEJBQUFqRyxNQUFBLENBQTRCb1ksRUFBRSxDQUFFLENBQUM7VUFDbEQ7VUFFQSxJQUFJZ0csU0FBUyxDQUFDbEssT0FBTyxFQUFFO1lBQ3JCa0ssU0FBUyxDQUFDbEssT0FBTyxDQUFDblIsSUFBSSxDQUFDLElBQUksRUFBRXFWLEVBQUUsRUFBRWxYLEtBQUssQ0FBQ0MsS0FBSyxDQUFDbVEsTUFBTSxDQUFDLENBQUM7VUFDdkQ7VUFFQXFOLFlBQVksQ0FBQ0MsWUFBWSxDQUFDN1YsR0FBRyxFQUFFdUksTUFBTSxDQUFDO1FBQ3hDLENBQUM7UUFFRCxJQUFJLENBQUNrTixXQUFXLENBQUM3SyxPQUFPLEdBQUd5RSxFQUFFLElBQUk7VUFDL0IsSUFBSWdHLFNBQVMsQ0FBQ3pLLE9BQU8sRUFBRTtZQUNyQnlLLFNBQVMsQ0FBQ3pLLE9BQU8sQ0FBQzVRLElBQUksQ0FBQyxJQUFJLEVBQUVxVixFQUFFLENBQUM7VUFDbEM7VUFFQSxJQUFJLENBQUNpRyxJQUFJLENBQUN0RCxNQUFNLENBQUMzQyxFQUFFLENBQUM7UUFDdEIsQ0FBQztNQUNIO0lBQ0YsQ0FBQztJQUVEaFgsZUFBZSxDQUFDa1UsTUFBTSxHQUFHLE1BQU1BLE1BQU0sU0FBU3VKLEtBQUssQ0FBQztNQUNsRHBNLFdBQVdBLENBQUEsRUFBRztRQUNaLEtBQUssQ0FBQ3VILE9BQU8sQ0FBQ3VFLFdBQVcsRUFBRXZFLE9BQU8sQ0FBQzhFLE9BQU8sQ0FBQztNQUM3QztJQUNGLENBQUM7O0lBRUQ7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0ExZCxlQUFlLENBQUNnUyxhQUFhLEdBQUdDLFNBQVMsSUFBSTtNQUMzQyxJQUFJLENBQUNBLFNBQVMsRUFBRTtRQUNkLE9BQU8sSUFBSTtNQUNiOztNQUVBO01BQ0EsSUFBSUEsU0FBUyxDQUFDMEwsb0JBQW9CLEVBQUU7UUFDbEMsT0FBTzFMLFNBQVM7TUFDbEI7TUFFQSxNQUFNMkwsT0FBTyxHQUFHalcsR0FBRyxJQUFJO1FBQ3JCLElBQUksQ0FBQzFLLE1BQU0sQ0FBQzBFLElBQUksQ0FBQ2dHLEdBQUcsRUFBRSxLQUFLLENBQUMsRUFBRTtVQUM1QjtVQUNBO1VBQ0EsTUFBTSxJQUFJOUMsS0FBSyxDQUFDLHVDQUF1QyxDQUFDO1FBQzFEO1FBRUEsTUFBTW1TLEVBQUUsR0FBR3JQLEdBQUcsQ0FBQzBJLEdBQUc7O1FBRWxCO1FBQ0E7UUFDQSxNQUFNd04sV0FBVyxHQUFHM0wsT0FBTyxDQUFDNEwsV0FBVyxDQUFDLE1BQU03TCxTQUFTLENBQUN0SyxHQUFHLENBQUMsQ0FBQztRQUU3RCxJQUFJLENBQUMzSCxlQUFlLENBQUN5RyxjQUFjLENBQUNvWCxXQUFXLENBQUMsRUFBRTtVQUNoRCxNQUFNLElBQUloWixLQUFLLENBQUMsOEJBQThCLENBQUM7UUFDakQ7UUFFQSxJQUFJNUgsTUFBTSxDQUFDMEUsSUFBSSxDQUFDa2MsV0FBVyxFQUFFLEtBQUssQ0FBQyxFQUFFO1VBQ25DLElBQUksQ0FBQy9kLEtBQUssQ0FBQ2thLE1BQU0sQ0FBQzZELFdBQVcsQ0FBQ3hOLEdBQUcsRUFBRTJHLEVBQUUsQ0FBQyxFQUFFO1lBQ3RDLE1BQU0sSUFBSW5TLEtBQUssQ0FBQyxnREFBZ0QsQ0FBQztVQUNuRTtRQUNGLENBQUMsTUFBTTtVQUNMZ1osV0FBVyxDQUFDeE4sR0FBRyxHQUFHMkcsRUFBRTtRQUN0QjtRQUVBLE9BQU82RyxXQUFXO01BQ3BCLENBQUM7TUFFREQsT0FBTyxDQUFDRCxvQkFBb0IsR0FBRyxJQUFJO01BRW5DLE9BQU9DLE9BQU87SUFDaEIsQ0FBQzs7SUFFRDtJQUNBO0lBQ0E7SUFDQTtJQUNBOztJQUVBO0lBQ0E7SUFDQTVkLGVBQWUsQ0FBQytkLGFBQWEsR0FBRyxDQUFDQyxHQUFHLEVBQUVDLEtBQUssRUFBRWhiLEtBQUssS0FBSztNQUNyRCxJQUFJaWIsS0FBSyxHQUFHLENBQUM7TUFDYixJQUFJQyxLQUFLLEdBQUdGLEtBQUssQ0FBQzdlLE1BQU07TUFFeEIsT0FBTytlLEtBQUssR0FBRyxDQUFDLEVBQUU7UUFDaEIsTUFBTUMsU0FBUyxHQUFHelMsSUFBSSxDQUFDMFMsS0FBSyxDQUFDRixLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBRXZDLElBQUlILEdBQUcsQ0FBQy9hLEtBQUssRUFBRWdiLEtBQUssQ0FBQ0MsS0FBSyxHQUFHRSxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRTtVQUM3Q0YsS0FBSyxJQUFJRSxTQUFTLEdBQUcsQ0FBQztVQUN0QkQsS0FBSyxJQUFJQyxTQUFTLEdBQUcsQ0FBQztRQUN4QixDQUFDLE1BQU07VUFDTEQsS0FBSyxHQUFHQyxTQUFTO1FBQ25CO01BQ0Y7TUFFQSxPQUFPRixLQUFLO0lBQ2QsQ0FBQztJQUVEbGUsZUFBZSxDQUFDc2UseUJBQXlCLEdBQUdwTyxNQUFNLElBQUk7TUFDcEQsSUFBSUEsTUFBTSxLQUFLN1IsTUFBTSxDQUFDNlIsTUFBTSxDQUFDLElBQUl2TCxLQUFLLENBQUNDLE9BQU8sQ0FBQ3NMLE1BQU0sQ0FBQyxFQUFFO1FBQ3RELE1BQU12QixjQUFjLENBQUMsaUNBQWlDLENBQUM7TUFDekQ7TUFFQXRRLE1BQU0sQ0FBQ1EsSUFBSSxDQUFDcVIsTUFBTSxDQUFDLENBQUN6TyxPQUFPLENBQUM2TyxPQUFPLElBQUk7UUFDckMsSUFBSUEsT0FBTyxDQUFDelMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDNkMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFO1VBQ3BDLE1BQU1pTyxjQUFjLENBQ2xCLDJEQUNGLENBQUM7UUFDSDtRQUVBLE1BQU0xTCxLQUFLLEdBQUdpTixNQUFNLENBQUNJLE9BQU8sQ0FBQztRQUU3QixJQUFJLE9BQU9yTixLQUFLLEtBQUssUUFBUSxJQUN6QixDQUFDLFlBQVksRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUNuRSxJQUFJLENBQUNrRSxHQUFHLElBQ3hDL0YsTUFBTSxDQUFDMEUsSUFBSSxDQUFDc0IsS0FBSyxFQUFFRCxHQUFHLENBQ3hCLENBQUMsRUFBRTtVQUNMLE1BQU0yTCxjQUFjLENBQ2xCLDBEQUNGLENBQUM7UUFDSDtRQUVBLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDak8sUUFBUSxDQUFDdUMsS0FBSyxDQUFDLEVBQUU7VUFDeEMsTUFBTTBMLGNBQWMsQ0FDbEIseURBQ0YsQ0FBQztRQUNIO01BQ0YsQ0FBQyxDQUFDO0lBQ0osQ0FBQzs7SUFFRDtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBM08sZUFBZSxDQUFDOFIsa0JBQWtCLEdBQUc1QixNQUFNLElBQUk7TUFDN0NsUSxlQUFlLENBQUNzZSx5QkFBeUIsQ0FBQ3BPLE1BQU0sQ0FBQztNQUVqRCxNQUFNcU8sYUFBYSxHQUFHck8sTUFBTSxDQUFDRyxHQUFHLEtBQUt4UCxTQUFTLEdBQUcsSUFBSSxHQUFHcVAsTUFBTSxDQUFDRyxHQUFHO01BQ2xFLE1BQU1yTyxPQUFPLEdBQUczRSxpQkFBaUIsQ0FBQzZTLE1BQU0sQ0FBQzs7TUFFekM7TUFDQSxNQUFNK0IsU0FBUyxHQUFHQSxDQUFDdEssR0FBRyxFQUFFNlcsUUFBUSxLQUFLO1FBQ25DO1FBQ0EsSUFBSTdaLEtBQUssQ0FBQ0MsT0FBTyxDQUFDK0MsR0FBRyxDQUFDLEVBQUU7VUFDdEIsT0FBT0EsR0FBRyxDQUFDaEssR0FBRyxDQUFDOGdCLE1BQU0sSUFBSXhNLFNBQVMsQ0FBQ3dNLE1BQU0sRUFBRUQsUUFBUSxDQUFDLENBQUM7UUFDdkQ7UUFFQSxNQUFNbGUsTUFBTSxHQUFHMEIsT0FBTyxDQUFDTSxTQUFTLEdBQUcsQ0FBQyxDQUFDLEdBQUd4QyxLQUFLLENBQUNDLEtBQUssQ0FBQzRILEdBQUcsQ0FBQztRQUV4RHRKLE1BQU0sQ0FBQ1EsSUFBSSxDQUFDMmYsUUFBUSxDQUFDLENBQUMvYyxPQUFPLENBQUN1QixHQUFHLElBQUk7VUFDbkMsSUFBSTJFLEdBQUcsSUFBSSxJQUFJLElBQUksQ0FBQzFLLE1BQU0sQ0FBQzBFLElBQUksQ0FBQ2dHLEdBQUcsRUFBRTNFLEdBQUcsQ0FBQyxFQUFFO1lBQ3pDO1VBQ0Y7VUFFQSxNQUFNdU4sSUFBSSxHQUFHaU8sUUFBUSxDQUFDeGIsR0FBRyxDQUFDO1VBRTFCLElBQUl1TixJQUFJLEtBQUtsUyxNQUFNLENBQUNrUyxJQUFJLENBQUMsRUFBRTtZQUN6QjtZQUNBLElBQUk1SSxHQUFHLENBQUMzRSxHQUFHLENBQUMsS0FBSzNFLE1BQU0sQ0FBQ3NKLEdBQUcsQ0FBQzNFLEdBQUcsQ0FBQyxDQUFDLEVBQUU7Y0FDakMxQyxNQUFNLENBQUMwQyxHQUFHLENBQUMsR0FBR2lQLFNBQVMsQ0FBQ3RLLEdBQUcsQ0FBQzNFLEdBQUcsQ0FBQyxFQUFFdU4sSUFBSSxDQUFDO1lBQ3pDO1VBQ0YsQ0FBQyxNQUFNLElBQUl2TyxPQUFPLENBQUNNLFNBQVMsRUFBRTtZQUM1QjtZQUNBaEMsTUFBTSxDQUFDMEMsR0FBRyxDQUFDLEdBQUdsRCxLQUFLLENBQUNDLEtBQUssQ0FBQzRILEdBQUcsQ0FBQzNFLEdBQUcsQ0FBQyxDQUFDO1VBQ3JDLENBQUMsTUFBTTtZQUNMLE9BQU8xQyxNQUFNLENBQUMwQyxHQUFHLENBQUM7VUFDcEI7UUFDRixDQUFDLENBQUM7UUFFRixPQUFPMkUsR0FBRyxJQUFJLElBQUksR0FBR3JILE1BQU0sR0FBR3FILEdBQUc7TUFDbkMsQ0FBQztNQUVELE9BQU9BLEdBQUcsSUFBSTtRQUNaLE1BQU1ySCxNQUFNLEdBQUcyUixTQUFTLENBQUN0SyxHQUFHLEVBQUUzRixPQUFPLENBQUNDLElBQUksQ0FBQztRQUUzQyxJQUFJc2MsYUFBYSxJQUFJdGhCLE1BQU0sQ0FBQzBFLElBQUksQ0FBQ2dHLEdBQUcsRUFBRSxLQUFLLENBQUMsRUFBRTtVQUM1Q3JILE1BQU0sQ0FBQytQLEdBQUcsR0FBRzFJLEdBQUcsQ0FBQzBJLEdBQUc7UUFDdEI7UUFFQSxJQUFJLENBQUNrTyxhQUFhLElBQUl0aEIsTUFBTSxDQUFDMEUsSUFBSSxDQUFDckIsTUFBTSxFQUFFLEtBQUssQ0FBQyxFQUFFO1VBQ2hELE9BQU9BLE1BQU0sQ0FBQytQLEdBQUc7UUFDbkI7UUFFQSxPQUFPL1AsTUFBTTtNQUNmLENBQUM7SUFDSCxDQUFDOztJQUVEO0lBQ0E7SUFDQU4sZUFBZSxDQUFDK2IscUJBQXFCLEdBQUcsQ0FBQ3RaLFFBQVEsRUFBRXJFLFFBQVEsS0FBSztNQUM5RCxNQUFNc2dCLGdCQUFnQixHQUFHNWEsK0JBQStCLENBQUNyQixRQUFRLENBQUM7TUFDbEUsTUFBTWtjLFFBQVEsR0FBRzNlLGVBQWUsQ0FBQzRlLGtCQUFrQixDQUFDeGdCLFFBQVEsQ0FBQztNQUU3RCxNQUFNeWdCLE1BQU0sR0FBRyxDQUFDLENBQUM7TUFFakIsSUFBSUgsZ0JBQWdCLENBQUNyTyxHQUFHLEVBQUU7UUFDeEJ3TyxNQUFNLENBQUN4TyxHQUFHLEdBQUdxTyxnQkFBZ0IsQ0FBQ3JPLEdBQUc7UUFDakMsT0FBT3FPLGdCQUFnQixDQUFDck8sR0FBRztNQUM3Qjs7TUFFQTtNQUNBO01BQ0E7TUFDQXJRLGVBQWUsQ0FBQ0MsT0FBTyxDQUFDNGUsTUFBTSxFQUFFO1FBQUN0Z0IsSUFBSSxFQUFFbWdCO01BQWdCLENBQUMsQ0FBQztNQUN6RDFlLGVBQWUsQ0FBQ0MsT0FBTyxDQUFDNGUsTUFBTSxFQUFFemdCLFFBQVEsRUFBRTtRQUFDMGdCLFFBQVEsRUFBRTtNQUFJLENBQUMsQ0FBQztNQUUzRCxJQUFJSCxRQUFRLEVBQUU7UUFDWixPQUFPRSxNQUFNO01BQ2Y7O01BRUE7TUFDQSxNQUFNRSxXQUFXLEdBQUcxZ0IsTUFBTSxDQUFDQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUVGLFFBQVEsQ0FBQztNQUMvQyxJQUFJeWdCLE1BQU0sQ0FBQ3hPLEdBQUcsRUFBRTtRQUNkME8sV0FBVyxDQUFDMU8sR0FBRyxHQUFHd08sTUFBTSxDQUFDeE8sR0FBRztNQUM5QjtNQUVBLE9BQU8wTyxXQUFXO0lBQ3BCLENBQUM7SUFFRC9lLGVBQWUsQ0FBQ2dmLFlBQVksR0FBRyxDQUFDQyxJQUFJLEVBQUVDLEtBQUssRUFBRWxDLFNBQVMsS0FBSztNQUN6RCxPQUFPTyxZQUFZLENBQUM0QixXQUFXLENBQUNGLElBQUksRUFBRUMsS0FBSyxFQUFFbEMsU0FBUyxDQUFDO0lBQ3pELENBQUM7O0lBRUQ7SUFDQTtJQUNBO0lBQ0E7SUFDQWhkLGVBQWUsQ0FBQ3FhLGlCQUFpQixHQUFHLENBQUM1SCxPQUFPLEVBQUVvSyxVQUFVLEVBQUV1QyxVQUFVLEVBQUVDLFFBQVEsRUFBRXpVLE9BQU8sS0FDckYyUyxZQUFZLENBQUMrQixnQkFBZ0IsQ0FBQzdNLE9BQU8sRUFBRW9LLFVBQVUsRUFBRXVDLFVBQVUsRUFBRUMsUUFBUSxFQUFFelUsT0FBTyxDQUFDO0lBR25GNUssZUFBZSxDQUFDdWYsd0JBQXdCLEdBQUcsQ0FBQzFDLFVBQVUsRUFBRXVDLFVBQVUsRUFBRUMsUUFBUSxFQUFFelUsT0FBTyxLQUNuRjJTLFlBQVksQ0FBQ2lDLHVCQUF1QixDQUFDM0MsVUFBVSxFQUFFdUMsVUFBVSxFQUFFQyxRQUFRLEVBQUV6VSxPQUFPLENBQUM7SUFHakY1SyxlQUFlLENBQUN5ZiwwQkFBMEIsR0FBRyxDQUFDNUMsVUFBVSxFQUFFdUMsVUFBVSxFQUFFQyxRQUFRLEVBQUV6VSxPQUFPLEtBQ3JGMlMsWUFBWSxDQUFDbUMseUJBQXlCLENBQUM3QyxVQUFVLEVBQUV1QyxVQUFVLEVBQUVDLFFBQVEsRUFBRXpVLE9BQU8sQ0FBQztJQUduRjVLLGVBQWUsQ0FBQzJmLHFCQUFxQixHQUFHLENBQUMzUCxLQUFLLEVBQUVySSxHQUFHLEtBQUs7TUFDdEQsSUFBSSxDQUFDcUksS0FBSyxDQUFDeUMsT0FBTyxFQUFFO1FBQ2xCLE1BQU0sSUFBSTVOLEtBQUssQ0FBQyxzREFBc0QsQ0FBQztNQUN6RTtNQUVBLEtBQUssSUFBSTNGLENBQUMsR0FBRyxDQUFDLEVBQUVBLENBQUMsR0FBRzhRLEtBQUssQ0FBQzBFLE9BQU8sQ0FBQ3RWLE1BQU0sRUFBRUYsQ0FBQyxFQUFFLEVBQUU7UUFDN0MsSUFBSThRLEtBQUssQ0FBQzBFLE9BQU8sQ0FBQ3hWLENBQUMsQ0FBQyxLQUFLeUksR0FBRyxFQUFFO1VBQzVCLE9BQU96SSxDQUFDO1FBQ1Y7TUFDRjtNQUVBLE1BQU0yRixLQUFLLENBQUMsMkJBQTJCLENBQUM7SUFDMUMsQ0FBQzs7SUFFRDtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E3RSxlQUFlLENBQUMrYSxxQkFBcUIsR0FBR3RZLFFBQVEsSUFBSTtNQUNsRDtNQUNBLElBQUl6QyxlQUFlLENBQUNpUSxhQUFhLENBQUN4TixRQUFRLENBQUMsRUFBRTtRQUMzQyxPQUFPLENBQUNBLFFBQVEsQ0FBQztNQUNuQjtNQUVBLElBQUksQ0FBQ0EsUUFBUSxFQUFFO1FBQ2IsT0FBTyxJQUFJO01BQ2I7O01BRUE7TUFDQSxJQUFJeEYsTUFBTSxDQUFDMEUsSUFBSSxDQUFDYyxRQUFRLEVBQUUsS0FBSyxDQUFDLEVBQUU7UUFDaEM7UUFDQSxJQUFJekMsZUFBZSxDQUFDaVEsYUFBYSxDQUFDeE4sUUFBUSxDQUFDNE4sR0FBRyxDQUFDLEVBQUU7VUFDL0MsT0FBTyxDQUFDNU4sUUFBUSxDQUFDNE4sR0FBRyxDQUFDO1FBQ3ZCOztRQUVBO1FBQ0EsSUFBSTVOLFFBQVEsQ0FBQzROLEdBQUcsSUFDVDFMLEtBQUssQ0FBQ0MsT0FBTyxDQUFDbkMsUUFBUSxDQUFDNE4sR0FBRyxDQUFDcFAsR0FBRyxDQUFDLElBQy9Cd0IsUUFBUSxDQUFDNE4sR0FBRyxDQUFDcFAsR0FBRyxDQUFDN0IsTUFBTSxJQUN2QnFELFFBQVEsQ0FBQzROLEdBQUcsQ0FBQ3BQLEdBQUcsQ0FBQzJCLEtBQUssQ0FBQzVDLGVBQWUsQ0FBQ2lRLGFBQWEsQ0FBQyxFQUFFO1VBQzVELE9BQU94TixRQUFRLENBQUM0TixHQUFHLENBQUNwUCxHQUFHO1FBQ3pCO1FBRUEsT0FBTyxJQUFJO01BQ2I7O01BRUE7TUFDQTtNQUNBO01BQ0EsSUFBSTBELEtBQUssQ0FBQ0MsT0FBTyxDQUFDbkMsUUFBUSxDQUFDNEUsSUFBSSxDQUFDLEVBQUU7UUFDaEMsS0FBSyxJQUFJbkksQ0FBQyxHQUFHLENBQUMsRUFBRUEsQ0FBQyxHQUFHdUQsUUFBUSxDQUFDNEUsSUFBSSxDQUFDakksTUFBTSxFQUFFLEVBQUVGLENBQUMsRUFBRTtVQUM3QyxNQUFNMGdCLE1BQU0sR0FBRzVmLGVBQWUsQ0FBQythLHFCQUFxQixDQUFDdFksUUFBUSxDQUFDNEUsSUFBSSxDQUFDbkksQ0FBQyxDQUFDLENBQUM7VUFFdEUsSUFBSTBnQixNQUFNLEVBQUU7WUFDVixPQUFPQSxNQUFNO1VBQ2Y7UUFDRjtNQUNGO01BRUEsT0FBTyxJQUFJO0lBQ2IsQ0FBQztJQUVENWYsZUFBZSxDQUFDbVosb0JBQW9CLEdBQUcsQ0FBQ25KLEtBQUssRUFBRXJJLEdBQUcsS0FBSztNQUNyRCxNQUFNdUksTUFBTSxHQUFHcFEsS0FBSyxDQUFDQyxLQUFLLENBQUM0SCxHQUFHLENBQUM7TUFFL0IsT0FBT3VJLE1BQU0sQ0FBQ0csR0FBRztNQUVqQixJQUFJTCxLQUFLLENBQUN5QyxPQUFPLEVBQUU7UUFDakIsSUFBSSxDQUFDekMsS0FBSyxDQUFDdUIsTUFBTSxFQUFFO1VBQ2pCdkIsS0FBSyxDQUFDNkMsV0FBVyxDQUFDbEwsR0FBRyxDQUFDMEksR0FBRyxFQUFFTCxLQUFLLENBQUNxRSxZQUFZLENBQUNuRSxNQUFNLENBQUMsRUFBRSxJQUFJLENBQUM7VUFDNURGLEtBQUssQ0FBQzBFLE9BQU8sQ0FBQ3ZJLElBQUksQ0FBQ3hFLEdBQUcsQ0FBQztRQUN6QixDQUFDLE1BQU07VUFDTCxNQUFNekksQ0FBQyxHQUFHYyxlQUFlLENBQUM2ZixtQkFBbUIsQ0FDM0M3UCxLQUFLLENBQUN1QixNQUFNLENBQUMyRixhQUFhLENBQUM7WUFBQ2pELFNBQVMsRUFBRWpFLEtBQUssQ0FBQ2lFO1VBQVMsQ0FBQyxDQUFDLEVBQ3hEakUsS0FBSyxDQUFDMEUsT0FBTyxFQUNiL00sR0FDRixDQUFDO1VBRUQsSUFBSXVMLElBQUksR0FBR2xELEtBQUssQ0FBQzBFLE9BQU8sQ0FBQ3hWLENBQUMsR0FBRyxDQUFDLENBQUM7VUFDL0IsSUFBSWdVLElBQUksRUFBRTtZQUNSQSxJQUFJLEdBQUdBLElBQUksQ0FBQzdDLEdBQUc7VUFDakIsQ0FBQyxNQUFNO1lBQ0w2QyxJQUFJLEdBQUcsSUFBSTtVQUNiO1VBRUFsRCxLQUFLLENBQUM2QyxXQUFXLENBQUNsTCxHQUFHLENBQUMwSSxHQUFHLEVBQUVMLEtBQUssQ0FBQ3FFLFlBQVksQ0FBQ25FLE1BQU0sQ0FBQyxFQUFFZ0QsSUFBSSxDQUFDO1FBQzlEO1FBRUFsRCxLQUFLLENBQUNzQyxLQUFLLENBQUMzSyxHQUFHLENBQUMwSSxHQUFHLEVBQUVMLEtBQUssQ0FBQ3FFLFlBQVksQ0FBQ25FLE1BQU0sQ0FBQyxDQUFDO01BQ2xELENBQUMsTUFBTTtRQUNMRixLQUFLLENBQUNzQyxLQUFLLENBQUMzSyxHQUFHLENBQUMwSSxHQUFHLEVBQUVMLEtBQUssQ0FBQ3FFLFlBQVksQ0FBQ25FLE1BQU0sQ0FBQyxDQUFDO1FBQ2hERixLQUFLLENBQUMwRSxPQUFPLENBQUNrQyxHQUFHLENBQUNqUCxHQUFHLENBQUMwSSxHQUFHLEVBQUUxSSxHQUFHLENBQUM7TUFDakM7SUFDRixDQUFDO0lBRUQzSCxlQUFlLENBQUN1WixxQkFBcUIsR0FBRyxPQUFPdkosS0FBSyxFQUFFckksR0FBRyxLQUFLO01BQzVELE1BQU11SSxNQUFNLEdBQUdwUSxLQUFLLENBQUNDLEtBQUssQ0FBQzRILEdBQUcsQ0FBQztNQUUvQixPQUFPdUksTUFBTSxDQUFDRyxHQUFHO01BRWpCLElBQUlMLEtBQUssQ0FBQ3lDLE9BQU8sRUFBRTtRQUNqQixJQUFJLENBQUN6QyxLQUFLLENBQUN1QixNQUFNLEVBQUU7VUFDakIsTUFBTXZCLEtBQUssQ0FBQzZDLFdBQVcsQ0FBQ2xMLEdBQUcsQ0FBQzBJLEdBQUcsRUFBRUwsS0FBSyxDQUFDcUUsWUFBWSxDQUFDbkUsTUFBTSxDQUFDLEVBQUUsSUFBSSxDQUFDO1VBQ2xFRixLQUFLLENBQUMwRSxPQUFPLENBQUN2SSxJQUFJLENBQUN4RSxHQUFHLENBQUM7UUFDekIsQ0FBQyxNQUFNO1VBQ0wsTUFBTXpJLENBQUMsR0FBR2MsZUFBZSxDQUFDNmYsbUJBQW1CLENBQzNDN1AsS0FBSyxDQUFDdUIsTUFBTSxDQUFDMkYsYUFBYSxDQUFDO1lBQUNqRCxTQUFTLEVBQUVqRSxLQUFLLENBQUNpRTtVQUFTLENBQUMsQ0FBQyxFQUN4RGpFLEtBQUssQ0FBQzBFLE9BQU8sRUFDYi9NLEdBQ0YsQ0FBQztVQUVELElBQUl1TCxJQUFJLEdBQUdsRCxLQUFLLENBQUMwRSxPQUFPLENBQUN4VixDQUFDLEdBQUcsQ0FBQyxDQUFDO1VBQy9CLElBQUlnVSxJQUFJLEVBQUU7WUFDUkEsSUFBSSxHQUFHQSxJQUFJLENBQUM3QyxHQUFHO1VBQ2pCLENBQUMsTUFBTTtZQUNMNkMsSUFBSSxHQUFHLElBQUk7VUFDYjtVQUVBLE1BQU1sRCxLQUFLLENBQUM2QyxXQUFXLENBQUNsTCxHQUFHLENBQUMwSSxHQUFHLEVBQUVMLEtBQUssQ0FBQ3FFLFlBQVksQ0FBQ25FLE1BQU0sQ0FBQyxFQUFFZ0QsSUFBSSxDQUFDO1FBQ3BFO1FBRUEsTUFBTWxELEtBQUssQ0FBQ3NDLEtBQUssQ0FBQzNLLEdBQUcsQ0FBQzBJLEdBQUcsRUFBRUwsS0FBSyxDQUFDcUUsWUFBWSxDQUFDbkUsTUFBTSxDQUFDLENBQUM7TUFDeEQsQ0FBQyxNQUFNO1FBQ0wsTUFBTUYsS0FBSyxDQUFDc0MsS0FBSyxDQUFDM0ssR0FBRyxDQUFDMEksR0FBRyxFQUFFTCxLQUFLLENBQUNxRSxZQUFZLENBQUNuRSxNQUFNLENBQUMsQ0FBQztRQUN0REYsS0FBSyxDQUFDMEUsT0FBTyxDQUFDa0MsR0FBRyxDQUFDalAsR0FBRyxDQUFDMEksR0FBRyxFQUFFMUksR0FBRyxDQUFDO01BQ2pDO0lBQ0YsQ0FBQztJQUVEM0gsZUFBZSxDQUFDNmYsbUJBQW1CLEdBQUcsQ0FBQzdCLEdBQUcsRUFBRUMsS0FBSyxFQUFFaGIsS0FBSyxLQUFLO01BQzNELElBQUlnYixLQUFLLENBQUM3ZSxNQUFNLEtBQUssQ0FBQyxFQUFFO1FBQ3RCNmUsS0FBSyxDQUFDOVIsSUFBSSxDQUFDbEosS0FBSyxDQUFDO1FBQ2pCLE9BQU8sQ0FBQztNQUNWO01BRUEsTUFBTS9ELENBQUMsR0FBR2MsZUFBZSxDQUFDK2QsYUFBYSxDQUFDQyxHQUFHLEVBQUVDLEtBQUssRUFBRWhiLEtBQUssQ0FBQztNQUUxRGdiLEtBQUssQ0FBQzZCLE1BQU0sQ0FBQzVnQixDQUFDLEVBQUUsQ0FBQyxFQUFFK0QsS0FBSyxDQUFDO01BRXpCLE9BQU8vRCxDQUFDO0lBQ1YsQ0FBQztJQUVEYyxlQUFlLENBQUM0ZSxrQkFBa0IsR0FBRzdmLEdBQUcsSUFBSTtNQUMxQyxJQUFJNGYsUUFBUSxHQUFHLEtBQUs7TUFDcEIsSUFBSW9CLFNBQVMsR0FBRyxLQUFLO01BRXJCMWhCLE1BQU0sQ0FBQ1EsSUFBSSxDQUFDRSxHQUFHLENBQUMsQ0FBQzBDLE9BQU8sQ0FBQ3VCLEdBQUcsSUFBSTtRQUM5QixJQUFJQSxHQUFHLENBQUM4SCxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLEdBQUcsRUFBRTtVQUM1QjZULFFBQVEsR0FBRyxJQUFJO1FBQ2pCLENBQUMsTUFBTTtVQUNMb0IsU0FBUyxHQUFHLElBQUk7UUFDbEI7TUFDRixDQUFDLENBQUM7TUFFRixJQUFJcEIsUUFBUSxJQUFJb0IsU0FBUyxFQUFFO1FBQ3pCLE1BQU0sSUFBSWxiLEtBQUssQ0FDYixxRUFDRixDQUFDO01BQ0g7TUFFQSxPQUFPOFosUUFBUTtJQUNqQixDQUFDOztJQUVEO0lBQ0E7SUFDQTtJQUNBM2UsZUFBZSxDQUFDeUcsY0FBYyxHQUFHNUUsQ0FBQyxJQUFJO01BQ3BDLE9BQU9BLENBQUMsSUFBSTdCLGVBQWUsQ0FBQ3dGLEVBQUUsQ0FBQ0MsS0FBSyxDQUFDNUQsQ0FBQyxDQUFDLEtBQUssQ0FBQztJQUMvQyxDQUFDOztJQUVEO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBN0IsZUFBZSxDQUFDQyxPQUFPLEdBQUcsVUFBQzBILEdBQUcsRUFBRXZKLFFBQVEsRUFBbUI7TUFBQSxJQUFqQndNLE9BQU8sR0FBQTdILFNBQUEsQ0FBQTNELE1BQUEsUUFBQTJELFNBQUEsUUFBQWxDLFNBQUEsR0FBQWtDLFNBQUEsTUFBRyxDQUFDLENBQUM7TUFDcEQsSUFBSSxDQUFDL0MsZUFBZSxDQUFDeUcsY0FBYyxDQUFDckksUUFBUSxDQUFDLEVBQUU7UUFDN0MsTUFBTXVRLGNBQWMsQ0FBQyw0QkFBNEIsQ0FBQztNQUNwRDs7TUFFQTtNQUNBdlEsUUFBUSxHQUFHMEIsS0FBSyxDQUFDQyxLQUFLLENBQUMzQixRQUFRLENBQUM7TUFFaEMsTUFBTTRoQixVQUFVLEdBQUc3aUIsZ0JBQWdCLENBQUNpQixRQUFRLENBQUM7TUFDN0MsTUFBTXlnQixNQUFNLEdBQUdtQixVQUFVLEdBQUdsZ0IsS0FBSyxDQUFDQyxLQUFLLENBQUM0SCxHQUFHLENBQUMsR0FBR3ZKLFFBQVE7TUFFdkQsSUFBSTRoQixVQUFVLEVBQUU7UUFDZDtRQUNBM2hCLE1BQU0sQ0FBQ1EsSUFBSSxDQUFDVCxRQUFRLENBQUMsQ0FBQ3FELE9BQU8sQ0FBQ3NOLFFBQVEsSUFBSTtVQUN4QztVQUNBLE1BQU1rUixXQUFXLEdBQUdyVixPQUFPLENBQUNrVSxRQUFRLElBQUkvUCxRQUFRLEtBQUssY0FBYztVQUNuRSxNQUFNbVIsT0FBTyxHQUFHQyxTQUFTLENBQUNGLFdBQVcsR0FBRyxNQUFNLEdBQUdsUixRQUFRLENBQUM7VUFDMUQsTUFBTXJLLE9BQU8sR0FBR3RHLFFBQVEsQ0FBQzJRLFFBQVEsQ0FBQztVQUVsQyxJQUFJLENBQUNtUixPQUFPLEVBQUU7WUFDWixNQUFNdlIsY0FBYywrQkFBQS9QLE1BQUEsQ0FBK0JtUSxRQUFRLENBQUUsQ0FBQztVQUNoRTtVQUVBMVEsTUFBTSxDQUFDUSxJQUFJLENBQUM2RixPQUFPLENBQUMsQ0FBQ2pELE9BQU8sQ0FBQzJlLE9BQU8sSUFBSTtZQUN0QyxNQUFNalosR0FBRyxHQUFHekMsT0FBTyxDQUFDMGIsT0FBTyxDQUFDO1lBRTVCLElBQUlBLE9BQU8sS0FBSyxFQUFFLEVBQUU7Y0FDbEIsTUFBTXpSLGNBQWMsQ0FBQyxvQ0FBb0MsQ0FBQztZQUM1RDtZQUVBLE1BQU0wUixRQUFRLEdBQUdELE9BQU8sQ0FBQ3ZpQixLQUFLLENBQUMsR0FBRyxDQUFDO1lBRW5DLElBQUksQ0FBQ3dpQixRQUFRLENBQUN6ZCxLQUFLLENBQUNzSSxPQUFPLENBQUMsRUFBRTtjQUM1QixNQUFNeUQsY0FBYyxDQUNsQixvQkFBQS9QLE1BQUEsQ0FBb0J3aEIsT0FBTyx3Q0FDM0IsdUJBQ0YsQ0FBQztZQUNIO1lBRUEsTUFBTUUsTUFBTSxHQUFHQyxhQUFhLENBQUMxQixNQUFNLEVBQUV3QixRQUFRLEVBQUU7Y0FDN0NqVyxZQUFZLEVBQUVRLE9BQU8sQ0FBQ1IsWUFBWTtjQUNsQ29XLFdBQVcsRUFBRXpSLFFBQVEsS0FBSyxTQUFTO2NBQ25DMFIsUUFBUSxFQUFFQyxtQkFBbUIsQ0FBQzNSLFFBQVE7WUFDeEMsQ0FBQyxDQUFDO1lBRUZtUixPQUFPLENBQUNJLE1BQU0sRUFBRUQsUUFBUSxDQUFDTSxHQUFHLENBQUMsQ0FBQyxFQUFFeFosR0FBRyxFQUFFaVosT0FBTyxFQUFFdkIsTUFBTSxDQUFDO1VBQ3ZELENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQztRQUVGLElBQUlsWCxHQUFHLENBQUMwSSxHQUFHLElBQUksQ0FBQ3ZRLEtBQUssQ0FBQ2thLE1BQU0sQ0FBQ3JTLEdBQUcsQ0FBQzBJLEdBQUcsRUFBRXdPLE1BQU0sQ0FBQ3hPLEdBQUcsQ0FBQyxFQUFFO1VBQ2pELE1BQU0xQixjQUFjLENBQ2xCLHFEQUFBL1AsTUFBQSxDQUFvRCtJLEdBQUcsQ0FBQzBJLEdBQUcsaUJBQzNELG1FQUFtRSxhQUFBelIsTUFBQSxDQUMxRGlnQixNQUFNLENBQUN4TyxHQUFHLE9BQ3JCLENBQUM7UUFDSDtNQUNGLENBQUMsTUFBTTtRQUNMLElBQUkxSSxHQUFHLENBQUMwSSxHQUFHLElBQUlqUyxRQUFRLENBQUNpUyxHQUFHLElBQUksQ0FBQ3ZRLEtBQUssQ0FBQ2thLE1BQU0sQ0FBQ3JTLEdBQUcsQ0FBQzBJLEdBQUcsRUFBRWpTLFFBQVEsQ0FBQ2lTLEdBQUcsQ0FBQyxFQUFFO1VBQ25FLE1BQU0xQixjQUFjLENBQ2xCLGdEQUFBL1AsTUFBQSxDQUErQytJLEdBQUcsQ0FBQzBJLEdBQUcsMEJBQUF6UixNQUFBLENBQzVDUixRQUFRLENBQUNpUyxHQUFHLFFBQ3hCLENBQUM7UUFDSDs7UUFFQTtRQUNBcUksd0JBQXdCLENBQUN0YSxRQUFRLENBQUM7TUFDcEM7O01BRUE7TUFDQUMsTUFBTSxDQUFDUSxJQUFJLENBQUM4SSxHQUFHLENBQUMsQ0FBQ2xHLE9BQU8sQ0FBQ3VCLEdBQUcsSUFBSTtRQUM5QjtRQUNBO1FBQ0E7UUFDQSxJQUFJQSxHQUFHLEtBQUssS0FBSyxFQUFFO1VBQ2pCLE9BQU8yRSxHQUFHLENBQUMzRSxHQUFHLENBQUM7UUFDakI7TUFDRixDQUFDLENBQUM7TUFFRjNFLE1BQU0sQ0FBQ1EsSUFBSSxDQUFDZ2dCLE1BQU0sQ0FBQyxDQUFDcGQsT0FBTyxDQUFDdUIsR0FBRyxJQUFJO1FBQ2pDMkUsR0FBRyxDQUFDM0UsR0FBRyxDQUFDLEdBQUc2YixNQUFNLENBQUM3YixHQUFHLENBQUM7TUFDeEIsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVEaEQsZUFBZSxDQUFDNFQsMEJBQTBCLEdBQUcsQ0FBQ08sTUFBTSxFQUFFeU0sZ0JBQWdCLEtBQUs7TUFDekUsTUFBTTNPLFNBQVMsR0FBR2tDLE1BQU0sQ0FBQ1QsWUFBWSxDQUFDLENBQUMsS0FBSy9MLEdBQUcsSUFBSUEsR0FBRyxDQUFDO01BQ3ZELElBQUlrWixVQUFVLEdBQUcsQ0FBQyxDQUFDRCxnQkFBZ0IsQ0FBQzNMLGlCQUFpQjtNQUVyRCxJQUFJNkwsdUJBQXVCO01BQzNCLElBQUk5Z0IsZUFBZSxDQUFDK2dCLDJCQUEyQixDQUFDSCxnQkFBZ0IsQ0FBQyxFQUFFO1FBQ2pFO1FBQ0E7UUFDQTtRQUNBO1FBQ0EsTUFBTUksT0FBTyxHQUFHLENBQUNKLGdCQUFnQixDQUFDSyxXQUFXO1FBRTdDSCx1QkFBdUIsR0FBRztVQUN4QmpPLFdBQVdBLENBQUNtRSxFQUFFLEVBQUU5RyxNQUFNLEVBQUV3TSxNQUFNLEVBQUU7WUFDOUIsTUFBTXdFLEtBQUssR0FBR0wsVUFBVSxJQUFJLEVBQUVELGdCQUFnQixDQUFDTyxPQUFPLElBQUlQLGdCQUFnQixDQUFDdE8sS0FBSyxDQUFDO1lBQ2pGLElBQUk0TyxLQUFLLEVBQUU7Y0FDVDtZQUNGO1lBRUEsTUFBTXZaLEdBQUcsR0FBR3NLLFNBQVMsQ0FBQzVULE1BQU0sQ0FBQ0MsTUFBTSxDQUFDNFIsTUFBTSxFQUFFO2NBQUNHLEdBQUcsRUFBRTJHO1lBQUUsQ0FBQyxDQUFDLENBQUM7WUFFdkQsSUFBSTRKLGdCQUFnQixDQUFDTyxPQUFPLEVBQUU7Y0FDNUJQLGdCQUFnQixDQUFDTyxPQUFPLENBQ3BCeFosR0FBRyxFQUNIcVosT0FBTyxHQUNEdEUsTUFBTSxHQUNGLElBQUksQ0FBQ08sSUFBSSxDQUFDOVAsT0FBTyxDQUFDdVAsTUFBTSxDQUFDLEdBQ3pCLElBQUksQ0FBQ08sSUFBSSxDQUFDNUgsSUFBSSxDQUFDLENBQUMsR0FDcEIsQ0FBQyxDQUFDLEVBQ1JxSCxNQUNKLENBQUM7WUFDSCxDQUFDLE1BQU07Y0FDTGtFLGdCQUFnQixDQUFDdE8sS0FBSyxDQUFDM0ssR0FBRyxDQUFDO1lBQzdCO1VBQ0YsQ0FBQztVQUNEbUwsT0FBT0EsQ0FBQ2tFLEVBQUUsRUFBRTlHLE1BQU0sRUFBRTtZQUVsQixJQUFJLEVBQUUwUSxnQkFBZ0IsQ0FBQ1EsU0FBUyxJQUFJUixnQkFBZ0IsQ0FBQzlOLE9BQU8sQ0FBQyxFQUFFO2NBQzdEO1lBQ0Y7WUFFQSxJQUFJbkwsR0FBRyxHQUFHN0gsS0FBSyxDQUFDQyxLQUFLLENBQUMsSUFBSSxDQUFDa2QsSUFBSSxDQUFDdEcsR0FBRyxDQUFDSyxFQUFFLENBQUMsQ0FBQztZQUN4QyxJQUFJLENBQUNyUCxHQUFHLEVBQUU7Y0FDUixNQUFNLElBQUk5QyxLQUFLLDRCQUFBakcsTUFBQSxDQUE0Qm9ZLEVBQUUsQ0FBRSxDQUFDO1lBQ2xEO1lBRUEsTUFBTXFLLE1BQU0sR0FBR3BQLFNBQVMsQ0FBQ25TLEtBQUssQ0FBQ0MsS0FBSyxDQUFDNEgsR0FBRyxDQUFDLENBQUM7WUFFMUM0VixZQUFZLENBQUNDLFlBQVksQ0FBQzdWLEdBQUcsRUFBRXVJLE1BQU0sQ0FBQztZQUV0QyxJQUFJMFEsZ0JBQWdCLENBQUNRLFNBQVMsRUFBRTtjQUM5QlIsZ0JBQWdCLENBQUNRLFNBQVMsQ0FDdEJuUCxTQUFTLENBQUN0SyxHQUFHLENBQUMsRUFDZDBaLE1BQU0sRUFDTkwsT0FBTyxHQUFHLElBQUksQ0FBQy9ELElBQUksQ0FBQzlQLE9BQU8sQ0FBQzZKLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FDdkMsQ0FBQztZQUNILENBQUMsTUFBTTtjQUNMNEosZ0JBQWdCLENBQUM5TixPQUFPLENBQUNiLFNBQVMsQ0FBQ3RLLEdBQUcsQ0FBQyxFQUFFMFosTUFBTSxDQUFDO1lBQ2xEO1VBQ0YsQ0FBQztVQUNEdE8sV0FBV0EsQ0FBQ2lFLEVBQUUsRUFBRTBGLE1BQU0sRUFBRTtZQUN0QixJQUFJLENBQUNrRSxnQkFBZ0IsQ0FBQ1UsT0FBTyxFQUFFO2NBQzdCO1lBQ0Y7WUFFQSxNQUFNQyxJQUFJLEdBQUdQLE9BQU8sR0FBRyxJQUFJLENBQUMvRCxJQUFJLENBQUM5UCxPQUFPLENBQUM2SixFQUFFLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDakQsSUFBSXdLLEVBQUUsR0FBR1IsT0FBTyxHQUNWdEUsTUFBTSxHQUNGLElBQUksQ0FBQ08sSUFBSSxDQUFDOVAsT0FBTyxDQUFDdVAsTUFBTSxDQUFDLEdBQ3pCLElBQUksQ0FBQ08sSUFBSSxDQUFDNUgsSUFBSSxDQUFDLENBQUMsR0FDcEIsQ0FBQyxDQUFDOztZQUVSO1lBQ0E7WUFDQSxJQUFJbU0sRUFBRSxHQUFHRCxJQUFJLEVBQUU7Y0FDYixFQUFFQyxFQUFFO1lBQ047WUFFQVosZ0JBQWdCLENBQUNVLE9BQU8sQ0FDcEJyUCxTQUFTLENBQUNuUyxLQUFLLENBQUNDLEtBQUssQ0FBQyxJQUFJLENBQUNrZCxJQUFJLENBQUN0RyxHQUFHLENBQUNLLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFDekN1SyxJQUFJLEVBQ0pDLEVBQUUsRUFDRjlFLE1BQU0sSUFBSSxJQUNkLENBQUM7VUFDSCxDQUFDO1VBQ0RuSyxPQUFPQSxDQUFDeUUsRUFBRSxFQUFFO1lBQ1YsSUFBSSxFQUFFNEosZ0JBQWdCLENBQUNhLFNBQVMsSUFBSWIsZ0JBQWdCLENBQUNyTyxPQUFPLENBQUMsRUFBRTtjQUM3RDtZQUNGOztZQUVBO1lBQ0E7WUFDQSxNQUFNNUssR0FBRyxHQUFHc0ssU0FBUyxDQUFDLElBQUksQ0FBQ2dMLElBQUksQ0FBQ3RHLEdBQUcsQ0FBQ0ssRUFBRSxDQUFDLENBQUM7WUFFeEMsSUFBSTRKLGdCQUFnQixDQUFDYSxTQUFTLEVBQUU7Y0FDOUJiLGdCQUFnQixDQUFDYSxTQUFTLENBQUM5WixHQUFHLEVBQUVxWixPQUFPLEdBQUcsSUFBSSxDQUFDL0QsSUFBSSxDQUFDOVAsT0FBTyxDQUFDNkosRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDdkUsQ0FBQyxNQUFNO2NBQ0w0SixnQkFBZ0IsQ0FBQ3JPLE9BQU8sQ0FBQzVLLEdBQUcsQ0FBQztZQUMvQjtVQUNGO1FBQ0YsQ0FBQztNQUNILENBQUMsTUFBTTtRQUNMbVosdUJBQXVCLEdBQUc7VUFDeEJ4TyxLQUFLQSxDQUFDMEUsRUFBRSxFQUFFOUcsTUFBTSxFQUFFO1lBQ2hCLElBQUksQ0FBQzJRLFVBQVUsSUFBSUQsZ0JBQWdCLENBQUN0TyxLQUFLLEVBQUU7Y0FDekNzTyxnQkFBZ0IsQ0FBQ3RPLEtBQUssQ0FBQ0wsU0FBUyxDQUFDNVQsTUFBTSxDQUFDQyxNQUFNLENBQUM0UixNQUFNLEVBQUU7Z0JBQUNHLEdBQUcsRUFBRTJHO2NBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNyRTtVQUNGLENBQUM7VUFDRGxFLE9BQU9BLENBQUNrRSxFQUFFLEVBQUU5RyxNQUFNLEVBQUU7WUFDbEIsSUFBSTBRLGdCQUFnQixDQUFDOU4sT0FBTyxFQUFFO2NBQzVCLE1BQU11TyxNQUFNLEdBQUcsSUFBSSxDQUFDcEUsSUFBSSxDQUFDdEcsR0FBRyxDQUFDSyxFQUFFLENBQUM7Y0FDaEMsTUFBTXJQLEdBQUcsR0FBRzdILEtBQUssQ0FBQ0MsS0FBSyxDQUFDc2hCLE1BQU0sQ0FBQztjQUUvQjlELFlBQVksQ0FBQ0MsWUFBWSxDQUFDN1YsR0FBRyxFQUFFdUksTUFBTSxDQUFDO2NBRXRDMFEsZ0JBQWdCLENBQUM5TixPQUFPLENBQ3BCYixTQUFTLENBQUN0SyxHQUFHLENBQUMsRUFDZHNLLFNBQVMsQ0FBQ25TLEtBQUssQ0FBQ0MsS0FBSyxDQUFDc2hCLE1BQU0sQ0FBQyxDQUNqQyxDQUFDO1lBQ0g7VUFDRixDQUFDO1VBQ0Q5TyxPQUFPQSxDQUFDeUUsRUFBRSxFQUFFO1lBQ1YsSUFBSTRKLGdCQUFnQixDQUFDck8sT0FBTyxFQUFFO2NBQzVCcU8sZ0JBQWdCLENBQUNyTyxPQUFPLENBQUNOLFNBQVMsQ0FBQyxJQUFJLENBQUNnTCxJQUFJLENBQUN0RyxHQUFHLENBQUNLLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDeEQ7VUFDRjtRQUNGLENBQUM7TUFDSDtNQUVBLE1BQU0wSyxjQUFjLEdBQUcsSUFBSTFoQixlQUFlLENBQUM4YyxzQkFBc0IsQ0FBQztRQUNoRUUsU0FBUyxFQUFFOEQ7TUFDYixDQUFDLENBQUM7O01BRUY7TUFDQTtNQUNBO01BQ0FZLGNBQWMsQ0FBQ3RFLFdBQVcsQ0FBQ3VFLFlBQVksR0FBRyxJQUFJO01BQzlDLE1BQU1yTSxNQUFNLEdBQUduQixNQUFNLENBQUNMLGNBQWMsQ0FBQzROLGNBQWMsQ0FBQ3RFLFdBQVcsRUFDM0Q7UUFBRXdFLG9CQUFvQixFQUFFO01BQUssQ0FBQyxDQUFDOztNQUVuQztNQUNBLE1BQU1DLGFBQWEsR0FBSUMsQ0FBQyxJQUFLO1FBQUEsSUFBQUMsaUJBQUE7UUFDM0IsSUFBSUQsQ0FBQyxDQUFDck0sT0FBTyxFQUFFb0wsVUFBVSxHQUFHLEtBQUssQ0FBQyxLQUM3QixDQUFBa0IsaUJBQUEsR0FBQUQsQ0FBQyxDQUFDcE0sY0FBYyxjQUFBcU0saUJBQUEsdUJBQWhCQSxpQkFBQSxDQUFrQmhNLElBQUksQ0FBQyxNQUFPOEssVUFBVSxHQUFHLEtBQU0sQ0FBQztNQUN6RCxDQUFDO01BQ0Q7TUFDQTtNQUNBLElBQUkvSixNQUFNLENBQUNrTCxVQUFVLENBQUMxTSxNQUFNLENBQUMsRUFBRTtRQUM3QkEsTUFBTSxDQUFDUyxJQUFJLENBQUM4TCxhQUFhLENBQUM7TUFDNUIsQ0FBQyxNQUFNO1FBQ0xBLGFBQWEsQ0FBQ3ZNLE1BQU0sQ0FBQztNQUN2QjtNQUNBLE9BQU9BLE1BQU07SUFDZixDQUFDO0lBRUR0VixlQUFlLENBQUMrZ0IsMkJBQTJCLEdBQUcvRCxTQUFTLElBQUk7TUFDekQsSUFBSUEsU0FBUyxDQUFDMUssS0FBSyxJQUFJMEssU0FBUyxDQUFDbUUsT0FBTyxFQUFFO1FBQ3hDLE1BQU0sSUFBSXRjLEtBQUssQ0FBQyxrREFBa0QsQ0FBQztNQUNyRTtNQUVBLElBQUltWSxTQUFTLENBQUNsSyxPQUFPLElBQUlrSyxTQUFTLENBQUNvRSxTQUFTLEVBQUU7UUFDNUMsTUFBTSxJQUFJdmMsS0FBSyxDQUFDLHNEQUFzRCxDQUFDO01BQ3pFO01BRUEsSUFBSW1ZLFNBQVMsQ0FBQ3pLLE9BQU8sSUFBSXlLLFNBQVMsQ0FBQ3lFLFNBQVMsRUFBRTtRQUM1QyxNQUFNLElBQUk1YyxLQUFLLENBQUMsc0RBQXNELENBQUM7TUFDekU7TUFFQSxPQUFPLENBQUMsRUFDTm1ZLFNBQVMsQ0FBQ21FLE9BQU8sSUFDakJuRSxTQUFTLENBQUNvRSxTQUFTLElBQ25CcEUsU0FBUyxDQUFDc0UsT0FBTyxJQUNqQnRFLFNBQVMsQ0FBQ3lFLFNBQVMsQ0FDcEI7SUFDSCxDQUFDO0lBRUR6aEIsZUFBZSxDQUFDK1Qsa0NBQWtDLEdBQUdpSixTQUFTLElBQUk7TUFDaEUsSUFBSUEsU0FBUyxDQUFDMUssS0FBSyxJQUFJMEssU0FBUyxDQUFDbkssV0FBVyxFQUFFO1FBQzVDLE1BQU0sSUFBSWhPLEtBQUssQ0FBQyxzREFBc0QsQ0FBQztNQUN6RTtNQUVBLE9BQU8sQ0FBQyxFQUFFbVksU0FBUyxDQUFDbkssV0FBVyxJQUFJbUssU0FBUyxDQUFDakssV0FBVyxDQUFDO0lBQzNELENBQUM7SUFFRC9TLGVBQWUsQ0FBQ2lhLHNCQUFzQixHQUFHLENBQUNqSyxLQUFLLEVBQUVySSxHQUFHLEtBQUs7TUFDdkQsSUFBSXFJLEtBQUssQ0FBQ3lDLE9BQU8sRUFBRTtRQUNqQixNQUFNdlQsQ0FBQyxHQUFHYyxlQUFlLENBQUMyZixxQkFBcUIsQ0FBQzNQLEtBQUssRUFBRXJJLEdBQUcsQ0FBQztRQUUzRHFJLEtBQUssQ0FBQ3VDLE9BQU8sQ0FBQzVLLEdBQUcsQ0FBQzBJLEdBQUcsQ0FBQztRQUN0QkwsS0FBSyxDQUFDMEUsT0FBTyxDQUFDb0wsTUFBTSxDQUFDNWdCLENBQUMsRUFBRSxDQUFDLENBQUM7TUFDNUIsQ0FBQyxNQUFNO1FBQ0wsTUFBTThYLEVBQUUsR0FBR3JQLEdBQUcsQ0FBQzBJLEdBQUcsQ0FBQyxDQUFFOztRQUVyQkwsS0FBSyxDQUFDdUMsT0FBTyxDQUFDNUssR0FBRyxDQUFDMEksR0FBRyxDQUFDO1FBQ3RCTCxLQUFLLENBQUMwRSxPQUFPLENBQUNpRixNQUFNLENBQUMzQyxFQUFFLENBQUM7TUFDMUI7SUFDRixDQUFDO0lBRURoWCxlQUFlLENBQUNtYSx1QkFBdUIsR0FBRyxPQUFPbkssS0FBSyxFQUFFckksR0FBRyxLQUFLO01BQzlELElBQUlxSSxLQUFLLENBQUN5QyxPQUFPLEVBQUU7UUFDakIsTUFBTXZULENBQUMsR0FBR2MsZUFBZSxDQUFDMmYscUJBQXFCLENBQUMzUCxLQUFLLEVBQUVySSxHQUFHLENBQUM7UUFFM0QsTUFBTXFJLEtBQUssQ0FBQ3VDLE9BQU8sQ0FBQzVLLEdBQUcsQ0FBQzBJLEdBQUcsQ0FBQztRQUM1QkwsS0FBSyxDQUFDMEUsT0FBTyxDQUFDb0wsTUFBTSxDQUFDNWdCLENBQUMsRUFBRSxDQUFDLENBQUM7TUFDNUIsQ0FBQyxNQUFNO1FBQ0wsTUFBTThYLEVBQUUsR0FBR3JQLEdBQUcsQ0FBQzBJLEdBQUcsQ0FBQyxDQUFFOztRQUVyQixNQUFNTCxLQUFLLENBQUN1QyxPQUFPLENBQUM1SyxHQUFHLENBQUMwSSxHQUFHLENBQUM7UUFDNUJMLEtBQUssQ0FBQzBFLE9BQU8sQ0FBQ2lGLE1BQU0sQ0FBQzNDLEVBQUUsQ0FBQztNQUMxQjtJQUNGLENBQUM7O0lBRUQ7SUFDQWhYLGVBQWUsQ0FBQ2lRLGFBQWEsR0FBR3hOLFFBQVEsSUFDdEMsT0FBT0EsUUFBUSxLQUFLLFFBQVEsSUFDNUIsT0FBT0EsUUFBUSxLQUFLLFFBQVEsSUFDNUJBLFFBQVEsWUFBWW1XLE9BQU8sQ0FBQ0MsUUFBUTs7SUFHdEM7SUFDQTdZLGVBQWUsQ0FBQ3dSLDRCQUE0QixHQUFHL08sUUFBUSxJQUNyRHpDLGVBQWUsQ0FBQ2lRLGFBQWEsQ0FBQ3hOLFFBQVEsQ0FBQyxJQUN2Q3pDLGVBQWUsQ0FBQ2lRLGFBQWEsQ0FBQ3hOLFFBQVEsSUFBSUEsUUFBUSxDQUFDNE4sR0FBRyxDQUFDLElBQ3ZEaFMsTUFBTSxDQUFDUSxJQUFJLENBQUM0RCxRQUFRLENBQUMsQ0FBQ3JELE1BQU0sS0FBSyxDQUFDO0lBR3BDWSxlQUFlLENBQUMyYyxvQkFBb0IsR0FBRyxDQUFDM00sS0FBSyxFQUFFckksR0FBRyxFQUFFNFUsT0FBTyxLQUFLO01BQzlELElBQUksQ0FBQ3pjLEtBQUssQ0FBQ2thLE1BQU0sQ0FBQ3JTLEdBQUcsQ0FBQzBJLEdBQUcsRUFBRWtNLE9BQU8sQ0FBQ2xNLEdBQUcsQ0FBQyxFQUFFO1FBQ3ZDLE1BQU0sSUFBSXhMLEtBQUssQ0FBQywyQ0FBMkMsQ0FBQztNQUM5RDtNQUVBLE1BQU13UCxZQUFZLEdBQUdyRSxLQUFLLENBQUNxRSxZQUFZO01BQ3ZDLE1BQU00TixhQUFhLEdBQUcxRSxZQUFZLENBQUMyRSxpQkFBaUIsQ0FDbEQ3TixZQUFZLENBQUMxTSxHQUFHLENBQUMsRUFDakIwTSxZQUFZLENBQUNrSSxPQUFPLENBQ3RCLENBQUM7TUFFRCxJQUFJLENBQUN2TSxLQUFLLENBQUN5QyxPQUFPLEVBQUU7UUFDbEIsSUFBSXBVLE1BQU0sQ0FBQ1EsSUFBSSxDQUFDb2pCLGFBQWEsQ0FBQyxDQUFDN2lCLE1BQU0sRUFBRTtVQUNyQzRRLEtBQUssQ0FBQzhDLE9BQU8sQ0FBQ25MLEdBQUcsQ0FBQzBJLEdBQUcsRUFBRTRSLGFBQWEsQ0FBQztVQUNyQ2pTLEtBQUssQ0FBQzBFLE9BQU8sQ0FBQ2tDLEdBQUcsQ0FBQ2pQLEdBQUcsQ0FBQzBJLEdBQUcsRUFBRTFJLEdBQUcsQ0FBQztRQUNqQztRQUVBO01BQ0Y7TUFFQSxNQUFNd2EsT0FBTyxHQUFHbmlCLGVBQWUsQ0FBQzJmLHFCQUFxQixDQUFDM1AsS0FBSyxFQUFFckksR0FBRyxDQUFDO01BRWpFLElBQUl0SixNQUFNLENBQUNRLElBQUksQ0FBQ29qQixhQUFhLENBQUMsQ0FBQzdpQixNQUFNLEVBQUU7UUFDckM0USxLQUFLLENBQUM4QyxPQUFPLENBQUNuTCxHQUFHLENBQUMwSSxHQUFHLEVBQUU0UixhQUFhLENBQUM7TUFDdkM7TUFFQSxJQUFJLENBQUNqUyxLQUFLLENBQUN1QixNQUFNLEVBQUU7UUFDakI7TUFDRjs7TUFFQTtNQUNBdkIsS0FBSyxDQUFDMEUsT0FBTyxDQUFDb0wsTUFBTSxDQUFDcUMsT0FBTyxFQUFFLENBQUMsQ0FBQztNQUVoQyxNQUFNQyxPQUFPLEdBQUdwaUIsZUFBZSxDQUFDNmYsbUJBQW1CLENBQ2pEN1AsS0FBSyxDQUFDdUIsTUFBTSxDQUFDMkYsYUFBYSxDQUFDO1FBQUNqRCxTQUFTLEVBQUVqRSxLQUFLLENBQUNpRTtNQUFTLENBQUMsQ0FBQyxFQUN4RGpFLEtBQUssQ0FBQzBFLE9BQU8sRUFDYi9NLEdBQ0YsQ0FBQztNQUVELElBQUl3YSxPQUFPLEtBQUtDLE9BQU8sRUFBRTtRQUN2QixJQUFJbFAsSUFBSSxHQUFHbEQsS0FBSyxDQUFDMEUsT0FBTyxDQUFDME4sT0FBTyxHQUFHLENBQUMsQ0FBQztRQUNyQyxJQUFJbFAsSUFBSSxFQUFFO1VBQ1JBLElBQUksR0FBR0EsSUFBSSxDQUFDN0MsR0FBRztRQUNqQixDQUFDLE1BQU07VUFDTDZDLElBQUksR0FBRyxJQUFJO1FBQ2I7UUFFQWxELEtBQUssQ0FBQytDLFdBQVcsSUFBSS9DLEtBQUssQ0FBQytDLFdBQVcsQ0FBQ3BMLEdBQUcsQ0FBQzBJLEdBQUcsRUFBRTZDLElBQUksQ0FBQztNQUN2RDtJQUNGLENBQUM7SUFFRGxULGVBQWUsQ0FBQzRjLHFCQUFxQixHQUFHLE9BQU81TSxLQUFLLEVBQUVySSxHQUFHLEVBQUU0VSxPQUFPLEtBQUs7TUFDckUsSUFBSSxDQUFDemMsS0FBSyxDQUFDa2EsTUFBTSxDQUFDclMsR0FBRyxDQUFDMEksR0FBRyxFQUFFa00sT0FBTyxDQUFDbE0sR0FBRyxDQUFDLEVBQUU7UUFDdkMsTUFBTSxJQUFJeEwsS0FBSyxDQUFDLDJDQUEyQyxDQUFDO01BQzlEO01BRUEsTUFBTXdQLFlBQVksR0FBR3JFLEtBQUssQ0FBQ3FFLFlBQVk7TUFDdkMsTUFBTTROLGFBQWEsR0FBRzFFLFlBQVksQ0FBQzJFLGlCQUFpQixDQUNsRDdOLFlBQVksQ0FBQzFNLEdBQUcsQ0FBQyxFQUNqQjBNLFlBQVksQ0FBQ2tJLE9BQU8sQ0FDdEIsQ0FBQztNQUVELElBQUksQ0FBQ3ZNLEtBQUssQ0FBQ3lDLE9BQU8sRUFBRTtRQUNsQixJQUFJcFUsTUFBTSxDQUFDUSxJQUFJLENBQUNvakIsYUFBYSxDQUFDLENBQUM3aUIsTUFBTSxFQUFFO1VBQ3JDLE1BQU00USxLQUFLLENBQUM4QyxPQUFPLENBQUNuTCxHQUFHLENBQUMwSSxHQUFHLEVBQUU0UixhQUFhLENBQUM7VUFDM0NqUyxLQUFLLENBQUMwRSxPQUFPLENBQUNrQyxHQUFHLENBQUNqUCxHQUFHLENBQUMwSSxHQUFHLEVBQUUxSSxHQUFHLENBQUM7UUFDakM7UUFFQTtNQUNGO01BRUEsTUFBTXdhLE9BQU8sR0FBR25pQixlQUFlLENBQUMyZixxQkFBcUIsQ0FBQzNQLEtBQUssRUFBRXJJLEdBQUcsQ0FBQztNQUVqRSxJQUFJdEosTUFBTSxDQUFDUSxJQUFJLENBQUNvakIsYUFBYSxDQUFDLENBQUM3aUIsTUFBTSxFQUFFO1FBQ3JDLE1BQU00USxLQUFLLENBQUM4QyxPQUFPLENBQUNuTCxHQUFHLENBQUMwSSxHQUFHLEVBQUU0UixhQUFhLENBQUM7TUFDN0M7TUFFQSxJQUFJLENBQUNqUyxLQUFLLENBQUN1QixNQUFNLEVBQUU7UUFDakI7TUFDRjs7TUFFQTtNQUNBdkIsS0FBSyxDQUFDMEUsT0FBTyxDQUFDb0wsTUFBTSxDQUFDcUMsT0FBTyxFQUFFLENBQUMsQ0FBQztNQUVoQyxNQUFNQyxPQUFPLEdBQUdwaUIsZUFBZSxDQUFDNmYsbUJBQW1CLENBQ2pEN1AsS0FBSyxDQUFDdUIsTUFBTSxDQUFDMkYsYUFBYSxDQUFDO1FBQUNqRCxTQUFTLEVBQUVqRSxLQUFLLENBQUNpRTtNQUFTLENBQUMsQ0FBQyxFQUN4RGpFLEtBQUssQ0FBQzBFLE9BQU8sRUFDYi9NLEdBQ0YsQ0FBQztNQUVELElBQUl3YSxPQUFPLEtBQUtDLE9BQU8sRUFBRTtRQUN2QixJQUFJbFAsSUFBSSxHQUFHbEQsS0FBSyxDQUFDMEUsT0FBTyxDQUFDME4sT0FBTyxHQUFHLENBQUMsQ0FBQztRQUNyQyxJQUFJbFAsSUFBSSxFQUFFO1VBQ1JBLElBQUksR0FBR0EsSUFBSSxDQUFDN0MsR0FBRztRQUNqQixDQUFDLE1BQU07VUFDTDZDLElBQUksR0FBRyxJQUFJO1FBQ2I7UUFFQWxELEtBQUssQ0FBQytDLFdBQVcsS0FBSSxNQUFNL0MsS0FBSyxDQUFDK0MsV0FBVyxDQUFDcEwsR0FBRyxDQUFDMEksR0FBRyxFQUFFNkMsSUFBSSxDQUFDO01BQzdEO0lBQ0YsQ0FBQztJQUVELE1BQU1pTixTQUFTLEdBQUc7TUFDaEJrQyxZQUFZQSxDQUFDL0IsTUFBTSxFQUFFelIsS0FBSyxFQUFFMUgsR0FBRyxFQUFFO1FBQy9CLElBQUksT0FBT0EsR0FBRyxLQUFLLFFBQVEsSUFBSWxLLE1BQU0sQ0FBQzBFLElBQUksQ0FBQ3dGLEdBQUcsRUFBRSxPQUFPLENBQUMsRUFBRTtVQUN4RCxJQUFJQSxHQUFHLENBQUM5QixLQUFLLEtBQUssTUFBTSxFQUFFO1lBQ3hCLE1BQU1zSixjQUFjLENBQ2xCLHlEQUF5RCxHQUN6RCx3QkFBd0IsRUFDeEI7Y0FBQ0U7WUFBSyxDQUNSLENBQUM7VUFDSDtRQUNGLENBQUMsTUFBTSxJQUFJMUgsR0FBRyxLQUFLLElBQUksRUFBRTtVQUN2QixNQUFNd0gsY0FBYyxDQUFDLCtCQUErQixFQUFFO1lBQUNFO1VBQUssQ0FBQyxDQUFDO1FBQ2hFO1FBRUF5UixNQUFNLENBQUN6UixLQUFLLENBQUMsR0FBRyxJQUFJeVQsSUFBSSxDQUFDLENBQUM7TUFDNUIsQ0FBQztNQUNEQyxJQUFJQSxDQUFDakMsTUFBTSxFQUFFelIsS0FBSyxFQUFFMUgsR0FBRyxFQUFFO1FBQ3ZCLElBQUksT0FBT0EsR0FBRyxLQUFLLFFBQVEsRUFBRTtVQUMzQixNQUFNd0gsY0FBYyxDQUFDLHdDQUF3QyxFQUFFO1lBQUNFO1VBQUssQ0FBQyxDQUFDO1FBQ3pFO1FBRUEsSUFBSUEsS0FBSyxJQUFJeVIsTUFBTSxFQUFFO1VBQ25CLElBQUksT0FBT0EsTUFBTSxDQUFDelIsS0FBSyxDQUFDLEtBQUssUUFBUSxFQUFFO1lBQ3JDLE1BQU1GLGNBQWMsQ0FDbEIsMENBQTBDLEVBQzFDO2NBQUNFO1lBQUssQ0FDUixDQUFDO1VBQ0g7VUFFQXlSLE1BQU0sQ0FBQ3pSLEtBQUssQ0FBQyxJQUFJMUgsR0FBRztRQUN0QixDQUFDLE1BQU07VUFDTG1aLE1BQU0sQ0FBQ3pSLEtBQUssQ0FBQyxHQUFHMUgsR0FBRztRQUNyQjtNQUNGLENBQUM7TUFDRHFiLElBQUlBLENBQUNsQyxNQUFNLEVBQUV6UixLQUFLLEVBQUUxSCxHQUFHLEVBQUU7UUFDdkIsSUFBSSxPQUFPQSxHQUFHLEtBQUssUUFBUSxFQUFFO1VBQzNCLE1BQU13SCxjQUFjLENBQUMsd0NBQXdDLEVBQUU7WUFBQ0U7VUFBSyxDQUFDLENBQUM7UUFDekU7UUFFQSxJQUFJQSxLQUFLLElBQUl5UixNQUFNLEVBQUU7VUFDbkIsSUFBSSxPQUFPQSxNQUFNLENBQUN6UixLQUFLLENBQUMsS0FBSyxRQUFRLEVBQUU7WUFDckMsTUFBTUYsY0FBYyxDQUNsQiwwQ0FBMEMsRUFDMUM7Y0FBQ0U7WUFBSyxDQUNSLENBQUM7VUFDSDtVQUVBLElBQUl5UixNQUFNLENBQUN6UixLQUFLLENBQUMsR0FBRzFILEdBQUcsRUFBRTtZQUN2Qm1aLE1BQU0sQ0FBQ3pSLEtBQUssQ0FBQyxHQUFHMUgsR0FBRztVQUNyQjtRQUNGLENBQUMsTUFBTTtVQUNMbVosTUFBTSxDQUFDelIsS0FBSyxDQUFDLEdBQUcxSCxHQUFHO1FBQ3JCO01BQ0YsQ0FBQztNQUNEc2IsSUFBSUEsQ0FBQ25DLE1BQU0sRUFBRXpSLEtBQUssRUFBRTFILEdBQUcsRUFBRTtRQUN2QixJQUFJLE9BQU9BLEdBQUcsS0FBSyxRQUFRLEVBQUU7VUFDM0IsTUFBTXdILGNBQWMsQ0FBQyx3Q0FBd0MsRUFBRTtZQUFDRTtVQUFLLENBQUMsQ0FBQztRQUN6RTtRQUVBLElBQUlBLEtBQUssSUFBSXlSLE1BQU0sRUFBRTtVQUNuQixJQUFJLE9BQU9BLE1BQU0sQ0FBQ3pSLEtBQUssQ0FBQyxLQUFLLFFBQVEsRUFBRTtZQUNyQyxNQUFNRixjQUFjLENBQ2xCLDBDQUEwQyxFQUMxQztjQUFDRTtZQUFLLENBQ1IsQ0FBQztVQUNIO1VBRUEsSUFBSXlSLE1BQU0sQ0FBQ3pSLEtBQUssQ0FBQyxHQUFHMUgsR0FBRyxFQUFFO1lBQ3ZCbVosTUFBTSxDQUFDelIsS0FBSyxDQUFDLEdBQUcxSCxHQUFHO1VBQ3JCO1FBQ0YsQ0FBQyxNQUFNO1VBQ0xtWixNQUFNLENBQUN6UixLQUFLLENBQUMsR0FBRzFILEdBQUc7UUFDckI7TUFDRixDQUFDO01BQ0R1YixJQUFJQSxDQUFDcEMsTUFBTSxFQUFFelIsS0FBSyxFQUFFMUgsR0FBRyxFQUFFO1FBQ3ZCLElBQUksT0FBT0EsR0FBRyxLQUFLLFFBQVEsRUFBRTtVQUMzQixNQUFNd0gsY0FBYyxDQUFDLHdDQUF3QyxFQUFFO1lBQUNFO1VBQUssQ0FBQyxDQUFDO1FBQ3pFO1FBRUEsSUFBSUEsS0FBSyxJQUFJeVIsTUFBTSxFQUFFO1VBQ25CLElBQUksT0FBT0EsTUFBTSxDQUFDelIsS0FBSyxDQUFDLEtBQUssUUFBUSxFQUFFO1lBQ3JDLE1BQU1GLGNBQWMsQ0FDbEIsMENBQTBDLEVBQzFDO2NBQUNFO1lBQUssQ0FDUixDQUFDO1VBQ0g7VUFFQXlSLE1BQU0sQ0FBQ3pSLEtBQUssQ0FBQyxJQUFJMUgsR0FBRztRQUN0QixDQUFDLE1BQU07VUFDTG1aLE1BQU0sQ0FBQ3pSLEtBQUssQ0FBQyxHQUFHLENBQUM7UUFDbkI7TUFDRixDQUFDO01BQ0Q4VCxPQUFPQSxDQUFDckMsTUFBTSxFQUFFelIsS0FBSyxFQUFFMUgsR0FBRyxFQUFFaVosT0FBTyxFQUFFelksR0FBRyxFQUFFO1FBQ3hDO1FBQ0EsSUFBSXlZLE9BQU8sS0FBS2paLEdBQUcsRUFBRTtVQUNuQixNQUFNd0gsY0FBYyxDQUFDLHdDQUF3QyxFQUFFO1lBQUNFO1VBQUssQ0FBQyxDQUFDO1FBQ3pFO1FBRUEsSUFBSXlSLE1BQU0sS0FBSyxJQUFJLEVBQUU7VUFDbkIsTUFBTTNSLGNBQWMsQ0FBQyw4QkFBOEIsRUFBRTtZQUFDRTtVQUFLLENBQUMsQ0FBQztRQUMvRDtRQUVBLElBQUksT0FBTzFILEdBQUcsS0FBSyxRQUFRLEVBQUU7VUFDM0IsTUFBTXdILGNBQWMsQ0FBQyxpQ0FBaUMsRUFBRTtZQUFDRTtVQUFLLENBQUMsQ0FBQztRQUNsRTtRQUVBLElBQUkxSCxHQUFHLENBQUN6RyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUU7VUFDdEI7VUFDQTtVQUNBLE1BQU1pTyxjQUFjLENBQ2xCLG1FQUFtRSxFQUNuRTtZQUFDRTtVQUFLLENBQ1IsQ0FBQztRQUNIO1FBRUEsSUFBSXlSLE1BQU0sS0FBS3pmLFNBQVMsRUFBRTtVQUN4QjtRQUNGO1FBRUEsTUFBTWtQLE1BQU0sR0FBR3VRLE1BQU0sQ0FBQ3pSLEtBQUssQ0FBQztRQUU1QixPQUFPeVIsTUFBTSxDQUFDelIsS0FBSyxDQUFDO1FBRXBCLE1BQU13UixRQUFRLEdBQUdsWixHQUFHLENBQUN0SixLQUFLLENBQUMsR0FBRyxDQUFDO1FBQy9CLE1BQU0ra0IsT0FBTyxHQUFHckMsYUFBYSxDQUFDNVksR0FBRyxFQUFFMFksUUFBUSxFQUFFO1VBQUNHLFdBQVcsRUFBRTtRQUFJLENBQUMsQ0FBQztRQUVqRSxJQUFJb0MsT0FBTyxLQUFLLElBQUksRUFBRTtVQUNwQixNQUFNalUsY0FBYyxDQUFDLDhCQUE4QixFQUFFO1lBQUNFO1VBQUssQ0FBQyxDQUFDO1FBQy9EO1FBRUErVCxPQUFPLENBQUN2QyxRQUFRLENBQUNNLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRzVRLE1BQU07TUFDbEMsQ0FBQztNQUNEeFIsSUFBSUEsQ0FBQytoQixNQUFNLEVBQUV6UixLQUFLLEVBQUUxSCxHQUFHLEVBQUU7UUFDdkIsSUFBSW1aLE1BQU0sS0FBS2ppQixNQUFNLENBQUNpaUIsTUFBTSxDQUFDLEVBQUU7VUFBRTtVQUMvQixNQUFNcGdCLEtBQUssR0FBR3lPLGNBQWMsQ0FDMUIseUNBQXlDLEVBQ3pDO1lBQUNFO1VBQUssQ0FDUixDQUFDO1VBQ0QzTyxLQUFLLENBQUNFLGdCQUFnQixHQUFHLElBQUk7VUFDN0IsTUFBTUYsS0FBSztRQUNiO1FBRUEsSUFBSW9nQixNQUFNLEtBQUssSUFBSSxFQUFFO1VBQ25CLE1BQU1wZ0IsS0FBSyxHQUFHeU8sY0FBYyxDQUFDLDZCQUE2QixFQUFFO1lBQUNFO1VBQUssQ0FBQyxDQUFDO1VBQ3BFM08sS0FBSyxDQUFDRSxnQkFBZ0IsR0FBRyxJQUFJO1VBQzdCLE1BQU1GLEtBQUs7UUFDYjtRQUVBd1ksd0JBQXdCLENBQUN2UixHQUFHLENBQUM7UUFFN0JtWixNQUFNLENBQUN6UixLQUFLLENBQUMsR0FBRzFILEdBQUc7TUFDckIsQ0FBQztNQUNEMGIsWUFBWUEsQ0FBQ3ZDLE1BQU0sRUFBRXpSLEtBQUssRUFBRTFILEdBQUcsRUFBRTtRQUMvQjtNQUFBLENBQ0Q7TUFDRDNJLE1BQU1BLENBQUM4aEIsTUFBTSxFQUFFelIsS0FBSyxFQUFFMUgsR0FBRyxFQUFFO1FBQ3pCLElBQUltWixNQUFNLEtBQUt6ZixTQUFTLEVBQUU7VUFDeEIsSUFBSXlmLE1BQU0sWUFBWTNiLEtBQUssRUFBRTtZQUMzQixJQUFJa0ssS0FBSyxJQUFJeVIsTUFBTSxFQUFFO2NBQ25CQSxNQUFNLENBQUN6UixLQUFLLENBQUMsR0FBRyxJQUFJO1lBQ3RCO1VBQ0YsQ0FBQyxNQUFNO1lBQ0wsT0FBT3lSLE1BQU0sQ0FBQ3pSLEtBQUssQ0FBQztVQUN0QjtRQUNGO01BQ0YsQ0FBQztNQUNEaVUsS0FBS0EsQ0FBQ3hDLE1BQU0sRUFBRXpSLEtBQUssRUFBRTFILEdBQUcsRUFBRTtRQUN4QixJQUFJbVosTUFBTSxDQUFDelIsS0FBSyxDQUFDLEtBQUtoTyxTQUFTLEVBQUU7VUFDL0J5ZixNQUFNLENBQUN6UixLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ3BCO1FBRUEsSUFBSSxFQUFFeVIsTUFBTSxDQUFDelIsS0FBSyxDQUFDLFlBQVlsSyxLQUFLLENBQUMsRUFBRTtVQUNyQyxNQUFNZ0ssY0FBYyxDQUFDLDBDQUEwQyxFQUFFO1lBQUNFO1VBQUssQ0FBQyxDQUFDO1FBQzNFO1FBRUEsSUFBSSxFQUFFMUgsR0FBRyxJQUFJQSxHQUFHLENBQUM0YixLQUFLLENBQUMsRUFBRTtVQUN2QjtVQUNBckssd0JBQXdCLENBQUN2UixHQUFHLENBQUM7VUFFN0JtWixNQUFNLENBQUN6UixLQUFLLENBQUMsQ0FBQzFDLElBQUksQ0FBQ2hGLEdBQUcsQ0FBQztVQUV2QjtRQUNGOztRQUVBO1FBQ0EsTUFBTTZiLE1BQU0sR0FBRzdiLEdBQUcsQ0FBQzRiLEtBQUs7UUFDeEIsSUFBSSxFQUFFQyxNQUFNLFlBQVlyZSxLQUFLLENBQUMsRUFBRTtVQUM5QixNQUFNZ0ssY0FBYyxDQUFDLHdCQUF3QixFQUFFO1lBQUNFO1VBQUssQ0FBQyxDQUFDO1FBQ3pEO1FBRUE2Six3QkFBd0IsQ0FBQ3NLLE1BQU0sQ0FBQzs7UUFFaEM7UUFDQSxJQUFJQyxRQUFRLEdBQUdwaUIsU0FBUztRQUN4QixJQUFJLFdBQVcsSUFBSXNHLEdBQUcsRUFBRTtVQUN0QixJQUFJLE9BQU9BLEdBQUcsQ0FBQytiLFNBQVMsS0FBSyxRQUFRLEVBQUU7WUFDckMsTUFBTXZVLGNBQWMsQ0FBQyxtQ0FBbUMsRUFBRTtjQUFDRTtZQUFLLENBQUMsQ0FBQztVQUNwRTs7VUFFQTtVQUNBLElBQUkxSCxHQUFHLENBQUMrYixTQUFTLEdBQUcsQ0FBQyxFQUFFO1lBQ3JCLE1BQU12VSxjQUFjLENBQ2xCLDZDQUE2QyxFQUM3QztjQUFDRTtZQUFLLENBQ1IsQ0FBQztVQUNIO1VBRUFvVSxRQUFRLEdBQUc5YixHQUFHLENBQUMrYixTQUFTO1FBQzFCOztRQUVBO1FBQ0EsSUFBSS9VLEtBQUssR0FBR3ROLFNBQVM7UUFDckIsSUFBSSxRQUFRLElBQUlzRyxHQUFHLEVBQUU7VUFDbkIsSUFBSSxPQUFPQSxHQUFHLENBQUNnYyxNQUFNLEtBQUssUUFBUSxFQUFFO1lBQ2xDLE1BQU14VSxjQUFjLENBQUMsZ0NBQWdDLEVBQUU7Y0FBQ0U7WUFBSyxDQUFDLENBQUM7VUFDakU7O1VBRUE7VUFDQVYsS0FBSyxHQUFHaEgsR0FBRyxDQUFDZ2MsTUFBTTtRQUNwQjs7UUFFQTtRQUNBLElBQUlDLFlBQVksR0FBR3ZpQixTQUFTO1FBQzVCLElBQUlzRyxHQUFHLENBQUNrYyxLQUFLLEVBQUU7VUFDYixJQUFJbFYsS0FBSyxLQUFLdE4sU0FBUyxFQUFFO1lBQ3ZCLE1BQU04TixjQUFjLENBQUMscUNBQXFDLEVBQUU7Y0FBQ0U7WUFBSyxDQUFDLENBQUM7VUFDdEU7O1VBRUE7VUFDQTtVQUNBO1VBQ0E7VUFDQXVVLFlBQVksR0FBRyxJQUFJNWxCLFNBQVMsQ0FBQ3NFLE1BQU0sQ0FBQ3FGLEdBQUcsQ0FBQ2tjLEtBQUssQ0FBQyxDQUFDbk0sYUFBYSxDQUFDLENBQUM7VUFFOUQ4TCxNQUFNLENBQUN2aEIsT0FBTyxDQUFDOEosT0FBTyxJQUFJO1lBQ3hCLElBQUl2TCxlQUFlLENBQUN3RixFQUFFLENBQUNDLEtBQUssQ0FBQzhGLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRTtjQUMzQyxNQUFNb0QsY0FBYyxDQUNsQiw4REFBOEQsR0FDOUQsU0FBUyxFQUNUO2dCQUFDRTtjQUFLLENBQ1IsQ0FBQztZQUNIO1VBQ0YsQ0FBQyxDQUFDO1FBQ0o7O1FBRUE7UUFDQSxJQUFJb1UsUUFBUSxLQUFLcGlCLFNBQVMsRUFBRTtVQUMxQm1pQixNQUFNLENBQUN2aEIsT0FBTyxDQUFDOEosT0FBTyxJQUFJO1lBQ3hCK1UsTUFBTSxDQUFDelIsS0FBSyxDQUFDLENBQUMxQyxJQUFJLENBQUNaLE9BQU8sQ0FBQztVQUM3QixDQUFDLENBQUM7UUFDSixDQUFDLE1BQU07VUFDTCxNQUFNK1gsZUFBZSxHQUFHLENBQUNMLFFBQVEsRUFBRSxDQUFDLENBQUM7VUFFckNELE1BQU0sQ0FBQ3ZoQixPQUFPLENBQUM4SixPQUFPLElBQUk7WUFDeEIrWCxlQUFlLENBQUNuWCxJQUFJLENBQUNaLE9BQU8sQ0FBQztVQUMvQixDQUFDLENBQUM7VUFFRitVLE1BQU0sQ0FBQ3pSLEtBQUssQ0FBQyxDQUFDaVIsTUFBTSxDQUFDLEdBQUd3RCxlQUFlLENBQUM7UUFDMUM7O1FBRUE7UUFDQSxJQUFJRixZQUFZLEVBQUU7VUFDaEI5QyxNQUFNLENBQUN6UixLQUFLLENBQUMsQ0FBQ3VCLElBQUksQ0FBQ2dULFlBQVksQ0FBQztRQUNsQzs7UUFFQTtRQUNBLElBQUlqVixLQUFLLEtBQUt0TixTQUFTLEVBQUU7VUFDdkIsSUFBSXNOLEtBQUssS0FBSyxDQUFDLEVBQUU7WUFDZm1TLE1BQU0sQ0FBQ3pSLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO1VBQ3RCLENBQUMsTUFBTSxJQUFJVixLQUFLLEdBQUcsQ0FBQyxFQUFFO1lBQ3BCbVMsTUFBTSxDQUFDelIsS0FBSyxDQUFDLEdBQUd5UixNQUFNLENBQUN6UixLQUFLLENBQUMsQ0FBQ1YsS0FBSyxDQUFDQSxLQUFLLENBQUM7VUFDNUMsQ0FBQyxNQUFNO1lBQ0xtUyxNQUFNLENBQUN6UixLQUFLLENBQUMsR0FBR3lSLE1BQU0sQ0FBQ3pSLEtBQUssQ0FBQyxDQUFDVixLQUFLLENBQUMsQ0FBQyxFQUFFQSxLQUFLLENBQUM7VUFDL0M7UUFDRjtNQUNGLENBQUM7TUFDRG9WLFFBQVFBLENBQUNqRCxNQUFNLEVBQUV6UixLQUFLLEVBQUUxSCxHQUFHLEVBQUU7UUFDM0IsSUFBSSxFQUFFLE9BQU9BLEdBQUcsS0FBSyxRQUFRLElBQUlBLEdBQUcsWUFBWXhDLEtBQUssQ0FBQyxFQUFFO1VBQ3RELE1BQU1nSyxjQUFjLENBQUMsbURBQW1ELENBQUM7UUFDM0U7UUFFQStKLHdCQUF3QixDQUFDdlIsR0FBRyxDQUFDO1FBRTdCLE1BQU02YixNQUFNLEdBQUcxQyxNQUFNLENBQUN6UixLQUFLLENBQUM7UUFFNUIsSUFBSW1VLE1BQU0sS0FBS25pQixTQUFTLEVBQUU7VUFDeEJ5ZixNQUFNLENBQUN6UixLQUFLLENBQUMsR0FBRzFILEdBQUc7UUFDckIsQ0FBQyxNQUFNLElBQUksRUFBRTZiLE1BQU0sWUFBWXJlLEtBQUssQ0FBQyxFQUFFO1VBQ3JDLE1BQU1nSyxjQUFjLENBQ2xCLDZDQUE2QyxFQUM3QztZQUFDRTtVQUFLLENBQ1IsQ0FBQztRQUNILENBQUMsTUFBTTtVQUNMbVUsTUFBTSxDQUFDN1csSUFBSSxDQUFDLEdBQUdoRixHQUFHLENBQUM7UUFDckI7TUFDRixDQUFDO01BQ0RxYyxTQUFTQSxDQUFDbEQsTUFBTSxFQUFFelIsS0FBSyxFQUFFMUgsR0FBRyxFQUFFO1FBQzVCLElBQUlzYyxNQUFNLEdBQUcsS0FBSztRQUVsQixJQUFJLE9BQU90YyxHQUFHLEtBQUssUUFBUSxFQUFFO1VBQzNCO1VBQ0EsTUFBTXRJLElBQUksR0FBR1IsTUFBTSxDQUFDUSxJQUFJLENBQUNzSSxHQUFHLENBQUM7VUFDN0IsSUFBSXRJLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxPQUFPLEVBQUU7WUFDdkI0a0IsTUFBTSxHQUFHLElBQUk7VUFDZjtRQUNGO1FBRUEsTUFBTUMsTUFBTSxHQUFHRCxNQUFNLEdBQUd0YyxHQUFHLENBQUM0YixLQUFLLEdBQUcsQ0FBQzViLEdBQUcsQ0FBQztRQUV6Q3VSLHdCQUF3QixDQUFDZ0wsTUFBTSxDQUFDO1FBRWhDLE1BQU1DLEtBQUssR0FBR3JELE1BQU0sQ0FBQ3pSLEtBQUssQ0FBQztRQUMzQixJQUFJOFUsS0FBSyxLQUFLOWlCLFNBQVMsRUFBRTtVQUN2QnlmLE1BQU0sQ0FBQ3pSLEtBQUssQ0FBQyxHQUFHNlUsTUFBTTtRQUN4QixDQUFDLE1BQU0sSUFBSSxFQUFFQyxLQUFLLFlBQVloZixLQUFLLENBQUMsRUFBRTtVQUNwQyxNQUFNZ0ssY0FBYyxDQUNsQiw4Q0FBOEMsRUFDOUM7WUFBQ0U7VUFBSyxDQUNSLENBQUM7UUFDSCxDQUFDLE1BQU07VUFDTDZVLE1BQU0sQ0FBQ2ppQixPQUFPLENBQUN3QixLQUFLLElBQUk7WUFDdEIsSUFBSTBnQixLQUFLLENBQUM3a0IsSUFBSSxDQUFDeU0sT0FBTyxJQUFJdkwsZUFBZSxDQUFDd0YsRUFBRSxDQUFDc0csTUFBTSxDQUFDN0ksS0FBSyxFQUFFc0ksT0FBTyxDQUFDLENBQUMsRUFBRTtjQUNwRTtZQUNGO1lBRUFvWSxLQUFLLENBQUN4WCxJQUFJLENBQUNsSixLQUFLLENBQUM7VUFDbkIsQ0FBQyxDQUFDO1FBQ0o7TUFDRixDQUFDO01BQ0QyZ0IsSUFBSUEsQ0FBQ3RELE1BQU0sRUFBRXpSLEtBQUssRUFBRTFILEdBQUcsRUFBRTtRQUN2QixJQUFJbVosTUFBTSxLQUFLemYsU0FBUyxFQUFFO1VBQ3hCO1FBQ0Y7UUFFQSxNQUFNZ2pCLEtBQUssR0FBR3ZELE1BQU0sQ0FBQ3pSLEtBQUssQ0FBQztRQUUzQixJQUFJZ1YsS0FBSyxLQUFLaGpCLFNBQVMsRUFBRTtVQUN2QjtRQUNGO1FBRUEsSUFBSSxFQUFFZ2pCLEtBQUssWUFBWWxmLEtBQUssQ0FBQyxFQUFFO1VBQzdCLE1BQU1nSyxjQUFjLENBQUMseUNBQXlDLEVBQUU7WUFBQ0U7VUFBSyxDQUFDLENBQUM7UUFDMUU7UUFFQSxJQUFJLE9BQU8xSCxHQUFHLEtBQUssUUFBUSxJQUFJQSxHQUFHLEdBQUcsQ0FBQyxFQUFFO1VBQ3RDMGMsS0FBSyxDQUFDL0QsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDcEIsQ0FBQyxNQUFNO1VBQ0wrRCxLQUFLLENBQUNsRCxHQUFHLENBQUMsQ0FBQztRQUNiO01BQ0YsQ0FBQztNQUNEbUQsS0FBS0EsQ0FBQ3hELE1BQU0sRUFBRXpSLEtBQUssRUFBRTFILEdBQUcsRUFBRTtRQUN4QixJQUFJbVosTUFBTSxLQUFLemYsU0FBUyxFQUFFO1VBQ3hCO1FBQ0Y7UUFFQSxNQUFNa2pCLE1BQU0sR0FBR3pELE1BQU0sQ0FBQ3pSLEtBQUssQ0FBQztRQUM1QixJQUFJa1YsTUFBTSxLQUFLbGpCLFNBQVMsRUFBRTtVQUN4QjtRQUNGO1FBRUEsSUFBSSxFQUFFa2pCLE1BQU0sWUFBWXBmLEtBQUssQ0FBQyxFQUFFO1VBQzlCLE1BQU1nSyxjQUFjLENBQ2xCLGtEQUFrRCxFQUNsRDtZQUFDRTtVQUFLLENBQ1IsQ0FBQztRQUNIO1FBRUEsSUFBSW1WLEdBQUc7UUFDUCxJQUFJN2MsR0FBRyxJQUFJLElBQUksSUFBSSxPQUFPQSxHQUFHLEtBQUssUUFBUSxJQUFJLEVBQUVBLEdBQUcsWUFBWXhDLEtBQUssQ0FBQyxFQUFFO1VBQ3JFO1VBQ0E7VUFDQTtVQUNBOztVQUVBO1VBQ0E7VUFDQTtVQUNBO1VBQ0EsTUFBTXpELE9BQU8sR0FBRyxJQUFJMUQsU0FBUyxDQUFDUyxPQUFPLENBQUNrSixHQUFHLENBQUM7VUFFMUM2YyxHQUFHLEdBQUdELE1BQU0sQ0FBQ2ptQixNQUFNLENBQUN5TixPQUFPLElBQUksQ0FBQ3JLLE9BQU8sQ0FBQ2IsZUFBZSxDQUFDa0wsT0FBTyxDQUFDLENBQUNqTCxNQUFNLENBQUM7UUFDMUUsQ0FBQyxNQUFNO1VBQ0wwakIsR0FBRyxHQUFHRCxNQUFNLENBQUNqbUIsTUFBTSxDQUFDeU4sT0FBTyxJQUFJLENBQUN2TCxlQUFlLENBQUN3RixFQUFFLENBQUNzRyxNQUFNLENBQUNQLE9BQU8sRUFBRXBFLEdBQUcsQ0FBQyxDQUFDO1FBQzFFO1FBRUFtWixNQUFNLENBQUN6UixLQUFLLENBQUMsR0FBR21WLEdBQUc7TUFDckIsQ0FBQztNQUNEQyxRQUFRQSxDQUFDM0QsTUFBTSxFQUFFelIsS0FBSyxFQUFFMUgsR0FBRyxFQUFFO1FBQzNCLElBQUksRUFBRSxPQUFPQSxHQUFHLEtBQUssUUFBUSxJQUFJQSxHQUFHLFlBQVl4QyxLQUFLLENBQUMsRUFBRTtVQUN0RCxNQUFNZ0ssY0FBYyxDQUNsQixtREFBbUQsRUFDbkQ7WUFBQ0U7VUFBSyxDQUNSLENBQUM7UUFDSDtRQUVBLElBQUl5UixNQUFNLEtBQUt6ZixTQUFTLEVBQUU7VUFDeEI7UUFDRjtRQUVBLE1BQU1rakIsTUFBTSxHQUFHekQsTUFBTSxDQUFDelIsS0FBSyxDQUFDO1FBRTVCLElBQUlrVixNQUFNLEtBQUtsakIsU0FBUyxFQUFFO1VBQ3hCO1FBQ0Y7UUFFQSxJQUFJLEVBQUVrakIsTUFBTSxZQUFZcGYsS0FBSyxDQUFDLEVBQUU7VUFDOUIsTUFBTWdLLGNBQWMsQ0FDbEIsa0RBQWtELEVBQ2xEO1lBQUNFO1VBQUssQ0FDUixDQUFDO1FBQ0g7UUFFQXlSLE1BQU0sQ0FBQ3pSLEtBQUssQ0FBQyxHQUFHa1YsTUFBTSxDQUFDam1CLE1BQU0sQ0FBQ2lTLE1BQU0sSUFDbEMsQ0FBQzVJLEdBQUcsQ0FBQ3JJLElBQUksQ0FBQ3lNLE9BQU8sSUFBSXZMLGVBQWUsQ0FBQ3dGLEVBQUUsQ0FBQ3NHLE1BQU0sQ0FBQ2lFLE1BQU0sRUFBRXhFLE9BQU8sQ0FBQyxDQUNqRSxDQUFDO01BQ0gsQ0FBQztNQUNEMlksSUFBSUEsQ0FBQzVELE1BQU0sRUFBRXpSLEtBQUssRUFBRTFILEdBQUcsRUFBRTtRQUN2QjtRQUNBO1FBQ0EsTUFBTXdILGNBQWMsQ0FBQyx1QkFBdUIsRUFBRTtVQUFDRTtRQUFLLENBQUMsQ0FBQztNQUN4RCxDQUFDO01BQ0RzVixFQUFFQSxDQUFBLEVBQUc7UUFDSDtRQUNBO1FBQ0E7UUFDQTtNQUFBO0lBRUosQ0FBQztJQUVELE1BQU16RCxtQkFBbUIsR0FBRztNQUMxQmtELElBQUksRUFBRSxJQUFJO01BQ1ZFLEtBQUssRUFBRSxJQUFJO01BQ1hHLFFBQVEsRUFBRSxJQUFJO01BQ2R0QixPQUFPLEVBQUUsSUFBSTtNQUNibmtCLE1BQU0sRUFBRTtJQUNWLENBQUM7O0lBRUQ7SUFDQTtJQUNBO0lBQ0EsTUFBTTRsQixjQUFjLEdBQUc7TUFDckJDLENBQUMsRUFBRSxrQkFBa0I7TUFDckIsR0FBRyxFQUFFLGVBQWU7TUFDcEIsSUFBSSxFQUFFO0lBQ1IsQ0FBQzs7SUFFRDtJQUNBLFNBQVMzTCx3QkFBd0JBLENBQUMvUSxHQUFHLEVBQUU7TUFDckMsSUFBSUEsR0FBRyxJQUFJLE9BQU9BLEdBQUcsS0FBSyxRQUFRLEVBQUU7UUFDbENnRyxJQUFJLENBQUNDLFNBQVMsQ0FBQ2pHLEdBQUcsRUFBRSxDQUFDM0UsR0FBRyxFQUFFQyxLQUFLLEtBQUs7VUFDbENxaEIsc0JBQXNCLENBQUN0aEIsR0FBRyxDQUFDO1VBQzNCLE9BQU9DLEtBQUs7UUFDZCxDQUFDLENBQUM7TUFDSjtJQUNGO0lBRUEsU0FBU3FoQixzQkFBc0JBLENBQUN0aEIsR0FBRyxFQUFFO01BQ25DLElBQUl3SCxLQUFLO01BQ1QsSUFBSSxPQUFPeEgsR0FBRyxLQUFLLFFBQVEsS0FBS3dILEtBQUssR0FBR3hILEdBQUcsQ0FBQ3dILEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFO1FBQy9ELE1BQU1tRSxjQUFjLFFBQUEvUCxNQUFBLENBQVFvRSxHQUFHLGdCQUFBcEUsTUFBQSxDQUFhd2xCLGNBQWMsQ0FBQzVaLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUM7TUFDekU7SUFDRjs7SUFFQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0EsU0FBUytWLGFBQWFBLENBQUM1WSxHQUFHLEVBQUUwWSxRQUFRLEVBQWdCO01BQUEsSUFBZHpWLE9BQU8sR0FBQTdILFNBQUEsQ0FBQTNELE1BQUEsUUFBQTJELFNBQUEsUUFBQWxDLFNBQUEsR0FBQWtDLFNBQUEsTUFBRyxDQUFDLENBQUM7TUFDaEQsSUFBSXdoQixjQUFjLEdBQUcsS0FBSztNQUUxQixLQUFLLElBQUlybEIsQ0FBQyxHQUFHLENBQUMsRUFBRUEsQ0FBQyxHQUFHbWhCLFFBQVEsQ0FBQ2poQixNQUFNLEVBQUVGLENBQUMsRUFBRSxFQUFFO1FBQ3hDLE1BQU1zbEIsSUFBSSxHQUFHdGxCLENBQUMsS0FBS21oQixRQUFRLENBQUNqaEIsTUFBTSxHQUFHLENBQUM7UUFDdEMsSUFBSXFsQixPQUFPLEdBQUdwRSxRQUFRLENBQUNuaEIsQ0FBQyxDQUFDO1FBRXpCLElBQUksQ0FBQ3lFLFdBQVcsQ0FBQ2dFLEdBQUcsQ0FBQyxFQUFFO1VBQ3JCLElBQUlpRCxPQUFPLENBQUM2VixRQUFRLEVBQUU7WUFDcEIsT0FBTzVmLFNBQVM7VUFDbEI7VUFFQSxNQUFNWCxLQUFLLEdBQUd5TyxjQUFjLHlCQUFBL1AsTUFBQSxDQUNGNmxCLE9BQU8sb0JBQUE3bEIsTUFBQSxDQUFpQitJLEdBQUcsQ0FDckQsQ0FBQztVQUNEekgsS0FBSyxDQUFDRSxnQkFBZ0IsR0FBRyxJQUFJO1VBQzdCLE1BQU1GLEtBQUs7UUFDYjtRQUVBLElBQUl5SCxHQUFHLFlBQVloRCxLQUFLLEVBQUU7VUFDeEIsSUFBSWlHLE9BQU8sQ0FBQzRWLFdBQVcsRUFBRTtZQUN2QixPQUFPLElBQUk7VUFDYjtVQUVBLElBQUlpRSxPQUFPLEtBQUssR0FBRyxFQUFFO1lBQ25CLElBQUlGLGNBQWMsRUFBRTtjQUNsQixNQUFNNVYsY0FBYyxDQUFDLDJDQUEyQyxDQUFDO1lBQ25FO1lBRUEsSUFBSSxDQUFDL0QsT0FBTyxDQUFDUixZQUFZLElBQUksQ0FBQ1EsT0FBTyxDQUFDUixZQUFZLENBQUNoTCxNQUFNLEVBQUU7Y0FDekQsTUFBTXVQLGNBQWMsQ0FDbEIsaUVBQWlFLEdBQ2pFLE9BQ0YsQ0FBQztZQUNIO1lBRUE4VixPQUFPLEdBQUc3WixPQUFPLENBQUNSLFlBQVksQ0FBQyxDQUFDLENBQUM7WUFDakNtYSxjQUFjLEdBQUcsSUFBSTtVQUN2QixDQUFDLE1BQU0sSUFBSXJuQixZQUFZLENBQUN1bkIsT0FBTyxDQUFDLEVBQUU7WUFDaENBLE9BQU8sR0FBR0MsUUFBUSxDQUFDRCxPQUFPLENBQUM7VUFDN0IsQ0FBQyxNQUFNO1lBQ0wsSUFBSTdaLE9BQU8sQ0FBQzZWLFFBQVEsRUFBRTtjQUNwQixPQUFPNWYsU0FBUztZQUNsQjtZQUVBLE1BQU04TixjQUFjLG1EQUFBL1AsTUFBQSxDQUNnQzZsQixPQUFPLE1BQzNELENBQUM7VUFDSDtVQUVBLElBQUlELElBQUksRUFBRTtZQUNSbkUsUUFBUSxDQUFDbmhCLENBQUMsQ0FBQyxHQUFHdWxCLE9BQU8sQ0FBQyxDQUFDO1VBQ3pCO1VBRUEsSUFBSTdaLE9BQU8sQ0FBQzZWLFFBQVEsSUFBSWdFLE9BQU8sSUFBSTljLEdBQUcsQ0FBQ3ZJLE1BQU0sRUFBRTtZQUM3QyxPQUFPeUIsU0FBUztVQUNsQjtVQUVBLE9BQU84RyxHQUFHLENBQUN2SSxNQUFNLEdBQUdxbEIsT0FBTyxFQUFFO1lBQzNCOWMsR0FBRyxDQUFDd0UsSUFBSSxDQUFDLElBQUksQ0FBQztVQUNoQjtVQUVBLElBQUksQ0FBQ3FZLElBQUksRUFBRTtZQUNULElBQUk3YyxHQUFHLENBQUN2SSxNQUFNLEtBQUtxbEIsT0FBTyxFQUFFO2NBQzFCOWMsR0FBRyxDQUFDd0UsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2QsQ0FBQyxNQUFNLElBQUksT0FBT3hFLEdBQUcsQ0FBQzhjLE9BQU8sQ0FBQyxLQUFLLFFBQVEsRUFBRTtjQUMzQyxNQUFNOVYsY0FBYyxDQUNsQix1QkFBQS9QLE1BQUEsQ0FBdUJ5aEIsUUFBUSxDQUFDbmhCLENBQUMsR0FBRyxDQUFDLENBQUMsd0JBQ3RDeU8sSUFBSSxDQUFDQyxTQUFTLENBQUNqRyxHQUFHLENBQUM4YyxPQUFPLENBQUMsQ0FDN0IsQ0FBQztZQUNIO1VBQ0Y7UUFDRixDQUFDLE1BQU07VUFDTEgsc0JBQXNCLENBQUNHLE9BQU8sQ0FBQztVQUUvQixJQUFJLEVBQUVBLE9BQU8sSUFBSTljLEdBQUcsQ0FBQyxFQUFFO1lBQ3JCLElBQUlpRCxPQUFPLENBQUM2VixRQUFRLEVBQUU7Y0FDcEIsT0FBTzVmLFNBQVM7WUFDbEI7WUFFQSxJQUFJLENBQUMyakIsSUFBSSxFQUFFO2NBQ1Q3YyxHQUFHLENBQUM4YyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDbkI7VUFDRjtRQUNGO1FBRUEsSUFBSUQsSUFBSSxFQUFFO1VBQ1IsT0FBTzdjLEdBQUc7UUFDWjtRQUVBQSxHQUFHLEdBQUdBLEdBQUcsQ0FBQzhjLE9BQU8sQ0FBQztNQUNwQjs7TUFFQTtJQUNGO0lBQUN2aEIsc0JBQUE7RUFBQSxTQUFBQyxXQUFBO0lBQUEsT0FBQUQsc0JBQUEsQ0FBQUMsV0FBQTtFQUFBO0VBQUFELHNCQUFBO0FBQUE7RUFBQUUsSUFBQTtFQUFBQyxLQUFBO0FBQUEsRzs7Ozs7Ozs7Ozs7Ozs7O0lDOTNFRHRHLE1BQU0sQ0FBQ3VHLE1BQU0sQ0FBQztNQUFDVSxPQUFPLEVBQUNBLENBQUEsS0FBSS9GO0lBQU8sQ0FBQyxDQUFDO0lBQUMsSUFBSStCLGVBQWU7SUFBQ2pELE1BQU0sQ0FBQ0MsSUFBSSxDQUFDLHVCQUF1QixFQUFDO01BQUNnSCxPQUFPQSxDQUFDMUcsQ0FBQyxFQUFDO1FBQUMwQyxlQUFlLEdBQUMxQyxDQUFDO01BQUE7SUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0lBQUMsSUFBSWtHLHVCQUF1QixFQUFDdkcsTUFBTSxFQUFDNEcsY0FBYztJQUFDOUcsTUFBTSxDQUFDQyxJQUFJLENBQUMsYUFBYSxFQUFDO01BQUN3Ryx1QkFBdUJBLENBQUNsRyxDQUFDLEVBQUM7UUFBQ2tHLHVCQUF1QixHQUFDbEcsQ0FBQztNQUFBLENBQUM7TUFBQ0wsTUFBTUEsQ0FBQ0ssQ0FBQyxFQUFDO1FBQUNMLE1BQU0sR0FBQ0ssQ0FBQztNQUFBLENBQUM7TUFBQ3VHLGNBQWNBLENBQUN2RyxDQUFDLEVBQUM7UUFBQ3VHLGNBQWMsR0FBQ3ZHLENBQUM7TUFBQTtJQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7SUFBQyxJQUFJQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNQSxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQU8zWCxNQUFNb25CLE9BQU8sR0FBRyxFQUFBQyxvQkFBQSxHQUFBdk4sT0FBTyxDQUFDLGVBQWUsQ0FBQyxjQUFBdU4sb0JBQUEsdUJBQXhCQSxvQkFBQSxDQUEwQkQsT0FBTyxLQUFJLE1BQU1FLFdBQVcsQ0FBQyxFQUFFOztJQUV6RTs7SUFFQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBOztJQUVBO0lBQ0E7SUFDQTtJQUNlLE1BQU01bUIsT0FBTyxDQUFDO01BQzNCb1QsV0FBV0EsQ0FBQzVPLFFBQVEsRUFBRXFpQixRQUFRLEVBQUU7UUFDOUI7UUFDQTtRQUNBO1FBQ0EsSUFBSSxDQUFDcGlCLE1BQU0sR0FBRyxDQUFDLENBQUM7UUFDaEI7UUFDQSxJQUFJLENBQUMwRyxZQUFZLEdBQUcsS0FBSztRQUN6QjtRQUNBLElBQUksQ0FBQ25CLFNBQVMsR0FBRyxLQUFLO1FBQ3RCO1FBQ0E7UUFDQTtRQUNBLElBQUksQ0FBQzhDLFNBQVMsR0FBRyxJQUFJO1FBQ3JCO1FBQ0E7UUFDQSxJQUFJLENBQUNuSyxpQkFBaUIsR0FBR0MsU0FBUztRQUNsQztRQUNBO1FBQ0E7UUFDQTtRQUNBLElBQUksQ0FBQ25CLFNBQVMsR0FBRyxJQUFJO1FBQ3JCLElBQUksQ0FBQ3FsQixXQUFXLEdBQUcsSUFBSSxDQUFDQyxnQkFBZ0IsQ0FBQ3ZpQixRQUFRLENBQUM7UUFDbEQ7UUFDQTtRQUNBO1FBQ0EsSUFBSSxDQUFDMEgsU0FBUyxHQUFHMmEsUUFBUTtNQUMzQjtNQUVBemtCLGVBQWVBLENBQUNzSCxHQUFHLEVBQUU7UUFDbkIsSUFBSUEsR0FBRyxLQUFLdEosTUFBTSxDQUFDc0osR0FBRyxDQUFDLEVBQUU7VUFDdkIsTUFBTTlDLEtBQUssQ0FBQyxrQ0FBa0MsQ0FBQztRQUNqRDtRQUVBLE9BQU8sSUFBSSxDQUFDa2dCLFdBQVcsQ0FBQ3BkLEdBQUcsQ0FBQztNQUM5QjtNQUVBK0osV0FBV0EsQ0FBQSxFQUFHO1FBQ1osT0FBTyxJQUFJLENBQUN0SSxZQUFZO01BQzFCO01BRUE2YixRQUFRQSxDQUFBLEVBQUc7UUFDVCxPQUFPLElBQUksQ0FBQ2hkLFNBQVM7TUFDdkI7TUFFQTNJLFFBQVFBLENBQUEsRUFBRztRQUNULE9BQU8sSUFBSSxDQUFDeUwsU0FBUztNQUN2Qjs7TUFFQTtNQUNBO01BQ0FpYSxnQkFBZ0JBLENBQUN2aUIsUUFBUSxFQUFFO1FBQ3pCO1FBQ0EsSUFBSUEsUUFBUSxZQUFZeUYsUUFBUSxFQUFFO1VBQ2hDLElBQUksQ0FBQzZDLFNBQVMsR0FBRyxLQUFLO1VBQ3RCLElBQUksQ0FBQ3JMLFNBQVMsR0FBRytDLFFBQVE7VUFDekIsSUFBSSxDQUFDdUYsZUFBZSxDQUFDLEVBQUUsQ0FBQztVQUV4QixPQUFPTCxHQUFHLEtBQUs7WUFBQ3JILE1BQU0sRUFBRSxDQUFDLENBQUNtQyxRQUFRLENBQUNkLElBQUksQ0FBQ2dHLEdBQUc7VUFBQyxDQUFDLENBQUM7UUFDaEQ7O1FBRUE7UUFDQSxJQUFJM0gsZUFBZSxDQUFDaVEsYUFBYSxDQUFDeE4sUUFBUSxDQUFDLEVBQUU7VUFDM0MsSUFBSSxDQUFDL0MsU0FBUyxHQUFHO1lBQUMyUSxHQUFHLEVBQUU1TjtVQUFRLENBQUM7VUFDaEMsSUFBSSxDQUFDdUYsZUFBZSxDQUFDLEtBQUssQ0FBQztVQUUzQixPQUFPTCxHQUFHLEtBQUs7WUFBQ3JILE1BQU0sRUFBRVIsS0FBSyxDQUFDa2EsTUFBTSxDQUFDclMsR0FBRyxDQUFDMEksR0FBRyxFQUFFNU4sUUFBUTtVQUFDLENBQUMsQ0FBQztRQUMzRDs7UUFFQTtRQUNBO1FBQ0E7UUFDQSxJQUFJLENBQUNBLFFBQVEsSUFBSXhGLE1BQU0sQ0FBQzBFLElBQUksQ0FBQ2MsUUFBUSxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUNBLFFBQVEsQ0FBQzROLEdBQUcsRUFBRTtVQUM5RCxJQUFJLENBQUN0RixTQUFTLEdBQUcsS0FBSztVQUN0QixPQUFPbEgsY0FBYztRQUN2Qjs7UUFFQTtRQUNBLElBQUljLEtBQUssQ0FBQ0MsT0FBTyxDQUFDbkMsUUFBUSxDQUFDLElBQ3ZCM0MsS0FBSyxDQUFDMk0sUUFBUSxDQUFDaEssUUFBUSxDQUFDLElBQ3hCLE9BQU9BLFFBQVEsS0FBSyxTQUFTLEVBQUU7VUFDakMsTUFBTSxJQUFJb0MsS0FBSyxzQkFBQWpHLE1BQUEsQ0FBc0I2RCxRQUFRLENBQUUsQ0FBQztRQUNsRDtRQUVBLElBQUksQ0FBQy9DLFNBQVMsR0FBR0ksS0FBSyxDQUFDQyxLQUFLLENBQUMwQyxRQUFRLENBQUM7UUFFdEMsT0FBT2UsdUJBQXVCLENBQUNmLFFBQVEsRUFBRSxJQUFJLEVBQUU7VUFBQzBHLE1BQU0sRUFBRTtRQUFJLENBQUMsQ0FBQztNQUNoRTs7TUFFQTtNQUNBO01BQ0F6SyxTQUFTQSxDQUFBLEVBQUc7UUFDVixPQUFPTCxNQUFNLENBQUNRLElBQUksQ0FBQyxJQUFJLENBQUM2RCxNQUFNLENBQUM7TUFDakM7TUFFQXNGLGVBQWVBLENBQUNwSyxJQUFJLEVBQUU7UUFDcEIsSUFBSSxDQUFDOEUsTUFBTSxDQUFDOUUsSUFBSSxDQUFDLEdBQUcsSUFBSTtNQUMxQjtJQUNGO0lBRUE7SUFDQW9DLGVBQWUsQ0FBQ3dGLEVBQUUsR0FBRztNQUNuQjtNQUNBQyxLQUFLQSxDQUFDbkksQ0FBQyxFQUFFO1FBQ1AsSUFBSSxPQUFPQSxDQUFDLEtBQUssUUFBUSxFQUFFO1VBQ3pCLE9BQU8sQ0FBQztRQUNWO1FBRUEsSUFBSSxPQUFPQSxDQUFDLEtBQUssUUFBUSxFQUFFO1VBQ3pCLE9BQU8sQ0FBQztRQUNWO1FBRUEsSUFBSSxPQUFPQSxDQUFDLEtBQUssU0FBUyxFQUFFO1VBQzFCLE9BQU8sQ0FBQztRQUNWO1FBRUEsSUFBSXFILEtBQUssQ0FBQ0MsT0FBTyxDQUFDdEgsQ0FBQyxDQUFDLEVBQUU7VUFDcEIsT0FBTyxDQUFDO1FBQ1Y7UUFFQSxJQUFJQSxDQUFDLEtBQUssSUFBSSxFQUFFO1VBQ2QsT0FBTyxFQUFFO1FBQ1g7O1FBRUE7UUFDQSxJQUFJQSxDQUFDLFlBQVk0SCxNQUFNLEVBQUU7VUFDdkIsT0FBTyxFQUFFO1FBQ1g7UUFFQSxJQUFJLE9BQU81SCxDQUFDLEtBQUssVUFBVSxFQUFFO1VBQzNCLE9BQU8sRUFBRTtRQUNYO1FBRUEsSUFBSUEsQ0FBQyxZQUFZZ2xCLElBQUksRUFBRTtVQUNyQixPQUFPLENBQUM7UUFDVjtRQUVBLElBQUl4aUIsS0FBSyxDQUFDMk0sUUFBUSxDQUFDblAsQ0FBQyxDQUFDLEVBQUU7VUFDckIsT0FBTyxDQUFDO1FBQ1Y7UUFFQSxJQUFJQSxDQUFDLFlBQVlzYixPQUFPLENBQUNDLFFBQVEsRUFBRTtVQUNqQyxPQUFPLENBQUM7UUFDVjtRQUVBLElBQUl2YixDQUFDLFlBQVlxbkIsT0FBTyxFQUFFO1VBQ3hCLE9BQU8sQ0FBQztRQUNWOztRQUVBO1FBQ0EsT0FBTyxDQUFDOztRQUVSO1FBQ0E7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBO01BQ0YsQ0FBQztNQUVEO01BQ0E3WSxNQUFNQSxDQUFDakYsQ0FBQyxFQUFFQyxDQUFDLEVBQUU7UUFDWCxPQUFPaEgsS0FBSyxDQUFDa2EsTUFBTSxDQUFDblQsQ0FBQyxFQUFFQyxDQUFDLEVBQUU7VUFBQ29lLGlCQUFpQixFQUFFO1FBQUksQ0FBQyxDQUFDO01BQ3RELENBQUM7TUFFRDtNQUNBO01BQ0FDLFVBQVVBLENBQUNDLENBQUMsRUFBRTtRQUNaO1FBQ0E7UUFDQTtRQUNBO1FBQ0EsT0FBTyxDQUNMLENBQUMsQ0FBQztRQUFHO1FBQ0wsQ0FBQztRQUFJO1FBQ0wsQ0FBQztRQUFJO1FBQ0wsQ0FBQztRQUFJO1FBQ0wsQ0FBQztRQUFJO1FBQ0wsQ0FBQztRQUFJO1FBQ0wsQ0FBQyxDQUFDO1FBQUc7UUFDTCxDQUFDO1FBQUk7UUFDTCxDQUFDO1FBQUk7UUFDTCxDQUFDO1FBQUk7UUFDTCxDQUFDO1FBQUk7UUFDTCxDQUFDO1FBQUk7UUFDTCxDQUFDLENBQUM7UUFBRztRQUNMLEdBQUc7UUFBRTtRQUNMLENBQUM7UUFBSTtRQUNMLEdBQUc7UUFBRTtRQUNMLENBQUM7UUFBSTtRQUNMLENBQUM7UUFBSTtRQUNMLENBQUMsQ0FBSTtRQUFBLENBQ04sQ0FBQ0EsQ0FBQyxDQUFDO01BQ04sQ0FBQztNQUVEO01BQ0E7TUFDQTtNQUNBO01BQ0FyWCxJQUFJQSxDQUFDbEgsQ0FBQyxFQUFFQyxDQUFDLEVBQUU7UUFDVCxJQUFJRCxDQUFDLEtBQUtoRyxTQUFTLEVBQUU7VUFDbkIsT0FBT2lHLENBQUMsS0FBS2pHLFNBQVMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2pDO1FBRUEsSUFBSWlHLENBQUMsS0FBS2pHLFNBQVMsRUFBRTtVQUNuQixPQUFPLENBQUM7UUFDVjtRQUVBLElBQUl3a0IsRUFBRSxHQUFHcmxCLGVBQWUsQ0FBQ3dGLEVBQUUsQ0FBQ0MsS0FBSyxDQUFDb0IsQ0FBQyxDQUFDO1FBQ3BDLElBQUl5ZSxFQUFFLEdBQUd0bEIsZUFBZSxDQUFDd0YsRUFBRSxDQUFDQyxLQUFLLENBQUNxQixDQUFDLENBQUM7UUFFcEMsTUFBTXllLEVBQUUsR0FBR3ZsQixlQUFlLENBQUN3RixFQUFFLENBQUMyZixVQUFVLENBQUNFLEVBQUUsQ0FBQztRQUM1QyxNQUFNRyxFQUFFLEdBQUd4bEIsZUFBZSxDQUFDd0YsRUFBRSxDQUFDMmYsVUFBVSxDQUFDRyxFQUFFLENBQUM7UUFFNUMsSUFBSUMsRUFBRSxLQUFLQyxFQUFFLEVBQUU7VUFDYixPQUFPRCxFQUFFLEdBQUdDLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDO1FBQ3pCOztRQUVBO1FBQ0E7UUFDQSxJQUFJSCxFQUFFLEtBQUtDLEVBQUUsRUFBRTtVQUNiLE1BQU16Z0IsS0FBSyxDQUFDLHFDQUFxQyxDQUFDO1FBQ3BEO1FBRUEsSUFBSXdnQixFQUFFLEtBQUssQ0FBQyxFQUFFO1VBQUU7VUFDZDtVQUNBQSxFQUFFLEdBQUdDLEVBQUUsR0FBRyxDQUFDO1VBQ1h6ZSxDQUFDLEdBQUdBLENBQUMsQ0FBQzRlLFdBQVcsQ0FBQyxDQUFDO1VBQ25CM2UsQ0FBQyxHQUFHQSxDQUFDLENBQUMyZSxXQUFXLENBQUMsQ0FBQztRQUNyQjtRQUVBLElBQUlKLEVBQUUsS0FBSyxDQUFDLEVBQUU7VUFBRTtVQUNkO1VBQ0FBLEVBQUUsR0FBR0MsRUFBRSxHQUFHLENBQUM7VUFDWHplLENBQUMsR0FBRzZlLEtBQUssQ0FBQzdlLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBR0EsQ0FBQyxDQUFDOGUsT0FBTyxDQUFDLENBQUM7VUFDOUI3ZSxDQUFDLEdBQUc0ZSxLQUFLLENBQUM1ZSxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUdBLENBQUMsQ0FBQzZlLE9BQU8sQ0FBQyxDQUFDO1FBQ2hDO1FBRUEsSUFBSU4sRUFBRSxLQUFLLENBQUMsRUFBRTtVQUFFO1VBQ2QsSUFBSXhlLENBQUMsWUFBWThkLE9BQU8sRUFBRTtZQUN4QixPQUFPOWQsQ0FBQyxDQUFDK2UsS0FBSyxDQUFDOWUsQ0FBQyxDQUFDLENBQUMrZSxRQUFRLENBQUMsQ0FBQztVQUM5QixDQUFDLE1BQU07WUFDTCxPQUFPaGYsQ0FBQyxHQUFHQyxDQUFDO1VBQ2Q7UUFDRjtRQUVBLElBQUl3ZSxFQUFFLEtBQUssQ0FBQztVQUFFO1VBQ1osT0FBT3plLENBQUMsR0FBR0MsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHRCxDQUFDLEtBQUtDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQztRQUVyQyxJQUFJdWUsRUFBRSxLQUFLLENBQUMsRUFBRTtVQUFFO1VBQ2Q7VUFDQSxNQUFNUyxPQUFPLEdBQUcvVixNQUFNLElBQUk7WUFDeEIsTUFBTXpQLE1BQU0sR0FBRyxFQUFFO1lBRWpCakMsTUFBTSxDQUFDUSxJQUFJLENBQUNrUixNQUFNLENBQUMsQ0FBQ3RPLE9BQU8sQ0FBQ3VCLEdBQUcsSUFBSTtjQUNqQzFDLE1BQU0sQ0FBQzZMLElBQUksQ0FBQ25KLEdBQUcsRUFBRStNLE1BQU0sQ0FBQy9NLEdBQUcsQ0FBQyxDQUFDO1lBQy9CLENBQUMsQ0FBQztZQUVGLE9BQU8xQyxNQUFNO1VBQ2YsQ0FBQztVQUVELE9BQU9OLGVBQWUsQ0FBQ3dGLEVBQUUsQ0FBQ3VJLElBQUksQ0FBQytYLE9BQU8sQ0FBQ2pmLENBQUMsQ0FBQyxFQUFFaWYsT0FBTyxDQUFDaGYsQ0FBQyxDQUFDLENBQUM7UUFDeEQ7UUFFQSxJQUFJdWUsRUFBRSxLQUFLLENBQUMsRUFBRTtVQUFFO1VBQ2QsS0FBSyxJQUFJbm1CLENBQUMsR0FBRyxDQUFDLEdBQUlBLENBQUMsRUFBRSxFQUFFO1lBQ3JCLElBQUlBLENBQUMsS0FBSzJILENBQUMsQ0FBQ3pILE1BQU0sRUFBRTtjQUNsQixPQUFPRixDQUFDLEtBQUs0SCxDQUFDLENBQUMxSCxNQUFNLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNoQztZQUVBLElBQUlGLENBQUMsS0FBSzRILENBQUMsQ0FBQzFILE1BQU0sRUFBRTtjQUNsQixPQUFPLENBQUM7WUFDVjtZQUVBLE1BQU1rTyxDQUFDLEdBQUd0TixlQUFlLENBQUN3RixFQUFFLENBQUN1SSxJQUFJLENBQUNsSCxDQUFDLENBQUMzSCxDQUFDLENBQUMsRUFBRTRILENBQUMsQ0FBQzVILENBQUMsQ0FBQyxDQUFDO1lBQzdDLElBQUlvTyxDQUFDLEtBQUssQ0FBQyxFQUFFO2NBQ1gsT0FBT0EsQ0FBQztZQUNWO1VBQ0Y7UUFDRjtRQUVBLElBQUkrWCxFQUFFLEtBQUssQ0FBQyxFQUFFO1VBQUU7VUFDZDtVQUNBO1VBQ0EsSUFBSXhlLENBQUMsQ0FBQ3pILE1BQU0sS0FBSzBILENBQUMsQ0FBQzFILE1BQU0sRUFBRTtZQUN6QixPQUFPeUgsQ0FBQyxDQUFDekgsTUFBTSxHQUFHMEgsQ0FBQyxDQUFDMUgsTUFBTTtVQUM1QjtVQUVBLEtBQUssSUFBSUYsQ0FBQyxHQUFHLENBQUMsRUFBRUEsQ0FBQyxHQUFHMkgsQ0FBQyxDQUFDekgsTUFBTSxFQUFFRixDQUFDLEVBQUUsRUFBRTtZQUNqQyxJQUFJMkgsQ0FBQyxDQUFDM0gsQ0FBQyxDQUFDLEdBQUc0SCxDQUFDLENBQUM1SCxDQUFDLENBQUMsRUFBRTtjQUNmLE9BQU8sQ0FBQyxDQUFDO1lBQ1g7WUFFQSxJQUFJMkgsQ0FBQyxDQUFDM0gsQ0FBQyxDQUFDLEdBQUc0SCxDQUFDLENBQUM1SCxDQUFDLENBQUMsRUFBRTtjQUNmLE9BQU8sQ0FBQztZQUNWO1VBQ0Y7VUFFQSxPQUFPLENBQUM7UUFDVjtRQUVBLElBQUltbUIsRUFBRSxLQUFLLENBQUMsRUFBRTtVQUFFO1VBQ2QsSUFBSXhlLENBQUMsRUFBRTtZQUNMLE9BQU9DLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQztVQUNsQjtVQUVBLE9BQU9BLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDO1FBQ25CO1FBRUEsSUFBSXVlLEVBQUUsS0FBSyxFQUFFO1VBQUU7VUFDYixPQUFPLENBQUM7UUFFVixJQUFJQSxFQUFFLEtBQUssRUFBRTtVQUFFO1VBQ2IsTUFBTXhnQixLQUFLLENBQUMsNkNBQTZDLENBQUMsQ0FBQyxDQUFDOztRQUU5RDtRQUNBO1FBQ0E7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBO1FBQ0EsSUFBSXdnQixFQUFFLEtBQUssRUFBRTtVQUFFO1VBQ2IsTUFBTXhnQixLQUFLLENBQUMsMENBQTBDLENBQUMsQ0FBQyxDQUFDOztRQUUzRCxNQUFNQSxLQUFLLENBQUMsc0JBQXNCLENBQUM7TUFDckM7SUFDRixDQUFDO0lBQUMzQixzQkFBQTtFQUFBLFNBQUFDLFdBQUE7SUFBQSxPQUFBRCxzQkFBQSxDQUFBQyxXQUFBO0VBQUE7RUFBQUQsc0JBQUE7QUFBQTtFQUFBRSxJQUFBO0VBQUFDLEtBQUE7QUFBQSxHOzs7Ozs7Ozs7Ozs7OztJQ3RXRixJQUFJMGlCLGdCQUFnQjtJQUFDaHBCLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDLHVCQUF1QixFQUFDO01BQUNnSCxPQUFPQSxDQUFDMUcsQ0FBQyxFQUFDO1FBQUN5b0IsZ0JBQWdCLEdBQUN6b0IsQ0FBQztNQUFBO0lBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQztJQUFDLElBQUlXLE9BQU87SUFBQ2xCLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDLGNBQWMsRUFBQztNQUFDZ0gsT0FBT0EsQ0FBQzFHLENBQUMsRUFBQztRQUFDVyxPQUFPLEdBQUNYLENBQUM7TUFBQTtJQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7SUFBQyxJQUFJd0UsTUFBTTtJQUFDL0UsTUFBTSxDQUFDQyxJQUFJLENBQUMsYUFBYSxFQUFDO01BQUNnSCxPQUFPQSxDQUFDMUcsQ0FBQyxFQUFDO1FBQUN3RSxNQUFNLEdBQUN4RSxDQUFDO01BQUE7SUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0lBQUMsSUFBSUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTUEsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFJMVJ5QyxlQUFlLEdBQUcrbEIsZ0JBQWdCO0lBQ2xDdm9CLFNBQVMsR0FBRztNQUNSd0MsZUFBZSxFQUFFK2xCLGdCQUFnQjtNQUNqQzluQixPQUFPO01BQ1A2RDtJQUNKLENBQUM7SUFBQ29CLHNCQUFBO0VBQUEsU0FBQUMsV0FBQTtJQUFBLE9BQUFELHNCQUFBLENBQUFDLFdBQUE7RUFBQTtFQUFBRCxzQkFBQTtBQUFBO0VBQUFFLElBQUE7RUFBQUMsS0FBQTtBQUFBLEc7Ozs7Ozs7Ozs7O0FDVEZ0RyxNQUFNLENBQUN1RyxNQUFNLENBQUM7RUFBQ1UsT0FBTyxFQUFDQSxDQUFBLEtBQUl1UjtBQUFhLENBQUMsQ0FBQztBQUMzQixNQUFNQSxhQUFhLENBQUMsRTs7Ozs7Ozs7Ozs7Ozs7SUNEbkN4WSxNQUFNLENBQUN1RyxNQUFNLENBQUM7TUFBQ1UsT0FBTyxFQUFDQSxDQUFBLEtBQUlsQztJQUFNLENBQUMsQ0FBQztJQUFDLElBQUl5QixpQkFBaUIsRUFBQ0Usc0JBQXNCLEVBQUNDLHNCQUFzQixFQUFDekcsTUFBTSxFQUFDRSxnQkFBZ0IsRUFBQ3lHLGtCQUFrQixFQUFDRyxvQkFBb0I7SUFBQ2hILE1BQU0sQ0FBQ0MsSUFBSSxDQUFDLGFBQWEsRUFBQztNQUFDdUcsaUJBQWlCQSxDQUFDakcsQ0FBQyxFQUFDO1FBQUNpRyxpQkFBaUIsR0FBQ2pHLENBQUM7TUFBQSxDQUFDO01BQUNtRyxzQkFBc0JBLENBQUNuRyxDQUFDLEVBQUM7UUFBQ21HLHNCQUFzQixHQUFDbkcsQ0FBQztNQUFBLENBQUM7TUFBQ29HLHNCQUFzQkEsQ0FBQ3BHLENBQUMsRUFBQztRQUFDb0csc0JBQXNCLEdBQUNwRyxDQUFDO01BQUEsQ0FBQztNQUFDTCxNQUFNQSxDQUFDSyxDQUFDLEVBQUM7UUFBQ0wsTUFBTSxHQUFDSyxDQUFDO01BQUEsQ0FBQztNQUFDSCxnQkFBZ0JBLENBQUNHLENBQUMsRUFBQztRQUFDSCxnQkFBZ0IsR0FBQ0csQ0FBQztNQUFBLENBQUM7TUFBQ3NHLGtCQUFrQkEsQ0FBQ3RHLENBQUMsRUFBQztRQUFDc0csa0JBQWtCLEdBQUN0RyxDQUFDO01BQUEsQ0FBQztNQUFDeUcsb0JBQW9CQSxDQUFDekcsQ0FBQyxFQUFDO1FBQUN5RyxvQkFBb0IsR0FBQ3pHLENBQUM7TUFBQTtJQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7SUFBQyxJQUFJQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNQSxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQXVCOWhCLE1BQU11RSxNQUFNLENBQUM7TUFDMUJ1UCxXQUFXQSxDQUFDMlUsSUFBSSxFQUFFO1FBQ2hCLElBQUksQ0FBQ0MsY0FBYyxHQUFHLEVBQUU7UUFDeEIsSUFBSSxDQUFDQyxhQUFhLEdBQUcsSUFBSTtRQUV6QixNQUFNQyxXQUFXLEdBQUdBLENBQUN2b0IsSUFBSSxFQUFFd29CLFNBQVMsS0FBSztVQUN2QyxJQUFJLENBQUN4b0IsSUFBSSxFQUFFO1lBQ1QsTUFBTWlILEtBQUssQ0FBQyw2QkFBNkIsQ0FBQztVQUM1QztVQUVBLElBQUlqSCxJQUFJLENBQUN5b0IsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsRUFBRTtZQUMxQixNQUFNeGhCLEtBQUssMEJBQUFqRyxNQUFBLENBQTBCaEIsSUFBSSxDQUFFLENBQUM7VUFDOUM7VUFFQSxJQUFJLENBQUNxb0IsY0FBYyxDQUFDOVosSUFBSSxDQUFDO1lBQ3ZCaWEsU0FBUztZQUNURSxNQUFNLEVBQUUxaUIsa0JBQWtCLENBQUNoRyxJQUFJLEVBQUU7Y0FBQzRRLE9BQU8sRUFBRTtZQUFJLENBQUMsQ0FBQztZQUNqRDVRO1VBQ0YsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUVELElBQUlvb0IsSUFBSSxZQUFZcmhCLEtBQUssRUFBRTtVQUN6QnFoQixJQUFJLENBQUN2a0IsT0FBTyxDQUFDOEosT0FBTyxJQUFJO1lBQ3RCLElBQUksT0FBT0EsT0FBTyxLQUFLLFFBQVEsRUFBRTtjQUMvQjRhLFdBQVcsQ0FBQzVhLE9BQU8sRUFBRSxJQUFJLENBQUM7WUFDNUIsQ0FBQyxNQUFNO2NBQ0w0YSxXQUFXLENBQUM1YSxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUVBLE9BQU8sQ0FBQyxDQUFDLENBQUMsS0FBSyxNQUFNLENBQUM7WUFDaEQ7VUFDRixDQUFDLENBQUM7UUFDSixDQUFDLE1BQU0sSUFBSSxPQUFPeWEsSUFBSSxLQUFLLFFBQVEsRUFBRTtVQUNuQzNuQixNQUFNLENBQUNRLElBQUksQ0FBQ21uQixJQUFJLENBQUMsQ0FBQ3ZrQixPQUFPLENBQUN1QixHQUFHLElBQUk7WUFDL0JtakIsV0FBVyxDQUFDbmpCLEdBQUcsRUFBRWdqQixJQUFJLENBQUNoakIsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1VBQ2xDLENBQUMsQ0FBQztRQUNKLENBQUMsTUFBTSxJQUFJLE9BQU9nakIsSUFBSSxLQUFLLFVBQVUsRUFBRTtVQUNyQyxJQUFJLENBQUNFLGFBQWEsR0FBR0YsSUFBSTtRQUMzQixDQUFDLE1BQU07VUFDTCxNQUFNbmhCLEtBQUssNEJBQUFqRyxNQUFBLENBQTRCK08sSUFBSSxDQUFDQyxTQUFTLENBQUNvWSxJQUFJLENBQUMsQ0FBRSxDQUFDO1FBQ2hFOztRQUVBO1FBQ0EsSUFBSSxJQUFJLENBQUNFLGFBQWEsRUFBRTtVQUN0QjtRQUNGOztRQUVBO1FBQ0E7UUFDQTtRQUNBO1FBQ0EsSUFBSSxJQUFJLENBQUMvbkIsa0JBQWtCLEVBQUU7VUFDM0IsTUFBTXNFLFFBQVEsR0FBRyxDQUFDLENBQUM7VUFFbkIsSUFBSSxDQUFDd2pCLGNBQWMsQ0FBQ3hrQixPQUFPLENBQUN1a0IsSUFBSSxJQUFJO1lBQ2xDdmpCLFFBQVEsQ0FBQ3VqQixJQUFJLENBQUNwb0IsSUFBSSxDQUFDLEdBQUcsQ0FBQztVQUN6QixDQUFDLENBQUM7VUFFRixJQUFJLENBQUNtRSw4QkFBOEIsR0FBRyxJQUFJdkUsU0FBUyxDQUFDUyxPQUFPLENBQUN3RSxRQUFRLENBQUM7UUFDdkU7UUFFQSxJQUFJLENBQUM4akIsY0FBYyxHQUFHQyxrQkFBa0IsQ0FDdEMsSUFBSSxDQUFDUCxjQUFjLENBQUN0b0IsR0FBRyxDQUFDLENBQUNxb0IsSUFBSSxFQUFFOW1CLENBQUMsS0FBSyxJQUFJLENBQUN1bkIsbUJBQW1CLENBQUN2bkIsQ0FBQyxDQUFDLENBQ2xFLENBQUM7TUFDSDtNQUVBZ1ksYUFBYUEsQ0FBQ3RNLE9BQU8sRUFBRTtRQUNyQjtRQUNBO1FBQ0E7UUFDQTtRQUNBO1FBQ0EsSUFBSSxJQUFJLENBQUNxYixjQUFjLENBQUM3bUIsTUFBTSxJQUFJLENBQUN3TCxPQUFPLElBQUksQ0FBQ0EsT0FBTyxDQUFDcUosU0FBUyxFQUFFO1VBQ2hFLE9BQU8sSUFBSSxDQUFDeVMsa0JBQWtCLENBQUMsQ0FBQztRQUNsQztRQUVBLE1BQU16UyxTQUFTLEdBQUdySixPQUFPLENBQUNxSixTQUFTOztRQUVuQztRQUNBLE9BQU8sQ0FBQ3BOLENBQUMsRUFBRUMsQ0FBQyxLQUFLO1VBQ2YsSUFBSSxDQUFDbU4sU0FBUyxDQUFDOEUsR0FBRyxDQUFDbFMsQ0FBQyxDQUFDd0osR0FBRyxDQUFDLEVBQUU7WUFDekIsTUFBTXhMLEtBQUsseUJBQUFqRyxNQUFBLENBQXlCaUksQ0FBQyxDQUFDd0osR0FBRyxDQUFFLENBQUM7VUFDOUM7VUFFQSxJQUFJLENBQUM0RCxTQUFTLENBQUM4RSxHQUFHLENBQUNqUyxDQUFDLENBQUN1SixHQUFHLENBQUMsRUFBRTtZQUN6QixNQUFNeEwsS0FBSyx5QkFBQWpHLE1BQUEsQ0FBeUJrSSxDQUFDLENBQUN1SixHQUFHLENBQUUsQ0FBQztVQUM5QztVQUVBLE9BQU80RCxTQUFTLENBQUMwQyxHQUFHLENBQUM5UCxDQUFDLENBQUN3SixHQUFHLENBQUMsR0FBRzRELFNBQVMsQ0FBQzBDLEdBQUcsQ0FBQzdQLENBQUMsQ0FBQ3VKLEdBQUcsQ0FBQztRQUNwRCxDQUFDO01BQ0g7O01BRUE7TUFDQTtNQUNBO01BQ0FzVyxZQUFZQSxDQUFDQyxJQUFJLEVBQUVDLElBQUksRUFBRTtRQUN2QixJQUFJRCxJQUFJLENBQUN4bkIsTUFBTSxLQUFLLElBQUksQ0FBQzZtQixjQUFjLENBQUM3bUIsTUFBTSxJQUMxQ3luQixJQUFJLENBQUN6bkIsTUFBTSxLQUFLLElBQUksQ0FBQzZtQixjQUFjLENBQUM3bUIsTUFBTSxFQUFFO1VBQzlDLE1BQU15RixLQUFLLENBQUMsc0JBQXNCLENBQUM7UUFDckM7UUFFQSxPQUFPLElBQUksQ0FBQzBoQixjQUFjLENBQUNLLElBQUksRUFBRUMsSUFBSSxDQUFDO01BQ3hDOztNQUVBO01BQ0E7TUFDQUMsb0JBQW9CQSxDQUFDbmYsR0FBRyxFQUFFb2YsRUFBRSxFQUFFO1FBQzVCLElBQUksSUFBSSxDQUFDZCxjQUFjLENBQUM3bUIsTUFBTSxLQUFLLENBQUMsRUFBRTtVQUNwQyxNQUFNLElBQUl5RixLQUFLLENBQUMscUNBQXFDLENBQUM7UUFDeEQ7UUFFQSxNQUFNbWlCLGVBQWUsR0FBR2hHLE9BQU8sT0FBQXBpQixNQUFBLENBQU9vaUIsT0FBTyxDQUFDaGpCLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBRztRQUUxRCxJQUFJaXBCLFVBQVUsR0FBRyxJQUFJOztRQUVyQjtRQUNBLE1BQU1DLG9CQUFvQixHQUFHLElBQUksQ0FBQ2pCLGNBQWMsQ0FBQ3RvQixHQUFHLENBQUNxb0IsSUFBSSxJQUFJO1VBQzNEO1VBQ0E7VUFDQSxJQUFJM2EsUUFBUSxHQUFHM0gsc0JBQXNCLENBQUNzaUIsSUFBSSxDQUFDTSxNQUFNLENBQUMzZSxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUM7O1VBRTdEO1VBQ0E7VUFDQSxJQUFJLENBQUMwRCxRQUFRLENBQUNqTSxNQUFNLEVBQUU7WUFDcEJpTSxRQUFRLEdBQUcsQ0FBQztjQUFFcEksS0FBSyxFQUFFLEtBQUs7WUFBRSxDQUFDLENBQUM7VUFDaEM7VUFFQSxNQUFNc0ksT0FBTyxHQUFHbE4sTUFBTSxDQUFDNFosTUFBTSxDQUFDLElBQUksQ0FBQztVQUNuQyxJQUFJa1AsU0FBUyxHQUFHLEtBQUs7VUFFckI5YixRQUFRLENBQUM1SixPQUFPLENBQUN3SSxNQUFNLElBQUk7WUFDekIsSUFBSSxDQUFDQSxNQUFNLENBQUNHLFlBQVksRUFBRTtjQUN4QjtjQUNBO2NBQ0E7Y0FDQSxJQUFJaUIsUUFBUSxDQUFDak0sTUFBTSxHQUFHLENBQUMsRUFBRTtnQkFDdkIsTUFBTXlGLEtBQUssQ0FBQyxzQ0FBc0MsQ0FBQztjQUNyRDtjQUVBMEcsT0FBTyxDQUFDLEVBQUUsQ0FBQyxHQUFHdEIsTUFBTSxDQUFDaEgsS0FBSztjQUMxQjtZQUNGO1lBRUFra0IsU0FBUyxHQUFHLElBQUk7WUFFaEIsTUFBTXZwQixJQUFJLEdBQUdvcEIsZUFBZSxDQUFDL2MsTUFBTSxDQUFDRyxZQUFZLENBQUM7WUFFakQsSUFBSW5OLE1BQU0sQ0FBQzBFLElBQUksQ0FBQzRKLE9BQU8sRUFBRTNOLElBQUksQ0FBQyxFQUFFO2NBQzlCLE1BQU1pSCxLQUFLLG9CQUFBakcsTUFBQSxDQUFvQmhCLElBQUksQ0FBRSxDQUFDO1lBQ3hDO1lBRUEyTixPQUFPLENBQUMzTixJQUFJLENBQUMsR0FBR3FNLE1BQU0sQ0FBQ2hILEtBQUs7O1lBRTVCO1lBQ0E7WUFDQTtZQUNBO1lBQ0E7WUFDQTtZQUNBO1lBQ0E7WUFDQTtZQUNBO1lBQ0EsSUFBSWdrQixVQUFVLElBQUksQ0FBQ2hxQixNQUFNLENBQUMwRSxJQUFJLENBQUNzbEIsVUFBVSxFQUFFcnBCLElBQUksQ0FBQyxFQUFFO2NBQ2hELE1BQU1pSCxLQUFLLENBQUMsOEJBQThCLENBQUM7WUFDN0M7VUFDRixDQUFDLENBQUM7VUFFRixJQUFJb2lCLFVBQVUsRUFBRTtZQUNkO1lBQ0E7WUFDQSxJQUFJLENBQUNocUIsTUFBTSxDQUFDMEUsSUFBSSxDQUFDNEosT0FBTyxFQUFFLEVBQUUsQ0FBQyxJQUN6QmxOLE1BQU0sQ0FBQ1EsSUFBSSxDQUFDb29CLFVBQVUsQ0FBQyxDQUFDN25CLE1BQU0sS0FBS2YsTUFBTSxDQUFDUSxJQUFJLENBQUMwTSxPQUFPLENBQUMsQ0FBQ25NLE1BQU0sRUFBRTtjQUNsRSxNQUFNeUYsS0FBSyxDQUFDLCtCQUErQixDQUFDO1lBQzlDO1VBQ0YsQ0FBQyxNQUFNLElBQUlzaUIsU0FBUyxFQUFFO1lBQ3BCRixVQUFVLEdBQUcsQ0FBQyxDQUFDO1lBRWY1b0IsTUFBTSxDQUFDUSxJQUFJLENBQUMwTSxPQUFPLENBQUMsQ0FBQzlKLE9BQU8sQ0FBQzdELElBQUksSUFBSTtjQUNuQ3FwQixVQUFVLENBQUNycEIsSUFBSSxDQUFDLEdBQUcsSUFBSTtZQUN6QixDQUFDLENBQUM7VUFDSjtVQUVBLE9BQU8yTixPQUFPO1FBQ2hCLENBQUMsQ0FBQztRQUVGLElBQUksQ0FBQzBiLFVBQVUsRUFBRTtVQUNmO1VBQ0EsTUFBTUcsT0FBTyxHQUFHRixvQkFBb0IsQ0FBQ3ZwQixHQUFHLENBQUMrbEIsTUFBTSxJQUFJO1lBQ2pELElBQUksQ0FBQ3ptQixNQUFNLENBQUMwRSxJQUFJLENBQUMraEIsTUFBTSxFQUFFLEVBQUUsQ0FBQyxFQUFFO2NBQzVCLE1BQU03ZSxLQUFLLENBQUMsNEJBQTRCLENBQUM7WUFDM0M7WUFFQSxPQUFPNmUsTUFBTSxDQUFDLEVBQUUsQ0FBQztVQUNuQixDQUFDLENBQUM7VUFFRnFELEVBQUUsQ0FBQ0ssT0FBTyxDQUFDO1VBRVg7UUFDRjtRQUVBL29CLE1BQU0sQ0FBQ1EsSUFBSSxDQUFDb29CLFVBQVUsQ0FBQyxDQUFDeGxCLE9BQU8sQ0FBQzdELElBQUksSUFBSTtVQUN0QyxNQUFNb0YsR0FBRyxHQUFHa2tCLG9CQUFvQixDQUFDdnBCLEdBQUcsQ0FBQytsQixNQUFNLElBQUk7WUFDN0MsSUFBSXptQixNQUFNLENBQUMwRSxJQUFJLENBQUMraEIsTUFBTSxFQUFFLEVBQUUsQ0FBQyxFQUFFO2NBQzNCLE9BQU9BLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDbkI7WUFFQSxJQUFJLENBQUN6bUIsTUFBTSxDQUFDMEUsSUFBSSxDQUFDK2hCLE1BQU0sRUFBRTlsQixJQUFJLENBQUMsRUFBRTtjQUM5QixNQUFNaUgsS0FBSyxDQUFDLGVBQWUsQ0FBQztZQUM5QjtZQUVBLE9BQU82ZSxNQUFNLENBQUM5bEIsSUFBSSxDQUFDO1VBQ3JCLENBQUMsQ0FBQztVQUVGbXBCLEVBQUUsQ0FBQy9qQixHQUFHLENBQUM7UUFDVCxDQUFDLENBQUM7TUFDSjs7TUFFQTtNQUNBO01BQ0EwakIsa0JBQWtCQSxDQUFBLEVBQUc7UUFDbkIsSUFBSSxJQUFJLENBQUNSLGFBQWEsRUFBRTtVQUN0QixPQUFPLElBQUksQ0FBQ0EsYUFBYTtRQUMzQjs7UUFFQTtRQUNBO1FBQ0EsSUFBSSxDQUFDLElBQUksQ0FBQ0QsY0FBYyxDQUFDN21CLE1BQU0sRUFBRTtVQUMvQixPQUFPLENBQUNpb0IsSUFBSSxFQUFFQyxJQUFJLEtBQUssQ0FBQztRQUMxQjtRQUVBLE9BQU8sQ0FBQ0QsSUFBSSxFQUFFQyxJQUFJLEtBQUs7VUFDckIsTUFBTVYsSUFBSSxHQUFHLElBQUksQ0FBQ1csaUJBQWlCLENBQUNGLElBQUksQ0FBQztVQUN6QyxNQUFNUixJQUFJLEdBQUcsSUFBSSxDQUFDVSxpQkFBaUIsQ0FBQ0QsSUFBSSxDQUFDO1VBQ3pDLE9BQU8sSUFBSSxDQUFDWCxZQUFZLENBQUNDLElBQUksRUFBRUMsSUFBSSxDQUFDO1FBQ3RDLENBQUM7TUFDSDs7TUFFQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBVSxpQkFBaUJBLENBQUM1ZixHQUFHLEVBQUU7UUFDckIsSUFBSTZmLE1BQU0sR0FBRyxJQUFJO1FBRWpCLElBQUksQ0FBQ1Ysb0JBQW9CLENBQUNuZixHQUFHLEVBQUUzRSxHQUFHLElBQUk7VUFDcEMsSUFBSXdrQixNQUFNLEtBQUssSUFBSSxFQUFFO1lBQ25CQSxNQUFNLEdBQUd4a0IsR0FBRztZQUNaO1VBQ0Y7VUFFQSxJQUFJLElBQUksQ0FBQzJqQixZQUFZLENBQUMzakIsR0FBRyxFQUFFd2tCLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRTtZQUN0Q0EsTUFBTSxHQUFHeGtCLEdBQUc7VUFDZDtRQUNGLENBQUMsQ0FBQztRQUVGLE9BQU93a0IsTUFBTTtNQUNmO01BRUE5b0IsU0FBU0EsQ0FBQSxFQUFHO1FBQ1YsT0FBTyxJQUFJLENBQUN1bkIsY0FBYyxDQUFDdG9CLEdBQUcsQ0FBQ0ksSUFBSSxJQUFJQSxJQUFJLENBQUNILElBQUksQ0FBQztNQUNuRDs7TUFFQTtNQUNBO01BQ0E2b0IsbUJBQW1CQSxDQUFDdm5CLENBQUMsRUFBRTtRQUNyQixNQUFNdW9CLE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQ3hCLGNBQWMsQ0FBQy9tQixDQUFDLENBQUMsQ0FBQ2tuQixTQUFTO1FBRWhELE9BQU8sQ0FBQ1EsSUFBSSxFQUFFQyxJQUFJLEtBQUs7VUFDckIsTUFBTWEsT0FBTyxHQUFHMW5CLGVBQWUsQ0FBQ3dGLEVBQUUsQ0FBQ3VJLElBQUksQ0FBQzZZLElBQUksQ0FBQzFuQixDQUFDLENBQUMsRUFBRTJuQixJQUFJLENBQUMzbkIsQ0FBQyxDQUFDLENBQUM7VUFDekQsT0FBT3VvQixNQUFNLEdBQUcsQ0FBQ0MsT0FBTyxHQUFHQSxPQUFPO1FBQ3BDLENBQUM7TUFDSDtJQUNGO0lBRUE7SUFDQTtJQUNBO0lBQ0E7SUFDQSxTQUFTbEIsa0JBQWtCQSxDQUFDbUIsZUFBZSxFQUFFO01BQzNDLE9BQU8sQ0FBQzlnQixDQUFDLEVBQUVDLENBQUMsS0FBSztRQUNmLEtBQUssSUFBSTVILENBQUMsR0FBRyxDQUFDLEVBQUVBLENBQUMsR0FBR3lvQixlQUFlLENBQUN2b0IsTUFBTSxFQUFFLEVBQUVGLENBQUMsRUFBRTtVQUMvQyxNQUFNd29CLE9BQU8sR0FBR0MsZUFBZSxDQUFDem9CLENBQUMsQ0FBQyxDQUFDMkgsQ0FBQyxFQUFFQyxDQUFDLENBQUM7VUFDeEMsSUFBSTRnQixPQUFPLEtBQUssQ0FBQyxFQUFFO1lBQ2pCLE9BQU9BLE9BQU87VUFDaEI7UUFDRjtRQUVBLE9BQU8sQ0FBQztNQUNWLENBQUM7SUFDSDtJQUFDeGtCLHNCQUFBO0VBQUEsU0FBQUMsV0FBQTtJQUFBLE9BQUFELHNCQUFBLENBQUFDLFdBQUE7RUFBQTtFQUFBRCxzQkFBQTtBQUFBO0VBQUFFLElBQUE7RUFBQUMsS0FBQTtBQUFBLEciLCJmaWxlIjoiL3BhY2thZ2VzL21pbmltb25nby5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAnLi9taW5pbW9uZ29fY29tbW9uLmpzJztcbmltcG9ydCB7XG4gIGhhc093bixcbiAgaXNOdW1lcmljS2V5LFxuICBpc09wZXJhdG9yT2JqZWN0LFxuICBwYXRoc1RvVHJlZSxcbiAgcHJvamVjdGlvbkRldGFpbHMsXG59IGZyb20gJy4vY29tbW9uLmpzJztcblxuTWluaW1vbmdvLl9wYXRoc0VsaWRpbmdOdW1lcmljS2V5cyA9IHBhdGhzID0+IHBhdGhzLm1hcChwYXRoID0+XG4gIHBhdGguc3BsaXQoJy4nKS5maWx0ZXIocGFydCA9PiAhaXNOdW1lcmljS2V5KHBhcnQpKS5qb2luKCcuJylcbik7XG5cbi8vIFJldHVybnMgdHJ1ZSBpZiB0aGUgbW9kaWZpZXIgYXBwbGllZCB0byBzb21lIGRvY3VtZW50IG1heSBjaGFuZ2UgdGhlIHJlc3VsdFxuLy8gb2YgbWF0Y2hpbmcgdGhlIGRvY3VtZW50IGJ5IHNlbGVjdG9yXG4vLyBUaGUgbW9kaWZpZXIgaXMgYWx3YXlzIGluIGEgZm9ybSBvZiBPYmplY3Q6XG4vLyAgLSAkc2V0XG4vLyAgICAtICdhLmIuMjIueic6IHZhbHVlXG4vLyAgICAtICdmb28uYmFyJzogNDJcbi8vICAtICR1bnNldFxuLy8gICAgLSAnYWJjLmQnOiAxXG5NaW5pbW9uZ28uTWF0Y2hlci5wcm90b3R5cGUuYWZmZWN0ZWRCeU1vZGlmaWVyID0gZnVuY3Rpb24obW9kaWZpZXIpIHtcbiAgLy8gc2FmZSBjaGVjayBmb3IgJHNldC8kdW5zZXQgYmVpbmcgb2JqZWN0c1xuICBtb2RpZmllciA9IE9iamVjdC5hc3NpZ24oeyRzZXQ6IHt9LCAkdW5zZXQ6IHt9fSwgbW9kaWZpZXIpO1xuXG4gIGNvbnN0IG1lYW5pbmdmdWxQYXRocyA9IHRoaXMuX2dldFBhdGhzKCk7XG4gIGNvbnN0IG1vZGlmaWVkUGF0aHMgPSBbXS5jb25jYXQoXG4gICAgT2JqZWN0LmtleXMobW9kaWZpZXIuJHNldCksXG4gICAgT2JqZWN0LmtleXMobW9kaWZpZXIuJHVuc2V0KVxuICApO1xuXG4gIHJldHVybiBtb2RpZmllZFBhdGhzLnNvbWUocGF0aCA9PiB7XG4gICAgY29uc3QgbW9kID0gcGF0aC5zcGxpdCgnLicpO1xuXG4gICAgcmV0dXJuIG1lYW5pbmdmdWxQYXRocy5zb21lKG1lYW5pbmdmdWxQYXRoID0+IHtcbiAgICAgIGNvbnN0IHNlbCA9IG1lYW5pbmdmdWxQYXRoLnNwbGl0KCcuJyk7XG5cbiAgICAgIGxldCBpID0gMCwgaiA9IDA7XG5cbiAgICAgIHdoaWxlIChpIDwgc2VsLmxlbmd0aCAmJiBqIDwgbW9kLmxlbmd0aCkge1xuICAgICAgICBpZiAoaXNOdW1lcmljS2V5KHNlbFtpXSkgJiYgaXNOdW1lcmljS2V5KG1vZFtqXSkpIHtcbiAgICAgICAgICAvLyBmb28uNC5iYXIgc2VsZWN0b3IgYWZmZWN0ZWQgYnkgZm9vLjQgbW9kaWZpZXJcbiAgICAgICAgICAvLyBmb28uMy5iYXIgc2VsZWN0b3IgdW5hZmZlY3RlZCBieSBmb28uNCBtb2RpZmllclxuICAgICAgICAgIGlmIChzZWxbaV0gPT09IG1vZFtqXSkge1xuICAgICAgICAgICAgaSsrO1xuICAgICAgICAgICAgaisrO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGlzTnVtZXJpY0tleShzZWxbaV0pKSB7XG4gICAgICAgICAgLy8gZm9vLjQuYmFyIHNlbGVjdG9yIHVuYWZmZWN0ZWQgYnkgZm9vLmJhciBtb2RpZmllclxuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSBlbHNlIGlmIChpc051bWVyaWNLZXkobW9kW2pdKSkge1xuICAgICAgICAgIGorKztcbiAgICAgICAgfSBlbHNlIGlmIChzZWxbaV0gPT09IG1vZFtqXSkge1xuICAgICAgICAgIGkrKztcbiAgICAgICAgICBqKys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIE9uZSBpcyBhIHByZWZpeCBvZiBhbm90aGVyLCB0YWtpbmcgbnVtZXJpYyBmaWVsZHMgaW50byBhY2NvdW50XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vLyBAcGFyYW0gbW9kaWZpZXIgLSBPYmplY3Q6IE1vbmdvREItc3R5bGVkIG1vZGlmaWVyIHdpdGggYCRzZXRgcyBhbmQgYCR1bnNldHNgXG4vLyAgICAgICAgICAgICAgICAgICAgICAgICAgIG9ubHkuIChhc3N1bWVkIHRvIGNvbWUgZnJvbSBvcGxvZylcbi8vIEByZXR1cm5zIC0gQm9vbGVhbjogaWYgYWZ0ZXIgYXBwbHlpbmcgdGhlIG1vZGlmaWVyLCBzZWxlY3RvciBjYW4gc3RhcnRcbi8vICAgICAgICAgICAgICAgICAgICAgYWNjZXB0aW5nIHRoZSBtb2RpZmllZCB2YWx1ZS5cbi8vIE5PVEU6IGFzc3VtZXMgdGhhdCBkb2N1bWVudCBhZmZlY3RlZCBieSBtb2RpZmllciBkaWRuJ3QgbWF0Y2ggdGhpcyBNYXRjaGVyXG4vLyBiZWZvcmUsIHNvIGlmIG1vZGlmaWVyIGNhbid0IGNvbnZpbmNlIHNlbGVjdG9yIGluIGEgcG9zaXRpdmUgY2hhbmdlIGl0IHdvdWxkXG4vLyBzdGF5ICdmYWxzZScuXG4vLyBDdXJyZW50bHkgZG9lc24ndCBzdXBwb3J0ICQtb3BlcmF0b3JzIGFuZCBudW1lcmljIGluZGljZXMgcHJlY2lzZWx5LlxuTWluaW1vbmdvLk1hdGNoZXIucHJvdG90eXBlLmNhbkJlY29tZVRydWVCeU1vZGlmaWVyID0gZnVuY3Rpb24obW9kaWZpZXIpIHtcbiAgaWYgKCF0aGlzLmFmZmVjdGVkQnlNb2RpZmllcihtb2RpZmllcikpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAoIXRoaXMuaXNTaW1wbGUoKSkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgbW9kaWZpZXIgPSBPYmplY3QuYXNzaWduKHskc2V0OiB7fSwgJHVuc2V0OiB7fX0sIG1vZGlmaWVyKTtcblxuICBjb25zdCBtb2RpZmllclBhdGhzID0gW10uY29uY2F0KFxuICAgIE9iamVjdC5rZXlzKG1vZGlmaWVyLiRzZXQpLFxuICAgIE9iamVjdC5rZXlzKG1vZGlmaWVyLiR1bnNldClcbiAgKTtcblxuICBpZiAodGhpcy5fZ2V0UGF0aHMoKS5zb21lKHBhdGhIYXNOdW1lcmljS2V5cykgfHxcbiAgICAgIG1vZGlmaWVyUGF0aHMuc29tZShwYXRoSGFzTnVtZXJpY0tleXMpKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICAvLyBjaGVjayBpZiB0aGVyZSBpcyBhICRzZXQgb3IgJHVuc2V0IHRoYXQgaW5kaWNhdGVzIHNvbWV0aGluZyBpcyBhblxuICAvLyBvYmplY3QgcmF0aGVyIHRoYW4gYSBzY2FsYXIgaW4gdGhlIGFjdHVhbCBvYmplY3Qgd2hlcmUgd2Ugc2F3ICQtb3BlcmF0b3JcbiAgLy8gTk9URTogaXQgaXMgY29ycmVjdCBzaW5jZSB3ZSBhbGxvdyBvbmx5IHNjYWxhcnMgaW4gJC1vcGVyYXRvcnNcbiAgLy8gRXhhbXBsZTogZm9yIHNlbGVjdG9yIHsnYS5iJzogeyRndDogNX19IHRoZSBtb2RpZmllciB7J2EuYi5jJzo3fSB3b3VsZFxuICAvLyBkZWZpbml0ZWx5IHNldCB0aGUgcmVzdWx0IHRvIGZhbHNlIGFzICdhLmInIGFwcGVhcnMgdG8gYmUgYW4gb2JqZWN0LlxuICBjb25zdCBleHBlY3RlZFNjYWxhcklzT2JqZWN0ID0gT2JqZWN0LmtleXModGhpcy5fc2VsZWN0b3IpLnNvbWUocGF0aCA9PiB7XG4gICAgaWYgKCFpc09wZXJhdG9yT2JqZWN0KHRoaXMuX3NlbGVjdG9yW3BhdGhdKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHJldHVybiBtb2RpZmllclBhdGhzLnNvbWUobW9kaWZpZXJQYXRoID0+XG4gICAgICBtb2RpZmllclBhdGguc3RhcnRzV2l0aChgJHtwYXRofS5gKVxuICAgICk7XG4gIH0pO1xuXG4gIGlmIChleHBlY3RlZFNjYWxhcklzT2JqZWN0KSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgLy8gU2VlIGlmIHdlIGNhbiBhcHBseSB0aGUgbW9kaWZpZXIgb24gdGhlIGlkZWFsbHkgbWF0Y2hpbmcgb2JqZWN0LiBJZiBpdFxuICAvLyBzdGlsbCBtYXRjaGVzIHRoZSBzZWxlY3RvciwgdGhlbiB0aGUgbW9kaWZpZXIgY291bGQgaGF2ZSB0dXJuZWQgdGhlIHJlYWxcbiAgLy8gb2JqZWN0IGluIHRoZSBkYXRhYmFzZSBpbnRvIHNvbWV0aGluZyBtYXRjaGluZy5cbiAgY29uc3QgbWF0Y2hpbmdEb2N1bWVudCA9IEVKU09OLmNsb25lKHRoaXMubWF0Y2hpbmdEb2N1bWVudCgpKTtcblxuICAvLyBUaGUgc2VsZWN0b3IgaXMgdG9vIGNvbXBsZXgsIGFueXRoaW5nIGNhbiBoYXBwZW4uXG4gIGlmIChtYXRjaGluZ0RvY3VtZW50ID09PSBudWxsKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICB0cnkge1xuICAgIExvY2FsQ29sbGVjdGlvbi5fbW9kaWZ5KG1hdGNoaW5nRG9jdW1lbnQsIG1vZGlmaWVyKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAvLyBDb3VsZG4ndCBzZXQgYSBwcm9wZXJ0eSBvbiBhIGZpZWxkIHdoaWNoIGlzIGEgc2NhbGFyIG9yIG51bGwgaW4gdGhlXG4gICAgLy8gc2VsZWN0b3IuXG4gICAgLy8gRXhhbXBsZTpcbiAgICAvLyByZWFsIGRvY3VtZW50OiB7ICdhLmInOiAzIH1cbiAgICAvLyBzZWxlY3RvcjogeyAnYSc6IDEyIH1cbiAgICAvLyBjb252ZXJ0ZWQgc2VsZWN0b3IgKGlkZWFsIGRvY3VtZW50KTogeyAnYSc6IDEyIH1cbiAgICAvLyBtb2RpZmllcjogeyAkc2V0OiB7ICdhLmInOiA0IH0gfVxuICAgIC8vIFdlIGRvbid0IGtub3cgd2hhdCByZWFsIGRvY3VtZW50IHdhcyBsaWtlIGJ1dCBmcm9tIHRoZSBlcnJvciByYWlzZWQgYnlcbiAgICAvLyAkc2V0IG9uIGEgc2NhbGFyIGZpZWxkIHdlIGNhbiByZWFzb24gdGhhdCB0aGUgc3RydWN0dXJlIG9mIHJlYWwgZG9jdW1lbnRcbiAgICAvLyBpcyBjb21wbGV0ZWx5IGRpZmZlcmVudC5cbiAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ01pbmltb25nb0Vycm9yJyAmJiBlcnJvci5zZXRQcm9wZXJ0eUVycm9yKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cblxuICByZXR1cm4gdGhpcy5kb2N1bWVudE1hdGNoZXMobWF0Y2hpbmdEb2N1bWVudCkucmVzdWx0O1xufTtcblxuLy8gS25vd3MgaG93IHRvIGNvbWJpbmUgYSBtb25nbyBzZWxlY3RvciBhbmQgYSBmaWVsZHMgcHJvamVjdGlvbiB0byBhIG5ldyBmaWVsZHNcbi8vIHByb2plY3Rpb24gdGFraW5nIGludG8gYWNjb3VudCBhY3RpdmUgZmllbGRzIGZyb20gdGhlIHBhc3NlZCBzZWxlY3Rvci5cbi8vIEByZXR1cm5zIE9iamVjdCAtIHByb2plY3Rpb24gb2JqZWN0IChzYW1lIGFzIGZpZWxkcyBvcHRpb24gb2YgbW9uZ28gY3Vyc29yKVxuTWluaW1vbmdvLk1hdGNoZXIucHJvdG90eXBlLmNvbWJpbmVJbnRvUHJvamVjdGlvbiA9IGZ1bmN0aW9uKHByb2plY3Rpb24pIHtcbiAgY29uc3Qgc2VsZWN0b3JQYXRocyA9IE1pbmltb25nby5fcGF0aHNFbGlkaW5nTnVtZXJpY0tleXModGhpcy5fZ2V0UGF0aHMoKSk7XG5cbiAgLy8gU3BlY2lhbCBjYXNlIGZvciAkd2hlcmUgb3BlcmF0b3IgaW4gdGhlIHNlbGVjdG9yIC0gcHJvamVjdGlvbiBzaG91bGQgZGVwZW5kXG4gIC8vIG9uIGFsbCBmaWVsZHMgb2YgdGhlIGRvY3VtZW50LiBnZXRTZWxlY3RvclBhdGhzIHJldHVybnMgYSBsaXN0IG9mIHBhdGhzXG4gIC8vIHNlbGVjdG9yIGRlcGVuZHMgb24uIElmIG9uZSBvZiB0aGUgcGF0aHMgaXMgJycgKGVtcHR5IHN0cmluZykgcmVwcmVzZW50aW5nXG4gIC8vIHRoZSByb290IG9yIHRoZSB3aG9sZSBkb2N1bWVudCwgY29tcGxldGUgcHJvamVjdGlvbiBzaG91bGQgYmUgcmV0dXJuZWQuXG4gIGlmIChzZWxlY3RvclBhdGhzLmluY2x1ZGVzKCcnKSkge1xuICAgIHJldHVybiB7fTtcbiAgfVxuXG4gIHJldHVybiBjb21iaW5lSW1wb3J0YW50UGF0aHNJbnRvUHJvamVjdGlvbihzZWxlY3RvclBhdGhzLCBwcm9qZWN0aW9uKTtcbn07XG5cbi8vIFJldHVybnMgYW4gb2JqZWN0IHRoYXQgd291bGQgbWF0Y2ggdGhlIHNlbGVjdG9yIGlmIHBvc3NpYmxlIG9yIG51bGwgaWYgdGhlXG4vLyBzZWxlY3RvciBpcyB0b28gY29tcGxleCBmb3IgdXMgdG8gYW5hbHl6ZVxuLy8geyAnYS5iJzogeyBhbnM6IDQyIH0sICdmb28uYmFyJzogbnVsbCwgJ2Zvby5iYXonOiBcInNvbWV0aGluZ1wiIH1cbi8vID0+IHsgYTogeyBiOiB7IGFuczogNDIgfSB9LCBmb286IHsgYmFyOiBudWxsLCBiYXo6IFwic29tZXRoaW5nXCIgfSB9XG5NaW5pbW9uZ28uTWF0Y2hlci5wcm90b3R5cGUubWF0Y2hpbmdEb2N1bWVudCA9IGZ1bmN0aW9uKCkge1xuICAvLyBjaGVjayBpZiBpdCB3YXMgY29tcHV0ZWQgYmVmb3JlXG4gIGlmICh0aGlzLl9tYXRjaGluZ0RvY3VtZW50ICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gdGhpcy5fbWF0Y2hpbmdEb2N1bWVudDtcbiAgfVxuXG4gIC8vIElmIHRoZSBhbmFseXNpcyBvZiB0aGlzIHNlbGVjdG9yIGlzIHRvbyBoYXJkIGZvciBvdXIgaW1wbGVtZW50YXRpb25cbiAgLy8gZmFsbGJhY2sgdG8gXCJZRVNcIlxuICBsZXQgZmFsbGJhY2sgPSBmYWxzZTtcblxuICB0aGlzLl9tYXRjaGluZ0RvY3VtZW50ID0gcGF0aHNUb1RyZWUoXG4gICAgdGhpcy5fZ2V0UGF0aHMoKSxcbiAgICBwYXRoID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlU2VsZWN0b3IgPSB0aGlzLl9zZWxlY3RvcltwYXRoXTtcblxuICAgICAgaWYgKGlzT3BlcmF0b3JPYmplY3QodmFsdWVTZWxlY3RvcikpIHtcbiAgICAgICAgLy8gaWYgdGhlcmUgaXMgYSBzdHJpY3QgZXF1YWxpdHksIHRoZXJlIGlzIGEgZ29vZFxuICAgICAgICAvLyBjaGFuY2Ugd2UgY2FuIHVzZSBvbmUgb2YgdGhvc2UgYXMgXCJtYXRjaGluZ1wiXG4gICAgICAgIC8vIGR1bW15IHZhbHVlXG4gICAgICAgIGlmICh2YWx1ZVNlbGVjdG9yLiRlcSkge1xuICAgICAgICAgIHJldHVybiB2YWx1ZVNlbGVjdG9yLiRlcTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh2YWx1ZVNlbGVjdG9yLiRpbikge1xuICAgICAgICAgIGNvbnN0IG1hdGNoZXIgPSBuZXcgTWluaW1vbmdvLk1hdGNoZXIoe3BsYWNlaG9sZGVyOiB2YWx1ZVNlbGVjdG9yfSk7XG5cbiAgICAgICAgICAvLyBSZXR1cm4gYW55dGhpbmcgZnJvbSAkaW4gdGhhdCBtYXRjaGVzIHRoZSB3aG9sZSBzZWxlY3RvciBmb3IgdGhpc1xuICAgICAgICAgIC8vIHBhdGguIElmIG5vdGhpbmcgbWF0Y2hlcywgcmV0dXJucyBgdW5kZWZpbmVkYCBhcyBub3RoaW5nIGNhbiBtYWtlXG4gICAgICAgICAgLy8gdGhpcyBzZWxlY3RvciBpbnRvIGB0cnVlYC5cbiAgICAgICAgICByZXR1cm4gdmFsdWVTZWxlY3Rvci4kaW4uZmluZChwbGFjZWhvbGRlciA9PlxuICAgICAgICAgICAgbWF0Y2hlci5kb2N1bWVudE1hdGNoZXMoe3BsYWNlaG9sZGVyfSkucmVzdWx0XG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChvbmx5Q29udGFpbnNLZXlzKHZhbHVlU2VsZWN0b3IsIFsnJGd0JywgJyRndGUnLCAnJGx0JywgJyRsdGUnXSkpIHtcbiAgICAgICAgICBsZXQgbG93ZXJCb3VuZCA9IC1JbmZpbml0eTtcbiAgICAgICAgICBsZXQgdXBwZXJCb3VuZCA9IEluZmluaXR5O1xuXG4gICAgICAgICAgWyckbHRlJywgJyRsdCddLmZvckVhY2gob3AgPT4ge1xuICAgICAgICAgICAgaWYgKGhhc093bi5jYWxsKHZhbHVlU2VsZWN0b3IsIG9wKSAmJlxuICAgICAgICAgICAgICAgIHZhbHVlU2VsZWN0b3Jbb3BdIDwgdXBwZXJCb3VuZCkge1xuICAgICAgICAgICAgICB1cHBlckJvdW5kID0gdmFsdWVTZWxlY3RvcltvcF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBbJyRndGUnLCAnJGd0J10uZm9yRWFjaChvcCA9PiB7XG4gICAgICAgICAgICBpZiAoaGFzT3duLmNhbGwodmFsdWVTZWxlY3Rvciwgb3ApICYmXG4gICAgICAgICAgICAgICAgdmFsdWVTZWxlY3RvcltvcF0gPiBsb3dlckJvdW5kKSB7XG4gICAgICAgICAgICAgIGxvd2VyQm91bmQgPSB2YWx1ZVNlbGVjdG9yW29wXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGNvbnN0IG1pZGRsZSA9IChsb3dlckJvdW5kICsgdXBwZXJCb3VuZCkgLyAyO1xuICAgICAgICAgIGNvbnN0IG1hdGNoZXIgPSBuZXcgTWluaW1vbmdvLk1hdGNoZXIoe3BsYWNlaG9sZGVyOiB2YWx1ZVNlbGVjdG9yfSk7XG5cbiAgICAgICAgICBpZiAoIW1hdGNoZXIuZG9jdW1lbnRNYXRjaGVzKHtwbGFjZWhvbGRlcjogbWlkZGxlfSkucmVzdWx0ICYmXG4gICAgICAgICAgICAgIChtaWRkbGUgPT09IGxvd2VyQm91bmQgfHwgbWlkZGxlID09PSB1cHBlckJvdW5kKSkge1xuICAgICAgICAgICAgZmFsbGJhY2sgPSB0cnVlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBtaWRkbGU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAob25seUNvbnRhaW5zS2V5cyh2YWx1ZVNlbGVjdG9yLCBbJyRuaW4nLCAnJG5lJ10pKSB7XG4gICAgICAgICAgLy8gU2luY2UgdGhpcy5faXNTaW1wbGUgbWFrZXMgc3VyZSAkbmluIGFuZCAkbmUgYXJlIG5vdCBjb21iaW5lZCB3aXRoXG4gICAgICAgICAgLy8gb2JqZWN0cyBvciBhcnJheXMsIHdlIGNhbiBjb25maWRlbnRseSByZXR1cm4gYW4gZW1wdHkgb2JqZWN0IGFzIGl0XG4gICAgICAgICAgLy8gbmV2ZXIgbWF0Y2hlcyBhbnkgc2NhbGFyLlxuICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZhbGxiYWNrID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRoaXMuX3NlbGVjdG9yW3BhdGhdO1xuICAgIH0sXG4gICAgeCA9PiB4KTtcblxuICBpZiAoZmFsbGJhY2spIHtcbiAgICB0aGlzLl9tYXRjaGluZ0RvY3VtZW50ID0gbnVsbDtcbiAgfVxuXG4gIHJldHVybiB0aGlzLl9tYXRjaGluZ0RvY3VtZW50O1xufTtcblxuLy8gTWluaW1vbmdvLlNvcnRlciBnZXRzIGEgc2ltaWxhciBtZXRob2QsIHdoaWNoIGRlbGVnYXRlcyB0byBhIE1hdGNoZXIgaXQgbWFkZVxuLy8gZm9yIHRoaXMgZXhhY3QgcHVycG9zZS5cbk1pbmltb25nby5Tb3J0ZXIucHJvdG90eXBlLmFmZmVjdGVkQnlNb2RpZmllciA9IGZ1bmN0aW9uKG1vZGlmaWVyKSB7XG4gIHJldHVybiB0aGlzLl9zZWxlY3RvckZvckFmZmVjdGVkQnlNb2RpZmllci5hZmZlY3RlZEJ5TW9kaWZpZXIobW9kaWZpZXIpO1xufTtcblxuTWluaW1vbmdvLlNvcnRlci5wcm90b3R5cGUuY29tYmluZUludG9Qcm9qZWN0aW9uID0gZnVuY3Rpb24ocHJvamVjdGlvbikge1xuICByZXR1cm4gY29tYmluZUltcG9ydGFudFBhdGhzSW50b1Byb2plY3Rpb24oXG4gICAgTWluaW1vbmdvLl9wYXRoc0VsaWRpbmdOdW1lcmljS2V5cyh0aGlzLl9nZXRQYXRocygpKSxcbiAgICBwcm9qZWN0aW9uXG4gICk7XG59O1xuXG5mdW5jdGlvbiBjb21iaW5lSW1wb3J0YW50UGF0aHNJbnRvUHJvamVjdGlvbihwYXRocywgcHJvamVjdGlvbikge1xuICBjb25zdCBkZXRhaWxzID0gcHJvamVjdGlvbkRldGFpbHMocHJvamVjdGlvbik7XG5cbiAgLy8gbWVyZ2UgdGhlIHBhdGhzIHRvIGluY2x1ZGVcbiAgY29uc3QgdHJlZSA9IHBhdGhzVG9UcmVlKFxuICAgIHBhdGhzLFxuICAgIHBhdGggPT4gdHJ1ZSxcbiAgICAobm9kZSwgcGF0aCwgZnVsbFBhdGgpID0+IHRydWUsXG4gICAgZGV0YWlscy50cmVlXG4gICk7XG4gIGNvbnN0IG1lcmdlZFByb2plY3Rpb24gPSB0cmVlVG9QYXRocyh0cmVlKTtcblxuICBpZiAoZGV0YWlscy5pbmNsdWRpbmcpIHtcbiAgICAvLyBib3RoIHNlbGVjdG9yIGFuZCBwcm9qZWN0aW9uIGFyZSBwb2ludGluZyBvbiBmaWVsZHMgdG8gaW5jbHVkZVxuICAgIC8vIHNvIHdlIGNhbiBqdXN0IHJldHVybiB0aGUgbWVyZ2VkIHRyZWVcbiAgICByZXR1cm4gbWVyZ2VkUHJvamVjdGlvbjtcbiAgfVxuXG4gIC8vIHNlbGVjdG9yIGlzIHBvaW50aW5nIGF0IGZpZWxkcyB0byBpbmNsdWRlXG4gIC8vIHByb2plY3Rpb24gaXMgcG9pbnRpbmcgYXQgZmllbGRzIHRvIGV4Y2x1ZGVcbiAgLy8gbWFrZSBzdXJlIHdlIGRvbid0IGV4Y2x1ZGUgaW1wb3J0YW50IHBhdGhzXG4gIGNvbnN0IG1lcmdlZEV4Y2xQcm9qZWN0aW9uID0ge307XG5cbiAgT2JqZWN0LmtleXMobWVyZ2VkUHJvamVjdGlvbikuZm9yRWFjaChwYXRoID0+IHtcbiAgICBpZiAoIW1lcmdlZFByb2plY3Rpb25bcGF0aF0pIHtcbiAgICAgIG1lcmdlZEV4Y2xQcm9qZWN0aW9uW3BhdGhdID0gZmFsc2U7XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4gbWVyZ2VkRXhjbFByb2plY3Rpb247XG59XG5cbmZ1bmN0aW9uIGdldFBhdGhzKHNlbGVjdG9yKSB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhuZXcgTWluaW1vbmdvLk1hdGNoZXIoc2VsZWN0b3IpLl9wYXRocyk7XG5cbiAgLy8gWFhYIHJlbW92ZSBpdD9cbiAgLy8gcmV0dXJuIE9iamVjdC5rZXlzKHNlbGVjdG9yKS5tYXAoayA9PiB7XG4gIC8vICAgLy8gd2UgZG9uJ3Qga25vdyBob3cgdG8gaGFuZGxlICR3aGVyZSBiZWNhdXNlIGl0IGNhbiBiZSBhbnl0aGluZ1xuICAvLyAgIGlmIChrID09PSAnJHdoZXJlJykge1xuICAvLyAgICAgcmV0dXJuICcnOyAvLyBtYXRjaGVzIGV2ZXJ5dGhpbmdcbiAgLy8gICB9XG5cbiAgLy8gICAvLyB3ZSBicmFuY2ggZnJvbSAkb3IvJGFuZC8kbm9yIG9wZXJhdG9yXG4gIC8vICAgaWYgKFsnJG9yJywgJyRhbmQnLCAnJG5vciddLmluY2x1ZGVzKGspKSB7XG4gIC8vICAgICByZXR1cm4gc2VsZWN0b3Jba10ubWFwKGdldFBhdGhzKTtcbiAgLy8gICB9XG5cbiAgLy8gICAvLyB0aGUgdmFsdWUgaXMgYSBsaXRlcmFsIG9yIHNvbWUgY29tcGFyaXNvbiBvcGVyYXRvclxuICAvLyAgIHJldHVybiBrO1xuICAvLyB9KVxuICAvLyAgIC5yZWR1Y2UoKGEsIGIpID0+IGEuY29uY2F0KGIpLCBbXSlcbiAgLy8gICAuZmlsdGVyKChhLCBiLCBjKSA9PiBjLmluZGV4T2YoYSkgPT09IGIpO1xufVxuXG4vLyBBIGhlbHBlciB0byBlbnN1cmUgb2JqZWN0IGhhcyBvbmx5IGNlcnRhaW4ga2V5c1xuZnVuY3Rpb24gb25seUNvbnRhaW5zS2V5cyhvYmosIGtleXMpIHtcbiAgcmV0dXJuIE9iamVjdC5rZXlzKG9iaikuZXZlcnkoayA9PiBrZXlzLmluY2x1ZGVzKGspKTtcbn1cblxuZnVuY3Rpb24gcGF0aEhhc051bWVyaWNLZXlzKHBhdGgpIHtcbiAgcmV0dXJuIHBhdGguc3BsaXQoJy4nKS5zb21lKGlzTnVtZXJpY0tleSk7XG59XG5cbi8vIFJldHVybnMgYSBzZXQgb2Yga2V5IHBhdGhzIHNpbWlsYXIgdG9cbi8vIHsgJ2Zvby5iYXInOiAxLCAnYS5iLmMnOiAxIH1cbmZ1bmN0aW9uIHRyZWVUb1BhdGhzKHRyZWUsIHByZWZpeCA9ICcnKSB7XG4gIGNvbnN0IHJlc3VsdCA9IHt9O1xuXG4gIE9iamVjdC5rZXlzKHRyZWUpLmZvckVhY2goa2V5ID0+IHtcbiAgICBjb25zdCB2YWx1ZSA9IHRyZWVba2V5XTtcbiAgICBpZiAodmFsdWUgPT09IE9iamVjdCh2YWx1ZSkpIHtcbiAgICAgIE9iamVjdC5hc3NpZ24ocmVzdWx0LCB0cmVlVG9QYXRocyh2YWx1ZSwgYCR7cHJlZml4ICsga2V5fS5gKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdFtwcmVmaXggKyBrZXldID0gdmFsdWU7XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4gcmVzdWx0O1xufVxuIiwiaW1wb3J0IExvY2FsQ29sbGVjdGlvbiBmcm9tICcuL2xvY2FsX2NvbGxlY3Rpb24uanMnO1xuXG5leHBvcnQgY29uc3QgaGFzT3duID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcblxuLy8gRWFjaCBlbGVtZW50IHNlbGVjdG9yIGNvbnRhaW5zOlxuLy8gIC0gY29tcGlsZUVsZW1lbnRTZWxlY3RvciwgYSBmdW5jdGlvbiB3aXRoIGFyZ3M6XG4vLyAgICAtIG9wZXJhbmQgLSB0aGUgXCJyaWdodCBoYW5kIHNpZGVcIiBvZiB0aGUgb3BlcmF0b3Jcbi8vICAgIC0gdmFsdWVTZWxlY3RvciAtIHRoZSBcImNvbnRleHRcIiBmb3IgdGhlIG9wZXJhdG9yIChzbyB0aGF0ICRyZWdleCBjYW4gZmluZFxuLy8gICAgICAkb3B0aW9ucylcbi8vICAgIC0gbWF0Y2hlciAtIHRoZSBNYXRjaGVyIHRoaXMgaXMgZ29pbmcgaW50byAoc28gdGhhdCAkZWxlbU1hdGNoIGNhbiBjb21waWxlXG4vLyAgICAgIG1vcmUgdGhpbmdzKVxuLy8gICAgcmV0dXJuaW5nIGEgZnVuY3Rpb24gbWFwcGluZyBhIHNpbmdsZSB2YWx1ZSB0byBib29sLlxuLy8gIC0gZG9udEV4cGFuZExlYWZBcnJheXMsIGEgYm9vbCB3aGljaCBwcmV2ZW50cyBleHBhbmRBcnJheXNJbkJyYW5jaGVzIGZyb21cbi8vICAgIGJlaW5nIGNhbGxlZFxuLy8gIC0gZG9udEluY2x1ZGVMZWFmQXJyYXlzLCBhIGJvb2wgd2hpY2ggY2F1c2VzIGFuIGFyZ3VtZW50IHRvIGJlIHBhc3NlZCB0b1xuLy8gICAgZXhwYW5kQXJyYXlzSW5CcmFuY2hlcyBpZiBpdCBpcyBjYWxsZWRcbmV4cG9ydCBjb25zdCBFTEVNRU5UX09QRVJBVE9SUyA9IHtcbiAgJGx0OiBtYWtlSW5lcXVhbGl0eShjbXBWYWx1ZSA9PiBjbXBWYWx1ZSA8IDApLFxuICAkZ3Q6IG1ha2VJbmVxdWFsaXR5KGNtcFZhbHVlID0+IGNtcFZhbHVlID4gMCksXG4gICRsdGU6IG1ha2VJbmVxdWFsaXR5KGNtcFZhbHVlID0+IGNtcFZhbHVlIDw9IDApLFxuICAkZ3RlOiBtYWtlSW5lcXVhbGl0eShjbXBWYWx1ZSA9PiBjbXBWYWx1ZSA+PSAwKSxcbiAgJG1vZDoge1xuICAgIGNvbXBpbGVFbGVtZW50U2VsZWN0b3Iob3BlcmFuZCkge1xuICAgICAgaWYgKCEoQXJyYXkuaXNBcnJheShvcGVyYW5kKSAmJiBvcGVyYW5kLmxlbmd0aCA9PT0gMlxuICAgICAgICAgICAgJiYgdHlwZW9mIG9wZXJhbmRbMF0gPT09ICdudW1iZXInXG4gICAgICAgICAgICAmJiB0eXBlb2Ygb3BlcmFuZFsxXSA9PT0gJ251bWJlcicpKSB7XG4gICAgICAgIHRocm93IEVycm9yKCdhcmd1bWVudCB0byAkbW9kIG11c3QgYmUgYW4gYXJyYXkgb2YgdHdvIG51bWJlcnMnKTtcbiAgICAgIH1cblxuICAgICAgLy8gWFhYIGNvdWxkIHJlcXVpcmUgdG8gYmUgaW50cyBvciByb3VuZCBvciBzb21ldGhpbmdcbiAgICAgIGNvbnN0IGRpdmlzb3IgPSBvcGVyYW5kWzBdO1xuICAgICAgY29uc3QgcmVtYWluZGVyID0gb3BlcmFuZFsxXTtcbiAgICAgIHJldHVybiB2YWx1ZSA9PiAoXG4gICAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiYgdmFsdWUgJSBkaXZpc29yID09PSByZW1haW5kZXJcbiAgICAgICk7XG4gICAgfSxcbiAgfSxcbiAgJGluOiB7XG4gICAgY29tcGlsZUVsZW1lbnRTZWxlY3RvcihvcGVyYW5kKSB7XG4gICAgICBpZiAoIUFycmF5LmlzQXJyYXkob3BlcmFuZCkpIHtcbiAgICAgICAgdGhyb3cgRXJyb3IoJyRpbiBuZWVkcyBhbiBhcnJheScpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBlbGVtZW50TWF0Y2hlcnMgPSBvcGVyYW5kLm1hcChvcHRpb24gPT4ge1xuICAgICAgICBpZiAob3B0aW9uIGluc3RhbmNlb2YgUmVnRXhwKSB7XG4gICAgICAgICAgcmV0dXJuIHJlZ2V4cEVsZW1lbnRNYXRjaGVyKG9wdGlvbik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNPcGVyYXRvck9iamVjdChvcHRpb24pKSB7XG4gICAgICAgICAgdGhyb3cgRXJyb3IoJ2Nhbm5vdCBuZXN0ICQgdW5kZXIgJGluJyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZXF1YWxpdHlFbGVtZW50TWF0Y2hlcihvcHRpb24pO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiB2YWx1ZSA9PiB7XG4gICAgICAgIC8vIEFsbG93IHthOiB7JGluOiBbbnVsbF19fSB0byBtYXRjaCB3aGVuICdhJyBkb2VzIG5vdCBleGlzdC5cbiAgICAgICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICB2YWx1ZSA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZWxlbWVudE1hdGNoZXJzLnNvbWUobWF0Y2hlciA9PiBtYXRjaGVyKHZhbHVlKSk7XG4gICAgICB9O1xuICAgIH0sXG4gIH0sXG4gICRzaXplOiB7XG4gICAgLy8ge2E6IFtbNSwgNV1dfSBtdXN0IG1hdGNoIHthOiB7JHNpemU6IDF9fSBidXQgbm90IHthOiB7JHNpemU6IDJ9fSwgc28gd2VcbiAgICAvLyBkb24ndCB3YW50IHRvIGNvbnNpZGVyIHRoZSBlbGVtZW50IFs1LDVdIGluIHRoZSBsZWFmIGFycmF5IFtbNSw1XV0gYXMgYVxuICAgIC8vIHBvc3NpYmxlIHZhbHVlLlxuICAgIGRvbnRFeHBhbmRMZWFmQXJyYXlzOiB0cnVlLFxuICAgIGNvbXBpbGVFbGVtZW50U2VsZWN0b3Iob3BlcmFuZCkge1xuICAgICAgaWYgKHR5cGVvZiBvcGVyYW5kID09PSAnc3RyaW5nJykge1xuICAgICAgICAvLyBEb24ndCBhc2sgbWUgd2h5LCBidXQgYnkgZXhwZXJpbWVudGF0aW9uLCB0aGlzIHNlZW1zIHRvIGJlIHdoYXQgTW9uZ29cbiAgICAgICAgLy8gZG9lcy5cbiAgICAgICAgb3BlcmFuZCA9IDA7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvcGVyYW5kICE9PSAnbnVtYmVyJykge1xuICAgICAgICB0aHJvdyBFcnJvcignJHNpemUgbmVlZHMgYSBudW1iZXInKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHZhbHVlID0+IEFycmF5LmlzQXJyYXkodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA9PT0gb3BlcmFuZDtcbiAgICB9LFxuICB9LFxuICAkdHlwZToge1xuICAgIC8vIHthOiBbNV19IG11c3Qgbm90IG1hdGNoIHthOiB7JHR5cGU6IDR9fSAoNCBtZWFucyBhcnJheSksIGJ1dCBpdCBzaG91bGRcbiAgICAvLyBtYXRjaCB7YTogeyR0eXBlOiAxfX0gKDEgbWVhbnMgbnVtYmVyKSwgYW5kIHthOiBbWzVdXX0gbXVzdCBtYXRjaCB7JGE6XG4gICAgLy8geyR0eXBlOiA0fX0uIFRodXMsIHdoZW4gd2Ugc2VlIGEgbGVhZiBhcnJheSwgd2UgKnNob3VsZCogZXhwYW5kIGl0IGJ1dFxuICAgIC8vIHNob3VsZCAqbm90KiBpbmNsdWRlIGl0IGl0c2VsZi5cbiAgICBkb250SW5jbHVkZUxlYWZBcnJheXM6IHRydWUsXG4gICAgY29tcGlsZUVsZW1lbnRTZWxlY3RvcihvcGVyYW5kKSB7XG4gICAgICBpZiAodHlwZW9mIG9wZXJhbmQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGNvbnN0IG9wZXJhbmRBbGlhc01hcCA9IHtcbiAgICAgICAgICAnZG91YmxlJzogMSxcbiAgICAgICAgICAnc3RyaW5nJzogMixcbiAgICAgICAgICAnb2JqZWN0JzogMyxcbiAgICAgICAgICAnYXJyYXknOiA0LFxuICAgICAgICAgICdiaW5EYXRhJzogNSxcbiAgICAgICAgICAndW5kZWZpbmVkJzogNixcbiAgICAgICAgICAnb2JqZWN0SWQnOiA3LFxuICAgICAgICAgICdib29sJzogOCxcbiAgICAgICAgICAnZGF0ZSc6IDksXG4gICAgICAgICAgJ251bGwnOiAxMCxcbiAgICAgICAgICAncmVnZXgnOiAxMSxcbiAgICAgICAgICAnZGJQb2ludGVyJzogMTIsXG4gICAgICAgICAgJ2phdmFzY3JpcHQnOiAxMyxcbiAgICAgICAgICAnc3ltYm9sJzogMTQsXG4gICAgICAgICAgJ2phdmFzY3JpcHRXaXRoU2NvcGUnOiAxNSxcbiAgICAgICAgICAnaW50JzogMTYsXG4gICAgICAgICAgJ3RpbWVzdGFtcCc6IDE3LFxuICAgICAgICAgICdsb25nJzogMTgsXG4gICAgICAgICAgJ2RlY2ltYWwnOiAxOSxcbiAgICAgICAgICAnbWluS2V5JzogLTEsXG4gICAgICAgICAgJ21heEtleSc6IDEyNyxcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKCFoYXNPd24uY2FsbChvcGVyYW5kQWxpYXNNYXAsIG9wZXJhbmQpKSB7XG4gICAgICAgICAgdGhyb3cgRXJyb3IoYHVua25vd24gc3RyaW5nIGFsaWFzIGZvciAkdHlwZTogJHtvcGVyYW5kfWApO1xuICAgICAgICB9XG4gICAgICAgIG9wZXJhbmQgPSBvcGVyYW5kQWxpYXNNYXBbb3BlcmFuZF07XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvcGVyYW5kID09PSAnbnVtYmVyJykge1xuICAgICAgICBpZiAob3BlcmFuZCA9PT0gMCB8fCBvcGVyYW5kIDwgLTFcbiAgICAgICAgICB8fCAob3BlcmFuZCA+IDE5ICYmIG9wZXJhbmQgIT09IDEyNykpIHtcbiAgICAgICAgICB0aHJvdyBFcnJvcihgSW52YWxpZCBudW1lcmljYWwgJHR5cGUgY29kZTogJHtvcGVyYW5kfWApO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBFcnJvcignYXJndW1lbnQgdG8gJHR5cGUgaXMgbm90IGEgbnVtYmVyIG9yIGEgc3RyaW5nJyk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB2YWx1ZSA9PiAoXG4gICAgICAgIHZhbHVlICE9PSB1bmRlZmluZWQgJiYgTG9jYWxDb2xsZWN0aW9uLl9mLl90eXBlKHZhbHVlKSA9PT0gb3BlcmFuZFxuICAgICAgKTtcbiAgICB9LFxuICB9LFxuICAkYml0c0FsbFNldDoge1xuICAgIGNvbXBpbGVFbGVtZW50U2VsZWN0b3Iob3BlcmFuZCkge1xuICAgICAgY29uc3QgbWFzayA9IGdldE9wZXJhbmRCaXRtYXNrKG9wZXJhbmQsICckYml0c0FsbFNldCcpO1xuICAgICAgcmV0dXJuIHZhbHVlID0+IHtcbiAgICAgICAgY29uc3QgYml0bWFzayA9IGdldFZhbHVlQml0bWFzayh2YWx1ZSwgbWFzay5sZW5ndGgpO1xuICAgICAgICByZXR1cm4gYml0bWFzayAmJiBtYXNrLmV2ZXJ5KChieXRlLCBpKSA9PiAoYml0bWFza1tpXSAmIGJ5dGUpID09PSBieXRlKTtcbiAgICAgIH07XG4gICAgfSxcbiAgfSxcbiAgJGJpdHNBbnlTZXQ6IHtcbiAgICBjb21waWxlRWxlbWVudFNlbGVjdG9yKG9wZXJhbmQpIHtcbiAgICAgIGNvbnN0IG1hc2sgPSBnZXRPcGVyYW5kQml0bWFzayhvcGVyYW5kLCAnJGJpdHNBbnlTZXQnKTtcbiAgICAgIHJldHVybiB2YWx1ZSA9PiB7XG4gICAgICAgIGNvbnN0IGJpdG1hc2sgPSBnZXRWYWx1ZUJpdG1hc2sodmFsdWUsIG1hc2subGVuZ3RoKTtcbiAgICAgICAgcmV0dXJuIGJpdG1hc2sgJiYgbWFzay5zb21lKChieXRlLCBpKSA9PiAofmJpdG1hc2tbaV0gJiBieXRlKSAhPT0gYnl0ZSk7XG4gICAgICB9O1xuICAgIH0sXG4gIH0sXG4gICRiaXRzQWxsQ2xlYXI6IHtcbiAgICBjb21waWxlRWxlbWVudFNlbGVjdG9yKG9wZXJhbmQpIHtcbiAgICAgIGNvbnN0IG1hc2sgPSBnZXRPcGVyYW5kQml0bWFzayhvcGVyYW5kLCAnJGJpdHNBbGxDbGVhcicpO1xuICAgICAgcmV0dXJuIHZhbHVlID0+IHtcbiAgICAgICAgY29uc3QgYml0bWFzayA9IGdldFZhbHVlQml0bWFzayh2YWx1ZSwgbWFzay5sZW5ndGgpO1xuICAgICAgICByZXR1cm4gYml0bWFzayAmJiBtYXNrLmV2ZXJ5KChieXRlLCBpKSA9PiAhKGJpdG1hc2tbaV0gJiBieXRlKSk7XG4gICAgICB9O1xuICAgIH0sXG4gIH0sXG4gICRiaXRzQW55Q2xlYXI6IHtcbiAgICBjb21waWxlRWxlbWVudFNlbGVjdG9yKG9wZXJhbmQpIHtcbiAgICAgIGNvbnN0IG1hc2sgPSBnZXRPcGVyYW5kQml0bWFzayhvcGVyYW5kLCAnJGJpdHNBbnlDbGVhcicpO1xuICAgICAgcmV0dXJuIHZhbHVlID0+IHtcbiAgICAgICAgY29uc3QgYml0bWFzayA9IGdldFZhbHVlQml0bWFzayh2YWx1ZSwgbWFzay5sZW5ndGgpO1xuICAgICAgICByZXR1cm4gYml0bWFzayAmJiBtYXNrLnNvbWUoKGJ5dGUsIGkpID0+IChiaXRtYXNrW2ldICYgYnl0ZSkgIT09IGJ5dGUpO1xuICAgICAgfTtcbiAgICB9LFxuICB9LFxuICAkcmVnZXg6IHtcbiAgICBjb21waWxlRWxlbWVudFNlbGVjdG9yKG9wZXJhbmQsIHZhbHVlU2VsZWN0b3IpIHtcbiAgICAgIGlmICghKHR5cGVvZiBvcGVyYW5kID09PSAnc3RyaW5nJyB8fCBvcGVyYW5kIGluc3RhbmNlb2YgUmVnRXhwKSkge1xuICAgICAgICB0aHJvdyBFcnJvcignJHJlZ2V4IGhhcyB0byBiZSBhIHN0cmluZyBvciBSZWdFeHAnKTtcbiAgICAgIH1cblxuICAgICAgbGV0IHJlZ2V4cDtcbiAgICAgIGlmICh2YWx1ZVNlbGVjdG9yLiRvcHRpb25zICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgLy8gT3B0aW9ucyBwYXNzZWQgaW4gJG9wdGlvbnMgKGV2ZW4gdGhlIGVtcHR5IHN0cmluZykgYWx3YXlzIG92ZXJyaWRlc1xuICAgICAgICAvLyBvcHRpb25zIGluIHRoZSBSZWdFeHAgb2JqZWN0IGl0c2VsZi5cblxuICAgICAgICAvLyBCZSBjbGVhciB0aGF0IHdlIG9ubHkgc3VwcG9ydCB0aGUgSlMtc3VwcG9ydGVkIG9wdGlvbnMsIG5vdCBleHRlbmRlZFxuICAgICAgICAvLyBvbmVzIChlZywgTW9uZ28gc3VwcG9ydHMgeCBhbmQgcykuIElkZWFsbHkgd2Ugd291bGQgaW1wbGVtZW50IHggYW5kIHNcbiAgICAgICAgLy8gYnkgdHJhbnNmb3JtaW5nIHRoZSByZWdleHAsIGJ1dCBub3QgdG9kYXkuLi5cbiAgICAgICAgaWYgKC9bXmdpbV0vLnRlc3QodmFsdWVTZWxlY3Rvci4kb3B0aW9ucykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ09ubHkgdGhlIGksIG0sIGFuZCBnIHJlZ2V4cCBvcHRpb25zIGFyZSBzdXBwb3J0ZWQnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHNvdXJjZSA9IG9wZXJhbmQgaW5zdGFuY2VvZiBSZWdFeHAgPyBvcGVyYW5kLnNvdXJjZSA6IG9wZXJhbmQ7XG4gICAgICAgIHJlZ2V4cCA9IG5ldyBSZWdFeHAoc291cmNlLCB2YWx1ZVNlbGVjdG9yLiRvcHRpb25zKTtcbiAgICAgIH0gZWxzZSBpZiAob3BlcmFuZCBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuICAgICAgICByZWdleHAgPSBvcGVyYW5kO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVnZXhwID0gbmV3IFJlZ0V4cChvcGVyYW5kKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2V4cEVsZW1lbnRNYXRjaGVyKHJlZ2V4cCk7XG4gICAgfSxcbiAgfSxcbiAgJGVsZW1NYXRjaDoge1xuICAgIGRvbnRFeHBhbmRMZWFmQXJyYXlzOiB0cnVlLFxuICAgIGNvbXBpbGVFbGVtZW50U2VsZWN0b3Iob3BlcmFuZCwgdmFsdWVTZWxlY3RvciwgbWF0Y2hlcikge1xuICAgICAgaWYgKCFMb2NhbENvbGxlY3Rpb24uX2lzUGxhaW5PYmplY3Qob3BlcmFuZCkpIHtcbiAgICAgICAgdGhyb3cgRXJyb3IoJyRlbGVtTWF0Y2ggbmVlZCBhbiBvYmplY3QnKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgaXNEb2NNYXRjaGVyID0gIWlzT3BlcmF0b3JPYmplY3QoXG4gICAgICAgIE9iamVjdC5rZXlzKG9wZXJhbmQpXG4gICAgICAgICAgLmZpbHRlcihrZXkgPT4gIWhhc093bi5jYWxsKExPR0lDQUxfT1BFUkFUT1JTLCBrZXkpKVxuICAgICAgICAgIC5yZWR1Y2UoKGEsIGIpID0+IE9iamVjdC5hc3NpZ24oYSwge1tiXTogb3BlcmFuZFtiXX0pLCB7fSksXG4gICAgICAgIHRydWUpO1xuXG4gICAgICBsZXQgc3ViTWF0Y2hlcjtcbiAgICAgIGlmIChpc0RvY01hdGNoZXIpIHtcbiAgICAgICAgLy8gVGhpcyBpcyBOT1QgdGhlIHNhbWUgYXMgY29tcGlsZVZhbHVlU2VsZWN0b3Iob3BlcmFuZCksIGFuZCBub3QganVzdFxuICAgICAgICAvLyBiZWNhdXNlIG9mIHRoZSBzbGlnaHRseSBkaWZmZXJlbnQgY2FsbGluZyBjb252ZW50aW9uLlxuICAgICAgICAvLyB7JGVsZW1NYXRjaDoge3g6IDN9fSBtZWFucyBcImFuIGVsZW1lbnQgaGFzIGEgZmllbGQgeDozXCIsIG5vdFxuICAgICAgICAvLyBcImNvbnNpc3RzIG9ubHkgb2YgYSBmaWVsZCB4OjNcIi4gQWxzbywgcmVnZXhwcyBhbmQgc3ViLSQgYXJlIGFsbG93ZWQuXG4gICAgICAgIHN1Yk1hdGNoZXIgPVxuICAgICAgICAgIGNvbXBpbGVEb2N1bWVudFNlbGVjdG9yKG9wZXJhbmQsIG1hdGNoZXIsIHtpbkVsZW1NYXRjaDogdHJ1ZX0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3ViTWF0Y2hlciA9IGNvbXBpbGVWYWx1ZVNlbGVjdG9yKG9wZXJhbmQsIG1hdGNoZXIpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gdmFsdWUgPT4ge1xuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5sZW5ndGg7ICsraSkge1xuICAgICAgICAgIGNvbnN0IGFycmF5RWxlbWVudCA9IHZhbHVlW2ldO1xuICAgICAgICAgIGxldCBhcmc7XG4gICAgICAgICAgaWYgKGlzRG9jTWF0Y2hlcikge1xuICAgICAgICAgICAgLy8gV2UgY2FuIG9ubHkgbWF0Y2ggeyRlbGVtTWF0Y2g6IHtiOiAzfX0gYWdhaW5zdCBvYmplY3RzLlxuICAgICAgICAgICAgLy8gKFdlIGNhbiBhbHNvIG1hdGNoIGFnYWluc3QgYXJyYXlzLCBpZiB0aGVyZSdzIG51bWVyaWMgaW5kaWNlcyxcbiAgICAgICAgICAgIC8vIGVnIHskZWxlbU1hdGNoOiB7JzAuYic6IDN9fSBvciB7JGVsZW1NYXRjaDogezA6IDN9fS4pXG4gICAgICAgICAgICBpZiAoIWlzSW5kZXhhYmxlKGFycmF5RWxlbWVudCkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBhcmcgPSBhcnJheUVsZW1lbnQ7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIGRvbnRJdGVyYXRlIGVuc3VyZXMgdGhhdCB7YTogeyRlbGVtTWF0Y2g6IHskZ3Q6IDV9fX0gbWF0Y2hlc1xuICAgICAgICAgICAgLy8ge2E6IFs4XX0gYnV0IG5vdCB7YTogW1s4XV19XG4gICAgICAgICAgICBhcmcgPSBbe3ZhbHVlOiBhcnJheUVsZW1lbnQsIGRvbnRJdGVyYXRlOiB0cnVlfV07XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIFhYWCBzdXBwb3J0ICRuZWFyIGluICRlbGVtTWF0Y2ggYnkgcHJvcGFnYXRpbmcgJGRpc3RhbmNlP1xuICAgICAgICAgIGlmIChzdWJNYXRjaGVyKGFyZykucmVzdWx0KSB7XG4gICAgICAgICAgICByZXR1cm4gaTsgLy8gc3BlY2lhbGx5IHVuZGVyc3Rvb2QgdG8gbWVhbiBcInVzZSBhcyBhcnJheUluZGljZXNcIlxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH07XG4gICAgfSxcbiAgfSxcbn07XG5cbi8vIE9wZXJhdG9ycyB0aGF0IGFwcGVhciBhdCB0aGUgdG9wIGxldmVsIG9mIGEgZG9jdW1lbnQgc2VsZWN0b3IuXG5jb25zdCBMT0dJQ0FMX09QRVJBVE9SUyA9IHtcbiAgJGFuZChzdWJTZWxlY3RvciwgbWF0Y2hlciwgaW5FbGVtTWF0Y2gpIHtcbiAgICByZXR1cm4gYW5kRG9jdW1lbnRNYXRjaGVycyhcbiAgICAgIGNvbXBpbGVBcnJheU9mRG9jdW1lbnRTZWxlY3RvcnMoc3ViU2VsZWN0b3IsIG1hdGNoZXIsIGluRWxlbU1hdGNoKVxuICAgICk7XG4gIH0sXG5cbiAgJG9yKHN1YlNlbGVjdG9yLCBtYXRjaGVyLCBpbkVsZW1NYXRjaCkge1xuICAgIGNvbnN0IG1hdGNoZXJzID0gY29tcGlsZUFycmF5T2ZEb2N1bWVudFNlbGVjdG9ycyhcbiAgICAgIHN1YlNlbGVjdG9yLFxuICAgICAgbWF0Y2hlcixcbiAgICAgIGluRWxlbU1hdGNoXG4gICAgKTtcblxuICAgIC8vIFNwZWNpYWwgY2FzZTogaWYgdGhlcmUgaXMgb25seSBvbmUgbWF0Y2hlciwgdXNlIGl0IGRpcmVjdGx5LCAqcHJlc2VydmluZypcbiAgICAvLyBhbnkgYXJyYXlJbmRpY2VzIGl0IHJldHVybnMuXG4gICAgaWYgKG1hdGNoZXJzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgcmV0dXJuIG1hdGNoZXJzWzBdO1xuICAgIH1cblxuICAgIHJldHVybiBkb2MgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gbWF0Y2hlcnMuc29tZShmbiA9PiBmbihkb2MpLnJlc3VsdCk7XG4gICAgICAvLyAkb3IgZG9lcyBOT1Qgc2V0IGFycmF5SW5kaWNlcyB3aGVuIGl0IGhhcyBtdWx0aXBsZVxuICAgICAgLy8gc3ViLWV4cHJlc3Npb25zLiAoVGVzdGVkIGFnYWluc3QgTW9uZ29EQi4pXG4gICAgICByZXR1cm4ge3Jlc3VsdH07XG4gICAgfTtcbiAgfSxcblxuICAkbm9yKHN1YlNlbGVjdG9yLCBtYXRjaGVyLCBpbkVsZW1NYXRjaCkge1xuICAgIGNvbnN0IG1hdGNoZXJzID0gY29tcGlsZUFycmF5T2ZEb2N1bWVudFNlbGVjdG9ycyhcbiAgICAgIHN1YlNlbGVjdG9yLFxuICAgICAgbWF0Y2hlcixcbiAgICAgIGluRWxlbU1hdGNoXG4gICAgKTtcbiAgICByZXR1cm4gZG9jID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IG1hdGNoZXJzLmV2ZXJ5KGZuID0+ICFmbihkb2MpLnJlc3VsdCk7XG4gICAgICAvLyBOZXZlciBzZXQgYXJyYXlJbmRpY2VzLCBiZWNhdXNlIHdlIG9ubHkgbWF0Y2ggaWYgbm90aGluZyBpbiBwYXJ0aWN1bGFyXG4gICAgICAvLyAnbWF0Y2hlZCcgKGFuZCBiZWNhdXNlIHRoaXMgaXMgY29uc2lzdGVudCB3aXRoIE1vbmdvREIpLlxuICAgICAgcmV0dXJuIHtyZXN1bHR9O1xuICAgIH07XG4gIH0sXG5cbiAgJHdoZXJlKHNlbGVjdG9yVmFsdWUsIG1hdGNoZXIpIHtcbiAgICAvLyBSZWNvcmQgdGhhdCAqYW55KiBwYXRoIG1heSBiZSB1c2VkLlxuICAgIG1hdGNoZXIuX3JlY29yZFBhdGhVc2VkKCcnKTtcbiAgICBtYXRjaGVyLl9oYXNXaGVyZSA9IHRydWU7XG5cbiAgICBpZiAoIShzZWxlY3RvclZhbHVlIGluc3RhbmNlb2YgRnVuY3Rpb24pKSB7XG4gICAgICAvLyBYWFggTW9uZ29EQiBzZWVtcyB0byBoYXZlIG1vcmUgY29tcGxleCBsb2dpYyB0byBkZWNpZGUgd2hlcmUgb3Igb3Igbm90XG4gICAgICAvLyB0byBhZGQgJ3JldHVybic7IG5vdCBzdXJlIGV4YWN0bHkgd2hhdCBpdCBpcy5cbiAgICAgIHNlbGVjdG9yVmFsdWUgPSBGdW5jdGlvbignb2JqJywgYHJldHVybiAke3NlbGVjdG9yVmFsdWV9YCk7XG4gICAgfVxuXG4gICAgLy8gV2UgbWFrZSB0aGUgZG9jdW1lbnQgYXZhaWxhYmxlIGFzIGJvdGggYHRoaXNgIGFuZCBgb2JqYC5cbiAgICAvLyAvLyBYWFggbm90IHN1cmUgd2hhdCB3ZSBzaG91bGQgZG8gaWYgdGhpcyB0aHJvd3NcbiAgICByZXR1cm4gZG9jID0+ICh7cmVzdWx0OiBzZWxlY3RvclZhbHVlLmNhbGwoZG9jLCBkb2MpfSk7XG4gIH0sXG5cbiAgLy8gVGhpcyBpcyBqdXN0IHVzZWQgYXMgYSBjb21tZW50IGluIHRoZSBxdWVyeSAoaW4gTW9uZ29EQiwgaXQgYWxzbyBlbmRzIHVwIGluXG4gIC8vIHF1ZXJ5IGxvZ3MpOyBpdCBoYXMgbm8gZWZmZWN0IG9uIHRoZSBhY3R1YWwgc2VsZWN0aW9uLlxuICAkY29tbWVudCgpIHtcbiAgICByZXR1cm4gKCkgPT4gKHtyZXN1bHQ6IHRydWV9KTtcbiAgfSxcbn07XG5cbi8vIE9wZXJhdG9ycyB0aGF0ICh1bmxpa2UgTE9HSUNBTF9PUEVSQVRPUlMpIHBlcnRhaW4gdG8gaW5kaXZpZHVhbCBwYXRocyBpbiBhXG4vLyBkb2N1bWVudCwgYnV0ICh1bmxpa2UgRUxFTUVOVF9PUEVSQVRPUlMpIGRvIG5vdCBoYXZlIGEgc2ltcGxlIGRlZmluaXRpb24gYXNcbi8vIFwibWF0Y2ggZWFjaCBicmFuY2hlZCB2YWx1ZSBpbmRlcGVuZGVudGx5IGFuZCBjb21iaW5lIHdpdGhcbi8vIGNvbnZlcnRFbGVtZW50TWF0Y2hlclRvQnJhbmNoZWRNYXRjaGVyXCIuXG5jb25zdCBWQUxVRV9PUEVSQVRPUlMgPSB7XG4gICRlcShvcGVyYW5kKSB7XG4gICAgcmV0dXJuIGNvbnZlcnRFbGVtZW50TWF0Y2hlclRvQnJhbmNoZWRNYXRjaGVyKFxuICAgICAgZXF1YWxpdHlFbGVtZW50TWF0Y2hlcihvcGVyYW5kKVxuICAgICk7XG4gIH0sXG4gICRub3Qob3BlcmFuZCwgdmFsdWVTZWxlY3RvciwgbWF0Y2hlcikge1xuICAgIHJldHVybiBpbnZlcnRCcmFuY2hlZE1hdGNoZXIoY29tcGlsZVZhbHVlU2VsZWN0b3Iob3BlcmFuZCwgbWF0Y2hlcikpO1xuICB9LFxuICAkbmUob3BlcmFuZCkge1xuICAgIHJldHVybiBpbnZlcnRCcmFuY2hlZE1hdGNoZXIoXG4gICAgICBjb252ZXJ0RWxlbWVudE1hdGNoZXJUb0JyYW5jaGVkTWF0Y2hlcihlcXVhbGl0eUVsZW1lbnRNYXRjaGVyKG9wZXJhbmQpKVxuICAgICk7XG4gIH0sXG4gICRuaW4ob3BlcmFuZCkge1xuICAgIHJldHVybiBpbnZlcnRCcmFuY2hlZE1hdGNoZXIoXG4gICAgICBjb252ZXJ0RWxlbWVudE1hdGNoZXJUb0JyYW5jaGVkTWF0Y2hlcihcbiAgICAgICAgRUxFTUVOVF9PUEVSQVRPUlMuJGluLmNvbXBpbGVFbGVtZW50U2VsZWN0b3Iob3BlcmFuZClcbiAgICAgIClcbiAgICApO1xuICB9LFxuICAkZXhpc3RzKG9wZXJhbmQpIHtcbiAgICBjb25zdCBleGlzdHMgPSBjb252ZXJ0RWxlbWVudE1hdGNoZXJUb0JyYW5jaGVkTWF0Y2hlcihcbiAgICAgIHZhbHVlID0+IHZhbHVlICE9PSB1bmRlZmluZWRcbiAgICApO1xuICAgIHJldHVybiBvcGVyYW5kID8gZXhpc3RzIDogaW52ZXJ0QnJhbmNoZWRNYXRjaGVyKGV4aXN0cyk7XG4gIH0sXG4gIC8vICRvcHRpb25zIGp1c3QgcHJvdmlkZXMgb3B0aW9ucyBmb3IgJHJlZ2V4OyBpdHMgbG9naWMgaXMgaW5zaWRlICRyZWdleFxuICAkb3B0aW9ucyhvcGVyYW5kLCB2YWx1ZVNlbGVjdG9yKSB7XG4gICAgaWYgKCFoYXNPd24uY2FsbCh2YWx1ZVNlbGVjdG9yLCAnJHJlZ2V4JykpIHtcbiAgICAgIHRocm93IEVycm9yKCckb3B0aW9ucyBuZWVkcyBhICRyZWdleCcpO1xuICAgIH1cblxuICAgIHJldHVybiBldmVyeXRoaW5nTWF0Y2hlcjtcbiAgfSxcbiAgLy8gJG1heERpc3RhbmNlIGlzIGJhc2ljYWxseSBhbiBhcmd1bWVudCB0byAkbmVhclxuICAkbWF4RGlzdGFuY2Uob3BlcmFuZCwgdmFsdWVTZWxlY3Rvcikge1xuICAgIGlmICghdmFsdWVTZWxlY3Rvci4kbmVhcikge1xuICAgICAgdGhyb3cgRXJyb3IoJyRtYXhEaXN0YW5jZSBuZWVkcyBhICRuZWFyJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGV2ZXJ5dGhpbmdNYXRjaGVyO1xuICB9LFxuICAkYWxsKG9wZXJhbmQsIHZhbHVlU2VsZWN0b3IsIG1hdGNoZXIpIHtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkob3BlcmFuZCkpIHtcbiAgICAgIHRocm93IEVycm9yKCckYWxsIHJlcXVpcmVzIGFycmF5Jyk7XG4gICAgfVxuXG4gICAgLy8gTm90IHN1cmUgd2h5LCBidXQgdGhpcyBzZWVtcyB0byBiZSB3aGF0IE1vbmdvREIgZG9lcy5cbiAgICBpZiAob3BlcmFuZC5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiBub3RoaW5nTWF0Y2hlcjtcbiAgICB9XG5cbiAgICBjb25zdCBicmFuY2hlZE1hdGNoZXJzID0gb3BlcmFuZC5tYXAoY3JpdGVyaW9uID0+IHtcbiAgICAgIC8vIFhYWCBoYW5kbGUgJGFsbC8kZWxlbU1hdGNoIGNvbWJpbmF0aW9uXG4gICAgICBpZiAoaXNPcGVyYXRvck9iamVjdChjcml0ZXJpb24pKSB7XG4gICAgICAgIHRocm93IEVycm9yKCdubyAkIGV4cHJlc3Npb25zIGluICRhbGwnKTtcbiAgICAgIH1cblxuICAgICAgLy8gVGhpcyBpcyBhbHdheXMgYSByZWdleHAgb3IgZXF1YWxpdHkgc2VsZWN0b3IuXG4gICAgICByZXR1cm4gY29tcGlsZVZhbHVlU2VsZWN0b3IoY3JpdGVyaW9uLCBtYXRjaGVyKTtcbiAgICB9KTtcblxuICAgIC8vIGFuZEJyYW5jaGVkTWF0Y2hlcnMgZG9lcyBOT1QgcmVxdWlyZSBhbGwgc2VsZWN0b3JzIHRvIHJldHVybiB0cnVlIG9uIHRoZVxuICAgIC8vIFNBTUUgYnJhbmNoLlxuICAgIHJldHVybiBhbmRCcmFuY2hlZE1hdGNoZXJzKGJyYW5jaGVkTWF0Y2hlcnMpO1xuICB9LFxuICAkbmVhcihvcGVyYW5kLCB2YWx1ZVNlbGVjdG9yLCBtYXRjaGVyLCBpc1Jvb3QpIHtcbiAgICBpZiAoIWlzUm9vdCkge1xuICAgICAgdGhyb3cgRXJyb3IoJyRuZWFyIGNhblxcJ3QgYmUgaW5zaWRlIGFub3RoZXIgJCBvcGVyYXRvcicpO1xuICAgIH1cblxuICAgIG1hdGNoZXIuX2hhc0dlb1F1ZXJ5ID0gdHJ1ZTtcblxuICAgIC8vIFRoZXJlIGFyZSB0d28ga2luZHMgb2YgZ2VvZGF0YSBpbiBNb25nb0RCOiBsZWdhY3kgY29vcmRpbmF0ZSBwYWlycyBhbmRcbiAgICAvLyBHZW9KU09OLiBUaGV5IHVzZSBkaWZmZXJlbnQgZGlzdGFuY2UgbWV0cmljcywgdG9vLiBHZW9KU09OIHF1ZXJpZXMgYXJlXG4gICAgLy8gbWFya2VkIHdpdGggYSAkZ2VvbWV0cnkgcHJvcGVydHksIHRob3VnaCBsZWdhY3kgY29vcmRpbmF0ZXMgY2FuIGJlXG4gICAgLy8gbWF0Y2hlZCB1c2luZyAkZ2VvbWV0cnkuXG4gICAgbGV0IG1heERpc3RhbmNlLCBwb2ludCwgZGlzdGFuY2U7XG4gICAgaWYgKExvY2FsQ29sbGVjdGlvbi5faXNQbGFpbk9iamVjdChvcGVyYW5kKSAmJiBoYXNPd24uY2FsbChvcGVyYW5kLCAnJGdlb21ldHJ5JykpIHtcbiAgICAgIC8vIEdlb0pTT04gXCIyZHNwaGVyZVwiIG1vZGUuXG4gICAgICBtYXhEaXN0YW5jZSA9IG9wZXJhbmQuJG1heERpc3RhbmNlO1xuICAgICAgcG9pbnQgPSBvcGVyYW5kLiRnZW9tZXRyeTtcbiAgICAgIGRpc3RhbmNlID0gdmFsdWUgPT4ge1xuICAgICAgICAvLyBYWFg6IGZvciBub3csIHdlIGRvbid0IGNhbGN1bGF0ZSB0aGUgYWN0dWFsIGRpc3RhbmNlIGJldHdlZW4sIHNheSxcbiAgICAgICAgLy8gcG9seWdvbiBhbmQgY2lyY2xlLiBJZiBwZW9wbGUgY2FyZSBhYm91dCB0aGlzIHVzZS1jYXNlIGl0IHdpbGwgZ2V0XG4gICAgICAgIC8vIGEgcHJpb3JpdHkuXG4gICAgICAgIGlmICghdmFsdWUpIHtcbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdmFsdWUudHlwZSkge1xuICAgICAgICAgIHJldHVybiBHZW9KU09OLnBvaW50RGlzdGFuY2UoXG4gICAgICAgICAgICBwb2ludCxcbiAgICAgICAgICAgIHt0eXBlOiAnUG9pbnQnLCBjb29yZGluYXRlczogcG9pbnRUb0FycmF5KHZhbHVlKX1cbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHZhbHVlLnR5cGUgPT09ICdQb2ludCcpIHtcbiAgICAgICAgICByZXR1cm4gR2VvSlNPTi5wb2ludERpc3RhbmNlKHBvaW50LCB2YWx1ZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gR2VvSlNPTi5nZW9tZXRyeVdpdGhpblJhZGl1cyh2YWx1ZSwgcG9pbnQsIG1heERpc3RhbmNlKVxuICAgICAgICAgID8gMFxuICAgICAgICAgIDogbWF4RGlzdGFuY2UgKyAxO1xuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgbWF4RGlzdGFuY2UgPSB2YWx1ZVNlbGVjdG9yLiRtYXhEaXN0YW5jZTtcblxuICAgICAgaWYgKCFpc0luZGV4YWJsZShvcGVyYW5kKSkge1xuICAgICAgICB0aHJvdyBFcnJvcignJG5lYXIgYXJndW1lbnQgbXVzdCBiZSBjb29yZGluYXRlIHBhaXIgb3IgR2VvSlNPTicpO1xuICAgICAgfVxuXG4gICAgICBwb2ludCA9IHBvaW50VG9BcnJheShvcGVyYW5kKTtcblxuICAgICAgZGlzdGFuY2UgPSB2YWx1ZSA9PiB7XG4gICAgICAgIGlmICghaXNJbmRleGFibGUodmFsdWUpKSB7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZGlzdGFuY2VDb29yZGluYXRlUGFpcnMocG9pbnQsIHZhbHVlKTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIGJyYW5jaGVkVmFsdWVzID0+IHtcbiAgICAgIC8vIFRoZXJlIG1pZ2h0IGJlIG11bHRpcGxlIHBvaW50cyBpbiB0aGUgZG9jdW1lbnQgdGhhdCBtYXRjaCB0aGUgZ2l2ZW5cbiAgICAgIC8vIGZpZWxkLiBPbmx5IG9uZSBvZiB0aGVtIG5lZWRzIHRvIGJlIHdpdGhpbiAkbWF4RGlzdGFuY2UsIGJ1dCB3ZSBuZWVkIHRvXG4gICAgICAvLyBldmFsdWF0ZSBhbGwgb2YgdGhlbSBhbmQgdXNlIHRoZSBuZWFyZXN0IG9uZSBmb3IgdGhlIGltcGxpY2l0IHNvcnRcbiAgICAgIC8vIHNwZWNpZmllci4gKFRoYXQncyB3aHkgd2UgY2FuJ3QganVzdCB1c2UgRUxFTUVOVF9PUEVSQVRPUlMgaGVyZS4pXG4gICAgICAvL1xuICAgICAgLy8gTm90ZTogVGhpcyBkaWZmZXJzIGZyb20gTW9uZ29EQidzIGltcGxlbWVudGF0aW9uLCB3aGVyZSBhIGRvY3VtZW50IHdpbGxcbiAgICAgIC8vIGFjdHVhbGx5IHNob3cgdXAgKm11bHRpcGxlIHRpbWVzKiBpbiB0aGUgcmVzdWx0IHNldCwgd2l0aCBvbmUgZW50cnkgZm9yXG4gICAgICAvLyBlYWNoIHdpdGhpbi0kbWF4RGlzdGFuY2UgYnJhbmNoaW5nIHBvaW50LlxuICAgICAgY29uc3QgcmVzdWx0ID0ge3Jlc3VsdDogZmFsc2V9O1xuICAgICAgZXhwYW5kQXJyYXlzSW5CcmFuY2hlcyhicmFuY2hlZFZhbHVlcykuZXZlcnkoYnJhbmNoID0+IHtcbiAgICAgICAgLy8gaWYgb3BlcmF0aW9uIGlzIGFuIHVwZGF0ZSwgZG9uJ3Qgc2tpcCBicmFuY2hlcywganVzdCByZXR1cm4gdGhlIGZpcnN0XG4gICAgICAgIC8vIG9uZSAoIzM1OTkpXG4gICAgICAgIGxldCBjdXJEaXN0YW5jZTtcbiAgICAgICAgaWYgKCFtYXRjaGVyLl9pc1VwZGF0ZSkge1xuICAgICAgICAgIGlmICghKHR5cGVvZiBicmFuY2gudmFsdWUgPT09ICdvYmplY3QnKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY3VyRGlzdGFuY2UgPSBkaXN0YW5jZShicmFuY2gudmFsdWUpO1xuXG4gICAgICAgICAgLy8gU2tpcCBicmFuY2hlcyB0aGF0IGFyZW4ndCByZWFsIHBvaW50cyBvciBhcmUgdG9vIGZhciBhd2F5LlxuICAgICAgICAgIGlmIChjdXJEaXN0YW5jZSA9PT0gbnVsbCB8fCBjdXJEaXN0YW5jZSA+IG1heERpc3RhbmNlKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBTa2lwIGFueXRoaW5nIHRoYXQncyBhIHRpZS5cbiAgICAgICAgICBpZiAocmVzdWx0LmRpc3RhbmNlICE9PSB1bmRlZmluZWQgJiYgcmVzdWx0LmRpc3RhbmNlIDw9IGN1ckRpc3RhbmNlKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXN1bHQucmVzdWx0ID0gdHJ1ZTtcbiAgICAgICAgcmVzdWx0LmRpc3RhbmNlID0gY3VyRGlzdGFuY2U7XG5cbiAgICAgICAgaWYgKGJyYW5jaC5hcnJheUluZGljZXMpIHtcbiAgICAgICAgICByZXN1bHQuYXJyYXlJbmRpY2VzID0gYnJhbmNoLmFycmF5SW5kaWNlcztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkZWxldGUgcmVzdWx0LmFycmF5SW5kaWNlcztcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiAhbWF0Y2hlci5faXNVcGRhdGU7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9O1xuICB9LFxufTtcblxuLy8gTkI6IFdlIGFyZSBjaGVhdGluZyBhbmQgdXNpbmcgdGhpcyBmdW5jdGlvbiB0byBpbXBsZW1lbnQgJ0FORCcgZm9yIGJvdGhcbi8vICdkb2N1bWVudCBtYXRjaGVycycgYW5kICdicmFuY2hlZCBtYXRjaGVycycuIFRoZXkgYm90aCByZXR1cm4gcmVzdWx0IG9iamVjdHNcbi8vIGJ1dCB0aGUgYXJndW1lbnQgaXMgZGlmZmVyZW50OiBmb3IgdGhlIGZvcm1lciBpdCdzIGEgd2hvbGUgZG9jLCB3aGVyZWFzIGZvclxuLy8gdGhlIGxhdHRlciBpdCdzIGFuIGFycmF5IG9mICdicmFuY2hlZCB2YWx1ZXMnLlxuZnVuY3Rpb24gYW5kU29tZU1hdGNoZXJzKHN1Yk1hdGNoZXJzKSB7XG4gIGlmIChzdWJNYXRjaGVycy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gZXZlcnl0aGluZ01hdGNoZXI7XG4gIH1cblxuICBpZiAoc3ViTWF0Y2hlcnMubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIHN1Yk1hdGNoZXJzWzBdO1xuICB9XG5cbiAgcmV0dXJuIGRvY09yQnJhbmNoZXMgPT4ge1xuICAgIGNvbnN0IG1hdGNoID0ge307XG4gICAgbWF0Y2gucmVzdWx0ID0gc3ViTWF0Y2hlcnMuZXZlcnkoZm4gPT4ge1xuICAgICAgY29uc3Qgc3ViUmVzdWx0ID0gZm4oZG9jT3JCcmFuY2hlcyk7XG5cbiAgICAgIC8vIENvcHkgYSAnZGlzdGFuY2UnIG51bWJlciBvdXQgb2YgdGhlIGZpcnN0IHN1Yi1tYXRjaGVyIHRoYXQgaGFzXG4gICAgICAvLyBvbmUuIFllcywgdGhpcyBtZWFucyB0aGF0IGlmIHRoZXJlIGFyZSBtdWx0aXBsZSAkbmVhciBmaWVsZHMgaW4gYVxuICAgICAgLy8gcXVlcnksIHNvbWV0aGluZyBhcmJpdHJhcnkgaGFwcGVuczsgdGhpcyBhcHBlYXJzIHRvIGJlIGNvbnNpc3RlbnQgd2l0aFxuICAgICAgLy8gTW9uZ28uXG4gICAgICBpZiAoc3ViUmVzdWx0LnJlc3VsdCAmJlxuICAgICAgICAgIHN1YlJlc3VsdC5kaXN0YW5jZSAhPT0gdW5kZWZpbmVkICYmXG4gICAgICAgICAgbWF0Y2guZGlzdGFuY2UgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBtYXRjaC5kaXN0YW5jZSA9IHN1YlJlc3VsdC5kaXN0YW5jZTtcbiAgICAgIH1cblxuICAgICAgLy8gU2ltaWxhcmx5LCBwcm9wYWdhdGUgYXJyYXlJbmRpY2VzIGZyb20gc3ViLW1hdGNoZXJzLi4uIGJ1dCB0byBtYXRjaFxuICAgICAgLy8gTW9uZ29EQiBiZWhhdmlvciwgdGhpcyB0aW1lIHRoZSAqbGFzdCogc3ViLW1hdGNoZXIgd2l0aCBhcnJheUluZGljZXNcbiAgICAgIC8vIHdpbnMuXG4gICAgICBpZiAoc3ViUmVzdWx0LnJlc3VsdCAmJiBzdWJSZXN1bHQuYXJyYXlJbmRpY2VzKSB7XG4gICAgICAgIG1hdGNoLmFycmF5SW5kaWNlcyA9IHN1YlJlc3VsdC5hcnJheUluZGljZXM7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBzdWJSZXN1bHQucmVzdWx0O1xuICAgIH0pO1xuXG4gICAgLy8gSWYgd2UgZGlkbid0IGFjdHVhbGx5IG1hdGNoLCBmb3JnZXQgYW55IGV4dHJhIG1ldGFkYXRhIHdlIGNhbWUgdXAgd2l0aC5cbiAgICBpZiAoIW1hdGNoLnJlc3VsdCkge1xuICAgICAgZGVsZXRlIG1hdGNoLmRpc3RhbmNlO1xuICAgICAgZGVsZXRlIG1hdGNoLmFycmF5SW5kaWNlcztcbiAgICB9XG5cbiAgICByZXR1cm4gbWF0Y2g7XG4gIH07XG59XG5cbmNvbnN0IGFuZERvY3VtZW50TWF0Y2hlcnMgPSBhbmRTb21lTWF0Y2hlcnM7XG5jb25zdCBhbmRCcmFuY2hlZE1hdGNoZXJzID0gYW5kU29tZU1hdGNoZXJzO1xuXG5mdW5jdGlvbiBjb21waWxlQXJyYXlPZkRvY3VtZW50U2VsZWN0b3JzKHNlbGVjdG9ycywgbWF0Y2hlciwgaW5FbGVtTWF0Y2gpIHtcbiAgaWYgKCFBcnJheS5pc0FycmF5KHNlbGVjdG9ycykgfHwgc2VsZWN0b3JzLmxlbmd0aCA9PT0gMCkge1xuICAgIHRocm93IEVycm9yKCckYW5kLyRvci8kbm9yIG11c3QgYmUgbm9uZW1wdHkgYXJyYXknKTtcbiAgfVxuXG4gIHJldHVybiBzZWxlY3RvcnMubWFwKHN1YlNlbGVjdG9yID0+IHtcbiAgICBpZiAoIUxvY2FsQ29sbGVjdGlvbi5faXNQbGFpbk9iamVjdChzdWJTZWxlY3RvcikpIHtcbiAgICAgIHRocm93IEVycm9yKCckb3IvJGFuZC8kbm9yIGVudHJpZXMgbmVlZCB0byBiZSBmdWxsIG9iamVjdHMnKTtcbiAgICB9XG5cbiAgICByZXR1cm4gY29tcGlsZURvY3VtZW50U2VsZWN0b3Ioc3ViU2VsZWN0b3IsIG1hdGNoZXIsIHtpbkVsZW1NYXRjaH0pO1xuICB9KTtcbn1cblxuLy8gVGFrZXMgaW4gYSBzZWxlY3RvciB0aGF0IGNvdWxkIG1hdGNoIGEgZnVsbCBkb2N1bWVudCAoZWcsIHRoZSBvcmlnaW5hbFxuLy8gc2VsZWN0b3IpLiBSZXR1cm5zIGEgZnVuY3Rpb24gbWFwcGluZyBkb2N1bWVudC0+cmVzdWx0IG9iamVjdC5cbi8vXG4vLyBtYXRjaGVyIGlzIHRoZSBNYXRjaGVyIG9iamVjdCB3ZSBhcmUgY29tcGlsaW5nLlxuLy9cbi8vIElmIHRoaXMgaXMgdGhlIHJvb3QgZG9jdW1lbnQgc2VsZWN0b3IgKGllLCBub3Qgd3JhcHBlZCBpbiAkYW5kIG9yIHRoZSBsaWtlKSxcbi8vIHRoZW4gaXNSb290IGlzIHRydWUuIChUaGlzIGlzIHVzZWQgYnkgJG5lYXIuKVxuZXhwb3J0IGZ1bmN0aW9uIGNvbXBpbGVEb2N1bWVudFNlbGVjdG9yKGRvY1NlbGVjdG9yLCBtYXRjaGVyLCBvcHRpb25zID0ge30pIHtcbiAgY29uc3QgZG9jTWF0Y2hlcnMgPSBPYmplY3Qua2V5cyhkb2NTZWxlY3RvcikubWFwKGtleSA9PiB7XG4gICAgY29uc3Qgc3ViU2VsZWN0b3IgPSBkb2NTZWxlY3RvcltrZXldO1xuXG4gICAgaWYgKGtleS5zdWJzdHIoMCwgMSkgPT09ICckJykge1xuICAgICAgLy8gT3V0ZXIgb3BlcmF0b3JzIGFyZSBlaXRoZXIgbG9naWNhbCBvcGVyYXRvcnMgKHRoZXkgcmVjdXJzZSBiYWNrIGludG9cbiAgICAgIC8vIHRoaXMgZnVuY3Rpb24pLCBvciAkd2hlcmUuXG4gICAgICBpZiAoIWhhc093bi5jYWxsKExPR0lDQUxfT1BFUkFUT1JTLCBrZXkpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5yZWNvZ25pemVkIGxvZ2ljYWwgb3BlcmF0b3I6ICR7a2V5fWApO1xuICAgICAgfVxuXG4gICAgICBtYXRjaGVyLl9pc1NpbXBsZSA9IGZhbHNlO1xuICAgICAgcmV0dXJuIExPR0lDQUxfT1BFUkFUT1JTW2tleV0oc3ViU2VsZWN0b3IsIG1hdGNoZXIsIG9wdGlvbnMuaW5FbGVtTWF0Y2gpO1xuICAgIH1cblxuICAgIC8vIFJlY29yZCB0aGlzIHBhdGgsIGJ1dCBvbmx5IGlmIHdlIGFyZW4ndCBpbiBhbiBlbGVtTWF0Y2hlciwgc2luY2UgaW4gYW5cbiAgICAvLyBlbGVtTWF0Y2ggdGhpcyBpcyBhIHBhdGggaW5zaWRlIGFuIG9iamVjdCBpbiBhbiBhcnJheSwgbm90IGluIHRoZSBkb2NcbiAgICAvLyByb290LlxuICAgIGlmICghb3B0aW9ucy5pbkVsZW1NYXRjaCkge1xuICAgICAgbWF0Y2hlci5fcmVjb3JkUGF0aFVzZWQoa2V5KTtcbiAgICB9XG5cbiAgICAvLyBEb24ndCBhZGQgYSBtYXRjaGVyIGlmIHN1YlNlbGVjdG9yIGlzIGEgZnVuY3Rpb24gLS0gdGhpcyBpcyB0byBtYXRjaFxuICAgIC8vIHRoZSBiZWhhdmlvciBvZiBNZXRlb3Igb24gdGhlIHNlcnZlciAoaW5oZXJpdGVkIGZyb20gdGhlIG5vZGUgbW9uZ29kYlxuICAgIC8vIGRyaXZlciksIHdoaWNoIGlzIHRvIGlnbm9yZSBhbnkgcGFydCBvZiBhIHNlbGVjdG9yIHdoaWNoIGlzIGEgZnVuY3Rpb24uXG4gICAgaWYgKHR5cGVvZiBzdWJTZWxlY3RvciA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBjb25zdCBsb29rVXBCeUluZGV4ID0gbWFrZUxvb2t1cEZ1bmN0aW9uKGtleSk7XG4gICAgY29uc3QgdmFsdWVNYXRjaGVyID0gY29tcGlsZVZhbHVlU2VsZWN0b3IoXG4gICAgICBzdWJTZWxlY3RvcixcbiAgICAgIG1hdGNoZXIsXG4gICAgICBvcHRpb25zLmlzUm9vdFxuICAgICk7XG5cbiAgICByZXR1cm4gZG9jID0+IHZhbHVlTWF0Y2hlcihsb29rVXBCeUluZGV4KGRvYykpO1xuICB9KS5maWx0ZXIoQm9vbGVhbik7XG5cbiAgcmV0dXJuIGFuZERvY3VtZW50TWF0Y2hlcnMoZG9jTWF0Y2hlcnMpO1xufVxuXG4vLyBUYWtlcyBpbiBhIHNlbGVjdG9yIHRoYXQgY291bGQgbWF0Y2ggYSBrZXktaW5kZXhlZCB2YWx1ZSBpbiBhIGRvY3VtZW50OyBlZyxcbi8vIHskZ3Q6IDUsICRsdDogOX0sIG9yIGEgcmVndWxhciBleHByZXNzaW9uLCBvciBhbnkgbm9uLWV4cHJlc3Npb24gb2JqZWN0ICh0b1xuLy8gaW5kaWNhdGUgZXF1YWxpdHkpLiAgUmV0dXJucyBhIGJyYW5jaGVkIG1hdGNoZXI6IGEgZnVuY3Rpb24gbWFwcGluZ1xuLy8gW2JyYW5jaGVkIHZhbHVlXS0+cmVzdWx0IG9iamVjdC5cbmZ1bmN0aW9uIGNvbXBpbGVWYWx1ZVNlbGVjdG9yKHZhbHVlU2VsZWN0b3IsIG1hdGNoZXIsIGlzUm9vdCkge1xuICBpZiAodmFsdWVTZWxlY3RvciBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuICAgIG1hdGNoZXIuX2lzU2ltcGxlID0gZmFsc2U7XG4gICAgcmV0dXJuIGNvbnZlcnRFbGVtZW50TWF0Y2hlclRvQnJhbmNoZWRNYXRjaGVyKFxuICAgICAgcmVnZXhwRWxlbWVudE1hdGNoZXIodmFsdWVTZWxlY3RvcilcbiAgICApO1xuICB9XG5cbiAgaWYgKGlzT3BlcmF0b3JPYmplY3QodmFsdWVTZWxlY3RvcikpIHtcbiAgICByZXR1cm4gb3BlcmF0b3JCcmFuY2hlZE1hdGNoZXIodmFsdWVTZWxlY3RvciwgbWF0Y2hlciwgaXNSb290KTtcbiAgfVxuXG4gIHJldHVybiBjb252ZXJ0RWxlbWVudE1hdGNoZXJUb0JyYW5jaGVkTWF0Y2hlcihcbiAgICBlcXVhbGl0eUVsZW1lbnRNYXRjaGVyKHZhbHVlU2VsZWN0b3IpXG4gICk7XG59XG5cbi8vIEdpdmVuIGFuIGVsZW1lbnQgbWF0Y2hlciAod2hpY2ggZXZhbHVhdGVzIGEgc2luZ2xlIHZhbHVlKSwgcmV0dXJucyBhIGJyYW5jaGVkXG4vLyB2YWx1ZSAod2hpY2ggZXZhbHVhdGVzIHRoZSBlbGVtZW50IG1hdGNoZXIgb24gYWxsIHRoZSBicmFuY2hlcyBhbmQgcmV0dXJucyBhXG4vLyBtb3JlIHN0cnVjdHVyZWQgcmV0dXJuIHZhbHVlIHBvc3NpYmx5IGluY2x1ZGluZyBhcnJheUluZGljZXMpLlxuZnVuY3Rpb24gY29udmVydEVsZW1lbnRNYXRjaGVyVG9CcmFuY2hlZE1hdGNoZXIoZWxlbWVudE1hdGNoZXIsIG9wdGlvbnMgPSB7fSkge1xuICByZXR1cm4gYnJhbmNoZXMgPT4ge1xuICAgIGNvbnN0IGV4cGFuZGVkID0gb3B0aW9ucy5kb250RXhwYW5kTGVhZkFycmF5c1xuICAgICAgPyBicmFuY2hlc1xuICAgICAgOiBleHBhbmRBcnJheXNJbkJyYW5jaGVzKGJyYW5jaGVzLCBvcHRpb25zLmRvbnRJbmNsdWRlTGVhZkFycmF5cyk7XG5cbiAgICBjb25zdCBtYXRjaCA9IHt9O1xuICAgIG1hdGNoLnJlc3VsdCA9IGV4cGFuZGVkLnNvbWUoZWxlbWVudCA9PiB7XG4gICAgICBsZXQgbWF0Y2hlZCA9IGVsZW1lbnRNYXRjaGVyKGVsZW1lbnQudmFsdWUpO1xuXG4gICAgICAvLyBTcGVjaWFsIGNhc2UgZm9yICRlbGVtTWF0Y2g6IGl0IG1lYW5zIFwidHJ1ZSwgYW5kIHVzZSB0aGlzIGFzIGFuIGFycmF5XG4gICAgICAvLyBpbmRleCBpZiBJIGRpZG4ndCBhbHJlYWR5IGhhdmUgb25lXCIuXG4gICAgICBpZiAodHlwZW9mIG1hdGNoZWQgPT09ICdudW1iZXInKSB7XG4gICAgICAgIC8vIFhYWCBUaGlzIGNvZGUgZGF0ZXMgZnJvbSB3aGVuIHdlIG9ubHkgc3RvcmVkIGEgc2luZ2xlIGFycmF5IGluZGV4XG4gICAgICAgIC8vIChmb3IgdGhlIG91dGVybW9zdCBhcnJheSkuIFNob3VsZCB3ZSBiZSBhbHNvIGluY2x1ZGluZyBkZWVwZXIgYXJyYXlcbiAgICAgICAgLy8gaW5kaWNlcyBmcm9tIHRoZSAkZWxlbU1hdGNoIG1hdGNoP1xuICAgICAgICBpZiAoIWVsZW1lbnQuYXJyYXlJbmRpY2VzKSB7XG4gICAgICAgICAgZWxlbWVudC5hcnJheUluZGljZXMgPSBbbWF0Y2hlZF07XG4gICAgICAgIH1cblxuICAgICAgICBtYXRjaGVkID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgLy8gSWYgc29tZSBlbGVtZW50IG1hdGNoZWQsIGFuZCBpdCdzIHRhZ2dlZCB3aXRoIGFycmF5IGluZGljZXMsIGluY2x1ZGVcbiAgICAgIC8vIHRob3NlIGluZGljZXMgaW4gb3VyIHJlc3VsdCBvYmplY3QuXG4gICAgICBpZiAobWF0Y2hlZCAmJiBlbGVtZW50LmFycmF5SW5kaWNlcykge1xuICAgICAgICBtYXRjaC5hcnJheUluZGljZXMgPSBlbGVtZW50LmFycmF5SW5kaWNlcztcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG1hdGNoZWQ7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gbWF0Y2g7XG4gIH07XG59XG5cbi8vIEhlbHBlcnMgZm9yICRuZWFyLlxuZnVuY3Rpb24gZGlzdGFuY2VDb29yZGluYXRlUGFpcnMoYSwgYikge1xuICBjb25zdCBwb2ludEEgPSBwb2ludFRvQXJyYXkoYSk7XG4gIGNvbnN0IHBvaW50QiA9IHBvaW50VG9BcnJheShiKTtcblxuICByZXR1cm4gTWF0aC5oeXBvdChwb2ludEFbMF0gLSBwb2ludEJbMF0sIHBvaW50QVsxXSAtIHBvaW50QlsxXSk7XG59XG5cbi8vIFRha2VzIHNvbWV0aGluZyB0aGF0IGlzIG5vdCBhbiBvcGVyYXRvciBvYmplY3QgYW5kIHJldHVybnMgYW4gZWxlbWVudCBtYXRjaGVyXG4vLyBmb3IgZXF1YWxpdHkgd2l0aCB0aGF0IHRoaW5nLlxuZXhwb3J0IGZ1bmN0aW9uIGVxdWFsaXR5RWxlbWVudE1hdGNoZXIoZWxlbWVudFNlbGVjdG9yKSB7XG4gIGlmIChpc09wZXJhdG9yT2JqZWN0KGVsZW1lbnRTZWxlY3RvcikpIHtcbiAgICB0aHJvdyBFcnJvcignQ2FuXFwndCBjcmVhdGUgZXF1YWxpdHlWYWx1ZVNlbGVjdG9yIGZvciBvcGVyYXRvciBvYmplY3QnKTtcbiAgfVxuXG4gIC8vIFNwZWNpYWwtY2FzZTogbnVsbCBhbmQgdW5kZWZpbmVkIGFyZSBlcXVhbCAoaWYgeW91IGdvdCB1bmRlZmluZWQgaW4gdGhlcmVcbiAgLy8gc29tZXdoZXJlLCBvciBpZiB5b3UgZ290IGl0IGR1ZSB0byBzb21lIGJyYW5jaCBiZWluZyBub24tZXhpc3RlbnQgaW4gdGhlXG4gIC8vIHdlaXJkIHNwZWNpYWwgY2FzZSksIGV2ZW4gdGhvdWdoIHRoZXkgYXJlbid0IHdpdGggRUpTT04uZXF1YWxzLlxuICAvLyB1bmRlZmluZWQgb3IgbnVsbFxuICBpZiAoZWxlbWVudFNlbGVjdG9yID09IG51bGwpIHtcbiAgICByZXR1cm4gdmFsdWUgPT4gdmFsdWUgPT0gbnVsbDtcbiAgfVxuXG4gIHJldHVybiB2YWx1ZSA9PiBMb2NhbENvbGxlY3Rpb24uX2YuX2VxdWFsKGVsZW1lbnRTZWxlY3RvciwgdmFsdWUpO1xufVxuXG5mdW5jdGlvbiBldmVyeXRoaW5nTWF0Y2hlcihkb2NPckJyYW5jaGVkVmFsdWVzKSB7XG4gIHJldHVybiB7cmVzdWx0OiB0cnVlfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4cGFuZEFycmF5c0luQnJhbmNoZXMoYnJhbmNoZXMsIHNraXBUaGVBcnJheXMpIHtcbiAgY29uc3QgYnJhbmNoZXNPdXQgPSBbXTtcblxuICBicmFuY2hlcy5mb3JFYWNoKGJyYW5jaCA9PiB7XG4gICAgY29uc3QgdGhpc0lzQXJyYXkgPSBBcnJheS5pc0FycmF5KGJyYW5jaC52YWx1ZSk7XG5cbiAgICAvLyBXZSBpbmNsdWRlIHRoZSBicmFuY2ggaXRzZWxmLCAqVU5MRVNTKiB3ZSBpdCdzIGFuIGFycmF5IHRoYXQgd2UncmUgZ29pbmdcbiAgICAvLyB0byBpdGVyYXRlIGFuZCB3ZSdyZSB0b2xkIHRvIHNraXAgYXJyYXlzLiAgKFRoYXQncyByaWdodCwgd2UgaW5jbHVkZSBzb21lXG4gICAgLy8gYXJyYXlzIGV2ZW4gc2tpcFRoZUFycmF5cyBpcyB0cnVlOiB0aGVzZSBhcmUgYXJyYXlzIHRoYXQgd2VyZSBmb3VuZCB2aWFcbiAgICAvLyBleHBsaWNpdCBudW1lcmljYWwgaW5kaWNlcy4pXG4gICAgaWYgKCEoc2tpcFRoZUFycmF5cyAmJiB0aGlzSXNBcnJheSAmJiAhYnJhbmNoLmRvbnRJdGVyYXRlKSkge1xuICAgICAgYnJhbmNoZXNPdXQucHVzaCh7YXJyYXlJbmRpY2VzOiBicmFuY2guYXJyYXlJbmRpY2VzLCB2YWx1ZTogYnJhbmNoLnZhbHVlfSk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXNJc0FycmF5ICYmICFicmFuY2guZG9udEl0ZXJhdGUpIHtcbiAgICAgIGJyYW5jaC52YWx1ZS5mb3JFYWNoKCh2YWx1ZSwgaSkgPT4ge1xuICAgICAgICBicmFuY2hlc091dC5wdXNoKHtcbiAgICAgICAgICBhcnJheUluZGljZXM6IChicmFuY2guYXJyYXlJbmRpY2VzIHx8IFtdKS5jb25jYXQoaSksXG4gICAgICAgICAgdmFsdWVcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiBicmFuY2hlc091dDtcbn1cblxuLy8gSGVscGVycyBmb3IgJGJpdHNBbGxTZXQvJGJpdHNBbnlTZXQvJGJpdHNBbGxDbGVhci8kYml0c0FueUNsZWFyLlxuZnVuY3Rpb24gZ2V0T3BlcmFuZEJpdG1hc2sob3BlcmFuZCwgc2VsZWN0b3IpIHtcbiAgLy8gbnVtZXJpYyBiaXRtYXNrXG4gIC8vIFlvdSBjYW4gcHJvdmlkZSBhIG51bWVyaWMgYml0bWFzayB0byBiZSBtYXRjaGVkIGFnYWluc3QgdGhlIG9wZXJhbmQgZmllbGQuXG4gIC8vIEl0IG11c3QgYmUgcmVwcmVzZW50YWJsZSBhcyBhIG5vbi1uZWdhdGl2ZSAzMi1iaXQgc2lnbmVkIGludGVnZXIuXG4gIC8vIE90aGVyd2lzZSwgJGJpdHNBbGxTZXQgd2lsbCByZXR1cm4gYW4gZXJyb3IuXG4gIGlmIChOdW1iZXIuaXNJbnRlZ2VyKG9wZXJhbmQpICYmIG9wZXJhbmQgPj0gMCkge1xuICAgIHJldHVybiBuZXcgVWludDhBcnJheShuZXcgSW50MzJBcnJheShbb3BlcmFuZF0pLmJ1ZmZlcik7XG4gIH1cblxuICAvLyBiaW5kYXRhIGJpdG1hc2tcbiAgLy8gWW91IGNhbiBhbHNvIHVzZSBhbiBhcmJpdHJhcmlseSBsYXJnZSBCaW5EYXRhIGluc3RhbmNlIGFzIGEgYml0bWFzay5cbiAgaWYgKEVKU09OLmlzQmluYXJ5KG9wZXJhbmQpKSB7XG4gICAgcmV0dXJuIG5ldyBVaW50OEFycmF5KG9wZXJhbmQuYnVmZmVyKTtcbiAgfVxuXG4gIC8vIHBvc2l0aW9uIGxpc3RcbiAgLy8gSWYgcXVlcnlpbmcgYSBsaXN0IG9mIGJpdCBwb3NpdGlvbnMsIGVhY2ggPHBvc2l0aW9uPiBtdXN0IGJlIGEgbm9uLW5lZ2F0aXZlXG4gIC8vIGludGVnZXIuIEJpdCBwb3NpdGlvbnMgc3RhcnQgYXQgMCBmcm9tIHRoZSBsZWFzdCBzaWduaWZpY2FudCBiaXQuXG4gIGlmIChBcnJheS5pc0FycmF5KG9wZXJhbmQpICYmXG4gICAgICBvcGVyYW5kLmV2ZXJ5KHggPT4gTnVtYmVyLmlzSW50ZWdlcih4KSAmJiB4ID49IDApKSB7XG4gICAgY29uc3QgYnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKChNYXRoLm1heCguLi5vcGVyYW5kKSA+PiAzKSArIDEpO1xuICAgIGNvbnN0IHZpZXcgPSBuZXcgVWludDhBcnJheShidWZmZXIpO1xuXG4gICAgb3BlcmFuZC5mb3JFYWNoKHggPT4ge1xuICAgICAgdmlld1t4ID4+IDNdIHw9IDEgPDwgKHggJiAweDcpO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHZpZXc7XG4gIH1cblxuICAvLyBiYWQgb3BlcmFuZFxuICB0aHJvdyBFcnJvcihcbiAgICBgb3BlcmFuZCB0byAke3NlbGVjdG9yfSBtdXN0IGJlIGEgbnVtZXJpYyBiaXRtYXNrIChyZXByZXNlbnRhYmxlIGFzIGEgYCArXG4gICAgJ25vbi1uZWdhdGl2ZSAzMi1iaXQgc2lnbmVkIGludGVnZXIpLCBhIGJpbmRhdGEgYml0bWFzayBvciBhbiBhcnJheSB3aXRoICcgK1xuICAgICdiaXQgcG9zaXRpb25zIChub24tbmVnYXRpdmUgaW50ZWdlcnMpJ1xuICApO1xufVxuXG5mdW5jdGlvbiBnZXRWYWx1ZUJpdG1hc2sodmFsdWUsIGxlbmd0aCkge1xuICAvLyBUaGUgZmllbGQgdmFsdWUgbXVzdCBiZSBlaXRoZXIgbnVtZXJpY2FsIG9yIGEgQmluRGF0YSBpbnN0YW5jZS4gT3RoZXJ3aXNlLFxuICAvLyAkYml0cy4uLiB3aWxsIG5vdCBtYXRjaCB0aGUgY3VycmVudCBkb2N1bWVudC5cblxuICAvLyBudW1lcmljYWxcbiAgaWYgKE51bWJlci5pc1NhZmVJbnRlZ2VyKHZhbHVlKSkge1xuICAgIC8vICRiaXRzLi4uIHdpbGwgbm90IG1hdGNoIG51bWVyaWNhbCB2YWx1ZXMgdGhhdCBjYW5ub3QgYmUgcmVwcmVzZW50ZWQgYXMgYVxuICAgIC8vIHNpZ25lZCA2NC1iaXQgaW50ZWdlci4gVGhpcyBjYW4gYmUgdGhlIGNhc2UgaWYgYSB2YWx1ZSBpcyBlaXRoZXIgdG9vXG4gICAgLy8gbGFyZ2Ugb3Igc21hbGwgdG8gZml0IGluIGEgc2lnbmVkIDY0LWJpdCBpbnRlZ2VyLCBvciBpZiBpdCBoYXMgYVxuICAgIC8vIGZyYWN0aW9uYWwgY29tcG9uZW50LlxuICAgIGNvbnN0IGJ1ZmZlciA9IG5ldyBBcnJheUJ1ZmZlcihcbiAgICAgIE1hdGgubWF4KGxlbmd0aCwgMiAqIFVpbnQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5UKVxuICAgICk7XG5cbiAgICBsZXQgdmlldyA9IG5ldyBVaW50MzJBcnJheShidWZmZXIsIDAsIDIpO1xuICAgIHZpZXdbMF0gPSB2YWx1ZSAlICgoMSA8PCAxNikgKiAoMSA8PCAxNikpIHwgMDtcbiAgICB2aWV3WzFdID0gdmFsdWUgLyAoKDEgPDwgMTYpICogKDEgPDwgMTYpKSB8IDA7XG5cbiAgICAvLyBzaWduIGV4dGVuc2lvblxuICAgIGlmICh2YWx1ZSA8IDApIHtcbiAgICAgIHZpZXcgPSBuZXcgVWludDhBcnJheShidWZmZXIsIDIpO1xuICAgICAgdmlldy5mb3JFYWNoKChieXRlLCBpKSA9PiB7XG4gICAgICAgIHZpZXdbaV0gPSAweGZmO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG5ldyBVaW50OEFycmF5KGJ1ZmZlcik7XG4gIH1cblxuICAvLyBiaW5kYXRhXG4gIGlmIChFSlNPTi5pc0JpbmFyeSh2YWx1ZSkpIHtcbiAgICByZXR1cm4gbmV3IFVpbnQ4QXJyYXkodmFsdWUuYnVmZmVyKTtcbiAgfVxuXG4gIC8vIG5vIG1hdGNoXG4gIHJldHVybiBmYWxzZTtcbn1cblxuLy8gQWN0dWFsbHkgaW5zZXJ0cyBhIGtleSB2YWx1ZSBpbnRvIHRoZSBzZWxlY3RvciBkb2N1bWVudFxuLy8gSG93ZXZlciwgdGhpcyBjaGVja3MgdGhlcmUgaXMgbm8gYW1iaWd1aXR5IGluIHNldHRpbmdcbi8vIHRoZSB2YWx1ZSBmb3IgdGhlIGdpdmVuIGtleSwgdGhyb3dzIG90aGVyd2lzZVxuZnVuY3Rpb24gaW5zZXJ0SW50b0RvY3VtZW50KGRvY3VtZW50LCBrZXksIHZhbHVlKSB7XG4gIE9iamVjdC5rZXlzKGRvY3VtZW50KS5mb3JFYWNoKGV4aXN0aW5nS2V5ID0+IHtcbiAgICBpZiAoXG4gICAgICAoZXhpc3RpbmdLZXkubGVuZ3RoID4ga2V5Lmxlbmd0aCAmJiBleGlzdGluZ0tleS5pbmRleE9mKGAke2tleX0uYCkgPT09IDApIHx8XG4gICAgICAoa2V5Lmxlbmd0aCA+IGV4aXN0aW5nS2V5Lmxlbmd0aCAmJiBrZXkuaW5kZXhPZihgJHtleGlzdGluZ0tleX0uYCkgPT09IDApXG4gICAgKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBjYW5ub3QgaW5mZXIgcXVlcnkgZmllbGRzIHRvIHNldCwgYm90aCBwYXRocyAnJHtleGlzdGluZ0tleX0nIGFuZCBgICtcbiAgICAgICAgYCcke2tleX0nIGFyZSBtYXRjaGVkYFxuICAgICAgKTtcbiAgICB9IGVsc2UgaWYgKGV4aXN0aW5nS2V5ID09PSBrZXkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYGNhbm5vdCBpbmZlciBxdWVyeSBmaWVsZHMgdG8gc2V0LCBwYXRoICcke2tleX0nIGlzIG1hdGNoZWQgdHdpY2VgXG4gICAgICApO1xuICAgIH1cbiAgfSk7XG5cbiAgZG9jdW1lbnRba2V5XSA9IHZhbHVlO1xufVxuXG4vLyBSZXR1cm5zIGEgYnJhbmNoZWQgbWF0Y2hlciB0aGF0IG1hdGNoZXMgaWZmIHRoZSBnaXZlbiBtYXRjaGVyIGRvZXMgbm90LlxuLy8gTm90ZSB0aGF0IHRoaXMgaW1wbGljaXRseSBcImRlTW9yZ2FuaXplc1wiIHRoZSB3cmFwcGVkIGZ1bmN0aW9uLiAgaWUsIGl0XG4vLyBtZWFucyB0aGF0IEFMTCBicmFuY2ggdmFsdWVzIG5lZWQgdG8gZmFpbCB0byBtYXRjaCBpbm5lckJyYW5jaGVkTWF0Y2hlci5cbmZ1bmN0aW9uIGludmVydEJyYW5jaGVkTWF0Y2hlcihicmFuY2hlZE1hdGNoZXIpIHtcbiAgcmV0dXJuIGJyYW5jaFZhbHVlcyA9PiB7XG4gICAgLy8gV2UgZXhwbGljaXRseSBjaG9vc2UgdG8gc3RyaXAgYXJyYXlJbmRpY2VzIGhlcmU6IGl0IGRvZXNuJ3QgbWFrZSBzZW5zZSB0b1xuICAgIC8vIHNheSBcInVwZGF0ZSB0aGUgYXJyYXkgZWxlbWVudCB0aGF0IGRvZXMgbm90IG1hdGNoIHNvbWV0aGluZ1wiLCBhdCBsZWFzdFxuICAgIC8vIGluIG1vbmdvLWxhbmQuXG4gICAgcmV0dXJuIHtyZXN1bHQ6ICFicmFuY2hlZE1hdGNoZXIoYnJhbmNoVmFsdWVzKS5yZXN1bHR9O1xuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNJbmRleGFibGUob2JqKSB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KG9iaikgfHwgTG9jYWxDb2xsZWN0aW9uLl9pc1BsYWluT2JqZWN0KG9iaik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc051bWVyaWNLZXkocykge1xuICByZXR1cm4gL15bMC05XSskLy50ZXN0KHMpO1xufVxuXG4vLyBSZXR1cm5zIHRydWUgaWYgdGhpcyBpcyBhbiBvYmplY3Qgd2l0aCBhdCBsZWFzdCBvbmUga2V5IGFuZCBhbGwga2V5cyBiZWdpblxuLy8gd2l0aCAkLiAgVW5sZXNzIGluY29uc2lzdGVudE9LIGlzIHNldCwgdGhyb3dzIGlmIHNvbWUga2V5cyBiZWdpbiB3aXRoICQgYW5kXG4vLyBvdGhlcnMgZG9uJ3QuXG5leHBvcnQgZnVuY3Rpb24gaXNPcGVyYXRvck9iamVjdCh2YWx1ZVNlbGVjdG9yLCBpbmNvbnNpc3RlbnRPSykge1xuICBpZiAoIUxvY2FsQ29sbGVjdGlvbi5faXNQbGFpbk9iamVjdCh2YWx1ZVNlbGVjdG9yKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGxldCB0aGVzZUFyZU9wZXJhdG9ycyA9IHVuZGVmaW5lZDtcbiAgT2JqZWN0LmtleXModmFsdWVTZWxlY3RvcikuZm9yRWFjaChzZWxLZXkgPT4ge1xuICAgIGNvbnN0IHRoaXNJc09wZXJhdG9yID0gc2VsS2V5LnN1YnN0cigwLCAxKSA9PT0gJyQnIHx8IHNlbEtleSA9PT0gJ2RpZmYnO1xuXG4gICAgaWYgKHRoZXNlQXJlT3BlcmF0b3JzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHRoZXNlQXJlT3BlcmF0b3JzID0gdGhpc0lzT3BlcmF0b3I7XG4gICAgfSBlbHNlIGlmICh0aGVzZUFyZU9wZXJhdG9ycyAhPT0gdGhpc0lzT3BlcmF0b3IpIHtcbiAgICAgIGlmICghaW5jb25zaXN0ZW50T0spIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgIGBJbmNvbnNpc3RlbnQgb3BlcmF0b3I6ICR7SlNPTi5zdHJpbmdpZnkodmFsdWVTZWxlY3Rvcil9YFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICB0aGVzZUFyZU9wZXJhdG9ycyA9IGZhbHNlO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuICEhdGhlc2VBcmVPcGVyYXRvcnM7IC8vIHt9IGhhcyBubyBvcGVyYXRvcnNcbn1cblxuLy8gSGVscGVyIGZvciAkbHQvJGd0LyRsdGUvJGd0ZS5cbmZ1bmN0aW9uIG1ha2VJbmVxdWFsaXR5KGNtcFZhbHVlQ29tcGFyYXRvcikge1xuICByZXR1cm4ge1xuICAgIGNvbXBpbGVFbGVtZW50U2VsZWN0b3Iob3BlcmFuZCkge1xuICAgICAgLy8gQXJyYXlzIG5ldmVyIGNvbXBhcmUgZmFsc2Ugd2l0aCBub24tYXJyYXlzIGZvciBhbnkgaW5lcXVhbGl0eS5cbiAgICAgIC8vIFhYWCBUaGlzIHdhcyBiZWhhdmlvciB3ZSBvYnNlcnZlZCBpbiBwcmUtcmVsZWFzZSBNb25nb0RCIDIuNSwgYnV0XG4gICAgICAvLyAgICAgaXQgc2VlbXMgdG8gaGF2ZSBiZWVuIHJldmVydGVkLlxuICAgICAgLy8gICAgIFNlZSBodHRwczovL2ppcmEubW9uZ29kYi5vcmcvYnJvd3NlL1NFUlZFUi0xMTQ0NFxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkob3BlcmFuZCkpIHtcbiAgICAgICAgcmV0dXJuICgpID0+IGZhbHNlO1xuICAgICAgfVxuXG4gICAgICAvLyBTcGVjaWFsIGNhc2U6IGNvbnNpZGVyIHVuZGVmaW5lZCBhbmQgbnVsbCB0aGUgc2FtZSAoc28gdHJ1ZSB3aXRoXG4gICAgICAvLyAkZ3RlLyRsdGUpLlxuICAgICAgaWYgKG9wZXJhbmQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBvcGVyYW5kID0gbnVsbDtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgb3BlcmFuZFR5cGUgPSBMb2NhbENvbGxlY3Rpb24uX2YuX3R5cGUob3BlcmFuZCk7XG5cbiAgICAgIHJldHVybiB2YWx1ZSA9PiB7XG4gICAgICAgIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgdmFsdWUgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ29tcGFyaXNvbnMgYXJlIG5ldmVyIHRydWUgYW1vbmcgdGhpbmdzIG9mIGRpZmZlcmVudCB0eXBlIChleGNlcHRcbiAgICAgICAgLy8gbnVsbCB2cyB1bmRlZmluZWQpLlxuICAgICAgICBpZiAoTG9jYWxDb2xsZWN0aW9uLl9mLl90eXBlKHZhbHVlKSAhPT0gb3BlcmFuZFR5cGUpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gY21wVmFsdWVDb21wYXJhdG9yKExvY2FsQ29sbGVjdGlvbi5fZi5fY21wKHZhbHVlLCBvcGVyYW5kKSk7XG4gICAgICB9O1xuICAgIH0sXG4gIH07XG59XG5cbi8vIG1ha2VMb29rdXBGdW5jdGlvbihrZXkpIHJldHVybnMgYSBsb29rdXAgZnVuY3Rpb24uXG4vL1xuLy8gQSBsb29rdXAgZnVuY3Rpb24gdGFrZXMgaW4gYSBkb2N1bWVudCBhbmQgcmV0dXJucyBhbiBhcnJheSBvZiBtYXRjaGluZ1xuLy8gYnJhbmNoZXMuICBJZiBubyBhcnJheXMgYXJlIGZvdW5kIHdoaWxlIGxvb2tpbmcgdXAgdGhlIGtleSwgdGhpcyBhcnJheSB3aWxsXG4vLyBoYXZlIGV4YWN0bHkgb25lIGJyYW5jaGVzIChwb3NzaWJseSAndW5kZWZpbmVkJywgaWYgc29tZSBzZWdtZW50IG9mIHRoZSBrZXlcbi8vIHdhcyBub3QgZm91bmQpLlxuLy9cbi8vIElmIGFycmF5cyBhcmUgZm91bmQgaW4gdGhlIG1pZGRsZSwgdGhpcyBjYW4gaGF2ZSBtb3JlIHRoYW4gb25lIGVsZW1lbnQsIHNpbmNlXG4vLyB3ZSAnYnJhbmNoJy4gV2hlbiB3ZSAnYnJhbmNoJywgaWYgdGhlcmUgYXJlIG1vcmUga2V5IHNlZ21lbnRzIHRvIGxvb2sgdXAsXG4vLyB0aGVuIHdlIG9ubHkgcHVyc3VlIGJyYW5jaGVzIHRoYXQgYXJlIHBsYWluIG9iamVjdHMgKG5vdCBhcnJheXMgb3Igc2NhbGFycykuXG4vLyBUaGlzIG1lYW5zIHdlIGNhbiBhY3R1YWxseSBlbmQgdXAgd2l0aCBubyBicmFuY2hlcyFcbi8vXG4vLyBXZSBkbyAqTk9UKiBicmFuY2ggb24gYXJyYXlzIHRoYXQgYXJlIGZvdW5kIGF0IHRoZSBlbmQgKGllLCBhdCB0aGUgbGFzdFxuLy8gZG90dGVkIG1lbWJlciBvZiB0aGUga2V5KS4gV2UganVzdCByZXR1cm4gdGhhdCBhcnJheTsgaWYgeW91IHdhbnQgdG9cbi8vIGVmZmVjdGl2ZWx5ICdicmFuY2gnIG92ZXIgdGhlIGFycmF5J3MgdmFsdWVzLCBwb3N0LXByb2Nlc3MgdGhlIGxvb2t1cFxuLy8gZnVuY3Rpb24gd2l0aCBleHBhbmRBcnJheXNJbkJyYW5jaGVzLlxuLy9cbi8vIEVhY2ggYnJhbmNoIGlzIGFuIG9iamVjdCB3aXRoIGtleXM6XG4vLyAgLSB2YWx1ZTogdGhlIHZhbHVlIGF0IHRoZSBicmFuY2hcbi8vICAtIGRvbnRJdGVyYXRlOiBhbiBvcHRpb25hbCBib29sOyBpZiB0cnVlLCBpdCBtZWFucyB0aGF0ICd2YWx1ZScgaXMgYW4gYXJyYXlcbi8vICAgIHRoYXQgZXhwYW5kQXJyYXlzSW5CcmFuY2hlcyBzaG91bGQgTk9UIGV4cGFuZC4gVGhpcyBzcGVjaWZpY2FsbHkgaGFwcGVuc1xuLy8gICAgd2hlbiB0aGVyZSBpcyBhIG51bWVyaWMgaW5kZXggaW4gdGhlIGtleSwgYW5kIGVuc3VyZXMgdGhlXG4vLyAgICBwZXJoYXBzLXN1cnByaXNpbmcgTW9uZ29EQiBiZWhhdmlvciB3aGVyZSB7J2EuMCc6IDV9IGRvZXMgTk9UXG4vLyAgICBtYXRjaCB7YTogW1s1XV19LlxuLy8gIC0gYXJyYXlJbmRpY2VzOiBpZiBhbnkgYXJyYXkgaW5kZXhpbmcgd2FzIGRvbmUgZHVyaW5nIGxvb2t1cCAoZWl0aGVyIGR1ZSB0b1xuLy8gICAgZXhwbGljaXQgbnVtZXJpYyBpbmRpY2VzIG9yIGltcGxpY2l0IGJyYW5jaGluZyksIHRoaXMgd2lsbCBiZSBhbiBhcnJheSBvZlxuLy8gICAgdGhlIGFycmF5IGluZGljZXMgdXNlZCwgZnJvbSBvdXRlcm1vc3QgdG8gaW5uZXJtb3N0OyBpdCBpcyBmYWxzZXkgb3Jcbi8vICAgIGFic2VudCBpZiBubyBhcnJheSBpbmRleCBpcyB1c2VkLiBJZiBhbiBleHBsaWNpdCBudW1lcmljIGluZGV4IGlzIHVzZWQsXG4vLyAgICB0aGUgaW5kZXggd2lsbCBiZSBmb2xsb3dlZCBpbiBhcnJheUluZGljZXMgYnkgdGhlIHN0cmluZyAneCcuXG4vL1xuLy8gICAgTm90ZTogYXJyYXlJbmRpY2VzIGlzIHVzZWQgZm9yIHR3byBwdXJwb3Nlcy4gRmlyc3QsIGl0IGlzIHVzZWQgdG9cbi8vICAgIGltcGxlbWVudCB0aGUgJyQnIG1vZGlmaWVyIGZlYXR1cmUsIHdoaWNoIG9ubHkgZXZlciBsb29rcyBhdCBpdHMgZmlyc3Rcbi8vICAgIGVsZW1lbnQuXG4vL1xuLy8gICAgU2Vjb25kLCBpdCBpcyB1c2VkIGZvciBzb3J0IGtleSBnZW5lcmF0aW9uLCB3aGljaCBuZWVkcyB0byBiZSBhYmxlIHRvIHRlbGxcbi8vICAgIHRoZSBkaWZmZXJlbmNlIGJldHdlZW4gZGlmZmVyZW50IHBhdGhzLiBNb3Jlb3ZlciwgaXQgbmVlZHMgdG9cbi8vICAgIGRpZmZlcmVudGlhdGUgYmV0d2VlbiBleHBsaWNpdCBhbmQgaW1wbGljaXQgYnJhbmNoaW5nLCB3aGljaCBpcyB3aHlcbi8vICAgIHRoZXJlJ3MgdGhlIHNvbWV3aGF0IGhhY2t5ICd4JyBlbnRyeTogdGhpcyBtZWFucyB0aGF0IGV4cGxpY2l0IGFuZFxuLy8gICAgaW1wbGljaXQgYXJyYXkgbG9va3VwcyB3aWxsIGhhdmUgZGlmZmVyZW50IGZ1bGwgYXJyYXlJbmRpY2VzIHBhdGhzLiAoVGhhdFxuLy8gICAgY29kZSBvbmx5IHJlcXVpcmVzIHRoYXQgZGlmZmVyZW50IHBhdGhzIGhhdmUgZGlmZmVyZW50IGFycmF5SW5kaWNlczsgaXRcbi8vICAgIGRvZXNuJ3QgYWN0dWFsbHkgJ3BhcnNlJyBhcnJheUluZGljZXMuIEFzIGFuIGFsdGVybmF0aXZlLCBhcnJheUluZGljZXNcbi8vICAgIGNvdWxkIGNvbnRhaW4gb2JqZWN0cyB3aXRoIGZsYWdzIGxpa2UgJ2ltcGxpY2l0JywgYnV0IEkgdGhpbmsgdGhhdCBvbmx5XG4vLyAgICBtYWtlcyB0aGUgY29kZSBzdXJyb3VuZGluZyB0aGVtIG1vcmUgY29tcGxleC4pXG4vL1xuLy8gICAgKEJ5IHRoZSB3YXksIHRoaXMgZmllbGQgZW5kcyB1cCBnZXR0aW5nIHBhc3NlZCBhcm91bmQgYSBsb3Qgd2l0aG91dFxuLy8gICAgY2xvbmluZywgc28gbmV2ZXIgbXV0YXRlIGFueSBhcnJheUluZGljZXMgZmllbGQvdmFyIGluIHRoaXMgcGFja2FnZSEpXG4vL1xuLy9cbi8vIEF0IHRoZSB0b3AgbGV2ZWwsIHlvdSBtYXkgb25seSBwYXNzIGluIGEgcGxhaW4gb2JqZWN0IG9yIGFycmF5LlxuLy9cbi8vIFNlZSB0aGUgdGVzdCAnbWluaW1vbmdvIC0gbG9va3VwJyBmb3Igc29tZSBleGFtcGxlcyBvZiB3aGF0IGxvb2t1cCBmdW5jdGlvbnNcbi8vIHJldHVybi5cbmV4cG9ydCBmdW5jdGlvbiBtYWtlTG9va3VwRnVuY3Rpb24oa2V5LCBvcHRpb25zID0ge30pIHtcbiAgY29uc3QgcGFydHMgPSBrZXkuc3BsaXQoJy4nKTtcbiAgY29uc3QgZmlyc3RQYXJ0ID0gcGFydHMubGVuZ3RoID8gcGFydHNbMF0gOiAnJztcbiAgY29uc3QgbG9va3VwUmVzdCA9IChcbiAgICBwYXJ0cy5sZW5ndGggPiAxICYmXG4gICAgbWFrZUxvb2t1cEZ1bmN0aW9uKHBhcnRzLnNsaWNlKDEpLmpvaW4oJy4nKSwgb3B0aW9ucylcbiAgKTtcblxuICBmdW5jdGlvbiBidWlsZFJlc3VsdChhcnJheUluZGljZXMsIGRvbnRJdGVyYXRlLCB2YWx1ZSkge1xuICAgIHJldHVybiBhcnJheUluZGljZXMgJiYgYXJyYXlJbmRpY2VzLmxlbmd0aFxuICAgICAgPyBkb250SXRlcmF0ZVxuICAgICAgICA/IFt7IGFycmF5SW5kaWNlcywgZG9udEl0ZXJhdGUsIHZhbHVlIH1dXG4gICAgICAgIDogW3sgYXJyYXlJbmRpY2VzLCB2YWx1ZSB9XVxuICAgICAgOiBkb250SXRlcmF0ZVxuICAgICAgICA/IFt7IGRvbnRJdGVyYXRlLCB2YWx1ZSB9XVxuICAgICAgICA6IFt7IHZhbHVlIH1dO1xuICB9XG5cbiAgLy8gRG9jIHdpbGwgYWx3YXlzIGJlIGEgcGxhaW4gb2JqZWN0IG9yIGFuIGFycmF5LlxuICAvLyBhcHBseSBhbiBleHBsaWNpdCBudW1lcmljIGluZGV4LCBhbiBhcnJheS5cbiAgcmV0dXJuIChkb2MsIGFycmF5SW5kaWNlcykgPT4ge1xuICAgIGlmIChBcnJheS5pc0FycmF5KGRvYykpIHtcbiAgICAgIC8vIElmIHdlJ3JlIGJlaW5nIGFza2VkIHRvIGRvIGFuIGludmFsaWQgbG9va3VwIGludG8gYW4gYXJyYXkgKG5vbi1pbnRlZ2VyXG4gICAgICAvLyBvciBvdXQtb2YtYm91bmRzKSwgcmV0dXJuIG5vIHJlc3VsdHMgKHdoaWNoIGlzIGRpZmZlcmVudCBmcm9tIHJldHVybmluZ1xuICAgICAgLy8gYSBzaW5nbGUgdW5kZWZpbmVkIHJlc3VsdCwgaW4gdGhhdCBgbnVsbGAgZXF1YWxpdHkgY2hlY2tzIHdvbid0IG1hdGNoKS5cbiAgICAgIGlmICghKGlzTnVtZXJpY0tleShmaXJzdFBhcnQpICYmIGZpcnN0UGFydCA8IGRvYy5sZW5ndGgpKSB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH1cblxuICAgICAgLy8gUmVtZW1iZXIgdGhhdCB3ZSB1c2VkIHRoaXMgYXJyYXkgaW5kZXguIEluY2x1ZGUgYW4gJ3gnIHRvIGluZGljYXRlIHRoYXRcbiAgICAgIC8vIHRoZSBwcmV2aW91cyBpbmRleCBjYW1lIGZyb20gYmVpbmcgY29uc2lkZXJlZCBhcyBhbiBleHBsaWNpdCBhcnJheVxuICAgICAgLy8gaW5kZXggKG5vdCBicmFuY2hpbmcpLlxuICAgICAgYXJyYXlJbmRpY2VzID0gYXJyYXlJbmRpY2VzID8gYXJyYXlJbmRpY2VzLmNvbmNhdCgrZmlyc3RQYXJ0LCAneCcpIDogWytmaXJzdFBhcnQsICd4J107XG4gICAgfVxuXG4gICAgLy8gRG8gb3VyIGZpcnN0IGxvb2t1cC5cbiAgICBjb25zdCBmaXJzdExldmVsID0gZG9jW2ZpcnN0UGFydF07XG5cbiAgICAvLyBJZiB0aGVyZSBpcyBubyBkZWVwZXIgdG8gZGlnLCByZXR1cm4gd2hhdCB3ZSBmb3VuZC5cbiAgICAvL1xuICAgIC8vIElmIHdoYXQgd2UgZm91bmQgaXMgYW4gYXJyYXksIG1vc3QgdmFsdWUgc2VsZWN0b3JzIHdpbGwgY2hvb3NlIHRvIHRyZWF0XG4gICAgLy8gdGhlIGVsZW1lbnRzIG9mIHRoZSBhcnJheSBhcyBtYXRjaGFibGUgdmFsdWVzIGluIHRoZWlyIG93biByaWdodCwgYnV0XG4gICAgLy8gdGhhdCdzIGRvbmUgb3V0c2lkZSBvZiB0aGUgbG9va3VwIGZ1bmN0aW9uLiAoRXhjZXB0aW9ucyB0byB0aGlzIGFyZSAkc2l6ZVxuICAgIC8vIGFuZCBzdHVmZiByZWxhdGluZyB0byAkZWxlbU1hdGNoLiAgZWcsIHthOiB7JHNpemU6IDJ9fSBkb2VzIG5vdCBtYXRjaCB7YTpcbiAgICAvLyBbWzEsIDJdXX0uKVxuICAgIC8vXG4gICAgLy8gVGhhdCBzYWlkLCBpZiB3ZSBqdXN0IGRpZCBhbiAqZXhwbGljaXQqIGFycmF5IGxvb2t1cCAob24gZG9jKSB0byBmaW5kXG4gICAgLy8gZmlyc3RMZXZlbCwgYW5kIGZpcnN0TGV2ZWwgaXMgYW4gYXJyYXkgdG9vLCB3ZSBkbyBOT1Qgd2FudCB2YWx1ZVxuICAgIC8vIHNlbGVjdG9ycyB0byBpdGVyYXRlIG92ZXIgaXQuICBlZywgeydhLjAnOiA1fSBkb2VzIG5vdCBtYXRjaCB7YTogW1s1XV19LlxuICAgIC8vIFNvIGluIHRoYXQgY2FzZSwgd2UgbWFyayB0aGUgcmV0dXJuIHZhbHVlIGFzICdkb24ndCBpdGVyYXRlJy5cbiAgICBpZiAoIWxvb2t1cFJlc3QpIHtcbiAgICAgIHJldHVybiBidWlsZFJlc3VsdChcbiAgICAgICAgYXJyYXlJbmRpY2VzLFxuICAgICAgICBBcnJheS5pc0FycmF5KGRvYykgJiYgQXJyYXkuaXNBcnJheShmaXJzdExldmVsKSxcbiAgICAgICAgZmlyc3RMZXZlbCxcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gV2UgbmVlZCB0byBkaWcgZGVlcGVyLiAgQnV0IGlmIHdlIGNhbid0LCBiZWNhdXNlIHdoYXQgd2UndmUgZm91bmQgaXMgbm90XG4gICAgLy8gYW4gYXJyYXkgb3IgcGxhaW4gb2JqZWN0LCB3ZSdyZSBkb25lLiBJZiB3ZSBqdXN0IGRpZCBhIG51bWVyaWMgaW5kZXggaW50b1xuICAgIC8vIGFuIGFycmF5LCB3ZSByZXR1cm4gbm90aGluZyBoZXJlICh0aGlzIGlzIGEgY2hhbmdlIGluIE1vbmdvIDIuNSBmcm9tXG4gICAgLy8gTW9uZ28gMi40LCB3aGVyZSB7J2EuMC5iJzogbnVsbH0gc3RvcHBlZCBtYXRjaGluZyB7YTogWzVdfSkuIE90aGVyd2lzZSxcbiAgICAvLyByZXR1cm4gYSBzaW5nbGUgYHVuZGVmaW5lZGAgKHdoaWNoIGNhbiwgZm9yIGV4YW1wbGUsIG1hdGNoIHZpYSBlcXVhbGl0eVxuICAgIC8vIHdpdGggYG51bGxgKS5cbiAgICBpZiAoIWlzSW5kZXhhYmxlKGZpcnN0TGV2ZWwpKSB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShkb2MpKSB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGJ1aWxkUmVzdWx0KGFycmF5SW5kaWNlcywgZmFsc2UsIHVuZGVmaW5lZCk7XG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0ID0gW107XG4gICAgY29uc3QgYXBwZW5kVG9SZXN1bHQgPSBtb3JlID0+IHtcbiAgICAgIHJlc3VsdC5wdXNoKC4uLm1vcmUpO1xuICAgIH07XG5cbiAgICAvLyBEaWcgZGVlcGVyOiBsb29rIHVwIHRoZSByZXN0IG9mIHRoZSBwYXJ0cyBvbiB3aGF0ZXZlciB3ZSd2ZSBmb3VuZC5cbiAgICAvLyAobG9va3VwUmVzdCBpcyBzbWFydCBlbm91Z2ggdG8gbm90IHRyeSB0byBkbyBpbnZhbGlkIGxvb2t1cHMgaW50b1xuICAgIC8vIGZpcnN0TGV2ZWwgaWYgaXQncyBhbiBhcnJheS4pXG4gICAgYXBwZW5kVG9SZXN1bHQobG9va3VwUmVzdChmaXJzdExldmVsLCBhcnJheUluZGljZXMpKTtcblxuICAgIC8vIElmIHdlIGZvdW5kIGFuIGFycmF5LCB0aGVuIGluICphZGRpdGlvbiogdG8gcG90ZW50aWFsbHkgdHJlYXRpbmcgdGhlIG5leHRcbiAgICAvLyBwYXJ0IGFzIGEgbGl0ZXJhbCBpbnRlZ2VyIGxvb2t1cCwgd2Ugc2hvdWxkIGFsc28gJ2JyYW5jaCc6IHRyeSB0byBsb29rIHVwXG4gICAgLy8gdGhlIHJlc3Qgb2YgdGhlIHBhcnRzIG9uIGVhY2ggYXJyYXkgZWxlbWVudCBpbiBwYXJhbGxlbC5cbiAgICAvL1xuICAgIC8vIEluIHRoaXMgY2FzZSwgd2UgKm9ubHkqIGRpZyBkZWVwZXIgaW50byBhcnJheSBlbGVtZW50cyB0aGF0IGFyZSBwbGFpblxuICAgIC8vIG9iamVjdHMuIChSZWNhbGwgdGhhdCB3ZSBvbmx5IGdvdCB0aGlzIGZhciBpZiB3ZSBoYXZlIGZ1cnRoZXIgdG8gZGlnLilcbiAgICAvLyBUaGlzIG1ha2VzIHNlbnNlOiB3ZSBjZXJ0YWlubHkgZG9uJ3QgZGlnIGRlZXBlciBpbnRvIG5vbi1pbmRleGFibGVcbiAgICAvLyBvYmplY3RzLiBBbmQgaXQgd291bGQgYmUgd2VpcmQgdG8gZGlnIGludG8gYW4gYXJyYXk6IGl0J3Mgc2ltcGxlciB0byBoYXZlXG4gICAgLy8gYSBydWxlIHRoYXQgZXhwbGljaXQgaW50ZWdlciBpbmRleGVzIG9ubHkgYXBwbHkgdG8gYW4gb3V0ZXIgYXJyYXksIG5vdCB0b1xuICAgIC8vIGFuIGFycmF5IHlvdSBmaW5kIGFmdGVyIGEgYnJhbmNoaW5nIHNlYXJjaC5cbiAgICAvL1xuICAgIC8vIEluIHRoZSBzcGVjaWFsIGNhc2Ugb2YgYSBudW1lcmljIHBhcnQgaW4gYSAqc29ydCBzZWxlY3RvciogKG5vdCBhIHF1ZXJ5XG4gICAgLy8gc2VsZWN0b3IpLCB3ZSBza2lwIHRoZSBicmFuY2hpbmc6IHdlIE9OTFkgYWxsb3cgdGhlIG51bWVyaWMgcGFydCB0byBtZWFuXG4gICAgLy8gJ2xvb2sgdXAgdGhpcyBpbmRleCcgaW4gdGhhdCBjYXNlLCBub3QgJ2Fsc28gbG9vayB1cCB0aGlzIGluZGV4IGluIGFsbFxuICAgIC8vIHRoZSBlbGVtZW50cyBvZiB0aGUgYXJyYXknLlxuICAgIGlmIChBcnJheS5pc0FycmF5KGZpcnN0TGV2ZWwpICYmXG4gICAgICAgICEoaXNOdW1lcmljS2V5KHBhcnRzWzFdKSAmJiBvcHRpb25zLmZvclNvcnQpKSB7XG4gICAgICBmaXJzdExldmVsLmZvckVhY2goKGJyYW5jaCwgYXJyYXlJbmRleCkgPT4ge1xuICAgICAgICBpZiAoTG9jYWxDb2xsZWN0aW9uLl9pc1BsYWluT2JqZWN0KGJyYW5jaCkpIHtcbiAgICAgICAgICBhcHBlbmRUb1Jlc3VsdChsb29rdXBSZXN0KGJyYW5jaCwgYXJyYXlJbmRpY2VzID8gYXJyYXlJbmRpY2VzLmNvbmNhdChhcnJheUluZGV4KSA6IFthcnJheUluZGV4XSkpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xufVxuXG4vLyBPYmplY3QgZXhwb3J0ZWQgb25seSBmb3IgdW5pdCB0ZXN0aW5nLlxuLy8gVXNlIGl0IHRvIGV4cG9ydCBwcml2YXRlIGZ1bmN0aW9ucyB0byB0ZXN0IGluIFRpbnl0ZXN0LlxuTWluaW1vbmdvVGVzdCA9IHttYWtlTG9va3VwRnVuY3Rpb259O1xuTWluaW1vbmdvRXJyb3IgPSAobWVzc2FnZSwgb3B0aW9ucyA9IHt9KSA9PiB7XG4gIGlmICh0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycgJiYgb3B0aW9ucy5maWVsZCkge1xuICAgIG1lc3NhZ2UgKz0gYCBmb3IgZmllbGQgJyR7b3B0aW9ucy5maWVsZH0nYDtcbiAgfVxuXG4gIGNvbnN0IGVycm9yID0gbmV3IEVycm9yKG1lc3NhZ2UpO1xuICBlcnJvci5uYW1lID0gJ01pbmltb25nb0Vycm9yJztcbiAgcmV0dXJuIGVycm9yO1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIG5vdGhpbmdNYXRjaGVyKGRvY09yQnJhbmNoZWRWYWx1ZXMpIHtcbiAgcmV0dXJuIHtyZXN1bHQ6IGZhbHNlfTtcbn1cblxuLy8gVGFrZXMgYW4gb3BlcmF0b3Igb2JqZWN0IChhbiBvYmplY3Qgd2l0aCAkIGtleXMpIGFuZCByZXR1cm5zIGEgYnJhbmNoZWRcbi8vIG1hdGNoZXIgZm9yIGl0LlxuZnVuY3Rpb24gb3BlcmF0b3JCcmFuY2hlZE1hdGNoZXIodmFsdWVTZWxlY3RvciwgbWF0Y2hlciwgaXNSb290KSB7XG4gIC8vIEVhY2ggdmFsdWVTZWxlY3RvciB3b3JrcyBzZXBhcmF0ZWx5IG9uIHRoZSB2YXJpb3VzIGJyYW5jaGVzLiAgU28gb25lXG4gIC8vIG9wZXJhdG9yIGNhbiBtYXRjaCBvbmUgYnJhbmNoIGFuZCBhbm90aGVyIGNhbiBtYXRjaCBhbm90aGVyIGJyYW5jaC4gIFRoaXNcbiAgLy8gaXMgT0suXG4gIGNvbnN0IG9wZXJhdG9yTWF0Y2hlcnMgPSBPYmplY3Qua2V5cyh2YWx1ZVNlbGVjdG9yKS5tYXAob3BlcmF0b3IgPT4ge1xuICAgIGNvbnN0IG9wZXJhbmQgPSB2YWx1ZVNlbGVjdG9yW29wZXJhdG9yXTtcblxuICAgIGNvbnN0IHNpbXBsZVJhbmdlID0gKFxuICAgICAgWyckbHQnLCAnJGx0ZScsICckZ3QnLCAnJGd0ZSddLmluY2x1ZGVzKG9wZXJhdG9yKSAmJlxuICAgICAgdHlwZW9mIG9wZXJhbmQgPT09ICdudW1iZXInXG4gICAgKTtcblxuICAgIGNvbnN0IHNpbXBsZUVxdWFsaXR5ID0gKFxuICAgICAgWyckbmUnLCAnJGVxJ10uaW5jbHVkZXMob3BlcmF0b3IpICYmXG4gICAgICBvcGVyYW5kICE9PSBPYmplY3Qob3BlcmFuZClcbiAgICApO1xuXG4gICAgY29uc3Qgc2ltcGxlSW5jbHVzaW9uID0gKFxuICAgICAgWyckaW4nLCAnJG5pbiddLmluY2x1ZGVzKG9wZXJhdG9yKVxuICAgICAgJiYgQXJyYXkuaXNBcnJheShvcGVyYW5kKVxuICAgICAgJiYgIW9wZXJhbmQuc29tZSh4ID0+IHggPT09IE9iamVjdCh4KSlcbiAgICApO1xuXG4gICAgaWYgKCEoc2ltcGxlUmFuZ2UgfHwgc2ltcGxlSW5jbHVzaW9uIHx8IHNpbXBsZUVxdWFsaXR5KSkge1xuICAgICAgbWF0Y2hlci5faXNTaW1wbGUgPSBmYWxzZTtcbiAgICB9XG5cbiAgICBpZiAoaGFzT3duLmNhbGwoVkFMVUVfT1BFUkFUT1JTLCBvcGVyYXRvcikpIHtcbiAgICAgIHJldHVybiBWQUxVRV9PUEVSQVRPUlNbb3BlcmF0b3JdKG9wZXJhbmQsIHZhbHVlU2VsZWN0b3IsIG1hdGNoZXIsIGlzUm9vdCk7XG4gICAgfVxuXG4gICAgaWYgKGhhc093bi5jYWxsKEVMRU1FTlRfT1BFUkFUT1JTLCBvcGVyYXRvcikpIHtcbiAgICAgIGNvbnN0IG9wdGlvbnMgPSBFTEVNRU5UX09QRVJBVE9SU1tvcGVyYXRvcl07XG4gICAgICByZXR1cm4gY29udmVydEVsZW1lbnRNYXRjaGVyVG9CcmFuY2hlZE1hdGNoZXIoXG4gICAgICAgIG9wdGlvbnMuY29tcGlsZUVsZW1lbnRTZWxlY3RvcihvcGVyYW5kLCB2YWx1ZVNlbGVjdG9yLCBtYXRjaGVyKSxcbiAgICAgICAgb3B0aW9uc1xuICAgICAgKTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgRXJyb3IoYFVucmVjb2duaXplZCBvcGVyYXRvcjogJHtvcGVyYXRvcn1gKTtcbiAgfSk7XG5cbiAgcmV0dXJuIGFuZEJyYW5jaGVkTWF0Y2hlcnMob3BlcmF0b3JNYXRjaGVycyk7XG59XG5cbi8vIHBhdGhzIC0gQXJyYXk6IGxpc3Qgb2YgbW9uZ28gc3R5bGUgcGF0aHNcbi8vIG5ld0xlYWZGbiAtIEZ1bmN0aW9uOiBvZiBmb3JtIGZ1bmN0aW9uKHBhdGgpIHNob3VsZCByZXR1cm4gYSBzY2FsYXIgdmFsdWUgdG9cbi8vICAgICAgICAgICAgICAgICAgICAgICBwdXQgaW50byBsaXN0IGNyZWF0ZWQgZm9yIHRoYXQgcGF0aFxuLy8gY29uZmxpY3RGbiAtIEZ1bmN0aW9uOiBvZiBmb3JtIGZ1bmN0aW9uKG5vZGUsIHBhdGgsIGZ1bGxQYXRoKSBpcyBjYWxsZWRcbi8vICAgICAgICAgICAgICAgICAgICAgICAgd2hlbiBidWlsZGluZyBhIHRyZWUgcGF0aCBmb3IgJ2Z1bGxQYXRoJyBub2RlIG9uXG4vLyAgICAgICAgICAgICAgICAgICAgICAgICdwYXRoJyB3YXMgYWxyZWFkeSBhIGxlYWYgd2l0aCBhIHZhbHVlLiBNdXN0IHJldHVybiBhXG4vLyAgICAgICAgICAgICAgICAgICAgICAgIGNvbmZsaWN0IHJlc29sdXRpb24uXG4vLyBpbml0aWFsIHRyZWUgLSBPcHRpb25hbCBPYmplY3Q6IHN0YXJ0aW5nIHRyZWUuXG4vLyBAcmV0dXJucyAtIE9iamVjdDogdHJlZSByZXByZXNlbnRlZCBhcyBhIHNldCBvZiBuZXN0ZWQgb2JqZWN0c1xuZXhwb3J0IGZ1bmN0aW9uIHBhdGhzVG9UcmVlKHBhdGhzLCBuZXdMZWFmRm4sIGNvbmZsaWN0Rm4sIHJvb3QgPSB7fSkge1xuICBwYXRocy5mb3JFYWNoKHBhdGggPT4ge1xuICAgIGNvbnN0IHBhdGhBcnJheSA9IHBhdGguc3BsaXQoJy4nKTtcbiAgICBsZXQgdHJlZSA9IHJvb3Q7XG5cbiAgICAvLyB1c2UgLmV2ZXJ5IGp1c3QgZm9yIGl0ZXJhdGlvbiB3aXRoIGJyZWFrXG4gICAgY29uc3Qgc3VjY2VzcyA9IHBhdGhBcnJheS5zbGljZSgwLCAtMSkuZXZlcnkoKGtleSwgaSkgPT4ge1xuICAgICAgaWYgKCFoYXNPd24uY2FsbCh0cmVlLCBrZXkpKSB7XG4gICAgICAgIHRyZWVba2V5XSA9IHt9O1xuICAgICAgfSBlbHNlIGlmICh0cmVlW2tleV0gIT09IE9iamVjdCh0cmVlW2tleV0pKSB7XG4gICAgICAgIHRyZWVba2V5XSA9IGNvbmZsaWN0Rm4oXG4gICAgICAgICAgdHJlZVtrZXldLFxuICAgICAgICAgIHBhdGhBcnJheS5zbGljZSgwLCBpICsgMSkuam9pbignLicpLFxuICAgICAgICAgIHBhdGhcbiAgICAgICAgKTtcblxuICAgICAgICAvLyBicmVhayBvdXQgb2YgbG9vcCBpZiB3ZSBhcmUgZmFpbGluZyBmb3IgdGhpcyBwYXRoXG4gICAgICAgIGlmICh0cmVlW2tleV0gIT09IE9iamVjdCh0cmVlW2tleV0pKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRyZWUgPSB0cmVlW2tleV07XG5cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0pO1xuXG4gICAgaWYgKHN1Y2Nlc3MpIHtcbiAgICAgIGNvbnN0IGxhc3RLZXkgPSBwYXRoQXJyYXlbcGF0aEFycmF5Lmxlbmd0aCAtIDFdO1xuICAgICAgaWYgKGhhc093bi5jYWxsKHRyZWUsIGxhc3RLZXkpKSB7XG4gICAgICAgIHRyZWVbbGFzdEtleV0gPSBjb25mbGljdEZuKHRyZWVbbGFzdEtleV0sIHBhdGgsIHBhdGgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdHJlZVtsYXN0S2V5XSA9IG5ld0xlYWZGbihwYXRoKTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiByb290O1xufVxuXG4vLyBNYWtlcyBzdXJlIHdlIGdldCAyIGVsZW1lbnRzIGFycmF5IGFuZCBhc3N1bWUgdGhlIGZpcnN0IG9uZSB0byBiZSB4IGFuZFxuLy8gdGhlIHNlY29uZCBvbmUgdG8geSBubyBtYXR0ZXIgd2hhdCB1c2VyIHBhc3Nlcy5cbi8vIEluIGNhc2UgdXNlciBwYXNzZXMgeyBsb246IHgsIGxhdDogeSB9IHJldHVybnMgW3gsIHldXG5mdW5jdGlvbiBwb2ludFRvQXJyYXkocG9pbnQpIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkocG9pbnQpID8gcG9pbnQuc2xpY2UoKSA6IFtwb2ludC54LCBwb2ludC55XTtcbn1cblxuLy8gQ3JlYXRpbmcgYSBkb2N1bWVudCBmcm9tIGFuIHVwc2VydCBpcyBxdWl0ZSB0cmlja3kuXG4vLyBFLmcuIHRoaXMgc2VsZWN0b3I6IHtcIiRvclwiOiBbe1wiYi5mb29cIjoge1wiJGFsbFwiOiBbXCJiYXJcIl19fV19LCBzaG91bGQgcmVzdWx0XG4vLyBpbjoge1wiYi5mb29cIjogXCJiYXJcIn1cbi8vIEJ1dCB0aGlzIHNlbGVjdG9yOiB7XCIkb3JcIjogW3tcImJcIjoge1wiZm9vXCI6IHtcIiRhbGxcIjogW1wiYmFyXCJdfX19XX0gc2hvdWxkIHRocm93XG4vLyBhbiBlcnJvclxuXG4vLyBTb21lIHJ1bGVzIChmb3VuZCBtYWlubHkgd2l0aCB0cmlhbCAmIGVycm9yLCBzbyB0aGVyZSBtaWdodCBiZSBtb3JlKTpcbi8vIC0gaGFuZGxlIGFsbCBjaGlsZHMgb2YgJGFuZCAob3IgaW1wbGljaXQgJGFuZClcbi8vIC0gaGFuZGxlICRvciBub2RlcyB3aXRoIGV4YWN0bHkgMSBjaGlsZFxuLy8gLSBpZ25vcmUgJG9yIG5vZGVzIHdpdGggbW9yZSB0aGFuIDEgY2hpbGRcbi8vIC0gaWdub3JlICRub3IgYW5kICRub3Qgbm9kZXNcbi8vIC0gdGhyb3cgd2hlbiBhIHZhbHVlIGNhbiBub3QgYmUgc2V0IHVuYW1iaWd1b3VzbHlcbi8vIC0gZXZlcnkgdmFsdWUgZm9yICRhbGwgc2hvdWxkIGJlIGRlYWx0IHdpdGggYXMgc2VwYXJhdGUgJGVxLXNcbi8vIC0gdGhyZWF0IGFsbCBjaGlsZHJlbiBvZiAkYWxsIGFzICRlcSBzZXR0ZXJzICg9PiBzZXQgaWYgJGFsbC5sZW5ndGggPT09IDEsXG4vLyAgIG90aGVyd2lzZSB0aHJvdyBlcnJvcilcbi8vIC0geW91IGNhbiBub3QgbWl4ICckJy1wcmVmaXhlZCBrZXlzIGFuZCBub24tJyQnLXByZWZpeGVkIGtleXNcbi8vIC0geW91IGNhbiBvbmx5IGhhdmUgZG90dGVkIGtleXMgb24gYSByb290LWxldmVsXG4vLyAtIHlvdSBjYW4gbm90IGhhdmUgJyQnLXByZWZpeGVkIGtleXMgbW9yZSB0aGFuIG9uZS1sZXZlbCBkZWVwIGluIGFuIG9iamVjdFxuXG4vLyBIYW5kbGVzIG9uZSBrZXkvdmFsdWUgcGFpciB0byBwdXQgaW4gdGhlIHNlbGVjdG9yIGRvY3VtZW50XG5mdW5jdGlvbiBwb3B1bGF0ZURvY3VtZW50V2l0aEtleVZhbHVlKGRvY3VtZW50LCBrZXksIHZhbHVlKSB7XG4gIGlmICh2YWx1ZSAmJiBPYmplY3QuZ2V0UHJvdG90eXBlT2YodmFsdWUpID09PSBPYmplY3QucHJvdG90eXBlKSB7XG4gICAgcG9wdWxhdGVEb2N1bWVudFdpdGhPYmplY3QoZG9jdW1lbnQsIGtleSwgdmFsdWUpO1xuICB9IGVsc2UgaWYgKCEodmFsdWUgaW5zdGFuY2VvZiBSZWdFeHApKSB7XG4gICAgaW5zZXJ0SW50b0RvY3VtZW50KGRvY3VtZW50LCBrZXksIHZhbHVlKTtcbiAgfVxufVxuXG4vLyBIYW5kbGVzIGEga2V5LCB2YWx1ZSBwYWlyIHRvIHB1dCBpbiB0aGUgc2VsZWN0b3IgZG9jdW1lbnRcbi8vIGlmIHRoZSB2YWx1ZSBpcyBhbiBvYmplY3RcbmZ1bmN0aW9uIHBvcHVsYXRlRG9jdW1lbnRXaXRoT2JqZWN0KGRvY3VtZW50LCBrZXksIHZhbHVlKSB7XG4gIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyh2YWx1ZSk7XG4gIGNvbnN0IHVucHJlZml4ZWRLZXlzID0ga2V5cy5maWx0ZXIob3AgPT4gb3BbMF0gIT09ICckJyk7XG5cbiAgaWYgKHVucHJlZml4ZWRLZXlzLmxlbmd0aCA+IDAgfHwgIWtleXMubGVuZ3RoKSB7XG4gICAgLy8gTGl0ZXJhbCAocG9zc2libHkgZW1wdHkpIG9iamVjdCAoIG9yIGVtcHR5IG9iamVjdCApXG4gICAgLy8gRG9uJ3QgYWxsb3cgbWl4aW5nICckJy1wcmVmaXhlZCB3aXRoIG5vbi0nJCctcHJlZml4ZWQgZmllbGRzXG4gICAgaWYgKGtleXMubGVuZ3RoICE9PSB1bnByZWZpeGVkS2V5cy5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgdW5rbm93biBvcGVyYXRvcjogJHt1bnByZWZpeGVkS2V5c1swXX1gKTtcbiAgICB9XG5cbiAgICB2YWxpZGF0ZU9iamVjdCh2YWx1ZSwga2V5KTtcbiAgICBpbnNlcnRJbnRvRG9jdW1lbnQoZG9jdW1lbnQsIGtleSwgdmFsdWUpO1xuICB9IGVsc2Uge1xuICAgIE9iamVjdC5rZXlzKHZhbHVlKS5mb3JFYWNoKG9wID0+IHtcbiAgICAgIGNvbnN0IG9iamVjdCA9IHZhbHVlW29wXTtcblxuICAgICAgaWYgKG9wID09PSAnJGVxJykge1xuICAgICAgICBwb3B1bGF0ZURvY3VtZW50V2l0aEtleVZhbHVlKGRvY3VtZW50LCBrZXksIG9iamVjdCk7XG4gICAgICB9IGVsc2UgaWYgKG9wID09PSAnJGFsbCcpIHtcbiAgICAgICAgLy8gZXZlcnkgdmFsdWUgZm9yICRhbGwgc2hvdWxkIGJlIGRlYWx0IHdpdGggYXMgc2VwYXJhdGUgJGVxLXNcbiAgICAgICAgb2JqZWN0LmZvckVhY2goZWxlbWVudCA9PlxuICAgICAgICAgIHBvcHVsYXRlRG9jdW1lbnRXaXRoS2V5VmFsdWUoZG9jdW1lbnQsIGtleSwgZWxlbWVudClcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufVxuXG4vLyBGaWxscyBhIGRvY3VtZW50IHdpdGggY2VydGFpbiBmaWVsZHMgZnJvbSBhbiB1cHNlcnQgc2VsZWN0b3JcbmV4cG9ydCBmdW5jdGlvbiBwb3B1bGF0ZURvY3VtZW50V2l0aFF1ZXJ5RmllbGRzKHF1ZXJ5LCBkb2N1bWVudCA9IHt9KSB7XG4gIGlmIChPYmplY3QuZ2V0UHJvdG90eXBlT2YocXVlcnkpID09PSBPYmplY3QucHJvdG90eXBlKSB7XG4gICAgLy8gaGFuZGxlIGltcGxpY2l0ICRhbmRcbiAgICBPYmplY3Qua2V5cyhxdWVyeSkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgY29uc3QgdmFsdWUgPSBxdWVyeVtrZXldO1xuXG4gICAgICBpZiAoa2V5ID09PSAnJGFuZCcpIHtcbiAgICAgICAgLy8gaGFuZGxlIGV4cGxpY2l0ICRhbmRcbiAgICAgICAgdmFsdWUuZm9yRWFjaChlbGVtZW50ID0+XG4gICAgICAgICAgcG9wdWxhdGVEb2N1bWVudFdpdGhRdWVyeUZpZWxkcyhlbGVtZW50LCBkb2N1bWVudClcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoa2V5ID09PSAnJG9yJykge1xuICAgICAgICAvLyBoYW5kbGUgJG9yIG5vZGVzIHdpdGggZXhhY3RseSAxIGNoaWxkXG4gICAgICAgIGlmICh2YWx1ZS5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICBwb3B1bGF0ZURvY3VtZW50V2l0aFF1ZXJ5RmllbGRzKHZhbHVlWzBdLCBkb2N1bWVudCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoa2V5WzBdICE9PSAnJCcpIHtcbiAgICAgICAgLy8gSWdub3JlIG90aGVyICckJy1wcmVmaXhlZCBsb2dpY2FsIHNlbGVjdG9yc1xuICAgICAgICBwb3B1bGF0ZURvY3VtZW50V2l0aEtleVZhbHVlKGRvY3VtZW50LCBrZXksIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICAvLyBIYW5kbGUgbWV0ZW9yLXNwZWNpZmljIHNob3J0Y3V0IGZvciBzZWxlY3RpbmcgX2lkXG4gICAgaWYgKExvY2FsQ29sbGVjdGlvbi5fc2VsZWN0b3JJc0lkKHF1ZXJ5KSkge1xuICAgICAgaW5zZXJ0SW50b0RvY3VtZW50KGRvY3VtZW50LCAnX2lkJywgcXVlcnkpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBkb2N1bWVudDtcbn1cblxuLy8gVHJhdmVyc2VzIHRoZSBrZXlzIG9mIHBhc3NlZCBwcm9qZWN0aW9uIGFuZCBjb25zdHJ1Y3RzIGEgdHJlZSB3aGVyZSBhbGxcbi8vIGxlYXZlcyBhcmUgZWl0aGVyIGFsbCBUcnVlIG9yIGFsbCBGYWxzZVxuLy8gQHJldHVybnMgT2JqZWN0OlxuLy8gIC0gdHJlZSAtIE9iamVjdCAtIHRyZWUgcmVwcmVzZW50YXRpb24gb2Yga2V5cyBpbnZvbHZlZCBpbiBwcm9qZWN0aW9uXG4vLyAgKGV4Y2VwdGlvbiBmb3IgJ19pZCcgYXMgaXQgaXMgYSBzcGVjaWFsIGNhc2UgaGFuZGxlZCBzZXBhcmF0ZWx5KVxuLy8gIC0gaW5jbHVkaW5nIC0gQm9vbGVhbiAtIFwidGFrZSBvbmx5IGNlcnRhaW4gZmllbGRzXCIgdHlwZSBvZiBwcm9qZWN0aW9uXG5leHBvcnQgZnVuY3Rpb24gcHJvamVjdGlvbkRldGFpbHMoZmllbGRzKSB7XG4gIC8vIEZpbmQgdGhlIG5vbi1faWQga2V5cyAoX2lkIGlzIGhhbmRsZWQgc3BlY2lhbGx5IGJlY2F1c2UgaXQgaXMgaW5jbHVkZWRcbiAgLy8gdW5sZXNzIGV4cGxpY2l0bHkgZXhjbHVkZWQpLiBTb3J0IHRoZSBrZXlzLCBzbyB0aGF0IG91ciBjb2RlIHRvIGRldGVjdFxuICAvLyBvdmVybGFwcyBsaWtlICdmb28nIGFuZCAnZm9vLmJhcicgY2FuIGFzc3VtZSB0aGF0ICdmb28nIGNvbWVzIGZpcnN0LlxuICBsZXQgZmllbGRzS2V5cyA9IE9iamVjdC5rZXlzKGZpZWxkcykuc29ydCgpO1xuXG4gIC8vIElmIF9pZCBpcyB0aGUgb25seSBmaWVsZCBpbiB0aGUgcHJvamVjdGlvbiwgZG8gbm90IHJlbW92ZSBpdCwgc2luY2UgaXQgaXNcbiAgLy8gcmVxdWlyZWQgdG8gZGV0ZXJtaW5lIGlmIHRoaXMgaXMgYW4gZXhjbHVzaW9uIG9yIGV4Y2x1c2lvbi4gQWxzbyBrZWVwIGFuXG4gIC8vIGluY2x1c2l2ZSBfaWQsIHNpbmNlIGluY2x1c2l2ZSBfaWQgZm9sbG93cyB0aGUgbm9ybWFsIHJ1bGVzIGFib3V0IG1peGluZ1xuICAvLyBpbmNsdXNpdmUgYW5kIGV4Y2x1c2l2ZSBmaWVsZHMuIElmIF9pZCBpcyBub3QgdGhlIG9ubHkgZmllbGQgaW4gdGhlXG4gIC8vIHByb2plY3Rpb24gYW5kIGlzIGV4Y2x1c2l2ZSwgcmVtb3ZlIGl0IHNvIGl0IGNhbiBiZSBoYW5kbGVkIGxhdGVyIGJ5IGFcbiAgLy8gc3BlY2lhbCBjYXNlLCBzaW5jZSBleGNsdXNpdmUgX2lkIGlzIGFsd2F5cyBhbGxvd2VkLlxuICBpZiAoIShmaWVsZHNLZXlzLmxlbmd0aCA9PT0gMSAmJiBmaWVsZHNLZXlzWzBdID09PSAnX2lkJykgJiZcbiAgICAgICEoZmllbGRzS2V5cy5pbmNsdWRlcygnX2lkJykgJiYgZmllbGRzLl9pZCkpIHtcbiAgICBmaWVsZHNLZXlzID0gZmllbGRzS2V5cy5maWx0ZXIoa2V5ID0+IGtleSAhPT0gJ19pZCcpO1xuICB9XG5cbiAgbGV0IGluY2x1ZGluZyA9IG51bGw7IC8vIFVua25vd25cblxuICBmaWVsZHNLZXlzLmZvckVhY2goa2V5UGF0aCA9PiB7XG4gICAgY29uc3QgcnVsZSA9ICEhZmllbGRzW2tleVBhdGhdO1xuXG4gICAgaWYgKGluY2x1ZGluZyA9PT0gbnVsbCkge1xuICAgICAgaW5jbHVkaW5nID0gcnVsZTtcbiAgICB9XG5cbiAgICAvLyBUaGlzIGVycm9yIG1lc3NhZ2UgaXMgY29waWVkIGZyb20gTW9uZ29EQiBzaGVsbFxuICAgIGlmIChpbmNsdWRpbmcgIT09IHJ1bGUpIHtcbiAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKFxuICAgICAgICAnWW91IGNhbm5vdCBjdXJyZW50bHkgbWl4IGluY2x1ZGluZyBhbmQgZXhjbHVkaW5nIGZpZWxkcy4nXG4gICAgICApO1xuICAgIH1cbiAgfSk7XG5cbiAgY29uc3QgcHJvamVjdGlvblJ1bGVzVHJlZSA9IHBhdGhzVG9UcmVlKFxuICAgIGZpZWxkc0tleXMsXG4gICAgcGF0aCA9PiBpbmNsdWRpbmcsXG4gICAgKG5vZGUsIHBhdGgsIGZ1bGxQYXRoKSA9PiB7XG4gICAgICAvLyBDaGVjayBwYXNzZWQgcHJvamVjdGlvbiBmaWVsZHMnIGtleXM6IElmIHlvdSBoYXZlIHR3byBydWxlcyBzdWNoIGFzXG4gICAgICAvLyAnZm9vLmJhcicgYW5kICdmb28uYmFyLmJheicsIHRoZW4gdGhlIHJlc3VsdCBiZWNvbWVzIGFtYmlndW91cy4gSWZcbiAgICAgIC8vIHRoYXQgaGFwcGVucywgdGhlcmUgaXMgYSBwcm9iYWJpbGl0eSB5b3UgYXJlIGRvaW5nIHNvbWV0aGluZyB3cm9uZyxcbiAgICAgIC8vIGZyYW1ld29yayBzaG91bGQgbm90aWZ5IHlvdSBhYm91dCBzdWNoIG1pc3Rha2UgZWFybGllciBvbiBjdXJzb3JcbiAgICAgIC8vIGNvbXBpbGF0aW9uIHN0ZXAgdGhhbiBsYXRlciBkdXJpbmcgcnVudGltZS4gIE5vdGUsIHRoYXQgcmVhbCBtb25nb1xuICAgICAgLy8gZG9lc24ndCBkbyBhbnl0aGluZyBhYm91dCBpdCBhbmQgdGhlIGxhdGVyIHJ1bGUgYXBwZWFycyBpbiBwcm9qZWN0aW9uXG4gICAgICAvLyBwcm9qZWN0LCBtb3JlIHByaW9yaXR5IGl0IHRha2VzLlxuICAgICAgLy9cbiAgICAgIC8vIEV4YW1wbGUsIGFzc3VtZSBmb2xsb3dpbmcgaW4gbW9uZ28gc2hlbGw6XG4gICAgICAvLyA+IGRiLmNvbGwuaW5zZXJ0KHsgYTogeyBiOiAyMywgYzogNDQgfSB9KVxuICAgICAgLy8gPiBkYi5jb2xsLmZpbmQoe30sIHsgJ2EnOiAxLCAnYS5iJzogMSB9KVxuICAgICAgLy8ge1wiX2lkXCI6IE9iamVjdElkKFwiNTIwYmZlNDU2MDI0NjA4ZThlZjI0YWYzXCIpLCBcImFcIjoge1wiYlwiOiAyM319XG4gICAgICAvLyA+IGRiLmNvbGwuZmluZCh7fSwgeyAnYS5iJzogMSwgJ2EnOiAxIH0pXG4gICAgICAvLyB7XCJfaWRcIjogT2JqZWN0SWQoXCI1MjBiZmU0NTYwMjQ2MDhlOGVmMjRhZjNcIiksIFwiYVwiOiB7XCJiXCI6IDIzLCBcImNcIjogNDR9fVxuICAgICAgLy9cbiAgICAgIC8vIE5vdGUsIGhvdyBzZWNvbmQgdGltZSB0aGUgcmV0dXJuIHNldCBvZiBrZXlzIGlzIGRpZmZlcmVudC5cbiAgICAgIGNvbnN0IGN1cnJlbnRQYXRoID0gZnVsbFBhdGg7XG4gICAgICBjb25zdCBhbm90aGVyUGF0aCA9IHBhdGg7XG4gICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcihcbiAgICAgICAgYGJvdGggJHtjdXJyZW50UGF0aH0gYW5kICR7YW5vdGhlclBhdGh9IGZvdW5kIGluIGZpZWxkcyBvcHRpb24sIGAgK1xuICAgICAgICAndXNpbmcgYm90aCBvZiB0aGVtIG1heSB0cmlnZ2VyIHVuZXhwZWN0ZWQgYmVoYXZpb3IuIERpZCB5b3UgbWVhbiB0byAnICtcbiAgICAgICAgJ3VzZSBvbmx5IG9uZSBvZiB0aGVtPydcbiAgICAgICk7XG4gICAgfSk7XG5cbiAgcmV0dXJuIHtpbmNsdWRpbmcsIHRyZWU6IHByb2plY3Rpb25SdWxlc1RyZWV9O1xufVxuXG4vLyBUYWtlcyBhIFJlZ0V4cCBvYmplY3QgYW5kIHJldHVybnMgYW4gZWxlbWVudCBtYXRjaGVyLlxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2V4cEVsZW1lbnRNYXRjaGVyKHJlZ2V4cCkge1xuICByZXR1cm4gdmFsdWUgPT4ge1xuICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuICAgICAgcmV0dXJuIHZhbHVlLnRvU3RyaW5nKCkgPT09IHJlZ2V4cC50b1N0cmluZygpO1xuICAgIH1cblxuICAgIC8vIFJlZ2V4cHMgb25seSB3b3JrIGFnYWluc3Qgc3RyaW5ncy5cbiAgICBpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIC8vIFJlc2V0IHJlZ2V4cCdzIHN0YXRlIHRvIGF2b2lkIGluY29uc2lzdGVudCBtYXRjaGluZyBmb3Igb2JqZWN0cyB3aXRoIHRoZVxuICAgIC8vIHNhbWUgdmFsdWUgb24gY29uc2VjdXRpdmUgY2FsbHMgb2YgcmVnZXhwLnRlc3QuIFRoaXMgaGFwcGVucyBvbmx5IGlmIHRoZVxuICAgIC8vIHJlZ2V4cCBoYXMgdGhlICdnJyBmbGFnLiBBbHNvIG5vdGUgdGhhdCBFUzYgaW50cm9kdWNlcyBhIG5ldyBmbGFnICd5JyBmb3JcbiAgICAvLyB3aGljaCB3ZSBzaG91bGQgKm5vdCogY2hhbmdlIHRoZSBsYXN0SW5kZXggYnV0IE1vbmdvREIgZG9lc24ndCBzdXBwb3J0XG4gICAgLy8gZWl0aGVyIG9mIHRoZXNlIGZsYWdzLlxuICAgIHJlZ2V4cC5sYXN0SW5kZXggPSAwO1xuXG4gICAgcmV0dXJuIHJlZ2V4cC50ZXN0KHZhbHVlKTtcbiAgfTtcbn1cblxuLy8gVmFsaWRhdGVzIHRoZSBrZXkgaW4gYSBwYXRoLlxuLy8gT2JqZWN0cyB0aGF0IGFyZSBuZXN0ZWQgbW9yZSB0aGVuIDEgbGV2ZWwgY2Fubm90IGhhdmUgZG90dGVkIGZpZWxkc1xuLy8gb3IgZmllbGRzIHN0YXJ0aW5nIHdpdGggJyQnXG5mdW5jdGlvbiB2YWxpZGF0ZUtleUluUGF0aChrZXksIHBhdGgpIHtcbiAgaWYgKGtleS5pbmNsdWRlcygnLicpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgYFRoZSBkb3R0ZWQgZmllbGQgJyR7a2V5fScgaW4gJyR7cGF0aH0uJHtrZXl9IGlzIG5vdCB2YWxpZCBmb3Igc3RvcmFnZS5gXG4gICAgKTtcbiAgfVxuXG4gIGlmIChrZXlbMF0gPT09ICckJykge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIGBUaGUgZG9sbGFyICgkKSBwcmVmaXhlZCBmaWVsZCAgJyR7cGF0aH0uJHtrZXl9IGlzIG5vdCB2YWxpZCBmb3Igc3RvcmFnZS5gXG4gICAgKTtcbiAgfVxufVxuXG4vLyBSZWN1cnNpdmVseSB2YWxpZGF0ZXMgYW4gb2JqZWN0IHRoYXQgaXMgbmVzdGVkIG1vcmUgdGhhbiBvbmUgbGV2ZWwgZGVlcFxuZnVuY3Rpb24gdmFsaWRhdGVPYmplY3Qob2JqZWN0LCBwYXRoKSB7XG4gIGlmIChvYmplY3QgJiYgT2JqZWN0LmdldFByb3RvdHlwZU9mKG9iamVjdCkgPT09IE9iamVjdC5wcm90b3R5cGUpIHtcbiAgICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIHZhbGlkYXRlS2V5SW5QYXRoKGtleSwgcGF0aCk7XG4gICAgICB2YWxpZGF0ZU9iamVjdChvYmplY3Rba2V5XSwgcGF0aCArICcuJyArIGtleSk7XG4gICAgfSk7XG4gIH1cbn1cbiIsIi8qKiBFeHBvcnRlZCB2YWx1ZXMgYXJlIGFsc28gdXNlZCBpbiB0aGUgbW9uZ28gcGFja2FnZS4gKi9cblxuLyoqIEBwYXJhbSB7c3RyaW5nfSBtZXRob2QgKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRBc3luY01ldGhvZE5hbWUobWV0aG9kKSB7XG4gIHJldHVybiBgJHttZXRob2QucmVwbGFjZSgnXycsICcnKX1Bc3luY2A7XG59XG5cbmV4cG9ydCBjb25zdCBBU1lOQ19DT0xMRUNUSU9OX01FVEhPRFMgPSBbXG4gICdfY3JlYXRlQ2FwcGVkQ29sbGVjdGlvbicsXG4gICdkcm9wQ29sbGVjdGlvbicsXG4gICdkcm9wSW5kZXgnLFxuICAvKipcbiAgICogQHN1bW1hcnkgQ3JlYXRlcyB0aGUgc3BlY2lmaWVkIGluZGV4IG9uIHRoZSBjb2xsZWN0aW9uLlxuICAgKiBAbG9jdXMgc2VydmVyXG4gICAqIEBtZXRob2QgY3JlYXRlSW5kZXhBc3luY1xuICAgKiBAbWVtYmVyb2YgTW9uZ28uQ29sbGVjdGlvblxuICAgKiBAaW5zdGFuY2VcbiAgICogQHBhcmFtIHtPYmplY3R9IGluZGV4IEEgZG9jdW1lbnQgdGhhdCBjb250YWlucyB0aGUgZmllbGQgYW5kIHZhbHVlIHBhaXJzIHdoZXJlIHRoZSBmaWVsZCBpcyB0aGUgaW5kZXgga2V5IGFuZCB0aGUgdmFsdWUgZGVzY3JpYmVzIHRoZSB0eXBlIG9mIGluZGV4IGZvciB0aGF0IGZpZWxkLiBGb3IgYW4gYXNjZW5kaW5nIGluZGV4IG9uIGEgZmllbGQsIHNwZWNpZnkgYSB2YWx1ZSBvZiBgMWA7IGZvciBkZXNjZW5kaW5nIGluZGV4LCBzcGVjaWZ5IGEgdmFsdWUgb2YgYC0xYC4gVXNlIGB0ZXh0YCBmb3IgdGV4dCBpbmRleGVzLlxuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIEFsbCBvcHRpb25zIGFyZSBsaXN0ZWQgaW4gW01vbmdvREIgZG9jdW1lbnRhdGlvbl0oaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9yZWZlcmVuY2UvbWV0aG9kL2RiLmNvbGxlY3Rpb24uY3JlYXRlSW5kZXgvI29wdGlvbnMpXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBvcHRpb25zLm5hbWUgTmFtZSBvZiB0aGUgaW5kZXhcbiAgICogQHBhcmFtIHtCb29sZWFufSBvcHRpb25zLnVuaXF1ZSBEZWZpbmUgdGhhdCB0aGUgaW5kZXggdmFsdWVzIG11c3QgYmUgdW5pcXVlLCBtb3JlIGF0IFtNb25nb0RCIGRvY3VtZW50YXRpb25dKGh0dHBzOi8vZG9jcy5tb25nb2RiLmNvbS9tYW51YWwvY29yZS9pbmRleC11bmlxdWUvKVxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMuc3BhcnNlIERlZmluZSB0aGF0IHRoZSBpbmRleCBpcyBzcGFyc2UsIG1vcmUgYXQgW01vbmdvREIgZG9jdW1lbnRhdGlvbl0oaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9jb3JlL2luZGV4LXNwYXJzZS8pXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfVxuICAgKi9cbiAgJ2NyZWF0ZUluZGV4JyxcbiAgLyoqXG4gICAqIEBzdW1tYXJ5IEZpbmRzIHRoZSBmaXJzdCBkb2N1bWVudCB0aGF0IG1hdGNoZXMgdGhlIHNlbGVjdG9yLCBhcyBvcmRlcmVkIGJ5IHNvcnQgYW5kIHNraXAgb3B0aW9ucy4gUmV0dXJucyBgdW5kZWZpbmVkYCBpZiBubyBtYXRjaGluZyBkb2N1bWVudCBpcyBmb3VuZC5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBtZXRob2QgZmluZE9uZUFzeW5jXG4gICAqIEBtZW1iZXJvZiBNb25nby5Db2xsZWN0aW9uXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge01vbmdvU2VsZWN0b3J9IFtzZWxlY3Rvcl0gQSBxdWVyeSBkZXNjcmliaW5nIHRoZSBkb2N1bWVudHMgdG8gZmluZFxuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdXG4gICAqIEBwYXJhbSB7TW9uZ29Tb3J0U3BlY2lmaWVyfSBvcHRpb25zLnNvcnQgU29ydCBvcmRlciAoZGVmYXVsdDogbmF0dXJhbCBvcmRlcilcbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9wdGlvbnMuc2tpcCBOdW1iZXIgb2YgcmVzdWx0cyB0byBza2lwIGF0IHRoZSBiZWdpbm5pbmdcbiAgICogQHBhcmFtIHtNb25nb0ZpZWxkU3BlY2lmaWVyfSBvcHRpb25zLmZpZWxkcyBEaWN0aW9uYXJ5IG9mIGZpZWxkcyB0byByZXR1cm4gb3IgZXhjbHVkZS5cbiAgICogQHBhcmFtIHtCb29sZWFufSBvcHRpb25zLnJlYWN0aXZlIChDbGllbnQgb25seSkgRGVmYXVsdCB0cnVlOyBwYXNzIGZhbHNlIHRvIGRpc2FibGUgcmVhY3Rpdml0eVxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBvcHRpb25zLnRyYW5zZm9ybSBPdmVycmlkZXMgYHRyYW5zZm9ybWAgb24gdGhlIFtgQ29sbGVjdGlvbmBdKCNjb2xsZWN0aW9ucykgZm9yIHRoaXMgY3Vyc29yLiAgUGFzcyBgbnVsbGAgdG8gZGlzYWJsZSB0cmFuc2Zvcm1hdGlvbi5cbiAgICogQHBhcmFtIHtTdHJpbmd9IG9wdGlvbnMucmVhZFByZWZlcmVuY2UgKFNlcnZlciBvbmx5KSBTcGVjaWZpZXMgYSBjdXN0b20gTW9uZ29EQiBbYHJlYWRQcmVmZXJlbmNlYF0oaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9jb3JlL3JlYWQtcHJlZmVyZW5jZSkgZm9yIGZldGNoaW5nIHRoZSBkb2N1bWVudC4gUG9zc2libGUgdmFsdWVzIGFyZSBgcHJpbWFyeWAsIGBwcmltYXJ5UHJlZmVycmVkYCwgYHNlY29uZGFyeWAsIGBzZWNvbmRhcnlQcmVmZXJyZWRgIGFuZCBgbmVhcmVzdGAuXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfVxuICAgKi9cbiAgJ2ZpbmRPbmUnLFxuICAvKipcbiAgICogQHN1bW1hcnkgSW5zZXJ0IGEgZG9jdW1lbnQgaW4gdGhlIGNvbGxlY3Rpb24uICBSZXR1cm5zIGl0cyB1bmlxdWUgX2lkLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQG1ldGhvZCAgaW5zZXJ0QXN5bmNcbiAgICogQG1lbWJlcm9mIE1vbmdvLkNvbGxlY3Rpb25cbiAgICogQGluc3RhbmNlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBkb2MgVGhlIGRvY3VtZW50IHRvIGluc2VydC4gTWF5IG5vdCB5ZXQgaGF2ZSBhbiBfaWQgYXR0cmlidXRlLCBpbiB3aGljaCBjYXNlIE1ldGVvciB3aWxsIGdlbmVyYXRlIG9uZSBmb3IgeW91LlxuICAgKiBAcmV0dXJuIHtQcm9taXNlfVxuICAgKi9cbiAgJ2luc2VydCcsXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBSZW1vdmUgZG9jdW1lbnRzIGZyb20gdGhlIGNvbGxlY3Rpb25cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBtZXRob2QgcmVtb3ZlQXN5bmNcbiAgICogQG1lbWJlcm9mIE1vbmdvLkNvbGxlY3Rpb25cbiAgICogQGluc3RhbmNlXG4gICAqIEBwYXJhbSB7TW9uZ29TZWxlY3Rvcn0gc2VsZWN0b3IgU3BlY2lmaWVzIHdoaWNoIGRvY3VtZW50cyB0byByZW1vdmVcbiAgICogQHJldHVybiB7UHJvbWlzZX1cbiAgICovXG4gICdyZW1vdmUnLFxuICAvKipcbiAgICogQHN1bW1hcnkgTW9kaWZ5IG9uZSBvciBtb3JlIGRvY3VtZW50cyBpbiB0aGUgY29sbGVjdGlvbi4gUmV0dXJucyB0aGUgbnVtYmVyIG9mIG1hdGNoZWQgZG9jdW1lbnRzLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQG1ldGhvZCB1cGRhdGVBc3luY1xuICAgKiBAbWVtYmVyb2YgTW9uZ28uQ29sbGVjdGlvblxuICAgKiBAaW5zdGFuY2VcbiAgICogQHBhcmFtIHtNb25nb1NlbGVjdG9yfSBzZWxlY3RvciBTcGVjaWZpZXMgd2hpY2ggZG9jdW1lbnRzIHRvIG1vZGlmeVxuICAgKiBAcGFyYW0ge01vbmdvTW9kaWZpZXJ9IG1vZGlmaWVyIFNwZWNpZmllcyBob3cgdG8gbW9kaWZ5IHRoZSBkb2N1bWVudHNcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXVxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMubXVsdGkgVHJ1ZSB0byBtb2RpZnkgYWxsIG1hdGNoaW5nIGRvY3VtZW50czsgZmFsc2UgdG8gb25seSBtb2RpZnkgb25lIG9mIHRoZSBtYXRjaGluZyBkb2N1bWVudHMgKHRoZSBkZWZhdWx0KS5cbiAgICogQHBhcmFtIHtCb29sZWFufSBvcHRpb25zLnVwc2VydCBUcnVlIHRvIGluc2VydCBhIGRvY3VtZW50IGlmIG5vIG1hdGNoaW5nIGRvY3VtZW50cyBhcmUgZm91bmQuXG4gICAqIEBwYXJhbSB7QXJyYXl9IG9wdGlvbnMuYXJyYXlGaWx0ZXJzIE9wdGlvbmFsLiBVc2VkIGluIGNvbWJpbmF0aW9uIHdpdGggTW9uZ29EQiBbZmlsdGVyZWQgcG9zaXRpb25hbCBvcGVyYXRvcl0oaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9yZWZlcmVuY2Uvb3BlcmF0b3IvdXBkYXRlL3Bvc2l0aW9uYWwtZmlsdGVyZWQvKSB0byBzcGVjaWZ5IHdoaWNoIGVsZW1lbnRzIHRvIG1vZGlmeSBpbiBhbiBhcnJheSBmaWVsZC5cbiAgICogQHJldHVybiB7UHJvbWlzZX1cbiAgICovXG4gICd1cGRhdGUnLFxuICAvKipcbiAgICogQHN1bW1hcnkgTW9kaWZ5IG9uZSBvciBtb3JlIGRvY3VtZW50cyBpbiB0aGUgY29sbGVjdGlvbiwgb3IgaW5zZXJ0IG9uZSBpZiBubyBtYXRjaGluZyBkb2N1bWVudHMgd2VyZSBmb3VuZC4gUmV0dXJucyBhbiBvYmplY3Qgd2l0aCBrZXlzIGBudW1iZXJBZmZlY3RlZGAgKHRoZSBudW1iZXIgb2YgZG9jdW1lbnRzIG1vZGlmaWVkKSAgYW5kIGBpbnNlcnRlZElkYCAodGhlIHVuaXF1ZSBfaWQgb2YgdGhlIGRvY3VtZW50IHRoYXQgd2FzIGluc2VydGVkLCBpZiBhbnkpLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQG1ldGhvZCB1cHNlcnRBc3luY1xuICAgKiBAbWVtYmVyb2YgTW9uZ28uQ29sbGVjdGlvblxuICAgKiBAaW5zdGFuY2VcbiAgICogQHBhcmFtIHtNb25nb1NlbGVjdG9yfSBzZWxlY3RvciBTcGVjaWZpZXMgd2hpY2ggZG9jdW1lbnRzIHRvIG1vZGlmeVxuICAgKiBAcGFyYW0ge01vbmdvTW9kaWZpZXJ9IG1vZGlmaWVyIFNwZWNpZmllcyBob3cgdG8gbW9kaWZ5IHRoZSBkb2N1bWVudHNcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXVxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMubXVsdGkgVHJ1ZSB0byBtb2RpZnkgYWxsIG1hdGNoaW5nIGRvY3VtZW50czsgZmFsc2UgdG8gb25seSBtb2RpZnkgb25lIG9mIHRoZSBtYXRjaGluZyBkb2N1bWVudHMgKHRoZSBkZWZhdWx0KS5cbiAgICogQHJldHVybiB7UHJvbWlzZX1cbiAgICovXG4gICd1cHNlcnQnLFxuXTtcblxuZXhwb3J0IGNvbnN0IEFTWU5DX0NVUlNPUl9NRVRIT0RTID0gW1xuICAvKipcbiAgICogQGRlcHJlY2F0ZWQgaW4gMi45XG4gICAqIEBzdW1tYXJ5IFJldHVybnMgdGhlIG51bWJlciBvZiBkb2N1bWVudHMgdGhhdCBtYXRjaCBhIHF1ZXJ5LiBUaGlzIG1ldGhvZCBpc1xuICAgKiAgICAgICAgICBbZGVwcmVjYXRlZCBzaW5jZSBNb25nb0RCIDQuMF0oaHR0cHM6Ly93d3cubW9uZ29kYi5jb20vZG9jcy92NC40L3JlZmVyZW5jZS9jb21tYW5kL2NvdW50Lyk7XG4gICAqICAgICAgICAgIHNlZSBgQ29sbGVjdGlvbi5jb3VudERvY3VtZW50c2AgYW5kXG4gICAqICAgICAgICAgIGBDb2xsZWN0aW9uLmVzdGltYXRlZERvY3VtZW50Q291bnRgIGZvciBhIHJlcGxhY2VtZW50LlxuICAgKiBAbWVtYmVyT2YgTW9uZ28uQ3Vyc29yXG4gICAqIEBtZXRob2QgIGNvdW50QXN5bmNcbiAgICogQGluc3RhbmNlXG4gICAqIEBsb2N1cyBBbnl3aGVyZVxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAgICovXG4gICdjb3VudCcsXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBSZXR1cm4gYWxsIG1hdGNoaW5nIGRvY3VtZW50cyBhcyBhbiBBcnJheS5cbiAgICogQG1lbWJlck9mIE1vbmdvLkN1cnNvclxuICAgKiBAbWV0aG9kICBmZXRjaEFzeW5jXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQHJldHVybnMge1Byb21pc2V9XG4gICAqL1xuICAnZmV0Y2gnLFxuICAvKipcbiAgICogQHN1bW1hcnkgQ2FsbCBgY2FsbGJhY2tgIG9uY2UgZm9yIGVhY2ggbWF0Y2hpbmcgZG9jdW1lbnQsIHNlcXVlbnRpYWxseSBhbmRcbiAgICogICAgICAgICAgc3luY2hyb25vdXNseS5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBtZXRob2QgIGZvckVhY2hBc3luY1xuICAgKiBAaW5zdGFuY2VcbiAgICogQG1lbWJlck9mIE1vbmdvLkN1cnNvclxuICAgKiBAcGFyYW0ge0l0ZXJhdGlvbkNhbGxiYWNrfSBjYWxsYmFjayBGdW5jdGlvbiB0byBjYWxsLiBJdCB3aWxsIGJlIGNhbGxlZFxuICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aXRoIHRocmVlIGFyZ3VtZW50czogdGhlIGRvY3VtZW50LCBhXG4gICAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDAtYmFzZWQgaW5kZXgsIGFuZCA8ZW0+Y3Vyc29yPC9lbT5cbiAgICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXRzZWxmLlxuICAgKiBAcGFyYW0ge0FueX0gW3RoaXNBcmddIEFuIG9iamVjdCB3aGljaCB3aWxsIGJlIHRoZSB2YWx1ZSBvZiBgdGhpc2AgaW5zaWRlXG4gICAqICAgICAgICAgICAgICAgICAgICAgICAgYGNhbGxiYWNrYC5cbiAgICogQHJldHVybnMge1Byb21pc2V9XG4gICAqL1xuICAnZm9yRWFjaCcsXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBNYXAgY2FsbGJhY2sgb3ZlciBhbGwgbWF0Y2hpbmcgZG9jdW1lbnRzLiAgUmV0dXJucyBhbiBBcnJheS5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBtZXRob2QgbWFwQXN5bmNcbiAgICogQGluc3RhbmNlXG4gICAqIEBtZW1iZXJPZiBNb25nby5DdXJzb3JcbiAgICogQHBhcmFtIHtJdGVyYXRpb25DYWxsYmFja30gY2FsbGJhY2sgRnVuY3Rpb24gdG8gY2FsbC4gSXQgd2lsbCBiZSBjYWxsZWRcbiAgICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2l0aCB0aHJlZSBhcmd1bWVudHM6IHRoZSBkb2N1bWVudCwgYVxuICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwLWJhc2VkIGluZGV4LCBhbmQgPGVtPmN1cnNvcjwvZW0+XG4gICAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGl0c2VsZi5cbiAgICogQHBhcmFtIHtBbnl9IFt0aGlzQXJnXSBBbiBvYmplY3Qgd2hpY2ggd2lsbCBiZSB0aGUgdmFsdWUgb2YgYHRoaXNgIGluc2lkZVxuICAgKiAgICAgICAgICAgICAgICAgICAgICAgIGBjYWxsYmFja2AuXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfVxuICAgKi9cbiAgJ21hcCcsXG5dO1xuXG5leHBvcnQgY29uc3QgQ0xJRU5UX09OTFlfTUVUSE9EUyA9IFtcImZpbmRPbmVcIiwgXCJpbnNlcnRcIiwgXCJyZW1vdmVcIiwgXCJ1cGRhdGVcIiwgXCJ1cHNlcnRcIl07XG4iLCJpbXBvcnQgTG9jYWxDb2xsZWN0aW9uIGZyb20gJy4vbG9jYWxfY29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBoYXNPd24gfSBmcm9tICcuL2NvbW1vbi5qcyc7XG5pbXBvcnQgeyBBU1lOQ19DVVJTT1JfTUVUSE9EUywgZ2V0QXN5bmNNZXRob2ROYW1lIH0gZnJvbSAnLi9jb25zdGFudHMnO1xuXG4vLyBDdXJzb3I6IGEgc3BlY2lmaWNhdGlvbiBmb3IgYSBwYXJ0aWN1bGFyIHN1YnNldCBvZiBkb2N1bWVudHMsIHcvIGEgZGVmaW5lZFxuLy8gb3JkZXIsIGxpbWl0LCBhbmQgb2Zmc2V0LiAgY3JlYXRpbmcgYSBDdXJzb3Igd2l0aCBMb2NhbENvbGxlY3Rpb24uZmluZCgpLFxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgQ3Vyc29yIHtcbiAgLy8gZG9uJ3QgY2FsbCB0aGlzIGN0b3IgZGlyZWN0bHkuICB1c2UgTG9jYWxDb2xsZWN0aW9uLmZpbmQoKS5cbiAgY29uc3RydWN0b3IoY29sbGVjdGlvbiwgc2VsZWN0b3IsIG9wdGlvbnMgPSB7fSkge1xuICAgIHRoaXMuY29sbGVjdGlvbiA9IGNvbGxlY3Rpb247XG4gICAgdGhpcy5zb3J0ZXIgPSBudWxsO1xuICAgIHRoaXMubWF0Y2hlciA9IG5ldyBNaW5pbW9uZ28uTWF0Y2hlcihzZWxlY3Rvcik7XG5cbiAgICBpZiAoTG9jYWxDb2xsZWN0aW9uLl9zZWxlY3RvcklzSWRQZXJoYXBzQXNPYmplY3Qoc2VsZWN0b3IpKSB7XG4gICAgICAvLyBzdGFzaCBmb3IgZmFzdCBfaWQgYW5kIHsgX2lkIH1cbiAgICAgIHRoaXMuX3NlbGVjdG9ySWQgPSBoYXNPd24uY2FsbChzZWxlY3RvciwgJ19pZCcpID8gc2VsZWN0b3IuX2lkIDogc2VsZWN0b3I7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX3NlbGVjdG9ySWQgPSB1bmRlZmluZWQ7XG5cbiAgICAgIGlmICh0aGlzLm1hdGNoZXIuaGFzR2VvUXVlcnkoKSB8fCBvcHRpb25zLnNvcnQpIHtcbiAgICAgICAgdGhpcy5zb3J0ZXIgPSBuZXcgTWluaW1vbmdvLlNvcnRlcihvcHRpb25zLnNvcnQgfHwgW10pO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMuc2tpcCA9IG9wdGlvbnMuc2tpcCB8fCAwO1xuICAgIHRoaXMubGltaXQgPSBvcHRpb25zLmxpbWl0O1xuICAgIHRoaXMuZmllbGRzID0gb3B0aW9ucy5wcm9qZWN0aW9uIHx8IG9wdGlvbnMuZmllbGRzO1xuXG4gICAgdGhpcy5fcHJvamVjdGlvbkZuID0gTG9jYWxDb2xsZWN0aW9uLl9jb21waWxlUHJvamVjdGlvbih0aGlzLmZpZWxkcyB8fCB7fSk7XG5cbiAgICB0aGlzLl90cmFuc2Zvcm0gPSBMb2NhbENvbGxlY3Rpb24ud3JhcFRyYW5zZm9ybShvcHRpb25zLnRyYW5zZm9ybSk7XG5cbiAgICAvLyBieSBkZWZhdWx0LCBxdWVyaWVzIHJlZ2lzdGVyIHcvIFRyYWNrZXIgd2hlbiBpdCBpcyBhdmFpbGFibGUuXG4gICAgaWYgKHR5cGVvZiBUcmFja2VyICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhpcy5yZWFjdGl2ZSA9IG9wdGlvbnMucmVhY3RpdmUgPT09IHVuZGVmaW5lZCA/IHRydWUgOiBvcHRpb25zLnJlYWN0aXZlO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBAZGVwcmVjYXRlZCBpbiAyLjlcbiAgICogQHN1bW1hcnkgUmV0dXJucyB0aGUgbnVtYmVyIG9mIGRvY3VtZW50cyB0aGF0IG1hdGNoIGEgcXVlcnkuIFRoaXMgbWV0aG9kIGlzXG4gICAqICAgICAgICAgIFtkZXByZWNhdGVkIHNpbmNlIE1vbmdvREIgNC4wXShodHRwczovL3d3dy5tb25nb2RiLmNvbS9kb2NzL3Y0LjQvcmVmZXJlbmNlL2NvbW1hbmQvY291bnQvKTtcbiAgICogICAgICAgICAgc2VlIGBDb2xsZWN0aW9uLmNvdW50RG9jdW1lbnRzYCBhbmRcbiAgICogICAgICAgICAgYENvbGxlY3Rpb24uZXN0aW1hdGVkRG9jdW1lbnRDb3VudGAgZm9yIGEgcmVwbGFjZW1lbnQuXG4gICAqIEBtZW1iZXJPZiBNb25nby5DdXJzb3JcbiAgICogQG1ldGhvZCAgY291bnRcbiAgICogQGluc3RhbmNlXG4gICAqIEBsb2N1cyBBbnl3aGVyZVxuICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgKi9cbiAgY291bnQoKSB7XG4gICAgaWYgKHRoaXMucmVhY3RpdmUpIHtcbiAgICAgIC8vIGFsbG93IHRoZSBvYnNlcnZlIHRvIGJlIHVub3JkZXJlZFxuICAgICAgdGhpcy5fZGVwZW5kKHsgYWRkZWQ6IHRydWUsIHJlbW92ZWQ6IHRydWUgfSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuX2dldFJhd09iamVjdHMoe1xuICAgICAgb3JkZXJlZDogdHJ1ZSxcbiAgICB9KS5sZW5ndGg7XG4gIH1cblxuICAvKipcbiAgICogQHN1bW1hcnkgUmV0dXJuIGFsbCBtYXRjaGluZyBkb2N1bWVudHMgYXMgYW4gQXJyYXkuXG4gICAqIEBtZW1iZXJPZiBNb25nby5DdXJzb3JcbiAgICogQG1ldGhvZCAgZmV0Y2hcbiAgICogQGluc3RhbmNlXG4gICAqIEBsb2N1cyBBbnl3aGVyZVxuICAgKiBAcmV0dXJucyB7T2JqZWN0W119XG4gICAqL1xuICBmZXRjaCgpIHtcbiAgICBjb25zdCByZXN1bHQgPSBbXTtcblxuICAgIHRoaXMuZm9yRWFjaChkb2MgPT4ge1xuICAgICAgcmVzdWx0LnB1c2goZG9jKTtcbiAgICB9KTtcblxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBbU3ltYm9sLml0ZXJhdG9yXSgpIHtcbiAgICBpZiAodGhpcy5yZWFjdGl2ZSkge1xuICAgICAgdGhpcy5fZGVwZW5kKHtcbiAgICAgICAgYWRkZWRCZWZvcmU6IHRydWUsXG4gICAgICAgIHJlbW92ZWQ6IHRydWUsXG4gICAgICAgIGNoYW5nZWQ6IHRydWUsXG4gICAgICAgIG1vdmVkQmVmb3JlOiB0cnVlLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgbGV0IGluZGV4ID0gMDtcbiAgICBjb25zdCBvYmplY3RzID0gdGhpcy5fZ2V0UmF3T2JqZWN0cyh7IG9yZGVyZWQ6IHRydWUgfSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgbmV4dDogKCkgPT4ge1xuICAgICAgICBpZiAoaW5kZXggPCBvYmplY3RzLmxlbmd0aCkge1xuICAgICAgICAgIC8vIFRoaXMgZG91YmxlcyBhcyBhIGNsb25lIG9wZXJhdGlvbi5cbiAgICAgICAgICBsZXQgZWxlbWVudCA9IHRoaXMuX3Byb2plY3Rpb25GbihvYmplY3RzW2luZGV4KytdKTtcblxuICAgICAgICAgIGlmICh0aGlzLl90cmFuc2Zvcm0pIGVsZW1lbnQgPSB0aGlzLl90cmFuc2Zvcm0oZWxlbWVudCk7XG5cbiAgICAgICAgICByZXR1cm4geyB2YWx1ZTogZWxlbWVudCB9O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHsgZG9uZTogdHJ1ZSB9O1xuICAgICAgfSxcbiAgICB9O1xuICB9XG5cbiAgW1N5bWJvbC5hc3luY0l0ZXJhdG9yXSgpIHtcbiAgICBjb25zdCBzeW5jUmVzdWx0ID0gdGhpc1tTeW1ib2wuaXRlcmF0b3JdKCk7XG4gICAgcmV0dXJuIHtcbiAgICAgIGFzeW5jIG5leHQoKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoc3luY1Jlc3VsdC5uZXh0KCkpO1xuICAgICAgfSxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEBjYWxsYmFjayBJdGVyYXRpb25DYWxsYmFja1xuICAgKiBAcGFyYW0ge09iamVjdH0gZG9jXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBpbmRleFxuICAgKi9cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IENhbGwgYGNhbGxiYWNrYCBvbmNlIGZvciBlYWNoIG1hdGNoaW5nIGRvY3VtZW50LCBzZXF1ZW50aWFsbHkgYW5kXG4gICAqICAgICAgICAgIHN5bmNocm9ub3VzbHkuXG4gICAqIEBsb2N1cyBBbnl3aGVyZVxuICAgKiBAbWV0aG9kICBmb3JFYWNoXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAbWVtYmVyT2YgTW9uZ28uQ3Vyc29yXG4gICAqIEBwYXJhbSB7SXRlcmF0aW9uQ2FsbGJhY2t9IGNhbGxiYWNrIEZ1bmN0aW9uIHRvIGNhbGwuIEl0IHdpbGwgYmUgY2FsbGVkXG4gICAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdpdGggdGhyZWUgYXJndW1lbnRzOiB0aGUgZG9jdW1lbnQsIGFcbiAgICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMC1iYXNlZCBpbmRleCwgYW5kIDxlbT5jdXJzb3I8L2VtPlxuICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdHNlbGYuXG4gICAqIEBwYXJhbSB7QW55fSBbdGhpc0FyZ10gQW4gb2JqZWN0IHdoaWNoIHdpbGwgYmUgdGhlIHZhbHVlIG9mIGB0aGlzYCBpbnNpZGVcbiAgICogICAgICAgICAgICAgICAgICAgICAgICBgY2FsbGJhY2tgLlxuICAgKi9cbiAgZm9yRWFjaChjYWxsYmFjaywgdGhpc0FyZykge1xuICAgIGlmICh0aGlzLnJlYWN0aXZlKSB7XG4gICAgICB0aGlzLl9kZXBlbmQoe1xuICAgICAgICBhZGRlZEJlZm9yZTogdHJ1ZSxcbiAgICAgICAgcmVtb3ZlZDogdHJ1ZSxcbiAgICAgICAgY2hhbmdlZDogdHJ1ZSxcbiAgICAgICAgbW92ZWRCZWZvcmU6IHRydWUsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICB0aGlzLl9nZXRSYXdPYmplY3RzKHsgb3JkZXJlZDogdHJ1ZSB9KS5mb3JFYWNoKChlbGVtZW50LCBpKSA9PiB7XG4gICAgICAvLyBUaGlzIGRvdWJsZXMgYXMgYSBjbG9uZSBvcGVyYXRpb24uXG4gICAgICBlbGVtZW50ID0gdGhpcy5fcHJvamVjdGlvbkZuKGVsZW1lbnQpO1xuXG4gICAgICBpZiAodGhpcy5fdHJhbnNmb3JtKSB7XG4gICAgICAgIGVsZW1lbnQgPSB0aGlzLl90cmFuc2Zvcm0oZWxlbWVudCk7XG4gICAgICB9XG5cbiAgICAgIGNhbGxiYWNrLmNhbGwodGhpc0FyZywgZWxlbWVudCwgaSwgdGhpcyk7XG4gICAgfSk7XG4gIH1cblxuICBnZXRUcmFuc2Zvcm0oKSB7XG4gICAgcmV0dXJuIHRoaXMuX3RyYW5zZm9ybTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBNYXAgY2FsbGJhY2sgb3ZlciBhbGwgbWF0Y2hpbmcgZG9jdW1lbnRzLiAgUmV0dXJucyBhbiBBcnJheS5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBtZXRob2QgbWFwXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAbWVtYmVyT2YgTW9uZ28uQ3Vyc29yXG4gICAqIEBwYXJhbSB7SXRlcmF0aW9uQ2FsbGJhY2t9IGNhbGxiYWNrIEZ1bmN0aW9uIHRvIGNhbGwuIEl0IHdpbGwgYmUgY2FsbGVkXG4gICAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdpdGggdGhyZWUgYXJndW1lbnRzOiB0aGUgZG9jdW1lbnQsIGFcbiAgICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMC1iYXNlZCBpbmRleCwgYW5kIDxlbT5jdXJzb3I8L2VtPlxuICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdHNlbGYuXG4gICAqIEBwYXJhbSB7QW55fSBbdGhpc0FyZ10gQW4gb2JqZWN0IHdoaWNoIHdpbGwgYmUgdGhlIHZhbHVlIG9mIGB0aGlzYCBpbnNpZGVcbiAgICogICAgICAgICAgICAgICAgICAgICAgICBgY2FsbGJhY2tgLlxuICAgKi9cbiAgbWFwKGNhbGxiYWNrLCB0aGlzQXJnKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gW107XG5cbiAgICB0aGlzLmZvckVhY2goKGRvYywgaSkgPT4ge1xuICAgICAgcmVzdWx0LnB1c2goY2FsbGJhY2suY2FsbCh0aGlzQXJnLCBkb2MsIGksIHRoaXMpKTtcbiAgICB9KTtcblxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBvcHRpb25zIHRvIGNvbnRhaW46XG4gIC8vICAqIGNhbGxiYWNrcyBmb3Igb2JzZXJ2ZSgpOlxuICAvLyAgICAtIGFkZGVkQXQgKGRvY3VtZW50LCBhdEluZGV4KVxuICAvLyAgICAtIGFkZGVkIChkb2N1bWVudClcbiAgLy8gICAgLSBjaGFuZ2VkQXQgKG5ld0RvY3VtZW50LCBvbGREb2N1bWVudCwgYXRJbmRleClcbiAgLy8gICAgLSBjaGFuZ2VkIChuZXdEb2N1bWVudCwgb2xkRG9jdW1lbnQpXG4gIC8vICAgIC0gcmVtb3ZlZEF0IChkb2N1bWVudCwgYXRJbmRleClcbiAgLy8gICAgLSByZW1vdmVkIChkb2N1bWVudClcbiAgLy8gICAgLSBtb3ZlZFRvIChkb2N1bWVudCwgb2xkSW5kZXgsIG5ld0luZGV4KVxuICAvL1xuICAvLyBhdHRyaWJ1dGVzIGF2YWlsYWJsZSBvbiByZXR1cm5lZCBxdWVyeSBoYW5kbGU6XG4gIC8vICAqIHN0b3AoKTogZW5kIHVwZGF0ZXNcbiAgLy8gICogY29sbGVjdGlvbjogdGhlIGNvbGxlY3Rpb24gdGhpcyBxdWVyeSBpcyBxdWVyeWluZ1xuICAvL1xuICAvLyBpZmYgeCBpcyBhIHJldHVybmVkIHF1ZXJ5IGhhbmRsZSwgKHggaW5zdGFuY2VvZlxuICAvLyBMb2NhbENvbGxlY3Rpb24uT2JzZXJ2ZUhhbmRsZSkgaXMgdHJ1ZVxuICAvL1xuICAvLyBpbml0aWFsIHJlc3VsdHMgZGVsaXZlcmVkIHRocm91Z2ggYWRkZWQgY2FsbGJhY2tcbiAgLy8gWFhYIG1heWJlIGNhbGxiYWNrcyBzaG91bGQgdGFrZSBhIGxpc3Qgb2Ygb2JqZWN0cywgdG8gZXhwb3NlIHRyYW5zYWN0aW9ucz9cbiAgLy8gWFhYIG1heWJlIHN1cHBvcnQgZmllbGQgbGltaXRpbmcgKHRvIGxpbWl0IHdoYXQgeW91J3JlIG5vdGlmaWVkIG9uKVxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBXYXRjaCBhIHF1ZXJ5LiAgUmVjZWl2ZSBjYWxsYmFja3MgYXMgdGhlIHJlc3VsdCBzZXQgY2hhbmdlcy5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBtZW1iZXJPZiBNb25nby5DdXJzb3JcbiAgICogQGluc3RhbmNlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBjYWxsYmFja3MgRnVuY3Rpb25zIHRvIGNhbGwgdG8gZGVsaXZlciB0aGUgcmVzdWx0IHNldCBhcyBpdFxuICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgIGNoYW5nZXNcbiAgICovXG4gIG9ic2VydmUob3B0aW9ucykge1xuICAgIHJldHVybiBMb2NhbENvbGxlY3Rpb24uX29ic2VydmVGcm9tT2JzZXJ2ZUNoYW5nZXModGhpcywgb3B0aW9ucyk7XG4gIH1cblxuICAvKipcbiAgICogQHN1bW1hcnkgV2F0Y2ggYSBxdWVyeS4gIFJlY2VpdmUgY2FsbGJhY2tzIGFzIHRoZSByZXN1bHQgc2V0IGNoYW5nZXMuXG4gICAqIEBsb2N1cyBBbnl3aGVyZVxuICAgKiBAbWVtYmVyT2YgTW9uZ28uQ3Vyc29yXG4gICAqIEBpbnN0YW5jZVxuICAgKi9cbiAgb2JzZXJ2ZUFzeW5jKG9wdGlvbnMpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiByZXNvbHZlKHRoaXMub2JzZXJ2ZShvcHRpb25zKSkpO1xuICB9XG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IFdhdGNoIGEgcXVlcnkuIFJlY2VpdmUgY2FsbGJhY2tzIGFzIHRoZSByZXN1bHQgc2V0IGNoYW5nZXMuIE9ubHlcbiAgICogICAgICAgICAgdGhlIGRpZmZlcmVuY2VzIGJldHdlZW4gdGhlIG9sZCBhbmQgbmV3IGRvY3VtZW50cyBhcmUgcGFzc2VkIHRvXG4gICAqICAgICAgICAgIHRoZSBjYWxsYmFja3MuXG4gICAqIEBsb2N1cyBBbnl3aGVyZVxuICAgKiBAbWVtYmVyT2YgTW9uZ28uQ3Vyc29yXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge09iamVjdH0gY2FsbGJhY2tzIEZ1bmN0aW9ucyB0byBjYWxsIHRvIGRlbGl2ZXIgdGhlIHJlc3VsdCBzZXQgYXMgaXRcbiAgICogICAgICAgICAgICAgICAgICAgICAgICAgICBjaGFuZ2VzXG4gICAqL1xuICBvYnNlcnZlQ2hhbmdlcyhvcHRpb25zKSB7XG4gICAgY29uc3Qgb3JkZXJlZCA9IExvY2FsQ29sbGVjdGlvbi5fb2JzZXJ2ZUNoYW5nZXNDYWxsYmFja3NBcmVPcmRlcmVkKG9wdGlvbnMpO1xuXG4gICAgLy8gdGhlcmUgYXJlIHNldmVyYWwgcGxhY2VzIHRoYXQgYXNzdW1lIHlvdSBhcmVuJ3QgY29tYmluaW5nIHNraXAvbGltaXQgd2l0aFxuICAgIC8vIHVub3JkZXJlZCBvYnNlcnZlLiAgZWcsIHVwZGF0ZSdzIEVKU09OLmNsb25lLCBhbmQgdGhlIFwidGhlcmUgYXJlIHNldmVyYWxcIlxuICAgIC8vIGNvbW1lbnQgaW4gX21vZGlmeUFuZE5vdGlmeVxuICAgIC8vIFhYWCBhbGxvdyBza2lwL2xpbWl0IHdpdGggdW5vcmRlcmVkIG9ic2VydmVcbiAgICBpZiAoIW9wdGlvbnMuX2FsbG93X3Vub3JkZXJlZCAmJiAhb3JkZXJlZCAmJiAodGhpcy5za2lwIHx8IHRoaXMubGltaXQpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIFwiTXVzdCB1c2UgYW4gb3JkZXJlZCBvYnNlcnZlIHdpdGggc2tpcCBvciBsaW1pdCAoaS5lLiAnYWRkZWRCZWZvcmUnIFwiICtcbiAgICAgICAgICBcImZvciBvYnNlcnZlQ2hhbmdlcyBvciAnYWRkZWRBdCcgZm9yIG9ic2VydmUsIGluc3RlYWQgb2YgJ2FkZGVkJykuXCJcbiAgICAgICk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuZmllbGRzICYmICh0aGlzLmZpZWxkcy5faWQgPT09IDAgfHwgdGhpcy5maWVsZHMuX2lkID09PSBmYWxzZSkpIHtcbiAgICAgIHRocm93IEVycm9yKFwiWW91IG1heSBub3Qgb2JzZXJ2ZSBhIGN1cnNvciB3aXRoIHtmaWVsZHM6IHtfaWQ6IDB9fVwiKTtcbiAgICB9XG5cbiAgICBjb25zdCBkaXN0YW5jZXMgPVxuICAgICAgdGhpcy5tYXRjaGVyLmhhc0dlb1F1ZXJ5KCkgJiYgb3JkZXJlZCAmJiBuZXcgTG9jYWxDb2xsZWN0aW9uLl9JZE1hcCgpO1xuXG4gICAgY29uc3QgcXVlcnkgPSB7XG4gICAgICBjdXJzb3I6IHRoaXMsXG4gICAgICBkaXJ0eTogZmFsc2UsXG4gICAgICBkaXN0YW5jZXMsXG4gICAgICBtYXRjaGVyOiB0aGlzLm1hdGNoZXIsIC8vIG5vdCBmYXN0IHBhdGhlZFxuICAgICAgb3JkZXJlZCxcbiAgICAgIHByb2plY3Rpb25GbjogdGhpcy5fcHJvamVjdGlvbkZuLFxuICAgICAgcmVzdWx0c1NuYXBzaG90OiBudWxsLFxuICAgICAgc29ydGVyOiBvcmRlcmVkICYmIHRoaXMuc29ydGVyLFxuICAgIH07XG5cbiAgICBsZXQgcWlkO1xuXG4gICAgLy8gTm9uLXJlYWN0aXZlIHF1ZXJpZXMgY2FsbCBhZGRlZFtCZWZvcmVdIGFuZCB0aGVuIG5ldmVyIGNhbGwgYW55dGhpbmdcbiAgICAvLyBlbHNlLlxuICAgIGlmICh0aGlzLnJlYWN0aXZlKSB7XG4gICAgICBxaWQgPSB0aGlzLmNvbGxlY3Rpb24ubmV4dF9xaWQrKztcbiAgICAgIHRoaXMuY29sbGVjdGlvbi5xdWVyaWVzW3FpZF0gPSBxdWVyeTtcbiAgICB9XG5cbiAgICBxdWVyeS5yZXN1bHRzID0gdGhpcy5fZ2V0UmF3T2JqZWN0cyh7XG4gICAgICBvcmRlcmVkLFxuICAgICAgZGlzdGFuY2VzOiBxdWVyeS5kaXN0YW5jZXMsXG4gICAgfSk7XG5cbiAgICBpZiAodGhpcy5jb2xsZWN0aW9uLnBhdXNlZCkge1xuICAgICAgcXVlcnkucmVzdWx0c1NuYXBzaG90ID0gb3JkZXJlZCA/IFtdIDogbmV3IExvY2FsQ29sbGVjdGlvbi5fSWRNYXAoKTtcbiAgICB9XG5cbiAgICAvLyB3cmFwIGNhbGxiYWNrcyB3ZSB3ZXJlIHBhc3NlZC4gY2FsbGJhY2tzIG9ubHkgZmlyZSB3aGVuIG5vdCBwYXVzZWQgYW5kXG4gICAgLy8gYXJlIG5ldmVyIHVuZGVmaW5lZFxuICAgIC8vIEZpbHRlcnMgb3V0IGJsYWNrbGlzdGVkIGZpZWxkcyBhY2NvcmRpbmcgdG8gY3Vyc29yJ3MgcHJvamVjdGlvbi5cbiAgICAvLyBYWFggd3JvbmcgcGxhY2UgZm9yIHRoaXM/XG5cbiAgICAvLyBmdXJ0aGVybW9yZSwgY2FsbGJhY2tzIGVucXVldWUgdW50aWwgdGhlIG9wZXJhdGlvbiB3ZSdyZSB3b3JraW5nIG9uIGlzXG4gICAgLy8gZG9uZS5cbiAgICBjb25zdCB3cmFwQ2FsbGJhY2sgPSAoZm4pID0+IHtcbiAgICAgIGlmICghZm4pIHtcbiAgICAgICAgcmV0dXJuICgpID0+IHt9O1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzZWxmID0gdGhpcztcblxuICAgICAgcmV0dXJuIGZ1bmN0aW9uICgvKiBhcmdzKi8pIHtcbiAgICAgICAgaWYgKHNlbGYuY29sbGVjdGlvbi5wYXVzZWQpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBhcmdzID0gYXJndW1lbnRzO1xuXG4gICAgICAgIHNlbGYuY29sbGVjdGlvbi5fb2JzZXJ2ZVF1ZXVlLnF1ZXVlVGFzaygoKSA9PiB7XG4gICAgICAgICAgZm4uYXBwbHkodGhpcywgYXJncyk7XG4gICAgICAgIH0pO1xuICAgICAgfTtcbiAgICB9O1xuXG4gICAgcXVlcnkuYWRkZWQgPSB3cmFwQ2FsbGJhY2sob3B0aW9ucy5hZGRlZCk7XG4gICAgcXVlcnkuY2hhbmdlZCA9IHdyYXBDYWxsYmFjayhvcHRpb25zLmNoYW5nZWQpO1xuICAgIHF1ZXJ5LnJlbW92ZWQgPSB3cmFwQ2FsbGJhY2sob3B0aW9ucy5yZW1vdmVkKTtcblxuICAgIGlmIChvcmRlcmVkKSB7XG4gICAgICBxdWVyeS5hZGRlZEJlZm9yZSA9IHdyYXBDYWxsYmFjayhvcHRpb25zLmFkZGVkQmVmb3JlKTtcbiAgICAgIHF1ZXJ5Lm1vdmVkQmVmb3JlID0gd3JhcENhbGxiYWNrKG9wdGlvbnMubW92ZWRCZWZvcmUpO1xuICAgIH1cblxuICAgIGlmICghb3B0aW9ucy5fc3VwcHJlc3NfaW5pdGlhbCAmJiAhdGhpcy5jb2xsZWN0aW9uLnBhdXNlZCkge1xuICAgICAgY29uc3QgaGFuZGxlciA9IChkb2MpID0+IHtcbiAgICAgICAgY29uc3QgZmllbGRzID0gRUpTT04uY2xvbmUoZG9jKTtcblxuICAgICAgICBkZWxldGUgZmllbGRzLl9pZDtcblxuICAgICAgICBpZiAob3JkZXJlZCkge1xuICAgICAgICAgIHF1ZXJ5LmFkZGVkQmVmb3JlKGRvYy5faWQsIHRoaXMuX3Byb2plY3Rpb25GbihmaWVsZHMpLCBudWxsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHF1ZXJ5LmFkZGVkKGRvYy5faWQsIHRoaXMuX3Byb2plY3Rpb25GbihmaWVsZHMpKTtcbiAgICAgIH07XG4gICAgICAvLyBpdCBtZWFucyBpdCdzIGp1c3QgYW4gYXJyYXlcbiAgICAgIGlmIChxdWVyeS5yZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICBmb3IgKGNvbnN0IGRvYyBvZiBxdWVyeS5yZXN1bHRzKSB7XG4gICAgICAgICAgaGFuZGxlcihkb2MpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBpdCBtZWFucyBpdCdzIGFuIGlkIG1hcFxuICAgICAgaWYgKHF1ZXJ5LnJlc3VsdHM/LnNpemU/LigpKSB7XG4gICAgICAgIHF1ZXJ5LnJlc3VsdHMuZm9yRWFjaChoYW5kbGVyKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBoYW5kbGUgPSBPYmplY3QuYXNzaWduKG5ldyBMb2NhbENvbGxlY3Rpb24uT2JzZXJ2ZUhhbmRsZSgpLCB7XG4gICAgICBjb2xsZWN0aW9uOiB0aGlzLmNvbGxlY3Rpb24sXG4gICAgICBzdG9wOiAoKSA9PiB7XG4gICAgICAgIGlmICh0aGlzLnJlYWN0aXZlKSB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuY29sbGVjdGlvbi5xdWVyaWVzW3FpZF07XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBpc1JlYWR5OiBmYWxzZSxcbiAgICAgIGlzUmVhZHlQcm9taXNlOiBudWxsLFxuICAgIH0pO1xuXG4gICAgaWYgKHRoaXMucmVhY3RpdmUgJiYgVHJhY2tlci5hY3RpdmUpIHtcbiAgICAgIC8vIFhYWCBpbiBtYW55IGNhc2VzLCB0aGUgc2FtZSBvYnNlcnZlIHdpbGwgYmUgcmVjcmVhdGVkIHdoZW5cbiAgICAgIC8vIHRoZSBjdXJyZW50IGF1dG9ydW4gaXMgcmVydW4uICB3ZSBjb3VsZCBzYXZlIHdvcmsgYnlcbiAgICAgIC8vIGxldHRpbmcgaXQgbGluZ2VyIGFjcm9zcyByZXJ1biBhbmQgcG90ZW50aWFsbHkgZ2V0XG4gICAgICAvLyByZXB1cnBvc2VkIGlmIHRoZSBzYW1lIG9ic2VydmUgaXMgcGVyZm9ybWVkLCB1c2luZyBsb2dpY1xuICAgICAgLy8gc2ltaWxhciB0byB0aGF0IG9mIE1ldGVvci5zdWJzY3JpYmUuXG4gICAgICBUcmFja2VyLm9uSW52YWxpZGF0ZSgoKSA9PiB7XG4gICAgICAgIGhhbmRsZS5zdG9wKCk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBydW4gdGhlIG9ic2VydmUgY2FsbGJhY2tzIHJlc3VsdGluZyBmcm9tIHRoZSBpbml0aWFsIGNvbnRlbnRzXG4gICAgLy8gYmVmb3JlIHdlIGxlYXZlIHRoZSBvYnNlcnZlLlxuICAgIGNvbnN0IGRyYWluUmVzdWx0ID0gdGhpcy5jb2xsZWN0aW9uLl9vYnNlcnZlUXVldWUuZHJhaW4oKTtcblxuICAgIGlmIChkcmFpblJlc3VsdCBpbnN0YW5jZW9mIFByb21pc2UpIHtcbiAgICAgIGhhbmRsZS5pc1JlYWR5UHJvbWlzZSA9IGRyYWluUmVzdWx0O1xuICAgICAgZHJhaW5SZXN1bHQudGhlbigoKSA9PiAoaGFuZGxlLmlzUmVhZHkgPSB0cnVlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGhhbmRsZS5pc1JlYWR5ID0gdHJ1ZTtcbiAgICAgIGhhbmRsZS5pc1JlYWR5UHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cblxuICAgIHJldHVybiBoYW5kbGU7XG4gIH1cblxuICAvKipcbiAgICogQHN1bW1hcnkgV2F0Y2ggYSBxdWVyeS4gUmVjZWl2ZSBjYWxsYmFja3MgYXMgdGhlIHJlc3VsdCBzZXQgY2hhbmdlcy4gT25seVxuICAgKiAgICAgICAgICB0aGUgZGlmZmVyZW5jZXMgYmV0d2VlbiB0aGUgb2xkIGFuZCBuZXcgZG9jdW1lbnRzIGFyZSBwYXNzZWQgdG9cbiAgICogICAgICAgICAgdGhlIGNhbGxiYWNrcy5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBtZW1iZXJPZiBNb25nby5DdXJzb3JcbiAgICogQGluc3RhbmNlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBjYWxsYmFja3MgRnVuY3Rpb25zIHRvIGNhbGwgdG8gZGVsaXZlciB0aGUgcmVzdWx0IHNldCBhcyBpdFxuICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgIGNoYW5nZXNcbiAgICovXG4gIG9ic2VydmVDaGFuZ2VzQXN5bmMob3B0aW9ucykge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgY29uc3QgaGFuZGxlID0gdGhpcy5vYnNlcnZlQ2hhbmdlcyhvcHRpb25zKTtcbiAgICAgIGhhbmRsZS5pc1JlYWR5UHJvbWlzZS50aGVuKCgpID0+IHJlc29sdmUoaGFuZGxlKSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBYWFggTWF5YmUgd2UgbmVlZCBhIHZlcnNpb24gb2Ygb2JzZXJ2ZSB0aGF0IGp1c3QgY2FsbHMgYSBjYWxsYmFjayBpZlxuICAvLyBhbnl0aGluZyBjaGFuZ2VkLlxuICBfZGVwZW5kKGNoYW5nZXJzLCBfYWxsb3dfdW5vcmRlcmVkKSB7XG4gICAgaWYgKFRyYWNrZXIuYWN0aXZlKSB7XG4gICAgICBjb25zdCBkZXBlbmRlbmN5ID0gbmV3IFRyYWNrZXIuRGVwZW5kZW5jeSgpO1xuICAgICAgY29uc3Qgbm90aWZ5ID0gZGVwZW5kZW5jeS5jaGFuZ2VkLmJpbmQoZGVwZW5kZW5jeSk7XG5cbiAgICAgIGRlcGVuZGVuY3kuZGVwZW5kKCk7XG5cbiAgICAgIGNvbnN0IG9wdGlvbnMgPSB7IF9hbGxvd191bm9yZGVyZWQsIF9zdXBwcmVzc19pbml0aWFsOiB0cnVlIH07XG5cbiAgICAgIFsnYWRkZWQnLCAnYWRkZWRCZWZvcmUnLCAnY2hhbmdlZCcsICdtb3ZlZEJlZm9yZScsICdyZW1vdmVkJ10uZm9yRWFjaChcbiAgICAgICAgZm4gPT4ge1xuICAgICAgICAgIGlmIChjaGFuZ2Vyc1tmbl0pIHtcbiAgICAgICAgICAgIG9wdGlvbnNbZm5dID0gbm90aWZ5O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgKTtcblxuICAgICAgLy8gb2JzZXJ2ZUNoYW5nZXMgd2lsbCBzdG9wKCkgd2hlbiB0aGlzIGNvbXB1dGF0aW9uIGlzIGludmFsaWRhdGVkXG4gICAgICB0aGlzLm9ic2VydmVDaGFuZ2VzKG9wdGlvbnMpO1xuICAgIH1cbiAgfVxuXG4gIF9nZXRDb2xsZWN0aW9uTmFtZSgpIHtcbiAgICByZXR1cm4gdGhpcy5jb2xsZWN0aW9uLm5hbWU7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgY29sbGVjdGlvbiBvZiBtYXRjaGluZyBvYmplY3RzLCBidXQgZG9lc24ndCBkZWVwIGNvcHkgdGhlbS5cbiAgLy9cbiAgLy8gSWYgb3JkZXJlZCBpcyBzZXQsIHJldHVybnMgYSBzb3J0ZWQgYXJyYXksIHJlc3BlY3Rpbmcgc29ydGVyLCBza2lwLCBhbmRcbiAgLy8gbGltaXQgcHJvcGVydGllcyBvZiB0aGUgcXVlcnkgcHJvdmlkZWQgdGhhdCBvcHRpb25zLmFwcGx5U2tpcExpbWl0IGlzXG4gIC8vIG5vdCBzZXQgdG8gZmFsc2UgKCMxMjAxKS4gSWYgc29ydGVyIGlzIGZhbHNleSwgbm8gc29ydCAtLSB5b3UgZ2V0IHRoZVxuICAvLyBuYXR1cmFsIG9yZGVyLlxuICAvL1xuICAvLyBJZiBvcmRlcmVkIGlzIG5vdCBzZXQsIHJldHVybnMgYW4gb2JqZWN0IG1hcHBpbmcgZnJvbSBJRCB0byBkb2MgKHNvcnRlcixcbiAgLy8gc2tpcCBhbmQgbGltaXQgc2hvdWxkIG5vdCBiZSBzZXQpLlxuICAvL1xuICAvLyBJZiBvcmRlcmVkIGlzIHNldCBhbmQgdGhpcyBjdXJzb3IgaXMgYSAkbmVhciBnZW9xdWVyeSwgdGhlbiB0aGlzIGZ1bmN0aW9uXG4gIC8vIHdpbGwgdXNlIGFuIF9JZE1hcCB0byB0cmFjayBlYWNoIGRpc3RhbmNlIGZyb20gdGhlICRuZWFyIGFyZ3VtZW50IHBvaW50IGluXG4gIC8vIG9yZGVyIHRvIHVzZSBpdCBhcyBhIHNvcnQga2V5LiBJZiBhbiBfSWRNYXAgaXMgcGFzc2VkIGluIHRoZSAnZGlzdGFuY2VzJ1xuICAvLyBhcmd1bWVudCwgdGhpcyBmdW5jdGlvbiB3aWxsIGNsZWFyIGl0IGFuZCB1c2UgaXQgZm9yIHRoaXMgcHVycG9zZVxuICAvLyAob3RoZXJ3aXNlIGl0IHdpbGwganVzdCBjcmVhdGUgaXRzIG93biBfSWRNYXApLiBUaGUgb2JzZXJ2ZUNoYW5nZXNcbiAgLy8gaW1wbGVtZW50YXRpb24gdXNlcyB0aGlzIHRvIHJlbWVtYmVyIHRoZSBkaXN0YW5jZXMgYWZ0ZXIgdGhpcyBmdW5jdGlvblxuICAvLyByZXR1cm5zLlxuICBfZ2V0UmF3T2JqZWN0cyhvcHRpb25zID0ge30pIHtcbiAgICAvLyBCeSBkZWZhdWx0IHRoaXMgbWV0aG9kIHdpbGwgcmVzcGVjdCBza2lwIGFuZCBsaW1pdCBiZWNhdXNlIC5mZXRjaCgpLFxuICAgIC8vIC5mb3JFYWNoKCkgZXRjLi4uIGV4cGVjdCB0aGlzIGJlaGF2aW91ci4gSXQgY2FuIGJlIGZvcmNlZCB0byBpZ25vcmVcbiAgICAvLyBza2lwIGFuZCBsaW1pdCBieSBzZXR0aW5nIGFwcGx5U2tpcExpbWl0IHRvIGZhbHNlICguY291bnQoKSBkb2VzIHRoaXMsXG4gICAgLy8gZm9yIGV4YW1wbGUpXG4gICAgY29uc3QgYXBwbHlTa2lwTGltaXQgPSBvcHRpb25zLmFwcGx5U2tpcExpbWl0ICE9PSBmYWxzZTtcblxuICAgIC8vIFhYWCB1c2UgT3JkZXJlZERpY3QgaW5zdGVhZCBvZiBhcnJheSwgYW5kIG1ha2UgSWRNYXAgYW5kIE9yZGVyZWREaWN0XG4gICAgLy8gY29tcGF0aWJsZVxuICAgIGNvbnN0IHJlc3VsdHMgPSBvcHRpb25zLm9yZGVyZWQgPyBbXSA6IG5ldyBMb2NhbENvbGxlY3Rpb24uX0lkTWFwKCk7XG5cbiAgICAvLyBmYXN0IHBhdGggZm9yIHNpbmdsZSBJRCB2YWx1ZVxuICAgIGlmICh0aGlzLl9zZWxlY3RvcklkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIC8vIElmIHlvdSBoYXZlIG5vbi16ZXJvIHNraXAgYW5kIGFzayBmb3IgYSBzaW5nbGUgaWQsIHlvdSBnZXQgbm90aGluZy5cbiAgICAgIC8vIFRoaXMgaXMgc28gaXQgbWF0Y2hlcyB0aGUgYmVoYXZpb3Igb2YgdGhlICd7X2lkOiBmb299JyBwYXRoLlxuICAgICAgaWYgKGFwcGx5U2tpcExpbWl0ICYmIHRoaXMuc2tpcCkge1xuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc2VsZWN0ZWREb2MgPSB0aGlzLmNvbGxlY3Rpb24uX2RvY3MuZ2V0KHRoaXMuX3NlbGVjdG9ySWQpO1xuICAgICAgaWYgKHNlbGVjdGVkRG9jKSB7XG4gICAgICAgIGlmIChvcHRpb25zLm9yZGVyZWQpIHtcbiAgICAgICAgICByZXN1bHRzLnB1c2goc2VsZWN0ZWREb2MpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlc3VsdHMuc2V0KHRoaXMuX3NlbGVjdG9ySWQsIHNlbGVjdGVkRG9jKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgfVxuXG4gICAgLy8gc2xvdyBwYXRoIGZvciBhcmJpdHJhcnkgc2VsZWN0b3IsIHNvcnQsIHNraXAsIGxpbWl0XG5cbiAgICAvLyBpbiB0aGUgb2JzZXJ2ZUNoYW5nZXMgY2FzZSwgZGlzdGFuY2VzIGlzIGFjdHVhbGx5IHBhcnQgb2YgdGhlIFwicXVlcnlcIlxuICAgIC8vIChpZSwgbGl2ZSByZXN1bHRzIHNldCkgb2JqZWN0LiAgaW4gb3RoZXIgY2FzZXMsIGRpc3RhbmNlcyBpcyBvbmx5IHVzZWRcbiAgICAvLyBpbnNpZGUgdGhpcyBmdW5jdGlvbi5cbiAgICBsZXQgZGlzdGFuY2VzO1xuICAgIGlmICh0aGlzLm1hdGNoZXIuaGFzR2VvUXVlcnkoKSAmJiBvcHRpb25zLm9yZGVyZWQpIHtcbiAgICAgIGlmIChvcHRpb25zLmRpc3RhbmNlcykge1xuICAgICAgICBkaXN0YW5jZXMgPSBvcHRpb25zLmRpc3RhbmNlcztcbiAgICAgICAgZGlzdGFuY2VzLmNsZWFyKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkaXN0YW5jZXMgPSBuZXcgTG9jYWxDb2xsZWN0aW9uLl9JZE1hcCgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIE1ldGVvci5fcnVuRnJlc2goKCkgPT4ge1xuICAgICAgdGhpcy5jb2xsZWN0aW9uLl9kb2NzLmZvckVhY2goKGRvYywgaWQpID0+IHtcbiAgICAgICAgY29uc3QgbWF0Y2hSZXN1bHQgPSB0aGlzLm1hdGNoZXIuZG9jdW1lbnRNYXRjaGVzKGRvYyk7XG4gICAgICAgIGlmIChtYXRjaFJlc3VsdC5yZXN1bHQpIHtcbiAgICAgICAgICBpZiAob3B0aW9ucy5vcmRlcmVkKSB7XG4gICAgICAgICAgICByZXN1bHRzLnB1c2goZG9jKTtcblxuICAgICAgICAgICAgaWYgKGRpc3RhbmNlcyAmJiBtYXRjaFJlc3VsdC5kaXN0YW5jZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgIGRpc3RhbmNlcy5zZXQoaWQsIG1hdGNoUmVzdWx0LmRpc3RhbmNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzdWx0cy5zZXQoaWQsIGRvYyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gT3ZlcnJpZGUgdG8gZW5zdXJlIGFsbCBkb2NzIGFyZSBtYXRjaGVkIGlmIGlnbm9yaW5nIHNraXAgJiBsaW1pdFxuICAgICAgICBpZiAoIWFwcGx5U2tpcExpbWl0KSB7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGYXN0IHBhdGggZm9yIGxpbWl0ZWQgdW5zb3J0ZWQgcXVlcmllcy5cbiAgICAgICAgLy8gWFhYICdsZW5ndGgnIGNoZWNrIGhlcmUgc2VlbXMgd3JvbmcgZm9yIG9yZGVyZWRcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAhdGhpcy5saW1pdCB8fCB0aGlzLnNraXAgfHwgdGhpcy5zb3J0ZXIgfHwgcmVzdWx0cy5sZW5ndGggIT09IHRoaXMubGltaXRcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaWYgKCFvcHRpb25zLm9yZGVyZWQpIHtcbiAgICAgIHJldHVybiByZXN1bHRzO1xuICAgIH1cblxuICAgIGlmICh0aGlzLnNvcnRlcikge1xuICAgICAgcmVzdWx0cy5zb3J0KHRoaXMuc29ydGVyLmdldENvbXBhcmF0b3IoeyBkaXN0YW5jZXMgfSkpO1xuICAgIH1cblxuICAgIC8vIFJldHVybiB0aGUgZnVsbCBzZXQgb2YgcmVzdWx0cyBpZiB0aGVyZSBpcyBubyBza2lwIG9yIGxpbWl0IG9yIGlmIHdlJ3JlXG4gICAgLy8gaWdub3JpbmcgdGhlbVxuICAgIGlmICghYXBwbHlTa2lwTGltaXQgfHwgKCF0aGlzLmxpbWl0ICYmICF0aGlzLnNraXApKSB7XG4gICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0cy5zbGljZShcbiAgICAgIHRoaXMuc2tpcCxcbiAgICAgIHRoaXMubGltaXQgPyB0aGlzLmxpbWl0ICsgdGhpcy5za2lwIDogcmVzdWx0cy5sZW5ndGhcbiAgICApO1xuICB9XG5cbiAgX3B1Ymxpc2hDdXJzb3Ioc3Vic2NyaXB0aW9uKSB7XG4gICAgLy8gWFhYIG1pbmltb25nbyBzaG91bGQgbm90IGRlcGVuZCBvbiBtb25nby1saXZlZGF0YSFcbiAgICBpZiAoIVBhY2thZ2UubW9uZ28pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgXCJDYW4ndCBwdWJsaXNoIGZyb20gTWluaW1vbmdvIHdpdGhvdXQgdGhlIGBtb25nb2AgcGFja2FnZS5cIlxuICAgICAgKTtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuY29sbGVjdGlvbi5uYW1lKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIFwiQ2FuJ3QgcHVibGlzaCBhIGN1cnNvciBmcm9tIGEgY29sbGVjdGlvbiB3aXRob3V0IGEgbmFtZS5cIlxuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gUGFja2FnZS5tb25nby5Nb25nby5Db2xsZWN0aW9uLl9wdWJsaXNoQ3Vyc29yKFxuICAgICAgdGhpcyxcbiAgICAgIHN1YnNjcmlwdGlvbixcbiAgICAgIHRoaXMuY29sbGVjdGlvbi5uYW1lXG4gICAgKTtcbiAgfVxufVxuXG4vLyBJbXBsZW1lbnRzIGFzeW5jIHZlcnNpb24gb2YgY3Vyc29yIG1ldGhvZHMgdG8ga2VlcCBjb2xsZWN0aW9ucyBpc29tb3JwaGljXG5BU1lOQ19DVVJTT1JfTUVUSE9EUy5mb3JFYWNoKG1ldGhvZCA9PiB7XG4gIGNvbnN0IGFzeW5jTmFtZSA9IGdldEFzeW5jTWV0aG9kTmFtZShtZXRob2QpO1xuICBDdXJzb3IucHJvdG90eXBlW2FzeW5jTmFtZV0gPSBmdW5jdGlvbiguLi5hcmdzKSB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpc1ttZXRob2RdLmFwcGx5KHRoaXMsIGFyZ3MpKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGVycm9yKTtcbiAgICB9XG4gIH07XG59KTtcbiIsImltcG9ydCBDdXJzb3IgZnJvbSAnLi9jdXJzb3IuanMnO1xuaW1wb3J0IE9ic2VydmVIYW5kbGUgZnJvbSAnLi9vYnNlcnZlX2hhbmRsZS5qcyc7XG5pbXBvcnQge1xuICBoYXNPd24sXG4gIGlzSW5kZXhhYmxlLFxuICBpc051bWVyaWNLZXksXG4gIGlzT3BlcmF0b3JPYmplY3QsXG4gIHBvcHVsYXRlRG9jdW1lbnRXaXRoUXVlcnlGaWVsZHMsXG4gIHByb2plY3Rpb25EZXRhaWxzLFxufSBmcm9tICcuL2NvbW1vbi5qcyc7XG5cbmltcG9ydCB7IGdldEFzeW5jTWV0aG9kTmFtZSB9IGZyb20gJy4vY29uc3RhbnRzJztcblxuLy8gWFhYIHR5cGUgY2hlY2tpbmcgb24gc2VsZWN0b3JzIChncmFjZWZ1bCBlcnJvciBpZiBtYWxmb3JtZWQpXG5cbi8vIExvY2FsQ29sbGVjdGlvbjogYSBzZXQgb2YgZG9jdW1lbnRzIHRoYXQgc3VwcG9ydHMgcXVlcmllcyBhbmQgbW9kaWZpZXJzLlxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTG9jYWxDb2xsZWN0aW9uIHtcbiAgY29uc3RydWN0b3IobmFtZSkge1xuICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgLy8gX2lkIC0+IGRvY3VtZW50IChhbHNvIGNvbnRhaW5pbmcgaWQpXG4gICAgdGhpcy5fZG9jcyA9IG5ldyBMb2NhbENvbGxlY3Rpb24uX0lkTWFwO1xuXG4gICAgdGhpcy5fb2JzZXJ2ZVF1ZXVlID0gTWV0ZW9yLmlzQ2xpZW50XG4gICAgICA/IG5ldyBNZXRlb3IuX1N5bmNocm9ub3VzUXVldWUoKVxuICAgICAgOiBuZXcgTWV0ZW9yLl9Bc3luY2hyb25vdXNRdWV1ZSgpO1xuXG4gICAgdGhpcy5uZXh0X3FpZCA9IDE7IC8vIGxpdmUgcXVlcnkgaWQgZ2VuZXJhdG9yXG5cbiAgICAvLyBxaWQgLT4gbGl2ZSBxdWVyeSBvYmplY3QuIGtleXM6XG4gICAgLy8gIG9yZGVyZWQ6IGJvb2wuIG9yZGVyZWQgcXVlcmllcyBoYXZlIGFkZGVkQmVmb3JlL21vdmVkQmVmb3JlIGNhbGxiYWNrcy5cbiAgICAvLyAgcmVzdWx0czogYXJyYXkgKG9yZGVyZWQpIG9yIG9iamVjdCAodW5vcmRlcmVkKSBvZiBjdXJyZW50IHJlc3VsdHNcbiAgICAvLyAgICAoYWxpYXNlZCB3aXRoIHRoaXMuX2RvY3MhKVxuICAgIC8vICByZXN1bHRzU25hcHNob3Q6IHNuYXBzaG90IG9mIHJlc3VsdHMuIG51bGwgaWYgbm90IHBhdXNlZC5cbiAgICAvLyAgY3Vyc29yOiBDdXJzb3Igb2JqZWN0IGZvciB0aGUgcXVlcnkuXG4gICAgLy8gIHNlbGVjdG9yLCBzb3J0ZXIsIChjYWxsYmFja3MpOiBmdW5jdGlvbnNcbiAgICB0aGlzLnF1ZXJpZXMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXG4gICAgLy8gbnVsbCBpZiBub3Qgc2F2aW5nIG9yaWdpbmFsczsgYW4gSWRNYXAgZnJvbSBpZCB0byBvcmlnaW5hbCBkb2N1bWVudCB2YWx1ZVxuICAgIC8vIGlmIHNhdmluZyBvcmlnaW5hbHMuIFNlZSBjb21tZW50cyBiZWZvcmUgc2F2ZU9yaWdpbmFscygpLlxuICAgIHRoaXMuX3NhdmVkT3JpZ2luYWxzID0gbnVsbDtcblxuICAgIC8vIFRydWUgd2hlbiBvYnNlcnZlcnMgYXJlIHBhdXNlZCBhbmQgd2Ugc2hvdWxkIG5vdCBzZW5kIGNhbGxiYWNrcy5cbiAgICB0aGlzLnBhdXNlZCA9IGZhbHNlO1xuICB9XG5cbiAgY291bnREb2N1bWVudHMoc2VsZWN0b3IsIG9wdGlvbnMpIHtcbiAgICByZXR1cm4gdGhpcy5maW5kKHNlbGVjdG9yID8/IHt9LCBvcHRpb25zKS5jb3VudEFzeW5jKCk7XG4gIH1cblxuICBlc3RpbWF0ZWREb2N1bWVudENvdW50KG9wdGlvbnMpIHtcbiAgICByZXR1cm4gdGhpcy5maW5kKHt9LCBvcHRpb25zKS5jb3VudEFzeW5jKCk7XG4gIH1cblxuICAvLyBvcHRpb25zIG1heSBpbmNsdWRlIHNvcnQsIHNraXAsIGxpbWl0LCByZWFjdGl2ZVxuICAvLyBzb3J0IG1heSBiZSBhbnkgb2YgdGhlc2UgZm9ybXM6XG4gIC8vICAgICB7YTogMSwgYjogLTF9XG4gIC8vICAgICBbW1wiYVwiLCBcImFzY1wiXSwgW1wiYlwiLCBcImRlc2NcIl1dXG4gIC8vICAgICBbXCJhXCIsIFtcImJcIiwgXCJkZXNjXCJdXVxuICAvLyAgIChpbiB0aGUgZmlyc3QgZm9ybSB5b3UncmUgYmVob2xkZW4gdG8ga2V5IGVudW1lcmF0aW9uIG9yZGVyIGluXG4gIC8vICAgeW91ciBqYXZhc2NyaXB0IFZNKVxuICAvL1xuICAvLyByZWFjdGl2ZTogaWYgZ2l2ZW4sIGFuZCBmYWxzZSwgZG9uJ3QgcmVnaXN0ZXIgd2l0aCBUcmFja2VyIChkZWZhdWx0XG4gIC8vIGlzIHRydWUpXG4gIC8vXG4gIC8vIFhYWCBwb3NzaWJseSBzaG91bGQgc3VwcG9ydCByZXRyaWV2aW5nIGEgc3Vic2V0IG9mIGZpZWxkcz8gYW5kXG4gIC8vIGhhdmUgaXQgYmUgYSBoaW50IChpZ25vcmVkIG9uIHRoZSBjbGllbnQsIHdoZW4gbm90IGNvcHlpbmcgdGhlXG4gIC8vIGRvYz8pXG4gIC8vXG4gIC8vIFhYWCBzb3J0IGRvZXMgbm90IHlldCBzdXBwb3J0IHN1YmtleXMgKCdhLmInKSAuLiBmaXggdGhhdCFcbiAgLy8gWFhYIGFkZCBvbmUgbW9yZSBzb3J0IGZvcm06IFwia2V5XCJcbiAgLy8gWFhYIHRlc3RzXG4gIGZpbmQoc2VsZWN0b3IsIG9wdGlvbnMpIHtcbiAgICAvLyBkZWZhdWx0IHN5bnRheCBmb3IgZXZlcnl0aGluZyBpcyB0byBvbWl0IHRoZSBzZWxlY3RvciBhcmd1bWVudC5cbiAgICAvLyBidXQgaWYgc2VsZWN0b3IgaXMgZXhwbGljaXRseSBwYXNzZWQgaW4gYXMgZmFsc2Ugb3IgdW5kZWZpbmVkLCB3ZVxuICAgIC8vIHdhbnQgYSBzZWxlY3RvciB0aGF0IG1hdGNoZXMgbm90aGluZy5cbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgc2VsZWN0b3IgPSB7fTtcbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IExvY2FsQ29sbGVjdGlvbi5DdXJzb3IodGhpcywgc2VsZWN0b3IsIG9wdGlvbnMpO1xuICB9XG5cbiAgZmluZE9uZShzZWxlY3Rvciwgb3B0aW9ucyA9IHt9KSB7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgIHNlbGVjdG9yID0ge307XG4gICAgfVxuXG4gICAgLy8gTk9URTogYnkgc2V0dGluZyBsaW1pdCAxIGhlcmUsIHdlIGVuZCB1cCB1c2luZyB2ZXJ5IGluZWZmaWNpZW50XG4gICAgLy8gY29kZSB0aGF0IHJlY29tcHV0ZXMgdGhlIHdob2xlIHF1ZXJ5IG9uIGVhY2ggdXBkYXRlLiBUaGUgdXBzaWRlIGlzXG4gICAgLy8gdGhhdCB3aGVuIHlvdSByZWFjdGl2ZWx5IGRlcGVuZCBvbiBhIGZpbmRPbmUgeW91IG9ubHkgZ2V0XG4gICAgLy8gaW52YWxpZGF0ZWQgd2hlbiB0aGUgZm91bmQgb2JqZWN0IGNoYW5nZXMsIG5vdCBhbnkgb2JqZWN0IGluIHRoZVxuICAgIC8vIGNvbGxlY3Rpb24uIE1vc3QgZmluZE9uZSB3aWxsIGJlIGJ5IGlkLCB3aGljaCBoYXMgYSBmYXN0IHBhdGgsIHNvXG4gICAgLy8gdGhpcyBtaWdodCBub3QgYmUgYSBiaWcgZGVhbC4gSW4gbW9zdCBjYXNlcywgaW52YWxpZGF0aW9uIGNhdXNlc1xuICAgIC8vIHRoZSBjYWxsZWQgdG8gcmUtcXVlcnkgYW55d2F5LCBzbyB0aGlzIHNob3VsZCBiZSBhIG5ldCBwZXJmb3JtYW5jZVxuICAgIC8vIGltcHJvdmVtZW50LlxuICAgIG9wdGlvbnMubGltaXQgPSAxO1xuXG4gICAgcmV0dXJuIHRoaXMuZmluZChzZWxlY3Rvciwgb3B0aW9ucykuZmV0Y2goKVswXTtcbiAgfVxuICBhc3luYyBmaW5kT25lQXN5bmMoc2VsZWN0b3IsIG9wdGlvbnMgPSB7fSkge1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBzZWxlY3RvciA9IHt9O1xuICAgIH1cbiAgICBvcHRpb25zLmxpbWl0ID0gMTtcbiAgICByZXR1cm4gKGF3YWl0IHRoaXMuZmluZChzZWxlY3Rvciwgb3B0aW9ucykuZmV0Y2hBc3luYygpKVswXTtcbiAgfVxuICBwcmVwYXJlSW5zZXJ0KGRvYykge1xuICAgIGFzc2VydEhhc1ZhbGlkRmllbGROYW1lcyhkb2MpO1xuXG4gICAgLy8gaWYgeW91IHJlYWxseSB3YW50IHRvIHVzZSBPYmplY3RJRHMsIHNldCB0aGlzIGdsb2JhbC5cbiAgICAvLyBNb25nby5Db2xsZWN0aW9uIHNwZWNpZmllcyBpdHMgb3duIGlkcyBhbmQgZG9lcyBub3QgdXNlIHRoaXMgY29kZS5cbiAgICBpZiAoIWhhc093bi5jYWxsKGRvYywgJ19pZCcpKSB7XG4gICAgICBkb2MuX2lkID0gTG9jYWxDb2xsZWN0aW9uLl91c2VPSUQgPyBuZXcgTW9uZ29JRC5PYmplY3RJRCgpIDogUmFuZG9tLmlkKCk7XG4gICAgfVxuXG4gICAgY29uc3QgaWQgPSBkb2MuX2lkO1xuXG4gICAgaWYgKHRoaXMuX2RvY3MuaGFzKGlkKSkge1xuICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoYER1cGxpY2F0ZSBfaWQgJyR7aWR9J2ApO1xuICAgIH1cblxuICAgIHRoaXMuX3NhdmVPcmlnaW5hbChpZCwgdW5kZWZpbmVkKTtcbiAgICB0aGlzLl9kb2NzLnNldChpZCwgZG9jKTtcblxuICAgIHJldHVybiBpZDtcbiAgfVxuXG4gIC8vIFhYWCBwb3NzaWJseSBlbmZvcmNlIHRoYXQgJ3VuZGVmaW5lZCcgZG9lcyBub3QgYXBwZWFyICh3ZSBhc3N1bWVcbiAgLy8gdGhpcyBpbiBvdXIgaGFuZGxpbmcgb2YgbnVsbCBhbmQgJGV4aXN0cylcbiAgaW5zZXJ0KGRvYywgY2FsbGJhY2spIHtcbiAgICBkb2MgPSBFSlNPTi5jbG9uZShkb2MpO1xuICAgIGNvbnN0IGlkID0gdGhpcy5wcmVwYXJlSW5zZXJ0KGRvYyk7XG4gICAgY29uc3QgcXVlcmllc1RvUmVjb21wdXRlID0gW107XG5cbiAgICAvLyB0cmlnZ2VyIGxpdmUgcXVlcmllcyB0aGF0IG1hdGNoXG4gICAgZm9yIChjb25zdCBxaWQgb2YgT2JqZWN0LmtleXModGhpcy5xdWVyaWVzKSkge1xuICAgICAgY29uc3QgcXVlcnkgPSB0aGlzLnF1ZXJpZXNbcWlkXTtcblxuICAgICAgaWYgKHF1ZXJ5LmRpcnR5KSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBtYXRjaFJlc3VsdCA9IHF1ZXJ5Lm1hdGNoZXIuZG9jdW1lbnRNYXRjaGVzKGRvYyk7XG5cbiAgICAgIGlmIChtYXRjaFJlc3VsdC5yZXN1bHQpIHtcbiAgICAgICAgaWYgKHF1ZXJ5LmRpc3RhbmNlcyAmJiBtYXRjaFJlc3VsdC5kaXN0YW5jZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgcXVlcnkuZGlzdGFuY2VzLnNldChpZCwgbWF0Y2hSZXN1bHQuZGlzdGFuY2UpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHF1ZXJ5LmN1cnNvci5za2lwIHx8IHF1ZXJ5LmN1cnNvci5saW1pdCkge1xuICAgICAgICAgIHF1ZXJpZXNUb1JlY29tcHV0ZS5wdXNoKHFpZCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgTG9jYWxDb2xsZWN0aW9uLl9pbnNlcnRJblJlc3VsdHNTeW5jKHF1ZXJ5LCBkb2MpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcXVlcmllc1RvUmVjb21wdXRlLmZvckVhY2gocWlkID0+IHtcbiAgICAgIGlmICh0aGlzLnF1ZXJpZXNbcWlkXSkge1xuICAgICAgICB0aGlzLl9yZWNvbXB1dGVSZXN1bHRzKHRoaXMucXVlcmllc1txaWRdKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHRoaXMuX29ic2VydmVRdWV1ZS5kcmFpbigpO1xuICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgTWV0ZW9yLmRlZmVyKCgpID0+IHtcbiAgICAgICAgY2FsbGJhY2sobnVsbCwgaWQpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGlkO1xuICB9XG4gIGFzeW5jIGluc2VydEFzeW5jKGRvYywgY2FsbGJhY2spIHtcbiAgICBkb2MgPSBFSlNPTi5jbG9uZShkb2MpO1xuICAgIGNvbnN0IGlkID0gdGhpcy5wcmVwYXJlSW5zZXJ0KGRvYyk7XG4gICAgY29uc3QgcXVlcmllc1RvUmVjb21wdXRlID0gW107XG5cbiAgICAvLyB0cmlnZ2VyIGxpdmUgcXVlcmllcyB0aGF0IG1hdGNoXG4gICAgZm9yIChjb25zdCBxaWQgb2YgT2JqZWN0LmtleXModGhpcy5xdWVyaWVzKSkge1xuICAgICAgY29uc3QgcXVlcnkgPSB0aGlzLnF1ZXJpZXNbcWlkXTtcblxuICAgICAgaWYgKHF1ZXJ5LmRpcnR5KSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBtYXRjaFJlc3VsdCA9IHF1ZXJ5Lm1hdGNoZXIuZG9jdW1lbnRNYXRjaGVzKGRvYyk7XG5cbiAgICAgIGlmIChtYXRjaFJlc3VsdC5yZXN1bHQpIHtcbiAgICAgICAgaWYgKHF1ZXJ5LmRpc3RhbmNlcyAmJiBtYXRjaFJlc3VsdC5kaXN0YW5jZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgcXVlcnkuZGlzdGFuY2VzLnNldChpZCwgbWF0Y2hSZXN1bHQuZGlzdGFuY2UpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHF1ZXJ5LmN1cnNvci5za2lwIHx8IHF1ZXJ5LmN1cnNvci5saW1pdCkge1xuICAgICAgICAgIHF1ZXJpZXNUb1JlY29tcHV0ZS5wdXNoKHFpZCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYXdhaXQgTG9jYWxDb2xsZWN0aW9uLl9pbnNlcnRJblJlc3VsdHNBc3luYyhxdWVyeSwgZG9jKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHF1ZXJpZXNUb1JlY29tcHV0ZS5mb3JFYWNoKHFpZCA9PiB7XG4gICAgICBpZiAodGhpcy5xdWVyaWVzW3FpZF0pIHtcbiAgICAgICAgdGhpcy5fcmVjb21wdXRlUmVzdWx0cyh0aGlzLnF1ZXJpZXNbcWlkXSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBhd2FpdCB0aGlzLl9vYnNlcnZlUXVldWUuZHJhaW4oKTtcbiAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgIE1ldGVvci5kZWZlcigoKSA9PiB7XG4gICAgICAgIGNhbGxiYWNrKG51bGwsIGlkKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBpZDtcbiAgfVxuXG4gIC8vIFBhdXNlIHRoZSBvYnNlcnZlcnMuIE5vIGNhbGxiYWNrcyBmcm9tIG9ic2VydmVycyB3aWxsIGZpcmUgdW50aWxcbiAgLy8gJ3Jlc3VtZU9ic2VydmVycycgaXMgY2FsbGVkLlxuICBwYXVzZU9ic2VydmVycygpIHtcbiAgICAvLyBOby1vcCBpZiBhbHJlYWR5IHBhdXNlZC5cbiAgICBpZiAodGhpcy5wYXVzZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBTZXQgdGhlICdwYXVzZWQnIGZsYWcgc3VjaCB0aGF0IG5ldyBvYnNlcnZlciBtZXNzYWdlcyBkb24ndCBmaXJlLlxuICAgIHRoaXMucGF1c2VkID0gdHJ1ZTtcblxuICAgIC8vIFRha2UgYSBzbmFwc2hvdCBvZiB0aGUgcXVlcnkgcmVzdWx0cyBmb3IgZWFjaCBxdWVyeS5cbiAgICBPYmplY3Qua2V5cyh0aGlzLnF1ZXJpZXMpLmZvckVhY2gocWlkID0+IHtcbiAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyaWVzW3FpZF07XG4gICAgICBxdWVyeS5yZXN1bHRzU25hcHNob3QgPSBFSlNPTi5jbG9uZShxdWVyeS5yZXN1bHRzKTtcbiAgICB9KTtcbiAgfVxuXG4gIGNsZWFyUmVzdWx0UXVlcmllcyhjYWxsYmFjaykge1xuICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMuX2RvY3Muc2l6ZSgpO1xuXG4gICAgdGhpcy5fZG9jcy5jbGVhcigpO1xuXG4gICAgT2JqZWN0LmtleXModGhpcy5xdWVyaWVzKS5mb3JFYWNoKHFpZCA9PiB7XG4gICAgICBjb25zdCBxdWVyeSA9IHRoaXMucXVlcmllc1txaWRdO1xuXG4gICAgICBpZiAocXVlcnkub3JkZXJlZCkge1xuICAgICAgICBxdWVyeS5yZXN1bHRzID0gW107XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBxdWVyeS5yZXN1bHRzLmNsZWFyKCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgIE1ldGVvci5kZWZlcigoKSA9PiB7XG4gICAgICAgIGNhbGxiYWNrKG51bGwsIHJlc3VsdCk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cblxuICBwcmVwYXJlUmVtb3ZlKHNlbGVjdG9yKSB7XG4gICAgY29uc3QgbWF0Y2hlciA9IG5ldyBNaW5pbW9uZ28uTWF0Y2hlcihzZWxlY3Rvcik7XG4gICAgY29uc3QgcmVtb3ZlID0gW107XG5cbiAgICB0aGlzLl9lYWNoUG9zc2libHlNYXRjaGluZ0RvY1N5bmMoc2VsZWN0b3IsIChkb2MsIGlkKSA9PiB7XG4gICAgICBpZiAobWF0Y2hlci5kb2N1bWVudE1hdGNoZXMoZG9jKS5yZXN1bHQpIHtcbiAgICAgICAgcmVtb3ZlLnB1c2goaWQpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29uc3QgcXVlcmllc1RvUmVjb21wdXRlID0gW107XG4gICAgY29uc3QgcXVlcnlSZW1vdmUgPSBbXTtcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcmVtb3ZlLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCByZW1vdmVJZCA9IHJlbW92ZVtpXTtcbiAgICAgIGNvbnN0IHJlbW92ZURvYyA9IHRoaXMuX2RvY3MuZ2V0KHJlbW92ZUlkKTtcblxuICAgICAgT2JqZWN0LmtleXModGhpcy5xdWVyaWVzKS5mb3JFYWNoKHFpZCA9PiB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyaWVzW3FpZF07XG5cbiAgICAgICAgaWYgKHF1ZXJ5LmRpcnR5KSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHF1ZXJ5Lm1hdGNoZXIuZG9jdW1lbnRNYXRjaGVzKHJlbW92ZURvYykucmVzdWx0KSB7XG4gICAgICAgICAgaWYgKHF1ZXJ5LmN1cnNvci5za2lwIHx8IHF1ZXJ5LmN1cnNvci5saW1pdCkge1xuICAgICAgICAgICAgcXVlcmllc1RvUmVjb21wdXRlLnB1c2gocWlkKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcXVlcnlSZW1vdmUucHVzaCh7cWlkLCBkb2M6IHJlbW92ZURvY30pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIHRoaXMuX3NhdmVPcmlnaW5hbChyZW1vdmVJZCwgcmVtb3ZlRG9jKTtcbiAgICAgIHRoaXMuX2RvY3MucmVtb3ZlKHJlbW92ZUlkKTtcbiAgICB9XG5cbiAgICByZXR1cm4geyBxdWVyaWVzVG9SZWNvbXB1dGUsIHF1ZXJ5UmVtb3ZlLCByZW1vdmUgfTtcbiAgfVxuXG4gIHJlbW92ZShzZWxlY3RvciwgY2FsbGJhY2spIHtcbiAgICAvLyBFYXN5IHNwZWNpYWwgY2FzZTogaWYgd2UncmUgbm90IGNhbGxpbmcgb2JzZXJ2ZUNoYW5nZXMgY2FsbGJhY2tzIGFuZFxuICAgIC8vIHdlJ3JlIG5vdCBzYXZpbmcgb3JpZ2luYWxzIGFuZCB3ZSBnb3QgYXNrZWQgdG8gcmVtb3ZlIGV2ZXJ5dGhpbmcsIHRoZW5cbiAgICAvLyBqdXN0IGVtcHR5IGV2ZXJ5dGhpbmcgZGlyZWN0bHkuXG4gICAgaWYgKHRoaXMucGF1c2VkICYmICF0aGlzLl9zYXZlZE9yaWdpbmFscyAmJiBFSlNPTi5lcXVhbHMoc2VsZWN0b3IsIHt9KSkge1xuICAgICAgcmV0dXJuIHRoaXMuY2xlYXJSZXN1bHRRdWVyaWVzKGNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHF1ZXJpZXNUb1JlY29tcHV0ZSwgcXVlcnlSZW1vdmUsIHJlbW92ZSB9ID0gdGhpcy5wcmVwYXJlUmVtb3ZlKHNlbGVjdG9yKTtcblxuICAgIC8vIHJ1biBsaXZlIHF1ZXJ5IGNhbGxiYWNrcyBfYWZ0ZXJfIHdlJ3ZlIHJlbW92ZWQgdGhlIGRvY3VtZW50cy5cbiAgICBxdWVyeVJlbW92ZS5mb3JFYWNoKHJlbW92ZSA9PiB7XG4gICAgICBjb25zdCBxdWVyeSA9IHRoaXMucXVlcmllc1tyZW1vdmUucWlkXTtcblxuICAgICAgaWYgKHF1ZXJ5KSB7XG4gICAgICAgIHF1ZXJ5LmRpc3RhbmNlcyAmJiBxdWVyeS5kaXN0YW5jZXMucmVtb3ZlKHJlbW92ZS5kb2MuX2lkKTtcbiAgICAgICAgTG9jYWxDb2xsZWN0aW9uLl9yZW1vdmVGcm9tUmVzdWx0c1N5bmMocXVlcnksIHJlbW92ZS5kb2MpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcXVlcmllc1RvUmVjb21wdXRlLmZvckVhY2gocWlkID0+IHtcbiAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyaWVzW3FpZF07XG5cbiAgICAgIGlmIChxdWVyeSkge1xuICAgICAgICB0aGlzLl9yZWNvbXB1dGVSZXN1bHRzKHF1ZXJ5KTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHRoaXMuX29ic2VydmVRdWV1ZS5kcmFpbigpO1xuXG4gICAgY29uc3QgcmVzdWx0ID0gcmVtb3ZlLmxlbmd0aDtcblxuICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgTWV0ZW9yLmRlZmVyKCgpID0+IHtcbiAgICAgICAgY2FsbGJhY2sobnVsbCwgcmVzdWx0KTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBhc3luYyByZW1vdmVBc3luYyhzZWxlY3RvciwgY2FsbGJhY2spIHtcbiAgICAvLyBFYXN5IHNwZWNpYWwgY2FzZTogaWYgd2UncmUgbm90IGNhbGxpbmcgb2JzZXJ2ZUNoYW5nZXMgY2FsbGJhY2tzIGFuZFxuICAgIC8vIHdlJ3JlIG5vdCBzYXZpbmcgb3JpZ2luYWxzIGFuZCB3ZSBnb3QgYXNrZWQgdG8gcmVtb3ZlIGV2ZXJ5dGhpbmcsIHRoZW5cbiAgICAvLyBqdXN0IGVtcHR5IGV2ZXJ5dGhpbmcgZGlyZWN0bHkuXG4gICAgaWYgKHRoaXMucGF1c2VkICYmICF0aGlzLl9zYXZlZE9yaWdpbmFscyAmJiBFSlNPTi5lcXVhbHMoc2VsZWN0b3IsIHt9KSkge1xuICAgICAgcmV0dXJuIHRoaXMuY2xlYXJSZXN1bHRRdWVyaWVzKGNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHF1ZXJpZXNUb1JlY29tcHV0ZSwgcXVlcnlSZW1vdmUsIHJlbW92ZSB9ID0gdGhpcy5wcmVwYXJlUmVtb3ZlKHNlbGVjdG9yKTtcblxuICAgIC8vIHJ1biBsaXZlIHF1ZXJ5IGNhbGxiYWNrcyBfYWZ0ZXJfIHdlJ3ZlIHJlbW92ZWQgdGhlIGRvY3VtZW50cy5cbiAgICBmb3IgKGNvbnN0IHJlbW92ZSBvZiBxdWVyeVJlbW92ZSkge1xuICAgICAgY29uc3QgcXVlcnkgPSB0aGlzLnF1ZXJpZXNbcmVtb3ZlLnFpZF07XG5cbiAgICAgIGlmIChxdWVyeSkge1xuICAgICAgICBxdWVyeS5kaXN0YW5jZXMgJiYgcXVlcnkuZGlzdGFuY2VzLnJlbW92ZShyZW1vdmUuZG9jLl9pZCk7XG4gICAgICAgIGF3YWl0IExvY2FsQ29sbGVjdGlvbi5fcmVtb3ZlRnJvbVJlc3VsdHNBc3luYyhxdWVyeSwgcmVtb3ZlLmRvYyk7XG4gICAgICB9XG4gICAgfVxuICAgIHF1ZXJpZXNUb1JlY29tcHV0ZS5mb3JFYWNoKHFpZCA9PiB7XG4gICAgICBjb25zdCBxdWVyeSA9IHRoaXMucXVlcmllc1txaWRdO1xuXG4gICAgICBpZiAocXVlcnkpIHtcbiAgICAgICAgdGhpcy5fcmVjb21wdXRlUmVzdWx0cyhxdWVyeSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBhd2FpdCB0aGlzLl9vYnNlcnZlUXVldWUuZHJhaW4oKTtcblxuICAgIGNvbnN0IHJlc3VsdCA9IHJlbW92ZS5sZW5ndGg7XG5cbiAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgIE1ldGVvci5kZWZlcigoKSA9PiB7XG4gICAgICAgIGNhbGxiYWNrKG51bGwsIHJlc3VsdCk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gUmVzdW1lIHRoZSBvYnNlcnZlcnMuIE9ic2VydmVycyBpbW1lZGlhdGVseSByZWNlaXZlIGNoYW5nZVxuICAvLyBub3RpZmljYXRpb25zIHRvIGJyaW5nIHRoZW0gdG8gdGhlIGN1cnJlbnQgc3RhdGUgb2YgdGhlXG4gIC8vIGRhdGFiYXNlLiBOb3RlIHRoYXQgdGhpcyBpcyBub3QganVzdCByZXBsYXlpbmcgYWxsIHRoZSBjaGFuZ2VzIHRoYXRcbiAgLy8gaGFwcGVuZWQgZHVyaW5nIHRoZSBwYXVzZSwgaXQgaXMgYSBzbWFydGVyICdjb2FsZXNjZWQnIGRpZmYuXG4gIF9yZXN1bWVPYnNlcnZlcnMoKSB7XG4gICAgLy8gTm8tb3AgaWYgbm90IHBhdXNlZC5cbiAgICBpZiAoIXRoaXMucGF1c2VkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVW5zZXQgdGhlICdwYXVzZWQnIGZsYWcuIE1ha2Ugc3VyZSB0byBkbyB0aGlzIGZpcnN0LCBvdGhlcndpc2VcbiAgICAvLyBvYnNlcnZlciBtZXRob2RzIHdvbid0IGFjdHVhbGx5IGZpcmUgd2hlbiB3ZSB0cmlnZ2VyIHRoZW0uXG4gICAgdGhpcy5wYXVzZWQgPSBmYWxzZTtcblxuICAgIE9iamVjdC5rZXlzKHRoaXMucXVlcmllcykuZm9yRWFjaChxaWQgPT4ge1xuICAgICAgY29uc3QgcXVlcnkgPSB0aGlzLnF1ZXJpZXNbcWlkXTtcblxuICAgICAgaWYgKHF1ZXJ5LmRpcnR5KSB7XG4gICAgICAgIHF1ZXJ5LmRpcnR5ID0gZmFsc2U7XG5cbiAgICAgICAgLy8gcmUtY29tcHV0ZSByZXN1bHRzIHdpbGwgcGVyZm9ybSBgTG9jYWxDb2xsZWN0aW9uLl9kaWZmUXVlcnlDaGFuZ2VzYFxuICAgICAgICAvLyBhdXRvbWF0aWNhbGx5LlxuICAgICAgICB0aGlzLl9yZWNvbXB1dGVSZXN1bHRzKHF1ZXJ5LCBxdWVyeS5yZXN1bHRzU25hcHNob3QpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRGlmZiB0aGUgY3VycmVudCByZXN1bHRzIGFnYWluc3QgdGhlIHNuYXBzaG90IGFuZCBzZW5kIHRvIG9ic2VydmVycy5cbiAgICAgICAgLy8gcGFzcyB0aGUgcXVlcnkgb2JqZWN0IGZvciBpdHMgb2JzZXJ2ZXIgY2FsbGJhY2tzLlxuICAgICAgICBMb2NhbENvbGxlY3Rpb24uX2RpZmZRdWVyeUNoYW5nZXMoXG4gICAgICAgICAgcXVlcnkub3JkZXJlZCxcbiAgICAgICAgICBxdWVyeS5yZXN1bHRzU25hcHNob3QsXG4gICAgICAgICAgcXVlcnkucmVzdWx0cyxcbiAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICB7cHJvamVjdGlvbkZuOiBxdWVyeS5wcm9qZWN0aW9uRm59XG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIHF1ZXJ5LnJlc3VsdHNTbmFwc2hvdCA9IG51bGw7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyByZXN1bWVPYnNlcnZlcnNTZXJ2ZXIoKSB7XG4gICAgdGhpcy5fcmVzdW1lT2JzZXJ2ZXJzKCk7XG4gICAgYXdhaXQgdGhpcy5fb2JzZXJ2ZVF1ZXVlLmRyYWluKCk7XG4gIH1cbiAgcmVzdW1lT2JzZXJ2ZXJzQ2xpZW50KCkge1xuICAgIHRoaXMuX3Jlc3VtZU9ic2VydmVycygpO1xuICAgIHRoaXMuX29ic2VydmVRdWV1ZS5kcmFpbigpO1xuICB9XG5cbiAgcmV0cmlldmVPcmlnaW5hbHMoKSB7XG4gICAgaWYgKCF0aGlzLl9zYXZlZE9yaWdpbmFscykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYWxsZWQgcmV0cmlldmVPcmlnaW5hbHMgd2l0aG91dCBzYXZlT3JpZ2luYWxzJyk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3JpZ2luYWxzID0gdGhpcy5fc2F2ZWRPcmlnaW5hbHM7XG5cbiAgICB0aGlzLl9zYXZlZE9yaWdpbmFscyA9IG51bGw7XG5cbiAgICByZXR1cm4gb3JpZ2luYWxzO1xuICB9XG5cbiAgLy8gVG8gdHJhY2sgd2hhdCBkb2N1bWVudHMgYXJlIGFmZmVjdGVkIGJ5IGEgcGllY2Ugb2YgY29kZSwgY2FsbFxuICAvLyBzYXZlT3JpZ2luYWxzKCkgYmVmb3JlIGl0IGFuZCByZXRyaWV2ZU9yaWdpbmFscygpIGFmdGVyIGl0LlxuICAvLyByZXRyaWV2ZU9yaWdpbmFscyByZXR1cm5zIGFuIG9iamVjdCB3aG9zZSBrZXlzIGFyZSB0aGUgaWRzIG9mIHRoZSBkb2N1bWVudHNcbiAgLy8gdGhhdCB3ZXJlIGFmZmVjdGVkIHNpbmNlIHRoZSBjYWxsIHRvIHNhdmVPcmlnaW5hbHMoKSwgYW5kIHRoZSB2YWx1ZXMgYXJlXG4gIC8vIGVxdWFsIHRvIHRoZSBkb2N1bWVudCdzIGNvbnRlbnRzIGF0IHRoZSB0aW1lIG9mIHNhdmVPcmlnaW5hbHMuIChJbiB0aGUgY2FzZVxuICAvLyBvZiBhbiBpbnNlcnRlZCBkb2N1bWVudCwgdW5kZWZpbmVkIGlzIHRoZSB2YWx1ZS4pIFlvdSBtdXN0IGFsdGVybmF0ZVxuICAvLyBiZXR3ZWVuIGNhbGxzIHRvIHNhdmVPcmlnaW5hbHMoKSBhbmQgcmV0cmlldmVPcmlnaW5hbHMoKS5cbiAgc2F2ZU9yaWdpbmFscygpIHtcbiAgICBpZiAodGhpcy5fc2F2ZWRPcmlnaW5hbHMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ2FsbGVkIHNhdmVPcmlnaW5hbHMgdHdpY2Ugd2l0aG91dCByZXRyaWV2ZU9yaWdpbmFscycpO1xuICAgIH1cblxuICAgIHRoaXMuX3NhdmVkT3JpZ2luYWxzID0gbmV3IExvY2FsQ29sbGVjdGlvbi5fSWRNYXA7XG4gIH1cblxuICBwcmVwYXJlVXBkYXRlKHNlbGVjdG9yKSB7XG4gICAgLy8gU2F2ZSB0aGUgb3JpZ2luYWwgcmVzdWx0cyBvZiBhbnkgcXVlcnkgdGhhdCB3ZSBtaWdodCBuZWVkIHRvXG4gICAgLy8gX3JlY29tcHV0ZVJlc3VsdHMgb24sIGJlY2F1c2UgX21vZGlmeUFuZE5vdGlmeSB3aWxsIG11dGF0ZSB0aGUgb2JqZWN0cyBpblxuICAgIC8vIGl0LiAoV2UgZG9uJ3QgbmVlZCB0byBzYXZlIHRoZSBvcmlnaW5hbCByZXN1bHRzIG9mIHBhdXNlZCBxdWVyaWVzIGJlY2F1c2VcbiAgICAvLyB0aGV5IGFscmVhZHkgaGF2ZSBhIHJlc3VsdHNTbmFwc2hvdCBhbmQgd2Ugd29uJ3QgYmUgZGlmZmluZyBpblxuICAgIC8vIF9yZWNvbXB1dGVSZXN1bHRzLilcbiAgICBjb25zdCBxaWRUb09yaWdpbmFsUmVzdWx0cyA9IHt9O1xuXG4gICAgLy8gV2Ugc2hvdWxkIG9ubHkgY2xvbmUgZWFjaCBkb2N1bWVudCBvbmNlLCBldmVuIGlmIGl0IGFwcGVhcnMgaW4gbXVsdGlwbGVcbiAgICAvLyBxdWVyaWVzXG4gICAgY29uc3QgZG9jTWFwID0gbmV3IExvY2FsQ29sbGVjdGlvbi5fSWRNYXA7XG4gICAgY29uc3QgaWRzTWF0Y2hlZCA9IExvY2FsQ29sbGVjdGlvbi5faWRzTWF0Y2hlZEJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuXG4gICAgT2JqZWN0LmtleXModGhpcy5xdWVyaWVzKS5mb3JFYWNoKHFpZCA9PiB7XG4gICAgICBjb25zdCBxdWVyeSA9IHRoaXMucXVlcmllc1txaWRdO1xuXG4gICAgICBpZiAoKHF1ZXJ5LmN1cnNvci5za2lwIHx8IHF1ZXJ5LmN1cnNvci5saW1pdCkgJiYgISB0aGlzLnBhdXNlZCkge1xuICAgICAgICAvLyBDYXRjaCB0aGUgY2FzZSBvZiBhIHJlYWN0aXZlIGBjb3VudCgpYCBvbiBhIGN1cnNvciB3aXRoIHNraXBcbiAgICAgICAgLy8gb3IgbGltaXQsIHdoaWNoIHJlZ2lzdGVycyBhbiB1bm9yZGVyZWQgb2JzZXJ2ZS4gVGhpcyBpcyBhXG4gICAgICAgIC8vIHByZXR0eSByYXJlIGNhc2UsIHNvIHdlIGp1c3QgY2xvbmUgdGhlIGVudGlyZSByZXN1bHQgc2V0IHdpdGhcbiAgICAgICAgLy8gbm8gb3B0aW1pemF0aW9ucyBmb3IgZG9jdW1lbnRzIHRoYXQgYXBwZWFyIGluIHRoZXNlIHJlc3VsdFxuICAgICAgICAvLyBzZXRzIGFuZCBvdGhlciBxdWVyaWVzLlxuICAgICAgICBpZiAocXVlcnkucmVzdWx0cyBpbnN0YW5jZW9mIExvY2FsQ29sbGVjdGlvbi5fSWRNYXApIHtcbiAgICAgICAgICBxaWRUb09yaWdpbmFsUmVzdWx0c1txaWRdID0gcXVlcnkucmVzdWx0cy5jbG9uZSgpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghKHF1ZXJ5LnJlc3VsdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Fzc2VydGlvbiBmYWlsZWQ6IHF1ZXJ5LnJlc3VsdHMgbm90IGFuIGFycmF5Jyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDbG9uZXMgYSBkb2N1bWVudCB0byBiZSBzdG9yZWQgaW4gYHFpZFRvT3JpZ2luYWxSZXN1bHRzYFxuICAgICAgICAvLyBiZWNhdXNlIGl0IG1heSBiZSBtb2RpZmllZCBiZWZvcmUgdGhlIG5ldyBhbmQgb2xkIHJlc3VsdCBzZXRzXG4gICAgICAgIC8vIGFyZSBkaWZmZWQuIEJ1dCBpZiB3ZSBrbm93IGV4YWN0bHkgd2hpY2ggZG9jdW1lbnQgSURzIHdlJ3JlXG4gICAgICAgIC8vIGdvaW5nIHRvIG1vZGlmeSwgdGhlbiB3ZSBvbmx5IG5lZWQgdG8gY2xvbmUgdGhvc2UuXG4gICAgICAgIGNvbnN0IG1lbW9pemVkQ2xvbmVJZk5lZWRlZCA9IGRvYyA9PiB7XG4gICAgICAgICAgaWYgKGRvY01hcC5oYXMoZG9jLl9pZCkpIHtcbiAgICAgICAgICAgIHJldHVybiBkb2NNYXAuZ2V0KGRvYy5faWQpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IGRvY1RvTWVtb2l6ZSA9IChcbiAgICAgICAgICAgIGlkc01hdGNoZWQgJiZcbiAgICAgICAgICAgICFpZHNNYXRjaGVkLnNvbWUoaWQgPT4gRUpTT04uZXF1YWxzKGlkLCBkb2MuX2lkKSlcbiAgICAgICAgICApID8gZG9jIDogRUpTT04uY2xvbmUoZG9jKTtcblxuICAgICAgICAgIGRvY01hcC5zZXQoZG9jLl9pZCwgZG9jVG9NZW1vaXplKTtcblxuICAgICAgICAgIHJldHVybiBkb2NUb01lbW9pemU7XG4gICAgICAgIH07XG5cbiAgICAgICAgcWlkVG9PcmlnaW5hbFJlc3VsdHNbcWlkXSA9IHF1ZXJ5LnJlc3VsdHMubWFwKG1lbW9pemVkQ2xvbmVJZk5lZWRlZCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcWlkVG9PcmlnaW5hbFJlc3VsdHM7XG4gIH1cblxuICBmaW5pc2hVcGRhdGUoeyBvcHRpb25zLCB1cGRhdGVDb3VudCwgY2FsbGJhY2ssIGluc2VydGVkSWQgfSkge1xuXG5cbiAgICAvLyBSZXR1cm4gdGhlIG51bWJlciBvZiBhZmZlY3RlZCBkb2N1bWVudHMsIG9yIGluIHRoZSB1cHNlcnQgY2FzZSwgYW4gb2JqZWN0XG4gICAgLy8gY29udGFpbmluZyB0aGUgbnVtYmVyIG9mIGFmZmVjdGVkIGRvY3MgYW5kIHRoZSBpZCBvZiB0aGUgZG9jIHRoYXQgd2FzXG4gICAgLy8gaW5zZXJ0ZWQsIGlmIGFueS5cbiAgICBsZXQgcmVzdWx0O1xuICAgIGlmIChvcHRpb25zLl9yZXR1cm5PYmplY3QpIHtcbiAgICAgIHJlc3VsdCA9IHsgbnVtYmVyQWZmZWN0ZWQ6IHVwZGF0ZUNvdW50IH07XG5cbiAgICAgIGlmIChpbnNlcnRlZElkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmVzdWx0Lmluc2VydGVkSWQgPSBpbnNlcnRlZElkO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQgPSB1cGRhdGVDb3VudDtcbiAgICB9XG5cbiAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgIE1ldGVvci5kZWZlcigoKSA9PiB7XG4gICAgICAgIGNhbGxiYWNrKG51bGwsIHJlc3VsdCk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gWFhYIGF0b21pY2l0eTogaWYgbXVsdGkgaXMgdHJ1ZSwgYW5kIG9uZSBtb2RpZmljYXRpb24gZmFpbHMsIGRvXG4gIC8vIHdlIHJvbGxiYWNrIHRoZSB3aG9sZSBvcGVyYXRpb24sIG9yIHdoYXQ/XG4gIGFzeW5jIHVwZGF0ZUFzeW5jKHNlbGVjdG9yLCBtb2QsIG9wdGlvbnMsIGNhbGxiYWNrKSB7XG4gICAgaWYgKCEgY2FsbGJhY2sgJiYgb3B0aW9ucyBpbnN0YW5jZW9mIEZ1bmN0aW9uKSB7XG4gICAgICBjYWxsYmFjayA9IG9wdGlvbnM7XG4gICAgICBvcHRpb25zID0gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAoIW9wdGlvbnMpIHtcbiAgICAgIG9wdGlvbnMgPSB7fTtcbiAgICB9XG5cbiAgICBjb25zdCBtYXRjaGVyID0gbmV3IE1pbmltb25nby5NYXRjaGVyKHNlbGVjdG9yLCB0cnVlKTtcblxuICAgIGNvbnN0IHFpZFRvT3JpZ2luYWxSZXN1bHRzID0gdGhpcy5wcmVwYXJlVXBkYXRlKHNlbGVjdG9yKTtcblxuICAgIGxldCByZWNvbXB1dGVRaWRzID0ge307XG5cbiAgICBsZXQgdXBkYXRlQ291bnQgPSAwO1xuXG4gICAgYXdhaXQgdGhpcy5fZWFjaFBvc3NpYmx5TWF0Y2hpbmdEb2NBc3luYyhzZWxlY3RvciwgYXN5bmMgKGRvYywgaWQpID0+IHtcbiAgICAgIGNvbnN0IHF1ZXJ5UmVzdWx0ID0gbWF0Y2hlci5kb2N1bWVudE1hdGNoZXMoZG9jKTtcblxuICAgICAgaWYgKHF1ZXJ5UmVzdWx0LnJlc3VsdCkge1xuICAgICAgICAvLyBYWFggU2hvdWxkIHdlIHNhdmUgdGhlIG9yaWdpbmFsIGV2ZW4gaWYgbW9kIGVuZHMgdXAgYmVpbmcgYSBuby1vcD9cbiAgICAgICAgdGhpcy5fc2F2ZU9yaWdpbmFsKGlkLCBkb2MpO1xuICAgICAgICByZWNvbXB1dGVRaWRzID0gYXdhaXQgdGhpcy5fbW9kaWZ5QW5kTm90aWZ5QXN5bmMoXG4gICAgICAgICAgZG9jLFxuICAgICAgICAgIG1vZCxcbiAgICAgICAgICBxdWVyeVJlc3VsdC5hcnJheUluZGljZXNcbiAgICAgICAgKTtcblxuICAgICAgICArK3VwZGF0ZUNvdW50O1xuXG4gICAgICAgIGlmICghb3B0aW9ucy5tdWx0aSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTsgLy8gYnJlYWtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9KTtcblxuICAgIE9iamVjdC5rZXlzKHJlY29tcHV0ZVFpZHMpLmZvckVhY2gocWlkID0+IHtcbiAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyaWVzW3FpZF07XG5cbiAgICAgIGlmIChxdWVyeSkge1xuICAgICAgICB0aGlzLl9yZWNvbXB1dGVSZXN1bHRzKHF1ZXJ5LCBxaWRUb09yaWdpbmFsUmVzdWx0c1txaWRdKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGF3YWl0IHRoaXMuX29ic2VydmVRdWV1ZS5kcmFpbigpO1xuXG4gICAgLy8gSWYgd2UgYXJlIGRvaW5nIGFuIHVwc2VydCwgYW5kIHdlIGRpZG4ndCBtb2RpZnkgYW55IGRvY3VtZW50cyB5ZXQsIHRoZW5cbiAgICAvLyBpdCdzIHRpbWUgdG8gZG8gYW4gaW5zZXJ0LiBGaWd1cmUgb3V0IHdoYXQgZG9jdW1lbnQgd2UgYXJlIGluc2VydGluZywgYW5kXG4gICAgLy8gZ2VuZXJhdGUgYW4gaWQgZm9yIGl0LlxuICAgIGxldCBpbnNlcnRlZElkO1xuICAgIGlmICh1cGRhdGVDb3VudCA9PT0gMCAmJiBvcHRpb25zLnVwc2VydCkge1xuICAgICAgY29uc3QgZG9jID0gTG9jYWxDb2xsZWN0aW9uLl9jcmVhdGVVcHNlcnREb2N1bWVudChzZWxlY3RvciwgbW9kKTtcbiAgICAgIGlmICghZG9jLl9pZCAmJiBvcHRpb25zLmluc2VydGVkSWQpIHtcbiAgICAgICAgZG9jLl9pZCA9IG9wdGlvbnMuaW5zZXJ0ZWRJZDtcbiAgICAgIH1cblxuICAgICAgaW5zZXJ0ZWRJZCA9IGF3YWl0IHRoaXMuaW5zZXJ0QXN5bmMoZG9jKTtcbiAgICAgIHVwZGF0ZUNvdW50ID0gMTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5maW5pc2hVcGRhdGUoe1xuICAgICAgb3B0aW9ucyxcbiAgICAgIGluc2VydGVkSWQsXG4gICAgICB1cGRhdGVDb3VudCxcbiAgICAgIGNhbGxiYWNrLFxuICAgIH0pO1xuICB9XG4gIC8vIFhYWCBhdG9taWNpdHk6IGlmIG11bHRpIGlzIHRydWUsIGFuZCBvbmUgbW9kaWZpY2F0aW9uIGZhaWxzLCBkb1xuICAvLyB3ZSByb2xsYmFjayB0aGUgd2hvbGUgb3BlcmF0aW9uLCBvciB3aGF0P1xuICB1cGRhdGUoc2VsZWN0b3IsIG1vZCwgb3B0aW9ucywgY2FsbGJhY2spIHtcbiAgICBpZiAoISBjYWxsYmFjayAmJiBvcHRpb25zIGluc3RhbmNlb2YgRnVuY3Rpb24pIHtcbiAgICAgIGNhbGxiYWNrID0gb3B0aW9ucztcbiAgICAgIG9wdGlvbnMgPSBudWxsO1xuICAgIH1cblxuICAgIGlmICghb3B0aW9ucykge1xuICAgICAgb3B0aW9ucyA9IHt9O1xuICAgIH1cblxuICAgIGNvbnN0IG1hdGNoZXIgPSBuZXcgTWluaW1vbmdvLk1hdGNoZXIoc2VsZWN0b3IsIHRydWUpO1xuXG4gICAgY29uc3QgcWlkVG9PcmlnaW5hbFJlc3VsdHMgPSB0aGlzLnByZXBhcmVVcGRhdGUoc2VsZWN0b3IpO1xuXG4gICAgbGV0IHJlY29tcHV0ZVFpZHMgPSB7fTtcblxuICAgIGxldCB1cGRhdGVDb3VudCA9IDA7XG5cbiAgICB0aGlzLl9lYWNoUG9zc2libHlNYXRjaGluZ0RvY1N5bmMoc2VsZWN0b3IsIChkb2MsIGlkKSA9PiB7XG4gICAgICBjb25zdCBxdWVyeVJlc3VsdCA9IG1hdGNoZXIuZG9jdW1lbnRNYXRjaGVzKGRvYyk7XG5cbiAgICAgIGlmIChxdWVyeVJlc3VsdC5yZXN1bHQpIHtcbiAgICAgICAgLy8gWFhYIFNob3VsZCB3ZSBzYXZlIHRoZSBvcmlnaW5hbCBldmVuIGlmIG1vZCBlbmRzIHVwIGJlaW5nIGEgbm8tb3A/XG4gICAgICAgIHRoaXMuX3NhdmVPcmlnaW5hbChpZCwgZG9jKTtcbiAgICAgICAgcmVjb21wdXRlUWlkcyA9IHRoaXMuX21vZGlmeUFuZE5vdGlmeVN5bmMoXG4gICAgICAgICAgZG9jLFxuICAgICAgICAgIG1vZCxcbiAgICAgICAgICBxdWVyeVJlc3VsdC5hcnJheUluZGljZXNcbiAgICAgICAgKTtcblxuICAgICAgICArK3VwZGF0ZUNvdW50O1xuXG4gICAgICAgIGlmICghb3B0aW9ucy5tdWx0aSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTsgLy8gYnJlYWtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9KTtcblxuICAgIE9iamVjdC5rZXlzKHJlY29tcHV0ZVFpZHMpLmZvckVhY2gocWlkID0+IHtcbiAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyaWVzW3FpZF07XG4gICAgICBpZiAocXVlcnkpIHtcbiAgICAgICAgdGhpcy5fcmVjb21wdXRlUmVzdWx0cyhxdWVyeSwgcWlkVG9PcmlnaW5hbFJlc3VsdHNbcWlkXSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICB0aGlzLl9vYnNlcnZlUXVldWUuZHJhaW4oKTtcblxuXG4gICAgLy8gSWYgd2UgYXJlIGRvaW5nIGFuIHVwc2VydCwgYW5kIHdlIGRpZG4ndCBtb2RpZnkgYW55IGRvY3VtZW50cyB5ZXQsIHRoZW5cbiAgICAvLyBpdCdzIHRpbWUgdG8gZG8gYW4gaW5zZXJ0LiBGaWd1cmUgb3V0IHdoYXQgZG9jdW1lbnQgd2UgYXJlIGluc2VydGluZywgYW5kXG4gICAgLy8gZ2VuZXJhdGUgYW4gaWQgZm9yIGl0LlxuICAgIGxldCBpbnNlcnRlZElkO1xuICAgIGlmICh1cGRhdGVDb3VudCA9PT0gMCAmJiBvcHRpb25zLnVwc2VydCkge1xuICAgICAgY29uc3QgZG9jID0gTG9jYWxDb2xsZWN0aW9uLl9jcmVhdGVVcHNlcnREb2N1bWVudChzZWxlY3RvciwgbW9kKTtcbiAgICAgIGlmICghZG9jLl9pZCAmJiBvcHRpb25zLmluc2VydGVkSWQpIHtcbiAgICAgICAgZG9jLl9pZCA9IG9wdGlvbnMuaW5zZXJ0ZWRJZDtcbiAgICAgIH1cblxuICAgICAgaW5zZXJ0ZWRJZCA9IHRoaXMuaW5zZXJ0KGRvYyk7XG4gICAgICB1cGRhdGVDb3VudCA9IDE7XG4gICAgfVxuXG5cbiAgICByZXR1cm4gdGhpcy5maW5pc2hVcGRhdGUoe1xuICAgICAgb3B0aW9ucyxcbiAgICAgIHVwZGF0ZUNvdW50LFxuICAgICAgY2FsbGJhY2ssXG4gICAgICBzZWxlY3RvcixcbiAgICAgIG1vZCxcbiAgICB9KTtcbiAgfVxuXG4gIC8vIEEgY29udmVuaWVuY2Ugd3JhcHBlciBvbiB1cGRhdGUuIExvY2FsQ29sbGVjdGlvbi51cHNlcnQoc2VsLCBtb2QpIGlzXG4gIC8vIGVxdWl2YWxlbnQgdG8gTG9jYWxDb2xsZWN0aW9uLnVwZGF0ZShzZWwsIG1vZCwge3Vwc2VydDogdHJ1ZSxcbiAgLy8gX3JldHVybk9iamVjdDogdHJ1ZX0pLlxuICB1cHNlcnQoc2VsZWN0b3IsIG1vZCwgb3B0aW9ucywgY2FsbGJhY2spIHtcbiAgICBpZiAoIWNhbGxiYWNrICYmIHR5cGVvZiBvcHRpb25zID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjYWxsYmFjayA9IG9wdGlvbnM7XG4gICAgICBvcHRpb25zID0ge307XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMudXBkYXRlKFxuICAgICAgc2VsZWN0b3IsXG4gICAgICBtb2QsXG4gICAgICBPYmplY3QuYXNzaWduKHt9LCBvcHRpb25zLCB7dXBzZXJ0OiB0cnVlLCBfcmV0dXJuT2JqZWN0OiB0cnVlfSksXG4gICAgICBjYWxsYmFja1xuICAgICk7XG4gIH1cblxuICB1cHNlcnRBc3luYyhzZWxlY3RvciwgbW9kLCBvcHRpb25zLCBjYWxsYmFjaykge1xuICAgIGlmICghY2FsbGJhY2sgJiYgdHlwZW9mIG9wdGlvbnMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGNhbGxiYWNrID0gb3B0aW9ucztcbiAgICAgIG9wdGlvbnMgPSB7fTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy51cGRhdGVBc3luYyhcbiAgICAgIHNlbGVjdG9yLFxuICAgICAgbW9kLFxuICAgICAgT2JqZWN0LmFzc2lnbih7fSwgb3B0aW9ucywge3Vwc2VydDogdHJ1ZSwgX3JldHVybk9iamVjdDogdHJ1ZX0pLFxuICAgICAgY2FsbGJhY2tcbiAgICApO1xuICB9XG5cbiAgLy8gSXRlcmF0ZXMgb3ZlciBhIHN1YnNldCBvZiBkb2N1bWVudHMgdGhhdCBjb3VsZCBtYXRjaCBzZWxlY3RvcjsgY2FsbHNcbiAgLy8gZm4oZG9jLCBpZCkgb24gZWFjaCBvZiB0aGVtLiAgU3BlY2lmaWNhbGx5LCBpZiBzZWxlY3RvciBzcGVjaWZpZXNcbiAgLy8gc3BlY2lmaWMgX2lkJ3MsIGl0IG9ubHkgbG9va3MgYXQgdGhvc2UuICBkb2MgaXMgKm5vdCogY2xvbmVkOiBpdCBpcyB0aGVcbiAgLy8gc2FtZSBvYmplY3QgdGhhdCBpcyBpbiBfZG9jcy5cbiAgYXN5bmMgX2VhY2hQb3NzaWJseU1hdGNoaW5nRG9jQXN5bmMoc2VsZWN0b3IsIGZuKSB7XG4gICAgY29uc3Qgc3BlY2lmaWNJZHMgPSBMb2NhbENvbGxlY3Rpb24uX2lkc01hdGNoZWRCeVNlbGVjdG9yKHNlbGVjdG9yKTtcblxuICAgIGlmIChzcGVjaWZpY0lkcykge1xuICAgICAgZm9yIChjb25zdCBpZCBvZiBzcGVjaWZpY0lkcykge1xuICAgICAgICBjb25zdCBkb2MgPSB0aGlzLl9kb2NzLmdldChpZCk7XG5cbiAgICAgICAgaWYgKGRvYyAmJiAhIChhd2FpdCBmbihkb2MsIGlkKSkpIHtcbiAgICAgICAgICBicmVha1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGF3YWl0IHRoaXMuX2RvY3MuZm9yRWFjaEFzeW5jKGZuKTtcbiAgICB9XG4gIH1cbiAgX2VhY2hQb3NzaWJseU1hdGNoaW5nRG9jU3luYyhzZWxlY3RvciwgZm4pIHtcbiAgICBjb25zdCBzcGVjaWZpY0lkcyA9IExvY2FsQ29sbGVjdGlvbi5faWRzTWF0Y2hlZEJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuXG4gICAgaWYgKHNwZWNpZmljSWRzKSB7XG4gICAgICBmb3IgKGNvbnN0IGlkIG9mIHNwZWNpZmljSWRzKSB7XG4gICAgICAgIGNvbnN0IGRvYyA9IHRoaXMuX2RvY3MuZ2V0KGlkKTtcblxuICAgICAgICBpZiAoZG9jICYmICFmbihkb2MsIGlkKSkge1xuICAgICAgICAgIGJyZWFrXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5fZG9jcy5mb3JFYWNoKGZuKTtcbiAgICB9XG4gIH1cblxuICBfZ2V0TWF0Y2hlZERvY0FuZE1vZGlmeShkb2MsIG1vZCwgYXJyYXlJbmRpY2VzKSB7XG4gICAgY29uc3QgbWF0Y2hlZF9iZWZvcmUgPSB7fTtcblxuICAgIE9iamVjdC5rZXlzKHRoaXMucXVlcmllcykuZm9yRWFjaChxaWQgPT4ge1xuICAgICAgY29uc3QgcXVlcnkgPSB0aGlzLnF1ZXJpZXNbcWlkXTtcblxuICAgICAgaWYgKHF1ZXJ5LmRpcnR5KSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKHF1ZXJ5Lm9yZGVyZWQpIHtcbiAgICAgICAgbWF0Y2hlZF9iZWZvcmVbcWlkXSA9IHF1ZXJ5Lm1hdGNoZXIuZG9jdW1lbnRNYXRjaGVzKGRvYykucmVzdWx0O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gQmVjYXVzZSB3ZSBkb24ndCBzdXBwb3J0IHNraXAgb3IgbGltaXQgKHlldCkgaW4gdW5vcmRlcmVkIHF1ZXJpZXMsIHdlXG4gICAgICAgIC8vIGNhbiBqdXN0IGRvIGEgZGlyZWN0IGxvb2t1cC5cbiAgICAgICAgbWF0Y2hlZF9iZWZvcmVbcWlkXSA9IHF1ZXJ5LnJlc3VsdHMuaGFzKGRvYy5faWQpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIG1hdGNoZWRfYmVmb3JlO1xuICB9XG5cbiAgX21vZGlmeUFuZE5vdGlmeVN5bmMoZG9jLCBtb2QsIGFycmF5SW5kaWNlcykge1xuXG4gICAgY29uc3QgbWF0Y2hlZF9iZWZvcmUgPSB0aGlzLl9nZXRNYXRjaGVkRG9jQW5kTW9kaWZ5KGRvYywgbW9kLCBhcnJheUluZGljZXMpO1xuXG4gICAgY29uc3Qgb2xkX2RvYyA9IEVKU09OLmNsb25lKGRvYyk7XG4gICAgTG9jYWxDb2xsZWN0aW9uLl9tb2RpZnkoZG9jLCBtb2QsIHthcnJheUluZGljZXN9KTtcblxuICAgIGNvbnN0IHJlY29tcHV0ZVFpZHMgPSB7fTtcblxuICAgIGZvciAoY29uc3QgcWlkIG9mIE9iamVjdC5rZXlzKHRoaXMucXVlcmllcykpIHtcbiAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyaWVzW3FpZF07XG5cbiAgICAgIGlmIChxdWVyeS5kaXJ0eSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgYWZ0ZXJNYXRjaCA9IHF1ZXJ5Lm1hdGNoZXIuZG9jdW1lbnRNYXRjaGVzKGRvYyk7XG4gICAgICBjb25zdCBhZnRlciA9IGFmdGVyTWF0Y2gucmVzdWx0O1xuICAgICAgY29uc3QgYmVmb3JlID0gbWF0Y2hlZF9iZWZvcmVbcWlkXTtcblxuICAgICAgaWYgKGFmdGVyICYmIHF1ZXJ5LmRpc3RhbmNlcyAmJiBhZnRlck1hdGNoLmRpc3RhbmNlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcXVlcnkuZGlzdGFuY2VzLnNldChkb2MuX2lkLCBhZnRlck1hdGNoLmRpc3RhbmNlKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHF1ZXJ5LmN1cnNvci5za2lwIHx8IHF1ZXJ5LmN1cnNvci5saW1pdCkge1xuICAgICAgICAvLyBXZSBuZWVkIHRvIHJlY29tcHV0ZSBhbnkgcXVlcnkgd2hlcmUgdGhlIGRvYyBtYXkgaGF2ZSBiZWVuIGluIHRoZVxuICAgICAgICAvLyBjdXJzb3IncyB3aW5kb3cgZWl0aGVyIGJlZm9yZSBvciBhZnRlciB0aGUgdXBkYXRlLiAoTm90ZSB0aGF0IGlmIHNraXBcbiAgICAgICAgLy8gb3IgbGltaXQgaXMgc2V0LCBcImJlZm9yZVwiIGFuZCBcImFmdGVyXCIgYmVpbmcgdHJ1ZSBkbyBub3QgbmVjZXNzYXJpbHlcbiAgICAgICAgLy8gbWVhbiB0aGF0IHRoZSBkb2N1bWVudCBpcyBpbiB0aGUgY3Vyc29yJ3Mgb3V0cHV0IGFmdGVyIHNraXAvbGltaXQgaXNcbiAgICAgICAgLy8gYXBwbGllZC4uLiBidXQgaWYgdGhleSBhcmUgZmFsc2UsIHRoZW4gdGhlIGRvY3VtZW50IGRlZmluaXRlbHkgaXMgTk9UXG4gICAgICAgIC8vIGluIHRoZSBvdXRwdXQuIFNvIGl0J3Mgc2FmZSB0byBza2lwIHJlY29tcHV0ZSBpZiBuZWl0aGVyIGJlZm9yZSBvclxuICAgICAgICAvLyBhZnRlciBhcmUgdHJ1ZS4pXG4gICAgICAgIGlmIChiZWZvcmUgfHwgYWZ0ZXIpIHtcbiAgICAgICAgICByZWNvbXB1dGVRaWRzW3FpZF0gPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGJlZm9yZSAmJiAhYWZ0ZXIpIHtcbiAgICAgICAgTG9jYWxDb2xsZWN0aW9uLl9yZW1vdmVGcm9tUmVzdWx0c1N5bmMocXVlcnksIGRvYyk7XG4gICAgICB9IGVsc2UgaWYgKCFiZWZvcmUgJiYgYWZ0ZXIpIHtcbiAgICAgICAgTG9jYWxDb2xsZWN0aW9uLl9pbnNlcnRJblJlc3VsdHNTeW5jKHF1ZXJ5LCBkb2MpO1xuICAgICAgfSBlbHNlIGlmIChiZWZvcmUgJiYgYWZ0ZXIpIHtcbiAgICAgICAgTG9jYWxDb2xsZWN0aW9uLl91cGRhdGVJblJlc3VsdHNTeW5jKHF1ZXJ5LCBkb2MsIG9sZF9kb2MpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVjb21wdXRlUWlkcztcbiAgfVxuXG4gIGFzeW5jIF9tb2RpZnlBbmROb3RpZnlBc3luYyhkb2MsIG1vZCwgYXJyYXlJbmRpY2VzKSB7XG5cbiAgICBjb25zdCBtYXRjaGVkX2JlZm9yZSA9IHRoaXMuX2dldE1hdGNoZWREb2NBbmRNb2RpZnkoZG9jLCBtb2QsIGFycmF5SW5kaWNlcyk7XG5cbiAgICBjb25zdCBvbGRfZG9jID0gRUpTT04uY2xvbmUoZG9jKTtcbiAgICBMb2NhbENvbGxlY3Rpb24uX21vZGlmeShkb2MsIG1vZCwge2FycmF5SW5kaWNlc30pO1xuXG4gICAgY29uc3QgcmVjb21wdXRlUWlkcyA9IHt9O1xuICAgIGZvciAoY29uc3QgcWlkIG9mIE9iamVjdC5rZXlzKHRoaXMucXVlcmllcykpIHtcbiAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyaWVzW3FpZF07XG5cbiAgICAgIGlmIChxdWVyeS5kaXJ0eSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgYWZ0ZXJNYXRjaCA9IHF1ZXJ5Lm1hdGNoZXIuZG9jdW1lbnRNYXRjaGVzKGRvYyk7XG4gICAgICBjb25zdCBhZnRlciA9IGFmdGVyTWF0Y2gucmVzdWx0O1xuICAgICAgY29uc3QgYmVmb3JlID0gbWF0Y2hlZF9iZWZvcmVbcWlkXTtcblxuICAgICAgaWYgKGFmdGVyICYmIHF1ZXJ5LmRpc3RhbmNlcyAmJiBhZnRlck1hdGNoLmRpc3RhbmNlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcXVlcnkuZGlzdGFuY2VzLnNldChkb2MuX2lkLCBhZnRlck1hdGNoLmRpc3RhbmNlKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHF1ZXJ5LmN1cnNvci5za2lwIHx8IHF1ZXJ5LmN1cnNvci5saW1pdCkge1xuICAgICAgICAvLyBXZSBuZWVkIHRvIHJlY29tcHV0ZSBhbnkgcXVlcnkgd2hlcmUgdGhlIGRvYyBtYXkgaGF2ZSBiZWVuIGluIHRoZVxuICAgICAgICAvLyBjdXJzb3IncyB3aW5kb3cgZWl0aGVyIGJlZm9yZSBvciBhZnRlciB0aGUgdXBkYXRlLiAoTm90ZSB0aGF0IGlmIHNraXBcbiAgICAgICAgLy8gb3IgbGltaXQgaXMgc2V0LCBcImJlZm9yZVwiIGFuZCBcImFmdGVyXCIgYmVpbmcgdHJ1ZSBkbyBub3QgbmVjZXNzYXJpbHlcbiAgICAgICAgLy8gbWVhbiB0aGF0IHRoZSBkb2N1bWVudCBpcyBpbiB0aGUgY3Vyc29yJ3Mgb3V0cHV0IGFmdGVyIHNraXAvbGltaXQgaXNcbiAgICAgICAgLy8gYXBwbGllZC4uLiBidXQgaWYgdGhleSBhcmUgZmFsc2UsIHRoZW4gdGhlIGRvY3VtZW50IGRlZmluaXRlbHkgaXMgTk9UXG4gICAgICAgIC8vIGluIHRoZSBvdXRwdXQuIFNvIGl0J3Mgc2FmZSB0byBza2lwIHJlY29tcHV0ZSBpZiBuZWl0aGVyIGJlZm9yZSBvclxuICAgICAgICAvLyBhZnRlciBhcmUgdHJ1ZS4pXG4gICAgICAgIGlmIChiZWZvcmUgfHwgYWZ0ZXIpIHtcbiAgICAgICAgICByZWNvbXB1dGVRaWRzW3FpZF0gPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGJlZm9yZSAmJiAhYWZ0ZXIpIHtcbiAgICAgICAgYXdhaXQgTG9jYWxDb2xsZWN0aW9uLl9yZW1vdmVGcm9tUmVzdWx0c0FzeW5jKHF1ZXJ5LCBkb2MpO1xuICAgICAgfSBlbHNlIGlmICghYmVmb3JlICYmIGFmdGVyKSB7XG4gICAgICAgIGF3YWl0IExvY2FsQ29sbGVjdGlvbi5faW5zZXJ0SW5SZXN1bHRzQXN5bmMocXVlcnksIGRvYyk7XG4gICAgICB9IGVsc2UgaWYgKGJlZm9yZSAmJiBhZnRlcikge1xuICAgICAgICBhd2FpdCBMb2NhbENvbGxlY3Rpb24uX3VwZGF0ZUluUmVzdWx0c0FzeW5jKHF1ZXJ5LCBkb2MsIG9sZF9kb2MpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVjb21wdXRlUWlkcztcbiAgfVxuXG4gIC8vIFJlY29tcHV0ZXMgdGhlIHJlc3VsdHMgb2YgYSBxdWVyeSBhbmQgcnVucyBvYnNlcnZlIGNhbGxiYWNrcyBmb3IgdGhlXG4gIC8vIGRpZmZlcmVuY2UgYmV0d2VlbiB0aGUgcHJldmlvdXMgcmVzdWx0cyBhbmQgdGhlIGN1cnJlbnQgcmVzdWx0cyAodW5sZXNzXG4gIC8vIHBhdXNlZCkuIFVzZWQgZm9yIHNraXAvbGltaXQgcXVlcmllcy5cbiAgLy9cbiAgLy8gV2hlbiB0aGlzIGlzIHVzZWQgYnkgaW5zZXJ0IG9yIHJlbW92ZSwgaXQgY2FuIGp1c3QgdXNlIHF1ZXJ5LnJlc3VsdHMgZm9yXG4gIC8vIHRoZSBvbGQgcmVzdWx0cyAoYW5kIHRoZXJlJ3Mgbm8gbmVlZCB0byBwYXNzIGluIG9sZFJlc3VsdHMpLCBiZWNhdXNlIHRoZXNlXG4gIC8vIG9wZXJhdGlvbnMgZG9uJ3QgbXV0YXRlIHRoZSBkb2N1bWVudHMgaW4gdGhlIGNvbGxlY3Rpb24uIFVwZGF0ZSBuZWVkcyB0b1xuICAvLyBwYXNzIGluIGFuIG9sZFJlc3VsdHMgd2hpY2ggd2FzIGRlZXAtY29waWVkIGJlZm9yZSB0aGUgbW9kaWZpZXIgd2FzXG4gIC8vIGFwcGxpZWQuXG4gIC8vXG4gIC8vIG9sZFJlc3VsdHMgaXMgZ3VhcmFudGVlZCB0byBiZSBpZ25vcmVkIGlmIHRoZSBxdWVyeSBpcyBub3QgcGF1c2VkLlxuICBfcmVjb21wdXRlUmVzdWx0cyhxdWVyeSwgb2xkUmVzdWx0cykge1xuICAgIGlmICh0aGlzLnBhdXNlZCkge1xuICAgICAgLy8gVGhlcmUncyBubyByZWFzb24gdG8gcmVjb21wdXRlIHRoZSByZXN1bHRzIG5vdyBhcyB3ZSdyZSBzdGlsbCBwYXVzZWQuXG4gICAgICAvLyBCeSBmbGFnZ2luZyB0aGUgcXVlcnkgYXMgXCJkaXJ0eVwiLCB0aGUgcmVjb21wdXRlIHdpbGwgYmUgcGVyZm9ybWVkXG4gICAgICAvLyB3aGVuIHJlc3VtZU9ic2VydmVycyBpcyBjYWxsZWQuXG4gICAgICBxdWVyeS5kaXJ0eSA9IHRydWU7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnBhdXNlZCAmJiAhb2xkUmVzdWx0cykge1xuICAgICAgb2xkUmVzdWx0cyA9IHF1ZXJ5LnJlc3VsdHM7XG4gICAgfVxuXG4gICAgaWYgKHF1ZXJ5LmRpc3RhbmNlcykge1xuICAgICAgcXVlcnkuZGlzdGFuY2VzLmNsZWFyKCk7XG4gICAgfVxuXG4gICAgcXVlcnkucmVzdWx0cyA9IHF1ZXJ5LmN1cnNvci5fZ2V0UmF3T2JqZWN0cyh7XG4gICAgICBkaXN0YW5jZXM6IHF1ZXJ5LmRpc3RhbmNlcyxcbiAgICAgIG9yZGVyZWQ6IHF1ZXJ5Lm9yZGVyZWRcbiAgICB9KTtcblxuICAgIGlmICghdGhpcy5wYXVzZWQpIHtcbiAgICAgIExvY2FsQ29sbGVjdGlvbi5fZGlmZlF1ZXJ5Q2hhbmdlcyhcbiAgICAgICAgcXVlcnkub3JkZXJlZCxcbiAgICAgICAgb2xkUmVzdWx0cyxcbiAgICAgICAgcXVlcnkucmVzdWx0cyxcbiAgICAgICAgcXVlcnksXG4gICAgICAgIHtwcm9qZWN0aW9uRm46IHF1ZXJ5LnByb2plY3Rpb25Gbn1cbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgX3NhdmVPcmlnaW5hbChpZCwgZG9jKSB7XG4gICAgLy8gQXJlIHdlIGV2ZW4gdHJ5aW5nIHRvIHNhdmUgb3JpZ2luYWxzP1xuICAgIGlmICghdGhpcy5fc2F2ZWRPcmlnaW5hbHMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBIYXZlIHdlIHByZXZpb3VzbHkgbXV0YXRlZCB0aGUgb3JpZ2luYWwgKGFuZCBzbyAnZG9jJyBpcyBub3QgYWN0dWFsbHlcbiAgICAvLyBvcmlnaW5hbCk/ICAoTm90ZSB0aGUgJ2hhcycgY2hlY2sgcmF0aGVyIHRoYW4gdHJ1dGg6IHdlIHN0b3JlIHVuZGVmaW5lZFxuICAgIC8vIGhlcmUgZm9yIGluc2VydGVkIGRvY3MhKVxuICAgIGlmICh0aGlzLl9zYXZlZE9yaWdpbmFscy5oYXMoaWQpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5fc2F2ZWRPcmlnaW5hbHMuc2V0KGlkLCBFSlNPTi5jbG9uZShkb2MpKTtcbiAgfVxufVxuXG5Mb2NhbENvbGxlY3Rpb24uQ3Vyc29yID0gQ3Vyc29yO1xuXG5Mb2NhbENvbGxlY3Rpb24uT2JzZXJ2ZUhhbmRsZSA9IE9ic2VydmVIYW5kbGU7XG5cbi8vIFhYWCBtYXliZSBtb3ZlIHRoZXNlIGludG8gYW5vdGhlciBPYnNlcnZlSGVscGVycyBwYWNrYWdlIG9yIHNvbWV0aGluZ1xuXG4vLyBfQ2FjaGluZ0NoYW5nZU9ic2VydmVyIGlzIGFuIG9iamVjdCB3aGljaCByZWNlaXZlcyBvYnNlcnZlQ2hhbmdlcyBjYWxsYmFja3Ncbi8vIGFuZCBrZWVwcyBhIGNhY2hlIG9mIHRoZSBjdXJyZW50IGN1cnNvciBzdGF0ZSB1cCB0byBkYXRlIGluIHRoaXMuZG9jcy4gVXNlcnNcbi8vIG9mIHRoaXMgY2xhc3Mgc2hvdWxkIHJlYWQgdGhlIGRvY3MgZmllbGQgYnV0IG5vdCBtb2RpZnkgaXQuIFlvdSBzaG91bGQgcGFzc1xuLy8gdGhlIFwiYXBwbHlDaGFuZ2VcIiBmaWVsZCBhcyB0aGUgY2FsbGJhY2tzIHRvIHRoZSB1bmRlcmx5aW5nIG9ic2VydmVDaGFuZ2VzXG4vLyBjYWxsLiBPcHRpb25hbGx5LCB5b3UgY2FuIHNwZWNpZnkgeW91ciBvd24gb2JzZXJ2ZUNoYW5nZXMgY2FsbGJhY2tzIHdoaWNoIGFyZVxuLy8gaW52b2tlZCBpbW1lZGlhdGVseSBiZWZvcmUgdGhlIGRvY3MgZmllbGQgaXMgdXBkYXRlZDsgdGhpcyBvYmplY3QgaXMgbWFkZVxuLy8gYXZhaWxhYmxlIGFzIGB0aGlzYCB0byB0aG9zZSBjYWxsYmFja3MuXG5Mb2NhbENvbGxlY3Rpb24uX0NhY2hpbmdDaGFuZ2VPYnNlcnZlciA9IGNsYXNzIF9DYWNoaW5nQ2hhbmdlT2JzZXJ2ZXIge1xuICBjb25zdHJ1Y3RvcihvcHRpb25zID0ge30pIHtcbiAgICBjb25zdCBvcmRlcmVkRnJvbUNhbGxiYWNrcyA9IChcbiAgICAgIG9wdGlvbnMuY2FsbGJhY2tzICYmXG4gICAgICBMb2NhbENvbGxlY3Rpb24uX29ic2VydmVDaGFuZ2VzQ2FsbGJhY2tzQXJlT3JkZXJlZChvcHRpb25zLmNhbGxiYWNrcylcbiAgICApO1xuXG4gICAgaWYgKGhhc093bi5jYWxsKG9wdGlvbnMsICdvcmRlcmVkJykpIHtcbiAgICAgIHRoaXMub3JkZXJlZCA9IG9wdGlvbnMub3JkZXJlZDtcblxuICAgICAgaWYgKG9wdGlvbnMuY2FsbGJhY2tzICYmIG9wdGlvbnMub3JkZXJlZCAhPT0gb3JkZXJlZEZyb21DYWxsYmFja3MpIHtcbiAgICAgICAgdGhyb3cgRXJyb3IoJ29yZGVyZWQgb3B0aW9uIGRvZXNuXFwndCBtYXRjaCBjYWxsYmFja3MnKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKG9wdGlvbnMuY2FsbGJhY2tzKSB7XG4gICAgICB0aGlzLm9yZGVyZWQgPSBvcmRlcmVkRnJvbUNhbGxiYWNrcztcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgRXJyb3IoJ211c3QgcHJvdmlkZSBvcmRlcmVkIG9yIGNhbGxiYWNrcycpO1xuICAgIH1cblxuICAgIGNvbnN0IGNhbGxiYWNrcyA9IG9wdGlvbnMuY2FsbGJhY2tzIHx8IHt9O1xuXG4gICAgaWYgKHRoaXMub3JkZXJlZCkge1xuICAgICAgdGhpcy5kb2NzID0gbmV3IE9yZGVyZWREaWN0KE1vbmdvSUQuaWRTdHJpbmdpZnkpO1xuICAgICAgdGhpcy5hcHBseUNoYW5nZSA9IHtcbiAgICAgICAgYWRkZWRCZWZvcmU6IChpZCwgZmllbGRzLCBiZWZvcmUpID0+IHtcbiAgICAgICAgICAvLyBUYWtlIGEgc2hhbGxvdyBjb3B5IHNpbmNlIHRoZSB0b3AtbGV2ZWwgcHJvcGVydGllcyBjYW4gYmUgY2hhbmdlZFxuICAgICAgICAgIGNvbnN0IGRvYyA9IHsgLi4uZmllbGRzIH07XG5cbiAgICAgICAgICBkb2MuX2lkID0gaWQ7XG5cbiAgICAgICAgICBpZiAoY2FsbGJhY2tzLmFkZGVkQmVmb3JlKSB7XG4gICAgICAgICAgICBjYWxsYmFja3MuYWRkZWRCZWZvcmUuY2FsbCh0aGlzLCBpZCwgRUpTT04uY2xvbmUoZmllbGRzKSwgYmVmb3JlKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBUaGlzIGxpbmUgdHJpZ2dlcnMgaWYgd2UgcHJvdmlkZSBhZGRlZCB3aXRoIG1vdmVkQmVmb3JlLlxuICAgICAgICAgIGlmIChjYWxsYmFja3MuYWRkZWQpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrcy5hZGRlZC5jYWxsKHRoaXMsIGlkLCBFSlNPTi5jbG9uZShmaWVsZHMpKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBYWFggY291bGQgYGJlZm9yZWAgYmUgYSBmYWxzeSBJRD8gIFRlY2huaWNhbGx5XG4gICAgICAgICAgLy8gaWRTdHJpbmdpZnkgc2VlbXMgdG8gYWxsb3cgZm9yIHRoZW0gLS0gdGhvdWdoXG4gICAgICAgICAgLy8gT3JkZXJlZERpY3Qgd29uJ3QgY2FsbCBzdHJpbmdpZnkgb24gYSBmYWxzeSBhcmcuXG4gICAgICAgICAgdGhpcy5kb2NzLnB1dEJlZm9yZShpZCwgZG9jLCBiZWZvcmUgfHwgbnVsbCk7XG4gICAgICAgIH0sXG4gICAgICAgIG1vdmVkQmVmb3JlOiAoaWQsIGJlZm9yZSkgPT4ge1xuICAgICAgICAgIGlmIChjYWxsYmFja3MubW92ZWRCZWZvcmUpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrcy5tb3ZlZEJlZm9yZS5jYWxsKHRoaXMsIGlkLCBiZWZvcmUpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRoaXMuZG9jcy5tb3ZlQmVmb3JlKGlkLCBiZWZvcmUgfHwgbnVsbCk7XG4gICAgICAgIH0sXG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmRvY3MgPSBuZXcgTG9jYWxDb2xsZWN0aW9uLl9JZE1hcDtcbiAgICAgIHRoaXMuYXBwbHlDaGFuZ2UgPSB7XG4gICAgICAgIGFkZGVkOiAoaWQsIGZpZWxkcykgPT4ge1xuICAgICAgICAgIC8vIFRha2UgYSBzaGFsbG93IGNvcHkgc2luY2UgdGhlIHRvcC1sZXZlbCBwcm9wZXJ0aWVzIGNhbiBiZSBjaGFuZ2VkXG4gICAgICAgICAgY29uc3QgZG9jID0geyAuLi5maWVsZHMgfTtcblxuICAgICAgICAgIGlmIChjYWxsYmFja3MuYWRkZWQpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrcy5hZGRlZC5jYWxsKHRoaXMsIGlkLCBFSlNPTi5jbG9uZShmaWVsZHMpKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBkb2MuX2lkID0gaWQ7XG5cbiAgICAgICAgICB0aGlzLmRvY3Muc2V0KGlkLCAgZG9jKTtcbiAgICAgICAgfSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gVGhlIG1ldGhvZHMgaW4gX0lkTWFwIGFuZCBPcmRlcmVkRGljdCB1c2VkIGJ5IHRoZXNlIGNhbGxiYWNrcyBhcmVcbiAgICAvLyBpZGVudGljYWwuXG4gICAgdGhpcy5hcHBseUNoYW5nZS5jaGFuZ2VkID0gKGlkLCBmaWVsZHMpID0+IHtcbiAgICAgIGNvbnN0IGRvYyA9IHRoaXMuZG9jcy5nZXQoaWQpO1xuXG4gICAgICBpZiAoIWRvYykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gaWQgZm9yIGNoYW5nZWQ6ICR7aWR9YCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChjYWxsYmFja3MuY2hhbmdlZCkge1xuICAgICAgICBjYWxsYmFja3MuY2hhbmdlZC5jYWxsKHRoaXMsIGlkLCBFSlNPTi5jbG9uZShmaWVsZHMpKTtcbiAgICAgIH1cblxuICAgICAgRGlmZlNlcXVlbmNlLmFwcGx5Q2hhbmdlcyhkb2MsIGZpZWxkcyk7XG4gICAgfTtcblxuICAgIHRoaXMuYXBwbHlDaGFuZ2UucmVtb3ZlZCA9IGlkID0+IHtcbiAgICAgIGlmIChjYWxsYmFja3MucmVtb3ZlZCkge1xuICAgICAgICBjYWxsYmFja3MucmVtb3ZlZC5jYWxsKHRoaXMsIGlkKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5kb2NzLnJlbW92ZShpZCk7XG4gICAgfTtcbiAgfVxufTtcblxuTG9jYWxDb2xsZWN0aW9uLl9JZE1hcCA9IGNsYXNzIF9JZE1hcCBleHRlbmRzIElkTWFwIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoTW9uZ29JRC5pZFN0cmluZ2lmeSwgTW9uZ29JRC5pZFBhcnNlKTtcbiAgfVxufTtcblxuLy8gV3JhcCBhIHRyYW5zZm9ybSBmdW5jdGlvbiB0byByZXR1cm4gb2JqZWN0cyB0aGF0IGhhdmUgdGhlIF9pZCBmaWVsZFxuLy8gb2YgdGhlIHVudHJhbnNmb3JtZWQgZG9jdW1lbnQuIFRoaXMgZW5zdXJlcyB0aGF0IHN1YnN5c3RlbXMgc3VjaCBhc1xuLy8gdGhlIG9ic2VydmUtc2VxdWVuY2UgcGFja2FnZSB0aGF0IGNhbGwgYG9ic2VydmVgIGNhbiBrZWVwIHRyYWNrIG9mXG4vLyB0aGUgZG9jdW1lbnRzIGlkZW50aXRpZXMuXG4vL1xuLy8gLSBSZXF1aXJlIHRoYXQgaXQgcmV0dXJucyBvYmplY3RzXG4vLyAtIElmIHRoZSByZXR1cm4gdmFsdWUgaGFzIGFuIF9pZCBmaWVsZCwgdmVyaWZ5IHRoYXQgaXQgbWF0Y2hlcyB0aGVcbi8vICAgb3JpZ2luYWwgX2lkIGZpZWxkXG4vLyAtIElmIHRoZSByZXR1cm4gdmFsdWUgZG9lc24ndCBoYXZlIGFuIF9pZCBmaWVsZCwgYWRkIGl0IGJhY2suXG5Mb2NhbENvbGxlY3Rpb24ud3JhcFRyYW5zZm9ybSA9IHRyYW5zZm9ybSA9PiB7XG4gIGlmICghdHJhbnNmb3JtKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICAvLyBObyBuZWVkIHRvIGRvdWJseS13cmFwIHRyYW5zZm9ybXMuXG4gIGlmICh0cmFuc2Zvcm0uX193cmFwcGVkVHJhbnNmb3JtX18pIHtcbiAgICByZXR1cm4gdHJhbnNmb3JtO1xuICB9XG5cbiAgY29uc3Qgd3JhcHBlZCA9IGRvYyA9PiB7XG4gICAgaWYgKCFoYXNPd24uY2FsbChkb2MsICdfaWQnKSkge1xuICAgICAgLy8gWFhYIGRvIHdlIGV2ZXIgaGF2ZSBhIHRyYW5zZm9ybSBvbiB0aGUgb3Bsb2cncyBjb2xsZWN0aW9uPyBiZWNhdXNlIHRoYXRcbiAgICAgIC8vIGNvbGxlY3Rpb24gaGFzIG5vIF9pZC5cbiAgICAgIHRocm93IG5ldyBFcnJvcignY2FuIG9ubHkgdHJhbnNmb3JtIGRvY3VtZW50cyB3aXRoIF9pZCcpO1xuICAgIH1cblxuICAgIGNvbnN0IGlkID0gZG9jLl9pZDtcblxuICAgIC8vIFhYWCBjb25zaWRlciBtYWtpbmcgdHJhY2tlciBhIHdlYWsgZGVwZW5kZW5jeSBhbmQgY2hlY2tpbmdcbiAgICAvLyBQYWNrYWdlLnRyYWNrZXIgaGVyZVxuICAgIGNvbnN0IHRyYW5zZm9ybWVkID0gVHJhY2tlci5ub25yZWFjdGl2ZSgoKSA9PiB0cmFuc2Zvcm0oZG9jKSk7XG5cbiAgICBpZiAoIUxvY2FsQ29sbGVjdGlvbi5faXNQbGFpbk9iamVjdCh0cmFuc2Zvcm1lZCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcigndHJhbnNmb3JtIG11c3QgcmV0dXJuIG9iamVjdCcpO1xuICAgIH1cblxuICAgIGlmIChoYXNPd24uY2FsbCh0cmFuc2Zvcm1lZCwgJ19pZCcpKSB7XG4gICAgICBpZiAoIUVKU09OLmVxdWFscyh0cmFuc2Zvcm1lZC5faWQsIGlkKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3RyYW5zZm9ybWVkIGRvY3VtZW50IGNhblxcJ3QgaGF2ZSBkaWZmZXJlbnQgX2lkJyk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRyYW5zZm9ybWVkLl9pZCA9IGlkO1xuICAgIH1cblxuICAgIHJldHVybiB0cmFuc2Zvcm1lZDtcbiAgfTtcblxuICB3cmFwcGVkLl9fd3JhcHBlZFRyYW5zZm9ybV9fID0gdHJ1ZTtcblxuICByZXR1cm4gd3JhcHBlZDtcbn07XG5cbi8vIFhYWCB0aGUgc29ydGVkLXF1ZXJ5IGxvZ2ljIGJlbG93IGlzIGxhdWdoYWJseSBpbmVmZmljaWVudC4gd2UnbGxcbi8vIG5lZWQgdG8gY29tZSB1cCB3aXRoIGEgYmV0dGVyIGRhdGFzdHJ1Y3R1cmUgZm9yIHRoaXMuXG4vL1xuLy8gWFhYIHRoZSBsb2dpYyBmb3Igb2JzZXJ2aW5nIHdpdGggYSBza2lwIG9yIGEgbGltaXQgaXMgZXZlbiBtb3JlXG4vLyBsYXVnaGFibHkgaW5lZmZpY2llbnQuIHdlIHJlY29tcHV0ZSB0aGUgd2hvbGUgcmVzdWx0cyBldmVyeSB0aW1lIVxuXG4vLyBUaGlzIGJpbmFyeSBzZWFyY2ggcHV0cyBhIHZhbHVlIGJldHdlZW4gYW55IGVxdWFsIHZhbHVlcywgYW5kIHRoZSBmaXJzdFxuLy8gbGVzc2VyIHZhbHVlLlxuTG9jYWxDb2xsZWN0aW9uLl9iaW5hcnlTZWFyY2ggPSAoY21wLCBhcnJheSwgdmFsdWUpID0+IHtcbiAgbGV0IGZpcnN0ID0gMDtcbiAgbGV0IHJhbmdlID0gYXJyYXkubGVuZ3RoO1xuXG4gIHdoaWxlIChyYW5nZSA+IDApIHtcbiAgICBjb25zdCBoYWxmUmFuZ2UgPSBNYXRoLmZsb29yKHJhbmdlIC8gMik7XG5cbiAgICBpZiAoY21wKHZhbHVlLCBhcnJheVtmaXJzdCArIGhhbGZSYW5nZV0pID49IDApIHtcbiAgICAgIGZpcnN0ICs9IGhhbGZSYW5nZSArIDE7XG4gICAgICByYW5nZSAtPSBoYWxmUmFuZ2UgKyAxO1xuICAgIH0gZWxzZSB7XG4gICAgICByYW5nZSA9IGhhbGZSYW5nZTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZmlyc3Q7XG59O1xuXG5Mb2NhbENvbGxlY3Rpb24uX2NoZWNrU3VwcG9ydGVkUHJvamVjdGlvbiA9IGZpZWxkcyA9PiB7XG4gIGlmIChmaWVsZHMgIT09IE9iamVjdChmaWVsZHMpIHx8IEFycmF5LmlzQXJyYXkoZmllbGRzKSkge1xuICAgIHRocm93IE1pbmltb25nb0Vycm9yKCdmaWVsZHMgb3B0aW9uIG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gIH1cblxuICBPYmplY3Qua2V5cyhmaWVsZHMpLmZvckVhY2goa2V5UGF0aCA9PiB7XG4gICAgaWYgKGtleVBhdGguc3BsaXQoJy4nKS5pbmNsdWRlcygnJCcpKSB7XG4gICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcihcbiAgICAgICAgJ01pbmltb25nbyBkb2VzblxcJ3Qgc3VwcG9ydCAkIG9wZXJhdG9yIGluIHByb2plY3Rpb25zIHlldC4nXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHZhbHVlID0gZmllbGRzW2tleVBhdGhdO1xuXG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgWyckZWxlbU1hdGNoJywgJyRtZXRhJywgJyRzbGljZSddLnNvbWUoa2V5ID0+XG4gICAgICAgICAgaGFzT3duLmNhbGwodmFsdWUsIGtleSlcbiAgICAgICAgKSkge1xuICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoXG4gICAgICAgICdNaW5pbW9uZ28gZG9lc25cXCd0IHN1cHBvcnQgb3BlcmF0b3JzIGluIHByb2plY3Rpb25zIHlldC4nXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmICghWzEsIDAsIHRydWUsIGZhbHNlXS5pbmNsdWRlcyh2YWx1ZSkpIHtcbiAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKFxuICAgICAgICAnUHJvamVjdGlvbiB2YWx1ZXMgc2hvdWxkIGJlIG9uZSBvZiAxLCAwLCB0cnVlLCBvciBmYWxzZSdcbiAgICAgICk7XG4gICAgfVxuICB9KTtcbn07XG5cbi8vIEtub3dzIGhvdyB0byBjb21waWxlIGEgZmllbGRzIHByb2plY3Rpb24gdG8gYSBwcmVkaWNhdGUgZnVuY3Rpb24uXG4vLyBAcmV0dXJucyAtIEZ1bmN0aW9uOiBhIGNsb3N1cmUgdGhhdCBmaWx0ZXJzIG91dCBhbiBvYmplY3QgYWNjb3JkaW5nIHRvIHRoZVxuLy8gICAgICAgICAgICBmaWVsZHMgcHJvamVjdGlvbiBydWxlczpcbi8vICAgICAgICAgICAgQHBhcmFtIG9iaiAtIE9iamVjdDogTW9uZ29EQi1zdHlsZWQgZG9jdW1lbnRcbi8vICAgICAgICAgICAgQHJldHVybnMgLSBPYmplY3Q6IGEgZG9jdW1lbnQgd2l0aCB0aGUgZmllbGRzIGZpbHRlcmVkIG91dFxuLy8gICAgICAgICAgICAgICAgICAgICAgIGFjY29yZGluZyB0byBwcm9qZWN0aW9uIHJ1bGVzLiBEb2Vzbid0IHJldGFpbiBzdWJmaWVsZHNcbi8vICAgICAgICAgICAgICAgICAgICAgICBvZiBwYXNzZWQgYXJndW1lbnQuXG5Mb2NhbENvbGxlY3Rpb24uX2NvbXBpbGVQcm9qZWN0aW9uID0gZmllbGRzID0+IHtcbiAgTG9jYWxDb2xsZWN0aW9uLl9jaGVja1N1cHBvcnRlZFByb2plY3Rpb24oZmllbGRzKTtcblxuICBjb25zdCBfaWRQcm9qZWN0aW9uID0gZmllbGRzLl9pZCA9PT0gdW5kZWZpbmVkID8gdHJ1ZSA6IGZpZWxkcy5faWQ7XG4gIGNvbnN0IGRldGFpbHMgPSBwcm9qZWN0aW9uRGV0YWlscyhmaWVsZHMpO1xuXG4gIC8vIHJldHVybnMgdHJhbnNmb3JtZWQgZG9jIGFjY29yZGluZyB0byBydWxlVHJlZVxuICBjb25zdCB0cmFuc2Zvcm0gPSAoZG9jLCBydWxlVHJlZSkgPT4ge1xuICAgIC8vIFNwZWNpYWwgY2FzZSBmb3IgXCJzZXRzXCJcbiAgICBpZiAoQXJyYXkuaXNBcnJheShkb2MpKSB7XG4gICAgICByZXR1cm4gZG9jLm1hcChzdWJkb2MgPT4gdHJhbnNmb3JtKHN1YmRvYywgcnVsZVRyZWUpKTtcbiAgICB9XG5cbiAgICBjb25zdCByZXN1bHQgPSBkZXRhaWxzLmluY2x1ZGluZyA/IHt9IDogRUpTT04uY2xvbmUoZG9jKTtcblxuICAgIE9iamVjdC5rZXlzKHJ1bGVUcmVlKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBpZiAoZG9jID09IG51bGwgfHwgIWhhc093bi5jYWxsKGRvYywga2V5KSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJ1bGUgPSBydWxlVHJlZVtrZXldO1xuXG4gICAgICBpZiAocnVsZSA9PT0gT2JqZWN0KHJ1bGUpKSB7XG4gICAgICAgIC8vIEZvciBzdWItb2JqZWN0cy9zdWJzZXRzIHdlIGJyYW5jaFxuICAgICAgICBpZiAoZG9jW2tleV0gPT09IE9iamVjdChkb2Nba2V5XSkpIHtcbiAgICAgICAgICByZXN1bHRba2V5XSA9IHRyYW5zZm9ybShkb2Nba2V5XSwgcnVsZSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoZGV0YWlscy5pbmNsdWRpbmcpIHtcbiAgICAgICAgLy8gT3RoZXJ3aXNlIHdlIGRvbid0IGV2ZW4gdG91Y2ggdGhpcyBzdWJmaWVsZFxuICAgICAgICByZXN1bHRba2V5XSA9IEVKU09OLmNsb25lKGRvY1trZXldKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlbGV0ZSByZXN1bHRba2V5XTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBkb2MgIT0gbnVsbCA/IHJlc3VsdCA6IGRvYztcbiAgfTtcblxuICByZXR1cm4gZG9jID0+IHtcbiAgICBjb25zdCByZXN1bHQgPSB0cmFuc2Zvcm0oZG9jLCBkZXRhaWxzLnRyZWUpO1xuXG4gICAgaWYgKF9pZFByb2plY3Rpb24gJiYgaGFzT3duLmNhbGwoZG9jLCAnX2lkJykpIHtcbiAgICAgIHJlc3VsdC5faWQgPSBkb2MuX2lkO1xuICAgIH1cblxuICAgIGlmICghX2lkUHJvamVjdGlvbiAmJiBoYXNPd24uY2FsbChyZXN1bHQsICdfaWQnKSkge1xuICAgICAgZGVsZXRlIHJlc3VsdC5faWQ7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcbn07XG5cbi8vIENhbGN1bGF0ZXMgdGhlIGRvY3VtZW50IHRvIGluc2VydCBpbiBjYXNlIHdlJ3JlIGRvaW5nIGFuIHVwc2VydCBhbmQgdGhlXG4vLyBzZWxlY3RvciBkb2VzIG5vdCBtYXRjaCBhbnkgZWxlbWVudHNcbkxvY2FsQ29sbGVjdGlvbi5fY3JlYXRlVXBzZXJ0RG9jdW1lbnQgPSAoc2VsZWN0b3IsIG1vZGlmaWVyKSA9PiB7XG4gIGNvbnN0IHNlbGVjdG9yRG9jdW1lbnQgPSBwb3B1bGF0ZURvY3VtZW50V2l0aFF1ZXJ5RmllbGRzKHNlbGVjdG9yKTtcbiAgY29uc3QgaXNNb2RpZnkgPSBMb2NhbENvbGxlY3Rpb24uX2lzTW9kaWZpY2F0aW9uTW9kKG1vZGlmaWVyKTtcblxuICBjb25zdCBuZXdEb2MgPSB7fTtcblxuICBpZiAoc2VsZWN0b3JEb2N1bWVudC5faWQpIHtcbiAgICBuZXdEb2MuX2lkID0gc2VsZWN0b3JEb2N1bWVudC5faWQ7XG4gICAgZGVsZXRlIHNlbGVjdG9yRG9jdW1lbnQuX2lkO1xuICB9XG5cbiAgLy8gVGhpcyBkb3VibGUgX21vZGlmeSBjYWxsIGlzIG1hZGUgdG8gaGVscCB3aXRoIG5lc3RlZCBwcm9wZXJ0aWVzIChzZWUgaXNzdWVcbiAgLy8gIzg2MzEpLiBXZSBkbyB0aGlzIGV2ZW4gaWYgaXQncyBhIHJlcGxhY2VtZW50IGZvciB2YWxpZGF0aW9uIHB1cnBvc2VzIChlLmcuXG4gIC8vIGFtYmlndW91cyBpZCdzKVxuICBMb2NhbENvbGxlY3Rpb24uX21vZGlmeShuZXdEb2MsIHskc2V0OiBzZWxlY3RvckRvY3VtZW50fSk7XG4gIExvY2FsQ29sbGVjdGlvbi5fbW9kaWZ5KG5ld0RvYywgbW9kaWZpZXIsIHtpc0luc2VydDogdHJ1ZX0pO1xuXG4gIGlmIChpc01vZGlmeSkge1xuICAgIHJldHVybiBuZXdEb2M7XG4gIH1cblxuICAvLyBSZXBsYWNlbWVudCBjYW4gdGFrZSBfaWQgZnJvbSBxdWVyeSBkb2N1bWVudFxuICBjb25zdCByZXBsYWNlbWVudCA9IE9iamVjdC5hc3NpZ24oe30sIG1vZGlmaWVyKTtcbiAgaWYgKG5ld0RvYy5faWQpIHtcbiAgICByZXBsYWNlbWVudC5faWQgPSBuZXdEb2MuX2lkO1xuICB9XG5cbiAgcmV0dXJuIHJlcGxhY2VtZW50O1xufTtcblxuTG9jYWxDb2xsZWN0aW9uLl9kaWZmT2JqZWN0cyA9IChsZWZ0LCByaWdodCwgY2FsbGJhY2tzKSA9PiB7XG4gIHJldHVybiBEaWZmU2VxdWVuY2UuZGlmZk9iamVjdHMobGVmdCwgcmlnaHQsIGNhbGxiYWNrcyk7XG59O1xuXG4vLyBvcmRlcmVkOiBib29sLlxuLy8gb2xkX3Jlc3VsdHMgYW5kIG5ld19yZXN1bHRzOiBjb2xsZWN0aW9ucyBvZiBkb2N1bWVudHMuXG4vLyAgICBpZiBvcmRlcmVkLCB0aGV5IGFyZSBhcnJheXMuXG4vLyAgICBpZiB1bm9yZGVyZWQsIHRoZXkgYXJlIElkTWFwc1xuTG9jYWxDb2xsZWN0aW9uLl9kaWZmUXVlcnlDaGFuZ2VzID0gKG9yZGVyZWQsIG9sZFJlc3VsdHMsIG5ld1Jlc3VsdHMsIG9ic2VydmVyLCBvcHRpb25zKSA9PlxuICBEaWZmU2VxdWVuY2UuZGlmZlF1ZXJ5Q2hhbmdlcyhvcmRlcmVkLCBvbGRSZXN1bHRzLCBuZXdSZXN1bHRzLCBvYnNlcnZlciwgb3B0aW9ucylcbjtcblxuTG9jYWxDb2xsZWN0aW9uLl9kaWZmUXVlcnlPcmRlcmVkQ2hhbmdlcyA9IChvbGRSZXN1bHRzLCBuZXdSZXN1bHRzLCBvYnNlcnZlciwgb3B0aW9ucykgPT5cbiAgRGlmZlNlcXVlbmNlLmRpZmZRdWVyeU9yZGVyZWRDaGFuZ2VzKG9sZFJlc3VsdHMsIG5ld1Jlc3VsdHMsIG9ic2VydmVyLCBvcHRpb25zKVxuO1xuXG5Mb2NhbENvbGxlY3Rpb24uX2RpZmZRdWVyeVVub3JkZXJlZENoYW5nZXMgPSAob2xkUmVzdWx0cywgbmV3UmVzdWx0cywgb2JzZXJ2ZXIsIG9wdGlvbnMpID0+XG4gIERpZmZTZXF1ZW5jZS5kaWZmUXVlcnlVbm9yZGVyZWRDaGFuZ2VzKG9sZFJlc3VsdHMsIG5ld1Jlc3VsdHMsIG9ic2VydmVyLCBvcHRpb25zKVxuO1xuXG5Mb2NhbENvbGxlY3Rpb24uX2ZpbmRJbk9yZGVyZWRSZXN1bHRzID0gKHF1ZXJ5LCBkb2MpID0+IHtcbiAgaWYgKCFxdWVyeS5vcmRlcmVkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdDYW5cXCd0IGNhbGwgX2ZpbmRJbk9yZGVyZWRSZXN1bHRzIG9uIHVub3JkZXJlZCBxdWVyeScpO1xuICB9XG5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBxdWVyeS5yZXN1bHRzLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKHF1ZXJ5LnJlc3VsdHNbaV0gPT09IGRvYykge1xuICAgICAgcmV0dXJuIGk7XG4gICAgfVxuICB9XG5cbiAgdGhyb3cgRXJyb3IoJ29iamVjdCBtaXNzaW5nIGZyb20gcXVlcnknKTtcbn07XG5cbi8vIElmIHRoaXMgaXMgYSBzZWxlY3RvciB3aGljaCBleHBsaWNpdGx5IGNvbnN0cmFpbnMgdGhlIG1hdGNoIGJ5IElEIHRvIGEgZmluaXRlXG4vLyBudW1iZXIgb2YgZG9jdW1lbnRzLCByZXR1cm5zIGEgbGlzdCBvZiB0aGVpciBJRHMuICBPdGhlcndpc2UgcmV0dXJuc1xuLy8gbnVsbC4gTm90ZSB0aGF0IHRoZSBzZWxlY3RvciBtYXkgaGF2ZSBvdGhlciByZXN0cmljdGlvbnMgc28gaXQgbWF5IG5vdCBldmVuXG4vLyBtYXRjaCB0aG9zZSBkb2N1bWVudCEgIFdlIGNhcmUgYWJvdXQgJGluIGFuZCAkYW5kIHNpbmNlIHRob3NlIGFyZSBnZW5lcmF0ZWRcbi8vIGFjY2Vzcy1jb250cm9sbGVkIHVwZGF0ZSBhbmQgcmVtb3ZlLlxuTG9jYWxDb2xsZWN0aW9uLl9pZHNNYXRjaGVkQnlTZWxlY3RvciA9IHNlbGVjdG9yID0+IHtcbiAgLy8gSXMgdGhlIHNlbGVjdG9yIGp1c3QgYW4gSUQ/XG4gIGlmIChMb2NhbENvbGxlY3Rpb24uX3NlbGVjdG9ySXNJZChzZWxlY3RvcikpIHtcbiAgICByZXR1cm4gW3NlbGVjdG9yXTtcbiAgfVxuXG4gIGlmICghc2VsZWN0b3IpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIC8vIERvIHdlIGhhdmUgYW4gX2lkIGNsYXVzZT9cbiAgaWYgKGhhc093bi5jYWxsKHNlbGVjdG9yLCAnX2lkJykpIHtcbiAgICAvLyBJcyB0aGUgX2lkIGNsYXVzZSBqdXN0IGFuIElEP1xuICAgIGlmIChMb2NhbENvbGxlY3Rpb24uX3NlbGVjdG9ySXNJZChzZWxlY3Rvci5faWQpKSB7XG4gICAgICByZXR1cm4gW3NlbGVjdG9yLl9pZF07XG4gICAgfVxuXG4gICAgLy8gSXMgdGhlIF9pZCBjbGF1c2Uge19pZDogeyRpbjogW1wieFwiLCBcInlcIiwgXCJ6XCJdfX0/XG4gICAgaWYgKHNlbGVjdG9yLl9pZFxuICAgICAgICAmJiBBcnJheS5pc0FycmF5KHNlbGVjdG9yLl9pZC4kaW4pXG4gICAgICAgICYmIHNlbGVjdG9yLl9pZC4kaW4ubGVuZ3RoXG4gICAgICAgICYmIHNlbGVjdG9yLl9pZC4kaW4uZXZlcnkoTG9jYWxDb2xsZWN0aW9uLl9zZWxlY3RvcklzSWQpKSB7XG4gICAgICByZXR1cm4gc2VsZWN0b3IuX2lkLiRpbjtcbiAgICB9XG5cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIC8vIElmIHRoaXMgaXMgYSB0b3AtbGV2ZWwgJGFuZCwgYW5kIGFueSBvZiB0aGUgY2xhdXNlcyBjb25zdHJhaW4gdGhlaXJcbiAgLy8gZG9jdW1lbnRzLCB0aGVuIHRoZSB3aG9sZSBzZWxlY3RvciBpcyBjb25zdHJhaW5lZCBieSBhbnkgb25lIGNsYXVzZSdzXG4gIC8vIGNvbnN0cmFpbnQuIChXZWxsLCBieSB0aGVpciBpbnRlcnNlY3Rpb24sIGJ1dCB0aGF0IHNlZW1zIHVubGlrZWx5LilcbiAgaWYgKEFycmF5LmlzQXJyYXkoc2VsZWN0b3IuJGFuZCkpIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNlbGVjdG9yLiRhbmQubGVuZ3RoOyArK2kpIHtcbiAgICAgIGNvbnN0IHN1YklkcyA9IExvY2FsQ29sbGVjdGlvbi5faWRzTWF0Y2hlZEJ5U2VsZWN0b3Ioc2VsZWN0b3IuJGFuZFtpXSk7XG5cbiAgICAgIGlmIChzdWJJZHMpIHtcbiAgICAgICAgcmV0dXJuIHN1YklkcztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn07XG5cbkxvY2FsQ29sbGVjdGlvbi5faW5zZXJ0SW5SZXN1bHRzU3luYyA9IChxdWVyeSwgZG9jKSA9PiB7XG4gIGNvbnN0IGZpZWxkcyA9IEVKU09OLmNsb25lKGRvYyk7XG5cbiAgZGVsZXRlIGZpZWxkcy5faWQ7XG5cbiAgaWYgKHF1ZXJ5Lm9yZGVyZWQpIHtcbiAgICBpZiAoIXF1ZXJ5LnNvcnRlcikge1xuICAgICAgcXVlcnkuYWRkZWRCZWZvcmUoZG9jLl9pZCwgcXVlcnkucHJvamVjdGlvbkZuKGZpZWxkcyksIG51bGwpO1xuICAgICAgcXVlcnkucmVzdWx0cy5wdXNoKGRvYyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGkgPSBMb2NhbENvbGxlY3Rpb24uX2luc2VydEluU29ydGVkTGlzdChcbiAgICAgICAgcXVlcnkuc29ydGVyLmdldENvbXBhcmF0b3Ioe2Rpc3RhbmNlczogcXVlcnkuZGlzdGFuY2VzfSksXG4gICAgICAgIHF1ZXJ5LnJlc3VsdHMsXG4gICAgICAgIGRvY1xuICAgICAgKTtcblxuICAgICAgbGV0IG5leHQgPSBxdWVyeS5yZXN1bHRzW2kgKyAxXTtcbiAgICAgIGlmIChuZXh0KSB7XG4gICAgICAgIG5leHQgPSBuZXh0Ll9pZDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5leHQgPSBudWxsO1xuICAgICAgfVxuXG4gICAgICBxdWVyeS5hZGRlZEJlZm9yZShkb2MuX2lkLCBxdWVyeS5wcm9qZWN0aW9uRm4oZmllbGRzKSwgbmV4dCk7XG4gICAgfVxuXG4gICAgcXVlcnkuYWRkZWQoZG9jLl9pZCwgcXVlcnkucHJvamVjdGlvbkZuKGZpZWxkcykpO1xuICB9IGVsc2Uge1xuICAgIHF1ZXJ5LmFkZGVkKGRvYy5faWQsIHF1ZXJ5LnByb2plY3Rpb25GbihmaWVsZHMpKTtcbiAgICBxdWVyeS5yZXN1bHRzLnNldChkb2MuX2lkLCBkb2MpO1xuICB9XG59O1xuXG5Mb2NhbENvbGxlY3Rpb24uX2luc2VydEluUmVzdWx0c0FzeW5jID0gYXN5bmMgKHF1ZXJ5LCBkb2MpID0+IHtcbiAgY29uc3QgZmllbGRzID0gRUpTT04uY2xvbmUoZG9jKTtcblxuICBkZWxldGUgZmllbGRzLl9pZDtcblxuICBpZiAocXVlcnkub3JkZXJlZCkge1xuICAgIGlmICghcXVlcnkuc29ydGVyKSB7XG4gICAgICBhd2FpdCBxdWVyeS5hZGRlZEJlZm9yZShkb2MuX2lkLCBxdWVyeS5wcm9qZWN0aW9uRm4oZmllbGRzKSwgbnVsbCk7XG4gICAgICBxdWVyeS5yZXN1bHRzLnB1c2goZG9jKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgaSA9IExvY2FsQ29sbGVjdGlvbi5faW5zZXJ0SW5Tb3J0ZWRMaXN0KFxuICAgICAgICBxdWVyeS5zb3J0ZXIuZ2V0Q29tcGFyYXRvcih7ZGlzdGFuY2VzOiBxdWVyeS5kaXN0YW5jZXN9KSxcbiAgICAgICAgcXVlcnkucmVzdWx0cyxcbiAgICAgICAgZG9jXG4gICAgICApO1xuXG4gICAgICBsZXQgbmV4dCA9IHF1ZXJ5LnJlc3VsdHNbaSArIDFdO1xuICAgICAgaWYgKG5leHQpIHtcbiAgICAgICAgbmV4dCA9IG5leHQuX2lkO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbmV4dCA9IG51bGw7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHF1ZXJ5LmFkZGVkQmVmb3JlKGRvYy5faWQsIHF1ZXJ5LnByb2plY3Rpb25GbihmaWVsZHMpLCBuZXh0KTtcbiAgICB9XG5cbiAgICBhd2FpdCBxdWVyeS5hZGRlZChkb2MuX2lkLCBxdWVyeS5wcm9qZWN0aW9uRm4oZmllbGRzKSk7XG4gIH0gZWxzZSB7XG4gICAgYXdhaXQgcXVlcnkuYWRkZWQoZG9jLl9pZCwgcXVlcnkucHJvamVjdGlvbkZuKGZpZWxkcykpO1xuICAgIHF1ZXJ5LnJlc3VsdHMuc2V0KGRvYy5faWQsIGRvYyk7XG4gIH1cbn07XG5cbkxvY2FsQ29sbGVjdGlvbi5faW5zZXJ0SW5Tb3J0ZWRMaXN0ID0gKGNtcCwgYXJyYXksIHZhbHVlKSA9PiB7XG4gIGlmIChhcnJheS5sZW5ndGggPT09IDApIHtcbiAgICBhcnJheS5wdXNoKHZhbHVlKTtcbiAgICByZXR1cm4gMDtcbiAgfVxuXG4gIGNvbnN0IGkgPSBMb2NhbENvbGxlY3Rpb24uX2JpbmFyeVNlYXJjaChjbXAsIGFycmF5LCB2YWx1ZSk7XG5cbiAgYXJyYXkuc3BsaWNlKGksIDAsIHZhbHVlKTtcblxuICByZXR1cm4gaTtcbn07XG5cbkxvY2FsQ29sbGVjdGlvbi5faXNNb2RpZmljYXRpb25Nb2QgPSBtb2QgPT4ge1xuICBsZXQgaXNNb2RpZnkgPSBmYWxzZTtcbiAgbGV0IGlzUmVwbGFjZSA9IGZhbHNlO1xuXG4gIE9iamVjdC5rZXlzKG1vZCkuZm9yRWFjaChrZXkgPT4ge1xuICAgIGlmIChrZXkuc3Vic3RyKDAsIDEpID09PSAnJCcpIHtcbiAgICAgIGlzTW9kaWZ5ID0gdHJ1ZTtcbiAgICB9IGVsc2Uge1xuICAgICAgaXNSZXBsYWNlID0gdHJ1ZTtcbiAgICB9XG4gIH0pO1xuXG4gIGlmIChpc01vZGlmeSAmJiBpc1JlcGxhY2UpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAnVXBkYXRlIHBhcmFtZXRlciBjYW5ub3QgaGF2ZSBib3RoIG1vZGlmaWVyIGFuZCBub24tbW9kaWZpZXIgZmllbGRzLidcbiAgICApO1xuICB9XG5cbiAgcmV0dXJuIGlzTW9kaWZ5O1xufTtcblxuLy8gWFhYIG1heWJlIHRoaXMgc2hvdWxkIGJlIEVKU09OLmlzT2JqZWN0LCB0aG91Z2ggRUpTT04gZG9lc24ndCBrbm93IGFib3V0XG4vLyBSZWdFeHBcbi8vIFhYWCBub3RlIHRoYXQgX3R5cGUodW5kZWZpbmVkKSA9PT0gMyEhISFcbkxvY2FsQ29sbGVjdGlvbi5faXNQbGFpbk9iamVjdCA9IHggPT4ge1xuICByZXR1cm4geCAmJiBMb2NhbENvbGxlY3Rpb24uX2YuX3R5cGUoeCkgPT09IDM7XG59O1xuXG4vLyBYWFggbmVlZCBhIHN0cmF0ZWd5IGZvciBwYXNzaW5nIHRoZSBiaW5kaW5nIG9mICQgaW50byB0aGlzXG4vLyBmdW5jdGlvbiwgZnJvbSB0aGUgY29tcGlsZWQgc2VsZWN0b3Jcbi8vXG4vLyBtYXliZSBqdXN0IHtrZXkudXAudG8uanVzdC5iZWZvcmUuZG9sbGFyc2lnbjogYXJyYXlfaW5kZXh9XG4vL1xuLy8gWFhYIGF0b21pY2l0eTogaWYgb25lIG1vZGlmaWNhdGlvbiBmYWlscywgZG8gd2Ugcm9sbCBiYWNrIHRoZSB3aG9sZVxuLy8gY2hhbmdlP1xuLy9cbi8vIG9wdGlvbnM6XG4vLyAgIC0gaXNJbnNlcnQgaXMgc2V0IHdoZW4gX21vZGlmeSBpcyBiZWluZyBjYWxsZWQgdG8gY29tcHV0ZSB0aGUgZG9jdW1lbnQgdG9cbi8vICAgICBpbnNlcnQgYXMgcGFydCBvZiBhbiB1cHNlcnQgb3BlcmF0aW9uLiBXZSB1c2UgdGhpcyBwcmltYXJpbHkgdG8gZmlndXJlXG4vLyAgICAgb3V0IHdoZW4gdG8gc2V0IHRoZSBmaWVsZHMgaW4gJHNldE9uSW5zZXJ0LCBpZiBwcmVzZW50LlxuTG9jYWxDb2xsZWN0aW9uLl9tb2RpZnkgPSAoZG9jLCBtb2RpZmllciwgb3B0aW9ucyA9IHt9KSA9PiB7XG4gIGlmICghTG9jYWxDb2xsZWN0aW9uLl9pc1BsYWluT2JqZWN0KG1vZGlmaWVyKSkge1xuICAgIHRocm93IE1pbmltb25nb0Vycm9yKCdNb2RpZmllciBtdXN0IGJlIGFuIG9iamVjdCcpO1xuICB9XG5cbiAgLy8gTWFrZSBzdXJlIHRoZSBjYWxsZXIgY2FuJ3QgbXV0YXRlIG91ciBkYXRhIHN0cnVjdHVyZXMuXG4gIG1vZGlmaWVyID0gRUpTT04uY2xvbmUobW9kaWZpZXIpO1xuXG4gIGNvbnN0IGlzTW9kaWZpZXIgPSBpc09wZXJhdG9yT2JqZWN0KG1vZGlmaWVyKTtcbiAgY29uc3QgbmV3RG9jID0gaXNNb2RpZmllciA/IEVKU09OLmNsb25lKGRvYykgOiBtb2RpZmllcjtcblxuICBpZiAoaXNNb2RpZmllcikge1xuICAgIC8vIGFwcGx5IG1vZGlmaWVycyB0byB0aGUgZG9jLlxuICAgIE9iamVjdC5rZXlzKG1vZGlmaWVyKS5mb3JFYWNoKG9wZXJhdG9yID0+IHtcbiAgICAgIC8vIFRyZWF0ICRzZXRPbkluc2VydCBhcyAkc2V0IGlmIHRoaXMgaXMgYW4gaW5zZXJ0LlxuICAgICAgY29uc3Qgc2V0T25JbnNlcnQgPSBvcHRpb25zLmlzSW5zZXJ0ICYmIG9wZXJhdG9yID09PSAnJHNldE9uSW5zZXJ0JztcbiAgICAgIGNvbnN0IG1vZEZ1bmMgPSBNT0RJRklFUlNbc2V0T25JbnNlcnQgPyAnJHNldCcgOiBvcGVyYXRvcl07XG4gICAgICBjb25zdCBvcGVyYW5kID0gbW9kaWZpZXJbb3BlcmF0b3JdO1xuXG4gICAgICBpZiAoIW1vZEZ1bmMpIHtcbiAgICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoYEludmFsaWQgbW9kaWZpZXIgc3BlY2lmaWVkICR7b3BlcmF0b3J9YCk7XG4gICAgICB9XG5cbiAgICAgIE9iamVjdC5rZXlzKG9wZXJhbmQpLmZvckVhY2goa2V5cGF0aCA9PiB7XG4gICAgICAgIGNvbnN0IGFyZyA9IG9wZXJhbmRba2V5cGF0aF07XG5cbiAgICAgICAgaWYgKGtleXBhdGggPT09ICcnKSB7XG4gICAgICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoJ0FuIGVtcHR5IHVwZGF0ZSBwYXRoIGlzIG5vdCB2YWxpZC4nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGtleXBhcnRzID0ga2V5cGF0aC5zcGxpdCgnLicpO1xuXG4gICAgICAgIGlmICgha2V5cGFydHMuZXZlcnkoQm9vbGVhbikpIHtcbiAgICAgICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcihcbiAgICAgICAgICAgIGBUaGUgdXBkYXRlIHBhdGggJyR7a2V5cGF0aH0nIGNvbnRhaW5zIGFuIGVtcHR5IGZpZWxkIG5hbWUsIGAgK1xuICAgICAgICAgICAgJ3doaWNoIGlzIG5vdCBhbGxvd2VkLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gZmluZE1vZFRhcmdldChuZXdEb2MsIGtleXBhcnRzLCB7XG4gICAgICAgICAgYXJyYXlJbmRpY2VzOiBvcHRpb25zLmFycmF5SW5kaWNlcyxcbiAgICAgICAgICBmb3JiaWRBcnJheTogb3BlcmF0b3IgPT09ICckcmVuYW1lJyxcbiAgICAgICAgICBub0NyZWF0ZTogTk9fQ1JFQVRFX01PRElGSUVSU1tvcGVyYXRvcl1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgbW9kRnVuYyh0YXJnZXQsIGtleXBhcnRzLnBvcCgpLCBhcmcsIGtleXBhdGgsIG5ld0RvYyk7XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGlmIChkb2MuX2lkICYmICFFSlNPTi5lcXVhbHMoZG9jLl9pZCwgbmV3RG9jLl9pZCkpIHtcbiAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKFxuICAgICAgICBgQWZ0ZXIgYXBwbHlpbmcgdGhlIHVwZGF0ZSB0byB0aGUgZG9jdW1lbnQge19pZDogXCIke2RvYy5faWR9XCIsIC4uLn0sYCArXG4gICAgICAgICcgdGhlIChpbW11dGFibGUpIGZpZWxkIFxcJ19pZFxcJyB3YXMgZm91bmQgdG8gaGF2ZSBiZWVuIGFsdGVyZWQgdG8gJyArXG4gICAgICAgIGBfaWQ6IFwiJHtuZXdEb2MuX2lkfVwiYFxuICAgICAgKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgaWYgKGRvYy5faWQgJiYgbW9kaWZpZXIuX2lkICYmICFFSlNPTi5lcXVhbHMoZG9jLl9pZCwgbW9kaWZpZXIuX2lkKSkge1xuICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoXG4gICAgICAgIGBUaGUgX2lkIGZpZWxkIGNhbm5vdCBiZSBjaGFuZ2VkIGZyb20ge19pZDogXCIke2RvYy5faWR9XCJ9IHRvIGAgK1xuICAgICAgICBge19pZDogXCIke21vZGlmaWVyLl9pZH1cIn1gXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIHJlcGxhY2UgdGhlIHdob2xlIGRvY3VtZW50XG4gICAgYXNzZXJ0SGFzVmFsaWRGaWVsZE5hbWVzKG1vZGlmaWVyKTtcbiAgfVxuXG4gIC8vIG1vdmUgbmV3IGRvY3VtZW50IGludG8gcGxhY2UuXG4gIE9iamVjdC5rZXlzKGRvYykuZm9yRWFjaChrZXkgPT4ge1xuICAgIC8vIE5vdGU6IHRoaXMgdXNlZCB0byBiZSBmb3IgKHZhciBrZXkgaW4gZG9jKSBob3dldmVyLCB0aGlzIGRvZXMgbm90XG4gICAgLy8gd29yayByaWdodCBpbiBPcGVyYS4gRGVsZXRpbmcgZnJvbSBhIGRvYyB3aGlsZSBpdGVyYXRpbmcgb3ZlciBpdFxuICAgIC8vIHdvdWxkIHNvbWV0aW1lcyBjYXVzZSBvcGVyYSB0byBza2lwIHNvbWUga2V5cy5cbiAgICBpZiAoa2V5ICE9PSAnX2lkJykge1xuICAgICAgZGVsZXRlIGRvY1trZXldO1xuICAgIH1cbiAgfSk7XG5cbiAgT2JqZWN0LmtleXMobmV3RG9jKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgZG9jW2tleV0gPSBuZXdEb2Nba2V5XTtcbiAgfSk7XG59O1xuXG5Mb2NhbENvbGxlY3Rpb24uX29ic2VydmVGcm9tT2JzZXJ2ZUNoYW5nZXMgPSAoY3Vyc29yLCBvYnNlcnZlQ2FsbGJhY2tzKSA9PiB7XG4gIGNvbnN0IHRyYW5zZm9ybSA9IGN1cnNvci5nZXRUcmFuc2Zvcm0oKSB8fCAoZG9jID0+IGRvYyk7XG4gIGxldCBzdXBwcmVzc2VkID0gISFvYnNlcnZlQ2FsbGJhY2tzLl9zdXBwcmVzc19pbml0aWFsO1xuXG4gIGxldCBvYnNlcnZlQ2hhbmdlc0NhbGxiYWNrcztcbiAgaWYgKExvY2FsQ29sbGVjdGlvbi5fb2JzZXJ2ZUNhbGxiYWNrc0FyZU9yZGVyZWQob2JzZXJ2ZUNhbGxiYWNrcykpIHtcbiAgICAvLyBUaGUgXCJfbm9faW5kaWNlc1wiIG9wdGlvbiBzZXRzIGFsbCBpbmRleCBhcmd1bWVudHMgdG8gLTEgYW5kIHNraXBzIHRoZVxuICAgIC8vIGxpbmVhciBzY2FucyByZXF1aXJlZCB0byBnZW5lcmF0ZSB0aGVtLiAgVGhpcyBsZXRzIG9ic2VydmVycyB0aGF0IGRvbid0XG4gICAgLy8gbmVlZCBhYnNvbHV0ZSBpbmRpY2VzIGJlbmVmaXQgZnJvbSB0aGUgb3RoZXIgZmVhdHVyZXMgb2YgdGhpcyBBUEkgLS1cbiAgICAvLyByZWxhdGl2ZSBvcmRlciwgdHJhbnNmb3JtcywgYW5kIGFwcGx5Q2hhbmdlcyAtLSB3aXRob3V0IHRoZSBzcGVlZCBoaXQuXG4gICAgY29uc3QgaW5kaWNlcyA9ICFvYnNlcnZlQ2FsbGJhY2tzLl9ub19pbmRpY2VzO1xuXG4gICAgb2JzZXJ2ZUNoYW5nZXNDYWxsYmFja3MgPSB7XG4gICAgICBhZGRlZEJlZm9yZShpZCwgZmllbGRzLCBiZWZvcmUpIHtcbiAgICAgICAgY29uc3QgY2hlY2sgPSBzdXBwcmVzc2VkIHx8ICEob2JzZXJ2ZUNhbGxiYWNrcy5hZGRlZEF0IHx8IG9ic2VydmVDYWxsYmFja3MuYWRkZWQpXG4gICAgICAgIGlmIChjaGVjaykge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGRvYyA9IHRyYW5zZm9ybShPYmplY3QuYXNzaWduKGZpZWxkcywge19pZDogaWR9KSk7XG5cbiAgICAgICAgaWYgKG9ic2VydmVDYWxsYmFja3MuYWRkZWRBdCkge1xuICAgICAgICAgIG9ic2VydmVDYWxsYmFja3MuYWRkZWRBdChcbiAgICAgICAgICAgICAgZG9jLFxuICAgICAgICAgICAgICBpbmRpY2VzXG4gICAgICAgICAgICAgICAgICA/IGJlZm9yZVxuICAgICAgICAgICAgICAgICAgICAgID8gdGhpcy5kb2NzLmluZGV4T2YoYmVmb3JlKVxuICAgICAgICAgICAgICAgICAgICAgIDogdGhpcy5kb2NzLnNpemUoKVxuICAgICAgICAgICAgICAgICAgOiAtMSxcbiAgICAgICAgICAgICAgYmVmb3JlXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBvYnNlcnZlQ2FsbGJhY2tzLmFkZGVkKGRvYyk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBjaGFuZ2VkKGlkLCBmaWVsZHMpIHtcblxuICAgICAgICBpZiAoIShvYnNlcnZlQ2FsbGJhY2tzLmNoYW5nZWRBdCB8fCBvYnNlcnZlQ2FsbGJhY2tzLmNoYW5nZWQpKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGRvYyA9IEVKU09OLmNsb25lKHRoaXMuZG9jcy5nZXQoaWQpKTtcbiAgICAgICAgaWYgKCFkb2MpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gaWQgZm9yIGNoYW5nZWQ6ICR7aWR9YCk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBvbGREb2MgPSB0cmFuc2Zvcm0oRUpTT04uY2xvbmUoZG9jKSk7XG5cbiAgICAgICAgRGlmZlNlcXVlbmNlLmFwcGx5Q2hhbmdlcyhkb2MsIGZpZWxkcyk7XG5cbiAgICAgICAgaWYgKG9ic2VydmVDYWxsYmFja3MuY2hhbmdlZEF0KSB7XG4gICAgICAgICAgb2JzZXJ2ZUNhbGxiYWNrcy5jaGFuZ2VkQXQoXG4gICAgICAgICAgICAgIHRyYW5zZm9ybShkb2MpLFxuICAgICAgICAgICAgICBvbGREb2MsXG4gICAgICAgICAgICAgIGluZGljZXMgPyB0aGlzLmRvY3MuaW5kZXhPZihpZCkgOiAtMVxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgb2JzZXJ2ZUNhbGxiYWNrcy5jaGFuZ2VkKHRyYW5zZm9ybShkb2MpLCBvbGREb2MpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgbW92ZWRCZWZvcmUoaWQsIGJlZm9yZSkge1xuICAgICAgICBpZiAoIW9ic2VydmVDYWxsYmFja3MubW92ZWRUbykge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGZyb20gPSBpbmRpY2VzID8gdGhpcy5kb2NzLmluZGV4T2YoaWQpIDogLTE7XG4gICAgICAgIGxldCB0byA9IGluZGljZXNcbiAgICAgICAgICAgID8gYmVmb3JlXG4gICAgICAgICAgICAgICAgPyB0aGlzLmRvY3MuaW5kZXhPZihiZWZvcmUpXG4gICAgICAgICAgICAgICAgOiB0aGlzLmRvY3Muc2l6ZSgpXG4gICAgICAgICAgICA6IC0xO1xuXG4gICAgICAgIC8vIFdoZW4gbm90IG1vdmluZyBiYWNrd2FyZHMsIGFkanVzdCBmb3IgdGhlIGZhY3QgdGhhdCByZW1vdmluZyB0aGVcbiAgICAgICAgLy8gZG9jdW1lbnQgc2xpZGVzIGV2ZXJ5dGhpbmcgYmFjayBvbmUgc2xvdC5cbiAgICAgICAgaWYgKHRvID4gZnJvbSkge1xuICAgICAgICAgIC0tdG87XG4gICAgICAgIH1cblxuICAgICAgICBvYnNlcnZlQ2FsbGJhY2tzLm1vdmVkVG8oXG4gICAgICAgICAgICB0cmFuc2Zvcm0oRUpTT04uY2xvbmUodGhpcy5kb2NzLmdldChpZCkpKSxcbiAgICAgICAgICAgIGZyb20sXG4gICAgICAgICAgICB0byxcbiAgICAgICAgICAgIGJlZm9yZSB8fCBudWxsXG4gICAgICAgICk7XG4gICAgICB9LFxuICAgICAgcmVtb3ZlZChpZCkge1xuICAgICAgICBpZiAoIShvYnNlcnZlQ2FsbGJhY2tzLnJlbW92ZWRBdCB8fCBvYnNlcnZlQ2FsbGJhY2tzLnJlbW92ZWQpKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gdGVjaG5pY2FsbHkgbWF5YmUgdGhlcmUgc2hvdWxkIGJlIGFuIEVKU09OLmNsb25lIGhlcmUsIGJ1dCBpdCdzIGFib3V0XG4gICAgICAgIC8vIHRvIGJlIHJlbW92ZWQgZnJvbSB0aGlzLmRvY3MhXG4gICAgICAgIGNvbnN0IGRvYyA9IHRyYW5zZm9ybSh0aGlzLmRvY3MuZ2V0KGlkKSk7XG5cbiAgICAgICAgaWYgKG9ic2VydmVDYWxsYmFja3MucmVtb3ZlZEF0KSB7XG4gICAgICAgICAgb2JzZXJ2ZUNhbGxiYWNrcy5yZW1vdmVkQXQoZG9jLCBpbmRpY2VzID8gdGhpcy5kb2NzLmluZGV4T2YoaWQpIDogLTEpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG9ic2VydmVDYWxsYmFja3MucmVtb3ZlZChkb2MpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH07XG4gIH0gZWxzZSB7XG4gICAgb2JzZXJ2ZUNoYW5nZXNDYWxsYmFja3MgPSB7XG4gICAgICBhZGRlZChpZCwgZmllbGRzKSB7XG4gICAgICAgIGlmICghc3VwcHJlc3NlZCAmJiBvYnNlcnZlQ2FsbGJhY2tzLmFkZGVkKSB7XG4gICAgICAgICAgb2JzZXJ2ZUNhbGxiYWNrcy5hZGRlZCh0cmFuc2Zvcm0oT2JqZWN0LmFzc2lnbihmaWVsZHMsIHtfaWQ6IGlkfSkpKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIGNoYW5nZWQoaWQsIGZpZWxkcykge1xuICAgICAgICBpZiAob2JzZXJ2ZUNhbGxiYWNrcy5jaGFuZ2VkKSB7XG4gICAgICAgICAgY29uc3Qgb2xkRG9jID0gdGhpcy5kb2NzLmdldChpZCk7XG4gICAgICAgICAgY29uc3QgZG9jID0gRUpTT04uY2xvbmUob2xkRG9jKTtcblxuICAgICAgICAgIERpZmZTZXF1ZW5jZS5hcHBseUNoYW5nZXMoZG9jLCBmaWVsZHMpO1xuXG4gICAgICAgICAgb2JzZXJ2ZUNhbGxiYWNrcy5jaGFuZ2VkKFxuICAgICAgICAgICAgICB0cmFuc2Zvcm0oZG9jKSxcbiAgICAgICAgICAgICAgdHJhbnNmb3JtKEVKU09OLmNsb25lKG9sZERvYykpXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIHJlbW92ZWQoaWQpIHtcbiAgICAgICAgaWYgKG9ic2VydmVDYWxsYmFja3MucmVtb3ZlZCkge1xuICAgICAgICAgIG9ic2VydmVDYWxsYmFja3MucmVtb3ZlZCh0cmFuc2Zvcm0odGhpcy5kb2NzLmdldChpZCkpKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgY2hhbmdlT2JzZXJ2ZXIgPSBuZXcgTG9jYWxDb2xsZWN0aW9uLl9DYWNoaW5nQ2hhbmdlT2JzZXJ2ZXIoe1xuICAgIGNhbGxiYWNrczogb2JzZXJ2ZUNoYW5nZXNDYWxsYmFja3NcbiAgfSk7XG5cbiAgLy8gQ2FjaGluZ0NoYW5nZU9ic2VydmVyIGNsb25lcyBhbGwgcmVjZWl2ZWQgaW5wdXQgb24gaXRzIGNhbGxiYWNrc1xuICAvLyBTbyB3ZSBjYW4gbWFyayBpdCBhcyBzYWZlIHRvIHJlZHVjZSB0aGUgZWpzb24gY2xvbmVzLlxuICAvLyBUaGlzIGlzIHRlc3RlZCBieSB0aGUgYG1vbmdvLWxpdmVkYXRhIC0gKGV4dGVuZGVkKSBzY3JpYmJsaW5nYCB0ZXN0c1xuICBjaGFuZ2VPYnNlcnZlci5hcHBseUNoYW5nZS5fZnJvbU9ic2VydmUgPSB0cnVlO1xuICBjb25zdCBoYW5kbGUgPSBjdXJzb3Iub2JzZXJ2ZUNoYW5nZXMoY2hhbmdlT2JzZXJ2ZXIuYXBwbHlDaGFuZ2UsXG4gICAgICB7IG5vbk11dGF0aW5nQ2FsbGJhY2tzOiB0cnVlIH0pO1xuXG4gIC8vIElmIG5lZWRlZCwgcmUtZW5hYmxlIGNhbGxiYWNrcyBhcyBzb29uIGFzIHRoZSBpbml0aWFsIGJhdGNoIGlzIHJlYWR5LlxuICBjb25zdCBzZXRTdXBwcmVzc2VkID0gKGgpID0+IHtcbiAgICBpZiAoaC5pc1JlYWR5KSBzdXBwcmVzc2VkID0gZmFsc2U7XG4gICAgZWxzZSBoLmlzUmVhZHlQcm9taXNlPy50aGVuKCgpID0+IChzdXBwcmVzc2VkID0gZmFsc2UpKTtcbiAgfTtcbiAgLy8gV2hlbiB3ZSBjYWxsIGN1cnNvci5vYnNlcnZlQ2hhbmdlcygpIGl0IGNhbiBiZSB0aGUgb24gZnJvbVxuICAvLyB0aGUgbW9uZ28gcGFja2FnZSAoaW5zdGVhZCBvZiB0aGUgbWluaW1vbmdvIG9uZSkgYW5kIGl0IGRvZXNuJ3QgaGF2ZSBpc1JlYWR5IGFuZCBpc1JlYWR5UHJvbWlzZVxuICBpZiAoTWV0ZW9yLl9pc1Byb21pc2UoaGFuZGxlKSkge1xuICAgIGhhbmRsZS50aGVuKHNldFN1cHByZXNzZWQpO1xuICB9IGVsc2Uge1xuICAgIHNldFN1cHByZXNzZWQoaGFuZGxlKTtcbiAgfVxuICByZXR1cm4gaGFuZGxlO1xufTtcblxuTG9jYWxDb2xsZWN0aW9uLl9vYnNlcnZlQ2FsbGJhY2tzQXJlT3JkZXJlZCA9IGNhbGxiYWNrcyA9PiB7XG4gIGlmIChjYWxsYmFja3MuYWRkZWQgJiYgY2FsbGJhY2tzLmFkZGVkQXQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1BsZWFzZSBzcGVjaWZ5IG9ubHkgb25lIG9mIGFkZGVkKCkgYW5kIGFkZGVkQXQoKScpO1xuICB9XG5cbiAgaWYgKGNhbGxiYWNrcy5jaGFuZ2VkICYmIGNhbGxiYWNrcy5jaGFuZ2VkQXQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1BsZWFzZSBzcGVjaWZ5IG9ubHkgb25lIG9mIGNoYW5nZWQoKSBhbmQgY2hhbmdlZEF0KCknKTtcbiAgfVxuXG4gIGlmIChjYWxsYmFja3MucmVtb3ZlZCAmJiBjYWxsYmFja3MucmVtb3ZlZEF0KSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdQbGVhc2Ugc3BlY2lmeSBvbmx5IG9uZSBvZiByZW1vdmVkKCkgYW5kIHJlbW92ZWRBdCgpJyk7XG4gIH1cblxuICByZXR1cm4gISEoXG4gICAgY2FsbGJhY2tzLmFkZGVkQXQgfHxcbiAgICBjYWxsYmFja3MuY2hhbmdlZEF0IHx8XG4gICAgY2FsbGJhY2tzLm1vdmVkVG8gfHxcbiAgICBjYWxsYmFja3MucmVtb3ZlZEF0XG4gICk7XG59O1xuXG5Mb2NhbENvbGxlY3Rpb24uX29ic2VydmVDaGFuZ2VzQ2FsbGJhY2tzQXJlT3JkZXJlZCA9IGNhbGxiYWNrcyA9PiB7XG4gIGlmIChjYWxsYmFja3MuYWRkZWQgJiYgY2FsbGJhY2tzLmFkZGVkQmVmb3JlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdQbGVhc2Ugc3BlY2lmeSBvbmx5IG9uZSBvZiBhZGRlZCgpIGFuZCBhZGRlZEJlZm9yZSgpJyk7XG4gIH1cblxuICByZXR1cm4gISEoY2FsbGJhY2tzLmFkZGVkQmVmb3JlIHx8IGNhbGxiYWNrcy5tb3ZlZEJlZm9yZSk7XG59O1xuXG5Mb2NhbENvbGxlY3Rpb24uX3JlbW92ZUZyb21SZXN1bHRzU3luYyA9IChxdWVyeSwgZG9jKSA9PiB7XG4gIGlmIChxdWVyeS5vcmRlcmVkKSB7XG4gICAgY29uc3QgaSA9IExvY2FsQ29sbGVjdGlvbi5fZmluZEluT3JkZXJlZFJlc3VsdHMocXVlcnksIGRvYyk7XG5cbiAgICBxdWVyeS5yZW1vdmVkKGRvYy5faWQpO1xuICAgIHF1ZXJ5LnJlc3VsdHMuc3BsaWNlKGksIDEpO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IGlkID0gZG9jLl9pZDsgIC8vIGluIGNhc2UgY2FsbGJhY2sgbXV0YXRlcyBkb2NcblxuICAgIHF1ZXJ5LnJlbW92ZWQoZG9jLl9pZCk7XG4gICAgcXVlcnkucmVzdWx0cy5yZW1vdmUoaWQpO1xuICB9XG59O1xuXG5Mb2NhbENvbGxlY3Rpb24uX3JlbW92ZUZyb21SZXN1bHRzQXN5bmMgPSBhc3luYyAocXVlcnksIGRvYykgPT4ge1xuICBpZiAocXVlcnkub3JkZXJlZCkge1xuICAgIGNvbnN0IGkgPSBMb2NhbENvbGxlY3Rpb24uX2ZpbmRJbk9yZGVyZWRSZXN1bHRzKHF1ZXJ5LCBkb2MpO1xuXG4gICAgYXdhaXQgcXVlcnkucmVtb3ZlZChkb2MuX2lkKTtcbiAgICBxdWVyeS5yZXN1bHRzLnNwbGljZShpLCAxKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBpZCA9IGRvYy5faWQ7ICAvLyBpbiBjYXNlIGNhbGxiYWNrIG11dGF0ZXMgZG9jXG5cbiAgICBhd2FpdCBxdWVyeS5yZW1vdmVkKGRvYy5faWQpO1xuICAgIHF1ZXJ5LnJlc3VsdHMucmVtb3ZlKGlkKTtcbiAgfVxufTtcblxuLy8gSXMgdGhpcyBzZWxlY3RvciBqdXN0IHNob3J0aGFuZCBmb3IgbG9va3VwIGJ5IF9pZD9cbkxvY2FsQ29sbGVjdGlvbi5fc2VsZWN0b3JJc0lkID0gc2VsZWN0b3IgPT5cbiAgdHlwZW9mIHNlbGVjdG9yID09PSAnbnVtYmVyJyB8fFxuICB0eXBlb2Ygc2VsZWN0b3IgPT09ICdzdHJpbmcnIHx8XG4gIHNlbGVjdG9yIGluc3RhbmNlb2YgTW9uZ29JRC5PYmplY3RJRFxuO1xuXG4vLyBJcyB0aGUgc2VsZWN0b3IganVzdCBsb29rdXAgYnkgX2lkIChzaG9ydGhhbmQgb3Igbm90KT9cbkxvY2FsQ29sbGVjdGlvbi5fc2VsZWN0b3JJc0lkUGVyaGFwc0FzT2JqZWN0ID0gc2VsZWN0b3IgPT5cbiAgTG9jYWxDb2xsZWN0aW9uLl9zZWxlY3RvcklzSWQoc2VsZWN0b3IpIHx8XG4gIExvY2FsQ29sbGVjdGlvbi5fc2VsZWN0b3JJc0lkKHNlbGVjdG9yICYmIHNlbGVjdG9yLl9pZCkgJiZcbiAgT2JqZWN0LmtleXMoc2VsZWN0b3IpLmxlbmd0aCA9PT0gMVxuO1xuXG5Mb2NhbENvbGxlY3Rpb24uX3VwZGF0ZUluUmVzdWx0c1N5bmMgPSAocXVlcnksIGRvYywgb2xkX2RvYykgPT4ge1xuICBpZiAoIUVKU09OLmVxdWFscyhkb2MuX2lkLCBvbGRfZG9jLl9pZCkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0NhblxcJ3QgY2hhbmdlIGEgZG9jXFwncyBfaWQgd2hpbGUgdXBkYXRpbmcnKTtcbiAgfVxuXG4gIGNvbnN0IHByb2plY3Rpb25GbiA9IHF1ZXJ5LnByb2plY3Rpb25GbjtcbiAgY29uc3QgY2hhbmdlZEZpZWxkcyA9IERpZmZTZXF1ZW5jZS5tYWtlQ2hhbmdlZEZpZWxkcyhcbiAgICBwcm9qZWN0aW9uRm4oZG9jKSxcbiAgICBwcm9qZWN0aW9uRm4ob2xkX2RvYylcbiAgKTtcblxuICBpZiAoIXF1ZXJ5Lm9yZGVyZWQpIHtcbiAgICBpZiAoT2JqZWN0LmtleXMoY2hhbmdlZEZpZWxkcykubGVuZ3RoKSB7XG4gICAgICBxdWVyeS5jaGFuZ2VkKGRvYy5faWQsIGNoYW5nZWRGaWVsZHMpO1xuICAgICAgcXVlcnkucmVzdWx0cy5zZXQoZG9jLl9pZCwgZG9jKTtcbiAgICB9XG5cbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBvbGRfaWR4ID0gTG9jYWxDb2xsZWN0aW9uLl9maW5kSW5PcmRlcmVkUmVzdWx0cyhxdWVyeSwgZG9jKTtcblxuICBpZiAoT2JqZWN0LmtleXMoY2hhbmdlZEZpZWxkcykubGVuZ3RoKSB7XG4gICAgcXVlcnkuY2hhbmdlZChkb2MuX2lkLCBjaGFuZ2VkRmllbGRzKTtcbiAgfVxuXG4gIGlmICghcXVlcnkuc29ydGVyKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8ganVzdCB0YWtlIGl0IG91dCBhbmQgcHV0IGl0IGJhY2sgaW4gYWdhaW4sIGFuZCBzZWUgaWYgdGhlIGluZGV4IGNoYW5nZXNcbiAgcXVlcnkucmVzdWx0cy5zcGxpY2Uob2xkX2lkeCwgMSk7XG5cbiAgY29uc3QgbmV3X2lkeCA9IExvY2FsQ29sbGVjdGlvbi5faW5zZXJ0SW5Tb3J0ZWRMaXN0KFxuICAgIHF1ZXJ5LnNvcnRlci5nZXRDb21wYXJhdG9yKHtkaXN0YW5jZXM6IHF1ZXJ5LmRpc3RhbmNlc30pLFxuICAgIHF1ZXJ5LnJlc3VsdHMsXG4gICAgZG9jXG4gICk7XG5cbiAgaWYgKG9sZF9pZHggIT09IG5ld19pZHgpIHtcbiAgICBsZXQgbmV4dCA9IHF1ZXJ5LnJlc3VsdHNbbmV3X2lkeCArIDFdO1xuICAgIGlmIChuZXh0KSB7XG4gICAgICBuZXh0ID0gbmV4dC5faWQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5leHQgPSBudWxsO1xuICAgIH1cblxuICAgIHF1ZXJ5Lm1vdmVkQmVmb3JlICYmIHF1ZXJ5Lm1vdmVkQmVmb3JlKGRvYy5faWQsIG5leHQpO1xuICB9XG59O1xuXG5Mb2NhbENvbGxlY3Rpb24uX3VwZGF0ZUluUmVzdWx0c0FzeW5jID0gYXN5bmMgKHF1ZXJ5LCBkb2MsIG9sZF9kb2MpID0+IHtcbiAgaWYgKCFFSlNPTi5lcXVhbHMoZG9jLl9pZCwgb2xkX2RvYy5faWQpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdDYW5cXCd0IGNoYW5nZSBhIGRvY1xcJ3MgX2lkIHdoaWxlIHVwZGF0aW5nJyk7XG4gIH1cblxuICBjb25zdCBwcm9qZWN0aW9uRm4gPSBxdWVyeS5wcm9qZWN0aW9uRm47XG4gIGNvbnN0IGNoYW5nZWRGaWVsZHMgPSBEaWZmU2VxdWVuY2UubWFrZUNoYW5nZWRGaWVsZHMoXG4gICAgcHJvamVjdGlvbkZuKGRvYyksXG4gICAgcHJvamVjdGlvbkZuKG9sZF9kb2MpXG4gICk7XG5cbiAgaWYgKCFxdWVyeS5vcmRlcmVkKSB7XG4gICAgaWYgKE9iamVjdC5rZXlzKGNoYW5nZWRGaWVsZHMpLmxlbmd0aCkge1xuICAgICAgYXdhaXQgcXVlcnkuY2hhbmdlZChkb2MuX2lkLCBjaGFuZ2VkRmllbGRzKTtcbiAgICAgIHF1ZXJ5LnJlc3VsdHMuc2V0KGRvYy5faWQsIGRvYyk7XG4gICAgfVxuXG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3Qgb2xkX2lkeCA9IExvY2FsQ29sbGVjdGlvbi5fZmluZEluT3JkZXJlZFJlc3VsdHMocXVlcnksIGRvYyk7XG5cbiAgaWYgKE9iamVjdC5rZXlzKGNoYW5nZWRGaWVsZHMpLmxlbmd0aCkge1xuICAgIGF3YWl0IHF1ZXJ5LmNoYW5nZWQoZG9jLl9pZCwgY2hhbmdlZEZpZWxkcyk7XG4gIH1cblxuICBpZiAoIXF1ZXJ5LnNvcnRlcikge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIGp1c3QgdGFrZSBpdCBvdXQgYW5kIHB1dCBpdCBiYWNrIGluIGFnYWluLCBhbmQgc2VlIGlmIHRoZSBpbmRleCBjaGFuZ2VzXG4gIHF1ZXJ5LnJlc3VsdHMuc3BsaWNlKG9sZF9pZHgsIDEpO1xuXG4gIGNvbnN0IG5ld19pZHggPSBMb2NhbENvbGxlY3Rpb24uX2luc2VydEluU29ydGVkTGlzdChcbiAgICBxdWVyeS5zb3J0ZXIuZ2V0Q29tcGFyYXRvcih7ZGlzdGFuY2VzOiBxdWVyeS5kaXN0YW5jZXN9KSxcbiAgICBxdWVyeS5yZXN1bHRzLFxuICAgIGRvY1xuICApO1xuXG4gIGlmIChvbGRfaWR4ICE9PSBuZXdfaWR4KSB7XG4gICAgbGV0IG5leHQgPSBxdWVyeS5yZXN1bHRzW25ld19pZHggKyAxXTtcbiAgICBpZiAobmV4dCkge1xuICAgICAgbmV4dCA9IG5leHQuX2lkO1xuICAgIH0gZWxzZSB7XG4gICAgICBuZXh0ID0gbnVsbDtcbiAgICB9XG5cbiAgICBxdWVyeS5tb3ZlZEJlZm9yZSAmJiBhd2FpdCBxdWVyeS5tb3ZlZEJlZm9yZShkb2MuX2lkLCBuZXh0KTtcbiAgfVxufTtcblxuY29uc3QgTU9ESUZJRVJTID0ge1xuICAkY3VycmVudERhdGUodGFyZ2V0LCBmaWVsZCwgYXJnKSB7XG4gICAgaWYgKHR5cGVvZiBhcmcgPT09ICdvYmplY3QnICYmIGhhc093bi5jYWxsKGFyZywgJyR0eXBlJykpIHtcbiAgICAgIGlmIChhcmcuJHR5cGUgIT09ICdkYXRlJykge1xuICAgICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcihcbiAgICAgICAgICAnTWluaW1vbmdvIGRvZXMgY3VycmVudGx5IG9ubHkgc3VwcG9ydCB0aGUgZGF0ZSB0eXBlIGluICcgK1xuICAgICAgICAgICckY3VycmVudERhdGUgbW9kaWZpZXJzJyxcbiAgICAgICAgICB7ZmllbGR9XG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChhcmcgIT09IHRydWUpIHtcbiAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKCdJbnZhbGlkICRjdXJyZW50RGF0ZSBtb2RpZmllcicsIHtmaWVsZH0pO1xuICAgIH1cblxuICAgIHRhcmdldFtmaWVsZF0gPSBuZXcgRGF0ZSgpO1xuICB9LFxuICAkaW5jKHRhcmdldCwgZmllbGQsIGFyZykge1xuICAgIGlmICh0eXBlb2YgYXJnICE9PSAnbnVtYmVyJykge1xuICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoJ01vZGlmaWVyICRpbmMgYWxsb3dlZCBmb3IgbnVtYmVycyBvbmx5Jywge2ZpZWxkfSk7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkIGluIHRhcmdldCkge1xuICAgICAgaWYgKHR5cGVvZiB0YXJnZXRbZmllbGRdICE9PSAnbnVtYmVyJykge1xuICAgICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcihcbiAgICAgICAgICAnQ2Fubm90IGFwcGx5ICRpbmMgbW9kaWZpZXIgdG8gbm9uLW51bWJlcicsXG4gICAgICAgICAge2ZpZWxkfVxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICB0YXJnZXRbZmllbGRdICs9IGFyZztcbiAgICB9IGVsc2Uge1xuICAgICAgdGFyZ2V0W2ZpZWxkXSA9IGFyZztcbiAgICB9XG4gIH0sXG4gICRtaW4odGFyZ2V0LCBmaWVsZCwgYXJnKSB7XG4gICAgaWYgKHR5cGVvZiBhcmcgIT09ICdudW1iZXInKSB7XG4gICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcignTW9kaWZpZXIgJG1pbiBhbGxvd2VkIGZvciBudW1iZXJzIG9ubHknLCB7ZmllbGR9KTtcbiAgICB9XG5cbiAgICBpZiAoZmllbGQgaW4gdGFyZ2V0KSB7XG4gICAgICBpZiAodHlwZW9mIHRhcmdldFtmaWVsZF0gIT09ICdudW1iZXInKSB7XG4gICAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKFxuICAgICAgICAgICdDYW5ub3QgYXBwbHkgJG1pbiBtb2RpZmllciB0byBub24tbnVtYmVyJyxcbiAgICAgICAgICB7ZmllbGR9XG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGlmICh0YXJnZXRbZmllbGRdID4gYXJnKSB7XG4gICAgICAgIHRhcmdldFtmaWVsZF0gPSBhcmc7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRhcmdldFtmaWVsZF0gPSBhcmc7XG4gICAgfVxuICB9LFxuICAkbWF4KHRhcmdldCwgZmllbGQsIGFyZykge1xuICAgIGlmICh0eXBlb2YgYXJnICE9PSAnbnVtYmVyJykge1xuICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoJ01vZGlmaWVyICRtYXggYWxsb3dlZCBmb3IgbnVtYmVycyBvbmx5Jywge2ZpZWxkfSk7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkIGluIHRhcmdldCkge1xuICAgICAgaWYgKHR5cGVvZiB0YXJnZXRbZmllbGRdICE9PSAnbnVtYmVyJykge1xuICAgICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcihcbiAgICAgICAgICAnQ2Fubm90IGFwcGx5ICRtYXggbW9kaWZpZXIgdG8gbm9uLW51bWJlcicsXG4gICAgICAgICAge2ZpZWxkfVxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBpZiAodGFyZ2V0W2ZpZWxkXSA8IGFyZykge1xuICAgICAgICB0YXJnZXRbZmllbGRdID0gYXJnO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0YXJnZXRbZmllbGRdID0gYXJnO1xuICAgIH1cbiAgfSxcbiAgJG11bCh0YXJnZXQsIGZpZWxkLCBhcmcpIHtcbiAgICBpZiAodHlwZW9mIGFyZyAhPT0gJ251bWJlcicpIHtcbiAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKCdNb2RpZmllciAkbXVsIGFsbG93ZWQgZm9yIG51bWJlcnMgb25seScsIHtmaWVsZH0pO1xuICAgIH1cblxuICAgIGlmIChmaWVsZCBpbiB0YXJnZXQpIHtcbiAgICAgIGlmICh0eXBlb2YgdGFyZ2V0W2ZpZWxkXSAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoXG4gICAgICAgICAgJ0Nhbm5vdCBhcHBseSAkbXVsIG1vZGlmaWVyIHRvIG5vbi1udW1iZXInLFxuICAgICAgICAgIHtmaWVsZH1cbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgdGFyZ2V0W2ZpZWxkXSAqPSBhcmc7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRhcmdldFtmaWVsZF0gPSAwO1xuICAgIH1cbiAgfSxcbiAgJHJlbmFtZSh0YXJnZXQsIGZpZWxkLCBhcmcsIGtleXBhdGgsIGRvYykge1xuICAgIC8vIG5vIGlkZWEgd2h5IG1vbmdvIGhhcyB0aGlzIHJlc3RyaWN0aW9uLi5cbiAgICBpZiAoa2V5cGF0aCA9PT0gYXJnKSB7XG4gICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcignJHJlbmFtZSBzb3VyY2UgbXVzdCBkaWZmZXIgZnJvbSB0YXJnZXQnLCB7ZmllbGR9KTtcbiAgICB9XG5cbiAgICBpZiAodGFyZ2V0ID09PSBudWxsKSB7XG4gICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcignJHJlbmFtZSBzb3VyY2UgZmllbGQgaW52YWxpZCcsIHtmaWVsZH0pO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgYXJnICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoJyRyZW5hbWUgdGFyZ2V0IG11c3QgYmUgYSBzdHJpbmcnLCB7ZmllbGR9KTtcbiAgICB9XG5cbiAgICBpZiAoYXJnLmluY2x1ZGVzKCdcXDAnKSkge1xuICAgICAgLy8gTnVsbCBieXRlcyBhcmUgbm90IGFsbG93ZWQgaW4gTW9uZ28gZmllbGQgbmFtZXNcbiAgICAgIC8vIGh0dHBzOi8vZG9jcy5tb25nb2RiLmNvbS9tYW51YWwvcmVmZXJlbmNlL2xpbWl0cy8jUmVzdHJpY3Rpb25zLW9uLUZpZWxkLU5hbWVzXG4gICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcihcbiAgICAgICAgJ1RoZSBcXCd0b1xcJyBmaWVsZCBmb3IgJHJlbmFtZSBjYW5ub3QgY29udGFpbiBhbiBlbWJlZGRlZCBudWxsIGJ5dGUnLFxuICAgICAgICB7ZmllbGR9XG4gICAgICApO1xuICAgIH1cblxuICAgIGlmICh0YXJnZXQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IG9iamVjdCA9IHRhcmdldFtmaWVsZF07XG5cbiAgICBkZWxldGUgdGFyZ2V0W2ZpZWxkXTtcblxuICAgIGNvbnN0IGtleXBhcnRzID0gYXJnLnNwbGl0KCcuJyk7XG4gICAgY29uc3QgdGFyZ2V0MiA9IGZpbmRNb2RUYXJnZXQoZG9jLCBrZXlwYXJ0cywge2ZvcmJpZEFycmF5OiB0cnVlfSk7XG5cbiAgICBpZiAodGFyZ2V0MiA9PT0gbnVsbCkge1xuICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoJyRyZW5hbWUgdGFyZ2V0IGZpZWxkIGludmFsaWQnLCB7ZmllbGR9KTtcbiAgICB9XG5cbiAgICB0YXJnZXQyW2tleXBhcnRzLnBvcCgpXSA9IG9iamVjdDtcbiAgfSxcbiAgJHNldCh0YXJnZXQsIGZpZWxkLCBhcmcpIHtcbiAgICBpZiAodGFyZ2V0ICE9PSBPYmplY3QodGFyZ2V0KSkgeyAvLyBub3QgYW4gYXJyYXkgb3IgYW4gb2JqZWN0XG4gICAgICBjb25zdCBlcnJvciA9IE1pbmltb25nb0Vycm9yKFxuICAgICAgICAnQ2Fubm90IHNldCBwcm9wZXJ0eSBvbiBub24tb2JqZWN0IGZpZWxkJyxcbiAgICAgICAge2ZpZWxkfVxuICAgICAgKTtcbiAgICAgIGVycm9yLnNldFByb3BlcnR5RXJyb3IgPSB0cnVlO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuXG4gICAgaWYgKHRhcmdldCA9PT0gbnVsbCkge1xuICAgICAgY29uc3QgZXJyb3IgPSBNaW5pbW9uZ29FcnJvcignQ2Fubm90IHNldCBwcm9wZXJ0eSBvbiBudWxsJywge2ZpZWxkfSk7XG4gICAgICBlcnJvci5zZXRQcm9wZXJ0eUVycm9yID0gdHJ1ZTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cblxuICAgIGFzc2VydEhhc1ZhbGlkRmllbGROYW1lcyhhcmcpO1xuXG4gICAgdGFyZ2V0W2ZpZWxkXSA9IGFyZztcbiAgfSxcbiAgJHNldE9uSW5zZXJ0KHRhcmdldCwgZmllbGQsIGFyZykge1xuICAgIC8vIGNvbnZlcnRlZCB0byBgJHNldGAgaW4gYF9tb2RpZnlgXG4gIH0sXG4gICR1bnNldCh0YXJnZXQsIGZpZWxkLCBhcmcpIHtcbiAgICBpZiAodGFyZ2V0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGlmICh0YXJnZXQgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICBpZiAoZmllbGQgaW4gdGFyZ2V0KSB7XG4gICAgICAgICAgdGFyZ2V0W2ZpZWxkXSA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlbGV0ZSB0YXJnZXRbZmllbGRdO1xuICAgICAgfVxuICAgIH1cbiAgfSxcbiAgJHB1c2godGFyZ2V0LCBmaWVsZCwgYXJnKSB7XG4gICAgaWYgKHRhcmdldFtmaWVsZF0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgdGFyZ2V0W2ZpZWxkXSA9IFtdO1xuICAgIH1cblxuICAgIGlmICghKHRhcmdldFtmaWVsZF0gaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKCdDYW5ub3QgYXBwbHkgJHB1c2ggbW9kaWZpZXIgdG8gbm9uLWFycmF5Jywge2ZpZWxkfSk7XG4gICAgfVxuXG4gICAgaWYgKCEoYXJnICYmIGFyZy4kZWFjaCkpIHtcbiAgICAgIC8vIFNpbXBsZSBtb2RlOiBub3QgJGVhY2hcbiAgICAgIGFzc2VydEhhc1ZhbGlkRmllbGROYW1lcyhhcmcpO1xuXG4gICAgICB0YXJnZXRbZmllbGRdLnB1c2goYXJnKTtcblxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIEZhbmN5IG1vZGU6ICRlYWNoIChhbmQgbWF5YmUgJHNsaWNlIGFuZCAkc29ydCBhbmQgJHBvc2l0aW9uKVxuICAgIGNvbnN0IHRvUHVzaCA9IGFyZy4kZWFjaDtcbiAgICBpZiAoISh0b1B1c2ggaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKCckZWFjaCBtdXN0IGJlIGFuIGFycmF5Jywge2ZpZWxkfSk7XG4gICAgfVxuXG4gICAgYXNzZXJ0SGFzVmFsaWRGaWVsZE5hbWVzKHRvUHVzaCk7XG5cbiAgICAvLyBQYXJzZSAkcG9zaXRpb25cbiAgICBsZXQgcG9zaXRpb24gPSB1bmRlZmluZWQ7XG4gICAgaWYgKCckcG9zaXRpb24nIGluIGFyZykge1xuICAgICAgaWYgKHR5cGVvZiBhcmcuJHBvc2l0aW9uICE9PSAnbnVtYmVyJykge1xuICAgICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcignJHBvc2l0aW9uIG11c3QgYmUgYSBudW1lcmljIHZhbHVlJywge2ZpZWxkfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIFhYWCBzaG91bGQgY2hlY2sgdG8gbWFrZSBzdXJlIGludGVnZXJcbiAgICAgIGlmIChhcmcuJHBvc2l0aW9uIDwgMCkge1xuICAgICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcihcbiAgICAgICAgICAnJHBvc2l0aW9uIGluICRwdXNoIG11c3QgYmUgemVybyBvciBwb3NpdGl2ZScsXG4gICAgICAgICAge2ZpZWxkfVxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBwb3NpdGlvbiA9IGFyZy4kcG9zaXRpb247XG4gICAgfVxuXG4gICAgLy8gUGFyc2UgJHNsaWNlLlxuICAgIGxldCBzbGljZSA9IHVuZGVmaW5lZDtcbiAgICBpZiAoJyRzbGljZScgaW4gYXJnKSB7XG4gICAgICBpZiAodHlwZW9mIGFyZy4kc2xpY2UgIT09ICdudW1iZXInKSB7XG4gICAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKCckc2xpY2UgbXVzdCBiZSBhIG51bWVyaWMgdmFsdWUnLCB7ZmllbGR9KTtcbiAgICAgIH1cblxuICAgICAgLy8gWFhYIHNob3VsZCBjaGVjayB0byBtYWtlIHN1cmUgaW50ZWdlclxuICAgICAgc2xpY2UgPSBhcmcuJHNsaWNlO1xuICAgIH1cblxuICAgIC8vIFBhcnNlICRzb3J0LlxuICAgIGxldCBzb3J0RnVuY3Rpb24gPSB1bmRlZmluZWQ7XG4gICAgaWYgKGFyZy4kc29ydCkge1xuICAgICAgaWYgKHNsaWNlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoJyRzb3J0IHJlcXVpcmVzICRzbGljZSB0byBiZSBwcmVzZW50Jywge2ZpZWxkfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIFhYWCB0aGlzIGFsbG93cyB1cyB0byB1c2UgYSAkc29ydCB3aG9zZSB2YWx1ZSBpcyBhbiBhcnJheSwgYnV0IHRoYXQnc1xuICAgICAgLy8gYWN0dWFsbHkgYW4gZXh0ZW5zaW9uIG9mIHRoZSBOb2RlIGRyaXZlciwgc28gaXQgd29uJ3Qgd29ya1xuICAgICAgLy8gc2VydmVyLXNpZGUuIENvdWxkIGJlIGNvbmZ1c2luZyFcbiAgICAgIC8vIFhYWCBpcyBpdCBjb3JyZWN0IHRoYXQgd2UgZG9uJ3QgZG8gZ2VvLXN0dWZmIGhlcmU/XG4gICAgICBzb3J0RnVuY3Rpb24gPSBuZXcgTWluaW1vbmdvLlNvcnRlcihhcmcuJHNvcnQpLmdldENvbXBhcmF0b3IoKTtcblxuICAgICAgdG9QdXNoLmZvckVhY2goZWxlbWVudCA9PiB7XG4gICAgICAgIGlmIChMb2NhbENvbGxlY3Rpb24uX2YuX3R5cGUoZWxlbWVudCkgIT09IDMpIHtcbiAgICAgICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcihcbiAgICAgICAgICAgICckcHVzaCBsaWtlIG1vZGlmaWVycyB1c2luZyAkc29ydCByZXF1aXJlIGFsbCBlbGVtZW50cyB0byBiZSAnICtcbiAgICAgICAgICAgICdvYmplY3RzJyxcbiAgICAgICAgICAgIHtmaWVsZH1cbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBBY3R1YWxseSBwdXNoLlxuICAgIGlmIChwb3NpdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICB0b1B1c2guZm9yRWFjaChlbGVtZW50ID0+IHtcbiAgICAgICAgdGFyZ2V0W2ZpZWxkXS5wdXNoKGVsZW1lbnQpO1xuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHNwbGljZUFyZ3VtZW50cyA9IFtwb3NpdGlvbiwgMF07XG5cbiAgICAgIHRvUHVzaC5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgICBzcGxpY2VBcmd1bWVudHMucHVzaChlbGVtZW50KTtcbiAgICAgIH0pO1xuXG4gICAgICB0YXJnZXRbZmllbGRdLnNwbGljZSguLi5zcGxpY2VBcmd1bWVudHMpO1xuICAgIH1cblxuICAgIC8vIEFjdHVhbGx5IHNvcnQuXG4gICAgaWYgKHNvcnRGdW5jdGlvbikge1xuICAgICAgdGFyZ2V0W2ZpZWxkXS5zb3J0KHNvcnRGdW5jdGlvbik7XG4gICAgfVxuXG4gICAgLy8gQWN0dWFsbHkgc2xpY2UuXG4gICAgaWYgKHNsaWNlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGlmIChzbGljZSA9PT0gMCkge1xuICAgICAgICB0YXJnZXRbZmllbGRdID0gW107IC8vIGRpZmZlcnMgZnJvbSBBcnJheS5zbGljZSFcbiAgICAgIH0gZWxzZSBpZiAoc2xpY2UgPCAwKSB7XG4gICAgICAgIHRhcmdldFtmaWVsZF0gPSB0YXJnZXRbZmllbGRdLnNsaWNlKHNsaWNlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRhcmdldFtmaWVsZF0gPSB0YXJnZXRbZmllbGRdLnNsaWNlKDAsIHNsaWNlKTtcbiAgICAgIH1cbiAgICB9XG4gIH0sXG4gICRwdXNoQWxsKHRhcmdldCwgZmllbGQsIGFyZykge1xuICAgIGlmICghKHR5cGVvZiBhcmcgPT09ICdvYmplY3QnICYmIGFyZyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoJ01vZGlmaWVyICRwdXNoQWxsL3B1bGxBbGwgYWxsb3dlZCBmb3IgYXJyYXlzIG9ubHknKTtcbiAgICB9XG5cbiAgICBhc3NlcnRIYXNWYWxpZEZpZWxkTmFtZXMoYXJnKTtcblxuICAgIGNvbnN0IHRvUHVzaCA9IHRhcmdldFtmaWVsZF07XG5cbiAgICBpZiAodG9QdXNoID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHRhcmdldFtmaWVsZF0gPSBhcmc7XG4gICAgfSBlbHNlIGlmICghKHRvUHVzaCBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoXG4gICAgICAgICdDYW5ub3QgYXBwbHkgJHB1c2hBbGwgbW9kaWZpZXIgdG8gbm9uLWFycmF5JyxcbiAgICAgICAge2ZpZWxkfVxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdG9QdXNoLnB1c2goLi4uYXJnKTtcbiAgICB9XG4gIH0sXG4gICRhZGRUb1NldCh0YXJnZXQsIGZpZWxkLCBhcmcpIHtcbiAgICBsZXQgaXNFYWNoID0gZmFsc2U7XG5cbiAgICBpZiAodHlwZW9mIGFyZyA9PT0gJ29iamVjdCcpIHtcbiAgICAgIC8vIGNoZWNrIGlmIGZpcnN0IGtleSBpcyAnJGVhY2gnXG4gICAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMoYXJnKTtcbiAgICAgIGlmIChrZXlzWzBdID09PSAnJGVhY2gnKSB7XG4gICAgICAgIGlzRWFjaCA9IHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgdmFsdWVzID0gaXNFYWNoID8gYXJnLiRlYWNoIDogW2FyZ107XG5cbiAgICBhc3NlcnRIYXNWYWxpZEZpZWxkTmFtZXModmFsdWVzKTtcblxuICAgIGNvbnN0IHRvQWRkID0gdGFyZ2V0W2ZpZWxkXTtcbiAgICBpZiAodG9BZGQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgdGFyZ2V0W2ZpZWxkXSA9IHZhbHVlcztcbiAgICB9IGVsc2UgaWYgKCEodG9BZGQgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKFxuICAgICAgICAnQ2Fubm90IGFwcGx5ICRhZGRUb1NldCBtb2RpZmllciB0byBub24tYXJyYXknLFxuICAgICAgICB7ZmllbGR9XG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YWx1ZXMuZm9yRWFjaCh2YWx1ZSA9PiB7XG4gICAgICAgIGlmICh0b0FkZC5zb21lKGVsZW1lbnQgPT4gTG9jYWxDb2xsZWN0aW9uLl9mLl9lcXVhbCh2YWx1ZSwgZWxlbWVudCkpKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdG9BZGQucHVzaCh2YWx1ZSk7XG4gICAgICB9KTtcbiAgICB9XG4gIH0sXG4gICRwb3AodGFyZ2V0LCBmaWVsZCwgYXJnKSB7XG4gICAgaWYgKHRhcmdldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgdG9Qb3AgPSB0YXJnZXRbZmllbGRdO1xuXG4gICAgaWYgKHRvUG9wID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoISh0b1BvcCBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoJ0Nhbm5vdCBhcHBseSAkcG9wIG1vZGlmaWVyIHRvIG5vbi1hcnJheScsIHtmaWVsZH0pO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgYXJnID09PSAnbnVtYmVyJyAmJiBhcmcgPCAwKSB7XG4gICAgICB0b1BvcC5zcGxpY2UoMCwgMSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRvUG9wLnBvcCgpO1xuICAgIH1cbiAgfSxcbiAgJHB1bGwodGFyZ2V0LCBmaWVsZCwgYXJnKSB7XG4gICAgaWYgKHRhcmdldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgdG9QdWxsID0gdGFyZ2V0W2ZpZWxkXTtcbiAgICBpZiAodG9QdWxsID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoISh0b1B1bGwgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKFxuICAgICAgICAnQ2Fubm90IGFwcGx5ICRwdWxsL3B1bGxBbGwgbW9kaWZpZXIgdG8gbm9uLWFycmF5JyxcbiAgICAgICAge2ZpZWxkfVxuICAgICAgKTtcbiAgICB9XG5cbiAgICBsZXQgb3V0O1xuICAgIGlmIChhcmcgIT0gbnVsbCAmJiB0eXBlb2YgYXJnID09PSAnb2JqZWN0JyAmJiAhKGFyZyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgLy8gWFhYIHdvdWxkIGJlIG11Y2ggbmljZXIgdG8gY29tcGlsZSB0aGlzIG9uY2UsIHJhdGhlciB0aGFuXG4gICAgICAvLyBmb3IgZWFjaCBkb2N1bWVudCB3ZSBtb2RpZnkuLiBidXQgdXN1YWxseSB3ZSdyZSBub3RcbiAgICAgIC8vIG1vZGlmeWluZyB0aGF0IG1hbnkgZG9jdW1lbnRzLCBzbyB3ZSdsbCBsZXQgaXQgc2xpZGUgZm9yXG4gICAgICAvLyBub3dcblxuICAgICAgLy8gWFhYIE1pbmltb25nby5NYXRjaGVyIGlzbid0IHVwIGZvciB0aGUgam9iLCBiZWNhdXNlIHdlIG5lZWRcbiAgICAgIC8vIHRvIHBlcm1pdCBzdHVmZiBsaWtlIHskcHVsbDoge2E6IHskZ3Q6IDR9fX0uLiBzb21ldGhpbmdcbiAgICAgIC8vIGxpa2UgeyRndDogNH0gaXMgbm90IG5vcm1hbGx5IGEgY29tcGxldGUgc2VsZWN0b3IuXG4gICAgICAvLyBzYW1lIGlzc3VlIGFzICRlbGVtTWF0Y2ggcG9zc2libHk/XG4gICAgICBjb25zdCBtYXRjaGVyID0gbmV3IE1pbmltb25nby5NYXRjaGVyKGFyZyk7XG5cbiAgICAgIG91dCA9IHRvUHVsbC5maWx0ZXIoZWxlbWVudCA9PiAhbWF0Y2hlci5kb2N1bWVudE1hdGNoZXMoZWxlbWVudCkucmVzdWx0KTtcbiAgICB9IGVsc2Uge1xuICAgICAgb3V0ID0gdG9QdWxsLmZpbHRlcihlbGVtZW50ID0+ICFMb2NhbENvbGxlY3Rpb24uX2YuX2VxdWFsKGVsZW1lbnQsIGFyZykpO1xuICAgIH1cblxuICAgIHRhcmdldFtmaWVsZF0gPSBvdXQ7XG4gIH0sXG4gICRwdWxsQWxsKHRhcmdldCwgZmllbGQsIGFyZykge1xuICAgIGlmICghKHR5cGVvZiBhcmcgPT09ICdvYmplY3QnICYmIGFyZyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoXG4gICAgICAgICdNb2RpZmllciAkcHVzaEFsbC9wdWxsQWxsIGFsbG93ZWQgZm9yIGFycmF5cyBvbmx5JyxcbiAgICAgICAge2ZpZWxkfVxuICAgICAgKTtcbiAgICB9XG5cbiAgICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB0b1B1bGwgPSB0YXJnZXRbZmllbGRdO1xuXG4gICAgaWYgKHRvUHVsbCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCEodG9QdWxsIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcihcbiAgICAgICAgJ0Nhbm5vdCBhcHBseSAkcHVsbC9wdWxsQWxsIG1vZGlmaWVyIHRvIG5vbi1hcnJheScsXG4gICAgICAgIHtmaWVsZH1cbiAgICAgICk7XG4gICAgfVxuXG4gICAgdGFyZ2V0W2ZpZWxkXSA9IHRvUHVsbC5maWx0ZXIob2JqZWN0ID0+XG4gICAgICAhYXJnLnNvbWUoZWxlbWVudCA9PiBMb2NhbENvbGxlY3Rpb24uX2YuX2VxdWFsKG9iamVjdCwgZWxlbWVudCkpXG4gICAgKTtcbiAgfSxcbiAgJGJpdCh0YXJnZXQsIGZpZWxkLCBhcmcpIHtcbiAgICAvLyBYWFggbW9uZ28gb25seSBzdXBwb3J0cyAkYml0IG9uIGludGVnZXJzLCBhbmQgd2Ugb25seSBzdXBwb3J0XG4gICAgLy8gbmF0aXZlIGphdmFzY3JpcHQgbnVtYmVycyAoZG91Ymxlcykgc28gZmFyLCBzbyB3ZSBjYW4ndCBzdXBwb3J0ICRiaXRcbiAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcignJGJpdCBpcyBub3Qgc3VwcG9ydGVkJywge2ZpZWxkfSk7XG4gIH0sXG4gICR2KCkge1xuICAgIC8vIEFzIGRpc2N1c3NlZCBpbiBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9pc3N1ZXMvOTYyMyxcbiAgICAvLyB0aGUgYCR2YCBvcGVyYXRvciBpcyBub3QgbmVlZGVkIGJ5IE1ldGVvciwgYnV0IHByb2JsZW1zIGNhbiBvY2N1ciBpZlxuICAgIC8vIGl0J3Mgbm90IGF0IGxlYXN0IGNhbGxhYmxlIChhcyBvZiBNb25nbyA+PSAzLjYpLiBJdCdzIGRlZmluZWQgaGVyZSBhc1xuICAgIC8vIGEgbm8tb3AgdG8gd29yayBhcm91bmQgdGhlc2UgcHJvYmxlbXMuXG4gIH1cbn07XG5cbmNvbnN0IE5PX0NSRUFURV9NT0RJRklFUlMgPSB7XG4gICRwb3A6IHRydWUsXG4gICRwdWxsOiB0cnVlLFxuICAkcHVsbEFsbDogdHJ1ZSxcbiAgJHJlbmFtZTogdHJ1ZSxcbiAgJHVuc2V0OiB0cnVlXG59O1xuXG4vLyBNYWtlIHN1cmUgZmllbGQgbmFtZXMgZG8gbm90IGNvbnRhaW4gTW9uZ28gcmVzdHJpY3RlZFxuLy8gY2hhcmFjdGVycyAoJy4nLCAnJCcsICdcXDAnKS5cbi8vIGh0dHBzOi8vZG9jcy5tb25nb2RiLmNvbS9tYW51YWwvcmVmZXJlbmNlL2xpbWl0cy8jUmVzdHJpY3Rpb25zLW9uLUZpZWxkLU5hbWVzXG5jb25zdCBpbnZhbGlkQ2hhck1zZyA9IHtcbiAgJDogJ3N0YXJ0IHdpdGggXFwnJFxcJycsXG4gICcuJzogJ2NvbnRhaW4gXFwnLlxcJycsXG4gICdcXDAnOiAnY29udGFpbiBudWxsIGJ5dGVzJ1xufTtcblxuLy8gY2hlY2tzIGlmIGFsbCBmaWVsZCBuYW1lcyBpbiBhbiBvYmplY3QgYXJlIHZhbGlkXG5mdW5jdGlvbiBhc3NlcnRIYXNWYWxpZEZpZWxkTmFtZXMoZG9jKSB7XG4gIGlmIChkb2MgJiYgdHlwZW9mIGRvYyA9PT0gJ29iamVjdCcpIHtcbiAgICBKU09OLnN0cmluZ2lmeShkb2MsIChrZXksIHZhbHVlKSA9PiB7XG4gICAgICBhc3NlcnRJc1ZhbGlkRmllbGROYW1lKGtleSk7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gYXNzZXJ0SXNWYWxpZEZpZWxkTmFtZShrZXkpIHtcbiAgbGV0IG1hdGNoO1xuICBpZiAodHlwZW9mIGtleSA9PT0gJ3N0cmluZycgJiYgKG1hdGNoID0ga2V5Lm1hdGNoKC9eXFwkfFxcLnxcXDAvKSkpIHtcbiAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcihgS2V5ICR7a2V5fSBtdXN0IG5vdCAke2ludmFsaWRDaGFyTXNnW21hdGNoWzBdXX1gKTtcbiAgfVxufVxuXG4vLyBmb3IgYS5iLmMuMi5kLmUsIGtleXBhcnRzIHNob3VsZCBiZSBbJ2EnLCAnYicsICdjJywgJzInLCAnZCcsICdlJ10sXG4vLyBhbmQgdGhlbiB5b3Ugd291bGQgb3BlcmF0ZSBvbiB0aGUgJ2UnIHByb3BlcnR5IG9mIHRoZSByZXR1cm5lZFxuLy8gb2JqZWN0LlxuLy9cbi8vIGlmIG9wdGlvbnMubm9DcmVhdGUgaXMgZmFsc2V5LCBjcmVhdGVzIGludGVybWVkaWF0ZSBsZXZlbHMgb2Zcbi8vIHN0cnVjdHVyZSBhcyBuZWNlc3NhcnksIGxpa2UgbWtkaXIgLXAgKGFuZCByYWlzZXMgYW4gZXhjZXB0aW9uIGlmXG4vLyB0aGF0IHdvdWxkIG1lYW4gZ2l2aW5nIGEgbm9uLW51bWVyaWMgcHJvcGVydHkgdG8gYW4gYXJyYXkuKSBpZlxuLy8gb3B0aW9ucy5ub0NyZWF0ZSBpcyB0cnVlLCByZXR1cm4gdW5kZWZpbmVkIGluc3RlYWQuXG4vL1xuLy8gbWF5IG1vZGlmeSB0aGUgbGFzdCBlbGVtZW50IG9mIGtleXBhcnRzIHRvIHNpZ25hbCB0byB0aGUgY2FsbGVyIHRoYXQgaXQgbmVlZHNcbi8vIHRvIHVzZSBhIGRpZmZlcmVudCB2YWx1ZSB0byBpbmRleCBpbnRvIHRoZSByZXR1cm5lZCBvYmplY3QgKGZvciBleGFtcGxlLFxuLy8gWydhJywgJzAxJ10gLT4gWydhJywgMV0pLlxuLy9cbi8vIGlmIGZvcmJpZEFycmF5IGlzIHRydWUsIHJldHVybiBudWxsIGlmIHRoZSBrZXlwYXRoIGdvZXMgdGhyb3VnaCBhbiBhcnJheS5cbi8vXG4vLyBpZiBvcHRpb25zLmFycmF5SW5kaWNlcyBpcyBzZXQsIHVzZSBpdHMgZmlyc3QgZWxlbWVudCBmb3IgdGhlIChmaXJzdCkgJyQnIGluXG4vLyB0aGUgcGF0aC5cbmZ1bmN0aW9uIGZpbmRNb2RUYXJnZXQoZG9jLCBrZXlwYXJ0cywgb3B0aW9ucyA9IHt9KSB7XG4gIGxldCB1c2VkQXJyYXlJbmRleCA9IGZhbHNlO1xuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwga2V5cGFydHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBsYXN0ID0gaSA9PT0ga2V5cGFydHMubGVuZ3RoIC0gMTtcbiAgICBsZXQga2V5cGFydCA9IGtleXBhcnRzW2ldO1xuXG4gICAgaWYgKCFpc0luZGV4YWJsZShkb2MpKSB7XG4gICAgICBpZiAob3B0aW9ucy5ub0NyZWF0ZSkge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBlcnJvciA9IE1pbmltb25nb0Vycm9yKFxuICAgICAgICBgY2Fubm90IHVzZSB0aGUgcGFydCAnJHtrZXlwYXJ0fScgdG8gdHJhdmVyc2UgJHtkb2N9YFxuICAgICAgKTtcbiAgICAgIGVycm9yLnNldFByb3BlcnR5RXJyb3IgPSB0cnVlO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuXG4gICAgaWYgKGRvYyBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICBpZiAob3B0aW9ucy5mb3JiaWRBcnJheSkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgaWYgKGtleXBhcnQgPT09ICckJykge1xuICAgICAgICBpZiAodXNlZEFycmF5SW5kZXgpIHtcbiAgICAgICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcignVG9vIG1hbnkgcG9zaXRpb25hbCAoaS5lLiBcXCckXFwnKSBlbGVtZW50cycpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFvcHRpb25zLmFycmF5SW5kaWNlcyB8fCAhb3B0aW9ucy5hcnJheUluZGljZXMubGVuZ3RoKSB7XG4gICAgICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoXG4gICAgICAgICAgICAnVGhlIHBvc2l0aW9uYWwgb3BlcmF0b3IgZGlkIG5vdCBmaW5kIHRoZSBtYXRjaCBuZWVkZWQgZnJvbSB0aGUgJyArXG4gICAgICAgICAgICAncXVlcnknXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGtleXBhcnQgPSBvcHRpb25zLmFycmF5SW5kaWNlc1swXTtcbiAgICAgICAgdXNlZEFycmF5SW5kZXggPSB0cnVlO1xuICAgICAgfSBlbHNlIGlmIChpc051bWVyaWNLZXkoa2V5cGFydCkpIHtcbiAgICAgICAga2V5cGFydCA9IHBhcnNlSW50KGtleXBhcnQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKG9wdGlvbnMubm9DcmVhdGUpIHtcbiAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoXG4gICAgICAgICAgYGNhbid0IGFwcGVuZCB0byBhcnJheSB1c2luZyBzdHJpbmcgZmllbGQgbmFtZSBbJHtrZXlwYXJ0fV1gXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGlmIChsYXN0KSB7XG4gICAgICAgIGtleXBhcnRzW2ldID0ga2V5cGFydDsgLy8gaGFuZGxlICdhLjAxJ1xuICAgICAgfVxuXG4gICAgICBpZiAob3B0aW9ucy5ub0NyZWF0ZSAmJiBrZXlwYXJ0ID49IGRvYy5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIH1cblxuICAgICAgd2hpbGUgKGRvYy5sZW5ndGggPCBrZXlwYXJ0KSB7XG4gICAgICAgIGRvYy5wdXNoKG51bGwpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIWxhc3QpIHtcbiAgICAgICAgaWYgKGRvYy5sZW5ndGggPT09IGtleXBhcnQpIHtcbiAgICAgICAgICBkb2MucHVzaCh7fSk7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGRvY1trZXlwYXJ0XSAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcihcbiAgICAgICAgICAgIGBjYW4ndCBtb2RpZnkgZmllbGQgJyR7a2V5cGFydHNbaSArIDFdfScgb2YgbGlzdCB2YWx1ZSBgICtcbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGRvY1trZXlwYXJ0XSlcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGFzc2VydElzVmFsaWRGaWVsZE5hbWUoa2V5cGFydCk7XG5cbiAgICAgIGlmICghKGtleXBhcnQgaW4gZG9jKSkge1xuICAgICAgICBpZiAob3B0aW9ucy5ub0NyZWF0ZSkge1xuICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWxhc3QpIHtcbiAgICAgICAgICBkb2Nba2V5cGFydF0gPSB7fTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChsYXN0KSB7XG4gICAgICByZXR1cm4gZG9jO1xuICAgIH1cblxuICAgIGRvYyA9IGRvY1trZXlwYXJ0XTtcbiAgfVxuXG4gIC8vIG5vdHJlYWNoZWRcbn1cbiIsImltcG9ydCBMb2NhbENvbGxlY3Rpb24gZnJvbSAnLi9sb2NhbF9jb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7XG4gIGNvbXBpbGVEb2N1bWVudFNlbGVjdG9yLFxuICBoYXNPd24sXG4gIG5vdGhpbmdNYXRjaGVyLFxufSBmcm9tICcuL2NvbW1vbi5qcyc7XG5cbmNvbnN0IERlY2ltYWwgPSBQYWNrYWdlWydtb25nby1kZWNpbWFsJ10/LkRlY2ltYWwgfHwgY2xhc3MgRGVjaW1hbFN0dWIge31cblxuLy8gVGhlIG1pbmltb25nbyBzZWxlY3RvciBjb21waWxlciFcblxuLy8gVGVybWlub2xvZ3k6XG4vLyAgLSBhICdzZWxlY3RvcicgaXMgdGhlIEVKU09OIG9iamVjdCByZXByZXNlbnRpbmcgYSBzZWxlY3RvclxuLy8gIC0gYSAnbWF0Y2hlcicgaXMgaXRzIGNvbXBpbGVkIGZvcm0gKHdoZXRoZXIgYSBmdWxsIE1pbmltb25nby5NYXRjaGVyXG4vLyAgICBvYmplY3Qgb3Igb25lIG9mIHRoZSBjb21wb25lbnQgbGFtYmRhcyB0aGF0IG1hdGNoZXMgcGFydHMgb2YgaXQpXG4vLyAgLSBhICdyZXN1bHQgb2JqZWN0JyBpcyBhbiBvYmplY3Qgd2l0aCBhICdyZXN1bHQnIGZpZWxkIGFuZCBtYXliZVxuLy8gICAgZGlzdGFuY2UgYW5kIGFycmF5SW5kaWNlcy5cbi8vICAtIGEgJ2JyYW5jaGVkIHZhbHVlJyBpcyBhbiBvYmplY3Qgd2l0aCBhICd2YWx1ZScgZmllbGQgYW5kIG1heWJlXG4vLyAgICAnZG9udEl0ZXJhdGUnIGFuZCAnYXJyYXlJbmRpY2VzJy5cbi8vICAtIGEgJ2RvY3VtZW50JyBpcyBhIHRvcC1sZXZlbCBvYmplY3QgdGhhdCBjYW4gYmUgc3RvcmVkIGluIGEgY29sbGVjdGlvbi5cbi8vICAtIGEgJ2xvb2t1cCBmdW5jdGlvbicgaXMgYSBmdW5jdGlvbiB0aGF0IHRha2VzIGluIGEgZG9jdW1lbnQgYW5kIHJldHVybnNcbi8vICAgIGFuIGFycmF5IG9mICdicmFuY2hlZCB2YWx1ZXMnLlxuLy8gIC0gYSAnYnJhbmNoZWQgbWF0Y2hlcicgbWFwcyBmcm9tIGFuIGFycmF5IG9mIGJyYW5jaGVkIHZhbHVlcyB0byBhIHJlc3VsdFxuLy8gICAgb2JqZWN0LlxuLy8gIC0gYW4gJ2VsZW1lbnQgbWF0Y2hlcicgbWFwcyBmcm9tIGEgc2luZ2xlIHZhbHVlIHRvIGEgYm9vbC5cblxuLy8gTWFpbiBlbnRyeSBwb2ludC5cbi8vICAgdmFyIG1hdGNoZXIgPSBuZXcgTWluaW1vbmdvLk1hdGNoZXIoe2E6IHskZ3Q6IDV9fSk7XG4vLyAgIGlmIChtYXRjaGVyLmRvY3VtZW50TWF0Y2hlcyh7YTogN30pKSAuLi5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1hdGNoZXIge1xuICBjb25zdHJ1Y3RvcihzZWxlY3RvciwgaXNVcGRhdGUpIHtcbiAgICAvLyBBIHNldCAob2JqZWN0IG1hcHBpbmcgc3RyaW5nIC0+ICopIG9mIGFsbCBvZiB0aGUgZG9jdW1lbnQgcGF0aHMgbG9va2VkXG4gICAgLy8gYXQgYnkgdGhlIHNlbGVjdG9yLiBBbHNvIGluY2x1ZGVzIHRoZSBlbXB0eSBzdHJpbmcgaWYgaXQgbWF5IGxvb2sgYXQgYW55XG4gICAgLy8gcGF0aCAoZWcsICR3aGVyZSkuXG4gICAgdGhpcy5fcGF0aHMgPSB7fTtcbiAgICAvLyBTZXQgdG8gdHJ1ZSBpZiBjb21waWxhdGlvbiBmaW5kcyBhICRuZWFyLlxuICAgIHRoaXMuX2hhc0dlb1F1ZXJ5ID0gZmFsc2U7XG4gICAgLy8gU2V0IHRvIHRydWUgaWYgY29tcGlsYXRpb24gZmluZHMgYSAkd2hlcmUuXG4gICAgdGhpcy5faGFzV2hlcmUgPSBmYWxzZTtcbiAgICAvLyBTZXQgdG8gZmFsc2UgaWYgY29tcGlsYXRpb24gZmluZHMgYW55dGhpbmcgb3RoZXIgdGhhbiBhIHNpbXBsZSBlcXVhbGl0eVxuICAgIC8vIG9yIG9uZSBvciBtb3JlIG9mICckZ3QnLCAnJGd0ZScsICckbHQnLCAnJGx0ZScsICckbmUnLCAnJGluJywgJyRuaW4nIHVzZWRcbiAgICAvLyB3aXRoIHNjYWxhcnMgYXMgb3BlcmFuZHMuXG4gICAgdGhpcy5faXNTaW1wbGUgPSB0cnVlO1xuICAgIC8vIFNldCB0byBhIGR1bW15IGRvY3VtZW50IHdoaWNoIGFsd2F5cyBtYXRjaGVzIHRoaXMgTWF0Y2hlci4gT3Igc2V0IHRvIG51bGxcbiAgICAvLyBpZiBzdWNoIGRvY3VtZW50IGlzIHRvbyBoYXJkIHRvIGZpbmQuXG4gICAgdGhpcy5fbWF0Y2hpbmdEb2N1bWVudCA9IHVuZGVmaW5lZDtcbiAgICAvLyBBIGNsb25lIG9mIHRoZSBvcmlnaW5hbCBzZWxlY3Rvci4gSXQgbWF5IGp1c3QgYmUgYSBmdW5jdGlvbiBpZiB0aGUgdXNlclxuICAgIC8vIHBhc3NlZCBpbiBhIGZ1bmN0aW9uOyBvdGhlcndpc2UgaXMgZGVmaW5pdGVseSBhbiBvYmplY3QgKGVnLCBJRHMgYXJlXG4gICAgLy8gdHJhbnNsYXRlZCBpbnRvIHtfaWQ6IElEfSBmaXJzdC4gVXNlZCBieSBjYW5CZWNvbWVUcnVlQnlNb2RpZmllciBhbmRcbiAgICAvLyBTb3J0ZXIuX3VzZVdpdGhNYXRjaGVyLlxuICAgIHRoaXMuX3NlbGVjdG9yID0gbnVsbDtcbiAgICB0aGlzLl9kb2NNYXRjaGVyID0gdGhpcy5fY29tcGlsZVNlbGVjdG9yKHNlbGVjdG9yKTtcbiAgICAvLyBTZXQgdG8gdHJ1ZSBpZiBzZWxlY3Rpb24gaXMgZG9uZSBmb3IgYW4gdXBkYXRlIG9wZXJhdGlvblxuICAgIC8vIERlZmF1bHQgaXMgZmFsc2VcbiAgICAvLyBVc2VkIGZvciAkbmVhciBhcnJheSB1cGRhdGUgKGlzc3VlICMzNTk5KVxuICAgIHRoaXMuX2lzVXBkYXRlID0gaXNVcGRhdGU7XG4gIH1cblxuICBkb2N1bWVudE1hdGNoZXMoZG9jKSB7XG4gICAgaWYgKGRvYyAhPT0gT2JqZWN0KGRvYykpIHtcbiAgICAgIHRocm93IEVycm9yKCdkb2N1bWVudE1hdGNoZXMgbmVlZHMgYSBkb2N1bWVudCcpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9kb2NNYXRjaGVyKGRvYyk7XG4gIH1cblxuICBoYXNHZW9RdWVyeSgpIHtcbiAgICByZXR1cm4gdGhpcy5faGFzR2VvUXVlcnk7XG4gIH1cblxuICBoYXNXaGVyZSgpIHtcbiAgICByZXR1cm4gdGhpcy5faGFzV2hlcmU7XG4gIH1cblxuICBpc1NpbXBsZSgpIHtcbiAgICByZXR1cm4gdGhpcy5faXNTaW1wbGU7XG4gIH1cblxuICAvLyBHaXZlbiBhIHNlbGVjdG9yLCByZXR1cm4gYSBmdW5jdGlvbiB0aGF0IHRha2VzIG9uZSBhcmd1bWVudCwgYVxuICAvLyBkb2N1bWVudC4gSXQgcmV0dXJucyBhIHJlc3VsdCBvYmplY3QuXG4gIF9jb21waWxlU2VsZWN0b3Ioc2VsZWN0b3IpIHtcbiAgICAvLyB5b3UgY2FuIHBhc3MgYSBsaXRlcmFsIGZ1bmN0aW9uIGluc3RlYWQgb2YgYSBzZWxlY3RvclxuICAgIGlmIChzZWxlY3RvciBpbnN0YW5jZW9mIEZ1bmN0aW9uKSB7XG4gICAgICB0aGlzLl9pc1NpbXBsZSA9IGZhbHNlO1xuICAgICAgdGhpcy5fc2VsZWN0b3IgPSBzZWxlY3RvcjtcbiAgICAgIHRoaXMuX3JlY29yZFBhdGhVc2VkKCcnKTtcblxuICAgICAgcmV0dXJuIGRvYyA9PiAoe3Jlc3VsdDogISFzZWxlY3Rvci5jYWxsKGRvYyl9KTtcbiAgICB9XG5cbiAgICAvLyBzaG9ydGhhbmQgLS0gc2NhbGFyIF9pZFxuICAgIGlmIChMb2NhbENvbGxlY3Rpb24uX3NlbGVjdG9ySXNJZChzZWxlY3RvcikpIHtcbiAgICAgIHRoaXMuX3NlbGVjdG9yID0ge19pZDogc2VsZWN0b3J9O1xuICAgICAgdGhpcy5fcmVjb3JkUGF0aFVzZWQoJ19pZCcpO1xuXG4gICAgICByZXR1cm4gZG9jID0+ICh7cmVzdWx0OiBFSlNPTi5lcXVhbHMoZG9jLl9pZCwgc2VsZWN0b3IpfSk7XG4gICAgfVxuXG4gICAgLy8gcHJvdGVjdCBhZ2FpbnN0IGRhbmdlcm91cyBzZWxlY3RvcnMuICBmYWxzZXkgYW5kIHtfaWQ6IGZhbHNleX0gYXJlIGJvdGhcbiAgICAvLyBsaWtlbHkgcHJvZ3JhbW1lciBlcnJvciwgYW5kIG5vdCB3aGF0IHlvdSB3YW50LCBwYXJ0aWN1bGFybHkgZm9yXG4gICAgLy8gZGVzdHJ1Y3RpdmUgb3BlcmF0aW9ucy5cbiAgICBpZiAoIXNlbGVjdG9yIHx8IGhhc093bi5jYWxsKHNlbGVjdG9yLCAnX2lkJykgJiYgIXNlbGVjdG9yLl9pZCkge1xuICAgICAgdGhpcy5faXNTaW1wbGUgPSBmYWxzZTtcbiAgICAgIHJldHVybiBub3RoaW5nTWF0Y2hlcjtcbiAgICB9XG5cbiAgICAvLyBUb3AgbGV2ZWwgY2FuJ3QgYmUgYW4gYXJyYXkgb3IgdHJ1ZSBvciBiaW5hcnkuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoc2VsZWN0b3IpIHx8XG4gICAgICAgIEVKU09OLmlzQmluYXJ5KHNlbGVjdG9yKSB8fFxuICAgICAgICB0eXBlb2Ygc2VsZWN0b3IgPT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIHNlbGVjdG9yOiAke3NlbGVjdG9yfWApO1xuICAgIH1cblxuICAgIHRoaXMuX3NlbGVjdG9yID0gRUpTT04uY2xvbmUoc2VsZWN0b3IpO1xuXG4gICAgcmV0dXJuIGNvbXBpbGVEb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yLCB0aGlzLCB7aXNSb290OiB0cnVlfSk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgbGlzdCBvZiBrZXkgcGF0aHMgdGhlIGdpdmVuIHNlbGVjdG9yIGlzIGxvb2tpbmcgZm9yLiBJdCBpbmNsdWRlc1xuICAvLyB0aGUgZW1wdHkgc3RyaW5nIGlmIHRoZXJlIGlzIGEgJHdoZXJlLlxuICBfZ2V0UGF0aHMoKSB7XG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKHRoaXMuX3BhdGhzKTtcbiAgfVxuXG4gIF9yZWNvcmRQYXRoVXNlZChwYXRoKSB7XG4gICAgdGhpcy5fcGF0aHNbcGF0aF0gPSB0cnVlO1xuICB9XG59XG5cbi8vIGhlbHBlcnMgdXNlZCBieSBjb21waWxlZCBzZWxlY3RvciBjb2RlXG5Mb2NhbENvbGxlY3Rpb24uX2YgPSB7XG4gIC8vIFhYWCBmb3IgX2FsbCBhbmQgX2luLCBjb25zaWRlciBidWlsZGluZyAnaW5xdWVyeScgYXQgY29tcGlsZSB0aW1lLi5cbiAgX3R5cGUodikge1xuICAgIGlmICh0eXBlb2YgdiA9PT0gJ251bWJlcicpIHtcbiAgICAgIHJldHVybiAxO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgdiA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiAyO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgdiA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICByZXR1cm4gODtcbiAgICB9XG5cbiAgICBpZiAoQXJyYXkuaXNBcnJheSh2KSkge1xuICAgICAgcmV0dXJuIDQ7XG4gICAgfVxuXG4gICAgaWYgKHYgPT09IG51bGwpIHtcbiAgICAgIHJldHVybiAxMDtcbiAgICB9XG5cbiAgICAvLyBub3RlIHRoYXQgdHlwZW9mKC94LykgPT09IFwib2JqZWN0XCJcbiAgICBpZiAodiBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuICAgICAgcmV0dXJuIDExO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgdiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcmV0dXJuIDEzO1xuICAgIH1cblxuICAgIGlmICh2IGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgcmV0dXJuIDk7XG4gICAgfVxuXG4gICAgaWYgKEVKU09OLmlzQmluYXJ5KHYpKSB7XG4gICAgICByZXR1cm4gNTtcbiAgICB9XG5cbiAgICBpZiAodiBpbnN0YW5jZW9mIE1vbmdvSUQuT2JqZWN0SUQpIHtcbiAgICAgIHJldHVybiA3O1xuICAgIH1cblxuICAgIGlmICh2IGluc3RhbmNlb2YgRGVjaW1hbCkge1xuICAgICAgcmV0dXJuIDE7XG4gICAgfVxuXG4gICAgLy8gb2JqZWN0XG4gICAgcmV0dXJuIDM7XG5cbiAgICAvLyBYWFggc3VwcG9ydCBzb21lL2FsbCBvZiB0aGVzZTpcbiAgICAvLyAxNCwgc3ltYm9sXG4gICAgLy8gMTUsIGphdmFzY3JpcHQgY29kZSB3aXRoIHNjb3BlXG4gICAgLy8gMTYsIDE4OiAzMi1iaXQvNjQtYml0IGludGVnZXJcbiAgICAvLyAxNywgdGltZXN0YW1wXG4gICAgLy8gMjU1LCBtaW5rZXlcbiAgICAvLyAxMjcsIG1heGtleVxuICB9LFxuXG4gIC8vIGRlZXAgZXF1YWxpdHkgdGVzdDogdXNlIGZvciBsaXRlcmFsIGRvY3VtZW50IGFuZCBhcnJheSBtYXRjaGVzXG4gIF9lcXVhbChhLCBiKSB7XG4gICAgcmV0dXJuIEVKU09OLmVxdWFscyhhLCBiLCB7a2V5T3JkZXJTZW5zaXRpdmU6IHRydWV9KTtcbiAgfSxcblxuICAvLyBtYXBzIGEgdHlwZSBjb2RlIHRvIGEgdmFsdWUgdGhhdCBjYW4gYmUgdXNlZCB0byBzb3J0IHZhbHVlcyBvZiBkaWZmZXJlbnRcbiAgLy8gdHlwZXNcbiAgX3R5cGVvcmRlcih0KSB7XG4gICAgLy8gaHR0cDovL3d3dy5tb25nb2RiLm9yZy9kaXNwbGF5L0RPQ1MvV2hhdCtpcyt0aGUrQ29tcGFyZStPcmRlcitmb3IrQlNPTitUeXBlc1xuICAgIC8vIFhYWCB3aGF0IGlzIHRoZSBjb3JyZWN0IHNvcnQgcG9zaXRpb24gZm9yIEphdmFzY3JpcHQgY29kZT9cbiAgICAvLyAoJzEwMCcgaW4gdGhlIG1hdHJpeCBiZWxvdylcbiAgICAvLyBYWFggbWlua2V5L21heGtleVxuICAgIHJldHVybiBbXG4gICAgICAtMSwgIC8vIChub3QgYSB0eXBlKVxuICAgICAgMSwgICAvLyBudW1iZXJcbiAgICAgIDIsICAgLy8gc3RyaW5nXG4gICAgICAzLCAgIC8vIG9iamVjdFxuICAgICAgNCwgICAvLyBhcnJheVxuICAgICAgNSwgICAvLyBiaW5hcnlcbiAgICAgIC0xLCAgLy8gZGVwcmVjYXRlZFxuICAgICAgNiwgICAvLyBPYmplY3RJRFxuICAgICAgNywgICAvLyBib29sXG4gICAgICA4LCAgIC8vIERhdGVcbiAgICAgIDAsICAgLy8gbnVsbFxuICAgICAgOSwgICAvLyBSZWdFeHBcbiAgICAgIC0xLCAgLy8gZGVwcmVjYXRlZFxuICAgICAgMTAwLCAvLyBKUyBjb2RlXG4gICAgICAyLCAgIC8vIGRlcHJlY2F0ZWQgKHN5bWJvbClcbiAgICAgIDEwMCwgLy8gSlMgY29kZVxuICAgICAgMSwgICAvLyAzMi1iaXQgaW50XG4gICAgICA4LCAgIC8vIE1vbmdvIHRpbWVzdGFtcFxuICAgICAgMSAgICAvLyA2NC1iaXQgaW50XG4gICAgXVt0XTtcbiAgfSxcblxuICAvLyBjb21wYXJlIHR3byB2YWx1ZXMgb2YgdW5rbm93biB0eXBlIGFjY29yZGluZyB0byBCU09OIG9yZGVyaW5nXG4gIC8vIHNlbWFudGljcy4gKGFzIGFuIGV4dGVuc2lvbiwgY29uc2lkZXIgJ3VuZGVmaW5lZCcgdG8gYmUgbGVzcyB0aGFuXG4gIC8vIGFueSBvdGhlciB2YWx1ZS4pIHJldHVybiBuZWdhdGl2ZSBpZiBhIGlzIGxlc3MsIHBvc2l0aXZlIGlmIGIgaXNcbiAgLy8gbGVzcywgb3IgMCBpZiBlcXVhbFxuICBfY21wKGEsIGIpIHtcbiAgICBpZiAoYSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4gYiA9PT0gdW5kZWZpbmVkID8gMCA6IC0xO1xuICAgIH1cblxuICAgIGlmIChiID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiAxO1xuICAgIH1cblxuICAgIGxldCB0YSA9IExvY2FsQ29sbGVjdGlvbi5fZi5fdHlwZShhKTtcbiAgICBsZXQgdGIgPSBMb2NhbENvbGxlY3Rpb24uX2YuX3R5cGUoYik7XG5cbiAgICBjb25zdCBvYSA9IExvY2FsQ29sbGVjdGlvbi5fZi5fdHlwZW9yZGVyKHRhKTtcbiAgICBjb25zdCBvYiA9IExvY2FsQ29sbGVjdGlvbi5fZi5fdHlwZW9yZGVyKHRiKTtcblxuICAgIGlmIChvYSAhPT0gb2IpIHtcbiAgICAgIHJldHVybiBvYSA8IG9iID8gLTEgOiAxO1xuICAgIH1cblxuICAgIC8vIFhYWCBuZWVkIHRvIGltcGxlbWVudCB0aGlzIGlmIHdlIGltcGxlbWVudCBTeW1ib2wgb3IgaW50ZWdlcnMsIG9yXG4gICAgLy8gVGltZXN0YW1wXG4gICAgaWYgKHRhICE9PSB0Yikge1xuICAgICAgdGhyb3cgRXJyb3IoJ01pc3NpbmcgdHlwZSBjb2VyY2lvbiBsb2dpYyBpbiBfY21wJyk7XG4gICAgfVxuXG4gICAgaWYgKHRhID09PSA3KSB7IC8vIE9iamVjdElEXG4gICAgICAvLyBDb252ZXJ0IHRvIHN0cmluZy5cbiAgICAgIHRhID0gdGIgPSAyO1xuICAgICAgYSA9IGEudG9IZXhTdHJpbmcoKTtcbiAgICAgIGIgPSBiLnRvSGV4U3RyaW5nKCk7XG4gICAgfVxuXG4gICAgaWYgKHRhID09PSA5KSB7IC8vIERhdGVcbiAgICAgIC8vIENvbnZlcnQgdG8gbWlsbGlzLlxuICAgICAgdGEgPSB0YiA9IDE7XG4gICAgICBhID0gaXNOYU4oYSkgPyAwIDogYS5nZXRUaW1lKCk7XG4gICAgICBiID0gaXNOYU4oYikgPyAwIDogYi5nZXRUaW1lKCk7XG4gICAgfVxuXG4gICAgaWYgKHRhID09PSAxKSB7IC8vIGRvdWJsZVxuICAgICAgaWYgKGEgaW5zdGFuY2VvZiBEZWNpbWFsKSB7XG4gICAgICAgIHJldHVybiBhLm1pbnVzKGIpLnRvTnVtYmVyKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gYSAtIGI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHRiID09PSAyKSAvLyBzdHJpbmdcbiAgICAgIHJldHVybiBhIDwgYiA/IC0xIDogYSA9PT0gYiA/IDAgOiAxO1xuXG4gICAgaWYgKHRhID09PSAzKSB7IC8vIE9iamVjdFxuICAgICAgLy8gdGhpcyBjb3VsZCBiZSBtdWNoIG1vcmUgZWZmaWNpZW50IGluIHRoZSBleHBlY3RlZCBjYXNlIC4uLlxuICAgICAgY29uc3QgdG9BcnJheSA9IG9iamVjdCA9PiB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IFtdO1xuXG4gICAgICAgIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSwgb2JqZWN0W2tleV0pO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgfTtcblxuICAgICAgcmV0dXJuIExvY2FsQ29sbGVjdGlvbi5fZi5fY21wKHRvQXJyYXkoYSksIHRvQXJyYXkoYikpO1xuICAgIH1cblxuICAgIGlmICh0YSA9PT0gNCkgeyAvLyBBcnJheVxuICAgICAgZm9yIChsZXQgaSA9IDA7IDsgaSsrKSB7XG4gICAgICAgIGlmIChpID09PSBhLmxlbmd0aCkge1xuICAgICAgICAgIHJldHVybiBpID09PSBiLmxlbmd0aCA/IDAgOiAtMTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpID09PSBiLmxlbmd0aCkge1xuICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcyA9IExvY2FsQ29sbGVjdGlvbi5fZi5fY21wKGFbaV0sIGJbaV0pO1xuICAgICAgICBpZiAocyAhPT0gMCkge1xuICAgICAgICAgIHJldHVybiBzO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHRhID09PSA1KSB7IC8vIGJpbmFyeVxuICAgICAgLy8gU3VycHJpc2luZ2x5LCBhIHNtYWxsIGJpbmFyeSBibG9iIGlzIGFsd2F5cyBsZXNzIHRoYW4gYSBsYXJnZSBvbmUgaW5cbiAgICAgIC8vIE1vbmdvLlxuICAgICAgaWYgKGEubGVuZ3RoICE9PSBiLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gYS5sZW5ndGggLSBiLmxlbmd0aDtcbiAgICAgIH1cblxuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChhW2ldIDwgYltpXSkge1xuICAgICAgICAgIHJldHVybiAtMTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChhW2ldID4gYltpXSkge1xuICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiAwO1xuICAgIH1cblxuICAgIGlmICh0YSA9PT0gOCkgeyAvLyBib29sZWFuXG4gICAgICBpZiAoYSkge1xuICAgICAgICByZXR1cm4gYiA/IDAgOiAxO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gYiA/IC0xIDogMDtcbiAgICB9XG5cbiAgICBpZiAodGEgPT09IDEwKSAvLyBudWxsXG4gICAgICByZXR1cm4gMDtcblxuICAgIGlmICh0YSA9PT0gMTEpIC8vIHJlZ2V4cFxuICAgICAgdGhyb3cgRXJyb3IoJ1NvcnRpbmcgbm90IHN1cHBvcnRlZCBvbiByZWd1bGFyIGV4cHJlc3Npb24nKTsgLy8gWFhYXG5cbiAgICAvLyAxMzogamF2YXNjcmlwdCBjb2RlXG4gICAgLy8gMTQ6IHN5bWJvbFxuICAgIC8vIDE1OiBqYXZhc2NyaXB0IGNvZGUgd2l0aCBzY29wZVxuICAgIC8vIDE2OiAzMi1iaXQgaW50ZWdlclxuICAgIC8vIDE3OiB0aW1lc3RhbXBcbiAgICAvLyAxODogNjQtYml0IGludGVnZXJcbiAgICAvLyAyNTU6IG1pbmtleVxuICAgIC8vIDEyNzogbWF4a2V5XG4gICAgaWYgKHRhID09PSAxMykgLy8gamF2YXNjcmlwdCBjb2RlXG4gICAgICB0aHJvdyBFcnJvcignU29ydGluZyBub3Qgc3VwcG9ydGVkIG9uIEphdmFzY3JpcHQgY29kZScpOyAvLyBYWFhcblxuICAgIHRocm93IEVycm9yKCdVbmtub3duIHR5cGUgdG8gc29ydCcpO1xuICB9LFxufTtcbiIsImltcG9ydCBMb2NhbENvbGxlY3Rpb25fIGZyb20gJy4vbG9jYWxfY29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgTWF0Y2hlciBmcm9tICcuL21hdGNoZXIuanMnO1xuaW1wb3J0IFNvcnRlciBmcm9tICcuL3NvcnRlci5qcyc7XG5cbkxvY2FsQ29sbGVjdGlvbiA9IExvY2FsQ29sbGVjdGlvbl87XG5NaW5pbW9uZ28gPSB7XG4gICAgTG9jYWxDb2xsZWN0aW9uOiBMb2NhbENvbGxlY3Rpb25fLFxuICAgIE1hdGNoZXIsXG4gICAgU29ydGVyXG59O1xuIiwiLy8gT2JzZXJ2ZUhhbmRsZTogdGhlIHJldHVybiB2YWx1ZSBvZiBhIGxpdmUgcXVlcnkuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBPYnNlcnZlSGFuZGxlIHt9XG4iLCJpbXBvcnQge1xuICBFTEVNRU5UX09QRVJBVE9SUyxcbiAgZXF1YWxpdHlFbGVtZW50TWF0Y2hlcixcbiAgZXhwYW5kQXJyYXlzSW5CcmFuY2hlcyxcbiAgaGFzT3duLFxuICBpc09wZXJhdG9yT2JqZWN0LFxuICBtYWtlTG9va3VwRnVuY3Rpb24sXG4gIHJlZ2V4cEVsZW1lbnRNYXRjaGVyLFxufSBmcm9tICcuL2NvbW1vbi5qcyc7XG5cbi8vIEdpdmUgYSBzb3J0IHNwZWMsIHdoaWNoIGNhbiBiZSBpbiBhbnkgb2YgdGhlc2UgZm9ybXM6XG4vLyAgIHtcImtleTFcIjogMSwgXCJrZXkyXCI6IC0xfVxuLy8gICBbW1wia2V5MVwiLCBcImFzY1wiXSwgW1wia2V5MlwiLCBcImRlc2NcIl1dXG4vLyAgIFtcImtleTFcIiwgW1wia2V5MlwiLCBcImRlc2NcIl1dXG4vL1xuLy8gKC4uIHdpdGggdGhlIGZpcnN0IGZvcm0gYmVpbmcgZGVwZW5kZW50IG9uIHRoZSBrZXkgZW51bWVyYXRpb25cbi8vIGJlaGF2aW9yIG9mIHlvdXIgamF2YXNjcmlwdCBWTSwgd2hpY2ggdXN1YWxseSBkb2VzIHdoYXQgeW91IG1lYW4gaW5cbi8vIHRoaXMgY2FzZSBpZiB0aGUga2V5IG5hbWVzIGRvbid0IGxvb2sgbGlrZSBpbnRlZ2VycyAuLilcbi8vXG4vLyByZXR1cm4gYSBmdW5jdGlvbiB0aGF0IHRha2VzIHR3byBvYmplY3RzLCBhbmQgcmV0dXJucyAtMSBpZiB0aGVcbi8vIGZpcnN0IG9iamVjdCBjb21lcyBmaXJzdCBpbiBvcmRlciwgMSBpZiB0aGUgc2Vjb25kIG9iamVjdCBjb21lc1xuLy8gZmlyc3QsIG9yIDAgaWYgbmVpdGhlciBvYmplY3QgY29tZXMgYmVmb3JlIHRoZSBvdGhlci5cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgU29ydGVyIHtcbiAgY29uc3RydWN0b3Ioc3BlYykge1xuICAgIHRoaXMuX3NvcnRTcGVjUGFydHMgPSBbXTtcbiAgICB0aGlzLl9zb3J0RnVuY3Rpb24gPSBudWxsO1xuXG4gICAgY29uc3QgYWRkU3BlY1BhcnQgPSAocGF0aCwgYXNjZW5kaW5nKSA9PiB7XG4gICAgICBpZiAoIXBhdGgpIHtcbiAgICAgICAgdGhyb3cgRXJyb3IoJ3NvcnQga2V5cyBtdXN0IGJlIG5vbi1lbXB0eScpO1xuICAgICAgfVxuXG4gICAgICBpZiAocGF0aC5jaGFyQXQoMCkgPT09ICckJykge1xuICAgICAgICB0aHJvdyBFcnJvcihgdW5zdXBwb3J0ZWQgc29ydCBrZXk6ICR7cGF0aH1gKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5fc29ydFNwZWNQYXJ0cy5wdXNoKHtcbiAgICAgICAgYXNjZW5kaW5nLFxuICAgICAgICBsb29rdXA6IG1ha2VMb29rdXBGdW5jdGlvbihwYXRoLCB7Zm9yU29ydDogdHJ1ZX0pLFxuICAgICAgICBwYXRoXG4gICAgICB9KTtcbiAgICB9O1xuXG4gICAgaWYgKHNwZWMgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgc3BlYy5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgICBpZiAodHlwZW9mIGVsZW1lbnQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgYWRkU3BlY1BhcnQoZWxlbWVudCwgdHJ1ZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYWRkU3BlY1BhcnQoZWxlbWVudFswXSwgZWxlbWVudFsxXSAhPT0gJ2Rlc2MnKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2Ygc3BlYyA9PT0gJ29iamVjdCcpIHtcbiAgICAgIE9iamVjdC5rZXlzKHNwZWMpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgYWRkU3BlY1BhcnQoa2V5LCBzcGVjW2tleV0gPj0gMCk7XG4gICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBzcGVjID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aGlzLl9zb3J0RnVuY3Rpb24gPSBzcGVjO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBFcnJvcihgQmFkIHNvcnQgc3BlY2lmaWNhdGlvbjogJHtKU09OLnN0cmluZ2lmeShzcGVjKX1gKTtcbiAgICB9XG5cbiAgICAvLyBJZiBhIGZ1bmN0aW9uIGlzIHNwZWNpZmllZCBmb3Igc29ydGluZywgd2Ugc2tpcCB0aGUgcmVzdC5cbiAgICBpZiAodGhpcy5fc29ydEZ1bmN0aW9uKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVG8gaW1wbGVtZW50IGFmZmVjdGVkQnlNb2RpZmllciwgd2UgcGlnZ3ktYmFjayBvbiB0b3Agb2YgTWF0Y2hlcidzXG4gICAgLy8gYWZmZWN0ZWRCeU1vZGlmaWVyIGNvZGU7IHdlIGNyZWF0ZSBhIHNlbGVjdG9yIHRoYXQgaXMgYWZmZWN0ZWQgYnkgdGhlXG4gICAgLy8gc2FtZSBtb2RpZmllcnMgYXMgdGhpcyBzb3J0IG9yZGVyLiBUaGlzIGlzIG9ubHkgaW1wbGVtZW50ZWQgb24gdGhlXG4gICAgLy8gc2VydmVyLlxuICAgIGlmICh0aGlzLmFmZmVjdGVkQnlNb2RpZmllcikge1xuICAgICAgY29uc3Qgc2VsZWN0b3IgPSB7fTtcblxuICAgICAgdGhpcy5fc29ydFNwZWNQYXJ0cy5mb3JFYWNoKHNwZWMgPT4ge1xuICAgICAgICBzZWxlY3RvcltzcGVjLnBhdGhdID0gMTtcbiAgICAgIH0pO1xuXG4gICAgICB0aGlzLl9zZWxlY3RvckZvckFmZmVjdGVkQnlNb2RpZmllciA9IG5ldyBNaW5pbW9uZ28uTWF0Y2hlcihzZWxlY3Rvcik7XG4gICAgfVxuXG4gICAgdGhpcy5fa2V5Q29tcGFyYXRvciA9IGNvbXBvc2VDb21wYXJhdG9ycyhcbiAgICAgIHRoaXMuX3NvcnRTcGVjUGFydHMubWFwKChzcGVjLCBpKSA9PiB0aGlzLl9rZXlGaWVsZENvbXBhcmF0b3IoaSkpXG4gICAgKTtcbiAgfVxuXG4gIGdldENvbXBhcmF0b3Iob3B0aW9ucykge1xuICAgIC8vIElmIHNvcnQgaXMgc3BlY2lmaWVkIG9yIGhhdmUgbm8gZGlzdGFuY2VzLCBqdXN0IHVzZSB0aGUgY29tcGFyYXRvciBmcm9tXG4gICAgLy8gdGhlIHNvdXJjZSBzcGVjaWZpY2F0aW9uICh3aGljaCBkZWZhdWx0cyB0byBcImV2ZXJ5dGhpbmcgaXMgZXF1YWxcIi5cbiAgICAvLyBpc3N1ZSAjMzU5OVxuICAgIC8vIGh0dHBzOi8vZG9jcy5tb25nb2RiLmNvbS9tYW51YWwvcmVmZXJlbmNlL29wZXJhdG9yL3F1ZXJ5L25lYXIvI3NvcnQtb3BlcmF0aW9uXG4gICAgLy8gc29ydCBlZmZlY3RpdmVseSBvdmVycmlkZXMgJG5lYXJcbiAgICBpZiAodGhpcy5fc29ydFNwZWNQYXJ0cy5sZW5ndGggfHwgIW9wdGlvbnMgfHwgIW9wdGlvbnMuZGlzdGFuY2VzKSB7XG4gICAgICByZXR1cm4gdGhpcy5fZ2V0QmFzZUNvbXBhcmF0b3IoKTtcbiAgICB9XG5cbiAgICBjb25zdCBkaXN0YW5jZXMgPSBvcHRpb25zLmRpc3RhbmNlcztcblxuICAgIC8vIFJldHVybiBhIGNvbXBhcmF0b3Igd2hpY2ggY29tcGFyZXMgdXNpbmcgJG5lYXIgZGlzdGFuY2VzLlxuICAgIHJldHVybiAoYSwgYikgPT4ge1xuICAgICAgaWYgKCFkaXN0YW5jZXMuaGFzKGEuX2lkKSkge1xuICAgICAgICB0aHJvdyBFcnJvcihgTWlzc2luZyBkaXN0YW5jZSBmb3IgJHthLl9pZH1gKTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFkaXN0YW5jZXMuaGFzKGIuX2lkKSkge1xuICAgICAgICB0aHJvdyBFcnJvcihgTWlzc2luZyBkaXN0YW5jZSBmb3IgJHtiLl9pZH1gKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGRpc3RhbmNlcy5nZXQoYS5faWQpIC0gZGlzdGFuY2VzLmdldChiLl9pZCk7XG4gICAgfTtcbiAgfVxuXG4gIC8vIFRha2VzIGluIHR3byBrZXlzOiBhcnJheXMgd2hvc2UgbGVuZ3RocyBtYXRjaCB0aGUgbnVtYmVyIG9mIHNwZWNcbiAgLy8gcGFydHMuIFJldHVybnMgbmVnYXRpdmUsIDAsIG9yIHBvc2l0aXZlIGJhc2VkIG9uIHVzaW5nIHRoZSBzb3J0IHNwZWMgdG9cbiAgLy8gY29tcGFyZSBmaWVsZHMuXG4gIF9jb21wYXJlS2V5cyhrZXkxLCBrZXkyKSB7XG4gICAgaWYgKGtleTEubGVuZ3RoICE9PSB0aGlzLl9zb3J0U3BlY1BhcnRzLmxlbmd0aCB8fFxuICAgICAgICBrZXkyLmxlbmd0aCAhPT0gdGhpcy5fc29ydFNwZWNQYXJ0cy5sZW5ndGgpIHtcbiAgICAgIHRocm93IEVycm9yKCdLZXkgaGFzIHdyb25nIGxlbmd0aCcpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9rZXlDb21wYXJhdG9yKGtleTEsIGtleTIpO1xuICB9XG5cbiAgLy8gSXRlcmF0ZXMgb3ZlciBlYWNoIHBvc3NpYmxlIFwia2V5XCIgZnJvbSBkb2MgKGllLCBvdmVyIGVhY2ggYnJhbmNoKSwgY2FsbGluZ1xuICAvLyAnY2InIHdpdGggdGhlIGtleS5cbiAgX2dlbmVyYXRlS2V5c0Zyb21Eb2MoZG9jLCBjYikge1xuICAgIGlmICh0aGlzLl9zb3J0U3BlY1BhcnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdjYW5cXCd0IGdlbmVyYXRlIGtleXMgd2l0aG91dCBhIHNwZWMnKTtcbiAgICB9XG5cbiAgICBjb25zdCBwYXRoRnJvbUluZGljZXMgPSBpbmRpY2VzID0+IGAke2luZGljZXMuam9pbignLCcpfSxgO1xuXG4gICAgbGV0IGtub3duUGF0aHMgPSBudWxsO1xuXG4gICAgLy8gbWFwcyBpbmRleCAtPiAoeycnIC0+IHZhbHVlfSBvciB7cGF0aCAtPiB2YWx1ZX0pXG4gICAgY29uc3QgdmFsdWVzQnlJbmRleEFuZFBhdGggPSB0aGlzLl9zb3J0U3BlY1BhcnRzLm1hcChzcGVjID0+IHtcbiAgICAgIC8vIEV4cGFuZCBhbnkgbGVhZiBhcnJheXMgdGhhdCB3ZSBmaW5kLCBhbmQgaWdub3JlIHRob3NlIGFycmF5c1xuICAgICAgLy8gdGhlbXNlbHZlcy4gIChXZSBuZXZlciBzb3J0IGJhc2VkIG9uIGFuIGFycmF5IGl0c2VsZi4pXG4gICAgICBsZXQgYnJhbmNoZXMgPSBleHBhbmRBcnJheXNJbkJyYW5jaGVzKHNwZWMubG9va3VwKGRvYyksIHRydWUpO1xuXG4gICAgICAvLyBJZiB0aGVyZSBhcmUgbm8gdmFsdWVzIGZvciBhIGtleSAoZWcsIGtleSBnb2VzIHRvIGFuIGVtcHR5IGFycmF5KSxcbiAgICAgIC8vIHByZXRlbmQgd2UgZm91bmQgb25lIHVuZGVmaW5lZCB2YWx1ZS5cbiAgICAgIGlmICghYnJhbmNoZXMubGVuZ3RoKSB7XG4gICAgICAgIGJyYW5jaGVzID0gW3sgdmFsdWU6IHZvaWQgMCB9XTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZWxlbWVudCA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG4gICAgICBsZXQgdXNlZFBhdGhzID0gZmFsc2U7XG5cbiAgICAgIGJyYW5jaGVzLmZvckVhY2goYnJhbmNoID0+IHtcbiAgICAgICAgaWYgKCFicmFuY2guYXJyYXlJbmRpY2VzKSB7XG4gICAgICAgICAgLy8gSWYgdGhlcmUgYXJlIG5vIGFycmF5IGluZGljZXMgZm9yIGEgYnJhbmNoLCB0aGVuIGl0IG11c3QgYmUgdGhlXG4gICAgICAgICAgLy8gb25seSBicmFuY2gsIGJlY2F1c2UgdGhlIG9ubHkgdGhpbmcgdGhhdCBwcm9kdWNlcyBtdWx0aXBsZSBicmFuY2hlc1xuICAgICAgICAgIC8vIGlzIHRoZSB1c2Ugb2YgYXJyYXlzLlxuICAgICAgICAgIGlmIChicmFuY2hlcy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICB0aHJvdyBFcnJvcignbXVsdGlwbGUgYnJhbmNoZXMgYnV0IG5vIGFycmF5IHVzZWQ/Jyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZWxlbWVudFsnJ10gPSBicmFuY2gudmFsdWU7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdXNlZFBhdGhzID0gdHJ1ZTtcblxuICAgICAgICBjb25zdCBwYXRoID0gcGF0aEZyb21JbmRpY2VzKGJyYW5jaC5hcnJheUluZGljZXMpO1xuXG4gICAgICAgIGlmIChoYXNPd24uY2FsbChlbGVtZW50LCBwYXRoKSkge1xuICAgICAgICAgIHRocm93IEVycm9yKGBkdXBsaWNhdGUgcGF0aDogJHtwYXRofWApO1xuICAgICAgICB9XG5cbiAgICAgICAgZWxlbWVudFtwYXRoXSA9IGJyYW5jaC52YWx1ZTtcblxuICAgICAgICAvLyBJZiB0d28gc29ydCBmaWVsZHMgYm90aCBnbyBpbnRvIGFycmF5cywgdGhleSBoYXZlIHRvIGdvIGludG8gdGhlXG4gICAgICAgIC8vIGV4YWN0IHNhbWUgYXJyYXlzIGFuZCB3ZSBoYXZlIHRvIGZpbmQgdGhlIHNhbWUgcGF0aHMuICBUaGlzIGlzXG4gICAgICAgIC8vIHJvdWdobHkgdGhlIHNhbWUgY29uZGl0aW9uIHRoYXQgbWFrZXMgTW9uZ29EQiB0aHJvdyB0aGlzIHN0cmFuZ2VcbiAgICAgICAgLy8gZXJyb3IgbWVzc2FnZS4gIGVnLCB0aGUgbWFpbiB0aGluZyBpcyB0aGF0IGlmIHNvcnQgc3BlYyBpcyB7YTogMSxcbiAgICAgICAgLy8gYjoxfSB0aGVuIGEgYW5kIGIgY2Fubm90IGJvdGggYmUgYXJyYXlzLlxuICAgICAgICAvL1xuICAgICAgICAvLyAoSW4gTW9uZ29EQiBpdCBzZWVtcyB0byBiZSBPSyB0byBoYXZlIHthOiAxLCAnYS54LnknOiAxfSB3aGVyZSAnYSdcbiAgICAgICAgLy8gYW5kICdhLngueScgYXJlIGJvdGggYXJyYXlzLCBidXQgd2UgZG9uJ3QgYWxsb3cgdGhpcyBmb3Igbm93LlxuICAgICAgICAvLyAjTmVzdGVkQXJyYXlTb3J0XG4gICAgICAgIC8vIFhYWCBhY2hpZXZlIGZ1bGwgY29tcGF0aWJpbGl0eSBoZXJlXG4gICAgICAgIGlmIChrbm93blBhdGhzICYmICFoYXNPd24uY2FsbChrbm93blBhdGhzLCBwYXRoKSkge1xuICAgICAgICAgIHRocm93IEVycm9yKCdjYW5ub3QgaW5kZXggcGFyYWxsZWwgYXJyYXlzJyk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBpZiAoa25vd25QYXRocykge1xuICAgICAgICAvLyBTaW1pbGFybHkgdG8gYWJvdmUsIHBhdGhzIG11c3QgbWF0Y2ggZXZlcnl3aGVyZSwgdW5sZXNzIHRoaXMgaXMgYVxuICAgICAgICAvLyBub24tYXJyYXkgZmllbGQuXG4gICAgICAgIGlmICghaGFzT3duLmNhbGwoZWxlbWVudCwgJycpICYmXG4gICAgICAgICAgICBPYmplY3Qua2V5cyhrbm93blBhdGhzKS5sZW5ndGggIT09IE9iamVjdC5rZXlzKGVsZW1lbnQpLmxlbmd0aCkge1xuICAgICAgICAgIHRocm93IEVycm9yKCdjYW5ub3QgaW5kZXggcGFyYWxsZWwgYXJyYXlzIScpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHVzZWRQYXRocykge1xuICAgICAgICBrbm93blBhdGhzID0ge307XG5cbiAgICAgICAgT2JqZWN0LmtleXMoZWxlbWVudCkuZm9yRWFjaChwYXRoID0+IHtcbiAgICAgICAgICBrbm93blBhdGhzW3BhdGhdID0gdHJ1ZTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBlbGVtZW50O1xuICAgIH0pO1xuXG4gICAgaWYgKCFrbm93blBhdGhzKSB7XG4gICAgICAvLyBFYXN5IGNhc2U6IG5vIHVzZSBvZiBhcnJheXMuXG4gICAgICBjb25zdCBzb2xlS2V5ID0gdmFsdWVzQnlJbmRleEFuZFBhdGgubWFwKHZhbHVlcyA9PiB7XG4gICAgICAgIGlmICghaGFzT3duLmNhbGwodmFsdWVzLCAnJykpIHtcbiAgICAgICAgICB0aHJvdyBFcnJvcignbm8gdmFsdWUgaW4gc29sZSBrZXkgY2FzZT8nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB2YWx1ZXNbJyddO1xuICAgICAgfSk7XG5cbiAgICAgIGNiKHNvbGVLZXkpO1xuXG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgT2JqZWN0LmtleXMoa25vd25QYXRocykuZm9yRWFjaChwYXRoID0+IHtcbiAgICAgIGNvbnN0IGtleSA9IHZhbHVlc0J5SW5kZXhBbmRQYXRoLm1hcCh2YWx1ZXMgPT4ge1xuICAgICAgICBpZiAoaGFzT3duLmNhbGwodmFsdWVzLCAnJykpIHtcbiAgICAgICAgICByZXR1cm4gdmFsdWVzWycnXTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghaGFzT3duLmNhbGwodmFsdWVzLCBwYXRoKSkge1xuICAgICAgICAgIHRocm93IEVycm9yKCdtaXNzaW5nIHBhdGg/Jyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdmFsdWVzW3BhdGhdO1xuICAgICAgfSk7XG5cbiAgICAgIGNiKGtleSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgY29tcGFyYXRvciB0aGF0IHJlcHJlc2VudHMgdGhlIHNvcnQgc3BlY2lmaWNhdGlvbiAoYnV0IG5vdFxuICAvLyBpbmNsdWRpbmcgYSBwb3NzaWJsZSBnZW9xdWVyeSBkaXN0YW5jZSB0aWUtYnJlYWtlcikuXG4gIF9nZXRCYXNlQ29tcGFyYXRvcigpIHtcbiAgICBpZiAodGhpcy5fc29ydEZ1bmN0aW9uKSB7XG4gICAgICByZXR1cm4gdGhpcy5fc29ydEZ1bmN0aW9uO1xuICAgIH1cblxuICAgIC8vIElmIHdlJ3JlIG9ubHkgc29ydGluZyBvbiBnZW9xdWVyeSBkaXN0YW5jZSBhbmQgbm8gc3BlY3MsIGp1c3Qgc2F5XG4gICAgLy8gZXZlcnl0aGluZyBpcyBlcXVhbC5cbiAgICBpZiAoIXRoaXMuX3NvcnRTcGVjUGFydHMubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gKGRvYzEsIGRvYzIpID0+IDA7XG4gICAgfVxuXG4gICAgcmV0dXJuIChkb2MxLCBkb2MyKSA9PiB7XG4gICAgICBjb25zdCBrZXkxID0gdGhpcy5fZ2V0TWluS2V5RnJvbURvYyhkb2MxKTtcbiAgICAgIGNvbnN0IGtleTIgPSB0aGlzLl9nZXRNaW5LZXlGcm9tRG9jKGRvYzIpO1xuICAgICAgcmV0dXJuIHRoaXMuX2NvbXBhcmVLZXlzKGtleTEsIGtleTIpO1xuICAgIH07XG4gIH1cblxuICAvLyBGaW5kcyB0aGUgbWluaW11bSBrZXkgZnJvbSB0aGUgZG9jLCBhY2NvcmRpbmcgdG8gdGhlIHNvcnQgc3BlY3MuICAoV2Ugc2F5XG4gIC8vIFwibWluaW11bVwiIGhlcmUgYnV0IHRoaXMgaXMgd2l0aCByZXNwZWN0IHRvIHRoZSBzb3J0IHNwZWMsIHNvIFwiZGVzY2VuZGluZ1wiXG4gIC8vIHNvcnQgZmllbGRzIG1lYW4gd2UncmUgZmluZGluZyB0aGUgbWF4IGZvciB0aGF0IGZpZWxkLilcbiAgLy9cbiAgLy8gTm90ZSB0aGF0IHRoaXMgaXMgTk9UIFwiZmluZCB0aGUgbWluaW11bSB2YWx1ZSBvZiB0aGUgZmlyc3QgZmllbGQsIHRoZVxuICAvLyBtaW5pbXVtIHZhbHVlIG9mIHRoZSBzZWNvbmQgZmllbGQsIGV0Y1wiLi4uIGl0J3MgXCJjaG9vc2UgdGhlXG4gIC8vIGxleGljb2dyYXBoaWNhbGx5IG1pbmltdW0gdmFsdWUgb2YgdGhlIGtleSB2ZWN0b3IsIGFsbG93aW5nIG9ubHkga2V5cyB3aGljaFxuICAvLyB5b3UgY2FuIGZpbmQgYWxvbmcgdGhlIHNhbWUgcGF0aHNcIi4gIGllLCBmb3IgYSBkb2Mge2E6IFt7eDogMCwgeTogNX0sIHt4OlxuICAvLyAxLCB5OiAzfV19IHdpdGggc29ydCBzcGVjIHsnYS54JzogMSwgJ2EueSc6IDF9LCB0aGUgb25seSBrZXlzIGFyZSBbMCw1XSBhbmRcbiAgLy8gWzEsM10sIGFuZCB0aGUgbWluaW11bSBrZXkgaXMgWzAsNV07IG5vdGFibHksIFswLDNdIGlzIE5PVCBhIGtleS5cbiAgX2dldE1pbktleUZyb21Eb2MoZG9jKSB7XG4gICAgbGV0IG1pbktleSA9IG51bGw7XG5cbiAgICB0aGlzLl9nZW5lcmF0ZUtleXNGcm9tRG9jKGRvYywga2V5ID0+IHtcbiAgICAgIGlmIChtaW5LZXkgPT09IG51bGwpIHtcbiAgICAgICAgbWluS2V5ID0ga2V5O1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLl9jb21wYXJlS2V5cyhrZXksIG1pbktleSkgPCAwKSB7XG4gICAgICAgIG1pbktleSA9IGtleTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBtaW5LZXk7XG4gIH1cblxuICBfZ2V0UGF0aHMoKSB7XG4gICAgcmV0dXJuIHRoaXMuX3NvcnRTcGVjUGFydHMubWFwKHBhcnQgPT4gcGFydC5wYXRoKTtcbiAgfVxuXG4gIC8vIEdpdmVuIGFuIGluZGV4ICdpJywgcmV0dXJucyBhIGNvbXBhcmF0b3IgdGhhdCBjb21wYXJlcyB0d28ga2V5IGFycmF5cyBiYXNlZFxuICAvLyBvbiBmaWVsZCAnaScuXG4gIF9rZXlGaWVsZENvbXBhcmF0b3IoaSkge1xuICAgIGNvbnN0IGludmVydCA9ICF0aGlzLl9zb3J0U3BlY1BhcnRzW2ldLmFzY2VuZGluZztcblxuICAgIHJldHVybiAoa2V5MSwga2V5MikgPT4ge1xuICAgICAgY29uc3QgY29tcGFyZSA9IExvY2FsQ29sbGVjdGlvbi5fZi5fY21wKGtleTFbaV0sIGtleTJbaV0pO1xuICAgICAgcmV0dXJuIGludmVydCA/IC1jb21wYXJlIDogY29tcGFyZTtcbiAgICB9O1xuICB9XG59XG5cbi8vIEdpdmVuIGFuIGFycmF5IG9mIGNvbXBhcmF0b3JzXG4vLyAoZnVuY3Rpb25zIChhLGIpLT4obmVnYXRpdmUgb3IgcG9zaXRpdmUgb3IgemVybykpLCByZXR1cm5zIGEgc2luZ2xlXG4vLyBjb21wYXJhdG9yIHdoaWNoIHVzZXMgZWFjaCBjb21wYXJhdG9yIGluIG9yZGVyIGFuZCByZXR1cm5zIHRoZSBmaXJzdFxuLy8gbm9uLXplcm8gdmFsdWUuXG5mdW5jdGlvbiBjb21wb3NlQ29tcGFyYXRvcnMoY29tcGFyYXRvckFycmF5KSB7XG4gIHJldHVybiAoYSwgYikgPT4ge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY29tcGFyYXRvckFycmF5Lmxlbmd0aDsgKytpKSB7XG4gICAgICBjb25zdCBjb21wYXJlID0gY29tcGFyYXRvckFycmF5W2ldKGEsIGIpO1xuICAgICAgaWYgKGNvbXBhcmUgIT09IDApIHtcbiAgICAgICAgcmV0dXJuIGNvbXBhcmU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIDA7XG4gIH07XG59XG4iXX0=
