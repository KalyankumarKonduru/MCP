Package["core-runtime"].queue("modern-browsers",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;
var meteorInstall = Package.modules.meteorInstall;

var require = meteorInstall({"node_modules":{"meteor":{"modern-browsers":{"modern.js":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                  //
// packages/modern-browsers/modern.js                                                                               //
//                                                                                                                  //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                    //
const minimumVersions = Object.create(null);
const hasOwn = Object.prototype.hasOwnProperty;

// This map defines aliasing behavior in a generic way which still permits
// minimum versions to be specified for a specific browser family.
const browserAliases = {
  chrome: [
    // chromeMobile*, per https://github.com/meteor/meteor/pull/9793,
    'chromeMobile',
    'chromeMobileIOS',
    'chromeMobileWebView',

    // The major version number of Chromium and Headless Chrome track with the
    // releases of Chrome Dev, Canary and Stable, so we should be okay to
    // alias them to Chrome in a generic sense.
    // https://www.chromium.org/developers/version-numbers
    //
    // Chromium is particularly important to list here since, unlike macOS
    // builds, Linux builds list Chromium in the userAgent along with Chrome:
    //   e.g. Chromium/70.0.3538.77 Chrome/70.0.3538.77
    'chromium',
    'headlesschrome',
  ],

  edge: [
    // If a call to setMinimumBrowserVersions specifies Edge 12 as a minimum
    // version, that means no version of Internet Explorer pre-Edge should
    // be classified as modern. This edge:["ie"] alias effectively enforces
    // that logic, because there is no IE12. #9818 #9839
    'ie',
    // Detected by recent useragent-ng as a new browser family when it sees EdgiOS or EdgA in the user agent #13592
    'edgeMobile',
  ],

  firefox: ['firefoxMobile'],

  // The webapp package converts browser names to camel case, so
  // mobile_safari and mobileSafari should be synonymous.
  mobile_safari: ['mobileSafari', 'mobileSafariUI', 'mobileSafariUI/WKWebView'],

  // Embedded WebViews on iPads will be reported as Apple Mail
  safari: ['appleMail'],
};

/**
 * Expand the given minimum versions by reusing chrome versions for
 * chromeMobile (according to browserAliases above).
 * @param versions {object}
 * @return {any}
 */
function applyAliases(versions) {
  const lowerCaseVersions = Object.create(null);

  for (const browser of Object.keys(versions)) {
    lowerCaseVersions[browser.toLowerCase()] = versions[browser];
  }

  for (let original of Object.keys(browserAliases)) {
    const aliases = browserAliases[original];
    original = original.toLowerCase();

    if (hasOwn.call(lowerCaseVersions, original)) {
      for (let alias of aliases) {
        alias = alias.toLowerCase();
        if (!hasOwn.call(lowerCaseVersions, alias)) {
          lowerCaseVersions[alias] = lowerCaseVersions[original];
        }
      }
    }
  }

  return lowerCaseVersions;
}

// TODO Should it be possible for callers to setMinimumBrowserVersions to
// forbid any version of a particular browser?

/**
 * @name ModernBrowsers.isModern
 * @summary Given a { name, major, minor, patch } object like the one provided by
 * webapp via request.browser, return true if that browser qualifies as
 * "modern" according to all requested version constraints.
 * @locus server
 * @param [browser] {object} { name: string, major: number, minor?: number, patch?: number }
 * @return {boolean}
 */
function isModern(browser) {
  const lowerCaseName =
    browser && typeof browser.name === 'string' && browser.name.toLowerCase();
  if (!lowerCaseName) {
    return false;
  }
  const entry = hasOwn.call(minimumVersions, lowerCaseName)
    ? minimumVersions[lowerCaseName]
    : undefined;
    if (
      !entry ||
      // When all version numbers are 0, this typically comes from in-app WebView UAs (e.g., iOS WKWebView).
      // We can let users decide whether to treat it as a modern browser
      // via the packageSettings.unknownBrowsersAssumedModern option.
      (browser.major === 0 && browser.minor === 0 && browser.patch === 0)
    ) {
    const packageSettings = Meteor.settings.packages
      ? Meteor.settings.packages['modern-browsers']
      : undefined;
    // false if no package setting exists
    return !!(packageSettings && packageSettings.unknownBrowsersAssumedModern);
  }
  return greaterThanOrEqualTo(
    [~~browser.major, ~~browser.minor, ~~browser.patch],
    entry.version,
  );
}

/**
 * @name ModernBrowsers.setMinimumBrowserVersions
 * @summary Any package that depends on the modern-browsers package can call this
 * function to communicate its expectations for the minimum browser
 * versions that qualify as "modern." The final decision between
 * web.browser.legacy and web.browser builds will be based on the maximum of all
 * requested minimum versions for each browser.
 * @locus server
 * @param versions {object} Name of the browser engine and minimum version for at which it is considered modern. For example: {
 *   chrome: 49,
 *   edge: 12,
 *   ie: 12,
 *   firefox: 45,
 *   mobileSafari: 10,
 *   opera: 38,
 *   safari: 10,
 *   electron: [1, 6],
 * }
 * @param source {function} Name of the capability that requires these minimums.
 */
function setMinimumBrowserVersions(versions, source) {
  const lowerCaseVersions = applyAliases(versions);

  for (const lowerCaseName of Object.keys(lowerCaseVersions)) {
    const version = lowerCaseVersions[lowerCaseName];

    if (
      hasOwn.call(minimumVersions, lowerCaseName) &&
      !greaterThan(version, minimumVersions[lowerCaseName].version)
    ) {
      continue;
    }

    minimumVersions[lowerCaseName] = {
      version: copy(version),
      source: source || getCaller('setMinimumBrowserVersions'),
    };
  }
}

function getCaller(calleeName) {
  const error = new Error();
  Error.captureStackTrace(error);
  const lines = error.stack.split('\n');
  let caller;
  lines.some((line, i) => {
    if (line.indexOf(calleeName) >= 0) {
      caller = lines[i + 1].trim();
      return true;
    }
  });
  return caller;
}

/**
 * @name ModernBrowsers.getMinimumBrowserVersions
 * @summary Returns an object that lists supported browser engines and their minimum versions to be considered modern for Meteor.
 * @locus server
 * @return {object}
 */
function getMinimumBrowserVersions() {
  return minimumVersions;
}

Object.assign(exports, {
  isModern,
  setMinimumBrowserVersions,
  getMinimumBrowserVersions,
  /**
   * @name ModernBrowsers.calculateHashOfMinimumVersions
   * @summary Creates a hash of the object of minimum browser versions.
   * @return {string}
   */
  calculateHashOfMinimumVersions() {
    const { createHash } = require('crypto');
    return createHash('sha1')
      .update(JSON.stringify(minimumVersions))
      .digest('hex');
  },
});

// For making defensive copies of [major, minor, ...] version arrays, so
// they don't change unexpectedly.
function copy(version) {
  if (typeof version === 'number') {
    return version;
  }

  if (Array.isArray(version)) {
    return version.map(copy);
  }

  return version;
}

function greaterThanOrEqualTo(a, b) {
  return !greaterThan(b, a);
}

function greaterThan(a, b) {
  const as = typeof a === 'number' ? [a] : a;
  const bs = typeof b === 'number' ? [b] : b;
  const maxLen = Math.max(as.length, bs.length);

  for (let i = 0; i < maxLen; ++i) {
    a = i < as.length ? as[i] : 0;
    b = i < bs.length ? bs[i] : 0;

    if (a > b) {
      return true;
    }

    if (a < b) {
      return false;
    }
  }

  return false;
}

function makeSource(feature) {
  return module.id + ' (' + feature + ')';
}

setMinimumBrowserVersions(
  {
    chrome: 49,
    edge: 12,
    firefox: 45,
    firefoxIOS: 100,
    mobileSafari: [9, 2],
    opera: 36,
    safari: 9,
    // Electron 1.0.0+ matches Chromium 49, per
    // https://github.com/Kilian/electron-to-chromium/blob/master/full-versions.js
    electron: 1,
  },
  makeSource('classes'),
);

setMinimumBrowserVersions(
  {
    chrome: 39,
    edge: 13,
    firefox: 26,
    firefoxIOS: 100,
    mobileSafari: 10,
    opera: 26,
    safari: 10,
    // Disallow any version of PhantomJS.
    phantomjs: Infinity,
    electron: [0, 20],
  },
  makeSource('generator functions'),
);

setMinimumBrowserVersions(
  {
    chrome: 41,
    edge: 13,
    firefox: 34,
    firefoxIOS: 100,
    mobileSafari: [9, 2],
    opera: 29,
    safari: [9, 1],
    electron: [0, 24],
  },
  makeSource('template literals'),
);

setMinimumBrowserVersions(
  {
    chrome: 38,
    edge: 12,
    firefox: 36,
    firefoxIOS: 100,
    mobileSafari: 9,
    opera: 25,
    safari: 9,
    electron: [0, 20],
  },
  makeSource('symbols'),
);

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});


/* Exports */
return {
  require: require,
  eagerModulePaths: [
    "/node_modules/meteor/modern-browsers/modern.js"
  ],
  mainModulePath: "/node_modules/meteor/modern-browsers/modern.js"
}});
