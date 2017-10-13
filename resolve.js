'use strict';

const { URL } = require('url');
const path = require('path');
const fs = require('fs');

const winSepRegEx = /\\/g;
const winDrivePathRegEx = /^[a-z]:\\/i;
const encodedSepRegEx = /%(5C|2F)/gi;

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

async function fileResolve (path, cjsResolve, realpath) {
  if (path[path.length - 1] === '/') {
    if (!await this.isDir(path))
      throwModuleNotFound(path);
    return { resolved: path, format: undefined };
  }
  let resolved;
  if (await this.isFile(path))
    resolved = path;
  else if (cjsResolve === false && await this.isFile(resolved = path + '.mjs'));
  else if (await this.isFile(resolved = path + '.js'));
  else if (await this.isFile(resolved = path + '.json'));
  else if (await this.isFile(resolved = path + '.node'));
  else if (cjsResolve === false && await this.isFile(resolved = path + '/index.mjs'));
  else if (await this.isFile(resolved = path + '/index.js'));
  else if (await this.isFile(resolved = path + '/index.json'));
  else if (await this.isFile(resolved = path + '/index.node'));
  else
    throwModuleNotFound(path);
  if (realpath)
    resolved = await this.realpath(resolved);
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
      const pcfg = await getPackageConfig.call(this, resolved);
      if (pcfg !== undefined)
        return { resolved, format: pcfg.config.esm === true ? 'esm' : 'cjs' };
    }
    return { resolved, format: cjsResolve === true ?  'cjs' : 'esm' };
  }
  throwInvalidModuleName(`Cannot load unknown file type ${resolved}`);
}

function fileResolveSync (path, cjsResolve, realpath) {
  if (path[path.length - 1] === '/') {
    if (!this.isDirSync(path))
      throwModuleNotFound(path);
    return { resolved: path, format: undefined };
  }
  let resolved;
  if (this.isFileSync(path))
    resolved = path;
  else if (cjsResolve === false && this.isFileSync(resolved = path + '.mjs'));
  else if (this.isFileSync(resolved = path + '.js'));
  else if (this.isFileSync(resolved = path + '.json'));
  else if (this.isFileSync(resolved = path + '.node'));
  else if (cjsResolve === false && this.isFileSync(resolved = path + '/index.mjs'));
  else if (this.isFileSync(resolved = path + '/index.js'));
  else if (this.isFileSync(resolved = path + '/index.json'));
  else if (this.isFileSync(resolved = path + '/index.node'));
  else
    throwModuleNotFound(path);
  if (realpath)
    resolved = this.realpathSync(resolved);
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
      const pcfg = getPackageConfigSync.call(this, resolved);
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

async function nodeModuleResolve (name, parentPath, env, cjsResolve) {
  if (this.nodeCoreModules[name])
    return { resolved: name, format: 'builtin' };
  let separatorIndex = parentPath.lastIndexOf('/');
  let rootSeparatorIndex = parentPath.indexOf('/');
  while (separatorIndex > rootSeparatorIndex) {
    let resolved = parentPath.substr(0, separatorIndex) + '/node_modules/' + name;
    let pkgConfig = await getPackageConfig.call(this, resolved);
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
    try {
      return await fileResolve.call(this, resolved, cjsResolve, true);
    }
    catch (e) {
      if (e.code !== 'MODULE_NOT_FOUND')
        throw e;
    }  
    separatorIndex = resolved.lastIndexOf('/', separatorIndex - 1);
  }
  throwModuleNotFound(name, parentPath);
}

function nodeModuleResolveSync (name, parentPath, env, cjsResolve) {
  if (this.nodeCoreModules[name])
    return { resolved: name, format: 'builtin' };
  let separatorIndex = parentPath.lastIndexOf('/');
  let rootSeparatorIndex = parentPath.indexOf('/');
  while (separatorIndex > rootSeparatorIndex) {
    let resolved = parentPath.substr(0, separatorIndex) + '/node_modules/' + name;
    let pkgConfig = getPackageConfigSync.call(this, resolved);
    if (pkgConfig !== undefined) {
      if (pkgConfig.config.mains !== undefined && resolved.length === pkgConfig.path.length - 1 &&
          resolved === pkgConfig.path.substr(0, pkgConfig.path.length - 1)) {
        const mapped = applyMain(pkgConfig.config.mains);
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
    try {
      return fileResolveSync.call(this, resolved, cjsResolve, true);
    }
    catch (e) {
      if (e.code !== 'MODULE_NOT_FOUND')
        throw e;
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
  module: true
};

// resolve returns { path,  format }
// CJS modules always resolve to CJS (thus skipping "module" condition!)
// where "module" condition is used,  format is "module"
class JspmResolver {
  constructor (projectPath = process.cwd(), env = {}) {
    this.pjsonConfigCache = {};
    this.isFileCache = {};
    this.isDirCache = {};
    this.nodeCoreModules = {
      assert: true, buffer: true, child_process: true, cluster: true, console: true, constants: true, crypto: true,
      dgram: true, dns: true, domain: true, events: true, fs: true, http: true, https: true, module: true, net: true,
      os: true, path: true, process: true, punycode: true, querystring: true, readline: true, repl: true, stream: true,
      string_decoder: true, sys: true, timers: true, tls: true, tty: true, url: true, util: true, vm: true, zlib: true
    };
 
    this.isWindows = process.platform === 'win32';
    if (this.isWindows)
      projectPath = projectPath.replace(winSepRegEx, '/');
    if (projectPath[projectPath.length - 1] !== '/')
      projectPath += '/';
    this.config = this.getJspmConfig(projectPath);

    this.env = setDefaultEnv(env, defaultEnv);
  }

  async resolve (name, parentPath, env, cjsResolve = false) {
    const config = this.config;
    if (!parentPath)
      parentPath = config ? config.basePath : process.cwd();
    if (parentPath.indexOf('\\') !== -1)
      parentPath = parentPath.replace(winSepRegEx, '/');
    env = env ? setDefaultEnv(env, this.env) : this.env;

    let resolvedPath, resolvedPkg;

    // Absolute path
    if (name[0] === '/') {
      name = name.replace(winSepRegEx, '/');
      if (name[1] === '/') {
        if (name[2] === '/')
          resolvedPath = resolvePath(percentDecode(name.substr(2 + this.isWindows)));
        else
          throwInvalidModuleName(`${name} is not a valid module name.`);
      }
      else {
        resolvedPath = resolvePath(percentDecode(this.isWindows ? name.substr(1) : name));
      }
    }
    // Relative path
    else if (name[0] === '.' && (name[1] === '/' && (name = name.substr(2), true) || name[1] === '.' && name[2] === '/')) {
      name = name.replace(winSepRegEx, '/');
      resolvedPath = resolvePath(parentPath.substr(0, parentPath.lastIndexOf('/') + 1) + percentDecode(name));
    }
    // Exact package request or URL request
    else if (name.indexOf(':') !== -1) {
      resolvedPkg = parsePackageName(name);
      if (resolvedPkg) {
        if (name.indexOf('\\') !== -1)
          throwInvalidModuleName(`Package request ${name} must use "/" as a separator not "\".`);
      }
      // URL
      else {
        const url = tryParseUrl(name);
        if (url.protocol === 'file:')
          resolvedPath = percentDecode(this.isWindows ? url.pathname.substr(1) : url.pathname);
        else
          throwInvalidModuleName(`${name} is not a valid module name. It must be a file:/// URL or an absolute URL.`);
      }
    }
    // Plain name resolution
    else {
      if (name.indexOf('\\') !== -1)
        throwInvalidModuleName(`Package request ${name} must use "/" as a separator not "\".`);
      const parentPkgConfig = await getPackageConfig.call(this, parentPath);
      if (parentPkgConfig.config.map) {
        const mapped = applyMap(name, parentPkgConfig.config.map, env);
        if (mapped !== undefined) {
          if (mapped[0] === '.'  && mapped[1] === '/') {
            if (config !== undefined && parentPkgConfig.path === config.basePath) {
              resolvedPath = (env.dev ? config.localPackagePathDev : config.localPackagePathProduction) + mapped.substr(2);
            }
            else {
              resolvedPath = parentPkgConfig.path + mapped.substr(2);
            }
            return await fileResolve.call(this, resolvedPath, cjsResolve, false);
          }
          else {
            name = mapped;
          }
        }
      }
      let parentPkgName = undefined;
      if (config !== undefined && (
          parentPath.length === config.basePath.length - 1 && parentPath === config.basePath.substr(0, config.basePath.length - 1) ||
          parentPath.length >= config.basePath.length && parentPath.substr(0, config.basePath.length) === config.basePath)) {
        const parentPkg = parsePackagePath(parentPath, config.jspmPackagesPath);
        if (parentPkg !== undefined)
          parentPkgName = parentPkg.name;
      }

      const resolvedPkgName = await this.packageResolve(name, parentPkgName, config);
      if (resolvedPkgName) {
        resolvedPkg = parsePackageName(resolvedPkgName);
      }
      else {
        if (name === '@empty')
          return { resolved: undefined, format: undefined };
        return await nodeModuleResolve.call(this, name, parentPath, env);
      }
    }

    // convert canonical package names into a resolved path
    if (resolvedPkg) {
      if (!config)
        throwInvalidModuleName(`Cannot import jspm package ${name} when resolver is not initialized to a jspm project.`);
      resolvedPath = packageToPath(resolvedPkg, config.jspmPackagesPath);
    }

    const realpath = config === undefined && resolvedPath.indexOf('/node_modules/') !== -1 ||
        resolvedPath.startsWith(config.basePath) && resolvedPath.lastIndexOf('/node_modules/') > config.basePath.length;

    if (resolvedPath[resolvedPath.length - 1] === '/')
      return await fileResolve.call(this, resolvedPath, cjsResolve, realpath);
    
    const pkgConfig = await getPackageConfig.call(this, resolvedPath);
    if (pkgConfig.path !== undefined) {
      if (config !== undefined && pkgConfig.path === config.basePath) {
        if (resolvedPath.length === config.jspmPackagesPath.length - 1 && resolvedPath === config.jspmPackagesPath.substr(0, config.jspmPackagesPath.length - 1) ||
            resolvedPath.length >= config.jspmPackagesPath.length && resolvedPath.substr(0, config.jspmPackagesPath.length) === config.jspmPackagesPath)
          return await fileResolve.call(this, resolvedPath, cjsResolve, realpath);
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

    return await fileResolve.call(this, resolvedPath, cjsResolve, realpath);
  }

  resolveSync (name, parentPath, env, cjsResolve = false) {
    const config = this.config;
    if (!parentPath)
      parentPath = config ? config.basePath : process.cwd();
    if (parentPath.indexOf('\\') !== -1)
      parentPath = parentPath.replace(winSepRegEx, '/');
    env = env ? setDefaultEnv(env, this.env) : this.env;

    let resolvedPath, resolvedPkg;

    // Absolute path
    if (name[0] === '/') {
      name = name.replace(winSepRegEx, '/');
      if (name[1] === '/') {
        if (name[2] === '/')
          resolvedPath = resolvePath(percentDecode(name.substr(2 + this.isWindows)));
        else
          throwInvalidModuleName(`${name} is not a valid module name.`);
      }
      else {
        resolvedPath = resolvePath(percentDecode(this.isWindows ? name.substr(1) : name));
      }
    }
    // Relative path
    else if (name[0] === '.' && (name[1] === '/' && (name = name.substr(2), true) || name[1] === '.' && name[2] === '/')) {
      name = name.replace(winSepRegEx, '/');
      resolvedPath = resolvePath(parentPath.substr(0, parentPath.lastIndexOf('/') + 1) + percentDecode(name));
    }
    // Exact package request or URL request
    else if (name.indexOf(':') !== -1) {
      resolvedPkg = parsePackageName(name);
      if (resolvedPkg) {
        if (name.indexOf('\\') !== -1)
          throwInvalidModuleName(`Package request ${name} must use "/" as a separator not "\".`);
      }
      // URL
      else {
        const url = tryParseUrl(name);
        if (url.protocol === 'file:')
          resolvedPath = percentDecode(this.isWindows ? url.pathname.substr(1) : url.pathname);
        else
          throwInvalidModuleName(`${name} is not a valid module name. It must be a file:/// URL or an absolute URL.`);
      }
    }
    // Plain name resolution
    else {
      if (name.indexOf('\\') !== -1)
        throwInvalidModuleName(`Package request ${name} must use "/" as a separator not "\".`);
      const parentPkgConfig = getPackageConfigSync.call(this, parentPath);
      if (parentPkgConfig.config.map) {
        const mapped = applyMap(name, parentPkgConfig.config.map, env);
        if (mapped !== undefined) {
          if (mapped[0] === '.'  && mapped[1] === '/') {
            if (config !== undefined && parentPkgConfig.path === config.basePath) {
              resolvedPath = (env.dev ? config.localPackagePathDev : config.localPackagePathProduction) + mapped.substr(2);
            }
            else {
              resolvedPath = parentPkgConfig.path + mapped.substr(2);
            }
            return fileResolveSync.call(this, resolvedPath, cjsResolve, false);
          }
          else {
            name = mapped;
          }
        }
      }
      let parentPkgName = undefined;
      if (config !== undefined && (
          parentPath.length === config.basePath.length - 1 && parentPath === config.basePath.substr(0, config.basePath.length - 1) ||
          parentPath.length >= config.basePath.length && parentPath.substr(0, config.basePath.length) === config.basePath)) {
        const parentPkg = parsePackagePath(parentPath, config.jspmPackagesPath);
        if (parentPkg !== undefined)
          parentPkgName = parentPkg.name;
      }

      const resolvedPkgName = this.packageResolveSync(name, parentPkgName, config);
      if (resolvedPkgName) {
        resolvedPkg = parsePackageName(resolvedPkgName);
      }
      else {
        if (name === '@empty')
          return { resolved: undefined, format: undefined };
        return nodeModuleResolveSync.call(this, name, parentPath, env);
      }
    }

    // convert canonical package names into a resolved path
    if (resolvedPkg) {
      if (!config)
        throwInvalidModuleName(`Cannot import jspm package ${name} when resolver is not initialized to a jspm project.`);
      resolvedPath = packageToPath(resolvedPkg, config.jspmPackagesPath);
    }

    const realpath = config === undefined && resolvedPath.indexOf('/node_modules/') !== -1 ||
        resolvedPath.startsWith(config.basePath) && resolvedPath.lastIndexOf('/node_modules/') > config.basePath.length;

    if (resolvedPath[resolvedPath.length - 1] === '/')
      return fileResolveSync.call(this, resolvedPath, cjsResolve, realpath);
    
    const pkgConfig = getPackageConfigSync.call(this, resolvedPath);
    if (pkgConfig.path !== undefined) {
      if (config !== undefined && pkgConfig.path === config.basePath) {
        if (resolvedPath.length === config.jspmPackagesPath.length - 1 && resolvedPath === config.jspmPackagesPath.substr(0, config.jspmPackagesPath.length - 1) ||
            resolvedPath.length >= config.jspmPackagesPath.length && resolvedPath.substr(0, config.jspmPackagesPath.length) === config.jspmPackagesPath)
          return fileResolveSync.call(this, resolvedPath, cjsResolve, realpath);
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

    return fileResolveSync.call(this, resolvedPath, cjsResolve, realpath);
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

  packageResolve (name, parentPackageName, config) {
    if (parentPackageName) {
      let packageConfig = config.dependencies[parentPackageName];
      if (packageConfig && packageConfig.resolve)
        return applyMap(name, packageConfig.resolve) || applyMap(name, config.resolve);
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

  // possible optimization approach for node_modules lookup
  async isDir (path) {
    const cached = this.isDirCache[path];
    if (cached !== undefined)
      return this.isDirCache[path];
    return new Promise((resolve, reject) => {
      fs.stat(path, (err, stats) => {
        if (err) {
          if (err.code === 'ENOENT')
            resolve(false);
          else
            reject(err);
        }
        else {
          resolve(this.isDirCache[path] = stats.isDirectory());
        }
      });
    });
  }

  isDirSync (path) {
    const cached = this.isDirCache[path];
    if (cached !== undefined)
      return this.isDirCache[path];
    try {
      var stats = fs.statSync(path);
    }
    catch (e) {
      if (e.code === 'ENOENT')
        return false;
      throw e;
    }
    return this.isDirCache[path] = stats.isDirectory();
  }

  async isFile (path) {
    const cached = this.isFileCache[path];
    if (cached !== undefined)
      return this.isFileCache[path];
    return new Promise((resolve, reject) => {
      fs.stat(path, (err, stats) => {
        if (err) {
          if (err.code === 'ENOENT')
            resolve(false);
          else
            reject(err);
        }
        else {
          resolve(this.isFileCache[path] = stats.isFile());
        }
      });
    });
  }

  isFileSync (path) {
    const cached = this.isFileCache[path];
    if (cached !== undefined)
      return this.isFileCache[path];
    try {
      var stats = fs.statSync(path);
    }
    catch (e) {
      if (e.code === 'ENOENT')
        return false;
      throw e;
    }
    return this.isFileCache[path] = stats.isFile();
  }

  async realpath (path) {
    return new Promise((resolve, reject) => {
      fs.realpath(path, (err, realpath) => {
        if (err)
          reject(err);
        else if (realpath.indexOf('\\') !== -1)
          resolve(realpath.replace(winSepRegEx, '/'));
        else
          resolve(realpath);
      });
    });
  }

  realpathSync (path) {
    const realpath = fs.realpathSync(path);
    if (realpath.indexOf('\\') !== -1)
      return realpath.replace(winSepRegEx, '/');
    return realpath;
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

module.exports = exports = JspmResolver;

async function getPackageConfig (resolved) {
  let separatorIndex = resolved.length - 1;
  if (resolved[separatorIndex] !== '/')
    separatorIndex++;
  let rootSeparatorIndex = resolved.indexOf('/');
  while (separatorIndex > rootSeparatorIndex) {
    let parentPath = resolved.substr(0, separatorIndex);
    if (parentPath.endsWith('/node_modules/'))
      break;
    let pcfg;
    if (parentPath in this.pjsonConfigCache) {
      pcfg = this.pjsonConfigCache[parentPath];
    }
    else {
      try {
        let pjson = JSON.parse(await this.readFile(parentPath + '/package.json'));
        pcfg = processPjsonConfig(pjson);
      }
      catch (e) {
        if (!e || e.code !== 'ENOENT')
          throw e;
      }
      this.pjsonConfigCache[parentPath] = pcfg;
    }
    if (pcfg !== undefined)
      return { path: parentPath + '/', config: pcfg };
    separatorIndex = resolved.lastIndexOf('/', separatorIndex - 1);
  }
}

function getPackageConfigSync (resolved) {
  let separatorIndex = resolved.lastIndexOf('/');
  let rootSeparatorIndex = resolved.indexOf('/');
  while (separatorIndex > rootSeparatorIndex) {
    let parentPath = resolved.substr(0, separatorIndex + 1);
    if (parentPath.endsWith('/node_modules/'))
      break;
    let pcfg;
    if (parentPath in this.pjsonConfigCache) {
      pcfg = this.pjsonConfigCache[parentPath];
    }
    else {
      try {
        let pjson = JSON.parse(this.readFileSync(parentPath +'package.json'));
        pcfg = processPjsonConfig(pjson);
      }
      catch (e) {
        if (!e || e.code !== 'ENOENT')
          throw e;
      }
      this.pjsonConfigCache[parentPath] = pcfg;
    }
    if (pcfg !== undefined)
      return { path: parentPath, config: pcfg };
    separatorIndex = resolved.lastIndexOf('/', separatorIndex - 1);
  }
}

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

exports.processPjsonConfig = processPjsonConfig;

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
