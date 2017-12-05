'use strict';

var chunk6e3i6sze_js = require('./chunk-6e3i6sze.js');

var exports$2 = {};
var __dew__$1 = function () {
    __dew__$1 = null;
    exports$2 = now;

    function now() {
        return new Date().getTime();
    }
};

exports.default = {};

var _global = typeof self !== "undefined" ? self : global;

var __dew__$2 = function () {
    __dew__$2 = null;
    /*global window, global*/
    var util = chunk6e3i6sze_js.__dew__ && chunk6e3i6sze_js.__dew__() || chunk6e3i6sze_js.exports;
    var assert = chunk6e3i6sze_js.__dew__1 && chunk6e3i6sze_js.__dew__1() || chunk6e3i6sze_js.exports1;
    var now = __dew__$1 && __dew__$1() || exports$2;

    var slice = Array.prototype.slice;
    var console;
    var times = {};

    if (typeof _global !== "undefined" && _global.console) {
        console = _global.console;
    } else if (typeof window !== "undefined" && window.console) {
        console = window.console;
    } else {
        console = {};
    }

    var functions = [[log, "log"], [info, "info"], [warn, "warn"], [error, "error"], [time, "time"], [timeEnd, "timeEnd"], [trace, "trace"], [dir, "dir"], [consoleAssert, "assert"]];

    for (var i = 0; i < functions.length; i++) {
        var tuple = functions[i];
        var f = tuple[0];
        var name = tuple[1];

        if (!console[name]) {
            console[name] = f;
        }
    }

    exports.default = console;

    function log() {}

    function info() {
        console.log.apply(console, arguments);
    }

    function warn() {
        console.log.apply(console, arguments);
    }

    function error() {
        console.warn.apply(console, arguments);
    }

    function time(label) {
        times[label] = now();
    }

    function timeEnd(label) {
        var time = times[label];
        if (!time) {
            throw new Error("No such label: " + label);
        }

        var duration = now() - time;
        console.log(label + ": " + duration + "ms");
    }

    function trace() {
        var err = new Error();
        err.name = "Trace";
        err.message = util.format.apply(null, arguments);
        console.error(err.stack);
    }

    function dir(object) {
        console.log(util.inspect(object) + "\n");
    }

    function consoleAssert(expression) {
        if (!expression) {
            var arr = slice.call(arguments, 1);
            assert.ok(false, util.format.apply(null, arr));
        }
    }
};

if (__dew__$2) __dew__$2();

module.exports = exports.default;
