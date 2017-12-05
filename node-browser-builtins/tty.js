'use strict';

var exports$1 = {};
var __dew__ = function () {
  __dew__ = null;
  exports$1.isatty = function () {
    return false;
  };

  function ReadStream() {
    throw new Error('tty.ReadStream is not implemented');
  }
  exports$1.ReadStream = ReadStream;

  function WriteStream() {
    throw new Error('tty.ReadStream is not implemented');
  }
  exports$1.WriteStream = WriteStream;
};

if (__dew__) __dew__();

module.exports = exports$1;
