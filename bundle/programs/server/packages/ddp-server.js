Package["core-runtime"].queue("ddp-server",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;
var check = Package.check.check;
var Match = Package.check.Match;
var Random = Package.random.Random;
var EJSON = Package.ejson.EJSON;
var Retry = Package.retry.Retry;
var MongoID = Package['mongo-id'].MongoID;
var DiffSequence = Package['diff-sequence'].DiffSequence;
var ECMAScript = Package.ecmascript.ECMAScript;
var DDPCommon = Package['ddp-common'].DDPCommon;
var DDP = Package['ddp-client'].DDP;
var WebApp = Package.webapp.WebApp;
var WebAppInternals = Package.webapp.WebAppInternals;
var main = Package.webapp.main;
var RoutePolicy = Package.routepolicy.RoutePolicy;
var Hook = Package['callback-hook'].Hook;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var StreamServer, DDPServer, Server;

var require = meteorInstall({"node_modules":{"meteor":{"ddp-server":{"stream_server.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/ddp-server/stream_server.js                                                                                //
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
    let once;
    module.link("lodash.once", {
      default(v) {
        once = v;
      }
    }, 0);
    let zlib;
    module.link("node:zlib", {
      default(v) {
        zlib = v;
      }
    }, 1);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    // By default, we use the permessage-deflate extension with default
    // configuration. If $SERVER_WEBSOCKET_COMPRESSION is set, then it must be valid
    // JSON. If it represents a falsey value, then we do not use permessage-deflate
    // at all; otherwise, the JSON value is used as an argument to deflate's
    // configure method; see
    // https://github.com/faye/permessage-deflate-node/blob/master/README.md
    //
    // (We do this in an _.once instead of at startup, because we don't want to
    // crash the tool during isopacket load if your JSON doesn't parse. This is only
    // a problem because the tool has to load the DDP server code just in order to
    // be a DDP client; see https://github.com/meteor/meteor/issues/3452 .)
    var websocketExtensions = once(function () {
      var extensions = [];
      var websocketCompressionConfig = process.env.SERVER_WEBSOCKET_COMPRESSION ? JSON.parse(process.env.SERVER_WEBSOCKET_COMPRESSION) : {};
      if (websocketCompressionConfig) {
        extensions.push(Npm.require('permessage-deflate2').configure(_objectSpread({
          threshold: 1024,
          level: zlib.constants.Z_BEST_SPEED,
          memLevel: zlib.constants.Z_MIN_MEMLEVEL,
          noContextTakeover: true,
          maxWindowBits: zlib.constants.Z_MIN_WINDOWBITS
        }, websocketCompressionConfig || {})));
      }
      return extensions;
    });
    var pathPrefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX || "";
    StreamServer = function () {
      var self = this;
      self.registration_callbacks = [];
      self.open_sockets = [];

      // Because we are installing directly onto WebApp.httpServer instead of using
      // WebApp.app, we have to process the path prefix ourselves.
      self.prefix = pathPrefix + '/sockjs';
      RoutePolicy.declare(self.prefix + '/', 'network');

      // set up sockjs
      var sockjs = Npm.require('sockjs');
      var serverOptions = {
        prefix: self.prefix,
        log: function () {},
        // this is the default, but we code it explicitly because we depend
        // on it in stream_client:HEARTBEAT_TIMEOUT
        heartbeat_delay: 45000,
        // The default disconnect_delay is 5 seconds, but if the server ends up CPU
        // bound for that much time, SockJS might not notice that the user has
        // reconnected because the timer (of disconnect_delay ms) can fire before
        // SockJS processes the new connection. Eventually we'll fix this by not
        // combining CPU-heavy processing with SockJS termination (eg a proxy which
        // converts to Unix sockets) but for now, raise the delay.
        disconnect_delay: 60 * 1000,
        // Allow disabling of CORS requests to address
        // https://github.com/meteor/meteor/issues/8317.
        disable_cors: !!process.env.DISABLE_SOCKJS_CORS,
        // Set the USE_JSESSIONID environment variable to enable setting the
        // JSESSIONID cookie. This is useful for setting up proxies with
        // session affinity.
        jsessionid: !!process.env.USE_JSESSIONID
      };

      // If you know your server environment (eg, proxies) will prevent websockets
      // from ever working, set $DISABLE_WEBSOCKETS and SockJS clients (ie,
      // browsers) will not waste time attempting to use them.
      // (Your server will still have a /websocket endpoint.)
      if (process.env.DISABLE_WEBSOCKETS) {
        serverOptions.websocket = false;
      } else {
        serverOptions.faye_server_options = {
          extensions: websocketExtensions()
        };
      }
      self.server = sockjs.createServer(serverOptions);

      // Install the sockjs handlers, but we want to keep around our own particular
      // request handler that adjusts idle timeouts while we have an outstanding
      // request.  This compensates for the fact that sockjs removes all listeners
      // for "request" to add its own.
      WebApp.httpServer.removeListener('request', WebApp._timeoutAdjustmentRequestCallback);
      self.server.installHandlers(WebApp.httpServer);
      WebApp.httpServer.addListener('request', WebApp._timeoutAdjustmentRequestCallback);

      // Support the /websocket endpoint
      self._redirectWebsocketEndpoint();
      self.server.on('connection', function (socket) {
        // sockjs sometimes passes us null instead of a socket object
        // so we need to guard against that. see:
        // https://github.com/sockjs/sockjs-node/issues/121
        // https://github.com/meteor/meteor/issues/10468
        if (!socket) return;

        // We want to make sure that if a client connects to us and does the initial
        // Websocket handshake but never gets to the DDP handshake, that we
        // eventually kill the socket.  Once the DDP handshake happens, DDP
        // heartbeating will work. And before the Websocket handshake, the timeouts
        // we set at the server level in webapp_server.js will work. But
        // faye-websocket calls setTimeout(0) on any socket it takes over, so there
        // is an "in between" state where this doesn't happen.  We work around this
        // by explicitly setting the socket timeout to a relatively large time here,
        // and setting it back to zero when we set up the heartbeat in
        // livedata_server.js.
        socket.setWebsocketTimeout = function (timeout) {
          if ((socket.protocol === 'websocket' || socket.protocol === 'websocket-raw') && socket._session.recv) {
            socket._session.recv.connection.setTimeout(timeout);
          }
        };
        socket.setWebsocketTimeout(45 * 1000);
        socket.send = function (data) {
          socket.write(data);
        };
        socket.on('close', function () {
          self.open_sockets = self.open_sockets.filter(function (value) {
            return value !== socket;
          });
        });
        self.open_sockets.push(socket);

        // only to send a message after connection on tests, useful for
        // socket-stream-client/server-tests.js
        if (process.env.TEST_METADATA && process.env.TEST_METADATA !== "{}") {
          socket.send(JSON.stringify({
            testMessageOnConnect: true
          }));
        }

        // call all our callbacks when we get a new socket. they will do the
        // work of setting up handlers and such for specific messages.
        self.registration_callbacks.forEach(function (callback) {
          callback(socket);
        });
      });
    };
    Object.assign(StreamServer.prototype, {
      // call my callback when a new socket connects.
      // also call it for all current connections.
      register: function (callback) {
        var self = this;
        self.registration_callbacks.push(callback);
        self.all_sockets().forEach(function (socket) {
          callback(socket);
        });
      },
      // get a list of all sockets
      all_sockets: function () {
        var self = this;
        return Object.values(self.open_sockets);
      },
      // Redirect /websocket to /sockjs/websocket in order to not expose
      // sockjs to clients that want to use raw websockets
      _redirectWebsocketEndpoint: function () {
        var self = this;
        // Unfortunately we can't use a connect middleware here since
        // sockjs installs itself prior to all existing listeners
        // (meaning prior to any connect middlewares) so we need to take
        // an approach similar to overshadowListeners in
        // https://github.com/sockjs/sockjs-node/blob/cf820c55af6a9953e16558555a31decea554f70e/src/utils.coffee
        ['request', 'upgrade'].forEach(event => {
          var httpServer = WebApp.httpServer;
          var oldHttpServerListeners = httpServer.listeners(event).slice(0);
          httpServer.removeAllListeners(event);

          // request and upgrade have different arguments passed but
          // we only care about the first one which is always request
          var newListener = function (request /*, moreArguments */) {
            // Store arguments for use within the closure below
            var args = arguments;

            // TODO replace with url package
            var url = Npm.require('url');

            // Rewrite /websocket and /websocket/ urls to /sockjs/websocket while
            // preserving query string.
            var parsedUrl = url.parse(request.url);
            if (parsedUrl.pathname === pathPrefix + '/websocket' || parsedUrl.pathname === pathPrefix + '/websocket/') {
              parsedUrl.pathname = self.prefix + '/websocket';
              request.url = url.format(parsedUrl);
            }
            oldHttpServerListeners.forEach(function (oldListener) {
              oldListener.apply(httpServer, args);
            });
          };
          httpServer.addListener(event, newListener);
        });
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

},"livedata_server.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/ddp-server/livedata_server.js                                                                              //
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
    let isEmpty;
    module.link("lodash.isempty", {
      default(v) {
        isEmpty = v;
      }
    }, 0);
    let isObject;
    module.link("lodash.isobject", {
      default(v) {
        isObject = v;
      }
    }, 1);
    let isString;
    module.link("lodash.isstring", {
      default(v) {
        isString = v;
      }
    }, 2);
    let SessionCollectionView;
    module.link("./session_collection_view", {
      SessionCollectionView(v) {
        SessionCollectionView = v;
      }
    }, 3);
    let SessionDocumentView;
    module.link("./session_document_view", {
      SessionDocumentView(v) {
        SessionDocumentView = v;
      }
    }, 4);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    DDPServer = {};

    // Publication strategies define how we handle data from published cursors at the collection level
    // This allows someone to:
    // - Choose a trade-off between client-server bandwidth and server memory usage
    // - Implement special (non-mongo) collections like volatile message queues
    const publicationStrategies = {
      // SERVER_MERGE is the default strategy.
      // When using this strategy, the server maintains a copy of all data a connection is subscribed to.
      // This allows us to only send deltas over multiple publications.
      SERVER_MERGE: {
        useDummyDocumentView: false,
        useCollectionView: true,
        doAccountingForCollection: true
      },
      // The NO_MERGE_NO_HISTORY strategy results in the server sending all publication data
      // directly to the client. It does not remember what it has previously sent
      // to it will not trigger removed messages when a subscription is stopped.
      // This should only be chosen for special use cases like send-and-forget queues.
      NO_MERGE_NO_HISTORY: {
        useDummyDocumentView: false,
        useCollectionView: false,
        doAccountingForCollection: false
      },
      // NO_MERGE is similar to NO_MERGE_NO_HISTORY but the server will remember the IDs it has
      // sent to the client so it can remove them when a subscription is stopped.
      // This strategy can be used when a collection is only used in a single publication.
      NO_MERGE: {
        useDummyDocumentView: false,
        useCollectionView: false,
        doAccountingForCollection: true
      },
      // NO_MERGE_MULTI is similar to `NO_MERGE`, but it does track whether a document is
      // used by multiple publications. This has some memory overhead, but it still does not do
      // diffing so it's faster and slimmer than SERVER_MERGE.
      NO_MERGE_MULTI: {
        useDummyDocumentView: true,
        useCollectionView: true,
        doAccountingForCollection: true
      }
    };
    DDPServer.publicationStrategies = publicationStrategies;

    // This file contains classes:
    // * Session - The server's connection to a single DDP client
    // * Subscription - A single subscription for a single client
    // * Server - An entire server that may talk to > 1 client. A DDP endpoint.
    //
    // Session and Subscription are file scope. For now, until we freeze
    // the interface, Server is package scope (in the future it should be
    // exported).

    DDPServer._SessionDocumentView = SessionDocumentView;
    DDPServer._getCurrentFence = function () {
      let currentInvocation = this._CurrentWriteFence.get();
      if (currentInvocation) {
        return currentInvocation;
      }
      currentInvocation = DDP._CurrentMethodInvocation.get();
      return currentInvocation ? currentInvocation.fence : undefined;
    };
    DDPServer._SessionCollectionView = SessionCollectionView;

    /******************************************************************************/
    /* Session                                                                    */
    /******************************************************************************/

    var Session = function (server, version, socket, options) {
      var self = this;
      self.id = Random.id();
      self.server = server;
      self.version = version;
      self.initialized = false;
      self.socket = socket;

      // Set to null when the session is destroyed. Multiple places below
      // use this to determine if the session is alive or not.
      self.inQueue = new Meteor._DoubleEndedQueue();
      self.blocked = false;
      self.workerRunning = false;
      self.cachedUnblock = null;

      // Sub objects for active subscriptions
      self._namedSubs = new Map();
      self._universalSubs = [];
      self.userId = null;
      self.collectionViews = new Map();

      // Set this to false to not send messages when collectionViews are
      // modified. This is done when rerunning subs in _setUserId and those messages
      // are calculated via a diff instead.
      self._isSending = true;

      // If this is true, don't start a newly-created universal publisher on this
      // session. The session will take care of starting it when appropriate.
      self._dontStartNewUniversalSubs = false;

      // When we are rerunning subscriptions, any ready messages
      // we want to buffer up for when we are done rerunning subscriptions
      self._pendingReady = [];

      // List of callbacks to call when this connection is closed.
      self._closeCallbacks = [];

      // XXX HACK: If a sockjs connection, save off the URL. This is
      // temporary and will go away in the near future.
      self._socketUrl = socket.url;

      // Allow tests to disable responding to pings.
      self._respondToPings = options.respondToPings;

      // This object is the public interface to the session. In the public
      // API, it is called the `connection` object.  Internally we call it
      // a `connectionHandle` to avoid ambiguity.
      self.connectionHandle = {
        id: self.id,
        close: function () {
          self.close();
        },
        onClose: function (fn) {
          var cb = Meteor.bindEnvironment(fn, "connection onClose callback");
          if (self.inQueue) {
            self._closeCallbacks.push(cb);
          } else {
            // if we're already closed, call the callback.
            Meteor.defer(cb);
          }
        },
        clientAddress: self._clientAddress(),
        httpHeaders: self.socket.headers
      };
      self.send({
        msg: 'connected',
        session: self.id
      });

      // On initial connect, spin up all the universal publishers.
      self.startUniversalSubs();
      if (version !== 'pre1' && options.heartbeatInterval !== 0) {
        // We no longer need the low level timeout because we have heartbeats.
        socket.setWebsocketTimeout(0);
        self.heartbeat = new DDPCommon.Heartbeat({
          heartbeatInterval: options.heartbeatInterval,
          heartbeatTimeout: options.heartbeatTimeout,
          onTimeout: function () {
            self.close();
          },
          sendPing: function () {
            self.send({
              msg: 'ping'
            });
          }
        });
        self.heartbeat.start();
      }
      Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("livedata", "sessions", 1);
    };
    Object.assign(Session.prototype, {
      sendReady: function (subscriptionIds) {
        var self = this;
        if (self._isSending) {
          self.send({
            msg: "ready",
            subs: subscriptionIds
          });
        } else {
          subscriptionIds.forEach(function (subscriptionId) {
            self._pendingReady.push(subscriptionId);
          });
        }
      },
      _canSend(collectionName) {
        return this._isSending || !this.server.getPublicationStrategy(collectionName).useCollectionView;
      },
      sendAdded(collectionName, id, fields) {
        if (this._canSend(collectionName)) {
          this.send({
            msg: 'added',
            collection: collectionName,
            id,
            fields
          });
        }
      },
      sendChanged(collectionName, id, fields) {
        if (isEmpty(fields)) return;
        if (this._canSend(collectionName)) {
          this.send({
            msg: "changed",
            collection: collectionName,
            id,
            fields
          });
        }
      },
      sendRemoved(collectionName, id) {
        if (this._canSend(collectionName)) {
          this.send({
            msg: "removed",
            collection: collectionName,
            id
          });
        }
      },
      getSendCallbacks: function () {
        var self = this;
        return {
          added: self.sendAdded.bind(self),
          changed: self.sendChanged.bind(self),
          removed: self.sendRemoved.bind(self)
        };
      },
      getCollectionView: function (collectionName) {
        var self = this;
        var ret = self.collectionViews.get(collectionName);
        if (!ret) {
          ret = new SessionCollectionView(collectionName, self.getSendCallbacks());
          self.collectionViews.set(collectionName, ret);
        }
        return ret;
      },
      added(subscriptionHandle, collectionName, id, fields) {
        if (this.server.getPublicationStrategy(collectionName).useCollectionView) {
          const view = this.getCollectionView(collectionName);
          view.added(subscriptionHandle, id, fields);
        } else {
          this.sendAdded(collectionName, id, fields);
        }
      },
      removed(subscriptionHandle, collectionName, id) {
        if (this.server.getPublicationStrategy(collectionName).useCollectionView) {
          const view = this.getCollectionView(collectionName);
          view.removed(subscriptionHandle, id);
          if (view.isEmpty()) {
            this.collectionViews.delete(collectionName);
          }
        } else {
          this.sendRemoved(collectionName, id);
        }
      },
      changed(subscriptionHandle, collectionName, id, fields) {
        if (this.server.getPublicationStrategy(collectionName).useCollectionView) {
          const view = this.getCollectionView(collectionName);
          view.changed(subscriptionHandle, id, fields);
        } else {
          this.sendChanged(collectionName, id, fields);
        }
      },
      startUniversalSubs: function () {
        var self = this;
        // Make a shallow copy of the set of universal handlers and start them. If
        // additional universal publishers start while we're running them (due to
        // yielding), they will run separately as part of Server.publish.
        var handlers = [...self.server.universal_publish_handlers];
        handlers.forEach(function (handler) {
          self._startSubscription(handler);
        });
      },
      // Destroy this session and unregister it at the server.
      close: function () {
        var self = this;

        // Destroy this session, even if it's not registered at the
        // server. Stop all processing and tear everything down. If a socket
        // was attached, close it.

        // Already destroyed.
        if (!self.inQueue) return;

        // Drop the merge box data immediately.
        self.inQueue = null;
        self.collectionViews = new Map();
        if (self.heartbeat) {
          self.heartbeat.stop();
          self.heartbeat = null;
        }
        if (self.socket) {
          self.socket.close();
          self.socket._meteorSession = null;
        }
        Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("livedata", "sessions", -1);
        Meteor.defer(function () {
          // Stop callbacks can yield, so we defer this on close.
          // sub._isDeactivated() detects that we set inQueue to null and
          // treats it as semi-deactivated (it will ignore incoming callbacks, etc).
          self._deactivateAllSubscriptions();

          // Defer calling the close callbacks, so that the caller closing
          // the session isn't waiting for all the callbacks to complete.
          self._closeCallbacks.forEach(function (callback) {
            callback();
          });
        });

        // Unregister the session.
        self.server._removeSession(self);
      },
      // Send a message (doing nothing if no socket is connected right now).
      // It should be a JSON object (it will be stringified).
      send: function (msg) {
        const self = this;
        if (self.socket) {
          if (Meteor._printSentDDP) Meteor._debug("Sent DDP", DDPCommon.stringifyDDP(msg));
          self.socket.send(DDPCommon.stringifyDDP(msg));
        }
      },
      // Send a connection error.
      sendError: function (reason, offendingMessage) {
        var self = this;
        var msg = {
          msg: 'error',
          reason: reason
        };
        if (offendingMessage) msg.offendingMessage = offendingMessage;
        self.send(msg);
      },
      // Process 'msg' as an incoming message. As a guard against
      // race conditions during reconnection, ignore the message if
      // 'socket' is not the currently connected socket.
      //
      // We run the messages from the client one at a time, in the order
      // given by the client. The message handler is passed an idempotent
      // function 'unblock' which it may call to allow other messages to
      // begin running in parallel in another fiber (for example, a method
      // that wants to yield). Otherwise, it is automatically unblocked
      // when it returns.
      //
      // Actually, we don't have to 'totally order' the messages in this
      // way, but it's the easiest thing that's correct. (unsub needs to
      // be ordered against sub, methods need to be ordered against each
      // other).
      processMessage: function (msg_in) {
        var self = this;
        if (!self.inQueue)
          // we have been destroyed.
          return;

        // Respond to ping and pong messages immediately without queuing.
        // If the negotiated DDP version is "pre1" which didn't support
        // pings, preserve the "pre1" behavior of responding with a "bad
        // request" for the unknown messages.
        //
        // Fibers are needed because heartbeats use Meteor.setTimeout, which
        // needs a Fiber. We could actually use regular setTimeout and avoid
        // these new fibers, but it is easier to just make everything use
        // Meteor.setTimeout and not think too hard.
        //
        // Any message counts as receiving a pong, as it demonstrates that
        // the client is still alive.
        if (self.heartbeat) {
          self.heartbeat.messageReceived();
        }
        ;
        if (self.version !== 'pre1' && msg_in.msg === 'ping') {
          if (self._respondToPings) self.send({
            msg: "pong",
            id: msg_in.id
          });
          return;
        }
        if (self.version !== 'pre1' && msg_in.msg === 'pong') {
          // Since everything is a pong, there is nothing to do
          return;
        }
        self.inQueue.push(msg_in);
        if (self.workerRunning) return;
        self.workerRunning = true;
        var processNext = function () {
          var msg = self.inQueue && self.inQueue.shift();
          if (!msg) {
            self.workerRunning = false;
            return;
          }
          function runHandlers() {
            var blocked = true;
            var unblock = function () {
              if (!blocked) return; // idempotent
              blocked = false;
              setImmediate(processNext);
            };
            self.server.onMessageHook.each(function (callback) {
              callback(msg, self);
              return true;
            });
            if (msg.msg in self.protocol_handlers) {
              const result = self.protocol_handlers[msg.msg].call(self, msg, unblock);
              if (Meteor._isPromise(result)) {
                result.finally(() => unblock());
              } else {
                unblock();
              }
            } else {
              self.sendError('Bad request', msg);
              unblock(); // in case the handler didn't already do it
            }
          }
          runHandlers();
        };
        processNext();
      },
      protocol_handlers: {
        sub: async function (msg, unblock) {
          var self = this;

          // cacheUnblock temporarly, so we can capture it later
          // we will use unblock in current eventLoop, so this is safe
          self.cachedUnblock = unblock;

          // reject malformed messages
          if (typeof msg.id !== "string" || typeof msg.name !== "string" || 'params' in msg && !(msg.params instanceof Array)) {
            self.sendError("Malformed subscription", msg);
            return;
          }
          if (!self.server.publish_handlers[msg.name]) {
            self.send({
              msg: 'nosub',
              id: msg.id,
              error: new Meteor.Error(404, "Subscription '".concat(msg.name, "' not found"))
            });
            return;
          }
          if (self._namedSubs.has(msg.id))
            // subs are idempotent, or rather, they are ignored if a sub
            // with that id already exists. this is important during
            // reconnect.
            return;

          // XXX It'd be much better if we had generic hooks where any package can
          // hook into subscription handling, but in the mean while we special case
          // ddp-rate-limiter package. This is also done for weak requirements to
          // add the ddp-rate-limiter package in case we don't have Accounts. A
          // user trying to use the ddp-rate-limiter must explicitly require it.
          if (Package['ddp-rate-limiter']) {
            var DDPRateLimiter = Package['ddp-rate-limiter'].DDPRateLimiter;
            var rateLimiterInput = {
              userId: self.userId,
              clientAddress: self.connectionHandle.clientAddress,
              type: "subscription",
              name: msg.name,
              connectionId: self.id
            };
            DDPRateLimiter._increment(rateLimiterInput);
            var rateLimitResult = DDPRateLimiter._check(rateLimiterInput);
            if (!rateLimitResult.allowed) {
              self.send({
                msg: 'nosub',
                id: msg.id,
                error: new Meteor.Error('too-many-requests', DDPRateLimiter.getErrorMessage(rateLimitResult), {
                  timeToReset: rateLimitResult.timeToReset
                })
              });
              return;
            }
          }
          var handler = self.server.publish_handlers[msg.name];
          await self._startSubscription(handler, msg.id, msg.params, msg.name);

          // cleaning cached unblock
          self.cachedUnblock = null;
        },
        unsub: function (msg) {
          var self = this;
          self._stopSubscription(msg.id);
        },
        method: async function (msg, unblock) {
          var self = this;

          // Reject malformed messages.
          // For now, we silently ignore unknown attributes,
          // for forwards compatibility.
          if (typeof msg.id !== "string" || typeof msg.method !== "string" || 'params' in msg && !(msg.params instanceof Array) || 'randomSeed' in msg && typeof msg.randomSeed !== "string") {
            self.sendError("Malformed method invocation", msg);
            return;
          }
          var randomSeed = msg.randomSeed || null;

          // Set up to mark the method as satisfied once all observers
          // (and subscriptions) have reacted to any writes that were
          // done.
          var fence = new DDPServer._WriteFence();
          fence.onAllCommitted(function () {
            // Retire the fence so that future writes are allowed.
            // This means that callbacks like timers are free to use
            // the fence, and if they fire before it's armed (for
            // example, because the method waits for them) their
            // writes will be included in the fence.
            fence.retire();
            self.send({
              msg: 'updated',
              methods: [msg.id]
            });
          });

          // Find the handler
          var handler = self.server.method_handlers[msg.method];
          if (!handler) {
            self.send({
              msg: 'result',
              id: msg.id,
              error: new Meteor.Error(404, "Method '".concat(msg.method, "' not found"))
            });
            await fence.arm();
            return;
          }
          var invocation = new DDPCommon.MethodInvocation({
            name: msg.method,
            isSimulation: false,
            userId: self.userId,
            setUserId(userId) {
              return self._setUserId(userId);
            },
            unblock: unblock,
            connection: self.connectionHandle,
            randomSeed: randomSeed,
            fence
          });
          const promise = new Promise((resolve, reject) => {
            // XXX It'd be better if we could hook into method handlers better but
            // for now, we need to check if the ddp-rate-limiter exists since we
            // have a weak requirement for the ddp-rate-limiter package to be added
            // to our application.
            if (Package['ddp-rate-limiter']) {
              var DDPRateLimiter = Package['ddp-rate-limiter'].DDPRateLimiter;
              var rateLimiterInput = {
                userId: self.userId,
                clientAddress: self.connectionHandle.clientAddress,
                type: "method",
                name: msg.method,
                connectionId: self.id
              };
              DDPRateLimiter._increment(rateLimiterInput);
              var rateLimitResult = DDPRateLimiter._check(rateLimiterInput);
              if (!rateLimitResult.allowed) {
                reject(new Meteor.Error("too-many-requests", DDPRateLimiter.getErrorMessage(rateLimitResult), {
                  timeToReset: rateLimitResult.timeToReset
                }));
                return;
              }
            }
            resolve(DDPServer._CurrentWriteFence.withValue(fence, () => DDP._CurrentMethodInvocation.withValue(invocation, () => maybeAuditArgumentChecks(handler, invocation, msg.params, "call to '" + msg.method + "'"))));
          });
          async function finish() {
            await fence.arm();
            unblock();
          }
          const payload = {
            msg: "result",
            id: msg.id
          };
          return promise.then(async result => {
            await finish();
            if (result !== undefined) {
              payload.result = result;
            }
            self.send(payload);
          }, async exception => {
            await finish();
            payload.error = wrapInternalException(exception, "while invoking method '".concat(msg.method, "'"));
            self.send(payload);
          });
        }
      },
      _eachSub: function (f) {
        var self = this;
        self._namedSubs.forEach(f);
        self._universalSubs.forEach(f);
      },
      _diffCollectionViews: function (beforeCVs) {
        var self = this;
        DiffSequence.diffMaps(beforeCVs, self.collectionViews, {
          both: function (collectionName, leftValue, rightValue) {
            rightValue.diff(leftValue);
          },
          rightOnly: function (collectionName, rightValue) {
            rightValue.documents.forEach(function (docView, id) {
              self.sendAdded(collectionName, id, docView.getFields());
            });
          },
          leftOnly: function (collectionName, leftValue) {
            leftValue.documents.forEach(function (doc, id) {
              self.sendRemoved(collectionName, id);
            });
          }
        });
      },
      // Sets the current user id in all appropriate contexts and reruns
      // all subscriptions
      async _setUserId(userId) {
        var self = this;
        if (userId !== null && typeof userId !== "string") throw new Error("setUserId must be called on string or null, not " + typeof userId);

        // Prevent newly-created universal subscriptions from being added to our
        // session. They will be found below when we call startUniversalSubs.
        //
        // (We don't have to worry about named subscriptions, because we only add
        // them when we process a 'sub' message. We are currently processing a
        // 'method' message, and the method did not unblock, because it is illegal
        // to call setUserId after unblock. Thus we cannot be concurrently adding a
        // new named subscription).
        self._dontStartNewUniversalSubs = true;

        // Prevent current subs from updating our collectionViews and call their
        // stop callbacks. This may yield.
        self._eachSub(function (sub) {
          sub._deactivate();
        });

        // All subs should now be deactivated. Stop sending messages to the client,
        // save the state of the published collections, reset to an empty view, and
        // update the userId.
        self._isSending = false;
        var beforeCVs = self.collectionViews;
        self.collectionViews = new Map();
        self.userId = userId;

        // _setUserId is normally called from a Meteor method with
        // DDP._CurrentMethodInvocation set. But DDP._CurrentMethodInvocation is not
        // expected to be set inside a publish function, so we temporary unset it.
        // Inside a publish function DDP._CurrentPublicationInvocation is set.
        await DDP._CurrentMethodInvocation.withValue(undefined, async function () {
          // Save the old named subs, and reset to having no subscriptions.
          var oldNamedSubs = self._namedSubs;
          self._namedSubs = new Map();
          self._universalSubs = [];
          await Promise.all([...oldNamedSubs].map(async _ref => {
            let [subscriptionId, sub] = _ref;
            const newSub = sub._recreate();
            self._namedSubs.set(subscriptionId, newSub);
            // nb: if the handler throws or calls this.error(), it will in fact
            // immediately send its 'nosub'. This is OK, though.
            await newSub._runHandler();
          }));

          // Allow newly-created universal subs to be started on our connection in
          // parallel with the ones we're spinning up here, and spin up universal
          // subs.
          self._dontStartNewUniversalSubs = false;
          self.startUniversalSubs();
        }, {
          name: '_setUserId'
        });

        // Start sending messages again, beginning with the diff from the previous
        // state of the world to the current state. No yields are allowed during
        // this diff, so that other changes cannot interleave.
        Meteor._noYieldsAllowed(function () {
          self._isSending = true;
          self._diffCollectionViews(beforeCVs);
          if (!isEmpty(self._pendingReady)) {
            self.sendReady(self._pendingReady);
            self._pendingReady = [];
          }
        });
      },
      _startSubscription: function (handler, subId, params, name) {
        var self = this;
        var sub = new Subscription(self, handler, subId, params, name);
        let unblockHander = self.cachedUnblock;
        // _startSubscription may call from a lot places
        // so cachedUnblock might be null in somecases
        // assign the cachedUnblock
        sub.unblock = unblockHander || (() => {});
        if (subId) self._namedSubs.set(subId, sub);else self._universalSubs.push(sub);
        return sub._runHandler();
      },
      // Tear down specified subscription
      _stopSubscription: function (subId, error) {
        var self = this;
        var subName = null;
        if (subId) {
          var maybeSub = self._namedSubs.get(subId);
          if (maybeSub) {
            subName = maybeSub._name;
            maybeSub._removeAllDocuments();
            maybeSub._deactivate();
            self._namedSubs.delete(subId);
          }
        }
        var response = {
          msg: 'nosub',
          id: subId
        };
        if (error) {
          response.error = wrapInternalException(error, subName ? "from sub " + subName + " id " + subId : "from sub id " + subId);
        }
        self.send(response);
      },
      // Tear down all subscriptions. Note that this does NOT send removed or nosub
      // messages, since we assume the client is gone.
      _deactivateAllSubscriptions: function () {
        var self = this;
        self._namedSubs.forEach(function (sub, id) {
          sub._deactivate();
        });
        self._namedSubs = new Map();
        self._universalSubs.forEach(function (sub) {
          sub._deactivate();
        });
        self._universalSubs = [];
      },
      // Determine the remote client's IP address, based on the
      // HTTP_FORWARDED_COUNT environment variable representing how many
      // proxies the server is behind.
      _clientAddress: function () {
        var self = this;

        // For the reported client address for a connection to be correct,
        // the developer must set the HTTP_FORWARDED_COUNT environment
        // variable to an integer representing the number of hops they
        // expect in the `x-forwarded-for` header. E.g., set to "1" if the
        // server is behind one proxy.
        //
        // This could be computed once at startup instead of every time.
        var httpForwardedCount = parseInt(process.env['HTTP_FORWARDED_COUNT']) || 0;
        if (httpForwardedCount === 0) return self.socket.remoteAddress;
        var forwardedFor = self.socket.headers["x-forwarded-for"];
        if (!isString(forwardedFor)) return null;
        forwardedFor = forwardedFor.split(',');

        // Typically the first value in the `x-forwarded-for` header is
        // the original IP address of the client connecting to the first
        // proxy.  However, the end user can easily spoof the header, in
        // which case the first value(s) will be the fake IP address from
        // the user pretending to be a proxy reporting the original IP
        // address value.  By counting HTTP_FORWARDED_COUNT back from the
        // end of the list, we ensure that we get the IP address being
        // reported by *our* first proxy.

        if (httpForwardedCount < 0 || httpForwardedCount !== forwardedFor.length) return null;
        forwardedFor = forwardedFor.map(ip => ip.trim());
        return forwardedFor[forwardedFor.length - httpForwardedCount];
      }
    });

    /******************************************************************************/
    /* Subscription                                                               */
    /******************************************************************************/

    // Ctor for a sub handle: the input to each publish function

    // Instance name is this because it's usually referred to as this inside a
    // publish
    /**
     * @summary The server's side of a subscription
     * @class Subscription
     * @instanceName this
     * @showInstanceName true
     */
    var Subscription = function (session, handler, subscriptionId, params, name) {
      var self = this;
      self._session = session; // type is Session

      /**
       * @summary Access inside the publish function. The incoming [connection](#meteor_onconnection) for this subscription.
       * @locus Server
       * @name  connection
       * @memberOf Subscription
       * @instance
       */
      self.connection = session.connectionHandle; // public API object

      self._handler = handler;

      // My subscription ID (generated by client, undefined for universal subs).
      self._subscriptionId = subscriptionId;
      // Undefined for universal subs
      self._name = name;
      self._params = params || [];

      // Only named subscriptions have IDs, but we need some sort of string
      // internally to keep track of all subscriptions inside
      // SessionDocumentViews. We use this subscriptionHandle for that.
      if (self._subscriptionId) {
        self._subscriptionHandle = 'N' + self._subscriptionId;
      } else {
        self._subscriptionHandle = 'U' + Random.id();
      }

      // Has _deactivate been called?
      self._deactivated = false;

      // Stop callbacks to g/c this sub.  called w/ zero arguments.
      self._stopCallbacks = [];

      // The set of (collection, documentid) that this subscription has
      // an opinion about.
      self._documents = new Map();

      // Remember if we are ready.
      self._ready = false;

      // Part of the public API: the user of this sub.

      /**
       * @summary Access inside the publish function. The id of the logged-in user, or `null` if no user is logged in.
       * @locus Server
       * @memberOf Subscription
       * @name  userId
       * @instance
       */
      self.userId = session.userId;

      // For now, the id filter is going to default to
      // the to/from DDP methods on MongoID, to
      // specifically deal with mongo/minimongo ObjectIds.

      // Later, you will be able to make this be "raw"
      // if you want to publish a collection that you know
      // just has strings for keys and no funny business, to
      // a DDP consumer that isn't minimongo.

      self._idFilter = {
        idStringify: MongoID.idStringify,
        idParse: MongoID.idParse
      };
      Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("livedata", "subscriptions", 1);
    };
    Object.assign(Subscription.prototype, {
      _runHandler: async function () {
        // XXX should we unblock() here? Either before running the publish
        // function, or before running _publishCursor.
        //
        // Right now, each publish function blocks all future publishes and
        // methods waiting on data from Mongo (or whatever else the function
        // blocks on). This probably slows page load in common cases.

        if (!this.unblock) {
          this.unblock = () => {};
        }
        const self = this;
        let resultOrThenable = null;
        try {
          resultOrThenable = DDP._CurrentPublicationInvocation.withValue(self, () => maybeAuditArgumentChecks(self._handler, self, EJSON.clone(self._params),
          // It's OK that this would look weird for universal subscriptions,
          // because they have no arguments so there can never be an
          // audit-argument-checks failure.
          "publisher '" + self._name + "'"), {
            name: self._name
          });
        } catch (e) {
          self.error(e);
          return;
        }

        // Did the handler call this.error or this.stop?
        if (self._isDeactivated()) return;

        // Both conventional and async publish handler functions are supported.
        // If an object is returned with a then() function, it is either a promise
        // or thenable and will be resolved asynchronously.
        const isThenable = resultOrThenable && typeof resultOrThenable.then === 'function';
        if (isThenable) {
          try {
            await self._publishHandlerResult(await resultOrThenable);
          } catch (e) {
            self.error(e);
          }
        } else {
          await self._publishHandlerResult(resultOrThenable);
        }
      },
      async _publishHandlerResult(res) {
        // SPECIAL CASE: Instead of writing their own callbacks that invoke
        // this.added/changed/ready/etc, the user can just return a collection
        // cursor or array of cursors from the publish function; we call their
        // _publishCursor method which starts observing the cursor and publishes the
        // results. Note that _publishCursor does NOT call ready().
        //
        // XXX This uses an undocumented interface which only the Mongo cursor
        // interface publishes. Should we make this interface public and encourage
        // users to implement it themselves? Arguably, it's unnecessary; users can
        // already write their own functions like
        //   var publishMyReactiveThingy = function (name, handler) {
        //     Meteor.publish(name, function () {
        //       var reactiveThingy = handler();
        //       reactiveThingy.publishMe();
        //     });
        //   };

        var self = this;
        var isCursor = function (c) {
          return c && c._publishCursor;
        };
        if (isCursor(res)) {
          try {
            await res._publishCursor(self);
          } catch (e) {
            self.error(e);
            return;
          }
          // _publishCursor only returns after the initial added callbacks have run.
          // mark subscription as ready.
          self.ready();
        } else if (Array.isArray(res)) {
          // Check all the elements are cursors
          if (!res.every(isCursor)) {
            self.error(new Error("Publish function returned an array of non-Cursors"));
            return;
          }
          // Find duplicate collection names
          // XXX we should support overlapping cursors, but that would require the
          // merge box to allow overlap within a subscription
          var collectionNames = {};
          for (var i = 0; i < res.length; ++i) {
            var collectionName = res[i]._getCollectionName();
            if (collectionNames[collectionName]) {
              self.error(new Error("Publish function returned multiple cursors for collection " + collectionName));
              return;
            }
            collectionNames[collectionName] = true;
          }
          try {
            await Promise.all(res.map(cur => cur._publishCursor(self)));
          } catch (e) {
            self.error(e);
            return;
          }
          self.ready();
        } else if (res) {
          // Truthy values other than cursors or arrays are probably a
          // user mistake (possible returning a Mongo document via, say,
          // `coll.findOne()`).
          self.error(new Error("Publish function can only return a Cursor or " + "an array of Cursors"));
        }
      },
      // This calls all stop callbacks and prevents the handler from updating any
      // SessionCollectionViews further. It's used when the user unsubscribes or
      // disconnects, as well as during setUserId re-runs. It does *NOT* send
      // removed messages for the published objects; if that is necessary, call
      // _removeAllDocuments first.
      _deactivate: function () {
        var self = this;
        if (self._deactivated) return;
        self._deactivated = true;
        self._callStopCallbacks();
        Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("livedata", "subscriptions", -1);
      },
      _callStopCallbacks: function () {
        var self = this;
        // Tell listeners, so they can clean up
        var callbacks = self._stopCallbacks;
        self._stopCallbacks = [];
        callbacks.forEach(function (callback) {
          callback();
        });
      },
      // Send remove messages for every document.
      _removeAllDocuments: function () {
        var self = this;
        Meteor._noYieldsAllowed(function () {
          self._documents.forEach(function (collectionDocs, collectionName) {
            collectionDocs.forEach(function (strId) {
              self.removed(collectionName, self._idFilter.idParse(strId));
            });
          });
        });
      },
      // Returns a new Subscription for the same session with the same
      // initial creation parameters. This isn't a clone: it doesn't have
      // the same _documents cache, stopped state or callbacks; may have a
      // different _subscriptionHandle, and gets its userId from the
      // session, not from this object.
      _recreate: function () {
        var self = this;
        return new Subscription(self._session, self._handler, self._subscriptionId, self._params, self._name);
      },
      /**
       * @summary Call inside the publish function.  Stops this client's subscription, triggering a call on the client to the `onStop` callback passed to [`Meteor.subscribe`](#meteor_subscribe), if any. If `error` is not a [`Meteor.Error`](#meteor_error), it will be [sanitized](#meteor_error).
       * @locus Server
       * @param {Error} error The error to pass to the client.
       * @instance
       * @memberOf Subscription
       */
      error: function (error) {
        var self = this;
        if (self._isDeactivated()) return;
        self._session._stopSubscription(self._subscriptionId, error);
      },
      // Note that while our DDP client will notice that you've called stop() on the
      // server (and clean up its _subscriptions table) we don't actually provide a
      // mechanism for an app to notice this (the subscribe onError callback only
      // triggers if there is an error).

      /**
       * @summary Call inside the publish function.  Stops this client's subscription and invokes the client's `onStop` callback with no error.
       * @locus Server
       * @instance
       * @memberOf Subscription
       */
      stop: function () {
        var self = this;
        if (self._isDeactivated()) return;
        self._session._stopSubscription(self._subscriptionId);
      },
      /**
       * @summary Call inside the publish function.  Registers a callback function to run when the subscription is stopped.
       * @locus Server
       * @memberOf Subscription
       * @instance
       * @param {Function} func The callback function
       */
      onStop: function (callback) {
        var self = this;
        callback = Meteor.bindEnvironment(callback, 'onStop callback', self);
        if (self._isDeactivated()) callback();else self._stopCallbacks.push(callback);
      },
      // This returns true if the sub has been deactivated, *OR* if the session was
      // destroyed but the deferred call to _deactivateAllSubscriptions hasn't
      // happened yet.
      _isDeactivated: function () {
        var self = this;
        return self._deactivated || self._session.inQueue === null;
      },
      /**
       * @summary Call inside the publish function.  Informs the subscriber that a document has been added to the record set.
       * @locus Server
       * @memberOf Subscription
       * @instance
       * @param {String} collection The name of the collection that contains the new document.
       * @param {String} id The new document's ID.
       * @param {Object} fields The fields in the new document.  If `_id` is present it is ignored.
       */
      added(collectionName, id, fields) {
        if (this._isDeactivated()) return;
        id = this._idFilter.idStringify(id);
        if (this._session.server.getPublicationStrategy(collectionName).doAccountingForCollection) {
          let ids = this._documents.get(collectionName);
          if (ids == null) {
            ids = new Set();
            this._documents.set(collectionName, ids);
          }
          ids.add(id);
        }
        this._session.added(this._subscriptionHandle, collectionName, id, fields);
      },
      /**
       * @summary Call inside the publish function.  Informs the subscriber that a document in the record set has been modified.
       * @locus Server
       * @memberOf Subscription
       * @instance
       * @param {String} collection The name of the collection that contains the changed document.
       * @param {String} id The changed document's ID.
       * @param {Object} fields The fields in the document that have changed, together with their new values.  If a field is not present in `fields` it was left unchanged; if it is present in `fields` and has a value of `undefined` it was removed from the document.  If `_id` is present it is ignored.
       */
      changed(collectionName, id, fields) {
        if (this._isDeactivated()) return;
        id = this._idFilter.idStringify(id);
        this._session.changed(this._subscriptionHandle, collectionName, id, fields);
      },
      /**
       * @summary Call inside the publish function.  Informs the subscriber that a document has been removed from the record set.
       * @locus Server
       * @memberOf Subscription
       * @instance
       * @param {String} collection The name of the collection that the document has been removed from.
       * @param {String} id The ID of the document that has been removed.
       */
      removed(collectionName, id) {
        if (this._isDeactivated()) return;
        id = this._idFilter.idStringify(id);
        if (this._session.server.getPublicationStrategy(collectionName).doAccountingForCollection) {
          // We don't bother to delete sets of things in a collection if the
          // collection is empty.  It could break _removeAllDocuments.
          this._documents.get(collectionName).delete(id);
        }
        this._session.removed(this._subscriptionHandle, collectionName, id);
      },
      /**
       * @summary Call inside the publish function.  Informs the subscriber that an initial, complete snapshot of the record set has been sent.  This will trigger a call on the client to the `onReady` callback passed to  [`Meteor.subscribe`](#meteor_subscribe), if any.
       * @locus Server
       * @memberOf Subscription
       * @instance
       */
      ready: function () {
        var self = this;
        if (self._isDeactivated()) return;
        if (!self._subscriptionId) return; // Unnecessary but ignored for universal sub
        if (!self._ready) {
          self._session.sendReady([self._subscriptionId]);
          self._ready = true;
        }
      }
    });

    /******************************************************************************/
    /* Server                                                                     */
    /******************************************************************************/

    Server = function () {
      let options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
      var self = this;

      // The default heartbeat interval is 30 seconds on the server and 35
      // seconds on the client.  Since the client doesn't need to send a
      // ping as long as it is receiving pings, this means that pings
      // normally go from the server to the client.
      //
      // Note: Troposphere depends on the ability to mutate
      // Meteor.server.options.heartbeatTimeout! This is a hack, but it's life.
      self.options = _objectSpread({
        heartbeatInterval: 15000,
        heartbeatTimeout: 15000,
        // For testing, allow responding to pings to be disabled.
        respondToPings: true,
        defaultPublicationStrategy: publicationStrategies.SERVER_MERGE
      }, options);

      // Map of callbacks to call when a new connection comes in to the
      // server and completes DDP version negotiation. Use an object instead
      // of an array so we can safely remove one from the list while
      // iterating over it.
      self.onConnectionHook = new Hook({
        debugPrintExceptions: "onConnection callback"
      });

      // Map of callbacks to call when a new message comes in.
      self.onMessageHook = new Hook({
        debugPrintExceptions: "onMessage callback"
      });
      self.publish_handlers = {};
      self.universal_publish_handlers = [];
      self.method_handlers = {};
      self._publicationStrategies = {};
      self.sessions = new Map(); // map from id to session

      self.stream_server = new StreamServer();
      self.stream_server.register(function (socket) {
        // socket implements the SockJSConnection interface
        socket._meteorSession = null;
        var sendError = function (reason, offendingMessage) {
          var msg = {
            msg: 'error',
            reason: reason
          };
          if (offendingMessage) msg.offendingMessage = offendingMessage;
          socket.send(DDPCommon.stringifyDDP(msg));
        };
        socket.on('data', function (raw_msg) {
          if (Meteor._printReceivedDDP) {
            Meteor._debug("Received DDP", raw_msg);
          }
          try {
            try {
              var msg = DDPCommon.parseDDP(raw_msg);
            } catch (err) {
              sendError('Parse error');
              return;
            }
            if (msg === null || !msg.msg) {
              sendError('Bad request', msg);
              return;
            }
            if (msg.msg === 'connect') {
              if (socket._meteorSession) {
                sendError("Already connected", msg);
                return;
              }
              self._handleConnect(socket, msg);
              return;
            }
            if (!socket._meteorSession) {
              sendError('Must connect first', msg);
              return;
            }
            socket._meteorSession.processMessage(msg);
          } catch (e) {
            // XXX print stack nicely
            Meteor._debug("Internal exception while processing message", msg, e);
          }
        });
        socket.on('close', function () {
          if (socket._meteorSession) {
            socket._meteorSession.close();
          }
        });
      });
    };
    Object.assign(Server.prototype, {
      /**
       * @summary Register a callback to be called when a new DDP connection is made to the server.
       * @locus Server
       * @param {function} callback The function to call when a new DDP connection is established.
       * @memberOf Meteor
       * @importFromPackage meteor
       */
      onConnection: function (fn) {
        var self = this;
        return self.onConnectionHook.register(fn);
      },
      /**
       * @summary Set publication strategy for the given collection. Publications strategies are available from `DDPServer.publicationStrategies`. You call this method from `Meteor.server`, like `Meteor.server.setPublicationStrategy()`
       * @locus Server
       * @alias setPublicationStrategy
       * @param collectionName {String}
       * @param strategy {{useCollectionView: boolean, doAccountingForCollection: boolean}}
       * @memberOf Meteor.server
       * @importFromPackage meteor
       */
      setPublicationStrategy(collectionName, strategy) {
        if (!Object.values(publicationStrategies).includes(strategy)) {
          throw new Error("Invalid merge strategy: ".concat(strategy, " \n        for collection ").concat(collectionName));
        }
        this._publicationStrategies[collectionName] = strategy;
      },
      /**
       * @summary Gets the publication strategy for the requested collection. You call this method from `Meteor.server`, like `Meteor.server.getPublicationStrategy()`
       * @locus Server
       * @alias getPublicationStrategy
       * @param collectionName {String}
       * @memberOf Meteor.server
       * @importFromPackage meteor
       * @return {{useCollectionView: boolean, doAccountingForCollection: boolean}}
       */
      getPublicationStrategy(collectionName) {
        return this._publicationStrategies[collectionName] || this.options.defaultPublicationStrategy;
      },
      /**
       * @summary Register a callback to be called when a new DDP message is received.
       * @locus Server
       * @param {function} callback The function to call when a new DDP message is received.
       * @memberOf Meteor
       * @importFromPackage meteor
       */
      onMessage: function (fn) {
        var self = this;
        return self.onMessageHook.register(fn);
      },
      _handleConnect: function (socket, msg) {
        var self = this;

        // The connect message must specify a version and an array of supported
        // versions, and it must claim to support what it is proposing.
        if (!(typeof msg.version === 'string' && Array.isArray(msg.support) && msg.support.every(isString) && msg.support.includes(msg.version))) {
          socket.send(DDPCommon.stringifyDDP({
            msg: 'failed',
            version: DDPCommon.SUPPORTED_DDP_VERSIONS[0]
          }));
          socket.close();
          return;
        }

        // In the future, handle session resumption: something like:
        //  socket._meteorSession = self.sessions[msg.session]
        var version = calculateVersion(msg.support, DDPCommon.SUPPORTED_DDP_VERSIONS);
        if (msg.version !== version) {
          // The best version to use (according to the client's stated preferences)
          // is not the one the client is trying to use. Inform them about the best
          // version to use.
          socket.send(DDPCommon.stringifyDDP({
            msg: 'failed',
            version: version
          }));
          socket.close();
          return;
        }

        // Yay, version matches! Create a new session.
        // Note: Troposphere depends on the ability to mutate
        // Meteor.server.options.heartbeatTimeout! This is a hack, but it's life.
        socket._meteorSession = new Session(self, version, socket, self.options);
        self.sessions.set(socket._meteorSession.id, socket._meteorSession);
        self.onConnectionHook.each(function (callback) {
          if (socket._meteorSession) callback(socket._meteorSession.connectionHandle);
          return true;
        });
      },
      /**
       * Register a publish handler function.
       *
       * @param name {String} identifier for query
       * @param handler {Function} publish handler
       * @param options {Object}
       *
       * Server will call handler function on each new subscription,
       * either when receiving DDP sub message for a named subscription, or on
       * DDP connect for a universal subscription.
       *
       * If name is null, this will be a subscription that is
       * automatically established and permanently on for all connected
       * client, instead of a subscription that can be turned on and off
       * with subscribe().
       *
       * options to contain:
       *  - (mostly internal) is_auto: true if generated automatically
       *    from an autopublish hook. this is for cosmetic purposes only
       *    (it lets us determine whether to print a warning suggesting
       *    that you turn off autopublish).
       */

      /**
       * @summary Publish a record set.
       * @memberOf Meteor
       * @importFromPackage meteor
       * @locus Server
       * @param {String|Object} name If String, name of the record set.  If Object, publications Dictionary of publish functions by name.  If `null`, the set has no name, and the record set is automatically sent to all connected clients.
       * @param {Function} func Function called on the server each time a client subscribes.  Inside the function, `this` is the publish handler object, described below.  If the client passed arguments to `subscribe`, the function is called with the same arguments.
       */
      publish: function (name, handler, options) {
        var self = this;
        if (!isObject(name)) {
          options = options || {};
          if (name && name in self.publish_handlers) {
            Meteor._debug("Ignoring duplicate publish named '" + name + "'");
            return;
          }
          if (Package.autopublish && !options.is_auto) {
            // They have autopublish on, yet they're trying to manually
            // pick stuff to publish. They probably should turn off
            // autopublish. (This check isn't perfect -- if you create a
            // publish before you turn on autopublish, it won't catch
            // it, but this will definitely handle the simple case where
            // you've added the autopublish package to your app, and are
            // calling publish from your app code).
            if (!self.warned_about_autopublish) {
              self.warned_about_autopublish = true;
              Meteor._debug("** You've set up some data subscriptions with Meteor.publish(), but\n" + "** you still have autopublish turned on. Because autopublish is still\n" + "** on, your Meteor.publish() calls won't have much effect. All data\n" + "** will still be sent to all clients.\n" + "**\n" + "** Turn off autopublish by removing the autopublish package:\n" + "**\n" + "**   $ meteor remove autopublish\n" + "**\n" + "** .. and make sure you have Meteor.publish() and Meteor.subscribe() calls\n" + "** for each collection that you want clients to see.\n");
            }
          }
          if (name) self.publish_handlers[name] = handler;else {
            self.universal_publish_handlers.push(handler);
            // Spin up the new publisher on any existing session too. Run each
            // session's subscription in a new Fiber, so that there's no change for
            // self.sessions to change while we're running this loop.
            self.sessions.forEach(function (session) {
              if (!session._dontStartNewUniversalSubs) {
                session._startSubscription(handler);
              }
            });
          }
        } else {
          Object.entries(name).forEach(function (_ref2) {
            let [key, value] = _ref2;
            self.publish(key, value, {});
          });
        }
      },
      _removeSession: function (session) {
        var self = this;
        self.sessions.delete(session.id);
      },
      /**
       * @summary Tells if the method call came from a call or a callAsync.
       * @locus Anywhere
       * @memberOf Meteor
       * @importFromPackage meteor
       * @returns boolean
       */
      isAsyncCall: function () {
        return DDP._CurrentMethodInvocation._isCallAsyncMethodRunning();
      },
      /**
       * @summary Defines functions that can be invoked over the network by clients.
       * @locus Anywhere
       * @param {Object} methods Dictionary whose keys are method names and values are functions.
       * @memberOf Meteor
       * @importFromPackage meteor
       */
      methods: function (methods) {
        var self = this;
        Object.entries(methods).forEach(function (_ref3) {
          let [name, func] = _ref3;
          if (typeof func !== 'function') throw new Error("Method '" + name + "' must be a function");
          if (self.method_handlers[name]) throw new Error("A method named '" + name + "' is already defined");
          self.method_handlers[name] = func;
        });
      },
      call: function (name) {
        for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
          args[_key - 1] = arguments[_key];
        }
        if (args.length && typeof args[args.length - 1] === "function") {
          // If it's a function, the last argument is the result callback, not
          // a parameter to the remote method.
          var callback = args.pop();
        }
        return this.apply(name, args, callback);
      },
      // A version of the call method that always returns a Promise.
      callAsync: function (name) {
        var _args$;
        for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
          args[_key2 - 1] = arguments[_key2];
        }
        const options = (_args$ = args[0]) !== null && _args$ !== void 0 && _args$.hasOwnProperty('returnStubValue') ? args.shift() : {};
        DDP._CurrentMethodInvocation._setCallAsyncMethodRunning(true);
        const promise = new Promise((resolve, reject) => {
          DDP._CurrentCallAsyncInvocation._set({
            name,
            hasCallAsyncParent: true
          });
          this.applyAsync(name, args, _objectSpread({
            isFromCallAsync: true
          }, options)).then(resolve).catch(reject).finally(() => {
            DDP._CurrentCallAsyncInvocation._set();
          });
        });
        return promise.finally(() => DDP._CurrentMethodInvocation._setCallAsyncMethodRunning(false));
      },
      apply: function (name, args, options, callback) {
        // We were passed 3 arguments. They may be either (name, args, options)
        // or (name, args, callback)
        if (!callback && typeof options === 'function') {
          callback = options;
          options = {};
        } else {
          options = options || {};
        }
        const promise = this.applyAsync(name, args, options);

        // Return the result in whichever way the caller asked for it. Note that we
        // do NOT block on the write fence in an analogous way to how the client
        // blocks on the relevant data being visible, so you are NOT guaranteed that
        // cursor observe callbacks have fired when your callback is invoked. (We
        // can change this if there's a real use case).
        if (callback) {
          promise.then(result => callback(undefined, result), exception => callback(exception));
        } else {
          return promise;
        }
      },
      // @param options {Optional Object}
      applyAsync: function (name, args, options) {
        // Run the handler
        var handler = this.method_handlers[name];
        if (!handler) {
          return Promise.reject(new Meteor.Error(404, "Method '".concat(name, "' not found")));
        }
        // If this is a method call from within another method or publish function,
        // get the user state from the outer method or publish function, otherwise
        // don't allow setUserId to be called
        var userId = null;
        let setUserId = () => {
          throw new Error("Can't call setUserId on a server initiated method call");
        };
        var connection = null;
        var currentMethodInvocation = DDP._CurrentMethodInvocation.get();
        var currentPublicationInvocation = DDP._CurrentPublicationInvocation.get();
        var randomSeed = null;
        if (currentMethodInvocation) {
          userId = currentMethodInvocation.userId;
          setUserId = userId => currentMethodInvocation.setUserId(userId);
          connection = currentMethodInvocation.connection;
          randomSeed = DDPCommon.makeRpcSeed(currentMethodInvocation, name);
        } else if (currentPublicationInvocation) {
          userId = currentPublicationInvocation.userId;
          setUserId = userId => currentPublicationInvocation._session._setUserId(userId);
          connection = currentPublicationInvocation.connection;
        }
        var invocation = new DDPCommon.MethodInvocation({
          isSimulation: false,
          userId,
          setUserId,
          connection,
          randomSeed
        });
        return new Promise((resolve, reject) => {
          let result;
          try {
            result = DDP._CurrentMethodInvocation.withValue(invocation, () => maybeAuditArgumentChecks(handler, invocation, EJSON.clone(args), "internal call to '" + name + "'"));
          } catch (e) {
            return reject(e);
          }
          if (!Meteor._isPromise(result)) {
            return resolve(result);
          }
          result.then(r => resolve(r)).catch(reject);
        }).then(EJSON.clone);
      },
      _urlForSession: function (sessionId) {
        var self = this;
        var session = self.sessions.get(sessionId);
        if (session) return session._socketUrl;else return null;
      }
    });
    var calculateVersion = function (clientSupportedVersions, serverSupportedVersions) {
      var correctVersion = clientSupportedVersions.find(function (version) {
        return serverSupportedVersions.includes(version);
      });
      if (!correctVersion) {
        correctVersion = serverSupportedVersions[0];
      }
      return correctVersion;
    };
    DDPServer._calculateVersion = calculateVersion;

    // "blind" exceptions other than those that were deliberately thrown to signal
    // errors to the client
    var wrapInternalException = function (exception, context) {
      if (!exception) return exception;

      // To allow packages to throw errors intended for the client but not have to
      // depend on the Meteor.Error class, `isClientSafe` can be set to true on any
      // error before it is thrown.
      if (exception.isClientSafe) {
        if (!(exception instanceof Meteor.Error)) {
          const originalMessage = exception.message;
          exception = new Meteor.Error(exception.error, exception.reason, exception.details);
          exception.message = originalMessage;
        }
        return exception;
      }

      // Tests can set the '_expectedByTest' flag on an exception so it won't go to
      // the server log.
      if (!exception._expectedByTest) {
        Meteor._debug("Exception " + context, exception.stack);
        if (exception.sanitizedError) {
          Meteor._debug("Sanitized and reported to the client as:", exception.sanitizedError);
          Meteor._debug();
        }
      }

      // Did the error contain more details that could have been useful if caught in
      // server code (or if thrown from non-client-originated code), but also
      // provided a "sanitized" version with more context than 500 Internal server error? Use that.
      if (exception.sanitizedError) {
        if (exception.sanitizedError.isClientSafe) return exception.sanitizedError;
        Meteor._debug("Exception " + context + " provides a sanitizedError that " + "does not have isClientSafe property set; ignoring");
      }
      return new Meteor.Error(500, "Internal server error");
    };

    // Audit argument checks, if the audit-argument-checks package exists (it is a
    // weak dependency of this package).
    var maybeAuditArgumentChecks = function (f, context, args, description) {
      args = args || [];
      if (Package['audit-argument-checks']) {
        return Match._failIfArgumentsAreNotAllChecked(f, context, args, description);
      }
      return f.apply(context, args);
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

},"writefence.js":function module(){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/ddp-server/writefence.js                                                                                   //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
DDPServer._WriteFence = class {
  constructor() {
    this.armed = false;
    this.fired = false;
    this.retired = false;
    this.outstanding_writes = 0;
    this.before_fire_callbacks = [];
    this.completion_callbacks = [];
  }
  beginWrite() {
    if (this.retired) {
      return {
        committed: () => {}
      };
    }
    if (this.fired) {
      throw new Error("fence has already activated -- too late to add writes");
    }
    this.outstanding_writes++;
    let committed = false;
    return {
      committed: async () => {
        if (committed) {
          throw new Error("committed called twice on the same write");
        }
        committed = true;
        this.outstanding_writes--;
        await this._maybeFire();
      }
    };
  }
  arm() {
    if (this === DDPServer._getCurrentFence()) {
      throw Error("Can't arm the current fence");
    }
    this.armed = true;
    return this._maybeFire();
  }
  onBeforeFire(func) {
    if (this.fired) {
      throw new Error("fence has already activated -- too late to add a callback");
    }
    this.before_fire_callbacks.push(func);
  }
  onAllCommitted(func) {
    if (this.fired) {
      throw new Error("fence has already activated -- too late to add a callback");
    }
    this.completion_callbacks.push(func);
  }
  async _armAndWait() {
    let resolver;
    const returnValue = new Promise(r => resolver = r);
    this.onAllCommitted(resolver);
    await this.arm();
    return returnValue;
  }
  armAndWait() {
    return this._armAndWait();
  }
  async _maybeFire() {
    if (this.fired) {
      throw new Error("write fence already activated?");
    }
    if (!this.armed || this.outstanding_writes > 0) {
      return;
    }
    const invokeCallback = async func => {
      try {
        await func(this);
      } catch (err) {
        Meteor._debug("exception in write fence callback:", err);
      }
    };
    this.outstanding_writes++;

    // Process all before_fire callbacks in parallel
    const beforeCallbacks = [...this.before_fire_callbacks];
    this.before_fire_callbacks = [];
    await Promise.all(beforeCallbacks.map(cb => invokeCallback(cb)));
    this.outstanding_writes--;
    if (this.outstanding_writes === 0) {
      this.fired = true;
      // Process all completion callbacks in parallel
      const callbacks = [...this.completion_callbacks];
      this.completion_callbacks = [];
      await Promise.all(callbacks.map(cb => invokeCallback(cb)));
    }
  }
  retire() {
    if (!this.fired) {
      throw new Error("Can't retire a fence that hasn't fired.");
    }
    this.retired = true;
  }
};
DDPServer._CurrentWriteFence = new Meteor.EnvironmentVariable();
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"crossbar.js":function module(){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/ddp-server/crossbar.js                                                                                     //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
// A "crossbar" is a class that provides structured notification registration.
// See _match for the definition of how a notification matches a trigger.
// All notifications and triggers must have a string key named 'collection'.

DDPServer._Crossbar = function (options) {
  var self = this;
  options = options || {};
  self.nextId = 1;
  // map from collection name (string) -> listener id -> object. each object has
  // keys 'trigger', 'callback'.  As a hack, the empty string means "no
  // collection".
  self.listenersByCollection = {};
  self.listenersByCollectionCount = {};
  self.factPackage = options.factPackage || "livedata";
  self.factName = options.factName || null;
};
Object.assign(DDPServer._Crossbar.prototype, {
  // msg is a trigger or a notification
  _collectionForMessage: function (msg) {
    var self = this;
    if (!('collection' in msg)) {
      return '';
    } else if (typeof msg.collection === 'string') {
      if (msg.collection === '') throw Error("Message has empty collection!");
      return msg.collection;
    } else {
      throw Error("Message has non-string collection!");
    }
  },
  // Listen for notification that match 'trigger'. A notification
  // matches if it has the key-value pairs in trigger as a
  // subset. When a notification matches, call 'callback', passing
  // the actual notification.
  //
  // Returns a listen handle, which is an object with a method
  // stop(). Call stop() to stop listening.
  //
  // XXX It should be legal to call fire() from inside a listen()
  // callback?
  listen: function (trigger, callback) {
    var self = this;
    var id = self.nextId++;
    var collection = self._collectionForMessage(trigger);
    var record = {
      trigger: EJSON.clone(trigger),
      callback: callback
    };
    if (!(collection in self.listenersByCollection)) {
      self.listenersByCollection[collection] = {};
      self.listenersByCollectionCount[collection] = 0;
    }
    self.listenersByCollection[collection][id] = record;
    self.listenersByCollectionCount[collection]++;
    if (self.factName && Package['facts-base']) {
      Package['facts-base'].Facts.incrementServerFact(self.factPackage, self.factName, 1);
    }
    return {
      stop: function () {
        if (self.factName && Package['facts-base']) {
          Package['facts-base'].Facts.incrementServerFact(self.factPackage, self.factName, -1);
        }
        delete self.listenersByCollection[collection][id];
        self.listenersByCollectionCount[collection]--;
        if (self.listenersByCollectionCount[collection] === 0) {
          delete self.listenersByCollection[collection];
          delete self.listenersByCollectionCount[collection];
        }
      }
    };
  },
  // Fire the provided 'notification' (an object whose attribute
  // values are all JSON-compatibile) -- inform all matching listeners
  // (registered with listen()).
  //
  // If fire() is called inside a write fence, then each of the
  // listener callbacks will be called inside the write fence as well.
  //
  // The listeners may be invoked in parallel, rather than serially.
  fire: async function (notification) {
    var self = this;
    var collection = self._collectionForMessage(notification);
    if (!(collection in self.listenersByCollection)) {
      return;
    }
    var listenersForCollection = self.listenersByCollection[collection];
    var callbackIds = [];
    Object.entries(listenersForCollection).forEach(function (_ref) {
      let [id, l] = _ref;
      if (self._matches(notification, l.trigger)) {
        callbackIds.push(id);
      }
    });

    // Listener callbacks can yield, so we need to first find all the ones that
    // match in a single iteration over self.listenersByCollection (which can't
    // be mutated during this iteration), and then invoke the matching
    // callbacks, checking before each call to ensure they haven't stopped.
    // Note that we don't have to check that
    // self.listenersByCollection[collection] still === listenersForCollection,
    // because the only way that stops being true is if listenersForCollection
    // first gets reduced down to the empty object (and then never gets
    // increased again).
    for (const id of callbackIds) {
      if (id in listenersForCollection) {
        await listenersForCollection[id].callback(notification);
      }
    }
  },
  // A notification matches a trigger if all keys that exist in both are equal.
  //
  // Examples:
  //  N:{collection: "C"} matches T:{collection: "C"}
  //    (a non-targeted write to a collection matches a
  //     non-targeted query)
  //  N:{collection: "C", id: "X"} matches T:{collection: "C"}
  //    (a targeted write to a collection matches a non-targeted query)
  //  N:{collection: "C"} matches T:{collection: "C", id: "X"}
  //    (a non-targeted write to a collection matches a
  //     targeted query)
  //  N:{collection: "C", id: "X"} matches T:{collection: "C", id: "X"}
  //    (a targeted write to a collection matches a targeted query targeted
  //     at the same document)
  //  N:{collection: "C", id: "X"} does not match T:{collection: "C", id: "Y"}
  //    (a targeted write to a collection does not match a targeted query
  //     targeted at a different document)
  _matches: function (notification, trigger) {
    // Most notifications that use the crossbar have a string `collection` and
    // maybe an `id` that is a string or ObjectID. We're already dividing up
    // triggers by collection, but let's fast-track "nope, different ID" (and
    // avoid the overly generic EJSON.equals). This makes a noticeable
    // performance difference; see https://github.com/meteor/meteor/pull/3697
    if (typeof notification.id === 'string' && typeof trigger.id === 'string' && notification.id !== trigger.id) {
      return false;
    }
    if (notification.id instanceof MongoID.ObjectID && trigger.id instanceof MongoID.ObjectID && !notification.id.equals(trigger.id)) {
      return false;
    }
    return Object.keys(trigger).every(function (key) {
      return !(key in notification) || EJSON.equals(trigger[key], notification[key]);
    });
  }
});

// The "invalidation crossbar" is a specific instance used by the DDP server to
// implement write fence notifications. Listener callbacks on this crossbar
// should call beginWrite on the current write fence before they return, if they
// want to delay the write fence from firing (ie, the DDP method-data-updated
// message from being sent).
DDPServer._InvalidationCrossbar = new DDPServer._Crossbar({
  factName: "invalidation-crossbar-listeners"
});
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"server_convenience.js":function module(){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/ddp-server/server_convenience.js                                                                           //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
if (process.env.DDP_DEFAULT_CONNECTION_URL) {
  __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL = process.env.DDP_DEFAULT_CONNECTION_URL;
}
Meteor.server = new Server();
Meteor.refresh = async function (notification) {
  await DDPServer._InvalidationCrossbar.fire(notification);
};

// Proxy the public methods of Meteor.server so they can
// be called directly on Meteor.

['publish', 'isAsyncCall', 'methods', 'call', 'callAsync', 'apply', 'applyAsync', 'onConnection', 'onMessage'].forEach(function (name) {
  Meteor[name] = Meteor.server[name].bind(Meteor.server);
});
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"dummy_document_view.ts":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/ddp-server/dummy_document_view.ts                                                                          //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.export({
  DummyDocumentView: () => DummyDocumentView
});
class DummyDocumentView {
  constructor() {
    this.existsIn = void 0;
    this.dataByKey = void 0;
    this.existsIn = new Set(); // set of subscriptionHandle
    this.dataByKey = new Map(); // key-> [ {subscriptionHandle, value} by precedence]
  }
  getFields() {
    return {};
  }
  clearField(subscriptionHandle, key, changeCollector) {
    changeCollector[key] = undefined;
  }
  changeField(subscriptionHandle, key, value, changeCollector, isAdd) {
    changeCollector[key] = value;
  }
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"session_collection_view.ts":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/ddp-server/session_collection_view.ts                                                                      //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      SessionCollectionView: () => SessionCollectionView
    });
    let DummyDocumentView;
    module.link("./dummy_document_view", {
      DummyDocumentView(v) {
        DummyDocumentView = v;
      }
    }, 0);
    let SessionDocumentView;
    module.link("./session_document_view", {
      SessionDocumentView(v) {
        SessionDocumentView = v;
      }
    }, 1);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    class SessionCollectionView {
      /**
       * Represents a client's view of a single collection
       * @param collectionName - Name of the collection it represents
       * @param sessionCallbacks - The callbacks for added, changed, removed
       */
      constructor(collectionName, sessionCallbacks) {
        this.collectionName = void 0;
        this.documents = void 0;
        this.callbacks = void 0;
        this.collectionName = collectionName;
        this.documents = new Map();
        this.callbacks = sessionCallbacks;
      }
      isEmpty() {
        return this.documents.size === 0;
      }
      diff(previous) {
        DiffSequence.diffMaps(previous.documents, this.documents, {
          both: this.diffDocument.bind(this),
          rightOnly: (id, nowDV) => {
            this.callbacks.added(this.collectionName, id, nowDV.getFields());
          },
          leftOnly: (id, prevDV) => {
            this.callbacks.removed(this.collectionName, id);
          }
        });
      }
      diffDocument(id, prevDV, nowDV) {
        const fields = {};
        DiffSequence.diffObjects(prevDV.getFields(), nowDV.getFields(), {
          both: (key, prev, now) => {
            if (!EJSON.equals(prev, now)) {
              fields[key] = now;
            }
          },
          rightOnly: (key, now) => {
            fields[key] = now;
          },
          leftOnly: (key, prev) => {
            fields[key] = undefined;
          }
        });
        this.callbacks.changed(this.collectionName, id, fields);
      }
      added(subscriptionHandle, id, fields) {
        let docView = this.documents.get(id);
        let added = false;
        if (!docView) {
          added = true;
          if (Meteor.server.getPublicationStrategy(this.collectionName).useDummyDocumentView) {
            docView = new DummyDocumentView();
          } else {
            docView = new SessionDocumentView();
          }
          this.documents.set(id, docView);
        }
        docView.existsIn.add(subscriptionHandle);
        const changeCollector = {};
        Object.entries(fields).forEach(_ref => {
          let [key, value] = _ref;
          docView.changeField(subscriptionHandle, key, value, changeCollector, true);
        });
        if (added) {
          this.callbacks.added(this.collectionName, id, changeCollector);
        } else {
          this.callbacks.changed(this.collectionName, id, changeCollector);
        }
      }
      changed(subscriptionHandle, id, changed) {
        const changedResult = {};
        const docView = this.documents.get(id);
        if (!docView) {
          throw new Error("Could not find element with id ".concat(id, " to change"));
        }
        Object.entries(changed).forEach(_ref2 => {
          let [key, value] = _ref2;
          if (value === undefined) {
            docView.clearField(subscriptionHandle, key, changedResult);
          } else {
            docView.changeField(subscriptionHandle, key, value, changedResult);
          }
        });
        this.callbacks.changed(this.collectionName, id, changedResult);
      }
      removed(subscriptionHandle, id) {
        const docView = this.documents.get(id);
        if (!docView) {
          throw new Error("Removed nonexistent document ".concat(id));
        }
        docView.existsIn.delete(subscriptionHandle);
        if (docView.existsIn.size === 0) {
          // it is gone from everyone
          this.callbacks.removed(this.collectionName, id);
          this.documents.delete(id);
        } else {
          const changed = {};
          // remove this subscription from every precedence list
          // and record the changes
          docView.dataByKey.forEach((precedenceList, key) => {
            docView.clearField(subscriptionHandle, key, changed);
          });
          this.callbacks.changed(this.collectionName, id, changed);
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

},"session_document_view.ts":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/ddp-server/session_document_view.ts                                                                        //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.export({
  SessionDocumentView: () => SessionDocumentView
});
class SessionDocumentView {
  constructor() {
    this.existsIn = void 0;
    this.dataByKey = void 0;
    this.existsIn = new Set(); // set of subscriptionHandle
    // Memory Growth
    this.dataByKey = new Map(); // key-> [ {subscriptionHandle, value} by precedence]
  }
  getFields() {
    const ret = {};
    this.dataByKey.forEach((precedenceList, key) => {
      ret[key] = precedenceList[0].value;
    });
    return ret;
  }
  clearField(subscriptionHandle, key, changeCollector) {
    // Publish API ignores _id if present in fields
    if (key === "_id") return;
    const precedenceList = this.dataByKey.get(key);
    // It's okay to clear fields that didn't exist. No need to throw
    // an error.
    if (!precedenceList) return;
    let removedValue = undefined;
    for (let i = 0; i < precedenceList.length; i++) {
      const precedence = precedenceList[i];
      if (precedence.subscriptionHandle === subscriptionHandle) {
        // The view's value can only change if this subscription is the one that
        // used to have precedence.
        if (i === 0) removedValue = precedence.value;
        precedenceList.splice(i, 1);
        break;
      }
    }
    if (precedenceList.length === 0) {
      this.dataByKey.delete(key);
      changeCollector[key] = undefined;
    } else if (removedValue !== undefined && !EJSON.equals(removedValue, precedenceList[0].value)) {
      changeCollector[key] = precedenceList[0].value;
    }
  }
  changeField(subscriptionHandle, key, value, changeCollector) {
    let isAdd = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : false;
    // Publish API ignores _id if present in fields
    if (key === "_id") return;
    // Don't share state with the data passed in by the user.
    value = EJSON.clone(value);
    if (!this.dataByKey.has(key)) {
      this.dataByKey.set(key, [{
        subscriptionHandle: subscriptionHandle,
        value: value
      }]);
      changeCollector[key] = value;
      return;
    }
    const precedenceList = this.dataByKey.get(key);
    let elt;
    if (!isAdd) {
      elt = precedenceList.find(precedence => precedence.subscriptionHandle === subscriptionHandle);
    }
    if (elt) {
      if (elt === precedenceList[0] && !EJSON.equals(value, elt.value)) {
        // this subscription is changing the value of this field.
        changeCollector[key] = value;
      }
      elt.value = value;
    } else {
      // this subscription is newly caring about this field
      precedenceList.push({
        subscriptionHandle: subscriptionHandle,
        value: value
      });
    }
  }
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"node_modules":{"lodash.once":{"package.json":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/ddp-server/node_modules/lodash.once/package.json                                                //
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
// node_modules/meteor/ddp-server/node_modules/lodash.once/index.js                                                    //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.useNode();
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"lodash.isempty":{"package.json":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/ddp-server/node_modules/lodash.isempty/package.json                                             //
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
// node_modules/meteor/ddp-server/node_modules/lodash.isempty/index.js                                                 //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.useNode();
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"lodash.isobject":{"package.json":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/ddp-server/node_modules/lodash.isobject/package.json                                            //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.exports = {
  "name": "lodash.isobject",
  "version": "3.0.2"
};

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/ddp-server/node_modules/lodash.isobject/index.js                                                //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.useNode();
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"lodash.isstring":{"package.json":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/ddp-server/node_modules/lodash.isstring/package.json                                            //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.exports = {
  "name": "lodash.isstring",
  "version": "4.0.1"
};

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/ddp-server/node_modules/lodash.isstring/index.js                                                //
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
      DDPServer: DDPServer
    };},
  require: require,
  eagerModulePaths: [
    "/node_modules/meteor/ddp-server/stream_server.js",
    "/node_modules/meteor/ddp-server/livedata_server.js",
    "/node_modules/meteor/ddp-server/writefence.js",
    "/node_modules/meteor/ddp-server/crossbar.js",
    "/node_modules/meteor/ddp-server/server_convenience.js"
  ]
}});

//# sourceURL=meteor://💻app/packages/ddp-server.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvZGRwLXNlcnZlci9zdHJlYW1fc2VydmVyLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9kZHAtc2VydmVyL2xpdmVkYXRhX3NlcnZlci5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvZGRwLXNlcnZlci93cml0ZWZlbmNlLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9kZHAtc2VydmVyL2Nyb3NzYmFyLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9kZHAtc2VydmVyL3NlcnZlcl9jb252ZW5pZW5jZS5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvZGRwLXNlcnZlci9kdW1teV9kb2N1bWVudF92aWV3LnRzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9kZHAtc2VydmVyL3Nlc3Npb25fY29sbGVjdGlvbl92aWV3LnRzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9kZHAtc2VydmVyL3Nlc3Npb25fZG9jdW1lbnRfdmlldy50cyJdLCJuYW1lcyI6WyJfb2JqZWN0U3ByZWFkIiwibW9kdWxlIiwibGluayIsImRlZmF1bHQiLCJ2Iiwib25jZSIsInpsaWIiLCJfX3JlaWZ5V2FpdEZvckRlcHNfXyIsIndlYnNvY2tldEV4dGVuc2lvbnMiLCJleHRlbnNpb25zIiwid2Vic29ja2V0Q29tcHJlc3Npb25Db25maWciLCJwcm9jZXNzIiwiZW52IiwiU0VSVkVSX1dFQlNPQ0tFVF9DT01QUkVTU0lPTiIsIkpTT04iLCJwYXJzZSIsInB1c2giLCJOcG0iLCJyZXF1aXJlIiwiY29uZmlndXJlIiwidGhyZXNob2xkIiwibGV2ZWwiLCJjb25zdGFudHMiLCJaX0JFU1RfU1BFRUQiLCJtZW1MZXZlbCIsIlpfTUlOX01FTUxFVkVMIiwibm9Db250ZXh0VGFrZW92ZXIiLCJtYXhXaW5kb3dCaXRzIiwiWl9NSU5fV0lORE9XQklUUyIsInBhdGhQcmVmaXgiLCJfX21ldGVvcl9ydW50aW1lX2NvbmZpZ19fIiwiUk9PVF9VUkxfUEFUSF9QUkVGSVgiLCJTdHJlYW1TZXJ2ZXIiLCJzZWxmIiwicmVnaXN0cmF0aW9uX2NhbGxiYWNrcyIsIm9wZW5fc29ja2V0cyIsInByZWZpeCIsIlJvdXRlUG9saWN5IiwiZGVjbGFyZSIsInNvY2tqcyIsInNlcnZlck9wdGlvbnMiLCJsb2ciLCJoZWFydGJlYXRfZGVsYXkiLCJkaXNjb25uZWN0X2RlbGF5IiwiZGlzYWJsZV9jb3JzIiwiRElTQUJMRV9TT0NLSlNfQ09SUyIsImpzZXNzaW9uaWQiLCJVU0VfSlNFU1NJT05JRCIsIkRJU0FCTEVfV0VCU09DS0VUUyIsIndlYnNvY2tldCIsImZheWVfc2VydmVyX29wdGlvbnMiLCJzZXJ2ZXIiLCJjcmVhdGVTZXJ2ZXIiLCJXZWJBcHAiLCJodHRwU2VydmVyIiwicmVtb3ZlTGlzdGVuZXIiLCJfdGltZW91dEFkanVzdG1lbnRSZXF1ZXN0Q2FsbGJhY2siLCJpbnN0YWxsSGFuZGxlcnMiLCJhZGRMaXN0ZW5lciIsIl9yZWRpcmVjdFdlYnNvY2tldEVuZHBvaW50Iiwib24iLCJzb2NrZXQiLCJzZXRXZWJzb2NrZXRUaW1lb3V0IiwidGltZW91dCIsInByb3RvY29sIiwiX3Nlc3Npb24iLCJyZWN2IiwiY29ubmVjdGlvbiIsInNldFRpbWVvdXQiLCJzZW5kIiwiZGF0YSIsIndyaXRlIiwiZmlsdGVyIiwidmFsdWUiLCJURVNUX01FVEFEQVRBIiwic3RyaW5naWZ5IiwidGVzdE1lc3NhZ2VPbkNvbm5lY3QiLCJmb3JFYWNoIiwiY2FsbGJhY2siLCJPYmplY3QiLCJhc3NpZ24iLCJwcm90b3R5cGUiLCJyZWdpc3RlciIsImFsbF9zb2NrZXRzIiwidmFsdWVzIiwiZXZlbnQiLCJvbGRIdHRwU2VydmVyTGlzdGVuZXJzIiwibGlzdGVuZXJzIiwic2xpY2UiLCJyZW1vdmVBbGxMaXN0ZW5lcnMiLCJuZXdMaXN0ZW5lciIsInJlcXVlc3QiLCJhcmdzIiwiYXJndW1lbnRzIiwidXJsIiwicGFyc2VkVXJsIiwicGF0aG5hbWUiLCJmb3JtYXQiLCJvbGRMaXN0ZW5lciIsImFwcGx5IiwiX19yZWlmeV9hc3luY19yZXN1bHRfXyIsIl9yZWlmeUVycm9yIiwiYXN5bmMiLCJpc0VtcHR5IiwiaXNPYmplY3QiLCJpc1N0cmluZyIsIlNlc3Npb25Db2xsZWN0aW9uVmlldyIsIlNlc3Npb25Eb2N1bWVudFZpZXciLCJERFBTZXJ2ZXIiLCJwdWJsaWNhdGlvblN0cmF0ZWdpZXMiLCJTRVJWRVJfTUVSR0UiLCJ1c2VEdW1teURvY3VtZW50VmlldyIsInVzZUNvbGxlY3Rpb25WaWV3IiwiZG9BY2NvdW50aW5nRm9yQ29sbGVjdGlvbiIsIk5PX01FUkdFX05PX0hJU1RPUlkiLCJOT19NRVJHRSIsIk5PX01FUkdFX01VTFRJIiwiX1Nlc3Npb25Eb2N1bWVudFZpZXciLCJfZ2V0Q3VycmVudEZlbmNlIiwiY3VycmVudEludm9jYXRpb24iLCJfQ3VycmVudFdyaXRlRmVuY2UiLCJnZXQiLCJERFAiLCJfQ3VycmVudE1ldGhvZEludm9jYXRpb24iLCJmZW5jZSIsInVuZGVmaW5lZCIsIl9TZXNzaW9uQ29sbGVjdGlvblZpZXciLCJTZXNzaW9uIiwidmVyc2lvbiIsIm9wdGlvbnMiLCJpZCIsIlJhbmRvbSIsImluaXRpYWxpemVkIiwiaW5RdWV1ZSIsIk1ldGVvciIsIl9Eb3VibGVFbmRlZFF1ZXVlIiwiYmxvY2tlZCIsIndvcmtlclJ1bm5pbmciLCJjYWNoZWRVbmJsb2NrIiwiX25hbWVkU3VicyIsIk1hcCIsIl91bml2ZXJzYWxTdWJzIiwidXNlcklkIiwiY29sbGVjdGlvblZpZXdzIiwiX2lzU2VuZGluZyIsIl9kb250U3RhcnROZXdVbml2ZXJzYWxTdWJzIiwiX3BlbmRpbmdSZWFkeSIsIl9jbG9zZUNhbGxiYWNrcyIsIl9zb2NrZXRVcmwiLCJfcmVzcG9uZFRvUGluZ3MiLCJyZXNwb25kVG9QaW5ncyIsImNvbm5lY3Rpb25IYW5kbGUiLCJjbG9zZSIsIm9uQ2xvc2UiLCJmbiIsImNiIiwiYmluZEVudmlyb25tZW50IiwiZGVmZXIiLCJjbGllbnRBZGRyZXNzIiwiX2NsaWVudEFkZHJlc3MiLCJodHRwSGVhZGVycyIsImhlYWRlcnMiLCJtc2ciLCJzZXNzaW9uIiwic3RhcnRVbml2ZXJzYWxTdWJzIiwiaGVhcnRiZWF0SW50ZXJ2YWwiLCJoZWFydGJlYXQiLCJERFBDb21tb24iLCJIZWFydGJlYXQiLCJoZWFydGJlYXRUaW1lb3V0Iiwib25UaW1lb3V0Iiwic2VuZFBpbmciLCJzdGFydCIsIlBhY2thZ2UiLCJGYWN0cyIsImluY3JlbWVudFNlcnZlckZhY3QiLCJzZW5kUmVhZHkiLCJzdWJzY3JpcHRpb25JZHMiLCJzdWJzIiwic3Vic2NyaXB0aW9uSWQiLCJfY2FuU2VuZCIsImNvbGxlY3Rpb25OYW1lIiwiZ2V0UHVibGljYXRpb25TdHJhdGVneSIsInNlbmRBZGRlZCIsImZpZWxkcyIsImNvbGxlY3Rpb24iLCJzZW5kQ2hhbmdlZCIsInNlbmRSZW1vdmVkIiwiZ2V0U2VuZENhbGxiYWNrcyIsImFkZGVkIiwiYmluZCIsImNoYW5nZWQiLCJyZW1vdmVkIiwiZ2V0Q29sbGVjdGlvblZpZXciLCJyZXQiLCJzZXQiLCJzdWJzY3JpcHRpb25IYW5kbGUiLCJ2aWV3IiwiZGVsZXRlIiwiaGFuZGxlcnMiLCJ1bml2ZXJzYWxfcHVibGlzaF9oYW5kbGVycyIsImhhbmRsZXIiLCJfc3RhcnRTdWJzY3JpcHRpb24iLCJzdG9wIiwiX21ldGVvclNlc3Npb24iLCJfZGVhY3RpdmF0ZUFsbFN1YnNjcmlwdGlvbnMiLCJfcmVtb3ZlU2Vzc2lvbiIsIl9wcmludFNlbnRERFAiLCJfZGVidWciLCJzdHJpbmdpZnlERFAiLCJzZW5kRXJyb3IiLCJyZWFzb24iLCJvZmZlbmRpbmdNZXNzYWdlIiwicHJvY2Vzc01lc3NhZ2UiLCJtc2dfaW4iLCJtZXNzYWdlUmVjZWl2ZWQiLCJwcm9jZXNzTmV4dCIsInNoaWZ0IiwicnVuSGFuZGxlcnMiLCJ1bmJsb2NrIiwic2V0SW1tZWRpYXRlIiwib25NZXNzYWdlSG9vayIsImVhY2giLCJwcm90b2NvbF9oYW5kbGVycyIsInJlc3VsdCIsImNhbGwiLCJfaXNQcm9taXNlIiwiZmluYWxseSIsInN1YiIsIm5hbWUiLCJwYXJhbXMiLCJBcnJheSIsInB1Ymxpc2hfaGFuZGxlcnMiLCJlcnJvciIsIkVycm9yIiwiY29uY2F0IiwiaGFzIiwiRERQUmF0ZUxpbWl0ZXIiLCJyYXRlTGltaXRlcklucHV0IiwidHlwZSIsImNvbm5lY3Rpb25JZCIsIl9pbmNyZW1lbnQiLCJyYXRlTGltaXRSZXN1bHQiLCJfY2hlY2siLCJhbGxvd2VkIiwiZ2V0RXJyb3JNZXNzYWdlIiwidGltZVRvUmVzZXQiLCJ1bnN1YiIsIl9zdG9wU3Vic2NyaXB0aW9uIiwibWV0aG9kIiwicmFuZG9tU2VlZCIsIl9Xcml0ZUZlbmNlIiwib25BbGxDb21taXR0ZWQiLCJyZXRpcmUiLCJtZXRob2RzIiwibWV0aG9kX2hhbmRsZXJzIiwiYXJtIiwiaW52b2NhdGlvbiIsIk1ldGhvZEludm9jYXRpb24iLCJpc1NpbXVsYXRpb24iLCJzZXRVc2VySWQiLCJfc2V0VXNlcklkIiwicHJvbWlzZSIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0Iiwid2l0aFZhbHVlIiwibWF5YmVBdWRpdEFyZ3VtZW50Q2hlY2tzIiwiZmluaXNoIiwicGF5bG9hZCIsInRoZW4iLCJleGNlcHRpb24iLCJ3cmFwSW50ZXJuYWxFeGNlcHRpb24iLCJfZWFjaFN1YiIsImYiLCJfZGlmZkNvbGxlY3Rpb25WaWV3cyIsImJlZm9yZUNWcyIsIkRpZmZTZXF1ZW5jZSIsImRpZmZNYXBzIiwiYm90aCIsImxlZnRWYWx1ZSIsInJpZ2h0VmFsdWUiLCJkaWZmIiwicmlnaHRPbmx5IiwiZG9jdW1lbnRzIiwiZG9jVmlldyIsImdldEZpZWxkcyIsImxlZnRPbmx5IiwiZG9jIiwiX2RlYWN0aXZhdGUiLCJvbGROYW1lZFN1YnMiLCJhbGwiLCJtYXAiLCJfcmVmIiwibmV3U3ViIiwiX3JlY3JlYXRlIiwiX3J1bkhhbmRsZXIiLCJfbm9ZaWVsZHNBbGxvd2VkIiwic3ViSWQiLCJTdWJzY3JpcHRpb24iLCJ1bmJsb2NrSGFuZGVyIiwic3ViTmFtZSIsIm1heWJlU3ViIiwiX25hbWUiLCJfcmVtb3ZlQWxsRG9jdW1lbnRzIiwicmVzcG9uc2UiLCJodHRwRm9yd2FyZGVkQ291bnQiLCJwYXJzZUludCIsInJlbW90ZUFkZHJlc3MiLCJmb3J3YXJkZWRGb3IiLCJzcGxpdCIsImxlbmd0aCIsImlwIiwidHJpbSIsIl9oYW5kbGVyIiwiX3N1YnNjcmlwdGlvbklkIiwiX3BhcmFtcyIsIl9zdWJzY3JpcHRpb25IYW5kbGUiLCJfZGVhY3RpdmF0ZWQiLCJfc3RvcENhbGxiYWNrcyIsIl9kb2N1bWVudHMiLCJfcmVhZHkiLCJfaWRGaWx0ZXIiLCJpZFN0cmluZ2lmeSIsIk1vbmdvSUQiLCJpZFBhcnNlIiwicmVzdWx0T3JUaGVuYWJsZSIsIl9DdXJyZW50UHVibGljYXRpb25JbnZvY2F0aW9uIiwiRUpTT04iLCJjbG9uZSIsImUiLCJfaXNEZWFjdGl2YXRlZCIsImlzVGhlbmFibGUiLCJfcHVibGlzaEhhbmRsZXJSZXN1bHQiLCJyZXMiLCJpc0N1cnNvciIsImMiLCJfcHVibGlzaEN1cnNvciIsInJlYWR5IiwiaXNBcnJheSIsImV2ZXJ5IiwiY29sbGVjdGlvbk5hbWVzIiwiaSIsIl9nZXRDb2xsZWN0aW9uTmFtZSIsImN1ciIsIl9jYWxsU3RvcENhbGxiYWNrcyIsImNhbGxiYWNrcyIsImNvbGxlY3Rpb25Eb2NzIiwic3RySWQiLCJvblN0b3AiLCJpZHMiLCJTZXQiLCJhZGQiLCJTZXJ2ZXIiLCJkZWZhdWx0UHVibGljYXRpb25TdHJhdGVneSIsIm9uQ29ubmVjdGlvbkhvb2siLCJIb29rIiwiZGVidWdQcmludEV4Y2VwdGlvbnMiLCJfcHVibGljYXRpb25TdHJhdGVnaWVzIiwic2Vzc2lvbnMiLCJzdHJlYW1fc2VydmVyIiwicmF3X21zZyIsIl9wcmludFJlY2VpdmVkRERQIiwicGFyc2VERFAiLCJlcnIiLCJfaGFuZGxlQ29ubmVjdCIsIm9uQ29ubmVjdGlvbiIsInNldFB1YmxpY2F0aW9uU3RyYXRlZ3kiLCJzdHJhdGVneSIsImluY2x1ZGVzIiwib25NZXNzYWdlIiwic3VwcG9ydCIsIlNVUFBPUlRFRF9ERFBfVkVSU0lPTlMiLCJjYWxjdWxhdGVWZXJzaW9uIiwicHVibGlzaCIsImF1dG9wdWJsaXNoIiwiaXNfYXV0byIsIndhcm5lZF9hYm91dF9hdXRvcHVibGlzaCIsImVudHJpZXMiLCJfcmVmMiIsImtleSIsImlzQXN5bmNDYWxsIiwiX2lzQ2FsbEFzeW5jTWV0aG9kUnVubmluZyIsIl9yZWYzIiwiZnVuYyIsIl9sZW4iLCJfa2V5IiwicG9wIiwiY2FsbEFzeW5jIiwiX2FyZ3MkIiwiX2xlbjIiLCJfa2V5MiIsImhhc093blByb3BlcnR5IiwiX3NldENhbGxBc3luY01ldGhvZFJ1bm5pbmciLCJfQ3VycmVudENhbGxBc3luY0ludm9jYXRpb24iLCJfc2V0IiwiaGFzQ2FsbEFzeW5jUGFyZW50IiwiYXBwbHlBc3luYyIsImlzRnJvbUNhbGxBc3luYyIsImNhdGNoIiwiY3VycmVudE1ldGhvZEludm9jYXRpb24iLCJjdXJyZW50UHVibGljYXRpb25JbnZvY2F0aW9uIiwibWFrZVJwY1NlZWQiLCJyIiwiX3VybEZvclNlc3Npb24iLCJzZXNzaW9uSWQiLCJjbGllbnRTdXBwb3J0ZWRWZXJzaW9ucyIsInNlcnZlclN1cHBvcnRlZFZlcnNpb25zIiwiY29ycmVjdFZlcnNpb24iLCJmaW5kIiwiX2NhbGN1bGF0ZVZlcnNpb24iLCJjb250ZXh0IiwiaXNDbGllbnRTYWZlIiwib3JpZ2luYWxNZXNzYWdlIiwibWVzc2FnZSIsImRldGFpbHMiLCJfZXhwZWN0ZWRCeVRlc3QiLCJzdGFjayIsInNhbml0aXplZEVycm9yIiwiZGVzY3JpcHRpb24iLCJNYXRjaCIsIl9mYWlsSWZBcmd1bWVudHNBcmVOb3RBbGxDaGVja2VkIiwiY29uc3RydWN0b3IiLCJhcm1lZCIsImZpcmVkIiwicmV0aXJlZCIsIm91dHN0YW5kaW5nX3dyaXRlcyIsImJlZm9yZV9maXJlX2NhbGxiYWNrcyIsImNvbXBsZXRpb25fY2FsbGJhY2tzIiwiYmVnaW5Xcml0ZSIsImNvbW1pdHRlZCIsIl9tYXliZUZpcmUiLCJvbkJlZm9yZUZpcmUiLCJfYXJtQW5kV2FpdCIsInJlc29sdmVyIiwicmV0dXJuVmFsdWUiLCJhcm1BbmRXYWl0IiwiaW52b2tlQ2FsbGJhY2siLCJiZWZvcmVDYWxsYmFja3MiLCJFbnZpcm9ubWVudFZhcmlhYmxlIiwiX0Nyb3NzYmFyIiwibmV4dElkIiwibGlzdGVuZXJzQnlDb2xsZWN0aW9uIiwibGlzdGVuZXJzQnlDb2xsZWN0aW9uQ291bnQiLCJmYWN0UGFja2FnZSIsImZhY3ROYW1lIiwiX2NvbGxlY3Rpb25Gb3JNZXNzYWdlIiwibGlzdGVuIiwidHJpZ2dlciIsInJlY29yZCIsImZpcmUiLCJub3RpZmljYXRpb24iLCJsaXN0ZW5lcnNGb3JDb2xsZWN0aW9uIiwiY2FsbGJhY2tJZHMiLCJsIiwiX21hdGNoZXMiLCJPYmplY3RJRCIsImVxdWFscyIsImtleXMiLCJfSW52YWxpZGF0aW9uQ3Jvc3NiYXIiLCJERFBfREVGQVVMVF9DT05ORUNUSU9OX1VSTCIsInJlZnJlc2giLCJleHBvcnQiLCJEdW1teURvY3VtZW50VmlldyIsImV4aXN0c0luIiwiZGF0YUJ5S2V5IiwiY2xlYXJGaWVsZCIsImNoYW5nZUNvbGxlY3RvciIsImNoYW5nZUZpZWxkIiwiaXNBZGQiLCJzZXNzaW9uQ2FsbGJhY2tzIiwic2l6ZSIsInByZXZpb3VzIiwiZGlmZkRvY3VtZW50Iiwibm93RFYiLCJwcmV2RFYiLCJkaWZmT2JqZWN0cyIsInByZXYiLCJub3ciLCJjaGFuZ2VkUmVzdWx0IiwicHJlY2VkZW5jZUxpc3QiLCJyZW1vdmVkVmFsdWUiLCJwcmVjZWRlbmNlIiwic3BsaWNlIiwiZWx0Il0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0lBQUEsSUFBSUEsYUFBYTtJQUFDQyxNQUFNLENBQUNDLElBQUksQ0FBQyxzQ0FBc0MsRUFBQztNQUFDQyxPQUFPQSxDQUFDQyxDQUFDLEVBQUM7UUFBQ0osYUFB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ZSBmcm9tICdsb2Rhc2gub25jZSc7XG5pbXBvcnQgemxpYiBmcm9tICdub2RlOnpsaWInO1xuXG4vLyBCeSBkZWZhdWx0LCB3ZSB1c2UgdGhlIHBlcm1lc3NhZ2UtZGVmbGF0ZSBleHRlbnNpb24gd2l0aCBkZWZhdWx0XG4vLyBjb25maWd1cmF0aW9uLiBJZiAkU0VSVkVSX1dFQlNPQ0tFVF9DT01QUkVTU0lPTiBpcyBzZXQsIHRoZW4gaXQgbXVzdCBiZSB2YWxpZFxuLy8gSlNPTi4gSWYgaXQgcmVwcmVzZW50cyBhIGZhbHNleSB2YWx1ZSwgdGhlbiB3ZSBkbyBub3QgdXNlIHBlcm1lc3NhZ2UtZGVmbGF0ZVxuLy8gYXQgYWxsOyBvdGhlcndpc2UsIHRoZSBKU09OIHZhbHVlIGlzIHVzZWQgYXMgYW4gYXJndW1lbnQgdG8gZGVmbGF0ZSdzXG4vLyBjb25maWd1cmUgbWV0aG9kOyBzZWVcbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9mYXllL3Blcm1lc3NhZ2UtZGVmbGF0ZS1ub2RlL2Jsb2IvbWFzdGVyL1JFQURNRS5tZFxuLy9cbi8vIChXZSBkbyB0aGlzIGluIGFuIF8ub25jZSBpbnN0ZWFkIG9mIGF0IHN0YXJ0dXAsIGJlY2F1c2Ugd2UgZG9uJ3Qgd2FudCB0b1xuLy8gY3Jhc2ggdGhlIHRvb2wgZHVyaW5nIGlzb3BhY2tldCBsb2FkIGlmIHlvdXIgSlNPTiBkb2Vzbid0IHBhcnNlLiBUaGlzIGlzIG9ubHlcbi8vIGEgcHJvYmxlbSBiZWNhdXNlIHRoZSB0b29sIGhhcyB0byBsb2FkIHRoZSBERFAgc2VydmVyIGNvZGUganVzdCBpbiBvcmRlciB0b1xuLy8gYmUgYSBERFAgY2xpZW50OyBzZWUgaHR0cHM6Ly9naXRodWIuY29tL21ldGVvci9tZXRlb3IvaXNzdWVzLzM0NTIgLilcbnZhciB3ZWJzb2NrZXRFeHRlbnNpb25zID0gb25jZShmdW5jdGlvbiAoKSB7XG4gIHZhciBleHRlbnNpb25zID0gW107XG5cbiAgdmFyIHdlYnNvY2tldENvbXByZXNzaW9uQ29uZmlnID0gcHJvY2Vzcy5lbnYuU0VSVkVSX1dFQlNPQ0tFVF9DT01QUkVTU0lPTiA/XG4gICAgSlNPTi5wYXJzZShwcm9jZXNzLmVudi5TRVJWRVJfV0VCU09DS0VUX0NPTVBSRVNTSU9OKSA6IHt9O1xuXG4gIGlmICh3ZWJzb2NrZXRDb21wcmVzc2lvbkNvbmZpZykge1xuICAgIGV4dGVuc2lvbnMucHVzaChOcG0ucmVxdWlyZSgncGVybWVzc2FnZS1kZWZsYXRlMicpLmNvbmZpZ3VyZSh7XG4gICAgICB0aHJlc2hvbGQ6IDEwMjQsXG4gICAgICBsZXZlbDogemxpYi5jb25zdGFudHMuWl9CRVNUX1NQRUVELFxuICAgICAgbWVtTGV2ZWw6IHpsaWIuY29uc3RhbnRzLlpfTUlOX01FTUxFVkVMLFxuICAgICAgbm9Db250ZXh0VGFrZW92ZXI6IHRydWUsXG4gICAgICBtYXhXaW5kb3dCaXRzOiB6bGliLmNvbnN0YW50cy5aX01JTl9XSU5ET1dCSVRTLFxuICAgICAgLi4uKHdlYnNvY2tldENvbXByZXNzaW9uQ29uZmlnIHx8IHt9KVxuICAgIH0pKTtcbiAgfVxuXG4gIHJldHVybiBleHRlbnNpb25zO1xufSk7XG5cbnZhciBwYXRoUHJlZml4ID0gX19tZXRlb3JfcnVudGltZV9jb25maWdfXy5ST09UX1VSTF9QQVRIX1BSRUZJWCB8fCAgXCJcIjtcblxuU3RyZWFtU2VydmVyID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHNlbGYucmVnaXN0cmF0aW9uX2NhbGxiYWNrcyA9IFtdO1xuICBzZWxmLm9wZW5fc29ja2V0cyA9IFtdO1xuXG4gIC8vIEJlY2F1c2Ugd2UgYXJlIGluc3RhbGxpbmcgZGlyZWN0bHkgb250byBXZWJBcHAuaHR0cFNlcnZlciBpbnN0ZWFkIG9mIHVzaW5nXG4gIC8vIFdlYkFwcC5hcHAsIHdlIGhhdmUgdG8gcHJvY2VzcyB0aGUgcGF0aCBwcmVmaXggb3Vyc2VsdmVzLlxuICBzZWxmLnByZWZpeCA9IHBhdGhQcmVmaXggKyAnL3NvY2tqcyc7XG4gIFJvdXRlUG9saWN5LmRlY2xhcmUoc2VsZi5wcmVmaXggKyAnLycsICduZXR3b3JrJyk7XG5cbiAgLy8gc2V0IHVwIHNvY2tqc1xuICB2YXIgc29ja2pzID0gTnBtLnJlcXVpcmUoJ3NvY2tqcycpO1xuICB2YXIgc2VydmVyT3B0aW9ucyA9IHtcbiAgICBwcmVmaXg6IHNlbGYucHJlZml4LFxuICAgIGxvZzogZnVuY3Rpb24oKSB7fSxcbiAgICAvLyB0aGlzIGlzIHRoZSBkZWZhdWx0LCBidXQgd2UgY29kZSBpdCBleHBsaWNpdGx5IGJlY2F1c2Ugd2UgZGVwZW5kXG4gICAgLy8gb24gaXQgaW4gc3RyZWFtX2NsaWVudDpIRUFSVEJFQVRfVElNRU9VVFxuICAgIGhlYXJ0YmVhdF9kZWxheTogNDUwMDAsXG4gICAgLy8gVGhlIGRlZmF1bHQgZGlzY29ubmVjdF9kZWxheSBpcyA1IHNlY29uZHMsIGJ1dCBpZiB0aGUgc2VydmVyIGVuZHMgdXAgQ1BVXG4gICAgLy8gYm91bmQgZm9yIHRoYXQgbXVjaCB0aW1lLCBTb2NrSlMgbWlnaHQgbm90IG5vdGljZSB0aGF0IHRoZSB1c2VyIGhhc1xuICAgIC8vIHJlY29ubmVjdGVkIGJlY2F1c2UgdGhlIHRpbWVyIChvZiBkaXNjb25uZWN0X2RlbGF5IG1zKSBjYW4gZmlyZSBiZWZvcmVcbiAgICAvLyBTb2NrSlMgcHJvY2Vzc2VzIHRoZSBuZXcgY29ubmVjdGlvbi4gRXZlbnR1YWxseSB3ZSdsbCBmaXggdGhpcyBieSBub3RcbiAgICAvLyBjb21iaW5pbmcgQ1BVLWhlYXZ5IHByb2Nlc3Npbmcgd2l0aCBTb2NrSlMgdGVybWluYXRpb24gKGVnIGEgcHJveHkgd2hpY2hcbiAgICAvLyBjb252ZXJ0cyB0byBVbml4IHNvY2tldHMpIGJ1dCBmb3Igbm93LCByYWlzZSB0aGUgZGVsYXkuXG4gICAgZGlzY29ubmVjdF9kZWxheTogNjAgKiAxMDAwLFxuICAgIC8vIEFsbG93IGRpc2FibGluZyBvZiBDT1JTIHJlcXVlc3RzIHRvIGFkZHJlc3NcbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9pc3N1ZXMvODMxNy5cbiAgICBkaXNhYmxlX2NvcnM6ICEhcHJvY2Vzcy5lbnYuRElTQUJMRV9TT0NLSlNfQ09SUyxcbiAgICAvLyBTZXQgdGhlIFVTRV9KU0VTU0lPTklEIGVudmlyb25tZW50IHZhcmlhYmxlIHRvIGVuYWJsZSBzZXR0aW5nIHRoZVxuICAgIC8vIEpTRVNTSU9OSUQgY29va2llLiBUaGlzIGlzIHVzZWZ1bCBmb3Igc2V0dGluZyB1cCBwcm94aWVzIHdpdGhcbiAgICAvLyBzZXNzaW9uIGFmZmluaXR5LlxuICAgIGpzZXNzaW9uaWQ6ICEhcHJvY2Vzcy5lbnYuVVNFX0pTRVNTSU9OSURcbiAgfTtcblxuICAvLyBJZiB5b3Uga25vdyB5b3VyIHNlcnZlciBlbnZpcm9ubWVudCAoZWcsIHByb3hpZXMpIHdpbGwgcHJldmVudCB3ZWJzb2NrZXRzXG4gIC8vIGZyb20gZXZlciB3b3JraW5nLCBzZXQgJERJU0FCTEVfV0VCU09DS0VUUyBhbmQgU29ja0pTIGNsaWVudHMgKGllLFxuICAvLyBicm93c2Vycykgd2lsbCBub3Qgd2FzdGUgdGltZSBhdHRlbXB0aW5nIHRvIHVzZSB0aGVtLlxuICAvLyAoWW91ciBzZXJ2ZXIgd2lsbCBzdGlsbCBoYXZlIGEgL3dlYnNvY2tldCBlbmRwb2ludC4pXG4gIGlmIChwcm9jZXNzLmVudi5ESVNBQkxFX1dFQlNPQ0tFVFMpIHtcbiAgICBzZXJ2ZXJPcHRpb25zLndlYnNvY2tldCA9IGZhbHNlO1xuICB9IGVsc2Uge1xuICAgIHNlcnZlck9wdGlvbnMuZmF5ZV9zZXJ2ZXJfb3B0aW9ucyA9IHtcbiAgICAgIGV4dGVuc2lvbnM6IHdlYnNvY2tldEV4dGVuc2lvbnMoKVxuICAgIH07XG4gIH1cblxuICBzZWxmLnNlcnZlciA9IHNvY2tqcy5jcmVhdGVTZXJ2ZXIoc2VydmVyT3B0aW9ucyk7XG5cbiAgLy8gSW5zdGFsbCB0aGUgc29ja2pzIGhhbmRsZXJzLCBidXQgd2Ugd2FudCB0byBrZWVwIGFyb3VuZCBvdXIgb3duIHBhcnRpY3VsYXJcbiAgLy8gcmVxdWVzdCBoYW5kbGVyIHRoYXQgYWRqdXN0cyBpZGxlIHRpbWVvdXRzIHdoaWxlIHdlIGhhdmUgYW4gb3V0c3RhbmRpbmdcbiAgLy8gcmVxdWVzdC4gIFRoaXMgY29tcGVuc2F0ZXMgZm9yIHRoZSBmYWN0IHRoYXQgc29ja2pzIHJlbW92ZXMgYWxsIGxpc3RlbmVyc1xuICAvLyBmb3IgXCJyZXF1ZXN0XCIgdG8gYWRkIGl0cyBvd24uXG4gIFdlYkFwcC5odHRwU2VydmVyLnJlbW92ZUxpc3RlbmVyKFxuICAgICdyZXF1ZXN0JywgV2ViQXBwLl90aW1lb3V0QWRqdXN0bWVudFJlcXVlc3RDYWxsYmFjayk7XG4gIHNlbGYuc2VydmVyLmluc3RhbGxIYW5kbGVycyhXZWJBcHAuaHR0cFNlcnZlcik7XG4gIFdlYkFwcC5odHRwU2VydmVyLmFkZExpc3RlbmVyKFxuICAgICdyZXF1ZXN0JywgV2ViQXBwLl90aW1lb3V0QWRqdXN0bWVudFJlcXVlc3RDYWxsYmFjayk7XG5cbiAgLy8gU3VwcG9ydCB0aGUgL3dlYnNvY2tldCBlbmRwb2ludFxuICBzZWxmLl9yZWRpcmVjdFdlYnNvY2tldEVuZHBvaW50KCk7XG5cbiAgc2VsZi5zZXJ2ZXIub24oJ2Nvbm5lY3Rpb24nLCBmdW5jdGlvbiAoc29ja2V0KSB7XG4gICAgLy8gc29ja2pzIHNvbWV0aW1lcyBwYXNzZXMgdXMgbnVsbCBpbnN0ZWFkIG9mIGEgc29ja2V0IG9iamVjdFxuICAgIC8vIHNvIHdlIG5lZWQgdG8gZ3VhcmQgYWdhaW5zdCB0aGF0LiBzZWU6XG4gICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3NvY2tqcy9zb2NranMtbm9kZS9pc3N1ZXMvMTIxXG4gICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL21ldGVvci9tZXRlb3IvaXNzdWVzLzEwNDY4XG4gICAgaWYgKCFzb2NrZXQpIHJldHVybjtcblxuICAgIC8vIFdlIHdhbnQgdG8gbWFrZSBzdXJlIHRoYXQgaWYgYSBjbGllbnQgY29ubmVjdHMgdG8gdXMgYW5kIGRvZXMgdGhlIGluaXRpYWxcbiAgICAvLyBXZWJzb2NrZXQgaGFuZHNoYWtlIGJ1dCBuZXZlciBnZXRzIHRvIHRoZSBERFAgaGFuZHNoYWtlLCB0aGF0IHdlXG4gICAgLy8gZXZlbnR1YWxseSBraWxsIHRoZSBzb2NrZXQuICBPbmNlIHRoZSBERFAgaGFuZHNoYWtlIGhhcHBlbnMsIEREUFxuICAgIC8vIGhlYXJ0YmVhdGluZyB3aWxsIHdvcmsuIEFuZCBiZWZvcmUgdGhlIFdlYnNvY2tldCBoYW5kc2hha2UsIHRoZSB0aW1lb3V0c1xuICAgIC8vIHdlIHNldCBhdCB0aGUgc2VydmVyIGxldmVsIGluIHdlYmFwcF9zZXJ2ZXIuanMgd2lsbCB3b3JrLiBCdXRcbiAgICAvLyBmYXllLXdlYnNvY2tldCBjYWxscyBzZXRUaW1lb3V0KDApIG9uIGFueSBzb2NrZXQgaXQgdGFrZXMgb3Zlciwgc28gdGhlcmVcbiAgICAvLyBpcyBhbiBcImluIGJldHdlZW5cIiBzdGF0ZSB3aGVyZSB0aGlzIGRvZXNuJ3QgaGFwcGVuLiAgV2Ugd29yayBhcm91bmQgdGhpc1xuICAgIC8vIGJ5IGV4cGxpY2l0bHkgc2V0dGluZyB0aGUgc29ja2V0IHRpbWVvdXQgdG8gYSByZWxhdGl2ZWx5IGxhcmdlIHRpbWUgaGVyZSxcbiAgICAvLyBhbmQgc2V0dGluZyBpdCBiYWNrIHRvIHplcm8gd2hlbiB3ZSBzZXQgdXAgdGhlIGhlYXJ0YmVhdCBpblxuICAgIC8vIGxpdmVkYXRhX3NlcnZlci5qcy5cbiAgICBzb2NrZXQuc2V0V2Vic29ja2V0VGltZW91dCA9IGZ1bmN0aW9uICh0aW1lb3V0KSB7XG4gICAgICBpZiAoKHNvY2tldC5wcm90b2NvbCA9PT0gJ3dlYnNvY2tldCcgfHxcbiAgICAgICAgICAgc29ja2V0LnByb3RvY29sID09PSAnd2Vic29ja2V0LXJhdycpXG4gICAgICAgICAgJiYgc29ja2V0Ll9zZXNzaW9uLnJlY3YpIHtcbiAgICAgICAgc29ja2V0Ll9zZXNzaW9uLnJlY3YuY29ubmVjdGlvbi5zZXRUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgfVxuICAgIH07XG4gICAgc29ja2V0LnNldFdlYnNvY2tldFRpbWVvdXQoNDUgKiAxMDAwKTtcblxuICAgIHNvY2tldC5zZW5kID0gZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgIHNvY2tldC53cml0ZShkYXRhKTtcbiAgICB9O1xuICAgIHNvY2tldC5vbignY2xvc2UnLCBmdW5jdGlvbiAoKSB7XG4gICAgICBzZWxmLm9wZW5fc29ja2V0cyA9IHNlbGYub3Blbl9zb2NrZXRzLmZpbHRlcihmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICByZXR1cm4gdmFsdWUgIT09IHNvY2tldDtcbiAgICAgIH0pO1xuICAgIH0pO1xuICAgIHNlbGYub3Blbl9zb2NrZXRzLnB1c2goc29ja2V0KTtcblxuICAgIC8vIG9ubHkgdG8gc2VuZCBhIG1lc3NhZ2UgYWZ0ZXIgY29ubmVjdGlvbiBvbiB0ZXN0cywgdXNlZnVsIGZvclxuICAgIC8vIHNvY2tldC1zdHJlYW0tY2xpZW50L3NlcnZlci10ZXN0cy5qc1xuICAgIGlmIChwcm9jZXNzLmVudi5URVNUX01FVEFEQVRBICYmIHByb2Nlc3MuZW52LlRFU1RfTUVUQURBVEEgIT09IFwie31cIikge1xuICAgICAgc29ja2V0LnNlbmQoSlNPTi5zdHJpbmdpZnkoeyB0ZXN0TWVzc2FnZU9uQ29ubmVjdDogdHJ1ZSB9KSk7XG4gICAgfVxuXG4gICAgLy8gY2FsbCBhbGwgb3VyIGNhbGxiYWNrcyB3aGVuIHdlIGdldCBhIG5ldyBzb2NrZXQuIHRoZXkgd2lsbCBkbyB0aGVcbiAgICAvLyB3b3JrIG9mIHNldHRpbmcgdXAgaGFuZGxlcnMgYW5kIHN1Y2ggZm9yIHNwZWNpZmljIG1lc3NhZ2VzLlxuICAgIHNlbGYucmVnaXN0cmF0aW9uX2NhbGxiYWNrcy5mb3JFYWNoKGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgY2FsbGJhY2soc29ja2V0KTtcbiAgICB9KTtcbiAgfSk7XG5cbn07XG5cbk9iamVjdC5hc3NpZ24oU3RyZWFtU2VydmVyLnByb3RvdHlwZSwge1xuICAvLyBjYWxsIG15IGNhbGxiYWNrIHdoZW4gYSBuZXcgc29ja2V0IGNvbm5lY3RzLlxuICAvLyBhbHNvIGNhbGwgaXQgZm9yIGFsbCBjdXJyZW50IGNvbm5lY3Rpb25zLlxuICByZWdpc3RlcjogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHNlbGYucmVnaXN0cmF0aW9uX2NhbGxiYWNrcy5wdXNoKGNhbGxiYWNrKTtcbiAgICBzZWxmLmFsbF9zb2NrZXRzKCkuZm9yRWFjaChmdW5jdGlvbiAoc29ja2V0KSB7XG4gICAgICBjYWxsYmFjayhzb2NrZXQpO1xuICAgIH0pO1xuICB9LFxuXG4gIC8vIGdldCBhIGxpc3Qgb2YgYWxsIHNvY2tldHNcbiAgYWxsX3NvY2tldHM6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIE9iamVjdC52YWx1ZXMoc2VsZi5vcGVuX3NvY2tldHMpO1xuICB9LFxuXG4gIC8vIFJlZGlyZWN0IC93ZWJzb2NrZXQgdG8gL3NvY2tqcy93ZWJzb2NrZXQgaW4gb3JkZXIgdG8gbm90IGV4cG9zZVxuICAvLyBzb2NranMgdG8gY2xpZW50cyB0aGF0IHdhbnQgdG8gdXNlIHJhdyB3ZWJzb2NrZXRzXG4gIF9yZWRpcmVjdFdlYnNvY2tldEVuZHBvaW50OiBmdW5jdGlvbigpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgLy8gVW5mb3J0dW5hdGVseSB3ZSBjYW4ndCB1c2UgYSBjb25uZWN0IG1pZGRsZXdhcmUgaGVyZSBzaW5jZVxuICAgIC8vIHNvY2tqcyBpbnN0YWxscyBpdHNlbGYgcHJpb3IgdG8gYWxsIGV4aXN0aW5nIGxpc3RlbmVyc1xuICAgIC8vIChtZWFuaW5nIHByaW9yIHRvIGFueSBjb25uZWN0IG1pZGRsZXdhcmVzKSBzbyB3ZSBuZWVkIHRvIHRha2VcbiAgICAvLyBhbiBhcHByb2FjaCBzaW1pbGFyIHRvIG92ZXJzaGFkb3dMaXN0ZW5lcnMgaW5cbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vc29ja2pzL3NvY2tqcy1ub2RlL2Jsb2IvY2Y4MjBjNTVhZjZhOTk1M2UxNjU1ODU1NWEzMWRlY2VhNTU0ZjcwZS9zcmMvdXRpbHMuY29mZmVlXG4gICAgWydyZXF1ZXN0JywgJ3VwZ3JhZGUnXS5mb3JFYWNoKChldmVudCkgPT4ge1xuICAgICAgdmFyIGh0dHBTZXJ2ZXIgPSBXZWJBcHAuaHR0cFNlcnZlcjtcbiAgICAgIHZhciBvbGRIdHRwU2VydmVyTGlzdGVuZXJzID0gaHR0cFNlcnZlci5saXN0ZW5lcnMoZXZlbnQpLnNsaWNlKDApO1xuICAgICAgaHR0cFNlcnZlci5yZW1vdmVBbGxMaXN0ZW5lcnMoZXZlbnQpO1xuXG4gICAgICAvLyByZXF1ZXN0IGFuZCB1cGdyYWRlIGhhdmUgZGlmZmVyZW50IGFyZ3VtZW50cyBwYXNzZWQgYnV0XG4gICAgICAvLyB3ZSBvbmx5IGNhcmUgYWJvdXQgdGhlIGZpcnN0IG9uZSB3aGljaCBpcyBhbHdheXMgcmVxdWVzdFxuICAgICAgdmFyIG5ld0xpc3RlbmVyID0gZnVuY3Rpb24ocmVxdWVzdCAvKiwgbW9yZUFyZ3VtZW50cyAqLykge1xuICAgICAgICAvLyBTdG9yZSBhcmd1bWVudHMgZm9yIHVzZSB3aXRoaW4gdGhlIGNsb3N1cmUgYmVsb3dcbiAgICAgICAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG5cbiAgICAgICAgLy8gVE9ETyByZXBsYWNlIHdpdGggdXJsIHBhY2thZ2VcbiAgICAgICAgdmFyIHVybCA9IE5wbS5yZXF1aXJlKCd1cmwnKTtcblxuICAgICAgICAvLyBSZXdyaXRlIC93ZWJzb2NrZXQgYW5kIC93ZWJzb2NrZXQvIHVybHMgdG8gL3NvY2tqcy93ZWJzb2NrZXQgd2hpbGVcbiAgICAgICAgLy8gcHJlc2VydmluZyBxdWVyeSBzdHJpbmcuXG4gICAgICAgIHZhciBwYXJzZWRVcmwgPSB1cmwucGFyc2UocmVxdWVzdC51cmwpO1xuICAgICAgICBpZiAocGFyc2VkVXJsLnBhdGhuYW1lID09PSBwYXRoUHJlZml4ICsgJy93ZWJzb2NrZXQnIHx8XG4gICAgICAgICAgICBwYXJzZWRVcmwucGF0aG5hbWUgPT09IHBhdGhQcmVmaXggKyAnL3dlYnNvY2tldC8nKSB7XG4gICAgICAgICAgcGFyc2VkVXJsLnBhdGhuYW1lID0gc2VsZi5wcmVmaXggKyAnL3dlYnNvY2tldCc7XG4gICAgICAgICAgcmVxdWVzdC51cmwgPSB1cmwuZm9ybWF0KHBhcnNlZFVybCk7XG4gICAgICAgIH1cbiAgICAgICAgb2xkSHR0cFNlcnZlckxpc3RlbmVycy5mb3JFYWNoKGZ1bmN0aW9uKG9sZExpc3RlbmVyKSB7XG4gICAgICAgICAgb2xkTGlzdGVuZXIuYXBwbHkoaHR0cFNlcnZlciwgYXJncyk7XG4gICAgICAgIH0pO1xuICAgICAgfTtcbiAgICAgIGh0dHBTZXJ2ZXIuYWRkTGlzdGVuZXIoZXZlbnQsIG5ld0xpc3RlbmVyKTtcbiAgICB9KTtcbiAgfVxufSk7IiwiaW1wb3J0IGlzRW1wdHkgZnJvbSAnbG9kYXNoLmlzZW1wdHknO1xuaW1wb3J0IGlzT2JqZWN0IGZyb20gJ2xvZGFzaC5pc29iamVjdCc7XG5pbXBvcnQgaXNTdHJpbmcgZnJvbSAnbG9kYXNoLmlzc3RyaW5nJztcbmltcG9ydCB7IFNlc3Npb25Db2xsZWN0aW9uVmlldyB9IGZyb20gJy4vc2Vzc2lvbl9jb2xsZWN0aW9uX3ZpZXcnO1xuaW1wb3J0IHsgU2Vzc2lvbkRvY3VtZW50VmlldyB9IGZyb20gJy4vc2Vzc2lvbl9kb2N1bWVudF92aWV3JztcblxuRERQU2VydmVyID0ge307XG5cblxuLy8gUHVibGljYXRpb24gc3RyYXRlZ2llcyBkZWZpbmUgaG93IHdlIGhhbmRsZSBkYXRhIGZyb20gcHVibGlzaGVkIGN1cnNvcnMgYXQgdGhlIGNvbGxlY3Rpb24gbGV2ZWxcbi8vIFRoaXMgYWxsb3dzIHNvbWVvbmUgdG86XG4vLyAtIENob29zZSBhIHRyYWRlLW9mZiBiZXR3ZWVuIGNsaWVudC1zZXJ2ZXIgYmFuZHdpZHRoIGFuZCBzZXJ2ZXIgbWVtb3J5IHVzYWdlXG4vLyAtIEltcGxlbWVudCBzcGVjaWFsIChub24tbW9uZ28pIGNvbGxlY3Rpb25zIGxpa2Ugdm9sYXRpbGUgbWVzc2FnZSBxdWV1ZXNcbmNvbnN0IHB1YmxpY2F0aW9uU3RyYXRlZ2llcyA9IHtcbiAgLy8gU0VSVkVSX01FUkdFIGlzIHRoZSBkZWZhdWx0IHN0cmF0ZWd5LlxuICAvLyBXaGVuIHVzaW5nIHRoaXMgc3RyYXRlZ3ksIHRoZSBzZXJ2ZXIgbWFpbnRhaW5zIGEgY29weSBvZiBhbGwgZGF0YSBhIGNvbm5lY3Rpb24gaXMgc3Vic2NyaWJlZCB0by5cbiAgLy8gVGhpcyBhbGxvd3MgdXMgdG8gb25seSBzZW5kIGRlbHRhcyBvdmVyIG11bHRpcGxlIHB1YmxpY2F0aW9ucy5cbiAgU0VSVkVSX01FUkdFOiB7XG4gICAgdXNlRHVtbXlEb2N1bWVudFZpZXc6IGZhbHNlLFxuICAgIHVzZUNvbGxlY3Rpb25WaWV3OiB0cnVlLFxuICAgIGRvQWNjb3VudGluZ0ZvckNvbGxlY3Rpb246IHRydWUsXG4gIH0sXG4gIC8vIFRoZSBOT19NRVJHRV9OT19ISVNUT1JZIHN0cmF0ZWd5IHJlc3VsdHMgaW4gdGhlIHNlcnZlciBzZW5kaW5nIGFsbCBwdWJsaWNhdGlvbiBkYXRhXG4gIC8vIGRpcmVjdGx5IHRvIHRoZSBjbGllbnQuIEl0IGRvZXMgbm90IHJlbWVtYmVyIHdoYXQgaXQgaGFzIHByZXZpb3VzbHkgc2VudFxuICAvLyB0byBpdCB3aWxsIG5vdCB0cmlnZ2VyIHJlbW92ZWQgbWVzc2FnZXMgd2hlbiBhIHN1YnNjcmlwdGlvbiBpcyBzdG9wcGVkLlxuICAvLyBUaGlzIHNob3VsZCBvbmx5IGJlIGNob3NlbiBmb3Igc3BlY2lhbCB1c2UgY2FzZXMgbGlrZSBzZW5kLWFuZC1mb3JnZXQgcXVldWVzLlxuICBOT19NRVJHRV9OT19ISVNUT1JZOiB7XG4gICAgdXNlRHVtbXlEb2N1bWVudFZpZXc6IGZhbHNlLFxuICAgIHVzZUNvbGxlY3Rpb25WaWV3OiBmYWxzZSxcbiAgICBkb0FjY291bnRpbmdGb3JDb2xsZWN0aW9uOiBmYWxzZSxcbiAgfSxcbiAgLy8gTk9fTUVSR0UgaXMgc2ltaWxhciB0byBOT19NRVJHRV9OT19ISVNUT1JZIGJ1dCB0aGUgc2VydmVyIHdpbGwgcmVtZW1iZXIgdGhlIElEcyBpdCBoYXNcbiAgLy8gc2VudCB0byB0aGUgY2xpZW50IHNvIGl0IGNhbiByZW1vdmUgdGhlbSB3aGVuIGEgc3Vic2NyaXB0aW9uIGlzIHN0b3BwZWQuXG4gIC8vIFRoaXMgc3RyYXRlZ3kgY2FuIGJlIHVzZWQgd2hlbiBhIGNvbGxlY3Rpb24gaXMgb25seSB1c2VkIGluIGEgc2luZ2xlIHB1YmxpY2F0aW9uLlxuICBOT19NRVJHRToge1xuICAgIHVzZUR1bW15RG9jdW1lbnRWaWV3OiBmYWxzZSxcbiAgICB1c2VDb2xsZWN0aW9uVmlldzogZmFsc2UsXG4gICAgZG9BY2NvdW50aW5nRm9yQ29sbGVjdGlvbjogdHJ1ZSxcbiAgfSxcbiAgLy8gTk9fTUVSR0VfTVVMVEkgaXMgc2ltaWxhciB0byBgTk9fTUVSR0VgLCBidXQgaXQgZG9lcyB0cmFjayB3aGV0aGVyIGEgZG9jdW1lbnQgaXNcbiAgLy8gdXNlZCBieSBtdWx0aXBsZSBwdWJsaWNhdGlvbnMuIFRoaXMgaGFzIHNvbWUgbWVtb3J5IG92ZXJoZWFkLCBidXQgaXQgc3RpbGwgZG9lcyBub3QgZG9cbiAgLy8gZGlmZmluZyBzbyBpdCdzIGZhc3RlciBhbmQgc2xpbW1lciB0aGFuIFNFUlZFUl9NRVJHRS5cbiAgTk9fTUVSR0VfTVVMVEk6IHtcbiAgICB1c2VEdW1teURvY3VtZW50VmlldzogdHJ1ZSxcbiAgICB1c2VDb2xsZWN0aW9uVmlldzogdHJ1ZSxcbiAgICBkb0FjY291bnRpbmdGb3JDb2xsZWN0aW9uOiB0cnVlXG4gIH1cbn07XG5cbkREUFNlcnZlci5wdWJsaWNhdGlvblN0cmF0ZWdpZXMgPSBwdWJsaWNhdGlvblN0cmF0ZWdpZXM7XG5cbi8vIFRoaXMgZmlsZSBjb250YWlucyBjbGFzc2VzOlxuLy8gKiBTZXNzaW9uIC0gVGhlIHNlcnZlcidzIGNvbm5lY3Rpb24gdG8gYSBzaW5nbGUgRERQIGNsaWVudFxuLy8gKiBTdWJzY3JpcHRpb24gLSBBIHNpbmdsZSBzdWJzY3JpcHRpb24gZm9yIGEgc2luZ2xlIGNsaWVudFxuLy8gKiBTZXJ2ZXIgLSBBbiBlbnRpcmUgc2VydmVyIHRoYXQgbWF5IHRhbGsgdG8gPiAxIGNsaWVudC4gQSBERFAgZW5kcG9pbnQuXG4vL1xuLy8gU2Vzc2lvbiBhbmQgU3Vic2NyaXB0aW9uIGFyZSBmaWxlIHNjb3BlLiBGb3Igbm93LCB1bnRpbCB3ZSBmcmVlemVcbi8vIHRoZSBpbnRlcmZhY2UsIFNlcnZlciBpcyBwYWNrYWdlIHNjb3BlIChpbiB0aGUgZnV0dXJlIGl0IHNob3VsZCBiZVxuLy8gZXhwb3J0ZWQpLlxuXG5cbkREUFNlcnZlci5fU2Vzc2lvbkRvY3VtZW50VmlldyA9IFNlc3Npb25Eb2N1bWVudFZpZXc7XG5cbkREUFNlcnZlci5fZ2V0Q3VycmVudEZlbmNlID0gZnVuY3Rpb24gKCkge1xuICBsZXQgY3VycmVudEludm9jYXRpb24gPSB0aGlzLl9DdXJyZW50V3JpdGVGZW5jZS5nZXQoKTtcbiAgaWYgKGN1cnJlbnRJbnZvY2F0aW9uKSB7XG4gICAgcmV0dXJuIGN1cnJlbnRJbnZvY2F0aW9uO1xuICB9XG4gIGN1cnJlbnRJbnZvY2F0aW9uID0gRERQLl9DdXJyZW50TWV0aG9kSW52b2NhdGlvbi5nZXQoKTtcbiAgcmV0dXJuIGN1cnJlbnRJbnZvY2F0aW9uID8gY3VycmVudEludm9jYXRpb24uZmVuY2UgOiB1bmRlZmluZWQ7XG59O1xuXG5cbkREUFNlcnZlci5fU2Vzc2lvbkNvbGxlY3Rpb25WaWV3ID0gU2Vzc2lvbkNvbGxlY3Rpb25WaWV3O1xuXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xuLyogU2Vzc2lvbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKi9cbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbnZhciBTZXNzaW9uID0gZnVuY3Rpb24gKHNlcnZlciwgdmVyc2lvbiwgc29ja2V0LCBvcHRpb25zKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgc2VsZi5pZCA9IFJhbmRvbS5pZCgpO1xuXG4gIHNlbGYuc2VydmVyID0gc2VydmVyO1xuICBzZWxmLnZlcnNpb24gPSB2ZXJzaW9uO1xuXG4gIHNlbGYuaW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgc2VsZi5zb2NrZXQgPSBzb2NrZXQ7XG5cbiAgLy8gU2V0IHRvIG51bGwgd2hlbiB0aGUgc2Vzc2lvbiBpcyBkZXN0cm95ZWQuIE11bHRpcGxlIHBsYWNlcyBiZWxvd1xuICAvLyB1c2UgdGhpcyB0byBkZXRlcm1pbmUgaWYgdGhlIHNlc3Npb24gaXMgYWxpdmUgb3Igbm90LlxuICBzZWxmLmluUXVldWUgPSBuZXcgTWV0ZW9yLl9Eb3VibGVFbmRlZFF1ZXVlKCk7XG5cbiAgc2VsZi5ibG9ja2VkID0gZmFsc2U7XG4gIHNlbGYud29ya2VyUnVubmluZyA9IGZhbHNlO1xuXG4gIHNlbGYuY2FjaGVkVW5ibG9jayA9IG51bGw7XG5cbiAgLy8gU3ViIG9iamVjdHMgZm9yIGFjdGl2ZSBzdWJzY3JpcHRpb25zXG4gIHNlbGYuX25hbWVkU3VicyA9IG5ldyBNYXAoKTtcbiAgc2VsZi5fdW5pdmVyc2FsU3VicyA9IFtdO1xuXG4gIHNlbGYudXNlcklkID0gbnVsbDtcblxuICBzZWxmLmNvbGxlY3Rpb25WaWV3cyA9IG5ldyBNYXAoKTtcblxuICAvLyBTZXQgdGhpcyB0byBmYWxzZSB0byBub3Qgc2VuZCBtZXNzYWdlcyB3aGVuIGNvbGxlY3Rpb25WaWV3cyBhcmVcbiAgLy8gbW9kaWZpZWQuIFRoaXMgaXMgZG9uZSB3aGVuIHJlcnVubmluZyBzdWJzIGluIF9zZXRVc2VySWQgYW5kIHRob3NlIG1lc3NhZ2VzXG4gIC8vIGFyZSBjYWxjdWxhdGVkIHZpYSBhIGRpZmYgaW5zdGVhZC5cbiAgc2VsZi5faXNTZW5kaW5nID0gdHJ1ZTtcblxuICAvLyBJZiB0aGlzIGlzIHRydWUsIGRvbid0IHN0YXJ0IGEgbmV3bHktY3JlYXRlZCB1bml2ZXJzYWwgcHVibGlzaGVyIG9uIHRoaXNcbiAgLy8gc2Vzc2lvbi4gVGhlIHNlc3Npb24gd2lsbCB0YWtlIGNhcmUgb2Ygc3RhcnRpbmcgaXQgd2hlbiBhcHByb3ByaWF0ZS5cbiAgc2VsZi5fZG9udFN0YXJ0TmV3VW5pdmVyc2FsU3VicyA9IGZhbHNlO1xuXG4gIC8vIFdoZW4gd2UgYXJlIHJlcnVubmluZyBzdWJzY3JpcHRpb25zLCBhbnkgcmVhZHkgbWVzc2FnZXNcbiAgLy8gd2Ugd2FudCB0byBidWZmZXIgdXAgZm9yIHdoZW4gd2UgYXJlIGRvbmUgcmVydW5uaW5nIHN1YnNjcmlwdGlvbnNcbiAgc2VsZi5fcGVuZGluZ1JlYWR5ID0gW107XG5cbiAgLy8gTGlzdCBvZiBjYWxsYmFja3MgdG8gY2FsbCB3aGVuIHRoaXMgY29ubmVjdGlvbiBpcyBjbG9zZWQuXG4gIHNlbGYuX2Nsb3NlQ2FsbGJhY2tzID0gW107XG5cblxuICAvLyBYWFggSEFDSzogSWYgYSBzb2NranMgY29ubmVjdGlvbiwgc2F2ZSBvZmYgdGhlIFVSTC4gVGhpcyBpc1xuICAvLyB0ZW1wb3JhcnkgYW5kIHdpbGwgZ28gYXdheSBpbiB0aGUgbmVhciBmdXR1cmUuXG4gIHNlbGYuX3NvY2tldFVybCA9IHNvY2tldC51cmw7XG5cbiAgLy8gQWxsb3cgdGVzdHMgdG8gZGlzYWJsZSByZXNwb25kaW5nIHRvIHBpbmdzLlxuICBzZWxmLl9yZXNwb25kVG9QaW5ncyA9IG9wdGlvbnMucmVzcG9uZFRvUGluZ3M7XG5cbiAgLy8gVGhpcyBvYmplY3QgaXMgdGhlIHB1YmxpYyBpbnRlcmZhY2UgdG8gdGhlIHNlc3Npb24uIEluIHRoZSBwdWJsaWNcbiAgLy8gQVBJLCBpdCBpcyBjYWxsZWQgdGhlIGBjb25uZWN0aW9uYCBvYmplY3QuICBJbnRlcm5hbGx5IHdlIGNhbGwgaXRcbiAgLy8gYSBgY29ubmVjdGlvbkhhbmRsZWAgdG8gYXZvaWQgYW1iaWd1aXR5LlxuICBzZWxmLmNvbm5lY3Rpb25IYW5kbGUgPSB7XG4gICAgaWQ6IHNlbGYuaWQsXG4gICAgY2xvc2U6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHNlbGYuY2xvc2UoKTtcbiAgICB9LFxuICAgIG9uQ2xvc2U6IGZ1bmN0aW9uIChmbikge1xuICAgICAgdmFyIGNiID0gTWV0ZW9yLmJpbmRFbnZpcm9ubWVudChmbiwgXCJjb25uZWN0aW9uIG9uQ2xvc2UgY2FsbGJhY2tcIik7XG4gICAgICBpZiAoc2VsZi5pblF1ZXVlKSB7XG4gICAgICAgIHNlbGYuX2Nsb3NlQ2FsbGJhY2tzLnB1c2goY2IpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gaWYgd2UncmUgYWxyZWFkeSBjbG9zZWQsIGNhbGwgdGhlIGNhbGxiYWNrLlxuICAgICAgICBNZXRlb3IuZGVmZXIoY2IpO1xuICAgICAgfVxuICAgIH0sXG4gICAgY2xpZW50QWRkcmVzczogc2VsZi5fY2xpZW50QWRkcmVzcygpLFxuICAgIGh0dHBIZWFkZXJzOiBzZWxmLnNvY2tldC5oZWFkZXJzXG4gIH07XG5cbiAgc2VsZi5zZW5kKHsgbXNnOiAnY29ubmVjdGVkJywgc2Vzc2lvbjogc2VsZi5pZCB9KTtcblxuICAvLyBPbiBpbml0aWFsIGNvbm5lY3QsIHNwaW4gdXAgYWxsIHRoZSB1bml2ZXJzYWwgcHVibGlzaGVycy5cbiAgc2VsZi5zdGFydFVuaXZlcnNhbFN1YnMoKTtcblxuICBpZiAodmVyc2lvbiAhPT0gJ3ByZTEnICYmIG9wdGlvbnMuaGVhcnRiZWF0SW50ZXJ2YWwgIT09IDApIHtcbiAgICAvLyBXZSBubyBsb25nZXIgbmVlZCB0aGUgbG93IGxldmVsIHRpbWVvdXQgYmVjYXVzZSB3ZSBoYXZlIGhlYXJ0YmVhdHMuXG4gICAgc29ja2V0LnNldFdlYnNvY2tldFRpbWVvdXQoMCk7XG5cbiAgICBzZWxmLmhlYXJ0YmVhdCA9IG5ldyBERFBDb21tb24uSGVhcnRiZWF0KHtcbiAgICAgIGhlYXJ0YmVhdEludGVydmFsOiBvcHRpb25zLmhlYXJ0YmVhdEludGVydmFsLFxuICAgICAgaGVhcnRiZWF0VGltZW91dDogb3B0aW9ucy5oZWFydGJlYXRUaW1lb3V0LFxuICAgICAgb25UaW1lb3V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHNlbGYuY2xvc2UoKTtcbiAgICAgIH0sXG4gICAgICBzZW5kUGluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICBzZWxmLnNlbmQoe21zZzogJ3BpbmcnfSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgc2VsZi5oZWFydGJlYXQuc3RhcnQoKTtcbiAgfVxuXG4gIFBhY2thZ2VbJ2ZhY3RzLWJhc2UnXSAmJiBQYWNrYWdlWydmYWN0cy1iYXNlJ10uRmFjdHMuaW5jcmVtZW50U2VydmVyRmFjdChcbiAgICBcImxpdmVkYXRhXCIsIFwic2Vzc2lvbnNcIiwgMSk7XG59O1xuXG5PYmplY3QuYXNzaWduKFNlc3Npb24ucHJvdG90eXBlLCB7XG4gIHNlbmRSZWFkeTogZnVuY3Rpb24gKHN1YnNjcmlwdGlvbklkcykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoc2VsZi5faXNTZW5kaW5nKSB7XG4gICAgICBzZWxmLnNlbmQoe21zZzogXCJyZWFkeVwiLCBzdWJzOiBzdWJzY3JpcHRpb25JZHN9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgc3Vic2NyaXB0aW9uSWRzLmZvckVhY2goZnVuY3Rpb24gKHN1YnNjcmlwdGlvbklkKSB7XG4gICAgICAgIHNlbGYuX3BlbmRpbmdSZWFkeS5wdXNoKHN1YnNjcmlwdGlvbklkKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfSxcblxuICBfY2FuU2VuZChjb2xsZWN0aW9uTmFtZSkge1xuICAgIHJldHVybiB0aGlzLl9pc1NlbmRpbmcgfHwgIXRoaXMuc2VydmVyLmdldFB1YmxpY2F0aW9uU3RyYXRlZ3koY29sbGVjdGlvbk5hbWUpLnVzZUNvbGxlY3Rpb25WaWV3O1xuICB9LFxuXG5cbiAgc2VuZEFkZGVkKGNvbGxlY3Rpb25OYW1lLCBpZCwgZmllbGRzKSB7XG4gICAgaWYgKHRoaXMuX2NhblNlbmQoY29sbGVjdGlvbk5hbWUpKSB7XG4gICAgICB0aGlzLnNlbmQoeyBtc2c6ICdhZGRlZCcsIGNvbGxlY3Rpb246IGNvbGxlY3Rpb25OYW1lLCBpZCwgZmllbGRzIH0pO1xuICAgIH1cbiAgfSxcblxuICBzZW5kQ2hhbmdlZChjb2xsZWN0aW9uTmFtZSwgaWQsIGZpZWxkcykge1xuICAgIGlmIChpc0VtcHR5KGZpZWxkcykpXG4gICAgICByZXR1cm47XG5cbiAgICBpZiAodGhpcy5fY2FuU2VuZChjb2xsZWN0aW9uTmFtZSkpIHtcbiAgICAgIHRoaXMuc2VuZCh7XG4gICAgICAgIG1zZzogXCJjaGFuZ2VkXCIsXG4gICAgICAgIGNvbGxlY3Rpb246IGNvbGxlY3Rpb25OYW1lLFxuICAgICAgICBpZCxcbiAgICAgICAgZmllbGRzXG4gICAgICB9KTtcbiAgICB9XG4gIH0sXG5cbiAgc2VuZFJlbW92ZWQoY29sbGVjdGlvbk5hbWUsIGlkKSB7XG4gICAgaWYgKHRoaXMuX2NhblNlbmQoY29sbGVjdGlvbk5hbWUpKSB7XG4gICAgICB0aGlzLnNlbmQoe21zZzogXCJyZW1vdmVkXCIsIGNvbGxlY3Rpb246IGNvbGxlY3Rpb25OYW1lLCBpZH0pO1xuICAgIH1cbiAgfSxcblxuICBnZXRTZW5kQ2FsbGJhY2tzOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHJldHVybiB7XG4gICAgICBhZGRlZDogc2VsZi5zZW5kQWRkZWQuYmluZChzZWxmKSxcbiAgICAgIGNoYW5nZWQ6IHNlbGYuc2VuZENoYW5nZWQuYmluZChzZWxmKSxcbiAgICAgIHJlbW92ZWQ6IHNlbGYuc2VuZFJlbW92ZWQuYmluZChzZWxmKVxuICAgIH07XG4gIH0sXG5cbiAgZ2V0Q29sbGVjdGlvblZpZXc6IGZ1bmN0aW9uIChjb2xsZWN0aW9uTmFtZSkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgcmV0ID0gc2VsZi5jb2xsZWN0aW9uVmlld3MuZ2V0KGNvbGxlY3Rpb25OYW1lKTtcbiAgICBpZiAoIXJldCkge1xuICAgICAgcmV0ID0gbmV3IFNlc3Npb25Db2xsZWN0aW9uVmlldyhjb2xsZWN0aW9uTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmdldFNlbmRDYWxsYmFja3MoKSk7XG4gICAgICBzZWxmLmNvbGxlY3Rpb25WaWV3cy5zZXQoY29sbGVjdGlvbk5hbWUsIHJldCk7XG4gICAgfVxuICAgIHJldHVybiByZXQ7XG4gIH0sXG5cbiAgYWRkZWQoc3Vic2NyaXB0aW9uSGFuZGxlLCBjb2xsZWN0aW9uTmFtZSwgaWQsIGZpZWxkcykge1xuICAgIGlmICh0aGlzLnNlcnZlci5nZXRQdWJsaWNhdGlvblN0cmF0ZWd5KGNvbGxlY3Rpb25OYW1lKS51c2VDb2xsZWN0aW9uVmlldykge1xuICAgICAgY29uc3QgdmlldyA9IHRoaXMuZ2V0Q29sbGVjdGlvblZpZXcoY29sbGVjdGlvbk5hbWUpO1xuICAgICAgdmlldy5hZGRlZChzdWJzY3JpcHRpb25IYW5kbGUsIGlkLCBmaWVsZHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnNlbmRBZGRlZChjb2xsZWN0aW9uTmFtZSwgaWQsIGZpZWxkcyk7XG4gICAgfVxuICB9LFxuXG4gIHJlbW92ZWQoc3Vic2NyaXB0aW9uSGFuZGxlLCBjb2xsZWN0aW9uTmFtZSwgaWQpIHtcbiAgICBpZiAodGhpcy5zZXJ2ZXIuZ2V0UHVibGljYXRpb25TdHJhdGVneShjb2xsZWN0aW9uTmFtZSkudXNlQ29sbGVjdGlvblZpZXcpIHtcbiAgICAgIGNvbnN0IHZpZXcgPSB0aGlzLmdldENvbGxlY3Rpb25WaWV3KGNvbGxlY3Rpb25OYW1lKTtcbiAgICAgIHZpZXcucmVtb3ZlZChzdWJzY3JpcHRpb25IYW5kbGUsIGlkKTtcbiAgICAgIGlmICh2aWV3LmlzRW1wdHkoKSkge1xuICAgICAgICAgdGhpcy5jb2xsZWN0aW9uVmlld3MuZGVsZXRlKGNvbGxlY3Rpb25OYW1lKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5zZW5kUmVtb3ZlZChjb2xsZWN0aW9uTmFtZSwgaWQpO1xuICAgIH1cbiAgfSxcblxuICBjaGFuZ2VkKHN1YnNjcmlwdGlvbkhhbmRsZSwgY29sbGVjdGlvbk5hbWUsIGlkLCBmaWVsZHMpIHtcbiAgICBpZiAodGhpcy5zZXJ2ZXIuZ2V0UHVibGljYXRpb25TdHJhdGVneShjb2xsZWN0aW9uTmFtZSkudXNlQ29sbGVjdGlvblZpZXcpIHtcbiAgICAgIGNvbnN0IHZpZXcgPSB0aGlzLmdldENvbGxlY3Rpb25WaWV3KGNvbGxlY3Rpb25OYW1lKTtcbiAgICAgIHZpZXcuY2hhbmdlZChzdWJzY3JpcHRpb25IYW5kbGUsIGlkLCBmaWVsZHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnNlbmRDaGFuZ2VkKGNvbGxlY3Rpb25OYW1lLCBpZCwgZmllbGRzKTtcbiAgICB9XG4gIH0sXG5cbiAgc3RhcnRVbml2ZXJzYWxTdWJzOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIC8vIE1ha2UgYSBzaGFsbG93IGNvcHkgb2YgdGhlIHNldCBvZiB1bml2ZXJzYWwgaGFuZGxlcnMgYW5kIHN0YXJ0IHRoZW0uIElmXG4gICAgLy8gYWRkaXRpb25hbCB1bml2ZXJzYWwgcHVibGlzaGVycyBzdGFydCB3aGlsZSB3ZSdyZSBydW5uaW5nIHRoZW0gKGR1ZSB0b1xuICAgIC8vIHlpZWxkaW5nKSwgdGhleSB3aWxsIHJ1biBzZXBhcmF0ZWx5IGFzIHBhcnQgb2YgU2VydmVyLnB1Ymxpc2guXG4gICAgdmFyIGhhbmRsZXJzID0gWy4uLnNlbGYuc2VydmVyLnVuaXZlcnNhbF9wdWJsaXNoX2hhbmRsZXJzXTtcbiAgICBoYW5kbGVycy5mb3JFYWNoKGZ1bmN0aW9uIChoYW5kbGVyKSB7XG4gICAgICBzZWxmLl9zdGFydFN1YnNjcmlwdGlvbihoYW5kbGVyKTtcbiAgICB9KTtcbiAgfSxcblxuICAvLyBEZXN0cm95IHRoaXMgc2Vzc2lvbiBhbmQgdW5yZWdpc3RlciBpdCBhdCB0aGUgc2VydmVyLlxuICBjbG9zZTogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIC8vIERlc3Ryb3kgdGhpcyBzZXNzaW9uLCBldmVuIGlmIGl0J3Mgbm90IHJlZ2lzdGVyZWQgYXQgdGhlXG4gICAgLy8gc2VydmVyLiBTdG9wIGFsbCBwcm9jZXNzaW5nIGFuZCB0ZWFyIGV2ZXJ5dGhpbmcgZG93bi4gSWYgYSBzb2NrZXRcbiAgICAvLyB3YXMgYXR0YWNoZWQsIGNsb3NlIGl0LlxuXG4gICAgLy8gQWxyZWFkeSBkZXN0cm95ZWQuXG4gICAgaWYgKCEgc2VsZi5pblF1ZXVlKVxuICAgICAgcmV0dXJuO1xuXG4gICAgLy8gRHJvcCB0aGUgbWVyZ2UgYm94IGRhdGEgaW1tZWRpYXRlbHkuXG4gICAgc2VsZi5pblF1ZXVlID0gbnVsbDtcbiAgICBzZWxmLmNvbGxlY3Rpb25WaWV3cyA9IG5ldyBNYXAoKTtcblxuICAgIGlmIChzZWxmLmhlYXJ0YmVhdCkge1xuICAgICAgc2VsZi5oZWFydGJlYXQuc3RvcCgpO1xuICAgICAgc2VsZi5oZWFydGJlYXQgPSBudWxsO1xuICAgIH1cblxuICAgIGlmIChzZWxmLnNvY2tldCkge1xuICAgICAgc2VsZi5zb2NrZXQuY2xvc2UoKTtcbiAgICAgIHNlbGYuc29ja2V0Ll9tZXRlb3JTZXNzaW9uID0gbnVsbDtcbiAgICB9XG5cbiAgICBQYWNrYWdlWydmYWN0cy1iYXNlJ10gJiYgUGFja2FnZVsnZmFjdHMtYmFzZSddLkZhY3RzLmluY3JlbWVudFNlcnZlckZhY3QoXG4gICAgICBcImxpdmVkYXRhXCIsIFwic2Vzc2lvbnNcIiwgLTEpO1xuXG4gICAgTWV0ZW9yLmRlZmVyKGZ1bmN0aW9uICgpIHtcbiAgICAgIC8vIFN0b3AgY2FsbGJhY2tzIGNhbiB5aWVsZCwgc28gd2UgZGVmZXIgdGhpcyBvbiBjbG9zZS5cbiAgICAgIC8vIHN1Yi5faXNEZWFjdGl2YXRlZCgpIGRldGVjdHMgdGhhdCB3ZSBzZXQgaW5RdWV1ZSB0byBudWxsIGFuZFxuICAgICAgLy8gdHJlYXRzIGl0IGFzIHNlbWktZGVhY3RpdmF0ZWQgKGl0IHdpbGwgaWdub3JlIGluY29taW5nIGNhbGxiYWNrcywgZXRjKS5cbiAgICAgIHNlbGYuX2RlYWN0aXZhdGVBbGxTdWJzY3JpcHRpb25zKCk7XG5cbiAgICAgIC8vIERlZmVyIGNhbGxpbmcgdGhlIGNsb3NlIGNhbGxiYWNrcywgc28gdGhhdCB0aGUgY2FsbGVyIGNsb3NpbmdcbiAgICAgIC8vIHRoZSBzZXNzaW9uIGlzbid0IHdhaXRpbmcgZm9yIGFsbCB0aGUgY2FsbGJhY2tzIHRvIGNvbXBsZXRlLlxuICAgICAgc2VsZi5fY2xvc2VDYWxsYmFja3MuZm9yRWFjaChmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgLy8gVW5yZWdpc3RlciB0aGUgc2Vzc2lvbi5cbiAgICBzZWxmLnNlcnZlci5fcmVtb3ZlU2Vzc2lvbihzZWxmKTtcbiAgfSxcblxuICAvLyBTZW5kIGEgbWVzc2FnZSAoZG9pbmcgbm90aGluZyBpZiBubyBzb2NrZXQgaXMgY29ubmVjdGVkIHJpZ2h0IG5vdykuXG4gIC8vIEl0IHNob3VsZCBiZSBhIEpTT04gb2JqZWN0IChpdCB3aWxsIGJlIHN0cmluZ2lmaWVkKS5cbiAgc2VuZDogZnVuY3Rpb24gKG1zZykge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGlmIChzZWxmLnNvY2tldCkge1xuICAgICAgaWYgKE1ldGVvci5fcHJpbnRTZW50RERQKVxuICAgICAgICBNZXRlb3IuX2RlYnVnKFwiU2VudCBERFBcIiwgRERQQ29tbW9uLnN0cmluZ2lmeUREUChtc2cpKTtcbiAgICAgIHNlbGYuc29ja2V0LnNlbmQoRERQQ29tbW9uLnN0cmluZ2lmeUREUChtc2cpKTtcbiAgICB9XG4gIH0sXG5cbiAgLy8gU2VuZCBhIGNvbm5lY3Rpb24gZXJyb3IuXG4gIHNlbmRFcnJvcjogZnVuY3Rpb24gKHJlYXNvbiwgb2ZmZW5kaW5nTWVzc2FnZSkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgbXNnID0ge21zZzogJ2Vycm9yJywgcmVhc29uOiByZWFzb259O1xuICAgIGlmIChvZmZlbmRpbmdNZXNzYWdlKVxuICAgICAgbXNnLm9mZmVuZGluZ01lc3NhZ2UgPSBvZmZlbmRpbmdNZXNzYWdlO1xuICAgIHNlbGYuc2VuZChtc2cpO1xuICB9LFxuXG4gIC8vIFByb2Nlc3MgJ21zZycgYXMgYW4gaW5jb21pbmcgbWVzc2FnZS4gQXMgYSBndWFyZCBhZ2FpbnN0XG4gIC8vIHJhY2UgY29uZGl0aW9ucyBkdXJpbmcgcmVjb25uZWN0aW9uLCBpZ25vcmUgdGhlIG1lc3NhZ2UgaWZcbiAgLy8gJ3NvY2tldCcgaXMgbm90IHRoZSBjdXJyZW50bHkgY29ubmVjdGVkIHNvY2tldC5cbiAgLy9cbiAgLy8gV2UgcnVuIHRoZSBtZXNzYWdlcyBmcm9tIHRoZSBjbGllbnQgb25lIGF0IGEgdGltZSwgaW4gdGhlIG9yZGVyXG4gIC8vIGdpdmVuIGJ5IHRoZSBjbGllbnQuIFRoZSBtZXNzYWdlIGhhbmRsZXIgaXMgcGFzc2VkIGFuIGlkZW1wb3RlbnRcbiAgLy8gZnVuY3Rpb24gJ3VuYmxvY2snIHdoaWNoIGl0IG1heSBjYWxsIHRvIGFsbG93IG90aGVyIG1lc3NhZ2VzIHRvXG4gIC8vIGJlZ2luIHJ1bm5pbmcgaW4gcGFyYWxsZWwgaW4gYW5vdGhlciBmaWJlciAoZm9yIGV4YW1wbGUsIGEgbWV0aG9kXG4gIC8vIHRoYXQgd2FudHMgdG8geWllbGQpLiBPdGhlcndpc2UsIGl0IGlzIGF1dG9tYXRpY2FsbHkgdW5ibG9ja2VkXG4gIC8vIHdoZW4gaXQgcmV0dXJucy5cbiAgLy9cbiAgLy8gQWN0dWFsbHksIHdlIGRvbid0IGhhdmUgdG8gJ3RvdGFsbHkgb3JkZXInIHRoZSBtZXNzYWdlcyBpbiB0aGlzXG4gIC8vIHdheSwgYnV0IGl0J3MgdGhlIGVhc2llc3QgdGhpbmcgdGhhdCdzIGNvcnJlY3QuICh1bnN1YiBuZWVkcyB0b1xuICAvLyBiZSBvcmRlcmVkIGFnYWluc3Qgc3ViLCBtZXRob2RzIG5lZWQgdG8gYmUgb3JkZXJlZCBhZ2FpbnN0IGVhY2hcbiAgLy8gb3RoZXIpLlxuICBwcm9jZXNzTWVzc2FnZTogZnVuY3Rpb24gKG1zZ19pbikge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoIXNlbGYuaW5RdWV1ZSkgLy8gd2UgaGF2ZSBiZWVuIGRlc3Ryb3llZC5cbiAgICAgIHJldHVybjtcblxuICAgIC8vIFJlc3BvbmQgdG8gcGluZyBhbmQgcG9uZyBtZXNzYWdlcyBpbW1lZGlhdGVseSB3aXRob3V0IHF1ZXVpbmcuXG4gICAgLy8gSWYgdGhlIG5lZ290aWF0ZWQgRERQIHZlcnNpb24gaXMgXCJwcmUxXCIgd2hpY2ggZGlkbid0IHN1cHBvcnRcbiAgICAvLyBwaW5ncywgcHJlc2VydmUgdGhlIFwicHJlMVwiIGJlaGF2aW9yIG9mIHJlc3BvbmRpbmcgd2l0aCBhIFwiYmFkXG4gICAgLy8gcmVxdWVzdFwiIGZvciB0aGUgdW5rbm93biBtZXNzYWdlcy5cbiAgICAvL1xuICAgIC8vIEZpYmVycyBhcmUgbmVlZGVkIGJlY2F1c2UgaGVhcnRiZWF0cyB1c2UgTWV0ZW9yLnNldFRpbWVvdXQsIHdoaWNoXG4gICAgLy8gbmVlZHMgYSBGaWJlci4gV2UgY291bGQgYWN0dWFsbHkgdXNlIHJlZ3VsYXIgc2V0VGltZW91dCBhbmQgYXZvaWRcbiAgICAvLyB0aGVzZSBuZXcgZmliZXJzLCBidXQgaXQgaXMgZWFzaWVyIHRvIGp1c3QgbWFrZSBldmVyeXRoaW5nIHVzZVxuICAgIC8vIE1ldGVvci5zZXRUaW1lb3V0IGFuZCBub3QgdGhpbmsgdG9vIGhhcmQuXG4gICAgLy9cbiAgICAvLyBBbnkgbWVzc2FnZSBjb3VudHMgYXMgcmVjZWl2aW5nIGEgcG9uZywgYXMgaXQgZGVtb25zdHJhdGVzIHRoYXRcbiAgICAvLyB0aGUgY2xpZW50IGlzIHN0aWxsIGFsaXZlLlxuICAgIGlmIChzZWxmLmhlYXJ0YmVhdCkge1xuICAgICAgc2VsZi5oZWFydGJlYXQubWVzc2FnZVJlY2VpdmVkKCk7XG4gICAgfTtcblxuICAgIGlmIChzZWxmLnZlcnNpb24gIT09ICdwcmUxJyAmJiBtc2dfaW4ubXNnID09PSAncGluZycpIHtcbiAgICAgIGlmIChzZWxmLl9yZXNwb25kVG9QaW5ncylcbiAgICAgICAgc2VsZi5zZW5kKHttc2c6IFwicG9uZ1wiLCBpZDogbXNnX2luLmlkfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChzZWxmLnZlcnNpb24gIT09ICdwcmUxJyAmJiBtc2dfaW4ubXNnID09PSAncG9uZycpIHtcbiAgICAgIC8vIFNpbmNlIGV2ZXJ5dGhpbmcgaXMgYSBwb25nLCB0aGVyZSBpcyBub3RoaW5nIHRvIGRvXG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgc2VsZi5pblF1ZXVlLnB1c2gobXNnX2luKTtcbiAgICBpZiAoc2VsZi53b3JrZXJSdW5uaW5nKVxuICAgICAgcmV0dXJuO1xuICAgIHNlbGYud29ya2VyUnVubmluZyA9IHRydWU7XG5cbiAgICB2YXIgcHJvY2Vzc05leHQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgbXNnID0gc2VsZi5pblF1ZXVlICYmIHNlbGYuaW5RdWV1ZS5zaGlmdCgpO1xuXG4gICAgICBpZiAoIW1zZykge1xuICAgICAgICBzZWxmLndvcmtlclJ1bm5pbmcgPSBmYWxzZTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBydW5IYW5kbGVycygpIHtcbiAgICAgICAgdmFyIGJsb2NrZWQgPSB0cnVlO1xuXG4gICAgICAgIHZhciB1bmJsb2NrID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGlmICghYmxvY2tlZClcbiAgICAgICAgICAgIHJldHVybjsgLy8gaWRlbXBvdGVudFxuICAgICAgICAgIGJsb2NrZWQgPSBmYWxzZTtcbiAgICAgICAgICBzZXRJbW1lZGlhdGUocHJvY2Vzc05leHQpO1xuICAgICAgICB9O1xuXG4gICAgICAgIHNlbGYuc2VydmVyLm9uTWVzc2FnZUhvb2suZWFjaChmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgICBjYWxsYmFjayhtc2csIHNlbGYpO1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAobXNnLm1zZyBpbiBzZWxmLnByb3RvY29sX2hhbmRsZXJzKSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gc2VsZi5wcm90b2NvbF9oYW5kbGVyc1ttc2cubXNnXS5jYWxsKFxuICAgICAgICAgICAgc2VsZixcbiAgICAgICAgICAgIG1zZyxcbiAgICAgICAgICAgIHVuYmxvY2tcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgaWYgKE1ldGVvci5faXNQcm9taXNlKHJlc3VsdCkpIHtcbiAgICAgICAgICAgIHJlc3VsdC5maW5hbGx5KCgpID0+IHVuYmxvY2soKSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHVuYmxvY2soKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc2VsZi5zZW5kRXJyb3IoJ0JhZCByZXF1ZXN0JywgbXNnKTtcbiAgICAgICAgICB1bmJsb2NrKCk7IC8vIGluIGNhc2UgdGhlIGhhbmRsZXIgZGlkbid0IGFscmVhZHkgZG8gaXRcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBydW5IYW5kbGVycygpO1xuICAgIH07XG5cbiAgICBwcm9jZXNzTmV4dCgpO1xuICB9LFxuXG4gIHByb3RvY29sX2hhbmRsZXJzOiB7XG4gICAgc3ViOiBhc3luYyBmdW5jdGlvbiAobXNnLCB1bmJsb2NrKSB7XG4gICAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAgIC8vIGNhY2hlVW5ibG9jayB0ZW1wb3Jhcmx5LCBzbyB3ZSBjYW4gY2FwdHVyZSBpdCBsYXRlclxuICAgICAgLy8gd2Ugd2lsbCB1c2UgdW5ibG9jayBpbiBjdXJyZW50IGV2ZW50TG9vcCwgc28gdGhpcyBpcyBzYWZlXG4gICAgICBzZWxmLmNhY2hlZFVuYmxvY2sgPSB1bmJsb2NrO1xuXG4gICAgICAvLyByZWplY3QgbWFsZm9ybWVkIG1lc3NhZ2VzXG4gICAgICBpZiAodHlwZW9mIChtc2cuaWQpICE9PSBcInN0cmluZ1wiIHx8XG4gICAgICAgICAgdHlwZW9mIChtc2cubmFtZSkgIT09IFwic3RyaW5nXCIgfHxcbiAgICAgICAgICAoJ3BhcmFtcycgaW4gbXNnICYmICEobXNnLnBhcmFtcyBpbnN0YW5jZW9mIEFycmF5KSkpIHtcbiAgICAgICAgc2VsZi5zZW5kRXJyb3IoXCJNYWxmb3JtZWQgc3Vic2NyaXB0aW9uXCIsIG1zZyk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKCFzZWxmLnNlcnZlci5wdWJsaXNoX2hhbmRsZXJzW21zZy5uYW1lXSkge1xuICAgICAgICBzZWxmLnNlbmQoe1xuICAgICAgICAgIG1zZzogJ25vc3ViJywgaWQ6IG1zZy5pZCxcbiAgICAgICAgICBlcnJvcjogbmV3IE1ldGVvci5FcnJvcig0MDQsIGBTdWJzY3JpcHRpb24gJyR7bXNnLm5hbWV9JyBub3QgZm91bmRgKX0pO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmIChzZWxmLl9uYW1lZFN1YnMuaGFzKG1zZy5pZCkpXG4gICAgICAgIC8vIHN1YnMgYXJlIGlkZW1wb3RlbnQsIG9yIHJhdGhlciwgdGhleSBhcmUgaWdub3JlZCBpZiBhIHN1YlxuICAgICAgICAvLyB3aXRoIHRoYXQgaWQgYWxyZWFkeSBleGlzdHMuIHRoaXMgaXMgaW1wb3J0YW50IGR1cmluZ1xuICAgICAgICAvLyByZWNvbm5lY3QuXG4gICAgICAgIHJldHVybjtcblxuICAgICAgLy8gWFhYIEl0J2QgYmUgbXVjaCBiZXR0ZXIgaWYgd2UgaGFkIGdlbmVyaWMgaG9va3Mgd2hlcmUgYW55IHBhY2thZ2UgY2FuXG4gICAgICAvLyBob29rIGludG8gc3Vic2NyaXB0aW9uIGhhbmRsaW5nLCBidXQgaW4gdGhlIG1lYW4gd2hpbGUgd2Ugc3BlY2lhbCBjYXNlXG4gICAgICAvLyBkZHAtcmF0ZS1saW1pdGVyIHBhY2thZ2UuIFRoaXMgaXMgYWxzbyBkb25lIGZvciB3ZWFrIHJlcXVpcmVtZW50cyB0b1xuICAgICAgLy8gYWRkIHRoZSBkZHAtcmF0ZS1saW1pdGVyIHBhY2thZ2UgaW4gY2FzZSB3ZSBkb24ndCBoYXZlIEFjY291bnRzLiBBXG4gICAgICAvLyB1c2VyIHRyeWluZyB0byB1c2UgdGhlIGRkcC1yYXRlLWxpbWl0ZXIgbXVzdCBleHBsaWNpdGx5IHJlcXVpcmUgaXQuXG4gICAgICBpZiAoUGFja2FnZVsnZGRwLXJhdGUtbGltaXRlciddKSB7XG4gICAgICAgIHZhciBERFBSYXRlTGltaXRlciA9IFBhY2thZ2VbJ2RkcC1yYXRlLWxpbWl0ZXInXS5ERFBSYXRlTGltaXRlcjtcbiAgICAgICAgdmFyIHJhdGVMaW1pdGVySW5wdXQgPSB7XG4gICAgICAgICAgdXNlcklkOiBzZWxmLnVzZXJJZCxcbiAgICAgICAgICBjbGllbnRBZGRyZXNzOiBzZWxmLmNvbm5lY3Rpb25IYW5kbGUuY2xpZW50QWRkcmVzcyxcbiAgICAgICAgICB0eXBlOiBcInN1YnNjcmlwdGlvblwiLFxuICAgICAgICAgIG5hbWU6IG1zZy5uYW1lLFxuICAgICAgICAgIGNvbm5lY3Rpb25JZDogc2VsZi5pZFxuICAgICAgICB9O1xuXG4gICAgICAgIEREUFJhdGVMaW1pdGVyLl9pbmNyZW1lbnQocmF0ZUxpbWl0ZXJJbnB1dCk7XG4gICAgICAgIHZhciByYXRlTGltaXRSZXN1bHQgPSBERFBSYXRlTGltaXRlci5fY2hlY2socmF0ZUxpbWl0ZXJJbnB1dCk7XG4gICAgICAgIGlmICghcmF0ZUxpbWl0UmVzdWx0LmFsbG93ZWQpIHtcbiAgICAgICAgICBzZWxmLnNlbmQoe1xuICAgICAgICAgICAgbXNnOiAnbm9zdWInLCBpZDogbXNnLmlkLFxuICAgICAgICAgICAgZXJyb3I6IG5ldyBNZXRlb3IuRXJyb3IoXG4gICAgICAgICAgICAgICd0b28tbWFueS1yZXF1ZXN0cycsXG4gICAgICAgICAgICAgIEREUFJhdGVMaW1pdGVyLmdldEVycm9yTWVzc2FnZShyYXRlTGltaXRSZXN1bHQpLFxuICAgICAgICAgICAgICB7dGltZVRvUmVzZXQ6IHJhdGVMaW1pdFJlc3VsdC50aW1lVG9SZXNldH0pXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHZhciBoYW5kbGVyID0gc2VsZi5zZXJ2ZXIucHVibGlzaF9oYW5kbGVyc1ttc2cubmFtZV07XG5cbiAgICAgIGF3YWl0IHNlbGYuX3N0YXJ0U3Vic2NyaXB0aW9uKGhhbmRsZXIsIG1zZy5pZCwgbXNnLnBhcmFtcywgbXNnLm5hbWUpO1xuXG4gICAgICAvLyBjbGVhbmluZyBjYWNoZWQgdW5ibG9ja1xuICAgICAgc2VsZi5jYWNoZWRVbmJsb2NrID0gbnVsbDtcbiAgICB9LFxuXG4gICAgdW5zdWI6IGZ1bmN0aW9uIChtc2cpIHtcbiAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgc2VsZi5fc3RvcFN1YnNjcmlwdGlvbihtc2cuaWQpO1xuICAgIH0sXG5cbiAgICBtZXRob2Q6IGFzeW5jIGZ1bmN0aW9uIChtc2csIHVuYmxvY2spIHtcbiAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgLy8gUmVqZWN0IG1hbGZvcm1lZCBtZXNzYWdlcy5cbiAgICAgIC8vIEZvciBub3csIHdlIHNpbGVudGx5IGlnbm9yZSB1bmtub3duIGF0dHJpYnV0ZXMsXG4gICAgICAvLyBmb3IgZm9yd2FyZHMgY29tcGF0aWJpbGl0eS5cbiAgICAgIGlmICh0eXBlb2YgKG1zZy5pZCkgIT09IFwic3RyaW5nXCIgfHxcbiAgICAgICAgICB0eXBlb2YgKG1zZy5tZXRob2QpICE9PSBcInN0cmluZ1wiIHx8XG4gICAgICAgICAgKCdwYXJhbXMnIGluIG1zZyAmJiAhKG1zZy5wYXJhbXMgaW5zdGFuY2VvZiBBcnJheSkpIHx8XG4gICAgICAgICAgKCgncmFuZG9tU2VlZCcgaW4gbXNnKSAmJiAodHlwZW9mIG1zZy5yYW5kb21TZWVkICE9PSBcInN0cmluZ1wiKSkpIHtcbiAgICAgICAgc2VsZi5zZW5kRXJyb3IoXCJNYWxmb3JtZWQgbWV0aG9kIGludm9jYXRpb25cIiwgbXNnKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICB2YXIgcmFuZG9tU2VlZCA9IG1zZy5yYW5kb21TZWVkIHx8IG51bGw7XG5cbiAgICAgIC8vIFNldCB1cCB0byBtYXJrIHRoZSBtZXRob2QgYXMgc2F0aXNmaWVkIG9uY2UgYWxsIG9ic2VydmVyc1xuICAgICAgLy8gKGFuZCBzdWJzY3JpcHRpb25zKSBoYXZlIHJlYWN0ZWQgdG8gYW55IHdyaXRlcyB0aGF0IHdlcmVcbiAgICAgIC8vIGRvbmUuXG4gICAgICB2YXIgZmVuY2UgPSBuZXcgRERQU2VydmVyLl9Xcml0ZUZlbmNlO1xuICAgICAgZmVuY2Uub25BbGxDb21taXR0ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBSZXRpcmUgdGhlIGZlbmNlIHNvIHRoYXQgZnV0dXJlIHdyaXRlcyBhcmUgYWxsb3dlZC5cbiAgICAgICAgLy8gVGhpcyBtZWFucyB0aGF0IGNhbGxiYWNrcyBsaWtlIHRpbWVycyBhcmUgZnJlZSB0byB1c2VcbiAgICAgICAgLy8gdGhlIGZlbmNlLCBhbmQgaWYgdGhleSBmaXJlIGJlZm9yZSBpdCdzIGFybWVkIChmb3JcbiAgICAgICAgLy8gZXhhbXBsZSwgYmVjYXVzZSB0aGUgbWV0aG9kIHdhaXRzIGZvciB0aGVtKSB0aGVpclxuICAgICAgICAvLyB3cml0ZXMgd2lsbCBiZSBpbmNsdWRlZCBpbiB0aGUgZmVuY2UuXG4gICAgICAgIGZlbmNlLnJldGlyZSgpO1xuICAgICAgICBzZWxmLnNlbmQoe21zZzogJ3VwZGF0ZWQnLCBtZXRob2RzOiBbbXNnLmlkXX0pO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIEZpbmQgdGhlIGhhbmRsZXJcbiAgICAgIHZhciBoYW5kbGVyID0gc2VsZi5zZXJ2ZXIubWV0aG9kX2hhbmRsZXJzW21zZy5tZXRob2RdO1xuICAgICAgaWYgKCFoYW5kbGVyKSB7XG4gICAgICAgIHNlbGYuc2VuZCh7XG4gICAgICAgICAgbXNnOiAncmVzdWx0JywgaWQ6IG1zZy5pZCxcbiAgICAgICAgICBlcnJvcjogbmV3IE1ldGVvci5FcnJvcig0MDQsIGBNZXRob2QgJyR7bXNnLm1ldGhvZH0nIG5vdCBmb3VuZGApfSk7XG4gICAgICAgIGF3YWl0IGZlbmNlLmFybSgpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHZhciBpbnZvY2F0aW9uID0gbmV3IEREUENvbW1vbi5NZXRob2RJbnZvY2F0aW9uKHtcbiAgICAgICAgbmFtZTogbXNnLm1ldGhvZCxcbiAgICAgICAgaXNTaW11bGF0aW9uOiBmYWxzZSxcbiAgICAgICAgdXNlcklkOiBzZWxmLnVzZXJJZCxcbiAgICAgICAgc2V0VXNlcklkKHVzZXJJZCkge1xuICAgICAgICAgIHJldHVybiBzZWxmLl9zZXRVc2VySWQodXNlcklkKTtcbiAgICAgICAgfSxcbiAgICAgICAgdW5ibG9jazogdW5ibG9jayxcbiAgICAgICAgY29ubmVjdGlvbjogc2VsZi5jb25uZWN0aW9uSGFuZGxlLFxuICAgICAgICByYW5kb21TZWVkOiByYW5kb21TZWVkLFxuICAgICAgICBmZW5jZSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAvLyBYWFggSXQnZCBiZSBiZXR0ZXIgaWYgd2UgY291bGQgaG9vayBpbnRvIG1ldGhvZCBoYW5kbGVycyBiZXR0ZXIgYnV0XG4gICAgICAgIC8vIGZvciBub3csIHdlIG5lZWQgdG8gY2hlY2sgaWYgdGhlIGRkcC1yYXRlLWxpbWl0ZXIgZXhpc3RzIHNpbmNlIHdlXG4gICAgICAgIC8vIGhhdmUgYSB3ZWFrIHJlcXVpcmVtZW50IGZvciB0aGUgZGRwLXJhdGUtbGltaXRlciBwYWNrYWdlIHRvIGJlIGFkZGVkXG4gICAgICAgIC8vIHRvIG91ciBhcHBsaWNhdGlvbi5cbiAgICAgICAgaWYgKFBhY2thZ2VbJ2RkcC1yYXRlLWxpbWl0ZXInXSkge1xuICAgICAgICAgIHZhciBERFBSYXRlTGltaXRlciA9IFBhY2thZ2VbJ2RkcC1yYXRlLWxpbWl0ZXInXS5ERFBSYXRlTGltaXRlcjtcbiAgICAgICAgICB2YXIgcmF0ZUxpbWl0ZXJJbnB1dCA9IHtcbiAgICAgICAgICAgIHVzZXJJZDogc2VsZi51c2VySWQsXG4gICAgICAgICAgICBjbGllbnRBZGRyZXNzOiBzZWxmLmNvbm5lY3Rpb25IYW5kbGUuY2xpZW50QWRkcmVzcyxcbiAgICAgICAgICAgIHR5cGU6IFwibWV0aG9kXCIsXG4gICAgICAgICAgICBuYW1lOiBtc2cubWV0aG9kLFxuICAgICAgICAgICAgY29ubmVjdGlvbklkOiBzZWxmLmlkXG4gICAgICAgICAgfTtcbiAgICAgICAgICBERFBSYXRlTGltaXRlci5faW5jcmVtZW50KHJhdGVMaW1pdGVySW5wdXQpO1xuICAgICAgICAgIHZhciByYXRlTGltaXRSZXN1bHQgPSBERFBSYXRlTGltaXRlci5fY2hlY2socmF0ZUxpbWl0ZXJJbnB1dClcbiAgICAgICAgICBpZiAoIXJhdGVMaW1pdFJlc3VsdC5hbGxvd2VkKSB7XG4gICAgICAgICAgICByZWplY3QobmV3IE1ldGVvci5FcnJvcihcbiAgICAgICAgICAgICAgXCJ0b28tbWFueS1yZXF1ZXN0c1wiLFxuICAgICAgICAgICAgICBERFBSYXRlTGltaXRlci5nZXRFcnJvck1lc3NhZ2UocmF0ZUxpbWl0UmVzdWx0KSxcbiAgICAgICAgICAgICAge3RpbWVUb1Jlc2V0OiByYXRlTGltaXRSZXN1bHQudGltZVRvUmVzZXR9XG4gICAgICAgICAgICApKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXNvbHZlKEREUFNlcnZlci5fQ3VycmVudFdyaXRlRmVuY2Uud2l0aFZhbHVlKFxuICAgICAgICAgIGZlbmNlLFxuICAgICAgICAgICgpID0+IEREUC5fQ3VycmVudE1ldGhvZEludm9jYXRpb24ud2l0aFZhbHVlKFxuICAgICAgICAgICAgaW52b2NhdGlvbixcbiAgICAgICAgICAgICgpID0+IG1heWJlQXVkaXRBcmd1bWVudENoZWNrcyhcbiAgICAgICAgICAgICAgaGFuZGxlciwgaW52b2NhdGlvbiwgbXNnLnBhcmFtcyxcbiAgICAgICAgICAgICAgXCJjYWxsIHRvICdcIiArIG1zZy5tZXRob2QgKyBcIidcIlxuICAgICAgICAgICAgKVxuICAgICAgICAgIClcbiAgICAgICAgKSk7XG4gICAgICB9KTtcblxuICAgICAgYXN5bmMgZnVuY3Rpb24gZmluaXNoKCkge1xuICAgICAgICBhd2FpdCBmZW5jZS5hcm0oKTtcbiAgICAgICAgdW5ibG9jaygpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBwYXlsb2FkID0ge1xuICAgICAgICBtc2c6IFwicmVzdWx0XCIsXG4gICAgICAgIGlkOiBtc2cuaWRcbiAgICAgIH07XG4gICAgICByZXR1cm4gcHJvbWlzZS50aGVuKGFzeW5jIHJlc3VsdCA9PiB7XG4gICAgICAgIGF3YWl0IGZpbmlzaCgpO1xuICAgICAgICBpZiAocmVzdWx0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBwYXlsb2FkLnJlc3VsdCA9IHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICBzZWxmLnNlbmQocGF5bG9hZCk7XG4gICAgICB9LCBhc3luYyAoZXhjZXB0aW9uKSA9PiB7XG4gICAgICAgIGF3YWl0IGZpbmlzaCgpO1xuICAgICAgICBwYXlsb2FkLmVycm9yID0gd3JhcEludGVybmFsRXhjZXB0aW9uKFxuICAgICAgICAgIGV4Y2VwdGlvbixcbiAgICAgICAgICBgd2hpbGUgaW52b2tpbmcgbWV0aG9kICcke21zZy5tZXRob2R9J2BcbiAgICAgICAgKTtcbiAgICAgICAgc2VsZi5zZW5kKHBheWxvYWQpO1xuICAgICAgfSk7XG4gICAgfVxuICB9LFxuXG4gIF9lYWNoU3ViOiBmdW5jdGlvbiAoZikge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBzZWxmLl9uYW1lZFN1YnMuZm9yRWFjaChmKTtcbiAgICBzZWxmLl91bml2ZXJzYWxTdWJzLmZvckVhY2goZik7XG4gIH0sXG5cbiAgX2RpZmZDb2xsZWN0aW9uVmlld3M6IGZ1bmN0aW9uIChiZWZvcmVDVnMpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgRGlmZlNlcXVlbmNlLmRpZmZNYXBzKGJlZm9yZUNWcywgc2VsZi5jb2xsZWN0aW9uVmlld3MsIHtcbiAgICAgIGJvdGg6IGZ1bmN0aW9uIChjb2xsZWN0aW9uTmFtZSwgbGVmdFZhbHVlLCByaWdodFZhbHVlKSB7XG4gICAgICAgIHJpZ2h0VmFsdWUuZGlmZihsZWZ0VmFsdWUpO1xuICAgICAgfSxcbiAgICAgIHJpZ2h0T25seTogZnVuY3Rpb24gKGNvbGxlY3Rpb25OYW1lLCByaWdodFZhbHVlKSB7XG4gICAgICAgIHJpZ2h0VmFsdWUuZG9jdW1lbnRzLmZvckVhY2goZnVuY3Rpb24gKGRvY1ZpZXcsIGlkKSB7XG4gICAgICAgICAgc2VsZi5zZW5kQWRkZWQoY29sbGVjdGlvbk5hbWUsIGlkLCBkb2NWaWV3LmdldEZpZWxkcygpKTtcbiAgICAgICAgfSk7XG4gICAgICB9LFxuICAgICAgbGVmdE9ubHk6IGZ1bmN0aW9uIChjb2xsZWN0aW9uTmFtZSwgbGVmdFZhbHVlKSB7XG4gICAgICAgIGxlZnRWYWx1ZS5kb2N1bWVudHMuZm9yRWFjaChmdW5jdGlvbiAoZG9jLCBpZCkge1xuICAgICAgICAgIHNlbGYuc2VuZFJlbW92ZWQoY29sbGVjdGlvbk5hbWUsIGlkKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0sXG5cbiAgLy8gU2V0cyB0aGUgY3VycmVudCB1c2VyIGlkIGluIGFsbCBhcHByb3ByaWF0ZSBjb250ZXh0cyBhbmQgcmVydW5zXG4gIC8vIGFsbCBzdWJzY3JpcHRpb25zXG4gIGFzeW5jIF9zZXRVc2VySWQodXNlcklkKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgaWYgKHVzZXJJZCAhPT0gbnVsbCAmJiB0eXBlb2YgdXNlcklkICE9PSBcInN0cmluZ1wiKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwic2V0VXNlcklkIG11c3QgYmUgY2FsbGVkIG9uIHN0cmluZyBvciBudWxsLCBub3QgXCIgK1xuICAgICAgICAgICAgICAgICAgICAgIHR5cGVvZiB1c2VySWQpO1xuXG4gICAgLy8gUHJldmVudCBuZXdseS1jcmVhdGVkIHVuaXZlcnNhbCBzdWJzY3JpcHRpb25zIGZyb20gYmVpbmcgYWRkZWQgdG8gb3VyXG4gICAgLy8gc2Vzc2lvbi4gVGhleSB3aWxsIGJlIGZvdW5kIGJlbG93IHdoZW4gd2UgY2FsbCBzdGFydFVuaXZlcnNhbFN1YnMuXG4gICAgLy9cbiAgICAvLyAoV2UgZG9uJ3QgaGF2ZSB0byB3b3JyeSBhYm91dCBuYW1lZCBzdWJzY3JpcHRpb25zLCBiZWNhdXNlIHdlIG9ubHkgYWRkXG4gICAgLy8gdGhlbSB3aGVuIHdlIHByb2Nlc3MgYSAnc3ViJyBtZXNzYWdlLiBXZSBhcmUgY3VycmVudGx5IHByb2Nlc3NpbmcgYVxuICAgIC8vICdtZXRob2QnIG1lc3NhZ2UsIGFuZCB0aGUgbWV0aG9kIGRpZCBub3QgdW5ibG9jaywgYmVjYXVzZSBpdCBpcyBpbGxlZ2FsXG4gICAgLy8gdG8gY2FsbCBzZXRVc2VySWQgYWZ0ZXIgdW5ibG9jay4gVGh1cyB3ZSBjYW5ub3QgYmUgY29uY3VycmVudGx5IGFkZGluZyBhXG4gICAgLy8gbmV3IG5hbWVkIHN1YnNjcmlwdGlvbikuXG4gICAgc2VsZi5fZG9udFN0YXJ0TmV3VW5pdmVyc2FsU3VicyA9IHRydWU7XG5cbiAgICAvLyBQcmV2ZW50IGN1cnJlbnQgc3VicyBmcm9tIHVwZGF0aW5nIG91ciBjb2xsZWN0aW9uVmlld3MgYW5kIGNhbGwgdGhlaXJcbiAgICAvLyBzdG9wIGNhbGxiYWNrcy4gVGhpcyBtYXkgeWllbGQuXG4gICAgc2VsZi5fZWFjaFN1YihmdW5jdGlvbiAoc3ViKSB7XG4gICAgICBzdWIuX2RlYWN0aXZhdGUoKTtcbiAgICB9KTtcblxuICAgIC8vIEFsbCBzdWJzIHNob3VsZCBub3cgYmUgZGVhY3RpdmF0ZWQuIFN0b3Agc2VuZGluZyBtZXNzYWdlcyB0byB0aGUgY2xpZW50LFxuICAgIC8vIHNhdmUgdGhlIHN0YXRlIG9mIHRoZSBwdWJsaXNoZWQgY29sbGVjdGlvbnMsIHJlc2V0IHRvIGFuIGVtcHR5IHZpZXcsIGFuZFxuICAgIC8vIHVwZGF0ZSB0aGUgdXNlcklkLlxuICAgIHNlbGYuX2lzU2VuZGluZyA9IGZhbHNlO1xuICAgIHZhciBiZWZvcmVDVnMgPSBzZWxmLmNvbGxlY3Rpb25WaWV3cztcbiAgICBzZWxmLmNvbGxlY3Rpb25WaWV3cyA9IG5ldyBNYXAoKTtcbiAgICBzZWxmLnVzZXJJZCA9IHVzZXJJZDtcblxuICAgIC8vIF9zZXRVc2VySWQgaXMgbm9ybWFsbHkgY2FsbGVkIGZyb20gYSBNZXRlb3IgbWV0aG9kIHdpdGhcbiAgICAvLyBERFAuX0N1cnJlbnRNZXRob2RJbnZvY2F0aW9uIHNldC4gQnV0IEREUC5fQ3VycmVudE1ldGhvZEludm9jYXRpb24gaXMgbm90XG4gICAgLy8gZXhwZWN0ZWQgdG8gYmUgc2V0IGluc2lkZSBhIHB1Ymxpc2ggZnVuY3Rpb24sIHNvIHdlIHRlbXBvcmFyeSB1bnNldCBpdC5cbiAgICAvLyBJbnNpZGUgYSBwdWJsaXNoIGZ1bmN0aW9uIEREUC5fQ3VycmVudFB1YmxpY2F0aW9uSW52b2NhdGlvbiBpcyBzZXQuXG4gICAgYXdhaXQgRERQLl9DdXJyZW50TWV0aG9kSW52b2NhdGlvbi53aXRoVmFsdWUodW5kZWZpbmVkLCBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgICAvLyBTYXZlIHRoZSBvbGQgbmFtZWQgc3VicywgYW5kIHJlc2V0IHRvIGhhdmluZyBubyBzdWJzY3JpcHRpb25zLlxuICAgICAgdmFyIG9sZE5hbWVkU3VicyA9IHNlbGYuX25hbWVkU3VicztcbiAgICAgIHNlbGYuX25hbWVkU3VicyA9IG5ldyBNYXAoKTtcbiAgICAgIHNlbGYuX3VuaXZlcnNhbFN1YnMgPSBbXTtcblxuXG5cbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5vbGROYW1lZFN1YnNdLm1hcChhc3luYyAoW3N1YnNjcmlwdGlvbklkLCBzdWJdKSA9PiB7XG4gICAgICAgIGNvbnN0IG5ld1N1YiA9IHN1Yi5fcmVjcmVhdGUoKTtcbiAgICAgICAgc2VsZi5fbmFtZWRTdWJzLnNldChzdWJzY3JpcHRpb25JZCwgbmV3U3ViKTtcbiAgICAgICAgLy8gbmI6IGlmIHRoZSBoYW5kbGVyIHRocm93cyBvciBjYWxscyB0aGlzLmVycm9yKCksIGl0IHdpbGwgaW4gZmFjdFxuICAgICAgICAvLyBpbW1lZGlhdGVseSBzZW5kIGl0cyAnbm9zdWInLiBUaGlzIGlzIE9LLCB0aG91Z2guXG4gICAgICAgIGF3YWl0IG5ld1N1Yi5fcnVuSGFuZGxlcigpO1xuICAgICAgfSkpO1xuXG4gICAgICAvLyBBbGxvdyBuZXdseS1jcmVhdGVkIHVuaXZlcnNhbCBzdWJzIHRvIGJlIHN0YXJ0ZWQgb24gb3VyIGNvbm5lY3Rpb24gaW5cbiAgICAgIC8vIHBhcmFsbGVsIHdpdGggdGhlIG9uZXMgd2UncmUgc3Bpbm5pbmcgdXAgaGVyZSwgYW5kIHNwaW4gdXAgdW5pdmVyc2FsXG4gICAgICAvLyBzdWJzLlxuICAgICAgc2VsZi5fZG9udFN0YXJ0TmV3VW5pdmVyc2FsU3VicyA9IGZhbHNlO1xuICAgICAgc2VsZi5zdGFydFVuaXZlcnNhbFN1YnMoKTtcbiAgICB9LCB7IG5hbWU6ICdfc2V0VXNlcklkJyB9KTtcblxuICAgIC8vIFN0YXJ0IHNlbmRpbmcgbWVzc2FnZXMgYWdhaW4sIGJlZ2lubmluZyB3aXRoIHRoZSBkaWZmIGZyb20gdGhlIHByZXZpb3VzXG4gICAgLy8gc3RhdGUgb2YgdGhlIHdvcmxkIHRvIHRoZSBjdXJyZW50IHN0YXRlLiBObyB5aWVsZHMgYXJlIGFsbG93ZWQgZHVyaW5nXG4gICAgLy8gdGhpcyBkaWZmLCBzbyB0aGF0IG90aGVyIGNoYW5nZXMgY2Fubm90IGludGVybGVhdmUuXG4gICAgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgc2VsZi5faXNTZW5kaW5nID0gdHJ1ZTtcbiAgICAgIHNlbGYuX2RpZmZDb2xsZWN0aW9uVmlld3MoYmVmb3JlQ1ZzKTtcbiAgICAgIGlmICghaXNFbXB0eShzZWxmLl9wZW5kaW5nUmVhZHkpKSB7XG4gICAgICAgIHNlbGYuc2VuZFJlYWR5KHNlbGYuX3BlbmRpbmdSZWFkeSk7XG4gICAgICAgIHNlbGYuX3BlbmRpbmdSZWFkeSA9IFtdO1xuICAgICAgfVxuICAgIH0pO1xuICB9LFxuXG4gIF9zdGFydFN1YnNjcmlwdGlvbjogZnVuY3Rpb24gKGhhbmRsZXIsIHN1YklkLCBwYXJhbXMsIG5hbWUpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICB2YXIgc3ViID0gbmV3IFN1YnNjcmlwdGlvbihcbiAgICAgIHNlbGYsIGhhbmRsZXIsIHN1YklkLCBwYXJhbXMsIG5hbWUpO1xuXG4gICAgbGV0IHVuYmxvY2tIYW5kZXIgPSBzZWxmLmNhY2hlZFVuYmxvY2s7XG4gICAgLy8gX3N0YXJ0U3Vic2NyaXB0aW9uIG1heSBjYWxsIGZyb20gYSBsb3QgcGxhY2VzXG4gICAgLy8gc28gY2FjaGVkVW5ibG9jayBtaWdodCBiZSBudWxsIGluIHNvbWVjYXNlc1xuICAgIC8vIGFzc2lnbiB0aGUgY2FjaGVkVW5ibG9ja1xuICAgIHN1Yi51bmJsb2NrID0gdW5ibG9ja0hhbmRlciB8fCAoKCkgPT4ge30pO1xuXG4gICAgaWYgKHN1YklkKVxuICAgICAgc2VsZi5fbmFtZWRTdWJzLnNldChzdWJJZCwgc3ViKTtcbiAgICBlbHNlXG4gICAgICBzZWxmLl91bml2ZXJzYWxTdWJzLnB1c2goc3ViKTtcblxuICAgIHJldHVybiBzdWIuX3J1bkhhbmRsZXIoKTtcbiAgfSxcblxuICAvLyBUZWFyIGRvd24gc3BlY2lmaWVkIHN1YnNjcmlwdGlvblxuICBfc3RvcFN1YnNjcmlwdGlvbjogZnVuY3Rpb24gKHN1YklkLCBlcnJvcikge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIHZhciBzdWJOYW1lID0gbnVsbDtcbiAgICBpZiAoc3ViSWQpIHtcbiAgICAgIHZhciBtYXliZVN1YiA9IHNlbGYuX25hbWVkU3Vicy5nZXQoc3ViSWQpO1xuICAgICAgaWYgKG1heWJlU3ViKSB7XG4gICAgICAgIHN1Yk5hbWUgPSBtYXliZVN1Yi5fbmFtZTtcbiAgICAgICAgbWF5YmVTdWIuX3JlbW92ZUFsbERvY3VtZW50cygpO1xuICAgICAgICBtYXliZVN1Yi5fZGVhY3RpdmF0ZSgpO1xuICAgICAgICBzZWxmLl9uYW1lZFN1YnMuZGVsZXRlKHN1YklkKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgcmVzcG9uc2UgPSB7bXNnOiAnbm9zdWInLCBpZDogc3ViSWR9O1xuXG4gICAgaWYgKGVycm9yKSB7XG4gICAgICByZXNwb25zZS5lcnJvciA9IHdyYXBJbnRlcm5hbEV4Y2VwdGlvbihcbiAgICAgICAgZXJyb3IsXG4gICAgICAgIHN1Yk5hbWUgPyAoXCJmcm9tIHN1YiBcIiArIHN1Yk5hbWUgKyBcIiBpZCBcIiArIHN1YklkKVxuICAgICAgICAgIDogKFwiZnJvbSBzdWIgaWQgXCIgKyBzdWJJZCkpO1xuICAgIH1cblxuICAgIHNlbGYuc2VuZChyZXNwb25zZSk7XG4gIH0sXG5cbiAgLy8gVGVhciBkb3duIGFsbCBzdWJzY3JpcHRpb25zLiBOb3RlIHRoYXQgdGhpcyBkb2VzIE5PVCBzZW5kIHJlbW92ZWQgb3Igbm9zdWJcbiAgLy8gbWVzc2FnZXMsIHNpbmNlIHdlIGFzc3VtZSB0aGUgY2xpZW50IGlzIGdvbmUuXG4gIF9kZWFjdGl2YXRlQWxsU3Vic2NyaXB0aW9uczogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIHNlbGYuX25hbWVkU3Vicy5mb3JFYWNoKGZ1bmN0aW9uIChzdWIsIGlkKSB7XG4gICAgICBzdWIuX2RlYWN0aXZhdGUoKTtcbiAgICB9KTtcbiAgICBzZWxmLl9uYW1lZFN1YnMgPSBuZXcgTWFwKCk7XG5cbiAgICBzZWxmLl91bml2ZXJzYWxTdWJzLmZvckVhY2goZnVuY3Rpb24gKHN1Yikge1xuICAgICAgc3ViLl9kZWFjdGl2YXRlKCk7XG4gICAgfSk7XG4gICAgc2VsZi5fdW5pdmVyc2FsU3VicyA9IFtdO1xuICB9LFxuXG4gIC8vIERldGVybWluZSB0aGUgcmVtb3RlIGNsaWVudCdzIElQIGFkZHJlc3MsIGJhc2VkIG9uIHRoZVxuICAvLyBIVFRQX0ZPUldBUkRFRF9DT1VOVCBlbnZpcm9ubWVudCB2YXJpYWJsZSByZXByZXNlbnRpbmcgaG93IG1hbnlcbiAgLy8gcHJveGllcyB0aGUgc2VydmVyIGlzIGJlaGluZC5cbiAgX2NsaWVudEFkZHJlc3M6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAvLyBGb3IgdGhlIHJlcG9ydGVkIGNsaWVudCBhZGRyZXNzIGZvciBhIGNvbm5lY3Rpb24gdG8gYmUgY29ycmVjdCxcbiAgICAvLyB0aGUgZGV2ZWxvcGVyIG11c3Qgc2V0IHRoZSBIVFRQX0ZPUldBUkRFRF9DT1VOVCBlbnZpcm9ubWVudFxuICAgIC8vIHZhcmlhYmxlIHRvIGFuIGludGVnZXIgcmVwcmVzZW50aW5nIHRoZSBudW1iZXIgb2YgaG9wcyB0aGV5XG4gICAgLy8gZXhwZWN0IGluIHRoZSBgeC1mb3J3YXJkZWQtZm9yYCBoZWFkZXIuIEUuZy4sIHNldCB0byBcIjFcIiBpZiB0aGVcbiAgICAvLyBzZXJ2ZXIgaXMgYmVoaW5kIG9uZSBwcm94eS5cbiAgICAvL1xuICAgIC8vIFRoaXMgY291bGQgYmUgY29tcHV0ZWQgb25jZSBhdCBzdGFydHVwIGluc3RlYWQgb2YgZXZlcnkgdGltZS5cbiAgICB2YXIgaHR0cEZvcndhcmRlZENvdW50ID0gcGFyc2VJbnQocHJvY2Vzcy5lbnZbJ0hUVFBfRk9SV0FSREVEX0NPVU5UJ10pIHx8IDA7XG5cbiAgICBpZiAoaHR0cEZvcndhcmRlZENvdW50ID09PSAwKVxuICAgICAgcmV0dXJuIHNlbGYuc29ja2V0LnJlbW90ZUFkZHJlc3M7XG5cbiAgICB2YXIgZm9yd2FyZGVkRm9yID0gc2VsZi5zb2NrZXQuaGVhZGVyc1tcIngtZm9yd2FyZGVkLWZvclwiXTtcbiAgICBpZiAoIWlzU3RyaW5nKGZvcndhcmRlZEZvcikpXG4gICAgICByZXR1cm4gbnVsbDtcbiAgICBmb3J3YXJkZWRGb3IgPSBmb3J3YXJkZWRGb3Iuc3BsaXQoJywnKVxuXG4gICAgLy8gVHlwaWNhbGx5IHRoZSBmaXJzdCB2YWx1ZSBpbiB0aGUgYHgtZm9yd2FyZGVkLWZvcmAgaGVhZGVyIGlzXG4gICAgLy8gdGhlIG9yaWdpbmFsIElQIGFkZHJlc3Mgb2YgdGhlIGNsaWVudCBjb25uZWN0aW5nIHRvIHRoZSBmaXJzdFxuICAgIC8vIHByb3h5LiAgSG93ZXZlciwgdGhlIGVuZCB1c2VyIGNhbiBlYXNpbHkgc3Bvb2YgdGhlIGhlYWRlciwgaW5cbiAgICAvLyB3aGljaCBjYXNlIHRoZSBmaXJzdCB2YWx1ZShzKSB3aWxsIGJlIHRoZSBmYWtlIElQIGFkZHJlc3MgZnJvbVxuICAgIC8vIHRoZSB1c2VyIHByZXRlbmRpbmcgdG8gYmUgYSBwcm94eSByZXBvcnRpbmcgdGhlIG9yaWdpbmFsIElQXG4gICAgLy8gYWRkcmVzcyB2YWx1ZS4gIEJ5IGNvdW50aW5nIEhUVFBfRk9SV0FSREVEX0NPVU5UIGJhY2sgZnJvbSB0aGVcbiAgICAvLyBlbmQgb2YgdGhlIGxpc3QsIHdlIGVuc3VyZSB0aGF0IHdlIGdldCB0aGUgSVAgYWRkcmVzcyBiZWluZ1xuICAgIC8vIHJlcG9ydGVkIGJ5ICpvdXIqIGZpcnN0IHByb3h5LlxuXG4gICAgaWYgKGh0dHBGb3J3YXJkZWRDb3VudCA8IDAgfHwgaHR0cEZvcndhcmRlZENvdW50ICE9PSBmb3J3YXJkZWRGb3IubGVuZ3RoKVxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgZm9yd2FyZGVkRm9yID0gZm9yd2FyZGVkRm9yLm1hcCgoaXApID0+IGlwLnRyaW0oKSk7XG4gICAgcmV0dXJuIGZvcndhcmRlZEZvcltmb3J3YXJkZWRGb3IubGVuZ3RoIC0gaHR0cEZvcndhcmRlZENvdW50XTtcbiAgfVxufSk7XG5cbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG4vKiBTdWJzY3JpcHRpb24gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqL1xuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cblxuLy8gQ3RvciBmb3IgYSBzdWIgaGFuZGxlOiB0aGUgaW5wdXQgdG8gZWFjaCBwdWJsaXNoIGZ1bmN0aW9uXG5cbi8vIEluc3RhbmNlIG5hbWUgaXMgdGhpcyBiZWNhdXNlIGl0J3MgdXN1YWxseSByZWZlcnJlZCB0byBhcyB0aGlzIGluc2lkZSBhXG4vLyBwdWJsaXNoXG4vKipcbiAqIEBzdW1tYXJ5IFRoZSBzZXJ2ZXIncyBzaWRlIG9mIGEgc3Vic2NyaXB0aW9uXG4gKiBAY2xhc3MgU3Vic2NyaXB0aW9uXG4gKiBAaW5zdGFuY2VOYW1lIHRoaXNcbiAqIEBzaG93SW5zdGFuY2VOYW1lIHRydWVcbiAqL1xudmFyIFN1YnNjcmlwdGlvbiA9IGZ1bmN0aW9uIChcbiAgICBzZXNzaW9uLCBoYW5kbGVyLCBzdWJzY3JpcHRpb25JZCwgcGFyYW1zLCBuYW1lKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgc2VsZi5fc2Vzc2lvbiA9IHNlc3Npb247IC8vIHR5cGUgaXMgU2Vzc2lvblxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBBY2Nlc3MgaW5zaWRlIHRoZSBwdWJsaXNoIGZ1bmN0aW9uLiBUaGUgaW5jb21pbmcgW2Nvbm5lY3Rpb25dKCNtZXRlb3Jfb25jb25uZWN0aW9uKSBmb3IgdGhpcyBzdWJzY3JpcHRpb24uXG4gICAqIEBsb2N1cyBTZXJ2ZXJcbiAgICogQG5hbWUgIGNvbm5lY3Rpb25cbiAgICogQG1lbWJlck9mIFN1YnNjcmlwdGlvblxuICAgKiBAaW5zdGFuY2VcbiAgICovXG4gIHNlbGYuY29ubmVjdGlvbiA9IHNlc3Npb24uY29ubmVjdGlvbkhhbmRsZTsgLy8gcHVibGljIEFQSSBvYmplY3RcblxuICBzZWxmLl9oYW5kbGVyID0gaGFuZGxlcjtcblxuICAvLyBNeSBzdWJzY3JpcHRpb24gSUQgKGdlbmVyYXRlZCBieSBjbGllbnQsIHVuZGVmaW5lZCBmb3IgdW5pdmVyc2FsIHN1YnMpLlxuICBzZWxmLl9zdWJzY3JpcHRpb25JZCA9IHN1YnNjcmlwdGlvbklkO1xuICAvLyBVbmRlZmluZWQgZm9yIHVuaXZlcnNhbCBzdWJzXG4gIHNlbGYuX25hbWUgPSBuYW1lO1xuXG4gIHNlbGYuX3BhcmFtcyA9IHBhcmFtcyB8fCBbXTtcblxuICAvLyBPbmx5IG5hbWVkIHN1YnNjcmlwdGlvbnMgaGF2ZSBJRHMsIGJ1dCB3ZSBuZWVkIHNvbWUgc29ydCBvZiBzdHJpbmdcbiAgLy8gaW50ZXJuYWxseSB0byBrZWVwIHRyYWNrIG9mIGFsbCBzdWJzY3JpcHRpb25zIGluc2lkZVxuICAvLyBTZXNzaW9uRG9jdW1lbnRWaWV3cy4gV2UgdXNlIHRoaXMgc3Vic2NyaXB0aW9uSGFuZGxlIGZvciB0aGF0LlxuICBpZiAoc2VsZi5fc3Vic2NyaXB0aW9uSWQpIHtcbiAgICBzZWxmLl9zdWJzY3JpcHRpb25IYW5kbGUgPSAnTicgKyBzZWxmLl9zdWJzY3JpcHRpb25JZDtcbiAgfSBlbHNlIHtcbiAgICBzZWxmLl9zdWJzY3JpcHRpb25IYW5kbGUgPSAnVScgKyBSYW5kb20uaWQoKTtcbiAgfVxuXG4gIC8vIEhhcyBfZGVhY3RpdmF0ZSBiZWVuIGNhbGxlZD9cbiAgc2VsZi5fZGVhY3RpdmF0ZWQgPSBmYWxzZTtcblxuICAvLyBTdG9wIGNhbGxiYWNrcyB0byBnL2MgdGhpcyBzdWIuICBjYWxsZWQgdy8gemVybyBhcmd1bWVudHMuXG4gIHNlbGYuX3N0b3BDYWxsYmFja3MgPSBbXTtcblxuICAvLyBUaGUgc2V0IG9mIChjb2xsZWN0aW9uLCBkb2N1bWVudGlkKSB0aGF0IHRoaXMgc3Vic2NyaXB0aW9uIGhhc1xuICAvLyBhbiBvcGluaW9uIGFib3V0LlxuICBzZWxmLl9kb2N1bWVudHMgPSBuZXcgTWFwKCk7XG5cbiAgLy8gUmVtZW1iZXIgaWYgd2UgYXJlIHJlYWR5LlxuICBzZWxmLl9yZWFkeSA9IGZhbHNlO1xuXG4gIC8vIFBhcnQgb2YgdGhlIHB1YmxpYyBBUEk6IHRoZSB1c2VyIG9mIHRoaXMgc3ViLlxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBBY2Nlc3MgaW5zaWRlIHRoZSBwdWJsaXNoIGZ1bmN0aW9uLiBUaGUgaWQgb2YgdGhlIGxvZ2dlZC1pbiB1c2VyLCBvciBgbnVsbGAgaWYgbm8gdXNlciBpcyBsb2dnZWQgaW4uXG4gICAqIEBsb2N1cyBTZXJ2ZXJcbiAgICogQG1lbWJlck9mIFN1YnNjcmlwdGlvblxuICAgKiBAbmFtZSAgdXNlcklkXG4gICAqIEBpbnN0YW5jZVxuICAgKi9cbiAgc2VsZi51c2VySWQgPSBzZXNzaW9uLnVzZXJJZDtcblxuICAvLyBGb3Igbm93LCB0aGUgaWQgZmlsdGVyIGlzIGdvaW5nIHRvIGRlZmF1bHQgdG9cbiAgLy8gdGhlIHRvL2Zyb20gRERQIG1ldGhvZHMgb24gTW9uZ29JRCwgdG9cbiAgLy8gc3BlY2lmaWNhbGx5IGRlYWwgd2l0aCBtb25nby9taW5pbW9uZ28gT2JqZWN0SWRzLlxuXG4gIC8vIExhdGVyLCB5b3Ugd2lsbCBiZSBhYmxlIHRvIG1ha2UgdGhpcyBiZSBcInJhd1wiXG4gIC8vIGlmIHlvdSB3YW50IHRvIHB1Ymxpc2ggYSBjb2xsZWN0aW9uIHRoYXQgeW91IGtub3dcbiAgLy8ganVzdCBoYXMgc3RyaW5ncyBmb3Iga2V5cyBhbmQgbm8gZnVubnkgYnVzaW5lc3MsIHRvXG4gIC8vIGEgRERQIGNvbnN1bWVyIHRoYXQgaXNuJ3QgbWluaW1vbmdvLlxuXG4gIHNlbGYuX2lkRmlsdGVyID0ge1xuICAgIGlkU3RyaW5naWZ5OiBNb25nb0lELmlkU3RyaW5naWZ5LFxuICAgIGlkUGFyc2U6IE1vbmdvSUQuaWRQYXJzZVxuICB9O1xuXG4gIFBhY2thZ2VbJ2ZhY3RzLWJhc2UnXSAmJiBQYWNrYWdlWydmYWN0cy1iYXNlJ10uRmFjdHMuaW5jcmVtZW50U2VydmVyRmFjdChcbiAgICBcImxpdmVkYXRhXCIsIFwic3Vic2NyaXB0aW9uc1wiLCAxKTtcbn07XG5cbk9iamVjdC5hc3NpZ24oU3Vic2NyaXB0aW9uLnByb3RvdHlwZSwge1xuICBfcnVuSGFuZGxlcjogYXN5bmMgZnVuY3Rpb24oKSB7XG4gICAgLy8gWFhYIHNob3VsZCB3ZSB1bmJsb2NrKCkgaGVyZT8gRWl0aGVyIGJlZm9yZSBydW5uaW5nIHRoZSBwdWJsaXNoXG4gICAgLy8gZnVuY3Rpb24sIG9yIGJlZm9yZSBydW5uaW5nIF9wdWJsaXNoQ3Vyc29yLlxuICAgIC8vXG4gICAgLy8gUmlnaHQgbm93LCBlYWNoIHB1Ymxpc2ggZnVuY3Rpb24gYmxvY2tzIGFsbCBmdXR1cmUgcHVibGlzaGVzIGFuZFxuICAgIC8vIG1ldGhvZHMgd2FpdGluZyBvbiBkYXRhIGZyb20gTW9uZ28gKG9yIHdoYXRldmVyIGVsc2UgdGhlIGZ1bmN0aW9uXG4gICAgLy8gYmxvY2tzIG9uKS4gVGhpcyBwcm9iYWJseSBzbG93cyBwYWdlIGxvYWQgaW4gY29tbW9uIGNhc2VzLlxuXG4gICAgaWYgKCF0aGlzLnVuYmxvY2spIHtcbiAgICAgIHRoaXMudW5ibG9jayA9ICgpID0+IHt9O1xuICAgIH1cblxuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGxldCByZXN1bHRPclRoZW5hYmxlID0gbnVsbDtcbiAgICB0cnkge1xuICAgICAgcmVzdWx0T3JUaGVuYWJsZSA9IEREUC5fQ3VycmVudFB1YmxpY2F0aW9uSW52b2NhdGlvbi53aXRoVmFsdWUoXG4gICAgICAgIHNlbGYsXG4gICAgICAgICgpID0+XG4gICAgICAgICAgbWF5YmVBdWRpdEFyZ3VtZW50Q2hlY2tzKFxuICAgICAgICAgICAgc2VsZi5faGFuZGxlcixcbiAgICAgICAgICAgIHNlbGYsXG4gICAgICAgICAgICBFSlNPTi5jbG9uZShzZWxmLl9wYXJhbXMpLFxuICAgICAgICAgICAgLy8gSXQncyBPSyB0aGF0IHRoaXMgd291bGQgbG9vayB3ZWlyZCBmb3IgdW5pdmVyc2FsIHN1YnNjcmlwdGlvbnMsXG4gICAgICAgICAgICAvLyBiZWNhdXNlIHRoZXkgaGF2ZSBubyBhcmd1bWVudHMgc28gdGhlcmUgY2FuIG5ldmVyIGJlIGFuXG4gICAgICAgICAgICAvLyBhdWRpdC1hcmd1bWVudC1jaGVja3MgZmFpbHVyZS5cbiAgICAgICAgICAgIFwicHVibGlzaGVyICdcIiArIHNlbGYuX25hbWUgKyBcIidcIlxuICAgICAgICAgICksXG4gICAgICAgIHsgbmFtZTogc2VsZi5fbmFtZSB9XG4gICAgICApO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHNlbGYuZXJyb3IoZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gRGlkIHRoZSBoYW5kbGVyIGNhbGwgdGhpcy5lcnJvciBvciB0aGlzLnN0b3A/XG4gICAgaWYgKHNlbGYuX2lzRGVhY3RpdmF0ZWQoKSkgcmV0dXJuO1xuXG4gICAgLy8gQm90aCBjb252ZW50aW9uYWwgYW5kIGFzeW5jIHB1Ymxpc2ggaGFuZGxlciBmdW5jdGlvbnMgYXJlIHN1cHBvcnRlZC5cbiAgICAvLyBJZiBhbiBvYmplY3QgaXMgcmV0dXJuZWQgd2l0aCBhIHRoZW4oKSBmdW5jdGlvbiwgaXQgaXMgZWl0aGVyIGEgcHJvbWlzZVxuICAgIC8vIG9yIHRoZW5hYmxlIGFuZCB3aWxsIGJlIHJlc29sdmVkIGFzeW5jaHJvbm91c2x5LlxuICAgIGNvbnN0IGlzVGhlbmFibGUgPVxuICAgICAgcmVzdWx0T3JUaGVuYWJsZSAmJiB0eXBlb2YgcmVzdWx0T3JUaGVuYWJsZS50aGVuID09PSAnZnVuY3Rpb24nO1xuICAgIGlmIChpc1RoZW5hYmxlKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBzZWxmLl9wdWJsaXNoSGFuZGxlclJlc3VsdChhd2FpdCByZXN1bHRPclRoZW5hYmxlKTtcbiAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICBzZWxmLmVycm9yKGUpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGF3YWl0IHNlbGYuX3B1Ymxpc2hIYW5kbGVyUmVzdWx0KHJlc3VsdE9yVGhlbmFibGUpO1xuICAgIH1cbiAgfSxcblxuICBhc3luYyBfcHVibGlzaEhhbmRsZXJSZXN1bHQgKHJlcykge1xuICAgIC8vIFNQRUNJQUwgQ0FTRTogSW5zdGVhZCBvZiB3cml0aW5nIHRoZWlyIG93biBjYWxsYmFja3MgdGhhdCBpbnZva2VcbiAgICAvLyB0aGlzLmFkZGVkL2NoYW5nZWQvcmVhZHkvZXRjLCB0aGUgdXNlciBjYW4ganVzdCByZXR1cm4gYSBjb2xsZWN0aW9uXG4gICAgLy8gY3Vyc29yIG9yIGFycmF5IG9mIGN1cnNvcnMgZnJvbSB0aGUgcHVibGlzaCBmdW5jdGlvbjsgd2UgY2FsbCB0aGVpclxuICAgIC8vIF9wdWJsaXNoQ3Vyc29yIG1ldGhvZCB3aGljaCBzdGFydHMgb2JzZXJ2aW5nIHRoZSBjdXJzb3IgYW5kIHB1Ymxpc2hlcyB0aGVcbiAgICAvLyByZXN1bHRzLiBOb3RlIHRoYXQgX3B1Ymxpc2hDdXJzb3IgZG9lcyBOT1QgY2FsbCByZWFkeSgpLlxuICAgIC8vXG4gICAgLy8gWFhYIFRoaXMgdXNlcyBhbiB1bmRvY3VtZW50ZWQgaW50ZXJmYWNlIHdoaWNoIG9ubHkgdGhlIE1vbmdvIGN1cnNvclxuICAgIC8vIGludGVyZmFjZSBwdWJsaXNoZXMuIFNob3VsZCB3ZSBtYWtlIHRoaXMgaW50ZXJmYWNlIHB1YmxpYyBhbmQgZW5jb3VyYWdlXG4gICAgLy8gdXNlcnMgdG8gaW1wbGVtZW50IGl0IHRoZW1zZWx2ZXM/IEFyZ3VhYmx5LCBpdCdzIHVubmVjZXNzYXJ5OyB1c2VycyBjYW5cbiAgICAvLyBhbHJlYWR5IHdyaXRlIHRoZWlyIG93biBmdW5jdGlvbnMgbGlrZVxuICAgIC8vICAgdmFyIHB1Ymxpc2hNeVJlYWN0aXZlVGhpbmd5ID0gZnVuY3Rpb24gKG5hbWUsIGhhbmRsZXIpIHtcbiAgICAvLyAgICAgTWV0ZW9yLnB1Ymxpc2gobmFtZSwgZnVuY3Rpb24gKCkge1xuICAgIC8vICAgICAgIHZhciByZWFjdGl2ZVRoaW5neSA9IGhhbmRsZXIoKTtcbiAgICAvLyAgICAgICByZWFjdGl2ZVRoaW5neS5wdWJsaXNoTWUoKTtcbiAgICAvLyAgICAgfSk7XG4gICAgLy8gICB9O1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBpc0N1cnNvciA9IGZ1bmN0aW9uIChjKSB7XG4gICAgICByZXR1cm4gYyAmJiBjLl9wdWJsaXNoQ3Vyc29yO1xuICAgIH07XG4gICAgaWYgKGlzQ3Vyc29yKHJlcykpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHJlcy5fcHVibGlzaEN1cnNvcihzZWxmKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgc2VsZi5lcnJvcihlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgLy8gX3B1Ymxpc2hDdXJzb3Igb25seSByZXR1cm5zIGFmdGVyIHRoZSBpbml0aWFsIGFkZGVkIGNhbGxiYWNrcyBoYXZlIHJ1bi5cbiAgICAgIC8vIG1hcmsgc3Vic2NyaXB0aW9uIGFzIHJlYWR5LlxuICAgICAgc2VsZi5yZWFkeSgpO1xuICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShyZXMpKSB7XG4gICAgICAvLyBDaGVjayBhbGwgdGhlIGVsZW1lbnRzIGFyZSBjdXJzb3JzXG4gICAgICBpZiAoISByZXMuZXZlcnkoaXNDdXJzb3IpKSB7XG4gICAgICAgIHNlbGYuZXJyb3IobmV3IEVycm9yKFwiUHVibGlzaCBmdW5jdGlvbiByZXR1cm5lZCBhbiBhcnJheSBvZiBub24tQ3Vyc29yc1wiKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIC8vIEZpbmQgZHVwbGljYXRlIGNvbGxlY3Rpb24gbmFtZXNcbiAgICAgIC8vIFhYWCB3ZSBzaG91bGQgc3VwcG9ydCBvdmVybGFwcGluZyBjdXJzb3JzLCBidXQgdGhhdCB3b3VsZCByZXF1aXJlIHRoZVxuICAgICAgLy8gbWVyZ2UgYm94IHRvIGFsbG93IG92ZXJsYXAgd2l0aGluIGEgc3Vic2NyaXB0aW9uXG4gICAgICB2YXIgY29sbGVjdGlvbk5hbWVzID0ge307XG5cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmVzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBjb2xsZWN0aW9uTmFtZSA9IHJlc1tpXS5fZ2V0Q29sbGVjdGlvbk5hbWUoKTtcbiAgICAgICAgaWYgKGNvbGxlY3Rpb25OYW1lc1tjb2xsZWN0aW9uTmFtZV0pIHtcbiAgICAgICAgICBzZWxmLmVycm9yKG5ldyBFcnJvcihcbiAgICAgICAgICAgIFwiUHVibGlzaCBmdW5jdGlvbiByZXR1cm5lZCBtdWx0aXBsZSBjdXJzb3JzIGZvciBjb2xsZWN0aW9uIFwiICtcbiAgICAgICAgICAgICAgY29sbGVjdGlvbk5hbWUpKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29sbGVjdGlvbk5hbWVzW2NvbGxlY3Rpb25OYW1lXSA9IHRydWU7XG4gICAgICB9XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKHJlcy5tYXAoY3VyID0+IGN1ci5fcHVibGlzaEN1cnNvcihzZWxmKSkpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBzZWxmLmVycm9yKGUpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBzZWxmLnJlYWR5KCk7XG4gICAgfSBlbHNlIGlmIChyZXMpIHtcbiAgICAgIC8vIFRydXRoeSB2YWx1ZXMgb3RoZXIgdGhhbiBjdXJzb3JzIG9yIGFycmF5cyBhcmUgcHJvYmFibHkgYVxuICAgICAgLy8gdXNlciBtaXN0YWtlIChwb3NzaWJsZSByZXR1cm5pbmcgYSBNb25nbyBkb2N1bWVudCB2aWEsIHNheSxcbiAgICAgIC8vIGBjb2xsLmZpbmRPbmUoKWApLlxuICAgICAgc2VsZi5lcnJvcihuZXcgRXJyb3IoXCJQdWJsaXNoIGZ1bmN0aW9uIGNhbiBvbmx5IHJldHVybiBhIEN1cnNvciBvciBcIlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgKyBcImFuIGFycmF5IG9mIEN1cnNvcnNcIikpO1xuICAgIH1cbiAgfSxcblxuICAvLyBUaGlzIGNhbGxzIGFsbCBzdG9wIGNhbGxiYWNrcyBhbmQgcHJldmVudHMgdGhlIGhhbmRsZXIgZnJvbSB1cGRhdGluZyBhbnlcbiAgLy8gU2Vzc2lvbkNvbGxlY3Rpb25WaWV3cyBmdXJ0aGVyLiBJdCdzIHVzZWQgd2hlbiB0aGUgdXNlciB1bnN1YnNjcmliZXMgb3JcbiAgLy8gZGlzY29ubmVjdHMsIGFzIHdlbGwgYXMgZHVyaW5nIHNldFVzZXJJZCByZS1ydW5zLiBJdCBkb2VzICpOT1QqIHNlbmRcbiAgLy8gcmVtb3ZlZCBtZXNzYWdlcyBmb3IgdGhlIHB1Ymxpc2hlZCBvYmplY3RzOyBpZiB0aGF0IGlzIG5lY2Vzc2FyeSwgY2FsbFxuICAvLyBfcmVtb3ZlQWxsRG9jdW1lbnRzIGZpcnN0LlxuICBfZGVhY3RpdmF0ZTogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmIChzZWxmLl9kZWFjdGl2YXRlZClcbiAgICAgIHJldHVybjtcbiAgICBzZWxmLl9kZWFjdGl2YXRlZCA9IHRydWU7XG4gICAgc2VsZi5fY2FsbFN0b3BDYWxsYmFja3MoKTtcbiAgICBQYWNrYWdlWydmYWN0cy1iYXNlJ10gJiYgUGFja2FnZVsnZmFjdHMtYmFzZSddLkZhY3RzLmluY3JlbWVudFNlcnZlckZhY3QoXG4gICAgICBcImxpdmVkYXRhXCIsIFwic3Vic2NyaXB0aW9uc1wiLCAtMSk7XG4gIH0sXG5cbiAgX2NhbGxTdG9wQ2FsbGJhY2tzOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIC8vIFRlbGwgbGlzdGVuZXJzLCBzbyB0aGV5IGNhbiBjbGVhbiB1cFxuICAgIHZhciBjYWxsYmFja3MgPSBzZWxmLl9zdG9wQ2FsbGJhY2tzO1xuICAgIHNlbGYuX3N0b3BDYWxsYmFja3MgPSBbXTtcbiAgICBjYWxsYmFja3MuZm9yRWFjaChmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgIGNhbGxiYWNrKCk7XG4gICAgfSk7XG4gIH0sXG5cbiAgLy8gU2VuZCByZW1vdmUgbWVzc2FnZXMgZm9yIGV2ZXJ5IGRvY3VtZW50LlxuICBfcmVtb3ZlQWxsRG9jdW1lbnRzOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkKGZ1bmN0aW9uICgpIHtcbiAgICAgIHNlbGYuX2RvY3VtZW50cy5mb3JFYWNoKGZ1bmN0aW9uIChjb2xsZWN0aW9uRG9jcywgY29sbGVjdGlvbk5hbWUpIHtcbiAgICAgICAgY29sbGVjdGlvbkRvY3MuZm9yRWFjaChmdW5jdGlvbiAoc3RySWQpIHtcbiAgICAgICAgICBzZWxmLnJlbW92ZWQoY29sbGVjdGlvbk5hbWUsIHNlbGYuX2lkRmlsdGVyLmlkUGFyc2Uoc3RySWQpKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSxcblxuICAvLyBSZXR1cm5zIGEgbmV3IFN1YnNjcmlwdGlvbiBmb3IgdGhlIHNhbWUgc2Vzc2lvbiB3aXRoIHRoZSBzYW1lXG4gIC8vIGluaXRpYWwgY3JlYXRpb24gcGFyYW1ldGVycy4gVGhpcyBpc24ndCBhIGNsb25lOiBpdCBkb2Vzbid0IGhhdmVcbiAgLy8gdGhlIHNhbWUgX2RvY3VtZW50cyBjYWNoZSwgc3RvcHBlZCBzdGF0ZSBvciBjYWxsYmFja3M7IG1heSBoYXZlIGFcbiAgLy8gZGlmZmVyZW50IF9zdWJzY3JpcHRpb25IYW5kbGUsIGFuZCBnZXRzIGl0cyB1c2VySWQgZnJvbSB0aGVcbiAgLy8gc2Vzc2lvbiwgbm90IGZyb20gdGhpcyBvYmplY3QuXG4gIF9yZWNyZWF0ZTogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICByZXR1cm4gbmV3IFN1YnNjcmlwdGlvbihcbiAgICAgIHNlbGYuX3Nlc3Npb24sIHNlbGYuX2hhbmRsZXIsIHNlbGYuX3N1YnNjcmlwdGlvbklkLCBzZWxmLl9wYXJhbXMsXG4gICAgICBzZWxmLl9uYW1lKTtcbiAgfSxcblxuICAvKipcbiAgICogQHN1bW1hcnkgQ2FsbCBpbnNpZGUgdGhlIHB1Ymxpc2ggZnVuY3Rpb24uICBTdG9wcyB0aGlzIGNsaWVudCdzIHN1YnNjcmlwdGlvbiwgdHJpZ2dlcmluZyBhIGNhbGwgb24gdGhlIGNsaWVudCB0byB0aGUgYG9uU3RvcGAgY2FsbGJhY2sgcGFzc2VkIHRvIFtgTWV0ZW9yLnN1YnNjcmliZWBdKCNtZXRlb3Jfc3Vic2NyaWJlKSwgaWYgYW55LiBJZiBgZXJyb3JgIGlzIG5vdCBhIFtgTWV0ZW9yLkVycm9yYF0oI21ldGVvcl9lcnJvciksIGl0IHdpbGwgYmUgW3Nhbml0aXplZF0oI21ldGVvcl9lcnJvcikuXG4gICAqIEBsb2N1cyBTZXJ2ZXJcbiAgICogQHBhcmFtIHtFcnJvcn0gZXJyb3IgVGhlIGVycm9yIHRvIHBhc3MgdG8gdGhlIGNsaWVudC5cbiAgICogQGluc3RhbmNlXG4gICAqIEBtZW1iZXJPZiBTdWJzY3JpcHRpb25cbiAgICovXG4gIGVycm9yOiBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKHNlbGYuX2lzRGVhY3RpdmF0ZWQoKSlcbiAgICAgIHJldHVybjtcbiAgICBzZWxmLl9zZXNzaW9uLl9zdG9wU3Vic2NyaXB0aW9uKHNlbGYuX3N1YnNjcmlwdGlvbklkLCBlcnJvcik7XG4gIH0sXG5cbiAgLy8gTm90ZSB0aGF0IHdoaWxlIG91ciBERFAgY2xpZW50IHdpbGwgbm90aWNlIHRoYXQgeW91J3ZlIGNhbGxlZCBzdG9wKCkgb24gdGhlXG4gIC8vIHNlcnZlciAoYW5kIGNsZWFuIHVwIGl0cyBfc3Vic2NyaXB0aW9ucyB0YWJsZSkgd2UgZG9uJ3QgYWN0dWFsbHkgcHJvdmlkZSBhXG4gIC8vIG1lY2hhbmlzbSBmb3IgYW4gYXBwIHRvIG5vdGljZSB0aGlzICh0aGUgc3Vic2NyaWJlIG9uRXJyb3IgY2FsbGJhY2sgb25seVxuICAvLyB0cmlnZ2VycyBpZiB0aGVyZSBpcyBhbiBlcnJvcikuXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IENhbGwgaW5zaWRlIHRoZSBwdWJsaXNoIGZ1bmN0aW9uLiAgU3RvcHMgdGhpcyBjbGllbnQncyBzdWJzY3JpcHRpb24gYW5kIGludm9rZXMgdGhlIGNsaWVudCdzIGBvblN0b3BgIGNhbGxiYWNrIHdpdGggbm8gZXJyb3IuXG4gICAqIEBsb2N1cyBTZXJ2ZXJcbiAgICogQGluc3RhbmNlXG4gICAqIEBtZW1iZXJPZiBTdWJzY3JpcHRpb25cbiAgICovXG4gIHN0b3A6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKHNlbGYuX2lzRGVhY3RpdmF0ZWQoKSlcbiAgICAgIHJldHVybjtcbiAgICBzZWxmLl9zZXNzaW9uLl9zdG9wU3Vic2NyaXB0aW9uKHNlbGYuX3N1YnNjcmlwdGlvbklkKTtcbiAgfSxcblxuICAvKipcbiAgICogQHN1bW1hcnkgQ2FsbCBpbnNpZGUgdGhlIHB1Ymxpc2ggZnVuY3Rpb24uICBSZWdpc3RlcnMgYSBjYWxsYmFjayBmdW5jdGlvbiB0byBydW4gd2hlbiB0aGUgc3Vic2NyaXB0aW9uIGlzIHN0b3BwZWQuXG4gICAqIEBsb2N1cyBTZXJ2ZXJcbiAgICogQG1lbWJlck9mIFN1YnNjcmlwdGlvblxuICAgKiBAaW5zdGFuY2VcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgY2FsbGJhY2sgZnVuY3Rpb25cbiAgICovXG4gIG9uU3RvcDogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGNhbGxiYWNrID0gTWV0ZW9yLmJpbmRFbnZpcm9ubWVudChjYWxsYmFjaywgJ29uU3RvcCBjYWxsYmFjaycsIHNlbGYpO1xuICAgIGlmIChzZWxmLl9pc0RlYWN0aXZhdGVkKCkpXG4gICAgICBjYWxsYmFjaygpO1xuICAgIGVsc2VcbiAgICAgIHNlbGYuX3N0b3BDYWxsYmFja3MucHVzaChjYWxsYmFjayk7XG4gIH0sXG5cbiAgLy8gVGhpcyByZXR1cm5zIHRydWUgaWYgdGhlIHN1YiBoYXMgYmVlbiBkZWFjdGl2YXRlZCwgKk9SKiBpZiB0aGUgc2Vzc2lvbiB3YXNcbiAgLy8gZGVzdHJveWVkIGJ1dCB0aGUgZGVmZXJyZWQgY2FsbCB0byBfZGVhY3RpdmF0ZUFsbFN1YnNjcmlwdGlvbnMgaGFzbid0XG4gIC8vIGhhcHBlbmVkIHlldC5cbiAgX2lzRGVhY3RpdmF0ZWQ6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIHNlbGYuX2RlYWN0aXZhdGVkIHx8IHNlbGYuX3Nlc3Npb24uaW5RdWV1ZSA9PT0gbnVsbDtcbiAgfSxcblxuICAvKipcbiAgICogQHN1bW1hcnkgQ2FsbCBpbnNpZGUgdGhlIHB1Ymxpc2ggZnVuY3Rpb24uICBJbmZvcm1zIHRoZSBzdWJzY3JpYmVyIHRoYXQgYSBkb2N1bWVudCBoYXMgYmVlbiBhZGRlZCB0byB0aGUgcmVjb3JkIHNldC5cbiAgICogQGxvY3VzIFNlcnZlclxuICAgKiBAbWVtYmVyT2YgU3Vic2NyaXB0aW9uXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gY29sbGVjdGlvbiBUaGUgbmFtZSBvZiB0aGUgY29sbGVjdGlvbiB0aGF0IGNvbnRhaW5zIHRoZSBuZXcgZG9jdW1lbnQuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBpZCBUaGUgbmV3IGRvY3VtZW50J3MgSUQuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBmaWVsZHMgVGhlIGZpZWxkcyBpbiB0aGUgbmV3IGRvY3VtZW50LiAgSWYgYF9pZGAgaXMgcHJlc2VudCBpdCBpcyBpZ25vcmVkLlxuICAgKi9cbiAgYWRkZWQgKGNvbGxlY3Rpb25OYW1lLCBpZCwgZmllbGRzKSB7XG4gICAgaWYgKHRoaXMuX2lzRGVhY3RpdmF0ZWQoKSlcbiAgICAgIHJldHVybjtcbiAgICBpZCA9IHRoaXMuX2lkRmlsdGVyLmlkU3RyaW5naWZ5KGlkKTtcblxuICAgIGlmICh0aGlzLl9zZXNzaW9uLnNlcnZlci5nZXRQdWJsaWNhdGlvblN0cmF0ZWd5KGNvbGxlY3Rpb25OYW1lKS5kb0FjY291bnRpbmdGb3JDb2xsZWN0aW9uKSB7XG4gICAgICBsZXQgaWRzID0gdGhpcy5fZG9jdW1lbnRzLmdldChjb2xsZWN0aW9uTmFtZSk7XG4gICAgICBpZiAoaWRzID09IG51bGwpIHtcbiAgICAgICAgaWRzID0gbmV3IFNldCgpO1xuICAgICAgICB0aGlzLl9kb2N1bWVudHMuc2V0KGNvbGxlY3Rpb25OYW1lLCBpZHMpO1xuICAgICAgfVxuICAgICAgaWRzLmFkZChpZCk7XG4gICAgfVxuXG4gICAgdGhpcy5fc2Vzc2lvbi5hZGRlZCh0aGlzLl9zdWJzY3JpcHRpb25IYW5kbGUsIGNvbGxlY3Rpb25OYW1lLCBpZCwgZmllbGRzKTtcbiAgfSxcblxuICAvKipcbiAgICogQHN1bW1hcnkgQ2FsbCBpbnNpZGUgdGhlIHB1Ymxpc2ggZnVuY3Rpb24uICBJbmZvcm1zIHRoZSBzdWJzY3JpYmVyIHRoYXQgYSBkb2N1bWVudCBpbiB0aGUgcmVjb3JkIHNldCBoYXMgYmVlbiBtb2RpZmllZC5cbiAgICogQGxvY3VzIFNlcnZlclxuICAgKiBAbWVtYmVyT2YgU3Vic2NyaXB0aW9uXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gY29sbGVjdGlvbiBUaGUgbmFtZSBvZiB0aGUgY29sbGVjdGlvbiB0aGF0IGNvbnRhaW5zIHRoZSBjaGFuZ2VkIGRvY3VtZW50LlxuICAgKiBAcGFyYW0ge1N0cmluZ30gaWQgVGhlIGNoYW5nZWQgZG9jdW1lbnQncyBJRC5cbiAgICogQHBhcmFtIHtPYmplY3R9IGZpZWxkcyBUaGUgZmllbGRzIGluIHRoZSBkb2N1bWVudCB0aGF0IGhhdmUgY2hhbmdlZCwgdG9nZXRoZXIgd2l0aCB0aGVpciBuZXcgdmFsdWVzLiAgSWYgYSBmaWVsZCBpcyBub3QgcHJlc2VudCBpbiBgZmllbGRzYCBpdCB3YXMgbGVmdCB1bmNoYW5nZWQ7IGlmIGl0IGlzIHByZXNlbnQgaW4gYGZpZWxkc2AgYW5kIGhhcyBhIHZhbHVlIG9mIGB1bmRlZmluZWRgIGl0IHdhcyByZW1vdmVkIGZyb20gdGhlIGRvY3VtZW50LiAgSWYgYF9pZGAgaXMgcHJlc2VudCBpdCBpcyBpZ25vcmVkLlxuICAgKi9cbiAgY2hhbmdlZCAoY29sbGVjdGlvbk5hbWUsIGlkLCBmaWVsZHMpIHtcbiAgICBpZiAodGhpcy5faXNEZWFjdGl2YXRlZCgpKVxuICAgICAgcmV0dXJuO1xuICAgIGlkID0gdGhpcy5faWRGaWx0ZXIuaWRTdHJpbmdpZnkoaWQpO1xuICAgIHRoaXMuX3Nlc3Npb24uY2hhbmdlZCh0aGlzLl9zdWJzY3JpcHRpb25IYW5kbGUsIGNvbGxlY3Rpb25OYW1lLCBpZCwgZmllbGRzKTtcbiAgfSxcblxuICAvKipcbiAgICogQHN1bW1hcnkgQ2FsbCBpbnNpZGUgdGhlIHB1Ymxpc2ggZnVuY3Rpb24uICBJbmZvcm1zIHRoZSBzdWJzY3JpYmVyIHRoYXQgYSBkb2N1bWVudCBoYXMgYmVlbiByZW1vdmVkIGZyb20gdGhlIHJlY29yZCBzZXQuXG4gICAqIEBsb2N1cyBTZXJ2ZXJcbiAgICogQG1lbWJlck9mIFN1YnNjcmlwdGlvblxuICAgKiBAaW5zdGFuY2VcbiAgICogQHBhcmFtIHtTdHJpbmd9IGNvbGxlY3Rpb24gVGhlIG5hbWUgb2YgdGhlIGNvbGxlY3Rpb24gdGhhdCB0aGUgZG9jdW1lbnQgaGFzIGJlZW4gcmVtb3ZlZCBmcm9tLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gaWQgVGhlIElEIG9mIHRoZSBkb2N1bWVudCB0aGF0IGhhcyBiZWVuIHJlbW92ZWQuXG4gICAqL1xuICByZW1vdmVkIChjb2xsZWN0aW9uTmFtZSwgaWQpIHtcbiAgICBpZiAodGhpcy5faXNEZWFjdGl2YXRlZCgpKVxuICAgICAgcmV0dXJuO1xuICAgIGlkID0gdGhpcy5faWRGaWx0ZXIuaWRTdHJpbmdpZnkoaWQpO1xuXG4gICAgaWYgKHRoaXMuX3Nlc3Npb24uc2VydmVyLmdldFB1YmxpY2F0aW9uU3RyYXRlZ3koY29sbGVjdGlvbk5hbWUpLmRvQWNjb3VudGluZ0ZvckNvbGxlY3Rpb24pIHtcbiAgICAgIC8vIFdlIGRvbid0IGJvdGhlciB0byBkZWxldGUgc2V0cyBvZiB0aGluZ3MgaW4gYSBjb2xsZWN0aW9uIGlmIHRoZVxuICAgICAgLy8gY29sbGVjdGlvbiBpcyBlbXB0eS4gIEl0IGNvdWxkIGJyZWFrIF9yZW1vdmVBbGxEb2N1bWVudHMuXG4gICAgICB0aGlzLl9kb2N1bWVudHMuZ2V0KGNvbGxlY3Rpb25OYW1lKS5kZWxldGUoaWQpO1xuICAgIH1cblxuICAgIHRoaXMuX3Nlc3Npb24ucmVtb3ZlZCh0aGlzLl9zdWJzY3JpcHRpb25IYW5kbGUsIGNvbGxlY3Rpb25OYW1lLCBpZCk7XG4gIH0sXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IENhbGwgaW5zaWRlIHRoZSBwdWJsaXNoIGZ1bmN0aW9uLiAgSW5mb3JtcyB0aGUgc3Vic2NyaWJlciB0aGF0IGFuIGluaXRpYWwsIGNvbXBsZXRlIHNuYXBzaG90IG9mIHRoZSByZWNvcmQgc2V0IGhhcyBiZWVuIHNlbnQuICBUaGlzIHdpbGwgdHJpZ2dlciBhIGNhbGwgb24gdGhlIGNsaWVudCB0byB0aGUgYG9uUmVhZHlgIGNhbGxiYWNrIHBhc3NlZCB0byAgW2BNZXRlb3Iuc3Vic2NyaWJlYF0oI21ldGVvcl9zdWJzY3JpYmUpLCBpZiBhbnkuXG4gICAqIEBsb2N1cyBTZXJ2ZXJcbiAgICogQG1lbWJlck9mIFN1YnNjcmlwdGlvblxuICAgKiBAaW5zdGFuY2VcbiAgICovXG4gIHJlYWR5OiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmIChzZWxmLl9pc0RlYWN0aXZhdGVkKCkpXG4gICAgICByZXR1cm47XG4gICAgaWYgKCFzZWxmLl9zdWJzY3JpcHRpb25JZClcbiAgICAgIHJldHVybjsgIC8vIFVubmVjZXNzYXJ5IGJ1dCBpZ25vcmVkIGZvciB1bml2ZXJzYWwgc3ViXG4gICAgaWYgKCFzZWxmLl9yZWFkeSkge1xuICAgICAgc2VsZi5fc2Vzc2lvbi5zZW5kUmVhZHkoW3NlbGYuX3N1YnNjcmlwdGlvbklkXSk7XG4gICAgICBzZWxmLl9yZWFkeSA9IHRydWU7XG4gICAgfVxuICB9XG59KTtcblxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cbi8qIFNlcnZlciAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICovXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG5TZXJ2ZXIgPSBmdW5jdGlvbiAob3B0aW9ucyA9IHt9KSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICAvLyBUaGUgZGVmYXVsdCBoZWFydGJlYXQgaW50ZXJ2YWwgaXMgMzAgc2Vjb25kcyBvbiB0aGUgc2VydmVyIGFuZCAzNVxuICAvLyBzZWNvbmRzIG9uIHRoZSBjbGllbnQuICBTaW5jZSB0aGUgY2xpZW50IGRvZXNuJ3QgbmVlZCB0byBzZW5kIGFcbiAgLy8gcGluZyBhcyBsb25nIGFzIGl0IGlzIHJlY2VpdmluZyBwaW5ncywgdGhpcyBtZWFucyB0aGF0IHBpbmdzXG4gIC8vIG5vcm1hbGx5IGdvIGZyb20gdGhlIHNlcnZlciB0byB0aGUgY2xpZW50LlxuICAvL1xuICAvLyBOb3RlOiBUcm9wb3NwaGVyZSBkZXBlbmRzIG9uIHRoZSBhYmlsaXR5IHRvIG11dGF0ZVxuICAvLyBNZXRlb3Iuc2VydmVyLm9wdGlvbnMuaGVhcnRiZWF0VGltZW91dCEgVGhpcyBpcyBhIGhhY2ssIGJ1dCBpdCdzIGxpZmUuXG4gIHNlbGYub3B0aW9ucyA9IHtcbiAgICBoZWFydGJlYXRJbnRlcnZhbDogMTUwMDAsXG4gICAgaGVhcnRiZWF0VGltZW91dDogMTUwMDAsXG4gICAgLy8gRm9yIHRlc3RpbmcsIGFsbG93IHJlc3BvbmRpbmcgdG8gcGluZ3MgdG8gYmUgZGlzYWJsZWQuXG4gICAgcmVzcG9uZFRvUGluZ3M6IHRydWUsXG4gICAgZGVmYXVsdFB1YmxpY2F0aW9uU3RyYXRlZ3k6IHB1YmxpY2F0aW9uU3RyYXRlZ2llcy5TRVJWRVJfTUVSR0UsXG4gICAgLi4ub3B0aW9ucyxcbiAgfTtcblxuICAvLyBNYXAgb2YgY2FsbGJhY2tzIHRvIGNhbGwgd2hlbiBhIG5ldyBjb25uZWN0aW9uIGNvbWVzIGluIHRvIHRoZVxuICAvLyBzZXJ2ZXIgYW5kIGNvbXBsZXRlcyBERFAgdmVyc2lvbiBuZWdvdGlhdGlvbi4gVXNlIGFuIG9iamVjdCBpbnN0ZWFkXG4gIC8vIG9mIGFuIGFycmF5IHNvIHdlIGNhbiBzYWZlbHkgcmVtb3ZlIG9uZSBmcm9tIHRoZSBsaXN0IHdoaWxlXG4gIC8vIGl0ZXJhdGluZyBvdmVyIGl0LlxuICBzZWxmLm9uQ29ubmVjdGlvbkhvb2sgPSBuZXcgSG9vayh7XG4gICAgZGVidWdQcmludEV4Y2VwdGlvbnM6IFwib25Db25uZWN0aW9uIGNhbGxiYWNrXCJcbiAgfSk7XG5cbiAgLy8gTWFwIG9mIGNhbGxiYWNrcyB0byBjYWxsIHdoZW4gYSBuZXcgbWVzc2FnZSBjb21lcyBpbi5cbiAgc2VsZi5vbk1lc3NhZ2VIb29rID0gbmV3IEhvb2soe1xuICAgIGRlYnVnUHJpbnRFeGNlcHRpb25zOiBcIm9uTWVzc2FnZSBjYWxsYmFja1wiXG4gIH0pO1xuXG4gIHNlbGYucHVibGlzaF9oYW5kbGVycyA9IHt9O1xuICBzZWxmLnVuaXZlcnNhbF9wdWJsaXNoX2hhbmRsZXJzID0gW107XG5cbiAgc2VsZi5tZXRob2RfaGFuZGxlcnMgPSB7fTtcblxuICBzZWxmLl9wdWJsaWNhdGlvblN0cmF0ZWdpZXMgPSB7fTtcblxuICBzZWxmLnNlc3Npb25zID0gbmV3IE1hcCgpOyAvLyBtYXAgZnJvbSBpZCB0byBzZXNzaW9uXG5cbiAgc2VsZi5zdHJlYW1fc2VydmVyID0gbmV3IFN0cmVhbVNlcnZlcigpO1xuXG4gIHNlbGYuc3RyZWFtX3NlcnZlci5yZWdpc3RlcihmdW5jdGlvbiAoc29ja2V0KSB7XG4gICAgLy8gc29ja2V0IGltcGxlbWVudHMgdGhlIFNvY2tKU0Nvbm5lY3Rpb24gaW50ZXJmYWNlXG4gICAgc29ja2V0Ll9tZXRlb3JTZXNzaW9uID0gbnVsbDtcblxuICAgIHZhciBzZW5kRXJyb3IgPSBmdW5jdGlvbiAocmVhc29uLCBvZmZlbmRpbmdNZXNzYWdlKSB7XG4gICAgICB2YXIgbXNnID0ge21zZzogJ2Vycm9yJywgcmVhc29uOiByZWFzb259O1xuICAgICAgaWYgKG9mZmVuZGluZ01lc3NhZ2UpXG4gICAgICAgIG1zZy5vZmZlbmRpbmdNZXNzYWdlID0gb2ZmZW5kaW5nTWVzc2FnZTtcbiAgICAgIHNvY2tldC5zZW5kKEREUENvbW1vbi5zdHJpbmdpZnlERFAobXNnKSk7XG4gICAgfTtcblxuICAgIHNvY2tldC5vbignZGF0YScsIGZ1bmN0aW9uIChyYXdfbXNnKSB7XG4gICAgICBpZiAoTWV0ZW9yLl9wcmludFJlY2VpdmVkRERQKSB7XG4gICAgICAgIE1ldGVvci5fZGVidWcoXCJSZWNlaXZlZCBERFBcIiwgcmF3X21zZyk7XG4gICAgICB9XG4gICAgICB0cnkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHZhciBtc2cgPSBERFBDb21tb24ucGFyc2VERFAocmF3X21zZyk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIHNlbmRFcnJvcignUGFyc2UgZXJyb3InKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG1zZyA9PT0gbnVsbCB8fCAhbXNnLm1zZykge1xuICAgICAgICAgIHNlbmRFcnJvcignQmFkIHJlcXVlc3QnLCBtc2cpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtc2cubXNnID09PSAnY29ubmVjdCcpIHtcbiAgICAgICAgICBpZiAoc29ja2V0Ll9tZXRlb3JTZXNzaW9uKSB7XG4gICAgICAgICAgICBzZW5kRXJyb3IoXCJBbHJlYWR5IGNvbm5lY3RlZFwiLCBtc2cpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHNlbGYuX2hhbmRsZUNvbm5lY3Qoc29ja2V0LCBtc2cpO1xuXG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFzb2NrZXQuX21ldGVvclNlc3Npb24pIHtcbiAgICAgICAgICBzZW5kRXJyb3IoJ011c3QgY29ubmVjdCBmaXJzdCcsIG1zZyk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHNvY2tldC5fbWV0ZW9yU2Vzc2lvbi5wcm9jZXNzTWVzc2FnZShtc2cpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAvLyBYWFggcHJpbnQgc3RhY2sgbmljZWx5XG4gICAgICAgIE1ldGVvci5fZGVidWcoXCJJbnRlcm5hbCBleGNlcHRpb24gd2hpbGUgcHJvY2Vzc2luZyBtZXNzYWdlXCIsIG1zZywgZSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBzb2NrZXQub24oJ2Nsb3NlJywgZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKHNvY2tldC5fbWV0ZW9yU2Vzc2lvbikge1xuICAgICAgICBzb2NrZXQuX21ldGVvclNlc3Npb24uY2xvc2UoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG59O1xuXG5PYmplY3QuYXNzaWduKFNlcnZlci5wcm90b3R5cGUsIHtcblxuICAvKipcbiAgICogQHN1bW1hcnkgUmVnaXN0ZXIgYSBjYWxsYmFjayB0byBiZSBjYWxsZWQgd2hlbiBhIG5ldyBERFAgY29ubmVjdGlvbiBpcyBtYWRlIHRvIHRoZSBzZXJ2ZXIuXG4gICAqIEBsb2N1cyBTZXJ2ZXJcbiAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGZ1bmN0aW9uIHRvIGNhbGwgd2hlbiBhIG5ldyBERFAgY29ubmVjdGlvbiBpcyBlc3RhYmxpc2hlZC5cbiAgICogQG1lbWJlck9mIE1ldGVvclxuICAgKiBAaW1wb3J0RnJvbVBhY2thZ2UgbWV0ZW9yXG4gICAqL1xuICBvbkNvbm5lY3Rpb246IGZ1bmN0aW9uIChmbikge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICByZXR1cm4gc2VsZi5vbkNvbm5lY3Rpb25Ib29rLnJlZ2lzdGVyKGZuKTtcbiAgfSxcblxuICAvKipcbiAgICogQHN1bW1hcnkgU2V0IHB1YmxpY2F0aW9uIHN0cmF0ZWd5IGZvciB0aGUgZ2l2ZW4gY29sbGVjdGlvbi4gUHVibGljYXRpb25zIHN0cmF0ZWdpZXMgYXJlIGF2YWlsYWJsZSBmcm9tIGBERFBTZXJ2ZXIucHVibGljYXRpb25TdHJhdGVnaWVzYC4gWW91IGNhbGwgdGhpcyBtZXRob2QgZnJvbSBgTWV0ZW9yLnNlcnZlcmAsIGxpa2UgYE1ldGVvci5zZXJ2ZXIuc2V0UHVibGljYXRpb25TdHJhdGVneSgpYFxuICAgKiBAbG9jdXMgU2VydmVyXG4gICAqIEBhbGlhcyBzZXRQdWJsaWNhdGlvblN0cmF0ZWd5XG4gICAqIEBwYXJhbSBjb2xsZWN0aW9uTmFtZSB7U3RyaW5nfVxuICAgKiBAcGFyYW0gc3RyYXRlZ3kge3t1c2VDb2xsZWN0aW9uVmlldzogYm9vbGVhbiwgZG9BY2NvdW50aW5nRm9yQ29sbGVjdGlvbjogYm9vbGVhbn19XG4gICAqIEBtZW1iZXJPZiBNZXRlb3Iuc2VydmVyXG4gICAqIEBpbXBvcnRGcm9tUGFja2FnZSBtZXRlb3JcbiAgICovXG4gIHNldFB1YmxpY2F0aW9uU3RyYXRlZ3koY29sbGVjdGlvbk5hbWUsIHN0cmF0ZWd5KSB7XG4gICAgaWYgKCFPYmplY3QudmFsdWVzKHB1YmxpY2F0aW9uU3RyYXRlZ2llcykuaW5jbHVkZXMoc3RyYXRlZ3kpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgbWVyZ2Ugc3RyYXRlZ3k6ICR7c3RyYXRlZ3l9IFxuICAgICAgICBmb3IgY29sbGVjdGlvbiAke2NvbGxlY3Rpb25OYW1lfWApO1xuICAgIH1cbiAgICB0aGlzLl9wdWJsaWNhdGlvblN0cmF0ZWdpZXNbY29sbGVjdGlvbk5hbWVdID0gc3RyYXRlZ3k7XG4gIH0sXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IEdldHMgdGhlIHB1YmxpY2F0aW9uIHN0cmF0ZWd5IGZvciB0aGUgcmVxdWVzdGVkIGNvbGxlY3Rpb24uIFlvdSBjYWxsIHRoaXMgbWV0aG9kIGZyb20gYE1ldGVvci5zZXJ2ZXJgLCBsaWtlIGBNZXRlb3Iuc2VydmVyLmdldFB1YmxpY2F0aW9uU3RyYXRlZ3koKWBcbiAgICogQGxvY3VzIFNlcnZlclxuICAgKiBAYWxpYXMgZ2V0UHVibGljYXRpb25TdHJhdGVneVxuICAgKiBAcGFyYW0gY29sbGVjdGlvbk5hbWUge1N0cmluZ31cbiAgICogQG1lbWJlck9mIE1ldGVvci5zZXJ2ZXJcbiAgICogQGltcG9ydEZyb21QYWNrYWdlIG1ldGVvclxuICAgKiBAcmV0dXJuIHt7dXNlQ29sbGVjdGlvblZpZXc6IGJvb2xlYW4sIGRvQWNjb3VudGluZ0ZvckNvbGxlY3Rpb246IGJvb2xlYW59fVxuICAgKi9cbiAgZ2V0UHVibGljYXRpb25TdHJhdGVneShjb2xsZWN0aW9uTmFtZSkge1xuICAgIHJldHVybiB0aGlzLl9wdWJsaWNhdGlvblN0cmF0ZWdpZXNbY29sbGVjdGlvbk5hbWVdXG4gICAgICB8fCB0aGlzLm9wdGlvbnMuZGVmYXVsdFB1YmxpY2F0aW9uU3RyYXRlZ3k7XG4gIH0sXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IFJlZ2lzdGVyIGEgY2FsbGJhY2sgdG8gYmUgY2FsbGVkIHdoZW4gYSBuZXcgRERQIG1lc3NhZ2UgaXMgcmVjZWl2ZWQuXG4gICAqIEBsb2N1cyBTZXJ2ZXJcbiAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGZ1bmN0aW9uIHRvIGNhbGwgd2hlbiBhIG5ldyBERFAgbWVzc2FnZSBpcyByZWNlaXZlZC5cbiAgICogQG1lbWJlck9mIE1ldGVvclxuICAgKiBAaW1wb3J0RnJvbVBhY2thZ2UgbWV0ZW9yXG4gICAqL1xuICBvbk1lc3NhZ2U6IGZ1bmN0aW9uIChmbikge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICByZXR1cm4gc2VsZi5vbk1lc3NhZ2VIb29rLnJlZ2lzdGVyKGZuKTtcbiAgfSxcblxuICBfaGFuZGxlQ29ubmVjdDogZnVuY3Rpb24gKHNvY2tldCwgbXNnKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgLy8gVGhlIGNvbm5lY3QgbWVzc2FnZSBtdXN0IHNwZWNpZnkgYSB2ZXJzaW9uIGFuZCBhbiBhcnJheSBvZiBzdXBwb3J0ZWRcbiAgICAvLyB2ZXJzaW9ucywgYW5kIGl0IG11c3QgY2xhaW0gdG8gc3VwcG9ydCB3aGF0IGl0IGlzIHByb3Bvc2luZy5cbiAgICBpZiAoISh0eXBlb2YgKG1zZy52ZXJzaW9uKSA9PT0gJ3N0cmluZycgJiZcbiAgICAgICAgICBBcnJheS5pc0FycmF5KG1zZy5zdXBwb3J0KSAmJlxuICAgICAgICAgIG1zZy5zdXBwb3J0LmV2ZXJ5KGlzU3RyaW5nKSAmJlxuICAgICAgICAgIG1zZy5zdXBwb3J0LmluY2x1ZGVzKG1zZy52ZXJzaW9uKSkpIHtcbiAgICAgIHNvY2tldC5zZW5kKEREUENvbW1vbi5zdHJpbmdpZnlERFAoe21zZzogJ2ZhaWxlZCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZlcnNpb246IEREUENvbW1vbi5TVVBQT1JURURfRERQX1ZFUlNJT05TWzBdfSkpO1xuICAgICAgc29ja2V0LmNsb3NlKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gSW4gdGhlIGZ1dHVyZSwgaGFuZGxlIHNlc3Npb24gcmVzdW1wdGlvbjogc29tZXRoaW5nIGxpa2U6XG4gICAgLy8gIHNvY2tldC5fbWV0ZW9yU2Vzc2lvbiA9IHNlbGYuc2Vzc2lvbnNbbXNnLnNlc3Npb25dXG4gICAgdmFyIHZlcnNpb24gPSBjYWxjdWxhdGVWZXJzaW9uKG1zZy5zdXBwb3J0LCBERFBDb21tb24uU1VQUE9SVEVEX0REUF9WRVJTSU9OUyk7XG5cbiAgICBpZiAobXNnLnZlcnNpb24gIT09IHZlcnNpb24pIHtcbiAgICAgIC8vIFRoZSBiZXN0IHZlcnNpb24gdG8gdXNlIChhY2NvcmRpbmcgdG8gdGhlIGNsaWVudCdzIHN0YXRlZCBwcmVmZXJlbmNlcylcbiAgICAgIC8vIGlzIG5vdCB0aGUgb25lIHRoZSBjbGllbnQgaXMgdHJ5aW5nIHRvIHVzZS4gSW5mb3JtIHRoZW0gYWJvdXQgdGhlIGJlc3RcbiAgICAgIC8vIHZlcnNpb24gdG8gdXNlLlxuICAgICAgc29ja2V0LnNlbmQoRERQQ29tbW9uLnN0cmluZ2lmeUREUCh7bXNnOiAnZmFpbGVkJywgdmVyc2lvbjogdmVyc2lvbn0pKTtcbiAgICAgIHNvY2tldC5jbG9zZSgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFlheSwgdmVyc2lvbiBtYXRjaGVzISBDcmVhdGUgYSBuZXcgc2Vzc2lvbi5cbiAgICAvLyBOb3RlOiBUcm9wb3NwaGVyZSBkZXBlbmRzIG9uIHRoZSBhYmlsaXR5IHRvIG11dGF0ZVxuICAgIC8vIE1ldGVvci5zZXJ2ZXIub3B0aW9ucy5oZWFydGJlYXRUaW1lb3V0ISBUaGlzIGlzIGEgaGFjaywgYnV0IGl0J3MgbGlmZS5cbiAgICBzb2NrZXQuX21ldGVvclNlc3Npb24gPSBuZXcgU2Vzc2lvbihzZWxmLCB2ZXJzaW9uLCBzb2NrZXQsIHNlbGYub3B0aW9ucyk7XG4gICAgc2VsZi5zZXNzaW9ucy5zZXQoc29ja2V0Ll9tZXRlb3JTZXNzaW9uLmlkLCBzb2NrZXQuX21ldGVvclNlc3Npb24pO1xuICAgIHNlbGYub25Db25uZWN0aW9uSG9vay5lYWNoKGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgaWYgKHNvY2tldC5fbWV0ZW9yU2Vzc2lvbilcbiAgICAgICAgY2FsbGJhY2soc29ja2V0Ll9tZXRlb3JTZXNzaW9uLmNvbm5lY3Rpb25IYW5kbGUpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSk7XG4gIH0sXG4gIC8qKlxuICAgKiBSZWdpc3RlciBhIHB1Ymxpc2ggaGFuZGxlciBmdW5jdGlvbi5cbiAgICpcbiAgICogQHBhcmFtIG5hbWUge1N0cmluZ30gaWRlbnRpZmllciBmb3IgcXVlcnlcbiAgICogQHBhcmFtIGhhbmRsZXIge0Z1bmN0aW9ufSBwdWJsaXNoIGhhbmRsZXJcbiAgICogQHBhcmFtIG9wdGlvbnMge09iamVjdH1cbiAgICpcbiAgICogU2VydmVyIHdpbGwgY2FsbCBoYW5kbGVyIGZ1bmN0aW9uIG9uIGVhY2ggbmV3IHN1YnNjcmlwdGlvbixcbiAgICogZWl0aGVyIHdoZW4gcmVjZWl2aW5nIEREUCBzdWIgbWVzc2FnZSBmb3IgYSBuYW1lZCBzdWJzY3JpcHRpb24sIG9yIG9uXG4gICAqIEREUCBjb25uZWN0IGZvciBhIHVuaXZlcnNhbCBzdWJzY3JpcHRpb24uXG4gICAqXG4gICAqIElmIG5hbWUgaXMgbnVsbCwgdGhpcyB3aWxsIGJlIGEgc3Vic2NyaXB0aW9uIHRoYXQgaXNcbiAgICogYXV0b21hdGljYWxseSBlc3RhYmxpc2hlZCBhbmQgcGVybWFuZW50bHkgb24gZm9yIGFsbCBjb25uZWN0ZWRcbiAgICogY2xpZW50LCBpbnN0ZWFkIG9mIGEgc3Vic2NyaXB0aW9uIHRoYXQgY2FuIGJlIHR1cm5lZCBvbiBhbmQgb2ZmXG4gICAqIHdpdGggc3Vic2NyaWJlKCkuXG4gICAqXG4gICAqIG9wdGlvbnMgdG8gY29udGFpbjpcbiAgICogIC0gKG1vc3RseSBpbnRlcm5hbCkgaXNfYXV0bzogdHJ1ZSBpZiBnZW5lcmF0ZWQgYXV0b21hdGljYWxseVxuICAgKiAgICBmcm9tIGFuIGF1dG9wdWJsaXNoIGhvb2suIHRoaXMgaXMgZm9yIGNvc21ldGljIHB1cnBvc2VzIG9ubHlcbiAgICogICAgKGl0IGxldHMgdXMgZGV0ZXJtaW5lIHdoZXRoZXIgdG8gcHJpbnQgYSB3YXJuaW5nIHN1Z2dlc3RpbmdcbiAgICogICAgdGhhdCB5b3UgdHVybiBvZmYgYXV0b3B1Ymxpc2gpLlxuICAgKi9cblxuICAvKipcbiAgICogQHN1bW1hcnkgUHVibGlzaCBhIHJlY29yZCBzZXQuXG4gICAqIEBtZW1iZXJPZiBNZXRlb3JcbiAgICogQGltcG9ydEZyb21QYWNrYWdlIG1ldGVvclxuICAgKiBAbG9jdXMgU2VydmVyXG4gICAqIEBwYXJhbSB7U3RyaW5nfE9iamVjdH0gbmFtZSBJZiBTdHJpbmcsIG5hbWUgb2YgdGhlIHJlY29yZCBzZXQuICBJZiBPYmplY3QsIHB1YmxpY2F0aW9ucyBEaWN0aW9uYXJ5IG9mIHB1Ymxpc2ggZnVuY3Rpb25zIGJ5IG5hbWUuICBJZiBgbnVsbGAsIHRoZSBzZXQgaGFzIG5vIG5hbWUsIGFuZCB0aGUgcmVjb3JkIHNldCBpcyBhdXRvbWF0aWNhbGx5IHNlbnQgdG8gYWxsIGNvbm5lY3RlZCBjbGllbnRzLlxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIEZ1bmN0aW9uIGNhbGxlZCBvbiB0aGUgc2VydmVyIGVhY2ggdGltZSBhIGNsaWVudCBzdWJzY3JpYmVzLiAgSW5zaWRlIHRoZSBmdW5jdGlvbiwgYHRoaXNgIGlzIHRoZSBwdWJsaXNoIGhhbmRsZXIgb2JqZWN0LCBkZXNjcmliZWQgYmVsb3cuICBJZiB0aGUgY2xpZW50IHBhc3NlZCBhcmd1bWVudHMgdG8gYHN1YnNjcmliZWAsIHRoZSBmdW5jdGlvbiBpcyBjYWxsZWQgd2l0aCB0aGUgc2FtZSBhcmd1bWVudHMuXG4gICAqL1xuICBwdWJsaXNoOiBmdW5jdGlvbiAobmFtZSwgaGFuZGxlciwgb3B0aW9ucykge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIGlmICghaXNPYmplY3QobmFtZSkpIHtcbiAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgICBpZiAobmFtZSAmJiBuYW1lIGluIHNlbGYucHVibGlzaF9oYW5kbGVycykge1xuICAgICAgICBNZXRlb3IuX2RlYnVnKFwiSWdub3JpbmcgZHVwbGljYXRlIHB1Ymxpc2ggbmFtZWQgJ1wiICsgbmFtZSArIFwiJ1wiKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAoUGFja2FnZS5hdXRvcHVibGlzaCAmJiAhb3B0aW9ucy5pc19hdXRvKSB7XG4gICAgICAgIC8vIFRoZXkgaGF2ZSBhdXRvcHVibGlzaCBvbiwgeWV0IHRoZXkncmUgdHJ5aW5nIHRvIG1hbnVhbGx5XG4gICAgICAgIC8vIHBpY2sgc3R1ZmYgdG8gcHVibGlzaC4gVGhleSBwcm9iYWJseSBzaG91bGQgdHVybiBvZmZcbiAgICAgICAgLy8gYXV0b3B1Ymxpc2guIChUaGlzIGNoZWNrIGlzbid0IHBlcmZlY3QgLS0gaWYgeW91IGNyZWF0ZSBhXG4gICAgICAgIC8vIHB1Ymxpc2ggYmVmb3JlIHlvdSB0dXJuIG9uIGF1dG9wdWJsaXNoLCBpdCB3b24ndCBjYXRjaFxuICAgICAgICAvLyBpdCwgYnV0IHRoaXMgd2lsbCBkZWZpbml0ZWx5IGhhbmRsZSB0aGUgc2ltcGxlIGNhc2Ugd2hlcmVcbiAgICAgICAgLy8geW91J3ZlIGFkZGVkIHRoZSBhdXRvcHVibGlzaCBwYWNrYWdlIHRvIHlvdXIgYXBwLCBhbmQgYXJlXG4gICAgICAgIC8vIGNhbGxpbmcgcHVibGlzaCBmcm9tIHlvdXIgYXBwIGNvZGUpLlxuICAgICAgICBpZiAoIXNlbGYud2FybmVkX2Fib3V0X2F1dG9wdWJsaXNoKSB7XG4gICAgICAgICAgc2VsZi53YXJuZWRfYWJvdXRfYXV0b3B1Ymxpc2ggPSB0cnVlO1xuICAgICAgICAgIE1ldGVvci5fZGVidWcoXG4gICAgXCIqKiBZb3UndmUgc2V0IHVwIHNvbWUgZGF0YSBzdWJzY3JpcHRpb25zIHdpdGggTWV0ZW9yLnB1Ymxpc2goKSwgYnV0XFxuXCIgK1xuICAgIFwiKiogeW91IHN0aWxsIGhhdmUgYXV0b3B1Ymxpc2ggdHVybmVkIG9uLiBCZWNhdXNlIGF1dG9wdWJsaXNoIGlzIHN0aWxsXFxuXCIgK1xuICAgIFwiKiogb24sIHlvdXIgTWV0ZW9yLnB1Ymxpc2goKSBjYWxscyB3b24ndCBoYXZlIG11Y2ggZWZmZWN0LiBBbGwgZGF0YVxcblwiICtcbiAgICBcIioqIHdpbGwgc3RpbGwgYmUgc2VudCB0byBhbGwgY2xpZW50cy5cXG5cIiArXG4gICAgXCIqKlxcblwiICtcbiAgICBcIioqIFR1cm4gb2ZmIGF1dG9wdWJsaXNoIGJ5IHJlbW92aW5nIHRoZSBhdXRvcHVibGlzaCBwYWNrYWdlOlxcblwiICtcbiAgICBcIioqXFxuXCIgK1xuICAgIFwiKiogICAkIG1ldGVvciByZW1vdmUgYXV0b3B1Ymxpc2hcXG5cIiArXG4gICAgXCIqKlxcblwiICtcbiAgICBcIioqIC4uIGFuZCBtYWtlIHN1cmUgeW91IGhhdmUgTWV0ZW9yLnB1Ymxpc2goKSBhbmQgTWV0ZW9yLnN1YnNjcmliZSgpIGNhbGxzXFxuXCIgK1xuICAgIFwiKiogZm9yIGVhY2ggY29sbGVjdGlvbiB0aGF0IHlvdSB3YW50IGNsaWVudHMgdG8gc2VlLlxcblwiKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAobmFtZSlcbiAgICAgICAgc2VsZi5wdWJsaXNoX2hhbmRsZXJzW25hbWVdID0gaGFuZGxlcjtcbiAgICAgIGVsc2Uge1xuICAgICAgICBzZWxmLnVuaXZlcnNhbF9wdWJsaXNoX2hhbmRsZXJzLnB1c2goaGFuZGxlcik7XG4gICAgICAgIC8vIFNwaW4gdXAgdGhlIG5ldyBwdWJsaXNoZXIgb24gYW55IGV4aXN0aW5nIHNlc3Npb24gdG9vLiBSdW4gZWFjaFxuICAgICAgICAvLyBzZXNzaW9uJ3Mgc3Vic2NyaXB0aW9uIGluIGEgbmV3IEZpYmVyLCBzbyB0aGF0IHRoZXJlJ3Mgbm8gY2hhbmdlIGZvclxuICAgICAgICAvLyBzZWxmLnNlc3Npb25zIHRvIGNoYW5nZSB3aGlsZSB3ZSdyZSBydW5uaW5nIHRoaXMgbG9vcC5cbiAgICAgICAgc2VsZi5zZXNzaW9ucy5mb3JFYWNoKGZ1bmN0aW9uIChzZXNzaW9uKSB7XG4gICAgICAgICAgaWYgKCFzZXNzaW9uLl9kb250U3RhcnROZXdVbml2ZXJzYWxTdWJzKSB7XG4gICAgICAgICAgICBzZXNzaW9uLl9zdGFydFN1YnNjcmlwdGlvbihoYW5kbGVyKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICBlbHNle1xuICAgICAgT2JqZWN0LmVudHJpZXMobmFtZSkuZm9yRWFjaChmdW5jdGlvbihba2V5LCB2YWx1ZV0pIHtcbiAgICAgICAgc2VsZi5wdWJsaXNoKGtleSwgdmFsdWUsIHt9KTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfSxcblxuICBfcmVtb3ZlU2Vzc2lvbjogZnVuY3Rpb24gKHNlc3Npb24pIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgc2VsZi5zZXNzaW9ucy5kZWxldGUoc2Vzc2lvbi5pZCk7XG4gIH0sXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IFRlbGxzIGlmIHRoZSBtZXRob2QgY2FsbCBjYW1lIGZyb20gYSBjYWxsIG9yIGEgY2FsbEFzeW5jLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQG1lbWJlck9mIE1ldGVvclxuICAgKiBAaW1wb3J0RnJvbVBhY2thZ2UgbWV0ZW9yXG4gICAqIEByZXR1cm5zIGJvb2xlYW5cbiAgICovXG4gIGlzQXN5bmNDYWxsOiBmdW5jdGlvbigpe1xuICAgIHJldHVybiBERFAuX0N1cnJlbnRNZXRob2RJbnZvY2F0aW9uLl9pc0NhbGxBc3luY01ldGhvZFJ1bm5pbmcoKVxuICB9LFxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBEZWZpbmVzIGZ1bmN0aW9ucyB0aGF0IGNhbiBiZSBpbnZva2VkIG92ZXIgdGhlIG5ldHdvcmsgYnkgY2xpZW50cy5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBtZXRob2RzIERpY3Rpb25hcnkgd2hvc2Uga2V5cyBhcmUgbWV0aG9kIG5hbWVzIGFuZCB2YWx1ZXMgYXJlIGZ1bmN0aW9ucy5cbiAgICogQG1lbWJlck9mIE1ldGVvclxuICAgKiBAaW1wb3J0RnJvbVBhY2thZ2UgbWV0ZW9yXG4gICAqL1xuICBtZXRob2RzOiBmdW5jdGlvbiAobWV0aG9kcykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBPYmplY3QuZW50cmllcyhtZXRob2RzKS5mb3JFYWNoKGZ1bmN0aW9uIChbbmFtZSwgZnVuY10pIHtcbiAgICAgIGlmICh0eXBlb2YgZnVuYyAhPT0gJ2Z1bmN0aW9uJylcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTWV0aG9kICdcIiArIG5hbWUgKyBcIicgbXVzdCBiZSBhIGZ1bmN0aW9uXCIpO1xuICAgICAgaWYgKHNlbGYubWV0aG9kX2hhbmRsZXJzW25hbWVdKVxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJBIG1ldGhvZCBuYW1lZCAnXCIgKyBuYW1lICsgXCInIGlzIGFscmVhZHkgZGVmaW5lZFwiKTtcbiAgICAgIHNlbGYubWV0aG9kX2hhbmRsZXJzW25hbWVdID0gZnVuYztcbiAgICB9KTtcbiAgfSxcblxuICBjYWxsOiBmdW5jdGlvbiAobmFtZSwgLi4uYXJncykge1xuICAgIGlmIChhcmdzLmxlbmd0aCAmJiB0eXBlb2YgYXJnc1thcmdzLmxlbmd0aCAtIDFdID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgIC8vIElmIGl0J3MgYSBmdW5jdGlvbiwgdGhlIGxhc3QgYXJndW1lbnQgaXMgdGhlIHJlc3VsdCBjYWxsYmFjaywgbm90XG4gICAgICAvLyBhIHBhcmFtZXRlciB0byB0aGUgcmVtb3RlIG1ldGhvZC5cbiAgICAgIHZhciBjYWxsYmFjayA9IGFyZ3MucG9wKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuYXBwbHkobmFtZSwgYXJncywgY2FsbGJhY2spO1xuICB9LFxuXG4gIC8vIEEgdmVyc2lvbiBvZiB0aGUgY2FsbCBtZXRob2QgdGhhdCBhbHdheXMgcmV0dXJucyBhIFByb21pc2UuXG4gIGNhbGxBc3luYzogZnVuY3Rpb24gKG5hbWUsIC4uLmFyZ3MpIHtcbiAgICBjb25zdCBvcHRpb25zID0gYXJnc1swXT8uaGFzT3duUHJvcGVydHkoJ3JldHVyblN0dWJWYWx1ZScpXG4gICAgICA/IGFyZ3Muc2hpZnQoKVxuICAgICAgOiB7fTtcbiAgICBERFAuX0N1cnJlbnRNZXRob2RJbnZvY2F0aW9uLl9zZXRDYWxsQXN5bmNNZXRob2RSdW5uaW5nKHRydWUpO1xuICAgIGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBERFAuX0N1cnJlbnRDYWxsQXN5bmNJbnZvY2F0aW9uLl9zZXQoeyBuYW1lLCBoYXNDYWxsQXN5bmNQYXJlbnQ6IHRydWUgfSk7XG4gICAgICB0aGlzLmFwcGx5QXN5bmMobmFtZSwgYXJncywgeyBpc0Zyb21DYWxsQXN5bmM6IHRydWUsIC4uLm9wdGlvbnMgfSlcbiAgICAgICAgLnRoZW4ocmVzb2x2ZSlcbiAgICAgICAgLmNhdGNoKHJlamVjdClcbiAgICAgICAgLmZpbmFsbHkoKCkgPT4ge1xuICAgICAgICAgIEREUC5fQ3VycmVudENhbGxBc3luY0ludm9jYXRpb24uX3NldCgpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgICByZXR1cm4gcHJvbWlzZS5maW5hbGx5KCgpID0+XG4gICAgICBERFAuX0N1cnJlbnRNZXRob2RJbnZvY2F0aW9uLl9zZXRDYWxsQXN5bmNNZXRob2RSdW5uaW5nKGZhbHNlKVxuICAgICk7XG4gIH0sXG5cbiAgYXBwbHk6IGZ1bmN0aW9uIChuYW1lLCBhcmdzLCBvcHRpb25zLCBjYWxsYmFjaykge1xuICAgIC8vIFdlIHdlcmUgcGFzc2VkIDMgYXJndW1lbnRzLiBUaGV5IG1heSBiZSBlaXRoZXIgKG5hbWUsIGFyZ3MsIG9wdGlvbnMpXG4gICAgLy8gb3IgKG5hbWUsIGFyZ3MsIGNhbGxiYWNrKVxuICAgIGlmICghIGNhbGxiYWNrICYmIHR5cGVvZiBvcHRpb25zID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjYWxsYmFjayA9IG9wdGlvbnM7XG4gICAgICBvcHRpb25zID0ge307XG4gICAgfSBlbHNlIHtcbiAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgIH1cbiAgICBjb25zdCBwcm9taXNlID0gdGhpcy5hcHBseUFzeW5jKG5hbWUsIGFyZ3MsIG9wdGlvbnMpO1xuXG4gICAgLy8gUmV0dXJuIHRoZSByZXN1bHQgaW4gd2hpY2hldmVyIHdheSB0aGUgY2FsbGVyIGFza2VkIGZvciBpdC4gTm90ZSB0aGF0IHdlXG4gICAgLy8gZG8gTk9UIGJsb2NrIG9uIHRoZSB3cml0ZSBmZW5jZSBpbiBhbiBhbmFsb2dvdXMgd2F5IHRvIGhvdyB0aGUgY2xpZW50XG4gICAgLy8gYmxvY2tzIG9uIHRoZSByZWxldmFudCBkYXRhIGJlaW5nIHZpc2libGUsIHNvIHlvdSBhcmUgTk9UIGd1YXJhbnRlZWQgdGhhdFxuICAgIC8vIGN1cnNvciBvYnNlcnZlIGNhbGxiYWNrcyBoYXZlIGZpcmVkIHdoZW4geW91ciBjYWxsYmFjayBpcyBpbnZva2VkLiAoV2VcbiAgICAvLyBjYW4gY2hhbmdlIHRoaXMgaWYgdGhlcmUncyBhIHJlYWwgdXNlIGNhc2UpLlxuICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgcHJvbWlzZS50aGVuKFxuICAgICAgICByZXN1bHQgPT4gY2FsbGJhY2sodW5kZWZpbmVkLCByZXN1bHQpLFxuICAgICAgICBleGNlcHRpb24gPT4gY2FsbGJhY2soZXhjZXB0aW9uKVxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgfVxuICB9LFxuXG4gIC8vIEBwYXJhbSBvcHRpb25zIHtPcHRpb25hbCBPYmplY3R9XG4gIGFwcGx5QXN5bmM6IGZ1bmN0aW9uIChuYW1lLCBhcmdzLCBvcHRpb25zKSB7XG4gICAgLy8gUnVuIHRoZSBoYW5kbGVyXG4gICAgdmFyIGhhbmRsZXIgPSB0aGlzLm1ldGhvZF9oYW5kbGVyc1tuYW1lXTtcblxuICAgIGlmICghIGhhbmRsZXIpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgbmV3IE1ldGVvci5FcnJvcig0MDQsIGBNZXRob2QgJyR7bmFtZX0nIG5vdCBmb3VuZGApXG4gICAgICApO1xuICAgIH1cbiAgICAvLyBJZiB0aGlzIGlzIGEgbWV0aG9kIGNhbGwgZnJvbSB3aXRoaW4gYW5vdGhlciBtZXRob2Qgb3IgcHVibGlzaCBmdW5jdGlvbixcbiAgICAvLyBnZXQgdGhlIHVzZXIgc3RhdGUgZnJvbSB0aGUgb3V0ZXIgbWV0aG9kIG9yIHB1Ymxpc2ggZnVuY3Rpb24sIG90aGVyd2lzZVxuICAgIC8vIGRvbid0IGFsbG93IHNldFVzZXJJZCB0byBiZSBjYWxsZWRcbiAgICB2YXIgdXNlcklkID0gbnVsbDtcbiAgICBsZXQgc2V0VXNlcklkID0gKCkgPT4ge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgY2FsbCBzZXRVc2VySWQgb24gYSBzZXJ2ZXIgaW5pdGlhdGVkIG1ldGhvZCBjYWxsXCIpO1xuICAgIH07XG4gICAgdmFyIGNvbm5lY3Rpb24gPSBudWxsO1xuICAgIHZhciBjdXJyZW50TWV0aG9kSW52b2NhdGlvbiA9IEREUC5fQ3VycmVudE1ldGhvZEludm9jYXRpb24uZ2V0KCk7XG4gICAgdmFyIGN1cnJlbnRQdWJsaWNhdGlvbkludm9jYXRpb24gPSBERFAuX0N1cnJlbnRQdWJsaWNhdGlvbkludm9jYXRpb24uZ2V0KCk7XG4gICAgdmFyIHJhbmRvbVNlZWQgPSBudWxsO1xuXG4gICAgaWYgKGN1cnJlbnRNZXRob2RJbnZvY2F0aW9uKSB7XG4gICAgICB1c2VySWQgPSBjdXJyZW50TWV0aG9kSW52b2NhdGlvbi51c2VySWQ7XG4gICAgICBzZXRVc2VySWQgPSAodXNlcklkKSA9PiBjdXJyZW50TWV0aG9kSW52b2NhdGlvbi5zZXRVc2VySWQodXNlcklkKTtcbiAgICAgIGNvbm5lY3Rpb24gPSBjdXJyZW50TWV0aG9kSW52b2NhdGlvbi5jb25uZWN0aW9uO1xuICAgICAgcmFuZG9tU2VlZCA9IEREUENvbW1vbi5tYWtlUnBjU2VlZChjdXJyZW50TWV0aG9kSW52b2NhdGlvbiwgbmFtZSk7XG4gICAgfSBlbHNlIGlmIChjdXJyZW50UHVibGljYXRpb25JbnZvY2F0aW9uKSB7XG4gICAgICB1c2VySWQgPSBjdXJyZW50UHVibGljYXRpb25JbnZvY2F0aW9uLnVzZXJJZDtcbiAgICAgIHNldFVzZXJJZCA9ICh1c2VySWQpID0+IGN1cnJlbnRQdWJsaWNhdGlvbkludm9jYXRpb24uX3Nlc3Npb24uX3NldFVzZXJJZCh1c2VySWQpO1xuICAgICAgY29ubmVjdGlvbiA9IGN1cnJlbnRQdWJsaWNhdGlvbkludm9jYXRpb24uY29ubmVjdGlvbjtcbiAgICB9XG5cbiAgICB2YXIgaW52b2NhdGlvbiA9IG5ldyBERFBDb21tb24uTWV0aG9kSW52b2NhdGlvbih7XG4gICAgICBpc1NpbXVsYXRpb246IGZhbHNlLFxuICAgICAgdXNlcklkLFxuICAgICAgc2V0VXNlcklkLFxuICAgICAgY29ubmVjdGlvbixcbiAgICAgIHJhbmRvbVNlZWRcbiAgICB9KTtcblxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBsZXQgcmVzdWx0O1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmVzdWx0ID0gRERQLl9DdXJyZW50TWV0aG9kSW52b2NhdGlvbi53aXRoVmFsdWUoaW52b2NhdGlvbiwgKCkgPT5cbiAgICAgICAgICBtYXliZUF1ZGl0QXJndW1lbnRDaGVja3MoXG4gICAgICAgICAgICBoYW5kbGVyLFxuICAgICAgICAgICAgaW52b2NhdGlvbixcbiAgICAgICAgICAgIEVKU09OLmNsb25lKGFyZ3MpLFxuICAgICAgICAgICAgXCJpbnRlcm5hbCBjYWxsIHRvICdcIiArIG5hbWUgKyBcIidcIlxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIHJlamVjdChlKTtcbiAgICAgIH1cbiAgICAgIGlmICghTWV0ZW9yLl9pc1Byb21pc2UocmVzdWx0KSkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShyZXN1bHQpO1xuICAgICAgfVxuICAgICAgcmVzdWx0LnRoZW4ociA9PiByZXNvbHZlKHIpKS5jYXRjaChyZWplY3QpO1xuICAgIH0pLnRoZW4oRUpTT04uY2xvbmUpO1xuICB9LFxuXG4gIF91cmxGb3JTZXNzaW9uOiBmdW5jdGlvbiAoc2Vzc2lvbklkKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBzZXNzaW9uID0gc2VsZi5zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcbiAgICBpZiAoc2Vzc2lvbilcbiAgICAgIHJldHVybiBzZXNzaW9uLl9zb2NrZXRVcmw7XG4gICAgZWxzZVxuICAgICAgcmV0dXJuIG51bGw7XG4gIH1cbn0pO1xuXG52YXIgY2FsY3VsYXRlVmVyc2lvbiA9IGZ1bmN0aW9uIChjbGllbnRTdXBwb3J0ZWRWZXJzaW9ucyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlcnZlclN1cHBvcnRlZFZlcnNpb25zKSB7XG4gIHZhciBjb3JyZWN0VmVyc2lvbiA9IGNsaWVudFN1cHBvcnRlZFZlcnNpb25zLmZpbmQoZnVuY3Rpb24gKHZlcnNpb24pIHtcbiAgICByZXR1cm4gc2VydmVyU3VwcG9ydGVkVmVyc2lvbnMuaW5jbHVkZXModmVyc2lvbik7XG4gIH0pO1xuICBpZiAoIWNvcnJlY3RWZXJzaW9uKSB7XG4gICAgY29ycmVjdFZlcnNpb24gPSBzZXJ2ZXJTdXBwb3J0ZWRWZXJzaW9uc1swXTtcbiAgfVxuICByZXR1cm4gY29ycmVjdFZlcnNpb247XG59O1xuXG5ERFBTZXJ2ZXIuX2NhbGN1bGF0ZVZlcnNpb24gPSBjYWxjdWxhdGVWZXJzaW9uO1xuXG5cbi8vIFwiYmxpbmRcIiBleGNlcHRpb25zIG90aGVyIHRoYW4gdGhvc2UgdGhhdCB3ZXJlIGRlbGliZXJhdGVseSB0aHJvd24gdG8gc2lnbmFsXG4vLyBlcnJvcnMgdG8gdGhlIGNsaWVudFxudmFyIHdyYXBJbnRlcm5hbEV4Y2VwdGlvbiA9IGZ1bmN0aW9uIChleGNlcHRpb24sIGNvbnRleHQpIHtcbiAgaWYgKCFleGNlcHRpb24pIHJldHVybiBleGNlcHRpb247XG5cbiAgLy8gVG8gYWxsb3cgcGFja2FnZXMgdG8gdGhyb3cgZXJyb3JzIGludGVuZGVkIGZvciB0aGUgY2xpZW50IGJ1dCBub3QgaGF2ZSB0b1xuICAvLyBkZXBlbmQgb24gdGhlIE1ldGVvci5FcnJvciBjbGFzcywgYGlzQ2xpZW50U2FmZWAgY2FuIGJlIHNldCB0byB0cnVlIG9uIGFueVxuICAvLyBlcnJvciBiZWZvcmUgaXQgaXMgdGhyb3duLlxuICBpZiAoZXhjZXB0aW9uLmlzQ2xpZW50U2FmZSkge1xuICAgIGlmICghKGV4Y2VwdGlvbiBpbnN0YW5jZW9mIE1ldGVvci5FcnJvcikpIHtcbiAgICAgIGNvbnN0IG9yaWdpbmFsTWVzc2FnZSA9IGV4Y2VwdGlvbi5tZXNzYWdlO1xuICAgICAgZXhjZXB0aW9uID0gbmV3IE1ldGVvci5FcnJvcihleGNlcHRpb24uZXJyb3IsIGV4Y2VwdGlvbi5yZWFzb24sIGV4Y2VwdGlvbi5kZXRhaWxzKTtcbiAgICAgIGV4Y2VwdGlvbi5tZXNzYWdlID0gb3JpZ2luYWxNZXNzYWdlO1xuICAgIH1cbiAgICByZXR1cm4gZXhjZXB0aW9uO1xuICB9XG5cbiAgLy8gVGVzdHMgY2FuIHNldCB0aGUgJ19leHBlY3RlZEJ5VGVzdCcgZmxhZyBvbiBhbiBleGNlcHRpb24gc28gaXQgd29uJ3QgZ28gdG9cbiAgLy8gdGhlIHNlcnZlciBsb2cuXG4gIGlmICghZXhjZXB0aW9uLl9leHBlY3RlZEJ5VGVzdCkge1xuICAgIE1ldGVvci5fZGVidWcoXCJFeGNlcHRpb24gXCIgKyBjb250ZXh0LCBleGNlcHRpb24uc3RhY2spO1xuICAgIGlmIChleGNlcHRpb24uc2FuaXRpemVkRXJyb3IpIHtcbiAgICAgIE1ldGVvci5fZGVidWcoXCJTYW5pdGl6ZWQgYW5kIHJlcG9ydGVkIHRvIHRoZSBjbGllbnQgYXM6XCIsIGV4Y2VwdGlvbi5zYW5pdGl6ZWRFcnJvcik7XG4gICAgICBNZXRlb3IuX2RlYnVnKCk7XG4gICAgfVxuICB9XG5cbiAgLy8gRGlkIHRoZSBlcnJvciBjb250YWluIG1vcmUgZGV0YWlscyB0aGF0IGNvdWxkIGhhdmUgYmVlbiB1c2VmdWwgaWYgY2F1Z2h0IGluXG4gIC8vIHNlcnZlciBjb2RlIChvciBpZiB0aHJvd24gZnJvbSBub24tY2xpZW50LW9yaWdpbmF0ZWQgY29kZSksIGJ1dCBhbHNvXG4gIC8vIHByb3ZpZGVkIGEgXCJzYW5pdGl6ZWRcIiB2ZXJzaW9uIHdpdGggbW9yZSBjb250ZXh0IHRoYW4gNTAwIEludGVybmFsIHNlcnZlciBlcnJvcj8gVXNlIHRoYXQuXG4gIGlmIChleGNlcHRpb24uc2FuaXRpemVkRXJyb3IpIHtcbiAgICBpZiAoZXhjZXB0aW9uLnNhbml0aXplZEVycm9yLmlzQ2xpZW50U2FmZSlcbiAgICAgIHJldHVybiBleGNlcHRpb24uc2FuaXRpemVkRXJyb3I7XG4gICAgTWV0ZW9yLl9kZWJ1ZyhcIkV4Y2VwdGlvbiBcIiArIGNvbnRleHQgKyBcIiBwcm92aWRlcyBhIHNhbml0aXplZEVycm9yIHRoYXQgXCIgK1xuICAgICAgICAgICAgICAgICAgXCJkb2VzIG5vdCBoYXZlIGlzQ2xpZW50U2FmZSBwcm9wZXJ0eSBzZXQ7IGlnbm9yaW5nXCIpO1xuICB9XG5cbiAgcmV0dXJuIG5ldyBNZXRlb3IuRXJyb3IoNTAwLCBcIkludGVybmFsIHNlcnZlciBlcnJvclwiKTtcbn07XG5cblxuLy8gQXVkaXQgYXJndW1lbnQgY2hlY2tzLCBpZiB0aGUgYXVkaXQtYXJndW1lbnQtY2hlY2tzIHBhY2thZ2UgZXhpc3RzIChpdCBpcyBhXG4vLyB3ZWFrIGRlcGVuZGVuY3kgb2YgdGhpcyBwYWNrYWdlKS5cbnZhciBtYXliZUF1ZGl0QXJndW1lbnRDaGVja3MgPSBmdW5jdGlvbiAoZiwgY29udGV4dCwgYXJncywgZGVzY3JpcHRpb24pIHtcbiAgYXJncyA9IGFyZ3MgfHwgW107XG4gIGlmIChQYWNrYWdlWydhdWRpdC1hcmd1bWVudC1jaGVja3MnXSkge1xuICAgIHJldHVybiBNYXRjaC5fZmFpbElmQXJndW1lbnRzQXJlTm90QWxsQ2hlY2tlZChcbiAgICAgIGYsIGNvbnRleHQsIGFyZ3MsIGRlc2NyaXB0aW9uKTtcbiAgfVxuICByZXR1cm4gZi5hcHBseShjb250ZXh0LCBhcmdzKTtcbn07IiwiRERQU2VydmVyLl9Xcml0ZUZlbmNlID0gY2xhc3Mge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLmFybWVkID0gZmFsc2U7XG4gICAgdGhpcy5maXJlZCA9IGZhbHNlO1xuICAgIHRoaXMucmV0aXJlZCA9IGZhbHNlO1xuICAgIHRoaXMub3V0c3RhbmRpbmdfd3JpdGVzID0gMDtcbiAgICB0aGlzLmJlZm9yZV9maXJlX2NhbGxiYWNrcyA9IFtdO1xuICAgIHRoaXMuY29tcGxldGlvbl9jYWxsYmFja3MgPSBbXTtcbiAgfVxuXG4gIGJlZ2luV3JpdGUoKSB7XG4gICAgaWYgKHRoaXMucmV0aXJlZCkge1xuICAgICAgcmV0dXJuIHsgY29tbWl0dGVkOiAoKSA9PiB7fSB9O1xuICAgIH1cblxuICAgIGlmICh0aGlzLmZpcmVkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJmZW5jZSBoYXMgYWxyZWFkeSBhY3RpdmF0ZWQgLS0gdG9vIGxhdGUgdG8gYWRkIHdyaXRlc1wiKTtcbiAgICB9XG5cbiAgICB0aGlzLm91dHN0YW5kaW5nX3dyaXRlcysrO1xuICAgIGxldCBjb21taXR0ZWQgPSBmYWxzZTtcblxuICAgIHJldHVybiB7XG4gICAgICBjb21taXR0ZWQ6IGFzeW5jICgpID0+IHtcbiAgICAgICAgaWYgKGNvbW1pdHRlZCkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImNvbW1pdHRlZCBjYWxsZWQgdHdpY2Ugb24gdGhlIHNhbWUgd3JpdGVcIik7XG4gICAgICAgIH1cbiAgICAgICAgY29tbWl0dGVkID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5vdXRzdGFuZGluZ193cml0ZXMtLTtcbiAgICAgICAgYXdhaXQgdGhpcy5fbWF5YmVGaXJlKCk7XG4gICAgICB9XG4gICAgfTtcbiAgfVxuXG4gIGFybSgpIHtcbiAgICBpZiAodGhpcyA9PT0gRERQU2VydmVyLl9nZXRDdXJyZW50RmVuY2UoKSkge1xuICAgICAgdGhyb3cgRXJyb3IoXCJDYW4ndCBhcm0gdGhlIGN1cnJlbnQgZmVuY2VcIik7XG4gICAgfVxuICAgIHRoaXMuYXJtZWQgPSB0cnVlO1xuICAgIHJldHVybiB0aGlzLl9tYXliZUZpcmUoKTtcbiAgfVxuXG4gIG9uQmVmb3JlRmlyZShmdW5jKSB7XG4gICAgaWYgKHRoaXMuZmlyZWQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcImZlbmNlIGhhcyBhbHJlYWR5IGFjdGl2YXRlZCAtLSB0b28gbGF0ZSB0byBhZGQgYSBjYWxsYmFja1wiKTtcbiAgICB9XG4gICAgdGhpcy5iZWZvcmVfZmlyZV9jYWxsYmFja3MucHVzaChmdW5jKTtcbiAgfVxuXG4gIG9uQWxsQ29tbWl0dGVkKGZ1bmMpIHtcbiAgICBpZiAodGhpcy5maXJlZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiZmVuY2UgaGFzIGFscmVhZHkgYWN0aXZhdGVkIC0tIHRvbyBsYXRlIHRvIGFkZCBhIGNhbGxiYWNrXCIpO1xuICAgIH1cbiAgICB0aGlzLmNvbXBsZXRpb25fY2FsbGJhY2tzLnB1c2goZnVuYyk7XG4gIH1cblxuICBhc3luYyBfYXJtQW5kV2FpdCgpIHtcbiAgICBsZXQgcmVzb2x2ZXI7XG4gICAgY29uc3QgcmV0dXJuVmFsdWUgPSBuZXcgUHJvbWlzZShyID0+IHJlc29sdmVyID0gcik7XG4gICAgdGhpcy5vbkFsbENvbW1pdHRlZChyZXNvbHZlcik7XG4gICAgYXdhaXQgdGhpcy5hcm0oKTtcbiAgICByZXR1cm4gcmV0dXJuVmFsdWU7XG4gIH1cblxuICBhcm1BbmRXYWl0KCkge1xuICAgIHJldHVybiB0aGlzLl9hcm1BbmRXYWl0KCk7XG4gIH1cblxuICBhc3luYyBfbWF5YmVGaXJlKCkge1xuICAgIGlmICh0aGlzLmZpcmVkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJ3cml0ZSBmZW5jZSBhbHJlYWR5IGFjdGl2YXRlZD9cIik7XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLmFybWVkIHx8IHRoaXMub3V0c3RhbmRpbmdfd3JpdGVzID4gMCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGludm9rZUNhbGxiYWNrID0gYXN5bmMgKGZ1bmMpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGZ1bmModGhpcyk7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgTWV0ZW9yLl9kZWJ1ZyhcImV4Y2VwdGlvbiBpbiB3cml0ZSBmZW5jZSBjYWxsYmFjazpcIiwgZXJyKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgdGhpcy5vdXRzdGFuZGluZ193cml0ZXMrKztcblxuICAgIC8vIFByb2Nlc3MgYWxsIGJlZm9yZV9maXJlIGNhbGxiYWNrcyBpbiBwYXJhbGxlbFxuICAgIGNvbnN0IGJlZm9yZUNhbGxiYWNrcyA9IFsuLi50aGlzLmJlZm9yZV9maXJlX2NhbGxiYWNrc107XG4gICAgdGhpcy5iZWZvcmVfZmlyZV9jYWxsYmFja3MgPSBbXTtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChiZWZvcmVDYWxsYmFja3MubWFwKGNiID0+IGludm9rZUNhbGxiYWNrKGNiKSkpO1xuXG4gICAgdGhpcy5vdXRzdGFuZGluZ193cml0ZXMtLTtcblxuICAgIGlmICh0aGlzLm91dHN0YW5kaW5nX3dyaXRlcyA9PT0gMCkge1xuICAgICAgdGhpcy5maXJlZCA9IHRydWU7XG4gICAgICAvLyBQcm9jZXNzIGFsbCBjb21wbGV0aW9uIGNhbGxiYWNrcyBpbiBwYXJhbGxlbFxuICAgICAgY29uc3QgY2FsbGJhY2tzID0gWy4uLnRoaXMuY29tcGxldGlvbl9jYWxsYmFja3NdO1xuICAgICAgdGhpcy5jb21wbGV0aW9uX2NhbGxiYWNrcyA9IFtdO1xuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoY2FsbGJhY2tzLm1hcChjYiA9PiBpbnZva2VDYWxsYmFjayhjYikpKTtcbiAgICB9XG4gIH1cblxuICByZXRpcmUoKSB7XG4gICAgaWYgKCF0aGlzLmZpcmVkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCByZXRpcmUgYSBmZW5jZSB0aGF0IGhhc24ndCBmaXJlZC5cIik7XG4gICAgfVxuICAgIHRoaXMucmV0aXJlZCA9IHRydWU7XG4gIH1cbn07XG5cbkREUFNlcnZlci5fQ3VycmVudFdyaXRlRmVuY2UgPSBuZXcgTWV0ZW9yLkVudmlyb25tZW50VmFyaWFibGU7IiwiLy8gQSBcImNyb3NzYmFyXCIgaXMgYSBjbGFzcyB0aGF0IHByb3ZpZGVzIHN0cnVjdHVyZWQgbm90aWZpY2F0aW9uIHJlZ2lzdHJhdGlvbi5cbi8vIFNlZSBfbWF0Y2ggZm9yIHRoZSBkZWZpbml0aW9uIG9mIGhvdyBhIG5vdGlmaWNhdGlvbiBtYXRjaGVzIGEgdHJpZ2dlci5cbi8vIEFsbCBub3RpZmljYXRpb25zIGFuZCB0cmlnZ2VycyBtdXN0IGhhdmUgYSBzdHJpbmcga2V5IG5hbWVkICdjb2xsZWN0aW9uJy5cblxuRERQU2VydmVyLl9Dcm9zc2JhciA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgc2VsZi5uZXh0SWQgPSAxO1xuICAvLyBtYXAgZnJvbSBjb2xsZWN0aW9uIG5hbWUgKHN0cmluZykgLT4gbGlzdGVuZXIgaWQgLT4gb2JqZWN0LiBlYWNoIG9iamVjdCBoYXNcbiAgLy8ga2V5cyAndHJpZ2dlcicsICdjYWxsYmFjaycuICBBcyBhIGhhY2ssIHRoZSBlbXB0eSBzdHJpbmcgbWVhbnMgXCJub1xuICAvLyBjb2xsZWN0aW9uXCIuXG4gIHNlbGYubGlzdGVuZXJzQnlDb2xsZWN0aW9uID0ge307XG4gIHNlbGYubGlzdGVuZXJzQnlDb2xsZWN0aW9uQ291bnQgPSB7fTtcbiAgc2VsZi5mYWN0UGFja2FnZSA9IG9wdGlvbnMuZmFjdFBhY2thZ2UgfHwgXCJsaXZlZGF0YVwiO1xuICBzZWxmLmZhY3ROYW1lID0gb3B0aW9ucy5mYWN0TmFtZSB8fCBudWxsO1xufTtcblxuT2JqZWN0LmFzc2lnbihERFBTZXJ2ZXIuX0Nyb3NzYmFyLnByb3RvdHlwZSwge1xuICAvLyBtc2cgaXMgYSB0cmlnZ2VyIG9yIGEgbm90aWZpY2F0aW9uXG4gIF9jb2xsZWN0aW9uRm9yTWVzc2FnZTogZnVuY3Rpb24gKG1zZykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoISgnY29sbGVjdGlvbicgaW4gbXNnKSkge1xuICAgICAgcmV0dXJuICcnO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mKG1zZy5jb2xsZWN0aW9uKSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGlmIChtc2cuY29sbGVjdGlvbiA9PT0gJycpXG4gICAgICAgIHRocm93IEVycm9yKFwiTWVzc2FnZSBoYXMgZW1wdHkgY29sbGVjdGlvbiFcIik7XG4gICAgICByZXR1cm4gbXNnLmNvbGxlY3Rpb247XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IEVycm9yKFwiTWVzc2FnZSBoYXMgbm9uLXN0cmluZyBjb2xsZWN0aW9uIVwiKTtcbiAgICB9XG4gIH0sXG5cbiAgLy8gTGlzdGVuIGZvciBub3RpZmljYXRpb24gdGhhdCBtYXRjaCAndHJpZ2dlcicuIEEgbm90aWZpY2F0aW9uXG4gIC8vIG1hdGNoZXMgaWYgaXQgaGFzIHRoZSBrZXktdmFsdWUgcGFpcnMgaW4gdHJpZ2dlciBhcyBhXG4gIC8vIHN1YnNldC4gV2hlbiBhIG5vdGlmaWNhdGlvbiBtYXRjaGVzLCBjYWxsICdjYWxsYmFjaycsIHBhc3NpbmdcbiAgLy8gdGhlIGFjdHVhbCBub3RpZmljYXRpb24uXG4gIC8vXG4gIC8vIFJldHVybnMgYSBsaXN0ZW4gaGFuZGxlLCB3aGljaCBpcyBhbiBvYmplY3Qgd2l0aCBhIG1ldGhvZFxuICAvLyBzdG9wKCkuIENhbGwgc3RvcCgpIHRvIHN0b3AgbGlzdGVuaW5nLlxuICAvL1xuICAvLyBYWFggSXQgc2hvdWxkIGJlIGxlZ2FsIHRvIGNhbGwgZmlyZSgpIGZyb20gaW5zaWRlIGEgbGlzdGVuKClcbiAgLy8gY2FsbGJhY2s/XG4gIGxpc3RlbjogZnVuY3Rpb24gKHRyaWdnZXIsIGNhbGxiYWNrKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBpZCA9IHNlbGYubmV4dElkKys7XG5cbiAgICB2YXIgY29sbGVjdGlvbiA9IHNlbGYuX2NvbGxlY3Rpb25Gb3JNZXNzYWdlKHRyaWdnZXIpO1xuICAgIHZhciByZWNvcmQgPSB7dHJpZ2dlcjogRUpTT04uY2xvbmUodHJpZ2dlciksIGNhbGxiYWNrOiBjYWxsYmFja307XG4gICAgaWYgKCEgKGNvbGxlY3Rpb24gaW4gc2VsZi5saXN0ZW5lcnNCeUNvbGxlY3Rpb24pKSB7XG4gICAgICBzZWxmLmxpc3RlbmVyc0J5Q29sbGVjdGlvbltjb2xsZWN0aW9uXSA9IHt9O1xuICAgICAgc2VsZi5saXN0ZW5lcnNCeUNvbGxlY3Rpb25Db3VudFtjb2xsZWN0aW9uXSA9IDA7XG4gICAgfVxuICAgIHNlbGYubGlzdGVuZXJzQnlDb2xsZWN0aW9uW2NvbGxlY3Rpb25dW2lkXSA9IHJlY29yZDtcbiAgICBzZWxmLmxpc3RlbmVyc0J5Q29sbGVjdGlvbkNvdW50W2NvbGxlY3Rpb25dKys7XG5cbiAgICBpZiAoc2VsZi5mYWN0TmFtZSAmJiBQYWNrYWdlWydmYWN0cy1iYXNlJ10pIHtcbiAgICAgIFBhY2thZ2VbJ2ZhY3RzLWJhc2UnXS5GYWN0cy5pbmNyZW1lbnRTZXJ2ZXJGYWN0KFxuICAgICAgICBzZWxmLmZhY3RQYWNrYWdlLCBzZWxmLmZhY3ROYW1lLCAxKTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RvcDogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoc2VsZi5mYWN0TmFtZSAmJiBQYWNrYWdlWydmYWN0cy1iYXNlJ10pIHtcbiAgICAgICAgICBQYWNrYWdlWydmYWN0cy1iYXNlJ10uRmFjdHMuaW5jcmVtZW50U2VydmVyRmFjdChcbiAgICAgICAgICAgIHNlbGYuZmFjdFBhY2thZ2UsIHNlbGYuZmFjdE5hbWUsIC0xKTtcbiAgICAgICAgfVxuICAgICAgICBkZWxldGUgc2VsZi5saXN0ZW5lcnNCeUNvbGxlY3Rpb25bY29sbGVjdGlvbl1baWRdO1xuICAgICAgICBzZWxmLmxpc3RlbmVyc0J5Q29sbGVjdGlvbkNvdW50W2NvbGxlY3Rpb25dLS07XG4gICAgICAgIGlmIChzZWxmLmxpc3RlbmVyc0J5Q29sbGVjdGlvbkNvdW50W2NvbGxlY3Rpb25dID09PSAwKSB7XG4gICAgICAgICAgZGVsZXRlIHNlbGYubGlzdGVuZXJzQnlDb2xsZWN0aW9uW2NvbGxlY3Rpb25dO1xuICAgICAgICAgIGRlbGV0ZSBzZWxmLmxpc3RlbmVyc0J5Q29sbGVjdGlvbkNvdW50W2NvbGxlY3Rpb25dO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcbiAgfSxcblxuICAvLyBGaXJlIHRoZSBwcm92aWRlZCAnbm90aWZpY2F0aW9uJyAoYW4gb2JqZWN0IHdob3NlIGF0dHJpYnV0ZVxuICAvLyB2YWx1ZXMgYXJlIGFsbCBKU09OLWNvbXBhdGliaWxlKSAtLSBpbmZvcm0gYWxsIG1hdGNoaW5nIGxpc3RlbmVyc1xuICAvLyAocmVnaXN0ZXJlZCB3aXRoIGxpc3RlbigpKS5cbiAgLy9cbiAgLy8gSWYgZmlyZSgpIGlzIGNhbGxlZCBpbnNpZGUgYSB3cml0ZSBmZW5jZSwgdGhlbiBlYWNoIG9mIHRoZVxuICAvLyBsaXN0ZW5lciBjYWxsYmFja3Mgd2lsbCBiZSBjYWxsZWQgaW5zaWRlIHRoZSB3cml0ZSBmZW5jZSBhcyB3ZWxsLlxuICAvL1xuICAvLyBUaGUgbGlzdGVuZXJzIG1heSBiZSBpbnZva2VkIGluIHBhcmFsbGVsLCByYXRoZXIgdGhhbiBzZXJpYWxseS5cbiAgZmlyZTogYXN5bmMgZnVuY3Rpb24gKG5vdGlmaWNhdGlvbikge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIHZhciBjb2xsZWN0aW9uID0gc2VsZi5fY29sbGVjdGlvbkZvck1lc3NhZ2Uobm90aWZpY2F0aW9uKTtcblxuICAgIGlmICghKGNvbGxlY3Rpb24gaW4gc2VsZi5saXN0ZW5lcnNCeUNvbGxlY3Rpb24pKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIGxpc3RlbmVyc0ZvckNvbGxlY3Rpb24gPSBzZWxmLmxpc3RlbmVyc0J5Q29sbGVjdGlvbltjb2xsZWN0aW9uXTtcbiAgICB2YXIgY2FsbGJhY2tJZHMgPSBbXTtcbiAgICBPYmplY3QuZW50cmllcyhsaXN0ZW5lcnNGb3JDb2xsZWN0aW9uKS5mb3JFYWNoKGZ1bmN0aW9uIChbaWQsIGxdKSB7XG4gICAgICBpZiAoc2VsZi5fbWF0Y2hlcyhub3RpZmljYXRpb24sIGwudHJpZ2dlcikpIHtcbiAgICAgICAgY2FsbGJhY2tJZHMucHVzaChpZCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBMaXN0ZW5lciBjYWxsYmFja3MgY2FuIHlpZWxkLCBzbyB3ZSBuZWVkIHRvIGZpcnN0IGZpbmQgYWxsIHRoZSBvbmVzIHRoYXRcbiAgICAvLyBtYXRjaCBpbiBhIHNpbmdsZSBpdGVyYXRpb24gb3ZlciBzZWxmLmxpc3RlbmVyc0J5Q29sbGVjdGlvbiAod2hpY2ggY2FuJ3RcbiAgICAvLyBiZSBtdXRhdGVkIGR1cmluZyB0aGlzIGl0ZXJhdGlvbiksIGFuZCB0aGVuIGludm9rZSB0aGUgbWF0Y2hpbmdcbiAgICAvLyBjYWxsYmFja3MsIGNoZWNraW5nIGJlZm9yZSBlYWNoIGNhbGwgdG8gZW5zdXJlIHRoZXkgaGF2ZW4ndCBzdG9wcGVkLlxuICAgIC8vIE5vdGUgdGhhdCB3ZSBkb24ndCBoYXZlIHRvIGNoZWNrIHRoYXRcbiAgICAvLyBzZWxmLmxpc3RlbmVyc0J5Q29sbGVjdGlvbltjb2xsZWN0aW9uXSBzdGlsbCA9PT0gbGlzdGVuZXJzRm9yQ29sbGVjdGlvbixcbiAgICAvLyBiZWNhdXNlIHRoZSBvbmx5IHdheSB0aGF0IHN0b3BzIGJlaW5nIHRydWUgaXMgaWYgbGlzdGVuZXJzRm9yQ29sbGVjdGlvblxuICAgIC8vIGZpcnN0IGdldHMgcmVkdWNlZCBkb3duIHRvIHRoZSBlbXB0eSBvYmplY3QgKGFuZCB0aGVuIG5ldmVyIGdldHNcbiAgICAvLyBpbmNyZWFzZWQgYWdhaW4pLlxuICAgIGZvciAoY29uc3QgaWQgb2YgY2FsbGJhY2tJZHMpIHtcbiAgICAgIGlmIChpZCBpbiBsaXN0ZW5lcnNGb3JDb2xsZWN0aW9uKSB7XG4gICAgICAgIGF3YWl0IGxpc3RlbmVyc0ZvckNvbGxlY3Rpb25baWRdLmNhbGxiYWNrKG5vdGlmaWNhdGlvbik7XG4gICAgICB9XG4gICAgfVxuICB9LFxuXG4gIC8vIEEgbm90aWZpY2F0aW9uIG1hdGNoZXMgYSB0cmlnZ2VyIGlmIGFsbCBrZXlzIHRoYXQgZXhpc3QgaW4gYm90aCBhcmUgZXF1YWwuXG4gIC8vXG4gIC8vIEV4YW1wbGVzOlxuICAvLyAgTjp7Y29sbGVjdGlvbjogXCJDXCJ9IG1hdGNoZXMgVDp7Y29sbGVjdGlvbjogXCJDXCJ9XG4gIC8vICAgIChhIG5vbi10YXJnZXRlZCB3cml0ZSB0byBhIGNvbGxlY3Rpb24gbWF0Y2hlcyBhXG4gIC8vICAgICBub24tdGFyZ2V0ZWQgcXVlcnkpXG4gIC8vICBOOntjb2xsZWN0aW9uOiBcIkNcIiwgaWQ6IFwiWFwifSBtYXRjaGVzIFQ6e2NvbGxlY3Rpb246IFwiQ1wifVxuICAvLyAgICAoYSB0YXJnZXRlZCB3cml0ZSB0byBhIGNvbGxlY3Rpb24gbWF0Y2hlcyBhIG5vbi10YXJnZXRlZCBxdWVyeSlcbiAgLy8gIE46e2NvbGxlY3Rpb246IFwiQ1wifSBtYXRjaGVzIFQ6e2NvbGxlY3Rpb246IFwiQ1wiLCBpZDogXCJYXCJ9XG4gIC8vICAgIChhIG5vbi10YXJnZXRlZCB3cml0ZSB0byBhIGNvbGxlY3Rpb24gbWF0Y2hlcyBhXG4gIC8vICAgICB0YXJnZXRlZCBxdWVyeSlcbiAgLy8gIE46e2NvbGxlY3Rpb246IFwiQ1wiLCBpZDogXCJYXCJ9IG1hdGNoZXMgVDp7Y29sbGVjdGlvbjogXCJDXCIsIGlkOiBcIlhcIn1cbiAgLy8gICAgKGEgdGFyZ2V0ZWQgd3JpdGUgdG8gYSBjb2xsZWN0aW9uIG1hdGNoZXMgYSB0YXJnZXRlZCBxdWVyeSB0YXJnZXRlZFxuICAvLyAgICAgYXQgdGhlIHNhbWUgZG9jdW1lbnQpXG4gIC8vICBOOntjb2xsZWN0aW9uOiBcIkNcIiwgaWQ6IFwiWFwifSBkb2VzIG5vdCBtYXRjaCBUOntjb2xsZWN0aW9uOiBcIkNcIiwgaWQ6IFwiWVwifVxuICAvLyAgICAoYSB0YXJnZXRlZCB3cml0ZSB0byBhIGNvbGxlY3Rpb24gZG9lcyBub3QgbWF0Y2ggYSB0YXJnZXRlZCBxdWVyeVxuICAvLyAgICAgdGFyZ2V0ZWQgYXQgYSBkaWZmZXJlbnQgZG9jdW1lbnQpXG4gIF9tYXRjaGVzOiBmdW5jdGlvbiAobm90aWZpY2F0aW9uLCB0cmlnZ2VyKSB7XG4gICAgLy8gTW9zdCBub3RpZmljYXRpb25zIHRoYXQgdXNlIHRoZSBjcm9zc2JhciBoYXZlIGEgc3RyaW5nIGBjb2xsZWN0aW9uYCBhbmRcbiAgICAvLyBtYXliZSBhbiBgaWRgIHRoYXQgaXMgYSBzdHJpbmcgb3IgT2JqZWN0SUQuIFdlJ3JlIGFscmVhZHkgZGl2aWRpbmcgdXBcbiAgICAvLyB0cmlnZ2VycyBieSBjb2xsZWN0aW9uLCBidXQgbGV0J3MgZmFzdC10cmFjayBcIm5vcGUsIGRpZmZlcmVudCBJRFwiIChhbmRcbiAgICAvLyBhdm9pZCB0aGUgb3Zlcmx5IGdlbmVyaWMgRUpTT04uZXF1YWxzKS4gVGhpcyBtYWtlcyBhIG5vdGljZWFibGVcbiAgICAvLyBwZXJmb3JtYW5jZSBkaWZmZXJlbmNlOyBzZWUgaHR0cHM6Ly9naXRodWIuY29tL21ldGVvci9tZXRlb3IvcHVsbC8zNjk3XG4gICAgaWYgKHR5cGVvZihub3RpZmljYXRpb24uaWQpID09PSAnc3RyaW5nJyAmJlxuICAgICAgICB0eXBlb2YodHJpZ2dlci5pZCkgPT09ICdzdHJpbmcnICYmXG4gICAgICAgIG5vdGlmaWNhdGlvbi5pZCAhPT0gdHJpZ2dlci5pZCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAobm90aWZpY2F0aW9uLmlkIGluc3RhbmNlb2YgTW9uZ29JRC5PYmplY3RJRCAmJlxuICAgICAgICB0cmlnZ2VyLmlkIGluc3RhbmNlb2YgTW9uZ29JRC5PYmplY3RJRCAmJlxuICAgICAgICAhIG5vdGlmaWNhdGlvbi5pZC5lcXVhbHModHJpZ2dlci5pZCkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4gT2JqZWN0LmtleXModHJpZ2dlcikuZXZlcnkoZnVuY3Rpb24gKGtleSkge1xuICAgICAgcmV0dXJuICEoa2V5IGluIG5vdGlmaWNhdGlvbikgfHwgRUpTT04uZXF1YWxzKHRyaWdnZXJba2V5XSwgbm90aWZpY2F0aW9uW2tleV0pO1xuICAgICB9KTtcbiAgfVxufSk7XG5cbi8vIFRoZSBcImludmFsaWRhdGlvbiBjcm9zc2JhclwiIGlzIGEgc3BlY2lmaWMgaW5zdGFuY2UgdXNlZCBieSB0aGUgRERQIHNlcnZlciB0b1xuLy8gaW1wbGVtZW50IHdyaXRlIGZlbmNlIG5vdGlmaWNhdGlvbnMuIExpc3RlbmVyIGNhbGxiYWNrcyBvbiB0aGlzIGNyb3NzYmFyXG4vLyBzaG91bGQgY2FsbCBiZWdpbldyaXRlIG9uIHRoZSBjdXJyZW50IHdyaXRlIGZlbmNlIGJlZm9yZSB0aGV5IHJldHVybiwgaWYgdGhleVxuLy8gd2FudCB0byBkZWxheSB0aGUgd3JpdGUgZmVuY2UgZnJvbSBmaXJpbmcgKGllLCB0aGUgRERQIG1ldGhvZC1kYXRhLXVwZGF0ZWRcbi8vIG1lc3NhZ2UgZnJvbSBiZWluZyBzZW50KS5cbkREUFNlcnZlci5fSW52YWxpZGF0aW9uQ3Jvc3NiYXIgPSBuZXcgRERQU2VydmVyLl9Dcm9zc2Jhcih7XG4gIGZhY3ROYW1lOiBcImludmFsaWRhdGlvbi1jcm9zc2Jhci1saXN0ZW5lcnNcIlxufSk7IiwiaWYgKHByb2Nlc3MuZW52LkREUF9ERUZBVUxUX0NPTk5FQ1RJT05fVVJMKSB7XG4gIF9fbWV0ZW9yX3J1bnRpbWVfY29uZmlnX18uRERQX0RFRkFVTFRfQ09OTkVDVElPTl9VUkwgPVxuICAgIHByb2Nlc3MuZW52LkREUF9ERUZBVUxUX0NPTk5FQ1RJT05fVVJMO1xufVxuXG5NZXRlb3Iuc2VydmVyID0gbmV3IFNlcnZlcigpO1xuXG5NZXRlb3IucmVmcmVzaCA9IGFzeW5jIGZ1bmN0aW9uIChub3RpZmljYXRpb24pIHtcbiAgYXdhaXQgRERQU2VydmVyLl9JbnZhbGlkYXRpb25Dcm9zc2Jhci5maXJlKG5vdGlmaWNhdGlvbik7XG59O1xuXG4vLyBQcm94eSB0aGUgcHVibGljIG1ldGhvZHMgb2YgTWV0ZW9yLnNlcnZlciBzbyB0aGV5IGNhblxuLy8gYmUgY2FsbGVkIGRpcmVjdGx5IG9uIE1ldGVvci5cblxuICBbXG4gICAgJ3B1Ymxpc2gnLFxuICAgICdpc0FzeW5jQ2FsbCcsXG4gICAgJ21ldGhvZHMnLFxuICAgICdjYWxsJyxcbiAgICAnY2FsbEFzeW5jJyxcbiAgICAnYXBwbHknLFxuICAgICdhcHBseUFzeW5jJyxcbiAgICAnb25Db25uZWN0aW9uJyxcbiAgICAnb25NZXNzYWdlJyxcbiAgXS5mb3JFYWNoKFxuICBmdW5jdGlvbihuYW1lKSB7XG4gICAgTWV0ZW9yW25hbWVdID0gTWV0ZW9yLnNlcnZlcltuYW1lXS5iaW5kKE1ldGVvci5zZXJ2ZXIpO1xuICB9XG4pO1xuIiwiaW50ZXJmYWNlIENoYW5nZUNvbGxlY3RvciB7XG4gIFtrZXk6IHN0cmluZ106IGFueTtcbn1cblxuaW50ZXJmYWNlIERhdGFFbnRyeSB7XG4gIHN1YnNjcmlwdGlvbkhhbmRsZTogc3RyaW5nO1xuICB2YWx1ZTogYW55O1xufVxuXG5leHBvcnQgY2xhc3MgRHVtbXlEb2N1bWVudFZpZXcge1xuICBwcml2YXRlIGV4aXN0c0luOiBTZXQ8c3RyaW5nPjtcbiAgcHJpdmF0ZSBkYXRhQnlLZXk6IE1hcDxzdHJpbmcsIERhdGFFbnRyeVtdPjtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLmV4aXN0c0luID0gbmV3IFNldDxzdHJpbmc+KCk7IC8vIHNldCBvZiBzdWJzY3JpcHRpb25IYW5kbGVcbiAgICB0aGlzLmRhdGFCeUtleSA9IG5ldyBNYXA8c3RyaW5nLCBEYXRhRW50cnlbXT4oKTsgLy8ga2V5LT4gWyB7c3Vic2NyaXB0aW9uSGFuZGxlLCB2YWx1ZX0gYnkgcHJlY2VkZW5jZV1cbiAgfVxuXG4gIGdldEZpZWxkcygpOiBSZWNvcmQ8c3RyaW5nLCBuZXZlcj4ge1xuICAgIHJldHVybiB7fTtcbiAgfVxuXG4gIGNsZWFyRmllbGQoXG4gICAgc3Vic2NyaXB0aW9uSGFuZGxlOiBzdHJpbmcsIFxuICAgIGtleTogc3RyaW5nLCBcbiAgICBjaGFuZ2VDb2xsZWN0b3I6IENoYW5nZUNvbGxlY3RvclxuICApOiB2b2lkIHtcbiAgICBjaGFuZ2VDb2xsZWN0b3Jba2V5XSA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIGNoYW5nZUZpZWxkKFxuICAgIHN1YnNjcmlwdGlvbkhhbmRsZTogc3RyaW5nLFxuICAgIGtleTogc3RyaW5nLFxuICAgIHZhbHVlOiBhbnksXG4gICAgY2hhbmdlQ29sbGVjdG9yOiBDaGFuZ2VDb2xsZWN0b3IsXG4gICAgaXNBZGQ/OiBib29sZWFuXG4gICk6IHZvaWQge1xuICAgIGNoYW5nZUNvbGxlY3RvcltrZXldID0gdmFsdWU7XG4gIH1cbn0iLCJpbXBvcnQgeyBEdW1teURvY3VtZW50VmlldyB9IGZyb20gXCIuL2R1bW15X2RvY3VtZW50X3ZpZXdcIjtcbmltcG9ydCB7IFNlc3Npb25Eb2N1bWVudFZpZXcgfSBmcm9tIFwiLi9zZXNzaW9uX2RvY3VtZW50X3ZpZXdcIjtcblxuaW50ZXJmYWNlIFNlc3Npb25DYWxsYmFja3Mge1xuICBhZGRlZDogKGNvbGxlY3Rpb25OYW1lOiBzdHJpbmcsIGlkOiBzdHJpbmcsIGZpZWxkczogUmVjb3JkPHN0cmluZywgYW55PikgPT4gdm9pZDtcbiAgY2hhbmdlZDogKGNvbGxlY3Rpb25OYW1lOiBzdHJpbmcsIGlkOiBzdHJpbmcsIGZpZWxkczogUmVjb3JkPHN0cmluZywgYW55PikgPT4gdm9pZDtcbiAgcmVtb3ZlZDogKGNvbGxlY3Rpb25OYW1lOiBzdHJpbmcsIGlkOiBzdHJpbmcpID0+IHZvaWQ7XG59XG5cbnR5cGUgRG9jdW1lbnRWaWV3ID0gU2Vzc2lvbkRvY3VtZW50VmlldyB8IER1bW15RG9jdW1lbnRWaWV3O1xuXG5leHBvcnQgY2xhc3MgU2Vzc2lvbkNvbGxlY3Rpb25WaWV3IHtcbiAgcHJpdmF0ZSByZWFkb25seSBjb2xsZWN0aW9uTmFtZTogc3RyaW5nO1xuICBwcml2YXRlIHJlYWRvbmx5IGRvY3VtZW50czogTWFwPHN0cmluZywgRG9jdW1lbnRWaWV3PjtcbiAgcHJpdmF0ZSByZWFkb25seSBjYWxsYmFja3M6IFNlc3Npb25DYWxsYmFja3M7XG5cbiAgLyoqXG4gICAqIFJlcHJlc2VudHMgYSBjbGllbnQncyB2aWV3IG9mIGEgc2luZ2xlIGNvbGxlY3Rpb25cbiAgICogQHBhcmFtIGNvbGxlY3Rpb25OYW1lIC0gTmFtZSBvZiB0aGUgY29sbGVjdGlvbiBpdCByZXByZXNlbnRzXG4gICAqIEBwYXJhbSBzZXNzaW9uQ2FsbGJhY2tzIC0gVGhlIGNhbGxiYWNrcyBmb3IgYWRkZWQsIGNoYW5nZWQsIHJlbW92ZWRcbiAgICovXG4gIGNvbnN0cnVjdG9yKGNvbGxlY3Rpb25OYW1lOiBzdHJpbmcsIHNlc3Npb25DYWxsYmFja3M6IFNlc3Npb25DYWxsYmFja3MpIHtcbiAgICB0aGlzLmNvbGxlY3Rpb25OYW1lID0gY29sbGVjdGlvbk5hbWU7XG4gICAgdGhpcy5kb2N1bWVudHMgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5jYWxsYmFja3MgPSBzZXNzaW9uQ2FsbGJhY2tzO1xuICB9XG5cbiAgcHVibGljIGlzRW1wdHkoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuZG9jdW1lbnRzLnNpemUgPT09IDA7XG4gIH1cblxuICBwdWJsaWMgZGlmZihwcmV2aW91czogU2Vzc2lvbkNvbGxlY3Rpb25WaWV3KTogdm9pZCB7XG4gICAgRGlmZlNlcXVlbmNlLmRpZmZNYXBzKHByZXZpb3VzLmRvY3VtZW50cywgdGhpcy5kb2N1bWVudHMsIHtcbiAgICAgIGJvdGg6IHRoaXMuZGlmZkRvY3VtZW50LmJpbmQodGhpcyksXG4gICAgICByaWdodE9ubHk6IChpZDogc3RyaW5nLCBub3dEVjogRG9jdW1lbnRWaWV3KSA9PiB7XG4gICAgICAgIHRoaXMuY2FsbGJhY2tzLmFkZGVkKHRoaXMuY29sbGVjdGlvbk5hbWUsIGlkLCBub3dEVi5nZXRGaWVsZHMoKSk7XG4gICAgICB9LFxuICAgICAgbGVmdE9ubHk6IChpZDogc3RyaW5nLCBwcmV2RFY6IERvY3VtZW50VmlldykgPT4ge1xuICAgICAgICB0aGlzLmNhbGxiYWNrcy5yZW1vdmVkKHRoaXMuY29sbGVjdGlvbk5hbWUsIGlkKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgZGlmZkRvY3VtZW50KGlkOiBzdHJpbmcsIHByZXZEVjogRG9jdW1lbnRWaWV3LCBub3dEVjogRG9jdW1lbnRWaWV3KTogdm9pZCB7XG4gICAgY29uc3QgZmllbGRzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG4gICAgXG4gICAgRGlmZlNlcXVlbmNlLmRpZmZPYmplY3RzKHByZXZEVi5nZXRGaWVsZHMoKSwgbm93RFYuZ2V0RmllbGRzKCksIHtcbiAgICAgIGJvdGg6IChrZXk6IHN0cmluZywgcHJldjogYW55LCBub3c6IGFueSkgPT4ge1xuICAgICAgICBpZiAoIUVKU09OLmVxdWFscyhwcmV2LCBub3cpKSB7XG4gICAgICAgICAgZmllbGRzW2tleV0gPSBub3c7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICByaWdodE9ubHk6IChrZXk6IHN0cmluZywgbm93OiBhbnkpID0+IHtcbiAgICAgICAgZmllbGRzW2tleV0gPSBub3c7XG4gICAgICB9LFxuICAgICAgbGVmdE9ubHk6IChrZXk6IHN0cmluZywgcHJldjogYW55KSA9PiB7XG4gICAgICAgIGZpZWxkc1trZXldID0gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgIH0pO1xuICAgIFxuICAgIHRoaXMuY2FsbGJhY2tzLmNoYW5nZWQodGhpcy5jb2xsZWN0aW9uTmFtZSwgaWQsIGZpZWxkcyk7XG4gIH1cblxuICBwdWJsaWMgYWRkZWQoc3Vic2NyaXB0aW9uSGFuZGxlOiBzdHJpbmcsIGlkOiBzdHJpbmcsIGZpZWxkczogUmVjb3JkPHN0cmluZywgYW55Pik6IHZvaWQge1xuICAgIGxldCBkb2NWaWV3OiBEb2N1bWVudFZpZXcgfCB1bmRlZmluZWQgPSB0aGlzLmRvY3VtZW50cy5nZXQoaWQpO1xuICAgIGxldCBhZGRlZCA9IGZhbHNlO1xuXG4gICAgaWYgKCFkb2NWaWV3KSB7XG4gICAgICBhZGRlZCA9IHRydWU7XG4gICAgICBpZiAoTWV0ZW9yLnNlcnZlci5nZXRQdWJsaWNhdGlvblN0cmF0ZWd5KHRoaXMuY29sbGVjdGlvbk5hbWUpLnVzZUR1bW15RG9jdW1lbnRWaWV3KSB7XG4gICAgICAgIGRvY1ZpZXcgPSBuZXcgRHVtbXlEb2N1bWVudFZpZXcoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRvY1ZpZXcgPSBuZXcgU2Vzc2lvbkRvY3VtZW50VmlldygpO1xuICAgICAgfVxuICAgICAgdGhpcy5kb2N1bWVudHMuc2V0KGlkLCBkb2NWaWV3KTtcbiAgICB9XG5cbiAgICBkb2NWaWV3LmV4aXN0c0luLmFkZChzdWJzY3JpcHRpb25IYW5kbGUpO1xuICAgIGNvbnN0IGNoYW5nZUNvbGxlY3RvcjogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9O1xuXG4gICAgT2JqZWN0LmVudHJpZXMoZmllbGRzKS5mb3JFYWNoKChba2V5LCB2YWx1ZV0pID0+IHtcbiAgICAgIGRvY1ZpZXchLmNoYW5nZUZpZWxkKFxuICAgICAgICBzdWJzY3JpcHRpb25IYW5kbGUsXG4gICAgICAgIGtleSxcbiAgICAgICAgdmFsdWUsXG4gICAgICAgIGNoYW5nZUNvbGxlY3RvcixcbiAgICAgICAgdHJ1ZVxuICAgICAgKTtcbiAgICB9KTtcblxuICAgIGlmIChhZGRlZCkge1xuICAgICAgdGhpcy5jYWxsYmFja3MuYWRkZWQodGhpcy5jb2xsZWN0aW9uTmFtZSwgaWQsIGNoYW5nZUNvbGxlY3Rvcik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuY2FsbGJhY2tzLmNoYW5nZWQodGhpcy5jb2xsZWN0aW9uTmFtZSwgaWQsIGNoYW5nZUNvbGxlY3Rvcik7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGNoYW5nZWQoc3Vic2NyaXB0aW9uSGFuZGxlOiBzdHJpbmcsIGlkOiBzdHJpbmcsIGNoYW5nZWQ6IFJlY29yZDxzdHJpbmcsIGFueT4pOiB2b2lkIHtcbiAgICBjb25zdCBjaGFuZ2VkUmVzdWx0OiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG4gICAgY29uc3QgZG9jVmlldyA9IHRoaXMuZG9jdW1lbnRzLmdldChpZCk7XG5cbiAgICBpZiAoIWRvY1ZpZXcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IGZpbmQgZWxlbWVudCB3aXRoIGlkICR7aWR9IHRvIGNoYW5nZWApO1xuICAgIH1cblxuICAgIE9iamVjdC5lbnRyaWVzKGNoYW5nZWQpLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuICAgICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgZG9jVmlldy5jbGVhckZpZWxkKHN1YnNjcmlwdGlvbkhhbmRsZSwga2V5LCBjaGFuZ2VkUmVzdWx0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRvY1ZpZXcuY2hhbmdlRmllbGQoc3Vic2NyaXB0aW9uSGFuZGxlLCBrZXksIHZhbHVlLCBjaGFuZ2VkUmVzdWx0KTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHRoaXMuY2FsbGJhY2tzLmNoYW5nZWQodGhpcy5jb2xsZWN0aW9uTmFtZSwgaWQsIGNoYW5nZWRSZXN1bHQpO1xuICB9XG5cbiAgcHVibGljIHJlbW92ZWQoc3Vic2NyaXB0aW9uSGFuZGxlOiBzdHJpbmcsIGlkOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCBkb2NWaWV3ID0gdGhpcy5kb2N1bWVudHMuZ2V0KGlkKTtcblxuICAgIGlmICghZG9jVmlldykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBSZW1vdmVkIG5vbmV4aXN0ZW50IGRvY3VtZW50ICR7aWR9YCk7XG4gICAgfVxuXG4gICAgZG9jVmlldy5leGlzdHNJbi5kZWxldGUoc3Vic2NyaXB0aW9uSGFuZGxlKTtcblxuICAgIGlmIChkb2NWaWV3LmV4aXN0c0luLnNpemUgPT09IDApIHtcbiAgICAgIC8vIGl0IGlzIGdvbmUgZnJvbSBldmVyeW9uZVxuICAgICAgdGhpcy5jYWxsYmFja3MucmVtb3ZlZCh0aGlzLmNvbGxlY3Rpb25OYW1lLCBpZCk7XG4gICAgICB0aGlzLmRvY3VtZW50cy5kZWxldGUoaWQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBjaGFuZ2VkOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG4gICAgICAvLyByZW1vdmUgdGhpcyBzdWJzY3JpcHRpb24gZnJvbSBldmVyeSBwcmVjZWRlbmNlIGxpc3RcbiAgICAgIC8vIGFuZCByZWNvcmQgdGhlIGNoYW5nZXNcbiAgICAgIGRvY1ZpZXcuZGF0YUJ5S2V5LmZvckVhY2goKHByZWNlZGVuY2VMaXN0LCBrZXkpID0+IHtcbiAgICAgICAgZG9jVmlldy5jbGVhckZpZWxkKHN1YnNjcmlwdGlvbkhhbmRsZSwga2V5LCBjaGFuZ2VkKTtcbiAgICAgIH0pO1xuICAgICAgdGhpcy5jYWxsYmFja3MuY2hhbmdlZCh0aGlzLmNvbGxlY3Rpb25OYW1lLCBpZCwgY2hhbmdlZCk7XG4gICAgfVxuICB9XG59IiwiaW50ZXJmYWNlIFByZWNlZGVuY2VJdGVtIHtcbiAgc3Vic2NyaXB0aW9uSGFuZGxlOiBzdHJpbmc7XG4gIHZhbHVlOiBhbnk7XG59XG5cbmludGVyZmFjZSBDaGFuZ2VDb2xsZWN0b3Ige1xuICBba2V5OiBzdHJpbmddOiBhbnk7XG59XG5cbmV4cG9ydCBjbGFzcyBTZXNzaW9uRG9jdW1lbnRWaWV3IHtcbiAgcHJpdmF0ZSBleGlzdHNJbjogU2V0PHN0cmluZz47XG4gIHByaXZhdGUgZGF0YUJ5S2V5OiBNYXA8c3RyaW5nLCBQcmVjZWRlbmNlSXRlbVtdPjtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLmV4aXN0c0luID0gbmV3IFNldCgpOyAvLyBzZXQgb2Ygc3Vic2NyaXB0aW9uSGFuZGxlXG4gICAgLy8gTWVtb3J5IEdyb3d0aFxuICAgIHRoaXMuZGF0YUJ5S2V5ID0gbmV3IE1hcCgpOyAvLyBrZXktPiBbIHtzdWJzY3JpcHRpb25IYW5kbGUsIHZhbHVlfSBieSBwcmVjZWRlbmNlXVxuICB9XG5cbiAgZ2V0RmllbGRzKCk6IFJlY29yZDxzdHJpbmcsIGFueT4ge1xuICAgIGNvbnN0IHJldDogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9O1xuICAgIHRoaXMuZGF0YUJ5S2V5LmZvckVhY2goKHByZWNlZGVuY2VMaXN0LCBrZXkpID0+IHtcbiAgICAgIHJldFtrZXldID0gcHJlY2VkZW5jZUxpc3RbMF0udmFsdWU7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJldDtcbiAgfVxuXG4gIGNsZWFyRmllbGQoXG4gICAgc3Vic2NyaXB0aW9uSGFuZGxlOiBzdHJpbmcsXG4gICAga2V5OiBzdHJpbmcsXG4gICAgY2hhbmdlQ29sbGVjdG9yOiBDaGFuZ2VDb2xsZWN0b3JcbiAgKTogdm9pZCB7XG4gICAgLy8gUHVibGlzaCBBUEkgaWdub3JlcyBfaWQgaWYgcHJlc2VudCBpbiBmaWVsZHNcbiAgICBpZiAoa2V5ID09PSBcIl9pZFwiKSByZXR1cm47XG5cbiAgICBjb25zdCBwcmVjZWRlbmNlTGlzdCA9IHRoaXMuZGF0YUJ5S2V5LmdldChrZXkpO1xuICAgIC8vIEl0J3Mgb2theSB0byBjbGVhciBmaWVsZHMgdGhhdCBkaWRuJ3QgZXhpc3QuIE5vIG5lZWQgdG8gdGhyb3dcbiAgICAvLyBhbiBlcnJvci5cbiAgICBpZiAoIXByZWNlZGVuY2VMaXN0KSByZXR1cm47XG5cbiAgICBsZXQgcmVtb3ZlZFZhbHVlOiBhbnkgPSB1bmRlZmluZWQ7XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHByZWNlZGVuY2VMaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBwcmVjZWRlbmNlID0gcHJlY2VkZW5jZUxpc3RbaV07XG4gICAgICBpZiAocHJlY2VkZW5jZS5zdWJzY3JpcHRpb25IYW5kbGUgPT09IHN1YnNjcmlwdGlvbkhhbmRsZSkge1xuICAgICAgICAvLyBUaGUgdmlldydzIHZhbHVlIGNhbiBvbmx5IGNoYW5nZSBpZiB0aGlzIHN1YnNjcmlwdGlvbiBpcyB0aGUgb25lIHRoYXRcbiAgICAgICAgLy8gdXNlZCB0byBoYXZlIHByZWNlZGVuY2UuXG4gICAgICAgIGlmIChpID09PSAwKSByZW1vdmVkVmFsdWUgPSBwcmVjZWRlbmNlLnZhbHVlO1xuICAgICAgICBwcmVjZWRlbmNlTGlzdC5zcGxpY2UoaSwgMSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChwcmVjZWRlbmNlTGlzdC5sZW5ndGggPT09IDApIHtcbiAgICAgIHRoaXMuZGF0YUJ5S2V5LmRlbGV0ZShrZXkpO1xuICAgICAgY2hhbmdlQ29sbGVjdG9yW2tleV0gPSB1bmRlZmluZWQ7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHJlbW92ZWRWYWx1ZSAhPT0gdW5kZWZpbmVkICYmXG4gICAgICAhRUpTT04uZXF1YWxzKHJlbW92ZWRWYWx1ZSwgcHJlY2VkZW5jZUxpc3RbMF0udmFsdWUpXG4gICAgKSB7XG4gICAgICBjaGFuZ2VDb2xsZWN0b3Jba2V5XSA9IHByZWNlZGVuY2VMaXN0WzBdLnZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIGNoYW5nZUZpZWxkKFxuICAgIHN1YnNjcmlwdGlvbkhhbmRsZTogc3RyaW5nLFxuICAgIGtleTogc3RyaW5nLFxuICAgIHZhbHVlOiBhbnksXG4gICAgY2hhbmdlQ29sbGVjdG9yOiBDaGFuZ2VDb2xsZWN0b3IsXG4gICAgaXNBZGQ6IGJvb2xlYW4gPSBmYWxzZVxuICApOiB2b2lkIHtcbiAgICAvLyBQdWJsaXNoIEFQSSBpZ25vcmVzIF9pZCBpZiBwcmVzZW50IGluIGZpZWxkc1xuICAgIGlmIChrZXkgPT09IFwiX2lkXCIpIHJldHVybjtcblxuICAgIC8vIERvbid0IHNoYXJlIHN0YXRlIHdpdGggdGhlIGRhdGEgcGFzc2VkIGluIGJ5IHRoZSB1c2VyLlxuICAgIHZhbHVlID0gRUpTT04uY2xvbmUodmFsdWUpO1xuXG4gICAgaWYgKCF0aGlzLmRhdGFCeUtleS5oYXMoa2V5KSkge1xuICAgICAgdGhpcy5kYXRhQnlLZXkuc2V0KGtleSwgW1xuICAgICAgICB7IHN1YnNjcmlwdGlvbkhhbmRsZTogc3Vic2NyaXB0aW9uSGFuZGxlLCB2YWx1ZTogdmFsdWUgfSxcbiAgICAgIF0pO1xuICAgICAgY2hhbmdlQ29sbGVjdG9yW2tleV0gPSB2YWx1ZTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBwcmVjZWRlbmNlTGlzdCA9IHRoaXMuZGF0YUJ5S2V5LmdldChrZXkpITtcbiAgICBsZXQgZWx0OiBQcmVjZWRlbmNlSXRlbSB8IHVuZGVmaW5lZDtcblxuICAgIGlmICghaXNBZGQpIHtcbiAgICAgIGVsdCA9IHByZWNlZGVuY2VMaXN0LmZpbmQoXG4gICAgICAgIChwcmVjZWRlbmNlKSA9PiBwcmVjZWRlbmNlLnN1YnNjcmlwdGlvbkhhbmRsZSA9PT0gc3Vic2NyaXB0aW9uSGFuZGxlXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmIChlbHQpIHtcbiAgICAgIGlmIChlbHQgPT09IHByZWNlZGVuY2VMaXN0WzBdICYmICFFSlNPTi5lcXVhbHModmFsdWUsIGVsdC52YWx1ZSkpIHtcbiAgICAgICAgLy8gdGhpcyBzdWJzY3JpcHRpb24gaXMgY2hhbmdpbmcgdGhlIHZhbHVlIG9mIHRoaXMgZmllbGQuXG4gICAgICAgIGNoYW5nZUNvbGxlY3RvcltrZXldID0gdmFsdWU7XG4gICAgICB9XG4gICAgICBlbHQudmFsdWUgPSB2YWx1ZTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gdGhpcyBzdWJzY3JpcHRpb24gaXMgbmV3bHkgY2FyaW5nIGFib3V0IHRoaXMgZmllbGRcbiAgICAgIHByZWNlZGVuY2VMaXN0LnB1c2goeyBzdWJzY3JpcHRpb25IYW5kbGU6IHN1YnNjcmlwdGlvbkhhbmRsZSwgdmFsdWU6IHZhbHVlIH0pO1xuICAgIH1cbiAgfVxufSJdfQ==
