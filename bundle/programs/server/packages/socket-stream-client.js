Package["core-runtime"].queue("socket-stream-client",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;
var ECMAScript = Package.ecmascript.ECMAScript;
var Retry = Package.retry.Retry;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

var require = meteorInstall({"node_modules":{"meteor":{"socket-stream-client":{"server.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                    //
// packages/socket-stream-client/server.js                                                            //
//                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                      //
!module.wrapAsync(async function (module1, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    let setMinimumBrowserVersions;
    module1.link("meteor/modern-browsers", {
      setMinimumBrowserVersions(v) {
        setMinimumBrowserVersions = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    setMinimumBrowserVersions({
      chrome: 16,
      edge: 12,
      firefox: 11,
      ie: 10,
      mobileSafari: [6, 1],
      phantomjs: 2,
      safari: 7,
      electron: [0, 20]
    }, module.id);
    if (process.env.DISABLE_SOCKJS) {
      __meteor_runtime_config__.DISABLE_SOCKJS = process.env.DISABLE_SOCKJS;
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
////////////////////////////////////////////////////////////////////////////////////////////////////////

},"node.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                    //
// packages/socket-stream-client/node.js                                                              //
//                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                      //
!module.wrapAsync(async function (module1, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module1.export({
      ClientStream: () => ClientStream
    });
    let Meteor;
    module1.link("meteor/meteor", {
      Meteor(v) {
        Meteor = v;
      }
    }, 0);
    let StreamClientCommon;
    module1.link("./common.js", {
      StreamClientCommon(v) {
        StreamClientCommon = v;
      }
    }, 1);
    let toWebsocketUrl;
    module1.link("./urls.js", {
      toWebsocketUrl(v) {
        toWebsocketUrl = v;
      }
    }, 2);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    class ClientStream extends StreamClientCommon {
      constructor(endpoint, options) {
        super(options);
        this.client = null; // created in _launchConnection
        this.endpoint = endpoint;
        this.headers = this.options.headers || {};
        this.npmFayeOptions = this.options.npmFayeOptions || {};
        this._initCommon(this.options);

        //// Kickoff!
        this._launchConnection();
      }

      // data is a utf8 string. Data sent while not connected is dropped on
      // the floor, and it is up the user of this API to retransmit lost
      // messages on 'reset'
      send(data) {
        if (this.currentStatus.connected) {
          this.client.send(data);
        }
      }

      // Changes where this connection points
      _changeUrl(url) {
        this.endpoint = url;
      }
      _onConnect(client) {
        if (client !== this.client) {
          // This connection is not from the last call to _launchConnection.
          // But _launchConnection calls _cleanup which closes previous connections.
          // It's our belief that this stifles future 'open' events, but maybe
          // we are wrong?
          throw new Error('Got open from inactive client ' + !!this.client);
        }
        if (this._forcedToDisconnect) {
          // We were asked to disconnect between trying to open the connection and
          // actually opening it. Let's just pretend this never happened.
          this.client.close();
          this.client = null;
          return;
        }
        if (this.currentStatus.connected) {
          // We already have a connection. It must have been the case that we
          // started two parallel connection attempts (because we wanted to
          // 'reconnect now' on a hanging connection and we had no way to cancel the
          // connection attempt.) But this shouldn't happen (similarly to the client
          // !== this.client check above).
          throw new Error('Two parallel connections?');
        }
        this._clearConnectionTimer();

        // update status
        this.currentStatus.status = 'connected';
        this.currentStatus.connected = true;
        this.currentStatus.retryCount = 0;
        this.statusChanged();

        // fire resets. This must come after status change so that clients
        // can call send from within a reset callback.
        this.forEachCallback('reset', callback => {
          callback();
        });
      }
      _cleanup(maybeError) {
        this._clearConnectionTimer();
        if (this.client) {
          var client = this.client;
          this.client = null;
          client.close();
          this.forEachCallback('disconnect', callback => {
            callback(maybeError);
          });
        }
      }
      _clearConnectionTimer() {
        if (this.connectionTimer) {
          clearTimeout(this.connectionTimer);
          this.connectionTimer = null;
        }
      }
      _getProxyUrl(targetUrl) {
        // Similar to code in tools/http-helpers.js.
        var proxy = process.env.HTTP_PROXY || process.env.http_proxy || null;
        var noproxy = process.env.NO_PROXY || process.env.no_proxy || null;
        // if we're going to a secure url, try the https_proxy env variable first.
        if (targetUrl.match(/^wss:/) || targetUrl.match(/^https:/)) {
          proxy = process.env.HTTPS_PROXY || process.env.https_proxy || proxy;
        }
        if (targetUrl.indexOf('localhost') != -1 || targetUrl.indexOf('127.0.0.1') != -1) {
          return null;
        }
        if (noproxy) {
          for (let item of noproxy.split(',')) {
            if (targetUrl.indexOf(item.trim().replace(/\*/, '')) !== -1) {
              proxy = null;
            }
          }
        }
        return proxy;
      }
      _launchConnection() {
        var _this = this;
        this._cleanup(); // cleanup the old socket, if there was one.

        // Since server-to-server DDP is still an experimental feature, we only
        // require the module if we actually create a server-to-server
        // connection.
        var FayeWebSocket = Npm.require('faye-websocket');
        var deflate = Npm.require('permessage-deflate2');
        var targetUrl = toWebsocketUrl(this.endpoint);
        var fayeOptions = {
          headers: this.headers,
          extensions: [deflate]
        };
        fayeOptions = Object.assign(fayeOptions, this.npmFayeOptions);
        var proxyUrl = this._getProxyUrl(targetUrl);
        if (proxyUrl) {
          fayeOptions.proxy = {
            origin: proxyUrl
          };
        }

        // We would like to specify 'ddp' as the subprotocol here. The npm module we
        // used to use as a client would fail the handshake if we ask for a
        // subprotocol and the server doesn't send one back (and sockjs doesn't).
        // Faye doesn't have that behavior; it's unclear from reading RFC 6455 if
        // Faye is erroneous or not.  So for now, we don't specify protocols.
        var subprotocols = [];
        var client = this.client = new FayeWebSocket.Client(targetUrl, subprotocols, fayeOptions);
        this._clearConnectionTimer();
        this.connectionTimer = Meteor.setTimeout(() => {
          this._lostConnection(new this.ConnectionError('DDP connection timed out'));
        }, this.CONNECT_TIMEOUT);
        this.client.on('open', Meteor.bindEnvironment(() => {
          return this._onConnect(client);
        }, 'stream connect callback'));
        var clientOnIfCurrent = (event, description, callback) => {
          this.client.on(event, Meteor.bindEnvironment(function () {
            // Ignore events from any connection we've already cleaned up.
            if (client !== _this.client) return;
            callback(...arguments);
          }, description));
        };
        clientOnIfCurrent('error', 'stream error callback', error => {
          if (!this.options._dontPrintErrors) Meteor._debug('stream error', error.message);

          // Faye's 'error' object is not a JS error (and among other things,
          // doesn't stringify well). Convert it to one.
          this._lostConnection(new this.ConnectionError(error.message));
        });
        clientOnIfCurrent('close', 'stream close callback', () => {
          this._lostConnection();
        });
        clientOnIfCurrent('message', 'stream message callback', message => {
          // Ignore binary frames, where message.data is a Buffer
          if (typeof message.data !== 'string') return;
          this.forEachCallback('message', callback => {
            callback(message.data);
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
////////////////////////////////////////////////////////////////////////////////////////////////////////

},"common.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                    //
// packages/socket-stream-client/common.js                                                            //
//                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////
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
      StreamClientCommon: () => StreamClientCommon
    });
    let Retry;
    module.link("meteor/retry", {
      Retry(v) {
        Retry = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    const forcedReconnectError = new Error("forced reconnect");
    class StreamClientCommon {
      constructor(options) {
        this.options = _objectSpread({
          retry: true
        }, options || null);
        this.ConnectionError = options && options.ConnectionError || Error;
      }

      // Register for callbacks.
      on(name, callback) {
        if (name !== 'message' && name !== 'reset' && name !== 'disconnect') throw new Error('unknown event type: ' + name);
        if (!this.eventCallbacks[name]) this.eventCallbacks[name] = [];
        this.eventCallbacks[name].push(callback);
      }
      forEachCallback(name, cb) {
        if (!this.eventCallbacks[name] || !this.eventCallbacks[name].length) {
          return;
        }
        this.eventCallbacks[name].forEach(cb);
      }
      _initCommon(options) {
        options = options || Object.create(null);

        //// Constants

        // how long to wait until we declare the connection attempt
        // failed.
        this.CONNECT_TIMEOUT = options.connectTimeoutMs || 10000;
        this.eventCallbacks = Object.create(null); // name -> [callback]

        this._forcedToDisconnect = false;

        //// Reactive status
        this.currentStatus = {
          status: 'connecting',
          connected: false,
          retryCount: 0
        };
        if (Package.tracker) {
          this.statusListeners = new Package.tracker.Tracker.Dependency();
        }
        this.statusChanged = () => {
          if (this.statusListeners) {
            this.statusListeners.changed();
          }
        };

        //// Retry logic
        this._retry = new Retry();
        this.connectionTimer = null;
      }

      // Trigger a reconnect.
      reconnect(options) {
        options = options || Object.create(null);
        if (options.url) {
          this._changeUrl(options.url);
        }
        if (options._sockjsOptions) {
          this.options._sockjsOptions = options._sockjsOptions;
        }
        if (this.currentStatus.connected) {
          if (options._force || options.url) {
            this._lostConnection(forcedReconnectError);
          }
          return;
        }

        // if we're mid-connection, stop it.
        if (this.currentStatus.status === 'connecting') {
          // Pretend it's a clean close.
          this._lostConnection();
        }
        this._retry.clear();
        this.currentStatus.retryCount -= 1; // don't count manual retries
        this._retryNow();
      }
      disconnect(options) {
        options = options || Object.create(null);

        // Failed is permanent. If we're failed, don't let people go back
        // online by calling 'disconnect' then 'reconnect'.
        if (this._forcedToDisconnect) return;

        // If _permanent is set, permanently disconnect a stream. Once a stream
        // is forced to disconnect, it can never reconnect. This is for
        // error cases such as ddp version mismatch, where trying again
        // won't fix the problem.
        if (options._permanent) {
          this._forcedToDisconnect = true;
        }
        this._cleanup();
        this._retry.clear();
        this.currentStatus = {
          status: options._permanent ? 'failed' : 'offline',
          connected: false,
          retryCount: 0
        };
        if (options._permanent && options._error) this.currentStatus.reason = options._error;
        this.statusChanged();
      }

      // maybeError is set unless it's a clean protocol-level close.
      _lostConnection(maybeError) {
        this._cleanup(maybeError);
        this._retryLater(maybeError); // sets status. no need to do it here.
      }

      // fired when we detect that we've gone online. try to reconnect
      // immediately.
      _online() {
        // if we've requested to be offline by disconnecting, don't reconnect.
        if (this.currentStatus.status != 'offline') this.reconnect();
      }
      _retryLater(maybeError) {
        var timeout = 0;
        if (this.options.retry || maybeError === forcedReconnectError) {
          timeout = this._retry.retryLater(this.currentStatus.retryCount, this._retryNow.bind(this));
          this.currentStatus.status = 'waiting';
          this.currentStatus.retryTime = new Date().getTime() + timeout;
        } else {
          this.currentStatus.status = 'failed';
          delete this.currentStatus.retryTime;
        }
        this.currentStatus.connected = false;
        this.statusChanged();
      }
      _retryNow() {
        if (this._forcedToDisconnect) return;
        this.currentStatus.retryCount += 1;
        this.currentStatus.status = 'connecting';
        this.currentStatus.connected = false;
        delete this.currentStatus.retryTime;
        this.statusChanged();
        this._launchConnection();
      }

      // Get current status. Reactive.
      status() {
        if (this.statusListeners) {
          this.statusListeners.depend();
        }
        return this.currentStatus;
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
////////////////////////////////////////////////////////////////////////////////////////////////////////

},"urls.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                    //
// packages/socket-stream-client/urls.js                                                              //
//                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                      //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      toSockjsUrl: () => toSockjsUrl,
      toWebsocketUrl: () => toWebsocketUrl
    });
    let Meteor;
    module.link("meteor/meteor", {
      Meteor(v) {
        Meteor = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    // @param url {String} URL to Meteor app, eg:
    //   "/" or "madewith.meteor.com" or "https://foo.meteor.com"
    //   or "ddp+sockjs://ddp--****-foo.meteor.com/sockjs"
    // @returns {String} URL to the endpoint with the specific scheme and subPath, e.g.
    // for scheme "http" and subPath "sockjs"
    //   "http://subdomain.meteor.com/sockjs" or "/sockjs"
    //   or "https://ddp--1234-foo.meteor.com/sockjs"
    function translateUrl(url, newSchemeBase, subPath) {
      if (!newSchemeBase) {
        newSchemeBase = 'http';
      }
      if (subPath !== "sockjs" && url.startsWith("/")) {
        url = Meteor.absoluteUrl(url.substr(1));
      }
      var ddpUrlMatch = url.match(/^ddp(i?)\+sockjs:\/\//);
      var httpUrlMatch = url.match(/^http(s?):\/\//);
      var newScheme;
      if (ddpUrlMatch) {
        // Remove scheme and split off the host.
        var urlAfterDDP = url.substr(ddpUrlMatch[0].length);
        newScheme = ddpUrlMatch[1] === 'i' ? newSchemeBase : newSchemeBase + 's';
        var slashPos = urlAfterDDP.indexOf('/');
        var host = slashPos === -1 ? urlAfterDDP : urlAfterDDP.substr(0, slashPos);
        var rest = slashPos === -1 ? '' : urlAfterDDP.substr(slashPos);

        // In the host (ONLY!), change '*' characters into random digits. This
        // allows different stream connections to connect to different hostnames
        // and avoid browser per-hostname connection limits.
        host = host.replace(/\*/g, () => Math.floor(Math.random() * 10));
        return newScheme + '://' + host + rest;
      } else if (httpUrlMatch) {
        newScheme = !httpUrlMatch[1] ? newSchemeBase : newSchemeBase + 's';
        var urlAfterHttp = url.substr(httpUrlMatch[0].length);
        url = newScheme + '://' + urlAfterHttp;
      }

      // Prefix FQDNs but not relative URLs
      if (url.indexOf('://') === -1 && !url.startsWith('/')) {
        url = newSchemeBase + '://' + url;
      }

      // XXX This is not what we should be doing: if I have a site
      // deployed at "/foo", then DDP.connect("/") should actually connect
      // to "/", not to "/foo". "/" is an absolute path. (Contrast: if
      // deployed at "/foo", it would be reasonable for DDP.connect("bar")
      // to connect to "/foo/bar").
      //
      // We should make this properly honor absolute paths rather than
      // forcing the path to be relative to the site root. Simultaneously,
      // we should set DDP_DEFAULT_CONNECTION_URL to include the site
      // root. See also client_convenience.js #RationalizingRelativeDDPURLs
      url = Meteor._relativeToSiteRootUrl(url);
      if (url.endsWith('/')) return url + subPath;else return url + '/' + subPath;
    }
    function toSockjsUrl(url) {
      return translateUrl(url, 'http', 'sockjs');
    }
    function toWebsocketUrl(url) {
      return translateUrl(url, 'ws', 'websocket');
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
////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});


/* Exports */
return {
  require: require,
  eagerModulePaths: [
    "/node_modules/meteor/socket-stream-client/server.js"
  ]
}});

//# sourceURL=meteor://💻app/packages/socket-stream-client.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvc29ja2V0LXN0cmVhbS1jbGllbnQvc2VydmVyLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9zb2NrZXQtc3RyZWFtLWNsaWVudC9ub2RlLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9zb2NrZXQtc3RyZWFtLWNsaWVudC9jb21tb24uanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL3NvY2tldC1zdHJlYW0tY2xpZW50L3VybHMuanMiXSwibmFtZXMiOlsic2V0TWluaW11bUJyb3dzZXJWZXJzaW9ucyIsIm1vZHVsZTEiLCJsaW5rIiwidiIsIl9fcmVpZnlXYWl0Rm9yRGVwc19fIiwiY2hyb21lIiwiZWRnZSIsImZpcmVmb3giLCJpZSIsIm1vYmlsZVNhZmFyaSIsInBoYW50b21qcyIsInNhZmFyaSIsImVsZWN0cm9uIiwibW9kdWxlIiwiaWQiLCJwcm9jZXNzIiwiZW52IiwiRElTQUJMRV9TT0NLSlMiLCJfX21ldGVvcl9ydW50aW1lX2NvbmZpZ19fIiwiX19yZWlmeV9hc3luY19yZXN1bHRfXyIsIl9yZWlmeUVycm9yIiwic2VsZiIsImFzeW5jIiwiZXhwb3J0IiwiQ2xpZW50U3RyZWFtIiwiTWV0ZW9yIiwiU3RyZWFtQ2xpZW50Q29tbW9uIiwidG9XZWJzb2NrZXRVcmwiLCJjb25zdHJ1Y3RvciIsImVuZHBvaW50Iiwib3B0aW9ucyIsImNsaWVudCIsImhlYWRlcnMiLCJucG1GYXllT3B0aW9ucyIsIl9pbml0Q29tbW9uIiwiX2xhdW5jaENvbm5lY3Rpb24iLCJzZW5kIiwiZGF0YSIsImN1cnJlbnRTdGF0dXMiLCJjb25uZWN0ZWQiLCJfY2hhbmdlVXJsIiwidXJsIiwiX29uQ29ubmVjdCIsIkVycm9yIiwiX2ZvcmNlZFRvRGlzY29ubmVjdCIsImNsb3NlIiwiX2NsZWFyQ29ubmVjdGlvblRpbWVyIiwic3RhdHVzIiwicmV0cnlDb3VudCIsInN0YXR1c0NoYW5nZWQiLCJmb3JFYWNoQ2FsbGJhY2siLCJjYWxsYmFjayIsIl9jbGVhbnVwIiwibWF5YmVFcnJvciIsImNvbm5lY3Rpb25UaW1lciIsImNsZWFyVGltZW91dCIsIl9nZXRQcm94eVVybCIsInRhcmdldFVybCIsInByb3h5IiwiSFRUUF9QUk9YWSIsImh0dHBfcHJveHkiLCJub3Byb3h5IiwiTk9fUFJPWFkiLCJub19wcm94eSIsIm1hdGNoIiwiSFRUUFNfUFJPWFkiLCJodHRwc19wcm94eSIsImluZGV4T2YiLCJpdGVtIiwic3BsaXQiLCJ0cmltIiwicmVwbGFjZSIsIl90aGlzIiwiRmF5ZVdlYlNvY2tldCIsIk5wbSIsInJlcXVpcmUiLCJkZWZsYXRlIiwiZmF5ZU9wdGlvbnMiLCJleHRlbnNpb25zIiwiT2JqZWN0IiwiYXNzaWduIiwicHJveHlVcmwiLCJvcmlnaW4iLCJzdWJwcm90b2NvbHMiLCJDbGllbnQiLCJzZXRUaW1lb3V0IiwiX2xvc3RDb25uZWN0aW9uIiwiQ29ubmVjdGlvbkVycm9yIiwiQ09OTkVDVF9USU1FT1VUIiwib24iLCJiaW5kRW52aXJvbm1lbnQiLCJjbGllbnRPbklmQ3VycmVudCIsImV2ZW50IiwiZGVzY3JpcHRpb24iLCJhcmd1bWVudHMiLCJlcnJvciIsIl9kb250UHJpbnRFcnJvcnMiLCJfZGVidWciLCJtZXNzYWdlIiwiX29iamVjdFNwcmVhZCIsImRlZmF1bHQiLCJSZXRyeSIsImZvcmNlZFJlY29ubmVjdEVycm9yIiwicmV0cnkiLCJuYW1lIiwiZXZlbnRDYWxsYmFja3MiLCJwdXNoIiwiY2IiLCJsZW5ndGgiLCJmb3JFYWNoIiwiY3JlYXRlIiwiY29ubmVjdFRpbWVvdXRNcyIsIlBhY2thZ2UiLCJ0cmFja2VyIiwic3RhdHVzTGlzdGVuZXJzIiwiVHJhY2tlciIsIkRlcGVuZGVuY3kiLCJjaGFuZ2VkIiwiX3JldHJ5IiwicmVjb25uZWN0IiwiX3NvY2tqc09wdGlvbnMiLCJfZm9yY2UiLCJjbGVhciIsIl9yZXRyeU5vdyIsImRpc2Nvbm5lY3QiLCJfcGVybWFuZW50IiwiX2Vycm9yIiwicmVhc29uIiwiX3JldHJ5TGF0ZXIiLCJfb25saW5lIiwidGltZW91dCIsInJldHJ5TGF0ZXIiLCJiaW5kIiwicmV0cnlUaW1lIiwiRGF0ZSIsImdldFRpbWUiLCJkZXBlbmQiLCJ0b1NvY2tqc1VybCIsInRyYW5zbGF0ZVVybCIsIm5ld1NjaGVtZUJhc2UiLCJzdWJQYXRoIiwic3RhcnRzV2l0aCIsImFic29sdXRlVXJsIiwic3Vic3RyIiwiZGRwVXJsTWF0Y2giLCJodHRwVXJsTWF0Y2giLCJuZXdTY2hlbWUiLCJ1cmxBZnRlckREUCIsInNsYXNoUG9zIiwiaG9zdCIsInJlc3QiLCJNYXRoIiwiZmxvb3IiLCJyYW5kb20iLCJ1cmxBZnRlckh0dHAiLCJfcmVsYXRpdmVUb1NpdGVSb290VXJsIiwiZW5kc1dpdGgiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztJQUFBLElBQUlBLHlCQUF5QjtJQUFDQyxPQUFPLENBQUNDLElBQUksQ0FBQyx3QkFBd0IsRUFBQztNQUFDRix5QkFBeUJBLENBQUNHLENBQUMsRUFBQztRQUFDSCx5QkFBeUIsR0FBQ0csQ0FBQztNQUFBO0lBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQztJQUFDLElBQUlDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxDQUFDLE1BQU1BLG9CQUFvQixDQUFDLENBQUMsRUFBRSxDQUFDO0lBSS9MSix5QkFBeUIsQ0FBQztNQUN4QkssTUFBTSxFQUFFLEVBQUU7TUFDVkMsSUFBSSxFQUFFLEVBQUU7TUFDUkMsT0FBTyxFQUFFLEVBQUU7TUFDWEMsRUFBRSxFQUFFLEVBQUU7TUFDTkMsWUFBWSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztNQUNwQkMsU0FBUyxFQUFFLENBQUM7TUFDWkMsTUFBTSxFQUFFLENBQUM7TUFDVEMsUUFBUSxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUU7SUFDbEIsQ0FBQyxFQUFFQyxNQUFNLENBQUNDLEVBQUUsQ0FBQztJQUViLElBQUlDLE9BQU8sQ0FBQ0MsR0FBRyxDQUFDQyxjQUFjLEVBQUU7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QSxJQUFJakgsR0FBRyxDQUFDMEIsT0FBTyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMxQixHQUFHLENBQUNvRyxVQUFVLENBQUMsR0FBRyxDQUFDLEVBQUU7UUFDckRwRyxHQUFHLEdBQUdrRyxhQUFhLEdBQUcsS0FBSyxHQUFHbEcsR0FBRztNQUNuQzs7TUFFQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBQSxHQUFHLEdBQUdoQixNQUFNLENBQUNrSSxzQkFBc0IsQ0FBQ2xILEdBQUcsQ0FBQztNQUV4QyxJQUFJQSxHQUFHLENBQUNtSCxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsT0FBT25ILEdBQUcsR0FBR21HLE9BQU8sQ0FBQyxLQUN2QyxPQUFPbkcsR0FBRyxHQUFHLEdBQUcsR0FBR21HLE9BQU87SUFDakM7SUFFTyxTQUFTSCxXQUFXQSxDQUFDaEcsR0FBRyxFQUFFO01BQy9CLE9BQU9pRyxZQUFZLENBQUNqRyxHQUFHLEVBQUUsTUFBTSxFQUFFLFFBQVEsQ0FBQztJQUM1QztJQUVPLFNBQVNkLGNBQWNBLENBQUNjLEdBQUcsRUFBRTtNQUNsQyxPQUFPaUcsWUFBWSxDQUFDakcsR0FBRyxFQUFFLElBQUksRUFBRSxXQUFXLENBQUM7SUFDN0M7SUFBQ3RCLHNCQUFBO0VBQUEsU0FBQUMsV0FBQTtJQUFBLE9BQUFELHNCQUFBLENBQUFDLFdBQUE7RUFBQTtFQUFBRCxzQkFBQTtBQUFBO0VBQUFFLElBQUE7RUFBQUMsS0FBQTtBQUFBLEciLCJmaWxlIjoiL3BhY2thZ2VzL3NvY2tldC1zdHJlYW0tY2xpZW50LmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgc2V0TWluaW11bUJyb3dzZXJWZXJzaW9ucyxcbn0gZnJvbSBcIm1ldGVvci9tb2Rlcm4tYnJvd3NlcnNcIjtcblxuc2V0TWluaW11bUJyb3dzZXJWZXJzaW9ucyh7XG4gIGNocm9tZTogMTYsXG4gIGVkZ2U6IDEyLFxuICBmaXJlZm94OiAxMSxcbiAgaWU6IDEwLFxuICBtb2JpbGVTYWZhcmk6IFs2LCAxXSxcbiAgcGhhbnRvbWpzOiAyLFxuICBzYWZhcmk6IDcsXG4gIGVsZWN0cm9uOiBbMCwgMjBdLFxufSwgbW9kdWxlLmlkKTtcblxuaWYgKHByb2Nlc3MuZW52LkRJU0FCTEVfU09DS0pTKSB7XG4gIF9fbWV0ZW9yX3J1bnRpbWVfY29uZmlnX18uRElTQUJMRV9TT0NLSlMgPSBwcm9jZXNzLmVudi5ESVNBQkxFX1NPQ0tKUztcbn0iLCJpbXBvcnQgeyBNZXRlb3IgfSBmcm9tIFwibWV0ZW9yL21ldGVvclwiO1xuaW1wb3J0IHsgU3RyZWFtQ2xpZW50Q29tbW9uIH0gZnJvbSBcIi4vY29tbW9uLmpzXCI7XG5pbXBvcnQgeyB0b1dlYnNvY2tldFVybCB9IGZyb20gXCIuL3VybHMuanNcIjtcblxuLy8gQHBhcmFtIGVuZHBvaW50IHtTdHJpbmd9IFVSTCB0byBNZXRlb3IgYXBwXG4vLyAgIFwiaHR0cDovL3N1YmRvbWFpbi5tZXRlb3IuY29tL1wiIG9yIFwiL1wiIG9yXG4vLyAgIFwiZGRwK3NvY2tqczovL2Zvby0qKi5tZXRlb3IuY29tL3NvY2tqc1wiXG4vL1xuLy8gV2UgZG8gc29tZSByZXdyaXRpbmcgb2YgdGhlIFVSTCB0byBldmVudHVhbGx5IG1ha2UgaXQgXCJ3czovL1wiIG9yIFwid3NzOi8vXCIsXG4vLyB3aGF0ZXZlciB3YXMgcGFzc2VkIGluLiAgQXQgdGhlIHZlcnkgbGVhc3QsIHdoYXQgTWV0ZW9yLmFic29sdXRlVXJsKCkgcmV0dXJuc1xuLy8gdXMgc2hvdWxkIHdvcmsuXG4vL1xuLy8gV2UgZG9uJ3QgZG8gYW55IGhlYXJ0YmVhdGluZy4gKFRoZSBsb2dpYyB0aGF0IGRpZCB0aGlzIGluIHNvY2tqcyB3YXMgcmVtb3ZlZCxcbi8vIGJlY2F1c2UgaXQgdXNlZCBhIGJ1aWx0LWluIHNvY2tqcyBtZWNoYW5pc20uIFdlIGNvdWxkIGRvIGl0IHdpdGggV2ViU29ja2V0XG4vLyBwaW5nIGZyYW1lcyBvciB3aXRoIEREUC1sZXZlbCBtZXNzYWdlcy4pXG5leHBvcnQgY2xhc3MgQ2xpZW50U3RyZWFtIGV4dGVuZHMgU3RyZWFtQ2xpZW50Q29tbW9uIHtcbiAgY29uc3RydWN0b3IoZW5kcG9pbnQsIG9wdGlvbnMpIHtcbiAgICBzdXBlcihvcHRpb25zKTtcblxuICAgIHRoaXMuY2xpZW50ID0gbnVsbDsgLy8gY3JlYXRlZCBpbiBfbGF1bmNoQ29ubmVjdGlvblxuICAgIHRoaXMuZW5kcG9pbnQgPSBlbmRwb2ludDtcblxuICAgIHRoaXMuaGVhZGVycyA9IHRoaXMub3B0aW9ucy5oZWFkZXJzIHx8IHt9O1xuICAgIHRoaXMubnBtRmF5ZU9wdGlvbnMgPSB0aGlzLm9wdGlvbnMubnBtRmF5ZU9wdGlvbnMgfHwge307XG5cbiAgICB0aGlzLl9pbml0Q29tbW9uKHRoaXMub3B0aW9ucyk7XG5cbiAgICAvLy8vIEtpY2tvZmYhXG4gICAgdGhpcy5fbGF1bmNoQ29ubmVjdGlvbigpO1xuICB9XG5cbiAgLy8gZGF0YSBpcyBhIHV0Zjggc3RyaW5nLiBEYXRhIHNlbnQgd2hpbGUgbm90IGNvbm5lY3RlZCBpcyBkcm9wcGVkIG9uXG4gIC8vIHRoZSBmbG9vciwgYW5kIGl0IGlzIHVwIHRoZSB1c2VyIG9mIHRoaXMgQVBJIHRvIHJldHJhbnNtaXQgbG9zdFxuICAvLyBtZXNzYWdlcyBvbiAncmVzZXQnXG4gIHNlbmQoZGF0YSkge1xuICAgIGlmICh0aGlzLmN1cnJlbnRTdGF0dXMuY29ubmVjdGVkKSB7XG4gICAgICB0aGlzLmNsaWVudC5zZW5kKGRhdGEpO1xuICAgIH1cbiAgfVxuXG4gIC8vIENoYW5nZXMgd2hlcmUgdGhpcyBjb25uZWN0aW9uIHBvaW50c1xuICBfY2hhbmdlVXJsKHVybCkge1xuICAgIHRoaXMuZW5kcG9pbnQgPSB1cmw7XG4gIH1cblxuICBfb25Db25uZWN0KGNsaWVudCkge1xuICAgIGlmIChjbGllbnQgIT09IHRoaXMuY2xpZW50KSB7XG4gICAgICAvLyBUaGlzIGNvbm5lY3Rpb24gaXMgbm90IGZyb20gdGhlIGxhc3QgY2FsbCB0byBfbGF1bmNoQ29ubmVjdGlvbi5cbiAgICAgIC8vIEJ1dCBfbGF1bmNoQ29ubmVjdGlvbiBjYWxscyBfY2xlYW51cCB3aGljaCBjbG9zZXMgcHJldmlvdXMgY29ubmVjdGlvbnMuXG4gICAgICAvLyBJdCdzIG91ciBiZWxpZWYgdGhhdCB0aGlzIHN0aWZsZXMgZnV0dXJlICdvcGVuJyBldmVudHMsIGJ1dCBtYXliZVxuICAgICAgLy8gd2UgYXJlIHdyb25nP1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdHb3Qgb3BlbiBmcm9tIGluYWN0aXZlIGNsaWVudCAnICsgISF0aGlzLmNsaWVudCk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX2ZvcmNlZFRvRGlzY29ubmVjdCkge1xuICAgICAgLy8gV2Ugd2VyZSBhc2tlZCB0byBkaXNjb25uZWN0IGJldHdlZW4gdHJ5aW5nIHRvIG9wZW4gdGhlIGNvbm5lY3Rpb24gYW5kXG4gICAgICAvLyBhY3R1YWxseSBvcGVuaW5nIGl0LiBMZXQncyBqdXN0IHByZXRlbmQgdGhpcyBuZXZlciBoYXBwZW5lZC5cbiAgICAgIHRoaXMuY2xpZW50LmNsb3NlKCk7XG4gICAgICB0aGlzLmNsaWVudCA9IG51bGw7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuY3VycmVudFN0YXR1cy5jb25uZWN0ZWQpIHtcbiAgICAgIC8vIFdlIGFscmVhZHkgaGF2ZSBhIGNvbm5lY3Rpb24uIEl0IG11c3QgaGF2ZSBiZWVuIHRoZSBjYXNlIHRoYXQgd2VcbiAgICAgIC8vIHN0YXJ0ZWQgdHdvIHBhcmFsbGVsIGNvbm5lY3Rpb24gYXR0ZW1wdHMgKGJlY2F1c2Ugd2Ugd2FudGVkIHRvXG4gICAgICAvLyAncmVjb25uZWN0IG5vdycgb24gYSBoYW5naW5nIGNvbm5lY3Rpb24gYW5kIHdlIGhhZCBubyB3YXkgdG8gY2FuY2VsIHRoZVxuICAgICAgLy8gY29ubmVjdGlvbiBhdHRlbXB0LikgQnV0IHRoaXMgc2hvdWxkbid0IGhhcHBlbiAoc2ltaWxhcmx5IHRvIHRoZSBjbGllbnRcbiAgICAgIC8vICE9PSB0aGlzLmNsaWVudCBjaGVjayBhYm92ZSkuXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1R3byBwYXJhbGxlbCBjb25uZWN0aW9ucz8nKTtcbiAgICB9XG5cbiAgICB0aGlzLl9jbGVhckNvbm5lY3Rpb25UaW1lcigpO1xuXG4gICAgLy8gdXBkYXRlIHN0YXR1c1xuICAgIHRoaXMuY3VycmVudFN0YXR1cy5zdGF0dXMgPSAnY29ubmVjdGVkJztcbiAgICB0aGlzLmN1cnJlbnRTdGF0dXMuY29ubmVjdGVkID0gdHJ1ZTtcbiAgICB0aGlzLmN1cnJlbnRTdGF0dXMucmV0cnlDb3VudCA9IDA7XG4gICAgdGhpcy5zdGF0dXNDaGFuZ2VkKCk7XG5cbiAgICAvLyBmaXJlIHJlc2V0cy4gVGhpcyBtdXN0IGNvbWUgYWZ0ZXIgc3RhdHVzIGNoYW5nZSBzbyB0aGF0IGNsaWVudHNcbiAgICAvLyBjYW4gY2FsbCBzZW5kIGZyb20gd2l0aGluIGEgcmVzZXQgY2FsbGJhY2suXG4gICAgdGhpcy5mb3JFYWNoQ2FsbGJhY2soJ3Jlc2V0JywgY2FsbGJhY2sgPT4ge1xuICAgICAgY2FsbGJhY2soKTtcbiAgICB9KTtcbiAgfVxuXG4gIF9jbGVhbnVwKG1heWJlRXJyb3IpIHtcbiAgICB0aGlzLl9jbGVhckNvbm5lY3Rpb25UaW1lcigpO1xuICAgIGlmICh0aGlzLmNsaWVudCkge1xuICAgICAgdmFyIGNsaWVudCA9IHRoaXMuY2xpZW50O1xuICAgICAgdGhpcy5jbGllbnQgPSBudWxsO1xuICAgICAgY2xpZW50LmNsb3NlKCk7XG5cbiAgICAgIHRoaXMuZm9yRWFjaENhbGxiYWNrKCdkaXNjb25uZWN0JywgY2FsbGJhY2sgPT4ge1xuICAgICAgICBjYWxsYmFjayhtYXliZUVycm9yKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIF9jbGVhckNvbm5lY3Rpb25UaW1lcigpIHtcbiAgICBpZiAodGhpcy5jb25uZWN0aW9uVGltZXIpIHtcbiAgICAgIGNsZWFyVGltZW91dCh0aGlzLmNvbm5lY3Rpb25UaW1lcik7XG4gICAgICB0aGlzLmNvbm5lY3Rpb25UaW1lciA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgX2dldFByb3h5VXJsKHRhcmdldFVybCkge1xuICAgIC8vIFNpbWlsYXIgdG8gY29kZSBpbiB0b29scy9odHRwLWhlbHBlcnMuanMuXG4gICAgdmFyIHByb3h5ID0gcHJvY2Vzcy5lbnYuSFRUUF9QUk9YWSB8fCBwcm9jZXNzLmVudi5odHRwX3Byb3h5IHx8IG51bGw7XG4gICAgdmFyIG5vcHJveHkgPSBwcm9jZXNzLmVudi5OT19QUk9YWSB8fCBwcm9jZXNzLmVudi5ub19wcm94eSB8fCBudWxsO1xuICAgIC8vIGlmIHdlJ3JlIGdvaW5nIHRvIGEgc2VjdXJlIHVybCwgdHJ5IHRoZSBodHRwc19wcm94eSBlbnYgdmFyaWFibGUgZmlyc3QuXG4gICAgaWYgKHRhcmdldFVybC5tYXRjaCgvXndzczovKcKgfHwgdGFyZ2V0VXJsLm1hdGNoKC9eaHR0cHM6LykpIHtcbiAgICAgIHByb3h5ID0gcHJvY2Vzcy5lbnYuSFRUUFNfUFJPWFkgfHwgcHJvY2Vzcy5lbnYuaHR0cHNfcHJveHkgfHwgcHJveHk7XG4gICAgfVxuICAgIGlmICh0YXJnZXRVcmwuaW5kZXhPZignbG9jYWxob3N0JykgIT0gLTEgfHzCoHRhcmdldFVybC5pbmRleE9mKCcxMjcuMC4wLjEnKSAhPSAtMSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGlmIChub3Byb3h5KSB7XG4gICAgICBmb3IgKGxldCBpdGVtIG9mIG5vcHJveHkuc3BsaXQoJywnKSkge1xuICAgICAgICBpZiAodGFyZ2V0VXJsLmluZGV4T2YoaXRlbS50cmltKCkucmVwbGFjZSgvXFwqLywgJycpKSAhPT0gLTEpIHtcbiAgICAgICAgICBwcm94eSA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHByb3h5O1xuICB9XG5cbiAgX2xhdW5jaENvbm5lY3Rpb24oKSB7XG4gICAgdGhpcy5fY2xlYW51cCgpOyAvLyBjbGVhbnVwIHRoZSBvbGQgc29ja2V0LCBpZiB0aGVyZSB3YXMgb25lLlxuXG4gICAgLy8gU2luY2Ugc2VydmVyLXRvLXNlcnZlciBERFAgaXMgc3RpbGwgYW4gZXhwZXJpbWVudGFsIGZlYXR1cmUsIHdlIG9ubHlcbiAgICAvLyByZXF1aXJlIHRoZSBtb2R1bGUgaWYgd2UgYWN0dWFsbHkgY3JlYXRlIGEgc2VydmVyLXRvLXNlcnZlclxuICAgIC8vIGNvbm5lY3Rpb24uXG4gICAgdmFyIEZheWVXZWJTb2NrZXQgPSBOcG0ucmVxdWlyZSgnZmF5ZS13ZWJzb2NrZXQnKTtcbiAgICB2YXIgZGVmbGF0ZSA9IE5wbS5yZXF1aXJlKCdwZXJtZXNzYWdlLWRlZmxhdGUyJyk7XG5cbiAgICB2YXIgdGFyZ2V0VXJsID0gdG9XZWJzb2NrZXRVcmwodGhpcy5lbmRwb2ludCk7XG4gICAgdmFyIGZheWVPcHRpb25zID0ge1xuICAgICAgaGVhZGVyczogdGhpcy5oZWFkZXJzLFxuICAgICAgZXh0ZW5zaW9uczogW2RlZmxhdGVdXG4gICAgfTtcbiAgICBmYXllT3B0aW9ucyA9IE9iamVjdC5hc3NpZ24oZmF5ZU9wdGlvbnMsIHRoaXMubnBtRmF5ZU9wdGlvbnMpO1xuICAgIHZhciBwcm94eVVybCA9IHRoaXMuX2dldFByb3h5VXJsKHRhcmdldFVybCk7XG4gICAgaWYgKHByb3h5VXJsKSB7XG4gICAgICBmYXllT3B0aW9ucy5wcm94eSA9IHsgb3JpZ2luOiBwcm94eVVybCB9O1xuICAgIH1cblxuICAgIC8vIFdlIHdvdWxkIGxpa2UgdG8gc3BlY2lmeSAnZGRwJyBhcyB0aGUgc3VicHJvdG9jb2wgaGVyZS4gVGhlIG5wbSBtb2R1bGUgd2VcbiAgICAvLyB1c2VkIHRvIHVzZSBhcyBhIGNsaWVudCB3b3VsZCBmYWlsIHRoZSBoYW5kc2hha2UgaWYgd2UgYXNrIGZvciBhXG4gICAgLy8gc3VicHJvdG9jb2wgYW5kIHRoZSBzZXJ2ZXIgZG9lc24ndCBzZW5kIG9uZSBiYWNrIChhbmQgc29ja2pzIGRvZXNuJ3QpLlxuICAgIC8vIEZheWUgZG9lc24ndCBoYXZlIHRoYXQgYmVoYXZpb3I7IGl0J3MgdW5jbGVhciBmcm9tIHJlYWRpbmcgUkZDIDY0NTUgaWZcbiAgICAvLyBGYXllIGlzIGVycm9uZW91cyBvciBub3QuICBTbyBmb3Igbm93LCB3ZSBkb24ndCBzcGVjaWZ5IHByb3RvY29scy5cbiAgICB2YXIgc3VicHJvdG9jb2xzID0gW107XG5cbiAgICB2YXIgY2xpZW50ID0gKHRoaXMuY2xpZW50ID0gbmV3IEZheWVXZWJTb2NrZXQuQ2xpZW50KFxuICAgICAgdGFyZ2V0VXJsLFxuICAgICAgc3VicHJvdG9jb2xzLFxuICAgICAgZmF5ZU9wdGlvbnNcbiAgICApKTtcblxuICAgIHRoaXMuX2NsZWFyQ29ubmVjdGlvblRpbWVyKCk7XG4gICAgdGhpcy5jb25uZWN0aW9uVGltZXIgPSBNZXRlb3Iuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB0aGlzLl9sb3N0Q29ubmVjdGlvbihuZXcgdGhpcy5Db25uZWN0aW9uRXJyb3IoJ0REUCBjb25uZWN0aW9uIHRpbWVkIG91dCcpKTtcbiAgICB9LCB0aGlzLkNPTk5FQ1RfVElNRU9VVCk7XG5cbiAgICB0aGlzLmNsaWVudC5vbihcbiAgICAgICdvcGVuJyxcbiAgICAgIE1ldGVvci5iaW5kRW52aXJvbm1lbnQoKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5fb25Db25uZWN0KGNsaWVudCk7XG4gICAgICB9LCAnc3RyZWFtIGNvbm5lY3QgY2FsbGJhY2snKVxuICAgICk7XG5cbiAgICB2YXIgY2xpZW50T25JZkN1cnJlbnQgPSAoZXZlbnQsIGRlc2NyaXB0aW9uLCBjYWxsYmFjaykgPT4ge1xuICAgICAgdGhpcy5jbGllbnQub24oXG4gICAgICAgIGV2ZW50LFxuICAgICAgICBNZXRlb3IuYmluZEVudmlyb25tZW50KCguLi5hcmdzKSA9PiB7XG4gICAgICAgICAgLy8gSWdub3JlIGV2ZW50cyBmcm9tIGFueSBjb25uZWN0aW9uIHdlJ3ZlIGFscmVhZHkgY2xlYW5lZCB1cC5cbiAgICAgICAgICBpZiAoY2xpZW50ICE9PSB0aGlzLmNsaWVudCkgcmV0dXJuO1xuICAgICAgICAgIGNhbGxiYWNrKC4uLmFyZ3MpO1xuICAgICAgICB9LCBkZXNjcmlwdGlvbilcbiAgICAgICk7XG4gICAgfTtcblxuICAgIGNsaWVudE9uSWZDdXJyZW50KCdlcnJvcicsICdzdHJlYW0gZXJyb3IgY2FsbGJhY2snLCBlcnJvciA9PiB7XG4gICAgICBpZiAoIXRoaXMub3B0aW9ucy5fZG9udFByaW50RXJyb3JzKVxuICAgICAgICBNZXRlb3IuX2RlYnVnKCdzdHJlYW0gZXJyb3InLCBlcnJvci5tZXNzYWdlKTtcblxuICAgICAgLy8gRmF5ZSdzICdlcnJvcicgb2JqZWN0IGlzIG5vdCBhIEpTIGVycm9yIChhbmQgYW1vbmcgb3RoZXIgdGhpbmdzLFxuICAgICAgLy8gZG9lc24ndCBzdHJpbmdpZnkgd2VsbCkuIENvbnZlcnQgaXQgdG8gb25lLlxuICAgICAgdGhpcy5fbG9zdENvbm5lY3Rpb24obmV3IHRoaXMuQ29ubmVjdGlvbkVycm9yKGVycm9yLm1lc3NhZ2UpKTtcbiAgICB9KTtcblxuICAgIGNsaWVudE9uSWZDdXJyZW50KCdjbG9zZScsICdzdHJlYW0gY2xvc2UgY2FsbGJhY2snLCAoKSA9PiB7XG4gICAgICB0aGlzLl9sb3N0Q29ubmVjdGlvbigpO1xuICAgIH0pO1xuXG4gICAgY2xpZW50T25JZkN1cnJlbnQoJ21lc3NhZ2UnLCAnc3RyZWFtIG1lc3NhZ2UgY2FsbGJhY2snLCBtZXNzYWdlID0+IHtcbiAgICAgIC8vIElnbm9yZSBiaW5hcnkgZnJhbWVzLCB3aGVyZSBtZXNzYWdlLmRhdGEgaXMgYSBCdWZmZXJcbiAgICAgIGlmICh0eXBlb2YgbWVzc2FnZS5kYXRhICE9PSAnc3RyaW5nJykgcmV0dXJuO1xuXG4gICAgICB0aGlzLmZvckVhY2hDYWxsYmFjaygnbWVzc2FnZScsIGNhbGxiYWNrID0+IHtcbiAgICAgICAgY2FsbGJhY2sobWVzc2FnZS5kYXRhKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG59XG4iLCJpbXBvcnQgeyBSZXRyeSB9IGZyb20gJ21ldGVvci9yZXRyeSc7XG5cbmNvbnN0IGZvcmNlZFJlY29ubmVjdEVycm9yID0gbmV3IEVycm9yKFwiZm9yY2VkIHJlY29ubmVjdFwiKTtcblxuZXhwb3J0IGNsYXNzIFN0cmVhbUNsaWVudENvbW1vbiB7XG4gIGNvbnN0cnVjdG9yKG9wdGlvbnMpIHtcbiAgICB0aGlzLm9wdGlvbnMgPSB7XG4gICAgICByZXRyeTogdHJ1ZSxcbiAgICAgIC4uLihvcHRpb25zIHx8IG51bGwpLFxuICAgIH07XG5cbiAgICB0aGlzLkNvbm5lY3Rpb25FcnJvciA9XG4gICAgICBvcHRpb25zICYmIG9wdGlvbnMuQ29ubmVjdGlvbkVycm9yIHx8IEVycm9yO1xuICB9XG5cbiAgLy8gUmVnaXN0ZXIgZm9yIGNhbGxiYWNrcy5cbiAgb24obmFtZSwgY2FsbGJhY2spIHtcbiAgICBpZiAobmFtZSAhPT0gJ21lc3NhZ2UnICYmIG5hbWUgIT09ICdyZXNldCcgJiYgbmFtZSAhPT0gJ2Rpc2Nvbm5lY3QnKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKCd1bmtub3duIGV2ZW50IHR5cGU6ICcgKyBuYW1lKTtcblxuICAgIGlmICghdGhpcy5ldmVudENhbGxiYWNrc1tuYW1lXSkgdGhpcy5ldmVudENhbGxiYWNrc1tuYW1lXSA9IFtdO1xuICAgIHRoaXMuZXZlbnRDYWxsYmFja3NbbmFtZV0ucHVzaChjYWxsYmFjayk7XG4gIH1cblxuICBmb3JFYWNoQ2FsbGJhY2sobmFtZSwgY2IpIHtcbiAgICBpZiAoIXRoaXMuZXZlbnRDYWxsYmFja3NbbmFtZV0gfHwgIXRoaXMuZXZlbnRDYWxsYmFja3NbbmFtZV0ubGVuZ3RoKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5ldmVudENhbGxiYWNrc1tuYW1lXS5mb3JFYWNoKGNiKTtcbiAgfVxuXG4gIF9pbml0Q29tbW9uKG9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCBPYmplY3QuY3JlYXRlKG51bGwpO1xuXG4gICAgLy8vLyBDb25zdGFudHNcblxuICAgIC8vIGhvdyBsb25nIHRvIHdhaXQgdW50aWwgd2UgZGVjbGFyZSB0aGUgY29ubmVjdGlvbiBhdHRlbXB0XG4gICAgLy8gZmFpbGVkLlxuICAgIHRoaXMuQ09OTkVDVF9USU1FT1VUID0gb3B0aW9ucy5jb25uZWN0VGltZW91dE1zIHx8IDEwMDAwO1xuXG4gICAgdGhpcy5ldmVudENhbGxiYWNrcyA9IE9iamVjdC5jcmVhdGUobnVsbCk7IC8vIG5hbWUgLT4gW2NhbGxiYWNrXVxuXG4gICAgdGhpcy5fZm9yY2VkVG9EaXNjb25uZWN0ID0gZmFsc2U7XG5cbiAgICAvLy8vIFJlYWN0aXZlIHN0YXR1c1xuICAgIHRoaXMuY3VycmVudFN0YXR1cyA9IHtcbiAgICAgIHN0YXR1czogJ2Nvbm5lY3RpbmcnLFxuICAgICAgY29ubmVjdGVkOiBmYWxzZSxcbiAgICAgIHJldHJ5Q291bnQ6IDBcbiAgICB9O1xuXG4gICAgaWYgKFBhY2thZ2UudHJhY2tlcikge1xuICAgICAgdGhpcy5zdGF0dXNMaXN0ZW5lcnMgPSBuZXcgUGFja2FnZS50cmFja2VyLlRyYWNrZXIuRGVwZW5kZW5jeSgpO1xuICAgIH1cblxuICAgIHRoaXMuc3RhdHVzQ2hhbmdlZCA9ICgpID0+IHtcbiAgICAgIGlmICh0aGlzLnN0YXR1c0xpc3RlbmVycykge1xuICAgICAgICB0aGlzLnN0YXR1c0xpc3RlbmVycy5jaGFuZ2VkKCk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIC8vLy8gUmV0cnkgbG9naWNcbiAgICB0aGlzLl9yZXRyeSA9IG5ldyBSZXRyeSgpO1xuICAgIHRoaXMuY29ubmVjdGlvblRpbWVyID0gbnVsbDtcbiAgfVxuXG4gIC8vIFRyaWdnZXIgYSByZWNvbm5lY3QuXG4gIHJlY29ubmVjdChvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwgT2JqZWN0LmNyZWF0ZShudWxsKTtcblxuICAgIGlmIChvcHRpb25zLnVybCkge1xuICAgICAgdGhpcy5fY2hhbmdlVXJsKG9wdGlvbnMudXJsKTtcbiAgICB9XG5cbiAgICBpZiAob3B0aW9ucy5fc29ja2pzT3B0aW9ucykge1xuICAgICAgdGhpcy5vcHRpb25zLl9zb2NranNPcHRpb25zID0gb3B0aW9ucy5fc29ja2pzT3B0aW9ucztcbiAgICB9XG5cbiAgICBpZiAodGhpcy5jdXJyZW50U3RhdHVzLmNvbm5lY3RlZCkge1xuICAgICAgaWYgKG9wdGlvbnMuX2ZvcmNlIHx8IG9wdGlvbnMudXJsKSB7XG4gICAgICAgIHRoaXMuX2xvc3RDb25uZWN0aW9uKGZvcmNlZFJlY29ubmVjdEVycm9yKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBpZiB3ZSdyZSBtaWQtY29ubmVjdGlvbiwgc3RvcCBpdC5cbiAgICBpZiAodGhpcy5jdXJyZW50U3RhdHVzLnN0YXR1cyA9PT0gJ2Nvbm5lY3RpbmcnKSB7XG4gICAgICAvLyBQcmV0ZW5kIGl0J3MgYSBjbGVhbiBjbG9zZS5cbiAgICAgIHRoaXMuX2xvc3RDb25uZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgdGhpcy5fcmV0cnkuY2xlYXIoKTtcbiAgICB0aGlzLmN1cnJlbnRTdGF0dXMucmV0cnlDb3VudCAtPSAxOyAvLyBkb24ndCBjb3VudCBtYW51YWwgcmV0cmllc1xuICAgIHRoaXMuX3JldHJ5Tm93KCk7XG4gIH1cblxuICBkaXNjb25uZWN0KG9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCBPYmplY3QuY3JlYXRlKG51bGwpO1xuXG4gICAgLy8gRmFpbGVkIGlzIHBlcm1hbmVudC4gSWYgd2UncmUgZmFpbGVkLCBkb24ndCBsZXQgcGVvcGxlIGdvIGJhY2tcbiAgICAvLyBvbmxpbmUgYnkgY2FsbGluZyAnZGlzY29ubmVjdCcgdGhlbiAncmVjb25uZWN0Jy5cbiAgICBpZiAodGhpcy5fZm9yY2VkVG9EaXNjb25uZWN0KSByZXR1cm47XG5cbiAgICAvLyBJZiBfcGVybWFuZW50IGlzIHNldCwgcGVybWFuZW50bHkgZGlzY29ubmVjdCBhIHN0cmVhbS4gT25jZSBhIHN0cmVhbVxuICAgIC8vIGlzIGZvcmNlZCB0byBkaXNjb25uZWN0LCBpdCBjYW4gbmV2ZXIgcmVjb25uZWN0LiBUaGlzIGlzIGZvclxuICAgIC8vIGVycm9yIGNhc2VzIHN1Y2ggYXMgZGRwIHZlcnNpb24gbWlzbWF0Y2gsIHdoZXJlIHRyeWluZyBhZ2FpblxuICAgIC8vIHdvbid0IGZpeCB0aGUgcHJvYmxlbS5cbiAgICBpZiAob3B0aW9ucy5fcGVybWFuZW50KSB7XG4gICAgICB0aGlzLl9mb3JjZWRUb0Rpc2Nvbm5lY3QgPSB0cnVlO1xuICAgIH1cblxuICAgIHRoaXMuX2NsZWFudXAoKTtcbiAgICB0aGlzLl9yZXRyeS5jbGVhcigpO1xuXG4gICAgdGhpcy5jdXJyZW50U3RhdHVzID0ge1xuICAgICAgc3RhdHVzOiBvcHRpb25zLl9wZXJtYW5lbnQgPyAnZmFpbGVkJyA6ICdvZmZsaW5lJyxcbiAgICAgIGNvbm5lY3RlZDogZmFsc2UsXG4gICAgICByZXRyeUNvdW50OiAwXG4gICAgfTtcblxuICAgIGlmIChvcHRpb25zLl9wZXJtYW5lbnQgJiYgb3B0aW9ucy5fZXJyb3IpXG4gICAgICB0aGlzLmN1cnJlbnRTdGF0dXMucmVhc29uID0gb3B0aW9ucy5fZXJyb3I7XG5cbiAgICB0aGlzLnN0YXR1c0NoYW5nZWQoKTtcbiAgfVxuXG4gIC8vIG1heWJlRXJyb3IgaXMgc2V0IHVubGVzcyBpdCdzIGEgY2xlYW4gcHJvdG9jb2wtbGV2ZWwgY2xvc2UuXG4gIF9sb3N0Q29ubmVjdGlvbihtYXliZUVycm9yKSB7XG4gICAgdGhpcy5fY2xlYW51cChtYXliZUVycm9yKTtcbiAgICB0aGlzLl9yZXRyeUxhdGVyKG1heWJlRXJyb3IpOyAvLyBzZXRzIHN0YXR1cy4gbm8gbmVlZCB0byBkbyBpdCBoZXJlLlxuICB9XG5cbiAgLy8gZmlyZWQgd2hlbiB3ZSBkZXRlY3QgdGhhdCB3ZSd2ZSBnb25lIG9ubGluZS4gdHJ5IHRvIHJlY29ubmVjdFxuICAvLyBpbW1lZGlhdGVseS5cbiAgX29ubGluZSgpIHtcbiAgICAvLyBpZiB3ZSd2ZSByZXF1ZXN0ZWQgdG8gYmUgb2ZmbGluZSBieSBkaXNjb25uZWN0aW5nLCBkb24ndCByZWNvbm5lY3QuXG4gICAgaWYgKHRoaXMuY3VycmVudFN0YXR1cy5zdGF0dXMgIT0gJ29mZmxpbmUnKSB0aGlzLnJlY29ubmVjdCgpO1xuICB9XG5cbiAgX3JldHJ5TGF0ZXIobWF5YmVFcnJvcikge1xuICAgIHZhciB0aW1lb3V0ID0gMDtcbiAgICBpZiAodGhpcy5vcHRpb25zLnJldHJ5IHx8XG4gICAgICAgIG1heWJlRXJyb3IgPT09IGZvcmNlZFJlY29ubmVjdEVycm9yKSB7XG4gICAgICB0aW1lb3V0ID0gdGhpcy5fcmV0cnkucmV0cnlMYXRlcihcbiAgICAgICAgdGhpcy5jdXJyZW50U3RhdHVzLnJldHJ5Q291bnQsXG4gICAgICAgIHRoaXMuX3JldHJ5Tm93LmJpbmQodGhpcylcbiAgICAgICk7XG4gICAgICB0aGlzLmN1cnJlbnRTdGF0dXMuc3RhdHVzID0gJ3dhaXRpbmcnO1xuICAgICAgdGhpcy5jdXJyZW50U3RhdHVzLnJldHJ5VGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpICsgdGltZW91dDtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5jdXJyZW50U3RhdHVzLnN0YXR1cyA9ICdmYWlsZWQnO1xuICAgICAgZGVsZXRlIHRoaXMuY3VycmVudFN0YXR1cy5yZXRyeVRpbWU7XG4gICAgfVxuXG4gICAgdGhpcy5jdXJyZW50U3RhdHVzLmNvbm5lY3RlZCA9IGZhbHNlO1xuICAgIHRoaXMuc3RhdHVzQ2hhbmdlZCgpO1xuICB9XG5cbiAgX3JldHJ5Tm93KCkge1xuICAgIGlmICh0aGlzLl9mb3JjZWRUb0Rpc2Nvbm5lY3QpIHJldHVybjtcblxuICAgIHRoaXMuY3VycmVudFN0YXR1cy5yZXRyeUNvdW50ICs9IDE7XG4gICAgdGhpcy5jdXJyZW50U3RhdHVzLnN0YXR1cyA9ICdjb25uZWN0aW5nJztcbiAgICB0aGlzLmN1cnJlbnRTdGF0dXMuY29ubmVjdGVkID0gZmFsc2U7XG4gICAgZGVsZXRlIHRoaXMuY3VycmVudFN0YXR1cy5yZXRyeVRpbWU7XG4gICAgdGhpcy5zdGF0dXNDaGFuZ2VkKCk7XG5cbiAgICB0aGlzLl9sYXVuY2hDb25uZWN0aW9uKCk7XG4gIH1cblxuICAvLyBHZXQgY3VycmVudCBzdGF0dXMuIFJlYWN0aXZlLlxuICBzdGF0dXMoKSB7XG4gICAgaWYgKHRoaXMuc3RhdHVzTGlzdGVuZXJzKSB7XG4gICAgICB0aGlzLnN0YXR1c0xpc3RlbmVycy5kZXBlbmQoKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuY3VycmVudFN0YXR1cztcbiAgfVxufVxuIiwiaW1wb3J0IHsgTWV0ZW9yIH0gZnJvbSBcIm1ldGVvci9tZXRlb3JcIjtcblxuLy8gQHBhcmFtIHVybCB7U3RyaW5nfSBVUkwgdG8gTWV0ZW9yIGFwcCwgZWc6XG4vLyAgIFwiL1wiIG9yIFwibWFkZXdpdGgubWV0ZW9yLmNvbVwiIG9yIFwiaHR0cHM6Ly9mb28ubWV0ZW9yLmNvbVwiXG4vLyAgIG9yIFwiZGRwK3NvY2tqczovL2RkcC0tKioqKi1mb28ubWV0ZW9yLmNvbS9zb2NranNcIlxuLy8gQHJldHVybnMge1N0cmluZ30gVVJMIHRvIHRoZSBlbmRwb2ludCB3aXRoIHRoZSBzcGVjaWZpYyBzY2hlbWUgYW5kIHN1YlBhdGgsIGUuZy5cbi8vIGZvciBzY2hlbWUgXCJodHRwXCIgYW5kIHN1YlBhdGggXCJzb2NranNcIlxuLy8gICBcImh0dHA6Ly9zdWJkb21haW4ubWV0ZW9yLmNvbS9zb2NranNcIiBvciBcIi9zb2NranNcIlxuLy8gICBvciBcImh0dHBzOi8vZGRwLS0xMjM0LWZvby5tZXRlb3IuY29tL3NvY2tqc1wiXG5mdW5jdGlvbiB0cmFuc2xhdGVVcmwodXJsLCBuZXdTY2hlbWVCYXNlLCBzdWJQYXRoKSB7XG4gIGlmICghbmV3U2NoZW1lQmFzZSkge1xuICAgIG5ld1NjaGVtZUJhc2UgPSAnaHR0cCc7XG4gIH1cblxuICBpZiAoc3ViUGF0aCAhPT0gXCJzb2NranNcIiAmJiB1cmwuc3RhcnRzV2l0aChcIi9cIikpIHtcbiAgICB1cmwgPSBNZXRlb3IuYWJzb2x1dGVVcmwodXJsLnN1YnN0cigxKSk7XG4gIH1cblxuICB2YXIgZGRwVXJsTWF0Y2ggPSB1cmwubWF0Y2goL15kZHAoaT8pXFwrc29ja2pzOlxcL1xcLy8pO1xuICB2YXIgaHR0cFVybE1hdGNoID0gdXJsLm1hdGNoKC9eaHR0cChzPyk6XFwvXFwvLyk7XG4gIHZhciBuZXdTY2hlbWU7XG4gIGlmIChkZHBVcmxNYXRjaCkge1xuICAgIC8vIFJlbW92ZSBzY2hlbWUgYW5kIHNwbGl0IG9mZiB0aGUgaG9zdC5cbiAgICB2YXIgdXJsQWZ0ZXJERFAgPSB1cmwuc3Vic3RyKGRkcFVybE1hdGNoWzBdLmxlbmd0aCk7XG4gICAgbmV3U2NoZW1lID0gZGRwVXJsTWF0Y2hbMV0gPT09ICdpJyA/IG5ld1NjaGVtZUJhc2UgOiBuZXdTY2hlbWVCYXNlICsgJ3MnO1xuICAgIHZhciBzbGFzaFBvcyA9IHVybEFmdGVyRERQLmluZGV4T2YoJy8nKTtcbiAgICB2YXIgaG9zdCA9IHNsYXNoUG9zID09PSAtMSA/IHVybEFmdGVyRERQIDogdXJsQWZ0ZXJERFAuc3Vic3RyKDAsIHNsYXNoUG9zKTtcbiAgICB2YXIgcmVzdCA9IHNsYXNoUG9zID09PSAtMSA/ICcnIDogdXJsQWZ0ZXJERFAuc3Vic3RyKHNsYXNoUG9zKTtcblxuICAgIC8vIEluIHRoZSBob3N0IChPTkxZISksIGNoYW5nZSAnKicgY2hhcmFjdGVycyBpbnRvIHJhbmRvbSBkaWdpdHMuIFRoaXNcbiAgICAvLyBhbGxvd3MgZGlmZmVyZW50IHN0cmVhbSBjb25uZWN0aW9ucyB0byBjb25uZWN0IHRvIGRpZmZlcmVudCBob3N0bmFtZXNcbiAgICAvLyBhbmQgYXZvaWQgYnJvd3NlciBwZXItaG9zdG5hbWUgY29ubmVjdGlvbiBsaW1pdHMuXG4gICAgaG9zdCA9IGhvc3QucmVwbGFjZSgvXFwqL2csICgpID0+IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwKSk7XG5cbiAgICByZXR1cm4gbmV3U2NoZW1lICsgJzovLycgKyBob3N0ICsgcmVzdDtcbiAgfSBlbHNlIGlmIChodHRwVXJsTWF0Y2gpIHtcbiAgICBuZXdTY2hlbWUgPSAhaHR0cFVybE1hdGNoWzFdID8gbmV3U2NoZW1lQmFzZSA6IG5ld1NjaGVtZUJhc2UgKyAncyc7XG4gICAgdmFyIHVybEFmdGVySHR0cCA9IHVybC5zdWJzdHIoaHR0cFVybE1hdGNoWzBdLmxlbmd0aCk7XG4gICAgdXJsID0gbmV3U2NoZW1lICsgJzovLycgKyB1cmxBZnRlckh0dHA7XG4gIH1cblxuICAvLyBQcmVmaXggRlFETnMgYnV0IG5vdCByZWxhdGl2ZSBVUkxzXG4gIGlmICh1cmwuaW5kZXhPZignOi8vJykgPT09IC0xICYmICF1cmwuc3RhcnRzV2l0aCgnLycpKSB7XG4gICAgdXJsID0gbmV3U2NoZW1lQmFzZSArICc6Ly8nICsgdXJsO1xuICB9XG5cbiAgLy8gWFhYIFRoaXMgaXMgbm90IHdoYXQgd2Ugc2hvdWxkIGJlIGRvaW5nOiBpZiBJIGhhdmUgYSBzaXRlXG4gIC8vIGRlcGxveWVkIGF0IFwiL2Zvb1wiLCB0aGVuIEREUC5jb25uZWN0KFwiL1wiKSBzaG91bGQgYWN0dWFsbHkgY29ubmVjdFxuICAvLyB0byBcIi9cIiwgbm90IHRvIFwiL2Zvb1wiLiBcIi9cIiBpcyBhbiBhYnNvbHV0ZSBwYXRoLiAoQ29udHJhc3Q6IGlmXG4gIC8vIGRlcGxveWVkIGF0IFwiL2Zvb1wiLCBpdCB3b3VsZCBiZSByZWFzb25hYmxlIGZvciBERFAuY29ubmVjdChcImJhclwiKVxuICAvLyB0byBjb25uZWN0IHRvIFwiL2Zvby9iYXJcIikuXG4gIC8vXG4gIC8vIFdlIHNob3VsZCBtYWtlIHRoaXMgcHJvcGVybHkgaG9ub3IgYWJzb2x1dGUgcGF0aHMgcmF0aGVyIHRoYW5cbiAgLy8gZm9yY2luZyB0aGUgcGF0aCB0byBiZSByZWxhdGl2ZSB0byB0aGUgc2l0ZSByb290LiBTaW11bHRhbmVvdXNseSxcbiAgLy8gd2Ugc2hvdWxkIHNldCBERFBfREVGQVVMVF9DT05ORUNUSU9OX1VSTCB0byBpbmNsdWRlIHRoZSBzaXRlXG4gIC8vIHJvb3QuIFNlZSBhbHNvIGNsaWVudF9jb252ZW5pZW5jZS5qcyAjUmF0aW9uYWxpemluZ1JlbGF0aXZlRERQVVJMc1xuICB1cmwgPSBNZXRlb3IuX3JlbGF0aXZlVG9TaXRlUm9vdFVybCh1cmwpO1xuXG4gIGlmICh1cmwuZW5kc1dpdGgoJy8nKSkgcmV0dXJuIHVybCArIHN1YlBhdGg7XG4gIGVsc2UgcmV0dXJuIHVybCArICcvJyArIHN1YlBhdGg7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b1NvY2tqc1VybCh1cmwpIHtcbiAgcmV0dXJuIHRyYW5zbGF0ZVVybCh1cmwsICdodHRwJywgJ3NvY2tqcycpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9XZWJzb2NrZXRVcmwodXJsKSB7XG4gIHJldHVybiB0cmFuc2xhdGVVcmwodXJsLCAnd3MnLCAnd2Vic29ja2V0Jyk7XG59XG4iXX0=
