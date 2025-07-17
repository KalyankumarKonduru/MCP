Package["core-runtime"].queue("mongo-id",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;
var EJSON = Package.ejson.EJSON;
var Random = Package.random.Random;
var ECMAScript = Package.ecmascript.ECMAScript;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var MongoID;

var require = meteorInstall({"node_modules":{"meteor":{"mongo-id":{"id.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                               //
// packages/mongo-id/id.js                                                                       //
//                                                                                               //
///////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                 //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      MongoID: () => MongoID
    });
    let EJSON;
    module.link("meteor/ejson", {
      EJSON(v) {
        EJSON = v;
      }
    }, 0);
    let Random;
    module.link("meteor/random", {
      Random(v) {
        Random = v;
      }
    }, 1);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    const MongoID = {};
    MongoID._looksLikeObjectID = str => str.length === 24 && /^[0-9a-f]*$/.test(str);
    MongoID.ObjectID = class ObjectID {
      constructor(hexString) {
        //random-based impl of Mongo ObjectID
        if (hexString) {
          hexString = hexString.toLowerCase();
          if (!MongoID._looksLikeObjectID(hexString)) {
            throw new Error('Invalid hexadecimal string for creating an ObjectID');
          }
          // meant to work with _.isEqual(), which relies on structural equality
          this._str = hexString;
        } else {
          this._str = Random.hexString(24);
        }
      }
      equals(other) {
        return other instanceof MongoID.ObjectID && this.valueOf() === other.valueOf();
      }
      toString() {
        return "ObjectID(\"".concat(this._str, "\")");
      }
      clone() {
        return new MongoID.ObjectID(this._str);
      }
      typeName() {
        return 'oid';
      }
      getTimestamp() {
        return Number.parseInt(this._str.substr(0, 8), 16);
      }
      valueOf() {
        return this._str;
      }
      toJSONValue() {
        return this.valueOf();
      }
      toHexString() {
        return this.valueOf();
      }
    };
    EJSON.addType('oid', str => new MongoID.ObjectID(str));
    MongoID.idStringify = id => {
      if (id instanceof MongoID.ObjectID) {
        return id.valueOf();
      } else if (typeof id === 'string') {
        var firstChar = id.charAt(0);
        if (id === '') {
          return id;
        } else if (firstChar === '-' ||
        // escape previously dashed strings
        firstChar === '~' ||
        // escape escaped numbers, true, false
        MongoID._looksLikeObjectID(id) ||
        // escape object-id-form strings
        firstChar === '{') {
          // escape object-form strings, for maybe implementing later
          return "-".concat(id);
        } else {
          return id; // other strings go through unchanged.
        }
      } else if (id === undefined) {
        return '-';
      } else if (typeof id === 'object' && id !== null) {
        throw new Error('Meteor does not currently support objects other than ObjectID as ids');
      } else {
        // Numbers, true, false, null
        return "~".concat(JSON.stringify(id));
      }
    };
    MongoID.idParse = id => {
      var firstChar = id.charAt(0);
      if (id === '') {
        return id;
      } else if (id === '-') {
        return undefined;
      } else if (firstChar === '-') {
        return id.substr(1);
      } else if (firstChar === '~') {
        return JSON.parse(id.substr(1));
      } else if (MongoID._looksLikeObjectID(id)) {
        return new MongoID.ObjectID(id);
      } else {
        return id;
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
///////////////////////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});


/* Exports */
return {
  export: function () { return {
      MongoID: MongoID
    };},
  require: require,
  eagerModulePaths: [
    "/node_modules/meteor/mongo-id/id.js"
  ],
  mainModulePath: "/node_modules/meteor/mongo-id/id.js"
}});

//# sourceURL=meteor://💻app/packages/mongo-id.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvbW9uZ28taWQvaWQuanMiXSwibmFtZXMiOlsibW9kdWxlIiwiZXhwb3J0IiwiTW9uZ29JRCIsIkVKU09OIiwibGluayIsInYiLCJSYW5kb20iLCJfX3JlaWZ5V2FpdEZvckRlcHNfXyIsIl9sb29rc0xpa2VPYmplY3RJRCIsInN0ciIsImxlbmd0aCIsInRlc3QiLCJPYmplY3RJRCIsImNvbnN0cnVjdG9yIiwiaGV4U3RyaW5nIiwidG9Mb3dlckNhc2UiLCJFcnJvciIsIl9zdHIiLCJlcXVhbHMiLCJvdGhlciIsInZhbHVlT2YiLCJ0b1N0cmluZyIsImNvbmNhdCIsImNsb25lIiwidHlwZU5hbWUiLCJnZXRUaW1lc3RhbXAiLCJOdW1iZXIiLCJwYXJzZUludCIsInN1YnN0ciIsInRvSlNPTlZhbHVlIiwidG9IZXhTdHJpbmciLCJhZGRUeXBlIiwiaWRTdHJpbmdpZnkiLCJpZCIsImZpcnN0Q2hhciIsImNoYXJBdCIsInVuZGVmaW5lZCIsIkpTT04iLCJzdHJpbmdpZnkiLCJpZFBhcnNlIiwicGFyc2UiLCJfX3JlaWZ5X2FzeW5jX3Jlc3VsdF9fIiwiX3JlaWZ5RXJyb3IiLCJzZWxmIiwiYXN5bmMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7SUFBQUEsTUFBTSxDQUFDQyxNQUFNLENBQUM7TUFBQ0MsT0FBTyxFQUFDQSxDQUFBLEtBQUlBO0lBQU8sQ0FBQyxDQUFDO0lBQUMsSUFBSUMsS0FBSztJQUFDSCxNQUFNLENBQUNJLElBQUksQ0FBQyxjQUFjLEVBQUM7TUFBQ0QsS0FBS0EsQ0FBQ0UsQ0FBQyxFQUFDO1FBQUNGLEtBQUssR0FBQ0UsQ0FBQztNQUFBO0lBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQztJQUFDLElBQUlDLE1BQU07SUFBQ04sTUFBTSxDQUFDSSxJQUFJLENBQUMsZUFBZSxFQUFDO01BQUNFLE1BQU1BLENBQUNELENBQUMsRUFBQztRQUFDQyxNQUFNLEdBQUNELENBQUM7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QUFBLENBQUFDLFdBQUE7RUFBQTtFQUFBRCxzQkFBQTtBQUFBO0VBQUFFLElBQUE7RUFBQUMsS0FBQTtBQUFBLEciLCJmaWxlIjoiL3BhY2thZ2VzL21vbmdvLWlkLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRUpTT04gfSBmcm9tICdtZXRlb3IvZWpzb24nO1xuaW1wb3J0IHsgUmFuZG9tIH0gZnJvbSAnbWV0ZW9yL3JhbmRvbSc7XG5cbmNvbnN0IE1vbmdvSUQgPSB7fTtcblxuTW9uZ29JRC5fbG9va3NMaWtlT2JqZWN0SUQgPSBzdHIgPT4gc3RyLmxlbmd0aCA9PT0gMjQgJiYgL15bMC05YS1mXSokLy50ZXN0KHN0cik7XG5cbk1vbmdvSUQuT2JqZWN0SUQgPSBjbGFzcyBPYmplY3RJRCB7XG4gIGNvbnN0cnVjdG9yIChoZXhTdHJpbmcpIHtcbiAgICAvL3JhbmRvbS1iYXNlZCBpbXBsIG9mIE1vbmdvIE9iamVjdElEXG4gICAgaWYgKGhleFN0cmluZykge1xuICAgICAgaGV4U3RyaW5nID0gaGV4U3RyaW5nLnRvTG93ZXJDYXNlKCk7XG4gICAgICBpZiAoIU1vbmdvSUQuX2xvb2tzTGlrZU9iamVjdElEKGhleFN0cmluZykpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGhleGFkZWNpbWFsIHN0cmluZyBmb3IgY3JlYXRpbmcgYW4gT2JqZWN0SUQnKTtcbiAgICAgIH1cbiAgICAgIC8vIG1lYW50IHRvIHdvcmsgd2l0aCBfLmlzRXF1YWwoKSwgd2hpY2ggcmVsaWVzIG9uIHN0cnVjdHVyYWwgZXF1YWxpdHlcbiAgICAgIHRoaXMuX3N0ciA9IGhleFN0cmluZztcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5fc3RyID0gUmFuZG9tLmhleFN0cmluZygyNCk7XG4gICAgfVxuICB9XG5cbiAgZXF1YWxzKG90aGVyKSB7XG4gICAgcmV0dXJuIG90aGVyIGluc3RhbmNlb2YgTW9uZ29JRC5PYmplY3RJRCAmJlxuICAgIHRoaXMudmFsdWVPZigpID09PSBvdGhlci52YWx1ZU9mKCk7XG4gIH1cblxuICB0b1N0cmluZygpIHtcbiAgICByZXR1cm4gYE9iamVjdElEKFwiJHt0aGlzLl9zdHJ9XCIpYDtcbiAgfVxuXG4gIGNsb25lKCkge1xuICAgIHJldHVybiBuZXcgTW9uZ29JRC5PYmplY3RJRCh0aGlzLl9zdHIpO1xuICB9XG5cbiAgdHlwZU5hbWUoKSB7XG4gICAgcmV0dXJuICdvaWQnO1xuICB9XG5cbiAgZ2V0VGltZXN0YW1wKCkge1xuICAgIHJldHVybiBOdW1iZXIucGFyc2VJbnQodGhpcy5fc3RyLnN1YnN0cigwLCA4KSwgMTYpO1xuICB9XG5cbiAgdmFsdWVPZigpIHtcbiAgICByZXR1cm4gdGhpcy5fc3RyO1xuICB9XG5cbiAgdG9KU09OVmFsdWUoKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsdWVPZigpO1xuICB9XG5cbiAgdG9IZXhTdHJpbmcoKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsdWVPZigpO1xuICB9XG5cbn1cblxuRUpTT04uYWRkVHlwZSgnb2lkJywgc3RyID0+IG5ldyBNb25nb0lELk9iamVjdElEKHN0cikpO1xuXG5Nb25nb0lELmlkU3RyaW5naWZ5ID0gKGlkKSA9PiB7XG4gIGlmIChpZCBpbnN0YW5jZW9mIE1vbmdvSUQuT2JqZWN0SUQpIHtcbiAgICByZXR1cm4gaWQudmFsdWVPZigpO1xuICB9IGVsc2UgaWYgKHR5cGVvZiBpZCA9PT0gJ3N0cmluZycpIHtcbiAgICB2YXIgZmlyc3RDaGFyID0gaWQuY2hhckF0KDApO1xuICAgIGlmIChpZCA9PT0gJycpIHtcbiAgICAgIHJldHVybiBpZDtcbiAgICB9IGVsc2UgaWYgKGZpcnN0Q2hhciA9PT0gJy0nIHx8IC8vIGVzY2FwZSBwcmV2aW91c2x5IGRhc2hlZCBzdHJpbmdzXG4gICAgICAgICAgICAgICBmaXJzdENoYXIgPT09ICd+JyB8fCAvLyBlc2NhcGUgZXNjYXBlZCBudW1iZXJzLCB0cnVlLCBmYWxzZVxuICAgICAgICAgICAgICAgTW9uZ29JRC5fbG9va3NMaWtlT2JqZWN0SUQoaWQpIHx8IC8vIGVzY2FwZSBvYmplY3QtaWQtZm9ybSBzdHJpbmdzXG4gICAgICAgICAgICAgICBmaXJzdENoYXIgPT09ICd7JykgeyAvLyBlc2NhcGUgb2JqZWN0LWZvcm0gc3RyaW5ncywgZm9yIG1heWJlIGltcGxlbWVudGluZyBsYXRlclxuICAgICAgcmV0dXJuIGAtJHtpZH1gO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gaWQ7IC8vIG90aGVyIHN0cmluZ3MgZ28gdGhyb3VnaCB1bmNoYW5nZWQuXG4gICAgfVxuICB9IGVsc2UgaWYgKGlkID09PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gJy0nO1xuICB9IGVsc2UgaWYgKHR5cGVvZiBpZCA9PT0gJ29iamVjdCcgJiYgaWQgIT09IG51bGwpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ01ldGVvciBkb2VzIG5vdCBjdXJyZW50bHkgc3VwcG9ydCBvYmplY3RzIG90aGVyIHRoYW4gT2JqZWN0SUQgYXMgaWRzJyk7XG4gIH0gZWxzZSB7IC8vIE51bWJlcnMsIHRydWUsIGZhbHNlLCBudWxsXG4gICAgcmV0dXJuIGB+JHtKU09OLnN0cmluZ2lmeShpZCl9YDtcbiAgfVxufTtcblxuTW9uZ29JRC5pZFBhcnNlID0gKGlkKSA9PiB7XG4gIHZhciBmaXJzdENoYXIgPSBpZC5jaGFyQXQoMCk7XG4gIGlmIChpZCA9PT0gJycpIHtcbiAgICByZXR1cm4gaWQ7XG4gIH0gZWxzZSBpZiAoaWQgPT09ICctJykge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH0gZWxzZSBpZiAoZmlyc3RDaGFyID09PSAnLScpIHtcbiAgICByZXR1cm4gaWQuc3Vic3RyKDEpO1xuICB9IGVsc2UgaWYgKGZpcnN0Q2hhciA9PT0gJ34nKSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UoaWQuc3Vic3RyKDEpKTtcbiAgfSBlbHNlIGlmIChNb25nb0lELl9sb29rc0xpa2VPYmplY3RJRChpZCkpIHtcbiAgICByZXR1cm4gbmV3IE1vbmdvSUQuT2JqZWN0SUQoaWQpO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBpZDtcbiAgfVxufTtcblxuZXhwb3J0IHsgTW9uZ29JRCB9O1xuIl19
