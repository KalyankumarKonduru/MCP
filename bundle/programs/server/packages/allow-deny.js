Package["core-runtime"].queue("allow-deny",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;
var ECMAScript = Package.ecmascript.ECMAScript;
var LocalCollection = Package.minimongo.LocalCollection;
var Minimongo = Package.minimongo.Minimongo;
var check = Package.check.check;
var Match = Package.check.Match;
var EJSON = Package.ejson.EJSON;
var DDP = Package['ddp-client'].DDP;
var DDPServer = Package['ddp-server'].DDPServer;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var AllowDeny;

var require = meteorInstall({"node_modules":{"meteor":{"allow-deny":{"allow-deny.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/allow-deny/allow-deny.js                                                                                   //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    ///
    /// Remote methods and access control.
    ///

    const hasOwn = Object.prototype.hasOwnProperty;

    // Restrict default mutators on collection. allow() and deny() take the
    // same options:
    //
    // options.insertAsync {Function(userId, doc)}
    //   return true to allow/deny adding this document
    //
    // options.updateAsync {Function(userId, docs, fields, modifier)}
    //   return true to allow/deny updating these documents.
    //   `fields` is passed as an array of fields that are to be modified
    //
    // options.removeAsync {Function(userId, docs)}
    //   return true to allow/deny removing these documents
    //
    // options.fetch {Array}
    //   Fields to fetch for these validators. If any call to allow or deny
    //   does not have this option then all fields are loaded.
    //
    // allow and deny can be called multiple times. The validators are
    // evaluated as follows:
    // - If neither deny() nor allow() has been called on the collection,
    //   then the request is allowed if and only if the "insecure" smart
    //   package is in use.
    // - Otherwise, if any deny() function returns true, the request is denied.
    // - Otherwise, if any allow() function returns true, the request is allowed.
    // - Otherwise, the request is denied.
    //
    // Meteor may call your deny() and allow() functions in any order, and may not
    // call all of them if it is able to make a decision without calling them all
    // (so don't include side effects).

    AllowDeny = {
      CollectionPrototype: {}
    };

    // In the `mongo` package, we will extend Mongo.Collection.prototype with these
    // methods
    const CollectionPrototype = AllowDeny.CollectionPrototype;

    /**
     * @summary Allow users to write directly to this collection from client code, subject to limitations you define.
     * @locus Server
     * @method allow
     * @memberOf Mongo.Collection
     * @instance
     * @param {Object} options
     * @param {Function} options.insert,update,remove Functions that look at a proposed modification to the database and return true if it should be allowed.
     * @param {String[]} options.fetch Optional performance enhancement. Limits the fields that will be fetched from the database for inspection by your `update` and `remove` functions.
     * @param {Function} options.transform Overrides `transform` on the  [`Collection`](#collections).  Pass `null` to disable transformation.
     */
    CollectionPrototype.allow = function (options) {
      addValidator(this, 'allow', options);
    };

    /**
     * @summary Override `allow` rules.
     * @locus Server
     * @method deny
     * @memberOf Mongo.Collection
     * @instance
     * @param {Object} options
     * @param {Function} options.insert,update,remove Functions that look at a proposed modification to the database and return true if it should be denied, even if an [allow](#allow) rule says otherwise.
     * @param {String[]} options.fetch Optional performance enhancement. Limits the fields that will be fetched from the database for inspection by your `update` and `remove` functions.
     * @param {Function} options.transform Overrides `transform` on the  [`Collection`](#collections).  Pass `null` to disable transformation.
     */
    CollectionPrototype.deny = function (options) {
      addValidator(this, 'deny', options);
    };
    CollectionPrototype._defineMutationMethods = function (options) {
      const self = this;
      options = options || {};

      // set to true once we call any allow or deny methods. If true, use
      // allow/deny semantics. If false, use insecure mode semantics.
      self._restricted = false;

      // Insecure mode (default to allowing writes). Defaults to 'undefined' which
      // means insecure iff the insecure package is loaded. This property can be
      // overriden by tests or packages wishing to change insecure mode behavior of
      // their collections.
      self._insecure = undefined;
      self._validators = {
        insert: {
          allow: [],
          deny: []
        },
        update: {
          allow: [],
          deny: []
        },
        remove: {
          allow: [],
          deny: []
        },
        insertAsync: {
          allow: [],
          deny: []
        },
        updateAsync: {
          allow: [],
          deny: []
        },
        removeAsync: {
          allow: [],
          deny: []
        },
        upsertAsync: {
          allow: [],
          deny: []
        },
        // dummy arrays; can't set these!
        fetch: [],
        fetchAllFields: false
      };
      if (!self._name) return; // anonymous collection

      // XXX Think about method namespacing. Maybe methods should be
      // "Meteor:Mongo:insertAsync/NAME"?
      self._prefix = '/' + self._name + '/';

      // Mutation Methods
      // Minimongo on the server gets no stubs; instead, by default
      // it wait()s until its result is ready, yielding.
      // This matches the behavior of macromongo on the server better.
      // XXX see #MeteorServerNull
      if (self._connection && (self._connection === Meteor.server || Meteor.isClient)) {
        const m = {};
        ['insertAsync', 'updateAsync', 'removeAsync', 'insert', 'update', 'remove'].forEach(method => {
          const methodName = self._prefix + method;
          if (options.useExisting) {
            const handlerPropName = Meteor.isClient ? '_methodHandlers' : 'method_handlers';
            // Do not try to create additional methods if this has already been called.
            // (Otherwise the .methods() call below will throw an error.)
            if (self._connection[handlerPropName] && typeof self._connection[handlerPropName][methodName] === 'function') return;
          }
          const isInsert = name => name.includes('insert');
          m[methodName] = function /* ... */
          () {
            // All the methods do their own validation, instead of using check().
            check(arguments, [Match.Any]);
            const args = Array.from(arguments);
            try {
              // For an insert/insertAsync, if the client didn't specify an _id, generate one
              // now; because this uses DDP.randomStream, it will be consistent with
              // what the client generated. We generate it now rather than later so
              // that if (eg) an allow/deny rule does an insert/insertAsync to the same
              // collection (not that it really should), the generated _id will
              // still be the first use of the stream and will be consistent.
              //
              // However, we don't actually stick the _id onto the document yet,
              // because we want allow/deny rules to be able to differentiate
              // between arbitrary client-specified _id fields and merely
              // client-controlled-via-randomSeed fields.
              let generatedId = null;
              if (isInsert(method) && !hasOwn.call(args[0], '_id')) {
                generatedId = self._makeNewID();
              }
              if (this.isSimulation) {
                // In a client simulation, you can do any mutation (even with a
                // complex selector).
                if (generatedId !== null) {
                  args[0]._id = generatedId;
                }
                return self._collection[method].apply(self._collection, args);
              }

              // This is the server receiving a method call from the client.

              // We don't allow arbitrary selectors in mutations from the client: only
              // single-ID selectors.
              if (!isInsert(method)) throwIfSelectorIsNotId(args[0], method);
              const syncMethodName = method.replace('Async', '');
              const syncValidatedMethodName = '_validated' + method.charAt(0).toUpperCase() + syncMethodName.slice(1);
              // it forces to use async validated behavior
              const validatedMethodName = syncValidatedMethodName + 'Async';
              if (self._restricted) {
                // short circuit if there is no way it will pass.
                if (self._validators[syncMethodName].allow.length === 0) {
                  throw new Meteor.Error(403, 'Access denied. No allow validators set on restricted ' + "collection for method '" + method + "'.");
                }
                args.unshift(this.userId);
                isInsert(method) && args.push(generatedId);
                return self[validatedMethodName].apply(self, args);
              } else if (self._isInsecure()) {
                if (generatedId !== null) args[0]._id = generatedId;
                // In insecure mode we use the server _collection methods, and these sync methods
                // do not exist in the server anymore, so we have this mapper to call the async methods
                // instead.
                const syncMethodsMapper = {
                  insert: "insertAsync",
                  update: "updateAsync",
                  remove: "removeAsync"
                };

                // In insecure mode, allow any mutation (with a simple selector).
                // XXX This is kind of bogus.  Instead of blindly passing whatever
                //     we get from the network to this function, we should actually
                //     know the correct arguments for the function and pass just
                //     them.  For example, if you have an extraneous extra null
                //     argument and this is Mongo on the server, the .wrapAsync'd
                //     functions like update will get confused and pass the
                //     "fut.resolver()" in the wrong slot, where _update will never
                //     invoke it. Bam, broken DDP connection.  Probably should just
                //     take this whole method and write it three times, invoking
                //     helpers for the common code.
                return self._collection[syncMethodsMapper[method] || method].apply(self._collection, args);
              } else {
                // In secure mode, if we haven't called allow or deny, then nothing
                // is permitted.
                throw new Meteor.Error(403, 'Access denied');
              }
            } catch (e) {
              if (e.name === 'MongoError' ||
              // for old versions of MongoDB (probably not necessary but it's here just in case)
              e.name === 'BulkWriteError' ||
              // for newer versions of MongoDB (https://docs.mongodb.com/drivers/node/current/whats-new/#bulkwriteerror---mongobulkwriteerror)
              e.name === 'MongoBulkWriteError' || e.name === 'MinimongoError') {
                throw new Meteor.Error(409, e.toString());
              } else {
                throw e;
              }
            }
          };
        });
        self._connection.methods(m);
      }
    };
    CollectionPrototype._updateFetch = function (fields) {
      const self = this;
      if (!self._validators.fetchAllFields) {
        if (fields) {
          const union = Object.create(null);
          const add = names => names && names.forEach(name => union[name] = 1);
          add(self._validators.fetch);
          add(fields);
          self._validators.fetch = Object.keys(union);
        } else {
          self._validators.fetchAllFields = true;
          // clear fetch just to make sure we don't accidentally read it
          self._validators.fetch = null;
        }
      }
    };
    CollectionPrototype._isInsecure = function () {
      const self = this;
      if (self._insecure === undefined) return !!Package.insecure;
      return self._insecure;
    };
    async function asyncSome(array, predicate) {
      for (let item of array) {
        if (await predicate(item)) {
          return true;
        }
      }
      return false;
    }
    async function asyncEvery(array, predicate) {
      for (let item of array) {
        if (!(await predicate(item))) {
          return false;
        }
      }
      return true;
    }
    CollectionPrototype._validatedInsertAsync = async function (userId, doc, generatedId) {
      const self = this;
      // call user validators.
      // Any deny returns true means denied.
      if (await asyncSome(self._validators.insert.deny, async validator => {
        const result = validator(userId, docToValidate(validator, doc, generatedId));
        return Meteor._isPromise(result) ? await result : result;
      })) {
        throw new Meteor.Error(403, "Access denied");
      }
      // Any allow returns true means proceed. Throw error if they all fail.

      if (await asyncEvery(self._validators.insert.allow, async validator => {
        const result = validator(userId, docToValidate(validator, doc, generatedId));
        return !(Meteor._isPromise(result) ? await result : result);
      })) {
        throw new Meteor.Error(403, "Access denied");
      }

      // If we generated an ID above, insertAsync it now: after the validation, but
      // before actually inserting.
      if (generatedId !== null) doc._id = generatedId;
      return self._collection.insertAsync.call(self._collection, doc);
    };

    // Simulate a mongo `update` operation while validating that the access
    // control rules set by calls to `allow/deny` are satisfied. If all
    // pass, rewrite the mongo operation to use $in to set the list of
    // document ids to change ##ValidatedChange
    CollectionPrototype._validatedUpdateAsync = async function (userId, selector, mutator, options) {
      const self = this;
      check(mutator, Object);
      options = Object.assign(Object.create(null), options);
      if (!LocalCollection._selectorIsIdPerhapsAsObject(selector)) throw new Error("validated update should be of a single ID");

      // We don't support upserts because they don't fit nicely into allow/deny
      // rules.
      if (options.upsert) throw new Meteor.Error(403, "Access denied. Upserts not " + "allowed in a restricted collection.");
      const noReplaceError = "Access denied. In a restricted collection you can only" + " update documents, not replace them. Use a Mongo update operator, such " + "as '$set'.";
      const mutatorKeys = Object.keys(mutator);

      // compute modified fields
      const modifiedFields = {};
      if (mutatorKeys.length === 0) {
        throw new Meteor.Error(403, noReplaceError);
      }
      mutatorKeys.forEach(op => {
        const params = mutator[op];
        if (op.charAt(0) !== '$') {
          throw new Meteor.Error(403, noReplaceError);
        } else if (!hasOwn.call(ALLOWED_UPDATE_OPERATIONS, op)) {
          throw new Meteor.Error(403, "Access denied. Operator " + op + " not allowed in a restricted collection.");
        } else {
          Object.keys(params).forEach(field => {
            // treat dotted fields as if they are replacing their
            // top-level part
            if (field.indexOf('.') !== -1) field = field.substring(0, field.indexOf('.'));

            // record the field we are trying to change
            modifiedFields[field] = true;
          });
        }
      });
      const fields = Object.keys(modifiedFields);
      const findOptions = {
        transform: null
      };
      if (!self._validators.fetchAllFields) {
        findOptions.fields = {};
        self._validators.fetch.forEach(fieldName => {
          findOptions.fields[fieldName] = 1;
        });
      }
      const doc = await self._collection.findOneAsync(selector, findOptions);
      if (!doc)
        // none satisfied!
        return 0;

      // call user validators.
      // Any deny returns true means denied.
      if (await asyncSome(self._validators.update.deny, async validator => {
        const factoriedDoc = transformDoc(validator, doc);
        const result = validator(userId, factoriedDoc, fields, mutator);
        return Meteor._isPromise(result) ? await result : result;
      })) {
        throw new Meteor.Error(403, "Access denied");
      }

      // Any allow returns true means proceed. Throw error if they all fail.
      if (await asyncEvery(self._validators.update.allow, async validator => {
        const factoriedDoc = transformDoc(validator, doc);
        const result = validator(userId, factoriedDoc, fields, mutator);
        return !(Meteor._isPromise(result) ? await result : result);
      })) {
        throw new Meteor.Error(403, "Access denied");
      }
      options._forbidReplace = true;

      // Back when we supported arbitrary client-provided selectors, we actually
      // rewrote the selector to include an _id clause before passing to Mongo to
      // avoid races, but since selector is guaranteed to already just be an ID, we
      // don't have to any more.

      return self._collection.updateAsync.call(self._collection, selector, mutator, options);
    };

    // Only allow these operations in validated updates. Specifically
    // whitelist operations, rather than blacklist, so new complex
    // operations that are added aren't automatically allowed. A complex
    // operation is one that does more than just modify its target
    // field. For now this contains all update operations except '$rename'.
    // http://docs.mongodb.org/manual/reference/operators/#update
    const ALLOWED_UPDATE_OPERATIONS = {
      $inc: 1,
      $set: 1,
      $unset: 1,
      $addToSet: 1,
      $pop: 1,
      $pullAll: 1,
      $pull: 1,
      $pushAll: 1,
      $push: 1,
      $bit: 1
    };

    // Simulate a mongo `remove` operation while validating access control
    // rules. See #ValidatedChange
    CollectionPrototype._validatedRemoveAsync = async function (userId, selector) {
      const self = this;
      const findOptions = {
        transform: null
      };
      if (!self._validators.fetchAllFields) {
        findOptions.fields = {};
        self._validators.fetch.forEach(fieldName => {
          findOptions.fields[fieldName] = 1;
        });
      }
      const doc = await self._collection.findOneAsync(selector, findOptions);
      if (!doc) return 0;

      // call user validators.
      // Any deny returns true means denied.
      if (await asyncSome(self._validators.remove.deny, async validator => {
        const result = validator(userId, transformDoc(validator, doc));
        return Meteor._isPromise(result) ? await result : result;
      })) {
        throw new Meteor.Error(403, "Access denied");
      }
      // Any allow returns true means proceed. Throw error if they all fail.
      if (await asyncEvery(self._validators.remove.allow, async validator => {
        const result = validator(userId, transformDoc(validator, doc));
        return !(Meteor._isPromise(result) ? await result : result);
      })) {
        throw new Meteor.Error(403, "Access denied");
      }

      // Back when we supported arbitrary client-provided selectors, we actually
      // rewrote the selector to {_id: {$in: [ids that we found]}} before passing to
      // Mongo to avoid races, but since selector is guaranteed to already just be
      // an ID, we don't have to any more.

      return self._collection.removeAsync.call(self._collection, selector);
    };
    CollectionPrototype._callMutatorMethodAsync = function _callMutatorMethodAsync(name, args) {
      let options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      // For two out of three mutator methods, the first argument is a selector
      const firstArgIsSelector = name === "updateAsync" || name === "removeAsync";
      if (firstArgIsSelector && !alreadyInSimulation()) {
        // If we're about to actually send an RPC, we should throw an error if
        // this is a non-ID selector, because the mutation methods only allow
        // single-ID selectors. (If we don't throw here, we'll see flicker.)
        throwIfSelectorIsNotId(args[0], name);
      }
      const mutatorMethodName = this._prefix + name;
      return this._connection.applyAsync(mutatorMethodName, args, _objectSpread({
        returnStubValue: this.resolverType === 'stub' || this.resolverType == null,
        // StubStream is only used for testing where you don't care about the server
        returnServerResultPromise: !this._connection._stream._isStub && this.resolverType !== 'stub'
      }, options));
    };
    CollectionPrototype._callMutatorMethod = function _callMutatorMethod(name, args, callback) {
      if (Meteor.isClient && !callback && !alreadyInSimulation()) {
        // Client can't block, so it can't report errors by exception,
        // only by callback. If they forget the callback, give them a
        // default one that logs the error, so they aren't totally
        // baffled if their writes don't work because their database is
        // down.
        // Don't give a default callback in simulation, because inside stubs we
        // want to return the results from the local collection immediately and
        // not force a callback.
        callback = function (err) {
          if (err) Meteor._debug(name + " failed", err);
        };
      }

      // For two out of three mutator methods, the first argument is a selector
      const firstArgIsSelector = name === "update" || name === "remove";
      if (firstArgIsSelector && !alreadyInSimulation()) {
        // If we're about to actually send an RPC, we should throw an error if
        // this is a non-ID selector, because the mutation methods only allow
        // single-ID selectors. (If we don't throw here, we'll see flicker.)
        throwIfSelectorIsNotId(args[0], name);
      }
      const mutatorMethodName = this._prefix + name;
      return this._connection.apply(mutatorMethodName, args, {
        returnStubValue: true
      }, callback);
    };
    function transformDoc(validator, doc) {
      if (validator.transform) return validator.transform(doc);
      return doc;
    }
    function docToValidate(validator, doc, generatedId) {
      let ret = doc;
      if (validator.transform) {
        ret = EJSON.clone(doc);
        // If you set a server-side transform on your collection, then you don't get
        // to tell the difference between "client specified the ID" and "server
        // generated the ID", because transforms expect to get _id.  If you want to
        // do that check, you can do it with a specific
        // `C.allow({insertAsync: f, transform: null})` validator.
        if (generatedId !== null) {
          ret._id = generatedId;
        }
        ret = validator.transform(ret);
      }
      return ret;
    }
    function addValidator(collection, allowOrDeny, options) {
      // validate keys
      const validKeysRegEx = /^(?:insertAsync|updateAsync|removeAsync|insert|update|remove|fetch|transform)$/;
      Object.keys(options).forEach(key => {
        if (!validKeysRegEx.test(key)) throw new Error(allowOrDeny + ": Invalid key: " + key);

        // TODO deprecated async config on future versions
        const isAsyncKey = key.includes('Async');
        if (isAsyncKey) {
          const syncKey = key.replace('Async', '');
          Meteor.deprecate(allowOrDeny + ": The \"".concat(key, "\" key is deprecated. Use \"").concat(syncKey, "\" instead."));
        }
      });
      collection._restricted = true;
      ['insertAsync', 'updateAsync', 'removeAsync', 'insert', 'update', 'remove'].forEach(name => {
        if (hasOwn.call(options, name)) {
          if (!(options[name] instanceof Function)) {
            throw new Error(allowOrDeny + ': Value for `' + name + '` must be a function');
          }

          // If the transform is specified at all (including as 'null') in this
          // call, then take that; otherwise, take the transform from the
          // collection.
          if (options.transform === undefined) {
            options[name].transform = collection._transform; // already wrapped
          } else {
            options[name].transform = LocalCollection.wrapTransform(options.transform);
          }
          const isAsyncName = name.includes('Async');
          const validatorSyncName = isAsyncName ? name.replace('Async', '') : name;
          collection._validators[validatorSyncName][allowOrDeny].push(options[name]);
        }
      });

      // Only updateAsync the fetch fields if we're passed things that affect
      // fetching. This way allow({}) and allow({insertAsync: f}) don't result in
      // setting fetchAllFields
      if (options.updateAsync || options.removeAsync || options.fetch) {
        if (options.fetch && !(options.fetch instanceof Array)) {
          throw new Error(allowOrDeny + ": Value for `fetch` must be an array");
        }
        collection._updateFetch(options.fetch);
      }
    }
    function throwIfSelectorIsNotId(selector, methodName) {
      if (!LocalCollection._selectorIsIdPerhapsAsObject(selector)) {
        throw new Meteor.Error(403, "Not permitted. Untrusted code may only " + methodName + " documents by ID.");
      }
    }
    ;

    // Determine if we are in a DDP method simulation
    function alreadyInSimulation() {
      var CurrentInvocation = DDP._CurrentMethodInvocation ||
      // For backwards compatibility, as explained in this issue:
      // https://github.com/meteor/meteor/issues/8947
      DDP._CurrentInvocation;
      const enclosing = CurrentInvocation.get();
      return enclosing && enclosing.isSimulation;
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});


/* Exports */
return {
  export: function () { return {
      AllowDeny: AllowDeny
    };},
  require: require,
  eagerModulePaths: [
    "/node_modules/meteor/allow-deny/allow-deny.js"
  ]
}});

//# sourceURL=meteor://💻app/packages/allow-deny.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvYWxsb3ctZGVueS9hbGxvdy1kZW55LmpzIl0sIm5hbWVzIjpbIl9vYmplY3RTcHJlYWQiLCJtb2R1bGUiLCJsaW5rIiwiZGVmYXVsdCIsInYiLCJfX3JlaWZ5V2FpdEZvckRlcHNfXyIsImhhc093biIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiQWxsb3dEZW55IiwiQ29sbGVjdGlvblByb3RvdHlwZSIsImFsbG93Iiwib3B0aW9ucyIsImFkZFZhbGlkYXRvciIsImRlbnkiLCJfZGVmaW5lTXV0YXRpb25NZXRob2RzIiwic2VsZiIsIl9yZXN0cmljdGVkIiwiX2luc2VjdXJlIiwidW5kZWZpbmVkIiwiX3ZhbGlkYXRvcnMiLCJpbnNlcnQiLCJ1cGRhdGUiLCJyZW1vdmUiLCJpbnNlcnRBc3luYyIsInVwZGF0ZUFzeW5jIiwicmVtb3ZlQXN5bmMiLCJ1cHNlcnRBc3luYyIsImZldGNoIiwiZmV0Y2hBbGxGaWVsZHMiLCJfbmFtZSIsIl9wcmVmaXgiLCJfY29ubmVjdGlvbiIsIk1ldGVvciIsInNlcnZlciIsImlzQ2xpZW50IiwibSIsImZvckVhY2giLCJtZXRob2QiLCJtZXRob2ROYW1lIiwidXNlRXhpc3RpbmciLCJoYW5kbGVyUHJvcE5hbWUiLCJpc0luc2VydCIsIm5hbWUiLCJpbmNsdWRlcyIsImNoZWNrIiwiYXJndW1lbnRzIiwiTWF0Y2giLCJBbnkiLCJhcmdzIiwiQXJyYXkiLCJmcm9tIiwiZ2VuZXJhdGVkSWQiLCJjYWxsIiwiX21ha2VOZXdJRCIsImlzU2ltdWxhdGlvbiIsIl9pZCIsIl9jb2xsZWN0aW9uIiwiYXBwbHkiLCJ0aHJvd0lmU2VsZWN0b3JJc05vdElkIiwic3luY01ldGhvZE5hbWUiLCJyZXBsYWNlIiwic3luY1ZhbGlkYXRlZE1ldGhvZE5hbWUiLCJjaGFyQXQiLCJ0b1VwcGVyQ2FzZSIsInNsaWNlIiwidmFsaWRhdGVkTWV0aG9kTmFtZSIsImxlbmd0aCIsIkVycm9yIiwidW5zaGlmdCIsInVzZXJJZCIsInB1c2giLCJfaXNJbnNlY3VyZSIsInN5bmNNZXRob2RzTWFwcGVyIiwiZSIsInRvU3RyaW5nIiwibWV0aG9kcyIsIl91cGRhdGVGZXRjaCIsImZpZWxkcyIsInVuaW9uIiwiY3JlYXRlIiwiYWRkIiwibmFtZXMiLCJrZXlzIiwiUGFja2FnZSIsImluc2VjdXJlIiwiYXN5bmNTb21lIiwiYXJyYXkiLCJwcmVkaWNhdGUiLCJpdGVtIiwiYXN5bmNFdmVyeSIsIl92YWxpZGF0ZWRJbnNlcnRBc3luYyIsImRvYyIsInZhbGlkYXRvciIsInJlc3VsdCIsImRvY1RvVmFsaWRhdGUiLCJfaXNQcm9taXNlIiwiX3ZhbGlkYXRlZFVwZGF0ZUFzeW5jIiwic2VsZWN0b3IiLCJtdXRhdG9yIiwiYXNzaWduIiwiTG9jYWxDb2xsZWN0aW9uIiwiX3NlbGVjdG9ySXNJZFBlcmhhcHNBc09iamVjdCIsInVwc2VydCIsIm5vUmVwbGFjZUVycm9yIiwibXV0YXRvcktleXMiLCJtb2RpZmllZEZpZWxkcyIsIm9wIiwicGFyYW1zIiwiQUxMT1dFRF9VUERBVEVfT1BFUkFUSU9OUyIsImZpZWxkIiwiaW5kZXhPZiIsInN1YnN0cmluZyIsImZpbmRPcHRpb25zIiwidHJhbnNmb3JtIiwiZmllbGROYW1lIiwiZmluZE9uZUFzeW5jIiwiZmFjdG9yaWVkRG9jIiwidHJhbnNmb3JtRG9jIiwiX2ZvcmJpZFJlcGxhY2UiLCIkaW5jIiwiJHNldCIsIiR1bnNldCIsIiRhZGRUb1NldCIsIiRwb3AiLCIkcHVsbEFsbCIsIiRwdWxsIiwiJHB1c2hBbGwiLCIkcHVzaCIsIiRiaXQiLCJfdmFsaWRhdGVkUmVtb3ZlQXN5bmMiLCJfY2FsbE11dGF0b3JNZXRob2RBc3luYyIsImZpcnN0QXJnSXNTZWxlY3RvciIsImFscmVhZHlJblNpbXVsYXRpb24iLCJtdXRhdG9yTWV0aG9kTmFtZSIsImFwcGx5QXN5bmMiLCJyZXR1cm5TdHViVmFsdWUiLCJyZXNvbHZlclR5cGUiLCJyZXR1cm5TZXJ2ZXJSZXN1bHRQcm9taXNlIiwiX3N0cmVhbSIsIl9pc1N0dWIiLCJfY2FsbE11dGF0b3JNZXRob2QiLCJjYWxsYmFjayIsImVyciIsIl9kZWJ1ZyIsInJldCIsIkVKU09OIiwiY2xvbmUiLCJjb2xsZWN0aW9uIiwiYWxsb3dPckRlbnkiLCJ2YWxpZEtleXNSZWdFeCIsImtleSIsInRlc3QiLCJpc0FzeW5jS2V5Iiwic3luY0tleSIsImRlcHJlY2F0ZSIsImNvbmNhdCIsIkZ1bmN0aW9uIiwiX3RyYW5zZm9ybSIsIndyYXBUcmFuc2Zvcm0iLCJpc0FzeW5jTmFtZSIsInZhbGlkYXRvclN5bmNOYW1lIiwiQ3VycmVudEludm9jYXRpb24iLCJERFAiLCJfQ3VycmVudE1ldGhvZEludm9jYXRpb24iLCJfQ3VycmVudEludm9jYXRpb24iLCJlbmNsb3NpbmciLCJnZXQiLCJfX3JlaWZ5X2FzeW5jX3Jlc3VsdF9fIiwiX3JlaWZ5RXJyb3IiLCJhc3luYyJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0lBQUEsSUFBSUEsYUFBYTtJQUFDQyxNQUFNLENBQUNDLElBQUksQ0FBQyxzQ0FBc0MsRUFBQztNQUFDQyxPQUFPQSxDQUFDQyxDQUFDLEVBQUM7UUFBQ0osYUFBYSxHQUFDSSxDQUFDO01BQUE7SUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0lBQUMsSUFBSUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTUEsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFBbEs7SUFDQTtJQUNBOztJQUVBLE1BQU1DLE1BQU0sR0FBR0MsTUFBTSxDQUFDQyxTQUFTLENBQUNDLGNBQWM7O0lBRTlDO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7O0lBRUFDLFNBQVMsR0FBRztNQUNW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RyxzQ0FBc0MsQ0FBQztRQUN2RTtRQUNBRCxVQUFVLENBQUN2RSxZQUFZLENBQUNqRSxPQUFPLENBQUNnQixLQUFLLENBQUM7TUFDeEM7SUFDRjtJQUVBLFNBQVMrQixzQkFBc0JBLENBQUN1QyxRQUFRLEVBQUUzRCxVQUFVLEVBQUU7TUFDcEQsSUFBSSxDQUFDOEQsZUFBZSxDQUFDQyw0QkFBNEIsQ0FBQ0osUUFBUSxDQUFDLEVBQUU7UUFDM0QsTUFBTSxJQUFJakUsTUFBTSxDQUFDbUMsS0FBSyxDQUNwQixHQUFHLEVBQUUseUNBQXlDLEdBQUc3QixVQUFVLEdBQ3pELG1CQUFtQixDQUFDO01BQzFCO0lBQ0Y7SUFBQzs7SUFFRDtJQUNBLFNBQVM4RixtQkFBbUJBLENBQUEsRUFBRztNQUM3QixJQUFJNkIsaUJBQWlCLEdBQ25CQyxHQUFHLENBQUNDLHdCQUF3QjtNQUM1QjtNQUNBO01BQ0FELEdBQUcsQ0FBQ0Usa0JBQWtCO01BRXhCLE1BQU1DLFNBQVMsR0FBR0osaUJBQWlCLENBQUNLLEdBQUcsQ0FBQyxDQUFDO01BQ3pDLE9BQU9ELFNBQVMsSUFBSUEsU0FBUyxDQUFDL0csWUFBWTtJQUM1QztJQUFDaUgsc0JBQUE7RUFBQSxTQUFBQyxXQUFBO0lBQUEsT0FBQUQsc0JBQUEsQ0FBQUMsV0FBQTtFQUFBO0VBQUFELHNCQUFBO0FBQUE7RUFBQXhKLElBQUE7RUFBQTBKLEtBQUE7QUFBQSxHIiwiZmlsZSI6Ii9wYWNrYWdlcy9hbGxvdy1kZW55LmpzIiwic291cmNlc0NvbnRlbnQiOlsiLy8vXG4vLy8gUmVtb3RlIG1ldGhvZHMgYW5kIGFjY2VzcyBjb250cm9sLlxuLy8vXG5cbmNvbnN0IGhhc093biA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHk7XG5cbi8vIFJlc3RyaWN0IGRlZmF1bHQgbXV0YXRvcnMgb24gY29sbGVjdGlvbi4gYWxsb3coKSBhbmQgZGVueSgpIHRha2UgdGhlXG4vLyBzYW1lIG9wdGlvbnM6XG4vL1xuLy8gb3B0aW9ucy5pbnNlcnRBc3luYyB7RnVuY3Rpb24odXNlcklkLCBkb2MpfVxuLy8gICByZXR1cm4gdHJ1ZSB0byBhbGxvdy9kZW55IGFkZGluZyB0aGlzIGRvY3VtZW50XG4vL1xuLy8gb3B0aW9ucy51cGRhdGVBc3luYyB7RnVuY3Rpb24odXNlcklkLCBkb2NzLCBmaWVsZHMsIG1vZGlmaWVyKX1cbi8vICAgcmV0dXJuIHRydWUgdG8gYWxsb3cvZGVueSB1cGRhdGluZyB0aGVzZSBkb2N1bWVudHMuXG4vLyAgIGBmaWVsZHNgIGlzIHBhc3NlZCBhcyBhbiBhcnJheSBvZiBmaWVsZHMgdGhhdCBhcmUgdG8gYmUgbW9kaWZpZWRcbi8vXG4vLyBvcHRpb25zLnJlbW92ZUFzeW5jIHtGdW5jdGlvbih1c2VySWQsIGRvY3MpfVxuLy8gICByZXR1cm4gdHJ1ZSB0byBhbGxvdy9kZW55IHJlbW92aW5nIHRoZXNlIGRvY3VtZW50c1xuLy9cbi8vIG9wdGlvbnMuZmV0Y2gge0FycmF5fVxuLy8gICBGaWVsZHMgdG8gZmV0Y2ggZm9yIHRoZXNlIHZhbGlkYXRvcnMuIElmIGFueSBjYWxsIHRvIGFsbG93IG9yIGRlbnlcbi8vICAgZG9lcyBub3QgaGF2ZSB0aGlzIG9wdGlvbiB0aGVuIGFsbCBmaWVsZHMgYXJlIGxvYWRlZC5cbi8vXG4vLyBhbGxvdyBhbmQgZGVueSBjYW4gYmUgY2FsbGVkIG11bHRpcGxlIHRpbWVzLiBUaGUgdmFsaWRhdG9ycyBhcmVcbi8vIGV2YWx1YXRlZCBhcyBmb2xsb3dzOlxuLy8gLSBJZiBuZWl0aGVyIGRlbnkoKSBub3IgYWxsb3coKSBoYXMgYmVlbiBjYWxsZWQgb24gdGhlIGNvbGxlY3Rpb24sXG4vLyAgIHRoZW4gdGhlIHJlcXVlc3QgaXMgYWxsb3dlZCBpZiBhbmQgb25seSBpZiB0aGUgXCJpbnNlY3VyZVwiIHNtYXJ0XG4vLyAgIHBhY2thZ2UgaXMgaW4gdXNlLlxuLy8gLSBPdGhlcndpc2UsIGlmIGFueSBkZW55KCkgZnVuY3Rpb24gcmV0dXJucyB0cnVlLCB0aGUgcmVxdWVzdCBpcyBkZW5pZWQuXG4vLyAtIE90aGVyd2lzZSwgaWYgYW55IGFsbG93KCkgZnVuY3Rpb24gcmV0dXJucyB0cnVlLCB0aGUgcmVxdWVzdCBpcyBhbGxvd2VkLlxuLy8gLSBPdGhlcndpc2UsIHRoZSByZXF1ZXN0IGlzIGRlbmllZC5cbi8vXG4vLyBNZXRlb3IgbWF5IGNhbGwgeW91ciBkZW55KCkgYW5kIGFsbG93KCkgZnVuY3Rpb25zIGluIGFueSBvcmRlciwgYW5kIG1heSBub3Rcbi8vIGNhbGwgYWxsIG9mIHRoZW0gaWYgaXQgaXMgYWJsZSB0byBtYWtlIGEgZGVjaXNpb24gd2l0aG91dCBjYWxsaW5nIHRoZW0gYWxsXG4vLyAoc28gZG9uJ3QgaW5jbHVkZSBzaWRlIGVmZmVjdHMpLlxuXG5BbGxvd0RlbnkgPSB7XG4gIENvbGxlY3Rpb25Qcm90b3R5cGU6IHt9XG59O1xuXG4vLyBJbiB0aGUgYG1vbmdvYCBwYWNrYWdlLCB3ZSB3aWxsIGV4dGVuZCBNb25nby5Db2xsZWN0aW9uLnByb3RvdHlwZSB3aXRoIHRoZXNlXG4vLyBtZXRob2RzXG5jb25zdCBDb2xsZWN0aW9uUHJvdG90eXBlID0gQWxsb3dEZW55LkNvbGxlY3Rpb25Qcm90b3R5cGU7XG5cbi8qKlxuICogQHN1bW1hcnkgQWxsb3cgdXNlcnMgdG8gd3JpdGUgZGlyZWN0bHkgdG8gdGhpcyBjb2xsZWN0aW9uIGZyb20gY2xpZW50IGNvZGUsIHN1YmplY3QgdG8gbGltaXRhdGlvbnMgeW91IGRlZmluZS5cbiAqIEBsb2N1cyBTZXJ2ZXJcbiAqIEBtZXRob2QgYWxsb3dcbiAqIEBtZW1iZXJPZiBNb25nby5Db2xsZWN0aW9uXG4gKiBAaW5zdGFuY2VcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBvcHRpb25zLmluc2VydCx1cGRhdGUscmVtb3ZlIEZ1bmN0aW9ucyB0aGF0IGxvb2sgYXQgYSBwcm9wb3NlZCBtb2RpZmljYXRpb24gdG8gdGhlIGRhdGFiYXNlIGFuZCByZXR1cm4gdHJ1ZSBpZiBpdCBzaG91bGQgYmUgYWxsb3dlZC5cbiAqIEBwYXJhbSB7U3RyaW5nW119IG9wdGlvbnMuZmV0Y2ggT3B0aW9uYWwgcGVyZm9ybWFuY2UgZW5oYW5jZW1lbnQuIExpbWl0cyB0aGUgZmllbGRzIHRoYXQgd2lsbCBiZSBmZXRjaGVkIGZyb20gdGhlIGRhdGFiYXNlIGZvciBpbnNwZWN0aW9uIGJ5IHlvdXIgYHVwZGF0ZWAgYW5kIGByZW1vdmVgIGZ1bmN0aW9ucy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IG9wdGlvbnMudHJhbnNmb3JtIE92ZXJyaWRlcyBgdHJhbnNmb3JtYCBvbiB0aGUgIFtgQ29sbGVjdGlvbmBdKCNjb2xsZWN0aW9ucykuICBQYXNzIGBudWxsYCB0byBkaXNhYmxlIHRyYW5zZm9ybWF0aW9uLlxuICovXG5Db2xsZWN0aW9uUHJvdG90eXBlLmFsbG93ID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICBhZGRWYWxpZGF0b3IodGhpcywgJ2FsbG93Jywgb3B0aW9ucyk7XG59O1xuXG4vKipcbiAqIEBzdW1tYXJ5IE92ZXJyaWRlIGBhbGxvd2AgcnVsZXMuXG4gKiBAbG9jdXMgU2VydmVyXG4gKiBAbWV0aG9kIGRlbnlcbiAqIEBtZW1iZXJPZiBNb25nby5Db2xsZWN0aW9uXG4gKiBAaW5zdGFuY2VcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBvcHRpb25zLmluc2VydCx1cGRhdGUscmVtb3ZlIEZ1bmN0aW9ucyB0aGF0IGxvb2sgYXQgYSBwcm9wb3NlZCBtb2RpZmljYXRpb24gdG8gdGhlIGRhdGFiYXNlIGFuZCByZXR1cm4gdHJ1ZSBpZiBpdCBzaG91bGQgYmUgZGVuaWVkLCBldmVuIGlmIGFuIFthbGxvd10oI2FsbG93KSBydWxlIHNheXMgb3RoZXJ3aXNlLlxuICogQHBhcmFtIHtTdHJpbmdbXX0gb3B0aW9ucy5mZXRjaCBPcHRpb25hbCBwZXJmb3JtYW5jZSBlbmhhbmNlbWVudC4gTGltaXRzIHRoZSBmaWVsZHMgdGhhdCB3aWxsIGJlIGZldGNoZWQgZnJvbSB0aGUgZGF0YWJhc2UgZm9yIGluc3BlY3Rpb24gYnkgeW91ciBgdXBkYXRlYCBhbmQgYHJlbW92ZWAgZnVuY3Rpb25zLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gb3B0aW9ucy50cmFuc2Zvcm0gT3ZlcnJpZGVzIGB0cmFuc2Zvcm1gIG9uIHRoZSAgW2BDb2xsZWN0aW9uYF0oI2NvbGxlY3Rpb25zKS4gIFBhc3MgYG51bGxgIHRvIGRpc2FibGUgdHJhbnNmb3JtYXRpb24uXG4gKi9cbkNvbGxlY3Rpb25Qcm90b3R5cGUuZGVueSA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgYWRkVmFsaWRhdG9yKHRoaXMsICdkZW55Jywgb3B0aW9ucyk7XG59O1xuXG5Db2xsZWN0aW9uUHJvdG90eXBlLl9kZWZpbmVNdXRhdGlvbk1ldGhvZHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gIGNvbnN0IHNlbGYgPSB0aGlzO1xuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICAvLyBzZXQgdG8gdHJ1ZSBvbmNlIHdlIGNhbGwgYW55IGFsbG93IG9yIGRlbnkgbWV0aG9kcy4gSWYgdHJ1ZSwgdXNlXG4gIC8vIGFsbG93L2Rlbnkgc2VtYW50aWNzLiBJZiBmYWxzZSwgdXNlIGluc2VjdXJlIG1vZGUgc2VtYW50aWNzLlxuICBzZWxmLl9yZXN0cmljdGVkID0gZmFsc2U7XG5cbiAgLy8gSW5zZWN1cmUgbW9kZSAoZGVmYXVsdCB0byBhbGxvd2luZyB3cml0ZXMpLiBEZWZhdWx0cyB0byAndW5kZWZpbmVkJyB3aGljaFxuICAvLyBtZWFucyBpbnNlY3VyZSBpZmYgdGhlIGluc2VjdXJlIHBhY2thZ2UgaXMgbG9hZGVkLiBUaGlzIHByb3BlcnR5IGNhbiBiZVxuICAvLyBvdmVycmlkZW4gYnkgdGVzdHMgb3IgcGFja2FnZXMgd2lzaGluZyB0byBjaGFuZ2UgaW5zZWN1cmUgbW9kZSBiZWhhdmlvciBvZlxuICAvLyB0aGVpciBjb2xsZWN0aW9ucy5cbiAgc2VsZi5faW5zZWN1cmUgPSB1bmRlZmluZWQ7XG5cbiAgc2VsZi5fdmFsaWRhdG9ycyA9IHtcbiAgICBpbnNlcnQ6IHthbGxvdzogW10sIGRlbnk6IFtdfSxcbiAgICB1cGRhdGU6IHthbGxvdzogW10sIGRlbnk6IFtdfSxcbiAgICByZW1vdmU6IHthbGxvdzogW10sIGRlbnk6IFtdfSxcbiAgICBpbnNlcnRBc3luYzoge2FsbG93OiBbXSwgZGVueTogW119LFxuICAgIHVwZGF0ZUFzeW5jOiB7YWxsb3c6IFtdLCBkZW55OiBbXX0sXG4gICAgcmVtb3ZlQXN5bmM6IHthbGxvdzogW10sIGRlbnk6IFtdfSxcbiAgICB1cHNlcnRBc3luYzoge2FsbG93OiBbXSwgZGVueTogW119LCAvLyBkdW1teSBhcnJheXM7IGNhbid0IHNldCB0aGVzZSFcbiAgICBmZXRjaDogW10sXG4gICAgZmV0Y2hBbGxGaWVsZHM6IGZhbHNlXG4gIH07XG5cbiAgaWYgKCFzZWxmLl9uYW1lKVxuICAgIHJldHVybjsgLy8gYW5vbnltb3VzIGNvbGxlY3Rpb25cblxuICAvLyBYWFggVGhpbmsgYWJvdXQgbWV0aG9kIG5hbWVzcGFjaW5nLiBNYXliZSBtZXRob2RzIHNob3VsZCBiZVxuICAvLyBcIk1ldGVvcjpNb25nbzppbnNlcnRBc3luYy9OQU1FXCI/XG4gIHNlbGYuX3ByZWZpeCA9ICcvJyArIHNlbGYuX25hbWUgKyAnLyc7XG5cbiAgLy8gTXV0YXRpb24gTWV0aG9kc1xuICAvLyBNaW5pbW9uZ28gb24gdGhlIHNlcnZlciBnZXRzIG5vIHN0dWJzOyBpbnN0ZWFkLCBieSBkZWZhdWx0XG4gIC8vIGl0IHdhaXQoKXMgdW50aWwgaXRzIHJlc3VsdCBpcyByZWFkeSwgeWllbGRpbmcuXG4gIC8vIFRoaXMgbWF0Y2hlcyB0aGUgYmVoYXZpb3Igb2YgbWFjcm9tb25nbyBvbiB0aGUgc2VydmVyIGJldHRlci5cbiAgLy8gWFhYIHNlZSAjTWV0ZW9yU2VydmVyTnVsbFxuICBpZiAoc2VsZi5fY29ubmVjdGlvbiAmJiAoc2VsZi5fY29ubmVjdGlvbiA9PT0gTWV0ZW9yLnNlcnZlciB8fCBNZXRlb3IuaXNDbGllbnQpKSB7XG4gICAgY29uc3QgbSA9IHt9O1xuXG4gICAgW1xuICAgICAgJ2luc2VydEFzeW5jJyxcbiAgICAgICd1cGRhdGVBc3luYycsXG4gICAgICAncmVtb3ZlQXN5bmMnLFxuICAgICAgJ2luc2VydCcsXG4gICAgICAndXBkYXRlJyxcbiAgICAgICdyZW1vdmUnLFxuICAgIF0uZm9yRWFjaChtZXRob2QgPT4ge1xuICAgICAgY29uc3QgbWV0aG9kTmFtZSA9IHNlbGYuX3ByZWZpeCArIG1ldGhvZDtcblxuICAgICAgaWYgKG9wdGlvbnMudXNlRXhpc3RpbmcpIHtcbiAgICAgICAgY29uc3QgaGFuZGxlclByb3BOYW1lID0gTWV0ZW9yLmlzQ2xpZW50XG4gICAgICAgICAgPyAnX21ldGhvZEhhbmRsZXJzJ1xuICAgICAgICAgIDogJ21ldGhvZF9oYW5kbGVycyc7XG4gICAgICAgIC8vIERvIG5vdCB0cnkgdG8gY3JlYXRlIGFkZGl0aW9uYWwgbWV0aG9kcyBpZiB0aGlzIGhhcyBhbHJlYWR5IGJlZW4gY2FsbGVkLlxuICAgICAgICAvLyAoT3RoZXJ3aXNlIHRoZSAubWV0aG9kcygpIGNhbGwgYmVsb3cgd2lsbCB0aHJvdyBhbiBlcnJvci4pXG4gICAgICAgIGlmIChcbiAgICAgICAgICBzZWxmLl9jb25uZWN0aW9uW2hhbmRsZXJQcm9wTmFtZV0gJiZcbiAgICAgICAgICB0eXBlb2Ygc2VsZi5fY29ubmVjdGlvbltoYW5kbGVyUHJvcE5hbWVdW21ldGhvZE5hbWVdID09PSAnZnVuY3Rpb24nXG4gICAgICAgIClcbiAgICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGlzSW5zZXJ0ID0gbmFtZSA9PiBuYW1lLmluY2x1ZGVzKCdpbnNlcnQnKTtcblxuICAgICAgbVttZXRob2ROYW1lXSA9IGZ1bmN0aW9uICgvKiAuLi4gKi8pIHtcbiAgICAgICAgLy8gQWxsIHRoZSBtZXRob2RzIGRvIHRoZWlyIG93biB2YWxpZGF0aW9uLCBpbnN0ZWFkIG9mIHVzaW5nIGNoZWNrKCkuXG4gICAgICAgIGNoZWNrKGFyZ3VtZW50cywgW01hdGNoLkFueV0pO1xuICAgICAgICBjb25zdCBhcmdzID0gQXJyYXkuZnJvbShhcmd1bWVudHMpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIC8vIEZvciBhbiBpbnNlcnQvaW5zZXJ0QXN5bmMsIGlmIHRoZSBjbGllbnQgZGlkbid0IHNwZWNpZnkgYW4gX2lkLCBnZW5lcmF0ZSBvbmVcbiAgICAgICAgICAvLyBub3c7IGJlY2F1c2UgdGhpcyB1c2VzIEREUC5yYW5kb21TdHJlYW0sIGl0IHdpbGwgYmUgY29uc2lzdGVudCB3aXRoXG4gICAgICAgICAgLy8gd2hhdCB0aGUgY2xpZW50IGdlbmVyYXRlZC4gV2UgZ2VuZXJhdGUgaXQgbm93IHJhdGhlciB0aGFuIGxhdGVyIHNvXG4gICAgICAgICAgLy8gdGhhdCBpZiAoZWcpIGFuIGFsbG93L2RlbnkgcnVsZSBkb2VzIGFuIGluc2VydC9pbnNlcnRBc3luYyB0byB0aGUgc2FtZVxuICAgICAgICAgIC8vIGNvbGxlY3Rpb24gKG5vdCB0aGF0IGl0IHJlYWxseSBzaG91bGQpLCB0aGUgZ2VuZXJhdGVkIF9pZCB3aWxsXG4gICAgICAgICAgLy8gc3RpbGwgYmUgdGhlIGZpcnN0IHVzZSBvZiB0aGUgc3RyZWFtIGFuZCB3aWxsIGJlIGNvbnNpc3RlbnQuXG4gICAgICAgICAgLy9cbiAgICAgICAgICAvLyBIb3dldmVyLCB3ZSBkb24ndCBhY3R1YWxseSBzdGljayB0aGUgX2lkIG9udG8gdGhlIGRvY3VtZW50IHlldCxcbiAgICAgICAgICAvLyBiZWNhdXNlIHdlIHdhbnQgYWxsb3cvZGVueSBydWxlcyB0byBiZSBhYmxlIHRvIGRpZmZlcmVudGlhdGVcbiAgICAgICAgICAvLyBiZXR3ZWVuIGFyYml0cmFyeSBjbGllbnQtc3BlY2lmaWVkIF9pZCBmaWVsZHMgYW5kIG1lcmVseVxuICAgICAgICAgIC8vIGNsaWVudC1jb250cm9sbGVkLXZpYS1yYW5kb21TZWVkIGZpZWxkcy5cbiAgICAgICAgICBsZXQgZ2VuZXJhdGVkSWQgPSBudWxsO1xuICAgICAgICAgIGlmIChpc0luc2VydChtZXRob2QpICYmICFoYXNPd24uY2FsbChhcmdzWzBdLCAnX2lkJykpIHtcbiAgICAgICAgICAgIGdlbmVyYXRlZElkID0gc2VsZi5fbWFrZU5ld0lEKCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHRoaXMuaXNTaW11bGF0aW9uKSB7XG4gICAgICAgICAgICAvLyBJbiBhIGNsaWVudCBzaW11bGF0aW9uLCB5b3UgY2FuIGRvIGFueSBtdXRhdGlvbiAoZXZlbiB3aXRoIGFcbiAgICAgICAgICAgIC8vIGNvbXBsZXggc2VsZWN0b3IpLlxuICAgICAgICAgICAgaWYgKGdlbmVyYXRlZElkICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgIGFyZ3NbMF0uX2lkID0gZ2VuZXJhdGVkSWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gc2VsZi5fY29sbGVjdGlvblttZXRob2RdLmFwcGx5KHNlbGYuX2NvbGxlY3Rpb24sIGFyZ3MpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIFRoaXMgaXMgdGhlIHNlcnZlciByZWNlaXZpbmcgYSBtZXRob2QgY2FsbCBmcm9tIHRoZSBjbGllbnQuXG5cbiAgICAgICAgICAvLyBXZSBkb24ndCBhbGxvdyBhcmJpdHJhcnkgc2VsZWN0b3JzIGluIG11dGF0aW9ucyBmcm9tIHRoZSBjbGllbnQ6IG9ubHlcbiAgICAgICAgICAvLyBzaW5nbGUtSUQgc2VsZWN0b3JzLlxuICAgICAgICAgIGlmICghaXNJbnNlcnQobWV0aG9kKSkgdGhyb3dJZlNlbGVjdG9ySXNOb3RJZChhcmdzWzBdLCBtZXRob2QpO1xuXG4gICAgICAgICAgY29uc3Qgc3luY01ldGhvZE5hbWUgPSBtZXRob2QucmVwbGFjZSgnQXN5bmMnLCAnJyk7XG4gICAgICAgICAgY29uc3Qgc3luY1ZhbGlkYXRlZE1ldGhvZE5hbWUgPSAnX3ZhbGlkYXRlZCcgKyBtZXRob2QuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBzeW5jTWV0aG9kTmFtZS5zbGljZSgxKTtcbiAgICAgICAgICAvLyBpdCBmb3JjZXMgdG8gdXNlIGFzeW5jIHZhbGlkYXRlZCBiZWhhdmlvclxuICAgICAgICAgIGNvbnN0IHZhbGlkYXRlZE1ldGhvZE5hbWUgPSBzeW5jVmFsaWRhdGVkTWV0aG9kTmFtZSArICdBc3luYyc7XG5cbiAgICAgICAgICBpZiAoc2VsZi5fcmVzdHJpY3RlZCkge1xuICAgICAgICAgICAgLy8gc2hvcnQgY2lyY3VpdCBpZiB0aGVyZSBpcyBubyB3YXkgaXQgd2lsbCBwYXNzLlxuICAgICAgICAgICAgaWYgKHNlbGYuX3ZhbGlkYXRvcnNbc3luY01ldGhvZE5hbWVdLmFsbG93Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKFxuICAgICAgICAgICAgICAgIDQwMyxcbiAgICAgICAgICAgICAgICAnQWNjZXNzIGRlbmllZC4gTm8gYWxsb3cgdmFsaWRhdG9ycyBzZXQgb24gcmVzdHJpY3RlZCAnICtcbiAgICAgICAgICAgICAgICAgIFwiY29sbGVjdGlvbiBmb3IgbWV0aG9kICdcIiArXG4gICAgICAgICAgICAgICAgICBtZXRob2QgK1xuICAgICAgICAgICAgICAgICAgXCInLlwiXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGFyZ3MudW5zaGlmdCh0aGlzLnVzZXJJZCk7XG4gICAgICAgICAgICBpc0luc2VydChtZXRob2QpICYmIGFyZ3MucHVzaChnZW5lcmF0ZWRJZCk7XG4gICAgICAgICAgICByZXR1cm4gc2VsZlt2YWxpZGF0ZWRNZXRob2ROYW1lXS5hcHBseShzZWxmLCBhcmdzKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKHNlbGYuX2lzSW5zZWN1cmUoKSkge1xuICAgICAgICAgICAgaWYgKGdlbmVyYXRlZElkICE9PSBudWxsKSBhcmdzWzBdLl9pZCA9IGdlbmVyYXRlZElkO1xuICAgICAgICAgICAgLy8gSW4gaW5zZWN1cmUgbW9kZSB3ZSB1c2UgdGhlIHNlcnZlciBfY29sbGVjdGlvbiBtZXRob2RzLCBhbmQgdGhlc2Ugc3luYyBtZXRob2RzXG4gICAgICAgICAgICAvLyBkbyBub3QgZXhpc3QgaW4gdGhlIHNlcnZlciBhbnltb3JlLCBzbyB3ZSBoYXZlIHRoaXMgbWFwcGVyIHRvIGNhbGwgdGhlIGFzeW5jIG1ldGhvZHNcbiAgICAgICAgICAgIC8vIGluc3RlYWQuXG4gICAgICAgICAgICBjb25zdCBzeW5jTWV0aG9kc01hcHBlciA9IHtcbiAgICAgICAgICAgICAgaW5zZXJ0OiBcImluc2VydEFzeW5jXCIsXG4gICAgICAgICAgICAgIHVwZGF0ZTogXCJ1cGRhdGVBc3luY1wiLFxuICAgICAgICAgICAgICByZW1vdmU6IFwicmVtb3ZlQXN5bmNcIixcbiAgICAgICAgICAgIH07XG5cblxuICAgICAgICAgICAgLy8gSW4gaW5zZWN1cmUgbW9kZSwgYWxsb3cgYW55IG11dGF0aW9uICh3aXRoIGEgc2ltcGxlIHNlbGVjdG9yKS5cbiAgICAgICAgICAgIC8vIFhYWCBUaGlzIGlzIGtpbmQgb2YgYm9ndXMuICBJbnN0ZWFkIG9mIGJsaW5kbHkgcGFzc2luZyB3aGF0ZXZlclxuICAgICAgICAgICAgLy8gICAgIHdlIGdldCBmcm9tIHRoZSBuZXR3b3JrIHRvIHRoaXMgZnVuY3Rpb24sIHdlIHNob3VsZCBhY3R1YWxseVxuICAgICAgICAgICAgLy8gICAgIGtub3cgdGhlIGNvcnJlY3QgYXJndW1lbnRzIGZvciB0aGUgZnVuY3Rpb24gYW5kIHBhc3MganVzdFxuICAgICAgICAgICAgLy8gICAgIHRoZW0uICBGb3IgZXhhbXBsZSwgaWYgeW91IGhhdmUgYW4gZXh0cmFuZW91cyBleHRyYSBudWxsXG4gICAgICAgICAgICAvLyAgICAgYXJndW1lbnQgYW5kIHRoaXMgaXMgTW9uZ28gb24gdGhlIHNlcnZlciwgdGhlIC53cmFwQXN5bmMnZFxuICAgICAgICAgICAgLy8gICAgIGZ1bmN0aW9ucyBsaWtlIHVwZGF0ZSB3aWxsIGdldCBjb25mdXNlZCBhbmQgcGFzcyB0aGVcbiAgICAgICAgICAgIC8vICAgICBcImZ1dC5yZXNvbHZlcigpXCIgaW4gdGhlIHdyb25nIHNsb3QsIHdoZXJlIF91cGRhdGUgd2lsbCBuZXZlclxuICAgICAgICAgICAgLy8gICAgIGludm9rZSBpdC4gQmFtLCBicm9rZW4gRERQIGNvbm5lY3Rpb24uICBQcm9iYWJseSBzaG91bGQganVzdFxuICAgICAgICAgICAgLy8gICAgIHRha2UgdGhpcyB3aG9sZSBtZXRob2QgYW5kIHdyaXRlIGl0IHRocmVlIHRpbWVzLCBpbnZva2luZ1xuICAgICAgICAgICAgLy8gICAgIGhlbHBlcnMgZm9yIHRoZSBjb21tb24gY29kZS5cbiAgICAgICAgICAgIHJldHVybiBzZWxmLl9jb2xsZWN0aW9uW3N5bmNNZXRob2RzTWFwcGVyW21ldGhvZF0gfHwgbWV0aG9kXS5hcHBseShzZWxmLl9jb2xsZWN0aW9uLCBhcmdzKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gSW4gc2VjdXJlIG1vZGUsIGlmIHdlIGhhdmVuJ3QgY2FsbGVkIGFsbG93IG9yIGRlbnksIHRoZW4gbm90aGluZ1xuICAgICAgICAgICAgLy8gaXMgcGVybWl0dGVkLlxuICAgICAgICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcig0MDMsICdBY2Nlc3MgZGVuaWVkJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgZS5uYW1lID09PSAnTW9uZ29FcnJvcicgfHxcbiAgICAgICAgICAgIC8vIGZvciBvbGQgdmVyc2lvbnMgb2YgTW9uZ29EQiAocHJvYmFibHkgbm90IG5lY2Vzc2FyeSBidXQgaXQncyBoZXJlIGp1c3QgaW4gY2FzZSlcbiAgICAgICAgICAgIGUubmFtZSA9PT0gJ0J1bGtXcml0ZUVycm9yJyB8fFxuICAgICAgICAgICAgLy8gZm9yIG5ld2VyIHZlcnNpb25zIG9mIE1vbmdvREIgKGh0dHBzOi8vZG9jcy5tb25nb2RiLmNvbS9kcml2ZXJzL25vZGUvY3VycmVudC93aGF0cy1uZXcvI2J1bGt3cml0ZWVycm9yLS0tbW9uZ29idWxrd3JpdGVlcnJvcilcbiAgICAgICAgICAgIGUubmFtZSA9PT0gJ01vbmdvQnVsa1dyaXRlRXJyb3InIHx8XG4gICAgICAgICAgICBlLm5hbWUgPT09ICdNaW5pbW9uZ29FcnJvcidcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoNDA5LCBlLnRvU3RyaW5nKCkpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9KTtcblxuICAgIHNlbGYuX2Nvbm5lY3Rpb24ubWV0aG9kcyhtKTtcbiAgfVxufTtcblxuQ29sbGVjdGlvblByb3RvdHlwZS5fdXBkYXRlRmV0Y2ggPSBmdW5jdGlvbiAoZmllbGRzKSB7XG4gIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gIGlmICghc2VsZi5fdmFsaWRhdG9ycy5mZXRjaEFsbEZpZWxkcykge1xuICAgIGlmIChmaWVsZHMpIHtcbiAgICAgIGNvbnN0IHVuaW9uID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICAgIGNvbnN0IGFkZCA9IG5hbWVzID0+IG5hbWVzICYmIG5hbWVzLmZvckVhY2gobmFtZSA9PiB1bmlvbltuYW1lXSA9IDEpO1xuICAgICAgYWRkKHNlbGYuX3ZhbGlkYXRvcnMuZmV0Y2gpO1xuICAgICAgYWRkKGZpZWxkcyk7XG4gICAgICBzZWxmLl92YWxpZGF0b3JzLmZldGNoID0gT2JqZWN0LmtleXModW5pb24pO1xuICAgIH0gZWxzZSB7XG4gICAgICBzZWxmLl92YWxpZGF0b3JzLmZldGNoQWxsRmllbGRzID0gdHJ1ZTtcbiAgICAgIC8vIGNsZWFyIGZldGNoIGp1c3QgdG8gbWFrZSBzdXJlIHdlIGRvbid0IGFjY2lkZW50YWxseSByZWFkIGl0XG4gICAgICBzZWxmLl92YWxpZGF0b3JzLmZldGNoID0gbnVsbDtcbiAgICB9XG4gIH1cbn07XG5cbkNvbGxlY3Rpb25Qcm90b3R5cGUuX2lzSW5zZWN1cmUgPSBmdW5jdGlvbiAoKSB7XG4gIGNvbnN0IHNlbGYgPSB0aGlzO1xuICBpZiAoc2VsZi5faW5zZWN1cmUgPT09IHVuZGVmaW5lZClcbiAgICByZXR1cm4gISFQYWNrYWdlLmluc2VjdXJlO1xuICByZXR1cm4gc2VsZi5faW5zZWN1cmU7XG59O1xuXG5hc3luYyBmdW5jdGlvbiBhc3luY1NvbWUoYXJyYXksIHByZWRpY2F0ZSkge1xuICBmb3IgKGxldCBpdGVtIG9mIGFycmF5KSB7XG4gICAgaWYgKGF3YWl0IHByZWRpY2F0ZShpdGVtKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gYXN5bmNFdmVyeShhcnJheSwgcHJlZGljYXRlKSB7XG4gIGZvciAobGV0IGl0ZW0gb2YgYXJyYXkpIHtcbiAgICBpZiAoIWF3YWl0IHByZWRpY2F0ZShpdGVtKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuQ29sbGVjdGlvblByb3RvdHlwZS5fdmFsaWRhdGVkSW5zZXJ0QXN5bmMgPSBhc3luYyBmdW5jdGlvbih1c2VySWQsIGRvYyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZ2VuZXJhdGVkSWQpIHtcbiAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gIC8vIGNhbGwgdXNlciB2YWxpZGF0b3JzLlxuICAvLyBBbnkgZGVueSByZXR1cm5zIHRydWUgbWVhbnMgZGVuaWVkLlxuICBpZiAoYXdhaXQgYXN5bmNTb21lKHNlbGYuX3ZhbGlkYXRvcnMuaW5zZXJ0LmRlbnksIGFzeW5jICh2YWxpZGF0b3IpID0+IHtcbiAgICBjb25zdCByZXN1bHQgPSB2YWxpZGF0b3IodXNlcklkLCBkb2NUb1ZhbGlkYXRlKHZhbGlkYXRvciwgZG9jLCBnZW5lcmF0ZWRJZCkpO1xuICAgIHJldHVybiBNZXRlb3IuX2lzUHJvbWlzZShyZXN1bHQpID8gYXdhaXQgcmVzdWx0IDogcmVzdWx0O1xuICB9KSkge1xuICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoNDAzLCBcIkFjY2VzcyBkZW5pZWRcIik7XG4gIH1cbiAgLy8gQW55IGFsbG93IHJldHVybnMgdHJ1ZSBtZWFucyBwcm9jZWVkLiBUaHJvdyBlcnJvciBpZiB0aGV5IGFsbCBmYWlsLlxuXG4gIGlmIChhd2FpdCBhc3luY0V2ZXJ5KHNlbGYuX3ZhbGlkYXRvcnMuaW5zZXJ0LmFsbG93LCBhc3luYyAodmFsaWRhdG9yKSA9PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gdmFsaWRhdG9yKHVzZXJJZCwgZG9jVG9WYWxpZGF0ZSh2YWxpZGF0b3IsIGRvYywgZ2VuZXJhdGVkSWQpKTtcbiAgICByZXR1cm4gIShNZXRlb3IuX2lzUHJvbWlzZShyZXN1bHQpID8gYXdhaXQgcmVzdWx0IDogcmVzdWx0KTtcbiAgfSkpIHtcbiAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKDQwMywgXCJBY2Nlc3MgZGVuaWVkXCIpO1xuICB9XG5cbiAgLy8gSWYgd2UgZ2VuZXJhdGVkIGFuIElEIGFib3ZlLCBpbnNlcnRBc3luYyBpdCBub3c6IGFmdGVyIHRoZSB2YWxpZGF0aW9uLCBidXRcbiAgLy8gYmVmb3JlIGFjdHVhbGx5IGluc2VydGluZy5cbiAgaWYgKGdlbmVyYXRlZElkICE9PSBudWxsKVxuICAgIGRvYy5faWQgPSBnZW5lcmF0ZWRJZDtcblxuICByZXR1cm4gc2VsZi5fY29sbGVjdGlvbi5pbnNlcnRBc3luYy5jYWxsKHNlbGYuX2NvbGxlY3Rpb24sIGRvYyk7XG59O1xuXG4vLyBTaW11bGF0ZSBhIG1vbmdvIGB1cGRhdGVgIG9wZXJhdGlvbiB3aGlsZSB2YWxpZGF0aW5nIHRoYXQgdGhlIGFjY2Vzc1xuLy8gY29udHJvbCBydWxlcyBzZXQgYnkgY2FsbHMgdG8gYGFsbG93L2RlbnlgIGFyZSBzYXRpc2ZpZWQuIElmIGFsbFxuLy8gcGFzcywgcmV3cml0ZSB0aGUgbW9uZ28gb3BlcmF0aW9uIHRvIHVzZSAkaW4gdG8gc2V0IHRoZSBsaXN0IG9mXG4vLyBkb2N1bWVudCBpZHMgdG8gY2hhbmdlICMjVmFsaWRhdGVkQ2hhbmdlXG5Db2xsZWN0aW9uUHJvdG90eXBlLl92YWxpZGF0ZWRVcGRhdGVBc3luYyA9IGFzeW5jIGZ1bmN0aW9uKFxuICAgIHVzZXJJZCwgc2VsZWN0b3IsIG11dGF0b3IsIG9wdGlvbnMpIHtcbiAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgY2hlY2sobXV0YXRvciwgT2JqZWN0KTtcblxuICBvcHRpb25zID0gT2JqZWN0LmFzc2lnbihPYmplY3QuY3JlYXRlKG51bGwpLCBvcHRpb25zKTtcblxuICBpZiAoIUxvY2FsQ29sbGVjdGlvbi5fc2VsZWN0b3JJc0lkUGVyaGFwc0FzT2JqZWN0KHNlbGVjdG9yKSlcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJ2YWxpZGF0ZWQgdXBkYXRlIHNob3VsZCBiZSBvZiBhIHNpbmdsZSBJRFwiKTtcblxuICAvLyBXZSBkb24ndCBzdXBwb3J0IHVwc2VydHMgYmVjYXVzZSB0aGV5IGRvbid0IGZpdCBuaWNlbHkgaW50byBhbGxvdy9kZW55XG4gIC8vIHJ1bGVzLlxuICBpZiAob3B0aW9ucy51cHNlcnQpXG4gICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcig0MDMsIFwiQWNjZXNzIGRlbmllZC4gVXBzZXJ0cyBub3QgXCIgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJhbGxvd2VkIGluIGEgcmVzdHJpY3RlZCBjb2xsZWN0aW9uLlwiKTtcblxuICBjb25zdCBub1JlcGxhY2VFcnJvciA9IFwiQWNjZXNzIGRlbmllZC4gSW4gYSByZXN0cmljdGVkIGNvbGxlY3Rpb24geW91IGNhbiBvbmx5XCIgK1xuICAgICAgICBcIiB1cGRhdGUgZG9jdW1lbnRzLCBub3QgcmVwbGFjZSB0aGVtLiBVc2UgYSBNb25nbyB1cGRhdGUgb3BlcmF0b3IsIHN1Y2ggXCIgK1xuICAgICAgICBcImFzICckc2V0Jy5cIjtcblxuICBjb25zdCBtdXRhdG9yS2V5cyA9IE9iamVjdC5rZXlzKG11dGF0b3IpO1xuXG4gIC8vIGNvbXB1dGUgbW9kaWZpZWQgZmllbGRzXG4gIGNvbnN0IG1vZGlmaWVkRmllbGRzID0ge307XG5cbiAgaWYgKG11dGF0b3JLZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoNDAzLCBub1JlcGxhY2VFcnJvcik7XG4gIH1cbiAgbXV0YXRvcktleXMuZm9yRWFjaCgob3ApID0+IHtcbiAgICBjb25zdCBwYXJhbXMgPSBtdXRhdG9yW29wXTtcbiAgICBpZiAob3AuY2hhckF0KDApICE9PSAnJCcpIHtcbiAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoNDAzLCBub1JlcGxhY2VFcnJvcik7XG4gICAgfSBlbHNlIGlmICghaGFzT3duLmNhbGwoQUxMT1dFRF9VUERBVEVfT1BFUkFUSU9OUywgb3ApKSB7XG4gICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKFxuICAgICAgICA0MDMsIFwiQWNjZXNzIGRlbmllZC4gT3BlcmF0b3IgXCIgKyBvcCArIFwiIG5vdCBhbGxvd2VkIGluIGEgcmVzdHJpY3RlZCBjb2xsZWN0aW9uLlwiKTtcbiAgICB9IGVsc2Uge1xuICAgICAgT2JqZWN0LmtleXMocGFyYW1zKS5mb3JFYWNoKChmaWVsZCkgPT4ge1xuICAgICAgICAvLyB0cmVhdCBkb3R0ZWQgZmllbGRzIGFzIGlmIHRoZXkgYXJlIHJlcGxhY2luZyB0aGVpclxuICAgICAgICAvLyB0b3AtbGV2ZWwgcGFydFxuICAgICAgICBpZiAoZmllbGQuaW5kZXhPZignLicpICE9PSAtMSlcbiAgICAgICAgICBmaWVsZCA9IGZpZWxkLnN1YnN0cmluZygwLCBmaWVsZC5pbmRleE9mKCcuJykpO1xuXG4gICAgICAgIC8vIHJlY29yZCB0aGUgZmllbGQgd2UgYXJlIHRyeWluZyB0byBjaGFuZ2VcbiAgICAgICAgbW9kaWZpZWRGaWVsZHNbZmllbGRdID0gdHJ1ZTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgY29uc3QgZmllbGRzID0gT2JqZWN0LmtleXMobW9kaWZpZWRGaWVsZHMpO1xuXG4gIGNvbnN0IGZpbmRPcHRpb25zID0ge3RyYW5zZm9ybTogbnVsbH07XG4gIGlmICghc2VsZi5fdmFsaWRhdG9ycy5mZXRjaEFsbEZpZWxkcykge1xuICAgIGZpbmRPcHRpb25zLmZpZWxkcyA9IHt9O1xuICAgIHNlbGYuX3ZhbGlkYXRvcnMuZmV0Y2guZm9yRWFjaCgoZmllbGROYW1lKSA9PiB7XG4gICAgICBmaW5kT3B0aW9ucy5maWVsZHNbZmllbGROYW1lXSA9IDE7XG4gICAgfSk7XG4gIH1cblxuICBjb25zdCBkb2MgPSBhd2FpdCBzZWxmLl9jb2xsZWN0aW9uLmZpbmRPbmVBc3luYyhzZWxlY3RvciwgZmluZE9wdGlvbnMpO1xuICBpZiAoIWRvYykgIC8vIG5vbmUgc2F0aXNmaWVkIVxuICAgIHJldHVybiAwO1xuXG4gIC8vIGNhbGwgdXNlciB2YWxpZGF0b3JzLlxuICAvLyBBbnkgZGVueSByZXR1cm5zIHRydWUgbWVhbnMgZGVuaWVkLlxuICBpZiAoYXdhaXQgYXN5bmNTb21lKHNlbGYuX3ZhbGlkYXRvcnMudXBkYXRlLmRlbnksIGFzeW5jICh2YWxpZGF0b3IpID0+IHtcbiAgICBjb25zdCBmYWN0b3JpZWREb2MgPSB0cmFuc2Zvcm1Eb2ModmFsaWRhdG9yLCBkb2MpO1xuICAgIGNvbnN0IHJlc3VsdCA9IHZhbGlkYXRvcih1c2VySWQsXG4gICAgICBmYWN0b3JpZWREb2MsXG4gICAgICBmaWVsZHMsXG4gICAgICBtdXRhdG9yKTtcbiAgICByZXR1cm4gTWV0ZW9yLl9pc1Byb21pc2UocmVzdWx0KSA/IGF3YWl0IHJlc3VsdCA6IHJlc3VsdDtcbiAgfSkpIHtcbiAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKDQwMywgXCJBY2Nlc3MgZGVuaWVkXCIpO1xuICB9XG5cbiAgLy8gQW55IGFsbG93IHJldHVybnMgdHJ1ZSBtZWFucyBwcm9jZWVkLiBUaHJvdyBlcnJvciBpZiB0aGV5IGFsbCBmYWlsLlxuICBpZiAoYXdhaXQgYXN5bmNFdmVyeShzZWxmLl92YWxpZGF0b3JzLnVwZGF0ZS5hbGxvdywgYXN5bmMgKHZhbGlkYXRvcikgPT4ge1xuICAgIGNvbnN0IGZhY3RvcmllZERvYyA9IHRyYW5zZm9ybURvYyh2YWxpZGF0b3IsIGRvYyk7XG4gICAgY29uc3QgcmVzdWx0ID0gdmFsaWRhdG9yKHVzZXJJZCxcbiAgICAgIGZhY3RvcmllZERvYyxcbiAgICAgIGZpZWxkcyxcbiAgICAgIG11dGF0b3IpO1xuICAgIHJldHVybiAhKE1ldGVvci5faXNQcm9taXNlKHJlc3VsdCkgPyBhd2FpdCByZXN1bHQgOiByZXN1bHQpO1xuICB9KSkge1xuICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoNDAzLCBcIkFjY2VzcyBkZW5pZWRcIik7XG4gIH1cblxuICBvcHRpb25zLl9mb3JiaWRSZXBsYWNlID0gdHJ1ZTtcblxuICAvLyBCYWNrIHdoZW4gd2Ugc3VwcG9ydGVkIGFyYml0cmFyeSBjbGllbnQtcHJvdmlkZWQgc2VsZWN0b3JzLCB3ZSBhY3R1YWxseVxuICAvLyByZXdyb3RlIHRoZSBzZWxlY3RvciB0byBpbmNsdWRlIGFuIF9pZCBjbGF1c2UgYmVmb3JlIHBhc3NpbmcgdG8gTW9uZ28gdG9cbiAgLy8gYXZvaWQgcmFjZXMsIGJ1dCBzaW5jZSBzZWxlY3RvciBpcyBndWFyYW50ZWVkIHRvIGFscmVhZHkganVzdCBiZSBhbiBJRCwgd2VcbiAgLy8gZG9uJ3QgaGF2ZSB0byBhbnkgbW9yZS5cblxuICByZXR1cm4gc2VsZi5fY29sbGVjdGlvbi51cGRhdGVBc3luYy5jYWxsKFxuICAgIHNlbGYuX2NvbGxlY3Rpb24sIHNlbGVjdG9yLCBtdXRhdG9yLCBvcHRpb25zKTtcbn07XG5cbi8vIE9ubHkgYWxsb3cgdGhlc2Ugb3BlcmF0aW9ucyBpbiB2YWxpZGF0ZWQgdXBkYXRlcy4gU3BlY2lmaWNhbGx5XG4vLyB3aGl0ZWxpc3Qgb3BlcmF0aW9ucywgcmF0aGVyIHRoYW4gYmxhY2tsaXN0LCBzbyBuZXcgY29tcGxleFxuLy8gb3BlcmF0aW9ucyB0aGF0IGFyZSBhZGRlZCBhcmVuJ3QgYXV0b21hdGljYWxseSBhbGxvd2VkLiBBIGNvbXBsZXhcbi8vIG9wZXJhdGlvbiBpcyBvbmUgdGhhdCBkb2VzIG1vcmUgdGhhbiBqdXN0IG1vZGlmeSBpdHMgdGFyZ2V0XG4vLyBmaWVsZC4gRm9yIG5vdyB0aGlzIGNvbnRhaW5zIGFsbCB1cGRhdGUgb3BlcmF0aW9ucyBleGNlcHQgJyRyZW5hbWUnLlxuLy8gaHR0cDovL2RvY3MubW9uZ29kYi5vcmcvbWFudWFsL3JlZmVyZW5jZS9vcGVyYXRvcnMvI3VwZGF0ZVxuY29uc3QgQUxMT1dFRF9VUERBVEVfT1BFUkFUSU9OUyA9IHtcbiAgJGluYzoxLCAkc2V0OjEsICR1bnNldDoxLCAkYWRkVG9TZXQ6MSwgJHBvcDoxLCAkcHVsbEFsbDoxLCAkcHVsbDoxLFxuICAkcHVzaEFsbDoxLCAkcHVzaDoxLCAkYml0OjFcbn07XG5cbi8vIFNpbXVsYXRlIGEgbW9uZ28gYHJlbW92ZWAgb3BlcmF0aW9uIHdoaWxlIHZhbGlkYXRpbmcgYWNjZXNzIGNvbnRyb2xcbi8vIHJ1bGVzLiBTZWUgI1ZhbGlkYXRlZENoYW5nZVxuQ29sbGVjdGlvblByb3RvdHlwZS5fdmFsaWRhdGVkUmVtb3ZlQXN5bmMgPSBhc3luYyBmdW5jdGlvbih1c2VySWQsIHNlbGVjdG9yKSB7XG4gIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gIGNvbnN0IGZpbmRPcHRpb25zID0ge3RyYW5zZm9ybTogbnVsbH07XG4gIGlmICghc2VsZi5fdmFsaWRhdG9ycy5mZXRjaEFsbEZpZWxkcykge1xuICAgIGZpbmRPcHRpb25zLmZpZWxkcyA9IHt9O1xuICAgIHNlbGYuX3ZhbGlkYXRvcnMuZmV0Y2guZm9yRWFjaCgoZmllbGROYW1lKSA9PiB7XG4gICAgICBmaW5kT3B0aW9ucy5maWVsZHNbZmllbGROYW1lXSA9IDE7XG4gICAgfSk7XG4gIH1cblxuICBjb25zdCBkb2MgPSBhd2FpdCBzZWxmLl9jb2xsZWN0aW9uLmZpbmRPbmVBc3luYyhzZWxlY3RvciwgZmluZE9wdGlvbnMpO1xuICBpZiAoIWRvYylcbiAgICByZXR1cm4gMDtcblxuICAvLyBjYWxsIHVzZXIgdmFsaWRhdG9ycy5cbiAgLy8gQW55IGRlbnkgcmV0dXJucyB0cnVlIG1lYW5zIGRlbmllZC5cbiAgaWYgKGF3YWl0IGFzeW5jU29tZShzZWxmLl92YWxpZGF0b3JzLnJlbW92ZS5kZW55LCBhc3luYyAodmFsaWRhdG9yKSA9PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gdmFsaWRhdG9yKHVzZXJJZCwgdHJhbnNmb3JtRG9jKHZhbGlkYXRvciwgZG9jKSk7XG4gICAgcmV0dXJuIE1ldGVvci5faXNQcm9taXNlKHJlc3VsdCkgPyBhd2FpdCByZXN1bHQgOiByZXN1bHQ7XG4gIH0pKSB7XG4gICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcig0MDMsIFwiQWNjZXNzIGRlbmllZFwiKTtcbiAgfVxuICAvLyBBbnkgYWxsb3cgcmV0dXJucyB0cnVlIG1lYW5zIHByb2NlZWQuIFRocm93IGVycm9yIGlmIHRoZXkgYWxsIGZhaWwuXG4gIGlmIChhd2FpdCBhc3luY0V2ZXJ5KHNlbGYuX3ZhbGlkYXRvcnMucmVtb3ZlLmFsbG93LCBhc3luYyAodmFsaWRhdG9yKSA9PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gdmFsaWRhdG9yKHVzZXJJZCwgdHJhbnNmb3JtRG9jKHZhbGlkYXRvciwgZG9jKSk7XG4gICAgcmV0dXJuICEoTWV0ZW9yLl9pc1Byb21pc2UocmVzdWx0KSA/IGF3YWl0IHJlc3VsdCA6IHJlc3VsdCk7XG4gIH0pKSB7XG4gICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcig0MDMsIFwiQWNjZXNzIGRlbmllZFwiKTtcbiAgfVxuXG4gIC8vIEJhY2sgd2hlbiB3ZSBzdXBwb3J0ZWQgYXJiaXRyYXJ5IGNsaWVudC1wcm92aWRlZCBzZWxlY3RvcnMsIHdlIGFjdHVhbGx5XG4gIC8vIHJld3JvdGUgdGhlIHNlbGVjdG9yIHRvIHtfaWQ6IHskaW46IFtpZHMgdGhhdCB3ZSBmb3VuZF19fSBiZWZvcmUgcGFzc2luZyB0b1xuICAvLyBNb25nbyB0byBhdm9pZCByYWNlcywgYnV0IHNpbmNlIHNlbGVjdG9yIGlzIGd1YXJhbnRlZWQgdG8gYWxyZWFkeSBqdXN0IGJlXG4gIC8vIGFuIElELCB3ZSBkb24ndCBoYXZlIHRvIGFueSBtb3JlLlxuXG4gIHJldHVybiBzZWxmLl9jb2xsZWN0aW9uLnJlbW92ZUFzeW5jLmNhbGwoc2VsZi5fY29sbGVjdGlvbiwgc2VsZWN0b3IpO1xufTtcblxuQ29sbGVjdGlvblByb3RvdHlwZS5fY2FsbE11dGF0b3JNZXRob2RBc3luYyA9IGZ1bmN0aW9uIF9jYWxsTXV0YXRvck1ldGhvZEFzeW5jKG5hbWUsIGFyZ3MsIG9wdGlvbnMgPSB7fSkge1xuXG4gIC8vIEZvciB0d28gb3V0IG9mIHRocmVlIG11dGF0b3IgbWV0aG9kcywgdGhlIGZpcnN0IGFyZ3VtZW50IGlzIGEgc2VsZWN0b3JcbiAgY29uc3QgZmlyc3RBcmdJc1NlbGVjdG9yID0gbmFtZSA9PT0gXCJ1cGRhdGVBc3luY1wiIHx8IG5hbWUgPT09IFwicmVtb3ZlQXN5bmNcIjtcbiAgaWYgKGZpcnN0QXJnSXNTZWxlY3RvciAmJiAhYWxyZWFkeUluU2ltdWxhdGlvbigpKSB7XG4gICAgLy8gSWYgd2UncmUgYWJvdXQgdG8gYWN0dWFsbHkgc2VuZCBhbiBSUEMsIHdlIHNob3VsZCB0aHJvdyBhbiBlcnJvciBpZlxuICAgIC8vIHRoaXMgaXMgYSBub24tSUQgc2VsZWN0b3IsIGJlY2F1c2UgdGhlIG11dGF0aW9uIG1ldGhvZHMgb25seSBhbGxvd1xuICAgIC8vIHNpbmdsZS1JRCBzZWxlY3RvcnMuIChJZiB3ZSBkb24ndCB0aHJvdyBoZXJlLCB3ZSdsbCBzZWUgZmxpY2tlci4pXG4gICAgdGhyb3dJZlNlbGVjdG9ySXNOb3RJZChhcmdzWzBdLCBuYW1lKTtcbiAgfVxuXG4gIGNvbnN0IG11dGF0b3JNZXRob2ROYW1lID0gdGhpcy5fcHJlZml4ICsgbmFtZTtcbiAgcmV0dXJuIHRoaXMuX2Nvbm5lY3Rpb24uYXBwbHlBc3luYyhtdXRhdG9yTWV0aG9kTmFtZSwgYXJncywge1xuICAgIHJldHVyblN0dWJWYWx1ZTogdGhpcy5yZXNvbHZlclR5cGUgPT09ICdzdHViJyB8fCB0aGlzLnJlc29sdmVyVHlwZSA9PSBudWxsLFxuICAgIC8vIFN0dWJTdHJlYW0gaXMgb25seSB1c2VkIGZvciB0ZXN0aW5nIHdoZXJlIHlvdSBkb24ndCBjYXJlIGFib3V0IHRoZSBzZXJ2ZXJcbiAgICByZXR1cm5TZXJ2ZXJSZXN1bHRQcm9taXNlOiAhdGhpcy5fY29ubmVjdGlvbi5fc3RyZWFtLl9pc1N0dWIgJiYgdGhpcy5yZXNvbHZlclR5cGUgIT09ICdzdHViJyxcbiAgICAuLi5vcHRpb25zLFxuICB9KTtcbn1cblxuQ29sbGVjdGlvblByb3RvdHlwZS5fY2FsbE11dGF0b3JNZXRob2QgPSBmdW5jdGlvbiBfY2FsbE11dGF0b3JNZXRob2QobmFtZSwgYXJncywgY2FsbGJhY2spIHtcbiAgaWYgKE1ldGVvci5pc0NsaWVudCAmJiAhY2FsbGJhY2sgJiYgIWFscmVhZHlJblNpbXVsYXRpb24oKSkge1xuICAgIC8vIENsaWVudCBjYW4ndCBibG9jaywgc28gaXQgY2FuJ3QgcmVwb3J0IGVycm9ycyBieSBleGNlcHRpb24sXG4gICAgLy8gb25seSBieSBjYWxsYmFjay4gSWYgdGhleSBmb3JnZXQgdGhlIGNhbGxiYWNrLCBnaXZlIHRoZW0gYVxuICAgIC8vIGRlZmF1bHQgb25lIHRoYXQgbG9ncyB0aGUgZXJyb3IsIHNvIHRoZXkgYXJlbid0IHRvdGFsbHlcbiAgICAvLyBiYWZmbGVkIGlmIHRoZWlyIHdyaXRlcyBkb24ndCB3b3JrIGJlY2F1c2UgdGhlaXIgZGF0YWJhc2UgaXNcbiAgICAvLyBkb3duLlxuICAgIC8vIERvbid0IGdpdmUgYSBkZWZhdWx0IGNhbGxiYWNrIGluIHNpbXVsYXRpb24sIGJlY2F1c2UgaW5zaWRlIHN0dWJzIHdlXG4gICAgLy8gd2FudCB0byByZXR1cm4gdGhlIHJlc3VsdHMgZnJvbSB0aGUgbG9jYWwgY29sbGVjdGlvbiBpbW1lZGlhdGVseSBhbmRcbiAgICAvLyBub3QgZm9yY2UgYSBjYWxsYmFjay5cbiAgICBjYWxsYmFjayA9IGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgIGlmIChlcnIpXG4gICAgICAgIE1ldGVvci5fZGVidWcobmFtZSArIFwiIGZhaWxlZFwiLCBlcnIpO1xuICAgIH07XG4gIH1cblxuICAvLyBGb3IgdHdvIG91dCBvZiB0aHJlZSBtdXRhdG9yIG1ldGhvZHMsIHRoZSBmaXJzdCBhcmd1bWVudCBpcyBhIHNlbGVjdG9yXG4gIGNvbnN0IGZpcnN0QXJnSXNTZWxlY3RvciA9IG5hbWUgPT09IFwidXBkYXRlXCIgfHwgbmFtZSA9PT0gXCJyZW1vdmVcIjtcbiAgaWYgKGZpcnN0QXJnSXNTZWxlY3RvciAmJiAhYWxyZWFkeUluU2ltdWxhdGlvbigpKSB7XG4gICAgLy8gSWYgd2UncmUgYWJvdXQgdG8gYWN0dWFsbHkgc2VuZCBhbiBSUEMsIHdlIHNob3VsZCB0aHJvdyBhbiBlcnJvciBpZlxuICAgIC8vIHRoaXMgaXMgYSBub24tSUQgc2VsZWN0b3IsIGJlY2F1c2UgdGhlIG11dGF0aW9uIG1ldGhvZHMgb25seSBhbGxvd1xuICAgIC8vIHNpbmdsZS1JRCBzZWxlY3RvcnMuIChJZiB3ZSBkb24ndCB0aHJvdyBoZXJlLCB3ZSdsbCBzZWUgZmxpY2tlci4pXG4gICAgdGhyb3dJZlNlbGVjdG9ySXNOb3RJZChhcmdzWzBdLCBuYW1lKTtcbiAgfVxuXG4gIGNvbnN0IG11dGF0b3JNZXRob2ROYW1lID0gdGhpcy5fcHJlZml4ICsgbmFtZTtcbiAgcmV0dXJuIHRoaXMuX2Nvbm5lY3Rpb24uYXBwbHkoXG4gICAgbXV0YXRvck1ldGhvZE5hbWUsIGFyZ3MsIHsgcmV0dXJuU3R1YlZhbHVlOiB0cnVlIH0sIGNhbGxiYWNrKTtcbn1cblxuZnVuY3Rpb24gdHJhbnNmb3JtRG9jKHZhbGlkYXRvciwgZG9jKSB7XG4gIGlmICh2YWxpZGF0b3IudHJhbnNmb3JtKVxuICAgIHJldHVybiB2YWxpZGF0b3IudHJhbnNmb3JtKGRvYyk7XG4gIHJldHVybiBkb2M7XG59XG5cbmZ1bmN0aW9uIGRvY1RvVmFsaWRhdGUodmFsaWRhdG9yLCBkb2MsIGdlbmVyYXRlZElkKSB7XG4gIGxldCByZXQgPSBkb2M7XG4gIGlmICh2YWxpZGF0b3IudHJhbnNmb3JtKSB7XG4gICAgcmV0ID0gRUpTT04uY2xvbmUoZG9jKTtcbiAgICAvLyBJZiB5b3Ugc2V0IGEgc2VydmVyLXNpZGUgdHJhbnNmb3JtIG9uIHlvdXIgY29sbGVjdGlvbiwgdGhlbiB5b3UgZG9uJ3QgZ2V0XG4gICAgLy8gdG8gdGVsbCB0aGUgZGlmZmVyZW5jZSBiZXR3ZWVuIFwiY2xpZW50IHNwZWNpZmllZCB0aGUgSURcIiBhbmQgXCJzZXJ2ZXJcbiAgICAvLyBnZW5lcmF0ZWQgdGhlIElEXCIsIGJlY2F1c2UgdHJhbnNmb3JtcyBleHBlY3QgdG8gZ2V0IF9pZC4gIElmIHlvdSB3YW50IHRvXG4gICAgLy8gZG8gdGhhdCBjaGVjaywgeW91IGNhbiBkbyBpdCB3aXRoIGEgc3BlY2lmaWNcbiAgICAvLyBgQy5hbGxvdyh7aW5zZXJ0QXN5bmM6IGYsIHRyYW5zZm9ybTogbnVsbH0pYCB2YWxpZGF0b3IuXG4gICAgaWYgKGdlbmVyYXRlZElkICE9PSBudWxsKSB7XG4gICAgICByZXQuX2lkID0gZ2VuZXJhdGVkSWQ7XG4gICAgfVxuICAgIHJldCA9IHZhbGlkYXRvci50cmFuc2Zvcm0ocmV0KTtcbiAgfVxuICByZXR1cm4gcmV0O1xufVxuXG5mdW5jdGlvbiBhZGRWYWxpZGF0b3IoY29sbGVjdGlvbiwgYWxsb3dPckRlbnksIG9wdGlvbnMpIHtcbiAgLy8gdmFsaWRhdGUga2V5c1xuICBjb25zdCB2YWxpZEtleXNSZWdFeCA9IC9eKD86aW5zZXJ0QXN5bmN8dXBkYXRlQXN5bmN8cmVtb3ZlQXN5bmN8aW5zZXJ0fHVwZGF0ZXxyZW1vdmV8ZmV0Y2h8dHJhbnNmb3JtKSQvO1xuICBPYmplY3Qua2V5cyhvcHRpb25zKS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICBpZiAoIXZhbGlkS2V5c1JlZ0V4LnRlc3Qoa2V5KSlcbiAgICAgIHRocm93IG5ldyBFcnJvcihhbGxvd09yRGVueSArIFwiOiBJbnZhbGlkIGtleTogXCIgKyBrZXkpO1xuXG4gICAgLy8gVE9ETyBkZXByZWNhdGVkIGFzeW5jIGNvbmZpZyBvbiBmdXR1cmUgdmVyc2lvbnNcbiAgICBjb25zdCBpc0FzeW5jS2V5ID0ga2V5LmluY2x1ZGVzKCdBc3luYycpO1xuICAgIGlmIChpc0FzeW5jS2V5KSB7XG4gICAgICBjb25zdCBzeW5jS2V5ID0ga2V5LnJlcGxhY2UoJ0FzeW5jJywgJycpO1xuICAgICAgTWV0ZW9yLmRlcHJlY2F0ZShhbGxvd09yRGVueSArIGA6IFRoZSBcIiR7a2V5fVwiIGtleSBpcyBkZXByZWNhdGVkLiBVc2UgXCIke3N5bmNLZXl9XCIgaW5zdGVhZC5gKTtcbiAgICB9XG4gIH0pO1xuXG4gIGNvbGxlY3Rpb24uX3Jlc3RyaWN0ZWQgPSB0cnVlO1xuXG4gIFtcbiAgICAnaW5zZXJ0QXN5bmMnLFxuICAgICd1cGRhdGVBc3luYycsXG4gICAgJ3JlbW92ZUFzeW5jJyxcbiAgICAnaW5zZXJ0JyxcbiAgICAndXBkYXRlJyxcbiAgICAncmVtb3ZlJyxcbiAgXS5mb3JFYWNoKG5hbWUgPT4ge1xuICAgIGlmIChoYXNPd24uY2FsbChvcHRpb25zLCBuYW1lKSkge1xuICAgICAgaWYgKCEob3B0aW9uc1tuYW1lXSBpbnN0YW5jZW9mIEZ1bmN0aW9uKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgYWxsb3dPckRlbnkgKyAnOiBWYWx1ZSBmb3IgYCcgKyBuYW1lICsgJ2AgbXVzdCBiZSBhIGZ1bmN0aW9uJ1xuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICAvLyBJZiB0aGUgdHJhbnNmb3JtIGlzIHNwZWNpZmllZCBhdCBhbGwgKGluY2x1ZGluZyBhcyAnbnVsbCcpIGluIHRoaXNcbiAgICAgIC8vIGNhbGwsIHRoZW4gdGFrZSB0aGF0OyBvdGhlcndpc2UsIHRha2UgdGhlIHRyYW5zZm9ybSBmcm9tIHRoZVxuICAgICAgLy8gY29sbGVjdGlvbi5cbiAgICAgIGlmIChvcHRpb25zLnRyYW5zZm9ybSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIG9wdGlvbnNbbmFtZV0udHJhbnNmb3JtID0gY29sbGVjdGlvbi5fdHJhbnNmb3JtOyAvLyBhbHJlYWR5IHdyYXBwZWRcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG9wdGlvbnNbbmFtZV0udHJhbnNmb3JtID0gTG9jYWxDb2xsZWN0aW9uLndyYXBUcmFuc2Zvcm0oXG4gICAgICAgICAgb3B0aW9ucy50cmFuc2Zvcm1cbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGlzQXN5bmNOYW1lID0gbmFtZS5pbmNsdWRlcygnQXN5bmMnKTtcbiAgICAgIGNvbnN0IHZhbGlkYXRvclN5bmNOYW1lID0gaXNBc3luY05hbWUgPyBuYW1lLnJlcGxhY2UoJ0FzeW5jJywgJycpIDogbmFtZTtcbiAgICAgIGNvbGxlY3Rpb24uX3ZhbGlkYXRvcnNbdmFsaWRhdG9yU3luY05hbWVdW2FsbG93T3JEZW55XS5wdXNoKG9wdGlvbnNbbmFtZV0pO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gT25seSB1cGRhdGVBc3luYyB0aGUgZmV0Y2ggZmllbGRzIGlmIHdlJ3JlIHBhc3NlZCB0aGluZ3MgdGhhdCBhZmZlY3RcbiAgLy8gZmV0Y2hpbmcuIFRoaXMgd2F5IGFsbG93KHt9KSBhbmQgYWxsb3coe2luc2VydEFzeW5jOiBmfSkgZG9uJ3QgcmVzdWx0IGluXG4gIC8vIHNldHRpbmcgZmV0Y2hBbGxGaWVsZHNcbiAgaWYgKG9wdGlvbnMudXBkYXRlQXN5bmMgfHwgb3B0aW9ucy5yZW1vdmVBc3luYyB8fCBvcHRpb25zLmZldGNoKSB7XG4gICAgaWYgKG9wdGlvbnMuZmV0Y2ggJiYgIShvcHRpb25zLmZldGNoIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYWxsb3dPckRlbnkgKyBcIjogVmFsdWUgZm9yIGBmZXRjaGAgbXVzdCBiZSBhbiBhcnJheVwiKTtcbiAgICB9XG4gICAgY29sbGVjdGlvbi5fdXBkYXRlRmV0Y2gob3B0aW9ucy5mZXRjaCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gdGhyb3dJZlNlbGVjdG9ySXNOb3RJZChzZWxlY3RvciwgbWV0aG9kTmFtZSkge1xuICBpZiAoIUxvY2FsQ29sbGVjdGlvbi5fc2VsZWN0b3JJc0lkUGVyaGFwc0FzT2JqZWN0KHNlbGVjdG9yKSkge1xuICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoXG4gICAgICA0MDMsIFwiTm90IHBlcm1pdHRlZC4gVW50cnVzdGVkIGNvZGUgbWF5IG9ubHkgXCIgKyBtZXRob2ROYW1lICtcbiAgICAgICAgXCIgZG9jdW1lbnRzIGJ5IElELlwiKTtcbiAgfVxufTtcblxuLy8gRGV0ZXJtaW5lIGlmIHdlIGFyZSBpbiBhIEREUCBtZXRob2Qgc2ltdWxhdGlvblxuZnVuY3Rpb24gYWxyZWFkeUluU2ltdWxhdGlvbigpIHtcbiAgdmFyIEN1cnJlbnRJbnZvY2F0aW9uID1cbiAgICBERFAuX0N1cnJlbnRNZXRob2RJbnZvY2F0aW9uIHx8XG4gICAgLy8gRm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5LCBhcyBleHBsYWluZWQgaW4gdGhpcyBpc3N1ZTpcbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9pc3N1ZXMvODk0N1xuICAgIEREUC5fQ3VycmVudEludm9jYXRpb247XG5cbiAgY29uc3QgZW5jbG9zaW5nID0gQ3VycmVudEludm9jYXRpb24uZ2V0KCk7XG4gIHJldHVybiBlbmNsb3NpbmcgJiYgZW5jbG9zaW5nLmlzU2ltdWxhdGlvbjtcbn1cbiJdfQ==
