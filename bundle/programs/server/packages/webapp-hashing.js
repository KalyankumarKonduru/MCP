Package["core-runtime"].queue("webapp-hashing",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;
var ECMAScript = Package.ecmascript.ECMAScript;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var WebAppHashing;

var require = meteorInstall({"node_modules":{"meteor":{"webapp-hashing":{"webapp-hashing.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                       //
// packages/webapp-hashing/webapp-hashing.js                                                             //
//                                                                                                       //
///////////////////////////////////////////////////////////////////////////////////////////////////////////
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
    const _excluded = ["autoupdateVersion", "autoupdateVersionRefreshable", "autoupdateVersionCordova"];
    let createHash;
    module.link("crypto", {
      createHash(v) {
        createHash = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    WebAppHashing = {};

    // Calculate a hash of all the client resources downloaded by the
    // browser, including the application HTML, runtime config, code, and
    // static files.
    //
    // This hash *must* change if any resources seen by the browser
    // change, and ideally *doesn't* change for any server-only changes
    // (but the second is a performance enhancement, not a hard
    // requirement).

    WebAppHashing.calculateClientHash = function (manifest, includeFilter, runtimeConfigOverride) {
      var hash = createHash('sha1');

      // Omit the old hashed client values in the new hash. These may be
      // modified in the new boilerplate.
      var {
          autoupdateVersion,
          autoupdateVersionRefreshable,
          autoupdateVersionCordova
        } = __meteor_runtime_config__,
        runtimeCfg = _objectWithoutProperties(__meteor_runtime_config__, _excluded);
      if (runtimeConfigOverride) {
        runtimeCfg = runtimeConfigOverride;
      }
      hash.update(JSON.stringify(runtimeCfg, 'utf8'));
      manifest.forEach(function (resource) {
        if ((!includeFilter || includeFilter(resource.type, resource.replaceable)) && (resource.where === 'client' || resource.where === 'internal')) {
          hash.update(resource.path);
          hash.update(resource.hash);
        }
      });
      return hash.digest('hex');
    };
    WebAppHashing.calculateCordovaCompatibilityHash = function (platformVersion, pluginVersions) {
      const hash = createHash('sha1');
      hash.update(platformVersion);

      // Sort plugins first so iteration order doesn't affect the hash
      const plugins = Object.keys(pluginVersions).sort();
      for (let plugin of plugins) {
        const version = pluginVersions[plugin];
        hash.update(plugin);
        hash.update(version);
      }
      return hash.digest('hex');
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
///////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});


/* Exports */
return {
  export: function () { return {
      WebAppHashing: WebAppHashing
    };},
  require: require,
  eagerModulePaths: [
    "/node_modules/meteor/webapp-hashing/webapp-hashing.js"
  ]
}});

//# sourceURL=meteor://💻app/packages/webapp-hashing.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvd2ViYXBwLWhhc2hpbmcvd2ViYXBwLWhhc2hpbmcuanMiXSwibmFtZXMiOlsiX29iamVjdFdpdGhvdXRQcm9wZXJ0aWVzIiwibW9kdWxlIiwibGluayIsImRlZmF1bHQiLCJ2IiwiX2V4Y2x1ZGVkIiwiY3JlYXRlSGFzaCIsIl9fcmVpZnlXYWl0Rm9yRGVwc19fIiwiV2ViQXBwSGFzaGluZyIsImNhbGN1bGF0ZUNsaWVudEhhc2giLCJtYW5pZmVzdCIsImluY2x1ZGVGaWx0ZXIiLCJydW50aW1lQ29uZmlnT3ZlcnJpZGUiLCJoYXNoIiwiYXV0b3VwZGF0ZVZlcnNpb24iLCJhdXRvdXBkYXRlVmVyc2lvblJlZnJlc2hhYmxlIiwiYXV0b3VwZGF0ZVZlcnNpb25Db3Jkb3ZhIiwiX19tZXRlb3JfcnVudGltZV9jb25maWdfXyIsInJ1bnRpbWVDZmciLCJ1cGRhdGUiLCJKU09OIiwic3RyaW5naWZ5IiwiZm9yRWFjaCIsInJlc291cmNlIiwidHlwZSIsInJlcGxhY2VhYmxlIiwid2hlcmUiLCJwYXRoIiwiZGlnZXN0IiwiY2FsY3VsYXRlQ29yZG92YUNvbXBhdGliaWxpdHlIYXNoIiwicGxhdGZvcm1WZXJzaW9uIiwicGx1Z2luVmVyc2lvbnMiLCJwbHVnaW5zIiwiT2JqZWN0Iiwia2V5cyIsInNvcnQiLCJwbHVnaW4iLCJ2ZXJzaW9uIiwiX19yZWlmeV9hc3luY19yZXN1bHRfXyIsIl9yZWlmeUVycm9yIiwic2VsZiIsImFzeW5jIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztJQUFBLElBQUlBLHdCQUF3QjtJQUFDQyxNQUFNLENBQUNDLElBQUksQ0FBQyxnREFBZ0QsRUFBQztNQUFDQyxPQUFPQSxDQUFDQyxDQUFDLEVBQUM7UUFBQ0osd0JBQXdCLEdBQUNJLENBQUM7TUFBQTtJQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7SUFBQyxNQUFBQyxTQUFBO0lBQXRJLElBQUlDLFVBQVU7SUFBQ0wsTUFBTSxDQUFDQyxJQUFJLENBQUMsUUFBUSxFQUFDO01BQUNJLFVBQVVBLENBQUNGLENBQUMsRUFBQztRQUFDRSxVQUFVLEdBQUNGLENBQUM7TUFBQTtJQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7SUFBQyxJQUFJRyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNQSxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQUVqSUMsYUFBYSxHQUFHLENBQUMsQ0FBQzs7SUFFbEI7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTs7SUFFQUEsYUFBYSxDQUFDQyxtQkFBbUIsR0FDL0IsVUFBVUMsUUFBUSxFQUFFQyxhQUFhLEVBQUVDLHFCQUFxQixFQUFFO01BQzFELElBQUlDLElBQUksR0FBR1AsVUFBVSxDQUFDLE1BQU0sQ0FBQzs7TUFFN0I7TUFDQTtNQUNBLElBQUk7VUFBRVEsaUJBQWlCO1VBQUVDLDRCQUE0QjtVQUFFQztRQUF3QyxDQUFDLEdBQUdDLHlCQUF5QjtRQUF4Q0MsVUFBVSxHQUFBbEIsd0JBQUEsQ0FBS2lCLHlCQUF5QixFQUFBWixTQUFBO01BRTVILElBQUlPLHFCQUFxQixFQUFFO1FBQ3pCTSxVQUFVLEdBQUdOLHFCQUFxQjtNQUNwQztNQUVBQyxJQUFJLENBQUNNLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDQyxTQUFTLENBQUNILFVBQVUsRUFBRSxNQUFNLENBQUMsQ0FBQztNQUUvQ1IsUUFBUSxDQUFDWSxPQUFPLENBQUMsVUFBVUMsUUFBUSxFQUFFO1FBQ2pDLElBQUksQ0FBQyxDQUFFWixhQUFhLElBQUlBLGFBQWEsQ0FBQ1ksUUFBUSxDQUFDQyxJQUFJLEVBQUVELFFBQVEsQ0FBQ0UsV0FBVyxDQUFDLE1BQ3JFRixRQUFRLENBQUNHLEtBQUssS0FBSyxRQUFRLElBQUlILFFBQVEsQ0FBQ0csS0FBSyxLQUFLLFVBQVUsQ0FBQyxFQUFFO1VBQ3BFYixJQUFJLENBQUNNLE1BQU0sQ0FBQ0ksUUFBUSxDQUFDSSxJQUFJLENBQUM7VUFDMUJkLElBQUksQ0FBQ00sTUFBTSxDQUFDSSxRQUFRLENBQUNWLElBQUksQ0FBQztRQUM1QjtNQUNGLENBQUMsQ0FBQztNQUNGLE9BQU9BLElBQUksQ0FBQ2UsTUFBTSxDQUFDLEtBQUssQ0FBQztJQUMzQixDQUFDO0lBRURwQixhQUFhLENBQUNxQixpQ0FBaUMsR0FDN0MsVUFBU0MsZUFBZSxFQUFFQyxjQUFjLEVBQUU7TUFDMUMsTUFBTWxCLElBQUksR0FBR1AsVUFBVSxDQUFDLE1BQU0sQ0FBQztNQUUvQk8sSUFBSSxDQUFDTSxNQUFNLENBQUNXLGVBQWUsQ0FBQzs7TUFFNUI7TUFDQSxNQUFNRSxPQUFPLEdBQUdDLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDSCxjQUFjLENBQUMsQ0FBQ0ksSUFBSSxDQUFDLENBQUM7TUFDbEQsS0FBSyxJQUFJQyxNQUFNLElBQUlKLE9BQU8sRUFBRTtRQUMxQixNQUFNSyxPQUFPLEdBQUdOLGNBQWMsQ0FBQ0ssTUFBTSxDQUFDO1FBQ3RDdkIsSUFBSSxDQUFDTSxNQUFNLENBQUNpQixNQUFNLENBQUM7UUFDbkJ2QixJQUFJLENBQUNNLE1BQU0sQ0FBQ2tCLE9BQU8sQ0FBQztNQUN0QjtNQUVBLE9BQU94QixJQUFJLENBQUNlLE1BQU0sQ0FBQyxLQUFLLENBQUM7SUFDM0IsQ0FBQztJQUFDVSxzQkFBQTtFQUFBLFNBQUFDLFdBQUE7SUFBQSxPQUFBRCxzQkFBQSxDQUFBQyxXQUFBO0VBQUE7RUFBQUQsc0JBQUE7QUFBQTtFQUFBRSxJQUFBO0VBQUFDLEtBQUE7QUFBQSxHIiwiZmlsZSI6Ii9wYWNrYWdlcy93ZWJhcHAtaGFzaGluZy5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGNyZWF0ZUhhc2ggfSBmcm9tIFwiY3J5cHRvXCI7XG5cbldlYkFwcEhhc2hpbmcgPSB7fTtcblxuLy8gQ2FsY3VsYXRlIGEgaGFzaCBvZiBhbGwgdGhlIGNsaWVudCByZXNvdXJjZXMgZG93bmxvYWRlZCBieSB0aGVcbi8vIGJyb3dzZXIsIGluY2x1ZGluZyB0aGUgYXBwbGljYXRpb24gSFRNTCwgcnVudGltZSBjb25maWcsIGNvZGUsIGFuZFxuLy8gc3RhdGljIGZpbGVzLlxuLy9cbi8vIFRoaXMgaGFzaCAqbXVzdCogY2hhbmdlIGlmIGFueSByZXNvdXJjZXMgc2VlbiBieSB0aGUgYnJvd3NlclxuLy8gY2hhbmdlLCBhbmQgaWRlYWxseSAqZG9lc24ndCogY2hhbmdlIGZvciBhbnkgc2VydmVyLW9ubHkgY2hhbmdlc1xuLy8gKGJ1dCB0aGUgc2Vjb25kIGlzIGEgcGVyZm9ybWFuY2UgZW5oYW5jZW1lbnQsIG5vdCBhIGhhcmRcbi8vIHJlcXVpcmVtZW50KS5cblxuV2ViQXBwSGFzaGluZy5jYWxjdWxhdGVDbGllbnRIYXNoID1cbiAgZnVuY3Rpb24gKG1hbmlmZXN0LCBpbmNsdWRlRmlsdGVyLCBydW50aW1lQ29uZmlnT3ZlcnJpZGUpIHtcbiAgdmFyIGhhc2ggPSBjcmVhdGVIYXNoKCdzaGExJyk7XG5cbiAgLy8gT21pdCB0aGUgb2xkIGhhc2hlZCBjbGllbnQgdmFsdWVzIGluIHRoZSBuZXcgaGFzaC4gVGhlc2UgbWF5IGJlXG4gIC8vIG1vZGlmaWVkIGluIHRoZSBuZXcgYm9pbGVycGxhdGUuXG4gIHZhciB7IGF1dG91cGRhdGVWZXJzaW9uLCBhdXRvdXBkYXRlVmVyc2lvblJlZnJlc2hhYmxlLCBhdXRvdXBkYXRlVmVyc2lvbkNvcmRvdmEsIC4uLnJ1bnRpbWVDZmcgfSA9IF9fbWV0ZW9yX3J1bnRpbWVfY29uZmlnX187XG5cbiAgaWYgKHJ1bnRpbWVDb25maWdPdmVycmlkZSkge1xuICAgIHJ1bnRpbWVDZmcgPSBydW50aW1lQ29uZmlnT3ZlcnJpZGU7XG4gIH1cblxuICBoYXNoLnVwZGF0ZShKU09OLnN0cmluZ2lmeShydW50aW1lQ2ZnLCAndXRmOCcpKTtcblxuICBtYW5pZmVzdC5mb3JFYWNoKGZ1bmN0aW9uIChyZXNvdXJjZSkge1xuICAgICAgaWYgKCghIGluY2x1ZGVGaWx0ZXIgfHwgaW5jbHVkZUZpbHRlcihyZXNvdXJjZS50eXBlLCByZXNvdXJjZS5yZXBsYWNlYWJsZSkpICYmXG4gICAgICAgICAgKHJlc291cmNlLndoZXJlID09PSAnY2xpZW50JyB8fCByZXNvdXJjZS53aGVyZSA9PT0gJ2ludGVybmFsJykpIHtcbiAgICAgIGhhc2gudXBkYXRlKHJlc291cmNlLnBhdGgpO1xuICAgICAgaGFzaC51cGRhdGUocmVzb3VyY2UuaGFzaCk7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIGhhc2guZGlnZXN0KCdoZXgnKTtcbn07XG5cbldlYkFwcEhhc2hpbmcuY2FsY3VsYXRlQ29yZG92YUNvbXBhdGliaWxpdHlIYXNoID1cbiAgZnVuY3Rpb24ocGxhdGZvcm1WZXJzaW9uLCBwbHVnaW5WZXJzaW9ucykge1xuICBjb25zdCBoYXNoID0gY3JlYXRlSGFzaCgnc2hhMScpO1xuXG4gIGhhc2gudXBkYXRlKHBsYXRmb3JtVmVyc2lvbik7XG5cbiAgLy8gU29ydCBwbHVnaW5zIGZpcnN0IHNvIGl0ZXJhdGlvbiBvcmRlciBkb2Vzbid0IGFmZmVjdCB0aGUgaGFzaFxuICBjb25zdCBwbHVnaW5zID0gT2JqZWN0LmtleXMocGx1Z2luVmVyc2lvbnMpLnNvcnQoKTtcbiAgZm9yIChsZXQgcGx1Z2luIG9mIHBsdWdpbnMpIHtcbiAgICBjb25zdCB2ZXJzaW9uID0gcGx1Z2luVmVyc2lvbnNbcGx1Z2luXTtcbiAgICBoYXNoLnVwZGF0ZShwbHVnaW4pO1xuICAgIGhhc2gudXBkYXRlKHZlcnNpb24pO1xuICB9XG5cbiAgcmV0dXJuIGhhc2guZGlnZXN0KCdoZXgnKTtcbn07XG4iXX0=
