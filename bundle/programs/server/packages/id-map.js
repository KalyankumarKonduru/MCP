Package["core-runtime"].queue("id-map",function () {/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var EmitterPromise = Package.meteor.EmitterPromise;
var ECMAScript = Package.ecmascript.ECMAScript;
var EJSON = Package.ejson.EJSON;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var IdMap;

var require = meteorInstall({"node_modules":{"meteor":{"id-map":{"id-map.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////
//                                                                               //
// packages/id-map/id-map.js                                                     //
//                                                                               //
///////////////////////////////////////////////////////////////////////////////////
                                                                                 //
module.export({
  IdMap: () => IdMap
});
class IdMap {
  constructor(idStringify, idParse) {
    this._map = new Map();
    this._idStringify = idStringify || JSON.stringify;
    this._idParse = idParse || JSON.parse;
  }

  // Some of these methods are designed to match methods on OrderedDict, since
  // (eg) ObserveMultiplex and _CachingChangeObserver use them interchangeably.
  // (Conceivably, this should be replaced with "UnorderedDict" with a specific
  // set of methods that overlap between the two.)

  get(id) {
    const key = this._idStringify(id);
    return this._map.get(key);
  }
  set(id, value) {
    const key = this._idStringify(id);
    this._map.set(key, value);
  }
  remove(id) {
    const key = this._idStringify(id);
    this._map.delete(key);
  }
  has(id) {
    const key = this._idStringify(id);
    return this._map.has(key);
  }
  empty() {
    return this._map.size === 0;
  }
  clear() {
    this._map.clear();
  }

  // Iterates over the items in the map. Return `false` to break the loop.
  forEach(iterator) {
    // don't use _.each, because we can't break out of it.
    for (let [key, value] of this._map) {
      const breakIfFalse = iterator.call(null, value, this._idParse(key));
      if (breakIfFalse === false) {
        return;
      }
    }
  }
  async forEachAsync(iterator) {
    for (let [key, value] of this._map) {
      const breakIfFalse = await iterator.call(null, value, this._idParse(key));
      if (breakIfFalse === false) {
        return;
      }
    }
  }
  size() {
    return this._map.size;
  }
  setDefault(id, def) {
    const key = this._idStringify(id);
    if (this._map.has(key)) {
      return this._map.get(key);
    }
    this._map.set(key, def);
    return def;
  }

  // Assumes that values are EJSON-cloneable, and that we don't need to clone
  // IDs (ie, that nobody is going to mutate an ObjectId).
  clone() {
    const clone = new IdMap(this._idStringify, this._idParse);
    // copy directly to avoid stringify/parse overhead
    this._map.forEach(function (value, key) {
      clone._map.set(key, EJSON.clone(value));
    });
    return clone;
  }
}
///////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});


/* Exports */
return {
  export: function () { return {
      IdMap: IdMap
    };},
  require: require,
  eagerModulePaths: [
    "/node_modules/meteor/id-map/id-map.js"
  ],
  mainModulePath: "/node_modules/meteor/id-map/id-map.js"
}});

//# sourceURL=meteor://💻app/packages/id-map.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvaWQtbWFwL2lkLW1hcC5qcyJdLCJuYW1lcyI6WyJtb2R1bGUiLCJleHBvcnQiLCJJZE1hcCIsImNvbnN0cnVjdG9yIiwiaWRTdHJpbmdpZnkiLCJpZFBhcnNlIiwiX21hcCIsIk1hcCIsIl9pZFN0cmluZ2lmeSIsIkpTT04iLCJzdHJpbmdpZnkiLCJfaWRQYXJzZSIsInBhcnNlIiwiZ2V0IiwiaWQiLCJrZXkiLCJzZXQiLCJ2YWx1ZSIsInJlbW92ZSIsImRlbGV0ZSIsImhhcyIsImVtcHR5Iiwic2l6ZSIsImNsZWFyIiwiZm9yRWFjaCIsIml0ZXJhdG9yIiwiYnJlYWtJZkZhbHNlIiwiY2FsbCIsImZvckVhY2hBc3luYyIsInNldERlZmF1bHQiLCJkZWYiLCJjbG9uZSIsIkVKU09OIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQUEsTUFBTSxDQUFDQyxNQUFNLENBQUM7RUFBQ0MsS0FBSyxFQUFDQSxDQUFBLEtBQUlBO0FBQUssQ0FBQyxDQUFDO0FBQ3pCLE1BQU1BLEtBQUssQ0FBQztFQUNqQkMsV0FBV0EsQ0FBQ0MsV0FBVyxFQUFFQyxPQUFPLEVBQUU7SUFDaEMsSUFBSSxDQUFDQyxJQUFJLEdBQUcsSUFBSUMsR0FBRyxDQUFDLENBQUM7SUFDckIsSUFBSSxDQUFDQyxZQUFZLEdBQUdKLFdBQVcsSUFBSUssSUFBSSxDQUFDQyxTQUFTO0lBQ2pELElBQUksQ0FBQ0MsUUFBUSxHQUFHTixPQUFPLElBQUlJLElBQUksQ0FBQ0csS0FBSztFQUN2Qzs7RUFFRjtFQUNBO0VBQ0E7RUFDQTs7RUFFRUMsR0FBR0EsQ0FBQ0MsRUFBRSxFQUFFO0lBQ04sTUFBTUMsR0FBRyxHQUFHLElBQUksQ0FBQ1AsWUFBWSxDQUFDTSxFQUFFLENBQUM7SUFDakMsT0FBTyxJQUFJLENBQUNSLElBQUksQ0FBQ08sR0FBRyxDQUFDRSxHQUFHLENBQUM7RUFDM0I7RUFFQUMsR0FBR0EsQ0FBQ0YsRUFBRSxFQUFFRyxLQUFLLEVBQUU7SUFDYixNQUFNRixHQUFHLEdBQUcsSUFBSSxDQUFDUCxZQUFZLENBQUNNLEVBQUUsQ0FBQztJQUNqQyxJQUFJLENBQUNSLElBQUksQ0FBQ1UsR0FBRyxDQUFDRCxHQUFHLEVBQUVFLEtBQUssQ0FBQztFQUMzQjtFQUVBQyxNQUFNQSxDQUFDSixFQUFFLEVBQUU7SUFDVCxNQUFNQyxHQUFHLEdBQUcsSUFBSSxDQUFDUCxZQUFZLENBQUNNLEVBQUUsQ0FBQztJQUNqQyxJQUFJLENBQUNSLElBQUksQ0FBQ2EsTUFBTSxDQUFDSixHQUFHLENBQUM7RUFDdkI7RUFFQUssR0FBR0EsQ0FBQ04sRUFBRSxFQUFFO0lBQ04sTUFBTUMsR0FBRyxHQUFHLElBQUksQ0FBQ1AsWUFBWSxDQUFDTSxFQUFFLENBQUM7SUFDakMsT0FBTyxJQUFJLENBQUNSLElBQUksQ0FBQ2MsR0FBRyxDQUFDTCxHQUFHLENBQUM7RUFDM0I7RUFFQU0sS0FBS0EsQ0FBQSxFQUFHO0lBQ04sT0FBTyxJQUFJLENBQUNmLElBQUksQ0FBQ2dCLElBQUksS0FBSyxDQUFDO0VBQzdCO0VBRUFDLEtBQUtBLENBQUEsRUFBRztJQUNOLElBQUksQ0FBQ2pCLElBQUksQ0FBQ2lCLEtBQUssQ0FBQyxDQUFDO0VBQ25COztFQUVBO0VBQ0FDLE9BQU9BLENBQUNDLFFBQVEsRUFBRTtJQUNoQjtJQUNBLEtBQUssSUFBSSxDQUFDVixHQUFHLEVBQUVFLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQ1gsSUFBSSxFQUFDO01BQ2pDLE1BQU1vQixZQUFZLEdBQUdELFFBQVEsQ0FBQ0UsSUFBSSxDQUNoQyxJQUFJLEVBQ0pWLEtBQUssRUFDTCxJQUFJLENBQUNOLFFBQVEsQ0FBQ0ksR0FBRyxDQUNuQixDQUFDO01BQ0QsSUFBSVcsWUFBWSxLQUFLLEtBQUssRUFBRTtRQUMxQjtNQUNGO0lBQ0Y7RUFDRjtFQUVBLE1BQU1FLFlBQVlBLENBQUNILFFBQVEsRUFBRTtJQUMzQixLQUFLLElBQUksQ0FBQ1YsR0FBRyxFQUFFRSxLQUFLLENBQUMsSUFBSSxJQUFJLENBQUNYLElBQUksRUFBQztNQUNqQyxNQUFNb0IsWUFBWSxHQUFHLE1BQU1ELFFBQVEsQ0FBQ0UsSUFBSSxDQUNwQyxJQUFJLEVBQ0pWLEtBQUssRUFDTCxJQUFJLENBQUNOLFFBQVEsQ0FBQ0ksR0FBRyxDQUNyQixDQUFDO01BQ0QsSUFBSVcsWUFBWSxLQUFLLEtBQUssRUFBRTtRQUMxQjtNQUNGO0lBQ0Y7RUFDRjtFQUVBSixJQUFJQSxDQUFBLEVBQUc7SUFDTCxPQUFPLElBQUksQ0FBQ2hCLElBQUksQ0FBQ2dCLElBQUk7RUFDdkI7RUFFQU8sVUFBVUEsQ0FBQ2YsRUFBRSxFQUFFZ0IsR0FBRyxFQUFFO0lBQ2xCLE1BQU1mLEdBQUcsR0FBRyxJQUFJLENBQUNQLFlBQVksQ0FBQ00sRUFBRSxDQUFDO0lBQ2pDLElBQUksSUFBSSxDQUFDUixJQUFJLENBQUNjLEdBQUcsQ0FBQ0wsR0FBRyxDQUFDLEVBQUU7TUFDdEIsT0FBTyxJQUFJLENBQUNULElBQUksQ0FBQ08sR0FBRyxDQUFDRSxHQUFHLENBQUM7SUFDM0I7SUFDQSxJQUFJLENBQUNULElBQUksQ0FBQ1UsR0FBRyxDQUFDRCxHQUFHLEVBQUVlLEdBQUcsQ0FBQztJQUN2QixPQUFPQSxHQUFHO0VBQ1o7O0VBRUE7RUFDQTtFQUNBQyxLQUFLQSxDQUFBLEVBQUc7SUFDTixNQUFNQSxLQUFLLEdBQUcsSUFBSTdCLEtBQUssQ0FBQyxJQUFJLENBQUNNLFlBQVksRUFBRSxJQUFJLENBQUNHLFFBQVEsQ0FBQztJQUN6RDtJQUNBLElBQUksQ0FBQ0wsSUFBSSxDQUFDa0IsT0FBTyxDQUFDLFVBQVNQLEtBQUssRUFBRUYsR0FBRyxFQUFDO01BQ3BDZ0IsS0FBSyxDQUFDekIsSUFBSSxDQUFDVSxHQUFHLENBQUNELEdBQUcsRUFBRWlCLEtBQUssQ0FBQ0QsS0FBSyxDQUFDZCxLQUFLLENBQUMsQ0FBQztJQUN6QyxDQUFDLENBQUM7SUFDRixPQUFPYyxLQUFLO0VBQ2Q7QUFDRixDIiwiZmlsZSI6Ii9wYWNrYWdlcy9pZC1tYXAuanMiLCJzb3VyY2VzQ29udGVudCI6WyJcbmV4cG9ydCBjbGFzcyBJZE1hcCB7XG4gIGNvbnN0cnVjdG9yKGlkU3RyaW5naWZ5LCBpZFBhcnNlKSB7XG4gICAgdGhpcy5fbWFwID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuX2lkU3RyaW5naWZ5ID0gaWRTdHJpbmdpZnkgfHwgSlNPTi5zdHJpbmdpZnk7XG4gICAgdGhpcy5faWRQYXJzZSA9IGlkUGFyc2UgfHwgSlNPTi5wYXJzZTtcbiAgfVxuXG4vLyBTb21lIG9mIHRoZXNlIG1ldGhvZHMgYXJlIGRlc2lnbmVkIHRvIG1hdGNoIG1ldGhvZHMgb24gT3JkZXJlZERpY3QsIHNpbmNlXG4vLyAoZWcpIE9ic2VydmVNdWx0aXBsZXggYW5kIF9DYWNoaW5nQ2hhbmdlT2JzZXJ2ZXIgdXNlIHRoZW0gaW50ZXJjaGFuZ2VhYmx5LlxuLy8gKENvbmNlaXZhYmx5LCB0aGlzIHNob3VsZCBiZSByZXBsYWNlZCB3aXRoIFwiVW5vcmRlcmVkRGljdFwiIHdpdGggYSBzcGVjaWZpY1xuLy8gc2V0IG9mIG1ldGhvZHMgdGhhdCBvdmVybGFwIGJldHdlZW4gdGhlIHR3by4pXG5cbiAgZ2V0KGlkKSB7XG4gICAgY29uc3Qga2V5ID0gdGhpcy5faWRTdHJpbmdpZnkoaWQpO1xuICAgIHJldHVybiB0aGlzLl9tYXAuZ2V0KGtleSk7XG4gIH1cblxuICBzZXQoaWQsIHZhbHVlKSB7XG4gICAgY29uc3Qga2V5ID0gdGhpcy5faWRTdHJpbmdpZnkoaWQpO1xuICAgIHRoaXMuX21hcC5zZXQoa2V5LCB2YWx1ZSk7XG4gIH1cblxuICByZW1vdmUoaWQpIHtcbiAgICBjb25zdCBrZXkgPSB0aGlzLl9pZFN0cmluZ2lmeShpZCk7XG4gICAgdGhpcy5fbWFwLmRlbGV0ZShrZXkpO1xuICB9XG5cbiAgaGFzKGlkKSB7XG4gICAgY29uc3Qga2V5ID0gdGhpcy5faWRTdHJpbmdpZnkoaWQpO1xuICAgIHJldHVybiB0aGlzLl9tYXAuaGFzKGtleSk7XG4gIH1cblxuICBlbXB0eSgpIHtcbiAgICByZXR1cm4gdGhpcy5fbWFwLnNpemUgPT09IDA7XG4gIH1cblxuICBjbGVhcigpIHtcbiAgICB0aGlzLl9tYXAuY2xlYXIoKTtcbiAgfVxuXG4gIC8vIEl0ZXJhdGVzIG92ZXIgdGhlIGl0ZW1zIGluIHRoZSBtYXAuIFJldHVybiBgZmFsc2VgIHRvIGJyZWFrIHRoZSBsb29wLlxuICBmb3JFYWNoKGl0ZXJhdG9yKSB7XG4gICAgLy8gZG9uJ3QgdXNlIF8uZWFjaCwgYmVjYXVzZSB3ZSBjYW4ndCBicmVhayBvdXQgb2YgaXQuXG4gICAgZm9yIChsZXQgW2tleSwgdmFsdWVdIG9mIHRoaXMuX21hcCl7XG4gICAgICBjb25zdCBicmVha0lmRmFsc2UgPSBpdGVyYXRvci5jYWxsKFxuICAgICAgICBudWxsLFxuICAgICAgICB2YWx1ZSxcbiAgICAgICAgdGhpcy5faWRQYXJzZShrZXkpXG4gICAgICApO1xuICAgICAgaWYgKGJyZWFrSWZGYWxzZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGZvckVhY2hBc3luYyhpdGVyYXRvcikge1xuICAgIGZvciAobGV0IFtrZXksIHZhbHVlXSBvZiB0aGlzLl9tYXApe1xuICAgICAgY29uc3QgYnJlYWtJZkZhbHNlID0gYXdhaXQgaXRlcmF0b3IuY2FsbChcbiAgICAgICAgICBudWxsLFxuICAgICAgICAgIHZhbHVlLFxuICAgICAgICAgIHRoaXMuX2lkUGFyc2Uoa2V5KVxuICAgICAgKTtcbiAgICAgIGlmIChicmVha0lmRmFsc2UgPT09IGZhbHNlKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBzaXplKCkge1xuICAgIHJldHVybiB0aGlzLl9tYXAuc2l6ZTtcbiAgfVxuXG4gIHNldERlZmF1bHQoaWQsIGRlZikge1xuICAgIGNvbnN0IGtleSA9IHRoaXMuX2lkU3RyaW5naWZ5KGlkKTtcbiAgICBpZiAodGhpcy5fbWFwLmhhcyhrZXkpKSB7XG4gICAgICByZXR1cm4gdGhpcy5fbWFwLmdldChrZXkpO1xuICAgIH1cbiAgICB0aGlzLl9tYXAuc2V0KGtleSwgZGVmKTtcbiAgICByZXR1cm4gZGVmO1xuICB9XG5cbiAgLy8gQXNzdW1lcyB0aGF0IHZhbHVlcyBhcmUgRUpTT04tY2xvbmVhYmxlLCBhbmQgdGhhdCB3ZSBkb24ndCBuZWVkIHRvIGNsb25lXG4gIC8vIElEcyAoaWUsIHRoYXQgbm9ib2R5IGlzIGdvaW5nIHRvIG11dGF0ZSBhbiBPYmplY3RJZCkuXG4gIGNsb25lKCkge1xuICAgIGNvbnN0IGNsb25lID0gbmV3IElkTWFwKHRoaXMuX2lkU3RyaW5naWZ5LCB0aGlzLl9pZFBhcnNlKTtcbiAgICAvLyBjb3B5IGRpcmVjdGx5IHRvIGF2b2lkIHN0cmluZ2lmeS9wYXJzZSBvdmVyaGVhZFxuICAgIHRoaXMuX21hcC5mb3JFYWNoKGZ1bmN0aW9uKHZhbHVlLCBrZXkpe1xuICAgICAgY2xvbmUuX21hcC5zZXQoa2V5LCBFSlNPTi5jbG9uZSh2YWx1ZSkpO1xuICAgIH0pO1xuICAgIHJldHVybiBjbG9uZTtcbiAgfVxufVxuIl19
