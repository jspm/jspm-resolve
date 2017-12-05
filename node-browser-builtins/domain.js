'use strict';

var chunkExl4ijgd_js = require('./chunk-exl4ijgd.js');

exports.default = {};
var __dew__$1 = function () {
	__dew__$1 = null;

	exports.default = function () {
		// Import Events
		var events = chunkExl4ijgd_js.__dew__ && chunkExl4ijgd_js.__dew__() || chunkExl4ijgd_js.exports;

		// Export Domain
		var domain = {};
		domain.createDomain = domain.create = function () {
			var d = new events.EventEmitter();

			function emitError(e) {
				d.emit('error', e);
			}

			d.add = function (emitter) {
				emitter.on('error', emitError);
			};
			d.remove = function (emitter) {
				emitter.removeListener('error', emitError);
			};
			d.bind = function (fn) {
				return function () {
					var args = Array.prototype.slice.call(arguments);
					try {
						fn.apply(null, args);
					} catch (err) {
						emitError(err);
					}
				};
			};
			d.intercept = function (fn) {
				return function (err) {
					if (err) {
						emitError(err);
					} else {
						var args = Array.prototype.slice.call(arguments, 1);
						try {
							fn.apply(null, args);
						} catch (err) {
							emitError(err);
						}
					}
				};
			};
			d.run = function (fn) {
				try {
					fn();
				} catch (err) {
					emitError(err);
				}
				return this;
			};
			d.dispose = function () {
				this.removeAllListeners();
				return this;
			};
			d.enter = d.exit = function () {
				return this;
			};
			return d;
		};
		return domain;
	}.call(exports.default);
};

if (__dew__$1) __dew__$1();

module.exports = exports.default;
