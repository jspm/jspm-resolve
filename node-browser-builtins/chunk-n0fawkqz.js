'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

exports.exports = {};
exports.__dew__ = function () {
  exports.__dew__ = null;
  if (typeof Object.create === 'function') {
    // implementation from standard node.js 'util' module
    exports.exports = function inherits(ctor, superCtor) {
      ctor.super_ = superCtor;
      ctor.prototype = Object.create(superCtor.prototype, {
        constructor: {
          value: ctor,
          enumerable: false,
          writable: true,
          configurable: true
        }
      });
    };
  } else {
    // old school shim for old browsers
    exports.exports = function inherits(ctor, superCtor) {
      ctor.super_ = superCtor;
      var TempCtor = function () {};
      TempCtor.prototype = superCtor.prototype;
      ctor.prototype = new TempCtor();
      ctor.prototype.constructor = ctor;
    };
  }
};
