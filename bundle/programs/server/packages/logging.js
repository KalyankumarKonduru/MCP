Package["core-runtime"].queue("logging",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;
var EJSON = Package.ejson.EJSON;
var ECMAScript = Package.ecmascript.ECMAScript;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var Formatter, Log;

var require = meteorInstall({"node_modules":{"meteor":{"logging":{"logging.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/logging/logging.js                                                                                        //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
      Log: () => Log
    });
    let Meteor;
    module.link("meteor/meteor", {
      Meteor(v) {
        Meteor = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    const hasOwn = Object.prototype.hasOwnProperty;
    function Log() {
      Log.info(...arguments);
    }

    /// FOR TESTING
    let intercept = 0;
    let interceptedLines = [];
    let suppress = 0;

    // Intercept the next 'count' calls to a Log function. The actual
    // lines printed to the console can be cleared and read by calling
    // Log._intercepted().
    Log._intercept = count => {
      intercept += count;
    };

    // Suppress the next 'count' calls to a Log function. Use this to stop
    // tests from spamming the console, especially with red errors that
    // might look like a failing test.
    Log._suppress = count => {
      suppress += count;
    };

    // Returns intercepted lines and resets the intercept counter.
    Log._intercepted = () => {
      const lines = interceptedLines;
      interceptedLines = [];
      intercept = 0;
      return lines;
    };

    // Either 'json' or 'colored-text'.
    //
    // When this is set to 'json', print JSON documents that are parsed by another
    // process ('satellite' or 'meteor run'). This other process should call
    // 'Log.format' for nice output.
    //
    // When this is set to 'colored-text', call 'Log.format' before printing.
    // This should be used for logging from within satellite, since there is no
    // other process that will be reading its standard output.
    Log.outputFormat = 'json';

    // Defaults to true for local development and for backwards compatibility.
    // for cloud environments is interesting to leave it false as most of them have the timestamp in the console.
    // Only works in server with colored-text
    Log.showTime = true;
    const LEVEL_COLORS = {
      debug: 'green',
      // leave info as the default color
      warn: 'magenta',
      error: 'red'
    };
    const META_COLOR = 'blue';

    // Default colors cause readability problems on Windows Powershell,
    // switch to bright variants. While still capable of millions of
    // operations per second, the benchmark showed a 25%+ increase in
    // ops per second (on Node 8) by caching "process.platform".
    const isWin32 = typeof process === 'object' && process.platform === 'win32';
    const platformColor = color => {
      if (isWin32 && typeof color === 'string' && !color.endsWith('Bright')) {
        return "".concat(color, "Bright");
      }
      return color;
    };

    // XXX package
    const RESTRICTED_KEYS = ['time', 'timeInexact', 'level', 'file', 'line', 'program', 'originApp', 'satellite', 'stderr'];
    const FORMATTED_KEYS = [...RESTRICTED_KEYS, 'app', 'message'];
    const logInBrowser = obj => {
      const str = Log.format(obj);

      // XXX Some levels should be probably be sent to the server
      const level = obj.level;
      if (typeof console !== 'undefined' && console[level]) {
        console[level](str);
      } else {
        // IE doesn't have console.log.apply, it's not a real Object.
        // http://stackoverflow.com/questions/5538972/console-log-apply-not-working-in-ie9
        // http://patik.com/blog/complete-cross-browser-console-log/
        if (typeof console.log.apply === "function") {
          // Most browsers
          console.log.apply(console, [str]);
        } else if (typeof Function.prototype.bind === "function") {
          // IE9
          const log = Function.prototype.bind.call(console.log, console);
          log.apply(console, [str]);
        }
      }
    };

    // @returns {Object: { line: Number, file: String }}
    Log._getCallerDetails = () => {
      const getStack = () => {
        // We do NOT use Error.prepareStackTrace here (a V8 extension that gets us a
        // pre-parsed stack) since it's impossible to compose it with the use of
        // Error.prepareStackTrace used on the server for source maps.
        const err = new Error();
        const stack = err.stack;
        return stack;
      };
      const stack = getStack();
      if (!stack) return {};

      // looking for the first line outside the logging package (or an
      // eval if we find that first)
      let line;
      const lines = stack.split('\n').slice(1);
      for (line of lines) {
        if (line.match(/^\s*(at eval \(eval)|(eval:)/)) {
          return {
            file: "eval"
          };
        }
        if (!line.match(/packages\/(?:local-test[:_])?logging(?:\/|\.js)/)) {
          break;
        }
      }
      const details = {};

      // The format for FF is 'functionName@filePath:lineNumber'
      // The format for V8 is 'functionName (packages/logging/logging.js:81)' or
      //                      'packages/logging/logging.js:81'
      const match = /(?:[@(]| at )([^(]+?):([0-9:]+)(?:\)|$)/.exec(line);
      if (!match) {
        return details;
      }

      // in case the matched block here is line:column
      details.line = match[2].split(':')[0];

      // Possible format: https://foo.bar.com/scripts/file.js?random=foobar
      // XXX: if you can write the following in better way, please do it
      // XXX: what about evals?
      details.file = match[1].split('/').slice(-1)[0].split('?')[0];
      return details;
    };
    ['debug', 'info', 'warn', 'error'].forEach(level => {
      // @param arg {String|Object}
      Log[level] = arg => {
        if (suppress) {
          suppress--;
          return;
        }
        let intercepted = false;
        if (intercept) {
          intercept--;
          intercepted = true;
        }
        let obj = arg === Object(arg) && !(arg instanceof RegExp) && !(arg instanceof Date) ? arg : {
          message: new String(arg).toString()
        };
        RESTRICTED_KEYS.forEach(key => {
          if (obj[key]) {
            throw new Error("Can't set '".concat(key, "' in log message"));
          }
        });
        if (hasOwn.call(obj, 'message') && typeof obj.message !== 'string') {
          throw new Error("The 'message' field in log objects must be a string");
        }
        if (!obj.omitCallerDetails) {
          obj = _objectSpread(_objectSpread({}, Log._getCallerDetails()), obj);
        }
        obj.time = new Date();
        obj.level = level;

        // If we are in production don't write out debug logs.
        if (level === 'debug' && Meteor.isProduction) {
          return;
        }
        if (intercepted) {
          interceptedLines.push(EJSON.stringify(obj));
        } else if (Meteor.isServer) {
          if (Log.outputFormat === 'colored-text') {
            console.log(Log.format(obj, {
              color: true
            }));
          } else if (Log.outputFormat === 'json') {
            console.log(EJSON.stringify(obj));
          } else {
            throw new Error("Unknown logging output format: ".concat(Log.outputFormat));
          }
        } else {
          logInBrowser(obj);
        }
      };
    });

    // tries to parse line as EJSON. returns object if parse is successful, or null if not
    Log.parse = line => {
      let obj = null;
      if (line && line.startsWith('{')) {
        // might be json generated from calling 'Log'
        try {
          obj = EJSON.parse(line);
        } catch (e) {}
      }

      // XXX should probably check fields other than 'time'
      if (obj && obj.time && obj.time instanceof Date) {
        return obj;
      } else {
        return null;
      }
    };

    // formats a log object into colored human and machine-readable text
    Log.format = function (obj) {
      let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      obj = _objectSpread({}, obj); // don't mutate the argument
      let {
        time,
        timeInexact,
        level = 'info',
        file,
        line: lineNumber,
        app: appName = '',
        originApp,
        message = '',
        program = '',
        satellite = '',
        stderr = ''
      } = obj;
      if (!(time instanceof Date)) {
        throw new Error("'time' must be a Date object");
      }
      FORMATTED_KEYS.forEach(key => {
        delete obj[key];
      });
      if (Object.keys(obj).length > 0) {
        if (message) {
          message += ' ';
        }
        message += EJSON.stringify(obj);
      }
      const pad2 = n => n.toString().padStart(2, '0');
      const pad3 = n => n.toString().padStart(3, '0');
      const dateStamp = time.getFullYear().toString() + pad2(time.getMonth() + 1 /*0-based*/) + pad2(time.getDate());
      const timeStamp = pad2(time.getHours()) + ':' + pad2(time.getMinutes()) + ':' + pad2(time.getSeconds()) + '.' + pad3(time.getMilliseconds());

      // eg in San Francisco in June this will be '(-7)'
      const utcOffsetStr = "(".concat(-(new Date().getTimezoneOffset() / 60), ")");
      let appInfo = '';
      if (appName) {
        appInfo += appName;
      }
      if (originApp && originApp !== appName) {
        appInfo += " via ".concat(originApp);
      }
      if (appInfo) {
        appInfo = "[".concat(appInfo, "] ");
      }
      const sourceInfoParts = [];
      if (program) {
        sourceInfoParts.push(program);
      }
      if (file) {
        sourceInfoParts.push(file);
      }
      if (lineNumber) {
        sourceInfoParts.push(lineNumber);
      }
      let sourceInfo = !sourceInfoParts.length ? '' : "(".concat(sourceInfoParts.join(':'), ") ");
      if (satellite) sourceInfo += "[".concat(satellite, "]");
      const stderrIndicator = stderr ? '(STDERR) ' : '';
      const timeString = Log.showTime ? "".concat(dateStamp, "-").concat(timeStamp).concat(utcOffsetStr).concat(timeInexact ? '? ' : ' ') : ' ';
      const metaPrefix = [level.charAt(0).toUpperCase(), timeString, appInfo, sourceInfo, stderrIndicator].join('');
      return Formatter.prettify(metaPrefix, options.color && platformColor(options.metaColor || META_COLOR)) + Formatter.prettify(message, options.color && platformColor(LEVEL_COLORS[level]));
    };

    // Turn a line of text into a loggable object.
    // @param line {String}
    // @param override {Object}
    Log.objFromText = (line, override) => {
      return _objectSpread({
        message: line,
        level: 'info',
        time: new Date(),
        timeInexact: true
      }, override);
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
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"logging_server.js":function module(require){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/logging/logging_server.js                                                                                 //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
Formatter = {};
Formatter.prettify = function (line, color) {
  if (!color) return line;
  return require("chalk")[color](line);
};
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"node_modules":{"@babel":{"runtime":{"helpers":{"objectSpread2.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// node_modules/meteor/logging/node_modules/@babel/runtime/helpers/objectSpread2.js                                   //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
module.useNode();
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}},"chalk":{"package.json":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// node_modules/meteor/logging/node_modules/chalk/package.json                                                        //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
module.exports = {
  "name": "chalk",
  "version": "4.1.2",
  "main": "source"
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"source":{"index.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// node_modules/meteor/logging/node_modules/chalk/source/index.js                                                     //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
module.useNode();
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}}}}},{
  "extensions": [
    ".js",
    ".json",
    ".ts"
  ]
});


/* Exports */
return {
  export: function () { return {
      Log: Log
    };},
  require: require,
  eagerModulePaths: [
    "/node_modules/meteor/logging/logging.js",
    "/node_modules/meteor/logging/logging_server.js"
  ],
  mainModulePath: "/node_modules/meteor/logging/logging.js"
}});

//# sourceURL=meteor://💻app/packages/logging.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvbG9nZ2luZy9sb2dnaW5nLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9sb2dnaW5nL2xvZ2dpbmdfc2VydmVyLmpzIl0sIm5hbWVzIjpbIl9vYmplY3RTcHJlYWQiLCJtb2R1bGUiLCJsaW5rIiwiZGVmYXVsdCIsInYiLCJleHBvcnQiLCJMb2ciLCJNZXRlb3IiLCJfX3JlaWZ5V2FpdEZvckRlcHNfXyIsImhhc093biIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiaW5mbyIsImFyZ3VtZW50cyIsImludGVyY2VwdCIsImludGVyY2VwdGVkTGluZXMiLCJzdXBwcmVzcyIsIl9pbnRlcmNlcHQiLCJjb3VudCIsIl9zdXBwcmVzcyIsIl9pbnRlcmNlcHRlZCIsImxpbmVzIiwib3V0cHV0Rm9ybWF0Iiwic2hvd1RpbWUiLCJMRVZFTF9DT0xPUlMiLCJkZWJ1ZyIsIndhcm4iLCJlcnJvciIsIk1FVEFfQ09MT1IiLCJpc1dpbjMyIiwicHJvY2VzcyIsInBsYXRmb3JtIiwicGxhdGZvcm1Db2xvciIsImNvbG9yIiwiZW5kc1dpdGgiLCJjb25jYXQiLCJSRVNUUklDVEVEX0tFWVMiLCJGT1JNQVRURURfS0VZUyIsImxvZ0luQnJvd3NlciIsIm9iaiIsInN0ciIsImZvcm1hdCIsImxldmVsIiwiY29uc29sZSIsImxvZyIsImFwcGx5IiwiRnVuY3Rpb24iLCJiaW5kIiwiY2FsbCIsIl9nZXRDYWxsZXJEZXRhaWxzIiwiZ2V0U3RhY2siLCJlcnIiLCJFcnJvciIsInN0YWNrIiwibGluZSIsInNwbGl0Iiwic2xpY2UiLCJtYXRjaCIsImZpbGUiLCJkZXRhaWxzIiwiZXhlYyIsImZvckVhY2giLCJhcmciLCJpbnRlcmNlcHRlZCIsIlJlZ0V4cCIsIkRhdGUiLCJtZXNzYWdlIiwiU3RyaW5nIiwidG9TdHJpbmciLCJrZXkiLCJvbWl0Q2FsbGVyRGV0YWlscyIsInRpbWUiLCJpc1Byb2R1Y3Rpb24iLCJwdXNoIiwiRUpTT04iLCJzdHJpbmdpZnkiLCJpc1NlcnZlciIsInBhcnNlIiwic3RhcnRzV2l0aCIsImUiLCJvcHRpb25zIiwibGVuZ3RoIiwidW5kZWZpbmVkIiwidGltZUluZXhhY3QiLCJsaW5lTnVtYmVyIiwiYXBwIiwiYXBwTmFtZSIsIm9yaWdpbkFwcCIsInByb2dyYW0iLCJzYXRlbGxpdGUiLCJzdGRlcnIiLCJrZXlzIiwicGFkMiIsIm4iLCJwYWRTdGFydCIsInBhZDMiLCJkYXRlU3RhbXAiLCJnZXRGdWxsWWVhciIsImdldE1vbnRoIiwiZ2V0RGF0ZSIsInRpbWVTdGFtcCIsImdldEhvdXJzIiwiZ2V0TWludXRlcyIsImdldFNlY29uZHMiLCJnZXRNaWxsaXNlY29uZHMiLCJ1dGNPZmZzZXRTdHIiLCJnZXRUaW1lem9uZU9mZnNldCIsImFwcEluZm8iLCJzb3VyY2VJbmZvUGFydHMiLCJzb3VyY2VJbmZvIiwiam9pbiIsInN0ZGVyckluZGljYXRvciIsInRpbWVTdHJpbmciLCJtZXRhUHJlZml4IiwiY2hhckF0IiwidG9VcHBlckNhc2UiLCJGb3JtYXR0ZXIiLCJwcmV0dGlmeSIsIm1ldGFDb2xvciIsIm9iakZyb21UZXh0Iiwib3ZlcnJpZGUiLCJfX3JlaWZ5X2FzeW5jX3Jlc3VsdF9fIiwiX3JlaWZ5RXJyb3IiLCJzZWxmIiwiYXN5bmMiLCJyZXF1aXJlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7SUFBQSxJQUFJQSxhQUFhO0lBQUNDLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDLHNDQUFzQyxFQUFDO01BQUNDLE9BQU9BLENBQUNDLENBQUMsRUFBQztRQUFDSixhQUFhLEdBQUNJLENBQUM7TUFBQTtJQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7SUFBckdILE1BQU0sQ0FBQ0ksTUFBTSxDQUFDO01BQUNDLEdBQUcsRUFBQ0EsQ0FBQSxLQUFJQTtJQUFHLENBQUMsQ0FBQztJQUFDLElBQUlDLE1BQU07SUFBQ04sTUFBTSxDQUFDQyxJQUFJLENBQUMsZUFBZSxF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QUUsSUFBSU4sSUFBSSxDQUFDLENBQUM7UUFDaEJrQixXQUFXLEVBQUU7TUFBSSxHQUNkcUMsUUFBUTtJQUVmLENBQUM7SUFBQ0Msc0JBQUE7RUFBQSxTQUFBQyxXQUFBO0lBQUEsT0FBQUQsc0JBQUEsQ0FBQUMsV0FBQTtFQUFBO0VBQUFELHNCQUFBO0FBQUE7RUFBQUUsSUFBQTtFQUFBQyxLQUFBO0FBQUEsRzs7Ozs7Ozs7Ozs7QUM1VUZSLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDZEEsU0FBUyxDQUFDQyxRQUFRLEdBQUcsVUFBUy9ELElBQUksRUFBRXJCLEtBQUssRUFBQztFQUN0QyxJQUFHLENBQUNBLEtBQUssRUFBRSxPQUFPcUIsSUFBSTtFQUN0QixPQUFPdUUsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDNUYsS0FBSyxDQUFDLENBQUNxQixJQUFJLENBQUM7QUFDeEMsQ0FBQyxDIiwiZmlsZSI6Ii9wYWNrYWdlcy9sb2dnaW5nLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgTWV0ZW9yIH0gZnJvbSAnbWV0ZW9yL21ldGVvcic7XG5cbmNvbnN0IGhhc093biA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHk7XG5cbmZ1bmN0aW9uIExvZyguLi5hcmdzKSB7XG4gIExvZy5pbmZvKC4uLmFyZ3MpO1xufVxuXG4vLy8gRk9SIFRFU1RJTkdcbmxldCBpbnRlcmNlcHQgPSAwO1xubGV0IGludGVyY2VwdGVkTGluZXMgPSBbXTtcbmxldCBzdXBwcmVzcyA9IDA7XG5cbi8vIEludGVyY2VwdCB0aGUgbmV4dCAnY291bnQnIGNhbGxzIHRvIGEgTG9nIGZ1bmN0aW9uLiBUaGUgYWN0dWFsXG4vLyBsaW5lcyBwcmludGVkIHRvIHRoZSBjb25zb2xlIGNhbiBiZSBjbGVhcmVkIGFuZCByZWFkIGJ5IGNhbGxpbmdcbi8vIExvZy5faW50ZXJjZXB0ZWQoKS5cbkxvZy5faW50ZXJjZXB0ID0gKGNvdW50KSA9PiB7XG4gIGludGVyY2VwdCArPSBjb3VudDtcbn07XG5cbi8vIFN1cHByZXNzIHRoZSBuZXh0ICdjb3VudCcgY2FsbHMgdG8gYSBMb2cgZnVuY3Rpb24uIFVzZSB0aGlzIHRvIHN0b3Bcbi8vIHRlc3RzIGZyb20gc3BhbW1pbmcgdGhlIGNvbnNvbGUsIGVzcGVjaWFsbHkgd2l0aCByZWQgZXJyb3JzIHRoYXRcbi8vIG1pZ2h0IGxvb2sgbGlrZSBhIGZhaWxpbmcgdGVzdC5cbkxvZy5fc3VwcHJlc3MgPSAoY291bnQpID0+IHtcbiAgc3VwcHJlc3MgKz0gY291bnQ7XG59O1xuXG4vLyBSZXR1cm5zIGludGVyY2VwdGVkIGxpbmVzIGFuZCByZXNldHMgdGhlIGludGVyY2VwdCBjb3VudGVyLlxuTG9nLl9pbnRlcmNlcHRlZCA9ICgpID0+IHtcbiAgY29uc3QgbGluZXMgPSBpbnRlcmNlcHRlZExpbmVzO1xuICBpbnRlcmNlcHRlZExpbmVzID0gW107XG4gIGludGVyY2VwdCA9IDA7XG4gIHJldHVybiBsaW5lcztcbn07XG5cbi8vIEVpdGhlciAnanNvbicgb3IgJ2NvbG9yZWQtdGV4dCcuXG4vL1xuLy8gV2hlbiB0aGlzIGlzIHNldCB0byAnanNvbicsIHByaW50IEpTT04gZG9jdW1lbnRzIHRoYXQgYXJlIHBhcnNlZCBieSBhbm90aGVyXG4vLyBwcm9jZXNzICgnc2F0ZWxsaXRlJyBvciAnbWV0ZW9yIHJ1bicpLiBUaGlzIG90aGVyIHByb2Nlc3Mgc2hvdWxkIGNhbGxcbi8vICdMb2cuZm9ybWF0JyBmb3IgbmljZSBvdXRwdXQuXG4vL1xuLy8gV2hlbiB0aGlzIGlzIHNldCB0byAnY29sb3JlZC10ZXh0JywgY2FsbCAnTG9nLmZvcm1hdCcgYmVmb3JlIHByaW50aW5nLlxuLy8gVGhpcyBzaG91bGQgYmUgdXNlZCBmb3IgbG9nZ2luZyBmcm9tIHdpdGhpbiBzYXRlbGxpdGUsIHNpbmNlIHRoZXJlIGlzIG5vXG4vLyBvdGhlciBwcm9jZXNzIHRoYXQgd2lsbCBiZSByZWFkaW5nIGl0cyBzdGFuZGFyZCBvdXRwdXQuXG5Mb2cub3V0cHV0Rm9ybWF0ID0gJ2pzb24nO1xuXG4vLyBEZWZhdWx0cyB0byB0cnVlIGZvciBsb2NhbCBkZXZlbG9wbWVudCBhbmQgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5LlxuLy8gZm9yIGNsb3VkIGVudmlyb25tZW50cyBpcyBpbnRlcmVzdGluZyB0byBsZWF2ZSBpdCBmYWxzZSBhcyBtb3N0IG9mIHRoZW0gaGF2ZSB0aGUgdGltZXN0YW1wIGluIHRoZSBjb25zb2xlLlxuLy8gT25seSB3b3JrcyBpbiBzZXJ2ZXIgd2l0aCBjb2xvcmVkLXRleHRcbkxvZy5zaG93VGltZSA9IHRydWU7XG5cbmNvbnN0IExFVkVMX0NPTE9SUyA9IHtcbiAgZGVidWc6ICdncmVlbicsXG4gIC8vIGxlYXZlIGluZm8gYXMgdGhlIGRlZmF1bHQgY29sb3JcbiAgd2FybjogJ21hZ2VudGEnLFxuICBlcnJvcjogJ3JlZCdcbn07XG5cbmNvbnN0IE1FVEFfQ09MT1IgPSAnYmx1ZSc7XG5cbi8vIERlZmF1bHQgY29sb3JzIGNhdXNlIHJlYWRhYmlsaXR5IHByb2JsZW1zIG9uIFdpbmRvd3MgUG93ZXJzaGVsbCxcbi8vIHN3aXRjaCB0byBicmlnaHQgdmFyaWFudHMuIFdoaWxlIHN0aWxsIGNhcGFibGUgb2YgbWlsbGlvbnMgb2Zcbi8vIG9wZXJhdGlvbnMgcGVyIHNlY29uZCwgdGhlIGJlbmNobWFyayBzaG93ZWQgYSAyNSUrIGluY3JlYXNlIGluXG4vLyBvcHMgcGVyIHNlY29uZCAob24gTm9kZSA4KSBieSBjYWNoaW5nIFwicHJvY2Vzcy5wbGF0Zm9ybVwiLlxuY29uc3QgaXNXaW4zMiA9IHR5cGVvZiBwcm9jZXNzID09PSAnb2JqZWN0JyAmJiBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInO1xuY29uc3QgcGxhdGZvcm1Db2xvciA9IChjb2xvcikgPT4ge1xuICBpZiAoaXNXaW4zMiAmJiB0eXBlb2YgY29sb3IgPT09ICdzdHJpbmcnICYmICFjb2xvci5lbmRzV2l0aCgnQnJpZ2h0JykpIHtcbiAgICByZXR1cm4gYCR7Y29sb3J9QnJpZ2h0YDtcbiAgfVxuICByZXR1cm4gY29sb3I7XG59O1xuXG4vLyBYWFggcGFja2FnZVxuY29uc3QgUkVTVFJJQ1RFRF9LRVlTID0gWyd0aW1lJywgJ3RpbWVJbmV4YWN0JywgJ2xldmVsJywgJ2ZpbGUnLCAnbGluZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJvZ3JhbScsICdvcmlnaW5BcHAnLCAnc2F0ZWxsaXRlJywgJ3N0ZGVyciddO1xuXG5jb25zdCBGT1JNQVRURURfS0VZUyA9IFsuLi5SRVNUUklDVEVEX0tFWVMsICdhcHAnLCAnbWVzc2FnZSddO1xuXG5jb25zdCBsb2dJbkJyb3dzZXIgPSBvYmogPT4ge1xuICBjb25zdCBzdHIgPSBMb2cuZm9ybWF0KG9iaik7XG5cbiAgLy8gWFhYIFNvbWUgbGV2ZWxzIHNob3VsZCBiZSBwcm9iYWJseSBiZSBzZW50IHRvIHRoZSBzZXJ2ZXJcbiAgY29uc3QgbGV2ZWwgPSBvYmoubGV2ZWw7XG5cbiAgaWYgKCh0eXBlb2YgY29uc29sZSAhPT0gJ3VuZGVmaW5lZCcpICYmIGNvbnNvbGVbbGV2ZWxdKSB7XG4gICAgY29uc29sZVtsZXZlbF0oc3RyKTtcbiAgfSBlbHNlIHtcbiAgICAvLyBJRSBkb2Vzbid0IGhhdmUgY29uc29sZS5sb2cuYXBwbHksIGl0J3Mgbm90IGEgcmVhbCBPYmplY3QuXG4gICAgLy8gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy81NTM4OTcyL2NvbnNvbGUtbG9nLWFwcGx5LW5vdC13b3JraW5nLWluLWllOVxuICAgIC8vIGh0dHA6Ly9wYXRpay5jb20vYmxvZy9jb21wbGV0ZS1jcm9zcy1icm93c2VyLWNvbnNvbGUtbG9nL1xuICAgIGlmICh0eXBlb2YgY29uc29sZS5sb2cuYXBwbHkgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgLy8gTW9zdCBicm93c2Vyc1xuICAgICAgY29uc29sZS5sb2cuYXBwbHkoY29uc29sZSwgW3N0cl0pO1xuXG4gICAgfSBlbHNlIGlmICh0eXBlb2YgRnVuY3Rpb24ucHJvdG90eXBlLmJpbmQgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgLy8gSUU5XG4gICAgICBjb25zdCBsb2cgPSBGdW5jdGlvbi5wcm90b3R5cGUuYmluZC5jYWxsKGNvbnNvbGUubG9nLCBjb25zb2xlKTtcbiAgICAgIGxvZy5hcHBseShjb25zb2xlLCBbc3RyXSk7XG4gICAgfVxuICB9XG59O1xuXG4vLyBAcmV0dXJucyB7T2JqZWN0OiB7IGxpbmU6IE51bWJlciwgZmlsZTogU3RyaW5nIH19XG5Mb2cuX2dldENhbGxlckRldGFpbHMgPSAoKSA9PiB7XG4gIGNvbnN0IGdldFN0YWNrID0gKCkgPT4ge1xuICAgIC8vIFdlIGRvIE5PVCB1c2UgRXJyb3IucHJlcGFyZVN0YWNrVHJhY2UgaGVyZSAoYSBWOCBleHRlbnNpb24gdGhhdCBnZXRzIHVzIGFcbiAgICAvLyBwcmUtcGFyc2VkIHN0YWNrKSBzaW5jZSBpdCdzIGltcG9zc2libGUgdG8gY29tcG9zZSBpdCB3aXRoIHRoZSB1c2Ugb2ZcbiAgICAvLyBFcnJvci5wcmVwYXJlU3RhY2tUcmFjZSB1c2VkIG9uIHRoZSBzZXJ2ZXIgZm9yIHNvdXJjZSBtYXBzLlxuICAgIGNvbnN0IGVyciA9IG5ldyBFcnJvcjtcbiAgICBjb25zdCBzdGFjayA9IGVyci5zdGFjaztcbiAgICByZXR1cm4gc3RhY2s7XG4gIH07XG5cbiAgY29uc3Qgc3RhY2sgPSBnZXRTdGFjaygpO1xuXG4gIGlmICghc3RhY2spIHJldHVybiB7fTtcblxuICAvLyBsb29raW5nIGZvciB0aGUgZmlyc3QgbGluZSBvdXRzaWRlIHRoZSBsb2dnaW5nIHBhY2thZ2UgKG9yIGFuXG4gIC8vIGV2YWwgaWYgd2UgZmluZCB0aGF0IGZpcnN0KVxuICBsZXQgbGluZTtcbiAgY29uc3QgbGluZXMgPSBzdGFjay5zcGxpdCgnXFxuJykuc2xpY2UoMSk7XG4gIGZvciAobGluZSBvZiBsaW5lcykge1xuICAgIGlmIChsaW5lLm1hdGNoKC9eXFxzKihhdCBldmFsIFxcKGV2YWwpfChldmFsOikvKSkge1xuICAgICAgcmV0dXJuIHtmaWxlOiBcImV2YWxcIn07XG4gICAgfVxuXG4gICAgaWYgKCFsaW5lLm1hdGNoKC9wYWNrYWdlc1xcLyg/OmxvY2FsLXRlc3RbOl9dKT9sb2dnaW5nKD86XFwvfFxcLmpzKS8pKSB7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICBjb25zdCBkZXRhaWxzID0ge307XG5cbiAgLy8gVGhlIGZvcm1hdCBmb3IgRkYgaXMgJ2Z1bmN0aW9uTmFtZUBmaWxlUGF0aDpsaW5lTnVtYmVyJ1xuICAvLyBUaGUgZm9ybWF0IGZvciBWOCBpcyAnZnVuY3Rpb25OYW1lIChwYWNrYWdlcy9sb2dnaW5nL2xvZ2dpbmcuanM6ODEpJyBvclxuICAvLyAgICAgICAgICAgICAgICAgICAgICAncGFja2FnZXMvbG9nZ2luZy9sb2dnaW5nLmpzOjgxJ1xuICBjb25zdCBtYXRjaCA9IC8oPzpbQChdfCBhdCApKFteKF0rPyk6KFswLTk6XSspKD86XFwpfCQpLy5leGVjKGxpbmUpO1xuICBpZiAoIW1hdGNoKSB7XG4gICAgcmV0dXJuIGRldGFpbHM7XG4gIH1cblxuICAvLyBpbiBjYXNlIHRoZSBtYXRjaGVkIGJsb2NrIGhlcmUgaXMgbGluZTpjb2x1bW5cbiAgZGV0YWlscy5saW5lID0gbWF0Y2hbMl0uc3BsaXQoJzonKVswXTtcblxuICAvLyBQb3NzaWJsZSBmb3JtYXQ6IGh0dHBzOi8vZm9vLmJhci5jb20vc2NyaXB0cy9maWxlLmpzP3JhbmRvbT1mb29iYXJcbiAgLy8gWFhYOiBpZiB5b3UgY2FuIHdyaXRlIHRoZSBmb2xsb3dpbmcgaW4gYmV0dGVyIHdheSwgcGxlYXNlIGRvIGl0XG4gIC8vIFhYWDogd2hhdCBhYm91dCBldmFscz9cbiAgZGV0YWlscy5maWxlID0gbWF0Y2hbMV0uc3BsaXQoJy8nKS5zbGljZSgtMSlbMF0uc3BsaXQoJz8nKVswXTtcblxuICByZXR1cm4gZGV0YWlscztcbn07XG5cblsnZGVidWcnLCAnaW5mbycsICd3YXJuJywgJ2Vycm9yJ10uZm9yRWFjaCgobGV2ZWwpID0+IHtcbiAvLyBAcGFyYW0gYXJnIHtTdHJpbmd8T2JqZWN0fVxuIExvZ1tsZXZlbF0gPSAoYXJnKSA9PiB7XG4gIGlmIChzdXBwcmVzcykge1xuICAgIHN1cHByZXNzLS07XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgbGV0IGludGVyY2VwdGVkID0gZmFsc2U7XG4gIGlmIChpbnRlcmNlcHQpIHtcbiAgICBpbnRlcmNlcHQtLTtcbiAgICBpbnRlcmNlcHRlZCA9IHRydWU7XG4gIH1cblxuICBsZXQgb2JqID0gKGFyZyA9PT0gT2JqZWN0KGFyZylcbiAgICAmJiAhKGFyZyBpbnN0YW5jZW9mIFJlZ0V4cClcbiAgICAmJiAhKGFyZyBpbnN0YW5jZW9mIERhdGUpKVxuICAgID8gYXJnXG4gICAgOiB7IG1lc3NhZ2U6IG5ldyBTdHJpbmcoYXJnKS50b1N0cmluZygpIH07XG5cbiAgUkVTVFJJQ1RFRF9LRVlTLmZvckVhY2goa2V5ID0+IHtcbiAgICBpZiAob2JqW2tleV0pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ2FuJ3Qgc2V0ICcke2tleX0nIGluIGxvZyBtZXNzYWdlYCk7XG4gICAgfVxuICB9KTtcblxuICBpZiAoaGFzT3duLmNhbGwob2JqLCAnbWVzc2FnZScpICYmIHR5cGVvZiBvYmoubWVzc2FnZSAhPT0gJ3N0cmluZycpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJUaGUgJ21lc3NhZ2UnIGZpZWxkIGluIGxvZyBvYmplY3RzIG11c3QgYmUgYSBzdHJpbmdcIik7XG4gIH1cblxuICBpZiAoIW9iai5vbWl0Q2FsbGVyRGV0YWlscykge1xuICAgIG9iaiA9IHsgLi4uTG9nLl9nZXRDYWxsZXJEZXRhaWxzKCksIC4uLm9iaiB9O1xuICB9XG5cbiAgb2JqLnRpbWUgPSBuZXcgRGF0ZSgpO1xuICBvYmoubGV2ZWwgPSBsZXZlbDtcblxuICAvLyBJZiB3ZSBhcmUgaW4gcHJvZHVjdGlvbiBkb24ndCB3cml0ZSBvdXQgZGVidWcgbG9ncy5cbiAgaWYgKGxldmVsID09PSAnZGVidWcnICYmIE1ldGVvci5pc1Byb2R1Y3Rpb24pIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoaW50ZXJjZXB0ZWQpIHtcbiAgICBpbnRlcmNlcHRlZExpbmVzLnB1c2goRUpTT04uc3RyaW5naWZ5KG9iaikpO1xuICB9IGVsc2UgaWYgKE1ldGVvci5pc1NlcnZlcikge1xuICAgIGlmIChMb2cub3V0cHV0Rm9ybWF0ID09PSAnY29sb3JlZC10ZXh0Jykge1xuICAgICAgY29uc29sZS5sb2coTG9nLmZvcm1hdChvYmosIHtjb2xvcjogdHJ1ZX0pKTtcbiAgICB9IGVsc2UgaWYgKExvZy5vdXRwdXRGb3JtYXQgPT09ICdqc29uJykge1xuICAgICAgY29uc29sZS5sb2coRUpTT04uc3RyaW5naWZ5KG9iaikpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gbG9nZ2luZyBvdXRwdXQgZm9ybWF0OiAke0xvZy5vdXRwdXRGb3JtYXR9YCk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGxvZ0luQnJvd3NlcihvYmopO1xuICB9XG59O1xufSk7XG5cblxuLy8gdHJpZXMgdG8gcGFyc2UgbGluZSBhcyBFSlNPTi4gcmV0dXJucyBvYmplY3QgaWYgcGFyc2UgaXMgc3VjY2Vzc2Z1bCwgb3IgbnVsbCBpZiBub3RcbkxvZy5wYXJzZSA9IChsaW5lKSA9PiB7XG4gIGxldCBvYmogPSBudWxsO1xuICBpZiAobGluZSAmJiBsaW5lLnN0YXJ0c1dpdGgoJ3snKSkgeyAvLyBtaWdodCBiZSBqc29uIGdlbmVyYXRlZCBmcm9tIGNhbGxpbmcgJ0xvZydcbiAgICB0cnkgeyBvYmogPSBFSlNPTi5wYXJzZShsaW5lKTsgfSBjYXRjaCAoZSkge31cbiAgfVxuXG4gIC8vIFhYWCBzaG91bGQgcHJvYmFibHkgY2hlY2sgZmllbGRzIG90aGVyIHRoYW4gJ3RpbWUnXG4gIGlmIChvYmogJiYgb2JqLnRpbWUgJiYgKG9iai50aW1lIGluc3RhbmNlb2YgRGF0ZSkpIHtcbiAgICByZXR1cm4gb2JqO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59O1xuXG4vLyBmb3JtYXRzIGEgbG9nIG9iamVjdCBpbnRvIGNvbG9yZWQgaHVtYW4gYW5kIG1hY2hpbmUtcmVhZGFibGUgdGV4dFxuTG9nLmZvcm1hdCA9IChvYmosIG9wdGlvbnMgPSB7fSkgPT4ge1xuICBvYmogPSB7IC4uLm9iaiB9OyAvLyBkb24ndCBtdXRhdGUgdGhlIGFyZ3VtZW50XG4gIGxldCB7XG4gICAgdGltZSxcbiAgICB0aW1lSW5leGFjdCxcbiAgICBsZXZlbCA9ICdpbmZvJyxcbiAgICBmaWxlLFxuICAgIGxpbmU6IGxpbmVOdW1iZXIsXG4gICAgYXBwOiBhcHBOYW1lID0gJycsXG4gICAgb3JpZ2luQXBwLFxuICAgIG1lc3NhZ2UgPSAnJyxcbiAgICBwcm9ncmFtID0gJycsXG4gICAgc2F0ZWxsaXRlID0gJycsXG4gICAgc3RkZXJyID0gJycsXG4gIH0gPSBvYmo7XG5cbiAgaWYgKCEodGltZSBpbnN0YW5jZW9mIERhdGUpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiJ3RpbWUnIG11c3QgYmUgYSBEYXRlIG9iamVjdFwiKTtcbiAgfVxuXG4gIEZPUk1BVFRFRF9LRVlTLmZvckVhY2goKGtleSkgPT4geyBkZWxldGUgb2JqW2tleV07IH0pO1xuXG4gIGlmIChPYmplY3Qua2V5cyhvYmopLmxlbmd0aCA+IDApIHtcbiAgICBpZiAobWVzc2FnZSkge1xuICAgICAgbWVzc2FnZSArPSAnICc7XG4gICAgfVxuICAgIG1lc3NhZ2UgKz0gRUpTT04uc3RyaW5naWZ5KG9iaik7XG4gIH1cblxuICBjb25zdCBwYWQyID0gbiA9PiBuLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKTtcbiAgY29uc3QgcGFkMyA9IG4gPT4gbi50b1N0cmluZygpLnBhZFN0YXJ0KDMsICcwJyk7XG5cbiAgY29uc3QgZGF0ZVN0YW1wID0gdGltZS5nZXRGdWxsWWVhcigpLnRvU3RyaW5nKCkgK1xuICAgIHBhZDIodGltZS5nZXRNb250aCgpICsgMSAvKjAtYmFzZWQqLykgK1xuICAgIHBhZDIodGltZS5nZXREYXRlKCkpO1xuICBjb25zdCB0aW1lU3RhbXAgPSBwYWQyKHRpbWUuZ2V0SG91cnMoKSkgK1xuICAgICAgICAnOicgK1xuICAgICAgICBwYWQyKHRpbWUuZ2V0TWludXRlcygpKSArXG4gICAgICAgICc6JyArXG4gICAgICAgIHBhZDIodGltZS5nZXRTZWNvbmRzKCkpICtcbiAgICAgICAgJy4nICtcbiAgICAgICAgcGFkMyh0aW1lLmdldE1pbGxpc2Vjb25kcygpKTtcblxuICAvLyBlZyBpbiBTYW4gRnJhbmNpc2NvIGluIEp1bmUgdGhpcyB3aWxsIGJlICcoLTcpJ1xuICBjb25zdCB1dGNPZmZzZXRTdHIgPSBgKCR7KC0obmV3IERhdGUoKS5nZXRUaW1lem9uZU9mZnNldCgpIC8gNjApKX0pYDtcblxuICBsZXQgYXBwSW5mbyA9ICcnO1xuICBpZiAoYXBwTmFtZSkge1xuICAgIGFwcEluZm8gKz0gYXBwTmFtZTtcbiAgfVxuICBpZiAob3JpZ2luQXBwICYmIG9yaWdpbkFwcCAhPT0gYXBwTmFtZSkge1xuICAgIGFwcEluZm8gKz0gYCB2aWEgJHtvcmlnaW5BcHB9YDtcbiAgfVxuICBpZiAoYXBwSW5mbykge1xuICAgIGFwcEluZm8gPSBgWyR7YXBwSW5mb31dIGA7XG4gIH1cblxuICBjb25zdCBzb3VyY2VJbmZvUGFydHMgPSBbXTtcbiAgaWYgKHByb2dyYW0pIHtcbiAgICBzb3VyY2VJbmZvUGFydHMucHVzaChwcm9ncmFtKTtcbiAgfVxuICBpZiAoZmlsZSkge1xuICAgIHNvdXJjZUluZm9QYXJ0cy5wdXNoKGZpbGUpO1xuICB9XG4gIGlmIChsaW5lTnVtYmVyKSB7XG4gICAgc291cmNlSW5mb1BhcnRzLnB1c2gobGluZU51bWJlcik7XG4gIH1cblxuICBsZXQgc291cmNlSW5mbyA9ICFzb3VyY2VJbmZvUGFydHMubGVuZ3RoID9cbiAgICAnJyA6IGAoJHtzb3VyY2VJbmZvUGFydHMuam9pbignOicpfSkgYDtcblxuICBpZiAoc2F0ZWxsaXRlKVxuICAgIHNvdXJjZUluZm8gKz0gYFske3NhdGVsbGl0ZX1dYDtcblxuICBjb25zdCBzdGRlcnJJbmRpY2F0b3IgPSBzdGRlcnIgPyAnKFNUREVSUikgJyA6ICcnO1xuXG4gIGNvbnN0IHRpbWVTdHJpbmcgPSBMb2cuc2hvd1RpbWVcbiAgICA/IGAke2RhdGVTdGFtcH0tJHt0aW1lU3RhbXB9JHt1dGNPZmZzZXRTdHJ9JHt0aW1lSW5leGFjdCA/ICc/ICcgOiAnICd9YFxuICAgIDogJyAnO1xuXG5cblxuICBjb25zdCBtZXRhUHJlZml4ID0gW1xuICAgIGxldmVsLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpLFxuICAgIHRpbWVTdHJpbmcsXG4gICAgYXBwSW5mbyxcbiAgICBzb3VyY2VJbmZvLFxuICAgIHN0ZGVyckluZGljYXRvcl0uam9pbignJyk7XG5cblxuICByZXR1cm4gRm9ybWF0dGVyLnByZXR0aWZ5KG1ldGFQcmVmaXgsIG9wdGlvbnMuY29sb3IgJiYgcGxhdGZvcm1Db2xvcihvcHRpb25zLm1ldGFDb2xvciB8fCBNRVRBX0NPTE9SKSkgK1xuICAgICAgRm9ybWF0dGVyLnByZXR0aWZ5KG1lc3NhZ2UsIG9wdGlvbnMuY29sb3IgJiYgcGxhdGZvcm1Db2xvcihMRVZFTF9DT0xPUlNbbGV2ZWxdKSk7XG59O1xuXG4vLyBUdXJuIGEgbGluZSBvZiB0ZXh0IGludG8gYSBsb2dnYWJsZSBvYmplY3QuXG4vLyBAcGFyYW0gbGluZSB7U3RyaW5nfVxuLy8gQHBhcmFtIG92ZXJyaWRlIHtPYmplY3R9XG5Mb2cub2JqRnJvbVRleHQgPSAobGluZSwgb3ZlcnJpZGUpID0+IHtcbiAgcmV0dXJuIHtcbiAgICBtZXNzYWdlOiBsaW5lLFxuICAgIGxldmVsOiAnaW5mbycsXG4gICAgdGltZTogbmV3IERhdGUoKSxcbiAgICB0aW1lSW5leGFjdDogdHJ1ZSxcbiAgICAuLi5vdmVycmlkZVxuICB9O1xufTtcblxuZXhwb3J0IHsgTG9nIH07XG4iLCJGb3JtYXR0ZXIgPSB7fTtcbkZvcm1hdHRlci5wcmV0dGlmeSA9IGZ1bmN0aW9uKGxpbmUsIGNvbG9yKXtcbiAgICBpZighY29sb3IpIHJldHVybiBsaW5lO1xuICAgIHJldHVybiByZXF1aXJlKFwiY2hhbGtcIilbY29sb3JdKGxpbmUpO1xufTtcbiJdfQ==
