Package["core-runtime"].queue("tracker",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;
var ECMAScript = Package.ecmascript.ECMAScript;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var Tracker, Deps;

var require = meteorInstall({"node_modules":{"meteor":{"tracker":{"tracker.js":function module(){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/tracker/tracker.js                                                                                        //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
/////////////////////////////////////////////////////
// Package docs at http://docs.meteor.com/#tracker //
/////////////////////////////////////////////////////

/**
 * @namespace Tracker
 * @summary The namespace for Tracker-related methods.
 */
Tracker = {};

/**
 * @namespace Deps
 * @deprecated
 */
Deps = Tracker;

// http://docs.meteor.com/#tracker_active

/**
 * @summary True if there is a current computation, meaning that dependencies on reactive data sources will be tracked and potentially cause the current computation to be rerun.
 * @locus Client
 * @type {Boolean}
 */
Tracker.active = false;

// http://docs.meteor.com/#tracker_currentcomputation

/**
 * @summary The current computation, or `null` if there isn't one.  The current computation is the [`Tracker.Computation`](#tracker_computation) object created by the innermost active call to `Tracker.autorun`, and it's the computation that gains dependencies when reactive data sources are accessed.
 * @locus Client
 * @type {Tracker.Computation}
 */
Tracker.currentComputation = null;
function _debugFunc() {
  // We want this code to work without Meteor, and also without
  // "console" (which is technically non-standard and may be missing
  // on some browser we come across, like it was on IE 7).
  //
  // Lazy evaluation because `Meteor` does not exist right away.(??)
  return typeof Meteor !== "undefined" ? Meteor._debug : typeof console !== "undefined" && console.error ? function () {
    console.error.apply(console, arguments);
  } : function () {};
}
function _maybeSuppressMoreLogs(messagesLength) {
  // Sometimes when running tests, we intentionally suppress logs on expected
  // printed errors. Since the current implementation of _throwOrLog can log
  // multiple separate log messages, suppress all of them if at least one suppress
  // is expected as we still want them to count as one.
  if (typeof Meteor !== "undefined") {
    if (Meteor._suppressed_log_expected()) {
      Meteor._suppress_log(messagesLength - 1);
    }
  }
}
function _throwOrLog(from, e) {
  if (throwFirstError) {
    throw e;
  } else {
    var printArgs = ["Exception from Tracker " + from + " function:"];
    if (e.stack && e.message && e.name) {
      var idx = e.stack.indexOf(e.message);
      if (idx < 0 || idx > e.name.length + 2) {
        // check for "Error: "
        // message is not part of the stack
        var message = e.name + ": " + e.message;
        printArgs.push(message);
      }
    }
    printArgs.push(e.stack);
    _maybeSuppressMoreLogs(printArgs.length);
    for (var i = 0; i < printArgs.length; i++) {
      _debugFunc()(printArgs[i]);
    }
  }
}

// Takes a function `f`, and wraps it in a `Meteor._noYieldsAllowed`
// block if we are running on the server. On the client, returns the
// original function (since `Meteor._noYieldsAllowed` is a
// no-op). This has the benefit of not adding an unnecessary stack
// frame on the client.
function withNoYieldsAllowed(f) {
  if (typeof Meteor === 'undefined' || Meteor.isClient) {
    return f;
  } else {
    return function () {
      var args = arguments;
      Meteor._noYieldsAllowed(function () {
        f.apply(null, args);
      });
    };
  }
}
var nextId = 1;
// computations whose callbacks we should call at flush time
var pendingComputations = [];
// `true` if a Tracker.flush is scheduled, or if we are in Tracker.flush now
var willFlush = false;
// `true` if we are in Tracker.flush now
var inFlush = false;
// `true` if we are computing a computation now, either first time
// or recompute.  This matches Tracker.active unless we are inside
// Tracker.nonreactive, which nullfies currentComputation even though
// an enclosing computation may still be running.
var inCompute = false;
// `true` if the `_throwFirstError` option was passed in to the call
// to Tracker.flush that we are in. When set, throw rather than log the
// first error encountered while flushing. Before throwing the error,
// finish flushing (from a finally block), logging any subsequent
// errors.
var throwFirstError = false;
var afterFlushCallbacks = [];
function requireFlush() {
  if (!willFlush) {
    // We want this code to work without Meteor, see debugFunc above
    if (typeof Meteor !== "undefined") Meteor._setImmediate(Tracker._runFlush);else setTimeout(Tracker._runFlush, 0);
    willFlush = true;
  }
}

// Tracker.Computation constructor is visible but private
// (throws an error if you try to call it)
var constructingComputation = false;

//
// http://docs.meteor.com/#tracker_computation

/**
 * @summary A Computation object represents code that is repeatedly rerun
 * in response to
 * reactive data changes. Computations don't have return values; they just
 * perform actions, such as rerendering a template on the screen. Computations
 * are created using Tracker.autorun. Use stop to prevent further rerunning of a
 * computation.
 * @instancename computation
 */
Tracker.Computation = class Computation {
  constructor(f, parent, onError) {
    if (!constructingComputation) throw new Error("Tracker.Computation constructor is private; use Tracker.autorun");
    constructingComputation = false;

    // http://docs.meteor.com/#computation_stopped

    /**
     * @summary True if this computation has been stopped.
     * @locus Client
     * @memberOf Tracker.Computation
     * @instance
     * @name  stopped
     */
    this.stopped = false;

    // http://docs.meteor.com/#computation_invalidated

    /**
     * @summary True if this computation has been invalidated (and not yet rerun), or if it has been stopped.
     * @locus Client
     * @memberOf Tracker.Computation
     * @instance
     * @name  invalidated
     * @type {Boolean}
     */
    this.invalidated = false;

    // http://docs.meteor.com/#computation_firstrun

    /**
     * @summary True during the initial run of the computation at the time `Tracker.autorun` is called, and false on subsequent reruns and at other times.
     * @locus Client
     * @memberOf Tracker.Computation
     * @instance
     * @name  firstRun
     * @type {Boolean}
     */
    this.firstRun = true;
    this._id = nextId++;
    this._onInvalidateCallbacks = [];
    this._onStopCallbacks = [];
    // the plan is at some point to use the parent relation
    // to constrain the order that computations are processed
    this._parent = parent;
    this._func = f;
    this._onError = onError;
    this._recomputing = false;

    /**
     * @summary Forces autorun blocks to be executed in synchronous-looking order by storing the value autorun promise thus making it awaitable.
     * @locus Client
     * @memberOf Tracker.Computation
     * @instance
     * @name  firstRunPromise
     * @returns {Promise<unknown>}
     */
    this.firstRunPromise = undefined;
    var errored = true;
    try {
      this._compute();
      errored = false;
    } finally {
      this.firstRun = false;
      if (errored) this.stop();
    }
  }

  /**
  * Resolves the firstRunPromise with the result of the autorun function.
  * @param {*} onResolved
  * @param {*} onRejected
  * @returns{Promise<unknown}
  */
  then(onResolved, onRejected) {
    return this.firstRunPromise.then(onResolved, onRejected);
  }
  catch(onRejected) {
    return this.firstRunPromise.catch(onRejected);
  }
  // http://docs.meteor.com/#computation_oninvalidate

  /**
   * @summary Registers `callback` to run when this computation is next invalidated, or runs it immediately if the computation is already invalidated.  The callback is run exactly once and not upon future invalidations unless `onInvalidate` is called again after the computation becomes valid again.
   * @locus Client
   * @param {Function} callback Function to be called on invalidation. Receives one argument, the computation that was invalidated.
   */
  onInvalidate(f) {
    if (typeof f !== 'function') throw new Error("onInvalidate requires a function");
    if (this.invalidated) {
      Tracker.nonreactive(() => {
        withNoYieldsAllowed(f)(this);
      });
    } else {
      this._onInvalidateCallbacks.push(f);
    }
  }

  /**
   * @summary Registers `callback` to run when this computation is stopped, or runs it immediately if the computation is already stopped.  The callback is run after any `onInvalidate` callbacks.
   * @locus Client
   * @param {Function} callback Function to be called on stop. Receives one argument, the computation that was stopped.
   */
  onStop(f) {
    if (typeof f !== 'function') throw new Error("onStop requires a function");
    if (this.stopped) {
      Tracker.nonreactive(() => {
        withNoYieldsAllowed(f)(this);
      });
    } else {
      this._onStopCallbacks.push(f);
    }
  }

  // http://docs.meteor.com/#computation_invalidate

  /**
   * @summary Invalidates this computation so that it will be rerun.
   * @locus Client
   */
  invalidate() {
    if (!this.invalidated) {
      // if we're currently in _recompute(), don't enqueue
      // ourselves, since we'll rerun immediately anyway.
      if (!this._recomputing && !this.stopped) {
        requireFlush();
        pendingComputations.push(this);
      }
      this.invalidated = true;

      // callbacks can't add callbacks, because
      // this.invalidated === true.
      for (var i = 0, f; f = this._onInvalidateCallbacks[i]; i++) {
        Tracker.nonreactive(() => {
          withNoYieldsAllowed(f)(this);
        });
      }
      this._onInvalidateCallbacks = [];
    }
  }

  // http://docs.meteor.com/#computation_stop

  /**
   * @summary Prevents this computation from rerunning.
   * @locus Client
   */
  stop() {
    if (!this.stopped) {
      this.stopped = true;
      this.invalidate();
      for (var i = 0, f; f = this._onStopCallbacks[i]; i++) {
        Tracker.nonreactive(() => {
          withNoYieldsAllowed(f)(this);
        });
      }
      this._onStopCallbacks = [];
    }
  }
  _compute() {
    this.invalidated = false;
    var previousInCompute = inCompute;
    inCompute = true;
    try {
      // In case of async functions, the result of this function will contain the promise of the autorun function
      // & make autoruns await-able.
      const firstRunPromise = Tracker.withComputation(this, () => {
        return withNoYieldsAllowed(this._func)(this);
      });
      // We'll store the firstRunPromise on the computation so it can be awaited by the callers, but only
      // during the first run. We don't want things to get mixed up.
      if (this.firstRun) {
        this.firstRunPromise = Promise.resolve(firstRunPromise);
      }
    } finally {
      inCompute = previousInCompute;
    }
  }
  _needsRecompute() {
    return this.invalidated && !this.stopped;
  }
  _recompute() {
    this._recomputing = true;
    try {
      if (this._needsRecompute()) {
        try {
          this._compute();
        } catch (e) {
          if (this._onError) {
            this._onError(e);
          } else {
            _throwOrLog("recompute", e);
          }
        }
      }
    } finally {
      this._recomputing = false;
    }
  }

  /**
   * @summary Process the reactive updates for this computation immediately
   * and ensure that the computation is rerun. The computation is rerun only
   * if it is invalidated.
   * @locus Client
   */
  flush() {
    if (this._recomputing) return;
    this._recompute();
  }

  /**
   * @summary Causes the function inside this computation to run and
   * synchronously process all reactive updtes.
   * @locus Client
   */
  run() {
    this.invalidate();
    this.flush();
  }
};

//
// http://docs.meteor.com/#tracker_dependency

/**
 * @summary A Dependency represents an atomic unit of reactive data that a
 * computation might depend on. Reactive data sources such as Session or
 * Minimongo internally create different Dependency objects for different
 * pieces of data, each of which may be depended on by multiple computations.
 * When the data changes, the computations are invalidated.
 * @class
 * @instanceName dependency
 */
Tracker.Dependency = class Dependency {
  constructor() {
    this._dependentsById = Object.create(null);
  }

  // http://docs.meteor.com/#dependency_depend
  //
  // Adds `computation` to this set if it is not already
  // present.  Returns true if `computation` is a new member of the set.
  // If no argument, defaults to currentComputation, or does nothing
  // if there is no currentComputation.

  /**
   * @summary Declares that the current computation (or `fromComputation` if given) depends on `dependency`.  The computation will be invalidated the next time `dependency` changes.
    If there is no current computation and `depend()` is called with no arguments, it does nothing and returns false.
    Returns true if the computation is a new dependent of `dependency` rather than an existing one.
   * @locus Client
   * @param {Tracker.Computation} [fromComputation] An optional computation declared to depend on `dependency` instead of the current computation.
   * @returns {Boolean}
   */
  depend(computation) {
    if (!computation) {
      if (!Tracker.active) return false;
      computation = Tracker.currentComputation;
    }
    var id = computation._id;
    if (!(id in this._dependentsById)) {
      this._dependentsById[id] = computation;
      computation.onInvalidate(() => {
        delete this._dependentsById[id];
      });
      return true;
    }
    return false;
  }

  // http://docs.meteor.com/#dependency_changed

  /**
   * @summary Invalidate all dependent computations immediately and remove them as dependents.
   * @locus Client
   */
  changed() {
    for (var id in this._dependentsById) this._dependentsById[id].invalidate();
  }

  // http://docs.meteor.com/#dependency_hasdependents

  /**
   * @summary True if this Dependency has one or more dependent Computations, which would be invalidated if this Dependency were to change.
   * @locus Client
   * @returns {Boolean}
   */
  hasDependents() {
    for (var id in this._dependentsById) return true;
    return false;
  }
};

// http://docs.meteor.com/#tracker_flush

/**
 * @summary Process all reactive updates immediately and ensure that all invalidated computations are rerun.
 * @locus Client
 */
Tracker.flush = function (options) {
  Tracker._runFlush({
    finishSynchronously: true,
    throwFirstError: options && options._throwFirstError
  });
};

/**
 * @summary True if we are computing a computation now, either first time or recompute.  This matches Tracker.active unless we are inside Tracker.nonreactive, which nullfies currentComputation even though an enclosing computation may still be running.
 * @locus Client
 * @returns {Boolean}
 */
Tracker.inFlush = function () {
  return inFlush;
};

// Run all pending computations and afterFlush callbacks.  If we were not called
// directly via Tracker.flush, this may return before they're all done to allow
// the event loop to run a little before continuing.
Tracker._runFlush = function (options) {
  // XXX What part of the comment below is still true? (We no longer
  // have Spark)
  //
  // Nested flush could plausibly happen if, say, a flush causes
  // DOM mutation, which causes a "blur" event, which runs an
  // app event handler that calls Tracker.flush.  At the moment
  // Spark blocks event handlers during DOM mutation anyway,
  // because the LiveRange tree isn't valid.  And we don't have
  // any useful notion of a nested flush.
  //
  // https://app.asana.com/0/159908330244/385138233856
  if (Tracker.inFlush()) throw new Error("Can't call Tracker.flush while flushing");
  if (inCompute) throw new Error("Can't flush inside Tracker.autorun");
  options = options || {};
  inFlush = true;
  willFlush = true;
  throwFirstError = !!options.throwFirstError;
  var recomputedCount = 0;
  var finishedTry = false;
  try {
    while (pendingComputations.length || afterFlushCallbacks.length) {
      // recompute all pending computations
      while (pendingComputations.length) {
        var comp = pendingComputations.shift();
        comp._recompute();
        if (comp._needsRecompute()) {
          pendingComputations.unshift(comp);
        }
        if (!options.finishSynchronously && ++recomputedCount > 1000) {
          finishedTry = true;
          return;
        }
      }
      if (afterFlushCallbacks.length) {
        // call one afterFlush callback, which may
        // invalidate more computations
        var func = afterFlushCallbacks.shift();
        try {
          func();
        } catch (e) {
          _throwOrLog("afterFlush", e);
        }
      }
    }
    finishedTry = true;
  } finally {
    if (!finishedTry) {
      // we're erroring due to throwFirstError being true.
      inFlush = false; // needed before calling `Tracker.flush()` again
      // finish flushing
      Tracker._runFlush({
        finishSynchronously: options.finishSynchronously,
        throwFirstError: false
      });
    }
    willFlush = false;
    inFlush = false;
    if (pendingComputations.length || afterFlushCallbacks.length) {
      // We're yielding because we ran a bunch of computations and we aren't
      // required to finish synchronously, so we'd like to give the event loop a
      // chance. We should flush again soon.
      if (options.finishSynchronously) {
        throw new Error("still have more to do?"); // shouldn't happen
      }
      setTimeout(requireFlush, 10);
    }
  }
};

// http://docs.meteor.com/#tracker_autorun
//
// Run f(). Record its dependencies. Rerun it whenever the
// dependencies change.
//
// Returns a new Computation, which is also passed to f.
//
// Links the computation to the current computation
// so that it is stopped if the current computation is invalidated.

/**
 * @callback Tracker.ComputationFunction
 * @param {Tracker.Computation}
 */
/**
 * @summary Run a function now and rerun it later whenever its dependencies
 * change. Returns a Computation object that can be used to stop or observe the
 * rerunning.
 * @locus Client
 * @param {Tracker.ComputationFunction} runFunc The function to run. It receives
 * one argument: the Computation object that will be returned.
 * @param {Object} [options]
 * @param {Function} options.onError Optional. The function to run when an error
 * happens in the Computation. The only argument it receives is the Error
 * thrown. Defaults to the error being logged to the console.
 * @returns {Tracker.Computation}
 */
Tracker.autorun = function (f) {
  let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  if (typeof f !== 'function') throw new Error('Tracker.autorun requires a function argument');
  constructingComputation = true;
  var c = new Tracker.Computation(f, Tracker.currentComputation, options.onError);
  if (Tracker.active) Tracker.onInvalidate(function () {
    c.stop();
  });
  return c;
};

// http://docs.meteor.com/#tracker_nonreactive
//
// Run `f` with no current computation, returning the return value
// of `f`.  Used to turn off reactivity for the duration of `f`,
// so that reactive data sources accessed by `f` will not result in any
// computations being invalidated.

/**
 * @summary Run a function without tracking dependencies.
 * @locus Client
 * @param {Function} func A function to call immediately.
 */
Tracker.nonreactive = function (f) {
  return Tracker.withComputation(null, f);
};

/**
 * @summary Helper function to make the tracker work with promises.
 * @param computation Computation that tracked
 * @param func async function that needs to be called and be reactive
 */
Tracker.withComputation = function (computation, f) {
  var previousComputation = Tracker.currentComputation;
  Tracker.currentComputation = computation;
  Tracker.active = !!computation;
  try {
    return f();
  } finally {
    Tracker.currentComputation = previousComputation;
    Tracker.active = !!previousComputation;
  }
};

// http://docs.meteor.com/#tracker_oninvalidate

/**
 * @summary Registers a new [`onInvalidate`](#computation_oninvalidate) callback on the current computation (which must exist), to be called immediately when the current computation is invalidated or stopped.
 * @locus Client
 * @param {Function} callback A callback function that will be invoked as `func(c)`, where `c` is the computation on which the callback is registered.
 */
Tracker.onInvalidate = function (f) {
  if (!Tracker.active) throw new Error("Tracker.onInvalidate requires a currentComputation");
  Tracker.currentComputation.onInvalidate(f);
};

// http://docs.meteor.com/#tracker_afterflush

/**
 * @summary Schedules a function to be called during the next flush, or later in the current flush if one is in progress, after all invalidated computations have been rerun.  The function will be run once and not on subsequent flushes unless `afterFlush` is called again.
 * @locus Client
 * @param {Function} callback A function to call at flush time.
 */
Tracker.afterFlush = function (f) {
  afterFlushCallbacks.push(f);
  requireFlush();
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
      Tracker: Tracker,
      Deps: Deps
    };},
  require: require,
  eagerModulePaths: [
    "/node_modules/meteor/tracker/tracker.js"
  ]
}});

//# sourceURL=meteor://💻app/packages/tracker.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvdHJhY2tlci90cmFja2VyLmpzIl0sIm5hbWVzIjpbIlRyYWNrZXIiLCJEZXBzIiwiYWN0aXZlIiwiY3VycmVudENvbXB1dGF0aW9uIiwiX2RlYnVnRnVuYyIsIk1ldGVvciIsIl9kZWJ1ZyIsImNvbnNvbGUiLCJlcnJvciIsImFwcGx5IiwiYXJndW1lbnRzIiwiX21heWJlU3VwcHJlc3NNb3JlTG9ncyIsIm1lc3NhZ2VzTGVuZ3RoIiwiX3N1cHByZXNzZWRfbG9nX2V4cGVjdGVkIiwiX3N1cHByZXNzX2xvZyIsIl90aHJvd09yTG9nIiwiZnJvbSIsImUiLCJ0aHJvd0ZpcnN0RXJyb3IiLCJwcmludEFyZ3MiLCJzdGFjayIsIm1lc3NhZ2UiLCJuYW1lIiwiaWR4IiwiaW5kZXhPZiIsImxlbmd0aCIsInB1c2giLCJpIiwid2l0aE5vWWllbGRzQWxsb3dlZCIsImYiLCJpc0NsaWVudCIsImFyZ3MiLCJfbm9ZaWVsZHNBbGxvd2VkIiwibmV4dElkIiwicGVuZGluZ0NvbXB1dGF0aW9ucyIsIndpbGxGbHVzaCIsImluRmx1c2giLCJpbkNvbXB1dGUiLCJhZnRlckZsdXNoQ2FsbGJhY2tzIiwicmVxdWlyZUZsdXNoIiwiX3NldEltbWVkaWF0ZSIsIl9ydW5GbHVzaCIsInNldFRpbWVvdXQiLCJjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbiIsIkNvbXB1dGF0aW9uIiwiY29uc3RydWN0b3IiLCJwYXJlbnQiLCJvbkVycm9yIiwiRXJyb3IiLCJzdG9wcGVkIiwiaW52YWxpZGF0ZWQiLCJmaXJzdFJ1biIsIl9pZCIsIl9vbkludmFsaWRhdGVDYWxsYmFja3MiLCJfb25TdG9wQ2FsbGJhY2tzIiwiX3BhcmVudCIsIl9mdW5jIiwiX29uRXJyb3IiLCJfcmVjb21wdXRpbmciLCJmaXJzdFJ1blByb21pc2UiLCJ1bmRlZmluZWQiLCJlcnJvcmVkIiwiX2NvbXB1dGUiLCJzdG9wIiwidGhlbiIsIm9uUmVzb2x2ZWQiLCJvblJlamVjdGVkIiwiY2F0Y2giLCJvbkludmFsaWRhdGUiLCJub25yZWFjdGl2ZSIsIm9uU3RvcCIsImludmFsaWRhdGUiLCJwcmV2aW91c0luQ29tcHV0ZSIsIndpdGhDb21wdXRhdGlvbiIsIlByb21pc2UiLCJyZXNvbHZlIiwiX25lZWRzUmVjb21wdXRlIiwiX3JlY29tcHV0ZSIsImZsdXNoIiwicnVuIiwiRGVwZW5kZW5jeSIsIl9kZXBlbmRlbnRzQnlJZCIsIk9iamVjdCIsImNyZWF0ZSIsImRlcGVuZCIsImNvbXB1dGF0aW9uIiwiaWQiLCJjaGFuZ2VkIiwiaGFzRGVwZW5kZW50cyIsIm9wdGlvbnMiLCJmaW5pc2hTeW5jaHJvbm91c2x5IiwiX3Rocm93Rmlyc3RFcnJvciIsInJlY29tcHV0ZWRDb3VudCIsImZpbmlzaGVkVHJ5IiwiY29tcCIsInNoaWZ0IiwidW5zaGlmdCIsImZ1bmMiLCJhdXRvcnVuIiwiYyIsInByZXZpb3VzQ29tcHV0YXRpb24iLCJhZnRlckZsdXNoIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBQSxPQUFPLEdBQUcsQ0FBQyxDQUFDOztBQUVaO0FBQ0E7QUFDQTtBQUNBO0FBQ0FDLElBQUksR0FBR0QsT0FBTzs7QUFFZDs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0FBLE9BQU8sQ0FBQ0UsTUFBTSxHQUFHLEtBQUs7O0FBRXRCOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQUYsT0FBTyxDQUFDRyxrQkFBa0IsR0FBRyxJQUFJO0FBRWpDLFNBQVNDLFVBQVVBLENBQUEsRUFBRztFQUNwQjtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0EsT0FBUSxPQUFPQyxNQUFNLEtBQUssV0FBVyxHQUFHQSxNQUFNLENBQUNDLE1BQU0sR0FDM0MsT0FBT0MsT0FBTyxLQUFLLFdBQVcsSUFBS0EsT0FBTyxDQUFDQyxLQUFLLEdBQ2pELFlBQVk7SUFBRUQsT0FBTyxDQUFDQyxLQUFLLENBQUNDLEtB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QUMsRUFBRTtFQUNsQyxJQUFJLENBQUU3QixPQUFPLENBQUNFLE1BQU0sRUFDbEIsTUFBTSxJQUFJOEMsS0FBSyxDQUFDLG9EQUFvRCxDQUFDO0VBRXZFaEQsT0FBTyxDQUFDRyxrQkFBa0IsQ0FBQ2lFLFlBQVksQ0FBQ3ZDLENBQUMsQ0FBQztBQUM1QyxDQUFDOztBQUVEOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTdCLE9BQU8sQ0FBQ3FHLFVBQVUsR0FBRyxVQUFVeEUsQ0FBQyxFQUFFO0VBQ2hDUyxtQkFBbUIsQ0FBQ1osSUFBSSxDQUFDRyxDQUFDLENBQUM7RUFDM0JVLFlBQVksQ0FBQyxDQUFDO0FBQ2hCLENBQUMsQyIsImZpbGUiOiIvcGFja2FnZXMvdHJhY2tlci5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBQYWNrYWdlIGRvY3MgYXQgaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlciAvL1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuLyoqXG4gKiBAbmFtZXNwYWNlIFRyYWNrZXJcbiAqIEBzdW1tYXJ5IFRoZSBuYW1lc3BhY2UgZm9yIFRyYWNrZXItcmVsYXRlZCBtZXRob2RzLlxuICovXG5UcmFja2VyID0ge307XG5cbi8qKlxuICogQG5hbWVzcGFjZSBEZXBzXG4gKiBAZGVwcmVjYXRlZFxuICovXG5EZXBzID0gVHJhY2tlcjtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9hY3RpdmVcblxuLyoqXG4gKiBAc3VtbWFyeSBUcnVlIGlmIHRoZXJlIGlzIGEgY3VycmVudCBjb21wdXRhdGlvbiwgbWVhbmluZyB0aGF0IGRlcGVuZGVuY2llcyBvbiByZWFjdGl2ZSBkYXRhIHNvdXJjZXMgd2lsbCBiZSB0cmFja2VkIGFuZCBwb3RlbnRpYWxseSBjYXVzZSB0aGUgY3VycmVudCBjb21wdXRhdGlvbiB0byBiZSByZXJ1bi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEB0eXBlIHtCb29sZWFufVxuICovXG5UcmFja2VyLmFjdGl2ZSA9IGZhbHNlO1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2N1cnJlbnRjb21wdXRhdGlvblxuXG4vKipcbiAqIEBzdW1tYXJ5IFRoZSBjdXJyZW50IGNvbXB1dGF0aW9uLCBvciBgbnVsbGAgaWYgdGhlcmUgaXNuJ3Qgb25lLiAgVGhlIGN1cnJlbnQgY29tcHV0YXRpb24gaXMgdGhlIFtgVHJhY2tlci5Db21wdXRhdGlvbmBdKCN0cmFja2VyX2NvbXB1dGF0aW9uKSBvYmplY3QgY3JlYXRlZCBieSB0aGUgaW5uZXJtb3N0IGFjdGl2ZSBjYWxsIHRvIGBUcmFja2VyLmF1dG9ydW5gLCBhbmQgaXQncyB0aGUgY29tcHV0YXRpb24gdGhhdCBnYWlucyBkZXBlbmRlbmNpZXMgd2hlbiByZWFjdGl2ZSBkYXRhIHNvdXJjZXMgYXJlIGFjY2Vzc2VkLlxuICogQGxvY3VzIENsaWVudFxuICogQHR5cGUge1RyYWNrZXIuQ29tcHV0YXRpb259XG4gKi9cblRyYWNrZXIuY3VycmVudENvbXB1dGF0aW9uID0gbnVsbDtcblxuZnVuY3Rpb24gX2RlYnVnRnVuYygpIHtcbiAgLy8gV2Ugd2FudCB0aGlzIGNvZGUgdG8gd29yayB3aXRob3V0IE1ldGVvciwgYW5kIGFsc28gd2l0aG91dFxuICAvLyBcImNvbnNvbGVcIiAod2hpY2ggaXMgdGVjaG5pY2FsbHkgbm9uLXN0YW5kYXJkIGFuZCBtYXkgYmUgbWlzc2luZ1xuICAvLyBvbiBzb21lIGJyb3dzZXIgd2UgY29tZSBhY3Jvc3MsIGxpa2UgaXQgd2FzIG9uIElFIDcpLlxuICAvL1xuICAvLyBMYXp5IGV2YWx1YXRpb24gYmVjYXVzZSBgTWV0ZW9yYCBkb2VzIG5vdCBleGlzdCByaWdodCBhd2F5Lig/PylcbiAgcmV0dXJuICh0eXBlb2YgTWV0ZW9yICE9PSBcInVuZGVmaW5lZFwiID8gTWV0ZW9yLl9kZWJ1ZyA6XG4gICAgICAgICAgKCh0eXBlb2YgY29uc29sZSAhPT0gXCJ1bmRlZmluZWRcIikgJiYgY29uc29sZS5lcnJvciA/XG4gICAgICAgICAgIGZ1bmN0aW9uICgpIHsgY29uc29sZS5lcnJvci5hcHBseShjb25zb2xlLCBhcmd1bWVudHMpOyB9IDpcbiAgICAgICAgICAgZnVuY3Rpb24gKCkge30pKTtcbn1cblxuZnVuY3Rpb24gX21heWJlU3VwcHJlc3NNb3JlTG9ncyhtZXNzYWdlc0xlbmd0aCkge1xuICAvLyBTb21ldGltZXMgd2hlbiBydW5uaW5nIHRlc3RzLCB3ZSBpbnRlbnRpb25hbGx5IHN1cHByZXNzIGxvZ3Mgb24gZXhwZWN0ZWRcbiAgLy8gcHJpbnRlZCBlcnJvcnMuIFNpbmNlIHRoZSBjdXJyZW50IGltcGxlbWVudGF0aW9uIG9mIF90aHJvd09yTG9nIGNhbiBsb2dcbiAgLy8gbXVsdGlwbGUgc2VwYXJhdGUgbG9nIG1lc3NhZ2VzLCBzdXBwcmVzcyBhbGwgb2YgdGhlbSBpZiBhdCBsZWFzdCBvbmUgc3VwcHJlc3NcbiAgLy8gaXMgZXhwZWN0ZWQgYXMgd2Ugc3RpbGwgd2FudCB0aGVtIHRvIGNvdW50IGFzIG9uZS5cbiAgaWYgKHR5cGVvZiBNZXRlb3IgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICBpZiAoTWV0ZW9yLl9zdXBwcmVzc2VkX2xvZ19leHBlY3RlZCgpKSB7XG4gICAgICBNZXRlb3IuX3N1cHByZXNzX2xvZyhtZXNzYWdlc0xlbmd0aCAtIDEpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBfdGhyb3dPckxvZyhmcm9tLCBlKSB7XG4gIGlmICh0aHJvd0ZpcnN0RXJyb3IpIHtcbiAgICB0aHJvdyBlO1xuICB9IGVsc2Uge1xuICAgIHZhciBwcmludEFyZ3MgPSBbXCJFeGNlcHRpb24gZnJvbSBUcmFja2VyIFwiICsgZnJvbSArIFwiIGZ1bmN0aW9uOlwiXTtcbiAgICBpZiAoZS5zdGFjayAmJiBlLm1lc3NhZ2UgJiYgZS5uYW1lKSB7XG4gICAgICB2YXIgaWR4ID0gZS5zdGFjay5pbmRleE9mKGUubWVzc2FnZSk7XG4gICAgICBpZiAoaWR4IDwgMCB8fCBpZHggPiBlLm5hbWUubGVuZ3RoICsgMikgeyAvLyBjaGVjayBmb3IgXCJFcnJvcjogXCJcbiAgICAgICAgLy8gbWVzc2FnZSBpcyBub3QgcGFydCBvZiB0aGUgc3RhY2tcbiAgICAgICAgdmFyIG1lc3NhZ2UgPSBlLm5hbWUgKyBcIjogXCIgKyBlLm1lc3NhZ2U7XG4gICAgICAgIHByaW50QXJncy5wdXNoKG1lc3NhZ2UpO1xuICAgICAgfVxuICAgIH1cbiAgICBwcmludEFyZ3MucHVzaChlLnN0YWNrKTtcbiAgICBfbWF5YmVTdXBwcmVzc01vcmVMb2dzKHByaW50QXJncy5sZW5ndGgpO1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwcmludEFyZ3MubGVuZ3RoOyBpKyspIHtcbiAgICAgIF9kZWJ1Z0Z1bmMoKShwcmludEFyZ3NbaV0pO1xuICAgIH1cbiAgfVxufVxuXG4vLyBUYWtlcyBhIGZ1bmN0aW9uIGBmYCwgYW5kIHdyYXBzIGl0IGluIGEgYE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkYFxuLy8gYmxvY2sgaWYgd2UgYXJlIHJ1bm5pbmcgb24gdGhlIHNlcnZlci4gT24gdGhlIGNsaWVudCwgcmV0dXJucyB0aGVcbi8vIG9yaWdpbmFsIGZ1bmN0aW9uIChzaW5jZSBgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWRgIGlzIGFcbi8vIG5vLW9wKS4gVGhpcyBoYXMgdGhlIGJlbmVmaXQgb2Ygbm90IGFkZGluZyBhbiB1bm5lY2Vzc2FyeSBzdGFja1xuLy8gZnJhbWUgb24gdGhlIGNsaWVudC5cbmZ1bmN0aW9uIHdpdGhOb1lpZWxkc0FsbG93ZWQoZikge1xuICBpZiAoKHR5cGVvZiBNZXRlb3IgPT09ICd1bmRlZmluZWQnKSB8fCBNZXRlb3IuaXNDbGllbnQpIHtcbiAgICByZXR1cm4gZjtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgICBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmdW5jdGlvbiAoKSB7XG4gICAgICAgIGYuYXBwbHkobnVsbCwgYXJncyk7XG4gICAgICB9KTtcbiAgICB9O1xuICB9XG59XG5cbnZhciBuZXh0SWQgPSAxO1xuLy8gY29tcHV0YXRpb25zIHdob3NlIGNhbGxiYWNrcyB3ZSBzaG91bGQgY2FsbCBhdCBmbHVzaCB0aW1lXG52YXIgcGVuZGluZ0NvbXB1dGF0aW9ucyA9IFtdO1xuLy8gYHRydWVgIGlmIGEgVHJhY2tlci5mbHVzaCBpcyBzY2hlZHVsZWQsIG9yIGlmIHdlIGFyZSBpbiBUcmFja2VyLmZsdXNoIG5vd1xudmFyIHdpbGxGbHVzaCA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHdlIGFyZSBpbiBUcmFja2VyLmZsdXNoIG5vd1xudmFyIGluRmx1c2ggPSBmYWxzZTtcbi8vIGB0cnVlYCBpZiB3ZSBhcmUgY29tcHV0aW5nIGEgY29tcHV0YXRpb24gbm93LCBlaXRoZXIgZmlyc3QgdGltZVxuLy8gb3IgcmVjb21wdXRlLiAgVGhpcyBtYXRjaGVzIFRyYWNrZXIuYWN0aXZlIHVubGVzcyB3ZSBhcmUgaW5zaWRlXG4vLyBUcmFja2VyLm5vbnJlYWN0aXZlLCB3aGljaCBudWxsZmllcyBjdXJyZW50Q29tcHV0YXRpb24gZXZlbiB0aG91Z2hcbi8vIGFuIGVuY2xvc2luZyBjb21wdXRhdGlvbiBtYXkgc3RpbGwgYmUgcnVubmluZy5cbnZhciBpbkNvbXB1dGUgPSBmYWxzZTtcbi8vIGB0cnVlYCBpZiB0aGUgYF90aHJvd0ZpcnN0RXJyb3JgIG9wdGlvbiB3YXMgcGFzc2VkIGluIHRvIHRoZSBjYWxsXG4vLyB0byBUcmFja2VyLmZsdXNoIHRoYXQgd2UgYXJlIGluLiBXaGVuIHNldCwgdGhyb3cgcmF0aGVyIHRoYW4gbG9nIHRoZVxuLy8gZmlyc3QgZXJyb3IgZW5jb3VudGVyZWQgd2hpbGUgZmx1c2hpbmcuIEJlZm9yZSB0aHJvd2luZyB0aGUgZXJyb3IsXG4vLyBmaW5pc2ggZmx1c2hpbmcgKGZyb20gYSBmaW5hbGx5IGJsb2NrKSwgbG9nZ2luZyBhbnkgc3Vic2VxdWVudFxuLy8gZXJyb3JzLlxudmFyIHRocm93Rmlyc3RFcnJvciA9IGZhbHNlO1xuXG52YXIgYWZ0ZXJGbHVzaENhbGxiYWNrcyA9IFtdO1xuXG5mdW5jdGlvbiByZXF1aXJlRmx1c2goKSB7XG4gIGlmICghIHdpbGxGbHVzaCkge1xuICAgIC8vIFdlIHdhbnQgdGhpcyBjb2RlIHRvIHdvcmsgd2l0aG91dCBNZXRlb3IsIHNlZSBkZWJ1Z0Z1bmMgYWJvdmVcbiAgICBpZiAodHlwZW9mIE1ldGVvciAhPT0gXCJ1bmRlZmluZWRcIilcbiAgICAgIE1ldGVvci5fc2V0SW1tZWRpYXRlKFRyYWNrZXIuX3J1bkZsdXNoKTtcbiAgICBlbHNlXG4gICAgICBzZXRUaW1lb3V0KFRyYWNrZXIuX3J1bkZsdXNoLCAwKTtcbiAgICB3aWxsRmx1c2ggPSB0cnVlO1xuICB9XG59XG5cbi8vIFRyYWNrZXIuQ29tcHV0YXRpb24gY29uc3RydWN0b3IgaXMgdmlzaWJsZSBidXQgcHJpdmF0ZVxuLy8gKHRocm93cyBhbiBlcnJvciBpZiB5b3UgdHJ5IHRvIGNhbGwgaXQpXG52YXIgY29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSBmYWxzZTtcblxuLy9cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfY29tcHV0YXRpb25cblxuLyoqXG4gKiBAc3VtbWFyeSBBIENvbXB1dGF0aW9uIG9iamVjdCByZXByZXNlbnRzIGNvZGUgdGhhdCBpcyByZXBlYXRlZGx5IHJlcnVuXG4gKiBpbiByZXNwb25zZSB0b1xuICogcmVhY3RpdmUgZGF0YSBjaGFuZ2VzLiBDb21wdXRhdGlvbnMgZG9uJ3QgaGF2ZSByZXR1cm4gdmFsdWVzOyB0aGV5IGp1c3RcbiAqIHBlcmZvcm0gYWN0aW9ucywgc3VjaCBhcyByZXJlbmRlcmluZyBhIHRlbXBsYXRlIG9uIHRoZSBzY3JlZW4uIENvbXB1dGF0aW9uc1xuICogYXJlIGNyZWF0ZWQgdXNpbmcgVHJhY2tlci5hdXRvcnVuLiBVc2Ugc3RvcCB0byBwcmV2ZW50IGZ1cnRoZXIgcmVydW5uaW5nIG9mIGFcbiAqIGNvbXB1dGF0aW9uLlxuICogQGluc3RhbmNlbmFtZSBjb21wdXRhdGlvblxuICovXG5UcmFja2VyLkNvbXB1dGF0aW9uID0gY2xhc3MgQ29tcHV0YXRpb24ge1xuICBjb25zdHJ1Y3RvcihmLCBwYXJlbnQsIG9uRXJyb3IpIHtcbiAgICBpZiAoISBjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbilcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgXCJUcmFja2VyLkNvbXB1dGF0aW9uIGNvbnN0cnVjdG9yIGlzIHByaXZhdGU7IHVzZSBUcmFja2VyLmF1dG9ydW5cIik7XG4gICAgY29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSBmYWxzZTtcblxuICAgIC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX3N0b3BwZWRcblxuICAgIC8qKlxuICAgICAqIEBzdW1tYXJ5IFRydWUgaWYgdGhpcyBjb21wdXRhdGlvbiBoYXMgYmVlbiBzdG9wcGVkLlxuICAgICAqIEBsb2N1cyBDbGllbnRcbiAgICAgKiBAbWVtYmVyT2YgVHJhY2tlci5Db21wdXRhdGlvblxuICAgICAqIEBpbnN0YW5jZVxuICAgICAqIEBuYW1lICBzdG9wcGVkXG4gICAgICovXG4gICAgdGhpcy5zdG9wcGVkID0gZmFsc2U7XG5cbiAgICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9pbnZhbGlkYXRlZFxuXG4gICAgLyoqXG4gICAgICogQHN1bW1hcnkgVHJ1ZSBpZiB0aGlzIGNvbXB1dGF0aW9uIGhhcyBiZWVuIGludmFsaWRhdGVkIChhbmQgbm90IHlldCByZXJ1biksIG9yIGlmIGl0IGhhcyBiZWVuIHN0b3BwZWQuXG4gICAgICogQGxvY3VzIENsaWVudFxuICAgICAqIEBtZW1iZXJPZiBUcmFja2VyLkNvbXB1dGF0aW9uXG4gICAgICogQGluc3RhbmNlXG4gICAgICogQG5hbWUgIGludmFsaWRhdGVkXG4gICAgICogQHR5cGUge0Jvb2xlYW59XG4gICAgICovXG4gICAgdGhpcy5pbnZhbGlkYXRlZCA9IGZhbHNlO1xuXG4gICAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fZmlyc3RydW5cblxuICAgIC8qKlxuICAgICAqIEBzdW1tYXJ5IFRydWUgZHVyaW5nIHRoZSBpbml0aWFsIHJ1biBvZiB0aGUgY29tcHV0YXRpb24gYXQgdGhlIHRpbWUgYFRyYWNrZXIuYXV0b3J1bmAgaXMgY2FsbGVkLCBhbmQgZmFsc2Ugb24gc3Vic2VxdWVudCByZXJ1bnMgYW5kIGF0IG90aGVyIHRpbWVzLlxuICAgICAqIEBsb2N1cyBDbGllbnRcbiAgICAgKiBAbWVtYmVyT2YgVHJhY2tlci5Db21wdXRhdGlvblxuICAgICAqIEBpbnN0YW5jZVxuICAgICAqIEBuYW1lICBmaXJzdFJ1blxuICAgICAqIEB0eXBlIHtCb29sZWFufVxuICAgICAqL1xuICAgIHRoaXMuZmlyc3RSdW4gPSB0cnVlO1xuXG4gICAgdGhpcy5faWQgPSBuZXh0SWQrKztcbiAgICB0aGlzLl9vbkludmFsaWRhdGVDYWxsYmFja3MgPSBbXTtcbiAgICB0aGlzLl9vblN0b3BDYWxsYmFja3MgPSBbXTtcbiAgICAvLyB0aGUgcGxhbiBpcyBhdCBzb21lIHBvaW50IHRvIHVzZSB0aGUgcGFyZW50IHJlbGF0aW9uXG4gICAgLy8gdG8gY29uc3RyYWluIHRoZSBvcmRlciB0aGF0IGNvbXB1dGF0aW9ucyBhcmUgcHJvY2Vzc2VkXG4gICAgdGhpcy5fcGFyZW50ID0gcGFyZW50O1xuICAgIHRoaXMuX2Z1bmMgPSBmO1xuICAgIHRoaXMuX29uRXJyb3IgPSBvbkVycm9yO1xuICAgIHRoaXMuX3JlY29tcHV0aW5nID0gZmFsc2U7XG5cbiAgICAvKipcbiAgICAgKiBAc3VtbWFyeSBGb3JjZXMgYXV0b3J1biBibG9ja3MgdG8gYmUgZXhlY3V0ZWQgaW4gc3luY2hyb25vdXMtbG9va2luZyBvcmRlciBieSBzdG9yaW5nIHRoZSB2YWx1ZSBhdXRvcnVuIHByb21pc2UgdGh1cyBtYWtpbmcgaXQgYXdhaXRhYmxlLlxuICAgICAqIEBsb2N1cyBDbGllbnRcbiAgICAgKiBAbWVtYmVyT2YgVHJhY2tlci5Db21wdXRhdGlvblxuICAgICAqIEBpbnN0YW5jZVxuICAgICAqIEBuYW1lICBmaXJzdFJ1blByb21pc2VcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTx1bmtub3duPn1cbiAgICAgKi9cbiAgICB0aGlzLmZpcnN0UnVuUHJvbWlzZSA9IHVuZGVmaW5lZDtcblxuICAgIHZhciBlcnJvcmVkID0gdHJ1ZTtcbiAgICB0cnkge1xuICAgICAgdGhpcy5fY29tcHV0ZSgpO1xuICAgICAgZXJyb3JlZCA9IGZhbHNlO1xuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLmZpcnN0UnVuID0gZmFsc2U7XG4gICAgICBpZiAoZXJyb3JlZClcbiAgICAgICAgdGhpcy5zdG9wKCk7XG4gICAgfVxuICB9XG5cblxuICAgIC8qKlxuICAgKiBSZXNvbHZlcyB0aGUgZmlyc3RSdW5Qcm9taXNlIHdpdGggdGhlIHJlc3VsdCBvZiB0aGUgYXV0b3J1biBmdW5jdGlvbi5cbiAgICogQHBhcmFtIHsqfSBvblJlc29sdmVkXG4gICAqIEBwYXJhbSB7Kn0gb25SZWplY3RlZFxuICAgKiBAcmV0dXJuc3tQcm9taXNlPHVua25vd259XG4gICAqL1xuICAgIHRoZW4ob25SZXNvbHZlZCwgb25SZWplY3RlZCkge1xuICAgICAgcmV0dXJuIHRoaXMuZmlyc3RSdW5Qcm9taXNlLnRoZW4ob25SZXNvbHZlZCwgb25SZWplY3RlZCk7XG4gICAgfTtcblxuXG4gICAgY2F0Y2gob25SZWplY3RlZCkge1xuICAgICAgcmV0dXJuIHRoaXMuZmlyc3RSdW5Qcm9taXNlLmNhdGNoKG9uUmVqZWN0ZWQpXG4gICAgfTtcblxuICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9vbmludmFsaWRhdGVcblxuICAvKipcbiAgICogQHN1bW1hcnkgUmVnaXN0ZXJzIGBjYWxsYmFja2AgdG8gcnVuIHdoZW4gdGhpcyBjb21wdXRhdGlvbiBpcyBuZXh0IGludmFsaWRhdGVkLCBvciBydW5zIGl0IGltbWVkaWF0ZWx5IGlmIHRoZSBjb21wdXRhdGlvbiBpcyBhbHJlYWR5IGludmFsaWRhdGVkLiAgVGhlIGNhbGxiYWNrIGlzIHJ1biBleGFjdGx5IG9uY2UgYW5kIG5vdCB1cG9uIGZ1dHVyZSBpbnZhbGlkYXRpb25zIHVubGVzcyBgb25JbnZhbGlkYXRlYCBpcyBjYWxsZWQgYWdhaW4gYWZ0ZXIgdGhlIGNvbXB1dGF0aW9uIGJlY29tZXMgdmFsaWQgYWdhaW4uXG4gICAqIEBsb2N1cyBDbGllbnRcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgRnVuY3Rpb24gdG8gYmUgY2FsbGVkIG9uIGludmFsaWRhdGlvbi4gUmVjZWl2ZXMgb25lIGFyZ3VtZW50LCB0aGUgY29tcHV0YXRpb24gdGhhdCB3YXMgaW52YWxpZGF0ZWQuXG4gICAqL1xuICBvbkludmFsaWRhdGUoZikge1xuICAgIGlmICh0eXBlb2YgZiAhPT0gJ2Z1bmN0aW9uJylcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIm9uSW52YWxpZGF0ZSByZXF1aXJlcyBhIGZ1bmN0aW9uXCIpO1xuXG4gICAgaWYgKHRoaXMuaW52YWxpZGF0ZWQpIHtcbiAgICAgIFRyYWNrZXIubm9ucmVhY3RpdmUoKCkgPT4ge1xuICAgICAgICB3aXRoTm9ZaWVsZHNBbGxvd2VkKGYpKHRoaXMpO1xuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX29uSW52YWxpZGF0ZUNhbGxiYWNrcy5wdXNoKGYpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBSZWdpc3RlcnMgYGNhbGxiYWNrYCB0byBydW4gd2hlbiB0aGlzIGNvbXB1dGF0aW9uIGlzIHN0b3BwZWQsIG9yIHJ1bnMgaXQgaW1tZWRpYXRlbHkgaWYgdGhlIGNvbXB1dGF0aW9uIGlzIGFscmVhZHkgc3RvcHBlZC4gIFRoZSBjYWxsYmFjayBpcyBydW4gYWZ0ZXIgYW55IGBvbkludmFsaWRhdGVgIGNhbGxiYWNrcy5cbiAgICogQGxvY3VzIENsaWVudFxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBGdW5jdGlvbiB0byBiZSBjYWxsZWQgb24gc3RvcC4gUmVjZWl2ZXMgb25lIGFyZ3VtZW50LCB0aGUgY29tcHV0YXRpb24gdGhhdCB3YXMgc3RvcHBlZC5cbiAgICovXG4gIG9uU3RvcChmKSB7XG4gICAgaWYgKHR5cGVvZiBmICE9PSAnZnVuY3Rpb24nKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwib25TdG9wIHJlcXVpcmVzIGEgZnVuY3Rpb25cIik7XG5cbiAgICBpZiAodGhpcy5zdG9wcGVkKSB7XG4gICAgICBUcmFja2VyLm5vbnJlYWN0aXZlKCgpID0+IHtcbiAgICAgICAgd2l0aE5vWWllbGRzQWxsb3dlZChmKSh0aGlzKTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLl9vblN0b3BDYWxsYmFja3MucHVzaChmKTtcbiAgICB9XG4gIH1cblxuICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9pbnZhbGlkYXRlXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IEludmFsaWRhdGVzIHRoaXMgY29tcHV0YXRpb24gc28gdGhhdCBpdCB3aWxsIGJlIHJlcnVuLlxuICAgKiBAbG9jdXMgQ2xpZW50XG4gICAqL1xuICBpbnZhbGlkYXRlKCkge1xuICAgIGlmICghIHRoaXMuaW52YWxpZGF0ZWQpIHtcbiAgICAgIC8vIGlmIHdlJ3JlIGN1cnJlbnRseSBpbiBfcmVjb21wdXRlKCksIGRvbid0IGVucXVldWVcbiAgICAgIC8vIG91cnNlbHZlcywgc2luY2Ugd2UnbGwgcmVydW4gaW1tZWRpYXRlbHkgYW55d2F5LlxuICAgICAgaWYgKCEgdGhpcy5fcmVjb21wdXRpbmcgJiYgISB0aGlzLnN0b3BwZWQpIHtcbiAgICAgICAgcmVxdWlyZUZsdXNoKCk7XG4gICAgICAgIHBlbmRpbmdDb21wdXRhdGlvbnMucHVzaCh0aGlzKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5pbnZhbGlkYXRlZCA9IHRydWU7XG5cbiAgICAgIC8vIGNhbGxiYWNrcyBjYW4ndCBhZGQgY2FsbGJhY2tzLCBiZWNhdXNlXG4gICAgICAvLyB0aGlzLmludmFsaWRhdGVkID09PSB0cnVlLlxuICAgICAgZm9yKHZhciBpID0gMCwgZjsgZiA9IHRoaXMuX29uSW52YWxpZGF0ZUNhbGxiYWNrc1tpXTsgaSsrKSB7XG4gICAgICAgIFRyYWNrZXIubm9ucmVhY3RpdmUoKCkgPT4ge1xuICAgICAgICAgIHdpdGhOb1lpZWxkc0FsbG93ZWQoZikodGhpcyk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgdGhpcy5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzID0gW107XG4gICAgfVxuICB9XG5cbiAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fc3RvcFxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBQcmV2ZW50cyB0aGlzIGNvbXB1dGF0aW9uIGZyb20gcmVydW5uaW5nLlxuICAgKiBAbG9jdXMgQ2xpZW50XG4gICAqL1xuICBzdG9wKCkge1xuICAgIGlmICghIHRoaXMuc3RvcHBlZCkge1xuICAgICAgdGhpcy5zdG9wcGVkID0gdHJ1ZTtcbiAgICAgIHRoaXMuaW52YWxpZGF0ZSgpO1xuICAgICAgZm9yKHZhciBpID0gMCwgZjsgZiA9IHRoaXMuX29uU3RvcENhbGxiYWNrc1tpXTsgaSsrKSB7XG4gICAgICAgIFRyYWNrZXIubm9ucmVhY3RpdmUoKCkgPT4ge1xuICAgICAgICAgIHdpdGhOb1lpZWxkc0FsbG93ZWQoZikodGhpcyk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgdGhpcy5fb25TdG9wQ2FsbGJhY2tzID0gW107XG4gICAgfVxuICB9XG5cbiAgX2NvbXB1dGUoKSB7XG4gICAgdGhpcy5pbnZhbGlkYXRlZCA9IGZhbHNlO1xuXG4gICAgdmFyIHByZXZpb3VzSW5Db21wdXRlID0gaW5Db21wdXRlO1xuICAgIGluQ29tcHV0ZSA9IHRydWU7XG5cbiAgICB0cnkge1xuICAgICAgLy8gSW4gY2FzZSBvZiBhc3luYyBmdW5jdGlvbnMsIHRoZSByZXN1bHQgb2YgdGhpcyBmdW5jdGlvbiB3aWxsIGNvbnRhaW4gdGhlIHByb21pc2Ugb2YgdGhlIGF1dG9ydW4gZnVuY3Rpb25cbiAgICAgIC8vICYgbWFrZSBhdXRvcnVucyBhd2FpdC1hYmxlLlxuICAgICAgY29uc3QgZmlyc3RSdW5Qcm9taXNlID0gVHJhY2tlci53aXRoQ29tcHV0YXRpb24odGhpcywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gd2l0aE5vWWllbGRzQWxsb3dlZCh0aGlzLl9mdW5jKSh0aGlzKTtcbiAgICAgIH0pO1xuICAgICAgLy8gV2UnbGwgc3RvcmUgdGhlIGZpcnN0UnVuUHJvbWlzZSBvbiB0aGUgY29tcHV0YXRpb24gc28gaXQgY2FuIGJlIGF3YWl0ZWQgYnkgdGhlIGNhbGxlcnMsIGJ1dCBvbmx5XG4gICAgICAvLyBkdXJpbmcgdGhlIGZpcnN0IHJ1bi4gV2UgZG9uJ3Qgd2FudCB0aGluZ3MgdG8gZ2V0IG1peGVkIHVwLlxuICAgICAgaWYgKHRoaXMuZmlyc3RSdW4pIHtcbiAgICAgICAgdGhpcy5maXJzdFJ1blByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoZmlyc3RSdW5Qcm9taXNlKTtcbiAgICAgIH1cbiAgICB9IGZpbmFsbHkge1xuICAgICAgaW5Db21wdXRlID0gcHJldmlvdXNJbkNvbXB1dGU7XG4gICAgfVxuICB9XG5cbiAgX25lZWRzUmVjb21wdXRlKCkge1xuICAgIHJldHVybiB0aGlzLmludmFsaWRhdGVkICYmICEgdGhpcy5zdG9wcGVkO1xuICB9XG5cbiAgX3JlY29tcHV0ZSgpIHtcbiAgICB0aGlzLl9yZWNvbXB1dGluZyA9IHRydWU7XG4gICAgdHJ5IHtcbiAgICAgIGlmICh0aGlzLl9uZWVkc1JlY29tcHV0ZSgpKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgdGhpcy5fY29tcHV0ZSgpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgaWYgKHRoaXMuX29uRXJyb3IpIHtcbiAgICAgICAgICAgIHRoaXMuX29uRXJyb3IoZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIF90aHJvd09yTG9nKFwicmVjb21wdXRlXCIsIGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLl9yZWNvbXB1dGluZyA9IGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBQcm9jZXNzIHRoZSByZWFjdGl2ZSB1cGRhdGVzIGZvciB0aGlzIGNvbXB1dGF0aW9uIGltbWVkaWF0ZWx5XG4gICAqIGFuZCBlbnN1cmUgdGhhdCB0aGUgY29tcHV0YXRpb24gaXMgcmVydW4uIFRoZSBjb21wdXRhdGlvbiBpcyByZXJ1biBvbmx5XG4gICAqIGlmIGl0IGlzIGludmFsaWRhdGVkLlxuICAgKiBAbG9jdXMgQ2xpZW50XG4gICAqL1xuICBmbHVzaCgpIHtcbiAgICBpZiAodGhpcy5fcmVjb21wdXRpbmcpXG4gICAgICByZXR1cm47XG5cbiAgICB0aGlzLl9yZWNvbXB1dGUoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBDYXVzZXMgdGhlIGZ1bmN0aW9uIGluc2lkZSB0aGlzIGNvbXB1dGF0aW9uIHRvIHJ1biBhbmRcbiAgICogc3luY2hyb25vdXNseSBwcm9jZXNzIGFsbCByZWFjdGl2ZSB1cGR0ZXMuXG4gICAqIEBsb2N1cyBDbGllbnRcbiAgICovXG4gIHJ1bigpIHtcbiAgICB0aGlzLmludmFsaWRhdGUoKTtcbiAgICB0aGlzLmZsdXNoKCk7XG4gIH1cbn07XG5cbi8vXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2RlcGVuZGVuY3lcblxuLyoqXG4gKiBAc3VtbWFyeSBBIERlcGVuZGVuY3kgcmVwcmVzZW50cyBhbiBhdG9taWMgdW5pdCBvZiByZWFjdGl2ZSBkYXRhIHRoYXQgYVxuICogY29tcHV0YXRpb24gbWlnaHQgZGVwZW5kIG9uLiBSZWFjdGl2ZSBkYXRhIHNvdXJjZXMgc3VjaCBhcyBTZXNzaW9uIG9yXG4gKiBNaW5pbW9uZ28gaW50ZXJuYWxseSBjcmVhdGUgZGlmZmVyZW50IERlcGVuZGVuY3kgb2JqZWN0cyBmb3IgZGlmZmVyZW50XG4gKiBwaWVjZXMgb2YgZGF0YSwgZWFjaCBvZiB3aGljaCBtYXkgYmUgZGVwZW5kZWQgb24gYnkgbXVsdGlwbGUgY29tcHV0YXRpb25zLlxuICogV2hlbiB0aGUgZGF0YSBjaGFuZ2VzLCB0aGUgY29tcHV0YXRpb25zIGFyZSBpbnZhbGlkYXRlZC5cbiAqIEBjbGFzc1xuICogQGluc3RhbmNlTmFtZSBkZXBlbmRlbmN5XG4gKi9cblRyYWNrZXIuRGVwZW5kZW5jeSA9IGNsYXNzIERlcGVuZGVuY3kge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLl9kZXBlbmRlbnRzQnlJZCA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG4gIH1cblxuICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBlbmRlbmN5X2RlcGVuZFxuICAvL1xuICAvLyBBZGRzIGBjb21wdXRhdGlvbmAgdG8gdGhpcyBzZXQgaWYgaXQgaXMgbm90IGFscmVhZHlcbiAgLy8gcHJlc2VudC4gIFJldHVybnMgdHJ1ZSBpZiBgY29tcHV0YXRpb25gIGlzIGEgbmV3IG1lbWJlciBvZiB0aGUgc2V0LlxuICAvLyBJZiBubyBhcmd1bWVudCwgZGVmYXVsdHMgdG8gY3VycmVudENvbXB1dGF0aW9uLCBvciBkb2VzIG5vdGhpbmdcbiAgLy8gaWYgdGhlcmUgaXMgbm8gY3VycmVudENvbXB1dGF0aW9uLlxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBEZWNsYXJlcyB0aGF0IHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uIChvciBgZnJvbUNvbXB1dGF0aW9uYCBpZiBnaXZlbikgZGVwZW5kcyBvbiBgZGVwZW5kZW5jeWAuICBUaGUgY29tcHV0YXRpb24gd2lsbCBiZSBpbnZhbGlkYXRlZCB0aGUgbmV4dCB0aW1lIGBkZXBlbmRlbmN5YCBjaGFuZ2VzLlxuXG4gICBJZiB0aGVyZSBpcyBubyBjdXJyZW50IGNvbXB1dGF0aW9uIGFuZCBgZGVwZW5kKClgIGlzIGNhbGxlZCB3aXRoIG5vIGFyZ3VtZW50cywgaXQgZG9lcyBub3RoaW5nIGFuZCByZXR1cm5zIGZhbHNlLlxuXG4gICBSZXR1cm5zIHRydWUgaWYgdGhlIGNvbXB1dGF0aW9uIGlzIGEgbmV3IGRlcGVuZGVudCBvZiBgZGVwZW5kZW5jeWAgcmF0aGVyIHRoYW4gYW4gZXhpc3Rpbmcgb25lLlxuICAgKiBAbG9jdXMgQ2xpZW50XG4gICAqIEBwYXJhbSB7VHJhY2tlci5Db21wdXRhdGlvbn0gW2Zyb21Db21wdXRhdGlvbl0gQW4gb3B0aW9uYWwgY29tcHV0YXRpb24gZGVjbGFyZWQgdG8gZGVwZW5kIG9uIGBkZXBlbmRlbmN5YCBpbnN0ZWFkIG9mIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uLlxuICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICovXG4gIGRlcGVuZChjb21wdXRhdGlvbikge1xuICAgIGlmICghIGNvbXB1dGF0aW9uKSB7XG4gICAgICBpZiAoISBUcmFja2VyLmFjdGl2ZSlcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgICBjb21wdXRhdGlvbiA9IFRyYWNrZXIuY3VycmVudENvbXB1dGF0aW9uO1xuICAgIH1cbiAgICB2YXIgaWQgPSBjb21wdXRhdGlvbi5faWQ7XG4gICAgaWYgKCEgKGlkIGluIHRoaXMuX2RlcGVuZGVudHNCeUlkKSkge1xuICAgICAgdGhpcy5fZGVwZW5kZW50c0J5SWRbaWRdID0gY29tcHV0YXRpb247XG4gICAgICBjb21wdXRhdGlvbi5vbkludmFsaWRhdGUoKCkgPT4ge1xuICAgICAgICBkZWxldGUgdGhpcy5fZGVwZW5kZW50c0J5SWRbaWRdO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwZW5kZW5jeV9jaGFuZ2VkXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IEludmFsaWRhdGUgYWxsIGRlcGVuZGVudCBjb21wdXRhdGlvbnMgaW1tZWRpYXRlbHkgYW5kIHJlbW92ZSB0aGVtIGFzIGRlcGVuZGVudHMuXG4gICAqIEBsb2N1cyBDbGllbnRcbiAgICovXG4gIGNoYW5nZWQoKSB7XG4gICAgZm9yICh2YXIgaWQgaW4gdGhpcy5fZGVwZW5kZW50c0J5SWQpXG4gICAgICB0aGlzLl9kZXBlbmRlbnRzQnlJZFtpZF0uaW52YWxpZGF0ZSgpO1xuICB9XG5cbiAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwZW5kZW5jeV9oYXNkZXBlbmRlbnRzXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IFRydWUgaWYgdGhpcyBEZXBlbmRlbmN5IGhhcyBvbmUgb3IgbW9yZSBkZXBlbmRlbnQgQ29tcHV0YXRpb25zLCB3aGljaCB3b3VsZCBiZSBpbnZhbGlkYXRlZCBpZiB0aGlzIERlcGVuZGVuY3kgd2VyZSB0byBjaGFuZ2UuXG4gICAqIEBsb2N1cyBDbGllbnRcbiAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAqL1xuICBoYXNEZXBlbmRlbnRzKCkge1xuICAgIGZvciAodmFyIGlkIGluIHRoaXMuX2RlcGVuZGVudHNCeUlkKVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2ZsdXNoXG5cbi8qKlxuICogQHN1bW1hcnkgUHJvY2VzcyBhbGwgcmVhY3RpdmUgdXBkYXRlcyBpbW1lZGlhdGVseSBhbmQgZW5zdXJlIHRoYXQgYWxsIGludmFsaWRhdGVkIGNvbXB1dGF0aW9ucyBhcmUgcmVydW4uXG4gKiBAbG9jdXMgQ2xpZW50XG4gKi9cblRyYWNrZXIuZmx1c2ggPSBmdW5jdGlvbiAob3B0aW9ucykge1xuICBUcmFja2VyLl9ydW5GbHVzaCh7IGZpbmlzaFN5bmNocm9ub3VzbHk6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgdGhyb3dGaXJzdEVycm9yOiBvcHRpb25zICYmIG9wdGlvbnMuX3Rocm93Rmlyc3RFcnJvciB9KTtcbn07XG5cbi8qKlxuICogQHN1bW1hcnkgVHJ1ZSBpZiB3ZSBhcmUgY29tcHV0aW5nIGEgY29tcHV0YXRpb24gbm93LCBlaXRoZXIgZmlyc3QgdGltZSBvciByZWNvbXB1dGUuICBUaGlzIG1hdGNoZXMgVHJhY2tlci5hY3RpdmUgdW5sZXNzIHdlIGFyZSBpbnNpZGUgVHJhY2tlci5ub25yZWFjdGl2ZSwgd2hpY2ggbnVsbGZpZXMgY3VycmVudENvbXB1dGF0aW9uIGV2ZW4gdGhvdWdoIGFuIGVuY2xvc2luZyBjb21wdXRhdGlvbiBtYXkgc3RpbGwgYmUgcnVubmluZy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEByZXR1cm5zIHtCb29sZWFufVxuICovXG5UcmFja2VyLmluRmx1c2ggPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiBpbkZsdXNoO1xufVxuXG4vLyBSdW4gYWxsIHBlbmRpbmcgY29tcHV0YXRpb25zIGFuZCBhZnRlckZsdXNoIGNhbGxiYWNrcy4gIElmIHdlIHdlcmUgbm90IGNhbGxlZFxuLy8gZGlyZWN0bHkgdmlhIFRyYWNrZXIuZmx1c2gsIHRoaXMgbWF5IHJldHVybiBiZWZvcmUgdGhleSdyZSBhbGwgZG9uZSB0byBhbGxvd1xuLy8gdGhlIGV2ZW50IGxvb3AgdG8gcnVuIGEgbGl0dGxlIGJlZm9yZSBjb250aW51aW5nLlxuVHJhY2tlci5fcnVuRmx1c2ggPSBmdW5jdGlvbiAob3B0aW9ucykge1xuICAvLyBYWFggV2hhdCBwYXJ0IG9mIHRoZSBjb21tZW50IGJlbG93IGlzIHN0aWxsIHRydWU/IChXZSBubyBsb25nZXJcbiAgLy8gaGF2ZSBTcGFyaylcbiAgLy9cbiAgLy8gTmVzdGVkIGZsdXNoIGNvdWxkIHBsYXVzaWJseSBoYXBwZW4gaWYsIHNheSwgYSBmbHVzaCBjYXVzZXNcbiAgLy8gRE9NIG11dGF0aW9uLCB3aGljaCBjYXVzZXMgYSBcImJsdXJcIiBldmVudCwgd2hpY2ggcnVucyBhblxuICAvLyBhcHAgZXZlbnQgaGFuZGxlciB0aGF0IGNhbGxzIFRyYWNrZXIuZmx1c2guICBBdCB0aGUgbW9tZW50XG4gIC8vIFNwYXJrIGJsb2NrcyBldmVudCBoYW5kbGVycyBkdXJpbmcgRE9NIG11dGF0aW9uIGFueXdheSxcbiAgLy8gYmVjYXVzZSB0aGUgTGl2ZVJhbmdlIHRyZWUgaXNuJ3QgdmFsaWQuICBBbmQgd2UgZG9uJ3QgaGF2ZVxuICAvLyBhbnkgdXNlZnVsIG5vdGlvbiBvZiBhIG5lc3RlZCBmbHVzaC5cbiAgLy9cbiAgLy8gaHR0cHM6Ly9hcHAuYXNhbmEuY29tLzAvMTU5OTA4MzMwMjQ0LzM4NTEzODIzMzg1NlxuICBpZiAoVHJhY2tlci5pbkZsdXNoKCkpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgY2FsbCBUcmFja2VyLmZsdXNoIHdoaWxlIGZsdXNoaW5nXCIpO1xuXG4gIGlmIChpbkNvbXB1dGUpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgZmx1c2ggaW5zaWRlIFRyYWNrZXIuYXV0b3J1blwiKTtcblxuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICBpbkZsdXNoID0gdHJ1ZTtcbiAgd2lsbEZsdXNoID0gdHJ1ZTtcbiAgdGhyb3dGaXJzdEVycm9yID0gISEgb3B0aW9ucy50aHJvd0ZpcnN0RXJyb3I7XG5cbiAgdmFyIHJlY29tcHV0ZWRDb3VudCA9IDA7XG4gIHZhciBmaW5pc2hlZFRyeSA9IGZhbHNlO1xuICB0cnkge1xuICAgIHdoaWxlIChwZW5kaW5nQ29tcHV0YXRpb25zLmxlbmd0aCB8fFxuICAgICAgICAgICBhZnRlckZsdXNoQ2FsbGJhY2tzLmxlbmd0aCkge1xuXG4gICAgICAvLyByZWNvbXB1dGUgYWxsIHBlbmRpbmcgY29tcHV0YXRpb25zXG4gICAgICB3aGlsZSAocGVuZGluZ0NvbXB1dGF0aW9ucy5sZW5ndGgpIHtcbiAgICAgICAgdmFyIGNvbXAgPSBwZW5kaW5nQ29tcHV0YXRpb25zLnNoaWZ0KCk7XG4gICAgICAgIGNvbXAuX3JlY29tcHV0ZSgpO1xuICAgICAgICBpZiAoY29tcC5fbmVlZHNSZWNvbXB1dGUoKSkge1xuICAgICAgICAgIHBlbmRpbmdDb21wdXRhdGlvbnMudW5zaGlmdChjb21wKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghIG9wdGlvbnMuZmluaXNoU3luY2hyb25vdXNseSAmJiArK3JlY29tcHV0ZWRDb3VudCA+IDEwMDApIHtcbiAgICAgICAgICBmaW5pc2hlZFRyeSA9IHRydWU7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChhZnRlckZsdXNoQ2FsbGJhY2tzLmxlbmd0aCkge1xuICAgICAgICAvLyBjYWxsIG9uZSBhZnRlckZsdXNoIGNhbGxiYWNrLCB3aGljaCBtYXlcbiAgICAgICAgLy8gaW52YWxpZGF0ZSBtb3JlIGNvbXB1dGF0aW9uc1xuICAgICAgICB2YXIgZnVuYyA9IGFmdGVyRmx1c2hDYWxsYmFja3Muc2hpZnQoKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBmdW5jKCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBfdGhyb3dPckxvZyhcImFmdGVyRmx1c2hcIiwgZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgZmluaXNoZWRUcnkgPSB0cnVlO1xuICB9IGZpbmFsbHkge1xuICAgIGlmICghIGZpbmlzaGVkVHJ5KSB7XG4gICAgICAvLyB3ZSdyZSBlcnJvcmluZyBkdWUgdG8gdGhyb3dGaXJzdEVycm9yIGJlaW5nIHRydWUuXG4gICAgICBpbkZsdXNoID0gZmFsc2U7IC8vIG5lZWRlZCBiZWZvcmUgY2FsbGluZyBgVHJhY2tlci5mbHVzaCgpYCBhZ2FpblxuICAgICAgLy8gZmluaXNoIGZsdXNoaW5nXG4gICAgICBUcmFja2VyLl9ydW5GbHVzaCh7XG4gICAgICAgIGZpbmlzaFN5bmNocm9ub3VzbHk6IG9wdGlvbnMuZmluaXNoU3luY2hyb25vdXNseSxcbiAgICAgICAgdGhyb3dGaXJzdEVycm9yOiBmYWxzZVxuICAgICAgfSk7XG4gICAgfVxuICAgIHdpbGxGbHVzaCA9IGZhbHNlO1xuICAgIGluRmx1c2ggPSBmYWxzZTtcbiAgICBpZiAocGVuZGluZ0NvbXB1dGF0aW9ucy5sZW5ndGggfHwgYWZ0ZXJGbHVzaENhbGxiYWNrcy5sZW5ndGgpIHtcbiAgICAgIC8vIFdlJ3JlIHlpZWxkaW5nIGJlY2F1c2Ugd2UgcmFuIGEgYnVuY2ggb2YgY29tcHV0YXRpb25zIGFuZCB3ZSBhcmVuJ3RcbiAgICAgIC8vIHJlcXVpcmVkIHRvIGZpbmlzaCBzeW5jaHJvbm91c2x5LCBzbyB3ZSdkIGxpa2UgdG8gZ2l2ZSB0aGUgZXZlbnQgbG9vcCBhXG4gICAgICAvLyBjaGFuY2UuIFdlIHNob3VsZCBmbHVzaCBhZ2FpbiBzb29uLlxuICAgICAgaWYgKG9wdGlvbnMuZmluaXNoU3luY2hyb25vdXNseSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJzdGlsbCBoYXZlIG1vcmUgdG8gZG8/XCIpOyAgLy8gc2hvdWxkbid0IGhhcHBlblxuICAgICAgfVxuICAgICAgc2V0VGltZW91dChyZXF1aXJlRmx1c2gsIDEwKTtcbiAgICB9XG4gIH1cbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfYXV0b3J1blxuLy9cbi8vIFJ1biBmKCkuIFJlY29yZCBpdHMgZGVwZW5kZW5jaWVzLiBSZXJ1biBpdCB3aGVuZXZlciB0aGVcbi8vIGRlcGVuZGVuY2llcyBjaGFuZ2UuXG4vL1xuLy8gUmV0dXJucyBhIG5ldyBDb21wdXRhdGlvbiwgd2hpY2ggaXMgYWxzbyBwYXNzZWQgdG8gZi5cbi8vXG4vLyBMaW5rcyB0aGUgY29tcHV0YXRpb24gdG8gdGhlIGN1cnJlbnQgY29tcHV0YXRpb25cbi8vIHNvIHRoYXQgaXQgaXMgc3RvcHBlZCBpZiB0aGUgY3VycmVudCBjb21wdXRhdGlvbiBpcyBpbnZhbGlkYXRlZC5cblxuLyoqXG4gKiBAY2FsbGJhY2sgVHJhY2tlci5Db21wdXRhdGlvbkZ1bmN0aW9uXG4gKiBAcGFyYW0ge1RyYWNrZXIuQ29tcHV0YXRpb259XG4gKi9cbi8qKlxuICogQHN1bW1hcnkgUnVuIGEgZnVuY3Rpb24gbm93IGFuZCByZXJ1biBpdCBsYXRlciB3aGVuZXZlciBpdHMgZGVwZW5kZW5jaWVzXG4gKiBjaGFuZ2UuIFJldHVybnMgYSBDb21wdXRhdGlvbiBvYmplY3QgdGhhdCBjYW4gYmUgdXNlZCB0byBzdG9wIG9yIG9ic2VydmUgdGhlXG4gKiByZXJ1bm5pbmcuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge1RyYWNrZXIuQ29tcHV0YXRpb25GdW5jdGlvbn0gcnVuRnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuLiBJdCByZWNlaXZlc1xuICogb25lIGFyZ3VtZW50OiB0aGUgQ29tcHV0YXRpb24gb2JqZWN0IHRoYXQgd2lsbCBiZSByZXR1cm5lZC5cbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc11cbiAqIEBwYXJhbSB7RnVuY3Rpb259IG9wdGlvbnMub25FcnJvciBPcHRpb25hbC4gVGhlIGZ1bmN0aW9uIHRvIHJ1biB3aGVuIGFuIGVycm9yXG4gKiBoYXBwZW5zIGluIHRoZSBDb21wdXRhdGlvbi4gVGhlIG9ubHkgYXJndW1lbnQgaXQgcmVjZWl2ZXMgaXMgdGhlIEVycm9yXG4gKiB0aHJvd24uIERlZmF1bHRzIHRvIHRoZSBlcnJvciBiZWluZyBsb2dnZWQgdG8gdGhlIGNvbnNvbGUuXG4gKiBAcmV0dXJucyB7VHJhY2tlci5Db21wdXRhdGlvbn1cbiAqL1xuVHJhY2tlci5hdXRvcnVuID0gZnVuY3Rpb24gKGYsIG9wdGlvbnMgPSB7fSkge1xuICBpZiAodHlwZW9mIGYgIT09ICdmdW5jdGlvbicpXG4gICAgdGhyb3cgbmV3IEVycm9yKCdUcmFja2VyLmF1dG9ydW4gcmVxdWlyZXMgYSBmdW5jdGlvbiBhcmd1bWVudCcpO1xuXG4gIGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uID0gdHJ1ZTtcbiAgdmFyIGMgPSBuZXcgVHJhY2tlci5Db21wdXRhdGlvbihmLCBUcmFja2VyLmN1cnJlbnRDb21wdXRhdGlvbiwgb3B0aW9ucy5vbkVycm9yKTtcblxuICBpZiAoVHJhY2tlci5hY3RpdmUpXG4gICAgVHJhY2tlci5vbkludmFsaWRhdGUoZnVuY3Rpb24gKCkge1xuICAgICAgYy5zdG9wKCk7XG4gICAgfSk7XG5cbiAgcmV0dXJuIGM7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX25vbnJlYWN0aXZlXG4vL1xuLy8gUnVuIGBmYCB3aXRoIG5vIGN1cnJlbnQgY29tcHV0YXRpb24sIHJldHVybmluZyB0aGUgcmV0dXJuIHZhbHVlXG4vLyBvZiBgZmAuICBVc2VkIHRvIHR1cm4gb2ZmIHJlYWN0aXZpdHkgZm9yIHRoZSBkdXJhdGlvbiBvZiBgZmAsXG4vLyBzbyB0aGF0IHJlYWN0aXZlIGRhdGEgc291cmNlcyBhY2Nlc3NlZCBieSBgZmAgd2lsbCBub3QgcmVzdWx0IGluIGFueVxuLy8gY29tcHV0YXRpb25zIGJlaW5nIGludmFsaWRhdGVkLlxuXG4vKipcbiAqIEBzdW1tYXJ5IFJ1biBhIGZ1bmN0aW9uIHdpdGhvdXQgdHJhY2tpbmcgZGVwZW5kZW5jaWVzLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBBIGZ1bmN0aW9uIHRvIGNhbGwgaW1tZWRpYXRlbHkuXG4gKi9cblRyYWNrZXIubm9ucmVhY3RpdmUgPSBmdW5jdGlvbiAoZikge1xuICByZXR1cm4gVHJhY2tlci53aXRoQ29tcHV0YXRpb24obnVsbCwgZik7XG59O1xuXG4vKipcbiAqIEBzdW1tYXJ5IEhlbHBlciBmdW5jdGlvbiB0byBtYWtlIHRoZSB0cmFja2VyIHdvcmsgd2l0aCBwcm9taXNlcy5cbiAqIEBwYXJhbSBjb21wdXRhdGlvbiBDb21wdXRhdGlvbiB0aGF0IHRyYWNrZWRcbiAqIEBwYXJhbSBmdW5jIGFzeW5jIGZ1bmN0aW9uIHRoYXQgbmVlZHMgdG8gYmUgY2FsbGVkIGFuZCBiZSByZWFjdGl2ZVxuICovXG5UcmFja2VyLndpdGhDb21wdXRhdGlvbiA9IGZ1bmN0aW9uIChjb21wdXRhdGlvbiwgZikge1xuICB2YXIgcHJldmlvdXNDb21wdXRhdGlvbiA9IFRyYWNrZXIuY3VycmVudENvbXB1dGF0aW9uO1xuXG4gIFRyYWNrZXIuY3VycmVudENvbXB1dGF0aW9uID0gY29tcHV0YXRpb247XG4gIFRyYWNrZXIuYWN0aXZlID0gISFjb21wdXRhdGlvbjtcblxuICB0cnkge1xuICAgIHJldHVybiBmKCk7XG4gIH0gZmluYWxseSB7XG4gICAgVHJhY2tlci5jdXJyZW50Q29tcHV0YXRpb24gPSBwcmV2aW91c0NvbXB1dGF0aW9uO1xuICAgIFRyYWNrZXIuYWN0aXZlID0gISFwcmV2aW91c0NvbXB1dGF0aW9uO1xuICB9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX29uaW52YWxpZGF0ZVxuXG4vKipcbiAqIEBzdW1tYXJ5IFJlZ2lzdGVycyBhIG5ldyBbYG9uSW52YWxpZGF0ZWBdKCNjb21wdXRhdGlvbl9vbmludmFsaWRhdGUpIGNhbGxiYWNrIG9uIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uICh3aGljaCBtdXN0IGV4aXN0KSwgdG8gYmUgY2FsbGVkIGltbWVkaWF0ZWx5IHdoZW4gdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gaXMgaW52YWxpZGF0ZWQgb3Igc3RvcHBlZC5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEEgY2FsbGJhY2sgZnVuY3Rpb24gdGhhdCB3aWxsIGJlIGludm9rZWQgYXMgYGZ1bmMoYylgLCB3aGVyZSBgY2AgaXMgdGhlIGNvbXB1dGF0aW9uIG9uIHdoaWNoIHRoZSBjYWxsYmFjayBpcyByZWdpc3RlcmVkLlxuICovXG5UcmFja2VyLm9uSW52YWxpZGF0ZSA9IGZ1bmN0aW9uIChmKSB7XG4gIGlmICghIFRyYWNrZXIuYWN0aXZlKVxuICAgIHRocm93IG5ldyBFcnJvcihcIlRyYWNrZXIub25JbnZhbGlkYXRlIHJlcXVpcmVzIGEgY3VycmVudENvbXB1dGF0aW9uXCIpO1xuXG4gIFRyYWNrZXIuY3VycmVudENvbXB1dGF0aW9uLm9uSW52YWxpZGF0ZShmKTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfYWZ0ZXJmbHVzaFxuXG4vKipcbiAqIEBzdW1tYXJ5IFNjaGVkdWxlcyBhIGZ1bmN0aW9uIHRvIGJlIGNhbGxlZCBkdXJpbmcgdGhlIG5leHQgZmx1c2gsIG9yIGxhdGVyIGluIHRoZSBjdXJyZW50IGZsdXNoIGlmIG9uZSBpcyBpbiBwcm9ncmVzcywgYWZ0ZXIgYWxsIGludmFsaWRhdGVkIGNvbXB1dGF0aW9ucyBoYXZlIGJlZW4gcmVydW4uICBUaGUgZnVuY3Rpb24gd2lsbCBiZSBydW4gb25jZSBhbmQgbm90IG9uIHN1YnNlcXVlbnQgZmx1c2hlcyB1bmxlc3MgYGFmdGVyRmx1c2hgIGlzIGNhbGxlZCBhZ2Fpbi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEEgZnVuY3Rpb24gdG8gY2FsbCBhdCBmbHVzaCB0aW1lLlxuICovXG5UcmFja2VyLmFmdGVyRmx1c2ggPSBmdW5jdGlvbiAoZikge1xuICBhZnRlckZsdXNoQ2FsbGJhY2tzLnB1c2goZik7XG4gIHJlcXVpcmVGbHVzaCgpO1xufTtcbiJdfQ==
