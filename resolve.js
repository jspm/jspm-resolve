const { URL } = require('url');
const path = require('path');
const fs = require('fs');
const browserResolve = require('browser-resolve');
const nodeResolve = require('resolve');

const isWindows = process.platform === 'win32';

let packageRegEx = /^([a-z]+:[@\-_\.a-zA-Z\d][-_\.a-zA-Z\d]*(?:\/[-_\.a-zA-Z\d]+)*@[^\/\\]+)(\/[\s\S]*|$)/;
function parsePackageName (name) {
  let packageMatch = name.match(packageRegEx);
  if (packageMatch)
    return {
      name: packageMatch[1],
      path: packageMatch[2]
    };
}

let packageUrlRegEx = /^([a-z]+\/[@\-_\.a-zA-Z\d][-_\.a-zA-Z\d]*(?:\/[-_\.a-zA-Z\d]+)*)@([^\/\\]+)(\/[\s\S]*|$)/;
function parsePackageUrl (url, jspmPackagesUrl) {
  if (!url.href.startsWith(jspmPackagesUrl.href.substr(0, jspmPackagesUrl.href.length - 1)) ||
      url.href[jspmPackagesUrl.href.length] !== '/' && url.href.length !== jspmPackagesUrl.href.length - 1)
    return;
  let relPackagePath = url.href.substr(jspmPackagesUrl.href.length);
  let packageMatch = relPackagePath.match(packageUrlRegEx);
  if (packageMatch)
    return {
      // here unique space separation is necessary as package name strings are unique identifiers
      name: packageMatch[1] + '@' + decodeURIComponent(packageMatch[2]),
      // decode skipped here as while it breaks formal contract of separate spaces,
      // it doesn't affect outcomes due to idempotency
      // (since encodeURI(decodeURI(x)) === encodeURI(x))
      path: packageMatch[3]
    };
}

// exactly like parsePackageUrl, but in /-separated unencoded path space
function parsePackagePath (path, jspmPackagesPath) {
  if (!path.startsWith(jspmPackagesPath.substr(0, jspmPackagesPath.length - 1)) ||
      path[jspmPackagesPath.length] !== '/' && path.length !== jspmPackagesPath.length - 1)
    return;
  let relPackagePath = path.substr(jspmPackagesPath.length);
  let packageMatch = relPackagePath.match(packageUrlRegEx);
  if (packageMatch)
    return {
      name: packageMatch[1] + '@' + packageMatch[2],
      path: packageMatch[3]
    };
}

function packageToUrl (pkg, jspmPackagesUrl) {
  let registryIndex = pkg.indexOf(':');
  let atIndex = pkg.indexOf('@');
  if (atIndex - 1 === registryIndex)
    atIndex = pkg.indexOf('@', atIndex + 1);
  let relPackagePath = pkg.name.substr(0, registryIndex) + '/' +
      pkg.name.substring(registryIndex + 1, atIndex + 1) +
      encodeURIComponent(pkg.name.substr(atIndex + 1)) + pkg.path;
  return new URL(relPackagePath, jspmPackagesUrl);
}

async function fileResolve (url) {
  if (url.protocol !== 'file:')
    return url;
  let path = decodeURIComponent(isWindows ? url.pathname.substr(1) : url.pathname);
  if (path[path.length - 1] === '/') {
    if (await fileExists(path + 'index.js')) {
      url.href += 'index.js';
      return url;
    }
    // fail fast
    let [jsonExists, nodeExists] = Promise.all([fileExists(path + 'index.json'), fileExists(path + 'index.node')]);
    if (jsonExists) {
      url.href += 'index.json';
      return url;
    }
    if (nodeExists) {
      url.href += 'index.node';
      return url;
    }
    return url;
  }
  if (await fileExists(path))
    return url;
  if (await fileExists(path + '.js')) {
    url.href += '.js';
    return url;
  }
  if (await fileExists(path + '.json')) {
    url.href += '.json';
    return url;
  }
  if (await fileExists(path + '.node')) {
    url.href += '.node';
    return url;
  }
  if (await fileExists(path + '/index.js')) {
    url.href += '/index.js';
    return url;
  }
  if (await fileExists(path + '/index.json')) {
    url.href += '/index.json';
    return url;
  }
  if (await fileExists(path + '/index.node')) {
    url.href += '/index.node';
    return url;
  }
  throw new Error(`Module ${url.href} not found.`);
}

function fileResolveSync (url) {
  if (!url.startsWith('file:'))
    return url;
  let path = decodeURIComponent(isWindows ? url.pathname.substr(1) : url.pathname);
  if (path[path.length - 1] === '/') {
    if (fs.existsSync(path + 'index.js')) {
      url.href += 'index.js';
      return url;
    }
    if (fs.existsSync(path + 'index.json')) {
      url.href += 'index.json';
      return url;
    }
    if (fs.existsSync(path + 'index.node')) {
      url.href += 'index.node';
      return url;
    }
  }
  if (fs.existsSync(path))
    return url;
  if (fs.existsSync(path + '.js')) {
    url.href += '.js';
    return url;
  }
  if (fs.existsSync(path + '.json')) {
    url.href += '.json';
    return url;
  }
  if (fs.existsSync(path + '.node')) {
    url.href += '.node';
    return url;
  }
  if (fs.existsSync(path + '/index.js')) {
    url.href += '/index.js';
    return url;
  }
  if (fs.existsSync(path + '/index.json')) {
    url.href += '/index.json';
    return url;
  }
  if (fs.existsSync(path + '/index.node')) {
    url.href += '/index.node';
    return url;
  }
  throw new Error(`Module ${url.href} not found.`);
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

module.exports = jspmResolve;
async function jspmResolve (name, parentUrl = new URL('file:' + process.cwd()), env = defaultEnv) {
  if (!parentUrl) {
    parentUrl = new URL('file:' + process.cwd())
  }
  else {
    if (typeof parentUrl === 'string')
      parentUrl = new URL(parentUrl, new URL('file:' + process.cwd()));
    else if (!(parentUrl instanceof URL))
      throw new Error('parentUrl must be a string or URL instance.');
    if (!parentUrl.href.startsWith('file:///'))
      throw new RangeError('Only "file:///" URLs are permitted for parent modules in the jspm NodeJS resolver.');
  }

  let config = await jspmResolve.getJspmConfig(parentUrl);

  if (!config)
    return await nodeModuleResolve(name, parentUrl, env);

  let jspmPackagesUrl = config.jspmPackagesUrl;
  let baseUrl = env.dev ? config.baseUrlDev : config.baseUrlProduction;

  let resolvedUrl;
  let resolvedPackage = parsePackageName(name);

  // exact package request (unencoded URI already)
  if (resolvedPackage) {
    // noop
  }
  // /, ./, ../
  else if (name[0] === '/' || name[0] === '.' && (name[1] === '/' || name[1] === '.' && name[2] === '/')) {
    resolvedUrl = new URL(name, parentUrl);
    resolvedPackage = parsePackageUrl(resolvedUrl, jspmPackagesUrl);
  }
  // URL
  else if (resolvedUrl = tryParseUrl(name)) {
    resolvedPackage = parsePackageUrl(resolvedUrl, jspmPackagesUrl);
  }
  // Plain name
  else {
    let stillPlain = true;

    // parent plain map
    let parentPackage = parsePackageUrl(parentUrl, jspmPackagesUrl);
    if (parentPackage) {
      let mapped = await config.applyParentMap(name, parentPackage.name, env);
      if (mapped) {
        if (mapped.startsWith('./'))
          return await fileResolve(new URL(name, packageToUrl(parentPackage, jspmPackagesUrl)));

        name = mapped;
        if (resolvedPackage = parsePackageName(name))
          stillPlain = false;
      }
    }

    // global plain map
    if (stillPlain) {
      let mapped = await config.applyGlobalMap(name, env);
      if (mapped) {
        if (mapped.startsWith('./'))
          return await fileResolve(new URL(mapped, baseUrl));

        name = mapped;
        if (resolvedPackage = parsePackageName(name))
          stillPlain = false;
      }
    }

    // node plain resolve fallback
    if (stillPlain)
      return await nodeModuleResolve(name, parentUrl);
  }

  if (resolvedPackage) {
    let mapped = await config.applyParentMap('.' + resolvedPackage.path, resolvedPackage.name, env);
    if (mapped) {
      let resolvedPackageUrl = packageToUrl(resolvedPackage.name, resolvedPackage.path, jspmPackagesUrl);
      // (relative map is always relative)
      return await fileResolve(new URL(mapped, resolvedPackageUrl));
    }
    else {
      resolvedUrl = packageToUrl(resolvedPackage, jspmPackagesUrl);
    }
  }

  else if (resolvedUrl.href.startsWith(baseUrl.href.substr(0, baseUrl.href.length - 1)) &&
      (resolvedUrl.href[baseUrl.href.length] === '/' || resolvedUrl.href.length === baseUrl.href.length - 1)) {
    let relPath = '.' + resolvedUrl.href.substr(baseUrl.href.length - 1);
    let mapped = await config.applyGlobalMap(relPath, env);
    if (mapped)
      return await fileResolve(new URL(mapped, baseUrl));
  }

  return await fileResolve(resolvedUrl);
}

jspmResolve.sync = jspmResolveSync;
function jspmResolveSync (name, parentUrl, env = defaultEnv) {
  if (!parentUrl) {
    parentUrl = new URL('file:' + process.cwd())
  }
  else {
    if (typeof parentUrl === 'string')
      parentUrl = new URL(parentUrl, new URL('file:' + process.cwd()));
    else if (!(parentUrl instanceof URL))
      throw new Error('parentUrl must be a string or URL instance.');
    if (!parentUrl.href.startsWith('file:///'))
      throw new RangeError('Only "file:///" URLs are permitted for parent modules in the jspm NodeJS resolver.');
  }

  let config = jspmResolve.getJspmConfigSync(parentUrl);

  if (!config)
    return nodeModuleResolveSync(name, parentUrl, env);

  let jspmPackagesUrl = config.jspmPackagesUrl;
  let baseUrl = env.dev ? config.jspmPackagesUrlDev : config.jspmPackagesUrlProduction;

  let resolvedUrl;
  let resolvedPackage = parsePackageName(name);

  // exact package request (unencoded URI already)
  if (resolvedPackage) {
    // noop
  }
  // /, ./, ../
  else if (name[0] === '/' || name[0] === '.' && (name[1] === '/' || name[1] === '.' && name[2] === '/')) {
    resolvedUrl = new URL(name, parentUrl);
    resolvedPackage = parsePackageUrl(resolvedUrl, jspmPackagesUrl);
  }
  // URL
  else if (resolvedUrl = tryParseUrl(name)) {
    resolvedPackage = parsePackageUrl(resolvedUrl, jspmPackagesUrl);
  }
  // Plain name
  else {
    let stillPlain = true;

    // parent plain map
    let parentPackage = parsePackageUrl(parentUrl, jspmPackagesUrl);
    if (parentPackage) {
      let mapped = config.applyParentMap(name, parentPackage.name, env);
      if (mapped) {
        if (mapped.startsWith('./'))
          return fileResolveSync(new URL(name, packageToUrl(parentPackage, jspmPackagesUrl)));

        name = mapped;
        if (resolvedPackage = parsePackageName(name))
          stillPlain = false;
      }
    }

    // global plain map
    if (stillPlain) {
      let mapped = config.applyGlobalMap(name, env);
      if (mapped) {
        if (mapped.startsWith('./'))
          return fileResolveSync(new URL(mapped, baseUrl));

        name = mapped;
        if (resolvedPackage = parsePackageName(name))
          stillPlain = false;
      }
    }

    // node plain resolve fallback
    if (stillPlain)
      return nodeModuleResolveSync(name, parentUrl);
  }

  if (resolvedPackage) {
    let mapped = config.applyParentMap('.' + resolvedPackage.path, resolvedPackage.name, env);
    if (mapped) {
      let resolvedPackageUrl = packageToUrl(resolvedPackage.name, resolvedPackage.path, jspmPackagesUrl);
      // (relative map is always relative)
      return fileResolveSync(new URL(mapped, resolvedPackageUrl));
    }
    else {
      resolvedUrl = packageToUrl(resolvedPackage, jspmPackagesUrl);
    }
  }

  else if (resolved.href.startsWith(baseUrl.href.substr(0, baseUrl.href.length - 1)) &&
      (resolved[baseUrl.href.length] === '/' || resolved.length === baseUrl.href.length - 1)) {
    let relPath = '.' + resolved.href.substr(baseUrl.href.length - 1);
    let mapped = config.applyGlobalMap(relPath, env);
    if (mapped)
      return fileResolveSync(new URL(mapped, baseUrl));
  }

  return fileResolveSync(resolvedUrl);
}

async function nodeModuleResolve (name, parentUrl, env) {
  let parentPath = decodeURIComponent(isWindows ? parentUrl.pathname.substr(1) : parentUrl.pathname);
  let resolved = await new Promise((resolve, reject) => {
    (env.browser ? browserResolve : nodeResolve)(name, {
      basedir: path.dirname(parentPath)
    }, (err, resolved) => err ? reject(err) : resolve(resolved));
  });
  return new URL(resolved, 'file:///');
}

function nodeModuleResolveSync (name, parentUrl, env) {
  let parentPath = decodeURIComponent(isWindows ? parentUrl.pathname.substr(1) : parentUrl.pathname);
  let resolved = (env.browser ? browserResolve : nodeResolve).sync(name, { filename: parentPath });
  return new URL(resolved, 'file:///');
}


/*
 * Keyed by '/'-separated unencoded directory path without trailing '/'
 * { jspmMtime, jspmPath, pjsonMtime, pjsonPath, config? }
 * Used to store and validate both configuration positives and configuration negatives
 */
const dirCache = {};

const rootSeparatorIndex = isWindows ? 11 : 8;

jspmResolve.getJspmConfig = getJspmConfig;
async function getJspmConfig (parentUrl) {
  let parentPath = decodeURIComponent(isWindows ? parentUrl.pathname.substr(1) : parentUrl.pathname);

  let curConfig;

  // walk down through the cache to find our first fresh project config
  // if a match and fresh then that is the starting point for main config loop
  let separatorIndex = parentPath.lastIndexOf('/');
  // if all of the folders we walk down from are cached, then we can use the cached config
  // otherwise we go through the main loop to evaluate back up from the cached base (if any)
  let allCached = true;
  do {
    let dir = parentPath.substr(0, separatorIndex);
    let cached = dirCache[dir];
    if (cached) {
      if (cached.jspmMtime !== await getMtime(cached.jspmPath) ||
          cached.pjsonMtime && cached.pjsonMtime !== await getMtime(cached.pjsonPath)) {
        separatorIndex = rootSeparatorIndex;
        break;
      }

      if (cached.config) {
        curConfig = cached.config;

        if (allCached)
          return curConfig;

        separatorIndex = parentPath.indexOf('/', separatorIndex + 1);
        break;
      }
    }
    else {
      allCached = false;
    }

    separatorIndex = parentPath.lastIndexOf('/', separatorIndex - 1);
  }
  while (separatorIndex > rootSeparatorIndex); // (dont permit root-level project)

  // main config loop
  // walk up through the folders, following nesting rules of jspm_packages and node_modules
  // as well as package.json and jspm.json project configurations
  // in order to determine the final configuration
  do {
    let dir = parentPath.substr(0, separatorIndex);

    // node_modules acts as a jspm project boundary
    if (dir.endsWith('/node_modules')) {
      curConfig = undefined;
      continue;
    }

    // dont detect jspm projects within the jspm_packages folder until through the
    // package boundary
    if (curConfig) {
      if (dir.length === curConfig.jspmPackagesPath.length - 1 && dir.startsWith(curConfig.jspmPackagesPath.substr(0, curConfig.jspmPackagesPath.length - 1))
          || dir.startsWith(curConfig.jspmPackagesPath)) {
        let parsedPackage = parsePackagePath(dir, curConfig.jspmPackagesPath);
        if (!parsedPackage || parsedPackage.path === '')
          continue;
      }
    }

    // attempt to detect a jspm project rooted in this folder
    // will return undefined if nothing found
    let dirConfig = await readJspmConfig(dir);
    if (dirConfig)
      curConfig = dirConfig;
  }
  while ((separatorIndex = parentPath.indexOf('/', separatorIndex + 1)) !== -1);

  return curConfig;
}
jspmResolve.getJspmConfigSync = getJspmConfigSync;
function getJspmConfigSync (parentUrl) {
  let parentPath = decodeURIComponent(isWindows ? parentUrl.pathname.substr(1) : parentUrl.pathname);

  let curConfig;

  // walk down through the cache to find our first fresh project config
  // if a match and fresh then that is the starting point for main config loop
  let separatorIndex = parentPath.lastIndexOf('/');
  // if all of the folders we walk down from are cached, then we can use the cached config
  // otherwise we go through the main loop to evaluate back up from the cached base (if any)
  let allCached = true;
  do {
    let dir = parentPath.substr(0, separatorIndex);
    let cached = dirCache[dir];
    if (cached) {
      if (cached.jspmMtime !== getMtimeSync(cached.jspmPath) ||
          cached.pjsonMtime && cached.pjsonMtime !== getMtimeSync(cached.pjsonPath)) {
        separatorIndex = rootSeparatorIndex;
        break;
      }

      if (cached.config) {
        curConfig = cached.config;

        if (allCached)
          return curConfig;

        separatorIndex = parentPath.indexOf('/', separatorIndex + 1);
        break;
      }
    }
    else {
      allCached = false;
    }

    separatorIndex = parentPath.lastIndexOf('/', separatorIndex - 1);
  }
  while (separatorIndex > rootSeparatorIndex); // (dont permit root-level project)

  // main config loop
  // walk up through the folders, following nesting rules of jspm_packages and node_modules
  // as well as package.json and jspm.json project configurations
  // in order to determine the final configuration
  do {
    let dir = parentPath.substr(0, separatorIndex);

    // node_modules acts as a jspm project boundary
    if (dir.endsWith('/node_modules')) {
      curConfig = undefined;
      continue;
    }

    // dont detect jspm projects within the jspm_packages folder until through the
    // package boundary
    if (curConfig) {
      if (dir.length === curConfig.jspmPackagesPath.length - 1 && dir.startsWith(curConfig.jspmPackagesPath.substr(0, curConfig.jspmPackagesPath.length - 1))
          || dir.startsWith(curConfig.jspmPackagesPath)) {
        let parsedPackage = parsePackagePath(dir, curConfig.jspmPackagesPath);
        if (!parsedPackage || parsedPackage.path === '')
          continue;
      }
    }

    // attempt to detect a jspm project rooted in this folder
    // will return undefined if nothing found
    let dirConfig = readJspmConfigSync(dir);
    if (dirConfig)
      curConfig = dirConfig;
  }
  while ((separatorIndex = parentPath.indexOf('/', separatorIndex + 1)) !== -1);

  return curConfig;
}

/*
 * This function is on the cache miss path
 * So it doesn't matter if it isn't fully fs-optimized
 * Populates dirCache[dir] for what it processes
 */
async function readJspmConfig (dir) {
  let jspmPath = dir + '/jspm.json';
  let pjsonPath = dir + '/package.json';

  let [pjsonMtime, pjson] = await Promise.all([getMtime(pjsonPath), readJSON(pjsonPath)]);

  if (pjson) {
    if (pjson.configFiles && pjson.configFiles.jspm && !pjson.configFiles.jspm.startsWith('..'))
      jspmPath = path.resolve(dir, pjson.configFiles.jspm);
  }

  let [jspmMtime, jspmJson] = await Promise.all([getMtime(jspmPath), readJSON(jspmPath)]);

  let config;
  if (jspmJson)
    config = new JspmConfig(dir, jspmJson, pjson);

  dirCache[dir] = { pjsonPath, pjsonMtime, jspmPath, jspmMtime, config };

  if (config)
    return config;
}

function readJspmConfigSync (dir) {
  let jspmPath = dir + '/jspm.json';
  let pjsonPath = dir + '/package.json';

  let pjsonMtime = getMtimeSync(pjsonPath);
  let pjson = pjsonMtime !== undefined && readJSONSync(pjsonPath);

  if (pjson) {
    if (pjson.configFiles && pjson.configFiles.jspm && !pjson.configFiles.jspm.startsWith('..'))
      jspmPath = path.resolve(dir, pjson.configFiles.jspm);
  }

  let jspmMtime = getMtimeSync(jspmPath);
  let jspmJson = jspmMtime !== undefined && readJSONSync(jspmPath);

  let config;
  if (jspmJson)
    config = new JspmConfig(dir, jspmJson, pjson);

  dirCache[dir] = { pjsonPath, pjsonMtime, jspmPath, jspmMtime, config };

  if (config)
    return config;
}

class JspmConfig {
  constructor (dir, jspmJson, pjson) {
    let basePathDev = dir + '/';
    let basePathProduction = basePathDev;
    let jspmPackagesPath = dir + 'jspm_packages/';

    if (pjson && typeof pjson.directories === 'object') {
      if (typeof pjson.directories.packages === 'string' && !pjson.directories.packages.startsWith('..'))
        jspmPackagesPath = path.resolve(dir, pjson.directories.packages);
      if (typeof pjson.directories.lib === 'string' && !pjson.directories.lib.startsWith('..'))
        basePathDev = basePathProduction = path.resolve(dir, pjson.directories.lib);
      if (typeof pjson.directories.dist === 'string' && !pjson.directories.dist.startsWith('..'))
        basePathProduction = path.resolve(dir, pjson.directories.dist);
    }

    this.config = jspmJson;
    this.jspmPackagesPath = jspmPackagesPath;
    this.jspmPackagesUrl = new URL('file:' + encodeURI(jspmPackagesPath));
    this.baseUrlDev = new URL('file:' + encodeURI(basePathDev));
    this.baseUrlProduction = new URL('file:' + encodeURI(basePathProduction));
  }

  applyGlobalMap (name, env) {
    return applyMap(name, this.config.map, env);
  }

  applyParentMap (name, parentPackageName, env) {
    let packageConfig = this.config.dependencies[parentPackageName];
    if (!packageConfig || !packageConfig.map)
      return;
    return applyMap(name, packageConfig.map, env);
  }
}

function applyMap (name, parentMap, env) {
  let mapped;
  let separatorIndex = name.length;
  do {
    let match = name.substr(0, separatorIndex);
    let replacement = parentMap[match];
    if (replacement) {
      if (typeof replacement !== 'string') {
        for (let c in replacement) {
          if (env[c] === true) {
            replacement = replacement[c];
            break;
          }
        }
      }
      return replacement + name.substr(match.length);
    }
    separatorIndex = name.lastIndexOf('/', separatorIndex - 1);
  }
  while (separatorIndex !== -1)
}

async function fileExists (path) {
  return new Promise((resolve, reject) => {
    fs.access(path, err => {
      if (err) {
        if (err.code === 'ENOENT')
          resolve(false);
        else
          reject(err);
      }
      else {
        resolve(true);
      }
    });
  });
}

// returns undefined if not existing
// supports following symlinks
function getMtime (path) {
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

function getMtimeSync (path) {
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
async function readJSON (path) {
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

function readJSONSync (path) {
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
