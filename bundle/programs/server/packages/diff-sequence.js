Package["core-runtime"].queue("diff-sequence",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;
var ECMAScript = Package.ecmascript.ECMAScript;
var EJSON = Package.ejson.EJSON;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var DiffSequence;

var require = meteorInstall({"node_modules":{"meteor":{"diff-sequence":{"diff.js":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                              //
// packages/diff-sequence/diff.js                                                               //
//                                                                                              //
//////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                //
module.export({
  DiffSequence: () => DiffSequence
});
const DiffSequence = {};
const hasOwn = Object.prototype.hasOwnProperty;
function isObjEmpty(obj) {
  for (let key in Object(obj)) {
    if (hasOwn.call(obj, key)) {
      return false;
    }
  }
  return true;
}

// ordered: bool.
// old_results and new_results: collections of documents.
//    if ordered, they are arrays.
//    if unordered, they are IdMaps
DiffSequence.diffQueryChanges = function (ordered, oldResults, newResults, observer, options) {
  if (ordered) DiffSequence.diffQueryOrderedChanges(oldResults, newResults, observer, options);else DiffSequence.diffQueryUnorderedChanges(oldResults, newResults, observer, options);
};
DiffSequence.diffQueryUnorderedChanges = function (oldResults, newResults, observer, options) {
  options = options || {};
  var projectionFn = options.projectionFn || EJSON.clone;
  if (observer.movedBefore) {
    throw new Error("_diffQueryUnordered called with a movedBefore observer!");
  }
  newResults.forEach(function (newDoc, id) {
    var oldDoc = oldResults.get(id);
    if (oldDoc) {
      if (observer.changed && !EJSON.equals(oldDoc, newDoc)) {
        var projectedNew = projectionFn(newDoc);
        var projectedOld = projectionFn(oldDoc);
        var changedFields = DiffSequence.makeChangedFields(projectedNew, projectedOld);
        if (!isObjEmpty(changedFields)) {
          observer.changed(id, changedFields);
        }
      }
    } else if (observer.added) {
      var fields = projectionFn(newDoc);
      delete fields._id;
      observer.added(newDoc._id, fields);
    }
  });
  if (observer.removed) {
    oldResults.forEach(function (oldDoc, id) {
      if (!newResults.has(id)) observer.removed(id);
    });
  }
};
DiffSequence.diffQueryOrderedChanges = function (old_results, new_results, observer, options) {
  options = options || {};
  var projectionFn = options.projectionFn || EJSON.clone;
  var new_presence_of_id = {};
  new_results.forEach(function (doc) {
    if (new_presence_of_id[doc._id]) Meteor._debug("Duplicate _id in new_results");
    new_presence_of_id[doc._id] = true;
  });
  var old_index_of_id = {};
  old_results.forEach(function (doc, i) {
    if (doc._id in old_index_of_id) Meteor._debug("Duplicate _id in old_results");
    old_index_of_id[doc._id] = i;
  });

  // ALGORITHM:
  //
  // To determine which docs should be considered "moved" (and which
  // merely change position because of other docs moving) we run
  // a "longest common subsequence" (LCS) algorithm.  The LCS of the
  // old doc IDs and the new doc IDs gives the docs that should NOT be
  // considered moved.

  // To actually call the appropriate callbacks to get from the old state to the
  // new state:

  // First, we call removed() on all the items that only appear in the old
  // state.

  // Then, once we have the items that should not move, we walk through the new
  // results array group-by-group, where a "group" is a set of items that have
  // moved, anchored on the end by an item that should not move.  One by one, we
  // move each of those elements into place "before" the anchoring end-of-group
  // item, and fire changed events on them if necessary.  Then we fire a changed
  // event on the anchor, and move on to the next group.  There is always at
  // least one group; the last group is anchored by a virtual "null" id at the
  // end.

  // Asymptotically: O(N k) where k is number of ops, or potentially
  // O(N log N) if inner loop of LCS were made to be binary search.

  //////// LCS (longest common sequence, with respect to _id)
  // (see Wikipedia article on Longest Increasing Subsequence,
  // where the LIS is taken of the sequence of old indices of the
  // docs in new_results)
  //
  // unmoved: the output of the algorithm; members of the LCS,
  // in the form of indices into new_results
  var unmoved = [];
  // max_seq_len: length of LCS found so far
  var max_seq_len = 0;
  // seq_ends[i]: the index into new_results of the last doc in a
  // common subsequence of length of i+1 <= max_seq_len
  var N = new_results.length;
  var seq_ends = new Array(N);
  // ptrs:  the common subsequence ending with new_results[n] extends
  // a common subsequence ending with new_results[ptr[n]], unless
  // ptr[n] is -1.
  var ptrs = new Array(N);
  // virtual sequence of old indices of new results
  var old_idx_seq = function (i_new) {
    return old_index_of_id[new_results[i_new]._id];
  };
  // for each item in new_results, use it to extend a common subsequence
  // of length j <= max_seq_len
  for (var i = 0; i < N; i++) {
    if (old_index_of_id[new_results[i]._id] !== undefined) {
      var j = max_seq_len;
      // this inner loop would traditionally be a binary search,
      // but scanning backwards we will likely find a subseq to extend
      // pretty soon, bounded for example by the total number of ops.
      // If this were to be changed to a binary search, we'd still want
      // to scan backwards a bit as an optimization.
      while (j > 0) {
        if (old_idx_seq(seq_ends[j - 1]) < old_idx_seq(i)) break;
        j--;
      }
      ptrs[i] = j === 0 ? -1 : seq_ends[j - 1];
      seq_ends[j] = i;
      if (j + 1 > max_seq_len) max_seq_len = j + 1;
    }
  }

  // pull out the LCS/LIS into unmoved
  var idx = max_seq_len === 0 ? -1 : seq_ends[max_seq_len - 1];
  while (idx >= 0) {
    unmoved.push(idx);
    idx = ptrs[idx];
  }
  // the unmoved item list is built backwards, so fix that
  unmoved.reverse();

  // the last group is always anchored by the end of the result list, which is
  // an id of "null"
  unmoved.push(new_results.length);
  old_results.forEach(function (doc) {
    if (!new_presence_of_id[doc._id]) observer.removed && observer.removed(doc._id);
  });

  // for each group of things in the new_results that is anchored by an unmoved
  // element, iterate through the things before it.
  var startOfGroup = 0;
  unmoved.forEach(function (endOfGroup) {
    var groupId = new_results[endOfGroup] ? new_results[endOfGroup]._id : null;
    var oldDoc, newDoc, fields, projectedNew, projectedOld;
    for (var i = startOfGroup; i < endOfGroup; i++) {
      newDoc = new_results[i];
      if (!hasOwn.call(old_index_of_id, newDoc._id)) {
        fields = projectionFn(newDoc);
        delete fields._id;
        observer.addedBefore && observer.addedBefore(newDoc._id, fields, groupId);
        observer.added && observer.added(newDoc._id, fields);
      } else {
        // moved
        oldDoc = old_results[old_index_of_id[newDoc._id]];
        projectedNew = projectionFn(newDoc);
        projectedOld = projectionFn(oldDoc);
        fields = DiffSequence.makeChangedFields(projectedNew, projectedOld);
        if (!isObjEmpty(fields)) {
          observer.changed && observer.changed(newDoc._id, fields);
        }
        observer.movedBefore && observer.movedBefore(newDoc._id, groupId);
      }
    }
    if (groupId) {
      newDoc = new_results[endOfGroup];
      oldDoc = old_results[old_index_of_id[newDoc._id]];
      projectedNew = projectionFn(newDoc);
      projectedOld = projectionFn(oldDoc);
      fields = DiffSequence.makeChangedFields(projectedNew, projectedOld);
      if (!isObjEmpty(fields)) {
        observer.changed && observer.changed(newDoc._id, fields);
      }
    }
    startOfGroup = endOfGroup + 1;
  });
};

// General helper for diff-ing two objects.
// callbacks is an object like so:
// { leftOnly: function (key, leftValue) {...},
//   rightOnly: function (key, rightValue) {...},
//   both: function (key, leftValue, rightValue) {...},
// }
DiffSequence.diffObjects = function (left, right, callbacks) {
  Object.keys(left).forEach(key => {
    const leftValue = left[key];
    if (hasOwn.call(right, key)) {
      callbacks.both && callbacks.both(key, leftValue, right[key]);
    } else {
      callbacks.leftOnly && callbacks.leftOnly(key, leftValue);
    }
  });
  if (callbacks.rightOnly) {
    Object.keys(right).forEach(key => {
      const rightValue = right[key];
      if (!hasOwn.call(left, key)) {
        callbacks.rightOnly(key, rightValue);
      }
    });
  }
};
DiffSequence.diffMaps = function (left, right, callbacks) {
  left.forEach(function (leftValue, key) {
    if (right.has(key)) {
      callbacks.both && callbacks.both(key, leftValue, right.get(key));
    } else {
      callbacks.leftOnly && callbacks.leftOnly(key, leftValue);
    }
  });
  if (callbacks.rightOnly) {
    right.forEach(function (rightValue, key) {
      if (!left.has(key)) {
        callbacks.rightOnly(key, rightValue);
      }
    });
  }
};
DiffSequence.makeChangedFields = function (newDoc, oldDoc) {
  var fields = {};
  DiffSequence.diffObjects(oldDoc, newDoc, {
    leftOnly: function (key, value) {
      fields[key] = undefined;
    },
    rightOnly: function (key, value) {
      fields[key] = value;
    },
    both: function (key, leftValue, rightValue) {
      if (!EJSON.equals(leftValue, rightValue)) fields[key] = rightValue;
    }
  });
  return fields;
};
DiffSequence.applyChanges = function (doc, changeFields) {
  Object.keys(changeFields).forEach(key => {
    const value = changeFields[key];
    if (typeof value === "undefined") {
      delete doc[key];
    } else {
      doc[key] = value;
    }
  });
};
//////////////////////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});


/* Exports */
return {
  export: function () { return {
      DiffSequence: DiffSequence
    };},
  require: require,
  eagerModulePaths: [
    "/node_modules/meteor/diff-sequence/diff.js"
  ],
  mainModulePath: "/node_modules/meteor/diff-sequence/diff.js"
}});

//# sourceURL=meteor://💻app/packages/diff-sequence.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvZGlmZi1zZXF1ZW5jZS9kaWZmLmpzIl0sIm5hbWVzIjpbIm1vZHVsZSIsImV4cG9ydCIsIkRpZmZTZXF1ZW5jZSIsImhhc093biIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiaXNPYmpFbXB0eSIsIm9iaiIsImtleSIsImNhbGwiLCJkaWZmUXVlcnlDaGFuZ2VzIiwib3JkZXJlZCIsIm9sZFJlc3VsdHMiLCJuZXdSZXN1bHRzIiwib2JzZXJ2ZXIiLCJvcHRpb25zIiwiZGlmZlF1ZXJ5T3JkZXJlZENoYW5nZXMiLCJkaWZmUXVlcnlVbm9yZGVyZWRDaGFuZ2VzIiwicHJvamVjdGlvbkZuIiwiRUpTT04iLCJjbG9uZSIsIm1vdmVkQmVmb3JlIiwiRXJyb3IiLCJmb3JFYWNoIiwibmV3RG9jIiwiaWQiLCJvbGREb2MiLCJnZXQiLCJjaGFuZ2VkIiwiZXF1YWxzIiwicHJvamVjdGVkTmV3IiwicHJvamVjdGVkT2xkIiwiY2hhbmdlZEZpZWxkcyIsIm1ha2VDaGFuZ2VkRmllbGRzIiwiYWRkZWQiLCJmaWVsZHMiLCJfaWQiLCJyZW1vdmVkIiwiaGFzIiwib2xkX3Jlc3VsdHMiLCJuZXdfcmVzdWx0cyIsIm5ld19wcmVzZW5jZV9vZl9pZCIsImRvYyIsIk1ldGVvciIsIl9kZWJ1ZyIsIm9sZF9pbmRleF9vZl9pZCIsImkiLCJ1bm1vdmVkIiwibWF4X3NlcV9sZW4iLCJOIiwibGVuZ3RoIiwic2VxX2VuZHMiLCJBcnJheSIsInB0cnMiLCJvbGRfaWR4X3NlcSIsImlfbmV3IiwidW5kZWZpbmVkIiwiaiIsImlkeCIsInB1c2giLCJyZXZlcnNlIiwic3RhcnRPZkdyb3VwIiwiZW5kT2ZHcm91cCIsImdyb3VwSWQiLCJhZGRlZEJlZm9yZSIsImRpZmZPYmplY3RzIiwibGVmdCIsInJpZ2h0IiwiY2FsbGJhY2tzIiwia2V5cyIsImxlZnRWYWx1ZSIsImJvdGgiLCJsZWZ0T25seSIsInJpZ2h0T25s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c291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGNvbnN0IERpZmZTZXF1ZW5jZSA9IHt9O1xuXG5jb25zdCBoYXNPd24gPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5O1xuXG5mdW5jdGlvbiBpc09iakVtcHR5KG9iaikge1xuICBmb3IgKGxldCBrZXkgaW4gT2JqZWN0KG9iaikpIHtcbiAgICBpZiAoaGFzT3duLmNhbGwob2JqLCBrZXkpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG4vLyBvcmRlcmVkOiBib29sLlxuLy8gb2xkX3Jlc3VsdHMgYW5kIG5ld19yZXN1bHRzOiBjb2xsZWN0aW9ucyBvZiBkb2N1bWVudHMuXG4vLyAgICBpZiBvcmRlcmVkLCB0aGV5IGFyZSBhcnJheXMuXG4vLyAgICBpZiB1bm9yZGVyZWQsIHRoZXkgYXJlIElkTWFwc1xuRGlmZlNlcXVlbmNlLmRpZmZRdWVyeUNoYW5nZXMgPSBmdW5jdGlvbiAob3JkZXJlZCwgb2xkUmVzdWx0cywgbmV3UmVzdWx0cyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvYnNlcnZlciwgb3B0aW9ucykge1xuICBpZiAob3JkZXJlZClcbiAgICBEaWZmU2VxdWVuY2UuZGlmZlF1ZXJ5T3JkZXJlZENoYW5nZXMoXG4gICAgICBvbGRSZXN1bHRzLCBuZXdSZXN1bHRzLCBvYnNlcnZlciwgb3B0aW9ucyk7XG4gIGVsc2VcbiAgICBEaWZmU2VxdWVuY2UuZGlmZlF1ZXJ5VW5vcmRlcmVkQ2hhbmdlcyhcbiAgICAgIG9sZFJlc3VsdHMsIG5ld1Jlc3VsdHMsIG9ic2VydmVyLCBvcHRpb25zKTtcbn07XG5cbkRpZmZTZXF1ZW5jZS5kaWZmUXVlcnlVbm9yZGVyZWRDaGFuZ2VzID0gZnVuY3Rpb24gKG9sZFJlc3VsdHMsIG5ld1Jlc3VsdHMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb2JzZXJ2ZXIsIG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gIHZhciBwcm9qZWN0aW9uRm4gPSBvcHRpb25zLnByb2plY3Rpb25GbiB8fCBFSlNPTi5jbG9uZTtcblxuICBpZiAob2JzZXJ2ZXIubW92ZWRCZWZvcmUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJfZGlmZlF1ZXJ5VW5vcmRlcmVkIGNhbGxlZCB3aXRoIGEgbW92ZWRCZWZvcmUgb2JzZXJ2ZXIhXCIpO1xuICB9XG5cbiAgbmV3UmVzdWx0cy5mb3JFYWNoKGZ1bmN0aW9uIChuZXdEb2MsIGlkKSB7XG4gICAgdmFyIG9sZERvYyA9IG9sZFJlc3VsdHMuZ2V0KGlkKTtcbiAgICBpZiAob2xkRG9jKSB7XG4gICAgICBpZiAob2JzZXJ2ZXIuY2hhbmdlZCAmJiAhRUpTT04uZXF1YWxzKG9sZERvYywgbmV3RG9jKSkge1xuICAgICAgICB2YXIgcHJvamVjdGVkTmV3ID0gcHJvamVjdGlvbkZuKG5ld0RvYyk7XG4gICAgICAgIHZhciBwcm9qZWN0ZWRPbGQgPSBwcm9qZWN0aW9uRm4ob2xkRG9jKTtcbiAgICAgICAgdmFyIGNoYW5nZWRGaWVsZHMgPVxuICAgICAgICAgICAgICBEaWZmU2VxdWVuY2UubWFrZUNoYW5nZWRGaWVsZHMocHJvamVjdGVkTmV3LCBwcm9qZWN0ZWRPbGQpO1xuICAgICAgICBpZiAoISBpc09iakVtcHR5KGNoYW5nZWRGaWVsZHMpKSB7XG4gICAgICAgICAgb2JzZXJ2ZXIuY2hhbmdlZChpZCwgY2hhbmdlZEZpZWxkcyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKG9ic2VydmVyLmFkZGVkKSB7XG4gICAgICB2YXIgZmllbGRzID0gcHJvamVjdGlvbkZuKG5ld0RvYyk7XG4gICAgICBkZWxldGUgZmllbGRzLl9pZDtcbiAgICAgIG9ic2VydmVyLmFkZGVkKG5ld0RvYy5faWQsIGZpZWxkcyk7XG4gICAgfVxuICB9KTtcblxuICBpZiAob2JzZXJ2ZXIucmVtb3ZlZCkge1xuICAgIG9sZFJlc3VsdHMuZm9yRWFjaChmdW5jdGlvbiAob2xkRG9jLCBpZCkge1xuICAgICAgaWYgKCFuZXdSZXN1bHRzLmhhcyhpZCkpXG4gICAgICAgIG9ic2VydmVyLnJlbW92ZWQoaWQpO1xuICAgIH0pO1xuICB9XG59O1xuXG5EaWZmU2VxdWVuY2UuZGlmZlF1ZXJ5T3JkZXJlZENoYW5nZXMgPSBmdW5jdGlvbiAob2xkX3Jlc3VsdHMsIG5ld19yZXN1bHRzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvYnNlcnZlciwgb3B0aW9ucykge1xuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgdmFyIHByb2plY3Rpb25GbiA9IG9wdGlvbnMucHJvamVjdGlvbkZuIHx8IEVKU09OLmNsb25lO1xuXG4gIHZhciBuZXdfcHJlc2VuY2Vfb2ZfaWQgPSB7fTtcbiAgbmV3X3Jlc3VsdHMuZm9yRWFjaChmdW5jdGlvbiAoZG9jKSB7XG4gICAgaWYgKG5ld19wcmVzZW5jZV9vZl9pZFtkb2MuX2lkXSlcbiAgICAgIE1ldGVvci5fZGVidWcoXCJEdXBsaWNhdGUgX2lkIGluIG5ld19yZXN1bHRzXCIpO1xuICAgIG5ld19wcmVzZW5jZV9vZl9pZFtkb2MuX2lkXSA9IHRydWU7XG4gIH0pO1xuXG4gIHZhciBvbGRfaW5kZXhfb2ZfaWQgPSB7fTtcbiAgb2xkX3Jlc3VsdHMuZm9yRWFjaChmdW5jdGlvbiAoZG9jLCBpKSB7XG4gICAgaWYgKGRvYy5faWQgaW4gb2xkX2luZGV4X29mX2lkKVxuICAgICAgTWV0ZW9yLl9kZWJ1ZyhcIkR1cGxpY2F0ZSBfaWQgaW4gb2xkX3Jlc3VsdHNcIik7XG4gICAgb2xkX2luZGV4X29mX2lkW2RvYy5faWRdID0gaTtcbiAgfSk7XG5cbiAgLy8gQUxHT1JJVEhNOlxuICAvL1xuICAvLyBUbyBkZXRlcm1pbmUgd2hpY2ggZG9jcyBzaG91bGQgYmUgY29uc2lkZXJlZCBcIm1vdmVkXCIgKGFuZCB3aGljaFxuICAvLyBtZXJlbHkgY2hhbmdlIHBvc2l0aW9uIGJlY2F1c2Ugb2Ygb3RoZXIgZG9jcyBtb3ZpbmcpIHdlIHJ1blxuICAvLyBhIFwibG9uZ2VzdCBjb21tb24gc3Vic2VxdWVuY2VcIiAoTENTKSBhbGdvcml0aG0uICBUaGUgTENTIG9mIHRoZVxuICAvLyBvbGQgZG9jIElEcyBhbmQgdGhlIG5ldyBkb2MgSURzIGdpdmVzIHRoZSBkb2NzIHRoYXQgc2hvdWxkIE5PVCBiZVxuICAvLyBjb25zaWRlcmVkIG1vdmVkLlxuXG4gIC8vIFRvIGFjdHVhbGx5IGNhbGwgdGhlIGFwcHJvcHJpYXRlIGNhbGxiYWNrcyB0byBnZXQgZnJvbSB0aGUgb2xkIHN0YXRlIHRvIHRoZVxuICAvLyBuZXcgc3RhdGU6XG5cbiAgLy8gRmlyc3QsIHdlIGNhbGwgcmVtb3ZlZCgpIG9uIGFsbCB0aGUgaXRlbXMgdGhhdCBvbmx5IGFwcGVhciBpbiB0aGUgb2xkXG4gIC8vIHN0YXRlLlxuXG4gIC8vIFRoZW4sIG9uY2Ugd2UgaGF2ZSB0aGUgaXRlbXMgdGhhdCBzaG91bGQgbm90IG1vdmUsIHdlIHdhbGsgdGhyb3VnaCB0aGUgbmV3XG4gIC8vIHJlc3VsdHMgYXJyYXkgZ3JvdXAtYnktZ3JvdXAsIHdoZXJlIGEgXCJncm91cFwiIGlzIGEgc2V0IG9mIGl0ZW1zIHRoYXQgaGF2ZVxuICAvLyBtb3ZlZCwgYW5jaG9yZWQgb24gdGhlIGVuZCBieSBhbiBpdGVtIHRoYXQgc2hvdWxkIG5vdCBtb3ZlLiAgT25lIGJ5IG9uZSwgd2VcbiAgLy8gbW92ZSBlYWNoIG9mIHRob3NlIGVsZW1lbnRzIGludG8gcGxhY2UgXCJiZWZvcmVcIiB0aGUgYW5jaG9yaW5nIGVuZC1vZi1ncm91cFxuICAvLyBpdGVtLCBhbmQgZmlyZSBjaGFuZ2VkIGV2ZW50cyBvbiB0aGVtIGlmIG5lY2Vzc2FyeS4gIFRoZW4gd2UgZmlyZSBhIGNoYW5nZWRcbiAgLy8gZXZlbnQgb24gdGhlIGFuY2hvciwgYW5kIG1vdmUgb24gdG8gdGhlIG5leHQgZ3JvdXAuICBUaGVyZSBpcyBhbHdheXMgYXRcbiAgLy8gbGVhc3Qgb25lIGdyb3VwOyB0aGUgbGFzdCBncm91cCBpcyBhbmNob3JlZCBieSBhIHZpcnR1YWwgXCJudWxsXCIgaWQgYXQgdGhlXG4gIC8vIGVuZC5cblxuICAvLyBBc3ltcHRvdGljYWxseTogTyhOIGspIHdoZXJlIGsgaXMgbnVtYmVyIG9mIG9wcywgb3IgcG90ZW50aWFsbHlcbiAgLy8gTyhOIGxvZyBOKSBpZiBpbm5lciBsb29wIG9mIExDUyB3ZXJlIG1hZGUgdG8gYmUgYmluYXJ5IHNlYXJjaC5cblxuXG4gIC8vLy8vLy8vIExDUyAobG9uZ2VzdCBjb21tb24gc2VxdWVuY2UsIHdpdGggcmVzcGVjdCB0byBfaWQpXG4gIC8vIChzZWUgV2lraXBlZGlhIGFydGljbGUgb24gTG9uZ2VzdCBJbmNyZWFzaW5nIFN1YnNlcXVlbmNlLFxuICAvLyB3aGVyZSB0aGUgTElTIGlzIHRha2VuIG9mIHRoZSBzZXF1ZW5jZSBvZiBvbGQgaW5kaWNlcyBvZiB0aGVcbiAgLy8gZG9jcyBpbiBuZXdfcmVzdWx0cylcbiAgLy9cbiAgLy8gdW5tb3ZlZDogdGhlIG91dHB1dCBvZiB0aGUgYWxnb3JpdGhtOyBtZW1iZXJzIG9mIHRoZSBMQ1MsXG4gIC8vIGluIHRoZSBmb3JtIG9mIGluZGljZXMgaW50byBuZXdfcmVzdWx0c1xuICB2YXIgdW5tb3ZlZCA9IFtdO1xuICAvLyBtYXhfc2VxX2xlbjogbGVuZ3RoIG9mIExDUyBmb3VuZCBzbyBmYXJcbiAgdmFyIG1heF9zZXFfbGVuID0gMDtcbiAgLy8gc2VxX2VuZHNbaV06IHRoZSBpbmRleCBpbnRvIG5ld19yZXN1bHRzIG9mIHRoZSBsYXN0IGRvYyBpbiBhXG4gIC8vIGNvbW1vbiBzdWJzZXF1ZW5jZSBvZiBsZW5ndGggb2YgaSsxIDw9IG1heF9zZXFfbGVuXG4gIHZhciBOID0gbmV3X3Jlc3VsdHMubGVuZ3RoO1xuICB2YXIgc2VxX2VuZHMgPSBuZXcgQXJyYXkoTik7XG4gIC8vIHB0cnM6ICB0aGUgY29tbW9uIHN1YnNlcXVlbmNlIGVuZGluZyB3aXRoIG5ld19yZXN1bHRzW25dIGV4dGVuZHNcbiAgLy8gYSBjb21tb24gc3Vic2VxdWVuY2UgZW5kaW5nIHdpdGggbmV3X3Jlc3VsdHNbcHRyW25dXSwgdW5sZXNzXG4gIC8vIHB0cltuXSBpcyAtMS5cbiAgdmFyIHB0cnMgPSBuZXcgQXJyYXkoTik7XG4gIC8vIHZpcnR1YWwgc2VxdWVuY2Ugb2Ygb2xkIGluZGljZXMgb2YgbmV3IHJlc3VsdHNcbiAgdmFyIG9sZF9pZHhfc2VxID0gZnVuY3Rpb24oaV9uZXcpIHtcbiAgICByZXR1cm4gb2xkX2luZGV4X29mX2lkW25ld19yZXN1bHRzW2lfbmV3XS5faWRdO1xuICB9O1xuICAvLyBmb3IgZWFjaCBpdGVtIGluIG5ld19yZXN1bHRzLCB1c2UgaXQgdG8gZXh0ZW5kIGEgY29tbW9uIHN1YnNlcXVlbmNlXG4gIC8vIG9mIGxlbmd0aCBqIDw9IG1heF9zZXFfbGVuXG4gIGZvcih2YXIgaT0wOyBpPE47IGkrKykge1xuICAgIGlmIChvbGRfaW5kZXhfb2ZfaWRbbmV3X3Jlc3VsdHNbaV0uX2lkXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICB2YXIgaiA9IG1heF9zZXFfbGVuO1xuICAgICAgLy8gdGhpcyBpbm5lciBsb29wIHdvdWxkIHRyYWRpdGlvbmFsbHkgYmUgYSBiaW5hcnkgc2VhcmNoLFxuICAgICAgLy8gYnV0IHNjYW5uaW5nIGJhY2t3YXJkcyB3ZSB3aWxsIGxpa2VseSBmaW5kIGEgc3Vic2VxIHRvIGV4dGVuZFxuICAgICAgLy8gcHJldHR5IHNvb24sIGJvdW5kZWQgZm9yIGV4YW1wbGUgYnkgdGhlIHRvdGFsIG51bWJlciBvZiBvcHMuXG4gICAgICAvLyBJZiB0aGlzIHdlcmUgdG8gYmUgY2hhbmdlZCB0byBhIGJpbmFyeSBzZWFyY2gsIHdlJ2Qgc3RpbGwgd2FudFxuICAgICAgLy8gdG8gc2NhbiBiYWNrd2FyZHMgYSBiaXQgYXMgYW4gb3B0aW1pemF0aW9uLlxuICAgICAgd2hpbGUgKGogPiAwKSB7XG4gICAgICAgIGlmIChvbGRfaWR4X3NlcShzZXFfZW5kc1tqLTFdKSA8IG9sZF9pZHhfc2VxKGkpKVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBqLS07XG4gICAgICB9XG5cbiAgICAgIHB0cnNbaV0gPSAoaiA9PT0gMCA/IC0xIDogc2VxX2VuZHNbai0xXSk7XG4gICAgICBzZXFfZW5kc1tqXSA9IGk7XG4gICAgICBpZiAoaisxID4gbWF4X3NlcV9sZW4pXG4gICAgICAgIG1heF9zZXFfbGVuID0gaisxO1xuICAgIH1cbiAgfVxuXG4gIC8vIHB1bGwgb3V0IHRoZSBMQ1MvTElTIGludG8gdW5tb3ZlZFxuICB2YXIgaWR4ID0gKG1heF9zZXFfbGVuID09PSAwID8gLTEgOiBzZXFfZW5kc1ttYXhfc2VxX2xlbi0xXSk7XG4gIHdoaWxlIChpZHggPj0gMCkge1xuICAgIHVubW92ZWQucHVzaChpZHgpO1xuICAgIGlkeCA9IHB0cnNbaWR4XTtcbiAgfVxuICAvLyB0aGUgdW5tb3ZlZCBpdGVtIGxpc3QgaXMgYnVpbHQgYmFja3dhcmRzLCBzbyBmaXggdGhhdFxuICB1bm1vdmVkLnJldmVyc2UoKTtcblxuICAvLyB0aGUgbGFzdCBncm91cCBpcyBhbHdheXMgYW5jaG9yZWQgYnkgdGhlIGVuZCBvZiB0aGUgcmVzdWx0IGxpc3QsIHdoaWNoIGlzXG4gIC8vIGFuIGlkIG9mIFwibnVsbFwiXG4gIHVubW92ZWQucHVzaChuZXdfcmVzdWx0cy5sZW5ndGgpO1xuXG4gIG9sZF9yZXN1bHRzLmZvckVhY2goZnVuY3Rpb24gKGRvYykge1xuICAgIGlmICghbmV3X3ByZXNlbmNlX29mX2lkW2RvYy5faWRdKVxuICAgICAgb2JzZXJ2ZXIucmVtb3ZlZCAmJiBvYnNlcnZlci5yZW1vdmVkKGRvYy5faWQpO1xuICB9KTtcblxuICAvLyBmb3IgZWFjaCBncm91cCBvZiB0aGluZ3MgaW4gdGhlIG5ld19yZXN1bHRzIHRoYXQgaXMgYW5jaG9yZWQgYnkgYW4gdW5tb3ZlZFxuICAvLyBlbGVtZW50LCBpdGVyYXRlIHRocm91Z2ggdGhlIHRoaW5ncyBiZWZvcmUgaXQuXG4gIHZhciBzdGFydE9mR3JvdXAgPSAwO1xuICB1bm1vdmVkLmZvckVhY2goZnVuY3Rpb24gKGVuZE9mR3JvdXApIHtcbiAgICB2YXIgZ3JvdXBJZCA9IG5ld19yZXN1bHRzW2VuZE9mR3JvdXBdID8gbmV3X3Jlc3VsdHNbZW5kT2ZHcm91cF0uX2lkIDogbnVsbDtcbiAgICB2YXIgb2xkRG9jLCBuZXdEb2MsIGZpZWxkcywgcHJvamVjdGVkTmV3LCBwcm9qZWN0ZWRPbGQ7XG4gICAgZm9yICh2YXIgaSA9IHN0YXJ0T2ZHcm91cDsgaSA8IGVuZE9mR3JvdXA7IGkrKykge1xuICAgICAgbmV3RG9jID0gbmV3X3Jlc3VsdHNbaV07XG4gICAgICBpZiAoIWhhc093bi5jYWxsKG9sZF9pbmRleF9vZl9pZCwgbmV3RG9jLl9pZCkpIHtcbiAgICAgICAgZmllbGRzID0gcHJvamVjdGlvbkZuKG5ld0RvYyk7XG4gICAgICAgIGRlbGV0ZSBmaWVsZHMuX2lkO1xuICAgICAgICBvYnNlcnZlci5hZGRlZEJlZm9yZSAmJiBvYnNlcnZlci5hZGRlZEJlZm9yZShuZXdEb2MuX2lkLCBmaWVsZHMsIGdyb3VwSWQpO1xuICAgICAgICBvYnNlcnZlci5hZGRlZCAmJiBvYnNlcnZlci5hZGRlZChuZXdEb2MuX2lkLCBmaWVsZHMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gbW92ZWRcbiAgICAgICAgb2xkRG9jID0gb2xkX3Jlc3VsdHNbb2xkX2luZGV4X29mX2lkW25ld0RvYy5faWRdXTtcbiAgICAgICAgcHJvamVjdGVkTmV3ID0gcHJvamVjdGlvbkZuKG5ld0RvYyk7XG4gICAgICAgIHByb2plY3RlZE9sZCA9IHByb2plY3Rpb25GbihvbGREb2MpO1xuICAgICAgICBmaWVsZHMgPSBEaWZmU2VxdWVuY2UubWFrZUNoYW5nZWRGaWVsZHMocHJvamVjdGVkTmV3LCBwcm9qZWN0ZWRPbGQpO1xuICAgICAgICBpZiAoIWlzT2JqRW1wdHkoZmllbGRzKSkge1xuICAgICAgICAgIG9ic2VydmVyLmNoYW5nZWQgJiYgb2JzZXJ2ZXIuY2hhbmdlZChuZXdEb2MuX2lkLCBmaWVsZHMpO1xuICAgICAgICB9XG4gICAgICAgIG9ic2VydmVyLm1vdmVkQmVmb3JlICYmIG9ic2VydmVyLm1vdmVkQmVmb3JlKG5ld0RvYy5faWQsIGdyb3VwSWQpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZ3JvdXBJZCkge1xuICAgICAgbmV3RG9jID0gbmV3X3Jlc3VsdHNbZW5kT2ZHcm91cF07XG4gICAgICBvbGREb2MgPSBvbGRfcmVzdWx0c1tvbGRfaW5kZXhfb2ZfaWRbbmV3RG9jLl9pZF1dO1xuICAgICAgcHJvamVjdGVkTmV3ID0gcHJvamVjdGlvbkZuKG5ld0RvYyk7XG4gICAgICBwcm9qZWN0ZWRPbGQgPSBwcm9qZWN0aW9uRm4ob2xkRG9jKTtcbiAgICAgIGZpZWxkcyA9IERpZmZTZXF1ZW5jZS5tYWtlQ2hhbmdlZEZpZWxkcyhwcm9qZWN0ZWROZXcsIHByb2plY3RlZE9sZCk7XG4gICAgICBpZiAoIWlzT2JqRW1wdHkoZmllbGRzKSkge1xuICAgICAgICBvYnNlcnZlci5jaGFuZ2VkICYmIG9ic2VydmVyLmNoYW5nZWQobmV3RG9jLl9pZCwgZmllbGRzKTtcbiAgICAgIH1cbiAgICB9XG4gICAgc3RhcnRPZkdyb3VwID0gZW5kT2ZHcm91cCsxO1xuICB9KTtcblxuXG59O1xuXG5cbi8vIEdlbmVyYWwgaGVscGVyIGZvciBkaWZmLWluZyB0d28gb2JqZWN0cy5cbi8vIGNhbGxiYWNrcyBpcyBhbiBvYmplY3QgbGlrZSBzbzpcbi8vIHsgbGVmdE9ubHk6IGZ1bmN0aW9uIChrZXksIGxlZnRWYWx1ZSkgey4uLn0sXG4vLyAgIHJpZ2h0T25seTogZnVuY3Rpb24gKGtleSwgcmlnaHRWYWx1ZSkgey4uLn0sXG4vLyAgIGJvdGg6IGZ1bmN0aW9uIChrZXksIGxlZnRWYWx1ZSwgcmlnaHRWYWx1ZSkgey4uLn0sXG4vLyB9XG5EaWZmU2VxdWVuY2UuZGlmZk9iamVjdHMgPSBmdW5jdGlvbiAobGVmdCwgcmlnaHQsIGNhbGxiYWNrcykge1xuICBPYmplY3Qua2V5cyhsZWZ0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgY29uc3QgbGVmdFZhbHVlID0gbGVmdFtrZXldO1xuICAgIGlmIChoYXNPd24uY2FsbChyaWdodCwga2V5KSkge1xuICAgICAgY2FsbGJhY2tzLmJvdGggJiYgY2FsbGJhY2tzLmJvdGgoa2V5LCBsZWZ0VmFsdWUsIHJpZ2h0W2tleV0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBjYWxsYmFja3MubGVmdE9ubHkgJiYgY2FsbGJhY2tzLmxlZnRPbmx5KGtleSwgbGVmdFZhbHVlKTtcbiAgICB9XG4gIH0pO1xuXG4gIGlmIChjYWxsYmFja3MucmlnaHRPbmx5KSB7XG4gICAgT2JqZWN0LmtleXMocmlnaHQpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGNvbnN0IHJpZ2h0VmFsdWUgPSByaWdodFtrZXldO1xuICAgICAgaWYgKCEgaGFzT3duLmNhbGwobGVmdCwga2V5KSkge1xuICAgICAgICBjYWxsYmFja3MucmlnaHRPbmx5KGtleSwgcmlnaHRWYWx1ZSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn07XG5cbkRpZmZTZXF1ZW5jZS5kaWZmTWFwcyA9IGZ1bmN0aW9uIChsZWZ0LCByaWdodCwgY2FsbGJhY2tzKSB7XG4gIGxlZnQuZm9yRWFjaChmdW5jdGlvbiAobGVmdFZhbHVlLCBrZXkpIHtcbiAgICBpZiAocmlnaHQuaGFzKGtleSkpe1xuICAgICAgY2FsbGJhY2tzLmJvdGggJiYgY2FsbGJhY2tzLmJvdGgoa2V5LCBsZWZ0VmFsdWUsIHJpZ2h0LmdldChrZXkpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY2FsbGJhY2tzLmxlZnRPbmx5ICYmIGNhbGxiYWNrcy5sZWZ0T25seShrZXksIGxlZnRWYWx1ZSk7XG4gICAgfVxuICB9KTtcblxuICBpZiAoY2FsbGJhY2tzLnJpZ2h0T25seSkge1xuICAgIHJpZ2h0LmZvckVhY2goZnVuY3Rpb24gKHJpZ2h0VmFsdWUsIGtleSkge1xuICAgICAgaWYgKCFsZWZ0LmhhcyhrZXkpKXtcbiAgICAgICAgY2FsbGJhY2tzLnJpZ2h0T25seShrZXksIHJpZ2h0VmFsdWUpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59O1xuXG5cbkRpZmZTZXF1ZW5jZS5tYWtlQ2hhbmdlZEZpZWxkcyA9IGZ1bmN0aW9uIChuZXdEb2MsIG9sZERvYykge1xuICB2YXIgZmllbGRzID0ge307XG4gIERpZmZTZXF1ZW5jZS5kaWZmT2JqZWN0cyhvbGREb2MsIG5ld0RvYywge1xuICAgIGxlZnRPbmx5OiBmdW5jdGlvbiAoa2V5LCB2YWx1ZSkge1xuICAgICAgZmllbGRzW2tleV0gPSB1bmRlZmluZWQ7XG4gICAgfSxcbiAgICByaWdodE9ubHk6IGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7XG4gICAgICBmaWVsZHNba2V5XSA9IHZhbHVlO1xuICAgIH0sXG4gICAgYm90aDogZnVuY3Rpb24gKGtleSwgbGVmdFZhbHVlLCByaWdodFZhbHVlKSB7XG4gICAgICBpZiAoIUVKU09OLmVxdWFscyhsZWZ0VmFsdWUsIHJpZ2h0VmFsdWUpKVxuICAgICAgICBmaWVsZHNba2V5XSA9IHJpZ2h0VmFsdWU7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIGZpZWxkcztcbn07XG5cbkRpZmZTZXF1ZW5jZS5hcHBseUNoYW5nZXMgPSBmdW5jdGlvbiAoZG9jLCBjaGFuZ2VGaWVsZHMpIHtcbiAgT2JqZWN0LmtleXMoY2hhbmdlRmllbGRzKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgY29uc3QgdmFsdWUgPSBjaGFuZ2VGaWVsZHNba2V5XTtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICBkZWxldGUgZG9jW2tleV07XG4gICAgfSBlbHNlIHtcbiAgICAgIGRvY1trZXldID0gdmFsdWU7XG4gICAgfVxuICB9KTtcbn07XG5cbiJdfQ==
