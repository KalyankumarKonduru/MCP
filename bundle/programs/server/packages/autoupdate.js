Package["core-runtime"].queue("autoupdate",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;
var WebApp = Package.webapp.WebApp;
var WebAppInternals = Package.webapp.WebAppInternals;
var main = Package.webapp.main;
var check = Package.check.check;
var Match = Package.check.Match;
var ECMAScript = Package.ecmascript.ECMAScript;
var DDP = Package['ddp-client'].DDP;
var DDPServer = Package['ddp-server'].DDPServer;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var Autoupdate;

var require = meteorInstall({"node_modules":{"meteor":{"autoupdate":{"autoupdate_server.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// packages/autoupdate/autoupdate_server.js                                                                       //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
    module1.export({
      Autoupdate: () => Autoupdate
    });
    let onMessage;
    module1.link("meteor/inter-process-messaging", {
      onMessage(v) {
        onMessage = v;
      }
    }, 0);
    let ClientVersions;
    module1.link("./client_versions.js", {
      ClientVersions(v) {
        ClientVersions = v;
      }
    }, 1);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    const Autoupdate = __meteor_runtime_config__.autoupdate = {
      // Map from client architectures (web.browser, web.browser.legacy,
      // web.cordova) to version fields { version, versionRefreshable,
      // versionNonRefreshable, refreshable } that will be stored in
      // ClientVersions documents (whose IDs are client architectures). This
      // data gets serialized into the boilerplate because it's stored in
      // __meteor_runtime_config__.autoupdate.versions.
      versions: {}
    };
    // Stores acceptable client versions.
    const clientVersions = new ClientVersions();

    // The client hash includes __meteor_runtime_config__, so wait until
    // all packages have loaded and have had a chance to populate the
    // runtime config before using the client hash as our default auto
    // update version id.

    // Note: Tests allow people to override Autoupdate.autoupdateVersion before
    // startup.
    Autoupdate.autoupdateVersion = null;
    Autoupdate.autoupdateVersionRefreshable = null;
    Autoupdate.autoupdateVersionCordova = null;
    Autoupdate.appId = __meteor_runtime_config__.appId = process.env.APP_ID;
    var syncQueue = new Meteor._AsynchronousQueue();
    async function updateVersions(shouldReloadClientProgram) {
      // Step 1: load the current client program on the server
      if (shouldReloadClientProgram) {
        await WebAppInternals.reloadClientPrograms();
      }
      const {
        // If the AUTOUPDATE_VERSION environment variable is defined, it takes
        // precedence, but Autoupdate.autoupdateVersion is still supported as
        // a fallback. In most cases neither of these values will be defined.
        AUTOUPDATE_VERSION = Autoupdate.autoupdateVersion
      } = process.env;

      // Step 2: update __meteor_runtime_config__.autoupdate.versions.
      const clientArchs = Object.keys(WebApp.clientPrograms);
      clientArchs.forEach(arch => {
        Autoupdate.versions[arch] = {
          version: AUTOUPDATE_VERSION || WebApp.calculateClientHash(arch),
          versionRefreshable: AUTOUPDATE_VERSION || WebApp.calculateClientHashRefreshable(arch),
          versionNonRefreshable: AUTOUPDATE_VERSION || WebApp.calculateClientHashNonRefreshable(arch),
          versionReplaceable: AUTOUPDATE_VERSION || WebApp.calculateClientHashReplaceable(arch),
          versionHmr: WebApp.clientPrograms[arch].hmrVersion
        };
      });

      // Step 3: form the new client boilerplate which contains the updated
      // assets and __meteor_runtime_config__.
      if (shouldReloadClientProgram) {
        await WebAppInternals.generateBoilerplate();
      }

      // Step 4: update the ClientVersions collection.
      // We use `onListening` here because we need to use
      // `WebApp.getRefreshableAssets`, which is only set after
      // `WebApp.generateBoilerplate` is called by `main` in webapp.
      WebApp.onListening(() => {
        clientArchs.forEach(arch => {
          const payload = _objectSpread(_objectSpread({}, Autoupdate.versions[arch]), {}, {
            assets: WebApp.getRefreshableAssets(arch)
          });
          clientVersions.set(arch, payload);
        });
      });
    }
    Meteor.publish("meteor_autoupdate_clientVersions", function (appId) {
      // `null` happens when a client doesn't have an appId and passes
      // `undefined` to `Meteor.subscribe`. `undefined` is translated to
      // `null` as JSON doesn't have `undefined.
      check(appId, Match.OneOf(String, undefined, null));

      // Don't notify clients using wrong appId such as mobile apps built with a
      // different server but pointing at the same local url
      if (Autoupdate.appId && appId && Autoupdate.appId !== appId) return [];
      const stop = clientVersions.watch((version, isNew) => {
        (isNew ? this.added : this.changed).call(this, "meteor_autoupdate_clientVersions", version._id, version);
      });
      this.onStop(() => stop());
      this.ready();
    }, {
      is_auto: true
    });
    Meteor.startup(async function () {
      await updateVersions(false);

      // Force any connected clients that are still looking for these older
      // document IDs to reload.
      ["version", "version-refreshable", "version-cordova"].forEach(_id => {
        clientVersions.set(_id, {
          version: "outdated"
        });
      });
    });
    function enqueueVersionsRefresh() {
      syncQueue.queueTask(async function () {
        await updateVersions(true);
      });
    }
    const setupListeners = () => {
      // Listen for messages pertaining to the client-refresh topic.
      onMessage("client-refresh", enqueueVersionsRefresh);

      // Another way to tell the process to refresh: send SIGHUP signal
      process.on('SIGHUP', Meteor.bindEnvironment(function () {
        enqueueVersionsRefresh();
      }, "handling SIGHUP signal for refresh"));
    };
    if (Meteor._isFibersEnabled) {
      var Future = Npm.require("fibers/future");
      var fut = new Future();

      // We only want 'refresh' to trigger 'updateVersions' AFTER onListen,
      // so we add a queued task that waits for onListen before 'refresh' can queue
      // tasks. Note that the `onListening` callbacks do not fire until after
      // Meteor.startup, so there is no concern that the 'updateVersions' calls from
      // 'refresh' will overlap with the `updateVersions` call from Meteor.startup.

      syncQueue.queueTask(function () {
        fut.wait();
      });
      WebApp.onListening(function () {
        fut.return();
      });
      setupListeners();
    } else {
      WebApp.onListening(function () {
        Promise.resolve(setupListeners());
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
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"client_versions.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// packages/autoupdate/client_versions.js                                                                         //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
      ClientVersions: () => ClientVersions
    });
    let Tracker;
    module.link("meteor/tracker", {
      Tracker(v) {
        Tracker = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    class ClientVersions {
      constructor() {
        this._versions = new Map();
        this._watchCallbacks = new Set();
      }

      // Creates a Livedata store for use with `Meteor.connection.registerStore`.
      // After the store is registered, document updates reported by Livedata are
      // merged with the documents in this `ClientVersions` instance.
      createStore() {
        return {
          update: _ref => {
            let {
              id,
              msg,
              fields
            } = _ref;
            if (msg === "added" || msg === "changed") {
              this.set(id, fields);
            }
          }
        };
      }
      hasVersions() {
        return this._versions.size > 0;
      }
      get(id) {
        return this._versions.get(id);
      }

      // Adds or updates a version document and invokes registered callbacks for the
      // added/updated document. If a document with the given ID already exists, its
      // fields are merged with `fields`.
      set(id, fields) {
        let version = this._versions.get(id);
        let isNew = false;
        if (version) {
          Object.assign(version, fields);
        } else {
          version = _objectSpread({
            _id: id
          }, fields);
          isNew = true;
          this._versions.set(id, version);
        }
        this._watchCallbacks.forEach(_ref2 => {
          let {
            fn,
            filter
          } = _ref2;
          if (!filter || filter === version._id) {
            fn(version, isNew);
          }
        });
      }

      // Registers a callback that will be invoked when a version document is added
      // or changed. Calling the function returned by `watch` removes the callback.
      // If `skipInitial` is true, the callback isn't be invoked for existing
      // documents. If `filter` is set, the callback is only invoked for documents
      // with ID `filter`.
      watch(fn) {
        let {
          skipInitial,
          filter
        } = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
        if (!skipInitial) {
          const resolved = Promise.resolve();
          this._versions.forEach(version => {
            if (!filter || filter === version._id) {
              resolved.then(() => fn(version, true));
            }
          });
        }
        const callback = {
          fn,
          filter
        };
        this._watchCallbacks.add(callback);
        return () => this._watchCallbacks.delete(callback);
      }

      // A reactive data source for `Autoupdate.newClientAvailable`.
      newClientAvailable(id, fields, currentVersion) {
        function isNewVersion(version) {
          return version._id === id && fields.some(field => version[field] !== currentVersion[field]);
        }
        const dependency = new Tracker.Dependency();
        const version = this.get(id);
        dependency.depend();
        const stop = this.watch(version => {
          if (isNewVersion(version)) {
            dependency.changed();
            stop();
          }
        }, {
          skipInitial: true
        });
        return !!version && isNewVersion(version);
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

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});


/* Exports */
return {
  export: function () { return {
      Autoupdate: Autoupdate
    };},
  require: require,
  eagerModulePaths: [
    "/node_modules/meteor/autoupdate/autoupdate_server.js"
  ],
  mainModulePath: "/node_modules/meteor/autoupdate/autoupdate_server.js"
}});

//# sourceURL=meteor://💻app/packages/autoupdate.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvYXV0b3VwZGF0ZS9hdXRvdXBkYXRlX3NlcnZlci5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvYXV0b3VwZGF0ZS9jbGllbnRfdmVyc2lvbnMuanMiXSwibmFtZXMiOlsiX29iamVjdFNwcmVhZCIsIm1vZHVsZTEiLCJsaW5rIiwiZGVmYXVsdCIsInYiLCJleHBvcnQiLCJBdXRvdXBkYXRlIiwib25NZXNzYWdlIiwiQ2xpZW50VmVyc2lvbnMiLCJfX3JlaWZ5V2FpdEZvckRlcHNfXyIsIl9fbWV0ZW9yX3J1bnRpbWVfY29uZmlnX18iLCJhdXRvdXBkYXRlIiwidmVyc2lvbnMiLCJjbGllbnRWZXJzaW9ucyIsImF1dG91cGRhdGVWZXJzaW9uIiwiYXV0b3VwZGF0ZVZlcnNpb25SZWZyZXNoYWJsZSIsImF1dG91cGRhdGVWZXJzaW9uQ29yZG92YSIsImFwcElkIiwicHJvY2VzcyIsImVudiIsIkFQUF9JRCIsInN5bmNRdWV1ZSIsIk1ldGVvciIsIl9Bc3luY2hyb25vdXNRdWV1ZSIsInVwZGF0ZVZlcnNpb25zIiwic2hvdWxkUmVsb2FkQ2xpZW50UHJvZ3JhbSIsIldlYkFwcEludGVybmFscyIsInJlbG9hZENsaWVudFByb2dyYW1zIiwiQVVUT1VQREFURV9WRVJTSU9OIiwiY2xpZW50QXJjaHMiLCJPYmplY3QiLCJrZXlzIiwiV2ViQXBwIiwiY2xpZW50UHJvZ3JhbXMiLCJmb3JFYWNoIiwiYXJjaCIsInZlcnNpb24iLCJjYWxjdWxhdGVDbGllbnRIYXNoIiwidmVyc2lvblJlZnJlc2hhYmxlIiwiY2FsY3VsYXRlQ2xpZW50SGFzaFJlZnJlc2hhYmxlIiwidmVyc2lvbk5vblJlZnJlc2hhYmxlIiwiY2FsY3VsYXRlQ2xpZW50SGFzaE5vblJlZnJlc2hhYmxlIiwidmVyc2lvblJlcGxhY2VhYmxlIiwiY2FsY3VsYXRlQ2xpZW50SGFzaFJlcGxhY2VhYmxlIiwidmVyc2lvbkhtciIsImhtclZlcnNpb24iLCJnZW5lcmF0ZUJvaWxlcnBsYXRlIiwib25MaXN0ZW5pbmciLCJwYXlsb2FkIiwiYXNzZXRzIiwiZ2V0UmVmcmVzaGFibGVBc3NldHMiLCJzZXQiLCJwdWJsaXNoIiwiY2hlY2siLCJNYXRjaCIsIk9uZU9mIiwiU3RyaW5nIiwidW5kZWZpbmVkIiwic3RvcCIsIndhdGNoIiwiaXNOZXciLCJhZGRlZCIsImNoYW5nZWQiLCJjYWxsIiwiX2lkIiwib25TdG9wIiwicmVhZHkiLCJpc19hdXRvIiwic3RhcnR1cCIsImVucXVldWVWZXJzaW9uc1JlZnJlc2giLCJxdWV1ZVRhc2siLCJzZXR1cExpc3RlbmVycyIsIm9uIiwiYmluZEVudmlyb25tZW50IiwiX2lzRmliZXJzRW5hYmxlZCIsIkZ1dHVyZSIsIk5wbSIsInJlcXVpcmUiLCJmdXQiLCJ3YWl0IiwicmV0dXJuIiwiUHJvbWlzZSIsInJlc29sdmUiLCJfX3JlaWZ5X2FzeW5jX3Jlc3VsdF9fIiwiX3JlaWZ5RXJyb3IiLCJzZWxmIiwiYXN5bmMiLCJtb2R1bGUiLCJUcmFja2VyIiwiY29uc3RydWN0b3IiLCJfdmVyc2lvbnMiLCJNYXAiLCJfd2F0Y2hDYWxsYmFja3MiLCJTZXQiLCJjcmVhdGVTdG9yZSIsInVwZGF0ZSIsIl9yZWYiLCJpZCIsIm1zZyIsImZpZWxkcyIsImhhc1ZlcnNpb25zIiwic2l6ZSIsImdldCIsImFzc2lnbiIsIl9yZWYyIiwiZm4iLCJmaWx0ZXIiLCJza2lwSW5pdGlhbCIsImFyZ3VtZW50cyIsImxlbmd0aCIsInJlc29sdmVkIiwidGhlbiIsImNhbGxiYWNrIiwiYWRkIiwiZGVsZXRlIiwibmV3Q2xpZW50QXZhaWxhYmxlIiwiY3VycmVudFZlcnNpb24iLCJpc05ld1ZlcnNpb24iLCJzb21lIiwiZmllbGQiLCJkZXBlbmRlbmN5IiwiRGVwZW5kZW5jeSIsImRlcGVuZCJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0lBQUEsSUFBSUEsYUFBYTtJQUFDQyxPQUFPLENBQUNDLElBQUksQ0FBQyxz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QUFLSCxjQUFjLENBQUNHLEtBQUssQ0FBQyxDQUFDO1FBRXBFO1FBRUEsTUFBTUMsVUFBVSxHQUFHLElBQUloQyxPQUFPLENBQUNpQyxVQUFVLENBQUMsQ0FBQztRQUMzQyxNQUFNckYsT0FBTyxHQUFHLElBQUksQ0FBQ2tFLEdBQUcsQ0FBQ0wsRUFBRSxDQUFDO1FBRTVCdUIsVUFBVSxDQUFDRSxNQUFNLENBQUMsQ0FBQztRQUVuQixNQUFNaEUsSUFBSSxHQUFHLElBQUksQ0FBQ0MsS0FBSyxDQUNwQnZCLE9BQU8sSUFBSztVQUNYLElBQUlpRixZQUFZLENBQUNqRixPQUFPLENBQUMsRUFBRTtZQUN6Qm9GLFVBQVUsQ0FBQzFELE9BQU8sQ0FBQyxDQUFDO1lBQ3BCSixJQUFJLENBQUMsQ0FBQztVQUNSO1FBQ0YsQ0FBQyxFQUNEO1VBQUVpRCxXQUFXLEVBQUU7UUFBSyxDQUN0QixDQUFDO1FBRUQsT0FBTyxDQUFDLENBQUV2RSxPQUFPLElBQUlpRixZQUFZLENBQUNqRixPQUFPLENBQUM7TUFDNUM7SUFDRjtJQUFDK0Msc0JBQUE7RUFBQSxTQUFBQyxXQUFBO0lBQUEsT0FBQUQsc0JBQUEsQ0FBQUMsV0FBQTtFQUFBO0VBQUFELHNCQUFBO0FBQUE7RUFBQUUsSUFBQTtFQUFBQyxLQUFBO0FBQUEsRyIsImZpbGUiOiIvcGFja2FnZXMvYXV0b3VwZGF0ZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8vIFB1Ymxpc2ggdGhlIGN1cnJlbnQgY2xpZW50IHZlcnNpb25zIGZvciBlYWNoIGNsaWVudCBhcmNoaXRlY3R1cmVcbi8vICh3ZWIuYnJvd3Nlciwgd2ViLmJyb3dzZXIubGVnYWN5LCB3ZWIuY29yZG92YSkuIFdoZW4gYSBjbGllbnQgb2JzZXJ2ZXNcbi8vIGEgY2hhbmdlIGluIHRoZSB2ZXJzaW9ucyBhc3NvY2lhdGVkIHdpdGggaXRzIGNsaWVudCBhcmNoaXRlY3R1cmUsXG4vLyBpdCB3aWxsIHJlZnJlc2ggaXRzZWxmLCBlaXRoZXIgYnkgc3dhcHBpbmcgb3V0IENTUyBhc3NldHMgb3IgYnlcbi8vIHJlbG9hZGluZyB0aGUgcGFnZS4gQ2hhbmdlcyB0byB0aGUgcmVwbGFjZWFibGUgdmVyc2lvbiBhcmUgaWdub3JlZFxuLy8gYW5kIGhhbmRsZWQgYnkgdGhlIGhvdC1tb2R1bGUtcmVwbGFjZW1lbnQgcGFja2FnZS5cbi8vXG4vLyBUaGVyZSBhcmUgZm91ciB2ZXJzaW9ucyBmb3IgYW55IGdpdmVuIGNsaWVudCBhcmNoaXRlY3R1cmU6IGB2ZXJzaW9uYCxcbi8vIGB2ZXJzaW9uUmVmcmVzaGFibGVgLCBgdmVyc2lvbk5vblJlZnJlc2hhYmxlYCwgYW5kXG4vLyBgdmVyc2lvblJlcGxhY2VhYmxlYC4gVGhlIHJlZnJlc2hhYmxlIHZlcnNpb24gaXMgYSBoYXNoIG9mIGp1c3QgdGhlXG4vLyBjbGllbnQgcmVzb3VyY2VzIHRoYXQgYXJlIHJlZnJlc2hhYmxlLCBzdWNoIGFzIENTUy4gVGhlIHJlcGxhY2VhYmxlXG4vLyB2ZXJzaW9uIGlzIGEgaGFzaCBvZiBmaWxlcyB0aGF0IGNhbiBiZSB1cGRhdGVkIHdpdGggSE1SLiBUaGVcbi8vIG5vbi1yZWZyZXNoYWJsZSB2ZXJzaW9uIGlzIGEgaGFzaCBvZiB0aGUgcmVzdCBvZiB0aGUgY2xpZW50IGFzc2V0cyxcbi8vIGV4Y2x1ZGluZyB0aGUgcmVmcmVzaGFibGUgb25lczogSFRNTCwgSlMgdGhhdCBpcyBub3QgcmVwbGFjZWFibGUsIGFuZFxuLy8gc3RhdGljIGZpbGVzIGluIHRoZSBgcHVibGljYCBkaXJlY3RvcnkuIFRoZSBgdmVyc2lvbmAgdmVyc2lvbiBpcyBhXG4vLyBjb21iaW5lZCBoYXNoIG9mIGV2ZXJ5dGhpbmcuXG4vL1xuLy8gSWYgdGhlIGVudmlyb25tZW50IHZhcmlhYmxlIGBBVVRPVVBEQVRFX1ZFUlNJT05gIGlzIHNldCwgaXQgd2lsbCBiZVxuLy8gdXNlZCBpbiBwbGFjZSBvZiBhbGwgY2xpZW50IHZlcnNpb25zLiBZb3UgY2FuIHVzZSB0aGlzIHZhcmlhYmxlIHRvXG4vLyBjb250cm9sIHdoZW4gdGhlIGNsaWVudCByZWxvYWRzLiBGb3IgZXhhbXBsZSwgaWYgeW91IHdhbnQgdG8gZm9yY2UgYVxuLy8gcmVsb2FkIG9ubHkgYWZ0ZXIgbWFqb3IgY2hhbmdlcywgdXNlIGEgY3VzdG9tIEFVVE9VUERBVEVfVkVSU0lPTiBhbmRcbi8vIGNoYW5nZSBpdCBvbmx5IHdoZW4gc29tZXRoaW5nIHdvcnRoIHB1c2hpbmcgdG8gY2xpZW50cyBoYXBwZW5zLlxuLy9cbi8vIFRoZSBzZXJ2ZXIgcHVibGlzaGVzIGEgYG1ldGVvcl9hdXRvdXBkYXRlX2NsaWVudFZlcnNpb25zYCBjb2xsZWN0aW9uLlxuLy8gVGhlIElEIG9mIGVhY2ggZG9jdW1lbnQgaXMgdGhlIGNsaWVudCBhcmNoaXRlY3R1cmUsIGFuZCB0aGUgZmllbGRzIG9mXG4vLyB0aGUgZG9jdW1lbnQgYXJlIHRoZSB2ZXJzaW9ucyBkZXNjcmliZWQgYWJvdmUuXG5cbmltcG9ydCB7IG9uTWVzc2FnZSB9IGZyb20gXCJtZXRlb3IvaW50ZXItcHJvY2Vzcy1tZXNzYWdpbmdcIjtcbmltcG9ydCB7IENsaWVudFZlcnNpb25zIH0gZnJvbSBcIi4vY2xpZW50X3ZlcnNpb25zLmpzXCI7XG5cbmV4cG9ydCBjb25zdCBBdXRvdXBkYXRlID0gX19tZXRlb3JfcnVudGltZV9jb25maWdfXy5hdXRvdXBkYXRlID0ge1xuICAvLyBNYXAgZnJvbSBjbGllbnQgYXJjaGl0ZWN0dXJlcyAod2ViLmJyb3dzZXIsIHdlYi5icm93c2VyLmxlZ2FjeSxcbiAgLy8gd2ViLmNvcmRvdmEpIHRvIHZlcnNpb24gZmllbGRzIHsgdmVyc2lvbiwgdmVyc2lvblJlZnJlc2hhYmxlLFxuICAvLyB2ZXJzaW9uTm9uUmVmcmVzaGFibGUsIHJlZnJlc2hhYmxlIH0gdGhhdCB3aWxsIGJlIHN0b3JlZCBpblxuICAvLyBDbGllbnRWZXJzaW9ucyBkb2N1bWVudHMgKHdob3NlIElEcyBhcmUgY2xpZW50IGFyY2hpdGVjdHVyZXMpLiBUaGlzXG4gIC8vIGRhdGEgZ2V0cyBzZXJpYWxpemVkIGludG8gdGhlIGJvaWxlcnBsYXRlIGJlY2F1c2UgaXQncyBzdG9yZWQgaW5cbiAgLy8gX19tZXRlb3JfcnVudGltZV9jb25maWdfXy5hdXRvdXBkYXRlLnZlcnNpb25zLlxuICB2ZXJzaW9uczoge31cbn07XG5cbi8vIFN0b3JlcyBhY2NlcHRhYmxlIGNsaWVudCB2ZXJzaW9ucy5cbmNvbnN0IGNsaWVudFZlcnNpb25zID0gbmV3IENsaWVudFZlcnNpb25zKCk7XG5cbi8vIFRoZSBjbGllbnQgaGFzaCBpbmNsdWRlcyBfX21ldGVvcl9ydW50aW1lX2NvbmZpZ19fLCBzbyB3YWl0IHVudGlsXG4vLyBhbGwgcGFja2FnZXMgaGF2ZSBsb2FkZWQgYW5kIGhhdmUgaGFkIGEgY2hhbmNlIHRvIHBvcHVsYXRlIHRoZVxuLy8gcnVudGltZSBjb25maWcgYmVmb3JlIHVzaW5nIHRoZSBjbGllbnQgaGFzaCBhcyBvdXIgZGVmYXVsdCBhdXRvXG4vLyB1cGRhdGUgdmVyc2lvbiBpZC5cblxuLy8gTm90ZTogVGVzdHMgYWxsb3cgcGVvcGxlIHRvIG92ZXJyaWRlIEF1dG91cGRhdGUuYXV0b3VwZGF0ZVZlcnNpb24gYmVmb3JlXG4vLyBzdGFydHVwLlxuQXV0b3VwZGF0ZS5hdXRvdXBkYXRlVmVyc2lvbiA9IG51bGw7XG5BdXRvdXBkYXRlLmF1dG91cGRhdGVWZXJzaW9uUmVmcmVzaGFibGUgPSBudWxsO1xuQXV0b3VwZGF0ZS5hdXRvdXBkYXRlVmVyc2lvbkNvcmRvdmEgPSBudWxsO1xuQXV0b3VwZGF0ZS5hcHBJZCA9IF9fbWV0ZW9yX3J1bnRpbWVfY29uZmlnX18uYXBwSWQgPSBwcm9jZXNzLmVudi5BUFBfSUQ7XG5cbnZhciBzeW5jUXVldWUgPSBuZXcgTWV0ZW9yLl9Bc3luY2hyb25vdXNRdWV1ZSgpO1xuXG5hc3luYyBmdW5jdGlvbiB1cGRhdGVWZXJzaW9ucyhzaG91bGRSZWxvYWRDbGllbnRQcm9ncmFtKSB7XG4gIC8vIFN0ZXAgMTogbG9hZCB0aGUgY3VycmVudCBjbGllbnQgcHJvZ3JhbSBvbiB0aGUgc2VydmVyXG4gIGlmIChzaG91bGRSZWxvYWRDbGllbnRQcm9ncmFtKSB7XG4gICAgYXdhaXQgV2ViQXBwSW50ZXJuYWxzLnJlbG9hZENsaWVudFByb2dyYW1zKCk7XG4gIH1cblxuICBjb25zdCB7XG4gICAgLy8gSWYgdGhlIEFVVE9VUERBVEVfVkVSU0lPTiBlbnZpcm9ubWVudCB2YXJpYWJsZSBpcyBkZWZpbmVkLCBpdCB0YWtlc1xuICAgIC8vIHByZWNlZGVuY2UsIGJ1dCBBdXRvdXBkYXRlLmF1dG91cGRhdGVWZXJzaW9uIGlzIHN0aWxsIHN1cHBvcnRlZCBhc1xuICAgIC8vIGEgZmFsbGJhY2suIEluIG1vc3QgY2FzZXMgbmVpdGhlciBvZiB0aGVzZSB2YWx1ZXMgd2lsbCBiZSBkZWZpbmVkLlxuICAgIEFVVE9VUERBVEVfVkVSU0lPTiA9IEF1dG91cGRhdGUuYXV0b3VwZGF0ZVZlcnNpb25cbiAgfSA9IHByb2Nlc3MuZW52O1xuXG4gIC8vIFN0ZXAgMjogdXBkYXRlIF9fbWV0ZW9yX3J1bnRpbWVfY29uZmlnX18uYXV0b3VwZGF0ZS52ZXJzaW9ucy5cbiAgY29uc3QgY2xpZW50QXJjaHMgPSBPYmplY3Qua2V5cyhXZWJBcHAuY2xpZW50UHJvZ3JhbXMpO1xuICBjbGllbnRBcmNocy5mb3JFYWNoKGFyY2ggPT4ge1xuICAgIEF1dG91cGRhdGUudmVyc2lvbnNbYXJjaF0gPSB7XG4gICAgICB2ZXJzaW9uOiBBVVRPVVBEQVRFX1ZFUlNJT04gfHxcbiAgICAgICAgV2ViQXBwLmNhbGN1bGF0ZUNsaWVudEhhc2goYXJjaCksXG4gICAgICB2ZXJzaW9uUmVmcmVzaGFibGU6IEFVVE9VUERBVEVfVkVSU0lPTiB8fFxuICAgICAgICBXZWJBcHAuY2FsY3VsYXRlQ2xpZW50SGFzaFJlZnJlc2hhYmxlKGFyY2gpLFxuICAgICAgdmVyc2lvbk5vblJlZnJlc2hhYmxlOiBBVVRPVVBEQVRFX1ZFUlNJT04gfHxcbiAgICAgICAgV2ViQXBwLmNhbGN1bGF0ZUNsaWVudEhhc2hOb25SZWZyZXNoYWJsZShhcmNoKSxcbiAgICAgIHZlcnNpb25SZXBsYWNlYWJsZTogQVVUT1VQREFURV9WRVJTSU9OIHx8XG4gICAgICAgIFdlYkFwcC5jYWxjdWxhdGVDbGllbnRIYXNoUmVwbGFjZWFibGUoYXJjaCksXG4gICAgICB2ZXJzaW9uSG1yOiBXZWJBcHAuY2xpZW50UHJvZ3JhbXNbYXJjaF0uaG1yVmVyc2lvblxuICAgIH07XG4gIH0pO1xuXG4gIC8vIFN0ZXAgMzogZm9ybSB0aGUgbmV3IGNsaWVudCBib2lsZXJwbGF0ZSB3aGljaCBjb250YWlucyB0aGUgdXBkYXRlZFxuICAvLyBhc3NldHMgYW5kIF9fbWV0ZW9yX3J1bnRpbWVfY29uZmlnX18uXG4gIGlmIChzaG91bGRSZWxvYWRDbGllbnRQcm9ncmFtKSB7XG4gICAgYXdhaXQgV2ViQXBwSW50ZXJuYWxzLmdlbmVyYXRlQm9pbGVycGxhdGUoKTtcbiAgfVxuXG4gIC8vIFN0ZXAgNDogdXBkYXRlIHRoZSBDbGllbnRWZXJzaW9ucyBjb2xsZWN0aW9uLlxuICAvLyBXZSB1c2UgYG9uTGlzdGVuaW5nYCBoZXJlIGJlY2F1c2Ugd2UgbmVlZCB0byB1c2VcbiAgLy8gYFdlYkFwcC5nZXRSZWZyZXNoYWJsZUFzc2V0c2AsIHdoaWNoIGlzIG9ubHkgc2V0IGFmdGVyXG4gIC8vIGBXZWJBcHAuZ2VuZXJhdGVCb2lsZXJwbGF0ZWAgaXMgY2FsbGVkIGJ5IGBtYWluYCBpbiB3ZWJhcHAuXG4gIFdlYkFwcC5vbkxpc3RlbmluZygoKSA9PiB7XG4gICAgY2xpZW50QXJjaHMuZm9yRWFjaChhcmNoID0+IHtcbiAgICAgIGNvbnN0IHBheWxvYWQgPSB7XG4gICAgICAgIC4uLkF1dG91cGRhdGUudmVyc2lvbnNbYXJjaF0sXG4gICAgICAgIGFzc2V0czogV2ViQXBwLmdldFJlZnJlc2hhYmxlQXNzZXRzKGFyY2gpLFxuICAgICAgfTtcblxuICAgICAgY2xpZW50VmVyc2lvbnMuc2V0KGFyY2gsIHBheWxvYWQpO1xuICAgIH0pO1xuICB9KTtcbn1cblxuTWV0ZW9yLnB1Ymxpc2goXG4gIFwibWV0ZW9yX2F1dG91cGRhdGVfY2xpZW50VmVyc2lvbnNcIixcbiAgZnVuY3Rpb24gKGFwcElkKSB7XG4gICAgLy8gYG51bGxgIGhhcHBlbnMgd2hlbiBhIGNsaWVudCBkb2Vzbid0IGhhdmUgYW4gYXBwSWQgYW5kIHBhc3Nlc1xuICAgIC8vIGB1bmRlZmluZWRgIHRvIGBNZXRlb3Iuc3Vic2NyaWJlYC4gYHVuZGVmaW5lZGAgaXMgdHJhbnNsYXRlZCB0b1xuICAgIC8vIGBudWxsYCBhcyBKU09OIGRvZXNuJ3QgaGF2ZSBgdW5kZWZpbmVkLlxuICAgIGNoZWNrKGFwcElkLCBNYXRjaC5PbmVPZihTdHJpbmcsIHVuZGVmaW5lZCwgbnVsbCkpO1xuXG4gICAgLy8gRG9uJ3Qgbm90aWZ5IGNsaWVudHMgdXNpbmcgd3JvbmcgYXBwSWQgc3VjaCBhcyBtb2JpbGUgYXBwcyBidWlsdCB3aXRoIGFcbiAgICAvLyBkaWZmZXJlbnQgc2VydmVyIGJ1dCBwb2ludGluZyBhdCB0aGUgc2FtZSBsb2NhbCB1cmxcbiAgICBpZiAoQXV0b3VwZGF0ZS5hcHBJZCAmJiBhcHBJZCAmJiBBdXRvdXBkYXRlLmFwcElkICE9PSBhcHBJZClcbiAgICAgIHJldHVybiBbXTtcblxuICAgIGNvbnN0IHN0b3AgPSBjbGllbnRWZXJzaW9ucy53YXRjaCgodmVyc2lvbiwgaXNOZXcpID0+IHtcbiAgICAgIChpc05ldyA/IHRoaXMuYWRkZWQgOiB0aGlzLmNoYW5nZWQpXG4gICAgICAgIC5jYWxsKHRoaXMsIFwibWV0ZW9yX2F1dG91cGRhdGVfY2xpZW50VmVyc2lvbnNcIiwgdmVyc2lvbi5faWQsIHZlcnNpb24pO1xuICAgIH0pO1xuXG4gICAgdGhpcy5vblN0b3AoKCkgPT4gc3RvcCgpKTtcbiAgICB0aGlzLnJlYWR5KCk7XG4gIH0sXG4gIHtpc19hdXRvOiB0cnVlfVxuKTtcblxuTWV0ZW9yLnN0YXJ0dXAoYXN5bmMgZnVuY3Rpb24gKCkge1xuICBhd2FpdCB1cGRhdGVWZXJzaW9ucyhmYWxzZSk7XG5cbiAgLy8gRm9yY2UgYW55IGNvbm5lY3RlZCBjbGllbnRzIHRoYXQgYXJlIHN0aWxsIGxvb2tpbmcgZm9yIHRoZXNlIG9sZGVyXG4gIC8vIGRvY3VtZW50IElEcyB0byByZWxvYWQuXG4gIFtcInZlcnNpb25cIixcbiAgIFwidmVyc2lvbi1yZWZyZXNoYWJsZVwiLFxuICAgXCJ2ZXJzaW9uLWNvcmRvdmFcIixcbiAgXS5mb3JFYWNoKF9pZCA9PiB7XG4gICAgY2xpZW50VmVyc2lvbnMuc2V0KF9pZCwge1xuICAgICAgdmVyc2lvbjogXCJvdXRkYXRlZFwiXG4gICAgfSk7XG4gIH0pO1xufSk7XG5cbmZ1bmN0aW9uIGVucXVldWVWZXJzaW9uc1JlZnJlc2goKSB7XG4gIHN5bmNRdWV1ZS5xdWV1ZVRhc2soYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIGF3YWl0IHVwZGF0ZVZlcnNpb25zKHRydWUpO1xuICB9KTtcbn1cblxuY29uc3Qgc2V0dXBMaXN0ZW5lcnMgPSAoKSA9PiB7XG4gIC8vIExpc3RlbiBmb3IgbWVzc2FnZXMgcGVydGFpbmluZyB0byB0aGUgY2xpZW50LXJlZnJlc2ggdG9waWMuXG4gIG9uTWVzc2FnZShcImNsaWVudC1yZWZyZXNoXCIsIGVucXVldWVWZXJzaW9uc1JlZnJlc2gpO1xuXG4gIC8vIEFub3RoZXIgd2F5IHRvIHRlbGwgdGhlIHByb2Nlc3MgdG8gcmVmcmVzaDogc2VuZCBTSUdIVVAgc2lnbmFsXG4gIHByb2Nlc3Mub24oJ1NJR0hVUCcsIE1ldGVvci5iaW5kRW52aXJvbm1lbnQoZnVuY3Rpb24gKCkge1xuICAgIGVucXVldWVWZXJzaW9uc1JlZnJlc2goKTtcbiAgfSwgXCJoYW5kbGluZyBTSUdIVVAgc2lnbmFsIGZvciByZWZyZXNoXCIpKTtcbn07XG5cbmlmIChNZXRlb3IuX2lzRmliZXJzRW5hYmxlZCkge1xuICB2YXIgRnV0dXJlID0gTnBtLnJlcXVpcmUoXCJmaWJlcnMvZnV0dXJlXCIpO1xuXG4gIHZhciBmdXQgPSBuZXcgRnV0dXJlKCk7XG5cbiAgLy8gV2Ugb25seSB3YW50ICdyZWZyZXNoJyB0byB0cmlnZ2VyICd1cGRhdGVWZXJzaW9ucycgQUZURVIgb25MaXN0ZW4sXG4gIC8vIHNvIHdlIGFkZCBhIHF1ZXVlZCB0YXNrIHRoYXQgd2FpdHMgZm9yIG9uTGlzdGVuIGJlZm9yZSAncmVmcmVzaCcgY2FuIHF1ZXVlXG4gIC8vIHRhc2tzLiBOb3RlIHRoYXQgdGhlIGBvbkxpc3RlbmluZ2AgY2FsbGJhY2tzIGRvIG5vdCBmaXJlIHVudGlsIGFmdGVyXG4gIC8vIE1ldGVvci5zdGFydHVwLCBzbyB0aGVyZSBpcyBubyBjb25jZXJuIHRoYXQgdGhlICd1cGRhdGVWZXJzaW9ucycgY2FsbHMgZnJvbVxuICAvLyAncmVmcmVzaCcgd2lsbCBvdmVybGFwIHdpdGggdGhlIGB1cGRhdGVWZXJzaW9uc2AgY2FsbCBmcm9tIE1ldGVvci5zdGFydHVwLlxuXG4gIHN5bmNRdWV1ZS5xdWV1ZVRhc2soZnVuY3Rpb24gKCkge1xuICAgIGZ1dC53YWl0KCk7XG4gIH0pO1xuXG4gIFdlYkFwcC5vbkxpc3RlbmluZyhmdW5jdGlvbiAoKSB7XG4gICAgZnV0LnJldHVybigpO1xuICB9KTtcblxuICBzZXR1cExpc3RlbmVycygpO1xuXG59IGVsc2Uge1xuICBXZWJBcHAub25MaXN0ZW5pbmcoZnVuY3Rpb24gKCkge1xuICAgIFByb21pc2UucmVzb2x2ZShzZXR1cExpc3RlbmVycygpKTtcbiAgfSk7XG59XG4iLCJpbXBvcnQgeyBUcmFja2VyIH0gZnJvbSBcIm1ldGVvci90cmFja2VyXCI7XG5cbmV4cG9ydCBjbGFzcyBDbGllbnRWZXJzaW9ucyB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuX3ZlcnNpb25zID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuX3dhdGNoQ2FsbGJhY2tzID0gbmV3IFNldCgpO1xuICB9XG5cbiAgLy8gQ3JlYXRlcyBhIExpdmVkYXRhIHN0b3JlIGZvciB1c2Ugd2l0aCBgTWV0ZW9yLmNvbm5lY3Rpb24ucmVnaXN0ZXJTdG9yZWAuXG4gIC8vIEFmdGVyIHRoZSBzdG9yZSBpcyByZWdpc3RlcmVkLCBkb2N1bWVudCB1cGRhdGVzIHJlcG9ydGVkIGJ5IExpdmVkYXRhIGFyZVxuICAvLyBtZXJnZWQgd2l0aCB0aGUgZG9jdW1lbnRzIGluIHRoaXMgYENsaWVudFZlcnNpb25zYCBpbnN0YW5jZS5cbiAgY3JlYXRlU3RvcmUoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHVwZGF0ZTogKHsgaWQsIG1zZywgZmllbGRzIH0pID0+IHtcbiAgICAgICAgaWYgKG1zZyA9PT0gXCJhZGRlZFwiIHx8IG1zZyA9PT0gXCJjaGFuZ2VkXCIpIHtcbiAgICAgICAgICB0aGlzLnNldChpZCwgZmllbGRzKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG4gIH1cblxuICBoYXNWZXJzaW9ucygpIHtcbiAgICByZXR1cm4gdGhpcy5fdmVyc2lvbnMuc2l6ZSA+IDA7XG4gIH1cblxuICBnZXQoaWQpIHtcbiAgICByZXR1cm4gdGhpcy5fdmVyc2lvbnMuZ2V0KGlkKTtcbiAgfVxuXG4gIC8vIEFkZHMgb3IgdXBkYXRlcyBhIHZlcnNpb24gZG9jdW1lbnQgYW5kIGludm9rZXMgcmVnaXN0ZXJlZCBjYWxsYmFja3MgZm9yIHRoZVxuICAvLyBhZGRlZC91cGRhdGVkIGRvY3VtZW50LiBJZiBhIGRvY3VtZW50IHdpdGggdGhlIGdpdmVuIElEIGFscmVhZHkgZXhpc3RzLCBpdHNcbiAgLy8gZmllbGRzIGFyZSBtZXJnZWQgd2l0aCBgZmllbGRzYC5cbiAgc2V0KGlkLCBmaWVsZHMpIHtcbiAgICBsZXQgdmVyc2lvbiA9IHRoaXMuX3ZlcnNpb25zLmdldChpZCk7XG4gICAgbGV0IGlzTmV3ID0gZmFsc2U7XG5cbiAgICBpZiAodmVyc2lvbikge1xuICAgICAgT2JqZWN0LmFzc2lnbih2ZXJzaW9uLCBmaWVsZHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2ZXJzaW9uID0ge1xuICAgICAgICBfaWQ6IGlkLFxuICAgICAgICAuLi5maWVsZHNcbiAgICAgIH07XG5cbiAgICAgIGlzTmV3ID0gdHJ1ZTtcbiAgICAgIHRoaXMuX3ZlcnNpb25zLnNldChpZCwgdmVyc2lvbik7XG4gICAgfVxuXG4gICAgdGhpcy5fd2F0Y2hDYWxsYmFja3MuZm9yRWFjaCgoeyBmbiwgZmlsdGVyIH0pID0+IHtcbiAgICAgIGlmICghIGZpbHRlciB8fCBmaWx0ZXIgPT09IHZlcnNpb24uX2lkKSB7XG4gICAgICAgIGZuKHZlcnNpb24sIGlzTmV3KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8vIFJlZ2lzdGVycyBhIGNhbGxiYWNrIHRoYXQgd2lsbCBiZSBpbnZva2VkIHdoZW4gYSB2ZXJzaW9uIGRvY3VtZW50IGlzIGFkZGVkXG4gIC8vIG9yIGNoYW5nZWQuIENhbGxpbmcgdGhlIGZ1bmN0aW9uIHJldHVybmVkIGJ5IGB3YXRjaGAgcmVtb3ZlcyB0aGUgY2FsbGJhY2suXG4gIC8vIElmIGBza2lwSW5pdGlhbGAgaXMgdHJ1ZSwgdGhlIGNhbGxiYWNrIGlzbid0IGJlIGludm9rZWQgZm9yIGV4aXN0aW5nXG4gIC8vIGRvY3VtZW50cy4gSWYgYGZpbHRlcmAgaXMgc2V0LCB0aGUgY2FsbGJhY2sgaXMgb25seSBpbnZva2VkIGZvciBkb2N1bWVudHNcbiAgLy8gd2l0aCBJRCBgZmlsdGVyYC5cbiAgd2F0Y2goZm4sIHsgc2tpcEluaXRpYWwsIGZpbHRlciB9ID0ge30pIHtcbiAgICBpZiAoISBza2lwSW5pdGlhbCkge1xuICAgICAgY29uc3QgcmVzb2x2ZWQgPSBQcm9taXNlLnJlc29sdmUoKTtcblxuICAgICAgdGhpcy5fdmVyc2lvbnMuZm9yRWFjaCgodmVyc2lvbikgPT4ge1xuICAgICAgICBpZiAoISBmaWx0ZXIgfHwgZmlsdGVyID09PSB2ZXJzaW9uLl9pZCkge1xuICAgICAgICAgIHJlc29sdmVkLnRoZW4oKCkgPT4gZm4odmVyc2lvbiwgdHJ1ZSkpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBjYWxsYmFjayA9IHsgZm4sIGZpbHRlciB9O1xuICAgIHRoaXMuX3dhdGNoQ2FsbGJhY2tzLmFkZChjYWxsYmFjayk7XG5cbiAgICByZXR1cm4gKCkgPT4gdGhpcy5fd2F0Y2hDYWxsYmFja3MuZGVsZXRlKGNhbGxiYWNrKTtcbiAgfVxuXG4gIC8vIEEgcmVhY3RpdmUgZGF0YSBzb3VyY2UgZm9yIGBBdXRvdXBkYXRlLm5ld0NsaWVudEF2YWlsYWJsZWAuXG4gIG5ld0NsaWVudEF2YWlsYWJsZShpZCwgZmllbGRzLCBjdXJyZW50VmVyc2lvbikge1xuICAgIGZ1bmN0aW9uIGlzTmV3VmVyc2lvbih2ZXJzaW9uKSB7XG4gICAgICByZXR1cm4gKFxuICAgICAgICB2ZXJzaW9uLl9pZCA9PT0gaWQgJiZcbiAgICAgICAgZmllbGRzLnNvbWUoKGZpZWxkKSA9PiB2ZXJzaW9uW2ZpZWxkXSAhPT0gY3VycmVudFZlcnNpb25bZmllbGRdKVxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBkZXBlbmRlbmN5ID0gbmV3IFRyYWNrZXIuRGVwZW5kZW5jeSgpO1xuICAgIGNvbnN0IHZlcnNpb24gPSB0aGlzLmdldChpZCk7XG5cbiAgICBkZXBlbmRlbmN5LmRlcGVuZCgpO1xuXG4gICAgY29uc3Qgc3RvcCA9IHRoaXMud2F0Y2goXG4gICAgICAodmVyc2lvbikgPT4ge1xuICAgICAgICBpZiAoaXNOZXdWZXJzaW9uKHZlcnNpb24pKSB7XG4gICAgICAgICAgZGVwZW5kZW5jeS5jaGFuZ2VkKCk7XG4gICAgICAgICAgc3RvcCgpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgeyBza2lwSW5pdGlhbDogdHJ1ZSB9XG4gICAgKTtcblxuICAgIHJldHVybiAhISB2ZXJzaW9uICYmIGlzTmV3VmVyc2lvbih2ZXJzaW9uKTtcbiAgfVxufVxuIl19
