Package["core-runtime"].queue("mongo",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;
var NpmModuleMongodb = Package['npm-mongo'].NpmModuleMongodb;
var NpmModuleMongodbVersion = Package['npm-mongo'].NpmModuleMongodbVersion;
var AllowDeny = Package['allow-deny'].AllowDeny;
var Random = Package.random.Random;
var EJSON = Package.ejson.EJSON;
var LocalCollection = Package.minimongo.LocalCollection;
var Minimongo = Package.minimongo.Minimongo;
var DDP = Package['ddp-client'].DDP;
var DDPServer = Package['ddp-server'].DDPServer;
var Tracker = Package.tracker.Tracker;
var Deps = Package.tracker.Deps;
var DiffSequence = Package['diff-sequence'].DiffSequence;
var MongoID = Package['mongo-id'].MongoID;
var check = Package.check.check;
var Match = Package.check.Match;
var ECMAScript = Package.ecmascript.ECMAScript;
var Log = Package.logging.Log;
var Decimal = Package['mongo-decimal'].Decimal;
var MaxHeap = Package['binary-heap'].MaxHeap;
var MinHeap = Package['binary-heap'].MinHeap;
var MinMaxHeap = Package['binary-heap'].MinMaxHeap;
var Hook = Package['callback-hook'].Hook;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var MongoInternals, callback, Mongo, ObserveMultiplexer;

var require = meteorInstall({"node_modules":{"meteor":{"mongo":{"mongo_driver.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/mongo_driver.js                                                                                      //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
!module.wrapAsync(async function (module1, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module1.export({
      listenAll: () => listenAll,
      forEachTrigger: () => forEachTrigger
    });
    let OplogHandle;
    module1.link("./oplog_tailing", {
      OplogHandle(v) {
        OplogHandle = v;
      }
    }, 0);
    let MongoConnection;
    module1.link("./mongo_connection", {
      MongoConnection(v) {
        MongoConnection = v;
      }
    }, 1);
    let OplogObserveDriver;
    module1.link("./oplog_observe_driver", {
      OplogObserveDriver(v) {
        OplogObserveDriver = v;
      }
    }, 2);
    let MongoDB;
    module1.link("./mongo_common", {
      MongoDB(v) {
        MongoDB = v;
      }
    }, 3);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    MongoInternals = global.MongoInternals = {};
    MongoInternals.__packageName = 'mongo';
    MongoInternals.NpmModules = {
      mongodb: {
        version: NpmModuleMongodbVersion,
        module: MongoDB
      }
    };

    // Older version of what is now available via
    // MongoInternals.NpmModules.mongodb.module.  It was never documented, but
    // people do use it.
    // XXX COMPAT WITH 1.0.3.2
    MongoInternals.NpmModule = new Proxy(MongoDB, {
      get(target, propertyKey, receiver) {
        if (propertyKey === 'ObjectID') {
          Meteor.deprecate("Accessing 'MongoInternals.NpmModule.ObjectID' directly is deprecated. " + "Use 'MongoInternals.NpmModule.ObjectId' instead.");
        }
        return Reflect.get(target, propertyKey, receiver);
      }
    });
    MongoInternals.OplogHandle = OplogHandle;
    MongoInternals.Connection = MongoConnection;
    MongoInternals.OplogObserveDriver = OplogObserveDriver;

    // This is used to add or remove EJSON from the beginning of everything nested
    // inside an EJSON custom type. It should only be called on pure JSON!

    // Ensure that EJSON.clone keeps a Timestamp as a Timestamp (instead of just
    // doing a structural clone).
    // XXX how ok is this? what if there are multiple copies of MongoDB loaded?
    MongoDB.Timestamp.prototype.clone = function () {
      // Timestamps should be immutable.
      return this;
    };

    // Listen for the invalidation messages that will trigger us to poll the
    // database for changes. If this selector specifies specific IDs, specify them
    // here, so that updates to different specific IDs don't cause us to poll.
    // listenCallback is the same kind of (notification, complete) callback passed
    // to InvalidationCrossbar.listen.

    const listenAll = async function (cursorDescription, listenCallback) {
      const listeners = [];
      await forEachTrigger(cursorDescription, function (trigger) {
        listeners.push(DDPServer._InvalidationCrossbar.listen(trigger, listenCallback));
      });
      return {
        stop: function () {
          listeners.forEach(function (listener) {
            listener.stop();
          });
        }
      };
    };
    const forEachTrigger = async function (cursorDescription, triggerCallback) {
      const key = {
        collection: cursorDescription.collectionName
      };
      const specificIds = LocalCollection._idsMatchedBySelector(cursorDescription.selector);
      if (specificIds) {
        for (const id of specificIds) {
          await triggerCallback(Object.assign({
            id: id
          }, key));
        }
        await triggerCallback(Object.assign({
          dropCollection: true,
          id: null
        }, key));
      } else {
        await triggerCallback(key);
      }
      // Everyone cares about the database being dropped.
      await triggerCallback({
        dropDatabase: true
      });
    };
    // XXX We probably need to find a better way to expose this. Right now
    // it's only used by tests, but in fact you need it in normal
    // operation to interact with capped collections.
    MongoInternals.MongoTimestamp = MongoDB.Timestamp;
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

},"oplog_tailing.ts":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/oplog_tailing.ts                                                                                     //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      OPLOG_COLLECTION: () => OPLOG_COLLECTION,
      OplogHandle: () => OplogHandle,
      idForOp: () => idForOp
    });
    let isEmpty;
    module.link("lodash.isempty", {
      default(v) {
        isEmpty = v;
      }
    }, 0);
    let Meteor;
    module.link("meteor/meteor", {
      Meteor(v) {
        Meteor = v;
      }
    }, 1);
    let CursorDescription;
    module.link("./cursor_description", {
      CursorDescription(v) {
        CursorDescription = v;
      }
    }, 2);
    let MongoConnection;
    module.link("./mongo_connection", {
      MongoConnection(v) {
        MongoConnection = v;
      }
    }, 3);
    let NpmModuleMongodb;
    module.link("meteor/npm-mongo", {
      NpmModuleMongodb(v) {
        NpmModuleMongodb = v;
      }
    }, 4);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    const {
      Long
    } = NpmModuleMongodb;
    const OPLOG_COLLECTION = 'oplog.rs';
    let TOO_FAR_BEHIND = +(process.env.METEOR_OPLOG_TOO_FAR_BEHIND || 2000);
    const TAIL_TIMEOUT = +(process.env.METEOR_OPLOG_TAIL_TIMEOUT || 30000);
    class OplogHandle {
      constructor(oplogUrl, dbName) {
        var _Meteor$settings, _Meteor$settings$pack, _Meteor$settings$pack2, _Meteor$settings2, _Meteor$settings2$pac, _Meteor$settings2$pac2;
        this._oplogUrl = void 0;
        this._dbName = void 0;
        this._oplogLastEntryConnection = void 0;
        this._oplogTailConnection = void 0;
        this._oplogOptions = void 0;
        this._stopped = void 0;
        this._tailHandle = void 0;
        this._readyPromiseResolver = void 0;
        this._readyPromise = void 0;
        this._crossbar = void 0;
        this._catchingUpResolvers = void 0;
        this._lastProcessedTS = void 0;
        this._onSkippedEntriesHook = void 0;
        this._startTrailingPromise = void 0;
        this._resolveTimeout = void 0;
        this._entryQueue = new Meteor._DoubleEndedQueue();
        this._workerActive = false;
        this._workerPromise = null;
        this._oplogUrl = oplogUrl;
        this._dbName = dbName;
        this._resolveTimeout = null;
        this._oplogLastEntryConnection = null;
        this._oplogTailConnection = null;
        this._stopped = false;
        this._tailHandle = null;
        this._readyPromiseResolver = null;
        this._readyPromise = new Promise(r => this._readyPromiseResolver = r);
        this._crossbar = new DDPServer._Crossbar({
          factPackage: "mongo-livedata",
          factName: "oplog-watchers"
        });
        const includeCollections = (_Meteor$settings = Meteor.settings) === null || _Meteor$settings === void 0 ? void 0 : (_Meteor$settings$pack = _Meteor$settings.packages) === null || _Meteor$settings$pack === void 0 ? void 0 : (_Meteor$settings$pack2 = _Meteor$settings$pack.mongo) === null || _Meteor$settings$pack2 === void 0 ? void 0 : _Meteor$settings$pack2.oplogIncludeCollections;
        const excludeCollections = (_Meteor$settings2 = Meteor.settings) === null || _Meteor$settings2 === void 0 ? void 0 : (_Meteor$settings2$pac = _Meteor$settings2.packages) === null || _Meteor$settings2$pac === void 0 ? void 0 : (_Meteor$settings2$pac2 = _Meteor$settings2$pac.mongo) === null || _Meteor$settings2$pac2 === void 0 ? void 0 : _Meteor$settings2$pac2.oplogExcludeCollections;
        if (includeCollections !== null && includeCollections !== void 0 && includeCollections.length && excludeCollections !== null && excludeCollections !== void 0 && excludeCollections.length) {
          throw new Error("Can't use both mongo oplog settings oplogIncludeCollections and oplogExcludeCollections at the same time.");
        }
        this._oplogOptions = {
          includeCollections,
          excludeCollections
        };
        this._catchingUpResolvers = [];
        this._lastProcessedTS = null;
        this._onSkippedEntriesHook = new Hook({
          debugPrintExceptions: "onSkippedEntries callback"
        });
        this._startTrailingPromise = this._startTailing();
      }
      _getOplogSelector(lastProcessedTS) {
        var _this$_oplogOptions$e, _this$_oplogOptions$i;
        const oplogCriteria = [{
          $or: [{
            op: {
              $in: ["i", "u", "d"]
            }
          }, {
            op: "c",
            "o.drop": {
              $exists: true
            }
          }, {
            op: "c",
            "o.dropDatabase": 1
          }, {
            op: "c",
            "o.applyOps": {
              $exists: true
            }
          }]
        }];
        const nsRegex = new RegExp("^(?:" + [
        // @ts-ignore
        Meteor._escapeRegExp(this._dbName + "."),
        // @ts-ignore
        Meteor._escapeRegExp("admin.$cmd")].join("|") + ")");
        if ((_this$_oplogOptions$e = this._oplogOptions.excludeCollections) !== null && _this$_oplogOptions$e !== void 0 && _this$_oplogOptions$e.length) {
          oplogCriteria.push({
            ns: {
              $regex: nsRegex,
              $nin: this._oplogOptions.excludeCollections.map(collName => "".concat(this._dbName, ".").concat(collName))
            }
          });
        } else if ((_this$_oplogOptions$i = this._oplogOptions.includeCollections) !== null && _this$_oplogOptions$i !== void 0 && _this$_oplogOptions$i.length) {
          oplogCriteria.push({
            $or: [{
              ns: /^admin\.\$cmd/
            }, {
              ns: {
                $in: this._oplogOptions.includeCollections.map(collName => "".concat(this._dbName, ".").concat(collName))
              }
            }]
          });
        } else {
          oplogCriteria.push({
            ns: nsRegex
          });
        }
        if (lastProcessedTS) {
          oplogCriteria.push({
            ts: {
              $gt: lastProcessedTS
            }
          });
        }
        return {
          $and: oplogCriteria
        };
      }
      async stop() {
        if (this._stopped) return;
        this._stopped = true;
        if (this._tailHandle) {
          await this._tailHandle.stop();
        }
      }
      async _onOplogEntry(trigger, callback) {
        if (this._stopped) {
          throw new Error("Called onOplogEntry on stopped handle!");
        }
        await this._readyPromise;
        const originalCallback = callback;
        /**
         * This depends on AsynchronousQueue tasks being wrapped in `bindEnvironment` too.
         *
         * @todo Check after we simplify the `bindEnvironment` implementation if we can remove the second wrap.
         */
        callback = Meteor.bindEnvironment(function (notification) {
          originalCallback(notification);
        },
        // @ts-ignore
        function (err) {
          Meteor._debug("Error in oplog callback", err);
        });
        const listenHandle = this._crossbar.listen(trigger, callback);
        return {
          stop: async function () {
            await listenHandle.stop();
          }
        };
      }
      onOplogEntry(trigger, callback) {
        return this._onOplogEntry(trigger, callback);
      }
      onSkippedEntries(callback) {
        if (this._stopped) {
          throw new Error("Called onSkippedEntries on stopped handle!");
        }
        return this._onSkippedEntriesHook.register(callback);
      }
      async _waitUntilCaughtUp() {
        if (this._stopped) {
          throw new Error("Called waitUntilCaughtUp on stopped handle!");
        }
        await this._readyPromise;
        let lastEntry = null;
        while (!this._stopped) {
          const oplogSelector = this._getOplogSelector();
          try {
            lastEntry = await this._oplogLastEntryConnection.findOneAsync(OPLOG_COLLECTION, oplogSelector, {
              projection: {
                ts: 1
              },
              sort: {
                $natural: -1
              }
            });
            break;
          } catch (e) {
            Meteor._debug("Got exception while reading last entry", e);
            // @ts-ignore
            await Meteor.sleep(100);
          }
        }
        if (this._stopped) return;
        if (!lastEntry) return;
        const ts = lastEntry.ts;
        if (!ts) {
          throw Error("oplog entry without ts: " + JSON.stringify(lastEntry));
        }
        if (this._lastProcessedTS && ts.lessThanOrEqual(this._lastProcessedTS)) {
          return;
        }
        let insertAfter = this._catchingUpResolvers.length;
        while (insertAfter - 1 > 0 && this._catchingUpResolvers[insertAfter - 1].ts.greaterThan(ts)) {
          insertAfter--;
        }
        let promiseResolver = null;
        const promiseToAwait = new Promise(r => promiseResolver = r);
        clearTimeout(this._resolveTimeout);
        this._resolveTimeout = setTimeout(() => {
          console.error("Meteor: oplog catching up took too long", {
            ts
          });
        }, 10000);
        this._catchingUpResolvers.splice(insertAfter, 0, {
          ts,
          resolver: promiseResolver
        });
        await promiseToAwait;
        clearTimeout(this._resolveTimeout);
      }
      async waitUntilCaughtUp() {
        return this._waitUntilCaughtUp();
      }
      async _startTailing() {
        const mongodbUri = require('mongodb-uri');
        if (mongodbUri.parse(this._oplogUrl).database !== 'local') {
          throw new Error("$MONGO_OPLOG_URL must be set to the 'local' database of a Mongo replica set");
        }
        this._oplogTailConnection = new MongoConnection(this._oplogUrl, {
          maxPoolSize: 1,
          minPoolSize: 1
        });
        this._oplogLastEntryConnection = new MongoConnection(this._oplogUrl, {
          maxPoolSize: 1,
          minPoolSize: 1
        });
        try {
          const isMasterDoc = await this._oplogLastEntryConnection.db.admin().command({
            ismaster: 1
          });
          if (!(isMasterDoc && isMasterDoc.setName)) {
            throw new Error("$MONGO_OPLOG_URL must be set to the 'local' database of a Mongo replica set");
          }
          const lastOplogEntry = await this._oplogLastEntryConnection.findOneAsync(OPLOG_COLLECTION, {}, {
            sort: {
              $natural: -1
            },
            projection: {
              ts: 1
            }
          });
          const oplogSelector = this._getOplogSelector(lastOplogEntry === null || lastOplogEntry === void 0 ? void 0 : lastOplogEntry.ts);
          if (lastOplogEntry) {
            this._lastProcessedTS = lastOplogEntry.ts;
          }
          const cursorDescription = new CursorDescription(OPLOG_COLLECTION, oplogSelector, {
            tailable: true
          });
          this._tailHandle = this._oplogTailConnection.tail(cursorDescription, doc => {
            this._entryQueue.push(doc);
            this._maybeStartWorker();
          }, TAIL_TIMEOUT);
          this._readyPromiseResolver();
        } catch (error) {
          console.error('Error in _startTailing:', error);
          throw error;
        }
      }
      _maybeStartWorker() {
        if (this._workerPromise) return;
        this._workerActive = true;
        // Convert to a proper promise-based queue processor
        this._workerPromise = (async () => {
          try {
            while (!this._stopped && !this._entryQueue.isEmpty()) {
              // Are we too far behind? Just tell our observers that they need to
              // repoll, and drop our queue.
              if (this._entryQueue.length > TOO_FAR_BEHIND) {
                const lastEntry = this._entryQueue.pop();
                this._entryQueue.clear();
                this._onSkippedEntriesHook.each(callback => {
                  callback();
                  return true;
                });
                // Free any waitUntilCaughtUp() calls that were waiting for us to
                // pass something that we just skipped.
                this._setLastProcessedTS(lastEntry.ts);
                continue;
              }
              // Process next batch from the queue
              const doc = this._entryQueue.shift();
              try {
                await handleDoc(this, doc);
                // Process any waiting fence callbacks
                if (doc.ts) {
                  this._setLastProcessedTS(doc.ts);
                }
              } catch (e) {
                // Keep processing queue even if one entry fails
                console.error('Error processing oplog entry:', e);
              }
            }
          } finally {
            this._workerPromise = null;
            this._workerActive = false;
          }
        })();
      }
      _setLastProcessedTS(ts) {
        this._lastProcessedTS = ts;
        while (!isEmpty(this._catchingUpResolvers) && this._catchingUpResolvers[0].ts.lessThanOrEqual(this._lastProcessedTS)) {
          const sequencer = this._catchingUpResolvers.shift();
          sequencer.resolver();
        }
      }
      _defineTooFarBehind(value) {
        TOO_FAR_BEHIND = value;
      }
      _resetTooFarBehind() {
        TOO_FAR_BEHIND = +(process.env.METEOR_OPLOG_TOO_FAR_BEHIND || 2000);
      }
    }
    function idForOp(op) {
      if (op.op === 'd' || op.op === 'i') {
        return op.o._id;
      } else if (op.op === 'u') {
        return op.o2._id;
      } else if (op.op === 'c') {
        throw Error("Operator 'c' doesn't supply an object with id: " + JSON.stringify(op));
      } else {
        throw Error("Unknown op: " + JSON.stringify(op));
      }
    }
    async function handleDoc(handle, doc) {
      if (doc.ns === "admin.$cmd") {
        if (doc.o.applyOps) {
          // This was a successful transaction, so we need to apply the
          // operations that were involved.
          let nextTimestamp = doc.ts;
          for (const op of doc.o.applyOps) {
            // See https://github.com/meteor/meteor/issues/10420.
            if (!op.ts) {
              op.ts = nextTimestamp;
              nextTimestamp = nextTimestamp.add(Long.ONE);
            }
            await handleDoc(handle, op);
          }
          return;
        }
        throw new Error("Unknown command " + JSON.stringify(doc));
      }
      const trigger = {
        dropCollection: false,
        dropDatabase: false,
        op: doc
      };
      if (typeof doc.ns === "string" && doc.ns.startsWith(handle._dbName + ".")) {
        trigger.collection = doc.ns.slice(handle._dbName.length + 1);
      }
      // Is it a special command and the collection name is hidden
      // somewhere in operator?
      if (trigger.collection === "$cmd") {
        if (doc.o.dropDatabase) {
          delete trigger.collection;
          trigger.dropDatabase = true;
        } else if ("drop" in doc.o) {
          trigger.collection = doc.o.drop;
          trigger.dropCollection = true;
          trigger.id = null;
        } else if ("create" in doc.o && "idIndex" in doc.o) {
          // A collection got implicitly created within a transaction. There's
          // no need to do anything about it.
        } else {
          throw Error("Unknown command " + JSON.stringify(doc));
        }
      } else {
        // All other ops have an id.
        trigger.id = idForOp(doc);
      }
      await handle._crossbar.fire(trigger);
      await new Promise(resolve => setImmediate(resolve));
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

},"observe_multiplex.ts":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/observe_multiplex.ts                                                                                 //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    let _objectWithoutProperties;
    module.link("@babel/runtime/helpers/objectWithoutProperties", {
      default(v) {
        _objectWithoutProperties = v;
      }
    }, 0);
    const _excluded = ["_id"];
    module.export({
      ObserveMultiplexer: () => ObserveMultiplexer
    });
    let isEmpty;
    module.link("lodash.isempty", {
      default(v) {
        isEmpty = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    class ObserveMultiplexer {
      constructor(_ref) {
        var _this = this;
        let {
          ordered,
          onStop = () => {}
        } = _ref;
        this._ordered = void 0;
        this._onStop = void 0;
        this._queue = void 0;
        this._handles = void 0;
        this._resolver = void 0;
        this._readyPromise = void 0;
        this._isReady = void 0;
        this._cache = void 0;
        this._addHandleTasksScheduledButNotPerformed = void 0;
        if (ordered === undefined) throw Error("must specify ordered");
        // @ts-ignore
        Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "observe-multiplexers", 1);
        this._ordered = ordered;
        this._onStop = onStop;
        this._queue = new Meteor._AsynchronousQueue();
        this._handles = {};
        this._resolver = null;
        this._isReady = false;
        this._readyPromise = new Promise(r => this._resolver = r).then(() => this._isReady = true);
        // @ts-ignore
        this._cache = new LocalCollection._CachingChangeObserver({
          ordered
        });
        this._addHandleTasksScheduledButNotPerformed = 0;
        this.callbackNames().forEach(callbackName => {
          this[callbackName] = function () {
            for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
              args[_key] = arguments[_key];
            }
            _this._applyCallback(callbackName, args);
          };
        });
      }
      addHandleAndSendInitialAdds(handle) {
        return this._addHandleAndSendInitialAdds(handle);
      }
      async _addHandleAndSendInitialAdds(handle) {
        ++this._addHandleTasksScheduledButNotPerformed;
        // @ts-ignore
        Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "observe-handles", 1);
        await this._queue.runTask(async () => {
          this._handles[handle._id] = handle;
          await this._sendAdds(handle);
          --this._addHandleTasksScheduledButNotPerformed;
        });
        await this._readyPromise;
      }
      async removeHandle(id) {
        if (!this._ready()) throw new Error("Can't remove handles until the multiplex is ready");
        delete this._handles[id];
        // @ts-ignore
        Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "observe-handles", -1);
        if (isEmpty(this._handles) && this._addHandleTasksScheduledButNotPerformed === 0) {
          await this._stop();
        }
      }
      async _stop() {
        let options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
        if (!this._ready() && !options.fromQueryError) throw Error("surprising _stop: not ready");
        await this._onStop();
        // @ts-ignore
        Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "observe-multiplexers", -1);
        this._handles = null;
      }
      async ready() {
        await this._queue.queueTask(() => {
          if (this._ready()) throw Error("can't make ObserveMultiplex ready twice!");
          if (!this._resolver) {
            throw new Error("Missing resolver");
          }
          this._resolver();
          this._isReady = true;
        });
      }
      async queryError(err) {
        await this._queue.runTask(() => {
          if (this._ready()) throw Error("can't claim query has an error after it worked!");
          this._stop({
            fromQueryError: true
          });
          throw err;
        });
      }
      async onFlush(cb) {
        await this._queue.queueTask(async () => {
          if (!this._ready()) throw Error("only call onFlush on a multiplexer that will be ready");
          await cb();
        });
      }
      callbackNames() {
        return this._ordered ? ["addedBefore", "changed", "movedBefore", "removed"] : ["added", "changed", "removed"];
      }
      _ready() {
        return !!this._isReady;
      }
      _applyCallback(callbackName, args) {
        this._queue.queueTask(async () => {
          if (!this._handles) return;
          await this._cache.applyChange[callbackName].apply(null, args);
          if (!this._ready() && callbackName !== 'added' && callbackName !== 'addedBefore') {
            throw new Error("Got ".concat(callbackName, " during initial adds"));
          }
          for (const handleId of Object.keys(this._handles)) {
            const handle = this._handles && this._handles[handleId];
            if (!handle) return;
            const callback = handle["_".concat(callbackName)];
            if (!callback) continue;
            handle.initialAddsSent.then(callback.apply(null, handle.nonMutatingCallbacks ? args : EJSON.clone(args)));
          }
        });
      }
      async _sendAdds(handle) {
        const add = this._ordered ? handle._addedBefore : handle._added;
        if (!add) return;
        const addPromises = [];
        this._cache.docs.forEach((doc, id) => {
          if (!(handle._id in this._handles)) {
            throw Error("handle got removed before sending initial adds!");
          }
          const _ref2 = handle.nonMutatingCallbacks ? doc : EJSON.clone(doc),
            {
              _id
            } = _ref2,
            fields = _objectWithoutProperties(_ref2, _excluded);
          const promise = this._ordered ? add(id, fields, null) : add(id, fields);
          addPromises.push(promise);
        });
        await Promise.all(addPromises);
        handle.initialAddsSentResolver();
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"doc_fetcher.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/doc_fetcher.js                                                                                       //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.export({
  DocFetcher: () => DocFetcher
});
class DocFetcher {
  constructor(mongoConnection) {
    this._mongoConnection = mongoConnection;
    // Map from op -> [callback]
    this._callbacksForOp = new Map();
  }

  // Fetches document "id" from collectionName, returning it or null if not
  // found.
  //
  // If you make multiple calls to fetch() with the same op reference,
  // DocFetcher may assume that they all return the same document. (It does
  // not check to see if collectionName/id match.)
  //
  // You may assume that callback is never called synchronously (and in fact
  // OplogObserveDriver does so).
  async fetch(collectionName, id, op, callback) {
    const self = this;
    check(collectionName, String);
    check(op, Object);

    // If there's already an in-progress fetch for this cache key, yield until
    // it's done and return whatever it returns.
    if (self._callbacksForOp.has(op)) {
      self._callbacksForOp.get(op).push(callback);
      return;
    }
    const callbacks = [callback];
    self._callbacksForOp.set(op, callbacks);
    try {
      var doc = (await self._mongoConnection.findOneAsync(collectionName, {
        _id: id
      })) || null;
      // Return doc to all relevant callbacks. Note that this array can
      // continue to grow during callback excecution.
      while (callbacks.length > 0) {
        // Clone the document so that the various calls to fetch don't return
        // objects that are intertwingled with each other. Clone before
        // popping the future, so that if clone throws, the error gets passed
        // to the next callback.
        callbacks.pop()(null, EJSON.clone(doc));
      }
    } catch (e) {
      while (callbacks.length > 0) {
        callbacks.pop()(e);
      }
    } finally {
      // XXX consider keeping the doc around for a period of time before
      // removing from the cache
      self._callbacksForOp.delete(op);
    }
  }
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"polling_observe_driver.ts":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/polling_observe_driver.ts                                                                            //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      PollingObserveDriver: () => PollingObserveDriver
    });
    let throttle;
    module.link("lodash.throttle", {
      default(v) {
        throttle = v;
      }
    }, 0);
    let listenAll;
    module.link("./mongo_driver", {
      listenAll(v) {
        listenAll = v;
      }
    }, 1);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    const POLLING_THROTTLE_MS = +(process.env.METEOR_POLLING_THROTTLE_MS || '') || 50;
    const POLLING_INTERVAL_MS = +(process.env.METEOR_POLLING_INTERVAL_MS || '') || 10 * 1000;
    /**
     * @class PollingObserveDriver
     *
     * One of two observe driver implementations.
     *
     * Characteristics:
     * - Caches the results of a query
     * - Reruns the query when necessary
     * - Suitable for cases where oplog tailing is not available or practical
     */
    class PollingObserveDriver {
      constructor(options) {
        this._options = void 0;
        this._cursorDescription = void 0;
        this._mongoHandle = void 0;
        this._ordered = void 0;
        this._multiplexer = void 0;
        this._stopCallbacks = void 0;
        this._stopped = void 0;
        this._cursor = void 0;
        this._results = void 0;
        this._pollsScheduledButNotStarted = void 0;
        this._pendingWrites = void 0;
        this._ensurePollIsScheduled = void 0;
        this._taskQueue = void 0;
        this._testOnlyPollCallback = void 0;
        this._options = options;
        this._cursorDescription = options.cursorDescription;
        this._mongoHandle = options.mongoHandle;
        this._ordered = options.ordered;
        this._multiplexer = options.multiplexer;
        this._stopCallbacks = [];
        this._stopped = false;
        this._cursor = this._mongoHandle._createAsynchronousCursor(this._cursorDescription);
        this._results = null;
        this._pollsScheduledButNotStarted = 0;
        this._pendingWrites = [];
        this._ensurePollIsScheduled = throttle(this._unthrottledEnsurePollIsScheduled.bind(this), this._cursorDescription.options.pollingThrottleMs || POLLING_THROTTLE_MS);
        this._taskQueue = new Meteor._AsynchronousQueue();
      }
      async _init() {
        var _Package$factsBase;
        const options = this._options;
        const listenersHandle = await listenAll(this._cursorDescription, notification => {
          const fence = DDPServer._getCurrentFence();
          if (fence) {
            this._pendingWrites.push(fence.beginWrite());
          }
          if (this._pollsScheduledButNotStarted === 0) {
            this._ensurePollIsScheduled();
          }
        });
        this._stopCallbacks.push(async () => {
          await listenersHandle.stop();
        });
        if (options._testOnlyPollCallback) {
          this._testOnlyPollCallback = options._testOnlyPollCallback;
        } else {
          const pollingInterval = this._cursorDescription.options.pollingIntervalMs || this._cursorDescription.options._pollingInterval || POLLING_INTERVAL_MS;
          const intervalHandle = Meteor.setInterval(this._ensurePollIsScheduled.bind(this), pollingInterval);
          this._stopCallbacks.push(() => {
            Meteor.clearInterval(intervalHandle);
          });
        }
        await this._unthrottledEnsurePollIsScheduled();
        (_Package$factsBase = Package['facts-base']) === null || _Package$factsBase === void 0 ? void 0 : _Package$factsBase.Facts.incrementServerFact("mongo-livedata", "observe-drivers-polling", 1);
      }
      async _unthrottledEnsurePollIsScheduled() {
        if (this._pollsScheduledButNotStarted > 0) return;
        ++this._pollsScheduledButNotStarted;
        await this._taskQueue.runTask(async () => {
          await this._pollMongo();
        });
      }
      _suspendPolling() {
        ++this._pollsScheduledButNotStarted;
        this._taskQueue.runTask(() => {});
        if (this._pollsScheduledButNotStarted !== 1) {
          throw new Error("_pollsScheduledButNotStarted is ".concat(this._pollsScheduledButNotStarted));
        }
      }
      async _resumePolling() {
        if (this._pollsScheduledButNotStarted !== 1) {
          throw new Error("_pollsScheduledButNotStarted is ".concat(this._pollsScheduledButNotStarted));
        }
        await this._taskQueue.runTask(async () => {
          await this._pollMongo();
        });
      }
      async _pollMongo() {
        var _this$_testOnlyPollCa;
        --this._pollsScheduledButNotStarted;
        if (this._stopped) return;
        let first = false;
        let newResults;
        let oldResults = this._results;
        if (!oldResults) {
          first = true;
          oldResults = this._ordered ? [] : new LocalCollection._IdMap();
        }
        (_this$_testOnlyPollCa = this._testOnlyPollCallback) === null || _this$_testOnlyPollCa === void 0 ? void 0 : _this$_testOnlyPollCa.call(this);
        const writesForCycle = this._pendingWrites;
        this._pendingWrites = [];
        try {
          newResults = await this._cursor.getRawObjects(this._ordered);
        } catch (e) {
          if (first && typeof e.code === 'number') {
            await this._multiplexer.queryError(new Error("Exception while polling query ".concat(JSON.stringify(this._cursorDescription), ": ").concat(e.message)));
          }
          Array.prototype.push.apply(this._pendingWrites, writesForCycle);
          Meteor._debug("Exception while polling query ".concat(JSON.stringify(this._cursorDescription)), e);
          return;
        }
        if (!this._stopped) {
          LocalCollection._diffQueryChanges(this._ordered, oldResults, newResults, this._multiplexer);
        }
        if (first) this._multiplexer.ready();
        this._results = newResults;
        await this._multiplexer.onFlush(async () => {
          for (const w of writesForCycle) {
            await w.committed();
          }
        });
      }
      async stop() {
        var _Package$factsBase2;
        this._stopped = true;
        for (const callback of this._stopCallbacks) {
          await callback();
        }
        for (const w of this._pendingWrites) {
          await w.committed();
        }
        (_Package$factsBase2 = Package['facts-base']) === null || _Package$factsBase2 === void 0 ? void 0 : _Package$factsBase2.Facts.incrementServerFact("mongo-livedata", "observe-drivers-polling", -1);
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"oplog_observe_driver.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/oplog_observe_driver.js                                                                              //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    let _asyncIterator;
    module.link("@babel/runtime/helpers/asyncIterator", {
      default(v) {
        _asyncIterator = v;
      }
    }, 0);
    module.export({
      OplogObserveDriver: () => OplogObserveDriver
    });
    let has;
    module.link("lodash.has", {
      default(v) {
        has = v;
      }
    }, 0);
    let isEmpty;
    module.link("lodash.isempty", {
      default(v) {
        isEmpty = v;
      }
    }, 1);
    let oplogV2V1Converter;
    module.link("./oplog_v2_converter", {
      oplogV2V1Converter(v) {
        oplogV2V1Converter = v;
      }
    }, 2);
    let check, Match;
    module.link("meteor/check", {
      check(v) {
        check = v;
      },
      Match(v) {
        Match = v;
      }
    }, 3);
    let CursorDescription;
    module.link("./cursor_description", {
      CursorDescription(v) {
        CursorDescription = v;
      }
    }, 4);
    let forEachTrigger, listenAll;
    module.link("./mongo_driver", {
      forEachTrigger(v) {
        forEachTrigger = v;
      },
      listenAll(v) {
        listenAll = v;
      }
    }, 5);
    let Cursor;
    module.link("./cursor", {
      Cursor(v) {
        Cursor = v;
      }
    }, 6);
    let LocalCollection;
    module.link("meteor/minimongo/local_collection", {
      default(v) {
        LocalCollection = v;
      }
    }, 7);
    let idForOp;
    module.link("./oplog_tailing", {
      idForOp(v) {
        idForOp = v;
      }
    }, 8);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    var PHASE = {
      QUERYING: "QUERYING",
      FETCHING: "FETCHING",
      STEADY: "STEADY"
    };

    // Exception thrown by _needToPollQuery which unrolls the stack up to the
    // enclosing call to finishIfNeedToPollQuery.
    var SwitchedToQuery = function () {};
    var finishIfNeedToPollQuery = function (f) {
      return function () {
        try {
          f.apply(this, arguments);
        } catch (e) {
          if (!(e instanceof SwitchedToQuery)) throw e;
        }
      };
    };
    var currentId = 0;

    /**
     * @class OplogObserveDriver
     * An alternative to PollingObserveDriver which follows the MongoDB operation log
     * instead of re-polling the query.
     *
     * Characteristics:
     * - Follows the MongoDB operation log
     * - Directly observes database changes
     * - More efficient than polling for most use cases
     * - Requires access to MongoDB oplog
     *
     * Interface:
     * - Construction initiates observeChanges callbacks and ready() invocation to the ObserveMultiplexer
     * - Observation can be terminated via the stop() method
     */
    const OplogObserveDriver = function (options) {
      const self = this;
      self._usesOplog = true; // tests look at this

      self._id = currentId;
      currentId++;
      self._cursorDescription = options.cursorDescription;
      self._mongoHandle = options.mongoHandle;
      self._multiplexer = options.multiplexer;
      if (options.ordered) {
        throw Error("OplogObserveDriver only supports unordered observeChanges");
      }
      const sorter = options.sorter;
      // We don't support $near and other geo-queries so it's OK to initialize the
      // comparator only once in the constructor.
      const comparator = sorter && sorter.getComparator();
      if (options.cursorDescription.options.limit) {
        // There are several properties ordered driver implements:
        // - _limit is a positive number
        // - _comparator is a function-comparator by which the query is ordered
        // - _unpublishedBuffer is non-null Min/Max Heap,
        //                      the empty buffer in STEADY phase implies that the
        //                      everything that matches the queries selector fits
        //                      into published set.
        // - _published - Max Heap (also implements IdMap methods)

        const heapOptions = {
          IdMap: LocalCollection._IdMap
        };
        self._limit = self._cursorDescription.options.limit;
        self._comparator = comparator;
        self._sorter = sorter;
        self._unpublishedBuffer = new MinMaxHeap(comparator, heapOptions);
        // We need something that can find Max value in addition to IdMap interface
        self._published = new MaxHeap(comparator, heapOptions);
      } else {
        self._limit = 0;
        self._comparator = null;
        self._sorter = null;
        self._unpublishedBuffer = null;
        // Memory Growth
        self._published = new LocalCollection._IdMap();
      }

      // Indicates if it is safe to insert a new document at the end of the buffer
      // for this query. i.e. it is known that there are no documents matching the
      // selector those are not in published or buffer.
      self._safeAppendToBuffer = false;
      self._stopped = false;
      self._stopHandles = [];
      self._addStopHandles = function (newStopHandles) {
        const expectedPattern = Match.ObjectIncluding({
          stop: Function
        });
        // Single item or array
        check(newStopHandles, Match.OneOf([expectedPattern], expectedPattern));
        self._stopHandles.push(newStopHandles);
      };
      Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "observe-drivers-oplog", 1);
      self._registerPhaseChange(PHASE.QUERYING);
      self._matcher = options.matcher;
      // we are now using projection, not fields in the cursor description even if you pass {fields}
      // in the cursor construction
      const projection = self._cursorDescription.options.fields || self._cursorDescription.options.projection || {};
      self._projectionFn = LocalCollection._compileProjection(projection);
      // Projection function, result of combining important fields for selector and
      // existing fields projection
      self._sharedProjection = self._matcher.combineIntoProjection(projection);
      if (sorter) self._sharedProjection = sorter.combineIntoProjection(self._sharedProjection);
      self._sharedProjectionFn = LocalCollection._compileProjection(self._sharedProjection);
      self._needToFetch = new LocalCollection._IdMap();
      self._currentlyFetching = null;
      self._fetchGeneration = 0;
      self._requeryWhenDoneThisQuery = false;
      self._writesToCommitWhenWeReachSteady = [];
    };
    Object.assign(OplogObserveDriver.prototype, {
      _init: async function () {
        const self = this;

        // If the oplog handle tells us that it skipped some entries (because it got
        // behind, say), re-poll.
        self._addStopHandles(self._mongoHandle._oplogHandle.onSkippedEntries(finishIfNeedToPollQuery(function () {
          return self._needToPollQuery();
        })));
        await forEachTrigger(self._cursorDescription, async function (trigger) {
          self._addStopHandles(await self._mongoHandle._oplogHandle.onOplogEntry(trigger, function (notification) {
            finishIfNeedToPollQuery(function () {
              const op = notification.op;
              if (notification.dropCollection || notification.dropDatabase) {
                // Note: this call is not allowed to block on anything (especially
                // on waiting for oplog entries to catch up) because that will block
                // onOplogEntry!
                return self._needToPollQuery();
              } else {
                // All other operators should be handled depending on phase
                if (self._phase === PHASE.QUERYING) {
                  return self._handleOplogEntryQuerying(op);
                } else {
                  return self._handleOplogEntrySteadyOrFetching(op);
                }
              }
            })();
          }));
        });

        // XXX ordering w.r.t. everything else?
        self._addStopHandles(await listenAll(self._cursorDescription, function () {
          // If we're not in a pre-fire write fence, we don't have to do anything.
          const fence = DDPServer._getCurrentFence();
          if (!fence || fence.fired) return;
          if (fence._oplogObserveDrivers) {
            fence._oplogObserveDrivers[self._id] = self;
            return;
          }
          fence._oplogObserveDrivers = {};
          fence._oplogObserveDrivers[self._id] = self;
          fence.onBeforeFire(async function () {
            const drivers = fence._oplogObserveDrivers;
            delete fence._oplogObserveDrivers;

            // This fence cannot fire until we've caught up to "this point" in the
            // oplog, and all observers made it back to the steady state.
            await self._mongoHandle._oplogHandle.waitUntilCaughtUp();
            for (const driver of Object.values(drivers)) {
              if (driver._stopped) continue;
              const write = await fence.beginWrite();
              if (driver._phase === PHASE.STEADY) {
                // Make sure that all of the callbacks have made it through the
                // multiplexer and been delivered to ObserveHandles before committing
                // writes.
                await driver._multiplexer.onFlush(write.committed);
              } else {
                driver._writesToCommitWhenWeReachSteady.push(write);
              }
            }
          });
        }));

        // When Mongo fails over, we need to repoll the query, in case we processed an
        // oplog entry that got rolled back.
        self._addStopHandles(self._mongoHandle._onFailover(finishIfNeedToPollQuery(function () {
          return self._needToPollQuery();
        })));

        // Give _observeChanges a chance to add the new ObserveHandle to our
        // multiplexer, so that the added calls get streamed.
        return self._runInitialQuery();
      },
      _addPublished: function (id, doc) {
        var self = this;
        Meteor._noYieldsAllowed(function () {
          var fields = Object.assign({}, doc);
          delete fields._id;
          self._published.set(id, self._sharedProjectionFn(doc));
          self._multiplexer.added(id, self._projectionFn(fields));

          // After adding this document, the published set might be overflowed
          // (exceeding capacity specified by limit). If so, push the maximum
          // element to the buffer, we might want to save it in memory to reduce the
          // amount of Mongo lookups in the future.
          if (self._limit && self._published.size() > self._limit) {
            // XXX in theory the size of published is no more than limit+1
            if (self._published.size() !== self._limit + 1) {
              throw new Error("After adding to published, " + (self._published.size() - self._limit) + " documents are overflowing the set");
            }
            var overflowingDocId = self._published.maxElementId();
            var overflowingDoc = self._published.get(overflowingDocId);
            if (EJSON.equals(overflowingDocId, id)) {
              throw new Error("The document just added is overflowing the published set");
            }
            self._published.remove(overflowingDocId);
            self._multiplexer.removed(overflowingDocId);
            self._addBuffered(overflowingDocId, overflowingDoc);
          }
        });
      },
      _removePublished: function (id) {
        var self = this;
        Meteor._noYieldsAllowed(function () {
          self._published.remove(id);
          self._multiplexer.removed(id);
          if (!self._limit || self._published.size() === self._limit) return;
          if (self._published.size() > self._limit) throw Error("self._published got too big");

          // OK, we are publishing less than the limit. Maybe we should look in the
          // buffer to find the next element past what we were publishing before.

          if (!self._unpublishedBuffer.empty()) {
            // There's something in the buffer; move the first thing in it to
            // _published.
            var newDocId = self._unpublishedBuffer.minElementId();
            var newDoc = self._unpublishedBuffer.get(newDocId);
            self._removeBuffered(newDocId);
            self._addPublished(newDocId, newDoc);
            return;
          }

          // There's nothing in the buffer.  This could mean one of a few things.

          // (a) We could be in the middle of re-running the query (specifically, we
          // could be in _publishNewResults). In that case, _unpublishedBuffer is
          // empty because we clear it at the beginning of _publishNewResults. In
          // this case, our caller already knows the entire answer to the query and
          // we don't need to do anything fancy here.  Just return.
          if (self._phase === PHASE.QUERYING) return;

          // (b) We're pretty confident that the union of _published and
          // _unpublishedBuffer contain all documents that match selector. Because
          // _unpublishedBuffer is empty, that means we're confident that _published
          // contains all documents that match selector. So we have nothing to do.
          if (self._safeAppendToBuffer) return;

          // (c) Maybe there are other documents out there that should be in our
          // buffer. But in that case, when we emptied _unpublishedBuffer in
          // _removeBuffered, we should have called _needToPollQuery, which will
          // either put something in _unpublishedBuffer or set _safeAppendToBuffer
          // (or both), and it will put us in QUERYING for that whole time. So in
          // fact, we shouldn't be able to get here.

          throw new Error("Buffer inexplicably empty");
        });
      },
      _changePublished: function (id, oldDoc, newDoc) {
        var self = this;
        Meteor._noYieldsAllowed(function () {
          self._published.set(id, self._sharedProjectionFn(newDoc));
          var projectedNew = self._projectionFn(newDoc);
          var projectedOld = self._projectionFn(oldDoc);
          var changed = DiffSequence.makeChangedFields(projectedNew, projectedOld);
          if (!isEmpty(changed)) self._multiplexer.changed(id, changed);
        });
      },
      _addBuffered: function (id, doc) {
        var self = this;
        Meteor._noYieldsAllowed(function () {
          self._unpublishedBuffer.set(id, self._sharedProjectionFn(doc));

          // If something is overflowing the buffer, we just remove it from cache
          if (self._unpublishedBuffer.size() > self._limit) {
            var maxBufferedId = self._unpublishedBuffer.maxElementId();
            self._unpublishedBuffer.remove(maxBufferedId);

            // Since something matching is removed from cache (both published set and
            // buffer), set flag to false
            self._safeAppendToBuffer = false;
          }
        });
      },
      // Is called either to remove the doc completely from matching set or to move
      // it to the published set later.
      _removeBuffered: function (id) {
        var self = this;
        Meteor._noYieldsAllowed(function () {
          self._unpublishedBuffer.remove(id);
          // To keep the contract "buffer is never empty in STEADY phase unless the
          // everything matching fits into published" true, we poll everything as
          // soon as we see the buffer becoming empty.
          if (!self._unpublishedBuffer.size() && !self._safeAppendToBuffer) self._needToPollQuery();
        });
      },
      // Called when a document has joined the "Matching" results set.
      // Takes responsibility of keeping _unpublishedBuffer in sync with _published
      // and the effect of limit enforced.
      _addMatching: function (doc) {
        var self = this;
        Meteor._noYieldsAllowed(function () {
          var id = doc._id;
          if (self._published.has(id)) throw Error("tried to add something already published " + id);
          if (self._limit && self._unpublishedBuffer.has(id)) throw Error("tried to add something already existed in buffer " + id);
          var limit = self._limit;
          var comparator = self._comparator;
          var maxPublished = limit && self._published.size() > 0 ? self._published.get(self._published.maxElementId()) : null;
          var maxBuffered = limit && self._unpublishedBuffer.size() > 0 ? self._unpublishedBuffer.get(self._unpublishedBuffer.maxElementId()) : null;
          // The query is unlimited or didn't publish enough documents yet or the
          // new document would fit into published set pushing the maximum element
          // out, then we need to publish the doc.
          var toPublish = !limit || self._published.size() < limit || comparator(doc, maxPublished) < 0;

          // Otherwise we might need to buffer it (only in case of limited query).
          // Buffering is allowed if the buffer is not filled up yet and all
          // matching docs are either in the published set or in the buffer.
          var canAppendToBuffer = !toPublish && self._safeAppendToBuffer && self._unpublishedBuffer.size() < limit;

          // Or if it is small enough to be safely inserted to the middle or the
          // beginning of the buffer.
          var canInsertIntoBuffer = !toPublish && maxBuffered && comparator(doc, maxBuffered) <= 0;
          var toBuffer = canAppendToBuffer || canInsertIntoBuffer;
          if (toPublish) {
            self._addPublished(id, doc);
          } else if (toBuffer) {
            self._addBuffered(id, doc);
          } else {
            // dropping it and not saving to the cache
            self._safeAppendToBuffer = false;
          }
        });
      },
      // Called when a document leaves the "Matching" results set.
      // Takes responsibility of keeping _unpublishedBuffer in sync with _published
      // and the effect of limit enforced.
      _removeMatching: function (id) {
        var self = this;
        Meteor._noYieldsAllowed(function () {
          if (!self._published.has(id) && !self._limit) throw Error("tried to remove something matching but not cached " + id);
          if (self._published.has(id)) {
            self._removePublished(id);
          } else if (self._unpublishedBuffer.has(id)) {
            self._removeBuffered(id);
          }
        });
      },
      _handleDoc: function (id, newDoc) {
        var self = this;
        Meteor._noYieldsAllowed(function () {
          var matchesNow = newDoc && self._matcher.documentMatches(newDoc).result;
          var publishedBefore = self._published.has(id);
          var bufferedBefore = self._limit && self._unpublishedBuffer.has(id);
          var cachedBefore = publishedBefore || bufferedBefore;
          if (matchesNow && !cachedBefore) {
            self._addMatching(newDoc);
          } else if (cachedBefore && !matchesNow) {
            self._removeMatching(id);
          } else if (cachedBefore && matchesNow) {
            var oldDoc = self._published.get(id);
            var comparator = self._comparator;
            var minBuffered = self._limit && self._unpublishedBuffer.size() && self._unpublishedBuffer.get(self._unpublishedBuffer.minElementId());
            var maxBuffered;
            if (publishedBefore) {
              // Unlimited case where the document stays in published once it
              // matches or the case when we don't have enough matching docs to
              // publish or the changed but matching doc will stay in published
              // anyways.
              //
              // XXX: We rely on the emptiness of buffer. Be sure to maintain the
              // fact that buffer can't be empty if there are matching documents not
              // published. Notably, we don't want to schedule repoll and continue
              // relying on this property.
              var staysInPublished = !self._limit || self._unpublishedBuffer.size() === 0 || comparator(newDoc, minBuffered) <= 0;
              if (staysInPublished) {
                self._changePublished(id, oldDoc, newDoc);
              } else {
                // after the change doc doesn't stay in the published, remove it
                self._removePublished(id);
                // but it can move into buffered now, check it
                maxBuffered = self._unpublishedBuffer.get(self._unpublishedBuffer.maxElementId());
                var toBuffer = self._safeAppendToBuffer || maxBuffered && comparator(newDoc, maxBuffered) <= 0;
                if (toBuffer) {
                  self._addBuffered(id, newDoc);
                } else {
                  // Throw away from both published set and buffer
                  self._safeAppendToBuffer = false;
                }
              }
            } else if (bufferedBefore) {
              oldDoc = self._unpublishedBuffer.get(id);
              // remove the old version manually instead of using _removeBuffered so
              // we don't trigger the querying immediately.  if we end this block
              // with the buffer empty, we will need to trigger the query poll
              // manually too.
              self._unpublishedBuffer.remove(id);
              var maxPublished = self._published.get(self._published.maxElementId());
              maxBuffered = self._unpublishedBuffer.size() && self._unpublishedBuffer.get(self._unpublishedBuffer.maxElementId());

              // the buffered doc was updated, it could move to published
              var toPublish = comparator(newDoc, maxPublished) < 0;

              // or stays in buffer even after the change
              var staysInBuffer = !toPublish && self._safeAppendToBuffer || !toPublish && maxBuffered && comparator(newDoc, maxBuffered) <= 0;
              if (toPublish) {
                self._addPublished(id, newDoc);
              } else if (staysInBuffer) {
                // stays in buffer but changes
                self._unpublishedBuffer.set(id, newDoc);
              } else {
                // Throw away from both published set and buffer
                self._safeAppendToBuffer = false;
                // Normally this check would have been done in _removeBuffered but
                // we didn't use it, so we need to do it ourself now.
                if (!self._unpublishedBuffer.size()) {
                  self._needToPollQuery();
                }
              }
            } else {
              throw new Error("cachedBefore implies either of publishedBefore or bufferedBefore is true.");
            }
          }
        });
      },
      _fetchModifiedDocuments: function () {
        var self = this;
        self._registerPhaseChange(PHASE.FETCHING);
        // Defer, because nothing called from the oplog entry handler may yield,
        // but fetch() yields.
        Meteor.defer(finishIfNeedToPollQuery(async function () {
          while (!self._stopped && !self._needToFetch.empty()) {
            if (self._phase === PHASE.QUERYING) {
              // While fetching, we decided to go into QUERYING mode, and then we
              // saw another oplog entry, so _needToFetch is not empty. But we
              // shouldn't fetch these documents until AFTER the query is done.
              break;
            }

            // Being in steady phase here would be surprising.
            if (self._phase !== PHASE.FETCHING) throw new Error("phase in fetchModifiedDocuments: " + self._phase);
            self._currentlyFetching = self._needToFetch;
            var thisGeneration = ++self._fetchGeneration;
            self._needToFetch = new LocalCollection._IdMap();

            // Create an array of promises for all the fetch operations
            const fetchPromises = [];
            self._currentlyFetching.forEach(function (op, id) {
              const fetchPromise = new Promise((resolve, reject) => {
                self._mongoHandle._docFetcher.fetch(self._cursorDescription.collectionName, id, op, finishIfNeedToPollQuery(function (err, doc) {
                  if (err) {
                    Meteor._debug('Got exception while fetching documents', err);
                    // If we get an error from the fetcher (eg, trouble
                    // connecting to Mongo), let's just abandon the fetch phase
                    // altogether and fall back to polling. It's not like we're
                    // getting live updates anyway.
                    if (self._phase !== PHASE.QUERYING) {
                      self._needToPollQuery();
                    }
                    resolve();
                    return;
                  }
                  if (!self._stopped && self._phase === PHASE.FETCHING && self._fetchGeneration === thisGeneration) {
                    // We re-check the generation in case we've had an explicit
                    // _pollQuery call (eg, in another fiber) which should
                    // effectively cancel this round of fetches.  (_pollQuery
                    // increments the generation.)
                    try {
                      self._handleDoc(id, doc);
                      resolve();
                    } catch (err) {
                      reject(err);
                    }
                  } else {
                    resolve();
                  }
                }));
              });
              fetchPromises.push(fetchPromise);
            });
            // Wait for all fetch operations to complete
            try {
              const results = await Promise.allSettled(fetchPromises);
              const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
              if (errors.length > 0) {
                Meteor._debug('Some fetch queries failed:', errors);
              }
            } catch (err) {
              Meteor._debug('Got an exception in a fetch query', err);
            }
            // Exit now if we've had a _pollQuery call (here or in another fiber).
            if (self._phase === PHASE.QUERYING) return;
            self._currentlyFetching = null;
          }
          // We're done fetching, so we can be steady, unless we've had a
          // _pollQuery call (here or in another fiber).
          if (self._phase !== PHASE.QUERYING) await self._beSteady();
        }));
      },
      _beSteady: async function () {
        var self = this;
        self._registerPhaseChange(PHASE.STEADY);
        var writes = self._writesToCommitWhenWeReachSteady || [];
        self._writesToCommitWhenWeReachSteady = [];
        await self._multiplexer.onFlush(async function () {
          try {
            for (const w of writes) {
              await w.committed();
            }
          } catch (e) {
            console.error("_beSteady error", {
              writes
            }, e);
          }
        });
      },
      _handleOplogEntryQuerying: function (op) {
        var self = this;
        Meteor._noYieldsAllowed(function () {
          self._needToFetch.set(idForOp(op), op);
        });
      },
      _handleOplogEntrySteadyOrFetching: function (op) {
        var self = this;
        Meteor._noYieldsAllowed(function () {
          var id = idForOp(op);
          // If we're already fetching this one, or about to, we can't optimize;
          // make sure that we fetch it again if necessary.

          if (self._phase === PHASE.FETCHING && (self._currentlyFetching && self._currentlyFetching.has(id) || self._needToFetch.has(id))) {
            self._needToFetch.set(id, op);
            return;
          }
          if (op.op === 'd') {
            if (self._published.has(id) || self._limit && self._unpublishedBuffer.has(id)) self._removeMatching(id);
          } else if (op.op === 'i') {
            if (self._published.has(id)) throw new Error("insert found for already-existing ID in published");
            if (self._unpublishedBuffer && self._unpublishedBuffer.has(id)) throw new Error("insert found for already-existing ID in buffer");

            // XXX what if selector yields?  for now it can't but later it could
            // have $where
            if (self._matcher.documentMatches(op.o).result) self._addMatching(op.o);
          } else if (op.op === 'u') {
            // we are mapping the new oplog format on mongo 5
            // to what we know better, $set
            op.o = oplogV2V1Converter(op.o);
            // Is this a modifier ($set/$unset, which may require us to poll the
            // database to figure out if the whole document matches the selector) or
            // a replacement (in which case we can just directly re-evaluate the
            // selector)?
            // oplog format has changed on mongodb 5, we have to support both now
            // diff is the format in Mongo 5+ (oplog v2)
            var isReplace = !has(op.o, '$set') && !has(op.o, 'diff') && !has(op.o, '$unset');
            // If this modifier modifies something inside an EJSON custom type (ie,
            // anything with EJSON$), then we can't try to use
            // LocalCollection._modify, since that just mutates the EJSON encoding,
            // not the actual object.
            var canDirectlyModifyDoc = !isReplace && modifierCanBeDirectlyApplied(op.o);
            var publishedBefore = self._published.has(id);
            var bufferedBefore = self._limit && self._unpublishedBuffer.has(id);
            if (isReplace) {
              self._handleDoc(id, Object.assign({
                _id: id
              }, op.o));
            } else if ((publishedBefore || bufferedBefore) && canDirectlyModifyDoc) {
              // Oh great, we actually know what the document is, so we can apply
              // this directly.
              var newDoc = self._published.has(id) ? self._published.get(id) : self._unpublishedBuffer.get(id);
              newDoc = EJSON.clone(newDoc);
              newDoc._id = id;
              try {
                LocalCollection._modify(newDoc, op.o);
              } catch (e) {
                if (e.name !== "MinimongoError") throw e;
                // We didn't understand the modifier.  Re-fetch.
                self._needToFetch.set(id, op);
                if (self._phase === PHASE.STEADY) {
                  self._fetchModifiedDocuments();
                }
                return;
              }
              self._handleDoc(id, self._sharedProjectionFn(newDoc));
            } else if (!canDirectlyModifyDoc || self._matcher.canBecomeTrueByModifier(op.o) || self._sorter && self._sorter.affectedByModifier(op.o)) {
              self._needToFetch.set(id, op);
              if (self._phase === PHASE.STEADY) self._fetchModifiedDocuments();
            }
          } else {
            throw Error("XXX SURPRISING OPERATION: " + op);
          }
        });
      },
      async _runInitialQueryAsync() {
        var self = this;
        if (self._stopped) throw new Error("oplog stopped surprisingly early");
        await self._runQuery({
          initial: true
        }); // yields

        if (self._stopped) return; // can happen on queryError

        // Allow observeChanges calls to return. (After this, it's possible for
        // stop() to be called.)
        await self._multiplexer.ready();
        await self._doneQuerying(); // yields
      },
      // Yields!
      _runInitialQuery: function () {
        return this._runInitialQueryAsync();
      },
      // In various circumstances, we may just want to stop processing the oplog and
      // re-run the initial query, just as if we were a PollingObserveDriver.
      //
      // This function may not block, because it is called from an oplog entry
      // handler.
      //
      // XXX We should call this when we detect that we've been in FETCHING for "too
      // long".
      //
      // XXX We should call this when we detect Mongo failover (since that might
      // mean that some of the oplog entries we have processed have been rolled
      // back). The Node Mongo driver is in the middle of a bunch of huge
      // refactorings, including the way that it notifies you when primary
      // changes. Will put off implementing this until driver 1.4 is out.
      _pollQuery: function () {
        var self = this;
        Meteor._noYieldsAllowed(function () {
          if (self._stopped) return;

          // Yay, we get to forget about all the things we thought we had to fetch.
          self._needToFetch = new LocalCollection._IdMap();
          self._currentlyFetching = null;
          ++self._fetchGeneration; // ignore any in-flight fetches
          self._registerPhaseChange(PHASE.QUERYING);

          // Defer so that we don't yield.  We don't need finishIfNeedToPollQuery
          // here because SwitchedToQuery is not thrown in QUERYING mode.
          Meteor.defer(async function () {
            await self._runQuery();
            await self._doneQuerying();
          });
        });
      },
      // Yields!
      async _runQueryAsync(options) {
        var self = this;
        options = options || {};
        var newResults, newBuffer;

        // This while loop is just to retry failures.
        while (true) {
          // If we've been stopped, we don't have to run anything any more.
          if (self._stopped) return;
          newResults = new LocalCollection._IdMap();
          newBuffer = new LocalCollection._IdMap();

          // Query 2x documents as the half excluded from the original query will go
          // into unpublished buffer to reduce additional Mongo lookups in cases
          // when documents are removed from the published set and need a
          // replacement.
          // XXX needs more thought on non-zero skip
          // XXX 2 is a "magic number" meaning there is an extra chunk of docs for
          // buffer if such is needed.
          var cursor = self._cursorForQuery({
            limit: self._limit * 2
          });
          try {
            await cursor.forEach(function (doc, i) {
              // yields
              if (!self._limit || i < self._limit) {
                newResults.set(doc._id, doc);
              } else {
                newBuffer.set(doc._id, doc);
              }
            });
            break;
          } catch (e) {
            if (options.initial && typeof e.code === 'number') {
              // This is an error document sent to us by mongod, not a connection
              // error generated by the client. And we've never seen this query work
              // successfully. Probably it's a bad selector or something, so we
              // should NOT retry. Instead, we should halt the observe (which ends
              // up calling `stop` on us).
              await self._multiplexer.queryError(e);
              return;
            }

            // During failover (eg) if we get an exception we should log and retry
            // instead of crashing.
            Meteor._debug("Got exception while polling query", e);
            await Meteor._sleepForMs(100);
          }
        }
        if (self._stopped) return;
        self._publishNewResults(newResults, newBuffer);
      },
      // Yields!
      _runQuery: function (options) {
        return this._runQueryAsync(options);
      },
      // Transitions to QUERYING and runs another query, or (if already in QUERYING)
      // ensures that we will query again later.
      //
      // This function may not block, because it is called from an oplog entry
      // handler. However, if we were not already in the QUERYING phase, it throws
      // an exception that is caught by the closest surrounding
      // finishIfNeedToPollQuery call; this ensures that we don't continue running
      // close that was designed for another phase inside PHASE.QUERYING.
      //
      // (It's also necessary whenever logic in this file yields to check that other
      // phases haven't put us into QUERYING mode, though; eg,
      // _fetchModifiedDocuments does this.)
      _needToPollQuery: function () {
        var self = this;
        Meteor._noYieldsAllowed(function () {
          if (self._stopped) return;

          // If we're not already in the middle of a query, we can query now
          // (possibly pausing FETCHING).
          if (self._phase !== PHASE.QUERYING) {
            self._pollQuery();
            throw new SwitchedToQuery();
          }

          // We're currently in QUERYING. Set a flag to ensure that we run another
          // query when we're done.
          self._requeryWhenDoneThisQuery = true;
        });
      },
      // Yields!
      _doneQuerying: async function () {
        var self = this;
        if (self._stopped) return;
        await self._mongoHandle._oplogHandle.waitUntilCaughtUp();
        if (self._stopped) return;
        if (self._phase !== PHASE.QUERYING) throw Error("Phase unexpectedly " + self._phase);
        if (self._requeryWhenDoneThisQuery) {
          self._requeryWhenDoneThisQuery = false;
          self._pollQuery();
        } else if (self._needToFetch.empty()) {
          await self._beSteady();
        } else {
          self._fetchModifiedDocuments();
        }
      },
      _cursorForQuery: function (optionsOverwrite) {
        var self = this;
        return Meteor._noYieldsAllowed(function () {
          // The query we run is almost the same as the cursor we are observing,
          // with a few changes. We need to read all the fields that are relevant to
          // the selector, not just the fields we are going to publish (that's the
          // "shared" projection). And we don't want to apply any transform in the
          // cursor, because observeChanges shouldn't use the transform.
          var options = Object.assign({}, self._cursorDescription.options);

          // Allow the caller to modify the options. Useful to specify different
          // skip and limit values.
          Object.assign(options, optionsOverwrite);
          options.fields = self._sharedProjection;
          delete options.transform;
          // We are NOT deep cloning fields or selector here, which should be OK.
          var description = new CursorDescription(self._cursorDescription.collectionName, self._cursorDescription.selector, options);
          return new Cursor(self._mongoHandle, description);
        });
      },
      // Replace self._published with newResults (both are IdMaps), invoking observe
      // callbacks on the multiplexer.
      // Replace self._unpublishedBuffer with newBuffer.
      //
      // XXX This is very similar to LocalCollection._diffQueryUnorderedChanges. We
      // should really: (a) Unify IdMap and OrderedDict into Unordered/OrderedDict
      // (b) Rewrite diff.js to use these classes instead of arrays and objects.
      _publishNewResults: function (newResults, newBuffer) {
        var self = this;
        Meteor._noYieldsAllowed(function () {
          // If the query is limited and there is a buffer, shut down so it doesn't
          // stay in a way.
          if (self._limit) {
            self._unpublishedBuffer.clear();
          }

          // First remove anything that's gone. Be careful not to modify
          // self._published while iterating over it.
          var idsToRemove = [];
          self._published.forEach(function (doc, id) {
            if (!newResults.has(id)) idsToRemove.push(id);
          });
          idsToRemove.forEach(function (id) {
            self._removePublished(id);
          });

          // Now do adds and changes.
          // If self has a buffer and limit, the new fetched result will be
          // limited correctly as the query has sort specifier.
          newResults.forEach(function (doc, id) {
            self._handleDoc(id, doc);
          });

          // Sanity-check that everything we tried to put into _published ended up
          // there.
          // XXX if this is slow, remove it later
          if (self._published.size() !== newResults.size()) {
            Meteor._debug('The Mongo server and the Meteor query disagree on how ' + 'many documents match your query. Cursor description: ', self._cursorDescription);
          }
          self._published.forEach(function (doc, id) {
            if (!newResults.has(id)) throw Error("_published has a doc that newResults doesn't; " + id);
          });

          // Finally, replace the buffer
          newBuffer.forEach(function (doc, id) {
            self._addBuffered(id, doc);
          });
          self._safeAppendToBuffer = newBuffer.size() < self._limit;
        });
      },
      // This stop function is invoked from the onStop of the ObserveMultiplexer, so
      // it shouldn't actually be possible to call it until the multiplexer is
      // ready.
      //
      // It's important to check self._stopped after every call in this file that
      // can yield!
      _stop: async function () {
        var self = this;
        if (self._stopped) return;
        self._stopped = true;

        // Note: we *don't* use multiplexer.onFlush here because this stop
        // callback is actually invoked by the multiplexer itself when it has
        // determined that there are no handles left. So nothing is actually going
        // to get flushed (and it's probably not valid to call methods on the
        // dying multiplexer).
        for (const w of self._writesToCommitWhenWeReachSteady) {
          await w.committed();
        }
        self._writesToCommitWhenWeReachSteady = null;

        // Proactively drop references to potentially big things.
        self._published = null;
        self._unpublishedBuffer = null;
        self._needToFetch = null;
        self._currentlyFetching = null;
        self._oplogEntryHandle = null;
        self._listenersHandle = null;
        Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "observe-drivers-oplog", -1);
        var _iteratorAbruptCompletion = false;
        var _didIteratorError = false;
        var _iteratorError;
        try {
          for (var _iterator = _asyncIterator(self._stopHandles), _step; _iteratorAbruptCompletion = !(_step = await _iterator.next()).done; _iteratorAbruptCompletion = false) {
            const handle = _step.value;
            {
              await handle.stop();
            }
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (_iteratorAbruptCompletion && _iterator.return != null) {
              await _iterator.return();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
        }
      },
      stop: async function () {
        const self = this;
        return await self._stop();
      },
      _registerPhaseChange: function (phase) {
        var self = this;
        Meteor._noYieldsAllowed(function () {
          var now = new Date();
          if (self._phase) {
            var timeDiff = now - self._phaseStartTime;
            Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "time-spent-in-" + self._phase + "-phase", timeDiff);
          }
          self._phase = phase;
          self._phaseStartTime = now;
        });
      }
    });

    // Does our oplog tailing code support this cursor? For now, we are being very
    // conservative and allowing only simple queries with simple options.
    // (This is a "static method".)
    OplogObserveDriver.cursorSupported = function (cursorDescription, matcher) {
      // First, check the options.
      var options = cursorDescription.options;

      // Did the user say no explicitly?
      // underscored version of the option is COMPAT with 1.2
      if (options.disableOplog || options._disableOplog) return false;

      // skip is not supported: to support it we would need to keep track of all
      // "skipped" documents or at least their ids.
      // limit w/o a sort specifier is not supported: current implementation needs a
      // deterministic way to order documents.
      if (options.skip || options.limit && !options.sort) return false;

      // If a fields projection option is given check if it is supported by
      // minimongo (some operators are not supported).
      const fields = options.fields || options.projection;
      if (fields) {
        try {
          LocalCollection._checkSupportedProjection(fields);
        } catch (e) {
          if (e.name === "MinimongoError") {
            return false;
          } else {
            throw e;
          }
        }
      }

      // We don't allow the following selectors:
      //   - $where (not confident that we provide the same JS environment
      //             as Mongo, and can yield!)
      //   - $near (has "interesting" properties in MongoDB, like the possibility
      //            of returning an ID multiple times, though even polling maybe
      //            have a bug there)
      //           XXX: once we support it, we would need to think more on how we
      //           initialize the comparators when we create the driver.
      return !matcher.hasWhere() && !matcher.hasGeoQuery();
    };
    var modifierCanBeDirectlyApplied = function (modifier) {
      return Object.entries(modifier).every(function (_ref) {
        let [operation, fields] = _ref;
        return Object.entries(fields).every(function (_ref2) {
          let [field, value] = _ref2;
          return !/EJSON\$/.test(field);
        });
      });
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"oplog_v2_converter.ts":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/oplog_v2_converter.ts                                                                                //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
!module.wrapAsync(async function (module1, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module1.export({
      oplogV2V1Converter: () => oplogV2V1Converter
    });
    let EJSON;
    module1.link("meteor/ejson", {
      EJSON(v) {
        EJSON = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    const arrayOperatorKeyRegex = /^(a|[su]\d+)$/;
    /**
     * Checks if a field is an array operator key of form 'a' or 's1' or 'u1' etc
     */
    function isArrayOperatorKey(field) {
      return arrayOperatorKeyRegex.test(field);
    }
    /**
     * Type guard to check if an operator is a valid array operator.
     * Array operators have 'a: true' and keys that match the arrayOperatorKeyRegex
     */
    function isArrayOperator(operator) {
      return operator !== null && typeof operator === 'object' && 'a' in operator && operator.a === true && Object.keys(operator).every(isArrayOperatorKey);
    }
    /**
     * Joins two parts of a field path with a dot.
     * Returns the key itself if prefix is empty.
     */
    function join(prefix, key) {
      return prefix ? "".concat(prefix, ".").concat(key) : key;
    }
    /**
     * Recursively flattens an object into a target object with dot notation paths.
     * Handles special cases:
     * - Arrays are assigned directly
     * - Custom EJSON types are preserved
     * - Mongo.ObjectIDs are preserved
     * - Plain objects are recursively flattened
     * - Empty objects are assigned directly
     */
    function flattenObjectInto(target, source, prefix) {
      if (Array.isArray(source) || typeof source !== 'object' || source === null || source instanceof Mongo.ObjectID || EJSON._isCustomType(source)) {
        target[prefix] = source;
        return;
      }
      const entries = Object.entries(source);
      if (entries.length) {
        entries.forEach(_ref => {
          let [key, value] = _ref;
          flattenObjectInto(target, value, join(prefix, key));
        });
      } else {
        target[prefix] = source;
      }
    }
    /**
     * Converts an oplog diff to a series of $set and $unset operations.
     * Handles several types of operations:
     * - Direct unsets via 'd' field
     * - Nested sets via 'i' field
     * - Top-level sets via 'u' field
     * - Array operations and nested objects via 's' prefixed fields
     *
     * Preserves the structure of EJSON custom types and ObjectIDs while
     * flattening paths into dot notation for MongoDB updates.
     */
    function convertOplogDiff(oplogEntry, diff) {
      let prefix = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : '';
      Object.entries(diff).forEach(_ref2 => {
        let [diffKey, value] = _ref2;
        if (diffKey === 'd') {
          var _oplogEntry$$unset;
          // Handle `$unset`s
          (_oplogEntry$$unset = oplogEntry.$unset) !== null && _oplogEntry$$unset !== void 0 ? _oplogEntry$$unset : oplogEntry.$unset = {};
          Object.keys(value).forEach(key => {
            oplogEntry.$unset[join(prefix, key)] = true;
          });
        } else if (diffKey === 'i') {
          var _oplogEntry$$set;
          // Handle (potentially) nested `$set`s
          (_oplogEntry$$set = oplogEntry.$set) !== null && _oplogEntry$$set !== void 0 ? _oplogEntry$$set : oplogEntry.$set = {};
          flattenObjectInto(oplogEntry.$set, value, prefix);
        } else if (diffKey === 'u') {
          var _oplogEntry$$set2;
          // Handle flat `$set`s
          (_oplogEntry$$set2 = oplogEntry.$set) !== null && _oplogEntry$$set2 !== void 0 ? _oplogEntry$$set2 : oplogEntry.$set = {};
          Object.entries(value).forEach(_ref3 => {
            let [key, fieldValue] = _ref3;
            oplogEntry.$set[join(prefix, key)] = fieldValue;
          });
        } else if (diffKey.startsWith('s')) {
          // Handle s-fields (array operations and nested objects)
          const key = diffKey.slice(1);
          if (isArrayOperator(value)) {
            // Array operator
            Object.entries(value).forEach(_ref4 => {
              let [position, fieldValue] = _ref4;
              if (position === 'a') return;
              const positionKey = join(prefix, "".concat(key, ".").concat(position.slice(1)));
              if (position[0] === 's') {
                convertOplogDiff(oplogEntry, fieldValue, positionKey);
              } else if (fieldValue === null) {
                var _oplogEntry$$unset2;
                (_oplogEntry$$unset2 = oplogEntry.$unset) !== null && _oplogEntry$$unset2 !== void 0 ? _oplogEntry$$unset2 : oplogEntry.$unset = {};
                oplogEntry.$unset[positionKey] = true;
              } else {
                var _oplogEntry$$set3;
                (_oplogEntry$$set3 = oplogEntry.$set) !== null && _oplogEntry$$set3 !== void 0 ? _oplogEntry$$set3 : oplogEntry.$set = {};
                oplogEntry.$set[positionKey] = fieldValue;
              }
            });
          } else if (key) {
            // Nested object
            convertOplogDiff(oplogEntry, value, join(prefix, key));
          }
        }
      });
    }
    /**
     * Converts a MongoDB v2 oplog entry to v1 format.
     * Returns the original entry unchanged if it's not a v2 oplog entry
     * or doesn't contain a diff field.
     *
     * The converted entry will contain $set and $unset operations that are
     * equivalent to the v2 diff format, with paths flattened to dot notation
     * and special handling for EJSON custom types and ObjectIDs.
     */
    function oplogV2V1Converter(oplogEntry) {
      if (oplogEntry.$v !== 2 || !oplogEntry.diff) {
        return oplogEntry;
      }
      const convertedOplogEntry = {
        $v: 2
      };
      convertOplogDiff(convertedOplogEntry, oplogEntry.diff);
      return convertedOplogEntry;
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

},"cursor_description.ts":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/cursor_description.ts                                                                                //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.export({
  CursorDescription: () => CursorDescription
});
class CursorDescription {
  constructor(collectionName, selector, options) {
    this.collectionName = void 0;
    this.selector = void 0;
    this.options = void 0;
    this.collectionName = collectionName;
    // @ts-ignore
    this.selector = Mongo.Collection._rewriteSelector(selector);
    this.options = options || {};
  }
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"mongo_connection.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/mongo_connection.js                                                                                  //
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
    module.export({
      MongoConnection: () => MongoConnection
    });
    let Meteor;
    module.link("meteor/meteor", {
      Meteor(v) {
        Meteor = v;
      }
    }, 0);
    let CLIENT_ONLY_METHODS, getAsyncMethodName;
    module.link("meteor/minimongo/constants", {
      CLIENT_ONLY_METHODS(v) {
        CLIENT_ONLY_METHODS = v;
      },
      getAsyncMethodName(v) {
        getAsyncMethodName = v;
      }
    }, 1);
    let path;
    module.link("path", {
      default(v) {
        path = v;
      }
    }, 2);
    let AsynchronousCursor;
    module.link("./asynchronous_cursor", {
      AsynchronousCursor(v) {
        AsynchronousCursor = v;
      }
    }, 3);
    let Cursor;
    module.link("./cursor", {
      Cursor(v) {
        Cursor = v;
      }
    }, 4);
    let CursorDescription;
    module.link("./cursor_description", {
      CursorDescription(v) {
        CursorDescription = v;
      }
    }, 5);
    let DocFetcher;
    module.link("./doc_fetcher", {
      DocFetcher(v) {
        DocFetcher = v;
      }
    }, 6);
    let MongoDB, replaceMeteorAtomWithMongo, replaceTypes, transformResult;
    module.link("./mongo_common", {
      MongoDB(v) {
        MongoDB = v;
      },
      replaceMeteorAtomWithMongo(v) {
        replaceMeteorAtomWithMongo = v;
      },
      replaceTypes(v) {
        replaceTypes = v;
      },
      transformResult(v) {
        transformResult = v;
      }
    }, 7);
    let ObserveHandle;
    module.link("./observe_handle", {
      ObserveHandle(v) {
        ObserveHandle = v;
      }
    }, 8);
    let ObserveMultiplexer;
    module.link("./observe_multiplex", {
      ObserveMultiplexer(v) {
        ObserveMultiplexer = v;
      }
    }, 9);
    let OplogObserveDriver;
    module.link("./oplog_observe_driver", {
      OplogObserveDriver(v) {
        OplogObserveDriver = v;
      }
    }, 10);
    let OPLOG_COLLECTION, OplogHandle;
    module.link("./oplog_tailing", {
      OPLOG_COLLECTION(v) {
        OPLOG_COLLECTION = v;
      },
      OplogHandle(v) {
        OplogHandle = v;
      }
    }, 11);
    let PollingObserveDriver;
    module.link("./polling_observe_driver", {
      PollingObserveDriver(v) {
        PollingObserveDriver = v;
      }
    }, 12);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    const FILE_ASSET_SUFFIX = 'Asset';
    const ASSETS_FOLDER = 'assets';
    const APP_FOLDER = 'app';
    const oplogCollectionWarnings = [];
    const MongoConnection = function (url, options) {
      var _Meteor$settings, _Meteor$settings$pack, _Meteor$settings$pack2;
      var self = this;
      options = options || {};
      self._observeMultiplexers = {};
      self._onFailoverHook = new Hook();
      const userOptions = _objectSpread(_objectSpread({}, Mongo._connectionOptions || {}), ((_Meteor$settings = Meteor.settings) === null || _Meteor$settings === void 0 ? void 0 : (_Meteor$settings$pack = _Meteor$settings.packages) === null || _Meteor$settings$pack === void 0 ? void 0 : (_Meteor$settings$pack2 = _Meteor$settings$pack.mongo) === null || _Meteor$settings$pack2 === void 0 ? void 0 : _Meteor$settings$pack2.options) || {});
      var mongoOptions = Object.assign({
        ignoreUndefined: true
      }, userOptions);

      // Internally the oplog connections specify their own maxPoolSize
      // which we don't want to overwrite with any user defined value
      if ('maxPoolSize' in options) {
        // If we just set this for "server", replSet will override it. If we just
        // set it for replSet, it will be ignored if we're not using a replSet.
        mongoOptions.maxPoolSize = options.maxPoolSize;
      }
      if ('minPoolSize' in options) {
        mongoOptions.minPoolSize = options.minPoolSize;
      }

      // Transform options like "tlsCAFileAsset": "filename.pem" into
      // "tlsCAFile": "/<fullpath>/filename.pem"
      Object.entries(mongoOptions || {}).filter(_ref => {
        let [key] = _ref;
        return key && key.endsWith(FILE_ASSET_SUFFIX);
      }).forEach(_ref2 => {
        let [key, value] = _ref2;
        const optionName = key.replace(FILE_ASSET_SUFFIX, '');
        mongoOptions[optionName] = path.join(Assets.getServerDir(), ASSETS_FOLDER, APP_FOLDER, value);
        delete mongoOptions[key];
      });
      self.db = null;
      self._oplogHandle = null;
      self._docFetcher = null;
      mongoOptions.driverInfo = {
        name: 'Meteor',
        version: Meteor.release
      };
      self.client = new MongoDB.MongoClient(url, mongoOptions);
      self.db = self.client.db();
      self.client.on('serverDescriptionChanged', Meteor.bindEnvironment(event => {
        // When the connection is no longer against the primary node, execute all
        // failover hooks. This is important for the driver as it has to re-pool the
        // query when it happens.
        if (event.previousDescription.type !== 'RSPrimary' && event.newDescription.type === 'RSPrimary') {
          self._onFailoverHook.each(callback => {
            callback();
            return true;
          });
        }
      }));
      if (options.oplogUrl && !Package['disable-oplog']) {
        self._oplogHandle = new OplogHandle(options.oplogUrl, self.db.databaseName);
        self._docFetcher = new DocFetcher(self);
      }
    };
    MongoConnection.prototype._close = async function () {
      var self = this;
      if (!self.db) throw Error("close called before Connection created?");

      // XXX probably untested
      var oplogHandle = self._oplogHandle;
      self._oplogHandle = null;
      if (oplogHandle) await oplogHandle.stop();

      // Use Future.wrap so that errors get thrown. This happens to
      // work even outside a fiber since the 'close' method is not
      // actually asynchronous.
      await self.client.close();
    };
    MongoConnection.prototype.close = function () {
      return this._close();
    };
    MongoConnection.prototype._setOplogHandle = function (oplogHandle) {
      this._oplogHandle = oplogHandle;
      return this;
    };

    // Returns the Mongo Collection object; may yield.
    MongoConnection.prototype.rawCollection = function (collectionName) {
      var self = this;
      if (!self.db) throw Error("rawCollection called before Connection created?");
      return self.db.collection(collectionName);
    };
    MongoConnection.prototype.createCappedCollectionAsync = async function (collectionName, byteSize, maxDocuments) {
      var self = this;
      if (!self.db) throw Error("createCappedCollectionAsync called before Connection created?");
      await self.db.createCollection(collectionName, {
        capped: true,
        size: byteSize,
        max: maxDocuments
      });
    };

    // This should be called synchronously with a write, to create a
    // transaction on the current write fence, if any. After we can read
    // the write, and after observers have been notified (or at least,
    // after the observer notifiers have added themselves to the write
    // fence), you should call 'committed()' on the object returned.
    MongoConnection.prototype._maybeBeginWrite = function () {
      const fence = DDPServer._getCurrentFence();
      if (fence) {
        return fence.beginWrite();
      } else {
        return {
          committed: function () {}
        };
      }
    };

    // Internal interface: adds a callback which is called when the Mongo primary
    // changes. Returns a stop handle.
    MongoConnection.prototype._onFailover = function (callback) {
      return this._onFailoverHook.register(callback);
    };
    MongoConnection.prototype.insertAsync = async function (collection_name, document) {
      const self = this;
      if (collection_name === "___meteor_failure_test_collection") {
        const e = new Error("Failure test");
        e._expectedByTest = true;
        throw e;
      }
      if (!(LocalCollection._isPlainObject(document) && !EJSON._isCustomType(document))) {
        throw new Error("Only plain objects may be inserted into MongoDB");
      }
      var write = self._maybeBeginWrite();
      var refresh = async function () {
        await Meteor.refresh({
          collection: collection_name,
          id: document._id
        });
      };
      return self.rawCollection(collection_name).insertOne(replaceTypes(document, replaceMeteorAtomWithMongo), {
        safe: true
      }).then(async _ref3 => {
        let {
          insertedId
        } = _ref3;
        await refresh();
        await write.committed();
        return insertedId;
      }).catch(async e => {
        await write.committed();
        throw e;
      });
    };

    // Cause queries that may be affected by the selector to poll in this write
    // fence.
    MongoConnection.prototype._refresh = async function (collectionName, selector) {
      var refreshKey = {
        collection: collectionName
      };
      // If we know which documents we're removing, don't poll queries that are
      // specific to other documents. (Note that multiple notifications here should
      // not cause multiple polls, since all our listener is doing is enqueueing a
      // poll.)
      var specificIds = LocalCollection._idsMatchedBySelector(selector);
      if (specificIds) {
        for (const id of specificIds) {
          await Meteor.refresh(Object.assign({
            id: id
          }, refreshKey));
        }
        ;
      } else {
        await Meteor.refresh(refreshKey);
      }
    };
    MongoConnection.prototype.removeAsync = async function (collection_name, selector) {
      var self = this;
      if (collection_name === "___meteor_failure_test_collection") {
        var e = new Error("Failure test");
        e._expectedByTest = true;
        throw e;
      }
      var write = self._maybeBeginWrite();
      var refresh = async function () {
        await self._refresh(collection_name, selector);
      };
      return self.rawCollection(collection_name).deleteMany(replaceTypes(selector, replaceMeteorAtomWithMongo), {
        safe: true
      }).then(async _ref4 => {
        let {
          deletedCount
        } = _ref4;
        await refresh();
        await write.committed();
        return transformResult({
          result: {
            modifiedCount: deletedCount
          }
        }).numberAffected;
      }).catch(async err => {
        await write.committed();
        throw err;
      });
    };
    MongoConnection.prototype.dropCollectionAsync = async function (collectionName) {
      var self = this;
      var write = self._maybeBeginWrite();
      var refresh = function () {
        return Meteor.refresh({
          collection: collectionName,
          id: null,
          dropCollection: true
        });
      };
      return self.rawCollection(collectionName).drop().then(async result => {
        await refresh();
        await write.committed();
        return result;
      }).catch(async e => {
        await write.committed();
        throw e;
      });
    };

    // For testing only.  Slightly better than `c.rawDatabase().dropDatabase()`
    // because it lets the test's fence wait for it to be complete.
    MongoConnection.prototype.dropDatabaseAsync = async function () {
      var self = this;
      var write = self._maybeBeginWrite();
      var refresh = async function () {
        await Meteor.refresh({
          dropDatabase: true
        });
      };
      try {
        await self.db._dropDatabase();
        await refresh();
        await write.committed();
      } catch (e) {
        await write.committed();
        throw e;
      }
    };
    MongoConnection.prototype.updateAsync = async function (collection_name, selector, mod, options) {
      var self = this;
      if (collection_name === "___meteor_failure_test_collection") {
        var e = new Error("Failure test");
        e._expectedByTest = true;
        throw e;
      }

      // explicit safety check. null and undefined can crash the mongo
      // driver. Although the node driver and minimongo do 'support'
      // non-object modifier in that they don't crash, they are not
      // meaningful operations and do not do anything. Defensively throw an
      // error here.
      if (!mod || typeof mod !== 'object') {
        const error = new Error("Invalid modifier. Modifier must be an object.");
        throw error;
      }
      if (!(LocalCollection._isPlainObject(mod) && !EJSON._isCustomType(mod))) {
        const error = new Error("Only plain objects may be used as replacement" + " documents in MongoDB");
        throw error;
      }
      if (!options) options = {};
      var write = self._maybeBeginWrite();
      var refresh = async function () {
        await self._refresh(collection_name, selector);
      };
      var collection = self.rawCollection(collection_name);
      var mongoOpts = {
        safe: true
      };
      // Add support for filtered positional operator
      if (options.arrayFilters !== undefined) mongoOpts.arrayFilters = options.arrayFilters;
      // explictly enumerate options that minimongo supports
      if (options.upsert) mongoOpts.upsert = true;
      if (options.multi) mongoOpts.multi = true;
      // Lets you get a more more full result from MongoDB. Use with caution:
      // might not work with C.upsert (as opposed to C.update({upsert:true}) or
      // with simulated upsert.
      if (options.fullResult) mongoOpts.fullResult = true;
      var mongoSelector = replaceTypes(selector, replaceMeteorAtomWithMongo);
      var mongoMod = replaceTypes(mod, replaceMeteorAtomWithMongo);
      var isModify = LocalCollection._isModificationMod(mongoMod);
      if (options._forbidReplace && !isModify) {
        var err = new Error("Invalid modifier. Replacements are forbidden.");
        throw err;
      }

      // We've already run replaceTypes/replaceMeteorAtomWithMongo on
      // selector and mod.  We assume it doesn't matter, as far as
      // the behavior of modifiers is concerned, whether `_modify`
      // is run on EJSON or on mongo-converted EJSON.

      // Run this code up front so that it fails fast if someone uses
      // a Mongo update operator we don't support.
      let knownId;
      if (options.upsert) {
        try {
          let newDoc = LocalCollection._createUpsertDocument(selector, mod);
          knownId = newDoc._id;
        } catch (err) {
          throw err;
        }
      }
      if (options.upsert && !isModify && !knownId && options.insertedId && !(options.insertedId instanceof Mongo.ObjectID && options.generatedId)) {
        // In case of an upsert with a replacement, where there is no _id defined
        // in either the query or the replacement doc, mongo will generate an id itself.
        // Therefore we need this special strategy if we want to control the id ourselves.

        // We don't need to do this when:
        // - This is not a replacement, so we can add an _id to $setOnInsert
        // - The id is defined by query or mod we can just add it to the replacement doc
        // - The user did not specify any id preference and the id is a Mongo ObjectId,
        //     then we can just let Mongo generate the id
        return await simulateUpsertWithInsertedId(collection, mongoSelector, mongoMod, options).then(async result => {
          await refresh();
          await write.committed();
          if (result && !options._returnObject) {
            return result.numberAffected;
          } else {
            return result;
          }
        });
      } else {
        if (options.upsert && !knownId && options.insertedId && isModify) {
          if (!mongoMod.hasOwnProperty('$setOnInsert')) {
            mongoMod.$setOnInsert = {};
          }
          knownId = options.insertedId;
          Object.assign(mongoMod.$setOnInsert, replaceTypes({
            _id: options.insertedId
          }, replaceMeteorAtomWithMongo));
        }
        const strings = Object.keys(mongoMod).filter(key => !key.startsWith("$"));
        let updateMethod = strings.length > 0 ? 'replaceOne' : 'updateMany';
        updateMethod = updateMethod === 'updateMany' && !mongoOpts.multi ? 'updateOne' : updateMethod;
        return collection[updateMethod].bind(collection)(mongoSelector, mongoMod, mongoOpts).then(async result => {
          var meteorResult = transformResult({
            result
          });
          if (meteorResult && options._returnObject) {
            // If this was an upsertAsync() call, and we ended up
            // inserting a new doc and we know its id, then
            // return that id as well.
            if (options.upsert && meteorResult.insertedId) {
              if (knownId) {
                meteorResult.insertedId = knownId;
              } else if (meteorResult.insertedId instanceof MongoDB.ObjectId) {
                meteorResult.insertedId = new Mongo.ObjectID(meteorResult.insertedId.toHexString());
              }
            }
            await refresh();
            await write.committed();
            return meteorResult;
          } else {
            await refresh();
            await write.committed();
            return meteorResult.numberAffected;
          }
        }).catch(async err => {
          await write.committed();
          throw err;
        });
      }
    };

    // exposed for testing
    MongoConnection._isCannotChangeIdError = function (err) {
      // Mongo 3.2.* returns error as next Object:
      // {name: String, code: Number, errmsg: String}
      // Older Mongo returns:
      // {name: String, code: Number, err: String}
      var error = err.errmsg || err.err;

      // We don't use the error code here
      // because the error code we observed it producing (16837) appears to be
      // a far more generic error code based on examining the source.
      if (error.indexOf('The _id field cannot be changed') === 0 || error.indexOf("the (immutable) field '_id' was found to have been altered to _id") !== -1) {
        return true;
      }
      return false;
    };

    // XXX MongoConnection.upsertAsync() does not return the id of the inserted document
    // unless you set it explicitly in the selector or modifier (as a replacement
    // doc).
    MongoConnection.prototype.upsertAsync = async function (collectionName, selector, mod, options) {
      var self = this;
      if (typeof options === "function" && !callback) {
        callback = options;
        options = {};
      }
      return self.updateAsync(collectionName, selector, mod, Object.assign({}, options, {
        upsert: true,
        _returnObject: true
      }));
    };
    MongoConnection.prototype.find = function (collectionName, selector, options) {
      var self = this;
      if (arguments.length === 1) selector = {};
      return new Cursor(self, new CursorDescription(collectionName, selector, options));
    };
    MongoConnection.prototype.findOneAsync = async function (collection_name, selector, options) {
      var self = this;
      if (arguments.length === 1) {
        selector = {};
      }
      options = options || {};
      options.limit = 1;
      const results = await self.find(collection_name, selector, options).fetch();
      return results[0];
    };

    // We'll actually design an index API later. For now, we just pass through to
    // Mongo's, but make it synchronous.
    MongoConnection.prototype.createIndexAsync = async function (collectionName, index, options) {
      var self = this;

      // We expect this function to be called at startup, not from within a method,
      // so we don't interact with the write fence.
      var collection = self.rawCollection(collectionName);
      await collection.createIndex(index, options);
    };

    // just to be consistent with the other methods
    MongoConnection.prototype.createIndex = MongoConnection.prototype.createIndexAsync;
    MongoConnection.prototype.countDocuments = function (collectionName) {
      for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
        args[_key - 1] = arguments[_key];
      }
      args = args.map(arg => replaceTypes(arg, replaceMeteorAtomWithMongo));
      const collection = this.rawCollection(collectionName);
      return collection.countDocuments(...args);
    };
    MongoConnection.prototype.estimatedDocumentCount = function (collectionName) {
      for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
        args[_key2 - 1] = arguments[_key2];
      }
      args = args.map(arg => replaceTypes(arg, replaceMeteorAtomWithMongo));
      const collection = this.rawCollection(collectionName);
      return collection.estimatedDocumentCount(...args);
    };
    MongoConnection.prototype.ensureIndexAsync = MongoConnection.prototype.createIndexAsync;
    MongoConnection.prototype.dropIndexAsync = async function (collectionName, index) {
      var self = this;

      // This function is only used by test code, not within a method, so we don't
      // interact with the write fence.
      var collection = self.rawCollection(collectionName);
      var indexName = await collection.dropIndex(index);
    };
    CLIENT_ONLY_METHODS.forEach(function (m) {
      MongoConnection.prototype[m] = function () {
        throw new Error("".concat(m, " +  is not available on the server. Please use ").concat(getAsyncMethodName(m), "() instead."));
      };
    });
    var NUM_OPTIMISTIC_TRIES = 3;
    var simulateUpsertWithInsertedId = async function (collection, selector, mod, options) {
      // STRATEGY: First try doing an upsert with a generated ID.
      // If this throws an error about changing the ID on an existing document
      // then without affecting the database, we know we should probably try
      // an update without the generated ID. If it affected 0 documents,
      // then without affecting the database, we the document that first
      // gave the error is probably removed and we need to try an insert again
      // We go back to step one and repeat.
      // Like all "optimistic write" schemes, we rely on the fact that it's
      // unlikely our writes will continue to be interfered with under normal
      // circumstances (though sufficiently heavy contention with writers
      // disagreeing on the existence of an object will cause writes to fail
      // in theory).

      var insertedId = options.insertedId; // must exist
      var mongoOptsForUpdate = {
        safe: true,
        multi: options.multi
      };
      var mongoOptsForInsert = {
        safe: true,
        upsert: true
      };
      var replacementWithId = Object.assign(replaceTypes({
        _id: insertedId
      }, replaceMeteorAtomWithMongo), mod);
      var tries = NUM_OPTIMISTIC_TRIES;
      var doUpdate = async function () {
        tries--;
        if (!tries) {
          throw new Error("Upsert failed after " + NUM_OPTIMISTIC_TRIES + " tries.");
        } else {
          let method = collection.updateMany;
          if (!Object.keys(mod).some(key => key.startsWith("$"))) {
            method = collection.replaceOne.bind(collection);
          }
          return method(selector, mod, mongoOptsForUpdate).then(result => {
            if (result && (result.modifiedCount || result.upsertedCount)) {
              return {
                numberAffected: result.modifiedCount || result.upsertedCount,
                insertedId: result.upsertedId || undefined
              };
            } else {
              return doConditionalInsert();
            }
          });
        }
      };
      var doConditionalInsert = function () {
        return collection.replaceOne(selector, replacementWithId, mongoOptsForInsert).then(result => ({
          numberAffected: result.upsertedCount,
          insertedId: result.upsertedId
        })).catch(err => {
          if (MongoConnection._isCannotChangeIdError(err)) {
            return doUpdate();
          } else {
            throw err;
          }
        });
      };
      return doUpdate();
    };

    // observeChanges for tailable cursors on capped collections.
    //
    // Some differences from normal cursors:
    //   - Will never produce anything other than 'added' or 'addedBefore'. If you
    //     do update a document that has already been produced, this will not notice
    //     it.
    //   - If you disconnect and reconnect from Mongo, it will essentially restart
    //     the query, which will lead to duplicate results. This is pretty bad,
    //     but if you include a field called 'ts' which is inserted as
    //     new MongoInternals.MongoTimestamp(0, 0) (which is initialized to the
    //     current Mongo-style timestamp), we'll be able to find the place to
    //     restart properly. (This field is specifically understood by Mongo with an
    //     optimization which allows it to find the right place to start without
    //     an index on ts. It's how the oplog works.)
    //   - No callbacks are triggered synchronously with the call (there's no
    //     differentiation between "initial data" and "later changes"; everything
    //     that matches the query gets sent asynchronously).
    //   - De-duplication is not implemented.
    //   - Does not yet interact with the write fence. Probably, this should work by
    //     ignoring removes (which don't work on capped collections) and updates
    //     (which don't affect tailable cursors), and just keeping track of the ID
    //     of the inserted object, and closing the write fence once you get to that
    //     ID (or timestamp?).  This doesn't work well if the document doesn't match
    //     the query, though.  On the other hand, the write fence can close
    //     immediately if it does not match the query. So if we trust minimongo
    //     enough to accurately evaluate the query against the write fence, we
    //     should be able to do this...  Of course, minimongo doesn't even support
    //     Mongo Timestamps yet.
    MongoConnection.prototype._observeChangesTailable = function (cursorDescription, ordered, callbacks) {
      var self = this;

      // Tailable cursors only ever call added/addedBefore callbacks, so it's an
      // error if you didn't provide them.
      if (ordered && !callbacks.addedBefore || !ordered && !callbacks.added) {
        throw new Error("Can't observe an " + (ordered ? "ordered" : "unordered") + " tailable cursor without a " + (ordered ? "addedBefore" : "added") + " callback");
      }
      return self.tail(cursorDescription, function (doc) {
        var id = doc._id;
        delete doc._id;
        // The ts is an implementation detail. Hide it.
        delete doc.ts;
        if (ordered) {
          callbacks.addedBefore(id, doc, null);
        } else {
          callbacks.added(id, doc);
        }
      });
    };
    MongoConnection.prototype._createAsynchronousCursor = function (cursorDescription) {
      let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var self = this;
      const {
        selfForIteration,
        useTransform
      } = options;
      options = {
        selfForIteration,
        useTransform
      };
      var collection = self.rawCollection(cursorDescription.collectionName);
      var cursorOptions = cursorDescription.options;
      var mongoOptions = {
        sort: cursorOptions.sort,
        limit: cursorOptions.limit,
        skip: cursorOptions.skip,
        projection: cursorOptions.fields || cursorOptions.projection,
        readPreference: cursorOptions.readPreference
      };

      // Do we want a tailable cursor (which only works on capped collections)?
      if (cursorOptions.tailable) {
        mongoOptions.numberOfRetries = -1;
      }
      var dbCursor = collection.find(replaceTypes(cursorDescription.selector, replaceMeteorAtomWithMongo), mongoOptions);

      // Do we want a tailable cursor (which only works on capped collections)?
      if (cursorOptions.tailable) {
        // We want a tailable cursor...
        dbCursor.addCursorFlag("tailable", true);
        // ... and for the server to wait a bit if any getMore has no data (rather
        // than making us put the relevant sleeps in the client)...
        dbCursor.addCursorFlag("awaitData", true);

        // And if this is on the oplog collection and the cursor specifies a 'ts',
        // then set the undocumented oplog replay flag, which does a special scan to
        // find the first document (instead of creating an index on ts). This is a
        // very hard-coded Mongo flag which only works on the oplog collection and
        // only works with the ts field.
        if (cursorDescription.collectionName === OPLOG_COLLECTION && cursorDescription.selector.ts) {
          dbCursor.addCursorFlag("oplogReplay", true);
        }
      }
      if (typeof cursorOptions.maxTimeMs !== 'undefined') {
        dbCursor = dbCursor.maxTimeMS(cursorOptions.maxTimeMs);
      }
      if (typeof cursorOptions.hint !== 'undefined') {
        dbCursor = dbCursor.hint(cursorOptions.hint);
      }
      return new AsynchronousCursor(dbCursor, cursorDescription, options, collection);
    };

    // Tails the cursor described by cursorDescription, most likely on the
    // oplog. Calls docCallback with each document found. Ignores errors and just
    // restarts the tail on error.
    //
    // If timeoutMS is set, then if we don't get a new document every timeoutMS,
    // kill and restart the cursor. This is primarily a workaround for #8598.
    MongoConnection.prototype.tail = function (cursorDescription, docCallback, timeoutMS) {
      var self = this;
      if (!cursorDescription.options.tailable) throw new Error("Can only tail a tailable cursor");
      var cursor = self._createAsynchronousCursor(cursorDescription);
      var stopped = false;
      var lastTS;
      Meteor.defer(async function loop() {
        var doc = null;
        while (true) {
          if (stopped) return;
          try {
            doc = await cursor._nextObjectPromiseWithTimeout(timeoutMS);
          } catch (err) {
            // We should not ignore errors here unless we want to spend a lot of time debugging
            console.error(err);
            // There's no good way to figure out if this was actually an error from
            // Mongo, or just client-side (including our own timeout error). Ah
            // well. But either way, we need to retry the cursor (unless the failure
            // was because the observe got stopped).
            doc = null;
          }
          // Since we awaited a promise above, we need to check again to see if
          // we've been stopped before calling the callback.
          if (stopped) return;
          if (doc) {
            // If a tailable cursor contains a "ts" field, use it to recreate the
            // cursor on error. ("ts" is a standard that Mongo uses internally for
            // the oplog, and there's a special flag that lets you do binary search
            // on it instead of needing to use an index.)
            lastTS = doc.ts;
            docCallback(doc);
          } else {
            var newSelector = Object.assign({}, cursorDescription.selector);
            if (lastTS) {
              newSelector.ts = {
                $gt: lastTS
              };
            }
            cursor = self._createAsynchronousCursor(new CursorDescription(cursorDescription.collectionName, newSelector, cursorDescription.options));
            // Mongo failover takes many seconds.  Retry in a bit.  (Without this
            // setTimeout, we peg the CPU at 100% and never notice the actual
            // failover.
            setTimeout(loop, 100);
            break;
          }
        }
      });
      return {
        stop: function () {
          stopped = true;
          cursor.close();
        }
      };
    };
    Object.assign(MongoConnection.prototype, {
      _observeChanges: async function (cursorDescription, ordered, callbacks, nonMutatingCallbacks) {
        var _self$_oplogHandle;
        var self = this;
        const collectionName = cursorDescription.collectionName;
        if (cursorDescription.options.tailable) {
          return self._observeChangesTailable(cursorDescription, ordered, callbacks);
        }

        // You may not filter out _id when observing changes, because the id is a core
        // part of the observeChanges API.
        const fieldsOptions = cursorDescription.options.projection || cursorDescription.options.fields;
        if (fieldsOptions && (fieldsOptions._id === 0 || fieldsOptions._id === false)) {
          throw Error("You may not observe a cursor with {fields: {_id: 0}}");
        }
        var observeKey = EJSON.stringify(Object.assign({
          ordered: ordered
        }, cursorDescription));
        var multiplexer, observeDriver;
        var firstHandle = false;

        // Find a matching ObserveMultiplexer, or create a new one. This next block is
        // guaranteed to not yield (and it doesn't call anything that can observe a
        // new query), so no other calls to this function can interleave with it.
        if (observeKey in self._observeMultiplexers) {
          multiplexer = self._observeMultiplexers[observeKey];
        } else {
          firstHandle = true;
          // Create a new ObserveMultiplexer.
          multiplexer = new ObserveMultiplexer({
            ordered: ordered,
            onStop: function () {
              delete self._observeMultiplexers[observeKey];
              return observeDriver.stop();
            }
          });
        }
        var observeHandle = new ObserveHandle(multiplexer, callbacks, nonMutatingCallbacks);
        const oplogOptions = (self === null || self === void 0 ? void 0 : (_self$_oplogHandle = self._oplogHandle) === null || _self$_oplogHandle === void 0 ? void 0 : _self$_oplogHandle._oplogOptions) || {};
        const {
          includeCollections,
          excludeCollections
        } = oplogOptions;
        if (firstHandle) {
          var matcher, sorter;
          var canUseOplog = [function () {
            // At a bare minimum, using the oplog requires us to have an oplog, to
            // want unordered callbacks, and to not want a callback on the polls
            // that won't happen.
            return self._oplogHandle && !ordered && !callbacks._testOnlyPollCallback;
          }, function () {
            // We also need to check, if the collection of this Cursor is actually being "watched" by the Oplog handle
            // if not, we have to fallback to long polling
            if (excludeCollections !== null && excludeCollections !== void 0 && excludeCollections.length && excludeCollections.includes(collectionName)) {
              if (!oplogCollectionWarnings.includes(collectionName)) {
                console.warn("Meteor.settings.packages.mongo.oplogExcludeCollections includes the collection ".concat(collectionName, " - your subscriptions will only use long polling!"));
                oplogCollectionWarnings.push(collectionName); // we only want to show the warnings once per collection!
              }
              return false;
            }
            if (includeCollections !== null && includeCollections !== void 0 && includeCollections.length && !includeCollections.includes(collectionName)) {
              if (!oplogCollectionWarnings.includes(collectionName)) {
                console.warn("Meteor.settings.packages.mongo.oplogIncludeCollections does not include the collection ".concat(collectionName, " - your subscriptions will only use long polling!"));
                oplogCollectionWarnings.push(collectionName); // we only want to show the warnings once per collection!
              }
              return false;
            }
            return true;
          }, function () {
            // We need to be able to compile the selector. Fall back to polling for
            // some newfangled $selector that minimongo doesn't support yet.
            try {
              matcher = new Minimongo.Matcher(cursorDescription.selector);
              return true;
            } catch (e) {
              // XXX make all compilation errors MinimongoError or something
              //     so that this doesn't ignore unrelated exceptions
              return false;
            }
          }, function () {
            // ... and the selector itself needs to support oplog.
            return OplogObserveDriver.cursorSupported(cursorDescription, matcher);
          }, function () {
            // And we need to be able to compile the sort, if any.  eg, can't be
            // {$natural: 1}.
            if (!cursorDescription.options.sort) return true;
            try {
              sorter = new Minimongo.Sorter(cursorDescription.options.sort);
              return true;
            } catch (e) {
              // XXX make all compilation errors MinimongoError or something
              //     so that this doesn't ignore unrelated exceptions
              return false;
            }
          }].every(f => f()); // invoke each function and check if all return true

          var driverClass = canUseOplog ? OplogObserveDriver : PollingObserveDriver;
          observeDriver = new driverClass({
            cursorDescription: cursorDescription,
            mongoHandle: self,
            multiplexer: multiplexer,
            ordered: ordered,
            matcher: matcher,
            // ignored by polling
            sorter: sorter,
            // ignored by polling
            _testOnlyPollCallback: callbacks._testOnlyPollCallback
          });
          if (observeDriver._init) {
            await observeDriver._init();
          }

          // This field is only set for use in tests.
          multiplexer._observeDriver = observeDriver;
        }
        self._observeMultiplexers[observeKey] = multiplexer;
        // Blocks until the initial adds have been sent.
        await multiplexer.addHandleAndSendInitialAdds(observeHandle);
        return observeHandle;
      }
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"mongo_common.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/mongo_common.js                                                                                      //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      MongoDB: () => MongoDB,
      writeCallback: () => writeCallback,
      transformResult: () => transformResult,
      replaceMeteorAtomWithMongo: () => replaceMeteorAtomWithMongo,
      replaceTypes: () => replaceTypes,
      replaceMongoAtomWithMeteor: () => replaceMongoAtomWithMeteor,
      replaceNames: () => replaceNames
    });
    let clone;
    module.link("lodash.clone", {
      default(v) {
        clone = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    const MongoDB = Object.assign(NpmModuleMongodb, {
      ObjectID: NpmModuleMongodb.ObjectId
    });
    const writeCallback = function (write, refresh, callback) {
      return function (err, result) {
        if (!err) {
          // XXX We don't have to run this on error, right?
          try {
            refresh();
          } catch (refreshErr) {
            if (callback) {
              callback(refreshErr);
              return;
            } else {
              throw refreshErr;
            }
          }
        }
        write.committed();
        if (callback) {
          callback(err, result);
        } else if (err) {
          throw err;
        }
      };
    };
    const transformResult = function (driverResult) {
      var meteorResult = {
        numberAffected: 0
      };
      if (driverResult) {
        var mongoResult = driverResult.result;
        // On updates with upsert:true, the inserted values come as a list of
        // upserted values -- even with options.multi, when the upsert does insert,
        // it only inserts one element.
        if (mongoResult.upsertedCount) {
          meteorResult.numberAffected = mongoResult.upsertedCount;
          if (mongoResult.upsertedId) {
            meteorResult.insertedId = mongoResult.upsertedId;
          }
        } else {
          // n was used before Mongo 5.0, in Mongo 5.0 we are not receiving this n
          // field and so we are using modifiedCount instead
          meteorResult.numberAffected = mongoResult.n || mongoResult.matchedCount || mongoResult.modifiedCount;
        }
      }
      return meteorResult;
    };
    const replaceMeteorAtomWithMongo = function (document) {
      if (EJSON.isBinary(document)) {
        // This does more copies than we'd like, but is necessary because
        // MongoDB.BSON only looks like it takes a Uint8Array (and doesn't actually
        // serialize it correctly).
        return new MongoDB.Binary(Buffer.from(document));
      }
      if (document instanceof MongoDB.Binary) {
        return document;
      }
      if (document instanceof Mongo.ObjectID) {
        return new MongoDB.ObjectId(document.toHexString());
      }
      if (document instanceof MongoDB.ObjectId) {
        return new MongoDB.ObjectId(document.toHexString());
      }
      if (document instanceof MongoDB.Timestamp) {
        // For now, the Meteor representation of a Mongo timestamp type (not a date!
        // this is a weird internal thing used in the oplog!) is the same as the
        // Mongo representation. We need to do this explicitly or else we would do a
        // structural clone and lose the prototype.
        return document;
      }
      if (document instanceof Decimal) {
        return MongoDB.Decimal128.fromString(document.toString());
      }
      if (EJSON._isCustomType(document)) {
        return replaceNames(makeMongoLegal, EJSON.toJSONValue(document));
      }
      // It is not ordinarily possible to stick dollar-sign keys into mongo
      // so we don't bother checking for things that need escaping at this time.
      return undefined;
    };
    const replaceTypes = function (document, atomTransformer) {
      if (typeof document !== 'object' || document === null) return document;
      var replacedTopLevelAtom = atomTransformer(document);
      if (replacedTopLevelAtom !== undefined) return replacedTopLevelAtom;
      var ret = document;
      Object.entries(document).forEach(function (_ref) {
        let [key, val] = _ref;
        var valReplaced = replaceTypes(val, atomTransformer);
        if (val !== valReplaced) {
          // Lazy clone. Shallow copy.
          if (ret === document) ret = clone(document);
          ret[key] = valReplaced;
        }
      });
      return ret;
    };
    const replaceMongoAtomWithMeteor = function (document) {
      if (document instanceof MongoDB.Binary) {
        // for backwards compatibility
        if (document.sub_type !== 0) {
          return document;
        }
        var buffer = document.value(true);
        return new Uint8Array(buffer);
      }
      if (document instanceof MongoDB.ObjectId) {
        return new Mongo.ObjectID(document.toHexString());
      }
      if (document instanceof MongoDB.Decimal128) {
        return Decimal(document.toString());
      }
      if (document["EJSON$type"] && document["EJSON$value"] && Object.keys(document).length === 2) {
        return EJSON.fromJSONValue(replaceNames(unmakeMongoLegal, document));
      }
      if (document instanceof MongoDB.Timestamp) {
        // For now, the Meteor representation of a Mongo timestamp type (not a date!
        // this is a weird internal thing used in the oplog!) is the same as the
        // Mongo representation. We need to do this explicitly or else we would do a
        // structural clone and lose the prototype.
        return document;
      }
      return undefined;
    };
    const makeMongoLegal = name => "EJSON" + name;
    const unmakeMongoLegal = name => name.substr(5);
    function replaceNames(filter, thing) {
      if (typeof thing === "object" && thing !== null) {
        if (Array.isArray(thing)) {
          return thing.map(replaceNames.bind(null, filter));
        }
        var ret = {};
        Object.entries(thing).forEach(function (_ref2) {
          let [key, value] = _ref2;
          ret[filter(key)] = replaceNames(filter, value);
        });
        return ret;
      }
      return thing;
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

},"asynchronous_cursor.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/asynchronous_cursor.js                                                                               //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      AsynchronousCursor: () => AsynchronousCursor
    });
    let LocalCollection;
    module.link("meteor/minimongo/local_collection", {
      default(v) {
        LocalCollection = v;
      }
    }, 0);
    let replaceMongoAtomWithMeteor, replaceTypes;
    module.link("./mongo_common", {
      replaceMongoAtomWithMeteor(v) {
        replaceMongoAtomWithMeteor = v;
      },
      replaceTypes(v) {
        replaceTypes = v;
      }
    }, 1);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    class AsynchronousCursor {
      constructor(dbCursor, cursorDescription, options) {
        this._dbCursor = dbCursor;
        this._cursorDescription = cursorDescription;
        this._selfForIteration = options.selfForIteration || this;
        if (options.useTransform && cursorDescription.options.transform) {
          this._transform = LocalCollection.wrapTransform(cursorDescription.options.transform);
        } else {
          this._transform = null;
        }
        this._visitedIds = new LocalCollection._IdMap();
      }
      [Symbol.asyncIterator]() {
        var cursor = this;
        return {
          async next() {
            const value = await cursor._nextObjectPromise();
            return {
              done: !value,
              value
            };
          }
        };
      }

      // Returns a Promise for the next object from the underlying cursor (before
      // the Mongo->Meteor type replacement).
      async _rawNextObjectPromise() {
        try {
          return this._dbCursor.next();
        } catch (e) {
          console.error(e);
        }
      }

      // Returns a Promise for the next object from the cursor, skipping those whose
      // IDs we've already seen and replacing Mongo atoms with Meteor atoms.
      async _nextObjectPromise() {
        while (true) {
          var doc = await this._rawNextObjectPromise();
          if (!doc) return null;
          doc = replaceTypes(doc, replaceMongoAtomWithMeteor);
          if (!this._cursorDescription.options.tailable && '_id' in doc) {
            // Did Mongo give us duplicate documents in the same cursor? If so,
            // ignore this one. (Do this before the transform, since transform might
            // return some unrelated value.) We don't do this for tailable cursors,
            // because we want to maintain O(1) memory usage. And if there isn't _id
            // for some reason (maybe it's the oplog), then we don't do this either.
            // (Be careful to do this for falsey but existing _id, though.)
            if (this._visitedIds.has(doc._id)) continue;
            this._visitedIds.set(doc._id, true);
          }
          if (this._transform) doc = this._transform(doc);
          return doc;
        }
      }

      // Returns a promise which is resolved with the next object (like with
      // _nextObjectPromise) or rejected if the cursor doesn't return within
      // timeoutMS ms.
      _nextObjectPromiseWithTimeout(timeoutMS) {
        if (!timeoutMS) {
          return this._nextObjectPromise();
        }
        const nextObjectPromise = this._nextObjectPromise();
        const timeoutErr = new Error('Client-side timeout waiting for next object');
        const timeoutPromise = new Promise((resolve, reject) => {
          setTimeout(() => {
            reject(timeoutErr);
          }, timeoutMS);
        });
        return Promise.race([nextObjectPromise, timeoutPromise]).catch(err => {
          if (err === timeoutErr) {
            this.close();
            return;
          }
          throw err;
        });
      }
      async forEach(callback, thisArg) {
        // Get back to the beginning.
        this._rewind();
        let idx = 0;
        while (true) {
          const doc = await this._nextObjectPromise();
          if (!doc) return;
          await callback.call(thisArg, doc, idx++, this._selfForIteration);
        }
      }
      async map(callback, thisArg) {
        const results = [];
        await this.forEach(async (doc, index) => {
          results.push(await callback.call(thisArg, doc, index, this._selfForIteration));
        });
        return results;
      }
      _rewind() {
        // known to be synchronous
        this._dbCursor.rewind();
        this._visitedIds = new LocalCollection._IdMap();
      }

      // Mostly usable for tailable cursors.
      close() {
        this._dbCursor.close();
      }
      fetch() {
        return this.map(doc => doc);
      }

      /**
       * FIXME: (node:34680) [MONGODB DRIVER] Warning: cursor.count is deprecated and will be
       *  removed in the next major version, please use `collection.estimatedDocumentCount` or
       *  `collection.countDocuments` instead.
       */
      count() {
        return this._dbCursor.count();
      }

      // This method is NOT wrapped in Cursor.
      async getRawObjects(ordered) {
        var self = this;
        if (ordered) {
          return self.fetch();
        } else {
          var results = new LocalCollection._IdMap();
          await self.forEach(function (doc) {
            results.set(doc._id, doc);
          });
          return results;
        }
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"cursor.ts":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/cursor.ts                                                                                            //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      Cursor: () => Cursor
    });
    let ASYNC_CURSOR_METHODS, getAsyncMethodName;
    module.link("meteor/minimongo/constants", {
      ASYNC_CURSOR_METHODS(v) {
        ASYNC_CURSOR_METHODS = v;
      },
      getAsyncMethodName(v) {
        getAsyncMethodName = v;
      }
    }, 0);
    let replaceMeteorAtomWithMongo, replaceTypes;
    module.link("./mongo_common", {
      replaceMeteorAtomWithMongo(v) {
        replaceMeteorAtomWithMongo = v;
      },
      replaceTypes(v) {
        replaceTypes = v;
      }
    }, 1);
    let LocalCollection;
    module.link("meteor/minimongo/local_collection", {
      default(v) {
        LocalCollection = v;
      }
    }, 2);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    class Cursor {
      constructor(mongo, cursorDescription) {
        this._mongo = void 0;
        this._cursorDescription = void 0;
        this._synchronousCursor = void 0;
        this._mongo = mongo;
        this._cursorDescription = cursorDescription;
        this._synchronousCursor = null;
      }
      async countAsync() {
        const collection = this._mongo.rawCollection(this._cursorDescription.collectionName);
        return await collection.countDocuments(replaceTypes(this._cursorDescription.selector, replaceMeteorAtomWithMongo), replaceTypes(this._cursorDescription.options, replaceMeteorAtomWithMongo));
      }
      count() {
        throw new Error("count() is not available on the server. Please use countAsync() instead.");
      }
      getTransform() {
        return this._cursorDescription.options.transform;
      }
      _publishCursor(sub) {
        const collection = this._cursorDescription.collectionName;
        return Mongo.Collection._publishCursor(this, sub, collection);
      }
      _getCollectionName() {
        return this._cursorDescription.collectionName;
      }
      observe(callbacks) {
        return LocalCollection._observeFromObserveChanges(this, callbacks);
      }
      async observeAsync(callbacks) {
        return new Promise(resolve => resolve(this.observe(callbacks)));
      }
      observeChanges(callbacks) {
        let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
        const ordered = LocalCollection._observeChangesCallbacksAreOrdered(callbacks);
        return this._mongo._observeChanges(this._cursorDescription, ordered, callbacks, options.nonMutatingCallbacks);
      }
      async observeChangesAsync(callbacks) {
        let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
        return this.observeChanges(callbacks, options);
      }
    }
    // Add cursor methods dynamically
    [...ASYNC_CURSOR_METHODS, Symbol.iterator, Symbol.asyncIterator].forEach(methodName => {
      if (methodName === 'count') return;
      Cursor.prototype[methodName] = function () {
        const cursor = setupAsynchronousCursor(this, methodName);
        return cursor[methodName](...arguments);
      };
      if (methodName === Symbol.iterator || methodName === Symbol.asyncIterator) return;
      const methodNameAsync = getAsyncMethodName(methodName);
      Cursor.prototype[methodNameAsync] = function () {
        return this[methodName](...arguments);
      };
    });
    function setupAsynchronousCursor(cursor, method) {
      if (cursor._cursorDescription.options.tailable) {
        throw new Error("Cannot call ".concat(String(method), " on a tailable cursor"));
      }
      if (!cursor._synchronousCursor) {
        cursor._synchronousCursor = cursor._mongo._createAsynchronousCursor(cursor._cursorDescription, {
          selfForIteration: cursor,
          useTransform: true
        });
      }
      return cursor._synchronousCursor;
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

},"local_collection_driver.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/local_collection_driver.js                                                                           //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.export({
  LocalCollectionDriver: () => LocalCollectionDriver
});
const LocalCollectionDriver = new class LocalCollectionDriver {
  constructor() {
    this.noConnCollections = Object.create(null);
  }
  open(name, conn) {
    if (!name) {
      return new LocalCollection();
    }
    if (!conn) {
      return ensureCollection(name, this.noConnCollections);
    }
    if (!conn._mongo_livedata_collections) {
      conn._mongo_livedata_collections = Object.create(null);
    }

    // XXX is there a way to keep track of a connection's collections without
    // dangling it off the connection object?
    return ensureCollection(name, conn._mongo_livedata_collections);
  }
}();
function ensureCollection(name, collections) {
  return name in collections ? collections[name] : collections[name] = new LocalCollection(name);
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"remote_collection_driver.ts":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/remote_collection_driver.ts                                                                          //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      RemoteCollectionDriver: () => RemoteCollectionDriver
    });
    let once;
    module.link("lodash.once", {
      default(v) {
        once = v;
      }
    }, 0);
    let ASYNC_COLLECTION_METHODS, getAsyncMethodName, CLIENT_ONLY_METHODS;
    module.link("meteor/minimongo/constants", {
      ASYNC_COLLECTION_METHODS(v) {
        ASYNC_COLLECTION_METHODS = v;
      },
      getAsyncMethodName(v) {
        getAsyncMethodName = v;
      },
      CLIENT_ONLY_METHODS(v) {
        CLIENT_ONLY_METHODS = v;
      }
    }, 1);
    let MongoConnection;
    module.link("./mongo_connection", {
      MongoConnection(v) {
        MongoConnection = v;
      }
    }, 2);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    class RemoteCollectionDriver {
      constructor(mongoUrl, options) {
        this.mongo = void 0;
        this.mongo = new MongoConnection(mongoUrl, options);
      }
      open(name) {
        const ret = {};
        // Handle remote collection methods
        RemoteCollectionDriver.REMOTE_COLLECTION_METHODS.forEach(method => {
          // Type assertion needed because we know these methods exist on MongoConnection
          const mongoMethod = this.mongo[method];
          ret[method] = mongoMethod.bind(this.mongo, name);
          if (!ASYNC_COLLECTION_METHODS.includes(method)) return;
          const asyncMethodName = getAsyncMethodName(method);
          ret[asyncMethodName] = function () {
            return ret[method](...arguments);
          };
        });
        // Handle client-only methods
        CLIENT_ONLY_METHODS.forEach(method => {
          ret[method] = function () {
            throw new Error("".concat(method, " is not available on the server. Please use ").concat(getAsyncMethodName(method), "() instead."));
          };
        });
        return ret;
      }
    }
    // Assign the class to MongoInternals
    RemoteCollectionDriver.REMOTE_COLLECTION_METHODS = ['createCappedCollectionAsync', 'dropIndexAsync', 'ensureIndexAsync', 'createIndexAsync', 'countDocuments', 'dropCollectionAsync', 'estimatedDocumentCount', 'find', 'findOneAsync', 'insertAsync', 'rawCollection', 'removeAsync', 'updateAsync', 'upsertAsync'];
    MongoInternals.RemoteCollectionDriver = RemoteCollectionDriver;
    // Create the singleton RemoteCollectionDriver only on demand
    MongoInternals.defaultRemoteCollectionDriver = once(() => {
      const connectionOptions = {};
      const mongoUrl = process.env.MONGO_URL;
      if (!mongoUrl) {
        throw new Error("MONGO_URL must be set in environment");
      }
      if (process.env.MONGO_OPLOG_URL) {
        connectionOptions.oplogUrl = process.env.MONGO_OPLOG_URL;
      }
      const driver = new RemoteCollectionDriver(mongoUrl, connectionOptions);
      // Initialize database connection on startup
      Meteor.startup(async () => {
        await driver.mongo.client.connect();
      });
      return driver;
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"collection":{"collection.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/collection/collection.js                                                                             //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
!module.wrapAsync(async function (module1, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    let _objectSpread;
    module1.link("@babel/runtime/helpers/objectSpread2", {
      default(v) {
        _objectSpread = v;
      }
    }, 0);
    let normalizeProjection;
    module1.link("../mongo_utils", {
      normalizeProjection(v) {
        normalizeProjection = v;
      }
    }, 0);
    let AsyncMethods;
    module1.link("./methods_async", {
      AsyncMethods(v) {
        AsyncMethods = v;
      }
    }, 1);
    let SyncMethods;
    module1.link("./methods_sync", {
      SyncMethods(v) {
        SyncMethods = v;
      }
    }, 2);
    let IndexMethods;
    module1.link("./methods_index", {
      IndexMethods(v) {
        IndexMethods = v;
      }
    }, 3);
    let ID_GENERATORS, normalizeOptions, setupAutopublish, setupConnection, setupDriver, setupMutationMethods, validateCollectionName;
    module1.link("./collection_utils", {
      ID_GENERATORS(v) {
        ID_GENERATORS = v;
      },
      normalizeOptions(v) {
        normalizeOptions = v;
      },
      setupAutopublish(v) {
        setupAutopublish = v;
      },
      setupConnection(v) {
        setupConnection = v;
      },
      setupDriver(v) {
        setupDriver = v;
      },
      setupMutationMethods(v) {
        setupMutationMethods = v;
      },
      validateCollectionName(v) {
        validateCollectionName = v;
      }
    }, 4);
    let ReplicationMethods;
    module1.link("./methods_replication", {
      ReplicationMethods(v) {
        ReplicationMethods = v;
      }
    }, 5);
    let watchChangeStream;
    module1.link("./watch_change_stream", {
      watchChangeStream(v) {
        watchChangeStream = v;
      }
    }, 6);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    /**
     * @summary Namespace for MongoDB-related items
     * @namespace
     */
    Mongo = {};

    /**
     * @summary Constructor for a Collection
     * @locus Anywhere
     * @instancename collection
     * @class
     * @param {String} name The name of the collection.  If null, creates an unmanaged (unsynchronized) local collection.
     * @param {Object} [options]
     * @param {Object} options.connection The server connection that will manage this collection. Uses the default connection if not specified.  Pass the return value of calling [`DDP.connect`](#DDP-connect) to specify a different server. Pass `null` to specify no connection. Unmanaged (`name` is null) collections cannot specify a connection.
     * @param {String} options.idGeneration The method of generating the `_id` fields of new documents in this collection.  Possible values:
    
     - **`'STRING'`**: random strings
     - **`'MONGO'`**:  random [`Mongo.ObjectID`](#mongo_object_id) values
    
    The default id generation technique is `'STRING'`.
     * @param {Function} options.transform An optional transformation function. Documents will be passed through this function before being returned from `fetch` or `findOneAsync`, and before being passed to callbacks of `observe`, `map`, `forEach`, `allow`, and `deny`. Transforms are *not* applied for the callbacks of `observeChanges` or to cursors returned from publish functions.
     * @param {Boolean} options.defineMutationMethods Set to `false` to skip setting up the mutation methods that enable insert/update/remove from client code. Default `true`.
     */
    // Main Collection constructor
    Mongo.Collection = function Collection(name, options) {
      var _ID_GENERATORS$option, _ID_GENERATORS;
      name = validateCollectionName(name);
      options = normalizeOptions(options);
      this._makeNewID = (_ID_GENERATORS$option = (_ID_GENERATORS = ID_GENERATORS)[options.idGeneration]) === null || _ID_GENERATORS$option === void 0 ? void 0 : _ID_GENERATORS$option.call(_ID_GENERATORS, name);
      this._transform = LocalCollection.wrapTransform(options.transform);
      this.resolverType = options.resolverType;
      this._connection = setupConnection(name, options);
      const driver = setupDriver(name, this._connection, options);
      this._driver = driver;
      this._collection = driver.open(name, this._connection);
      this._name = name;
      this._settingUpReplicationPromise = this._maybeSetUpReplication(name, options);
      setupMutationMethods(this, name, options);
      setupAutopublish(this, name, options);
      Mongo._collections.set(name, this);
    };
    Object.assign(Mongo.Collection.prototype, {
      _getFindSelector(args) {
        if (args.length == 0) return {};else return args[0];
      },
      _getFindOptions(args) {
        const [, options] = args || [];
        const newOptions = normalizeProjection(options);
        var self = this;
        if (args.length < 2) {
          return {
            transform: self._transform
          };
        } else {
          check(newOptions, Match.Optional(Match.ObjectIncluding({
            projection: Match.Optional(Match.OneOf(Object, undefined)),
            sort: Match.Optional(Match.OneOf(Object, Array, Function, undefined)),
            limit: Match.Optional(Match.OneOf(Number, undefined)),
            skip: Match.Optional(Match.OneOf(Number, undefined))
          })));
          return _objectSpread({
            transform: self._transform
          }, newOptions);
        }
      }
    });
    Object.assign(Mongo.Collection, {
      async _publishCursor(cursor, sub, collection) {
        var observeHandle = await cursor.observeChanges({
          added: function (id, fields) {
            sub.added(collection, id, fields);
          },
          changed: function (id, fields) {
            sub.changed(collection, id, fields);
          },
          removed: function (id) {
            sub.removed(collection, id);
          }
        },
        // Publications don't mutate the documents
        // This is tested by the `livedata - publish callbacks clone` test
        {
          nonMutatingCallbacks: true
        });

        // We don't call sub.ready() here: it gets called in livedata_server, after
        // possibly calling _publishCursor on multiple returned cursors.

        // register stop callback (expects lambda w/ no args).
        sub.onStop(async function () {
          return await observeHandle.stop();
        });

        // return the observeHandle in case it needs to be stopped early
        return observeHandle;
      },
      // protect against dangerous selectors.  falsey and {_id: falsey} are both
      // likely programmer error, and not what you want, particularly for destructive
      // operations. If a falsey _id is sent in, a new string _id will be
      // generated and returned; if a fallbackId is provided, it will be returned
      // instead.
      _rewriteSelector(selector) {
        let {
          fallbackId
        } = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
        // shorthand -- scalars match _id
        if (LocalCollection._selectorIsId(selector)) selector = {
          _id: selector
        };
        if (Array.isArray(selector)) {
          // This is consistent with the Mongo console itself; if we don't do this
          // check passing an empty array ends up selecting all items
          throw new Error("Mongo selector can't be an array.");
        }
        if (!selector || '_id' in selector && !selector._id) {
          // can't match anything
          return {
            _id: fallbackId || Random.id()
          };
        }
        return selector;
      }
    });
    Object.assign(Mongo.Collection.prototype, ReplicationMethods, SyncMethods, AsyncMethods, IndexMethods);
    Object.assign(Mongo.Collection.prototype, {
      // Determine if this collection is simply a minimongo representation of a real
      // database on another server
      _isRemoteCollection() {
        // XXX see #MeteorServerNull
        return this._connection && this._connection !== Meteor.server;
      },
      async dropCollectionAsync() {
        var self = this;
        if (!self._collection.dropCollectionAsync) throw new Error('Can only call dropCollectionAsync on server collections');
        await self._collection.dropCollectionAsync();
      },
      async createCappedCollectionAsync(byteSize, maxDocuments) {
        var self = this;
        if (!(await self._collection.createCappedCollectionAsync)) throw new Error('Can only call createCappedCollectionAsync on server collections');
        await self._collection.createCappedCollectionAsync(byteSize, maxDocuments);
      },
      /**
       * @summary Returns the [`Collection`](http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html) object corresponding to this collection from the [npm `mongodb` driver module](https://www.npmjs.com/package/mongodb) which is wrapped by `Mongo.Collection`.
       * @locus Server
       * @memberof Mongo.Collection
       * @instance
       */
      rawCollection() {
        var self = this;
        if (!self._collection.rawCollection) {
          throw new Error('Can only call rawCollection on server collections');
        }
        return self._collection.rawCollection();
      },
      /**
       * @summary Returns the [`Db`](http://mongodb.github.io/node-mongodb-native/3.0/api/Db.html) object corresponding to this collection's database connection from the [npm `mongodb` driver module](https://www.npmjs.com/package/mongodb) which is wrapped by `Mongo.Collection`.
       * @locus Server
       * @memberof Mongo.Collection
       * @instance
       */
      rawDatabase() {
        var self = this;
        if (!(self._driver.mongo && self._driver.mongo.db)) {
          throw new Error('Can only call rawDatabase on server collections');
        }
        return self._driver.mongo.db;
      }
    });
    Object.assign(Mongo, {
      /**
       * @summary Retrieve a Meteor collection instance by name. Only collections defined with [`new Mongo.Collection(...)`](#collections) are available with this method. For plain MongoDB collections, you'll want to look at [`rawDatabase()`](#Mongo-Collection-rawDatabase).
       * @locus Anywhere
       * @memberof Mongo
       * @static
       * @param {string} name Name of your collection as it was defined with `new Mongo.Collection()`.
       * @returns {Mongo.Collection | undefined}
       */
      getCollection(name) {
        return this._collections.get(name);
      },
      /**
       * @summary A record of all defined Mongo.Collection instances, indexed by collection name.
       * @type {Map<string, Mongo.Collection>}
       * @memberof Mongo
       * @protected
       */
      _collections: new Map()
    });

    /**
     * @summary Create a Mongo-style `ObjectID`.  If you don't specify a `hexString`, the `ObjectID` will be generated randomly (not using MongoDB's ID construction rules).
     * @locus Anywhere
     * @class
     * @param {String} [hexString] Optional.  The 24-character hexadecimal contents of the ObjectID to create
     */
    Mongo.ObjectID = MongoID.ObjectID;

    /**
     * @summary To create a cursor, use find. To access the documents in a cursor, use forEach, map, or fetch.
     * @class
     * @instanceName cursor
     */
    Mongo.Cursor = LocalCollection.Cursor;

    /**
     * @deprecated in 0.9.1
     */
    Mongo.Collection.Cursor = Mongo.Cursor;

    /**
     * @deprecated in 0.9.1
     */
    Mongo.Collection.ObjectID = Mongo.ObjectID;

    /**
     * @deprecated in 0.9.1
     */
    Meteor.Collection = Mongo.Collection;

    // Allow deny stuff is now in the allow-deny package
    Object.assign(Mongo.Collection.prototype, AllowDeny.CollectionPrototype);

    // Só agora que Mongo.Collection existe, adicionamos o método ao prototype
    Object.assign(Mongo.Collection.prototype, {
      watchChangeStream
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"collection_utils.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/collection/collection_utils.js                                                                       //
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
    module.export({
      ID_GENERATORS: () => ID_GENERATORS,
      setupConnection: () => setupConnection,
      setupDriver: () => setupDriver,
      setupAutopublish: () => setupAutopublish,
      setupMutationMethods: () => setupMutationMethods,
      validateCollectionName: () => validateCollectionName,
      normalizeOptions: () => normalizeOptions
    });
    const ID_GENERATORS = {
      MONGO(name) {
        return function () {
          const src = name ? DDP.randomStream('/collection/' + name) : Random.insecure;
          return new Mongo.ObjectID(src.hexString(24));
        };
      },
      STRING(name) {
        return function () {
          const src = name ? DDP.randomStream('/collection/' + name) : Random.insecure;
          return src.id();
        };
      }
    };
    function setupConnection(name, options) {
      if (!name || options.connection === null) return null;
      if (options.connection) return options.connection;
      return Meteor.isClient ? Meteor.connection : Meteor.server;
    }
    function setupDriver(name, connection, options) {
      if (options._driver) return options._driver;
      if (name && connection === Meteor.server && typeof MongoInternals !== 'undefined' && MongoInternals.defaultRemoteCollectionDriver) {
        return MongoInternals.defaultRemoteCollectionDriver();
      }
      const {
        LocalCollectionDriver
      } = require('../local_collection_driver.js');
      return LocalCollectionDriver;
    }
    function setupAutopublish(collection, name, options) {
      if (Package.autopublish && !options._preventAutopublish && collection._connection && collection._connection.publish) {
        collection._connection.publish(null, () => collection.find(), {
          is_auto: true
        });
      }
    }
    function setupMutationMethods(collection, name, options) {
      if (options.defineMutationMethods === false) return;
      try {
        collection._defineMutationMethods({
          useExisting: options._suppressSameNameError === true
        });
      } catch (error) {
        if (error.message === "A method named '/".concat(name, "/insertAsync' is already defined")) {
          throw new Error("There is already a collection named \"".concat(name, "\""));
        }
        throw error;
      }
    }
    function validateCollectionName(name) {
      if (!name && name !== null) {
        Meteor._debug('Warning: creating anonymous collection. It will not be ' + 'saved or synchronized over the network. (Pass null for ' + 'the collection name to turn off this warning.)');
        name = null;
      }
      if (name !== null && typeof name !== 'string') {
        throw new Error('First argument to new Mongo.Collection must be a string or null');
      }
      return name;
    }
    function normalizeOptions(options) {
      if (options && options.methods) {
        // Backwards compatibility hack with original signature
        options = {
          connection: options
        };
      }
      // Backwards compatibility: "connection" used to be called "manager".
      if (options && options.manager && !options.connection) {
        options.connection = options.manager;
      }
      return _objectSpread({
        connection: undefined,
        idGeneration: 'STRING',
        transform: null,
        _driver: undefined,
        _preventAutopublish: false
      }, options);
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

},"methods_async.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/collection/methods_async.js                                                                          //
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
    module.export({
      AsyncMethods: () => AsyncMethods
    });
    const AsyncMethods = {
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
       * @returns {Object}
       */
      findOneAsync() {
        for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
          args[_key] = arguments[_key];
        }
        return this._collection.findOneAsync(this._getFindSelector(args), this._getFindOptions(args));
      },
      _insertAsync(doc) {
        let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
        // Make sure we were passed a document to insert
        if (!doc) {
          throw new Error('insert requires an argument');
        }

        // Make a shallow clone of the document, preserving its prototype.
        doc = Object.create(Object.getPrototypeOf(doc), Object.getOwnPropertyDescriptors(doc));
        if ('_id' in doc) {
          if (!doc._id || !(typeof doc._id === 'string' || doc._id instanceof Mongo.ObjectID)) {
            throw new Error('Meteor requires document _id fields to be non-empty strings or ObjectIDs');
          }
        } else {
          let generateId = true;

          // Don't generate the id if we're the client and the 'outermost' call
          // This optimization saves us passing both the randomSeed and the id
          // Passing both is redundant.
          if (this._isRemoteCollection()) {
            const enclosing = DDP._CurrentMethodInvocation.get();
            if (!enclosing) {
              generateId = false;
            }
          }
          if (generateId) {
            doc._id = this._makeNewID();
          }
        }

        // On inserts, always return the id that we generated; on all other
        // operations, just return the result from the collection.
        var chooseReturnValueFromCollectionResult = function (result) {
          if (Meteor._isPromise(result)) return result;
          if (doc._id) {
            return doc._id;
          }

          // XXX what is this for??
          // It's some iteraction between the callback to _callMutatorMethod and
          // the return value conversion
          doc._id = result;
          return result;
        };
        if (this._isRemoteCollection()) {
          const promise = this._callMutatorMethodAsync('insertAsync', [doc], options);
          promise.then(chooseReturnValueFromCollectionResult);
          promise.stubPromise = promise.stubPromise.then(chooseReturnValueFromCollectionResult);
          promise.serverPromise = promise.serverPromise.then(chooseReturnValueFromCollectionResult);
          return promise;
        }

        // it's my collection.  descend into the collection object
        // and propagate any exception.
        return this._collection.insertAsync(doc).then(chooseReturnValueFromCollectionResult);
      },
      /**
       * @summary Insert a document in the collection.  Returns a promise that will return the document's unique _id when solved.
       * @locus Anywhere
       * @method  insert
       * @memberof Mongo.Collection
       * @instance
       * @param {Object} doc The document to insert. May not yet have an _id attribute, in which case Meteor will generate one for you.
       */
      insertAsync(doc, options) {
        return this._insertAsync(doc, options);
      },
      /**
       * @summary Modify one or more documents in the collection. Returns the number of matched documents.
       * @locus Anywhere
       * @method update
       * @memberof Mongo.Collection
       * @instance
       * @param {MongoSelector} selector Specifies which documents to modify
       * @param {MongoModifier} modifier Specifies how to modify the documents
       * @param {Object} [options]
       * @param {Boolean} options.multi True to modify all matching documents; false to only modify one of the matching documents (the default).
       * @param {Boolean} options.upsert True to insert a document if no matching documents are found.
       * @param {Array} options.arrayFilters Optional. Used in combination with MongoDB [filtered positional operator](https://docs.mongodb.com/manual/reference/operator/update/positional-filtered/) to specify which elements to modify in an array field.
       */
      updateAsync(selector, modifier) {
        // We've already popped off the callback, so we are left with an array
        // of one or zero items
        const options = _objectSpread({}, (arguments.length <= 2 ? undefined : arguments[2]) || null);
        let insertedId;
        if (options && options.upsert) {
          // set `insertedId` if absent.  `insertedId` is a Meteor extension.
          if (options.insertedId) {
            if (!(typeof options.insertedId === 'string' || options.insertedId instanceof Mongo.ObjectID)) throw new Error('insertedId must be string or ObjectID');
            insertedId = options.insertedId;
          } else if (!selector || !selector._id) {
            insertedId = this._makeNewID();
            options.generatedId = true;
            options.insertedId = insertedId;
          }
        }
        selector = Mongo.Collection._rewriteSelector(selector, {
          fallbackId: insertedId
        });
        if (this._isRemoteCollection()) {
          const args = [selector, modifier, options];
          return this._callMutatorMethodAsync('updateAsync', args, options);
        }

        // it's my collection.  descend into the collection object
        // and propagate any exception.
        // If the user provided a callback and the collection implements this
        // operation asynchronously, then queryRet will be undefined, and the
        // result will be returned through the callback instead.

        return this._collection.updateAsync(selector, modifier, options);
      },
      /**
       * @summary Asynchronously removes documents from the collection.
       * @locus Anywhere
       * @method remove
       * @memberof Mongo.Collection
       * @instance
       * @param {MongoSelector} selector Specifies which documents to remove
       */
      removeAsync(selector) {
        let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
        selector = Mongo.Collection._rewriteSelector(selector);
        if (this._isRemoteCollection()) {
          return this._callMutatorMethodAsync('removeAsync', [selector], options);
        }

        // it's my collection.  descend into the collection1 object
        // and propagate any exception.
        return this._collection.removeAsync(selector);
      },
      /**
       * @summary Asynchronously modifies one or more documents in the collection, or insert one if no matching documents were found. Returns an object with keys `numberAffected` (the number of documents modified)  and `insertedId` (the unique _id of the document that was inserted, if any).
       * @locus Anywhere
       * @method upsert
       * @memberof Mongo.Collection
       * @instance
       * @param {MongoSelector} selector Specifies which documents to modify
       * @param {MongoModifier} modifier Specifies how to modify the documents
       * @param {Object} [options]
       * @param {Boolean} options.multi True to modify all matching documents; false to only modify one of the matching documents (the default).
       */
      async upsertAsync(selector, modifier, options) {
        return this.updateAsync(selector, modifier, _objectSpread(_objectSpread({}, options), {}, {
          _returnObject: true,
          upsert: true
        }));
      },
      /**
       * @summary Gets the number of documents matching the filter. For a fast count of the total documents in a collection see `estimatedDocumentCount`.
       * @locus Anywhere
       * @method countDocuments
       * @memberof Mongo.Collection
       * @instance
       * @param {MongoSelector} [selector] A query describing the documents to count
       * @param {Object} [options] All options are listed in [MongoDB documentation](https://mongodb.github.io/node-mongodb-native/4.11/interfaces/CountDocumentsOptions.html). Please note that not all of them are available on the client.
       * @returns {Promise<number>}
       */
      countDocuments() {
        return this._collection.countDocuments(...arguments);
      },
      /**
       * @summary Gets an estimate of the count of documents in a collection using collection metadata. For an exact count of the documents in a collection see `countDocuments`.
       * @locus Anywhere
       * @method estimatedDocumentCount
       * @memberof Mongo.Collection
       * @instance
       * @param {Object} [options] All options are listed in [MongoDB documentation](https://mongodb.github.io/node-mongodb-native/4.11/interfaces/EstimatedDocumentCountOptions.html). Please note that not all of them are available on the client.
       * @returns {Promise<number>}
       */
      estimatedDocumentCount() {
        return this._collection.estimatedDocumentCount(...arguments);
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"methods_index.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/collection/methods_index.js                                                                          //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      IndexMethods: () => IndexMethods
    });
    let Log;
    module.link("meteor/logging", {
      Log(v) {
        Log = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    const IndexMethods = {
      // We'll actually design an index API later. For now, we just pass through to
      // Mongo's, but make it synchronous.
      /**
       * @summary Asynchronously creates the specified index on the collection.
       * @locus server
       * @method ensureIndexAsync
       * @deprecated in 3.0
       * @memberof Mongo.Collection
       * @instance
       * @param {Object} index A document that contains the field and value pairs where the field is the index key and the value describes the type of index for that field. For an ascending index on a field, specify a value of `1`; for descending index, specify a value of `-1`. Use `text` for text indexes.
       * @param {Object} [options] All options are listed in [MongoDB documentation](https://docs.mongodb.com/manual/reference/method/db.collection.createIndex/#options)
       * @param {String} options.name Name of the index
       * @param {Boolean} options.unique Define that the index values must be unique, more at [MongoDB documentation](https://docs.mongodb.com/manual/core/index-unique/)
       * @param {Boolean} options.sparse Define that the index is sparse, more at [MongoDB documentation](https://docs.mongodb.com/manual/core/index-sparse/)
       */
      async ensureIndexAsync(index, options) {
        var self = this;
        if (!self._collection.ensureIndexAsync || !self._collection.createIndexAsync) throw new Error('Can only call createIndexAsync on server collections');
        if (self._collection.createIndexAsync) {
          await self._collection.createIndexAsync(index, options);
        } else {
          Log.debug("ensureIndexAsync has been deprecated, please use the new 'createIndexAsync' instead".concat(options !== null && options !== void 0 && options.name ? ", index name: ".concat(options.name) : ", index: ".concat(JSON.stringify(index))));
          await self._collection.ensureIndexAsync(index, options);
        }
      },
      /**
       * @summary Asynchronously creates the specified index on the collection.
       * @locus server
       * @method createIndexAsync
       * @memberof Mongo.Collection
       * @instance
       * @param {Object} index A document that contains the field and value pairs where the field is the index key and the value describes the type of index for that field. For an ascending index on a field, specify a value of `1`; for descending index, specify a value of `-1`. Use `text` for text indexes.
       * @param {Object} [options] All options are listed in [MongoDB documentation](https://docs.mongodb.com/manual/reference/method/db.collection.createIndex/#options)
       * @param {String} options.name Name of the index
       * @param {Boolean} options.unique Define that the index values must be unique, more at [MongoDB documentation](https://docs.mongodb.com/manual/core/index-unique/)
       * @param {Boolean} options.sparse Define that the index is sparse, more at [MongoDB documentation](https://docs.mongodb.com/manual/core/index-sparse/)
       */
      async createIndexAsync(index, options) {
        var self = this;
        if (!self._collection.createIndexAsync) throw new Error('Can only call createIndexAsync on server collections');
        try {
          await self._collection.createIndexAsync(index, options);
        } catch (e) {
          var _Meteor$settings, _Meteor$settings$pack, _Meteor$settings$pack2;
          if (e.message.includes('An equivalent index already exists with the same name but different options.') && (_Meteor$settings = Meteor.settings) !== null && _Meteor$settings !== void 0 && (_Meteor$settings$pack = _Meteor$settings.packages) !== null && _Meteor$settings$pack !== void 0 && (_Meteor$settings$pack2 = _Meteor$settings$pack.mongo) !== null && _Meteor$settings$pack2 !== void 0 && _Meteor$settings$pack2.reCreateIndexOnOptionMismatch) {
            Log.info("Re-creating index ".concat(index, " for ").concat(self._name, " due to options mismatch."));
            await self._collection.dropIndexAsync(index);
            await self._collection.createIndexAsync(index, options);
          } else {
            console.error(e);
            throw new Meteor.Error("An error occurred when creating an index for collection \"".concat(self._name, ": ").concat(e.message));
          }
        }
      },
      /**
       * @summary Asynchronously creates the specified index on the collection.
       * @locus server
       * @method createIndex
       * @memberof Mongo.Collection
       * @instance
       * @param {Object} index A document that contains the field and value pairs where the field is the index key and the value describes the type of index for that field. For an ascending index on a field, specify a value of `1`; for descending index, specify a value of `-1`. Use `text` for text indexes.
       * @param {Object} [options] All options are listed in [MongoDB documentation](https://docs.mongodb.com/manual/reference/method/db.collection.createIndex/#options)
       * @param {String} options.name Name of the index
       * @param {Boolean} options.unique Define that the index values must be unique, more at [MongoDB documentation](https://docs.mongodb.com/manual/core/index-unique/)
       * @param {Boolean} options.sparse Define that the index is sparse, more at [MongoDB documentation](https://docs.mongodb.com/manual/core/index-sparse/)
       */
      createIndex(index, options) {
        return this.createIndexAsync(index, options);
      },
      async dropIndexAsync(index) {
        var self = this;
        if (!self._collection.dropIndexAsync) throw new Error('Can only call dropIndexAsync on server collections');
        await self._collection.dropIndexAsync(index);
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"methods_replication.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/collection/methods_replication.js                                                                    //
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
    module.export({
      ReplicationMethods: () => ReplicationMethods
    });
    const ReplicationMethods = {
      async _maybeSetUpReplication(name) {
        var _registerStoreResult, _registerStoreResult$;
        const self = this;
        if (!(self._connection && self._connection.registerStoreClient && self._connection.registerStoreServer)) {
          return;
        }
        const wrappedStoreCommon = {
          // Called around method stub invocations to capture the original versions
          // of modified documents.
          saveOriginals() {
            self._collection.saveOriginals();
          },
          retrieveOriginals() {
            return self._collection.retrieveOriginals();
          },
          // To be able to get back to the collection from the store.
          _getCollection() {
            return self;
          }
        };
        const wrappedStoreClient = _objectSpread({
          // Called at the beginning of a batch of updates. batchSize is the number
          // of update calls to expect.
          //
          // XXX This interface is pretty janky. reset probably ought to go back to
          // being its own function, and callers shouldn't have to calculate
          // batchSize. The optimization of not calling pause/remove should be
          // delayed until later: the first call to update() should buffer its
          // message, and then we can either directly apply it at endUpdate time if
          // it was the only update, or do pauseObservers/apply/apply at the next
          // update() if there's another one.
          async beginUpdate(batchSize, reset) {
            // pause observers so users don't see flicker when updating several
            // objects at once (including the post-reconnect reset-and-reapply
            // stage), and so that a re-sorting of a query can take advantage of the
            // full _diffQuery moved calculation instead of applying change one at a
            // time.
            if (batchSize > 1 || reset) self._collection.pauseObservers();
            if (reset) await self._collection.remove({});
          },
          // Apply an update.
          // XXX better specify this interface (not in terms of a wire message)?
          update(msg) {
            var mongoId = MongoID.idParse(msg.id);
            var doc = self._collection._docs.get(mongoId);

            //When the server's mergebox is disabled for a collection, the client must gracefully handle it when:
            // *We receive an added message for a document that is already there. Instead, it will be changed
            // *We reeive a change message for a document that is not there. Instead, it will be added
            // *We receive a removed messsage for a document that is not there. Instead, noting wil happen.

            //Code is derived from client-side code originally in peerlibrary:control-mergebox
            //https://github.com/peerlibrary/meteor-control-mergebox/blob/master/client.coffee

            //For more information, refer to discussion "Initial support for publication strategies in livedata server":
            //https://github.com/meteor/meteor/pull/11151
            if (Meteor.isClient) {
              if (msg.msg === 'added' && doc) {
                msg.msg = 'changed';
              } else if (msg.msg === 'removed' && !doc) {
                return;
              } else if (msg.msg === 'changed' && !doc) {
                msg.msg = 'added';
                const _ref = msg.fields;
                for (let field in _ref) {
                  const value = _ref[field];
                  if (value === void 0) {
                    delete msg.fields[field];
                  }
                }
              }
            }
            // Is this a "replace the whole doc" message coming from the quiescence
            // of method writes to an object? (Note that 'undefined' is a valid
            // value meaning "remove it".)
            if (msg.msg === 'replace') {
              var replace = msg.replace;
              if (!replace) {
                if (doc) self._collection.remove(mongoId);
              } else if (!doc) {
                self._collection.insert(replace);
              } else {
                // XXX check that replace has no $ ops
                self._collection.update(mongoId, replace);
              }
              return;
            } else if (msg.msg === 'added') {
              if (doc) {
                throw new Error('Expected not to find a document already present for an add');
              }
              self._collection.insert(_objectSpread({
                _id: mongoId
              }, msg.fields));
            } else if (msg.msg === 'removed') {
              if (!doc) throw new Error('Expected to find a document already present for removed');
              self._collection.remove(mongoId);
            } else if (msg.msg === 'changed') {
              if (!doc) throw new Error('Expected to find a document to change');
              const keys = Object.keys(msg.fields);
              if (keys.length > 0) {
                var modifier = {};
                keys.forEach(key => {
                  const value = msg.fields[key];
                  if (EJSON.equals(doc[key], value)) {
                    return;
                  }
                  if (typeof value === 'undefined') {
                    if (!modifier.$unset) {
                      modifier.$unset = {};
                    }
                    modifier.$unset[key] = 1;
                  } else {
                    if (!modifier.$set) {
                      modifier.$set = {};
                    }
                    modifier.$set[key] = value;
                  }
                });
                if (Object.keys(modifier).length > 0) {
                  self._collection.update(mongoId, modifier);
                }
              }
            } else {
              throw new Error("I don't know how to deal with this message");
            }
          },
          // Called at the end of a batch of updates.livedata_connection.js:1287
          endUpdate() {
            self._collection.resumeObserversClient();
          },
          // Used to preserve current versions of documents across a store reset.
          getDoc(id) {
            return self.findOne(id);
          }
        }, wrappedStoreCommon);
        const wrappedStoreServer = _objectSpread({
          async beginUpdate(batchSize, reset) {
            if (batchSize > 1 || reset) self._collection.pauseObservers();
            if (reset) await self._collection.removeAsync({});
          },
          async update(msg) {
            var mongoId = MongoID.idParse(msg.id);
            var doc = self._collection._docs.get(mongoId);

            // Is this a "replace the whole doc" message coming from the quiescence
            // of method writes to an object? (Note that 'undefined' is a valid
            // value meaning "remove it".)
            if (msg.msg === 'replace') {
              var replace = msg.replace;
              if (!replace) {
                if (doc) await self._collection.removeAsync(mongoId);
              } else if (!doc) {
                await self._collection.insertAsync(replace);
              } else {
                // XXX check that replace has no $ ops
                await self._collection.updateAsync(mongoId, replace);
              }
              return;
            } else if (msg.msg === 'added') {
              if (doc) {
                throw new Error('Expected not to find a document already present for an add');
              }
              await self._collection.insertAsync(_objectSpread({
                _id: mongoId
              }, msg.fields));
            } else if (msg.msg === 'removed') {
              if (!doc) throw new Error('Expected to find a document already present for removed');
              await self._collection.removeAsync(mongoId);
            } else if (msg.msg === 'changed') {
              if (!doc) throw new Error('Expected to find a document to change');
              const keys = Object.keys(msg.fields);
              if (keys.length > 0) {
                var modifier = {};
                keys.forEach(key => {
                  const value = msg.fields[key];
                  if (EJSON.equals(doc[key], value)) {
                    return;
                  }
                  if (typeof value === 'undefined') {
                    if (!modifier.$unset) {
                      modifier.$unset = {};
                    }
                    modifier.$unset[key] = 1;
                  } else {
                    if (!modifier.$set) {
                      modifier.$set = {};
                    }
                    modifier.$set[key] = value;
                  }
                });
                if (Object.keys(modifier).length > 0) {
                  await self._collection.updateAsync(mongoId, modifier);
                }
              }
            } else {
              throw new Error("I don't know how to deal with this message");
            }
          },
          // Called at the end of a batch of updates.
          async endUpdate() {
            await self._collection.resumeObserversServer();
          },
          // Used to preserve current versions of documents across a store reset.
          async getDoc(id) {
            return self.findOneAsync(id);
          }
        }, wrappedStoreCommon);

        // OK, we're going to be a slave, replicating some remote
        // database, except possibly with some temporary divergence while
        // we have unacknowledged RPC's.
        let registerStoreResult;
        if (Meteor.isClient) {
          registerStoreResult = self._connection.registerStoreClient(name, wrappedStoreClient);
        } else {
          registerStoreResult = self._connection.registerStoreServer(name, wrappedStoreServer);
        }
        const message = "There is already a collection named \"".concat(name, "\"");
        const logWarn = () => {
          console.warn ? console.warn(message) : console.log(message);
        };
        if (!registerStoreResult) {
          return logWarn();
        }
        return (_registerStoreResult = registerStoreResult) === null || _registerStoreResult === void 0 ? void 0 : (_registerStoreResult$ = _registerStoreResult.then) === null || _registerStoreResult$ === void 0 ? void 0 : _registerStoreResult$.call(_registerStoreResult, ok => {
          if (!ok) {
            logWarn();
          }
        });
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"methods_sync.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/collection/methods_sync.js                                                                           //
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
    module.export({
      SyncMethods: () => SyncMethods
    });
    const SyncMethods = {
      /**
       * @summary Find the documents in a collection that match the selector.
       * @locus Anywhere
       * @method find
       * @memberof Mongo.Collection
       * @instance
       * @param {MongoSelector} [selector] A query describing the documents to find
       * @param {Object} [options]
       * @param {MongoSortSpecifier} options.sort Sort order (default: natural order)
       * @param {Number} options.skip Number of results to skip at the beginning
       * @param {Number} options.limit Maximum number of results to return
       * @param {MongoFieldSpecifier} options.fields Dictionary of fields to return or exclude.
       * @param {Boolean} options.reactive (Client only) Default `true`; pass `false` to disable reactivity
       * @param {Function} options.transform Overrides `transform` on the  [`Collection`](#collections) for this cursor.  Pass `null` to disable transformation.
       * @param {Boolean} options.disableOplog (Server only) Pass true to disable oplog-tailing on this query. This affects the way server processes calls to `observe` on this query. Disabling the oplog can be useful when working with data that updates in large batches.
       * @param {Number} options.pollingIntervalMs (Server only) When oplog is disabled (through the use of `disableOplog` or when otherwise not available), the frequency (in milliseconds) of how often to poll this query when observing on the server. Defaults to 10000ms (10 seconds).
       * @param {Number} options.pollingThrottleMs (Server only) When oplog is disabled (through the use of `disableOplog` or when otherwise not available), the minimum time (in milliseconds) to allow between re-polling when observing on the server. Increasing this will save CPU and mongo load at the expense of slower updates to users. Decreasing this is not recommended. Defaults to 50ms.
       * @param {Number} options.maxTimeMs (Server only) If set, instructs MongoDB to set a time limit for this cursor's operations. If the operation reaches the specified time limit (in milliseconds) without the having been completed, an exception will be thrown. Useful to prevent an (accidental or malicious) unoptimized query from causing a full collection scan that would disrupt other database users, at the expense of needing to handle the resulting error.
       * @param {String|Object} options.hint (Server only) Overrides MongoDB's default index selection and query optimization process. Specify an index to force its use, either by its name or index specification. You can also specify `{ $natural : 1 }` to force a forwards collection scan, or `{ $natural : -1 }` for a reverse collection scan. Setting this is only recommended for advanced users.
       * @param {String} options.readPreference (Server only) Specifies a custom MongoDB [`readPreference`](https://docs.mongodb.com/manual/core/read-preference) for this particular cursor. Possible values are `primary`, `primaryPreferred`, `secondary`, `secondaryPreferred` and `nearest`.
       * @returns {Mongo.Cursor}
       */
      find() {
        for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
          args[_key] = arguments[_key];
        }
        // Collection.find() (return all docs) behaves differently
        // from Collection.find(undefined) (return 0 docs).  so be
        // careful about the length of arguments.
        return this._collection.find(this._getFindSelector(args), this._getFindOptions(args));
      },
      /**
       * @summary Finds the first document that matches the selector, as ordered by sort and skip options. Returns `undefined` if no matching document is found.
       * @locus Anywhere
       * @method findOne
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
       * @returns {Object}
       */
      findOne() {
        for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
          args[_key2] = arguments[_key2];
        }
        return this._collection.findOne(this._getFindSelector(args), this._getFindOptions(args));
      },
      // 'insert' immediately returns the inserted document's new _id.
      // The others return values immediately if you are in a stub, an in-memory
      // unmanaged collection, or a mongo-backed collection and you don't pass a
      // callback. 'update' and 'remove' return the number of affected
      // documents. 'upsert' returns an object with keys 'numberAffected' and, if an
      // insert happened, 'insertedId'.
      //
      // Otherwise, the semantics are exactly like other methods: they take
      // a callback as an optional last argument; if no callback is
      // provided, they block until the operation is complete, and throw an
      // exception if it fails; if a callback is provided, then they don't
      // necessarily block, and they call the callback when they finish with error and
      // result arguments.  (The insert method provides the document ID as its result;
      // update and remove provide the number of affected docs as the result; upsert
      // provides an object with numberAffected and maybe insertedId.)
      //
      // On the client, blocking is impossible, so if a callback
      // isn't provided, they just return immediately and any error
      // information is lost.
      //
      // There's one more tweak. On the client, if you don't provide a
      // callback, then if there is an error, a message will be logged with
      // Meteor._debug.
      //
      // The intent (though this is actually determined by the underlying
      // drivers) is that the operations should be done synchronously, not
      // generating their result until the database has acknowledged
      // them. In the future maybe we should provide a flag to turn this
      // off.

      _insert(doc, callback) {
        // Make sure we were passed a document to insert
        if (!doc) {
          throw new Error('insert requires an argument');
        }

        // Make a shallow clone of the document, preserving its prototype.
        doc = Object.create(Object.getPrototypeOf(doc), Object.getOwnPropertyDescriptors(doc));
        if ('_id' in doc) {
          if (!doc._id || !(typeof doc._id === 'string' || doc._id instanceof Mongo.ObjectID)) {
            throw new Error('Meteor requires document _id fields to be non-empty strings or ObjectIDs');
          }
        } else {
          let generateId = true;

          // Don't generate the id if we're the client and the 'outermost' call
          // This optimization saves us passing both the randomSeed and the id
          // Passing both is redundant.
          if (this._isRemoteCollection()) {
            const enclosing = DDP._CurrentMethodInvocation.get();
            if (!enclosing) {
              generateId = false;
            }
          }
          if (generateId) {
            doc._id = this._makeNewID();
          }
        }

        // On inserts, always return the id that we generated; on all other
        // operations, just return the result from the collection.
        var chooseReturnValueFromCollectionResult = function (result) {
          if (Meteor._isPromise(result)) return result;
          if (doc._id) {
            return doc._id;
          }

          // XXX what is this for??
          // It's some iteraction between the callback to _callMutatorMethod and
          // the return value conversion
          doc._id = result;
          return result;
        };
        const wrappedCallback = wrapCallback(callback, chooseReturnValueFromCollectionResult);
        if (this._isRemoteCollection()) {
          const result = this._callMutatorMethod('insert', [doc], wrappedCallback);
          return chooseReturnValueFromCollectionResult(result);
        }

        // it's my collection.  descend into the collection object
        // and propagate any exception.
        try {
          // If the user provided a callback and the collection implements this
          // operation asynchronously, then queryRet will be undefined, and the
          // result will be returned through the callback instead.
          let result;
          if (!!wrappedCallback) {
            this._collection.insert(doc, wrappedCallback);
          } else {
            // If we don't have the callback, we assume the user is using the promise.
            // We can't just pass this._collection.insert to the promisify because it would lose the context.
            result = this._collection.insert(doc);
          }
          return chooseReturnValueFromCollectionResult(result);
        } catch (e) {
          if (callback) {
            callback(e);
            return null;
          }
          throw e;
        }
      },
      /**
       * @summary Insert a document in the collection.  Returns its unique _id.
       * @locus Anywhere
       * @method  insert
       * @memberof Mongo.Collection
       * @instance
       * @param {Object} doc The document to insert. May not yet have an _id attribute, in which case Meteor will generate one for you.
       * @param {Function} [callback] Optional.  If present, called with an error object as the first argument and, if no error, the _id as the second.
       */
      insert(doc, callback) {
        return this._insert(doc, callback);
      },
      /**
       * @summary Asynchronously modifies one or more documents in the collection. Returns the number of matched documents.
       * @locus Anywhere
       * @method update
       * @memberof Mongo.Collection
       * @instance
       * @param {MongoSelector} selector Specifies which documents to modify
       * @param {MongoModifier} modifier Specifies how to modify the documents
       * @param {Object} [options]
       * @param {Boolean} options.multi True to modify all matching documents; false to only modify one of the matching documents (the default).
       * @param {Boolean} options.upsert True to insert a document if no matching documents are found.
       * @param {Array} options.arrayFilters Optional. Used in combination with MongoDB [filtered positional operator](https://docs.mongodb.com/manual/reference/operator/update/positional-filtered/) to specify which elements to modify in an array field.
       * @param {Function} [callback] Optional.  If present, called with an error object as the first argument and, if no error, the number of affected documents as the second.
       */
      update(selector, modifier) {
        for (var _len3 = arguments.length, optionsAndCallback = new Array(_len3 > 2 ? _len3 - 2 : 0), _key3 = 2; _key3 < _len3; _key3++) {
          optionsAndCallback[_key3 - 2] = arguments[_key3];
        }
        const callback = popCallbackFromArgs(optionsAndCallback);

        // We've already popped off the callback, so we are left with an array
        // of one or zero items
        const options = _objectSpread({}, optionsAndCallback[0] || null);
        let insertedId;
        if (options && options.upsert) {
          // set `insertedId` if absent.  `insertedId` is a Meteor extension.
          if (options.insertedId) {
            if (!(typeof options.insertedId === 'string' || options.insertedId instanceof Mongo.ObjectID)) throw new Error('insertedId must be string or ObjectID');
            insertedId = options.insertedId;
          } else if (!selector || !selector._id) {
            insertedId = this._makeNewID();
            options.generatedId = true;
            options.insertedId = insertedId;
          }
        }
        selector = Mongo.Collection._rewriteSelector(selector, {
          fallbackId: insertedId
        });
        const wrappedCallback = wrapCallback(callback);
        if (this._isRemoteCollection()) {
          const args = [selector, modifier, options];
          return this._callMutatorMethod('update', args, callback);
        }

        // it's my collection.  descend into the collection object
        // and propagate any exception.
        // If the user provided a callback and the collection implements this
        // operation asynchronously, then queryRet will be undefined, and the
        // result will be returned through the callback instead.
        //console.log({callback, options, selector, modifier, coll: this._collection});
        try {
          // If the user provided a callback and the collection implements this
          // operation asynchronously, then queryRet will be undefined, and the
          // result will be returned through the callback instead.
          return this._collection.update(selector, modifier, options, wrappedCallback);
        } catch (e) {
          if (callback) {
            callback(e);
            return null;
          }
          throw e;
        }
      },
      /**
       * @summary Remove documents from the collection
       * @locus Anywhere
       * @method remove
       * @memberof Mongo.Collection
       * @instance
       * @param {MongoSelector} selector Specifies which documents to remove
       * @param {Function} [callback] Optional.  If present, called with an error object as the first argument and, if no error, the number of affected documents as the second.
       */
      remove(selector, callback) {
        selector = Mongo.Collection._rewriteSelector(selector);
        if (this._isRemoteCollection()) {
          return this._callMutatorMethod('remove', [selector], callback);
        }

        // it's my collection.  descend into the collection1 object
        // and propagate any exception.
        return this._collection.remove(selector);
      },
      /**
       * @summary Asynchronously modifies one or more documents in the collection, or insert one if no matching documents were found. Returns an object with keys `numberAffected` (the number of documents modified)  and `insertedId` (the unique _id of the document that was inserted, if any).
       * @locus Anywhere
       * @method upsert
       * @memberof Mongo.Collection
       * @instance
       * @param {MongoSelector} selector Specifies which documents to modify
       * @param {MongoModifier} modifier Specifies how to modify the documents
       * @param {Object} [options]
       * @param {Boolean} options.multi True to modify all matching documents; false to only modify one of the matching documents (the default).
       * @param {Function} [callback] Optional.  If present, called with an error object as the first argument and, if no error, the number of affected documents as the second.
       */
      upsert(selector, modifier, options, callback) {
        if (!callback && typeof options === 'function') {
          callback = options;
          options = {};
        }
        return this.update(selector, modifier, _objectSpread(_objectSpread({}, options), {}, {
          _returnObject: true,
          upsert: true
        }));
      }
    };
    // Convert the callback to not return a result if there is an error
    function wrapCallback(callback, convertResult) {
      return callback && function (error, result) {
        if (error) {
          callback(error);
        } else if (typeof convertResult === 'function') {
          callback(error, convertResult(result));
        } else {
          callback(error, result);
        }
      };
    }
    function popCallbackFromArgs(args) {
      // Pull off any callback (or perhaps a 'callback' variable that was passed
      // in undefined, like how 'upsert' does it).
      if (args.length && (args[args.length - 1] === undefined || args[args.length - 1] instanceof Function)) {
        return args.pop();
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"watch_change_stream.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/collection/watch_change_stream.js                                                                    //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.export({
  watchChangeStream: () => watchChangeStream
});
function watchChangeStream() {
  let pipeline = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
  let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  // Only available on server
  if (typeof Package === 'undefined' || !this.rawCollection) {
    throw new Error('watchChangeStream is only available on server collections');
  }
  const raw = this.rawCollection();
  if (!raw.watch) {
    throw new Error('Underlying collection does not support watch (Change Streams)');
  }
  console.log('[watchChangeStream] Chamando raw.watch() com pipeline:', JSON.stringify(pipeline, null, 2), 'e options:', JSON.stringify(options, null, 2));
  return raw.watch(pipeline, options);
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"connection_options.ts":function module(){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/connection_options.ts                                                                                //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
/**
 * @summary Allows for user specified connection options
 * @example http://mongodb.github.io/node-mongodb-native/3.0/reference/connecting/connection-settings/
 * @locus Server
 * @param {Object} options User specified Mongo connection options
 */
Mongo.setConnectionOptions = function setConnectionOptions(options) {
  check(options, Object);
  Mongo._connectionOptions = options;
};
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"mongo_utils.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/mongo_utils.js                                                                                       //
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
    let _objectWithoutProperties;
    module.link("@babel/runtime/helpers/objectWithoutProperties", {
      default(v) {
        _objectWithoutProperties = v;
      }
    }, 1);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    const _excluded = ["fields", "projection"];
    module.export({
      normalizeProjection: () => normalizeProjection
    });
    const normalizeProjection = options => {
      // transform fields key in projection
      const _ref = options || {},
        {
          fields,
          projection
        } = _ref,
        otherOptions = _objectWithoutProperties(_ref, _excluded);
      // TODO: enable this comment when deprecating the fields option
      // Log.debug(`fields option has been deprecated, please use the new 'projection' instead`)

      return _objectSpread(_objectSpread({}, otherOptions), projection || fields ? {
        projection: fields || projection
      } : {});
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"observe_handle.ts":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/observe_handle.ts                                                                                    //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.export({
  ObserveHandle: () => ObserveHandle
});
let nextObserveHandleId = 1;
/**
 * The "observe handle" returned from observeChanges.
 * Contains a reference to an ObserveMultiplexer.
 * Used to stop observation and clean up resources.
 */
class ObserveHandle {
  constructor(multiplexer, callbacks, nonMutatingCallbacks) {
    this._id = void 0;
    this._multiplexer = void 0;
    this.nonMutatingCallbacks = void 0;
    this._stopped = void 0;
    this.initialAddsSentResolver = () => {};
    this.initialAddsSent = void 0;
    this._added = void 0;
    this._addedBefore = void 0;
    this._changed = void 0;
    this._movedBefore = void 0;
    this._removed = void 0;
    /**
     * Using property syntax and arrow function syntax to avoid binding the wrong context on callbacks.
     */
    this.stop = async () => {
      if (this._stopped) return;
      this._stopped = true;
      await this._multiplexer.removeHandle(this._id);
    };
    this._multiplexer = multiplexer;
    multiplexer.callbackNames().forEach(name => {
      if (callbacks[name]) {
        this["_".concat(name)] = callbacks[name];
        return;
      }
      if (name === "addedBefore" && callbacks.added) {
        this._addedBefore = async function (id, fields, before) {
          await callbacks.added(id, fields);
        };
      }
    });
    this._stopped = false;
    this._id = nextObserveHandleId++;
    this.nonMutatingCallbacks = nonMutatingCallbacks;
    this.initialAddsSent = new Promise(resolve => {
      const ready = () => {
        resolve();
        this.initialAddsSent = Promise.resolve();
      };
      const timeout = setTimeout(ready, 30000);
      this.initialAddsSentResolver = () => {
        ready();
        clearTimeout(timeout);
      };
    });
  }
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"node_modules":{"lodash.isempty":{"package.json":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/mongo/node_modules/lodash.isempty/package.json                                                  //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.exports = {
  "name": "lodash.isempty",
  "version": "4.4.0"
};

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/mongo/node_modules/lodash.isempty/index.js                                                      //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.useNode();
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"lodash.clone":{"package.json":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/mongo/node_modules/lodash.clone/package.json                                                    //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.exports = {
  "name": "lodash.clone",
  "version": "4.5.0"
};

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/mongo/node_modules/lodash.clone/index.js                                                        //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.useNode();
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"lodash.has":{"package.json":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/mongo/node_modules/lodash.has/package.json                                                      //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.exports = {
  "name": "lodash.has",
  "version": "4.5.2"
};

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/mongo/node_modules/lodash.has/index.js                                                          //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.useNode();
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"lodash.throttle":{"package.json":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/mongo/node_modules/lodash.throttle/package.json                                                 //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.exports = {
  "name": "lodash.throttle",
  "version": "4.1.1"
};

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/mongo/node_modules/lodash.throttle/index.js                                                     //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.useNode();
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"mongodb-uri":{"package.json":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/mongo/node_modules/mongodb-uri/package.json                                                     //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.exports = {
  "name": "mongodb-uri",
  "version": "0.9.7",
  "main": "mongodb-uri"
};

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"mongodb-uri.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/mongo/node_modules/mongodb-uri/mongodb-uri.js                                                   //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.useNode();
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"lodash.once":{"package.json":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/mongo/node_modules/lodash.once/package.json                                                     //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.exports = {
  "name": "lodash.once",
  "version": "4.1.1"
};

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/mongo/node_modules/lodash.once/index.js                                                         //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.useNode();
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}}}},{
  "extensions": [
    ".js",
    ".json",
    ".ts"
  ]
});


/* Exports */
return {
  export: function () { return {
      MongoInternals: MongoInternals,
      Mongo: Mongo,
      ObserveMultiplexer: ObserveMultiplexer
    };},
  require: require,
  eagerModulePaths: [
    "/node_modules/meteor/mongo/mongo_driver.js",
    "/node_modules/meteor/mongo/oplog_tailing.ts",
    "/node_modules/meteor/mongo/observe_multiplex.ts",
    "/node_modules/meteor/mongo/doc_fetcher.js",
    "/node_modules/meteor/mongo/polling_observe_driver.ts",
    "/node_modules/meteor/mongo/oplog_observe_driver.js",
    "/node_modules/meteor/mongo/oplog_v2_converter.ts",
    "/node_modules/meteor/mongo/cursor_description.ts",
    "/node_modules/meteor/mongo/mongo_connection.js",
    "/node_modules/meteor/mongo/mongo_common.js",
    "/node_modules/meteor/mongo/asynchronous_cursor.js",
    "/node_modules/meteor/mongo/cursor.ts",
    "/node_modules/meteor/mongo/local_collection_driver.js",
    "/node_modules/meteor/mongo/remote_collection_driver.ts",
    "/node_modules/meteor/mongo/collection/collection.js",
    "/node_modules/meteor/mongo/connection_options.ts"
  ]
}});

//# sourceURL=meteor://💻app/packages/mongo.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvbW9uZ28vbW9uZ29fZHJpdmVyLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9tb25nby9vcGxvZ190YWlsaW5nLnRzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9tb25nby9vYnNlcnZlX211bHRpcGxleC50cyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvbW9uZ28vZG9jX2ZldGNoZXIuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21vbmdvL3BvbGxpbmdfb2JzZXJ2ZV9kcml2ZXIudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21vbmdvL29wbG9nX29ic2VydmVfZHJpdmVyLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9tb25nby9vcGxvZ192Ml9jb252ZXJ0ZXIudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21vbmdvL2N1cnNvcl9kZXNjcmlwdGlvbi50cyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvbW9uZ28vbW9uZ29fY29ubmVjdGlvbi5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvbW9uZ28vbW9uZ29fY29tbW9uLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9tb25nby9hc3luY2hyb25vdXNfY3Vyc29yLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9tb25nby9jdXJzb3IudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21vbmdvL2xvY2FsX2NvbGxlY3Rpb25fZHJpdmVyLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9tb25nby9yZW1vdGVfY29sbGVjdGlvbl9kcml2ZXIudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21vbmdvL2NvbGxlY3Rpb24vY29sbGVjdGlvbi5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvbW9uZ28vY29sbGVjdGlvbi9jb2xsZWN0aW9uX3V0aWxzLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9tb25nby9jb2xsZWN0aW9uL21ldGhvZHNfYXN5bmMuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21vbmdvL2NvbGxlY3Rpb24vbWV0aG9kc19pbmRleC5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvbW9uZ28vY29sbGVjdGlvbi9tZXRob2RzX3JlcGxpY2F0aW9uLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9tb25nby9jb2xsZWN0aW9uL21ldGhvZHNfc3luYy5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvbW9uZ28vY29sbGVjdGlvbi93YXRjaF9jaGFuZ2Vfc3RyZWFtLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9tb25nby9jb25uZWN0aW9uX29wdGlvbnMudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21vbmdvL21vbmdvX3V0aWxzLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9tb25nby9vYnNlcnZlX2hhbmRsZS50cyJdLCJuYW1lcyI6WyJtb2R1bGUxIiwiZXhwb3J0IiwibGlzdGVuQWxsIiwiZm9yRWFjaFRyaWdnZXIiLCJPcGxvZ0hhbmRsZSIsImxpbmsiLCJ2IiwiTW9uZ29Db25uZWN0aW9uIiwiT3Bsb2dPYnNlcnZlRHJpdmVyIiwiTW9uZ29EQiIsIl9fcmVpZnlXYWl0Rm9yRGVwc19fIiwiTW9uZ29JbnRlcm5hbHMiLCJnbG9iYWwiLCJfX3BhY2thZ2VOYW1lIiwiTnBtTW9kdWxlcyIsIm1vbmdvZGIiLCJ2ZXJzaW9uIiwiTnBtTW9kdWxlTW9uZ29kYlZlcnNpb24iLCJtb2R1bGUiLCJOcG1Nb2R1bGUiLCJQcm94eSIsImdldCIsInRhcmdldCIsInByb3BlcnR5S2V5IiwicmVjZWl2ZXIiLCJNZXRlb3IiLCJkZXByZWNhdGUiLCJSZWZsZWN0IiwiQ29ubmVjdGlvbiIsIlRpbWVzdGFtcCIsInByb3RvdHlwZSIsImNsb25lIiwiY3Vyc29yRGVzY3JpcHRpb24iLCJsaXN0ZW5DYWxsYmFjayIsImxpc3RlbmVycyIsInRyaWdnZXIiLCJwdXNoIiwiRERQU2VydmVyIiwiX0ludmFsaWRhdGlvbkNyb3NzYmFyIiwibGlzdGVuIiwic3RvcCIsImZvckVhY2giLCJsaXN0ZW5lciIsInRyaWdnZXJDYWxsYmFjayIsImtleSIsImNvbGxlY3Rpb24iLCJjb2xsZWN0aW9uTmFtZSIsInNwZWNpZmljSWRzIiwiTG9jYWxDb2xsZWN0aW9uIiwiX2lkc01hdGNoZWRCeVNlbGVjdG9yIiwic2VsZWN0b3IiLCJpZCIsIk9iamVjdCIsImFzc2lnbiIsImRyb3BDb2xsZWN0aW9uIiwiZHJvcERhdGFiYXNlIiwiTW9uZ29UaW1lc3RhbXAiLCJfX3JlaWZ5X2FzeW5jX3Jlc3VsdF9fIiwiX3JlaWZ5RXJyb3IiLCJzZWxmIiwiYXN5bmMiLCJPUExPR19DT0xMRUNUSU9OIiwiaWRGb3JPcCIsImlzRW1wdHkiLCJkZWZhdWx0IiwiQ3Vyc29yRGVzY3JpcHRpb24iLCJOcG1Nb2R1bGVNb25nb2RiIiwiTG9uZyIsIlRPT19GQVJfQkVISU5EIiwicHJvY2VzcyIsImVudiIsIk1FVEVPUl9PUExPR19UT09fRkFSX0JFSElORCIsIlRBSUxfVElNRU9VVCIsIk1FVEVPUl9PUExPR19UQUlMX1RJTUVPVVQiLCJjb25zdHJ1Y3RvciIsIm9wbG9nVXJsIiwiZGJOYW1lIiwiX01ldGVvciRzZXR0aW5ncyIsIl9NZXRlb3Ikc2V0dGluZ3MkcGFjayIsIl9NZXRlb3Ikc2V0dGluZ3MkcGFjazIiLCJfTWV0ZW9yJHNldHRpbmdzMiIsIl9NZXRlb3Ikc2V0dGluZ3MyJHBhYyIsIl9NZXRlb3Ikc2V0dGluZ3MyJHBhYzIiLCJfb3Bsb2dVcmwiLCJfZGJOYW1lIiwiX29wbG9nTGFzdEVudHJ5Q29ubmVjdGlvbiIsIl9vcGxvZ1RhaWxDb25uZWN0aW9uIiwiX29wbG9nT3B0aW9ucyIsIl9zdG9wcGVkIiwiX3RhaWxIYW5kbGUiLCJfcmVhZHlQcm9taXNlUmVzb2x2ZXIiLCJfcmVhZHlQcm9taXNlIiwiX2Nyb3NzYmFyIiwiX2NhdGNoaW5nVXBSZXNvbHZlcnMiLCJfbGFzdFByb2Nlc3NlZFRTIiwiX29uU2tpcHBlZEVudHJpZXNIb29rIiwiX3N0YXJ0VHJhaWxpbmdQcm9taXNlIiwiX3Jlc29sdmVUaW1lb3V0IiwiX2VudHJ5UXVldWUiLCJfRG91YmxlRW5kZWRRdWV1ZSIsIl93b3JrZXJBY3RpdmUiLCJfd29ya2VyUHJvbWlzZSIsIlByb21pc2UiLCJyIiwiX0Nyb3NzYmFyIiwiZmFjdFBhY2thZ2UiLCJmYWN0TmFtZSIsImluY2x1ZGVDb2xsZWN0aW9ucyIsInNldHRpbmdzIiwicGFja2FnZXMiLCJtb25nbyIsIm9wbG9nSW5jbHVkZUNvbGxlY3Rpb25zIiwiZXhjbHVkZUNvbGxlY3Rpb25zIiwib3Bsb2dFeGNsdWRlQ29sbGVjdGlvbnMiLCJsZW5ndGgiLCJFcnJvciIsIkhvb2siLCJkZWJ1Z1ByaW50RXhjZXB0aW9ucyIsIl9zdGFydFRhaWxpbmciLCJfZ2V0T3Bsb2dTZWxlY3RvciIsImxhc3RQcm9jZXNzZWRUUyIsIl90aGlzJF9vcGxvZ09wdGlvbnMkZSIsIl90aGlzJF9vcGxvZ09wdGlvbnMkaSIsIm9wbG9nQ3JpdGVyaWEiLCIkb3IiLCJvcCIsIiRpbiIsIiRleGlzdHMiLCJuc1JlZ2V4IiwiUmVnRXhwIiwiX2VzY2FwZVJlZ0V4cCIsImpvaW4iLCJucyIsIiRyZWdleCIsIiRuaW4iLCJtYXAiLCJjb2xsTmFtZSIsImNvbmNhdCIsInRzIiwiJGd0IiwiJGFuZCIsIl9vbk9wbG9nRW50cnkiLCJjYWxsYmFjayIsIm9yaWdpbmFsQ2FsbGJhY2siLCJiaW5kRW52aXJvbm1lbnQiLCJub3RpZmljYXRpb24iLCJlcnIiLCJfZGVidWciLCJsaXN0ZW5IYW5kbGUiLCJvbk9wbG9nRW50cnkiLCJvblNraXBwZWRFbnRyaWVzIiwicmVnaXN0ZXIiLCJfd2FpdFVudGlsQ2F1Z2h0VXAiLCJsYXN0RW50cnkiLCJvcGxvZ1NlbGVjdG9yIiwiZmluZE9uZUFzeW5jIiwicHJvamVjdGlvbiIsInNvcnQiLCIkbmF0dXJhbCIsImUiLCJzbGVlcCIsIkpTT04iLCJzdHJpbmdpZnkiLCJsZXNzVGhhbk9yRXF1YWwiLCJpbnNlcnRBZnRlciIsImdyZWF0ZXJUaGFuIiwicHJvbWlzZVJlc29sdmVyIiwicHJvbWlzZVRvQXdhaXQiLCJjbGVhclRpbWVvdXQiLCJzZXRUaW1lb3V0IiwiY29uc29sZSIsImVycm9yIiwic3BsaWNlIiwicmVzb2x2ZXIiLCJ3YWl0VW50aWxDYXVnaHRVcCIsIm1vbmdvZGJVcmkiLCJyZXF1aXJlIiwicGFyc2UiLCJkYXRhYmFzZSIsIm1heFBvb2xTaXplIiwibWluUG9vbFNpemUiLCJpc01hc3RlckRvYyIsImRiIiwiYWRtaW4iLCJjb21tYW5kIiwiaXNtYXN0ZXIiLCJzZXROYW1lIiwibGFzdE9wbG9nRW50cnkiLCJ0YWlsYWJsZSIsInRhaWwiLCJkb2MiLCJfbWF5YmVTdGFydFdvcmtlciIsInBvcCIsImNsZWFyIiwiZWFjaCIsIl9zZXRMYXN0UHJvY2Vzc2VkVFMiLCJzaGlmdCIsImhhbmRsZURvYyIsInNlcXVlbmNlciIsIl9kZWZpbmVUb29GYXJCZWhpbmQiLCJ2YWx1ZSIsIl9yZXNldFRvb0ZhckJlaGluZCIsIm8iLCJfaWQiLCJvMiIsImhhbmRsZSIsImFwcGx5T3BzIiwibmV4dFRpbWVzdGFtcCIsImFkZCIsIk9ORSIsInN0YXJ0c1dpdGgiLCJzbGljZSIsImRyb3AiLCJmaXJlIiwicmVzb2x2ZSIsInNldEltbWVkaWF0ZSIsIl9vYmplY3RXaXRob3V0UHJvcGVydGllcyIsIl9leGNsdWRlZCIsIk9ic2VydmVNdWx0aXBsZXhlciIsIl9yZWYiLCJfdGhpcyIsIm9yZGVyZWQiLCJvblN0b3AiLCJfb3JkZXJlZCIsIl9vblN0b3AiLCJfcXVldWUiLCJfaGFuZGxlcyIsIl9yZXNvbHZlciIsIl9pc1JlYWR5IiwiX2NhY2hlIiwiX2FkZEhhbmRsZVRhc2tzU2NoZWR1bGVkQnV0Tm90UGVyZm9ybWVkIiwidW5kZWZpbmVkIiwiUGFja2FnZSIsIkZhY3RzIiwiaW5jcmVtZW50U2VydmVyRmFjdCIsIl9Bc3luY2hyb25vdXNRdWV1ZSIsInRoZW4iLCJfQ2FjaGluZ0NoYW5nZU9ic2VydmVyIiwiY2FsbGJhY2tOYW1lcyIsImNhbGxiYWNrTmFtZSIsIl9sZW4iLCJhcmd1bWVudHMiLCJhcmdzIiwiQXJyYXkiLCJfa2V5IiwiX2FwcGx5Q2FsbGJhY2siLCJhZGRIYW5kbGVBbmRTZW5kSW5pdGlhbEFkZHMiLCJfYWRkSGFuZGxlQW5kU2VuZEluaXRpYWxBZGRzIiwicnVuVGFzayIsIl9zZW5kQWRkcyIsInJlbW92ZUhhbmRsZSIsIl9yZWFkeSIsIl9zdG9wIiwib3B0aW9ucyIsImZyb21RdWVyeUVycm9yIiwicmVhZHkiLCJxdWV1ZVRhc2siLCJxdWVyeUVycm9yIiwib25GbHVzaCIsImNiIiwiYXBwbHlDaGFuZ2UiLCJhcHBseSIsImhhbmRsZUlkIiwia2V5cyIsImluaXRpYWxBZGRzU2VudCIsIm5vbk11dGF0aW5nQ2FsbGJhY2tzIiwiRUpTT04iLCJfYWRkZWRCZWZvcmUiLCJfYWRkZWQiLCJhZGRQcm9taXNlcyIsImRvY3MiLCJfcmVmMiIsImZpZWxkcyIsInByb21pc2UiLCJhbGwiLCJpbml0aWFsQWRkc1NlbnRSZXNvbHZlciIsIkRvY0ZldGNoZXIiLCJtb25nb0Nvbm5lY3Rpb24iLCJfbW9uZ29Db25uZWN0aW9uIiwiX2NhbGxiYWNrc0Zvck9wIiwiTWFwIiwiZmV0Y2giLCJjaGVjayIsIlN0cmluZyIsImhhcyIsImNhbGxiYWNrcyIsInNldCIsImRlbGV0ZSIsIlBvbGxpbmdPYnNlcnZlRHJpdmVyIiwidGhyb3R0bGUiLCJQT0xMSU5HX1RIUk9UVExFX01TIiwiTUVURU9SX1BPTExJTkdfVEhST1RUTEVfTVMiLCJQT0xMSU5HX0lOVEVSVkFMX01TIiwiTUVURU9SX1BPTExJTkdfSU5URVJWQUxfTVMiLCJfb3B0aW9ucyIsIl9jdXJzb3JEZXNjcmlwdGlvbiIsIl9tb25nb0hhbmRsZSIsIl9tdWx0aXBsZXhlciIsIl9zdG9wQ2FsbGJhY2tzIiwiX2N1cnNvciIsIl9yZXN1bHRzIiwiX3BvbGxzU2NoZWR1bGVkQnV0Tm90U3RhcnRlZCIsIl9wZW5kaW5nV3JpdGVzIiwiX2Vuc3VyZVBvbGxJc1NjaGVkdWxlZCIsIl90YXNrUXVldWUiLCJfdGVzdE9ubHlQb2xsQ2FsbGJhY2siLCJtb25nb0hhbmRsZSIsIm11bHRpcGxleGVyIiwiX2NyZWF0ZUFzeW5jaHJvbm91c0N1cnNvciIsIl91bnRocm90dGxlZEVuc3VyZVBvbGxJc1NjaGVkdWxlZCIsImJpbmQiLCJwb2xsaW5nVGhyb3R0bGVNcyIsIl9pbml0IiwiX1BhY2thZ2UkZmFjdHNCYXNlIiwibGlzdGVuZXJzSGFuZGxlIiwiZmVuY2UiLCJfZ2V0Q3VycmVudEZlbmNlIiwiYmVnaW5Xcml0ZSIsInBvbGxpbmdJbnRlcnZhbCIsInBvbGxpbmdJbnRlcnZhbE1zIiwiX3BvbGxpbmdJbnRlcnZhbCIsImludGVydmFsSGFuZGxlIiwic2V0SW50ZXJ2YWwiLCJjbGVhckludGVydmFsIiwiX3BvbGxNb25nbyIsIl9zdXNwZW5kUG9sbGluZyIsIl9yZXN1bWVQb2xsaW5nIiwiX3RoaXMkX3Rlc3RPbmx5UG9sbENhIiwiZmlyc3QiLCJuZXdSZXN1bHRzIiwib2xkUmVzdWx0cyIsIl9JZE1hcCIsImNhbGwiLCJ3cml0ZXNGb3JDeWNsZSIsImdldFJhd09iamVjdHMiLCJjb2RlIiwibWVzc2FnZSIsIl9kaWZmUXVlcnlDaGFuZ2VzIiwidyIsImNvbW1pdHRlZCIsIl9QYWNrYWdlJGZhY3RzQmFzZTIiLCJfYXN5bmNJdGVyYXRvciIsIm9wbG9nVjJWMUNvbnZlcnRlciIsIk1hdGNoIiwiQ3Vyc29yIiwiUEhBU0UiLCJRVUVSWUlORyIsIkZFVENISU5HIiwiU1RFQURZIiwiU3dpdGNoZWRUb1F1ZXJ5IiwiZmluaXNoSWZOZWVkVG9Qb2xsUXVlcnkiLCJmIiwiY3VycmVudElkIiwiX3VzZXNPcGxvZyIsInNvcnRlciIsImNvbXBhcmF0b3IiLCJnZXRDb21wYXJhdG9yIiwibGltaXQiLCJoZWFwT3B0aW9ucyIsIklkTWFwIiwiX2xpbWl0IiwiX2NvbXBhcmF0b3IiLCJfc29ydGVyIiwiX3VucHVibGlzaGVkQnVmZmVyIiwiTWluTWF4SGVhcCIsIl9wdWJsaXNoZWQiLCJNYXhIZWFwIiwiX3NhZmVBcHBlbmRUb0J1ZmZlciIsIl9zdG9wSGFuZGxlcyIsIl9hZGRTdG9wSGFuZGxlcyIsIm5ld1N0b3BIYW5kbGVzIiwiZXhwZWN0ZWRQYXR0ZXJuIiwiT2JqZWN0SW5jbHVkaW5nIiwiRnVuY3Rpb24iLCJPbmVPZiIsIl9yZWdpc3RlclBoYXNlQ2hhbmdlIiwiX21hdGNoZXIiLCJtYXRjaGVyIiwiX3Byb2plY3Rpb25GbiIsIl9jb21waWxlUHJvamVjdGlvbiIsIl9zaGFyZWRQcm9qZWN0aW9uIiwiY29tYmluZUludG9Qcm9qZWN0aW9uIiwiX3NoYXJlZFByb2plY3Rpb25GbiIsIl9uZWVkVG9GZXRjaCIsIl9jdXJyZW50bHlGZXRjaGluZyIsIl9mZXRjaEdlbmVyYXRpb24iLCJfcmVxdWVyeVdoZW5Eb25lVGhpc1F1ZXJ5IiwiX3dyaXRlc1RvQ29tbWl0V2hlbldlUmVhY2hTdGVhZHkiLCJfb3Bsb2dIYW5kbGUiLCJfbmVlZFRvUG9sbFF1ZXJ5IiwiX3BoYXNlIiwiX2hhbmRsZU9wbG9nRW50cnlRdWVyeWluZyIsIl9oYW5kbGVPcGxvZ0VudHJ5U3RlYWR5T3JGZXRjaGluZyIsImZpcmVkIiwiX29wbG9nT2JzZXJ2ZURyaXZlcnMiLCJvbkJlZm9yZUZpcmUiLCJkcml2ZXJzIiwiZHJpdmVyIiwidmFsdWVzIiwid3JpdGUiLCJfb25GYWlsb3ZlciIsIl9ydW5Jbml0aWFsUXVlcnkiLCJfYWRkUHVibGlzaGVkIiwiX25vWWllbGRzQWxsb3dlZCIsImFkZGVkIiwic2l6ZSIsIm92ZXJmbG93aW5nRG9jSWQiLCJtYXhFbGVtZW50SWQiLCJvdmVyZmxvd2luZ0RvYyIsImVxdWFscyIsInJlbW92ZSIsInJlbW92ZWQiLCJfYWRkQnVmZmVyZWQiLCJfcmVtb3ZlUHVibGlzaGVkIiwiZW1wdHkiLCJuZXdEb2NJZCIsIm1pbkVsZW1lbnRJZCIsIm5ld0RvYyIsIl9yZW1vdmVCdWZmZXJlZCIsIl9jaGFuZ2VQdWJsaXNoZWQiLCJvbGREb2MiLCJwcm9qZWN0ZWROZXciLCJwcm9qZWN0ZWRPbGQiLCJjaGFuZ2VkIiwiRGlmZlNlcXVlbmNlIiwibWFrZUNoYW5nZWRGaWVsZHMiLCJtYXhCdWZmZXJlZElkIiwiX2FkZE1hdGNoaW5nIiwibWF4UHVibGlzaGVkIiwibWF4QnVmZmVyZWQiLCJ0b1B1Ymxpc2giLCJjYW5BcHBlbmRUb0J1ZmZlciIsImNhbkluc2VydEludG9CdWZmZXIiLCJ0b0J1ZmZlciIsIl9yZW1vdmVNYXRjaGluZyIsIl9oYW5kbGVEb2MiLCJtYXRjaGVzTm93IiwiZG9jdW1lbnRNYXRjaGVzIiwicmVzdWx0IiwicHVibGlzaGVkQmVmb3JlIiwiYnVmZmVyZWRCZWZvcmUiLCJjYWNoZWRCZWZvcmUiLCJtaW5CdWZmZXJlZCIsInN0YXlzSW5QdWJsaXNoZWQiLCJzdGF5c0luQnVmZmVyIiwiX2ZldGNoTW9kaWZpZWREb2N1bWVudHMiLCJkZWZlciIsInRoaXNHZW5lcmF0aW9uIiwiZmV0Y2hQcm9taXNlcyIsImZldGNoUHJvbWlzZSIsInJlamVjdCIsIl9kb2NGZXRjaGVyIiwicmVzdWx0cyIsImFsbFNldHRsZWQiLCJlcnJvcnMiLCJmaWx0ZXIiLCJzdGF0dXMiLCJyZWFzb24iLCJfYmVTdGVhZHkiLCJ3cml0ZXMiLCJpc1JlcGxhY2UiLCJjYW5EaXJlY3RseU1vZGlmeURvYyIsIm1vZGlmaWVyQ2FuQmVEaXJlY3RseUFwcGxpZWQiLCJfbW9kaWZ5IiwibmFtZSIsImNhbkJlY29tZVRydWVCeU1vZGlmaWVyIiwiYWZmZWN0ZWRCeU1vZGlmaWVyIiwiX3J1bkluaXRpYWxRdWVyeUFzeW5jIiwiX3J1blF1ZXJ5IiwiaW5pdGlhbCIsIl9kb25lUXVlcnlpbmciLCJfcG9sbFF1ZXJ5IiwiX3J1blF1ZXJ5QXN5bmMiLCJuZXdCdWZmZXIiLCJjdXJzb3IiLCJfY3Vyc29yRm9yUXVlcnkiLCJpIiwiX3NsZWVwRm9yTXMiLCJfcHVibGlzaE5ld1Jlc3VsdHMiLCJvcHRpb25zT3ZlcndyaXRlIiwidHJhbnNmb3JtIiwiZGVzY3JpcHRpb24iLCJpZHNUb1JlbW92ZSIsIl9vcGxvZ0VudHJ5SGFuZGxlIiwiX2xpc3RlbmVyc0hhbmRsZSIsIl9pdGVyYXRvckFicnVwdENvbXBsZXRpb24iLCJfZGlkSXRlcmF0b3JFcnJvciIsIl9pdGVyYXRvckVycm9yIiwiX2l0ZXJhdG9yIiwiX3N0ZXAiLCJuZXh0IiwiZG9uZSIsInJldHVybiIsInBoYXNlIiwibm93IiwiRGF0ZSIsInRpbWVEaWZmIiwiX3BoYXNlU3RhcnRUaW1lIiwiY3Vyc29yU3VwcG9ydGVkIiwiZGlzYWJsZU9wbG9nIiwiX2Rpc2FibGVPcGxvZyIsInNraXAiLCJfY2hlY2tTdXBwb3J0ZWRQcm9qZWN0aW9uIiwiaGFzV2hlcmUiLCJoYXNHZW9RdWVyeSIsIm1vZGlmaWVyIiwiZW50cmllcyIsImV2ZXJ5Iiwib3BlcmF0aW9uIiwiZmllbGQiLCJ0ZXN0IiwiYXJyYXlPcGVyYXRvcktleVJlZ2V4IiwiaXNBcnJheU9wZXJhdG9yS2V5IiwiaXNBcnJheU9wZXJhdG9yIiwib3BlcmF0b3IiLCJhIiwicHJlZml4IiwiZmxhdHRlbk9iamVjdEludG8iLCJzb3VyY2UiLCJpc0FycmF5IiwiTW9uZ28iLCJPYmplY3RJRCIsIl9pc0N1c3RvbVR5cGUiLCJjb252ZXJ0T3Bsb2dEaWZmIiwib3Bsb2dFbnRyeSIsImRpZmYiLCJkaWZmS2V5IiwiX29wbG9nRW50cnkkJHVuc2V0IiwiJHVuc2V0IiwiX29wbG9nRW50cnkkJHNldCIsIiRzZXQiLCJfb3Bsb2dFbnRyeSQkc2V0MiIsIl9yZWYzIiwiZmllbGRWYWx1ZSIsIl9yZWY0IiwicG9zaXRpb24iLCJwb3NpdGlvbktleSIsIl9vcGxvZ0VudHJ5JCR1bnNldDIiLCJfb3Bsb2dFbnRyeSQkc2V0MyIsIiR2IiwiY29udmVydGVkT3Bsb2dFbnRyeSIsIkNvbGxlY3Rpb24iLCJfcmV3cml0ZVNlbGVjdG9yIiwiX29iamVjdFNwcmVhZCIsIkNMSUVOVF9PTkxZX01FVEhPRFMiLCJnZXRBc3luY01ldGhvZE5hbWUiLCJwYXRoIiwiQXN5bmNocm9ub3VzQ3Vyc29yIiwicmVwbGFjZU1ldGVvckF0b21XaXRoTW9uZ28iLCJyZXBsYWNlVHlwZXMiLCJ0cmFuc2Zvcm1SZXN1bHQiLCJPYnNlcnZlSGFuZGxlIiwiRklMRV9BU1NFVF9TVUZGSVgiLCJBU1NFVFNfRk9MREVSIiwiQVBQX0ZPTERFUiIsIm9wbG9nQ29sbGVjdGlvbldhcm5pbmdzIiwidXJsIiwiX29ic2VydmVNdWx0aXBsZXhlcnMiLCJfb25GYWlsb3Zlckhvb2siLCJ1c2VyT3B0aW9ucyIsIl9jb25uZWN0aW9uT3B0aW9ucyIsIm1vbmdvT3B0aW9ucyIsImlnbm9yZVVuZGVmaW5lZCIsImVuZHNXaXRoIiwib3B0aW9uTmFtZSIsInJlcGxhY2UiLCJBc3NldHMiLCJnZXRTZXJ2ZXJEaXIiLCJkcml2ZXJJbmZvIiwicmVsZWFzZSIsImNsaWVudCIsIk1vbmdvQ2xpZW50Iiwib24iLCJldmVudCIsInByZXZpb3VzRGVzY3JpcHRpb24iLCJ0eXBlIiwibmV3RGVzY3JpcHRpb24iLCJkYXRhYmFzZU5hbWUiLCJfY2xvc2UiLCJvcGxvZ0hhbmRsZSIsImNsb3NlIiwiX3NldE9wbG9nSGFuZGxlIiwicmF3Q29sbGVjdGlvbiIsImNyZWF0ZUNhcHBlZENvbGxlY3Rpb25Bc3luYyIsImJ5dGVTaXplIiwibWF4RG9jdW1lbnRzIiwiY3JlYXRlQ29sbGVjdGlvbiIsImNhcHBlZCIsIm1heCIsIl9tYXliZUJlZ2luV3JpdGUiLCJpbnNlcnRBc3luYyIsImNvbGxlY3Rpb25fbmFtZSIsImRvY3VtZW50IiwiX2V4cGVjdGVkQnlUZXN0IiwiX2lzUGxhaW5PYmplY3QiLCJyZWZyZXNoIiwiaW5zZXJ0T25lIiwic2FmZSIsImluc2VydGVkSWQiLCJjYXRjaCIsIl9yZWZyZXNoIiwicmVmcmVzaEtleSIsInJlbW92ZUFzeW5jIiwiZGVsZXRlTWFueSIsImRlbGV0ZWRDb3VudCIsIm1vZGlmaWVkQ291bnQiLCJudW1iZXJBZmZlY3RlZCIsImRyb3BDb2xsZWN0aW9uQXN5bmMiLCJkcm9wRGF0YWJhc2VBc3luYyIsIl9kcm9wRGF0YWJhc2UiLCJ1cGRhdGVBc3luYyIsIm1vZCIsIm1vbmdvT3B0cyIsImFycmF5RmlsdGVycyIsInVwc2VydCIsIm11bHRpIiwiZnVsbFJlc3VsdCIsIm1vbmdvU2VsZWN0b3IiLCJtb25nb01vZCIsImlzTW9kaWZ5IiwiX2lzTW9kaWZpY2F0aW9uTW9kIiwiX2ZvcmJpZFJlcGxhY2UiLCJrbm93bklkIiwiX2NyZWF0ZVVwc2VydERvY3VtZW50IiwiZ2VuZXJhdGVkSWQiLCJzaW11bGF0ZVVwc2VydFdpdGhJbnNlcnRlZElkIiwiX3JldHVybk9iamVjdCIsImhhc093blByb3BlcnR5IiwiJHNldE9uSW5zZXJ0Iiwic3RyaW5ncyIsInVwZGF0ZU1ldGhvZCIsIm1ldGVvclJlc3VsdCIsIk9iamVjdElkIiwidG9IZXhTdHJpbmciLCJfaXNDYW5ub3RDaGFuZ2VJZEVycm9yIiwiZXJybXNnIiwiaW5kZXhPZiIsInVwc2VydEFzeW5jIiwiZmluZCIsImNyZWF0ZUluZGV4QXN5bmMiLCJpbmRleCIsImNyZWF0ZUluZGV4IiwiY291bnREb2N1bWVudHMiLCJhcmciLCJlc3RpbWF0ZWREb2N1bWVudENvdW50IiwiX2xlbjIiLCJfa2V5MiIsImVuc3VyZUluZGV4QXN5bmMiLCJkcm9wSW5kZXhBc3luYyIsImluZGV4TmFtZSIsImRyb3BJbmRleCIsIm0iLCJOVU1fT1BUSU1JU1RJQ19UUklFUyIsIm1vbmdvT3B0c0ZvclVwZGF0ZSIsIm1vbmdvT3B0c0Zvckluc2VydCIsInJlcGxhY2VtZW50V2l0aElkIiwidHJpZXMiLCJkb1VwZGF0ZSIsIm1ldGhvZCIsInVwZGF0ZU1hbnkiLCJzb21lIiwicmVwbGFjZU9uZSIsInVwc2VydGVkQ291bnQiLCJ1cHNlcnRlZElkIiwiZG9Db25kaXRpb25hbEluc2VydCIsIl9vYnNlcnZlQ2hhbmdlc1RhaWxhYmxlIiwiYWRkZWRCZWZvcmUiLCJzZWxmRm9ySXRlcmF0aW9uIiwidXNlVHJhbnNmb3JtIiwiY3Vyc29yT3B0aW9ucyIsInJlYWRQcmVmZXJlbmNlIiwibnVtYmVyT2ZSZXRyaWVzIiwiZGJDdXJzb3IiLCJhZGRDdXJzb3JGbGFnIiwibWF4VGltZU1zIiwibWF4VGltZU1TIiwiaGludCIsImRvY0NhbGxiYWNrIiwidGltZW91dE1TIiwic3RvcHBlZCIsImxhc3RUUyIsImxvb3AiLCJfbmV4dE9iamVjdFByb21pc2VXaXRoVGltZW91dCIsIm5ld1NlbGVjdG9yIiwiX29ic2VydmVDaGFuZ2VzIiwiX3NlbGYkX29wbG9nSGFuZGxlIiwiZmllbGRzT3B0aW9ucyIsIm9ic2VydmVLZXkiLCJvYnNlcnZlRHJpdmVyIiwiZmlyc3RIYW5kbGUiLCJvYnNlcnZlSGFuZGxlIiwib3Bsb2dPcHRpb25zIiwiY2FuVXNlT3Bsb2ciLCJpbmNsdWRlcyIsIndhcm4iLCJNaW5pbW9uZ28iLCJNYXRjaGVyIiwiU29ydGVyIiwiZHJpdmVyQ2xhc3MiLCJfb2JzZXJ2ZURyaXZlciIsIndyaXRlQ2FsbGJhY2siLCJyZXBsYWNlTW9uZ29BdG9tV2l0aE1ldGVvciIsInJlcGxhY2VOYW1lcyIsInJlZnJlc2hFcnIiLCJkcml2ZXJSZXN1bHQiLCJtb25nb1Jlc3VsdCIsIm4iLCJtYXRjaGVkQ291bnQiLCJpc0JpbmFyeSIsIkJpbmFyeSIsIkJ1ZmZlciIsImZyb20iLCJEZWNpbWFsIiwiRGVjaW1hbDEyOCIsImZyb21TdHJpbmciLCJ0b1N0cmluZyIsIm1ha2VNb25nb0xlZ2FsIiwidG9KU09OVmFsdWUiLCJhdG9tVHJhbnNmb3JtZXIiLCJyZXBsYWNlZFRvcExldmVsQXRvbSIsInJldCIsInZhbCIsInZhbFJlcGxhY2VkIiwic3ViX3R5cGUiLCJidWZmZXIiLCJVaW50OEFycmF5IiwiZnJvbUpTT05WYWx1ZSIsInVubWFrZU1vbmdvTGVnYWwiLCJzdWJzdHIiLCJ0aGluZyIsIl9kYkN1cnNvciIsIl9zZWxmRm9ySXRlcmF0aW9uIiwiX3RyYW5zZm9ybSIsIndyYXBUcmFuc2Zvcm0iLCJfdmlzaXRlZElkcyIsIlN5bWJvbCIsImFzeW5jSXRlcmF0b3IiLCJfbmV4dE9iamVjdFByb21pc2UiLCJfcmF3TmV4dE9iamVjdFByb21pc2UiLCJuZXh0T2JqZWN0UHJvbWlzZSIsInRpbWVvdXRFcnIiLCJ0aW1lb3V0UHJvbWlzZSIsInJhY2UiLCJ0aGlzQXJnIiwiX3Jld2luZCIsImlkeCIsInJld2luZCIsImNvdW50IiwiQVNZTkNfQ1VSU09SX01FVEhPRFMiLCJfbW9uZ28iLCJfc3luY2hyb25vdXNDdXJzb3IiLCJjb3VudEFzeW5jIiwiZ2V0VHJhbnNmb3JtIiwiX3B1Ymxpc2hDdXJzb3IiLCJzdWIiLCJfZ2V0Q29sbGVjdGlvbk5hbWUiLCJvYnNlcnZlIiwiX29ic2VydmVGcm9tT2JzZXJ2ZUNoYW5nZXMiLCJvYnNlcnZlQXN5bmMiLCJvYnNlcnZlQ2hhbmdlcyIsIl9vYnNlcnZlQ2hhbmdlc0NhbGxiYWNrc0FyZU9yZGVyZWQiLCJvYnNlcnZlQ2hhbmdlc0FzeW5jIiwiaXRlcmF0b3IiLCJtZXRob2ROYW1lIiwic2V0dXBBc3luY2hyb25vdXNDdXJzb3IiLCJtZXRob2ROYW1lQXN5bmMiLCJMb2NhbENvbGxlY3Rpb25Ecml2ZXIiLCJub0Nvbm5Db2xsZWN0aW9ucyIsImNyZWF0ZSIsIm9wZW4iLCJjb25uIiwiZW5zdXJlQ29sbGVjdGlvbiIsIl9tb25nb19saXZlZGF0YV9jb2xsZWN0aW9ucyIsImNvbGxlY3Rpb25zIiwiUmVtb3RlQ29sbGVjdGlvbkRyaXZlciIsIm9uY2UiLCJBU1lOQ19DT0xMRUNUSU9OX01FVEhPRFMiLCJtb25nb1VybCIsIlJFTU9URV9DT0xMRUNUSU9OX01FVEhPRFMiLCJtb25nb01ldGhvZCIsImFzeW5jTWV0aG9kTmFtZSIsImRlZmF1bHRSZW1vdGVDb2xsZWN0aW9uRHJpdmVyIiwiY29ubmVjdGlvbk9wdGlvbnMiLCJNT05HT19VUkwiLCJNT05HT19PUExPR19VUkwiLCJzdGFydHVwIiwiY29ubmVjdCIsIm5vcm1hbGl6ZVByb2plY3Rpb24iLCJBc3luY01ldGhvZHMiLCJTeW5jTWV0aG9kcyIsIkluZGV4TWV0aG9kcyIsIklEX0dFTkVSQVRPUlMiLCJub3JtYWxpemVPcHRpb25zIiwic2V0dXBBdXRvcHVibGlzaCIsInNldHVwQ29ubmVjdGlvbiIsInNldHVwRHJpdmVyIiwic2V0dXBNdXRhdGlvbk1ldGhvZHMiLCJ2YWxpZGF0ZUNvbGxlY3Rpb25OYW1lIiwiUmVwbGljYXRpb25NZXRob2RzIiwid2F0Y2hDaGFuZ2VTdHJlYW0iLCJfSURfR0VORVJBVE9SUyRvcHRpb24iLCJfSURfR0VORVJBVE9SUyIsIl9tYWtlTmV3SUQiLCJpZEdlbmVyYXRpb24iLCJyZXNvbHZlclR5cGUiLCJfY29ubmVjdGlvbiIsIl9kcml2ZXIiLCJfY29sbGVjdGlvbiIsIl9uYW1lIiwiX3NldHRpbmdVcFJlcGxpY2F0aW9uUHJvbWlzZSIsIl9tYXliZVNldFVwUmVwbGljYXRpb24iLCJfY29sbGVjdGlvbnMiLCJfZ2V0RmluZFNlbGVjdG9yIiwiX2dldEZpbmRPcHRpb25zIiwibmV3T3B0aW9ucyIsIk9wdGlvbmFsIiwiTnVtYmVyIiwiZmFsbGJhY2tJZCIsIl9zZWxlY3RvcklzSWQiLCJSYW5kb20iLCJfaXNSZW1vdGVDb2xsZWN0aW9uIiwic2VydmVyIiwicmF3RGF0YWJhc2UiLCJnZXRDb2xsZWN0aW9uIiwiTW9uZ29JRCIsIkFsbG93RGVueSIsIkNvbGxlY3Rpb25Qcm90b3R5cGUiLCJNT05HTyIsInNyYyIsIkREUCIsInJhbmRvbVN0cmVhbSIsImluc2VjdXJlIiwiaGV4U3RyaW5nIiwiU1RSSU5HIiwiY29ubmVjdGlvbiIsImlzQ2xpZW50IiwiYXV0b3B1Ymxpc2giLCJfcHJldmVudEF1dG9wdWJsaXNoIiwicHVibGlzaCIsImlzX2F1dG8iLCJkZWZpbmVNdXRhdGlvbk1ldGhvZHMiLCJfZGVmaW5lTXV0YXRpb25NZXRob2RzIiwidXNlRXhpc3RpbmciLCJfc3VwcHJlc3NTYW1lTmFtZUVycm9yIiwibWV0aG9kcyIsIm1hbmFnZXIiLCJfaW5zZXJ0QXN5bmMiLCJnZXRQcm90b3R5cGVPZiIsImdldE93blByb3BlcnR5RGVzY3JpcHRvcnMiLCJnZW5lcmF0ZUlkIiwiZW5jbG9zaW5nIiwiX0N1cnJlbnRNZXRob2RJbnZvY2F0aW9uIiwiY2hvb3NlUmV0dXJuVmFsdWVGcm9tQ29sbGVjdGlvblJlc3VsdCIsIl9pc1Byb21pc2UiLCJfY2FsbE11dGF0b3JNZXRob2RBc3luYyIsInN0dWJQcm9taXNlIiwic2VydmVyUHJvbWlzZSIsIkxvZyIsImRlYnVnIiwicmVDcmVhdGVJbmRleE9uT3B0aW9uTWlzbWF0Y2giLCJpbmZvIiwiX3JlZ2lzdGVyU3RvcmVSZXN1bHQiLCJfcmVnaXN0ZXJTdG9yZVJlc3VsdCQiLCJyZWdpc3RlclN0b3JlQ2xpZW50IiwicmVnaXN0ZXJTdG9yZVNlcnZlciIsIndyYXBwZWRTdG9yZUNvbW1vbiIsInNhdmVPcmlnaW5hbHMiLCJyZXRyaWV2ZU9yaWdpbmFscyIsIl9nZXRDb2xsZWN0aW9uIiwid3JhcHBlZFN0b3JlQ2xpZW50IiwiYmVnaW5VcGRhdGUiLCJiYXRjaFNpemUiLCJyZXNldCIsInBhdXNlT2JzZXJ2ZXJzIiwidXBkYXRlIiwibXNnIiwibW9uZ29JZCIsImlkUGFyc2UiLCJfZG9jcyIsImluc2VydCIsImVuZFVwZGF0ZSIsInJlc3VtZU9ic2VydmVyc0NsaWVudCIsImdldERvYyIsImZpbmRPbmUiLCJ3cmFwcGVkU3RvcmVTZXJ2ZXIiLCJyZXN1bWVPYnNlcnZlcnNTZXJ2ZXIiLCJyZWdpc3RlclN0b3JlUmVzdWx0IiwibG9nV2FybiIsImxvZyIsIm9rIiwiX2luc2VydCIsIndyYXBwZWRDYWxsYmFjayIsIndyYXBDYWxsYmFjayIsIl9jYWxsTXV0YXRvck1ldGhvZCIsIl9sZW4zIiwib3B0aW9uc0FuZENhbGxiYWNrIiwiX2tleTMiLCJwb3BDYWxsYmFja0Zyb21BcmdzIiwiY29udmVydFJlc3VsdCIsInBpcGVsaW5lIiwicmF3Iiwid2F0Y2giLCJzZXRDb25uZWN0aW9uT3B0aW9ucyIsIm90aGVyT3B0aW9ucyIsIm5leHRPYnNlcnZlSGFuZGxlSWQiLCJfY2hhbmdlZCIs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dGVudCI6WyJpbXBvcnQgeyBPcGxvZ0hhbmRsZSB9IGZyb20gJy4vb3Bsb2dfdGFpbGluZyc7XG5pbXBvcnQgeyBNb25nb0Nvbm5lY3Rpb24gfSBmcm9tICcuL21vbmdvX2Nvbm5lY3Rpb24nO1xuaW1wb3J0IHsgT3Bsb2dPYnNlcnZlRHJpdmVyIH0gZnJvbSAnLi9vcGxvZ19vYnNlcnZlX2RyaXZlcic7XG5pbXBvcnQgeyBNb25nb0RCIH0gZnJvbSAnLi9tb25nb19jb21tb24nO1xuXG5Nb25nb0ludGVybmFscyA9IGdsb2JhbC5Nb25nb0ludGVybmFscyA9IHt9O1xuXG5Nb25nb0ludGVybmFscy5fX3BhY2thZ2VOYW1lID0gJ21vbmdvJztcblxuTW9uZ29JbnRlcm5hbHMuTnBtTW9kdWxlcyA9IHtcbiAgbW9uZ29kYjoge1xuICAgIHZlcnNpb246IE5wbU1vZHVsZU1vbmdvZGJWZXJzaW9uLFxuICAgIG1vZHVsZTogTW9uZ29EQlxuICB9XG59O1xuXG4vLyBPbGRlciB2ZXJzaW9uIG9mIHdoYXQgaXMgbm93IGF2YWlsYWJsZSB2aWFcbi8vIE1vbmdvSW50ZXJuYWxzLk5wbU1vZHVsZXMubW9uZ29kYi5tb2R1bGUuICBJdCB3YXMgbmV2ZXIgZG9jdW1lbnRlZCwgYnV0XG4vLyBwZW9wbGUgZG8gdXNlIGl0LlxuLy8gWFhYIENPTVBBVCBXSVRIIDEuMC4zLjJcbk1vbmdvSW50ZXJuYWxzLk5wbU1vZHVsZSA9IG5ldyBQcm94eShNb25nb0RCLCB7XG4gIGdldCh0YXJnZXQsIHByb3BlcnR5S2V5LCByZWNlaXZlcikge1xuICAgIGlmIChwcm9wZXJ0eUtleSA9PT0gJ09iamVjdElEJykge1xuICAgICAgTWV0ZW9yLmRlcHJlY2F0ZShcbiAgICAgICAgYEFjY2Vzc2luZyAnTW9uZ29JbnRlcm5hbHMuTnBtTW9kdWxlLk9iamVjdElEJyBkaXJlY3RseSBpcyBkZXByZWNhdGVkLiBgICtcbiAgICAgICAgYFVzZSAnTW9uZ29JbnRlcm5hbHMuTnBtTW9kdWxlLk9iamVjdElkJyBpbnN0ZWFkLmBcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBSZWZsZWN0LmdldCh0YXJnZXQsIHByb3BlcnR5S2V5LCByZWNlaXZlcik7XG4gIH0sXG59KTtcblxuTW9uZ29JbnRlcm5hbHMuT3Bsb2dIYW5kbGUgPSBPcGxvZ0hhbmRsZTtcblxuTW9uZ29JbnRlcm5hbHMuQ29ubmVjdGlvbiA9IE1vbmdvQ29ubmVjdGlvbjtcblxuTW9uZ29JbnRlcm5hbHMuT3Bsb2dPYnNlcnZlRHJpdmVyID0gT3Bsb2dPYnNlcnZlRHJpdmVyO1xuXG4vLyBUaGlzIGlzIHVzZWQgdG8gYWRkIG9yIHJlbW92ZSBFSlNPTiBmcm9tIHRoZSBiZWdpbm5pbmcgb2YgZXZlcnl0aGluZyBuZXN0ZWRcbi8vIGluc2lkZSBhbiBFSlNPTiBjdXN0b20gdHlwZS4gSXQgc2hvdWxkIG9ubHkgYmUgY2FsbGVkIG9uIHB1cmUgSlNPTiFcblxuXG4vLyBFbnN1cmUgdGhhdCBFSlNPTi5jbG9uZSBrZWVwcyBhIFRpbWVzdGFtcCBhcyBhIFRpbWVzdGFtcCAoaW5zdGVhZCBvZiBqdXN0XG4vLyBkb2luZyBhIHN0cnVjdHVyYWwgY2xvbmUpLlxuLy8gWFhYIGhvdyBvayBpcyB0aGlzPyB3aGF0IGlmIHRoZXJlIGFyZSBtdWx0aXBsZSBjb3BpZXMgb2YgTW9uZ29EQiBsb2FkZWQ/XG5Nb25nb0RCLlRpbWVzdGFtcC5wcm90b3R5cGUuY2xvbmUgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIFRpbWVzdGFtcHMgc2hvdWxkIGJlIGltbXV0YWJsZS5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vLyBMaXN0ZW4gZm9yIHRoZSBpbnZhbGlkYXRpb24gbWVzc2FnZXMgdGhhdCB3aWxsIHRyaWdnZXIgdXMgdG8gcG9sbCB0aGVcbi8vIGRhdGFiYXNlIGZvciBjaGFuZ2VzLiBJZiB0aGlzIHNlbGVjdG9yIHNwZWNpZmllcyBzcGVjaWZpYyBJRHMsIHNwZWNpZnkgdGhlbVxuLy8gaGVyZSwgc28gdGhhdCB1cGRhdGVzIHRvIGRpZmZlcmVudCBzcGVjaWZpYyBJRHMgZG9uJ3QgY2F1c2UgdXMgdG8gcG9sbC5cbi8vIGxpc3RlbkNhbGxiYWNrIGlzIHRoZSBzYW1lIGtpbmQgb2YgKG5vdGlmaWNhdGlvbiwgY29tcGxldGUpIGNhbGxiYWNrIHBhc3NlZFxuLy8gdG8gSW52YWxpZGF0aW9uQ3Jvc3NiYXIubGlzdGVuLlxuXG5leHBvcnQgY29uc3QgbGlzdGVuQWxsID0gYXN5bmMgZnVuY3Rpb24gKGN1cnNvckRlc2NyaXB0aW9uLCBsaXN0ZW5DYWxsYmFjaykge1xuICBjb25zdCBsaXN0ZW5lcnMgPSBbXTtcbiAgYXdhaXQgZm9yRWFjaFRyaWdnZXIoY3Vyc29yRGVzY3JpcHRpb24sIGZ1bmN0aW9uICh0cmlnZ2VyKSB7XG4gICAgbGlzdGVuZXJzLnB1c2goRERQU2VydmVyLl9JbnZhbGlkYXRpb25Dcm9zc2Jhci5saXN0ZW4oXG4gICAgICB0cmlnZ2VyLCBsaXN0ZW5DYWxsYmFjaykpO1xuICB9KTtcblxuICByZXR1cm4ge1xuICAgIHN0b3A6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGxpc3RlbmVycy5mb3JFYWNoKGZ1bmN0aW9uIChsaXN0ZW5lcikge1xuICAgICAgICBsaXN0ZW5lci5zdG9wKCk7XG4gICAgICB9KTtcbiAgICB9XG4gIH07XG59O1xuXG5leHBvcnQgY29uc3QgZm9yRWFjaFRyaWdnZXIgPSBhc3luYyBmdW5jdGlvbiAoY3Vyc29yRGVzY3JpcHRpb24sIHRyaWdnZXJDYWxsYmFjaykge1xuICBjb25zdCBrZXkgPSB7Y29sbGVjdGlvbjogY3Vyc29yRGVzY3JpcHRpb24uY29sbGVjdGlvbk5hbWV9O1xuICBjb25zdCBzcGVjaWZpY0lkcyA9IExvY2FsQ29sbGVjdGlvbi5faWRzTWF0Y2hlZEJ5U2VsZWN0b3IoXG4gICAgY3Vyc29yRGVzY3JpcHRpb24uc2VsZWN0b3IpO1xuICBpZiAoc3BlY2lmaWNJZHMpIHtcbiAgICBmb3IgKGNvbnN0IGlkIG9mIHNwZWNpZmljSWRzKSB7XG4gICAgICBhd2FpdCB0cmlnZ2VyQ2FsbGJhY2soT2JqZWN0LmFzc2lnbih7aWQ6IGlkfSwga2V5KSk7XG4gICAgfVxuICAgIGF3YWl0IHRyaWdnZXJDYWxsYmFjayhPYmplY3QuYXNzaWduKHtkcm9wQ29sbGVjdGlvbjogdHJ1ZSwgaWQ6IG51bGx9LCBrZXkpKTtcbiAgfSBlbHNlIHtcbiAgICBhd2FpdCB0cmlnZ2VyQ2FsbGJhY2soa2V5KTtcbiAgfVxuICAvLyBFdmVyeW9uZSBjYXJlcyBhYm91dCB0aGUgZGF0YWJhc2UgYmVpbmcgZHJvcHBlZC5cbiAgYXdhaXQgdHJpZ2dlckNhbGxiYWNrKHsgZHJvcERhdGFiYXNlOiB0cnVlIH0pO1xufTtcblxuXG5cbi8vIFhYWCBXZSBwcm9iYWJseSBuZWVkIHRvIGZpbmQgYSBiZXR0ZXIgd2F5IHRvIGV4cG9zZSB0aGlzLiBSaWdodCBub3dcbi8vIGl0J3Mgb25seSB1c2VkIGJ5IHRlc3RzLCBidXQgaW4gZmFjdCB5b3UgbmVlZCBpdCBpbiBub3JtYWxcbi8vIG9wZXJhdGlvbiB0byBpbnRlcmFjdCB3aXRoIGNhcHBlZCBjb2xsZWN0aW9ucy5cbk1vbmdvSW50ZXJuYWxzLk1vbmdvVGltZXN0YW1wID0gTW9uZ29EQi5UaW1lc3RhbXA7XG4iLCJpbXBvcnQgaXNFbXB0eSBmcm9tICdsb2Rhc2guaXNlbXB0eSc7XG5pbXBvcnQgeyBNZXRlb3IgfSBmcm9tICdtZXRlb3IvbWV0ZW9yJztcbmltcG9ydCB7IEN1cnNvckRlc2NyaXB0aW9uIH0gZnJvbSAnLi9jdXJzb3JfZGVzY3JpcHRpb24nO1xuaW1wb3J0IHsgTW9uZ29Db25uZWN0aW9uIH0gZnJvbSAnLi9tb25nb19jb25uZWN0aW9uJztcblxuaW1wb3J0IHsgTnBtTW9kdWxlTW9uZ29kYiB9IGZyb20gXCJtZXRlb3IvbnBtLW1vbmdvXCI7XG5jb25zdCB7IExvbmcgfSA9IE5wbU1vZHVsZU1vbmdvZGI7XG5cbmV4cG9ydCBjb25zdCBPUExPR19DT0xMRUNUSU9OID0gJ29wbG9nLnJzJztcblxubGV0IFRPT19GQVJfQkVISU5EID0gKyhwcm9jZXNzLmVudi5NRVRFT1JfT1BMT0dfVE9PX0ZBUl9CRUhJTkQgfHwgMjAwMCk7XG5jb25zdCBUQUlMX1RJTUVPVVQgPSArKHByb2Nlc3MuZW52Lk1FVEVPUl9PUExPR19UQUlMX1RJTUVPVVQgfHwgMzAwMDApO1xuXG5leHBvcnQgaW50ZXJmYWNlIE9wbG9nRW50cnkge1xuICBvcDogc3RyaW5nO1xuICBvOiBhbnk7XG4gIG8yPzogYW55O1xuICB0czogYW55O1xuICBuczogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENhdGNoaW5nVXBSZXNvbHZlciB7XG4gIHRzOiBhbnk7XG4gIHJlc29sdmVyOiAoKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE9wbG9nVHJpZ2dlciB7XG4gIGRyb3BDb2xsZWN0aW9uOiBib29sZWFuO1xuICBkcm9wRGF0YWJhc2U6IGJvb2xlYW47XG4gIG9wOiBPcGxvZ0VudHJ5O1xuICBjb2xsZWN0aW9uPzogc3RyaW5nO1xuICBpZD86IHN0cmluZyB8IG51bGw7XG59XG5cbmV4cG9ydCBjbGFzcyBPcGxvZ0hhbmRsZSB7XG4gIHByaXZhdGUgX29wbG9nVXJsOiBzdHJpbmc7XG4gIHB1YmxpYyBfZGJOYW1lOiBzdHJpbmc7XG4gIHByaXZhdGUgX29wbG9nTGFzdEVudHJ5Q29ubmVjdGlvbjogTW9uZ29Db25uZWN0aW9uIHwgbnVsbDtcbiAgcHJpdmF0ZSBfb3Bsb2dUYWlsQ29ubmVjdGlvbjogTW9uZ29Db25uZWN0aW9uIHwgbnVsbDtcbiAgcHJpdmF0ZSBfb3Bsb2dPcHRpb25zOiB7XG4gICAgZXhjbHVkZUNvbGxlY3Rpb25zPzogc3RyaW5nW107XG4gICAgaW5jbHVkZUNvbGxlY3Rpb25zPzogc3RyaW5nW107XG4gIH07XG4gIHByaXZhdGUgX3N0b3BwZWQ6IGJvb2xlYW47XG4gIHByaXZhdGUgX3RhaWxIYW5kbGU6IGFueTtcbiAgcHJpdmF0ZSBfcmVhZHlQcm9taXNlUmVzb2x2ZXI6ICgoKSA9PiB2b2lkKSB8IG51bGw7XG4gIHByaXZhdGUgX3JlYWR5UHJvbWlzZTogUHJvbWlzZTx2b2lkPjtcbiAgcHVibGljIF9jcm9zc2JhcjogYW55O1xuICBwcml2YXRlIF9jYXRjaGluZ1VwUmVzb2x2ZXJzOiBDYXRjaGluZ1VwUmVzb2x2ZXJbXTtcbiAgcHJpdmF0ZSBfbGFzdFByb2Nlc3NlZFRTOiBhbnk7XG4gIHByaXZhdGUgX29uU2tpcHBlZEVudHJpZXNIb29rOiBhbnk7XG4gIHByaXZhdGUgX3N0YXJ0VHJhaWxpbmdQcm9taXNlOiBQcm9taXNlPHZvaWQ+O1xuICBwcml2YXRlIF9yZXNvbHZlVGltZW91dDogYW55O1xuXG4gIHByaXZhdGUgX2VudHJ5UXVldWUgPSBuZXcgTWV0ZW9yLl9Eb3VibGVFbmRlZFF1ZXVlKCk7XG4gIHByaXZhdGUgX3dvcmtlckFjdGl2ZSA9IGZhbHNlO1xuICBwcml2YXRlIF93b3JrZXJQcm9taXNlOiBQcm9taXNlPHZvaWQ+IHwgbnVsbCA9IG51bGw7XG5cbiAgY29uc3RydWN0b3Iob3Bsb2dVcmw6IHN0cmluZywgZGJOYW1lOiBzdHJpbmcpIHtcbiAgICB0aGlzLl9vcGxvZ1VybCA9IG9wbG9nVXJsO1xuICAgIHRoaXMuX2RiTmFtZSA9IGRiTmFtZTtcblxuICAgIHRoaXMuX3Jlc29sdmVUaW1lb3V0ID0gbnVsbDtcbiAgICB0aGlzLl9vcGxvZ0xhc3RFbnRyeUNvbm5lY3Rpb24gPSBudWxsO1xuICAgIHRoaXMuX29wbG9nVGFpbENvbm5lY3Rpb24gPSBudWxsO1xuICAgIHRoaXMuX3N0b3BwZWQgPSBmYWxzZTtcbiAgICB0aGlzLl90YWlsSGFuZGxlID0gbnVsbDtcbiAgICB0aGlzLl9yZWFkeVByb21pc2VSZXNvbHZlciA9IG51bGw7XG4gICAgdGhpcy5fcmVhZHlQcm9taXNlID0gbmV3IFByb21pc2UociA9PiB0aGlzLl9yZWFkeVByb21pc2VSZXNvbHZlciA9IHIpOyBcbiAgICB0aGlzLl9jcm9zc2JhciA9IG5ldyBERFBTZXJ2ZXIuX0Nyb3NzYmFyKHtcbiAgICAgIGZhY3RQYWNrYWdlOiBcIm1vbmdvLWxpdmVkYXRhXCIsIGZhY3ROYW1lOiBcIm9wbG9nLXdhdGNoZXJzXCJcbiAgICB9KTtcblxuICAgIGNvbnN0IGluY2x1ZGVDb2xsZWN0aW9ucyA9XG4gICAgICBNZXRlb3Iuc2V0dGluZ3M/LnBhY2thZ2VzPy5tb25nbz8ub3Bsb2dJbmNsdWRlQ29sbGVjdGlvbnM7XG4gICAgY29uc3QgZXhjbHVkZUNvbGxlY3Rpb25zID1cbiAgICAgIE1ldGVvci5zZXR0aW5ncz8ucGFja2FnZXM/Lm1vbmdvPy5vcGxvZ0V4Y2x1ZGVDb2xsZWN0aW9ucztcbiAgICBpZiAoaW5jbHVkZUNvbGxlY3Rpb25zPy5sZW5ndGggJiYgZXhjbHVkZUNvbGxlY3Rpb25zPy5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgXCJDYW4ndCB1c2UgYm90aCBtb25nbyBvcGxvZyBzZXR0aW5ncyBvcGxvZ0luY2x1ZGVDb2xsZWN0aW9ucyBhbmQgb3Bsb2dFeGNsdWRlQ29sbGVjdGlvbnMgYXQgdGhlIHNhbWUgdGltZS5cIlxuICAgICAgKTtcbiAgICB9XG4gICAgdGhpcy5fb3Bsb2dPcHRpb25zID0geyBpbmNsdWRlQ29sbGVjdGlvbnMsIGV4Y2x1ZGVDb2xsZWN0aW9ucyB9O1xuXG4gICAgdGhpcy5fY2F0Y2hpbmdVcFJlc29sdmVycyA9IFtdO1xuICAgIHRoaXMuX2xhc3RQcm9jZXNzZWRUUyA9IG51bGw7XG5cbiAgICB0aGlzLl9vblNraXBwZWRFbnRyaWVzSG9vayA9IG5ldyBIb29rKHtcbiAgICAgIGRlYnVnUHJpbnRFeGNlcHRpb25zOiBcIm9uU2tpcHBlZEVudHJpZXMgY2FsbGJhY2tcIlxuICAgIH0pO1xuXG4gICAgdGhpcy5fc3RhcnRUcmFpbGluZ1Byb21pc2UgPSB0aGlzLl9zdGFydFRhaWxpbmcoKTtcbiAgfVxuXG4gIHByaXZhdGUgX2dldE9wbG9nU2VsZWN0b3IobGFzdFByb2Nlc3NlZFRTPzogYW55KTogYW55IHtcbiAgICBjb25zdCBvcGxvZ0NyaXRlcmlhOiBhbnkgPSBbXG4gICAgICB7XG4gICAgICAgICRvcjogW1xuICAgICAgICAgIHsgb3A6IHsgJGluOiBbXCJpXCIsIFwidVwiLCBcImRcIl0gfSB9LFxuICAgICAgICAgIHsgb3A6IFwiY1wiLCBcIm8uZHJvcFwiOiB7ICRleGlzdHM6IHRydWUgfSB9LFxuICAgICAgICAgIHsgb3A6IFwiY1wiLCBcIm8uZHJvcERhdGFiYXNlXCI6IDEgfSxcbiAgICAgICAgICB7IG9wOiBcImNcIiwgXCJvLmFwcGx5T3BzXCI6IHsgJGV4aXN0czogdHJ1ZSB9IH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgIF07XG5cbiAgICBjb25zdCBuc1JlZ2V4ID0gbmV3IFJlZ0V4cChcbiAgICAgIFwiXig/OlwiICtcbiAgICAgICAgW1xuICAgICAgICAgIC8vIEB0cy1pZ25vcmVcbiAgICAgICAgICBNZXRlb3IuX2VzY2FwZVJlZ0V4cCh0aGlzLl9kYk5hbWUgKyBcIi5cIiksXG4gICAgICAgICAgLy8gQHRzLWlnbm9yZVxuICAgICAgICAgIE1ldGVvci5fZXNjYXBlUmVnRXhwKFwiYWRtaW4uJGNtZFwiKSxcbiAgICAgICAgXS5qb2luKFwifFwiKSArXG4gICAgICAgIFwiKVwiXG4gICAgKTtcblxuICAgIGlmICh0aGlzLl9vcGxvZ09wdGlvbnMuZXhjbHVkZUNvbGxlY3Rpb25zPy5sZW5ndGgpIHtcbiAgICAgIG9wbG9nQ3JpdGVyaWEucHVzaCh7XG4gICAgICAgIG5zOiB7XG4gICAgICAgICAgJHJlZ2V4OiBuc1JlZ2V4LFxuICAgICAgICAgICRuaW46IHRoaXMuX29wbG9nT3B0aW9ucy5leGNsdWRlQ29sbGVjdGlvbnMubWFwKFxuICAgICAgICAgICAgKGNvbGxOYW1lOiBzdHJpbmcpID0+IGAke3RoaXMuX2RiTmFtZX0uJHtjb2xsTmFtZX1gXG4gICAgICAgICAgKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0gZWxzZSBpZiAodGhpcy5fb3Bsb2dPcHRpb25zLmluY2x1ZGVDb2xsZWN0aW9ucz8ubGVuZ3RoKSB7XG4gICAgICBvcGxvZ0NyaXRlcmlhLnB1c2goe1xuICAgICAgICAkb3I6IFtcbiAgICAgICAgICB7IG5zOiAvXmFkbWluXFwuXFwkY21kLyB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIG5zOiB7XG4gICAgICAgICAgICAgICRpbjogdGhpcy5fb3Bsb2dPcHRpb25zLmluY2x1ZGVDb2xsZWN0aW9ucy5tYXAoXG4gICAgICAgICAgICAgICAgKGNvbGxOYW1lOiBzdHJpbmcpID0+IGAke3RoaXMuX2RiTmFtZX0uJHtjb2xsTmFtZX1gXG4gICAgICAgICAgICAgICksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgb3Bsb2dDcml0ZXJpYS5wdXNoKHtcbiAgICAgICAgbnM6IG5zUmVnZXgsXG4gICAgICB9KTtcbiAgICB9XG4gICAgaWYobGFzdFByb2Nlc3NlZFRTKSB7XG4gICAgICBvcGxvZ0NyaXRlcmlhLnB1c2goe1xuICAgICAgICB0czogeyAkZ3Q6IGxhc3RQcm9jZXNzZWRUUyB9LFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICRhbmQ6IG9wbG9nQ3JpdGVyaWEsXG4gICAgfTtcbiAgfVxuXG4gIGFzeW5jIHN0b3AoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuX3N0b3BwZWQpIHJldHVybjtcbiAgICB0aGlzLl9zdG9wcGVkID0gdHJ1ZTtcbiAgICBpZiAodGhpcy5fdGFpbEhhbmRsZSkge1xuICAgICAgYXdhaXQgdGhpcy5fdGFpbEhhbmRsZS5zdG9wKCk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgX29uT3Bsb2dFbnRyeSh0cmlnZ2VyOiBPcGxvZ1RyaWdnZXIsIGNhbGxiYWNrOiBGdW5jdGlvbik6IFByb21pc2U8eyBzdG9wOiAoKSA9PiBQcm9taXNlPHZvaWQ+IH0+IHtcbiAgICBpZiAodGhpcy5fc3RvcHBlZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FsbGVkIG9uT3Bsb2dFbnRyeSBvbiBzdG9wcGVkIGhhbmRsZSFcIik7XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5fcmVhZHlQcm9taXNlO1xuXG4gICAgY29uc3Qgb3JpZ2luYWxDYWxsYmFjayA9IGNhbGxiYWNrO1xuXG4gICAgLyoqXG4gICAgICogVGhpcyBkZXBlbmRzIG9uIEFzeW5jaHJvbm91c1F1ZXVlIHRhc2tzIGJlaW5nIHdyYXBwZWQgaW4gYGJpbmRFbnZpcm9ubWVudGAgdG9vLlxuICAgICAqXG4gICAgICogQHRvZG8gQ2hlY2sgYWZ0ZXIgd2Ugc2ltcGxpZnkgdGhlIGBiaW5kRW52aXJvbm1lbnRgIGltcGxlbWVudGF0aW9uIGlmIHdlIGNhbiByZW1vdmUgdGhlIHNlY29uZCB3cmFwLlxuICAgICAqL1xuICAgIGNhbGxiYWNrID0gTWV0ZW9yLmJpbmRFbnZpcm9ubWVudChcbiAgICAgIGZ1bmN0aW9uIChub3RpZmljYXRpb246IGFueSkge1xuICAgICAgICBvcmlnaW5hbENhbGxiYWNrKG5vdGlmaWNhdGlvbik7XG4gICAgICB9LFxuICAgICAgLy8gQHRzLWlnbm9yZVxuICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICBNZXRlb3IuX2RlYnVnKFwiRXJyb3IgaW4gb3Bsb2cgY2FsbGJhY2tcIiwgZXJyKTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgY29uc3QgbGlzdGVuSGFuZGxlID0gdGhpcy5fY3Jvc3NiYXIubGlzdGVuKHRyaWdnZXIsIGNhbGxiYWNrKTtcbiAgICByZXR1cm4ge1xuICAgICAgc3RvcDogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgICAgICBhd2FpdCBsaXN0ZW5IYW5kbGUuc3RvcCgpO1xuICAgICAgfVxuICAgIH07XG4gIH1cblxuICBvbk9wbG9nRW50cnkodHJpZ2dlcjogT3Bsb2dUcmlnZ2VyLCBjYWxsYmFjazogRnVuY3Rpb24pOiBQcm9taXNlPHsgc3RvcDogKCkgPT4gUHJvbWlzZTx2b2lkPiB9PiB7XG4gICAgcmV0dXJuIHRoaXMuX29uT3Bsb2dFbnRyeSh0cmlnZ2VyLCBjYWxsYmFjayk7XG4gIH1cblxuICBvblNraXBwZWRFbnRyaWVzKGNhbGxiYWNrOiBGdW5jdGlvbik6IHsgc3RvcDogKCkgPT4gdm9pZCB9IHtcbiAgICBpZiAodGhpcy5fc3RvcHBlZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FsbGVkIG9uU2tpcHBlZEVudHJpZXMgb24gc3RvcHBlZCBoYW5kbGUhXCIpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fb25Ta2lwcGVkRW50cmllc0hvb2sucmVnaXN0ZXIoY2FsbGJhY2spO1xuICB9XG5cbiAgYXN5bmMgX3dhaXRVbnRpbENhdWdodFVwKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLl9zdG9wcGVkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYWxsZWQgd2FpdFVudGlsQ2F1Z2h0VXAgb24gc3RvcHBlZCBoYW5kbGUhXCIpO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuX3JlYWR5UHJvbWlzZTtcblxuICAgIGxldCBsYXN0RW50cnk6IE9wbG9nRW50cnkgfCBudWxsID0gbnVsbDtcblxuICAgIHdoaWxlICghdGhpcy5fc3RvcHBlZCkge1xuICAgICAgY29uc3Qgb3Bsb2dTZWxlY3RvciA9IHRoaXMuX2dldE9wbG9nU2VsZWN0b3IoKTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGxhc3RFbnRyeSA9IGF3YWl0IHRoaXMuX29wbG9nTGFzdEVudHJ5Q29ubmVjdGlvbi5maW5kT25lQXN5bmMoXG4gICAgICAgICAgT1BMT0dfQ09MTEVDVElPTixcbiAgICAgICAgICBvcGxvZ1NlbGVjdG9yLFxuICAgICAgICAgIHsgcHJvamVjdGlvbjogeyB0czogMSB9LCBzb3J0OiB7ICRuYXR1cmFsOiAtMSB9IH1cbiAgICAgICAgKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIE1ldGVvci5fZGVidWcoXCJHb3QgZXhjZXB0aW9uIHdoaWxlIHJlYWRpbmcgbGFzdCBlbnRyeVwiLCBlKTtcbiAgICAgICAgLy8gQHRzLWlnbm9yZVxuICAgICAgICBhd2FpdCBNZXRlb3Iuc2xlZXAoMTAwKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodGhpcy5fc3RvcHBlZCkgcmV0dXJuO1xuXG4gICAgaWYgKCFsYXN0RW50cnkpIHJldHVybjtcblxuICAgIGNvbnN0IHRzID0gbGFzdEVudHJ5LnRzO1xuICAgIGlmICghdHMpIHtcbiAgICAgIHRocm93IEVycm9yKFwib3Bsb2cgZW50cnkgd2l0aG91dCB0czogXCIgKyBKU09OLnN0cmluZ2lmeShsYXN0RW50cnkpKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5fbGFzdFByb2Nlc3NlZFRTICYmIHRzLmxlc3NUaGFuT3JFcXVhbCh0aGlzLl9sYXN0UHJvY2Vzc2VkVFMpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbGV0IGluc2VydEFmdGVyID0gdGhpcy5fY2F0Y2hpbmdVcFJlc29sdmVycy5sZW5ndGg7XG5cbiAgICB3aGlsZSAoaW5zZXJ0QWZ0ZXIgLSAxID4gMCAmJiB0aGlzLl9jYXRjaGluZ1VwUmVzb2x2ZXJzW2luc2VydEFmdGVyIC0gMV0udHMuZ3JlYXRlclRoYW4odHMpKSB7XG4gICAgICBpbnNlcnRBZnRlci0tO1xuICAgIH1cblxuICAgIGxldCBwcm9taXNlUmVzb2x2ZXIgPSBudWxsO1xuXG4gICAgY29uc3QgcHJvbWlzZVRvQXdhaXQgPSBuZXcgUHJvbWlzZShyID0+IHByb21pc2VSZXNvbHZlciA9IHIpO1xuXG4gICAgY2xlYXJUaW1lb3V0KHRoaXMuX3Jlc29sdmVUaW1lb3V0KTtcblxuICAgIHRoaXMuX3Jlc29sdmVUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiTWV0ZW9yOiBvcGxvZyBjYXRjaGluZyB1cCB0b29rIHRvbyBsb25nXCIsIHsgdHMgfSk7XG4gICAgfSwgMTAwMDApO1xuXG4gICAgdGhpcy5fY2F0Y2hpbmdVcFJlc29sdmVycy5zcGxpY2UoaW5zZXJ0QWZ0ZXIsIDAsIHsgdHMsIHJlc29sdmVyOiBwcm9taXNlUmVzb2x2ZXIhIH0pO1xuXG4gICAgYXdhaXQgcHJvbWlzZVRvQXdhaXQ7XG5cbiAgICBjbGVhclRpbWVvdXQodGhpcy5fcmVzb2x2ZVRpbWVvdXQpO1xuICB9XG5cbiAgYXN5bmMgd2FpdFVudGlsQ2F1Z2h0VXAoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRoaXMuX3dhaXRVbnRpbENhdWdodFVwKCk7XG4gIH1cblxuICBhc3luYyBfc3RhcnRUYWlsaW5nKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IG1vbmdvZGJVcmkgPSByZXF1aXJlKCdtb25nb2RiLXVyaScpO1xuICAgIGlmIChtb25nb2RiVXJpLnBhcnNlKHRoaXMuX29wbG9nVXJsKS5kYXRhYmFzZSAhPT0gJ2xvY2FsJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiJE1PTkdPX09QTE9HX1VSTCBtdXN0IGJlIHNldCB0byB0aGUgJ2xvY2FsJyBkYXRhYmFzZSBvZiBhIE1vbmdvIHJlcGxpY2Egc2V0XCIpO1xuICAgIH1cblxuICAgIHRoaXMuX29wbG9nVGFpbENvbm5lY3Rpb24gPSBuZXcgTW9uZ29Db25uZWN0aW9uKFxuICAgICAgdGhpcy5fb3Bsb2dVcmwsIHsgbWF4UG9vbFNpemU6IDEsIG1pblBvb2xTaXplOiAxIH1cbiAgICApO1xuICAgIHRoaXMuX29wbG9nTGFzdEVudHJ5Q29ubmVjdGlvbiA9IG5ldyBNb25nb0Nvbm5lY3Rpb24oXG4gICAgICB0aGlzLl9vcGxvZ1VybCwgeyBtYXhQb29sU2l6ZTogMSwgbWluUG9vbFNpemU6IDEgfVxuICAgICk7XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgaXNNYXN0ZXJEb2MgPSBhd2FpdCB0aGlzLl9vcGxvZ0xhc3RFbnRyeUNvbm5lY3Rpb24hLmRiXG4gICAgICAgIC5hZG1pbigpXG4gICAgICAgIC5jb21tYW5kKHsgaXNtYXN0ZXI6IDEgfSk7XG5cbiAgICAgIGlmICghKGlzTWFzdGVyRG9jICYmIGlzTWFzdGVyRG9jLnNldE5hbWUpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIiRNT05HT19PUExPR19VUkwgbXVzdCBiZSBzZXQgdG8gdGhlICdsb2NhbCcgZGF0YWJhc2Ugb2YgYSBNb25nbyByZXBsaWNhIHNldFwiKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgbGFzdE9wbG9nRW50cnkgPSBhd2FpdCB0aGlzLl9vcGxvZ0xhc3RFbnRyeUNvbm5lY3Rpb24uZmluZE9uZUFzeW5jKFxuICAgICAgICBPUExPR19DT0xMRUNUSU9OLFxuICAgICAgICB7fSxcbiAgICAgICAgeyBzb3J0OiB7ICRuYXR1cmFsOiAtMSB9LCBwcm9qZWN0aW9uOiB7IHRzOiAxIH0gfVxuICAgICAgKTtcblxuICAgICAgY29uc3Qgb3Bsb2dTZWxlY3RvciA9IHRoaXMuX2dldE9wbG9nU2VsZWN0b3IobGFzdE9wbG9nRW50cnk/LnRzKTtcbiAgICAgIGlmIChsYXN0T3Bsb2dFbnRyeSkge1xuICAgICAgICB0aGlzLl9sYXN0UHJvY2Vzc2VkVFMgPSBsYXN0T3Bsb2dFbnRyeS50cztcbiAgICAgIH1cblxuICAgICAgY29uc3QgY3Vyc29yRGVzY3JpcHRpb24gPSBuZXcgQ3Vyc29yRGVzY3JpcHRpb24oXG4gICAgICAgIE9QTE9HX0NPTExFQ1RJT04sXG4gICAgICAgIG9wbG9nU2VsZWN0b3IsXG4gICAgICAgIHsgdGFpbGFibGU6IHRydWUgfVxuICAgICAgKTtcblxuICAgICAgdGhpcy5fdGFpbEhhbmRsZSA9IHRoaXMuX29wbG9nVGFpbENvbm5lY3Rpb24udGFpbChcbiAgICAgICAgY3Vyc29yRGVzY3JpcHRpb24sXG4gICAgICAgIChkb2M6IGFueSkgPT4ge1xuICAgICAgICAgIHRoaXMuX2VudHJ5UXVldWUucHVzaChkb2MpO1xuICAgICAgICAgIHRoaXMuX21heWJlU3RhcnRXb3JrZXIoKTtcbiAgICAgICAgfSxcbiAgICAgICAgVEFJTF9USU1FT1VUXG4gICAgICApO1xuXG4gICAgICB0aGlzLl9yZWFkeVByb21pc2VSZXNvbHZlciEoKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgaW4gX3N0YXJ0VGFpbGluZzonLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIF9tYXliZVN0YXJ0V29ya2VyKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLl93b3JrZXJQcm9taXNlKSByZXR1cm47XG4gICAgdGhpcy5fd29ya2VyQWN0aXZlID0gdHJ1ZTtcblxuICAgIC8vIENvbnZlcnQgdG8gYSBwcm9wZXIgcHJvbWlzZS1iYXNlZCBxdWV1ZSBwcm9jZXNzb3JcbiAgICB0aGlzLl93b3JrZXJQcm9taXNlID0gKGFzeW5jICgpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHdoaWxlICghdGhpcy5fc3RvcHBlZCAmJiAhdGhpcy5fZW50cnlRdWV1ZS5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAvLyBBcmUgd2UgdG9vIGZhciBiZWhpbmQ/IEp1c3QgdGVsbCBvdXIgb2JzZXJ2ZXJzIHRoYXQgdGhleSBuZWVkIHRvXG4gICAgICAgICAgLy8gcmVwb2xsLCBhbmQgZHJvcCBvdXIgcXVldWUuXG4gICAgICAgICAgaWYgKHRoaXMuX2VudHJ5UXVldWUubGVuZ3RoID4gVE9PX0ZBUl9CRUhJTkQpIHtcbiAgICAgICAgICAgIGNvbnN0IGxhc3RFbnRyeSA9IHRoaXMuX2VudHJ5UXVldWUucG9wKCk7XG4gICAgICAgICAgICB0aGlzLl9lbnRyeVF1ZXVlLmNsZWFyKCk7XG5cbiAgICAgICAgICAgIHRoaXMuX29uU2tpcHBlZEVudHJpZXNIb29rLmVhY2goKGNhbGxiYWNrOiBGdW5jdGlvbikgPT4ge1xuICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBGcmVlIGFueSB3YWl0VW50aWxDYXVnaHRVcCgpIGNhbGxzIHRoYXQgd2VyZSB3YWl0aW5nIGZvciB1cyB0b1xuICAgICAgICAgICAgLy8gcGFzcyBzb21ldGhpbmcgdGhhdCB3ZSBqdXN0IHNraXBwZWQuXG4gICAgICAgICAgICB0aGlzLl9zZXRMYXN0UHJvY2Vzc2VkVFMobGFzdEVudHJ5LnRzKTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIFByb2Nlc3MgbmV4dCBiYXRjaCBmcm9tIHRoZSBxdWV1ZVxuICAgICAgICAgIGNvbnN0IGRvYyA9IHRoaXMuX2VudHJ5UXVldWUuc2hpZnQoKTtcblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCBoYW5kbGVEb2ModGhpcywgZG9jKTtcbiAgICAgICAgICAgIC8vIFByb2Nlc3MgYW55IHdhaXRpbmcgZmVuY2UgY2FsbGJhY2tzXG4gICAgICAgICAgICBpZiAoZG9jLnRzKSB7XG4gICAgICAgICAgICAgIHRoaXMuX3NldExhc3RQcm9jZXNzZWRUUyhkb2MudHMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIC8vIEtlZXAgcHJvY2Vzc2luZyBxdWV1ZSBldmVuIGlmIG9uZSBlbnRyeSBmYWlsc1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgcHJvY2Vzc2luZyBvcGxvZyBlbnRyeTonLCBlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZmluYWxseSB7XG4gICAgICAgIHRoaXMuX3dvcmtlclByb21pc2UgPSBudWxsO1xuICAgICAgICB0aGlzLl93b3JrZXJBY3RpdmUgPSBmYWxzZTtcbiAgICAgIH1cbiAgICB9KSgpO1xuICB9XG5cbiAgX3NldExhc3RQcm9jZXNzZWRUUyh0czogYW55KTogdm9pZCB7XG4gICAgdGhpcy5fbGFzdFByb2Nlc3NlZFRTID0gdHM7XG4gICAgd2hpbGUgKCFpc0VtcHR5KHRoaXMuX2NhdGNoaW5nVXBSZXNvbHZlcnMpICYmIHRoaXMuX2NhdGNoaW5nVXBSZXNvbHZlcnNbMF0udHMubGVzc1RoYW5PckVxdWFsKHRoaXMuX2xhc3RQcm9jZXNzZWRUUykpIHtcbiAgICAgIGNvbnN0IHNlcXVlbmNlciA9IHRoaXMuX2NhdGNoaW5nVXBSZXNvbHZlcnMuc2hpZnQoKSE7XG4gICAgICBzZXF1ZW5jZXIucmVzb2x2ZXIoKTtcbiAgICB9XG4gIH1cblxuICBfZGVmaW5lVG9vRmFyQmVoaW5kKHZhbHVlOiBudW1iZXIpOiB2b2lkIHtcbiAgICBUT09fRkFSX0JFSElORCA9IHZhbHVlO1xuICB9XG5cbiAgX3Jlc2V0VG9vRmFyQmVoaW5kKCk6IHZvaWQge1xuICAgIFRPT19GQVJfQkVISU5EID0gKyhwcm9jZXNzLmVudi5NRVRFT1JfT1BMT0dfVE9PX0ZBUl9CRUhJTkQgfHwgMjAwMCk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlkRm9yT3Aob3A6IE9wbG9nRW50cnkpOiBzdHJpbmcge1xuICBpZiAob3Aub3AgPT09ICdkJyB8fCBvcC5vcCA9PT0gJ2knKSB7XG4gICAgcmV0dXJuIG9wLm8uX2lkO1xuICB9IGVsc2UgaWYgKG9wLm9wID09PSAndScpIHtcbiAgICByZXR1cm4gb3AubzIuX2lkO1xuICB9IGVsc2UgaWYgKG9wLm9wID09PSAnYycpIHtcbiAgICB0aHJvdyBFcnJvcihcIk9wZXJhdG9yICdjJyBkb2Vzbid0IHN1cHBseSBhbiBvYmplY3Qgd2l0aCBpZDogXCIgKyBKU09OLnN0cmluZ2lmeShvcCkpO1xuICB9IGVsc2Uge1xuICAgIHRocm93IEVycm9yKFwiVW5rbm93biBvcDogXCIgKyBKU09OLnN0cmluZ2lmeShvcCkpO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZURvYyhoYW5kbGU6IE9wbG9nSGFuZGxlLCBkb2M6IE9wbG9nRW50cnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgaWYgKGRvYy5ucyA9PT0gXCJhZG1pbi4kY21kXCIpIHtcbiAgICBpZiAoZG9jLm8uYXBwbHlPcHMpIHtcbiAgICAgIC8vIFRoaXMgd2FzIGEgc3VjY2Vzc2Z1bCB0cmFuc2FjdGlvbiwgc28gd2UgbmVlZCB0byBhcHBseSB0aGVcbiAgICAgIC8vIG9wZXJhdGlvbnMgdGhhdCB3ZXJlIGludm9sdmVkLlxuICAgICAgbGV0IG5leHRUaW1lc3RhbXAgPSBkb2MudHM7XG4gICAgICBmb3IgKGNvbnN0IG9wIG9mIGRvYy5vLmFwcGx5T3BzKSB7XG4gICAgICAgIC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9pc3N1ZXMvMTA0MjAuXG4gICAgICAgIGlmICghb3AudHMpIHtcbiAgICAgICAgICBvcC50cyA9IG5leHRUaW1lc3RhbXA7XG4gICAgICAgICAgbmV4dFRpbWVzdGFtcCA9IG5leHRUaW1lc3RhbXAuYWRkKExvbmcuT05FKTtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBoYW5kbGVEb2MoaGFuZGxlLCBvcCk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRocm93IG5ldyBFcnJvcihcIlVua25vd24gY29tbWFuZCBcIiArIEpTT04uc3RyaW5naWZ5KGRvYykpO1xuICB9XG5cbiAgY29uc3QgdHJpZ2dlcjogT3Bsb2dUcmlnZ2VyID0ge1xuICAgIGRyb3BDb2xsZWN0aW9uOiBmYWxzZSxcbiAgICBkcm9wRGF0YWJhc2U6IGZhbHNlLFxuICAgIG9wOiBkb2MsXG4gIH07XG5cbiAgaWYgKHR5cGVvZiBkb2MubnMgPT09IFwic3RyaW5nXCIgJiYgZG9jLm5zLnN0YXJ0c1dpdGgoaGFuZGxlLl9kYk5hbWUgKyBcIi5cIikpIHtcbiAgICB0cmlnZ2VyLmNvbGxlY3Rpb24gPSBkb2MubnMuc2xpY2UoaGFuZGxlLl9kYk5hbWUubGVuZ3RoICsgMSk7XG4gIH1cblxuICAvLyBJcyBpdCBhIHNwZWNpYWwgY29tbWFuZCBhbmQgdGhlIGNvbGxlY3Rpb24gbmFtZSBpcyBoaWRkZW5cbiAgLy8gc29tZXdoZXJlIGluIG9wZXJhdG9yP1xuICBpZiAodHJpZ2dlci5jb2xsZWN0aW9uID09PSBcIiRjbWRcIikge1xuICAgIGlmIChkb2Muby5kcm9wRGF0YWJhc2UpIHtcbiAgICAgIGRlbGV0ZSB0cmlnZ2VyLmNvbGxlY3Rpb247XG4gICAgICB0cmlnZ2VyLmRyb3BEYXRhYmFzZSA9IHRydWU7XG4gICAgfSBlbHNlIGlmIChcImRyb3BcIiBpbiBkb2Mubykge1xuICAgICAgdHJpZ2dlci5jb2xsZWN0aW9uID0gZG9jLm8uZHJvcDtcbiAgICAgIHRyaWdnZXIuZHJvcENvbGxlY3Rpb24gPSB0cnVlO1xuICAgICAgdHJpZ2dlci5pZCA9IG51bGw7XG4gICAgfSBlbHNlIGlmIChcImNyZWF0ZVwiIGluIGRvYy5vICYmIFwiaWRJbmRleFwiIGluIGRvYy5vKSB7XG4gICAgICAvLyBBIGNvbGxlY3Rpb24gZ290IGltcGxpY2l0bHkgY3JlYXRlZCB3aXRoaW4gYSB0cmFuc2FjdGlvbi4gVGhlcmUnc1xuICAgICAgLy8gbm8gbmVlZCB0byBkbyBhbnl0aGluZyBhYm91dCBpdC5cbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgRXJyb3IoXCJVbmtub3duIGNvbW1hbmQgXCIgKyBKU09OLnN0cmluZ2lmeShkb2MpKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgLy8gQWxsIG90aGVyIG9wcyBoYXZlIGFuIGlkLlxuICAgIHRyaWdnZXIuaWQgPSBpZEZvck9wKGRvYyk7XG4gIH1cblxuICBhd2FpdCBoYW5kbGUuX2Nyb3NzYmFyLmZpcmUodHJpZ2dlcik7XG5cbiAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRJbW1lZGlhdGUocmVzb2x2ZSkpO1xufSIsImltcG9ydCBpc0VtcHR5IGZyb20gJ2xvZGFzaC5pc2VtcHR5JztcbmltcG9ydCB7IE9ic2VydmVIYW5kbGUgfSBmcm9tICcuL29ic2VydmVfaGFuZGxlJztcblxuaW50ZXJmYWNlIE9ic2VydmVNdWx0aXBsZXhlck9wdGlvbnMge1xuICBvcmRlcmVkOiBib29sZWFuO1xuICBvblN0b3A/OiAoKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgdHlwZSBPYnNlcnZlSGFuZGxlQ2FsbGJhY2sgPSAnYWRkZWQnIHwgJ2FkZGVkQmVmb3JlJyB8ICdjaGFuZ2VkJyB8ICdtb3ZlZEJlZm9yZScgfCAncmVtb3ZlZCc7XG5cbi8qKlxuICogQWxsb3dzIG11bHRpcGxlIGlkZW50aWNhbCBPYnNlcnZlSGFuZGxlcyB0byBiZSBkcml2ZW4gYnkgYSBzaW5nbGUgb2JzZXJ2ZSBkcml2ZXIuXG4gKlxuICogVGhpcyBvcHRpbWl6YXRpb24gZW5zdXJlcyB0aGF0IG11bHRpcGxlIGlkZW50aWNhbCBvYnNlcnZhdGlvbnNcbiAqIGRvbid0IHJlc3VsdCBpbiBkdXBsaWNhdGUgZGF0YWJhc2UgcXVlcmllcy5cbiAqL1xuZXhwb3J0IGNsYXNzIE9ic2VydmVNdWx0aXBsZXhlciB7XG4gIHByaXZhdGUgcmVhZG9ubHkgX29yZGVyZWQ6IGJvb2xlYW47XG4gIHByaXZhdGUgcmVhZG9ubHkgX29uU3RvcDogKCkgPT4gdm9pZDtcbiAgcHJpdmF0ZSBfcXVldWU6IGFueTtcbiAgcHJpdmF0ZSBfaGFuZGxlczogeyBba2V5OiBzdHJpbmddOiBPYnNlcnZlSGFuZGxlIH0gfCBudWxsO1xuICBwcml2YXRlIF9yZXNvbHZlcjogKCh2YWx1ZT86IHVua25vd24pID0+IHZvaWQpIHwgbnVsbDtcbiAgcHJpdmF0ZSByZWFkb25seSBfcmVhZHlQcm9taXNlOiBQcm9taXNlPGJvb2xlYW4gfCB2b2lkPjtcbiAgcHJpdmF0ZSBfaXNSZWFkeTogYm9vbGVhbjtcbiAgcHJpdmF0ZSBfY2FjaGU6IGFueTtcbiAgcHJpdmF0ZSBfYWRkSGFuZGxlVGFza3NTY2hlZHVsZWRCdXROb3RQZXJmb3JtZWQ6IG51bWJlcjtcblxuICBjb25zdHJ1Y3Rvcih7IG9yZGVyZWQsIG9uU3RvcCA9ICgpID0+IHt9IH06IE9ic2VydmVNdWx0aXBsZXhlck9wdGlvbnMpIHtcbiAgICBpZiAob3JkZXJlZCA9PT0gdW5kZWZpbmVkKSB0aHJvdyBFcnJvcihcIm11c3Qgc3BlY2lmeSBvcmRlcmVkXCIpO1xuXG4gICAgLy8gQHRzLWlnbm9yZVxuICAgIFBhY2thZ2VbJ2ZhY3RzLWJhc2UnXSAmJiBQYWNrYWdlWydmYWN0cy1iYXNlJ11cbiAgICAgICAgLkZhY3RzLmluY3JlbWVudFNlcnZlckZhY3QoXCJtb25nby1saXZlZGF0YVwiLCBcIm9ic2VydmUtbXVsdGlwbGV4ZXJzXCIsIDEpO1xuXG4gICAgdGhpcy5fb3JkZXJlZCA9IG9yZGVyZWQ7XG4gICAgdGhpcy5fb25TdG9wID0gb25TdG9wO1xuICAgIHRoaXMuX3F1ZXVlID0gbmV3IE1ldGVvci5fQXN5bmNocm9ub3VzUXVldWUoKTtcbiAgICB0aGlzLl9oYW5kbGVzID0ge307XG4gICAgdGhpcy5fcmVzb2x2ZXIgPSBudWxsO1xuICAgIHRoaXMuX2lzUmVhZHkgPSBmYWxzZTtcbiAgICB0aGlzLl9yZWFkeVByb21pc2UgPSBuZXcgUHJvbWlzZShyID0+IHRoaXMuX3Jlc29sdmVyID0gcikudGhlbigoKSA9PiB0aGlzLl9pc1JlYWR5ID0gdHJ1ZSk7XG4gICAgLy8gQHRzLWlnbm9yZVxuICAgIHRoaXMuX2NhY2hlID0gbmV3IExvY2FsQ29sbGVjdGlvbi5fQ2FjaGluZ0NoYW5nZU9ic2VydmVyKHsgb3JkZXJlZCB9KTtcbiAgICB0aGlzLl9hZGRIYW5kbGVUYXNrc1NjaGVkdWxlZEJ1dE5vdFBlcmZvcm1lZCA9IDA7XG5cbiAgICB0aGlzLmNhbGxiYWNrTmFtZXMoKS5mb3JFYWNoKGNhbGxiYWNrTmFtZSA9PiB7XG4gICAgICAodGhpcyBhcyBhbnkpW2NhbGxiYWNrTmFtZV0gPSAoLi4uYXJnczogYW55W10pID0+IHtcbiAgICAgICAgdGhpcy5fYXBwbHlDYWxsYmFjayhjYWxsYmFja05hbWUsIGFyZ3MpO1xuICAgICAgfTtcbiAgICB9KTtcbiAgfVxuXG4gIGFkZEhhbmRsZUFuZFNlbmRJbml0aWFsQWRkcyhoYW5kbGU6IE9ic2VydmVIYW5kbGUpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdGhpcy5fYWRkSGFuZGxlQW5kU2VuZEluaXRpYWxBZGRzKGhhbmRsZSk7XG4gIH1cblxuICBhc3luYyBfYWRkSGFuZGxlQW5kU2VuZEluaXRpYWxBZGRzKGhhbmRsZTogT2JzZXJ2ZUhhbmRsZSk6IFByb21pc2U8dm9pZD4ge1xuICAgICsrdGhpcy5fYWRkSGFuZGxlVGFza3NTY2hlZHVsZWRCdXROb3RQZXJmb3JtZWQ7XG5cbiAgICAvLyBAdHMtaWdub3JlXG4gICAgUGFja2FnZVsnZmFjdHMtYmFzZSddICYmIFBhY2thZ2VbJ2ZhY3RzLWJhc2UnXS5GYWN0cy5pbmNyZW1lbnRTZXJ2ZXJGYWN0KFxuICAgICAgXCJtb25nby1saXZlZGF0YVwiLCBcIm9ic2VydmUtaGFuZGxlc1wiLCAxKTtcblxuICAgIGF3YWl0IHRoaXMuX3F1ZXVlLnJ1blRhc2soYXN5bmMgKCkgPT4ge1xuICAgICAgdGhpcy5faGFuZGxlcyFbaGFuZGxlLl9pZF0gPSBoYW5kbGU7XG4gICAgICBhd2FpdCB0aGlzLl9zZW5kQWRkcyhoYW5kbGUpO1xuICAgICAgLS10aGlzLl9hZGRIYW5kbGVUYXNrc1NjaGVkdWxlZEJ1dE5vdFBlcmZvcm1lZDtcbiAgICB9KTtcbiAgICBhd2FpdCB0aGlzLl9yZWFkeVByb21pc2U7XG4gIH1cblxuICBhc3luYyByZW1vdmVIYW5kbGUoaWQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghdGhpcy5fcmVhZHkoKSlcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IHJlbW92ZSBoYW5kbGVzIHVudGlsIHRoZSBtdWx0aXBsZXggaXMgcmVhZHlcIik7XG5cbiAgICBkZWxldGUgdGhpcy5faGFuZGxlcyFbaWRdO1xuXG4gICAgLy8gQHRzLWlnbm9yZVxuICAgIFBhY2thZ2VbJ2ZhY3RzLWJhc2UnXSAmJiBQYWNrYWdlWydmYWN0cy1iYXNlJ10uRmFjdHMuaW5jcmVtZW50U2VydmVyRmFjdChcbiAgICAgIFwibW9uZ28tbGl2ZWRhdGFcIiwgXCJvYnNlcnZlLWhhbmRsZXNcIiwgLTEpO1xuXG4gICAgaWYgKGlzRW1wdHkodGhpcy5faGFuZGxlcykgJiZcbiAgICAgIHRoaXMuX2FkZEhhbmRsZVRhc2tzU2NoZWR1bGVkQnV0Tm90UGVyZm9ybWVkID09PSAwKSB7XG4gICAgICBhd2FpdCB0aGlzLl9zdG9wKCk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgX3N0b3Aob3B0aW9uczogeyBmcm9tUXVlcnlFcnJvcj86IGJvb2xlYW4gfSA9IHt9KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCF0aGlzLl9yZWFkeSgpICYmICFvcHRpb25zLmZyb21RdWVyeUVycm9yKVxuICAgICAgdGhyb3cgRXJyb3IoXCJzdXJwcmlzaW5nIF9zdG9wOiBub3QgcmVhZHlcIik7XG5cbiAgICBhd2FpdCB0aGlzLl9vblN0b3AoKTtcblxuICAgIC8vIEB0cy1pZ25vcmVcbiAgICBQYWNrYWdlWydmYWN0cy1iYXNlJ10gJiYgUGFja2FnZVsnZmFjdHMtYmFzZSddXG4gICAgICAgIC5GYWN0cy5pbmNyZW1lbnRTZXJ2ZXJGYWN0KFwibW9uZ28tbGl2ZWRhdGFcIiwgXCJvYnNlcnZlLW11bHRpcGxleGVyc1wiLCAtMSk7XG5cbiAgICB0aGlzLl9oYW5kbGVzID0gbnVsbDtcbiAgfVxuXG4gIGFzeW5jIHJlYWR5KCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMuX3F1ZXVlLnF1ZXVlVGFzaygoKSA9PiB7XG4gICAgICBpZiAodGhpcy5fcmVhZHkoKSlcbiAgICAgICAgdGhyb3cgRXJyb3IoXCJjYW4ndCBtYWtlIE9ic2VydmVNdWx0aXBsZXggcmVhZHkgdHdpY2UhXCIpO1xuXG4gICAgICBpZiAoIXRoaXMuX3Jlc29sdmVyKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk1pc3NpbmcgcmVzb2x2ZXJcIik7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuX3Jlc29sdmVyKCk7XG4gICAgICB0aGlzLl9pc1JlYWR5ID0gdHJ1ZTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHF1ZXJ5RXJyb3IoZXJyOiBFcnJvcik6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMuX3F1ZXVlLnJ1blRhc2soKCkgPT4ge1xuICAgICAgaWYgKHRoaXMuX3JlYWR5KCkpXG4gICAgICAgIHRocm93IEVycm9yKFwiY2FuJ3QgY2xhaW0gcXVlcnkgaGFzIGFuIGVycm9yIGFmdGVyIGl0IHdvcmtlZCFcIik7XG4gICAgICB0aGlzLl9zdG9wKHsgZnJvbVF1ZXJ5RXJyb3I6IHRydWUgfSk7XG4gICAgICB0aHJvdyBlcnI7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBvbkZsdXNoKGNiOiAoKSA9PiB2b2lkKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy5fcXVldWUucXVldWVUYXNrKGFzeW5jICgpID0+IHtcbiAgICAgIGlmICghdGhpcy5fcmVhZHkoKSlcbiAgICAgICAgdGhyb3cgRXJyb3IoXCJvbmx5IGNhbGwgb25GbHVzaCBvbiBhIG11bHRpcGxleGVyIHRoYXQgd2lsbCBiZSByZWFkeVwiKTtcbiAgICAgIGF3YWl0IGNiKCk7XG4gICAgfSk7XG4gIH1cblxuICBjYWxsYmFja05hbWVzKCk6IE9ic2VydmVIYW5kbGVDYWxsYmFja1tdIHtcbiAgICByZXR1cm4gdGhpcy5fb3JkZXJlZFxuICAgICAgPyBbXCJhZGRlZEJlZm9yZVwiLCBcImNoYW5nZWRcIiwgXCJtb3ZlZEJlZm9yZVwiLCBcInJlbW92ZWRcIl1cbiAgICAgIDogW1wiYWRkZWRcIiwgXCJjaGFuZ2VkXCIsIFwicmVtb3ZlZFwiXTtcbiAgfVxuXG4gIF9yZWFkeSgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gISF0aGlzLl9pc1JlYWR5O1xuICB9XG5cbiAgX2FwcGx5Q2FsbGJhY2soY2FsbGJhY2tOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueVtdKSB7XG4gICAgdGhpcy5fcXVldWUucXVldWVUYXNrKGFzeW5jICgpID0+IHtcbiAgICAgIGlmICghdGhpcy5faGFuZGxlcykgcmV0dXJuO1xuXG4gICAgICBhd2FpdCB0aGlzLl9jYWNoZS5hcHBseUNoYW5nZVtjYWxsYmFja05hbWVdLmFwcGx5KG51bGwsIGFyZ3MpO1xuICAgICAgaWYgKCF0aGlzLl9yZWFkeSgpICYmXG4gICAgICAgIChjYWxsYmFja05hbWUgIT09ICdhZGRlZCcgJiYgY2FsbGJhY2tOYW1lICE9PSAnYWRkZWRCZWZvcmUnKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEdvdCAke2NhbGxiYWNrTmFtZX0gZHVyaW5nIGluaXRpYWwgYWRkc2ApO1xuICAgICAgfVxuXG4gICAgICBmb3IgKGNvbnN0IGhhbmRsZUlkIG9mIE9iamVjdC5rZXlzKHRoaXMuX2hhbmRsZXMpKSB7XG4gICAgICAgIGNvbnN0IGhhbmRsZSA9IHRoaXMuX2hhbmRsZXMgJiYgdGhpcy5faGFuZGxlc1toYW5kbGVJZF07XG5cbiAgICAgICAgaWYgKCFoYW5kbGUpIHJldHVybjtcblxuICAgICAgICBjb25zdCBjYWxsYmFjayA9IChoYW5kbGUgYXMgYW55KVtgXyR7Y2FsbGJhY2tOYW1lfWBdO1xuXG4gICAgICAgIGlmICghY2FsbGJhY2spIGNvbnRpbnVlO1xuXG4gICAgICAgIGhhbmRsZS5pbml0aWFsQWRkc1NlbnQudGhlbihjYWxsYmFjay5hcHBseShcbiAgICAgICAgICBudWxsLFxuICAgICAgICAgIGhhbmRsZS5ub25NdXRhdGluZ0NhbGxiYWNrcyA/IGFyZ3MgOiBFSlNPTi5jbG9uZShhcmdzKVxuICAgICAgICApKVxuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgX3NlbmRBZGRzKGhhbmRsZTogT2JzZXJ2ZUhhbmRsZSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGFkZCA9IHRoaXMuX29yZGVyZWQgPyBoYW5kbGUuX2FkZGVkQmVmb3JlIDogaGFuZGxlLl9hZGRlZDtcbiAgICBpZiAoIWFkZCkgcmV0dXJuO1xuXG4gICAgY29uc3QgYWRkUHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXG4gICAgdGhpcy5fY2FjaGUuZG9jcy5mb3JFYWNoKChkb2M6IGFueSwgaWQ6IHN0cmluZykgPT4ge1xuICAgICAgaWYgKCEoaGFuZGxlLl9pZCBpbiB0aGlzLl9oYW5kbGVzISkpIHtcbiAgICAgICAgdGhyb3cgRXJyb3IoXCJoYW5kbGUgZ290IHJlbW92ZWQgYmVmb3JlIHNlbmRpbmcgaW5pdGlhbCBhZGRzIVwiKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgeyBfaWQsIC4uLmZpZWxkcyB9ID0gaGFuZGxlLm5vbk11dGF0aW5nQ2FsbGJhY2tzID8gZG9jIDogRUpTT04uY2xvbmUoZG9jKTtcblxuICAgICAgY29uc3QgcHJvbWlzZSA9IHRoaXMuX29yZGVyZWQgP1xuICAgICAgICBhZGQoaWQsIGZpZWxkcywgbnVsbCkgOlxuICAgICAgICBhZGQoaWQsIGZpZWxkcyk7XG5cbiAgICAgIGFkZFByb21pc2VzLnB1c2gocHJvbWlzZSk7XG4gICAgfSk7XG5cbiAgICBhd2FpdCBQcm9taXNlLmFsbChhZGRQcm9taXNlcyk7XG5cbiAgICBoYW5kbGUuaW5pdGlhbEFkZHNTZW50UmVzb2x2ZXIoKTtcbiAgfVxufSIsImV4cG9ydCBjbGFzcyBEb2NGZXRjaGVyIHtcbiAgY29uc3RydWN0b3IobW9uZ29Db25uZWN0aW9uKSB7XG4gICAgdGhpcy5fbW9uZ29Db25uZWN0aW9uID0gbW9uZ29Db25uZWN0aW9uO1xuICAgIC8vIE1hcCBmcm9tIG9wIC0+IFtjYWxsYmFja11cbiAgICB0aGlzLl9jYWxsYmFja3NGb3JPcCA9IG5ldyBNYXAoKTtcbiAgfVxuXG4gIC8vIEZldGNoZXMgZG9jdW1lbnQgXCJpZFwiIGZyb20gY29sbGVjdGlvbk5hbWUsIHJldHVybmluZyBpdCBvciBudWxsIGlmIG5vdFxuICAvLyBmb3VuZC5cbiAgLy9cbiAgLy8gSWYgeW91IG1ha2UgbXVsdGlwbGUgY2FsbHMgdG8gZmV0Y2goKSB3aXRoIHRoZSBzYW1lIG9wIHJlZmVyZW5jZSxcbiAgLy8gRG9jRmV0Y2hlciBtYXkgYXNzdW1lIHRoYXQgdGhleSBhbGwgcmV0dXJuIHRoZSBzYW1lIGRvY3VtZW50LiAoSXQgZG9lc1xuICAvLyBub3QgY2hlY2sgdG8gc2VlIGlmIGNvbGxlY3Rpb25OYW1lL2lkIG1hdGNoLilcbiAgLy9cbiAgLy8gWW91IG1heSBhc3N1bWUgdGhhdCBjYWxsYmFjayBpcyBuZXZlciBjYWxsZWQgc3luY2hyb25vdXNseSAoYW5kIGluIGZhY3RcbiAgLy8gT3Bsb2dPYnNlcnZlRHJpdmVyIGRvZXMgc28pLlxuICBhc3luYyBmZXRjaChjb2xsZWN0aW9uTmFtZSwgaWQsIG9wLCBjYWxsYmFjaykge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gICAgXG4gICAgY2hlY2soY29sbGVjdGlvbk5hbWUsIFN0cmluZyk7XG4gICAgY2hlY2sob3AsIE9iamVjdCk7XG5cblxuICAgIC8vIElmIHRoZXJlJ3MgYWxyZWFkeSBhbiBpbi1wcm9ncmVzcyBmZXRjaCBmb3IgdGhpcyBjYWNoZSBrZXksIHlpZWxkIHVudGlsXG4gICAgLy8gaXQncyBkb25lIGFuZCByZXR1cm4gd2hhdGV2ZXIgaXQgcmV0dXJucy5cbiAgICBpZiAoc2VsZi5fY2FsbGJhY2tzRm9yT3AuaGFzKG9wKSkge1xuICAgICAgc2VsZi5fY2FsbGJhY2tzRm9yT3AuZ2V0KG9wKS5wdXNoKGNhbGxiYWNrKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBjYWxsYmFja3MgPSBbY2FsbGJhY2tdO1xuICAgIHNlbGYuX2NhbGxiYWNrc0Zvck9wLnNldChvcCwgY2FsbGJhY2tzKTtcblxuICAgIHRyeSB7XG4gICAgICB2YXIgZG9jID1cbiAgICAgICAgKGF3YWl0IHNlbGYuX21vbmdvQ29ubmVjdGlvbi5maW5kT25lQXN5bmMoY29sbGVjdGlvbk5hbWUsIHtcbiAgICAgICAgICBfaWQ6IGlkLFxuICAgICAgICB9KSkgfHwgbnVsbDtcbiAgICAgIC8vIFJldHVybiBkb2MgdG8gYWxsIHJlbGV2YW50IGNhbGxiYWNrcy4gTm90ZSB0aGF0IHRoaXMgYXJyYXkgY2FuXG4gICAgICAvLyBjb250aW51ZSB0byBncm93IGR1cmluZyBjYWxsYmFjayBleGNlY3V0aW9uLlxuICAgICAgd2hpbGUgKGNhbGxiYWNrcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIC8vIENsb25lIHRoZSBkb2N1bWVudCBzbyB0aGF0IHRoZSB2YXJpb3VzIGNhbGxzIHRvIGZldGNoIGRvbid0IHJldHVyblxuICAgICAgICAvLyBvYmplY3RzIHRoYXQgYXJlIGludGVydHdpbmdsZWQgd2l0aCBlYWNoIG90aGVyLiBDbG9uZSBiZWZvcmVcbiAgICAgICAgLy8gcG9wcGluZyB0aGUgZnV0dXJlLCBzbyB0aGF0IGlmIGNsb25lIHRocm93cywgdGhlIGVycm9yIGdldHMgcGFzc2VkXG4gICAgICAgIC8vIHRvIHRoZSBuZXh0IGNhbGxiYWNrLlxuICAgICAgICBjYWxsYmFja3MucG9wKCkobnVsbCwgRUpTT04uY2xvbmUoZG9jKSk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgd2hpbGUgKGNhbGxiYWNrcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNhbGxiYWNrcy5wb3AoKShlKTtcbiAgICAgIH1cbiAgICB9IGZpbmFsbHkge1xuICAgICAgLy8gWFhYIGNvbnNpZGVyIGtlZXBpbmcgdGhlIGRvYyBhcm91bmQgZm9yIGEgcGVyaW9kIG9mIHRpbWUgYmVmb3JlXG4gICAgICAvLyByZW1vdmluZyBmcm9tIHRoZSBjYWNoZVxuICAgICAgc2VsZi5fY2FsbGJhY2tzRm9yT3AuZGVsZXRlKG9wKTtcbiAgICB9XG4gIH1cbn1cbiIsImltcG9ydCB0aHJvdHRsZSBmcm9tICdsb2Rhc2gudGhyb3R0bGUnO1xuaW1wb3J0IHsgbGlzdGVuQWxsIH0gZnJvbSAnLi9tb25nb19kcml2ZXInO1xuaW1wb3J0IHsgT2JzZXJ2ZU11bHRpcGxleGVyIH0gZnJvbSAnLi9vYnNlcnZlX211bHRpcGxleCc7XG5cbmludGVyZmFjZSBQb2xsaW5nT2JzZXJ2ZURyaXZlck9wdGlvbnMge1xuICBjdXJzb3JEZXNjcmlwdGlvbjogYW55O1xuICBtb25nb0hhbmRsZTogYW55O1xuICBvcmRlcmVkOiBib29sZWFuO1xuICBtdWx0aXBsZXhlcjogT2JzZXJ2ZU11bHRpcGxleGVyO1xuICBfdGVzdE9ubHlQb2xsQ2FsbGJhY2s/OiAoKSA9PiB2b2lkO1xufVxuXG5jb25zdCBQT0xMSU5HX1RIUk9UVExFX01TID0gKyhwcm9jZXNzLmVudi5NRVRFT1JfUE9MTElOR19USFJPVFRMRV9NUyB8fCAnJykgfHwgNTA7XG5jb25zdCBQT0xMSU5HX0lOVEVSVkFMX01TID0gKyhwcm9jZXNzLmVudi5NRVRFT1JfUE9MTElOR19JTlRFUlZBTF9NUyB8fCAnJykgfHwgMTAgKiAxMDAwO1xuXG4vKipcbiAqIEBjbGFzcyBQb2xsaW5nT2JzZXJ2ZURyaXZlclxuICpcbiAqIE9uZSBvZiB0d28gb2JzZXJ2ZSBkcml2ZXIgaW1wbGVtZW50YXRpb25zLlxuICpcbiAqIENoYXJhY3RlcmlzdGljczpcbiAqIC0gQ2FjaGVzIHRoZSByZXN1bHRzIG9mIGEgcXVlcnlcbiAqIC0gUmVydW5zIHRoZSBxdWVyeSB3aGVuIG5lY2Vzc2FyeVxuICogLSBTdWl0YWJsZSBmb3IgY2FzZXMgd2hlcmUgb3Bsb2cgdGFpbGluZyBpcyBub3QgYXZhaWxhYmxlIG9yIHByYWN0aWNhbFxuICovXG5leHBvcnQgY2xhc3MgUG9sbGluZ09ic2VydmVEcml2ZXIge1xuICBwcml2YXRlIF9vcHRpb25zOiBQb2xsaW5nT2JzZXJ2ZURyaXZlck9wdGlvbnM7XG4gIHByaXZhdGUgX2N1cnNvckRlc2NyaXB0aW9uOiBhbnk7XG4gIHByaXZhdGUgX21vbmdvSGFuZGxlOiBhbnk7XG4gIHByaXZhdGUgX29yZGVyZWQ6IGJvb2xlYW47XG4gIHByaXZhdGUgX211bHRpcGxleGVyOiBhbnk7XG4gIHByaXZhdGUgX3N0b3BDYWxsYmFja3M6IEFycmF5PCgpID0+IFByb21pc2U8dm9pZD4+O1xuICBwcml2YXRlIF9zdG9wcGVkOiBib29sZWFuO1xuICBwcml2YXRlIF9jdXJzb3I6IGFueTtcbiAgcHJpdmF0ZSBfcmVzdWx0czogYW55O1xuICBwcml2YXRlIF9wb2xsc1NjaGVkdWxlZEJ1dE5vdFN0YXJ0ZWQ6IG51bWJlcjtcbiAgcHJpdmF0ZSBfcGVuZGluZ1dyaXRlczogYW55W107XG4gIHByaXZhdGUgX2Vuc3VyZVBvbGxJc1NjaGVkdWxlZDogRnVuY3Rpb247XG4gIHByaXZhdGUgX3Rhc2tRdWV1ZTogYW55O1xuICBwcml2YXRlIF90ZXN0T25seVBvbGxDYWxsYmFjaz86ICgpID0+IHZvaWQ7XG5cbiAgY29uc3RydWN0b3Iob3B0aW9uczogUG9sbGluZ09ic2VydmVEcml2ZXJPcHRpb25zKSB7XG4gICAgdGhpcy5fb3B0aW9ucyA9IG9wdGlvbnM7XG4gICAgdGhpcy5fY3Vyc29yRGVzY3JpcHRpb24gPSBvcHRpb25zLmN1cnNvckRlc2NyaXB0aW9uO1xuICAgIHRoaXMuX21vbmdvSGFuZGxlID0gb3B0aW9ucy5tb25nb0hhbmRsZTtcbiAgICB0aGlzLl9vcmRlcmVkID0gb3B0aW9ucy5vcmRlcmVkO1xuICAgIHRoaXMuX211bHRpcGxleGVyID0gb3B0aW9ucy5tdWx0aXBsZXhlcjtcbiAgICB0aGlzLl9zdG9wQ2FsbGJhY2tzID0gW107XG4gICAgdGhpcy5fc3RvcHBlZCA9IGZhbHNlO1xuXG4gICAgdGhpcy5fY3Vyc29yID0gdGhpcy5fbW9uZ29IYW5kbGUuX2NyZWF0ZUFzeW5jaHJvbm91c0N1cnNvcihcbiAgICAgIHRoaXMuX2N1cnNvckRlc2NyaXB0aW9uKTtcblxuICAgIHRoaXMuX3Jlc3VsdHMgPSBudWxsO1xuICAgIHRoaXMuX3BvbGxzU2NoZWR1bGVkQnV0Tm90U3RhcnRlZCA9IDA7XG4gICAgdGhpcy5fcGVuZGluZ1dyaXRlcyA9IFtdO1xuXG4gICAgdGhpcy5fZW5zdXJlUG9sbElzU2NoZWR1bGVkID0gdGhyb3R0bGUoXG4gICAgICB0aGlzLl91bnRocm90dGxlZEVuc3VyZVBvbGxJc1NjaGVkdWxlZC5iaW5kKHRoaXMpLFxuICAgICAgdGhpcy5fY3Vyc29yRGVzY3JpcHRpb24ub3B0aW9ucy5wb2xsaW5nVGhyb3R0bGVNcyB8fCBQT0xMSU5HX1RIUk9UVExFX01TXG4gICAgKTtcblxuICAgIHRoaXMuX3Rhc2tRdWV1ZSA9IG5ldyAoTWV0ZW9yIGFzIGFueSkuX0FzeW5jaHJvbm91c1F1ZXVlKCk7XG4gIH1cblxuICBhc3luYyBfaW5pdCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBvcHRpb25zID0gdGhpcy5fb3B0aW9ucztcbiAgICBjb25zdCBsaXN0ZW5lcnNIYW5kbGUgPSBhd2FpdCBsaXN0ZW5BbGwoXG4gICAgICB0aGlzLl9jdXJzb3JEZXNjcmlwdGlvbixcbiAgICAgIChub3RpZmljYXRpb246IGFueSkgPT4ge1xuICAgICAgICBjb25zdCBmZW5jZSA9IChERFBTZXJ2ZXIgYXMgYW55KS5fZ2V0Q3VycmVudEZlbmNlKCk7XG4gICAgICAgIGlmIChmZW5jZSkge1xuICAgICAgICAgIHRoaXMuX3BlbmRpbmdXcml0ZXMucHVzaChmZW5jZS5iZWdpbldyaXRlKCkpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLl9wb2xsc1NjaGVkdWxlZEJ1dE5vdFN0YXJ0ZWQgPT09IDApIHtcbiAgICAgICAgICB0aGlzLl9lbnN1cmVQb2xsSXNTY2hlZHVsZWQoKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICk7XG5cbiAgICB0aGlzLl9zdG9wQ2FsbGJhY2tzLnB1c2goYXN5bmMgKCkgPT4geyBhd2FpdCBsaXN0ZW5lcnNIYW5kbGUuc3RvcCgpOyB9KTtcblxuICAgIGlmIChvcHRpb25zLl90ZXN0T25seVBvbGxDYWxsYmFjaykge1xuICAgICAgdGhpcy5fdGVzdE9ubHlQb2xsQ2FsbGJhY2sgPSBvcHRpb25zLl90ZXN0T25seVBvbGxDYWxsYmFjaztcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgcG9sbGluZ0ludGVydmFsID1cbiAgICAgICAgdGhpcy5fY3Vyc29yRGVzY3JpcHRpb24ub3B0aW9ucy5wb2xsaW5nSW50ZXJ2YWxNcyB8fFxuICAgICAgICB0aGlzLl9jdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zLl9wb2xsaW5nSW50ZXJ2YWwgfHxcbiAgICAgICAgUE9MTElOR19JTlRFUlZBTF9NUztcblxuICAgICAgY29uc3QgaW50ZXJ2YWxIYW5kbGUgPSBNZXRlb3Iuc2V0SW50ZXJ2YWwoXG4gICAgICAgIHRoaXMuX2Vuc3VyZVBvbGxJc1NjaGVkdWxlZC5iaW5kKHRoaXMpLFxuICAgICAgICBwb2xsaW5nSW50ZXJ2YWxcbiAgICAgICk7XG5cbiAgICAgIHRoaXMuX3N0b3BDYWxsYmFja3MucHVzaCgoKSA9PiB7XG4gICAgICAgIE1ldGVvci5jbGVhckludGVydmFsKGludGVydmFsSGFuZGxlKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuX3VudGhyb3R0bGVkRW5zdXJlUG9sbElzU2NoZWR1bGVkKCk7XG5cbiAgICAoUGFja2FnZVsnZmFjdHMtYmFzZSddIGFzIGFueSk/LkZhY3RzLmluY3JlbWVudFNlcnZlckZhY3QoXG4gICAgICBcIm1vbmdvLWxpdmVkYXRhXCIsIFwib2JzZXJ2ZS1kcml2ZXJzLXBvbGxpbmdcIiwgMSk7XG4gIH1cblxuICBhc3luYyBfdW50aHJvdHRsZWRFbnN1cmVQb2xsSXNTY2hlZHVsZWQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuX3BvbGxzU2NoZWR1bGVkQnV0Tm90U3RhcnRlZCA+IDApIHJldHVybjtcbiAgICArK3RoaXMuX3BvbGxzU2NoZWR1bGVkQnV0Tm90U3RhcnRlZDtcbiAgICBhd2FpdCB0aGlzLl90YXNrUXVldWUucnVuVGFzayhhc3luYyAoKSA9PiB7XG4gICAgICBhd2FpdCB0aGlzLl9wb2xsTW9uZ28oKTtcbiAgICB9KTtcbiAgfVxuXG4gIF9zdXNwZW5kUG9sbGluZygpOiB2b2lkIHtcbiAgICArK3RoaXMuX3BvbGxzU2NoZWR1bGVkQnV0Tm90U3RhcnRlZDtcbiAgICB0aGlzLl90YXNrUXVldWUucnVuVGFzaygoKSA9PiB7fSk7XG5cbiAgICBpZiAodGhpcy5fcG9sbHNTY2hlZHVsZWRCdXROb3RTdGFydGVkICE9PSAxKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYF9wb2xsc1NjaGVkdWxlZEJ1dE5vdFN0YXJ0ZWQgaXMgJHt0aGlzLl9wb2xsc1NjaGVkdWxlZEJ1dE5vdFN0YXJ0ZWR9YCk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgX3Jlc3VtZVBvbGxpbmcoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuX3BvbGxzU2NoZWR1bGVkQnV0Tm90U3RhcnRlZCAhPT0gMSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBfcG9sbHNTY2hlZHVsZWRCdXROb3RTdGFydGVkIGlzICR7dGhpcy5fcG9sbHNTY2hlZHVsZWRCdXROb3RTdGFydGVkfWApO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLl90YXNrUXVldWUucnVuVGFzayhhc3luYyAoKSA9PiB7XG4gICAgICBhd2FpdCB0aGlzLl9wb2xsTW9uZ28oKTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIF9wb2xsTW9uZ28oKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgLS10aGlzLl9wb2xsc1NjaGVkdWxlZEJ1dE5vdFN0YXJ0ZWQ7XG5cbiAgICBpZiAodGhpcy5fc3RvcHBlZCkgcmV0dXJuO1xuXG4gICAgbGV0IGZpcnN0ID0gZmFsc2U7XG4gICAgbGV0IG5ld1Jlc3VsdHM7XG4gICAgbGV0IG9sZFJlc3VsdHMgPSB0aGlzLl9yZXN1bHRzO1xuXG4gICAgaWYgKCFvbGRSZXN1bHRzKSB7XG4gICAgICBmaXJzdCA9IHRydWU7XG4gICAgICBvbGRSZXN1bHRzID0gdGhpcy5fb3JkZXJlZCA/IFtdIDogbmV3IChMb2NhbENvbGxlY3Rpb24gYXMgYW55KS5fSWRNYXA7XG4gICAgfVxuXG4gICAgdGhpcy5fdGVzdE9ubHlQb2xsQ2FsbGJhY2s/LigpO1xuXG4gICAgY29uc3Qgd3JpdGVzRm9yQ3ljbGUgPSB0aGlzLl9wZW5kaW5nV3JpdGVzO1xuICAgIHRoaXMuX3BlbmRpbmdXcml0ZXMgPSBbXTtcblxuICAgIHRyeSB7XG4gICAgICBuZXdSZXN1bHRzID0gYXdhaXQgdGhpcy5fY3Vyc29yLmdldFJhd09iamVjdHModGhpcy5fb3JkZXJlZCk7XG4gICAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgICBpZiAoZmlyc3QgJiYgdHlwZW9mKGUuY29kZSkgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuX211bHRpcGxleGVyLnF1ZXJ5RXJyb3IoXG4gICAgICAgICAgbmV3IEVycm9yKFxuICAgICAgICAgICAgYEV4Y2VwdGlvbiB3aGlsZSBwb2xsaW5nIHF1ZXJ5ICR7XG4gICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHRoaXMuX2N1cnNvckRlc2NyaXB0aW9uKVxuICAgICAgICAgICAgfTogJHtlLm1lc3NhZ2V9YFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgQXJyYXkucHJvdG90eXBlLnB1c2guYXBwbHkodGhpcy5fcGVuZGluZ1dyaXRlcywgd3JpdGVzRm9yQ3ljbGUpO1xuICAgICAgTWV0ZW9yLl9kZWJ1ZyhgRXhjZXB0aW9uIHdoaWxlIHBvbGxpbmcgcXVlcnkgJHtcbiAgICAgICAgSlNPTi5zdHJpbmdpZnkodGhpcy5fY3Vyc29yRGVzY3JpcHRpb24pfWAsIGUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5fc3RvcHBlZCkge1xuICAgICAgKExvY2FsQ29sbGVjdGlvbiBhcyBhbnkpLl9kaWZmUXVlcnlDaGFuZ2VzKFxuICAgICAgICB0aGlzLl9vcmRlcmVkLCBvbGRSZXN1bHRzLCBuZXdSZXN1bHRzLCB0aGlzLl9tdWx0aXBsZXhlcik7XG4gICAgfVxuXG4gICAgaWYgKGZpcnN0KSB0aGlzLl9tdWx0aXBsZXhlci5yZWFkeSgpO1xuXG4gICAgdGhpcy5fcmVzdWx0cyA9IG5ld1Jlc3VsdHM7XG5cbiAgICBhd2FpdCB0aGlzLl9tdWx0aXBsZXhlci5vbkZsdXNoKGFzeW5jICgpID0+IHtcbiAgICAgIGZvciAoY29uc3QgdyBvZiB3cml0ZXNGb3JDeWNsZSkge1xuICAgICAgICBhd2FpdCB3LmNvbW1pdHRlZCgpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgc3RvcCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0aGlzLl9zdG9wcGVkID0gdHJ1ZTtcblxuICAgIGZvciAoY29uc3QgY2FsbGJhY2sgb2YgdGhpcy5fc3RvcENhbGxiYWNrcykge1xuICAgICAgYXdhaXQgY2FsbGJhY2soKTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHcgb2YgdGhpcy5fcGVuZGluZ1dyaXRlcykge1xuICAgICAgYXdhaXQgdy5jb21taXR0ZWQoKTtcbiAgICB9XG5cbiAgICAoUGFja2FnZVsnZmFjdHMtYmFzZSddIGFzIGFueSk/LkZhY3RzLmluY3JlbWVudFNlcnZlckZhY3QoXG4gICAgICBcIm1vbmdvLWxpdmVkYXRhXCIsIFwib2JzZXJ2ZS1kcml2ZXJzLXBvbGxpbmdcIiwgLTEpO1xuICB9XG59IiwiaW1wb3J0IGhhcyBmcm9tICdsb2Rhc2guaGFzJztcbmltcG9ydCBpc0VtcHR5IGZyb20gJ2xvZGFzaC5pc2VtcHR5JztcbmltcG9ydCB7IG9wbG9nVjJWMUNvbnZlcnRlciB9IGZyb20gXCIuL29wbG9nX3YyX2NvbnZlcnRlclwiO1xuaW1wb3J0IHsgY2hlY2ssIE1hdGNoIH0gZnJvbSAnbWV0ZW9yL2NoZWNrJztcbmltcG9ydCB7IEN1cnNvckRlc2NyaXB0aW9uIH0gZnJvbSAnLi9jdXJzb3JfZGVzY3JpcHRpb24nO1xuaW1wb3J0IHsgZm9yRWFjaFRyaWdnZXIsIGxpc3RlbkFsbCB9IGZyb20gJy4vbW9uZ29fZHJpdmVyJztcbmltcG9ydCB7IEN1cnNvciB9IGZyb20gJy4vY3Vyc29yJztcbmltcG9ydCBMb2NhbENvbGxlY3Rpb24gZnJvbSAnbWV0ZW9yL21pbmltb25nby9sb2NhbF9jb2xsZWN0aW9uJztcbmltcG9ydCB7IGlkRm9yT3AgfSBmcm9tICcuL29wbG9nX3RhaWxpbmcnO1xuXG52YXIgUEhBU0UgPSB7XG4gIFFVRVJZSU5HOiBcIlFVRVJZSU5HXCIsXG4gIEZFVENISU5HOiBcIkZFVENISU5HXCIsXG4gIFNURUFEWTogXCJTVEVBRFlcIlxufTtcblxuLy8gRXhjZXB0aW9uIHRocm93biBieSBfbmVlZFRvUG9sbFF1ZXJ5IHdoaWNoIHVucm9sbHMgdGhlIHN0YWNrIHVwIHRvIHRoZVxuLy8gZW5jbG9zaW5nIGNhbGwgdG8gZmluaXNoSWZOZWVkVG9Qb2xsUXVlcnkuXG52YXIgU3dpdGNoZWRUb1F1ZXJ5ID0gZnVuY3Rpb24gKCkge307XG52YXIgZmluaXNoSWZOZWVkVG9Qb2xsUXVlcnkgPSBmdW5jdGlvbiAoZikge1xuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIHRyeSB7XG4gICAgICBmLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKCEoZSBpbnN0YW5jZW9mIFN3aXRjaGVkVG9RdWVyeSkpXG4gICAgICAgIHRocm93IGU7XG4gICAgfVxuICB9O1xufTtcblxudmFyIGN1cnJlbnRJZCA9IDA7XG5cbi8qKlxuICogQGNsYXNzIE9wbG9nT2JzZXJ2ZURyaXZlclxuICogQW4gYWx0ZXJuYXRpdmUgdG8gUG9sbGluZ09ic2VydmVEcml2ZXIgd2hpY2ggZm9sbG93cyB0aGUgTW9uZ29EQiBvcGVyYXRpb24gbG9nXG4gKiBpbnN0ZWFkIG9mIHJlLXBvbGxpbmcgdGhlIHF1ZXJ5LlxuICpcbiAqIENoYXJhY3RlcmlzdGljczpcbiAqIC0gRm9sbG93cyB0aGUgTW9uZ29EQiBvcGVyYXRpb24gbG9nXG4gKiAtIERpcmVjdGx5IG9ic2VydmVzIGRhdGFiYXNlIGNoYW5nZXNcbiAqIC0gTW9yZSBlZmZpY2llbnQgdGhhbiBwb2xsaW5nIGZvciBtb3N0IHVzZSBjYXNlc1xuICogLSBSZXF1aXJlcyBhY2Nlc3MgdG8gTW9uZ29EQiBvcGxvZ1xuICpcbiAqIEludGVyZmFjZTpcbiAqIC0gQ29uc3RydWN0aW9uIGluaXRpYXRlcyBvYnNlcnZlQ2hhbmdlcyBjYWxsYmFja3MgYW5kIHJlYWR5KCkgaW52b2NhdGlvbiB0byB0aGUgT2JzZXJ2ZU11bHRpcGxleGVyXG4gKiAtIE9ic2VydmF0aW9uIGNhbiBiZSB0ZXJtaW5hdGVkIHZpYSB0aGUgc3RvcCgpIG1ldGhvZFxuICovXG5leHBvcnQgY29uc3QgT3Bsb2dPYnNlcnZlRHJpdmVyID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gIHNlbGYuX3VzZXNPcGxvZyA9IHRydWU7ICAvLyB0ZXN0cyBsb29rIGF0IHRoaXNcblxuICBzZWxmLl9pZCA9IGN1cnJlbnRJZDtcbiAgY3VycmVudElkKys7XG5cbiAgc2VsZi5fY3Vyc29yRGVzY3JpcHRpb24gPSBvcHRpb25zLmN1cnNvckRlc2NyaXB0aW9uO1xuICBzZWxmLl9tb25nb0hhbmRsZSA9IG9wdGlvbnMubW9uZ29IYW5kbGU7XG4gIHNlbGYuX211bHRpcGxleGVyID0gb3B0aW9ucy5tdWx0aXBsZXhlcjtcblxuICBpZiAob3B0aW9ucy5vcmRlcmVkKSB7XG4gICAgdGhyb3cgRXJyb3IoXCJPcGxvZ09ic2VydmVEcml2ZXIgb25seSBzdXBwb3J0cyB1bm9yZGVyZWQgb2JzZXJ2ZUNoYW5nZXNcIik7XG4gIH1cblxuICBjb25zdCBzb3J0ZXIgPSBvcHRpb25zLnNvcnRlcjtcbiAgLy8gV2UgZG9uJ3Qgc3VwcG9ydCAkbmVhciBhbmQgb3RoZXIgZ2VvLXF1ZXJpZXMgc28gaXQncyBPSyB0byBpbml0aWFsaXplIHRoZVxuICAvLyBjb21wYXJhdG9yIG9ubHkgb25jZSBpbiB0aGUgY29uc3RydWN0b3IuXG4gIGNvbnN0IGNvbXBhcmF0b3IgPSBzb3J0ZXIgJiYgc29ydGVyLmdldENvbXBhcmF0b3IoKTtcblxuICBpZiAob3B0aW9ucy5jdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zLmxpbWl0KSB7XG4gICAgLy8gVGhlcmUgYXJlIHNldmVyYWwgcHJvcGVydGllcyBvcmRlcmVkIGRyaXZlciBpbXBsZW1lbnRzOlxuICAgIC8vIC0gX2xpbWl0IGlzIGEgcG9zaXRpdmUgbnVtYmVyXG4gICAgLy8gLSBfY29tcGFyYXRvciBpcyBhIGZ1bmN0aW9uLWNvbXBhcmF0b3IgYnkgd2hpY2ggdGhlIHF1ZXJ5IGlzIG9yZGVyZWRcbiAgICAvLyAtIF91bnB1Ymxpc2hlZEJ1ZmZlciBpcyBub24tbnVsbCBNaW4vTWF4IEhlYXAsXG4gICAgLy8gICAgICAgICAgICAgICAgICAgICAgdGhlIGVtcHR5IGJ1ZmZlciBpbiBTVEVBRFkgcGhhc2UgaW1wbGllcyB0aGF0IHRoZVxuICAgIC8vICAgICAgICAgICAgICAgICAgICAgIGV2ZXJ5dGhpbmcgdGhhdCBtYXRjaGVzIHRoZSBxdWVyaWVzIHNlbGVjdG9yIGZpdHNcbiAgICAvLyAgICAgICAgICAgICAgICAgICAgICBpbnRvIHB1Ymxpc2hlZCBzZXQuXG4gICAgLy8gLSBfcHVibGlzaGVkIC0gTWF4IEhlYXAgKGFsc28gaW1wbGVtZW50cyBJZE1hcCBtZXRob2RzKVxuXG4gICAgY29uc3QgaGVhcE9wdGlvbnMgPSB7IElkTWFwOiBMb2NhbENvbGxlY3Rpb24uX0lkTWFwIH07XG4gICAgc2VsZi5fbGltaXQgPSBzZWxmLl9jdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zLmxpbWl0O1xuICAgIHNlbGYuX2NvbXBhcmF0b3IgPSBjb21wYXJhdG9yO1xuICAgIHNlbGYuX3NvcnRlciA9IHNvcnRlcjtcbiAgICBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlciA9IG5ldyBNaW5NYXhIZWFwKGNvbXBhcmF0b3IsIGhlYXBPcHRpb25zKTtcbiAgICAvLyBXZSBuZWVkIHNvbWV0aGluZyB0aGF0IGNhbiBmaW5kIE1heCB2YWx1ZSBpbiBhZGRpdGlvbiB0byBJZE1hcCBpbnRlcmZhY2VcbiAgICBzZWxmLl9wdWJsaXNoZWQgPSBuZXcgTWF4SGVhcChjb21wYXJhdG9yLCBoZWFwT3B0aW9ucyk7XG4gIH0gZWxzZSB7XG4gICAgc2VsZi5fbGltaXQgPSAwO1xuICAgIHNlbGYuX2NvbXBhcmF0b3IgPSBudWxsO1xuICAgIHNlbGYuX3NvcnRlciA9IG51bGw7XG4gICAgc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIgPSBudWxsO1xuICAgIC8vIE1lbW9yeSBHcm93dGhcbiAgICBzZWxmLl9wdWJsaXNoZWQgPSBuZXcgTG9jYWxDb2xsZWN0aW9uLl9JZE1hcDtcbiAgfVxuXG4gIC8vIEluZGljYXRlcyBpZiBpdCBpcyBzYWZlIHRvIGluc2VydCBhIG5ldyBkb2N1bWVudCBhdCB0aGUgZW5kIG9mIHRoZSBidWZmZXJcbiAgLy8gZm9yIHRoaXMgcXVlcnkuIGkuZS4gaXQgaXMga25vd24gdGhhdCB0aGVyZSBhcmUgbm8gZG9jdW1lbnRzIG1hdGNoaW5nIHRoZVxuICAvLyBzZWxlY3RvciB0aG9zZSBhcmUgbm90IGluIHB1Ymxpc2hlZCBvciBidWZmZXIuXG4gIHNlbGYuX3NhZmVBcHBlbmRUb0J1ZmZlciA9IGZhbHNlO1xuXG4gIHNlbGYuX3N0b3BwZWQgPSBmYWxzZTtcbiAgc2VsZi5fc3RvcEhhbmRsZXMgPSBbXTtcbiAgc2VsZi5fYWRkU3RvcEhhbmRsZXMgPSBmdW5jdGlvbiAobmV3U3RvcEhhbmRsZXMpIHtcbiAgICBjb25zdCBleHBlY3RlZFBhdHRlcm4gPSBNYXRjaC5PYmplY3RJbmNsdWRpbmcoeyBzdG9wOiBGdW5jdGlvbiB9KTtcbiAgICAvLyBTaW5nbGUgaXRlbSBvciBhcnJheVxuICAgIGNoZWNrKG5ld1N0b3BIYW5kbGVzLCBNYXRjaC5PbmVPZihbZXhwZWN0ZWRQYXR0ZXJuXSwgZXhwZWN0ZWRQYXR0ZXJuKSk7XG4gICAgc2VsZi5fc3RvcEhhbmRsZXMucHVzaChuZXdTdG9wSGFuZGxlcyk7XG4gIH1cblxuICBQYWNrYWdlWydmYWN0cy1iYXNlJ10gJiYgUGFja2FnZVsnZmFjdHMtYmFzZSddLkZhY3RzLmluY3JlbWVudFNlcnZlckZhY3QoXG4gICAgXCJtb25nby1saXZlZGF0YVwiLCBcIm9ic2VydmUtZHJpdmVycy1vcGxvZ1wiLCAxKTtcblxuICBzZWxmLl9yZWdpc3RlclBoYXNlQ2hhbmdlKFBIQVNFLlFVRVJZSU5HKTtcblxuICBzZWxmLl9tYXRjaGVyID0gb3B0aW9ucy5tYXRjaGVyO1xuICAvLyB3ZSBhcmUgbm93IHVzaW5nIHByb2plY3Rpb24sIG5vdCBmaWVsZHMgaW4gdGhlIGN1cnNvciBkZXNjcmlwdGlvbiBldmVuIGlmIHlvdSBwYXNzIHtmaWVsZHN9XG4gIC8vIGluIHRoZSBjdXJzb3IgY29uc3RydWN0aW9uXG4gIGNvbnN0IHByb2plY3Rpb24gPSBzZWxmLl9jdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zLmZpZWxkcyB8fCBzZWxmLl9jdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zLnByb2plY3Rpb24gfHwge307XG4gIHNlbGYuX3Byb2plY3Rpb25GbiA9IExvY2FsQ29sbGVjdGlvbi5fY29tcGlsZVByb2plY3Rpb24ocHJvamVjdGlvbik7XG4gIC8vIFByb2plY3Rpb24gZnVuY3Rpb24sIHJlc3VsdCBvZiBjb21iaW5pbmcgaW1wb3J0YW50IGZpZWxkcyBmb3Igc2VsZWN0b3IgYW5kXG4gIC8vIGV4aXN0aW5nIGZpZWxkcyBwcm9qZWN0aW9uXG4gIHNlbGYuX3NoYXJlZFByb2plY3Rpb24gPSBzZWxmLl9tYXRjaGVyLmNvbWJpbmVJbnRvUHJvamVjdGlvbihwcm9qZWN0aW9uKTtcbiAgaWYgKHNvcnRlcilcbiAgICBzZWxmLl9zaGFyZWRQcm9qZWN0aW9uID0gc29ydGVyLmNvbWJpbmVJbnRvUHJvamVjdGlvbihzZWxmLl9zaGFyZWRQcm9qZWN0aW9uKTtcbiAgc2VsZi5fc2hhcmVkUHJvamVjdGlvbkZuID0gTG9jYWxDb2xsZWN0aW9uLl9jb21waWxlUHJvamVjdGlvbihcbiAgICBzZWxmLl9zaGFyZWRQcm9qZWN0aW9uKTtcblxuICBzZWxmLl9uZWVkVG9GZXRjaCA9IG5ldyBMb2NhbENvbGxlY3Rpb24uX0lkTWFwO1xuICBzZWxmLl9jdXJyZW50bHlGZXRjaGluZyA9IG51bGw7XG4gIHNlbGYuX2ZldGNoR2VuZXJhdGlvbiA9IDA7XG5cbiAgc2VsZi5fcmVxdWVyeVdoZW5Eb25lVGhpc1F1ZXJ5ID0gZmFsc2U7XG4gIHNlbGYuX3dyaXRlc1RvQ29tbWl0V2hlbldlUmVhY2hTdGVhZHkgPSBbXTtcbiB9O1xuXG5PYmplY3QuYXNzaWduKE9wbG9nT2JzZXJ2ZURyaXZlci5wcm90b3R5cGUsIHtcbiAgX2luaXQ6IGFzeW5jIGZ1bmN0aW9uKCkge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gICAgLy8gSWYgdGhlIG9wbG9nIGhhbmRsZSB0ZWxscyB1cyB0aGF0IGl0IHNraXBwZWQgc29tZSBlbnRyaWVzIChiZWNhdXNlIGl0IGdvdFxuICAgIC8vIGJlaGluZCwgc2F5KSwgcmUtcG9sbC5cbiAgICBzZWxmLl9hZGRTdG9wSGFuZGxlcyhzZWxmLl9tb25nb0hhbmRsZS5fb3Bsb2dIYW5kbGUub25Ta2lwcGVkRW50cmllcyhcbiAgICAgIGZpbmlzaElmTmVlZFRvUG9sbFF1ZXJ5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHNlbGYuX25lZWRUb1BvbGxRdWVyeSgpO1xuICAgICAgfSlcbiAgICApKTtcbiAgICBcbiAgICBhd2FpdCBmb3JFYWNoVHJpZ2dlcihzZWxmLl9jdXJzb3JEZXNjcmlwdGlvbiwgYXN5bmMgZnVuY3Rpb24gKHRyaWdnZXIpIHtcbiAgICAgIHNlbGYuX2FkZFN0b3BIYW5kbGVzKGF3YWl0IHNlbGYuX21vbmdvSGFuZGxlLl9vcGxvZ0hhbmRsZS5vbk9wbG9nRW50cnkoXG4gICAgICAgIHRyaWdnZXIsIGZ1bmN0aW9uIChub3RpZmljYXRpb24pIHtcbiAgICAgICAgICBmaW5pc2hJZk5lZWRUb1BvbGxRdWVyeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBjb25zdCBvcCA9IG5vdGlmaWNhdGlvbi5vcDtcbiAgICAgICAgICAgIGlmIChub3RpZmljYXRpb24uZHJvcENvbGxlY3Rpb24gfHwgbm90aWZpY2F0aW9uLmRyb3BEYXRhYmFzZSkge1xuICAgICAgICAgICAgICAvLyBOb3RlOiB0aGlzIGNhbGwgaXMgbm90IGFsbG93ZWQgdG8gYmxvY2sgb24gYW55dGhpbmcgKGVzcGVjaWFsbHlcbiAgICAgICAgICAgICAgLy8gb24gd2FpdGluZyBmb3Igb3Bsb2cgZW50cmllcyB0byBjYXRjaCB1cCkgYmVjYXVzZSB0aGF0IHdpbGwgYmxvY2tcbiAgICAgICAgICAgICAgLy8gb25PcGxvZ0VudHJ5IVxuICAgICAgICAgICAgICByZXR1cm4gc2VsZi5fbmVlZFRvUG9sbFF1ZXJ5KCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyBBbGwgb3RoZXIgb3BlcmF0b3JzIHNob3VsZCBiZSBoYW5kbGVkIGRlcGVuZGluZyBvbiBwaGFzZVxuICAgICAgICAgICAgICBpZiAoc2VsZi5fcGhhc2UgPT09IFBIQVNFLlFVRVJZSU5HKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNlbGYuX2hhbmRsZU9wbG9nRW50cnlRdWVyeWluZyhvcCk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNlbGYuX2hhbmRsZU9wbG9nRW50cnlTdGVhZHlPckZldGNoaW5nKG9wKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pKCk7XG4gICAgICAgIH1cbiAgICAgICkpO1xuICAgIH0pO1xuICBcbiAgICAvLyBYWFggb3JkZXJpbmcgdy5yLnQuIGV2ZXJ5dGhpbmcgZWxzZT9cbiAgICBzZWxmLl9hZGRTdG9wSGFuZGxlcyhhd2FpdCBsaXN0ZW5BbGwoXG4gICAgICBzZWxmLl9jdXJzb3JEZXNjcmlwdGlvbiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBJZiB3ZSdyZSBub3QgaW4gYSBwcmUtZmlyZSB3cml0ZSBmZW5jZSwgd2UgZG9uJ3QgaGF2ZSB0byBkbyBhbnl0aGluZy5cbiAgICAgICAgY29uc3QgZmVuY2UgPSBERFBTZXJ2ZXIuX2dldEN1cnJlbnRGZW5jZSgpO1xuICAgICAgICBpZiAoIWZlbmNlIHx8IGZlbmNlLmZpcmVkKVxuICAgICAgICAgIHJldHVybjtcbiAgXG4gICAgICAgIGlmIChmZW5jZS5fb3Bsb2dPYnNlcnZlRHJpdmVycykge1xuICAgICAgICAgIGZlbmNlLl9vcGxvZ09ic2VydmVEcml2ZXJzW3NlbGYuX2lkXSA9IHNlbGY7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gIFxuICAgICAgICBmZW5jZS5fb3Bsb2dPYnNlcnZlRHJpdmVycyA9IHt9O1xuICAgICAgICBmZW5jZS5fb3Bsb2dPYnNlcnZlRHJpdmVyc1tzZWxmLl9pZF0gPSBzZWxmO1xuICBcbiAgICAgICAgZmVuY2Uub25CZWZvcmVGaXJlKGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBjb25zdCBkcml2ZXJzID0gZmVuY2UuX29wbG9nT2JzZXJ2ZURyaXZlcnM7XG4gICAgICAgICAgZGVsZXRlIGZlbmNlLl9vcGxvZ09ic2VydmVEcml2ZXJzO1xuICBcbiAgICAgICAgICAvLyBUaGlzIGZlbmNlIGNhbm5vdCBmaXJlIHVudGlsIHdlJ3ZlIGNhdWdodCB1cCB0byBcInRoaXMgcG9pbnRcIiBpbiB0aGVcbiAgICAgICAgICAvLyBvcGxvZywgYW5kIGFsbCBvYnNlcnZlcnMgbWFkZSBpdCBiYWNrIHRvIHRoZSBzdGVhZHkgc3RhdGUuXG4gICAgICAgICAgYXdhaXQgc2VsZi5fbW9uZ29IYW5kbGUuX29wbG9nSGFuZGxlLndhaXRVbnRpbENhdWdodFVwKCk7XG4gIFxuICAgICAgICAgIGZvciAoY29uc3QgZHJpdmVyIG9mIE9iamVjdC52YWx1ZXMoZHJpdmVycykpIHtcbiAgICAgICAgICAgIGlmIChkcml2ZXIuX3N0b3BwZWQpXG4gICAgICAgICAgICAgIGNvbnRpbnVlO1xuICBcbiAgICAgICAgICAgIGNvbnN0IHdyaXRlID0gYXdhaXQgZmVuY2UuYmVnaW5Xcml0ZSgpO1xuICAgICAgICAgICAgaWYgKGRyaXZlci5fcGhhc2UgPT09IFBIQVNFLlNURUFEWSkge1xuICAgICAgICAgICAgICAvLyBNYWtlIHN1cmUgdGhhdCBhbGwgb2YgdGhlIGNhbGxiYWNrcyBoYXZlIG1hZGUgaXQgdGhyb3VnaCB0aGVcbiAgICAgICAgICAgICAgLy8gbXVsdGlwbGV4ZXIgYW5kIGJlZW4gZGVsaXZlcmVkIHRvIE9ic2VydmVIYW5kbGVzIGJlZm9yZSBjb21taXR0aW5nXG4gICAgICAgICAgICAgIC8vIHdyaXRlcy5cbiAgICAgICAgICAgICAgYXdhaXQgZHJpdmVyLl9tdWx0aXBsZXhlci5vbkZsdXNoKHdyaXRlLmNvbW1pdHRlZCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBkcml2ZXIuX3dyaXRlc1RvQ29tbWl0V2hlbldlUmVhY2hTdGVhZHkucHVzaCh3cml0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICApKTtcbiAgXG4gICAgLy8gV2hlbiBNb25nbyBmYWlscyBvdmVyLCB3ZSBuZWVkIHRvIHJlcG9sbCB0aGUgcXVlcnksIGluIGNhc2Ugd2UgcHJvY2Vzc2VkIGFuXG4gICAgLy8gb3Bsb2cgZW50cnkgdGhhdCBnb3Qgcm9sbGVkIGJhY2suXG4gICAgc2VsZi5fYWRkU3RvcEhhbmRsZXMoc2VsZi5fbW9uZ29IYW5kbGUuX29uRmFpbG92ZXIoZmluaXNoSWZOZWVkVG9Qb2xsUXVlcnkoXG4gICAgICBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBzZWxmLl9uZWVkVG9Qb2xsUXVlcnkoKTtcbiAgICAgIH0pKSk7XG4gIFxuICAgIC8vIEdpdmUgX29ic2VydmVDaGFuZ2VzIGEgY2hhbmNlIHRvIGFkZCB0aGUgbmV3IE9ic2VydmVIYW5kbGUgdG8gb3VyXG4gICAgLy8gbXVsdGlwbGV4ZXIsIHNvIHRoYXQgdGhlIGFkZGVkIGNhbGxzIGdldCBzdHJlYW1lZC5cbiAgICByZXR1cm4gc2VsZi5fcnVuSW5pdGlhbFF1ZXJ5KCk7XG4gIH0sXG4gIF9hZGRQdWJsaXNoZWQ6IGZ1bmN0aW9uIChpZCwgZG9jKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkKGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBmaWVsZHMgPSBPYmplY3QuYXNzaWduKHt9LCBkb2MpO1xuICAgICAgZGVsZXRlIGZpZWxkcy5faWQ7XG4gICAgICBzZWxmLl9wdWJsaXNoZWQuc2V0KGlkLCBzZWxmLl9zaGFyZWRQcm9qZWN0aW9uRm4oZG9jKSk7XG4gICAgICBzZWxmLl9tdWx0aXBsZXhlci5hZGRlZChpZCwgc2VsZi5fcHJvamVjdGlvbkZuKGZpZWxkcykpO1xuXG4gICAgICAvLyBBZnRlciBhZGRpbmcgdGhpcyBkb2N1bWVudCwgdGhlIHB1Ymxpc2hlZCBzZXQgbWlnaHQgYmUgb3ZlcmZsb3dlZFxuICAgICAgLy8gKGV4Y2VlZGluZyBjYXBhY2l0eSBzcGVjaWZpZWQgYnkgbGltaXQpLiBJZiBzbywgcHVzaCB0aGUgbWF4aW11bVxuICAgICAgLy8gZWxlbWVudCB0byB0aGUgYnVmZmVyLCB3ZSBtaWdodCB3YW50IHRvIHNhdmUgaXQgaW4gbWVtb3J5IHRvIHJlZHVjZSB0aGVcbiAgICAgIC8vIGFtb3VudCBvZiBNb25nbyBsb29rdXBzIGluIHRoZSBmdXR1cmUuXG4gICAgICBpZiAoc2VsZi5fbGltaXQgJiYgc2VsZi5fcHVibGlzaGVkLnNpemUoKSA+IHNlbGYuX2xpbWl0KSB7XG4gICAgICAgIC8vIFhYWCBpbiB0aGVvcnkgdGhlIHNpemUgb2YgcHVibGlzaGVkIGlzIG5vIG1vcmUgdGhhbiBsaW1pdCsxXG4gICAgICAgIGlmIChzZWxmLl9wdWJsaXNoZWQuc2l6ZSgpICE9PSBzZWxmLl9saW1pdCArIDEpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJBZnRlciBhZGRpbmcgdG8gcHVibGlzaGVkLCBcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICAgIChzZWxmLl9wdWJsaXNoZWQuc2l6ZSgpIC0gc2VsZi5fbGltaXQpICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgZG9jdW1lbnRzIGFyZSBvdmVyZmxvd2luZyB0aGUgc2V0XCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG92ZXJmbG93aW5nRG9jSWQgPSBzZWxmLl9wdWJsaXNoZWQubWF4RWxlbWVudElkKCk7XG4gICAgICAgIHZhciBvdmVyZmxvd2luZ0RvYyA9IHNlbGYuX3B1Ymxpc2hlZC5nZXQob3ZlcmZsb3dpbmdEb2NJZCk7XG5cbiAgICAgICAgaWYgKEVKU09OLmVxdWFscyhvdmVyZmxvd2luZ0RvY0lkLCBpZCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUaGUgZG9jdW1lbnQganVzdCBhZGRlZCBpcyBvdmVyZmxvd2luZyB0aGUgcHVibGlzaGVkIHNldFwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHNlbGYuX3B1Ymxpc2hlZC5yZW1vdmUob3ZlcmZsb3dpbmdEb2NJZCk7XG4gICAgICAgIHNlbGYuX211bHRpcGxleGVyLnJlbW92ZWQob3ZlcmZsb3dpbmdEb2NJZCk7XG4gICAgICAgIHNlbGYuX2FkZEJ1ZmZlcmVkKG92ZXJmbG93aW5nRG9jSWQsIG92ZXJmbG93aW5nRG9jKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSxcbiAgX3JlbW92ZVB1Ymxpc2hlZDogZnVuY3Rpb24gKGlkKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkKGZ1bmN0aW9uICgpIHtcbiAgICAgIHNlbGYuX3B1Ymxpc2hlZC5yZW1vdmUoaWQpO1xuICAgICAgc2VsZi5fbXVsdGlwbGV4ZXIucmVtb3ZlZChpZCk7XG4gICAgICBpZiAoISBzZWxmLl9saW1pdCB8fCBzZWxmLl9wdWJsaXNoZWQuc2l6ZSgpID09PSBzZWxmLl9saW1pdClcbiAgICAgICAgcmV0dXJuO1xuXG4gICAgICBpZiAoc2VsZi5fcHVibGlzaGVkLnNpemUoKSA+IHNlbGYuX2xpbWl0KVxuICAgICAgICB0aHJvdyBFcnJvcihcInNlbGYuX3B1Ymxpc2hlZCBnb3QgdG9vIGJpZ1wiKTtcblxuICAgICAgLy8gT0ssIHdlIGFyZSBwdWJsaXNoaW5nIGxlc3MgdGhhbiB0aGUgbGltaXQuIE1heWJlIHdlIHNob3VsZCBsb29rIGluIHRoZVxuICAgICAgLy8gYnVmZmVyIHRvIGZpbmQgdGhlIG5leHQgZWxlbWVudCBwYXN0IHdoYXQgd2Ugd2VyZSBwdWJsaXNoaW5nIGJlZm9yZS5cblxuICAgICAgaWYgKCFzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5lbXB0eSgpKSB7XG4gICAgICAgIC8vIFRoZXJlJ3Mgc29tZXRoaW5nIGluIHRoZSBidWZmZXI7IG1vdmUgdGhlIGZpcnN0IHRoaW5nIGluIGl0IHRvXG4gICAgICAgIC8vIF9wdWJsaXNoZWQuXG4gICAgICAgIHZhciBuZXdEb2NJZCA9IHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLm1pbkVsZW1lbnRJZCgpO1xuICAgICAgICB2YXIgbmV3RG9jID0gc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIuZ2V0KG5ld0RvY0lkKTtcbiAgICAgICAgc2VsZi5fcmVtb3ZlQnVmZmVyZWQobmV3RG9jSWQpO1xuICAgICAgICBzZWxmLl9hZGRQdWJsaXNoZWQobmV3RG9jSWQsIG5ld0RvYyk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gVGhlcmUncyBub3RoaW5nIGluIHRoZSBidWZmZXIuICBUaGlzIGNvdWxkIG1lYW4gb25lIG9mIGEgZmV3IHRoaW5ncy5cblxuICAgICAgLy8gKGEpIFdlIGNvdWxkIGJlIGluIHRoZSBtaWRkbGUgb2YgcmUtcnVubmluZyB0aGUgcXVlcnkgKHNwZWNpZmljYWxseSwgd2VcbiAgICAgIC8vIGNvdWxkIGJlIGluIF9wdWJsaXNoTmV3UmVzdWx0cykuIEluIHRoYXQgY2FzZSwgX3VucHVibGlzaGVkQnVmZmVyIGlzXG4gICAgICAvLyBlbXB0eSBiZWNhdXNlIHdlIGNsZWFyIGl0IGF0IHRoZSBiZWdpbm5pbmcgb2YgX3B1Ymxpc2hOZXdSZXN1bHRzLiBJblxuICAgICAgLy8gdGhpcyBjYXNlLCBvdXIgY2FsbGVyIGFscmVhZHkga25vd3MgdGhlIGVudGlyZSBhbnN3ZXIgdG8gdGhlIHF1ZXJ5IGFuZFxuICAgICAgLy8gd2UgZG9uJ3QgbmVlZCB0byBkbyBhbnl0aGluZyBmYW5jeSBoZXJlLiAgSnVzdCByZXR1cm4uXG4gICAgICBpZiAoc2VsZi5fcGhhc2UgPT09IFBIQVNFLlFVRVJZSU5HKVxuICAgICAgICByZXR1cm47XG5cbiAgICAgIC8vIChiKSBXZSdyZSBwcmV0dHkgY29uZmlkZW50IHRoYXQgdGhlIHVuaW9uIG9mIF9wdWJsaXNoZWQgYW5kXG4gICAgICAvLyBfdW5wdWJsaXNoZWRCdWZmZXIgY29udGFpbiBhbGwgZG9jdW1lbnRzIHRoYXQgbWF0Y2ggc2VsZWN0b3IuIEJlY2F1c2VcbiAgICAgIC8vIF91bnB1Ymxpc2hlZEJ1ZmZlciBpcyBlbXB0eSwgdGhhdCBtZWFucyB3ZSdyZSBjb25maWRlbnQgdGhhdCBfcHVibGlzaGVkXG4gICAgICAvLyBjb250YWlucyBhbGwgZG9jdW1lbnRzIHRoYXQgbWF0Y2ggc2VsZWN0b3IuIFNvIHdlIGhhdmUgbm90aGluZyB0byBkby5cbiAgICAgIGlmIChzZWxmLl9zYWZlQXBwZW5kVG9CdWZmZXIpXG4gICAgICAgIHJldHVybjtcblxuICAgICAgLy8gKGMpIE1heWJlIHRoZXJlIGFyZSBvdGhlciBkb2N1bWVudHMgb3V0IHRoZXJlIHRoYXQgc2hvdWxkIGJlIGluIG91clxuICAgICAgLy8gYnVmZmVyLiBCdXQgaW4gdGhhdCBjYXNlLCB3aGVuIHdlIGVtcHRpZWQgX3VucHVibGlzaGVkQnVmZmVyIGluXG4gICAgICAvLyBfcmVtb3ZlQnVmZmVyZWQsIHdlIHNob3VsZCBoYXZlIGNhbGxlZCBfbmVlZFRvUG9sbFF1ZXJ5LCB3aGljaCB3aWxsXG4gICAgICAvLyBlaXRoZXIgcHV0IHNvbWV0aGluZyBpbiBfdW5wdWJsaXNoZWRCdWZmZXIgb3Igc2V0IF9zYWZlQXBwZW5kVG9CdWZmZXJcbiAgICAgIC8vIChvciBib3RoKSwgYW5kIGl0IHdpbGwgcHV0IHVzIGluIFFVRVJZSU5HIGZvciB0aGF0IHdob2xlIHRpbWUuIFNvIGluXG4gICAgICAvLyBmYWN0LCB3ZSBzaG91bGRuJ3QgYmUgYWJsZSB0byBnZXQgaGVyZS5cblxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQnVmZmVyIGluZXhwbGljYWJseSBlbXB0eVwiKTtcbiAgICB9KTtcbiAgfSxcbiAgX2NoYW5nZVB1Ymxpc2hlZDogZnVuY3Rpb24gKGlkLCBvbGREb2MsIG5ld0RvYykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmdW5jdGlvbiAoKSB7XG4gICAgICBzZWxmLl9wdWJsaXNoZWQuc2V0KGlkLCBzZWxmLl9zaGFyZWRQcm9qZWN0aW9uRm4obmV3RG9jKSk7XG4gICAgICB2YXIgcHJvamVjdGVkTmV3ID0gc2VsZi5fcHJvamVjdGlvbkZuKG5ld0RvYyk7XG4gICAgICB2YXIgcHJvamVjdGVkT2xkID0gc2VsZi5fcHJvamVjdGlvbkZuKG9sZERvYyk7XG4gICAgICB2YXIgY2hhbmdlZCA9IERpZmZTZXF1ZW5jZS5tYWtlQ2hhbmdlZEZpZWxkcyhcbiAgICAgICAgcHJvamVjdGVkTmV3LCBwcm9qZWN0ZWRPbGQpO1xuICAgICAgaWYgKCFpc0VtcHR5KGNoYW5nZWQpKVxuICAgICAgICBzZWxmLl9tdWx0aXBsZXhlci5jaGFuZ2VkKGlkLCBjaGFuZ2VkKTtcbiAgICB9KTtcbiAgfSxcbiAgX2FkZEJ1ZmZlcmVkOiBmdW5jdGlvbiAoaWQsIGRvYykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmdW5jdGlvbiAoKSB7XG4gICAgICBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5zZXQoaWQsIHNlbGYuX3NoYXJlZFByb2plY3Rpb25Gbihkb2MpKTtcblxuICAgICAgLy8gSWYgc29tZXRoaW5nIGlzIG92ZXJmbG93aW5nIHRoZSBidWZmZXIsIHdlIGp1c3QgcmVtb3ZlIGl0IGZyb20gY2FjaGVcbiAgICAgIGlmIChzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5zaXplKCkgPiBzZWxmLl9saW1pdCkge1xuICAgICAgICB2YXIgbWF4QnVmZmVyZWRJZCA9IHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLm1heEVsZW1lbnRJZCgpO1xuXG4gICAgICAgIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLnJlbW92ZShtYXhCdWZmZXJlZElkKTtcblxuICAgICAgICAvLyBTaW5jZSBzb21ldGhpbmcgbWF0Y2hpbmcgaXMgcmVtb3ZlZCBmcm9tIGNhY2hlIChib3RoIHB1Ymxpc2hlZCBzZXQgYW5kXG4gICAgICAgIC8vIGJ1ZmZlciksIHNldCBmbGFnIHRvIGZhbHNlXG4gICAgICAgIHNlbGYuX3NhZmVBcHBlbmRUb0J1ZmZlciA9IGZhbHNlO1xuICAgICAgfVxuICAgIH0pO1xuICB9LFxuICAvLyBJcyBjYWxsZWQgZWl0aGVyIHRvIHJlbW92ZSB0aGUgZG9jIGNvbXBsZXRlbHkgZnJvbSBtYXRjaGluZyBzZXQgb3IgdG8gbW92ZVxuICAvLyBpdCB0byB0aGUgcHVibGlzaGVkIHNldCBsYXRlci5cbiAgX3JlbW92ZUJ1ZmZlcmVkOiBmdW5jdGlvbiAoaWQpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIucmVtb3ZlKGlkKTtcbiAgICAgIC8vIFRvIGtlZXAgdGhlIGNvbnRyYWN0IFwiYnVmZmVyIGlzIG5ldmVyIGVtcHR5IGluIFNURUFEWSBwaGFzZSB1bmxlc3MgdGhlXG4gICAgICAvLyBldmVyeXRoaW5nIG1hdGNoaW5nIGZpdHMgaW50byBwdWJsaXNoZWRcIiB0cnVlLCB3ZSBwb2xsIGV2ZXJ5dGhpbmcgYXNcbiAgICAgIC8vIHNvb24gYXMgd2Ugc2VlIHRoZSBidWZmZXIgYmVjb21pbmcgZW1wdHkuXG4gICAgICBpZiAoISBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5zaXplKCkgJiYgISBzZWxmLl9zYWZlQXBwZW5kVG9CdWZmZXIpXG4gICAgICAgIHNlbGYuX25lZWRUb1BvbGxRdWVyeSgpO1xuICAgIH0pO1xuICB9LFxuICAvLyBDYWxsZWQgd2hlbiBhIGRvY3VtZW50IGhhcyBqb2luZWQgdGhlIFwiTWF0Y2hpbmdcIiByZXN1bHRzIHNldC5cbiAgLy8gVGFrZXMgcmVzcG9uc2liaWxpdHkgb2Yga2VlcGluZyBfdW5wdWJsaXNoZWRCdWZmZXIgaW4gc3luYyB3aXRoIF9wdWJsaXNoZWRcbiAgLy8gYW5kIHRoZSBlZmZlY3Qgb2YgbGltaXQgZW5mb3JjZWQuXG4gIF9hZGRNYXRjaGluZzogZnVuY3Rpb24gKGRvYykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgaWQgPSBkb2MuX2lkO1xuICAgICAgaWYgKHNlbGYuX3B1Ymxpc2hlZC5oYXMoaWQpKVxuICAgICAgICB0aHJvdyBFcnJvcihcInRyaWVkIHRvIGFkZCBzb21ldGhpbmcgYWxyZWFkeSBwdWJsaXNoZWQgXCIgKyBpZCk7XG4gICAgICBpZiAoc2VsZi5fbGltaXQgJiYgc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIuaGFzKGlkKSlcbiAgICAgICAgdGhyb3cgRXJyb3IoXCJ0cmllZCB0byBhZGQgc29tZXRoaW5nIGFscmVhZHkgZXhpc3RlZCBpbiBidWZmZXIgXCIgKyBpZCk7XG5cbiAgICAgIHZhciBsaW1pdCA9IHNlbGYuX2xpbWl0O1xuICAgICAgdmFyIGNvbXBhcmF0b3IgPSBzZWxmLl9jb21wYXJhdG9yO1xuICAgICAgdmFyIG1heFB1Ymxpc2hlZCA9IChsaW1pdCAmJiBzZWxmLl9wdWJsaXNoZWQuc2l6ZSgpID4gMCkgP1xuICAgICAgICBzZWxmLl9wdWJsaXNoZWQuZ2V0KHNlbGYuX3B1Ymxpc2hlZC5tYXhFbGVtZW50SWQoKSkgOiBudWxsO1xuICAgICAgdmFyIG1heEJ1ZmZlcmVkID0gKGxpbWl0ICYmIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLnNpemUoKSA+IDApXG4gICAgICAgID8gc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIuZ2V0KHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLm1heEVsZW1lbnRJZCgpKVxuICAgICAgICA6IG51bGw7XG4gICAgICAvLyBUaGUgcXVlcnkgaXMgdW5saW1pdGVkIG9yIGRpZG4ndCBwdWJsaXNoIGVub3VnaCBkb2N1bWVudHMgeWV0IG9yIHRoZVxuICAgICAgLy8gbmV3IGRvY3VtZW50IHdvdWxkIGZpdCBpbnRvIHB1Ymxpc2hlZCBzZXQgcHVzaGluZyB0aGUgbWF4aW11bSBlbGVtZW50XG4gICAgICAvLyBvdXQsIHRoZW4gd2UgbmVlZCB0byBwdWJsaXNoIHRoZSBkb2MuXG4gICAgICB2YXIgdG9QdWJsaXNoID0gISBsaW1pdCB8fCBzZWxmLl9wdWJsaXNoZWQuc2l6ZSgpIDwgbGltaXQgfHxcbiAgICAgICAgY29tcGFyYXRvcihkb2MsIG1heFB1Ymxpc2hlZCkgPCAwO1xuXG4gICAgICAvLyBPdGhlcndpc2Ugd2UgbWlnaHQgbmVlZCB0byBidWZmZXIgaXQgKG9ubHkgaW4gY2FzZSBvZiBsaW1pdGVkIHF1ZXJ5KS5cbiAgICAgIC8vIEJ1ZmZlcmluZyBpcyBhbGxvd2VkIGlmIHRoZSBidWZmZXIgaXMgbm90IGZpbGxlZCB1cCB5ZXQgYW5kIGFsbFxuICAgICAgLy8gbWF0Y2hpbmcgZG9jcyBhcmUgZWl0aGVyIGluIHRoZSBwdWJsaXNoZWQgc2V0IG9yIGluIHRoZSBidWZmZXIuXG4gICAgICB2YXIgY2FuQXBwZW5kVG9CdWZmZXIgPSAhdG9QdWJsaXNoICYmIHNlbGYuX3NhZmVBcHBlbmRUb0J1ZmZlciAmJlxuICAgICAgICBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5zaXplKCkgPCBsaW1pdDtcblxuICAgICAgLy8gT3IgaWYgaXQgaXMgc21hbGwgZW5vdWdoIHRvIGJlIHNhZmVseSBpbnNlcnRlZCB0byB0aGUgbWlkZGxlIG9yIHRoZVxuICAgICAgLy8gYmVnaW5uaW5nIG9mIHRoZSBidWZmZXIuXG4gICAgICB2YXIgY2FuSW5zZXJ0SW50b0J1ZmZlciA9ICF0b1B1Ymxpc2ggJiYgbWF4QnVmZmVyZWQgJiZcbiAgICAgICAgY29tcGFyYXRvcihkb2MsIG1heEJ1ZmZlcmVkKSA8PSAwO1xuXG4gICAgICB2YXIgdG9CdWZmZXIgPSBjYW5BcHBlbmRUb0J1ZmZlciB8fCBjYW5JbnNlcnRJbnRvQnVmZmVyO1xuXG4gICAgICBpZiAodG9QdWJsaXNoKSB7XG4gICAgICAgIHNlbGYuX2FkZFB1Ymxpc2hlZChpZCwgZG9jKTtcbiAgICAgIH0gZWxzZSBpZiAodG9CdWZmZXIpIHtcbiAgICAgICAgc2VsZi5fYWRkQnVmZmVyZWQoaWQsIGRvYyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBkcm9wcGluZyBpdCBhbmQgbm90IHNhdmluZyB0byB0aGUgY2FjaGVcbiAgICAgICAgc2VsZi5fc2FmZUFwcGVuZFRvQnVmZmVyID0gZmFsc2U7XG4gICAgICB9XG4gICAgfSk7XG4gIH0sXG4gIC8vIENhbGxlZCB3aGVuIGEgZG9jdW1lbnQgbGVhdmVzIHRoZSBcIk1hdGNoaW5nXCIgcmVzdWx0cyBzZXQuXG4gIC8vIFRha2VzIHJlc3BvbnNpYmlsaXR5IG9mIGtlZXBpbmcgX3VucHVibGlzaGVkQnVmZmVyIGluIHN5bmMgd2l0aCBfcHVibGlzaGVkXG4gIC8vIGFuZCB0aGUgZWZmZWN0IG9mIGxpbWl0IGVuZm9yY2VkLlxuICBfcmVtb3ZlTWF0Y2hpbmc6IGZ1bmN0aW9uIChpZCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoISBzZWxmLl9wdWJsaXNoZWQuaGFzKGlkKSAmJiAhIHNlbGYuX2xpbWl0KVxuICAgICAgICB0aHJvdyBFcnJvcihcInRyaWVkIHRvIHJlbW92ZSBzb21ldGhpbmcgbWF0Y2hpbmcgYnV0IG5vdCBjYWNoZWQgXCIgKyBpZCk7XG5cbiAgICAgIGlmIChzZWxmLl9wdWJsaXNoZWQuaGFzKGlkKSkge1xuICAgICAgICBzZWxmLl9yZW1vdmVQdWJsaXNoZWQoaWQpO1xuICAgICAgfSBlbHNlIGlmIChzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5oYXMoaWQpKSB7XG4gICAgICAgIHNlbGYuX3JlbW92ZUJ1ZmZlcmVkKGlkKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSxcbiAgX2hhbmRsZURvYzogZnVuY3Rpb24gKGlkLCBuZXdEb2MpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIG1hdGNoZXNOb3cgPSBuZXdEb2MgJiYgc2VsZi5fbWF0Y2hlci5kb2N1bWVudE1hdGNoZXMobmV3RG9jKS5yZXN1bHQ7XG5cbiAgICAgIHZhciBwdWJsaXNoZWRCZWZvcmUgPSBzZWxmLl9wdWJsaXNoZWQuaGFzKGlkKTtcbiAgICAgIHZhciBidWZmZXJlZEJlZm9yZSA9IHNlbGYuX2xpbWl0ICYmIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLmhhcyhpZCk7XG4gICAgICB2YXIgY2FjaGVkQmVmb3JlID0gcHVibGlzaGVkQmVmb3JlIHx8IGJ1ZmZlcmVkQmVmb3JlO1xuXG4gICAgICBpZiAobWF0Y2hlc05vdyAmJiAhY2FjaGVkQmVmb3JlKSB7XG4gICAgICAgIHNlbGYuX2FkZE1hdGNoaW5nKG5ld0RvYyk7XG4gICAgICB9IGVsc2UgaWYgKGNhY2hlZEJlZm9yZSAmJiAhbWF0Y2hlc05vdykge1xuICAgICAgICBzZWxmLl9yZW1vdmVNYXRjaGluZyhpZCk7XG4gICAgICB9IGVsc2UgaWYgKGNhY2hlZEJlZm9yZSAmJiBtYXRjaGVzTm93KSB7XG4gICAgICAgIHZhciBvbGREb2MgPSBzZWxmLl9wdWJsaXNoZWQuZ2V0KGlkKTtcbiAgICAgICAgdmFyIGNvbXBhcmF0b3IgPSBzZWxmLl9jb21wYXJhdG9yO1xuICAgICAgICB2YXIgbWluQnVmZmVyZWQgPSBzZWxmLl9saW1pdCAmJiBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5zaXplKCkgJiZcbiAgICAgICAgICBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5nZXQoc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIubWluRWxlbWVudElkKCkpO1xuICAgICAgICB2YXIgbWF4QnVmZmVyZWQ7XG5cbiAgICAgICAgaWYgKHB1Ymxpc2hlZEJlZm9yZSkge1xuICAgICAgICAgIC8vIFVubGltaXRlZCBjYXNlIHdoZXJlIHRoZSBkb2N1bWVudCBzdGF5cyBpbiBwdWJsaXNoZWQgb25jZSBpdFxuICAgICAgICAgIC8vIG1hdGNoZXMgb3IgdGhlIGNhc2Ugd2hlbiB3ZSBkb24ndCBoYXZlIGVub3VnaCBtYXRjaGluZyBkb2NzIHRvXG4gICAgICAgICAgLy8gcHVibGlzaCBvciB0aGUgY2hhbmdlZCBidXQgbWF0Y2hpbmcgZG9jIHdpbGwgc3RheSBpbiBwdWJsaXNoZWRcbiAgICAgICAgICAvLyBhbnl3YXlzLlxuICAgICAgICAgIC8vXG4gICAgICAgICAgLy8gWFhYOiBXZSByZWx5IG9uIHRoZSBlbXB0aW5lc3Mgb2YgYnVmZmVyLiBCZSBzdXJlIHRvIG1haW50YWluIHRoZVxuICAgICAgICAgIC8vIGZhY3QgdGhhdCBidWZmZXIgY2FuJ3QgYmUgZW1wdHkgaWYgdGhlcmUgYXJlIG1hdGNoaW5nIGRvY3VtZW50cyBub3RcbiAgICAgICAgICAvLyBwdWJsaXNoZWQuIE5vdGFibHksIHdlIGRvbid0IHdhbnQgdG8gc2NoZWR1bGUgcmVwb2xsIGFuZCBjb250aW51ZVxuICAgICAgICAgIC8vIHJlbHlpbmcgb24gdGhpcyBwcm9wZXJ0eS5cbiAgICAgICAgICB2YXIgc3RheXNJblB1Ymxpc2hlZCA9ICEgc2VsZi5fbGltaXQgfHxcbiAgICAgICAgICAgIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLnNpemUoKSA9PT0gMCB8fFxuICAgICAgICAgICAgY29tcGFyYXRvcihuZXdEb2MsIG1pbkJ1ZmZlcmVkKSA8PSAwO1xuXG4gICAgICAgICAgaWYgKHN0YXlzSW5QdWJsaXNoZWQpIHtcbiAgICAgICAgICAgIHNlbGYuX2NoYW5nZVB1Ymxpc2hlZChpZCwgb2xkRG9jLCBuZXdEb2MpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBhZnRlciB0aGUgY2hhbmdlIGRvYyBkb2Vzbid0IHN0YXkgaW4gdGhlIHB1Ymxpc2hlZCwgcmVtb3ZlIGl0XG4gICAgICAgICAgICBzZWxmLl9yZW1vdmVQdWJsaXNoZWQoaWQpO1xuICAgICAgICAgICAgLy8gYnV0IGl0IGNhbiBtb3ZlIGludG8gYnVmZmVyZWQgbm93LCBjaGVjayBpdFxuICAgICAgICAgICAgbWF4QnVmZmVyZWQgPSBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5nZXQoXG4gICAgICAgICAgICAgIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLm1heEVsZW1lbnRJZCgpKTtcblxuICAgICAgICAgICAgdmFyIHRvQnVmZmVyID0gc2VsZi5fc2FmZUFwcGVuZFRvQnVmZmVyIHx8XG4gICAgICAgICAgICAgICAgICAobWF4QnVmZmVyZWQgJiYgY29tcGFyYXRvcihuZXdEb2MsIG1heEJ1ZmZlcmVkKSA8PSAwKTtcblxuICAgICAgICAgICAgaWYgKHRvQnVmZmVyKSB7XG4gICAgICAgICAgICAgIHNlbGYuX2FkZEJ1ZmZlcmVkKGlkLCBuZXdEb2MpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgLy8gVGhyb3cgYXdheSBmcm9tIGJvdGggcHVibGlzaGVkIHNldCBhbmQgYnVmZmVyXG4gICAgICAgICAgICAgIHNlbGYuX3NhZmVBcHBlbmRUb0J1ZmZlciA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChidWZmZXJlZEJlZm9yZSkge1xuICAgICAgICAgIG9sZERvYyA9IHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLmdldChpZCk7XG4gICAgICAgICAgLy8gcmVtb3ZlIHRoZSBvbGQgdmVyc2lvbiBtYW51YWxseSBpbnN0ZWFkIG9mIHVzaW5nIF9yZW1vdmVCdWZmZXJlZCBzb1xuICAgICAgICAgIC8vIHdlIGRvbid0IHRyaWdnZXIgdGhlIHF1ZXJ5aW5nIGltbWVkaWF0ZWx5LiAgaWYgd2UgZW5kIHRoaXMgYmxvY2tcbiAgICAgICAgICAvLyB3aXRoIHRoZSBidWZmZXIgZW1wdHksIHdlIHdpbGwgbmVlZCB0byB0cmlnZ2VyIHRoZSBxdWVyeSBwb2xsXG4gICAgICAgICAgLy8gbWFudWFsbHkgdG9vLlxuICAgICAgICAgIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLnJlbW92ZShpZCk7XG5cbiAgICAgICAgICB2YXIgbWF4UHVibGlzaGVkID0gc2VsZi5fcHVibGlzaGVkLmdldChcbiAgICAgICAgICAgIHNlbGYuX3B1Ymxpc2hlZC5tYXhFbGVtZW50SWQoKSk7XG4gICAgICAgICAgbWF4QnVmZmVyZWQgPSBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5zaXplKCkgJiZcbiAgICAgICAgICAgICAgICBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5nZXQoXG4gICAgICAgICAgICAgICAgICBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5tYXhFbGVtZW50SWQoKSk7XG5cbiAgICAgICAgICAvLyB0aGUgYnVmZmVyZWQgZG9jIHdhcyB1cGRhdGVkLCBpdCBjb3VsZCBtb3ZlIHRvIHB1Ymxpc2hlZFxuICAgICAgICAgIHZhciB0b1B1Ymxpc2ggPSBjb21wYXJhdG9yKG5ld0RvYywgbWF4UHVibGlzaGVkKSA8IDA7XG5cbiAgICAgICAgICAvLyBvciBzdGF5cyBpbiBidWZmZXIgZXZlbiBhZnRlciB0aGUgY2hhbmdlXG4gICAgICAgICAgdmFyIHN0YXlzSW5CdWZmZXIgPSAoISB0b1B1Ymxpc2ggJiYgc2VsZi5fc2FmZUFwcGVuZFRvQnVmZmVyKSB8fFxuICAgICAgICAgICAgICAgICghdG9QdWJsaXNoICYmIG1heEJ1ZmZlcmVkICYmXG4gICAgICAgICAgICAgICAgIGNvbXBhcmF0b3IobmV3RG9jLCBtYXhCdWZmZXJlZCkgPD0gMCk7XG5cbiAgICAgICAgICBpZiAodG9QdWJsaXNoKSB7XG4gICAgICAgICAgICBzZWxmLl9hZGRQdWJsaXNoZWQoaWQsIG5ld0RvYyk7XG4gICAgICAgICAgfSBlbHNlIGlmIChzdGF5c0luQnVmZmVyKSB7XG4gICAgICAgICAgICAvLyBzdGF5cyBpbiBidWZmZXIgYnV0IGNoYW5nZXNcbiAgICAgICAgICAgIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLnNldChpZCwgbmV3RG9jKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gVGhyb3cgYXdheSBmcm9tIGJvdGggcHVibGlzaGVkIHNldCBhbmQgYnVmZmVyXG4gICAgICAgICAgICBzZWxmLl9zYWZlQXBwZW5kVG9CdWZmZXIgPSBmYWxzZTtcbiAgICAgICAgICAgIC8vIE5vcm1hbGx5IHRoaXMgY2hlY2sgd291bGQgaGF2ZSBiZWVuIGRvbmUgaW4gX3JlbW92ZUJ1ZmZlcmVkIGJ1dFxuICAgICAgICAgICAgLy8gd2UgZGlkbid0IHVzZSBpdCwgc28gd2UgbmVlZCB0byBkbyBpdCBvdXJzZWxmIG5vdy5cbiAgICAgICAgICAgIGlmICghIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLnNpemUoKSkge1xuICAgICAgICAgICAgICBzZWxmLl9uZWVkVG9Qb2xsUXVlcnkoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiY2FjaGVkQmVmb3JlIGltcGxpZXMgZWl0aGVyIG9mIHB1Ymxpc2hlZEJlZm9yZSBvciBidWZmZXJlZEJlZm9yZSBpcyB0cnVlLlwiKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICB9LFxuICBfZmV0Y2hNb2RpZmllZERvY3VtZW50czogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBzZWxmLl9yZWdpc3RlclBoYXNlQ2hhbmdlKFBIQVNFLkZFVENISU5HKTtcbiAgICAvLyBEZWZlciwgYmVjYXVzZSBub3RoaW5nIGNhbGxlZCBmcm9tIHRoZSBvcGxvZyBlbnRyeSBoYW5kbGVyIG1heSB5aWVsZCxcbiAgICAvLyBidXQgZmV0Y2goKSB5aWVsZHMuXG4gICAgTWV0ZW9yLmRlZmVyKGZpbmlzaElmTmVlZFRvUG9sbFF1ZXJ5KGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICAgIHdoaWxlICghc2VsZi5fc3RvcHBlZCAmJiAhc2VsZi5fbmVlZFRvRmV0Y2guZW1wdHkoKSkge1xuICAgICAgICBpZiAoc2VsZi5fcGhhc2UgPT09IFBIQVNFLlFVRVJZSU5HKSB7XG4gICAgICAgICAgLy8gV2hpbGUgZmV0Y2hpbmcsIHdlIGRlY2lkZWQgdG8gZ28gaW50byBRVUVSWUlORyBtb2RlLCBhbmQgdGhlbiB3ZVxuICAgICAgICAgIC8vIHNhdyBhbm90aGVyIG9wbG9nIGVudHJ5LCBzbyBfbmVlZFRvRmV0Y2ggaXMgbm90IGVtcHR5LiBCdXQgd2VcbiAgICAgICAgICAvLyBzaG91bGRuJ3QgZmV0Y2ggdGhlc2UgZG9jdW1lbnRzIHVudGlsIEFGVEVSIHRoZSBxdWVyeSBpcyBkb25lLlxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQmVpbmcgaW4gc3RlYWR5IHBoYXNlIGhlcmUgd291bGQgYmUgc3VycHJpc2luZy5cbiAgICAgICAgaWYgKHNlbGYuX3BoYXNlICE9PSBQSEFTRS5GRVRDSElORylcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJwaGFzZSBpbiBmZXRjaE1vZGlmaWVkRG9jdW1lbnRzOiBcIiArIHNlbGYuX3BoYXNlKTtcblxuICAgICAgICBzZWxmLl9jdXJyZW50bHlGZXRjaGluZyA9IHNlbGYuX25lZWRUb0ZldGNoO1xuICAgICAgICB2YXIgdGhpc0dlbmVyYXRpb24gPSArK3NlbGYuX2ZldGNoR2VuZXJhdGlvbjtcbiAgICAgICAgc2VsZi5fbmVlZFRvRmV0Y2ggPSBuZXcgTG9jYWxDb2xsZWN0aW9uLl9JZE1hcDtcblxuICAgICAgICAvLyBDcmVhdGUgYW4gYXJyYXkgb2YgcHJvbWlzZXMgZm9yIGFsbCB0aGUgZmV0Y2ggb3BlcmF0aW9uc1xuICAgICAgICBjb25zdCBmZXRjaFByb21pc2VzID0gW107XG5cbiAgICAgICAgc2VsZi5fY3VycmVudGx5RmV0Y2hpbmcuZm9yRWFjaChmdW5jdGlvbiAob3AsIGlkKSB7XG4gICAgICAgICAgY29uc3QgZmV0Y2hQcm9taXNlID0gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgc2VsZi5fbW9uZ29IYW5kbGUuX2RvY0ZldGNoZXIuZmV0Y2goXG4gICAgICAgICAgICAgIHNlbGYuX2N1cnNvckRlc2NyaXB0aW9uLmNvbGxlY3Rpb25OYW1lLFxuICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgIGZpbmlzaElmTmVlZFRvUG9sbFF1ZXJ5KGZ1bmN0aW9uKGVyciwgZG9jKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgTWV0ZW9yLl9kZWJ1ZygnR290IGV4Y2VwdGlvbiB3aGlsZSBmZXRjaGluZyBkb2N1bWVudHMnLCBlcnIpO1xuICAgICAgICAgICAgICAgICAgLy8gSWYgd2UgZ2V0IGFuIGVycm9yIGZyb20gdGhlIGZldGNoZXIgKGVnLCB0cm91YmxlXG4gICAgICAgICAgICAgICAgICAvLyBjb25uZWN0aW5nIHRvIE1vbmdvKSwgbGV0J3MganVzdCBhYmFuZG9uIHRoZSBmZXRjaCBwaGFzZVxuICAgICAgICAgICAgICAgICAgLy8gYWx0b2dldGhlciBhbmQgZmFsbCBiYWNrIHRvIHBvbGxpbmcuIEl0J3Mgbm90IGxpa2Ugd2UncmVcbiAgICAgICAgICAgICAgICAgIC8vIGdldHRpbmcgbGl2ZSB1cGRhdGVzIGFueXdheS5cbiAgICAgICAgICAgICAgICAgIGlmIChzZWxmLl9waGFzZSAhPT0gUEhBU0UuUVVFUllJTkcpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5fbmVlZFRvUG9sbFF1ZXJ5KCk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgIXNlbGYuX3N0b3BwZWQgJiZcbiAgICAgICAgICAgICAgICAgIHNlbGYuX3BoYXNlID09PSBQSEFTRS5GRVRDSElORyAmJlxuICAgICAgICAgICAgICAgICAgc2VsZi5fZmV0Y2hHZW5lcmF0aW9uID09PSB0aGlzR2VuZXJhdGlvblxuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgLy8gV2UgcmUtY2hlY2sgdGhlIGdlbmVyYXRpb24gaW4gY2FzZSB3ZSd2ZSBoYWQgYW4gZXhwbGljaXRcbiAgICAgICAgICAgICAgICAgIC8vIF9wb2xsUXVlcnkgY2FsbCAoZWcsIGluIGFub3RoZXIgZmliZXIpIHdoaWNoIHNob3VsZFxuICAgICAgICAgICAgICAgICAgLy8gZWZmZWN0aXZlbHkgY2FuY2VsIHRoaXMgcm91bmQgb2YgZmV0Y2hlcy4gIChfcG9sbFF1ZXJ5XG4gICAgICAgICAgICAgICAgICAvLyBpbmNyZW1lbnRzIHRoZSBnZW5lcmF0aW9uLilcbiAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuX2hhbmRsZURvYyhpZCwgZG9jKTtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgKVxuICAgICAgICAgIH0pXG4gICAgICAgICAgZmV0Y2hQcm9taXNlcy5wdXNoKGZldGNoUHJvbWlzZSk7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBXYWl0IGZvciBhbGwgZmV0Y2ggb3BlcmF0aW9ucyB0byBjb21wbGV0ZVxuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoZmV0Y2hQcm9taXNlcyk7XG4gICAgICAgICAgY29uc3QgZXJyb3JzID0gcmVzdWx0c1xuICAgICAgICAgICAgLmZpbHRlcihyZXN1bHQgPT4gcmVzdWx0LnN0YXR1cyA9PT0gJ3JlamVjdGVkJylcbiAgICAgICAgICAgIC5tYXAocmVzdWx0ID0+IHJlc3VsdC5yZWFzb24pO1xuXG4gICAgICAgICAgaWYgKGVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBNZXRlb3IuX2RlYnVnKCdTb21lIGZldGNoIHF1ZXJpZXMgZmFpbGVkOicsIGVycm9ycyk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBNZXRlb3IuX2RlYnVnKCdHb3QgYW4gZXhjZXB0aW9uIGluIGEgZmV0Y2ggcXVlcnknLCBlcnIpO1xuICAgICAgICB9XG4gICAgICAgIC8vIEV4aXQgbm93IGlmIHdlJ3ZlIGhhZCBhIF9wb2xsUXVlcnkgY2FsbCAoaGVyZSBvciBpbiBhbm90aGVyIGZpYmVyKS5cbiAgICAgICAgaWYgKHNlbGYuX3BoYXNlID09PSBQSEFTRS5RVUVSWUlORylcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIHNlbGYuX2N1cnJlbnRseUZldGNoaW5nID0gbnVsbDtcbiAgICAgIH1cbiAgICAgIC8vIFdlJ3JlIGRvbmUgZmV0Y2hpbmcsIHNvIHdlIGNhbiBiZSBzdGVhZHksIHVubGVzcyB3ZSd2ZSBoYWQgYVxuICAgICAgLy8gX3BvbGxRdWVyeSBjYWxsIChoZXJlIG9yIGluIGFub3RoZXIgZmliZXIpLlxuICAgICAgaWYgKHNlbGYuX3BoYXNlICE9PSBQSEFTRS5RVUVSWUlORylcbiAgICAgICAgYXdhaXQgc2VsZi5fYmVTdGVhZHkoKTtcbiAgICB9KSk7XG4gIH0sXG4gIF9iZVN0ZWFkeTogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBzZWxmLl9yZWdpc3RlclBoYXNlQ2hhbmdlKFBIQVNFLlNURUFEWSk7XG4gICAgdmFyIHdyaXRlcyA9IHNlbGYuX3dyaXRlc1RvQ29tbWl0V2hlbldlUmVhY2hTdGVhZHkgfHwgW107XG4gICAgc2VsZi5fd3JpdGVzVG9Db21taXRXaGVuV2VSZWFjaFN0ZWFkeSA9IFtdO1xuICAgIGF3YWl0IHNlbGYuX211bHRpcGxleGVyLm9uRmx1c2goYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCB3IG9mIHdyaXRlcykge1xuICAgICAgICAgIGF3YWl0IHcuY29tbWl0dGVkKCk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIl9iZVN0ZWFkeSBlcnJvclwiLCB7d3JpdGVzfSwgZSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0sXG4gIF9oYW5kbGVPcGxvZ0VudHJ5UXVlcnlpbmc6IGZ1bmN0aW9uIChvcCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmdW5jdGlvbiAoKSB7XG4gICAgICBzZWxmLl9uZWVkVG9GZXRjaC5zZXQoaWRGb3JPcChvcCksIG9wKTtcbiAgICB9KTtcbiAgfSxcbiAgX2hhbmRsZU9wbG9nRW50cnlTdGVhZHlPckZldGNoaW5nOiBmdW5jdGlvbiAob3ApIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGlkID0gaWRGb3JPcChvcCk7XG4gICAgICAvLyBJZiB3ZSdyZSBhbHJlYWR5IGZldGNoaW5nIHRoaXMgb25lLCBvciBhYm91dCB0bywgd2UgY2FuJ3Qgb3B0aW1pemU7XG4gICAgICAvLyBtYWtlIHN1cmUgdGhhdCB3ZSBmZXRjaCBpdCBhZ2FpbiBpZiBuZWNlc3NhcnkuXG5cbiAgICAgIGlmIChzZWxmLl9waGFzZSA9PT0gUEhBU0UuRkVUQ0hJTkcgJiZcbiAgICAgICAgICAoKHNlbGYuX2N1cnJlbnRseUZldGNoaW5nICYmIHNlbGYuX2N1cnJlbnRseUZldGNoaW5nLmhhcyhpZCkpIHx8XG4gICAgICAgICAgIHNlbGYuX25lZWRUb0ZldGNoLmhhcyhpZCkpKSB7XG4gICAgICAgIHNlbGYuX25lZWRUb0ZldGNoLnNldChpZCwgb3ApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5vcCA9PT0gJ2QnKSB7XG4gICAgICAgIGlmIChzZWxmLl9wdWJsaXNoZWQuaGFzKGlkKSB8fFxuICAgICAgICAgICAgKHNlbGYuX2xpbWl0ICYmIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLmhhcyhpZCkpKVxuICAgICAgICAgIHNlbGYuX3JlbW92ZU1hdGNoaW5nKGlkKTtcbiAgICAgIH0gZWxzZSBpZiAob3Aub3AgPT09ICdpJykge1xuICAgICAgICBpZiAoc2VsZi5fcHVibGlzaGVkLmhhcyhpZCkpXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiaW5zZXJ0IGZvdW5kIGZvciBhbHJlYWR5LWV4aXN0aW5nIElEIGluIHB1Ymxpc2hlZFwiKTtcbiAgICAgICAgaWYgKHNlbGYuX3VucHVibGlzaGVkQnVmZmVyICYmIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLmhhcyhpZCkpXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiaW5zZXJ0IGZvdW5kIGZvciBhbHJlYWR5LWV4aXN0aW5nIElEIGluIGJ1ZmZlclwiKTtcblxuICAgICAgICAvLyBYWFggd2hhdCBpZiBzZWxlY3RvciB5aWVsZHM/ICBmb3Igbm93IGl0IGNhbid0IGJ1dCBsYXRlciBpdCBjb3VsZFxuICAgICAgICAvLyBoYXZlICR3aGVyZVxuICAgICAgICBpZiAoc2VsZi5fbWF0Y2hlci5kb2N1bWVudE1hdGNoZXMob3AubykucmVzdWx0KVxuICAgICAgICAgIHNlbGYuX2FkZE1hdGNoaW5nKG9wLm8pO1xuICAgICAgfSBlbHNlIGlmIChvcC5vcCA9PT0gJ3UnKSB7XG4gICAgICAgIC8vIHdlIGFyZSBtYXBwaW5nIHRoZSBuZXcgb3Bsb2cgZm9ybWF0IG9uIG1vbmdvIDVcbiAgICAgICAgLy8gdG8gd2hhdCB3ZSBrbm93IGJldHRlciwgJHNldFxuICAgICAgICBvcC5vID0gb3Bsb2dWMlYxQ29udmVydGVyKG9wLm8pXG4gICAgICAgIC8vIElzIHRoaXMgYSBtb2RpZmllciAoJHNldC8kdW5zZXQsIHdoaWNoIG1heSByZXF1aXJlIHVzIHRvIHBvbGwgdGhlXG4gICAgICAgIC8vIGRhdGFiYXNlIHRvIGZpZ3VyZSBvdXQgaWYgdGhlIHdob2xlIGRvY3VtZW50IG1hdGNoZXMgdGhlIHNlbGVjdG9yKSBvclxuICAgICAgICAvLyBhIHJlcGxhY2VtZW50IChpbiB3aGljaCBjYXNlIHdlIGNhbiBqdXN0IGRpcmVjdGx5IHJlLWV2YWx1YXRlIHRoZVxuICAgICAgICAvLyBzZWxlY3Rvcik/XG4gICAgICAgIC8vIG9wbG9nIGZvcm1hdCBoYXMgY2hhbmdlZCBvbiBtb25nb2RiIDUsIHdlIGhhdmUgdG8gc3VwcG9ydCBib3RoIG5vd1xuICAgICAgICAvLyBkaWZmIGlzIHRoZSBmb3JtYXQgaW4gTW9uZ28gNSsgKG9wbG9nIHYyKVxuICAgICAgICB2YXIgaXNSZXBsYWNlID0gIWhhcyhvcC5vLCAnJHNldCcpICYmICFoYXMob3AubywgJ2RpZmYnKSAmJiAhaGFzKG9wLm8sICckdW5zZXQnKTtcbiAgICAgICAgLy8gSWYgdGhpcyBtb2RpZmllciBtb2RpZmllcyBzb21ldGhpbmcgaW5zaWRlIGFuIEVKU09OIGN1c3RvbSB0eXBlIChpZSxcbiAgICAgICAgLy8gYW55dGhpbmcgd2l0aCBFSlNPTiQpLCB0aGVuIHdlIGNhbid0IHRyeSB0byB1c2VcbiAgICAgICAgLy8gTG9jYWxDb2xsZWN0aW9uLl9tb2RpZnksIHNpbmNlIHRoYXQganVzdCBtdXRhdGVzIHRoZSBFSlNPTiBlbmNvZGluZyxcbiAgICAgICAgLy8gbm90IHRoZSBhY3R1YWwgb2JqZWN0LlxuICAgICAgICB2YXIgY2FuRGlyZWN0bHlNb2RpZnlEb2MgPVxuICAgICAgICAgICFpc1JlcGxhY2UgJiYgbW9kaWZpZXJDYW5CZURpcmVjdGx5QXBwbGllZChvcC5vKTtcblxuICAgICAgICB2YXIgcHVibGlzaGVkQmVmb3JlID0gc2VsZi5fcHVibGlzaGVkLmhhcyhpZCk7XG4gICAgICAgIHZhciBidWZmZXJlZEJlZm9yZSA9IHNlbGYuX2xpbWl0ICYmIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLmhhcyhpZCk7XG5cbiAgICAgICAgaWYgKGlzUmVwbGFjZSkge1xuICAgICAgICAgIHNlbGYuX2hhbmRsZURvYyhpZCwgT2JqZWN0LmFzc2lnbih7X2lkOiBpZH0sIG9wLm8pKTtcbiAgICAgICAgfSBlbHNlIGlmICgocHVibGlzaGVkQmVmb3JlIHx8IGJ1ZmZlcmVkQmVmb3JlKSAmJlxuICAgICAgICAgICAgICAgICAgIGNhbkRpcmVjdGx5TW9kaWZ5RG9jKSB7XG4gICAgICAgICAgLy8gT2ggZ3JlYXQsIHdlIGFjdHVhbGx5IGtub3cgd2hhdCB0aGUgZG9jdW1lbnQgaXMsIHNvIHdlIGNhbiBhcHBseVxuICAgICAgICAgIC8vIHRoaXMgZGlyZWN0bHkuXG4gICAgICAgICAgdmFyIG5ld0RvYyA9IHNlbGYuX3B1Ymxpc2hlZC5oYXMoaWQpXG4gICAgICAgICAgICA/IHNlbGYuX3B1Ymxpc2hlZC5nZXQoaWQpIDogc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIuZ2V0KGlkKTtcbiAgICAgICAgICBuZXdEb2MgPSBFSlNPTi5jbG9uZShuZXdEb2MpO1xuXG4gICAgICAgICAgbmV3RG9jLl9pZCA9IGlkO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBMb2NhbENvbGxlY3Rpb24uX21vZGlmeShuZXdEb2MsIG9wLm8pO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGlmIChlLm5hbWUgIT09IFwiTWluaW1vbmdvRXJyb3JcIilcbiAgICAgICAgICAgICAgdGhyb3cgZTtcbiAgICAgICAgICAgIC8vIFdlIGRpZG4ndCB1bmRlcnN0YW5kIHRoZSBtb2RpZmllci4gIFJlLWZldGNoLlxuICAgICAgICAgICAgc2VsZi5fbmVlZFRvRmV0Y2guc2V0KGlkLCBvcCk7XG4gICAgICAgICAgICBpZiAoc2VsZi5fcGhhc2UgPT09IFBIQVNFLlNURUFEWSkge1xuICAgICAgICAgICAgICBzZWxmLl9mZXRjaE1vZGlmaWVkRG9jdW1lbnRzKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHNlbGYuX2hhbmRsZURvYyhpZCwgc2VsZi5fc2hhcmVkUHJvamVjdGlvbkZuKG5ld0RvYykpO1xuICAgICAgICB9IGVsc2UgaWYgKCFjYW5EaXJlY3RseU1vZGlmeURvYyB8fFxuICAgICAgICAgICAgICAgICAgIHNlbGYuX21hdGNoZXIuY2FuQmVjb21lVHJ1ZUJ5TW9kaWZpZXIob3AubykgfHxcbiAgICAgICAgICAgICAgICAgICAoc2VsZi5fc29ydGVyICYmIHNlbGYuX3NvcnRlci5hZmZlY3RlZEJ5TW9kaWZpZXIob3AubykpKSB7XG4gICAgICAgICAgc2VsZi5fbmVlZFRvRmV0Y2guc2V0KGlkLCBvcCk7XG4gICAgICAgICAgaWYgKHNlbGYuX3BoYXNlID09PSBQSEFTRS5TVEVBRFkpXG4gICAgICAgICAgICBzZWxmLl9mZXRjaE1vZGlmaWVkRG9jdW1lbnRzKCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IEVycm9yKFwiWFhYIFNVUlBSSVNJTkcgT1BFUkFUSU9OOiBcIiArIG9wKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSxcblxuICBhc3luYyBfcnVuSW5pdGlhbFF1ZXJ5QXN5bmMoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmIChzZWxmLl9zdG9wcGVkKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwib3Bsb2cgc3RvcHBlZCBzdXJwcmlzaW5nbHkgZWFybHlcIik7XG5cbiAgICBhd2FpdCBzZWxmLl9ydW5RdWVyeSh7aW5pdGlhbDogdHJ1ZX0pOyAgLy8geWllbGRzXG5cbiAgICBpZiAoc2VsZi5fc3RvcHBlZClcbiAgICAgIHJldHVybjsgIC8vIGNhbiBoYXBwZW4gb24gcXVlcnlFcnJvclxuXG4gICAgLy8gQWxsb3cgb2JzZXJ2ZUNoYW5nZXMgY2FsbHMgdG8gcmV0dXJuLiAoQWZ0ZXIgdGhpcywgaXQncyBwb3NzaWJsZSBmb3JcbiAgICAvLyBzdG9wKCkgdG8gYmUgY2FsbGVkLilcbiAgICBhd2FpdCBzZWxmLl9tdWx0aXBsZXhlci5yZWFkeSgpO1xuXG4gICAgYXdhaXQgc2VsZi5fZG9uZVF1ZXJ5aW5nKCk7ICAvLyB5aWVsZHNcbiAgfSxcblxuICAvLyBZaWVsZHMhXG4gIF9ydW5Jbml0aWFsUXVlcnk6IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5fcnVuSW5pdGlhbFF1ZXJ5QXN5bmMoKTtcbiAgfSxcblxuICAvLyBJbiB2YXJpb3VzIGNpcmN1bXN0YW5jZXMsIHdlIG1heSBqdXN0IHdhbnQgdG8gc3RvcCBwcm9jZXNzaW5nIHRoZSBvcGxvZyBhbmRcbiAgLy8gcmUtcnVuIHRoZSBpbml0aWFsIHF1ZXJ5LCBqdXN0IGFzIGlmIHdlIHdlcmUgYSBQb2xsaW5nT2JzZXJ2ZURyaXZlci5cbiAgLy9cbiAgLy8gVGhpcyBmdW5jdGlvbiBtYXkgbm90IGJsb2NrLCBiZWNhdXNlIGl0IGlzIGNhbGxlZCBmcm9tIGFuIG9wbG9nIGVudHJ5XG4gIC8vIGhhbmRsZXIuXG4gIC8vXG4gIC8vIFhYWCBXZSBzaG91bGQgY2FsbCB0aGlzIHdoZW4gd2UgZGV0ZWN0IHRoYXQgd2UndmUgYmVlbiBpbiBGRVRDSElORyBmb3IgXCJ0b29cbiAgLy8gbG9uZ1wiLlxuICAvL1xuICAvLyBYWFggV2Ugc2hvdWxkIGNhbGwgdGhpcyB3aGVuIHdlIGRldGVjdCBNb25nbyBmYWlsb3ZlciAoc2luY2UgdGhhdCBtaWdodFxuICAvLyBtZWFuIHRoYXQgc29tZSBvZiB0aGUgb3Bsb2cgZW50cmllcyB3ZSBoYXZlIHByb2Nlc3NlZCBoYXZlIGJlZW4gcm9sbGVkXG4gIC8vIGJhY2spLiBUaGUgTm9kZSBNb25nbyBkcml2ZXIgaXMgaW4gdGhlIG1pZGRsZSBvZiBhIGJ1bmNoIG9mIGh1Z2VcbiAgLy8gcmVmYWN0b3JpbmdzLCBpbmNsdWRpbmcgdGhlIHdheSB0aGF0IGl0IG5vdGlmaWVzIHlvdSB3aGVuIHByaW1hcnlcbiAgLy8gY2hhbmdlcy4gV2lsbCBwdXQgb2ZmIGltcGxlbWVudGluZyB0aGlzIHVudGlsIGRyaXZlciAxLjQgaXMgb3V0LlxuICBfcG9sbFF1ZXJ5OiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkKGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmIChzZWxmLl9zdG9wcGVkKVxuICAgICAgICByZXR1cm47XG5cbiAgICAgIC8vIFlheSwgd2UgZ2V0IHRvIGZvcmdldCBhYm91dCBhbGwgdGhlIHRoaW5ncyB3ZSB0aG91Z2h0IHdlIGhhZCB0byBmZXRjaC5cbiAgICAgIHNlbGYuX25lZWRUb0ZldGNoID0gbmV3IExvY2FsQ29sbGVjdGlvbi5fSWRNYXA7XG4gICAgICBzZWxmLl9jdXJyZW50bHlGZXRjaGluZyA9IG51bGw7XG4gICAgICArK3NlbGYuX2ZldGNoR2VuZXJhdGlvbjsgIC8vIGlnbm9yZSBhbnkgaW4tZmxpZ2h0IGZldGNoZXNcbiAgICAgIHNlbGYuX3JlZ2lzdGVyUGhhc2VDaGFuZ2UoUEhBU0UuUVVFUllJTkcpO1xuXG4gICAgICAvLyBEZWZlciBzbyB0aGF0IHdlIGRvbid0IHlpZWxkLiAgV2UgZG9uJ3QgbmVlZCBmaW5pc2hJZk5lZWRUb1BvbGxRdWVyeVxuICAgICAgLy8gaGVyZSBiZWNhdXNlIFN3aXRjaGVkVG9RdWVyeSBpcyBub3QgdGhyb3duIGluIFFVRVJZSU5HIG1vZGUuXG4gICAgICBNZXRlb3IuZGVmZXIoYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgICAgICBhd2FpdCBzZWxmLl9ydW5RdWVyeSgpO1xuICAgICAgICBhd2FpdCBzZWxmLl9kb25lUXVlcnlpbmcoKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9LFxuXG4gIC8vIFlpZWxkcyFcbiAgYXN5bmMgX3J1blF1ZXJ5QXN5bmMob3B0aW9ucykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICB2YXIgbmV3UmVzdWx0cywgbmV3QnVmZmVyO1xuXG4gICAgLy8gVGhpcyB3aGlsZSBsb29wIGlzIGp1c3QgdG8gcmV0cnkgZmFpbHVyZXMuXG4gICAgd2hpbGUgKHRydWUpIHtcbiAgICAgIC8vIElmIHdlJ3ZlIGJlZW4gc3RvcHBlZCwgd2UgZG9uJ3QgaGF2ZSB0byBydW4gYW55dGhpbmcgYW55IG1vcmUuXG4gICAgICBpZiAoc2VsZi5fc3RvcHBlZClcbiAgICAgICAgcmV0dXJuO1xuXG4gICAgICBuZXdSZXN1bHRzID0gbmV3IExvY2FsQ29sbGVjdGlvbi5fSWRNYXA7XG4gICAgICBuZXdCdWZmZXIgPSBuZXcgTG9jYWxDb2xsZWN0aW9uLl9JZE1hcDtcblxuICAgICAgLy8gUXVlcnkgMnggZG9jdW1lbnRzIGFzIHRoZSBoYWxmIGV4Y2x1ZGVkIGZyb20gdGhlIG9yaWdpbmFsIHF1ZXJ5IHdpbGwgZ29cbiAgICAgIC8vIGludG8gdW5wdWJsaXNoZWQgYnVmZmVyIHRvIHJlZHVjZSBhZGRpdGlvbmFsIE1vbmdvIGxvb2t1cHMgaW4gY2FzZXNcbiAgICAgIC8vIHdoZW4gZG9jdW1lbnRzIGFyZSByZW1vdmVkIGZyb20gdGhlIHB1Ymxpc2hlZCBzZXQgYW5kIG5lZWQgYVxuICAgICAgLy8gcmVwbGFjZW1lbnQuXG4gICAgICAvLyBYWFggbmVlZHMgbW9yZSB0aG91Z2h0IG9uIG5vbi16ZXJvIHNraXBcbiAgICAgIC8vIFhYWCAyIGlzIGEgXCJtYWdpYyBudW1iZXJcIiBtZWFuaW5nIHRoZXJlIGlzIGFuIGV4dHJhIGNodW5rIG9mIGRvY3MgZm9yXG4gICAgICAvLyBidWZmZXIgaWYgc3VjaCBpcyBuZWVkZWQuXG4gICAgICB2YXIgY3Vyc29yID0gc2VsZi5fY3Vyc29yRm9yUXVlcnkoeyBsaW1pdDogc2VsZi5fbGltaXQgKiAyIH0pO1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgY3Vyc29yLmZvckVhY2goZnVuY3Rpb24gKGRvYywgaSkgeyAgLy8geWllbGRzXG4gICAgICAgICAgaWYgKCFzZWxmLl9saW1pdCB8fCBpIDwgc2VsZi5fbGltaXQpIHtcbiAgICAgICAgICAgIG5ld1Jlc3VsdHMuc2V0KGRvYy5faWQsIGRvYyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG5ld0J1ZmZlci5zZXQoZG9jLl9pZCwgZG9jKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBicmVhaztcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgaWYgKG9wdGlvbnMuaW5pdGlhbCAmJiB0eXBlb2YoZS5jb2RlKSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAvLyBUaGlzIGlzIGFuIGVycm9yIGRvY3VtZW50IHNlbnQgdG8gdXMgYnkgbW9uZ29kLCBub3QgYSBjb25uZWN0aW9uXG4gICAgICAgICAgLy8gZXJyb3IgZ2VuZXJhdGVkIGJ5IHRoZSBjbGllbnQuIEFuZCB3ZSd2ZSBuZXZlciBzZWVuIHRoaXMgcXVlcnkgd29ya1xuICAgICAgICAgIC8vIHN1Y2Nlc3NmdWxseS4gUHJvYmFibHkgaXQncyBhIGJhZCBzZWxlY3RvciBvciBzb21ldGhpbmcsIHNvIHdlXG4gICAgICAgICAgLy8gc2hvdWxkIE5PVCByZXRyeS4gSW5zdGVhZCwgd2Ugc2hvdWxkIGhhbHQgdGhlIG9ic2VydmUgKHdoaWNoIGVuZHNcbiAgICAgICAgICAvLyB1cCBjYWxsaW5nIGBzdG9wYCBvbiB1cykuXG4gICAgICAgICAgYXdhaXQgc2VsZi5fbXVsdGlwbGV4ZXIucXVlcnlFcnJvcihlKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEdXJpbmcgZmFpbG92ZXIgKGVnKSBpZiB3ZSBnZXQgYW4gZXhjZXB0aW9uIHdlIHNob3VsZCBsb2cgYW5kIHJldHJ5XG4gICAgICAgIC8vIGluc3RlYWQgb2YgY3Jhc2hpbmcuXG4gICAgICAgIE1ldGVvci5fZGVidWcoXCJHb3QgZXhjZXB0aW9uIHdoaWxlIHBvbGxpbmcgcXVlcnlcIiwgZSk7XG4gICAgICAgIGF3YWl0IE1ldGVvci5fc2xlZXBGb3JNcygxMDApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzZWxmLl9zdG9wcGVkKVxuICAgICAgcmV0dXJuO1xuXG4gICAgc2VsZi5fcHVibGlzaE5ld1Jlc3VsdHMobmV3UmVzdWx0cywgbmV3QnVmZmVyKTtcbiAgfSxcblxuICAvLyBZaWVsZHMhXG4gIF9ydW5RdWVyeTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICByZXR1cm4gdGhpcy5fcnVuUXVlcnlBc3luYyhvcHRpb25zKTtcbiAgfSxcblxuICAvLyBUcmFuc2l0aW9ucyB0byBRVUVSWUlORyBhbmQgcnVucyBhbm90aGVyIHF1ZXJ5LCBvciAoaWYgYWxyZWFkeSBpbiBRVUVSWUlORylcbiAgLy8gZW5zdXJlcyB0aGF0IHdlIHdpbGwgcXVlcnkgYWdhaW4gbGF0ZXIuXG4gIC8vXG4gIC8vIFRoaXMgZnVuY3Rpb24gbWF5IG5vdCBibG9jaywgYmVjYXVzZSBpdCBpcyBjYWxsZWQgZnJvbSBhbiBvcGxvZyBlbnRyeVxuICAvLyBoYW5kbGVyLiBIb3dldmVyLCBpZiB3ZSB3ZXJlIG5vdCBhbHJlYWR5IGluIHRoZSBRVUVSWUlORyBwaGFzZSwgaXQgdGhyb3dzXG4gIC8vIGFuIGV4Y2VwdGlvbiB0aGF0IGlzIGNhdWdodCBieSB0aGUgY2xvc2VzdCBzdXJyb3VuZGluZ1xuICAvLyBmaW5pc2hJZk5lZWRUb1BvbGxRdWVyeSBjYWxsOyB0aGlzIGVuc3VyZXMgdGhhdCB3ZSBkb24ndCBjb250aW51ZSBydW5uaW5nXG4gIC8vIGNsb3NlIHRoYXQgd2FzIGRlc2lnbmVkIGZvciBhbm90aGVyIHBoYXNlIGluc2lkZSBQSEFTRS5RVUVSWUlORy5cbiAgLy9cbiAgLy8gKEl0J3MgYWxzbyBuZWNlc3Nhcnkgd2hlbmV2ZXIgbG9naWMgaW4gdGhpcyBmaWxlIHlpZWxkcyB0byBjaGVjayB0aGF0IG90aGVyXG4gIC8vIHBoYXNlcyBoYXZlbid0IHB1dCB1cyBpbnRvIFFVRVJZSU5HIG1vZGUsIHRob3VnaDsgZWcsXG4gIC8vIF9mZXRjaE1vZGlmaWVkRG9jdW1lbnRzIGRvZXMgdGhpcy4pXG4gIF9uZWVkVG9Qb2xsUXVlcnk6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKHNlbGYuX3N0b3BwZWQpXG4gICAgICAgIHJldHVybjtcblxuICAgICAgLy8gSWYgd2UncmUgbm90IGFscmVhZHkgaW4gdGhlIG1pZGRsZSBvZiBhIHF1ZXJ5LCB3ZSBjYW4gcXVlcnkgbm93XG4gICAgICAvLyAocG9zc2libHkgcGF1c2luZyBGRVRDSElORykuXG4gICAgICBpZiAoc2VsZi5fcGhhc2UgIT09IFBIQVNFLlFVRVJZSU5HKSB7XG4gICAgICAgIHNlbGYuX3BvbGxRdWVyeSgpO1xuICAgICAgICB0aHJvdyBuZXcgU3dpdGNoZWRUb1F1ZXJ5O1xuICAgICAgfVxuXG4gICAgICAvLyBXZSdyZSBjdXJyZW50bHkgaW4gUVVFUllJTkcuIFNldCBhIGZsYWcgdG8gZW5zdXJlIHRoYXQgd2UgcnVuIGFub3RoZXJcbiAgICAgIC8vIHF1ZXJ5IHdoZW4gd2UncmUgZG9uZS5cbiAgICAgIHNlbGYuX3JlcXVlcnlXaGVuRG9uZVRoaXNRdWVyeSA9IHRydWU7XG4gICAgfSk7XG4gIH0sXG5cbiAgLy8gWWllbGRzIVxuICBfZG9uZVF1ZXJ5aW5nOiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgaWYgKHNlbGYuX3N0b3BwZWQpXG4gICAgICByZXR1cm47XG5cbiAgICBhd2FpdCBzZWxmLl9tb25nb0hhbmRsZS5fb3Bsb2dIYW5kbGUud2FpdFVudGlsQ2F1Z2h0VXAoKTtcblxuICAgIGlmIChzZWxmLl9zdG9wcGVkKVxuICAgICAgcmV0dXJuO1xuXG4gICAgaWYgKHNlbGYuX3BoYXNlICE9PSBQSEFTRS5RVUVSWUlORylcbiAgICAgIHRocm93IEVycm9yKFwiUGhhc2UgdW5leHBlY3RlZGx5IFwiICsgc2VsZi5fcGhhc2UpO1xuXG4gICAgaWYgKHNlbGYuX3JlcXVlcnlXaGVuRG9uZVRoaXNRdWVyeSkge1xuICAgICAgc2VsZi5fcmVxdWVyeVdoZW5Eb25lVGhpc1F1ZXJ5ID0gZmFsc2U7XG4gICAgICBzZWxmLl9wb2xsUXVlcnkoKTtcbiAgICB9IGVsc2UgaWYgKHNlbGYuX25lZWRUb0ZldGNoLmVtcHR5KCkpIHtcbiAgICAgIGF3YWl0IHNlbGYuX2JlU3RlYWR5KCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNlbGYuX2ZldGNoTW9kaWZpZWREb2N1bWVudHMoKTtcbiAgICB9XG4gIH0sXG5cbiAgX2N1cnNvckZvclF1ZXJ5OiBmdW5jdGlvbiAob3B0aW9uc092ZXJ3cml0ZSkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICByZXR1cm4gTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgLy8gVGhlIHF1ZXJ5IHdlIHJ1biBpcyBhbG1vc3QgdGhlIHNhbWUgYXMgdGhlIGN1cnNvciB3ZSBhcmUgb2JzZXJ2aW5nLFxuICAgICAgLy8gd2l0aCBhIGZldyBjaGFuZ2VzLiBXZSBuZWVkIHRvIHJlYWQgYWxsIHRoZSBmaWVsZHMgdGhhdCBhcmUgcmVsZXZhbnQgdG9cbiAgICAgIC8vIHRoZSBzZWxlY3Rvciwgbm90IGp1c3QgdGhlIGZpZWxkcyB3ZSBhcmUgZ29pbmcgdG8gcHVibGlzaCAodGhhdCdzIHRoZVxuICAgICAgLy8gXCJzaGFyZWRcIiBwcm9qZWN0aW9uKS4gQW5kIHdlIGRvbid0IHdhbnQgdG8gYXBwbHkgYW55IHRyYW5zZm9ybSBpbiB0aGVcbiAgICAgIC8vIGN1cnNvciwgYmVjYXVzZSBvYnNlcnZlQ2hhbmdlcyBzaG91bGRuJ3QgdXNlIHRoZSB0cmFuc2Zvcm0uXG4gICAgICB2YXIgb3B0aW9ucyA9IE9iamVjdC5hc3NpZ24oe30sIHNlbGYuX2N1cnNvckRlc2NyaXB0aW9uLm9wdGlvbnMpO1xuXG4gICAgICAvLyBBbGxvdyB0aGUgY2FsbGVyIHRvIG1vZGlmeSB0aGUgb3B0aW9ucy4gVXNlZnVsIHRvIHNwZWNpZnkgZGlmZmVyZW50XG4gICAgICAvLyBza2lwIGFuZCBsaW1pdCB2YWx1ZXMuXG4gICAgICBPYmplY3QuYXNzaWduKG9wdGlvbnMsIG9wdGlvbnNPdmVyd3JpdGUpO1xuXG4gICAgICBvcHRpb25zLmZpZWxkcyA9IHNlbGYuX3NoYXJlZFByb2plY3Rpb247XG4gICAgICBkZWxldGUgb3B0aW9ucy50cmFuc2Zvcm07XG4gICAgICAvLyBXZSBhcmUgTk9UIGRlZXAgY2xvbmluZyBmaWVsZHMgb3Igc2VsZWN0b3IgaGVyZSwgd2hpY2ggc2hvdWxkIGJlIE9LLlxuICAgICAgdmFyIGRlc2NyaXB0aW9uID0gbmV3IEN1cnNvckRlc2NyaXB0aW9uKFxuICAgICAgICBzZWxmLl9jdXJzb3JEZXNjcmlwdGlvbi5jb2xsZWN0aW9uTmFtZSxcbiAgICAgICAgc2VsZi5fY3Vyc29yRGVzY3JpcHRpb24uc2VsZWN0b3IsXG4gICAgICAgIG9wdGlvbnMpO1xuICAgICAgcmV0dXJuIG5ldyBDdXJzb3Ioc2VsZi5fbW9uZ29IYW5kbGUsIGRlc2NyaXB0aW9uKTtcbiAgICB9KTtcbiAgfSxcblxuXG4gIC8vIFJlcGxhY2Ugc2VsZi5fcHVibGlzaGVkIHdpdGggbmV3UmVzdWx0cyAoYm90aCBhcmUgSWRNYXBzKSwgaW52b2tpbmcgb2JzZXJ2ZVxuICAvLyBjYWxsYmFja3Mgb24gdGhlIG11bHRpcGxleGVyLlxuICAvLyBSZXBsYWNlIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyIHdpdGggbmV3QnVmZmVyLlxuICAvL1xuICAvLyBYWFggVGhpcyBpcyB2ZXJ5IHNpbWlsYXIgdG8gTG9jYWxDb2xsZWN0aW9uLl9kaWZmUXVlcnlVbm9yZGVyZWRDaGFuZ2VzLiBXZVxuICAvLyBzaG91bGQgcmVhbGx5OiAoYSkgVW5pZnkgSWRNYXAgYW5kIE9yZGVyZWREaWN0IGludG8gVW5vcmRlcmVkL09yZGVyZWREaWN0XG4gIC8vIChiKSBSZXdyaXRlIGRpZmYuanMgdG8gdXNlIHRoZXNlIGNsYXNzZXMgaW5zdGVhZCBvZiBhcnJheXMgYW5kIG9iamVjdHMuXG4gIF9wdWJsaXNoTmV3UmVzdWx0czogZnVuY3Rpb24gKG5ld1Jlc3VsdHMsIG5ld0J1ZmZlcikge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmdW5jdGlvbiAoKSB7XG5cbiAgICAgIC8vIElmIHRoZSBxdWVyeSBpcyBsaW1pdGVkIGFuZCB0aGVyZSBpcyBhIGJ1ZmZlciwgc2h1dCBkb3duIHNvIGl0IGRvZXNuJ3RcbiAgICAgIC8vIHN0YXkgaW4gYSB3YXkuXG4gICAgICBpZiAoc2VsZi5fbGltaXQpIHtcbiAgICAgICAgc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIuY2xlYXIoKTtcbiAgICAgIH1cblxuICAgICAgLy8gRmlyc3QgcmVtb3ZlIGFueXRoaW5nIHRoYXQncyBnb25lLiBCZSBjYXJlZnVsIG5vdCB0byBtb2RpZnlcbiAgICAgIC8vIHNlbGYuX3B1Ymxpc2hlZCB3aGlsZSBpdGVyYXRpbmcgb3ZlciBpdC5cbiAgICAgIHZhciBpZHNUb1JlbW92ZSA9IFtdO1xuICAgICAgc2VsZi5fcHVibGlzaGVkLmZvckVhY2goZnVuY3Rpb24gKGRvYywgaWQpIHtcbiAgICAgICAgaWYgKCFuZXdSZXN1bHRzLmhhcyhpZCkpXG4gICAgICAgICAgaWRzVG9SZW1vdmUucHVzaChpZCk7XG4gICAgICB9KTtcbiAgICAgIGlkc1RvUmVtb3ZlLmZvckVhY2goZnVuY3Rpb24gKGlkKSB7XG4gICAgICAgIHNlbGYuX3JlbW92ZVB1Ymxpc2hlZChpZCk7XG4gICAgICB9KTtcblxuICAgICAgLy8gTm93IGRvIGFkZHMgYW5kIGNoYW5nZXMuXG4gICAgICAvLyBJZiBzZWxmIGhhcyBhIGJ1ZmZlciBhbmQgbGltaXQsIHRoZSBuZXcgZmV0Y2hlZCByZXN1bHQgd2lsbCBiZVxuICAgICAgLy8gbGltaXRlZCBjb3JyZWN0bHkgYXMgdGhlIHF1ZXJ5IGhhcyBzb3J0IHNwZWNpZmllci5cbiAgICAgIG5ld1Jlc3VsdHMuZm9yRWFjaChmdW5jdGlvbiAoZG9jLCBpZCkge1xuICAgICAgICBzZWxmLl9oYW5kbGVEb2MoaWQsIGRvYyk7XG4gICAgICB9KTtcblxuICAgICAgLy8gU2FuaXR5LWNoZWNrIHRoYXQgZXZlcnl0aGluZyB3ZSB0cmllZCB0byBwdXQgaW50byBfcHVibGlzaGVkIGVuZGVkIHVwXG4gICAgICAvLyB0aGVyZS5cbiAgICAgIC8vIFhYWCBpZiB0aGlzIGlzIHNsb3csIHJlbW92ZSBpdCBsYXRlclxuICAgICAgaWYgKHNlbGYuX3B1Ymxpc2hlZC5zaXplKCkgIT09IG5ld1Jlc3VsdHMuc2l6ZSgpKSB7XG4gICAgICAgIE1ldGVvci5fZGVidWcoJ1RoZSBNb25nbyBzZXJ2ZXIgYW5kIHRoZSBNZXRlb3IgcXVlcnkgZGlzYWdyZWUgb24gaG93ICcgK1xuICAgICAgICAgICdtYW55IGRvY3VtZW50cyBtYXRjaCB5b3VyIHF1ZXJ5LiBDdXJzb3IgZGVzY3JpcHRpb246ICcsXG4gICAgICAgICAgc2VsZi5fY3Vyc29yRGVzY3JpcHRpb24pO1xuICAgICAgfVxuICAgICAgXG4gICAgICBzZWxmLl9wdWJsaXNoZWQuZm9yRWFjaChmdW5jdGlvbiAoZG9jLCBpZCkge1xuICAgICAgICBpZiAoIW5ld1Jlc3VsdHMuaGFzKGlkKSlcbiAgICAgICAgICB0aHJvdyBFcnJvcihcIl9wdWJsaXNoZWQgaGFzIGEgZG9jIHRoYXQgbmV3UmVzdWx0cyBkb2Vzbid0OyBcIiArIGlkKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBGaW5hbGx5LCByZXBsYWNlIHRoZSBidWZmZXJcbiAgICAgIG5ld0J1ZmZlci5mb3JFYWNoKGZ1bmN0aW9uIChkb2MsIGlkKSB7XG4gICAgICAgIHNlbGYuX2FkZEJ1ZmZlcmVkKGlkLCBkb2MpO1xuICAgICAgfSk7XG5cbiAgICAgIHNlbGYuX3NhZmVBcHBlbmRUb0J1ZmZlciA9IG5ld0J1ZmZlci5zaXplKCkgPCBzZWxmLl9saW1pdDtcbiAgICB9KTtcbiAgfSxcblxuICAvLyBUaGlzIHN0b3AgZnVuY3Rpb24gaXMgaW52b2tlZCBmcm9tIHRoZSBvblN0b3Agb2YgdGhlIE9ic2VydmVNdWx0aXBsZXhlciwgc29cbiAgLy8gaXQgc2hvdWxkbid0IGFjdHVhbGx5IGJlIHBvc3NpYmxlIHRvIGNhbGwgaXQgdW50aWwgdGhlIG11bHRpcGxleGVyIGlzXG4gIC8vIHJlYWR5LlxuICAvL1xuICAvLyBJdCdzIGltcG9ydGFudCB0byBjaGVjayBzZWxmLl9zdG9wcGVkIGFmdGVyIGV2ZXJ5IGNhbGwgaW4gdGhpcyBmaWxlIHRoYXRcbiAgLy8gY2FuIHlpZWxkIVxuICBfc3RvcDogYXN5bmMgZnVuY3Rpb24oKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmIChzZWxmLl9zdG9wcGVkKVxuICAgICAgcmV0dXJuO1xuICAgIHNlbGYuX3N0b3BwZWQgPSB0cnVlO1xuXG4gICAgLy8gTm90ZTogd2UgKmRvbid0KiB1c2UgbXVsdGlwbGV4ZXIub25GbHVzaCBoZXJlIGJlY2F1c2UgdGhpcyBzdG9wXG4gICAgLy8gY2FsbGJhY2sgaXMgYWN0dWFsbHkgaW52b2tlZCBieSB0aGUgbXVsdGlwbGV4ZXIgaXRzZWxmIHdoZW4gaXQgaGFzXG4gICAgLy8gZGV0ZXJtaW5lZCB0aGF0IHRoZXJlIGFyZSBubyBoYW5kbGVzIGxlZnQuIFNvIG5vdGhpbmcgaXMgYWN0dWFsbHkgZ29pbmdcbiAgICAvLyB0byBnZXQgZmx1c2hlZCAoYW5kIGl0J3MgcHJvYmFibHkgbm90IHZhbGlkIHRvIGNhbGwgbWV0aG9kcyBvbiB0aGVcbiAgICAvLyBkeWluZyBtdWx0aXBsZXhlcikuXG4gICAgZm9yIChjb25zdCB3IG9mIHNlbGYuX3dyaXRlc1RvQ29tbWl0V2hlbldlUmVhY2hTdGVhZHkpIHtcbiAgICAgIGF3YWl0IHcuY29tbWl0dGVkKCk7XG4gICAgfVxuICAgIHNlbGYuX3dyaXRlc1RvQ29tbWl0V2hlbldlUmVhY2hTdGVhZHkgPSBudWxsO1xuXG4gICAgLy8gUHJvYWN0aXZlbHkgZHJvcCByZWZlcmVuY2VzIHRvIHBvdGVudGlhbGx5IGJpZyB0aGluZ3MuXG4gICAgc2VsZi5fcHVibGlzaGVkID0gbnVsbDtcbiAgICBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlciA9IG51bGw7XG4gICAgc2VsZi5fbmVlZFRvRmV0Y2ggPSBudWxsO1xuICAgIHNlbGYuX2N1cnJlbnRseUZldGNoaW5nID0gbnVsbDtcbiAgICBzZWxmLl9vcGxvZ0VudHJ5SGFuZGxlID0gbnVsbDtcbiAgICBzZWxmLl9saXN0ZW5lcnNIYW5kbGUgPSBudWxsO1xuXG4gICAgUGFja2FnZVsnZmFjdHMtYmFzZSddICYmIFBhY2thZ2VbJ2ZhY3RzLWJhc2UnXS5GYWN0cy5pbmNyZW1lbnRTZXJ2ZXJGYWN0KFxuICAgICAgICBcIm1vbmdvLWxpdmVkYXRhXCIsIFwib2JzZXJ2ZS1kcml2ZXJzLW9wbG9nXCIsIC0xKTtcblxuICAgIGZvciBhd2FpdCAoY29uc3QgaGFuZGxlIG9mIHNlbGYuX3N0b3BIYW5kbGVzKSB7XG4gICAgICBhd2FpdCBoYW5kbGUuc3RvcCgpO1xuICAgIH1cbiAgfSxcbiAgc3RvcDogYXN5bmMgZnVuY3Rpb24oKSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIGF3YWl0IHNlbGYuX3N0b3AoKTtcbiAgfSxcblxuICBfcmVnaXN0ZXJQaGFzZUNoYW5nZTogZnVuY3Rpb24gKHBoYXNlKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkKGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBub3cgPSBuZXcgRGF0ZTtcblxuICAgICAgaWYgKHNlbGYuX3BoYXNlKSB7XG4gICAgICAgIHZhciB0aW1lRGlmZiA9IG5vdyAtIHNlbGYuX3BoYXNlU3RhcnRUaW1lO1xuICAgICAgICBQYWNrYWdlWydmYWN0cy1iYXNlJ10gJiYgUGFja2FnZVsnZmFjdHMtYmFzZSddLkZhY3RzLmluY3JlbWVudFNlcnZlckZhY3QoXG4gICAgICAgICAgXCJtb25nby1saXZlZGF0YVwiLCBcInRpbWUtc3BlbnQtaW4tXCIgKyBzZWxmLl9waGFzZSArIFwiLXBoYXNlXCIsIHRpbWVEaWZmKTtcbiAgICAgIH1cblxuICAgICAgc2VsZi5fcGhhc2UgPSBwaGFzZTtcbiAgICAgIHNlbGYuX3BoYXNlU3RhcnRUaW1lID0gbm93O1xuICAgIH0pO1xuICB9XG59KTtcblxuLy8gRG9lcyBvdXIgb3Bsb2cgdGFpbGluZyBjb2RlIHN1cHBvcnQgdGhpcyBjdXJzb3I/IEZvciBub3csIHdlIGFyZSBiZWluZyB2ZXJ5XG4vLyBjb25zZXJ2YXRpdmUgYW5kIGFsbG93aW5nIG9ubHkgc2ltcGxlIHF1ZXJpZXMgd2l0aCBzaW1wbGUgb3B0aW9ucy5cbi8vIChUaGlzIGlzIGEgXCJzdGF0aWMgbWV0aG9kXCIuKVxuT3Bsb2dPYnNlcnZlRHJpdmVyLmN1cnNvclN1cHBvcnRlZCA9IGZ1bmN0aW9uIChjdXJzb3JEZXNjcmlwdGlvbiwgbWF0Y2hlcikge1xuICAvLyBGaXJzdCwgY2hlY2sgdGhlIG9wdGlvbnMuXG4gIHZhciBvcHRpb25zID0gY3Vyc29yRGVzY3JpcHRpb24ub3B0aW9ucztcblxuICAvLyBEaWQgdGhlIHVzZXIgc2F5IG5vIGV4cGxpY2l0bHk/XG4gIC8vIHVuZGVyc2NvcmVkIHZlcnNpb24gb2YgdGhlIG9wdGlvbiBpcyBDT01QQVQgd2l0aCAxLjJcbiAgaWYgKG9wdGlvbnMuZGlzYWJsZU9wbG9nIHx8IG9wdGlvbnMuX2Rpc2FibGVPcGxvZylcbiAgICByZXR1cm4gZmFsc2U7XG5cbiAgLy8gc2tpcCBpcyBub3Qgc3VwcG9ydGVkOiB0byBzdXBwb3J0IGl0IHdlIHdvdWxkIG5lZWQgdG8ga2VlcCB0cmFjayBvZiBhbGxcbiAgLy8gXCJza2lwcGVkXCIgZG9jdW1lbnRzIG9yIGF0IGxlYXN0IHRoZWlyIGlkcy5cbiAgLy8gbGltaXQgdy9vIGEgc29ydCBzcGVjaWZpZXIgaXMgbm90IHN1cHBvcnRlZDogY3VycmVudCBpbXBsZW1lbnRhdGlvbiBuZWVkcyBhXG4gIC8vIGRldGVybWluaXN0aWMgd2F5IHRvIG9yZGVyIGRvY3VtZW50cy5cbiAgaWYgKG9wdGlvbnMuc2tpcCB8fCAob3B0aW9ucy5saW1pdCAmJiAhb3B0aW9ucy5zb3J0KSkgcmV0dXJuIGZhbHNlO1xuXG4gIC8vIElmIGEgZmllbGRzIHByb2plY3Rpb24gb3B0aW9uIGlzIGdpdmVuIGNoZWNrIGlmIGl0IGlzIHN1cHBvcnRlZCBieVxuICAvLyBtaW5pbW9uZ28gKHNvbWUgb3BlcmF0b3JzIGFyZSBub3Qgc3VwcG9ydGVkKS5cbiAgY29uc3QgZmllbGRzID0gb3B0aW9ucy5maWVsZHMgfHwgb3B0aW9ucy5wcm9qZWN0aW9uO1xuICBpZiAoZmllbGRzKSB7XG4gICAgdHJ5IHtcbiAgICAgIExvY2FsQ29sbGVjdGlvbi5fY2hlY2tTdXBwb3J0ZWRQcm9qZWN0aW9uKGZpZWxkcyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKGUubmFtZSA9PT0gXCJNaW5pbW9uZ29FcnJvclwiKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gV2UgZG9uJ3QgYWxsb3cgdGhlIGZvbGxvd2luZyBzZWxlY3RvcnM6XG4gIC8vICAgLSAkd2hlcmUgKG5vdCBjb25maWRlbnQgdGhhdCB3ZSBwcm92aWRlIHRoZSBzYW1lIEpTIGVudmlyb25tZW50XG4gIC8vICAgICAgICAgICAgIGFzIE1vbmdvLCBhbmQgY2FuIHlpZWxkISlcbiAgLy8gICAtICRuZWFyIChoYXMgXCJpbnRlcmVzdGluZ1wiIHByb3BlcnRpZXMgaW4gTW9uZ29EQiwgbGlrZSB0aGUgcG9zc2liaWxpdHlcbiAgLy8gICAgICAgICAgICBvZiByZXR1cm5pbmcgYW4gSUQgbXVsdGlwbGUgdGltZXMsIHRob3VnaCBldmVuIHBvbGxpbmcgbWF5YmVcbiAgLy8gICAgICAgICAgICBoYXZlIGEgYnVnIHRoZXJlKVxuICAvLyAgICAgICAgICAgWFhYOiBvbmNlIHdlIHN1cHBvcnQgaXQsIHdlIHdvdWxkIG5lZWQgdG8gdGhpbmsgbW9yZSBvbiBob3cgd2VcbiAgLy8gICAgICAgICAgIGluaXRpYWxpemUgdGhlIGNvbXBhcmF0b3JzIHdoZW4gd2UgY3JlYXRlIHRoZSBkcml2ZXIuXG4gIHJldHVybiAhbWF0Y2hlci5oYXNXaGVyZSgpICYmICFtYXRjaGVyLmhhc0dlb1F1ZXJ5KCk7XG59O1xuXG52YXIgbW9kaWZpZXJDYW5CZURpcmVjdGx5QXBwbGllZCA9IGZ1bmN0aW9uIChtb2RpZmllcikge1xuICByZXR1cm4gT2JqZWN0LmVudHJpZXMobW9kaWZpZXIpLmV2ZXJ5KGZ1bmN0aW9uIChbb3BlcmF0aW9uLCBmaWVsZHNdKSB7XG4gICAgcmV0dXJuIE9iamVjdC5lbnRyaWVzKGZpZWxkcykuZXZlcnkoZnVuY3Rpb24gKFtmaWVsZCwgdmFsdWVdKSB7XG4gICAgICByZXR1cm4gIS9FSlNPTlxcJC8udGVzdChmaWVsZCk7XG4gICAgfSk7XG4gIH0pO1xufTsiLCIvKipcbiAqIENvbnZlcnRlciBtb2R1bGUgZm9yIHRoZSBuZXcgTW9uZ29EQiBPcGxvZyBmb3JtYXQgKD49NS4wKSB0byB0aGUgb25lIHRoYXQgTWV0ZW9yXG4gKiBoYW5kbGVzIHdlbGwsIGkuZS4sIGAkc2V0YCBhbmQgYCR1bnNldGAuIFRoZSBuZXcgZm9ybWF0IGlzIGNvbXBsZXRlbHkgbmV3LFxuICogYW5kIGxvb2tzIGFzIGZvbGxvd3M6XG4gKlxuICogYGBganNcbiAqIHsgJHY6IDIsIGRpZmY6IERpZmYgfVxuICogYGBgXG4gKlxuICogd2hlcmUgYERpZmZgIGlzIGEgcmVjdXJzaXZlIHN0cnVjdHVyZTpcbiAqIGBgYGpzXG4gKiB7XG4gKiAgIC8vIE5lc3RlZCB1cGRhdGVzIChzb21ldGltZXMgYWxzbyByZXByZXNlbnRlZCB3aXRoIGFuIHMtZmllbGQpLlxuICogICAvLyBFeGFtcGxlOiBgeyAkc2V0OiB7ICdmb28uYmFyJzogMSB9IH1gLlxuICogICBpOiB7IDxrZXk+OiA8dmFsdWU+LCAuLi4gfSxcbiAqXG4gKiAgIC8vIFRvcC1sZXZlbCB1cGRhdGVzLlxuICogICAvLyBFeGFtcGxlOiBgeyAkc2V0OiB7IGZvbzogeyBiYXI6IDEgfSB9IH1gLlxuICogICB1OiB7IDxrZXk+OiA8dmFsdWU+LCAuLi4gfSxcbiAqXG4gKiAgIC8vIFVuc2V0cy5cbiAqICAgLy8gRXhhbXBsZTogYHsgJHVuc2V0OiB7IGZvbzogJycgfSB9YC5cbiAqICAgZDogeyA8a2V5PjogZmFsc2UsIC4uLiB9LFxuICpcbiAqICAgLy8gQXJyYXkgb3BlcmF0aW9ucy5cbiAqICAgLy8gRXhhbXBsZTogYHsgJHB1c2g6IHsgZm9vOiAnYmFyJyB9IH1gLlxuICogICBzPGtleT46IHsgYTogdHJ1ZSwgdTxpbmRleD46IDx2YWx1ZT4sIC4uLiB9LFxuICogICAuLi5cbiAqXG4gKiAgIC8vIE5lc3RlZCBvcGVyYXRpb25zIChzb21ldGltZXMgYWxzbyByZXByZXNlbnRlZCBpbiB0aGUgYGlgIGZpZWxkKS5cbiAqICAgLy8gRXhhbXBsZTogYHsgJHNldDogeyAnZm9vLmJhcic6IDEgfSB9YC5cbiAqICAgczxrZXk+OiBEaWZmLFxuICogICAuLi5cbiAqIH1cbiAqIGBgYFxuICpcbiAqIChhbGwgZmllbGRzIGFyZSBvcHRpb25hbClcbiAqL1xuXG5pbXBvcnQgeyBFSlNPTiB9IGZyb20gJ21ldGVvci9lanNvbic7XG5cbmludGVyZmFjZSBPcGxvZ0VudHJ5IHtcbiAgJHY6IG51bWJlcjtcbiAgZGlmZj86IE9wbG9nRGlmZjtcbiAgJHNldD86IFJlY29yZDxzdHJpbmcsIGFueT47XG4gICR1bnNldD86IFJlY29yZDxzdHJpbmcsIHRydWU+O1xufVxuXG5pbnRlcmZhY2UgT3Bsb2dEaWZmIHtcbiAgaT86IFJlY29yZDxzdHJpbmcsIGFueT47XG4gIHU/OiBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xuICBkPzogUmVjb3JkPHN0cmluZywgYm9vbGVhbj47XG4gIFtrZXk6IGBzJHtzdHJpbmd9YF06IEFycmF5T3BlcmF0b3IgfCBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xufVxuXG5pbnRlcmZhY2UgQXJyYXlPcGVyYXRvciB7XG4gIGE6IHRydWU7XG4gIFtrZXk6IGB1JHtudW1iZXJ9YF06IGFueTtcbn1cblxuY29uc3QgYXJyYXlPcGVyYXRvcktleVJlZ2V4ID0gL14oYXxbc3VdXFxkKykkLztcblxuLyoqXG4gKiBDaGVja3MgaWYgYSBmaWVsZCBpcyBhbiBhcnJheSBvcGVyYXRvciBrZXkgb2YgZm9ybSAnYScgb3IgJ3MxJyBvciAndTEnIGV0Y1xuICovXG5mdW5jdGlvbiBpc0FycmF5T3BlcmF0b3JLZXkoZmllbGQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICByZXR1cm4gYXJyYXlPcGVyYXRvcktleVJlZ2V4LnRlc3QoZmllbGQpO1xufVxuXG4vKipcbiAqIFR5cGUgZ3VhcmQgdG8gY2hlY2sgaWYgYW4gb3BlcmF0b3IgaXMgYSB2YWxpZCBhcnJheSBvcGVyYXRvci5cbiAqIEFycmF5IG9wZXJhdG9ycyBoYXZlICdhOiB0cnVlJyBhbmQga2V5cyB0aGF0IG1hdGNoIHRoZSBhcnJheU9wZXJhdG9yS2V5UmVnZXhcbiAqL1xuZnVuY3Rpb24gaXNBcnJheU9wZXJhdG9yKG9wZXJhdG9yOiB1bmtub3duKTogb3BlcmF0b3IgaXMgQXJyYXlPcGVyYXRvciB7XG4gIHJldHVybiAoXG4gICAgb3BlcmF0b3IgIT09IG51bGwgJiZcbiAgICB0eXBlb2Ygb3BlcmF0b3IgPT09ICdvYmplY3QnICYmXG4gICAgJ2EnIGluIG9wZXJhdG9yICYmXG4gICAgKG9wZXJhdG9yIGFzIEFycmF5T3BlcmF0b3IpLmEgPT09IHRydWUgJiZcbiAgICBPYmplY3Qua2V5cyhvcGVyYXRvcikuZXZlcnkoaXNBcnJheU9wZXJhdG9yS2V5KVxuICApO1xufVxuXG4vKipcbiAqIEpvaW5zIHR3byBwYXJ0cyBvZiBhIGZpZWxkIHBhdGggd2l0aCBhIGRvdC5cbiAqIFJldHVybnMgdGhlIGtleSBpdHNlbGYgaWYgcHJlZml4IGlzIGVtcHR5LlxuICovXG5mdW5jdGlvbiBqb2luKHByZWZpeDogc3RyaW5nLCBrZXk6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBwcmVmaXggPyBgJHtwcmVmaXh9LiR7a2V5fWAgOiBrZXk7XG59XG5cbi8qKlxuICogUmVjdXJzaXZlbHkgZmxhdHRlbnMgYW4gb2JqZWN0IGludG8gYSB0YXJnZXQgb2JqZWN0IHdpdGggZG90IG5vdGF0aW9uIHBhdGhzLlxuICogSGFuZGxlcyBzcGVjaWFsIGNhc2VzOlxuICogLSBBcnJheXMgYXJlIGFzc2lnbmVkIGRpcmVjdGx5XG4gKiAtIEN1c3RvbSBFSlNPTiB0eXBlcyBhcmUgcHJlc2VydmVkXG4gKiAtIE1vbmdvLk9iamVjdElEcyBhcmUgcHJlc2VydmVkXG4gKiAtIFBsYWluIG9iamVjdHMgYXJlIHJlY3Vyc2l2ZWx5IGZsYXR0ZW5lZFxuICogLSBFbXB0eSBvYmplY3RzIGFyZSBhc3NpZ25lZCBkaXJlY3RseVxuICovXG5mdW5jdGlvbiBmbGF0dGVuT2JqZWN0SW50byhcbiAgdGFyZ2V0OiBSZWNvcmQ8c3RyaW5nLCBhbnk+LFxuICBzb3VyY2U6IGFueSxcbiAgcHJlZml4OiBzdHJpbmdcbik6IHZvaWQge1xuICBpZiAoXG4gICAgQXJyYXkuaXNBcnJheShzb3VyY2UpIHx8XG4gICAgdHlwZW9mIHNvdXJjZSAhPT0gJ29iamVjdCcgfHxcbiAgICBzb3VyY2UgPT09IG51bGwgfHxcbiAgICBzb3VyY2UgaW5zdGFuY2VvZiBNb25nby5PYmplY3RJRCB8fFxuICAgIEVKU09OLl9pc0N1c3RvbVR5cGUoc291cmNlKVxuICApIHtcbiAgICB0YXJnZXRbcHJlZml4XSA9IHNvdXJjZTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBlbnRyaWVzID0gT2JqZWN0LmVudHJpZXMoc291cmNlKTtcbiAgaWYgKGVudHJpZXMubGVuZ3RoKSB7XG4gICAgZW50cmllcy5mb3JFYWNoKChba2V5LCB2YWx1ZV0pID0+IHtcbiAgICAgIGZsYXR0ZW5PYmplY3RJbnRvKHRhcmdldCwgdmFsdWUsIGpvaW4ocHJlZml4LCBrZXkpKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICB0YXJnZXRbcHJlZml4XSA9IHNvdXJjZTtcbiAgfVxufVxuXG4vKipcbiAqIENvbnZlcnRzIGFuIG9wbG9nIGRpZmYgdG8gYSBzZXJpZXMgb2YgJHNldCBhbmQgJHVuc2V0IG9wZXJhdGlvbnMuXG4gKiBIYW5kbGVzIHNldmVyYWwgdHlwZXMgb2Ygb3BlcmF0aW9uczpcbiAqIC0gRGlyZWN0IHVuc2V0cyB2aWEgJ2QnIGZpZWxkXG4gKiAtIE5lc3RlZCBzZXRzIHZpYSAnaScgZmllbGRcbiAqIC0gVG9wLWxldmVsIHNldHMgdmlhICd1JyBmaWVsZFxuICogLSBBcnJheSBvcGVyYXRpb25zIGFuZCBuZXN0ZWQgb2JqZWN0cyB2aWEgJ3MnIHByZWZpeGVkIGZpZWxkc1xuICpcbiAqIFByZXNlcnZlcyB0aGUgc3RydWN0dXJlIG9mIEVKU09OIGN1c3RvbSB0eXBlcyBhbmQgT2JqZWN0SURzIHdoaWxlXG4gKiBmbGF0dGVuaW5nIHBhdGhzIGludG8gZG90IG5vdGF0aW9uIGZvciBNb25nb0RCIHVwZGF0ZXMuXG4gKi9cbmZ1bmN0aW9uIGNvbnZlcnRPcGxvZ0RpZmYoXG4gIG9wbG9nRW50cnk6IE9wbG9nRW50cnksXG4gIGRpZmY6IE9wbG9nRGlmZixcbiAgcHJlZml4ID0gJydcbik6IHZvaWQge1xuICBPYmplY3QuZW50cmllcyhkaWZmKS5mb3JFYWNoKChbZGlmZktleSwgdmFsdWVdKSA9PiB7XG4gICAgaWYgKGRpZmZLZXkgPT09ICdkJykge1xuICAgICAgLy8gSGFuZGxlIGAkdW5zZXRgc1xuICAgICAgb3Bsb2dFbnRyeS4kdW5zZXQgPz89IHt9O1xuICAgICAgT2JqZWN0LmtleXModmFsdWUpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgb3Bsb2dFbnRyeS4kdW5zZXQhW2pvaW4ocHJlZml4LCBrZXkpXSA9IHRydWU7XG4gICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKGRpZmZLZXkgPT09ICdpJykge1xuICAgICAgLy8gSGFuZGxlIChwb3RlbnRpYWxseSkgbmVzdGVkIGAkc2V0YHNcbiAgICAgIG9wbG9nRW50cnkuJHNldCA/Pz0ge307XG4gICAgICBmbGF0dGVuT2JqZWN0SW50byhvcGxvZ0VudHJ5LiRzZXQsIHZhbHVlLCBwcmVmaXgpO1xuICAgIH0gZWxzZSBpZiAoZGlmZktleSA9PT0gJ3UnKSB7XG4gICAgICAvLyBIYW5kbGUgZmxhdCBgJHNldGBzXG4gICAgICBvcGxvZ0VudHJ5LiRzZXQgPz89IHt9O1xuICAgICAgT2JqZWN0LmVudHJpZXModmFsdWUpLmZvckVhY2goKFtrZXksIGZpZWxkVmFsdWVdKSA9PiB7XG4gICAgICAgIG9wbG9nRW50cnkuJHNldCFbam9pbihwcmVmaXgsIGtleSldID0gZmllbGRWYWx1ZTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSBpZiAoZGlmZktleS5zdGFydHNXaXRoKCdzJykpIHtcbiAgICAgIC8vIEhhbmRsZSBzLWZpZWxkcyAoYXJyYXkgb3BlcmF0aW9ucyBhbmQgbmVzdGVkIG9iamVjdHMpXG4gICAgICBjb25zdCBrZXkgPSBkaWZmS2V5LnNsaWNlKDEpO1xuICAgICAgaWYgKGlzQXJyYXlPcGVyYXRvcih2YWx1ZSkpIHtcbiAgICAgICAgLy8gQXJyYXkgb3BlcmF0b3JcbiAgICAgICAgT2JqZWN0LmVudHJpZXModmFsdWUpLmZvckVhY2goKFtwb3NpdGlvbiwgZmllbGRWYWx1ZV0pID0+IHtcbiAgICAgICAgICBpZiAocG9zaXRpb24gPT09ICdhJykgcmV0dXJuO1xuXG4gICAgICAgICAgY29uc3QgcG9zaXRpb25LZXkgPSBqb2luKHByZWZpeCwgYCR7a2V5fS4ke3Bvc2l0aW9uLnNsaWNlKDEpfWApO1xuICAgICAgICAgIGlmIChwb3NpdGlvblswXSA9PT0gJ3MnKSB7XG4gICAgICAgICAgICBjb252ZXJ0T3Bsb2dEaWZmKG9wbG9nRW50cnksIGZpZWxkVmFsdWUsIHBvc2l0aW9uS2V5KTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgICAgIG9wbG9nRW50cnkuJHVuc2V0ID8/PSB7fTtcbiAgICAgICAgICAgIG9wbG9nRW50cnkuJHVuc2V0W3Bvc2l0aW9uS2V5XSA9IHRydWU7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG9wbG9nRW50cnkuJHNldCA/Pz0ge307XG4gICAgICAgICAgICBvcGxvZ0VudHJ5LiRzZXRbcG9zaXRpb25LZXldID0gZmllbGRWYWx1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIGlmIChrZXkpIHtcbiAgICAgICAgLy8gTmVzdGVkIG9iamVjdFxuICAgICAgICBjb252ZXJ0T3Bsb2dEaWZmKG9wbG9nRW50cnksIHZhbHVlLCBqb2luKHByZWZpeCwga2V5KSk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbn1cblxuLyoqXG4gKiBDb252ZXJ0cyBhIE1vbmdvREIgdjIgb3Bsb2cgZW50cnkgdG8gdjEgZm9ybWF0LlxuICogUmV0dXJucyB0aGUgb3JpZ2luYWwgZW50cnkgdW5jaGFuZ2VkIGlmIGl0J3Mgbm90IGEgdjIgb3Bsb2cgZW50cnlcbiAqIG9yIGRvZXNuJ3QgY29udGFpbiBhIGRpZmYgZmllbGQuXG4gKlxuICogVGhlIGNvbnZlcnRlZCBlbnRyeSB3aWxsIGNvbnRhaW4gJHNldCBhbmQgJHVuc2V0IG9wZXJhdGlvbnMgdGhhdCBhcmVcbiAqIGVxdWl2YWxlbnQgdG8gdGhlIHYyIGRpZmYgZm9ybWF0LCB3aXRoIHBhdGhzIGZsYXR0ZW5lZCB0byBkb3Qgbm90YXRpb25cbiAqIGFuZCBzcGVjaWFsIGhhbmRsaW5nIGZvciBFSlNPTiBjdXN0b20gdHlwZXMgYW5kIE9iamVjdElEcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG9wbG9nVjJWMUNvbnZlcnRlcihvcGxvZ0VudHJ5OiBPcGxvZ0VudHJ5KTogT3Bsb2dFbnRyeSB7XG4gIGlmIChvcGxvZ0VudHJ5LiR2ICE9PSAyIHx8ICFvcGxvZ0VudHJ5LmRpZmYpIHtcbiAgICByZXR1cm4gb3Bsb2dFbnRyeTtcbiAgfVxuXG4gIGNvbnN0IGNvbnZlcnRlZE9wbG9nRW50cnk6IE9wbG9nRW50cnkgPSB7ICR2OiAyIH07XG4gIGNvbnZlcnRPcGxvZ0RpZmYoY29udmVydGVkT3Bsb2dFbnRyeSwgb3Bsb2dFbnRyeS5kaWZmKTtcbiAgcmV0dXJuIGNvbnZlcnRlZE9wbG9nRW50cnk7XG59IiwiaW50ZXJmYWNlIEN1cnNvck9wdGlvbnMge1xuICBsaW1pdD86IG51bWJlcjtcbiAgc2tpcD86IG51bWJlcjtcbiAgc29ydD86IFJlY29yZDxzdHJpbmcsIDEgfCAtMT47XG4gIGZpZWxkcz86IFJlY29yZDxzdHJpbmcsIDEgfCAwPjtcbiAgcHJvamVjdGlvbj86IFJlY29yZDxzdHJpbmcsIDEgfCAwPjtcbiAgZGlzYWJsZU9wbG9nPzogYm9vbGVhbjtcbiAgX2Rpc2FibGVPcGxvZz86IGJvb2xlYW47XG4gIHRhaWxhYmxlPzogYm9vbGVhbjtcbiAgdHJhbnNmb3JtPzogKGRvYzogYW55KSA9PiBhbnk7XG59XG5cbi8qKlxuICogUmVwcmVzZW50cyB0aGUgYXJndW1lbnRzIHVzZWQgdG8gY29uc3RydWN0IGEgY3Vyc29yLlxuICogVXNlZCBhcyBhIGtleSBmb3IgY3Vyc29yIGRlLWR1cGxpY2F0aW9uLlxuICpcbiAqIEFsbCBwcm9wZXJ0aWVzIG11c3QgYmUgZWl0aGVyOlxuICogLSBKU09OLXN0cmluZ2lmaWFibGUsIG9yXG4gKiAtIE5vdCBhZmZlY3Qgb2JzZXJ2ZUNoYW5nZXMgb3V0cHV0IChlLmcuLCBvcHRpb25zLnRyYW5zZm9ybSBmdW5jdGlvbnMpXG4gKi9cbmV4cG9ydCBjbGFzcyBDdXJzb3JEZXNjcmlwdGlvbiB7XG4gIGNvbGxlY3Rpb25OYW1lOiBzdHJpbmc7XG4gIHNlbGVjdG9yOiBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xuICBvcHRpb25zOiBDdXJzb3JPcHRpb25zO1xuXG4gIGNvbnN0cnVjdG9yKGNvbGxlY3Rpb25OYW1lOiBzdHJpbmcsIHNlbGVjdG9yOiBhbnksIG9wdGlvbnM/OiBDdXJzb3JPcHRpb25zKSB7XG4gICAgdGhpcy5jb2xsZWN0aW9uTmFtZSA9IGNvbGxlY3Rpb25OYW1lO1xuICAgIC8vIEB0cy1pZ25vcmVcbiAgICB0aGlzLnNlbGVjdG9yID0gTW9uZ28uQ29sbGVjdGlvbi5fcmV3cml0ZVNlbGVjdG9yKHNlbGVjdG9yKTtcbiAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICB9XG59IiwiaW1wb3J0IHsgTWV0ZW9yIH0gZnJvbSAnbWV0ZW9yL21ldGVvcic7XG5pbXBvcnQgeyBDTElFTlRfT05MWV9NRVRIT0RTLCBnZXRBc3luY01ldGhvZE5hbWUgfSBmcm9tICdtZXRlb3IvbWluaW1vbmdvL2NvbnN0YW50cyc7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IEFzeW5jaHJvbm91c0N1cnNvciB9IGZyb20gJy4vYXN5bmNocm9ub3VzX2N1cnNvcic7XG5pbXBvcnQgeyBDdXJzb3IgfSBmcm9tICcuL2N1cnNvcic7XG5pbXBvcnQgeyBDdXJzb3JEZXNjcmlwdGlvbiB9IGZyb20gJy4vY3Vyc29yX2Rlc2NyaXB0aW9uJztcbmltcG9ydCB7IERvY0ZldGNoZXIgfSBmcm9tICcuL2RvY19mZXRjaGVyJztcbmltcG9ydCB7IE1vbmdvREIsIHJlcGxhY2VNZXRlb3JBdG9tV2l0aE1vbmdvLCByZXBsYWNlVHlwZXMsIHRyYW5zZm9ybVJlc3VsdCB9IGZyb20gJy4vbW9uZ29fY29tbW9uJztcbmltcG9ydCB7IE9ic2VydmVIYW5kbGUgfSBmcm9tICcuL29ic2VydmVfaGFuZGxlJztcbmltcG9ydCB7IE9ic2VydmVNdWx0aXBsZXhlciB9IGZyb20gJy4vb2JzZXJ2ZV9tdWx0aXBsZXgnO1xuaW1wb3J0IHsgT3Bsb2dPYnNlcnZlRHJpdmVyIH0gZnJvbSAnLi9vcGxvZ19vYnNlcnZlX2RyaXZlcic7XG5pbXBvcnQgeyBPUExPR19DT0xMRUNUSU9OLCBPcGxvZ0hhbmRsZSB9IGZyb20gJy4vb3Bsb2dfdGFpbGluZyc7XG5pbXBvcnQgeyBQb2xsaW5nT2JzZXJ2ZURyaXZlciB9IGZyb20gJy4vcG9sbGluZ19vYnNlcnZlX2RyaXZlcic7XG5cbmNvbnN0IEZJTEVfQVNTRVRfU1VGRklYID0gJ0Fzc2V0JztcbmNvbnN0IEFTU0VUU19GT0xERVIgPSAnYXNzZXRzJztcbmNvbnN0IEFQUF9GT0xERVIgPSAnYXBwJztcblxuY29uc3Qgb3Bsb2dDb2xsZWN0aW9uV2FybmluZ3MgPSBbXTtcblxuZXhwb3J0IGNvbnN0IE1vbmdvQ29ubmVjdGlvbiA9IGZ1bmN0aW9uICh1cmwsIG9wdGlvbnMpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgc2VsZi5fb2JzZXJ2ZU11bHRpcGxleGVycyA9IHt9O1xuICBzZWxmLl9vbkZhaWxvdmVySG9vayA9IG5ldyBIb29rO1xuXG4gIGNvbnN0IHVzZXJPcHRpb25zID0ge1xuICAgIC4uLihNb25nby5fY29ubmVjdGlvbk9wdGlvbnMgfHwge30pLFxuICAgIC4uLihNZXRlb3Iuc2V0dGluZ3M/LnBhY2thZ2VzPy5tb25nbz8ub3B0aW9ucyB8fCB7fSlcbiAgfTtcblxuICB2YXIgbW9uZ29PcHRpb25zID0gT2JqZWN0LmFzc2lnbih7XG4gICAgaWdub3JlVW5kZWZpbmVkOiB0cnVlLFxuICB9LCB1c2VyT3B0aW9ucyk7XG5cblxuXG4gIC8vIEludGVybmFsbHkgdGhlIG9wbG9nIGNvbm5lY3Rpb25zIHNwZWNpZnkgdGhlaXIgb3duIG1heFBvb2xTaXplXG4gIC8vIHdoaWNoIHdlIGRvbid0IHdhbnQgdG8gb3ZlcndyaXRlIHdpdGggYW55IHVzZXIgZGVmaW5lZCB2YWx1ZVxuICBpZiAoJ21heFBvb2xTaXplJyBpbiBvcHRpb25zKSB7XG4gICAgLy8gSWYgd2UganVzdCBzZXQgdGhpcyBmb3IgXCJzZXJ2ZXJcIiwgcmVwbFNldCB3aWxsIG92ZXJyaWRlIGl0LiBJZiB3ZSBqdXN0XG4gICAgLy8gc2V0IGl0IGZvciByZXBsU2V0LCBpdCB3aWxsIGJlIGlnbm9yZWQgaWYgd2UncmUgbm90IHVzaW5nIGEgcmVwbFNldC5cbiAgICBtb25nb09wdGlvbnMubWF4UG9vbFNpemUgPSBvcHRpb25zLm1heFBvb2xTaXplO1xuICB9XG4gIGlmICgnbWluUG9vbFNpemUnIGluIG9wdGlvbnMpIHtcbiAgICBtb25nb09wdGlvbnMubWluUG9vbFNpemUgPSBvcHRpb25zLm1pblBvb2xTaXplO1xuICB9XG5cbiAgLy8gVHJhbnNmb3JtIG9wdGlvbnMgbGlrZSBcInRsc0NBRmlsZUFzc2V0XCI6IFwiZmlsZW5hbWUucGVtXCIgaW50b1xuICAvLyBcInRsc0NBRmlsZVwiOiBcIi88ZnVsbHBhdGg+L2ZpbGVuYW1lLnBlbVwiXG4gIE9iamVjdC5lbnRyaWVzKG1vbmdvT3B0aW9ucyB8fCB7fSlcbiAgICAuZmlsdGVyKChba2V5XSkgPT4ga2V5ICYmIGtleS5lbmRzV2l0aChGSUxFX0FTU0VUX1NVRkZJWCkpXG4gICAgLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuICAgICAgY29uc3Qgb3B0aW9uTmFtZSA9IGtleS5yZXBsYWNlKEZJTEVfQVNTRVRfU1VGRklYLCAnJyk7XG4gICAgICBtb25nb09wdGlvbnNbb3B0aW9uTmFtZV0gPSBwYXRoLmpvaW4oQXNzZXRzLmdldFNlcnZlckRpcigpLFxuICAgICAgICBBU1NFVFNfRk9MREVSLCBBUFBfRk9MREVSLCB2YWx1ZSk7XG4gICAgICBkZWxldGUgbW9uZ29PcHRpb25zW2tleV07XG4gICAgfSk7XG5cbiAgc2VsZi5kYiA9IG51bGw7XG4gIHNlbGYuX29wbG9nSGFuZGxlID0gbnVsbDtcbiAgc2VsZi5fZG9jRmV0Y2hlciA9IG51bGw7XG5cbiAgbW9uZ29PcHRpb25zLmRyaXZlckluZm8gPSB7XG4gICAgbmFtZTogJ01ldGVvcicsXG4gICAgdmVyc2lvbjogTWV0ZW9yLnJlbGVhc2VcbiAgfVxuXG4gIHNlbGYuY2xpZW50ID0gbmV3IE1vbmdvREIuTW9uZ29DbGllbnQodXJsLCBtb25nb09wdGlvbnMpO1xuICBzZWxmLmRiID0gc2VsZi5jbGllbnQuZGIoKTtcblxuICBzZWxmLmNsaWVudC5vbignc2VydmVyRGVzY3JpcHRpb25DaGFuZ2VkJywgTWV0ZW9yLmJpbmRFbnZpcm9ubWVudChldmVudCA9PiB7XG4gICAgLy8gV2hlbiB0aGUgY29ubmVjdGlvbiBpcyBubyBsb25nZXIgYWdhaW5zdCB0aGUgcHJpbWFyeSBub2RlLCBleGVjdXRlIGFsbFxuICAgIC8vIGZhaWxvdmVyIGhvb2tzLiBUaGlzIGlzIGltcG9ydGFudCBmb3IgdGhlIGRyaXZlciBhcyBpdCBoYXMgdG8gcmUtcG9vbCB0aGVcbiAgICAvLyBxdWVyeSB3aGVuIGl0IGhhcHBlbnMuXG4gICAgaWYgKFxuICAgICAgZXZlbnQucHJldmlvdXNEZXNjcmlwdGlvbi50eXBlICE9PSAnUlNQcmltYXJ5JyAmJlxuICAgICAgZXZlbnQubmV3RGVzY3JpcHRpb24udHlwZSA9PT0gJ1JTUHJpbWFyeSdcbiAgICApIHtcbiAgICAgIHNlbGYuX29uRmFpbG92ZXJIb29rLmVhY2goY2FsbGJhY2sgPT4ge1xuICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfSkpO1xuXG4gIGlmIChvcHRpb25zLm9wbG9nVXJsICYmICEgUGFja2FnZVsnZGlzYWJsZS1vcGxvZyddKSB7XG4gICAgc2VsZi5fb3Bsb2dIYW5kbGUgPSBuZXcgT3Bsb2dIYW5kbGUob3B0aW9ucy5vcGxvZ1VybCwgc2VsZi5kYi5kYXRhYmFzZU5hbWUpO1xuICAgIHNlbGYuX2RvY0ZldGNoZXIgPSBuZXcgRG9jRmV0Y2hlcihzZWxmKTtcbiAgfVxuXG59O1xuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLl9jbG9zZSA9IGFzeW5jIGZ1bmN0aW9uKCkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgaWYgKCEgc2VsZi5kYilcbiAgICB0aHJvdyBFcnJvcihcImNsb3NlIGNhbGxlZCBiZWZvcmUgQ29ubmVjdGlvbiBjcmVhdGVkP1wiKTtcblxuICAvLyBYWFggcHJvYmFibHkgdW50ZXN0ZWRcbiAgdmFyIG9wbG9nSGFuZGxlID0gc2VsZi5fb3Bsb2dIYW5kbGU7XG4gIHNlbGYuX29wbG9nSGFuZGxlID0gbnVsbDtcbiAgaWYgKG9wbG9nSGFuZGxlKVxuICAgIGF3YWl0IG9wbG9nSGFuZGxlLnN0b3AoKTtcblxuICAvLyBVc2UgRnV0dXJlLndyYXAgc28gdGhhdCBlcnJvcnMgZ2V0IHRocm93bi4gVGhpcyBoYXBwZW5zIHRvXG4gIC8vIHdvcmsgZXZlbiBvdXRzaWRlIGEgZmliZXIgc2luY2UgdGhlICdjbG9zZScgbWV0aG9kIGlzIG5vdFxuICAvLyBhY3R1YWxseSBhc3luY2hyb25vdXMuXG4gIGF3YWl0IHNlbGYuY2xpZW50LmNsb3NlKCk7XG59O1xuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLmNsb3NlID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdGhpcy5fY2xvc2UoKTtcbn07XG5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUuX3NldE9wbG9nSGFuZGxlID0gZnVuY3Rpb24ob3Bsb2dIYW5kbGUpIHtcbiAgdGhpcy5fb3Bsb2dIYW5kbGUgPSBvcGxvZ0hhbmRsZTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vLyBSZXR1cm5zIHRoZSBNb25nbyBDb2xsZWN0aW9uIG9iamVjdDsgbWF5IHlpZWxkLlxuTW9uZ29Db25uZWN0aW9uLnByb3RvdHlwZS5yYXdDb2xsZWN0aW9uID0gZnVuY3Rpb24gKGNvbGxlY3Rpb25OYW1lKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICBpZiAoISBzZWxmLmRiKVxuICAgIHRocm93IEVycm9yKFwicmF3Q29sbGVjdGlvbiBjYWxsZWQgYmVmb3JlIENvbm5lY3Rpb24gY3JlYXRlZD9cIik7XG5cbiAgcmV0dXJuIHNlbGYuZGIuY29sbGVjdGlvbihjb2xsZWN0aW9uTmFtZSk7XG59O1xuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLmNyZWF0ZUNhcHBlZENvbGxlY3Rpb25Bc3luYyA9IGFzeW5jIGZ1bmN0aW9uIChcbiAgY29sbGVjdGlvbk5hbWUsIGJ5dGVTaXplLCBtYXhEb2N1bWVudHMpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIGlmICghIHNlbGYuZGIpXG4gICAgdGhyb3cgRXJyb3IoXCJjcmVhdGVDYXBwZWRDb2xsZWN0aW9uQXN5bmMgY2FsbGVkIGJlZm9yZSBDb25uZWN0aW9uIGNyZWF0ZWQ/XCIpO1xuXG5cbiAgYXdhaXQgc2VsZi5kYi5jcmVhdGVDb2xsZWN0aW9uKGNvbGxlY3Rpb25OYW1lLFxuICAgIHsgY2FwcGVkOiB0cnVlLCBzaXplOiBieXRlU2l6ZSwgbWF4OiBtYXhEb2N1bWVudHMgfSk7XG59O1xuXG4vLyBUaGlzIHNob3VsZCBiZSBjYWxsZWQgc3luY2hyb25vdXNseSB3aXRoIGEgd3JpdGUsIHRvIGNyZWF0ZSBhXG4vLyB0cmFuc2FjdGlvbiBvbiB0aGUgY3VycmVudCB3cml0ZSBmZW5jZSwgaWYgYW55LiBBZnRlciB3ZSBjYW4gcmVhZFxuLy8gdGhlIHdyaXRlLCBhbmQgYWZ0ZXIgb2JzZXJ2ZXJzIGhhdmUgYmVlbiBub3RpZmllZCAob3IgYXQgbGVhc3QsXG4vLyBhZnRlciB0aGUgb2JzZXJ2ZXIgbm90aWZpZXJzIGhhdmUgYWRkZWQgdGhlbXNlbHZlcyB0byB0aGUgd3JpdGVcbi8vIGZlbmNlKSwgeW91IHNob3VsZCBjYWxsICdjb21taXR0ZWQoKScgb24gdGhlIG9iamVjdCByZXR1cm5lZC5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUuX21heWJlQmVnaW5Xcml0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgZmVuY2UgPSBERFBTZXJ2ZXIuX2dldEN1cnJlbnRGZW5jZSgpO1xuICBpZiAoZmVuY2UpIHtcbiAgICByZXR1cm4gZmVuY2UuYmVnaW5Xcml0ZSgpO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiB7Y29tbWl0dGVkOiBmdW5jdGlvbiAoKSB7fX07XG4gIH1cbn07XG5cbi8vIEludGVybmFsIGludGVyZmFjZTogYWRkcyBhIGNhbGxiYWNrIHdoaWNoIGlzIGNhbGxlZCB3aGVuIHRoZSBNb25nbyBwcmltYXJ5XG4vLyBjaGFuZ2VzLiBSZXR1cm5zIGEgc3RvcCBoYW5kbGUuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLl9vbkZhaWxvdmVyID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gIHJldHVybiB0aGlzLl9vbkZhaWxvdmVySG9vay5yZWdpc3RlcihjYWxsYmFjayk7XG59O1xuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLmluc2VydEFzeW5jID0gYXN5bmMgZnVuY3Rpb24gKGNvbGxlY3Rpb25fbmFtZSwgZG9jdW1lbnQpIHtcbiAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgaWYgKGNvbGxlY3Rpb25fbmFtZSA9PT0gXCJfX19tZXRlb3JfZmFpbHVyZV90ZXN0X2NvbGxlY3Rpb25cIikge1xuICAgIGNvbnN0IGUgPSBuZXcgRXJyb3IoXCJGYWlsdXJlIHRlc3RcIik7XG4gICAgZS5fZXhwZWN0ZWRCeVRlc3QgPSB0cnVlO1xuICAgIHRocm93IGU7XG4gIH1cblxuICBpZiAoIShMb2NhbENvbGxlY3Rpb24uX2lzUGxhaW5PYmplY3QoZG9jdW1lbnQpICYmXG4gICAgIUVKU09OLl9pc0N1c3RvbVR5cGUoZG9jdW1lbnQpKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIk9ubHkgcGxhaW4gb2JqZWN0cyBtYXkgYmUgaW5zZXJ0ZWQgaW50byBNb25nb0RCXCIpO1xuICB9XG5cbiAgdmFyIHdyaXRlID0gc2VsZi5fbWF5YmVCZWdpbldyaXRlKCk7XG4gIHZhciByZWZyZXNoID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIGF3YWl0IE1ldGVvci5yZWZyZXNoKHtjb2xsZWN0aW9uOiBjb2xsZWN0aW9uX25hbWUsIGlkOiBkb2N1bWVudC5faWQgfSk7XG4gIH07XG4gIHJldHVybiBzZWxmLnJhd0NvbGxlY3Rpb24oY29sbGVjdGlvbl9uYW1lKS5pbnNlcnRPbmUoXG4gICAgcmVwbGFjZVR5cGVzKGRvY3VtZW50LCByZXBsYWNlTWV0ZW9yQXRvbVdpdGhNb25nbyksXG4gICAge1xuICAgICAgc2FmZTogdHJ1ZSxcbiAgICB9XG4gICkudGhlbihhc3luYyAoe2luc2VydGVkSWR9KSA9PiB7XG4gICAgYXdhaXQgcmVmcmVzaCgpO1xuICAgIGF3YWl0IHdyaXRlLmNvbW1pdHRlZCgpO1xuICAgIHJldHVybiBpbnNlcnRlZElkO1xuICB9KS5jYXRjaChhc3luYyBlID0+IHtcbiAgICBhd2FpdCB3cml0ZS5jb21taXR0ZWQoKTtcbiAgICB0aHJvdyBlO1xuICB9KTtcbn07XG5cblxuLy8gQ2F1c2UgcXVlcmllcyB0aGF0IG1heSBiZSBhZmZlY3RlZCBieSB0aGUgc2VsZWN0b3IgdG8gcG9sbCBpbiB0aGlzIHdyaXRlXG4vLyBmZW5jZS5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUuX3JlZnJlc2ggPSBhc3luYyBmdW5jdGlvbiAoY29sbGVjdGlvbk5hbWUsIHNlbGVjdG9yKSB7XG4gIHZhciByZWZyZXNoS2V5ID0ge2NvbGxlY3Rpb246IGNvbGxlY3Rpb25OYW1lfTtcbiAgLy8gSWYgd2Uga25vdyB3aGljaCBkb2N1bWVudHMgd2UncmUgcmVtb3ZpbmcsIGRvbid0IHBvbGwgcXVlcmllcyB0aGF0IGFyZVxuICAvLyBzcGVjaWZpYyB0byBvdGhlciBkb2N1bWVudHMuIChOb3RlIHRoYXQgbXVsdGlwbGUgbm90aWZpY2F0aW9ucyBoZXJlIHNob3VsZFxuICAvLyBub3QgY2F1c2UgbXVsdGlwbGUgcG9sbHMsIHNpbmNlIGFsbCBvdXIgbGlzdGVuZXIgaXMgZG9pbmcgaXMgZW5xdWV1ZWluZyBhXG4gIC8vIHBvbGwuKVxuICB2YXIgc3BlY2lmaWNJZHMgPSBMb2NhbENvbGxlY3Rpb24uX2lkc01hdGNoZWRCeVNlbGVjdG9yKHNlbGVjdG9yKTtcbiAgaWYgKHNwZWNpZmljSWRzKSB7XG4gICAgZm9yIChjb25zdCBpZCBvZiBzcGVjaWZpY0lkcykge1xuICAgICAgYXdhaXQgTWV0ZW9yLnJlZnJlc2goT2JqZWN0LmFzc2lnbih7aWQ6IGlkfSwgcmVmcmVzaEtleSkpO1xuICAgIH07XG4gIH0gZWxzZSB7XG4gICAgYXdhaXQgTWV0ZW9yLnJlZnJlc2gocmVmcmVzaEtleSk7XG4gIH1cbn07XG5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUucmVtb3ZlQXN5bmMgPSBhc3luYyBmdW5jdGlvbiAoY29sbGVjdGlvbl9uYW1lLCBzZWxlY3Rvcikge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgaWYgKGNvbGxlY3Rpb25fbmFtZSA9PT0gXCJfX19tZXRlb3JfZmFpbHVyZV90ZXN0X2NvbGxlY3Rpb25cIikge1xuICAgIHZhciBlID0gbmV3IEVycm9yKFwiRmFpbHVyZSB0ZXN0XCIpO1xuICAgIGUuX2V4cGVjdGVkQnlUZXN0ID0gdHJ1ZTtcbiAgICB0aHJvdyBlO1xuICB9XG5cbiAgdmFyIHdyaXRlID0gc2VsZi5fbWF5YmVCZWdpbldyaXRlKCk7XG4gIHZhciByZWZyZXNoID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIGF3YWl0IHNlbGYuX3JlZnJlc2goY29sbGVjdGlvbl9uYW1lLCBzZWxlY3Rvcik7XG4gIH07XG5cbiAgcmV0dXJuIHNlbGYucmF3Q29sbGVjdGlvbihjb2xsZWN0aW9uX25hbWUpXG4gICAgLmRlbGV0ZU1hbnkocmVwbGFjZVR5cGVzKHNlbGVjdG9yLCByZXBsYWNlTWV0ZW9yQXRvbVdpdGhNb25nbyksIHtcbiAgICAgIHNhZmU6IHRydWUsXG4gICAgfSlcbiAgICAudGhlbihhc3luYyAoeyBkZWxldGVkQ291bnQgfSkgPT4ge1xuICAgICAgYXdhaXQgcmVmcmVzaCgpO1xuICAgICAgYXdhaXQgd3JpdGUuY29tbWl0dGVkKCk7XG4gICAgICByZXR1cm4gdHJhbnNmb3JtUmVzdWx0KHsgcmVzdWx0IDoge21vZGlmaWVkQ291bnQgOiBkZWxldGVkQ291bnR9IH0pLm51bWJlckFmZmVjdGVkO1xuICAgIH0pLmNhdGNoKGFzeW5jIChlcnIpID0+IHtcbiAgICAgIGF3YWl0IHdyaXRlLmNvbW1pdHRlZCgpO1xuICAgICAgdGhyb3cgZXJyO1xuICAgIH0pO1xufTtcblxuTW9uZ29Db25uZWN0aW9uLnByb3RvdHlwZS5kcm9wQ29sbGVjdGlvbkFzeW5jID0gYXN5bmMgZnVuY3Rpb24oY29sbGVjdGlvbk5hbWUpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG5cbiAgdmFyIHdyaXRlID0gc2VsZi5fbWF5YmVCZWdpbldyaXRlKCk7XG4gIHZhciByZWZyZXNoID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIE1ldGVvci5yZWZyZXNoKHtcbiAgICAgIGNvbGxlY3Rpb246IGNvbGxlY3Rpb25OYW1lLFxuICAgICAgaWQ6IG51bGwsXG4gICAgICBkcm9wQ29sbGVjdGlvbjogdHJ1ZSxcbiAgICB9KTtcbiAgfTtcblxuICByZXR1cm4gc2VsZlxuICAgIC5yYXdDb2xsZWN0aW9uKGNvbGxlY3Rpb25OYW1lKVxuICAgIC5kcm9wKClcbiAgICAudGhlbihhc3luYyByZXN1bHQgPT4ge1xuICAgICAgYXdhaXQgcmVmcmVzaCgpO1xuICAgICAgYXdhaXQgd3JpdGUuY29tbWl0dGVkKCk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0pXG4gICAgLmNhdGNoKGFzeW5jIGUgPT4ge1xuICAgICAgYXdhaXQgd3JpdGUuY29tbWl0dGVkKCk7XG4gICAgICB0aHJvdyBlO1xuICAgIH0pO1xufTtcblxuLy8gRm9yIHRlc3Rpbmcgb25seS4gIFNsaWdodGx5IGJldHRlciB0aGFuIGBjLnJhd0RhdGFiYXNlKCkuZHJvcERhdGFiYXNlKClgXG4vLyBiZWNhdXNlIGl0IGxldHMgdGhlIHRlc3QncyBmZW5jZSB3YWl0IGZvciBpdCB0byBiZSBjb21wbGV0ZS5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUuZHJvcERhdGFiYXNlQXN5bmMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICB2YXIgd3JpdGUgPSBzZWxmLl9tYXliZUJlZ2luV3JpdGUoKTtcbiAgdmFyIHJlZnJlc2ggPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgYXdhaXQgTWV0ZW9yLnJlZnJlc2goeyBkcm9wRGF0YWJhc2U6IHRydWUgfSk7XG4gIH07XG5cbiAgdHJ5IHtcbiAgICBhd2FpdCBzZWxmLmRiLl9kcm9wRGF0YWJhc2UoKTtcbiAgICBhd2FpdCByZWZyZXNoKCk7XG4gICAgYXdhaXQgd3JpdGUuY29tbWl0dGVkKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBhd2FpdCB3cml0ZS5jb21taXR0ZWQoKTtcbiAgICB0aHJvdyBlO1xuICB9XG59O1xuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLnVwZGF0ZUFzeW5jID0gYXN5bmMgZnVuY3Rpb24gKGNvbGxlY3Rpb25fbmFtZSwgc2VsZWN0b3IsIG1vZCwgb3B0aW9ucykge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgaWYgKGNvbGxlY3Rpb25fbmFtZSA9PT0gXCJfX19tZXRlb3JfZmFpbHVyZV90ZXN0X2NvbGxlY3Rpb25cIikge1xuICAgIHZhciBlID0gbmV3IEVycm9yKFwiRmFpbHVyZSB0ZXN0XCIpO1xuICAgIGUuX2V4cGVjdGVkQnlUZXN0ID0gdHJ1ZTtcbiAgICB0aHJvdyBlO1xuICB9XG5cbiAgLy8gZXhwbGljaXQgc2FmZXR5IGNoZWNrLiBudWxsIGFuZCB1bmRlZmluZWQgY2FuIGNyYXNoIHRoZSBtb25nb1xuICAvLyBkcml2ZXIuIEFsdGhvdWdoIHRoZSBub2RlIGRyaXZlciBhbmQgbWluaW1vbmdvIGRvICdzdXBwb3J0J1xuICAvLyBub24tb2JqZWN0IG1vZGlmaWVyIGluIHRoYXQgdGhleSBkb24ndCBjcmFzaCwgdGhleSBhcmUgbm90XG4gIC8vIG1lYW5pbmdmdWwgb3BlcmF0aW9ucyBhbmQgZG8gbm90IGRvIGFueXRoaW5nLiBEZWZlbnNpdmVseSB0aHJvdyBhblxuICAvLyBlcnJvciBoZXJlLlxuICBpZiAoIW1vZCB8fCB0eXBlb2YgbW9kICE9PSAnb2JqZWN0Jykge1xuICAgIGNvbnN0IGVycm9yID0gbmV3IEVycm9yKFwiSW52YWxpZCBtb2RpZmllci4gTW9kaWZpZXIgbXVzdCBiZSBhbiBvYmplY3QuXCIpO1xuXG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cblxuICBpZiAoIShMb2NhbENvbGxlY3Rpb24uX2lzUGxhaW5PYmplY3QobW9kKSAmJiAhRUpTT04uX2lzQ3VzdG9tVHlwZShtb2QpKSkge1xuICAgIGNvbnN0IGVycm9yID0gbmV3IEVycm9yKFxuICAgICAgXCJPbmx5IHBsYWluIG9iamVjdHMgbWF5IGJlIHVzZWQgYXMgcmVwbGFjZW1lbnRcIiArXG4gICAgICBcIiBkb2N1bWVudHMgaW4gTW9uZ29EQlwiKTtcblxuICAgIHRocm93IGVycm9yO1xuICB9XG5cbiAgaWYgKCFvcHRpb25zKSBvcHRpb25zID0ge307XG5cbiAgdmFyIHdyaXRlID0gc2VsZi5fbWF5YmVCZWdpbldyaXRlKCk7XG4gIHZhciByZWZyZXNoID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIGF3YWl0IHNlbGYuX3JlZnJlc2goY29sbGVjdGlvbl9uYW1lLCBzZWxlY3Rvcik7XG4gIH07XG5cbiAgdmFyIGNvbGxlY3Rpb24gPSBzZWxmLnJhd0NvbGxlY3Rpb24oY29sbGVjdGlvbl9uYW1lKTtcbiAgdmFyIG1vbmdvT3B0cyA9IHtzYWZlOiB0cnVlfTtcbiAgLy8gQWRkIHN1cHBvcnQgZm9yIGZpbHRlcmVkIHBvc2l0aW9uYWwgb3BlcmF0b3JcbiAgaWYgKG9wdGlvbnMuYXJyYXlGaWx0ZXJzICE9PSB1bmRlZmluZWQpIG1vbmdvT3B0cy5hcnJheUZpbHRlcnMgPSBvcHRpb25zLmFycmF5RmlsdGVycztcbiAgLy8gZXhwbGljdGx5IGVudW1lcmF0ZSBvcHRpb25zIHRoYXQgbWluaW1vbmdvIHN1cHBvcnRzXG4gIGlmIChvcHRpb25zLnVwc2VydCkgbW9uZ29PcHRzLnVwc2VydCA9IHRydWU7XG4gIGlmIChvcHRpb25zLm11bHRpKSBtb25nb09wdHMubXVsdGkgPSB0cnVlO1xuICAvLyBMZXRzIHlvdSBnZXQgYSBtb3JlIG1vcmUgZnVsbCByZXN1bHQgZnJvbSBNb25nb0RCLiBVc2Ugd2l0aCBjYXV0aW9uOlxuICAvLyBtaWdodCBub3Qgd29yayB3aXRoIEMudXBzZXJ0IChhcyBvcHBvc2VkIHRvIEMudXBkYXRlKHt1cHNlcnQ6dHJ1ZX0pIG9yXG4gIC8vIHdpdGggc2ltdWxhdGVkIHVwc2VydC5cbiAgaWYgKG9wdGlvbnMuZnVsbFJlc3VsdCkgbW9uZ29PcHRzLmZ1bGxSZXN1bHQgPSB0cnVlO1xuXG4gIHZhciBtb25nb1NlbGVjdG9yID0gcmVwbGFjZVR5cGVzKHNlbGVjdG9yLCByZXBsYWNlTWV0ZW9yQXRvbVdpdGhNb25nbyk7XG4gIHZhciBtb25nb01vZCA9IHJlcGxhY2VUeXBlcyhtb2QsIHJlcGxhY2VNZXRlb3JBdG9tV2l0aE1vbmdvKTtcblxuICB2YXIgaXNNb2RpZnkgPSBMb2NhbENvbGxlY3Rpb24uX2lzTW9kaWZpY2F0aW9uTW9kKG1vbmdvTW9kKTtcblxuICBpZiAob3B0aW9ucy5fZm9yYmlkUmVwbGFjZSAmJiAhaXNNb2RpZnkpIHtcbiAgICB2YXIgZXJyID0gbmV3IEVycm9yKFwiSW52YWxpZCBtb2RpZmllci4gUmVwbGFjZW1lbnRzIGFyZSBmb3JiaWRkZW4uXCIpO1xuICAgIHRocm93IGVycjtcbiAgfVxuXG4gIC8vIFdlJ3ZlIGFscmVhZHkgcnVuIHJlcGxhY2VUeXBlcy9yZXBsYWNlTWV0ZW9yQXRvbVdpdGhNb25nbyBvblxuICAvLyBzZWxlY3RvciBhbmQgbW9kLiAgV2UgYXNzdW1lIGl0IGRvZXNuJ3QgbWF0dGVyLCBhcyBmYXIgYXNcbiAgLy8gdGhlIGJlaGF2aW9yIG9mIG1vZGlmaWVycyBpcyBjb25jZXJuZWQsIHdoZXRoZXIgYF9tb2RpZnlgXG4gIC8vIGlzIHJ1biBvbiBFSlNPTiBvciBvbiBtb25nby1jb252ZXJ0ZWQgRUpTT04uXG5cbiAgLy8gUnVuIHRoaXMgY29kZSB1cCBmcm9udCBzbyB0aGF0IGl0IGZhaWxzIGZhc3QgaWYgc29tZW9uZSB1c2VzXG4gIC8vIGEgTW9uZ28gdXBkYXRlIG9wZXJhdG9yIHdlIGRvbid0IHN1cHBvcnQuXG4gIGxldCBrbm93bklkO1xuICBpZiAob3B0aW9ucy51cHNlcnQpIHtcbiAgICB0cnkge1xuICAgICAgbGV0IG5ld0RvYyA9IExvY2FsQ29sbGVjdGlvbi5fY3JlYXRlVXBzZXJ0RG9jdW1lbnQoc2VsZWN0b3IsIG1vZCk7XG4gICAgICBrbm93bklkID0gbmV3RG9jLl9pZDtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIHRocm93IGVycjtcbiAgICB9XG4gIH1cbiAgaWYgKG9wdGlvbnMudXBzZXJ0ICYmXG4gICAgISBpc01vZGlmeSAmJlxuICAgICEga25vd25JZCAmJlxuICAgIG9wdGlvbnMuaW5zZXJ0ZWRJZCAmJlxuICAgICEgKG9wdGlvbnMuaW5zZXJ0ZWRJZCBpbnN0YW5jZW9mIE1vbmdvLk9iamVjdElEICYmXG4gICAgICBvcHRpb25zLmdlbmVyYXRlZElkKSkge1xuICAgIC8vIEluIGNhc2Ugb2YgYW4gdXBzZXJ0IHdpdGggYSByZXBsYWNlbWVudCwgd2hlcmUgdGhlcmUgaXMgbm8gX2lkIGRlZmluZWRcbiAgICAvLyBpbiBlaXRoZXIgdGhlIHF1ZXJ5IG9yIHRoZSByZXBsYWNlbWVudCBkb2MsIG1vbmdvIHdpbGwgZ2VuZXJhdGUgYW4gaWQgaXRzZWxmLlxuICAgIC8vIFRoZXJlZm9yZSB3ZSBuZWVkIHRoaXMgc3BlY2lhbCBzdHJhdGVneSBpZiB3ZSB3YW50IHRvIGNvbnRyb2wgdGhlIGlkIG91cnNlbHZlcy5cblxuICAgIC8vIFdlIGRvbid0IG5lZWQgdG8gZG8gdGhpcyB3aGVuOlxuICAgIC8vIC0gVGhpcyBpcyBub3QgYSByZXBsYWNlbWVudCwgc28gd2UgY2FuIGFkZCBhbiBfaWQgdG8gJHNldE9uSW5zZXJ0XG4gICAgLy8gLSBUaGUgaWQgaXMgZGVmaW5lZCBieSBxdWVyeSBvciBtb2Qgd2UgY2FuIGp1c3QgYWRkIGl0IHRvIHRoZSByZXBsYWNlbWVudCBkb2NcbiAgICAvLyAtIFRoZSB1c2VyIGRpZCBub3Qgc3BlY2lmeSBhbnkgaWQgcHJlZmVyZW5jZSBhbmQgdGhlIGlkIGlzIGEgTW9uZ28gT2JqZWN0SWQsXG4gICAgLy8gICAgIHRoZW4gd2UgY2FuIGp1c3QgbGV0IE1vbmdvIGdlbmVyYXRlIHRoZSBpZFxuICAgIHJldHVybiBhd2FpdCBzaW11bGF0ZVVwc2VydFdpdGhJbnNlcnRlZElkKGNvbGxlY3Rpb24sIG1vbmdvU2VsZWN0b3IsIG1vbmdvTW9kLCBvcHRpb25zKVxuICAgICAgLnRoZW4oYXN5bmMgcmVzdWx0ID0+IHtcbiAgICAgICAgYXdhaXQgcmVmcmVzaCgpO1xuICAgICAgICBhd2FpdCB3cml0ZS5jb21taXR0ZWQoKTtcbiAgICAgICAgaWYgKHJlc3VsdCAmJiAhIG9wdGlvbnMuX3JldHVybk9iamVjdCkge1xuICAgICAgICAgIHJldHVybiByZXN1bHQubnVtYmVyQWZmZWN0ZWQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgaWYgKG9wdGlvbnMudXBzZXJ0ICYmICFrbm93bklkICYmIG9wdGlvbnMuaW5zZXJ0ZWRJZCAmJiBpc01vZGlmeSkge1xuICAgICAgaWYgKCFtb25nb01vZC5oYXNPd25Qcm9wZXJ0eSgnJHNldE9uSW5zZXJ0JykpIHtcbiAgICAgICAgbW9uZ29Nb2QuJHNldE9uSW5zZXJ0ID0ge307XG4gICAgICB9XG4gICAgICBrbm93bklkID0gb3B0aW9ucy5pbnNlcnRlZElkO1xuICAgICAgT2JqZWN0LmFzc2lnbihtb25nb01vZC4kc2V0T25JbnNlcnQsIHJlcGxhY2VUeXBlcyh7X2lkOiBvcHRpb25zLmluc2VydGVkSWR9LCByZXBsYWNlTWV0ZW9yQXRvbVdpdGhNb25nbykpO1xuICAgIH1cblxuICAgIGNvbnN0IHN0cmluZ3MgPSBPYmplY3Qua2V5cyhtb25nb01vZCkuZmlsdGVyKChrZXkpID0+ICFrZXkuc3RhcnRzV2l0aChcIiRcIikpO1xuICAgIGxldCB1cGRhdGVNZXRob2QgPSBzdHJpbmdzLmxlbmd0aCA+IDAgPyAncmVwbGFjZU9uZScgOiAndXBkYXRlTWFueSc7XG4gICAgdXBkYXRlTWV0aG9kID1cbiAgICAgIHVwZGF0ZU1ldGhvZCA9PT0gJ3VwZGF0ZU1hbnknICYmICFtb25nb09wdHMubXVsdGlcbiAgICAgICAgPyAndXBkYXRlT25lJ1xuICAgICAgICA6IHVwZGF0ZU1ldGhvZDtcbiAgICByZXR1cm4gY29sbGVjdGlvblt1cGRhdGVNZXRob2RdXG4gICAgICAuYmluZChjb2xsZWN0aW9uKShtb25nb1NlbGVjdG9yLCBtb25nb01vZCwgbW9uZ29PcHRzKVxuICAgICAgLnRoZW4oYXN5bmMgcmVzdWx0ID0+IHtcbiAgICAgICAgdmFyIG1ldGVvclJlc3VsdCA9IHRyYW5zZm9ybVJlc3VsdCh7cmVzdWx0fSk7XG4gICAgICAgIGlmIChtZXRlb3JSZXN1bHQgJiYgb3B0aW9ucy5fcmV0dXJuT2JqZWN0KSB7XG4gICAgICAgICAgLy8gSWYgdGhpcyB3YXMgYW4gdXBzZXJ0QXN5bmMoKSBjYWxsLCBhbmQgd2UgZW5kZWQgdXBcbiAgICAgICAgICAvLyBpbnNlcnRpbmcgYSBuZXcgZG9jIGFuZCB3ZSBrbm93IGl0cyBpZCwgdGhlblxuICAgICAgICAgIC8vIHJldHVybiB0aGF0IGlkIGFzIHdlbGwuXG4gICAgICAgICAgaWYgKG9wdGlvbnMudXBzZXJ0ICYmIG1ldGVvclJlc3VsdC5pbnNlcnRlZElkKSB7XG4gICAgICAgICAgICBpZiAoa25vd25JZCkge1xuICAgICAgICAgICAgICBtZXRlb3JSZXN1bHQuaW5zZXJ0ZWRJZCA9IGtub3duSWQ7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG1ldGVvclJlc3VsdC5pbnNlcnRlZElkIGluc3RhbmNlb2YgTW9uZ29EQi5PYmplY3RJZCkge1xuICAgICAgICAgICAgICBtZXRlb3JSZXN1bHQuaW5zZXJ0ZWRJZCA9IG5ldyBNb25nby5PYmplY3RJRChtZXRlb3JSZXN1bHQuaW5zZXJ0ZWRJZC50b0hleFN0cmluZygpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgYXdhaXQgcmVmcmVzaCgpO1xuICAgICAgICAgIGF3YWl0IHdyaXRlLmNvbW1pdHRlZCgpO1xuICAgICAgICAgIHJldHVybiBtZXRlb3JSZXN1bHQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYXdhaXQgcmVmcmVzaCgpO1xuICAgICAgICAgIGF3YWl0IHdyaXRlLmNvbW1pdHRlZCgpO1xuICAgICAgICAgIHJldHVybiBtZXRlb3JSZXN1bHQubnVtYmVyQWZmZWN0ZWQ7XG4gICAgICAgIH1cbiAgICAgIH0pLmNhdGNoKGFzeW5jIChlcnIpID0+IHtcbiAgICAgICAgYXdhaXQgd3JpdGUuY29tbWl0dGVkKCk7XG4gICAgICAgIHRocm93IGVycjtcbiAgICAgIH0pO1xuICB9XG59O1xuXG4vLyBleHBvc2VkIGZvciB0ZXN0aW5nXG5Nb25nb0Nvbm5lY3Rpb24uX2lzQ2Fubm90Q2hhbmdlSWRFcnJvciA9IGZ1bmN0aW9uIChlcnIpIHtcblxuICAvLyBNb25nbyAzLjIuKiByZXR1cm5zIGVycm9yIGFzIG5leHQgT2JqZWN0OlxuICAvLyB7bmFtZTogU3RyaW5nLCBjb2RlOiBOdW1iZXIsIGVycm1zZzogU3RyaW5nfVxuICAvLyBPbGRlciBNb25nbyByZXR1cm5zOlxuICAvLyB7bmFtZTogU3RyaW5nLCBjb2RlOiBOdW1iZXIsIGVycjogU3RyaW5nfVxuICB2YXIgZXJyb3IgPSBlcnIuZXJybXNnIHx8IGVyci5lcnI7XG5cbiAgLy8gV2UgZG9uJ3QgdXNlIHRoZSBlcnJvciBjb2RlIGhlcmVcbiAgLy8gYmVjYXVzZSB0aGUgZXJyb3IgY29kZSB3ZSBvYnNlcnZlZCBpdCBwcm9kdWNpbmcgKDE2ODM3KSBhcHBlYXJzIHRvIGJlXG4gIC8vIGEgZmFyIG1vcmUgZ2VuZXJpYyBlcnJvciBjb2RlIGJhc2VkIG9uIGV4YW1pbmluZyB0aGUgc291cmNlLlxuICBpZiAoZXJyb3IuaW5kZXhPZignVGhlIF9pZCBmaWVsZCBjYW5ub3QgYmUgY2hhbmdlZCcpID09PSAwXG4gICAgfHwgZXJyb3IuaW5kZXhPZihcInRoZSAoaW1tdXRhYmxlKSBmaWVsZCAnX2lkJyB3YXMgZm91bmQgdG8gaGF2ZSBiZWVuIGFsdGVyZWQgdG8gX2lkXCIpICE9PSAtMSkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgcmV0dXJuIGZhbHNlO1xufTtcblxuLy8gWFhYIE1vbmdvQ29ubmVjdGlvbi51cHNlcnRBc3luYygpIGRvZXMgbm90IHJldHVybiB0aGUgaWQgb2YgdGhlIGluc2VydGVkIGRvY3VtZW50XG4vLyB1bmxlc3MgeW91IHNldCBpdCBleHBsaWNpdGx5IGluIHRoZSBzZWxlY3RvciBvciBtb2RpZmllciAoYXMgYSByZXBsYWNlbWVudFxuLy8gZG9jKS5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUudXBzZXJ0QXN5bmMgPSBhc3luYyBmdW5jdGlvbiAoY29sbGVjdGlvbk5hbWUsIHNlbGVjdG9yLCBtb2QsIG9wdGlvbnMpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG5cblxuICBpZiAodHlwZW9mIG9wdGlvbnMgPT09IFwiZnVuY3Rpb25cIiAmJiAhIGNhbGxiYWNrKSB7XG4gICAgY2FsbGJhY2sgPSBvcHRpb25zO1xuICAgIG9wdGlvbnMgPSB7fTtcbiAgfVxuXG4gIHJldHVybiBzZWxmLnVwZGF0ZUFzeW5jKGNvbGxlY3Rpb25OYW1lLCBzZWxlY3RvciwgbW9kLFxuICAgIE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIHtcbiAgICAgIHVwc2VydDogdHJ1ZSxcbiAgICAgIF9yZXR1cm5PYmplY3Q6IHRydWVcbiAgICB9KSk7XG59O1xuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLmZpbmQgPSBmdW5jdGlvbiAoY29sbGVjdGlvbk5hbWUsIHNlbGVjdG9yLCBvcHRpb25zKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSlcbiAgICBzZWxlY3RvciA9IHt9O1xuXG4gIHJldHVybiBuZXcgQ3Vyc29yKFxuICAgIHNlbGYsIG5ldyBDdXJzb3JEZXNjcmlwdGlvbihjb2xsZWN0aW9uTmFtZSwgc2VsZWN0b3IsIG9wdGlvbnMpKTtcbn07XG5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUuZmluZE9uZUFzeW5jID0gYXN5bmMgZnVuY3Rpb24gKGNvbGxlY3Rpb25fbmFtZSwgc2VsZWN0b3IsIG9wdGlvbnMpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkge1xuICAgIHNlbGVjdG9yID0ge307XG4gIH1cblxuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgb3B0aW9ucy5saW1pdCA9IDE7XG5cbiAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHNlbGYuZmluZChjb2xsZWN0aW9uX25hbWUsIHNlbGVjdG9yLCBvcHRpb25zKS5mZXRjaCgpO1xuXG4gIHJldHVybiByZXN1bHRzWzBdO1xufTtcblxuLy8gV2UnbGwgYWN0dWFsbHkgZGVzaWduIGFuIGluZGV4IEFQSSBsYXRlci4gRm9yIG5vdywgd2UganVzdCBwYXNzIHRocm91Z2ggdG9cbi8vIE1vbmdvJ3MsIGJ1dCBtYWtlIGl0IHN5bmNocm9ub3VzLlxuTW9uZ29Db25uZWN0aW9uLnByb3RvdHlwZS5jcmVhdGVJbmRleEFzeW5jID0gYXN5bmMgZnVuY3Rpb24gKGNvbGxlY3Rpb25OYW1lLCBpbmRleCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICAvLyBXZSBleHBlY3QgdGhpcyBmdW5jdGlvbiB0byBiZSBjYWxsZWQgYXQgc3RhcnR1cCwgbm90IGZyb20gd2l0aGluIGEgbWV0aG9kLFxuICAvLyBzbyB3ZSBkb24ndCBpbnRlcmFjdCB3aXRoIHRoZSB3cml0ZSBmZW5jZS5cbiAgdmFyIGNvbGxlY3Rpb24gPSBzZWxmLnJhd0NvbGxlY3Rpb24oY29sbGVjdGlvbk5hbWUpO1xuICBhd2FpdCBjb2xsZWN0aW9uLmNyZWF0ZUluZGV4KGluZGV4LCBvcHRpb25zKTtcbn07XG5cbi8vIGp1c3QgdG8gYmUgY29uc2lzdGVudCB3aXRoIHRoZSBvdGhlciBtZXRob2RzXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLmNyZWF0ZUluZGV4ID1cbiAgTW9uZ29Db25uZWN0aW9uLnByb3RvdHlwZS5jcmVhdGVJbmRleEFzeW5jO1xuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLmNvdW50RG9jdW1lbnRzID0gZnVuY3Rpb24gKGNvbGxlY3Rpb25OYW1lLCAuLi5hcmdzKSB7XG4gIGFyZ3MgPSBhcmdzLm1hcChhcmcgPT4gcmVwbGFjZVR5cGVzKGFyZywgcmVwbGFjZU1ldGVvckF0b21XaXRoTW9uZ28pKTtcbiAgY29uc3QgY29sbGVjdGlvbiA9IHRoaXMucmF3Q29sbGVjdGlvbihjb2xsZWN0aW9uTmFtZSk7XG4gIHJldHVybiBjb2xsZWN0aW9uLmNvdW50RG9jdW1lbnRzKC4uLmFyZ3MpO1xufTtcblxuTW9uZ29Db25uZWN0aW9uLnByb3RvdHlwZS5lc3RpbWF0ZWREb2N1bWVudENvdW50ID0gZnVuY3Rpb24gKGNvbGxlY3Rpb25OYW1lLCAuLi5hcmdzKSB7XG4gIGFyZ3MgPSBhcmdzLm1hcChhcmcgPT4gcmVwbGFjZVR5cGVzKGFyZywgcmVwbGFjZU1ldGVvckF0b21XaXRoTW9uZ28pKTtcbiAgY29uc3QgY29sbGVjdGlvbiA9IHRoaXMucmF3Q29sbGVjdGlvbihjb2xsZWN0aW9uTmFtZSk7XG4gIHJldHVybiBjb2xsZWN0aW9uLmVzdGltYXRlZERvY3VtZW50Q291bnQoLi4uYXJncyk7XG59O1xuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLmVuc3VyZUluZGV4QXN5bmMgPSBNb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLmNyZWF0ZUluZGV4QXN5bmM7XG5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUuZHJvcEluZGV4QXN5bmMgPSBhc3luYyBmdW5jdGlvbiAoY29sbGVjdGlvbk5hbWUsIGluZGV4KSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgb25seSB1c2VkIGJ5IHRlc3QgY29kZSwgbm90IHdpdGhpbiBhIG1ldGhvZCwgc28gd2UgZG9uJ3RcbiAgLy8gaW50ZXJhY3Qgd2l0aCB0aGUgd3JpdGUgZmVuY2UuXG4gIHZhciBjb2xsZWN0aW9uID0gc2VsZi5yYXdDb2xsZWN0aW9uKGNvbGxlY3Rpb25OYW1lKTtcbiAgdmFyIGluZGV4TmFtZSA9ICBhd2FpdCBjb2xsZWN0aW9uLmRyb3BJbmRleChpbmRleCk7XG59O1xuXG5cbkNMSUVOVF9PTkxZX01FVEhPRFMuZm9yRWFjaChmdW5jdGlvbiAobSkge1xuICBNb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlW21dID0gZnVuY3Rpb24gKCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIGAke219ICsgIGlzIG5vdCBhdmFpbGFibGUgb24gdGhlIHNlcnZlci4gUGxlYXNlIHVzZSAke2dldEFzeW5jTWV0aG9kTmFtZShcbiAgICAgICAgbVxuICAgICAgKX0oKSBpbnN0ZWFkLmBcbiAgICApO1xuICB9O1xufSk7XG5cblxudmFyIE5VTV9PUFRJTUlTVElDX1RSSUVTID0gMztcblxuXG5cbnZhciBzaW11bGF0ZVVwc2VydFdpdGhJbnNlcnRlZElkID0gYXN5bmMgZnVuY3Rpb24gKGNvbGxlY3Rpb24sIHNlbGVjdG9yLCBtb2QsIG9wdGlvbnMpIHtcbiAgLy8gU1RSQVRFR1k6IEZpcnN0IHRyeSBkb2luZyBhbiB1cHNlcnQgd2l0aCBhIGdlbmVyYXRlZCBJRC5cbiAgLy8gSWYgdGhpcyB0aHJvd3MgYW4gZXJyb3IgYWJvdXQgY2hhbmdpbmcgdGhlIElEIG9uIGFuIGV4aXN0aW5nIGRvY3VtZW50XG4gIC8vIHRoZW4gd2l0aG91dCBhZmZlY3RpbmcgdGhlIGRhdGFiYXNlLCB3ZSBrbm93IHdlIHNob3VsZCBwcm9iYWJseSB0cnlcbiAgLy8gYW4gdXBkYXRlIHdpdGhvdXQgdGhlIGdlbmVyYXRlZCBJRC4gSWYgaXQgYWZmZWN0ZWQgMCBkb2N1bWVudHMsXG4gIC8vIHRoZW4gd2l0aG91dCBhZmZlY3RpbmcgdGhlIGRhdGFiYXNlLCB3ZSB0aGUgZG9jdW1lbnQgdGhhdCBmaXJzdFxuICAvLyBnYXZlIHRoZSBlcnJvciBpcyBwcm9iYWJseSByZW1vdmVkIGFuZCB3ZSBuZWVkIHRvIHRyeSBhbiBpbnNlcnQgYWdhaW5cbiAgLy8gV2UgZ28gYmFjayB0byBzdGVwIG9uZSBhbmQgcmVwZWF0LlxuICAvLyBMaWtlIGFsbCBcIm9wdGltaXN0aWMgd3JpdGVcIiBzY2hlbWVzLCB3ZSByZWx5IG9uIHRoZSBmYWN0IHRoYXQgaXQnc1xuICAvLyB1bmxpa2VseSBvdXIgd3JpdGVzIHdpbGwgY29udGludWUgdG8gYmUgaW50ZXJmZXJlZCB3aXRoIHVuZGVyIG5vcm1hbFxuICAvLyBjaXJjdW1zdGFuY2VzICh0aG91Z2ggc3VmZmljaWVudGx5IGhlYXZ5IGNvbnRlbnRpb24gd2l0aCB3cml0ZXJzXG4gIC8vIGRpc2FncmVlaW5nIG9uIHRoZSBleGlzdGVuY2Ugb2YgYW4gb2JqZWN0IHdpbGwgY2F1c2Ugd3JpdGVzIHRvIGZhaWxcbiAgLy8gaW4gdGhlb3J5KS5cblxuICB2YXIgaW5zZXJ0ZWRJZCA9IG9wdGlvbnMuaW5zZXJ0ZWRJZDsgLy8gbXVzdCBleGlzdFxuICB2YXIgbW9uZ29PcHRzRm9yVXBkYXRlID0ge1xuICAgIHNhZmU6IHRydWUsXG4gICAgbXVsdGk6IG9wdGlvbnMubXVsdGlcbiAgfTtcbiAgdmFyIG1vbmdvT3B0c0Zvckluc2VydCA9IHtcbiAgICBzYWZlOiB0cnVlLFxuICAgIHVwc2VydDogdHJ1ZVxuICB9O1xuXG4gIHZhciByZXBsYWNlbWVudFdpdGhJZCA9IE9iamVjdC5hc3NpZ24oXG4gICAgcmVwbGFjZVR5cGVzKHtfaWQ6IGluc2VydGVkSWR9LCByZXBsYWNlTWV0ZW9yQXRvbVdpdGhNb25nbyksXG4gICAgbW9kKTtcblxuICB2YXIgdHJpZXMgPSBOVU1fT1BUSU1JU1RJQ19UUklFUztcblxuICB2YXIgZG9VcGRhdGUgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgdHJpZXMtLTtcbiAgICBpZiAoISB0cmllcykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVXBzZXJ0IGZhaWxlZCBhZnRlciBcIiArIE5VTV9PUFRJTUlTVElDX1RSSUVTICsgXCIgdHJpZXMuXCIpO1xuICAgIH0gZWxzZSB7XG4gICAgICBsZXQgbWV0aG9kID0gY29sbGVjdGlvbi51cGRhdGVNYW55O1xuICAgICAgaWYoIU9iamVjdC5rZXlzKG1vZCkuc29tZShrZXkgPT4ga2V5LnN0YXJ0c1dpdGgoXCIkXCIpKSl7XG4gICAgICAgIG1ldGhvZCA9IGNvbGxlY3Rpb24ucmVwbGFjZU9uZS5iaW5kKGNvbGxlY3Rpb24pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG1ldGhvZChcbiAgICAgICAgc2VsZWN0b3IsXG4gICAgICAgIG1vZCxcbiAgICAgICAgbW9uZ29PcHRzRm9yVXBkYXRlKS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmIChyZXN1bHQgJiYgKHJlc3VsdC5tb2RpZmllZENvdW50IHx8IHJlc3VsdC51cHNlcnRlZENvdW50KSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBudW1iZXJBZmZlY3RlZDogcmVzdWx0Lm1vZGlmaWVkQ291bnQgfHwgcmVzdWx0LnVwc2VydGVkQ291bnQsXG4gICAgICAgICAgICBpbnNlcnRlZElkOiByZXN1bHQudXBzZXJ0ZWRJZCB8fCB1bmRlZmluZWQsXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gZG9Db25kaXRpb25hbEluc2VydCgpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH07XG5cbiAgdmFyIGRvQ29uZGl0aW9uYWxJbnNlcnQgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gY29sbGVjdGlvbi5yZXBsYWNlT25lKHNlbGVjdG9yLCByZXBsYWNlbWVudFdpdGhJZCwgbW9uZ29PcHRzRm9ySW5zZXJ0KVxuICAgICAgLnRoZW4ocmVzdWx0ID0+ICh7XG4gICAgICAgIG51bWJlckFmZmVjdGVkOiByZXN1bHQudXBzZXJ0ZWRDb3VudCxcbiAgICAgICAgaW5zZXJ0ZWRJZDogcmVzdWx0LnVwc2VydGVkSWQsXG4gICAgICB9KSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgaWYgKE1vbmdvQ29ubmVjdGlvbi5faXNDYW5ub3RDaGFuZ2VJZEVycm9yKGVycikpIHtcbiAgICAgICAgICByZXR1cm4gZG9VcGRhdGUoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gIH07XG4gIHJldHVybiBkb1VwZGF0ZSgpO1xufTtcblxuLy8gb2JzZXJ2ZUNoYW5nZXMgZm9yIHRhaWxhYmxlIGN1cnNvcnMgb24gY2FwcGVkIGNvbGxlY3Rpb25zLlxuLy9cbi8vIFNvbWUgZGlmZmVyZW5jZXMgZnJvbSBub3JtYWwgY3Vyc29yczpcbi8vICAgLSBXaWxsIG5ldmVyIHByb2R1Y2UgYW55dGhpbmcgb3RoZXIgdGhhbiAnYWRkZWQnIG9yICdhZGRlZEJlZm9yZScuIElmIHlvdVxuLy8gICAgIGRvIHVwZGF0ZSBhIGRvY3VtZW50IHRoYXQgaGFzIGFscmVhZHkgYmVlbiBwcm9kdWNlZCwgdGhpcyB3aWxsIG5vdCBub3RpY2Vcbi8vICAgICBpdC5cbi8vICAgLSBJZiB5b3UgZGlzY29ubmVjdCBhbmQgcmVjb25uZWN0IGZyb20gTW9uZ28sIGl0IHdpbGwgZXNzZW50aWFsbHkgcmVzdGFydFxuLy8gICAgIHRoZSBxdWVyeSwgd2hpY2ggd2lsbCBsZWFkIHRvIGR1cGxpY2F0ZSByZXN1bHRzLiBUaGlzIGlzIHByZXR0eSBiYWQsXG4vLyAgICAgYnV0IGlmIHlvdSBpbmNsdWRlIGEgZmllbGQgY2FsbGVkICd0cycgd2hpY2ggaXMgaW5zZXJ0ZWQgYXNcbi8vICAgICBuZXcgTW9uZ29JbnRlcm5hbHMuTW9uZ29UaW1lc3RhbXAoMCwgMCkgKHdoaWNoIGlzIGluaXRpYWxpemVkIHRvIHRoZVxuLy8gICAgIGN1cnJlbnQgTW9uZ28tc3R5bGUgdGltZXN0YW1wKSwgd2UnbGwgYmUgYWJsZSB0byBmaW5kIHRoZSBwbGFjZSB0b1xuLy8gICAgIHJlc3RhcnQgcHJvcGVybHkuIChUaGlzIGZpZWxkIGlzIHNwZWNpZmljYWxseSB1bmRlcnN0b29kIGJ5IE1vbmdvIHdpdGggYW5cbi8vICAgICBvcHRpbWl6YXRpb24gd2hpY2ggYWxsb3dzIGl0IHRvIGZpbmQgdGhlIHJpZ2h0IHBsYWNlIHRvIHN0YXJ0IHdpdGhvdXRcbi8vICAgICBhbiBpbmRleCBvbiB0cy4gSXQncyBob3cgdGhlIG9wbG9nIHdvcmtzLilcbi8vICAgLSBObyBjYWxsYmFja3MgYXJlIHRyaWdnZXJlZCBzeW5jaHJvbm91c2x5IHdpdGggdGhlIGNhbGwgKHRoZXJlJ3Mgbm9cbi8vICAgICBkaWZmZXJlbnRpYXRpb24gYmV0d2VlbiBcImluaXRpYWwgZGF0YVwiIGFuZCBcImxhdGVyIGNoYW5nZXNcIjsgZXZlcnl0aGluZ1xuLy8gICAgIHRoYXQgbWF0Y2hlcyB0aGUgcXVlcnkgZ2V0cyBzZW50IGFzeW5jaHJvbm91c2x5KS5cbi8vICAgLSBEZS1kdXBsaWNhdGlvbiBpcyBub3QgaW1wbGVtZW50ZWQuXG4vLyAgIC0gRG9lcyBub3QgeWV0IGludGVyYWN0IHdpdGggdGhlIHdyaXRlIGZlbmNlLiBQcm9iYWJseSwgdGhpcyBzaG91bGQgd29yayBieVxuLy8gICAgIGlnbm9yaW5nIHJlbW92ZXMgKHdoaWNoIGRvbid0IHdvcmsgb24gY2FwcGVkIGNvbGxlY3Rpb25zKSBhbmQgdXBkYXRlc1xuLy8gICAgICh3aGljaCBkb24ndCBhZmZlY3QgdGFpbGFibGUgY3Vyc29ycyksIGFuZCBqdXN0IGtlZXBpbmcgdHJhY2sgb2YgdGhlIElEXG4vLyAgICAgb2YgdGhlIGluc2VydGVkIG9iamVjdCwgYW5kIGNsb3NpbmcgdGhlIHdyaXRlIGZlbmNlIG9uY2UgeW91IGdldCB0byB0aGF0XG4vLyAgICAgSUQgKG9yIHRpbWVzdGFtcD8pLiAgVGhpcyBkb2Vzbid0IHdvcmsgd2VsbCBpZiB0aGUgZG9jdW1lbnQgZG9lc24ndCBtYXRjaFxuLy8gICAgIHRoZSBxdWVyeSwgdGhvdWdoLiAgT24gdGhlIG90aGVyIGhhbmQsIHRoZSB3cml0ZSBmZW5jZSBjYW4gY2xvc2Vcbi8vICAgICBpbW1lZGlhdGVseSBpZiBpdCBkb2VzIG5vdCBtYXRjaCB0aGUgcXVlcnkuIFNvIGlmIHdlIHRydXN0IG1pbmltb25nb1xuLy8gICAgIGVub3VnaCB0byBhY2N1cmF0ZWx5IGV2YWx1YXRlIHRoZSBxdWVyeSBhZ2FpbnN0IHRoZSB3cml0ZSBmZW5jZSwgd2Vcbi8vICAgICBzaG91bGQgYmUgYWJsZSB0byBkbyB0aGlzLi4uICBPZiBjb3Vyc2UsIG1pbmltb25nbyBkb2Vzbid0IGV2ZW4gc3VwcG9ydFxuLy8gICAgIE1vbmdvIFRpbWVzdGFtcHMgeWV0LlxuTW9uZ29Db25uZWN0aW9uLnByb3RvdHlwZS5fb2JzZXJ2ZUNoYW5nZXNUYWlsYWJsZSA9IGZ1bmN0aW9uIChcbiAgY3Vyc29yRGVzY3JpcHRpb24sIG9yZGVyZWQsIGNhbGxiYWNrcykge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgLy8gVGFpbGFibGUgY3Vyc29ycyBvbmx5IGV2ZXIgY2FsbCBhZGRlZC9hZGRlZEJlZm9yZSBjYWxsYmFja3MsIHNvIGl0J3MgYW5cbiAgLy8gZXJyb3IgaWYgeW91IGRpZG4ndCBwcm92aWRlIHRoZW0uXG4gIGlmICgob3JkZXJlZCAmJiAhY2FsbGJhY2tzLmFkZGVkQmVmb3JlKSB8fFxuICAgICghb3JkZXJlZCAmJiAhY2FsbGJhY2tzLmFkZGVkKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IG9ic2VydmUgYW4gXCIgKyAob3JkZXJlZCA/IFwib3JkZXJlZFwiIDogXCJ1bm9yZGVyZWRcIilcbiAgICAgICsgXCIgdGFpbGFibGUgY3Vyc29yIHdpdGhvdXQgYSBcIlxuICAgICAgKyAob3JkZXJlZCA/IFwiYWRkZWRCZWZvcmVcIiA6IFwiYWRkZWRcIikgKyBcIiBjYWxsYmFja1wiKTtcbiAgfVxuXG4gIHJldHVybiBzZWxmLnRhaWwoY3Vyc29yRGVzY3JpcHRpb24sIGZ1bmN0aW9uIChkb2MpIHtcbiAgICB2YXIgaWQgPSBkb2MuX2lkO1xuICAgIGRlbGV0ZSBkb2MuX2lkO1xuICAgIC8vIFRoZSB0cyBpcyBhbiBpbXBsZW1lbnRhdGlvbiBkZXRhaWwuIEhpZGUgaXQuXG4gICAgZGVsZXRlIGRvYy50cztcbiAgICBpZiAob3JkZXJlZCkge1xuICAgICAgY2FsbGJhY2tzLmFkZGVkQmVmb3JlKGlkLCBkb2MsIG51bGwpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjYWxsYmFja3MuYWRkZWQoaWQsIGRvYyk7XG4gICAgfVxuICB9KTtcbn07XG5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUuX2NyZWF0ZUFzeW5jaHJvbm91c0N1cnNvciA9IGZ1bmN0aW9uKFxuICBjdXJzb3JEZXNjcmlwdGlvbiwgb3B0aW9ucyA9IHt9KSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgY29uc3QgeyBzZWxmRm9ySXRlcmF0aW9uLCB1c2VUcmFuc2Zvcm0gfSA9IG9wdGlvbnM7XG4gIG9wdGlvbnMgPSB7IHNlbGZGb3JJdGVyYXRpb24sIHVzZVRyYW5zZm9ybSB9O1xuXG4gIHZhciBjb2xsZWN0aW9uID0gc2VsZi5yYXdDb2xsZWN0aW9uKGN1cnNvckRlc2NyaXB0aW9uLmNvbGxlY3Rpb25OYW1lKTtcbiAgdmFyIGN1cnNvck9wdGlvbnMgPSBjdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zO1xuICB2YXIgbW9uZ29PcHRpb25zID0ge1xuICAgIHNvcnQ6IGN1cnNvck9wdGlvbnMuc29ydCxcbiAgICBsaW1pdDogY3Vyc29yT3B0aW9ucy5saW1pdCxcbiAgICBza2lwOiBjdXJzb3JPcHRpb25zLnNraXAsXG4gICAgcHJvamVjdGlvbjogY3Vyc29yT3B0aW9ucy5maWVsZHMgfHwgY3Vyc29yT3B0aW9ucy5wcm9qZWN0aW9uLFxuICAgIHJlYWRQcmVmZXJlbmNlOiBjdXJzb3JPcHRpb25zLnJlYWRQcmVmZXJlbmNlLFxuICB9O1xuXG4gIC8vIERvIHdlIHdhbnQgYSB0YWlsYWJsZSBjdXJzb3IgKHdoaWNoIG9ubHkgd29ya3Mgb24gY2FwcGVkIGNvbGxlY3Rpb25zKT9cbiAgaWYgKGN1cnNvck9wdGlvbnMudGFpbGFibGUpIHtcbiAgICBtb25nb09wdGlvbnMubnVtYmVyT2ZSZXRyaWVzID0gLTE7XG4gIH1cblxuICB2YXIgZGJDdXJzb3IgPSBjb2xsZWN0aW9uLmZpbmQoXG4gICAgcmVwbGFjZVR5cGVzKGN1cnNvckRlc2NyaXB0aW9uLnNlbGVjdG9yLCByZXBsYWNlTWV0ZW9yQXRvbVdpdGhNb25nbyksXG4gICAgbW9uZ29PcHRpb25zKTtcblxuICAvLyBEbyB3ZSB3YW50IGEgdGFpbGFibGUgY3Vyc29yICh3aGljaCBvbmx5IHdvcmtzIG9uIGNhcHBlZCBjb2xsZWN0aW9ucyk/XG4gIGlmIChjdXJzb3JPcHRpb25zLnRhaWxhYmxlKSB7XG4gICAgLy8gV2Ugd2FudCBhIHRhaWxhYmxlIGN1cnNvci4uLlxuICAgIGRiQ3Vyc29yLmFkZEN1cnNvckZsYWcoXCJ0YWlsYWJsZVwiLCB0cnVlKVxuICAgIC8vIC4uLiBhbmQgZm9yIHRoZSBzZXJ2ZXIgdG8gd2FpdCBhIGJpdCBpZiBhbnkgZ2V0TW9yZSBoYXMgbm8gZGF0YSAocmF0aGVyXG4gICAgLy8gdGhhbiBtYWtpbmcgdXMgcHV0IHRoZSByZWxldmFudCBzbGVlcHMgaW4gdGhlIGNsaWVudCkuLi5cbiAgICBkYkN1cnNvci5hZGRDdXJzb3JGbGFnKFwiYXdhaXREYXRhXCIsIHRydWUpXG5cbiAgICAvLyBBbmQgaWYgdGhpcyBpcyBvbiB0aGUgb3Bsb2cgY29sbGVjdGlvbiBhbmQgdGhlIGN1cnNvciBzcGVjaWZpZXMgYSAndHMnLFxuICAgIC8vIHRoZW4gc2V0IHRoZSB1bmRvY3VtZW50ZWQgb3Bsb2cgcmVwbGF5IGZsYWcsIHdoaWNoIGRvZXMgYSBzcGVjaWFsIHNjYW4gdG9cbiAgICAvLyBmaW5kIHRoZSBmaXJzdCBkb2N1bWVudCAoaW5zdGVhZCBvZiBjcmVhdGluZyBhbiBpbmRleCBvbiB0cykuIFRoaXMgaXMgYVxuICAgIC8vIHZlcnkgaGFyZC1jb2RlZCBNb25nbyBmbGFnIHdoaWNoIG9ubHkgd29ya3Mgb24gdGhlIG9wbG9nIGNvbGxlY3Rpb24gYW5kXG4gICAgLy8gb25seSB3b3JrcyB3aXRoIHRoZSB0cyBmaWVsZC5cbiAgICBpZiAoY3Vyc29yRGVzY3JpcHRpb24uY29sbGVjdGlvbk5hbWUgPT09IE9QTE9HX0NPTExFQ1RJT04gJiZcbiAgICAgIGN1cnNvckRlc2NyaXB0aW9uLnNlbGVjdG9yLnRzKSB7XG4gICAgICBkYkN1cnNvci5hZGRDdXJzb3JGbGFnKFwib3Bsb2dSZXBsYXlcIiwgdHJ1ZSlcbiAgICB9XG4gIH1cblxuICBpZiAodHlwZW9mIGN1cnNvck9wdGlvbnMubWF4VGltZU1zICE9PSAndW5kZWZpbmVkJykge1xuICAgIGRiQ3Vyc29yID0gZGJDdXJzb3IubWF4VGltZU1TKGN1cnNvck9wdGlvbnMubWF4VGltZU1zKTtcbiAgfVxuICBpZiAodHlwZW9mIGN1cnNvck9wdGlvbnMuaGludCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBkYkN1cnNvciA9IGRiQ3Vyc29yLmhpbnQoY3Vyc29yT3B0aW9ucy5oaW50KTtcbiAgfVxuXG4gIHJldHVybiBuZXcgQXN5bmNocm9ub3VzQ3Vyc29yKGRiQ3Vyc29yLCBjdXJzb3JEZXNjcmlwdGlvbiwgb3B0aW9ucywgY29sbGVjdGlvbik7XG59O1xuXG4vLyBUYWlscyB0aGUgY3Vyc29yIGRlc2NyaWJlZCBieSBjdXJzb3JEZXNjcmlwdGlvbiwgbW9zdCBsaWtlbHkgb24gdGhlXG4vLyBvcGxvZy4gQ2FsbHMgZG9jQ2FsbGJhY2sgd2l0aCBlYWNoIGRvY3VtZW50IGZvdW5kLiBJZ25vcmVzIGVycm9ycyBhbmQganVzdFxuLy8gcmVzdGFydHMgdGhlIHRhaWwgb24gZXJyb3IuXG4vL1xuLy8gSWYgdGltZW91dE1TIGlzIHNldCwgdGhlbiBpZiB3ZSBkb24ndCBnZXQgYSBuZXcgZG9jdW1lbnQgZXZlcnkgdGltZW91dE1TLFxuLy8ga2lsbCBhbmQgcmVzdGFydCB0aGUgY3Vyc29yLiBUaGlzIGlzIHByaW1hcmlseSBhIHdvcmthcm91bmQgZm9yICM4NTk4LlxuTW9uZ29Db25uZWN0aW9uLnByb3RvdHlwZS50YWlsID0gZnVuY3Rpb24gKGN1cnNvckRlc2NyaXB0aW9uLCBkb2NDYWxsYmFjaywgdGltZW91dE1TKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgaWYgKCFjdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zLnRhaWxhYmxlKVxuICAgIHRocm93IG5ldyBFcnJvcihcIkNhbiBvbmx5IHRhaWwgYSB0YWlsYWJsZSBjdXJzb3JcIik7XG5cbiAgdmFyIGN1cnNvciA9IHNlbGYuX2NyZWF0ZUFzeW5jaHJvbm91c0N1cnNvcihjdXJzb3JEZXNjcmlwdGlvbik7XG5cbiAgdmFyIHN0b3BwZWQgPSBmYWxzZTtcbiAgdmFyIGxhc3RUUztcblxuICBNZXRlb3IuZGVmZXIoYXN5bmMgZnVuY3Rpb24gbG9vcCgpIHtcbiAgICB2YXIgZG9jID0gbnVsbDtcbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgaWYgKHN0b3BwZWQpXG4gICAgICAgIHJldHVybjtcbiAgICAgIHRyeSB7XG4gICAgICAgIGRvYyA9IGF3YWl0IGN1cnNvci5fbmV4dE9iamVjdFByb21pc2VXaXRoVGltZW91dCh0aW1lb3V0TVMpO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIC8vIFdlIHNob3VsZCBub3QgaWdub3JlIGVycm9ycyBoZXJlIHVubGVzcyB3ZSB3YW50IHRvIHNwZW5kIGEgbG90IG9mIHRpbWUgZGVidWdnaW5nXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyKTtcbiAgICAgICAgLy8gVGhlcmUncyBubyBnb29kIHdheSB0byBmaWd1cmUgb3V0IGlmIHRoaXMgd2FzIGFjdHVhbGx5IGFuIGVycm9yIGZyb21cbiAgICAgICAgLy8gTW9uZ28sIG9yIGp1c3QgY2xpZW50LXNpZGUgKGluY2x1ZGluZyBvdXIgb3duIHRpbWVvdXQgZXJyb3IpLiBBaFxuICAgICAgICAvLyB3ZWxsLiBCdXQgZWl0aGVyIHdheSwgd2UgbmVlZCB0byByZXRyeSB0aGUgY3Vyc29yICh1bmxlc3MgdGhlIGZhaWx1cmVcbiAgICAgICAgLy8gd2FzIGJlY2F1c2UgdGhlIG9ic2VydmUgZ290IHN0b3BwZWQpLlxuICAgICAgICBkb2MgPSBudWxsO1xuICAgICAgfVxuICAgICAgLy8gU2luY2Ugd2UgYXdhaXRlZCBhIHByb21pc2UgYWJvdmUsIHdlIG5lZWQgdG8gY2hlY2sgYWdhaW4gdG8gc2VlIGlmXG4gICAgICAvLyB3ZSd2ZSBiZWVuIHN0b3BwZWQgYmVmb3JlIGNhbGxpbmcgdGhlIGNhbGxiYWNrLlxuICAgICAgaWYgKHN0b3BwZWQpXG4gICAgICAgIHJldHVybjtcbiAgICAgIGlmIChkb2MpIHtcbiAgICAgICAgLy8gSWYgYSB0YWlsYWJsZSBjdXJzb3IgY29udGFpbnMgYSBcInRzXCIgZmllbGQsIHVzZSBpdCB0byByZWNyZWF0ZSB0aGVcbiAgICAgICAgLy8gY3Vyc29yIG9uIGVycm9yLiAoXCJ0c1wiIGlzIGEgc3RhbmRhcmQgdGhhdCBNb25nbyB1c2VzIGludGVybmFsbHkgZm9yXG4gICAgICAgIC8vIHRoZSBvcGxvZywgYW5kIHRoZXJlJ3MgYSBzcGVjaWFsIGZsYWcgdGhhdCBsZXRzIHlvdSBkbyBiaW5hcnkgc2VhcmNoXG4gICAgICAgIC8vIG9uIGl0IGluc3RlYWQgb2YgbmVlZGluZyB0byB1c2UgYW4gaW5kZXguKVxuICAgICAgICBsYXN0VFMgPSBkb2MudHM7XG4gICAgICAgIGRvY0NhbGxiYWNrKGRvYyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgbmV3U2VsZWN0b3IgPSBPYmplY3QuYXNzaWduKHt9LCBjdXJzb3JEZXNjcmlwdGlvbi5zZWxlY3Rvcik7XG4gICAgICAgIGlmIChsYXN0VFMpIHtcbiAgICAgICAgICBuZXdTZWxlY3Rvci50cyA9IHskZ3Q6IGxhc3RUU307XG4gICAgICAgIH1cbiAgICAgICAgY3Vyc29yID0gc2VsZi5fY3JlYXRlQXN5bmNocm9ub3VzQ3Vyc29yKG5ldyBDdXJzb3JEZXNjcmlwdGlvbihcbiAgICAgICAgICBjdXJzb3JEZXNjcmlwdGlvbi5jb2xsZWN0aW9uTmFtZSxcbiAgICAgICAgICBuZXdTZWxlY3RvcixcbiAgICAgICAgICBjdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zKSk7XG4gICAgICAgIC8vIE1vbmdvIGZhaWxvdmVyIHRha2VzIG1hbnkgc2Vjb25kcy4gIFJldHJ5IGluIGEgYml0LiAgKFdpdGhvdXQgdGhpc1xuICAgICAgICAvLyBzZXRUaW1lb3V0LCB3ZSBwZWcgdGhlIENQVSBhdCAxMDAlIGFuZCBuZXZlciBub3RpY2UgdGhlIGFjdHVhbFxuICAgICAgICAvLyBmYWlsb3Zlci5cbiAgICAgICAgc2V0VGltZW91dChsb29wLCAxMDApO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiB7XG4gICAgc3RvcDogZnVuY3Rpb24gKCkge1xuICAgICAgc3RvcHBlZCA9IHRydWU7XG4gICAgICBjdXJzb3IuY2xvc2UoKTtcbiAgICB9XG4gIH07XG59O1xuXG5PYmplY3QuYXNzaWduKE1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUsIHtcbiAgX29ic2VydmVDaGFuZ2VzOiBhc3luYyBmdW5jdGlvbiAoXG4gICAgY3Vyc29yRGVzY3JpcHRpb24sIG9yZGVyZWQsIGNhbGxiYWNrcywgbm9uTXV0YXRpbmdDYWxsYmFja3MpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgY29uc3QgY29sbGVjdGlvbk5hbWUgPSBjdXJzb3JEZXNjcmlwdGlvbi5jb2xsZWN0aW9uTmFtZTtcblxuICAgIGlmIChjdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zLnRhaWxhYmxlKSB7XG4gICAgICByZXR1cm4gc2VsZi5fb2JzZXJ2ZUNoYW5nZXNUYWlsYWJsZShjdXJzb3JEZXNjcmlwdGlvbiwgb3JkZXJlZCwgY2FsbGJhY2tzKTtcbiAgICB9XG5cbiAgICAvLyBZb3UgbWF5IG5vdCBmaWx0ZXIgb3V0IF9pZCB3aGVuIG9ic2VydmluZyBjaGFuZ2VzLCBiZWNhdXNlIHRoZSBpZCBpcyBhIGNvcmVcbiAgICAvLyBwYXJ0IG9mIHRoZSBvYnNlcnZlQ2hhbmdlcyBBUEkuXG4gICAgY29uc3QgZmllbGRzT3B0aW9ucyA9IGN1cnNvckRlc2NyaXB0aW9uLm9wdGlvbnMucHJvamVjdGlvbiB8fCBjdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zLmZpZWxkcztcbiAgICBpZiAoZmllbGRzT3B0aW9ucyAmJlxuICAgICAgKGZpZWxkc09wdGlvbnMuX2lkID09PSAwIHx8XG4gICAgICAgIGZpZWxkc09wdGlvbnMuX2lkID09PSBmYWxzZSkpIHtcbiAgICAgIHRocm93IEVycm9yKFwiWW91IG1heSBub3Qgb2JzZXJ2ZSBhIGN1cnNvciB3aXRoIHtmaWVsZHM6IHtfaWQ6IDB9fVwiKTtcbiAgICB9XG5cbiAgICB2YXIgb2JzZXJ2ZUtleSA9IEVKU09OLnN0cmluZ2lmeShcbiAgICAgIE9iamVjdC5hc3NpZ24oe29yZGVyZWQ6IG9yZGVyZWR9LCBjdXJzb3JEZXNjcmlwdGlvbikpO1xuXG4gICAgdmFyIG11bHRpcGxleGVyLCBvYnNlcnZlRHJpdmVyO1xuICAgIHZhciBmaXJzdEhhbmRsZSA9IGZhbHNlO1xuXG4gICAgLy8gRmluZCBhIG1hdGNoaW5nIE9ic2VydmVNdWx0aXBsZXhlciwgb3IgY3JlYXRlIGEgbmV3IG9uZS4gVGhpcyBuZXh0IGJsb2NrIGlzXG4gICAgLy8gZ3VhcmFudGVlZCB0byBub3QgeWllbGQgKGFuZCBpdCBkb2Vzbid0IGNhbGwgYW55dGhpbmcgdGhhdCBjYW4gb2JzZXJ2ZSBhXG4gICAgLy8gbmV3IHF1ZXJ5KSwgc28gbm8gb3RoZXIgY2FsbHMgdG8gdGhpcyBmdW5jdGlvbiBjYW4gaW50ZXJsZWF2ZSB3aXRoIGl0LlxuICAgIGlmIChvYnNlcnZlS2V5IGluIHNlbGYuX29ic2VydmVNdWx0aXBsZXhlcnMpIHtcbiAgICAgIG11bHRpcGxleGVyID0gc2VsZi5fb2JzZXJ2ZU11bHRpcGxleGVyc1tvYnNlcnZlS2V5XTtcbiAgICB9IGVsc2Uge1xuICAgICAgZmlyc3RIYW5kbGUgPSB0cnVlO1xuICAgICAgLy8gQ3JlYXRlIGEgbmV3IE9ic2VydmVNdWx0aXBsZXhlci5cbiAgICAgIG11bHRpcGxleGVyID0gbmV3IE9ic2VydmVNdWx0aXBsZXhlcih7XG4gICAgICAgIG9yZGVyZWQ6IG9yZGVyZWQsXG4gICAgICAgIG9uU3RvcDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGRlbGV0ZSBzZWxmLl9vYnNlcnZlTXVsdGlwbGV4ZXJzW29ic2VydmVLZXldO1xuICAgICAgICAgIHJldHVybiBvYnNlcnZlRHJpdmVyLnN0b3AoKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdmFyIG9ic2VydmVIYW5kbGUgPSBuZXcgT2JzZXJ2ZUhhbmRsZShtdWx0aXBsZXhlcixcbiAgICAgIGNhbGxiYWNrcyxcbiAgICAgIG5vbk11dGF0aW5nQ2FsbGJhY2tzLFxuICAgICk7XG5cbiAgICBjb25zdCBvcGxvZ09wdGlvbnMgPSBzZWxmPy5fb3Bsb2dIYW5kbGU/Ll9vcGxvZ09wdGlvbnMgfHwge307XG4gICAgY29uc3QgeyBpbmNsdWRlQ29sbGVjdGlvbnMsIGV4Y2x1ZGVDb2xsZWN0aW9ucyB9ID0gb3Bsb2dPcHRpb25zO1xuICAgIGlmIChmaXJzdEhhbmRsZSkge1xuICAgICAgdmFyIG1hdGNoZXIsIHNvcnRlcjtcbiAgICAgIHZhciBjYW5Vc2VPcGxvZyA9IFtcbiAgICAgICAgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIC8vIEF0IGEgYmFyZSBtaW5pbXVtLCB1c2luZyB0aGUgb3Bsb2cgcmVxdWlyZXMgdXMgdG8gaGF2ZSBhbiBvcGxvZywgdG9cbiAgICAgICAgICAvLyB3YW50IHVub3JkZXJlZCBjYWxsYmFja3MsIGFuZCB0byBub3Qgd2FudCBhIGNhbGxiYWNrIG9uIHRoZSBwb2xsc1xuICAgICAgICAgIC8vIHRoYXQgd29uJ3QgaGFwcGVuLlxuICAgICAgICAgIHJldHVybiBzZWxmLl9vcGxvZ0hhbmRsZSAmJiAhb3JkZXJlZCAmJlxuICAgICAgICAgICAgIWNhbGxiYWNrcy5fdGVzdE9ubHlQb2xsQ2FsbGJhY2s7XG4gICAgICAgIH0sXG4gICAgICAgIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAvLyBXZSBhbHNvIG5lZWQgdG8gY2hlY2ssIGlmIHRoZSBjb2xsZWN0aW9uIG9mIHRoaXMgQ3Vyc29yIGlzIGFjdHVhbGx5IGJlaW5nIFwid2F0Y2hlZFwiIGJ5IHRoZSBPcGxvZyBoYW5kbGVcbiAgICAgICAgICAvLyBpZiBub3QsIHdlIGhhdmUgdG8gZmFsbGJhY2sgdG8gbG9uZyBwb2xsaW5nXG4gICAgICAgICAgaWYgKGV4Y2x1ZGVDb2xsZWN0aW9ucz8ubGVuZ3RoICYmIGV4Y2x1ZGVDb2xsZWN0aW9ucy5pbmNsdWRlcyhjb2xsZWN0aW9uTmFtZSkpIHtcbiAgICAgICAgICAgIGlmICghb3Bsb2dDb2xsZWN0aW9uV2FybmluZ3MuaW5jbHVkZXMoY29sbGVjdGlvbk5hbWUpKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUud2FybihgTWV0ZW9yLnNldHRpbmdzLnBhY2thZ2VzLm1vbmdvLm9wbG9nRXhjbHVkZUNvbGxlY3Rpb25zIGluY2x1ZGVzIHRoZSBjb2xsZWN0aW9uICR7Y29sbGVjdGlvbk5hbWV9IC0geW91ciBzdWJzY3JpcHRpb25zIHdpbGwgb25seSB1c2UgbG9uZyBwb2xsaW5nIWApO1xuICAgICAgICAgICAgICBvcGxvZ0NvbGxlY3Rpb25XYXJuaW5ncy5wdXNoKGNvbGxlY3Rpb25OYW1lKTsgLy8gd2Ugb25seSB3YW50IHRvIHNob3cgdGhlIHdhcm5pbmdzIG9uY2UgcGVyIGNvbGxlY3Rpb24hXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChpbmNsdWRlQ29sbGVjdGlvbnM/Lmxlbmd0aCAmJiAhaW5jbHVkZUNvbGxlY3Rpb25zLmluY2x1ZGVzKGNvbGxlY3Rpb25OYW1lKSkge1xuICAgICAgICAgICAgaWYgKCFvcGxvZ0NvbGxlY3Rpb25XYXJuaW5ncy5pbmNsdWRlcyhjb2xsZWN0aW9uTmFtZSkpIHtcbiAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBNZXRlb3Iuc2V0dGluZ3MucGFja2FnZXMubW9uZ28ub3Bsb2dJbmNsdWRlQ29sbGVjdGlvbnMgZG9lcyBub3QgaW5jbHVkZSB0aGUgY29sbGVjdGlvbiAke2NvbGxlY3Rpb25OYW1lfSAtIHlvdXIgc3Vic2NyaXB0aW9ucyB3aWxsIG9ubHkgdXNlIGxvbmcgcG9sbGluZyFgKTtcbiAgICAgICAgICAgICAgb3Bsb2dDb2xsZWN0aW9uV2FybmluZ3MucHVzaChjb2xsZWN0aW9uTmFtZSk7IC8vIHdlIG9ubHkgd2FudCB0byBzaG93IHRoZSB3YXJuaW5ncyBvbmNlIHBlciBjb2xsZWN0aW9uIVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSxcbiAgICAgICAgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIC8vIFdlIG5lZWQgdG8gYmUgYWJsZSB0byBjb21waWxlIHRoZSBzZWxlY3Rvci4gRmFsbCBiYWNrIHRvIHBvbGxpbmcgZm9yXG4gICAgICAgICAgLy8gc29tZSBuZXdmYW5nbGVkICRzZWxlY3RvciB0aGF0IG1pbmltb25nbyBkb2Vzbid0IHN1cHBvcnQgeWV0LlxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBtYXRjaGVyID0gbmV3IE1pbmltb25nby5NYXRjaGVyKGN1cnNvckRlc2NyaXB0aW9uLnNlbGVjdG9yKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIC8vIFhYWCBtYWtlIGFsbCBjb21waWxhdGlvbiBlcnJvcnMgTWluaW1vbmdvRXJyb3Igb3Igc29tZXRoaW5nXG4gICAgICAgICAgICAvLyAgICAgc28gdGhhdCB0aGlzIGRvZXNuJ3QgaWdub3JlIHVucmVsYXRlZCBleGNlcHRpb25zXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgLy8gLi4uIGFuZCB0aGUgc2VsZWN0b3IgaXRzZWxmIG5lZWRzIHRvIHN1cHBvcnQgb3Bsb2cuXG4gICAgICAgICAgcmV0dXJuIE9wbG9nT2JzZXJ2ZURyaXZlci5jdXJzb3JTdXBwb3J0ZWQoY3Vyc29yRGVzY3JpcHRpb24sIG1hdGNoZXIpO1xuICAgICAgICB9LFxuICAgICAgICBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgLy8gQW5kIHdlIG5lZWQgdG8gYmUgYWJsZSB0byBjb21waWxlIHRoZSBzb3J0LCBpZiBhbnkuICBlZywgY2FuJ3QgYmVcbiAgICAgICAgICAvLyB7JG5hdHVyYWw6IDF9LlxuICAgICAgICAgIGlmICghY3Vyc29yRGVzY3JpcHRpb24ub3B0aW9ucy5zb3J0KVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHNvcnRlciA9IG5ldyBNaW5pbW9uZ28uU29ydGVyKGN1cnNvckRlc2NyaXB0aW9uLm9wdGlvbnMuc29ydCk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAvLyBYWFggbWFrZSBhbGwgY29tcGlsYXRpb24gZXJyb3JzIE1pbmltb25nb0Vycm9yIG9yIHNvbWV0aGluZ1xuICAgICAgICAgICAgLy8gICAgIHNvIHRoYXQgdGhpcyBkb2Vzbid0IGlnbm9yZSB1bnJlbGF0ZWQgZXhjZXB0aW9uc1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgXS5ldmVyeShmID0+IGYoKSk7ICAvLyBpbnZva2UgZWFjaCBmdW5jdGlvbiBhbmQgY2hlY2sgaWYgYWxsIHJldHVybiB0cnVlXG5cbiAgICAgIHZhciBkcml2ZXJDbGFzcyA9IGNhblVzZU9wbG9nID8gT3Bsb2dPYnNlcnZlRHJpdmVyIDogUG9sbGluZ09ic2VydmVEcml2ZXI7XG4gICAgICBvYnNlcnZlRHJpdmVyID0gbmV3IGRyaXZlckNsYXNzKHtcbiAgICAgICAgY3Vyc29yRGVzY3JpcHRpb246IGN1cnNvckRlc2NyaXB0aW9uLFxuICAgICAgICBtb25nb0hhbmRsZTogc2VsZixcbiAgICAgICAgbXVsdGlwbGV4ZXI6IG11bHRpcGxleGVyLFxuICAgICAgICBvcmRlcmVkOiBvcmRlcmVkLFxuICAgICAgICBtYXRjaGVyOiBtYXRjaGVyLCAgLy8gaWdub3JlZCBieSBwb2xsaW5nXG4gICAgICAgIHNvcnRlcjogc29ydGVyLCAgLy8gaWdub3JlZCBieSBwb2xsaW5nXG4gICAgICAgIF90ZXN0T25seVBvbGxDYWxsYmFjazogY2FsbGJhY2tzLl90ZXN0T25seVBvbGxDYWxsYmFja1xuICAgICAgfSk7XG5cbiAgICAgIGlmIChvYnNlcnZlRHJpdmVyLl9pbml0KSB7XG4gICAgICAgIGF3YWl0IG9ic2VydmVEcml2ZXIuX2luaXQoKTtcbiAgICAgIH1cblxuICAgICAgLy8gVGhpcyBmaWVsZCBpcyBvbmx5IHNldCBmb3IgdXNlIGluIHRlc3RzLlxuICAgICAgbXVsdGlwbGV4ZXIuX29ic2VydmVEcml2ZXIgPSBvYnNlcnZlRHJpdmVyO1xuICAgIH1cbiAgICBzZWxmLl9vYnNlcnZlTXVsdGlwbGV4ZXJzW29ic2VydmVLZXldID0gbXVsdGlwbGV4ZXI7XG4gICAgLy8gQmxvY2tzIHVudGlsIHRoZSBpbml0aWFsIGFkZHMgaGF2ZSBiZWVuIHNlbnQuXG4gICAgYXdhaXQgbXVsdGlwbGV4ZXIuYWRkSGFuZGxlQW5kU2VuZEluaXRpYWxBZGRzKG9ic2VydmVIYW5kbGUpO1xuXG4gICAgcmV0dXJuIG9ic2VydmVIYW5kbGU7XG4gIH0sXG5cbn0pO1xuIiwiaW1wb3J0IGNsb25lIGZyb20gJ2xvZGFzaC5jbG9uZSdcblxuLyoqIEB0eXBlIHtpbXBvcnQoJ21vbmdvZGInKX0gKi9cbmV4cG9ydCBjb25zdCBNb25nb0RCID0gT2JqZWN0LmFzc2lnbihOcG1Nb2R1bGVNb25nb2RiLCB7XG4gIE9iamVjdElEOiBOcG1Nb2R1bGVNb25nb2RiLk9iamVjdElkLFxufSk7XG5cbi8vIFRoZSB3cml0ZSBtZXRob2RzIGJsb2NrIHVudGlsIHRoZSBkYXRhYmFzZSBoYXMgY29uZmlybWVkIHRoZSB3cml0ZSAoaXQgbWF5XG4vLyBub3QgYmUgcmVwbGljYXRlZCBvciBzdGFibGUgb24gZGlzaywgYnV0IG9uZSBzZXJ2ZXIgaGFzIGNvbmZpcm1lZCBpdCkgaWYgbm9cbi8vIGNhbGxiYWNrIGlzIHByb3ZpZGVkLiBJZiBhIGNhbGxiYWNrIGlzIHByb3ZpZGVkLCB0aGVuIHRoZXkgY2FsbCB0aGUgY2FsbGJhY2tcbi8vIHdoZW4gdGhlIHdyaXRlIGlzIGNvbmZpcm1lZC4gVGhleSByZXR1cm4gbm90aGluZyBvbiBzdWNjZXNzLCBhbmQgcmFpc2UgYW5cbi8vIGV4Y2VwdGlvbiBvbiBmYWlsdXJlLlxuLy9cbi8vIEFmdGVyIG1ha2luZyBhIHdyaXRlICh3aXRoIGluc2VydCwgdXBkYXRlLCByZW1vdmUpLCBvYnNlcnZlcnMgYXJlXG4vLyBub3RpZmllZCBhc3luY2hyb25vdXNseS4gSWYgeW91IHdhbnQgdG8gcmVjZWl2ZSBhIGNhbGxiYWNrIG9uY2UgYWxsXG4vLyBvZiB0aGUgb2JzZXJ2ZXIgbm90aWZpY2F0aW9ucyBoYXZlIGxhbmRlZCBmb3IgeW91ciB3cml0ZSwgZG8gdGhlXG4vLyB3cml0ZXMgaW5zaWRlIGEgd3JpdGUgZmVuY2UgKHNldCBERFBTZXJ2ZXIuX0N1cnJlbnRXcml0ZUZlbmNlIHRvIGEgbmV3XG4vLyBfV3JpdGVGZW5jZSwgYW5kIHRoZW4gc2V0IGEgY2FsbGJhY2sgb24gdGhlIHdyaXRlIGZlbmNlLilcbi8vXG4vLyBTaW5jZSBvdXIgZXhlY3V0aW9uIGVudmlyb25tZW50IGlzIHNpbmdsZS10aHJlYWRlZCwgdGhpcyBpc1xuLy8gd2VsbC1kZWZpbmVkIC0tIGEgd3JpdGUgXCJoYXMgYmVlbiBtYWRlXCIgaWYgaXQncyByZXR1cm5lZCwgYW5kIGFuXG4vLyBvYnNlcnZlciBcImhhcyBiZWVuIG5vdGlmaWVkXCIgaWYgaXRzIGNhbGxiYWNrIGhhcyByZXR1cm5lZC5cblxuZXhwb3J0IGNvbnN0IHdyaXRlQ2FsbGJhY2sgPSBmdW5jdGlvbiAod3JpdGUsIHJlZnJlc2gsIGNhbGxiYWNrKSB7XG4gIHJldHVybiBmdW5jdGlvbiAoZXJyLCByZXN1bHQpIHtcbiAgICBpZiAoISBlcnIpIHtcbiAgICAgIC8vIFhYWCBXZSBkb24ndCBoYXZlIHRvIHJ1biB0aGlzIG9uIGVycm9yLCByaWdodD9cbiAgICAgIHRyeSB7XG4gICAgICAgIHJlZnJlc2goKTtcbiAgICAgIH0gY2F0Y2ggKHJlZnJlc2hFcnIpIHtcbiAgICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgICAgY2FsbGJhY2socmVmcmVzaEVycik7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IHJlZnJlc2hFcnI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgd3JpdGUuY29tbWl0dGVkKCk7XG4gICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICBjYWxsYmFjayhlcnIsIHJlc3VsdCk7XG4gICAgfSBlbHNlIGlmIChlcnIpIHtcbiAgICAgIHRocm93IGVycjtcbiAgICB9XG4gIH07XG59O1xuXG5cbmV4cG9ydCBjb25zdCB0cmFuc2Zvcm1SZXN1bHQgPSBmdW5jdGlvbiAoZHJpdmVyUmVzdWx0KSB7XG4gIHZhciBtZXRlb3JSZXN1bHQgPSB7IG51bWJlckFmZmVjdGVkOiAwIH07XG4gIGlmIChkcml2ZXJSZXN1bHQpIHtcbiAgICB2YXIgbW9uZ29SZXN1bHQgPSBkcml2ZXJSZXN1bHQucmVzdWx0O1xuICAgIC8vIE9uIHVwZGF0ZXMgd2l0aCB1cHNlcnQ6dHJ1ZSwgdGhlIGluc2VydGVkIHZhbHVlcyBjb21lIGFzIGEgbGlzdCBvZlxuICAgIC8vIHVwc2VydGVkIHZhbHVlcyAtLSBldmVuIHdpdGggb3B0aW9ucy5tdWx0aSwgd2hlbiB0aGUgdXBzZXJ0IGRvZXMgaW5zZXJ0LFxuICAgIC8vIGl0IG9ubHkgaW5zZXJ0cyBvbmUgZWxlbWVudC5cbiAgICBpZiAobW9uZ29SZXN1bHQudXBzZXJ0ZWRDb3VudCkge1xuICAgICAgbWV0ZW9yUmVzdWx0Lm51bWJlckFmZmVjdGVkID0gbW9uZ29SZXN1bHQudXBzZXJ0ZWRDb3VudDtcblxuICAgICAgaWYgKG1vbmdvUmVzdWx0LnVwc2VydGVkSWQpIHtcbiAgICAgICAgbWV0ZW9yUmVzdWx0Lmluc2VydGVkSWQgPSBtb25nb1Jlc3VsdC51cHNlcnRlZElkO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBuIHdhcyB1c2VkIGJlZm9yZSBNb25nbyA1LjAsIGluIE1vbmdvIDUuMCB3ZSBhcmUgbm90IHJlY2VpdmluZyB0aGlzIG5cbiAgICAgIC8vIGZpZWxkIGFuZCBzbyB3ZSBhcmUgdXNpbmcgbW9kaWZpZWRDb3VudCBpbnN0ZWFkXG4gICAgICBtZXRlb3JSZXN1bHQubnVtYmVyQWZmZWN0ZWQgPSBtb25nb1Jlc3VsdC5uIHx8IG1vbmdvUmVzdWx0Lm1hdGNoZWRDb3VudCB8fCBtb25nb1Jlc3VsdC5tb2RpZmllZENvdW50O1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBtZXRlb3JSZXN1bHQ7XG59O1xuXG5leHBvcnQgY29uc3QgcmVwbGFjZU1ldGVvckF0b21XaXRoTW9uZ28gPSBmdW5jdGlvbiAoZG9jdW1lbnQpIHtcbiAgaWYgKEVKU09OLmlzQmluYXJ5KGRvY3VtZW50KSkge1xuICAgIC8vIFRoaXMgZG9lcyBtb3JlIGNvcGllcyB0aGFuIHdlJ2QgbGlrZSwgYnV0IGlzIG5lY2Vzc2FyeSBiZWNhdXNlXG4gICAgLy8gTW9uZ29EQi5CU09OIG9ubHkgbG9va3MgbGlrZSBpdCB0YWtlcyBhIFVpbnQ4QXJyYXkgKGFuZCBkb2Vzbid0IGFjdHVhbGx5XG4gICAgLy8gc2VyaWFsaXplIGl0IGNvcnJlY3RseSkuXG4gICAgcmV0dXJuIG5ldyBNb25nb0RCLkJpbmFyeShCdWZmZXIuZnJvbShkb2N1bWVudCkpO1xuICB9XG4gIGlmIChkb2N1bWVudCBpbnN0YW5jZW9mIE1vbmdvREIuQmluYXJ5KSB7XG4gICAgcmV0dXJuIGRvY3VtZW50O1xuICB9XG4gIGlmIChkb2N1bWVudCBpbnN0YW5jZW9mIE1vbmdvLk9iamVjdElEKSB7XG4gICAgcmV0dXJuIG5ldyBNb25nb0RCLk9iamVjdElkKGRvY3VtZW50LnRvSGV4U3RyaW5nKCkpO1xuICB9XG4gIGlmIChkb2N1bWVudCBpbnN0YW5jZW9mIE1vbmdvREIuT2JqZWN0SWQpIHtcbiAgICByZXR1cm4gbmV3IE1vbmdvREIuT2JqZWN0SWQoZG9jdW1lbnQudG9IZXhTdHJpbmcoKSk7XG4gIH1cbiAgaWYgKGRvY3VtZW50IGluc3RhbmNlb2YgTW9uZ29EQi5UaW1lc3RhbXApIHtcbiAgICAvLyBGb3Igbm93LCB0aGUgTWV0ZW9yIHJlcHJlc2VudGF0aW9uIG9mIGEgTW9uZ28gdGltZXN0YW1wIHR5cGUgKG5vdCBhIGRhdGUhXG4gICAgLy8gdGhpcyBpcyBhIHdlaXJkIGludGVybmFsIHRoaW5nIHVzZWQgaW4gdGhlIG9wbG9nISkgaXMgdGhlIHNhbWUgYXMgdGhlXG4gICAgLy8gTW9uZ28gcmVwcmVzZW50YXRpb24uIFdlIG5lZWQgdG8gZG8gdGhpcyBleHBsaWNpdGx5IG9yIGVsc2Ugd2Ugd291bGQgZG8gYVxuICAgIC8vIHN0cnVjdHVyYWwgY2xvbmUgYW5kIGxvc2UgdGhlIHByb3RvdHlwZS5cbiAgICByZXR1cm4gZG9jdW1lbnQ7XG4gIH1cbiAgaWYgKGRvY3VtZW50IGluc3RhbmNlb2YgRGVjaW1hbCkge1xuICAgIHJldHVybiBNb25nb0RCLkRlY2ltYWwxMjguZnJvbVN0cmluZyhkb2N1bWVudC50b1N0cmluZygpKTtcbiAgfVxuICBpZiAoRUpTT04uX2lzQ3VzdG9tVHlwZShkb2N1bWVudCkpIHtcbiAgICByZXR1cm4gcmVwbGFjZU5hbWVzKG1ha2VNb25nb0xlZ2FsLCBFSlNPTi50b0pTT05WYWx1ZShkb2N1bWVudCkpO1xuICB9XG4gIC8vIEl0IGlzIG5vdCBvcmRpbmFyaWx5IHBvc3NpYmxlIHRvIHN0aWNrIGRvbGxhci1zaWduIGtleXMgaW50byBtb25nb1xuICAvLyBzbyB3ZSBkb24ndCBib3RoZXIgY2hlY2tpbmcgZm9yIHRoaW5ncyB0aGF0IG5lZWQgZXNjYXBpbmcgYXQgdGhpcyB0aW1lLlxuICByZXR1cm4gdW5kZWZpbmVkO1xufTtcblxuZXhwb3J0IGNvbnN0IHJlcGxhY2VUeXBlcyA9IGZ1bmN0aW9uIChkb2N1bWVudCwgYXRvbVRyYW5zZm9ybWVyKSB7XG4gIGlmICh0eXBlb2YgZG9jdW1lbnQgIT09ICdvYmplY3QnIHx8IGRvY3VtZW50ID09PSBudWxsKVxuICAgIHJldHVybiBkb2N1bWVudDtcblxuICB2YXIgcmVwbGFjZWRUb3BMZXZlbEF0b20gPSBhdG9tVHJhbnNmb3JtZXIoZG9jdW1lbnQpO1xuICBpZiAocmVwbGFjZWRUb3BMZXZlbEF0b20gIT09IHVuZGVmaW5lZClcbiAgICByZXR1cm4gcmVwbGFjZWRUb3BMZXZlbEF0b207XG5cbiAgdmFyIHJldCA9IGRvY3VtZW50O1xuICBPYmplY3QuZW50cmllcyhkb2N1bWVudCkuZm9yRWFjaChmdW5jdGlvbiAoW2tleSwgdmFsXSkge1xuICAgIHZhciB2YWxSZXBsYWNlZCA9IHJlcGxhY2VUeXBlcyh2YWwsIGF0b21UcmFuc2Zvcm1lcik7XG4gICAgaWYgKHZhbCAhPT0gdmFsUmVwbGFjZWQpIHtcbiAgICAgIC8vIExhenkgY2xvbmUuIFNoYWxsb3cgY29weS5cbiAgICAgIGlmIChyZXQgPT09IGRvY3VtZW50KVxuICAgICAgICByZXQgPSBjbG9uZShkb2N1bWVudCk7XG4gICAgICByZXRba2V5XSA9IHZhbFJlcGxhY2VkO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiByZXQ7XG59O1xuXG5leHBvcnQgY29uc3QgcmVwbGFjZU1vbmdvQXRvbVdpdGhNZXRlb3IgPSBmdW5jdGlvbiAoZG9jdW1lbnQpIHtcbiAgaWYgKGRvY3VtZW50IGluc3RhbmNlb2YgTW9uZ29EQi5CaW5hcnkpIHtcbiAgICAvLyBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHlcbiAgICBpZiAoZG9jdW1lbnQuc3ViX3R5cGUgIT09IDApIHtcbiAgICAgIHJldHVybiBkb2N1bWVudDtcbiAgICB9XG4gICAgdmFyIGJ1ZmZlciA9IGRvY3VtZW50LnZhbHVlKHRydWUpO1xuICAgIHJldHVybiBuZXcgVWludDhBcnJheShidWZmZXIpO1xuICB9XG4gIGlmIChkb2N1bWVudCBpbnN0YW5jZW9mIE1vbmdvREIuT2JqZWN0SWQpIHtcbiAgICByZXR1cm4gbmV3IE1vbmdvLk9iamVjdElEKGRvY3VtZW50LnRvSGV4U3RyaW5nKCkpO1xuICB9XG4gIGlmIChkb2N1bWVudCBpbnN0YW5jZW9mIE1vbmdvREIuRGVjaW1hbDEyOCkge1xuICAgIHJldHVybiBEZWNpbWFsKGRvY3VtZW50LnRvU3RyaW5nKCkpO1xuICB9XG4gIGlmIChkb2N1bWVudFtcIkVKU09OJHR5cGVcIl0gJiYgZG9jdW1lbnRbXCJFSlNPTiR2YWx1ZVwiXSAmJiBPYmplY3Qua2V5cyhkb2N1bWVudCkubGVuZ3RoID09PSAyKSB7XG4gICAgcmV0dXJuIEVKU09OLmZyb21KU09OVmFsdWUocmVwbGFjZU5hbWVzKHVubWFrZU1vbmdvTGVnYWwsIGRvY3VtZW50KSk7XG4gIH1cbiAgaWYgKGRvY3VtZW50IGluc3RhbmNlb2YgTW9uZ29EQi5UaW1lc3RhbXApIHtcbiAgICAvLyBGb3Igbm93LCB0aGUgTWV0ZW9yIHJlcHJlc2VudGF0aW9uIG9mIGEgTW9uZ28gdGltZXN0YW1wIHR5cGUgKG5vdCBhIGRhdGUhXG4gICAgLy8gdGhpcyBpcyBhIHdlaXJkIGludGVybmFsIHRoaW5nIHVzZWQgaW4gdGhlIG9wbG9nISkgaXMgdGhlIHNhbWUgYXMgdGhlXG4gICAgLy8gTW9uZ28gcmVwcmVzZW50YXRpb24uIFdlIG5lZWQgdG8gZG8gdGhpcyBleHBsaWNpdGx5IG9yIGVsc2Ugd2Ugd291bGQgZG8gYVxuICAgIC8vIHN0cnVjdHVyYWwgY2xvbmUgYW5kIGxvc2UgdGhlIHByb3RvdHlwZS5cbiAgICByZXR1cm4gZG9jdW1lbnQ7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn07XG5cbmNvbnN0IG1ha2VNb25nb0xlZ2FsID0gbmFtZSA9PiBcIkVKU09OXCIgKyBuYW1lO1xuY29uc3QgdW5tYWtlTW9uZ29MZWdhbCA9IG5hbWUgPT4gbmFtZS5zdWJzdHIoNSk7XG5cbmV4cG9ydCBmdW5jdGlvbiByZXBsYWNlTmFtZXMoZmlsdGVyLCB0aGluZykge1xuICBpZiAodHlwZW9mIHRoaW5nID09PSBcIm9iamVjdFwiICYmIHRoaW5nICE9PSBudWxsKSB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkodGhpbmcpKSB7XG4gICAgICByZXR1cm4gdGhpbmcubWFwKHJlcGxhY2VOYW1lcy5iaW5kKG51bGwsIGZpbHRlcikpO1xuICAgIH1cbiAgICB2YXIgcmV0ID0ge307XG4gICAgT2JqZWN0LmVudHJpZXModGhpbmcpLmZvckVhY2goZnVuY3Rpb24gKFtrZXksIHZhbHVlXSkge1xuICAgICAgcmV0W2ZpbHRlcihrZXkpXSA9IHJlcGxhY2VOYW1lcyhmaWx0ZXIsIHZhbHVlKTtcbiAgICB9KTtcbiAgICByZXR1cm4gcmV0O1xuICB9XG4gIHJldHVybiB0aGluZztcbn1cbiIsImltcG9ydCBMb2NhbENvbGxlY3Rpb24gZnJvbSAnbWV0ZW9yL21pbmltb25nby9sb2NhbF9jb2xsZWN0aW9uJztcbmltcG9ydCB7IHJlcGxhY2VNb25nb0F0b21XaXRoTWV0ZW9yLCByZXBsYWNlVHlwZXMgfSBmcm9tICcuL21vbmdvX2NvbW1vbic7XG5cbi8qKlxuICogVGhpcyBpcyBqdXN0IGEgbGlnaHQgd3JhcHBlciBmb3IgdGhlIGN1cnNvci4gVGhlIGdvYWwgaGVyZSBpcyB0byBlbnN1cmUgY29tcGF0aWJpbGl0eSBldmVuIGlmXG4gKiB0aGVyZSBhcmUgYnJlYWtpbmcgY2hhbmdlcyBvbiB0aGUgTW9uZ29EQiBkcml2ZXIuXG4gKlxuICogVGhpcyBpcyBhbiBpbnRlcm5hbCBpbXBsZW1lbnRhdGlvbiBkZXRhaWwgYW5kIGlzIGNyZWF0ZWQgbGF6aWx5IGJ5IHRoZSBtYWluIEN1cnNvciBjbGFzcy5cbiAqL1xuZXhwb3J0IGNsYXNzIEFzeW5jaHJvbm91c0N1cnNvciB7XG4gIGNvbnN0cnVjdG9yKGRiQ3Vyc29yLCBjdXJzb3JEZXNjcmlwdGlvbiwgb3B0aW9ucykge1xuICAgIHRoaXMuX2RiQ3Vyc29yID0gZGJDdXJzb3I7XG4gICAgdGhpcy5fY3Vyc29yRGVzY3JpcHRpb24gPSBjdXJzb3JEZXNjcmlwdGlvbjtcblxuICAgIHRoaXMuX3NlbGZGb3JJdGVyYXRpb24gPSBvcHRpb25zLnNlbGZGb3JJdGVyYXRpb24gfHwgdGhpcztcbiAgICBpZiAob3B0aW9ucy51c2VUcmFuc2Zvcm0gJiYgY3Vyc29yRGVzY3JpcHRpb24ub3B0aW9ucy50cmFuc2Zvcm0pIHtcbiAgICAgIHRoaXMuX3RyYW5zZm9ybSA9IExvY2FsQ29sbGVjdGlvbi53cmFwVHJhbnNmb3JtKFxuICAgICAgICBjdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zLnRyYW5zZm9ybSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX3RyYW5zZm9ybSA9IG51bGw7XG4gICAgfVxuXG4gICAgdGhpcy5fdmlzaXRlZElkcyA9IG5ldyBMb2NhbENvbGxlY3Rpb24uX0lkTWFwO1xuICB9XG5cbiAgW1N5bWJvbC5hc3luY0l0ZXJhdG9yXSgpIHtcbiAgICB2YXIgY3Vyc29yID0gdGhpcztcbiAgICByZXR1cm4ge1xuICAgICAgYXN5bmMgbmV4dCgpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBhd2FpdCBjdXJzb3IuX25leHRPYmplY3RQcm9taXNlKCk7XG4gICAgICAgIHJldHVybiB7IGRvbmU6ICF2YWx1ZSwgdmFsdWUgfTtcbiAgICAgIH0sXG4gICAgfTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBQcm9taXNlIGZvciB0aGUgbmV4dCBvYmplY3QgZnJvbSB0aGUgdW5kZXJseWluZyBjdXJzb3IgKGJlZm9yZVxuICAvLyB0aGUgTW9uZ28tPk1ldGVvciB0eXBlIHJlcGxhY2VtZW50KS5cbiAgYXN5bmMgX3Jhd05leHRPYmplY3RQcm9taXNlKCkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gdGhpcy5fZGJDdXJzb3IubmV4dCgpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgfVxuICB9XG5cbiAgLy8gUmV0dXJucyBhIFByb21pc2UgZm9yIHRoZSBuZXh0IG9iamVjdCBmcm9tIHRoZSBjdXJzb3IsIHNraXBwaW5nIHRob3NlIHdob3NlXG4gIC8vIElEcyB3ZSd2ZSBhbHJlYWR5IHNlZW4gYW5kIHJlcGxhY2luZyBNb25nbyBhdG9tcyB3aXRoIE1ldGVvciBhdG9tcy5cbiAgYXN5bmMgX25leHRPYmplY3RQcm9taXNlICgpIHtcbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgdmFyIGRvYyA9IGF3YWl0IHRoaXMuX3Jhd05leHRPYmplY3RQcm9taXNlKCk7XG5cbiAgICAgIGlmICghZG9jKSByZXR1cm4gbnVsbDtcbiAgICAgIGRvYyA9IHJlcGxhY2VUeXBlcyhkb2MsIHJlcGxhY2VNb25nb0F0b21XaXRoTWV0ZW9yKTtcblxuICAgICAgaWYgKCF0aGlzLl9jdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zLnRhaWxhYmxlICYmICdfaWQnIGluIGRvYykge1xuICAgICAgICAvLyBEaWQgTW9uZ28gZ2l2ZSB1cyBkdXBsaWNhdGUgZG9jdW1lbnRzIGluIHRoZSBzYW1lIGN1cnNvcj8gSWYgc28sXG4gICAgICAgIC8vIGlnbm9yZSB0aGlzIG9uZS4gKERvIHRoaXMgYmVmb3JlIHRoZSB0cmFuc2Zvcm0sIHNpbmNlIHRyYW5zZm9ybSBtaWdodFxuICAgICAgICAvLyByZXR1cm4gc29tZSB1bnJlbGF0ZWQgdmFsdWUuKSBXZSBkb24ndCBkbyB0aGlzIGZvciB0YWlsYWJsZSBjdXJzb3JzLFxuICAgICAgICAvLyBiZWNhdXNlIHdlIHdhbnQgdG8gbWFpbnRhaW4gTygxKSBtZW1vcnkgdXNhZ2UuIEFuZCBpZiB0aGVyZSBpc24ndCBfaWRcbiAgICAgICAgLy8gZm9yIHNvbWUgcmVhc29uIChtYXliZSBpdCdzIHRoZSBvcGxvZyksIHRoZW4gd2UgZG9uJ3QgZG8gdGhpcyBlaXRoZXIuXG4gICAgICAgIC8vIChCZSBjYXJlZnVsIHRvIGRvIHRoaXMgZm9yIGZhbHNleSBidXQgZXhpc3RpbmcgX2lkLCB0aG91Z2guKVxuICAgICAgICBpZiAodGhpcy5fdmlzaXRlZElkcy5oYXMoZG9jLl9pZCkpIGNvbnRpbnVlO1xuICAgICAgICB0aGlzLl92aXNpdGVkSWRzLnNldChkb2MuX2lkLCB0cnVlKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuX3RyYW5zZm9ybSlcbiAgICAgICAgZG9jID0gdGhpcy5fdHJhbnNmb3JtKGRvYyk7XG5cbiAgICAgIHJldHVybiBkb2M7XG4gICAgfVxuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2Ugd2hpY2ggaXMgcmVzb2x2ZWQgd2l0aCB0aGUgbmV4dCBvYmplY3QgKGxpa2Ugd2l0aFxuICAvLyBfbmV4dE9iamVjdFByb21pc2UpIG9yIHJlamVjdGVkIGlmIHRoZSBjdXJzb3IgZG9lc24ndCByZXR1cm4gd2l0aGluXG4gIC8vIHRpbWVvdXRNUyBtcy5cbiAgX25leHRPYmplY3RQcm9taXNlV2l0aFRpbWVvdXQodGltZW91dE1TKSB7XG4gICAgaWYgKCF0aW1lb3V0TVMpIHtcbiAgICAgIHJldHVybiB0aGlzLl9uZXh0T2JqZWN0UHJvbWlzZSgpO1xuICAgIH1cbiAgICBjb25zdCBuZXh0T2JqZWN0UHJvbWlzZSA9IHRoaXMuX25leHRPYmplY3RQcm9taXNlKCk7XG4gICAgY29uc3QgdGltZW91dEVyciA9IG5ldyBFcnJvcignQ2xpZW50LXNpZGUgdGltZW91dCB3YWl0aW5nIGZvciBuZXh0IG9iamVjdCcpO1xuICAgIGNvbnN0IHRpbWVvdXRQcm9taXNlID0gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHJlamVjdCh0aW1lb3V0RXJyKTtcbiAgICAgIH0sIHRpbWVvdXRNUyk7XG4gICAgfSk7XG4gICAgcmV0dXJuIFByb21pc2UucmFjZShbbmV4dE9iamVjdFByb21pc2UsIHRpbWVvdXRQcm9taXNlXSlcbiAgICAgIC5jYXRjaCgoZXJyKSA9PiB7XG4gICAgICAgIGlmIChlcnIgPT09IHRpbWVvdXRFcnIpIHtcbiAgICAgICAgICB0aGlzLmNsb3NlKCk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycjtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZm9yRWFjaChjYWxsYmFjaywgdGhpc0FyZykge1xuICAgIC8vIEdldCBiYWNrIHRvIHRoZSBiZWdpbm5pbmcuXG4gICAgdGhpcy5fcmV3aW5kKCk7XG5cbiAgICBsZXQgaWR4ID0gMDtcbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgY29uc3QgZG9jID0gYXdhaXQgdGhpcy5fbmV4dE9iamVjdFByb21pc2UoKTtcbiAgICAgIGlmICghZG9jKSByZXR1cm47XG4gICAgICBhd2FpdCBjYWxsYmFjay5jYWxsKHRoaXNBcmcsIGRvYywgaWR4KyssIHRoaXMuX3NlbGZGb3JJdGVyYXRpb24pO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIG1hcChjYWxsYmFjaywgdGhpc0FyZykge1xuICAgIGNvbnN0IHJlc3VsdHMgPSBbXTtcbiAgICBhd2FpdCB0aGlzLmZvckVhY2goYXN5bmMgKGRvYywgaW5kZXgpID0+IHtcbiAgICAgIHJlc3VsdHMucHVzaChhd2FpdCBjYWxsYmFjay5jYWxsKHRoaXNBcmcsIGRvYywgaW5kZXgsIHRoaXMuX3NlbGZGb3JJdGVyYXRpb24pKTtcbiAgICB9KTtcblxuICAgIHJldHVybiByZXN1bHRzO1xuICB9XG5cbiAgX3Jld2luZCgpIHtcbiAgICAvLyBrbm93biB0byBiZSBzeW5jaHJvbm91c1xuICAgIHRoaXMuX2RiQ3Vyc29yLnJld2luZCgpO1xuXG4gICAgdGhpcy5fdmlzaXRlZElkcyA9IG5ldyBMb2NhbENvbGxlY3Rpb24uX0lkTWFwO1xuICB9XG5cbiAgLy8gTW9zdGx5IHVzYWJsZSBmb3IgdGFpbGFibGUgY3Vyc29ycy5cbiAgY2xvc2UoKSB7XG4gICAgdGhpcy5fZGJDdXJzb3IuY2xvc2UoKTtcbiAgfVxuXG4gIGZldGNoKCkge1xuICAgIHJldHVybiB0aGlzLm1hcChkb2MgPT4gZG9jKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBGSVhNRTogKG5vZGU6MzQ2ODApIFtNT05HT0RCIERSSVZFUl0gV2FybmluZzogY3Vyc29yLmNvdW50IGlzIGRlcHJlY2F0ZWQgYW5kIHdpbGwgYmVcbiAgICogIHJlbW92ZWQgaW4gdGhlIG5leHQgbWFqb3IgdmVyc2lvbiwgcGxlYXNlIHVzZSBgY29sbGVjdGlvbi5lc3RpbWF0ZWREb2N1bWVudENvdW50YCBvclxuICAgKiAgYGNvbGxlY3Rpb24uY291bnREb2N1bWVudHNgIGluc3RlYWQuXG4gICAqL1xuICBjb3VudCgpIHtcbiAgICByZXR1cm4gdGhpcy5fZGJDdXJzb3IuY291bnQoKTtcbiAgfVxuXG4gIC8vIFRoaXMgbWV0aG9kIGlzIE5PVCB3cmFwcGVkIGluIEN1cnNvci5cbiAgYXN5bmMgZ2V0UmF3T2JqZWN0cyhvcmRlcmVkKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmIChvcmRlcmVkKSB7XG4gICAgICByZXR1cm4gc2VsZi5mZXRjaCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmVzdWx0cyA9IG5ldyBMb2NhbENvbGxlY3Rpb24uX0lkTWFwO1xuICAgICAgYXdhaXQgc2VsZi5mb3JFYWNoKGZ1bmN0aW9uIChkb2MpIHtcbiAgICAgICAgcmVzdWx0cy5zZXQoZG9jLl9pZCwgZG9jKTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgfVxuICB9XG59IiwiaW1wb3J0IHsgQVNZTkNfQ1VSU09SX01FVEhPRFMsIGdldEFzeW5jTWV0aG9kTmFtZSB9IGZyb20gJ21ldGVvci9taW5pbW9uZ28vY29uc3RhbnRzJztcbmltcG9ydCB7IHJlcGxhY2VNZXRlb3JBdG9tV2l0aE1vbmdvLCByZXBsYWNlVHlwZXMgfSBmcm9tICcuL21vbmdvX2NvbW1vbic7XG5pbXBvcnQgTG9jYWxDb2xsZWN0aW9uIGZyb20gJ21ldGVvci9taW5pbW9uZ28vbG9jYWxfY29sbGVjdGlvbic7XG5pbXBvcnQgeyBDdXJzb3JEZXNjcmlwdGlvbiB9IGZyb20gJy4vY3Vyc29yX2Rlc2NyaXB0aW9uJztcbmltcG9ydCB7IE9ic2VydmVDYWxsYmFja3MsIE9ic2VydmVDaGFuZ2VzQ2FsbGJhY2tzIH0gZnJvbSAnLi90eXBlcyc7XG5cbmludGVyZmFjZSBNb25nb0ludGVyZmFjZSB7XG4gIHJhd0NvbGxlY3Rpb246IChjb2xsZWN0aW9uTmFtZTogc3RyaW5nKSA9PiBhbnk7XG4gIF9jcmVhdGVBc3luY2hyb25vdXNDdXJzb3I6IChjdXJzb3JEZXNjcmlwdGlvbjogQ3Vyc29yRGVzY3JpcHRpb24sIG9wdGlvbnM6IEN1cnNvck9wdGlvbnMpID0+IGFueTtcbiAgX29ic2VydmVDaGFuZ2VzOiAoY3Vyc29yRGVzY3JpcHRpb246IEN1cnNvckRlc2NyaXB0aW9uLCBvcmRlcmVkOiBib29sZWFuLCBjYWxsYmFja3M6IGFueSwgbm9uTXV0YXRpbmdDYWxsYmFja3M/OiBib29sZWFuKSA9PiBhbnk7XG59XG5cbmludGVyZmFjZSBDdXJzb3JPcHRpb25zIHtcbiAgc2VsZkZvckl0ZXJhdGlvbjogQ3Vyc29yPGFueT47XG4gIHVzZVRyYW5zZm9ybTogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBAY2xhc3MgQ3Vyc29yXG4gKlxuICogVGhlIG1haW4gY3Vyc29yIG9iamVjdCByZXR1cm5lZCBmcm9tIGZpbmQoKSwgaW1wbGVtZW50aW5nIHRoZSBkb2N1bWVudGVkXG4gKiBNb25nby5Db2xsZWN0aW9uIGN1cnNvciBBUEkuXG4gKlxuICogV3JhcHMgYSBDdXJzb3JEZXNjcmlwdGlvbiBhbmQgbGF6aWx5IGNyZWF0ZXMgYW4gQXN5bmNocm9ub3VzQ3Vyc29yXG4gKiAob25seSBjb250YWN0cyBNb25nb0RCIHdoZW4gbWV0aG9kcyBsaWtlIGZldGNoIG9yIGZvckVhY2ggYXJlIGNhbGxlZCkuXG4gKi9cbmV4cG9ydCBjbGFzcyBDdXJzb3I8VCwgVSA9IFQ+IHtcbiAgcHVibGljIF9tb25nbzogTW9uZ29JbnRlcmZhY2U7XG4gIHB1YmxpYyBfY3Vyc29yRGVzY3JpcHRpb246IEN1cnNvckRlc2NyaXB0aW9uO1xuICBwdWJsaWMgX3N5bmNocm9ub3VzQ3Vyc29yOiBhbnkgfCBudWxsO1xuXG4gIGNvbnN0cnVjdG9yKG1vbmdvOiBNb25nb0ludGVyZmFjZSwgY3Vyc29yRGVzY3JpcHRpb246IEN1cnNvckRlc2NyaXB0aW9uKSB7XG4gICAgdGhpcy5fbW9uZ28gPSBtb25nbztcbiAgICB0aGlzLl9jdXJzb3JEZXNjcmlwdGlvbiA9IGN1cnNvckRlc2NyaXB0aW9uO1xuICAgIHRoaXMuX3N5bmNocm9ub3VzQ3Vyc29yID0gbnVsbDtcbiAgfVxuXG4gIGFzeW5jIGNvdW50QXN5bmMoKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICBjb25zdCBjb2xsZWN0aW9uID0gdGhpcy5fbW9uZ28ucmF3Q29sbGVjdGlvbih0aGlzLl9jdXJzb3JEZXNjcmlwdGlvbi5jb2xsZWN0aW9uTmFtZSk7XG4gICAgcmV0dXJuIGF3YWl0IGNvbGxlY3Rpb24uY291bnREb2N1bWVudHMoXG4gICAgICByZXBsYWNlVHlwZXModGhpcy5fY3Vyc29yRGVzY3JpcHRpb24uc2VsZWN0b3IsIHJlcGxhY2VNZXRlb3JBdG9tV2l0aE1vbmdvKSxcbiAgICAgIHJlcGxhY2VUeXBlcyh0aGlzLl9jdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zLCByZXBsYWNlTWV0ZW9yQXRvbVdpdGhNb25nbyksXG4gICAgKTtcbiAgfVxuXG4gIGNvdW50KCk6IG5ldmVyIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBcImNvdW50KCkgaXMgbm90IGF2YWlsYWJsZSBvbiB0aGUgc2VydmVyLiBQbGVhc2UgdXNlIGNvdW50QXN5bmMoKSBpbnN0ZWFkLlwiXG4gICAgKTtcbiAgfVxuXG4gIGdldFRyYW5zZm9ybSgpOiAoKGRvYzogYW55KSA9PiBhbnkpIHwgdW5kZWZpbmVkIHtcbiAgICByZXR1cm4gdGhpcy5fY3Vyc29yRGVzY3JpcHRpb24ub3B0aW9ucy50cmFuc2Zvcm07XG4gIH1cblxuICBfcHVibGlzaEN1cnNvcihzdWI6IGFueSk6IGFueSB7XG4gICAgY29uc3QgY29sbGVjdGlvbiA9IHRoaXMuX2N1cnNvckRlc2NyaXB0aW9uLmNvbGxlY3Rpb25OYW1lO1xuICAgIHJldHVybiBNb25nby5Db2xsZWN0aW9uLl9wdWJsaXNoQ3Vyc29yKHRoaXMsIHN1YiwgY29sbGVjdGlvbik7XG4gIH1cblxuICBfZ2V0Q29sbGVjdGlvbk5hbWUoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5fY3Vyc29yRGVzY3JpcHRpb24uY29sbGVjdGlvbk5hbWU7XG4gIH1cblxuICBvYnNlcnZlKGNhbGxiYWNrczogT2JzZXJ2ZUNhbGxiYWNrczxVPik6IGFueSB7XG4gICAgcmV0dXJuIExvY2FsQ29sbGVjdGlvbi5fb2JzZXJ2ZUZyb21PYnNlcnZlQ2hhbmdlcyh0aGlzLCBjYWxsYmFja3MpO1xuICB9XG5cbiAgYXN5bmMgb2JzZXJ2ZUFzeW5jKGNhbGxiYWNrczogT2JzZXJ2ZUNhbGxiYWNrczxVPik6IFByb21pc2U8YW55PiB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4gcmVzb2x2ZSh0aGlzLm9ic2VydmUoY2FsbGJhY2tzKSkpO1xuICB9XG5cbiAgb2JzZXJ2ZUNoYW5nZXMoY2FsbGJhY2tzOiBPYnNlcnZlQ2hhbmdlc0NhbGxiYWNrczxVPiwgb3B0aW9uczogeyBub25NdXRhdGluZ0NhbGxiYWNrcz86IGJvb2xlYW4gfSA9IHt9KTogYW55IHtcbiAgICBjb25zdCBvcmRlcmVkID0gTG9jYWxDb2xsZWN0aW9uLl9vYnNlcnZlQ2hhbmdlc0NhbGxiYWNrc0FyZU9yZGVyZWQoY2FsbGJhY2tzKTtcbiAgICByZXR1cm4gdGhpcy5fbW9uZ28uX29ic2VydmVDaGFuZ2VzKFxuICAgICAgdGhpcy5fY3Vyc29yRGVzY3JpcHRpb24sXG4gICAgICBvcmRlcmVkLFxuICAgICAgY2FsbGJhY2tzLFxuICAgICAgb3B0aW9ucy5ub25NdXRhdGluZ0NhbGxiYWNrc1xuICAgICk7XG4gIH1cblxuICBhc3luYyBvYnNlcnZlQ2hhbmdlc0FzeW5jKGNhbGxiYWNrczogT2JzZXJ2ZUNoYW5nZXNDYWxsYmFja3M8VT4sIG9wdGlvbnM6IHsgbm9uTXV0YXRpbmdDYWxsYmFja3M/OiBib29sZWFuIH0gPSB7fSk6IFByb21pc2U8YW55PiB7XG4gICAgcmV0dXJuIHRoaXMub2JzZXJ2ZUNoYW5nZXMoY2FsbGJhY2tzLCBvcHRpb25zKTtcbiAgfVxufVxuXG4vLyBBZGQgY3Vyc29yIG1ldGhvZHMgZHluYW1pY2FsbHlcblsuLi5BU1lOQ19DVVJTT1JfTUVUSE9EUywgU3ltYm9sLml0ZXJhdG9yLCBTeW1ib2wuYXN5bmNJdGVyYXRvcl0uZm9yRWFjaChtZXRob2ROYW1lID0+IHtcbiAgaWYgKG1ldGhvZE5hbWUgPT09ICdjb3VudCcpIHJldHVybjtcblxuICAoQ3Vyc29yLnByb3RvdHlwZSBhcyBhbnkpW21ldGhvZE5hbWVdID0gZnVuY3Rpb24odGhpczogQ3Vyc29yPGFueT4sIC4uLmFyZ3M6IGFueVtdKTogYW55IHtcbiAgICBjb25zdCBjdXJzb3IgPSBzZXR1cEFzeW5jaHJvbm91c0N1cnNvcih0aGlzLCBtZXRob2ROYW1lKTtcbiAgICByZXR1cm4gY3Vyc29yW21ldGhvZE5hbWVdKC4uLmFyZ3MpO1xuICB9O1xuXG4gIGlmIChtZXRob2ROYW1lID09PSBTeW1ib2wuaXRlcmF0b3IgfHwgbWV0aG9kTmFtZSA9PT0gU3ltYm9sLmFzeW5jSXRlcmF0b3IpIHJldHVybjtcblxuICBjb25zdCBtZXRob2ROYW1lQXN5bmMgPSBnZXRBc3luY01ldGhvZE5hbWUobWV0aG9kTmFtZSk7XG5cbiAgKEN1cnNvci5wcm90b3R5cGUgYXMgYW55KVttZXRob2ROYW1lQXN5bmNdID0gZnVuY3Rpb24odGhpczogQ3Vyc29yPGFueT4sIC4uLmFyZ3M6IGFueVtdKTogUHJvbWlzZTxhbnk+IHtcbiAgICByZXR1cm4gdGhpc1ttZXRob2ROYW1lXSguLi5hcmdzKTtcbiAgfTtcbn0pO1xuXG5mdW5jdGlvbiBzZXR1cEFzeW5jaHJvbm91c0N1cnNvcihjdXJzb3I6IEN1cnNvcjxhbnk+LCBtZXRob2Q6IHN0cmluZyB8IHN5bWJvbCk6IGFueSB7XG4gIGlmIChjdXJzb3IuX2N1cnNvckRlc2NyaXB0aW9uLm9wdGlvbnMudGFpbGFibGUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBjYWxsICR7U3RyaW5nKG1ldGhvZCl9IG9uIGEgdGFpbGFibGUgY3Vyc29yYCk7XG4gIH1cblxuICBpZiAoIWN1cnNvci5fc3luY2hyb25vdXNDdXJzb3IpIHtcbiAgICBjdXJzb3IuX3N5bmNocm9ub3VzQ3Vyc29yID0gY3Vyc29yLl9tb25nby5fY3JlYXRlQXN5bmNocm9ub3VzQ3Vyc29yKFxuICAgICAgY3Vyc29yLl9jdXJzb3JEZXNjcmlwdGlvbixcbiAgICAgIHtcbiAgICAgICAgc2VsZkZvckl0ZXJhdGlvbjogY3Vyc29yLFxuICAgICAgICB1c2VUcmFuc2Zvcm06IHRydWUsXG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIHJldHVybiBjdXJzb3IuX3N5bmNocm9ub3VzQ3Vyc29yO1xufSIsIi8vIHNpbmdsZXRvblxuZXhwb3J0IGNvbnN0IExvY2FsQ29sbGVjdGlvbkRyaXZlciA9IG5ldyAoY2xhc3MgTG9jYWxDb2xsZWN0aW9uRHJpdmVyIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgdGhpcy5ub0Nvbm5Db2xsZWN0aW9ucyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG4gIH1cblxuICBvcGVuKG5hbWUsIGNvbm4pIHtcbiAgICBpZiAoISBuYW1lKSB7XG4gICAgICByZXR1cm4gbmV3IExvY2FsQ29sbGVjdGlvbjtcbiAgICB9XG5cbiAgICBpZiAoISBjb25uKSB7XG4gICAgICByZXR1cm4gZW5zdXJlQ29sbGVjdGlvbihuYW1lLCB0aGlzLm5vQ29ubkNvbGxlY3Rpb25zKTtcbiAgICB9XG5cbiAgICBpZiAoISBjb25uLl9tb25nb19saXZlZGF0YV9jb2xsZWN0aW9ucykge1xuICAgICAgY29ubi5fbW9uZ29fbGl2ZWRhdGFfY29sbGVjdGlvbnMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgIH1cblxuICAgIC8vIFhYWCBpcyB0aGVyZSBhIHdheSB0byBrZWVwIHRyYWNrIG9mIGEgY29ubmVjdGlvbidzIGNvbGxlY3Rpb25zIHdpdGhvdXRcbiAgICAvLyBkYW5nbGluZyBpdCBvZmYgdGhlIGNvbm5lY3Rpb24gb2JqZWN0P1xuICAgIHJldHVybiBlbnN1cmVDb2xsZWN0aW9uKG5hbWUsIGNvbm4uX21vbmdvX2xpdmVkYXRhX2NvbGxlY3Rpb25zKTtcbiAgfVxufSk7XG5cbmZ1bmN0aW9uIGVuc3VyZUNvbGxlY3Rpb24obmFtZSwgY29sbGVjdGlvbnMpIHtcbiAgcmV0dXJuIChuYW1lIGluIGNvbGxlY3Rpb25zKVxuICAgID8gY29sbGVjdGlvbnNbbmFtZV1cbiAgICA6IGNvbGxlY3Rpb25zW25hbWVdID0gbmV3IExvY2FsQ29sbGVjdGlvbihuYW1lKTtcbn1cbiIsImltcG9ydCBvbmNlIGZyb20gJ2xvZGFzaC5vbmNlJztcbmltcG9ydCB7XG4gIEFTWU5DX0NPTExFQ1RJT05fTUVUSE9EUyxcbiAgZ2V0QXN5bmNNZXRob2ROYW1lLFxuICBDTElFTlRfT05MWV9NRVRIT0RTXG59IGZyb20gXCJtZXRlb3IvbWluaW1vbmdvL2NvbnN0YW50c1wiO1xuaW1wb3J0IHsgTW9uZ29Db25uZWN0aW9uIH0gZnJvbSAnLi9tb25nb19jb25uZWN0aW9uJztcblxuLy8gRGVmaW5lIGludGVyZmFjZXMgYW5kIHR5cGVzXG5pbnRlcmZhY2UgSUNvbm5lY3Rpb25PcHRpb25zIHtcbiAgb3Bsb2dVcmw/OiBzdHJpbmc7XG4gIFtrZXk6IHN0cmluZ106IHVua25vd247ICAvLyBDaGFuZ2VkIGZyb20gJ2FueScgdG8gJ3Vua25vd24nIGZvciBiZXR0ZXIgdHlwZSBzYWZldHlcbn1cblxuaW50ZXJmYWNlIElNb25nb0ludGVybmFscyB7XG4gIFJlbW90ZUNvbGxlY3Rpb25Ecml2ZXI6IHR5cGVvZiBSZW1vdGVDb2xsZWN0aW9uRHJpdmVyO1xuICBkZWZhdWx0UmVtb3RlQ29sbGVjdGlvbkRyaXZlcjogKCkgPT4gUmVtb3RlQ29sbGVjdGlvbkRyaXZlcjtcbn1cblxuLy8gTW9yZSBzcGVjaWZpYyB0eXBpbmcgZm9yIGNvbGxlY3Rpb24gbWV0aG9kc1xudHlwZSBNb25nb01ldGhvZEZ1bmN0aW9uID0gKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdW5rbm93bjtcbmludGVyZmFjZSBJQ29sbGVjdGlvbk1ldGhvZHMge1xuICBba2V5OiBzdHJpbmddOiBNb25nb01ldGhvZEZ1bmN0aW9uO1xufVxuXG4vLyBUeXBlIGZvciBNb25nb0Nvbm5lY3Rpb25cbmludGVyZmFjZSBJTW9uZ29DbGllbnQge1xuICBjb25uZWN0OiAoKSA9PiBQcm9taXNlPHZvaWQ+O1xufVxuXG5pbnRlcmZhY2UgSU1vbmdvQ29ubmVjdGlvbiB7XG4gIGNsaWVudDogSU1vbmdvQ2xpZW50O1xuICBba2V5OiBzdHJpbmddOiBNb25nb01ldGhvZEZ1bmN0aW9uIHwgSU1vbmdvQ2xpZW50O1xufVxuXG5kZWNsYXJlIGdsb2JhbCB7XG4gIG5hbWVzcGFjZSBOb2RlSlMge1xuICAgIGludGVyZmFjZSBQcm9jZXNzRW52IHtcbiAgICAgIE1PTkdPX1VSTDogc3RyaW5nO1xuICAgICAgTU9OR09fT1BMT0dfVVJMPzogc3RyaW5nO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IE1vbmdvSW50ZXJuYWxzOiBJTW9uZ29JbnRlcm5hbHM7XG4gIGNvbnN0IE1ldGVvcjoge1xuICAgIHN0YXJ0dXA6IChjYWxsYmFjazogKCkgPT4gUHJvbWlzZTx2b2lkPikgPT4gdm9pZDtcbiAgfTtcbn1cblxuY2xhc3MgUmVtb3RlQ29sbGVjdGlvbkRyaXZlciB7XG4gIHByaXZhdGUgcmVhZG9ubHkgbW9uZ286IE1vbmdvQ29ubmVjdGlvbjtcblxuICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBSRU1PVEVfQ09MTEVDVElPTl9NRVRIT0RTID0gW1xuICAgICdjcmVhdGVDYXBwZWRDb2xsZWN0aW9uQXN5bmMnLFxuICAgICdkcm9wSW5kZXhBc3luYycsXG4gICAgJ2Vuc3VyZUluZGV4QXN5bmMnLFxuICAgICdjcmVhdGVJbmRleEFzeW5jJyxcbiAgICAnY291bnREb2N1bWVudHMnLFxuICAgICdkcm9wQ29sbGVjdGlvbkFzeW5jJyxcbiAgICAnZXN0aW1hdGVkRG9jdW1lbnRDb3VudCcsXG4gICAgJ2ZpbmQnLFxuICAgICdmaW5kT25lQXN5bmMnLFxuICAgICdpbnNlcnRBc3luYycsXG4gICAgJ3Jhd0NvbGxlY3Rpb24nLFxuICAgICdyZW1vdmVBc3luYycsXG4gICAgJ3VwZGF0ZUFzeW5jJyxcbiAgICAndXBzZXJ0QXN5bmMnLFxuICBdIGFzIGNvbnN0O1xuXG4gIGNvbnN0cnVjdG9yKG1vbmdvVXJsOiBzdHJpbmcsIG9wdGlvbnM6IElDb25uZWN0aW9uT3B0aW9ucykge1xuICAgIHRoaXMubW9uZ28gPSBuZXcgTW9uZ29Db25uZWN0aW9uKG1vbmdvVXJsLCBvcHRpb25zKTtcbiAgfVxuXG4gIHB1YmxpYyBvcGVuKG5hbWU6IHN0cmluZyk6IElDb2xsZWN0aW9uTWV0aG9kcyB7XG4gICAgY29uc3QgcmV0OiBJQ29sbGVjdGlvbk1ldGhvZHMgPSB7fTtcblxuICAgIC8vIEhhbmRsZSByZW1vdGUgY29sbGVjdGlvbiBtZXRob2RzXG4gICAgUmVtb3RlQ29sbGVjdGlvbkRyaXZlci5SRU1PVEVfQ09MTEVDVElPTl9NRVRIT0RTLmZvckVhY2goKG1ldGhvZCkgPT4ge1xuICAgICAgLy8gVHlwZSBhc3NlcnRpb24gbmVlZGVkIGJlY2F1c2Ugd2Uga25vdyB0aGVzZSBtZXRob2RzIGV4aXN0IG9uIE1vbmdvQ29ubmVjdGlvblxuICAgICAgY29uc3QgbW9uZ29NZXRob2QgPSB0aGlzLm1vbmdvW21ldGhvZF0gYXMgTW9uZ29NZXRob2RGdW5jdGlvbjtcbiAgICAgIHJldFttZXRob2RdID0gbW9uZ29NZXRob2QuYmluZCh0aGlzLm1vbmdvLCBuYW1lKTtcblxuICAgICAgaWYgKCFBU1lOQ19DT0xMRUNUSU9OX01FVEhPRFMuaW5jbHVkZXMobWV0aG9kKSkgcmV0dXJuO1xuXG4gICAgICBjb25zdCBhc3luY01ldGhvZE5hbWUgPSBnZXRBc3luY01ldGhvZE5hbWUobWV0aG9kKTtcbiAgICAgIHJldFthc3luY01ldGhvZE5hbWVdID0gKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gcmV0W21ldGhvZF0oLi4uYXJncyk7XG4gICAgfSk7XG5cbiAgICAvLyBIYW5kbGUgY2xpZW50LW9ubHkgbWV0aG9kc1xuICAgIENMSUVOVF9PTkxZX01FVEhPRFMuZm9yRWFjaCgobWV0aG9kKSA9PiB7XG4gICAgICByZXRbbWV0aG9kXSA9ICguLi5hcmdzOiB1bmtub3duW10pOiBuZXZlciA9PiB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICBgJHttZXRob2R9IGlzIG5vdCBhdmFpbGFibGUgb24gdGhlIHNlcnZlci4gUGxlYXNlIHVzZSAke2dldEFzeW5jTWV0aG9kTmFtZShcbiAgICAgICAgICAgIG1ldGhvZFxuICAgICAgICAgICl9KCkgaW5zdGVhZC5gXG4gICAgICAgICk7XG4gICAgICB9O1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJldDtcbiAgfVxufVxuXG4vLyBBc3NpZ24gdGhlIGNsYXNzIHRvIE1vbmdvSW50ZXJuYWxzXG5Nb25nb0ludGVybmFscy5SZW1vdGVDb2xsZWN0aW9uRHJpdmVyID0gUmVtb3RlQ29sbGVjdGlvbkRyaXZlcjtcblxuLy8gQ3JlYXRlIHRoZSBzaW5nbGV0b24gUmVtb3RlQ29sbGVjdGlvbkRyaXZlciBvbmx5IG9uIGRlbWFuZFxuTW9uZ29JbnRlcm5hbHMuZGVmYXVsdFJlbW90ZUNvbGxlY3Rpb25Ecml2ZXIgPSBvbmNlKCgpOiBSZW1vdGVDb2xsZWN0aW9uRHJpdmVyID0+IHtcbiAgY29uc3QgY29ubmVjdGlvbk9wdGlvbnM6IElDb25uZWN0aW9uT3B0aW9ucyA9IHt9O1xuICBjb25zdCBtb25nb1VybCA9IHByb2Nlc3MuZW52Lk1PTkdPX1VSTDtcblxuICBpZiAoIW1vbmdvVXJsKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiTU9OR09fVVJMIG11c3QgYmUgc2V0IGluIGVudmlyb25tZW50XCIpO1xuICB9XG5cbiAgaWYgKHByb2Nlc3MuZW52Lk1PTkdPX09QTE9HX1VSTCkge1xuICAgIGNvbm5lY3Rpb25PcHRpb25zLm9wbG9nVXJsID0gcHJvY2Vzcy5lbnYuTU9OR09fT1BMT0dfVVJMO1xuICB9XG5cbiAgY29uc3QgZHJpdmVyID0gbmV3IFJlbW90ZUNvbGxlY3Rpb25Ecml2ZXIobW9uZ29VcmwsIGNvbm5lY3Rpb25PcHRpb25zKTtcblxuICAvLyBJbml0aWFsaXplIGRhdGFiYXNlIGNvbm5lY3Rpb24gb24gc3RhcnR1cFxuICBNZXRlb3Iuc3RhcnR1cChhc3luYyAoKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gICAgYXdhaXQgZHJpdmVyLm1vbmdvLmNsaWVudC5jb25uZWN0KCk7XG4gIH0pO1xuXG4gIHJldHVybiBkcml2ZXI7XG59KTtcblxuZXhwb3J0IHsgUmVtb3RlQ29sbGVjdGlvbkRyaXZlciwgSUNvbm5lY3Rpb25PcHRpb25zLCBJQ29sbGVjdGlvbk1ldGhvZHMgfTsiLCJpbXBvcnQgeyBub3JtYWxpemVQcm9qZWN0aW9uIH0gZnJvbSBcIi4uL21vbmdvX3V0aWxzXCI7XG5pbXBvcnQgeyBBc3luY01ldGhvZHMgfSBmcm9tICcuL21ldGhvZHNfYXN5bmMnO1xuaW1wb3J0IHsgU3luY01ldGhvZHMgfSBmcm9tICcuL21ldGhvZHNfc3luYyc7XG5pbXBvcnQgeyBJbmRleE1ldGhvZHMgfSBmcm9tICcuL21ldGhvZHNfaW5kZXgnO1xuaW1wb3J0IHtcbiAgSURfR0VORVJBVE9SUywgbm9ybWFsaXplT3B0aW9ucyxcbiAgc2V0dXBBdXRvcHVibGlzaCxcbiAgc2V0dXBDb25uZWN0aW9uLFxuICBzZXR1cERyaXZlcixcbiAgc2V0dXBNdXRhdGlvbk1ldGhvZHMsXG4gIHZhbGlkYXRlQ29sbGVjdGlvbk5hbWVcbn0gZnJvbSAnLi9jb2xsZWN0aW9uX3V0aWxzJztcbmltcG9ydCB7IFJlcGxpY2F0aW9uTWV0aG9kcyB9IGZyb20gJy4vbWV0aG9kc19yZXBsaWNhdGlvbic7XG5pbXBvcnQgeyB3YXRjaENoYW5nZVN0cmVhbSB9IGZyb20gJy4vd2F0Y2hfY2hhbmdlX3N0cmVhbSc7XG5cbi8qKlxuICogQHN1bW1hcnkgTmFtZXNwYWNlIGZvciBNb25nb0RCLXJlbGF0ZWQgaXRlbXNcbiAqIEBuYW1lc3BhY2VcbiAqL1xuTW9uZ28gPSB7fTtcblxuLyoqXG4gKiBAc3VtbWFyeSBDb25zdHJ1Y3RvciBmb3IgYSBDb2xsZWN0aW9uXG4gKiBAbG9jdXMgQW55d2hlcmVcbiAqIEBpbnN0YW5jZW5hbWUgY29sbGVjdGlvblxuICogQGNsYXNzXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGUgY29sbGVjdGlvbi4gIElmIG51bGwsIGNyZWF0ZXMgYW4gdW5tYW5hZ2VkICh1bnN5bmNocm9uaXplZCkgbG9jYWwgY29sbGVjdGlvbi5cbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc11cbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zLmNvbm5lY3Rpb24gVGhlIHNlcnZlciBjb25uZWN0aW9uIHRoYXQgd2lsbCBtYW5hZ2UgdGhpcyBjb2xsZWN0aW9uLiBVc2VzIHRoZSBkZWZhdWx0IGNvbm5lY3Rpb24gaWYgbm90IHNwZWNpZmllZC4gIFBhc3MgdGhlIHJldHVybiB2YWx1ZSBvZiBjYWxsaW5nIFtgRERQLmNvbm5lY3RgXSgjRERQLWNvbm5lY3QpIHRvIHNwZWNpZnkgYSBkaWZmZXJlbnQgc2VydmVyLiBQYXNzIGBudWxsYCB0byBzcGVjaWZ5IG5vIGNvbm5lY3Rpb24uIFVubWFuYWdlZCAoYG5hbWVgIGlzIG51bGwpIGNvbGxlY3Rpb25zIGNhbm5vdCBzcGVjaWZ5IGEgY29ubmVjdGlvbi5cbiAqIEBwYXJhbSB7U3RyaW5nfSBvcHRpb25zLmlkR2VuZXJhdGlvbiBUaGUgbWV0aG9kIG9mIGdlbmVyYXRpbmcgdGhlIGBfaWRgIGZpZWxkcyBvZiBuZXcgZG9jdW1lbnRzIGluIHRoaXMgY29sbGVjdGlvbi4gIFBvc3NpYmxlIHZhbHVlczpcblxuIC0gKipgJ1NUUklORydgKio6IHJhbmRvbSBzdHJpbmdzXG4gLSAqKmAnTU9OR08nYCoqOiAgcmFuZG9tIFtgTW9uZ28uT2JqZWN0SURgXSgjbW9uZ29fb2JqZWN0X2lkKSB2YWx1ZXNcblxuVGhlIGRlZmF1bHQgaWQgZ2VuZXJhdGlvbiB0ZWNobmlxdWUgaXMgYCdTVFJJTkcnYC5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IG9wdGlvbnMudHJhbnNmb3JtIEFuIG9wdGlvbmFsIHRyYW5zZm9ybWF0aW9uIGZ1bmN0aW9uLiBEb2N1bWVudHMgd2lsbCBiZSBwYXNzZWQgdGhyb3VnaCB0aGlzIGZ1bmN0aW9uIGJlZm9yZSBiZWluZyByZXR1cm5lZCBmcm9tIGBmZXRjaGAgb3IgYGZpbmRPbmVBc3luY2AsIGFuZCBiZWZvcmUgYmVpbmcgcGFzc2VkIHRvIGNhbGxiYWNrcyBvZiBgb2JzZXJ2ZWAsIGBtYXBgLCBgZm9yRWFjaGAsIGBhbGxvd2AsIGFuZCBgZGVueWAuIFRyYW5zZm9ybXMgYXJlICpub3QqIGFwcGxpZWQgZm9yIHRoZSBjYWxsYmFja3Mgb2YgYG9ic2VydmVDaGFuZ2VzYCBvciB0byBjdXJzb3JzIHJldHVybmVkIGZyb20gcHVibGlzaCBmdW5jdGlvbnMuXG4gKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMuZGVmaW5lTXV0YXRpb25NZXRob2RzIFNldCB0byBgZmFsc2VgIHRvIHNraXAgc2V0dGluZyB1cCB0aGUgbXV0YXRpb24gbWV0aG9kcyB0aGF0IGVuYWJsZSBpbnNlcnQvdXBkYXRlL3JlbW92ZSBmcm9tIGNsaWVudCBjb2RlLiBEZWZhdWx0IGB0cnVlYC5cbiAqL1xuLy8gTWFpbiBDb2xsZWN0aW9uIGNvbnN0cnVjdG9yXG5Nb25nby5Db2xsZWN0aW9uID0gZnVuY3Rpb24gQ29sbGVjdGlvbihuYW1lLCBvcHRpb25zKSB7XG4gIG5hbWUgPSB2YWxpZGF0ZUNvbGxlY3Rpb25OYW1lKG5hbWUpO1xuXG4gIG9wdGlvbnMgPSBub3JtYWxpemVPcHRpb25zKG9wdGlvbnMpO1xuXG4gIHRoaXMuX21ha2VOZXdJRCA9IElEX0dFTkVSQVRPUlNbb3B0aW9ucy5pZEdlbmVyYXRpb25dPy4obmFtZSk7XG5cbiAgdGhpcy5fdHJhbnNmb3JtID0gTG9jYWxDb2xsZWN0aW9uLndyYXBUcmFuc2Zvcm0ob3B0aW9ucy50cmFuc2Zvcm0pO1xuICB0aGlzLnJlc29sdmVyVHlwZSA9IG9wdGlvbnMucmVzb2x2ZXJUeXBlO1xuXG4gIHRoaXMuX2Nvbm5lY3Rpb24gPSBzZXR1cENvbm5lY3Rpb24obmFtZSwgb3B0aW9ucyk7XG5cbiAgY29uc3QgZHJpdmVyID0gc2V0dXBEcml2ZXIobmFtZSwgdGhpcy5fY29ubmVjdGlvbiwgb3B0aW9ucyk7XG4gIHRoaXMuX2RyaXZlciA9IGRyaXZlcjtcblxuICB0aGlzLl9jb2xsZWN0aW9uID0gZHJpdmVyLm9wZW4obmFtZSwgdGhpcy5fY29ubmVjdGlvbik7XG4gIHRoaXMuX25hbWUgPSBuYW1lO1xuXG4gIHRoaXMuX3NldHRpbmdVcFJlcGxpY2F0aW9uUHJvbWlzZSA9IHRoaXMuX21heWJlU2V0VXBSZXBsaWNhdGlvbihuYW1lLCBvcHRpb25zKTtcblxuICBzZXR1cE11dGF0aW9uTWV0aG9kcyh0aGlzLCBuYW1lLCBvcHRpb25zKTtcblxuICBzZXR1cEF1dG9wdWJsaXNoKHRoaXMsIG5hbWUsIG9wdGlvbnMpO1xuXG4gIE1vbmdvLl9jb2xsZWN0aW9ucy5zZXQobmFtZSwgdGhpcyk7XG59O1xuXG5PYmplY3QuYXNzaWduKE1vbmdvLkNvbGxlY3Rpb24ucHJvdG90eXBlLCB7XG4gIF9nZXRGaW5kU2VsZWN0b3IoYXJncykge1xuICAgIGlmIChhcmdzLmxlbmd0aCA9PSAwKSByZXR1cm4ge307XG4gICAgZWxzZSByZXR1cm4gYXJnc1swXTtcbiAgfSxcblxuICBfZ2V0RmluZE9wdGlvbnMoYXJncykge1xuICAgIGNvbnN0IFssIG9wdGlvbnNdID0gYXJncyB8fCBbXTtcbiAgICBjb25zdCBuZXdPcHRpb25zID0gbm9ybWFsaXplUHJvamVjdGlvbihvcHRpb25zKTtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoYXJncy5sZW5ndGggPCAyKSB7XG4gICAgICByZXR1cm4geyB0cmFuc2Zvcm06IHNlbGYuX3RyYW5zZm9ybSB9O1xuICAgIH0gZWxzZSB7XG4gICAgICBjaGVjayhcbiAgICAgICAgbmV3T3B0aW9ucyxcbiAgICAgICAgTWF0Y2guT3B0aW9uYWwoXG4gICAgICAgICAgTWF0Y2guT2JqZWN0SW5jbHVkaW5nKHtcbiAgICAgICAgICAgIHByb2plY3Rpb246IE1hdGNoLk9wdGlvbmFsKE1hdGNoLk9uZU9mKE9iamVjdCwgdW5kZWZpbmVkKSksXG4gICAgICAgICAgICBzb3J0OiBNYXRjaC5PcHRpb25hbChcbiAgICAgICAgICAgICAgTWF0Y2guT25lT2YoT2JqZWN0LCBBcnJheSwgRnVuY3Rpb24sIHVuZGVmaW5lZClcbiAgICAgICAgICAgICksXG4gICAgICAgICAgICBsaW1pdDogTWF0Y2guT3B0aW9uYWwoTWF0Y2guT25lT2YoTnVtYmVyLCB1bmRlZmluZWQpKSxcbiAgICAgICAgICAgIHNraXA6IE1hdGNoLk9wdGlvbmFsKE1hdGNoLk9uZU9mKE51bWJlciwgdW5kZWZpbmVkKSksXG4gICAgICAgICAgfSlcbiAgICAgICAgKVxuICAgICAgKTtcblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgdHJhbnNmb3JtOiBzZWxmLl90cmFuc2Zvcm0sXG4gICAgICAgIC4uLm5ld09wdGlvbnMsXG4gICAgICB9O1xuICAgIH1cbiAgfSxcbn0pO1xuXG5PYmplY3QuYXNzaWduKE1vbmdvLkNvbGxlY3Rpb24sIHtcbiAgYXN5bmMgX3B1Ymxpc2hDdXJzb3IoY3Vyc29yLCBzdWIsIGNvbGxlY3Rpb24pIHtcbiAgICB2YXIgb2JzZXJ2ZUhhbmRsZSA9IGF3YWl0IGN1cnNvci5vYnNlcnZlQ2hhbmdlcyhcbiAgICAgICAge1xuICAgICAgICAgIGFkZGVkOiBmdW5jdGlvbihpZCwgZmllbGRzKSB7XG4gICAgICAgICAgICBzdWIuYWRkZWQoY29sbGVjdGlvbiwgaWQsIGZpZWxkcyk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBjaGFuZ2VkOiBmdW5jdGlvbihpZCwgZmllbGRzKSB7XG4gICAgICAgICAgICBzdWIuY2hhbmdlZChjb2xsZWN0aW9uLCBpZCwgZmllbGRzKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIHJlbW92ZWQ6IGZ1bmN0aW9uKGlkKSB7XG4gICAgICAgICAgICBzdWIucmVtb3ZlZChjb2xsZWN0aW9uLCBpZCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgLy8gUHVibGljYXRpb25zIGRvbid0IG11dGF0ZSB0aGUgZG9jdW1lbnRzXG4gICAgICAgIC8vIFRoaXMgaXMgdGVzdGVkIGJ5IHRoZSBgbGl2ZWRhdGEgLSBwdWJsaXNoIGNhbGxiYWNrcyBjbG9uZWAgdGVzdFxuICAgICAgICB7IG5vbk11dGF0aW5nQ2FsbGJhY2tzOiB0cnVlIH1cbiAgICApO1xuXG4gICAgLy8gV2UgZG9uJ3QgY2FsbCBzdWIucmVhZHkoKSBoZXJlOiBpdCBnZXRzIGNhbGxlZCBpbiBsaXZlZGF0YV9zZXJ2ZXIsIGFmdGVyXG4gICAgLy8gcG9zc2libHkgY2FsbGluZyBfcHVibGlzaEN1cnNvciBvbiBtdWx0aXBsZSByZXR1cm5lZCBjdXJzb3JzLlxuXG4gICAgLy8gcmVnaXN0ZXIgc3RvcCBjYWxsYmFjayAoZXhwZWN0cyBsYW1iZGEgdy8gbm8gYXJncykuXG4gICAgc3ViLm9uU3RvcChhc3luYyBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBhd2FpdCBvYnNlcnZlSGFuZGxlLnN0b3AoKTtcbiAgICB9KTtcblxuICAgIC8vIHJldHVybiB0aGUgb2JzZXJ2ZUhhbmRsZSBpbiBjYXNlIGl0IG5lZWRzIHRvIGJlIHN0b3BwZWQgZWFybHlcbiAgICByZXR1cm4gb2JzZXJ2ZUhhbmRsZTtcbiAgfSxcblxuICAvLyBwcm90ZWN0IGFnYWluc3QgZGFuZ2Vyb3VzIHNlbGVjdG9ycy4gIGZhbHNleSBhbmQge19pZDogZmFsc2V5fSBhcmUgYm90aFxuICAvLyBsaWtlbHkgcHJvZ3JhbW1lciBlcnJvciwgYW5kIG5vdCB3aGF0IHlvdSB3YW50LCBwYXJ0aWN1bGFybHkgZm9yIGRlc3RydWN0aXZlXG4gIC8vIG9wZXJhdGlvbnMuIElmIGEgZmFsc2V5IF9pZCBpcyBzZW50IGluLCBhIG5ldyBzdHJpbmcgX2lkIHdpbGwgYmVcbiAgLy8gZ2VuZXJhdGVkIGFuZCByZXR1cm5lZDsgaWYgYSBmYWxsYmFja0lkIGlzIHByb3ZpZGVkLCBpdCB3aWxsIGJlIHJldHVybmVkXG4gIC8vIGluc3RlYWQuXG4gIF9yZXdyaXRlU2VsZWN0b3Ioc2VsZWN0b3IsIHsgZmFsbGJhY2tJZCB9ID0ge30pIHtcbiAgICAvLyBzaG9ydGhhbmQgLS0gc2NhbGFycyBtYXRjaCBfaWRcbiAgICBpZiAoTG9jYWxDb2xsZWN0aW9uLl9zZWxlY3RvcklzSWQoc2VsZWN0b3IpKSBzZWxlY3RvciA9IHsgX2lkOiBzZWxlY3RvciB9O1xuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoc2VsZWN0b3IpKSB7XG4gICAgICAvLyBUaGlzIGlzIGNvbnNpc3RlbnQgd2l0aCB0aGUgTW9uZ28gY29uc29sZSBpdHNlbGY7IGlmIHdlIGRvbid0IGRvIHRoaXNcbiAgICAgIC8vIGNoZWNrIHBhc3NpbmcgYW4gZW1wdHkgYXJyYXkgZW5kcyB1cCBzZWxlY3RpbmcgYWxsIGl0ZW1zXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJNb25nbyBzZWxlY3RvciBjYW4ndCBiZSBhbiBhcnJheS5cIik7XG4gICAgfVxuXG4gICAgaWYgKCFzZWxlY3RvciB8fCAoJ19pZCcgaW4gc2VsZWN0b3IgJiYgIXNlbGVjdG9yLl9pZCkpIHtcbiAgICAgIC8vIGNhbid0IG1hdGNoIGFueXRoaW5nXG4gICAgICByZXR1cm4geyBfaWQ6IGZhbGxiYWNrSWQgfHwgUmFuZG9tLmlkKCkgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gc2VsZWN0b3I7XG4gIH0sXG59KTtcblxuT2JqZWN0LmFzc2lnbihNb25nby5Db2xsZWN0aW9uLnByb3RvdHlwZSwgUmVwbGljYXRpb25NZXRob2RzLCBTeW5jTWV0aG9kcywgQXN5bmNNZXRob2RzLCBJbmRleE1ldGhvZHMpO1xuXG5PYmplY3QuYXNzaWduKE1vbmdvLkNvbGxlY3Rpb24ucHJvdG90eXBlLCB7XG4gIC8vIERldGVybWluZSBpZiB0aGlzIGNvbGxlY3Rpb24gaXMgc2ltcGx5IGEgbWluaW1vbmdvIHJlcHJlc2VudGF0aW9uIG9mIGEgcmVhbFxuICAvLyBkYXRhYmFzZSBvbiBhbm90aGVyIHNlcnZlclxuICBfaXNSZW1vdGVDb2xsZWN0aW9uKCkge1xuICAgIC8vIFhYWCBzZWUgI01ldGVvclNlcnZlck51bGxcbiAgICByZXR1cm4gdGhpcy5fY29ubmVjdGlvbiAmJiB0aGlzLl9jb25uZWN0aW9uICE9PSBNZXRlb3Iuc2VydmVyO1xuICB9LFxuXG4gIGFzeW5jIGRyb3BDb2xsZWN0aW9uQXN5bmMoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmICghc2VsZi5fY29sbGVjdGlvbi5kcm9wQ29sbGVjdGlvbkFzeW5jKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYW4gb25seSBjYWxsIGRyb3BDb2xsZWN0aW9uQXN5bmMgb24gc2VydmVyIGNvbGxlY3Rpb25zJyk7XG4gICBhd2FpdCBzZWxmLl9jb2xsZWN0aW9uLmRyb3BDb2xsZWN0aW9uQXN5bmMoKTtcbiAgfSxcblxuICBhc3luYyBjcmVhdGVDYXBwZWRDb2xsZWN0aW9uQXN5bmMoYnl0ZVNpemUsIG1heERvY3VtZW50cykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoISBhd2FpdCBzZWxmLl9jb2xsZWN0aW9uLmNyZWF0ZUNhcHBlZENvbGxlY3Rpb25Bc3luYylcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgJ0NhbiBvbmx5IGNhbGwgY3JlYXRlQ2FwcGVkQ29sbGVjdGlvbkFzeW5jIG9uIHNlcnZlciBjb2xsZWN0aW9ucydcbiAgICAgICk7XG4gICAgYXdhaXQgc2VsZi5fY29sbGVjdGlvbi5jcmVhdGVDYXBwZWRDb2xsZWN0aW9uQXN5bmMoYnl0ZVNpemUsIG1heERvY3VtZW50cyk7XG4gIH0sXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IFJldHVybnMgdGhlIFtgQ29sbGVjdGlvbmBdKGh0dHA6Ly9tb25nb2RiLmdpdGh1Yi5pby9ub2RlLW1vbmdvZGItbmF0aXZlLzMuMC9hcGkvQ29sbGVjdGlvbi5odG1sKSBvYmplY3QgY29ycmVzcG9uZGluZyB0byB0aGlzIGNvbGxlY3Rpb24gZnJvbSB0aGUgW25wbSBgbW9uZ29kYmAgZHJpdmVyIG1vZHVsZV0oaHR0cHM6Ly93d3cubnBtanMuY29tL3BhY2thZ2UvbW9uZ29kYikgd2hpY2ggaXMgd3JhcHBlZCBieSBgTW9uZ28uQ29sbGVjdGlvbmAuXG4gICAqIEBsb2N1cyBTZXJ2ZXJcbiAgICogQG1lbWJlcm9mIE1vbmdvLkNvbGxlY3Rpb25cbiAgICogQGluc3RhbmNlXG4gICAqL1xuICByYXdDb2xsZWN0aW9uKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoIXNlbGYuX2NvbGxlY3Rpb24ucmF3Q29sbGVjdGlvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYW4gb25seSBjYWxsIHJhd0NvbGxlY3Rpb24gb24gc2VydmVyIGNvbGxlY3Rpb25zJyk7XG4gICAgfVxuICAgIHJldHVybiBzZWxmLl9jb2xsZWN0aW9uLnJhd0NvbGxlY3Rpb24oKTtcbiAgfSxcblxuICAvKipcbiAgICogQHN1bW1hcnkgUmV0dXJucyB0aGUgW2BEYmBdKGh0dHA6Ly9tb25nb2RiLmdpdGh1Yi5pby9ub2RlLW1vbmdvZGItbmF0aXZlLzMuMC9hcGkvRGIuaHRtbCkgb2JqZWN0IGNvcnJlc3BvbmRpbmcgdG8gdGhpcyBjb2xsZWN0aW9uJ3MgZGF0YWJhc2UgY29ubmVjdGlvbiBmcm9tIHRoZSBbbnBtIGBtb25nb2RiYCBkcml2ZXIgbW9kdWxlXShodHRwczovL3d3dy5ucG1qcy5jb20vcGFja2FnZS9tb25nb2RiKSB3aGljaCBpcyB3cmFwcGVkIGJ5IGBNb25nby5Db2xsZWN0aW9uYC5cbiAgICogQGxvY3VzIFNlcnZlclxuICAgKiBAbWVtYmVyb2YgTW9uZ28uQ29sbGVjdGlvblxuICAgKiBAaW5zdGFuY2VcbiAgICovXG4gIHJhd0RhdGFiYXNlKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoIShzZWxmLl9kcml2ZXIubW9uZ28gJiYgc2VsZi5fZHJpdmVyLm1vbmdvLmRiKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYW4gb25seSBjYWxsIHJhd0RhdGFiYXNlIG9uIHNlcnZlciBjb2xsZWN0aW9ucycpO1xuICAgIH1cbiAgICByZXR1cm4gc2VsZi5fZHJpdmVyLm1vbmdvLmRiO1xuICB9LFxufSk7XG5cbk9iamVjdC5hc3NpZ24oTW9uZ28sIHtcbiAgLyoqXG4gICAqIEBzdW1tYXJ5IFJldHJpZXZlIGEgTWV0ZW9yIGNvbGxlY3Rpb24gaW5zdGFuY2UgYnkgbmFtZS4gT25seSBjb2xsZWN0aW9ucyBkZWZpbmVkIHdpdGggW2BuZXcgTW9uZ28uQ29sbGVjdGlvbiguLi4pYF0oI2NvbGxlY3Rpb25zKSBhcmUgYXZhaWxhYmxlIHdpdGggdGhpcyBtZXRob2QuIEZvciBwbGFpbiBNb25nb0RCIGNvbGxlY3Rpb25zLCB5b3UnbGwgd2FudCB0byBsb29rIGF0IFtgcmF3RGF0YWJhc2UoKWBdKCNNb25nby1Db2xsZWN0aW9uLXJhd0RhdGFiYXNlKS5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBtZW1iZXJvZiBNb25nb1xuICAgKiBAc3RhdGljXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIE5hbWUgb2YgeW91ciBjb2xsZWN0aW9uIGFzIGl0IHdhcyBkZWZpbmVkIHdpdGggYG5ldyBNb25nby5Db2xsZWN0aW9uKClgLlxuICAgKiBAcmV0dXJucyB7TW9uZ28uQ29sbGVjdGlvbiB8IHVuZGVmaW5lZH1cbiAgICovXG4gIGdldENvbGxlY3Rpb24obmFtZSkge1xuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9ucy5nZXQobmFtZSk7XG4gIH0sXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IEEgcmVjb3JkIG9mIGFsbCBkZWZpbmVkIE1vbmdvLkNvbGxlY3Rpb24gaW5zdGFuY2VzLCBpbmRleGVkIGJ5IGNvbGxlY3Rpb24gbmFtZS5cbiAgICogQHR5cGUge01hcDxzdHJpbmcsIE1vbmdvLkNvbGxlY3Rpb24+fVxuICAgKiBAbWVtYmVyb2YgTW9uZ29cbiAgICogQHByb3RlY3RlZFxuICAgKi9cbiAgX2NvbGxlY3Rpb25zOiBuZXcgTWFwKCksXG59KVxuXG5cblxuLyoqXG4gKiBAc3VtbWFyeSBDcmVhdGUgYSBNb25nby1zdHlsZSBgT2JqZWN0SURgLiAgSWYgeW91IGRvbid0IHNwZWNpZnkgYSBgaGV4U3RyaW5nYCwgdGhlIGBPYmplY3RJRGAgd2lsbCBiZSBnZW5lcmF0ZWQgcmFuZG9tbHkgKG5vdCB1c2luZyBNb25nb0RCJ3MgSUQgY29uc3RydWN0aW9uIHJ1bGVzKS5cbiAqIEBsb2N1cyBBbnl3aGVyZVxuICogQGNsYXNzXG4gKiBAcGFyYW0ge1N0cmluZ30gW2hleFN0cmluZ10gT3B0aW9uYWwuICBUaGUgMjQtY2hhcmFjdGVyIGhleGFkZWNpbWFsIGNvbnRlbnRzIG9mIHRoZSBPYmplY3RJRCB0byBjcmVhdGVcbiAqL1xuTW9uZ28uT2JqZWN0SUQgPSBNb25nb0lELk9iamVjdElEO1xuXG4vKipcbiAqIEBzdW1tYXJ5IFRvIGNyZWF0ZSBhIGN1cnNvciwgdXNlIGZpbmQuIFRvIGFjY2VzcyB0aGUgZG9jdW1lbnRzIGluIGEgY3Vyc29yLCB1c2UgZm9yRWFjaCwgbWFwLCBvciBmZXRjaC5cbiAqIEBjbGFzc1xuICogQGluc3RhbmNlTmFtZSBjdXJzb3JcbiAqL1xuTW9uZ28uQ3Vyc29yID0gTG9jYWxDb2xsZWN0aW9uLkN1cnNvcjtcblxuLyoqXG4gKiBAZGVwcmVjYXRlZCBpbiAwLjkuMVxuICovXG5Nb25nby5Db2xsZWN0aW9uLkN1cnNvciA9IE1vbmdvLkN1cnNvcjtcblxuLyoqXG4gKiBAZGVwcmVjYXRlZCBpbiAwLjkuMVxuICovXG5Nb25nby5Db2xsZWN0aW9uLk9iamVjdElEID0gTW9uZ28uT2JqZWN0SUQ7XG5cbi8qKlxuICogQGRlcHJlY2F0ZWQgaW4gMC45LjFcbiAqL1xuTWV0ZW9yLkNvbGxlY3Rpb24gPSBNb25nby5Db2xsZWN0aW9uO1xuXG5cbi8vIEFsbG93IGRlbnkgc3R1ZmYgaXMgbm93IGluIHRoZSBhbGxvdy1kZW55IHBhY2thZ2Vcbk9iamVjdC5hc3NpZ24oTW9uZ28uQ29sbGVjdGlvbi5wcm90b3R5cGUsIEFsbG93RGVueS5Db2xsZWN0aW9uUHJvdG90eXBlKTtcblxuLy8gU8OzIGFnb3JhIHF1ZSBNb25nby5Db2xsZWN0aW9uIGV4aXN0ZSwgYWRpY2lvbmFtb3MgbyBtw6l0b2RvIGFvIHByb3RvdHlwZVxuT2JqZWN0LmFzc2lnbihNb25nby5Db2xsZWN0aW9uLnByb3RvdHlwZSwgeyB3YXRjaENoYW5nZVN0cmVhbSB9KTtcblxuIiwiZXhwb3J0IGNvbnN0IElEX0dFTkVSQVRPUlMgPSB7XG4gIE1PTkdPKG5hbWUpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICBjb25zdCBzcmMgPSBuYW1lID8gRERQLnJhbmRvbVN0cmVhbSgnL2NvbGxlY3Rpb24vJyArIG5hbWUpIDogUmFuZG9tLmluc2VjdXJlO1xuICAgICAgcmV0dXJuIG5ldyBNb25nby5PYmplY3RJRChzcmMuaGV4U3RyaW5nKDI0KSk7XG4gICAgfVxuICB9LFxuICBTVFJJTkcobmFtZSkge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIGNvbnN0IHNyYyA9IG5hbWUgPyBERFAucmFuZG9tU3RyZWFtKCcvY29sbGVjdGlvbi8nICsgbmFtZSkgOiBSYW5kb20uaW5zZWN1cmU7XG4gICAgICByZXR1cm4gc3JjLmlkKCk7XG4gICAgfVxuICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gc2V0dXBDb25uZWN0aW9uKG5hbWUsIG9wdGlvbnMpIHtcbiAgaWYgKCFuYW1lIHx8IG9wdGlvbnMuY29ubmVjdGlvbiA9PT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gIGlmIChvcHRpb25zLmNvbm5lY3Rpb24pIHJldHVybiBvcHRpb25zLmNvbm5lY3Rpb247XG4gIHJldHVybiBNZXRlb3IuaXNDbGllbnQgPyBNZXRlb3IuY29ubmVjdGlvbiA6IE1ldGVvci5zZXJ2ZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXR1cERyaXZlcihuYW1lLCBjb25uZWN0aW9uLCBvcHRpb25zKSB7XG4gIGlmIChvcHRpb25zLl9kcml2ZXIpIHJldHVybiBvcHRpb25zLl9kcml2ZXI7XG5cbiAgaWYgKG5hbWUgJiZcbiAgICBjb25uZWN0aW9uID09PSBNZXRlb3Iuc2VydmVyICYmXG4gICAgdHlwZW9mIE1vbmdvSW50ZXJuYWxzICE9PSAndW5kZWZpbmVkJyAmJlxuICAgIE1vbmdvSW50ZXJuYWxzLmRlZmF1bHRSZW1vdGVDb2xsZWN0aW9uRHJpdmVyKSB7XG4gICAgcmV0dXJuIE1vbmdvSW50ZXJuYWxzLmRlZmF1bHRSZW1vdGVDb2xsZWN0aW9uRHJpdmVyKCk7XG4gIH1cblxuICBjb25zdCB7IExvY2FsQ29sbGVjdGlvbkRyaXZlciB9ID0gcmVxdWlyZSgnLi4vbG9jYWxfY29sbGVjdGlvbl9kcml2ZXIuanMnKTtcbiAgcmV0dXJuIExvY2FsQ29sbGVjdGlvbkRyaXZlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldHVwQXV0b3B1Ymxpc2goY29sbGVjdGlvbiwgbmFtZSwgb3B0aW9ucykge1xuICBpZiAoUGFja2FnZS5hdXRvcHVibGlzaCAmJlxuICAgICFvcHRpb25zLl9wcmV2ZW50QXV0b3B1Ymxpc2ggJiZcbiAgICBjb2xsZWN0aW9uLl9jb25uZWN0aW9uICYmXG4gICAgY29sbGVjdGlvbi5fY29ubmVjdGlvbi5wdWJsaXNoKSB7XG4gICAgY29sbGVjdGlvbi5fY29ubmVjdGlvbi5wdWJsaXNoKG51bGwsICgpID0+IGNvbGxlY3Rpb24uZmluZCgpLCB7XG4gICAgICBpc19hdXRvOiB0cnVlXG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldHVwTXV0YXRpb25NZXRob2RzKGNvbGxlY3Rpb24sIG5hbWUsIG9wdGlvbnMpIHtcbiAgaWYgKG9wdGlvbnMuZGVmaW5lTXV0YXRpb25NZXRob2RzID09PSBmYWxzZSkgcmV0dXJuO1xuXG4gIHRyeSB7XG4gICAgY29sbGVjdGlvbi5fZGVmaW5lTXV0YXRpb25NZXRob2RzKHtcbiAgICAgIHVzZUV4aXN0aW5nOiBvcHRpb25zLl9zdXBwcmVzc1NhbWVOYW1lRXJyb3IgPT09IHRydWVcbiAgICB9KTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBpZiAoZXJyb3IubWVzc2FnZSA9PT0gYEEgbWV0aG9kIG5hbWVkICcvJHtuYW1lfS9pbnNlcnRBc3luYycgaXMgYWxyZWFkeSBkZWZpbmVkYCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBUaGVyZSBpcyBhbHJlYWR5IGEgY29sbGVjdGlvbiBuYW1lZCBcIiR7bmFtZX1cImApO1xuICAgIH1cbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVDb2xsZWN0aW9uTmFtZShuYW1lKSB7XG4gIGlmICghbmFtZSAmJiBuYW1lICE9PSBudWxsKSB7XG4gICAgTWV0ZW9yLl9kZWJ1ZyhcbiAgICAgICdXYXJuaW5nOiBjcmVhdGluZyBhbm9ueW1vdXMgY29sbGVjdGlvbi4gSXQgd2lsbCBub3QgYmUgJyArXG4gICAgICAnc2F2ZWQgb3Igc3luY2hyb25pemVkIG92ZXIgdGhlIG5ldHdvcmsuIChQYXNzIG51bGwgZm9yICcgK1xuICAgICAgJ3RoZSBjb2xsZWN0aW9uIG5hbWUgdG8gdHVybiBvZmYgdGhpcyB3YXJuaW5nLiknXG4gICAgKTtcbiAgICBuYW1lID0gbnVsbDtcbiAgfVxuXG4gIGlmIChuYW1lICE9PSBudWxsICYmIHR5cGVvZiBuYW1lICE9PSAnc3RyaW5nJykge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICdGaXJzdCBhcmd1bWVudCB0byBuZXcgTW9uZ28uQ29sbGVjdGlvbiBtdXN0IGJlIGEgc3RyaW5nIG9yIG51bGwnXG4gICAgKTtcbiAgfVxuXG4gIHJldHVybiBuYW1lO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplT3B0aW9ucyhvcHRpb25zKSB7XG4gIGlmIChvcHRpb25zICYmIG9wdGlvbnMubWV0aG9kcykge1xuICAgIC8vIEJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IGhhY2sgd2l0aCBvcmlnaW5hbCBzaWduYXR1cmVcbiAgICBvcHRpb25zID0geyBjb25uZWN0aW9uOiBvcHRpb25zIH07XG4gIH1cbiAgLy8gQmFja3dhcmRzIGNvbXBhdGliaWxpdHk6IFwiY29ubmVjdGlvblwiIHVzZWQgdG8gYmUgY2FsbGVkIFwibWFuYWdlclwiLlxuICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLm1hbmFnZXIgJiYgIW9wdGlvbnMuY29ubmVjdGlvbikge1xuICAgIG9wdGlvbnMuY29ubmVjdGlvbiA9IG9wdGlvbnMubWFuYWdlcjtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY29ubmVjdGlvbjogdW5kZWZpbmVkLFxuICAgIGlkR2VuZXJhdGlvbjogJ1NUUklORycsXG4gICAgdHJhbnNmb3JtOiBudWxsLFxuICAgIF9kcml2ZXI6IHVuZGVmaW5lZCxcbiAgICBfcHJldmVudEF1dG9wdWJsaXNoOiBmYWxzZSxcbiAgICAuLi5vcHRpb25zLFxuICB9O1xufVxuIiwiZXhwb3J0IGNvbnN0IEFzeW5jTWV0aG9kcyA9IHtcbiAgLyoqXG4gICAqIEBzdW1tYXJ5IEZpbmRzIHRoZSBmaXJzdCBkb2N1bWVudCB0aGF0IG1hdGNoZXMgdGhlIHNlbGVjdG9yLCBhcyBvcmRlcmVkIGJ5IHNvcnQgYW5kIHNraXAgb3B0aW9ucy4gUmV0dXJucyBgdW5kZWZpbmVkYCBpZiBubyBtYXRjaGluZyBkb2N1bWVudCBpcyBmb3VuZC5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBtZXRob2QgZmluZE9uZUFzeW5jXG4gICAqIEBtZW1iZXJvZiBNb25nby5Db2xsZWN0aW9uXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge01vbmdvU2VsZWN0b3J9IFtzZWxlY3Rvcl0gQSBxdWVyeSBkZXNjcmliaW5nIHRoZSBkb2N1bWVudHMgdG8gZmluZFxuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdXG4gICAqIEBwYXJhbSB7TW9uZ29Tb3J0U3BlY2lmaWVyfSBvcHRpb25zLnNvcnQgU29ydCBvcmRlciAoZGVmYXVsdDogbmF0dXJhbCBvcmRlcilcbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9wdGlvbnMuc2tpcCBOdW1iZXIgb2YgcmVzdWx0cyB0byBza2lwIGF0IHRoZSBiZWdpbm5pbmdcbiAgICogQHBhcmFtIHtNb25nb0ZpZWxkU3BlY2lmaWVyfSBvcHRpb25zLmZpZWxkcyBEaWN0aW9uYXJ5IG9mIGZpZWxkcyB0byByZXR1cm4gb3IgZXhjbHVkZS5cbiAgICogQHBhcmFtIHtCb29sZWFufSBvcHRpb25zLnJlYWN0aXZlIChDbGllbnQgb25seSkgRGVmYXVsdCB0cnVlOyBwYXNzIGZhbHNlIHRvIGRpc2FibGUgcmVhY3Rpdml0eVxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBvcHRpb25zLnRyYW5zZm9ybSBPdmVycmlkZXMgYHRyYW5zZm9ybWAgb24gdGhlIFtgQ29sbGVjdGlvbmBdKCNjb2xsZWN0aW9ucykgZm9yIHRoaXMgY3Vyc29yLiAgUGFzcyBgbnVsbGAgdG8gZGlzYWJsZSB0cmFuc2Zvcm1hdGlvbi5cbiAgICogQHBhcmFtIHtTdHJpbmd9IG9wdGlvbnMucmVhZFByZWZlcmVuY2UgKFNlcnZlciBvbmx5KSBTcGVjaWZpZXMgYSBjdXN0b20gTW9uZ29EQiBbYHJlYWRQcmVmZXJlbmNlYF0oaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9jb3JlL3JlYWQtcHJlZmVyZW5jZSkgZm9yIGZldGNoaW5nIHRoZSBkb2N1bWVudC4gUG9zc2libGUgdmFsdWVzIGFyZSBgcHJpbWFyeWAsIGBwcmltYXJ5UHJlZmVycmVkYCwgYHNlY29uZGFyeWAsIGBzZWNvbmRhcnlQcmVmZXJyZWRgIGFuZCBgbmVhcmVzdGAuXG4gICAqIEByZXR1cm5zIHtPYmplY3R9XG4gICAqL1xuICBmaW5kT25lQXN5bmMoLi4uYXJncykge1xuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uLmZpbmRPbmVBc3luYyhcbiAgICAgIHRoaXMuX2dldEZpbmRTZWxlY3RvcihhcmdzKSxcbiAgICAgIHRoaXMuX2dldEZpbmRPcHRpb25zKGFyZ3MpXG4gICAgKTtcbiAgfSxcblxuICBfaW5zZXJ0QXN5bmMoZG9jLCBvcHRpb25zID0ge30pIHtcbiAgICAvLyBNYWtlIHN1cmUgd2Ugd2VyZSBwYXNzZWQgYSBkb2N1bWVudCB0byBpbnNlcnRcbiAgICBpZiAoIWRvYykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdpbnNlcnQgcmVxdWlyZXMgYW4gYXJndW1lbnQnKTtcbiAgICB9XG5cbiAgICAvLyBNYWtlIGEgc2hhbGxvdyBjbG9uZSBvZiB0aGUgZG9jdW1lbnQsIHByZXNlcnZpbmcgaXRzIHByb3RvdHlwZS5cbiAgICBkb2MgPSBPYmplY3QuY3JlYXRlKFxuICAgICAgT2JqZWN0LmdldFByb3RvdHlwZU9mKGRvYyksXG4gICAgICBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyhkb2MpXG4gICAgKTtcblxuICAgIGlmICgnX2lkJyBpbiBkb2MpIHtcbiAgICAgIGlmIChcbiAgICAgICAgIWRvYy5faWQgfHxcbiAgICAgICAgISh0eXBlb2YgZG9jLl9pZCA9PT0gJ3N0cmluZycgfHwgZG9jLl9pZCBpbnN0YW5jZW9mIE1vbmdvLk9iamVjdElEKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAnTWV0ZW9yIHJlcXVpcmVzIGRvY3VtZW50IF9pZCBmaWVsZHMgdG8gYmUgbm9uLWVtcHR5IHN0cmluZ3Mgb3IgT2JqZWN0SURzJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBsZXQgZ2VuZXJhdGVJZCA9IHRydWU7XG5cbiAgICAgIC8vIERvbid0IGdlbmVyYXRlIHRoZSBpZCBpZiB3ZSdyZSB0aGUgY2xpZW50IGFuZCB0aGUgJ291dGVybW9zdCcgY2FsbFxuICAgICAgLy8gVGhpcyBvcHRpbWl6YXRpb24gc2F2ZXMgdXMgcGFzc2luZyBib3RoIHRoZSByYW5kb21TZWVkIGFuZCB0aGUgaWRcbiAgICAgIC8vIFBhc3NpbmcgYm90aCBpcyByZWR1bmRhbnQuXG4gICAgICBpZiAodGhpcy5faXNSZW1vdGVDb2xsZWN0aW9uKCkpIHtcbiAgICAgICAgY29uc3QgZW5jbG9zaW5nID0gRERQLl9DdXJyZW50TWV0aG9kSW52b2NhdGlvbi5nZXQoKTtcbiAgICAgICAgaWYgKCFlbmNsb3NpbmcpIHtcbiAgICAgICAgICBnZW5lcmF0ZUlkID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGdlbmVyYXRlSWQpIHtcbiAgICAgICAgZG9jLl9pZCA9IHRoaXMuX21ha2VOZXdJRCgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIE9uIGluc2VydHMsIGFsd2F5cyByZXR1cm4gdGhlIGlkIHRoYXQgd2UgZ2VuZXJhdGVkOyBvbiBhbGwgb3RoZXJcbiAgICAvLyBvcGVyYXRpb25zLCBqdXN0IHJldHVybiB0aGUgcmVzdWx0IGZyb20gdGhlIGNvbGxlY3Rpb24uXG4gICAgdmFyIGNob29zZVJldHVyblZhbHVlRnJvbUNvbGxlY3Rpb25SZXN1bHQgPSBmdW5jdGlvbihyZXN1bHQpIHtcbiAgICAgIGlmIChNZXRlb3IuX2lzUHJvbWlzZShyZXN1bHQpKSByZXR1cm4gcmVzdWx0O1xuXG4gICAgICBpZiAoZG9jLl9pZCkge1xuICAgICAgICByZXR1cm4gZG9jLl9pZDtcbiAgICAgIH1cblxuICAgICAgLy8gWFhYIHdoYXQgaXMgdGhpcyBmb3I/P1xuICAgICAgLy8gSXQncyBzb21lIGl0ZXJhY3Rpb24gYmV0d2VlbiB0aGUgY2FsbGJhY2sgdG8gX2NhbGxNdXRhdG9yTWV0aG9kIGFuZFxuICAgICAgLy8gdGhlIHJldHVybiB2YWx1ZSBjb252ZXJzaW9uXG4gICAgICBkb2MuX2lkID0gcmVzdWx0O1xuXG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH07XG5cbiAgICBpZiAodGhpcy5faXNSZW1vdGVDb2xsZWN0aW9uKCkpIHtcbiAgICAgIGNvbnN0IHByb21pc2UgPSB0aGlzLl9jYWxsTXV0YXRvck1ldGhvZEFzeW5jKCdpbnNlcnRBc3luYycsIFtkb2NdLCBvcHRpb25zKTtcbiAgICAgIHByb21pc2UudGhlbihjaG9vc2VSZXR1cm5WYWx1ZUZyb21Db2xsZWN0aW9uUmVzdWx0KTtcbiAgICAgIHByb21pc2Uuc3R1YlByb21pc2UgPSBwcm9taXNlLnN0dWJQcm9taXNlLnRoZW4oY2hvb3NlUmV0dXJuVmFsdWVGcm9tQ29sbGVjdGlvblJlc3VsdCk7XG4gICAgICBwcm9taXNlLnNlcnZlclByb21pc2UgPSBwcm9taXNlLnNlcnZlclByb21pc2UudGhlbihjaG9vc2VSZXR1cm5WYWx1ZUZyb21Db2xsZWN0aW9uUmVzdWx0KTtcbiAgICAgIHJldHVybiBwcm9taXNlO1xuICAgIH1cblxuICAgIC8vIGl0J3MgbXkgY29sbGVjdGlvbi4gIGRlc2NlbmQgaW50byB0aGUgY29sbGVjdGlvbiBvYmplY3RcbiAgICAvLyBhbmQgcHJvcGFnYXRlIGFueSBleGNlcHRpb24uXG4gICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb24uaW5zZXJ0QXN5bmMoZG9jKVxuICAgICAgLnRoZW4oY2hvb3NlUmV0dXJuVmFsdWVGcm9tQ29sbGVjdGlvblJlc3VsdCk7XG4gIH0sXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IEluc2VydCBhIGRvY3VtZW50IGluIHRoZSBjb2xsZWN0aW9uLiAgUmV0dXJucyBhIHByb21pc2UgdGhhdCB3aWxsIHJldHVybiB0aGUgZG9jdW1lbnQncyB1bmlxdWUgX2lkIHdoZW4gc29sdmVkLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQG1ldGhvZCAgaW5zZXJ0XG4gICAqIEBtZW1iZXJvZiBNb25nby5Db2xsZWN0aW9uXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge09iamVjdH0gZG9jIFRoZSBkb2N1bWVudCB0byBpbnNlcnQuIE1heSBub3QgeWV0IGhhdmUgYW4gX2lkIGF0dHJpYnV0ZSwgaW4gd2hpY2ggY2FzZSBNZXRlb3Igd2lsbCBnZW5lcmF0ZSBvbmUgZm9yIHlvdS5cbiAgICovXG4gIGluc2VydEFzeW5jKGRvYywgb3B0aW9ucykge1xuICAgIHJldHVybiB0aGlzLl9pbnNlcnRBc3luYyhkb2MsIG9wdGlvbnMpO1xuICB9LFxuXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IE1vZGlmeSBvbmUgb3IgbW9yZSBkb2N1bWVudHMgaW4gdGhlIGNvbGxlY3Rpb24uIFJldHVybnMgdGhlIG51bWJlciBvZiBtYXRjaGVkIGRvY3VtZW50cy5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBtZXRob2QgdXBkYXRlXG4gICAqIEBtZW1iZXJvZiBNb25nby5Db2xsZWN0aW9uXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge01vbmdvU2VsZWN0b3J9IHNlbGVjdG9yIFNwZWNpZmllcyB3aGljaCBkb2N1bWVudHMgdG8gbW9kaWZ5XG4gICAqIEBwYXJhbSB7TW9uZ29Nb2RpZmllcn0gbW9kaWZpZXIgU3BlY2lmaWVzIGhvdyB0byBtb2RpZnkgdGhlIGRvY3VtZW50c1xuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0aW9ucy5tdWx0aSBUcnVlIHRvIG1vZGlmeSBhbGwgbWF0Y2hpbmcgZG9jdW1lbnRzOyBmYWxzZSB0byBvbmx5IG1vZGlmeSBvbmUgb2YgdGhlIG1hdGNoaW5nIGRvY3VtZW50cyAodGhlIGRlZmF1bHQpLlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMudXBzZXJ0IFRydWUgdG8gaW5zZXJ0IGEgZG9jdW1lbnQgaWYgbm8gbWF0Y2hpbmcgZG9jdW1lbnRzIGFyZSBmb3VuZC5cbiAgICogQHBhcmFtIHtBcnJheX0gb3B0aW9ucy5hcnJheUZpbHRlcnMgT3B0aW9uYWwuIFVzZWQgaW4gY29tYmluYXRpb24gd2l0aCBNb25nb0RCIFtmaWx0ZXJlZCBwb3NpdGlvbmFsIG9wZXJhdG9yXShodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL3JlZmVyZW5jZS9vcGVyYXRvci91cGRhdGUvcG9zaXRpb25hbC1maWx0ZXJlZC8pIHRvIHNwZWNpZnkgd2hpY2ggZWxlbWVudHMgdG8gbW9kaWZ5IGluIGFuIGFycmF5IGZpZWxkLlxuICAgKi9cbiAgdXBkYXRlQXN5bmMoc2VsZWN0b3IsIG1vZGlmaWVyLCAuLi5vcHRpb25zQW5kQ2FsbGJhY2spIHtcblxuICAgIC8vIFdlJ3ZlIGFscmVhZHkgcG9wcGVkIG9mZiB0aGUgY2FsbGJhY2ssIHNvIHdlIGFyZSBsZWZ0IHdpdGggYW4gYXJyYXlcbiAgICAvLyBvZiBvbmUgb3IgemVybyBpdGVtc1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7IC4uLihvcHRpb25zQW5kQ2FsbGJhY2tbMF0gfHwgbnVsbCkgfTtcbiAgICBsZXQgaW5zZXJ0ZWRJZDtcbiAgICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLnVwc2VydCkge1xuICAgICAgLy8gc2V0IGBpbnNlcnRlZElkYCBpZiBhYnNlbnQuICBgaW5zZXJ0ZWRJZGAgaXMgYSBNZXRlb3IgZXh0ZW5zaW9uLlxuICAgICAgaWYgKG9wdGlvbnMuaW5zZXJ0ZWRJZCkge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgIShcbiAgICAgICAgICAgIHR5cGVvZiBvcHRpb25zLmluc2VydGVkSWQgPT09ICdzdHJpbmcnIHx8XG4gICAgICAgICAgICBvcHRpb25zLmluc2VydGVkSWQgaW5zdGFuY2VvZiBNb25nby5PYmplY3RJRFxuICAgICAgICAgIClcbiAgICAgICAgKVxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignaW5zZXJ0ZWRJZCBtdXN0IGJlIHN0cmluZyBvciBPYmplY3RJRCcpO1xuICAgICAgICBpbnNlcnRlZElkID0gb3B0aW9ucy5pbnNlcnRlZElkO1xuICAgICAgfSBlbHNlIGlmICghc2VsZWN0b3IgfHwgIXNlbGVjdG9yLl9pZCkge1xuICAgICAgICBpbnNlcnRlZElkID0gdGhpcy5fbWFrZU5ld0lEKCk7XG4gICAgICAgIG9wdGlvbnMuZ2VuZXJhdGVkSWQgPSB0cnVlO1xuICAgICAgICBvcHRpb25zLmluc2VydGVkSWQgPSBpbnNlcnRlZElkO1xuICAgICAgfVxuICAgIH1cblxuICAgIHNlbGVjdG9yID0gTW9uZ28uQ29sbGVjdGlvbi5fcmV3cml0ZVNlbGVjdG9yKHNlbGVjdG9yLCB7XG4gICAgICBmYWxsYmFja0lkOiBpbnNlcnRlZElkLFxuICAgIH0pO1xuXG4gICAgaWYgKHRoaXMuX2lzUmVtb3RlQ29sbGVjdGlvbigpKSB7XG4gICAgICBjb25zdCBhcmdzID0gW3NlbGVjdG9yLCBtb2RpZmllciwgb3B0aW9uc107XG5cbiAgICAgIHJldHVybiB0aGlzLl9jYWxsTXV0YXRvck1ldGhvZEFzeW5jKCd1cGRhdGVBc3luYycsIGFyZ3MsIG9wdGlvbnMpO1xuICAgIH1cblxuICAgIC8vIGl0J3MgbXkgY29sbGVjdGlvbi4gIGRlc2NlbmQgaW50byB0aGUgY29sbGVjdGlvbiBvYmplY3RcbiAgICAvLyBhbmQgcHJvcGFnYXRlIGFueSBleGNlcHRpb24uXG4gICAgLy8gSWYgdGhlIHVzZXIgcHJvdmlkZWQgYSBjYWxsYmFjayBhbmQgdGhlIGNvbGxlY3Rpb24gaW1wbGVtZW50cyB0aGlzXG4gICAgLy8gb3BlcmF0aW9uIGFzeW5jaHJvbm91c2x5LCB0aGVuIHF1ZXJ5UmV0IHdpbGwgYmUgdW5kZWZpbmVkLCBhbmQgdGhlXG4gICAgLy8gcmVzdWx0IHdpbGwgYmUgcmV0dXJuZWQgdGhyb3VnaCB0aGUgY2FsbGJhY2sgaW5zdGVhZC5cblxuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKFxuICAgICAgc2VsZWN0b3IsXG4gICAgICBtb2RpZmllcixcbiAgICAgIG9wdGlvbnNcbiAgICApO1xuICB9LFxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBBc3luY2hyb25vdXNseSByZW1vdmVzIGRvY3VtZW50cyBmcm9tIHRoZSBjb2xsZWN0aW9uLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQG1ldGhvZCByZW1vdmVcbiAgICogQG1lbWJlcm9mIE1vbmdvLkNvbGxlY3Rpb25cbiAgICogQGluc3RhbmNlXG4gICAqIEBwYXJhbSB7TW9uZ29TZWxlY3Rvcn0gc2VsZWN0b3IgU3BlY2lmaWVzIHdoaWNoIGRvY3VtZW50cyB0byByZW1vdmVcbiAgICovXG4gIHJlbW92ZUFzeW5jKHNlbGVjdG9yLCBvcHRpb25zID0ge30pIHtcbiAgICBzZWxlY3RvciA9IE1vbmdvLkNvbGxlY3Rpb24uX3Jld3JpdGVTZWxlY3RvcihzZWxlY3Rvcik7XG5cbiAgICBpZiAodGhpcy5faXNSZW1vdGVDb2xsZWN0aW9uKCkpIHtcbiAgICAgIHJldHVybiB0aGlzLl9jYWxsTXV0YXRvck1ldGhvZEFzeW5jKCdyZW1vdmVBc3luYycsIFtzZWxlY3Rvcl0sIG9wdGlvbnMpO1xuICAgIH1cblxuICAgIC8vIGl0J3MgbXkgY29sbGVjdGlvbi4gIGRlc2NlbmQgaW50byB0aGUgY29sbGVjdGlvbjEgb2JqZWN0XG4gICAgLy8gYW5kIHByb3BhZ2F0ZSBhbnkgZXhjZXB0aW9uLlxuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uLnJlbW92ZUFzeW5jKHNlbGVjdG9yKTtcbiAgfSxcblxuICAvKipcbiAgICogQHN1bW1hcnkgQXN5bmNocm9ub3VzbHkgbW9kaWZpZXMgb25lIG9yIG1vcmUgZG9jdW1lbnRzIGluIHRoZSBjb2xsZWN0aW9uLCBvciBpbnNlcnQgb25lIGlmIG5vIG1hdGNoaW5nIGRvY3VtZW50cyB3ZXJlIGZvdW5kLiBSZXR1cm5zIGFuIG9iamVjdCB3aXRoIGtleXMgYG51bWJlckFmZmVjdGVkYCAodGhlIG51bWJlciBvZiBkb2N1bWVudHMgbW9kaWZpZWQpICBhbmQgYGluc2VydGVkSWRgICh0aGUgdW5pcXVlIF9pZCBvZiB0aGUgZG9jdW1lbnQgdGhhdCB3YXMgaW5zZXJ0ZWQsIGlmIGFueSkuXG4gICAqIEBsb2N1cyBBbnl3aGVyZVxuICAgKiBAbWV0aG9kIHVwc2VydFxuICAgKiBAbWVtYmVyb2YgTW9uZ28uQ29sbGVjdGlvblxuICAgKiBAaW5zdGFuY2VcbiAgICogQHBhcmFtIHtNb25nb1NlbGVjdG9yfSBzZWxlY3RvciBTcGVjaWZpZXMgd2hpY2ggZG9jdW1lbnRzIHRvIG1vZGlmeVxuICAgKiBAcGFyYW0ge01vbmdvTW9kaWZpZXJ9IG1vZGlmaWVyIFNwZWNpZmllcyBob3cgdG8gbW9kaWZ5IHRoZSBkb2N1bWVudHNcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXVxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMubXVsdGkgVHJ1ZSB0byBtb2RpZnkgYWxsIG1hdGNoaW5nIGRvY3VtZW50czsgZmFsc2UgdG8gb25seSBtb2RpZnkgb25lIG9mIHRoZSBtYXRjaGluZyBkb2N1bWVudHMgKHRoZSBkZWZhdWx0KS5cbiAgICovXG4gIGFzeW5jIHVwc2VydEFzeW5jKHNlbGVjdG9yLCBtb2RpZmllciwgb3B0aW9ucykge1xuICAgIHJldHVybiB0aGlzLnVwZGF0ZUFzeW5jKFxuICAgICAgc2VsZWN0b3IsXG4gICAgICBtb2RpZmllcixcbiAgICAgIHtcbiAgICAgICAgLi4ub3B0aW9ucyxcbiAgICAgICAgX3JldHVybk9iamVjdDogdHJ1ZSxcbiAgICAgICAgdXBzZXJ0OiB0cnVlLFxuICAgICAgfSk7XG4gIH0sXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IEdldHMgdGhlIG51bWJlciBvZiBkb2N1bWVudHMgbWF0Y2hpbmcgdGhlIGZpbHRlci4gRm9yIGEgZmFzdCBjb3VudCBvZiB0aGUgdG90YWwgZG9jdW1lbnRzIGluIGEgY29sbGVjdGlvbiBzZWUgYGVzdGltYXRlZERvY3VtZW50Q291bnRgLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQG1ldGhvZCBjb3VudERvY3VtZW50c1xuICAgKiBAbWVtYmVyb2YgTW9uZ28uQ29sbGVjdGlvblxuICAgKiBAaW5zdGFuY2VcbiAgICogQHBhcmFtIHtNb25nb1NlbGVjdG9yfSBbc2VsZWN0b3JdIEEgcXVlcnkgZGVzY3JpYmluZyB0aGUgZG9jdW1lbnRzIHRvIGNvdW50XG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gQWxsIG9wdGlvbnMgYXJlIGxpc3RlZCBpbiBbTW9uZ29EQiBkb2N1bWVudGF0aW9uXShodHRwczovL21vbmdvZGIuZ2l0aHViLmlvL25vZGUtbW9uZ29kYi1uYXRpdmUvNC4xMS9pbnRlcmZhY2VzL0NvdW50RG9jdW1lbnRzT3B0aW9ucy5odG1sKS4gUGxlYXNlIG5vdGUgdGhhdCBub3QgYWxsIG9mIHRoZW0gYXJlIGF2YWlsYWJsZSBvbiB0aGUgY2xpZW50LlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxudW1iZXI+fVxuICAgKi9cbiAgY291bnREb2N1bWVudHMoLi4uYXJncykge1xuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uLmNvdW50RG9jdW1lbnRzKC4uLmFyZ3MpO1xuICB9LFxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBHZXRzIGFuIGVzdGltYXRlIG9mIHRoZSBjb3VudCBvZiBkb2N1bWVudHMgaW4gYSBjb2xsZWN0aW9uIHVzaW5nIGNvbGxlY3Rpb24gbWV0YWRhdGEuIEZvciBhbiBleGFjdCBjb3VudCBvZiB0aGUgZG9jdW1lbnRzIGluIGEgY29sbGVjdGlvbiBzZWUgYGNvdW50RG9jdW1lbnRzYC5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBtZXRob2QgZXN0aW1hdGVkRG9jdW1lbnRDb3VudFxuICAgKiBAbWVtYmVyb2YgTW9uZ28uQ29sbGVjdGlvblxuICAgKiBAaW5zdGFuY2VcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBBbGwgb3B0aW9ucyBhcmUgbGlzdGVkIGluIFtNb25nb0RCIGRvY3VtZW50YXRpb25dKGh0dHBzOi8vbW9uZ29kYi5naXRodWIuaW8vbm9kZS1tb25nb2RiLW5hdGl2ZS80LjExL2ludGVyZmFjZXMvRXN0aW1hdGVkRG9jdW1lbnRDb3VudE9wdGlvbnMuaHRtbCkuIFBsZWFzZSBub3RlIHRoYXQgbm90IGFsbCBvZiB0aGVtIGFyZSBhdmFpbGFibGUgb24gdGhlIGNsaWVudC5cbiAgICogQHJldHVybnMge1Byb21pc2U8bnVtYmVyPn1cbiAgICovXG4gIGVzdGltYXRlZERvY3VtZW50Q291bnQoLi4uYXJncykge1xuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uLmVzdGltYXRlZERvY3VtZW50Q291bnQoLi4uYXJncyk7XG4gIH0sXG59IiwiaW1wb3J0IHsgTG9nIH0gZnJvbSAnbWV0ZW9yL2xvZ2dpbmcnO1xuXG5leHBvcnQgY29uc3QgSW5kZXhNZXRob2RzID0ge1xuICAvLyBXZSdsbCBhY3R1YWxseSBkZXNpZ24gYW4gaW5kZXggQVBJIGxhdGVyLiBGb3Igbm93LCB3ZSBqdXN0IHBhc3MgdGhyb3VnaCB0b1xuICAvLyBNb25nbydzLCBidXQgbWFrZSBpdCBzeW5jaHJvbm91cy5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IEFzeW5jaHJvbm91c2x5IGNyZWF0ZXMgdGhlIHNwZWNpZmllZCBpbmRleCBvbiB0aGUgY29sbGVjdGlvbi5cbiAgICogQGxvY3VzIHNlcnZlclxuICAgKiBAbWV0aG9kIGVuc3VyZUluZGV4QXN5bmNcbiAgICogQGRlcHJlY2F0ZWQgaW4gMy4wXG4gICAqIEBtZW1iZXJvZiBNb25nby5Db2xsZWN0aW9uXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge09iamVjdH0gaW5kZXggQSBkb2N1bWVudCB0aGF0IGNvbnRhaW5zIHRoZSBmaWVsZCBhbmQgdmFsdWUgcGFpcnMgd2hlcmUgdGhlIGZpZWxkIGlzIHRoZSBpbmRleCBrZXkgYW5kIHRoZSB2YWx1ZSBkZXNjcmliZXMgdGhlIHR5cGUgb2YgaW5kZXggZm9yIHRoYXQgZmllbGQuIEZvciBhbiBhc2NlbmRpbmcgaW5kZXggb24gYSBmaWVsZCwgc3BlY2lmeSBhIHZhbHVlIG9mIGAxYDsgZm9yIGRlc2NlbmRpbmcgaW5kZXgsIHNwZWNpZnkgYSB2YWx1ZSBvZiBgLTFgLiBVc2UgYHRleHRgIGZvciB0ZXh0IGluZGV4ZXMuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gQWxsIG9wdGlvbnMgYXJlIGxpc3RlZCBpbiBbTW9uZ29EQiBkb2N1bWVudGF0aW9uXShodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL3JlZmVyZW5jZS9tZXRob2QvZGIuY29sbGVjdGlvbi5jcmVhdGVJbmRleC8jb3B0aW9ucylcbiAgICogQHBhcmFtIHtTdHJpbmd9IG9wdGlvbnMubmFtZSBOYW1lIG9mIHRoZSBpbmRleFxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMudW5pcXVlIERlZmluZSB0aGF0IHRoZSBpbmRleCB2YWx1ZXMgbXVzdCBiZSB1bmlxdWUsIG1vcmUgYXQgW01vbmdvREIgZG9jdW1lbnRhdGlvbl0oaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9jb3JlL2luZGV4LXVuaXF1ZS8pXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0aW9ucy5zcGFyc2UgRGVmaW5lIHRoYXQgdGhlIGluZGV4IGlzIHNwYXJzZSwgbW9yZSBhdCBbTW9uZ29EQiBkb2N1bWVudGF0aW9uXShodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL2NvcmUvaW5kZXgtc3BhcnNlLylcbiAgICovXG4gIGFzeW5jIGVuc3VyZUluZGV4QXN5bmMoaW5kZXgsIG9wdGlvbnMpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKCFzZWxmLl9jb2xsZWN0aW9uLmVuc3VyZUluZGV4QXN5bmMgfHwgIXNlbGYuX2NvbGxlY3Rpb24uY3JlYXRlSW5kZXhBc3luYylcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ2FuIG9ubHkgY2FsbCBjcmVhdGVJbmRleEFzeW5jIG9uIHNlcnZlciBjb2xsZWN0aW9ucycpO1xuICAgIGlmIChzZWxmLl9jb2xsZWN0aW9uLmNyZWF0ZUluZGV4QXN5bmMpIHtcbiAgICAgIGF3YWl0IHNlbGYuX2NvbGxlY3Rpb24uY3JlYXRlSW5kZXhBc3luYyhpbmRleCwgb3B0aW9ucyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIExvZy5kZWJ1ZyhgZW5zdXJlSW5kZXhBc3luYyBoYXMgYmVlbiBkZXByZWNhdGVkLCBwbGVhc2UgdXNlIHRoZSBuZXcgJ2NyZWF0ZUluZGV4QXN5bmMnIGluc3RlYWQkeyBvcHRpb25zPy5uYW1lID8gYCwgaW5kZXggbmFtZTogJHsgb3B0aW9ucy5uYW1lIH1gIDogYCwgaW5kZXg6ICR7IEpTT04uc3RyaW5naWZ5KGluZGV4KSB9YCB9YClcbiAgICAgIGF3YWl0IHNlbGYuX2NvbGxlY3Rpb24uZW5zdXJlSW5kZXhBc3luYyhpbmRleCwgb3B0aW9ucyk7XG4gICAgfVxuICB9LFxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBBc3luY2hyb25vdXNseSBjcmVhdGVzIHRoZSBzcGVjaWZpZWQgaW5kZXggb24gdGhlIGNvbGxlY3Rpb24uXG4gICAqIEBsb2N1cyBzZXJ2ZXJcbiAgICogQG1ldGhvZCBjcmVhdGVJbmRleEFzeW5jXG4gICAqIEBtZW1iZXJvZiBNb25nby5Db2xsZWN0aW9uXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge09iamVjdH0gaW5kZXggQSBkb2N1bWVudCB0aGF0IGNvbnRhaW5zIHRoZSBmaWVsZCBhbmQgdmFsdWUgcGFpcnMgd2hlcmUgdGhlIGZpZWxkIGlzIHRoZSBpbmRleCBrZXkgYW5kIHRoZSB2YWx1ZSBkZXNjcmliZXMgdGhlIHR5cGUgb2YgaW5kZXggZm9yIHRoYXQgZmllbGQuIEZvciBhbiBhc2NlbmRpbmcgaW5kZXggb24gYSBmaWVsZCwgc3BlY2lmeSBhIHZhbHVlIG9mIGAxYDsgZm9yIGRlc2NlbmRpbmcgaW5kZXgsIHNwZWNpZnkgYSB2YWx1ZSBvZiBgLTFgLiBVc2UgYHRleHRgIGZvciB0ZXh0IGluZGV4ZXMuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gQWxsIG9wdGlvbnMgYXJlIGxpc3RlZCBpbiBbTW9uZ29EQiBkb2N1bWVudGF0aW9uXShodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL3JlZmVyZW5jZS9tZXRob2QvZGIuY29sbGVjdGlvbi5jcmVhdGVJbmRleC8jb3B0aW9ucylcbiAgICogQHBhcmFtIHtTdHJpbmd9IG9wdGlvbnMubmFtZSBOYW1lIG9mIHRoZSBpbmRleFxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMudW5pcXVlIERlZmluZSB0aGF0IHRoZSBpbmRleCB2YWx1ZXMgbXVzdCBiZSB1bmlxdWUsIG1vcmUgYXQgW01vbmdvREIgZG9jdW1lbnRhdGlvbl0oaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9jb3JlL2luZGV4LXVuaXF1ZS8pXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0aW9ucy5zcGFyc2UgRGVmaW5lIHRoYXQgdGhlIGluZGV4IGlzIHNwYXJzZSwgbW9yZSBhdCBbTW9uZ29EQiBkb2N1bWVudGF0aW9uXShodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL2NvcmUvaW5kZXgtc3BhcnNlLylcbiAgICovXG4gIGFzeW5jIGNyZWF0ZUluZGV4QXN5bmMoaW5kZXgsIG9wdGlvbnMpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKCFzZWxmLl9jb2xsZWN0aW9uLmNyZWF0ZUluZGV4QXN5bmMpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NhbiBvbmx5IGNhbGwgY3JlYXRlSW5kZXhBc3luYyBvbiBzZXJ2ZXIgY29sbGVjdGlvbnMnKTtcblxuICAgIHRyeSB7XG4gICAgICBhd2FpdCBzZWxmLl9jb2xsZWN0aW9uLmNyZWF0ZUluZGV4QXN5bmMoaW5kZXgsIG9wdGlvbnMpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmIChcbiAgICAgICAgZS5tZXNzYWdlLmluY2x1ZGVzKFxuICAgICAgICAgICdBbiBlcXVpdmFsZW50IGluZGV4IGFscmVhZHkgZXhpc3RzIHdpdGggdGhlIHNhbWUgbmFtZSBidXQgZGlmZmVyZW50IG9wdGlvbnMuJ1xuICAgICAgICApICYmXG4gICAgICAgIE1ldGVvci5zZXR0aW5ncz8ucGFja2FnZXM/Lm1vbmdvPy5yZUNyZWF0ZUluZGV4T25PcHRpb25NaXNtYXRjaFxuICAgICAgKSB7XG4gICAgICAgIExvZy5pbmZvKGBSZS1jcmVhdGluZyBpbmRleCAkeyBpbmRleCB9IGZvciAkeyBzZWxmLl9uYW1lIH0gZHVlIHRvIG9wdGlvbnMgbWlzbWF0Y2guYCk7XG4gICAgICAgIGF3YWl0IHNlbGYuX2NvbGxlY3Rpb24uZHJvcEluZGV4QXN5bmMoaW5kZXgpO1xuICAgICAgICBhd2FpdCBzZWxmLl9jb2xsZWN0aW9uLmNyZWF0ZUluZGV4QXN5bmMoaW5kZXgsIG9wdGlvbnMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihlKTtcbiAgICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcihgQW4gZXJyb3Igb2NjdXJyZWQgd2hlbiBjcmVhdGluZyBhbiBpbmRleCBmb3IgY29sbGVjdGlvbiBcIiR7IHNlbGYuX25hbWUgfTogJHsgZS5tZXNzYWdlIH1gKTtcbiAgICAgIH1cbiAgICB9XG4gIH0sXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IEFzeW5jaHJvbm91c2x5IGNyZWF0ZXMgdGhlIHNwZWNpZmllZCBpbmRleCBvbiB0aGUgY29sbGVjdGlvbi5cbiAgICogQGxvY3VzIHNlcnZlclxuICAgKiBAbWV0aG9kIGNyZWF0ZUluZGV4XG4gICAqIEBtZW1iZXJvZiBNb25nby5Db2xsZWN0aW9uXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge09iamVjdH0gaW5kZXggQSBkb2N1bWVudCB0aGF0IGNvbnRhaW5zIHRoZSBmaWVsZCBhbmQgdmFsdWUgcGFpcnMgd2hlcmUgdGhlIGZpZWxkIGlzIHRoZSBpbmRleCBrZXkgYW5kIHRoZSB2YWx1ZSBkZXNjcmliZXMgdGhlIHR5cGUgb2YgaW5kZXggZm9yIHRoYXQgZmllbGQuIEZvciBhbiBhc2NlbmRpbmcgaW5kZXggb24gYSBmaWVsZCwgc3BlY2lmeSBhIHZhbHVlIG9mIGAxYDsgZm9yIGRlc2NlbmRpbmcgaW5kZXgsIHNwZWNpZnkgYSB2YWx1ZSBvZiBgLTFgLiBVc2UgYHRleHRgIGZvciB0ZXh0IGluZGV4ZXMuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gQWxsIG9wdGlvbnMgYXJlIGxpc3RlZCBpbiBbTW9uZ29EQiBkb2N1bWVudGF0aW9uXShodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL3JlZmVyZW5jZS9tZXRob2QvZGIuY29sbGVjdGlvbi5jcmVhdGVJbmRleC8jb3B0aW9ucylcbiAgICogQHBhcmFtIHtTdHJpbmd9IG9wdGlvbnMubmFtZSBOYW1lIG9mIHRoZSBpbmRleFxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMudW5pcXVlIERlZmluZSB0aGF0IHRoZSBpbmRleCB2YWx1ZXMgbXVzdCBiZSB1bmlxdWUsIG1vcmUgYXQgW01vbmdvREIgZG9jdW1lbnRhdGlvbl0oaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9jb3JlL2luZGV4LXVuaXF1ZS8pXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0aW9ucy5zcGFyc2UgRGVmaW5lIHRoYXQgdGhlIGluZGV4IGlzIHNwYXJzZSwgbW9yZSBhdCBbTW9uZ29EQiBkb2N1bWVudGF0aW9uXShodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL2NvcmUvaW5kZXgtc3BhcnNlLylcbiAgICovXG4gIGNyZWF0ZUluZGV4KGluZGV4LCBvcHRpb25zKXtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVJbmRleEFzeW5jKGluZGV4LCBvcHRpb25zKTtcbiAgfSxcblxuICBhc3luYyBkcm9wSW5kZXhBc3luYyhpbmRleCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoIXNlbGYuX2NvbGxlY3Rpb24uZHJvcEluZGV4QXN5bmMpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NhbiBvbmx5IGNhbGwgZHJvcEluZGV4QXN5bmMgb24gc2VydmVyIGNvbGxlY3Rpb25zJyk7XG4gICAgYXdhaXQgc2VsZi5fY29sbGVjdGlvbi5kcm9wSW5kZXhBc3luYyhpbmRleCk7XG4gIH0sXG59XG4iLCJleHBvcnQgY29uc3QgUmVwbGljYXRpb25NZXRob2RzID0ge1xuICBhc3luYyBfbWF5YmVTZXRVcFJlcGxpY2F0aW9uKG5hbWUpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBpZiAoXG4gICAgICAhKFxuICAgICAgICBzZWxmLl9jb25uZWN0aW9uICYmXG4gICAgICAgIHNlbGYuX2Nvbm5lY3Rpb24ucmVnaXN0ZXJTdG9yZUNsaWVudCAmJlxuICAgICAgICBzZWxmLl9jb25uZWN0aW9uLnJlZ2lzdGVyU3RvcmVTZXJ2ZXJcbiAgICAgIClcbiAgICApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cblxuICAgIGNvbnN0IHdyYXBwZWRTdG9yZUNvbW1vbiA9IHtcbiAgICAgIC8vIENhbGxlZCBhcm91bmQgbWV0aG9kIHN0dWIgaW52b2NhdGlvbnMgdG8gY2FwdHVyZSB0aGUgb3JpZ2luYWwgdmVyc2lvbnNcbiAgICAgIC8vIG9mIG1vZGlmaWVkIGRvY3VtZW50cy5cbiAgICAgIHNhdmVPcmlnaW5hbHMoKSB7XG4gICAgICAgIHNlbGYuX2NvbGxlY3Rpb24uc2F2ZU9yaWdpbmFscygpO1xuICAgICAgfSxcbiAgICAgIHJldHJpZXZlT3JpZ2luYWxzKCkge1xuICAgICAgICByZXR1cm4gc2VsZi5fY29sbGVjdGlvbi5yZXRyaWV2ZU9yaWdpbmFscygpO1xuICAgICAgfSxcbiAgICAgIC8vIFRvIGJlIGFibGUgdG8gZ2V0IGJhY2sgdG8gdGhlIGNvbGxlY3Rpb24gZnJvbSB0aGUgc3RvcmUuXG4gICAgICBfZ2V0Q29sbGVjdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHNlbGY7XG4gICAgICB9LFxuICAgIH07XG4gICAgY29uc3Qgd3JhcHBlZFN0b3JlQ2xpZW50ID0ge1xuICAgICAgLy8gQ2FsbGVkIGF0IHRoZSBiZWdpbm5pbmcgb2YgYSBiYXRjaCBvZiB1cGRhdGVzLiBiYXRjaFNpemUgaXMgdGhlIG51bWJlclxuICAgICAgLy8gb2YgdXBkYXRlIGNhbGxzIHRvIGV4cGVjdC5cbiAgICAgIC8vXG4gICAgICAvLyBYWFggVGhpcyBpbnRlcmZhY2UgaXMgcHJldHR5IGphbmt5LiByZXNldCBwcm9iYWJseSBvdWdodCB0byBnbyBiYWNrIHRvXG4gICAgICAvLyBiZWluZyBpdHMgb3duIGZ1bmN0aW9uLCBhbmQgY2FsbGVycyBzaG91bGRuJ3QgaGF2ZSB0byBjYWxjdWxhdGVcbiAgICAgIC8vIGJhdGNoU2l6ZS4gVGhlIG9wdGltaXphdGlvbiBvZiBub3QgY2FsbGluZyBwYXVzZS9yZW1vdmUgc2hvdWxkIGJlXG4gICAgICAvLyBkZWxheWVkIHVudGlsIGxhdGVyOiB0aGUgZmlyc3QgY2FsbCB0byB1cGRhdGUoKSBzaG91bGQgYnVmZmVyIGl0c1xuICAgICAgLy8gbWVzc2FnZSwgYW5kIHRoZW4gd2UgY2FuIGVpdGhlciBkaXJlY3RseSBhcHBseSBpdCBhdCBlbmRVcGRhdGUgdGltZSBpZlxuICAgICAgLy8gaXQgd2FzIHRoZSBvbmx5IHVwZGF0ZSwgb3IgZG8gcGF1c2VPYnNlcnZlcnMvYXBwbHkvYXBwbHkgYXQgdGhlIG5leHRcbiAgICAgIC8vIHVwZGF0ZSgpIGlmIHRoZXJlJ3MgYW5vdGhlciBvbmUuXG4gICAgICBhc3luYyBiZWdpblVwZGF0ZShiYXRjaFNpemUsIHJlc2V0KSB7XG4gICAgICAgIC8vIHBhdXNlIG9ic2VydmVycyBzbyB1c2VycyBkb24ndCBzZWUgZmxpY2tlciB3aGVuIHVwZGF0aW5nIHNldmVyYWxcbiAgICAgICAgLy8gb2JqZWN0cyBhdCBvbmNlIChpbmNsdWRpbmcgdGhlIHBvc3QtcmVjb25uZWN0IHJlc2V0LWFuZC1yZWFwcGx5XG4gICAgICAgIC8vIHN0YWdlKSwgYW5kIHNvIHRoYXQgYSByZS1zb3J0aW5nIG9mIGEgcXVlcnkgY2FuIHRha2UgYWR2YW50YWdlIG9mIHRoZVxuICAgICAgICAvLyBmdWxsIF9kaWZmUXVlcnkgbW92ZWQgY2FsY3VsYXRpb24gaW5zdGVhZCBvZiBhcHBseWluZyBjaGFuZ2Ugb25lIGF0IGFcbiAgICAgICAgLy8gdGltZS5cbiAgICAgICAgaWYgKGJhdGNoU2l6ZSA+IDEgfHwgcmVzZXQpIHNlbGYuX2NvbGxlY3Rpb24ucGF1c2VPYnNlcnZlcnMoKTtcblxuICAgICAgICBpZiAocmVzZXQpIGF3YWl0IHNlbGYuX2NvbGxlY3Rpb24ucmVtb3ZlKHt9KTtcbiAgICAgIH0sXG5cbiAgICAgIC8vIEFwcGx5IGFuIHVwZGF0ZS5cbiAgICAgIC8vIFhYWCBiZXR0ZXIgc3BlY2lmeSB0aGlzIGludGVyZmFjZSAobm90IGluIHRlcm1zIG9mIGEgd2lyZSBtZXNzYWdlKT9cbiAgICAgIHVwZGF0ZShtc2cpIHtcbiAgICAgICAgdmFyIG1vbmdvSWQgPSBNb25nb0lELmlkUGFyc2UobXNnLmlkKTtcbiAgICAgICAgdmFyIGRvYyA9IHNlbGYuX2NvbGxlY3Rpb24uX2RvY3MuZ2V0KG1vbmdvSWQpO1xuXG4gICAgICAgIC8vV2hlbiB0aGUgc2VydmVyJ3MgbWVyZ2Vib3ggaXMgZGlzYWJsZWQgZm9yIGEgY29sbGVjdGlvbiwgdGhlIGNsaWVudCBtdXN0IGdyYWNlZnVsbHkgaGFuZGxlIGl0IHdoZW46XG4gICAgICAgIC8vICpXZSByZWNlaXZlIGFuIGFkZGVkIG1lc3NhZ2UgZm9yIGEgZG9jdW1lbnQgdGhhdCBpcyBhbHJlYWR5IHRoZXJlLiBJbnN0ZWFkLCBpdCB3aWxsIGJlIGNoYW5nZWRcbiAgICAgICAgLy8gKldlIHJlZWl2ZSBhIGNoYW5nZSBtZXNzYWdlIGZvciBhIGRvY3VtZW50IHRoYXQgaXMgbm90IHRoZXJlLiBJbnN0ZWFkLCBpdCB3aWxsIGJlIGFkZGVkXG4gICAgICAgIC8vICpXZSByZWNlaXZlIGEgcmVtb3ZlZCBtZXNzc2FnZSBmb3IgYSBkb2N1bWVudCB0aGF0IGlzIG5vdCB0aGVyZS4gSW5zdGVhZCwgbm90aW5nIHdpbCBoYXBwZW4uXG5cbiAgICAgICAgLy9Db2RlIGlzIGRlcml2ZWQgZnJvbSBjbGllbnQtc2lkZSBjb2RlIG9yaWdpbmFsbHkgaW4gcGVlcmxpYnJhcnk6Y29udHJvbC1tZXJnZWJveFxuICAgICAgICAvL2h0dHBzOi8vZ2l0aHViLmNvbS9wZWVybGlicmFyeS9tZXRlb3ItY29udHJvbC1tZXJnZWJveC9ibG9iL21hc3Rlci9jbGllbnQuY29mZmVlXG5cbiAgICAgICAgLy9Gb3IgbW9yZSBpbmZvcm1hdGlvbiwgcmVmZXIgdG8gZGlzY3Vzc2lvbiBcIkluaXRpYWwgc3VwcG9ydCBmb3IgcHVibGljYXRpb24gc3RyYXRlZ2llcyBpbiBsaXZlZGF0YSBzZXJ2ZXJcIjpcbiAgICAgICAgLy9odHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9wdWxsLzExMTUxXG4gICAgICAgIGlmIChNZXRlb3IuaXNDbGllbnQpIHtcbiAgICAgICAgICBpZiAobXNnLm1zZyA9PT0gJ2FkZGVkJyAmJiBkb2MpIHtcbiAgICAgICAgICAgIG1zZy5tc2cgPSAnY2hhbmdlZCc7XG4gICAgICAgICAgfSBlbHNlIGlmIChtc2cubXNnID09PSAncmVtb3ZlZCcgJiYgIWRvYykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH0gZWxzZSBpZiAobXNnLm1zZyA9PT0gJ2NoYW5nZWQnICYmICFkb2MpIHtcbiAgICAgICAgICAgIG1zZy5tc2cgPSAnYWRkZWQnO1xuICAgICAgICAgICAgY29uc3QgX3JlZiA9IG1zZy5maWVsZHM7XG4gICAgICAgICAgICBmb3IgKGxldCBmaWVsZCBpbiBfcmVmKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gX3JlZltmaWVsZF07XG4gICAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gdm9pZCAwKSB7XG4gICAgICAgICAgICAgICAgZGVsZXRlIG1zZy5maWVsZHNbZmllbGRdO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIElzIHRoaXMgYSBcInJlcGxhY2UgdGhlIHdob2xlIGRvY1wiIG1lc3NhZ2UgY29taW5nIGZyb20gdGhlIHF1aWVzY2VuY2VcbiAgICAgICAgLy8gb2YgbWV0aG9kIHdyaXRlcyB0byBhbiBvYmplY3Q/IChOb3RlIHRoYXQgJ3VuZGVmaW5lZCcgaXMgYSB2YWxpZFxuICAgICAgICAvLyB2YWx1ZSBtZWFuaW5nIFwicmVtb3ZlIGl0XCIuKVxuICAgICAgICBpZiAobXNnLm1zZyA9PT0gJ3JlcGxhY2UnKSB7XG4gICAgICAgICAgdmFyIHJlcGxhY2UgPSBtc2cucmVwbGFjZTtcbiAgICAgICAgICBpZiAoIXJlcGxhY2UpIHtcbiAgICAgICAgICAgIGlmIChkb2MpIHNlbGYuX2NvbGxlY3Rpb24ucmVtb3ZlKG1vbmdvSWQpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoIWRvYykge1xuICAgICAgICAgICAgc2VsZi5fY29sbGVjdGlvbi5pbnNlcnQocmVwbGFjZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIFhYWCBjaGVjayB0aGF0IHJlcGxhY2UgaGFzIG5vICQgb3BzXG4gICAgICAgICAgICBzZWxmLl9jb2xsZWN0aW9uLnVwZGF0ZShtb25nb0lkLCByZXBsYWNlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IGVsc2UgaWYgKG1zZy5tc2cgPT09ICdhZGRlZCcpIHtcbiAgICAgICAgICBpZiAoZG9jKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICdFeHBlY3RlZCBub3QgdG8gZmluZCBhIGRvY3VtZW50IGFscmVhZHkgcHJlc2VudCBmb3IgYW4gYWRkJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgc2VsZi5fY29sbGVjdGlvbi5pbnNlcnQoeyBfaWQ6IG1vbmdvSWQsIC4uLm1zZy5maWVsZHMgfSk7XG4gICAgICAgIH0gZWxzZSBpZiAobXNnLm1zZyA9PT0gJ3JlbW92ZWQnKSB7XG4gICAgICAgICAgaWYgKCFkb2MpXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICdFeHBlY3RlZCB0byBmaW5kIGEgZG9jdW1lbnQgYWxyZWFkeSBwcmVzZW50IGZvciByZW1vdmVkJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICBzZWxmLl9jb2xsZWN0aW9uLnJlbW92ZShtb25nb0lkKTtcbiAgICAgICAgfSBlbHNlIGlmIChtc2cubXNnID09PSAnY2hhbmdlZCcpIHtcbiAgICAgICAgICBpZiAoIWRvYykgdGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCB0byBmaW5kIGEgZG9jdW1lbnQgdG8gY2hhbmdlJyk7XG4gICAgICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKG1zZy5maWVsZHMpO1xuICAgICAgICAgIGlmIChrZXlzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHZhciBtb2RpZmllciA9IHt9O1xuICAgICAgICAgICAga2V5cy5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gbXNnLmZpZWxkc1trZXldO1xuICAgICAgICAgICAgICBpZiAoRUpTT04uZXF1YWxzKGRvY1trZXldLCB2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICBpZiAoIW1vZGlmaWVyLiR1bnNldCkge1xuICAgICAgICAgICAgICAgICAgbW9kaWZpZXIuJHVuc2V0ID0ge307XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG1vZGlmaWVyLiR1bnNldFtrZXldID0gMTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoIW1vZGlmaWVyLiRzZXQpIHtcbiAgICAgICAgICAgICAgICAgIG1vZGlmaWVyLiRzZXQgPSB7fTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbW9kaWZpZXIuJHNldFtrZXldID0gdmFsdWU7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKE9iamVjdC5rZXlzKG1vZGlmaWVyKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHNlbGYuX2NvbGxlY3Rpb24udXBkYXRlKG1vbmdvSWQsIG1vZGlmaWVyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSSBkb24ndCBrbm93IGhvdyB0byBkZWFsIHdpdGggdGhpcyBtZXNzYWdlXCIpO1xuICAgICAgICB9XG4gICAgICB9LFxuXG4gICAgICAvLyBDYWxsZWQgYXQgdGhlIGVuZCBvZiBhIGJhdGNoIG9mIHVwZGF0ZXMubGl2ZWRhdGFfY29ubmVjdGlvbi5qczoxMjg3XG4gICAgICBlbmRVcGRhdGUoKSB7XG4gICAgICAgIHNlbGYuX2NvbGxlY3Rpb24ucmVzdW1lT2JzZXJ2ZXJzQ2xpZW50KCk7XG4gICAgICB9LFxuXG4gICAgICAvLyBVc2VkIHRvIHByZXNlcnZlIGN1cnJlbnQgdmVyc2lvbnMgb2YgZG9jdW1lbnRzIGFjcm9zcyBhIHN0b3JlIHJlc2V0LlxuICAgICAgZ2V0RG9jKGlkKSB7XG4gICAgICAgIHJldHVybiBzZWxmLmZpbmRPbmUoaWQpO1xuICAgICAgfSxcblxuICAgICAgLi4ud3JhcHBlZFN0b3JlQ29tbW9uLFxuICAgIH07XG4gICAgY29uc3Qgd3JhcHBlZFN0b3JlU2VydmVyID0ge1xuICAgICAgYXN5bmMgYmVnaW5VcGRhdGUoYmF0Y2hTaXplLCByZXNldCkge1xuICAgICAgICBpZiAoYmF0Y2hTaXplID4gMSB8fCByZXNldCkgc2VsZi5fY29sbGVjdGlvbi5wYXVzZU9ic2VydmVycygpO1xuXG4gICAgICAgIGlmIChyZXNldCkgYXdhaXQgc2VsZi5fY29sbGVjdGlvbi5yZW1vdmVBc3luYyh7fSk7XG4gICAgICB9LFxuXG4gICAgICBhc3luYyB1cGRhdGUobXNnKSB7XG4gICAgICAgIHZhciBtb25nb0lkID0gTW9uZ29JRC5pZFBhcnNlKG1zZy5pZCk7XG4gICAgICAgIHZhciBkb2MgPSBzZWxmLl9jb2xsZWN0aW9uLl9kb2NzLmdldChtb25nb0lkKTtcblxuICAgICAgICAvLyBJcyB0aGlzIGEgXCJyZXBsYWNlIHRoZSB3aG9sZSBkb2NcIiBtZXNzYWdlIGNvbWluZyBmcm9tIHRoZSBxdWllc2NlbmNlXG4gICAgICAgIC8vIG9mIG1ldGhvZCB3cml0ZXMgdG8gYW4gb2JqZWN0PyAoTm90ZSB0aGF0ICd1bmRlZmluZWQnIGlzIGEgdmFsaWRcbiAgICAgICAgLy8gdmFsdWUgbWVhbmluZyBcInJlbW92ZSBpdFwiLilcbiAgICAgICAgaWYgKG1zZy5tc2cgPT09ICdyZXBsYWNlJykge1xuICAgICAgICAgIHZhciByZXBsYWNlID0gbXNnLnJlcGxhY2U7XG4gICAgICAgICAgaWYgKCFyZXBsYWNlKSB7XG4gICAgICAgICAgICBpZiAoZG9jKSBhd2FpdCBzZWxmLl9jb2xsZWN0aW9uLnJlbW92ZUFzeW5jKG1vbmdvSWQpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoIWRvYykge1xuICAgICAgICAgICAgYXdhaXQgc2VsZi5fY29sbGVjdGlvbi5pbnNlcnRBc3luYyhyZXBsYWNlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gWFhYIGNoZWNrIHRoYXQgcmVwbGFjZSBoYXMgbm8gJCBvcHNcbiAgICAgICAgICAgIGF3YWl0IHNlbGYuX2NvbGxlY3Rpb24udXBkYXRlQXN5bmMobW9uZ29JZCwgcmVwbGFjZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIGlmIChtc2cubXNnID09PSAnYWRkZWQnKSB7XG4gICAgICAgICAgaWYgKGRvYykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAnRXhwZWN0ZWQgbm90IHRvIGZpbmQgYSBkb2N1bWVudCBhbHJlYWR5IHByZXNlbnQgZm9yIGFuIGFkZCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGF3YWl0IHNlbGYuX2NvbGxlY3Rpb24uaW5zZXJ0QXN5bmMoeyBfaWQ6IG1vbmdvSWQsIC4uLm1zZy5maWVsZHMgfSk7XG4gICAgICAgIH0gZWxzZSBpZiAobXNnLm1zZyA9PT0gJ3JlbW92ZWQnKSB7XG4gICAgICAgICAgaWYgKCFkb2MpXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICdFeHBlY3RlZCB0byBmaW5kIGEgZG9jdW1lbnQgYWxyZWFkeSBwcmVzZW50IGZvciByZW1vdmVkJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICBhd2FpdCBzZWxmLl9jb2xsZWN0aW9uLnJlbW92ZUFzeW5jKG1vbmdvSWQpO1xuICAgICAgICB9IGVsc2UgaWYgKG1zZy5tc2cgPT09ICdjaGFuZ2VkJykge1xuICAgICAgICAgIGlmICghZG9jKSB0aHJvdyBuZXcgRXJyb3IoJ0V4cGVjdGVkIHRvIGZpbmQgYSBkb2N1bWVudCB0byBjaGFuZ2UnKTtcbiAgICAgICAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMobXNnLmZpZWxkcyk7XG4gICAgICAgICAgaWYgKGtleXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgdmFyIG1vZGlmaWVyID0ge307XG4gICAgICAgICAgICBrZXlzLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBtc2cuZmllbGRzW2tleV07XG4gICAgICAgICAgICAgIGlmIChFSlNPTi5lcXVhbHMoZG9jW2tleV0sIHZhbHVlKSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICAgIGlmICghbW9kaWZpZXIuJHVuc2V0KSB7XG4gICAgICAgICAgICAgICAgICBtb2RpZmllci4kdW5zZXQgPSB7fTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbW9kaWZpZXIuJHVuc2V0W2tleV0gPSAxO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmICghbW9kaWZpZXIuJHNldCkge1xuICAgICAgICAgICAgICAgICAgbW9kaWZpZXIuJHNldCA9IHt9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBtb2RpZmllci4kc2V0W2tleV0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoT2JqZWN0LmtleXMobW9kaWZpZXIpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgYXdhaXQgc2VsZi5fY29sbGVjdGlvbi51cGRhdGVBc3luYyhtb25nb0lkLCBtb2RpZmllcik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkkgZG9uJ3Qga25vdyBob3cgdG8gZGVhbCB3aXRoIHRoaXMgbWVzc2FnZVwiKTtcbiAgICAgICAgfVxuICAgICAgfSxcblxuICAgICAgLy8gQ2FsbGVkIGF0IHRoZSBlbmQgb2YgYSBiYXRjaCBvZiB1cGRhdGVzLlxuICAgICAgYXN5bmMgZW5kVXBkYXRlKCkge1xuICAgICAgICBhd2FpdCBzZWxmLl9jb2xsZWN0aW9uLnJlc3VtZU9ic2VydmVyc1NlcnZlcigpO1xuICAgICAgfSxcblxuICAgICAgLy8gVXNlZCB0byBwcmVzZXJ2ZSBjdXJyZW50IHZlcnNpb25zIG9mIGRvY3VtZW50cyBhY3Jvc3MgYSBzdG9yZSByZXNldC5cbiAgICAgIGFzeW5jIGdldERvYyhpZCkge1xuICAgICAgICByZXR1cm4gc2VsZi5maW5kT25lQXN5bmMoaWQpO1xuICAgICAgfSxcbiAgICAgIC4uLndyYXBwZWRTdG9yZUNvbW1vbixcbiAgICB9O1xuXG5cbiAgICAvLyBPSywgd2UncmUgZ29pbmcgdG8gYmUgYSBzbGF2ZSwgcmVwbGljYXRpbmcgc29tZSByZW1vdGVcbiAgICAvLyBkYXRhYmFzZSwgZXhjZXB0IHBvc3NpYmx5IHdpdGggc29tZSB0ZW1wb3JhcnkgZGl2ZXJnZW5jZSB3aGlsZVxuICAgIC8vIHdlIGhhdmUgdW5hY2tub3dsZWRnZWQgUlBDJ3MuXG4gICAgbGV0IHJlZ2lzdGVyU3RvcmVSZXN1bHQ7XG4gICAgaWYgKE1ldGVvci5pc0NsaWVudCkge1xuICAgICAgcmVnaXN0ZXJTdG9yZVJlc3VsdCA9IHNlbGYuX2Nvbm5lY3Rpb24ucmVnaXN0ZXJTdG9yZUNsaWVudChcbiAgICAgICAgbmFtZSxcbiAgICAgICAgd3JhcHBlZFN0b3JlQ2xpZW50XG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICByZWdpc3RlclN0b3JlUmVzdWx0ID0gc2VsZi5fY29ubmVjdGlvbi5yZWdpc3RlclN0b3JlU2VydmVyKFxuICAgICAgICBuYW1lLFxuICAgICAgICB3cmFwcGVkU3RvcmVTZXJ2ZXJcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgbWVzc2FnZSA9IGBUaGVyZSBpcyBhbHJlYWR5IGEgY29sbGVjdGlvbiBuYW1lZCBcIiR7bmFtZX1cImA7XG4gICAgY29uc3QgbG9nV2FybiA9ICgpID0+IHtcbiAgICAgIGNvbnNvbGUud2FybiA/IGNvbnNvbGUud2FybihtZXNzYWdlKSA6IGNvbnNvbGUubG9nKG1lc3NhZ2UpO1xuICAgIH07XG5cbiAgICBpZiAoIXJlZ2lzdGVyU3RvcmVSZXN1bHQpIHtcbiAgICAgIHJldHVybiBsb2dXYXJuKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZ2lzdGVyU3RvcmVSZXN1bHQ/LnRoZW4/LihvayA9PiB7XG4gICAgICBpZiAoIW9rKSB7XG4gICAgICAgIGxvZ1dhcm4oKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSxcbn0iLCJleHBvcnQgY29uc3QgU3luY01ldGhvZHMgPSB7XG4gIC8qKlxuICAgKiBAc3VtbWFyeSBGaW5kIHRoZSBkb2N1bWVudHMgaW4gYSBjb2xsZWN0aW9uIHRoYXQgbWF0Y2ggdGhlIHNlbGVjdG9yLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQG1ldGhvZCBmaW5kXG4gICAqIEBtZW1iZXJvZiBNb25nby5Db2xsZWN0aW9uXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge01vbmdvU2VsZWN0b3J9IFtzZWxlY3Rvcl0gQSBxdWVyeSBkZXNjcmliaW5nIHRoZSBkb2N1bWVudHMgdG8gZmluZFxuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdXG4gICAqIEBwYXJhbSB7TW9uZ29Tb3J0U3BlY2lmaWVyfSBvcHRpb25zLnNvcnQgU29ydCBvcmRlciAoZGVmYXVsdDogbmF0dXJhbCBvcmRlcilcbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9wdGlvbnMuc2tpcCBOdW1iZXIgb2YgcmVzdWx0cyB0byBza2lwIGF0IHRoZSBiZWdpbm5pbmdcbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9wdGlvbnMubGltaXQgTWF4aW11bSBudW1iZXIgb2YgcmVzdWx0cyB0byByZXR1cm5cbiAgICogQHBhcmFtIHtNb25nb0ZpZWxkU3BlY2lmaWVyfSBvcHRpb25zLmZpZWxkcyBEaWN0aW9uYXJ5IG9mIGZpZWxkcyB0byByZXR1cm4gb3IgZXhjbHVkZS5cbiAgICogQHBhcmFtIHtCb29sZWFufSBvcHRpb25zLnJlYWN0aXZlIChDbGllbnQgb25seSkgRGVmYXVsdCBgdHJ1ZWA7IHBhc3MgYGZhbHNlYCB0byBkaXNhYmxlIHJlYWN0aXZpdHlcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gb3B0aW9ucy50cmFuc2Zvcm0gT3ZlcnJpZGVzIGB0cmFuc2Zvcm1gIG9uIHRoZSAgW2BDb2xsZWN0aW9uYF0oI2NvbGxlY3Rpb25zKSBmb3IgdGhpcyBjdXJzb3IuICBQYXNzIGBudWxsYCB0byBkaXNhYmxlIHRyYW5zZm9ybWF0aW9uLlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMuZGlzYWJsZU9wbG9nIChTZXJ2ZXIgb25seSkgUGFzcyB0cnVlIHRvIGRpc2FibGUgb3Bsb2ctdGFpbGluZyBvbiB0aGlzIHF1ZXJ5LiBUaGlzIGFmZmVjdHMgdGhlIHdheSBzZXJ2ZXIgcHJvY2Vzc2VzIGNhbGxzIHRvIGBvYnNlcnZlYCBvbiB0aGlzIHF1ZXJ5LiBEaXNhYmxpbmcgdGhlIG9wbG9nIGNhbiBiZSB1c2VmdWwgd2hlbiB3b3JraW5nIHdpdGggZGF0YSB0aGF0IHVwZGF0ZXMgaW4gbGFyZ2UgYmF0Y2hlcy5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9wdGlvbnMucG9sbGluZ0ludGVydmFsTXMgKFNlcnZlciBvbmx5KSBXaGVuIG9wbG9nIGlzIGRpc2FibGVkICh0aHJvdWdoIHRoZSB1c2Ugb2YgYGRpc2FibGVPcGxvZ2Agb3Igd2hlbiBvdGhlcndpc2Ugbm90IGF2YWlsYWJsZSksIHRoZSBmcmVxdWVuY3kgKGluIG1pbGxpc2Vjb25kcykgb2YgaG93IG9mdGVuIHRvIHBvbGwgdGhpcyBxdWVyeSB3aGVuIG9ic2VydmluZyBvbiB0aGUgc2VydmVyLiBEZWZhdWx0cyB0byAxMDAwMG1zICgxMCBzZWNvbmRzKS5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9wdGlvbnMucG9sbGluZ1Rocm90dGxlTXMgKFNlcnZlciBvbmx5KSBXaGVuIG9wbG9nIGlzIGRpc2FibGVkICh0aHJvdWdoIHRoZSB1c2Ugb2YgYGRpc2FibGVPcGxvZ2Agb3Igd2hlbiBvdGhlcndpc2Ugbm90IGF2YWlsYWJsZSksIHRoZSBtaW5pbXVtIHRpbWUgKGluIG1pbGxpc2Vjb25kcykgdG8gYWxsb3cgYmV0d2VlbiByZS1wb2xsaW5nIHdoZW4gb2JzZXJ2aW5nIG9uIHRoZSBzZXJ2ZXIuIEluY3JlYXNpbmcgdGhpcyB3aWxsIHNhdmUgQ1BVIGFuZCBtb25nbyBsb2FkIGF0IHRoZSBleHBlbnNlIG9mIHNsb3dlciB1cGRhdGVzIHRvIHVzZXJzLiBEZWNyZWFzaW5nIHRoaXMgaXMgbm90IHJlY29tbWVuZGVkLiBEZWZhdWx0cyB0byA1MG1zLlxuICAgKiBAcGFyYW0ge051bWJlcn0gb3B0aW9ucy5tYXhUaW1lTXMgKFNlcnZlciBvbmx5KSBJZiBzZXQsIGluc3RydWN0cyBNb25nb0RCIHRvIHNldCBhIHRpbWUgbGltaXQgZm9yIHRoaXMgY3Vyc29yJ3Mgb3BlcmF0aW9ucy4gSWYgdGhlIG9wZXJhdGlvbiByZWFjaGVzIHRoZSBzcGVjaWZpZWQgdGltZSBsaW1pdCAoaW4gbWlsbGlzZWNvbmRzKSB3aXRob3V0IHRoZSBoYXZpbmcgYmVlbiBjb21wbGV0ZWQsIGFuIGV4Y2VwdGlvbiB3aWxsIGJlIHRocm93bi4gVXNlZnVsIHRvIHByZXZlbnQgYW4gKGFjY2lkZW50YWwgb3IgbWFsaWNpb3VzKSB1bm9wdGltaXplZCBxdWVyeSBmcm9tIGNhdXNpbmcgYSBmdWxsIGNvbGxlY3Rpb24gc2NhbiB0aGF0IHdvdWxkIGRpc3J1cHQgb3RoZXIgZGF0YWJhc2UgdXNlcnMsIGF0IHRoZSBleHBlbnNlIG9mIG5lZWRpbmcgdG8gaGFuZGxlIHRoZSByZXN1bHRpbmcgZXJyb3IuXG4gICAqIEBwYXJhbSB7U3RyaW5nfE9iamVjdH0gb3B0aW9ucy5oaW50IChTZXJ2ZXIgb25seSkgT3ZlcnJpZGVzIE1vbmdvREIncyBkZWZhdWx0IGluZGV4IHNlbGVjdGlvbiBhbmQgcXVlcnkgb3B0aW1pemF0aW9uIHByb2Nlc3MuIFNwZWNpZnkgYW4gaW5kZXggdG8gZm9yY2UgaXRzIHVzZSwgZWl0aGVyIGJ5IGl0cyBuYW1lIG9yIGluZGV4IHNwZWNpZmljYXRpb24uIFlvdSBjYW4gYWxzbyBzcGVjaWZ5IGB7ICRuYXR1cmFsIDogMSB9YCB0byBmb3JjZSBhIGZvcndhcmRzIGNvbGxlY3Rpb24gc2Nhbiwgb3IgYHsgJG5hdHVyYWwgOiAtMSB9YCBmb3IgYSByZXZlcnNlIGNvbGxlY3Rpb24gc2Nhbi4gU2V0dGluZyB0aGlzIGlzIG9ubHkgcmVjb21tZW5kZWQgZm9yIGFkdmFuY2VkIHVzZXJzLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gb3B0aW9ucy5yZWFkUHJlZmVyZW5jZSAoU2VydmVyIG9ubHkpIFNwZWNpZmllcyBhIGN1c3RvbSBNb25nb0RCIFtgcmVhZFByZWZlcmVuY2VgXShodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL2NvcmUvcmVhZC1wcmVmZXJlbmNlKSBmb3IgdGhpcyBwYXJ0aWN1bGFyIGN1cnNvci4gUG9zc2libGUgdmFsdWVzIGFyZSBgcHJpbWFyeWAsIGBwcmltYXJ5UHJlZmVycmVkYCwgYHNlY29uZGFyeWAsIGBzZWNvbmRhcnlQcmVmZXJyZWRgIGFuZCBgbmVhcmVzdGAuXG4gICAqIEByZXR1cm5zIHtNb25nby5DdXJzb3J9XG4gICAqL1xuICBmaW5kKC4uLmFyZ3MpIHtcbiAgICAvLyBDb2xsZWN0aW9uLmZpbmQoKSAocmV0dXJuIGFsbCBkb2NzKSBiZWhhdmVzIGRpZmZlcmVudGx5XG4gICAgLy8gZnJvbSBDb2xsZWN0aW9uLmZpbmQodW5kZWZpbmVkKSAocmV0dXJuIDAgZG9jcykuICBzbyBiZVxuICAgIC8vIGNhcmVmdWwgYWJvdXQgdGhlIGxlbmd0aCBvZiBhcmd1bWVudHMuXG4gICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb24uZmluZChcbiAgICAgIHRoaXMuX2dldEZpbmRTZWxlY3RvcihhcmdzKSxcbiAgICAgIHRoaXMuX2dldEZpbmRPcHRpb25zKGFyZ3MpXG4gICAgKTtcbiAgfSxcblxuICAvKipcbiAgICogQHN1bW1hcnkgRmluZHMgdGhlIGZpcnN0IGRvY3VtZW50IHRoYXQgbWF0Y2hlcyB0aGUgc2VsZWN0b3IsIGFzIG9yZGVyZWQgYnkgc29ydCBhbmQgc2tpcCBvcHRpb25zLiBSZXR1cm5zIGB1bmRlZmluZWRgIGlmIG5vIG1hdGNoaW5nIGRvY3VtZW50IGlzIGZvdW5kLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQG1ldGhvZCBmaW5kT25lXG4gICAqIEBtZW1iZXJvZiBNb25nby5Db2xsZWN0aW9uXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge01vbmdvU2VsZWN0b3J9IFtzZWxlY3Rvcl0gQSBxdWVyeSBkZXNjcmliaW5nIHRoZSBkb2N1bWVudHMgdG8gZmluZFxuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdXG4gICAqIEBwYXJhbSB7TW9uZ29Tb3J0U3BlY2lmaWVyfSBvcHRpb25zLnNvcnQgU29ydCBvcmRlciAoZGVmYXVsdDogbmF0dXJhbCBvcmRlcilcbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9wdGlvbnMuc2tpcCBOdW1iZXIgb2YgcmVzdWx0cyB0byBza2lwIGF0IHRoZSBiZWdpbm5pbmdcbiAgICogQHBhcmFtIHtNb25nb0ZpZWxkU3BlY2lmaWVyfSBvcHRpb25zLmZpZWxkcyBEaWN0aW9uYXJ5IG9mIGZpZWxkcyB0byByZXR1cm4gb3IgZXhjbHVkZS5cbiAgICogQHBhcmFtIHtCb29sZWFufSBvcHRpb25zLnJlYWN0aXZlIChDbGllbnQgb25seSkgRGVmYXVsdCB0cnVlOyBwYXNzIGZhbHNlIHRvIGRpc2FibGUgcmVhY3Rpdml0eVxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBvcHRpb25zLnRyYW5zZm9ybSBPdmVycmlkZXMgYHRyYW5zZm9ybWAgb24gdGhlIFtgQ29sbGVjdGlvbmBdKCNjb2xsZWN0aW9ucykgZm9yIHRoaXMgY3Vyc29yLiAgUGFzcyBgbnVsbGAgdG8gZGlzYWJsZSB0cmFuc2Zvcm1hdGlvbi5cbiAgICogQHBhcmFtIHtTdHJpbmd9IG9wdGlvbnMucmVhZFByZWZlcmVuY2UgKFNlcnZlciBvbmx5KSBTcGVjaWZpZXMgYSBjdXN0b20gTW9uZ29EQiBbYHJlYWRQcmVmZXJlbmNlYF0oaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9jb3JlL3JlYWQtcHJlZmVyZW5jZSkgZm9yIGZldGNoaW5nIHRoZSBkb2N1bWVudC4gUG9zc2libGUgdmFsdWVzIGFyZSBgcHJpbWFyeWAsIGBwcmltYXJ5UHJlZmVycmVkYCwgYHNlY29uZGFyeWAsIGBzZWNvbmRhcnlQcmVmZXJyZWRgIGFuZCBgbmVhcmVzdGAuXG4gICAqIEByZXR1cm5zIHtPYmplY3R9XG4gICAqL1xuICBmaW5kT25lKC4uLmFyZ3MpIHtcbiAgICByZXR1cm4gdGhpcy5fY29sbGVjdGlvbi5maW5kT25lKFxuICAgICAgdGhpcy5fZ2V0RmluZFNlbGVjdG9yKGFyZ3MpLFxuICAgICAgdGhpcy5fZ2V0RmluZE9wdGlvbnMoYXJncylcbiAgICApO1xuICB9LFxuXG5cbiAgLy8gJ2luc2VydCcgaW1tZWRpYXRlbHkgcmV0dXJucyB0aGUgaW5zZXJ0ZWQgZG9jdW1lbnQncyBuZXcgX2lkLlxuICAvLyBUaGUgb3RoZXJzIHJldHVybiB2YWx1ZXMgaW1tZWRpYXRlbHkgaWYgeW91IGFyZSBpbiBhIHN0dWIsIGFuIGluLW1lbW9yeVxuICAvLyB1bm1hbmFnZWQgY29sbGVjdGlvbiwgb3IgYSBtb25nby1iYWNrZWQgY29sbGVjdGlvbiBhbmQgeW91IGRvbid0IHBhc3MgYVxuICAvLyBjYWxsYmFjay4gJ3VwZGF0ZScgYW5kICdyZW1vdmUnIHJldHVybiB0aGUgbnVtYmVyIG9mIGFmZmVjdGVkXG4gIC8vIGRvY3VtZW50cy4gJ3Vwc2VydCcgcmV0dXJucyBhbiBvYmplY3Qgd2l0aCBrZXlzICdudW1iZXJBZmZlY3RlZCcgYW5kLCBpZiBhblxuICAvLyBpbnNlcnQgaGFwcGVuZWQsICdpbnNlcnRlZElkJy5cbiAgLy9cbiAgLy8gT3RoZXJ3aXNlLCB0aGUgc2VtYW50aWNzIGFyZSBleGFjdGx5IGxpa2Ugb3RoZXIgbWV0aG9kczogdGhleSB0YWtlXG4gIC8vIGEgY2FsbGJhY2sgYXMgYW4gb3B0aW9uYWwgbGFzdCBhcmd1bWVudDsgaWYgbm8gY2FsbGJhY2sgaXNcbiAgLy8gcHJvdmlkZWQsIHRoZXkgYmxvY2sgdW50aWwgdGhlIG9wZXJhdGlvbiBpcyBjb21wbGV0ZSwgYW5kIHRocm93IGFuXG4gIC8vIGV4Y2VwdGlvbiBpZiBpdCBmYWlsczsgaWYgYSBjYWxsYmFjayBpcyBwcm92aWRlZCwgdGhlbiB0aGV5IGRvbid0XG4gIC8vIG5lY2Vzc2FyaWx5IGJsb2NrLCBhbmQgdGhleSBjYWxsIHRoZSBjYWxsYmFjayB3aGVuIHRoZXkgZmluaXNoIHdpdGggZXJyb3IgYW5kXG4gIC8vIHJlc3VsdCBhcmd1bWVudHMuICAoVGhlIGluc2VydCBtZXRob2QgcHJvdmlkZXMgdGhlIGRvY3VtZW50IElEIGFzIGl0cyByZXN1bHQ7XG4gIC8vIHVwZGF0ZSBhbmQgcmVtb3ZlIHByb3ZpZGUgdGhlIG51bWJlciBvZiBhZmZlY3RlZCBkb2NzIGFzIHRoZSByZXN1bHQ7IHVwc2VydFxuICAvLyBwcm92aWRlcyBhbiBvYmplY3Qgd2l0aCBudW1iZXJBZmZlY3RlZCBhbmQgbWF5YmUgaW5zZXJ0ZWRJZC4pXG4gIC8vXG4gIC8vIE9uIHRoZSBjbGllbnQsIGJsb2NraW5nIGlzIGltcG9zc2libGUsIHNvIGlmIGEgY2FsbGJhY2tcbiAgLy8gaXNuJ3QgcHJvdmlkZWQsIHRoZXkganVzdCByZXR1cm4gaW1tZWRpYXRlbHkgYW5kIGFueSBlcnJvclxuICAvLyBpbmZvcm1hdGlvbiBpcyBsb3N0LlxuICAvL1xuICAvLyBUaGVyZSdzIG9uZSBtb3JlIHR3ZWFrLiBPbiB0aGUgY2xpZW50LCBpZiB5b3UgZG9uJ3QgcHJvdmlkZSBhXG4gIC8vIGNhbGxiYWNrLCB0aGVuIGlmIHRoZXJlIGlzIGFuIGVycm9yLCBhIG1lc3NhZ2Ugd2lsbCBiZSBsb2dnZWQgd2l0aFxuICAvLyBNZXRlb3IuX2RlYnVnLlxuICAvL1xuICAvLyBUaGUgaW50ZW50ICh0aG91Z2ggdGhpcyBpcyBhY3R1YWxseSBkZXRlcm1pbmVkIGJ5IHRoZSB1bmRlcmx5aW5nXG4gIC8vIGRyaXZlcnMpIGlzIHRoYXQgdGhlIG9wZXJhdGlvbnMgc2hvdWxkIGJlIGRvbmUgc3luY2hyb25vdXNseSwgbm90XG4gIC8vIGdlbmVyYXRpbmcgdGhlaXIgcmVzdWx0IHVudGlsIHRoZSBkYXRhYmFzZSBoYXMgYWNrbm93bGVkZ2VkXG4gIC8vIHRoZW0uIEluIHRoZSBmdXR1cmUgbWF5YmUgd2Ugc2hvdWxkIHByb3ZpZGUgYSBmbGFnIHRvIHR1cm4gdGhpc1xuICAvLyBvZmYuXG5cbiAgX2luc2VydChkb2MsIGNhbGxiYWNrKSB7XG4gICAgLy8gTWFrZSBzdXJlIHdlIHdlcmUgcGFzc2VkIGEgZG9jdW1lbnQgdG8gaW5zZXJ0XG4gICAgaWYgKCFkb2MpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignaW5zZXJ0IHJlcXVpcmVzIGFuIGFyZ3VtZW50Jyk7XG4gICAgfVxuXG5cbiAgICAvLyBNYWtlIGEgc2hhbGxvdyBjbG9uZSBvZiB0aGUgZG9jdW1lbnQsIHByZXNlcnZpbmcgaXRzIHByb3RvdHlwZS5cbiAgICBkb2MgPSBPYmplY3QuY3JlYXRlKFxuICAgICAgT2JqZWN0LmdldFByb3RvdHlwZU9mKGRvYyksXG4gICAgICBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyhkb2MpXG4gICAgKTtcblxuICAgIGlmICgnX2lkJyBpbiBkb2MpIHtcbiAgICAgIGlmIChcbiAgICAgICAgIWRvYy5faWQgfHxcbiAgICAgICAgISh0eXBlb2YgZG9jLl9pZCA9PT0gJ3N0cmluZycgfHwgZG9jLl9pZCBpbnN0YW5jZW9mIE1vbmdvLk9iamVjdElEKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAnTWV0ZW9yIHJlcXVpcmVzIGRvY3VtZW50IF9pZCBmaWVsZHMgdG8gYmUgbm9uLWVtcHR5IHN0cmluZ3Mgb3IgT2JqZWN0SURzJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBsZXQgZ2VuZXJhdGVJZCA9IHRydWU7XG5cbiAgICAgIC8vIERvbid0IGdlbmVyYXRlIHRoZSBpZCBpZiB3ZSdyZSB0aGUgY2xpZW50IGFuZCB0aGUgJ291dGVybW9zdCcgY2FsbFxuICAgICAgLy8gVGhpcyBvcHRpbWl6YXRpb24gc2F2ZXMgdXMgcGFzc2luZyBib3RoIHRoZSByYW5kb21TZWVkIGFuZCB0aGUgaWRcbiAgICAgIC8vIFBhc3NpbmcgYm90aCBpcyByZWR1bmRhbnQuXG4gICAgICBpZiAodGhpcy5faXNSZW1vdGVDb2xsZWN0aW9uKCkpIHtcbiAgICAgICAgY29uc3QgZW5jbG9zaW5nID0gRERQLl9DdXJyZW50TWV0aG9kSW52b2NhdGlvbi5nZXQoKTtcbiAgICAgICAgaWYgKCFlbmNsb3NpbmcpIHtcbiAgICAgICAgICBnZW5lcmF0ZUlkID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGdlbmVyYXRlSWQpIHtcbiAgICAgICAgZG9jLl9pZCA9IHRoaXMuX21ha2VOZXdJRCgpO1xuICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gT24gaW5zZXJ0cywgYWx3YXlzIHJldHVybiB0aGUgaWQgdGhhdCB3ZSBnZW5lcmF0ZWQ7IG9uIGFsbCBvdGhlclxuICAgIC8vIG9wZXJhdGlvbnMsIGp1c3QgcmV0dXJuIHRoZSByZXN1bHQgZnJvbSB0aGUgY29sbGVjdGlvbi5cbiAgICB2YXIgY2hvb3NlUmV0dXJuVmFsdWVGcm9tQ29sbGVjdGlvblJlc3VsdCA9IGZ1bmN0aW9uKHJlc3VsdCkge1xuICAgICAgaWYgKE1ldGVvci5faXNQcm9taXNlKHJlc3VsdCkpIHJldHVybiByZXN1bHQ7XG5cbiAgICAgIGlmIChkb2MuX2lkKSB7XG4gICAgICAgIHJldHVybiBkb2MuX2lkO1xuICAgICAgfVxuXG4gICAgICAvLyBYWFggd2hhdCBpcyB0aGlzIGZvcj8/XG4gICAgICAvLyBJdCdzIHNvbWUgaXRlcmFjdGlvbiBiZXR3ZWVuIHRoZSBjYWxsYmFjayB0byBfY2FsbE11dGF0b3JNZXRob2QgYW5kXG4gICAgICAvLyB0aGUgcmV0dXJuIHZhbHVlIGNvbnZlcnNpb25cbiAgICAgIGRvYy5faWQgPSByZXN1bHQ7XG5cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcblxuICAgIGNvbnN0IHdyYXBwZWRDYWxsYmFjayA9IHdyYXBDYWxsYmFjayhcbiAgICAgIGNhbGxiYWNrLFxuICAgICAgY2hvb3NlUmV0dXJuVmFsdWVGcm9tQ29sbGVjdGlvblJlc3VsdFxuICAgICk7XG5cbiAgICBpZiAodGhpcy5faXNSZW1vdGVDb2xsZWN0aW9uKCkpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMuX2NhbGxNdXRhdG9yTWV0aG9kKCdpbnNlcnQnLCBbZG9jXSwgd3JhcHBlZENhbGxiYWNrKTtcbiAgICAgIHJldHVybiBjaG9vc2VSZXR1cm5WYWx1ZUZyb21Db2xsZWN0aW9uUmVzdWx0KHJlc3VsdCk7XG4gICAgfVxuXG4gICAgLy8gaXQncyBteSBjb2xsZWN0aW9uLiAgZGVzY2VuZCBpbnRvIHRoZSBjb2xsZWN0aW9uIG9iamVjdFxuICAgIC8vIGFuZCBwcm9wYWdhdGUgYW55IGV4Y2VwdGlvbi5cbiAgICB0cnkge1xuICAgICAgLy8gSWYgdGhlIHVzZXIgcHJvdmlkZWQgYSBjYWxsYmFjayBhbmQgdGhlIGNvbGxlY3Rpb24gaW1wbGVtZW50cyB0aGlzXG4gICAgICAvLyBvcGVyYXRpb24gYXN5bmNocm9ub3VzbHksIHRoZW4gcXVlcnlSZXQgd2lsbCBiZSB1bmRlZmluZWQsIGFuZCB0aGVcbiAgICAgIC8vIHJlc3VsdCB3aWxsIGJlIHJldHVybmVkIHRocm91Z2ggdGhlIGNhbGxiYWNrIGluc3RlYWQuXG4gICAgICBsZXQgcmVzdWx0O1xuICAgICAgaWYgKCEhd3JhcHBlZENhbGxiYWNrKSB7XG4gICAgICAgIHRoaXMuX2NvbGxlY3Rpb24uaW5zZXJ0KGRvYywgd3JhcHBlZENhbGxiYWNrKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIElmIHdlIGRvbid0IGhhdmUgdGhlIGNhbGxiYWNrLCB3ZSBhc3N1bWUgdGhlIHVzZXIgaXMgdXNpbmcgdGhlIHByb21pc2UuXG4gICAgICAgIC8vIFdlIGNhbid0IGp1c3QgcGFzcyB0aGlzLl9jb2xsZWN0aW9uLmluc2VydCB0byB0aGUgcHJvbWlzaWZ5IGJlY2F1c2UgaXQgd291bGQgbG9zZSB0aGUgY29udGV4dC5cbiAgICAgICAgcmVzdWx0ID0gdGhpcy5fY29sbGVjdGlvbi5pbnNlcnQoZG9jKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGNob29zZVJldHVyblZhbHVlRnJvbUNvbGxlY3Rpb25SZXN1bHQocmVzdWx0KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2soZSk7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gIH0sXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IEluc2VydCBhIGRvY3VtZW50IGluIHRoZSBjb2xsZWN0aW9uLiAgUmV0dXJucyBpdHMgdW5pcXVlIF9pZC5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBtZXRob2QgIGluc2VydFxuICAgKiBAbWVtYmVyb2YgTW9uZ28uQ29sbGVjdGlvblxuICAgKiBAaW5zdGFuY2VcbiAgICogQHBhcmFtIHtPYmplY3R9IGRvYyBUaGUgZG9jdW1lbnQgdG8gaW5zZXJ0LiBNYXkgbm90IHlldCBoYXZlIGFuIF9pZCBhdHRyaWJ1dGUsIGluIHdoaWNoIGNhc2UgTWV0ZW9yIHdpbGwgZ2VuZXJhdGUgb25lIGZvciB5b3UuXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IFtjYWxsYmFja10gT3B0aW9uYWwuICBJZiBwcmVzZW50LCBjYWxsZWQgd2l0aCBhbiBlcnJvciBvYmplY3QgYXMgdGhlIGZpcnN0IGFyZ3VtZW50IGFuZCwgaWYgbm8gZXJyb3IsIHRoZSBfaWQgYXMgdGhlIHNlY29uZC5cbiAgICovXG4gIGluc2VydChkb2MsIGNhbGxiYWNrKSB7XG4gICAgcmV0dXJuIHRoaXMuX2luc2VydChkb2MsIGNhbGxiYWNrKTtcbiAgfSxcblxuICAvKipcbiAgICogQHN1bW1hcnkgQXN5bmNocm9ub3VzbHkgbW9kaWZpZXMgb25lIG9yIG1vcmUgZG9jdW1lbnRzIGluIHRoZSBjb2xsZWN0aW9uLiBSZXR1cm5zIHRoZSBudW1iZXIgb2YgbWF0Y2hlZCBkb2N1bWVudHMuXG4gICAqIEBsb2N1cyBBbnl3aGVyZVxuICAgKiBAbWV0aG9kIHVwZGF0ZVxuICAgKiBAbWVtYmVyb2YgTW9uZ28uQ29sbGVjdGlvblxuICAgKiBAaW5zdGFuY2VcbiAgICogQHBhcmFtIHtNb25nb1NlbGVjdG9yfSBzZWxlY3RvciBTcGVjaWZpZXMgd2hpY2ggZG9jdW1lbnRzIHRvIG1vZGlmeVxuICAgKiBAcGFyYW0ge01vbmdvTW9kaWZpZXJ9IG1vZGlmaWVyIFNwZWNpZmllcyBob3cgdG8gbW9kaWZ5IHRoZSBkb2N1bWVudHNcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXVxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMubXVsdGkgVHJ1ZSB0byBtb2RpZnkgYWxsIG1hdGNoaW5nIGRvY3VtZW50czsgZmFsc2UgdG8gb25seSBtb2RpZnkgb25lIG9mIHRoZSBtYXRjaGluZyBkb2N1bWVudHMgKHRoZSBkZWZhdWx0KS5cbiAgICogQHBhcmFtIHtCb29sZWFufSBvcHRpb25zLnVwc2VydCBUcnVlIHRvIGluc2VydCBhIGRvY3VtZW50IGlmIG5vIG1hdGNoaW5nIGRvY3VtZW50cyBhcmUgZm91bmQuXG4gICAqIEBwYXJhbSB7QXJyYXl9IG9wdGlvbnMuYXJyYXlGaWx0ZXJzIE9wdGlvbmFsLiBVc2VkIGluIGNvbWJpbmF0aW9uIHdpdGggTW9uZ29EQiBbZmlsdGVyZWQgcG9zaXRpb25hbCBvcGVyYXRvcl0oaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9yZWZlcmVuY2Uvb3BlcmF0b3IvdXBkYXRlL3Bvc2l0aW9uYWwtZmlsdGVyZWQvKSB0byBzcGVjaWZ5IHdoaWNoIGVsZW1lbnRzIHRvIG1vZGlmeSBpbiBhbiBhcnJheSBmaWVsZC5cbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gW2NhbGxiYWNrXSBPcHRpb25hbC4gIElmIHByZXNlbnQsIGNhbGxlZCB3aXRoIGFuIGVycm9yIG9iamVjdCBhcyB0aGUgZmlyc3QgYXJndW1lbnQgYW5kLCBpZiBubyBlcnJvciwgdGhlIG51bWJlciBvZiBhZmZlY3RlZCBkb2N1bWVudHMgYXMgdGhlIHNlY29uZC5cbiAgICovXG4gIHVwZGF0ZShzZWxlY3RvciwgbW9kaWZpZXIsIC4uLm9wdGlvbnNBbmRDYWxsYmFjaykge1xuICAgIGNvbnN0IGNhbGxiYWNrID0gcG9wQ2FsbGJhY2tGcm9tQXJncyhvcHRpb25zQW5kQ2FsbGJhY2spO1xuXG4gICAgLy8gV2UndmUgYWxyZWFkeSBwb3BwZWQgb2ZmIHRoZSBjYWxsYmFjaywgc28gd2UgYXJlIGxlZnQgd2l0aCBhbiBhcnJheVxuICAgIC8vIG9mIG9uZSBvciB6ZXJvIGl0ZW1zXG4gICAgY29uc3Qgb3B0aW9ucyA9IHsgLi4uKG9wdGlvbnNBbmRDYWxsYmFja1swXSB8fCBudWxsKSB9O1xuICAgIGxldCBpbnNlcnRlZElkO1xuICAgIGlmIChvcHRpb25zICYmIG9wdGlvbnMudXBzZXJ0KSB7XG4gICAgICAvLyBzZXQgYGluc2VydGVkSWRgIGlmIGFic2VudC4gIGBpbnNlcnRlZElkYCBpcyBhIE1ldGVvciBleHRlbnNpb24uXG4gICAgICBpZiAob3B0aW9ucy5pbnNlcnRlZElkKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAhKFxuICAgICAgICAgICAgdHlwZW9mIG9wdGlvbnMuaW5zZXJ0ZWRJZCA9PT0gJ3N0cmluZycgfHxcbiAgICAgICAgICAgIG9wdGlvbnMuaW5zZXJ0ZWRJZCBpbnN0YW5jZW9mIE1vbmdvLk9iamVjdElEXG4gICAgICAgICAgKVxuICAgICAgICApXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdpbnNlcnRlZElkIG11c3QgYmUgc3RyaW5nIG9yIE9iamVjdElEJyk7XG4gICAgICAgIGluc2VydGVkSWQgPSBvcHRpb25zLmluc2VydGVkSWQ7XG4gICAgICB9IGVsc2UgaWYgKCFzZWxlY3RvciB8fCAhc2VsZWN0b3IuX2lkKSB7XG4gICAgICAgIGluc2VydGVkSWQgPSB0aGlzLl9tYWtlTmV3SUQoKTtcbiAgICAgICAgb3B0aW9ucy5nZW5lcmF0ZWRJZCA9IHRydWU7XG4gICAgICAgIG9wdGlvbnMuaW5zZXJ0ZWRJZCA9IGluc2VydGVkSWQ7XG4gICAgICB9XG4gICAgfVxuXG4gICAgc2VsZWN0b3IgPSBNb25nby5Db2xsZWN0aW9uLl9yZXdyaXRlU2VsZWN0b3Ioc2VsZWN0b3IsIHtcbiAgICAgIGZhbGxiYWNrSWQ6IGluc2VydGVkSWQsXG4gICAgfSk7XG5cbiAgICBjb25zdCB3cmFwcGVkQ2FsbGJhY2sgPSB3cmFwQ2FsbGJhY2soY2FsbGJhY2spO1xuXG4gICAgaWYgKHRoaXMuX2lzUmVtb3RlQ29sbGVjdGlvbigpKSB7XG4gICAgICBjb25zdCBhcmdzID0gW3NlbGVjdG9yLCBtb2RpZmllciwgb3B0aW9uc107XG4gICAgICByZXR1cm4gdGhpcy5fY2FsbE11dGF0b3JNZXRob2QoJ3VwZGF0ZScsIGFyZ3MsIGNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICAvLyBpdCdzIG15IGNvbGxlY3Rpb24uICBkZXNjZW5kIGludG8gdGhlIGNvbGxlY3Rpb24gb2JqZWN0XG4gICAgLy8gYW5kIHByb3BhZ2F0ZSBhbnkgZXhjZXB0aW9uLlxuICAgIC8vIElmIHRoZSB1c2VyIHByb3ZpZGVkIGEgY2FsbGJhY2sgYW5kIHRoZSBjb2xsZWN0aW9uIGltcGxlbWVudHMgdGhpc1xuICAgIC8vIG9wZXJhdGlvbiBhc3luY2hyb25vdXNseSwgdGhlbiBxdWVyeVJldCB3aWxsIGJlIHVuZGVmaW5lZCwgYW5kIHRoZVxuICAgIC8vIHJlc3VsdCB3aWxsIGJlIHJldHVybmVkIHRocm91Z2ggdGhlIGNhbGxiYWNrIGluc3RlYWQuXG4gICAgLy9jb25zb2xlLmxvZyh7Y2FsbGJhY2ssIG9wdGlvbnMsIHNlbGVjdG9yLCBtb2RpZmllciwgY29sbDogdGhpcy5fY29sbGVjdGlvbn0pO1xuICAgIHRyeSB7XG4gICAgICAvLyBJZiB0aGUgdXNlciBwcm92aWRlZCBhIGNhbGxiYWNrIGFuZCB0aGUgY29sbGVjdGlvbiBpbXBsZW1lbnRzIHRoaXNcbiAgICAgIC8vIG9wZXJhdGlvbiBhc3luY2hyb25vdXNseSwgdGhlbiBxdWVyeVJldCB3aWxsIGJlIHVuZGVmaW5lZCwgYW5kIHRoZVxuICAgICAgLy8gcmVzdWx0IHdpbGwgYmUgcmV0dXJuZWQgdGhyb3VnaCB0aGUgY2FsbGJhY2sgaW5zdGVhZC5cbiAgICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uLnVwZGF0ZShcbiAgICAgICAgc2VsZWN0b3IsXG4gICAgICAgIG1vZGlmaWVyLFxuICAgICAgICBvcHRpb25zLFxuICAgICAgICB3cmFwcGVkQ2FsbGJhY2tcbiAgICAgICk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrKGUpO1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIHRocm93IGU7XG4gICAgfVxuICB9LFxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBSZW1vdmUgZG9jdW1lbnRzIGZyb20gdGhlIGNvbGxlY3Rpb25cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBtZXRob2QgcmVtb3ZlXG4gICAqIEBtZW1iZXJvZiBNb25nby5Db2xsZWN0aW9uXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge01vbmdvU2VsZWN0b3J9IHNlbGVjdG9yIFNwZWNpZmllcyB3aGljaCBkb2N1bWVudHMgdG8gcmVtb3ZlXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IFtjYWxsYmFja10gT3B0aW9uYWwuICBJZiBwcmVzZW50LCBjYWxsZWQgd2l0aCBhbiBlcnJvciBvYmplY3QgYXMgdGhlIGZpcnN0IGFyZ3VtZW50IGFuZCwgaWYgbm8gZXJyb3IsIHRoZSBudW1iZXIgb2YgYWZmZWN0ZWQgZG9jdW1lbnRzIGFzIHRoZSBzZWNvbmQuXG4gICAqL1xuICByZW1vdmUoc2VsZWN0b3IsIGNhbGxiYWNrKSB7XG4gICAgc2VsZWN0b3IgPSBNb25nby5Db2xsZWN0aW9uLl9yZXdyaXRlU2VsZWN0b3Ioc2VsZWN0b3IpO1xuXG4gICAgaWYgKHRoaXMuX2lzUmVtb3RlQ29sbGVjdGlvbigpKSB7XG4gICAgICByZXR1cm4gdGhpcy5fY2FsbE11dGF0b3JNZXRob2QoJ3JlbW92ZScsIFtzZWxlY3Rvcl0sIGNhbGxiYWNrKTtcbiAgICB9XG5cblxuICAgIC8vIGl0J3MgbXkgY29sbGVjdGlvbi4gIGRlc2NlbmQgaW50byB0aGUgY29sbGVjdGlvbjEgb2JqZWN0XG4gICAgLy8gYW5kIHByb3BhZ2F0ZSBhbnkgZXhjZXB0aW9uLlxuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uLnJlbW92ZShzZWxlY3Rvcik7XG4gIH0sXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IEFzeW5jaHJvbm91c2x5IG1vZGlmaWVzIG9uZSBvciBtb3JlIGRvY3VtZW50cyBpbiB0aGUgY29sbGVjdGlvbiwgb3IgaW5zZXJ0IG9uZSBpZiBubyBtYXRjaGluZyBkb2N1bWVudHMgd2VyZSBmb3VuZC4gUmV0dXJucyBhbiBvYmplY3Qgd2l0aCBrZXlzIGBudW1iZXJBZmZlY3RlZGAgKHRoZSBudW1iZXIgb2YgZG9jdW1lbnRzIG1vZGlmaWVkKSAgYW5kIGBpbnNlcnRlZElkYCAodGhlIHVuaXF1ZSBfaWQgb2YgdGhlIGRvY3VtZW50IHRoYXQgd2FzIGluc2VydGVkLCBpZiBhbnkpLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQG1ldGhvZCB1cHNlcnRcbiAgICogQG1lbWJlcm9mIE1vbmdvLkNvbGxlY3Rpb25cbiAgICogQGluc3RhbmNlXG4gICAqIEBwYXJhbSB7TW9uZ29TZWxlY3Rvcn0gc2VsZWN0b3IgU3BlY2lmaWVzIHdoaWNoIGRvY3VtZW50cyB0byBtb2RpZnlcbiAgICogQHBhcmFtIHtNb25nb01vZGlmaWVyfSBtb2RpZmllciBTcGVjaWZpZXMgaG93IHRvIG1vZGlmeSB0aGUgZG9jdW1lbnRzXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc11cbiAgICogQHBhcmFtIHtCb29sZWFufSBvcHRpb25zLm11bHRpIFRydWUgdG8gbW9kaWZ5IGFsbCBtYXRjaGluZyBkb2N1bWVudHM7IGZhbHNlIHRvIG9ubHkgbW9kaWZ5IG9uZSBvZiB0aGUgbWF0Y2hpbmcgZG9jdW1lbnRzICh0aGUgZGVmYXVsdCkuXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IFtjYWxsYmFja10gT3B0aW9uYWwuICBJZiBwcmVzZW50LCBjYWxsZWQgd2l0aCBhbiBlcnJvciBvYmplY3QgYXMgdGhlIGZpcnN0IGFyZ3VtZW50IGFuZCwgaWYgbm8gZXJyb3IsIHRoZSBudW1iZXIgb2YgYWZmZWN0ZWQgZG9jdW1lbnRzIGFzIHRoZSBzZWNvbmQuXG4gICAqL1xuICB1cHNlcnQoc2VsZWN0b3IsIG1vZGlmaWVyLCBvcHRpb25zLCBjYWxsYmFjaykge1xuICAgIGlmICghY2FsbGJhY2sgJiYgdHlwZW9mIG9wdGlvbnMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGNhbGxiYWNrID0gb3B0aW9ucztcbiAgICAgIG9wdGlvbnMgPSB7fTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy51cGRhdGUoXG4gICAgICBzZWxlY3RvcixcbiAgICAgIG1vZGlmaWVyLFxuICAgICAge1xuICAgICAgICAuLi5vcHRpb25zLFxuICAgICAgICBfcmV0dXJuT2JqZWN0OiB0cnVlLFxuICAgICAgICB1cHNlcnQ6IHRydWUsXG4gICAgICB9KTtcbiAgfSxcbn1cblxuLy8gQ29udmVydCB0aGUgY2FsbGJhY2sgdG8gbm90IHJldHVybiBhIHJlc3VsdCBpZiB0aGVyZSBpcyBhbiBlcnJvclxuZnVuY3Rpb24gd3JhcENhbGxiYWNrKGNhbGxiYWNrLCBjb252ZXJ0UmVzdWx0KSB7XG4gIHJldHVybiAoXG4gICAgY2FsbGJhY2sgJiZcbiAgICBmdW5jdGlvbihlcnJvciwgcmVzdWx0KSB7XG4gICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgY2FsbGJhY2soZXJyb3IpO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY29udmVydFJlc3VsdCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBjYWxsYmFjayhlcnJvciwgY29udmVydFJlc3VsdChyZXN1bHQpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNhbGxiYWNrKGVycm9yLCByZXN1bHQpO1xuICAgICAgfVxuICAgIH1cbiAgKTtcbn1cblxuZnVuY3Rpb24gcG9wQ2FsbGJhY2tGcm9tQXJncyhhcmdzKSB7XG4gIC8vIFB1bGwgb2ZmIGFueSBjYWxsYmFjayAob3IgcGVyaGFwcyBhICdjYWxsYmFjaycgdmFyaWFibGUgdGhhdCB3YXMgcGFzc2VkXG4gIC8vIGluIHVuZGVmaW5lZCwgbGlrZSBob3cgJ3Vwc2VydCcgZG9lcyBpdCkuXG4gIGlmIChcbiAgICBhcmdzLmxlbmd0aCAmJlxuICAgIChhcmdzW2FyZ3MubGVuZ3RoIC0gMV0gPT09IHVuZGVmaW5lZCB8fFxuICAgICAgYXJnc1thcmdzLmxlbmd0aCAtIDFdIGluc3RhbmNlb2YgRnVuY3Rpb24pXG4gICkge1xuICAgIHJldHVybiBhcmdzLnBvcCgpO1xuICB9XG59XG4iLCIvKipcbiAqIEBzdW1tYXJ5IFdhdGNoZXMgdGhlIE1vbmdvREIgY29sbGVjdGlvbiB1c2luZyBDaGFuZ2UgU3RyZWFtcy5cbiAqIEBsb2N1cyBTZXJ2ZXJcbiAqIEBtZW1iZXJvZiBNb25nby5Db2xsZWN0aW9uXG4gKiBAaW5zdGFuY2VcbiAqIEBwYXJhbSB7QXJyYXl9IFtwaXBlbGluZV0gT3B0aW9uYWwgYWdncmVnYXRpb24gcGlwZWxpbmUgdG8gZmlsdGVyIENoYW5nZSBTdHJlYW0gZXZlbnRzLlxuICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBPcHRpb25hbCBzZXR0aW5ncyBmb3IgdGhlIENoYW5nZSBTdHJlYW0uXG4gKiBAcmV0dXJucyB7Q2hhbmdlU3RyZWFtfSBUaGUgTW9uZ29EQiBDaGFuZ2VTdHJlYW0gaW5zdGFuY2UuXG4gKiBAdGhyb3dzIHtFcnJvcn0gSWYgY2FsbGVkIG9uIGEgY2xpZW50L21pbmltb25nbyBjb2xsZWN0aW9uLlxuICpcbiAqIEBleGFtcGxlXG4gKiAgIGNvbnN0IGNoYW5nZVN0cmVhbSA9IE15Q29sbGVjdGlvbi53YXRjaENoYW5nZVN0cmVhbShbXG4gKiAgICAgeyAkbWF0Y2g6IHsgJ29wZXJhdGlvblR5cGUnOiAnaW5zZXJ0JyB9IH1cbiAqICAgXSk7XG4gKiAgIGNoYW5nZVN0cmVhbS5vbignY2hhbmdlJywgKGNoYW5nZSkgPT4ge1xuICogICAgIGNvbnNvbGUubG9nKCdDaGFuZ2UgZGV0ZWN0ZWQ6JywgY2hhbmdlKTtcbiAqICAgfSk7XG4gKi9cblxuZXhwb3J0IGZ1bmN0aW9uIHdhdGNoQ2hhbmdlU3RyZWFtKHBpcGVsaW5lID0gW10sIG9wdGlvbnMgPSB7fSkge1xuICAvLyBPbmx5IGF2YWlsYWJsZSBvbiBzZXJ2ZXJcbiAgaWYgKHR5cGVvZiBQYWNrYWdlID09PSAndW5kZWZpbmVkJyB8fCAhdGhpcy5yYXdDb2xsZWN0aW9uKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCd3YXRjaENoYW5nZVN0cmVhbSBpcyBvbmx5IGF2YWlsYWJsZSBvbiBzZXJ2ZXIgY29sbGVjdGlvbnMnKTtcbiAgfVxuICBjb25zdCByYXcgPSB0aGlzLnJhd0NvbGxlY3Rpb24oKTtcbiAgaWYgKCFyYXcud2F0Y2gpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZGVybHlpbmcgY29sbGVjdGlvbiBkb2VzIG5vdCBzdXBwb3J0IHdhdGNoIChDaGFuZ2UgU3RyZWFtcyknKTtcbiAgfVxuICBjb25zb2xlLmxvZygnW3dhdGNoQ2hhbmdlU3RyZWFtXSBDaGFtYW5kbyByYXcud2F0Y2goKSBjb20gcGlwZWxpbmU6JywgSlNPTi5zdHJpbmdpZnkocGlwZWxpbmUsIG51bGwsIDIpLCAnZSBvcHRpb25zOicsIEpTT04uc3RyaW5naWZ5KG9wdGlvbnMsIG51bGwsIDIpKTtcbiAgcmV0dXJuIHJhdy53YXRjaChwaXBlbGluZSwgb3B0aW9ucyk7XG59XG4iLCIvKipcbiAqIEBzdW1tYXJ5IEFsbG93cyBmb3IgdXNlciBzcGVjaWZpZWQgY29ubmVjdGlvbiBvcHRpb25zXG4gKiBAZXhhbXBsZSBodHRwOi8vbW9uZ29kYi5naXRodWIuaW8vbm9kZS1tb25nb2RiLW5hdGl2ZS8zLjAvcmVmZXJlbmNlL2Nvbm5lY3RpbmcvY29ubmVjdGlvbi1zZXR0aW5ncy9cbiAqIEBsb2N1cyBTZXJ2ZXJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIFVzZXIgc3BlY2lmaWVkIE1vbmdvIGNvbm5lY3Rpb24gb3B0aW9uc1xuICovXG5Nb25nby5zZXRDb25uZWN0aW9uT3B0aW9ucyA9IGZ1bmN0aW9uIHNldENvbm5lY3Rpb25PcHRpb25zIChvcHRpb25zKSB7XG4gIGNoZWNrKG9wdGlvbnMsIE9iamVjdCk7XG4gIE1vbmdvLl9jb25uZWN0aW9uT3B0aW9ucyA9IG9wdGlvbnM7XG59OyIsImV4cG9ydCBjb25zdCBub3JtYWxpemVQcm9qZWN0aW9uID0gb3B0aW9ucyA9PiB7XG4gIC8vIHRyYW5zZm9ybSBmaWVsZHMga2V5IGluIHByb2plY3Rpb25cbiAgY29uc3QgeyBmaWVsZHMsIHByb2plY3Rpb24sIC4uLm90aGVyT3B0aW9ucyB9ID0gb3B0aW9ucyB8fCB7fTtcbiAgLy8gVE9ETzogZW5hYmxlIHRoaXMgY29tbWVudCB3aGVuIGRlcHJlY2F0aW5nIHRoZSBmaWVsZHMgb3B0aW9uXG4gIC8vIExvZy5kZWJ1ZyhgZmllbGRzIG9wdGlvbiBoYXMgYmVlbiBkZXByZWNhdGVkLCBwbGVhc2UgdXNlIHRoZSBuZXcgJ3Byb2plY3Rpb24nIGluc3RlYWRgKVxuXG4gIHJldHVybiB7XG4gICAgLi4ub3RoZXJPcHRpb25zLFxuICAgIC4uLihwcm9qZWN0aW9uIHx8IGZpZWxkcyA/IHsgcHJvamVjdGlvbjogZmllbGRzIHx8IHByb2plY3Rpb24gfSA6IHt9KSxcbiAgfTtcbn07XG4iLCJpbXBvcnQgeyBPYnNlcnZlSGFuZGxlQ2FsbGJhY2ssIE9ic2VydmVNdWx0aXBsZXhlciB9IGZyb20gJy4vb2JzZXJ2ZV9tdWx0aXBsZXgnO1xuXG5sZXQgbmV4dE9ic2VydmVIYW5kbGVJZCA9IDE7XG5cbmV4cG9ydCB0eXBlIE9ic2VydmVIYW5kbGVDYWxsYmFja0ludGVybmFsID0gJ19hZGRlZCcgfCAnX2FkZGVkQmVmb3JlJyB8ICdfY2hhbmdlZCcgfCAnX21vdmVkQmVmb3JlJyB8ICdfcmVtb3ZlZCc7XG5cblxuZXhwb3J0IHR5cGUgQ2FsbGJhY2s8VCA9IGFueT4gPSAoLi4uYXJnczogVFtdKSA9PiBQcm9taXNlPHZvaWQ+IHwgdm9pZDtcblxuLyoqXG4gKiBUaGUgXCJvYnNlcnZlIGhhbmRsZVwiIHJldHVybmVkIGZyb20gb2JzZXJ2ZUNoYW5nZXMuXG4gKiBDb250YWlucyBhIHJlZmVyZW5jZSB0byBhbiBPYnNlcnZlTXVsdGlwbGV4ZXIuXG4gKiBVc2VkIHRvIHN0b3Agb2JzZXJ2YXRpb24gYW5kIGNsZWFuIHVwIHJlc291cmNlcy5cbiAqL1xuZXhwb3J0IGNsYXNzIE9ic2VydmVIYW5kbGU8VCA9IGFueT4ge1xuICBfaWQ6IG51bWJlcjtcbiAgX211bHRpcGxleGVyOiBPYnNlcnZlTXVsdGlwbGV4ZXI7XG4gIG5vbk11dGF0aW5nQ2FsbGJhY2tzOiBib29sZWFuO1xuICBfc3RvcHBlZDogYm9vbGVhbjtcblxuICBwdWJsaWMgaW5pdGlhbEFkZHNTZW50UmVzb2x2ZXI6ICh2YWx1ZTogdm9pZCkgPT4gdm9pZCA9ICgpID0+IHt9O1xuICBwdWJsaWMgaW5pdGlhbEFkZHNTZW50OiBQcm9taXNlPHZvaWQ+XG5cbiAgX2FkZGVkPzogQ2FsbGJhY2s8VD47XG4gIF9hZGRlZEJlZm9yZT86IENhbGxiYWNrPFQ+O1xuICBfY2hhbmdlZD86IENhbGxiYWNrPFQ+O1xuICBfbW92ZWRCZWZvcmU/OiBDYWxsYmFjazxUPjtcbiAgX3JlbW92ZWQ/OiBDYWxsYmFjazxUPjtcblxuICBjb25zdHJ1Y3RvcihtdWx0aXBsZXhlcjogT2JzZXJ2ZU11bHRpcGxleGVyLCBjYWxsYmFja3M6IFJlY29yZDxPYnNlcnZlSGFuZGxlQ2FsbGJhY2ssIENhbGxiYWNrPFQ+Piwgbm9uTXV0YXRpbmdDYWxsYmFja3M6IGJvb2xlYW4pIHtcbiAgICB0aGlzLl9tdWx0aXBsZXhlciA9IG11bHRpcGxleGVyO1xuXG4gICAgbXVsdGlwbGV4ZXIuY2FsbGJhY2tOYW1lcygpLmZvckVhY2goKG5hbWU6IE9ic2VydmVIYW5kbGVDYWxsYmFjaykgPT4ge1xuICAgICAgaWYgKGNhbGxiYWNrc1tuYW1lXSkge1xuICAgICAgICB0aGlzW2BfJHtuYW1lfWAgYXMgT2JzZXJ2ZUhhbmRsZUNhbGxiYWNrSW50ZXJuYWxdID0gY2FsbGJhY2tzW25hbWVdO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmIChuYW1lID09PSBcImFkZGVkQmVmb3JlXCIgJiYgY2FsbGJhY2tzLmFkZGVkKSB7XG4gICAgICAgIHRoaXMuX2FkZGVkQmVmb3JlID0gYXN5bmMgZnVuY3Rpb24gKGlkLCBmaWVsZHMsIGJlZm9yZSkge1xuICAgICAgICAgIGF3YWl0IGNhbGxiYWNrcy5hZGRlZChpZCwgZmllbGRzKTtcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHRoaXMuX3N0b3BwZWQgPSBmYWxzZTtcbiAgICB0aGlzLl9pZCA9IG5leHRPYnNlcnZlSGFuZGxlSWQrKztcbiAgICB0aGlzLm5vbk11dGF0aW5nQ2FsbGJhY2tzID0gbm9uTXV0YXRpbmdDYWxsYmFja3M7XG5cbiAgICB0aGlzLmluaXRpYWxBZGRzU2VudCA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgY29uc3QgcmVhZHkgPSAoKSA9PiB7XG4gICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgdGhpcy5pbml0aWFsQWRkc1NlbnQgPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdGltZW91dCA9IHNldFRpbWVvdXQocmVhZHksIDMwMDAwKVxuXG4gICAgICB0aGlzLmluaXRpYWxBZGRzU2VudFJlc29sdmVyID0gKCkgPT4ge1xuICAgICAgICByZWFkeSgpO1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICB9O1xuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFVzaW5nIHByb3BlcnR5IHN5bnRheCBhbmQgYXJyb3cgZnVuY3Rpb24gc3ludGF4IHRvIGF2b2lkIGJpbmRpbmcgdGhlIHdyb25nIGNvbnRleHQgb24gY2FsbGJhY2tzLlxuICAgKi9cbiAgc3RvcCA9IGFzeW5jICgpID0+IHtcbiAgICBpZiAodGhpcy5fc3RvcHBlZCkgcmV0dXJuO1xuICAgIHRoaXMuX3N0b3BwZWQgPSB0cnVlO1xuICAgIGF3YWl0IHRoaXMuX211bHRpcGxleGVyLnJlbW92ZUhhbmRsZSh0aGlzLl9pZCk7XG4gIH1cbn0iXX0=
