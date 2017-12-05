'use strict';

var chunkAf9ip80o_js = require('./chunk-af9ip80o.js');
var chunk14fi6g7v_js = require('./chunk-14fi6g7v.js');

var exports$3 = {};
var __dew__$2 = function () {
  __dew__$2 = null;
  var http = chunkAf9ip80o_js.__dew__ && chunkAf9ip80o_js.__dew__() || chunkAf9ip80o_js.exports;
  var url = chunk14fi6g7v_js.__dew__ && chunk14fi6g7v_js.__dew__() || chunk14fi6g7v_js.exports;

  var https = exports$3;

  for (var key in http) {
    if (http.hasOwnProperty(key)) https[key] = http[key];
  }

  https.request = function (params, cb) {
    params = validateParams(params);
    return http.request.call(this, params, cb);
  };

  https.get = function (params, cb) {
    params = validateParams(params);
    return http.get.call(this, params, cb);
  };

  function validateParams(params) {
    if (typeof params === 'string') {
      params = url.parse(params);
    }
    if (!params.protocol) {
      params.protocol = 'https:';
    }
    if (params.protocol !== 'https:') {
      throw new Error('Protocol "' + params.protocol + '" not supported. Expected "https:"');
    }
    return params;
  }
};

if (__dew__$2) __dew__$2();

module.exports = exports$3;
