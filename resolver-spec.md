# JSPM Resolver Specification

This is the primary specification of the jspm 2.0 resolver algorithm.

## jspm Resolver Principles

### Path Resolution

Module specifiers are considered relative URLs, so obey URL encoding and normalization rules.

This specification handles resolution in path space, including handling of `.` and `..` internal segments, converting `\\` into `/` for the resolution process, before outputting a valid pathname for the environment using the _"/"_ separator at the end of resolution. The reason for this is that we can avoid URL encoding / decoding this way until the end.

When resolving paths in Windows, we ensure that resolution uses the `/` separator for greater consistency between platforms, replacing any instances of the `\\` separator on resolution.

To match URL resolution behaviours, `/c:/path` and `//\\c:\\path` will resolve absolutely into `file:///c:/path`, while `c:\\path` will resolve to an invalid `c:` protocol and `//c:/path` will fail resolution.

### File Extension and Directory Index Handling

Automatic file extensions and directory indices are only provided for packages that are in the CommonJS mode.

Packages in the ESM mode get no automatic extensions. If no package.json main is present, importing the package without an explicit subpath will throw a resolution error.

Instead, map configuration is designed to allow customizing internal package resolutions.

In addition, jspm does not implement the real path lookup for modules loaded. This allows globally and locally linked packages to be scoped to the project they are loaded in, so the entire resolution for the project is managed through a single jspm configuration file despite many packages possibly being linked in.

### Plain Names

`plain names` or `bare names` as they are referred to in the WhatWG loader specification are module names
that do not start with `/` or `./` or `../` and do not parse as valid URLs.

Plain names are the module names that run through multiple remapping phases, although absolute URL names can be remapped as well through contextual relative map configuration.

### Package Scopes

jspm projects have two levels of package scopes - the base-level project scope containing the package.json and jspm.json file, and the dependency package scopes, denoted by their jspm_packages/package@version paths.

Within a jspm project, only the package.json and files in these two levels are read and used by jspm to influence resolution, and these are the only files that influence resolution in combination with the jspm.json resolutions.

The only time intermediate package.json files are used is when interpreting the module format mode of a file.

#### jspm Project Scopes

The detection of the jspm project for a given path is based on checking if the current path matches a jspm_packages dependency path, and if so using that scope, or otherwise checking for a jspm.json file down the folder hierarchy until one is found.

If a jspm_packages match is made without there being a corresponding jspm.json file, an error is thrown. If a package.json file is not found along with the jspm.json file, an error is also thrown.

If hitting a node_modules path segment, or reaching the root of the file system, the above check immediately stops and treats the project scope as a non-jspm package scope, and matching the first package.json file instead.

#### Module Format Handling

Each package scope is interpreted based on its "type" being either "commonjs" or "module".

By default jspm treats all package scopes as `"type": "module"` unless (a) they are explicitly `"type": "commonjs"` or (b) they are packages located in a node_modules path.

Custom assets can also be resolved through the jspm resolver, which will return `"format": "unknown"`.

### Package Configuration

#### Map Configuration

The `package.json` file `"map"` property can be used to configure mappings for both installed dependencies and the local project, with the followinng structure:

`package.json`:
```js
{
  "map": {
    [name: RelOrPlain]: RelOrPlain | ConditionalMap
  }
}
```

where:

* `RelOrPlain` is as above, a `/`-separated name that either starts with `./` or is a plain name.
* `ConditionalMap` is an object mapping condition value strings to map values (`{ [ConditionName: string]: RelOrPlain | ConditionalMap }`).

The resolve object is a map configuration that replaces the best matched starting prefix of the name.

For example:

```json
{
  "main": "dist/index.js",
  "map": {
    "./submodule": "./dist/submodule.js",
    "./index.js": {
      "browser": "./dist/index-browser.js"
    }
  }
}
```

would support `import 'pkg/submodule'` mapping to `pkg/src/submodule.js` as well as having the `index.js` being conditionally mapped to `pkg/dist/index-browser.js` under the browser resolve condition only.

Condition names can take values `"browser" | "node" | "dev" | "production" | "react-native" | "electron" | "default"`, with the first matching condition map recursively taken to be the resultant map. `"default"` is always set to true.

In addition the following constraint is placed:

> Package-relative resolutions (starting with `./`) can only resolve to other package-relative resolutions. This is to ensure a well-defined staged resolution process without circularity edge cases. The assumption here is that `"./x": "y"` is treated as
`"./x": "./y"`, while `"x": "y"` truly is an external mapping, just like the existing `browser` field spec.

If using the `"react-native"`, `"electron"`, `"browser"` or `"main"` package.json properties, these will be internally desugared into map in this listed order of precedence.

For example:

```json
{
  "main": "x",
  "browser": "y"
}
```

is interpreted as:

```json
{
  "main": "x",
  "map": {
    "./x": {
      "browser": "./y"
    }
  }
}
```

The `"./"` map can be used to map the entire root, for example:

```json
{
  "map": {
    "./": {
      "dev": "./src",
      "production": "./dist"
    }
  }
}
```

would support `import 'pkg/x'` resolving to `pkg/src/x` under the development condition and `pkg/dist/x` under the production condition.

### jspm Config File

jspm resolution information is provided through a `jspm.json` file which must be in the same folder as the package.json file forming the package scope.

The `jspm.json` jspm configuration file stores jspm configuration and version lock information for jspm projects.

The following properties are the only ones which affect the jspm resolution of a module:

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

When these configuration type assertions are broken, the configuration is considered invalid, and the entire resolution will abort on the assertion error.

## Algorithms

Any error in any operation, including assertion errors, should be fully propagated as a top-level resolve error abrupt completion.

### Plain Name Detection

This detection is exactly as in the [WhatWG module resolution detection](https://html.spec.whatwg.org/multipage/webappapis.html#resolve-a-module-specifier):

> **IS_PLAIN(name: String): boolean**
> 1. If _name_ parses as a valid URL then return _false_.
> 1. Otherwise if _name_ begins with _"/"_, _"./"_ or _"../"_ then return _false_.
> 1. Otherwise return _true_.

### Package Name Detection

Package names in canonical form are names of the form `registry:package@version`.

Valid package names satisfy the JS regular expression:

```js
/^[a-z]+:(@[-a-zA-Z\d][-_\.a-zA-Z\d]*\/)?[-a-zA-Z\d][-_\.a-zA-Z\d]*@[^@<>:"/\|?*^\u0000-\u001F]+$/
```

Package names must consist of either one or two path segments with a version - `registry:x@version` or `registry:@base/x@version`. The `@` prefix is required for two-segment package names in order to ensure the package scope remains statically determinable for any project path.

For compatibility with cross-platform file paths, the following character classes are not permitted in versions: `[@<>:"/\|?*^\u0000-\u001F]`.

The convention encouraged for versions that contain these characters is to encode these characters when used in unambiguous inputs, such that they are replaced by their URI percent encoding.

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

> **PARSE_PACKAGE_PATH(path: String, jspmProjectPath: String): { name: String, path: String }**
> 1. Let _jspmPackagesPath_ be the path _"jspm_packages/"_ resolved to directory _jspmProjectPath_, including a trailing separator.
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
> 1. If _path_ is string of non-zero length and _path_ does not start with _"/"_ then,
>    1. Return _undefined_.
> 1. Return the object with values _{ name, path }_.

> **PACKAGE_TO_PATH(name: String, jspmProjectPath: String): String**
> 1. Let _jspmPackagesPath_ be the path _"jspm_packages/"_ resolved to directory _jspmProjectPath_, including a trailing separator.
> 1. Assert _name_ satisfies the valid package name regular expression.
> 1. Replace in _name_ the first _":"_ character with _"/"_.
> 1. Return the result of the path resolution of _"${name}"_ within parent _jspmPackagesPath_.

The parse functions return undefined if not a valid package canonical name form, while the package to URL function must
always be called against a valid package canonical name form.

### Reading Package and Project Configuration

Package configuration is read based on checking the jspm project scopes and returning the corresponding package.json
configuration for a path.

Given a file path, we can determine the base project folder with the following algorithm:

> **GET_JSPM_PROJECT_PATH(modulePath: String)**
> 1. Let _checkPath_ be set to _modulePath_.
> 1. Loop:
>    1. Set _checkPath_ to the parent folder of _checkPath_.
>    1. If _checkPath_ is the root of the file system or if the last path segment of _checkPath_ is equal to _"node_modules"_ then,
>       1. Return _undefined_.
>    1. If the last path segment of _checkPath_ contains a _"@"_ character then,
>       1. If _checkPath_ contains a last _"jspm_packages"_ path segment with no _"node_modules"_ segment after it then,
>          1. Let _packagePath_ be the path segements of _checkPath_ from the last _"jspm_packages"_ path segment.
>          1. If _packagePath_ matches the package name regular expression then,
>             1. Let _jspmProjectPath_ be the substring _checkPath_ before the last _"jspm_packages"_ path segment.
>             1. Return _jspmProjectPath_.
>    1. If the file _"jspm.json"_ exists in the folder _checkPath_ then,
>       1. Return _checkPath_.

> **READ_JSPM_CONFIG(projectPath: String)**
> 1. If the file at _"${packagePath}/jspm.json"_ does not exist then,
>    1. Return _undefined_.
> 1. Return parsed contents of _"${packagePath}/jspm.json"_, throwing a _Configuration Error_ on invalid JSON.

The return value of the above method is an object of the form `{ projectPath, jspmConfig, packageConfig }`.

This algorithm only needs to be applied once per given path, and can cache all file system checks.

### Reading Package Configuration

The process of reading the package.json configuration for a given package path is based on the following algorithms:

> **READ_PACKAGE_JSON(packagePath: String)**
> 1. If the file at _"${packagePath}/package.json"_ does not exist then,
>    1. Return _undefined_.
> 1. Let _source_ be the contents of the file _"${packagePath}/package.json"_
> 1. Let _pjson_ be set to the cached output of the JSON parser applied to _source_, throwing a _Configuration Error_ on invalid JSON.
> 1. Let _type_ be set to _undefined_.
> 1. If _pjson.type_ is equal to _"commonjs"_ or _"module"_ then,
>    1. Set _type_ to _pjson.type_.
> 1. Let _name_ be equal to the value of _pjson.name_ if a string and a valid package name, or _undefined_ otherwise.
> 1. Let _main_ be equal to the value of _pjson.main_ if a string or _undefined_ otherwise.
> 1. If _main_ is defined then,
>    1. If _main_ starts with _"./"_ then,
>       1. Set _main_ to the substring of _main_ after _"./"_.
> 1. Let _mainMap_ be _undefined_.
> 1. Let _map_ be set to the value of _pjson.map_ if an object or _undefined_ otherwise.
> 1. If _pjson.react-native_ is a _string_ then,
>    1. Set _mainMap_ to an object if _undefined_.
>    1. Set _mainMap["react-native"]_ to _pjson.react-native_.
> 1. If _pjson.electron_ is a _string_ then,
>    1. Set _mainMap_ to an object if _undefined_.
>    1. Set _mainMap["electron"]_ to _pjson.react-native_.
> 1. If _pjson.browser_ is a _string_ then,
>    1. Set _mainMap_ to an object if _undefined_.
>    1. Set _mainMap["browser"]_ to _pjson.browser_.
> 1. If _mainMap_ is not _undefined_ then,
>    1. Set _map_ to an object if _undefined_.
>    1. If _main_ is _undefined_ then,
>       1. Set _main_ to _"index.js"_.
>    1. If _map["./${main}"]_ is _undefined_ then,
>       1. Set _map["./${main}"]_ to _mainMap_.
> 1. If _pjson.browser_ is an _object_ then,
>    1. For each key _name_ in _pjson.browser_,
>       1. If _map[name]_ is defined then,
>          1. Continue the loop.
>       1. Let _target_ be the value of _pjson.browser[name]_.
>       1. If _target_ is equal to _false_ then,
>          1. Set _target_ to _"@empty"_.
>       1. Set _map[match] to the object _{ browser: pjson.browser[name] }_.
> 1. Return the object with properties _{ path, name, main, map, type }_.

> **GET_PACKAGE_CONFIG(resolved: String, jspmProjectPath: String)**
> 1. If _jspmProjectPath_ is _undefined_ then,
>    1. Return _undefined_.
> 1. If _resolved_ is not a subpath of _jspmProjectPath_ then,
>    1. Return _undefined_.
> 1. Assert the file at _"jspm.json" exists in _jspmProjectPath_.
> 1. Let _package_ be the result of _PARSE_PACKAGE_PATH(resolved, projectPath)_.
> 1. Let _path_ and _config_ be _undefined_.
> 1. If _package_ is _undefined_ then,
>    1. Set _path_ to _jspmProjectPath_.
>    1. Set _config_ to the result of _READ_PACKAGE_JSON(packagePath)_.
> 1. Otherwise,
>    1. Set _path_ to the result of _PACKAGE_TO_PATH(package.name, projectPath)_.
>    1. Set _config_ to the result of _READ_PACKAGE_JSON(packagePath)_.
> 1. Return the object with values _{ package, path, config }_.

> **GET_PACKAGE_SCOPE(modulePath: String)**
> 1. Let _scope_ be _modulePath_.
> 1. While _scope_ is not the file system root,
>    1. If the file at _"${scope}/package.json_ exists then,
>       1. Return _scope_.
>    1. Set _scope_ to the parent path of _scope_.
> 1. Return _undefined_.

Existing "map" entries always take precedence over main aliases and the browser map.

The handling of an "index.js" alias for the main ensures that conditional mains are properly supported
even if there is no default main, although this is a rare edge case.

### Matching and Applying Map Resolution

jspm configurations use resolve maps to match a plain name and direct it to a new module name.
Matching a map is based on finding the longest map target that matches the start of the plain name.

Map configurations in the jspm configurations also support conditional objects which represent map branches based
on environment conditionals.

Match scopes are taken to be the `/` separator or the end of the name. In this way the map `{ 'x/y': 'z' }` can match both `x/y` and `x/y/path`.

Maps can also enforce a trailing separator to match directories separately to exact paths, for example with `{ 'x': './y/main.js', 'x/': './y/' }`.

The root directory map of `{ './': './root/' }` is permitted, while a single `.` match is not supported as this is handled via the main configuration.

Applying the map is then the process of adding back the subpath after the match (`x/y/path` mapping into `z/path` for the `{ 'x/y': 'z' }` map), including support for condition branches:

> **APPLY_MAP(name: String, resolveMap: Object)**
> 1. If _resolveMap_ is _undefined_ then,
>    1. Return _undefined_.
> 1. Let _parentNames_ be the set of parent paths of _name_ (_"/"_ separated), including _name_ itself, in descending order of length alternating between including the trailing _"/"_ and not (each item repeated with and without the last separator).
> 1. Let _match_ be set to _undefined_.
>    1. For each _parentName_ of _parentNames_,
>       1. If _parentName_ is equal to _"."_ then,
>          1. Break the loop.
>       1. If _resolveMap_ has an entry for _parentName_ then,
>          1. Set _match_ to _parentName_.
>          1. Break the loop.
> 1. If _match_ is _undefined_ then,
>    1. Return _undefined_.
> 1. Let _mapped_ be the value of _MAP_CONDITIONS(resolveMap[match])_.
> 1. If _mapped_ is equal to _"@empty"_ then,
>    1. If _match_ is not equal to _name_ or _name_ ends with a _"/"_ separator then,
>       1. Throw an _Invalid Module Name_ error.
> 1. If _match_ starts with _"./"_ and _mapped_ does not start with _"./"_ then,
>    1. Set _mapped_ to _"./${mapped}"_.
> 1. If _mapped_ ends with a _"/"_ separator then,
>    1. If _match_ does not end with a _"/"_ separator then,
>       1. Throw an _Invalid Configuration_ error.
> 1. Otherwise,
>    1. If _match_ ends with a _"/"_ separator then,
>       1. Add a trailing _"/"_ to _mapped_.
> 1. If _mapped_ contains any _".."_ or _"."_ segments, any _"\"_ character, any _"%2F" or _"%5C"_ substring, or parses as a URL then,
>    1. Throw an _Invalid Configuration_ error.
> 1. Assert _PARSE_PACKAGE_CANONICAL(mapped)_ is _false_.
> 1. Return _mapped_ concatenated with the substring of _name_ from the index at the length of _match_ to the end of the string.

> **MAP_CONDITIONS(mapped: String | Object)**
> 1. While _mapped_ is an _Object_,
>    1. For each property _condition_ of _mapped_,
>       1. If _condition_ is the name of an environment conditional that is _true_.
>          1. Set _mapped_ to the value of _mapped[condition]_.
>          1. Continue the next outer loop iteration.
>    1. Return _undefined_.
> 1. If _mapped_ is not a _string_, throw an _Invalid Configuration_ error.
> 1. Return _mapped_.

### Module Resolution Algorithm

Module resolution is always based on resolving `resolve(name, parentPath)` where `name` is the optional unresolved name to resolve and `parentPath` is an absolute file path to resolve relative to.

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
  default: true
}
```

Where `production` and `dev` must be mutually exclusive, while `browser` and `node` can both be true for environments like Electron.

All NodeJS builtins are accepted as plain name resolutions, corresponding to `{ resolved: builtinName, format: "builtin" }` from the resolver.

`@empty` is a jspm-specific builtin providing an empty module object with an empty object as its default export.

The resolver will either return a resolved path string, or throw a _Module Not Found_, _Invalid Module Name_ or _Invalid Configuration_ error.

Package name requests and plain name requests are both considered unescaped - that is URL decoding will not be applied. URL decoding is only applied to URL-like requests.

Absolute paths, URLs, URL-encoding, and relative segments are not supported in the parent path.

_Note that most of the complexity of the resolver comes from handling legacy CJS package type fallbacks properly. For example, we support CommonJS packages within jspm_packages for legacy linking workflows which perform a hybrid resolution which is carefully defined just for this edge case yet unnecessary in the bulk of workflows._

The resolution algorithm breaks down into the following high-level process to get the fully resolved path:

> **JSPM_RESOLVE(name: String, parentPath: String, cjsResolve: Boolean, isMain: Boolean)**
> 1. Assert _parentPath_ is a valid absolute file system path.
> 1. If _name_ contains the substring _"%2F"_ or _"%5C"_ then,
>    1. Throw an _Invalid Module Name_ error.
> 1. If _IS_PLAIN(name)_ is _false_ then,
>    1. Return the result of _RELATIVE_RESOLVE(name, parentPath, cjsResolve, isMain)_.
> 1. Let _jspmProjectPath_ be the result of _GET_JSPM_PROJECT_PATH(parentPath)_.
> 1. If _jspmProjectPath_ is _undefined_ then,
>    1. Note: This should be extended to support any future Node.js resolution specs.
>    1. Return _NODE_MODULES_RESOLVE(name, parentPath, cjsResolve)_.
> 1. If _name_ contains any _"\"_ character then,
>    1. Throw an _Invalid Module Name_ error.
> 1. Let _parentPackage_ be the result of _GET_PACKAGE_CONFIG(parentPath, projectPath)_.
> 1. If _packageConfig?.name_ is defined then,
>    1. If _name_ is equal to _packageConfig.name_ or _name_ starts with _packageConfig.name_ followed by _"/"_ then,
>       1. Let _subPath_ be the substring of _name_ from the length of _packageConfig.name_.
>       1. Return _JSPM_PACKAGE_RESOLVE(packageConfig, subPath, cjsResolve, isMain)_.
> 1. Let _mapped_ be the value of _APPLY_MAP(name, packageConfig?.map)_
> 1. If _mapped_ is not _undefined_ then,
>    1. If _mapped_ starts with _"./"_ then,
>       1. Let _resolved_ be the path resolution of _mapped_ relative to base _parentPackage.path_.
>       1. If _cjsResolve_ is equal to _true_ then,
>          1. Let _realpath_ be the boolean indicating if _jspmProjectPath_ is _undefined_ or _resolved_ is not contained within _jspmProjectPath_.
>          1. Return _NODE_FINALIZE_RESOLVE(resolved, true, realpath, isMain)_.
>       1. Return _FINALIZE_RESOLVE(resolved, jspmProjectPath, isMain)_.
>    1. Otherwise, set _name_ to _mapped_.
>    1. If _IS_PLAIN(name)_ is _false_ then,
>       1. Throw an _Invalid Configuration_ error.
>    1. If _name_ contins any _"\"_ character then,
>       1. Throw an _Invalid Configuration_ error.
> 1. If _jspmProjectPath_ is not _undefined_ then,
>    1. Let _resolved_ to the result of _JSPM_PROJECT_RESOLVE(name, parentPackage, jspmProjectPath, cjsResolve, isMain)_.
>    1. If _resolved_ is not equal to _undefined_ then,
>       1. Return _resolved_.
> 1. If _name_ is a builtin module or _"@empty"_ then,
>    1.  Return the object _{ resolved: name, format: "builtin" }_.
> 1. Throw a _Module Not Found_ error.

> **RELATIVE_RESOLVE(name: String, parentPath: String, jspmProjectPath: String, cjsResolve: Boolean, isMain)**
> 1. Let _resolved_ be _undefined_.
> 1. Replace in _name_ any _"\"_ character with _"/"_.
> 1. Replace in _name_ all percent-encoded values with their URI-decodings.
> 1. If _name_ starts with _"//"_ and _name_ does not start with _"///"_ then,
>    1. Throw an _Invalid Module Name_ error.
> 1. Otherwise if _name_ starts with _"/"_ or _name_ starts with _"/"_ then,
>    1. Set _resolved_ to the resolved file path of _name_.
> 1. Otherwise if _name_ starts with _"."_ then,
>    1. Set _resolved_ to the path resolution of _name_ relative to _parentPath_.
> 1. Otherwise if running in Windows, and _name_ starts with a letter (uppercase or lowercase) in the a-z range followed by _":"_ then,
>    1. Set _resolved_ to the value of _name_.
> 1. Otherwise,
>    1. If _name_ is not a valid file URL then,
>       1. Throw an _Invalid Module Name_ error.
>    1. Set _resolved_ to the absolute file system path of the file URL _name_.
> 1. Let _jspmProjectPath_ be the result of _GET_JSPM_PROJECT_PATH(resolved)_.
> 1. If _cjsResolve_ is equal to _true_ then,
>    1. Let _scope_ be the result of _GET_PACKAGE_SCOPE(resolved)_.
>    1. If _scope_ is not _undefined_ then,
>       1. Let _pjson_ be the result of _READ_PACKAGE_JSON("${scope}/package.json")_.
>    1. Let _realpath_ be the boolean indicating if _jspmProjectPath_ is _undefined_ or _resolved_ is not contained within _jspmProjectPath_.
>    1. Return _NODE_PACKAGE_RESOLVE(resolved, false, realpath, scope, pjson, isMain)_.
> 1. Return _FINALIZE_RESOLVE(resolved, jspmProjectPath, isMain)_.

> **JSPM_PROJECT_RESOLVE(name: String, parentPackage: Object, jspmProjectPath: String, cjsResolve: Boolean, isMain: Boolean)**
> 1. Let _jspmConfig_ be the result of _READ_JSPM_CONFIG(jspmProjectPath)_.
> 1. If _jspmConfig_ is _undefined_ then,
>    1. Return _undefined_.
> 1. Let _packageName_ be _undefined_.
> 1. If _parentPackage.package_ is not _undefined_ then,
>    1. Let _parentPackageResolveMap_ be set to _jspmConfig.dependencies[parentPackage.name]?.resolve_.
>    1. If _parentPackageResolveMap_ is not _undefined_ then,
>       1. Let _mapped_ be the value of _APPLY_MAP(name, parentPackageResolveMap)_
>       1. If _mapped_ is not _undefined_ then,
>          1. If _mapped_ is not a valid exact package name,
>             1. Throw an _Invalid Configuration_ error.
>          1. Set _packageName_ to _mapped_.
> 1. If _packageName_ is _undefined_ then,
>    1. If _parentPackage.package_ is _undefined_ or _name_ is a match of _parentPackage.config.peerDependencies_ then,
>    1. Let _mapped_ be the value of _APPLY_MAP(name, jspmConfig.resolve)_.
>    1. If _mapped_ is not _undefined_ then,
>       1. If _mapped_ is not a valid exact package name,
>          1. Throw an _Invalid Configuration_ error.
>       1. Set _packageName_ to _mapped_.
> 1. If _packageName_ is _undefined_ then,
>    1. Return _undefined_.
> 1. Let _resolvedPackage_ be the result of _PARSE_PACKAGE_CANONICAL(packageName)_.
> 1. Let _packagePath_ be the result of _PACKAGE_TO_PATH(resolvedPackage.name, projectPath)_.
> 1. Let _packageConfig_ be the result of _READ_PACKAGE_JSON(packagePath)_.
> 1. Return the result of _JSPM_PACKAGE_RESOLVE(packageConfig, resolvedPackage.path, cjsResolve, isMain)_.

> **JSPM_PACKAGE_RESOLVE(packageConfig: Object, subPath: String, cjsResolve, isMain)**
> 1. Let _resolved_ be the concatenation of _packageConfig.path_ and _subPath_.
> 1. If _packageConfig_ is not _undefined_ then,
>    1. If _subPath_ is the empty string then,
>       1. If _packageConfig.main_ is _undefined_ then,
>          1. Throw a _Module Not Found_ error.
>       1. Set _subPath_ to _"/${packageConfig.main}"_.
>       1. Set _resolved_ to _${packagePath}${subPath}"_.
>    1. If _packageConfig.map_ is not _undefined_ then,
>       1. Let _mapped_ be the value of  _APPLY_MAP(".${subPath}", packageConfig.map)_.
>       1. If _mapped_ is not _undefined_ then,
>          1. If _mapped_ is equal to _"@empty"_ then,
>             1. Return _{ resolved: "@empty", format: "builtin" }_.
>          1. Set _resolved_ to the path resolution of _mapped_ relative to base _packageConfig.path_.
> 1. If _cjsResolve_ is equal to _true_ then,
>    1. Return _NODE_PACKAGE_RESOLVE(_${packagePath}${subPath}", false, false, packagePath, packageConfig, isMain)_.
> 1. Return _FINALIZE_RESOLVE(resolved, cjsResolve, isMain)_.

> **FINALIZE_RESOLVE(resolved: String, jspmProjectPath: String, cjsResolve: Boolean, isMain: Boolean)**
> 1. If _resolved_ ends in _".mjs"_ then,
>    1. Return _{ resolved, format: "module" }_.
> 1. If _resolved_ ends in _".node"_ then,
>    1. Return _{ resolved, format: "addon" }_.
> 1. If _cjsResolve_ is _true_ and _resolved_ ends in _".json"_ then,
>    1. Return _{ resolved, format: "json" }_.
> 1. If _isMain_ is _false_ and _resolved_ does not end with _".js"_ then,
>    1. Return _{ resolved, format: "unknown" }_.
> 1 .If _cjsResolve_ is _true_ the,
>    1. Return _{ resolved, format: "commonjs" }_.
> 1. Let _scope_ be the result of _GET_PACKAGE_SCOPE(resolved)_.
> 1. If _scope_ is not _undefined_ then,
>    1. Let _pjson_ be the result of _READ_PACKAGE_JSON("${scope}/package.json")_.
> 1. Let _cjs_ be _true_ if _jspmProjectPath_ is _undefined_.
> 1. If _pjson?.type_ is equal to _"commonjs"_ then,
>    1. Set _cjs_ to _true_.
> 1. If _pjson?.type_ is equal to _"module"_ then,
>    1. Set _cjs_ to _false_.
> 1. Return _{ resolved, format: cjs ? "commonjs": "module" }_.

> **NODE_MODULES_RESOLVE(name: String, parentPath: String, cjsResolve: Boolean, isMain): String**
> 1. For each parent folder _modulesPath_ of _parentPath_ in descending order of length,
>    1. Let _resolved_ be set to _"${modulesPath}/node_modules/${name}"_.
>    1. For each parent path _packagePath_ of _resolved_, including _resolved_ in descending order,
>       1. If _packagePath_ ends in a _"node_modules"_ segment then,
>          1. Break the inner loop.
>       1. If the folder at _packagePath_ exists then,
>          1. Let _packageConfig_ be the result of _READ_PACKAGE_JSON("${packagePath}/package.json")_.
>          1. Return _NODE_PACKAGE_RESOLVE(resolved, cjsResolve, true, packagePath, packageConfig, isMain)_.
>    1. Return the result of _NODE_FINALIZE_RESOLVE(resolved, cjsResolve, true, isMain)_, continuing the loop for a _Module Not Found_ error, and propagating the error otherwise.
> 1. Throw a _Module Not Found_ error.

> **NODE_PACKAGE_RESOLVE(resolved: String, cjsResolve: Boolean, realpath: String, packagePath: String, packageConfig: Object, isMain: Boolean)**
> 1. If _resolved_ is equal to _packagePath_ then,
>    1. If _packageConfig?.main_ is not _undefined_ then,
>       1. Set _resolved_ to _LEGACY_FILE_RESOLVE("${packagePath}/${packageConfig.main}", cjsResolve)_, where on _Module Not Found_ error:
?          1. Set _resolved_ to _"${packagePath}/${packageConfig.main}_.
>    1. Otherwise,
>       1. Set _resolved_ to _LEGACY_DIR_RESOLVE(packagePath, cjsResolve)_.
> 1. Otherwise if _resolved_ does not end with a trailing path separator then,
>    1. Set _resolved_ to _LEGACY_FILE_RESOLVE(packagePath, cjsResolve)_.
> 1. If _packageConfig?.map_ is not _undefined_ and _resolved_ is contained in _packagePath_ then,
>    1. Set _resolved_ to _LEGACY_FILE_RESOLVE(resolved, cjsResolve)_, continuing and leaving it unchanged on a _Module Not Found_ error.
>    1. Let _relPath_ be the string _"."_ concatenated with the substring of _resolved_ of length _packagePath_.
>    1. Let _mapped_ be the value of  _APPLY_MAP(relPath, packageConfig.map)_.
>    1. If _mapped_ is not _undefined_ then,
>       1. If _mapped_ is equal to _"@empty"_ then,
>          1. Return _{ resolved: "@empty", format: "builtin" }_.
>       1. Set _resolved_ to the path resolution of _mapped_ relative to base _packagePath_.
> 1. Return the result of _NODE_FINALIZE_RESOLVE(resolved, cjsResolve, realpath, isMain)_.

> **LEGACY_DIR_RESOLVE(dir: String, cjsResolve: Boolean)**
> 1. If _cjsResolve_ is _false_ and the file at _"${path}/index.mjs"_ exists,
>    1. Return _"${path}/index.mjs"_.
> 1. Otherwise if the file at _"${path}/index.js"_ exists,
>    1. Return _"${path}/index.js"_.
> 1. Otherwise if the file at _"${path}/index.json"_ exists,
>    1. Return _"${path}/index.json"_.
> 1. Otherwise if the file at _"${path}/index.node"_ exists,
>    1. Return _"${path}/index.node"_.
> 1. Throw a _Module Not Found_ error.

> **LEGACY_FILE_RESOLVE(path: String, cjsResolve: Boolean)**
> 1. Assert _path_ is a valid file path.
> 1. Let _resolved_ be equal to _undefined_.
> 1. If _path_ ends with the character _"/"_ then,
>    1. Set _resolved_ to _path_.
> 1. Otherwise if the file at _path_ exists,
>    1. Set _resolved_ to _path_.
> 1. Otherwise if _cjsResolve_ is _false_ and the file at _"${path}.mjs"_ exists,
>    1. Set _resolved_ to _"${path}.mjs"_.
> 1. Otherwise if the file at _"${path}.js"_ exists,
>    1. Set _resolved_ to _"${path}.js"_.
> 1. Otherwise if the file at _"${path}.json"_ exists,
>    1. Set _resolved_ to _"${path}.json"_.
> 1. Otherwise if the file at _"${path}.node"_ exists,
>    1. Set _resolved_ to _"${path}.node"_.
> 1. Otherwise,
>    1. Set _resolved_ to _LEGACY_DIR_RESOLVE(path, mjs)_.
> 1. Return _resolved_.

> **NODE_FINALIZE_RESOLVE(resolved: String, cjsResolve: Boolean, realpath: Boolean, isMain: Boolean)**
> 1. TODO: Add package scope here if Node.js adopts it.
> 1. Set _resolved_ to _LEGACY_FILE_RESOLVE(resolved, cjsResolve)_.
> 1. Let _format_ be equal to _"unknown"_.
> 1. If _isMain_ is _true_ then,
>    1. If _cjsResolve_ is _true_ then,
>       1. Set _format_ to _"commonjs"_.
>    1. Otherwise,
>       1. Set _format_ to _"module"_.
> 1. If _resolved_ ends with _".mjs"_ then,
>    1. If _cjsResolve_ is _true_ then,
>       1. Throw a _Invalid Module Name_ error.
>    1. Set _format_ to _"module"_.
> 1. Otherwise if _resolved_ ends with _".js"_ then,
>    1. Set _format_ to _"commonjs"_.
> 1. Otherwise if _resolved_ ends with _".json"_ then,
>    1. Set _format_ to _"json"_.
> 1. Otherwise if _resolved_ ends with _".node"_ then,
>    1. Set _format_ to _"addon"_.
> 1. If _realpath_ then,
>    1. Set _resolved_ to the real path of _resolved_.
> 1. Return the object with properties _{ resolved, format }_.
