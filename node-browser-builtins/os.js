'use strict';

var exports$1 = {};
var __dew__ = function () {
    __dew__ = null;
    exports$1.endianness = function () {
        return 'LE';
    };

    exports$1.hostname = function () {
        if (typeof location !== 'undefined') {
            return location.hostname;
        } else return '';
    };

    exports$1.loadavg = function () {
        return [];
    };

    exports$1.uptime = function () {
        return 0;
    };

    exports$1.freemem = function () {
        return Number.MAX_VALUE;
    };

    exports$1.totalmem = function () {
        return Number.MAX_VALUE;
    };

    exports$1.cpus = function () {
        return [];
    };

    exports$1.type = function () {
        return 'Browser';
    };

    exports$1.release = function () {
        if (typeof navigator !== 'undefined') {
            return navigator.appVersion;
        }
        return '';
    };

    exports$1.networkInterfaces = exports$1.getNetworkInterfaces = function () {
        return {};
    };

    exports$1.arch = function () {
        return 'javascript';
    };

    exports$1.platform = function () {
        return 'browser';
    };

    exports$1.tmpdir = exports$1.tmpDir = function () {
        return '/tmp';
    };

    exports$1.EOL = '\n';

    exports$1.homedir = function () {
        return '/';
    };
};

if (__dew__) __dew__();

module.exports = exports$1;
