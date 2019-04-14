/*
 *   Copyright 2017-2019 Guy Bedford (http://guybedford.com)
 *
 *   Licensed under the Apache License, Version 2.0 (the "License");
 *   you may not use this file except in compliance with the License.
 *   You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 *   Unless required by applicable law or agreed to in writing, software
 *   distributed under the License is distributed on an "AS IS" BASIS,
 *   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *   See the License for the specific language governing permissions and
 *   limitations under the License.
 */

import module from 'module';
import jspmResolve from './resolve.js';
import process from 'process';

const shortFormat = parseInt(process.versions.node.split('.')[0]) < 12;

const filePrefix = 'file://' + (process.platform === 'win32' ? '/' : '');

const cache = {};

module._resolveFilename = (request, parent) => jspmResolve.cjsResolve(request, { ...parent, cache });

export async function resolve (name, parentUrl) {
  if (name[name.length - 1] === '/')
    name = name.substr(0, name.length - 1);
  let { resolved, format } = await jspmResolve(name, parentUrl ? decodeURIComponent(parentUrl).substr(filePrefix.length) : undefined, { cache });
  if (format === 'unknown')
    throw new Error(`Unable to load ${resolved}, as it does not have a valid module format file extension.`);
  
  if (format === 'builtin') {
    if (resolved === '@empty')
      return { url: 'jspm:@empty', format: 'dynamic' };
    if (resolved === '@empty.dew')
      return { url: 'jspm:@empty.dew', format: 'dynamic' };
  }

  const url = format === 'builtin' ? resolved : filePrefix + encodeURI(resolved).replace(/#/g, encodeURIComponent);

  if (shortFormat) {
    if (format === 'module')
      format = 'esm';
    else if (format === 'commonjs')
      format = 'cjs';
  }

  return { url, format };
}

export async function dynamicInstantiate(url) {
  const emptyReturn = Object.freeze(Object.create(null));
  if (url === 'jspm:@empty')
    return {
      exports: ['default'],
      execute: exports => exports.default.set(emptyReturn)
    };
  if (url === 'jspm:@empty.dew')
    return {
      exports: ['dew'],
      execute: exports => exports.dew.set(function () { return emptyReturn; })
    };
}
