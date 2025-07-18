Package["core-runtime"].queue("ddp-client",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;
var check = Package.check.check;
var Match = Package.check.Match;
var Random = Package.random.Random;
var EJSON = Package.ejson.EJSON;
var Tracker = Package.tracker.Tracker;
var Deps = Package.tracker.Deps;
var Retry = Package.retry.Retry;
var IdMap = Package['id-map'].IdMap;
var ECMAScript = Package.ecmascript.ECMAScript;
var Hook = Package['callback-hook'].Hook;
var DDPCommon = Package['ddp-common'].DDPCommon;
var DiffSequence = Package['diff-sequence'].DiffSequence;
var MongoID = Package['mongo-id'].MongoID;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var DDP;

var require = meteorInstall({"node_modules":{"meteor":{"ddp-client":{"server":{"server.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// packages/ddp-client/server/server.js                                                                           //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.link("../common/namespace.js", {
      DDP: "DDP"
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"common":{"connection_stream_handlers.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// packages/ddp-client/common/connection_stream_handlers.js                                                       //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      ConnectionStreamHandlers: () => ConnectionStreamHandlers
    });
    let DDPCommon;
    module.link("meteor/ddp-common", {
      DDPCommon(v) {
        DDPCommon = v;
      }
    }, 0);
    let Meteor;
    module.link("meteor/meteor", {
      Meteor(v) {
        Meteor = v;
      }
    }, 1);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    class ConnectionStreamHandlers {
      constructor(connection) {
        this._connection = connection;
      }

      /**
       * Handles incoming raw messages from the DDP stream
       * @param {String} raw_msg The raw message received from the stream
       */
      async onMessage(raw_msg) {
        let msg;
        try {
          msg = DDPCommon.parseDDP(raw_msg);
        } catch (e) {
          Meteor._debug('Exception while parsing DDP', e);
          return;
        }

        // Any message counts as receiving a pong, as it demonstrates that
        // the server is still alive.
        if (this._connection._heartbeat) {
          this._connection._heartbeat.messageReceived();
        }
        if (msg === null || !msg.msg) {
          if (!msg || !msg.testMessageOnConnect) {
            if (Object.keys(msg).length === 1 && msg.server_id) return;
            Meteor._debug('discarding invalid livedata message', msg);
          }
          return;
        }

        // Important: This was missing from previous version
        // We need to set the current version before routing the message
        if (msg.msg === 'connected') {
          this._connection._version = this._connection._versionSuggestion;
        }
        await this._routeMessage(msg);
      }

      /**
       * Routes messages to their appropriate handlers based on message type
       * @private
       * @param {Object} msg The parsed DDP message
       */
      async _routeMessage(msg) {
        switch (msg.msg) {
          case 'connected':
            await this._connection._livedata_connected(msg);
            this._connection.options.onConnected();
            break;
          case 'failed':
            await this._handleFailedMessage(msg);
            break;
          case 'ping':
            if (this._connection.options.respondToPings) {
              this._connection._send({
                msg: 'pong',
                id: msg.id
              });
            }
            break;
          case 'pong':
            // noop, as we assume everything's a pong
            break;
          case 'added':
          case 'changed':
          case 'removed':
          case 'ready':
          case 'updated':
            await this._connection._livedata_data(msg);
            break;
          case 'nosub':
            await this._connection._livedata_nosub(msg);
            break;
          case 'result':
            await this._connection._livedata_result(msg);
            break;
          case 'error':
            this._connection._livedata_error(msg);
            break;
          default:
            Meteor._debug('discarding unknown livedata message type', msg);
        }
      }

      /**
       * Handles failed connection messages
       * @private
       * @param {Object} msg The failed message object
       */
      _handleFailedMessage(msg) {
        if (this._connection._supportedDDPVersions.indexOf(msg.version) >= 0) {
          this._connection._versionSuggestion = msg.version;
          this._connection._stream.reconnect({
            _force: true
          });
        } else {
          const description = 'DDP version negotiation failed; server requested version ' + msg.version;
          this._connection._stream.disconnect({
            _permanent: true,
            _error: description
          });
          this._connection.options.onDDPVersionNegotiationFailure(description);
        }
      }

      /**
       * Handles connection reset events
       */
      onReset() {
        // Reset is called even on the first connection, so this is
        // the only place we send this message.
        const msg = this._buildConnectMessage();
        this._connection._send(msg);

        // Mark non-retry calls as failed and handle outstanding methods
        this._handleOutstandingMethodsOnReset();

        // Now, to minimize setup latency, go ahead and blast out all of
        // our pending methods ands subscriptions before we've even taken
        // the necessary RTT to know if we successfully reconnected.
        this._connection._callOnReconnectAndSendAppropriateOutstandingMethods();
        this._resendSubscriptions();
      }

      /**
       * Builds the initial connect message
       * @private
       * @returns {Object} The connect message object
       */
      _buildConnectMessage() {
        const msg = {
          msg: 'connect'
        };
        if (this._connection._lastSessionId) {
          msg.session = this._connection._lastSessionId;
        }
        msg.version = this._connection._versionSuggestion || this._connection._supportedDDPVersions[0];
        this._connection._versionSuggestion = msg.version;
        msg.support = this._connection._supportedDDPVersions;
        return msg;
      }

      /**
       * Handles outstanding methods during a reset
       * @private
       */
      _handleOutstandingMethodsOnReset() {
        const blocks = this._connection._outstandingMethodBlocks;
        if (blocks.length === 0) return;
        const currentMethodBlock = blocks[0].methods;
        blocks[0].methods = currentMethodBlock.filter(methodInvoker => {
          // Methods with 'noRetry' option set are not allowed to re-send after
          // recovering dropped connection.
          if (methodInvoker.sentMessage && methodInvoker.noRetry) {
            methodInvoker.receiveResult(new Meteor.Error('invocation-failed', 'Method invocation might have failed due to dropped connection. ' + 'Failing because `noRetry` option was passed to Meteor.apply.'));
          }

          // Only keep a method if it wasn't sent or it's allowed to retry.
          return !(methodInvoker.sentMessage && methodInvoker.noRetry);
        });

        // Clear empty blocks
        if (blocks.length > 0 && blocks[0].methods.length === 0) {
          blocks.shift();
        }

        // Reset all method invokers as unsent
        Object.values(this._connection._methodInvokers).forEach(invoker => {
          invoker.sentMessage = false;
        });
      }

      /**
       * Resends all active subscriptions
       * @private
       */
      _resendSubscriptions() {
        Object.entries(this._connection._subscriptions).forEach(_ref => {
          let [id, sub] = _ref;
          this._connection._sendQueued({
            msg: 'sub',
            id: id,
            name: sub.name,
            params: sub.params
          });
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
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"document_processors.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// packages/ddp-client/common/document_processors.js                                                              //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      DocumentProcessors: () => DocumentProcessors
    });
    let MongoID;
    module.link("meteor/mongo-id", {
      MongoID(v) {
        MongoID = v;
      }
    }, 0);
    let DiffSequence;
    module.link("meteor/diff-sequence", {
      DiffSequence(v) {
        DiffSequence = v;
      }
    }, 1);
    let hasOwn;
    module.link("meteor/ddp-common/utils", {
      hasOwn(v) {
        hasOwn = v;
      }
    }, 2);
    let isEmpty;
    module.link("meteor/ddp-common/utils", {
      isEmpty(v) {
        isEmpty = v;
      }
    }, 3);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    class DocumentProcessors {
      constructor(connection) {
        this._connection = connection;
      }

      /**
       * @summary Process an 'added' message from the server
       * @param {Object} msg The added message
       * @param {Object} updates The updates accumulator
       */
      async _process_added(msg, updates) {
        const self = this._connection;
        const id = MongoID.idParse(msg.id);
        const serverDoc = self._getServerDoc(msg.collection, id);
        if (serverDoc) {
          // Some outstanding stub wrote here.
          const isExisting = serverDoc.document !== undefined;
          serverDoc.document = msg.fields || Object.create(null);
          serverDoc.document._id = id;
          if (self._resetStores) {
            // During reconnect the server is sending adds for existing ids.
            // Always push an update so that document stays in the store after
            // reset. Use current version of the document for this update, so
            // that stub-written values are preserved.
            const currentDoc = await self._stores[msg.collection].getDoc(msg.id);
            if (currentDoc !== undefined) msg.fields = currentDoc;
            self._pushUpdate(updates, msg.collection, msg);
          } else if (isExisting) {
            throw new Error('Server sent add for existing id: ' + msg.id);
          }
        } else {
          self._pushUpdate(updates, msg.collection, msg);
        }
      }

      /**
       * @summary Process a 'changed' message from the server
       * @param {Object} msg The changed message
       * @param {Object} updates The updates accumulator
       */
      _process_changed(msg, updates) {
        const self = this._connection;
        const serverDoc = self._getServerDoc(msg.collection, MongoID.idParse(msg.id));
        if (serverDoc) {
          if (serverDoc.document === undefined) {
            throw new Error('Server sent changed for nonexisting id: ' + msg.id);
          }
          DiffSequence.applyChanges(serverDoc.document, msg.fields);
        } else {
          self._pushUpdate(updates, msg.collection, msg);
        }
      }

      /**
       * @summary Process a 'removed' message from the server
       * @param {Object} msg The removed message
       * @param {Object} updates The updates accumulator
       */
      _process_removed(msg, updates) {
        const self = this._connection;
        const serverDoc = self._getServerDoc(msg.collection, MongoID.idParse(msg.id));
        if (serverDoc) {
          // Some outstanding stub wrote here.
          if (serverDoc.document === undefined) {
            throw new Error('Server sent removed for nonexisting id:' + msg.id);
          }
          serverDoc.document = undefined;
        } else {
          self._pushUpdate(updates, msg.collection, {
            msg: 'removed',
            collection: msg.collection,
            id: msg.id
          });
        }
      }

      /**
       * @summary Process a 'ready' message from the server
       * @param {Object} msg The ready message
       * @param {Object} updates The updates accumulator
       */
      _process_ready(msg, updates) {
        const self = this._connection;

        // Process "sub ready" messages. "sub ready" messages don't take effect
        // until all current server documents have been flushed to the local
        // database. We can use a write fence to implement this.
        msg.subs.forEach(subId => {
          self._runWhenAllServerDocsAreFlushed(() => {
            const subRecord = self._subscriptions[subId];
            // Did we already unsubscribe?
            if (!subRecord) return;
            // Did we already receive a ready message? (Oops!)
            if (subRecord.ready) return;
            subRecord.ready = true;
            subRecord.readyCallback && subRecord.readyCallback();
            subRecord.readyDeps.changed();
          });
        });
      }

      /**
       * @summary Process an 'updated' message from the server
       * @param {Object} msg The updated message
       * @param {Object} updates The updates accumulator
       */
      _process_updated(msg, updates) {
        const self = this._connection;
        // Process "method done" messages.
        msg.methods.forEach(methodId => {
          const docs = self._documentsWrittenByStub[methodId] || {};
          Object.values(docs).forEach(written => {
            const serverDoc = self._getServerDoc(written.collection, written.id);
            if (!serverDoc) {
              throw new Error('Lost serverDoc for ' + JSON.stringify(written));
            }
            if (!serverDoc.writtenByStubs[methodId]) {
              throw new Error('Doc ' + JSON.stringify(written) + ' not written by method ' + methodId);
            }
            delete serverDoc.writtenByStubs[methodId];
            if (isEmpty(serverDoc.writtenByStubs)) {
              // All methods whose stubs wrote this method have completed! We can
              // now copy the saved document to the database (reverting the stub's
              // change if the server did not write to this object, or applying the
              // server's writes if it did).

              // This is a fake ddp 'replace' message.  It's just for talking
              // between livedata connections and minimongo.  (We have to stringify
              // the ID because it's supposed to look like a wire message.)
              self._pushUpdate(updates, written.collection, {
                msg: 'replace',
                id: MongoID.idStringify(written.id),
                replace: serverDoc.document
              });
              // Call all flush callbacks.
              serverDoc.flushCallbacks.forEach(c => {
                c();
              });

              // Delete this completed serverDocument. Don't bother to GC empty
              // IdMaps inside self._serverDocuments, since there probably aren't
              // many collections and they'll be written repeatedly.
              self._serverDocuments[written.collection].remove(written.id);
            }
          });
          delete self._documentsWrittenByStub[methodId];

          // We want to call the data-written callback, but we can't do so until all
          // currently buffered messages are flushed.
          const callbackInvoker = self._methodInvokers[methodId];
          if (!callbackInvoker) {
            throw new Error('No callback invoker for method ' + methodId);
          }
          self._runWhenAllServerDocsAreFlushed(function () {
            return callbackInvoker.dataVisible(...arguments);
          });
        });
      }

      /**
       * @summary Push an update to the buffer
       * @private
       * @param {Object} updates The updates accumulator
       * @param {String} collection The collection name
       * @param {Object} msg The update message
       */
      _pushUpdate(updates, collection, msg) {
        if (!hasOwn.call(updates, collection)) {
          updates[collection] = [];
        }
        updates[collection].push(msg);
      }

      /**
       * @summary Get a server document by collection and id
       * @private
       * @param {String} collection The collection name
       * @param {String} id The document id
       * @returns {Object|null} The server document or null
       */
      _getServerDoc(collection, id) {
        const self = this._connection;
        if (!hasOwn.call(self._serverDocuments, collection)) {
          return null;
        }
        const serverDocsForCollection = self._serverDocuments[collection];
        return serverDocsForCollection.get(id) || null;
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
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"livedata_connection.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// packages/ddp-client/common/livedata_connection.js                                                              //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
    let _objectSpread;
    module.link("@babel/runtime/helpers/objectSpread2", {
      default(v) {
        _objectSpread = v;
      }
    }, 1);
    const _excluded = ["stubInvocation", "invocation"],
      _excluded2 = ["stubInvocation", "invocation"];
    module.export({
      Connection: () => Connection
    });
    let Meteor;
    module.link("meteor/meteor", {
      Meteor(v) {
        Meteor = v;
      }
    }, 0);
    let DDPCommon;
    module.link("meteor/ddp-common", {
      DDPCommon(v) {
        DDPCommon = v;
      }
    }, 1);
    let Tracker;
    module.link("meteor/tracker", {
      Tracker(v) {
        Tracker = v;
      }
    }, 2);
    let EJSON;
    module.link("meteor/ejson", {
      EJSON(v) {
        EJSON = v;
      }
    }, 3);
    let Random;
    module.link("meteor/random", {
      Random(v) {
        Random = v;
      }
    }, 4);
    let MongoID;
    module.link("meteor/mongo-id", {
      MongoID(v) {
        MongoID = v;
      }
    }, 5);
    let DDP;
    module.link("./namespace.js", {
      DDP(v) {
        DDP = v;
      }
    }, 6);
    let MethodInvoker;
    module.link("./method_invoker", {
      MethodInvoker(v) {
        MethodInvoker = v;
      }
    }, 7);
    let hasOwn, slice, keys, isEmpty, last;
    module.link("meteor/ddp-common/utils", {
      hasOwn(v) {
        hasOwn = v;
      },
      slice(v) {
        slice = v;
      },
      keys(v) {
        keys = v;
      },
      isEmpty(v) {
        isEmpty = v;
      },
      last(v) {
        last = v;
      }
    }, 8);
    let ConnectionStreamHandlers;
    module.link("./connection_stream_handlers", {
      ConnectionStreamHandlers(v) {
        ConnectionStreamHandlers = v;
      }
    }, 9);
    let MongoIDMap;
    module.link("./mongo_id_map", {
      MongoIDMap(v) {
        MongoIDMap = v;
      }
    }, 10);
    let MessageProcessors;
    module.link("./message_processors", {
      MessageProcessors(v) {
        MessageProcessors = v;
      }
    }, 11);
    let DocumentProcessors;
    module.link("./document_processors", {
      DocumentProcessors(v) {
        DocumentProcessors = v;
      }
    }, 12);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    class Connection {
      constructor(url, options) {
        const self = this;
        this.options = options = _objectSpread({
          onConnected() {},
          onDDPVersionNegotiationFailure(description) {
            Meteor._debug(description);
          },
          heartbeatInterval: 17500,
          heartbeatTimeout: 15000,
          npmFayeOptions: Object.create(null),
          // These options are only for testing.
          reloadWithOutstanding: false,
          supportedDDPVersions: DDPCommon.SUPPORTED_DDP_VERSIONS,
          retry: true,
          respondToPings: true,
          // When updates are coming within this ms interval, batch them together.
          bufferedWritesInterval: 5,
          // Flush buffers immediately if writes are happening continuously for more than this many ms.
          bufferedWritesMaxAge: 500
        }, options);

        // If set, called when we reconnect, queuing method calls _before_ the
        // existing outstanding ones.
        // NOTE: This feature has been preserved for backwards compatibility. The
        // preferred method of setting a callback on reconnect is to use
        // DDP.onReconnect.
        self.onReconnect = null;

        // as a test hook, allow passing a stream instead of a url.
        if (typeof url === 'object') {
          self._stream = url;
        } else {
          const {
            ClientStream
          } = require("meteor/socket-stream-client");
          self._stream = new ClientStream(url, {
            retry: options.retry,
            ConnectionError: DDP.ConnectionError,
            headers: options.headers,
            _sockjsOptions: options._sockjsOptions,
            // Used to keep some tests quiet, or for other cases in which
            // the right thing to do with connection errors is to silently
            // fail (e.g. sending package usage stats). At some point we
            // should have a real API for handling client-stream-level
            // errors.
            _dontPrintErrors: options._dontPrintErrors,
            connectTimeoutMs: options.connectTimeoutMs,
            npmFayeOptions: options.npmFayeOptions
          });
        }
        self._lastSessionId = null;
        self._versionSuggestion = null; // The last proposed DDP version.
        self._version = null; // The DDP version agreed on by client and server.
        self._stores = Object.create(null); // name -> object with methods
        self._methodHandlers = Object.create(null); // name -> func
        self._nextMethodId = 1;
        self._supportedDDPVersions = options.supportedDDPVersions;
        self._heartbeatInterval = options.heartbeatInterval;
        self._heartbeatTimeout = options.heartbeatTimeout;

        // Tracks methods which the user has tried to call but which have not yet
        // called their user callback (ie, they are waiting on their result or for all
        // of their writes to be written to the local cache). Map from method ID to
        // MethodInvoker object.
        self._methodInvokers = Object.create(null);

        // Tracks methods which the user has called but whose result messages have not
        // arrived yet.
        //
        // _outstandingMethodBlocks is an array of blocks of methods. Each block
        // represents a set of methods that can run at the same time. The first block
        // represents the methods which are currently in flight; subsequent blocks
        // must wait for previous blocks to be fully finished before they can be sent
        // to the server.
        //
        // Each block is an object with the following fields:
        // - methods: a list of MethodInvoker objects
        // - wait: a boolean; if true, this block had a single method invoked with
        //         the "wait" option
        //
        // There will never be adjacent blocks with wait=false, because the only thing
        // that makes methods need to be serialized is a wait method.
        //
        // Methods are removed from the first block when their "result" is
        // received. The entire first block is only removed when all of the in-flight
        // methods have received their results (so the "methods" list is empty) *AND*
        // all of the data written by those methods are visible in the local cache. So
        // it is possible for the first block's methods list to be empty, if we are
        // still waiting for some objects to quiesce.
        //
        // Example:
        //  _outstandingMethodBlocks = [
        //    {wait: false, methods: []},
        //    {wait: true, methods: [<MethodInvoker for 'login'>]},
        //    {wait: false, methods: [<MethodInvoker for 'foo'>,
        //                            <MethodInvoker for 'bar'>]}]
        // This means that there were some methods which were sent to the server and
        // which have returned their results, but some of the data written by
        // the methods may not be visible in the local cache. Once all that data is
        // visible, we will send a 'login' method. Once the login method has returned
        // and all the data is visible (including re-running subs if userId changes),
        // we will send the 'foo' and 'bar' methods in parallel.
        self._outstandingMethodBlocks = [];

        // method ID -> array of objects with keys 'collection' and 'id', listing
        // documents written by a given method's stub. keys are associated with
        // methods whose stub wrote at least one document, and whose data-done message
        // has not yet been received.
        self._documentsWrittenByStub = {};
        // collection -> IdMap of "server document" object. A "server document" has:
        // - "document": the version of the document according the
        //   server (ie, the snapshot before a stub wrote it, amended by any changes
        //   received from the server)
        //   It is undefined if we think the document does not exist
        // - "writtenByStubs": a set of method IDs whose stubs wrote to the document
        //   whose "data done" messages have not yet been processed
        self._serverDocuments = {};

        // Array of callbacks to be called after the next update of the local
        // cache. Used for:
        //  - Calling methodInvoker.dataVisible and sub ready callbacks after
        //    the relevant data is flushed.
        //  - Invoking the callbacks of "half-finished" methods after reconnect
        //    quiescence. Specifically, methods whose result was received over the old
        //    connection (so we don't re-send it) but whose data had not been made
        //    visible.
        self._afterUpdateCallbacks = [];

        // In two contexts, we buffer all incoming data messages and then process them
        // all at once in a single update:
        //   - During reconnect, we buffer all data messages until all subs that had
        //     been ready before reconnect are ready again, and all methods that are
        //     active have returned their "data done message"; then
        //   - During the execution of a "wait" method, we buffer all data messages
        //     until the wait method gets its "data done" message. (If the wait method
        //     occurs during reconnect, it doesn't get any special handling.)
        // all data messages are processed in one update.
        //
        // The following fields are used for this "quiescence" process.

        // This buffers the messages that aren't being processed yet.
        self._messagesBufferedUntilQuiescence = [];
        // Map from method ID -> true. Methods are removed from this when their
        // "data done" message is received, and we will not quiesce until it is
        // empty.
        self._methodsBlockingQuiescence = {};
        // map from sub ID -> true for subs that were ready (ie, called the sub
        // ready callback) before reconnect but haven't become ready again yet
        self._subsBeingRevived = {}; // map from sub._id -> true
        // if true, the next data update should reset all stores. (set during
        // reconnect.)
        self._resetStores = false;

        // name -> array of updates for (yet to be created) collections
        self._updatesForUnknownStores = {};
        // if we're blocking a migration, the retry func
        self._retryMigrate = null;
        // Collection name -> array of messages.
        self._bufferedWrites = {};
        // When current buffer of updates must be flushed at, in ms timestamp.
        self._bufferedWritesFlushAt = null;
        // Timeout handle for the next processing of all pending writes
        self._bufferedWritesFlushHandle = null;
        self._bufferedWritesInterval = options.bufferedWritesInterval;
        self._bufferedWritesMaxAge = options.bufferedWritesMaxAge;

        // metadata for subscriptions.  Map from sub ID to object with keys:
        //   - id
        //   - name
        //   - params
        //   - inactive (if true, will be cleaned up if not reused in re-run)
        //   - ready (has the 'ready' message been received?)
        //   - readyCallback (an optional callback to call when ready)
        //   - errorCallback (an optional callback to call if the sub terminates with
        //                    an error, XXX COMPAT WITH 1.0.3.1)
        //   - stopCallback (an optional callback to call when the sub terminates
        //     for any reason, with an error argument if an error triggered the stop)
        self._subscriptions = {};

        // Reactive userId.
        self._userId = null;
        self._userIdDeps = new Tracker.Dependency();

        // Block auto-reload while we're waiting for method responses.
        if (Meteor.isClient && Package.reload && !options.reloadWithOutstanding) {
          Package.reload.Reload._onMigrate(retry => {
            if (!self._readyToMigrate()) {
              self._retryMigrate = retry;
              return [false];
            } else {
              return [true];
            }
          });
        }
        this._streamHandlers = new ConnectionStreamHandlers(this);
        const onDisconnect = () => {
          if (this._heartbeat) {
            this._heartbeat.stop();
            this._heartbeat = null;
          }
        };
        if (Meteor.isServer) {
          this._stream.on('message', Meteor.bindEnvironment(msg => this._streamHandlers.onMessage(msg), 'handling DDP message'));
          this._stream.on('reset', Meteor.bindEnvironment(() => this._streamHandlers.onReset(), 'handling DDP reset'));
          this._stream.on('disconnect', Meteor.bindEnvironment(onDisconnect, 'handling DDP disconnect'));
        } else {
          this._stream.on('message', msg => this._streamHandlers.onMessage(msg));
          this._stream.on('reset', () => this._streamHandlers.onReset());
          this._stream.on('disconnect', onDisconnect);
        }
        this._messageProcessors = new MessageProcessors(this);

        // Expose message processor methods to maintain backward compatibility
        this._livedata_connected = msg => this._messageProcessors._livedata_connected(msg);
        this._livedata_data = msg => this._messageProcessors._livedata_data(msg);
        this._livedata_nosub = msg => this._messageProcessors._livedata_nosub(msg);
        this._livedata_result = msg => this._messageProcessors._livedata_result(msg);
        this._livedata_error = msg => this._messageProcessors._livedata_error(msg);
        this._documentProcessors = new DocumentProcessors(this);

        // Expose document processor methods to maintain backward compatibility
        this._process_added = (msg, updates) => this._documentProcessors._process_added(msg, updates);
        this._process_changed = (msg, updates) => this._documentProcessors._process_changed(msg, updates);
        this._process_removed = (msg, updates) => this._documentProcessors._process_removed(msg, updates);
        this._process_ready = (msg, updates) => this._documentProcessors._process_ready(msg, updates);
        this._process_updated = (msg, updates) => this._documentProcessors._process_updated(msg, updates);

        // Also expose utility methods used by other parts of the system
        this._pushUpdate = (updates, collection, msg) => this._documentProcessors._pushUpdate(updates, collection, msg);
        this._getServerDoc = (collection, id) => this._documentProcessors._getServerDoc(collection, id);
      }

      // 'name' is the name of the data on the wire that should go in the
      // store. 'wrappedStore' should be an object with methods beginUpdate, update,
      // endUpdate, saveOriginals, retrieveOriginals. see Collection for an example.
      createStoreMethods(name, wrappedStore) {
        const self = this;
        if (name in self._stores) return false;

        // Wrap the input object in an object which makes any store method not
        // implemented by 'store' into a no-op.
        const store = Object.create(null);
        const keysOfStore = ['update', 'beginUpdate', 'endUpdate', 'saveOriginals', 'retrieveOriginals', 'getDoc', '_getCollection'];
        keysOfStore.forEach(method => {
          store[method] = function () {
            if (wrappedStore[method]) {
              return wrappedStore[method](...arguments);
            }
          };
        });
        self._stores[name] = store;
        return store;
      }
      registerStoreClient(name, wrappedStore) {
        const self = this;
        const store = self.createStoreMethods(name, wrappedStore);
        const queued = self._updatesForUnknownStores[name];
        if (Array.isArray(queued)) {
          store.beginUpdate(queued.length, false);
          queued.forEach(msg => {
            store.update(msg);
          });
          store.endUpdate();
          delete self._updatesForUnknownStores[name];
        }
        return true;
      }
      async registerStoreServer(name, wrappedStore) {
        const self = this;
        const store = self.createStoreMethods(name, wrappedStore);
        const queued = self._updatesForUnknownStores[name];
        if (Array.isArray(queued)) {
          await store.beginUpdate(queued.length, false);
          for (const msg of queued) {
            await store.update(msg);
          }
          await store.endUpdate();
          delete self._updatesForUnknownStores[name];
        }
        return true;
      }

      /**
       * @memberOf Meteor
       * @importFromPackage meteor
       * @alias Meteor.subscribe
       * @summary Subscribe to a record set.  Returns a handle that provides
       * `stop()` and `ready()` methods.
       * @locus Client
       * @param {String} name Name of the subscription.  Matches the name of the
       * server's `publish()` call.
       * @param {EJSONable} [arg1,arg2...] Optional arguments passed to publisher
       * function on server.
       * @param {Function|Object} [callbacks] Optional. May include `onStop`
       * and `onReady` callbacks. If there is an error, it is passed as an
       * argument to `onStop`. If a function is passed instead of an object, it
       * is interpreted as an `onReady` callback.
       */
      subscribe(name /* .. [arguments] .. (callback|callbacks) */) {
        const self = this;
        const params = slice.call(arguments, 1);
        let callbacks = Object.create(null);
        if (params.length) {
          const lastParam = params[params.length - 1];
          if (typeof lastParam === 'function') {
            callbacks.onReady = params.pop();
          } else if (lastParam && [lastParam.onReady,
          // XXX COMPAT WITH 1.0.3.1 onError used to exist, but now we use
          // onStop with an error callback instead.
          lastParam.onError, lastParam.onStop].some(f => typeof f === "function")) {
            callbacks = params.pop();
          }
        }

        // Is there an existing sub with the same name and param, run in an
        // invalidated Computation? This will happen if we are rerunning an
        // existing computation.
        //
        // For example, consider a rerun of:
        //
        //     Tracker.autorun(function () {
        //       Meteor.subscribe("foo", Session.get("foo"));
        //       Meteor.subscribe("bar", Session.get("bar"));
        //     });
        //
        // If "foo" has changed but "bar" has not, we will match the "bar"
        // subcribe to an existing inactive subscription in order to not
        // unsub and resub the subscription unnecessarily.
        //
        // We only look for one such sub; if there are N apparently-identical subs
        // being invalidated, we will require N matching subscribe calls to keep
        // them all active.
        const existing = Object.values(self._subscriptions).find(sub => sub.inactive && sub.name === name && EJSON.equals(sub.params, params));
        let id;
        if (existing) {
          id = existing.id;
          existing.inactive = false; // reactivate

          if (callbacks.onReady) {
            // If the sub is not already ready, replace any ready callback with the
            // one provided now. (It's not really clear what users would expect for
            // an onReady callback inside an autorun; the semantics we provide is
            // that at the time the sub first becomes ready, we call the last
            // onReady callback provided, if any.)
            // If the sub is already ready, run the ready callback right away.
            // It seems that users would expect an onReady callback inside an
            // autorun to trigger once the sub first becomes ready and also
            // when re-subs happens.
            if (existing.ready) {
              callbacks.onReady();
            } else {
              existing.readyCallback = callbacks.onReady;
            }
          }

          // XXX COMPAT WITH 1.0.3.1 we used to have onError but now we call
          // onStop with an optional error argument
          if (callbacks.onError) {
            // Replace existing callback if any, so that errors aren't
            // double-reported.
            existing.errorCallback = callbacks.onError;
          }
          if (callbacks.onStop) {
            existing.stopCallback = callbacks.onStop;
          }
        } else {
          // New sub! Generate an id, save it locally, and send message.
          id = Random.id();
          self._subscriptions[id] = {
            id: id,
            name: name,
            params: EJSON.clone(params),
            inactive: false,
            ready: false,
            readyDeps: new Tracker.Dependency(),
            readyCallback: callbacks.onReady,
            // XXX COMPAT WITH 1.0.3.1 #errorCallback
            errorCallback: callbacks.onError,
            stopCallback: callbacks.onStop,
            connection: self,
            remove() {
              delete this.connection._subscriptions[this.id];
              this.ready && this.readyDeps.changed();
            },
            stop() {
              this.connection._sendQueued({
                msg: 'unsub',
                id: id
              });
              this.remove();
              if (callbacks.onStop) {
                callbacks.onStop();
              }
            }
          };
          self._send({
            msg: 'sub',
            id: id,
            name: name,
            params: params
          });
        }

        // return a handle to the application.
        const handle = {
          stop() {
            if (!hasOwn.call(self._subscriptions, id)) {
              return;
            }
            self._subscriptions[id].stop();
          },
          ready() {
            // return false if we've unsubscribed.
            if (!hasOwn.call(self._subscriptions, id)) {
              return false;
            }
            const record = self._subscriptions[id];
            record.readyDeps.depend();
            return record.ready;
          },
          subscriptionId: id
        };
        if (Tracker.active) {
          // We're in a reactive computation, so we'd like to unsubscribe when the
          // computation is invalidated... but not if the rerun just re-subscribes
          // to the same subscription!  When a rerun happens, we use onInvalidate
          // as a change to mark the subscription "inactive" so that it can
          // be reused from the rerun.  If it isn't reused, it's killed from
          // an afterFlush.
          Tracker.onInvalidate(c => {
            if (hasOwn.call(self._subscriptions, id)) {
              self._subscriptions[id].inactive = true;
            }
            Tracker.afterFlush(() => {
              if (hasOwn.call(self._subscriptions, id) && self._subscriptions[id].inactive) {
                handle.stop();
              }
            });
          });
        }
        return handle;
      }

      /**
       * @summary Tells if the method call came from a call or a callAsync.
       * @alias Meteor.isAsyncCall
       * @locus Anywhere
       * @memberOf Meteor
       * @importFromPackage meteor
       * @returns boolean
       */
      isAsyncCall() {
        return DDP._CurrentMethodInvocation._isCallAsyncMethodRunning();
      }
      methods(methods) {
        Object.entries(methods).forEach(_ref => {
          let [name, func] = _ref;
          if (typeof func !== 'function') {
            throw new Error("Method '" + name + "' must be a function");
          }
          if (this._methodHandlers[name]) {
            throw new Error("A method named '" + name + "' is already defined");
          }
          this._methodHandlers[name] = func;
        });
      }
      _getIsSimulation(_ref2) {
        let {
          isFromCallAsync,
          alreadyInSimulation
        } = _ref2;
        if (!isFromCallAsync) {
          return alreadyInSimulation;
        }
        return alreadyInSimulation && DDP._CurrentMethodInvocation._isCallAsyncMethodRunning();
      }

      /**
       * @memberOf Meteor
       * @importFromPackage meteor
       * @alias Meteor.call
       * @summary Invokes a method with a sync stub, passing any number of arguments.
       * @locus Anywhere
       * @param {String} name Name of method to invoke
       * @param {EJSONable} [arg1,arg2...] Optional method arguments
       * @param {Function} [asyncCallback] Optional callback, which is called asynchronously with the error or result after the method is complete. If not provided, the method runs synchronously if possible (see below).
       */
      call(name /* .. [arguments] .. callback */) {
        // if it's a function, the last argument is the result callback,
        // not a parameter to the remote method.
        const args = slice.call(arguments, 1);
        let callback;
        if (args.length && typeof args[args.length - 1] === 'function') {
          callback = args.pop();
        }
        return this.apply(name, args, callback);
      }
      /**
       * @memberOf Meteor
       * @importFromPackage meteor
       * @alias Meteor.callAsync
       * @summary Invokes a method with an async stub, passing any number of arguments.
       * @locus Anywhere
       * @param {String} name Name of method to invoke
       * @param {EJSONable} [arg1,arg2...] Optional method arguments
       * @returns {Promise}
       */
      callAsync(name /* .. [arguments] .. */) {
        const args = slice.call(arguments, 1);
        if (args.length && typeof args[args.length - 1] === 'function') {
          throw new Error("Meteor.callAsync() does not accept a callback. You should 'await' the result, or use .then().");
        }
        return this.applyAsync(name, args, {
          returnServerResultPromise: true
        });
      }

      /**
       * @memberOf Meteor
       * @importFromPackage meteor
       * @alias Meteor.apply
       * @summary Invoke a method passing an array of arguments.
       * @locus Anywhere
       * @param {String} name Name of method to invoke
       * @param {EJSONable[]} args Method arguments
       * @param {Object} [options]
       * @param {Boolean} options.wait (Client only) If true, don't send this method until all previous method calls have completed, and don't send any subsequent method calls until this one is completed.
       * @param {Function} options.onResultReceived (Client only) This callback is invoked with the error or result of the method (just like `asyncCallback`) as soon as the error or result is available. The local cache may not yet reflect the writes performed by the method.
       * @param {Boolean} options.noRetry (Client only) if true, don't send this method again on reload, simply call the callback an error with the error code 'invocation-failed'.
       * @param {Boolean} options.throwStubExceptions (Client only) If true, exceptions thrown by method stubs will be thrown instead of logged, and the method will not be invoked on the server.
       * @param {Boolean} options.returnStubValue (Client only) If true then in cases where we would have otherwise discarded the stub's return value and returned undefined, instead we go ahead and return it. Specifically, this is any time other than when (a) we are already inside a stub or (b) we are in Node and no callback was provided. Currently we require this flag to be explicitly passed to reduce the likelihood that stub return values will be confused with server return values; we may improve this in future.
       * @param {Function} [asyncCallback] Optional callback; same semantics as in [`Meteor.call`](#meteor_call).
       */
      apply(name, args, options, callback) {
        const _this$_stubCall = this._stubCall(name, EJSON.clone(args)),
          {
            stubInvocation,
            invocation
          } = _this$_stubCall,
          stubOptions = _objectWithoutProperties(_this$_stubCall, _excluded);
        if (stubOptions.hasStub) {
          if (!this._getIsSimulation({
            alreadyInSimulation: stubOptions.alreadyInSimulation,
            isFromCallAsync: stubOptions.isFromCallAsync
          })) {
            this._saveOriginals();
          }
          try {
            stubOptions.stubReturnValue = DDP._CurrentMethodInvocation.withValue(invocation, stubInvocation);
            if (Meteor._isPromise(stubOptions.stubReturnValue)) {
              Meteor._debug("Method ".concat(name, ": Calling a method that has an async method stub with call/apply can lead to unexpected behaviors. Use callAsync/applyAsync instead."));
            }
          } catch (e) {
            stubOptions.exception = e;
          }
        }
        return this._apply(name, stubOptions, args, options, callback);
      }

      /**
       * @memberOf Meteor
       * @importFromPackage meteor
       * @alias Meteor.applyAsync
       * @summary Invoke a method passing an array of arguments.
       * @locus Anywhere
       * @param {String} name Name of method to invoke
       * @param {EJSONable[]} args Method arguments
       * @param {Object} [options]
       * @param {Boolean} options.wait (Client only) If true, don't send this method until all previous method calls have completed, and don't send any subsequent method calls until this one is completed.
       * @param {Function} options.onResultReceived (Client only) This callback is invoked with the error or result of the method (just like `asyncCallback`) as soon as the error or result is available. The local cache may not yet reflect the writes performed by the method.
       * @param {Boolean} options.noRetry (Client only) if true, don't send this method again on reload, simply call the callback an error with the error code 'invocation-failed'.
       * @param {Boolean} options.throwStubExceptions (Client only) If true, exceptions thrown by method stubs will be thrown instead of logged, and the method will not be invoked on the server.
       * @param {Boolean} options.returnStubValue (Client only) If true then in cases where we would have otherwise discarded the stub's return value and returned undefined, instead we go ahead and return it. Specifically, this is any time other than when (a) we are already inside a stub or (b) we are in Node and no callback was provided. Currently we require this flag to be explicitly passed to reduce the likelihood that stub return values will be confused with server return values; we may improve this in future.
       * @param {Boolean} options.returnServerResultPromise (Client only) If true, the promise returned by applyAsync will resolve to the server's return value, rather than the stub's return value. This is useful when you want to ensure that the server's return value is used, even if the stub returns a promise. The same behavior as `callAsync`.
       */
      applyAsync(name, args, options) {
        let callback = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : null;
        const stubPromise = this._applyAsyncStubInvocation(name, args, options);
        const promise = this._applyAsync({
          name,
          args,
          options,
          callback,
          stubPromise
        });
        if (Meteor.isClient) {
          // only return the stubReturnValue
          promise.stubPromise = stubPromise.then(o => {
            if (o.exception) {
              throw o.exception;
            }
            return o.stubReturnValue;
          });
          // this avoids attribute recursion
          promise.serverPromise = new Promise((resolve, reject) => promise.then(resolve).catch(reject));
        }
        return promise;
      }
      async _applyAsyncStubInvocation(name, args, options) {
        const _this$_stubCall2 = this._stubCall(name, EJSON.clone(args), options),
          {
            stubInvocation,
            invocation
          } = _this$_stubCall2,
          stubOptions = _objectWithoutProperties(_this$_stubCall2, _excluded2);
        if (stubOptions.hasStub) {
          if (!this._getIsSimulation({
            alreadyInSimulation: stubOptions.alreadyInSimulation,
            isFromCallAsync: stubOptions.isFromCallAsync
          })) {
            this._saveOriginals();
          }
          try {
            /*
             * The code below follows the same logic as the function withValues().
             *
             * But as the Meteor package is not compiled by ecmascript, it is unable to use newer syntax in the browser,
             * such as, the async/await.
             *
             * So, to keep supporting old browsers, like IE 11, we're creating the logic one level above.
             */
            const currentContext = DDP._CurrentMethodInvocation._setNewContextAndGetCurrent(invocation);
            try {
              stubOptions.stubReturnValue = await stubInvocation();
            } catch (e) {
              stubOptions.exception = e;
            } finally {
              DDP._CurrentMethodInvocation._set(currentContext);
            }
          } catch (e) {
            stubOptions.exception = e;
          }
        }
        return stubOptions;
      }
      async _applyAsync(_ref3) {
        let {
          name,
          args,
          options,
          callback,
          stubPromise
        } = _ref3;
        const stubOptions = await stubPromise;
        return this._apply(name, stubOptions, args, options, callback);
      }
      _apply(name, stubCallValue, args, options, callback) {
        const self = this;

        // We were passed 3 arguments. They may be either (name, args, options)
        // or (name, args, callback)
        if (!callback && typeof options === 'function') {
          callback = options;
          options = Object.create(null);
        }
        options = options || Object.create(null);
        if (callback) {
          // XXX would it be better form to do the binding in stream.on,
          // or caller, instead of here?
          // XXX improve error message (and how we report it)
          callback = Meteor.bindEnvironment(callback, "delivering result of invoking '" + name + "'");
        }
        const {
          hasStub,
          exception,
          stubReturnValue,
          alreadyInSimulation,
          randomSeed
        } = stubCallValue;

        // Keep our args safe from mutation (eg if we don't send the message for a
        // while because of a wait method).
        args = EJSON.clone(args);
        // If we're in a simulation, stop and return the result we have,
        // rather than going on to do an RPC. If there was no stub,
        // we'll end up returning undefined.
        if (this._getIsSimulation({
          alreadyInSimulation,
          isFromCallAsync: stubCallValue.isFromCallAsync
        })) {
          let result;
          if (callback) {
            callback(exception, stubReturnValue);
          } else {
            if (exception) throw exception;
            result = stubReturnValue;
          }
          return options._returnMethodInvoker ? {
            result
          } : result;
        }

        // We only create the methodId here because we don't actually need one if
        // we're already in a simulation
        const methodId = '' + self._nextMethodId++;
        if (hasStub) {
          self._retrieveAndStoreOriginals(methodId);
        }

        // Generate the DDP message for the method call. Note that on the client,
        // it is important that the stub have finished before we send the RPC, so
        // that we know we have a complete list of which local documents the stub
        // wrote.
        const message = {
          msg: 'method',
          id: methodId,
          method: name,
          params: args
        };

        // If an exception occurred in a stub, and we're ignoring it
        // because we're doing an RPC and want to use what the server
        // returns instead, log it so the developer knows
        // (unless they explicitly ask to see the error).
        //
        // Tests can set the '_expectedByTest' flag on an exception so it won't
        // go to log.
        if (exception) {
          if (options.throwStubExceptions) {
            throw exception;
          } else if (!exception._expectedByTest) {
            Meteor._debug("Exception while simulating the effect of invoking '" + name + "'", exception);
          }
        }

        // At this point we're definitely doing an RPC, and we're going to
        // return the value of the RPC to the caller.

        // If the caller didn't give a callback, decide what to do.
        let promise;
        if (!callback) {
          if (Meteor.isClient && !options.returnServerResultPromise && (!options.isFromCallAsync || options.returnStubValue)) {
            callback = err => {
              err && Meteor._debug("Error invoking Method '" + name + "'", err);
            };
          } else {
            promise = new Promise((resolve, reject) => {
              callback = function () {
                for (var _len = arguments.length, allArgs = new Array(_len), _key = 0; _key < _len; _key++) {
                  allArgs[_key] = arguments[_key];
                }
                let args = Array.from(allArgs);
                let err = args.shift();
                if (err) {
                  reject(err);
                  return;
                }
                resolve(...args);
              };
            });
          }
        }

        // Send the randomSeed only if we used it
        if (randomSeed.value !== null) {
          message.randomSeed = randomSeed.value;
        }
        const methodInvoker = new MethodInvoker({
          methodId,
          callback: callback,
          connection: self,
          onResultReceived: options.onResultReceived,
          wait: !!options.wait,
          message: message,
          noRetry: !!options.noRetry
        });
        let result;
        if (promise) {
          result = options.returnStubValue ? promise.then(() => stubReturnValue) : promise;
        } else {
          result = options.returnStubValue ? stubReturnValue : undefined;
        }
        if (options._returnMethodInvoker) {
          return {
            methodInvoker,
            result
          };
        }
        self._addOutstandingMethod(methodInvoker, options);
        return result;
      }
      _stubCall(name, args, options) {
        // Run the stub, if we have one. The stub is supposed to make some
        // temporary writes to the database to give the user a smooth experience
        // until the actual result of executing the method comes back from the
        // server (whereupon the temporary writes to the database will be reversed
        // during the beginUpdate/endUpdate process.)
        //
        // Normally, we ignore the return value of the stub (even if it is an
        // exception), in favor of the real return value from the server. The
        // exception is if the *caller* is a stub. In that case, we're not going
        // to do a RPC, so we use the return value of the stub as our return
        // value.
        const self = this;
        const enclosing = DDP._CurrentMethodInvocation.get();
        const stub = self._methodHandlers[name];
        const alreadyInSimulation = enclosing === null || enclosing === void 0 ? void 0 : enclosing.isSimulation;
        const isFromCallAsync = enclosing === null || enclosing === void 0 ? void 0 : enclosing._isFromCallAsync;
        const randomSeed = {
          value: null
        };
        const defaultReturn = {
          alreadyInSimulation,
          randomSeed,
          isFromCallAsync
        };
        if (!stub) {
          return _objectSpread(_objectSpread({}, defaultReturn), {}, {
            hasStub: false
          });
        }

        // Lazily generate a randomSeed, only if it is requested by the stub.
        // The random streams only have utility if they're used on both the client
        // and the server; if the client doesn't generate any 'random' values
        // then we don't expect the server to generate any either.
        // Less commonly, the server may perform different actions from the client,
        // and may in fact generate values where the client did not, but we don't
        // have any client-side values to match, so even here we may as well just
        // use a random seed on the server.  In that case, we don't pass the
        // randomSeed to save bandwidth, and we don't even generate it to save a
        // bit of CPU and to avoid consuming entropy.

        const randomSeedGenerator = () => {
          if (randomSeed.value === null) {
            randomSeed.value = DDPCommon.makeRpcSeed(enclosing, name);
          }
          return randomSeed.value;
        };
        const setUserId = userId => {
          self.setUserId(userId);
        };
        const invocation = new DDPCommon.MethodInvocation({
          name,
          isSimulation: true,
          userId: self.userId(),
          isFromCallAsync: options === null || options === void 0 ? void 0 : options.isFromCallAsync,
          setUserId: setUserId,
          randomSeed() {
            return randomSeedGenerator();
          }
        });

        // Note that unlike in the corresponding server code, we never audit
        // that stubs check() their arguments.
        const stubInvocation = () => {
          if (Meteor.isServer) {
            // Because saveOriginals and retrieveOriginals aren't reentrant,
            // don't allow stubs to yield.
            return Meteor._noYieldsAllowed(() => {
              // re-clone, so that the stub can't affect our caller's values
              return stub.apply(invocation, EJSON.clone(args));
            });
          } else {
            return stub.apply(invocation, EJSON.clone(args));
          }
        };
        return _objectSpread(_objectSpread({}, defaultReturn), {}, {
          hasStub: true,
          stubInvocation,
          invocation
        });
      }

      // Before calling a method stub, prepare all stores to track changes and allow
      // _retrieveAndStoreOriginals to get the original versions of changed
      // documents.
      _saveOriginals() {
        if (!this._waitingForQuiescence()) {
          this._flushBufferedWrites();
        }
        Object.values(this._stores).forEach(store => {
          store.saveOriginals();
        });
      }

      // Retrieves the original versions of all documents modified by the stub for
      // method 'methodId' from all stores and saves them to _serverDocuments (keyed
      // by document) and _documentsWrittenByStub (keyed by method ID).
      _retrieveAndStoreOriginals(methodId) {
        const self = this;
        if (self._documentsWrittenByStub[methodId]) throw new Error('Duplicate methodId in _retrieveAndStoreOriginals');
        const docsWritten = [];
        Object.entries(self._stores).forEach(_ref4 => {
          let [collection, store] = _ref4;
          const originals = store.retrieveOriginals();
          // not all stores define retrieveOriginals
          if (!originals) return;
          originals.forEach((doc, id) => {
            docsWritten.push({
              collection,
              id
            });
            if (!hasOwn.call(self._serverDocuments, collection)) {
              self._serverDocuments[collection] = new MongoIDMap();
            }
            const serverDoc = self._serverDocuments[collection].setDefault(id, Object.create(null));
            if (serverDoc.writtenByStubs) {
              // We're not the first stub to write this doc. Just add our method ID
              // to the record.
              serverDoc.writtenByStubs[methodId] = true;
            } else {
              // First stub! Save the original value and our method ID.
              serverDoc.document = doc;
              serverDoc.flushCallbacks = [];
              serverDoc.writtenByStubs = Object.create(null);
              serverDoc.writtenByStubs[methodId] = true;
            }
          });
        });
        if (!isEmpty(docsWritten)) {
          self._documentsWrittenByStub[methodId] = docsWritten;
        }
      }

      // This is very much a private function we use to make the tests
      // take up fewer server resources after they complete.
      _unsubscribeAll() {
        Object.values(this._subscriptions).forEach(sub => {
          // Avoid killing the autoupdate subscription so that developers
          // still get hot code pushes when writing tests.
          //
          // XXX it's a hack to encode knowledge about autoupdate here,
          // but it doesn't seem worth it yet to have a special API for
          // subscriptions to preserve after unit tests.
          if (sub.name !== 'meteor_autoupdate_clientVersions') {
            sub.stop();
          }
        });
      }

      // Sends the DDP stringification of the given message object
      _send(obj) {
        this._stream.send(DDPCommon.stringifyDDP(obj));
      }

      // Always queues the call before sending the message
      // Used, for example, on subscription.[id].stop() to make sure a "sub" message is always called before an "unsub" message
      // https://github.com/meteor/meteor/issues/13212
      //
      // This is part of the actual fix for the rest check:
      // https://github.com/meteor/meteor/pull/13236
      _sendQueued(obj) {
        this._send(obj, true);
      }

      // We detected via DDP-level heartbeats that we've lost the
      // connection.  Unlike `disconnect` or `close`, a lost connection
      // will be automatically retried.
      _lostConnection(error) {
        this._stream._lostConnection(error);
      }

      /**
       * @memberOf Meteor
       * @importFromPackage meteor
       * @alias Meteor.status
       * @summary Get the current connection status. A reactive data source.
       * @locus Client
       */
      status() {
        return this._stream.status(...arguments);
      }

      /**
       * @summary Force an immediate reconnection attempt if the client is not connected to the server.
       This method does nothing if the client is already connected.
       * @memberOf Meteor
       * @importFromPackage meteor
       * @alias Meteor.reconnect
       * @locus Client
       */
      reconnect() {
        return this._stream.reconnect(...arguments);
      }

      /**
       * @memberOf Meteor
       * @importFromPackage meteor
       * @alias Meteor.disconnect
       * @summary Disconnect the client from the server.
       * @locus Client
       */
      disconnect() {
        return this._stream.disconnect(...arguments);
      }
      close() {
        return this._stream.disconnect({
          _permanent: true
        });
      }

      ///
      /// Reactive user system
      ///
      userId() {
        if (this._userIdDeps) this._userIdDeps.depend();
        return this._userId;
      }
      setUserId(userId) {
        // Avoid invalidating dependents if setUserId is called with current value.
        if (this._userId === userId) return;
        this._userId = userId;
        if (this._userIdDeps) this._userIdDeps.changed();
      }

      // Returns true if we are in a state after reconnect of waiting for subs to be
      // revived or early methods to finish their data, or we are waiting for a
      // "wait" method to finish.
      _waitingForQuiescence() {
        return !isEmpty(this._subsBeingRevived) || !isEmpty(this._methodsBlockingQuiescence);
      }

      // Returns true if any method whose message has been sent to the server has
      // not yet invoked its user callback.
      _anyMethodsAreOutstanding() {
        const invokers = this._methodInvokers;
        return Object.values(invokers).some(invoker => !!invoker.sentMessage);
      }
      async _processOneDataMessage(msg, updates) {
        const messageType = msg.msg;

        // msg is one of ['added', 'changed', 'removed', 'ready', 'updated']
        if (messageType === 'added') {
          await this._process_added(msg, updates);
        } else if (messageType === 'changed') {
          this._process_changed(msg, updates);
        } else if (messageType === 'removed') {
          this._process_removed(msg, updates);
        } else if (messageType === 'ready') {
          this._process_ready(msg, updates);
        } else if (messageType === 'updated') {
          this._process_updated(msg, updates);
        } else if (messageType === 'nosub') {
          // ignore this
        } else {
          Meteor._debug('discarding unknown livedata data message type', msg);
        }
      }
      _prepareBuffersToFlush() {
        const self = this;
        if (self._bufferedWritesFlushHandle) {
          clearTimeout(self._bufferedWritesFlushHandle);
          self._bufferedWritesFlushHandle = null;
        }
        self._bufferedWritesFlushAt = null;
        // We need to clear the buffer before passing it to
        //  performWrites. As there's no guarantee that it
        //  will exit cleanly.
        const writes = self._bufferedWrites;
        self._bufferedWrites = Object.create(null);
        return writes;
      }

      /**
       * Server-side store updates handled asynchronously
       * @private
       */
      async _performWritesServer(updates) {
        const self = this;
        if (self._resetStores || !isEmpty(updates)) {
          // Start all store updates - keeping original loop structure
          for (const store of Object.values(self._stores)) {
            var _updates$store$_name;
            await store.beginUpdate(((_updates$store$_name = updates[store._name]) === null || _updates$store$_name === void 0 ? void 0 : _updates$store$_name.length) || 0, self._resetStores);
          }
          self._resetStores = false;

          // Process each store's updates sequentially as before
          for (const [storeName, messages] of Object.entries(updates)) {
            const store = self._stores[storeName];
            if (store) {
              // Batch each store's messages in modest chunks to prevent event loop blocking
              // while maintaining operation order
              const CHUNK_SIZE = 100;
              for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
                const chunk = messages.slice(i, Math.min(i + CHUNK_SIZE, messages.length));
                for (const msg of chunk) {
                  await store.update(msg);
                }
                await new Promise(resolve => process.nextTick(resolve));
              }
            } else {
              // Queue updates for uninitialized stores
              self._updatesForUnknownStores[storeName] = self._updatesForUnknownStores[storeName] || [];
              self._updatesForUnknownStores[storeName].push(...messages);
            }
          }

          // Complete all updates
          for (const store of Object.values(self._stores)) {
            await store.endUpdate();
          }
        }
        self._runAfterUpdateCallbacks();
      }

      /**
       * Client-side store updates handled synchronously for optimistic UI
       * @private
       */
      _performWritesClient(updates) {
        const self = this;
        if (self._resetStores || !isEmpty(updates)) {
          // Synchronous store updates for client
          Object.values(self._stores).forEach(store => {
            var _updates$store$_name2;
            store.beginUpdate(((_updates$store$_name2 = updates[store._name]) === null || _updates$store$_name2 === void 0 ? void 0 : _updates$store$_name2.length) || 0, self._resetStores);
          });
          self._resetStores = false;
          Object.entries(updates).forEach(_ref5 => {
            let [storeName, messages] = _ref5;
            const store = self._stores[storeName];
            if (store) {
              messages.forEach(msg => store.update(msg));
            } else {
              self._updatesForUnknownStores[storeName] = self._updatesForUnknownStores[storeName] || [];
              self._updatesForUnknownStores[storeName].push(...messages);
            }
          });
          Object.values(self._stores).forEach(store => store.endUpdate());
        }
        self._runAfterUpdateCallbacks();
      }

      /**
       * Executes buffered writes either synchronously (client) or async (server)
       * @private
       */
      async _flushBufferedWrites() {
        const self = this;
        const writes = self._prepareBuffersToFlush();
        return Meteor.isClient ? self._performWritesClient(writes) : self._performWritesServer(writes);
      }

      // Call any callbacks deferred with _runWhenAllServerDocsAreFlushed whose
      // relevant docs have been flushed, as well as dataVisible callbacks at
      // reconnect-quiescence time.
      _runAfterUpdateCallbacks() {
        const self = this;
        const callbacks = self._afterUpdateCallbacks;
        self._afterUpdateCallbacks = [];
        callbacks.forEach(c => {
          c();
        });
      }

      // Ensures that "f" will be called after all documents currently in
      // _serverDocuments have been written to the local cache. f will not be called
      // if the connection is lost before then!
      _runWhenAllServerDocsAreFlushed(f) {
        const self = this;
        const runFAfterUpdates = () => {
          self._afterUpdateCallbacks.push(f);
        };
        let unflushedServerDocCount = 0;
        const onServerDocFlush = () => {
          --unflushedServerDocCount;
          if (unflushedServerDocCount === 0) {
            // This was the last doc to flush! Arrange to run f after the updates
            // have been applied.
            runFAfterUpdates();
          }
        };
        Object.values(self._serverDocuments).forEach(serverDocuments => {
          serverDocuments.forEach(serverDoc => {
            const writtenByStubForAMethodWithSentMessage = keys(serverDoc.writtenByStubs).some(methodId => {
              const invoker = self._methodInvokers[methodId];
              return invoker && invoker.sentMessage;
            });
            if (writtenByStubForAMethodWithSentMessage) {
              ++unflushedServerDocCount;
              serverDoc.flushCallbacks.push(onServerDocFlush);
            }
          });
        });
        if (unflushedServerDocCount === 0) {
          // There aren't any buffered docs --- we can call f as soon as the current
          // round of updates is applied!
          runFAfterUpdates();
        }
      }
      _addOutstandingMethod(methodInvoker, options) {
        if (options !== null && options !== void 0 && options.wait) {
          // It's a wait method! Wait methods go in their own block.
          this._outstandingMethodBlocks.push({
            wait: true,
            methods: [methodInvoker]
          });
        } else {
          // Not a wait method. Start a new block if the previous block was a wait
          // block, and add it to the last block of methods.
          if (isEmpty(this._outstandingMethodBlocks) || last(this._outstandingMethodBlocks).wait) {
            this._outstandingMethodBlocks.push({
              wait: false,
              methods: []
            });
          }
          last(this._outstandingMethodBlocks).methods.push(methodInvoker);
        }

        // If we added it to the first block, send it out now.
        if (this._outstandingMethodBlocks.length === 1) {
          methodInvoker.sendMessage();
        }
      }

      // Called by MethodInvoker after a method's callback is invoked.  If this was
      // the last outstanding method in the current block, runs the next block. If
      // there are no more methods, consider accepting a hot code push.
      _outstandingMethodFinished() {
        const self = this;
        if (self._anyMethodsAreOutstanding()) return;

        // No methods are outstanding. This should mean that the first block of
        // methods is empty. (Or it might not exist, if this was a method that
        // half-finished before disconnect/reconnect.)
        if (!isEmpty(self._outstandingMethodBlocks)) {
          const firstBlock = self._outstandingMethodBlocks.shift();
          if (!isEmpty(firstBlock.methods)) throw new Error('No methods outstanding but nonempty block: ' + JSON.stringify(firstBlock));

          // Send the outstanding methods now in the first block.
          if (!isEmpty(self._outstandingMethodBlocks)) self._sendOutstandingMethods();
        }

        // Maybe accept a hot code push.
        self._maybeMigrate();
      }

      // Sends messages for all the methods in the first block in
      // _outstandingMethodBlocks.
      _sendOutstandingMethods() {
        const self = this;
        if (isEmpty(self._outstandingMethodBlocks)) {
          return;
        }
        self._outstandingMethodBlocks[0].methods.forEach(m => {
          m.sendMessage();
        });
      }
      _sendOutstandingMethodBlocksMessages(oldOutstandingMethodBlocks) {
        const self = this;
        if (isEmpty(oldOutstandingMethodBlocks)) return;

        // We have at least one block worth of old outstanding methods to try
        // again. First: did onReconnect actually send anything? If not, we just
        // restore all outstanding methods and run the first block.
        if (isEmpty(self._outstandingMethodBlocks)) {
          self._outstandingMethodBlocks = oldOutstandingMethodBlocks;
          self._sendOutstandingMethods();
          return;
        }

        // OK, there are blocks on both sides. Special case: merge the last block of
        // the reconnect methods with the first block of the original methods, if
        // neither of them are "wait" blocks.
        if (!last(self._outstandingMethodBlocks).wait && !oldOutstandingMethodBlocks[0].wait) {
          oldOutstandingMethodBlocks[0].methods.forEach(m => {
            last(self._outstandingMethodBlocks).methods.push(m);

            // If this "last block" is also the first block, send the message.
            if (self._outstandingMethodBlocks.length === 1) {
              m.sendMessage();
            }
          });
          oldOutstandingMethodBlocks.shift();
        }

        // Now add the rest of the original blocks on.
        self._outstandingMethodBlocks.push(...oldOutstandingMethodBlocks);
      }
      _callOnReconnectAndSendAppropriateOutstandingMethods() {
        const self = this;
        const oldOutstandingMethodBlocks = self._outstandingMethodBlocks;
        self._outstandingMethodBlocks = [];
        self.onReconnect && self.onReconnect();
        DDP._reconnectHook.each(callback => {
          callback(self);
          return true;
        });
        self._sendOutstandingMethodBlocksMessages(oldOutstandingMethodBlocks);
      }

      // We can accept a hot code push if there are no methods in flight.
      _readyToMigrate() {
        return isEmpty(this._methodInvokers);
      }

      // If we were blocking a migration, see if it's now possible to continue.
      // Call whenever the set of outstanding/blocked methods shrinks.
      _maybeMigrate() {
        const self = this;
        if (self._retryMigrate && self._readyToMigrate()) {
          self._retryMigrate();
          self._retryMigrate = null;
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
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"message_processors.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// packages/ddp-client/common/message_processors.js                                                               //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      MessageProcessors: () => MessageProcessors
    });
    let DDPCommon;
    module.link("meteor/ddp-common", {
      DDPCommon(v) {
        DDPCommon = v;
      }
    }, 0);
    let Meteor;
    module.link("meteor/meteor", {
      Meteor(v) {
        Meteor = v;
      }
    }, 1);
    let DDP;
    module.link("./namespace.js", {
      DDP(v) {
        DDP = v;
      }
    }, 2);
    let EJSON;
    module.link("meteor/ejson", {
      EJSON(v) {
        EJSON = v;
      }
    }, 3);
    let isEmpty, hasOwn;
    module.link("meteor/ddp-common/utils", {
      isEmpty(v) {
        isEmpty = v;
      },
      hasOwn(v) {
        hasOwn = v;
      }
    }, 4);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    class MessageProcessors {
      constructor(connection) {
        this._connection = connection;
      }

      /**
       * @summary Process the connection message and set up the session
       * @param {Object} msg The connection message
       */
      async _livedata_connected(msg) {
        const self = this._connection;
        if (self._version !== 'pre1' && self._heartbeatInterval !== 0) {
          self._heartbeat = new DDPCommon.Heartbeat({
            heartbeatInterval: self._heartbeatInterval,
            heartbeatTimeout: self._heartbeatTimeout,
            onTimeout() {
              self._lostConnection(new DDP.ConnectionError('DDP heartbeat timed out'));
            },
            sendPing() {
              self._send({
                msg: 'ping'
              });
            }
          });
          self._heartbeat.start();
        }

        // If this is a reconnect, we'll have to reset all stores.
        if (self._lastSessionId) self._resetStores = true;
        let reconnectedToPreviousSession;
        if (typeof msg.session === 'string') {
          reconnectedToPreviousSession = self._lastSessionId === msg.session;
          self._lastSessionId = msg.session;
        }
        if (reconnectedToPreviousSession) {
          // Successful reconnection -- pick up where we left off.
          return;
        }

        // Server doesn't have our data anymore. Re-sync a new session.

        // Forget about messages we were buffering for unknown collections. They'll
        // be resent if still relevant.
        self._updatesForUnknownStores = Object.create(null);
        if (self._resetStores) {
          // Forget about the effects of stubs. We'll be resetting all collections
          // anyway.
          self._documentsWrittenByStub = Object.create(null);
          self._serverDocuments = Object.create(null);
        }

        // Clear _afterUpdateCallbacks.
        self._afterUpdateCallbacks = [];

        // Mark all named subscriptions which are ready as needing to be revived.
        self._subsBeingRevived = Object.create(null);
        Object.entries(self._subscriptions).forEach(_ref => {
          let [id, sub] = _ref;
          if (sub.ready) {
            self._subsBeingRevived[id] = true;
          }
        });

        // Arrange for "half-finished" methods to have their callbacks run, and
        // track methods that were sent on this connection so that we don't
        // quiesce until they are all done.
        //
        // Start by clearing _methodsBlockingQuiescence: methods sent before
        // reconnect don't matter, and any "wait" methods sent on the new connection
        // that we drop here will be restored by the loop below.
        self._methodsBlockingQuiescence = Object.create(null);
        if (self._resetStores) {
          const invokers = self._methodInvokers;
          Object.keys(invokers).forEach(id => {
            const invoker = invokers[id];
            if (invoker.gotResult()) {
              // This method already got its result, but it didn't call its callback
              // because its data didn't become visible. We did not resend the
              // method RPC. We'll call its callback when we get a full quiesce,
              // since that's as close as we'll get to "data must be visible".
              self._afterUpdateCallbacks.push(function () {
                return invoker.dataVisible(...arguments);
              });
            } else if (invoker.sentMessage) {
              // This method has been sent on this connection (maybe as a resend
              // from the last connection, maybe from onReconnect, maybe just very
              // quickly before processing the connected message).
              //
              // We don't need to do anything special to ensure its callbacks get
              // called, but we'll count it as a method which is preventing
              // reconnect quiescence. (eg, it might be a login method that was run
              // from onReconnect, and we don't want to see flicker by seeing a
              // logged-out state.)
              self._methodsBlockingQuiescence[invoker.methodId] = true;
            }
          });
        }
        self._messagesBufferedUntilQuiescence = [];

        // If we're not waiting on any methods or subs, we can reset the stores and
        // call the callbacks immediately.
        if (!self._waitingForQuiescence()) {
          if (self._resetStores) {
            for (const store of Object.values(self._stores)) {
              await store.beginUpdate(0, true);
              await store.endUpdate();
            }
            self._resetStores = false;
          }
          self._runAfterUpdateCallbacks();
        }
      }

      /**
       * @summary Process various data messages from the server
       * @param {Object} msg The data message
       */
      async _livedata_data(msg) {
        const self = this._connection;
        if (self._waitingForQuiescence()) {
          self._messagesBufferedUntilQuiescence.push(msg);
          if (msg.msg === 'nosub') {
            delete self._subsBeingRevived[msg.id];
          }
          if (msg.subs) {
            msg.subs.forEach(subId => {
              delete self._subsBeingRevived[subId];
            });
          }
          if (msg.methods) {
            msg.methods.forEach(methodId => {
              delete self._methodsBlockingQuiescence[methodId];
            });
          }
          if (self._waitingForQuiescence()) {
            return;
          }

          // No methods or subs are blocking quiescence!
          // We'll now process and all of our buffered messages, reset all stores,
          // and apply them all at once.
          const bufferedMessages = self._messagesBufferedUntilQuiescence;
          for (const bufferedMessage of Object.values(bufferedMessages)) {
            await this._processOneDataMessage(bufferedMessage, self._bufferedWrites);
          }
          self._messagesBufferedUntilQuiescence = [];
        } else {
          await this._processOneDataMessage(msg, self._bufferedWrites);
        }

        // Immediately flush writes when:
        //  1. Buffering is disabled. Or;
        //  2. any non-(added/changed/removed) message arrives.
        const standardWrite = msg.msg === "added" || msg.msg === "changed" || msg.msg === "removed";
        if (self._bufferedWritesInterval === 0 || !standardWrite) {
          await self._flushBufferedWrites();
          return;
        }
        if (self._bufferedWritesFlushAt === null) {
          self._bufferedWritesFlushAt = new Date().valueOf() + self._bufferedWritesMaxAge;
        } else if (self._bufferedWritesFlushAt < new Date().valueOf()) {
          await self._flushBufferedWrites();
          return;
        }
        if (self._bufferedWritesFlushHandle) {
          clearTimeout(self._bufferedWritesFlushHandle);
        }
        self._bufferedWritesFlushHandle = setTimeout(() => {
          self._liveDataWritesPromise = self._flushBufferedWrites();
          if (Meteor._isPromise(self._liveDataWritesPromise)) {
            self._liveDataWritesPromise.finally(() => self._liveDataWritesPromise = undefined);
          }
        }, self._bufferedWritesInterval);
      }

      /**
       * @summary Process individual data messages by type
       * @private
       */
      async _processOneDataMessage(msg, updates) {
        const messageType = msg.msg;
        switch (messageType) {
          case 'added':
            await this._connection._process_added(msg, updates);
            break;
          case 'changed':
            this._connection._process_changed(msg, updates);
            break;
          case 'removed':
            this._connection._process_removed(msg, updates);
            break;
          case 'ready':
            this._connection._process_ready(msg, updates);
            break;
          case 'updated':
            this._connection._process_updated(msg, updates);
            break;
          case 'nosub':
            // ignore this
            break;
          default:
            Meteor._debug('discarding unknown livedata data message type', msg);
        }
      }

      /**
       * @summary Handle method results arriving from the server
       * @param {Object} msg The method result message
       */
      async _livedata_result(msg) {
        const self = this._connection;

        // Lets make sure there are no buffered writes before returning result.
        if (!isEmpty(self._bufferedWrites)) {
          await self._flushBufferedWrites();
        }

        // find the outstanding request
        // should be O(1) in nearly all realistic use cases
        if (isEmpty(self._outstandingMethodBlocks)) {
          Meteor._debug('Received method result but no methods outstanding');
          return;
        }
        const currentMethodBlock = self._outstandingMethodBlocks[0].methods;
        let i;
        const m = currentMethodBlock.find((method, idx) => {
          const found = method.methodId === msg.id;
          if (found) i = idx;
          return found;
        });
        if (!m) {
          Meteor._debug("Can't match method response to original method call", msg);
          return;
        }

        // Remove from current method block. This may leave the block empty, but we
        // don't move on to the next block until the callback has been delivered, in
        // _outstandingMethodFinished.
        currentMethodBlock.splice(i, 1);
        if (hasOwn.call(msg, 'error')) {
          m.receiveResult(new Meteor.Error(msg.error.error, msg.error.reason, msg.error.details));
        } else {
          // msg.result may be undefined if the method didn't return a value
          m.receiveResult(undefined, msg.result);
        }
      }

      /**
       * @summary Handle "nosub" messages arriving from the server
       * @param {Object} msg The nosub message
       */
      async _livedata_nosub(msg) {
        const self = this._connection;

        // First pass it through _livedata_data, which only uses it to help get
        // towards quiescence.
        await this._livedata_data(msg);

        // Do the rest of our processing immediately, with no
        // buffering-until-quiescence.

        // we weren't subbed anyway, or we initiated the unsub.
        if (!hasOwn.call(self._subscriptions, msg.id)) {
          return;
        }

        // XXX COMPAT WITH 1.0.3.1 #errorCallback
        const errorCallback = self._subscriptions[msg.id].errorCallback;
        const stopCallback = self._subscriptions[msg.id].stopCallback;
        self._subscriptions[msg.id].remove();
        const meteorErrorFromMsg = msgArg => {
          return msgArg && msgArg.error && new Meteor.Error(msgArg.error.error, msgArg.error.reason, msgArg.error.details);
        };

        // XXX COMPAT WITH 1.0.3.1 #errorCallback
        if (errorCallback && msg.error) {
          errorCallback(meteorErrorFromMsg(msg));
        }
        if (stopCallback) {
          stopCallback(meteorErrorFromMsg(msg));
        }
      }

      /**
       * @summary Handle errors from the server
       * @param {Object} msg The error message
       */
      _livedata_error(msg) {
        Meteor._debug('Received error from server: ', msg.reason);
        if (msg.offendingMessage) Meteor._debug('For: ', msg.offendingMessage);
      }

      // Document change message processors will be defined in a separate class
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
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"method_invoker.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// packages/ddp-client/common/method_invoker.js                                                                   //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
module.export({
  MethodInvoker: () => MethodInvoker
});
class MethodInvoker {
  constructor(options) {
    // Public (within this file) fields.
    this.methodId = options.methodId;
    this.sentMessage = false;
    this._callback = options.callback;
    this._connection = options.connection;
    this._message = options.message;
    this._onResultReceived = options.onResultReceived || (() => {});
    this._wait = options.wait;
    this.noRetry = options.noRetry;
    this._methodResult = null;
    this._dataVisible = false;

    // Register with the connection.
    this._connection._methodInvokers[this.methodId] = this;
  }
  // Sends the method message to the server. May be called additional times if
  // we lose the connection and reconnect before receiving a result.
  sendMessage() {
    // This function is called before sending a method (including resending on
    // reconnect). We should only (re)send methods where we don't already have a
    // result!
    if (this.gotResult()) throw new Error('sendingMethod is called on method with result');

    // If we're re-sending it, it doesn't matter if data was written the first
    // time.
    this._dataVisible = false;
    this.sentMessage = true;

    // If this is a wait method, make all data messages be buffered until it is
    // done.
    if (this._wait) this._connection._methodsBlockingQuiescence[this.methodId] = true;

    // Actually send the message.
    this._connection._send(this._message);
  }
  // Invoke the callback, if we have both a result and know that all data has
  // been written to the local cache.
  _maybeInvokeCallback() {
    if (this._methodResult && this._dataVisible) {
      // Call the callback. (This won't throw: the callback was wrapped with
      // bindEnvironment.)
      this._callback(this._methodResult[0], this._methodResult[1]);

      // Forget about this method.
      delete this._connection._methodInvokers[this.methodId];

      // Let the connection know that this method is finished, so it can try to
      // move on to the next block of methods.
      this._connection._outstandingMethodFinished();
    }
  }
  // Call with the result of the method from the server. Only may be called
  // once; once it is called, you should not call sendMessage again.
  // If the user provided an onResultReceived callback, call it immediately.
  // Then invoke the main callback if data is also visible.
  receiveResult(err, result) {
    if (this.gotResult()) throw new Error('Methods should only receive results once');
    this._methodResult = [err, result];
    this._onResultReceived(err, result);
    this._maybeInvokeCallback();
  }
  // Call this when all data written by the method is visible. This means that
  // the method has returns its "data is done" message *AND* all server
  // documents that are buffered at that time have been written to the local
  // cache. Invokes the main callback if the result has been received.
  dataVisible() {
    this._dataVisible = true;
    this._maybeInvokeCallback();
  }
  // True if receiveResult has been called.
  gotResult() {
    return !!this._methodResult;
  }
}
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"mongo_id_map.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// packages/ddp-client/common/mongo_id_map.js                                                                     //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      MongoIDMap: () => MongoIDMap
    });
    let MongoID;
    module.link("meteor/mongo-id", {
      MongoID(v) {
        MongoID = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    class MongoIDMap extends IdMap {
      constructor() {
        super(MongoID.idStringify, MongoID.idParse);
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
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"namespace.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// packages/ddp-client/common/namespace.js                                                                        //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      DDP: () => DDP
    });
    let DDPCommon;
    module.link("meteor/ddp-common", {
      DDPCommon(v) {
        DDPCommon = v;
      }
    }, 0);
    let Meteor;
    module.link("meteor/meteor", {
      Meteor(v) {
        Meteor = v;
      }
    }, 1);
    let Connection;
    module.link("./livedata_connection.js", {
      Connection(v) {
        Connection = v;
      }
    }, 2);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    // This array allows the `_allSubscriptionsReady` method below, which
    // is used by the `spiderable` package, to keep track of whether all
    // data is ready.
    const allConnections = [];

    /**
     * @namespace DDP
     * @summary Namespace for DDP-related methods/classes.
     */
    const DDP = {};
    // This is private but it's used in a few places. accounts-base uses
    // it to get the current user. Meteor.setTimeout and friends clear
    // it. We can probably find a better way to factor this.
    DDP._CurrentMethodInvocation = new Meteor.EnvironmentVariable();
    DDP._CurrentPublicationInvocation = new Meteor.EnvironmentVariable();

    // XXX: Keep DDP._CurrentInvocation for backwards-compatibility.
    DDP._CurrentInvocation = DDP._CurrentMethodInvocation;
    DDP._CurrentCallAsyncInvocation = new Meteor.EnvironmentVariable();

    // This is passed into a weird `makeErrorType` function that expects its thing
    // to be a constructor
    function connectionErrorConstructor(message) {
      this.message = message;
    }
    DDP.ConnectionError = Meteor.makeErrorType('DDP.ConnectionError', connectionErrorConstructor);
    DDP.ForcedReconnectError = Meteor.makeErrorType('DDP.ForcedReconnectError', () => {});

    // Returns the named sequence of pseudo-random values.
    // The scope will be DDP._CurrentMethodInvocation.get(), so the stream will produce
    // consistent values for method calls on the client and server.
    DDP.randomStream = name => {
      const scope = DDP._CurrentMethodInvocation.get();
      return DDPCommon.RandomStream.get(scope, name);
    };

    // @param url {String} URL to Meteor app,
    //     e.g.:
    //     "subdomain.meteor.com",
    //     "http://subdomain.meteor.com",
    //     "/",
    //     "ddp+sockjs://ddp--****-foo.meteor.com/sockjs"

    /**
     * @summary Connect to the server of a different Meteor application to subscribe to its document sets and invoke its remote methods.
     * @locus Anywhere
     * @param {String} url The URL of another Meteor application.
     * @param {Object} [options]
     * @param {Boolean} options.reloadWithOutstanding is it OK to reload if there are outstanding methods?
     * @param {Object} options.headers extra headers to send on the websockets connection, for server-to-server DDP only
     * @param {Object} options._sockjsOptions Specifies options to pass through to the sockjs client
     * @param {Function} options.onDDPNegotiationVersionFailure callback when version negotiation fails.
     */
    DDP.connect = (url, options) => {
      const ret = new Connection(url, options);
      allConnections.push(ret); // hack. see below.
      return ret;
    };
    DDP._reconnectHook = new Hook({
      bindEnvironment: false
    });

    /**
     * @summary Register a function to call as the first step of
     * reconnecting. This function can call methods which will be executed before
     * any other outstanding methods. For example, this can be used to re-establish
     * the appropriate authentication context on the connection.
     * @locus Anywhere
     * @param {Function} callback The function to call. It will be called with a
     * single argument, the [connection object](#ddp_connect) that is reconnecting.
     */
    DDP.onReconnect = callback => DDP._reconnectHook.register(callback);

    // Hack for `spiderable` package: a way to see if the page is done
    // loading all the data it needs.
    //
    DDP._allSubscriptionsReady = () => allConnections.every(conn => Object.values(conn._subscriptions).every(sub => sub.ready));
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});


/* Exports */
return {
  export: function () { return {
      DDP: DDP
    };},
  require: require,
  eagerModulePaths: [
    "/node_modules/meteor/ddp-client/server/server.js"
  ],
  mainModulePath: "/node_modules/meteor/ddp-client/server/server.js"
}});

//# sourceURL=meteor://💻app/packages/ddp-client.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvZGRwLWNsaWVudC9zZXJ2ZXIvc2VydmVyLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9kZHAtY2xpZW50L2NvbW1vbi9jb25uZWN0aW9uX3N0cmVhbV9oYW5kbGVycy5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvZGRwLWNsaWVudC9jb21tb24vZG9jdW1lbnRfcHJvY2Vzc29ycy5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvZGRwLWNsaWVudC9jb21tb24vbGl2ZWRhdGFfY29ubmVjdGlvbi5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvZGRwLWNsaWVudC9jb21tb24vbWVzc2FnZV9wcm9jZXNzb3JzLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9kZHAtY2xpZW50L2NvbW1vbi9tZXRob2RfaW52b2tlci5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvZGRwLWNsaWVudC9jb21tb24vbW9uZ29faWRfbWFwLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9kZHAtY2xpZW50L2NvbW1vbi9uYW1lc3BhY2UuanMiXSwibmFtZXMiOlsibW9kdWxlIiwibGluayIsIkREUCIsIl9fcmVpZnlXYWl0Rm9yRGVwc19fIiwiX19yZWlmeV9hc3luY19yZXN1bHRfXyIsIl9yZWlmeUVycm9yIiwic2VsZiIsImFzeW5jIiwiZXhwb3J0IiwiQ29ubmVjdGlvblN0cmVhbUhhbmRsZXJzIiwiRERQQ29tbW9uIiwidiIsIk1ldGVvciIsImNvbnN0cnVjdG9yIiwiY29ubmVjdGlvbiIsIl9jb25uZWN0aW9uIiwib25NZXNzYWdlIiwicmF3X21zZyIsIm1zZyIsInBhcnNlRERQIiwiZSIsIl9kZWJ1ZyIsIl9oZWFydGJlYXQiLCJtZXNzYWdlUmVjZWl2ZWQiLCJ0ZXN0TWVzc2FnZU9uQ29ubmVjdCIsIk9iamVjdCIsImtleXMiLCJsZW5ndGgiLCJzZXJ2ZXJfaWQiLCJfdmVyc2lvbiIsIl92ZXJzaW9uU3VnZ2VzdGlvbiIsIl9yb3V0ZU1lc3NhZ2UiLCJfbGl2ZWRhdGFfY29ubmVjdGVkIiwib3B0aW9ucyIsIm9uQ29ubmVjdGVkIiwiX2hhbmRsZUZhaWxlZE1lc3NhZ2UiLCJyZXNwb25kVG9QaW5ncyIsIl9zZW5kIiwiaWQiLCJfbGl2ZWRhdGFfZGF0YSIsIl9saXZlZGF0YV9ub3N1YiIsIl9saXZlZGF0YV9yZXN1bHQiLCJfbGl2ZWRhdGFfZXJyb3IiLCJfc3VwcG9ydGVkRERQVmVyc2lvbnMiLCJpbmRleE9mIiwidmVyc2lvbiIsIl9zdHJlYW0iLCJyZWNvbm5lY3QiLCJfZm9yY2UiLCJkZXNjcmlwdGlvbiIsImRpc2Nvbm5lY3QiLCJfcGVybWFuZW50IiwiX2Vycm9yIiwib25ERFBWZXJzaW9uTmVnb3RpYXRpb25GYWlsdXJlIiwib25SZXNldCIsIl9idWlsZENvbm5lY3RNZXNzYWdlIiwiX2hhbmRsZU91dHN0YW5kaW5nTWV0aG9kc09uUmVzZXQiLCJfY2FsbE9uUmVjb25uZWN0QW5kU2VuZEFwcHJvcHJpYXRlT3V0c3RhbmRpbmdNZXRob2RzIiwiX3Jlc2VuZFN1YnNjcmlwdGlvbnMiLCJfbGFzdFNlc3Npb25JZCIsInNlc3Npb24iLCJzdXBwb3J0IiwiYmxvY2tzIiwiX291dHN0YW5kaW5nTWV0aG9kQmxvY2tzIiwiY3VycmVudE1ldGhvZEJsb2NrIiwibWV0aG9kcyIsImZpbHRlciIsIm1ldGhvZEludm9rZXIiLCJzZW50TWVzc2FnZSIsIm5vUmV0cnkiLCJyZWNlaXZlUmVzdWx0IiwiRXJyb3IiLCJzaGlmdCIsInZhbHVlcyIsIl9tZXRob2RJbnZva2VycyIsImZvckVhY2giLCJpbnZva2VyIiwiZW50cmllcyIsIl9zdWJzY3JpcHRpb25zIiwiX3JlZiIsInN1YiIsIl9zZW5kUXVldWVkIiwibmFtZSIsInBhcmFtcyIsIkRvY3VtZW50UHJvY2Vzc29ycyIsIk1vbmdvSUQiLCJEaWZmU2VxdWVuY2UiLCJoYXNPd24iLCJpc0VtcHR5IiwiX3Byb2Nlc3NfYWRkZWQiLCJ1cGRhdGVzIiwiaWRQYXJzZSIsInNlcnZlckRvYyIsIl9nZXRTZXJ2ZXJEb2MiLCJjb2xsZWN0aW9uIiwiaXNFeGlzdGluZyIsImRvY3VtZW50IiwidW5kZWZpbmVkIiwiZmllbGRzIiwiY3JlYXRlIiwiX2lkIiwiX3Jlc2V0U3RvcmVzIiwiY3VycmVudERvYyIsIl9zdG9yZXMiLCJnZXREb2MiLCJfcHVzaFVwZGF0ZSIsIl9wcm9jZXNzX2NoYW5nZWQiLCJhcHBseUNoYW5nZXMiLCJfcHJvY2Vzc19yZW1vdmVkIiwiX3Byb2Nlc3NfcmVhZHkiLCJzdWJzIiwic3ViSWQiLCJfcnVuV2hlbkFsbFNlcnZlckRvY3NBcmVGbHVzaGVkIiwic3ViUmVjb3JkIiwicmVhZHkiLCJyZWFkeUNhbGxiYWNrIiwicmVhZHlEZXBzIiwiY2hhbmdlZCIsIl9wcm9jZXNzX3VwZGF0ZWQiLCJtZXRob2RJZCIsImRvY3MiLCJfZG9jdW1lbnRzV3JpdHRlbkJ5U3R1YiIsIndyaXR0ZW4iLCJKU09OIiwic3RyaW5naWZ5Iiwid3JpdHRlbkJ5U3R1YnMiLCJpZFN0cmluZ2lmeSIsInJlcGxhY2UiLCJmbHVzaENhbGxiYWNrcyIsImMiLCJfc2VydmVyRG9jdW1lbnRzIiwicmVtb3ZlIiwiY2FsbGJhY2tJbnZva2VyIiwiZGF0YVZpc2libGUiLCJhcmd1bWVudHMiLCJjYWxsIiwicHVzaCIsInNlcnZlckRvY3NGb3JDb2xsZWN0aW9uIiwiZ2V0IiwiX29iamVjdFdpdGhvdXRQcm9wZXJ0aWVzIiwiZGVmYXVsdCIsIl9vYmplY3RTcHJlYWQiLCJfZXhjbHVkZWQiLCJfZXhjbHVkZWQyIiwiQ29ubmVjdGlvbiIsIlRyYWNrZXIiLCJFSlNPTiIsIlJhbmRvbSIsIk1ldGhvZEludm9rZXIiLCJzbGljZSIsImxhc3QiLCJNb25nb0lETWFwIiwiTWVzc2FnZVByb2Nlc3NvcnMiLCJ1cmwiLCJoZWFydGJlYXRJbnRlcnZhbCIsImhlYXJ0YmVhdFRpbWVvdXQiLCJucG1GYXllT3B0aW9ucyIsInJlbG9hZFdpdGhPdXRzdGFuZGluZyIsInN1cHBvcnRlZEREUFZlcnNpb25zIiwiU1VQUE9SVEVEX0REUF9WRVJTSU9OUyIsInJldHJ5IiwiYnVmZmVyZWRXcml0ZXNJbnRlcnZhbCIsImJ1ZmZlcmVkV3JpdGVzTWF4QWdlIiwib25SZWNvbm5lY3QiLCJDbGllbnRTdHJlYW0iLCJyZXF1aXJlIiwiQ29ubmVjdGlvbkVycm9yIiwiaGVhZGVycyIsIl9zb2NranNPcHRpb25zIiwiX2RvbnRQcmludEVycm9ycyIsImNvbm5lY3RUaW1lb3V0TXMiLCJfbWV0aG9kSGFuZGxlcnMiLCJfbmV4dE1ldGhvZElkIiwiX2hlYXJ0YmVhdEludGVydmFsIiwiX2hlYXJ0YmVhdFRpbWVvdXQiLCJfYWZ0ZXJVcGRhdGVDYWxsYmFja3MiLCJfbWVzc2FnZXNCdWZmZXJlZFVudGlsUXVpZXNjZW5jZSIsIl9tZXRob2RzQmxvY2tpbmdRdWllc2NlbmNlIiwiX3N1YnNCZWluZ1Jldml2ZWQiLCJfdXBkYXRlc0ZvclVua25vd25TdG9yZXMiLCJfcmV0cnlNaWdyYXRlIiwiX2J1ZmZlcmVkV3JpdGVzIiwiX2J1ZmZlcmVkV3JpdGVzRmx1c2hBdCIsIl9idWZmZXJlZFdyaXRlc0ZsdXNoSGFuZGxlIiwiX2J1ZmZlcmVkV3JpdGVzSW50ZXJ2YWwiLCJfYnVmZmVyZWRXcml0ZXNNYXhBZ2UiLCJfdXNlcklkIiwiX3VzZXJJZERlcHMiLCJEZXBlbmRlbmN5IiwiaXNDbGllbnQiLCJQYWNrYWdlIiwicmVsb2FkIiwiUmVsb2FkIiwiX29uTWlncmF0ZSIsIl9yZWFkeVRvTWlncmF0ZSIsIl9zdHJlYW1IYW5kbGVycyIsIm9uRGlzY29ubmVjdCIsInN0b3AiLCJpc1NlcnZlciIsIm9uIiwiYmluZEVudmlyb25tZW50IiwiX21lc3NhZ2VQcm9jZXNzb3JzIiwiX2RvY3VtZW50UHJvY2Vzc29ycyIsImNyZWF0ZVN0b3JlTWV0aG9kcyIsIndyYXBwZWRTdG9yZSIsInN0b3JlIiwia2V5c09mU3RvcmUiLCJtZXRob2QiLCJyZWdpc3RlclN0b3JlQ2xpZW50IiwicXVldWVkIiwiQXJyYXkiLCJpc0FycmF5IiwiYmVnaW5VcGRhdGUiLCJ1cGRhdGUiLCJlbmRVcGRhdGUiLCJyZWdpc3RlclN0b3JlU2VydmVyIiwic3Vic2NyaWJlIiwiY2FsbGJhY2tzIiwibGFzdFBhcmFtIiwib25SZWFkeSIsInBvcCIsIm9uRXJyb3IiLCJvblN0b3AiLCJzb21lIiwiZiIsImV4aXN0aW5nIiwiZmluZCIsImluYWN0aXZlIiwiZXF1YWxzIiwiZXJyb3JDYWxsYmFjayIsInN0b3BDYWxsYmFjayIsImNsb25lIiwiaGFuZGxlIiwicmVjb3JkIiwiZGVwZW5kIiwic3Vic2NyaXB0aW9uSWQiLCJhY3RpdmUiLCJvbkludmFsaWRhdGUiLCJhZnRlckZsdXNoIiwiaXNBc3luY0NhbGwiLCJfQ3VycmVudE1ldGhvZEludm9jYXRpb24iLCJfaXNDYWxsQXN5bmNNZXRob2RSdW5uaW5nIiwiZnVuYyIsIl9nZXRJc1NpbXVsYXRpb24iLCJfcmVmMiIsImlzRnJvbUNhbGxBc3luYyIsImFscmVhZHlJblNpbXVsYXRpb24iLCJhcmdzIiwiY2FsbGJhY2siLCJhcHBseSIsImNhbGxBc3luYyIsImFwcGx5QXN5bmMiLCJyZXR1cm5TZXJ2ZXJSZXN1bHRQcm9taXNlIiwiX3RoaXMkX3N0dWJDYWxsIiwiX3N0dWJDYWxsIiwic3R1Ykludm9jYXRpb24iLCJpbnZvY2F0aW9uIiwic3R1Yk9wdGlvbnMiLCJoYXNTdHViIiwiX3NhdmVPcmlnaW5hbHMiLCJzdHViUmV0dXJuVmFsdWUiLCJ3aXRoVmFsdWUiLCJfaXNQcm9taXNlIiwiY29uY2F0IiwiZXhjZXB0aW9uIiwiX2FwcGx5Iiwic3R1YlByb21pc2UiLCJfYXBwbHlBc3luY1N0dWJJbnZvY2F0aW9uIiwicHJvbWlzZSIsIl9hcHBseUFzeW5jIiwidGhlbiIsIm8iLCJzZXJ2ZXJQcm9taXNlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJjYXRjaCIsIl90aGlzJF9zdHViQ2FsbDIiLCJjdXJyZW50Q29udGV4dCIsIl9zZXROZXdDb250ZXh0QW5kR2V0Q3VycmVudCIsIl9zZXQiLCJfcmVmMyIsInN0dWJDYWxsVmFsdWUiLCJyYW5kb21TZWVkIiwicmVzdWx0IiwiX3JldHVybk1ldGhvZEludm9rZXIiLCJfcmV0cmlldmVBbmRTdG9yZU9yaWdpbmFscyIsIm1lc3NhZ2UiLCJ0aHJvd1N0dWJFeGNlcHRpb25zIiwiX2V4cGVjdGVkQnlUZXN0IiwicmV0dXJuU3R1YlZhbHVlIiwiZXJyIiwiX2xlbiIsImFsbEFyZ3MiLCJfa2V5IiwiZnJvbSIsInZhbHVlIiwib25SZXN1bHRSZWNlaXZlZCIsIndhaXQiLCJfYWRkT3V0c3RhbmRpbmdNZXRob2QiLCJlbmNsb3NpbmciLCJzdHViIiwiaXNTaW11bGF0aW9uIiwiX2lzRnJvbUNhbGxBc3luYyIsImRlZmF1bHRSZXR1cm4iLCJyYW5kb21TZWVkR2VuZXJhdG9yIiwibWFrZVJwY1NlZWQiLCJzZXRVc2VySWQiLCJ1c2VySWQiLCJNZXRob2RJbnZvY2F0aW9uIiwiX25vWWllbGRzQWxsb3dlZCIsIl93YWl0aW5nRm9yUXVpZXNjZW5jZSIsIl9mbHVzaEJ1ZmZlcmVkV3JpdGVzIiwic2F2ZU9yaWdpbmFscyIsImRvY3NXcml0dGVuIiwiX3JlZjQiLCJvcmlnaW5hbHMiLCJyZXRyaWV2ZU9yaWdpbmFscyIsImRvYyIsInNldERlZmF1bHQiLCJfdW5zdWJzY3JpYmVBbGwiLCJvYmoiLCJzZW5kIiwic3RyaW5naWZ5RERQIiwiX2xvc3RDb25uZWN0aW9uIiwiZXJyb3IiLCJzdGF0dXMiLCJjbG9zZSIsIl9hbnlNZXRob2RzQXJlT3V0c3RhbmRpbmciLCJpbnZva2VycyIsIl9wcm9jZXNzT25lRGF0YU1lc3NhZ2UiLCJtZXNzYWdlVHlwZSIsIl9wcmVwYXJlQnVmZmVyc1RvRmx1c2giLCJjbGVhclRpbWVvdXQiLCJ3cml0ZXMiLCJfcGVyZm9ybVdyaXRlc1NlcnZlciIsIl91cGRhdGVzJHN0b3JlJF9uYW1lIiwiX25hbWUiLCJzdG9yZU5hbWUiLCJtZXNzYWdlcyIsIkNIVU5LX1NJWkUiLCJpIiwiY2h1bmsiLCJNYXRoIiwibWluIiwicHJvY2VzcyIsIm5leHRUaWNrIiwiX3J1bkFmdGVyVXBkYXRlQ2FsbGJhY2tzIiwiX3BlcmZvcm1Xcml0ZXNDbGllbnQiLCJfdXBkYXRlcyRzdG9yZSRfbmFtZTIiLCJfcmVmNSIsInJ1bkZBZnRlclVwZGF0ZXMiLCJ1bmZsdXNoZWRTZXJ2ZXJEb2NDb3VudCIsIm9uU2VydmVyRG9jRmx1c2giLCJzZXJ2ZXJEb2N1bWVudHMiLCJ3cml0dGVuQnlTdHViRm9yQU1ldGhvZFdpdGhTZW50TWVzc2FnZSIsInNlbmRNZXNzYWdlIiwiX291dHN0YW5kaW5nTWV0aG9kRmluaXNoZWQiLCJmaXJzdEJsb2NrIiwiX3NlbmRPdXRzdGFuZGluZ01ldGhvZHMiLCJfbWF5YmVNaWdyYXRlIiwibSIsIl9zZW5kT3V0c3RhbmRpbmdNZXRob2RCbG9ja3NNZXNzYWdlcyIsIm9sZE91dHN0YW5kaW5nTWV0aG9kQmxvY2tzIiwiX3JlY29ubmVjdEhvb2siLCJlYWNoIiwiSGVhcnRiZWF0Iiwib25UaW1lb3V0Iiwic2VuZFBpbmciLCJzdGFydCIsInJlY29ubmVjdGVkVG9QcmV2aW91c1Nlc3Npb24iLCJnb3RSZXN1bHQiLCJidWZmZXJlZE1lc3NhZ2VzIiwiYnVmZmVyZWRNZXNzYWdlIiwic3RhbmRhcmRXcml0ZSIsIkRhdGUiLCJ2YWx1ZU9mIiwic2V0VGltZW91dCIsIl9saXZlRGF0YVdyaXRlc1Byb21pc2UiLCJmaW5hbGx5IiwiaWR4IiwiZm91bmQiLCJzcGxpY2UiLCJyZWFzb24iLCJkZXRhaWxzIiwibWV0ZW9yRXJyb3JGcm9tTXNnIiwibXNnQXJnIiwib2ZmZW5kaW5nTWVzc2FnZSIsIl9jYWxsYmFjayIsIl9tZXNzYWdlIiwiX29uUmVzdWx0UmVjZWl2ZWQiLCJfd2FpdCIsIl9tZXRob2RSZXN1bHQiLCJfZGF0YVZpc2libGUiLCJfbWF5YmVJbnZva2VDYWxsYmFjayIsIklkTWFwIiwiYWxsQ29ubmVjdGlvbnMiLCJFbnZpcm9ubWVudFZhcmlhYmxlIiwiX0N1cnJlbnRQdWJsaWNhdGlvbkludm9jYXRpb24iLCJfQ3VycmVudEludm9jYXRpb24iLCJfQ3VycmVudENhbGxBc3luY0ludm9jYXRpb24iLCJjb25uZWN0aW9uRXJyb3JDb25zdHJ1Y3RvciIsIm1ha2VFcnJvclR5cGUiLCJGb3JjZWRSZWNvbm5lY3RFcnJvciIsInJhbmRvbVN0cmVhbSIsInNjb3BlIiwiUmFuZG9tU3RyZWFtIiwiY29ubmVjdCIsInJldCIsIkhvb2siLCJyZWdpc3RlciIsIl9hbGxTdWJzY3JpcHRpb25zUmVhZHkiLCJldmVyeSIsImNvbm4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0lBQUFBLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDLHdCQUF3QixFQUFDO01BQUNDLEdBQUcsRUFBQztJQUFLLENBQUMsRUFBQyxDQUFDLENBQUM7SUFBQyxJQUFJQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNQSxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQUFDQyxzQkFBQTtFQUFBLFNBQUFDLFdBQUE7SUFBQSxPQUFBRCxzQkFBQSxDQUFBQyxXQUFBO0VBQUE7RUFBQUQsc0JBQUE7QUFBQTtFQUFBRSxJQUFBO0VBQUFDLEtBQUE7QUFBQSxHOzs7Ozs7Ozs7Ozs7OztJQ0FqSFAsTUFBTSxDQUFDUSxNQUFNLENBQUM7TUFBQ0Msd0JBQXdCLEVBQUNBLENBQUEsS0FBSUE7SUFBd0IsQ0FBQyxDQUFDO0lBQUMsSUFBSUMsU0FBUztJQUFDVixNQUFNLENBQUNDLElBQUksQ0FBQyxtQkFBbUIsRUFBQztNQUFDUyxTQUFTQSxDQUFDQyxDQUFDLEVBQUM7UUFBQ0QsU0FBUyxHQUFDQyxDQUFDO01BQUE7SUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0lBQUMsSUFBSUMsTUFBTTtJQUFDWixNQUFNLENBQUNDLElBQUksQ0FBQyxlQUFlLEVBQUM7TUFBQ1csTUFBTUEsQ0FBQ0QsQ0FBQyxFQUFDO1FBQUNDLE1BQU0sR0FBQ0QsQ0FBQztNQUFBO0lBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQztJ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O0lBRUR0WixHQUFHLENBQUMwVyxjQUFjLEdBQUcsSUFBSTZDLElBQUksQ0FBQztNQUFFak4sZUFBZSxFQUFFO0lBQU0sQ0FBQyxDQUFDOztJQUV6RDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7SUFDQXRNLEdBQUcsQ0FBQ2lLLFdBQVcsR0FBR3FGLFFBQVEsSUFBSXRQLEdBQUcsQ0FBQzBXLGNBQWMsQ0FBQzhDLFFBQVEsQ0FBQ2xLLFFBQVEsQ0FBQzs7SUFFbkU7SUFDQTtJQUNBO0lBQ0F0UCxHQUFHLENBQUN5WixzQkFBc0IsR0FBRyxNQUFNZixjQUFjLENBQUNnQixLQUFLLENBQ3JEQyxJQUFJLElBQUlwWSxNQUFNLENBQUNnRCxNQUFNLENBQUNvVixJQUFJLENBQUMvVSxjQUFjLENBQUMsQ0FBQzhVLEtBQUssQ0FBQzVVLEdBQUcsSUFBSUEsR0FBRyxDQUFDa0MsS0FBSyxDQUNuRSxDQUFDO0lBQUM5RyxzQkFBQTtFQUFBLFNBQUFDLFdBQUE7SUFBQSxPQUFBRCxzQkFBQSxDQUFBQyxXQUFBO0VBQUE7RUFBQUQsc0JBQUE7QUFBQTtFQUFBRSxJQUFBO0VBQUFDLEtBQUE7QUFBQSxHIiwiZmlsZSI6Ii9wYWNrYWdlcy9kZHAtY2xpZW50LmpzIiwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IHsgRERQIH0gZnJvbSAnLi4vY29tbW9uL25hbWVzcGFjZS5qcyc7XG4iLCJpbXBvcnQgeyBERFBDb21tb24gfSBmcm9tICdtZXRlb3IvZGRwLWNvbW1vbic7XG5pbXBvcnQgeyBNZXRlb3IgfSBmcm9tICdtZXRlb3IvbWV0ZW9yJztcblxuZXhwb3J0IGNsYXNzIENvbm5lY3Rpb25TdHJlYW1IYW5kbGVycyB7XG4gIGNvbnN0cnVjdG9yKGNvbm5lY3Rpb24pIHtcbiAgICB0aGlzLl9jb25uZWN0aW9uID0gY29ubmVjdGlvbjtcbiAgfVxuXG4gIC8qKlxuICAgKiBIYW5kbGVzIGluY29taW5nIHJhdyBtZXNzYWdlcyBmcm9tIHRoZSBERFAgc3RyZWFtXG4gICAqIEBwYXJhbSB7U3RyaW5nfSByYXdfbXNnIFRoZSByYXcgbWVzc2FnZSByZWNlaXZlZCBmcm9tIHRoZSBzdHJlYW1cbiAgICovXG4gIGFzeW5jIG9uTWVzc2FnZShyYXdfbXNnKSB7XG4gICAgbGV0IG1zZztcbiAgICB0cnkge1xuICAgICAgbXNnID0gRERQQ29tbW9uLnBhcnNlRERQKHJhd19tc2cpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIE1ldGVvci5fZGVidWcoJ0V4Y2VwdGlvbiB3aGlsZSBwYXJzaW5nIEREUCcsIGUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIEFueSBtZXNzYWdlIGNvdW50cyBhcyByZWNlaXZpbmcgYSBwb25nLCBhcyBpdCBkZW1vbnN0cmF0ZXMgdGhhdFxuICAgIC8vIHRoZSBzZXJ2ZXIgaXMgc3RpbGwgYWxpdmUuXG4gICAgaWYgKHRoaXMuX2Nvbm5lY3Rpb24uX2hlYXJ0YmVhdCkge1xuICAgICAgdGhpcy5fY29ubmVjdGlvbi5faGVhcnRiZWF0Lm1lc3NhZ2VSZWNlaXZlZCgpO1xuICAgIH1cblxuICAgIGlmIChtc2cgPT09IG51bGwgfHwgIW1zZy5tc2cpIHtcbiAgICAgIGlmKCFtc2cgfHwgIW1zZy50ZXN0TWVzc2FnZU9uQ29ubmVjdCkge1xuICAgICAgICBpZiAoT2JqZWN0LmtleXMobXNnKS5sZW5ndGggPT09IDEgJiYgbXNnLnNlcnZlcl9pZCkgcmV0dXJuO1xuICAgICAgICBNZXRlb3IuX2RlYnVnKCdkaXNjYXJkaW5nIGludmFsaWQgbGl2ZWRhdGEgbWVzc2FnZScsIG1zZyk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gSW1wb3J0YW50OiBUaGlzIHdhcyBtaXNzaW5nIGZyb20gcHJldmlvdXMgdmVyc2lvblxuICAgIC8vIFdlIG5lZWQgdG8gc2V0IHRoZSBjdXJyZW50IHZlcnNpb24gYmVmb3JlIHJvdXRpbmcgdGhlIG1lc3NhZ2VcbiAgICBpZiAobXNnLm1zZyA9PT0gJ2Nvbm5lY3RlZCcpIHtcbiAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uX3ZlcnNpb24gPSB0aGlzLl9jb25uZWN0aW9uLl92ZXJzaW9uU3VnZ2VzdGlvbjtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLl9yb3V0ZU1lc3NhZ2UobXNnKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSb3V0ZXMgbWVzc2FnZXMgdG8gdGhlaXIgYXBwcm9wcmlhdGUgaGFuZGxlcnMgYmFzZWQgb24gbWVzc2FnZSB0eXBlXG4gICAqIEBwcml2YXRlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBtc2cgVGhlIHBhcnNlZCBERFAgbWVzc2FnZVxuICAgKi9cbiAgYXN5bmMgX3JvdXRlTWVzc2FnZShtc2cpIHtcbiAgICBzd2l0Y2ggKG1zZy5tc2cpIHtcbiAgICAgIGNhc2UgJ2Nvbm5lY3RlZCc6XG4gICAgICAgIGF3YWl0IHRoaXMuX2Nvbm5lY3Rpb24uX2xpdmVkYXRhX2Nvbm5lY3RlZChtc2cpO1xuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9wdGlvbnMub25Db25uZWN0ZWQoKTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ2ZhaWxlZCc6XG4gICAgICAgIGF3YWl0IHRoaXMuX2hhbmRsZUZhaWxlZE1lc3NhZ2UobXNnKTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ3BpbmcnOlxuICAgICAgICBpZiAodGhpcy5fY29ubmVjdGlvbi5vcHRpb25zLnJlc3BvbmRUb1BpbmdzKSB7XG4gICAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5fc2VuZCh7IG1zZzogJ3BvbmcnLCBpZDogbXNnLmlkIH0pO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICdwb25nJzpcbiAgICAgICAgLy8gbm9vcCwgYXMgd2UgYXNzdW1lIGV2ZXJ5dGhpbmcncyBhIHBvbmdcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ2FkZGVkJzpcbiAgICAgIGNhc2UgJ2NoYW5nZWQnOlxuICAgICAgY2FzZSAncmVtb3ZlZCc6XG4gICAgICBjYXNlICdyZWFkeSc6XG4gICAgICBjYXNlICd1cGRhdGVkJzpcbiAgICAgICAgYXdhaXQgdGhpcy5fY29ubmVjdGlvbi5fbGl2ZWRhdGFfZGF0YShtc2cpO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnbm9zdWInOlxuICAgICAgICBhd2FpdCB0aGlzLl9jb25uZWN0aW9uLl9saXZlZGF0YV9ub3N1Yihtc2cpO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAncmVzdWx0JzpcbiAgICAgICAgYXdhaXQgdGhpcy5fY29ubmVjdGlvbi5fbGl2ZWRhdGFfcmVzdWx0KG1zZyk7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICdlcnJvcic6XG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uX2xpdmVkYXRhX2Vycm9yKG1zZyk7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBNZXRlb3IuX2RlYnVnKCdkaXNjYXJkaW5nIHVua25vd24gbGl2ZWRhdGEgbWVzc2FnZSB0eXBlJywgbXNnKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogSGFuZGxlcyBmYWlsZWQgY29ubmVjdGlvbiBtZXNzYWdlc1xuICAgKiBAcHJpdmF0ZVxuICAgKiBAcGFyYW0ge09iamVjdH0gbXNnIFRoZSBmYWlsZWQgbWVzc2FnZSBvYmplY3RcbiAgICovXG4gIF9oYW5kbGVGYWlsZWRNZXNzYWdlKG1zZykge1xuICAgIGlmICh0aGlzLl9jb25uZWN0aW9uLl9zdXBwb3J0ZWRERFBWZXJzaW9ucy5pbmRleE9mKG1zZy52ZXJzaW9uKSA+PSAwKSB7XG4gICAgICB0aGlzLl9jb25uZWN0aW9uLl92ZXJzaW9uU3VnZ2VzdGlvbiA9IG1zZy52ZXJzaW9uO1xuICAgICAgdGhpcy5fY29ubmVjdGlvbi5fc3RyZWFtLnJlY29ubmVjdCh7IF9mb3JjZTogdHJ1ZSB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgZGVzY3JpcHRpb24gPVxuICAgICAgICAnRERQIHZlcnNpb24gbmVnb3RpYXRpb24gZmFpbGVkOyBzZXJ2ZXIgcmVxdWVzdGVkIHZlcnNpb24gJyArXG4gICAgICAgIG1zZy52ZXJzaW9uO1xuICAgICAgdGhpcy5fY29ubmVjdGlvbi5fc3RyZWFtLmRpc2Nvbm5lY3QoeyBfcGVybWFuZW50OiB0cnVlLCBfZXJyb3I6IGRlc2NyaXB0aW9uIH0pO1xuICAgICAgdGhpcy5fY29ubmVjdGlvbi5vcHRpb25zLm9uRERQVmVyc2lvbk5lZ290aWF0aW9uRmFpbHVyZShkZXNjcmlwdGlvbik7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEhhbmRsZXMgY29ubmVjdGlvbiByZXNldCBldmVudHNcbiAgICovXG4gIG9uUmVzZXQoKSB7XG4gICAgLy8gUmVzZXQgaXMgY2FsbGVkIGV2ZW4gb24gdGhlIGZpcnN0IGNvbm5lY3Rpb24sIHNvIHRoaXMgaXNcbiAgICAvLyB0aGUgb25seSBwbGFjZSB3ZSBzZW5kIHRoaXMgbWVzc2FnZS5cbiAgICBjb25zdCBtc2cgPSB0aGlzLl9idWlsZENvbm5lY3RNZXNzYWdlKCk7XG4gICAgdGhpcy5fY29ubmVjdGlvbi5fc2VuZChtc2cpO1xuXG4gICAgLy8gTWFyayBub24tcmV0cnkgY2FsbHMgYXMgZmFpbGVkIGFuZCBoYW5kbGUgb3V0c3RhbmRpbmcgbWV0aG9kc1xuICAgIHRoaXMuX2hhbmRsZU91dHN0YW5kaW5nTWV0aG9kc09uUmVzZXQoKTtcblxuICAgIC8vIE5vdywgdG8gbWluaW1pemUgc2V0dXAgbGF0ZW5jeSwgZ28gYWhlYWQgYW5kIGJsYXN0IG91dCBhbGwgb2ZcbiAgICAvLyBvdXIgcGVuZGluZyBtZXRob2RzIGFuZHMgc3Vic2NyaXB0aW9ucyBiZWZvcmUgd2UndmUgZXZlbiB0YWtlblxuICAgIC8vIHRoZSBuZWNlc3NhcnkgUlRUIHRvIGtub3cgaWYgd2Ugc3VjY2Vzc2Z1bGx5IHJlY29ubmVjdGVkLlxuICAgIHRoaXMuX2Nvbm5lY3Rpb24uX2NhbGxPblJlY29ubmVjdEFuZFNlbmRBcHByb3ByaWF0ZU91dHN0YW5kaW5nTWV0aG9kcygpO1xuICAgIHRoaXMuX3Jlc2VuZFN1YnNjcmlwdGlvbnMoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBCdWlsZHMgdGhlIGluaXRpYWwgY29ubmVjdCBtZXNzYWdlXG4gICAqIEBwcml2YXRlXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBjb25uZWN0IG1lc3NhZ2Ugb2JqZWN0XG4gICAqL1xuICBfYnVpbGRDb25uZWN0TWVzc2FnZSgpIHtcbiAgICBjb25zdCBtc2cgPSB7IG1zZzogJ2Nvbm5lY3QnIH07XG4gICAgaWYgKHRoaXMuX2Nvbm5lY3Rpb24uX2xhc3RTZXNzaW9uSWQpIHtcbiAgICAgIG1zZy5zZXNzaW9uID0gdGhpcy5fY29ubmVjdGlvbi5fbGFzdFNlc3Npb25JZDtcbiAgICB9XG4gICAgbXNnLnZlcnNpb24gPSB0aGlzLl9jb25uZWN0aW9uLl92ZXJzaW9uU3VnZ2VzdGlvbiB8fCB0aGlzLl9jb25uZWN0aW9uLl9zdXBwb3J0ZWRERFBWZXJzaW9uc1swXTtcbiAgICB0aGlzLl9jb25uZWN0aW9uLl92ZXJzaW9uU3VnZ2VzdGlvbiA9IG1zZy52ZXJzaW9uO1xuICAgIG1zZy5zdXBwb3J0ID0gdGhpcy5fY29ubmVjdGlvbi5fc3VwcG9ydGVkRERQVmVyc2lvbnM7XG4gICAgcmV0dXJuIG1zZztcbiAgfVxuXG4gIC8qKlxuICAgKiBIYW5kbGVzIG91dHN0YW5kaW5nIG1ldGhvZHMgZHVyaW5nIGEgcmVzZXRcbiAgICogQHByaXZhdGVcbiAgICovXG4gIF9oYW5kbGVPdXRzdGFuZGluZ01ldGhvZHNPblJlc2V0KCkge1xuICAgIGNvbnN0IGJsb2NrcyA9IHRoaXMuX2Nvbm5lY3Rpb24uX291dHN0YW5kaW5nTWV0aG9kQmxvY2tzO1xuICAgIGlmIChibG9ja3MubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgICBjb25zdCBjdXJyZW50TWV0aG9kQmxvY2sgPSBibG9ja3NbMF0ubWV0aG9kcztcbiAgICBibG9ja3NbMF0ubWV0aG9kcyA9IGN1cnJlbnRNZXRob2RCbG9jay5maWx0ZXIoXG4gICAgICBtZXRob2RJbnZva2VyID0+IHtcbiAgICAgICAgLy8gTWV0aG9kcyB3aXRoICdub1JldHJ5JyBvcHRpb24gc2V0IGFyZSBub3QgYWxsb3dlZCB0byByZS1zZW5kIGFmdGVyXG4gICAgICAgIC8vIHJlY292ZXJpbmcgZHJvcHBlZCBjb25uZWN0aW9uLlxuICAgICAgICBpZiAobWV0aG9kSW52b2tlci5zZW50TWVzc2FnZSAmJiBtZXRob2RJbnZva2VyLm5vUmV0cnkpIHtcbiAgICAgICAgICBtZXRob2RJbnZva2VyLnJlY2VpdmVSZXN1bHQoXG4gICAgICAgICAgICBuZXcgTWV0ZW9yLkVycm9yKFxuICAgICAgICAgICAgICAnaW52b2NhdGlvbi1mYWlsZWQnLFxuICAgICAgICAgICAgICAnTWV0aG9kIGludm9jYXRpb24gbWlnaHQgaGF2ZSBmYWlsZWQgZHVlIHRvIGRyb3BwZWQgY29ubmVjdGlvbi4gJyArXG4gICAgICAgICAgICAgICdGYWlsaW5nIGJlY2F1c2UgYG5vUmV0cnlgIG9wdGlvbiB3YXMgcGFzc2VkIHRvIE1ldGVvci5hcHBseS4nXG4gICAgICAgICAgICApXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE9ubHkga2VlcCBhIG1ldGhvZCBpZiBpdCB3YXNuJ3Qgc2VudCBvciBpdCdzIGFsbG93ZWQgdG8gcmV0cnkuXG4gICAgICAgIHJldHVybiAhKG1ldGhvZEludm9rZXIuc2VudE1lc3NhZ2UgJiYgbWV0aG9kSW52b2tlci5ub1JldHJ5KTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgLy8gQ2xlYXIgZW1wdHkgYmxvY2tzXG4gICAgaWYgKGJsb2Nrcy5sZW5ndGggPiAwICYmIGJsb2Nrc1swXS5tZXRob2RzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgYmxvY2tzLnNoaWZ0KCk7XG4gICAgfVxuXG4gICAgLy8gUmVzZXQgYWxsIG1ldGhvZCBpbnZva2VycyBhcyB1bnNlbnRcbiAgICBPYmplY3QudmFsdWVzKHRoaXMuX2Nvbm5lY3Rpb24uX21ldGhvZEludm9rZXJzKS5mb3JFYWNoKGludm9rZXIgPT4ge1xuICAgICAgaW52b2tlci5zZW50TWVzc2FnZSA9IGZhbHNlO1xuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlc2VuZHMgYWxsIGFjdGl2ZSBzdWJzY3JpcHRpb25zXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBfcmVzZW5kU3Vic2NyaXB0aW9ucygpIHtcbiAgICBPYmplY3QuZW50cmllcyh0aGlzLl9jb25uZWN0aW9uLl9zdWJzY3JpcHRpb25zKS5mb3JFYWNoKChbaWQsIHN1Yl0pID0+IHtcbiAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uX3NlbmRRdWV1ZWQoe1xuICAgICAgICBtc2c6ICdzdWInLFxuICAgICAgICBpZDogaWQsXG4gICAgICAgIG5hbWU6IHN1Yi5uYW1lLFxuICAgICAgICBwYXJhbXM6IHN1Yi5wYXJhbXNcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG59IiwiaW1wb3J0IHsgTW9uZ29JRCB9IGZyb20gJ21ldGVvci9tb25nby1pZCc7XG5pbXBvcnQgeyBEaWZmU2VxdWVuY2UgfSBmcm9tICdtZXRlb3IvZGlmZi1zZXF1ZW5jZSc7XG5pbXBvcnQgeyBoYXNPd24gfSBmcm9tIFwibWV0ZW9yL2RkcC1jb21tb24vdXRpbHNcIjtcbmltcG9ydCB7IGlzRW1wdHkgfSBmcm9tIFwibWV0ZW9yL2RkcC1jb21tb24vdXRpbHNcIjtcblxuZXhwb3J0IGNsYXNzIERvY3VtZW50UHJvY2Vzc29ycyB7XG4gIGNvbnN0cnVjdG9yKGNvbm5lY3Rpb24pIHtcbiAgICB0aGlzLl9jb25uZWN0aW9uID0gY29ubmVjdGlvbjtcbiAgfVxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBQcm9jZXNzIGFuICdhZGRlZCcgbWVzc2FnZSBmcm9tIHRoZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtPYmplY3R9IG1zZyBUaGUgYWRkZWQgbWVzc2FnZVxuICAgKiBAcGFyYW0ge09iamVjdH0gdXBkYXRlcyBUaGUgdXBkYXRlcyBhY2N1bXVsYXRvclxuICAgKi9cbiAgYXN5bmMgX3Byb2Nlc3NfYWRkZWQobXNnLCB1cGRhdGVzKSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXMuX2Nvbm5lY3Rpb247XG4gICAgY29uc3QgaWQgPSBNb25nb0lELmlkUGFyc2UobXNnLmlkKTtcbiAgICBjb25zdCBzZXJ2ZXJEb2MgPSBzZWxmLl9nZXRTZXJ2ZXJEb2MobXNnLmNvbGxlY3Rpb24sIGlkKTtcblxuICAgIGlmIChzZXJ2ZXJEb2MpIHtcbiAgICAgIC8vIFNvbWUgb3V0c3RhbmRpbmcgc3R1YiB3cm90ZSBoZXJlLlxuICAgICAgY29uc3QgaXNFeGlzdGluZyA9IHNlcnZlckRvYy5kb2N1bWVudCAhPT0gdW5kZWZpbmVkO1xuXG4gICAgICBzZXJ2ZXJEb2MuZG9jdW1lbnQgPSBtc2cuZmllbGRzIHx8IE9iamVjdC5jcmVhdGUobnVsbCk7XG4gICAgICBzZXJ2ZXJEb2MuZG9jdW1lbnQuX2lkID0gaWQ7XG5cbiAgICAgIGlmIChzZWxmLl9yZXNldFN0b3Jlcykge1xuICAgICAgICAvLyBEdXJpbmcgcmVjb25uZWN0IHRoZSBzZXJ2ZXIgaXMgc2VuZGluZyBhZGRzIGZvciBleGlzdGluZyBpZHMuXG4gICAgICAgIC8vIEFsd2F5cyBwdXNoIGFuIHVwZGF0ZSBzbyB0aGF0IGRvY3VtZW50IHN0YXlzIGluIHRoZSBzdG9yZSBhZnRlclxuICAgICAgICAvLyByZXNldC4gVXNlIGN1cnJlbnQgdmVyc2lvbiBvZiB0aGUgZG9jdW1lbnQgZm9yIHRoaXMgdXBkYXRlLCBzb1xuICAgICAgICAvLyB0aGF0IHN0dWItd3JpdHRlbiB2YWx1ZXMgYXJlIHByZXNlcnZlZC5cbiAgICAgICAgY29uc3QgY3VycmVudERvYyA9IGF3YWl0IHNlbGYuX3N0b3Jlc1ttc2cuY29sbGVjdGlvbl0uZ2V0RG9jKG1zZy5pZCk7XG4gICAgICAgIGlmIChjdXJyZW50RG9jICE9PSB1bmRlZmluZWQpIG1zZy5maWVsZHMgPSBjdXJyZW50RG9jO1xuXG4gICAgICAgIHNlbGYuX3B1c2hVcGRhdGUodXBkYXRlcywgbXNnLmNvbGxlY3Rpb24sIG1zZyk7XG4gICAgICB9IGVsc2UgaWYgKGlzRXhpc3RpbmcpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdTZXJ2ZXIgc2VudCBhZGQgZm9yIGV4aXN0aW5nIGlkOiAnICsgbXNnLmlkKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgc2VsZi5fcHVzaFVwZGF0ZSh1cGRhdGVzLCBtc2cuY29sbGVjdGlvbiwgbXNnKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQHN1bW1hcnkgUHJvY2VzcyBhICdjaGFuZ2VkJyBtZXNzYWdlIGZyb20gdGhlIHNlcnZlclxuICAgKiBAcGFyYW0ge09iamVjdH0gbXNnIFRoZSBjaGFuZ2VkIG1lc3NhZ2VcbiAgICogQHBhcmFtIHtPYmplY3R9IHVwZGF0ZXMgVGhlIHVwZGF0ZXMgYWNjdW11bGF0b3JcbiAgICovXG4gIF9wcm9jZXNzX2NoYW5nZWQobXNnLCB1cGRhdGVzKSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXMuX2Nvbm5lY3Rpb247XG4gICAgY29uc3Qgc2VydmVyRG9jID0gc2VsZi5fZ2V0U2VydmVyRG9jKG1zZy5jb2xsZWN0aW9uLCBNb25nb0lELmlkUGFyc2UobXNnLmlkKSk7XG5cbiAgICBpZiAoc2VydmVyRG9jKSB7XG4gICAgICBpZiAoc2VydmVyRG9jLmRvY3VtZW50ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdTZXJ2ZXIgc2VudCBjaGFuZ2VkIGZvciBub25leGlzdGluZyBpZDogJyArIG1zZy5pZCk7XG4gICAgICB9XG4gICAgICBEaWZmU2VxdWVuY2UuYXBwbHlDaGFuZ2VzKHNlcnZlckRvYy5kb2N1bWVudCwgbXNnLmZpZWxkcyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNlbGYuX3B1c2hVcGRhdGUodXBkYXRlcywgbXNnLmNvbGxlY3Rpb24sIG1zZyk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IFByb2Nlc3MgYSAncmVtb3ZlZCcgbWVzc2FnZSBmcm9tIHRoZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtPYmplY3R9IG1zZyBUaGUgcmVtb3ZlZCBtZXNzYWdlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSB1cGRhdGVzIFRoZSB1cGRhdGVzIGFjY3VtdWxhdG9yXG4gICAqL1xuICBfcHJvY2Vzc19yZW1vdmVkKG1zZywgdXBkYXRlcykge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzLl9jb25uZWN0aW9uO1xuICAgIGNvbnN0IHNlcnZlckRvYyA9IHNlbGYuX2dldFNlcnZlckRvYyhtc2cuY29sbGVjdGlvbiwgTW9uZ29JRC5pZFBhcnNlKG1zZy5pZCkpO1xuXG4gICAgaWYgKHNlcnZlckRvYykge1xuICAgICAgLy8gU29tZSBvdXRzdGFuZGluZyBzdHViIHdyb3RlIGhlcmUuXG4gICAgICBpZiAoc2VydmVyRG9jLmRvY3VtZW50ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdTZXJ2ZXIgc2VudCByZW1vdmVkIGZvciBub25leGlzdGluZyBpZDonICsgbXNnLmlkKTtcbiAgICAgIH1cbiAgICAgIHNlcnZlckRvYy5kb2N1bWVudCA9IHVuZGVmaW5lZDtcbiAgICB9IGVsc2Uge1xuICAgICAgc2VsZi5fcHVzaFVwZGF0ZSh1cGRhdGVzLCBtc2cuY29sbGVjdGlvbiwge1xuICAgICAgICBtc2c6ICdyZW1vdmVkJyxcbiAgICAgICAgY29sbGVjdGlvbjogbXNnLmNvbGxlY3Rpb24sXG4gICAgICAgIGlkOiBtc2cuaWRcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBQcm9jZXNzIGEgJ3JlYWR5JyBtZXNzYWdlIGZyb20gdGhlIHNlcnZlclxuICAgKiBAcGFyYW0ge09iamVjdH0gbXNnIFRoZSByZWFkeSBtZXNzYWdlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSB1cGRhdGVzIFRoZSB1cGRhdGVzIGFjY3VtdWxhdG9yXG4gICAqL1xuICBfcHJvY2Vzc19yZWFkeShtc2csIHVwZGF0ZXMpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcy5fY29ubmVjdGlvbjtcblxuICAgIC8vIFByb2Nlc3MgXCJzdWIgcmVhZHlcIiBtZXNzYWdlcy4gXCJzdWIgcmVhZHlcIiBtZXNzYWdlcyBkb24ndCB0YWtlIGVmZmVjdFxuICAgIC8vIHVudGlsIGFsbCBjdXJyZW50IHNlcnZlciBkb2N1bWVudHMgaGF2ZSBiZWVuIGZsdXNoZWQgdG8gdGhlIGxvY2FsXG4gICAgLy8gZGF0YWJhc2UuIFdlIGNhbiB1c2UgYSB3cml0ZSBmZW5jZSB0byBpbXBsZW1lbnQgdGhpcy5cbiAgICBtc2cuc3Vicy5mb3JFYWNoKChzdWJJZCkgPT4ge1xuICAgICAgc2VsZi5fcnVuV2hlbkFsbFNlcnZlckRvY3NBcmVGbHVzaGVkKCgpID0+IHtcbiAgICAgICAgY29uc3Qgc3ViUmVjb3JkID0gc2VsZi5fc3Vic2NyaXB0aW9uc1tzdWJJZF07XG4gICAgICAgIC8vIERpZCB3ZSBhbHJlYWR5IHVuc3Vic2NyaWJlP1xuICAgICAgICBpZiAoIXN1YlJlY29yZCkgcmV0dXJuO1xuICAgICAgICAvLyBEaWQgd2UgYWxyZWFkeSByZWNlaXZlIGEgcmVhZHkgbWVzc2FnZT8gKE9vcHMhKVxuICAgICAgICBpZiAoc3ViUmVjb3JkLnJlYWR5KSByZXR1cm47XG4gICAgICAgIHN1YlJlY29yZC5yZWFkeSA9IHRydWU7XG4gICAgICAgIHN1YlJlY29yZC5yZWFkeUNhbGxiYWNrICYmIHN1YlJlY29yZC5yZWFkeUNhbGxiYWNrKCk7XG4gICAgICAgIHN1YlJlY29yZC5yZWFkeURlcHMuY2hhbmdlZCgpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQHN1bW1hcnkgUHJvY2VzcyBhbiAndXBkYXRlZCcgbWVzc2FnZSBmcm9tIHRoZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtPYmplY3R9IG1zZyBUaGUgdXBkYXRlZCBtZXNzYWdlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSB1cGRhdGVzIFRoZSB1cGRhdGVzIGFjY3VtdWxhdG9yXG4gICAqL1xuICBfcHJvY2Vzc191cGRhdGVkKG1zZywgdXBkYXRlcykge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzLl9jb25uZWN0aW9uO1xuICAgIC8vIFByb2Nlc3MgXCJtZXRob2QgZG9uZVwiIG1lc3NhZ2VzLlxuICAgIG1zZy5tZXRob2RzLmZvckVhY2goKG1ldGhvZElkKSA9PiB7XG4gICAgICBjb25zdCBkb2NzID0gc2VsZi5fZG9jdW1lbnRzV3JpdHRlbkJ5U3R1YlttZXRob2RJZF0gfHwge307XG4gICAgICBPYmplY3QudmFsdWVzKGRvY3MpLmZvckVhY2goKHdyaXR0ZW4pID0+IHtcbiAgICAgICAgY29uc3Qgc2VydmVyRG9jID0gc2VsZi5fZ2V0U2VydmVyRG9jKHdyaXR0ZW4uY29sbGVjdGlvbiwgd3JpdHRlbi5pZCk7XG4gICAgICAgIGlmICghc2VydmVyRG9jKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdMb3N0IHNlcnZlckRvYyBmb3IgJyArIEpTT04uc3RyaW5naWZ5KHdyaXR0ZW4pKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXNlcnZlckRvYy53cml0dGVuQnlTdHVic1ttZXRob2RJZF0pIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAnRG9jICcgK1xuICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkod3JpdHRlbikgK1xuICAgICAgICAgICAgJyBub3Qgd3JpdHRlbiBieSBtZXRob2QgJyArXG4gICAgICAgICAgICBtZXRob2RJZFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgZGVsZXRlIHNlcnZlckRvYy53cml0dGVuQnlTdHVic1ttZXRob2RJZF07XG4gICAgICAgIGlmIChpc0VtcHR5KHNlcnZlckRvYy53cml0dGVuQnlTdHVicykpIHtcbiAgICAgICAgICAvLyBBbGwgbWV0aG9kcyB3aG9zZSBzdHVicyB3cm90ZSB0aGlzIG1ldGhvZCBoYXZlIGNvbXBsZXRlZCEgV2UgY2FuXG4gICAgICAgICAgLy8gbm93IGNvcHkgdGhlIHNhdmVkIGRvY3VtZW50IHRvIHRoZSBkYXRhYmFzZSAocmV2ZXJ0aW5nIHRoZSBzdHViJ3NcbiAgICAgICAgICAvLyBjaGFuZ2UgaWYgdGhlIHNlcnZlciBkaWQgbm90IHdyaXRlIHRvIHRoaXMgb2JqZWN0LCBvciBhcHBseWluZyB0aGVcbiAgICAgICAgICAvLyBzZXJ2ZXIncyB3cml0ZXMgaWYgaXQgZGlkKS5cblxuICAgICAgICAgIC8vIFRoaXMgaXMgYSBmYWtlIGRkcCAncmVwbGFjZScgbWVzc2FnZS4gIEl0J3MganVzdCBmb3IgdGFsa2luZ1xuICAgICAgICAgIC8vIGJldHdlZW4gbGl2ZWRhdGEgY29ubmVjdGlvbnMgYW5kIG1pbmltb25nby4gIChXZSBoYXZlIHRvIHN0cmluZ2lmeVxuICAgICAgICAgIC8vIHRoZSBJRCBiZWNhdXNlIGl0J3Mgc3VwcG9zZWQgdG8gbG9vayBsaWtlIGEgd2lyZSBtZXNzYWdlLilcbiAgICAgICAgICBzZWxmLl9wdXNoVXBkYXRlKHVwZGF0ZXMsIHdyaXR0ZW4uY29sbGVjdGlvbiwge1xuICAgICAgICAgICAgbXNnOiAncmVwbGFjZScsXG4gICAgICAgICAgICBpZDogTW9uZ29JRC5pZFN0cmluZ2lmeSh3cml0dGVuLmlkKSxcbiAgICAgICAgICAgIHJlcGxhY2U6IHNlcnZlckRvYy5kb2N1bWVudFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIC8vIENhbGwgYWxsIGZsdXNoIGNhbGxiYWNrcy5cbiAgICAgICAgICBzZXJ2ZXJEb2MuZmx1c2hDYWxsYmFja3MuZm9yRWFjaCgoYykgPT4ge1xuICAgICAgICAgICAgYygpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgLy8gRGVsZXRlIHRoaXMgY29tcGxldGVkIHNlcnZlckRvY3VtZW50LiBEb24ndCBib3RoZXIgdG8gR0MgZW1wdHlcbiAgICAgICAgICAvLyBJZE1hcHMgaW5zaWRlIHNlbGYuX3NlcnZlckRvY3VtZW50cywgc2luY2UgdGhlcmUgcHJvYmFibHkgYXJlbid0XG4gICAgICAgICAgLy8gbWFueSBjb2xsZWN0aW9ucyBhbmQgdGhleSdsbCBiZSB3cml0dGVuIHJlcGVhdGVkbHkuXG4gICAgICAgICAgc2VsZi5fc2VydmVyRG9jdW1lbnRzW3dyaXR0ZW4uY29sbGVjdGlvbl0ucmVtb3ZlKHdyaXR0ZW4uaWQpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGRlbGV0ZSBzZWxmLl9kb2N1bWVudHNXcml0dGVuQnlTdHViW21ldGhvZElkXTtcblxuICAgICAgLy8gV2Ugd2FudCB0byBjYWxsIHRoZSBkYXRhLXdyaXR0ZW4gY2FsbGJhY2ssIGJ1dCB3ZSBjYW4ndCBkbyBzbyB1bnRpbCBhbGxcbiAgICAgIC8vIGN1cnJlbnRseSBidWZmZXJlZCBtZXNzYWdlcyBhcmUgZmx1c2hlZC5cbiAgICAgIGNvbnN0IGNhbGxiYWNrSW52b2tlciA9IHNlbGYuX21ldGhvZEludm9rZXJzW21ldGhvZElkXTtcbiAgICAgIGlmICghY2FsbGJhY2tJbnZva2VyKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gY2FsbGJhY2sgaW52b2tlciBmb3IgbWV0aG9kICcgKyBtZXRob2RJZCk7XG4gICAgICB9XG5cbiAgICAgIHNlbGYuX3J1bldoZW5BbGxTZXJ2ZXJEb2NzQXJlRmx1c2hlZChcbiAgICAgICAgKC4uLmFyZ3MpID0+IGNhbGxiYWNrSW52b2tlci5kYXRhVmlzaWJsZSguLi5hcmdzKVxuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBQdXNoIGFuIHVwZGF0ZSB0byB0aGUgYnVmZmVyXG4gICAqIEBwcml2YXRlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSB1cGRhdGVzIFRoZSB1cGRhdGVzIGFjY3VtdWxhdG9yXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBjb2xsZWN0aW9uIFRoZSBjb2xsZWN0aW9uIG5hbWVcbiAgICogQHBhcmFtIHtPYmplY3R9IG1zZyBUaGUgdXBkYXRlIG1lc3NhZ2VcbiAgICovXG4gIF9wdXNoVXBkYXRlKHVwZGF0ZXMsIGNvbGxlY3Rpb24sIG1zZykge1xuICAgIGlmICghaGFzT3duLmNhbGwodXBkYXRlcywgY29sbGVjdGlvbikpIHtcbiAgICAgIHVwZGF0ZXNbY29sbGVjdGlvbl0gPSBbXTtcbiAgICB9XG4gICAgdXBkYXRlc1tjb2xsZWN0aW9uXS5wdXNoKG1zZyk7XG4gIH1cblxuICAvKipcbiAgICogQHN1bW1hcnkgR2V0IGEgc2VydmVyIGRvY3VtZW50IGJ5IGNvbGxlY3Rpb24gYW5kIGlkXG4gICAqIEBwcml2YXRlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBjb2xsZWN0aW9uIFRoZSBjb2xsZWN0aW9uIG5hbWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IGlkIFRoZSBkb2N1bWVudCBpZFxuICAgKiBAcmV0dXJucyB7T2JqZWN0fG51bGx9IFRoZSBzZXJ2ZXIgZG9jdW1lbnQgb3IgbnVsbFxuICAgKi9cbiAgX2dldFNlcnZlckRvYyhjb2xsZWN0aW9uLCBpZCkge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzLl9jb25uZWN0aW9uO1xuICAgIGlmICghaGFzT3duLmNhbGwoc2VsZi5fc2VydmVyRG9jdW1lbnRzLCBjb2xsZWN0aW9uKSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGNvbnN0IHNlcnZlckRvY3NGb3JDb2xsZWN0aW9uID0gc2VsZi5fc2VydmVyRG9jdW1lbnRzW2NvbGxlY3Rpb25dO1xuICAgIHJldHVybiBzZXJ2ZXJEb2NzRm9yQ29sbGVjdGlvbi5nZXQoaWQpIHx8IG51bGw7XG4gIH1cbn0iLCJpbXBvcnQgeyBNZXRlb3IgfSBmcm9tICdtZXRlb3IvbWV0ZW9yJztcbmltcG9ydCB7IEREUENvbW1vbiB9IGZyb20gJ21ldGVvci9kZHAtY29tbW9uJztcbmltcG9ydCB7IFRyYWNrZXIgfSBmcm9tICdtZXRlb3IvdHJhY2tlcic7XG5pbXBvcnQgeyBFSlNPTiB9IGZyb20gJ21ldGVvci9lanNvbic7XG5pbXBvcnQgeyBSYW5kb20gfSBmcm9tICdtZXRlb3IvcmFuZG9tJztcbmltcG9ydCB7IE1vbmdvSUQgfSBmcm9tICdtZXRlb3IvbW9uZ28taWQnO1xuaW1wb3J0IHsgRERQIH0gZnJvbSAnLi9uYW1lc3BhY2UuanMnO1xuaW1wb3J0IHsgTWV0aG9kSW52b2tlciB9IGZyb20gJy4vbWV0aG9kX2ludm9rZXInO1xuaW1wb3J0IHtcbiAgaGFzT3duLFxuICBzbGljZSxcbiAga2V5cyxcbiAgaXNFbXB0eSxcbiAgbGFzdCxcbn0gZnJvbSBcIm1ldGVvci9kZHAtY29tbW9uL3V0aWxzXCI7XG5pbXBvcnQgeyBDb25uZWN0aW9uU3RyZWFtSGFuZGxlcnMgfSBmcm9tICcuL2Nvbm5lY3Rpb25fc3RyZWFtX2hhbmRsZXJzJztcbmltcG9ydCB7IE1vbmdvSURNYXAgfSBmcm9tICcuL21vbmdvX2lkX21hcCc7XG5pbXBvcnQgeyBNZXNzYWdlUHJvY2Vzc29ycyB9IGZyb20gJy4vbWVzc2FnZV9wcm9jZXNzb3JzJztcbmltcG9ydCB7IERvY3VtZW50UHJvY2Vzc29ycyB9IGZyb20gJy4vZG9jdW1lbnRfcHJvY2Vzc29ycyc7XG5cbi8vIEBwYXJhbSB1cmwge1N0cmluZ3xPYmplY3R9IFVSTCB0byBNZXRlb3IgYXBwLFxuLy8gICBvciBhbiBvYmplY3QgYXMgYSB0ZXN0IGhvb2sgKHNlZSBjb2RlKVxuLy8gT3B0aW9uczpcbi8vICAgcmVsb2FkV2l0aE91dHN0YW5kaW5nOiBpcyBpdCBPSyB0byByZWxvYWQgaWYgdGhlcmUgYXJlIG91dHN0YW5kaW5nIG1ldGhvZHM/XG4vLyAgIGhlYWRlcnM6IGV4dHJhIGhlYWRlcnMgdG8gc2VuZCBvbiB0aGUgd2Vic29ja2V0cyBjb25uZWN0aW9uLCBmb3Jcbi8vICAgICBzZXJ2ZXItdG8tc2VydmVyIEREUCBvbmx5XG4vLyAgIF9zb2NranNPcHRpb25zOiBTcGVjaWZpZXMgb3B0aW9ucyB0byBwYXNzIHRocm91Z2ggdG8gdGhlIHNvY2tqcyBjbGllbnRcbi8vICAgb25ERFBOZWdvdGlhdGlvblZlcnNpb25GYWlsdXJlOiBjYWxsYmFjayB3aGVuIHZlcnNpb24gbmVnb3RpYXRpb24gZmFpbHMuXG4vL1xuLy8gWFhYIFRoZXJlIHNob3VsZCBiZSBhIHdheSB0byBkZXN0cm95IGEgRERQIGNvbm5lY3Rpb24sIGNhdXNpbmcgYWxsXG4vLyBvdXRzdGFuZGluZyBtZXRob2QgY2FsbHMgdG8gZmFpbC5cbi8vXG4vLyBYWFggT3VyIGN1cnJlbnQgd2F5IG9mIGhhbmRsaW5nIGZhaWx1cmUgYW5kIHJlY29ubmVjdGlvbiBpcyBncmVhdFxuLy8gZm9yIGFuIGFwcCAod2hlcmUgd2Ugd2FudCB0byB0b2xlcmF0ZSBiZWluZyBkaXNjb25uZWN0ZWQgYXMgYW5cbi8vIGV4cGVjdCBzdGF0ZSwgYW5kIGtlZXAgdHJ5aW5nIGZvcmV2ZXIgdG8gcmVjb25uZWN0KSBidXQgY3VtYmVyc29tZVxuLy8gZm9yIHNvbWV0aGluZyBsaWtlIGEgY29tbWFuZCBsaW5lIHRvb2wgdGhhdCB3YW50cyB0byBtYWtlIGFcbi8vIGNvbm5lY3Rpb24sIGNhbGwgYSBtZXRob2QsIGFuZCBwcmludCBhbiBlcnJvciBpZiBjb25uZWN0aW9uXG4vLyBmYWlscy4gV2Ugc2hvdWxkIGhhdmUgYmV0dGVyIHVzYWJpbGl0eSBpbiB0aGUgbGF0dGVyIGNhc2UgKHdoaWxlXG4vLyBzdGlsbCB0cmFuc3BhcmVudGx5IHJlY29ubmVjdGluZyBpZiBpdCdzIGp1c3QgYSB0cmFuc2llbnQgZmFpbHVyZVxuLy8gb3IgdGhlIHNlcnZlciBtaWdyYXRpbmcgdXMpLlxuZXhwb3J0IGNsYXNzIENvbm5lY3Rpb24ge1xuICBjb25zdHJ1Y3Rvcih1cmwsIG9wdGlvbnMpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcblxuICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnMgPSB7XG4gICAgICBvbkNvbm5lY3RlZCgpIHt9LFxuICAgICAgb25ERFBWZXJzaW9uTmVnb3RpYXRpb25GYWlsdXJlKGRlc2NyaXB0aW9uKSB7XG4gICAgICAgIE1ldGVvci5fZGVidWcoZGVzY3JpcHRpb24pO1xuICAgICAgfSxcbiAgICAgIGhlYXJ0YmVhdEludGVydmFsOiAxNzUwMCxcbiAgICAgIGhlYXJ0YmVhdFRpbWVvdXQ6IDE1MDAwLFxuICAgICAgbnBtRmF5ZU9wdGlvbnM6IE9iamVjdC5jcmVhdGUobnVsbCksXG4gICAgICAvLyBUaGVzZSBvcHRpb25zIGFyZSBvbmx5IGZvciB0ZXN0aW5nLlxuICAgICAgcmVsb2FkV2l0aE91dHN0YW5kaW5nOiBmYWxzZSxcbiAgICAgIHN1cHBvcnRlZEREUFZlcnNpb25zOiBERFBDb21tb24uU1VQUE9SVEVEX0REUF9WRVJTSU9OUyxcbiAgICAgIHJldHJ5OiB0cnVlLFxuICAgICAgcmVzcG9uZFRvUGluZ3M6IHRydWUsXG4gICAgICAvLyBXaGVuIHVwZGF0ZXMgYXJlIGNvbWluZyB3aXRoaW4gdGhpcyBtcyBpbnRlcnZhbCwgYmF0Y2ggdGhlbSB0b2dldGhlci5cbiAgICAgIGJ1ZmZlcmVkV3JpdGVzSW50ZXJ2YWw6IDUsXG4gICAgICAvLyBGbHVzaCBidWZmZXJzIGltbWVkaWF0ZWx5IGlmIHdyaXRlcyBhcmUgaGFwcGVuaW5nIGNvbnRpbnVvdXNseSBmb3IgbW9yZSB0aGFuIHRoaXMgbWFueSBtcy5cbiAgICAgIGJ1ZmZlcmVkV3JpdGVzTWF4QWdlOiA1MDAsXG5cbiAgICAgIC4uLm9wdGlvbnNcbiAgICB9O1xuXG4gICAgLy8gSWYgc2V0LCBjYWxsZWQgd2hlbiB3ZSByZWNvbm5lY3QsIHF1ZXVpbmcgbWV0aG9kIGNhbGxzIF9iZWZvcmVfIHRoZVxuICAgIC8vIGV4aXN0aW5nIG91dHN0YW5kaW5nIG9uZXMuXG4gICAgLy8gTk9URTogVGhpcyBmZWF0dXJlIGhhcyBiZWVuIHByZXNlcnZlZCBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkuIFRoZVxuICAgIC8vIHByZWZlcnJlZCBtZXRob2Qgb2Ygc2V0dGluZyBhIGNhbGxiYWNrIG9uIHJlY29ubmVjdCBpcyB0byB1c2VcbiAgICAvLyBERFAub25SZWNvbm5lY3QuXG4gICAgc2VsZi5vblJlY29ubmVjdCA9IG51bGw7XG5cbiAgICAvLyBhcyBhIHRlc3QgaG9vaywgYWxsb3cgcGFzc2luZyBhIHN0cmVhbSBpbnN0ZWFkIG9mIGEgdXJsLlxuICAgIGlmICh0eXBlb2YgdXJsID09PSAnb2JqZWN0Jykge1xuICAgICAgc2VsZi5fc3RyZWFtID0gdXJsO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCB7IENsaWVudFN0cmVhbSB9ID0gcmVxdWlyZShcIm1ldGVvci9zb2NrZXQtc3RyZWFtLWNsaWVudFwiKTtcblxuICAgICAgc2VsZi5fc3RyZWFtID0gbmV3IENsaWVudFN0cmVhbSh1cmwsIHtcbiAgICAgICAgcmV0cnk6IG9wdGlvbnMucmV0cnksXG4gICAgICAgIENvbm5lY3Rpb25FcnJvcjogRERQLkNvbm5lY3Rpb25FcnJvcixcbiAgICAgICAgaGVhZGVyczogb3B0aW9ucy5oZWFkZXJzLFxuICAgICAgICBfc29ja2pzT3B0aW9uczogb3B0aW9ucy5fc29ja2pzT3B0aW9ucyxcbiAgICAgICAgLy8gVXNlZCB0byBrZWVwIHNvbWUgdGVzdHMgcXVpZXQsIG9yIGZvciBvdGhlciBjYXNlcyBpbiB3aGljaFxuICAgICAgICAvLyB0aGUgcmlnaHQgdGhpbmcgdG8gZG8gd2l0aCBjb25uZWN0aW9uIGVycm9ycyBpcyB0byBzaWxlbnRseVxuICAgICAgICAvLyBmYWlsIChlLmcuIHNlbmRpbmcgcGFja2FnZSB1c2FnZSBzdGF0cykuIEF0IHNvbWUgcG9pbnQgd2VcbiAgICAgICAgLy8gc2hvdWxkIGhhdmUgYSByZWFsIEFQSSBmb3IgaGFuZGxpbmcgY2xpZW50LXN0cmVhbS1sZXZlbFxuICAgICAgICAvLyBlcnJvcnMuXG4gICAgICAgIF9kb250UHJpbnRFcnJvcnM6IG9wdGlvbnMuX2RvbnRQcmludEVycm9ycyxcbiAgICAgICAgY29ubmVjdFRpbWVvdXRNczogb3B0aW9ucy5jb25uZWN0VGltZW91dE1zLFxuICAgICAgICBucG1GYXllT3B0aW9uczogb3B0aW9ucy5ucG1GYXllT3B0aW9uc1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgc2VsZi5fbGFzdFNlc3Npb25JZCA9IG51bGw7XG4gICAgc2VsZi5fdmVyc2lvblN1Z2dlc3Rpb24gPSBudWxsOyAvLyBUaGUgbGFzdCBwcm9wb3NlZCBERFAgdmVyc2lvbi5cbiAgICBzZWxmLl92ZXJzaW9uID0gbnVsbDsgLy8gVGhlIEREUCB2ZXJzaW9uIGFncmVlZCBvbiBieSBjbGllbnQgYW5kIHNlcnZlci5cbiAgICBzZWxmLl9zdG9yZXMgPSBPYmplY3QuY3JlYXRlKG51bGwpOyAvLyBuYW1lIC0+IG9iamVjdCB3aXRoIG1ldGhvZHNcbiAgICBzZWxmLl9tZXRob2RIYW5kbGVycyA9IE9iamVjdC5jcmVhdGUobnVsbCk7IC8vIG5hbWUgLT4gZnVuY1xuICAgIHNlbGYuX25leHRNZXRob2RJZCA9IDE7XG4gICAgc2VsZi5fc3VwcG9ydGVkRERQVmVyc2lvbnMgPSBvcHRpb25zLnN1cHBvcnRlZEREUFZlcnNpb25zO1xuXG4gICAgc2VsZi5faGVhcnRiZWF0SW50ZXJ2YWwgPSBvcHRpb25zLmhlYXJ0YmVhdEludGVydmFsO1xuICAgIHNlbGYuX2hlYXJ0YmVhdFRpbWVvdXQgPSBvcHRpb25zLmhlYXJ0YmVhdFRpbWVvdXQ7XG5cbiAgICAvLyBUcmFja3MgbWV0aG9kcyB3aGljaCB0aGUgdXNlciBoYXMgdHJpZWQgdG8gY2FsbCBidXQgd2hpY2ggaGF2ZSBub3QgeWV0XG4gICAgLy8gY2FsbGVkIHRoZWlyIHVzZXIgY2FsbGJhY2sgKGllLCB0aGV5IGFyZSB3YWl0aW5nIG9uIHRoZWlyIHJlc3VsdCBvciBmb3IgYWxsXG4gICAgLy8gb2YgdGhlaXIgd3JpdGVzIHRvIGJlIHdyaXR0ZW4gdG8gdGhlIGxvY2FsIGNhY2hlKS4gTWFwIGZyb20gbWV0aG9kIElEIHRvXG4gICAgLy8gTWV0aG9kSW52b2tlciBvYmplY3QuXG4gICAgc2VsZi5fbWV0aG9kSW52b2tlcnMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXG4gICAgLy8gVHJhY2tzIG1ldGhvZHMgd2hpY2ggdGhlIHVzZXIgaGFzIGNhbGxlZCBidXQgd2hvc2UgcmVzdWx0IG1lc3NhZ2VzIGhhdmUgbm90XG4gICAgLy8gYXJyaXZlZCB5ZXQuXG4gICAgLy9cbiAgICAvLyBfb3V0c3RhbmRpbmdNZXRob2RCbG9ja3MgaXMgYW4gYXJyYXkgb2YgYmxvY2tzIG9mIG1ldGhvZHMuIEVhY2ggYmxvY2tcbiAgICAvLyByZXByZXNlbnRzIGEgc2V0IG9mIG1ldGhvZHMgdGhhdCBjYW4gcnVuIGF0IHRoZSBzYW1lIHRpbWUuIFRoZSBmaXJzdCBibG9ja1xuICAgIC8vIHJlcHJlc2VudHMgdGhlIG1ldGhvZHMgd2hpY2ggYXJlIGN1cnJlbnRseSBpbiBmbGlnaHQ7IHN1YnNlcXVlbnQgYmxvY2tzXG4gICAgLy8gbXVzdCB3YWl0IGZvciBwcmV2aW91cyBibG9ja3MgdG8gYmUgZnVsbHkgZmluaXNoZWQgYmVmb3JlIHRoZXkgY2FuIGJlIHNlbnRcbiAgICAvLyB0byB0aGUgc2VydmVyLlxuICAgIC8vXG4gICAgLy8gRWFjaCBibG9jayBpcyBhbiBvYmplY3Qgd2l0aCB0aGUgZm9sbG93aW5nIGZpZWxkczpcbiAgICAvLyAtIG1ldGhvZHM6IGEgbGlzdCBvZiBNZXRob2RJbnZva2VyIG9iamVjdHNcbiAgICAvLyAtIHdhaXQ6IGEgYm9vbGVhbjsgaWYgdHJ1ZSwgdGhpcyBibG9jayBoYWQgYSBzaW5nbGUgbWV0aG9kIGludm9rZWQgd2l0aFxuICAgIC8vICAgICAgICAgdGhlIFwid2FpdFwiIG9wdGlvblxuICAgIC8vXG4gICAgLy8gVGhlcmUgd2lsbCBuZXZlciBiZSBhZGphY2VudCBibG9ja3Mgd2l0aCB3YWl0PWZhbHNlLCBiZWNhdXNlIHRoZSBvbmx5IHRoaW5nXG4gICAgLy8gdGhhdCBtYWtlcyBtZXRob2RzIG5lZWQgdG8gYmUgc2VyaWFsaXplZCBpcyBhIHdhaXQgbWV0aG9kLlxuICAgIC8vXG4gICAgLy8gTWV0aG9kcyBhcmUgcmVtb3ZlZCBmcm9tIHRoZSBmaXJzdCBibG9jayB3aGVuIHRoZWlyIFwicmVzdWx0XCIgaXNcbiAgICAvLyByZWNlaXZlZC4gVGhlIGVudGlyZSBmaXJzdCBibG9jayBpcyBvbmx5IHJlbW92ZWQgd2hlbiBhbGwgb2YgdGhlIGluLWZsaWdodFxuICAgIC8vIG1ldGhvZHMgaGF2ZSByZWNlaXZlZCB0aGVpciByZXN1bHRzIChzbyB0aGUgXCJtZXRob2RzXCIgbGlzdCBpcyBlbXB0eSkgKkFORCpcbiAgICAvLyBhbGwgb2YgdGhlIGRhdGEgd3JpdHRlbiBieSB0aG9zZSBtZXRob2RzIGFyZSB2aXNpYmxlIGluIHRoZSBsb2NhbCBjYWNoZS4gU29cbiAgICAvLyBpdCBpcyBwb3NzaWJsZSBmb3IgdGhlIGZpcnN0IGJsb2NrJ3MgbWV0aG9kcyBsaXN0IHRvIGJlIGVtcHR5LCBpZiB3ZSBhcmVcbiAgICAvLyBzdGlsbCB3YWl0aW5nIGZvciBzb21lIG9iamVjdHMgdG8gcXVpZXNjZS5cbiAgICAvL1xuICAgIC8vIEV4YW1wbGU6XG4gICAgLy8gIF9vdXRzdGFuZGluZ01ldGhvZEJsb2NrcyA9IFtcbiAgICAvLyAgICB7d2FpdDogZmFsc2UsIG1ldGhvZHM6IFtdfSxcbiAgICAvLyAgICB7d2FpdDogdHJ1ZSwgbWV0aG9kczogWzxNZXRob2RJbnZva2VyIGZvciAnbG9naW4nPl19LFxuICAgIC8vICAgIHt3YWl0OiBmYWxzZSwgbWV0aG9kczogWzxNZXRob2RJbnZva2VyIGZvciAnZm9vJz4sXG4gICAgLy8gICAgICAgICAgICAgICAgICAgICAgICAgICAgPE1ldGhvZEludm9rZXIgZm9yICdiYXInPl19XVxuICAgIC8vIFRoaXMgbWVhbnMgdGhhdCB0aGVyZSB3ZXJlIHNvbWUgbWV0aG9kcyB3aGljaCB3ZXJlIHNlbnQgdG8gdGhlIHNlcnZlciBhbmRcbiAgICAvLyB3aGljaCBoYXZlIHJldHVybmVkIHRoZWlyIHJlc3VsdHMsIGJ1dCBzb21lIG9mIHRoZSBkYXRhIHdyaXR0ZW4gYnlcbiAgICAvLyB0aGUgbWV0aG9kcyBtYXkgbm90IGJlIHZpc2libGUgaW4gdGhlIGxvY2FsIGNhY2hlLiBPbmNlIGFsbCB0aGF0IGRhdGEgaXNcbiAgICAvLyB2aXNpYmxlLCB3ZSB3aWxsIHNlbmQgYSAnbG9naW4nIG1ldGhvZC4gT25jZSB0aGUgbG9naW4gbWV0aG9kIGhhcyByZXR1cm5lZFxuICAgIC8vIGFuZCBhbGwgdGhlIGRhdGEgaXMgdmlzaWJsZSAoaW5jbHVkaW5nIHJlLXJ1bm5pbmcgc3VicyBpZiB1c2VySWQgY2hhbmdlcyksXG4gICAgLy8gd2Ugd2lsbCBzZW5kIHRoZSAnZm9vJyBhbmQgJ2JhcicgbWV0aG9kcyBpbiBwYXJhbGxlbC5cbiAgICBzZWxmLl9vdXRzdGFuZGluZ01ldGhvZEJsb2NrcyA9IFtdO1xuXG4gICAgLy8gbWV0aG9kIElEIC0+IGFycmF5IG9mIG9iamVjdHMgd2l0aCBrZXlzICdjb2xsZWN0aW9uJyBhbmQgJ2lkJywgbGlzdGluZ1xuICAgIC8vIGRvY3VtZW50cyB3cml0dGVuIGJ5IGEgZ2l2ZW4gbWV0aG9kJ3Mgc3R1Yi4ga2V5cyBhcmUgYXNzb2NpYXRlZCB3aXRoXG4gICAgLy8gbWV0aG9kcyB3aG9zZSBzdHViIHdyb3RlIGF0IGxlYXN0IG9uZSBkb2N1bWVudCwgYW5kIHdob3NlIGRhdGEtZG9uZSBtZXNzYWdlXG4gICAgLy8gaGFzIG5vdCB5ZXQgYmVlbiByZWNlaXZlZC5cbiAgICBzZWxmLl9kb2N1bWVudHNXcml0dGVuQnlTdHViID0ge307XG4gICAgLy8gY29sbGVjdGlvbiAtPiBJZE1hcCBvZiBcInNlcnZlciBkb2N1bWVudFwiIG9iamVjdC4gQSBcInNlcnZlciBkb2N1bWVudFwiIGhhczpcbiAgICAvLyAtIFwiZG9jdW1lbnRcIjogdGhlIHZlcnNpb24gb2YgdGhlIGRvY3VtZW50IGFjY29yZGluZyB0aGVcbiAgICAvLyAgIHNlcnZlciAoaWUsIHRoZSBzbmFwc2hvdCBiZWZvcmUgYSBzdHViIHdyb3RlIGl0LCBhbWVuZGVkIGJ5IGFueSBjaGFuZ2VzXG4gICAgLy8gICByZWNlaXZlZCBmcm9tIHRoZSBzZXJ2ZXIpXG4gICAgLy8gICBJdCBpcyB1bmRlZmluZWQgaWYgd2UgdGhpbmsgdGhlIGRvY3VtZW50IGRvZXMgbm90IGV4aXN0XG4gICAgLy8gLSBcIndyaXR0ZW5CeVN0dWJzXCI6IGEgc2V0IG9mIG1ldGhvZCBJRHMgd2hvc2Ugc3R1YnMgd3JvdGUgdG8gdGhlIGRvY3VtZW50XG4gICAgLy8gICB3aG9zZSBcImRhdGEgZG9uZVwiIG1lc3NhZ2VzIGhhdmUgbm90IHlldCBiZWVuIHByb2Nlc3NlZFxuICAgIHNlbGYuX3NlcnZlckRvY3VtZW50cyA9IHt9O1xuXG4gICAgLy8gQXJyYXkgb2YgY2FsbGJhY2tzIHRvIGJlIGNhbGxlZCBhZnRlciB0aGUgbmV4dCB1cGRhdGUgb2YgdGhlIGxvY2FsXG4gICAgLy8gY2FjaGUuIFVzZWQgZm9yOlxuICAgIC8vICAtIENhbGxpbmcgbWV0aG9kSW52b2tlci5kYXRhVmlzaWJsZSBhbmQgc3ViIHJlYWR5IGNhbGxiYWNrcyBhZnRlclxuICAgIC8vICAgIHRoZSByZWxldmFudCBkYXRhIGlzIGZsdXNoZWQuXG4gICAgLy8gIC0gSW52b2tpbmcgdGhlIGNhbGxiYWNrcyBvZiBcImhhbGYtZmluaXNoZWRcIiBtZXRob2RzIGFmdGVyIHJlY29ubmVjdFxuICAgIC8vICAgIHF1aWVzY2VuY2UuIFNwZWNpZmljYWxseSwgbWV0aG9kcyB3aG9zZSByZXN1bHQgd2FzIHJlY2VpdmVkIG92ZXIgdGhlIG9sZFxuICAgIC8vICAgIGNvbm5lY3Rpb24gKHNvIHdlIGRvbid0IHJlLXNlbmQgaXQpIGJ1dCB3aG9zZSBkYXRhIGhhZCBub3QgYmVlbiBtYWRlXG4gICAgLy8gICAgdmlzaWJsZS5cbiAgICBzZWxmLl9hZnRlclVwZGF0ZUNhbGxiYWNrcyA9IFtdO1xuXG4gICAgLy8gSW4gdHdvIGNvbnRleHRzLCB3ZSBidWZmZXIgYWxsIGluY29taW5nIGRhdGEgbWVzc2FnZXMgYW5kIHRoZW4gcHJvY2VzcyB0aGVtXG4gICAgLy8gYWxsIGF0IG9uY2UgaW4gYSBzaW5nbGUgdXBkYXRlOlxuICAgIC8vICAgLSBEdXJpbmcgcmVjb25uZWN0LCB3ZSBidWZmZXIgYWxsIGRhdGEgbWVzc2FnZXMgdW50aWwgYWxsIHN1YnMgdGhhdCBoYWRcbiAgICAvLyAgICAgYmVlbiByZWFkeSBiZWZvcmUgcmVjb25uZWN0IGFyZSByZWFkeSBhZ2FpbiwgYW5kIGFsbCBtZXRob2RzIHRoYXQgYXJlXG4gICAgLy8gICAgIGFjdGl2ZSBoYXZlIHJldHVybmVkIHRoZWlyIFwiZGF0YSBkb25lIG1lc3NhZ2VcIjsgdGhlblxuICAgIC8vICAgLSBEdXJpbmcgdGhlIGV4ZWN1dGlvbiBvZiBhIFwid2FpdFwiIG1ldGhvZCwgd2UgYnVmZmVyIGFsbCBkYXRhIG1lc3NhZ2VzXG4gICAgLy8gICAgIHVudGlsIHRoZSB3YWl0IG1ldGhvZCBnZXRzIGl0cyBcImRhdGEgZG9uZVwiIG1lc3NhZ2UuIChJZiB0aGUgd2FpdCBtZXRob2RcbiAgICAvLyAgICAgb2NjdXJzIGR1cmluZyByZWNvbm5lY3QsIGl0IGRvZXNuJ3QgZ2V0IGFueSBzcGVjaWFsIGhhbmRsaW5nLilcbiAgICAvLyBhbGwgZGF0YSBtZXNzYWdlcyBhcmUgcHJvY2Vzc2VkIGluIG9uZSB1cGRhdGUuXG4gICAgLy9cbiAgICAvLyBUaGUgZm9sbG93aW5nIGZpZWxkcyBhcmUgdXNlZCBmb3IgdGhpcyBcInF1aWVzY2VuY2VcIiBwcm9jZXNzLlxuXG4gICAgLy8gVGhpcyBidWZmZXJzIHRoZSBtZXNzYWdlcyB0aGF0IGFyZW4ndCBiZWluZyBwcm9jZXNzZWQgeWV0LlxuICAgIHNlbGYuX21lc3NhZ2VzQnVmZmVyZWRVbnRpbFF1aWVzY2VuY2UgPSBbXTtcbiAgICAvLyBNYXAgZnJvbSBtZXRob2QgSUQgLT4gdHJ1ZS4gTWV0aG9kcyBhcmUgcmVtb3ZlZCBmcm9tIHRoaXMgd2hlbiB0aGVpclxuICAgIC8vIFwiZGF0YSBkb25lXCIgbWVzc2FnZSBpcyByZWNlaXZlZCwgYW5kIHdlIHdpbGwgbm90IHF1aWVzY2UgdW50aWwgaXQgaXNcbiAgICAvLyBlbXB0eS5cbiAgICBzZWxmLl9tZXRob2RzQmxvY2tpbmdRdWllc2NlbmNlID0ge307XG4gICAgLy8gbWFwIGZyb20gc3ViIElEIC0+IHRydWUgZm9yIHN1YnMgdGhhdCB3ZXJlIHJlYWR5IChpZSwgY2FsbGVkIHRoZSBzdWJcbiAgICAvLyByZWFkeSBjYWxsYmFjaykgYmVmb3JlIHJlY29ubmVjdCBidXQgaGF2ZW4ndCBiZWNvbWUgcmVhZHkgYWdhaW4geWV0XG4gICAgc2VsZi5fc3Vic0JlaW5nUmV2aXZlZCA9IHt9OyAvLyBtYXAgZnJvbSBzdWIuX2lkIC0+IHRydWVcbiAgICAvLyBpZiB0cnVlLCB0aGUgbmV4dCBkYXRhIHVwZGF0ZSBzaG91bGQgcmVzZXQgYWxsIHN0b3Jlcy4gKHNldCBkdXJpbmdcbiAgICAvLyByZWNvbm5lY3QuKVxuICAgIHNlbGYuX3Jlc2V0U3RvcmVzID0gZmFsc2U7XG5cbiAgICAvLyBuYW1lIC0+IGFycmF5IG9mIHVwZGF0ZXMgZm9yICh5ZXQgdG8gYmUgY3JlYXRlZCkgY29sbGVjdGlvbnNcbiAgICBzZWxmLl91cGRhdGVzRm9yVW5rbm93blN0b3JlcyA9IHt9O1xuICAgIC8vIGlmIHdlJ3JlIGJsb2NraW5nIGEgbWlncmF0aW9uLCB0aGUgcmV0cnkgZnVuY1xuICAgIHNlbGYuX3JldHJ5TWlncmF0ZSA9IG51bGw7XG4gICAgLy8gQ29sbGVjdGlvbiBuYW1lIC0+IGFycmF5IG9mIG1lc3NhZ2VzLlxuICAgIHNlbGYuX2J1ZmZlcmVkV3JpdGVzID0ge307XG4gICAgLy8gV2hlbiBjdXJyZW50IGJ1ZmZlciBvZiB1cGRhdGVzIG11c3QgYmUgZmx1c2hlZCBhdCwgaW4gbXMgdGltZXN0YW1wLlxuICAgIHNlbGYuX2J1ZmZlcmVkV3JpdGVzRmx1c2hBdCA9IG51bGw7XG4gICAgLy8gVGltZW91dCBoYW5kbGUgZm9yIHRoZSBuZXh0IHByb2Nlc3Npbmcgb2YgYWxsIHBlbmRpbmcgd3JpdGVzXG4gICAgc2VsZi5fYnVmZmVyZWRXcml0ZXNGbHVzaEhhbmRsZSA9IG51bGw7XG5cbiAgICBzZWxmLl9idWZmZXJlZFdyaXRlc0ludGVydmFsID0gb3B0aW9ucy5idWZmZXJlZFdyaXRlc0ludGVydmFsO1xuICAgIHNlbGYuX2J1ZmZlcmVkV3JpdGVzTWF4QWdlID0gb3B0aW9ucy5idWZmZXJlZFdyaXRlc01heEFnZTtcblxuICAgIC8vIG1ldGFkYXRhIGZvciBzdWJzY3JpcHRpb25zLiAgTWFwIGZyb20gc3ViIElEIHRvIG9iamVjdCB3aXRoIGtleXM6XG4gICAgLy8gICAtIGlkXG4gICAgLy8gICAtIG5hbWVcbiAgICAvLyAgIC0gcGFyYW1zXG4gICAgLy8gICAtIGluYWN0aXZlIChpZiB0cnVlLCB3aWxsIGJlIGNsZWFuZWQgdXAgaWYgbm90IHJldXNlZCBpbiByZS1ydW4pXG4gICAgLy8gICAtIHJlYWR5IChoYXMgdGhlICdyZWFkeScgbWVzc2FnZSBiZWVuIHJlY2VpdmVkPylcbiAgICAvLyAgIC0gcmVhZHlDYWxsYmFjayAoYW4gb3B0aW9uYWwgY2FsbGJhY2sgdG8gY2FsbCB3aGVuIHJlYWR5KVxuICAgIC8vICAgLSBlcnJvckNhbGxiYWNrIChhbiBvcHRpb25hbCBjYWxsYmFjayB0byBjYWxsIGlmIHRoZSBzdWIgdGVybWluYXRlcyB3aXRoXG4gICAgLy8gICAgICAgICAgICAgICAgICAgIGFuIGVycm9yLCBYWFggQ09NUEFUIFdJVEggMS4wLjMuMSlcbiAgICAvLyAgIC0gc3RvcENhbGxiYWNrIChhbiBvcHRpb25hbCBjYWxsYmFjayB0byBjYWxsIHdoZW4gdGhlIHN1YiB0ZXJtaW5hdGVzXG4gICAgLy8gICAgIGZvciBhbnkgcmVhc29uLCB3aXRoIGFuIGVycm9yIGFyZ3VtZW50IGlmIGFuIGVycm9yIHRyaWdnZXJlZCB0aGUgc3RvcClcbiAgICBzZWxmLl9zdWJzY3JpcHRpb25zID0ge307XG5cbiAgICAvLyBSZWFjdGl2ZSB1c2VySWQuXG4gICAgc2VsZi5fdXNlcklkID0gbnVsbDtcbiAgICBzZWxmLl91c2VySWREZXBzID0gbmV3IFRyYWNrZXIuRGVwZW5kZW5jeSgpO1xuXG4gICAgLy8gQmxvY2sgYXV0by1yZWxvYWQgd2hpbGUgd2UncmUgd2FpdGluZyBmb3IgbWV0aG9kIHJlc3BvbnNlcy5cbiAgICBpZiAoTWV0ZW9yLmlzQ2xpZW50ICYmXG4gICAgICBQYWNrYWdlLnJlbG9hZCAmJlxuICAgICAgISBvcHRpb25zLnJlbG9hZFdpdGhPdXRzdGFuZGluZykge1xuICAgICAgUGFja2FnZS5yZWxvYWQuUmVsb2FkLl9vbk1pZ3JhdGUocmV0cnkgPT4ge1xuICAgICAgICBpZiAoISBzZWxmLl9yZWFkeVRvTWlncmF0ZSgpKSB7XG4gICAgICAgICAgc2VsZi5fcmV0cnlNaWdyYXRlID0gcmV0cnk7XG4gICAgICAgICAgcmV0dXJuIFtmYWxzZV07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIFt0cnVlXTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdGhpcy5fc3RyZWFtSGFuZGxlcnMgPSBuZXcgQ29ubmVjdGlvblN0cmVhbUhhbmRsZXJzKHRoaXMpO1xuXG4gICAgY29uc3Qgb25EaXNjb25uZWN0ID0gKCkgPT4ge1xuICAgICAgaWYgKHRoaXMuX2hlYXJ0YmVhdCkge1xuICAgICAgICB0aGlzLl9oZWFydGJlYXQuc3RvcCgpO1xuICAgICAgICB0aGlzLl9oZWFydGJlYXQgPSBudWxsO1xuICAgICAgfVxuICAgIH07XG5cbiAgICBpZiAoTWV0ZW9yLmlzU2VydmVyKSB7XG4gICAgICB0aGlzLl9zdHJlYW0ub24oXG4gICAgICAgICdtZXNzYWdlJyxcbiAgICAgICAgTWV0ZW9yLmJpbmRFbnZpcm9ubWVudChcbiAgICAgICAgICBtc2cgPT4gdGhpcy5fc3RyZWFtSGFuZGxlcnMub25NZXNzYWdlKG1zZyksXG4gICAgICAgICAgJ2hhbmRsaW5nIEREUCBtZXNzYWdlJ1xuICAgICAgICApXG4gICAgICApO1xuICAgICAgdGhpcy5fc3RyZWFtLm9uKFxuICAgICAgICAncmVzZXQnLFxuICAgICAgICBNZXRlb3IuYmluZEVudmlyb25tZW50KFxuICAgICAgICAgICgpID0+IHRoaXMuX3N0cmVhbUhhbmRsZXJzLm9uUmVzZXQoKSxcbiAgICAgICAgICAnaGFuZGxpbmcgRERQIHJlc2V0J1xuICAgICAgICApXG4gICAgICApO1xuICAgICAgdGhpcy5fc3RyZWFtLm9uKFxuICAgICAgICAnZGlzY29ubmVjdCcsXG4gICAgICAgIE1ldGVvci5iaW5kRW52aXJvbm1lbnQob25EaXNjb25uZWN0LCAnaGFuZGxpbmcgRERQIGRpc2Nvbm5lY3QnKVxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5fc3RyZWFtLm9uKCdtZXNzYWdlJywgbXNnID0+IHRoaXMuX3N0cmVhbUhhbmRsZXJzLm9uTWVzc2FnZShtc2cpKTtcbiAgICAgIHRoaXMuX3N0cmVhbS5vbigncmVzZXQnLCAoKSA9PiB0aGlzLl9zdHJlYW1IYW5kbGVycy5vblJlc2V0KCkpO1xuICAgICAgdGhpcy5fc3RyZWFtLm9uKCdkaXNjb25uZWN0Jywgb25EaXNjb25uZWN0KTtcbiAgICB9XG5cbiAgICB0aGlzLl9tZXNzYWdlUHJvY2Vzc29ycyA9IG5ldyBNZXNzYWdlUHJvY2Vzc29ycyh0aGlzKTtcblxuICAgIC8vIEV4cG9zZSBtZXNzYWdlIHByb2Nlc3NvciBtZXRob2RzIHRvIG1haW50YWluIGJhY2t3YXJkIGNvbXBhdGliaWxpdHlcbiAgICB0aGlzLl9saXZlZGF0YV9jb25uZWN0ZWQgPSAobXNnKSA9PiB0aGlzLl9tZXNzYWdlUHJvY2Vzc29ycy5fbGl2ZWRhdGFfY29ubmVjdGVkKG1zZyk7XG4gICAgdGhpcy5fbGl2ZWRhdGFfZGF0YSA9IChtc2cpID0+IHRoaXMuX21lc3NhZ2VQcm9jZXNzb3JzLl9saXZlZGF0YV9kYXRhKG1zZyk7XG4gICAgdGhpcy5fbGl2ZWRhdGFfbm9zdWIgPSAobXNnKSA9PiB0aGlzLl9tZXNzYWdlUHJvY2Vzc29ycy5fbGl2ZWRhdGFfbm9zdWIobXNnKTtcbiAgICB0aGlzLl9saXZlZGF0YV9yZXN1bHQgPSAobXNnKSA9PiB0aGlzLl9tZXNzYWdlUHJvY2Vzc29ycy5fbGl2ZWRhdGFfcmVzdWx0KG1zZyk7XG4gICAgdGhpcy5fbGl2ZWRhdGFfZXJyb3IgPSAobXNnKSA9PiB0aGlzLl9tZXNzYWdlUHJvY2Vzc29ycy5fbGl2ZWRhdGFfZXJyb3IobXNnKTtcblxuICAgIHRoaXMuX2RvY3VtZW50UHJvY2Vzc29ycyA9IG5ldyBEb2N1bWVudFByb2Nlc3NvcnModGhpcyk7XG5cbiAgICAvLyBFeHBvc2UgZG9jdW1lbnQgcHJvY2Vzc29yIG1ldGhvZHMgdG8gbWFpbnRhaW4gYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuICAgIHRoaXMuX3Byb2Nlc3NfYWRkZWQgPSAobXNnLCB1cGRhdGVzKSA9PiB0aGlzLl9kb2N1bWVudFByb2Nlc3NvcnMuX3Byb2Nlc3NfYWRkZWQobXNnLCB1cGRhdGVzKTtcbiAgICB0aGlzLl9wcm9jZXNzX2NoYW5nZWQgPSAobXNnLCB1cGRhdGVzKSA9PiB0aGlzLl9kb2N1bWVudFByb2Nlc3NvcnMuX3Byb2Nlc3NfY2hhbmdlZChtc2csIHVwZGF0ZXMpO1xuICAgIHRoaXMuX3Byb2Nlc3NfcmVtb3ZlZCA9IChtc2csIHVwZGF0ZXMpID0+IHRoaXMuX2RvY3VtZW50UHJvY2Vzc29ycy5fcHJvY2Vzc19yZW1vdmVkKG1zZywgdXBkYXRlcyk7XG4gICAgdGhpcy5fcHJvY2Vzc19yZWFkeSA9IChtc2csIHVwZGF0ZXMpID0+IHRoaXMuX2RvY3VtZW50UHJvY2Vzc29ycy5fcHJvY2Vzc19yZWFkeShtc2csIHVwZGF0ZXMpO1xuICAgIHRoaXMuX3Byb2Nlc3NfdXBkYXRlZCA9IChtc2csIHVwZGF0ZXMpID0+IHRoaXMuX2RvY3VtZW50UHJvY2Vzc29ycy5fcHJvY2Vzc191cGRhdGVkKG1zZywgdXBkYXRlcyk7XG5cbiAgICAvLyBBbHNvIGV4cG9zZSB1dGlsaXR5IG1ldGhvZHMgdXNlZCBieSBvdGhlciBwYXJ0cyBvZiB0aGUgc3lzdGVtXG4gICAgdGhpcy5fcHVzaFVwZGF0ZSA9ICh1cGRhdGVzLCBjb2xsZWN0aW9uLCBtc2cpID0+XG4gICAgICB0aGlzLl9kb2N1bWVudFByb2Nlc3NvcnMuX3B1c2hVcGRhdGUodXBkYXRlcywgY29sbGVjdGlvbiwgbXNnKTtcbiAgICB0aGlzLl9nZXRTZXJ2ZXJEb2MgPSAoY29sbGVjdGlvbiwgaWQpID0+XG4gICAgICB0aGlzLl9kb2N1bWVudFByb2Nlc3NvcnMuX2dldFNlcnZlckRvYyhjb2xsZWN0aW9uLCBpZCk7XG4gIH1cblxuICAvLyAnbmFtZScgaXMgdGhlIG5hbWUgb2YgdGhlIGRhdGEgb24gdGhlIHdpcmUgdGhhdCBzaG91bGQgZ28gaW4gdGhlXG4gIC8vIHN0b3JlLiAnd3JhcHBlZFN0b3JlJyBzaG91bGQgYmUgYW4gb2JqZWN0IHdpdGggbWV0aG9kcyBiZWdpblVwZGF0ZSwgdXBkYXRlLFxuICAvLyBlbmRVcGRhdGUsIHNhdmVPcmlnaW5hbHMsIHJldHJpZXZlT3JpZ2luYWxzLiBzZWUgQ29sbGVjdGlvbiBmb3IgYW4gZXhhbXBsZS5cbiAgY3JlYXRlU3RvcmVNZXRob2RzKG5hbWUsIHdyYXBwZWRTdG9yZSkge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gICAgaWYgKG5hbWUgaW4gc2VsZi5fc3RvcmVzKSByZXR1cm4gZmFsc2U7XG5cbiAgICAvLyBXcmFwIHRoZSBpbnB1dCBvYmplY3QgaW4gYW4gb2JqZWN0IHdoaWNoIG1ha2VzIGFueSBzdG9yZSBtZXRob2Qgbm90XG4gICAgLy8gaW1wbGVtZW50ZWQgYnkgJ3N0b3JlJyBpbnRvIGEgbm8tb3AuXG4gICAgY29uc3Qgc3RvcmUgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgIGNvbnN0IGtleXNPZlN0b3JlID0gW1xuICAgICAgJ3VwZGF0ZScsXG4gICAgICAnYmVnaW5VcGRhdGUnLFxuICAgICAgJ2VuZFVwZGF0ZScsXG4gICAgICAnc2F2ZU9yaWdpbmFscycsXG4gICAgICAncmV0cmlldmVPcmlnaW5hbHMnLFxuICAgICAgJ2dldERvYycsXG4gICAgICAnX2dldENvbGxlY3Rpb24nXG4gICAgXTtcbiAgICBrZXlzT2ZTdG9yZS5mb3JFYWNoKChtZXRob2QpID0+IHtcbiAgICAgIHN0b3JlW21ldGhvZF0gPSAoLi4uYXJncykgPT4ge1xuICAgICAgICBpZiAod3JhcHBlZFN0b3JlW21ldGhvZF0pIHtcbiAgICAgICAgICByZXR1cm4gd3JhcHBlZFN0b3JlW21ldGhvZF0oLi4uYXJncyk7XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfSk7XG4gICAgc2VsZi5fc3RvcmVzW25hbWVdID0gc3RvcmU7XG4gICAgcmV0dXJuIHN0b3JlO1xuICB9XG5cbiAgcmVnaXN0ZXJTdG9yZUNsaWVudChuYW1lLCB3cmFwcGVkU3RvcmUpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcblxuICAgIGNvbnN0IHN0b3JlID0gc2VsZi5jcmVhdGVTdG9yZU1ldGhvZHMobmFtZSwgd3JhcHBlZFN0b3JlKTtcblxuICAgIGNvbnN0IHF1ZXVlZCA9IHNlbGYuX3VwZGF0ZXNGb3JVbmtub3duU3RvcmVzW25hbWVdO1xuICAgIGlmIChBcnJheS5pc0FycmF5KHF1ZXVlZCkpIHtcbiAgICAgIHN0b3JlLmJlZ2luVXBkYXRlKHF1ZXVlZC5sZW5ndGgsIGZhbHNlKTtcbiAgICAgIHF1ZXVlZC5mb3JFYWNoKG1zZyA9PiB7XG4gICAgICAgIHN0b3JlLnVwZGF0ZShtc2cpO1xuICAgICAgfSk7XG4gICAgICBzdG9yZS5lbmRVcGRhdGUoKTtcbiAgICAgIGRlbGV0ZSBzZWxmLl91cGRhdGVzRm9yVW5rbm93blN0b3Jlc1tuYW1lXTtcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICBhc3luYyByZWdpc3RlclN0b3JlU2VydmVyKG5hbWUsIHdyYXBwZWRTdG9yZSkge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gICAgY29uc3Qgc3RvcmUgPSBzZWxmLmNyZWF0ZVN0b3JlTWV0aG9kcyhuYW1lLCB3cmFwcGVkU3RvcmUpO1xuXG4gICAgY29uc3QgcXVldWVkID0gc2VsZi5fdXBkYXRlc0ZvclVua25vd25TdG9yZXNbbmFtZV07XG4gICAgaWYgKEFycmF5LmlzQXJyYXkocXVldWVkKSkge1xuICAgICAgYXdhaXQgc3RvcmUuYmVnaW5VcGRhdGUocXVldWVkLmxlbmd0aCwgZmFsc2UpO1xuICAgICAgZm9yIChjb25zdCBtc2cgb2YgcXVldWVkKSB7XG4gICAgICAgIGF3YWl0IHN0b3JlLnVwZGF0ZShtc2cpO1xuICAgICAgfVxuICAgICAgYXdhaXQgc3RvcmUuZW5kVXBkYXRlKCk7XG4gICAgICBkZWxldGUgc2VsZi5fdXBkYXRlc0ZvclVua25vd25TdG9yZXNbbmFtZV07XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICAvKipcbiAgICogQG1lbWJlck9mIE1ldGVvclxuICAgKiBAaW1wb3J0RnJvbVBhY2thZ2UgbWV0ZW9yXG4gICAqIEBhbGlhcyBNZXRlb3Iuc3Vic2NyaWJlXG4gICAqIEBzdW1tYXJ5IFN1YnNjcmliZSB0byBhIHJlY29yZCBzZXQuICBSZXR1cm5zIGEgaGFuZGxlIHRoYXQgcHJvdmlkZXNcbiAgICogYHN0b3AoKWAgYW5kIGByZWFkeSgpYCBtZXRob2RzLlxuICAgKiBAbG9jdXMgQ2xpZW50XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIE5hbWUgb2YgdGhlIHN1YnNjcmlwdGlvbi4gIE1hdGNoZXMgdGhlIG5hbWUgb2YgdGhlXG4gICAqIHNlcnZlcidzIGBwdWJsaXNoKClgIGNhbGwuXG4gICAqIEBwYXJhbSB7RUpTT05hYmxlfSBbYXJnMSxhcmcyLi4uXSBPcHRpb25hbCBhcmd1bWVudHMgcGFzc2VkIHRvIHB1Ymxpc2hlclxuICAgKiBmdW5jdGlvbiBvbiBzZXJ2ZXIuXG4gICAqIEBwYXJhbSB7RnVuY3Rpb258T2JqZWN0fSBbY2FsbGJhY2tzXSBPcHRpb25hbC4gTWF5IGluY2x1ZGUgYG9uU3RvcGBcbiAgICogYW5kIGBvblJlYWR5YCBjYWxsYmFja3MuIElmIHRoZXJlIGlzIGFuIGVycm9yLCBpdCBpcyBwYXNzZWQgYXMgYW5cbiAgICogYXJndW1lbnQgdG8gYG9uU3RvcGAuIElmIGEgZnVuY3Rpb24gaXMgcGFzc2VkIGluc3RlYWQgb2YgYW4gb2JqZWN0LCBpdFxuICAgKiBpcyBpbnRlcnByZXRlZCBhcyBhbiBgb25SZWFkeWAgY2FsbGJhY2suXG4gICAqL1xuICBzdWJzY3JpYmUobmFtZSAvKiAuLiBbYXJndW1lbnRzXSAuLiAoY2FsbGJhY2t8Y2FsbGJhY2tzKSAqLykge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gICAgY29uc3QgcGFyYW1zID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgIGxldCBjYWxsYmFja3MgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgIGlmIChwYXJhbXMubGVuZ3RoKSB7XG4gICAgICBjb25zdCBsYXN0UGFyYW0gPSBwYXJhbXNbcGFyYW1zLmxlbmd0aCAtIDFdO1xuICAgICAgaWYgKHR5cGVvZiBsYXN0UGFyYW0gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgY2FsbGJhY2tzLm9uUmVhZHkgPSBwYXJhbXMucG9wKCk7XG4gICAgICB9IGVsc2UgaWYgKGxhc3RQYXJhbSAmJiBbXG4gICAgICAgIGxhc3RQYXJhbS5vblJlYWR5LFxuICAgICAgICAvLyBYWFggQ09NUEFUIFdJVEggMS4wLjMuMSBvbkVycm9yIHVzZWQgdG8gZXhpc3QsIGJ1dCBub3cgd2UgdXNlXG4gICAgICAgIC8vIG9uU3RvcCB3aXRoIGFuIGVycm9yIGNhbGxiYWNrIGluc3RlYWQuXG4gICAgICAgIGxhc3RQYXJhbS5vbkVycm9yLFxuICAgICAgICBsYXN0UGFyYW0ub25TdG9wXG4gICAgICBdLnNvbWUoZiA9PiB0eXBlb2YgZiA9PT0gXCJmdW5jdGlvblwiKSkge1xuICAgICAgICBjYWxsYmFja3MgPSBwYXJhbXMucG9wKCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gSXMgdGhlcmUgYW4gZXhpc3Rpbmcgc3ViIHdpdGggdGhlIHNhbWUgbmFtZSBhbmQgcGFyYW0sIHJ1biBpbiBhblxuICAgIC8vIGludmFsaWRhdGVkIENvbXB1dGF0aW9uPyBUaGlzIHdpbGwgaGFwcGVuIGlmIHdlIGFyZSByZXJ1bm5pbmcgYW5cbiAgICAvLyBleGlzdGluZyBjb21wdXRhdGlvbi5cbiAgICAvL1xuICAgIC8vIEZvciBleGFtcGxlLCBjb25zaWRlciBhIHJlcnVuIG9mOlxuICAgIC8vXG4gICAgLy8gICAgIFRyYWNrZXIuYXV0b3J1bihmdW5jdGlvbiAoKSB7XG4gICAgLy8gICAgICAgTWV0ZW9yLnN1YnNjcmliZShcImZvb1wiLCBTZXNzaW9uLmdldChcImZvb1wiKSk7XG4gICAgLy8gICAgICAgTWV0ZW9yLnN1YnNjcmliZShcImJhclwiLCBTZXNzaW9uLmdldChcImJhclwiKSk7XG4gICAgLy8gICAgIH0pO1xuICAgIC8vXG4gICAgLy8gSWYgXCJmb29cIiBoYXMgY2hhbmdlZCBidXQgXCJiYXJcIiBoYXMgbm90LCB3ZSB3aWxsIG1hdGNoIHRoZSBcImJhclwiXG4gICAgLy8gc3ViY3JpYmUgdG8gYW4gZXhpc3RpbmcgaW5hY3RpdmUgc3Vic2NyaXB0aW9uIGluIG9yZGVyIHRvIG5vdFxuICAgIC8vIHVuc3ViIGFuZCByZXN1YiB0aGUgc3Vic2NyaXB0aW9uIHVubmVjZXNzYXJpbHkuXG4gICAgLy9cbiAgICAvLyBXZSBvbmx5IGxvb2sgZm9yIG9uZSBzdWNoIHN1YjsgaWYgdGhlcmUgYXJlIE4gYXBwYXJlbnRseS1pZGVudGljYWwgc3Vic1xuICAgIC8vIGJlaW5nIGludmFsaWRhdGVkLCB3ZSB3aWxsIHJlcXVpcmUgTiBtYXRjaGluZyBzdWJzY3JpYmUgY2FsbHMgdG8ga2VlcFxuICAgIC8vIHRoZW0gYWxsIGFjdGl2ZS5cbiAgICBjb25zdCBleGlzdGluZyA9IE9iamVjdC52YWx1ZXMoc2VsZi5fc3Vic2NyaXB0aW9ucykuZmluZChcbiAgICAgIHN1YiA9PiAoc3ViLmluYWN0aXZlICYmIHN1Yi5uYW1lID09PSBuYW1lICYmIEVKU09OLmVxdWFscyhzdWIucGFyYW1zLCBwYXJhbXMpKVxuICAgICk7XG5cbiAgICBsZXQgaWQ7XG4gICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICBpZCA9IGV4aXN0aW5nLmlkO1xuICAgICAgZXhpc3RpbmcuaW5hY3RpdmUgPSBmYWxzZTsgLy8gcmVhY3RpdmF0ZVxuXG4gICAgICBpZiAoY2FsbGJhY2tzLm9uUmVhZHkpIHtcbiAgICAgICAgLy8gSWYgdGhlIHN1YiBpcyBub3QgYWxyZWFkeSByZWFkeSwgcmVwbGFjZSBhbnkgcmVhZHkgY2FsbGJhY2sgd2l0aCB0aGVcbiAgICAgICAgLy8gb25lIHByb3ZpZGVkIG5vdy4gKEl0J3Mgbm90IHJlYWxseSBjbGVhciB3aGF0IHVzZXJzIHdvdWxkIGV4cGVjdCBmb3JcbiAgICAgICAgLy8gYW4gb25SZWFkeSBjYWxsYmFjayBpbnNpZGUgYW4gYXV0b3J1bjsgdGhlIHNlbWFudGljcyB3ZSBwcm92aWRlIGlzXG4gICAgICAgIC8vIHRoYXQgYXQgdGhlIHRpbWUgdGhlIHN1YiBmaXJzdCBiZWNvbWVzIHJlYWR5LCB3ZSBjYWxsIHRoZSBsYXN0XG4gICAgICAgIC8vIG9uUmVhZHkgY2FsbGJhY2sgcHJvdmlkZWQsIGlmIGFueS4pXG4gICAgICAgIC8vIElmIHRoZSBzdWIgaXMgYWxyZWFkeSByZWFkeSwgcnVuIHRoZSByZWFkeSBjYWxsYmFjayByaWdodCBhd2F5LlxuICAgICAgICAvLyBJdCBzZWVtcyB0aGF0IHVzZXJzIHdvdWxkIGV4cGVjdCBhbiBvblJlYWR5IGNhbGxiYWNrIGluc2lkZSBhblxuICAgICAgICAvLyBhdXRvcnVuIHRvIHRyaWdnZXIgb25jZSB0aGUgc3ViIGZpcnN0IGJlY29tZXMgcmVhZHkgYW5kIGFsc29cbiAgICAgICAgLy8gd2hlbiByZS1zdWJzIGhhcHBlbnMuXG4gICAgICAgIGlmIChleGlzdGluZy5yZWFkeSkge1xuICAgICAgICAgIGNhbGxiYWNrcy5vblJlYWR5KCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZXhpc3RpbmcucmVhZHlDYWxsYmFjayA9IGNhbGxiYWNrcy5vblJlYWR5O1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFhYWCBDT01QQVQgV0lUSCAxLjAuMy4xIHdlIHVzZWQgdG8gaGF2ZSBvbkVycm9yIGJ1dCBub3cgd2UgY2FsbFxuICAgICAgLy8gb25TdG9wIHdpdGggYW4gb3B0aW9uYWwgZXJyb3IgYXJndW1lbnRcbiAgICAgIGlmIChjYWxsYmFja3Mub25FcnJvcikge1xuICAgICAgICAvLyBSZXBsYWNlIGV4aXN0aW5nIGNhbGxiYWNrIGlmIGFueSwgc28gdGhhdCBlcnJvcnMgYXJlbid0XG4gICAgICAgIC8vIGRvdWJsZS1yZXBvcnRlZC5cbiAgICAgICAgZXhpc3RpbmcuZXJyb3JDYWxsYmFjayA9IGNhbGxiYWNrcy5vbkVycm9yO1xuICAgICAgfVxuXG4gICAgICBpZiAoY2FsbGJhY2tzLm9uU3RvcCkge1xuICAgICAgICBleGlzdGluZy5zdG9wQ2FsbGJhY2sgPSBjYWxsYmFja3Mub25TdG9wO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBOZXcgc3ViISBHZW5lcmF0ZSBhbiBpZCwgc2F2ZSBpdCBsb2NhbGx5LCBhbmQgc2VuZCBtZXNzYWdlLlxuICAgICAgaWQgPSBSYW5kb20uaWQoKTtcbiAgICAgIHNlbGYuX3N1YnNjcmlwdGlvbnNbaWRdID0ge1xuICAgICAgICBpZDogaWQsXG4gICAgICAgIG5hbWU6IG5hbWUsXG4gICAgICAgIHBhcmFtczogRUpTT04uY2xvbmUocGFyYW1zKSxcbiAgICAgICAgaW5hY3RpdmU6IGZhbHNlLFxuICAgICAgICByZWFkeTogZmFsc2UsXG4gICAgICAgIHJlYWR5RGVwczogbmV3IFRyYWNrZXIuRGVwZW5kZW5jeSgpLFxuICAgICAgICByZWFkeUNhbGxiYWNrOiBjYWxsYmFja3Mub25SZWFkeSxcbiAgICAgICAgLy8gWFhYIENPTVBBVCBXSVRIIDEuMC4zLjEgI2Vycm9yQ2FsbGJhY2tcbiAgICAgICAgZXJyb3JDYWxsYmFjazogY2FsbGJhY2tzLm9uRXJyb3IsXG4gICAgICAgIHN0b3BDYWxsYmFjazogY2FsbGJhY2tzLm9uU3RvcCxcbiAgICAgICAgY29ubmVjdGlvbjogc2VsZixcbiAgICAgICAgcmVtb3ZlKCkge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb24uX3N1YnNjcmlwdGlvbnNbdGhpcy5pZF07XG4gICAgICAgICAgdGhpcy5yZWFkeSAmJiB0aGlzLnJlYWR5RGVwcy5jaGFuZ2VkKCk7XG4gICAgICAgIH0sXG4gICAgICAgIHN0b3AoKSB7XG4gICAgICAgICAgdGhpcy5jb25uZWN0aW9uLl9zZW5kUXVldWVkKHsgbXNnOiAndW5zdWInLCBpZDogaWQgfSk7XG4gICAgICAgICAgdGhpcy5yZW1vdmUoKTtcblxuICAgICAgICAgIGlmIChjYWxsYmFja3Mub25TdG9wKSB7XG4gICAgICAgICAgICBjYWxsYmFja3Mub25TdG9wKCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgc2VsZi5fc2VuZCh7IG1zZzogJ3N1YicsIGlkOiBpZCwgbmFtZTogbmFtZSwgcGFyYW1zOiBwYXJhbXMgfSk7XG4gICAgfVxuXG4gICAgLy8gcmV0dXJuIGEgaGFuZGxlIHRvIHRoZSBhcHBsaWNhdGlvbi5cbiAgICBjb25zdCBoYW5kbGUgPSB7XG4gICAgICBzdG9wKCkge1xuICAgICAgICBpZiAoISBoYXNPd24uY2FsbChzZWxmLl9zdWJzY3JpcHRpb25zLCBpZCkpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgc2VsZi5fc3Vic2NyaXB0aW9uc1tpZF0uc3RvcCgpO1xuICAgICAgfSxcbiAgICAgIHJlYWR5KCkge1xuICAgICAgICAvLyByZXR1cm4gZmFsc2UgaWYgd2UndmUgdW5zdWJzY3JpYmVkLlxuICAgICAgICBpZiAoIWhhc093bi5jYWxsKHNlbGYuX3N1YnNjcmlwdGlvbnMsIGlkKSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZWNvcmQgPSBzZWxmLl9zdWJzY3JpcHRpb25zW2lkXTtcbiAgICAgICAgcmVjb3JkLnJlYWR5RGVwcy5kZXBlbmQoKTtcbiAgICAgICAgcmV0dXJuIHJlY29yZC5yZWFkeTtcbiAgICAgIH0sXG4gICAgICBzdWJzY3JpcHRpb25JZDogaWRcbiAgICB9O1xuXG4gICAgaWYgKFRyYWNrZXIuYWN0aXZlKSB7XG4gICAgICAvLyBXZSdyZSBpbiBhIHJlYWN0aXZlIGNvbXB1dGF0aW9uLCBzbyB3ZSdkIGxpa2UgdG8gdW5zdWJzY3JpYmUgd2hlbiB0aGVcbiAgICAgIC8vIGNvbXB1dGF0aW9uIGlzIGludmFsaWRhdGVkLi4uIGJ1dCBub3QgaWYgdGhlIHJlcnVuIGp1c3QgcmUtc3Vic2NyaWJlc1xuICAgICAgLy8gdG8gdGhlIHNhbWUgc3Vic2NyaXB0aW9uISAgV2hlbiBhIHJlcnVuIGhhcHBlbnMsIHdlIHVzZSBvbkludmFsaWRhdGVcbiAgICAgIC8vIGFzIGEgY2hhbmdlIHRvIG1hcmsgdGhlIHN1YnNjcmlwdGlvbiBcImluYWN0aXZlXCIgc28gdGhhdCBpdCBjYW5cbiAgICAgIC8vIGJlIHJldXNlZCBmcm9tIHRoZSByZXJ1bi4gIElmIGl0IGlzbid0IHJldXNlZCwgaXQncyBraWxsZWQgZnJvbVxuICAgICAgLy8gYW4gYWZ0ZXJGbHVzaC5cbiAgICAgIFRyYWNrZXIub25JbnZhbGlkYXRlKChjKSA9PiB7XG4gICAgICAgIGlmIChoYXNPd24uY2FsbChzZWxmLl9zdWJzY3JpcHRpb25zLCBpZCkpIHtcbiAgICAgICAgICBzZWxmLl9zdWJzY3JpcHRpb25zW2lkXS5pbmFjdGl2ZSA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBUcmFja2VyLmFmdGVyRmx1c2goKCkgPT4ge1xuICAgICAgICAgIGlmIChoYXNPd24uY2FsbChzZWxmLl9zdWJzY3JpcHRpb25zLCBpZCkgJiZcbiAgICAgICAgICAgICAgc2VsZi5fc3Vic2NyaXB0aW9uc1tpZF0uaW5hY3RpdmUpIHtcbiAgICAgICAgICAgIGhhbmRsZS5zdG9wKCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBoYW5kbGU7XG4gIH1cblxuICAvKipcbiAgICogQHN1bW1hcnkgVGVsbHMgaWYgdGhlIG1ldGhvZCBjYWxsIGNhbWUgZnJvbSBhIGNhbGwgb3IgYSBjYWxsQXN5bmMuXG4gICAqIEBhbGlhcyBNZXRlb3IuaXNBc3luY0NhbGxcbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBtZW1iZXJPZiBNZXRlb3JcbiAgICogQGltcG9ydEZyb21QYWNrYWdlIG1ldGVvclxuICAgKiBAcmV0dXJucyBib29sZWFuXG4gICAqL1xuICBpc0FzeW5jQ2FsbCgpe1xuICAgIHJldHVybiBERFAuX0N1cnJlbnRNZXRob2RJbnZvY2F0aW9uLl9pc0NhbGxBc3luY01ldGhvZFJ1bm5pbmcoKVxuICB9XG4gIG1ldGhvZHMobWV0aG9kcykge1xuICAgIE9iamVjdC5lbnRyaWVzKG1ldGhvZHMpLmZvckVhY2goKFtuYW1lLCBmdW5jXSkgPT4ge1xuICAgICAgaWYgKHR5cGVvZiBmdW5jICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk1ldGhvZCAnXCIgKyBuYW1lICsgXCInIG11c3QgYmUgYSBmdW5jdGlvblwiKTtcbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLl9tZXRob2RIYW5kbGVyc1tuYW1lXSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJBIG1ldGhvZCBuYW1lZCAnXCIgKyBuYW1lICsgXCInIGlzIGFscmVhZHkgZGVmaW5lZFwiKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuX21ldGhvZEhhbmRsZXJzW25hbWVdID0gZnVuYztcbiAgICB9KTtcbiAgfVxuXG4gIF9nZXRJc1NpbXVsYXRpb24oe2lzRnJvbUNhbGxBc3luYywgYWxyZWFkeUluU2ltdWxhdGlvbn0pIHtcbiAgICBpZiAoIWlzRnJvbUNhbGxBc3luYykge1xuICAgICAgcmV0dXJuIGFscmVhZHlJblNpbXVsYXRpb247XG4gICAgfVxuICAgIHJldHVybiBhbHJlYWR5SW5TaW11bGF0aW9uICYmIEREUC5fQ3VycmVudE1ldGhvZEludm9jYXRpb24uX2lzQ2FsbEFzeW5jTWV0aG9kUnVubmluZygpO1xuICB9XG5cbiAgLyoqXG4gICAqIEBtZW1iZXJPZiBNZXRlb3JcbiAgICogQGltcG9ydEZyb21QYWNrYWdlIG1ldGVvclxuICAgKiBAYWxpYXMgTWV0ZW9yLmNhbGxcbiAgICogQHN1bW1hcnkgSW52b2tlcyBhIG1ldGhvZCB3aXRoIGEgc3luYyBzdHViLCBwYXNzaW5nIGFueSBudW1iZXIgb2YgYXJndW1lbnRzLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgTmFtZSBvZiBtZXRob2QgdG8gaW52b2tlXG4gICAqIEBwYXJhbSB7RUpTT05hYmxlfSBbYXJnMSxhcmcyLi4uXSBPcHRpb25hbCBtZXRob2QgYXJndW1lbnRzXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IFthc3luY0NhbGxiYWNrXSBPcHRpb25hbCBjYWxsYmFjaywgd2hpY2ggaXMgY2FsbGVkIGFzeW5jaHJvbm91c2x5IHdpdGggdGhlIGVycm9yIG9yIHJlc3VsdCBhZnRlciB0aGUgbWV0aG9kIGlzIGNvbXBsZXRlLiBJZiBub3QgcHJvdmlkZWQsIHRoZSBtZXRob2QgcnVucyBzeW5jaHJvbm91c2x5IGlmIHBvc3NpYmxlIChzZWUgYmVsb3cpLlxuICAgKi9cbiAgY2FsbChuYW1lIC8qIC4uIFthcmd1bWVudHNdIC4uIGNhbGxiYWNrICovKSB7XG4gICAgLy8gaWYgaXQncyBhIGZ1bmN0aW9uLCB0aGUgbGFzdCBhcmd1bWVudCBpcyB0aGUgcmVzdWx0IGNhbGxiYWNrLFxuICAgIC8vIG5vdCBhIHBhcmFtZXRlciB0byB0aGUgcmVtb3RlIG1ldGhvZC5cbiAgICBjb25zdCBhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgIGxldCBjYWxsYmFjaztcbiAgICBpZiAoYXJncy5sZW5ndGggJiYgdHlwZW9mIGFyZ3NbYXJncy5sZW5ndGggLSAxXSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgY2FsbGJhY2sgPSBhcmdzLnBvcCgpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hcHBseShuYW1lLCBhcmdzLCBjYWxsYmFjayk7XG4gIH1cbiAgLyoqXG4gICAqIEBtZW1iZXJPZiBNZXRlb3JcbiAgICogQGltcG9ydEZyb21QYWNrYWdlIG1ldGVvclxuICAgKiBAYWxpYXMgTWV0ZW9yLmNhbGxBc3luY1xuICAgKiBAc3VtbWFyeSBJbnZva2VzIGEgbWV0aG9kIHdpdGggYW4gYXN5bmMgc3R1YiwgcGFzc2luZyBhbnkgbnVtYmVyIG9mIGFyZ3VtZW50cy5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIE5hbWUgb2YgbWV0aG9kIHRvIGludm9rZVxuICAgKiBAcGFyYW0ge0VKU09OYWJsZX0gW2FyZzEsYXJnMi4uLl0gT3B0aW9uYWwgbWV0aG9kIGFyZ3VtZW50c1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAgICovXG4gIGNhbGxBc3luYyhuYW1lIC8qIC4uIFthcmd1bWVudHNdIC4uICovKSB7XG4gICAgY29uc3QgYXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICBpZiAoYXJncy5sZW5ndGggJiYgdHlwZW9mIGFyZ3NbYXJncy5sZW5ndGggLSAxXSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBcIk1ldGVvci5jYWxsQXN5bmMoKSBkb2VzIG5vdCBhY2NlcHQgYSBjYWxsYmFjay4gWW91IHNob3VsZCAnYXdhaXQnIHRoZSByZXN1bHQsIG9yIHVzZSAudGhlbigpLlwiXG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmFwcGx5QXN5bmMobmFtZSwgYXJncywgeyByZXR1cm5TZXJ2ZXJSZXN1bHRQcm9taXNlOiB0cnVlIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEBtZW1iZXJPZiBNZXRlb3JcbiAgICogQGltcG9ydEZyb21QYWNrYWdlIG1ldGVvclxuICAgKiBAYWxpYXMgTWV0ZW9yLmFwcGx5XG4gICAqIEBzdW1tYXJ5IEludm9rZSBhIG1ldGhvZCBwYXNzaW5nIGFuIGFycmF5IG9mIGFyZ3VtZW50cy5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIE5hbWUgb2YgbWV0aG9kIHRvIGludm9rZVxuICAgKiBAcGFyYW0ge0VKU09OYWJsZVtdfSBhcmdzIE1ldGhvZCBhcmd1bWVudHNcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXVxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMud2FpdCAoQ2xpZW50IG9ubHkpIElmIHRydWUsIGRvbid0IHNlbmQgdGhpcyBtZXRob2QgdW50aWwgYWxsIHByZXZpb3VzIG1ldGhvZCBjYWxscyBoYXZlIGNvbXBsZXRlZCwgYW5kIGRvbid0IHNlbmQgYW55IHN1YnNlcXVlbnQgbWV0aG9kIGNhbGxzIHVudGlsIHRoaXMgb25lIGlzIGNvbXBsZXRlZC5cbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gb3B0aW9ucy5vblJlc3VsdFJlY2VpdmVkIChDbGllbnQgb25seSkgVGhpcyBjYWxsYmFjayBpcyBpbnZva2VkIHdpdGggdGhlIGVycm9yIG9yIHJlc3VsdCBvZiB0aGUgbWV0aG9kIChqdXN0IGxpa2UgYGFzeW5jQ2FsbGJhY2tgKSBhcyBzb29uIGFzIHRoZSBlcnJvciBvciByZXN1bHQgaXMgYXZhaWxhYmxlLiBUaGUgbG9jYWwgY2FjaGUgbWF5IG5vdCB5ZXQgcmVmbGVjdCB0aGUgd3JpdGVzIHBlcmZvcm1lZCBieSB0aGUgbWV0aG9kLlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMubm9SZXRyeSAoQ2xpZW50IG9ubHkpIGlmIHRydWUsIGRvbid0IHNlbmQgdGhpcyBtZXRob2QgYWdhaW4gb24gcmVsb2FkLCBzaW1wbHkgY2FsbCB0aGUgY2FsbGJhY2sgYW4gZXJyb3Igd2l0aCB0aGUgZXJyb3IgY29kZSAnaW52b2NhdGlvbi1mYWlsZWQnLlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMudGhyb3dTdHViRXhjZXB0aW9ucyAoQ2xpZW50IG9ubHkpIElmIHRydWUsIGV4Y2VwdGlvbnMgdGhyb3duIGJ5IG1ldGhvZCBzdHVicyB3aWxsIGJlIHRocm93biBpbnN0ZWFkIG9mIGxvZ2dlZCwgYW5kIHRoZSBtZXRob2Qgd2lsbCBub3QgYmUgaW52b2tlZCBvbiB0aGUgc2VydmVyLlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMucmV0dXJuU3R1YlZhbHVlIChDbGllbnQgb25seSkgSWYgdHJ1ZSB0aGVuIGluIGNhc2VzIHdoZXJlIHdlIHdvdWxkIGhhdmUgb3RoZXJ3aXNlIGRpc2NhcmRlZCB0aGUgc3R1YidzIHJldHVybiB2YWx1ZSBhbmQgcmV0dXJuZWQgdW5kZWZpbmVkLCBpbnN0ZWFkIHdlIGdvIGFoZWFkIGFuZCByZXR1cm4gaXQuIFNwZWNpZmljYWxseSwgdGhpcyBpcyBhbnkgdGltZSBvdGhlciB0aGFuIHdoZW4gKGEpIHdlIGFyZSBhbHJlYWR5IGluc2lkZSBhIHN0dWIgb3IgKGIpIHdlIGFyZSBpbiBOb2RlIGFuZCBubyBjYWxsYmFjayB3YXMgcHJvdmlkZWQuIEN1cnJlbnRseSB3ZSByZXF1aXJlIHRoaXMgZmxhZyB0byBiZSBleHBsaWNpdGx5IHBhc3NlZCB0byByZWR1Y2UgdGhlIGxpa2VsaWhvb2QgdGhhdCBzdHViIHJldHVybiB2YWx1ZXMgd2lsbCBiZSBjb25mdXNlZCB3aXRoIHNlcnZlciByZXR1cm4gdmFsdWVzOyB3ZSBtYXkgaW1wcm92ZSB0aGlzIGluIGZ1dHVyZS5cbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gW2FzeW5jQ2FsbGJhY2tdIE9wdGlvbmFsIGNhbGxiYWNrOyBzYW1lIHNlbWFudGljcyBhcyBpbiBbYE1ldGVvci5jYWxsYF0oI21ldGVvcl9jYWxsKS5cbiAgICovXG4gIGFwcGx5KG5hbWUsIGFyZ3MsIG9wdGlvbnMsIGNhbGxiYWNrKSB7XG4gICAgY29uc3QgeyBzdHViSW52b2NhdGlvbiwgaW52b2NhdGlvbiwgLi4uc3R1Yk9wdGlvbnMgfSA9IHRoaXMuX3N0dWJDYWxsKG5hbWUsIEVKU09OLmNsb25lKGFyZ3MpKTtcblxuICAgIGlmIChzdHViT3B0aW9ucy5oYXNTdHViKSB7XG4gICAgICBpZiAoXG4gICAgICAgICF0aGlzLl9nZXRJc1NpbXVsYXRpb24oe1xuICAgICAgICAgIGFscmVhZHlJblNpbXVsYXRpb246IHN0dWJPcHRpb25zLmFscmVhZHlJblNpbXVsYXRpb24sXG4gICAgICAgICAgaXNGcm9tQ2FsbEFzeW5jOiBzdHViT3B0aW9ucy5pc0Zyb21DYWxsQXN5bmMsXG4gICAgICAgIH0pXG4gICAgICApIHtcbiAgICAgICAgdGhpcy5fc2F2ZU9yaWdpbmFscygpO1xuICAgICAgfVxuICAgICAgdHJ5IHtcbiAgICAgICAgc3R1Yk9wdGlvbnMuc3R1YlJldHVyblZhbHVlID0gRERQLl9DdXJyZW50TWV0aG9kSW52b2NhdGlvblxuICAgICAgICAgIC53aXRoVmFsdWUoaW52b2NhdGlvbiwgc3R1Ykludm9jYXRpb24pO1xuICAgICAgICBpZiAoTWV0ZW9yLl9pc1Byb21pc2Uoc3R1Yk9wdGlvbnMuc3R1YlJldHVyblZhbHVlKSkge1xuICAgICAgICAgIE1ldGVvci5fZGVidWcoXG4gICAgICAgICAgICBgTWV0aG9kICR7bmFtZX06IENhbGxpbmcgYSBtZXRob2QgdGhhdCBoYXMgYW4gYXN5bmMgbWV0aG9kIHN0dWIgd2l0aCBjYWxsL2FwcGx5IGNhbiBsZWFkIHRvIHVuZXhwZWN0ZWQgYmVoYXZpb3JzLiBVc2UgY2FsbEFzeW5jL2FwcGx5QXN5bmMgaW5zdGVhZC5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBzdHViT3B0aW9ucy5leGNlcHRpb24gPSBlO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fYXBwbHkobmFtZSwgc3R1Yk9wdGlvbnMsIGFyZ3MsIG9wdGlvbnMsIGNhbGxiYWNrKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAbWVtYmVyT2YgTWV0ZW9yXG4gICAqIEBpbXBvcnRGcm9tUGFja2FnZSBtZXRlb3JcbiAgICogQGFsaWFzIE1ldGVvci5hcHBseUFzeW5jXG4gICAqIEBzdW1tYXJ5IEludm9rZSBhIG1ldGhvZCBwYXNzaW5nIGFuIGFycmF5IG9mIGFyZ3VtZW50cy5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIE5hbWUgb2YgbWV0aG9kIHRvIGludm9rZVxuICAgKiBAcGFyYW0ge0VKU09OYWJsZVtdfSBhcmdzIE1ldGhvZCBhcmd1bWVudHNcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXVxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMud2FpdCAoQ2xpZW50IG9ubHkpIElmIHRydWUsIGRvbid0IHNlbmQgdGhpcyBtZXRob2QgdW50aWwgYWxsIHByZXZpb3VzIG1ldGhvZCBjYWxscyBoYXZlIGNvbXBsZXRlZCwgYW5kIGRvbid0IHNlbmQgYW55IHN1YnNlcXVlbnQgbWV0aG9kIGNhbGxzIHVudGlsIHRoaXMgb25lIGlzIGNvbXBsZXRlZC5cbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gb3B0aW9ucy5vblJlc3VsdFJlY2VpdmVkIChDbGllbnQgb25seSkgVGhpcyBjYWxsYmFjayBpcyBpbnZva2VkIHdpdGggdGhlIGVycm9yIG9yIHJlc3VsdCBvZiB0aGUgbWV0aG9kIChqdXN0IGxpa2UgYGFzeW5jQ2FsbGJhY2tgKSBhcyBzb29uIGFzIHRoZSBlcnJvciBvciByZXN1bHQgaXMgYXZhaWxhYmxlLiBUaGUgbG9jYWwgY2FjaGUgbWF5IG5vdCB5ZXQgcmVmbGVjdCB0aGUgd3JpdGVzIHBlcmZvcm1lZCBieSB0aGUgbWV0aG9kLlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMubm9SZXRyeSAoQ2xpZW50IG9ubHkpIGlmIHRydWUsIGRvbid0IHNlbmQgdGhpcyBtZXRob2QgYWdhaW4gb24gcmVsb2FkLCBzaW1wbHkgY2FsbCB0aGUgY2FsbGJhY2sgYW4gZXJyb3Igd2l0aCB0aGUgZXJyb3IgY29kZSAnaW52b2NhdGlvbi1mYWlsZWQnLlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMudGhyb3dTdHViRXhjZXB0aW9ucyAoQ2xpZW50IG9ubHkpIElmIHRydWUsIGV4Y2VwdGlvbnMgdGhyb3duIGJ5IG1ldGhvZCBzdHVicyB3aWxsIGJlIHRocm93biBpbnN0ZWFkIG9mIGxvZ2dlZCwgYW5kIHRoZSBtZXRob2Qgd2lsbCBub3QgYmUgaW52b2tlZCBvbiB0aGUgc2VydmVyLlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMucmV0dXJuU3R1YlZhbHVlIChDbGllbnQgb25seSkgSWYgdHJ1ZSB0aGVuIGluIGNhc2VzIHdoZXJlIHdlIHdvdWxkIGhhdmUgb3RoZXJ3aXNlIGRpc2NhcmRlZCB0aGUgc3R1YidzIHJldHVybiB2YWx1ZSBhbmQgcmV0dXJuZWQgdW5kZWZpbmVkLCBpbnN0ZWFkIHdlIGdvIGFoZWFkIGFuZCByZXR1cm4gaXQuIFNwZWNpZmljYWxseSwgdGhpcyBpcyBhbnkgdGltZSBvdGhlciB0aGFuIHdoZW4gKGEpIHdlIGFyZSBhbHJlYWR5IGluc2lkZSBhIHN0dWIgb3IgKGIpIHdlIGFyZSBpbiBOb2RlIGFuZCBubyBjYWxsYmFjayB3YXMgcHJvdmlkZWQuIEN1cnJlbnRseSB3ZSByZXF1aXJlIHRoaXMgZmxhZyB0byBiZSBleHBsaWNpdGx5IHBhc3NlZCB0byByZWR1Y2UgdGhlIGxpa2VsaWhvb2QgdGhhdCBzdHViIHJldHVybiB2YWx1ZXMgd2lsbCBiZSBjb25mdXNlZCB3aXRoIHNlcnZlciByZXR1cm4gdmFsdWVzOyB3ZSBtYXkgaW1wcm92ZSB0aGlzIGluIGZ1dHVyZS5cbiAgICogQHBhcmFtIHtCb29sZWFufSBvcHRpb25zLnJldHVyblNlcnZlclJlc3VsdFByb21pc2UgKENsaWVudCBvbmx5KSBJZiB0cnVlLCB0aGUgcHJvbWlzZSByZXR1cm5lZCBieSBhcHBseUFzeW5jIHdpbGwgcmVzb2x2ZSB0byB0aGUgc2VydmVyJ3MgcmV0dXJuIHZhbHVlLCByYXRoZXIgdGhhbiB0aGUgc3R1YidzIHJldHVybiB2YWx1ZS4gVGhpcyBpcyB1c2VmdWwgd2hlbiB5b3Ugd2FudCB0byBlbnN1cmUgdGhhdCB0aGUgc2VydmVyJ3MgcmV0dXJuIHZhbHVlIGlzIHVzZWQsIGV2ZW4gaWYgdGhlIHN0dWIgcmV0dXJucyBhIHByb21pc2UuIFRoZSBzYW1lIGJlaGF2aW9yIGFzIGBjYWxsQXN5bmNgLlxuICAgKi9cbiAgYXBwbHlBc3luYyhuYW1lLCBhcmdzLCBvcHRpb25zLCBjYWxsYmFjayA9IG51bGwpIHtcbiAgICBjb25zdCBzdHViUHJvbWlzZSA9IHRoaXMuX2FwcGx5QXN5bmNTdHViSW52b2NhdGlvbihuYW1lLCBhcmdzLCBvcHRpb25zKTtcblxuICAgIGNvbnN0IHByb21pc2UgPSB0aGlzLl9hcHBseUFzeW5jKHtcbiAgICAgIG5hbWUsXG4gICAgICBhcmdzLFxuICAgICAgb3B0aW9ucyxcbiAgICAgIGNhbGxiYWNrLFxuICAgICAgc3R1YlByb21pc2UsXG4gICAgfSk7XG4gICAgaWYgKE1ldGVvci5pc0NsaWVudCkge1xuICAgICAgLy8gb25seSByZXR1cm4gdGhlIHN0dWJSZXR1cm5WYWx1ZVxuICAgICAgcHJvbWlzZS5zdHViUHJvbWlzZSA9IHN0dWJQcm9taXNlLnRoZW4obyA9PiB7XG4gICAgICAgIGlmIChvLmV4Y2VwdGlvbikge1xuICAgICAgICAgIHRocm93IG8uZXhjZXB0aW9uO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvLnN0dWJSZXR1cm5WYWx1ZTtcbiAgICAgIH0pO1xuICAgICAgLy8gdGhpcyBhdm9pZHMgYXR0cmlidXRlIHJlY3Vyc2lvblxuICAgICAgcHJvbWlzZS5zZXJ2ZXJQcm9taXNlID0gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT5cbiAgICAgICAgcHJvbWlzZS50aGVuKHJlc29sdmUpLmNhdGNoKHJlamVjdCksXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuICBhc3luYyBfYXBwbHlBc3luY1N0dWJJbnZvY2F0aW9uKG5hbWUsIGFyZ3MsIG9wdGlvbnMpIHtcbiAgICBjb25zdCB7IHN0dWJJbnZvY2F0aW9uLCBpbnZvY2F0aW9uLCAuLi5zdHViT3B0aW9ucyB9ID0gdGhpcy5fc3R1YkNhbGwobmFtZSwgRUpTT04uY2xvbmUoYXJncyksIG9wdGlvbnMpO1xuICAgIGlmIChzdHViT3B0aW9ucy5oYXNTdHViKSB7XG4gICAgICBpZiAoXG4gICAgICAgICF0aGlzLl9nZXRJc1NpbXVsYXRpb24oe1xuICAgICAgICAgIGFscmVhZHlJblNpbXVsYXRpb246IHN0dWJPcHRpb25zLmFscmVhZHlJblNpbXVsYXRpb24sXG4gICAgICAgICAgaXNGcm9tQ2FsbEFzeW5jOiBzdHViT3B0aW9ucy5pc0Zyb21DYWxsQXN5bmMsXG4gICAgICAgIH0pXG4gICAgICApIHtcbiAgICAgICAgdGhpcy5fc2F2ZU9yaWdpbmFscygpO1xuICAgICAgfVxuICAgICAgdHJ5IHtcbiAgICAgICAgLypcbiAgICAgICAgICogVGhlIGNvZGUgYmVsb3cgZm9sbG93cyB0aGUgc2FtZSBsb2dpYyBhcyB0aGUgZnVuY3Rpb24gd2l0aFZhbHVlcygpLlxuICAgICAgICAgKlxuICAgICAgICAgKiBCdXQgYXMgdGhlIE1ldGVvciBwYWNrYWdlIGlzIG5vdCBjb21waWxlZCBieSBlY21hc2NyaXB0LCBpdCBpcyB1bmFibGUgdG8gdXNlIG5ld2VyIHN5bnRheCBpbiB0aGUgYnJvd3NlcixcbiAgICAgICAgICogc3VjaCBhcywgdGhlIGFzeW5jL2F3YWl0LlxuICAgICAgICAgKlxuICAgICAgICAgKiBTbywgdG8ga2VlcCBzdXBwb3J0aW5nIG9sZCBicm93c2VycywgbGlrZSBJRSAxMSwgd2UncmUgY3JlYXRpbmcgdGhlIGxvZ2ljIG9uZSBsZXZlbCBhYm92ZS5cbiAgICAgICAgICovXG4gICAgICAgIGNvbnN0IGN1cnJlbnRDb250ZXh0ID0gRERQLl9DdXJyZW50TWV0aG9kSW52b2NhdGlvbi5fc2V0TmV3Q29udGV4dEFuZEdldEN1cnJlbnQoXG4gICAgICAgICAgaW52b2NhdGlvblxuICAgICAgICApO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHN0dWJPcHRpb25zLnN0dWJSZXR1cm5WYWx1ZSA9IGF3YWl0IHN0dWJJbnZvY2F0aW9uKCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBzdHViT3B0aW9ucy5leGNlcHRpb24gPSBlO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgIEREUC5fQ3VycmVudE1ldGhvZEludm9jYXRpb24uX3NldChjdXJyZW50Q29udGV4dCk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgc3R1Yk9wdGlvbnMuZXhjZXB0aW9uID0gZTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHN0dWJPcHRpb25zO1xuICB9XG4gIGFzeW5jIF9hcHBseUFzeW5jKHsgbmFtZSwgYXJncywgb3B0aW9ucywgY2FsbGJhY2ssIHN0dWJQcm9taXNlIH0pIHtcbiAgICBjb25zdCBzdHViT3B0aW9ucyA9IGF3YWl0IHN0dWJQcm9taXNlO1xuICAgIHJldHVybiB0aGlzLl9hcHBseShuYW1lLCBzdHViT3B0aW9ucywgYXJncywgb3B0aW9ucywgY2FsbGJhY2spO1xuICB9XG5cbiAgX2FwcGx5KG5hbWUsIHN0dWJDYWxsVmFsdWUsIGFyZ3MsIG9wdGlvbnMsIGNhbGxiYWNrKSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgICAvLyBXZSB3ZXJlIHBhc3NlZCAzIGFyZ3VtZW50cy4gVGhleSBtYXkgYmUgZWl0aGVyIChuYW1lLCBhcmdzLCBvcHRpb25zKVxuICAgIC8vIG9yIChuYW1lLCBhcmdzLCBjYWxsYmFjaylcbiAgICBpZiAoIWNhbGxiYWNrICYmIHR5cGVvZiBvcHRpb25zID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjYWxsYmFjayA9IG9wdGlvbnM7XG4gICAgICBvcHRpb25zID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICB9XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwgT2JqZWN0LmNyZWF0ZShudWxsKTtcblxuICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgLy8gWFhYIHdvdWxkIGl0IGJlIGJldHRlciBmb3JtIHRvIGRvIHRoZSBiaW5kaW5nIGluIHN0cmVhbS5vbixcbiAgICAgIC8vIG9yIGNhbGxlciwgaW5zdGVhZCBvZiBoZXJlP1xuICAgICAgLy8gWFhYIGltcHJvdmUgZXJyb3IgbWVzc2FnZSAoYW5kIGhvdyB3ZSByZXBvcnQgaXQpXG4gICAgICBjYWxsYmFjayA9IE1ldGVvci5iaW5kRW52aXJvbm1lbnQoXG4gICAgICAgIGNhbGxiYWNrLFxuICAgICAgICBcImRlbGl2ZXJpbmcgcmVzdWx0IG9mIGludm9raW5nICdcIiArIG5hbWUgKyBcIidcIlxuICAgICAgKTtcbiAgICB9XG4gICAgY29uc3Qge1xuICAgICAgaGFzU3R1YixcbiAgICAgIGV4Y2VwdGlvbixcbiAgICAgIHN0dWJSZXR1cm5WYWx1ZSxcbiAgICAgIGFscmVhZHlJblNpbXVsYXRpb24sXG4gICAgICByYW5kb21TZWVkLFxuICAgIH0gPSBzdHViQ2FsbFZhbHVlO1xuXG4gICAgLy8gS2VlcCBvdXIgYXJncyBzYWZlIGZyb20gbXV0YXRpb24gKGVnIGlmIHdlIGRvbid0IHNlbmQgdGhlIG1lc3NhZ2UgZm9yIGFcbiAgICAvLyB3aGlsZSBiZWNhdXNlIG9mIGEgd2FpdCBtZXRob2QpLlxuICAgIGFyZ3MgPSBFSlNPTi5jbG9uZShhcmdzKTtcbiAgICAvLyBJZiB3ZSdyZSBpbiBhIHNpbXVsYXRpb24sIHN0b3AgYW5kIHJldHVybiB0aGUgcmVzdWx0IHdlIGhhdmUsXG4gICAgLy8gcmF0aGVyIHRoYW4gZ29pbmcgb24gdG8gZG8gYW4gUlBDLiBJZiB0aGVyZSB3YXMgbm8gc3R1YixcbiAgICAvLyB3ZSdsbCBlbmQgdXAgcmV0dXJuaW5nIHVuZGVmaW5lZC5cbiAgICBpZiAoXG4gICAgICB0aGlzLl9nZXRJc1NpbXVsYXRpb24oe1xuICAgICAgICBhbHJlYWR5SW5TaW11bGF0aW9uLFxuICAgICAgICBpc0Zyb21DYWxsQXN5bmM6IHN0dWJDYWxsVmFsdWUuaXNGcm9tQ2FsbEFzeW5jLFxuICAgICAgfSlcbiAgICApIHtcbiAgICAgIGxldCByZXN1bHQ7XG5cbiAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFjayhleGNlcHRpb24sIHN0dWJSZXR1cm5WYWx1ZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZXhjZXB0aW9uKSB0aHJvdyBleGNlcHRpb247XG4gICAgICAgIHJlc3VsdCA9IHN0dWJSZXR1cm5WYWx1ZTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG9wdGlvbnMuX3JldHVybk1ldGhvZEludm9rZXIgPyB7IHJlc3VsdCB9IDogcmVzdWx0O1xuICAgIH1cblxuICAgIC8vIFdlIG9ubHkgY3JlYXRlIHRoZSBtZXRob2RJZCBoZXJlIGJlY2F1c2Ugd2UgZG9uJ3QgYWN0dWFsbHkgbmVlZCBvbmUgaWZcbiAgICAvLyB3ZSdyZSBhbHJlYWR5IGluIGEgc2ltdWxhdGlvblxuICAgIGNvbnN0IG1ldGhvZElkID0gJycgKyBzZWxmLl9uZXh0TWV0aG9kSWQrKztcbiAgICBpZiAoaGFzU3R1Yikge1xuICAgICAgc2VsZi5fcmV0cmlldmVBbmRTdG9yZU9yaWdpbmFscyhtZXRob2RJZCk7XG4gICAgfVxuXG4gICAgLy8gR2VuZXJhdGUgdGhlIEREUCBtZXNzYWdlIGZvciB0aGUgbWV0aG9kIGNhbGwuIE5vdGUgdGhhdCBvbiB0aGUgY2xpZW50LFxuICAgIC8vIGl0IGlzIGltcG9ydGFudCB0aGF0IHRoZSBzdHViIGhhdmUgZmluaXNoZWQgYmVmb3JlIHdlIHNlbmQgdGhlIFJQQywgc29cbiAgICAvLyB0aGF0IHdlIGtub3cgd2UgaGF2ZSBhIGNvbXBsZXRlIGxpc3Qgb2Ygd2hpY2ggbG9jYWwgZG9jdW1lbnRzIHRoZSBzdHViXG4gICAgLy8gd3JvdGUuXG4gICAgY29uc3QgbWVzc2FnZSA9IHtcbiAgICAgIG1zZzogJ21ldGhvZCcsXG4gICAgICBpZDogbWV0aG9kSWQsXG4gICAgICBtZXRob2Q6IG5hbWUsXG4gICAgICBwYXJhbXM6IGFyZ3NcbiAgICB9O1xuXG4gICAgLy8gSWYgYW4gZXhjZXB0aW9uIG9jY3VycmVkIGluIGEgc3R1YiwgYW5kIHdlJ3JlIGlnbm9yaW5nIGl0XG4gICAgLy8gYmVjYXVzZSB3ZSdyZSBkb2luZyBhbiBSUEMgYW5kIHdhbnQgdG8gdXNlIHdoYXQgdGhlIHNlcnZlclxuICAgIC8vIHJldHVybnMgaW5zdGVhZCwgbG9nIGl0IHNvIHRoZSBkZXZlbG9wZXIga25vd3NcbiAgICAvLyAodW5sZXNzIHRoZXkgZXhwbGljaXRseSBhc2sgdG8gc2VlIHRoZSBlcnJvcikuXG4gICAgLy9cbiAgICAvLyBUZXN0cyBjYW4gc2V0IHRoZSAnX2V4cGVjdGVkQnlUZXN0JyBmbGFnIG9uIGFuIGV4Y2VwdGlvbiBzbyBpdCB3b24ndFxuICAgIC8vIGdvIHRvIGxvZy5cbiAgICBpZiAoZXhjZXB0aW9uKSB7XG4gICAgICBpZiAob3B0aW9ucy50aHJvd1N0dWJFeGNlcHRpb25zKSB7XG4gICAgICAgIHRocm93IGV4Y2VwdGlvbjtcbiAgICAgIH0gZWxzZSBpZiAoIWV4Y2VwdGlvbi5fZXhwZWN0ZWRCeVRlc3QpIHtcbiAgICAgICAgTWV0ZW9yLl9kZWJ1ZyhcbiAgICAgICAgICBcIkV4Y2VwdGlvbiB3aGlsZSBzaW11bGF0aW5nIHRoZSBlZmZlY3Qgb2YgaW52b2tpbmcgJ1wiICsgbmFtZSArIFwiJ1wiLFxuICAgICAgICAgIGV4Y2VwdGlvblxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEF0IHRoaXMgcG9pbnQgd2UncmUgZGVmaW5pdGVseSBkb2luZyBhbiBSUEMsIGFuZCB3ZSdyZSBnb2luZyB0b1xuICAgIC8vIHJldHVybiB0aGUgdmFsdWUgb2YgdGhlIFJQQyB0byB0aGUgY2FsbGVyLlxuXG4gICAgLy8gSWYgdGhlIGNhbGxlciBkaWRuJ3QgZ2l2ZSBhIGNhbGxiYWNrLCBkZWNpZGUgd2hhdCB0byBkby5cbiAgICBsZXQgcHJvbWlzZTtcbiAgICBpZiAoIWNhbGxiYWNrKSB7XG4gICAgICBpZiAoXG4gICAgICAgIE1ldGVvci5pc0NsaWVudCAmJlxuICAgICAgICAhb3B0aW9ucy5yZXR1cm5TZXJ2ZXJSZXN1bHRQcm9taXNlICYmXG4gICAgICAgICghb3B0aW9ucy5pc0Zyb21DYWxsQXN5bmMgfHwgb3B0aW9ucy5yZXR1cm5TdHViVmFsdWUpXG4gICAgICApIHtcbiAgICAgICAgY2FsbGJhY2sgPSAoZXJyKSA9PiB7XG4gICAgICAgICAgZXJyICYmIE1ldGVvci5fZGVidWcoXCJFcnJvciBpbnZva2luZyBNZXRob2QgJ1wiICsgbmFtZSArIFwiJ1wiLCBlcnIpO1xuICAgICAgICB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcHJvbWlzZSA9IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICBjYWxsYmFjayA9ICguLi5hbGxBcmdzKSA9PiB7XG4gICAgICAgICAgICBsZXQgYXJncyA9IEFycmF5LmZyb20oYWxsQXJncyk7XG4gICAgICAgICAgICBsZXQgZXJyID0gYXJncy5zaGlmdCgpO1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICByZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzb2x2ZSguLi5hcmdzKTtcbiAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBTZW5kIHRoZSByYW5kb21TZWVkIG9ubHkgaWYgd2UgdXNlZCBpdFxuICAgIGlmIChyYW5kb21TZWVkLnZhbHVlICE9PSBudWxsKSB7XG4gICAgICBtZXNzYWdlLnJhbmRvbVNlZWQgPSByYW5kb21TZWVkLnZhbHVlO1xuICAgIH1cblxuICAgIGNvbnN0IG1ldGhvZEludm9rZXIgPSBuZXcgTWV0aG9kSW52b2tlcih7XG4gICAgICBtZXRob2RJZCxcbiAgICAgIGNhbGxiYWNrOiBjYWxsYmFjayxcbiAgICAgIGNvbm5lY3Rpb246IHNlbGYsXG4gICAgICBvblJlc3VsdFJlY2VpdmVkOiBvcHRpb25zLm9uUmVzdWx0UmVjZWl2ZWQsXG4gICAgICB3YWl0OiAhIW9wdGlvbnMud2FpdCxcbiAgICAgIG1lc3NhZ2U6IG1lc3NhZ2UsXG4gICAgICBub1JldHJ5OiAhIW9wdGlvbnMubm9SZXRyeVxuICAgIH0pO1xuXG4gICAgbGV0IHJlc3VsdDtcblxuICAgIGlmIChwcm9taXNlKSB7XG4gICAgICByZXN1bHQgPSBvcHRpb25zLnJldHVyblN0dWJWYWx1ZSA/IHByb21pc2UudGhlbigoKSA9PiBzdHViUmV0dXJuVmFsdWUpIDogcHJvbWlzZTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0ID0gb3B0aW9ucy5yZXR1cm5TdHViVmFsdWUgPyBzdHViUmV0dXJuVmFsdWUgOiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgaWYgKG9wdGlvbnMuX3JldHVybk1ldGhvZEludm9rZXIpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG1ldGhvZEludm9rZXIsXG4gICAgICAgIHJlc3VsdCxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgc2VsZi5fYWRkT3V0c3RhbmRpbmdNZXRob2QobWV0aG9kSW52b2tlciwgb3B0aW9ucyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIF9zdHViQ2FsbChuYW1lLCBhcmdzLCBvcHRpb25zKSB7XG4gICAgLy8gUnVuIHRoZSBzdHViLCBpZiB3ZSBoYXZlIG9uZS4gVGhlIHN0dWIgaXMgc3VwcG9zZWQgdG8gbWFrZSBzb21lXG4gICAgLy8gdGVtcG9yYXJ5IHdyaXRlcyB0byB0aGUgZGF0YWJhc2UgdG8gZ2l2ZSB0aGUgdXNlciBhIHNtb290aCBleHBlcmllbmNlXG4gICAgLy8gdW50aWwgdGhlIGFjdHVhbCByZXN1bHQgb2YgZXhlY3V0aW5nIHRoZSBtZXRob2QgY29tZXMgYmFjayBmcm9tIHRoZVxuICAgIC8vIHNlcnZlciAod2hlcmV1cG9uIHRoZSB0ZW1wb3Jhcnkgd3JpdGVzIHRvIHRoZSBkYXRhYmFzZSB3aWxsIGJlIHJldmVyc2VkXG4gICAgLy8gZHVyaW5nIHRoZSBiZWdpblVwZGF0ZS9lbmRVcGRhdGUgcHJvY2Vzcy4pXG4gICAgLy9cbiAgICAvLyBOb3JtYWxseSwgd2UgaWdub3JlIHRoZSByZXR1cm4gdmFsdWUgb2YgdGhlIHN0dWIgKGV2ZW4gaWYgaXQgaXMgYW5cbiAgICAvLyBleGNlcHRpb24pLCBpbiBmYXZvciBvZiB0aGUgcmVhbCByZXR1cm4gdmFsdWUgZnJvbSB0aGUgc2VydmVyLiBUaGVcbiAgICAvLyBleGNlcHRpb24gaXMgaWYgdGhlICpjYWxsZXIqIGlzIGEgc3R1Yi4gSW4gdGhhdCBjYXNlLCB3ZSdyZSBub3QgZ29pbmdcbiAgICAvLyB0byBkbyBhIFJQQywgc28gd2UgdXNlIHRoZSByZXR1cm4gdmFsdWUgb2YgdGhlIHN0dWIgYXMgb3VyIHJldHVyblxuICAgIC8vIHZhbHVlLlxuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGNvbnN0IGVuY2xvc2luZyA9IEREUC5fQ3VycmVudE1ldGhvZEludm9jYXRpb24uZ2V0KCk7XG4gICAgY29uc3Qgc3R1YiA9IHNlbGYuX21ldGhvZEhhbmRsZXJzW25hbWVdO1xuICAgIGNvbnN0IGFscmVhZHlJblNpbXVsYXRpb24gPSBlbmNsb3Npbmc/LmlzU2ltdWxhdGlvbjtcbiAgICBjb25zdCBpc0Zyb21DYWxsQXN5bmMgPSBlbmNsb3Npbmc/Ll9pc0Zyb21DYWxsQXN5bmM7XG4gICAgY29uc3QgcmFuZG9tU2VlZCA9IHsgdmFsdWU6IG51bGx9O1xuXG4gICAgY29uc3QgZGVmYXVsdFJldHVybiA9IHtcbiAgICAgIGFscmVhZHlJblNpbXVsYXRpb24sXG4gICAgICByYW5kb21TZWVkLFxuICAgICAgaXNGcm9tQ2FsbEFzeW5jLFxuICAgIH07XG4gICAgaWYgKCFzdHViKSB7XG4gICAgICByZXR1cm4geyAuLi5kZWZhdWx0UmV0dXJuLCBoYXNTdHViOiBmYWxzZSB9O1xuICAgIH1cblxuICAgIC8vIExhemlseSBnZW5lcmF0ZSBhIHJhbmRvbVNlZWQsIG9ubHkgaWYgaXQgaXMgcmVxdWVzdGVkIGJ5IHRoZSBzdHViLlxuICAgIC8vIFRoZSByYW5kb20gc3RyZWFtcyBvbmx5IGhhdmUgdXRpbGl0eSBpZiB0aGV5J3JlIHVzZWQgb24gYm90aCB0aGUgY2xpZW50XG4gICAgLy8gYW5kIHRoZSBzZXJ2ZXI7IGlmIHRoZSBjbGllbnQgZG9lc24ndCBnZW5lcmF0ZSBhbnkgJ3JhbmRvbScgdmFsdWVzXG4gICAgLy8gdGhlbiB3ZSBkb24ndCBleHBlY3QgdGhlIHNlcnZlciB0byBnZW5lcmF0ZSBhbnkgZWl0aGVyLlxuICAgIC8vIExlc3MgY29tbW9ubHksIHRoZSBzZXJ2ZXIgbWF5IHBlcmZvcm0gZGlmZmVyZW50IGFjdGlvbnMgZnJvbSB0aGUgY2xpZW50LFxuICAgIC8vIGFuZCBtYXkgaW4gZmFjdCBnZW5lcmF0ZSB2YWx1ZXMgd2hlcmUgdGhlIGNsaWVudCBkaWQgbm90LCBidXQgd2UgZG9uJ3RcbiAgICAvLyBoYXZlIGFueSBjbGllbnQtc2lkZSB2YWx1ZXMgdG8gbWF0Y2gsIHNvIGV2ZW4gaGVyZSB3ZSBtYXkgYXMgd2VsbCBqdXN0XG4gICAgLy8gdXNlIGEgcmFuZG9tIHNlZWQgb24gdGhlIHNlcnZlci4gIEluIHRoYXQgY2FzZSwgd2UgZG9uJ3QgcGFzcyB0aGVcbiAgICAvLyByYW5kb21TZWVkIHRvIHNhdmUgYmFuZHdpZHRoLCBhbmQgd2UgZG9uJ3QgZXZlbiBnZW5lcmF0ZSBpdCB0byBzYXZlIGFcbiAgICAvLyBiaXQgb2YgQ1BVIGFuZCB0byBhdm9pZCBjb25zdW1pbmcgZW50cm9weS5cblxuICAgIGNvbnN0IHJhbmRvbVNlZWRHZW5lcmF0b3IgPSAoKSA9PiB7XG4gICAgICBpZiAocmFuZG9tU2VlZC52YWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICByYW5kb21TZWVkLnZhbHVlID0gRERQQ29tbW9uLm1ha2VScGNTZWVkKGVuY2xvc2luZywgbmFtZSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmFuZG9tU2VlZC52YWx1ZTtcbiAgICB9O1xuXG4gICAgY29uc3Qgc2V0VXNlcklkID0gdXNlcklkID0+IHtcbiAgICAgIHNlbGYuc2V0VXNlcklkKHVzZXJJZCk7XG4gICAgfTtcblxuICAgIGNvbnN0IGludm9jYXRpb24gPSBuZXcgRERQQ29tbW9uLk1ldGhvZEludm9jYXRpb24oe1xuICAgICAgbmFtZSxcbiAgICAgIGlzU2ltdWxhdGlvbjogdHJ1ZSxcbiAgICAgIHVzZXJJZDogc2VsZi51c2VySWQoKSxcbiAgICAgIGlzRnJvbUNhbGxBc3luYzogb3B0aW9ucz8uaXNGcm9tQ2FsbEFzeW5jLFxuICAgICAgc2V0VXNlcklkOiBzZXRVc2VySWQsXG4gICAgICByYW5kb21TZWVkKCkge1xuICAgICAgICByZXR1cm4gcmFuZG9tU2VlZEdlbmVyYXRvcigpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gTm90ZSB0aGF0IHVubGlrZSBpbiB0aGUgY29ycmVzcG9uZGluZyBzZXJ2ZXIgY29kZSwgd2UgbmV2ZXIgYXVkaXRcbiAgICAvLyB0aGF0IHN0dWJzIGNoZWNrKCkgdGhlaXIgYXJndW1lbnRzLlxuICAgIGNvbnN0IHN0dWJJbnZvY2F0aW9uID0gKCkgPT4ge1xuICAgICAgICBpZiAoTWV0ZW9yLmlzU2VydmVyKSB7XG4gICAgICAgICAgLy8gQmVjYXVzZSBzYXZlT3JpZ2luYWxzIGFuZCByZXRyaWV2ZU9yaWdpbmFscyBhcmVuJ3QgcmVlbnRyYW50LFxuICAgICAgICAgIC8vIGRvbid0IGFsbG93IHN0dWJzIHRvIHlpZWxkLlxuICAgICAgICAgIHJldHVybiBNZXRlb3IuX25vWWllbGRzQWxsb3dlZCgoKSA9PiB7XG4gICAgICAgICAgICAvLyByZS1jbG9uZSwgc28gdGhhdCB0aGUgc3R1YiBjYW4ndCBhZmZlY3Qgb3VyIGNhbGxlcidzIHZhbHVlc1xuICAgICAgICAgICAgcmV0dXJuIHN0dWIuYXBwbHkoaW52b2NhdGlvbiwgRUpTT04uY2xvbmUoYXJncykpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBzdHViLmFwcGx5KGludm9jYXRpb24sIEVKU09OLmNsb25lKGFyZ3MpKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgcmV0dXJuIHsgLi4uZGVmYXVsdFJldHVybiwgaGFzU3R1YjogdHJ1ZSwgc3R1Ykludm9jYXRpb24sIGludm9jYXRpb24gfTtcbiAgfVxuXG4gIC8vIEJlZm9yZSBjYWxsaW5nIGEgbWV0aG9kIHN0dWIsIHByZXBhcmUgYWxsIHN0b3JlcyB0byB0cmFjayBjaGFuZ2VzIGFuZCBhbGxvd1xuICAvLyBfcmV0cmlldmVBbmRTdG9yZU9yaWdpbmFscyB0byBnZXQgdGhlIG9yaWdpbmFsIHZlcnNpb25zIG9mIGNoYW5nZWRcbiAgLy8gZG9jdW1lbnRzLlxuICBfc2F2ZU9yaWdpbmFscygpIHtcbiAgICBpZiAoISB0aGlzLl93YWl0aW5nRm9yUXVpZXNjZW5jZSgpKSB7XG4gICAgICB0aGlzLl9mbHVzaEJ1ZmZlcmVkV3JpdGVzKCk7XG4gICAgfVxuXG4gICAgT2JqZWN0LnZhbHVlcyh0aGlzLl9zdG9yZXMpLmZvckVhY2goKHN0b3JlKSA9PiB7XG4gICAgICBzdG9yZS5zYXZlT3JpZ2luYWxzKCk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBSZXRyaWV2ZXMgdGhlIG9yaWdpbmFsIHZlcnNpb25zIG9mIGFsbCBkb2N1bWVudHMgbW9kaWZpZWQgYnkgdGhlIHN0dWIgZm9yXG4gIC8vIG1ldGhvZCAnbWV0aG9kSWQnIGZyb20gYWxsIHN0b3JlcyBhbmQgc2F2ZXMgdGhlbSB0byBfc2VydmVyRG9jdW1lbnRzIChrZXllZFxuICAvLyBieSBkb2N1bWVudCkgYW5kIF9kb2N1bWVudHNXcml0dGVuQnlTdHViIChrZXllZCBieSBtZXRob2QgSUQpLlxuICBfcmV0cmlldmVBbmRTdG9yZU9yaWdpbmFscyhtZXRob2RJZCkge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGlmIChzZWxmLl9kb2N1bWVudHNXcml0dGVuQnlTdHViW21ldGhvZElkXSlcbiAgICAgIHRocm93IG5ldyBFcnJvcignRHVwbGljYXRlIG1ldGhvZElkIGluIF9yZXRyaWV2ZUFuZFN0b3JlT3JpZ2luYWxzJyk7XG5cbiAgICBjb25zdCBkb2NzV3JpdHRlbiA9IFtdO1xuXG4gICAgT2JqZWN0LmVudHJpZXMoc2VsZi5fc3RvcmVzKS5mb3JFYWNoKChbY29sbGVjdGlvbiwgc3RvcmVdKSA9PiB7XG4gICAgICBjb25zdCBvcmlnaW5hbHMgPSBzdG9yZS5yZXRyaWV2ZU9yaWdpbmFscygpO1xuICAgICAgLy8gbm90IGFsbCBzdG9yZXMgZGVmaW5lIHJldHJpZXZlT3JpZ2luYWxzXG4gICAgICBpZiAoISBvcmlnaW5hbHMpIHJldHVybjtcbiAgICAgIG9yaWdpbmFscy5mb3JFYWNoKChkb2MsIGlkKSA9PiB7XG4gICAgICAgIGRvY3NXcml0dGVuLnB1c2goeyBjb2xsZWN0aW9uLCBpZCB9KTtcbiAgICAgICAgaWYgKCEgaGFzT3duLmNhbGwoc2VsZi5fc2VydmVyRG9jdW1lbnRzLCBjb2xsZWN0aW9uKSkge1xuICAgICAgICAgIHNlbGYuX3NlcnZlckRvY3VtZW50c1tjb2xsZWN0aW9uXSA9IG5ldyBNb25nb0lETWFwKCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc2VydmVyRG9jID0gc2VsZi5fc2VydmVyRG9jdW1lbnRzW2NvbGxlY3Rpb25dLnNldERlZmF1bHQoXG4gICAgICAgICAgaWQsXG4gICAgICAgICAgT2JqZWN0LmNyZWF0ZShudWxsKVxuICAgICAgICApO1xuICAgICAgICBpZiAoc2VydmVyRG9jLndyaXR0ZW5CeVN0dWJzKSB7XG4gICAgICAgICAgLy8gV2UncmUgbm90IHRoZSBmaXJzdCBzdHViIHRvIHdyaXRlIHRoaXMgZG9jLiBKdXN0IGFkZCBvdXIgbWV0aG9kIElEXG4gICAgICAgICAgLy8gdG8gdGhlIHJlY29yZC5cbiAgICAgICAgICBzZXJ2ZXJEb2Mud3JpdHRlbkJ5U3R1YnNbbWV0aG9kSWRdID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBGaXJzdCBzdHViISBTYXZlIHRoZSBvcmlnaW5hbCB2YWx1ZSBhbmQgb3VyIG1ldGhvZCBJRC5cbiAgICAgICAgICBzZXJ2ZXJEb2MuZG9jdW1lbnQgPSBkb2M7XG4gICAgICAgICAgc2VydmVyRG9jLmZsdXNoQ2FsbGJhY2tzID0gW107XG4gICAgICAgICAgc2VydmVyRG9jLndyaXR0ZW5CeVN0dWJzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICAgICAgICBzZXJ2ZXJEb2Mud3JpdHRlbkJ5U3R1YnNbbWV0aG9kSWRdID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG4gICAgaWYgKCEgaXNFbXB0eShkb2NzV3JpdHRlbikpIHtcbiAgICAgIHNlbGYuX2RvY3VtZW50c1dyaXR0ZW5CeVN0dWJbbWV0aG9kSWRdID0gZG9jc1dyaXR0ZW47XG4gICAgfVxuICB9XG5cbiAgLy8gVGhpcyBpcyB2ZXJ5IG11Y2ggYSBwcml2YXRlIGZ1bmN0aW9uIHdlIHVzZSB0byBtYWtlIHRoZSB0ZXN0c1xuICAvLyB0YWtlIHVwIGZld2VyIHNlcnZlciByZXNvdXJjZXMgYWZ0ZXIgdGhleSBjb21wbGV0ZS5cbiAgX3Vuc3Vic2NyaWJlQWxsKCkge1xuICAgIE9iamVjdC52YWx1ZXModGhpcy5fc3Vic2NyaXB0aW9ucykuZm9yRWFjaCgoc3ViKSA9PiB7XG4gICAgICAvLyBBdm9pZCBraWxsaW5nIHRoZSBhdXRvdXBkYXRlIHN1YnNjcmlwdGlvbiBzbyB0aGF0IGRldmVsb3BlcnNcbiAgICAgIC8vIHN0aWxsIGdldCBob3QgY29kZSBwdXNoZXMgd2hlbiB3cml0aW5nIHRlc3RzLlxuICAgICAgLy9cbiAgICAgIC8vIFhYWCBpdCdzIGEgaGFjayB0byBlbmNvZGUga25vd2xlZGdlIGFib3V0IGF1dG91cGRhdGUgaGVyZSxcbiAgICAgIC8vIGJ1dCBpdCBkb2Vzbid0IHNlZW0gd29ydGggaXQgeWV0IHRvIGhhdmUgYSBzcGVjaWFsIEFQSSBmb3JcbiAgICAgIC8vIHN1YnNjcmlwdGlvbnMgdG8gcHJlc2VydmUgYWZ0ZXIgdW5pdCB0ZXN0cy5cbiAgICAgIGlmIChzdWIubmFtZSAhPT0gJ21ldGVvcl9hdXRvdXBkYXRlX2NsaWVudFZlcnNpb25zJykge1xuICAgICAgICBzdWIuc3RvcCgpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gU2VuZHMgdGhlIEREUCBzdHJpbmdpZmljYXRpb24gb2YgdGhlIGdpdmVuIG1lc3NhZ2Ugb2JqZWN0XG4gIF9zZW5kKG9iaikge1xuICAgIHRoaXMuX3N0cmVhbS5zZW5kKEREUENvbW1vbi5zdHJpbmdpZnlERFAob2JqKSk7XG4gIH1cblxuICAvLyBBbHdheXMgcXVldWVzIHRoZSBjYWxsIGJlZm9yZSBzZW5kaW5nIHRoZSBtZXNzYWdlXG4gIC8vIFVzZWQsIGZvciBleGFtcGxlLCBvbiBzdWJzY3JpcHRpb24uW2lkXS5zdG9wKCkgdG8gbWFrZSBzdXJlIGEgXCJzdWJcIiBtZXNzYWdlIGlzIGFsd2F5cyBjYWxsZWQgYmVmb3JlIGFuIFwidW5zdWJcIiBtZXNzYWdlXG4gIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9tZXRlb3IvbWV0ZW9yL2lzc3Vlcy8xMzIxMlxuICAvL1xuICAvLyBUaGlzIGlzIHBhcnQgb2YgdGhlIGFjdHVhbCBmaXggZm9yIHRoZSByZXN0IGNoZWNrOlxuICAvLyBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9wdWxsLzEzMjM2XG4gIF9zZW5kUXVldWVkKG9iaikge1xuICAgIHRoaXMuX3NlbmQob2JqLCB0cnVlKTtcbiAgfVxuXG4gIC8vIFdlIGRldGVjdGVkIHZpYSBERFAtbGV2ZWwgaGVhcnRiZWF0cyB0aGF0IHdlJ3ZlIGxvc3QgdGhlXG4gIC8vIGNvbm5lY3Rpb24uICBVbmxpa2UgYGRpc2Nvbm5lY3RgIG9yIGBjbG9zZWAsIGEgbG9zdCBjb25uZWN0aW9uXG4gIC8vIHdpbGwgYmUgYXV0b21hdGljYWxseSByZXRyaWVkLlxuICBfbG9zdENvbm5lY3Rpb24oZXJyb3IpIHtcbiAgICB0aGlzLl9zdHJlYW0uX2xvc3RDb25uZWN0aW9uKGVycm9yKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAbWVtYmVyT2YgTWV0ZW9yXG4gICAqIEBpbXBvcnRGcm9tUGFja2FnZSBtZXRlb3JcbiAgICogQGFsaWFzIE1ldGVvci5zdGF0dXNcbiAgICogQHN1bW1hcnkgR2V0IHRoZSBjdXJyZW50IGNvbm5lY3Rpb24gc3RhdHVzLiBBIHJlYWN0aXZlIGRhdGEgc291cmNlLlxuICAgKiBAbG9jdXMgQ2xpZW50XG4gICAqL1xuICBzdGF0dXMoLi4uYXJncykge1xuICAgIHJldHVybiB0aGlzLl9zdHJlYW0uc3RhdHVzKC4uLmFyZ3MpO1xuICB9XG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IEZvcmNlIGFuIGltbWVkaWF0ZSByZWNvbm5lY3Rpb24gYXR0ZW1wdCBpZiB0aGUgY2xpZW50IGlzIG5vdCBjb25uZWN0ZWQgdG8gdGhlIHNlcnZlci5cblxuICBUaGlzIG1ldGhvZCBkb2VzIG5vdGhpbmcgaWYgdGhlIGNsaWVudCBpcyBhbHJlYWR5IGNvbm5lY3RlZC5cbiAgICogQG1lbWJlck9mIE1ldGVvclxuICAgKiBAaW1wb3J0RnJvbVBhY2thZ2UgbWV0ZW9yXG4gICAqIEBhbGlhcyBNZXRlb3IucmVjb25uZWN0XG4gICAqIEBsb2N1cyBDbGllbnRcbiAgICovXG4gIHJlY29ubmVjdCguLi5hcmdzKSB7XG4gICAgcmV0dXJuIHRoaXMuX3N0cmVhbS5yZWNvbm5lY3QoLi4uYXJncyk7XG4gIH1cblxuICAvKipcbiAgICogQG1lbWJlck9mIE1ldGVvclxuICAgKiBAaW1wb3J0RnJvbVBhY2thZ2UgbWV0ZW9yXG4gICAqIEBhbGlhcyBNZXRlb3IuZGlzY29ubmVjdFxuICAgKiBAc3VtbWFyeSBEaXNjb25uZWN0IHRoZSBjbGllbnQgZnJvbSB0aGUgc2VydmVyLlxuICAgKiBAbG9jdXMgQ2xpZW50XG4gICAqL1xuICBkaXNjb25uZWN0KC4uLmFyZ3MpIHtcbiAgICByZXR1cm4gdGhpcy5fc3RyZWFtLmRpc2Nvbm5lY3QoLi4uYXJncyk7XG4gIH1cblxuICBjbG9zZSgpIHtcbiAgICByZXR1cm4gdGhpcy5fc3RyZWFtLmRpc2Nvbm5lY3QoeyBfcGVybWFuZW50OiB0cnVlIH0pO1xuICB9XG5cbiAgLy8vXG4gIC8vLyBSZWFjdGl2ZSB1c2VyIHN5c3RlbVxuICAvLy9cbiAgdXNlcklkKCkge1xuICAgIGlmICh0aGlzLl91c2VySWREZXBzKSB0aGlzLl91c2VySWREZXBzLmRlcGVuZCgpO1xuICAgIHJldHVybiB0aGlzLl91c2VySWQ7XG4gIH1cblxuICBzZXRVc2VySWQodXNlcklkKSB7XG4gICAgLy8gQXZvaWQgaW52YWxpZGF0aW5nIGRlcGVuZGVudHMgaWYgc2V0VXNlcklkIGlzIGNhbGxlZCB3aXRoIGN1cnJlbnQgdmFsdWUuXG4gICAgaWYgKHRoaXMuX3VzZXJJZCA9PT0gdXNlcklkKSByZXR1cm47XG4gICAgdGhpcy5fdXNlcklkID0gdXNlcklkO1xuICAgIGlmICh0aGlzLl91c2VySWREZXBzKSB0aGlzLl91c2VySWREZXBzLmNoYW5nZWQoKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgdHJ1ZSBpZiB3ZSBhcmUgaW4gYSBzdGF0ZSBhZnRlciByZWNvbm5lY3Qgb2Ygd2FpdGluZyBmb3Igc3VicyB0byBiZVxuICAvLyByZXZpdmVkIG9yIGVhcmx5IG1ldGhvZHMgdG8gZmluaXNoIHRoZWlyIGRhdGEsIG9yIHdlIGFyZSB3YWl0aW5nIGZvciBhXG4gIC8vIFwid2FpdFwiIG1ldGhvZCB0byBmaW5pc2guXG4gIF93YWl0aW5nRm9yUXVpZXNjZW5jZSgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgISBpc0VtcHR5KHRoaXMuX3N1YnNCZWluZ1Jldml2ZWQpIHx8XG4gICAgICAhIGlzRW1wdHkodGhpcy5fbWV0aG9kc0Jsb2NraW5nUXVpZXNjZW5jZSlcbiAgICApO1xuICB9XG5cbiAgLy8gUmV0dXJucyB0cnVlIGlmIGFueSBtZXRob2Qgd2hvc2UgbWVzc2FnZSBoYXMgYmVlbiBzZW50IHRvIHRoZSBzZXJ2ZXIgaGFzXG4gIC8vIG5vdCB5ZXQgaW52b2tlZCBpdHMgdXNlciBjYWxsYmFjay5cbiAgX2FueU1ldGhvZHNBcmVPdXRzdGFuZGluZygpIHtcbiAgICBjb25zdCBpbnZva2VycyA9IHRoaXMuX21ldGhvZEludm9rZXJzO1xuICAgIHJldHVybiBPYmplY3QudmFsdWVzKGludm9rZXJzKS5zb21lKChpbnZva2VyKSA9PiAhIWludm9rZXIuc2VudE1lc3NhZ2UpO1xuICB9XG5cbiAgYXN5bmMgX3Byb2Nlc3NPbmVEYXRhTWVzc2FnZShtc2csIHVwZGF0ZXMpIHtcbiAgICBjb25zdCBtZXNzYWdlVHlwZSA9IG1zZy5tc2c7XG5cbiAgICAvLyBtc2cgaXMgb25lIG9mIFsnYWRkZWQnLCAnY2hhbmdlZCcsICdyZW1vdmVkJywgJ3JlYWR5JywgJ3VwZGF0ZWQnXVxuICAgIGlmIChtZXNzYWdlVHlwZSA9PT0gJ2FkZGVkJykge1xuICAgICAgYXdhaXQgdGhpcy5fcHJvY2Vzc19hZGRlZChtc2csIHVwZGF0ZXMpO1xuICAgIH0gZWxzZSBpZiAobWVzc2FnZVR5cGUgPT09ICdjaGFuZ2VkJykge1xuICAgICAgdGhpcy5fcHJvY2Vzc19jaGFuZ2VkKG1zZywgdXBkYXRlcyk7XG4gICAgfSBlbHNlIGlmIChtZXNzYWdlVHlwZSA9PT0gJ3JlbW92ZWQnKSB7XG4gICAgICB0aGlzLl9wcm9jZXNzX3JlbW92ZWQobXNnLCB1cGRhdGVzKTtcbiAgICB9IGVsc2UgaWYgKG1lc3NhZ2VUeXBlID09PSAncmVhZHknKSB7XG4gICAgICB0aGlzLl9wcm9jZXNzX3JlYWR5KG1zZywgdXBkYXRlcyk7XG4gICAgfSBlbHNlIGlmIChtZXNzYWdlVHlwZSA9PT0gJ3VwZGF0ZWQnKSB7XG4gICAgICB0aGlzLl9wcm9jZXNzX3VwZGF0ZWQobXNnLCB1cGRhdGVzKTtcbiAgICB9IGVsc2UgaWYgKG1lc3NhZ2VUeXBlID09PSAnbm9zdWInKSB7XG4gICAgICAvLyBpZ25vcmUgdGhpc1xuICAgIH0gZWxzZSB7XG4gICAgICBNZXRlb3IuX2RlYnVnKCdkaXNjYXJkaW5nIHVua25vd24gbGl2ZWRhdGEgZGF0YSBtZXNzYWdlIHR5cGUnLCBtc2cpO1xuICAgIH1cbiAgfVxuXG4gIF9wcmVwYXJlQnVmZmVyc1RvRmx1c2goKSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgaWYgKHNlbGYuX2J1ZmZlcmVkV3JpdGVzRmx1c2hIYW5kbGUpIHtcbiAgICAgIGNsZWFyVGltZW91dChzZWxmLl9idWZmZXJlZFdyaXRlc0ZsdXNoSGFuZGxlKTtcbiAgICAgIHNlbGYuX2J1ZmZlcmVkV3JpdGVzRmx1c2hIYW5kbGUgPSBudWxsO1xuICAgIH1cblxuICAgIHNlbGYuX2J1ZmZlcmVkV3JpdGVzRmx1c2hBdCA9IG51bGw7XG4gICAgLy8gV2UgbmVlZCB0byBjbGVhciB0aGUgYnVmZmVyIGJlZm9yZSBwYXNzaW5nIGl0IHRvXG4gICAgLy8gIHBlcmZvcm1Xcml0ZXMuIEFzIHRoZXJlJ3Mgbm8gZ3VhcmFudGVlIHRoYXQgaXRcbiAgICAvLyAgd2lsbCBleGl0IGNsZWFubHkuXG4gICAgY29uc3Qgd3JpdGVzID0gc2VsZi5fYnVmZmVyZWRXcml0ZXM7XG4gICAgc2VsZi5fYnVmZmVyZWRXcml0ZXMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgIHJldHVybiB3cml0ZXM7XG4gIH1cblxuICAvKipcbiAgICogU2VydmVyLXNpZGUgc3RvcmUgdXBkYXRlcyBoYW5kbGVkIGFzeW5jaHJvbm91c2x5XG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBhc3luYyBfcGVyZm9ybVdyaXRlc1NlcnZlcih1cGRhdGVzKSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgICBpZiAoc2VsZi5fcmVzZXRTdG9yZXMgfHwgIWlzRW1wdHkodXBkYXRlcykpIHtcbiAgICAgIC8vIFN0YXJ0IGFsbCBzdG9yZSB1cGRhdGVzIC0ga2VlcGluZyBvcmlnaW5hbCBsb29wIHN0cnVjdHVyZVxuICAgICAgZm9yIChjb25zdCBzdG9yZSBvZiBPYmplY3QudmFsdWVzKHNlbGYuX3N0b3JlcykpIHtcbiAgICAgICAgYXdhaXQgc3RvcmUuYmVnaW5VcGRhdGUoXG4gICAgICAgICAgdXBkYXRlc1tzdG9yZS5fbmFtZV0/Lmxlbmd0aCB8fCAwLFxuICAgICAgICAgIHNlbGYuX3Jlc2V0U3RvcmVzXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIHNlbGYuX3Jlc2V0U3RvcmVzID0gZmFsc2U7XG5cbiAgICAgIC8vIFByb2Nlc3MgZWFjaCBzdG9yZSdzIHVwZGF0ZXMgc2VxdWVudGlhbGx5IGFzIGJlZm9yZVxuICAgICAgZm9yIChjb25zdCBbc3RvcmVOYW1lLCBtZXNzYWdlc10gb2YgT2JqZWN0LmVudHJpZXModXBkYXRlcykpIHtcbiAgICAgICAgY29uc3Qgc3RvcmUgPSBzZWxmLl9zdG9yZXNbc3RvcmVOYW1lXTtcbiAgICAgICAgaWYgKHN0b3JlKSB7XG4gICAgICAgICAgLy8gQmF0Y2ggZWFjaCBzdG9yZSdzIG1lc3NhZ2VzIGluIG1vZGVzdCBjaHVua3MgdG8gcHJldmVudCBldmVudCBsb29wIGJsb2NraW5nXG4gICAgICAgICAgLy8gd2hpbGUgbWFpbnRhaW5pbmcgb3BlcmF0aW9uIG9yZGVyXG4gICAgICAgICAgY29uc3QgQ0hVTktfU0laRSA9IDEwMDtcbiAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1lc3NhZ2VzLmxlbmd0aDsgaSArPSBDSFVOS19TSVpFKSB7XG4gICAgICAgICAgICBjb25zdCBjaHVuayA9IG1lc3NhZ2VzLnNsaWNlKGksIE1hdGgubWluKGkgKyBDSFVOS19TSVpFLCBtZXNzYWdlcy5sZW5ndGgpKTtcblxuICAgICAgICAgICAgZm9yIChjb25zdCBtc2cgb2YgY2h1bmspIHtcbiAgICAgICAgICAgICAgYXdhaXQgc3RvcmUudXBkYXRlKG1zZyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gcHJvY2Vzcy5uZXh0VGljayhyZXNvbHZlKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIFF1ZXVlIHVwZGF0ZXMgZm9yIHVuaW5pdGlhbGl6ZWQgc3RvcmVzXG4gICAgICAgICAgc2VsZi5fdXBkYXRlc0ZvclVua25vd25TdG9yZXNbc3RvcmVOYW1lXSA9XG4gICAgICAgICAgICBzZWxmLl91cGRhdGVzRm9yVW5rbm93blN0b3Jlc1tzdG9yZU5hbWVdIHx8IFtdO1xuICAgICAgICAgIHNlbGYuX3VwZGF0ZXNGb3JVbmtub3duU3RvcmVzW3N0b3JlTmFtZV0ucHVzaCguLi5tZXNzYWdlcyk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gQ29tcGxldGUgYWxsIHVwZGF0ZXNcbiAgICAgIGZvciAoY29uc3Qgc3RvcmUgb2YgT2JqZWN0LnZhbHVlcyhzZWxmLl9zdG9yZXMpKSB7XG4gICAgICAgIGF3YWl0IHN0b3JlLmVuZFVwZGF0ZSgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHNlbGYuX3J1bkFmdGVyVXBkYXRlQ2FsbGJhY2tzKCk7XG4gIH1cblxuICAvKipcbiAgICogQ2xpZW50LXNpZGUgc3RvcmUgdXBkYXRlcyBoYW5kbGVkIHN5bmNocm9ub3VzbHkgZm9yIG9wdGltaXN0aWMgVUlcbiAgICogQHByaXZhdGVcbiAgICovXG4gIF9wZXJmb3JtV3JpdGVzQ2xpZW50KHVwZGF0ZXMpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcblxuICAgIGlmIChzZWxmLl9yZXNldFN0b3JlcyB8fCAhaXNFbXB0eSh1cGRhdGVzKSkge1xuICAgICAgLy8gU3luY2hyb25vdXMgc3RvcmUgdXBkYXRlcyBmb3IgY2xpZW50XG4gICAgICBPYmplY3QudmFsdWVzKHNlbGYuX3N0b3JlcykuZm9yRWFjaChzdG9yZSA9PiB7XG4gICAgICAgIHN0b3JlLmJlZ2luVXBkYXRlKFxuICAgICAgICAgIHVwZGF0ZXNbc3RvcmUuX25hbWVdPy5sZW5ndGggfHwgMCxcbiAgICAgICAgICBzZWxmLl9yZXNldFN0b3Jlc1xuICAgICAgICApO1xuICAgICAgfSk7XG5cbiAgICAgIHNlbGYuX3Jlc2V0U3RvcmVzID0gZmFsc2U7XG5cbiAgICAgIE9iamVjdC5lbnRyaWVzKHVwZGF0ZXMpLmZvckVhY2goKFtzdG9yZU5hbWUsIG1lc3NhZ2VzXSkgPT4ge1xuICAgICAgICBjb25zdCBzdG9yZSA9IHNlbGYuX3N0b3Jlc1tzdG9yZU5hbWVdO1xuICAgICAgICBpZiAoc3RvcmUpIHtcbiAgICAgICAgICBtZXNzYWdlcy5mb3JFYWNoKG1zZyA9PiBzdG9yZS51cGRhdGUobXNnKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc2VsZi5fdXBkYXRlc0ZvclVua25vd25TdG9yZXNbc3RvcmVOYW1lXSA9XG4gICAgICAgICAgICBzZWxmLl91cGRhdGVzRm9yVW5rbm93blN0b3Jlc1tzdG9yZU5hbWVdIHx8IFtdO1xuICAgICAgICAgIHNlbGYuX3VwZGF0ZXNGb3JVbmtub3duU3RvcmVzW3N0b3JlTmFtZV0ucHVzaCguLi5tZXNzYWdlcyk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBPYmplY3QudmFsdWVzKHNlbGYuX3N0b3JlcykuZm9yRWFjaChzdG9yZSA9PiBzdG9yZS5lbmRVcGRhdGUoKSk7XG4gICAgfVxuXG4gICAgc2VsZi5fcnVuQWZ0ZXJVcGRhdGVDYWxsYmFja3MoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFeGVjdXRlcyBidWZmZXJlZCB3cml0ZXMgZWl0aGVyIHN5bmNocm9ub3VzbHkgKGNsaWVudCkgb3IgYXN5bmMgKHNlcnZlcilcbiAgICogQHByaXZhdGVcbiAgICovXG4gIGFzeW5jIF9mbHVzaEJ1ZmZlcmVkV3JpdGVzKCkge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGNvbnN0IHdyaXRlcyA9IHNlbGYuX3ByZXBhcmVCdWZmZXJzVG9GbHVzaCgpO1xuXG4gICAgcmV0dXJuIE1ldGVvci5pc0NsaWVudFxuICAgICAgPyBzZWxmLl9wZXJmb3JtV3JpdGVzQ2xpZW50KHdyaXRlcylcbiAgICAgIDogc2VsZi5fcGVyZm9ybVdyaXRlc1NlcnZlcih3cml0ZXMpO1xuICB9XG5cbiAgLy8gQ2FsbCBhbnkgY2FsbGJhY2tzIGRlZmVycmVkIHdpdGggX3J1bldoZW5BbGxTZXJ2ZXJEb2NzQXJlRmx1c2hlZCB3aG9zZVxuICAvLyByZWxldmFudCBkb2NzIGhhdmUgYmVlbiBmbHVzaGVkLCBhcyB3ZWxsIGFzIGRhdGFWaXNpYmxlIGNhbGxiYWNrcyBhdFxuICAvLyByZWNvbm5lY3QtcXVpZXNjZW5jZSB0aW1lLlxuICBfcnVuQWZ0ZXJVcGRhdGVDYWxsYmFja3MoKSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgY29uc3QgY2FsbGJhY2tzID0gc2VsZi5fYWZ0ZXJVcGRhdGVDYWxsYmFja3M7XG4gICAgc2VsZi5fYWZ0ZXJVcGRhdGVDYWxsYmFja3MgPSBbXTtcbiAgICBjYWxsYmFja3MuZm9yRWFjaCgoYykgPT4ge1xuICAgICAgYygpO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gRW5zdXJlcyB0aGF0IFwiZlwiIHdpbGwgYmUgY2FsbGVkIGFmdGVyIGFsbCBkb2N1bWVudHMgY3VycmVudGx5IGluXG4gIC8vIF9zZXJ2ZXJEb2N1bWVudHMgaGF2ZSBiZWVuIHdyaXR0ZW4gdG8gdGhlIGxvY2FsIGNhY2hlLiBmIHdpbGwgbm90IGJlIGNhbGxlZFxuICAvLyBpZiB0aGUgY29ubmVjdGlvbiBpcyBsb3N0IGJlZm9yZSB0aGVuIVxuICBfcnVuV2hlbkFsbFNlcnZlckRvY3NBcmVGbHVzaGVkKGYpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBjb25zdCBydW5GQWZ0ZXJVcGRhdGVzID0gKCkgPT4ge1xuICAgICAgc2VsZi5fYWZ0ZXJVcGRhdGVDYWxsYmFja3MucHVzaChmKTtcbiAgICB9O1xuICAgIGxldCB1bmZsdXNoZWRTZXJ2ZXJEb2NDb3VudCA9IDA7XG4gICAgY29uc3Qgb25TZXJ2ZXJEb2NGbHVzaCA9ICgpID0+IHtcbiAgICAgIC0tdW5mbHVzaGVkU2VydmVyRG9jQ291bnQ7XG4gICAgICBpZiAodW5mbHVzaGVkU2VydmVyRG9jQ291bnQgPT09IDApIHtcbiAgICAgICAgLy8gVGhpcyB3YXMgdGhlIGxhc3QgZG9jIHRvIGZsdXNoISBBcnJhbmdlIHRvIHJ1biBmIGFmdGVyIHRoZSB1cGRhdGVzXG4gICAgICAgIC8vIGhhdmUgYmVlbiBhcHBsaWVkLlxuICAgICAgICBydW5GQWZ0ZXJVcGRhdGVzKCk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIE9iamVjdC52YWx1ZXMoc2VsZi5fc2VydmVyRG9jdW1lbnRzKS5mb3JFYWNoKChzZXJ2ZXJEb2N1bWVudHMpID0+IHtcbiAgICAgIHNlcnZlckRvY3VtZW50cy5mb3JFYWNoKChzZXJ2ZXJEb2MpID0+IHtcbiAgICAgICAgY29uc3Qgd3JpdHRlbkJ5U3R1YkZvckFNZXRob2RXaXRoU2VudE1lc3NhZ2UgPVxuICAgICAgICAgIGtleXMoc2VydmVyRG9jLndyaXR0ZW5CeVN0dWJzKS5zb21lKG1ldGhvZElkID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGludm9rZXIgPSBzZWxmLl9tZXRob2RJbnZva2Vyc1ttZXRob2RJZF07XG4gICAgICAgICAgICByZXR1cm4gaW52b2tlciAmJiBpbnZva2VyLnNlbnRNZXNzYWdlO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgIGlmICh3cml0dGVuQnlTdHViRm9yQU1ldGhvZFdpdGhTZW50TWVzc2FnZSkge1xuICAgICAgICAgICsrdW5mbHVzaGVkU2VydmVyRG9jQ291bnQ7XG4gICAgICAgICAgc2VydmVyRG9jLmZsdXNoQ2FsbGJhY2tzLnB1c2gob25TZXJ2ZXJEb2NGbHVzaCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICAgIGlmICh1bmZsdXNoZWRTZXJ2ZXJEb2NDb3VudCA9PT0gMCkge1xuICAgICAgLy8gVGhlcmUgYXJlbid0IGFueSBidWZmZXJlZCBkb2NzIC0tLSB3ZSBjYW4gY2FsbCBmIGFzIHNvb24gYXMgdGhlIGN1cnJlbnRcbiAgICAgIC8vIHJvdW5kIG9mIHVwZGF0ZXMgaXMgYXBwbGllZCFcbiAgICAgIHJ1bkZBZnRlclVwZGF0ZXMoKTtcbiAgICB9XG4gIH1cblxuICBfYWRkT3V0c3RhbmRpbmdNZXRob2QobWV0aG9kSW52b2tlciwgb3B0aW9ucykge1xuICAgIGlmIChvcHRpb25zPy53YWl0KSB7XG4gICAgICAvLyBJdCdzIGEgd2FpdCBtZXRob2QhIFdhaXQgbWV0aG9kcyBnbyBpbiB0aGVpciBvd24gYmxvY2suXG4gICAgICB0aGlzLl9vdXRzdGFuZGluZ01ldGhvZEJsb2Nrcy5wdXNoKHtcbiAgICAgICAgd2FpdDogdHJ1ZSxcbiAgICAgICAgbWV0aG9kczogW21ldGhvZEludm9rZXJdXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gTm90IGEgd2FpdCBtZXRob2QuIFN0YXJ0IGEgbmV3IGJsb2NrIGlmIHRoZSBwcmV2aW91cyBibG9jayB3YXMgYSB3YWl0XG4gICAgICAvLyBibG9jaywgYW5kIGFkZCBpdCB0byB0aGUgbGFzdCBibG9jayBvZiBtZXRob2RzLlxuICAgICAgaWYgKGlzRW1wdHkodGhpcy5fb3V0c3RhbmRpbmdNZXRob2RCbG9ja3MpIHx8XG4gICAgICAgICAgbGFzdCh0aGlzLl9vdXRzdGFuZGluZ01ldGhvZEJsb2Nrcykud2FpdCkge1xuICAgICAgICB0aGlzLl9vdXRzdGFuZGluZ01ldGhvZEJsb2Nrcy5wdXNoKHtcbiAgICAgICAgICB3YWl0OiBmYWxzZSxcbiAgICAgICAgICBtZXRob2RzOiBbXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIGxhc3QodGhpcy5fb3V0c3RhbmRpbmdNZXRob2RCbG9ja3MpLm1ldGhvZHMucHVzaChtZXRob2RJbnZva2VyKTtcbiAgICB9XG5cbiAgICAvLyBJZiB3ZSBhZGRlZCBpdCB0byB0aGUgZmlyc3QgYmxvY2ssIHNlbmQgaXQgb3V0IG5vdy5cbiAgICBpZiAodGhpcy5fb3V0c3RhbmRpbmdNZXRob2RCbG9ja3MubGVuZ3RoID09PSAxKSB7XG4gICAgICBtZXRob2RJbnZva2VyLnNlbmRNZXNzYWdlKCk7XG4gICAgfVxuICB9XG5cbiAgLy8gQ2FsbGVkIGJ5IE1ldGhvZEludm9rZXIgYWZ0ZXIgYSBtZXRob2QncyBjYWxsYmFjayBpcyBpbnZva2VkLiAgSWYgdGhpcyB3YXNcbiAgLy8gdGhlIGxhc3Qgb3V0c3RhbmRpbmcgbWV0aG9kIGluIHRoZSBjdXJyZW50IGJsb2NrLCBydW5zIHRoZSBuZXh0IGJsb2NrLiBJZlxuICAvLyB0aGVyZSBhcmUgbm8gbW9yZSBtZXRob2RzLCBjb25zaWRlciBhY2NlcHRpbmcgYSBob3QgY29kZSBwdXNoLlxuICBfb3V0c3RhbmRpbmdNZXRob2RGaW5pc2hlZCgpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBpZiAoc2VsZi5fYW55TWV0aG9kc0FyZU91dHN0YW5kaW5nKCkpIHJldHVybjtcblxuICAgIC8vIE5vIG1ldGhvZHMgYXJlIG91dHN0YW5kaW5nLiBUaGlzIHNob3VsZCBtZWFuIHRoYXQgdGhlIGZpcnN0IGJsb2NrIG9mXG4gICAgLy8gbWV0aG9kcyBpcyBlbXB0eS4gKE9yIGl0IG1pZ2h0IG5vdCBleGlzdCwgaWYgdGhpcyB3YXMgYSBtZXRob2QgdGhhdFxuICAgIC8vIGhhbGYtZmluaXNoZWQgYmVmb3JlIGRpc2Nvbm5lY3QvcmVjb25uZWN0LilcbiAgICBpZiAoISBpc0VtcHR5KHNlbGYuX291dHN0YW5kaW5nTWV0aG9kQmxvY2tzKSkge1xuICAgICAgY29uc3QgZmlyc3RCbG9jayA9IHNlbGYuX291dHN0YW5kaW5nTWV0aG9kQmxvY2tzLnNoaWZ0KCk7XG4gICAgICBpZiAoISBpc0VtcHR5KGZpcnN0QmxvY2subWV0aG9kcykpXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAnTm8gbWV0aG9kcyBvdXRzdGFuZGluZyBidXQgbm9uZW1wdHkgYmxvY2s6ICcgK1xuICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZmlyc3RCbG9jaylcbiAgICAgICAgKTtcblxuICAgICAgLy8gU2VuZCB0aGUgb3V0c3RhbmRpbmcgbWV0aG9kcyBub3cgaW4gdGhlIGZpcnN0IGJsb2NrLlxuICAgICAgaWYgKCEgaXNFbXB0eShzZWxmLl9vdXRzdGFuZGluZ01ldGhvZEJsb2NrcykpXG4gICAgICAgIHNlbGYuX3NlbmRPdXRzdGFuZGluZ01ldGhvZHMoKTtcbiAgICB9XG5cbiAgICAvLyBNYXliZSBhY2NlcHQgYSBob3QgY29kZSBwdXNoLlxuICAgIHNlbGYuX21heWJlTWlncmF0ZSgpO1xuICB9XG5cbiAgLy8gU2VuZHMgbWVzc2FnZXMgZm9yIGFsbCB0aGUgbWV0aG9kcyBpbiB0aGUgZmlyc3QgYmxvY2sgaW5cbiAgLy8gX291dHN0YW5kaW5nTWV0aG9kQmxvY2tzLlxuICBfc2VuZE91dHN0YW5kaW5nTWV0aG9kcygpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcblxuICAgIGlmIChpc0VtcHR5KHNlbGYuX291dHN0YW5kaW5nTWV0aG9kQmxvY2tzKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHNlbGYuX291dHN0YW5kaW5nTWV0aG9kQmxvY2tzWzBdLm1ldGhvZHMuZm9yRWFjaChtID0+IHtcbiAgICAgIG0uc2VuZE1lc3NhZ2UoKTtcbiAgICB9KTtcbiAgfVxuXG4gIF9zZW5kT3V0c3RhbmRpbmdNZXRob2RCbG9ja3NNZXNzYWdlcyhvbGRPdXRzdGFuZGluZ01ldGhvZEJsb2Nrcykge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGlmIChpc0VtcHR5KG9sZE91dHN0YW5kaW5nTWV0aG9kQmxvY2tzKSkgcmV0dXJuO1xuXG4gICAgLy8gV2UgaGF2ZSBhdCBsZWFzdCBvbmUgYmxvY2sgd29ydGggb2Ygb2xkIG91dHN0YW5kaW5nIG1ldGhvZHMgdG8gdHJ5XG4gICAgLy8gYWdhaW4uIEZpcnN0OiBkaWQgb25SZWNvbm5lY3QgYWN0dWFsbHkgc2VuZCBhbnl0aGluZz8gSWYgbm90LCB3ZSBqdXN0XG4gICAgLy8gcmVzdG9yZSBhbGwgb3V0c3RhbmRpbmcgbWV0aG9kcyBhbmQgcnVuIHRoZSBmaXJzdCBibG9jay5cbiAgICBpZiAoaXNFbXB0eShzZWxmLl9vdXRzdGFuZGluZ01ldGhvZEJsb2NrcykpIHtcbiAgICAgIHNlbGYuX291dHN0YW5kaW5nTWV0aG9kQmxvY2tzID0gb2xkT3V0c3RhbmRpbmdNZXRob2RCbG9ja3M7XG4gICAgICBzZWxmLl9zZW5kT3V0c3RhbmRpbmdNZXRob2RzKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gT0ssIHRoZXJlIGFyZSBibG9ja3Mgb24gYm90aCBzaWRlcy4gU3BlY2lhbCBjYXNlOiBtZXJnZSB0aGUgbGFzdCBibG9jayBvZlxuICAgIC8vIHRoZSByZWNvbm5lY3QgbWV0aG9kcyB3aXRoIHRoZSBmaXJzdCBibG9jayBvZiB0aGUgb3JpZ2luYWwgbWV0aG9kcywgaWZcbiAgICAvLyBuZWl0aGVyIG9mIHRoZW0gYXJlIFwid2FpdFwiIGJsb2Nrcy5cbiAgICBpZiAoXG4gICAgICAhbGFzdChzZWxmLl9vdXRzdGFuZGluZ01ldGhvZEJsb2Nrcykud2FpdCAmJlxuICAgICAgIW9sZE91dHN0YW5kaW5nTWV0aG9kQmxvY2tzWzBdLndhaXRcbiAgICApIHtcbiAgICAgIG9sZE91dHN0YW5kaW5nTWV0aG9kQmxvY2tzWzBdLm1ldGhvZHMuZm9yRWFjaCgobSkgPT4ge1xuICAgICAgICBsYXN0KHNlbGYuX291dHN0YW5kaW5nTWV0aG9kQmxvY2tzKS5tZXRob2RzLnB1c2gobSk7XG5cbiAgICAgICAgLy8gSWYgdGhpcyBcImxhc3QgYmxvY2tcIiBpcyBhbHNvIHRoZSBmaXJzdCBibG9jaywgc2VuZCB0aGUgbWVzc2FnZS5cbiAgICAgICAgaWYgKHNlbGYuX291dHN0YW5kaW5nTWV0aG9kQmxvY2tzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgIG0uc2VuZE1lc3NhZ2UoKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIG9sZE91dHN0YW5kaW5nTWV0aG9kQmxvY2tzLnNoaWZ0KCk7XG4gICAgfVxuXG4gICAgLy8gTm93IGFkZCB0aGUgcmVzdCBvZiB0aGUgb3JpZ2luYWwgYmxvY2tzIG9uLlxuICAgIHNlbGYuX291dHN0YW5kaW5nTWV0aG9kQmxvY2tzLnB1c2goLi4ub2xkT3V0c3RhbmRpbmdNZXRob2RCbG9ja3MpO1xuICB9XG5cbiAgX2NhbGxPblJlY29ubmVjdEFuZFNlbmRBcHByb3ByaWF0ZU91dHN0YW5kaW5nTWV0aG9kcygpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBjb25zdCBvbGRPdXRzdGFuZGluZ01ldGhvZEJsb2NrcyA9IHNlbGYuX291dHN0YW5kaW5nTWV0aG9kQmxvY2tzO1xuICAgIHNlbGYuX291dHN0YW5kaW5nTWV0aG9kQmxvY2tzID0gW107XG5cbiAgICBzZWxmLm9uUmVjb25uZWN0ICYmIHNlbGYub25SZWNvbm5lY3QoKTtcbiAgICBERFAuX3JlY29ubmVjdEhvb2suZWFjaCgoY2FsbGJhY2spID0+IHtcbiAgICAgIGNhbGxiYWNrKHNlbGYpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSk7XG5cbiAgICBzZWxmLl9zZW5kT3V0c3RhbmRpbmdNZXRob2RCbG9ja3NNZXNzYWdlcyhvbGRPdXRzdGFuZGluZ01ldGhvZEJsb2Nrcyk7XG4gIH1cblxuICAvLyBXZSBjYW4gYWNjZXB0IGEgaG90IGNvZGUgcHVzaCBpZiB0aGVyZSBhcmUgbm8gbWV0aG9kcyBpbiBmbGlnaHQuXG4gIF9yZWFkeVRvTWlncmF0ZSgpIHtcbiAgICByZXR1cm4gaXNFbXB0eSh0aGlzLl9tZXRob2RJbnZva2Vycyk7XG4gIH1cblxuICAvLyBJZiB3ZSB3ZXJlIGJsb2NraW5nIGEgbWlncmF0aW9uLCBzZWUgaWYgaXQncyBub3cgcG9zc2libGUgdG8gY29udGludWUuXG4gIC8vIENhbGwgd2hlbmV2ZXIgdGhlIHNldCBvZiBvdXRzdGFuZGluZy9ibG9ja2VkIG1ldGhvZHMgc2hyaW5rcy5cbiAgX21heWJlTWlncmF0ZSgpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBpZiAoc2VsZi5fcmV0cnlNaWdyYXRlICYmIHNlbGYuX3JlYWR5VG9NaWdyYXRlKCkpIHtcbiAgICAgIHNlbGYuX3JldHJ5TWlncmF0ZSgpO1xuICAgICAgc2VsZi5fcmV0cnlNaWdyYXRlID0gbnVsbDtcbiAgICB9XG4gIH1cbn1cbiIsImltcG9ydCB7IEREUENvbW1vbiB9IGZyb20gJ21ldGVvci9kZHAtY29tbW9uJztcbmltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuaW1wb3J0IHsgRERQIH0gZnJvbSAnLi9uYW1lc3BhY2UuanMnO1xuaW1wb3J0IHsgRUpTT04gfSBmcm9tICdtZXRlb3IvZWpzb24nO1xuaW1wb3J0IHsgaXNFbXB0eSwgaGFzT3duIH0gZnJvbSBcIm1ldGVvci9kZHAtY29tbW9uL3V0aWxzXCI7XG5cbmV4cG9ydCBjbGFzcyBNZXNzYWdlUHJvY2Vzc29ycyB7XG4gIGNvbnN0cnVjdG9yKGNvbm5lY3Rpb24pIHtcbiAgICB0aGlzLl9jb25uZWN0aW9uID0gY29ubmVjdGlvbjtcbiAgfVxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBQcm9jZXNzIHRoZSBjb25uZWN0aW9uIG1lc3NhZ2UgYW5kIHNldCB1cCB0aGUgc2Vzc2lvblxuICAgKiBAcGFyYW0ge09iamVjdH0gbXNnIFRoZSBjb25uZWN0aW9uIG1lc3NhZ2VcbiAgICovXG4gIGFzeW5jIF9saXZlZGF0YV9jb25uZWN0ZWQobXNnKSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXMuX2Nvbm5lY3Rpb247XG5cbiAgICBpZiAoc2VsZi5fdmVyc2lvbiAhPT0gJ3ByZTEnICYmIHNlbGYuX2hlYXJ0YmVhdEludGVydmFsICE9PSAwKSB7XG4gICAgICBzZWxmLl9oZWFydGJlYXQgPSBuZXcgRERQQ29tbW9uLkhlYXJ0YmVhdCh7XG4gICAgICAgIGhlYXJ0YmVhdEludGVydmFsOiBzZWxmLl9oZWFydGJlYXRJbnRlcnZhbCxcbiAgICAgICAgaGVhcnRiZWF0VGltZW91dDogc2VsZi5faGVhcnRiZWF0VGltZW91dCxcbiAgICAgICAgb25UaW1lb3V0KCkge1xuICAgICAgICAgIHNlbGYuX2xvc3RDb25uZWN0aW9uKFxuICAgICAgICAgICAgbmV3IEREUC5Db25uZWN0aW9uRXJyb3IoJ0REUCBoZWFydGJlYXQgdGltZWQgb3V0JylcbiAgICAgICAgICApO1xuICAgICAgICB9LFxuICAgICAgICBzZW5kUGluZygpIHtcbiAgICAgICAgICBzZWxmLl9zZW5kKHsgbXNnOiAncGluZycgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgc2VsZi5faGVhcnRiZWF0LnN0YXJ0KCk7XG4gICAgfVxuXG4gICAgLy8gSWYgdGhpcyBpcyBhIHJlY29ubmVjdCwgd2UnbGwgaGF2ZSB0byByZXNldCBhbGwgc3RvcmVzLlxuICAgIGlmIChzZWxmLl9sYXN0U2Vzc2lvbklkKSBzZWxmLl9yZXNldFN0b3JlcyA9IHRydWU7XG5cbiAgICBsZXQgcmVjb25uZWN0ZWRUb1ByZXZpb3VzU2Vzc2lvbjtcbiAgICBpZiAodHlwZW9mIG1zZy5zZXNzaW9uID09PSAnc3RyaW5nJykge1xuICAgICAgcmVjb25uZWN0ZWRUb1ByZXZpb3VzU2Vzc2lvbiA9IHNlbGYuX2xhc3RTZXNzaW9uSWQgPT09IG1zZy5zZXNzaW9uO1xuICAgICAgc2VsZi5fbGFzdFNlc3Npb25JZCA9IG1zZy5zZXNzaW9uO1xuICAgIH1cblxuICAgIGlmIChyZWNvbm5lY3RlZFRvUHJldmlvdXNTZXNzaW9uKSB7XG4gICAgICAvLyBTdWNjZXNzZnVsIHJlY29ubmVjdGlvbiAtLSBwaWNrIHVwIHdoZXJlIHdlIGxlZnQgb2ZmLlxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFNlcnZlciBkb2Vzbid0IGhhdmUgb3VyIGRhdGEgYW55bW9yZS4gUmUtc3luYyBhIG5ldyBzZXNzaW9uLlxuXG4gICAgLy8gRm9yZ2V0IGFib3V0IG1lc3NhZ2VzIHdlIHdlcmUgYnVmZmVyaW5nIGZvciB1bmtub3duIGNvbGxlY3Rpb25zLiBUaGV5J2xsXG4gICAgLy8gYmUgcmVzZW50IGlmIHN0aWxsIHJlbGV2YW50LlxuICAgIHNlbGYuX3VwZGF0ZXNGb3JVbmtub3duU3RvcmVzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblxuICAgIGlmIChzZWxmLl9yZXNldFN0b3Jlcykge1xuICAgICAgLy8gRm9yZ2V0IGFib3V0IHRoZSBlZmZlY3RzIG9mIHN0dWJzLiBXZSdsbCBiZSByZXNldHRpbmcgYWxsIGNvbGxlY3Rpb25zXG4gICAgICAvLyBhbnl3YXkuXG4gICAgICBzZWxmLl9kb2N1bWVudHNXcml0dGVuQnlTdHViID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICAgIHNlbGYuX3NlcnZlckRvY3VtZW50cyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG4gICAgfVxuXG4gICAgLy8gQ2xlYXIgX2FmdGVyVXBkYXRlQ2FsbGJhY2tzLlxuICAgIHNlbGYuX2FmdGVyVXBkYXRlQ2FsbGJhY2tzID0gW107XG5cbiAgICAvLyBNYXJrIGFsbCBuYW1lZCBzdWJzY3JpcHRpb25zIHdoaWNoIGFyZSByZWFkeSBhcyBuZWVkaW5nIHRvIGJlIHJldml2ZWQuXG4gICAgc2VsZi5fc3Vic0JlaW5nUmV2aXZlZCA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG4gICAgT2JqZWN0LmVudHJpZXMoc2VsZi5fc3Vic2NyaXB0aW9ucykuZm9yRWFjaCgoW2lkLCBzdWJdKSA9PiB7XG4gICAgICBpZiAoc3ViLnJlYWR5KSB7XG4gICAgICAgIHNlbGYuX3N1YnNCZWluZ1Jldml2ZWRbaWRdID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEFycmFuZ2UgZm9yIFwiaGFsZi1maW5pc2hlZFwiIG1ldGhvZHMgdG8gaGF2ZSB0aGVpciBjYWxsYmFja3MgcnVuLCBhbmRcbiAgICAvLyB0cmFjayBtZXRob2RzIHRoYXQgd2VyZSBzZW50IG9uIHRoaXMgY29ubmVjdGlvbiBzbyB0aGF0IHdlIGRvbid0XG4gICAgLy8gcXVpZXNjZSB1bnRpbCB0aGV5IGFyZSBhbGwgZG9uZS5cbiAgICAvL1xuICAgIC8vIFN0YXJ0IGJ5IGNsZWFyaW5nIF9tZXRob2RzQmxvY2tpbmdRdWllc2NlbmNlOiBtZXRob2RzIHNlbnQgYmVmb3JlXG4gICAgLy8gcmVjb25uZWN0IGRvbid0IG1hdHRlciwgYW5kIGFueSBcIndhaXRcIiBtZXRob2RzIHNlbnQgb24gdGhlIG5ldyBjb25uZWN0aW9uXG4gICAgLy8gdGhhdCB3ZSBkcm9wIGhlcmUgd2lsbCBiZSByZXN0b3JlZCBieSB0aGUgbG9vcCBiZWxvdy5cbiAgICBzZWxmLl9tZXRob2RzQmxvY2tpbmdRdWllc2NlbmNlID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICBpZiAoc2VsZi5fcmVzZXRTdG9yZXMpIHtcbiAgICAgIGNvbnN0IGludm9rZXJzID0gc2VsZi5fbWV0aG9kSW52b2tlcnM7XG4gICAgICBPYmplY3Qua2V5cyhpbnZva2VycykuZm9yRWFjaChpZCA9PiB7XG4gICAgICAgIGNvbnN0IGludm9rZXIgPSBpbnZva2Vyc1tpZF07XG4gICAgICAgIGlmIChpbnZva2VyLmdvdFJlc3VsdCgpKSB7XG4gICAgICAgICAgLy8gVGhpcyBtZXRob2QgYWxyZWFkeSBnb3QgaXRzIHJlc3VsdCwgYnV0IGl0IGRpZG4ndCBjYWxsIGl0cyBjYWxsYmFja1xuICAgICAgICAgIC8vIGJlY2F1c2UgaXRzIGRhdGEgZGlkbid0IGJlY29tZSB2aXNpYmxlLiBXZSBkaWQgbm90IHJlc2VuZCB0aGVcbiAgICAgICAgICAvLyBtZXRob2QgUlBDLiBXZSdsbCBjYWxsIGl0cyBjYWxsYmFjayB3aGVuIHdlIGdldCBhIGZ1bGwgcXVpZXNjZSxcbiAgICAgICAgICAvLyBzaW5jZSB0aGF0J3MgYXMgY2xvc2UgYXMgd2UnbGwgZ2V0IHRvIFwiZGF0YSBtdXN0IGJlIHZpc2libGVcIi5cbiAgICAgICAgICBzZWxmLl9hZnRlclVwZGF0ZUNhbGxiYWNrcy5wdXNoKFxuICAgICAgICAgICAgKC4uLmFyZ3MpID0+IGludm9rZXIuZGF0YVZpc2libGUoLi4uYXJncylcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2UgaWYgKGludm9rZXIuc2VudE1lc3NhZ2UpIHtcbiAgICAgICAgICAvLyBUaGlzIG1ldGhvZCBoYXMgYmVlbiBzZW50IG9uIHRoaXMgY29ubmVjdGlvbiAobWF5YmUgYXMgYSByZXNlbmRcbiAgICAgICAgICAvLyBmcm9tIHRoZSBsYXN0IGNvbm5lY3Rpb24sIG1heWJlIGZyb20gb25SZWNvbm5lY3QsIG1heWJlIGp1c3QgdmVyeVxuICAgICAgICAgIC8vIHF1aWNrbHkgYmVmb3JlIHByb2Nlc3NpbmcgdGhlIGNvbm5lY3RlZCBtZXNzYWdlKS5cbiAgICAgICAgICAvL1xuICAgICAgICAgIC8vIFdlIGRvbid0IG5lZWQgdG8gZG8gYW55dGhpbmcgc3BlY2lhbCB0byBlbnN1cmUgaXRzIGNhbGxiYWNrcyBnZXRcbiAgICAgICAgICAvLyBjYWxsZWQsIGJ1dCB3ZSdsbCBjb3VudCBpdCBhcyBhIG1ldGhvZCB3aGljaCBpcyBwcmV2ZW50aW5nXG4gICAgICAgICAgLy8gcmVjb25uZWN0IHF1aWVzY2VuY2UuIChlZywgaXQgbWlnaHQgYmUgYSBsb2dpbiBtZXRob2QgdGhhdCB3YXMgcnVuXG4gICAgICAgICAgLy8gZnJvbSBvblJlY29ubmVjdCwgYW5kIHdlIGRvbid0IHdhbnQgdG8gc2VlIGZsaWNrZXIgYnkgc2VlaW5nIGFcbiAgICAgICAgICAvLyBsb2dnZWQtb3V0IHN0YXRlLilcbiAgICAgICAgICBzZWxmLl9tZXRob2RzQmxvY2tpbmdRdWllc2NlbmNlW2ludm9rZXIubWV0aG9kSWRdID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgc2VsZi5fbWVzc2FnZXNCdWZmZXJlZFVudGlsUXVpZXNjZW5jZSA9IFtdO1xuXG4gICAgLy8gSWYgd2UncmUgbm90IHdhaXRpbmcgb24gYW55IG1ldGhvZHMgb3Igc3Vicywgd2UgY2FuIHJlc2V0IHRoZSBzdG9yZXMgYW5kXG4gICAgLy8gY2FsbCB0aGUgY2FsbGJhY2tzIGltbWVkaWF0ZWx5LlxuICAgIGlmICghc2VsZi5fd2FpdGluZ0ZvclF1aWVzY2VuY2UoKSkge1xuICAgICAgaWYgKHNlbGYuX3Jlc2V0U3RvcmVzKSB7XG4gICAgICAgIGZvciAoY29uc3Qgc3RvcmUgb2YgT2JqZWN0LnZhbHVlcyhzZWxmLl9zdG9yZXMpKSB7XG4gICAgICAgICAgYXdhaXQgc3RvcmUuYmVnaW5VcGRhdGUoMCwgdHJ1ZSk7XG4gICAgICAgICAgYXdhaXQgc3RvcmUuZW5kVXBkYXRlKCk7XG4gICAgICAgIH1cbiAgICAgICAgc2VsZi5fcmVzZXRTdG9yZXMgPSBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHNlbGYuX3J1bkFmdGVyVXBkYXRlQ2FsbGJhY2tzKCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IFByb2Nlc3MgdmFyaW91cyBkYXRhIG1lc3NhZ2VzIGZyb20gdGhlIHNlcnZlclxuICAgKiBAcGFyYW0ge09iamVjdH0gbXNnIFRoZSBkYXRhIG1lc3NhZ2VcbiAgICovXG4gIGFzeW5jIF9saXZlZGF0YV9kYXRhKG1zZykge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzLl9jb25uZWN0aW9uO1xuXG4gICAgaWYgKHNlbGYuX3dhaXRpbmdGb3JRdWllc2NlbmNlKCkpIHtcbiAgICAgIHNlbGYuX21lc3NhZ2VzQnVmZmVyZWRVbnRpbFF1aWVzY2VuY2UucHVzaChtc2cpO1xuXG4gICAgICBpZiAobXNnLm1zZyA9PT0gJ25vc3ViJykge1xuICAgICAgICBkZWxldGUgc2VsZi5fc3Vic0JlaW5nUmV2aXZlZFttc2cuaWRdO1xuICAgICAgfVxuXG4gICAgICBpZiAobXNnLnN1YnMpIHtcbiAgICAgICAgbXNnLnN1YnMuZm9yRWFjaChzdWJJZCA9PiB7XG4gICAgICAgICAgZGVsZXRlIHNlbGYuX3N1YnNCZWluZ1Jldml2ZWRbc3ViSWRdO1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1zZy5tZXRob2RzKSB7XG4gICAgICAgIG1zZy5tZXRob2RzLmZvckVhY2gobWV0aG9kSWQgPT4ge1xuICAgICAgICAgIGRlbGV0ZSBzZWxmLl9tZXRob2RzQmxvY2tpbmdRdWllc2NlbmNlW21ldGhvZElkXTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChzZWxmLl93YWl0aW5nRm9yUXVpZXNjZW5jZSgpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gTm8gbWV0aG9kcyBvciBzdWJzIGFyZSBibG9ja2luZyBxdWllc2NlbmNlIVxuICAgICAgLy8gV2UnbGwgbm93IHByb2Nlc3MgYW5kIGFsbCBvZiBvdXIgYnVmZmVyZWQgbWVzc2FnZXMsIHJlc2V0IGFsbCBzdG9yZXMsXG4gICAgICAvLyBhbmQgYXBwbHkgdGhlbSBhbGwgYXQgb25jZS5cbiAgICAgIGNvbnN0IGJ1ZmZlcmVkTWVzc2FnZXMgPSBzZWxmLl9tZXNzYWdlc0J1ZmZlcmVkVW50aWxRdWllc2NlbmNlO1xuICAgICAgZm9yIChjb25zdCBidWZmZXJlZE1lc3NhZ2Ugb2YgT2JqZWN0LnZhbHVlcyhidWZmZXJlZE1lc3NhZ2VzKSkge1xuICAgICAgICBhd2FpdCB0aGlzLl9wcm9jZXNzT25lRGF0YU1lc3NhZ2UoXG4gICAgICAgICAgYnVmZmVyZWRNZXNzYWdlLFxuICAgICAgICAgIHNlbGYuX2J1ZmZlcmVkV3JpdGVzXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBzZWxmLl9tZXNzYWdlc0J1ZmZlcmVkVW50aWxRdWllc2NlbmNlID0gW107XG4gICAgfSBlbHNlIHtcbiAgICAgIGF3YWl0IHRoaXMuX3Byb2Nlc3NPbmVEYXRhTWVzc2FnZShtc2csIHNlbGYuX2J1ZmZlcmVkV3JpdGVzKTtcbiAgICB9XG5cbiAgICAvLyBJbW1lZGlhdGVseSBmbHVzaCB3cml0ZXMgd2hlbjpcbiAgICAvLyAgMS4gQnVmZmVyaW5nIGlzIGRpc2FibGVkLiBPcjtcbiAgICAvLyAgMi4gYW55IG5vbi0oYWRkZWQvY2hhbmdlZC9yZW1vdmVkKSBtZXNzYWdlIGFycml2ZXMuXG4gICAgY29uc3Qgc3RhbmRhcmRXcml0ZSA9XG4gICAgICBtc2cubXNnID09PSBcImFkZGVkXCIgfHxcbiAgICAgIG1zZy5tc2cgPT09IFwiY2hhbmdlZFwiIHx8XG4gICAgICBtc2cubXNnID09PSBcInJlbW92ZWRcIjtcblxuICAgIGlmIChzZWxmLl9idWZmZXJlZFdyaXRlc0ludGVydmFsID09PSAwIHx8ICFzdGFuZGFyZFdyaXRlKSB7XG4gICAgICBhd2FpdCBzZWxmLl9mbHVzaEJ1ZmZlcmVkV3JpdGVzKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHNlbGYuX2J1ZmZlcmVkV3JpdGVzRmx1c2hBdCA9PT0gbnVsbCkge1xuICAgICAgc2VsZi5fYnVmZmVyZWRXcml0ZXNGbHVzaEF0ID1cbiAgICAgICAgbmV3IERhdGUoKS52YWx1ZU9mKCkgKyBzZWxmLl9idWZmZXJlZFdyaXRlc01heEFnZTtcbiAgICB9IGVsc2UgaWYgKHNlbGYuX2J1ZmZlcmVkV3JpdGVzRmx1c2hBdCA8IG5ldyBEYXRlKCkudmFsdWVPZigpKSB7XG4gICAgICBhd2FpdCBzZWxmLl9mbHVzaEJ1ZmZlcmVkV3JpdGVzKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHNlbGYuX2J1ZmZlcmVkV3JpdGVzRmx1c2hIYW5kbGUpIHtcbiAgICAgIGNsZWFyVGltZW91dChzZWxmLl9idWZmZXJlZFdyaXRlc0ZsdXNoSGFuZGxlKTtcbiAgICB9XG4gICAgc2VsZi5fYnVmZmVyZWRXcml0ZXNGbHVzaEhhbmRsZSA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgc2VsZi5fbGl2ZURhdGFXcml0ZXNQcm9taXNlID0gc2VsZi5fZmx1c2hCdWZmZXJlZFdyaXRlcygpO1xuICAgICAgaWYgKE1ldGVvci5faXNQcm9taXNlKHNlbGYuX2xpdmVEYXRhV3JpdGVzUHJvbWlzZSkpIHtcbiAgICAgICAgc2VsZi5fbGl2ZURhdGFXcml0ZXNQcm9taXNlLmZpbmFsbHkoXG4gICAgICAgICAgKCkgPT4gKHNlbGYuX2xpdmVEYXRhV3JpdGVzUHJvbWlzZSA9IHVuZGVmaW5lZClcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9LCBzZWxmLl9idWZmZXJlZFdyaXRlc0ludGVydmFsKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBQcm9jZXNzIGluZGl2aWR1YWwgZGF0YSBtZXNzYWdlcyBieSB0eXBlXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBhc3luYyBfcHJvY2Vzc09uZURhdGFNZXNzYWdlKG1zZywgdXBkYXRlcykge1xuICAgIGNvbnN0IG1lc3NhZ2VUeXBlID0gbXNnLm1zZztcblxuICAgIHN3aXRjaCAobWVzc2FnZVR5cGUpIHtcbiAgICAgIGNhc2UgJ2FkZGVkJzpcbiAgICAgICAgYXdhaXQgdGhpcy5fY29ubmVjdGlvbi5fcHJvY2Vzc19hZGRlZChtc2csIHVwZGF0ZXMpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2NoYW5nZWQnOlxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLl9wcm9jZXNzX2NoYW5nZWQobXNnLCB1cGRhdGVzKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdyZW1vdmVkJzpcbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5fcHJvY2Vzc19yZW1vdmVkKG1zZywgdXBkYXRlcyk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAncmVhZHknOlxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLl9wcm9jZXNzX3JlYWR5KG1zZywgdXBkYXRlcyk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAndXBkYXRlZCc6XG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uX3Byb2Nlc3NfdXBkYXRlZChtc2csIHVwZGF0ZXMpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ25vc3ViJzpcbiAgICAgICAgLy8gaWdub3JlIHRoaXNcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBNZXRlb3IuX2RlYnVnKCdkaXNjYXJkaW5nIHVua25vd24gbGl2ZWRhdGEgZGF0YSBtZXNzYWdlIHR5cGUnLCBtc2cpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBIYW5kbGUgbWV0aG9kIHJlc3VsdHMgYXJyaXZpbmcgZnJvbSB0aGUgc2VydmVyXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBtc2cgVGhlIG1ldGhvZCByZXN1bHQgbWVzc2FnZVxuICAgKi9cbiAgYXN5bmMgX2xpdmVkYXRhX3Jlc3VsdChtc2cpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcy5fY29ubmVjdGlvbjtcblxuICAgIC8vIExldHMgbWFrZSBzdXJlIHRoZXJlIGFyZSBubyBidWZmZXJlZCB3cml0ZXMgYmVmb3JlIHJldHVybmluZyByZXN1bHQuXG4gICAgaWYgKCFpc0VtcHR5KHNlbGYuX2J1ZmZlcmVkV3JpdGVzKSkge1xuICAgICAgYXdhaXQgc2VsZi5fZmx1c2hCdWZmZXJlZFdyaXRlcygpO1xuICAgIH1cblxuICAgIC8vIGZpbmQgdGhlIG91dHN0YW5kaW5nIHJlcXVlc3RcbiAgICAvLyBzaG91bGQgYmUgTygxKSBpbiBuZWFybHkgYWxsIHJlYWxpc3RpYyB1c2UgY2FzZXNcbiAgICBpZiAoaXNFbXB0eShzZWxmLl9vdXRzdGFuZGluZ01ldGhvZEJsb2NrcykpIHtcbiAgICAgIE1ldGVvci5fZGVidWcoJ1JlY2VpdmVkIG1ldGhvZCByZXN1bHQgYnV0IG5vIG1ldGhvZHMgb3V0c3RhbmRpbmcnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY3VycmVudE1ldGhvZEJsb2NrID0gc2VsZi5fb3V0c3RhbmRpbmdNZXRob2RCbG9ja3NbMF0ubWV0aG9kcztcbiAgICBsZXQgaTtcbiAgICBjb25zdCBtID0gY3VycmVudE1ldGhvZEJsb2NrLmZpbmQoKG1ldGhvZCwgaWR4KSA9PiB7XG4gICAgICBjb25zdCBmb3VuZCA9IG1ldGhvZC5tZXRob2RJZCA9PT0gbXNnLmlkO1xuICAgICAgaWYgKGZvdW5kKSBpID0gaWR4O1xuICAgICAgcmV0dXJuIGZvdW5kO1xuICAgIH0pO1xuICAgIGlmICghbSkge1xuICAgICAgTWV0ZW9yLl9kZWJ1ZyhcIkNhbid0IG1hdGNoIG1ldGhvZCByZXNwb25zZSB0byBvcmlnaW5hbCBtZXRob2QgY2FsbFwiLCBtc2cpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFJlbW92ZSBmcm9tIGN1cnJlbnQgbWV0aG9kIGJsb2NrLiBUaGlzIG1heSBsZWF2ZSB0aGUgYmxvY2sgZW1wdHksIGJ1dCB3ZVxuICAgIC8vIGRvbid0IG1vdmUgb24gdG8gdGhlIG5leHQgYmxvY2sgdW50aWwgdGhlIGNhbGxiYWNrIGhhcyBiZWVuIGRlbGl2ZXJlZCwgaW5cbiAgICAvLyBfb3V0c3RhbmRpbmdNZXRob2RGaW5pc2hlZC5cbiAgICBjdXJyZW50TWV0aG9kQmxvY2suc3BsaWNlKGksIDEpO1xuXG4gICAgaWYgKGhhc093bi5jYWxsKG1zZywgJ2Vycm9yJykpIHtcbiAgICAgIG0ucmVjZWl2ZVJlc3VsdChcbiAgICAgICAgbmV3IE1ldGVvci5FcnJvcihtc2cuZXJyb3IuZXJyb3IsIG1zZy5lcnJvci5yZWFzb24sIG1zZy5lcnJvci5kZXRhaWxzKVxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gbXNnLnJlc3VsdCBtYXkgYmUgdW5kZWZpbmVkIGlmIHRoZSBtZXRob2QgZGlkbid0IHJldHVybiBhIHZhbHVlXG4gICAgICBtLnJlY2VpdmVSZXN1bHQodW5kZWZpbmVkLCBtc2cucmVzdWx0KTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQHN1bW1hcnkgSGFuZGxlIFwibm9zdWJcIiBtZXNzYWdlcyBhcnJpdmluZyBmcm9tIHRoZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtPYmplY3R9IG1zZyBUaGUgbm9zdWIgbWVzc2FnZVxuICAgKi9cbiAgYXN5bmMgX2xpdmVkYXRhX25vc3ViKG1zZykge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzLl9jb25uZWN0aW9uO1xuXG4gICAgLy8gRmlyc3QgcGFzcyBpdCB0aHJvdWdoIF9saXZlZGF0YV9kYXRhLCB3aGljaCBvbmx5IHVzZXMgaXQgdG8gaGVscCBnZXRcbiAgICAvLyB0b3dhcmRzIHF1aWVzY2VuY2UuXG4gICAgYXdhaXQgdGhpcy5fbGl2ZWRhdGFfZGF0YShtc2cpO1xuXG4gICAgLy8gRG8gdGhlIHJlc3Qgb2Ygb3VyIHByb2Nlc3NpbmcgaW1tZWRpYXRlbHksIHdpdGggbm9cbiAgICAvLyBidWZmZXJpbmctdW50aWwtcXVpZXNjZW5jZS5cblxuICAgIC8vIHdlIHdlcmVuJ3Qgc3ViYmVkIGFueXdheSwgb3Igd2UgaW5pdGlhdGVkIHRoZSB1bnN1Yi5cbiAgICBpZiAoIWhhc093bi5jYWxsKHNlbGYuX3N1YnNjcmlwdGlvbnMsIG1zZy5pZCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBYWFggQ09NUEFUIFdJVEggMS4wLjMuMSAjZXJyb3JDYWxsYmFja1xuICAgIGNvbnN0IGVycm9yQ2FsbGJhY2sgPSBzZWxmLl9zdWJzY3JpcHRpb25zW21zZy5pZF0uZXJyb3JDYWxsYmFjaztcbiAgICBjb25zdCBzdG9wQ2FsbGJhY2sgPSBzZWxmLl9zdWJzY3JpcHRpb25zW21zZy5pZF0uc3RvcENhbGxiYWNrO1xuXG4gICAgc2VsZi5fc3Vic2NyaXB0aW9uc1ttc2cuaWRdLnJlbW92ZSgpO1xuXG4gICAgY29uc3QgbWV0ZW9yRXJyb3JGcm9tTXNnID0gbXNnQXJnID0+IHtcbiAgICAgIHJldHVybiAoXG4gICAgICAgIG1zZ0FyZyAmJlxuICAgICAgICBtc2dBcmcuZXJyb3IgJiZcbiAgICAgICAgbmV3IE1ldGVvci5FcnJvcihcbiAgICAgICAgICBtc2dBcmcuZXJyb3IuZXJyb3IsXG4gICAgICAgICAgbXNnQXJnLmVycm9yLnJlYXNvbixcbiAgICAgICAgICBtc2dBcmcuZXJyb3IuZGV0YWlsc1xuICAgICAgICApXG4gICAgICApO1xuICAgIH07XG5cbiAgICAvLyBYWFggQ09NUEFUIFdJVEggMS4wLjMuMSAjZXJyb3JDYWxsYmFja1xuICAgIGlmIChlcnJvckNhbGxiYWNrICYmIG1zZy5lcnJvcikge1xuICAgICAgZXJyb3JDYWxsYmFjayhtZXRlb3JFcnJvckZyb21Nc2cobXNnKSk7XG4gICAgfVxuXG4gICAgaWYgKHN0b3BDYWxsYmFjaykge1xuICAgICAgc3RvcENhbGxiYWNrKG1ldGVvckVycm9yRnJvbU1zZyhtc2cpKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQHN1bW1hcnkgSGFuZGxlIGVycm9ycyBmcm9tIHRoZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtPYmplY3R9IG1zZyBUaGUgZXJyb3IgbWVzc2FnZVxuICAgKi9cbiAgX2xpdmVkYXRhX2Vycm9yKG1zZykge1xuICAgIE1ldGVvci5fZGVidWcoJ1JlY2VpdmVkIGVycm9yIGZyb20gc2VydmVyOiAnLCBtc2cucmVhc29uKTtcbiAgICBpZiAobXNnLm9mZmVuZGluZ01lc3NhZ2UpIE1ldGVvci5fZGVidWcoJ0ZvcjogJywgbXNnLm9mZmVuZGluZ01lc3NhZ2UpO1xuICB9XG5cbiAgLy8gRG9jdW1lbnQgY2hhbmdlIG1lc3NhZ2UgcHJvY2Vzc29ycyB3aWxsIGJlIGRlZmluZWQgaW4gYSBzZXBhcmF0ZSBjbGFzc1xufSIsIi8vIEEgTWV0aG9kSW52b2tlciBtYW5hZ2VzIHNlbmRpbmcgYSBtZXRob2QgdG8gdGhlIHNlcnZlciBhbmQgY2FsbGluZyB0aGUgdXNlcidzXG4vLyBjYWxsYmFja3MuIE9uIGNvbnN0cnVjdGlvbiwgaXQgcmVnaXN0ZXJzIGl0c2VsZiBpbiB0aGUgY29ubmVjdGlvbidzXG4vLyBfbWV0aG9kSW52b2tlcnMgbWFwOyBpdCByZW1vdmVzIGl0c2VsZiBvbmNlIHRoZSBtZXRob2QgaXMgZnVsbHkgZmluaXNoZWQgYW5kXG4vLyB0aGUgY2FsbGJhY2sgaXMgaW52b2tlZC4gVGhpcyBvY2N1cnMgd2hlbiBpdCBoYXMgYm90aCByZWNlaXZlZCBhIHJlc3VsdCxcbi8vIGFuZCB0aGUgZGF0YSB3cml0dGVuIGJ5IGl0IGlzIGZ1bGx5IHZpc2libGUuXG5leHBvcnQgY2xhc3MgTWV0aG9kSW52b2tlciB7XG4gIGNvbnN0cnVjdG9yKG9wdGlvbnMpIHtcbiAgICAvLyBQdWJsaWMgKHdpdGhpbiB0aGlzIGZpbGUpIGZpZWxkcy5cbiAgICB0aGlzLm1ldGhvZElkID0gb3B0aW9ucy5tZXRob2RJZDtcbiAgICB0aGlzLnNlbnRNZXNzYWdlID0gZmFsc2U7XG5cbiAgICB0aGlzLl9jYWxsYmFjayA9IG9wdGlvbnMuY2FsbGJhY2s7XG4gICAgdGhpcy5fY29ubmVjdGlvbiA9IG9wdGlvbnMuY29ubmVjdGlvbjtcbiAgICB0aGlzLl9tZXNzYWdlID0gb3B0aW9ucy5tZXNzYWdlO1xuICAgIHRoaXMuX29uUmVzdWx0UmVjZWl2ZWQgPSBvcHRpb25zLm9uUmVzdWx0UmVjZWl2ZWQgfHwgKCgpID0+IHt9KTtcbiAgICB0aGlzLl93YWl0ID0gb3B0aW9ucy53YWl0O1xuICAgIHRoaXMubm9SZXRyeSA9IG9wdGlvbnMubm9SZXRyeTtcbiAgICB0aGlzLl9tZXRob2RSZXN1bHQgPSBudWxsO1xuICAgIHRoaXMuX2RhdGFWaXNpYmxlID0gZmFsc2U7XG5cbiAgICAvLyBSZWdpc3RlciB3aXRoIHRoZSBjb25uZWN0aW9uLlxuICAgIHRoaXMuX2Nvbm5lY3Rpb24uX21ldGhvZEludm9rZXJzW3RoaXMubWV0aG9kSWRdID0gdGhpcztcbiAgfVxuICAvLyBTZW5kcyB0aGUgbWV0aG9kIG1lc3NhZ2UgdG8gdGhlIHNlcnZlci4gTWF5IGJlIGNhbGxlZCBhZGRpdGlvbmFsIHRpbWVzIGlmXG4gIC8vIHdlIGxvc2UgdGhlIGNvbm5lY3Rpb24gYW5kIHJlY29ubmVjdCBiZWZvcmUgcmVjZWl2aW5nIGEgcmVzdWx0LlxuICBzZW5kTWVzc2FnZSgpIHtcbiAgICAvLyBUaGlzIGZ1bmN0aW9uIGlzIGNhbGxlZCBiZWZvcmUgc2VuZGluZyBhIG1ldGhvZCAoaW5jbHVkaW5nIHJlc2VuZGluZyBvblxuICAgIC8vIHJlY29ubmVjdCkuIFdlIHNob3VsZCBvbmx5IChyZSlzZW5kIG1ldGhvZHMgd2hlcmUgd2UgZG9uJ3QgYWxyZWFkeSBoYXZlIGFcbiAgICAvLyByZXN1bHQhXG4gICAgaWYgKHRoaXMuZ290UmVzdWx0KCkpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3NlbmRpbmdNZXRob2QgaXMgY2FsbGVkIG9uIG1ldGhvZCB3aXRoIHJlc3VsdCcpO1xuXG4gICAgLy8gSWYgd2UncmUgcmUtc2VuZGluZyBpdCwgaXQgZG9lc24ndCBtYXR0ZXIgaWYgZGF0YSB3YXMgd3JpdHRlbiB0aGUgZmlyc3RcbiAgICAvLyB0aW1lLlxuICAgIHRoaXMuX2RhdGFWaXNpYmxlID0gZmFsc2U7XG4gICAgdGhpcy5zZW50TWVzc2FnZSA9IHRydWU7XG5cbiAgICAvLyBJZiB0aGlzIGlzIGEgd2FpdCBtZXRob2QsIG1ha2UgYWxsIGRhdGEgbWVzc2FnZXMgYmUgYnVmZmVyZWQgdW50aWwgaXQgaXNcbiAgICAvLyBkb25lLlxuICAgIGlmICh0aGlzLl93YWl0KVxuICAgICAgdGhpcy5fY29ubmVjdGlvbi5fbWV0aG9kc0Jsb2NraW5nUXVpZXNjZW5jZVt0aGlzLm1ldGhvZElkXSA9IHRydWU7XG5cbiAgICAvLyBBY3R1YWxseSBzZW5kIHRoZSBtZXNzYWdlLlxuICAgIHRoaXMuX2Nvbm5lY3Rpb24uX3NlbmQodGhpcy5fbWVzc2FnZSk7XG4gIH1cbiAgLy8gSW52b2tlIHRoZSBjYWxsYmFjaywgaWYgd2UgaGF2ZSBib3RoIGEgcmVzdWx0IGFuZCBrbm93IHRoYXQgYWxsIGRhdGEgaGFzXG4gIC8vIGJlZW4gd3JpdHRlbiB0byB0aGUgbG9jYWwgY2FjaGUuXG4gIF9tYXliZUludm9rZUNhbGxiYWNrKCkge1xuICAgIGlmICh0aGlzLl9tZXRob2RSZXN1bHQgJiYgdGhpcy5fZGF0YVZpc2libGUpIHtcbiAgICAgIC8vIENhbGwgdGhlIGNhbGxiYWNrLiAoVGhpcyB3b24ndCB0aHJvdzogdGhlIGNhbGxiYWNrIHdhcyB3cmFwcGVkIHdpdGhcbiAgICAgIC8vIGJpbmRFbnZpcm9ubWVudC4pXG4gICAgICB0aGlzLl9jYWxsYmFjayh0aGlzLl9tZXRob2RSZXN1bHRbMF0sIHRoaXMuX21ldGhvZFJlc3VsdFsxXSk7XG5cbiAgICAgIC8vIEZvcmdldCBhYm91dCB0aGlzIG1ldGhvZC5cbiAgICAgIGRlbGV0ZSB0aGlzLl9jb25uZWN0aW9uLl9tZXRob2RJbnZva2Vyc1t0aGlzLm1ldGhvZElkXTtcblxuICAgICAgLy8gTGV0IHRoZSBjb25uZWN0aW9uIGtub3cgdGhhdCB0aGlzIG1ldGhvZCBpcyBmaW5pc2hlZCwgc28gaXQgY2FuIHRyeSB0b1xuICAgICAgLy8gbW92ZSBvbiB0byB0aGUgbmV4dCBibG9jayBvZiBtZXRob2RzLlxuICAgICAgdGhpcy5fY29ubmVjdGlvbi5fb3V0c3RhbmRpbmdNZXRob2RGaW5pc2hlZCgpO1xuICAgIH1cbiAgfVxuICAvLyBDYWxsIHdpdGggdGhlIHJlc3VsdCBvZiB0aGUgbWV0aG9kIGZyb20gdGhlIHNlcnZlci4gT25seSBtYXkgYmUgY2FsbGVkXG4gIC8vIG9uY2U7IG9uY2UgaXQgaXMgY2FsbGVkLCB5b3Ugc2hvdWxkIG5vdCBjYWxsIHNlbmRNZXNzYWdlIGFnYWluLlxuICAvLyBJZiB0aGUgdXNlciBwcm92aWRlZCBhbiBvblJlc3VsdFJlY2VpdmVkIGNhbGxiYWNrLCBjYWxsIGl0IGltbWVkaWF0ZWx5LlxuICAvLyBUaGVuIGludm9rZSB0aGUgbWFpbiBjYWxsYmFjayBpZiBkYXRhIGlzIGFsc28gdmlzaWJsZS5cbiAgcmVjZWl2ZVJlc3VsdChlcnIsIHJlc3VsdCkge1xuICAgIGlmICh0aGlzLmdvdFJlc3VsdCgpKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdNZXRob2RzIHNob3VsZCBvbmx5IHJlY2VpdmUgcmVzdWx0cyBvbmNlJyk7XG4gICAgdGhpcy5fbWV0aG9kUmVzdWx0ID0gW2VyciwgcmVzdWx0XTtcbiAgICB0aGlzLl9vblJlc3VsdFJlY2VpdmVkKGVyciwgcmVzdWx0KTtcbiAgICB0aGlzLl9tYXliZUludm9rZUNhbGxiYWNrKCk7XG4gIH1cbiAgLy8gQ2FsbCB0aGlzIHdoZW4gYWxsIGRhdGEgd3JpdHRlbiBieSB0aGUgbWV0aG9kIGlzIHZpc2libGUuIFRoaXMgbWVhbnMgdGhhdFxuICAvLyB0aGUgbWV0aG9kIGhhcyByZXR1cm5zIGl0cyBcImRhdGEgaXMgZG9uZVwiIG1lc3NhZ2UgKkFORCogYWxsIHNlcnZlclxuICAvLyBkb2N1bWVudHMgdGhhdCBhcmUgYnVmZmVyZWQgYXQgdGhhdCB0aW1lIGhhdmUgYmVlbiB3cml0dGVuIHRvIHRoZSBsb2NhbFxuICAvLyBjYWNoZS4gSW52b2tlcyB0aGUgbWFpbiBjYWxsYmFjayBpZiB0aGUgcmVzdWx0IGhhcyBiZWVuIHJlY2VpdmVkLlxuICBkYXRhVmlzaWJsZSgpIHtcbiAgICB0aGlzLl9kYXRhVmlzaWJsZSA9IHRydWU7XG4gICAgdGhpcy5fbWF5YmVJbnZva2VDYWxsYmFjaygpO1xuICB9XG4gIC8vIFRydWUgaWYgcmVjZWl2ZVJlc3VsdCBoYXMgYmVlbiBjYWxsZWQuXG4gIGdvdFJlc3VsdCgpIHtcbiAgICByZXR1cm4gISF0aGlzLl9tZXRob2RSZXN1bHQ7XG4gIH1cbn1cbiIsImltcG9ydCB7IE1vbmdvSUQgfSBmcm9tICdtZXRlb3IvbW9uZ28taWQnO1xuXG5leHBvcnQgY2xhc3MgTW9uZ29JRE1hcCBleHRlbmRzIElkTWFwIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoTW9uZ29JRC5pZFN0cmluZ2lmeSwgTW9uZ29JRC5pZFBhcnNlKTtcbiAgfVxufSIsImltcG9ydCB7IEREUENvbW1vbiB9IGZyb20gJ21ldGVvci9kZHAtY29tbW9uJztcbmltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuXG5pbXBvcnQgeyBDb25uZWN0aW9uIH0gZnJvbSAnLi9saXZlZGF0YV9jb25uZWN0aW9uLmpzJztcblxuLy8gVGhpcyBhcnJheSBhbGxvd3MgdGhlIGBfYWxsU3Vic2NyaXB0aW9uc1JlYWR5YCBtZXRob2QgYmVsb3csIHdoaWNoXG4vLyBpcyB1c2VkIGJ5IHRoZSBgc3BpZGVyYWJsZWAgcGFja2FnZSwgdG8ga2VlcCB0cmFjayBvZiB3aGV0aGVyIGFsbFxuLy8gZGF0YSBpcyByZWFkeS5cbmNvbnN0IGFsbENvbm5lY3Rpb25zID0gW107XG5cbi8qKlxuICogQG5hbWVzcGFjZSBERFBcbiAqIEBzdW1tYXJ5IE5hbWVzcGFjZSBmb3IgRERQLXJlbGF0ZWQgbWV0aG9kcy9jbGFzc2VzLlxuICovXG5leHBvcnQgY29uc3QgRERQID0ge307XG5cbi8vIFRoaXMgaXMgcHJpdmF0ZSBidXQgaXQncyB1c2VkIGluIGEgZmV3IHBsYWNlcy4gYWNjb3VudHMtYmFzZSB1c2VzXG4vLyBpdCB0byBnZXQgdGhlIGN1cnJlbnQgdXNlci4gTWV0ZW9yLnNldFRpbWVvdXQgYW5kIGZyaWVuZHMgY2xlYXJcbi8vIGl0LiBXZSBjYW4gcHJvYmFibHkgZmluZCBhIGJldHRlciB3YXkgdG8gZmFjdG9yIHRoaXMuXG5ERFAuX0N1cnJlbnRNZXRob2RJbnZvY2F0aW9uID0gbmV3IE1ldGVvci5FbnZpcm9ubWVudFZhcmlhYmxlKCk7XG5ERFAuX0N1cnJlbnRQdWJsaWNhdGlvbkludm9jYXRpb24gPSBuZXcgTWV0ZW9yLkVudmlyb25tZW50VmFyaWFibGUoKTtcblxuLy8gWFhYOiBLZWVwIEREUC5fQ3VycmVudEludm9jYXRpb24gZm9yIGJhY2t3YXJkcy1jb21wYXRpYmlsaXR5LlxuRERQLl9DdXJyZW50SW52b2NhdGlvbiA9IEREUC5fQ3VycmVudE1ldGhvZEludm9jYXRpb247XG5cbkREUC5fQ3VycmVudENhbGxBc3luY0ludm9jYXRpb24gPSBuZXcgTWV0ZW9yLkVudmlyb25tZW50VmFyaWFibGUoKTtcblxuLy8gVGhpcyBpcyBwYXNzZWQgaW50byBhIHdlaXJkIGBtYWtlRXJyb3JUeXBlYCBmdW5jdGlvbiB0aGF0IGV4cGVjdHMgaXRzIHRoaW5nXG4vLyB0byBiZSBhIGNvbnN0cnVjdG9yXG5mdW5jdGlvbiBjb25uZWN0aW9uRXJyb3JDb25zdHJ1Y3RvcihtZXNzYWdlKSB7XG4gIHRoaXMubWVzc2FnZSA9IG1lc3NhZ2U7XG59XG5cbkREUC5Db25uZWN0aW9uRXJyb3IgPSBNZXRlb3IubWFrZUVycm9yVHlwZShcbiAgJ0REUC5Db25uZWN0aW9uRXJyb3InLFxuICBjb25uZWN0aW9uRXJyb3JDb25zdHJ1Y3RvclxuKTtcblxuRERQLkZvcmNlZFJlY29ubmVjdEVycm9yID0gTWV0ZW9yLm1ha2VFcnJvclR5cGUoXG4gICdERFAuRm9yY2VkUmVjb25uZWN0RXJyb3InLFxuICAoKSA9PiB7fVxuKTtcblxuLy8gUmV0dXJucyB0aGUgbmFtZWQgc2VxdWVuY2Ugb2YgcHNldWRvLXJhbmRvbSB2YWx1ZXMuXG4vLyBUaGUgc2NvcGUgd2lsbCBiZSBERFAuX0N1cnJlbnRNZXRob2RJbnZvY2F0aW9uLmdldCgpLCBzbyB0aGUgc3RyZWFtIHdpbGwgcHJvZHVjZVxuLy8gY29uc2lzdGVudCB2YWx1ZXMgZm9yIG1ldGhvZCBjYWxscyBvbiB0aGUgY2xpZW50IGFuZCBzZXJ2ZXIuXG5ERFAucmFuZG9tU3RyZWFtID0gbmFtZSA9PiB7XG4gIGNvbnN0IHNjb3BlID0gRERQLl9DdXJyZW50TWV0aG9kSW52b2NhdGlvbi5nZXQoKTtcbiAgcmV0dXJuIEREUENvbW1vbi5SYW5kb21TdHJlYW0uZ2V0KHNjb3BlLCBuYW1lKTtcbn07XG5cbi8vIEBwYXJhbSB1cmwge1N0cmluZ30gVVJMIHRvIE1ldGVvciBhcHAsXG4vLyAgICAgZS5nLjpcbi8vICAgICBcInN1YmRvbWFpbi5tZXRlb3IuY29tXCIsXG4vLyAgICAgXCJodHRwOi8vc3ViZG9tYWluLm1ldGVvci5jb21cIixcbi8vICAgICBcIi9cIixcbi8vICAgICBcImRkcCtzb2NranM6Ly9kZHAtLSoqKiotZm9vLm1ldGVvci5jb20vc29ja2pzXCJcblxuLyoqXG4gKiBAc3VtbWFyeSBDb25uZWN0IHRvIHRoZSBzZXJ2ZXIgb2YgYSBkaWZmZXJlbnQgTWV0ZW9yIGFwcGxpY2F0aW9uIHRvIHN1YnNjcmliZSB0byBpdHMgZG9jdW1lbnQgc2V0cyBhbmQgaW52b2tlIGl0cyByZW1vdGUgbWV0aG9kcy5cbiAqIEBsb2N1cyBBbnl3aGVyZVxuICogQHBhcmFtIHtTdHJpbmd9IHVybCBUaGUgVVJMIG9mIGFub3RoZXIgTWV0ZW9yIGFwcGxpY2F0aW9uLlxuICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXVxuICogQHBhcmFtIHtCb29sZWFufSBvcHRpb25zLnJlbG9hZFdpdGhPdXRzdGFuZGluZyBpcyBpdCBPSyB0byByZWxvYWQgaWYgdGhlcmUgYXJlIG91dHN0YW5kaW5nIG1ldGhvZHM/XG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucy5oZWFkZXJzIGV4dHJhIGhlYWRlcnMgdG8gc2VuZCBvbiB0aGUgd2Vic29ja2V0cyBjb25uZWN0aW9uLCBmb3Igc2VydmVyLXRvLXNlcnZlciBERFAgb25seVxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMuX3NvY2tqc09wdGlvbnMgU3BlY2lmaWVzIG9wdGlvbnMgdG8gcGFzcyB0aHJvdWdoIHRvIHRoZSBzb2NranMgY2xpZW50XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBvcHRpb25zLm9uRERQTmVnb3RpYXRpb25WZXJzaW9uRmFpbHVyZSBjYWxsYmFjayB3aGVuIHZlcnNpb24gbmVnb3RpYXRpb24gZmFpbHMuXG4gKi9cbkREUC5jb25uZWN0ID0gKHVybCwgb3B0aW9ucykgPT4ge1xuICBjb25zdCByZXQgPSBuZXcgQ29ubmVjdGlvbih1cmwsIG9wdGlvbnMpO1xuICBhbGxDb25uZWN0aW9ucy5wdXNoKHJldCk7IC8vIGhhY2suIHNlZSBiZWxvdy5cbiAgcmV0dXJuIHJldDtcbn07XG5cbkREUC5fcmVjb25uZWN0SG9vayA9IG5ldyBIb29rKHsgYmluZEVudmlyb25tZW50OiBmYWxzZSB9KTtcblxuLyoqXG4gKiBAc3VtbWFyeSBSZWdpc3RlciBhIGZ1bmN0aW9uIHRvIGNhbGwgYXMgdGhlIGZpcnN0IHN0ZXAgb2ZcbiAqIHJlY29ubmVjdGluZy4gVGhpcyBmdW5jdGlvbiBjYW4gY2FsbCBtZXRob2RzIHdoaWNoIHdpbGwgYmUgZXhlY3V0ZWQgYmVmb3JlXG4gKiBhbnkgb3RoZXIgb3V0c3RhbmRpbmcgbWV0aG9kcy4gRm9yIGV4YW1wbGUsIHRoaXMgY2FuIGJlIHVzZWQgdG8gcmUtZXN0YWJsaXNoXG4gKiB0aGUgYXBwcm9wcmlhdGUgYXV0aGVudGljYXRpb24gY29udGV4dCBvbiB0aGUgY29ubmVjdGlvbi5cbiAqIEBsb2N1cyBBbnl3aGVyZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGZ1bmN0aW9uIHRvIGNhbGwuIEl0IHdpbGwgYmUgY2FsbGVkIHdpdGggYVxuICogc2luZ2xlIGFyZ3VtZW50LCB0aGUgW2Nvbm5lY3Rpb24gb2JqZWN0XSgjZGRwX2Nvbm5lY3QpIHRoYXQgaXMgcmVjb25uZWN0aW5nLlxuICovXG5ERFAub25SZWNvbm5lY3QgPSBjYWxsYmFjayA9PiBERFAuX3JlY29ubmVjdEhvb2sucmVnaXN0ZXIoY2FsbGJhY2spO1xuXG4vLyBIYWNrIGZvciBgc3BpZGVyYWJsZWAgcGFja2FnZTogYSB3YXkgdG8gc2VlIGlmIHRoZSBwYWdlIGlzIGRvbmVcbi8vIGxvYWRpbmcgYWxsIHRoZSBkYXRhIGl0IG5lZWRzLlxuLy9cbkREUC5fYWxsU3Vic2NyaXB0aW9uc1JlYWR5ID0gKCkgPT4gYWxsQ29ubmVjdGlvbnMuZXZlcnkoXG4gIGNvbm4gPT4gT2JqZWN0LnZhbHVlcyhjb25uLl9zdWJzY3JpcHRpb25zKS5ldmVyeShzdWIgPT4gc3ViLnJlYWR5KVxuKTtcbiJdfQ==
