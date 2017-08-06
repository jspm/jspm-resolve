# JSPM Resolver Specification

This is the primary specification of the jspm 2.0 NodeJS-compatible resolver.

The jspm resolver specified here is now fully compatible with the NodeJS resolution algorithm,
while the SystemJS browser resolver which allows custom browser resolution configuration is specified at the SystemJS project
page at https://github.com/systemjs/systemjs/blob/0.20.14/docs/production-build.md#resolution-algorithm.

jspm 2.0 separates the browser and NodeJS resolvers into two separate resolvers since one of the greatest points of difficulty with jspm before the 2.0 version was the lack of support for the NodeJS module resolution system. As a result, the goal of trying to support a unified universal browser and NodeJS resolver has been abandoned.

## jspm Resolver Principles

All module names in the WhatWG loader are treated as URLs with the encoding rules that apply. When using an ES module loader running in NodeJS, [`file:///` URLs](https://blogs.msdn.microsoft.com/ie/2006/12/06/file-uris-in-windows/) are the preferable way to maintain compatilibity, to ensure that the handling of resolution and encoding cases is shared between the browser and Node.

For the purposes of practicality though, the jspm NodeJS resolution algorithm is specified as a specification on paths, just like the NodeJS module resolution algorithm.

The idea here is that normalization from URL into path space is handled as a pre-resolution transform on the specifier which is defined in the main resolver algorithm here, before returning the correct valid absolute file path for the system.

### Plain Names

`plain names` or `bare names` as they are referred to in the WhatWG loader specification are module names
that do not start with `/` or `./` or `../` and do not parse as valid URLs.

Plain names are the module names that run through multiple remapping phases, although absolute URL names can be remapped as well
through contextual relative map configuration.

### Distinguishing between jspm Modules and Node Modules

The jspm resolver relies on the ability to know whether a given module path should be treated as a jspm module or a NodeJS module in order to provide full compatibility.

This detection is based on detecting both a `package.json` and a `jspm.json` jspm configuration as indicating a jspm package boundary, and a `node_modules` folder as indicating a NodeJS package boundary. The jspm package boundary then extends from the `package.json` configuration file folder through all subfolders, stopping at any `node_modules` subfolders. When a nested jspm configuration is found, the nested configuration take precedence over the lower-level configuration, only if the nested jspm boundary `package.json` file folder path does not exactly correspond to a package path of the parent project. Modules without a `jspm.json` and `package.json` combination in all their parent folder paths are treated as NodeJS modules.

### Module Format Handling

A package with either a `"jspm"` or `"module"` property in its package.json file is deemed to be a package consisting of ES modules. Without either
of these properties it is deemed to be a CommonJS module package. This is in line with the NodeJS proposal at https://github.com/nodejs/node-eps/pull/60.

In addition, a module which ends in `.mjs` or contains a `"use module"` directive, is always loaded as an ES module.

CommonJS modules can only load other CommonJS modules (throwing when attempting to load ES modules), while ES modules can load either format.

CommonJS modules are resolved using the same jspm resolver here, except for when loading CommonJS from node_modules, when the NodeJS resolver is used.

### Package.json Configuration

#### Project Configuration

Every jspm project must have a `package.json` file, which is contained in the base path of the project. In addition, each installed package has its own `package.json` file which is used as a reference for resolutions. The base project configuration and the installed package resolutions act as the two roles of the `package.json` file.

For the base project configuration, the following properties are used by the resolver:

`package.json`:
```js
{
  "directories": {
    "lib": RelOrPlain,
    "dist": RelOrPlain,
    "packages": RelOrPlain,
  },
  "configFiles": {
    "jspm": RelOrPlain
  }
}
```

Where `RelOrPlain` is defined as a `/`-separated path name that either starts with `./`, is equal to `.` or is a plain name.

* `directories.lib`: Configures the default `parentUrl` (`baseUrl`) path under the `dev` environment conditional. Defaults to `"."`.
* `directories.dist`: Configures the default `parentUrl` (`baseUrl`) path under the `production` environment conditional. Defaults to the value of `lib`.
* `directories.packages`: Configures the location of the jspm packages folder. Defaults to `jspm_packages`.
* `configFiles.jspm`: The path to the `jspm.json` file. Defaults to `"jspm.json"`.

#### Map Configuration

In addition to project configuration, the `package.json` file is used to configure mappings both for installed dependencies and for the local project, based on supporting the following `map` property structure:

`package.json`:
```js
{
  "map": {
    [name: RelOrPlain]: RelOrPlain | ExactPackagePath | ConditionalMap
  }
}
```

where:

* `RelOrPlain` is as above, a `/`-separated name that either starts with `./`, is equal to `.` or is a plain name.
* `ExactPackagePath` is a string either satisfying the package name regular expression, or starting with a string satisfying the package name regular expressions followed by a `/${path}` string.
* `ConditionalMap` is an object mapping condition value strings to map values (`{ [ConditionName: string]: RelOrPlain | ExactPackagePath | ConditionalMap }`). Condition names can take values `"browser" | "node" | "dev" | "production" | "module" | "react-native" | "electron" | "default"`, with the first matching condition map recursively taken to be the resultant map. `"default"` is always set to true, `"module"` is true when the parent module is an ES module only, and the others are resolver environment specific.

The resolve object is a map configuration that replaces the best matched starting prefix of the name.

In addition the following constraint is placed:

> Package-relative resolutions (starting with `./`) can only resolve to other package-relative resolutions. This is to ensure a well-defined staged resolution process without circularity edge cases.

If using the `"browser"`, `"electron"`, `"react-native"`, `"main"` or `"module"` package.json properties, these will be internally desugared into map.

For example:

```js
{
  "main": "./x",
  "module": "./y"
}
```

is sugar for:

```js
{
  "map": {
    ".": {
      "module": "./y",
      "default": "./x"
    }
  }
}
```
<!---
While:

```js
{
  "main": "index.js",
  "module": "index.mjs",
  "module.browser": {
    "./x": "./y"
  },
  "browser": {
    "./index.js": "./index-browser.js",
    "./index.mjs": "./index-browser.mjs",
    "./x": "./y"
  }
}
```

desugars to:

```js
{
  "map": {
    ".": {
      "module": {
        "browser": "./index-browser.mjs",
        "default": "./index.mjs"
      },
      "default": {
        "browser": "./index-browser.js",
        "default": "./index.js"
      }
    },
    "./x": {
      "browser": "./y"
    }
  }
}
```
--->
Note that the `module` main will always take preference over the `browser` main, while browser mappings always apply to the browser environment regardless of the module format.

### jspm Config File

The `jspm.json` jspm configuration file stores jspm configuration and version lock information for jspm projects.

The full jspm configuration file will have its own specification page in future. For the resolver, the following
properties are the only ones which affect the jspm resolution of a module:

`jspm.json`:
```js
{
  // Top-level dependency versions
  "resolve": {
    [name: PlainName]: ExactPackageName
  },
  // Installed dependency version ranges
  "dependencies": {
    [exactName: ExactPackageName]: {
      "resolve": {
        [name: PlainName]: ExactPackageName
      }
    }
  }
}
```

Where the above types are defined by:

* `PlainName`: A string `s` satisfying `isPlainName(s)`.
* `ExactPackageName`: A string `s` satisfying the package name regular expression.

When these configuration type assertions are broken, the configuration is considered invalid, and the entire resolution will
abort on the assertion error.

## Algorithms

All URL operations here are handled exactly as in the WhatWG URL specification, including the handling of encodings and errors.

Any error in any operation, including assertion errors, should be fully propagated as a top-level resolve error abrupt completion.

### Path Resolution

Module specifiers are considered relative URLs, so obey URL encoding and normalization rules.

This specification handles resolution in path space, including handling of `.` and `..` internal segments, converting `\\` into `/` for the resolution process, before outputting a valid pathname for the environment using the _"/"_ separator at the end of resolution.

The reason for this is that resolution in URL space with mappings results in moving between spaces as maps are in path-space, while resolution is in URL space. The first iteration of the resolver was written entirely in URL space, but converted into path space for performance and simplicity.

The resolution algorithm handles converting the import specifier name through URL-space conversions. As an example of the kinds of issues that need to be handled converting between URL and path spaces:

```js
import './🎉\\x%20.js';
```

would normalize into the URL `file:///parent/path/%F0%9F%8E%89/%20%2F.js` (which would also be the module name as stored in the module registry running a module loader in NodeJS), representing the file path `/parent/path/🎉/x .js` on the file system.

In addition, encodings of `/` and `\\` (`%2F` and `%5C`) are not permitted as file path encodings for security, and will throw when attempting to access the file system.

To match URL resolution behaviours, `/c:/path` and `//\\c:\\path` will resolve absolutely into `file:///c:/path`, while `c:\\path` will resolve to an invalid `c:` protocol and `//c:/path` will fail resolution.

### Plain Name Detection

This detection is exactly as in the [WhatWG module resolution detection](https://html.spec.whatwg.org/multipage/webappapis.html#resolve-a-module-specifier):

> **IS_PLAIN(name: String): boolean**
> 1. If _name_ parses as a valid URL then return _false_.
> 1. Otherwise if _name_ begins with _"/"_, _"./"_ or _"../"_ then return _false_.
> 1. Otherwise return _true_.

### Relative Name Detection

Relative names are determined by the algorithm:

> **IS_RELATIVE(name: String): boolean**
> 1. If _name_ begins with _"./"_ return _true_.
> 1. Otherwise return _false_.

### Package Name Detection

Package names in canonical form are names of the form `registry:package@version`.

Valid package names satisfy the JS regular expression:

```js
/^[a-z]+:[@\-_\.a-zA-Z\d][-_\.a-zA-Z\d]*(\/[-_\.a-zA-Z\d]+)*@[^@<>:"/\|?*^\u0000-\u001F]+$/
```

For compatibility with cross-platform file paths, the following character classes are not permitted in versions: `[@<>:"/\|?*^\u0000-\u001F]`.

The convention encouraged for versions that contain these characters is to encode these characters when used in unambiguous inputs, such that
they are replaced by their URI percent encoding.

So that for example, `jspm install x@a/b` is sanitized as an input into the canonical name `x@a%2F`, which is the form used in the jspm configuration files and file paths thereafter.

A package called `registry:package@version` in jspm is stored in `/path/to/jspm_packages/registry/package@version/`.

To convert a package between these forms, the following methods are defined:

> **PARSE_PACKAGE_CANONICAL(canonical: String): { name: String, path: String }**
> 1. Let _name_ be the unique substring of _name_ starting from the first index, that satisfies the package name regular expression.
> 1. If _name_ is _undefined_ then,
>    1. Return _undefined_.
> 1. Let _path_ be the substring of _canonical_ starting from the index of the length of _name_.
> 1. If _path_ is not the empty string and does not start with _"/"_
>    1. Return _undefined_.
> 1. Return the object with values _{ name, path }_.

> **PARSE_PACKAGE_PATH(path: String, jspmPackagesPath: String): { name: String, path: String }**
> 1. Assert _jspmPackagesPath_ is a valid file system path.
> 1. Assert _jspmPackagesPath_ ends with the path segment _"jspm_packages"_.
> 1. If _path_ does not start with the string _jspmPackagesPath_ then,
>    1. Return _undefined_.
> 1. Let _relPackagePath_ be the substring of _path_ starting at the index of the length of _jspmPackagesPath_.
> 1. Let _registrySep_ be the index of _"/"_ in _relPackagePath_.
> 1. _If _registrySep_ is not defined then,
>    1. Return _undefined_.
> 1. Let _canonical_ be the result of replacing the character at _registrySep_ in _relPackagePath_ with _":"_.
> 1. If _canonical_ does not contain a zero-indexed substring matching the package name regular expression then,
>    1. Return _undefined_.
> 1. Let _name_ be the unique substring of _canonical_ starting from the first character, matched against the package name regular expression.
> 1. Let _path_ be the substring of _canonical_ from the index of the length of _name_.
> 1. If _path_ is defined and _path_ does not start with _"/"_ then,
>    1. Return _undefined_.
> 1. Return the object with values _{ name, path }_.

> **PACKAGE_TO_PATH(name: String, jspmPackagesPath: String): String**
> 1. Assert _jspmPackagesPath_ is a valid file system path.
> 1. Assert _jspmPackagesPath_ ends with the path segment _"jspm_packages"_.
> 1. Assert _name_ satisfies the valid package name regular expression.
> 1. Replace in _name_ the first _":"_ character with _"/"_.
> 1. Return the result of the path resolution of _"${name}"_ within parent _jspmPackagesParent_.

The parse functions return undefined if not a valid package canonical name form, while the package to URL function must
always be called against a valid package canonical name form.

### Path Resolution

All paths are resolved using the OS-specific resolver handling, using the `/` separator, replacing any instances of the `\\` separator
on Windows only.

When resolving paths in Windows, we ensure that resolution uses the `/` separator for greater consistency between platforms.
The reason for this is that `/` is supported fine as a path separator in Windows APIs (eg for `C:/some/path`), which is enough of
a change to remove a lot of the pain in working with cross-platform path handling.

### Reading jspm Configuration

Given a file path, we can determine the base project folder, jspm packages path and jspm configuration with the following algorithm:

> **GET_JSPM_CONFIG(modulePath: String)**
> 1. Let _parentPaths_ be the array of parent paths of _modulePath_ ordered by length decreasing, excluding a trailing separator.
> 1. For each _path_ of _parentPaths_,
>    1. If the last path segment of _path_ is equal to _"node_modules"_ then,
>       1. Return _undefined_.
>    1. If the file at _"package.json"_ within the folder _path_ does not exist then,
>       1. Continue the loop.
>    1. Let _pjson_ be set to the output of the JSON parser applied to the contents of _"package.json"_ in _path_, throwing a _Configuration Error_ on invalid JSON.
>    1. Let _jspmConfigPath_ be the resolved path of _"jspm.json"_ within parent folder _path_.
>    1. If _pjson.configFiles?.jspm_ is a relative URL without backtracking,
>       1. Set _jspmConfigPath_ to the path resolution of _pjson.configFiles.jspm_ to _path_.
>    1. Let _jspmConfig_ be set to _undefined_.
>    1. If the file at _jspmConfigPath_ exists,
>       1. Set _jspmConfig_ to the output of the JSON parser applied to the contents of _jspmConfigPath_, throwing a _Configuration Error_ on invalid JSON.
>    1. If _jspmConfig_ is not _undefined_ then,
>       1. Let _jspmPackagesPath_ be set to the resolved path of _"jspm_packages/"_ within parent folder _path_.
>       1. If _pjson.directories?.packages_ is a relative URL without backtracking,
>          1. Set _jspmPackagesPath_ to the resolved path of _pjson.directories.packages_ to _path_ with a trailing path separator.
>       1. Let _localPackagePath_ be set to _path_.
>       1. If _pjson.directories?.lib is a relative path without backtracking,
>          1. Set _localPackagePath_ to the path resolution of _pjson.directories.lib_ to _path_.
>       1. If _pjson.directories?.dist is a relative path without backtracking,
>          1. If the environment conditional _production_ is _true_,
>             1. Set _localPackagePath_ to the path resolution of _pjson.directories.dist_ to _path_.
>       1. If _localPackagePath_ has a trailing path separator, then remove it.
>       1. If _localPackagePath_ is equal to or a subpath of _jspmPackagesPath_ then,
>          1. Set _localPackagePath_ to _path_.
>       1. Let _projectBasePath_ be set to _path_.
>       1. Return the object with values _{ projectBasePath, jspmConfig, jspmPackagesPath, localPackagePath }_.
> 1. Return _undefined_.

The return value of the above method is either `undefined` or an object of the form `{ jspmConfig, jspmPackagesPath, localPackagePath }`.

This algorithm only needs to be applied once per given base project path, and can be cached after that.

### Reading Package Configuration

For resolving map configurations within packages, the resolver reads the `package.json` file for each package loaded. This is done with the following algorithm:

> **GET_MAP(packagePath: String)**
> 1. If the file at _${packagePath}/package.json_ does not exist then,
>    1. Return _undefined_.
> 1. Let _pjson_ be set to the output of the JSON parser applied to the contents of _"${packagePath}/package.json"_, throwing a _Configuration Error_ on invalid JSON.
> 1. Let _map_ be set to the value of _pjson.map_, or _undefined_ if there is no map property.
> 1. Let _mainMap_ be equal to the value of _map['.']_ or a new empty object if undefined.
> 1. If the property _pjson.module_ is a string then,
>    1. Set _mainMap.module_ to the value of _pjson.module_.
> 1. If _pjson.electron_ is a _string_ then,
>    1. Set _mainMap.electron_ to _pjson.electron_.
> 1. If _pjson.react-native_ is a _string_ then,
>    1. Set _mainMap.react-native_ to _pjson.react-native_.
> 1. If _pjson.browser_ is a _string_ then,
>    1. Set _mainMap.browser_ to _pjson.browser_.
> 1. If _pjson.browser_ is an _object_ then,
>    1. For each key _name_ in _pjson.browser_,
>       1. If _name_ is a _string_ then,
>          1. If _map_ is _undefined_ then set _map_ to a new empty object.
>          1. Set _map.browser[name]_ to the value of _pjson.browser[name]_.
> 1. If the property _pjson.main_ exists and is a string then,
>    1. Set _mainMap.default_ to _pjson.main_
> 1. If _mainMap_ is not an empty object then,
>    1. If _map_ is _undefined_ then set _map_ to a new empty object.
>    1. Set _map['.']_ to _mainMap_.
> 1. Return _map_.

The responses of this method can be cached for the resolver lifecycle.

### Matching and Applying Map Resolution

jspm configurations use resolve maps to match a plain name and direct it to a new module name.
Matching a map is based on finding the longest map target that matches the start of the plain name.

Map configurations in the jspm configurations also support conditional objects which represent map branches based
on environment conditionals.

Match boundaries are taken to be the `/` separator or the end of the name. In this way the map `{ 'x/y': 'z' }` can match both `x/y` and `x/y/path`.

Main maps are also supported via the map of `{ '.': './main.js' }`, and are handled to work out correctly, while not matching `./`.

Applying the map is then the process of adding back the subpath after the match (`x/y/path` mapping into `z/path` for the `{ 'x/y': 'z' }` map), including support for condition branches:

> **APPLY_MAP(name: String, resolveMap: Object)**
> 1. Assert _IS_RELATIVE(name)_ or _IS_PLAIN(name)_.
> 1. Let _match_ be set to _undefined_.
> 1. Let _parentNames_ be the set of parent paths of _name_ (_"/"_ separated), including _name_ itself, in descending order (each item without the last separated segment from the previous one and without a trailing separator).
> 1. If the last item of _parentNames_ is the string _"."_ then,
>    1. If this is the only item of _parentNames_ and _resolveMap["."]_ is not _undefined_ then,
>       1. Set _match_ to _"."_.
>    1. Otherwise, remove the last item from _parentNames_.
> 1. If _match_ is not _undefined_ then,
>    1. For each _parentName_ of _parentNames_,
>       1. If _resolveMap_ has an entry for _parentName_ then,
>          1. Set _match_ to _parentName_.
>          1. Break the loop.
> 1. If _match_ is _undefined_ then,
>    1. Return _undefined_.
> 1. If _IS_RELATIVE(match)_ or _IS_PLAIN(match)_ is equal to false then,
>    1. Throw an _Invalid Configuration_ error.
> 1. Let _replacement_ be the value of _resolveMap[match]_.
> 1. While _replacement_ is an _Object_,
>    1. For each property _condition_ of _replacement_,
>       1. If _condition_ is the name of an environment conditional that is _true_.
>          1. Set _replacement_ to the value of _replacement[condition]_.
>          1. Continue the next outer loop iteration.
>    1. Return _undefined_.
> 1. Assert _replacement_ is a _string_.
> 1. If _IS_RELATIVE(match)_ then,
>    1. If _IS_RELATIVE(replacement)_ is _false_ and _replacement_ is not equal to _"@empty"_, or if _replacement_ contains any _".."_ or _"."_ path segments from after the second character index then,
>       1. Throw an _Invalid Configuration_ error.
> 1. Otherwise,
>    1. If _IS_RELATIVE(replacement)_ or _IS_PLAIN(replacement)_ is _true_ or _PARSE_PACKAGE_CANONICAL(replacement)_ is _undefined_ then,
>       1. Throw an _Invalid Configuration_ error.
> 1. Return _replacement_ concatenated with the substring of _name_ from the index at the length of _match_ to the end of the string.


### Extension and Directory Index Handling

Like the NodeJS module resolution, jspm 2.0 supports automatic extension and directory index handling.

There is one exception added to this which is that if a path ends in a separator character it is allowed not to resolve at all,
in order to support directory resolution utility functions.

In addition, jspm does not implement the real path lookup for modules loaded. This allows globally and locally linked packages to be scoped to the project they are loaded in, so the entire resolution for the project is managed through a single jspm configuration file despite many packages possibly being linked in.

The full algorithm applied with this directory addition is:

> **FILE_RESOLVE(path: string)**
> 1. Assert _path_ is a valid file path.
> 1. If _path_ ends with the character _"/"_ then,
>    1. Return _path_.
> 1. If the file at _path_ exists,
>    1. Return _path_.
> 1. If the file at _"${path}.js"_ exists,
>    1. Return _"${path}.js"_.
> 1. If the file at _"${path}.json"_ exists,
>    1. Return _"${path}.json"_.
> 1. If the file at _"${path}.node"_ exists,
>    1. Return _"${path}.node"_.
> 1. If the file at _"${path}${sep}index.js"_ exists,
>    1. Return _"${path}${sep}index.js"_.
> 1. If the file at _"${path}${sep}index.json"_ exists,
>    1. Return _"${path}${sep}index.json"_.
> 1. If the file at _"${path}${sep}index.node"_ exists,
>    1. Return _"${path}${sep}index.node"_.
> 1. Throw a _Module Not found_ error.

### Module Resolution Algorithm

Module resolution is always based on resolving `resolve(name, parentPath)` where `name` is the optional unresolved
name to resolve and `parentPath` is an absolute file path to resolve relative to.

The resolver is based on two main parts - plain name resolution, and relative resolution.

Plain name resolution first checks plain package maps, then the jspm dependency resolution, then the global jspm resolution (top-level jspm installs) before falling back to delegating entirely to the `node_modules` NodeJS resolution. If no plain resolution is in the NodeJS resolution, an error is thrown.

Relative resolution is applied after jspm plain configuration, based on detecting if the parent path is the base project or a package path, and then resolving the relative parent path using the package relative map configuration.

When handling conditional resolution, the environment conditional state is required to be known, an object of the form:

```js
{
  browser: boolean,
  node: boolean,
  production: boolean,
  dev: boolean,
  react-native: boolean,
  electron: boolean,
  module: boolean,
  default: true
}
```

Where `production` and `dev` must be mutually exclusive, while `browser` and `node` can both be true for environments like Electron.

Package name requests are supported of the form `registry:name@version[/path]`, as direct imports and as targets of map configurations. A package name request with only a `/` path will return the package name exactly, not applying the main map (`.` map), so that this utility approach can be used to resolve package folders through plain mappings.

There is only one core reserved module name and that is `@empty`, which when used as a plain name or in maps will return `undefined` from the resolver (in addition this is the only way `undefined` can be returned by the resolver). All other core module name matching needs to be handled outside of this resolver.

The resolver will either return undefined or a resolved path string, or throw a _Module Not Found_, _Invalid Module Name_ or _Invalid Configuration_ error.

Package name requests and plain name requests are both considered unescaped - that is URL decoding will not be applied. URL decoding is only applied to URL-like requests.

The parent pathname is assumed a valid fully-resolved path in the environment. Any `\\` in Windows paths are converted into `/` for consistency within this resolver. Absolute paths, URLs, URL-encoding, and relative segments are not supported in the parent path.

In order to make the resolver an idempotent path resolver, the following exceptions apply to absolute paths - if a path begins with a single forward slash in posix or if it begines with a letter colon and backlash in Windows (eg `C:\`) then it is not decoded as URI.

Before resolution can be run, the resolver needs to be initialized against a _projectPath_:

> **JSPM_RESOLVE_INIT(projectPath: string)**
> 1. Let _config_ be the return value of _GET_JSPM_CONFIG(projectPath)_.
> 1. If _config_ is not _undefined_ then,
>    1. Let _jspmConfig_, _jspmPackagesPath_, _localPackagePath_, _projectBasePath_ be the destructured values of _config_.
>    1. Set the [[jspmConfig]] internal property to _jspmConfig_.
>    1. Set the [[jspmPackagesPath]] internal property to _jspmPackagesPath_.
>    1. Set the [[localPackagePath]] internal property to _localPackagePath_.
>    1. Set the [[projectBasePath]] internal property to _projectBasePath_.

The resolution algorithm breaks down into the following high-level process to get the fully resolved URL:

> **JSPM_RESOLVE(name: string, parentPath: string)**
> 1. Assert _parentPath_ is a valid absolute file system path.
> 1. If _parentPath_ is not contained within _[[projectBasePath]]_ then,
>    1. Let _R_ be a new resolver initialized against the parent path _parentPath_.
>    1. Return the result of _R.JSPM_RESOLVE(name, parentPath)_.
> 1. If _IS_PLAIN(name)_ then,
>    1. If _[[jspmConfig]]_ is _undefined_ then,
>       1. Return the result of _NODE_RESOLVE(name, parentPath)_.
>    1. Let _parentPackage_ be the result of _PARSE_PACKAGE_PATH(parentPath, [[jspmPackagesPath]])_.
>    1. If _parentPackage_ is not _undefined_ then,
>       1. Let _parentPackagePath_ be the value of _PACKAGE_TO_PATH(parentPackage, [[jspmPackagesPath]])_.
>       1. Let _parentPackageMap_ be the value of _GET_MAP(parentPackagePath)_.
>       1. If _parentPackageMap_ is not _undefined_ then,
>          1. Let _mapped_ be the value of _APPLY_MAP(name, parentPackageMap)_
>          1. If _mapped_ is not _undefined_ then,
>             1. If _mapped_ starts with _"./"_ then,
>                1. Let _resolved_ be the path resolution of _name_ to _${parentPackagePath}${parentPackage.path}_.
>                1. Return _FILE_RESOLVE(resolved)_.
>             1. Otherwise, set _name_ to _mapped_.
>       1. If _IS_PLAIN(name)_ then,
>          1. Let _parentPackageResolveMap_ be the value of _[[jspmConfig]].dependencies[parentPackage]?.resolve_.
>          1. If _parentPackageResolveMap_ is not _undefined_ then,
>             1. Let _mapped_ be the value of _APPLY_MAP(name, parentPackageResolveMap)_
>             1. If _mapped_ is not _undefined_ then,
>                1. If _mapped_ starts with _"./"_ then,
>                   1. Let _resolved_ be the path resolution of _name_ to _${parentPackagePath}${parentPackage.path}_.
>                   1. Return _FILE_RESOLVE(resolved)_.
>                1. Otherwise, set _name_ to _mapped_.
>    1. If _IS_PLAIN(name)_ and _[[jspmConfig]].map_ is not _undefined_ then,
>       1. Let _mapped_ be the value of _APPLY_MAP(name, [[jspmConfig]].map)_.
>       1. If _mapped_ is not _undefined_ then,
>          1. If _mapped_ starts with _"./"_ then,
>             1. Let _resolved_ be the path resolution of _mapped_ to _[[localPackagePath]]_.
>             1. Return _FILE_RESOLVE(resolved)_.
>          1. Otherwise, set _name_ to _mapped_.
>    1. If _IS_PLAIN(name)_ then,
>       1. If _name_ is equal to the string _"@empty"_ then,
>          1. Return _undefined_.
>       1. Return the result of _NODE_RESOLVE(name, parentPath)_.
> 1. Let _resolved_ be equal to _undefined_.
> 1. Let _resolvedPackage_ be the result of _PARSE_PACKAGE_CANONICAL(name)_.
> 1. If _resolvedPackage_ is not _undefined_ and  _[[jspmConfig]]_ is _undefined_ then,
>    1. Throw an _Invalid Module Name_ error.
> 1. If _resolvedPackage_ is _undefined_ then,
>    1. If in a Windows environment and _name_ begins with a letter followed by a colon and backslash then,
>      1. Set _name_ to _/${name}_.
>    1. If _name_ contains the substring _"%2F"_ or _"%5C"_ then,
>       1. Throw an _Invalid Module Name_ error.
>    1. Replace in _name_ all percent-encoded values with their URI-decodings.
>    1. If _name_ starts with _"//"_ and _name_ does not start with _"///"_ then,
>       1. Throw an _Invalid Module Name_ error.
>    1. Otherwise if _name_ starts with _"/"_ or _name_ starts with _"/"_ then,
>       1. If in a Windows environment,
>          1. Set _resolved_ to the resolved file path of the substring of _name_ from the index after the last leading _"/"_.
>       1. Otherwise,
>          1. Set _resolved_ to the resolved file path of the substring of _name_ from the index of the last leading _"/"_.
>    1. Otherwise if _name_ starts with _"."_ then,
>       1. Let _parentPackage_ be the result of _PARSE_PACKAGE_PATH(parentPath, [[jspmPackagesPath]])_.
>       1. If _parentPackage_ is _undefined_ then,
>          1. Set _resolved_ to the result of the path resolution of _name_ relative to _parentPath_.
>       1. Otherwise,
>          1. Let _relResolved to the result of the path resolution of _name_ relative to _parentPackage.path_.
>          1. If _relResolved_ does not begin with _"/"_ then,
>             1. Throw an _Invalid Module Name_ error, as we cannot backtrack below package boundaries.
>          1. If _relResolved_ is equal to _"/"_ then,
>             1. Set _relResolved_ to _""_.
>          1. Set _resolved_ to the value of _${parentPackagePath}${relResolved}_.
>    1. Otherwise,
>       1. Assert _name_ is a valid URL.
>       1. If _name_ is not a file URL then,
>          1. Throw an _Invalid Module Name_ error.
>       1. Set _resolved_ to the absolute file system path of the file URL _name_.
>    1. If _resolved_ is not contained within _[[projectBasePath]]_ then,
>       1. Let _R_ be a new resolver initialized against the parent path _parentPath_.
>       1. Return the result of _R.JSPM_RESOLVE(resolved, parentPath)_.
>    1. If _[[jspmConfig]]_ is not _undefined_ then,
>       1. Set _resolvedPackage_ to the result of _PARSE_PACKAGE_PATH(resolved, [[jspmPackagesPath]])_.
> 1. If _resolvedPackage_ is not _undefined_ then,
>    1. If _resolvedPackage.path_ is equal to _"/"_ then,
>       1. Return _resolved_.
>    1. Let _resolvedPackagePath_ be the value of _PACKAGE_TO_PATH(resolvedPackage, [[jspmPackagesPath]])_.
>    1. Let _resolvedPackageMap_ be the value of _GET_MAP(resolvedPackagePath)_.
>    1. If _resolvedPackageMap_ is not _undefined_ then,
>       1. Let _relPath_ be the string _"."_ concatenated with _resolvedPackage.path_.
>       1. Let _mapped_ be the value of _APPLY_MAP(relPath, resolvedPackageMap)_.
>       1. If _mapped_ is not _undefined_ then,
>          1. Let _resolvedPackagePath_ be the result of _PACKAGE_TO_PATH(resolvedPackage.name, resolvedPackage.path, jspmPackagesPath)_.
>          1. If _mapped_ is equal to _"@empty"_ then,
>             1. Return _undefined_.
>          1. Let _resolved_ be the path resolution of _mapped_ to _resolvedPackagePath_.
>          1. Return _FILE_RESOLVE(resolved)_.
> 1. Otherwise, if _resolved_ is equal to or contained within _[[localPackagePath]]_ then,
>    1. Let _relPath_ be the string _"."_ concatenated with the substring of _resolved_ from the index of the length of _[[localPackagePath]]_ to the end of the string.
>    1. Let _mapped_ be the value of _APPLY_MAP(relPath, jspmConfig.map)_.
>    1. If _mapped_ is not _undefined_ then,
>       1. If _mapped_ is equal to _"@empty"_ then,
>          1. Return _undefined_.
>       1. Let _resolved_ be the path resolution of _mapped_ relative to _[[localPackagePath]]_.
>       1. Return _FILE_RESOLVE(resolved)_.
> 1. Return _FILE_RESOLVE(resolved)_.

The implementation of `NODE_RESOLVE` is exactly the NodeJS module resolution algorithm, with the following additions:

* NodeJS core module names should not be resolved, and should throw a _Module Not Found_ error.
* The browserify "browser" field should be respected when resolving in the browser environment (including a `false` map returning _undefined_).
* Module names ending in _"/"_ must always throw a not found error.

Full compatility in a module loading pipeline would be formed with a wrapper along the following lines:

> 1. If _name_ is a core module then return _name_.
> 1. If _name_ ends with a _"/"_ character then set _name_ to the substring of _name_ up to the second last character.
> 1. Return the result of _JSPM_RESOLVE(name, parentUrl)_, propagating any error on abrupt completion.
