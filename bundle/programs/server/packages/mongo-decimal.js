Package["core-runtime"].queue("mongo-decimal",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;
var ECMAScript = Package.ecmascript.ECMAScript;
var EJSON = Package.ejson.EJSON;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var Decimal;

var require = meteorInstall({"node_modules":{"meteor":{"mongo-decimal":{"decimal.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                        //
// packages/mongo-decimal/decimal.js                                                      //
//                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////
                                                                                          //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      Decimal: () => Decimal
    });
    let EJSON;
    module.link("meteor/ejson", {
      EJSON(v) {
        EJSON = v;
      }
    }, 0);
    let Decimal;
    module.link("decimal.js", {
      Decimal(v) {
        Decimal = v;
      }
    }, 1);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    Decimal.prototype.typeName = function () {
      return 'Decimal';
    };
    Decimal.prototype.toJSONValue = function () {
      return this.toJSON();
    };
    Decimal.prototype.clone = function () {
      return Decimal(this.toString());
    };
    EJSON.addType('Decimal', function (str) {
      return Decimal(str);
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
////////////////////////////////////////////////////////////////////////////////////////////

},"node_modules":{"decimal.js":{"package.json":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                        //
// node_modules/meteor/mongo-decimal/node_modules/decimal.js/package.json                 //
//                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////
                                                                                          //
module.exports = {
  "name": "decimal.js",
  "version": "10.3.1",
  "main": "decimal"
};

////////////////////////////////////////////////////////////////////////////////////////////

},"decimal.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                        //
// node_modules/meteor/mongo-decimal/node_modules/decimal.js/decimal.js                   //
//                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////
                                                                                          //
module.useNode();
////////////////////////////////////////////////////////////////////////////////////////////

}}}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});


/* Exports */
return {
  export: function () { return {
      Decimal: Decimal
    };},
  require: require,
  eagerModulePaths: [
    "/node_modules/meteor/mongo-decimal/decimal.js"
  ],
  mainModulePath: "/node_modules/meteor/mongo-decimal/decimal.js"
}});

//# sourceURL=meteor://💻app/packages/mongo-decimal.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvbW9uZ28tZGVjaW1hbC9kZWNpbWFsLmpzIl0sIm5hbWVzIjpbIm1vZHVsZSIsImV4cG9ydCIsIkRlY2ltYWwiLCJFSlNPTiIsImxpbmsiLCJ2IiwiX19yZWlmeVdhaXRGb3JEZXBzX18iLCJwcm90b3R5cGUiLCJ0eXBlTmFtZSIsInRvSlNPTlZhbHVlIiwidG9KU09OIiwiY2xvbmUiLCJ0b1N0cmluZyIsImFkZFR5cGUiLCJzdHIiLCJfX3JlaWZ5X2FzeW5jX3Jlc3VsdF9fIiwiX3JlaWZ5RXJyb3IiLCJzZWxmIiwiYXN5bmMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztJQUFBQSxNQUFNLENBQUNDLE1BQU0sQ0FBQztNQUFDQyxPQUFPLEVBQUNBLENBQUEsS0FBSUE7SUFBTyxDQUFDLENBQUM7SUFBQyxJQUFJQyxLQUFLO0lBQUNILE1BQU0sQ0FBQ0ksSUFBSSxDQUFDLGNBQWMsRUFBQztNQUFDRCxLQUFLQSxDQUFDRSxDQUFDLEVBQUM7UUFBQ0YsS0FBSyxHQUFDRSxDQUFDO01BQUE7SUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0lBQUMsSUFBSUgsT0FBTztJQUFDRixNQUFNLENBQUNJLElBQUksQ0FBQyxZQUFZLEVBQUM7TUFBQ0YsT0FBT0EsQ0FBQ0csQ0FBQyxFQUFDO1FBQUNILE9BQU8sR0FBQ0csQ0FBQztNQUFBO0lBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQztJQUFDLElBQUlDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxDQUFDLE1BQU1BLG9CQUFvQixDQUFDLENBQUMsRUFBRSxDQUFDO0lBRzdOSixPQUFPLENBQUNLLFNBQVMsQ0FBQ0MsUUFBUSxHQUFHLFlBQVc7TUFDdEMsT0FBTyxTQUFTO0lBQ2xCLENBQUM7SUFFRE4sT0FBTyxDQUFDSyxTQUFTLENBQUNFLFdBQVcsR0FBRyxZQUFZO01BQzFDLE9BQU8sSUFBSSxDQUFDQyxNQUFNLENBQUMsQ0FBQztJQUN0QixDQUFDO0lBRURSLE9BQU8sQ0FBQ0ssU0FBUyxDQUFDSSxLQUFLLEdBQUcsWUFBWTtNQUNwQyxPQUFPVCxPQUFPLENBQUMsSUFBSSxDQUFDVSxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBQ2pDLENBQUM7SUFFRFQsS0FBSyxDQUFDVSxPQUFPLENBQUMsU0FBUyxFQUFFLFVBQVVDLEdBQUcsRUFBRTtNQUN0QyxPQUFPWixPQUFPLENBQUNZLEdBQUcsQ0FBQztJQUNyQixDQUFDLENBQUM7SUFBQ0Msc0JBQUE7RUFBQSxTQUFBQyxXQUFBO0lBQUEsT0FBQUQsc0JBQUEsQ0FBQUMsV0FBQTtFQUFBO0VBQUFELHNCQUFBO0FBQUE7RUFBQUUsSUFBQTtFQUFBQyxLQUFBO0FBQUEsRyIsImZpbGUiOiIvcGFja2FnZXMvbW9uZ28tZGVjaW1hbC5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEVKU09OIH0gZnJvbSAnbWV0ZW9yL2Vqc29uJztcbmltcG9ydCB7IERlY2ltYWwgfSBmcm9tICdkZWNpbWFsLmpzJztcblxuRGVjaW1hbC5wcm90b3R5cGUudHlwZU5hbWUgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuICdEZWNpbWFsJztcbn07XG5cbkRlY2ltYWwucHJvdG90eXBlLnRvSlNPTlZhbHVlID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdGhpcy50b0pTT04oKTtcbn07XG5cbkRlY2ltYWwucHJvdG90eXBlLmNsb25lID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gRGVjaW1hbCh0aGlzLnRvU3RyaW5nKCkpO1xufTtcblxuRUpTT04uYWRkVHlwZSgnRGVjaW1hbCcsIGZ1bmN0aW9uIChzdHIpIHtcbiAgcmV0dXJuIERlY2ltYWwoc3RyKTtcbn0pO1xuXG5leHBvcnQgeyBEZWNpbWFsIH07XG4iXX0=
