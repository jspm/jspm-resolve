'use strict';

const { URL } = require('url');
const path = require('path');
const fs = require('fs');
const browserResolve = require('browser-resolve');
const nodeResolve = require('resolve');

const winSepRegEx = /\\/g;
const winDrivePathRegEx = /^[a-z]:\\/i;
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

const packageRegEx = /^([a-z]+:[@\-_\.a-zA-Z\d][-_\.a-zA-Z\d]*(?:\/[-_\.a-zA-Z\d]+)*@[^\/\\%]+)(\/[\s\S]*|$)/;
function parsePackageName (name) {
  let packageMatch = name.match(packageRegEx);
  if (packageMatch)
    return { name: packageMatch[1], path: packageMatch[2] };
}
const packagePathRegEx = /^([a-z]+\/[@\-_\.a-zA-Z\d][-_\.a-zA-Z\d]*(?:\/[-_\.a-zA-Z\d]+)*@[^\/\\%]+)(\/[\s\S]*|$)/;
function parsePackagePath (path, jspmPackagesPath) {
  if (!path.startsWith(jspmPackagesPath.substr(0, jspmPackagesPath.length - 1)) ||
      path[jspmPackagesPath.length - 1] !=='/' && path.length !== jspmPackagesPath.length - 1)
    return;
  let packageMatch = path.substr(jspmPackagesPath.length).match(packagePathRegEx);
  if (packageMatch)
    return { name: packageMatch[1].replace('/', ':'), path: packageMatch[2] };
}
function packageToPath (pkgName, jspmPackagesPath) {
  let registryIndex = pkgName.indexOf(':');
  return jspmPackagesPath + pkgName.substr(0, registryIndex) + '/' + pkgName.substr(registryIndex + 1);
}

function percentDecode (path) {
  if (path.match(encodedSepRegEx))
    throwInvalidModuleName(`${path} cannot be URI decoded as it contains a percent-encoded separator or percent character.`);
  if (path.indexOf('%') === -1)
    return path;
  return decodeURIComponent(path);
}

async function fileResolve (instance, path) {
  if (path[path.length - 1] === '/')
    return path;
  if (await instance.isFile(path))
    return path;
  let curPath;
  if (await instance.isFile((curPath = path + '.js')) ||
      await instance.isFile((curPath = path + '.json')) ||
      await instance.isFile((curPath = path + '.node')) ||
      await instance.isFile((curPath = path + '/index.js')) ||
      await instance.isFile((curPath = path + '/index.json')) ||
      await instance.isFile((curPath = path + '/index.node')))
    return curPath;
  throwModuleNotFound(path);
}

function fileResolveSync (instance, path) {
  if (path[path.length - 1] === '/')
    return path;
  if (instance.isFileSync(path))
    return path;
  let curPath;
  if (instance.isFileSync((curPath = path + '.js')) ||
      instance.isFileSync((curPath = path + '.json')) ||
      instance.isFileSync((curPath = path + '.node')) ||
      instance.isFileSync((curPath = path + '/index.js')) ||
      instance.isFileSync((curPath = path + '/index.json')) ||
      instance.isFileSync((curPath = path + '/index.node')))
    return curPath;
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

function nodeModuleResolve (instance, name, parentPath, env) {
  if (name[name.length - 1] === '/')
    throwModuleNotFound(name);
  return new Promise((resolve, reject) => {
    (env.browser ? browserResolve : nodeResolve)(name, {
      basedir: parentPath.substr(0, parentPath.lastIndexOf('/')),
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
    basedir: parentPath.substr(0, parentPath.lastIndexOf('/')),
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

const defaultEnv = {
  browser: false,
  node: true,
  production: false,
  dev: true,
  'react-native': false,
  electron: false
};

class JspmResolver {
  constructor (projectPath = process.cwd(), env = {}) {
    this.pjsonConfigCache = {};
    this.isWindows = process.platform === 'win32';
    if (this.isWindows)
      projectPath = projectPath.replace(winSepRegEx, '/');
    if (projectPath[projectPath.length - 1] !== '/')
      projectPath += '/';
    this.config = this.getJspmConfig(projectPath);

    this.env = setDefaultEnv(env, defaultEnv);
  }

  async resolve (name, parentPath, env) {
    if (!parentPath)
      parentPath = this.config ? this.config.basePath : process.cwd();
    env = env ? setDefaultEnv(env, this.env) : this.env;

    // / is supported in windows, so we treat this as the canonical form for this resolver
    if (this.isWindows && parentPath.indexOf('\\') !== -1)
      parentPath = parentPath.replace(winSepRegEx, '/');

    let config, resolvedPath, resolvedPkg;

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
        resolvedPath = resolvePath(this.isWindows ? resolvedPath.substr(1) : resolvedPath);
      }
    }
    // Relative path
    else if (name[0] === '.' && (name[1] === '/' && (name = name.substr(2)) || name[1] === '.' && name[2] === '/')) {
      config = this.getJspmConfig(parentPath);
      if (config && (resolvedPkg = parsePackagePath(parentPath, config.jspmPackagesPath))) {
        let relPath = resolvePath(resolvedPkg.path.substr(0, resolvedPkg.path.lastIndexOf('/') + 1) + percentDecode(name));
        if (relPath[0] !== '/')
          throwInvalidModuleName(`Backtracking below a package boundary is not permitted resolving ${name} to ${parentPath}.`);
        if (relPath.length === 1)
          relPath = '';
        resolvedPkg.path = relPath;
      }
      else {
        resolvedPath = resolvePath(parentPath.substr(0, parentPath.lastIndexOf('/') + 1) + name.replace(winSepRegEx, '/'));
      }
    }
    // Exact package request or URL request
    else if (name.indexOf(':') !== -1) {
      resolvedPkg = parsePackageName(name);
      // URL
      if (!resolvedPkg) {
        if (this.isWindows && name.match(winDrivePathRegEx)) {
          resolvedPath = percentDecode(resolvePath(name.replace(winSepRegEx, '/')));
        }
        else {
          let url = tryParseUrl(name);
          if (url.protocol === 'file:')
            resolvedPath = this.isWindows ? url.pathname.substr(1) : url.pathname;
          else
            throwInvalidModuleName(`${name} is not a valid module name.`);
        }
      }
    }
    // Plain name resolution
    else {
      config = this.getJspmConfig(parentPath);

      if (!config)
        return await nodeModuleResolve(this, name, parentPath, env);

      let parentPkgPath;
      let parentPkg = parsePackagePath(parentPath, config.jspmPackagesPath);
      if (parentPkg)
        parentPkgPath = parentPath.substr(0, config.jspmPackagesPath.length + parentPkg.name.length);

      // package map
      {
        let mapped = await this.packageMap(name, parentPkgPath, config, env);
        if (mapped) {
          if (mapped.startsWith('./')) {
            if (parentPkgPath) {
              return await fileResolve(this, parentPkgPath + mapped.substr(1));
            }
            else {
              let basePath = env.dev ? config.localPackagePathDev : config.localPackagePathProduction;
              return await fileResolve(this, basePath + mapped.substr(2));
            }
          }
          name = mapped;
          resolvedPkg = parsePackageName(name);
        }
      }

      // resolve
      if (!resolvedPkg) {
        let resolved = await this.packageResolve(name, parentPkg && parentPkg.name, config);
        if (resolved) {
          resolvedPkg = parsePackageName(resolved);
          if (resolvedPkg)
            name = resolved;
        }
      }

      // node modules fallback
      if (!resolvedPkg) {
        if (name === '@empty')
          return;
        return await nodeModuleResolve(this, name, parentPath, env);
      }
    }

    // detect package from resolved path, including detecting in other jspm projects
    if (!resolvedPkg) {
      config = this.getJspmConfig(resolvedPath);

      if (!config)
        return await fileResolve(this, resolvedPath);

      resolvedPkg = parsePackagePath(resolvedPath, config.jspmPackagesPath);
    }

    // internal package resolution maps
    if (resolvedPkg) {
      if (!config)
        config = this.getJspmConfig(parentPath);
      if (!resolvedPath && !config)
        throwInvalidModuleName(`Cannot import jspm package ${name} when path ${parentPath} is not a jspm project.`);
      let resolvedPkgPath = packageToPath(resolvedPkg.name, config.jspmPackagesPath);
      if (!resolvedPath)
        resolvedPath = resolvedPkgPath + resolvedPkg.path;
      if (resolvedPkg.path === '/')
        return resolvedPath;
      let mapped = await this.packageMap('.' + resolvedPkg.path, resolvedPkgPath, config, env);
      if (mapped) {
        if (!mapped.startsWith('./'))
          throwInvalidConfig(`Invalid package map for ${resolvedPkgPath}. Relative path ".${resolvedPath.substr(resolvedPkgPath.length)}" must map to another relative path, not "${mapped}".`);
        // (relative map is always relative)
        return await fileResolve(this, resolvedPkgPath + mapped.substr(1));
      }
    }
    // base project package internal resolution map
    else if (config) {
      let basePath = env.dev ? config.localPackagePathDev : config.localPackagePathProduction;
      if (resolvedPath.startsWith(basePath.substr(0, basePath.length - 1)) &&
        (resolvedPath[basePath.length - 1] === '/' || resolvedPath.length === basePath.length - 1)) {
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

    // / is supported in windows, so we treat this as the canonical form for this resolver
    if (this.isWindows && parentPath.indexOf('\\') !== -1)
      parentPath = parentPath.replace(winSepRegEx, '/');

    let config, resolvedPath, resolvedPkg;

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
        resolvedPath = resolvePath(this.isWindows ? resolvedPath.substr(1) : resolvedPath);
      }
    }
    // Relative path
    else if (name[0] === '.' && (name[1] === '/' && (name = name.substr(2)) || name[1] === '.' && name[2] === '/')) {
      config = this.getJspmConfig(parentPath);
      if (config && (resolvedPkg = parsePackagePath(parentPath, config.jspmPackagesPath))) {
        let relPath = resolvePath(resolvedPkg.path.substr(0, resolvedPkg.path.lastIndexOf('/') + 1) + percentDecode(name));
        if (relPath[0] !== '/')
          throwInvalidModuleName(`Backtracking below a package boundary is not permitted resolving ${name} to ${parentPath}.`);
        if (relPath.length === 1)
          relPath = '';
        resolvedPkg.path = relPath;
      }
      else {
        resolvedPath = resolvePath(parentPath.substr(0, parentPath.lastIndexOf('/') + 1) + name.replace(winSepRegEx, '/'));
      }
    }
    // Exact package request or URL request
    else if (name.indexOf(':') !== -1) {
      resolvedPkg = parsePackageName(name);
      // URL
      if (!resolvedPkg) {
        if (this.isWindows && name.match(winDrivePathRegEx)) {
          resolvedPath = percentDecode(resolvePath(name.replace(winSepRegEx, '/')));
        }
        else {
          let url = tryParseUrl(name);
          if (url.protocol === 'file:')
            resolvedPath = this.isWindows ? url.pathname.substr(1) : url.pathname;
          else
            throwInvalidModuleName(`${name} is not a valid module name.`);
        }
      }
    }
    // Plain name resolution
    else {
      config = this.getJspmConfig(parentPath);

      if (!config)
        return nodeModuleResolve(this, name, parentPath, env);

      let parentPkgPath;
      let parentPkg = parsePackagePath(parentPath, config.jspmPackagesPath);
      if (parentPkg)
        parentPkgPath = parentPath.substr(0, config.jspmPackagesPath.length + parentPkg.name.length);

      // package map
      {
        let mapped = this.packageMapSync(name, parentPkgPath, config, env);
        if (mapped) {
          if (mapped.startsWith('./')) {
            if (parentPkgPath) {
              return fileResolveSync(this, parentPkgPath + mapped.substr(1));
            }
            else {
              let basePath = env.dev ? config.localPackagePathDev : config.localPackagePathProduction;
              return fileResolveSync(this, basePath + mapped.substr(2));
            }
          }
          name = mapped;
          resolvedPkg = parsePackageName(name);
        }
      }

      // resolve
      if (!resolvedPkg) {
        let resolved = this.packageResolveSync(name, parentPkg && parentPkg.name, config);
        if (resolved) {
          resolvedPkg = parsePackageName(resolved);
          if (resolvedPkg)
            name = resolved;
        }
      }

      // node modules fallback
      if (!resolvedPkg) {
        if (name === '@empty')
          return;
        return nodeModuleResolveSync(this, name, parentPath, env);
      }
    }

    // detect package from resolved path, including detecting in other jspm projects
    if (!resolvedPkg) {
      config = this.getJspmConfig(resolvedPath);

      if (!config)
        return fileResolveSync(this, resolvedPath);

      resolvedPkg = parsePackagePath(resolvedPath, config.jspmPackagesPath);
    }

    // internal package resolution maps
    if (resolvedPkg) {
      if (!config)
        config = this.getJspmConfig(parentPath);
      if (!resolvedPath && !config)
        throwInvalidModuleName(`Cannot import jspm package ${name} when path ${parentPath} is not a jspm project.`);
      let resolvedPkgPath = packageToPath(resolvedPkg.name, config.jspmPackagesPath);
      if (!resolvedPath)
        resolvedPath = resolvedPkgPath + resolvedPkg.path;
      if (resolvedPkg.path === '/')
        return resolvedPath;
      let mapped = this.packageMapSync('.' + resolvedPkg.path, resolvedPkgPath, config, env);
      if (mapped) {
        if (!mapped.startsWith('./'))
          throwInvalidConfig(`Invalid package map for ${resolvedPkgPath}. Relative path ".${resolvedPath.substr(resolvedPkgPath.length)}" must map to another relative path, not "${mapped}".`);
        // (relative map is always relative)
        return fileResolveSync(this, resolvedPkgPath + mapped.substr(1));
      }
    }
    // base project package internal resolution map
    else if (config) {
      let basePath = env.dev ? config.localPackagePathDev : config.localPackagePathProduction;
      if (resolvedPath.startsWith(basePath.substr(0, basePath.length - 1)) &&
        (resolvedPath[basePath.length - 1] === '/' || resolvedPath.length === basePath.length - 1)) {
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

  getJspmConfig (parentPath) {
    if (this.config && (parentPath === this.config.basePath || parentPath.startsWith(this.config.basePath) &&
          parentPath[this.config.basePath.length - 1] === '/'))
      return this.config;
    parentPath = parentPath.substr(0, parentPath.lastIndexOf('/'));
    if (this.isWindows)
      parentPath = parentPath.replace(winSepRegEx, '/');
    let separatorIndex = parentPath.length;
    let rootSeparatorIndex = parentPath.indexOf('/');
    do {
      let dir = parentPath.substr(0, separatorIndex);
      if (dir.endsWith('/' + 'node_modules'))
        return;

      try {
        var pjson = JSON.parse(this.readFileSync(path.join(dir, 'package.json')));
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
          jspmPath = path.join(dir, 'jspm.json');

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
          let dirSep = (this.isWindows ? dir.replace(winSepRegEx, '/') : dir) + '/';
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
              if (this.isWindows)
                config.jspmPackagesPath = config.jspmPackagesPath.replace(winSepRegEx, '/');
            }
            if (typeof pjson.directories.lib === 'string' && !pjson.directories.lib.startsWith('..')) {
              config.localPackagePathDev = config.localPackagePathProduction = path.resolve(dir, pjson.directories.lib) + '/';
              if (this.isWindows)
                config.localPackagePathDev = config.localPackagePathDev.replace(winSepRegEx, '/');
            }
            if (typeof pjson.directories.dist === 'string' && !pjson.directories.dist.startsWith('..')) {
              config.localPackagePathProduction = path.resolve(dir, pjson.directories.dist) + '/';
              if (this.isWindows)
                config.localPackagePathProduction = config.localPackagePathProduction.replace(winSepRegEx, '/');
            }
          }

          return config;
        }
      }

      separatorIndex = parentPath.lastIndexOf('/', separatorIndex - 1);
    }
    while (separatorIndex > rootSeparatorIndex)
  }

  async isCommonJS (resolvedModulePath) {
    let separatorIndex = resolvedModulePath.lastIndexOf('/');
    let rootSeparatorIndex = resolvedModulePath.indexOf('/');
    let isJspmProject = this.getJspmConfig(resolvedModulePath) !== undefined;
    while (separatorIndex > rootSeparatorIndex) {
      let parentPath = resolvedModulePath.substr(0, separatorIndex);
      let pcfg;
      if (parentPath in this.pjsonConfigCache) {
        pcfg = this.pjsonConfigCache[parentPath];
      }
      else {
        try {
          let pjson = JSON.parse(await this.readFile(path.join(parentPath, 'package.json')));
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
      separatorIndex = resolvedModulePath.lastIndexOf('/', separatorIndex - 1);
    }
    return isJspmProject;
  }

  isCommonJSSync (resolvedModulePath) {
    let separatorIndex = resolvedModulePath.lastIndexOf('/');
    let rootSeparatorIndex = resolvedModulePath.indexOf('/');
    let isJspmProject = this.getJspmConfig(resolvedModulePath) !== undefined;
    while (separatorIndex > rootSeparatorIndex) {
      let parentPath = resolvedModulePath.substr(0, separatorIndex);
      let pcfg;
      if (parentPath in this.pjsonConfigCache) {
        pcfg = this.pjsonConfigCache[parentPath];
      }
      else {
        try {
          let pjson = JSON.parse(this.readFileSync(path.join(parentPath, 'package.json')));
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
      separatorIndex = resolvedModulePath.lastIndexOf('/', separatorIndex - 1);
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
        let pjson = JSON.parse(await this.readFile(path.join(parentPackagePath, 'package.json')));
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
        let pjson = JSON.parse(this.readFileSync(path.join(parentPackagePath, 'package.json')));
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

JspmResolver.applyMap = applyMap;

module.exports = JspmResolver;

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
