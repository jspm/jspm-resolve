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

'use strict';

const { URL } = require('url');
const fs = require('fs');

const isWindows = process.platform === 'win32';
const winSepRegEx = /\\/g;
const encodedSepRegEx = /%(2E|2F|5C)/gi;

function throwModuleNotFound (name, parent) {
  const e = new Error(`Cannot find module ${name}${parent ? ` from ${parent}` : ''}`);
  e.code = 'MODULE_NOT_FOUND';
  throw e;
}

function throwURLName (name) {
  const e = new Error(`URL ${name} is not a valid file:/// URL to resolve.`);
  e.code = 'MODULE_NAME_URL_NOT_FILE';
  throw e;
}

function throwInvalidModuleName (msg) {
  const e = new Error(msg);
  e.code = 'INVALID_MODULE_NAME';
  throw e;
}

function throwInvalidConfig (msg) {
  const e = new Error(msg);
  e.code = 'INVALID_CONFIG';
  throw e;
}

const packageRegEx = /^((?:@[^/\\%]+\/)?[^./\\%][^/\\%]*|@)(\/.*)?$/;
function parsePackage (specifier) {
  let [, name, path = ''] = specifier.match(packageRegEx) || [];
  if (path.length)
    path = '.' + path;
  return { name, path };
}
function parsePkgPath (path, jspmProjectPath) {
  const jspmPackagesPath = jspmProjectPath + '/jspm_packages';
  if (!path.startsWith(jspmPackagesPath) || path[jspmPackagesPath.length] !=='/' && path.length !== jspmPackagesPath.length)
    return;
  const registrySep = path.indexOf('/', jspmPackagesPath.length + 1);
  if (registrySep === -1) return;
  const { name } = parsePackage(path.slice(registrySep + 1));
  if (!name) return;
  return path.substring(jspmPackagesPath.length + 1, registrySep) + ':' + name;
}
function packageToPath (pkgName, jspmProjectPath) {
  const registryIndex = pkgName.indexOf(':');
  if (registryIndex === -1) throwInvalidConfig(`Invald package resolution "${pkgName}" in jspm.json.`);
  return jspmProjectPath + '/jspm_packages/' + pkgName.slice(0, registryIndex) + '/' + pkgName.slice(registryIndex + 1);
}

function uriToPath (path) {
  if (path.match(encodedSepRegEx))
    throwInvalidModuleName(`${path} cannot be URI decoded as it contains an unsafe percent-encoding.`);
  if (path.indexOf('%') !== -1)
    path = decodeURIComponent(path);
  if (path.indexOf('\\') !== -1)
    path = path.replace(winSepRegEx, '/');
  return path;
}

function tryParseUrl (url) {
  try {
    return new URL(url);
  }
  catch (e) {}
}

function pathContains (path, containsPath) {
  return containsPath === path || path.startsWith(containsPath) && path[containsPath.length] === '/';
}

// path is an absolute file system path with . and .. segments to be resolved
// works only with /-separated paths
function resolvePath (path, parent) {
  if (path.indexOf('\\') !== -1)
    path = path.replace(winSepRegEx, '/');

  if (parent && (!isWindows || !hasWinDrivePrefix(path)) && path[0] !== '/') {
    if (!path.startsWith('./') && !path.startsWith('../'))
      path = './' + path;
    path = parent.slice(0, parent.lastIndexOf('/') + 1) + path;
  }

  // linked list of path segments
  const headSegment = {
    prev: undefined,
    next: undefined,
    segment: undefined
  };
  let curSegment = headSegment;
  let segmentIndex = 0;

  for (var i = 0; i < path.length; i++) {
    // busy reading a segment - only terminate on '/'
    if (segmentIndex !== -1) {
      if (path[i] === '/') {
        const nextSegment = { segment: path.substring(segmentIndex, i + 1), next: undefined, prev: curSegment };
        curSegment.next = nextSegment;
        curSegment = nextSegment;
        segmentIndex = -1;
      }
      continue;
    }

    // new segment - check if it is relative
    if (path[i] === '.') {
      // ../ segment
      if (path[i + 1] === '.' && path[i + 2] === '/') {
        curSegment = curSegment.prev || curSegment;
        curSegment.next = undefined;
        i += 2;
      }
      // ./ segment
      else if (path[i + 1] === '/') {
        i += 1;
      }
      else {
        // the start of a new segment as below
        segmentIndex = i;
        continue;
      }

      // trailing . or .. segment
      if (i === path.length) {
        let nextSegment = { segment: '', next: undefined, prev: curSegment };
        curSegment.next = nextSegment;
        curSegment = nextSegment;
      }
      continue;
    }

    // it is the start of a new segment
    segmentIndex = i;
  }
  // finish reading out the last segment
  if (segmentIndex !== -1) {
    if (path[segmentIndex] === '.') {
      if (path[segmentIndex + 1] === '.') {
        curSegment = curSegment.prev || curSegment;
        curSegment.next = undefined;
      }
      // not a . trailer
      else if (segmentIndex + 1 !== path.length) {
        const nextSegment = { segment: path.slice(segmentIndex), next: undefined, prev: curSegment };
        curSegment.next = nextSegment;
      }
    }
    else {
      const nextSegment = { segment: path.slice(segmentIndex), next: undefined, prev: curSegment };
      curSegment.next = nextSegment;
    }
  }

  curSegment = headSegment;
  let outStr = '';
  while (curSegment = curSegment.next)
    outStr += curSegment.segment;

  if (!path.endsWith('/') && outStr.endsWith('/'))
    outStr = outStr.slice(0, -1);
  return outStr;
}

function hasWinDrivePrefix (name) {
  if (name[1] !== ':')
    return false;
  const charCode = name.charCodeAt(0);
  return charCode > 64 && charCode < 90 || charCode > 96 && charCode < 123;
}

const seenCache = new WeakMap();
function initCache (cache) {
  if (cache.jspmConfigCache === undefined)
    cache.jspmConfigCache = Object.create(null);
  if (cache.pjsonConfigCache === undefined)
    cache.pjsonConfigCache = Object.create(null);
  if (cache.statCache === undefined)
    cache.statCache = Object.create(null);
  if (cache.symlinkCache === undefined)
    cache.symlinkCache = Object.create(null);
  Object.freeze(cache);
  seenCache.set(cache, true);
}

const defaultEnvModule = ['module', 'default'];
const defaultEnvCjs = ['default'];

const defaultBuiltins = new Set([
  '@empty',
  '@empty.dew',
  'assert',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'dns',
  'domain',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'module',
  'net',
  'os',
  'path',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'string_decoder',
  'sys',
  'timers',
  'tls',
  'tty',
  'url',
  'util',
  'vm',
  'worker_threads',
  'zlib'
]);

async function resolve (specifier, parentPath = process.cwd() + '/', {
  builtins = defaultBuiltins,
  cache = undefined,
  cjsResolve = false,
  env,
  fs = fsUtils,
  isMain = false
} = {}) {
  if (!env) env = cjsResolve ? defaultEnvModule : defaultEnvCjs;
  if (parentPath.indexOf('\\') !== -1)
    parentPath = parentPath.replace(winSepRegEx, '/');
  if (cache && seenCache.has(cache) === false)
    initCache(cache);

  const jspmProjectPath = await getJspmProjectPath.call(fs, parentPath, cache);

  const relativeResolved = relativeResolve.call(fs, specifier, parentPath);
  if (relativeResolved) {
    if (cjsResolve)
      return cjsFinalizeResolve.call(fs, cjsFileResolve.call(fs, relativeResolved, parentPath, cache), parentPath, jspmProjectPath, cache);
    return await finalizeResolve.call(fs, relativeResolved, parentPath, jspmProjectPath, isMain, cache);
  }
  
  const parentScope = await getPackageScope.call(fs, parentPath, cache);
  const parentConfig = parentScope && await readPkgConfig.call(fs, parentPath, cache);

  if (parentConfig && parentConfig.map) {
    const mapped = resolveMap(specifier, parentConfig.map, parentScope, parentPath, env, builtins);
    if (mapped) {
      if (!mapped.startsWith(parentScope + '/')) {
        specifier = mapped;
      }
      else {
        if (cjsResolve)
          return cjsFinalizeResolve.call(fs, cjsFileResolve.call(fs, mapped, parentPath, cache), parentPath, jspmProjectPath, cache);
        return await finalizeResolve.call(fs, mapped, parentPath, jspmProjectPath, isMain, cache);
      }
    }
  }

  if (jspmProjectPath)
    return await jspmProjectResolve.call(fs, specifier, parentPath, jspmProjectPath, cjsResolve, isMain, env, builtins, cache);
  else
    return nodeModulesResolve.call(fs, specifier, parentPath, cjsResolve, isMain, env, builtins, cache);
}

function resolveSync (specifier, parentPath = process.cwd() + '/', {
  builtins = defaultBuiltins,
  cache = undefined,
  cjsResolve = false,
  env,
  fs = fsUtils,
  isMain = false
} = {}) {
  if (!env) env = cjsResolve ? defaultEnvModule : defaultEnvCjs;
  if (parentPath.indexOf('\\') !== -1)
    parentPath = parentPath.replace(winSepRegEx, '/');
  if (cache && seenCache.has(cache) === false)
    initCache(cache);

  const jspmProjectPath = getJspmProjectPathSync.call(fs, parentPath, cache);

  const relativeResolved = relativeResolve.call(fs, specifier, parentPath);
  if (relativeResolved) {
    if (cjsResolve)
      return cjsFinalizeResolve.call(fs, cjsFileResolve.call(fs, relativeResolved, parentPath, cache), parentPath, jspmProjectPath, cache);
    return finalizeResolveSync.call(fs, relativeResolved, parentPath, jspmProjectPath, isMain, cache);
  }
  
  const parentScope = getPackageScopeSync.call(fs, parentPath, cache);
  const parentConfig = parentScope && readPkgConfigSync.call(fs, parentPath, cache);

  if (parentConfig && parentConfig.map) {
    const mapped = resolveMap(specifier, parentConfig.map, parentScope, parentPath, env, builtins);
    if (mapped) {
      if (!mapped.startsWith(parentScope + '/')) {
        specifier = mapped;
      }
      else {
        if (cjsResolve)
          return cjsFinalizeResolve.call(fs, cjsFileResolve.call(fs, mapped, parentPath, cache), parentPath, jspmProjectPath, cache);
        return finalizeResolveSync.call(fs, mapped, parentPath, jspmProjectPath, isMain, cache);
      }
    }
  }

  if (jspmProjectPath)
    return jspmProjectResolveSync.call(fs, specifier, parentPath, jspmProjectPath, cjsResolve, isMain, env, builtins, cache);
  else
    return nodeModulesResolve.call(fs, specifier, parentPath, cjsResolve, isMain, env, builtins, cache);
}

function relativeResolve (name, parentPath) {
  if (name[0] === '/') {
    name = uriToPath(name);
    if (name[1] === '/') {
      if (name[2] === '/')
        throwInvalidModuleName(`${name} is not a valid module name.`);
      else
        return resolvePath(name.slice(1 + isWindows));
    }
    else {
      let path = isWindows ? name.slice(1) : name;
      if (isWindows && !hasWinDrivePrefix(path))
        path = name;
      return resolvePath(path);
    }
  }
  // Relative path
  else if (name[0] === '.' && (name.length === 1 || (name[1] === '/' && (name = name.slice(2), true) || name[1] === '.' && (name.length === 2 || name[2] === '/')))) {
    return resolvePath(uriToPath(name), parentPath);
  }
  // URL
  else if (name.indexOf(':') !== -1) {
    if (isWindows && hasWinDrivePrefix(name)) {
      return uriToPath(name);
    }
    else {
      const url = tryParseUrl(name);
      if (url.protocol === 'file:')
        return uriToPath(isWindows ? url.pathname.slice(1) : url.pathname);
      else
        throwURLName(name);
    }
  }
}

async function jspmProjectResolve (specifier, parentPath, jspmProjectPath, cjsResolve, isMain, env, builtins, cache) {
  const jspmConfig = await readJspmConfig.call(this, jspmProjectPath, cache);
  const parentPkg = parsePkgPath(parentPath, jspmProjectPath);
  const { name, path } = parsePackage(specifier);
  if (!name)
    throwInvalidPackageName(specifier + ' is not a valid package name, imported from ' + parentPath);

  let pkgPath;
  if (name === '@') {
    if (parentPkg)
      pkgPath = packageToPath(parentPkg, jspmProjectPath);
    else if (!(pkgPath = await getPackageScope.call(this, parentPath, cache)))
      throwModuleNotFound(specifier, parentPath);
  }
  else {
    let pkgResolution;
    if (parentPkg) {
      const parentDeps = jspmConfig.dependencies[parentPkg];
      pkgResolution = parentDeps && parentDeps.resolve && parentDeps.resolve[name] || jspmConfig.resolvePeer[name];
    }
    else {
      pkgResolution = jspmConfig.resolve[name] || jspmConfig.resolvePeer[name];
    }
    if (!pkgResolution) {
      if (parentPkg && name === parentPkg.substring(parentPkg.indexOf(':') + 1, parentPkg.lastIndexOf('@')))
        pkgPath = packageToPath(parentPkg, jspmProjectPath);
      else if (builtins.has(name))
        return { resolved: name, format: 'builtin' };
      else
        throwModuleNotFound(specifier, parentPath);
    }
    pkgPath = packageToPath(pkgResolution, jspmProjectPath);
  }
  
  const pkgConfig = await readPkgConfig.call(this, pkgPath, cache);
  const resolved = resolvePackage.call(this, pkgPath, path, parentPath, pkgConfig, cjsResolve, env, builtins, cache);

  if (cjsResolve)
    return cjsFinalizeResolve.call(this, cjsFileResolve.call(this, resolved, parentPath, cache), parentPath, jspmProjectPath, cache);
  return await finalizeResolve.call(this, resolved, parentPath, jspmProjectPath, isMain, cache);
}

function jspmProjectResolveSync (specifier, parentPath, jspmProjectPath, cjsResolve, isMain, env, builtins, cache) {
  const jspmConfig = readJspmConfigSync.call(this, jspmProjectPath, cache);
  const parentPkg = parsePkgPath(parentPath, jspmProjectPath);
  const { name, path } = parsePackage(specifier);
  if (!name)
    throwInvalidPackageName(specifier + ' is not a valid package name, imported from ' + parentPath);

  let pkgPath;
  if (name === '@') {
    if (parentPkg)
      pkgPath = packageToPath(parentPkg, jspmProjectPath);
    else if (!(pkgPath = getPackageScopeSync.call(this, parentPath, cache)))
      throwModuleNotFound(specifier, parentPath);
  }
  else {
    let pkgResolution;
    if (parentPkg) {
      const parentDeps = jspmConfig.dependencies[parentPkg];
      pkgResolution = parentDeps && parentDeps.resolve && parentDeps.resolve[name] || jspmConfig.resolvePeer[name];
    }
    else {
      pkgResolution = jspmConfig.resolve[name] || jspmConfig.resolvePeer[name];
    }
    if (!pkgResolution) {
      if (parentPkg && name === parentPkg.substring(parentPkg.indexOf(':') + 1, parentPkg.lastIndexOf('@')))
        pkgPath = packageToPath(parentPkg, jspmProjectPath);
      else if (builtins.has(name))
        return { resolved: name, format: 'builtin' };
      else 
        throwModuleNotFound(specifier, parentPath);
    }
    pkgPath = packageToPath(pkgResolution, jspmProjectPath);
  }
  
  const pkgConfig = readPkgConfigSync.call(this, pkgPath, cache);
  const resolved = resolvePackage.call(this, pkgPath, path, parentPath, pkgConfig, cjsResolve, env, builtins, cache);

  if (cjsResolve)
    return cjsFinalizeResolve.call(this, cjsFileResolve.call(this, resolved, parentPath, cache), parentPath, jspmProjectPath, cache);
  return finalizeResolveSync.call(this, resolved, parentPath, jspmProjectPath, isMain, cache);
}

function nodeModulesResolve (name, parentPath, cjsResolve, isMain, env, builtins, cache) {
  if (builtins.has(name))
    return { resolved: name, format: 'builtin' };
  let curParentPath = parentPath;
  let separatorIndex, path;
  ({ name, path } = parsePackage(name));
  if (!name)
    throwInvalidModuleName("Invalid package name '" + name + "', loaded from " + parentPath);

  if (name === '@') {
    const pkgPath = getPackageScopeSync.call(this, parentPath, cache);
    if (!pkgPath)
      throwModuleNotFound(name, parentPath);
    const pkgConfig = readPkgConfigSync.call(this, pkgPath, cache);
    const resolved = resolvePackage.call(this, pkgPath, path, parentPath, pkgConfig, cjsResolve, env, builtins, cache);
    if (cjsResolve)
      return cjsFinalizeResolve.call(this, cjsFileResolve.call(this, resolved, parentPath, cache), parentPath, undefined, cache);
    return finalizeResolveSync.call(this, resolved, parentPath, undefined, isMain, cache);
  }

  const rootSeparatorIndex = curParentPath.indexOf('/');
  while ((separatorIndex = curParentPath.lastIndexOf('/')) > rootSeparatorIndex) {
    curParentPath = curParentPath.slice(0, separatorIndex);
    const pkgPath = curParentPath + '/node_modules/' + name;
    if (this.isDirSync(pkgPath, cache)) {
      const pkgConfig = readPkgConfigSync.call(this, pkgPath, cache);
      const resolved = resolvePackage.call(this, pkgPath, path, parentPath, pkgConfig, cjsResolve, env, builtins, cache);
      if (cjsResolve)
        return cjsFinalizeResolve.call(this, cjsFileResolve.call(this, resolved, parentPath, cache), parentPath, undefined, cache);
      return finalizeResolveSync.call(this, resolved, parentPath, undefined, isMain, cache);
    }
  }
  throwModuleNotFound(name, parentPath);
}

async function finalizeResolve (path, parentPath, jspmProjectPath, isMain, cache) {
  const resolved = await this.realpath(path, jspmProjectPath ? (parsePkgPath(path, jspmProjectPath) || jspmProjectPath) : undefined, cache);
  const scope = await getPackageScope.call(this, resolved, cache);
  const scopeConfig = scope && await readPkgConfig.call(this, scope, cache);
  if (resolved && resolved[resolved.length - 1] === '/') {
    if (!(await this.isDir(resolved, cache)))
      throwModuleNotFound(path, parentPath);
    return { resolved, format: 'unknown' };
  }
  if (!resolved || !(await this.isFile(resolved, cache)))
    throwModuleNotFound(path, parentPath);
  if (resolved.endsWith('.mjs'))
    return { resolved, format: 'module' };
  if (resolved.endsWith('.node'))
    return { resolved, format: 'addon' };
  if (resolved.endsWith('.json'))
    return { resolved, format: 'json' };
  if (!isMain && !resolved.endsWith('.js'))
    return { resolved, format: 'unknown' };
  return { resolved, format: scopeConfig && scopeConfig.type || 'commonjs' };
}

function finalizeResolveSync (path, parentPath, jspmProjectPath, isMain, cache) {
  const resolved = this.realpathSync(path, jspmProjectPath ? (parsePkgPath(path, jspmProjectPath) || jspmProjectPath) : undefined, cache);
  const scope = getPackageScopeSync.call(this, resolved, cache);
  const scopeConfig = scope && readPkgConfigSync.call(this, scope, cache);
  if (resolved && resolved[resolved.length - 1] === '/') {
    if (!(this.isDirSync(resolved, cache)))
      throwModuleNotFound(path, parentPath);
    return { resolved, format: 'unknown' };
  }
  if (!resolved || !(this.isFileSync(resolved, cache)))
    throwModuleNotFound(path, parentPath);
  if (resolved.endsWith('.mjs'))
    return { resolved, format: 'module' };
  if (resolved.endsWith('.node'))
    return { resolved, format: 'addon' };
  if (resolved.endsWith('.json'))
    return { resolved, format: 'json' };
  if (!isMain && !resolved.endsWith('.js'))
    return { resolved, format: 'unknown' };
  return { resolved, format: scopeConfig && scopeConfig.type || 'commonjs' };
}

function legacyFileResolve (path, cache) {
  if (this.isFileSync(path, cache))
    return path;
  if (this.isFileSync(path + '.js', cache))
    return path + '.js';
  if (this.isFileSync(path + '.json', cache))
    return path + '.json';
  if (this.isFileSync(path + '.node', cache))
    return path + '.node';
}

function legacyDirResolve (path, main, cache) {
  if (!this.isDirSync(path, cache))
    return;
  if (main) {
    const resolved = legacyFileResolve.call(this, path + '/' + main, cache);
    if (resolved)
      return resolved;
    if (this.isFileSync(path + '/' + main + '/index.js', cache))
      return path + '/' + main + '/index.js';
    if (this.isFileSync(path + '/' + main + '/index.json', cache))
      return path + '/' + main + '/index.json';
    if (this.isFileSync(path + '/' + main + '/index.node', cache))
      return path + '/' + main + '/index.node';
  }
  if (this.isFileSync(path + '/index.js', cache))
    return path + '/index.js';
  if (this.isFileSync(path + '/index.json', cache))
    return path + '/index.json';
  if (this.isFileSync(path + '/index.node', cache))
    return path + '/index.node';
}

function cjsFileResolve (path, parentPath, cache) {
  let resolved = legacyFileResolve.call(this, path, cache);
  if (!resolved) {
    const pjson = readPkgConfigSync.call(this, path + '/package.json', cache);
    resolved = legacyDirResolve.call(this, path, pjson && pjson.entries.default, cache);
  }
  if (!resolved)
    throwModuleNotFound(path, parentPath);
  return resolved;
}

function cjsFinalizeResolve (path, parentPath, jspmProjectPath, cache) {
  const resolved = this.realpathSync(path, jspmProjectPath ? (parsePkgPath(path) || jspmProjectPath) : undefined, cache);
  const scope = getPackageScopeSync.call(this, resolved, cache);
  const scopeConfig = scope && readPkgConfigSync.call(this, scope, cache);
  if (resolved.endsWith('.mjs') || resolved.endsWith('.js') && scopeConfig && scopeConfig.type === 'module') {
    throwInvalidModuleName(`Cannot load ES module ${resolved} from CommonJS module ${parentPath}.`);
  }
  if (resolved.endsWith('.json'))
    return { resolved, format: 'json' };
  if (resolved.endsWith('.node'))
    return { resolved, format: 'addon' };
  return { resolved, format: 'commonjs' };
}

async function getJspmProjectPath (modulePath, cache) {
  let basePackagePath;
  const jspmPackagesIndex = modulePath.lastIndexOf('/jspm_packages/');
  if (jspmPackagesIndex !== -1 && modulePath.lastIndexOf('/node_modules/', jspmPackagesIndex) === -1) {
    const baseProjectPath = modulePath.slice(0, jspmPackagesIndex);
    const pkgName = parsePkgPath(modulePath, baseProjectPath);
    basePackagePath = pkgName && packageToPath(pkgName, baseProjectPath);
  }
  let separatorIndex = modulePath.lastIndexOf('/');
  const rootSeparatorIndex = modulePath.indexOf('/');
  do {
    const dir = modulePath.slice(0, separatorIndex);
    if (dir.endsWith('/node_modules'))
      return;
    if (dir !== basePackagePath && await this.isFile(dir + '/jspm.json', cache))
      return dir;
    separatorIndex = modulePath.lastIndexOf('/', separatorIndex - 1);
  }
  while (separatorIndex > rootSeparatorIndex);
}

function getJspmProjectPathSync (modulePath, cache) {
  let basePackagePath;
  const jspmPackagesIndex = modulePath.lastIndexOf('/jspm_packages/');
  if (jspmPackagesIndex !== -1 && modulePath.lastIndexOf('/node_modules/', jspmPackagesIndex) === -1) {
    const baseProjectPath = modulePath.slice(0, jspmPackagesIndex);
    const pkgName = parsePkgPath(modulePath, baseProjectPath);
    basePackagePath = pkgName && packageToPath(pkgName, baseProjectPath);
  }
  let separatorIndex = modulePath.lastIndexOf('/');
  const rootSeparatorIndex = modulePath.indexOf('/');
  do {
    const dir = modulePath.slice(0, separatorIndex);
    if (dir.endsWith('/node_modules'))
      return;
    if (dir !== basePackagePath && this.isFileSync(dir + '/jspm.json', cache))
      return dir;
    separatorIndex = modulePath.lastIndexOf('/', separatorIndex - 1);
  }
  while (separatorIndex > rootSeparatorIndex);
}

async function getPackageScope (resolved, cache) {
  const rootSeparatorIndex = resolved.indexOf('/');
  let separatorIndex;
  while ((separatorIndex = resolved.lastIndexOf('/')) > rootSeparatorIndex) {
    resolved = resolved.slice(0, separatorIndex);
    if (resolved.endsWith('/node_modules') || resolved.endsWith('/jspm_packages'))
      return;
    if (await this.stat(resolved + '/package.json', cache))
      return resolved;
  }
}

function getPackageScopeSync (resolved, cache) {
  const rootSeparatorIndex = resolved.indexOf('/');
  let separatorIndex;
  while ((separatorIndex = resolved.lastIndexOf('/')) > rootSeparatorIndex) {
    resolved = resolved.slice(0, separatorIndex);
    if (resolved.endsWith('/node_modules') || resolved.endsWith('/jspm_packages'))
      return;
    if (this.statSync(resolved + '/package.json', cache))
      return resolved;
  }
}

async function readJspmConfig (jspmProjectPath, cache) {
  if (cache) {
    const cached = cache.jspmConfigCache[jspmProjectPath];
    if (cached)
      return cached;
  }

  let source;
  try {
    source = await this.readFile(jspmProjectPath + '/jspm.json', cache);
  }
  catch (e) {
    if (e.code === 'ENOENT') {
      throwInvalidConfig(`Unable to resolve in jspm project as jspm.json does not exist in ${jspmProjectPath}`);
    }
    throw e;
  }

  let parsed;
  try {
    parsed = JSON.parse(source);
  }
  catch (e) {
    e.stack = `Unable to parse JSON file ${jspmProjectPath}/jspm.json\n${e.stack}`;
    e.code = 'INVALID_CONFIG';
    throw e;
  }

  if (!parsed.resolve)
    parsed.resolve = Object.create(null);
  if (!parsed.resolvePeer)
    parsed.resolvePeer = Object.create(null);
  if (!parsed.dependencies)
    parsed.dependencies = Object.create(null);

  if (cache)
    cache.jspmConfigCache[jspmProjectPath] = parsed;
  return parsed;
}

function readJspmConfigSync (jspmProjectPath, cache) {
  if (cache) {
    const cached = cache.jspmConfigCache[jspmProjectPath];
    if (cached)
      return cached;
  }

  let source;
  try {
    source = this.readFileSync(jspmProjectPath + '/jspm.json', cache);
  }
  catch (e) {
    if (e.code === 'ENOENT') {
      throwInvalidConfig(`Unable to resolve in jspm project as jspm.json does not exist in ${jspmProjectPath}`);
    }
    throw e;
  }

  let parsed;
  try {
    parsed = JSON.parse(source);
  }
  catch (e) {
    e.stack = `Unable to parse JSON file ${jspmProjectPath}/jspm.json\n${e.stack}`;
    e.code = 'INVALID_CONFIG';
    throw e;
  }

  if (!parsed.resolve)
    parsed.resolve = Object.create(null);
  if (!parsed.resolvePeer)
    parsed.resolvePeer = Object.create(null);
  if (!parsed.dependencies)
    parsed.dependencies = Object.create(null);

  if (cache)
    cache.jspmConfigCache[jspmProjectPath] = parsed;
  return parsed;
}

async function readPkgConfig (pkgPath, cache) {
  if (cache) {
    const cached = cache.pjsonConfigCache[pkgPath];
    if (cached !== undefined)
      return cached;
  }

  let source;
  try {
    source = await this.readFile(pkgPath + '/package.json', cache);
  }
  catch (e) {
    if (e.code === 'ENOENT' || e.code === 'EISDIR') {
      if (cache) {
        if (e.code === 'ENOENT') {
          cache.pjsonConfigCache[pkgPath] = null;
          cache.statCache[pkgPath + '/package.json'] = null;
        }
      }
      return null;
    }
    throw e;
  }

  let pjson;
  try {
    pjson = JSON.parse(source);
  }
  catch (e) {
    e.stack = `Unable to parse JSON file ${pkgPath}/package.json\n${e.stack}`;
    e.code = 'INVALID_CONFIG';
    throw e;
  }

  const processed = processPkgConfig(pjson);

  if (cache)
    cache.pjsonConfigCache[pkgPath] = processed;

  return processed;
}

function readPkgConfigSync (pkgPath, cache) {
  if (cache) {
    const cached = cache.pjsonConfigCache[pkgPath];
    if (cached !== undefined)
      return cached;
  }

  let source;
  try {
    source = this.readFileSync(pkgPath + '/package.json', cache);
  }
  catch (e) {
    if (e.code === 'ENOENT' || e.code === 'EISDIR') {
      if (cache) {
        if (e.code === 'ENOENT') {
          cache.pjsonConfigCache[pkgPath] = null;
          cache.statCache[pkgPath + '/package.json'] = null;
        }
      }
      return null;
    }
    throw e;
  }

  let pjson;
  try {
    pjson = JSON.parse(source);
  }
  catch (e) {
    e.stack = `Unable to parse JSON file ${pkgPath}/package.json\n${e.stack}`;
    e.code = 'INVALID_CONFIG';
    throw e;
  }

  const processed = processPkgConfig(pjson);

  if (cache)
    cache.pjsonConfigCache[pkgPath] = processed;

  return processed;
}

const fsUtils = {
  async isFile (path, cache) {
    const stats = await this.stat(path, cache);
    return stats && stats.isFile();
  },
  isFileSync (path, cache) {
    const stats = this.statSync(path, cache);
    return stats && stats.isFile();
  },

  async isDir (path, cache) {
    const stats = await this.stat(path, cache);
    return stats && stats.isDirectory();
  },
  isDirSync (path, cache) {
    const stats = this.statSync(path, cache);
    return stats && stats.isDirectory();
  },

  async stat (path, cache) {
    if (cache) {
      const cached = cache.statCache[path];
      if (cached !== undefined)
        return cached;
    }
    try {
      var stats = await new Promise((resolve, reject) => fs.stat(path, (err, stats) => err ? reject(err) : resolve(stats)));
    }
    catch (e) {
      if (e.code === 'ENOENT' || e.code === 'ENOTDIR') {
        if (cache)
          cache.statCache[path] = null;
        return null;
      }
      throw e;
    }
    if (cache)
      cache.statCache[path] = stats;
    return stats;
  },
  statSync (path, cache) {
    const cached = cache && cache.statCache[path];
    if (cached !== undefined)
      return cache.statCache[path];
    try {
      var stats = fs.statSync(path);
    }
    catch (e) {
      if (e.code === 'ENOENT' || e.code === 'ENOTDIR') {
        if (cache)
          cache.statCache[path] = null;
        return null;
      }
      throw e;
    }
    if (cache)
      cache.statCache[path] = stats;
    return stats;
  },

  async realpath (path, realpathBase = path.slice(0, path.indexOf('/')), cache, seen = new Set()) {
    const trailingSlash = path[path.length - 1] === '/';
    if (trailingSlash)
      path = path.slice(0, -1);
    if (seen.has(path))
      throw new Error('Recursive symlink resolving ' + path);
    seen.add(path);
    const symlink = await this.readlink(path, cache);
    if (symlink) {
      const resolved = resolvePath(symlink, path);
      if (realpathBase && !pathContains(realpathBase, resolved))
        return path + (trailingSlash ? '/' : '');
      return this.realpath(resolved + (trailingSlash ? '/' : ''), realpathBase, cache, seen);
    }
    else {
      const parent = resolvePath('.', path);
      if (realpathBase && !pathContains(realpathBase, parent))
        return path + (trailingSlash ? '/' : '');
      return (await this.realpath(parent, realpathBase, cache, seen)) + path.slice(parent.length) + (trailingSlash ? '/' : '');
    }
  },
  realpathSync (path, realpathBase = path.slice(0, path.indexOf('/')), cache, seen = new Set()) {
    const trailingSlash = path[path.length - 1] === '/';
    if (trailingSlash)
      path = path.slice(0, -1);
    if (seen.has(path))
      throw new Error('Recursive symlink resolving ' + path);
    seen.add(path);
    const symlink = this.readlinkSync(path, cache);
    if (symlink) {
      const resolved = resolvePath(symlink, path);
      if (realpathBase && !pathContains(realpathBase, resolved))
        return path + (trailingSlash ? '/' : '');
      return this.realpathSync(resolved + (trailingSlash ? '/' : ''), realpathBase, cache, seen);
    }
    else {
      const parent = resolvePath('.', path);
      if (realpathBase && !pathContains(realpathBase, parent))
        return path + (trailingSlash ? '/' : '');
      return this.realpathSync(parent, parent, cache, seen) + path.slice(parent.length) + (trailingSlash ? '/' : '');
    }
  },

  async readlink (path, cache) {
    if (cache) {
      const cached = cache.symlinkCache[path];
      if (cached !== undefined)
        return cached;
    }
    try {
      const fsLink = await new Promise((resolve, reject) => fs.readlink(path, (err, link) => err ? reject(err) : resolve(link)));
      const link = resolvePath(fsLink, path);
      if (cache) {
        cache.symlinkCache[path] = link;
        const stats = cache.statCache[path];
        if (stats)
          cache.statCache[link] = stats;
      }
      return link;
    }
    catch (e) {
      if (e.code !== 'EINVAL' && e.code !== 'ENOENT' && e.code !== 'UNKNOWN')
        throw e;
      if (cache)
        cache.symlinkCache[path] = null;
      return null;
    }
  },
  readlinkSync (path, cache) {
    if (cache) {
      const cached = cache.symlinkCache[path];
      if (cached !== undefined)
        return cached;
    }
    try {
      const link = resolvePath(fs.readlinkSync(path), path);
      if (cache) {
        cache.symlinkCache[path] = link;
        const stats = cache.statCache[path];
        if (stats)
          cache.statCache.set(link, stats);
      }
      return link;
    }
    catch (e) {
      if (e.code !== 'EINVAL' && e.code !== 'ENOENT' && e.code !== 'UNKNOWN')
        throw e;
      if (cache)
        cache.symlinkCache[path] = null;
      return null;
    }
  },

  readFile (path) {
    return new Promise((resolve, reject) => {
      fs.readFile(path, (err, source) => err ? reject(err) : resolve(source.toString()));
    });
  },
  readFileSync (path) {
    return fs.readFileSync(path);
  }
};

resolve.sync = resolveSync;
resolve.builtins = Object.freeze([...defaultBuiltins]);

const winPathRegEx = /^[a-z]:\//i;
resolve.cjsResolve = function (request, parent) {
  if (request.match(winPathRegEx))
    request = '/' + request;
  if (request.endsWith('/'))
    request = request.slice(0, request.length - 1);
  return resolveSync(request, parent && parent.filename, { cjsResolve: true, cache: parent && parent.cache }).resolved;
};

module.exports = resolve;

function processPkgConfig (pjson) {
  let type = undefined,
      entries = {},
      exports = undefined,
      map = undefined;

  if (typeof pjson.jspm === 'object')
    Object.assign(pjson, pjson.jspm);

  if (pjson.type === 'commonjs' || pjson.type === 'module')
    type = pjson.type;

  if (typeof pjson.exports === 'object' && pjson.exports !== null) {
    exports = pjson.exports;
    if (exports['.']) {
      if (typeof exports['.'] === 'string')
        entries = { "default": exports['.'] };
      else if (exports['.'] instanceof Array)
        entries = { "default": exports['.'] };
      else if (typeof exports['.'] === 'object')
        entries = exports['.'];
      delete exports['.'];
    }
  }
  else if (typeof pjson.exports === 'string' || pjson.exports instanceof Array) {
    entries = { default: pjson.exports };
  }

  if (typeof pjson.main === 'string' && !Object.hasOwnProperty.call(entries, 'default')) {
    let entry = pjson.main;
    if (!entry.startsWith('./')) entry = './' + entry;
    if (entry.endsWith('/')) entry = entry.slice(0, entry.length - 1);
    entries.default = entry;
  }

  if (typeof pjson.browser === 'string' && !Object.hasOwnProperty.call(entries, 'browser')) {
    let entry = pjson.browser;
    if (!entry.startsWith('./')) entry = './' + entry;
    if (entry.endsWith('/')) entry = entry.slice(0, entry.length - 1);
    entries.browser = entry;
  }

  if (typeof pjson.map === 'object' && pjson.map !== null)
    map = pjson.map;
  else
    map = Object.create(null);

  if (typeof pjson.browser === 'object') {
    for (const key of Object.keys(pjson.browser)) {
      let target = pjson.browser[key];
      if (target === false) target = '@empty';
      if (typeof target !== 'string') continue;
      if (key.startsWith('./')) {
        if (!target.startsWith('./')) target = './' + target;
        if (entries.default && entries.default.startsWith(key)) {
          const extra = key.slice(entries.default.length);
          if (extra === '' || extra === '.js' || extra === '.json' || extra === '.node' || extra === '/index.js' || extra === '/index.json' || extra === '/index.node')
            entries.browser = target;
        }
        if (!exports || Object.hasOwnProperty.call(exports, key) === false) {
          if (!exports) exports = { './': './' };
          exports[key] = { browser: target, default: key };
        }
      }
      else if (Object.hasOwnProperty.call(map, key) === false) {
        map[key] = { browser: target, default: key };
      }
    }
  }
  return { type, entries, exports, map };
}

function throwMainNotFound (pkgPath, parentPath) {
  const e = new Error(`No package main found in ${pkgPath}/package.json, imported from ${parentPath}`);
  e.code = 'MODULE_NOT_FOUND';
  throw e;
}

function throwExportsNotFound (pkgPath, subpath, parentPath) {
  const e = new Error(`No package exports defined for '${subpath}' in ${pkgPath}/package.json, imported from ${parentPath}`);
  e.code = 'MODULE_NOT_FOUND';
  throw e;
}

function throwNoExportsTarget (pkgPath, specifier, match, parentPath) {
  const e = new Error(`No valid package exports target for '${specifier}' matched to '${match}' in ${pkgPath}/package.json, imported from ${parentPath}`);
  e.code = 'MODULE_NOT_FOUND';
  throw e;
}

function throwNoMapTarget (pkgPath, specifier, match, parentPath) {
  const e = new Error(`No valid package map target for '${specifier}' matched to '${match}' in ${pkgPath}/package.json, imported from ${parentPath}`);
  e.code = 'MODULE_NOT_FOUND';
  throw e;
}

const emptyPcfg = Object.create(null);
function resolvePackage (pkgPath, subpath, parentPath, pcfg, cjsResolve, env, builtins, cache) {
  pcfg = pcfg || emptyPcfg;
  if (subpath) {
    if (subpath === './')
      return pkgPath + '/';
    if (pcfg.exports === undefined || pcfg.exports === null) {
      const resolved = resolvePath(uriToPath(subpath), pkgPath + '/');
      return cjsResolve ? cjsFileResolve.call(this, resolved, parentPath, cache) : resolved;
    }
    if (typeof pcfg.exports !== 'object')
      throwExportsNotFound(pkgPath, subpath, parentPath);
    if (Object.hasOwnProperty.call(pcfg.exports, subpath))
      return resolveExportsTarget(pkgPath, pcfg.exports[subpath], '', parentPath, subpath, env, builtins);

    let dirMatch = '';
    for (const candidateKey of Object.keys(pcfg.exports)) {
      if (candidateKey[candidateKey.length - 1] !== '/')
        continue;
      if (candidateKey.length > dirMatch.length && subpath.startsWith(candidateKey))
        dirMatch = candidateKey;
    }
  
    if (dirMatch)
      return resolveExportsTarget(pkgPath,  pcfg.exports[dirMatch], subpath.slice(dirMatch.length), parentPath, dirMatch, env, builtins);

    throwExportsNotFound(pkgPath, subpath, parentPath);
  }
  else {
    let resolvedEntry;
    if (pcfg.entries) {
      for (const target of env) {
        if (!Object.hasOwnProperty.call(pcfg.entries, target))
          continue;
        const entryValue = pcfg.entries[target];
        try {
          resolvedEntry = resolveExportsTarget(pkgPath, entryValue, '', parentPath, '.', env, builtins);
          break;
        }
        catch (e) {
          if (e.code !== 'MODULE_NOT_FOUND')
            throw e;
        }
      }
      if (resolvedEntry && this.isFileSync(resolvedEntry, cache))
        return resolvedEntry;
    }
    
    if (pcfg.type !== 'module' || cjsResolve === true) {
      const resolved = legacyDirResolve.call(this, pkgPath, resolvedEntry && resolvedEntry.slice(pkgPath.length + 1), cache);
      if (resolved)
        return resolved;
    }
    throwMainNotFound(pkgPath, parentPath);
  }
}

function resolveExportsTarget(pkgPath, target, subpath, parentPath, match, env, builtins) {
  if (typeof target === 'string') {
    if (target.startsWith('./') && (subpath.length === 0 || target.endsWith('/'))) {
      const resolvedTarget = resolvePath(uriToPath(target), pkgPath + '/');
      if (resolvedTarget.startsWith(pkgPath + '/')) {
        if (!subpath)
          return resolvedTarget;
        const resolved = resolvePath(uriToPath(subpath), resolvedTarget);
        if (resolved.startsWith(resolvedTarget))
          return resolved;
      }
    }
  }
  else if (Array.isArray(target)) {
    for (const targetValue of target) {
      if (typeof targetValue !== 'string' || typeof targetValue !== 'object' || Array.isArray(targetValue))
        continue;
      try {
        return resolveExportsTarget(pkgPath, targetValue, subpath, parentPath, match, env, builtins);
      }
      catch (e) {
        if (e.code !== 'MODULE_NOT_FOUND')
          throw e;
      }
    }
  }
  else if (target === null) {
    throwNoExportsTarget(pkgPath, match + subpath, match, parentPath);
  }
  else if (typeof target === 'object') {
    for (const targetName of env) {
      if (!Object.hasOwnProperty.call(target, targetName))
        continue;
      try {
        return resolveExportsTarget(pkgPath, target[targetName], subpath, parentPath, match, env, builtins);
      }
      catch (e) {
        if (e.code !== 'MODULE_NOT_FOUND')
          throw e;
      }
    }
  }
  throwNoExportsTarget(pkgPath, match + subpath, match, parentPath);
}

function resolveMap (specifier, map, pkgPath, parentPath, env, builtins) {
  if (map[specifier])
    return resolveMapTarget(pkgPath, map[specifier], '', parentPath, specifier, env, builtins);

  let dirMatch = '';
  for (const candidateKey of Object.keys(map)) {
    if (candidateKey[candidateKey.length - 1] !== '/' && specifier[candidateKey.length] !== '/')
      continue;
    if (candidateKey.length > dirMatch.length && specifier.startsWith(candidateKey))
      dirMatch = candidateKey;
  }

  if (dirMatch)
    return resolveMapTarget(pkgPath,  map[dirMatch], specifier.slice(dirMatch.length), parentPath, dirMatch, env, builtins);
}

function resolveMapTarget (pkgPath, target, subpath, parentPath, match, env, builtins) {
  if (typeof target === 'string') {
    const { name, path } = parsePackage(target);
    if (name) {
      if (subpath[0] === '/') {
        if (path.length)
          throwNoMapTarget(pkgPath, match + subpath, match, parentPath);
        return target + subpath;
      }
      if (subpath.length && target[target.length - 1] !== '/')
        throwNoMapTarget(pkgPath, match + subpath, match, parentPath);
      return target + subpath;
    }
    else {
      if (subpath[0] === '/' || target[0] !== '.' || target[1] !== '/' || subpath.length && target[target.length - 1] !== '/')
        throwNoMapTarget(pkgPath, match + subpath, match, parentPath);
      const resolvedTarget = resolvePath(uriToPath(target), pkgPath + '/');
      if (resolvedTarget.startsWith(pkgPath + '/')) {
        if (!subpath)
          return resolvedTarget;
        const resolved = resolvePath(uriToPath(subpath), resolvedTarget);
        if (resolved.startsWith(resolvedTarget))
          return resolved;
      }
    }
    if (target.startsWith('./') && (subpath.length === 0 || target.endsWith('/'))) {
      const resolvedTarget = resolvePath(uriToPath(subpath), pkgPath + '/');
      if (resolvedTarget.startsWith(pkgPath + '/')) {
        if (!subpath)
          return resolvedTarget;
        const resolved = resolvePath(uriToPath(subpath), resolvedTarget);
        if (resolved.startsWith(pkgPath + '/'))
          return resolved;
      }
    }
  }
  else if (Array.isArray(target)) {
    for (const targetValue of target) {
      if (typeof targetValue !== 'string' || typeof targetValue !== 'object' || Array.isArray(targetValue))
        continue;
      try {
        return resolveMapTarget(pkgPath, targetValue, subpath, parentPath, match, env, builtins);
      }
      catch (e) {
        if (e.code !== 'MODULE_NOT_FOUND')
          throw e;
      }
    }
  }
  else if (typeof target === 'object') {
    for (const targetName of env) {
      if (!Object.hasOwnProperty.call(target, targetName))
        continue;
      try {
        return resolveExportsTarget(pkgPath, target[targetName], subpath, parentPath, match, env, builtins);
      }
      catch (e) {
        if (e.code !== 'MODULE_NOT_FOUND')
          throw e;
      }
    }
  }
  throwNoMapTarget(pkgPath, match + subpath, match, parentPath);
}
