Package["core-runtime"].queue("boilerplate-generator",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;
var ECMAScript = Package.ecmascript.ECMAScript;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var Boilerplate;

var require = meteorInstall({"node_modules":{"meteor":{"boilerplate-generator":{"generator.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/boilerplate-generator/generator.js                                                                         //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
      Boilerplate: () => Boilerplate
    });
    let readFileSync;
    module.link("fs", {
      readFileSync(v) {
        readFileSync = v;
      }
    }, 0);
    let createStream;
    module.link("combined-stream2", {
      create(v) {
        createStream = v;
      }
    }, 1);
    let modernHeadTemplate, modernCloseTemplate;
    module.link("./template-web.browser", {
      headTemplate(v) {
        modernHeadTemplate = v;
      },
      closeTemplate(v) {
        modernCloseTemplate = v;
      }
    }, 2);
    let cordovaHeadTemplate, cordovaCloseTemplate;
    module.link("./template-web.cordova", {
      headTemplate(v) {
        cordovaHeadTemplate = v;
      },
      closeTemplate(v) {
        cordovaCloseTemplate = v;
      }
    }, 3);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    // Copied from webapp_server
    const readUtf8FileSync = filename => readFileSync(filename, 'utf8');
    const identity = value => value;
    function appendToStream(chunk, stream) {
      if (typeof chunk === "string") {
        stream.append(Buffer.from(chunk, "utf8"));
      } else if (Buffer.isBuffer(chunk) || typeof chunk.read === "function") {
        stream.append(chunk);
      }
    }
    class Boilerplate {
      constructor(arch, manifest) {
        let options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
        const {
          headTemplate,
          closeTemplate
        } = getTemplate(arch);
        this.headTemplate = headTemplate;
        this.closeTemplate = closeTemplate;
        this.baseData = null;
        this._generateBoilerplateFromManifest(manifest, options);
      }
      toHTML(extraData) {
        throw new Error("The Boilerplate#toHTML method has been removed. " + "Please use Boilerplate#toHTMLStream instead.");
      }

      // Returns a Promise that resolves to a string of HTML.
      toHTMLAsync(extraData) {
        return new Promise((resolve, reject) => {
          const stream = this.toHTMLStream(extraData);
          const chunks = [];
          stream.on("data", chunk => chunks.push(chunk));
          stream.on("end", () => {
            resolve(Buffer.concat(chunks).toString("utf8"));
          });
          stream.on("error", reject);
        });
      }

      // The 'extraData' argument can be used to extend 'self.baseData'. Its
      // purpose is to allow you to specify data that you might not know at
      // the time that you construct the Boilerplate object. (e.g. it is used
      // by 'webapp' to specify data that is only known at request-time).
      // this returns a stream
      toHTMLStream(extraData) {
        if (!this.baseData || !this.headTemplate || !this.closeTemplate) {
          throw new Error('Boilerplate did not instantiate correctly.');
        }
        const data = _objectSpread(_objectSpread({}, this.baseData), extraData);
        const start = "<!DOCTYPE html>\n" + this.headTemplate(data);
        const {
          body,
          dynamicBody
        } = data;
        const end = this.closeTemplate(data);
        const response = createStream();
        appendToStream(start, response);
        if (body) {
          appendToStream(body, response);
        }
        if (dynamicBody) {
          appendToStream(dynamicBody, response);
        }
        appendToStream(end, response);
        return response;
      }

      // XXX Exported to allow client-side only changes to rebuild the boilerplate
      // without requiring a full server restart.
      // Produces an HTML string with given manifest and boilerplateSource.
      // Optionally takes urlMapper in case urls from manifest need to be prefixed
      // or rewritten.
      // Optionally takes pathMapper for resolving relative file system paths.
      // Optionally allows to override fields of the data context.
      _generateBoilerplateFromManifest(manifest) {
        let {
          urlMapper = identity,
          pathMapper = identity,
          baseDataExtension,
          inline
        } = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
        const boilerplateBaseData = _objectSpread({
          css: [],
          js: [],
          head: '',
          body: '',
          meteorManifest: JSON.stringify(manifest)
        }, baseDataExtension);
        manifest.forEach(item => {
          const urlPath = urlMapper(item.url);
          const itemObj = {
            url: urlPath
          };
          if (inline) {
            itemObj.scriptContent = readUtf8FileSync(pathMapper(item.path));
            itemObj.inline = true;
          } else if (item.sri) {
            itemObj.sri = item.sri;
          }
          if (item.type === 'css' && item.where === 'client') {
            boilerplateBaseData.css.push(itemObj);
          }
          if (item.type === 'js' && item.where === 'client' &&
          // Dynamic JS modules should not be loaded eagerly in the
          // initial HTML of the app.
          !item.path.startsWith('dynamic/')) {
            boilerplateBaseData.js.push(itemObj);
          }
          if (item.type === 'head') {
            boilerplateBaseData.head = readUtf8FileSync(pathMapper(item.path));
          }
          if (item.type === 'body') {
            boilerplateBaseData.body = readUtf8FileSync(pathMapper(item.path));
          }
        });
        this.baseData = boilerplateBaseData;
      }
    }
    ;

    // Returns a template function that, when called, produces the boilerplate
    // html as a string.
    function getTemplate(arch) {
      const prefix = arch.split(".", 2).join(".");
      if (prefix === "web.browser") {
        return {
          headTemplate: modernHeadTemplate,
          closeTemplate: modernCloseTemplate
        };
      }
      if (prefix === "web.cordova") {
        return {
          headTemplate: cordovaHeadTemplate,
          closeTemplate: cordovaCloseTemplate
        };
      }
      throw new Error("Unsupported arch: " + arch);
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"template-web.browser.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/boilerplate-generator/template-web.browser.js                                                              //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      headTemplate: () => headTemplate,
      closeTemplate: () => closeTemplate
    });
    let template;
    module.link("./template", {
      default(v) {
        template = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    const sri = (sri, mode) => sri && mode ? " integrity=\"sha512-".concat(sri, "\" crossorigin=\"").concat(mode, "\"") : '';
    const headTemplate = _ref => {
      let {
        css,
        htmlAttributes,
        bundledJsCssUrlRewriteHook,
        sriMode,
        head,
        dynamicHead
      } = _ref;
      var headSections = head.split(/<meteor-bundled-css[^<>]*>/, 2);
      var cssBundle = [...(css || []).map(file => template('  <link rel="stylesheet" type="text/css" class="__meteor-css__" href="<%- href %>"<%= sri %>>')({
        href: bundledJsCssUrlRewriteHook(file.url),
        sri: sri(file.sri, sriMode)
      }))].join('\n');
      return ['<html' + Object.keys(htmlAttributes || {}).map(key => template(' <%= attrName %>="<%- attrValue %>"')({
        attrName: key,
        attrValue: htmlAttributes[key]
      })).join('') + '>', '<head>', headSections.length === 1 ? [cssBundle, headSections[0]].join('\n') : [headSections[0], cssBundle, headSections[1]].join('\n'), dynamicHead, '</head>', '<body>'].join('\n');
    };
    const closeTemplate = _ref2 => {
      let {
        meteorRuntimeConfig,
        meteorRuntimeHash,
        rootUrlPathPrefix,
        inlineScriptsAllowed,
        js,
        additionalStaticJs,
        bundledJsCssUrlRewriteHook,
        sriMode
      } = _ref2;
      return ['', inlineScriptsAllowed ? template('  <script type="text/javascript">__meteor_runtime_config__ = JSON.parse(decodeURIComponent(<%= conf %>))</script>')({
        conf: meteorRuntimeConfig
      }) : template('  <script type="text/javascript" src="<%- src %>/meteor_runtime_config.js?hash=<%- hash %>"></script>')({
        src: rootUrlPathPrefix,
        hash: meteorRuntimeHash
      }), '', ...(js || []).map(file => template('  <script type="text/javascript" src="<%- src %>"<%= sri %>></script>')({
        src: bundledJsCssUrlRewriteHook(file.url),
        sri: sri(file.sri, sriMode)
      })), ...(additionalStaticJs || []).map(_ref3 => {
        let {
          contents,
          pathname
        } = _ref3;
        return inlineScriptsAllowed ? template('  <script><%= contents %></script>')({
          contents
        }) : template('  <script type="text/javascript" src="<%- src %>"></script>')({
          src: rootUrlPathPrefix + pathname
        });
      }), '', '', '</body>', '</html>'].join('\n');
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"template-web.cordova.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/boilerplate-generator/template-web.cordova.js                                                              //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      headTemplate: () => headTemplate,
      closeTemplate: () => closeTemplate
    });
    let template;
    module.link("./template", {
      default(v) {
        template = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    const headTemplate = _ref => {
      let {
        meteorRuntimeConfig,
        rootUrlPathPrefix,
        inlineScriptsAllowed,
        css,
        js,
        additionalStaticJs,
        htmlAttributes,
        bundledJsCssUrlRewriteHook,
        head,
        dynamicHead
      } = _ref;
      var headSections = head.split(/<meteor-bundled-css[^<>]*>/, 2);
      var cssBundle = [
      // We are explicitly not using bundledJsCssUrlRewriteHook: in cordova we serve assets up directly from disk, so rewriting the URL does not make sense
      ...(css || []).map(file => template('  <link rel="stylesheet" type="text/css" class="__meteor-css__" href="<%- href %>">')({
        href: file.url
      }))].join('\n');
      return ['<html>', '<head>', '  <meta charset="utf-8">', '  <meta name="format-detection" content="telephone=no">', '  <meta name="viewport" content="user-scalable=no, initial-scale=1, maximum-scale=1, minimum-scale=1, width=device-width, height=device-height, viewport-fit=cover">', '  <meta name="msapplication-tap-highlight" content="no">', '  <meta http-equiv="Content-Security-Policy" content="default-src * android-webview-video-poster: gap: data: blob: \'unsafe-inline\' \'unsafe-eval\' ws: wss:;">', headSections.length === 1 ? [cssBundle, headSections[0]].join('\n') : [headSections[0], cssBundle, headSections[1]].join('\n'), '  <script type="text/javascript">', template('    __meteor_runtime_config__ = JSON.parse(decodeURIComponent(<%= conf %>));')({
        conf: meteorRuntimeConfig
      }), '    if (/Android/i.test(navigator.userAgent)) {',
      // When Android app is emulated, it cannot connect to localhost,
      // instead it should connect to 10.0.2.2
      // (unless we\'re using an http proxy; then it works!)
      '      if (!__meteor_runtime_config__.httpProxyPort) {', '        __meteor_runtime_config__.ROOT_URL = (__meteor_runtime_config__.ROOT_URL || \'\').replace(/localhost/i, \'10.0.2.2\');', '        __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL = (__meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL || \'\').replace(/localhost/i, \'10.0.2.2\');', '      }', '    }', '  </script>', '', '  <script type="text/javascript" src="/cordova.js"></script>', ...(js || []).map(file => template('  <script type="text/javascript" src="<%- src %>"></script>')({
        src: file.url
      })), ...(additionalStaticJs || []).map(_ref2 => {
        let {
          contents,
          pathname
        } = _ref2;
        return inlineScriptsAllowed ? template('  <script><%= contents %></script>')({
          contents
        }) : template('  <script type="text/javascript" src="<%- src %>"></script>')({
          src: rootUrlPathPrefix + pathname
        });
      }), '', '</head>', '', '<body>'].join('\n');
    };
    function closeTemplate() {
      return "</body>\n</html>";
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"template.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/boilerplate-generator/template.js                                                                          //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      default: () => template
    });
    let lodashTemplate;
    module.link("lodash.template", {
      default(v) {
        lodashTemplate = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    function template(text) {
      return lodashTemplate(text, null, {
        evaluate: /<%([\s\S]+?)%>/g,
        interpolate: /<%=([\s\S]+?)%>/g,
        escape: /<%-([\s\S]+?)%>/g
      });
    }
    ;
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"node_modules":{"combined-stream2":{"package.json":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/boilerplate-generator/node_modules/combined-stream2/package.json                                //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.exports = {
  "name": "combined-stream2",
  "version": "1.1.2",
  "main": "index.js"
};

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/boilerplate-generator/node_modules/combined-stream2/index.js                                    //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.useNode();
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"lodash.template":{"package.json":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/boilerplate-generator/node_modules/lodash.template/package.json                                 //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.exports = {
  "name": "lodash.template",
  "version": "4.5.0"
};

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/boilerplate-generator/node_modules/lodash.template/index.js                                     //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.useNode();
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});


/* Exports */
return {
  export: function () { return {
      Boilerplate: Boilerplate
    };},
  require: require,
  eagerModulePaths: [
    "/node_modules/meteor/boilerplate-generator/generator.js"
  ],
  mainModulePath: "/node_modules/meteor/boilerplate-generator/generator.js"
}});

//# sourceURL=meteor://💻app/packages/boilerplate-generator.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvYm9pbGVycGxhdGUtZ2VuZXJhdG9yL2dlbmVyYXRvci5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvYm9pbGVycGxhdGUtZ2VuZXJhdG9yL3RlbXBsYXRlLXdlYi5icm93c2VyLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9ib2lsZXJwbGF0ZS1nZW5lcmF0b3IvdGVtcGxhdGUtd2ViLmNvcmRvdmEuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL2JvaWxlcnBsYXRlLWdlbmVyYXRvci90ZW1wbGF0ZS5qcyJdLCJuYW1lcyI6WyJfb2JqZWN0U3ByZWFkIiwibW9kdWxlIiwibGluayIsImRlZmF1bHQiLCJ2IiwiZXhwb3J0IiwiQm9pbGVycGxhdGUiLCJyZWFkRmlsZVN5bmMiLCJjcmVhdGVTdHJlYW0iLCJjcmVhdGUiLCJtb2Rlcm5IZWFkVGVtcGxhdGUiLCJtb2Rlcm5DbG9zZVRlbXBsYXRlIiwiaGVhZFRlbXBsYXRlIiwiY2xvc2VUZW1wbGF0ZSIsImNvcmRvdmFIZWFkVGVtcGxhdGUiLCJjb3Jkb3ZhQ2xvc2VUZW1wbGF0ZSIsIl9fcmVpZnlXYWl0Rm9yRGVwc19fIiwicmVhZFV0ZjhGaWxlU3luYyIsImZpbGVuYW1lIiwiaWRlbnRpdHkiLCJ2YWx1ZSIsImFwcGVuZFRvU3RyZWFtIiwiY2h1bmsiLCJzdHJlYW0iLCJhcHBlbmQiLCJCdWZmZXIiLCJmcm9tIiwiaXNCdWZmZXIiLCJyZWFkIiwiY29uc3RydWN0b3IiLCJhcmNoIiwibWFuaWZlc3QiLCJvcHRpb25zIiwiYXJndW1lbnRzIiwibGVuZ3RoIiwidW5kZWZpbmVkIiwiZ2V0VGVtcGxhdGUiLCJiYXNlRGF0YSIsIl9nZW5lcmF0ZUJvaWxlcnBsYXRlRnJvbU1hbmlmZXN0IiwidG9IVE1MIiwiZXh0cmFEYXRhIiwiRXJyb3IiLCJ0b0hUTUxBc3luYyIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwidG9IVE1MU3RyZWFtIiwiY2h1bmtzIiwib24iLCJwdXNoIiwiY29uY2F0IiwidG9TdHJpbmciLCJkYXRhIiwic3RhcnQiLCJib2R5IiwiZHluYW1pY0JvZHkiLCJlbmQiLCJyZXNwb25zZSIsInVybE1hcHBlciIsInBhdGhNYXBwZXIiLCJiYXNlRGF0YUV4dGVuc2lvbiIsImlubGluZSIsImJvaWxlcnBsYXRlQmFzZURhdGEiLCJjc3MiLCJqcyIsImhlYWQiLCJtZXRlb3JNYW5pZmVzdCIsIkpTT04iLCJzdHJpbmdpZnkiLCJmb3JFYWNoIiwiaXRlbSIsInVybFBhdGgiLCJ1cmwiLCJpdGVtT2JqIiwic2NyaXB0Q29udGVudCIsInBhdGgiLCJzcmkiLCJ0eXBlIiwid2hlcmUiLCJzdGFydHNXaXRoIiwicHJlZml4Iiwic3BsaXQiLCJqb2luIiwiX19yZWlmeV9hc3luY19yZXN1bHRfXyIsIl9yZWlmeUVycm9yIiwic2VsZiIsImFzeW5jIiwidGVtcGxhdGUiLCJtb2RlIiwiX3JlZiIsImh0bWxBdHRyaWJ1dGVzIiwiYnVuZGxlZEpzQ3NzVXJsUmV3cml0ZUhvb2siLCJzcmlNb2RlIiwiZHluYW1pY0hlYWQiLCJoZWFkU2VjdGlvbnMiLCJjc3NCdW5kbGUiLCJtYXAiLCJmaWxlIiwiaHJlZiIsIk9iamVjdCIsImtleXMiLCJrZXkiLCJhdHRyTmFtZSIsImF0dHJWYWx1ZSIsIl9yZWYyIiwibWV0ZW9yUnVudGltZUNvbmZpZyIsIm1ldGVvclJ1bnRpbWVIYXNoIiwicm9vdFVybFBhdGhQcmVmaXgiLCJpbmxpbmVTY3JpcHRzQWxsb3dlZCIsImFkZGl0aW9uYWxTdGF0aWNKcyIsImNvbmYiLCJzcmMiLCJoYXNoIiwiX3JlZjMiLCJjb250ZW50cyIsInBhdGhuYW1lIiwibG9kYXNoVGVtcGxhdGUiLCJ0ZXh0IiwiZXZhbHVhdGUiLCJpbnRlcnBvbGF0ZSIsImVzY2FwZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7SUFBQSxJQUFJQSxhQUFhO0lBQUNDLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDLHNDQUFzQyxFQUFDO01BQUNDLE9BQU9BLENBQUNDLENBQUMsRUFBQztRQUFDSixhQUFhLEdBQUNJLENBQUM7TUFBQTtJQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7SUFBckdILE1BQU0sQ0FBQ0ksTUFBTSxDQUFDO01BQUNDLFdBQVcsRUFBQ0EsQ0FBQSxLQUFJQTtJQUFXLENBQUMsQ0FBQztJQUFDLElBQUlDLFlBQVk7SUFBQ04sTUFBTSxDQUFDQyxJQUFJLENBQUMsSUFBSSxFQUFDO01BQUNLLFlBQVlBLENBQUNILENBQUMsRUFBQztRQUFDRyxZQUFZLEdBQUNILENBQUM7TUFBQTtJQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7SUFBQyxJQUFJSSxZQUFZO0lBQUNQLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDLGtCQUFrQixFQUFDO01BQUNPLE1BQU1BLENBQUNMLENBQUMsRUFBQztRQUFDSSxZQUFZLEdBQUNKLENBQUM7TUFBQTtJQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7SUFBQyxJQUFJTSxrQkFBa0IsRUFBQ0MsbUJBQW1CO0lBQUNWLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDLHdCQUF3QixFQUFDO01BQUNVLFlBQVlBLENBQUNSLENBQUMsRUFBQztRQUFDTSxrQkFBa0IsR0FBQ04sQ0FBQztNQUFBLENBQUM7TUFBQ1MsYUFBYUEsQ0FBQ1QsQ0FBQyxFQUFDO1FBQUNPLG1CQUFtQixHQUFDUCxDQUFDO01BQUE7SUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0lBQUMsSUFBSVUsbUJBQW1CLEVBQUNDLG9CQUFvQjtJQUFDZCxNQUFNLENBQUNDLElBQUksQ0FBQyx3QkFBd0IsRUFBQztNQUFDVSxZQUFZQSxDQUFDUixDQUFDLEVBQUM7UUFBQ1UsbUJBQW1CLEdBQUNWLENBQUM7TUFBQSxDQUFDO01BQUNTLGFBQWFBLENBQUNULENBQUMsRUFBQztRQUFDVyxvQkFBb0IsR0FBQ1gsQ0FBQztNQUFBO0lBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQztJQUFDLElBQUlZLG9CQUFvQixDQUFDLENBQUMsRUFBRSxDQUFDLE1BQU1BLG9CQUFvQixDQUFDLENBQUMsRUFBRSxDQUFDO0lBTXprQjtJQUNBLE1BQU1DLGdCQUFnQixHQUFHQyxRQUFRLElBQUlYLFlBQVksQ0FBQ1csUUFBUSxFQUFFLE1BQU0sQ0FBQztJQUVuRSxNQUFNQyxRQUFRLEdBQUdDLEtBQUssSUFBSUEsS0FBSztJQUUvQixTQUFTQyxjQUFjQSxDQUFDQyxLQUFLLEVBQUVDLE1BQU0sRUFBRTtNQUNyQyxJQUFJLE9BQU9ELEtBQUssS0FBSyxRQUFRLEVBQUU7UUFDN0JDLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDQyxNQUFNLENBQUNDLElBQUksQ0FBQ0osS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO01BQzNDLENBQUMsTUFBTSxJQUFJRyxNQUFNLENBQUNFLFFBQVEsQ0FBQ0wsS0FBSyxDQUFDLElBQ3RCLE9BQU9BLEtBQUssQ0FBQ00sSUFBSSxLQUFLLFVBQVUsRUFBRTtRQUMzQ0wsTUFBTSxDQUFDQyxNQUFNLENBQUNGLEtBQUssQ0FBQztNQUN0QjtJQUNGO0lBRU8sTUFBTWhCLFdBQVcsQ0FBQztNQUN2QnVCLFdBQVdBLENBQUNDLElBQUksRUFBRUMsUUFBUSxFQUFnQjtRQUFBLElBQWRDLE9BQU8sR0FBQUMsU0FBQSxDQUFBQyxNQUFBLFFBQUFELFNBQUEsUUFBQUUsU0FBQSxHQUFBRixTQUFBLE1BQUcsQ0FBQyxDQUFDO1FBQ3RDLE1BQU07VUFBRXJCLFlBQVk7VUFBRUM7UUFBYyxDQUFDLEdBQUd1QixXQUFXLENBQUNOLElBQUksQ0FBQztRQUN6RCxJQUFJLENBQUNsQixZQUFZLEdBQUdBLFlBQVk7UUFDaEMsSUFBSSxDQUFDQyxhQUFhLEdBQUdBLGFBQWE7UUFDbEMsSUFBSSxDQUFDd0IsUUFBUSxHQUFHLElBQUk7UUFFcEIsSUFBSSxDQUFDQyxnQ0FBZ0MsQ0FDbkNQLFFBQVEsRUFDUkMsT0FDRixDQUFDO01BQ0g7TUFFQU8sTUFBTUEsQ0FBQ0MsU0FBUyxFQUFFO1FBQ2hCLE1BQU0sSUFBSUMsS0FBSyxDQUNiLGtEQUFrRCxHQUNoRCw4Q0FDSixDQUFDO01BQ0g7O01BRUE7TUFDQUMsV0FBV0EsQ0FBQ0YsU0FBUyxFQUFFO1FBQ3JCLE9BQU8sSUFBSUcsT0FBTyxDQUFDLENBQUNDLE9BQU8sRUFBRUMsTUFBTSxLQUFLO1VBQ3RDLE1BQU10QixNQUFNLEdBQUcsSUFBSSxDQUFDdUIsWUFBWSxDQUFDTixTQUFTLENBQUM7VUFDM0MsTUFBTU8sTUFBTSxHQUFHLEVBQUU7VUFDakJ4QixNQUFNLENBQUN5QixFQUFFLENBQUMsTUFBTSxFQUFFMUIsS0FBSyxJQUFJeUIsTUFBTSxDQUFDRSxJQUFJLENBQUMzQixLQUFLLENBQUMsQ0FBQztVQUM5Q0MsTUFBTSxDQUFDeUIsRUFBRSxDQUFDLEtBQUssRUFBRSxNQUFNO1lBQ3JCSixPQUFPLENBQUNuQixNQUFNLENBQUN5QixNQUFNLENBQUNILE1BQU0sQ0FBQyxDQUFDSSxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7VUFDakQsQ0FBQyxDQUFDO1VBQ0Y1QixNQUFNLENBQUN5QixFQUFFLENBQUMsT0FBTyxFQUFFSCxNQUFNLENBQUM7UUFDNUIsQ0FBQyxDQUFDO01BQ0o7O01BRUE7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBQyxZQUFZQSxDQUFDTixTQUFTLEVBQUU7UUFDdEIsSUFBSSxDQUFDLElBQUksQ0FBQ0gsUUFBUSxJQUFJLENBQUMsSUFBSSxDQUFDekIsWUFBWSxJQUFJLENBQUMsSUFBSSxDQUFDQyxhQUFhLEVBQUU7VUFDL0QsTUFBTSxJQUFJNEIsS0FBSyxDQUFDLDRDQUE0QyxDQUFDO1FBQy9EO1FBRUEsTUFBTVcsSUFBSSxHQUFBcEQsYUFBQSxDQUFBQSxhQUFBLEtBQU8sSUFBSSxDQUFDcUMsUUFBUSxHQUFLRyxTQUFTLENBQUM7UUFDN0MsTUFBTWEsS0FBSyxHQUFHLG1CQUFtQixHQUFHLElBQUksQ0FBQ3pDLFlBQVksQ0FBQ3dDLElBQUksQ0FBQztRQUUzRCxNQUFNO1VBQUVFLElBQUk7VUFBRUM7UUFBWSxDQUFDLEdBQUdILElBQUk7UUFFbEMsTUFBTUksR0FBRyxHQUFHLElBQUksQ0FBQzNDLGFBQWEsQ0FBQ3VDLElBQUksQ0FBQztRQUNwQyxNQUFNSyxRQUFRLEdBQUdqRCxZQUFZLENBQUMsQ0FBQztRQUUvQmEsY0FBYyxDQUFDZ0MsS0FBSyxFQUFFSSxRQUFRLENBQUM7UUFFL0IsSUFBSUgsSUFBSSxFQUFFO1VBQ1JqQyxjQUFjLENBQUNpQyxJQUFJLEVBQUVHLFFBQVEsQ0FBQztRQUNoQztRQUVBLElBQUlGLFdBQVcsRUFBRTtVQUNmbEMsY0FBYyxDQUFDa0MsV0FBVyxFQUFFRSxRQUFRLENBQUM7UUFDdkM7UUFFQXBDLGNBQWMsQ0FBQ21DLEdBQUcsRUFBRUMsUUFBUSxDQUFDO1FBRTdCLE9BQU9BLFFBQVE7TUFDakI7O01BRUE7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQW5CLGdDQUFnQ0EsQ0FBQ1AsUUFBUSxFQUtqQztRQUFBLElBTG1DO1VBQ3pDMkIsU0FBUyxHQUFHdkMsUUFBUTtVQUNwQndDLFVBQVUsR0FBR3hDLFFBQVE7VUFDckJ5QyxpQkFBaUI7VUFDakJDO1FBQ0YsQ0FBQyxHQUFBNUIsU0FBQSxDQUFBQyxNQUFBLFFBQUFELFNBQUEsUUFBQUUsU0FBQSxHQUFBRixTQUFBLE1BQUcsQ0FBQyxDQUFDO1FBRUosTUFBTTZCLG1CQUFtQixHQUFBOUQsYUFBQTtVQUN2QitELEdBQUcsRUFBRSxFQUFFO1VBQ1BDLEVBQUUsRUFBRSxFQUFFO1VBQ05DLElBQUksRUFBRSxFQUFFO1VBQ1JYLElBQUksRUFBRSxFQUFFO1VBQ1JZLGNBQWMsRUFBRUMsSUFBSSxDQUFDQyxTQUFTLENBQUNyQyxRQUFRO1FBQUMsR0FDckM2QixpQkFBaUIsQ0FDckI7UUFFRDdCLFFBQVEsQ0FBQ3NDLE9BQU8sQ0FBQ0MsSUFBSSxJQUFJO1VBQ3ZCLE1BQU1DLE9BQU8sR0FBR2IsU0FBUyxDQUFDWSxJQUFJLENBQUNFLEdBQUcsQ0FBQztVQUNuQyxNQUFNQyxPQUFPLEdBQUc7WUFBRUQsR0FBRyxFQUFFRDtVQUFRLENBQUM7VUFFaEMsSUFBSVYsTUFBTSxFQUFFO1lBQ1ZZLE9BQU8sQ0FBQ0MsYUFBYSxHQUFHekQsZ0JBQWdCLENBQ3RDMEMsVUFBVSxDQUFDVyxJQUFJLENBQUNLLElBQUksQ0FBQyxDQUFDO1lBQ3hCRixPQUFPLENBQUNaLE1BQU0sR0FBRyxJQUFJO1VBQ3ZCLENBQUMsTUFBTSxJQUFJUyxJQUFJLENBQUNNLEdBQUcsRUFBRTtZQUNuQkgsT0FBTyxDQUFDRyxHQUFHLEdBQUdOLElBQUksQ0FBQ00sR0FBRztVQUN4QjtVQUVBLElBQUlOLElBQUksQ0FBQ08sSUFBSSxLQUFLLEtBQUssSUFBSVAsSUFBSSxDQUFDUSxLQUFLLEtBQUssUUFBUSxFQUFFO1lBQ2xEaEIsbUJBQW1CLENBQUNDLEdBQUcsQ0FBQ2QsSUFBSSxDQUFDd0IsT0FBTyxDQUFDO1VBQ3ZDO1VBRUEsSUFBSUgsSUFBSSxDQUFDTyxJQUFJLEtBQUssSUFBSSxJQUFJUCxJQUFJLENBQUNRLEtBQUssS0FBSyxRQUFRO1VBQy9DO1VBQ0E7VUFDQSxDQUFDUixJQUFJLENBQUNLLElBQUksQ0FBQ0ksVUFBVSxDQUFDLFVBQVUsQ0FBQyxFQUFFO1lBQ25DakIsbUJBQW1CLENBQUNFLEVBQUUsQ0FBQ2YsSUFBSSxDQUFDd0IsT0FBTyxDQUFDO1VBQ3RDO1VBRUEsSUFBSUgsSUFBSSxDQUFDTyxJQUFJLEtBQUssTUFBTSxFQUFFO1lBQ3hCZixtQkFBbUIsQ0FBQ0csSUFBSSxHQUN0QmhELGdCQUFnQixDQUFDMEMsVUFBVSxDQUFDVyxJQUFJLENBQUNLLElBQUksQ0FBQyxDQUFDO1VBQzNDO1VBRUEsSUFBSUwsSUFBSSxDQUFDTyxJQUFJLEtBQUssTUFBTSxFQUFFO1lBQ3hCZixtQkFBbUIsQ0FBQ1IsSUFBSSxHQUN0QnJDLGdCQUFnQixDQUFDMEMsVUFBVSxDQUFDVyxJQUFJLENBQUNLLElBQUksQ0FBQyxDQUFDO1VBQzNDO1FBQ0YsQ0FBQyxDQUFDO1FBRUYsSUFBSSxDQUFDdEMsUUFBUSxHQUFHeUIsbUJBQW1CO01BQ3JDO0lBQ0Y7SUFBQzs7SUFFRDtJQUNBO0lBQ0EsU0FBUzFCLFdBQVdBLENBQUNOLElBQUksRUFBRTtNQUN6QixNQUFNa0QsTUFBTSxHQUFHbEQsSUFBSSxDQUFDbUQsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQ0MsSUFBSSxDQUFDLEdBQUcsQ0FBQztNQUUzQyxJQUFJRixNQUFNLEtBQUssYUFBYSxFQUFFO1FBQzVCLE9BQU87VUFBRXBFLFlBQVksRUFBRUYsa0JBQWtCO1VBQUVHLGFBQWEsRUFBRUY7UUFBb0IsQ0FBQztNQUNqRjtNQUVBLElBQUlxRSxNQUFNLEtBQUssYUFBYSxFQUFFO1FBQzVCLE9BQU87VUFBRXBFLFlBQVksRUFBRUUsbUJBQW1CO1VBQUVELGFBQWEsRUFBRUU7UUFBcUIsQ0FBQztNQUNuRjtNQUVBLE1BQU0sSUFBSTBCLEtBQUssQ0FBQyxvQkFBb0IsR0FBR1gsSUFBSSxDQUFDO0lBQzlDO0lBQUNxRCxzQkFBQTtFQUFBLFNBQUFDLFdBQUE7SUFBQSxPQUFBRCxzQkFBQSxDQUFBQyxXQUFBO0VBQUE7RUFBQUQsc0JBQUE7QUFBQTtFQUFBRSxJQUFBO0VBQUFDLEtBQUE7QUFBQSxHOzs7Ozs7Ozs7Ozs7OztJQ2pLRHJGLE1BQU0sQ0FBQ0ksTUFBTSxDQUFDO01BQUNPLFlBQVksRUFBQ0EsQ0FBQSxLQUFJQSxZQUFZO01BQUNDLGFBQWEsRUFBQ0EsQ0FBQSxLQUFJQTtJQUFhLENBQUMsQ0FBQztJQUFDLElBQUkwRSxRQUFRO0lBQUN0RixNQUFNLENBQUNDLElBQUksQ0FBQyxZQUFZLEVBQUM7TUFBQ0MsT0FBT0EsQ0FBQ0MsQ0FBQyxFQUFDO1FBQUNtRixRQUFRLEdBQUNuRixDQUFDO01BQUE7SUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0lBQUMsSUFBSVksb0JBQW9CLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTUEsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFFN00sTUFBTTRELEdBQUcsR0FBR0EsQ0FBQ0EsR0FBRyxFQUFFWSxJQUFJLEtBQ25CWixHQUFHLElBQUlZLElBQUksMEJBQUF0QyxNQUFBLENBQTBCMEIsR0FBRyx1QkFBQTFCLE1BQUEsQ0FBa0JzQyxJQUFJLFVBQU0sRUFBRTtJQUVsRSxNQUFNNUUsWUFBWSxHQUFHNkUsSUFBQSxJQU90QjtNQUFBLElBUHVCO1FBQzNCMUIsR0FBRztRQUNIMkIsY0FBYztRQUNkQywwQkFBMEI7UUFDMUJDLE9BQU87UUFDUDNCLElBQUk7UUFDSjRCO01BQ0YsQ0FBQyxHQUFBSixJQUFBO01BQ0MsSUFBSUssWUFBWSxHQUFHN0IsSUFBSSxDQUFDZ0IsS0FBSyxDQUFDLDRCQUE0QixFQUFFLENBQUMsQ0FBQztNQUM5RCxJQUFJYyxTQUFTLEdBQUcsQ0FBQyxHQUFHLENBQUNoQyxHQUFHLElBQUksRUFBRSxFQUFFaUMsR0FBRyxDQUFDQyxJQUFJLElBQ3RDVixRQUFRLENBQUMsK0ZBQStGLENBQUMsQ0FBQztRQUN4R1csSUFBSSxFQUFFUCwwQkFBMEIsQ0FBQ00sSUFBSSxDQUFDekIsR0FBRyxDQUFDO1FBQzFDSSxHQUFHLEVBQUVBLEdBQUcsQ0FBQ3FCLElBQUksQ0FBQ3JCLEdBQUcsRUFBRWdCLE9BQU87TUFDNUIsQ0FBQyxDQUNILENBQUMsQ0FBQyxDQUFDVixJQUFJLENBQUMsSUFBSSxDQUFDO01BRWIsT0FBTyxDQUNMLE9BQU8sR0FBR2lCLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDVixjQUFjLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQ00sR0FBRyxDQUM3Q0ssR0FBRyxJQUFJZCxRQUFRLENBQUMscUNBQXFDLENBQUMsQ0FBQztRQUNyRGUsUUFBUSxFQUFFRCxHQUFHO1FBQ2JFLFNBQVMsRUFBRWIsY0FBYyxDQUFDVyxHQUFHO01BQy9CLENBQUMsQ0FDSCxDQUFDLENBQUNuQixJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUVoQixRQUFRLEVBRVBZLFlBQVksQ0FBQzVELE1BQU0sS0FBSyxDQUFDLEdBQ3RCLENBQUM2RCxTQUFTLEVBQUVELFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDWixJQUFJLENBQUMsSUFBSSxDQUFDLEdBQ3ZDLENBQUNZLFlBQVksQ0FBQyxDQUFDLENBQUMsRUFBRUMsU0FBUyxFQUFFRCxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQ1osSUFBSSxDQUFDLElBQUksQ0FBQyxFQUU1RFcsV0FBVyxFQUNYLFNBQVMsRUFDVCxRQUFRLENBQ1QsQ0FBQ1gsSUFBSSxDQUFDLElBQUksQ0FBQztJQUNkLENBQUM7SUFHTSxNQUFNckUsYUFBYSxHQUFHMkYsS0FBQTtNQUFBLElBQUM7UUFDNUJDLG1CQUFtQjtRQUNuQkMsaUJBQWlCO1FBQ2pCQyxpQkFBaUI7UUFDakJDLG9CQUFvQjtRQUNwQjVDLEVBQUU7UUFDRjZDLGtCQUFrQjtRQUNsQmxCLDBCQUEwQjtRQUMxQkM7TUFDRixDQUFDLEdBQUFZLEtBQUE7TUFBQSxPQUFLLENBQ0osRUFBRSxFQUNGSSxvQkFBb0IsR0FDaEJyQixRQUFRLENBQUMsbUhBQW1ILENBQUMsQ0FBQztRQUM5SHVCLElBQUksRUFBRUw7TUFDUixDQUFDLENBQUMsR0FDQWxCLFFBQVEsQ0FBQyx1R0FBdUcsQ0FBQyxDQUFDO1FBQ2xId0IsR0FBRyxFQUFFSixpQkFBaUI7UUFDdEJLLElBQUksRUFBRU47TUFDUixDQUFDLENBQUMsRUFDSixFQUFFLEVBRUYsR0FBRyxDQUFDMUMsRUFBRSxJQUFJLEVBQUUsRUFBRWdDLEdBQUcsQ0FBQ0MsSUFBSSxJQUNwQlYsUUFBUSxDQUFDLHVFQUF1RSxDQUFDLENBQUM7UUFDaEZ3QixHQUFHLEVBQUVwQiwwQkFBMEIsQ0FBQ00sSUFBSSxDQUFDekIsR0FBRyxDQUFDO1FBQ3pDSSxHQUFHLEVBQUVBLEdBQUcsQ0FBQ3FCLElBQUksQ0FBQ3JCLEdBQUcsRUFBRWdCLE9BQU87TUFDNUIsQ0FBQyxDQUNILENBQUMsRUFFRCxHQUFHLENBQUNpQixrQkFBa0IsSUFBSSxFQUFFLEVBQUViLEdBQUcsQ0FBQ2lCLEtBQUE7UUFBQSxJQUFDO1VBQUVDLFFBQVE7VUFBRUM7UUFBUyxDQUFDLEdBQUFGLEtBQUE7UUFBQSxPQUN2REwsb0JBQW9CLEdBQ2hCckIsUUFBUSxDQUFDLG9DQUFvQyxDQUFDLENBQUM7VUFDL0MyQjtRQUNGLENBQUMsQ0FBQyxHQUNBM0IsUUFBUSxDQUFDLDZEQUE2RCxDQUFDLENBQUM7VUFDeEV3QixHQUFHLEVBQUVKLGlCQUFpQixHQUFHUTtRQUMzQixDQUFDLENBQUM7TUFBQSxDQUNMLENBQUMsRUFFRixFQUFFLEVBQ0YsRUFBRSxFQUNGLFNBQVMsRUFDVCxTQUFTLENBQ1YsQ0FBQ2pDLElBQUksQ0FBQyxJQUFJLENBQUM7SUFBQTtJQUFDQyxzQkFBQTtFQUFBLFNBQUFDLFdBQUE7SUFBQSxPQUFBRCxzQkFBQSxDQUFBQyxXQUFBO0VBQUE7RUFBQUQsc0JBQUE7QUFBQTtFQUFBRSxJQUFBO0VBQUFDLEtBQUE7QUFBQSxHOzs7Ozs7Ozs7Ozs7OztJQ3BGYnJGLE1BQU0sQ0FBQ0ksTUFBTSxDQUFDO01BQUNPLFlBQVksRUFBQ0EsQ0FBQSxLQUFJQSxZQUFZO01BQUNDLGFBQWEsRUFBQ0EsQ0FBQSxLQUFJQTtJQUFhLENBQUMsQ0FBQztJQUFDLElBQUkwRSxRQUFRO0lBQUN0RixNQUFNLENBQUNDLElBQUksQ0FBQyxZQUFZLEVBQUM7TUFBQ0MsT0FBT0EsQ0FBQ0MsQ0FBQyxFQUFDO1FBQUNtRixRQUFRLEdBQUNuRixDQUFDO01BQUE7SUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0lBQUMsSUFBSVksb0JBQW9CLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTUEsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFHdE0sTUFBTUosWUFBWSxHQUFHNkUsSUFBQSxJQVd0QjtNQUFBLElBWHVCO1FBQzNCZ0IsbUJBQW1CO1FBQ25CRSxpQkFBaUI7UUFDakJDLG9CQUFvQjtRQUNwQjdDLEdBQUc7UUFDSEMsRUFBRTtRQUNGNkMsa0JBQWtCO1FBQ2xCbkIsY0FBYztRQUNkQywwQkFBMEI7UUFDMUIxQixJQUFJO1FBQ0o0QjtNQUNGLENBQUMsR0FBQUosSUFBQTtNQUNDLElBQUlLLFlBQVksR0FBRzdCLElBQUksQ0FBQ2dCLEtBQUssQ0FBQyw0QkFBNEIsRUFBRSxDQUFDLENBQUM7TUFDOUQsSUFBSWMsU0FBUyxHQUFHO01BQ2Q7TUFDQSxHQUFHLENBQUNoQyxHQUFHLElBQUksRUFBRSxFQUFFaUMsR0FBRyxDQUFDQyxJQUFJLElBQ3JCVixRQUFRLENBQUMscUZBQXFGLENBQUMsQ0FBQztRQUM5RlcsSUFBSSxFQUFFRCxJQUFJLENBQUN6QjtNQUNiLENBQUMsQ0FDTCxDQUFDLENBQUMsQ0FBQ1UsSUFBSSxDQUFDLElBQUksQ0FBQztNQUViLE9BQU8sQ0FDTCxRQUFRLEVBQ1IsUUFBUSxFQUNSLDBCQUEwQixFQUMxQix5REFBeUQsRUFDekQsc0tBQXNLLEVBQ3RLLDBEQUEwRCxFQUMxRCxrS0FBa0ssRUFFbktZLFlBQVksQ0FBQzVELE1BQU0sS0FBSyxDQUFDLEdBQ3RCLENBQUM2RCxTQUFTLEVBQUVELFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDWixJQUFJLENBQUMsSUFBSSxDQUFDLEdBQ3ZDLENBQUNZLFlBQVksQ0FBQyxDQUFDLENBQUMsRUFBRUMsU0FBUyxFQUFFRCxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQ1osSUFBSSxDQUFDLElBQUksQ0FBQyxFQUUxRCxtQ0FBbUMsRUFDbkNLLFFBQVEsQ0FBQyw4RUFBOEUsQ0FBQyxDQUFDO1FBQ3ZGdUIsSUFBSSxFQUFFTDtNQUNSLENBQUMsQ0FBQyxFQUNGLGlEQUFpRDtNQUNqRDtNQUNBO01BQ0E7TUFDQSx1REFBdUQsRUFDdkQsZ0lBQWdJLEVBQ2hJLG9LQUFvSyxFQUNwSyxTQUFTLEVBQ1QsT0FBTyxFQUNQLGFBQWEsRUFDYixFQUFFLEVBQ0YsOERBQThELEVBRTlELEdBQUcsQ0FBQ3pDLEVBQUUsSUFBSSxFQUFFLEVBQUVnQyxHQUFHLENBQUNDLElBQUksSUFDcEJWLFFBQVEsQ0FBQyw2REFBNkQsQ0FBQyxDQUFDO1FBQ3RFd0IsR0FBRyxFQUFFZCxJQUFJLENBQUN6QjtNQUNaLENBQUMsQ0FDSCxDQUFDLEVBRUQsR0FBRyxDQUFDcUMsa0JBQWtCLElBQUksRUFBRSxFQUFFYixHQUFHLENBQUNRLEtBQUE7UUFBQSxJQUFDO1VBQUVVLFFBQVE7VUFBRUM7UUFBUyxDQUFDLEdBQUFYLEtBQUE7UUFBQSxPQUN2REksb0JBQW9CLEdBQ2hCckIsUUFBUSxDQUFDLG9DQUFvQyxDQUFDLENBQUM7VUFDL0MyQjtRQUNGLENBQUMsQ0FBQyxHQUNBM0IsUUFBUSxDQUFDLDZEQUE2RCxDQUFDLENBQUM7VUFDeEV3QixHQUFHLEVBQUVKLGlCQUFpQixHQUFHUTtRQUMzQixDQUFDLENBQUM7TUFBQSxDQUNMLENBQUMsRUFDRixFQUFFLEVBQ0YsU0FBUyxFQUNULEVBQUUsRUFDRixRQUFRLENBQ1QsQ0FBQ2pDLElBQUksQ0FBQyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBRU0sU0FBU3JFLGFBQWFBLENBQUEsRUFBRztNQUM5QixPQUFPLGtCQUFrQjtJQUMzQjtJQUFDc0Usc0JBQUE7RUFBQSxTQUFBQyxXQUFBO0lBQUEsT0FBQUQsc0JBQUEsQ0FBQUMsV0FBQTtFQUFBO0VBQUFELHNCQUFBO0FBQUE7RUFBQUUsSUFBQTtFQUFBQyxLQUFBO0FBQUEsRzs7Ozs7Ozs7Ozs7Ozs7SUM5RURyRixNQUFNLENBQUNJLE1BQU0sQ0FBQztNQUFDRixPQUFPLEVBQUNBLENBQUEsS0FBSW9GO0lBQVEsQ0FBQyxDQUFDO0lBQUMsSUFBSTZCLGNBQWM7SUFBQ25ILE1BQU0sQ0FBQ0MsSUFBSSxDQUFDLGlCQUFpQixFQUFDO01BQUNDLE9BQU9BLENBQUNDLENBQUMsRUFBQztRQUFDZ0gsY0FBYyxHQUFDaEgsQ0FBQztNQUFBO0lBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQztJQUFDLElBQUlZLG9CQUFvQixDQUFDLENBQUMsRUFBRSxDQUFDLE1BQU1BLG9CQUFvQixDQUFDLENBQUMsRUFBRSxDQUFDO0lBT3RLLFNBQVN1RSxRQUFRQSxDQUFDOEIsSUFBSSxFQUFFO01BQ3JDLE9BQU9ELGNBQWMsQ0FBQ0MsSUFBSSxFQUFFLElBQUksRUFBRTtRQUNoQ0MsUUFBUSxFQUFNLGlCQUFpQjtRQUMvQkMsV0FBVyxFQUFHLGtCQUFrQjtRQUNoQ0MsTUFBTSxFQUFRO01BQ2hCLENBQUMsQ0FBQztJQUNKO0lBQUM7SUFBQ3JDLHNCQUFBO0VBQUEsU0FBQUMsV0FBQTtJQUFBLE9BQUFELHNCQUFBLENBQUFDLFdBQUE7RUFBQTtFQUFBRCxzQkFBQTtBQUFBO0VBQUFFLElBQUE7RUFBQUMsS0FBQTtBQUFBLEciLCJmaWxlIjoiL3BhY2thZ2VzL2JvaWxlcnBsYXRlLWdlbmVyYXRvci5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7cmVhZEZpbGVTeW5jfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBjcmVhdGUgYXMgY3JlYXRlU3RyZWFtIH0gZnJvbSBcImNvbWJpbmVkLXN0cmVhbTJcIjtcblxuaW1wb3J0IHsgaGVhZFRlbXBsYXRlIGFzIG1vZGVybkhlYWRUZW1wbGF0ZSwgY2xvc2VUZW1wbGF0ZSBhcyBtb2Rlcm5DbG9zZVRlbXBsYXRlIH0gZnJvbSAnLi90ZW1wbGF0ZS13ZWIuYnJvd3Nlcic7XG5pbXBvcnQgeyBoZWFkVGVtcGxhdGUgYXMgY29yZG92YUhlYWRUZW1wbGF0ZSwgY2xvc2VUZW1wbGF0ZSBhcyBjb3Jkb3ZhQ2xvc2VUZW1wbGF0ZSB9IGZyb20gJy4vdGVtcGxhdGUtd2ViLmNvcmRvdmEnO1xuXG4vLyBDb3BpZWQgZnJvbSB3ZWJhcHBfc2VydmVyXG5jb25zdCByZWFkVXRmOEZpbGVTeW5jID0gZmlsZW5hbWUgPT4gcmVhZEZpbGVTeW5jKGZpbGVuYW1lLCAndXRmOCcpO1xuXG5jb25zdCBpZGVudGl0eSA9IHZhbHVlID0+IHZhbHVlO1xuXG5mdW5jdGlvbiBhcHBlbmRUb1N0cmVhbShjaHVuaywgc3RyZWFtKSB7XG4gIGlmICh0eXBlb2YgY2h1bmsgPT09IFwic3RyaW5nXCIpIHtcbiAgICBzdHJlYW0uYXBwZW5kKEJ1ZmZlci5mcm9tKGNodW5rLCBcInV0ZjhcIikpO1xuICB9IGVsc2UgaWYgKEJ1ZmZlci5pc0J1ZmZlcihjaHVuaykgfHxcbiAgICAgICAgICAgICB0eXBlb2YgY2h1bmsucmVhZCA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgc3RyZWFtLmFwcGVuZChjaHVuayk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEJvaWxlcnBsYXRlIHtcbiAgY29uc3RydWN0b3IoYXJjaCwgbWFuaWZlc3QsIG9wdGlvbnMgPSB7fSkge1xuICAgIGNvbnN0IHsgaGVhZFRlbXBsYXRlLCBjbG9zZVRlbXBsYXRlIH0gPSBnZXRUZW1wbGF0ZShhcmNoKTtcbiAgICB0aGlzLmhlYWRUZW1wbGF0ZSA9IGhlYWRUZW1wbGF0ZTtcbiAgICB0aGlzLmNsb3NlVGVtcGxhdGUgPSBjbG9zZVRlbXBsYXRlO1xuICAgIHRoaXMuYmFzZURhdGEgPSBudWxsO1xuXG4gICAgdGhpcy5fZ2VuZXJhdGVCb2lsZXJwbGF0ZUZyb21NYW5pZmVzdChcbiAgICAgIG1hbmlmZXN0LFxuICAgICAgb3B0aW9uc1xuICAgICk7XG4gIH1cblxuICB0b0hUTUwoZXh0cmFEYXRhKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgXCJUaGUgQm9pbGVycGxhdGUjdG9IVE1MIG1ldGhvZCBoYXMgYmVlbiByZW1vdmVkLiBcIiArXG4gICAgICAgIFwiUGxlYXNlIHVzZSBCb2lsZXJwbGF0ZSN0b0hUTUxTdHJlYW0gaW5zdGVhZC5cIlxuICAgICk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgUHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGEgc3RyaW5nIG9mIEhUTUwuXG4gIHRvSFRNTEFzeW5jKGV4dHJhRGF0YSkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBjb25zdCBzdHJlYW0gPSB0aGlzLnRvSFRNTFN0cmVhbShleHRyYURhdGEpO1xuICAgICAgY29uc3QgY2h1bmtzID0gW107XG4gICAgICBzdHJlYW0ub24oXCJkYXRhXCIsIGNodW5rID0+IGNodW5rcy5wdXNoKGNodW5rKSk7XG4gICAgICBzdHJlYW0ub24oXCJlbmRcIiwgKCkgPT4ge1xuICAgICAgICByZXNvbHZlKEJ1ZmZlci5jb25jYXQoY2h1bmtzKS50b1N0cmluZyhcInV0ZjhcIikpO1xuICAgICAgfSk7XG4gICAgICBzdHJlYW0ub24oXCJlcnJvclwiLCByZWplY3QpO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gVGhlICdleHRyYURhdGEnIGFyZ3VtZW50IGNhbiBiZSB1c2VkIHRvIGV4dGVuZCAnc2VsZi5iYXNlRGF0YScuIEl0c1xuICAvLyBwdXJwb3NlIGlzIHRvIGFsbG93IHlvdSB0byBzcGVjaWZ5IGRhdGEgdGhhdCB5b3UgbWlnaHQgbm90IGtub3cgYXRcbiAgLy8gdGhlIHRpbWUgdGhhdCB5b3UgY29uc3RydWN0IHRoZSBCb2lsZXJwbGF0ZSBvYmplY3QuIChlLmcuIGl0IGlzIHVzZWRcbiAgLy8gYnkgJ3dlYmFwcCcgdG8gc3BlY2lmeSBkYXRhIHRoYXQgaXMgb25seSBrbm93biBhdCByZXF1ZXN0LXRpbWUpLlxuICAvLyB0aGlzIHJldHVybnMgYSBzdHJlYW1cbiAgdG9IVE1MU3RyZWFtKGV4dHJhRGF0YSkge1xuICAgIGlmICghdGhpcy5iYXNlRGF0YSB8fCAhdGhpcy5oZWFkVGVtcGxhdGUgfHwgIXRoaXMuY2xvc2VUZW1wbGF0ZSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdCb2lsZXJwbGF0ZSBkaWQgbm90IGluc3RhbnRpYXRlIGNvcnJlY3RseS4nKTtcbiAgICB9XG5cbiAgICBjb25zdCBkYXRhID0gey4uLnRoaXMuYmFzZURhdGEsIC4uLmV4dHJhRGF0YX07XG4gICAgY29uc3Qgc3RhcnQgPSBcIjwhRE9DVFlQRSBodG1sPlxcblwiICsgdGhpcy5oZWFkVGVtcGxhdGUoZGF0YSk7XG5cbiAgICBjb25zdCB7IGJvZHksIGR5bmFtaWNCb2R5IH0gPSBkYXRhO1xuXG4gICAgY29uc3QgZW5kID0gdGhpcy5jbG9zZVRlbXBsYXRlKGRhdGEpO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gY3JlYXRlU3RyZWFtKCk7XG5cbiAgICBhcHBlbmRUb1N0cmVhbShzdGFydCwgcmVzcG9uc2UpO1xuXG4gICAgaWYgKGJvZHkpIHtcbiAgICAgIGFwcGVuZFRvU3RyZWFtKGJvZHksIHJlc3BvbnNlKTtcbiAgICB9XG5cbiAgICBpZiAoZHluYW1pY0JvZHkpIHtcbiAgICAgIGFwcGVuZFRvU3RyZWFtKGR5bmFtaWNCb2R5LCByZXNwb25zZSk7XG4gICAgfVxuXG4gICAgYXBwZW5kVG9TdHJlYW0oZW5kLCByZXNwb25zZSk7XG5cbiAgICByZXR1cm4gcmVzcG9uc2U7XG4gIH1cblxuICAvLyBYWFggRXhwb3J0ZWQgdG8gYWxsb3cgY2xpZW50LXNpZGUgb25seSBjaGFuZ2VzIHRvIHJlYnVpbGQgdGhlIGJvaWxlcnBsYXRlXG4gIC8vIHdpdGhvdXQgcmVxdWlyaW5nIGEgZnVsbCBzZXJ2ZXIgcmVzdGFydC5cbiAgLy8gUHJvZHVjZXMgYW4gSFRNTCBzdHJpbmcgd2l0aCBnaXZlbiBtYW5pZmVzdCBhbmQgYm9pbGVycGxhdGVTb3VyY2UuXG4gIC8vIE9wdGlvbmFsbHkgdGFrZXMgdXJsTWFwcGVyIGluIGNhc2UgdXJscyBmcm9tIG1hbmlmZXN0IG5lZWQgdG8gYmUgcHJlZml4ZWRcbiAgLy8gb3IgcmV3cml0dGVuLlxuICAvLyBPcHRpb25hbGx5IHRha2VzIHBhdGhNYXBwZXIgZm9yIHJlc29sdmluZyByZWxhdGl2ZSBmaWxlIHN5c3RlbSBwYXRocy5cbiAgLy8gT3B0aW9uYWxseSBhbGxvd3MgdG8gb3ZlcnJpZGUgZmllbGRzIG9mIHRoZSBkYXRhIGNvbnRleHQuXG4gIF9nZW5lcmF0ZUJvaWxlcnBsYXRlRnJvbU1hbmlmZXN0KG1hbmlmZXN0LCB7XG4gICAgdXJsTWFwcGVyID0gaWRlbnRpdHksXG4gICAgcGF0aE1hcHBlciA9IGlkZW50aXR5LFxuICAgIGJhc2VEYXRhRXh0ZW5zaW9uLFxuICAgIGlubGluZSxcbiAgfSA9IHt9KSB7XG5cbiAgICBjb25zdCBib2lsZXJwbGF0ZUJhc2VEYXRhID0ge1xuICAgICAgY3NzOiBbXSxcbiAgICAgIGpzOiBbXSxcbiAgICAgIGhlYWQ6ICcnLFxuICAgICAgYm9keTogJycsXG4gICAgICBtZXRlb3JNYW5pZmVzdDogSlNPTi5zdHJpbmdpZnkobWFuaWZlc3QpLFxuICAgICAgLi4uYmFzZURhdGFFeHRlbnNpb24sXG4gICAgfTtcblxuICAgIG1hbmlmZXN0LmZvckVhY2goaXRlbSA9PiB7XG4gICAgICBjb25zdCB1cmxQYXRoID0gdXJsTWFwcGVyKGl0ZW0udXJsKTtcbiAgICAgIGNvbnN0IGl0ZW1PYmogPSB7IHVybDogdXJsUGF0aCB9O1xuXG4gICAgICBpZiAoaW5saW5lKSB7XG4gICAgICAgIGl0ZW1PYmouc2NyaXB0Q29udGVudCA9IHJlYWRVdGY4RmlsZVN5bmMoXG4gICAgICAgICAgcGF0aE1hcHBlcihpdGVtLnBhdGgpKTtcbiAgICAgICAgaXRlbU9iai5pbmxpbmUgPSB0cnVlO1xuICAgICAgfSBlbHNlIGlmIChpdGVtLnNyaSkge1xuICAgICAgICBpdGVtT2JqLnNyaSA9IGl0ZW0uc3JpO1xuICAgICAgfVxuXG4gICAgICBpZiAoaXRlbS50eXBlID09PSAnY3NzJyAmJiBpdGVtLndoZXJlID09PSAnY2xpZW50Jykge1xuICAgICAgICBib2lsZXJwbGF0ZUJhc2VEYXRhLmNzcy5wdXNoKGl0ZW1PYmopO1xuICAgICAgfVxuXG4gICAgICBpZiAoaXRlbS50eXBlID09PSAnanMnICYmIGl0ZW0ud2hlcmUgPT09ICdjbGllbnQnICYmXG4gICAgICAgIC8vIER5bmFtaWMgSlMgbW9kdWxlcyBzaG91bGQgbm90IGJlIGxvYWRlZCBlYWdlcmx5IGluIHRoZVxuICAgICAgICAvLyBpbml0aWFsIEhUTUwgb2YgdGhlIGFwcC5cbiAgICAgICAgIWl0ZW0ucGF0aC5zdGFydHNXaXRoKCdkeW5hbWljLycpKSB7XG4gICAgICAgIGJvaWxlcnBsYXRlQmFzZURhdGEuanMucHVzaChpdGVtT2JqKTtcbiAgICAgIH1cblxuICAgICAgaWYgKGl0ZW0udHlwZSA9PT0gJ2hlYWQnKSB7XG4gICAgICAgIGJvaWxlcnBsYXRlQmFzZURhdGEuaGVhZCA9XG4gICAgICAgICAgcmVhZFV0ZjhGaWxlU3luYyhwYXRoTWFwcGVyKGl0ZW0ucGF0aCkpO1xuICAgICAgfVxuXG4gICAgICBpZiAoaXRlbS50eXBlID09PSAnYm9keScpIHtcbiAgICAgICAgYm9pbGVycGxhdGVCYXNlRGF0YS5ib2R5ID1cbiAgICAgICAgICByZWFkVXRmOEZpbGVTeW5jKHBhdGhNYXBwZXIoaXRlbS5wYXRoKSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICB0aGlzLmJhc2VEYXRhID0gYm9pbGVycGxhdGVCYXNlRGF0YTtcbiAgfVxufTtcblxuLy8gUmV0dXJucyBhIHRlbXBsYXRlIGZ1bmN0aW9uIHRoYXQsIHdoZW4gY2FsbGVkLCBwcm9kdWNlcyB0aGUgYm9pbGVycGxhdGVcbi8vIGh0bWwgYXMgYSBzdHJpbmcuXG5mdW5jdGlvbiBnZXRUZW1wbGF0ZShhcmNoKSB7XG4gIGNvbnN0IHByZWZpeCA9IGFyY2guc3BsaXQoXCIuXCIsIDIpLmpvaW4oXCIuXCIpO1xuXG4gIGlmIChwcmVmaXggPT09IFwid2ViLmJyb3dzZXJcIikge1xuICAgIHJldHVybiB7IGhlYWRUZW1wbGF0ZTogbW9kZXJuSGVhZFRlbXBsYXRlLCBjbG9zZVRlbXBsYXRlOiBtb2Rlcm5DbG9zZVRlbXBsYXRlIH07XG4gIH1cblxuICBpZiAocHJlZml4ID09PSBcIndlYi5jb3Jkb3ZhXCIpIHtcbiAgICByZXR1cm4geyBoZWFkVGVtcGxhdGU6IGNvcmRvdmFIZWFkVGVtcGxhdGUsIGNsb3NlVGVtcGxhdGU6IGNvcmRvdmFDbG9zZVRlbXBsYXRlIH07XG4gIH1cblxuICB0aHJvdyBuZXcgRXJyb3IoXCJVbnN1cHBvcnRlZCBhcmNoOiBcIiArIGFyY2gpO1xufVxuIiwiaW1wb3J0IHRlbXBsYXRlIGZyb20gJy4vdGVtcGxhdGUnO1xuXG5jb25zdCBzcmkgPSAoc3JpLCBtb2RlKSA9PlxuICAoc3JpICYmIG1vZGUpID8gYCBpbnRlZ3JpdHk9XCJzaGE1MTItJHtzcml9XCIgY3Jvc3NvcmlnaW49XCIke21vZGV9XCJgIDogJyc7XG5cbmV4cG9ydCBjb25zdCBoZWFkVGVtcGxhdGUgPSAoe1xuICBjc3MsXG4gIGh0bWxBdHRyaWJ1dGVzLFxuICBidW5kbGVkSnNDc3NVcmxSZXdyaXRlSG9vayxcbiAgc3JpTW9kZSxcbiAgaGVhZCxcbiAgZHluYW1pY0hlYWQsXG59KSA9PiB7XG4gIHZhciBoZWFkU2VjdGlvbnMgPSBoZWFkLnNwbGl0KC88bWV0ZW9yLWJ1bmRsZWQtY3NzW148Pl0qPi8sIDIpO1xuICB2YXIgY3NzQnVuZGxlID0gWy4uLihjc3MgfHwgW10pLm1hcChmaWxlID0+XG4gICAgdGVtcGxhdGUoJyAgPGxpbmsgcmVsPVwic3R5bGVzaGVldFwiIHR5cGU9XCJ0ZXh0L2Nzc1wiIGNsYXNzPVwiX19tZXRlb3ItY3NzX19cIiBocmVmPVwiPCUtIGhyZWYgJT5cIjwlPSBzcmkgJT4+Jykoe1xuICAgICAgaHJlZjogYnVuZGxlZEpzQ3NzVXJsUmV3cml0ZUhvb2soZmlsZS51cmwpLFxuICAgICAgc3JpOiBzcmkoZmlsZS5zcmksIHNyaU1vZGUpLFxuICAgIH0pXG4gICldLmpvaW4oJ1xcbicpO1xuXG4gIHJldHVybiBbXG4gICAgJzxodG1sJyArIE9iamVjdC5rZXlzKGh0bWxBdHRyaWJ1dGVzIHx8IHt9KS5tYXAoXG4gICAgICBrZXkgPT4gdGVtcGxhdGUoJyA8JT0gYXR0ck5hbWUgJT49XCI8JS0gYXR0clZhbHVlICU+XCInKSh7XG4gICAgICAgIGF0dHJOYW1lOiBrZXksXG4gICAgICAgIGF0dHJWYWx1ZTogaHRtbEF0dHJpYnV0ZXNba2V5XSxcbiAgICAgIH0pXG4gICAgKS5qb2luKCcnKSArICc+JyxcblxuICAgICc8aGVhZD4nLFxuXG4gICAgKGhlYWRTZWN0aW9ucy5sZW5ndGggPT09IDEpXG4gICAgICA/IFtjc3NCdW5kbGUsIGhlYWRTZWN0aW9uc1swXV0uam9pbignXFxuJylcbiAgICAgIDogW2hlYWRTZWN0aW9uc1swXSwgY3NzQnVuZGxlLCBoZWFkU2VjdGlvbnNbMV1dLmpvaW4oJ1xcbicpLFxuXG4gICAgZHluYW1pY0hlYWQsXG4gICAgJzwvaGVhZD4nLFxuICAgICc8Ym9keT4nLFxuICBdLmpvaW4oJ1xcbicpO1xufTtcblxuLy8gVGVtcGxhdGUgZnVuY3Rpb24gZm9yIHJlbmRlcmluZyB0aGUgYm9pbGVycGxhdGUgaHRtbCBmb3IgYnJvd3NlcnNcbmV4cG9ydCBjb25zdCBjbG9zZVRlbXBsYXRlID0gKHtcbiAgbWV0ZW9yUnVudGltZUNvbmZpZyxcbiAgbWV0ZW9yUnVudGltZUhhc2gsXG4gIHJvb3RVcmxQYXRoUHJlZml4LFxuICBpbmxpbmVTY3JpcHRzQWxsb3dlZCxcbiAganMsXG4gIGFkZGl0aW9uYWxTdGF0aWNKcyxcbiAgYnVuZGxlZEpzQ3NzVXJsUmV3cml0ZUhvb2ssXG4gIHNyaU1vZGUsXG59KSA9PiBbXG4gICcnLFxuICBpbmxpbmVTY3JpcHRzQWxsb3dlZFxuICAgID8gdGVtcGxhdGUoJyAgPHNjcmlwdCB0eXBlPVwidGV4dC9qYXZhc2NyaXB0XCI+X19tZXRlb3JfcnVudGltZV9jb25maWdfXyA9IEpTT04ucGFyc2UoZGVjb2RlVVJJQ29tcG9uZW50KDwlPSBjb25mICU+KSk8L3NjcmlwdD4nKSh7XG4gICAgICBjb25mOiBtZXRlb3JSdW50aW1lQ29uZmlnLFxuICAgIH0pXG4gICAgOiB0ZW1wbGF0ZSgnICA8c2NyaXB0IHR5cGU9XCJ0ZXh0L2phdmFzY3JpcHRcIiBzcmM9XCI8JS0gc3JjICU+L21ldGVvcl9ydW50aW1lX2NvbmZpZy5qcz9oYXNoPTwlLSBoYXNoICU+XCI+PC9zY3JpcHQ+Jykoe1xuICAgICAgc3JjOiByb290VXJsUGF0aFByZWZpeCxcbiAgICAgIGhhc2g6IG1ldGVvclJ1bnRpbWVIYXNoLFxuICAgIH0pLFxuICAnJyxcblxuICAuLi4oanMgfHwgW10pLm1hcChmaWxlID0+XG4gICAgdGVtcGxhdGUoJyAgPHNjcmlwdCB0eXBlPVwidGV4dC9qYXZhc2NyaXB0XCIgc3JjPVwiPCUtIHNyYyAlPlwiPCU9IHNyaSAlPj48L3NjcmlwdD4nKSh7XG4gICAgICBzcmM6IGJ1bmRsZWRKc0Nzc1VybFJld3JpdGVIb29rKGZpbGUudXJsKSxcbiAgICAgIHNyaTogc3JpKGZpbGUuc3JpLCBzcmlNb2RlKSxcbiAgICB9KVxuICApLFxuXG4gIC4uLihhZGRpdGlvbmFsU3RhdGljSnMgfHwgW10pLm1hcCgoeyBjb250ZW50cywgcGF0aG5hbWUgfSkgPT4gKFxuICAgIGlubGluZVNjcmlwdHNBbGxvd2VkXG4gICAgICA/IHRlbXBsYXRlKCcgIDxzY3JpcHQ+PCU9IGNvbnRlbnRzICU+PC9zY3JpcHQ+Jykoe1xuICAgICAgICBjb250ZW50cyxcbiAgICAgIH0pXG4gICAgICA6IHRlbXBsYXRlKCcgIDxzY3JpcHQgdHlwZT1cInRleHQvamF2YXNjcmlwdFwiIHNyYz1cIjwlLSBzcmMgJT5cIj48L3NjcmlwdD4nKSh7XG4gICAgICAgIHNyYzogcm9vdFVybFBhdGhQcmVmaXggKyBwYXRobmFtZSxcbiAgICAgIH0pXG4gICkpLFxuXG4gICcnLFxuICAnJyxcbiAgJzwvYm9keT4nLFxuICAnPC9odG1sPidcbl0uam9pbignXFxuJyk7XG4iLCJpbXBvcnQgdGVtcGxhdGUgZnJvbSAnLi90ZW1wbGF0ZSc7XG5cbi8vIFRlbXBsYXRlIGZ1bmN0aW9uIGZvciByZW5kZXJpbmcgdGhlIGJvaWxlcnBsYXRlIGh0bWwgZm9yIGNvcmRvdmFcbmV4cG9ydCBjb25zdCBoZWFkVGVtcGxhdGUgPSAoe1xuICBtZXRlb3JSdW50aW1lQ29uZmlnLFxuICByb290VXJsUGF0aFByZWZpeCxcbiAgaW5saW5lU2NyaXB0c0FsbG93ZWQsXG4gIGNzcyxcbiAganMsXG4gIGFkZGl0aW9uYWxTdGF0aWNKcyxcbiAgaHRtbEF0dHJpYnV0ZXMsXG4gIGJ1bmRsZWRKc0Nzc1VybFJld3JpdGVIb29rLFxuICBoZWFkLFxuICBkeW5hbWljSGVhZCxcbn0pID0+IHtcbiAgdmFyIGhlYWRTZWN0aW9ucyA9IGhlYWQuc3BsaXQoLzxtZXRlb3ItYnVuZGxlZC1jc3NbXjw+XSo+LywgMik7XG4gIHZhciBjc3NCdW5kbGUgPSBbXG4gICAgLy8gV2UgYXJlIGV4cGxpY2l0bHkgbm90IHVzaW5nIGJ1bmRsZWRKc0Nzc1VybFJld3JpdGVIb29rOiBpbiBjb3Jkb3ZhIHdlIHNlcnZlIGFzc2V0cyB1cCBkaXJlY3RseSBmcm9tIGRpc2ssIHNvIHJld3JpdGluZyB0aGUgVVJMIGRvZXMgbm90IG1ha2Ugc2Vuc2VcbiAgICAuLi4oY3NzIHx8IFtdKS5tYXAoZmlsZSA9PlxuICAgICAgdGVtcGxhdGUoJyAgPGxpbmsgcmVsPVwic3R5bGVzaGVldFwiIHR5cGU9XCJ0ZXh0L2Nzc1wiIGNsYXNzPVwiX19tZXRlb3ItY3NzX19cIiBocmVmPVwiPCUtIGhyZWYgJT5cIj4nKSh7XG4gICAgICAgIGhyZWY6IGZpbGUudXJsLFxuICAgICAgfSlcbiAgKV0uam9pbignXFxuJyk7XG5cbiAgcmV0dXJuIFtcbiAgICAnPGh0bWw+JyxcbiAgICAnPGhlYWQ+JyxcbiAgICAnICA8bWV0YSBjaGFyc2V0PVwidXRmLThcIj4nLFxuICAgICcgIDxtZXRhIG5hbWU9XCJmb3JtYXQtZGV0ZWN0aW9uXCIgY29udGVudD1cInRlbGVwaG9uZT1ub1wiPicsXG4gICAgJyAgPG1ldGEgbmFtZT1cInZpZXdwb3J0XCIgY29udGVudD1cInVzZXItc2NhbGFibGU9bm8sIGluaXRpYWwtc2NhbGU9MSwgbWF4aW11bS1zY2FsZT0xLCBtaW5pbXVtLXNjYWxlPTEsIHdpZHRoPWRldmljZS13aWR0aCwgaGVpZ2h0PWRldmljZS1oZWlnaHQsIHZpZXdwb3J0LWZpdD1jb3ZlclwiPicsXG4gICAgJyAgPG1ldGEgbmFtZT1cIm1zYXBwbGljYXRpb24tdGFwLWhpZ2hsaWdodFwiIGNvbnRlbnQ9XCJub1wiPicsXG4gICAgJyAgPG1ldGEgaHR0cC1lcXVpdj1cIkNvbnRlbnQtU2VjdXJpdHktUG9saWN5XCIgY29udGVudD1cImRlZmF1bHQtc3JjICogYW5kcm9pZC13ZWJ2aWV3LXZpZGVvLXBvc3RlcjogZ2FwOiBkYXRhOiBibG9iOiBcXCd1bnNhZmUtaW5saW5lXFwnIFxcJ3Vuc2FmZS1ldmFsXFwnIHdzOiB3c3M6O1wiPicsXG5cbiAgKGhlYWRTZWN0aW9ucy5sZW5ndGggPT09IDEpXG4gICAgPyBbY3NzQnVuZGxlLCBoZWFkU2VjdGlvbnNbMF1dLmpvaW4oJ1xcbicpXG4gICAgOiBbaGVhZFNlY3Rpb25zWzBdLCBjc3NCdW5kbGUsIGhlYWRTZWN0aW9uc1sxXV0uam9pbignXFxuJyksXG5cbiAgICAnICA8c2NyaXB0IHR5cGU9XCJ0ZXh0L2phdmFzY3JpcHRcIj4nLFxuICAgIHRlbXBsYXRlKCcgICAgX19tZXRlb3JfcnVudGltZV9jb25maWdfXyA9IEpTT04ucGFyc2UoZGVjb2RlVVJJQ29tcG9uZW50KDwlPSBjb25mICU+KSk7Jykoe1xuICAgICAgY29uZjogbWV0ZW9yUnVudGltZUNvbmZpZyxcbiAgICB9KSxcbiAgICAnICAgIGlmICgvQW5kcm9pZC9pLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCkpIHsnLFxuICAgIC8vIFdoZW4gQW5kcm9pZCBhcHAgaXMgZW11bGF0ZWQsIGl0IGNhbm5vdCBjb25uZWN0IHRvIGxvY2FsaG9zdCxcbiAgICAvLyBpbnN0ZWFkIGl0IHNob3VsZCBjb25uZWN0IHRvIDEwLjAuMi4yXG4gICAgLy8gKHVubGVzcyB3ZVxcJ3JlIHVzaW5nIGFuIGh0dHAgcHJveHk7IHRoZW4gaXQgd29ya3MhKVxuICAgICcgICAgICBpZiAoIV9fbWV0ZW9yX3J1bnRpbWVfY29uZmlnX18uaHR0cFByb3h5UG9ydCkgeycsXG4gICAgJyAgICAgICAgX19tZXRlb3JfcnVudGltZV9jb25maWdfXy5ST09UX1VSTCA9IChfX21ldGVvcl9ydW50aW1lX2NvbmZpZ19fLlJPT1RfVVJMIHx8IFxcJ1xcJykucmVwbGFjZSgvbG9jYWxob3N0L2ksIFxcJzEwLjAuMi4yXFwnKTsnLFxuICAgICcgICAgICAgIF9fbWV0ZW9yX3J1bnRpbWVfY29uZmlnX18uRERQX0RFRkFVTFRfQ09OTkVDVElPTl9VUkwgPSAoX19tZXRlb3JfcnVudGltZV9jb25maWdfXy5ERFBfREVGQVVMVF9DT05ORUNUSU9OX1VSTCB8fCBcXCdcXCcpLnJlcGxhY2UoL2xvY2FsaG9zdC9pLCBcXCcxMC4wLjIuMlxcJyk7JyxcbiAgICAnICAgICAgfScsXG4gICAgJyAgICB9JyxcbiAgICAnICA8L3NjcmlwdD4nLFxuICAgICcnLFxuICAgICcgIDxzY3JpcHQgdHlwZT1cInRleHQvamF2YXNjcmlwdFwiIHNyYz1cIi9jb3Jkb3ZhLmpzXCI+PC9zY3JpcHQ+JyxcblxuICAgIC4uLihqcyB8fCBbXSkubWFwKGZpbGUgPT5cbiAgICAgIHRlbXBsYXRlKCcgIDxzY3JpcHQgdHlwZT1cInRleHQvamF2YXNjcmlwdFwiIHNyYz1cIjwlLSBzcmMgJT5cIj48L3NjcmlwdD4nKSh7XG4gICAgICAgIHNyYzogZmlsZS51cmwsXG4gICAgICB9KVxuICAgICksXG5cbiAgICAuLi4oYWRkaXRpb25hbFN0YXRpY0pzIHx8IFtdKS5tYXAoKHsgY29udGVudHMsIHBhdGhuYW1lIH0pID0+IChcbiAgICAgIGlubGluZVNjcmlwdHNBbGxvd2VkXG4gICAgICAgID8gdGVtcGxhdGUoJyAgPHNjcmlwdD48JT0gY29udGVudHMgJT48L3NjcmlwdD4nKSh7XG4gICAgICAgICAgY29udGVudHMsXG4gICAgICAgIH0pXG4gICAgICAgIDogdGVtcGxhdGUoJyAgPHNjcmlwdCB0eXBlPVwidGV4dC9qYXZhc2NyaXB0XCIgc3JjPVwiPCUtIHNyYyAlPlwiPjwvc2NyaXB0PicpKHtcbiAgICAgICAgICBzcmM6IHJvb3RVcmxQYXRoUHJlZml4ICsgcGF0aG5hbWVcbiAgICAgICAgfSlcbiAgICApKSxcbiAgICAnJyxcbiAgICAnPC9oZWFkPicsXG4gICAgJycsXG4gICAgJzxib2R5PicsXG4gIF0uam9pbignXFxuJyk7XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gY2xvc2VUZW1wbGF0ZSgpIHtcbiAgcmV0dXJuIFwiPC9ib2R5PlxcbjwvaHRtbD5cIjtcbn1cbiIsImltcG9ydCBsb2Rhc2hUZW1wbGF0ZSBmcm9tICdsb2Rhc2gudGVtcGxhdGUnO1xuXG4vLyBBcyBpZGVudGlmaWVkIGluIGlzc3VlICM5MTQ5LCB3aGVuIGFuIGFwcGxpY2F0aW9uIG92ZXJyaWRlcyB0aGUgZGVmYXVsdFxuLy8gXy50ZW1wbGF0ZSBzZXR0aW5ncyB1c2luZyBfLnRlbXBsYXRlU2V0dGluZ3MsIHRob3NlIG5ldyBzZXR0aW5ncyBhcmVcbi8vIHVzZWQgYW55d2hlcmUgXy50ZW1wbGF0ZSBpcyB1c2VkLCBpbmNsdWRpbmcgd2l0aGluIHRoZVxuLy8gYm9pbGVycGxhdGUtZ2VuZXJhdG9yLiBUbyBoYW5kbGUgdGhpcywgXy50ZW1wbGF0ZSBzZXR0aW5ncyB0aGF0IGhhdmVcbi8vIGJlZW4gdmVyaWZpZWQgdG8gd29yayBhcmUgb3ZlcnJpZGRlbiBoZXJlIG9uIGVhY2ggXy50ZW1wbGF0ZSBjYWxsLlxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gdGVtcGxhdGUodGV4dCkge1xuICByZXR1cm4gbG9kYXNoVGVtcGxhdGUodGV4dCwgbnVsbCwge1xuICAgIGV2YWx1YXRlICAgIDogLzwlKFtcXHNcXFNdKz8pJT4vZyxcbiAgICBpbnRlcnBvbGF0ZSA6IC88JT0oW1xcc1xcU10rPyklPi9nLFxuICAgIGVzY2FwZSAgICAgIDogLzwlLShbXFxzXFxTXSs/KSU+L2csXG4gIH0pO1xufTsiXX0=
