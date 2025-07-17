module.export({
  Profile: () => Profile
});
let inspector;
module.link("inspector", {
  "*"(v) {
    inspector = v;
  }
}, 0);
let fs;
module.link("fs", {
  "*"(v) {
    fs = v;
  }
}, 1);
let path;
module.link("path", {
  "*"(v) {
    path = v;
  }
}, 2);
const INSPECTOR_CONFIG = {
  enabled: !!process.env.METEOR_INSPECT,
  filter: process.env.METEOR_INSPECT ? process.env.METEOR_INSPECT.split(',') : [],
  context: process.env.METEOR_INSPECT_CONTEXT || '',
  outputDir: process.env.METEOR_INSPECT_OUTPUT || path.join(process.cwd(), 'profiling'),
  // Interval in ms (smaller = more details, but more memory)
  samplingInterval: process.env.METEOR_INSPECT_INTERVAL ? parseInt(process.env.METEOR_INSPECT_INTERVAL || '1000', 10) : undefined,
  maxProfileSize: parseInt(process.env.METEOR_INSPECT_MAX_SIZE || '2000', 10)
};
const filter = parseFloat(process.env.METEOR_PROFILE || "100"); // ms
let bucketStats = Object.create(null);
let SPACES_STR = ' ';
// return a string of `x` spaces
function spaces(len) {
  while (SPACES_STR.length < len) {
    SPACES_STR = SPACES_STR + SPACES_STR;
  }
  return SPACES_STR.slice(0, len);
}
let DOTS_STR = '.';
// return a string of `x` dots
function dots(len) {
  while (DOTS_STR.length < len) {
    DOTS_STR = DOTS_STR + DOTS_STR;
  }
  return DOTS_STR.slice(0, len);
}
function leftRightAlign(str1, str2, len) {
  var middle = Math.max(1, len - str1.length - str2.length);
  return str1 + spaces(middle) + str2;
}
function leftRightDots(str1, str2, len) {
  var middle = Math.max(1, len - str1.length - str2.length);
  return str1 + dots(middle) + str2;
}
function printIndentation(isLastLeafStack) {
  if (!isLastLeafStack.length) {
    return '';
  }
  const {
    length
  } = isLastLeafStack;
  let init = '';
  for (let i = 0; i < length - 1; ++i) {
    const isLastLeaf = isLastLeafStack[i];
    init += isLastLeaf ? '   ' : '│  ';
  }
  const last = isLastLeafStack[length - 1] ? '└─ ' : '├─ ';
  return init + last;
}
function formatMs(n) {
  // integer with thousands separators
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " ms";
}
function encodeEntryKey(entry) {
  return entry.join('\t');
}
function decodeEntryKey(key) {
  return key.split('\t');
}
let running = false;
function Profile(bucketName, f) {
  if (!Profile.enabled) {
    return f;
  }
  return Object.assign(function profileWrapper() {
    const args = Array.from(arguments);
    if (!running) {
      return f.apply(this, args);
    }
    const asyncLocalStorage = global.__METEOR_ASYNC_LOCAL_STORAGE;
    let store = asyncLocalStorage.getStore() || {
      currentEntry: []
    };
    const name = typeof bucketName === 'function' ? bucketName.apply(this, args) : bucketName;
    // callbacks with observer to track when the function finishes
    const profileInfo = {
      name,
      isActive: false,
      isCompleted: false,
      startTime: Date.now()
    };
    if (shouldRunInspectorProfiling(name)) {
      profileInfo.isActive = startInspectorProfiling(name);
      if (profileInfo.isActive) {
        const handleTermination = context => {
          if (profileInfo.isActive && !profileInfo.isCompleted) {
            return stopInspectorProfiling(name, true).catch(err => {
              process.stdout.write("[PROFILING_".concat(context, "] Error stopping profiling: ").concat(err, "\n"));
            });
          }
          return Promise.resolve();
        };
        process.on('exit', () => {
          handleTermination('EXIT');
        });
        const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
        signals.forEach(signal => {
          process.once(signal, () => {
            handleTermination('SIGNAL').finally(() => {
              process.exit(130);
            });
          });
        });
      }
    }
    const completeProfiler = () => {
      if (profileInfo.isActive && !profileInfo.isCompleted) {
        profileInfo.isCompleted = true;
        return stopInspectorProfiling(name, true).catch(err => {
          process.stdout.write("[PROFILING_COMPLETE] Error stopping profiling: ".concat(err));
        });
      }
      return Promise.resolve();
    };
    function completeIfSync(result) {
      if (!(result instanceof Promise)) {
        completeProfiler();
      }
    }
    try {
      if (!asyncLocalStorage.getStore()) {
        const result = asyncLocalStorage.run(store, () => runWithContext(name, store, f, this, args, completeProfiler));
        // For sync results, complete profiling here
        completeIfSync(result);
        return result;
      }
      // if there is already a store, use the current context
      const result = runWithContext(name, store, f, this, args, completeProfiler);
      // For sync results, complete profiling here
      completeIfSync(result);
      return result;
    } catch (error) {
      completeProfiler();
      throw error;
    }
  }, f);
}
// ================================
// Inspector Profiling
// ================================
let inspectorActive = false;
let rootSession = null;
let rootProfileName = null;
let profileStartTime = null;
function shouldRunInspectorProfiling(name) {
  if (!INSPECTOR_CONFIG.enabled) return false;
  return INSPECTOR_CONFIG.filter.includes(name);
}
function startInspectorProfiling(name) {
  if (!shouldRunInspectorProfiling(name)) {
    return false;
  }
  try {
    if (rootSession) {
      return false;
    }
    profileStartTime = Date.now();
    // Open the inspector only if it's not active
    if (!inspectorActive) {
      inspector.open();
      inspectorActive = true;
    }
    // Create a single session for the duration of profiling
    const session = new inspector.Session();
    session.connect();
    session.post('Profiler.enable');
    session.post('Profiler.start', {
      samplingInterval: INSPECTOR_CONFIG.samplingInterval
    });
    // Store the root session for later use
    rootSession = session;
    rootProfileName = name;
    return true;
  } catch (err) {
    process.stdout.write("[PROFILING_START] Error starting profiling for ".concat(name, ": ").concat(err, "\n"));
    return false;
  }
}
function stopInspectorProfiling(name, isActive) {
  if (!isActive || !rootSession || name !== rootProfileName) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    try {
      const duration = profileStartTime ? Date.now() - profileStartTime : 0;
      const session = rootSession;
      if (!session) {
        return resolve();
      }
      session.post('Profiler.stop', (err, result) => {
        if (err) {
          cleanupAndResolve(resolve);
          reject(err);
          return;
        }
        try {
          var _result$profile$nodes, _result$profile$sampl, _result$profile$timeD;
          // check if we have data in the profile
          if (!result || !result.profile) {
            console.error("[PROFILING_STOP] Empty profile for ".concat(name));
            cleanupAndResolve(resolve);
            return;
          }
          // check the approximate size of the profile
          const profileStr = JSON.stringify(result.profile);
          const profileSize = profileStr.length / (1024 * 1024); // in MB
          process.stdout.write("[PROFILING_STOP] Profile captured successfully for ".concat(name, ": ").concat(JSON.stringify({
            nodes: ((_result$profile$nodes = result.profile.nodes) === null || _result$profile$nodes === void 0 ? void 0 : _result$profile$nodes.length) || 0,
            samples: ((_result$profile$sampl = result.profile.samples) === null || _result$profile$sampl === void 0 ? void 0 : _result$profile$sampl.length) || 0,
            timeDeltas: ((_result$profile$timeD = result.profile.timeDeltas) === null || _result$profile$timeD === void 0 ? void 0 : _result$profile$timeD.length) || 0,
            duration: duration,
            size: profileSize.toFixed(2) + " MB"
          })));
          if (profileSize > INSPECTOR_CONFIG.maxProfileSize) {
            process.stdout.write("[PROFILING_STOP] Profile too large (".concat(profileSize.toFixed(2), "MB > ").concat(INSPECTOR_CONFIG.maxProfileSize, "MB)"));
            process.stdout.write('[PROFILING_STOP] To avoid OOM, a reduced profile will be saved');
            process.stdout.write('[PROFILING_STOP] Increase METEOR_INSPECT_MAX_SIZE or METEOR_INSPECT_INTERVAL to adjust');
            // Try to save a reduced profile
            try {
              var _result$profile$nodes2, _result$profile$sampl2, _result$profile$timeD2;
              // Simplify the profile to reduce size
              const reducedProfile = {
                nodes: ((_result$profile$nodes2 = result.profile.nodes) === null || _result$profile$nodes2 === void 0 ? void 0 : _result$profile$nodes2.slice(0, 10000)) || [],
                samples: ((_result$profile$sampl2 = result.profile.samples) === null || _result$profile$sampl2 === void 0 ? void 0 : _result$profile$sampl2.slice(0, 10000)) || [],
                timeDeltas: ((_result$profile$timeD2 = result.profile.timeDeltas) === null || _result$profile$timeD2 === void 0 ? void 0 : _result$profile$timeD2.slice(0, 10000)) || [],
                startTime: result.profile.startTime,
                endTime: result.profile.endTime,
                _warning: "profile truncated to avoid OOM. Use a larger interval."
              };
              saveProfile(reducedProfile, name, "".concat(name, "_reduced"), duration);
            } catch (reduceErr) {
              process.stdout.write("[PROFILING_STOP] Error saving reduced profile: ".concat(reduceErr));
            }
            cleanupAndResolve(resolve);
            return;
          }
          try {
            saveProfile(result.profile, name, name, duration);
          } catch (saveErr) {
            process.stdout.write("[PROFILING_STOP] Error saving profile: ".concat(saveErr));
          }
          cleanupAndResolve(resolve);
        } catch (processErr) {
          process.stdout.write("[PROFILING_STOP] Error processing profile for ".concat(name, ": ").concat(processErr));
          cleanupAndResolve(resolve);
          reject(processErr);
        }
      });
    } catch (err) {
      process.stdout.write("[PROFILING_STOP] Error in stopInspectorProfiling for ".concat(name, ": ").concat(err));
      cleanupAndResolve(resolve);
      reject(err);
    }
  });
  function cleanupAndResolve(resolve) {
    try {
      if (rootSession) {
        rootSession.post('Profiler.disable');
        rootSession.disconnect();
      }
      if (inspectorActive) {
        inspector.close();
        inspectorActive = false;
      }
      rootSession = null;
      rootProfileName = null;
      profileStartTime = null;
      // Force GC if available
      if (typeof global.gc === 'function') {
        try {
          global.gc();
          process.stdout.write('[PROFILING_STOP] Garbage collector executed successfully');
        } catch (gcErr) {
          process.stdout.write("[PROFILING_STOP] Error executing garbage collector: ".concat(gcErr));
        }
      }
      return resolve();
    } catch (cleanupErr) {
      process.stdout.write("[PROFILING_STOP] Error during cleanup: ".concat(cleanupErr));
      return resolve();
    }
  }
}
function saveProfile(profile, name, filename, duration) {
  if (!fs.existsSync(INSPECTOR_CONFIG.outputDir)) {
    fs.mkdirSync(INSPECTOR_CONFIG.outputDir, {
      recursive: true
    });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeFilename = filename.replace(/[\/\\:]/g, '_');
  const filepath = path.join(INSPECTOR_CONFIG.outputDir, "".concat(safeFilename, "-").concat(INSPECTOR_CONFIG.context, "-").concat(timestamp, ".cpuprofile"));
  fs.writeFileSync(filepath, JSON.stringify(profile));
  const profileSize = JSON.stringify(profile).length / (1024 * 1024);
  process.stdout.write("[PROFILING_SAVE] Profile for ".concat(name, " saved in: ").concat(filepath));
  process.stdout.write("[PROFILING_SAVE] Duration: ".concat(duration, "ms, size: ").concat(profileSize.toFixed(2), "MB"));
}
function runWithContext(bucketName, store, f, context, args, completeProfiler) {
  const name = typeof bucketName === "function" ? bucketName.apply(context, args) : bucketName;
  store.currentEntry = [...(store.currentEntry || []), name];
  const key = encodeEntryKey(store.currentEntry);
  const start = process.hrtime();
  let result;
  try {
    result = f.apply(context, args);
    if (result instanceof Promise) {
      // Return a promise if async
      return result.finally(() => finalizeProfiling(key, start, store.currentEntry, completeProfiler));
    }
    // Return directly if sync
    return result;
  } finally {
    if (!(result instanceof Promise)) {
      finalizeProfiling(key, start, store.currentEntry, completeProfiler);
    }
  }
}
function finalizeProfiling(key, start, currentEntry, completeProfiler) {
  const elapsed = process.hrtime(start);
  const stats = bucketStats[key] || (bucketStats[key] = {
    time: 0.0,
    count: 0,
    isOther: false
  });
  stats.time += elapsed[0] * 1000 + elapsed[1] / 1_000_000;
  stats.count++;
  currentEntry.pop();
  completeProfiler();
}
(function (Profile) {
  Profile.enabled = !!process.env.METEOR_PROFILE || !!process.env.METEOR_INSPECT;
  async function _runAsync(bucket, f) {
    runningName = bucket;
    print("(#".concat(reportNum, ") Profiling: ").concat(runningName));
    start();
    try {
      return await time(bucket, f);
    } finally {
      report();
      reportNum++;
    }
  }
  function _runSync(bucket, f) {
    runningName = bucket;
    print("(#".concat(reportNum, ") Profiling: ").concat(runningName));
    start();
    try {
      return time(bucket, f);
    } finally {
      report();
      reportNum++;
    }
  }
  function time(bucket, f) {
    return Profile(bucket, f)();
  }
  Profile.time = time;
  function run(bucket, f) {
    if (!Profile.enabled) {
      return f();
    }
    if (running) {
      // We've kept the calls to Profile.run in the tool disjoint so far,
      // and should probably keep doing so, but if we mess up, warn and continue.
      console.log("Warning: Nested Profile.run at " + bucket);
      return time(bucket, f);
    }
    const isAsyncFn = f.constructor.name === "AsyncFunction";
    if (!isAsyncFn) {
      return _runSync(bucket, f);
    }
    return _runAsync(bucket, f);
  }
  Profile.run = run;
  function start() {
    bucketStats = {};
    running = true;
  }
  let runningName;
  let reportNum = 1;
  function report() {
    if (!Profile.enabled) {
      return;
    }
    running = false;
    print('');
    setupReport();
    reportHierarchy();
    print('');
    reportHotLeaves();
    print('');
    print("(#".concat(reportNum, ") Total: ").concat(formatMs(getTopLevelTotal())) + " (".concat(runningName, ")"));
    print('');
  }
})(Profile || module.runSetters(Profile = {}, ["Profile"]));
let entries = [];
const prefix = "| ";
function entryName(entry) {
  return entry[entry.length - 1];
}
function entryStats(entry) {
  return bucketStats[encodeEntryKey(entry)];
}
function entryTime(entry) {
  return entryStats(entry).time;
}
function isTopLevelEntry(entry) {
  return entry.length === 1;
}
function topLevelEntries() {
  return entries.filter(isTopLevelEntry);
}
function print(text) {
  console.log(prefix + text);
}
function isChild(entry1, entry2) {
  if (entry2.length !== entry1.length + 1) {
    return false;
  }
  for (var i = entry1.length - 1; i >= 0; i--) {
    if (entry1[i] !== entry2[i]) {
      return false;
    }
  }
  return true;
}
function children(entry1) {
  return entries.filter(entry2 => isChild(entry1, entry2));
}
function hasChildren(entry) {
  return children(entry).length > 0;
}
function hasSignificantChildren(entry) {
  return children(entry).some(entry => entryTime(entry) >= filter);
}
function isLeaf(entry) {
  return !hasChildren(entry);
}
function otherTime(entry) {
  let total = 0;
  children(entry).forEach(child => {
    total += entryTime(child);
  });
  return entryTime(entry) - total;
}
function injectOtherTime(entry) {
  const other = entry.slice(0);
  other.push("other " + entryName(entry));
  bucketStats[encodeEntryKey(other)] = {
    time: otherTime(entry),
    count: entryStats(entry).count,
    isOther: true
  };
  entries.push(other);
}
;
function reportOn(entry) {
  let isLastLeafStack = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
  const stats = entryStats(entry);
  const isParent = hasSignificantChildren(entry);
  const name = entryName(entry);
  print((isParent ? leftRightDots : leftRightAlign)(printIndentation(isLastLeafStack) + name, formatMs(stats.time), 70) + (stats.isOther ? "" : " (" + stats.count + ")"));
  if (isParent) {
    const childrenList = children(entry).filter(entry => {
      return entryStats(entry).time > filter;
    });
    childrenList.forEach((child, i) => {
      const isLastLeaf = i === childrenList.length - 1;
      reportOn(child, isLastLeafStack.concat(isLastLeaf));
    });
  }
}
function reportHierarchy() {
  topLevelEntries().forEach(entry => reportOn(entry));
}
function allLeafs() {
  const set = Object.create(null);
  entries.filter(isLeaf).map(entryName).forEach(name => set[name] = true);
  return Object.keys(set).sort();
}
function leafTotals(leafName) {
  let time = 0;
  let count = 0;
  entries.filter(entry => {
    return entryName(entry) === leafName && isLeaf(entry);
  }).forEach(leaf => {
    const stats = entryStats(leaf);
    time += stats.time;
    count += stats.count;
  });
  return {
    time,
    count
  };
}
function reportHotLeaves() {
  print('Top leaves:');
  const totals = allLeafs().map(leaf => {
    const info = leafTotals(leaf);
    return {
      name: leaf,
      time: info.time,
      count: info.count
    };
  }).sort((a, b) => {
    return a.time === b.time ? 0 : a.time > b.time ? -1 : 1;
  });
  totals.forEach(total => {
    if (total.time < 100) {
      // hard-coded larger filter to quality as "hot" here
      return;
    }
    print(leftRightDots(total.name, formatMs(total.time), 65) + " (".concat(total.count, ")"));
  });
}
function getTopLevelTotal() {
  let topTotal = 0;
  topLevelEntries().forEach(entry => {
    topTotal += entryTime(entry);
  });
  return topTotal;
}
function setupReport() {
  entries = Object.keys(bucketStats).map(decodeEntryKey);
  entries.filter(hasSignificantChildren).forEach(parent => {
    injectOtherTime(parent);
  });
}
//# sourceMappingURL=profile.js.map