'use strict';

const { URL } = require('url');
const path = require('path');
const fs = require('fs');
const browserResolve = require('browser-resolve');
const nodeResolve = require('resolve');

const winSepRegEx = /\\/g;
const winDrivePathRegEx = /^[a-z]:\\/i;
const sepRegEx = /\//g;
const encodedSepRegEx = /%(5C|2F)/gi;

function throwModuleNotFound (name) {
  let e = new Error(`Module ${name} not found.`);
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

function throwNotInstalled (msg) {
  let e = new Error(msg);
  e.code = 'NOT_INSTALLED';
  throw e;
}

const packageHashRegEx = /^[a-z0-9]{16,}$/i;
const packageRegEx = /^([a-z]+:[@\-_\.a-zA-Z\d][-_\.a-zA-Z\d]*(?:\/[-_\.a-zA-Z\d]+)*@[^\/\\%]+)(\/[\s\S]*|$)/;
function parsePackageName (name) {
  let packageMatch = name.match(packageRegEx);
  if (packageMatch)
    return {
      name: packageMatch[1],
      path: packageMatch[2]
    };
}
function packageToPath (pkgName, jspmPackagesPath, isWindows) {
  let registryIndex = pkgName.indexOf(':');
  return jspmPackagesPath + pkgName.substr(0, registryIndex) + sep +
      (isWindows ? pkgName.substr(registryIndex + 1).replace(sepRegEx, sep) : pkgName.substr(registryIndex + 1));
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
  return env;
}

function percentDecode (path) {
  if (path.match(encodedSepRegEx))
    throwInvalidModuleName(`${path} cannot be URI decoded as it contains a percent-encoded separator or percent character.`);
  if (path.indexOf('%') === -1)
    return path;
  return decodeURIComponent(path);
}

const defaultEnv = {
  browser: false,
  node: true,
  production: false,
  dev: true,
  'react-native': false,
  electron: false
};

const HOME = process.env.JSPM_GLOBAL_PATH || process.env.LOCALAPPDATA || process.env.HOME || process.env.HOMEPATH;

class JspmResolver {
  constructor (projectPath = process.cwd(), env = {}, globalPackagesPath = path.resolve(HOME, 'jspm', 'packages')) {
    this.pjsonConfigCache = {};
    if (projectPath[projectPath.length - 1] !== sep)
      projectPath += sep;
    this.config = this.getJspmConfig(projectPath);
    this.reverseHashLookup = {};

    this.env = setDefaultEnv(env, defaultEnv);
    this.globalPackagesPath = globalPackagesPath;
    this.isWindows = process.platform === 'win32';
    this.sep = this.isWindows ? '\\' : '/';
  }

  async resolve (name, parentPath, env) {
    if (!parentPath)
      parentPath = this.config ? this.config.basePath : process.cwd();
    env = env ? setDefaultEnv(env, this.env) : this.env;

    let config, pkg, pkgPath, resolvedPath;

    // Absolute path
    if (name[0] === '/') {
      resolvedPath = name.replace(winSepRegEx, '/');
      if (resolvedPath[1] === '/') {
        if (resolvedPath[2] === '/')
          resolvedPath = percentDecode(resolvePath(resolvedPath.substr(2 + this.isWindows)));
        else
          throwInvalidModuleName(`${name} is not a valid module name.`);
      }
      else {
        if (this.isWindows)
          resolvedPath = resolvePath(percentDecode(resolvedPath.substr(1)));
        else
          resolvedPath = resolvePath(resolvedPath);
      }
    }
    // Relative path
    else if (name[0] === '.' && (name[1] === '/' && (name = name.substr(2)) || name[1] === '.' && name[2] === '/')) {
      { config, pkg, pkgPath } = await this.getJspmContext(parentPath);
      if (pkg) {
        let relPath = resolvePath(pkg.path.substr(0, pkg.path.lastIndexOf('/') + 1) + percentDecode(name));
        if (relPath[0] !== '/')
          throw InvalidModuleName(`Backtracking below a package boundary is not permitted resolving ${name} to ${parentPath}.`);
        if (relPath.length === 1)
          relPath = '';
        pkg.path = relPath;
      }
      else {
        resolvedPath = resolvePath((
          this.isWindows
          ? parentPath.replace(winSepRegEx, '/').substr(0, parentPath.lastIndexOf('/') + 1)
          : parentPath.substr(0, parentPath.lastIndexOf('/') + 1)
        ) + name.replace(winSepRegEx, '/'));
      }
    }
    // Exact package request or URL request
    else if (name.indexOf(':') !== -1) {
      pkg = parsePackageName(name);
      if (pkg) {
        { config } = await this.getJspmContext(parentPath);
        pkgPath = packageToPath(pkg.name, config.jspmPackagesPath, this.isWindows);
        if (!config)
          throwInvalidModuleName(`Cannot import jspm package ${name} when path ${parentPath} is not a jspm project.`);
      }
      // support Windows drive letter absolute paths
      else if (this.isWindows && name.match(winDrivePathRegEx)) {
        resolvedPath = resolvePath(name.replace(winSepRegEx, '/'));
      }
      // URL
      else {
        let url = tryParseUrl(name);
        if (url.protocol === 'file:')
          resolvedPath = percentDecode(this.isWindows ? url.pathname.substr(1) : url.pathname);
        else
          throwInvalidModuleName(`${name} is not a valid module name.`);
      }
    }
    // Plain name resolution
    else {
      { config, pkgPath } = this.getJspmContext(parentPath);

      if (!config)
        return await nodeModuleResolve(this, name, parentPath, env);

      // package map
      {
        let mapped = await this.packageMap(name, pkgPath, config, env);
        if (mapped) {
          if (mapped.startsWith('./')) {
            if (pkgPath) {
              return await fileResolve(this, pkgPath + mapped.substr(1));
            }
            else {
              let basePath = env.dev ? config.localPackagePathDev : config.localPackagePathProduction;
              return await fileResolve(this, basePath + mapped.substr(2));
            }
          }
          name = mapped;
          pkg = parsePackageName(name);
        }
      }

      // resolve
      if (!pkg) {
        let resolved = await this.packageResolve(name, pkg && pkg.name, config);
        if (resolved) {
          pkg = parsePackageName(resolved);
          if (pkg)
            name = resolved;
        }
      }

      // node modules fallback
      if (!pkg) {
        if (name === '@empty')
          return;
        return await nodeModuleResolve(this, name, parentPath, env);
      }
    }

    if (!pkg) {
      { config, pkg, pkgPath } = this.getJspmContext(resolvedPath);
      if (!config)
        return await fileResolve(this, resolvedPath);
    }

    // internal package resolution maps
    if (pkg) {
      if (!pkgPath)
        pkgPath = packageToPath(pkg.name, config.jspmPackagesPath, this.isWindows);
      if (!resolvedPath)
        resolvedPath = pkgPath + pkg.path;
      if (pkg.path === '/')
        return resolvedPath;
      let mapped = await this.packageMap('.' + pkg.path, pkgPath, config, env);
      if (mapped) {
        if (!mapped.startsWith('./'))
          throwInvalidConfig(`Invalid package map for ${pkgPath}. Relative path ".${resolvedPath.substr(pkgPath.length)}" must map to another relative path, not "${mapped}".`);
        // (relative map is always relative)
        return await fileResolve(this, pkgPath + mapped.substr(1));
      }
    }
    // base project package internal resolution map
    else if (config) {
      let basePath = env.dev ? config.localPackagePathDev : config.localPackagePathProduction;
      if (resolvedPath.startsWith(basePath.substr(0, basePath.length - 1)) &&
        (resolvedPath[basePath.length - 1] === this.sep || resolvedPath.length === basePath.length - 1)) {
        let relPath = '.' + resolvedPath.substr(basePath.length - 1);
        let mapped = await this.packageMap(relPath, undefined, config, env);
        if (mapped) {
          if (!mapped.startsWith('./'))
            throwInvalidConfig(`Invalid base map for relative path "${relPath}". Relative map must map to another relative path, not "${mapped}".`);
          return await fileResolve(this, basePath + mapped.substr(2));
        }
      }
    }

    return await fileResolve(this, resolvedPath);
  }

  resolveSync (name, parentPath, env) {
    if (!parentPath)
      parentPath = this.config ? this.config.basePath : process.cwd();
    env = env ? setDefaultEnv(env, this.env) : this.env;

    let config, resolvedPath, resolvedPackage;

    // Absolute path
    if (name[0] === '/') {
      resolvedPath = name.replace(winSepRegEx, '/');
      if (resolvedPath[1] === '/') {
        if (resolvedPath[2] === '/')
          resolvedPath = resolvePath(resolvedPath.substr(2 + this.isWindows));
        else
          throwInvalidModuleName(name);
      }
      else {
        resolvedPath = resolvePath(resolvedPath.substr(this.isWindows));
      }
    }
    // Relative path
    else if (name[0] === '.' && (name[1] === '/' && (name = name.substr(2)) || name[1] === '.' && name[2] === '/')) {
      resolvedPath = resolvePath((
        this.isWindows
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
          resolvedPath = this.isWindows ? url.pathname.substr(1) : url.pathname;
        else
          throwInvalidModuleName(name);
      }
    }
    // Plain name resolution
    else {
      config = this.getJspmConfig(parentPath);

      if (!config)
        return nodeModuleResolveSync(this, name, parentPath, env);

      // package map
      let parentPackagePath;
      {
        let parentPackage = parsePackagePath(parentPath, config.jspmPackagesPath, this.isWindows);
        if (parentPackage)
          parentPackagePath = packageToPath(parentPackage.name, config.jspmPackagesPath, this.isWindows);
        let mapped = this.packageMapSync(name, parentPackagePath, config, env);
        if (mapped) {
          if (mapped.startsWith('./')) {
            if (parentPackagePath) {
              return fileResolveSync(this, parentPackagePath + mapped.substr(1));
            }
            else {
              let basePath = env.dev ? config.localPackagePathDev : config.localPackagePathProduction;
              return fileResolveSync(this, basePath + mapped.substr(2));
            }
          }
          name = mapped;
          resolvedPackage = parsePackageName(name);
        }
      }

      // resolve
      if (!resolvedPackage) {
        let parentPackageName;
        if (parentPackagePath) {
          let parentPackage = parsePackagePath(parentPackagePath, config.jspmPackagesPath, this.isWindows);
          if (parentPackage)
            parentPackageName = parentPackage.name;
        }

        let resolved = this.packageResolveSync(name, parentPackageName, config);
        if (resolved) {
          resolvedPackage = parsePackageName(resolved);
          if (resolvedPackage)
            name = resolved;
        }
      }

      // node modules fallback
      if (!resolvedPackage) {
        if (name === '@empty')
          return;
        return nodeModuleResolveSync(this, name, parentPath, env);
      }
    }

    // detect package from resolved path, including detecting in other jspm projects
    if (!resolvedPackage) {
      { config, parentHash } = this.getJspmConfig(resolvedPath);

      if (resolvedPath.match(encodedSepRegEx))
        throwInvalidModuleName(name);
      if (resolvedPath.indexOf('%') !== -1)
        resolvedPath = decodeURIComponent(resolvedPath);

      if (!config)
        return fileResolveSync(this, resolvedPath);

      resolvedPackage = parsePackagePath(resolvedPath, config.jspmPackagesPath, this.isWindows);
    }

    // internal package resolution maps
    if (resolvedPackage) {
      if (!config)
        config = this.getJspmConfig(parentPath);
      if (!resolvedPath && !config)
        throwInvalidModuleName(resolvedPackage.name, `Cannot import jspm packages as ${parentPath} is not a jspm project.`);
      let resolvedPackagePath = packageToPath(resolvedPackage.name, config.jspmPackagesPath, this.isWindows);
      if (!resolvedPath)
        resolvedPath = resolvedPackagePath + resolvedPackage.path;
      if (resolvedPackage.path === '/')
        return resolvedPath;
      let mapped = this.packageMapSync('.' + resolvedPackage.path, resolvedPackagePath, config, env);
      if (mapped) {
        if (!mapped.startsWith('./'))
          throwInvalidConfig(`Invalid package map for ${resolvedPackagePath}. Relative path ".${resolvedPath.substr(resolvedPackagePath.length)}" must map to another relative path, not "${mapped}".`);
        // (relative map is always relative)
        return fileResolveSync(this, resolvedPackagePath + mapped.substr(1));
      }
    }
    // base project package internal resolution map
    else if (config) {
      let basePath = env.dev ? config.localPackagePathDev : config.localPackagePathProduction;
      if (resolvedPath.startsWith(basePath.substr(0, basePath.length - 1)) &&
        (resolvedPath[basePath.length - 1] === sep || resolvedPath.length === basePath.length - 1)) {
        let relPath = '.' + resolvedPath.substr(basePath.length - 1);
        let mapped = this.packageMapSync(relPath, undefined, config, env);
        if (mapped) {
          if (!mapped.startsWith('./'))
            throwInvalidConfig(`Invalid base map for relative path "${relPath}". Relative map must map to another relative path, not "${mapped}".`);
          return fileResolveSync(this, basePath + mapped.substr(2));
        }
      }
    }

    return fileResolveSync(this, resolvedPath);
  }

  async getJspmContext (parentPath) {
    if (this.config && (parentPath.startsWith(this.config.basePath) && (
        parentPath[this.config.basePath.length - 1] === this.sep || parentPath.length === this.config.basePath.length))) {
      let config = this.config;

      if (!path.startsWith(jspmPackagesPath.substr(0, jspmPackagesPath.length - 1)) ||
          path[jspmPackagesPath.length - 1] !== this.sep && path.length !== jspmPackagesPath.length - 1)
        return;
      let relPackagePath = path.substr(jspmPackagesPath.length).replace(this.sep, ':');
      if (isWindows)
        relPackagePath = relPackagePath.replace(winSepRegEx, '/');
      let packageMatch = relPackagePath.match(packageRegEx);
      if (packageMatch)
        return {
          name: packageMatch[1],
          path: packageMatch[2]
        };

      let pkg = parsePackagePath(parentPath, config.jspmPackagesPath, this.isWindows);
      let pkgPath;
      if (pkg) {
        pkgPath = packageToPath(pkg.name, config.jspmPackagesPath, this.isWindows);
        if (!(await this.isDirectory(pkgPath))) {
          let packageHash = this.getPackageHash(parentPackage.name);
          // packageHash -> package + pkgPath
        }
      }
      return { config, pkg, pkgPath };
    }
    else if (parentPath.startsWith(this.globalPackagesPath) && parentPath[this.globalPackagesPath.length] === this.sep) {
      let config = this.config;
      let pkgHashIndexStart = this.globalPackagesPath.length + 1;
      let pkgHashIndexEnd = parentPath.indexOf(this.sep, pkgHashIndex);
      let pkgHash = parentPath.substring(pkgHashIndexStart, pkgHashIndexEnd);
      let pkgPath = parentPath.substr(0, pkgHashIndexEnd);
      let path = parentPath.substr(pkgHashIndexEnd);

      let name = this.reverseHashLookup[pkgHash];
      if (!name) {
        if (!pkgHash.match(packageHashRegEx))
          throwInvalidModuleName(`Parent path ${parentPath} is not a valid installed package of this jspm project.`);
        for (let depName in config.dependencies) {
          let depHash = getPackageHash(config.dependencies[depName].source);
          if (depHash === pkgHash) {
            name = this.reverseHshLookup[pkgHash] = depName;
            break;
          }
        }
        throwNotInstalled(`Package ${parentPath} is not yet installed.`);
      }

      return { config, pkg: { name, path }, pkgPath };
    }

    return this.getJspmConfig(parentPath);
  }

  getJspmConfig (parentPath) {
    parentPath = parentPath.substr(0, parentPath.lastIndexOf(this.sep));
    if (this.isWindows)
      parentPath = parentPath.replace(sepRegEx, this.sep);
    let separatorIndex = parentPath.length;
    let rootSeparatorIndex = parentPath.indexOf(this.sep);
    do {
      let dir = parentPath.substr(0, separatorIndex);
      if (dir.endsWith(this.sep + 'node_modules'))
        return;

      try {
        var pjson = JSON.parse(this.readFileSync(dir + this.sep + 'package.json'));
      }
      catch (e) {
        if (e instanceof SyntaxError) {
          e.code = 'INVALID_CONFIG';
          throw e;
        }
        if (!e || e.code !== 'ENOENT')
          throw e;
      }

      if (pjson) {
        let jspmPath;
        if (pjson.configFiles && pjson.configFiles.jspm && !pjson.configFiles.jspm.startsWith('..'))
          jspmPath = path.resolve(dir, pjson.configFiles.jspm);
        else
          jspmPath = dir + this.sep + 'jspm.json';

        try {
          var jspmJson = JSON.parse(this.readFileSync(jspmPath));
        }
        catch (e) {
          if (e instanceof SyntaxError) {
            e.code = 'INVALID_CONFIG';
            throw e;
          }
          if (!e || e.code !== 'ENOENT')
            throw e;
        }

        if (jspmJson) {
          let dirSep = dir + this.sep;
          let config = {
            basePath: dirSep,
            localPackagePathDev: dirSep,
            localPackagePathProduction: dirSep,
            jspmPackagesPath: dirSep + 'jspm_packages' + this.sep,
            resolve: jspmJson.resolve || {},
            dependencies: jspmJson.dependencies || {}
          };

          if (pjson && typeof pjson.directories === 'object') {
            if (typeof pjson.directories.packages === 'string' && !pjson.directories.packages.startsWith('..'))
              config.jspmPackagesPath = path.resolve(dir, pjson.directories.packages) + this.sep;
            if (typeof pjson.directories.lib === 'string' && !pjson.directories.lib.startsWith('..'))
              config.localPackagePathDev = config.localPackagePathProduction = path.resolve(dir, pjson.directories.lib) + this.sep;
            if (typeof pjson.directories.dist === 'string' && !pjson.directories.dist.startsWith('..'))
              config.localPackagePathProduction = path.resolve(dir, pjson.directories.dist) + this.sep;
          }

          return config;
        }
      }

      separatorIndex = parentPath.lastIndexOf(this.sep, separatorIndex - 1);
    }
    while (separatorIndex > rootSeparatorIndex)
  }

  async isCommonJS (resolvedModulePath) {
    let separatorIndex = resolvedModulePath.lastIndexOf(sep);
    let rootSeparatorIndex = resolvedModulePath.indexOf(sep);
    let isJspmProject = this.getJspmConfig(resolvedModulePath) !== undefined;
    while (separatorIndex > rootSeparatorIndex) {
      let parentPath = resolvedModulePath.substr(0, separatorIndex);
      let pcfg;
      if (parentPath in this.pjsonConfigCache) {
        pcfg = this.pjsonConfigCache[parentPath];
      }
      else {
        try {
          let pjson = JSON.parse(await this.readFile(parentPath + sep + 'package.json'));
          pcfg = processPjsonConfig({
            module: typeof pjson.module === 'boolean' ? pjson.module : isJspmProject
          }, pjson);
        }
        catch (e) {
          if (!e || e.code !== 'ENOENT')
            throw e;
        }
        this.pjsonConfigCache[parentPath] = pcfg;
      }
      if (pcfg)
        return !pcfg.module;
      separatorIndex = resolvedModulePath.lastIndexOf(sep, separatorIndex - 1);
    }
    return isJspmProject;
  }

  isCommonJSSync (resolvedModulePath) {
    let separatorIndex = resolvedModulePath.lastIndexOf(sep);
    let rootSeparatorIndex = resolvedModulePath.indexOf(sep);
    let isJspmProject = this.getJspmConfig(resolvedModulePath) !== undefined;
    while (separatorIndex > rootSeparatorIndex) {
      let parentPath = resolvedModulePath.substr(0, separatorIndex);
      let pcfg;
      if (parentPath in this.pjsonConfigCache) {
        pcfg = this.pjsonConfigCache[parentPath];
      }
      else {
        try {
          let pjson = JSON.parse(this.readFileSync(parentPath + sep + 'package.json'));
          pcfg = processPjsonConfig({
            module: typeof pjson.module === 'boolean' ? pjson.module : isJspmProject
          }, pjson);
        }
        catch (e) {
          if (!e || e.code !== 'ENOENT')
            throw e;
        }
        this.pjsonConfigCache[parentPath] = pcfg;
      }
      if (pcfg)
        return !pcfg.module;
      separatorIndex = resolvedModulePath.lastIndexOf(sep, separatorIndex - 1);
    }
    return isJspmProject;
  }

  async packageMap (name, parentPackagePath, config, env) {
    if (parentPackagePath === undefined)
      parentPackagePath = config.basePath;

    let pcfg;
    if (parentPackagePath in this.pjsonConfigCache) {
      pcfg = this.pjsonConfigCache[parentPackagePath];
    }
    else {
      try {
        let pjson = JSON.parse(await this.readFile(parentPackagePath + sep + 'package.json'));
        pcfg = processPjsonConfig({
          module: typeof pjson.module === 'boolean' ? pjson.module : true
        }, pjson);
      }
      catch (e) {
        if (!e || e.code !== 'ENOENT')
          throw e;
      }
      this.pjsonConfigCache[parentPackagePath] = pcfg;
    }

    if (pcfg && pcfg.map)
      return applyMap(name, pcfg.map, env);
  }

  packageMapSync (name, parentPackagePath, config, env) {
    if (parentPackagePath === undefined)
      parentPackagePath = config.basePath;

    let pcfg;
    if (parentPackagePath in this.pjsonConfigCache) {
      pcfg = this.pjsonConfigCache[parentPackagePath];
    }
    else {
      try {
        let pjson = JSON.parse(this.readFileSync(parentPackagePath + sep + 'package.json'));
        pcfg = processPjsonConfig({
          module: typeof pjson.module === 'boolean' ? pjson.module : true
        }, pjson);
      }
      catch (e) {
        if (!e || e.code !== 'ENOENT')
          throw e;
      }
      this.pjsonConfigCache[parentPackagePath] = pcfg;
    }

    if (pcfg && pcfg.map)
      return applyMap(name, pcfg.map, env);
  }

  packageResolve (name, parentPackageName, config) {
    if (parentPackageName) {
      let packageConfig = config.dependencies[parentPackageName];
      if (packageConfig && packageConfig.resolve)
        mapped = applyMap(name, packageConfig.resolve) || applyMap(name, config.resolve);
    }
    return applyMap(name, config.resolve);
  }

  packageResolveSync (name, parentPackageName, config) {
    if (parentPackageName) {
      let packageConfig = config.dependencies[parentPackageName];
      if (packageConfig && packageConfig.resolve)
        mapped = applyMap(name, packageConfig.resolve) || applyMap(name, config.resolve);
    }
    return applyMap(name, config.resolve);
  }

  async isDirectory (path) {
    return new Promise((resolve, reject) => {
      fs.stat(path, (err, stats) => {
        if (err) {
          if (err.code === 'ENOENT')
            resolve(false);
          else
            reject(err);
        }
        else {
          resolve(stats.isDirectory());
        }
      });
    });
  }

  isDirectorySync (path) {
    try {
      var stats = fs.statSync(path);
    }
    catch (e) {
      if (e.code === 'ENOENT')
        return false;
      throw e;
    }
    return stats.isDirectory();
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

  readFile (path) {
    return new Promise((resolve, reject) => {
      fs.readFile(path, (err, source) => err ? reject(err) : resolve(source.toString()));
    });
  }

  readFileSync (path) {
    return fs.readFileSync(path);
  }
}

module.exports = JspmResolver;

exports.getPackageHash = getPackageHash;
function getPackageHash (source) {

}

exports.applyMap = applyMap;
function applyMap (name, parentMap, env) {
  let mapped;
  let separatorIndex = name.length;
  let match = name.substr(0, separatorIndex);
  do {
    let replacement = parentMap[match];
    if (replacement) {
      main: while (typeof replacement !== 'string') {
        if (!env)
          throwInvalidConfig(`Conditional maps not supported for package resolve.`);
        for (let c in replacement) {
          if (env[c] === true) {
            replacement = replacement[c];
            continue main;
          }
        }
        return undefined;
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

exports.processPjsonConfig = processPjsonConfig;
function processPjsonConfig (pcfg, pjson) {
  if (pjson.main) {
    pcfg.map = pcfg.map || {};
    if (typeof pjson.main === 'string')
      pcfg.map['.'] = pjson.main.startsWith('./') ? pjson.main : './' + pjson.main;
    else if (typeof pjson.main === 'object')
      pcfg.map['.'] = pjson.main;
  }

  if (typeof pjson['react-native'] === 'string') {
    if (typeof pcfg.map['.'] === 'object')
      pcfg.map['.']['react-native'] = pjson['react-native'].startsWith('./') ? pjson['react-native'] : './' + pjson['react-native'];
    else if (typeof pcfg.map['.'] == 'string')
      pcfg.map['.'] = { 'react-native': pjson['react-native'].startsWith('./') ? pjson['react-native'] : './' + pjson['react-native'], default: pcfg.map['.'] };
    else
      pcfg.map['.'] = { 'react-native': pjson['react-native'].startsWith('./') ? pjson['react-native'] : './' + pjson['react-native'] };
  }

  if (typeof pjson.electron === 'string') {
    if (typeof pcfg.map['.'] === 'object')
      pcfg.map['.'].electron = pjson.electron.startsWith('./') ? pjson.electron : './' + pjson.electron;
    else if (typeof pcfg.map['.'] == 'string')
      pcfg.map['.'] = { electron: pjson.electron.startsWith('./') ? pjson.electron : './' + pjson.electron, default: pcfg.map['.'] };
    else
      pcfg.map['.'] = { 'react-native': pjson.electron.startsWith('./') ? pjson.electron : './' + pjson.electron };
  }

  if (pjson.browser) {
    pcfg.map = pcfg.map || {};
    if (typeof pjson.browser === 'string') {
      if (typeof pcfg.map['.'] === 'object')
        pcfg.map['.'].browser = pjson.browser.startsWith('./') ? pjson.browser : './' + pjson.browser;
      else if (typeof pcfg.map['.'] == 'string')
        pcfg.map['.'] = { browser: pjson.browser.startsWith('./') ? pjson.browser : './' + pjson.browser, default: pcfg.map['.'] };
      else
        pcfg.map['.'] = { browser: pjson.browser.startsWith('./') ? pjson.browser : './' + pjson.browser };
    }
    else if (typeof pjson.browser === 'object') {
      for (let p in pjson.browser) {
        let m = pcfg.map[p] = pcfg.map[p] || {};
        m.browser = pjson.browser[p];
      }
    }
  }

  if (typeof pjson.module === 'string') {
    // pcfg.module = true;
    pcfg.map = pcfg.map || {};
    pcfg.map['.'] = pjson.module.startsWith('./') ? pjson.module : './' + pjson.module;
  }

  if (pjson.map && typeof pjson.map === 'object') {
    pcfg.map = pcfg.map || {};
    Object.assign(pcfg.map, pjson.map);
  }

  return pcfg;
}
