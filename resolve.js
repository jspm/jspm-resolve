'use strict';

const { URL } = require('url');
const path = require('path');
const fs = require('fs');

const isWindows = process.platform === 'win32';
const winSepRegEx = /\\/g;
const encodedSepRegEx = /%(5C|2F)/gi;

const seenCacheAndEnv = new WeakMap();

function throwModuleNotFound (name, parent) {
  let e = new Error(`Cannot find module ${name}${parent ? ` from ${parent}` : ''}.`);
  e.code = 'MODULE_NOT_FOUND';
  throw e;
}

function throwURLName (name) {
  let e = new Error(`URL ${name} is not a valid file:/// URL to resolve.`);
  e.code = 'MODULE_NAME_URL_NOT_FILE';
  throw e;
}

function throwInvalidModuleName (msg) {
  let e = new Error(msg);
  e.code = 'INVALID_MODULE_NAME';
  throw e;
}

function throwInvalidConfig (msg) {
  let e = new Error(msg);
  e.code = 'INVALID_CONFIG';
  throw e;
}

const packageRegEx = /^([a-z]+:[@\-_\.a-zA-Z\d][-_\.a-zA-Z\d]*(?:\/[-_\.a-zA-Z\d]+)*@[^@<>:"/\|?*^\u0000-\u001F]+)(\/[\s\S]*|$)/;
function parsePackageName (name) {
  let packageMatch = name.match(packageRegEx);
  if (packageMatch)
    return { name: packageMatch[1], path: packageMatch[2] };
}
const packagePathRegEx = /^([a-z]+\/[@\-_\.a-zA-Z\d][-_\.a-zA-Z\d]*(?:\/[-_\.a-zA-Z\d]+)*@[^@<>:"/\|?*^\u0000-\u001F]+)(\/[\s\S]*|$)/;
function parsePackagePath (path, projectPath) {
  const jspmPackagesPath = projectPath + '/jspm_packages';
  if (!path.startsWith(jspmPackagesPath) || path[jspmPackagesPath.length] !=='/' && path.length !== jspmPackagesPath.length)
    return;
  let packageMatch = path.substr(jspmPackagesPath.length + 1).match(packagePathRegEx);
  if (packageMatch)
    return { name: packageMatch[1].replace('/', ':'), path: packageMatch[2] };
}
function packageToPath (pkg, projectPath) {
  let registryIndex = pkg.name.indexOf(':');
  return projectPath + '/jspm_packages/' + pkg.name.substr(0, registryIndex) + '/' + pkg.name.substr(registryIndex + 1) + pkg.path;
}

function percentDecode (path) {
  if (path.match(encodedSepRegEx))
    throwInvalidModuleName(`${path} cannot be URI decoded as it contains a percent-encoded separator or percent character.`);
  if (path.indexOf('%') === -1)
    return path;
  return decodeURIComponent(path);
}

async function finalizeResolve (resolved, parentPath, projectPath, cjsResolve, cache) {
  if (cjsResolve)
    return legacyFinalizeResolve.call(utils, resolved, parentPath, false, cache);
  
  if (resolved.substr(0, projectPath.length) !== projectPath || resolved[projectPath.length] !== '/') {
    const projectPath = await this.getProjectPath(resolved, cache);
    if (projectPath !== undefined) {
      const packageConfig = await this.readPackageConfig(projectPath, cache);
      if (packageConfig && packageConfig.mode === 'cjs')
      return legacyFinalizeResolve.call(utils, resolved, parentPath, true, cache);
    }
  }

  if (projectPath !== undefined) {
    const resolvedPackage = parsePackagePath(resolved, projectPath);
    if (resolvedPackage !== undefined) {
      const packageConfig = await this.readPackageConfig(packageToPath(resolvedPackage.name, projectPath), cache);
      if (packageConfig && packageConfig.mode === 'cjs')
        return legacyFinalizeResolve.call(utils, resolved, parentPath, true, cache);
    }
  }

  if (resolved.endsWith('.js') || resolved.endsWith('.mjs'))
    return { resolved, format: 'esm' };
  return { resolved, format: 'unknown' };
}

function finalizeResolveSync (resolved, parentPath, projectPath, cjsResolve, cache) {
  if (cjsResolve)
    return legacyFinalizeResolve.call(utils, resolved, parentPath, false, cache);
  
  if (resolved.substr(0, projectPath.length) !== projectPath || resolved[projectPath.length] !== '/') {
    const projectPath = this.getProjectPathSync(resolved, cache);
    if (projectPath !== undefined) {
      const packageConfig = this.readPackageConfigSync(projectPath, cache);
      if (packageConfig && packageConfig.mode === 'cjs')
      return legacyFinalizeResolve.call(utils, resolved, parentPath, true, cache);
    }
  }

  if (projectPath !== undefined) {
    const resolvedPackage = parsePackagePath(resolved, projectPath);
    if (resolvedPackage !== undefined) {
      const packageConfig = this.readPackageConfigSync(packageToPath(resolvedPackage.name, projectPath), cache);
      if (packageConfig && packageConfig.mode === 'cjs')
        return legacyFinalizeResolve.call(utils, resolved, parentPath, true, cache);
    }
  }

  if (resolved.endsWith('.js') || resolved.endsWith('.mjs'))
    return { resolved, format: 'esm' };
  return { resolved, format: 'unknown' };
}

function tryParseUrl (url) {
  try {
    return new URL(url);
  }
  catch (e) {}
}

// path is an absolute file system path with . and .. segments to be resolved
// works only with /-separated paths
function resolvePath (path) {
  // linked list of path segments
  let headSegment = {
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
        let nextSegment = { segment: path.substring(segmentIndex, i + 1), next: undefined, prev: curSegment };
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
        let nextSegment = { segment: path.substr(segmentIndex), next: undefined, prev: curSegment };
        curSegment.next = nextSegment;
      }
    }
    else {
      let nextSegment = { segment: path.substr(segmentIndex), next: undefined, prev: curSegment };
      curSegment.next = nextSegment;
    }
  }

  curSegment = headSegment;
  let outStr = '';
  while (curSegment = curSegment.next)
    outStr += curSegment.segment;

  return outStr;
}

const defaultEnv = {
  browser: false,
  node: true,
  production: false,
  dev: true,
  'react-native': false,
  electron: false,
  module: true,
  default: true
};

function setDefaultEnv (env) {
  if (typeof env.browser === 'boolean') {
    if (typeof env.node !== 'boolean')
      env.node = !env.browser;
  }
  else if (typeof env.node === 'boolean') {
    env.browser = !env.node;
  }
  if (typeof env.production === 'boolean') {
    env.dev = !env.production;
  }
  else if (typeof env.dev === 'boolean') {
    env.production = !env.dev;
  }
  env.default = true;
  seenCacheAndEnv.set(env, true);
}

const relRegex = /^(\/|\.\.?\/)/;
const dotSegmentRegex = /(^|\/)\.\.?(\/|$)/;
function validatePlain (name) {
  if (name.indexOf('\\') !== -1)
    throwInvalidModuleName(`Package request ${name} must use "/" as a separator not "\".`);
  let urlLike = false;
  const protocolIndex = name.indexOf(':');
  if (protocolIndex !== -1) {
    const sepIndex = name.indexOf('/');
    urlLike = sepIndex === -1 || sepIndex > protocolIndex;
  }
  if (urlLike || name.match(relRegex) || name.match(dotSegmentRegex))
    throwInvalidModuleName(`Package request ${name} is not a valid plain specifier name.`);
}

function initCache (cache) {
  if (cache.jspmConfigCache === undefined)
    cache.jspmConfigCache = {};
  if (cache.pjsonConfigCache === undefined)
    cache.pjsonConfigCache = {};
  if (cache.isFileCache === undefined)
    cache.isFileCache = {};
  if (cache.isDirCache === undefined)
    cache.isDirCache = {};
  seenCacheAndEnv.set(cache, true);
}

function hasWinDrivePrefix (name) {
  if (name[1] !== ':')
    return false;
  const charCode = name.charCodeAt(0);
  return charCode > 64 && charCode < 90 || charCode > 96 && charCode < 123;
}

async function packagePath (path, { cache, utils = resolveUtils } = {}) {
  if (path.indexOf('\\') !== -1)
    path = path.replace(winSepRegEx, '/');
  if (cache && seenCacheAndEnv.has(cache) === false)
    initCache(cache);
  const config = await utils.getJspmConfig(path, cache);
  if (!config)
    return;
  const pkg = parsePackagePath(path, config.projectPath);
  if (!pkg)
    return;
  pkg.path = '';
  return packageToPath(pkg, config.projectPath);
}

function packagePathSync (path, { cache, utils = resolveUtils } = {}) {
  if (path.indexOf('\\') !== -1)
    path = path.replace(winSepRegEx, '/');
  if (cache && seenCacheAndEnv.has(cache) === false)
    initCache(cache);
  const config = utils.getJspmConfigSync(path, cache);
  if (!config)
    return;
  const pkg = parsePackagePath(path, config.projectPath);
  if (!pkg)
    return;
  pkg.path = '';
  return packageToPath(pkg, config.projectPath);
}

async function resolve (name, parentPath = process.cwd() + '/', {
  env,
  cache,
  utils = resolveUtils,
  cjsResolve = false,
  browserBuiltinsDir = undefined, // when env.browser is set, resolves builtins to this directory
  resolveNodeModules = true // whether to do node_modules resolution
} = {}) {
  if (parentPath.indexOf('\\') !== -1)
    parentPath = parentPath.replace(winSepRegEx, '/');
  if (cache && seenCacheAndEnv.has(cache) === false)
    initCache(cache);
  if (env) {
    if (seenCacheAndEnv.has(env) === false)
      setDefaultEnv(env);
  }
  else {
    env = defaultEnv;
  }
  
  const projectPath = await utils.getProjectPath(parentPath, cache);

  // Absolute and relative path resolutions resolve exactly
  let resolvedPath;
  if (name[0] === '/') {
    name = name.replace(winSepRegEx, '/');
    if (name[1] === '/') {
      if (name[2] === '/')
        throwInvalidModuleName(`${name} is not a valid module name.`);
      else
        resolvedPath = resolvePath(percentDecode(name.substr(1 + isWindows)));
    }
    else {
      let path = isWindows ? name.substr(1) : name;
      if (isWindows && !hasWinDrivePrefix(path))
        path = name;
      resolvedPath = resolvePath(percentDecode(path));
    }
  }
  // Relative path
  else if (name[0] === '.' && (name.length === 1 || (name[1] === '/' && (name = name.substr(2), true) || name[1] === '.' && (name.length === 2 || name[2] === '/')))) {
    name = name.replace(winSepRegEx, '/');
    resolvedPath = resolvePath(parentPath.substr(0, parentPath.lastIndexOf('/') + 1) + percentDecode(name));
    if (resolvedPath[resolvedPath.length - 1] === '/')
      resolvedPath = resolvedPath.substr(0, resolvedPath.length - 1);
  }
  // URL
  else if (name.indexOf(':') !== -1) {
    if (isWindows && hasWinDrivePrefix(name)) {
      resolvedPath = percentDecode(name).replace(winSepRegEx, '/');
    }
    else {
      const url = tryParseUrl(name);
      if (url.protocol === 'file:')
        resolvedPath = percentDecode(isWindows ? url.pathname.substr(1) : url.pathname);
      else
        throwURLName(name);
    }
  }
  // Plain name resolution
  else {
    validatePlain(name);

    const parentPkg = projectPath !== undefined ? parsePackagePath(parentPath, projectPath) : undefined;
    const parentPkgPath = parentPkg ? packageToPath(parentPkg.name, projectPath) : projectPath;
    const parentPkgConfig = parentPkgPath ? await utils.readPackageConfig(parentPkgPath, cache) : undefined;

    // package importing its own name
    if (parentPkgConfig !== undefined && parentPkgConfig.name && name.startsWith(parentPkgConfig.name) &&
        (name.length === parentPkgConfig.name.length || name[parentPkgConfig.name.length] === '/')) {
      const subPath = name.substr(parentPkgConfig.name.length);

      resolvedPath = parentPkgPath + subPath;

      if (cjsResolve || parentPkgConfig !== undefined && parentPkgConfig.mode === 'cjs')
        return legacyPackageResolve.call(utils, parentPkgPath + subPath, parentPath, !cjsResolve, env, parentPkgConfig, cache);
      
      if (parentPkgConfig !== undefined) {
        if (subPath.length === 0) {
          if (parentPkgConfig.main === undefined)
            throwInvalidModuleName(`Cannot directly resolve package path ${parentPkgPath} as it has no package.json "main".`);
          subPath = '/' + parentPkgConfig.config.main;
          resolvedPath = parentPkgPath + subPath;
        }
        if (parentPkgConfig.map !== undefined) {
          const mapped = applyMap('.' + subPath, parentPkgConfig.map, env);
          if (mapped !== undefined) {
            if (mapped === '@empty')
              return { resolved: '@empty', format: 'builtin' };
            if (mapped === '@notfound')
              throwModuleNotFound(resolved, parentPath);
            resolvedPath = parentPkgPath + '/' + mapped;
          }
        }
      }
    }

    // parent package map configuration
    if (parentPkgConfig && parentPkgConfig.map) {
      const mapped = applyMap(name, parentPkgConfig.map, env);
      if (mapped !== undefined) {
        if (mapped.startsWith('./'))
          return await finalizeResolve.call(utils, parentPkgPath + mapped.substr(1), parentPath, projectPath, cjsResolve, cache);
        validatePlain(name = mapped);
      }
    }

    // jspm lock file resolution
    const jspmConfig = projectPath !== undefined ? await utils.readJspmConfig(projectPath, cache) : undefined;
    if (jspmConfig !== undefined) {
      const resolvedPkgName = await utils.packageResolve(name, parentPkg && parentPkg.name, jspmConfig);
      if (resolvedPkgName) {
        const resolvedPkg = parsePackageName(resolvedPkgName);
        if (!resolvedPkg)
          throwInvalidConfig(`${resolvedPkgName} is an invalid resolution in the jspm config file for ${config.projectPath}.`);
        
        let subPath = resolvedPkg.path;
        const pkgPath = packageToPath(resolvedPkg.name, projectPath);
        const pkgConfig = await utils.readPackageConfig(pkgPath, cache);

        resolvedPath = pkgPath + subPath;

        if (cjsResolve || pkgConfig !== undefined && pkgConfig.mode === 'cjs')
          return legacyPackageResolve.call(utils, pkgPath + subPath, parentPath, !cjsResolve, env, pkgConfig, cache);
        
        if (pkgConfig !== undefined) {
          if (subPath.length === 0) {
            if (pkgConfig.main === undefined)
              throwInvalidModuleName(`Cannot directly resolve package path ${pkgPath} as it has no package.json "main".`);
            subPath = '/' + pkgConfig.config.main;
            resolvedPath = pkgPath + subPath;
          }
          if (pkgConfig.map !== undefined) {
            const mapped = applyMap('.' + subPath, pkgConfig.map, env);
            if (mapped !== undefined) {
              if (mapped === '@empty')
                return { resolved: '@empty', format: 'builtin' };
              if (mapped === '@notfound')
                throwModuleNotFound(resolved, parentPath);
              resolvedPath = pkgPath + '/' + mapped;
            }
          }
        }
      }
    }

    // builtins
    const builtinResolved = nodeBuiltinResolve(name, env.browser ? browserBuiltinsDir : undefined);
    if (builtinResolved)
      return builtinResolved;

    // node_modules resolution fallback
    if (resolveNodeModules)
      return nodeModulesResolve.call(utils, name, parentPath, !cjsResolve, env, cache);
    else
      throw throwModuleNotFound(name, parentPath);
  }

  return await finalizeResolve.call(utils, resolvedPath, parentPath, projectPath, cjsResolve, cache);
}

function resolveSync (name, parentPath = process.cwd() + '/', {
  env,
  cache,
  utils = resolveUtils,
  cjsResolve = false,
  browserBuiltinsDir = undefined, // when env.browser is set, resolves builtins to this directory
  resolveNodeModules = true // whether to do node_modules resolution
} = {}) {
  if (parentPath.indexOf('\\') !== -1)
    parentPath = parentPath.replace(winSepRegEx, '/');
  if (cache && seenCacheAndEnv.has(cache) === false)
    initCache(cache);
  if (env) {
    if (seenCacheAndEnv.has(env) === false)
      setDefaultEnv(env);
  }
  else {
    env = defaultEnv;
  }
  
  const projectPath = utils.getProjectPathSync(parentPath, cache);

  // Absolute and relative path resolutions resolve exactly
  let resolvedPath;
  if (name[0] === '/') {
    name = name.replace(winSepRegEx, '/');
    if (name[1] === '/') {
      if (name[2] === '/')
        throwInvalidModuleName(`${name} is not a valid module name.`);
      else
        resolvedPath = resolvePath(percentDecode(name.substr(1 + isWindows)));
    }
    else {
      let path = isWindows ? name.substr(1) : name;
      if (isWindows && !hasWinDrivePrefix(path))
        path = name;
      resolvedPath = resolvePath(percentDecode(path));
    }
  }
  // Relative path
  else if (name[0] === '.' && (name.length === 1 || (name[1] === '/' && (name = name.substr(2), true) || name[1] === '.' && (name.length === 2 || name[2] === '/')))) {
    name = name.replace(winSepRegEx, '/');
    resolvedPath = resolvePath(parentPath.substr(0, parentPath.lastIndexOf('/') + 1) + percentDecode(name));
    if (resolvedPath[resolvedPath.length - 1] === '/')
      resolvedPath = resolvedPath.substr(0, resolvedPath.length - 1);
  }
  // URL
  else if (name.indexOf(':') !== -1) {
    if (isWindows && hasWinDrivePrefix(name)) {
      resolvedPath = percentDecode(name).replace(winSepRegEx, '/');
    }
    else {
      const url = tryParseUrl(name);
      if (url.protocol === 'file:')
        resolvedPath = percentDecode(isWindows ? url.pathname.substr(1) : url.pathname);
      else
        throwURLName(name);
    }
  }
  // Plain name resolution
  else {
    validatePlain(name);

    const parentPkg = projectPath !== undefined ? parsePackagePath(parentPath, projectPath) : undefined;
    const parentPkgPath = parentPkg ? packageToPath(parentPkg.name, projectPath) : projectPath;
    const parentPkgConfig = parentPkgPath ? utils.readPackageConfigSync(parentPkgPath, cache) : undefined;

    // package importing its own name
    if (parentPkgConfig !== undefined && parentPkgConfig.name && name.startsWith(parentPkgConfig.name) &&
        (name.length === parentPkgConfig.name.length || name[parentPkgConfig.name.length] === '/')) {
      const subPath = name.substr(parentPkgConfig.name.length);

      resolvedPath = parentPkgPath + subPath;

      if (cjsResolve || parentPkgConfig !== undefined && parentPkgConfig.mode === 'cjs')
        return legacyPackageResolve.call(utils, parentPkgPath + subPath, parentPath, !cjsResolve, env, parentPkgConfig, cache);
      
      if (parentPkgConfig !== undefined) {
        if (subPath.length === 0) {
          if (parentPkgConfig.main === undefined)
            throwInvalidModuleName(`Cannot directly resolve package path ${parentPkgPath} as it has no package.json "main".`);
          subPath = '/' + parentPkgConfig.config.main;
          resolvedPath = parentPkgPath + subPath;
        }
        if (parentPkgConfig.map !== undefined) {
          const mapped = applyMap('.' + subPath, parentPkgConfig.map, env);
          if (mapped !== undefined) {
            if (mapped === '@empty')
              return { resolved: '@empty', format: 'builtin' };
            if (mapped === '@notfound')
              throwModuleNotFound(resolved, parentPath);
            resolvedPath = parentPkgPath + '/' + mapped;
          }
        }
      }
    }

    // parent package map configuration
    if (parentPkgConfig && parentPkgConfig.map) {
      const mapped = applyMap(name, parentPkgConfig.map, env);
      if (mapped !== undefined) {
        if (mapped.startsWith('./'))
          return finalizeResolveSync.call(utils, parentPkgPath + mapped.substr(1), parentPath, projectPath, cjsResolve, cache);
        validatePlain(name = mapped);
      }
    }

    // jspm lock file resolution
    const jspmConfig = projectPath !== undefined ? utils.readJspmConfigSync(projectPath, cache) : undefined;
    if (jspmConfig !== undefined) {
      const resolvedPkgName = utils.packageResolveSync(name, parentPkg && parentPkg.name, jspmConfig);
      if (resolvedPkgName) {
        const resolvedPkg = parsePackageName(resolvedPkgName);
        if (!resolvedPkg)
          throwInvalidConfig(`${resolvedPkgName} is an invalid resolution in the jspm config file for ${config.projectPath}.`);
        
        let subPath = resolvedPkg.path;
        const pkgPath = packageToPath(resolvedPkg.name, projectPath);
        const pkgConfig = utils.readPackageConfigSync(pkgPath, cache);

        resolvedPath = pkgPath + subPath;

        if (cjsResolve || pkgConfig !== undefined && pkgConfig.mode === 'cjs')
          return legacyPackageResolve.call(utils, pkgPath + subPath, parentPath, !cjsResolve, env, pkgConfig, cache);
        
        if (pkgConfig !== undefined) {
          if (subPath.length === 0) {
            if (pkgConfig.main === undefined)
              throwInvalidModuleName(`Cannot directly resolve package path ${pkgPath} as it has no package.json "main".`);
            subPath = '/' + pkgConfig.config.main;
            resolvedPath = pkgPath + subPath;
          }
          if (pkgConfig.map !== undefined) {
            const mapped = applyMap('.' + subPath, pkgConfig.map, env);
            if (mapped !== undefined) {
              if (mapped === '@empty')
                return { resolved: '@empty', format: 'builtin' };
              if (mapped === '@notfound')
                throwModuleNotFound(resolved, parentPath);
              resolvedPath = pkgPath + '/' + mapped;
            }
          }
        }
      }
    }

    // builtins
    const builtinResolved = nodeBuiltinResolve(name, env.browser ? browserBuiltinsDir : undefined);
    if (builtinResolved)
      return builtinResolved;

    // node_modules resolution fallback
    if (resolveNodeModules)
      return nodeModulesResolve.call(utils, name, parentPath, !cjsResolve, env, cache);
    else
      throw throwModuleNotFound(name, parentPath);
  }

  return finalizeResolveSync.call(utils, resolvedPath, parentPath, projectPath, cjsResolve, cache);
}

// all builtins get checked for their corresponding ".dew" form
const builtins = {
  '@notfound': true, '@empty': true,
  assert: true, buffer: true, child_process: true, cluster: true, console: true, constants: true, crypto: true,
  dgram: true, dns: true, domain: true, events: true, fs: true, http: true, https: true, module: true, net: true,
  os: true, path: true, process: true, punycode: true, querystring: true, readline: true, repl: true, stream: true,
  string_decoder: true, sys: true, timers: true, tls: true, tty: true, url: true, util: true, vm: true, zlib: true
};

const nodeCoreBrowserUnimplemented = {
  child_process: true, cluster: true, dgram: true, dns: true, fs: true, module: true, net: true, readline: true, repl: true, tls: true
};

function nodeBuiltinResolve (name, browserBuiltinsDir) {
  if (builtins[name]) {
    if (browserBuiltinsDir) {
      if (browserBuiltinsDir[browserBuiltinsDir.length - 1] !== '/')
        browserBuiltinsDir += '/';
      if (nodeCoreBrowserUnimplemented[name])
        return { resolved: browserBuiltinsDir + '@notfound.js', format: 'esm' };
      return { resolved: browserBuiltinsDir + name + '.js', format: 'esm' };
    }
    return { resolved: name, format: 'builtin' };
  }
}

function nodeModulesResolve (name, parentPath, mjs, env, cache) {
  let separatorIndex = parentPath.lastIndexOf('/');
  const rootSeparatorIndex = parentPath.indexOf('/');
  while (separatorIndex > rootSeparatorIndex) {
    const resolved = parentPath.substr(0, separatorIndex) + '/node_modules/' + name;
    {
      let separatorIndex = resolved.lastIndexOf('/');
      while (separatorIndex > rootSeparatorIndex) {
        const packagePath = resolved.substr(0, separatorIndex);
        if (packagePath.endsWith('/node_modules'))
          break;
        const pcfg = this.readPackageConfigSync(packagePath, cache);
        if (pcfg !== undefined)
          return legacyPackageResolve.call(this, resolved, parentPath, mjs, env, packagePath, pcfg, cache);
        separatorIndex = resolved.lastIndexOf('/', separatorIndex - 1);
      }
    }
    try {
      if (this.isDirSync(resolved.substr(0, resolved.lastIndexOf('/')), cache))
        return legacyFinalizeResolve.call(this, resolved, parentPath, mjs, cache);
    }
    catch (e) {
      if (c.code !== 'MODULE_NOT_FOUND')
        throw e;
    }
    separatorIndex = parentPath.lastIndexOf('/', separatorIndex - 1);
  }
  throwModuleNotFound(name, parentPath);
}

function legacyPackageResolve (resolvedPath, parentPath, mjs, env, packagePath, pcfg, cache) {
  if (resolvedPath === packagePath) {
    if (pcfg.main === undefined)
      resolvedPath = legacyDirResolve.call(this, packagePath, parentPath, mjs, cache);
    else
      try {
        resolvedPath = legacyFileResolve.call(this, resolvedPath = packagePath + '/' + pcfg.config.main, parentPath, mjs, cache);
      }
      catch (e) {
        if (e.code !== 'MODULE_NOT_FOUND')
          throw e;
      }
  }
  if (pcfg.map !== undefined && resolvedPath.startsWith(packagePath) &&
                                 (resolvedPath.length === packagePath.length || resolvedPath[packagePath.length] === '/')) {
    const relPath = '.' + resolvedPath.substr(packagePath.length);
    const mapped = applyMap(relPath, pcfg.map, env);
    if (mapped !== undefined) {
      if (mapped === '@empty')
        return { resolved: '@empty', format: 'builtin' };
      if (mapped === '@notfound')
        throwModuleNotFound(resolvedPath, parentPath);
      resolvedPath = packagePath + '/' + mapped;
    }
  }
  return legacyFinalizeResolve.call(this, resolvedPath, parentPath, mjs, cache);
}

function legacyFileResolve (path, parentPath, mjs, cache) {
  if (path[path.length - 1] === '/')
    return path;
  if (this.isFileSync(path, cache))
    return path;
  if (mjs && this.isFileSync(path + '.mjs', cache))
    return path + '.mjs';
  if (this.isFileSync(path + '.js', cache))
    return path + '.js';
  if (this.isFileSync(path + '.json', cache))
    return path + '.json';
  if (this.isFileSync(path + '.node', cache))
    return path + '.node';
  return legacyDirResolve.call(this, path, parentPath, mjs, cache);
}

function legacyDirResolve (path, parentPath, mjs, cache) {
  if (this.isDirSync(path, cache)) {
    if (mjs && this.isFileSync(path + '/index.mjs', cache))
      return path + '/index.mjs';
    if (this.isFileSync(path + '/index.js', cache))
      return path + '/index.js';
    if (this.isFileSync(path + '/index.json', cache))
      return path + '/index.json';
    if (this.isFileSync(path + '/index.node', cache))
      return path + '/index.node';
  }
  throwModuleNotFound(path, parentPath);
}

function legacyFinalizeResolve (resolved, parentPath, mjs, cache) {
  resolved = this.realpathSync(legacyFileResolve.call(this, resolved, parentPath, mjs, cache));
  if (resolved.endsWith('.mjs')) {
    if (!mjs)
      throwInvalidModuleName(`Cannot load ".mjs" module ${resolved} from CommonJS module ${parentPath}.`);
    return { resolved, format: 'esm' };
  }
  if (resolved.endsWith('.js'))
    return { resolved, format: 'cjs' };
  if (resolved.endsWith('.json'))
    return { resolved, format: 'json' };
  if (resolved.endsWith('.node'))
    return { resolved, format: 'addon' };
  return { resolved, format: 'unknown' };
}

const resolveUtils = {
  async getProjectPath (modulePath, cache) {
    let separatorIndex = modulePath.lastIndexOf('/');
    const rootSeparatorIndex = modulePath.indexOf('/');
    do {
      const dir = modulePath.substr(0, separatorIndex);
      if (dir.endsWith('/node_modules'))
        break;

      separatorIndex = modulePath.lastIndexOf('/', separatorIndex - 1);

      // detect jspm_packages/pkg@x dependency path
      if (dir.lastIndexOf('@') > separatorIndex) {
        const jspmPackagesIndex = dir.lastIndexOf('/jspm_packages/');
        const nodeModulesIndex = dir.lastIndexOf('/node_modules/');
        if (jspmPackagesIndex !== -1 && nodeModulesIndex < jspmPackagesIndex) {
          const projectPath = dir.substr(0, jspmPackagesIndex);
          if (parsePackagePath(dir, projectPath))
            return projectPath;
        }
      }

      // otherwise detect jspm project as jspm.lock existing
      if (await this.isFile(dir + '/jspm.lock', cache))
        return dir;
    }
    while (separatorIndex > rootSeparatorIndex);

    // didn't find a jspm project -> take first package boundary rather
    separatorIndex = modulePath.lastIndexOf('/');
    do {
      const dir = modulePath.substr(0, separatorIndex);
      if (dir.endsWith('/node_modules'))
        break;
      if (await this.isFile(dir + '/package.json', cache))
        return dir;
    } while (separatorIndex > rootSeparatorIndex);

    return undefined;
  },
  getProjectPathSync (modulePath, cache) {
    let separatorIndex = modulePath.lastIndexOf('/');
    const rootSeparatorIndex = modulePath.indexOf('/');
    do {
      const dir = modulePath.substr(0, separatorIndex);
      if (dir.endsWith('/node_modules'))
        break;

      separatorIndex = modulePath.lastIndexOf('/', separatorIndex - 1);

      // detect jspm_packages/pkg@x dependency path
      if (dir.lastIndexOf('@') > separatorIndex) {
        const jspmPackagesIndex = dir.lastIndexOf('/jspm_packages/');
        const nodeModulesIndex = dir.lastIndexOf('/node_modules/');
        if (jspmPackagesIndex !== -1 && nodeModulesIndex < jspmPackagesIndex) {
          const projectPath = dir.substr(0, jspmPackagesIndex);
          if (parsePackagePath(dir, projectPath))
            return projectPath;
        }
      }

      // otherwise detect jspm project as jspm.lock existing
      if (this.isFileSync(dir + '/jspm.lock', cache))
        return dir;
    }
    while (separatorIndex > rootSeparatorIndex);

    // didn't find a jspm project -> take first package boundary rather
    separatorIndex = modulePath.lastIndexOf('/');
    do {
      const dir = modulePath.substr(0, separatorIndex);
      if (dir.endsWith('/node_modules'))
        break;
      if (this.isFileSync(dir + '/package.json', cache))
        return dir;
    } while (separatorIndex > rootSeparatorIndex);

    return undefined;
  },
  
  async readJspmConfig (projectPath, cache) {
    if (cache) {
      const cached = cache.jspmConfigCache[projectPath];
      if (cached)
        return cached;
    }

    let source;
    try {
      source = await this.readFile(projectPath + '/jspm.lock');
    }
    catch (e) {
      if (e.code === 'ENOENT')
        return undefined;
      throw e;
    }

    let parsed;
    try {
      parsed = JSON.parse(source);
    }
    catch (e) {
      e.stack = `Unable to parse JSON file ${projectPath}/jspm.lock\n${e.stack}`;
      e.code = 'INVALID_CONFIG';
      throw e;
    }

    if (cache)
      cache.jspmConfigCache[projectPath] = parsed;
    return parsed;
  },

  readJspmConfigSync (projectPath, cache) {
    if (cache) {
      const cached = cache.jspmConfigCache[projectPath];
      if (cached)
        return cached;
    }

    let source;
    try {
      source = this.readFileSync(projectPath + '/jspm.lock');
    }
    catch (e) {
      if (e.code === 'ENOENT')
        return undefined;
      throw e;
    }

    let parsed;
    try {
      parsed = JSON.parse(source);
    }
    catch (e) {
      e.stack = `Unable to parse JSON file ${projectPath}/jspm.lock\n${e.stack}`;
      e.code = 'INVALID_CONFIG';
      throw e;
    }

    if (cache)
      cache.jspmConfigCache[projectPath] = parsed;
    return parsed;
  },

  packageResolve (name, parentPackageName, config) {
    if (parentPackageName) {
      let packageConfig = config.dependencies[parentPackageName];
      if (packageConfig && packageConfig.resolve)
        return applyMap(name, packageConfig.resolve) || applyMap(name, config.resolve);
    }
    return applyMap(name, config.resolve);
  },

  packageResolveSync (name, parentPackageName, config) {
    if (parentPackageName) {
      let packageConfig = config.dependencies[parentPackageName];
      if (packageConfig && packageConfig.resolve)
        return applyMap(name, packageConfig.resolve) || applyMap(name, config.resolve);
    }
    return applyMap(name, config.resolve);
  },

  async readPackageConfig (packagePath, cache) {
    if (cache) {
      const cached = cache.pjsonConfigCache[packagePath];
      if (cached !== undefined) {
        if (cached === null)
          return undefined;
        return cached;
      }
    }

    let source;
    try {
      source = await this.readFile(packagePath + '/package.json');
    }
    catch (e) {
      if (e.code === 'ENOENT' || e.code === 'EISDIR') {
        if (cache) {
          cache.pjsonConfigCache[packagePath] = null;
          cache.isFileCache[packagePath + '/package.json'] = false;
        }
        return undefined;
      }
      throw e;
    }
    if (cache)
      cache.isFileCache[packagePath + '/package.json'] = true;

    let pjson;
    try {
      pjson = JSON.parse(source);
    }
    catch (e) {
      e.stack = `Unable to parse JSON file ${packagePath}/package.json\n${e.stack}`;
      e.code = 'INVALID_CONFIG';
      throw e;
    }

    const processed = processPjsonConfig(pjson);

    if (cache)
      cache.pjsonConfigCache[packagePath] = processed;

    return processed;
  },
  
  readPackageConfigSync (packagePath, cache) {
    if (cache) {
      const cached = cache.pjsonConfigCache[packagePath];
      if (cached !== undefined) {
        if (cached === null)
          return undefined;
        return cached;
      }
    }

    let source;
    try {
      source = this.readFileSync(packagePath + '/package.json');
    }
    catch (e) {
      if (e.code === 'ENOENT' || e.code === 'EISDIR') {
        if (cache) {
          cache.pjsonConfigCache[packagePath] = null;
          cache.isFileCache[packagePath + '/package.json'] = false;
        }
        return undefined;
      }
      throw e;
    }
    if (cache)
      cache.isFileCache[packagePath + '/package.json'] = true;

    let pjson;
    try {
      pjson = JSON.parse(source);
    }
    catch (e) {
      e.stack = `Unable to parse JSON file ${packagePath}/package.json\n${e.stack}`;
      e.code = 'INVALID_CONFIG';
      throw e;
    }

    const processed = processPjsonConfig(pjson);

    if (cache)
      cache.pjsonConfigCache[packagePath] = processed;

    return processed;
  },

  isDirSync (path, cache) {
    const cached = cache && cache.isDirCache[path];
    if (cached !== undefined)
      return cache.isDirCache[path];
    try {
      var stats = fs.statSync(path);
    }
    catch (e) {
      if (e.code === 'ENOENT' || e.code === 'ENOTDIR') {
        if (cache)
          cache.isDirCache[path] = false;
        return false;
      }
      throw e;
    }
    if (cache)
      cache.isDirCache[path] = stats.isDirectory();
    return stats.isDirectory();
  },

  async isFile (path, cache) {
    if (cache) {
      const cached = cache.isFileCache[path];
      if (cached !== undefined)
        return cached;
    }
    try {
      var stats = await new Promise((resolve, reject) => fs.stat(path, (err, stats) => err ? reject(err) : resolve(stats)));
    }
    catch (e) {
      if (e.code === 'ENOENT' || e.code === 'ENOTDIR') {
        if (cache)
          cache.isFileCache[path] = false;
        return false;
      }
      throw e;
    }
    if (cache)
      cache.isFileCache[path] = stats.isFile();
    return stats.isFile();
  },

  isFileSync (path, cache) {
    if (cache) {
      const cached = cache.isFileCache[path];
      if (cached !== undefined)
        return cached;
    }
    try {
      var stats = fs.statSync(path);
    }
    catch (e) {
      if (e.code === 'ENOENT' || e.code === 'ENOTDIR') {
        if (cache)
          cache.isFileCache[path] = false;
        return false;
      }
      throw e;
    }
    if (cache)
      cache.isFileCache[path] = stats.isFile();
    return stats.isFile();
  },

  realpathSync (path) {
    const realpath = fs.realpathSync(path);
    if (realpath.indexOf('\\') !== -1)
      return realpath.replace(winSepRegEx, '/');
    return realpath;
  },

  readFile (path) {
    return new Promise((resolve, reject) => {
      // console.log('READ ' +  path);
      fs.readFile(path, (err, source) => err ? reject(err) : resolve(source.toString()));
    });
  },

  readFileSync (path) {
    return fs.readFileSync(path);
  }
};

resolve.applyMap = applyMap;
resolve.sync = resolveSync;
resolve.packagePath = packagePath;
resolve.packagePathSync = packagePathSync;
resolve.utils = resolveUtils;

module.exports = resolve;

function conditionMap (mapped, env) {
  main: while (typeof mapped !== 'string') {
    for (let c in mapped) {
      if (env[c] === true) {
        mapped = mapped[c];
        continue main;
      }
    }
    return undefined;
  }
  return mapped;
}

function applyMap (name, parentMap, env) {
  let separatorIndex = name.length - 1;
  let exactSeparator = name[separatorIndex] === '/';
  let match = name.substr(0, separatorIndex + 1);
  do {
    if (match === '.')
      break;
    let mapped = parentMap[match];
    if (mapped !== undefined) {
      mapped = conditionMap(mapped, env);
      if (mapped !== undefined) {
        if (match[0] === '.' && mapped[0] === '.' && match[1] === '/' && mapped[1] === '/')
          mapped = mapped.substr(2);
        if (mapped[mapped.length - 1] === '/') {
          if (match[match.length - 1] !== '/')
            throwInvalidConfig(`Invalid map config "${match}" -> "${mapped}" - target cannot have a trailing separator.`);
        }
        else {
          if (match[match.length - 1] === '/')
            mapped += '/';
        }
        return mapped + name.substr(match.length);
      }
    }
    if (exactSeparator) {
      match = name.substr(0, separatorIndex);
    }
    else {
      separatorIndex = name.lastIndexOf('/', separatorIndex - 1);
      match = name.substr(0, separatorIndex + 1);
    }
    exactSeparator = !exactSeparator;
  }
  while (separatorIndex !== -1)
}

resolve.processPjsonConfig = processPjsonConfig;
function processPjsonConfig (pjson) {
  const pcfg = {
    name: typeof pjson.name === 'string' ? pjson.name : undefined,
    main: typeof pjson.main === 'string' ? stripLeadingDotsAndTrailingSlash(pjson.main) : undefined,
    map: typeof pjson.map === 'object' ? pjson.map : undefined,
    mode: pjson.mode === 'esm' || pjson.mode === 'cjs' ? pjson.mode : undefined
  };

  let mainMap = {};

  if (pjson.bin) {
    let bin;
    if (typeof pjson.bin !== 'object') {
      bin = pjson.bin;
    }
    else {
      if (typeof pjson.name === 'string' && pjson.bin[pjson.name] !== undefined)
        bin = pjson.bin[pjson.name];
      else
        bin = Object.keys(pjson.bin)[0];
    }
    if (bin)
      (mainMap = mainMap || {})['bin'] = stripLeadingDotsAndTrailingSlash(pjson['bin']);
  }

  if (typeof pjson['react-native'] === 'string')
    (mainMap = mainMap || {})['react-native'] = stripLeadingDotsAndTrailingSlash(pjson['react-native']);

  if (typeof pjson.electron === 'string')
    (mainMap = mainMap || {}).electron = stripLeadingDotsAndTrailingSlash(pjson.electron);

  if (typeof pjson.browser === 'string')
    (mainMap = mainMap || {}).browser = stripLeadingDotsAndTrailingSlash(pjson.browser);

  if (mainMap) {
    if (!pcfg.map)
      pcfg.map = {};
    if (pcfg.main === undefined) {
      pcfg.main = 'index';
      mainMap.default = '@notfound';
    }
    if (!pcfg.map['./' + pcfg.main])
      pcfg.map['./' + pcfg.main] = mainMap;
  }

  if (typeof pjson.browser === 'object') {
    if (!pcfg.map)
      pcfg.map = {};
    for (let p in pjson.browser) {
      if (pcfg.map[p] !== undefined)
        continue;
      let mapping = pjson.browser[p];
      if (mapping === false)
        mapping = '@empty';
      if (p[0] === '.' && p[1] === '/' && !p.endsWith('.js'))
        p += '.js';
      pcfg.map[p] = {
        browser: mapping
      };
    }
  }

  return pcfg;
}

function stripLeadingDotsAndTrailingSlash (path) {
  if (path.startsWith('./'))
    path = path.substr(2);
  if (path[path.length - 1] === '/')
    path = path.substr(0, path.length - 1);
  return path;
}