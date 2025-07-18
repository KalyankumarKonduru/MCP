Package["core-runtime"].queue("npm-mongo",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;

/* Package-scope variables */
var NpmModuleMongodb, NpmModuleMongodbVersion;

(function(){

/////////////////////////////////////////////////////////////////////////////
//                                                                         //
// packages/npm-mongo/wrapper.js                                           //
//                                                                         //
/////////////////////////////////////////////////////////////////////////////
                                                                           //
const oldNoDeprecationValue = process.noDeprecation;
try {
  // Silence deprecation warnings introduced in a patch update to mongodb:
  // https://github.com/meteor/meteor/pull/9942#discussion_r218564879
  process.noDeprecation = true;
  NpmModuleMongodb = Npm.require('mongodb');
} finally {
  process.noDeprecation = oldNoDeprecationValue;
}

NpmModuleMongodbVersion = Npm.require('mongodb/package.json').version;

/////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
return {
  export: function () { return {
      NpmModuleMongodb: NpmModuleMongodb,
      NpmModuleMongodbVersion: NpmModuleMongodbVersion
    };}
}});
