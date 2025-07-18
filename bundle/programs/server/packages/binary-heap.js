Package["core-runtime"].queue("binary-heap",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;
var IdMap = Package['id-map'].IdMap;
var ECMAScript = Package.ecmascript.ECMAScript;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var MaxHeap, MinHeap, MinMaxHeap;

var require = meteorInstall({"node_modules":{"meteor":{"binary-heap":{"binary-heap.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                        //
// packages/binary-heap/binary-heap.js                                                    //
//                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////
                                                                                          //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.link("./max-heap.js", {
      MaxHeap: "MaxHeap"
    }, 0);
    module.link("./min-heap.js", {
      MinHeap: "MinHeap"
    }, 1);
    module.link("./min-max-heap.js", {
      MinMaxHeap: "MinMaxHeap"
    }, 2);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
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

},"max-heap.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                        //
// packages/binary-heap/max-heap.js                                                       //
//                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////
                                                                                          //
module.export({
  MaxHeap: () => MaxHeap
});
class MaxHeap {
  constructor(comparator) {
    let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    if (typeof comparator !== 'function') {
      throw new Error('Passed comparator is invalid, should be a comparison function');
    }

    // a C-style comparator that is given two values and returns a number,
    // negative if the first value is less than the second, positive if the second
    // value is greater than the first and zero if they are equal.
    this._comparator = comparator;
    if (!options.IdMap) {
      options.IdMap = IdMap;
    }

    // _heapIdx maps an id to an index in the Heap array the corresponding value
    // is located on.
    this._heapIdx = new options.IdMap();

    // The Heap data-structure implemented as a 0-based contiguous array where
    // every item on index idx is a node in a complete binary tree. Every node can
    // have children on indexes idx*2+1 and idx*2+2, except for the leaves. Every
    // node has a parent on index (idx-1)/2;
    this._heap = [];

    // If the initial array is passed, we can build the heap in linear time
    // complexity (O(N)) compared to linearithmic time complexity (O(nlogn)) if
    // we push elements one by one.
    if (Array.isArray(options.initData)) {
      this._initFromData(options.initData);
    }
  }

  // Builds a new heap in-place in linear time based on passed data
  _initFromData(data) {
    this._heap = data.map(_ref => {
      let {
        id,
        value
      } = _ref;
      return {
        id,
        value
      };
    });
    data.forEach((_ref2, i) => {
      let {
        id
      } = _ref2;
      return this._heapIdx.set(id, i);
    });
    if (!data.length) {
      return;
    }

    // start from the first non-leaf - the parent of the last leaf
    for (let i = parentIdx(data.length - 1); i >= 0; i--) {
      this._downHeap(i);
    }
  }
  _downHeap(idx) {
    while (leftChildIdx(idx) < this.size()) {
      const left = leftChildIdx(idx);
      const right = rightChildIdx(idx);
      let largest = idx;
      if (left < this.size()) {
        largest = this._maxIndex(largest, left);
      }
      if (right < this.size()) {
        largest = this._maxIndex(largest, right);
      }
      if (largest === idx) {
        break;
      }
      this._swap(largest, idx);
      idx = largest;
    }
  }
  _upHeap(idx) {
    while (idx > 0) {
      const parent = parentIdx(idx);
      if (this._maxIndex(parent, idx) === idx) {
        this._swap(parent, idx);
        idx = parent;
      } else {
        break;
      }
    }
  }
  _maxIndex(idxA, idxB) {
    const valueA = this._get(idxA);
    const valueB = this._get(idxB);
    return this._comparator(valueA, valueB) >= 0 ? idxA : idxB;
  }

  // Internal: gets raw data object placed on idxth place in heap
  _get(idx) {
    return this._heap[idx].value;
  }
  _swap(idxA, idxB) {
    const recA = this._heap[idxA];
    const recB = this._heap[idxB];
    this._heapIdx.set(recA.id, idxB);
    this._heapIdx.set(recB.id, idxA);
    this._heap[idxA] = recB;
    this._heap[idxB] = recA;
  }
  get(id) {
    return this.has(id) ? this._get(this._heapIdx.get(id)) : null;
  }
  set(id, value) {
    if (this.has(id)) {
      if (this.get(id) === value) {
        return;
      }
      const idx = this._heapIdx.get(id);
      this._heap[idx].value = value;

      // Fix the new value's position
      // Either bubble new value up if it is greater than its parent
      this._upHeap(idx);
      // or bubble it down if it is smaller than one of its children
      this._downHeap(idx);
    } else {
      this._heapIdx.set(id, this._heap.length);
      this._heap.push({
        id,
        value
      });
      this._upHeap(this._heap.length - 1);
    }
  }
  remove(id) {
    if (this.has(id)) {
      const last = this._heap.length - 1;
      const idx = this._heapIdx.get(id);
      if (idx !== last) {
        this._swap(idx, last);
        this._heap.pop();
        this._heapIdx.remove(id);

        // Fix the swapped value's position
        this._upHeap(idx);
        this._downHeap(idx);
      } else {
        this._heap.pop();
        this._heapIdx.remove(id);
      }
    }
  }
  has(id) {
    return this._heapIdx.has(id);
  }
  empty() {
    return !this.size();
  }
  clear() {
    this._heap = [];
    this._heapIdx.clear();
  }

  // iterate over values in no particular order
  forEach(iterator) {
    this._heap.forEach(obj => iterator(obj.value, obj.id));
  }
  size() {
    return this._heap.length;
  }
  setDefault(id, def) {
    if (this.has(id)) {
      return this.get(id);
    }
    this.set(id, def);
    return def;
  }
  clone() {
    const clone = new MaxHeap(this._comparator, this._heap);
    return clone;
  }
  maxElementId() {
    return this.size() ? this._heap[0].id : null;
  }
  _selfCheck() {
    for (let i = 1; i < this._heap.length; i++) {
      if (this._maxIndex(parentIdx(i), i) !== parentIdx(i)) {
        throw new Error("An item with id ".concat(this._heap[i].id) + " has a parent younger than it: " + this._heap[parentIdx(i)].id);
      }
    }
  }
}
const leftChildIdx = i => i * 2 + 1;
const rightChildIdx = i => i * 2 + 2;
const parentIdx = i => i - 1 >> 1;
////////////////////////////////////////////////////////////////////////////////////////////

},"min-heap.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                        //
// packages/binary-heap/min-heap.js                                                       //
//                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////
                                                                                          //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      MinHeap: () => MinHeap
    });
    let MaxHeap;
    module.link("./max-heap.js", {
      MaxHeap(v) {
        MaxHeap = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    class MinHeap extends MaxHeap {
      constructor(comparator, options) {
        super((a, b) => -comparator(a, b), options);
      }
      maxElementId() {
        throw new Error("Cannot call maxElementId on MinHeap");
      }
      minElementId() {
        return super.maxElementId();
      }
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
////////////////////////////////////////////////////////////////////////////////////////////

},"min-max-heap.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                        //
// packages/binary-heap/min-max-heap.js                                                   //
//                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////
                                                                                          //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      MinMaxHeap: () => MinMaxHeap
    });
    let MaxHeap;
    module.link("./max-heap.js", {
      MaxHeap(v) {
        MaxHeap = v;
      }
    }, 0);
    let MinHeap;
    module.link("./min-heap.js", {
      MinHeap(v) {
        MinHeap = v;
      }
    }, 1);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    class MinMaxHeap extends MaxHeap {
      constructor(comparator, options) {
        super(comparator, options);
        this._minHeap = new MinHeap(comparator, options);
      }
      set() {
        super.set(...arguments);
        this._minHeap.set(...arguments);
      }
      remove() {
        super.remove(...arguments);
        this._minHeap.remove(...arguments);
      }
      clear() {
        super.clear(...arguments);
        this._minHeap.clear(...arguments);
      }
      setDefault() {
        super.setDefault(...arguments);
        return this._minHeap.setDefault(...arguments);
      }
      clone() {
        const clone = new MinMaxHeap(this._comparator, this._heap);
        return clone;
      }
      minElementId() {
        return this._minHeap.minElementId();
      }
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
////////////////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});


/* Exports */
return {
  export: function () { return {
      MaxHeap: MaxHeap,
      MinHeap: MinHeap,
      MinMaxHeap: MinMaxHeap
    };},
  require: require,
  eagerModulePaths: [
    "/node_modules/meteor/binary-heap/binary-heap.js"
  ],
  mainModulePath: "/node_modules/meteor/binary-heap/binary-heap.js"
}});

//# sourceURL=meteor://💻app/packages/binary-heap.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvYmluYXJ5LWhlYXAvYmluYXJ5LWhlYXAuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL2JpbmFyeS1oZWFwL21heC1oZWFwLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9iaW5hcnktaGVhcC9taW4taGVhcC5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvYmluYXJ5LWhlYXAvbWluLW1heC1oZWFwLmpzIl0sIm5hbWVzIjpbIm1vZHVsZSIsImxpbmsiLCJNYXhIZWFwIiwiTWluSGVhcCIsIk1pbk1heEhlYXAiLCJfX3JlaWZ5V2FpdEZvckRlcHNfXyIsIl9fcmVpZnlfYXN5bmNfcmVzdWx0X18iLCJfcmVpZnlFcnJvciIsInNlbGYiLCJhc3luYyIsImV4cG9ydCIsImNvbnN0cnVjdG9yIiwiY29tcGFyYXRvciIsIm9wdGlvbnMiLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJ1bmRlZmluZWQiLCJFcnJvciIsIl9jb21wYXJhdG9yIiwiSWRNYXAiLCJfaGVhcElkeCIsIl9oZWFwIiwiQXJyYXkiLCJpc0FycmF5IiwiaW5pdERhdGEiLCJfaW5pdEZyb21EYXRhIiwiZGF0YSIsIm1hcCIsIl9yZWYiLCJpZCIsInZhbHVlIiwiZm9yRWFjaCIsIl9yZWYyIiwiaSIsInNldCIsInBhcmVudElkeCIsIl9kb3duSGVhcCIsImlkeCIsImxlZnRDaGlsZElkeCIsInNpemUiLCJsZWZ0IiwicmlnaHQiLCJyaWdodENoaWxkSWR4IiwibGFyZ2VzdCIsIl9tYXhJbmRleCIsIl9zd2FwIiwiX3VwSGVhcCIsInBhcmVudCIsImlkeEEiLCJpZHhCIiwidmFsdWVBIiwiX2dldCIsInZhbHVlQiIsInJlY0EiLCJyZWNCIiwiZ2V0IiwiaGFzIiwicHVzaCIsInJlbW92ZSIsImxhc3QiLCJwb3AiLCJlbXB0eSIsImNsZWFyIiwiaXRlcmF0b3IiLCJvYmoiLCJzZXREZWZhdWx0IiwiZGVmIiwiY2xvbmUiLCJtYXhFbGVtZW50SWQiLCJfc2VsZkNoZWNrIiwiY29uY2F0IiwidiIsImEiLCJiIiwibWluRWxlbWVudElkIiwiX21pbkhlYXAiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztJQUFBQSxNQUFNLENBQUNDLElBQUksQ0FBQyxlQUFlLEVBQUM7TUFBQ0MsT0FBTyxFQUFDO0lBQVMsQ0FBQyxFQUFDLENBQUMsQ0FBQztJQUFDRixNQUFNLENBQUNDLElBQUksQ0FBQyxlQUFlLEVBQUM7TUFBQ0UsT0FBTyxFQUFDO0lBQVMsQ0FBQyxFQUFDLENBQUMsQ0FBQztJQUFDSCxNQUFNLENBQUNDLElBQUksQ0FBQyxtQkFBbUIsRUFBQztNQUFDRyxVQUFVLEVBQUM7SUFBWSxDQUFDLEVBQUMsQ0FBQyxDQUFDO0lBQUMsSUFBSUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTUEsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFBQ0Msc0JBQUE7RUFBQSxTQUFBQyxXQUFBO0lBQUEsT0FBQUQsc0JBQUEsQ0FBQUMsV0FBQTtFQUFBO0VBQUFELHNCQUFBO0FBQUE7RUFBQUUsSUFBQTtFQUFBQyxLQUFBO0FBQUEsRzs7Ozs7Ozs7Ozs7QUNBaE9ULE1BQU0sQ0FBQ1UsTUFBTSxDQUFDO0VBQUNSLE9BQU8sRUFBQ0EsQ0FBQSxLQUFJQTtBQUFPLENBQUMsQ0FBQztBQVU3QixNQUFNQSxPQUFPLENBQUM7RUFDbkJTLFdBQVdBLENBQUNDLFVBQVUsRUFBZ0I7SUFBQSxJQUFkQyxPQUFPLEdBQUFDLFNBQUEsQ0FBQUMsTUFBQSxRQUFBRCxTQUFBLFFBQUFFLFNBQUEsR0FBQUYsU0FBQSxNQUFHLENBQUMsQ0FBQztJQUNsQyxJQUFJLE9BQU9GLFVBQVUsS0FBSyxVQUFVLEVBQUU7TUFDcEMsTUFBTSxJQUFJSyxLQUFLLENBQUMsK0RBQStELENBQUM7SUFDbEY7O0lBRUE7SUFDQTtJQUNBO0lBQ0EsSUFBSSxDQUFDQyxXQUFXLEdBQUdOLFVBQVU7SUFFN0IsSUFBSSxDQUFFQyxPQUFPLENBQUNNLEtB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Q0FBQztRQUN6QixPQUFPLElBQUksQ0FBQzZELFFBQVEsQ0FBQ1YsVUFBVSxDQUFDLEdBQUFuRCxTQUFPLENBQUM7TUFDMUM7TUFFQXFELEtBQUtBLENBQUEsRUFBRztRQUNOLE1BQU1BLEtBQUssR0FBRyxJQUFJL0QsVUFBVSxDQUFDLElBQUksQ0FBQ2MsV0FBVyxFQUFFLElBQUksQ0FBQ0csS0FBSyxDQUFDO1FBQzFELE9BQU84QyxLQUFLO01BQ2Q7TUFFQU8sWUFBWUEsQ0FBQSxFQUFHO1FBQ2IsT0FBTyxJQUFJLENBQUNDLFFBQVEsQ0FBQ0QsWUFBWSxDQUFDLENBQUM7TUFDckM7SUFFRjtJQUFDO0lBQUNwRSxzQkFBQTtFQUFBLFNBQUFDLFdBQUE7SUFBQSxPQUFBRCxzQkFBQSxDQUFBQyxXQUFBO0VBQUE7RUFBQUQsc0JBQUE7QUFBQTtFQUFBRSxJQUFBO0VBQUFDLEtBQUE7QUFBQSxHIiwiZmlsZSI6Ii9wYWNrYWdlcy9iaW5hcnktaGVhcC5qcyIsInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCB7IE1heEhlYXAgfSBmcm9tICcuL21heC1oZWFwLmpzJztcbmV4cG9ydCB7IE1pbkhlYXAgfSBmcm9tICcuL21pbi1oZWFwLmpzJztcbmV4cG9ydCB7IE1pbk1heEhlYXAgfSBmcm9tICcuL21pbi1tYXgtaGVhcC5qcyc7XG4iLCIvLyBDb25zdHJ1Y3RvciBvZiBIZWFwXG4vLyAtIGNvbXBhcmF0b3IgLSBGdW5jdGlvbiAtIGdpdmVuIHR3byBpdGVtcyByZXR1cm5zIGEgbnVtYmVyXG4vLyAtIG9wdGlvbnM6XG4vLyAgIC0gaW5pdERhdGEgLSBBcnJheSAtIE9wdGlvbmFsIC0gdGhlIGluaXRpYWwgZGF0YSBpbiBhIGZvcm1hdDpcbi8vICAgICAgICBPYmplY3Q6XG4vLyAgICAgICAgICAtIGlkIC0gU3RyaW5nIC0gdW5pcXVlIGlkIG9mIHRoZSBpdGVtXG4vLyAgICAgICAgICAtIHZhbHVlIC0gQW55IC0gdGhlIGRhdGEgdmFsdWVcbi8vICAgICAgZWFjaCB2YWx1ZSBpcyByZXRhaW5lZFxuLy8gICAtIElkTWFwIC0gQ29uc3RydWN0b3IgLSBPcHRpb25hbCAtIGN1c3RvbSBJZE1hcCBjbGFzcyB0byBzdG9yZSBpZC0+aW5kZXhcbi8vICAgICAgIG1hcHBpbmdzIGludGVybmFsbHkuIFN0YW5kYXJkIElkTWFwIGlzIHVzZWQgYnkgZGVmYXVsdC5cbmV4cG9ydCBjbGFzcyBNYXhIZWFwIHsgXG4gIGNvbnN0cnVjdG9yKGNvbXBhcmF0b3IsIG9wdGlvbnMgPSB7fSkge1xuICAgIGlmICh0eXBlb2YgY29tcGFyYXRvciAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdQYXNzZWQgY29tcGFyYXRvciBpcyBpbnZhbGlkLCBzaG91bGQgYmUgYSBjb21wYXJpc29uIGZ1bmN0aW9uJyk7XG4gICAgfVxuXG4gICAgLy8gYSBDLXN0eWxlIGNvbXBhcmF0b3IgdGhhdCBpcyBnaXZlbiB0d28gdmFsdWVzIGFuZCByZXR1cm5zIGEgbnVtYmVyLFxuICAgIC8vIG5lZ2F0aXZlIGlmIHRoZSBmaXJzdCB2YWx1ZSBpcyBsZXNzIHRoYW4gdGhlIHNlY29uZCwgcG9zaXRpdmUgaWYgdGhlIHNlY29uZFxuICAgIC8vIHZhbHVlIGlzIGdyZWF0ZXIgdGhhbiB0aGUgZmlyc3QgYW5kIHplcm8gaWYgdGhleSBhcmUgZXF1YWwuXG4gICAgdGhpcy5fY29tcGFyYXRvciA9IGNvbXBhcmF0b3I7XG5cbiAgICBpZiAoISBvcHRpb25zLklkTWFwKSB7XG4gICAgICBvcHRpb25zLklkTWFwID0gSWRNYXA7XG4gICAgfVxuXG4gICAgLy8gX2hlYXBJZHggbWFwcyBhbiBpZCB0byBhbiBpbmRleCBpbiB0aGUgSGVhcCBhcnJheSB0aGUgY29ycmVzcG9uZGluZyB2YWx1ZVxuICAgIC8vIGlzIGxvY2F0ZWQgb24uXG4gICAgdGhpcy5faGVhcElkeCA9IG5ldyBvcHRpb25zLklkTWFwO1xuXG4gICAgLy8gVGhlIEhlYXAgZGF0YS1zdHJ1Y3R1cmUgaW1wbGVtZW50ZWQgYXMgYSAwLWJhc2VkIGNvbnRpZ3VvdXMgYXJyYXkgd2hlcmVcbiAgICAvLyBldmVyeSBpdGVtIG9uIGluZGV4IGlkeCBpcyBhIG5vZGUgaW4gYSBjb21wbGV0ZSBiaW5hcnkgdHJlZS4gRXZlcnkgbm9kZSBjYW5cbiAgICAvLyBoYXZlIGNoaWxkcmVuIG9uIGluZGV4ZXMgaWR4KjIrMSBhbmQgaWR4KjIrMiwgZXhjZXB0IGZvciB0aGUgbGVhdmVzLiBFdmVyeVxuICAgIC8vIG5vZGUgaGFzIGEgcGFyZW50IG9uIGluZGV4IChpZHgtMSkvMjtcbiAgICB0aGlzLl9oZWFwID0gW107XG5cbiAgICAvLyBJZiB0aGUgaW5pdGlhbCBhcnJheSBpcyBwYXNzZWQsIHdlIGNhbiBidWlsZCB0aGUgaGVhcCBpbiBsaW5lYXIgdGltZVxuICAgIC8vIGNvbXBsZXhpdHkgKE8oTikpIGNvbXBhcmVkIHRvIGxpbmVhcml0aG1pYyB0aW1lIGNvbXBsZXhpdHkgKE8obmxvZ24pKSBpZlxuICAgIC8vIHdlIHB1c2ggZWxlbWVudHMgb25lIGJ5IG9uZS5cbiAgICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zLmluaXREYXRhKSkge1xuICAgICAgdGhpcy5faW5pdEZyb21EYXRhKG9wdGlvbnMuaW5pdERhdGEpO1xuICAgIH1cbiAgfVxuXG4gIC8vIEJ1aWxkcyBhIG5ldyBoZWFwIGluLXBsYWNlIGluIGxpbmVhciB0aW1lIGJhc2VkIG9uIHBhc3NlZCBkYXRhXG4gIF9pbml0RnJvbURhdGEoZGF0YSkge1xuICAgIHRoaXMuX2hlYXAgPSBkYXRhLm1hcCgoeyBpZCwgdmFsdWUgfSkgPT4gKHsgaWQsIHZhbHVlIH0pKTtcblxuICAgIGRhdGEuZm9yRWFjaCgoeyBpZCB9LCBpKSA9PiB0aGlzLl9oZWFwSWR4LnNldChpZCwgaSkpO1xuXG4gICAgaWYgKCEgZGF0YS5sZW5ndGgpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBzdGFydCBmcm9tIHRoZSBmaXJzdCBub24tbGVhZiAtIHRoZSBwYXJlbnQgb2YgdGhlIGxhc3QgbGVhZlxuICAgIGZvciAobGV0IGkgPSBwYXJlbnRJZHgoZGF0YS5sZW5ndGggLSAxKTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgIHRoaXMuX2Rvd25IZWFwKGkpO1xuICAgIH1cbiAgfVxuXG4gIF9kb3duSGVhcChpZHgpIHtcbiAgICB3aGlsZSAobGVmdENoaWxkSWR4KGlkeCkgPCB0aGlzLnNpemUoKSkge1xuICAgICAgY29uc3QgbGVmdCA9IGxlZnRDaGlsZElkeChpZHgpO1xuICAgICAgY29uc3QgcmlnaHQgPSByaWdodENoaWxkSWR4KGlkeCk7XG4gICAgICBsZXQgbGFyZ2VzdCA9IGlkeDtcblxuICAgICAgaWYgKGxlZnQgPCB0aGlzLnNpemUoKSkge1xuICAgICAgICBsYXJnZXN0ID0gdGhpcy5fbWF4SW5kZXgobGFyZ2VzdCwgbGVmdCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChyaWdodCA8IHRoaXMuc2l6ZSgpKSB7XG4gICAgICAgIGxhcmdlc3QgPSB0aGlzLl9tYXhJbmRleChsYXJnZXN0LCByaWdodCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChsYXJnZXN0ID09PSBpZHgpIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuX3N3YXAobGFyZ2VzdCwgaWR4KTtcbiAgICAgIGlkeCA9IGxhcmdlc3Q7XG4gICAgfVxuICB9XG5cbiAgX3VwSGVhcChpZHgpIHtcbiAgICB3aGlsZSAoaWR4ID4gMCkge1xuICAgICAgY29uc3QgcGFyZW50ID0gcGFyZW50SWR4KGlkeCk7XG4gICAgICBpZiAodGhpcy5fbWF4SW5kZXgocGFyZW50LCBpZHgpID09PSBpZHgpIHtcbiAgICAgICAgdGhpcy5fc3dhcChwYXJlbnQsIGlkeClcbiAgICAgICAgaWR4ID0gcGFyZW50O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgX21heEluZGV4KGlkeEEsIGlkeEIpIHtcbiAgICBjb25zdCB2YWx1ZUEgPSB0aGlzLl9nZXQoaWR4QSk7XG4gICAgY29uc3QgdmFsdWVCID0gdGhpcy5fZ2V0KGlkeEIpO1xuICAgIHJldHVybiB0aGlzLl9jb21wYXJhdG9yKHZhbHVlQSwgdmFsdWVCKSA+PSAwID8gaWR4QSA6IGlkeEI7XG4gIH1cblxuICAvLyBJbnRlcm5hbDogZ2V0cyByYXcgZGF0YSBvYmplY3QgcGxhY2VkIG9uIGlkeHRoIHBsYWNlIGluIGhlYXBcbiAgX2dldChpZHgpIHtcbiAgICByZXR1cm4gdGhpcy5faGVhcFtpZHhdLnZhbHVlO1xuICB9XG5cbiAgX3N3YXAoaWR4QSwgaWR4Qikge1xuICAgIGNvbnN0IHJlY0EgPSB0aGlzLl9oZWFwW2lkeEFdO1xuICAgIGNvbnN0IHJlY0IgPSB0aGlzLl9oZWFwW2lkeEJdO1xuXG4gICAgdGhpcy5faGVhcElkeC5zZXQocmVjQS5pZCwgaWR4Qik7XG4gICAgdGhpcy5faGVhcElkeC5zZXQocmVjQi5pZCwgaWR4QSk7XG5cbiAgICB0aGlzLl9oZWFwW2lkeEFdID0gcmVjQjtcbiAgICB0aGlzLl9oZWFwW2lkeEJdID0gcmVjQTtcbiAgfVxuXG4gIGdldChpZCkge1xuICAgIHJldHVybiB0aGlzLmhhcyhpZCkgP1xuICAgICAgdGhpcy5fZ2V0KHRoaXMuX2hlYXBJZHguZ2V0KGlkKSkgOlxuICAgICAgbnVsbDtcbiAgfVxuXG4gIHNldChpZCwgdmFsdWUpIHtcbiAgICBpZiAodGhpcy5oYXMoaWQpKSB7XG4gICAgICBpZiAodGhpcy5nZXQoaWQpID09PSB2YWx1ZSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGlkeCA9IHRoaXMuX2hlYXBJZHguZ2V0KGlkKTtcbiAgICAgIHRoaXMuX2hlYXBbaWR4XS52YWx1ZSA9IHZhbHVlO1xuXG4gICAgICAvLyBGaXggdGhlIG5ldyB2YWx1ZSdzIHBvc2l0aW9uXG4gICAgICAvLyBFaXRoZXIgYnViYmxlIG5ldyB2YWx1ZSB1cCBpZiBpdCBpcyBncmVhdGVyIHRoYW4gaXRzIHBhcmVudFxuICAgICAgdGhpcy5fdXBIZWFwKGlkeCk7XG4gICAgICAvLyBvciBidWJibGUgaXQgZG93biBpZiBpdCBpcyBzbWFsbGVyIHRoYW4gb25lIG9mIGl0cyBjaGlsZHJlblxuICAgICAgdGhpcy5fZG93bkhlYXAoaWR4KTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5faGVhcElkeC5zZXQoaWQsIHRoaXMuX2hlYXAubGVuZ3RoKTtcbiAgICAgIHRoaXMuX2hlYXAucHVzaCh7IGlkLCB2YWx1ZSB9KTtcbiAgICAgIHRoaXMuX3VwSGVhcCh0aGlzLl9oZWFwLmxlbmd0aCAtIDEpO1xuICAgIH1cbiAgfVxuXG4gIHJlbW92ZShpZCkge1xuICAgIGlmICh0aGlzLmhhcyhpZCkpIHtcbiAgICAgIGNvbnN0IGxhc3QgPSB0aGlzLl9oZWFwLmxlbmd0aCAtIDE7XG4gICAgICBjb25zdCBpZHggPSB0aGlzLl9oZWFwSWR4LmdldChpZCk7XG5cbiAgICAgIGlmIChpZHggIT09IGxhc3QpIHtcbiAgICAgICAgdGhpcy5fc3dhcChpZHgsIGxhc3QpO1xuICAgICAgICB0aGlzLl9oZWFwLnBvcCgpO1xuICAgICAgICB0aGlzLl9oZWFwSWR4LnJlbW92ZShpZCk7XG5cbiAgICAgICAgLy8gRml4IHRoZSBzd2FwcGVkIHZhbHVlJ3MgcG9zaXRpb25cbiAgICAgICAgdGhpcy5fdXBIZWFwKGlkeCk7XG4gICAgICAgIHRoaXMuX2Rvd25IZWFwKGlkeCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLl9oZWFwLnBvcCgpO1xuICAgICAgICB0aGlzLl9oZWFwSWR4LnJlbW92ZShpZCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaGFzKGlkKSB7XG4gICAgcmV0dXJuIHRoaXMuX2hlYXBJZHguaGFzKGlkKTtcbiAgfVxuXG4gIGVtcHR5KCkge1xuICAgIHJldHVybiAhdGhpcy5zaXplKCk7XG4gIH1cblxuICBjbGVhcigpIHtcbiAgICB0aGlzLl9oZWFwID0gW107XG4gICAgdGhpcy5faGVhcElkeC5jbGVhcigpO1xuICB9XG5cbiAgLy8gaXRlcmF0ZSBvdmVyIHZhbHVlcyBpbiBubyBwYXJ0aWN1bGFyIG9yZGVyXG4gIGZvckVhY2goaXRlcmF0b3IpIHtcbiAgICB0aGlzLl9oZWFwLmZvckVhY2gob2JqID0+IGl0ZXJhdG9yKG9iai52YWx1ZSwgb2JqLmlkKSk7XG4gIH1cblxuICBzaXplKCkge1xuICAgIHJldHVybiB0aGlzLl9oZWFwLmxlbmd0aDtcbiAgfVxuXG4gIHNldERlZmF1bHQoaWQsIGRlZikge1xuICAgIGlmICh0aGlzLmhhcyhpZCkpIHtcbiAgICAgIHJldHVybiB0aGlzLmdldChpZCk7XG4gICAgfVxuXG4gICAgdGhpcy5zZXQoaWQsIGRlZik7XG4gICAgcmV0dXJuIGRlZjtcbiAgfVxuXG4gIGNsb25lKCkge1xuICAgIGNvbnN0IGNsb25lID0gbmV3IE1heEhlYXAodGhpcy5fY29tcGFyYXRvciwgdGhpcy5faGVhcCk7XG4gICAgcmV0dXJuIGNsb25lO1xuICB9XG5cbiAgbWF4RWxlbWVudElkKCkge1xuICAgIHJldHVybiB0aGlzLnNpemUoKSA/IHRoaXMuX2hlYXBbMF0uaWQgOiBudWxsO1xuICB9XG5cbiAgX3NlbGZDaGVjaygpIHtcbiAgICBmb3IgKGxldCBpID0gMTsgaSA8IHRoaXMuX2hlYXAubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmICh0aGlzLl9tYXhJbmRleChwYXJlbnRJZHgoaSksIGkpICE9PSBwYXJlbnRJZHgoaSkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEFuIGl0ZW0gd2l0aCBpZCAke3RoaXMuX2hlYXBbaV0uaWR9YCArXG4gICAgICAgICAgICAgICAgICAgICAgICAgIFwiIGhhcyBhIHBhcmVudCB5b3VuZ2VyIHRoYW4gaXQ6IFwiICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5faGVhcFtwYXJlbnRJZHgoaSldLmlkKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuY29uc3QgbGVmdENoaWxkSWR4ID0gaSA9PiBpICogMiArIDE7XG5jb25zdCByaWdodENoaWxkSWR4ID0gaSA9PiBpICogMiArIDI7XG5jb25zdCBwYXJlbnRJZHggPSBpID0+IChpIC0gMSkgPj4gMTtcbiIsImltcG9ydCB7IE1heEhlYXAgfSBmcm9tICcuL21heC1oZWFwLmpzJztcblxuZXhwb3J0IGNsYXNzIE1pbkhlYXAgZXh0ZW5kcyBNYXhIZWFwIHtcbiAgY29uc3RydWN0b3IoY29tcGFyYXRvciwgb3B0aW9ucykge1xuICAgIHN1cGVyKChhLCBiKSA9PiAtY29tcGFyYXRvcihhLCBiKSwgb3B0aW9ucyk7XG4gIH1cblxuICBtYXhFbGVtZW50SWQoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGNhbGwgbWF4RWxlbWVudElkIG9uIE1pbkhlYXBcIik7XG4gIH1cblxuICBtaW5FbGVtZW50SWQoKSB7XG4gICAgcmV0dXJuIHN1cGVyLm1heEVsZW1lbnRJZCgpO1xuICB9XG59O1xuIiwiaW1wb3J0IHsgTWF4SGVhcCB9IGZyb20gJy4vbWF4LWhlYXAuanMnO1xuaW1wb3J0IHsgTWluSGVhcCB9IGZyb20gJy4vbWluLWhlYXAuanMnO1xuXG4vLyBUaGlzIGltcGxlbWVudGF0aW9uIG9mIE1pbi9NYXgtSGVhcCBpcyBqdXN0IGEgc3ViY2xhc3Mgb2YgTWF4LUhlYXBcbi8vIHdpdGggYSBNaW4tSGVhcCBhcyBhbiBlbmNhcHN1bGF0ZWQgcHJvcGVydHkuXG4vL1xuLy8gTW9zdCBvZiB0aGUgb3BlcmF0aW9ucyBhcmUganVzdCBwcm94eSBtZXRob2RzIHRvIGNhbGwgdGhlIHNhbWUgbWV0aG9kIG9uIGJvdGhcbi8vIGhlYXBzLlxuLy9cbi8vIFRoaXMgaW1wbGVtZW50YXRpb24gdGFrZXMgMipOIG1lbW9yeSBidXQgaXMgZmFpcmx5IHNpbXBsZSB0byB3cml0ZSBhbmRcbi8vIHVuZGVyc3RhbmQuIEFuZCB0aGUgY29uc3RhbnQgZmFjdG9yIG9mIGEgc2ltcGxlIEhlYXAgaXMgdXN1YWxseSBzbWFsbGVyXG4vLyBjb21wYXJlZCB0byBvdGhlciB0d28td2F5IHByaW9yaXR5IHF1ZXVlcyBsaWtlIE1pbi9NYXggSGVhcHNcbi8vIChodHRwOi8vd3d3LmNzLm90YWdvLmFjLm56L3N0YWZmcHJpdi9taWtlL1BhcGVycy9NaW5NYXhIZWFwcy9NaW5NYXhIZWFwcy5wZGYpXG4vLyBhbmQgSW50ZXJ2YWwgSGVhcHNcbi8vIChodHRwOi8vd3d3LmNpc2UudWZsLmVkdS9+c2FobmkvZHNhYWMvZW5yaWNoL2MxMy9kb3VibGUuaHRtKVxuZXhwb3J0IGNsYXNzIE1pbk1heEhlYXAgZXh0ZW5kcyBNYXhIZWFwIHtcbiAgY29uc3RydWN0b3IoY29tcGFyYXRvciwgb3B0aW9ucykge1xuICAgIHN1cGVyKGNvbXBhcmF0b3IsIG9wdGlvbnMpO1xuICAgIHRoaXMuX21pbkhlYXAgPSBuZXcgTWluSGVhcChjb21wYXJhdG9yLCBvcHRpb25zKTtcbiAgfVxuXG4gIHNldCguLi5hcmdzKSB7XG4gICAgc3VwZXIuc2V0KC4uLmFyZ3MpO1xuICAgIHRoaXMuX21pbkhlYXAuc2V0KC4uLmFyZ3MpO1xuICB9XG5cbiAgcmVtb3ZlKC4uLmFyZ3MpIHtcbiAgICBzdXBlci5yZW1vdmUoLi4uYXJncyk7XG4gICAgdGhpcy5fbWluSGVhcC5yZW1vdmUoLi4uYXJncyk7XG4gIH1cblxuICBjbGVhciguLi5hcmdzKSB7XG4gICAgc3VwZXIuY2xlYXIoLi4uYXJncyk7XG4gICAgdGhpcy5fbWluSGVhcC5jbGVhciguLi5hcmdzKTtcbiAgfVxuXG4gIHNldERlZmF1bHQoLi4uYXJncykge1xuICAgIHN1cGVyLnNldERlZmF1bHQoLi4uYXJncyk7XG4gICAgcmV0dXJuIHRoaXMuX21pbkhlYXAuc2V0RGVmYXVsdCguLi5hcmdzKTtcbiAgfVxuXG4gIGNsb25lKCkge1xuICAgIGNvbnN0IGNsb25lID0gbmV3IE1pbk1heEhlYXAodGhpcy5fY29tcGFyYXRvciwgdGhpcy5faGVhcCk7XG4gICAgcmV0dXJuIGNsb25lO1xuICB9XG5cbiAgbWluRWxlbWVudElkKCkge1xuICAgIHJldHVybiB0aGlzLl9taW5IZWFwLm1pbkVsZW1lbnRJZCgpO1xuICB9XG5cbn07XG4iXX0=
