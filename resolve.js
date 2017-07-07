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

async function fileResolve (instance, path) {
  if (instance.isWindows)
    path = path.replace(sepRegEx, sep);
  if (path[path.length - 1] === sep)
    return path;
  if (await instance.isFile(path))
    return path;
  if (await instance.isFile(path + '.js'))
    return path + '.js';
  if (await instance.isFile(path + '.json'))
    return path + '.json';
  if (await instance.isFile(path + '.node'))
    return path + '.node';
  if (await instance.isFile(path + sep + 'index.js'))
    return path + sep + 'index.js';
  if (await instance.isFile(path + sep + 'index.json'))
    return path + sep + 'index.json';
  if (await instance.isFile(path + sep + 'index.node'))
    return path + sep + 'index.node';
  throwModuleNotFound(path);
}

function fileResolveSync (instance, path) {
  if (instance.isWindows)
    path = path.replace(sepRegEx, sep);
  if (path[path.length - 1] === sep)
    return path;
  if (instance.isFileSync(path))
    return path;
  if (instance.isFileSync(path + '.js'))
    return path + '.js';
  if (instance.isFileSync(path + '.json'))
    return path + '.json';
  if (instance.isFileSync(path + '.node'))
    return path + '.node';
  if (instance.isFileSync(path + sep + 'index.js'))
    return path + sep + 'index.js';
  if (instance.isFileSync(path + sep + 'index.json'))
    return path + sep + 'index.json';
  if (instance.isFileSync(path + sep + 'index.node'))
    return path + sep + 'index.node';
  throwModuleNotFound(path);
}

function tryParseUrl (url) {
  try {
    return new URL(url);
  }
  catch (e) {}
}

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

function nodeModuleResolve (instance, name, parentPath, env) {
  if (name[name.length - 1] === '/')
    throwModuleNotFound(name);
  return new Promise((resolve, reject) => {
    (env.browser ? browserResolve : nodeResolve)(name, {
      basedir: parentPath.substr(0, parentPath.lastIndexOf(sep)),
      isFile (path, cb) {
        instance.isFile(path).then(result => cb(null, result), cb);
      },
      readFile (path, cb) {
        instance.readFile(path).then(source => cb(null, source), cb);
      }
    }, (err, resolved) => err ? reject(err) : resolve(resolved));
  });
}

function nodeModuleResolveSync (instance, name, parentPath, env) {
  if (name[name.length - 1] === '/')
    throwModuleNotFound(name);
  return (env.browser ? browserResolve : nodeResolve).sync(name, {
    basedir: parentPath.substr(0, parentPath.lastIndexOf(sep)),
    isFile: instance.isFileSync,
    readFileSync: instance.readFileSync
  });
}

function setDefaultEnv (env) {
  if (typeof env.browser === 'boolean') {
    if (typeof env.node !== 'boolean')
      env.node = !env.browser;
  }
  else if (typeof env.node === 'boolean') {
    env.browser = !env.node;
  }
  else {
    env.browser = false;
    env.node = true;
  }
  if (typeof env.production === 'boolean') {
    env.dev = !env.production;
  }
  else if (typeof env.dev === 'boolean') {
    env.production = !env.dev;
  }
  else {
    env.dev = true;
    env.production = false;
  }
  env.default = true;
  return env;
}


class JspmResolver {
  constructor (env) {
    this.env = setDefaultEnv(env || {});
    this.isWindows = process.platform === 'win32';

    this.resolve = this.resolve.bind(this);
    this.resolveSync = this.resolveSync.bind(this);
    this.resolve.sync = this.resolveSync;

    this.isFileSync = this.isFileSync.bind(this);
    this.readFileSync = this.readFileSync.bind(this);
  }

  async resolve (name, parentPath = process.cwd(), env) {
    env = env ? setDefaultEnv(env) : this.env;

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
          return await nodeModuleResolve(this, resolvedPath, parentPath, env);
        resolvedPackage = parsePackagePath(resolvedPath, config.jspmPackagesPath, isWindows);
      }
      // package request
      else {
        if (!(config = await this.getJspmConfig(parentPath)))
          return await nodeModuleResolve(this, resolvedPath, parentPath, env);
      }

      jspmPackagesPath = config.jspmPackagesPath;
      basePath = env.dev ? config.basePathDev : config.basePathProduction;
    }
    else {
      if (!(config = await this.getJspmConfig(parentPath)))
        return await nodeModuleResolve(this, name, parentPath, env);
      jspmPackagesPath = config.jspmPackagesPath;
      basePath = env.dev ? config.basePathDev : config.basePathProduction;

      // parent plain map
      let parentPackage = parsePackagePath(parentPath, jspmPackagesPath, isWindows);
      if (parentPackage) {
        let mapped = await this.packageResolve(name, parentPackage.name, config, env);
        if (mapped) {
          if (mapped.startsWith('./'))
            return await fileResolve(this, packageToPath(parentPackage, jspmPackagesPath, isWindows) + mapped.substr(2));

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
            return await fileResolve(this, basePath + mapped.substr(2));

          name = mapped;
          if (resolvedPackage = parsePackageName(name))
            isPlain = false;
        }
      }

      // node modules fallback
      if (isPlain) {
        if (name === '@empty')
          return;
        return await nodeModuleResolve(this, name, parentPath, env);
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
        return await fileResolve(this, packageToPath(resolvedPackage, jspmPackagesPath, isWindows) + mapped.substr(2));
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
        return await fileResolve(this, basePath + mapped.substr(2));
      }
    }

    return await fileResolve(this, resolvedPath);
  }

  resolveSync (name, parentPath = process.cwd(), env) {
    env = env ? setDefaultEnv(env) : this.env;

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
          return nodeModuleResolveSync(this, resolvedPath, parentPath, env);
        resolvedPackage = parsePackagePath(resolvedPath, config.jspmPackagesPath, isWindows);
      }
      // package request
      else {
        if (!(config = this.getJspmConfigSync(parentPath)))
          return nodeModuleResolveSync(this, resolvedPath, parentPath, env);
      }

      jspmPackagesPath = config.jspmPackagesPath;
      basePath = env.dev ? config.basePathDev : config.basePathProduction;
    }
    else {
      if (!(config = this.getJspmConfigSync(parentPath)))
        return nodeModuleResolveSync(this, name, parentPath, env);
      jspmPackagesPath = config.jspmPackagesPath;
      basePath = env.dev ? config.basePathDev : config.basePathProduction;

      // parent plain map
      let parentPackage = parsePackagePath(parentPath, jspmPackagesPath, isWindows);
      if (parentPackage) {
        let mapped = this.packageResolveSync(name, parentPackage.name, config, env);
        if (mapped) {
          if (mapped.startsWith('./'))
            return fileResolveSync(this, packageToPath(parentPackage, jspmPackagesPath, isWindows) + mapped.substr(2));

          name = mapped;
          if (resolvedPackage = parsePackageName(name))
            isPlain = false;
        }
      }

      // global plain map
      if (isPlain) {
        let mapped = this.packageResolveSync(name, undefined, config, env);
        if (mapped) {
          if (mapped.startsWith('./'))
            return fileResolveSync(this, basePath + mapped.substr(2));

          name = mapped;
          if (resolvedPackage = parsePackageName(name))
            isPlain = false;
        }
      }

      // node modules fallback
      if (isPlain) {
        if (name === '@empty')
          return;
        return nodeModuleResolveSync(this, name, parentPath, env);
      }
    }

    if (resolvedPackage) {
      if (resolvedPackage.path.length === 1)
        return packageToPath(resolvedPackage, jspmPackagesPath, isWindows);

      let mapped = this.packageResolveSync('.' + resolvedPackage.path, resolvedPackage.name, config, env);
      if (mapped) {
        if (!mapped.startsWith('./'))
          throwInvalidConfig(`Invalid package map for ${resolvedPackage.name}. Relative path ".${resolvedPackage.path}" must map to another relative path, not "${mapped}".`);
        resolvedPackage.path = '/';
        // (relative map is always relative)
        return fileResolveSync(this, packageToPath(resolvedPackage, jspmPackagesPath, isWindows) + mapped.substr(2));
      }
      else {
        resolvedPath = packageToPath(resolvedPackage, jspmPackagesPath, isWindows);
      }
    }

    else if (resolvedPath.startsWith(basePath.substr(0, basePath.length - 1)) &&
        (resolvedPath[basePath.length - 1] === sep || resolvedPath.length === basePath.length - 1)) {
      let relPath = '.' + resolvedPath.substr(basePath.length - 1);
      let mapped = this.packageResolveSync(relPath, undefined, config, env);
      if (mapped) {
        if (!mapped.startsWith('./'))
          throwInvalidConfig(`Invalid base map for relative path "${relPath}". Relative map must map to another relative path, not "${mapped}".`);
        return fileResolveSync(this, basePath + mapped.substr(2));
      }
    }

    return fileResolveSync(this, resolvedPath);
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
      return applyMap(name, config.map, env);
    let packageConfig = config.dependencies[parentPackageName];
    if (!packageConfig || !packageConfig.map)
      return;
    return applyMap(name, packageConfig.map, env);
  }

  packageResolveSync (name, parentPackageName, config, env) {
    if (!parentPackageName)
      return applyMap(name, config.map, env);
    let packageConfig = config.dependencies[parentPackageName];
    if (!packageConfig || !packageConfig.map)
      return;
    return applyMap(name, packageConfig.map, env);
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

  readFile (path) {
    return new Promise((resolve, reject) => {
      fs.readFile(path, (err, source) => err ? reject(err) : resolve(source.toString()));
    });
  }

  readFileSync (path) {
    return fs.readFileSync(path);
  }
}

function applyMap (name, parentMap, env) {
  let mapped;
  let separatorIndex = name.length;
  let match = name.substr(0, separatorIndex);
  do {
    let replacement = parentMap[match];
    if (replacement) {
      if (typeof replacement !== 'string') {
        for (let c in replacement) {
          if (env[c] === true)
            return replacement[c] + name.substr(match.length);
        }
      }
      else {
        return replacement + name.substr(match.length);
      }
    }
    separatorIndex = name.lastIndexOf('/', separatorIndex - 1);
    match = name.substr(0, separatorIndex);
    if (match === '.')
      break;
  }
  while (separatorIndex !== -1)
}

const defaultResolve = new JspmResolver().resolve;
defaultResolve.JspmResolver = JspmResolver;
defaultResolve.applyMap = applyMap;
module.exports = defaultResolve;

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
    instance.readFile(pjsonPath)
    .then(source => JSON.parse(source))
    .catch(e => {
      if (e && e.code === 'ENOENT' || e instanceof SyntaxError)
        return;
      throw e;
    })
  ]);

  if (pjsonMtime && !pjson)
    throwInvalidConfig(`Package file ${pjsonPath} is not valid JSON.`);

  if (pjson) {
    if (pjson.configFiles && pjson.configFiles.jspm && !pjson.configFiles.jspm.startsWith('..'))
      jspmPath = path.resolve(dir, pjson.configFiles.jspm);

    [jspmMtime, jspmJson] = await Promise.all([
      cached && cached.jspmPath === jspmPath ? jspmMtime : instance.getMtime(jspmPath),
      instance.readFile(jspmPath)
      .then(source => JSON.parse(source))
      .catch(e => {
        if (e && e.code === 'ENOENT' || e instanceof SyntaxError)
          return;
        throw e;
      })
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
    try {
      pjson = JSON.parse(instance.readFileSync(pjsonPath));
    }
    catch (e) {
      if (e && e.code === 'ENOENT' || e instanceof SyntaxError)
        return;
      throw e;
    }
    if (!pjson)
      throwInvalidConfig(`Package file ${pjsonPath} is not valid JSON.`);
  }

  if (pjson) {
    if (pjson.configFiles && pjson.configFiles.jspm && !pjson.configFiles.jspm.startsWith('..'))
      jspmPath = path.resolve(dir, pjson.configFiles.jspm);

    if (!cached || cached.jspmPath !== jspmPath)
      jspmMtime = instance.getMtimeSync(jspmPath);

    if (jspmMtime) {
      try {
        jspmJson = JSON.parse(instance.readFileSync(jspmPath));
      }
      catch (e) {
        if (e && e.code === 'ENOENT' || e instanceof SyntaxError)
          return;
        throw e;
      }
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
