Package["core-runtime"].queue("webapp",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;
var ECMAScript = Package.ecmascript.ECMAScript;
var Log = Package.logging.Log;
var RoutePolicy = Package.routepolicy.RoutePolicy;
var Boilerplate = Package['boilerplate-generator'].Boilerplate;
var WebAppHashing = Package['webapp-hashing'].WebAppHashing;
var Hook = Package['callback-hook'].Hook;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var WebApp, WebAppInternals, main;

var require = meteorInstall({"node_modules":{"meteor":{"webapp":{"webapp_server.js":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                          //
// packages/webapp/webapp_server.js                                                                         //
//                                                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
      WebApp: () => WebApp,
      WebAppInternals: () => WebAppInternals,
      getGroupInfo: () => getGroupInfo
    });
    let assert;
    module1.link("assert", {
      default(v) {
        assert = v;
      }
    }, 0);
    let readFileSync, chmodSync, chownSync;
    module1.link("fs", {
      readFileSync(v) {
        readFileSync = v;
      },
      chmodSync(v) {
        chmodSync = v;
      },
      chownSync(v) {
        chownSync = v;
      }
    }, 1);
    let createServer;
    module1.link("http", {
      createServer(v) {
        createServer = v;
      }
    }, 2);
    let userInfo;
    module1.link("os", {
      userInfo(v) {
        userInfo = v;
      }
    }, 3);
    let pathJoin, pathDirname;
    module1.link("path", {
      join(v) {
        pathJoin = v;
      },
      dirname(v) {
        pathDirname = v;
      }
    }, 4);
    let parseUrl;
    module1.link("url", {
      parse(v) {
        parseUrl = v;
      }
    }, 5);
    let createHash;
    module1.link("crypto", {
      createHash(v) {
        createHash = v;
      }
    }, 6);
    let express;
    module1.link("express", {
      default(v) {
        express = v;
      }
    }, 7);
    let compress;
    module1.link("compression", {
      default(v) {
        compress = v;
      }
    }, 8);
    let cookieParser;
    module1.link("cookie-parser", {
      default(v) {
        cookieParser = v;
      }
    }, 9);
    let qs;
    module1.link("qs", {
      default(v) {
        qs = v;
      }
    }, 10);
    let parseRequest;
    module1.link("parseurl", {
      default(v) {
        parseRequest = v;
      }
    }, 11);
    let lookupUserAgent;
    module1.link("useragent-ng", {
      lookup(v) {
        lookupUserAgent = v;
      }
    }, 12);
    let isModern;
    module1.link("meteor/modern-browsers", {
      isModern(v) {
        isModern = v;
      }
    }, 13);
    let send;
    module1.link("send", {
      default(v) {
        send = v;
      }
    }, 14);
    let removeExistingSocketFile, registerSocketFileCleanup;
    module1.link("./socket_file.js", {
      removeExistingSocketFile(v) {
        removeExistingSocketFile = v;
      },
      registerSocketFileCleanup(v) {
        registerSocketFileCleanup = v;
      }
    }, 15);
    let cluster;
    module1.link("cluster", {
      default(v) {
        cluster = v;
      }
    }, 16);
    let execSync;
    module1.link("child_process", {
      execSync(v) {
        execSync = v;
      }
    }, 17);
    let onMessage;
    module1.link("meteor/inter-process-messaging", {
      onMessage(v) {
        onMessage = v;
      }
    }, 18);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    var SHORT_SOCKET_TIMEOUT = 5 * 1000;
    var LONG_SOCKET_TIMEOUT = 120 * 1000;
    const createExpressApp = () => {
      const app = express();
      // Security and performace headers
      // these headers come from these docs: https://expressjs.com/en/api.html#app.settings.table
      app.set('x-powered-by', false);
      app.set('etag', false);
      app.set('query parser', qs.parse);
      return app;
    };
    const WebApp = {};
    const WebAppInternals = {};
    const hasOwn = Object.prototype.hasOwnProperty;
    WebAppInternals.NpmModules = {
      express: {
        version: Npm.require('express/package.json').version,
        module: express
      }
    };

    // More of a convenience for the end user
    WebApp.express = express;

    // Though we might prefer to use web.browser (modern) as the default
    // architecture, safety requires a more compatible defaultArch.
    WebApp.defaultArch = 'web.browser.legacy';

    // XXX maps archs to manifests
    WebApp.clientPrograms = {};

    // XXX maps archs to program path on filesystem
    var archPath = {};
    var bundledJsCssUrlRewriteHook = function (url) {
      var bundledPrefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX || '';
      return bundledPrefix + url;
    };
    var sha1 = function (contents) {
      var hash = createHash('sha1');
      hash.update(contents);
      return hash.digest('hex');
    };
    function shouldCompress(req, res) {
      if (req.headers['x-no-compression']) {
        // don't compress responses with this request header
        return false;
      }

      // fallback to standard filter function
      return compress.filter(req, res);
    }

    // #BrowserIdentification
    //
    // We have multiple places that want to identify the browser: the
    // unsupported browser page, the appcache package, and, eventually
    // delivering browser polyfills only as needed.
    //
    // To avoid detecting the browser in multiple places ad-hoc, we create a
    // Meteor "browser" object. It uses but does not expose the npm
    // useragent module (we could choose a different mechanism to identify
    // the browser in the future if we wanted to).  The browser object
    // contains
    //
    // * `name`: the name of the browser in camel case
    // * `major`, `minor`, `patch`: integers describing the browser version
    //
    // Also here is an early version of a Meteor `request` object, intended
    // to be a high-level description of the request without exposing
    // details of Express's low-level `req`.  Currently it contains:
    //
    // * `browser`: browser identification object described above
    // * `url`: parsed url, including parsed query params
    //
    // As a temporary hack there is a `categorizeRequest` function on WebApp which
    // converts a Express `req` to a Meteor `request`. This can go away once smart
    // packages such as appcache are being passed a `request` object directly when
    // they serve content.
    //
    // This allows `request` to be used uniformly: it is passed to the html
    // attributes hook, and the appcache package can use it when deciding
    // whether to generate a 404 for the manifest.
    //
    // Real routing / server side rendering will probably refactor this
    // heavily.

    // e.g. "Mobile Safari" => "mobileSafari"
    var camelCase = function (name) {
      var parts = name.split(' ');
      parts[0] = parts[0].toLowerCase();
      for (var i = 1; i < parts.length; ++i) {
        parts[i] = parts[i].charAt(0).toUpperCase() + parts[i].substring(1);
      }
      return parts.join('');
    };
    var identifyBrowser = function (userAgentString) {
      if (!userAgentString) {
        return {
          name: 'unknown',
          major: 0,
          minor: 0,
          patch: 0
        };
      }
      var userAgent = lookupUserAgent(userAgentString);
      return {
        name: camelCase(userAgent.family),
        major: +userAgent.major,
        minor: +userAgent.minor,
        patch: +userAgent.patch
      };
    };

    // XXX Refactor as part of implementing real routing.
    WebAppInternals.identifyBrowser = identifyBrowser;
    WebApp.categorizeRequest = function (req) {
      if (req.browser && req.arch && typeof req.modern === 'boolean') {
        // Already categorized.
        return req;
      }
      const browser = identifyBrowser(req.headers['user-agent']);
      const modern = isModern(browser);
      const path = typeof req.pathname === 'string' ? req.pathname : parseRequest(req).pathname;
      const categorized = {
        browser,
        modern,
        path,
        arch: WebApp.defaultArch,
        url: parseUrl(req.url, true),
        dynamicHead: req.dynamicHead,
        dynamicBody: req.dynamicBody,
        headers: req.headers,
        cookies: req.cookies
      };
      const pathParts = path.split('/');
      const archKey = pathParts[1];
      if (archKey.startsWith('__')) {
        const archCleaned = 'web.' + archKey.slice(2);
        if (hasOwn.call(WebApp.clientPrograms, archCleaned)) {
          pathParts.splice(1, 1); // Remove the archKey part.
          return Object.assign(categorized, {
            arch: archCleaned,
            path: pathParts.join('/')
          });
        }
      }

      // TODO Perhaps one day we could infer Cordova clients here, so that we
      // wouldn't have to use prefixed "/__cordova/..." URLs.
      const preferredArchOrder = isModern(browser) ? ['web.browser', 'web.browser.legacy'] : ['web.browser.legacy', 'web.browser'];
      for (const arch of preferredArchOrder) {
        // If our preferred arch is not available, it's better to use another
        // client arch that is available than to guarantee the site won't work
        // by returning an unknown arch. For example, if web.browser.legacy is
        // excluded using the --exclude-archs command-line option, legacy
        // clients are better off receiving web.browser (which might actually
        // work) than receiving an HTTP 404 response. If none of the archs in
        // preferredArchOrder are defined, only then should we send a 404.
        if (hasOwn.call(WebApp.clientPrograms, arch)) {
          return Object.assign(categorized, {
            arch
          });
        }
      }
      return categorized;
    };

    // HTML attribute hooks: functions to be called to determine any attributes to
    // be added to the '<html>' tag. Each function is passed a 'request' object (see
    // #BrowserIdentification) and should return null or object.
    var htmlAttributeHooks = [];
    var getHtmlAttributes = function (request) {
      var combinedAttributes = {};
      (htmlAttributeHooks || []).forEach(function (hook) {
        var attributes = hook(request);
        if (attributes === null) return;
        if (typeof attributes !== 'object') throw Error('HTML attribute hook must return null or object');
        Object.assign(combinedAttributes, attributes);
      });
      return combinedAttributes;
    };
    WebApp.addHtmlAttributeHook = function (hook) {
      htmlAttributeHooks.push(hook);
    };

    // Serve app HTML for this URL?
    var appUrl = function (url) {
      if (url === '/favicon.ico' || url === '/robots.txt') return false;

      // NOTE: app.manifest is not a web standard like favicon.ico and
      // robots.txt. It is a file name we have chosen to use for HTML5
      // appcache URLs. It is included here to prevent using an appcache
      // then removing it from poisoning an app permanently. Eventually,
      // once we have server side routing, this won't be needed as
      // unknown URLs with return a 404 automatically.
      if (url === '/app.manifest') return false;

      // Avoid serving app HTML for declared routes such as /sockjs/.
      if (RoutePolicy.classify(url)) return false;

      // we currently return app HTML on all URLs by default
      return true;
    };

    // We need to calculate the client hash after all packages have loaded
    // to give them a chance to populate __meteor_runtime_config__.
    //
    // Calculating the hash during startup means that packages can only
    // populate __meteor_runtime_config__ during load, not during startup.
    //
    // Calculating instead it at the beginning of main after all startup
    // hooks had run would allow packages to also populate
    // __meteor_runtime_config__ during startup, but that's too late for
    // autoupdate because it needs to have the client hash at startup to
    // insert the auto update version itself into
    // __meteor_runtime_config__ to get it to the client.
    //
    // An alternative would be to give autoupdate a "post-start,
    // pre-listen" hook to allow it to insert the auto update version at
    // the right moment.

    Meteor.startup(function () {
      function getter(key) {
        return function (arch) {
          arch = arch || WebApp.defaultArch;
          const program = WebApp.clientPrograms[arch];
          const value = program && program[key];
          // If this is the first time we have calculated this hash,
          // program[key] will be a thunk (lazy function with no parameters)
          // that we should call to do the actual computation.
          return typeof value === 'function' ? program[key] = value() : value;
        };
      }
      WebApp.calculateClientHash = WebApp.clientHash = getter('version');
      WebApp.calculateClientHashRefreshable = getter('versionRefreshable');
      WebApp.calculateClientHashNonRefreshable = getter('versionNonRefreshable');
      WebApp.calculateClientHashReplaceable = getter('versionReplaceable');
      WebApp.getRefreshableAssets = getter('refreshableAssets');
    });

    // When we have a request pending, we want the socket timeout to be long, to
    // give ourselves a while to serve it, and to allow sockjs long polls to
    // complete.  On the other hand, we want to close idle sockets relatively
    // quickly, so that we can shut down relatively promptly but cleanly, without
    // cutting off anyone's response.
    WebApp._timeoutAdjustmentRequestCallback = function (req, res) {
      // this is really just req.socket.setTimeout(LONG_SOCKET_TIMEOUT);
      req.setTimeout(LONG_SOCKET_TIMEOUT);
      // Insert our new finish listener to run BEFORE the existing one which removes
      // the response from the socket.
      var finishListeners = res.listeners('finish');
      // XXX Apparently in Node 0.12 this event was called 'prefinish'.
      // https://github.com/joyent/node/commit/7c9b6070
      // But it has switched back to 'finish' in Node v4:
      // https://github.com/nodejs/node/pull/1411
      res.removeAllListeners('finish');
      res.on('finish', function () {
        res.setTimeout(SHORT_SOCKET_TIMEOUT);
      });
      Object.values(finishListeners).forEach(function (l) {
        res.on('finish', l);
      });
    };

    // Will be updated by main before we listen.
    // Map from client arch to boilerplate object.
    // Boilerplate object has:
    //   - func: XXX
    //   - baseData: XXX
    var boilerplateByArch = {};

    // Register a callback function that can selectively modify boilerplate
    // data given arguments (request, data, arch). The key should be a unique
    // identifier, to prevent accumulating duplicate callbacks from the same
    // call site over time. Callbacks will be called in the order they were
    // registered. A callback should return false if it did not make any
    // changes affecting the boilerplate. Passing null deletes the callback.
    // Any previous callback registered for this key will be returned.
    const boilerplateDataCallbacks = Object.create(null);
    WebAppInternals.registerBoilerplateDataCallback = function (key, callback) {
      const previousCallback = boilerplateDataCallbacks[key];
      if (typeof callback === 'function') {
        boilerplateDataCallbacks[key] = callback;
      } else {
        assert.strictEqual(callback, null);
        delete boilerplateDataCallbacks[key];
      }

      // Return the previous callback in case the new callback needs to call
      // it; for example, when the new callback is a wrapper for the old.
      return previousCallback || null;
    };

    // Given a request (as returned from `categorizeRequest`), return the
    // boilerplate HTML to serve for that request.
    //
    // If a previous Express middleware has rendered content for the head or body,
    // returns the boilerplate with that content patched in otherwise
    // memoizes on HTML attributes (used by, eg, appcache) and whether inline
    // scripts are currently allowed.
    // XXX so far this function is always called with arch === 'web.browser'
    function getBoilerplate(request, arch) {
      return getBoilerplateAsync(request, arch);
    }

    /**
     * @summary Takes a runtime configuration object and
     * returns an encoded runtime string.
     * @locus Server
     * @param {Object} rtimeConfig
     * @returns {String}
     */
    WebApp.encodeRuntimeConfig = function (rtimeConfig) {
      return JSON.stringify(encodeURIComponent(JSON.stringify(rtimeConfig)));
    };

    /**
     * @summary Takes an encoded runtime string and returns
     * a runtime configuration object.
     * @locus Server
     * @param {String} rtimeConfigString
     * @returns {Object}
     */
    WebApp.decodeRuntimeConfig = function (rtimeConfigStr) {
      return JSON.parse(decodeURIComponent(JSON.parse(rtimeConfigStr)));
    };
    const runtimeConfig = {
      // hooks will contain the callback functions
      // set by the caller to addRuntimeConfigHook
      hooks: new Hook(),
      // updateHooks will contain the callback functions
      // set by the caller to addUpdatedNotifyHook
      updateHooks: new Hook(),
      // isUpdatedByArch is an object containing fields for each arch
      // that this server supports.
      // - Each field will be true when the server updates the runtimeConfig for that arch.
      // - When the hook callback is called the update field in the callback object will be
      // set to isUpdatedByArch[arch].
      // = isUpdatedyByArch[arch] is reset to false after the callback.
      // This enables the caller to cache data efficiently so they do not need to
      // decode & update data on every callback when the runtimeConfig is not changing.
      isUpdatedByArch: {}
    };

    /**
     * @name addRuntimeConfigHookCallback(options)
     * @locus Server
     * @isprototype true
     * @summary Callback for `addRuntimeConfigHook`.
     *
     * If the handler returns a _falsy_ value the hook will not
     * modify the runtime configuration.
     *
     * If the handler returns a _String_ the hook will substitute
     * the string for the encoded configuration string.
     *
     * **Warning:** the hook does not check the return value at all it is
     * the responsibility of the caller to get the formatting correct using
     * the helper functions.
     *
     * `addRuntimeConfigHookCallback` takes only one `Object` argument
     * with the following fields:
     * @param {Object} options
     * @param {String} options.arch The architecture of the client
     * requesting a new runtime configuration. This can be one of
     * `web.browser`, `web.browser.legacy` or `web.cordova`.
     * @param {Object} options.request
     * A NodeJs [IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage)
     * https://nodejs.org/api/http.html#http_class_http_incomingmessage
     * `Object` that can be used to get information about the incoming request.
     * @param {String} options.encodedCurrentConfig The current configuration object
     * encoded as a string for inclusion in the root html.
     * @param {Boolean} options.updated `true` if the config for this architecture
     * has been updated since last called, otherwise `false`. This flag can be used
     * to cache the decoding/encoding for each architecture.
     */

    /**
     * @summary Hook that calls back when the meteor runtime configuration,
     * `__meteor_runtime_config__` is being sent to any client.
     *
     * **returns**: <small>_Object_</small> `{ stop: function, callback: function }`
     * - `stop` <small>_Function_</small> Call `stop()` to stop getting callbacks.
     * - `callback` <small>_Function_</small> The passed in `callback`.
     * @locus Server
     * @param {addRuntimeConfigHookCallback} callback
     * See `addRuntimeConfigHookCallback` description.
     * @returns {Object} {{ stop: function, callback: function }}
     * Call the returned `stop()` to stop getting callbacks.
     * The passed in `callback` is returned also.
     */
    WebApp.addRuntimeConfigHook = function (callback) {
      return runtimeConfig.hooks.register(callback);
    };
    async function getBoilerplateAsync(request, arch) {
      let boilerplate = boilerplateByArch[arch];
      await runtimeConfig.hooks.forEachAsync(async hook => {
        const meteorRuntimeConfig = await hook({
          arch,
          request,
          encodedCurrentConfig: boilerplate.baseData.meteorRuntimeConfig,
          updated: runtimeConfig.isUpdatedByArch[arch]
        });
        if (!meteorRuntimeConfig) return true;
        boilerplate.baseData = Object.assign({}, boilerplate.baseData, {
          meteorRuntimeConfig
        });
        return true;
      });
      runtimeConfig.isUpdatedByArch[arch] = false;
      const {
        dynamicHead,
        dynamicBody
      } = request;
      const data = Object.assign({}, boilerplate.baseData, {
        htmlAttributes: getHtmlAttributes(request)
      }, {
        dynamicHead,
        dynamicBody
      });
      let madeChanges = false;
      let promise = Promise.resolve();
      Object.keys(boilerplateDataCallbacks).forEach(key => {
        promise = promise.then(() => {
          const callback = boilerplateDataCallbacks[key];
          return callback(request, data, arch);
        }).then(result => {
          // Callbacks should return false if they did not make any changes.
          if (result !== false) {
            madeChanges = true;
          }
        });
      });
      return promise.then(() => ({
        stream: boilerplate.toHTMLStream(data),
        statusCode: data.statusCode,
        headers: data.headers
      }));
    }

    /**
     * @name addUpdatedNotifyHookCallback(options)
     * @summary callback handler for `addupdatedNotifyHook`
     * @isprototype true
     * @locus Server
     * @param {Object} options
     * @param {String} options.arch The architecture that is being updated.
     * This can be one of `web.browser`, `web.browser.legacy` or `web.cordova`.
     * @param {Object} options.manifest The new updated manifest object for
     * this `arch`.
     * @param {Object} options.runtimeConfig The new updated configuration
     * object for this `arch`.
     */

    /**
     * @summary Hook that runs when the meteor runtime configuration
     * is updated.  Typically the configuration only changes during development mode.
     * @locus Server
     * @param {addUpdatedNotifyHookCallback} handler
     * The `handler` is called on every change to an `arch` runtime configuration.
     * See `addUpdatedNotifyHookCallback`.
     * @returns {Object} {{ stop: function, callback: function }}
     */
    WebApp.addUpdatedNotifyHook = function (handler) {
      return runtimeConfig.updateHooks.register(handler);
    };
    WebAppInternals.generateBoilerplateInstance = function (arch, manifest, additionalOptions) {
      additionalOptions = additionalOptions || {};
      runtimeConfig.isUpdatedByArch[arch] = true;
      const rtimeConfig = _objectSpread(_objectSpread({}, __meteor_runtime_config__), additionalOptions.runtimeConfigOverrides || {});
      runtimeConfig.updateHooks.forEach(cb => {
        cb({
          arch,
          manifest,
          runtimeConfig: rtimeConfig
        });
        return true;
      });
      const meteorRuntimeConfig = JSON.stringify(encodeURIComponent(JSON.stringify(rtimeConfig)));
      return new Boilerplate(arch, manifest, Object.assign({
        pathMapper(itemPath) {
          return pathJoin(archPath[arch], itemPath);
        },
        baseDataExtension: {
          additionalStaticJs: (Object.entries(additionalStaticJs) || []).map(function (_ref) {
            let [pathname, contents] = _ref;
            return {
              pathname: pathname,
              contents: contents
            };
          }),
          // Convert to a JSON string, then get rid of most weird characters, then
          // wrap in double quotes. (The outermost JSON.stringify really ought to
          // just be "wrap in double quotes" but we use it to be safe.) This might
          // end up inside a <script> tag so we need to be careful to not include
          // "</script>", but normal {{spacebars}} escaping escapes too much! See
          // https://github.com/meteor/meteor/issues/3730
          meteorRuntimeConfig,
          meteorRuntimeHash: sha1(meteorRuntimeConfig),
          rootUrlPathPrefix: __meteor_runtime_config__.ROOT_URL_PATH_PREFIX || '',
          bundledJsCssUrlRewriteHook: bundledJsCssUrlRewriteHook,
          sriMode: sriMode,
          inlineScriptsAllowed: WebAppInternals.inlineScriptsAllowed(),
          inline: additionalOptions.inline
        }
      }, additionalOptions));
    };

    // A mapping from url path to architecture (e.g. "web.browser") to static
    // file information with the following fields:
    // - type: the type of file to be served
    // - cacheable: optionally, whether the file should be cached or not
    // - sourceMapUrl: optionally, the url of the source map
    //
    // Info also contains one of the following:
    // - content: the stringified content that should be served at this path
    // - absolutePath: the absolute path on disk to the file

    // Serve static files from the manifest or added with
    // `addStaticJs`. Exported for tests.
    WebAppInternals.staticFilesMiddleware = async function (staticFilesByArch, req, res, next) {
      var _Meteor$settings$pack3, _Meteor$settings$pack4;
      var pathname = parseRequest(req).pathname;
      try {
        pathname = decodeURIComponent(pathname);
      } catch (e) {
        next();
        return;
      }
      var serveStaticJs = function (s) {
        var _Meteor$settings$pack, _Meteor$settings$pack2;
        if (req.method === 'GET' || req.method === 'HEAD' || (_Meteor$settings$pack = Meteor.settings.packages) !== null && _Meteor$settings$pack !== void 0 && (_Meteor$settings$pack2 = _Meteor$settings$pack.webapp) !== null && _Meteor$settings$pack2 !== void 0 && _Meteor$settings$pack2.alwaysReturnContent) {
          res.writeHead(200, {
            'Content-type': 'application/javascript; charset=UTF-8',
            'Content-Length': Buffer.byteLength(s)
          });
          res.write(s);
          res.end();
        } else {
          const status = req.method === 'OPTIONS' ? 200 : 405;
          res.writeHead(status, {
            Allow: 'OPTIONS, GET, HEAD',
            'Content-Length': '0'
          });
          res.end();
        }
      };
      if (pathname in additionalStaticJs && !WebAppInternals.inlineScriptsAllowed()) {
        serveStaticJs(additionalStaticJs[pathname]);
        return;
      }
      const {
        arch,
        path
      } = WebApp.categorizeRequest(req);
      if (!hasOwn.call(WebApp.clientPrograms, arch)) {
        // We could come here in case we run with some architectures excluded
        next();
        return;
      }

      // If pauseClient(arch) has been called, program.paused will be a
      // Promise that will be resolved when the program is unpaused.
      const program = WebApp.clientPrograms[arch];
      await program.paused;
      if (path === '/meteor_runtime_config.js' && !WebAppInternals.inlineScriptsAllowed()) {
        serveStaticJs("__meteor_runtime_config__ = ".concat(program.meteorRuntimeConfig, ";"));
        return;
      }
      const info = getStaticFileInfo(staticFilesByArch, pathname, path, arch);
      if (!info) {
        next();
        return;
      }
      // "send" will handle HEAD & GET requests
      if (req.method !== 'HEAD' && req.method !== 'GET' && !((_Meteor$settings$pack3 = Meteor.settings.packages) !== null && _Meteor$settings$pack3 !== void 0 && (_Meteor$settings$pack4 = _Meteor$settings$pack3.webapp) !== null && _Meteor$settings$pack4 !== void 0 && _Meteor$settings$pack4.alwaysReturnContent)) {
        const status = req.method === 'OPTIONS' ? 200 : 405;
        res.writeHead(status, {
          Allow: 'OPTIONS, GET, HEAD',
          'Content-Length': '0'
        });
        res.end();
        return;
      }

      // We don't need to call pause because, unlike 'static', once we call into
      // 'send' and yield to the event loop, we never call another handler with
      // 'next'.

      // Cacheable files are files that should never change. Typically
      // named by their hash (eg meteor bundled js and css files).
      // We cache them ~forever (1yr).
      const maxAge = info.cacheable ? 1000 * 60 * 60 * 24 * 365 : 0;
      if (info.cacheable) {
        // Since we use req.headers["user-agent"] to determine whether the
        // client should receive modern or legacy resources, tell the client
        // to invalidate cached resources when/if its user agent string
        // changes in the future.
        res.setHeader('Vary', 'User-Agent');
      }

      // Set the X-SourceMap header, which current Chrome, FireFox, and Safari
      // understand.  (The SourceMap header is slightly more spec-correct but FF
      // doesn't understand it.)
      //
      // You may also need to enable source maps in Chrome: open dev tools, click
      // the gear in the bottom right corner, and select "enable source maps".
      if (info.sourceMapUrl) {
        res.setHeader('X-SourceMap', __meteor_runtime_config__.ROOT_URL_PATH_PREFIX + info.sourceMapUrl);
      }
      if (info.type === 'js' || info.type === 'dynamic js') {
        res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
      } else if (info.type === 'css') {
        res.setHeader('Content-Type', 'text/css; charset=UTF-8');
      } else if (info.type === 'json') {
        res.setHeader('Content-Type', 'application/json; charset=UTF-8');
      }
      if (info.hash) {
        res.setHeader('ETag', '"' + info.hash + '"');
      }
      if (info.content) {
        res.setHeader('Content-Length', Buffer.byteLength(info.content));
        res.write(info.content);
        res.end();
      } else {
        send(req, info.absolutePath, {
          maxage: maxAge,
          dotfiles: 'allow',
          // if we specified a dotfile in the manifest, serve it
          lastModified: false // don't set last-modified based on the file date
        }).on('error', function (err) {
          Log.error('Error serving static file ' + err);
          res.writeHead(500);
          res.end();
        }).on('directory', function () {
          Log.error('Unexpected directory ' + info.absolutePath);
          res.writeHead(500);
          res.end();
        }).pipe(res);
      }
    };
    function getStaticFileInfo(staticFilesByArch, originalPath, path, arch) {
      if (!hasOwn.call(WebApp.clientPrograms, arch)) {
        return null;
      }

      // Get a list of all available static file architectures, with arch
      // first in the list if it exists.
      const staticArchList = Object.keys(staticFilesByArch);
      const archIndex = staticArchList.indexOf(arch);
      if (archIndex > 0) {
        staticArchList.unshift(staticArchList.splice(archIndex, 1)[0]);
      }
      let info = null;
      staticArchList.some(arch => {
        const staticFiles = staticFilesByArch[arch];
        function finalize(path) {
          info = staticFiles[path];
          // Sometimes we register a lazy function instead of actual data in
          // the staticFiles manifest.
          if (typeof info === 'function') {
            info = staticFiles[path] = info();
          }
          return info;
        }

        // If staticFiles contains originalPath with the arch inferred above,
        // use that information.
        if (hasOwn.call(staticFiles, originalPath)) {
          return finalize(originalPath);
        }

        // If categorizeRequest returned an alternate path, try that instead.
        if (path !== originalPath && hasOwn.call(staticFiles, path)) {
          return finalize(path);
        }
      });
      return info;
    }

    // Parse the passed in port value. Return the port as-is if it's a String
    // (e.g. a Windows Server style named pipe), otherwise return the port as an
    // integer.
    //
    // DEPRECATED: Direct use of this function is not recommended; it is no
    // longer used internally, and will be removed in a future release.
    WebAppInternals.parsePort = port => {
      let parsedPort = parseInt(port);
      if (Number.isNaN(parsedPort)) {
        parsedPort = port;
      }
      return parsedPort;
    };
    onMessage('webapp-pause-client', async _ref2 => {
      let {
        arch
      } = _ref2;
      await WebAppInternals.pauseClient(arch);
    });
    onMessage('webapp-reload-client', async _ref3 => {
      let {
        arch
      } = _ref3;
      await WebAppInternals.generateClientProgram(arch);
    });
    async function runWebAppServer() {
      var shuttingDown = false;
      var syncQueue = new Meteor._AsynchronousQueue();
      var getItemPathname = function (itemUrl) {
        return decodeURIComponent(parseUrl(itemUrl).pathname);
      };
      WebAppInternals.reloadClientPrograms = async function () {
        await syncQueue.runTask(function () {
          const staticFilesByArch = Object.create(null);
          const {
            configJson
          } = __meteor_bootstrap__;
          const clientArchs = configJson.clientArchs || Object.keys(configJson.clientPaths);
          try {
            clientArchs.forEach(arch => {
              generateClientProgram(arch, staticFilesByArch);
            });
            WebAppInternals.staticFilesByArch = staticFilesByArch;
          } catch (e) {
            Log.error('Error reloading the client program: ' + e.stack);
            process.exit(1);
          }
        });
      };

      // Pause any incoming requests and make them wait for the program to be
      // unpaused the next time generateClientProgram(arch) is called.
      WebAppInternals.pauseClient = async function (arch) {
        await syncQueue.runTask(() => {
          const program = WebApp.clientPrograms[arch];
          const {
            unpause
          } = program;
          program.paused = new Promise(resolve => {
            if (typeof unpause === 'function') {
              // If there happens to be an existing program.unpause function,
              // compose it with the resolve function.
              program.unpause = function () {
                unpause();
                resolve();
              };
            } else {
              program.unpause = resolve;
            }
          });
        });
      };
      WebAppInternals.generateClientProgram = async function (arch) {
        await syncQueue.runTask(() => generateClientProgram(arch));
      };
      function generateClientProgram(arch) {
        let staticFilesByArch = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : WebAppInternals.staticFilesByArch;
        const clientDir = pathJoin(pathDirname(__meteor_bootstrap__.serverDir), arch);

        // read the control for the client we'll be serving up
        const programJsonPath = pathJoin(clientDir, 'program.json');
        let programJson;
        try {
          programJson = JSON.parse(readFileSync(programJsonPath));
        } catch (e) {
          if (e.code === 'ENOENT') return;
          throw e;
        }
        if (programJson.format !== 'web-program-pre1') {
          throw new Error('Unsupported format for client assets: ' + JSON.stringify(programJson.format));
        }
        if (!programJsonPath || !clientDir || !programJson) {
          throw new Error('Client config file not parsed.');
        }
        archPath[arch] = clientDir;
        const staticFiles = staticFilesByArch[arch] = Object.create(null);
        const {
          manifest
        } = programJson;
        manifest.forEach(item => {
          if (item.url && item.where === 'client') {
            staticFiles[getItemPathname(item.url)] = {
              absolutePath: pathJoin(clientDir, item.path),
              cacheable: item.cacheable,
              hash: item.hash,
              // Link from source to its map
              sourceMapUrl: item.sourceMapUrl,
              type: item.type
            };
            if (item.sourceMap) {
              // Serve the source map too, under the specified URL. We assume
              // all source maps are cacheable.
              staticFiles[getItemPathname(item.sourceMapUrl)] = {
                absolutePath: pathJoin(clientDir, item.sourceMap),
                cacheable: true
              };
            }
          }
        });
        const {
          PUBLIC_SETTINGS
        } = __meteor_runtime_config__;
        const configOverrides = {
          PUBLIC_SETTINGS
        };
        const oldProgram = WebApp.clientPrograms[arch];
        const newProgram = WebApp.clientPrograms[arch] = {
          format: 'web-program-pre1',
          manifest: manifest,
          // Use arrow functions so that these versions can be lazily
          // calculated later, and so that they will not be included in the
          // staticFiles[manifestUrl].content string below.
          //
          // Note: these version calculations must be kept in agreement with
          // CordovaBuilder#appendVersion in tools/cordova/builder.js, or hot
          // code push will reload Cordova apps unnecessarily.
          version: () => WebAppHashing.calculateClientHash(manifest, null, configOverrides),
          versionRefreshable: () => WebAppHashing.calculateClientHash(manifest, type => type === 'css', configOverrides),
          versionNonRefreshable: () => WebAppHashing.calculateClientHash(manifest, (type, replaceable) => type !== 'css' && !replaceable, configOverrides),
          versionReplaceable: () => WebAppHashing.calculateClientHash(manifest, (_type, replaceable) => replaceable, configOverrides),
          cordovaCompatibilityVersions: programJson.cordovaCompatibilityVersions,
          PUBLIC_SETTINGS,
          hmrVersion: programJson.hmrVersion
        };

        // Expose program details as a string reachable via the following URL.
        const manifestUrlPrefix = '/__' + arch.replace(/^web\./, '');
        const manifestUrl = manifestUrlPrefix + getItemPathname('/manifest.json');
        staticFiles[manifestUrl] = () => {
          if (Package.autoupdate) {
            const {
              AUTOUPDATE_VERSION = Package.autoupdate.Autoupdate.autoupdateVersion
            } = process.env;
            if (AUTOUPDATE_VERSION) {
              newProgram.version = AUTOUPDATE_VERSION;
            }
          }
          if (typeof newProgram.version === 'function') {
            newProgram.version = newProgram.version();
          }
          return {
            content: JSON.stringify(newProgram),
            cacheable: false,
            hash: newProgram.version,
            type: 'json'
          };
        };
        generateBoilerplateForArch(arch);

        // If there are any requests waiting on oldProgram.paused, let them
        // continue now (using the new program).
        if (oldProgram && oldProgram.paused) {
          oldProgram.unpause();
        }
      }
      const defaultOptionsForArch = {
        'web.cordova': {
          runtimeConfigOverrides: {
            // XXX We use absoluteUrl() here so that we serve https://
            // URLs to cordova clients if force-ssl is in use. If we were
            // to use __meteor_runtime_config__.ROOT_URL instead of
            // absoluteUrl(), then Cordova clients would immediately get a
            // HCP setting their DDP_DEFAULT_CONNECTION_URL to
            // http://example.meteor.com. This breaks the app, because
            // force-ssl doesn't serve CORS headers on 302
            // redirects. (Plus it's undesirable to have clients
            // connecting to http://example.meteor.com when force-ssl is
            // in use.)
            DDP_DEFAULT_CONNECTION_URL: process.env.MOBILE_DDP_URL || Meteor.absoluteUrl(),
            ROOT_URL: process.env.MOBILE_ROOT_URL || Meteor.absoluteUrl()
          }
        },
        'web.browser': {
          runtimeConfigOverrides: {
            isModern: true
          }
        },
        'web.browser.legacy': {
          runtimeConfigOverrides: {
            isModern: false
          }
        }
      };
      WebAppInternals.generateBoilerplate = async function () {
        // This boilerplate will be served to the mobile devices when used with
        // Meteor/Cordova for the Hot-Code Push and since the file will be served by
        // the device's server, it is important to set the DDP url to the actual
        // Meteor server accepting DDP connections and not the device's file server.
        await syncQueue.runTask(function () {
          Object.keys(WebApp.clientPrograms).forEach(generateBoilerplateForArch);
        });
      };
      function generateBoilerplateForArch(arch) {
        const program = WebApp.clientPrograms[arch];
        const additionalOptions = defaultOptionsForArch[arch] || {};
        const {
          baseData
        } = boilerplateByArch[arch] = WebAppInternals.generateBoilerplateInstance(arch, program.manifest, additionalOptions);
        // We need the runtime config with overrides for meteor_runtime_config.js:
        program.meteorRuntimeConfig = JSON.stringify(_objectSpread(_objectSpread({}, __meteor_runtime_config__), additionalOptions.runtimeConfigOverrides || null));
        program.refreshableAssets = baseData.css.map(file => ({
          url: bundledJsCssUrlRewriteHook(file.url)
        }));
      }
      await WebAppInternals.reloadClientPrograms();

      // webserver
      var app = createExpressApp();

      // Packages and apps can add handlers that run before any other Meteor
      // handlers via WebApp.rawExpressHandlers.
      var rawExpressHandlers = createExpressApp();
      app.use(rawExpressHandlers);

      // Auto-compress any json, javascript, or text.
      app.use(compress({
        filter: shouldCompress
      }));

      // parse cookies into an object
      app.use(cookieParser());

      // We're not a proxy; reject (without crashing) attempts to treat us like
      // one. (See #1212.)
      app.use(function (req, res, next) {
        if (RoutePolicy.isValidUrl(req.url)) {
          next();
          return;
        }
        res.writeHead(400);
        res.write('Not a proxy');
        res.end();
      });
      function getPathParts(path) {
        const parts = path.split('/');
        while (parts[0] === '') parts.shift();
        return parts;
      }
      function isPrefixOf(prefix, array) {
        return prefix.length <= array.length && prefix.every((part, i) => part === array[i]);
      }

      // Strip off the path prefix, if it exists.
      app.use(function (request, response, next) {
        const pathPrefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX;
        const {
          pathname,
          search
        } = parseUrl(request.url);

        // check if the path in the url starts with the path prefix
        if (pathPrefix) {
          const prefixParts = getPathParts(pathPrefix);
          const pathParts = getPathParts(pathname);
          if (isPrefixOf(prefixParts, pathParts)) {
            request.url = '/' + pathParts.slice(prefixParts.length).join('/');
            if (search) {
              request.url += search;
            }
            return next();
          }
        }
        if (pathname === '/favicon.ico' || pathname === '/robots.txt') {
          return next();
        }
        if (pathPrefix) {
          response.writeHead(404);
          response.write('Unknown path');
          response.end();
          return;
        }
        next();
      });

      // Serve static files from the manifest.
      // This is inspired by the 'static' middleware.
      app.use(function (req, res, next) {
        // console.log(String(arguments.callee));
        WebAppInternals.staticFilesMiddleware(WebAppInternals.staticFilesByArch, req, res, next);
      });

      // Core Meteor packages like dynamic-import can add handlers before
      // other handlers added by package and application code.
      app.use(WebAppInternals.meteorInternalHandlers = createExpressApp());

      /**
       * @name expressHandlersCallback(req, res, next)
       * @locus Server
       * @isprototype true
       * @summary callback handler for `WebApp.expressHandlers`
       * @param {Object} req
       * a Node.js
       * [IncomingMessage](https://nodejs.org/api/http.html#class-httpincomingmessage)
       * object with some extra properties. This argument can be used
       *  to get information about the incoming request.
       * @param {Object} res
       * a Node.js
       * [ServerResponse](https://nodejs.org/api/http.html#class-httpserverresponse)
       * object. Use this to write data that should be sent in response to the
       * request, and call `res.end()` when you are done.
       * @param {Function} next
       * Calling this function will pass on the handling of
       * this request to the next relevant handler.
       *
       */

      /**
       * @method handlers
       * @memberof WebApp
       * @locus Server
       * @summary Register a handler for all HTTP requests.
       * @param {String} [path]
       * This handler will only be called on paths that match
       * this string. The match has to border on a `/` or a `.`.
       *
       * For example, `/hello` will match `/hello/world` and
       * `/hello.world`, but not `/hello_world`.
       * @param {expressHandlersCallback} handler
       * A handler function that will be called on HTTP requests.
       * See `expressHandlersCallback`
       *
       */
      // Packages and apps can add handlers to this via WebApp.expressHandlers.
      // They are inserted before our default handler.
      var packageAndAppHandlers = createExpressApp();
      app.use(packageAndAppHandlers);
      let suppressExpressErrors = false;
      // Express knows it is an error handler because it has 4 arguments instead of
      // 3. go figure.  (It is not smart enough to find such a thing if it's hidden
      // inside packageAndAppHandlers.)
      app.use(function (err, req, res, next) {
        if (!err || !suppressExpressErrors || !req.headers['x-suppress-error']) {
          next(err);
          return;
        }
        res.writeHead(err.status, {
          'Content-Type': 'text/plain'
        });
        res.end('An error message');
      });
      app.use(async function (req, res, next) {
        var _Meteor$settings$pack5, _Meteor$settings$pack6;
        if (!appUrl(req.url)) {
          return next();
        } else if (req.method !== 'HEAD' && req.method !== 'GET' && !((_Meteor$settings$pack5 = Meteor.settings.packages) !== null && _Meteor$settings$pack5 !== void 0 && (_Meteor$settings$pack6 = _Meteor$settings$pack5.webapp) !== null && _Meteor$settings$pack6 !== void 0 && _Meteor$settings$pack6.alwaysReturnContent)) {
          const status = req.method === 'OPTIONS' ? 200 : 405;
          res.writeHead(status, {
            Allow: 'OPTIONS, GET, HEAD',
            'Content-Length': '0'
          });
          res.end();
        } else {
          var headers = {
            'Content-Type': 'text/html; charset=utf-8'
          };
          if (shuttingDown) {
            headers['Connection'] = 'Close';
          }
          var request = WebApp.categorizeRequest(req);
          if (request.url.query && request.url.query['meteor_css_resource']) {
            // In this case, we're requesting a CSS resource in the meteor-specific
            // way, but we don't have it.  Serve a static css file that indicates that
            // we didn't have it, so we can detect that and refresh.  Make sure
            // that any proxies or CDNs don't cache this error!  (Normally proxies
            // or CDNs are smart enough not to cache error pages, but in order to
            // make this hack work, we need to return the CSS file as a 200, which
            // would otherwise be cached.)
            headers['Content-Type'] = 'text/css; charset=utf-8';
            headers['Cache-Control'] = 'no-cache';
            res.writeHead(200, headers);
            res.write('.meteor-css-not-found-error { width: 0px;}');
            res.end();
            return;
          }
          if (request.url.query && request.url.query['meteor_js_resource']) {
            // Similarly, we're requesting a JS resource that we don't have.
            // Serve an uncached 404. (We can't use the same hack we use for CSS,
            // because actually acting on that hack requires us to have the JS
            // already!)
            headers['Cache-Control'] = 'no-cache';
            res.writeHead(404, headers);
            res.end('404 Not Found');
            return;
          }
          if (request.url.query && request.url.query['meteor_dont_serve_index']) {
            // When downloading files during a Cordova hot code push, we need
            // to detect if a file is not available instead of inadvertently
            // downloading the default index page.
            // So similar to the situation above, we serve an uncached 404.
            headers['Cache-Control'] = 'no-cache';
            res.writeHead(404, headers);
            res.end('404 Not Found');
            return;
          }
          const {
            arch
          } = request;
          assert.strictEqual(typeof arch, 'string', {
            arch
          });
          if (!hasOwn.call(WebApp.clientPrograms, arch)) {
            // We could come here in case we run with some architectures excluded
            headers['Cache-Control'] = 'no-cache';
            res.writeHead(404, headers);
            if (Meteor.isDevelopment) {
              res.end("No client program found for the ".concat(arch, " architecture."));
            } else {
              // Safety net, but this branch should not be possible.
              res.end('404 Not Found');
            }
            return;
          }

          // If pauseClient(arch) has been called, program.paused will be a
          // Promise that will be resolved when the program is unpaused.
          await WebApp.clientPrograms[arch].paused;
          return getBoilerplateAsync(request, arch).then(_ref4 => {
            let {
              stream,
              statusCode,
              headers: newHeaders
            } = _ref4;
            if (!statusCode) {
              statusCode = res.statusCode ? res.statusCode : 200;
            }
            if (newHeaders) {
              Object.assign(headers, newHeaders);
            }
            res.writeHead(statusCode, headers);
            stream.pipe(res, {
              // End the response when the stream ends.
              end: true
            });
          }).catch(error => {
            Log.error('Error running template: ' + error.stack);
            res.writeHead(500, headers);
            res.end();
          });
        }
      });

      // Return 404 by default, if no other handlers serve this URL.
      app.use(function (req, res) {
        res.writeHead(404);
        res.end();
      });
      var httpServer = createServer(app);
      var onListeningCallbacks = [];

      // After 5 seconds w/o data on a socket, kill it.  On the other hand, if
      // there's an outstanding request, give it a higher timeout instead (to avoid
      // killing long-polling requests)
      httpServer.setTimeout(SHORT_SOCKET_TIMEOUT);

      // Do this here, and then also in livedata/stream_server.js, because
      // stream_server.js kills all the current request handlers when installing its
      // own.
      httpServer.on('request', WebApp._timeoutAdjustmentRequestCallback);

      // If the client gave us a bad request, tell it instead of just closing the
      // socket. This lets load balancers in front of us differentiate between "a
      // server is randomly closing sockets for no reason" and "client sent a bad
      // request".
      //
      // This will only work on Node 6; Node 4 destroys the socket before calling
      // this event. See https://github.com/nodejs/node/pull/4557/ for details.
      httpServer.on('clientError', (err, socket) => {
        // Pre-Node-6, do nothing.
        if (socket.destroyed) {
          return;
        }
        if (err.message === 'Parse Error') {
          socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        } else {
          // For other errors, use the default behavior as if we had no clientError
          // handler.
          socket.destroy(err);
        }
      });
      const suppressErrors = function () {
        suppressExpressErrors = true;
      };
      let warnedAboutConnectUsage = false;

      // start up app
      Object.assign(WebApp, {
        connectHandlers: packageAndAppHandlers,
        handlers: packageAndAppHandlers,
        rawConnectHandlers: rawExpressHandlers,
        rawHandlers: rawExpressHandlers,
        httpServer: httpServer,
        expressApp: app,
        // For testing.
        suppressConnectErrors: () => {
          if (!warnedAboutConnectUsage) {
            Meteor._debug("WebApp.suppressConnectErrors has been renamed to Meteor._suppressExpressErrors and it should be used only in tests.");
            warnedAboutConnectUsage = true;
          }
          suppressErrors();
        },
        _suppressExpressErrors: suppressErrors,
        onListening: function (f) {
          if (onListeningCallbacks) onListeningCallbacks.push(f);else f();
        },
        // This can be overridden by users who want to modify how listening works
        // (eg, to run a proxy like Apollo Engine Proxy in front of the server).
        startListening: function (httpServer, listenOptions, cb) {
          httpServer.listen(listenOptions, cb);
        }
      });

      /**
      * @name main
      * @locus Server
      * @summary Starts the HTTP server.
      *  If `UNIX_SOCKET_PATH` is present Meteor's HTTP server will use that socket file for inter-process communication, instead of TCP.
      * If you choose to not include webapp package in your application this method still must be defined for your Meteor application to work.
      */
      // Let the rest of the packages (and Meteor.startup hooks) insert Express
      // middlewares and update __meteor_runtime_config__, then keep going to set up
      // actually serving HTML.
      exports.main = async argv => {
        await WebAppInternals.generateBoilerplate();
        const startHttpServer = listenOptions => {
          WebApp.startListening((argv === null || argv === void 0 ? void 0 : argv.httpServer) || httpServer, listenOptions, Meteor.bindEnvironment(() => {
            if (process.env.METEOR_PRINT_ON_LISTEN) {
              console.log('LISTENING');
            }
            const callbacks = onListeningCallbacks;
            onListeningCallbacks = null;
            callbacks === null || callbacks === void 0 ? void 0 : callbacks.forEach(callback => {
              callback();
            });
          }, e => {
            console.error('Error listening:', e);
            console.error(e && e.stack);
          }));
        };
        let localPort = process.env.PORT || 0;
        let unixSocketPath = process.env.UNIX_SOCKET_PATH;
        if (unixSocketPath) {
          if (cluster.isWorker) {
            const workerName = cluster.worker.process.env.name || cluster.worker.id;
            unixSocketPath += '.' + workerName + '.sock';
          }
          // Start the HTTP server using a socket file.
          removeExistingSocketFile(unixSocketPath);
          startHttpServer({
            path: unixSocketPath
          });
          const unixSocketPermissions = (process.env.UNIX_SOCKET_PERMISSIONS || '').trim();
          if (unixSocketPermissions) {
            if (/^[0-7]{3}$/.test(unixSocketPermissions)) {
              chmodSync(unixSocketPath, parseInt(unixSocketPermissions, 8));
            } else {
              throw new Error('Invalid UNIX_SOCKET_PERMISSIONS specified');
            }
          }
          const unixSocketGroup = (process.env.UNIX_SOCKET_GROUP || '').trim();
          if (unixSocketGroup) {
            const unixSocketGroupInfo = getGroupInfo(unixSocketGroup);
            if (unixSocketGroupInfo === null) {
              throw new Error('Invalid UNIX_SOCKET_GROUP name specified');
            }
            chownSync(unixSocketPath, userInfo().uid, unixSocketGroupInfo.gid);
          }
          registerSocketFileCleanup(unixSocketPath);
        } else {
          localPort = isNaN(Number(localPort)) ? localPort : Number(localPort);
          if (/\\\\?.+\\pipe\\?.+/.test(localPort)) {
            // Start the HTTP server using Windows Server style named pipe.
            startHttpServer({
              path: localPort
            });
          } else if (typeof localPort === 'number') {
            // Start the HTTP server using TCP.
            startHttpServer({
              port: localPort,
              host: process.env.BIND_IP || '0.0.0.0'
            });
          } else {
            throw new Error('Invalid PORT specified');
          }
        }
        return 'DAEMON';
      };
    }
    const isGetentAvailable = () => {
      try {
        execSync('which getent');
        return true;
      } catch (_unused) {
        return false;
      }
    };
    const getGroupInfoUsingGetent = groupName => {
      try {
        const stdout = execSync("getent group ".concat(groupName), {
          encoding: 'utf8'
        });
        if (!stdout) return null;
        const [name,, gid] = stdout.trim().split(':');
        if (name == null || gid == null) return null;
        return {
          name,
          gid: Number(gid)
        };
      } catch (error) {
        return null;
      }
    };
    const getGroupInfoFromFile = groupName => {
      try {
        const data = readFileSync('/etc/group', 'utf8');
        const groupLine = data.trim().split('\n').find(line => line.startsWith("".concat(groupName, ":")));
        if (!groupLine) return null;
        const [name,, gid] = groupLine.trim().split(':');
        if (name == null || gid == null) return null;
        return {
          name,
          gid: Number(gid)
        };
      } catch (error) {
        return null;
      }
    };
    const getGroupInfo = groupName => {
      let groupInfo = getGroupInfoFromFile(groupName);
      if (!groupInfo && isGetentAvailable()) {
        groupInfo = getGroupInfoUsingGetent(groupName);
      }
      return groupInfo;
    };
    var inlineScriptsAllowed = true;
    WebAppInternals.inlineScriptsAllowed = function () {
      return inlineScriptsAllowed;
    };
    WebAppInternals.setInlineScriptsAllowed = async function (value) {
      inlineScriptsAllowed = value;
      await WebAppInternals.generateBoilerplate();
    };
    var sriMode;
    WebAppInternals.enableSubresourceIntegrity = async function () {
      let use_credentials = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;
      sriMode = use_credentials ? 'use-credentials' : 'anonymous';
      await WebAppInternals.generateBoilerplate();
    };
    WebAppInternals.setBundledJsCssUrlRewriteHook = async function (hookFn) {
      bundledJsCssUrlRewriteHook = hookFn;
      await WebAppInternals.generateBoilerplate();
    };
    WebAppInternals.setBundledJsCssPrefix = async function (prefix) {
      var self = this;
      await self.setBundledJsCssUrlRewriteHook(function (url) {
        return prefix + url;
      });
    };

    // Packages can call `WebAppInternals.addStaticJs` to specify static
    // JavaScript to be included in the app. This static JS will be inlined,
    // unless inline scripts have been disabled, in which case it will be
    // served under `/<sha1 of contents>`.
    var additionalStaticJs = {};
    WebAppInternals.addStaticJs = function (contents) {
      additionalStaticJs['/' + sha1(contents) + '.js'] = contents;
    };

    // Exported for tests
    WebAppInternals.getBoilerplate = getBoilerplate;
    WebAppInternals.additionalStaticJs = additionalStaticJs;
    await runWebAppServer();
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: true
});
//////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"socket_file.js":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                          //
// packages/webapp/socket_file.js                                                                           //
//                                                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                            //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      removeExistingSocketFile: () => removeExistingSocketFile,
      registerSocketFileCleanup: () => registerSocketFileCleanup
    });
    let statSync, unlinkSync, existsSync;
    module.link("fs", {
      statSync(v) {
        statSync = v;
      },
      unlinkSync(v) {
        unlinkSync = v;
      },
      existsSync(v) {
        existsSync = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    const removeExistingSocketFile = socketPath => {
      try {
        if (statSync(socketPath).isSocket()) {
          // Since a new socket file will be created, remove the existing
          // file.
          unlinkSync(socketPath);
        } else {
          throw new Error("An existing file was found at \"".concat(socketPath, "\" and it is not ") + 'a socket file. Please confirm PORT is pointing to valid and ' + 'un-used socket file path.');
        }
      } catch (error) {
        // If there is no existing socket file to cleanup, great, we'll
        // continue normally. If the caught exception represents any other
        // issue, re-throw.
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    };
    const registerSocketFileCleanup = function (socketPath) {
      let eventEmitter = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : process;
      ['exit', 'SIGINT', 'SIGHUP', 'SIGTERM'].forEach(signal => {
        eventEmitter.on(signal, Meteor.bindEnvironment(() => {
          if (existsSync(socketPath)) {
            unlinkSync(socketPath);
          }
        }));
      });
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
//////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"node_modules":{"express":{"package.json":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                          //
// node_modules/meteor/webapp/node_modules/express/package.json                                             //
//                                                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                            //
module.exports = {
  "name": "express",
  "version": "5.1.0"
};

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                          //
// node_modules/meteor/webapp/node_modules/express/index.js                                                 //
//                                                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                            //
module.useNode();
//////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"compression":{"package.json":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                          //
// node_modules/meteor/webapp/node_modules/compression/package.json                                         //
//                                                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                            //
module.exports = {
  "name": "compression",
  "version": "1.7.4"
};

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                          //
// node_modules/meteor/webapp/node_modules/compression/index.js                                             //
//                                                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                            //
module.useNode();
//////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"cookie-parser":{"package.json":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                          //
// node_modules/meteor/webapp/node_modules/cookie-parser/package.json                                       //
//                                                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                            //
module.exports = {
  "name": "cookie-parser",
  "version": "1.4.6"
};

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                          //
// node_modules/meteor/webapp/node_modules/cookie-parser/index.js                                           //
//                                                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                            //
module.useNode();
//////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"qs":{"package.json":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                          //
// node_modules/meteor/webapp/node_modules/qs/package.json                                                  //
//                                                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                            //
module.exports = {
  "name": "qs",
  "version": "6.13.0",
  "main": "lib/index.js"
};

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"lib":{"index.js":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                          //
// node_modules/meteor/webapp/node_modules/qs/lib/index.js                                                  //
//                                                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                            //
module.useNode();
//////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}},"parseurl":{"package.json":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                          //
// node_modules/meteor/webapp/node_modules/parseurl/package.json                                            //
//                                                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                            //
module.exports = {
  "name": "parseurl",
  "version": "1.3.3"
};

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                          //
// node_modules/meteor/webapp/node_modules/parseurl/index.js                                                //
//                                                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                            //
module.useNode();
//////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"useragent-ng":{"package.json":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                          //
// node_modules/meteor/webapp/node_modules/useragent-ng/package.json                                        //
//                                                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                            //
module.exports = {
  "name": "useragent-ng",
  "version": "2.4.4",
  "main": "./index.js"
};

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                          //
// node_modules/meteor/webapp/node_modules/useragent-ng/index.js                                            //
//                                                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                            //
module.useNode();
//////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"send":{"package.json":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                          //
// node_modules/meteor/webapp/node_modules/send/package.json                                                //
//                                                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                            //
module.exports = {
  "name": "send",
  "version": "1.1.0"
};

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                          //
// node_modules/meteor/webapp/node_modules/send/index.js                                                    //
//                                                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                            //
module.useNode();
//////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});


/* Exports */
return {
  export: function () { return {
      WebApp: WebApp,
      WebAppInternals: WebAppInternals,
      main: main
    };},
  require: require,
  eagerModulePaths: [
    "/node_modules/meteor/webapp/webapp_server.js"
  ],
  mainModulePath: "/node_modules/meteor/webapp/webapp_server.js"
}});

//# sourceURL=meteor://💻app/packages/webapp.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvd2ViYXBwL3dlYmFwcF9zZXJ2ZXIuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL3dlYmFwcC9zb2NrZXRfZmlsZS5qcyJdLCJuYW1lcyI6WyJfb2JqZWN0U3ByZWFkIiwibW9kdWxlMSIsImxpbmsiLCJkZWZhdWx0IiwidiIsImV4cG9ydCIsIldlYkFwcCIsIldlYkFwcEludGVybmFscyIsImdldEdyb3VwSW5mbyIsImFzc2VydCIsInJlYWRGaWxlU3luYyIsImNobW9kU3luYyIsImNob3duU3luYyIsImNyZWF0ZVNlcnZlciIsInVzZXJJbmZvIiwicGF0aEpvaW4iLCJwYXRoRGlybmFtZSIsImpvaW4iLCJkaXJuYW1lIiwicGFyc2VVcmwiLCJwYXJzZSIsImNyZWF0ZUhhc2giLCJleHByZXNzIiwiY29tcHJlc3MiLCJjb29raWVQYXJzZXIiLCJxcyIsInBhcnNlUmVxdWVzdCIsImxvb2t1cFVzZXJBZ2VudCIsImxvb2t1cCIsImlzTW9kZXJuIiwic2VuZCIsInJlbW92ZUV4aXN0aW5nU29ja2V0RmlsZSIsInJlZ2lzdGVyU29ja2V0RmlsZUNsZWFudXAiLCJjbHVzdGVyIiwiZXhlY1N5bmMiLCJvbk1lc3NhZ2UiLCJfX3JlaWZ5V2FpdEZvckRlcHNfXyIsIlNIT1JUX1NPQ0tFVF9USU1FT1VUIiwiTE9OR19TT0NLRVRfVElNRU9VVCIsImNyZWF0ZUV4cHJlc3NBcHAiLCJhcHAiLCJzZXQiLCJoYXNPd24iLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsIk5wbU1vZHVsZXMiLCJ2ZXJzaW9uIiwiTnBtIiwicmVxdWlyZSIsIm1vZHVsZSIsImRlZmF1bHRBcmNoIiwiY2xpZW50UHJvZ3JhbXMiLCJhcmNoUGF0aCIsImJ1bmRsZWRKc0Nzc1VybFJld3JpdGVIb29rIiwidXJsIiwiYnVuZGxlZFByZWZpeCIsIl9fbWV0ZW9yX3J1bnRpbWVfY29uZmlnX18iLCJST09UX1VSTF9QQVRIX1BSRUZJWCIsInNoYTEiLCJjb250ZW50cyIsImhhc2giLCJ1cGRhdGUiLCJkaWdlc3QiLCJzaG91bGRDb21wcmVzcyIsInJlcSIsInJlcyIsImhlYWRlcnMiLCJmaWx0ZXIiLCJjYW1lbENhc2UiLCJuYW1lIiwicGFydHMiLCJzcGxpdCIsInRvTG93ZXJDYXNlIiwiaSIsImxlbmd0aCIsImNoYXJBdCIsInRvVXBwZXJDYXNlIiwic3Vic3RyaW5nIiwiaWRlbnRpZnlCcm93c2VyIiwidXNlckFnZW50U3RyaW5nIiwibWFqb3IiLCJtaW5vciIsInBhdGNoIiwidXNlckFnZW50IiwiZmFtaWx5IiwiY2F0ZWdvcml6ZVJlcXVlc3QiLCJicm93c2VyIiwiYXJjaCIsIm1vZGVybiIsInBhdGgiLCJwYXRobmFtZSIsImNhdGVnb3JpemVkIiwiZHluYW1pY0hlYWQiLCJkeW5hbWljQm9keSIsImNvb2tpZXMiLCJwYXRoUGFydHMiLCJhcmNoS2V5Iiwic3RhcnRzV2l0aCIsImFyY2hDbGVhbmVkIiwic2xpY2UiLCJjYWxsIiwic3BsaWNlIiwiYXNzaWduIiwicHJlZmVycmVkQXJjaE9yZGVyIiwiaHRtbEF0dHJpYnV0ZUhvb2tzIiwiZ2V0SHRtbEF0dHJpYnV0ZXMiLCJyZXF1ZXN0IiwiY29tYmluZWRBdHRyaWJ1dGVzIiwiZm9yRWFjaCIsImhvb2siLCJhdHRyaWJ1dGVzIiwiRXJyb3IiLCJhZGRIdG1sQXR0cmlidXRlSG9vayIsInB1c2giLCJhcHBVcmwiLCJSb3V0ZVBvbGljeSIsImNsYXNzaWZ5IiwiTWV0ZW9yIiwic3RhcnR1cCIsImdldHRlciIsImtleSIsInByb2dyYW0iLCJ2YWx1ZSIsImNhbGN1bGF0ZUNsaWVudEhhc2giLCJjbGllbnRIYXNoIiwiY2FsY3VsYXRlQ2xpZW50SGFzaFJlZnJlc2hhYmxlIiwiY2FsY3VsYXRlQ2xpZW50SGFzaE5vblJlZnJlc2hhYmxlIiwiY2FsY3VsYXRlQ2xpZW50SGFzaFJlcGxhY2VhYmxlIiwiZ2V0UmVmcmVzaGFibGVBc3NldHMiLCJfdGltZW91dEFkanVzdG1lbnRSZXF1ZXN0Q2FsbGJhY2siLCJzZXRUaW1lb3V0IiwiZmluaXNoTGlzdGVuZXJzIiwibGlzdGVuZXJzIiwicmVtb3ZlQWxsTGlzdGVuZXJzIiwib24iLCJ2YWx1ZXMiLCJsIiwiYm9pbGVycGxhdGVCeUFyY2giLCJib2lsZXJwbGF0ZURhdGFDYWxsYmFja3MiLCJjcmVhdGUiLCJyZWdpc3RlckJvaWxlcnBsYXRlRGF0YUNhbGxiYWNrIiwiY2FsbGJhY2siLCJwcmV2aW91c0NhbGxiYWNrIiwic3RyaWN0RXF1YWwiLCJnZXRCb2lsZXJwbGF0ZSIsImdldEJvaWxlcnBsYXRlQXN5bmMiLCJlbmNvZGVSdW50aW1lQ29uZmlnIiwicnRpbWVDb25maWciLCJKU09OIiwic3RyaW5naWZ5IiwiZW5jb2RlVVJJQ29tcG9uZW50IiwiZGVjb2RlUnVudGltZUNvbmZpZyIsInJ0aW1lQ29uZmlnU3RyIiwiZGVjb2RlVVJJQ29tcG9uZW50IiwicnVudGltZUNvbmZpZyIsImhvb2tzIiwiSG9vayIsInVwZGF0ZUhvb2tzIiwiaXNVcGRhdGVkQnlBcmNoIiwiYWRkUnVudGltZUNvbmZpZ0hvb2siLCJyZWdpc3RlciIsImJvaWxlcnBsYXRlIiwiZm9yRWFjaEFzeW5jIiwibWV0ZW9yUnVudGltZUNvbmZpZyIsImVuY29kZWRDdXJyZW50Q29uZmlnIiwiYmFzZURhdGEiLCJ1cGRhdGVkIiwiZGF0YSIsImh0bWxBdHRyaWJ1dGVzIiwibWFkZUNoYW5nZXMiLCJwcm9taXNlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJrZXlzIiwidGhlbiIsInJlc3VsdCIsInN0cmVhbSIsInRvSFRNTFN0cmVhbSIsInN0YXR1c0NvZGUiLCJhZGRVcGRhdGVkTm90aWZ5SG9vayIsImhhbmRsZXIiLCJnZW5lcmF0ZUJvaWxlcnBsYXRlSW5zdGFuY2UiLCJtYW5pZmVzdCIsImFkZGl0aW9uYWxPcHRpb25zIiwicnVudGltZUNvbmZpZ092ZXJyaWRlcyIsImNiIiwiQm9pbGVycGxhdGUiLCJwYXRoTWFwcGVyIiwiaXRlbVBhdGgiLCJiYXNlRGF0YUV4dGVuc2lvbiIsImFkZGl0aW9uYWxTdGF0aWNKcyIsImVudHJpZXMiLCJtYXAiLCJfcmVmIiwibWV0ZW9yUnVudGltZUhhc2giLCJyb290VXJsUGF0aFByZWZpeCIsInNyaU1vZGUiLCJpbmxpbmVTY3JpcHRzQWxsb3dlZCIsImlubGluZSIsInN0YXRpY0ZpbGVzTWlkZGxld2FyZSIsInN0YXRpY0ZpbGVzQnlBcmNoIiwibmV4dCIsIl9NZXRlb3Ikc2V0dGluZ3MkcGFjazMiLCJfTWV0ZW9yJHNldHRpbmdzJHBhY2s0IiwiZSIsInNlcnZlU3RhdGljSnMiLCJzIiwiX01ldGVvciRzZXR0aW5ncyRwYWNrIiwiX01ldGVvciRzZXR0aW5ncyRwYWNrMiIsIm1ldGhvZCIsInNldHRpbmdzIiwicGFja2FnZXMiLCJ3ZWJhcHAiLCJhbHdheXNSZXR1cm5Db250ZW50Iiwid3JpdGVIZWFkIiwiQnVmZmVyIiwiYnl0ZUxlbmd0aCIsIndyaXRlIiwiZW5kIiwic3RhdHVzIiwiQWxsb3ciLCJwYXVzZWQiLCJjb25jYXQiLCJpbmZvIiwiZ2V0U3RhdGljRmlsZUluZm8iLCJtYXhBZ2UiLCJjYWNoZWFibGUiLCJzZXRIZWFkZXIiLCJzb3VyY2VNYXBVcmwiLCJ0eXBlIiwiY29udGVudCIsImFic29sdXRlUGF0aCIsIm1heGFnZSIsImRvdGZpbGVzIiwibGFzdE1vZGlmaWVkIiwiZXJyIiwiTG9nIiwiZXJyb3IiLCJwaXBlIiwib3JpZ2luYWxQYXRoIiwic3RhdGljQXJjaExpc3QiLCJhcmNoSW5kZXgiLCJpbmRleE9mIiwidW5zaGlmdCIsInNvbWUiLCJzdGF0aWNGaWxlcyIsImZpbmFsaXplIiwicGFyc2VQb3J0IiwicG9ydCIsInBhcnNlZFBvcnQiLCJwYXJzZUludCIsIk51bWJlciIsImlzTmFOIiwiX3JlZjIiLCJwYXVzZUNsaWVudCIsIl9yZWYzIiwiZ2VuZXJhdGVDbGllbnRQcm9ncmFtIiwicnVuV2ViQXBwU2VydmVyIiwic2h1dHRpbmdEb3duIiwic3luY1F1ZXVlIiwiX0FzeW5jaHJvbm91c1F1ZXVlIiwiZ2V0SXRlbVBhdGhuYW1lIiwiaXRlbVVybCIsInJlbG9hZENsaWVudFByb2dyYW1zIiwicnVuVGFzayIsImNvbmZpZ0pzb24iLCJfX21ldGVvcl9ib290c3RyYXBfXyIsImNsaWVudEFyY2hzIiwiY2xpZW50UGF0aHMiLCJzdGFjayIsInByb2Nlc3MiLCJleGl0IiwidW5wYXVzZSIsImFyZ3VtZW50cyIsInVuZGVmaW5lZCIsImNsaWVudERpciIsInNlcnZlckRpciIsInByb2dyYW1Kc29uUGF0aCIsInByb2dyYW1Kc29uIiwiY29kZSIsImZvcm1hdCIsIml0ZW0iLCJ3aGVyZSIsInNvdXJjZU1hcCIsIlBVQkxJQ19TRVRUSU5HUyIsImNvbmZpZ092ZXJyaWRlcyIsIm9sZFByb2dyYW0iLCJuZXdQcm9ncmFtIiwiV2ViQXBwSGFzaGluZyIsInZlcnNpb25SZWZyZXNoYWJsZSIsInZlcnNpb25Ob25SZWZyZXNoYWJsZSIsInJlcGxhY2VhYmxlIiwidmVyc2lvblJlcGxhY2VhYmxlIiwiX3R5cGUiLCJjb3Jkb3ZhQ29tcGF0aWJpbGl0eVZlcnNpb25zIiwiaG1yVmVyc2lvbiIsIm1hbmlmZXN0VXJsUHJlZml4IiwicmVwbGFjZSIsIm1hbmlmZXN0VXJsIiwiUGFja2FnZSIsImF1dG91cGRhdGUiLCJBVVRPVVBEQVRFX1ZFUlNJT04iLCJBdXRvdXBkYXRlIiwiYXV0b3VwZGF0ZVZlcnNpb24iLCJlbnYiLCJnZW5lcmF0ZUJvaWxlcnBsYXRlRm9yQXJjaCIsImRlZmF1bHRPcHRpb25zRm9yQXJjaCIsIkREUF9ERUZBVUxUX0NPTk5FQ1RJT05fVVJMIiwiTU9CSUxFX0REUF9VUkwiLCJhYnNvbHV0ZVVybCIsIlJPT1RfVVJMIiwiTU9CSUxFX1JPT1RfVVJMIiwiZ2VuZXJhdGVCb2lsZXJwbGF0ZSIsInJlZnJlc2hhYmxlQXNzZXRzIiwiY3NzIiwiZmlsZSIsInJhd0V4cHJlc3NIYW5kbGVycyIsInVzZSIsImlzVmFsaWRVcmwiLCJnZXRQYXRoUGFydHMiLCJzaGlmdCIsImlzUHJlZml4T2YiLCJwcmVmaXgiLCJhcnJheSIsImV2ZXJ5IiwicGFydCIsInJlc3BvbnNlIiwicGF0aFByZWZpeCIsInNlYXJjaCIsInByZWZpeFBhcnRzIiwibWV0ZW9ySW50ZXJuYWxIYW5kbGVycyIsInBhY2thZ2VBbmRBcHBIYW5kbGVycyIsInN1cHByZXNzRXhwcmVzc0Vycm9ycyIsIl9NZXRlb3Ikc2V0dGluZ3MkcGFjazUiLCJfTWV0ZW9yJHNldHRpbmdzJHBhY2s2IiwicXVlcnkiLCJpc0RldmVsb3BtZW50IiwiX3JlZjQiLCJuZXdIZWFkZXJzIiwiY2F0Y2giLCJodHRwU2VydmVyIiwib25MaXN0ZW5pbmdDYWxsYmFja3MiLCJzb2NrZXQiLCJkZXN0cm95ZWQiLCJtZXNzYWdlIiwiZGVzdHJveSIsInN1cHByZXNzRXJyb3JzIiwid2FybmVkQWJvdXRDb25uZWN0VXNhZ2UiLCJjb25uZWN0SGFuZGxlcnMiLCJoYW5kbGVycyIsInJhd0Nvbm5lY3RIYW5kbGVycyIsInJhd0hhbmRsZXJzIiwiZXhwcmVzc0FwcCIsInN1cHByZXNzQ29ubmVjdEVycm9ycyIsIl9kZWJ1ZyIsIl9zdXBwcmVzc0V4cHJlc3NFcnJvcnMiLCJvbkxpc3RlbmluZyIsImYiLCJzdGFydExpc3RlbmluZyIsImxpc3Rlbk9wdGlvbnMiLCJsaXN0ZW4iLCJleHBvcnRzIiwibWFpbiIsImFyZ3YiLCJzdGFydEh0dHBTZXJ2ZXIiLCJiaW5kRW52aXJvbm1lbnQiLCJNRVRFT1JfUFJJTlRfT05fTElTVEVOIiwiY29uc29sZSIsImxvZyIsImNhbGxiYWNrcyIsImxvY2FsUG9ydCIsIlBPUlQiLCJ1bml4U29ja2V0UGF0aCIsIlVOSVhfU09DS0VUX1BBVEgiLCJpc1dvcmtlciIsIndvcmtlck5hbWUiLCJ3b3JrZXIiLCJpZCIsInVuaXhTb2NrZXRQZXJtaXNzaW9ucyIsIlVOSVhfU09DS0VUX1BFUk1JU1NJT05TIiwidHJpbSIsInRlc3QiLCJ1bml4U29ja2V0R3JvdXAiLCJVTklYX1NPQ0tFVF9HUk9VUCIsInVuaXhTb2NrZXRHcm91cEluZm8iLCJ1aWQiLCJnaWQiLCJob3N0IiwiQklORF9JUCIsImlzR2V0ZW50QXZhaWxhYmxlIiwiX3VudXNlZCIsImdldEdyb3VwSW5mb1VzaW5nR2V0ZW50IiwiZ3JvdXBOYW1lIiwic3Rkb3V0IiwiZW5jb2RpbmciLCJnZXRHcm91cEluZm9Gcm9tRmlsZSIsImdyb3VwTGluZSIsImZpbmQiLCJsaW5lIiwiZ3JvdXBJbmZvIiwic2V0SW5saW5lU2NyaXB0c0FsbG93ZWQiLCJlbmFibGVTdWJyZXNvdXJjZUludGVncml0eSIsInVzZV9jcmVkZW50aWFscyIsInNldEJ1bmRsZWRKc0Nzc1VybFJld3JpdGVIb29rIiwiaG9va0ZuIiwic2V0QnVuZGxlZEpzQ3NzUHJlZml4Iiwic2VsZiIsImFkZFN0YXRpY0pzIiwiX19yZWlmeV9hc3luY19yZXN1bHRfXyIsIl9yZWlmeUVycm9yIiwiYXN5bmMiLCJzdGF0U3luYyIsInVubGlua1N5bmMiLCJleGlzdHNTeW5jIiwic29ja2V0UGF0aCIsImlzU29ja2V0IiwiZXZlbnRFbWl0dGVyIiwic2lnbmFsIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0lBQUEsSUFBSUEsYUFBYTtJQUFDQyxPQUFPLENBQUNDLElBQUksQ0FBQyxzQ0FBc0MsRUFBQztNQUFDQyxPQUFPQSxDQUFDQyxDQUFDLEVBQUM7UUFBQ0osYUFBYSxHQUFDSSxDQUFDO01BQUE7SUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0lBQXRHSCxPQUFPLENBQUNJLE1BQU0sQ0FBQztNQUFDQyxNQUFNLEVBQUNBLENBQUEsS0FBSUEsTUFBTTtNQUFDQyxlQUFlLEVBQUNBLENBQUEsS0FBSUEsZUFBZTtNQUFDQyxZQUFZLEVBQUNBLENBQUEsS0FBSUE7SUFBWSxDQUFDLENBQUM7SUFBQyxJQUFJQyxNQUFNO0lBQUNSLE9BQU8sQ0FBQ0MsSUFBSSxDQUFDLFFBQVEsRUFBQztNQUFDQyxPQUFPQSxDQUFDQyxDQUFDLEVBQUM7UUFBQ0ssTUFBTSxHQUFDTCxDQUFDO01BQUE7SUFBQyxDQUFDLEVBQUMs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QUFHSCxPQUFPO01BQ2pDLENBQUMsTUFBTSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsU0FBUyxDQUFDLENBQUNsSyxPQUFPLENBQUNxVCxNQUFNLElBQUk7UUFDeERELFlBQVksQ0FBQzFSLEVBQUUsQ0FBQzJSLE1BQU0sRUFBRTVTLE1BQU0sQ0FBQ3dQLGVBQWUsQ0FBQyxNQUFNO1VBQ25ELElBQUlnRCxVQUFVLENBQUNDLFVBQVUsQ0FBQyxFQUFFO1lBQzFCRixVQUFVLENBQUNFLFVBQVUsQ0FBQztVQUN4QjtRQUNGLENBQUMsQ0FBQyxDQUFDO01BQ0wsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUFDTixzQkFBQTtFQUFBLFNBQUFDLFdBQUE7SUFBQSxPQUFBRCxzQkFBQSxDQUFBQyxXQUFBO0VBQUE7RUFBQUQsc0JBQUE7QUFBQTtFQUFBRixJQUFBO0VBQUFJLEtBQUE7QUFBQSxHIiwiZmlsZSI6Ii9wYWNrYWdlcy93ZWJhcHAuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyByZWFkRmlsZVN5bmMsIGNobW9kU3luYywgY2hvd25TeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgY3JlYXRlU2VydmVyIH0gZnJvbSAnaHR0cCc7XG5pbXBvcnQgeyB1c2VySW5mbyB9IGZyb20gJ29zJztcbmltcG9ydCB7IGpvaW4gYXMgcGF0aEpvaW4sIGRpcm5hbWUgYXMgcGF0aERpcm5hbWUgfSBmcm9tICdwYXRoJztcbmltcG9ydCB7IHBhcnNlIGFzIHBhcnNlVXJsIH0gZnJvbSAndXJsJztcbmltcG9ydCB7IGNyZWF0ZUhhc2ggfSBmcm9tICdjcnlwdG8nO1xuaW1wb3J0IGV4cHJlc3MgZnJvbSAnZXhwcmVzcyc7XG5pbXBvcnQgY29tcHJlc3MgZnJvbSAnY29tcHJlc3Npb24nO1xuaW1wb3J0IGNvb2tpZVBhcnNlciBmcm9tICdjb29raWUtcGFyc2VyJztcbmltcG9ydCBxcyBmcm9tICdxcyc7XG5pbXBvcnQgcGFyc2VSZXF1ZXN0IGZyb20gJ3BhcnNldXJsJztcbmltcG9ydCB7IGxvb2t1cCBhcyBsb29rdXBVc2VyQWdlbnQgfSBmcm9tICd1c2VyYWdlbnQtbmcnO1xuaW1wb3J0IHsgaXNNb2Rlcm4gfSBmcm9tICdtZXRlb3IvbW9kZXJuLWJyb3dzZXJzJztcbmltcG9ydCBzZW5kIGZyb20gJ3NlbmQnO1xuaW1wb3J0IHtcbiAgcmVtb3ZlRXhpc3RpbmdTb2NrZXRGaWxlLFxuICByZWdpc3RlclNvY2tldEZpbGVDbGVhbnVwLFxufSBmcm9tICcuL3NvY2tldF9maWxlLmpzJztcbmltcG9ydCBjbHVzdGVyIGZyb20gJ2NsdXN0ZXInO1xuaW1wb3J0IHsgZXhlY1N5bmMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcblxudmFyIFNIT1JUX1NPQ0tFVF9USU1FT1VUID0gNSAqIDEwMDA7XG52YXIgTE9OR19TT0NLRVRfVElNRU9VVCA9IDEyMCAqIDEwMDA7XG5cbmNvbnN0IGNyZWF0ZUV4cHJlc3NBcHAgPSAoKSA9PiB7XG4gIGNvbnN0IGFwcCA9IGV4cHJlc3MoKTtcbiAgLy8gU2VjdXJpdHkgYW5kIHBlcmZvcm1hY2UgaGVhZGVyc1xuICAvLyB0aGVzZSBoZWFkZXJzIGNvbWUgZnJvbSB0aGVzZSBkb2NzOiBodHRwczovL2V4cHJlc3Nqcy5jb20vZW4vYXBpLmh0bWwjYXBwLnNldHRpbmdzLnRhYmxlXG4gIGFwcC5zZXQoJ3gtcG93ZXJlZC1ieScsIGZhbHNlKTtcbiAgYXBwLnNldCgnZXRhZycsIGZhbHNlKTtcbiAgYXBwLnNldCgncXVlcnkgcGFyc2VyJywgcXMucGFyc2UpO1xuICByZXR1cm4gYXBwO1xufVxuZXhwb3J0IGNvbnN0IFdlYkFwcCA9IHt9O1xuZXhwb3J0IGNvbnN0IFdlYkFwcEludGVybmFscyA9IHt9O1xuXG5jb25zdCBoYXNPd24gPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5O1xuXG5cbldlYkFwcEludGVybmFscy5OcG1Nb2R1bGVzID0ge1xuICBleHByZXNzIDoge1xuICAgIHZlcnNpb246IE5wbS5yZXF1aXJlKCdleHByZXNzL3BhY2thZ2UuanNvbicpLnZlcnNpb24sXG4gICAgbW9kdWxlOiBleHByZXNzLFxuICB9XG59O1xuXG4vLyBNb3JlIG9mIGEgY29udmVuaWVuY2UgZm9yIHRoZSBlbmQgdXNlclxuV2ViQXBwLmV4cHJlc3MgPSBleHByZXNzO1xuXG4vLyBUaG91Z2ggd2UgbWlnaHQgcHJlZmVyIHRvIHVzZSB3ZWIuYnJvd3NlciAobW9kZXJuKSBhcyB0aGUgZGVmYXVsdFxuLy8gYXJjaGl0ZWN0dXJlLCBzYWZldHkgcmVxdWlyZXMgYSBtb3JlIGNvbXBhdGlibGUgZGVmYXVsdEFyY2guXG5XZWJBcHAuZGVmYXVsdEFyY2ggPSAnd2ViLmJyb3dzZXIubGVnYWN5JztcblxuLy8gWFhYIG1hcHMgYXJjaHMgdG8gbWFuaWZlc3RzXG5XZWJBcHAuY2xpZW50UHJvZ3JhbXMgPSB7fTtcblxuLy8gWFhYIG1hcHMgYXJjaHMgdG8gcHJvZ3JhbSBwYXRoIG9uIGZpbGVzeXN0ZW1cbnZhciBhcmNoUGF0aCA9IHt9O1xuXG52YXIgYnVuZGxlZEpzQ3NzVXJsUmV3cml0ZUhvb2sgPSBmdW5jdGlvbih1cmwpIHtcbiAgdmFyIGJ1bmRsZWRQcmVmaXggPSBfX21ldGVvcl9ydW50aW1lX2NvbmZpZ19fLlJPT1RfVVJMX1BBVEhfUFJFRklYIHx8ICcnO1xuICByZXR1cm4gYnVuZGxlZFByZWZpeCArIHVybDtcbn07XG5cbnZhciBzaGExID0gZnVuY3Rpb24oY29udGVudHMpIHtcbiAgdmFyIGhhc2ggPSBjcmVhdGVIYXNoKCdzaGExJyk7XG4gIGhhc2gudXBkYXRlKGNvbnRlbnRzKTtcbiAgcmV0dXJuIGhhc2guZGlnZXN0KCdoZXgnKTtcbn07XG5cbmZ1bmN0aW9uIHNob3VsZENvbXByZXNzKHJlcSwgcmVzKSB7XG4gIGlmIChyZXEuaGVhZGVyc1sneC1uby1jb21wcmVzc2lvbiddKSB7XG4gICAgLy8gZG9uJ3QgY29tcHJlc3MgcmVzcG9uc2VzIHdpdGggdGhpcyByZXF1ZXN0IGhlYWRlclxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIC8vIGZhbGxiYWNrIHRvIHN0YW5kYXJkIGZpbHRlciBmdW5jdGlvblxuICByZXR1cm4gY29tcHJlc3MuZmlsdGVyKHJlcSwgcmVzKTtcbn1cblxuLy8gI0Jyb3dzZXJJZGVudGlmaWNhdGlvblxuLy9cbi8vIFdlIGhhdmUgbXVsdGlwbGUgcGxhY2VzIHRoYXQgd2FudCB0byBpZGVudGlmeSB0aGUgYnJvd3NlcjogdGhlXG4vLyB1bnN1cHBvcnRlZCBicm93c2VyIHBhZ2UsIHRoZSBhcHBjYWNoZSBwYWNrYWdlLCBhbmQsIGV2ZW50dWFsbHlcbi8vIGRlbGl2ZXJpbmcgYnJvd3NlciBwb2x5ZmlsbHMgb25seSBhcyBuZWVkZWQuXG4vL1xuLy8gVG8gYXZvaWQgZGV0ZWN0aW5nIHRoZSBicm93c2VyIGluIG11bHRpcGxlIHBsYWNlcyBhZC1ob2MsIHdlIGNyZWF0ZSBhXG4vLyBNZXRlb3IgXCJicm93c2VyXCIgb2JqZWN0LiBJdCB1c2VzIGJ1dCBkb2VzIG5vdCBleHBvc2UgdGhlIG5wbVxuLy8gdXNlcmFnZW50IG1vZHVsZSAod2UgY291bGQgY2hvb3NlIGEgZGlmZmVyZW50IG1lY2hhbmlzbSB0byBpZGVudGlmeVxuLy8gdGhlIGJyb3dzZXIgaW4gdGhlIGZ1dHVyZSBpZiB3ZSB3YW50ZWQgdG8pLiAgVGhlIGJyb3dzZXIgb2JqZWN0XG4vLyBjb250YWluc1xuLy9cbi8vICogYG5hbWVgOiB0aGUgbmFtZSBvZiB0aGUgYnJvd3NlciBpbiBjYW1lbCBjYXNlXG4vLyAqIGBtYWpvcmAsIGBtaW5vcmAsIGBwYXRjaGA6IGludGVnZXJzIGRlc2NyaWJpbmcgdGhlIGJyb3dzZXIgdmVyc2lvblxuLy9cbi8vIEFsc28gaGVyZSBpcyBhbiBlYXJseSB2ZXJzaW9uIG9mIGEgTWV0ZW9yIGByZXF1ZXN0YCBvYmplY3QsIGludGVuZGVkXG4vLyB0byBiZSBhIGhpZ2gtbGV2ZWwgZGVzY3JpcHRpb24gb2YgdGhlIHJlcXVlc3Qgd2l0aG91dCBleHBvc2luZ1xuLy8gZGV0YWlscyBvZiBFeHByZXNzJ3MgbG93LWxldmVsIGByZXFgLiAgQ3VycmVudGx5IGl0IGNvbnRhaW5zOlxuLy9cbi8vICogYGJyb3dzZXJgOiBicm93c2VyIGlkZW50aWZpY2F0aW9uIG9iamVjdCBkZXNjcmliZWQgYWJvdmVcbi8vICogYHVybGA6IHBhcnNlZCB1cmwsIGluY2x1ZGluZyBwYXJzZWQgcXVlcnkgcGFyYW1zXG4vL1xuLy8gQXMgYSB0ZW1wb3JhcnkgaGFjayB0aGVyZSBpcyBhIGBjYXRlZ29yaXplUmVxdWVzdGAgZnVuY3Rpb24gb24gV2ViQXBwIHdoaWNoXG4vLyBjb252ZXJ0cyBhIEV4cHJlc3MgYHJlcWAgdG8gYSBNZXRlb3IgYHJlcXVlc3RgLiBUaGlzIGNhbiBnbyBhd2F5IG9uY2Ugc21hcnRcbi8vIHBhY2thZ2VzIHN1Y2ggYXMgYXBwY2FjaGUgYXJlIGJlaW5nIHBhc3NlZCBhIGByZXF1ZXN0YCBvYmplY3QgZGlyZWN0bHkgd2hlblxuLy8gdGhleSBzZXJ2ZSBjb250ZW50LlxuLy9cbi8vIFRoaXMgYWxsb3dzIGByZXF1ZXN0YCB0byBiZSB1c2VkIHVuaWZvcm1seTogaXQgaXMgcGFzc2VkIHRvIHRoZSBodG1sXG4vLyBhdHRyaWJ1dGVzIGhvb2ssIGFuZCB0aGUgYXBwY2FjaGUgcGFja2FnZSBjYW4gdXNlIGl0IHdoZW4gZGVjaWRpbmdcbi8vIHdoZXRoZXIgdG8gZ2VuZXJhdGUgYSA0MDQgZm9yIHRoZSBtYW5pZmVzdC5cbi8vXG4vLyBSZWFsIHJvdXRpbmcgLyBzZXJ2ZXIgc2lkZSByZW5kZXJpbmcgd2lsbCBwcm9iYWJseSByZWZhY3RvciB0aGlzXG4vLyBoZWF2aWx5LlxuXG4vLyBlLmcuIFwiTW9iaWxlIFNhZmFyaVwiID0+IFwibW9iaWxlU2FmYXJpXCJcbnZhciBjYW1lbENhc2UgPSBmdW5jdGlvbihuYW1lKSB7XG4gIHZhciBwYXJ0cyA9IG5hbWUuc3BsaXQoJyAnKTtcbiAgcGFydHNbMF0gPSBwYXJ0c1swXS50b0xvd2VyQ2FzZSgpO1xuICBmb3IgKHZhciBpID0gMTsgaSA8IHBhcnRzLmxlbmd0aDsgKytpKSB7XG4gICAgcGFydHNbaV0gPSBwYXJ0c1tpXS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHBhcnRzW2ldLnN1YnN0cmluZygxKTtcbiAgfVxuICByZXR1cm4gcGFydHMuam9pbignJyk7XG59O1xuXG52YXIgaWRlbnRpZnlCcm93c2VyID0gZnVuY3Rpb24odXNlckFnZW50U3RyaW5nKSB7XG4gIGlmICghdXNlckFnZW50U3RyaW5nKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG5hbWU6ICd1bmtub3duJyxcbiAgICAgIG1ham9yOiAwLFxuICAgICAgbWlub3I6IDAsXG4gICAgICBwYXRjaDogMFxuICAgIH07XG4gIH1cbiAgdmFyIHVzZXJBZ2VudCA9IGxvb2t1cFVzZXJBZ2VudCh1c2VyQWdlbnRTdHJpbmcpO1xuICByZXR1cm4ge1xuICAgIG5hbWU6IGNhbWVsQ2FzZSh1c2VyQWdlbnQuZmFtaWx5KSxcbiAgICBtYWpvcjogK3VzZXJBZ2VudC5tYWpvcixcbiAgICBtaW5vcjogK3VzZXJBZ2VudC5taW5vcixcbiAgICBwYXRjaDogK3VzZXJBZ2VudC5wYXRjaCxcbiAgfTtcbn07XG5cbi8vIFhYWCBSZWZhY3RvciBhcyBwYXJ0IG9mIGltcGxlbWVudGluZyByZWFsIHJvdXRpbmcuXG5XZWJBcHBJbnRlcm5hbHMuaWRlbnRpZnlCcm93c2VyID0gaWRlbnRpZnlCcm93c2VyO1xuXG5XZWJBcHAuY2F0ZWdvcml6ZVJlcXVlc3QgPSBmdW5jdGlvbihyZXEpIHtcbiAgaWYgKHJlcS5icm93c2VyICYmIHJlcS5hcmNoICYmIHR5cGVvZiByZXEubW9kZXJuID09PSAnYm9vbGVhbicpIHtcbiAgICAvLyBBbHJlYWR5IGNhdGVnb3JpemVkLlxuICAgIHJldHVybiByZXE7XG4gIH1cblxuICBjb25zdCBicm93c2VyID0gaWRlbnRpZnlCcm93c2VyKHJlcS5oZWFkZXJzWyd1c2VyLWFnZW50J10pO1xuICBjb25zdCBtb2Rlcm4gPSBpc01vZGVybihicm93c2VyKTtcbiAgY29uc3QgcGF0aCA9XG4gICAgdHlwZW9mIHJlcS5wYXRobmFtZSA9PT0gJ3N0cmluZydcbiAgICAgID8gcmVxLnBhdGhuYW1lXG4gICAgICA6IHBhcnNlUmVxdWVzdChyZXEpLnBhdGhuYW1lO1xuXG4gIGNvbnN0IGNhdGVnb3JpemVkID0ge1xuICAgIGJyb3dzZXIsXG4gICAgbW9kZXJuLFxuICAgIHBhdGgsXG4gICAgYXJjaDogV2ViQXBwLmRlZmF1bHRBcmNoLFxuICAgIHVybDogcGFyc2VVcmwocmVxLnVybCwgdHJ1ZSksXG4gICAgZHluYW1pY0hlYWQ6IHJlcS5keW5hbWljSGVhZCxcbiAgICBkeW5hbWljQm9keTogcmVxLmR5bmFtaWNCb2R5LFxuICAgIGhlYWRlcnM6IHJlcS5oZWFkZXJzLFxuICAgIGNvb2tpZXM6IHJlcS5jb29raWVzLFxuICB9O1xuXG4gIGNvbnN0IHBhdGhQYXJ0cyA9IHBhdGguc3BsaXQoJy8nKTtcbiAgY29uc3QgYXJjaEtleSA9IHBhdGhQYXJ0c1sxXTtcblxuICBpZiAoYXJjaEtleS5zdGFydHNXaXRoKCdfXycpKSB7XG4gICAgY29uc3QgYXJjaENsZWFuZWQgPSAnd2ViLicgKyBhcmNoS2V5LnNsaWNlKDIpO1xuICAgIGlmIChoYXNPd24uY2FsbChXZWJBcHAuY2xpZW50UHJvZ3JhbXMsIGFyY2hDbGVhbmVkKSkge1xuICAgICAgcGF0aFBhcnRzLnNwbGljZSgxLCAxKTsgLy8gUmVtb3ZlIHRoZSBhcmNoS2V5IHBhcnQuXG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbihjYXRlZ29yaXplZCwge1xuICAgICAgICBhcmNoOiBhcmNoQ2xlYW5lZCxcbiAgICAgICAgcGF0aDogcGF0aFBhcnRzLmpvaW4oJy8nKSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIC8vIFRPRE8gUGVyaGFwcyBvbmUgZGF5IHdlIGNvdWxkIGluZmVyIENvcmRvdmEgY2xpZW50cyBoZXJlLCBzbyB0aGF0IHdlXG4gIC8vIHdvdWxkbid0IGhhdmUgdG8gdXNlIHByZWZpeGVkIFwiL19fY29yZG92YS8uLi5cIiBVUkxzLlxuICBjb25zdCBwcmVmZXJyZWRBcmNoT3JkZXIgPSBpc01vZGVybihicm93c2VyKVxuICAgID8gWyd3ZWIuYnJvd3NlcicsICd3ZWIuYnJvd3Nlci5sZWdhY3knXVxuICAgIDogWyd3ZWIuYnJvd3Nlci5sZWdhY3knLCAnd2ViLmJyb3dzZXInXTtcblxuICBmb3IgKGNvbnN0IGFyY2ggb2YgcHJlZmVycmVkQXJjaE9yZGVyKSB7XG4gICAgLy8gSWYgb3VyIHByZWZlcnJlZCBhcmNoIGlzIG5vdCBhdmFpbGFibGUsIGl0J3MgYmV0dGVyIHRvIHVzZSBhbm90aGVyXG4gICAgLy8gY2xpZW50IGFyY2ggdGhhdCBpcyBhdmFpbGFibGUgdGhhbiB0byBndWFyYW50ZWUgdGhlIHNpdGUgd29uJ3Qgd29ya1xuICAgIC8vIGJ5IHJldHVybmluZyBhbiB1bmtub3duIGFyY2guIEZvciBleGFtcGxlLCBpZiB3ZWIuYnJvd3Nlci5sZWdhY3kgaXNcbiAgICAvLyBleGNsdWRlZCB1c2luZyB0aGUgLS1leGNsdWRlLWFyY2hzIGNvbW1hbmQtbGluZSBvcHRpb24sIGxlZ2FjeVxuICAgIC8vIGNsaWVudHMgYXJlIGJldHRlciBvZmYgcmVjZWl2aW5nIHdlYi5icm93c2VyICh3aGljaCBtaWdodCBhY3R1YWxseVxuICAgIC8vIHdvcmspIHRoYW4gcmVjZWl2aW5nIGFuIEhUVFAgNDA0IHJlc3BvbnNlLiBJZiBub25lIG9mIHRoZSBhcmNocyBpblxuICAgIC8vIHByZWZlcnJlZEFyY2hPcmRlciBhcmUgZGVmaW5lZCwgb25seSB0aGVuIHNob3VsZCB3ZSBzZW5kIGEgNDA0LlxuICAgIGlmIChoYXNPd24uY2FsbChXZWJBcHAuY2xpZW50UHJvZ3JhbXMsIGFyY2gpKSB7XG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbihjYXRlZ29yaXplZCwgeyBhcmNoIH0pO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBjYXRlZ29yaXplZDtcbn07XG5cbi8vIEhUTUwgYXR0cmlidXRlIGhvb2tzOiBmdW5jdGlvbnMgdG8gYmUgY2FsbGVkIHRvIGRldGVybWluZSBhbnkgYXR0cmlidXRlcyB0b1xuLy8gYmUgYWRkZWQgdG8gdGhlICc8aHRtbD4nIHRhZy4gRWFjaCBmdW5jdGlvbiBpcyBwYXNzZWQgYSAncmVxdWVzdCcgb2JqZWN0IChzZWVcbi8vICNCcm93c2VySWRlbnRpZmljYXRpb24pIGFuZCBzaG91bGQgcmV0dXJuIG51bGwgb3Igb2JqZWN0LlxudmFyIGh0bWxBdHRyaWJ1dGVIb29rcyA9IFtdO1xudmFyIGdldEh0bWxBdHRyaWJ1dGVzID0gZnVuY3Rpb24ocmVxdWVzdCkge1xuICB2YXIgY29tYmluZWRBdHRyaWJ1dGVzID0ge307XG4gIChodG1sQXR0cmlidXRlSG9va3MgfHwgW10pLmZvckVhY2goZnVuY3Rpb24oaG9vaykge1xuICAgIHZhciBhdHRyaWJ1dGVzID0gaG9vayhyZXF1ZXN0KTtcbiAgICBpZiAoYXR0cmlidXRlcyA9PT0gbnVsbCkgcmV0dXJuO1xuICAgIGlmICh0eXBlb2YgYXR0cmlidXRlcyAhPT0gJ29iamVjdCcpXG4gICAgICB0aHJvdyBFcnJvcignSFRNTCBhdHRyaWJ1dGUgaG9vayBtdXN0IHJldHVybiBudWxsIG9yIG9iamVjdCcpO1xuICAgIE9iamVjdC5hc3NpZ24oY29tYmluZWRBdHRyaWJ1dGVzLCBhdHRyaWJ1dGVzKTtcbiAgfSk7XG4gIHJldHVybiBjb21iaW5lZEF0dHJpYnV0ZXM7XG59O1xuV2ViQXBwLmFkZEh0bWxBdHRyaWJ1dGVIb29rID0gZnVuY3Rpb24oaG9vaykge1xuICBodG1sQXR0cmlidXRlSG9va3MucHVzaChob29rKTtcbn07XG5cbi8vIFNlcnZlIGFwcCBIVE1MIGZvciB0aGlzIFVSTD9cbnZhciBhcHBVcmwgPSBmdW5jdGlvbih1cmwpIHtcbiAgaWYgKHVybCA9PT0gJy9mYXZpY29uLmljbycgfHwgdXJsID09PSAnL3JvYm90cy50eHQnKSByZXR1cm4gZmFsc2U7XG5cbiAgLy8gTk9URTogYXBwLm1hbmlmZXN0IGlzIG5vdCBhIHdlYiBzdGFuZGFyZCBsaWtlIGZhdmljb24uaWNvIGFuZFxuICAvLyByb2JvdHMudHh0LiBJdCBpcyBhIGZpbGUgbmFtZSB3ZSBoYXZlIGNob3NlbiB0byB1c2UgZm9yIEhUTUw1XG4gIC8vIGFwcGNhY2hlIFVSTHMuIEl0IGlzIGluY2x1ZGVkIGhlcmUgdG8gcHJldmVudCB1c2luZyBhbiBhcHBjYWNoZVxuICAvLyB0aGVuIHJlbW92aW5nIGl0IGZyb20gcG9pc29uaW5nIGFuIGFwcCBwZXJtYW5lbnRseS4gRXZlbnR1YWxseSxcbiAgLy8gb25jZSB3ZSBoYXZlIHNlcnZlciBzaWRlIHJvdXRpbmcsIHRoaXMgd29uJ3QgYmUgbmVlZGVkIGFzXG4gIC8vIHVua25vd24gVVJMcyB3aXRoIHJldHVybiBhIDQwNCBhdXRvbWF0aWNhbGx5LlxuICBpZiAodXJsID09PSAnL2FwcC5tYW5pZmVzdCcpIHJldHVybiBmYWxzZTtcblxuICAvLyBBdm9pZCBzZXJ2aW5nIGFwcCBIVE1MIGZvciBkZWNsYXJlZCByb3V0ZXMgc3VjaCBhcyAvc29ja2pzLy5cbiAgaWYgKFJvdXRlUG9saWN5LmNsYXNzaWZ5KHVybCkpIHJldHVybiBmYWxzZTtcblxuICAvLyB3ZSBjdXJyZW50bHkgcmV0dXJuIGFwcCBIVE1MIG9uIGFsbCBVUkxzIGJ5IGRlZmF1bHRcbiAgcmV0dXJuIHRydWU7XG59O1xuXG4vLyBXZSBuZWVkIHRvIGNhbGN1bGF0ZSB0aGUgY2xpZW50IGhhc2ggYWZ0ZXIgYWxsIHBhY2thZ2VzIGhhdmUgbG9hZGVkXG4vLyB0byBnaXZlIHRoZW0gYSBjaGFuY2UgdG8gcG9wdWxhdGUgX19tZXRlb3JfcnVudGltZV9jb25maWdfXy5cbi8vXG4vLyBDYWxjdWxhdGluZyB0aGUgaGFzaCBkdXJpbmcgc3RhcnR1cCBtZWFucyB0aGF0IHBhY2thZ2VzIGNhbiBvbmx5XG4vLyBwb3B1bGF0ZSBfX21ldGVvcl9ydW50aW1lX2NvbmZpZ19fIGR1cmluZyBsb2FkLCBub3QgZHVyaW5nIHN0YXJ0dXAuXG4vL1xuLy8gQ2FsY3VsYXRpbmcgaW5zdGVhZCBpdCBhdCB0aGUgYmVnaW5uaW5nIG9mIG1haW4gYWZ0ZXIgYWxsIHN0YXJ0dXBcbi8vIGhvb2tzIGhhZCBydW4gd291bGQgYWxsb3cgcGFja2FnZXMgdG8gYWxzbyBwb3B1bGF0ZVxuLy8gX19tZXRlb3JfcnVudGltZV9jb25maWdfXyBkdXJpbmcgc3RhcnR1cCwgYnV0IHRoYXQncyB0b28gbGF0ZSBmb3Jcbi8vIGF1dG91cGRhdGUgYmVjYXVzZSBpdCBuZWVkcyB0byBoYXZlIHRoZSBjbGllbnQgaGFzaCBhdCBzdGFydHVwIHRvXG4vLyBpbnNlcnQgdGhlIGF1dG8gdXBkYXRlIHZlcnNpb24gaXRzZWxmIGludG9cbi8vIF9fbWV0ZW9yX3J1bnRpbWVfY29uZmlnX18gdG8gZ2V0IGl0IHRvIHRoZSBjbGllbnQuXG4vL1xuLy8gQW4gYWx0ZXJuYXRpdmUgd291bGQgYmUgdG8gZ2l2ZSBhdXRvdXBkYXRlIGEgXCJwb3N0LXN0YXJ0LFxuLy8gcHJlLWxpc3RlblwiIGhvb2sgdG8gYWxsb3cgaXQgdG8gaW5zZXJ0IHRoZSBhdXRvIHVwZGF0ZSB2ZXJzaW9uIGF0XG4vLyB0aGUgcmlnaHQgbW9tZW50LlxuXG5NZXRlb3Iuc3RhcnR1cChmdW5jdGlvbigpIHtcbiAgZnVuY3Rpb24gZ2V0dGVyKGtleSkge1xuICAgIHJldHVybiBmdW5jdGlvbihhcmNoKSB7XG4gICAgICBhcmNoID0gYXJjaCB8fCBXZWJBcHAuZGVmYXVsdEFyY2g7XG4gICAgICBjb25zdCBwcm9ncmFtID0gV2ViQXBwLmNsaWVudFByb2dyYW1zW2FyY2hdO1xuICAgICAgY29uc3QgdmFsdWUgPSBwcm9ncmFtICYmIHByb2dyYW1ba2V5XTtcbiAgICAgIC8vIElmIHRoaXMgaXMgdGhlIGZpcnN0IHRpbWUgd2UgaGF2ZSBjYWxjdWxhdGVkIHRoaXMgaGFzaCxcbiAgICAgIC8vIHByb2dyYW1ba2V5XSB3aWxsIGJlIGEgdGh1bmsgKGxhenkgZnVuY3Rpb24gd2l0aCBubyBwYXJhbWV0ZXJzKVxuICAgICAgLy8gdGhhdCB3ZSBzaG91bGQgY2FsbCB0byBkbyB0aGUgYWN0dWFsIGNvbXB1dGF0aW9uLlxuICAgICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJyA/IChwcm9ncmFtW2tleV0gPSB2YWx1ZSgpKSA6IHZhbHVlO1xuICAgIH07XG4gIH1cblxuICBXZWJBcHAuY2FsY3VsYXRlQ2xpZW50SGFzaCA9IFdlYkFwcC5jbGllbnRIYXNoID0gZ2V0dGVyKCd2ZXJzaW9uJyk7XG4gIFdlYkFwcC5jYWxjdWxhdGVDbGllbnRIYXNoUmVmcmVzaGFibGUgPSBnZXR0ZXIoJ3ZlcnNpb25SZWZyZXNoYWJsZScpO1xuICBXZWJBcHAuY2FsY3VsYXRlQ2xpZW50SGFzaE5vblJlZnJlc2hhYmxlID0gZ2V0dGVyKCd2ZXJzaW9uTm9uUmVmcmVzaGFibGUnKTtcbiAgV2ViQXBwLmNhbGN1bGF0ZUNsaWVudEhhc2hSZXBsYWNlYWJsZSA9IGdldHRlcigndmVyc2lvblJlcGxhY2VhYmxlJyk7XG4gIFdlYkFwcC5nZXRSZWZyZXNoYWJsZUFzc2V0cyA9IGdldHRlcigncmVmcmVzaGFibGVBc3NldHMnKTtcbn0pO1xuXG4vLyBXaGVuIHdlIGhhdmUgYSByZXF1ZXN0IHBlbmRpbmcsIHdlIHdhbnQgdGhlIHNvY2tldCB0aW1lb3V0IHRvIGJlIGxvbmcsIHRvXG4vLyBnaXZlIG91cnNlbHZlcyBhIHdoaWxlIHRvIHNlcnZlIGl0LCBhbmQgdG8gYWxsb3cgc29ja2pzIGxvbmcgcG9sbHMgdG9cbi8vIGNvbXBsZXRlLiAgT24gdGhlIG90aGVyIGhhbmQsIHdlIHdhbnQgdG8gY2xvc2UgaWRsZSBzb2NrZXRzIHJlbGF0aXZlbHlcbi8vIHF1aWNrbHksIHNvIHRoYXQgd2UgY2FuIHNodXQgZG93biByZWxhdGl2ZWx5IHByb21wdGx5IGJ1dCBjbGVhbmx5LCB3aXRob3V0XG4vLyBjdXR0aW5nIG9mZiBhbnlvbmUncyByZXNwb25zZS5cbldlYkFwcC5fdGltZW91dEFkanVzdG1lbnRSZXF1ZXN0Q2FsbGJhY2sgPSBmdW5jdGlvbihyZXEsIHJlcykge1xuICAvLyB0aGlzIGlzIHJlYWxseSBqdXN0IHJlcS5zb2NrZXQuc2V0VGltZW91dChMT05HX1NPQ0tFVF9USU1FT1VUKTtcbiAgcmVxLnNldFRpbWVvdXQoTE9OR19TT0NLRVRfVElNRU9VVCk7XG4gIC8vIEluc2VydCBvdXIgbmV3IGZpbmlzaCBsaXN0ZW5lciB0byBydW4gQkVGT1JFIHRoZSBleGlzdGluZyBvbmUgd2hpY2ggcmVtb3Zlc1xuICAvLyB0aGUgcmVzcG9uc2UgZnJvbSB0aGUgc29ja2V0LlxuICB2YXIgZmluaXNoTGlzdGVuZXJzID0gcmVzLmxpc3RlbmVycygnZmluaXNoJyk7XG4gIC8vIFhYWCBBcHBhcmVudGx5IGluIE5vZGUgMC4xMiB0aGlzIGV2ZW50IHdhcyBjYWxsZWQgJ3ByZWZpbmlzaCcuXG4gIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9qb3llbnQvbm9kZS9jb21taXQvN2M5YjYwNzBcbiAgLy8gQnV0IGl0IGhhcyBzd2l0Y2hlZCBiYWNrIHRvICdmaW5pc2gnIGluIE5vZGUgdjQ6XG4gIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9wdWxsLzE0MTFcbiAgcmVzLnJlbW92ZUFsbExpc3RlbmVycygnZmluaXNoJyk7XG4gIHJlcy5vbignZmluaXNoJywgZnVuY3Rpb24oKSB7XG4gICAgcmVzLnNldFRpbWVvdXQoU0hPUlRfU09DS0VUX1RJTUVPVVQpO1xuICB9KTtcbiAgT2JqZWN0LnZhbHVlcyhmaW5pc2hMaXN0ZW5lcnMpLmZvckVhY2goZnVuY3Rpb24obCkge1xuICAgIHJlcy5vbignZmluaXNoJywgbCk7XG4gIH0pO1xufTtcblxuLy8gV2lsbCBiZSB1cGRhdGVkIGJ5IG1haW4gYmVmb3JlIHdlIGxpc3Rlbi5cbi8vIE1hcCBmcm9tIGNsaWVudCBhcmNoIHRvIGJvaWxlcnBsYXRlIG9iamVjdC5cbi8vIEJvaWxlcnBsYXRlIG9iamVjdCBoYXM6XG4vLyAgIC0gZnVuYzogWFhYXG4vLyAgIC0gYmFzZURhdGE6IFhYWFxudmFyIGJvaWxlcnBsYXRlQnlBcmNoID0ge307XG5cbi8vIFJlZ2lzdGVyIGEgY2FsbGJhY2sgZnVuY3Rpb24gdGhhdCBjYW4gc2VsZWN0aXZlbHkgbW9kaWZ5IGJvaWxlcnBsYXRlXG4vLyBkYXRhIGdpdmVuIGFyZ3VtZW50cyAocmVxdWVzdCwgZGF0YSwgYXJjaCkuIFRoZSBrZXkgc2hvdWxkIGJlIGEgdW5pcXVlXG4vLyBpZGVudGlmaWVyLCB0byBwcmV2ZW50IGFjY3VtdWxhdGluZyBkdXBsaWNhdGUgY2FsbGJhY2tzIGZyb20gdGhlIHNhbWVcbi8vIGNhbGwgc2l0ZSBvdmVyIHRpbWUuIENhbGxiYWNrcyB3aWxsIGJlIGNhbGxlZCBpbiB0aGUgb3JkZXIgdGhleSB3ZXJlXG4vLyByZWdpc3RlcmVkLiBBIGNhbGxiYWNrIHNob3VsZCByZXR1cm4gZmFsc2UgaWYgaXQgZGlkIG5vdCBtYWtlIGFueVxuLy8gY2hhbmdlcyBhZmZlY3RpbmcgdGhlIGJvaWxlcnBsYXRlLiBQYXNzaW5nIG51bGwgZGVsZXRlcyB0aGUgY2FsbGJhY2suXG4vLyBBbnkgcHJldmlvdXMgY2FsbGJhY2sgcmVnaXN0ZXJlZCBmb3IgdGhpcyBrZXkgd2lsbCBiZSByZXR1cm5lZC5cbmNvbnN0IGJvaWxlcnBsYXRlRGF0YUNhbGxiYWNrcyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5XZWJBcHBJbnRlcm5hbHMucmVnaXN0ZXJCb2lsZXJwbGF0ZURhdGFDYWxsYmFjayA9IGZ1bmN0aW9uKGtleSwgY2FsbGJhY2spIHtcbiAgY29uc3QgcHJldmlvdXNDYWxsYmFjayA9IGJvaWxlcnBsYXRlRGF0YUNhbGxiYWNrc1trZXldO1xuXG4gIGlmICh0eXBlb2YgY2FsbGJhY2sgPT09ICdmdW5jdGlvbicpIHtcbiAgICBib2lsZXJwbGF0ZURhdGFDYWxsYmFja3Nba2V5XSA9IGNhbGxiYWNrO1xuICB9IGVsc2Uge1xuICAgIGFzc2VydC5zdHJpY3RFcXVhbChjYWxsYmFjaywgbnVsbCk7XG4gICAgZGVsZXRlIGJvaWxlcnBsYXRlRGF0YUNhbGxiYWNrc1trZXldO1xuICB9XG5cbiAgLy8gUmV0dXJuIHRoZSBwcmV2aW91cyBjYWxsYmFjayBpbiBjYXNlIHRoZSBuZXcgY2FsbGJhY2sgbmVlZHMgdG8gY2FsbFxuICAvLyBpdDsgZm9yIGV4YW1wbGUsIHdoZW4gdGhlIG5ldyBjYWxsYmFjayBpcyBhIHdyYXBwZXIgZm9yIHRoZSBvbGQuXG4gIHJldHVybiBwcmV2aW91c0NhbGxiYWNrIHx8IG51bGw7XG59O1xuXG4vLyBHaXZlbiBhIHJlcXVlc3QgKGFzIHJldHVybmVkIGZyb20gYGNhdGVnb3JpemVSZXF1ZXN0YCksIHJldHVybiB0aGVcbi8vIGJvaWxlcnBsYXRlIEhUTUwgdG8gc2VydmUgZm9yIHRoYXQgcmVxdWVzdC5cbi8vXG4vLyBJZiBhIHByZXZpb3VzIEV4cHJlc3MgbWlkZGxld2FyZSBoYXMgcmVuZGVyZWQgY29udGVudCBmb3IgdGhlIGhlYWQgb3IgYm9keSxcbi8vIHJldHVybnMgdGhlIGJvaWxlcnBsYXRlIHdpdGggdGhhdCBjb250ZW50IHBhdGNoZWQgaW4gb3RoZXJ3aXNlXG4vLyBtZW1vaXplcyBvbiBIVE1MIGF0dHJpYnV0ZXMgKHVzZWQgYnksIGVnLCBhcHBjYWNoZSkgYW5kIHdoZXRoZXIgaW5saW5lXG4vLyBzY3JpcHRzIGFyZSBjdXJyZW50bHkgYWxsb3dlZC5cbi8vIFhYWCBzbyBmYXIgdGhpcyBmdW5jdGlvbiBpcyBhbHdheXMgY2FsbGVkIHdpdGggYXJjaCA9PT0gJ3dlYi5icm93c2VyJ1xuZnVuY3Rpb24gZ2V0Qm9pbGVycGxhdGUocmVxdWVzdCwgYXJjaCkge1xuICByZXR1cm4gZ2V0Qm9pbGVycGxhdGVBc3luYyhyZXF1ZXN0LCBhcmNoKTtcbn1cblxuLyoqXG4gKiBAc3VtbWFyeSBUYWtlcyBhIHJ1bnRpbWUgY29uZmlndXJhdGlvbiBvYmplY3QgYW5kXG4gKiByZXR1cm5zIGFuIGVuY29kZWQgcnVudGltZSBzdHJpbmcuXG4gKiBAbG9jdXMgU2VydmVyXG4gKiBAcGFyYW0ge09iamVjdH0gcnRpbWVDb25maWdcbiAqIEByZXR1cm5zIHtTdHJpbmd9XG4gKi9cbldlYkFwcC5lbmNvZGVSdW50aW1lQ29uZmlnID0gZnVuY3Rpb24ocnRpbWVDb25maWcpIHtcbiAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeShydGltZUNvbmZpZykpKTtcbn07XG5cbi8qKlxuICogQHN1bW1hcnkgVGFrZXMgYW4gZW5jb2RlZCBydW50aW1lIHN0cmluZyBhbmQgcmV0dXJuc1xuICogYSBydW50aW1lIGNvbmZpZ3VyYXRpb24gb2JqZWN0LlxuICogQGxvY3VzIFNlcnZlclxuICogQHBhcmFtIHtTdHJpbmd9IHJ0aW1lQ29uZmlnU3RyaW5nXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxuICovXG5XZWJBcHAuZGVjb2RlUnVudGltZUNvbmZpZyA9IGZ1bmN0aW9uKHJ0aW1lQ29uZmlnU3RyKSB7XG4gIHJldHVybiBKU09OLnBhcnNlKGRlY29kZVVSSUNvbXBvbmVudChKU09OLnBhcnNlKHJ0aW1lQ29uZmlnU3RyKSkpO1xufTtcblxuY29uc3QgcnVudGltZUNvbmZpZyA9IHtcbiAgLy8gaG9va3Mgd2lsbCBjb250YWluIHRoZSBjYWxsYmFjayBmdW5jdGlvbnNcbiAgLy8gc2V0IGJ5IHRoZSBjYWxsZXIgdG8gYWRkUnVudGltZUNvbmZpZ0hvb2tcbiAgaG9va3M6IG5ldyBIb29rKCksXG4gIC8vIHVwZGF0ZUhvb2tzIHdpbGwgY29udGFpbiB0aGUgY2FsbGJhY2sgZnVuY3Rpb25zXG4gIC8vIHNldCBieSB0aGUgY2FsbGVyIHRvIGFkZFVwZGF0ZWROb3RpZnlIb29rXG4gIHVwZGF0ZUhvb2tzOiBuZXcgSG9vaygpLFxuICAvLyBpc1VwZGF0ZWRCeUFyY2ggaXMgYW4gb2JqZWN0IGNvbnRhaW5pbmcgZmllbGRzIGZvciBlYWNoIGFyY2hcbiAgLy8gdGhhdCB0aGlzIHNlcnZlciBzdXBwb3J0cy5cbiAgLy8gLSBFYWNoIGZpZWxkIHdpbGwgYmUgdHJ1ZSB3aGVuIHRoZSBzZXJ2ZXIgdXBkYXRlcyB0aGUgcnVudGltZUNvbmZpZyBmb3IgdGhhdCBhcmNoLlxuICAvLyAtIFdoZW4gdGhlIGhvb2sgY2FsbGJhY2sgaXMgY2FsbGVkIHRoZSB1cGRhdGUgZmllbGQgaW4gdGhlIGNhbGxiYWNrIG9iamVjdCB3aWxsIGJlXG4gIC8vIHNldCB0byBpc1VwZGF0ZWRCeUFyY2hbYXJjaF0uXG4gIC8vID0gaXNVcGRhdGVkeUJ5QXJjaFthcmNoXSBpcyByZXNldCB0byBmYWxzZSBhZnRlciB0aGUgY2FsbGJhY2suXG4gIC8vIFRoaXMgZW5hYmxlcyB0aGUgY2FsbGVyIHRvIGNhY2hlIGRhdGEgZWZmaWNpZW50bHkgc28gdGhleSBkbyBub3QgbmVlZCB0b1xuICAvLyBkZWNvZGUgJiB1cGRhdGUgZGF0YSBvbiBldmVyeSBjYWxsYmFjayB3aGVuIHRoZSBydW50aW1lQ29uZmlnIGlzIG5vdCBjaGFuZ2luZy5cbiAgaXNVcGRhdGVkQnlBcmNoOiB7fSxcbn07XG5cbi8qKlxuICogQG5hbWUgYWRkUnVudGltZUNvbmZpZ0hvb2tDYWxsYmFjayhvcHRpb25zKVxuICogQGxvY3VzIFNlcnZlclxuICogQGlzcHJvdG90eXBlIHRydWVcbiAqIEBzdW1tYXJ5IENhbGxiYWNrIGZvciBgYWRkUnVudGltZUNvbmZpZ0hvb2tgLlxuICpcbiAqIElmIHRoZSBoYW5kbGVyIHJldHVybnMgYSBfZmFsc3lfIHZhbHVlIHRoZSBob29rIHdpbGwgbm90XG4gKiBtb2RpZnkgdGhlIHJ1bnRpbWUgY29uZmlndXJhdGlvbi5cbiAqXG4gKiBJZiB0aGUgaGFuZGxlciByZXR1cm5zIGEgX1N0cmluZ18gdGhlIGhvb2sgd2lsbCBzdWJzdGl0dXRlXG4gKiB0aGUgc3RyaW5nIGZvciB0aGUgZW5jb2RlZCBjb25maWd1cmF0aW9uIHN0cmluZy5cbiAqXG4gKiAqKldhcm5pbmc6KiogdGhlIGhvb2sgZG9lcyBub3QgY2hlY2sgdGhlIHJldHVybiB2YWx1ZSBhdCBhbGwgaXQgaXNcbiAqIHRoZSByZXNwb25zaWJpbGl0eSBvZiB0aGUgY2FsbGVyIHRvIGdldCB0aGUgZm9ybWF0dGluZyBjb3JyZWN0IHVzaW5nXG4gKiB0aGUgaGVscGVyIGZ1bmN0aW9ucy5cbiAqXG4gKiBgYWRkUnVudGltZUNvbmZpZ0hvb2tDYWxsYmFja2AgdGFrZXMgb25seSBvbmUgYE9iamVjdGAgYXJndW1lbnRcbiAqIHdpdGggdGhlIGZvbGxvd2luZyBmaWVsZHM6XG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICogQHBhcmFtIHtTdHJpbmd9IG9wdGlvbnMuYXJjaCBUaGUgYXJjaGl0ZWN0dXJlIG9mIHRoZSBjbGllbnRcbiAqIHJlcXVlc3RpbmcgYSBuZXcgcnVudGltZSBjb25maWd1cmF0aW9uLiBUaGlzIGNhbiBiZSBvbmUgb2ZcbiAqIGB3ZWIuYnJvd3NlcmAsIGB3ZWIuYnJvd3Nlci5sZWdhY3lgIG9yIGB3ZWIuY29yZG92YWAuXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucy5yZXF1ZXN0XG4gKiBBIE5vZGVKcyBbSW5jb21pbmdNZXNzYWdlXShodHRwczovL25vZGVqcy5vcmcvYXBpL2h0dHAuaHRtbCNodHRwX2NsYXNzX2h0dHBfaW5jb21pbmdtZXNzYWdlKVxuICogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9odHRwLmh0bWwjaHR0cF9jbGFzc19odHRwX2luY29taW5nbWVzc2FnZVxuICogYE9iamVjdGAgdGhhdCBjYW4gYmUgdXNlZCB0byBnZXQgaW5mb3JtYXRpb24gYWJvdXQgdGhlIGluY29taW5nIHJlcXVlc3QuXG4gKiBAcGFyYW0ge1N0cmluZ30gb3B0aW9ucy5lbmNvZGVkQ3VycmVudENvbmZpZyBUaGUgY3VycmVudCBjb25maWd1cmF0aW9uIG9iamVjdFxuICogZW5jb2RlZCBhcyBhIHN0cmluZyBmb3IgaW5jbHVzaW9uIGluIHRoZSByb290IGh0bWwuXG4gKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMudXBkYXRlZCBgdHJ1ZWAgaWYgdGhlIGNvbmZpZyBmb3IgdGhpcyBhcmNoaXRlY3R1cmVcbiAqIGhhcyBiZWVuIHVwZGF0ZWQgc2luY2UgbGFzdCBjYWxsZWQsIG90aGVyd2lzZSBgZmFsc2VgLiBUaGlzIGZsYWcgY2FuIGJlIHVzZWRcbiAqIHRvIGNhY2hlIHRoZSBkZWNvZGluZy9lbmNvZGluZyBmb3IgZWFjaCBhcmNoaXRlY3R1cmUuXG4gKi9cblxuLyoqXG4gKiBAc3VtbWFyeSBIb29rIHRoYXQgY2FsbHMgYmFjayB3aGVuIHRoZSBtZXRlb3IgcnVudGltZSBjb25maWd1cmF0aW9uLFxuICogYF9fbWV0ZW9yX3J1bnRpbWVfY29uZmlnX19gIGlzIGJlaW5nIHNlbnQgdG8gYW55IGNsaWVudC5cbiAqXG4gKiAqKnJldHVybnMqKjogPHNtYWxsPl9PYmplY3RfPC9zbWFsbD4gYHsgc3RvcDogZnVuY3Rpb24sIGNhbGxiYWNrOiBmdW5jdGlvbiB9YFxuICogLSBgc3RvcGAgPHNtYWxsPl9GdW5jdGlvbl88L3NtYWxsPiBDYWxsIGBzdG9wKClgIHRvIHN0b3AgZ2V0dGluZyBjYWxsYmFja3MuXG4gKiAtIGBjYWxsYmFja2AgPHNtYWxsPl9GdW5jdGlvbl88L3NtYWxsPiBUaGUgcGFzc2VkIGluIGBjYWxsYmFja2AuXG4gKiBAbG9jdXMgU2VydmVyXG4gKiBAcGFyYW0ge2FkZFJ1bnRpbWVDb25maWdIb29rQ2FsbGJhY2t9IGNhbGxiYWNrXG4gKiBTZWUgYGFkZFJ1bnRpbWVDb25maWdIb29rQ2FsbGJhY2tgIGRlc2NyaXB0aW9uLlxuICogQHJldHVybnMge09iamVjdH0ge3sgc3RvcDogZnVuY3Rpb24sIGNhbGxiYWNrOiBmdW5jdGlvbiB9fVxuICogQ2FsbCB0aGUgcmV0dXJuZWQgYHN0b3AoKWAgdG8gc3RvcCBnZXR0aW5nIGNhbGxiYWNrcy5cbiAqIFRoZSBwYXNzZWQgaW4gYGNhbGxiYWNrYCBpcyByZXR1cm5lZCBhbHNvLlxuICovXG5XZWJBcHAuYWRkUnVudGltZUNvbmZpZ0hvb2sgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICByZXR1cm4gcnVudGltZUNvbmZpZy5ob29rcy5yZWdpc3RlcihjYWxsYmFjayk7XG59O1xuXG5hc3luYyBmdW5jdGlvbiBnZXRCb2lsZXJwbGF0ZUFzeW5jKHJlcXVlc3QsIGFyY2gpIHtcbiAgbGV0IGJvaWxlcnBsYXRlID0gYm9pbGVycGxhdGVCeUFyY2hbYXJjaF07XG4gIGF3YWl0IHJ1bnRpbWVDb25maWcuaG9va3MuZm9yRWFjaEFzeW5jKGFzeW5jIGhvb2sgPT4ge1xuICAgIGNvbnN0IG1ldGVvclJ1bnRpbWVDb25maWcgPSBhd2FpdCBob29rKHtcbiAgICAgIGFyY2gsXG4gICAgICByZXF1ZXN0LFxuICAgICAgZW5jb2RlZEN1cnJlbnRDb25maWc6IGJvaWxlcnBsYXRlLmJhc2VEYXRhLm1ldGVvclJ1bnRpbWVDb25maWcsXG4gICAgICB1cGRhdGVkOiBydW50aW1lQ29uZmlnLmlzVXBkYXRlZEJ5QXJjaFthcmNoXSxcbiAgICB9KTtcbiAgICBpZiAoIW1ldGVvclJ1bnRpbWVDb25maWcpIHJldHVybiB0cnVlO1xuICAgIGJvaWxlcnBsYXRlLmJhc2VEYXRhID0gT2JqZWN0LmFzc2lnbih7fSwgYm9pbGVycGxhdGUuYmFzZURhdGEsIHtcbiAgICAgIG1ldGVvclJ1bnRpbWVDb25maWcsXG4gICAgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0pO1xuICBydW50aW1lQ29uZmlnLmlzVXBkYXRlZEJ5QXJjaFthcmNoXSA9IGZhbHNlO1xuICBjb25zdCB7IGR5bmFtaWNIZWFkLCBkeW5hbWljQm9keSB9ID0gcmVxdWVzdDtcbiAgY29uc3QgZGF0YSA9IE9iamVjdC5hc3NpZ24oXG4gICAge30sXG4gICAgYm9pbGVycGxhdGUuYmFzZURhdGEsXG4gICAge1xuICAgICAgaHRtbEF0dHJpYnV0ZXM6IGdldEh0bWxBdHRyaWJ1dGVzKHJlcXVlc3QpLFxuICAgIH0sXG4gICAgeyBkeW5hbWljSGVhZCwgZHluYW1pY0JvZHkgfVxuICApO1xuXG4gIGxldCBtYWRlQ2hhbmdlcyA9IGZhbHNlO1xuICBsZXQgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXG4gIE9iamVjdC5rZXlzKGJvaWxlcnBsYXRlRGF0YUNhbGxiYWNrcykuZm9yRWFjaChrZXkgPT4ge1xuICAgIHByb21pc2UgPSBwcm9taXNlXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGNvbnN0IGNhbGxiYWNrID0gYm9pbGVycGxhdGVEYXRhQ2FsbGJhY2tzW2tleV07XG4gICAgICAgIHJldHVybiBjYWxsYmFjayhyZXF1ZXN0LCBkYXRhLCBhcmNoKTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAvLyBDYWxsYmFja3Mgc2hvdWxkIHJldHVybiBmYWxzZSBpZiB0aGV5IGRpZCBub3QgbWFrZSBhbnkgY2hhbmdlcy5cbiAgICAgICAgaWYgKHJlc3VsdCAhPT0gZmFsc2UpIHtcbiAgICAgICAgICBtYWRlQ2hhbmdlcyA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9KTtcblxuICByZXR1cm4gcHJvbWlzZS50aGVuKCgpID0+ICh7XG4gICAgc3RyZWFtOiBib2lsZXJwbGF0ZS50b0hUTUxTdHJlYW0oZGF0YSksXG4gICAgc3RhdHVzQ29kZTogZGF0YS5zdGF0dXNDb2RlLFxuICAgIGhlYWRlcnM6IGRhdGEuaGVhZGVycyxcbiAgfSkpO1xufVxuXG4vKipcbiAqIEBuYW1lIGFkZFVwZGF0ZWROb3RpZnlIb29rQ2FsbGJhY2sob3B0aW9ucylcbiAqIEBzdW1tYXJ5IGNhbGxiYWNrIGhhbmRsZXIgZm9yIGBhZGR1cGRhdGVkTm90aWZ5SG9va2BcbiAqIEBpc3Byb3RvdHlwZSB0cnVlXG4gKiBAbG9jdXMgU2VydmVyXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICogQHBhcmFtIHtTdHJpbmd9IG9wdGlvbnMuYXJjaCBUaGUgYXJjaGl0ZWN0dXJlIHRoYXQgaXMgYmVpbmcgdXBkYXRlZC5cbiAqIFRoaXMgY2FuIGJlIG9uZSBvZiBgd2ViLmJyb3dzZXJgLCBgd2ViLmJyb3dzZXIubGVnYWN5YCBvciBgd2ViLmNvcmRvdmFgLlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMubWFuaWZlc3QgVGhlIG5ldyB1cGRhdGVkIG1hbmlmZXN0IG9iamVjdCBmb3JcbiAqIHRoaXMgYGFyY2hgLlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMucnVudGltZUNvbmZpZyBUaGUgbmV3IHVwZGF0ZWQgY29uZmlndXJhdGlvblxuICogb2JqZWN0IGZvciB0aGlzIGBhcmNoYC5cbiAqL1xuXG4vKipcbiAqIEBzdW1tYXJ5IEhvb2sgdGhhdCBydW5zIHdoZW4gdGhlIG1ldGVvciBydW50aW1lIGNvbmZpZ3VyYXRpb25cbiAqIGlzIHVwZGF0ZWQuICBUeXBpY2FsbHkgdGhlIGNvbmZpZ3VyYXRpb24gb25seSBjaGFuZ2VzIGR1cmluZyBkZXZlbG9wbWVudCBtb2RlLlxuICogQGxvY3VzIFNlcnZlclxuICogQHBhcmFtIHthZGRVcGRhdGVkTm90aWZ5SG9va0NhbGxiYWNrfSBoYW5kbGVyXG4gKiBUaGUgYGhhbmRsZXJgIGlzIGNhbGxlZCBvbiBldmVyeSBjaGFuZ2UgdG8gYW4gYGFyY2hgIHJ1bnRpbWUgY29uZmlndXJhdGlvbi5cbiAqIFNlZSBgYWRkVXBkYXRlZE5vdGlmeUhvb2tDYWxsYmFja2AuXG4gKiBAcmV0dXJucyB7T2JqZWN0fSB7eyBzdG9wOiBmdW5jdGlvbiwgY2FsbGJhY2s6IGZ1bmN0aW9uIH19XG4gKi9cbldlYkFwcC5hZGRVcGRhdGVkTm90aWZ5SG9vayA9IGZ1bmN0aW9uKGhhbmRsZXIpIHtcbiAgcmV0dXJuIHJ1bnRpbWVDb25maWcudXBkYXRlSG9va3MucmVnaXN0ZXIoaGFuZGxlcik7XG59O1xuXG5XZWJBcHBJbnRlcm5hbHMuZ2VuZXJhdGVCb2lsZXJwbGF0ZUluc3RhbmNlID0gZnVuY3Rpb24oXG4gIGFyY2gsXG4gIG1hbmlmZXN0LFxuICBhZGRpdGlvbmFsT3B0aW9uc1xuKSB7XG4gIGFkZGl0aW9uYWxPcHRpb25zID0gYWRkaXRpb25hbE9wdGlvbnMgfHwge307XG5cbiAgcnVudGltZUNvbmZpZy5pc1VwZGF0ZWRCeUFyY2hbYXJjaF0gPSB0cnVlO1xuICBjb25zdCBydGltZUNvbmZpZyA9IHtcbiAgICAuLi5fX21ldGVvcl9ydW50aW1lX2NvbmZpZ19fLFxuICAgIC4uLihhZGRpdGlvbmFsT3B0aW9ucy5ydW50aW1lQ29uZmlnT3ZlcnJpZGVzIHx8IHt9KSxcbiAgfTtcbiAgcnVudGltZUNvbmZpZy51cGRhdGVIb29rcy5mb3JFYWNoKGNiID0+IHtcbiAgICBjYih7IGFyY2gsIG1hbmlmZXN0LCBydW50aW1lQ29uZmlnOiBydGltZUNvbmZpZyB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSk7XG5cbiAgY29uc3QgbWV0ZW9yUnVudGltZUNvbmZpZyA9IEpTT04uc3RyaW5naWZ5KFxuICAgIGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeShydGltZUNvbmZpZykpXG4gICk7XG5cbiAgcmV0dXJuIG5ldyBCb2lsZXJwbGF0ZShcbiAgICBhcmNoLFxuICAgIG1hbmlmZXN0LFxuICAgIE9iamVjdC5hc3NpZ24oXG4gICAgICB7XG4gICAgICAgIHBhdGhNYXBwZXIoaXRlbVBhdGgpIHtcbiAgICAgICAgICByZXR1cm4gcGF0aEpvaW4oYXJjaFBhdGhbYXJjaF0sIGl0ZW1QYXRoKTtcbiAgICAgICAgfSxcbiAgICAgICAgYmFzZURhdGFFeHRlbnNpb246IHtcbiAgICAgICAgICBhZGRpdGlvbmFsU3RhdGljSnM6IChPYmplY3QuZW50cmllcyhhZGRpdGlvbmFsU3RhdGljSnMpIHx8IFtdKS5tYXAoZnVuY3Rpb24oXG4gICAgICAgICAgICBbcGF0aG5hbWUsIGNvbnRlbnRzXVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgcGF0aG5hbWU6IHBhdGhuYW1lLFxuICAgICAgICAgICAgICBjb250ZW50czogY29udGVudHMsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH0pLFxuICAgICAgICAgIC8vIENvbnZlcnQgdG8gYSBKU09OIHN0cmluZywgdGhlbiBnZXQgcmlkIG9mIG1vc3Qgd2VpcmQgY2hhcmFjdGVycywgdGhlblxuICAgICAgICAgIC8vIHdyYXAgaW4gZG91YmxlIHF1b3Rlcy4gKFRoZSBvdXRlcm1vc3QgSlNPTi5zdHJpbmdpZnkgcmVhbGx5IG91Z2h0IHRvXG4gICAgICAgICAgLy8ganVzdCBiZSBcIndyYXAgaW4gZG91YmxlIHF1b3Rlc1wiIGJ1dCB3ZSB1c2UgaXQgdG8gYmUgc2FmZS4pIFRoaXMgbWlnaHRcbiAgICAgICAgICAvLyBlbmQgdXAgaW5zaWRlIGEgPHNjcmlwdD4gdGFnIHNvIHdlIG5lZWQgdG8gYmUgY2FyZWZ1bCB0byBub3QgaW5jbHVkZVxuICAgICAgICAgIC8vIFwiPC9zY3JpcHQ+XCIsIGJ1dCBub3JtYWwge3tzcGFjZWJhcnN9fSBlc2NhcGluZyBlc2NhcGVzIHRvbyBtdWNoISBTZWVcbiAgICAgICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9pc3N1ZXMvMzczMFxuICAgICAgICAgIG1ldGVvclJ1bnRpbWVDb25maWcsXG4gICAgICAgICAgbWV0ZW9yUnVudGltZUhhc2g6IHNoYTEobWV0ZW9yUnVudGltZUNvbmZpZyksXG4gICAgICAgICAgcm9vdFVybFBhdGhQcmVmaXg6XG4gICAgICAgICAgICBfX21ldGVvcl9ydW50aW1lX2NvbmZpZ19fLlJPT1RfVVJMX1BBVEhfUFJFRklYIHx8ICcnLFxuICAgICAgICAgIGJ1bmRsZWRKc0Nzc1VybFJld3JpdGVIb29rOiBidW5kbGVkSnNDc3NVcmxSZXdyaXRlSG9vayxcbiAgICAgICAgICBzcmlNb2RlOiBzcmlNb2RlLFxuICAgICAgICAgIGlubGluZVNjcmlwdHNBbGxvd2VkOiBXZWJBcHBJbnRlcm5hbHMuaW5saW5lU2NyaXB0c0FsbG93ZWQoKSxcbiAgICAgICAgICBpbmxpbmU6IGFkZGl0aW9uYWxPcHRpb25zLmlubGluZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBhZGRpdGlvbmFsT3B0aW9uc1xuICAgIClcbiAgKTtcbn07XG5cbi8vIEEgbWFwcGluZyBmcm9tIHVybCBwYXRoIHRvIGFyY2hpdGVjdHVyZSAoZS5nLiBcIndlYi5icm93c2VyXCIpIHRvIHN0YXRpY1xuLy8gZmlsZSBpbmZvcm1hdGlvbiB3aXRoIHRoZSBmb2xsb3dpbmcgZmllbGRzOlxuLy8gLSB0eXBlOiB0aGUgdHlwZSBvZiBmaWxlIHRvIGJlIHNlcnZlZFxuLy8gLSBjYWNoZWFibGU6IG9wdGlvbmFsbHksIHdoZXRoZXIgdGhlIGZpbGUgc2hvdWxkIGJlIGNhY2hlZCBvciBub3Rcbi8vIC0gc291cmNlTWFwVXJsOiBvcHRpb25hbGx5LCB0aGUgdXJsIG9mIHRoZSBzb3VyY2UgbWFwXG4vL1xuLy8gSW5mbyBhbHNvIGNvbnRhaW5zIG9uZSBvZiB0aGUgZm9sbG93aW5nOlxuLy8gLSBjb250ZW50OiB0aGUgc3RyaW5naWZpZWQgY29udGVudCB0aGF0IHNob3VsZCBiZSBzZXJ2ZWQgYXQgdGhpcyBwYXRoXG4vLyAtIGFic29sdXRlUGF0aDogdGhlIGFic29sdXRlIHBhdGggb24gZGlzayB0byB0aGUgZmlsZVxuXG4vLyBTZXJ2ZSBzdGF0aWMgZmlsZXMgZnJvbSB0aGUgbWFuaWZlc3Qgb3IgYWRkZWQgd2l0aFxuLy8gYGFkZFN0YXRpY0pzYC4gRXhwb3J0ZWQgZm9yIHRlc3RzLlxuV2ViQXBwSW50ZXJuYWxzLnN0YXRpY0ZpbGVzTWlkZGxld2FyZSA9IGFzeW5jIGZ1bmN0aW9uKFxuICBzdGF0aWNGaWxlc0J5QXJjaCxcbiAgcmVxLFxuICByZXMsXG4gIG5leHRcbikge1xuICB2YXIgcGF0aG5hbWUgPSBwYXJzZVJlcXVlc3QocmVxKS5wYXRobmFtZTtcbiAgdHJ5IHtcbiAgICBwYXRobmFtZSA9IGRlY29kZVVSSUNvbXBvbmVudChwYXRobmFtZSk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBuZXh0KCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIHNlcnZlU3RhdGljSnMgPSBmdW5jdGlvbihzKSB7XG4gICAgaWYgKFxuICAgICAgcmVxLm1ldGhvZCA9PT0gJ0dFVCcgfHxcbiAgICAgIHJlcS5tZXRob2QgPT09ICdIRUFEJyB8fFxuICAgICAgTWV0ZW9yLnNldHRpbmdzLnBhY2thZ2VzPy53ZWJhcHA/LmFsd2F5c1JldHVybkNvbnRlbnRcbiAgICApIHtcbiAgICAgIHJlcy53cml0ZUhlYWQoMjAwLCB7XG4gICAgICAgICdDb250ZW50LXR5cGUnOiAnYXBwbGljYXRpb24vamF2YXNjcmlwdDsgY2hhcnNldD1VVEYtOCcsXG4gICAgICAgICdDb250ZW50LUxlbmd0aCc6IEJ1ZmZlci5ieXRlTGVuZ3RoKHMpLFxuICAgICAgfSk7XG4gICAgICByZXMud3JpdGUocyk7XG4gICAgICByZXMuZW5kKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHN0YXR1cyA9IHJlcS5tZXRob2QgPT09ICdPUFRJT05TJyA/IDIwMCA6IDQwNTtcbiAgICAgIHJlcy53cml0ZUhlYWQoc3RhdHVzLCB7XG4gICAgICAgIEFsbG93OiAnT1BUSU9OUywgR0VULCBIRUFEJyxcbiAgICAgICAgJ0NvbnRlbnQtTGVuZ3RoJzogJzAnLFxuICAgICAgfSk7XG4gICAgICByZXMuZW5kKCk7XG4gICAgfVxuICB9O1xuXG4gIGlmIChcbiAgICBwYXRobmFtZSBpbiBhZGRpdGlvbmFsU3RhdGljSnMgJiZcbiAgICAhV2ViQXBwSW50ZXJuYWxzLmlubGluZVNjcmlwdHNBbGxvd2VkKClcbiAgKSB7XG4gICAgc2VydmVTdGF0aWNKcyhhZGRpdGlvbmFsU3RhdGljSnNbcGF0aG5hbWVdKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCB7IGFyY2gsIHBhdGggfSA9IFdlYkFwcC5jYXRlZ29yaXplUmVxdWVzdChyZXEpO1xuXG4gIGlmICghaGFzT3duLmNhbGwoV2ViQXBwLmNsaWVudFByb2dyYW1zLCBhcmNoKSkge1xuICAgIC8vIFdlIGNvdWxkIGNvbWUgaGVyZSBpbiBjYXNlIHdlIHJ1biB3aXRoIHNvbWUgYXJjaGl0ZWN0dXJlcyBleGNsdWRlZFxuICAgIG5leHQoKTtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBJZiBwYXVzZUNsaWVudChhcmNoKSBoYXMgYmVlbiBjYWxsZWQsIHByb2dyYW0ucGF1c2VkIHdpbGwgYmUgYVxuICAvLyBQcm9taXNlIHRoYXQgd2lsbCBiZSByZXNvbHZlZCB3aGVuIHRoZSBwcm9ncmFtIGlzIHVucGF1c2VkLlxuICBjb25zdCBwcm9ncmFtID0gV2ViQXBwLmNsaWVudFByb2dyYW1zW2FyY2hdO1xuICBhd2FpdCBwcm9ncmFtLnBhdXNlZDtcblxuICBpZiAoXG4gICAgcGF0aCA9PT0gJy9tZXRlb3JfcnVudGltZV9jb25maWcuanMnICYmXG4gICAgIVdlYkFwcEludGVybmFscy5pbmxpbmVTY3JpcHRzQWxsb3dlZCgpXG4gICkge1xuICAgIHNlcnZlU3RhdGljSnMoXG4gICAgICBgX19tZXRlb3JfcnVudGltZV9jb25maWdfXyA9ICR7cHJvZ3JhbS5tZXRlb3JSdW50aW1lQ29uZmlnfTtgXG4gICAgKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBpbmZvID0gZ2V0U3RhdGljRmlsZUluZm8oc3RhdGljRmlsZXNCeUFyY2gsIHBhdGhuYW1lLCBwYXRoLCBhcmNoKTtcbiAgaWYgKCFpbmZvKSB7XG4gICAgbmV4dCgpO1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBcInNlbmRcIiB3aWxsIGhhbmRsZSBIRUFEICYgR0VUIHJlcXVlc3RzXG4gIGlmIChcbiAgICByZXEubWV0aG9kICE9PSAnSEVBRCcgJiZcbiAgICByZXEubWV0aG9kICE9PSAnR0VUJyAmJlxuICAgICFNZXRlb3Iuc2V0dGluZ3MucGFja2FnZXM/LndlYmFwcD8uYWx3YXlzUmV0dXJuQ29udGVudFxuICApIHtcbiAgICBjb25zdCBzdGF0dXMgPSByZXEubWV0aG9kID09PSAnT1BUSU9OUycgPyAyMDAgOiA0MDU7XG4gICAgcmVzLndyaXRlSGVhZChzdGF0dXMsIHtcbiAgICAgIEFsbG93OiAnT1BUSU9OUywgR0VULCBIRUFEJyxcbiAgICAgICdDb250ZW50LUxlbmd0aCc6ICcwJyxcbiAgICB9KTtcbiAgICByZXMuZW5kKCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gV2UgZG9uJ3QgbmVlZCB0byBjYWxsIHBhdXNlIGJlY2F1c2UsIHVubGlrZSAnc3RhdGljJywgb25jZSB3ZSBjYWxsIGludG9cbiAgLy8gJ3NlbmQnIGFuZCB5aWVsZCB0byB0aGUgZXZlbnQgbG9vcCwgd2UgbmV2ZXIgY2FsbCBhbm90aGVyIGhhbmRsZXIgd2l0aFxuICAvLyAnbmV4dCcuXG5cbiAgLy8gQ2FjaGVhYmxlIGZpbGVzIGFyZSBmaWxlcyB0aGF0IHNob3VsZCBuZXZlciBjaGFuZ2UuIFR5cGljYWxseVxuICAvLyBuYW1lZCBieSB0aGVpciBoYXNoIChlZyBtZXRlb3IgYnVuZGxlZCBqcyBhbmQgY3NzIGZpbGVzKS5cbiAgLy8gV2UgY2FjaGUgdGhlbSB+Zm9yZXZlciAoMXlyKS5cbiAgY29uc3QgbWF4QWdlID0gaW5mby5jYWNoZWFibGUgPyAxMDAwICogNjAgKiA2MCAqIDI0ICogMzY1IDogMDtcblxuICBpZiAoaW5mby5jYWNoZWFibGUpIHtcbiAgICAvLyBTaW5jZSB3ZSB1c2UgcmVxLmhlYWRlcnNbXCJ1c2VyLWFnZW50XCJdIHRvIGRldGVybWluZSB3aGV0aGVyIHRoZVxuICAgIC8vIGNsaWVudCBzaG91bGQgcmVjZWl2ZSBtb2Rlcm4gb3IgbGVnYWN5IHJlc291cmNlcywgdGVsbCB0aGUgY2xpZW50XG4gICAgLy8gdG8gaW52YWxpZGF0ZSBjYWNoZWQgcmVzb3VyY2VzIHdoZW4vaWYgaXRzIHVzZXIgYWdlbnQgc3RyaW5nXG4gICAgLy8gY2hhbmdlcyBpbiB0aGUgZnV0dXJlLlxuICAgIHJlcy5zZXRIZWFkZXIoJ1ZhcnknLCAnVXNlci1BZ2VudCcpO1xuICB9XG5cbiAgLy8gU2V0IHRoZSBYLVNvdXJjZU1hcCBoZWFkZXIsIHdoaWNoIGN1cnJlbnQgQ2hyb21lLCBGaXJlRm94LCBhbmQgU2FmYXJpXG4gIC8vIHVuZGVyc3RhbmQuICAoVGhlIFNvdXJjZU1hcCBoZWFkZXIgaXMgc2xpZ2h0bHkgbW9yZSBzcGVjLWNvcnJlY3QgYnV0IEZGXG4gIC8vIGRvZXNuJ3QgdW5kZXJzdGFuZCBpdC4pXG4gIC8vXG4gIC8vIFlvdSBtYXkgYWxzbyBuZWVkIHRvIGVuYWJsZSBzb3VyY2UgbWFwcyBpbiBDaHJvbWU6IG9wZW4gZGV2IHRvb2xzLCBjbGlja1xuICAvLyB0aGUgZ2VhciBpbiB0aGUgYm90dG9tIHJpZ2h0IGNvcm5lciwgYW5kIHNlbGVjdCBcImVuYWJsZSBzb3VyY2UgbWFwc1wiLlxuICBpZiAoaW5mby5zb3VyY2VNYXBVcmwpIHtcbiAgICByZXMuc2V0SGVhZGVyKFxuICAgICAgJ1gtU291cmNlTWFwJyxcbiAgICAgIF9fbWV0ZW9yX3J1bnRpbWVfY29uZmlnX18uUk9PVF9VUkxfUEFUSF9QUkVGSVggKyBpbmZvLnNvdXJjZU1hcFVybFxuICAgICk7XG4gIH1cblxuICBpZiAoaW5mby50eXBlID09PSAnanMnIHx8IGluZm8udHlwZSA9PT0gJ2R5bmFtaWMganMnKSB7XG4gICAgcmVzLnNldEhlYWRlcignQ29udGVudC1UeXBlJywgJ2FwcGxpY2F0aW9uL2phdmFzY3JpcHQ7IGNoYXJzZXQ9VVRGLTgnKTtcbiAgfSBlbHNlIGlmIChpbmZvLnR5cGUgPT09ICdjc3MnKSB7XG4gICAgcmVzLnNldEhlYWRlcignQ29udGVudC1UeXBlJywgJ3RleHQvY3NzOyBjaGFyc2V0PVVURi04Jyk7XG4gIH0gZWxzZSBpZiAoaW5mby50eXBlID09PSAnanNvbicpIHtcbiAgICByZXMuc2V0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAnYXBwbGljYXRpb24vanNvbjsgY2hhcnNldD1VVEYtOCcpO1xuICB9XG5cbiAgaWYgKGluZm8uaGFzaCkge1xuICAgIHJlcy5zZXRIZWFkZXIoJ0VUYWcnLCAnXCInICsgaW5mby5oYXNoICsgJ1wiJyk7XG4gIH1cblxuICBpZiAoaW5mby5jb250ZW50KSB7XG4gICAgcmVzLnNldEhlYWRlcignQ29udGVudC1MZW5ndGgnLCBCdWZmZXIuYnl0ZUxlbmd0aChpbmZvLmNvbnRlbnQpKTtcbiAgICByZXMud3JpdGUoaW5mby5jb250ZW50KTtcbiAgICByZXMuZW5kKCk7XG4gIH0gZWxzZSB7XG4gICAgc2VuZChyZXEsIGluZm8uYWJzb2x1dGVQYXRoLCB7XG4gICAgICBtYXhhZ2U6IG1heEFnZSxcbiAgICAgIGRvdGZpbGVzOiAnYWxsb3cnLCAvLyBpZiB3ZSBzcGVjaWZpZWQgYSBkb3RmaWxlIGluIHRoZSBtYW5pZmVzdCwgc2VydmUgaXRcbiAgICAgIGxhc3RNb2RpZmllZDogZmFsc2UsIC8vIGRvbid0IHNldCBsYXN0LW1vZGlmaWVkIGJhc2VkIG9uIHRoZSBmaWxlIGRhdGVcbiAgICB9KVxuICAgICAgLm9uKCdlcnJvcicsIGZ1bmN0aW9uKGVycikge1xuICAgICAgICBMb2cuZXJyb3IoJ0Vycm9yIHNlcnZpbmcgc3RhdGljIGZpbGUgJyArIGVycik7XG4gICAgICAgIHJlcy53cml0ZUhlYWQoNTAwKTtcbiAgICAgICAgcmVzLmVuZCgpO1xuICAgICAgfSlcbiAgICAgIC5vbignZGlyZWN0b3J5JywgZnVuY3Rpb24oKSB7XG4gICAgICAgIExvZy5lcnJvcignVW5leHBlY3RlZCBkaXJlY3RvcnkgJyArIGluZm8uYWJzb2x1dGVQYXRoKTtcbiAgICAgICAgcmVzLndyaXRlSGVhZCg1MDApO1xuICAgICAgICByZXMuZW5kKCk7XG4gICAgICB9KVxuICAgICAgLnBpcGUocmVzKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gZ2V0U3RhdGljRmlsZUluZm8oc3RhdGljRmlsZXNCeUFyY2gsIG9yaWdpbmFsUGF0aCwgcGF0aCwgYXJjaCkge1xuICBpZiAoIWhhc093bi5jYWxsKFdlYkFwcC5jbGllbnRQcm9ncmFtcywgYXJjaCkpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIC8vIEdldCBhIGxpc3Qgb2YgYWxsIGF2YWlsYWJsZSBzdGF0aWMgZmlsZSBhcmNoaXRlY3R1cmVzLCB3aXRoIGFyY2hcbiAgLy8gZmlyc3QgaW4gdGhlIGxpc3QgaWYgaXQgZXhpc3RzLlxuICBjb25zdCBzdGF0aWNBcmNoTGlzdCA9IE9iamVjdC5rZXlzKHN0YXRpY0ZpbGVzQnlBcmNoKTtcbiAgY29uc3QgYXJjaEluZGV4ID0gc3RhdGljQXJjaExpc3QuaW5kZXhPZihhcmNoKTtcbiAgaWYgKGFyY2hJbmRleCA+IDApIHtcbiAgICBzdGF0aWNBcmNoTGlzdC51bnNoaWZ0KHN0YXRpY0FyY2hMaXN0LnNwbGljZShhcmNoSW5kZXgsIDEpWzBdKTtcbiAgfVxuXG4gIGxldCBpbmZvID0gbnVsbDtcblxuICBzdGF0aWNBcmNoTGlzdC5zb21lKGFyY2ggPT4ge1xuICAgIGNvbnN0IHN0YXRpY0ZpbGVzID0gc3RhdGljRmlsZXNCeUFyY2hbYXJjaF07XG5cbiAgICBmdW5jdGlvbiBmaW5hbGl6ZShwYXRoKSB7XG4gICAgICBpbmZvID0gc3RhdGljRmlsZXNbcGF0aF07XG4gICAgICAvLyBTb21ldGltZXMgd2UgcmVnaXN0ZXIgYSBsYXp5IGZ1bmN0aW9uIGluc3RlYWQgb2YgYWN0dWFsIGRhdGEgaW5cbiAgICAgIC8vIHRoZSBzdGF0aWNGaWxlcyBtYW5pZmVzdC5cbiAgICAgIGlmICh0eXBlb2YgaW5mbyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBpbmZvID0gc3RhdGljRmlsZXNbcGF0aF0gPSBpbmZvKCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gaW5mbztcbiAgICB9XG5cbiAgICAvLyBJZiBzdGF0aWNGaWxlcyBjb250YWlucyBvcmlnaW5hbFBhdGggd2l0aCB0aGUgYXJjaCBpbmZlcnJlZCBhYm92ZSxcbiAgICAvLyB1c2UgdGhhdCBpbmZvcm1hdGlvbi5cbiAgICBpZiAoaGFzT3duLmNhbGwoc3RhdGljRmlsZXMsIG9yaWdpbmFsUGF0aCkpIHtcbiAgICAgIHJldHVybiBmaW5hbGl6ZShvcmlnaW5hbFBhdGgpO1xuICAgIH1cblxuICAgIC8vIElmIGNhdGVnb3JpemVSZXF1ZXN0IHJldHVybmVkIGFuIGFsdGVybmF0ZSBwYXRoLCB0cnkgdGhhdCBpbnN0ZWFkLlxuICAgIGlmIChwYXRoICE9PSBvcmlnaW5hbFBhdGggJiYgaGFzT3duLmNhbGwoc3RhdGljRmlsZXMsIHBhdGgpKSB7XG4gICAgICByZXR1cm4gZmluYWxpemUocGF0aCk7XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4gaW5mbztcbn1cblxuLy8gUGFyc2UgdGhlIHBhc3NlZCBpbiBwb3J0IHZhbHVlLiBSZXR1cm4gdGhlIHBvcnQgYXMtaXMgaWYgaXQncyBhIFN0cmluZ1xuLy8gKGUuZy4gYSBXaW5kb3dzIFNlcnZlciBzdHlsZSBuYW1lZCBwaXBlKSwgb3RoZXJ3aXNlIHJldHVybiB0aGUgcG9ydCBhcyBhblxuLy8gaW50ZWdlci5cbi8vXG4vLyBERVBSRUNBVEVEOiBEaXJlY3QgdXNlIG9mIHRoaXMgZnVuY3Rpb24gaXMgbm90IHJlY29tbWVuZGVkOyBpdCBpcyBub1xuLy8gbG9uZ2VyIHVzZWQgaW50ZXJuYWxseSwgYW5kIHdpbGwgYmUgcmVtb3ZlZCBpbiBhIGZ1dHVyZSByZWxlYXNlLlxuV2ViQXBwSW50ZXJuYWxzLnBhcnNlUG9ydCA9IHBvcnQgPT4ge1xuICBsZXQgcGFyc2VkUG9ydCA9IHBhcnNlSW50KHBvcnQpO1xuICBpZiAoTnVtYmVyLmlzTmFOKHBhcnNlZFBvcnQpKSB7XG4gICAgcGFyc2VkUG9ydCA9IHBvcnQ7XG4gIH1cbiAgcmV0dXJuIHBhcnNlZFBvcnQ7XG59O1xuXG5pbXBvcnQgeyBvbk1lc3NhZ2UgfSBmcm9tICdtZXRlb3IvaW50ZXItcHJvY2Vzcy1tZXNzYWdpbmcnO1xuXG5vbk1lc3NhZ2UoJ3dlYmFwcC1wYXVzZS1jbGllbnQnLCBhc3luYyAoeyBhcmNoIH0pID0+IHtcbiAgYXdhaXQgV2ViQXBwSW50ZXJuYWxzLnBhdXNlQ2xpZW50KGFyY2gpO1xufSk7XG5cbm9uTWVzc2FnZSgnd2ViYXBwLXJlbG9hZC1jbGllbnQnLCBhc3luYyAoeyBhcmNoIH0pID0+IHtcbiAgYXdhaXQgV2ViQXBwSW50ZXJuYWxzLmdlbmVyYXRlQ2xpZW50UHJvZ3JhbShhcmNoKTtcbn0pO1xuXG5hc3luYyBmdW5jdGlvbiBydW5XZWJBcHBTZXJ2ZXIoKSB7XG4gIHZhciBzaHV0dGluZ0Rvd24gPSBmYWxzZTtcbiAgdmFyIHN5bmNRdWV1ZSA9IG5ldyBNZXRlb3IuX0FzeW5jaHJvbm91c1F1ZXVlKCk7XG5cbiAgdmFyIGdldEl0ZW1QYXRobmFtZSA9IGZ1bmN0aW9uKGl0ZW1VcmwpIHtcbiAgICByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KHBhcnNlVXJsKGl0ZW1VcmwpLnBhdGhuYW1lKTtcbiAgfTtcblxuICBXZWJBcHBJbnRlcm5hbHMucmVsb2FkQ2xpZW50UHJvZ3JhbXMgPSBhc3luYyBmdW5jdGlvbigpIHtcbiAgICBhd2FpdCBzeW5jUXVldWUucnVuVGFzayhmdW5jdGlvbigpIHtcbiAgICAgIGNvbnN0IHN0YXRpY0ZpbGVzQnlBcmNoID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblxuICAgICAgY29uc3QgeyBjb25maWdKc29uIH0gPSBfX21ldGVvcl9ib290c3RyYXBfXztcbiAgICAgIGNvbnN0IGNsaWVudEFyY2hzID1cbiAgICAgICAgY29uZmlnSnNvbi5jbGllbnRBcmNocyB8fCBPYmplY3Qua2V5cyhjb25maWdKc29uLmNsaWVudFBhdGhzKTtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgY2xpZW50QXJjaHMuZm9yRWFjaChhcmNoID0+IHtcbiAgICAgICAgICBnZW5lcmF0ZUNsaWVudFByb2dyYW0oYXJjaCwgc3RhdGljRmlsZXNCeUFyY2gpO1xuICAgICAgICB9KTtcbiAgICAgICAgV2ViQXBwSW50ZXJuYWxzLnN0YXRpY0ZpbGVzQnlBcmNoID0gc3RhdGljRmlsZXNCeUFyY2g7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIExvZy5lcnJvcignRXJyb3IgcmVsb2FkaW5nIHRoZSBjbGllbnQgcHJvZ3JhbTogJyArIGUuc3RhY2spO1xuICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gUGF1c2UgYW55IGluY29taW5nIHJlcXVlc3RzIGFuZCBtYWtlIHRoZW0gd2FpdCBmb3IgdGhlIHByb2dyYW0gdG8gYmVcbiAgLy8gdW5wYXVzZWQgdGhlIG5leHQgdGltZSBnZW5lcmF0ZUNsaWVudFByb2dyYW0oYXJjaCkgaXMgY2FsbGVkLlxuICBXZWJBcHBJbnRlcm5hbHMucGF1c2VDbGllbnQgPSBhc3luYyBmdW5jdGlvbihhcmNoKSB7XG4gICAgYXdhaXQgc3luY1F1ZXVlLnJ1blRhc2soKCkgPT4ge1xuICAgICAgY29uc3QgcHJvZ3JhbSA9IFdlYkFwcC5jbGllbnRQcm9ncmFtc1thcmNoXTtcbiAgICAgIGNvbnN0IHsgdW5wYXVzZSB9ID0gcHJvZ3JhbTtcbiAgICAgIHByb2dyYW0ucGF1c2VkID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgdW5wYXVzZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIC8vIElmIHRoZXJlIGhhcHBlbnMgdG8gYmUgYW4gZXhpc3RpbmcgcHJvZ3JhbS51bnBhdXNlIGZ1bmN0aW9uLFxuICAgICAgICAgIC8vIGNvbXBvc2UgaXQgd2l0aCB0aGUgcmVzb2x2ZSBmdW5jdGlvbi5cbiAgICAgICAgICBwcm9ncmFtLnVucGF1c2UgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHVucGF1c2UoKTtcbiAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHByb2dyYW0udW5wYXVzZSA9IHJlc29sdmU7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICB9O1xuXG4gIFdlYkFwcEludGVybmFscy5nZW5lcmF0ZUNsaWVudFByb2dyYW0gPSBhc3luYyBmdW5jdGlvbihhcmNoKSB7XG4gICAgYXdhaXQgc3luY1F1ZXVlLnJ1blRhc2soKCkgPT4gZ2VuZXJhdGVDbGllbnRQcm9ncmFtKGFyY2gpKTtcbiAgfTtcblxuICBmdW5jdGlvbiBnZW5lcmF0ZUNsaWVudFByb2dyYW0oXG4gICAgYXJjaCxcbiAgICBzdGF0aWNGaWxlc0J5QXJjaCA9IFdlYkFwcEludGVybmFscy5zdGF0aWNGaWxlc0J5QXJjaFxuICApIHtcbiAgICBjb25zdCBjbGllbnREaXIgPSBwYXRoSm9pbihcbiAgICAgIHBhdGhEaXJuYW1lKF9fbWV0ZW9yX2Jvb3RzdHJhcF9fLnNlcnZlckRpciksXG4gICAgICBhcmNoXG4gICAgKTtcblxuICAgIC8vIHJlYWQgdGhlIGNvbnRyb2wgZm9yIHRoZSBjbGllbnQgd2UnbGwgYmUgc2VydmluZyB1cFxuICAgIGNvbnN0IHByb2dyYW1Kc29uUGF0aCA9IHBhdGhKb2luKGNsaWVudERpciwgJ3Byb2dyYW0uanNvbicpO1xuXG4gICAgbGV0IHByb2dyYW1Kc29uO1xuICAgIHRyeSB7XG4gICAgICBwcm9ncmFtSnNvbiA9IEpTT04ucGFyc2UocmVhZEZpbGVTeW5jKHByb2dyYW1Kc29uUGF0aCkpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmIChlLmNvZGUgPT09ICdFTk9FTlQnKSByZXR1cm47XG4gICAgICB0aHJvdyBlO1xuICAgIH1cblxuICAgIGlmIChwcm9ncmFtSnNvbi5mb3JtYXQgIT09ICd3ZWItcHJvZ3JhbS1wcmUxJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAnVW5zdXBwb3J0ZWQgZm9ybWF0IGZvciBjbGllbnQgYXNzZXRzOiAnICtcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeShwcm9ncmFtSnNvbi5mb3JtYXQpXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmICghcHJvZ3JhbUpzb25QYXRoIHx8ICFjbGllbnREaXIgfHwgIXByb2dyYW1Kc29uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NsaWVudCBjb25maWcgZmlsZSBub3QgcGFyc2VkLicpO1xuICAgIH1cblxuICAgIGFyY2hQYXRoW2FyY2hdID0gY2xpZW50RGlyO1xuICAgIGNvbnN0IHN0YXRpY0ZpbGVzID0gKHN0YXRpY0ZpbGVzQnlBcmNoW2FyY2hdID0gT2JqZWN0LmNyZWF0ZShudWxsKSk7XG5cbiAgICBjb25zdCB7IG1hbmlmZXN0IH0gPSBwcm9ncmFtSnNvbjtcbiAgICBtYW5pZmVzdC5mb3JFYWNoKGl0ZW0gPT4ge1xuICAgICAgaWYgKGl0ZW0udXJsICYmIGl0ZW0ud2hlcmUgPT09ICdjbGllbnQnKSB7XG4gICAgICAgIHN0YXRpY0ZpbGVzW2dldEl0ZW1QYXRobmFtZShpdGVtLnVybCldID0ge1xuICAgICAgICAgIGFic29sdXRlUGF0aDogcGF0aEpvaW4oY2xpZW50RGlyLCBpdGVtLnBhdGgpLFxuICAgICAgICAgIGNhY2hlYWJsZTogaXRlbS5jYWNoZWFibGUsXG4gICAgICAgICAgaGFzaDogaXRlbS5oYXNoLFxuICAgICAgICAgIC8vIExpbmsgZnJvbSBzb3VyY2UgdG8gaXRzIG1hcFxuICAgICAgICAgIHNvdXJjZU1hcFVybDogaXRlbS5zb3VyY2VNYXBVcmwsXG4gICAgICAgICAgdHlwZTogaXRlbS50eXBlLFxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChpdGVtLnNvdXJjZU1hcCkge1xuICAgICAgICAgIC8vIFNlcnZlIHRoZSBzb3VyY2UgbWFwIHRvbywgdW5kZXIgdGhlIHNwZWNpZmllZCBVUkwuIFdlIGFzc3VtZVxuICAgICAgICAgIC8vIGFsbCBzb3VyY2UgbWFwcyBhcmUgY2FjaGVhYmxlLlxuICAgICAgICAgIHN0YXRpY0ZpbGVzW2dldEl0ZW1QYXRobmFtZShpdGVtLnNvdXJjZU1hcFVybCldID0ge1xuICAgICAgICAgICAgYWJzb2x1dGVQYXRoOiBwYXRoSm9pbihjbGllbnREaXIsIGl0ZW0uc291cmNlTWFwKSxcbiAgICAgICAgICAgIGNhY2hlYWJsZTogdHJ1ZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zdCB7IFBVQkxJQ19TRVRUSU5HUyB9ID0gX19tZXRlb3JfcnVudGltZV9jb25maWdfXztcbiAgICBjb25zdCBjb25maWdPdmVycmlkZXMgPSB7XG4gICAgICBQVUJMSUNfU0VUVElOR1MsXG4gICAgfTtcblxuICAgIGNvbnN0IG9sZFByb2dyYW0gPSBXZWJBcHAuY2xpZW50UHJvZ3JhbXNbYXJjaF07XG4gICAgY29uc3QgbmV3UHJvZ3JhbSA9IChXZWJBcHAuY2xpZW50UHJvZ3JhbXNbYXJjaF0gPSB7XG4gICAgICBmb3JtYXQ6ICd3ZWItcHJvZ3JhbS1wcmUxJyxcbiAgICAgIG1hbmlmZXN0OiBtYW5pZmVzdCxcbiAgICAgIC8vIFVzZSBhcnJvdyBmdW5jdGlvbnMgc28gdGhhdCB0aGVzZSB2ZXJzaW9ucyBjYW4gYmUgbGF6aWx5XG4gICAgICAvLyBjYWxjdWxhdGVkIGxhdGVyLCBhbmQgc28gdGhhdCB0aGV5IHdpbGwgbm90IGJlIGluY2x1ZGVkIGluIHRoZVxuICAgICAgLy8gc3RhdGljRmlsZXNbbWFuaWZlc3RVcmxdLmNvbnRlbnQgc3RyaW5nIGJlbG93LlxuICAgICAgLy9cbiAgICAgIC8vIE5vdGU6IHRoZXNlIHZlcnNpb24gY2FsY3VsYXRpb25zIG11c3QgYmUga2VwdCBpbiBhZ3JlZW1lbnQgd2l0aFxuICAgICAgLy8gQ29yZG92YUJ1aWxkZXIjYXBwZW5kVmVyc2lvbiBpbiB0b29scy9jb3Jkb3ZhL2J1aWxkZXIuanMsIG9yIGhvdFxuICAgICAgLy8gY29kZSBwdXNoIHdpbGwgcmVsb2FkIENvcmRvdmEgYXBwcyB1bm5lY2Vzc2FyaWx5LlxuICAgICAgdmVyc2lvbjogKCkgPT5cbiAgICAgICAgV2ViQXBwSGFzaGluZy5jYWxjdWxhdGVDbGllbnRIYXNoKG1hbmlmZXN0LCBudWxsLCBjb25maWdPdmVycmlkZXMpLFxuICAgICAgdmVyc2lvblJlZnJlc2hhYmxlOiAoKSA9PlxuICAgICAgICBXZWJBcHBIYXNoaW5nLmNhbGN1bGF0ZUNsaWVudEhhc2goXG4gICAgICAgICAgbWFuaWZlc3QsXG4gICAgICAgICAgdHlwZSA9PiB0eXBlID09PSAnY3NzJyxcbiAgICAgICAgICBjb25maWdPdmVycmlkZXNcbiAgICAgICAgKSxcbiAgICAgIHZlcnNpb25Ob25SZWZyZXNoYWJsZTogKCkgPT5cbiAgICAgICAgV2ViQXBwSGFzaGluZy5jYWxjdWxhdGVDbGllbnRIYXNoKFxuICAgICAgICAgIG1hbmlmZXN0LFxuICAgICAgICAgICh0eXBlLCByZXBsYWNlYWJsZSkgPT4gdHlwZSAhPT0gJ2NzcycgJiYgIXJlcGxhY2VhYmxlLFxuICAgICAgICAgIGNvbmZpZ092ZXJyaWRlc1xuICAgICAgICApLFxuICAgICAgdmVyc2lvblJlcGxhY2VhYmxlOiAoKSA9PlxuICAgICAgICBXZWJBcHBIYXNoaW5nLmNhbGN1bGF0ZUNsaWVudEhhc2goXG4gICAgICAgICAgbWFuaWZlc3QsXG4gICAgICAgICAgKF90eXBlLCByZXBsYWNlYWJsZSkgPT4gcmVwbGFjZWFibGUsXG4gICAgICAgICAgY29uZmlnT3ZlcnJpZGVzXG4gICAgICAgICksXG4gICAgICBjb3Jkb3ZhQ29tcGF0aWJpbGl0eVZlcnNpb25zOiBwcm9ncmFtSnNvbi5jb3Jkb3ZhQ29tcGF0aWJpbGl0eVZlcnNpb25zLFxuICAgICAgUFVCTElDX1NFVFRJTkdTLFxuICAgICAgaG1yVmVyc2lvbjogcHJvZ3JhbUpzb24uaG1yVmVyc2lvbixcbiAgICB9KTtcblxuICAgIC8vIEV4cG9zZSBwcm9ncmFtIGRldGFpbHMgYXMgYSBzdHJpbmcgcmVhY2hhYmxlIHZpYSB0aGUgZm9sbG93aW5nIFVSTC5cbiAgICBjb25zdCBtYW5pZmVzdFVybFByZWZpeCA9ICcvX18nICsgYXJjaC5yZXBsYWNlKC9ed2ViXFwuLywgJycpO1xuICAgIGNvbnN0IG1hbmlmZXN0VXJsID0gbWFuaWZlc3RVcmxQcmVmaXggKyBnZXRJdGVtUGF0aG5hbWUoJy9tYW5pZmVzdC5qc29uJyk7XG5cbiAgICBzdGF0aWNGaWxlc1ttYW5pZmVzdFVybF0gPSAoKSA9PiB7XG4gICAgICBpZiAoUGFja2FnZS5hdXRvdXBkYXRlKSB7XG4gICAgICAgIGNvbnN0IHtcbiAgICAgICAgICBBVVRPVVBEQVRFX1ZFUlNJT04gPSBQYWNrYWdlLmF1dG91cGRhdGUuQXV0b3VwZGF0ZS5hdXRvdXBkYXRlVmVyc2lvbixcbiAgICAgICAgfSA9IHByb2Nlc3MuZW52O1xuXG4gICAgICAgIGlmIChBVVRPVVBEQVRFX1ZFUlNJT04pIHtcbiAgICAgICAgICBuZXdQcm9ncmFtLnZlcnNpb24gPSBBVVRPVVBEQVRFX1ZFUlNJT047XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHR5cGVvZiBuZXdQcm9ncmFtLnZlcnNpb24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgbmV3UHJvZ3JhbS52ZXJzaW9uID0gbmV3UHJvZ3JhbS52ZXJzaW9uKCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNvbnRlbnQ6IEpTT04uc3RyaW5naWZ5KG5ld1Byb2dyYW0pLFxuICAgICAgICBjYWNoZWFibGU6IGZhbHNlLFxuICAgICAgICBoYXNoOiBuZXdQcm9ncmFtLnZlcnNpb24sXG4gICAgICAgIHR5cGU6ICdqc29uJyxcbiAgICAgIH07XG4gICAgfTtcblxuICAgIGdlbmVyYXRlQm9pbGVycGxhdGVGb3JBcmNoKGFyY2gpO1xuXG4gICAgLy8gSWYgdGhlcmUgYXJlIGFueSByZXF1ZXN0cyB3YWl0aW5nIG9uIG9sZFByb2dyYW0ucGF1c2VkLCBsZXQgdGhlbVxuICAgIC8vIGNvbnRpbnVlIG5vdyAodXNpbmcgdGhlIG5ldyBwcm9ncmFtKS5cbiAgICBpZiAob2xkUHJvZ3JhbSAmJiBvbGRQcm9ncmFtLnBhdXNlZCkge1xuICAgICAgb2xkUHJvZ3JhbS51bnBhdXNlKCk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgZGVmYXVsdE9wdGlvbnNGb3JBcmNoID0ge1xuICAgICd3ZWIuY29yZG92YSc6IHtcbiAgICAgIHJ1bnRpbWVDb25maWdPdmVycmlkZXM6IHtcbiAgICAgICAgLy8gWFhYIFdlIHVzZSBhYnNvbHV0ZVVybCgpIGhlcmUgc28gdGhhdCB3ZSBzZXJ2ZSBodHRwczovL1xuICAgICAgICAvLyBVUkxzIHRvIGNvcmRvdmEgY2xpZW50cyBpZiBmb3JjZS1zc2wgaXMgaW4gdXNlLiBJZiB3ZSB3ZXJlXG4gICAgICAgIC8vIHRvIHVzZSBfX21ldGVvcl9ydW50aW1lX2NvbmZpZ19fLlJPT1RfVVJMIGluc3RlYWQgb2ZcbiAgICAgICAgLy8gYWJzb2x1dGVVcmwoKSwgdGhlbiBDb3Jkb3ZhIGNsaWVudHMgd291bGQgaW1tZWRpYXRlbHkgZ2V0IGFcbiAgICAgICAgLy8gSENQIHNldHRpbmcgdGhlaXIgRERQX0RFRkFVTFRfQ09OTkVDVElPTl9VUkwgdG9cbiAgICAgICAgLy8gaHR0cDovL2V4YW1wbGUubWV0ZW9yLmNvbS4gVGhpcyBicmVha3MgdGhlIGFwcCwgYmVjYXVzZVxuICAgICAgICAvLyBmb3JjZS1zc2wgZG9lc24ndCBzZXJ2ZSBDT1JTIGhlYWRlcnMgb24gMzAyXG4gICAgICAgIC8vIHJlZGlyZWN0cy4gKFBsdXMgaXQncyB1bmRlc2lyYWJsZSB0byBoYXZlIGNsaWVudHNcbiAgICAgICAgLy8gY29ubmVjdGluZyB0byBodHRwOi8vZXhhbXBsZS5tZXRlb3IuY29tIHdoZW4gZm9yY2Utc3NsIGlzXG4gICAgICAgIC8vIGluIHVzZS4pXG4gICAgICAgIEREUF9ERUZBVUxUX0NPTk5FQ1RJT05fVVJMOlxuICAgICAgICAgIHByb2Nlc3MuZW52Lk1PQklMRV9ERFBfVVJMIHx8IE1ldGVvci5hYnNvbHV0ZVVybCgpLFxuICAgICAgICBST09UX1VSTDogcHJvY2Vzcy5lbnYuTU9CSUxFX1JPT1RfVVJMIHx8IE1ldGVvci5hYnNvbHV0ZVVybCgpLFxuICAgICAgfSxcbiAgICB9LFxuXG4gICAgJ3dlYi5icm93c2VyJzoge1xuICAgICAgcnVudGltZUNvbmZpZ092ZXJyaWRlczoge1xuICAgICAgICBpc01vZGVybjogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSxcblxuICAgICd3ZWIuYnJvd3Nlci5sZWdhY3knOiB7XG4gICAgICBydW50aW1lQ29uZmlnT3ZlcnJpZGVzOiB7XG4gICAgICAgIGlzTW9kZXJuOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfTtcblxuICBXZWJBcHBJbnRlcm5hbHMuZ2VuZXJhdGVCb2lsZXJwbGF0ZSA9IGFzeW5jIGZ1bmN0aW9uKCkge1xuICAgIC8vIFRoaXMgYm9pbGVycGxhdGUgd2lsbCBiZSBzZXJ2ZWQgdG8gdGhlIG1vYmlsZSBkZXZpY2VzIHdoZW4gdXNlZCB3aXRoXG4gICAgLy8gTWV0ZW9yL0NvcmRvdmEgZm9yIHRoZSBIb3QtQ29kZSBQdXNoIGFuZCBzaW5jZSB0aGUgZmlsZSB3aWxsIGJlIHNlcnZlZCBieVxuICAgIC8vIHRoZSBkZXZpY2UncyBzZXJ2ZXIsIGl0IGlzIGltcG9ydGFudCB0byBzZXQgdGhlIEREUCB1cmwgdG8gdGhlIGFjdHVhbFxuICAgIC8vIE1ldGVvciBzZXJ2ZXIgYWNjZXB0aW5nIEREUCBjb25uZWN0aW9ucyBhbmQgbm90IHRoZSBkZXZpY2UncyBmaWxlIHNlcnZlci5cbiAgICBhd2FpdCBzeW5jUXVldWUucnVuVGFzayhmdW5jdGlvbigpIHtcbiAgICAgIE9iamVjdC5rZXlzKFdlYkFwcC5jbGllbnRQcm9ncmFtcykuZm9yRWFjaChnZW5lcmF0ZUJvaWxlcnBsYXRlRm9yQXJjaCk7XG4gICAgfSk7XG4gIH07XG5cbiAgZnVuY3Rpb24gZ2VuZXJhdGVCb2lsZXJwbGF0ZUZvckFyY2goYXJjaCkge1xuICAgIGNvbnN0IHByb2dyYW0gPSBXZWJBcHAuY2xpZW50UHJvZ3JhbXNbYXJjaF07XG4gICAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSBkZWZhdWx0T3B0aW9uc0ZvckFyY2hbYXJjaF0gfHwge307XG4gICAgY29uc3QgeyBiYXNlRGF0YSB9ID0gKGJvaWxlcnBsYXRlQnlBcmNoW1xuICAgICAgYXJjaFxuICAgIF0gPSBXZWJBcHBJbnRlcm5hbHMuZ2VuZXJhdGVCb2lsZXJwbGF0ZUluc3RhbmNlKFxuICAgICAgYXJjaCxcbiAgICAgIHByb2dyYW0ubWFuaWZlc3QsXG4gICAgICBhZGRpdGlvbmFsT3B0aW9uc1xuICAgICkpO1xuICAgIC8vIFdlIG5lZWQgdGhlIHJ1bnRpbWUgY29uZmlnIHdpdGggb3ZlcnJpZGVzIGZvciBtZXRlb3JfcnVudGltZV9jb25maWcuanM6XG4gICAgcHJvZ3JhbS5tZXRlb3JSdW50aW1lQ29uZmlnID0gSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgLi4uX19tZXRlb3JfcnVudGltZV9jb25maWdfXyxcbiAgICAgIC4uLihhZGRpdGlvbmFsT3B0aW9ucy5ydW50aW1lQ29uZmlnT3ZlcnJpZGVzIHx8IG51bGwpLFxuICAgIH0pO1xuICAgIHByb2dyYW0ucmVmcmVzaGFibGVBc3NldHMgPSBiYXNlRGF0YS5jc3MubWFwKGZpbGUgPT4gKHtcbiAgICAgIHVybDogYnVuZGxlZEpzQ3NzVXJsUmV3cml0ZUhvb2soZmlsZS51cmwpLFxuICAgIH0pKTtcbiAgfVxuXG4gIGF3YWl0IFdlYkFwcEludGVybmFscy5yZWxvYWRDbGllbnRQcm9ncmFtcygpO1xuXG4gIC8vIHdlYnNlcnZlclxuICB2YXIgYXBwID0gY3JlYXRlRXhwcmVzc0FwcCgpXG5cbiAgLy8gUGFja2FnZXMgYW5kIGFwcHMgY2FuIGFkZCBoYW5kbGVycyB0aGF0IHJ1biBiZWZvcmUgYW55IG90aGVyIE1ldGVvclxuICAvLyBoYW5kbGVycyB2aWEgV2ViQXBwLnJhd0V4cHJlc3NIYW5kbGVycy5cbiAgdmFyIHJhd0V4cHJlc3NIYW5kbGVycyA9IGNyZWF0ZUV4cHJlc3NBcHAoKVxuICBhcHAudXNlKHJhd0V4cHJlc3NIYW5kbGVycyk7XG5cbiAgLy8gQXV0by1jb21wcmVzcyBhbnkganNvbiwgamF2YXNjcmlwdCwgb3IgdGV4dC5cbiAgYXBwLnVzZShjb21wcmVzcyh7IGZpbHRlcjogc2hvdWxkQ29tcHJlc3MgfSkpO1xuXG4gIC8vIHBhcnNlIGNvb2tpZXMgaW50byBhbiBvYmplY3RcbiAgYXBwLnVzZShjb29raWVQYXJzZXIoKSk7XG5cbiAgLy8gV2UncmUgbm90IGEgcHJveHk7IHJlamVjdCAod2l0aG91dCBjcmFzaGluZykgYXR0ZW1wdHMgdG8gdHJlYXQgdXMgbGlrZVxuICAvLyBvbmUuIChTZWUgIzEyMTIuKVxuICBhcHAudXNlKGZ1bmN0aW9uKHJlcSwgcmVzLCBuZXh0KSB7XG4gICAgaWYgKFJvdXRlUG9saWN5LmlzVmFsaWRVcmwocmVxLnVybCkpIHtcbiAgICAgIG5leHQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcmVzLndyaXRlSGVhZCg0MDApO1xuICAgIHJlcy53cml0ZSgnTm90IGEgcHJveHknKTtcbiAgICByZXMuZW5kKCk7XG4gIH0pO1xuXG4gIGZ1bmN0aW9uIGdldFBhdGhQYXJ0cyhwYXRoKSB7XG4gICAgY29uc3QgcGFydHMgPSBwYXRoLnNwbGl0KCcvJyk7XG4gICAgd2hpbGUgKHBhcnRzWzBdID09PSAnJykgcGFydHMuc2hpZnQoKTtcbiAgICByZXR1cm4gcGFydHM7XG4gIH1cblxuICBmdW5jdGlvbiBpc1ByZWZpeE9mKHByZWZpeCwgYXJyYXkpIHtcbiAgICByZXR1cm4gKFxuICAgICAgcHJlZml4Lmxlbmd0aCA8PSBhcnJheS5sZW5ndGggJiZcbiAgICAgIHByZWZpeC5ldmVyeSgocGFydCwgaSkgPT4gcGFydCA9PT0gYXJyYXlbaV0pXG4gICAgKTtcbiAgfVxuXG4gIC8vIFN0cmlwIG9mZiB0aGUgcGF0aCBwcmVmaXgsIGlmIGl0IGV4aXN0cy5cbiAgYXBwLnVzZShmdW5jdGlvbihyZXF1ZXN0LCByZXNwb25zZSwgbmV4dCkge1xuICAgIGNvbnN0IHBhdGhQcmVmaXggPSBfX21ldGVvcl9ydW50aW1lX2NvbmZpZ19fLlJPT1RfVVJMX1BBVEhfUFJFRklYO1xuICAgIGNvbnN0IHsgcGF0aG5hbWUsIHNlYXJjaCB9ID0gcGFyc2VVcmwocmVxdWVzdC51cmwpO1xuXG4gICAgLy8gY2hlY2sgaWYgdGhlIHBhdGggaW4gdGhlIHVybCBzdGFydHMgd2l0aCB0aGUgcGF0aCBwcmVmaXhcbiAgICBpZiAocGF0aFByZWZpeCkge1xuICAgICAgY29uc3QgcHJlZml4UGFydHMgPSBnZXRQYXRoUGFydHMocGF0aFByZWZpeCk7XG4gICAgICBjb25zdCBwYXRoUGFydHMgPSBnZXRQYXRoUGFydHMocGF0aG5hbWUpO1xuICAgICAgaWYgKGlzUHJlZml4T2YocHJlZml4UGFydHMsIHBhdGhQYXJ0cykpIHtcbiAgICAgICAgcmVxdWVzdC51cmwgPSAnLycgKyBwYXRoUGFydHMuc2xpY2UocHJlZml4UGFydHMubGVuZ3RoKS5qb2luKCcvJyk7XG4gICAgICAgIGlmIChzZWFyY2gpIHtcbiAgICAgICAgICByZXF1ZXN0LnVybCArPSBzZWFyY2g7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5leHQoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAocGF0aG5hbWUgPT09ICcvZmF2aWNvbi5pY28nIHx8IHBhdGhuYW1lID09PSAnL3JvYm90cy50eHQnKSB7XG4gICAgICByZXR1cm4gbmV4dCgpO1xuICAgIH1cblxuICAgIGlmIChwYXRoUHJlZml4KSB7XG4gICAgICByZXNwb25zZS53cml0ZUhlYWQoNDA0KTtcbiAgICAgIHJlc3BvbnNlLndyaXRlKCdVbmtub3duIHBhdGgnKTtcbiAgICAgIHJlc3BvbnNlLmVuZCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIG5leHQoKTtcbiAgfSk7XG5cbiAgLy8gU2VydmUgc3RhdGljIGZpbGVzIGZyb20gdGhlIG1hbmlmZXN0LlxuICAvLyBUaGlzIGlzIGluc3BpcmVkIGJ5IHRoZSAnc3RhdGljJyBtaWRkbGV3YXJlLlxuICBhcHAudXNlKGZ1bmN0aW9uKHJlcSwgcmVzLCBuZXh0KSB7XG4gICAgLy8gY29uc29sZS5sb2coU3RyaW5nKGFyZ3VtZW50cy5jYWxsZWUpKTtcbiAgICBXZWJBcHBJbnRlcm5hbHMuc3RhdGljRmlsZXNNaWRkbGV3YXJlKFxuICAgICAgV2ViQXBwSW50ZXJuYWxzLnN0YXRpY0ZpbGVzQnlBcmNoLFxuICAgICAgcmVxLFxuICAgICAgcmVzLFxuICAgICAgbmV4dFxuICAgICk7XG4gIH0pO1xuXG4gIC8vIENvcmUgTWV0ZW9yIHBhY2thZ2VzIGxpa2UgZHluYW1pYy1pbXBvcnQgY2FuIGFkZCBoYW5kbGVycyBiZWZvcmVcbiAgLy8gb3RoZXIgaGFuZGxlcnMgYWRkZWQgYnkgcGFja2FnZSBhbmQgYXBwbGljYXRpb24gY29kZS5cbiAgYXBwLnVzZSgoV2ViQXBwSW50ZXJuYWxzLm1ldGVvckludGVybmFsSGFuZGxlcnMgPSBjcmVhdGVFeHByZXNzQXBwKCkpKTtcblxuICAvKipcbiAgICogQG5hbWUgZXhwcmVzc0hhbmRsZXJzQ2FsbGJhY2socmVxLCByZXMsIG5leHQpXG4gICAqIEBsb2N1cyBTZXJ2ZXJcbiAgICogQGlzcHJvdG90eXBlIHRydWVcbiAgICogQHN1bW1hcnkgY2FsbGJhY2sgaGFuZGxlciBmb3IgYFdlYkFwcC5leHByZXNzSGFuZGxlcnNgXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXFcbiAgICogYSBOb2RlLmpzXG4gICAqIFtJbmNvbWluZ01lc3NhZ2VdKGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvaHR0cC5odG1sI2NsYXNzLWh0dHBpbmNvbWluZ21lc3NhZ2UpXG4gICAqIG9iamVjdCB3aXRoIHNvbWUgZXh0cmEgcHJvcGVydGllcy4gVGhpcyBhcmd1bWVudCBjYW4gYmUgdXNlZFxuICAgKiAgdG8gZ2V0IGluZm9ybWF0aW9uIGFib3V0IHRoZSBpbmNvbWluZyByZXF1ZXN0LlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVzXG4gICAqIGEgTm9kZS5qc1xuICAgKiBbU2VydmVyUmVzcG9uc2VdKGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvaHR0cC5odG1sI2NsYXNzLWh0dHBzZXJ2ZXJyZXNwb25zZSlcbiAgICogb2JqZWN0LiBVc2UgdGhpcyB0byB3cml0ZSBkYXRhIHRoYXQgc2hvdWxkIGJlIHNlbnQgaW4gcmVzcG9uc2UgdG8gdGhlXG4gICAqIHJlcXVlc3QsIGFuZCBjYWxsIGByZXMuZW5kKClgIHdoZW4geW91IGFyZSBkb25lLlxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XG4gICAqIENhbGxpbmcgdGhpcyBmdW5jdGlvbiB3aWxsIHBhc3Mgb24gdGhlIGhhbmRsaW5nIG9mXG4gICAqIHRoaXMgcmVxdWVzdCB0byB0aGUgbmV4dCByZWxldmFudCBoYW5kbGVyLlxuICAgKlxuICAgKi9cblxuICAvKipcbiAgICogQG1ldGhvZCBoYW5kbGVyc1xuICAgKiBAbWVtYmVyb2YgV2ViQXBwXG4gICAqIEBsb2N1cyBTZXJ2ZXJcbiAgICogQHN1bW1hcnkgUmVnaXN0ZXIgYSBoYW5kbGVyIGZvciBhbGwgSFRUUCByZXF1ZXN0cy5cbiAgICogQHBhcmFtIHtTdHJpbmd9IFtwYXRoXVxuICAgKiBUaGlzIGhhbmRsZXIgd2lsbCBvbmx5IGJlIGNhbGxlZCBvbiBwYXRocyB0aGF0IG1hdGNoXG4gICAqIHRoaXMgc3RyaW5nLiBUaGUgbWF0Y2ggaGFzIHRvIGJvcmRlciBvbiBhIGAvYCBvciBhIGAuYC5cbiAgICpcbiAgICogRm9yIGV4YW1wbGUsIGAvaGVsbG9gIHdpbGwgbWF0Y2ggYC9oZWxsby93b3JsZGAgYW5kXG4gICAqIGAvaGVsbG8ud29ybGRgLCBidXQgbm90IGAvaGVsbG9fd29ybGRgLlxuICAgKiBAcGFyYW0ge2V4cHJlc3NIYW5kbGVyc0NhbGxiYWNrfSBoYW5kbGVyXG4gICAqIEEgaGFuZGxlciBmdW5jdGlvbiB0aGF0IHdpbGwgYmUgY2FsbGVkIG9uIEhUVFAgcmVxdWVzdHMuXG4gICAqIFNlZSBgZXhwcmVzc0hhbmRsZXJzQ2FsbGJhY2tgXG4gICAqXG4gICAqL1xuICAvLyBQYWNrYWdlcyBhbmQgYXBwcyBjYW4gYWRkIGhhbmRsZXJzIHRvIHRoaXMgdmlhIFdlYkFwcC5leHByZXNzSGFuZGxlcnMuXG4gIC8vIFRoZXkgYXJlIGluc2VydGVkIGJlZm9yZSBvdXIgZGVmYXVsdCBoYW5kbGVyLlxuICB2YXIgcGFja2FnZUFuZEFwcEhhbmRsZXJzID0gY3JlYXRlRXhwcmVzc0FwcCgpXG4gIGFwcC51c2UocGFja2FnZUFuZEFwcEhhbmRsZXJzKTtcblxuICBsZXQgc3VwcHJlc3NFeHByZXNzRXJyb3JzID0gZmFsc2U7XG4gIC8vIEV4cHJlc3Mga25vd3MgaXQgaXMgYW4gZXJyb3IgaGFuZGxlciBiZWNhdXNlIGl0IGhhcyA0IGFyZ3VtZW50cyBpbnN0ZWFkIG9mXG4gIC8vIDMuIGdvIGZpZ3VyZS4gIChJdCBpcyBub3Qgc21hcnQgZW5vdWdoIHRvIGZpbmQgc3VjaCBhIHRoaW5nIGlmIGl0J3MgaGlkZGVuXG4gIC8vIGluc2lkZSBwYWNrYWdlQW5kQXBwSGFuZGxlcnMuKVxuICBhcHAudXNlKGZ1bmN0aW9uKGVyciwgcmVxLCByZXMsIG5leHQpIHtcbiAgICBpZiAoIWVyciB8fCAhc3VwcHJlc3NFeHByZXNzRXJyb3JzIHx8ICFyZXEuaGVhZGVyc1sneC1zdXBwcmVzcy1lcnJvciddKSB7XG4gICAgICBuZXh0KGVycik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHJlcy53cml0ZUhlYWQoZXJyLnN0YXR1cywgeyAnQ29udGVudC1UeXBlJzogJ3RleHQvcGxhaW4nIH0pO1xuICAgIHJlcy5lbmQoJ0FuIGVycm9yIG1lc3NhZ2UnKTtcbiAgfSk7XG5cbiAgYXBwLnVzZShhc3luYyBmdW5jdGlvbihyZXEsIHJlcywgbmV4dCkge1xuICAgIGlmICghYXBwVXJsKHJlcS51cmwpKSB7XG4gICAgICByZXR1cm4gbmV4dCgpO1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICByZXEubWV0aG9kICE9PSAnSEVBRCcgJiZcbiAgICAgIHJlcS5tZXRob2QgIT09ICdHRVQnICYmXG4gICAgICAhTWV0ZW9yLnNldHRpbmdzLnBhY2thZ2VzPy53ZWJhcHA/LmFsd2F5c1JldHVybkNvbnRlbnRcbiAgICApIHtcbiAgICAgIGNvbnN0IHN0YXR1cyA9IHJlcS5tZXRob2QgPT09ICdPUFRJT05TJyA/IDIwMCA6IDQwNTtcbiAgICAgIHJlcy53cml0ZUhlYWQoc3RhdHVzLCB7XG4gICAgICAgIEFsbG93OiAnT1BUSU9OUywgR0VULCBIRUFEJyxcbiAgICAgICAgJ0NvbnRlbnQtTGVuZ3RoJzogJzAnLFxuICAgICAgfSk7XG4gICAgICByZXMuZW5kKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBoZWFkZXJzID0ge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ3RleHQvaHRtbDsgY2hhcnNldD11dGYtOCcsXG4gICAgICB9O1xuXG4gICAgICBpZiAoc2h1dHRpbmdEb3duKSB7XG4gICAgICAgIGhlYWRlcnNbJ0Nvbm5lY3Rpb24nXSA9ICdDbG9zZSc7XG4gICAgICB9XG5cbiAgICAgIHZhciByZXF1ZXN0ID0gV2ViQXBwLmNhdGVnb3JpemVSZXF1ZXN0KHJlcSk7XG5cbiAgICAgIGlmIChyZXF1ZXN0LnVybC5xdWVyeSAmJiByZXF1ZXN0LnVybC5xdWVyeVsnbWV0ZW9yX2Nzc19yZXNvdXJjZSddKSB7XG4gICAgICAgIC8vIEluIHRoaXMgY2FzZSwgd2UncmUgcmVxdWVzdGluZyBhIENTUyByZXNvdXJjZSBpbiB0aGUgbWV0ZW9yLXNwZWNpZmljXG4gICAgICAgIC8vIHdheSwgYnV0IHdlIGRvbid0IGhhdmUgaXQuICBTZXJ2ZSBhIHN0YXRpYyBjc3MgZmlsZSB0aGF0IGluZGljYXRlcyB0aGF0XG4gICAgICAgIC8vIHdlIGRpZG4ndCBoYXZlIGl0LCBzbyB3ZSBjYW4gZGV0ZWN0IHRoYXQgYW5kIHJlZnJlc2guICBNYWtlIHN1cmVcbiAgICAgICAgLy8gdGhhdCBhbnkgcHJveGllcyBvciBDRE5zIGRvbid0IGNhY2hlIHRoaXMgZXJyb3IhICAoTm9ybWFsbHkgcHJveGllc1xuICAgICAgICAvLyBvciBDRE5zIGFyZSBzbWFydCBlbm91Z2ggbm90IHRvIGNhY2hlIGVycm9yIHBhZ2VzLCBidXQgaW4gb3JkZXIgdG9cbiAgICAgICAgLy8gbWFrZSB0aGlzIGhhY2sgd29yaywgd2UgbmVlZCB0byByZXR1cm4gdGhlIENTUyBmaWxlIGFzIGEgMjAwLCB3aGljaFxuICAgICAgICAvLyB3b3VsZCBvdGhlcndpc2UgYmUgY2FjaGVkLilcbiAgICAgICAgaGVhZGVyc1snQ29udGVudC1UeXBlJ10gPSAndGV4dC9jc3M7IGNoYXJzZXQ9dXRmLTgnO1xuICAgICAgICBoZWFkZXJzWydDYWNoZS1Db250cm9sJ10gPSAnbm8tY2FjaGUnO1xuICAgICAgICByZXMud3JpdGVIZWFkKDIwMCwgaGVhZGVycyk7XG4gICAgICAgIHJlcy53cml0ZSgnLm1ldGVvci1jc3Mtbm90LWZvdW5kLWVycm9yIHsgd2lkdGg6IDBweDt9Jyk7XG4gICAgICAgIHJlcy5lbmQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVxdWVzdC51cmwucXVlcnkgJiYgcmVxdWVzdC51cmwucXVlcnlbJ21ldGVvcl9qc19yZXNvdXJjZSddKSB7XG4gICAgICAgIC8vIFNpbWlsYXJseSwgd2UncmUgcmVxdWVzdGluZyBhIEpTIHJlc291cmNlIHRoYXQgd2UgZG9uJ3QgaGF2ZS5cbiAgICAgICAgLy8gU2VydmUgYW4gdW5jYWNoZWQgNDA0LiAoV2UgY2FuJ3QgdXNlIHRoZSBzYW1lIGhhY2sgd2UgdXNlIGZvciBDU1MsXG4gICAgICAgIC8vIGJlY2F1c2UgYWN0dWFsbHkgYWN0aW5nIG9uIHRoYXQgaGFjayByZXF1aXJlcyB1cyB0byBoYXZlIHRoZSBKU1xuICAgICAgICAvLyBhbHJlYWR5ISlcbiAgICAgICAgaGVhZGVyc1snQ2FjaGUtQ29udHJvbCddID0gJ25vLWNhY2hlJztcbiAgICAgICAgcmVzLndyaXRlSGVhZCg0MDQsIGhlYWRlcnMpO1xuICAgICAgICByZXMuZW5kKCc0MDQgTm90IEZvdW5kJyk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKHJlcXVlc3QudXJsLnF1ZXJ5ICYmIHJlcXVlc3QudXJsLnF1ZXJ5WydtZXRlb3JfZG9udF9zZXJ2ZV9pbmRleCddKSB7XG4gICAgICAgIC8vIFdoZW4gZG93bmxvYWRpbmcgZmlsZXMgZHVyaW5nIGEgQ29yZG92YSBob3QgY29kZSBwdXNoLCB3ZSBuZWVkXG4gICAgICAgIC8vIHRvIGRldGVjdCBpZiBhIGZpbGUgaXMgbm90IGF2YWlsYWJsZSBpbnN0ZWFkIG9mIGluYWR2ZXJ0ZW50bHlcbiAgICAgICAgLy8gZG93bmxvYWRpbmcgdGhlIGRlZmF1bHQgaW5kZXggcGFnZS5cbiAgICAgICAgLy8gU28gc2ltaWxhciB0byB0aGUgc2l0dWF0aW9uIGFib3ZlLCB3ZSBzZXJ2ZSBhbiB1bmNhY2hlZCA0MDQuXG4gICAgICAgIGhlYWRlcnNbJ0NhY2hlLUNvbnRyb2wnXSA9ICduby1jYWNoZSc7XG4gICAgICAgIHJlcy53cml0ZUhlYWQoNDA0LCBoZWFkZXJzKTtcbiAgICAgICAgcmVzLmVuZCgnNDA0IE5vdCBGb3VuZCcpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHsgYXJjaCB9ID0gcmVxdWVzdDtcbiAgICAgIGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgYXJjaCwgJ3N0cmluZycsIHsgYXJjaCB9KTtcblxuICAgICAgaWYgKCFoYXNPd24uY2FsbChXZWJBcHAuY2xpZW50UHJvZ3JhbXMsIGFyY2gpKSB7XG4gICAgICAgIC8vIFdlIGNvdWxkIGNvbWUgaGVyZSBpbiBjYXNlIHdlIHJ1biB3aXRoIHNvbWUgYXJjaGl0ZWN0dXJlcyBleGNsdWRlZFxuICAgICAgICBoZWFkZXJzWydDYWNoZS1Db250cm9sJ10gPSAnbm8tY2FjaGUnO1xuICAgICAgICByZXMud3JpdGVIZWFkKDQwNCwgaGVhZGVycyk7XG4gICAgICAgIGlmIChNZXRlb3IuaXNEZXZlbG9wbWVudCkge1xuICAgICAgICAgIHJlcy5lbmQoYE5vIGNsaWVudCBwcm9ncmFtIGZvdW5kIGZvciB0aGUgJHthcmNofSBhcmNoaXRlY3R1cmUuYCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gU2FmZXR5IG5ldCwgYnV0IHRoaXMgYnJhbmNoIHNob3VsZCBub3QgYmUgcG9zc2libGUuXG4gICAgICAgICAgcmVzLmVuZCgnNDA0IE5vdCBGb3VuZCcpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gSWYgcGF1c2VDbGllbnQoYXJjaCkgaGFzIGJlZW4gY2FsbGVkLCBwcm9ncmFtLnBhdXNlZCB3aWxsIGJlIGFcbiAgICAgIC8vIFByb21pc2UgdGhhdCB3aWxsIGJlIHJlc29sdmVkIHdoZW4gdGhlIHByb2dyYW0gaXMgdW5wYXVzZWQuXG4gICAgICBhd2FpdCBXZWJBcHAuY2xpZW50UHJvZ3JhbXNbYXJjaF0ucGF1c2VkO1xuXG4gICAgICByZXR1cm4gZ2V0Qm9pbGVycGxhdGVBc3luYyhyZXF1ZXN0LCBhcmNoKVxuICAgICAgICAudGhlbigoeyBzdHJlYW0sIHN0YXR1c0NvZGUsIGhlYWRlcnM6IG5ld0hlYWRlcnMgfSkgPT4ge1xuICAgICAgICAgIGlmICghc3RhdHVzQ29kZSkge1xuICAgICAgICAgICAgc3RhdHVzQ29kZSA9IHJlcy5zdGF0dXNDb2RlID8gcmVzLnN0YXR1c0NvZGUgOiAyMDA7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKG5ld0hlYWRlcnMpIHtcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oaGVhZGVycywgbmV3SGVhZGVycyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmVzLndyaXRlSGVhZChzdGF0dXNDb2RlLCBoZWFkZXJzKTtcblxuICAgICAgICAgIHN0cmVhbS5waXBlKHJlcywge1xuICAgICAgICAgICAgLy8gRW5kIHRoZSByZXNwb25zZSB3aGVuIHRoZSBzdHJlYW0gZW5kcy5cbiAgICAgICAgICAgIGVuZDogdHJ1ZSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBMb2cuZXJyb3IoJ0Vycm9yIHJ1bm5pbmcgdGVtcGxhdGU6ICcgKyBlcnJvci5zdGFjayk7XG4gICAgICAgICAgcmVzLndyaXRlSGVhZCg1MDAsIGhlYWRlcnMpO1xuICAgICAgICAgIHJlcy5lbmQoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICB9KTtcblxuICAvLyBSZXR1cm4gNDA0IGJ5IGRlZmF1bHQsIGlmIG5vIG90aGVyIGhhbmRsZXJzIHNlcnZlIHRoaXMgVVJMLlxuICBhcHAudXNlKGZ1bmN0aW9uKHJlcSwgcmVzKSB7XG4gICAgcmVzLndyaXRlSGVhZCg0MDQpO1xuICAgIHJlcy5lbmQoKTtcbiAgfSk7XG5cbiAgdmFyIGh0dHBTZXJ2ZXIgPSBjcmVhdGVTZXJ2ZXIoYXBwKTtcbiAgdmFyIG9uTGlzdGVuaW5nQ2FsbGJhY2tzID0gW107XG5cbiAgLy8gQWZ0ZXIgNSBzZWNvbmRzIHcvbyBkYXRhIG9uIGEgc29ja2V0LCBraWxsIGl0LiAgT24gdGhlIG90aGVyIGhhbmQsIGlmXG4gIC8vIHRoZXJlJ3MgYW4gb3V0c3RhbmRpbmcgcmVxdWVzdCwgZ2l2ZSBpdCBhIGhpZ2hlciB0aW1lb3V0IGluc3RlYWQgKHRvIGF2b2lkXG4gIC8vIGtpbGxpbmcgbG9uZy1wb2xsaW5nIHJlcXVlc3RzKVxuICBodHRwU2VydmVyLnNldFRpbWVvdXQoU0hPUlRfU09DS0VUX1RJTUVPVVQpO1xuXG4gIC8vIERvIHRoaXMgaGVyZSwgYW5kIHRoZW4gYWxzbyBpbiBsaXZlZGF0YS9zdHJlYW1fc2VydmVyLmpzLCBiZWNhdXNlXG4gIC8vIHN0cmVhbV9zZXJ2ZXIuanMga2lsbHMgYWxsIHRoZSBjdXJyZW50IHJlcXVlc3QgaGFuZGxlcnMgd2hlbiBpbnN0YWxsaW5nIGl0c1xuICAvLyBvd24uXG4gIGh0dHBTZXJ2ZXIub24oJ3JlcXVlc3QnLCBXZWJBcHAuX3RpbWVvdXRBZGp1c3RtZW50UmVxdWVzdENhbGxiYWNrKTtcblxuICAvLyBJZiB0aGUgY2xpZW50IGdhdmUgdXMgYSBiYWQgcmVxdWVzdCwgdGVsbCBpdCBpbnN0ZWFkIG9mIGp1c3QgY2xvc2luZyB0aGVcbiAgLy8gc29ja2V0LiBUaGlzIGxldHMgbG9hZCBiYWxhbmNlcnMgaW4gZnJvbnQgb2YgdXMgZGlmZmVyZW50aWF0ZSBiZXR3ZWVuIFwiYVxuICAvLyBzZXJ2ZXIgaXMgcmFuZG9tbHkgY2xvc2luZyBzb2NrZXRzIGZvciBubyByZWFzb25cIiBhbmQgXCJjbGllbnQgc2VudCBhIGJhZFxuICAvLyByZXF1ZXN0XCIuXG4gIC8vXG4gIC8vIFRoaXMgd2lsbCBvbmx5IHdvcmsgb24gTm9kZSA2OyBOb2RlIDQgZGVzdHJveXMgdGhlIHNvY2tldCBiZWZvcmUgY2FsbGluZ1xuICAvLyB0aGlzIGV2ZW50LiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL3B1bGwvNDU1Ny8gZm9yIGRldGFpbHMuXG4gIGh0dHBTZXJ2ZXIub24oJ2NsaWVudEVycm9yJywgKGVyciwgc29ja2V0KSA9PiB7XG4gICAgLy8gUHJlLU5vZGUtNiwgZG8gbm90aGluZy5cbiAgICBpZiAoc29ja2V0LmRlc3Ryb3llZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChlcnIubWVzc2FnZSA9PT0gJ1BhcnNlIEVycm9yJykge1xuICAgICAgc29ja2V0LmVuZCgnSFRUUC8xLjEgNDAwIEJhZCBSZXF1ZXN0XFxyXFxuXFxyXFxuJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEZvciBvdGhlciBlcnJvcnMsIHVzZSB0aGUgZGVmYXVsdCBiZWhhdmlvciBhcyBpZiB3ZSBoYWQgbm8gY2xpZW50RXJyb3JcbiAgICAgIC8vIGhhbmRsZXIuXG4gICAgICBzb2NrZXQuZGVzdHJveShlcnIpO1xuICAgIH1cbiAgfSk7XG5cbiAgY29uc3Qgc3VwcHJlc3NFcnJvcnMgPSBmdW5jdGlvbigpIHtcbiAgICBzdXBwcmVzc0V4cHJlc3NFcnJvcnMgPSB0cnVlO1xuICB9O1xuXG4gIGxldCB3YXJuZWRBYm91dENvbm5lY3RVc2FnZSA9IGZhbHNlO1xuXG4gIC8vIHN0YXJ0IHVwIGFwcFxuICBPYmplY3QuYXNzaWduKFdlYkFwcCwge1xuICAgIGNvbm5lY3RIYW5kbGVyczogcGFja2FnZUFuZEFwcEhhbmRsZXJzLFxuICAgIGhhbmRsZXJzOiBwYWNrYWdlQW5kQXBwSGFuZGxlcnMsXG4gICAgcmF3Q29ubmVjdEhhbmRsZXJzOiByYXdFeHByZXNzSGFuZGxlcnMsXG4gICAgcmF3SGFuZGxlcnM6IHJhd0V4cHJlc3NIYW5kbGVycyxcbiAgICBodHRwU2VydmVyOiBodHRwU2VydmVyLFxuICAgIGV4cHJlc3NBcHA6IGFwcCxcbiAgICAvLyBGb3IgdGVzdGluZy5cbiAgICBzdXBwcmVzc0Nvbm5lY3RFcnJvcnM6ICgpID0+IHtcbiAgICAgIGlmICghIHdhcm5lZEFib3V0Q29ubmVjdFVzYWdlKSB7XG4gICAgICAgIE1ldGVvci5fZGVidWcoXCJXZWJBcHAuc3VwcHJlc3NDb25uZWN0RXJyb3JzIGhhcyBiZWVuIHJlbmFtZWQgdG8gTWV0ZW9yLl9zdXBwcmVzc0V4cHJlc3NFcnJvcnMgYW5kIGl0IHNob3VsZCBiZSB1c2VkIG9ubHkgaW4gdGVzdHMuXCIpO1xuICAgICAgICB3YXJuZWRBYm91dENvbm5lY3RVc2FnZSA9IHRydWU7XG4gICAgICB9XG4gICAgICBzdXBwcmVzc0Vycm9ycygpO1xuICAgIH0sXG4gICAgX3N1cHByZXNzRXhwcmVzc0Vycm9yczogc3VwcHJlc3NFcnJvcnMsXG4gICAgb25MaXN0ZW5pbmc6IGZ1bmN0aW9uKGYpIHtcbiAgICAgIGlmIChvbkxpc3RlbmluZ0NhbGxiYWNrcykgb25MaXN0ZW5pbmdDYWxsYmFja3MucHVzaChmKTtcbiAgICAgIGVsc2UgZigpO1xuICAgIH0sXG4gICAgLy8gVGhpcyBjYW4gYmUgb3ZlcnJpZGRlbiBieSB1c2VycyB3aG8gd2FudCB0byBtb2RpZnkgaG93IGxpc3RlbmluZyB3b3Jrc1xuICAgIC8vIChlZywgdG8gcnVuIGEgcHJveHkgbGlrZSBBcG9sbG8gRW5naW5lIFByb3h5IGluIGZyb250IG9mIHRoZSBzZXJ2ZXIpLlxuICAgIHN0YXJ0TGlzdGVuaW5nOiBmdW5jdGlvbihodHRwU2VydmVyLCBsaXN0ZW5PcHRpb25zLCBjYikge1xuICAgICAgaHR0cFNlcnZlci5saXN0ZW4obGlzdGVuT3B0aW9ucywgY2IpO1xuICAgIH0sXG4gIH0pO1xuXG4gICAgLyoqXG4gICAqIEBuYW1lIG1haW5cbiAgICogQGxvY3VzIFNlcnZlclxuICAgKiBAc3VtbWFyeSBTdGFydHMgdGhlIEhUVFAgc2VydmVyLlxuICAgKiAgSWYgYFVOSVhfU09DS0VUX1BBVEhgIGlzIHByZXNlbnQgTWV0ZW9yJ3MgSFRUUCBzZXJ2ZXIgd2lsbCB1c2UgdGhhdCBzb2NrZXQgZmlsZSBmb3IgaW50ZXItcHJvY2VzcyBjb21tdW5pY2F0aW9uLCBpbnN0ZWFkIG9mIFRDUC5cbiAgICogSWYgeW91IGNob29zZSB0byBub3QgaW5jbHVkZSB3ZWJhcHAgcGFja2FnZSBpbiB5b3VyIGFwcGxpY2F0aW9uIHRoaXMgbWV0aG9kIHN0aWxsIG11c3QgYmUgZGVmaW5lZCBmb3IgeW91ciBNZXRlb3IgYXBwbGljYXRpb24gdG8gd29yay5cbiAgICovXG4gIC8vIExldCB0aGUgcmVzdCBvZiB0aGUgcGFja2FnZXMgKGFuZCBNZXRlb3Iuc3RhcnR1cCBob29rcykgaW5zZXJ0IEV4cHJlc3NcbiAgLy8gbWlkZGxld2FyZXMgYW5kIHVwZGF0ZSBfX21ldGVvcl9ydW50aW1lX2NvbmZpZ19fLCB0aGVuIGtlZXAgZ29pbmcgdG8gc2V0IHVwXG4gIC8vIGFjdHVhbGx5IHNlcnZpbmcgSFRNTC5cbiAgZXhwb3J0cy5tYWluID0gYXN5bmMgYXJndiA9PiB7XG4gICAgYXdhaXQgV2ViQXBwSW50ZXJuYWxzLmdlbmVyYXRlQm9pbGVycGxhdGUoKTtcblxuICAgIGNvbnN0IHN0YXJ0SHR0cFNlcnZlciA9IGxpc3Rlbk9wdGlvbnMgPT4ge1xuICAgICAgV2ViQXBwLnN0YXJ0TGlzdGVuaW5nKFxuICAgICAgICBhcmd2Py5odHRwU2VydmVyIHx8IGh0dHBTZXJ2ZXIsXG4gICAgICAgIGxpc3Rlbk9wdGlvbnMsXG4gICAgICAgIE1ldGVvci5iaW5kRW52aXJvbm1lbnQoXG4gICAgICAgICAgKCkgPT4ge1xuICAgICAgICAgICAgaWYgKHByb2Nlc3MuZW52Lk1FVEVPUl9QUklOVF9PTl9MSVNURU4pIHtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0xJU1RFTklORycpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY2FsbGJhY2tzID0gb25MaXN0ZW5pbmdDYWxsYmFja3M7XG4gICAgICAgICAgICBvbkxpc3RlbmluZ0NhbGxiYWNrcyA9IG51bGw7XG4gICAgICAgICAgICBjYWxsYmFja3M/LmZvckVhY2goY2FsbGJhY2sgPT4ge1xuICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBlID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGxpc3RlbmluZzonLCBlKTtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSAmJiBlLnN0YWNrKTtcbiAgICAgICAgICB9XG4gICAgICAgIClcbiAgICAgICk7XG4gICAgfTtcblxuICAgIGxldCBsb2NhbFBvcnQgPSBwcm9jZXNzLmVudi5QT1JUIHx8IDA7XG4gICAgbGV0IHVuaXhTb2NrZXRQYXRoID0gcHJvY2Vzcy5lbnYuVU5JWF9TT0NLRVRfUEFUSDtcblxuICAgIGlmICh1bml4U29ja2V0UGF0aCkge1xuICAgICAgaWYgKGNsdXN0ZXIuaXNXb3JrZXIpIHtcbiAgICAgICAgY29uc3Qgd29ya2VyTmFtZSA9IGNsdXN0ZXIud29ya2VyLnByb2Nlc3MuZW52Lm5hbWUgfHwgY2x1c3Rlci53b3JrZXIuaWQ7XG4gICAgICAgIHVuaXhTb2NrZXRQYXRoICs9ICcuJyArIHdvcmtlck5hbWUgKyAnLnNvY2snO1xuICAgICAgfVxuICAgICAgLy8gU3RhcnQgdGhlIEhUVFAgc2VydmVyIHVzaW5nIGEgc29ja2V0IGZpbGUuXG4gICAgICByZW1vdmVFeGlzdGluZ1NvY2tldEZpbGUodW5peFNvY2tldFBhdGgpO1xuICAgICAgc3RhcnRIdHRwU2VydmVyKHsgcGF0aDogdW5peFNvY2tldFBhdGggfSk7XG5cbiAgICAgIGNvbnN0IHVuaXhTb2NrZXRQZXJtaXNzaW9ucyA9IChcbiAgICAgICAgcHJvY2Vzcy5lbnYuVU5JWF9TT0NLRVRfUEVSTUlTU0lPTlMgfHwgJydcbiAgICAgICkudHJpbSgpO1xuICAgICAgaWYgKHVuaXhTb2NrZXRQZXJtaXNzaW9ucykge1xuICAgICAgICBpZiAoL15bMC03XXszfSQvLnRlc3QodW5peFNvY2tldFBlcm1pc3Npb25zKSkge1xuICAgICAgICAgIGNobW9kU3luYyh1bml4U29ja2V0UGF0aCwgcGFyc2VJbnQodW5peFNvY2tldFBlcm1pc3Npb25zLCA4KSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIFVOSVhfU09DS0VUX1BFUk1JU1NJT05TIHNwZWNpZmllZCcpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHVuaXhTb2NrZXRHcm91cCA9IChwcm9jZXNzLmVudi5VTklYX1NPQ0tFVF9HUk9VUCB8fCAnJykudHJpbSgpO1xuICAgICAgaWYgKHVuaXhTb2NrZXRHcm91cCkge1xuICAgICAgICBjb25zdCB1bml4U29ja2V0R3JvdXBJbmZvID0gZ2V0R3JvdXBJbmZvKHVuaXhTb2NrZXRHcm91cCk7XG4gICAgICAgIGlmICh1bml4U29ja2V0R3JvdXBJbmZvID09PSBudWxsKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIFVOSVhfU09DS0VUX0dST1VQIG5hbWUgc3BlY2lmaWVkJyk7XG4gICAgICAgIH1cbiAgICAgICAgY2hvd25TeW5jKHVuaXhTb2NrZXRQYXRoLCB1c2VySW5mbygpLnVpZCwgdW5peFNvY2tldEdyb3VwSW5mby5naWQpO1xuICAgICAgfVxuXG4gICAgICByZWdpc3RlclNvY2tldEZpbGVDbGVhbnVwKHVuaXhTb2NrZXRQYXRoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbG9jYWxQb3J0ID0gaXNOYU4oTnVtYmVyKGxvY2FsUG9ydCkpID8gbG9jYWxQb3J0IDogTnVtYmVyKGxvY2FsUG9ydCk7XG4gICAgICBpZiAoL1xcXFxcXFxcPy4rXFxcXHBpcGVcXFxcPy4rLy50ZXN0KGxvY2FsUG9ydCkpIHtcbiAgICAgICAgLy8gU3RhcnQgdGhlIEhUVFAgc2VydmVyIHVzaW5nIFdpbmRvd3MgU2VydmVyIHN0eWxlIG5hbWVkIHBpcGUuXG4gICAgICAgIHN0YXJ0SHR0cFNlcnZlcih7IHBhdGg6IGxvY2FsUG9ydCB9KTtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGxvY2FsUG9ydCA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgLy8gU3RhcnQgdGhlIEhUVFAgc2VydmVyIHVzaW5nIFRDUC5cbiAgICAgICAgc3RhcnRIdHRwU2VydmVyKHtcbiAgICAgICAgICBwb3J0OiBsb2NhbFBvcnQsXG4gICAgICAgICAgaG9zdDogcHJvY2Vzcy5lbnYuQklORF9JUCB8fCAnMC4wLjAuMCcsXG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIFBPUlQgc3BlY2lmaWVkJyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuICdEQUVNT04nO1xuICB9O1xufVxuXG5jb25zdCBpc0dldGVudEF2YWlsYWJsZSA9ICgpID0+IHtcbiAgdHJ5IHtcbiAgICBleGVjU3luYygnd2hpY2ggZ2V0ZW50Jyk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufTtcblxuY29uc3QgZ2V0R3JvdXBJbmZvVXNpbmdHZXRlbnQgPSAoZ3JvdXBOYW1lKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3Qgc3Rkb3V0ID0gZXhlY1N5bmMoYGdldGVudCBncm91cCAke2dyb3VwTmFtZX1gLCB7IGVuY29kaW5nOiAndXRmOCcgfSk7XG4gICAgaWYgKCFzdGRvdXQpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IFtuYW1lLCAsIGdpZF0gPSBzdGRvdXQudHJpbSgpLnNwbGl0KCc6Jyk7XG4gICAgaWYgKG5hbWUgPT0gbnVsbCB8fCBnaWQgPT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHsgbmFtZSwgZ2lkOiBOdW1iZXIoZ2lkKSB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59O1xuXG5jb25zdCBnZXRHcm91cEluZm9Gcm9tRmlsZSA9IChncm91cE5hbWUpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBkYXRhID0gcmVhZEZpbGVTeW5jKCcvZXRjL2dyb3VwJywgJ3V0ZjgnKTtcbiAgICBjb25zdCBncm91cExpbmUgPSBkYXRhLnRyaW0oKS5zcGxpdCgnXFxuJykuZmluZChsaW5lID0+IGxpbmUuc3RhcnRzV2l0aChgJHtncm91cE5hbWV9OmApKTtcbiAgICBpZiAoIWdyb3VwTGluZSkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgW25hbWUsICwgZ2lkXSA9IGdyb3VwTGluZS50cmltKCkuc3BsaXQoJzonKTtcbiAgICBpZiAobmFtZSA9PSBudWxsIHx8IGdpZCA9PSBudWxsKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4geyBuYW1lLCBnaWQ6IE51bWJlcihnaWQpIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBnZXRHcm91cEluZm8gPSAoZ3JvdXBOYW1lKSA9PiB7XG4gIGxldCBncm91cEluZm8gPSBnZXRHcm91cEluZm9Gcm9tRmlsZShncm91cE5hbWUpO1xuICBpZiAoIWdyb3VwSW5mbyAmJiBpc0dldGVudEF2YWlsYWJsZSgpKSB7XG4gICAgZ3JvdXBJbmZvID0gZ2V0R3JvdXBJbmZvVXNpbmdHZXRlbnQoZ3JvdXBOYW1lKTtcbiAgfVxuICByZXR1cm4gZ3JvdXBJbmZvO1xufTtcblxudmFyIGlubGluZVNjcmlwdHNBbGxvd2VkID0gdHJ1ZTtcblxuV2ViQXBwSW50ZXJuYWxzLmlubGluZVNjcmlwdHNBbGxvd2VkID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBpbmxpbmVTY3JpcHRzQWxsb3dlZDtcbn07XG5cbldlYkFwcEludGVybmFscy5zZXRJbmxpbmVTY3JpcHRzQWxsb3dlZCA9IGFzeW5jIGZ1bmN0aW9uKHZhbHVlKSB7XG4gIGlubGluZVNjcmlwdHNBbGxvd2VkID0gdmFsdWU7XG4gIGF3YWl0IFdlYkFwcEludGVybmFscy5nZW5lcmF0ZUJvaWxlcnBsYXRlKCk7XG59O1xuXG52YXIgc3JpTW9kZTtcblxuV2ViQXBwSW50ZXJuYWxzLmVuYWJsZVN1YnJlc291cmNlSW50ZWdyaXR5ID0gYXN5bmMgZnVuY3Rpb24odXNlX2NyZWRlbnRpYWxzID0gZmFsc2UpIHtcbiAgc3JpTW9kZSA9IHVzZV9jcmVkZW50aWFscyA/ICd1c2UtY3JlZGVudGlhbHMnIDogJ2Fub255bW91cyc7XG4gIGF3YWl0IFdlYkFwcEludGVybmFscy5nZW5lcmF0ZUJvaWxlcnBsYXRlKCk7XG59O1xuXG5XZWJBcHBJbnRlcm5hbHMuc2V0QnVuZGxlZEpzQ3NzVXJsUmV3cml0ZUhvb2sgPSBhc3luYyBmdW5jdGlvbihob29rRm4pIHtcbiAgYnVuZGxlZEpzQ3NzVXJsUmV3cml0ZUhvb2sgPSBob29rRm47XG4gIGF3YWl0IFdlYkFwcEludGVybmFscy5nZW5lcmF0ZUJvaWxlcnBsYXRlKCk7XG59O1xuXG5XZWJBcHBJbnRlcm5hbHMuc2V0QnVuZGxlZEpzQ3NzUHJlZml4ID0gYXN5bmMgZnVuY3Rpb24ocHJlZml4KSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgYXdhaXQgc2VsZi5zZXRCdW5kbGVkSnNDc3NVcmxSZXdyaXRlSG9vayhmdW5jdGlvbih1cmwpIHtcbiAgICByZXR1cm4gcHJlZml4ICsgdXJsO1xuICB9KTtcbn07XG5cbi8vIFBhY2thZ2VzIGNhbiBjYWxsIGBXZWJBcHBJbnRlcm5hbHMuYWRkU3RhdGljSnNgIHRvIHNwZWNpZnkgc3RhdGljXG4vLyBKYXZhU2NyaXB0IHRvIGJlIGluY2x1ZGVkIGluIHRoZSBhcHAuIFRoaXMgc3RhdGljIEpTIHdpbGwgYmUgaW5saW5lZCxcbi8vIHVubGVzcyBpbmxpbmUgc2NyaXB0cyBoYXZlIGJlZW4gZGlzYWJsZWQsIGluIHdoaWNoIGNhc2UgaXQgd2lsbCBiZVxuLy8gc2VydmVkIHVuZGVyIGAvPHNoYTEgb2YgY29udGVudHM+YC5cbnZhciBhZGRpdGlvbmFsU3RhdGljSnMgPSB7fTtcbldlYkFwcEludGVybmFscy5hZGRTdGF0aWNKcyA9IGZ1bmN0aW9uKGNvbnRlbnRzKSB7XG4gIGFkZGl0aW9uYWxTdGF0aWNKc1snLycgKyBzaGExKGNvbnRlbnRzKSArICcuanMnXSA9IGNvbnRlbnRzO1xufTtcblxuLy8gRXhwb3J0ZWQgZm9yIHRlc3RzXG5XZWJBcHBJbnRlcm5hbHMuZ2V0Qm9pbGVycGxhdGUgPSBnZXRCb2lsZXJwbGF0ZTtcbldlYkFwcEludGVybmFscy5hZGRpdGlvbmFsU3RhdGljSnMgPSBhZGRpdGlvbmFsU3RhdGljSnM7XG5cbmF3YWl0IHJ1bldlYkFwcFNlcnZlcigpO1xuIiwiaW1wb3J0IHsgc3RhdFN5bmMsIHVubGlua1N5bmMsIGV4aXN0c1N5bmMgfSBmcm9tICdmcyc7XG5cbi8vIFNpbmNlIGEgbmV3IHNvY2tldCBmaWxlIHdpbGwgYmUgY3JlYXRlZCB3aGVuIHRoZSBIVFRQIHNlcnZlclxuLy8gc3RhcnRzIHVwLCBpZiBmb3VuZCByZW1vdmUgdGhlIGV4aXN0aW5nIGZpbGUuXG4vL1xuLy8gV0FSTklORzpcbi8vIFRoaXMgd2lsbCByZW1vdmUgdGhlIGNvbmZpZ3VyZWQgc29ja2V0IGZpbGUgd2l0aG91dCB3YXJuaW5nLiBJZlxuLy8gdGhlIGNvbmZpZ3VyZWQgc29ja2V0IGZpbGUgaXMgYWxyZWFkeSBpbiB1c2UgYnkgYW5vdGhlciBhcHBsaWNhdGlvbixcbi8vIGl0IHdpbGwgc3RpbGwgYmUgcmVtb3ZlZC4gTm9kZSBkb2VzIG5vdCBwcm92aWRlIGEgcmVsaWFibGUgd2F5IHRvXG4vLyBkaWZmZXJlbnRpYXRlIGJldHdlZW4gYSBzb2NrZXQgZmlsZSB0aGF0IGlzIGFscmVhZHkgaW4gdXNlIGJ5XG4vLyBhbm90aGVyIGFwcGxpY2F0aW9uIG9yIGEgc3RhbGUgc29ja2V0IGZpbGUgdGhhdCBoYXMgYmVlblxuLy8gbGVmdCBvdmVyIGFmdGVyIGEgU0lHS0lMTC4gU2luY2Ugd2UgaGF2ZSBubyByZWxpYWJsZSB3YXkgdG9cbi8vIGRpZmZlcmVudGlhdGUgYmV0d2VlbiB0aGVzZSB0d28gc2NlbmFyaW9zLCB0aGUgYmVzdCBjb3Vyc2Ugb2Zcbi8vIGFjdGlvbiBkdXJpbmcgc3RhcnR1cCBpcyB0byByZW1vdmUgYW55IGV4aXN0aW5nIHNvY2tldCBmaWxlLiBUaGlzXG4vLyBpcyBub3QgdGhlIHNhZmVzdCBjb3Vyc2Ugb2YgYWN0aW9uIGFzIHJlbW92aW5nIHRoZSBleGlzdGluZyBzb2NrZXRcbi8vIGZpbGUgY291bGQgaW1wYWN0IGFuIGFwcGxpY2F0aW9uIHVzaW5nIGl0LCBidXQgdGhpcyBhcHByb2FjaCBoZWxwc1xuLy8gZW5zdXJlIHRoZSBIVFRQIHNlcnZlciBjYW4gc3RhcnR1cCB3aXRob3V0IG1hbnVhbFxuLy8gaW50ZXJ2ZW50aW9uIChlLmcuIGFza2luZyBmb3IgdGhlIHZlcmlmaWNhdGlvbiBhbmQgY2xlYW51cCBvZiBzb2NrZXRcbi8vIGZpbGVzIGJlZm9yZSBhbGxvd2luZyB0aGUgSFRUUCBzZXJ2ZXIgdG8gYmUgc3RhcnRlZCkuXG4vL1xuLy8gVGhlIGFib3ZlIGJlaW5nIHNhaWQsIGFzIGxvbmcgYXMgdGhlIHNvY2tldCBmaWxlIHBhdGggaXNcbi8vIGNvbmZpZ3VyZWQgY2FyZWZ1bGx5IHdoZW4gdGhlIGFwcGxpY2F0aW9uIGlzIGRlcGxveWVkIChhbmQgZXh0cmFcbi8vIGNhcmUgaXMgdGFrZW4gdG8gbWFrZSBzdXJlIHRoZSBjb25maWd1cmVkIHBhdGggaXMgdW5pcXVlIGFuZCBkb2Vzbid0XG4vLyBjb25mbGljdCB3aXRoIGFub3RoZXIgc29ja2V0IGZpbGUgcGF0aCksIHRoZW4gdGhlcmUgc2hvdWxkIG5vdCBiZVxuLy8gYW55IGlzc3VlcyB3aXRoIHRoaXMgYXBwcm9hY2guXG5leHBvcnQgY29uc3QgcmVtb3ZlRXhpc3RpbmdTb2NrZXRGaWxlID0gKHNvY2tldFBhdGgpID0+IHtcbiAgdHJ5IHtcbiAgICBpZiAoc3RhdFN5bmMoc29ja2V0UGF0aCkuaXNTb2NrZXQoKSkge1xuICAgICAgLy8gU2luY2UgYSBuZXcgc29ja2V0IGZpbGUgd2lsbCBiZSBjcmVhdGVkLCByZW1vdmUgdGhlIGV4aXN0aW5nXG4gICAgICAvLyBmaWxlLlxuICAgICAgdW5saW5rU3luYyhzb2NrZXRQYXRoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgQW4gZXhpc3RpbmcgZmlsZSB3YXMgZm91bmQgYXQgXCIke3NvY2tldFBhdGh9XCIgYW5kIGl0IGlzIG5vdCBgICtcbiAgICAgICAgJ2Egc29ja2V0IGZpbGUuIFBsZWFzZSBjb25maXJtIFBPUlQgaXMgcG9pbnRpbmcgdG8gdmFsaWQgYW5kICcgK1xuICAgICAgICAndW4tdXNlZCBzb2NrZXQgZmlsZSBwYXRoLidcbiAgICAgICk7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIC8vIElmIHRoZXJlIGlzIG5vIGV4aXN0aW5nIHNvY2tldCBmaWxlIHRvIGNsZWFudXAsIGdyZWF0LCB3ZSdsbFxuICAgIC8vIGNvbnRpbnVlIG5vcm1hbGx5LiBJZiB0aGUgY2F1Z2h0IGV4Y2VwdGlvbiByZXByZXNlbnRzIGFueSBvdGhlclxuICAgIC8vIGlzc3VlLCByZS10aHJvdy5cbiAgICBpZiAoZXJyb3IuY29kZSAhPT0gJ0VOT0VOVCcpIHtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxufTtcblxuLy8gUmVtb3ZlIHRoZSBzb2NrZXQgZmlsZSB3aGVuIGRvbmUgdG8gYXZvaWQgbGVhdmluZyBiZWhpbmQgYSBzdGFsZSBvbmUuXG4vLyBOb3RlIC0gYSBzdGFsZSBzb2NrZXQgZmlsZSBpcyBzdGlsbCBsZWZ0IGJlaGluZCBpZiB0aGUgcnVubmluZyBub2RlXG4vLyBwcm9jZXNzIGlzIGtpbGxlZCB2aWEgc2lnbmFsIDkgLSBTSUdLSUxMLlxuZXhwb3J0IGNvbnN0IHJlZ2lzdGVyU29ja2V0RmlsZUNsZWFudXAgPVxuICAoc29ja2V0UGF0aCwgZXZlbnRFbWl0dGVyID0gcHJvY2VzcykgPT4ge1xuICAgIFsnZXhpdCcsICdTSUdJTlQnLCAnU0lHSFVQJywgJ1NJR1RFUk0nXS5mb3JFYWNoKHNpZ25hbCA9PiB7XG4gICAgICBldmVudEVtaXR0ZXIub24oc2lnbmFsLCBNZXRlb3IuYmluZEVudmlyb25tZW50KCgpID0+IHtcbiAgICAgICAgaWYgKGV4aXN0c1N5bmMoc29ja2V0UGF0aCkpIHtcbiAgICAgICAgICB1bmxpbmtTeW5jKHNvY2tldFBhdGgpO1xuICAgICAgICB9XG4gICAgICB9KSk7XG4gICAgfSk7XG4gIH07XG4iXX0=
