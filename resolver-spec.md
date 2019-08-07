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

#### Package Entry Points

The default entry point for a package is the `"main"`.

Custom entry points can be defined based on _environment conditions_.

Condition names can take values `"browser" | "node" | "dev" | "production" | "react-native" | "electron" | "main"`, with matching done in priority order.

Custom _environment conditions_ can also be defined and passed to the resolver.

Only if the field is enabled for the environment, and the corresponding value is a string, is it correctly matched, otherwise the next priority environment name is checked.

#### Package Exports

Package `"exports"` are supported as in Node.js, with the same resolution and validation rules, with the following structure:

```js
{
  "exports": {
    [RelName]: ExportsTarget | ExportsTarget[]
  }
}
```

where:

* `RelName` is a specifier starting with `"./"`.
* `ExportsTarget` is a `RelName` or `ConditionalExportsTarget`.
* `ConditionalExportsTarget` is an object mapping condition value strings to map values (`{ [ConditionName: string]: ExportsTarget }`).

Invalid types are ignored in fallbacks or mappings.

In addition to supporting string targets, object targets are also supported in exports fallbacks:

```json
{
  "exports": {
    "./asdf": [{
      "browser": {
        "dev": "./asdf-browser-dev.js",
        "production": "./asdf-browser-production.js"
      },
      "node": "./asdf-node.js"
    }, "./asdf.js"]
  }
}
```

Targets within the conditional object are themselves valid object or string targets. Nested fallback arrays are not currently supported.

If no object match is found, the matching moves on to the next fallback path.

The names are checked on the object based on the condition priority order, exactly as for the entry points.

Trailing slashes can be used to map folders, but require the target to also use a trailing slash.

#### Package Map

The `package.json` file `"map"` property can be used to configure mappings for both installed dependencies and the local project, with the followinng structure:

`package.json`:
```js
{
  "map": {
    [name: PlainName]: MapTarget | MapTarget[]
  }
}
```

where:

* `RelOrPlain` is a `/`-separated name that either starts with `./` or is a plain name.
* `MapTarget` is `RelOrPlain` or `ConditionalMapTarget`.
* `ConditionalMapTarget` is an object mapping condition value strings to map values (`{ [ConditionName: string]: MapTarget }`).

The mapping rules are identical to `"exports"` except that the mapping is applied for imports made within the package boundary of the package itself.

When mapping into a plain name, the plain name must at least be a valid package name (as defined here).

For example:

```json
{
  "main": "dist/index.js",
  "map": {
    "subpath/": "./dist/subpath/",
    "polyfill": {
      "browser": "dep/polyfill-browser.js",
      "node": "dep/polyfill-node.js"
    }
  }
}
```

If the map target is defined but is not valid or does not match any conditions, then a _Module Not Found_ error is thrown for a missing map. The
lookup does not fallback to a package lookup.

#### Browser Field Compatibility

The package.json `"browser"` field used as an object is supported internally as being desugared to map and exports:

```json
{
  "main": "./x",
  "browser": {
    "./x.js": "./x-browser.js",
    "x": "y"
  }
}
```

is treated as:

```json
{
  "main": "./x",
  "browser": "./x-browser.js",
  "exports": {
    "./x.js": {
      "browser": "./x-browser.js"
    }
  },
  "map": {
    "x": {
      "browser": "y"
    }
  }
}
```

#### jspm field

The `"jspm"` field in the package.json file can be used to define configuration that is unique to jspm.

This configuration is treated as an override of the base-level package.json configuration. Extension only overrides the direct value properties, and does
not iterate arrays or objects further.

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

> **URI_DECODE**(path: String)**
> 1. Replace in _path_ any percent-encoded values with their URI-decodings throwing a _Invalid Module Name_ error for any _"%2E"_, _"%2F"_ or _"%5C"_ encodings.
> 1. Replace in _path_ any _"\\"_ with _"/"_.
> 1. Return _path_.

> **PARSE_PACKAGE(specifier: String)**
> 1. Let _packageName_ be *undefined*.
> 1. Let _packageSubpath_ be *undefined*.
> 1. If _specifier_ is an empty string then,
>    1. Throw an _Invalid Specifier_ error.
> 1. If _specifier_ does not start with _"@"_ then,
>    1. Set _packageName_ to the substring of _specifier_ until the
>       first _"/"_ separator or the end of the string.
> 1. Otherwise,
>    1. If _specifier_ does not contain a _"/"_ separator then,
>       1. Throw an _Invalid Specifier_ error.
>    1. Set _packageName_ to the substring of _specifier_
>       until the second _"/"_ separator or the end of the string.
> 1. If _packageName_ starts with _"."_ or contains _"\\"_ or _"%"_ then,
>    1. Throw an _Invalid Specifier_ error.
> 1. Let _packageSubpath_ be _undefined_.
> 1. If the length of _specifier_ is greater than the length of
>    _packageName_ then,
>    1. Set _packageSubpath_ to _"."_ concatenated with the substring of
>       _specifier_ from the position at the length of _packageName_.
> 1. If _packageSubpath_ contains any _"."_ or _".."_ segments,
>    1. Throw an _Invalid Specifier_ error.
> 1. Return the object with values _{ packageName, packageSubpath }_.

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
> 1. If _pjson.jspm_ is an Object, then,
>    1. Let _overrides_ be the keys of _pjson.jspm_.
>    1. For each _override_ of _overrides_, do
>       1. Set _pjson[override]_ to _pjson.jspm[override]_.
> 1. Let _type_ be set to _undefined_.
> 1. If _pjson.type_ is equal to _"commonjs"_ or _"module"_ then,
>    1. Set _type_ to _pjson.type_.
> 1. Let _entries_ be an empty _Object_.
> 1. Let _conditions_ be the list of string environment conditions in priority order.
> 1. For each _condition_ of _conditions_, do
>    1. If _pjson[condition]_ is a String then,
>       1. Let _target_ be _pjson[condition]_.
>       1. If _target_ starts with _"./"_ then,
>          1. Set _target_ to the substring of _target_ after _"./"_.
>       1. Set _entries[condition]_ to _target_.
> 1. Let _exports_ be _undefined_.
> 1. If _pjson.exports_ is not _null_ or _undefined_ then,
>    1. Set _exports_ to an empty _Object_.
> 1. If _pjson.exports_ is an _Object_ then,
>    1. Set _exports_ to _pjson.exports_.
> 1. Let _map_ be set to the value of _pjson.map_ if an Object or _undefined_ otherwise.
> 1. If _pjson.browser_ is an _Object_ then,
>    1. For each key _name_ in _pjson.browser_ do,
>       1. Let _target_ be _pjson.browser[name]_.
>       1. If _target_ is equal to _false_ then,
>          1. Set _target_ to _"@empty"_.
>       1. If _name_ starts with _"./"_ then,
>          1. If _target_ starts with _"./"_ then,
>             1. Set _target_ to the substring of _target_ after _"./"_.
>          1. If _pjson.main_ starts with _name_ then,
>             1. Let _extra_ be the substring of _name_ starting at the length of _pjson.main_.
>             1. If _extra_ is equal to _""_, _".js"_, _".json"_, _".node"_, _"/index.js"_, _"/index.json"_, _"/index.node"_ then,
>                1. Set _entries.browser_ to _target_.
>          1. If _exports[name] is _undefined_ then,
>             1. Set _exports[name]_ to the object _{ browser: target, main: name }_.
>       1. Otherwise, if _map[name]_ is not defined then,
>          1. Set _map[name] to the object _{ browser: target, main: name }_.
> 1. Return the object with properties _{ type, entries, exports, map }_.

> **GET_PACKAGE_SCOPE(modulePath: String)**
> 1. Let _scope_ be _modulePath_.
> 1. While _scope_ is not the file system root,
>    1. If the last path segment of _scope_ is _"node_modules"_ or _"jspm_packages"_, return _undefined_.
>    1. If the file at _"${scope}/package.json_ exists then,
>       1. Return _scope_.
>    1. Set _scope_ to the parent path of _scope_.
> 1. Return _undefined_.

### Entries, Exports and Map Resolution

> **RESOLVE_PACKAGE(packagePath: String, subpath: String, pcfg: Object)**
> 1. Assert: _packagePath_ ends with _"/"_.
> 1. If _subpath_ is the empty String then,
>    1. Let _match_ be the first matching environment condition in _pcfg.entries_ in condition priority order.
>    1. If _match_ is _undefined_ then,
>       1. Throw a _Module Not Found_ error.
>    1. Let _target_ be _pcfg.entries[match]_.
>    1. Assert: _target_ is a String.
>    1. Set _target_ to _URI_DECODE(target)_.
>    1. Let _resolved_ be the resolution of _packagePath + "/" + target_.
>    1. If the file at _resolved_ exists, return _resolved_.
>    1. If _pcfg.type_ is equal to _"module"_, throw a _Module Not Found_ error.
>    1. Set _resolved_ to _LEGACY_DIR_RESOLVE(packagePath, pcfg.main)_.
>    1. If _resolved_ is not _undefined_, return _resolved_.
>    1. Throw a _Module Not Found_ error.
> 1. If _pcfg.exports_ is _undefined_ or _null_ then,
>    1. Set _subpath_ to _DECODE_PATH(subpath)_.
>    1. Return the resolution of _subpath_ in _packagePath_.
> 1. If _pcfg.exports_ is not an _Object_ then,
>    1. Throw a _Module Not Found_ error.
> 1. Set _subpath_ to _"./"_ concatenated with _subpath_.
> 1. If _subpath_ is a key of _pcfg.exports_ then,
>    1. Return the result of _RESOLVE_EXPORTS_TARGET(packagePath, pcfg.exports[subpath], "")_.
> 1. For each entry _export_ of the keys of _pcfg.exports_ sorted by length descending,
>    1. If _export_ does not end in _"/"_, continue the loop.
>    1. If _subpath_ begins with _export_ then,
>       1. Let _target_ be _pcfg.exports[export]_.
>       1. Let _exportSubpath_ be the substring of _subpath_ starting at the length of _export_.
>       1. Return _RESOLVE_EXPORTS_TARGET(packagePath, target, exportSubpath)_.
> 1. Throw a _Module Not Found_ error.

> **PACKAGE_EXPORTS_TARGET_RESOLVE(packagePath; String, target: Any, subpath: String)**
> 1. If _target_ is a String then,
>    1. If _target_ does not start with _"./"_, throw a _Module Not Found_ error.
>    1. If _subpath_ has non-zero length and _target_ does not end with _"/"_, throw a _Module Not Found_ error.
>    1. If _target_ or _subpath_ contain any _"node_modules"_ or _"jspm_packages"_ segments including through percent-encoding, throw a _Module Not Found_ error.
>    1. Set _target_ to _URI_DECODE(target)_.
>    1. Set _subpath_ to _URI_DECODE(subpath)_.
>    1. Let _resolvedTarget_ be the resolution of _packagePath_ and _target_.
>    1. If _resolvedTarget_ is contained in _packagePath_ then,
>       1. Let _resolved_ be the resolution of _subpath_ and _resolvedTarget_.
>       1. If _resolved_ is contained in _packagePath_, return _resolved_.
> 1. Otherwise, if _target_ is an Object then,
>    1. For each environment condition _condition_ in priority order,
>       1. Let _targetValue_ be _target[condition]_.
>       1. If _targetValue_ is a String,
>          1. Return the result of **PACKAGE_EXPORTS_TARGET_RESOLVE(packagePath, targetValue, subpath)_, propagating any error.
>       1. Otherwise if _targetValue is an Object,
>          1. Return the result of **PACKAGE_EXPORTS_TARGET_RESOLVE(packagePath, targetValue, subpath)_, continuing the loop on a _Module Not Found_ error.
>       1. Otherwise, continue the loop.
> 1. Otherwise, if _target_ is an Array then,
>    1. For each item _targetValue_ of _target_,
>       1. If _targetValue_ is not a String or Object, continue the loop.
>       1. Return the result of _PACKAGE_EXPORTS_TARGET_RESOLVE(packagePath, targetValue, subpath)_, continuing the loop on a _Module Not Found_ error.
> 1. Throw a _Module Not Found_ error.

> **RESOLVE_MAP(name: String, packagePath: String, pcfg: Object)**
> 1. If _pcfg.map_ is _undefined_ then,
>    1. Return _undefined_.
> 1. If _name_ is a key of _pcfg.map_ then,
>    1. Return the result of _MAP_TARGET_RESOLVE(packagePath, pcfg.map[name], "")_.
> 1. For each entry _map_ of the keys of _pcfg.map_ sorted by length descending,
>    1. If _map_ does not end in _"/"_ and the character of _map_ at the index of the length of _name_ is not _"/"_, continue the loop.
>    1. If _name_ begins with _map_ then,
>       1. Let _target_ be _pcfg.map[map]_.
>       1. Let _mapSubpath_ be the substring of _name_ starting at the length of _map_.
>       1. Let _resolved_ be _MAP_TARGET_RESOLVE(packagePath, target, mapSubpath)_, returning _undefined_ on abrupt completion.
> 1. Return _undefined_.

> **MAP_TARGET_RESOLVE(packagePath: string, target: Any, subpath: String)**
> 1. Note: If _subpath_ starts with _"/"_ that indicates a possible direct package subpath resolution.
>    which will invalidate any matched target that is not a direct package name without a subpath.
> 1. If _target_ is a String then,
>    1. If _target_ is a valid package name then,
>       1. Let _packageSubpath_ be the destructured property of _PARSE_PACKAGE(target)_.
>       1. If _subpath_ starts with _"/"_ then,
>          1. If _packageSubpath_ has non-zero length, throw a _Module Not Found_ error.
>          1. Return the concatenation of _target_, _"/"_ and _subpath_.
>       1. If _subpath_ has non-zero length and _target_ does not end in _"/"_, throw a _Module Not Found_ error.
>       1. Return the concatenation of _target_ and _subpath_.
>    1. Otherwise,
>       1. If _subpath_ starts with _"/"_, throw a _Module Not Found_ error.
>       1. If _target_ does not start with _"./"_, throw a _Module Not Found_ error.
>       1. If _subpath_ has non-zero length and _target_ does not end with _"/"_, throw a _Module Not Found_ error.
>       1. Set _target_ to _URI_DECODE(target)_.
>       1. Set _subpath_ to _URI_DECODE(subpath)_.
>       1. If _target_ or _subpath_ contain any _"node_modules"_ or _"jspm_packages"_ segments, throw a _Module Not Found_ error.
>       1. Let _resolvedTarget_ be the resolution of _packagePath_ and _target_.
>       1. If _resolvedTarget_ is contained in _packagePath_ then,
>          1. Let _resolved_ be the resolution of _subpath_ and _resolvedTarget_.
>          1. If _resolved_ is contained in _packagePath_, return _"./"_ concatenated with the substring of _resolved_ from the length of _packagePath_.
> 1. Otherwise, if _target_ is an Object then,
>    1. For each environment condition _condition_ in priority order,
>       1. Let _targetValue_ be _target[condition]_.
>       1. If _targetValue_ is not a String or Object, continue the loop.
>       1. Return the result of **MAP_TARGET_RESOLVE(packagePath, targetValue, subpath)_, continuing the loop on a _Module Not Found_ error.
> 1. Otherwise, if _target_ is an Array then,
>    1. For each item _targetValue_ of _target_,
>       1. If _targetValue_ is not a String or Object, continue the loop.
>       1. Return the result of _MAP_TARGET_RESOLVE(packagePath, targetValue, subpath)_, continuing the loop on a _Module Not Found_ error.
> 1. Throw a _Module Not Found_ error.

### Module Resolution Algorithm

Module resolution is always based on resolving `resolve(name, parentPath)` where `name` is the optional unresolved name to resolve and `parentPath` is an absolute file path to resolve relative to.

The resolver is based on two main parts - plain name resolution, and relative resolution.

Plain name resolution first checks plain package maps, then the jspm dependency resolution, then the global jspm resolution (top-level jspm installs) before falling back to delegating entirely to the `node_modules` NodeJS resolution. If no plain resolution is in the NodeJS resolution, an error is thrown.

Relative resolution is applied after jspm plain configuration, based on detecting if the parent path is the base project or a package path, and then resolving the relative parent path using the package relative map configuration.

When handling conditional resolution, the environment conditional state is required to be known, an array of matched conditions in the following order:

```js
[
  "browser",
  "node",
  "production",
  "dev",
  "react-native",
  "electron",
  "main"
]
```

Where the first match in order will be picked from conditional branches in resolution configuration.

All NodeJS builtins are accepted as plain name resolutions, corresponding to `{ resolved: builtinName, format: "builtin" }` from the resolver.

`@empty` is a jspm-specific builtin providing an empty module object with an empty object as its default export.

The resolver will either return a resolved path string, or throw a _Module Not Found_, _Invalid Module Name_ or _Invalid Configuration_ error.

Absolute paths, URLs, URL-encoding, and relative segments are not supported in the parent path.

_Note that most of the complexity of the resolver comes from handling legacy CJS package type fallbacks properly. For example, we support CommonJS packages within jspm_packages for legacy linking workflows which perform a hybrid resolution which is carefully defined just for this edge case yet unnecessary in the bulk of workflows._

The resolution algorithm breaks down into the following high-level process to get the fully resolved path:

> **JSPM_RESOLVE(name: String, parentPath: String, cjsResolve: Boolean, isMain: Boolean)**
> 1. Assert _parentPath_ is a valid absolute file system path.
> 1. Let _jspmProjectPath_ be the result of _GET_JSPM_PROJECT_PATH(parentPath)_.
> 1. If _IS_PLAIN(name)_ is _false_ then,
>    1. Return the result of _RELATIVE_RESOLVE(name, parentPath, jspmProjectPath, cjsResolve, isMain)_.
> 1. If _jspmProjectPath_ is _undefined_ then,
>    1. Return _NODE_MODULES_RESOLVE(name, parentPath, cjsResolve)_.
> 1. Let _parentScope_ be the result of _GET_PACKAGE_SCOPE(parentPath)_.
> 1. Let _parentConfig_ be the result of _READ_PACKAGE_JSON(parentScope)_, if _parentScope is not _undefined_.
> 1. Let _mapped_ be the value of _RESOLVE_MAP(name, parentConfig?.map)_
> 1. If _mapped_ is not _undefined_ then,
>    1. If _mapped_ starts with _"./"_ then,
>       1. Let _resolved_ be the path resolution of _mapped_ relative to base _parentScope_.
>       1. If _cjsResolve_ is equal to _true_ then,
>          1. Let _realpath_ be the boolean indicating if _jspmProjectPath_ is _undefined_ or _resolved_ is not contained within _jspmProjectPath_.
>          1. Return _CJS_FINALIZE_RESOLVE(resolved, realpath, isMain)_.
>       1. Return _FINALIZE_RESOLVE(resolved, true, isMain)_.
>    1. Otherwise, set _name_ to _mapped_.
> 1. Let _resolved_ to the result of _JSPM_PROJECT_RESOLVE(name, parentScope, parentConfig, jspmProjectPath, cjsResolve, isMain)_.
> 1. If _resolved_ is not equal to _undefined_, return _resolved_.
> 1. If _name_ is a builtin module or _"@empty"_ then,
>    1.  Return the object _{ resolved: name, format: "builtin" }_.
> 1. Throw a _Module Not Found_ error.

> **RELATIVE_RESOLVE(name: String, parentPath: String, jspmProjectPath: String, cjsResolve: Boolean, isMain)**
> 1. Let _resolved_ be _undefined_.
> 1. Set _name_ to _URI_DECODE(name)_.
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
> 1. Let _jspmProject_ be the boolean indicating if _jspmProjectPath_ is _undefined_ or _resolved_ is not contained within _jspmProjectPath_.
> 1. If _cjsResolve_ is equal to _true_ then,
>    1. Let _scope_ be the result of _GET_PACKAGE_SCOPE(resolved)_.
>    1. If _scope_ is not _undefined_ then,
>       1. Let _pjson_ be the result of _READ_PACKAGE_JSON("${scope}/package.json")_.
>    1. Return _NODE_PACKAGE_RESOLVE(resolved, false, jspmProject, scope, pjson, isMain)_.
> 1. Return _FINALIZE_RESOLVE(resolved, jspmProject, isMain)_.

> **JSPM_PROJECT_RESOLVE(name: String, parentScope: String, parentConfig: String, jspmProjectPath: String, cjsResolve: Boolean, isMain: Boolean)**
> 1. Let _jspmConfig_ be the result of _READ_JSPM_CONFIG(jspmProjectPath)_.
> 1. If _jspmConfig_ is _undefined_ then,
>    1. Return _undefined_.
> 1. Let _parentPackage_ be _PARSE_PACKAGE_PATH(parentScope)_ if _parentScope_ is not _undefined_.
> 1. Let _packageName_ and _packageSubpath_ be the destructured properties of _PARSE_PACKAGE(name)_, throwing on abrupt completion.
> 1. Let _packageResolution_ be _undefined_.
> 1. If _parentPackage.package_ is not _undefined_ then,
>    1. Set _packageResolution_ to _jspmConfig.dependencies[parentPackage.name]?.resolve[packageName]_.
> 1. If _packageResolution_ is _undefined_ then,
>    1. If _parentPackage.package_ is _undefined_ or _name_ is a match of _parentConfig.peerDependencies_ then,
>         1. Set _packageResolution_ to _jspmConfig.resolve[packageName]_.
> 1. If _packageResolution_ is _undefined_, return _undefined_.
> 1. If _packageResolution_ is not a valid exact package name, throw an _Invalid Configuration_ error.
> 1. Let _packagePath_ be the result of _PACKAGE_TO_PATH(packageResolution, jspmProjectPath)_.
> 1. Let _packageConfig_ be the result of _READ_PACKAGE_JSON(packagePath)_.
> 1. Let _resolved_ be the result of _RESOLVE_PACKAGE(packagePath, packageSubpath, packageConfig)_.
> 1. If _cjsResolve_ is *true* then,
>    1. Return the result of _CJS_FINALIZE_RESOLVE(resolved, packagePath, isMain)_.
> 1. Otherwise,
>    1. Let _jspmProject_ be the boolean indicating if _jspmProjectPath_ is not _undefined_.
>    1. Return the result of _FINALIZE_RESOLVE(resolved, jspmProject, isMain)_.

> **FINALIZE_RESOLVE(resolved: String, jspmProject: Boolean, isMain: Boolean)**
> 1. If _resolved_ ends with the character _"/"_ then,
>    1. Return _{ resolved, format: "unknown" }_.
> 1. If the file at _resolved_ does not exist throw a _Module Not Found_ error.
> 1. If _resolved_ ends in _".mjs"_ then,
>    1. Return _{ resolved, format: "module" }_.
> 1. If _resolved_ ends in _".node"_ then,
>    1. Return _{ resolved, format: "addon" }_.
> 1. If _resolved_ ends in _".json"_ then,
>    1. Return _{ resolved, format: "json" }_.
> 1. If _isMain_ is _false_ and _resolved_ does not end with _".js"_ then,
>    1. Return _{ resolved, format: "unknown" }_.
> 1. Let _scope_ be the result of _GET_PACKAGE_SCOPE(resolved)_.
> 1. If _scope_ is not _undefined_ then,
>    1. Let _pjson_ be the result of _READ_PACKAGE_JSON("${scope}/package.json")_.
> 1. Let _cjs_ be _true_ if _jspmProject_ is false.
> 1. If _pjson?.type_ is equal to _"commonjs"_ then,
>    1. Set _cjs_ to _true_.
> 1. If _pjson?.type_ is equal to _"module"_ then,
>    1. Set _cjs_ to _false_.
> 1. Return _{ resolved, format: cjs ? "commonjs": "module" }_.

> **CJS_FINALIZE_RESOLVE(resolved: String, packagePath: Boolean, isMain: Boolean)**
> 1. Set _resolved_ to _LEGACY_FILE_RESOLVE(resolved)_.
> 1. If _resolved_ is _undefined_ then,
>    1. Let _pcfg_ be the result of _READ_PACKAGE_JSON(resolved)_.
>    1. Set _resolved_ to _LEGACY_DIR_RESOLVE(resolved, pcfg?.main)_.
> 1. If _resolved_ is _undefined_ then,
>    1. Throw a _Module Not Found_ error.
> 1. Let _format_ be equal to _"unknown"_.
> 1. If _isMain_ is _true_ then,
>    1. Set _format_ to _"commonjs"_.
> 1. If _resolved_ ends with _".mjs"_ then,
>    1. Throw a _Invalid Module Name_ error.
> 1. Otherwise if _resolved_ ends with _".js"_ then,
>    1. Set _format_ to _"commonjs"_.
> 1. Otherwise if _resolved_ ends with _".json"_ then,
>    1. Set _format_ to _"json"_.
> 1. Otherwise if _resolved_ ends with _".node"_ then,
>    1. Set _format_ to _"addon"_.
> 1. Set _resolved_ to the real path of _resolved_ within _packagePath_.
> 1. Return the object with properties _{ resolved, format }_.

> **LEGACY_FILE_RESOLVE(path: String)**
> 1. Assert _path_ is a valid file path.
> 1. If _path_ ends with the character _"/"_ then,
>    1. Return _path_.
> 1. Otherwise if the file at _path_ exists,
>    1. Return _path_.
> 1. Return _LEGACY_EXTENSION_RESOLVE(path)_.

> **LEGACY_EXTENSION_RESOLVE(path: String)**
> 1. If the file at _path + ".js"_ exists,
>    1. Return _path + ".js"_.
> 1. Otherwise if the file at _path + ".json"_ exists,
>    1. Return _path + ".json"_.
> 1. Otherwise if the file at _path + ".node"_ exists,
>    1. Return _path + ".node"_.
> 1. Return _undefined_.

> **LEGACY_DIR_RESOLVE(path: String, main: String | Undefined)**
> 1. If _main_ is a String then,
>    1. Let _resolved_ be _LEGACY_FILE_RESOLVE(path + "/" + main)_.
>    1. If _resolved_ is _undefined_ then,
>       1. Set _resolved_ to _LEGACY_EXTENSION_RESOLVE(path + "/" + main + "/index")_.
>    1. If _resolved_ is not _undefined_, return _resolved_.
> 1. Return _LEGACY_EXTENSION_RESOLVE(path + "/index")_.
