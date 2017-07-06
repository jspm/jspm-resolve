'use strict';

const { URL } = require('url');
const path = require('path');
const fs = require('fs');
const browserResolve = require('browser-resolve');
const nodeResolve = require('resolve');

const winSepRegEx = /\\/g;
const sepRegEx = /\//g;
const encodedSepRegEx = /%(5C|2F)/gi;
const sep = path.sep;

function throwModuleNotFound (name) {
  let e = new Error(`Module ${name} not found.`);
  e.code = 'MODULE_NOT_FOUND';
  throw e;
}

function throwInvalidModuleName (name) {
  let e = new Error(`${name} is an invalid module name.`);
  e.code = 'INVALID_MODULE_NAME';
  throw e;
}

function throwInvalidConfig (msg) {
  let e = new Error(msg);
  e.code = 'INVALID_CONFIG';
  throw e;
}

const packageRegEx = /^([a-z]+:[@\-_\.a-zA-Z\d][-_\.a-zA-Z\d]*(?:\/[-_\.a-zA-Z\d]+)*@[^\/\\%]+)(\/[\s\S]*|$)/;
function parsePackageName (name) {
  let packageMatch = name.match(packageRegEx);
  if (packageMatch)
    return {
      name: packageMatch[1],
      path: packageMatch[2]
    };
}
function parsePackagePath (path, jspmPackagesPath, isWindows) {
  if (!path.startsWith(jspmPackagesPath.substr(0, jspmPackagesPath.length - 1)) ||
      path[jspmPackagesPath.length - 1] !== sep && path.length !== jspmPackagesPath.length - 1)
    return;
  let relPackagePath = path.substr(jspmPackagesPath.length).replace(sep, ':');
  if (isWindows)
    relPackagePath = relPackagePath.replace(winSepRegEx, '/');
  let packageMatch = relPackagePath.match(packageRegEx);
  if (packageMatch)
    return {
      name: packageMatch[1],
      path: packageMatch[2]
    };
}
function packageToPath (pkg, jspmPackagesPath, isWindows) {
  let registryIndex = pkg.name.indexOf(':');
  return jspmPackagesPath + pkg.name.substr(0, registryIndex) + sep +
      (isWindows ? pkg.name.substr(registryIndex + 1).replace(sepRegEx, sep) : pkg.name.substr(registryIndex + 1)) +
      (isWindows ? pkg.path.replace(sepRegEx, sep) : pkg.path);
}

async function fileResolve (path, isWindows, isFile) {
  if (isWindows)
    path = path.replace(sepRegEx, sep);
  if (path[path.length - 1] === sep)
    return path;
  if (await isFile(path))
    return path;
  if (await isFile(path + '.js'))
    return path + '.js';
  if (await isFile(path + '.json'))
    return path + '.json';
  if (await isFile(path + '.node'))
    return path + '.node';
  if (await isFile(path + sep + 'index.js'))
    return path + sep + 'index.js';
  if (await isFile(path + sep + 'index.json'))
    return path + sep + 'index.json';
  if (await isFile(path + sep + 'index.node'))
    return path + sep + 'index.node';
  throwModuleNotFound(path);
}

function fileResolveSync (path, isWindows, isFileSync) {
  if (isWindows)
    path = path.replace(sepRegEx, sep);
  if (path[path.length - 1] === sep)
    return path;
  if (isFileSync(path))
    return path;
  if (isFileSync(path + '.js'))
    return path + '.js';
  if (isFileSync(path + '.json'))
    return path + '.json';
  if (isFileSync(path + '.node'))
    return path + '.node';
  if (isFileSync(path + sep + 'index.js'))
    return path + sep + 'index.js';
  if (isFileSync(path + sep + 'index.json'))
    return path + sep + 'index.json';
  if (isFileSync(path + sep + 'index.node'))
    return path + sep + 'index.node';
  throwModuleNotFound(path);
}

function tryParseUrl (url) {
  try {
    return new URL(url);
  }
  catch (e) {}
}

const defaultEnv = {
  browser: false,
  node: true,
  dev: true,
  production: false,
  default: true
};

// path is an absolute file system path with . and .. segments to be resolved
// works only with /-separated paths
// PERF: could we improve perf by only initializing outSegments when finding a '.' or '..' segment,
// otherwise treating everything up to that point as one big compound segment?
function resolvePath (path) {
  let outSegments = [];
  let segmentIndex = -1;

  for (var i = 0; i < path.length; i++) {
    // busy reading a segment - only terminate on '/'
    if (segmentIndex !== -1) {
      if (path[i] === '/') {
        outSegments.push(path.substring(segmentIndex, i + 1));
        segmentIndex = -1;
      }
      continue;
    }

    // new segment - check if it is relative
    if (path[i] === '.') {
      // ../ segment
      if (path[i + 1] === '.' && path[i + 2] === '/') {
        outSegments.pop();
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
      if (i === path.length)
        outSegments.push('');
      continue;
    }

    // it is the start of a new segment
    segmentIndex = i;
  }
  // finish reading out the last segment
  if (segmentIndex !== -1)
    outSegments.push(path.substr(segmentIndex));

  return outSegments.join('');
}

function nodeModuleResolve (name, parentPath, env) {
  if (name[name.length - 1] === '/')
    throwModuleNotFound(name);
  return new Promise((resolve, reject) => {
    (('browser' in env ? env.browser : false) ? browserResolve : nodeResolve)(name, {
      basedir: parentPath.substr(0, parentPath.lastIndexOf(sep))
    }, (err, resolved) => err ? reject(err) : resolve(resolved));
  });
}

function nodeModuleResolveSync (name, parentPath, env) {
  if (name[name.length - 1] === '/')
    throwModuleNotFound(name);
  return (('browser' in env ? env.browser : false) ? browserResolve : nodeResolve).sync(name, {
    basedir: parentPath.substr(0, parentPath.lastIndexOf(sep))
  });
}

class JspmResolver {
  constructor () {
    this.isWindows = process.platform === 'win32';
  }

  async resolve (name, parentPath = process.cwd(), env = defaultEnv) {
    let resolvedPath, resolvedPackage, config, jspmPackagesPath, basePath;
    let isPlain = false;
    const isWindows = this.isWindows;

    // PERF: test replacing string single character checks with charCodeAt numeric checks
    // Absolute path
    if (name[0] === '/') {
      resolvedPath = name.replace(winSepRegEx, '/');
      if (resolvedPath[1] === '/') {
        if (resolvedPath[2] === '/')
          resolvedPath = resolvePath(resolvedPath.substr(2 + isWindows));
        else
          throwInvalidModuleName(name);
      }
      else {
        resolvedPath = resolvePath(resolvedPath.substr(isWindows));
      }
    }
    // Relative path
    else if (name[0] === '.' && (name[1] === '/' && (name = name.substr(2)) || name[1] === '.' && name[2] === '/')) {
      resolvedPath = resolvePath((
        isWindows
        ? parentPath.substr(0, parentPath.lastIndexOf('/') + 1)
        : parentPath.replace(winSepRegEx, '/').substr(0, parentPath.lastIndexOf('/') + 1)
      ) + name.replace(winSepRegEx, '/'));
    }
    // Exact package request or URL request
    else if (name.indexOf(':') !== -1) {
      resolvedPackage = parsePackageName(name);
      // URL
      if (!resolvedPackage) {
        let url = tryParseUrl(name);
        if (url.protocol === 'file:')
          resolvedPath = isWindows ? url.pathname.substr(1) : url.pathname;
        else
          throwInvalidModuleName(name);
      }
    }
    // Plain name
    else {
      isPlain = true;
    }

    if (!isPlain) {
      // PERF: check if this conditional makes it faster?
      if (resolvedPath) {
        if (resolvedPath.match(encodedSepRegEx))
          throwInvalidModuleName(name);
        if (resolvedPath.indexOf('%') !== -1)
          resolvedPath = decodeURIComponent(resolvedPath);
        if (!(config = await this.getJspmConfig(resolvedPath)))
          return await nodeModuleResolve(resolvedPath, parentPath, env);
        resolvedPackage = parsePackagePath(resolvedPath, config.jspmPackagesPath, isWindows);
      }
      // package request
      else {
        if (!(config = await this.getJspmConfig(parentPath)))
          return await nodeModuleResolve(resolvedPath, parentPath, env);
      }

      jspmPackagesPath = config.jspmPackagesPath;
      basePath = ('dev' in env ? env.dev : 'production' in env ? !env.production : true) ? config.basePathDev : config.basePathProduction;
    }
    else {
      if (!(config = await this.getJspmConfig(parentPath)))
        return await nodeModuleResolve(name, parentPath, env);
      jspmPackagesPath = config.jspmPackagesPath;
      basePath = ('dev' in env ? env.dev : 'production' in env ? !env.production : true) ? config.basePathDev : config.basePathProduction;

      // parent plain map
      let parentPackage = parsePackagePath(parentPath, jspmPackagesPath, isWindows);
      if (parentPackage) {
        let mapped = await this.packageResolve(name, parentPackage.name, config, env);
        if (mapped) {
          if (mapped.startsWith('./'))
            return await fileResolve(packageToPath(parentPackage, jspmPackagesPath, isWindows) + mapped.substr(2), isWindows, this.isFile);

          name = mapped;
          if (resolvedPackage = parsePackageName(name))
            isPlain = false;
        }
      }

      // global plain map
      if (isPlain) {
        let mapped = await this.packageResolve(name, undefined, config, env);
        if (mapped) {
          if (mapped.startsWith('./'))
            return await fileResolve(basePath + mapped.substr(2), isWindows, this.isFile);

          name = mapped;
          if (resolvedPackage = parsePackageName(name))
            isPlain = false;
        }
      }

      // node modules fallback
      if (isPlain) {
        if (name === '@empty')
          return;
        return await nodeModuleResolve(name, parentPath, env);
      }
    }

    if (resolvedPackage) {
      if (resolvedPackage.path.length === 1)
        return packageToPath(resolvedPackage, jspmPackagesPath, isWindows);

      let mapped = await this.packageResolve('.' + resolvedPackage.path, resolvedPackage.name, config, env);
      if (mapped) {
        if (!mapped.startsWith('./'))
          throwInvalidConfig(`Invalid package map for ${resolvedPackage.name}. Relative path ".${resolvedPackage.path}" must map to another relative path, not "${mapped}".`);
        resolvedPackage.path = '/';
        // (relative map is always relative)
        return await fileResolve(packageToPath(resolvedPackage, jspmPackagesPath, isWindows) + mapped.substr(2), isWindows, this.isFile);
      }
      else {
        resolvedPath = packageToPath(resolvedPackage, jspmPackagesPath, isWindows);
      }
    }

    else if (resolvedPath.startsWith(basePath.substr(0, basePath.length - 1)) &&
        (resolvedPath[basePath.length - 1] === sep || resolvedPath.length === basePath.length - 1)) {
      let relPath = '.' + resolvedPath.substr(basePath.length - 1);
      let mapped = await this.packageResolve(relPath, undefined, config, env);
      if (mapped) {
        if (!mapped.startsWith('./'))
          throwInvalidConfig(`Invalid base map for relative path "${relPath}". Relative map must map to another relative path, not "${mapped}".`);
        return await fileResolve(basePath + mapped.substr(2), isWindows, this.isFile);
      }
    }

    return await fileResolve(resolvedPath, isWindows, this.isFile);
  }

  resolveSync (name, parentPath = process.cwd(), env = defaultEnv) {
    let resolvedPath, resolvedPackage, config, jspmPackagesPath, basePath;
    let isPlain = false;
    const isWindows = this.isWindows;

    // PERF: test replacing string single character checks with charCodeAt numeric checks
    // Absolute path
    if (name[0] === '/') {
      resolvedPath = name.replace(winSepRegEx, '/');
      if (resolvedPath[1] === '/') {
        if (resolvedPath[2] === '/')
          resolvedPath = resolvePath(resolvedPath.substr(2 + isWindows));
        else
          throwInvalidModuleName(name);
      }
      else {
        resolvedPath = resolvePath(resolvedPath.substr(isWindows));
      }
    }
    // Relative path
    else if (name[0] === '.' && (name[1] === '/' && (name = name.substr(2)) || name[1] === '.' && name[2] === '/')) {
      resolvedPath = resolvePath((
        isWindows
        ? parentPath.substr(0, parentPath.lastIndexOf('/') + 1)
        : parentPath.replace(winSepRegEx, '/').substr(0, parentPath.lastIndexOf('/') + 1)
      ) + name.replace(winSepRegEx, '/'));
    }
    // Exact package request or URL request
    else if (name.indexOf(':') !== -1) {
      resolvedPackage = parsePackageName(name);
      // URL
      if (!resolvedPackage) {
        let url = tryParseUrl(name);
        if (url.protocol === 'file:')
          resolvedPath = isWindows ? url.pathname.substr(1) : url.pathname;
        else
          throwInvalidModuleName(name);
      }
    }
    // Plain name
    else {
      isPlain = true;
    }

    if (!isPlain) {
      // PERF: check if this conditional makes it faster?
      if (resolvedPath) {
        if (resolvedPath.match(encodedSepRegEx))
          throwInvalidModuleName(name);
        if (resolvedPath.indexOf('%') !== -1)
          resolvedPath = decodeURIComponent(resolvedPath);
        if (!(config = this.getJspmConfigSync(resolvedPath)))
          return nodeModuleResolveSync(resolvedPath, parentPath, env);
        resolvedPackage = parsePackagePath(resolvedPath, config.jspmPackagesPath, isWindows);
      }
      // package request
      else {
        if (!(config = this.getJspmConfigSync(parentPath)))
          return nodeModuleResolveSync(resolvedPath, parentPath, env);
      }

      jspmPackagesPath = config.jspmPackagesPath;
      basePath = ('dev' in env ? env.dev : 'production' in env ? !env.production : true) ? config.basePathDev : config.basePathProduction;
    }
    else {
      if (!(config = this.getJspmConfigSync(parentPath)))
        return nodeModuleResolveSync(name, parentPath, env);
      jspmPackagesPath = config.jspmPackagesPath;
      basePath = ('dev' in env ? env.dev : 'production' in env ? !env.production : true) ? config.basePathDev : config.basePathProduction;

      // parent plain map
      let parentPackage = parsePackagePath(parentPath, jspmPackagesPath, isWindows);
      if (parentPackage) {
        let mapped = this.packageResolve(name, parentPackage.name, config, env);
        if (mapped) {
          if (mapped.startsWith('./'))
            return fileResolveSync(packageToPath(parentPackage, jspmPackagesPath, isWindows) + mapped.substr(2), isWindows, this.isFileSync);

          name = mapped;
          if (resolvedPackage = parsePackageName(name))
            isPlain = false;
        }
      }

      // global plain map
      if (isPlain) {
        let mapped = this.packageResolve(name, undefined, config, env);
        if (mapped) {
          if (mapped.startsWith('./'))
            return fileResolveSync(basePath + mapped.substr(2), isWindows, this.isFileSync);

          name = mapped;
          if (resolvedPackage = parsePackageName(name))
            isPlain = false;
        }
      }

      // node modules fallback
      if (isPlain) {
        if (name === '@empty')
          return;
        return nodeModuleResolveSync(name, parentPath, env);
      }
    }

    if (resolvedPackage) {
      if (resolvedPackage.path.length === 1)
        return packageToPath(resolvedPackage, jspmPackagesPath, isWindows);

      let mapped = this.packageResolve('.' + resolvedPackage.path, resolvedPackage.name, config, env);
      if (mapped) {
        if (!mapped.startsWith('./'))
          throwInvalidConfig(`Invalid package map for ${resolvedPackage.name}. Relative path ".${resolvedPackage.path}" must map to another relative path, not "${mapped}".`);
        resolvedPackage.path = '/';
        // (relative map is always relative)
        return fileResolveSync(packageToPath(resolvedPackage, jspmPackagesPath, isWindows) + mapped.substr(2), isWindows, this.isFileSync);
      }
      else {
        resolvedPath = packageToPath(resolvedPackage, jspmPackagesPath, isWindows);
      }
    }

    else if (resolvedPath.startsWith(basePath.substr(0, basePath.length - 1)) &&
        (resolvedPath[basePath.length - 1] === sep || resolvedPath.length === basePath.length - 1)) {
      let relPath = '.' + resolvedPath.substr(basePath.length - 1);
      let mapped = this.packageResolve(relPath, undefined, config, env);
      if (mapped) {
        if (!mapped.startsWith('./'))
          throwInvalidConfig(`Invalid base map for relative path "${relPath}". Relative map must map to another relative path, not "${mapped}".`);
        return fileResolveSync(basePath + mapped.substr(2), isWindows, this.isFileSync);
      }
    }

    return fileResolveSync(resolvedPath, isWindows, this.isFileSync);
  }

  async getJspmConfig (parentPath) {
    if (this.isWindows)
      parentPath = parentPath.replace(sepRegEx, sep);
    let separatorIndex = parentPath.lastIndexOf(sep);
    let rootSeparatorIndex = parentPath.indexOf(sep);
    do {
      let dir = parentPath.substr(0, separatorIndex);

      if (dir.endsWith(sep + 'node_modules'))
        return;

      // dont detect jspm projects within the jspm_packages folder until through the
      // package boundary
      let jspmPackagesIndex = dir.indexOf(sep + 'jspm_packages');
      if (jspmPackagesIndex !== -1) {
        let jspmPackagesEnd = jspmPackagesIndex + 14;
        if (dir[jspmPackagesEnd] === undefined || dir[jspmPackagesEnd] === sep) {
          let jspmSubpath = dir.substr(0, jspmPackagesEnd);
          let parsedPackage = parsePackagePath(dir, jspmSubpath, this.isWindows);
          if (!parsedPackage || parsedPackage.path === '') {
            separatorIndex = parentPath.lastIndexOf(sep, separatorIndex - 1);
            continue;
          }
        }
      }

      // attempt to detect a jspm project rooted in this folder
      // will return undefined if nothing found
      let config = await readJspmConfig(this, dir);
      if (config)
        return config;

      separatorIndex = parentPath.lastIndexOf(sep, separatorIndex - 1);
    }
    while (separatorIndex > rootSeparatorIndex)
  }

  getJspmConfigSync (parentPath) {
    if (this.isWindows)
      parentPath = parentPath.replace(sepRegEx, sep);
    let separatorIndex = parentPath.lastIndexOf(sep);
    let rootSeparatorIndex = parentPath.indexOf(sep);
    do {
      let dir = parentPath.substr(0, separatorIndex);

      if (dir.endsWith(sep + 'node_modules'))
        return;

      // dont detect jspm projects within the jspm_packages folder until through the
      // package boundary
      let jspmPackagesIndex = dir.indexOf(sep + 'jspm_packages');
      if (jspmPackagesIndex !== -1) {
        let jspmPackagesEnd = jspmPackagesIndex + 14;
        if (dir[jspmPackagesEnd] === undefined || dir[jspmPackagesEnd] === sep) {
          let jspmSubpath = dir.substr(0, jspmPackagesEnd);
          let parsedPackage = parsePackagePath(dir, jspmSubpath, this.isWindows);
          if (!parsedPackage || parsedPackage.path === '') {
            separatorIndex = parentPath.lastIndexOf(sep, separatorIndex - 1);
            continue;
          }
        }
      }

      // attempt to detect a jspm project rooted in this folder
      // will return undefined if nothing found
      let config = readJspmConfigSync(this, dir);
      if (config)
        return config;

      separatorIndex = parentPath.lastIndexOf(sep, separatorIndex - 1);
    }
    while (separatorIndex > rootSeparatorIndex)
  }

  packageResolve (name, parentPackageName, config, env) {
    if (!parentPackageName)
      return this.applyMap(name, config.map, env);
    let packageConfig = config.dependencies[parentPackageName];
    if (!packageConfig || !packageConfig.map)
      return;
    return this.applyMap(name, packageConfig.map, env);
  }

  applyMap (name, parentMap, env) {
    let mapped;
    let separatorIndex = name.length;
    let match = name.substr(0, separatorIndex);
    do {
      let replacement = parentMap[match];
      if (replacement) {
        if (typeof replacement !== 'string') {
          for (let c in replacement) {
            if ((c in env ? env[c] : defaultEnv[c]) === true) {
              replacement = replacement[c];
              break;
            }
          }
        }
        return replacement + name.substr(match.length);
      }
      separatorIndex = name.lastIndexOf('/', separatorIndex - 1);
      match = name.substr(0, separatorIndex);
      if (match === '.')
        break;
    }
    while (separatorIndex !== -1)
  }

  async isFile (path) {
    return new Promise((resolve, reject) => {
      fs.stat(path, (err, stats) => {
        if (err) {
          if (err.code === 'ENOENT')
            resolve(false);
          else
            reject(err);
        }
        else {
          resolve(stats.isFile());
        }
      });
    });
  }

  isFileSync (path) {
    try {
      var stats = fs.statSync(path);
    }
    catch (e) {
      if (e.code === 'ENOENT')
        return false;
      throw e;
    }
    return stats.isFile();
  }

  // returns undefined if not existing
  // supports following symlinks
  getMtime (path) {
    return new Promise((resolve, reject) => {
      fs.stat(path, (err, stats) => {
        if (err) {
          if (err.code === 'ENOENT')
            resolve();
          else
            reject(err);
        }
        else {
          resolve(stats.mtimeMs);
        }
      });
    });
  }

  getMtimeSync (path) {
    try {
      let stats = fs.statSync(path);
      return stats.mtimeMs;
    }
    catch (e) {
      if (e.code === 'ENOENT')
        return;
      throw e;
    }
  }

  // returns undefined if not existing or invalid JSON
  async readJSON (path) {
    let source = await new Promise((resolve, reject) => {
      fs.readFile(path, (err, source) => {
        if (err) {
          if (err.code === 'ENOENT')
            resolve();
          else
            reject(err);
        }
        else {
          resolve(source.toString());
        }
      });
    });
    try {
      return JSON.parse(source);
    }
    catch (e) {
      return;
    }
  }

  readJSONSync (path) {
    try {
      var source = fs.readFileSync(path);
    }
    catch (e) {
      if (e.code === 'ENOENT')
        return;
      throw e;
    }
    try {
      return JSON.parse(source);
    }
    catch (e) {
      return;
    }
  }
}

const defaultResolver = new JspmResolver();
const boundDefaultResolver = defaultResolver.resolve.bind(defaultResolver);
boundDefaultResolver.sync = defaultResolver.resolveSync.bind(defaultResolver);
boundDefaultResolver.JspmResolver = JspmResolver;
module.exports = boundDefaultResolver;

/*
 * Keyed by '/'-separated unencoded directory path without trailing '/'
 * { jspmMtime, jspmPath, pjsonMtime, pjsonPath, config? }
 * Used to store and validate both configuration positives and configuration negatives
 */
const dirCache = {};

/*
 * This function is on the cache miss path
 * So it doesn't matter if it isn't fully fs-optimized
 * Populates dirCache[dir] for what it processes
 */
async function readJspmConfig (instance, dir, curConfigJspmDir) {
  let cached = dirCache[dir];

  let pjsonPath = dir + path.sep + 'package.json';
  let jspmPath = cached ? cached.jspmPath : dir + path.sep + 'jspm.json';

  let pjsonMtime, jspmMtime, pjson, jspmJson, config;

  if (cached) {
    [pjsonMtime, jspmMtime] = await Promise.all([instance.getMtime(pjsonPath), instance.getMtime(jspmPath)]);

    if (pjsonMtime === cached.pjsonMtime && jspmMtime === cached.jspmMtime)
      return cached.config;
  }

  [pjsonMtime, pjson] = await Promise.all([
    cached ? pjsonMtime : instance.getMtime(pjsonPath),
    instance.readJSON(pjsonPath)
  ]);

  if (pjsonMtime && !pjson)
    throwInvalidConfig(`Package file ${pjsonPath} is not valid JSON.`);

  if (pjson) {
    if (pjson.configFiles && pjson.configFiles.jspm && !pjson.configFiles.jspm.startsWith('..'))
      jspmPath = path.resolve(dir, pjson.configFiles.jspm);

    [jspmMtime, jspmJson] = await Promise.all([
      cached && cached.jspmPath === jspmPath ? jspmMtime : instance.getMtime(jspmPath),
      instance.readJSON(jspmPath)
    ]);

    if (jspmMtime) {
      if (!jspmJson)
        throwInvalidConfig(`jspm configuration file ${jspmPath} is not valid JSON.`);

      let dirSep = dir + sep;
      config = {
        basePathDev: dirSep,
        basePathProduction: dirSep,
        jspmPackagesPath: dirSep + 'jspm_packages' + sep,
        map: jspmJson.map || {},
        dependencies: jspmJson.dependencies || {}
      };

      if (pjson && typeof pjson.directories === 'object') {
        if (typeof pjson.directories.packages === 'string' && !pjson.directories.packages.startsWith('..'))
          config.jspmPackagesPath = path.resolve(dir, pjson.directories.packages) + sep;
        if (typeof pjson.directories.lib === 'string' && !pjson.directories.lib.startsWith('..'))
          config.basePathDev = config.basePathProduction = path.resolve(dir, pjson.directories.lib) + sep;
        if (typeof pjson.directories.dist === 'string' && !pjson.directories.dist.startsWith('..'))
          config.basePathProduction = path.resolve(dir, pjson.directories.dist) + sep;
      }
    }
  }

  dirCache[dir] = { pjsonMtime, jspmPath, jspmMtime, config };

  return config;
}

function readJspmConfigSync (instance, dir, curConfigJspmDir) {
  let cached = dirCache[dir];

  let pjsonPath = dir + path.sep + 'package.json';
  let jspmPath = cached ? cached.jspmPath : dir + path.sep + 'jspm.json';

  let pjsonMtime, jspmMtime, pjson, jspmJson, config;

  pjsonMtime = instance.getMtimeSync(pjsonPath);

  if (cached) {
    jspmMtime = instance.getMtimeSync(jspmPath);
    if (pjsonMtime === cached.pjsonMtime && jspmMtime === cached.jspmMtime)
      return cached.config;
  }

  if (pjsonMtime) {
    pjson = instance.readJSONSync(pjsonPath);
    if (!pjson)
      throwInvalidConfig(`Package file ${pjsonPath} is not valid JSON.`);
  }

  if (pjson) {
    if (pjson.configFiles && pjson.configFiles.jspm && !pjson.configFiles.jspm.startsWith('..'))
      jspmPath = path.resolve(dir, pjson.configFiles.jspm);

    if (!cached || cached.jspmPath !== jspmPath)
      jspmMtime = instance.getMtimeSync(jspmPath);

    if (jspmMtime) {
      jspmJson = instance.readJSONSync(jspmPath);
      if (!jspmJson)
        throwInvalidConfig(`jspm configuration file ${jspmPath} is not valid JSON.`);

      let dirSep = dir + sep;
      config = {
        basePathDev: dirSep,
        basePathProduction: dirSep,
        jspmPackagesPath: dirSep + 'jspm_packages' + sep,
        map: jspmJson.map || {},
        dependencies: jspmJson.dependencies || {}
      };

      if (pjson && typeof pjson.directories === 'object') {
        if (typeof pjson.directories.packages === 'string' && !pjson.directories.packages.startsWith('..'))
          config.jspmPackagesPath = path.resolve(dir, pjson.directories.packages) + sep;
        if (typeof pjson.directories.lib === 'string' && !pjson.directories.lib.startsWith('..'))
          config.basePathDev = config.basePathProduction = path.resolve(dir, pjson.directories.lib) + sep;
        if (typeof pjson.directories.dist === 'string' && !pjson.directories.dist.startsWith('..'))
          config.basePathProduction = path.resolve(dir, pjson.directories.dist) + sep;
      }
    }
  }

  dirCache[dir] = { pjsonMtime, jspmPath, jspmMtime, config };

  return config;
}
