'use strict';

const { URL } = require('url');
const path = require('path');
const fs = require('fs');

const isWindows = process.platform === 'win32';
const winSepRegEx = /\\/g;
const winDrivePathRegEx = /^[a-z]:\\/i;
const encodedSepRegEx = /%(5C|2F)/gi;

async function findIndexAsync (promises) {
  for (let i = 0; i < promises.length; i++)
    if (await promises[i] === true)
      return i;
  return -1;
}

function throwModuleNotFound (name, parent) {
  let e = new Error(`Cannot find module ${name}${parent ? ` from ${parent}` : ''}.`);
  e.code = 'MODULE_NOT_FOUND';
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
function parsePackagePath (path, jspmPackagesPath) {
  if (!path.startsWith(jspmPackagesPath.substr(0, jspmPackagesPath.length - 1)) ||
      path[jspmPackagesPath.length - 1] !=='/' && path.length !== jspmPackagesPath.length - 1)
    return;
  let packageMatch = path.substr(jspmPackagesPath.length).match(packagePathRegEx);
  if (packageMatch)
    return { name: packageMatch[1].replace('/', ':'), path: packageMatch[2] };
}
function packageToPath (pkg, jspmPackagesPath) {
  let registryIndex = pkg.name.indexOf(':');
  return jspmPackagesPath + pkg.name.substr(0, registryIndex) + '/' + pkg.name.substr(registryIndex + 1) + pkg.path;
}

function percentDecode (path) {
  if (path.match(encodedSepRegEx))
    throwInvalidModuleName(`${path} cannot be URI decoded as it contains a percent-encoded separator or percent character.`);
  if (path.indexOf('%') === -1)
    return path;
  return decodeURIComponent(path);
}

async function fileResolve (path, cjsResolve, realpath, cache) {
  if (path[path.length - 1] === '/') {
    if (!await this.isDir(path, cache))
      throwModuleNotFound(path);
    return { resolved: path, format: undefined };
  }
  let resolved;
  // for perf, in parallel we check x, x.mjs and x.js
  // (unless already has one of these extensions)
  if (!path.endsWith('.mjs') && !path.endsWith('.js')) {
    switch (await findIndexAsync([
      this.isFile(path, cache),
      cjsResolve === false ? this.isFile(path + '.mjs', cache) : Promise.resolve(false),
      this.isFile(path + '.js', cache)
    ])) {
      case 0:
        resolved = path;
      break;
      case 1:
        resolved = path + '.mjs';
      break;
      case 2:
        resolved = path + '.js';
      break;
      default:
        if (await this.isFile(resolved = path + '.json', cache));
        else if (await this.isFile(resolved = path + '.node', cache));
        else {
          switch (await findIndexAsync([
            cjsResolve === false ? this.isFile(path + '/index.mjs') : Promise.resolve(false),
            this.isFile(path + '/index.js')
          ])) {
            case 0:
              resolved = path + '/index.mjs';
            break;
            case 1:
              resolved = path + '/index.js';
            break;
            default:
              if (await this.isFile(resolved = path + '/index.json', cache));
              else if (await this.isFile(resolved = path + '/index.node', cache));
              else
                throwModuleNotFound(path);  
          }
        }
    }
  }
  else {
    if (await this.isFile(path, cache))
      resolved = path;
    else if (cjsResolve === false && await this.isFile(resolved = path + '.mjs', cache));
    else if (await this.isFile(resolved = path + '.js', cache));
    else if (await this.isFile(resolved = path + '.json', cache));
    else if (await this.isFile(resolved = path + '.node', cache));
    else if (cjsResolve === false && await this.isFile(resolved = path + '/index.mjs', cache));
    else if (await this.isFile(resolved = path + '/index.js', cache));
    else if (await this.isFile(resolved = path + '/index.json', cache));
    else if (await this.isFile(resolved = path + '/index.node', cache));
    else
      throwModuleNotFound(path);
  }
  if (realpath)
    resolved = await this.realpath(resolved, cache);
  if (resolved.endsWith('.mjs')) {
    if (cjsResolve === true)
      throwInvalidModuleName(`Cannot load ES module ${resolved} from CommonJS parent.`);
    return { resolved, format: 'esm' };
  }
  if (resolved.endsWith('.json'))
    return { resolved, format: 'json' };
  if (resolved.endsWith('.node'))
    return { resolved, format: 'addon' };
  if (resolved.endsWith('.js')) {
    if (cjsResolve === false) {
      const pcfg = await this.getPackageConfig(resolved.substr(0, resolved.lastIndexOf('/')), cache);
      if (pcfg !== undefined)
        return { resolved, format: pcfg.config.esm === true ? 'esm' : 'cjs' };
    }
    return { resolved, format: cjsResolve === true ?  'cjs' : 'esm' };
  }
  throwInvalidModuleName(`Cannot load unknown file type ${resolved}`);
}

function fileResolveSync (path, cjsResolve, realpath, cache) {
  if (path[path.length - 1] === '/') {
    if (!this.isDirSync(path, cache))
      throwModuleNotFound(path);
    return { resolved: path, format: undefined };
  }
  let resolved;
  if (this.isFileSync(path, cache))
    resolved = path;
  else if (cjsResolve === false && this.isFileSync(resolved = path + '.mjs', cache));
  else if (this.isFileSync(resolved = path + '.js', cache));
  else if (this.isFileSync(resolved = path + '.json', cache));
  else if (this.isFileSync(resolved = path + '.node', cache));
  else if (cjsResolve === false && this.isFileSync(resolved = path + '/index.mjs', cache));
  else if (this.isFileSync(resolved = path + '/index.js', cache));
  else if (this.isFileSync(resolved = path + '/index.json', cache));
  else if (this.isFileSync(resolved = path + '/index.node', cache));
  else
    throwModuleNotFound(path);
  if (realpath)
    resolved = this.realpathSync(resolved, cache);
  if (resolved.endsWith('.mjs')) {
    if (cjsResolve === true)
      throwInvalidModuleName(`Cannot load ES module ${resolved} from CommonJS parent.`);
    return { resolved, format: 'esm' };
  }
  if (resolved.endsWith('.json'))
    return { resolved, format: 'json' };
  if (resolved.endsWith('.node'))
    return { resolved, format: 'addon' };
  if (resolved.endsWith('.js')) {
    if (cjsResolve === false) {
      const pcfg = this.getPackageConfigSync(resolved.substr(0, resolved.lastIndexOf('/')), cache);
      if (pcfg !== undefined)
        return { resolved, format: pcfg.config.esm === true ? 'esm' : 'cjs' };
    }
    return { resolved, format: cjsResolve === true ?  'cjs' : 'esm' };
  }
  throwInvalidModuleName(`Cannot load unknown file type ${resolved}`);
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
    let nextSegment = { segment: path.substr(segmentIndex), next: undefined, prev: curSegment };
    curSegment.next = nextSegment;
  }

  curSegment = headSegment;
  let outStr = '';
  while (curSegment = curSegment.next)
    outStr += curSegment.segment;

  return outStr;
}

async function nodeModuleResolve (name, parentPath, env, cjsResolve, cache) {
  if (nodeCoreModules[name])
    return { resolved: name, format: 'builtin' };
  let separatorIndex = parentPath.lastIndexOf('/');
  let rootSeparatorIndex = parentPath.indexOf('/');
  while (separatorIndex > rootSeparatorIndex) {
    let resolved = parentPath.substr(0, separatorIndex) + '/node_modules/' + name;
    let pkgNameLength = name[0] !== '@' ? name.indexOf('/') : name.indexOf('/', name.indexOf('/') + 1);
    if (await this.isDir(resolved.substr(0, resolved.length - name.length + pkgNameLength), cache)) {
      if (name[name.length - 1] !== '/') {
        let pkgConfig = await this.getPackageConfig(resolved, cache);
        if (pkgConfig !== undefined) {
          if (pkgConfig.config.mains !== undefined && resolved.length === pkgConfig.path.length - 1 &&
              resolved === pkgConfig.path.substr(0, pkgConfig.path.length - 1)) {
            const mapped = applyMain(pkgConfig.config.mains, env);
            if (mapped !== undefined) {
              if (mapped === '@empty')
                return { resolved: undefined, format: undefined };
              resolved = pkgConfig.path + mapped;
            }
          }
          else if (pkgConfig.config.map !== undefined &&
              resolved.length >= pkgConfig.path.length && resolved.substr(0, pkgConfig.path.length) === pkgConfig.path) {
            const relPath = '.' + resolved.substr(pkgConfig.path.length);
            const mapped = applyMap(relPath, pkgConfig.config.map, env);
            if (mapped !== undefined) {
              if (mapped === '@empty')
                return { resolved: undefined, format: undefined };
              resolved = pkgConfig.path + mapped;
            }
          }
        }
      }
      try {
        return await fileResolve.call(this, resolved, cjsResolve, true, cache);
      }
      catch (e) {
        if (e.code !== 'MODULE_NOT_FOUND')
          throw e;
      }
    }
    separatorIndex = resolved.lastIndexOf('/', separatorIndex - 1);
  }
  throwModuleNotFound(name, parentPath);
}

function nodeModuleResolveSync (name, parentPath, env, cjsResolve, cache) {
  if (nodeCoreModules[name])
    return { resolved: name, format: 'builtin' };
  let separatorIndex = parentPath.lastIndexOf('/');
  let rootSeparatorIndex = parentPath.indexOf('/');
  while (separatorIndex > rootSeparatorIndex) {
    let resolved = parentPath.substr(0, separatorIndex) + '/node_modules/' + name;
    let pkgNameLength = name[0] !== '@' ? name.indexOf('/') : name.indexOf('/', name.indexOf('/') + 1);
    if (this.isDirSync(resolved.substr(0, resolved.length - name.length + pkgNameLength), cache)) {
      if (name[name.length - 1] !== '/') {
        let pkgConfig = this.getPackageConfigSync(resolved, cache);
        if (pkgConfig !== undefined) {
          if (pkgConfig.config.mains !== undefined && resolved.length === pkgConfig.path.length - 1 &&
              resolved === pkgConfig.path.substr(0, pkgConfig.path.length - 1)) {
            const mapped = applyMain(pkgConfig.config.mains, env);
            if (mapped !== undefined) {
              if (mapped === '@empty')
                return { resolved: undefined, format: undefined };
              resolved = pkgConfig.path + mapped;
            }
          }
          else if (pkgConfig.config.map !== undefined &&
              resolved.length >= pkgConfig.path.length && resolved.substr(0, pkgConfig.path.length) === pkgConfig.path) {
            const relPath = '.' + resolved.substr(pkgConfig.path.length);
            const mapped = applyMap(relPath, pkgConfig.config.map, env);
            if (mapped !== undefined) {
              if (mapped === '@empty')
                return { resolved: undefined, format: undefined };
              resolved = pkgConfig.path + mapped;
            }
          }
        }
      }
      try {
        return fileResolveSync.call(this, resolved, cjsResolve, true, cache);
      }
      catch (e) {
        if (e.code !== 'MODULE_NOT_FOUND')
          throw e;
      }
    }
    separatorIndex = resolved.lastIndexOf('/', separatorIndex - 1);
  }
  throwModuleNotFound(name, parentPath);
}

function setDefaultEnv (env, defaultEnv) {
  for (let condition in defaultEnv) {
    if (typeof env[condition] !== 'boolean' && typeof defaultEnv[condition] === 'boolean')
      env[condition] = defaultEnv[condition];
  }
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
  return env;
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

const nodeCoreModules = {
  assert: true, buffer: true, child_process: true, cluster: true, console: true, constants: true, crypto: true,
  dgram: true, dns: true, domain: true, events: true, fs: true, http: true, https: true, module: true, net: true,
  os: true, path: true, process: true, punycode: true, querystring: true, readline: true, repl: true, stream: true,
  string_decoder: true, sys: true, timers: true, tls: true, tty: true, url: true, util: true, vm: true, zlib: true
};

async function resolve (name, parentPath = process.cwd() + '/', {
  env,
  cache,
  utils = resolveUtils,
  cjsResolve = false
} = {}) {
  if (parentPath.indexOf('\\') !== -1)
    parentPath = parentPath.replace(winSepRegEx, '/');
  if (cache) {
    if (cache.jspmConfigCache === undefined)
      cache.jspmConfigCache = {};
    if (cache.pjsonConfigCache === undefined)
      cache.pjsonConfigCache = {};
    if (cache.isFileCache === undefined)
      cache.isFileCache = {};
    if (cache.isDirCache === undefined)
      cache.isDirCache = {};
  }

  env = env ? setDefaultEnv(env, defaultEnv) : defaultEnv;

  let resolvedPath;

  // Absolute path
  if (name[0] === '/') {
    name = name.replace(winSepRegEx, '/');
    if (name[1] === '/') {
      if (name[2] === '/')
        throwInvalidModuleName(`${name} is not a valid module name.`);
      else
        resolvedPath = resolvePath(percentDecode(name.substr(1 + isWindows)));
    }
    else {
      resolvedPath = resolvePath(percentDecode(isWindows ? name.substr(1) : name));
    }
  }
  // Relative path
  else if (name[0] === '.' && (name[1] === '/' && (name = name.substr(2), true) || name[1] === '.' && name[2] === '/')) {
    name = name.replace(winSepRegEx, '/');
    resolvedPath = resolvePath(parentPath.substr(0, parentPath.lastIndexOf('/') + 1) + percentDecode(name));
  }
  // Exact package request or URL request
  else if (name.indexOf(':') !== -1) {
    const resolvedPkg = parsePackageName(name);
    if (resolvedPkg) {
      if (name.indexOf('\\') !== -1)
        throwInvalidModuleName(`Package request ${name} must use "/" as a separator not "\".`);
      const config = await utils.getJspmConfig(parentPath, cache);
      if (!config)
        throwInvalidModuleName(`Cannot import jspm package ${name} when resolver is not initialized to a jspm project.`);
      resolvedPath = packageToPath(resolvedPkg, config.jspmPackagesPath);
    }
    // URL
    else {
      const url = tryParseUrl(name);
      if (url.protocol === 'file:')
        resolvedPath = percentDecode(isWindows ? url.pathname.substr(1) : url.pathname);
      else
        throwInvalidModuleName(`${name} is not a valid module name. It must be a file:/// URL or an absolute URL.`);
    }
  }
  // Plain name resolution
  else {
    const config = await utils.getJspmConfig(parentPath, cache);

    if (name.indexOf('\\') !== -1)
      throwInvalidModuleName(`Package request ${name} must use "/" as a separator not "\".`);
    const parentPkgConfig = await utils.getPackageConfig(parentPath.substr(0, parentPath.lastIndexOf('/')), cache);
    if (parentPkgConfig && parentPkgConfig.config.map) {
      const mapped = applyMap(name, parentPkgConfig.config.map, env);
      if (mapped !== undefined) {
        if (mapped[0] === '.'  && mapped[1] === '/') {
          if (config !== undefined && parentPkgConfig.path === config.basePath) {
            resolvedPath = (env.dev ? config.localPackagePathDev : config.localPackagePathProduction) + mapped.substr(2);
          }
          else {
            resolvedPath = parentPkgConfig.path + mapped.substr(2);
          }
          return await fileResolve.call(utils, resolvedPath, cjsResolve, false, cache);
        }
        else {
          name = mapped;
        }
      }
    }
    let parentPkgName = undefined, resolvedPkgName = undefined;
    if (config !== undefined) {
      const parentPkg = parsePackagePath(parentPath, config.jspmPackagesPath);
      if (parentPkg !== undefined)
        parentPkgName = parentPkg.name;
      resolvedPkgName = await utils.packageResolve(name, parentPkgName, config);
    }

    if (resolvedPkgName) {
      const resolvedPkg = parsePackageName(resolvedPkgName);
      if (!resolvedPkg)
        throwInvalidConfig(`${resolvedPkgName} is an invalid resolution in the jspm config file for ${config.basePath}.`);
      resolvedPath = packageToPath(resolvedPkg, config.jspmPackagesPath);
    }
    else {
      if (name === '@empty')
        return { resolved: undefined, format: undefined };
      return await nodeModuleResolve.call(utils, name, parentPath, env, cache);
    }
  }

  const config = await utils.getJspmConfig(resolvedPath, cache);
  const realpath = config === undefined && resolvedPath.indexOf('/node_modules/') !== -1;

  if (resolvedPath[resolvedPath.length - 1] === '/')
    return await fileResolve.call(utils, resolvedPath, cjsResolve, realpath, cache);
  
  const pkgConfig = await utils.getPackageConfig(resolvedPath, cache);
  if (pkgConfig !== undefined) {
    if (config !== undefined && pkgConfig.path === config.basePath) {
      if (resolvedPath.length === config.jspmPackagesPath.length - 1 && resolvedPath === config.jspmPackagesPath.substr(0, config.jspmPackagesPath.length - 1) ||
          resolvedPath.length >= config.jspmPackagesPath.length && resolvedPath.substr(0, config.jspmPackagesPath.length) === config.jspmPackagesPath)
        return await fileResolve.call(utils, resolvedPath, cjsResolve, realpath, cache);
      pkgConfig.path = env.dev ? config.localPackagePathDev : config.localPackagePathProduction;
    }
    
    if (pkgConfig.config.mains !== undefined && resolvedPath.length === pkgConfig.path.length - 1 &&
        resolvedPath === pkgConfig.path.substr(0, pkgConfig.path.length - 1)) {
      const mapped = applyMain(pkgConfig.config.mains, env);
      if (mapped !== undefined) {
        if (mapped === '@empty')
          return { resolved: undefined, format: undefined };
        resolvedPath = pkgConfig.path + mapped;
      }
    }
    else if (pkgConfig.config.map !== undefined &&
        resolvedPath.length >= pkgConfig.path.length && resolvedPath.substr(0, pkgConfig.path.length) === pkgConfig.path) {
      const relPath = '.' + resolvedPath.substr(pkgConfig.path.length - 1);
      const mapped = applyMap(relPath, pkgConfig.config.map, env);
      if (mapped !== undefined) {
        if (mapped === '@empty')
          return { resolved: undefined, format: undefined };
        resolvedPath = pkgConfig.path + mapped;
      }
    }
  }

  return await fileResolve.call(utils, resolvedPath, cjsResolve, realpath, cache);
}

function resolveSync (name, parentPath = process.cwd() + '/', {
  env,
  cache,
  utils = resolveUtils,
  cjsResolve = false
} = {}) {
  if (parentPath.indexOf('\\') !== -1)
    parentPath = parentPath.replace(winSepRegEx, '/');
  if (cache) {
    if (cache.jspmConfigCache === undefined)
      cache.jspmConfigCache = {};
    if (cache.pjsonConfigCache === undefined)
      cache.pjsonConfigCache = {};
    if (cache.isFileCache === undefined)
      cache.isFileCache = {};
    if (cache.isDirCache === undefined)
      cache.isDirCache = {};
  }

  env = env ? setDefaultEnv(env, defaultEnv) : defaultEnv;

  let resolvedPath;

  // Absolute path
  if (name[0] === '/') {
    name = name.replace(winSepRegEx, '/');
    if (name[1] === '/') {
      if (name[2] === '/')
        throwInvalidModuleName(`${name} is not a valid module name.`);
      else
        resolvedPath = resolvePath(percentDecode(name.substr(1 + isWindows)));
    }
    else {
      resolvedPath = resolvePath(percentDecode(isWindows ? name.substr(1) : name));
    }
  }
  // Relative path
  else if (name[0] === '.' && (name[1] === '/' && (name = name.substr(2), true) || name[1] === '.' && name[2] === '/')) {
    name = name.replace(winSepRegEx, '/');
    resolvedPath = resolvePath(parentPath.substr(0, parentPath.lastIndexOf('/') + 1) + percentDecode(name));
  }
  // Exact package request or URL request
  else if (name.indexOf(':') !== -1) {
    const resolvedPkg = parsePackageName(name);
    if (resolvedPkg) {
      if (name.indexOf('\\') !== -1)
        throwInvalidModuleName(`Package request ${name} must use "/" as a separator not "\".`);
      const config = utils.getJspmConfigSync(parentPath, cache);
      if (!config)
        throwInvalidModuleName(`Cannot import jspm package ${name} when resolver is not initialized to a jspm project.`);
      resolvedPath = packageToPath(resolvedPkg, config.jspmPackagesPath);
    }
    // URL
    else {
      const url = tryParseUrl(name);
      if (url.protocol === 'file:')
        resolvedPath = percentDecode(isWindows ? url.pathname.substr(1) : url.pathname);
      else
        throwInvalidModuleName(`${name} is not a valid module name. It must be a file:/// URL or an absolute URL.`);
    }
  }
  // Plain name resolution
  else {
    const config = utils.getJspmConfigSync(parentPath, cache);

    if (name.indexOf('\\') !== -1)
      throwInvalidModuleName(`Package request ${name} must use "/" as a separator not "\".`);
    const parentPkgConfig = utils.getPackageConfigSync(parentPath.substr(0, parentPath.lastIndexOf('/')), cache);
    if (parentPkgConfig && parentPkgConfig.config.map) {
      const mapped = applyMap(name, parentPkgConfig.config.map, env);
      if (mapped !== undefined) {
        if (mapped[0] === '.'  && mapped[1] === '/') {
          if (config !== undefined && parentPkgConfig.path === config.basePath) {
            resolvedPath = (env.dev ? config.localPackagePathDev : config.localPackagePathProduction) + mapped.substr(2);
          }
          else {
            resolvedPath = parentPkgConfig.path + mapped.substr(2);
          }
          return fileResolveSync.call(utils, resolvedPath, cjsResolve, false, cache);
        }
        else {
          name = mapped;
        }
      }
    }
    let parentPkgName = undefined, resolvedPkgName = undefined;
    if (config !== undefined) {
      const parentPkg = parsePackagePath(parentPath, config.jspmPackagesPath);
      if (parentPkg !== undefined)
        parentPkgName = parentPkg.name;
      resolvedPkgName = utils.packageResolveSync(name, parentPkgName, config);
    }

    if (resolvedPkgName) {
      const resolvedPkg = parsePackageName(resolvedPkgName);
      if (!resolvedPkg)
        throwInvalidConfig(`${resolvedPkgName} is an invalid resolution in the jspm config file for ${config.basePath}.`);
      resolvedPath = packageToPath(resolvedPkg, config.jspmPackagesPath);
    }
    else {
      if (name === '@empty')
        return { resolved: undefined, format: undefined };
      return nodeModuleResolveSync.call(utils, name, parentPath, env, cache);
    }
  }

  const config = utils.getJspmConfigSync(resolvedPath, cache);
  const realpath = config === undefined && resolvedPath.indexOf('/node_modules/') !== -1;

  if (resolvedPath[resolvedPath.length - 1] === '/')
    return fileResolveSync.call(utils, resolvedPath, cjsResolve, realpath, cache);

  const pkgConfig = utils.getPackageConfigSync(resolvedPath, cache);
  if (pkgConfig !== undefined) {
    if (config !== undefined && pkgConfig.path === config.basePath) {
      if (resolvedPath.length === config.jspmPackagesPath.length - 1 && resolvedPath === config.jspmPackagesPath.substr(0, config.jspmPackagesPath.length - 1) ||
          resolvedPath.length >= config.jspmPackagesPath.length && resolvedPath.substr(0, config.jspmPackagesPath.length) === config.jspmPackagesPath)
        return fileResolveSync.call(utils, resolvedPath, cjsResolve, realpath, cache);
      pkgConfig.path = env.dev ? config.localPackagePathDev : config.localPackagePathProduction;
    }
    
    if (pkgConfig.config.mains !== undefined && resolvedPath.length === pkgConfig.path.length - 1 &&
        resolvedPath === pkgConfig.path.substr(0, pkgConfig.path.length - 1)) {
      const mapped = applyMain(pkgConfig.config.mains, env);
      if (mapped !== undefined) {
        if (mapped === '@empty')
          return { resolved: undefined, format: undefined };
        resolvedPath = pkgConfig.path + mapped;
      }
    }
    else if (pkgConfig.config.map !== undefined &&
        resolvedPath.length >= pkgConfig.path.length && resolvedPath.substr(0, pkgConfig.path.length) === pkgConfig.path) {
      const relPath = '.' + resolvedPath.substr(pkgConfig.path.length - 1);
      const mapped = applyMap(relPath, pkgConfig.config.map, env);
      if (mapped !== undefined) {
        if (mapped === '@empty')
          return { resolved: undefined, format: undefined };
        resolvedPath = pkgConfig.path + mapped;
      }
    }
  }

  return fileResolveSync.call(utils, resolvedPath, cjsResolve, realpath, cache);
}

const resolveUtils = {
  async getJspmConfig (parentPath, cache) {
    let innerConfig;
    parentPath = parentPath.substr(0, parentPath.lastIndexOf('/'));
    let separatorIndex = parentPath.length;
    let rootSeparatorIndex = parentPath.indexOf('/');
    do {
      let dir = parentPath.substr(0, separatorIndex);
      if (dir.endsWith('/' + 'node_modules'))
        return;
      
      if (cache && dir in cache.jspmConfigCache) {
        let config = cache.jspmConfigCache[dir];
        if (config !== null) {
          if (innerConfig !== undefined) {
            const nestedPkg = parsePackagePath(innerConfig.basePath, config.jspmPackagesPath);
            if (!nestedPkg || nestedPkg.path.length > 1)
              return innerConfig;
            return config;
          }
          innerConfig = config;
        }
      }
      else if (!cache || cache.pjsonConfigCache[dir] !== null) {
        let pjson;
        try {
          pjson = JSON.parse(await this.readFile(path.join(dir, 'package.json')));

          if (cache)
            cache.pjsonConfigCache[dir] = processPjsonConfig(pjson);
        }
        catch (e) {
          if (e instanceof SyntaxError) {
            e.code = 'INVALID_CONFIG';
            throw e;
          }
          if (!e || (e.code !== 'ENOENT' && e.code !== 'ENOTDIR'))
            throw e;
          
          if (cache)
            cache.jspmConfigCache[dir] = cache.pjsonConfigCache[dir] = null;
        }

        if (pjson) {
          let jspmPath;
          if (pjson.configFiles && pjson.configFiles.jspm && !pjson.configFiles.jspm.startsWith('..'))
            jspmPath = path.resolve(dir, pjson.configFiles.jspm);
          else
            jspmPath = path.join(dir, 'jspm.json');

          let jspmJson;
          try {
            jspmJson = JSON.parse(await this.readFile(jspmPath));
          }
          catch (e) {
            if (e instanceof SyntaxError) {
              e.code = 'INVALID_CONFIG';
              throw e;
            }
            if (!e || (e.code !== 'ENOENT' && e.code !== 'ENOTDIR'))
              throw e;
            
            if (cache)
              cache.jspmConfigCache[dir] = null;
          }

          if (jspmJson !== undefined) {
            let dirSep = (isWindows ? dir.replace(winSepRegEx, '/') : dir) + '/';
            let config = {
              basePath: dirSep,
              localPackagePathDev: dirSep,
              localPackagePathProduction: dirSep,
              jspmPackagesPath: dirSep + 'jspm_packages/',
              resolve: jspmJson.resolve || {},
              dependencies: jspmJson.dependencies || {}
            };

            if (pjson && typeof pjson.directories === 'object') {
              if (typeof pjson.directories.packages === 'string' && !pjson.directories.packages.startsWith('..')) {
                config.jspmPackagesPath = path.resolve(dir, pjson.directories.packages) + '/';
                if (isWindows)
                  config.jspmPackagesPath = config.jspmPackagesPath.replace(winSepRegEx, '/');
              }
              if (typeof pjson.directories.lib === 'string' && !pjson.directories.lib.startsWith('..')) {
                config.localPackagePathDev = path.resolve(dir, pjson.directories.lib) + '/';
                if (isWindows)
                  config.localPackagePathDev = config.localPackagePathDev.replace(winSepRegEx, '/');
                config.localPackagePathProduction = config.localPackagePathDev;
              }
              if (typeof pjson.directories.dist === 'string' && !pjson.directories.dist.startsWith('..')) {
                config.localPackagePathProduction = path.resolve(dir, pjson.directories.dist) + '/';
                if (isWindows)
                  config.localPackagePathProduction = config.localPackagePathProduction.replace(winSepRegEx, '/');
              }
            }

            if (cache)
              cache.jspmConfigCache[dir] = config;

            if (innerConfig !== undefined) {
              const nestedPkg = parsePackagePath(innerConfig.basePath, config.jspmPackagesPath);
              if (!nestedPkg || nestedPkg.path.length > 1)
                return innerConfig;
              return config;
            }
            innerConfig = config;
          }
        }
      }

      separatorIndex = parentPath.lastIndexOf('/', separatorIndex - 1);
    }
    while (separatorIndex > rootSeparatorIndex)

    return innerConfig;
  },
  getJspmConfigSync (parentPath, cache) {
    let innerConfig;
    parentPath = parentPath.substr(0, parentPath.lastIndexOf('/'));
    let separatorIndex = parentPath.length;
    let rootSeparatorIndex = parentPath.indexOf('/');
    do {
      let dir = parentPath.substr(0, separatorIndex);
      if (dir.endsWith('/' + 'node_modules'))
        return;
      
      if (cache && dir in cache.jspmConfigCache) {
        let config = cache.jspmConfigCache[dir];
        if (config !== null) {
          if (innerConfig !== undefined) {
            const nestedPkg = parsePackagePath(innerConfig.basePath, config.jspmPackagesPath);
            if (!nestedPkg || nestedPkg.path.length > 1)
              return innerConfig;
            return config;
          }
          innerConfig = config;
        }
      }
      else if (!cache || cache.pjsonConfigCache[dir] !== null) {
        let pjson;
        try {
          pjson = JSON.parse(this.readFileSync(path.join(dir, 'package.json')));

          if (cache)
            cache.pjsonConfigCache[dir] = processPjsonConfig(pjson);
        }
        catch (e) {
          if (e instanceof SyntaxError) {
            e.code = 'INVALID_CONFIG';
            throw e;
          }
          if (!e || (e.code !== 'ENOENT' && e.code !== 'ENOTDIR'))
            throw e;
          
          if (cache)
            cache.jspmConfigCache[dir] = cache.pjsonConfigCache[dir] = null;
        }

        if (pjson) {
          let jspmPath;
          if (pjson.configFiles && pjson.configFiles.jspm && !pjson.configFiles.jspm.startsWith('..'))
            jspmPath = path.resolve(dir, pjson.configFiles.jspm);
          else
            jspmPath = path.join(dir, 'jspm.json');

          let jspmJson;
          try {
            jspmJson = JSON.parse(this.readFileSync(jspmPath));
          }
          catch (e) {
            if (e instanceof SyntaxError) {
              e.code = 'INVALID_CONFIG';
              throw e;
            }
            if (!e || (e.code !== 'ENOENT' && e.code !== 'ENOTDIR'))
              throw e;
            
            if (cache)
              cache.jspmConfigCache[dir] = null;
          }

          if (jspmJson !== undefined) {
            let dirSep = (isWindows ? dir.replace(winSepRegEx, '/') : dir) + '/';
            let config = {
              basePath: dirSep,
              localPackagePathDev: dirSep,
              localPackagePathProduction: dirSep,
              jspmPackagesPath: dirSep + 'jspm_packages/',
              resolve: jspmJson.resolve || {},
              dependencies: jspmJson.dependencies || {}
            };

            if (pjson && typeof pjson.directories === 'object') {
              if (typeof pjson.directories.packages === 'string' && !pjson.directories.packages.startsWith('..')) {
                config.jspmPackagesPath = path.resolve(dir, pjson.directories.packages) + '/';
                if (isWindows)
                  config.jspmPackagesPath = config.jspmPackagesPath.replace(winSepRegEx, '/');
              }
              if (typeof pjson.directories.lib === 'string' && !pjson.directories.lib.startsWith('..')) {
                config.localPackagePathDev = path.resolve(dir, pjson.directories.lib) + '/';
                if (isWindows)
                  config.localPackagePathDev = config.localPackagePathDev.replace(winSepRegEx, '/');
                config.localPackagePathProduction = config.localPackagePathDev;
              }
              if (typeof pjson.directories.dist === 'string' && !pjson.directories.dist.startsWith('..')) {
                config.localPackagePathProduction = path.resolve(dir, pjson.directories.dist) + '/';
                if (isWindows)
                  config.localPackagePathProduction = config.localPackagePathProduction.replace(winSepRegEx, '/');
              }
            }

            if (cache)
              cache.jspmConfigCache[dir] = config;

            if (innerConfig !== undefined) {
              const nestedPkg = parsePackagePath(innerConfig.basePath, config.jspmPackagesPath);
              if (!nestedPkg || nestedPkg.path.length > 1)
                return innerConfig;
              return config;
            }
            innerConfig = config;
          }
        }
      }

      separatorIndex = parentPath.lastIndexOf('/', separatorIndex - 1);
    }
    while (separatorIndex > rootSeparatorIndex)

    return innerConfig;
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
        mapped = applyMap(name, packageConfig.resolve) || applyMap(name, config.resolve);
    }
    return applyMap(name, config.resolve);
  },

  async getPackageConfig (resolved, cache) {
    let separatorIndex = resolved.length;
    let rootSeparatorIndex = resolved.indexOf('/');
    while (separatorIndex > rootSeparatorIndex) {
      let parentPath = resolved.substr(0, separatorIndex);
      if (parentPath.endsWith('/node_modules/'))
        break;
      let pcfg = null;
      if (cache && parentPath in cache.pjsonConfigCache) {
        pcfg = cache.pjsonConfigCache[parentPath];
      }
      else {
        try {
          let pjson = JSON.parse(await this.readFile(parentPath + '/package.json'));
          pcfg = processPjsonConfig(pjson);
        }
        catch (e) {
          if (!e || (e.code !== 'ENOENT' && e.code !== 'ENOTDIR'))
            throw e;
        }
        if (cache)
          cache.pjsonConfigCache[parentPath] = pcfg;
      }
      if (pcfg !== null)
        return { path: parentPath + '/', config: pcfg };
      separatorIndex = resolved.lastIndexOf('/', separatorIndex - 1);
    }
  },
  
  getPackageConfigSync (resolved, cache) {
    let separatorIndex = resolved.length;
    let rootSeparatorIndex = resolved.indexOf('/');
    while (separatorIndex > rootSeparatorIndex) {
      let parentPath = resolved.substr(0, separatorIndex);
      if (parentPath.endsWith('/node_modules/'))
        break;
      let pcfg = null;
      if (cache && parentPath in cache.pjsonConfigCache) {
        pcfg = cache.pjsonConfigCache[parentPath];
      }
      else {
        try {
          let pjson = JSON.parse(this.readFileSync(parentPath + '/package.json'));
          pcfg = processPjsonConfig(pjson);
        }
        catch (e) {
          if (!e || (e.code !== 'ENOENT' && e.code !== 'ENOTDIR'))
            throw e;
        }
        if (cache)
          cache.pjsonConfigCache[parentPath] = pcfg;
      }
      if (pcfg !== null)
        return { path: parentPath + '/', config: pcfg };
      separatorIndex = resolved.lastIndexOf('/', separatorIndex - 1);
    }
  },

  // possible optimization approach for node_modules lookup
  async isDir (path, cache) {
    const cached = cache && cache.isDirCache[path];
    if (cached !== undefined)
      return cache.isDirCache[path];
    return new Promise((resolve, reject) => {
      // console.log('STATDIR ' + path);
      fs.stat(path, (err, stats) => {
        if (err) {
          if (err.code === 'ENOENT' || err.code ===  'ENOTDIR') {
            if (cache)
              cache.isDirCache[path] = false;
            resolve(false);
          }
          else {
            reject(err);
          }
        }
        else {
          if (cache)
            cache.isDirCache[path] = stats.isDirectory();
          resolve(stats.isDirectory());
        }
      });
    });
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
    const cached = cache && cache.isFileCache[path];
    if (cached !== undefined)
      return cached;
    return new Promise((resolve, reject) => {
      // console.log('STATFILE ' + path);
      fs.stat(path, (err, stats) => {
        if (err) {
          if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
            if (cache)
              cache.isFileCache[path] = false;
            resolve(false);
          }
          else {
            reject(err);
          }
        }
        else {
          if (cache)
            cache.isFileCache[path] = stats.isFile();
          resolve(stats.isFile());
        }
      });
    });
  },

  isFileSync (path, cache) {
    const cached = cache && cache.isFileCache[path];
    if (cached !== undefined)
      return cached;
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

  async realpath (path) {
    return new Promise((resolve, reject) => {
      // console.log('REALPATH ' + path);
      fs.realpath(path, (err, realpath) => {
        if (err)
          reject(err);
        else if (realpath.indexOf('\\') !== -1)
          resolve(realpath.replace(winSepRegEx, '/'));
        else
          resolve(realpath);
      });
    });
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
}

resolve.applyMap = applyMap;
resolve.sync = resolveSync;
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
  let mapped;
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
        if (mapped === '@empty')
          return mapped;
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

function applyMain (mainMap, env) {
  let mapped = conditionMap(mainMap, env);
  if (mapped === '@empty')
    return mapped;
  if (mapped[0] === '.' && mapped[1] === '/')
    return mapped.substr(2);
  return mapped;
}

resolve.processPjsonConfig = processPjsonConfig;
function processPjsonConfig (pjson) {
  const pcfg = {
    mains: typeof pjson.mains === 'object' ? pjson.mains : undefined,
    map: typeof pjson.map === 'object' ? pjson.map : undefined,
    esm: pjson.esm === true ? true : false
  };

  if (typeof pjson['react-native'] === 'string') {
    const mapped = pjson['react-native'].startsWith('./') ? pjson['react-native'].substr(2) : pjson['react-native'];
    pcfg.mains = { 'react-native': mapped };
  }

  if (typeof pjson.electron === 'string') {
    const mapped = pjson.electron.startsWith('./') ? pjson.electron.substr(2) : pjson.electron;
    if (!pcfg.mains)
      pcfg.mains = { electron: mapped };
    else
      pcfg.mains.electron = mapped;
  }

  if (pjson.browser) {
    if (typeof pjson.browser === 'string') {
      const mapped = pjson.browser.startsWith('./') ? pjson.browser.substr(2) : pjson.browser;
      if (!pcfg.mains)
        pcfg.mains = { browser: mapped };
      else
        pcfg.mains.browser = mapped;
    }
    else if (typeof pjson.browser === 'object') {
      if (!pcfg.map)
        pcfg.map = {};
      for (let p in pjson.browser) {
        if (pcfg.map[p] !== undefined)
          continue;
        let mapping = pjson.browser[p];
        if (mapping === false)
          mapping = '@empty';
        pcfg.map[p] = {
          browser: mapping
        };
      }
    }
  }

  if (pjson.main) {
    const mapped = pjson.main.startsWith('./') ? pjson.main.substr(2) : pjson.main;
    if (!pcfg.mains)
      pcfg.mains = { default: mapped };
    else
      pcfg.mains.default = mapped;
  }

  return pcfg;
}
