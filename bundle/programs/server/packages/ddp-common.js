Package["core-runtime"].queue("ddp-common",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;
var check = Package.check.check;
var Match = Package.check.Match;
var Random = Package.random.Random;
var ECMAScript = Package.ecmascript.ECMAScript;
var EJSON = Package.ejson.EJSON;
var Tracker = Package.tracker.Tracker;
var Deps = Package.tracker.Deps;
var Retry = Package.retry.Retry;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var DDPCommon;

var require = meteorInstall({"node_modules":{"meteor":{"ddp-common":{"namespace.js":function module(){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/ddp-common/namespace.js                                                                                   //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
/**
 * @namespace DDPCommon
 * @summary Namespace for DDPCommon-related methods/classes. Shared between 
 * `ddp-client` and `ddp-server`, where the ddp-client is the implementation
 * of a ddp client for both client AND server; and the ddp server is the
 * implementation of the livedata server and stream server. Common 
 * functionality shared between both can be shared under this namespace
 */
DDPCommon = {};
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"heartbeat.js":function module(){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/ddp-common/heartbeat.js                                                                                   //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
// Heartbeat options:
//   heartbeatInterval: interval to send pings, in milliseconds.
//   heartbeatTimeout: timeout to close the connection if a reply isn't
//     received, in milliseconds.
//   sendPing: function to call to send a ping on the connection.
//   onTimeout: function to call to close the connection.

DDPCommon.Heartbeat = class Heartbeat {
  constructor(options) {
    this.heartbeatInterval = options.heartbeatInterval;
    this.heartbeatTimeout = options.heartbeatTimeout;
    this._sendPing = options.sendPing;
    this._onTimeout = options.onTimeout;
    this._seenPacket = false;
    this._heartbeatIntervalHandle = null;
    this._heartbeatTimeoutHandle = null;
  }
  stop() {
    this._clearHeartbeatIntervalTimer();
    this._clearHeartbeatTimeoutTimer();
  }
  start() {
    this.stop();
    this._startHeartbeatIntervalTimer();
  }
  _startHeartbeatIntervalTimer() {
    this._heartbeatIntervalHandle = Meteor.setInterval(() => this._heartbeatIntervalFired(), this.heartbeatInterval);
  }
  _startHeartbeatTimeoutTimer() {
    this._heartbeatTimeoutHandle = Meteor.setTimeout(() => this._heartbeatTimeoutFired(), this.heartbeatTimeout);
  }
  _clearHeartbeatIntervalTimer() {
    if (this._heartbeatIntervalHandle) {
      Meteor.clearInterval(this._heartbeatIntervalHandle);
      this._heartbeatIntervalHandle = null;
    }
  }
  _clearHeartbeatTimeoutTimer() {
    if (this._heartbeatTimeoutHandle) {
      Meteor.clearTimeout(this._heartbeatTimeoutHandle);
      this._heartbeatTimeoutHandle = null;
    }
  }

  // The heartbeat interval timer is fired when we should send a ping.
  _heartbeatIntervalFired() {
    // don't send ping if we've seen a packet since we last checked,
    // *or* if we have already sent a ping and are awaiting a timeout.
    // That shouldn't happen, but it's possible if
    // `this.heartbeatInterval` is smaller than
    // `this.heartbeatTimeout`.
    if (!this._seenPacket && !this._heartbeatTimeoutHandle) {
      this._sendPing();
      // Set up timeout, in case a pong doesn't arrive in time.
      this._startHeartbeatTimeoutTimer();
    }
    this._seenPacket = false;
  }

  // The heartbeat timeout timer is fired when we sent a ping, but we
  // timed out waiting for the pong.
  _heartbeatTimeoutFired() {
    this._heartbeatTimeoutHandle = null;
    this._onTimeout();
  }
  messageReceived() {
    // Tell periodic checkin that we have seen a packet, and thus it
    // does not need to send a ping this cycle.
    this._seenPacket = true;
    // If we were waiting for a pong, we got it.
    if (this._heartbeatTimeoutHandle) {
      this._clearHeartbeatTimeoutTimer();
    }
  }
};
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"utils.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/ddp-common/utils.js                                                                                       //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
"use strict";

module.export({
  hasOwn: () => hasOwn,
  slice: () => slice,
  keys: () => keys,
  isEmpty: () => isEmpty,
  last: () => last
});
const hasOwn = Object.prototype.hasOwnProperty;
const slice = Array.prototype.slice;
function keys(obj) {
  return Object.keys(Object(obj));
}
function isEmpty(obj) {
  if (obj == null) {
    return true;
  }
  if (Array.isArray(obj) || typeof obj === "string") {
    return obj.length === 0;
  }
  for (const key in obj) {
    if (hasOwn.call(obj, key)) {
      return false;
    }
  }
  return true;
}
function last(array, n, guard) {
  if (array == null) {
    return;
  }
  if (n == null || guard) {
    return array[array.length - 1];
  }
  return slice.call(array, Math.max(array.length - n, 0));
}
DDPCommon.SUPPORTED_DDP_VERSIONS = ['1', 'pre2', 'pre1'];
DDPCommon.parseDDP = function (stringMessage) {
  try {
    var msg = JSON.parse(stringMessage);
  } catch (e) {
    Meteor._debug("Discarding message with invalid JSON", stringMessage);
    return null;
  }
  // DDP messages must be objects.
  if (msg === null || typeof msg !== 'object') {
    Meteor._debug("Discarding non-object DDP message", stringMessage);
    return null;
  }

  // massage msg to get it into "abstract ddp" rather than "wire ddp" format.

  // switch between "cleared" rep of unsetting fields and "undefined"
  // rep of same
  if (hasOwn.call(msg, 'cleared')) {
    if (!hasOwn.call(msg, 'fields')) {
      msg.fields = {};
    }
    msg.cleared.forEach(clearKey => {
      msg.fields[clearKey] = undefined;
    });
    delete msg.cleared;
  }
  ['fields', 'params', 'result'].forEach(field => {
    if (hasOwn.call(msg, field)) {
      msg[field] = EJSON._adjustTypesFromJSONValue(msg[field]);
    }
  });
  return msg;
};
DDPCommon.stringifyDDP = function (msg) {
  const copy = EJSON.clone(msg);

  // swizzle 'changed' messages from 'fields undefined' rep to 'fields
  // and cleared' rep
  if (hasOwn.call(msg, 'fields')) {
    const cleared = [];
    Object.keys(msg.fields).forEach(key => {
      const value = msg.fields[key];
      if (typeof value === "undefined") {
        cleared.push(key);
        delete copy.fields[key];
      }
    });
    if (!isEmpty(cleared)) {
      copy.cleared = cleared;
    }
    if (isEmpty(copy.fields)) {
      delete copy.fields;
    }
  }

  // adjust types to basic
  ['fields', 'params', 'result'].forEach(field => {
    if (hasOwn.call(copy, field)) {
      copy[field] = EJSON._adjustTypesToJSONValue(copy[field]);
    }
  });
  if (msg.id && typeof msg.id !== 'string') {
    throw new Error("Message id is not a string");
  }
  return JSON.stringify(copy);
};
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"method_invocation.js":function module(){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/ddp-common/method_invocation.js                                                                           //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
// Instance name is this because it is usually referred to as this inside a
// method definition
/**
 * @summary The state for a single invocation of a method, referenced by this
 * inside a method definition.
 * @param {Object} options
 * @instanceName this
 * @showInstanceName true
 */
DDPCommon.MethodInvocation = class MethodInvocation {
  constructor(options) {
    // true if we're running not the actual method, but a stub (that is,
    // if we're on a client (which may be a browser, or in the future a
    // server connecting to another server) and presently running a
    // simulation of a server-side method for latency compensation
    // purposes). not currently true except in a client such as a browser,
    // since there's usually no point in running stubs unless you have a
    // zero-latency connection to the user.

    /**
     * @summary The name given to the method.
     * @locus Anywhere
     * @name  name
     * @memberOf DDPCommon.MethodInvocation
     * @instance
     * @type {String}
     */
    this.name = options.name;

    /**
     * @summary Access inside a method invocation.  Boolean value, true if this invocation is a stub.
     * @locus Anywhere
     * @name  isSimulation
     * @memberOf DDPCommon.MethodInvocation
     * @instance
     * @type {Boolean}
     */
    this.isSimulation = options.isSimulation;

    // call this function to allow other method invocations (from the
    // same client) to continue running without waiting for this one to
    // complete.
    this._unblock = options.unblock || function () {};
    this._calledUnblock = false;

    // used to know when the function apply was called by callAsync
    this._isFromCallAsync = options.isFromCallAsync;

    // current user id

    /**
     * @summary The id of the user that made this method call, or `null` if no user was logged in.
     * @locus Anywhere
     * @name  userId
     * @memberOf DDPCommon.MethodInvocation
     * @instance
     */
    this.userId = options.userId;

    // sets current user id in all appropriate server contexts and
    // reruns subscriptions
    this._setUserId = options.setUserId || function () {};

    // On the server, the connection this method call came in on.

    /**
     * @summary Access inside a method invocation. The [connection](#meteor_onconnection) that this method was received on. `null` if the method is not associated with a connection, eg. a server initiated method call. Calls to methods made from a server method which was in turn initiated from the client share the same `connection`.
     * @locus Server
     * @name  connection
     * @memberOf DDPCommon.MethodInvocation
     * @instance
     */
    this.connection = options.connection;

    // The seed for randomStream value generation
    this.randomSeed = options.randomSeed;

    // This is set by RandomStream.get; and holds the random stream state
    this.randomStream = null;
    this.fence = options.fence;
  }

  /**
   * @summary Call inside a method invocation.  Allow subsequent method from this client to begin running in a new fiber.
   * @locus Server
   * @memberOf DDPCommon.MethodInvocation
   * @instance
   */
  unblock() {
    this._calledUnblock = true;
    this._unblock();
  }

  /**
   * @summary Set the logged in user.
   * @locus Server
   * @memberOf DDPCommon.MethodInvocation
   * @instance
   * @param {String | null} userId The value that should be returned by `userId` on this connection.
   */
  async setUserId(userId) {
    if (this._calledUnblock) {
      throw new Error("Can't call setUserId in a method after calling unblock");
    }
    this.userId = userId;
    await this._setUserId(userId);
  }
};
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"random_stream.js":function module(){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/ddp-common/random_stream.js                                                                               //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
// RandomStream allows for generation of pseudo-random values, from a seed.
//
// We use this for consistent 'random' numbers across the client and server.
// We want to generate probably-unique IDs on the client, and we ideally want
// the server to generate the same IDs when it executes the method.
//
// For generated values to be the same, we must seed ourselves the same way,
// and we must keep track of the current state of our pseudo-random generators.
// We call this state the scope. By default, we use the current DDP method
// invocation as our scope.  DDP now allows the client to specify a randomSeed.
// If a randomSeed is provided it will be used to seed our random sequences.
// In this way, client and server method calls will generate the same values.
//
// We expose multiple named streams; each stream is independent
// and is seeded differently (but predictably from the name).
// By using multiple streams, we support reordering of requests,
// as long as they occur on different streams.
//
// @param options {Optional Object}
//   seed: Array or value - Seed value(s) for the generator.
//                          If an array, will be used as-is
//                          If a value, will be converted to a single-value array
//                          If omitted, a random array will be used as the seed.
DDPCommon.RandomStream = class RandomStream {
  constructor(options) {
    this.seed = [].concat(options.seed || randomToken());
    this.sequences = Object.create(null);
  }

  // Get a random sequence with the specified name, creating it if does not exist.
  // New sequences are seeded with the seed concatenated with the name.
  // By passing a seed into Random.create, we use the Alea generator.
  _sequence(name) {
    var self = this;
    var sequence = self.sequences[name] || null;
    if (sequence === null) {
      var sequenceSeed = self.seed.concat(name);
      for (var i = 0; i < sequenceSeed.length; i++) {
        if (typeof sequenceSeed[i] === "function") {
          sequenceSeed[i] = sequenceSeed[i]();
        }
      }
      self.sequences[name] = sequence = Random.createWithSeeds.apply(null, sequenceSeed);
    }
    return sequence;
  }
};

// Returns a random string of sufficient length for a random seed.
// This is a placeholder function; a similar function is planned
// for Random itself; when that is added we should remove this function,
// and call Random's randomToken instead.
function randomToken() {
  return Random.hexString(20);
}
;

// Returns the random stream with the specified name, in the specified
// scope. If a scope is passed, then we use that to seed a (not
// cryptographically secure) PRNG using the fast Alea algorithm.  If
// scope is null (or otherwise falsey) then we use a generated seed.
//
// However, scope will normally be the current DDP method invocation,
// so we'll use the stream with the specified name, and we should get
// consistent values on the client and server sides of a method call.
DDPCommon.RandomStream.get = function (scope, name) {
  if (!name) {
    name = "default";
  }
  if (!scope) {
    // There was no scope passed in; the sequence won't actually be
    // reproducible. but make it fast (and not cryptographically
    // secure) anyways, so that the behavior is similar to what you'd
    // get by passing in a scope.
    return Random.insecure;
  }
  var randomStream = scope.randomStream;
  if (!randomStream) {
    scope.randomStream = randomStream = new DDPCommon.RandomStream({
      seed: scope.randomSeed
    });
  }
  return randomStream._sequence(name);
};

// Creates a randomSeed for passing to a method call.
// Note that we take enclosing as an argument,
// though we expect it to be DDP._CurrentMethodInvocation.get()
// However, we often evaluate makeRpcSeed lazily, and thus the relevant
// invocation may not be the one currently in scope.
// If enclosing is null, we'll use Random and values won't be repeatable.
DDPCommon.makeRpcSeed = function (enclosing, methodName) {
  var stream = DDPCommon.RandomStream.get(enclosing, '/rpc/' + methodName);
  return stream.hexString(20);
};
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});


/* Exports */
return {
  export: function () { return {
      DDPCommon: DDPCommon
    };},
  require: require,
  eagerModulePaths: [
    "/node_modules/meteor/ddp-common/namespace.js",
    "/node_modules/meteor/ddp-common/heartbeat.js",
    "/node_modules/meteor/ddp-common/utils.js",
    "/node_modules/meteor/ddp-common/method_invocation.js",
    "/node_modules/meteor/ddp-common/random_stream.js"
  ]
}});

//# sourceURL=meteor://💻app/packages/ddp-common.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvZGRwLWNvbW1vbi9uYW1lc3BhY2UuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL2RkcC1jb21tb24vaGVhcnRiZWF0LmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9kZHAtY29tbW9uL3V0aWxzLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9kZHAtY29tbW9uL21ldGhvZF9pbnZvY2F0aW9uLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9kZHAtY29tbW9uL3JhbmRvbV9zdHJlYW0uanMiXSwibmFtZXMiOlsiRERQQ29tbW9uIiwiSGVhcnRiZWF0IiwiY29uc3RydWN0b3IiLCJvcHRpb25zIiwiaGVhcnRiZWF0SW50ZXJ2YWwiLCJoZWFydGJlYXRUaW1lb3V0IiwiX3NlbmRQaW5nIiwic2VuZFBpbmciLCJfb25UaW1lb3V0Iiwib25UaW1lb3V0IiwiX3NlZW5QYWNrZXQiLCJfaGVhcnRiZWF0SW50ZXJ2YWxIYW5kbGUiLCJfaGVhcnRiZWF0VGltZW91dEhhbmRsZSIsInN0b3AiLCJfY2xlYXJIZWFydGJlYXRJbnRlcnZhbFRpbWVyIiwiX2NsZWFySGVhcnRiZWF0VGltZW91dFRpbWVyIiwic3RhcnQiLCJfc3RhcnRIZWFydGJlYXRJbnRlcnZhbFRpbWVyIiwiTWV0ZW9yIiwic2V0SW50ZXJ2YWwiLCJfaGVhcnRiZWF0SW50ZXJ2YWxGaXJlZCIsIl9zdGFydEhlYXJ0YmVhdFRpbWVvdXRUaW1lciIsInNldFRpbWVvdXQiLCJfaGVhcnRiZWF0VGltZW91dEZpcmVkIiwiY2xlYXJJbnRlcnZhbCIsImNsZWFyVGltZW91dCIsIm1lc3NhZ2VSZWNlaXZlZCIsIm1vZHVsZSIsImV4cG9ydCIsImhhc093biIsInNsaWNlIiwia2V5cyIsImlzRW1wdHkiLCJsYXN0IiwiT2JqZWN0IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJBcnJheSIsIm9iaiIsImlzQXJyYXkiLCJsZW5ndGgiLCJrZXkiLCJjYWxsIiwiYXJyYXkiLCJuIiwiZ3VhcmQiLCJNYXRoIiwibWF4IiwiU1VQUE9SVEVEX0REUF9WRVJTSU9OUyIsInBhcnNlRERQIiwic3RyaW5nTWVzc2FnZSIsIm1zZyIsIkpTT04iLCJwYXJzZSIsImUiLCJfZGVidWciLCJmaWVsZHMiLCJjbGVhcmVkIiwiZm9yRWFjaCIsImNsZWFyS2V5IiwidW5kZWZpbmVkIiwiZmllbGQiLCJFSlNPTiIsIl9hZGp1c3RUeXBlc0Zyb21KU09OVmFsdWUiLCJzdHJpbmdpZnlERFAiLCJjb3B5IiwiY2xvbmUiLCJ2YWx1ZSIsInB1c2giLCJfYWRqdXN0VHlwZXNUb0pTT05WYWx1ZSIsImlkIiwiRXJyb3IiLCJzdHJpbmdpZnkiLCJNZXRob2RJbnZvY2F0aW9uIiwibmFtZSIsImlzU2ltdWxhdGlvbiIsIl91bmJsb2NrIiwidW5ibG9jayIsIl9jYWxsZWRVbmJsb2NrIiwiX2lzRnJvbUNhbGxBc3luYyIsImlzRnJvbUNhbGxBc3luYyIsInVzZXJJZCIsIl9zZXRVc2VySWQiLCJzZXRVc2VySWQiLCJjb25uZWN0aW9uIiwicmFuZG9tU2VlZCIsInJhbmRvbVN0cmVhbSIsImZlbmNlIiwiUmFuZG9tU3RyZWFtIiwic2VlZCIsImNvbmNhdCIsInJhbmRvbVRva2VuIiwic2VxdWVuY2VzIiwiY3JlYXRlIiwiX3NlcXVlbmNlIiwic2VsZiIsInNlcXVlbmNlIiwic2VxdWVuY2VTZWVkIiwiaSIsIlJhbmRvbSIsImNyZWF0ZVdpdGhTZWVkcyIsImFwcGx5IiwiaGV4U3RyaW5nIiwiZ2V0Iiwic2NvcGUiLCJpbnNlY3VyZSIsIm1ha2VScGNTZWVkIiwiZW5jbG9zaW5nIiwibWV0aG9kTmFtZSIsInN0cmVhbSJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBQSxTQUFTLEdBQUcsQ0FBQyxDQUFDLEM7Ozs7Ozs7Ozs7O0FDUmQ7QUFDQTtBQUNBO0FB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QUNBO0FBQ0F0RyxTQUFTLENBQUN3RixZQUFZLENBQUNlLEdBQUcsR0FBRyxVQUFVQyxLQUFLLEVBQUU5QixJQUFJLEVBQUU7RUFDbEQsSUFBSSxDQUFDQSxJQUFJLEVBQUU7SUFDVEEsSUFBSSxHQUFHLFNBQVM7RUFDbEI7RUFDQSxJQUFJLENBQUM4QixLQUFLLEVBQUU7SUFDVjtJQUNBO0lBQ0E7SUFDQTtJQUNBLE9BQU9MLE1BQU0sQ0FBQ00sUUFBUTtFQUN4QjtFQUNBLElBQUluQixZQUFZLEdBQUdrQixLQUFLLENBQUNsQixZQUFZO0VBQ3JDLElBQUksQ0FBQ0EsWUFBWSxFQUFFO0lBQ2pCa0IsS0FBSyxDQUFDbEIsWUFBWSxHQUFHQSxZQUFZLEdBQUcsSUFBSXRGLFNBQVMsQ0FBQ3dGLFlBQVksQ0FBQztNQUM3REMsSUFBSSxFQUFFZSxLQUFLLENBQUNuQjtJQUNkLENBQUMsQ0FBQztFQUNKO0VBQ0EsT0FBT0MsWUFBWSxDQUFDUSxTQUFTLENBQUNwQixJQUFJLENBQUM7QUFDckMsQ0FBQzs7QUFFRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTFFLFNBQVMsQ0FBQzBHLFdBQVcsR0FBRyxVQUFVQyxTQUFTLEVBQUVDLFVBQVUsRUFBRTtFQUN2RCxJQUFJQyxNQUFNLEdBQUc3RyxTQUFTLENBQUN3RixZQUFZLENBQUNlLEdBQUcsQ0FBQ0ksU0FBUyxFQUFFLE9BQU8sR0FBR0MsVUFBVSxDQUFDO0VBQ3hFLE9BQU9DLE1BQU0sQ0FBQ1AsU0FBUyxDQUFDLEVBQUUsQ0FBQztBQUM3QixDQUFDLEMiLCJmaWxlIjoiL3BhY2thZ2VzL2RkcC1jb21tb24uanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBuYW1lc3BhY2UgRERQQ29tbW9uXG4gKiBAc3VtbWFyeSBOYW1lc3BhY2UgZm9yIEREUENvbW1vbi1yZWxhdGVkIG1ldGhvZHMvY2xhc3Nlcy4gU2hhcmVkIGJldHdlZW4gXG4gKiBgZGRwLWNsaWVudGAgYW5kIGBkZHAtc2VydmVyYCwgd2hlcmUgdGhlIGRkcC1jbGllbnQgaXMgdGhlIGltcGxlbWVudGF0aW9uXG4gKiBvZiBhIGRkcCBjbGllbnQgZm9yIGJvdGggY2xpZW50IEFORCBzZXJ2ZXI7IGFuZCB0aGUgZGRwIHNlcnZlciBpcyB0aGVcbiAqIGltcGxlbWVudGF0aW9uIG9mIHRoZSBsaXZlZGF0YSBzZXJ2ZXIgYW5kIHN0cmVhbSBzZXJ2ZXIuIENvbW1vbiBcbiAqIGZ1bmN0aW9uYWxpdHkgc2hhcmVkIGJldHdlZW4gYm90aCBjYW4gYmUgc2hhcmVkIHVuZGVyIHRoaXMgbmFtZXNwYWNlXG4gKi9cbkREUENvbW1vbiA9IHt9O1xuIiwiLy8gSGVhcnRiZWF0IG9wdGlvbnM6XG4vLyAgIGhlYXJ0YmVhdEludGVydmFsOiBpbnRlcnZhbCB0byBzZW5kIHBpbmdzLCBpbiBtaWxsaXNlY29uZHMuXG4vLyAgIGhlYXJ0YmVhdFRpbWVvdXQ6IHRpbWVvdXQgdG8gY2xvc2UgdGhlIGNvbm5lY3Rpb24gaWYgYSByZXBseSBpc24ndFxuLy8gICAgIHJlY2VpdmVkLCBpbiBtaWxsaXNlY29uZHMuXG4vLyAgIHNlbmRQaW5nOiBmdW5jdGlvbiB0byBjYWxsIHRvIHNlbmQgYSBwaW5nIG9uIHRoZSBjb25uZWN0aW9uLlxuLy8gICBvblRpbWVvdXQ6IGZ1bmN0aW9uIHRvIGNhbGwgdG8gY2xvc2UgdGhlIGNvbm5lY3Rpb24uXG5cbkREUENvbW1vbi5IZWFydGJlYXQgPSBjbGFzcyBIZWFydGJlYXQge1xuICBjb25zdHJ1Y3RvcihvcHRpb25zKSB7XG4gICAgdGhpcy5oZWFydGJlYXRJbnRlcnZhbCA9IG9wdGlvbnMuaGVhcnRiZWF0SW50ZXJ2YWw7XG4gICAgdGhpcy5oZWFydGJlYXRUaW1lb3V0ID0gb3B0aW9ucy5oZWFydGJlYXRUaW1lb3V0O1xuICAgIHRoaXMuX3NlbmRQaW5nID0gb3B0aW9ucy5zZW5kUGluZztcbiAgICB0aGlzLl9vblRpbWVvdXQgPSBvcHRpb25zLm9uVGltZW91dDtcbiAgICB0aGlzLl9zZWVuUGFja2V0ID0gZmFsc2U7XG5cbiAgICB0aGlzLl9oZWFydGJlYXRJbnRlcnZhbEhhbmRsZSA9IG51bGw7XG4gICAgdGhpcy5faGVhcnRiZWF0VGltZW91dEhhbmRsZSA9IG51bGw7XG4gIH1cblxuICBzdG9wKCkge1xuICAgIHRoaXMuX2NsZWFySGVhcnRiZWF0SW50ZXJ2YWxUaW1lcigpO1xuICAgIHRoaXMuX2NsZWFySGVhcnRiZWF0VGltZW91dFRpbWVyKCk7XG4gIH1cblxuICBzdGFydCgpIHtcbiAgICB0aGlzLnN0b3AoKTtcbiAgICB0aGlzLl9zdGFydEhlYXJ0YmVhdEludGVydmFsVGltZXIoKTtcbiAgfVxuXG4gIF9zdGFydEhlYXJ0YmVhdEludGVydmFsVGltZXIoKSB7XG4gICAgdGhpcy5faGVhcnRiZWF0SW50ZXJ2YWxIYW5kbGUgPSBNZXRlb3Iuc2V0SW50ZXJ2YWwoXG4gICAgICAoKSA9PiB0aGlzLl9oZWFydGJlYXRJbnRlcnZhbEZpcmVkKCksXG4gICAgICB0aGlzLmhlYXJ0YmVhdEludGVydmFsXG4gICAgKTtcbiAgfVxuXG4gIF9zdGFydEhlYXJ0YmVhdFRpbWVvdXRUaW1lcigpIHtcbiAgICB0aGlzLl9oZWFydGJlYXRUaW1lb3V0SGFuZGxlID0gTWV0ZW9yLnNldFRpbWVvdXQoXG4gICAgICAoKSA9PiB0aGlzLl9oZWFydGJlYXRUaW1lb3V0RmlyZWQoKSxcbiAgICAgIHRoaXMuaGVhcnRiZWF0VGltZW91dFxuICAgICk7XG4gIH1cblxuICBfY2xlYXJIZWFydGJlYXRJbnRlcnZhbFRpbWVyKCkge1xuICAgIGlmICh0aGlzLl9oZWFydGJlYXRJbnRlcnZhbEhhbmRsZSkge1xuICAgICAgTWV0ZW9yLmNsZWFySW50ZXJ2YWwodGhpcy5faGVhcnRiZWF0SW50ZXJ2YWxIYW5kbGUpO1xuICAgICAgdGhpcy5faGVhcnRiZWF0SW50ZXJ2YWxIYW5kbGUgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIF9jbGVhckhlYXJ0YmVhdFRpbWVvdXRUaW1lcigpIHtcbiAgICBpZiAodGhpcy5faGVhcnRiZWF0VGltZW91dEhhbmRsZSkge1xuICAgICAgTWV0ZW9yLmNsZWFyVGltZW91dCh0aGlzLl9oZWFydGJlYXRUaW1lb3V0SGFuZGxlKTtcbiAgICAgIHRoaXMuX2hlYXJ0YmVhdFRpbWVvdXRIYW5kbGUgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIC8vIFRoZSBoZWFydGJlYXQgaW50ZXJ2YWwgdGltZXIgaXMgZmlyZWQgd2hlbiB3ZSBzaG91bGQgc2VuZCBhIHBpbmcuXG4gIF9oZWFydGJlYXRJbnRlcnZhbEZpcmVkKCkge1xuICAgIC8vIGRvbid0IHNlbmQgcGluZyBpZiB3ZSd2ZSBzZWVuIGEgcGFja2V0IHNpbmNlIHdlIGxhc3QgY2hlY2tlZCxcbiAgICAvLyAqb3IqIGlmIHdlIGhhdmUgYWxyZWFkeSBzZW50IGEgcGluZyBhbmQgYXJlIGF3YWl0aW5nIGEgdGltZW91dC5cbiAgICAvLyBUaGF0IHNob3VsZG4ndCBoYXBwZW4sIGJ1dCBpdCdzIHBvc3NpYmxlIGlmXG4gICAgLy8gYHRoaXMuaGVhcnRiZWF0SW50ZXJ2YWxgIGlzIHNtYWxsZXIgdGhhblxuICAgIC8vIGB0aGlzLmhlYXJ0YmVhdFRpbWVvdXRgLlxuICAgIGlmICghIHRoaXMuX3NlZW5QYWNrZXQgJiYgISB0aGlzLl9oZWFydGJlYXRUaW1lb3V0SGFuZGxlKSB7XG4gICAgICB0aGlzLl9zZW5kUGluZygpO1xuICAgICAgLy8gU2V0IHVwIHRpbWVvdXQsIGluIGNhc2UgYSBwb25nIGRvZXNuJ3QgYXJyaXZlIGluIHRpbWUuXG4gICAgICB0aGlzLl9zdGFydEhlYXJ0YmVhdFRpbWVvdXRUaW1lcigpO1xuICAgIH1cbiAgICB0aGlzLl9zZWVuUGFja2V0ID0gZmFsc2U7XG4gIH1cblxuICAvLyBUaGUgaGVhcnRiZWF0IHRpbWVvdXQgdGltZXIgaXMgZmlyZWQgd2hlbiB3ZSBzZW50IGEgcGluZywgYnV0IHdlXG4gIC8vIHRpbWVkIG91dCB3YWl0aW5nIGZvciB0aGUgcG9uZy5cbiAgX2hlYXJ0YmVhdFRpbWVvdXRGaXJlZCgpIHtcbiAgICB0aGlzLl9oZWFydGJlYXRUaW1lb3V0SGFuZGxlID0gbnVsbDtcbiAgICB0aGlzLl9vblRpbWVvdXQoKTtcbiAgfVxuXG4gIG1lc3NhZ2VSZWNlaXZlZCgpIHtcbiAgICAvLyBUZWxsIHBlcmlvZGljIGNoZWNraW4gdGhhdCB3ZSBoYXZlIHNlZW4gYSBwYWNrZXQsIGFuZCB0aHVzIGl0XG4gICAgLy8gZG9lcyBub3QgbmVlZCB0byBzZW5kIGEgcGluZyB0aGlzIGN5Y2xlLlxuICAgIHRoaXMuX3NlZW5QYWNrZXQgPSB0cnVlO1xuICAgIC8vIElmIHdlIHdlcmUgd2FpdGluZyBmb3IgYSBwb25nLCB3ZSBnb3QgaXQuXG4gICAgaWYgKHRoaXMuX2hlYXJ0YmVhdFRpbWVvdXRIYW5kbGUpIHtcbiAgICAgIHRoaXMuX2NsZWFySGVhcnRiZWF0VGltZW91dFRpbWVyKCk7XG4gICAgfVxuICB9XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbmV4cG9ydCBjb25zdCBoYXNPd24gPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5O1xuZXhwb3J0IGNvbnN0IHNsaWNlID0gQXJyYXkucHJvdG90eXBlLnNsaWNlO1xuXG5leHBvcnQgZnVuY3Rpb24ga2V5cyhvYmopIHtcbiAgcmV0dXJuIE9iamVjdC5rZXlzKE9iamVjdChvYmopKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzRW1wdHkob2JqKSB7XG4gIGlmIChvYmogPT0gbnVsbCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKEFycmF5LmlzQXJyYXkob2JqKSB8fFxuICAgICAgdHlwZW9mIG9iaiA9PT0gXCJzdHJpbmdcIikge1xuICAgIHJldHVybiBvYmoubGVuZ3RoID09PSAwO1xuICB9XG5cbiAgZm9yIChjb25zdCBrZXkgaW4gb2JqKSB7XG4gICAgaWYgKGhhc093bi5jYWxsKG9iaiwga2V5KSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGFzdChhcnJheSwgbiwgZ3VhcmQpIHtcbiAgaWYgKGFycmF5ID09IG51bGwpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoKG4gPT0gbnVsbCkgfHwgZ3VhcmQpIHtcbiAgICByZXR1cm4gYXJyYXlbYXJyYXkubGVuZ3RoIC0gMV07XG4gIH1cblxuICByZXR1cm4gc2xpY2UuY2FsbChhcnJheSwgTWF0aC5tYXgoYXJyYXkubGVuZ3RoIC0gbiwgMCkpO1xufVxuXG5ERFBDb21tb24uU1VQUE9SVEVEX0REUF9WRVJTSU9OUyA9IFsgJzEnLCAncHJlMicsICdwcmUxJyBdO1xuXG5ERFBDb21tb24ucGFyc2VERFAgPSBmdW5jdGlvbiAoc3RyaW5nTWVzc2FnZSkge1xuICB0cnkge1xuICAgIHZhciBtc2cgPSBKU09OLnBhcnNlKHN0cmluZ01lc3NhZ2UpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgTWV0ZW9yLl9kZWJ1ZyhcIkRpc2NhcmRpbmcgbWVzc2FnZSB3aXRoIGludmFsaWQgSlNPTlwiLCBzdHJpbmdNZXNzYWdlKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICAvLyBERFAgbWVzc2FnZXMgbXVzdCBiZSBvYmplY3RzLlxuICBpZiAobXNnID09PSBudWxsIHx8IHR5cGVvZiBtc2cgIT09ICdvYmplY3QnKSB7XG4gICAgTWV0ZW9yLl9kZWJ1ZyhcIkRpc2NhcmRpbmcgbm9uLW9iamVjdCBERFAgbWVzc2FnZVwiLCBzdHJpbmdNZXNzYWdlKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIC8vIG1hc3NhZ2UgbXNnIHRvIGdldCBpdCBpbnRvIFwiYWJzdHJhY3QgZGRwXCIgcmF0aGVyIHRoYW4gXCJ3aXJlIGRkcFwiIGZvcm1hdC5cblxuICAvLyBzd2l0Y2ggYmV0d2VlbiBcImNsZWFyZWRcIiByZXAgb2YgdW5zZXR0aW5nIGZpZWxkcyBhbmQgXCJ1bmRlZmluZWRcIlxuICAvLyByZXAgb2Ygc2FtZVxuICBpZiAoaGFzT3duLmNhbGwobXNnLCAnY2xlYXJlZCcpKSB7XG4gICAgaWYgKCEgaGFzT3duLmNhbGwobXNnLCAnZmllbGRzJykpIHtcbiAgICAgIG1zZy5maWVsZHMgPSB7fTtcbiAgICB9XG4gICAgbXNnLmNsZWFyZWQuZm9yRWFjaChjbGVhcktleSA9PiB7XG4gICAgICBtc2cuZmllbGRzW2NsZWFyS2V5XSA9IHVuZGVmaW5lZDtcbiAgICB9KTtcbiAgICBkZWxldGUgbXNnLmNsZWFyZWQ7XG4gIH1cblxuICBbJ2ZpZWxkcycsICdwYXJhbXMnLCAncmVzdWx0J10uZm9yRWFjaChmaWVsZCA9PiB7XG4gICAgaWYgKGhhc093bi5jYWxsKG1zZywgZmllbGQpKSB7XG4gICAgICBtc2dbZmllbGRdID0gRUpTT04uX2FkanVzdFR5cGVzRnJvbUpTT05WYWx1ZShtc2dbZmllbGRdKTtcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiBtc2c7XG59O1xuXG5ERFBDb21tb24uc3RyaW5naWZ5RERQID0gZnVuY3Rpb24gKG1zZykge1xuICBjb25zdCBjb3B5ID0gRUpTT04uY2xvbmUobXNnKTtcblxuICAvLyBzd2l6emxlICdjaGFuZ2VkJyBtZXNzYWdlcyBmcm9tICdmaWVsZHMgdW5kZWZpbmVkJyByZXAgdG8gJ2ZpZWxkc1xuICAvLyBhbmQgY2xlYXJlZCcgcmVwXG4gIGlmIChoYXNPd24uY2FsbChtc2csICdmaWVsZHMnKSkge1xuICAgIGNvbnN0IGNsZWFyZWQgPSBbXTtcblxuICAgIE9iamVjdC5rZXlzKG1zZy5maWVsZHMpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlID0gbXNnLmZpZWxkc1trZXldO1xuXG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgIGNsZWFyZWQucHVzaChrZXkpO1xuICAgICAgICBkZWxldGUgY29weS5maWVsZHNba2V5XTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmICghIGlzRW1wdHkoY2xlYXJlZCkpIHtcbiAgICAgIGNvcHkuY2xlYXJlZCA9IGNsZWFyZWQ7XG4gICAgfVxuXG4gICAgaWYgKGlzRW1wdHkoY29weS5maWVsZHMpKSB7XG4gICAgICBkZWxldGUgY29weS5maWVsZHM7XG4gICAgfVxuICB9XG5cbiAgLy8gYWRqdXN0IHR5cGVzIHRvIGJhc2ljXG4gIFsnZmllbGRzJywgJ3BhcmFtcycsICdyZXN1bHQnXS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICBpZiAoaGFzT3duLmNhbGwoY29weSwgZmllbGQpKSB7XG4gICAgICBjb3B5W2ZpZWxkXSA9IEVKU09OLl9hZGp1c3RUeXBlc1RvSlNPTlZhbHVlKGNvcHlbZmllbGRdKTtcbiAgICB9XG4gIH0pO1xuXG4gIGlmIChtc2cuaWQgJiYgdHlwZW9mIG1zZy5pZCAhPT0gJ3N0cmluZycpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJNZXNzYWdlIGlkIGlzIG5vdCBhIHN0cmluZ1wiKTtcbiAgfVxuXG4gIHJldHVybiBKU09OLnN0cmluZ2lmeShjb3B5KTtcbn07XG4iLCIvLyBJbnN0YW5jZSBuYW1lIGlzIHRoaXMgYmVjYXVzZSBpdCBpcyB1c3VhbGx5IHJlZmVycmVkIHRvIGFzIHRoaXMgaW5zaWRlIGFcbi8vIG1ldGhvZCBkZWZpbml0aW9uXG4vKipcbiAqIEBzdW1tYXJ5IFRoZSBzdGF0ZSBmb3IgYSBzaW5nbGUgaW52b2NhdGlvbiBvZiBhIG1ldGhvZCwgcmVmZXJlbmNlZCBieSB0aGlzXG4gKiBpbnNpZGUgYSBtZXRob2QgZGVmaW5pdGlvbi5cbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAaW5zdGFuY2VOYW1lIHRoaXNcbiAqIEBzaG93SW5zdGFuY2VOYW1lIHRydWVcbiAqL1xuRERQQ29tbW9uLk1ldGhvZEludm9jYXRpb24gPSBjbGFzcyBNZXRob2RJbnZvY2F0aW9uIHtcbiAgY29uc3RydWN0b3Iob3B0aW9ucykge1xuICAgIC8vIHRydWUgaWYgd2UncmUgcnVubmluZyBub3QgdGhlIGFjdHVhbCBtZXRob2QsIGJ1dCBhIHN0dWIgKHRoYXQgaXMsXG4gICAgLy8gaWYgd2UncmUgb24gYSBjbGllbnQgKHdoaWNoIG1heSBiZSBhIGJyb3dzZXIsIG9yIGluIHRoZSBmdXR1cmUgYVxuICAgIC8vIHNlcnZlciBjb25uZWN0aW5nIHRvIGFub3RoZXIgc2VydmVyKSBhbmQgcHJlc2VudGx5IHJ1bm5pbmcgYVxuICAgIC8vIHNpbXVsYXRpb24gb2YgYSBzZXJ2ZXItc2lkZSBtZXRob2QgZm9yIGxhdGVuY3kgY29tcGVuc2F0aW9uXG4gICAgLy8gcHVycG9zZXMpLiBub3QgY3VycmVudGx5IHRydWUgZXhjZXB0IGluIGEgY2xpZW50IHN1Y2ggYXMgYSBicm93c2VyLFxuICAgIC8vIHNpbmNlIHRoZXJlJ3MgdXN1YWxseSBubyBwb2ludCBpbiBydW5uaW5nIHN0dWJzIHVubGVzcyB5b3UgaGF2ZSBhXG4gICAgLy8gemVyby1sYXRlbmN5IGNvbm5lY3Rpb24gdG8gdGhlIHVzZXIuXG5cbiAgICAvKipcbiAgICAgKiBAc3VtbWFyeSBUaGUgbmFtZSBnaXZlbiB0byB0aGUgbWV0aG9kLlxuICAgICAqIEBsb2N1cyBBbnl3aGVyZVxuICAgICAqIEBuYW1lICBuYW1lXG4gICAgICogQG1lbWJlck9mIEREUENvbW1vbi5NZXRob2RJbnZvY2F0aW9uXG4gICAgICogQGluc3RhbmNlXG4gICAgICogQHR5cGUge1N0cmluZ31cbiAgICAgKi9cbiAgICB0aGlzLm5hbWUgPSBvcHRpb25zLm5hbWU7XG5cbiAgICAvKipcbiAgICAgKiBAc3VtbWFyeSBBY2Nlc3MgaW5zaWRlIGEgbWV0aG9kIGludm9jYXRpb24uICBCb29sZWFuIHZhbHVlLCB0cnVlIGlmIHRoaXMgaW52b2NhdGlvbiBpcyBhIHN0dWIuXG4gICAgICogQGxvY3VzIEFueXdoZXJlXG4gICAgICogQG5hbWUgIGlzU2ltdWxhdGlvblxuICAgICAqIEBtZW1iZXJPZiBERFBDb21tb24uTWV0aG9kSW52b2NhdGlvblxuICAgICAqIEBpbnN0YW5jZVxuICAgICAqIEB0eXBlIHtCb29sZWFufVxuICAgICAqL1xuICAgIHRoaXMuaXNTaW11bGF0aW9uID0gb3B0aW9ucy5pc1NpbXVsYXRpb247XG5cbiAgICAvLyBjYWxsIHRoaXMgZnVuY3Rpb24gdG8gYWxsb3cgb3RoZXIgbWV0aG9kIGludm9jYXRpb25zIChmcm9tIHRoZVxuICAgIC8vIHNhbWUgY2xpZW50KSB0byBjb250aW51ZSBydW5uaW5nIHdpdGhvdXQgd2FpdGluZyBmb3IgdGhpcyBvbmUgdG9cbiAgICAvLyBjb21wbGV0ZS5cbiAgICB0aGlzLl91bmJsb2NrID0gb3B0aW9ucy51bmJsb2NrIHx8IGZ1bmN0aW9uICgpIHt9O1xuICAgIHRoaXMuX2NhbGxlZFVuYmxvY2sgPSBmYWxzZTtcblxuICAgIC8vIHVzZWQgdG8ga25vdyB3aGVuIHRoZSBmdW5jdGlvbiBhcHBseSB3YXMgY2FsbGVkIGJ5IGNhbGxBc3luY1xuICAgIHRoaXMuX2lzRnJvbUNhbGxBc3luYyA9IG9wdGlvbnMuaXNGcm9tQ2FsbEFzeW5jO1xuXG4gICAgLy8gY3VycmVudCB1c2VyIGlkXG5cbiAgICAvKipcbiAgICAgKiBAc3VtbWFyeSBUaGUgaWQgb2YgdGhlIHVzZXIgdGhhdCBtYWRlIHRoaXMgbWV0aG9kIGNhbGwsIG9yIGBudWxsYCBpZiBubyB1c2VyIHdhcyBsb2dnZWQgaW4uXG4gICAgICogQGxvY3VzIEFueXdoZXJlXG4gICAgICogQG5hbWUgIHVzZXJJZFxuICAgICAqIEBtZW1iZXJPZiBERFBDb21tb24uTWV0aG9kSW52b2NhdGlvblxuICAgICAqIEBpbnN0YW5jZVxuICAgICAqL1xuICAgIHRoaXMudXNlcklkID0gb3B0aW9ucy51c2VySWQ7XG5cbiAgICAvLyBzZXRzIGN1cnJlbnQgdXNlciBpZCBpbiBhbGwgYXBwcm9wcmlhdGUgc2VydmVyIGNvbnRleHRzIGFuZFxuICAgIC8vIHJlcnVucyBzdWJzY3JpcHRpb25zXG4gICAgdGhpcy5fc2V0VXNlcklkID0gb3B0aW9ucy5zZXRVc2VySWQgfHwgZnVuY3Rpb24gKCkge307XG5cbiAgICAvLyBPbiB0aGUgc2VydmVyLCB0aGUgY29ubmVjdGlvbiB0aGlzIG1ldGhvZCBjYWxsIGNhbWUgaW4gb24uXG5cbiAgICAvKipcbiAgICAgKiBAc3VtbWFyeSBBY2Nlc3MgaW5zaWRlIGEgbWV0aG9kIGludm9jYXRpb24uIFRoZSBbY29ubmVjdGlvbl0oI21ldGVvcl9vbmNvbm5lY3Rpb24pIHRoYXQgdGhpcyBtZXRob2Qgd2FzIHJlY2VpdmVkIG9uLiBgbnVsbGAgaWYgdGhlIG1ldGhvZCBpcyBub3QgYXNzb2NpYXRlZCB3aXRoIGEgY29ubmVjdGlvbiwgZWcuIGEgc2VydmVyIGluaXRpYXRlZCBtZXRob2QgY2FsbC4gQ2FsbHMgdG8gbWV0aG9kcyBtYWRlIGZyb20gYSBzZXJ2ZXIgbWV0aG9kIHdoaWNoIHdhcyBpbiB0dXJuIGluaXRpYXRlZCBmcm9tIHRoZSBjbGllbnQgc2hhcmUgdGhlIHNhbWUgYGNvbm5lY3Rpb25gLlxuICAgICAqIEBsb2N1cyBTZXJ2ZXJcbiAgICAgKiBAbmFtZSAgY29ubmVjdGlvblxuICAgICAqIEBtZW1iZXJPZiBERFBDb21tb24uTWV0aG9kSW52b2NhdGlvblxuICAgICAqIEBpbnN0YW5jZVxuICAgICAqL1xuICAgIHRoaXMuY29ubmVjdGlvbiA9IG9wdGlvbnMuY29ubmVjdGlvbjtcblxuICAgIC8vIFRoZSBzZWVkIGZvciByYW5kb21TdHJlYW0gdmFsdWUgZ2VuZXJhdGlvblxuICAgIHRoaXMucmFuZG9tU2VlZCA9IG9wdGlvbnMucmFuZG9tU2VlZDtcblxuICAgIC8vIFRoaXMgaXMgc2V0IGJ5IFJhbmRvbVN0cmVhbS5nZXQ7IGFuZCBob2xkcyB0aGUgcmFuZG9tIHN0cmVhbSBzdGF0ZVxuICAgIHRoaXMucmFuZG9tU3RyZWFtID0gbnVsbDtcblxuICAgIHRoaXMuZmVuY2UgPSBvcHRpb25zLmZlbmNlO1xuICB9XG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IENhbGwgaW5zaWRlIGEgbWV0aG9kIGludm9jYXRpb24uICBBbGxvdyBzdWJzZXF1ZW50IG1ldGhvZCBmcm9tIHRoaXMgY2xpZW50IHRvIGJlZ2luIHJ1bm5pbmcgaW4gYSBuZXcgZmliZXIuXG4gICAqIEBsb2N1cyBTZXJ2ZXJcbiAgICogQG1lbWJlck9mIEREUENvbW1vbi5NZXRob2RJbnZvY2F0aW9uXG4gICAqIEBpbnN0YW5jZVxuICAgKi9cbiAgdW5ibG9jaygpIHtcbiAgICB0aGlzLl9jYWxsZWRVbmJsb2NrID0gdHJ1ZTtcbiAgICB0aGlzLl91bmJsb2NrKCk7XG4gIH1cblxuICAvKipcbiAgICogQHN1bW1hcnkgU2V0IHRoZSBsb2dnZWQgaW4gdXNlci5cbiAgICogQGxvY3VzIFNlcnZlclxuICAgKiBAbWVtYmVyT2YgRERQQ29tbW9uLk1ldGhvZEludm9jYXRpb25cbiAgICogQGluc3RhbmNlXG4gICAqIEBwYXJhbSB7U3RyaW5nIHwgbnVsbH0gdXNlcklkIFRoZSB2YWx1ZSB0aGF0IHNob3VsZCBiZSByZXR1cm5lZCBieSBgdXNlcklkYCBvbiB0aGlzIGNvbm5lY3Rpb24uXG4gICAqL1xuICBhc3luYyBzZXRVc2VySWQodXNlcklkKSB7XG4gICAgaWYgKHRoaXMuX2NhbGxlZFVuYmxvY2spIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IGNhbGwgc2V0VXNlcklkIGluIGEgbWV0aG9kIGFmdGVyIGNhbGxpbmcgdW5ibG9ja1wiKTtcbiAgICB9XG4gICAgdGhpcy51c2VySWQgPSB1c2VySWQ7XG4gICAgYXdhaXQgdGhpcy5fc2V0VXNlcklkKHVzZXJJZCk7XG4gIH1cbn07XG4iLCIvLyBSYW5kb21TdHJlYW0gYWxsb3dzIGZvciBnZW5lcmF0aW9uIG9mIHBzZXVkby1yYW5kb20gdmFsdWVzLCBmcm9tIGEgc2VlZC5cbi8vXG4vLyBXZSB1c2UgdGhpcyBmb3IgY29uc2lzdGVudCAncmFuZG9tJyBudW1iZXJzIGFjcm9zcyB0aGUgY2xpZW50IGFuZCBzZXJ2ZXIuXG4vLyBXZSB3YW50IHRvIGdlbmVyYXRlIHByb2JhYmx5LXVuaXF1ZSBJRHMgb24gdGhlIGNsaWVudCwgYW5kIHdlIGlkZWFsbHkgd2FudFxuLy8gdGhlIHNlcnZlciB0byBnZW5lcmF0ZSB0aGUgc2FtZSBJRHMgd2hlbiBpdCBleGVjdXRlcyB0aGUgbWV0aG9kLlxuLy9cbi8vIEZvciBnZW5lcmF0ZWQgdmFsdWVzIHRvIGJlIHRoZSBzYW1lLCB3ZSBtdXN0IHNlZWQgb3Vyc2VsdmVzIHRoZSBzYW1lIHdheSxcbi8vIGFuZCB3ZSBtdXN0IGtlZXAgdHJhY2sgb2YgdGhlIGN1cnJlbnQgc3RhdGUgb2Ygb3VyIHBzZXVkby1yYW5kb20gZ2VuZXJhdG9ycy5cbi8vIFdlIGNhbGwgdGhpcyBzdGF0ZSB0aGUgc2NvcGUuIEJ5IGRlZmF1bHQsIHdlIHVzZSB0aGUgY3VycmVudCBERFAgbWV0aG9kXG4vLyBpbnZvY2F0aW9uIGFzIG91ciBzY29wZS4gIEREUCBub3cgYWxsb3dzIHRoZSBjbGllbnQgdG8gc3BlY2lmeSBhIHJhbmRvbVNlZWQuXG4vLyBJZiBhIHJhbmRvbVNlZWQgaXMgcHJvdmlkZWQgaXQgd2lsbCBiZSB1c2VkIHRvIHNlZWQgb3VyIHJhbmRvbSBzZXF1ZW5jZXMuXG4vLyBJbiB0aGlzIHdheSwgY2xpZW50IGFuZCBzZXJ2ZXIgbWV0aG9kIGNhbGxzIHdpbGwgZ2VuZXJhdGUgdGhlIHNhbWUgdmFsdWVzLlxuLy9cbi8vIFdlIGV4cG9zZSBtdWx0aXBsZSBuYW1lZCBzdHJlYW1zOyBlYWNoIHN0cmVhbSBpcyBpbmRlcGVuZGVudFxuLy8gYW5kIGlzIHNlZWRlZCBkaWZmZXJlbnRseSAoYnV0IHByZWRpY3RhYmx5IGZyb20gdGhlIG5hbWUpLlxuLy8gQnkgdXNpbmcgbXVsdGlwbGUgc3RyZWFtcywgd2Ugc3VwcG9ydCByZW9yZGVyaW5nIG9mIHJlcXVlc3RzLFxuLy8gYXMgbG9uZyBhcyB0aGV5IG9jY3VyIG9uIGRpZmZlcmVudCBzdHJlYW1zLlxuLy9cbi8vIEBwYXJhbSBvcHRpb25zIHtPcHRpb25hbCBPYmplY3R9XG4vLyAgIHNlZWQ6IEFycmF5IG9yIHZhbHVlIC0gU2VlZCB2YWx1ZShzKSBmb3IgdGhlIGdlbmVyYXRvci5cbi8vICAgICAgICAgICAgICAgICAgICAgICAgICBJZiBhbiBhcnJheSwgd2lsbCBiZSB1c2VkIGFzLWlzXG4vLyAgICAgICAgICAgICAgICAgICAgICAgICAgSWYgYSB2YWx1ZSwgd2lsbCBiZSBjb252ZXJ0ZWQgdG8gYSBzaW5nbGUtdmFsdWUgYXJyYXlcbi8vICAgICAgICAgICAgICAgICAgICAgICAgICBJZiBvbWl0dGVkLCBhIHJhbmRvbSBhcnJheSB3aWxsIGJlIHVzZWQgYXMgdGhlIHNlZWQuXG5ERFBDb21tb24uUmFuZG9tU3RyZWFtID0gY2xhc3MgUmFuZG9tU3RyZWFtIHtcbiAgY29uc3RydWN0b3Iob3B0aW9ucykge1xuICAgIHRoaXMuc2VlZCA9IFtdLmNvbmNhdChvcHRpb25zLnNlZWQgfHwgcmFuZG9tVG9rZW4oKSk7XG4gICAgdGhpcy5zZXF1ZW5jZXMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICB9XG5cbiAgLy8gR2V0IGEgcmFuZG9tIHNlcXVlbmNlIHdpdGggdGhlIHNwZWNpZmllZCBuYW1lLCBjcmVhdGluZyBpdCBpZiBkb2VzIG5vdCBleGlzdC5cbiAgLy8gTmV3IHNlcXVlbmNlcyBhcmUgc2VlZGVkIHdpdGggdGhlIHNlZWQgY29uY2F0ZW5hdGVkIHdpdGggdGhlIG5hbWUuXG4gIC8vIEJ5IHBhc3NpbmcgYSBzZWVkIGludG8gUmFuZG9tLmNyZWF0ZSwgd2UgdXNlIHRoZSBBbGVhIGdlbmVyYXRvci5cbiAgX3NlcXVlbmNlKG5hbWUpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICB2YXIgc2VxdWVuY2UgPSBzZWxmLnNlcXVlbmNlc1tuYW1lXSB8fCBudWxsO1xuICAgIGlmIChzZXF1ZW5jZSA9PT0gbnVsbCkge1xuICAgICAgdmFyIHNlcXVlbmNlU2VlZCA9IHNlbGYuc2VlZC5jb25jYXQobmFtZSk7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNlcXVlbmNlU2VlZC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAodHlwZW9mIHNlcXVlbmNlU2VlZFtpXSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgc2VxdWVuY2VTZWVkW2ldID0gc2VxdWVuY2VTZWVkW2ldKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHNlbGYuc2VxdWVuY2VzW25hbWVdID0gc2VxdWVuY2UgPSBSYW5kb20uY3JlYXRlV2l0aFNlZWRzLmFwcGx5KG51bGwsIHNlcXVlbmNlU2VlZCk7XG4gICAgfVxuICAgIHJldHVybiBzZXF1ZW5jZTtcbiAgfVxufTtcblxuLy8gUmV0dXJucyBhIHJhbmRvbSBzdHJpbmcgb2Ygc3VmZmljaWVudCBsZW5ndGggZm9yIGEgcmFuZG9tIHNlZWQuXG4vLyBUaGlzIGlzIGEgcGxhY2Vob2xkZXIgZnVuY3Rpb247IGEgc2ltaWxhciBmdW5jdGlvbiBpcyBwbGFubmVkXG4vLyBmb3IgUmFuZG9tIGl0c2VsZjsgd2hlbiB0aGF0IGlzIGFkZGVkIHdlIHNob3VsZCByZW1vdmUgdGhpcyBmdW5jdGlvbixcbi8vIGFuZCBjYWxsIFJhbmRvbSdzIHJhbmRvbVRva2VuIGluc3RlYWQuXG5mdW5jdGlvbiByYW5kb21Ub2tlbigpIHtcbiAgcmV0dXJuIFJhbmRvbS5oZXhTdHJpbmcoMjApO1xufTtcblxuLy8gUmV0dXJucyB0aGUgcmFuZG9tIHN0cmVhbSB3aXRoIHRoZSBzcGVjaWZpZWQgbmFtZSwgaW4gdGhlIHNwZWNpZmllZFxuLy8gc2NvcGUuIElmIGEgc2NvcGUgaXMgcGFzc2VkLCB0aGVuIHdlIHVzZSB0aGF0IHRvIHNlZWQgYSAobm90XG4vLyBjcnlwdG9ncmFwaGljYWxseSBzZWN1cmUpIFBSTkcgdXNpbmcgdGhlIGZhc3QgQWxlYSBhbGdvcml0aG0uICBJZlxuLy8gc2NvcGUgaXMgbnVsbCAob3Igb3RoZXJ3aXNlIGZhbHNleSkgdGhlbiB3ZSB1c2UgYSBnZW5lcmF0ZWQgc2VlZC5cbi8vXG4vLyBIb3dldmVyLCBzY29wZSB3aWxsIG5vcm1hbGx5IGJlIHRoZSBjdXJyZW50IEREUCBtZXRob2QgaW52b2NhdGlvbixcbi8vIHNvIHdlJ2xsIHVzZSB0aGUgc3RyZWFtIHdpdGggdGhlIHNwZWNpZmllZCBuYW1lLCBhbmQgd2Ugc2hvdWxkIGdldFxuLy8gY29uc2lzdGVudCB2YWx1ZXMgb24gdGhlIGNsaWVudCBhbmQgc2VydmVyIHNpZGVzIG9mIGEgbWV0aG9kIGNhbGwuXG5ERFBDb21tb24uUmFuZG9tU3RyZWFtLmdldCA9IGZ1bmN0aW9uIChzY29wZSwgbmFtZSkge1xuICBpZiAoIW5hbWUpIHtcbiAgICBuYW1lID0gXCJkZWZhdWx0XCI7XG4gIH1cbiAgaWYgKCFzY29wZSkge1xuICAgIC8vIFRoZXJlIHdhcyBubyBzY29wZSBwYXNzZWQgaW47IHRoZSBzZXF1ZW5jZSB3b24ndCBhY3R1YWxseSBiZVxuICAgIC8vIHJlcHJvZHVjaWJsZS4gYnV0IG1ha2UgaXQgZmFzdCAoYW5kIG5vdCBjcnlwdG9ncmFwaGljYWxseVxuICAgIC8vIHNlY3VyZSkgYW55d2F5cywgc28gdGhhdCB0aGUgYmVoYXZpb3IgaXMgc2ltaWxhciB0byB3aGF0IHlvdSdkXG4gICAgLy8gZ2V0IGJ5IHBhc3NpbmcgaW4gYSBzY29wZS5cbiAgICByZXR1cm4gUmFuZG9tLmluc2VjdXJlO1xuICB9XG4gIHZhciByYW5kb21TdHJlYW0gPSBzY29wZS5yYW5kb21TdHJlYW07XG4gIGlmICghcmFuZG9tU3RyZWFtKSB7XG4gICAgc2NvcGUucmFuZG9tU3RyZWFtID0gcmFuZG9tU3RyZWFtID0gbmV3IEREUENvbW1vbi5SYW5kb21TdHJlYW0oe1xuICAgICAgc2VlZDogc2NvcGUucmFuZG9tU2VlZFxuICAgIH0pO1xuICB9XG4gIHJldHVybiByYW5kb21TdHJlYW0uX3NlcXVlbmNlKG5hbWUpO1xufTtcblxuLy8gQ3JlYXRlcyBhIHJhbmRvbVNlZWQgZm9yIHBhc3NpbmcgdG8gYSBtZXRob2QgY2FsbC5cbi8vIE5vdGUgdGhhdCB3ZSB0YWtlIGVuY2xvc2luZyBhcyBhbiBhcmd1bWVudCxcbi8vIHRob3VnaCB3ZSBleHBlY3QgaXQgdG8gYmUgRERQLl9DdXJyZW50TWV0aG9kSW52b2NhdGlvbi5nZXQoKVxuLy8gSG93ZXZlciwgd2Ugb2Z0ZW4gZXZhbHVhdGUgbWFrZVJwY1NlZWQgbGF6aWx5LCBhbmQgdGh1cyB0aGUgcmVsZXZhbnRcbi8vIGludm9jYXRpb24gbWF5IG5vdCBiZSB0aGUgb25lIGN1cnJlbnRseSBpbiBzY29wZS5cbi8vIElmIGVuY2xvc2luZyBpcyBudWxsLCB3ZSdsbCB1c2UgUmFuZG9tIGFuZCB2YWx1ZXMgd29uJ3QgYmUgcmVwZWF0YWJsZS5cbkREUENvbW1vbi5tYWtlUnBjU2VlZCA9IGZ1bmN0aW9uIChlbmNsb3NpbmcsIG1ldGhvZE5hbWUpIHtcbiAgdmFyIHN0cmVhbSA9IEREUENvbW1vbi5SYW5kb21TdHJlYW0uZ2V0KGVuY2xvc2luZywgJy9ycGMvJyArIG1ldGhvZE5hbWUpO1xuICByZXR1cm4gc3RyZWFtLmhleFN0cmluZygyMCk7XG59O1xuIl19
