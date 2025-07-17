Package["core-runtime"].queue("facts-base",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;
var ECMAScript = Package.ecmascript.ECMAScript;
var DDP = Package['ddp-client'].DDP;
var DDPServer = Package['ddp-server'].DDPServer;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var Facts;

var require = meteorInstall({"node_modules":{"meteor":{"facts-base":{"facts_base_server.js":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                          //
// packages/facts-base/facts_base_server.js                                                 //
//                                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////////
                                                                                            //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      Facts: () => Facts,
      FACTS_COLLECTION: () => FACTS_COLLECTION,
      FACTS_PUBLICATION: () => FACTS_PUBLICATION
    });
    let Facts, FACTS_COLLECTION, FACTS_PUBLICATION;
    module.link("./facts_base_common", {
      Facts(v) {
        Facts = v;
      },
      FACTS_COLLECTION(v) {
        FACTS_COLLECTION = v;
      },
      FACTS_PUBLICATION(v) {
        FACTS_PUBLICATION = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    const hasOwn = Object.prototype.hasOwnProperty;

    // This file is only used server-side, so no need to check Meteor.isServer.

    // By default, we publish facts to no user if autopublish is off, and to all
    // users if autopublish is on.
    let userIdFilter = function (userId) {
      return !!Package.autopublish;
    };

    // XXX make this take effect at runtime too?
    Facts.setUserIdFilter = function (filter) {
      userIdFilter = filter;
    };

    // XXX Use a minimongo collection instead and hook up an observeChanges
    // directly to a publish.
    const factsByPackage = {};
    let activeSubscriptions = [];

    // Make factsByPackage data available to the server environment
    Facts._factsByPackage = factsByPackage;
    Facts.incrementServerFact = function (pkg, fact, increment) {
      if (!hasOwn.call(factsByPackage, pkg)) {
        factsByPackage[pkg] = {};
        factsByPackage[pkg][fact] = increment;
        activeSubscriptions.forEach(function (sub) {
          sub.added(FACTS_COLLECTION, pkg, factsByPackage[pkg]);
        });
        return;
      }
      const packageFacts = factsByPackage[pkg];
      if (!hasOwn.call(packageFacts, fact)) {
        factsByPackage[pkg][fact] = 0;
      }
      factsByPackage[pkg][fact] += increment;
      const changedField = {};
      changedField[fact] = factsByPackage[pkg][fact];
      activeSubscriptions.forEach(function (sub) {
        sub.changed(FACTS_COLLECTION, pkg, changedField);
      });
    };
    Facts.resetServerFacts = function () {
      for (let pkg in factsByPackage) {
        delete factsByPackage[pkg];
      }
    };

    // Deferred, because we have an unordered dependency on livedata.
    // XXX is this safe? could somebody try to connect before Meteor.publish is
    // called?
    Meteor.defer(function () {
      // XXX Also publish facts-by-package.
      Meteor.publish(FACTS_PUBLICATION, function () {
        const sub = this;
        if (!userIdFilter(this.userId)) {
          sub.ready();
          return;
        }
        activeSubscriptions.push(sub);
        Object.keys(factsByPackage).forEach(function (pkg) {
          sub.added(FACTS_COLLECTION, pkg, factsByPackage[pkg]);
        });
        sub.onStop(function () {
          activeSubscriptions = activeSubscriptions.filter(activeSub => activeSub !== sub);
        });
        sub.ready();
      }, {
        is_auto: true
      });
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
//////////////////////////////////////////////////////////////////////////////////////////////

},"facts_base_common.js":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                          //
// packages/facts-base/facts_base_common.js                                                 //
//                                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////////
                                                                                            //
module.export({
  Facts: () => Facts,
  FACTS_COLLECTION: () => FACTS_COLLECTION,
  FACTS_PUBLICATION: () => FACTS_PUBLICATION
});
const Facts = {};
const FACTS_COLLECTION = 'meteor_Facts_server';
const FACTS_PUBLICATION = 'meteor_facts';
//////////////////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});


/* Exports */
return {
  export: function () { return {
      Facts: Facts
    };},
  require: require,
  eagerModulePaths: [
    "/node_modules/meteor/facts-base/facts_base_server.js"
  ],
  mainModulePath: "/node_modules/meteor/facts-base/facts_base_server.js"
}});

//# sourceURL=meteor://💻app/packages/facts-base.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvZmFjdHMtYmFzZS9mYWN0c19iYXNlX3NlcnZlci5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvZmFjdHMtYmFzZS9mYWN0c19iYXNlX2NvbW1vbi5qcyJdLCJuYW1lcyI6WyJtb2R1bGUiLCJleHBvcnQiLCJGYWN0cyIsIkZBQ1RTX0NPTExFQ1RJT04iLCJGQUNUU19QVUJMSUNBVElPTiIsImxpbmsiLCJ2IiwiX19yZWlmeVdhaXRGb3JEZXBzX18iLCJoYXNPd24iLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsInVzZXJJZEZpbHRlciIsInVzZXJJZCIsIlBhY2thZ2UiLCJhdXRvcHVibGlzaCIsInNldFVzZXJJZEZpbHRlciIsImZpbHRlciIsImZhY3RzQnlQYWNrYWdlIiwiYWN0aXZlU3Vic2NyaXB0aW9ucyIsIl9mYWN0c0J5UGFja2FnZSIsImluY3JlbWVudFNlcnZlckZhY3QiLCJwa2ciLCJmYWN0IiwiaW5jcmVtZW50IiwiY2FsbCIsImZvckVhY2giLCJzdWIiLCJhZGRlZCIsInBhY2thZ2VGYWN0cyIsImNoYW5nZWRGaWVsZCIsImNoYW5nZWQiLCJyZXNldFNlcnZlckZhY3RzIiwiTWV0ZW9yIiwiZGVmZXIiLCJwdWJsaXNoIiwicmVhZHkiLCJwdXNoIiwia2V5cyIsIm9uU3RvcCIsImFjdGl2ZVN1YiIsImlzX2F1dG8iLCJfX3JlaWZ5X2FzeW5jX3Jlc3VsdF9fIiwiX3JlaWZ5RXJyb3IiLCJzZWxmIiwiYXN5bmMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7SUFBQUEsTUFBTSxDQUFDQyxNQUFNLENBQUM7TUFBQ0MsS0FBSyxFQUFDQSxDQUFBLEtBQUlBLEtBQUs7TUFBQ0MsZ0JBQWdCLEVBQUNBLENBQUEsS0FBSUEsZ0JBQWdCO01BQUNDLGlCQUFpQixFQUFDQSxDQUFBLEtBQUlBO0lBQWlCLENBQUMsQ0FBQztJQUFDLElBQUlGLEtBQUss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Y2thZ2VzL2ZhY3RzLWJhc2UuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBGYWN0cywgRkFDVFNfQ09MTEVDVElPTiwgRkFDVFNfUFVCTElDQVRJT04gfSBmcm9tICcuL2ZhY3RzX2Jhc2VfY29tbW9uJztcblxuY29uc3QgaGFzT3duID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcblxuLy8gVGhpcyBmaWxlIGlzIG9ubHkgdXNlZCBzZXJ2ZXItc2lkZSwgc28gbm8gbmVlZCB0byBjaGVjayBNZXRlb3IuaXNTZXJ2ZXIuXG5cbi8vIEJ5IGRlZmF1bHQsIHdlIHB1Ymxpc2ggZmFjdHMgdG8gbm8gdXNlciBpZiBhdXRvcHVibGlzaCBpcyBvZmYsIGFuZCB0byBhbGxcbi8vIHVzZXJzIGlmIGF1dG9wdWJsaXNoIGlzIG9uLlxubGV0IHVzZXJJZEZpbHRlciA9IGZ1bmN0aW9uICh1c2VySWQpIHtcbiAgcmV0dXJuICEhUGFja2FnZS5hdXRvcHVibGlzaDtcbn07XG5cbi8vIFhYWCBtYWtlIHRoaXMgdGFrZSBlZmZlY3QgYXQgcnVudGltZSB0b28/XG5GYWN0cy5zZXRVc2VySWRGaWx0ZXIgPSBmdW5jdGlvbiAoZmlsdGVyKSB7XG4gIHVzZXJJZEZpbHRlciA9IGZpbHRlcjtcbn07XG5cbi8vIFhYWCBVc2UgYSBtaW5pbW9uZ28gY29sbGVjdGlvbiBpbnN0ZWFkIGFuZCBob29rIHVwIGFuIG9ic2VydmVDaGFuZ2VzXG4vLyBkaXJlY3RseSB0byBhIHB1Ymxpc2guXG5jb25zdCBmYWN0c0J5UGFja2FnZSA9IHt9O1xubGV0IGFjdGl2ZVN1YnNjcmlwdGlvbnMgPSBbXTtcblxuLy8gTWFrZSBmYWN0c0J5UGFja2FnZSBkYXRhIGF2YWlsYWJsZSB0byB0aGUgc2VydmVyIGVudmlyb25tZW50XG5GYWN0cy5fZmFjdHNCeVBhY2thZ2UgPSBmYWN0c0J5UGFja2FnZTtcblxuRmFjdHMuaW5jcmVtZW50U2VydmVyRmFjdCA9IGZ1bmN0aW9uIChwa2csIGZhY3QsIGluY3JlbWVudCkge1xuICBpZiAoIWhhc093bi5jYWxsKGZhY3RzQnlQYWNrYWdlLCBwa2cpKSB7XG4gICAgZmFjdHNCeVBhY2thZ2VbcGtnXSA9IHt9O1xuICAgIGZhY3RzQnlQYWNrYWdlW3BrZ11bZmFjdF0gPSBpbmNyZW1lbnQ7XG4gICAgYWN0aXZlU3Vic2NyaXB0aW9ucy5mb3JFYWNoKGZ1bmN0aW9uIChzdWIpIHtcbiAgICAgIHN1Yi5hZGRlZChGQUNUU19DT0xMRUNUSU9OLCBwa2csIGZhY3RzQnlQYWNrYWdlW3BrZ10pO1xuICAgIH0pO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IHBhY2thZ2VGYWN0cyA9IGZhY3RzQnlQYWNrYWdlW3BrZ107XG4gIGlmICghaGFzT3duLmNhbGwocGFja2FnZUZhY3RzLCBmYWN0KSkge1xuICAgIGZhY3RzQnlQYWNrYWdlW3BrZ11bZmFjdF0gPSAwO1xuICB9XG4gIGZhY3RzQnlQYWNrYWdlW3BrZ11bZmFjdF0gKz0gaW5jcmVtZW50O1xuICBjb25zdCBjaGFuZ2VkRmllbGQgPSB7fTtcbiAgY2hhbmdlZEZpZWxkW2ZhY3RdID0gZmFjdHNCeVBhY2thZ2VbcGtnXVtmYWN0XTtcbiAgYWN0aXZlU3Vic2NyaXB0aW9ucy5mb3JFYWNoKGZ1bmN0aW9uIChzdWIpIHtcbiAgICBzdWIuY2hhbmdlZChGQUNUU19DT0xMRUNUSU9OLCBwa2csIGNoYW5nZWRGaWVsZCk7XG4gIH0pO1xufTtcblxuRmFjdHMucmVzZXRTZXJ2ZXJGYWN0cyA9IGZ1bmN0aW9uICgpIHtcbiAgZm9yIChsZXQgcGtnIGluIGZhY3RzQnlQYWNrYWdlKSB7XG4gICAgZGVsZXRlIGZhY3RzQnlQYWNrYWdlW3BrZ107XG4gIH1cbn07XG5cbi8vIERlZmVycmVkLCBiZWNhdXNlIHdlIGhhdmUgYW4gdW5vcmRlcmVkIGRlcGVuZGVuY3kgb24gbGl2ZWRhdGEuXG4vLyBYWFggaXMgdGhpcyBzYWZlPyBjb3VsZCBzb21lYm9keSB0cnkgdG8gY29ubmVjdCBiZWZvcmUgTWV0ZW9yLnB1Ymxpc2ggaXNcbi8vIGNhbGxlZD9cbk1ldGVvci5kZWZlcihmdW5jdGlvbiAoKSB7XG4gIC8vIFhYWCBBbHNvIHB1Ymxpc2ggZmFjdHMtYnktcGFja2FnZS5cbiAgTWV0ZW9yLnB1Ymxpc2goRkFDVFNfUFVCTElDQVRJT04sIGZ1bmN0aW9uICgpIHtcbiAgICBjb25zdCBzdWIgPSB0aGlzO1xuICAgIGlmICghdXNlcklkRmlsdGVyKHRoaXMudXNlcklkKSkge1xuICAgICAgc3ViLnJlYWR5KCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgYWN0aXZlU3Vic2NyaXB0aW9ucy5wdXNoKHN1Yik7XG4gICAgT2JqZWN0LmtleXMoZmFjdHNCeVBhY2thZ2UpLmZvckVhY2goZnVuY3Rpb24gKHBrZykge1xuICAgICAgc3ViLmFkZGVkKEZBQ1RTX0NPTExFQ1RJT04sIHBrZywgZmFjdHNCeVBhY2thZ2VbcGtnXSk7XG4gICAgfSk7XG4gICAgc3ViLm9uU3RvcChmdW5jdGlvbiAoKSB7XG4gICAgICBhY3RpdmVTdWJzY3JpcHRpb25zID1cbiAgICAgICAgYWN0aXZlU3Vic2NyaXB0aW9ucy5maWx0ZXIoYWN0aXZlU3ViID0+IGFjdGl2ZVN1YiAhPT0gc3ViKTtcbiAgICB9KTtcbiAgICBzdWIucmVhZHkoKTtcbiAgfSwge2lzX2F1dG86IHRydWV9KTtcbn0pO1xuXG5leHBvcnQge1xuICBGYWN0cyxcbiAgRkFDVFNfQ09MTEVDVElPTixcbiAgRkFDVFNfUFVCTElDQVRJT04sXG59O1xuIiwiY29uc3QgRmFjdHMgPSB7fTtcbmNvbnN0IEZBQ1RTX0NPTExFQ1RJT04gPSAnbWV0ZW9yX0ZhY3RzX3NlcnZlcic7XG5jb25zdCBGQUNUU19QVUJMSUNBVElPTiA9ICdtZXRlb3JfZmFjdHMnO1xuXG5leHBvcnQge1xuICBGYWN0cyxcbiAgRkFDVFNfQ09MTEVDVElPTixcbiAgRkFDVFNfUFVCTElDQVRJT04sXG59O1xuIl19
