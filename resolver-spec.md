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

In addition, jspm does not implement the real path lookup for modules loaded. This allows globally and locally linked packages to be scoped to the project they are loaded in, so the entire resolution for the project is managed through a single jspm configuration file despite many packages possibly being linked together.

### Plain Names

`plain names` or `bare names` as they are referred to in the WHATWG loader specification are module names
that do not start with `/` or `./` or `../` and do not parse as valid URLs.

Plain names are the module names that run through local map, jspm project resolution and exports resolution phases.

### Package Scopes

jspm projects have two levels of package scopes - the base-level project scope containing the package.json and jspm.json file, and the dependency package scopes, denoted by their jspm_packages/package@version paths.

When resolving into a package, the local package.json's `"main"` and other entries are used along with `"exports"`, `"map"` and `"type"` configuration.

When resolving a new package, the `jspm.json` the local package.json `"map"` is checked followed by the jspm file of the project base for the package resolution.

#### jspm Project Scopes

The detection of the jspm project for a given path is based on taking the base folder containing the `"jspm_packages"` if any, or alternatively checking for a `jspm.json` configuration file. Both operations stop on the first `"jspm_packages"` or `"node_modules"` segment hit.

If a `jspm_packages` match is made without there being a corresponding jspm.json file, an _Invalid Configuration_ error is thrown.

If no project is found, special treatment is given to resolutions made "without a jspm project", by falling back to `node_modules` resolution for compatibility.

#### Module Format Handling

Each package scope is interpreted based on its "type" being either "commonjs" or "module".

By default jspm treats all packages within a jspm project as `"type": "module"` unless they explicitly contain `"type": "commonjs"`.

Custom assets and paths (via a trailing slash) can also be resolved through the jspm resolver, which will return `"format": "unknown"`.

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
* `ExactPackageName`: A string `s` satisfying the package name canonical validation.

When these configuration type assertions are broken, the configuration is considered invalid, and the entire resolution will abort on the assertion error.

## Algorithms

Any error in any operation, including assertion errors, should be fully propagated as a top-level resolve error abrupt completion.

### Package and Path Parsing

Plain or bare specifier detection is exactly as in the [WHATWG module resolution detection](https://html.spec.whatwg.org/multipage/webappapis.html#resolve-a-module-specifier):

> **IS_PLAIN(name: String): boolean**
> 1. If _name_ parses as a valid URL then return _false_.
> 1. Otherwise if _name_ begins with _"/"_, _"./"_ or _"../"_ then return _false_.
> 1. Otherwise return _true_.

Package names are of the form `name` or `@scope/name`.

Canonical package names are of the form `registry:name@version`.

Valid package names satisfy the JS regular expression `/^((@[^/\\%]+\/)?[^./\\%][^/\\%]*)$/`.

The registry in the canonical form must satisfy the regular expression `/^[a-z]+:$/`.

The version in the canonical form must satisfy the regular expression `/^@[^/\]+$`.

Because versions permit percent-encoding special care must be taken when resolving them, as they should not be URI decoded.

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
>    1. Set _packageName_ to the substring of _specifier_ until before the first _"/"_ separator or the end of the string.
> 1. Otherwise,
>    1. If _specifier_ does not contain a _"/"_ separator then,
>       1. Throw an _Invalid Specifier_ error.
>    1. Set _packageName_ to the substring of _specifier_ until before the second _"/"_ separator or the end of the string.
> 1. If _packageName_ starts with _"."_ or contains _"\\"_ or _"%"_ then,
>    1. Throw an _Invalid Specifier_ error.
> 1. Let _packageSubpath_ be _undefined_.
> 1. If the length of _specifier_ is greater than the length of _packageName_ then,
>    1. Set _packageSubpath_ to _"."_ concatenated with the substring of _specifier_ from the position at the length of _packageName_.
> 1. Return the object with values _{ packageName, packageSubpath }_.

> **PARSE_PACKAGE_PATH(path: String, jspmProjectPath: String): { packageName: String, packageSubpath: String }**
> 1. Let _jspmPackagesPath_ be the path _"jspm_packages/"_ resolved to directory _jspmProjectPath_, including a trailing separator.
> 1. If _path_ does not start with the string _jspmPackagesPath_ then,
>    1. Return _undefined_.
> 1. Let _relPackagePath_ be the substring of _path_ starting at the index of the length of _jspmPackagesPath_.
> 1. Let _registrySep_ be the index of _"/"_ in _relPackagePath_.
> 1. _If _registrySep_ is not defined then,
>    1. Return _undefined_.
> 1. Let _registry_ be the substring of _relPackagePath_ of the length of _registrySep_.
> 1. Let _namePath_ be the substring of _relPackagePath_ starting at the index after _registrySep_.
> 1. Let _packageName_ be the destructured result of _PARSE_PACKAGE(namePath)_, returning _undefined_ on abrupt completion.
> 1. Return the concatenation of _registry_, _":"_ and _packageName_.

> **PACKAGE_TO_PATH(name: String, jspmProjectPath: String): String**
> 1. Let _jspmPackagesPath_ be the path _"jspm_packages/"_ resolved to directory _jspmProjectPath_, including a trailing separator.
> 1. Replace in _name_ the first _":"_ character with _"/"_, throwing an _Invalid Configuration Error_ if none is found.
> 1. Return the result of the path resolution of _name_ within parent _jspmPackagesPath_.

### Reading Project and Package Configuration

Given any file path, we can determine the base jspm project folder with the following algorithm:

> **GET_JSPM_PROJECT_PATH(modulePath: String)**
> 1. Let _jspmPackagesIndex_ be the index of the last _"jspm_packages"_ segment in _modulePath_ if any.
> 1. If there is a _"node_modules"_ path segment after _jspmPackagesIndex_, set _jspmPackagesIndex_ to _undefined_.
> 1. If _jspmPackagesIndex_ is not _undefined_ then.
>    1. Let _projectPath_ be the substring of _modulePath_ of the length of _jspmPackagesIndex_.
>    1. If the file _"jspm.json"_ does not exist in the folder _projectPath_ throw an _Invalid Configuration_ error.
>    1. Return _projectPath_.
> 1. For each parent path _projectPath_ of _modulePath_,
>    1. If the last segment of _projectPath_ is a _"node_modules"_ segment, return _undefined_.
>    1. If the file _"jspm.json"_ exists in the folder _projectPath_ then, 
>       1. If the file _"package.json"_ does not exist in the folder _projectPath_ throw an _Invalid Configuration_ error.
>       1. Return _projectPath_.
> 1. Return _undefined_.

The process of reading the package.json configuration for a given package path is based on the following algorithms:

> **READ_PACKAGE_JSON(packagePath: String)**
> 1. If the file at _packagePath + "/package.json"_ does not exist then,
>    1. Return _undefined_.
> 1. Let _source_ be the contents of the file _packagePath + "/package.json"_
> 1. Let _pcfg_ be set to the cached output of the JSON parser applied to _source_, throwing a _Configuration Error_ on invalid JSON.
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
>       1. If _target_ does not start with _"./"_ then,
>          1. Set _target_ to _"./"_ concatenated with _target_.
>       1. Set _entries[condition]_ to _target_.
> 1. If _pjson.exports_ is a String or Array then,
>    1. Set _entries.main_ to _pjson.exports_.
> 1. Let _exports_ be _undefined_.
> 1. If _pjson.exports_ is not _null_ or _undefined_ then,
>    1. Set _exports_ to an empty _Object_.
> 1. If _pjson.exports_ is an _Object_ then,
>    1. Set _exports_ to _pjson.exports_.
>    1. If _exports_ has a _"."_ property then,
>       1. Set _entries.main_ to _exports["."]_.
> 1. Let _map_ be set to the value of _pjson.map_ if an Object or an empty object otherwise.
> 1. If _pjson.browser_ is an _Object_ then,
>    1. For each key _name_ in _pjson.browser_ do,
>       1. Let _target_ be _pjson.browser[name]_.
>       1. If _target_ is equal to _false_ then,
>          1. Set _target_ to _"@empty"_.
>       1. Ff _target_ is not a String, continue the loop.
>       1. If _name_ starts with _"./"_ then,
>          1. If _target_ does not start with _"./"_ then,
>             1. Set _target_ to _"./"_ concatenated with _target_.
>          1. If _entries.main_ starts with _name_ then,
>             1. Let _extra_ be the substring of _name_ starting at the length of _entries.main_.
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
>    1. If the file at _scope + "/package.json"_ exists then,
>       1. Return _scope_.
>    1. Set _scope_ to the parent path of _scope_.
> 1. Return _undefined_.

### Entries, Exports and Map Resolution

> **RESOLVE_PACKAGE(packagePath: String, subpath: String, pcfg: Object, cjsResolve: Boolean)**
> 1. Assert: _subpath_ is the empty String or starts with _"./"_.
> 1. If _subpath_ is the empty String then,
>    1. Let _match_ be the first matching environment condition in _pcfg.entries_ in condition priority order.
>    1. Let _resolvedEntry_ be _undefined_.
>    1. If _match_ is not _undefined_ then,
>       1. Set _resolvedEntry_ to the result of _RESOLVE_EXPORTS_TARGET(packagePath, _pcfg.entries[match]_, "")_.
>       1. If the file at _resolvedEntry_ exists, return _resolvedEntry_.
>    1. If _pcfg.type_ is equal to _"module"_ and _cjsResolve_ is _false_, throw a _Module Not Found_ error.
>    1. Let _entryDir_ be the substring of _resolvedEntry_ of the lenth of _packagePath_ plus one.
>    1. Set _resolved_ to _LEGACY_DIR_RESOLVE(packagePath + "/", entryDir)_.
>    1. If _resolved_ is not _undefined_, return _resolved_.
>    1. Throw a _Module Not Found_ error.
> 1. If _subpath_ is equal to _"./"_ return _packagePath + "/"_.
> 1. If _pcfg.exports_ is _undefined_ or _null_ then,
>    1. Set _subpath_ to _URI_DECODE(subpath)_.
>    1. Return the resolution of _subpath_ in _packagePath_.
> 1. If _pcfg.exports_ is not an _Object_ then,
>    1. Throw a _Module Not Found_ error.
> 1. If _subpath_ is a key of _pcfg.exports_ then,
>    1. Return the result of _RESOLVE_EXPORTS_TARGET(packagePath, pcfg.exports[subpath], "")_.
> 1. For each entry _export_ of the keys of _pcfg.exports_ sorted by length descending,
>    1. If _export_ does not end in _"/"_, continue the loop.
>    1. If _subpath_ begins with _export_ then,
>       1. Let _target_ be _pcfg.exports[export]_.
>       1. Let _exportSubpath_ be the substring of _subpath_ starting at the length of _export_.
>       1. Return _RESOLVE_EXPORTS_TARGET(packagePath, target, exportSubpath)_.
> 1. Throw a _Module Not Found_ error.

> **RESOLVE_EXPORTS_TARGET(packagePath; String, target: Any, subpath: String)**
> 1. If _target_ is a String then,
>    1. If _subpath_ has non-zero length and _target_ does not end with _"/"_, throw a _Module Not Found_ error.
>    1. If _target_ does not start with _"./"_ then,
>       1. Let _possibleBuiltin_ be the parsed URL of _target_ concatenated with _subpath_.
>       1. If _possibleBuiltin_ is a valid builtin module for the environment then,
>          1. Return _possibleBuiltin_.
>       1. Otherwise, throw a _Module Not Found_ error.
>    1. Set _target_ to _URI_DECODE(target)_.
>    1. Set _subpath_ to _URI_DECODE(subpath)_.
>    1. Let _resolvedTarget_ be the resolution of _packagePath_ and _target_.
>    1. If _resolvedTarget_ is contained in _packagePath_ then,
>       1. Let _resolved_ be the resolution of _subpath_ and _resolvedTarget_.
>       1. If _resolved_ is contained in _resolvedTarget_, return _resolved_.
> 1. Otherwise, if _target_ is an Array then,
>    1. For each item _targetValue_ of _target_,
>       1. If _targetValue_ is not a String or Object, continue the loop.
>       1. Return the result of _RESOLVE_EXPORTS_TARGET(packagePath, targetValue, subpath)_, continuing the loop on a _Module Not Found_ error.
> 1. Otherwise, if _target_ is Null then,
>    1. Throw a _Module Not Found_ error.
> 1. Otherwise, if _target_ is an Object then,
>    1. For each environment condition _condition_ in priority order,
>       1. If _condition is a valid key of _target_ then,
>          1. Let _targetValue_ be _target[condition]_.
>          1. Return the result of _RESOLVE_EXPORTS_TARGET(packagePath, targetValue, subpath)_, propagating any error.
> 1. Throw a _Module Not Found_ error.

> **RESOLVE_MAP(name: String, packagePath: String, pcfg: Object)**
> 1. If _pcfg.map_ is _undefined_ then,
>    1. Return _undefined_.
> 1. If _name_ is a key of _pcfg.map_ then,
>    1. Return the result of _RESOLVE_MAP_TARGET(packagePath, pcfg.map[name], "")_, propagating any error on abrupt completion.
> 1. For each entry _map_ of the keys of _pcfg.map_ sorted by length descending,
>    1. If _map_ does not end in _"/"_ and the character of _map_ at the index of the length of _name_ is not _"/"_, continue the loop.
>    1. If _name_ begins with _map_ then,
>       1. Let _target_ be _pcfg.map[map]_.
>       1. Let _mapSubpath_ be the substring of _name_ starting at the length of _map_.
>       1. Return the result of _RESOLVE_MAP_TARGET(packagePath, target, mapSubpath)_, propagating any error on abrupt completion.
> 1. Return _undefined_.

> **RESOLVE_MAP_TARGET(packagePath: string, target: Any, subpath: String)**
> 1. Note: If _subpath_ starts with _"/"_ that indicates a possible direct package subpath resolution.
>    which will invalidate any matched target that is not a direct package name without a subpath.
> 1. If _target_ is a String then,
>    1. If _target_ is a valid package name then (as determined by _PARSE_PACKAGE_ below),
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
>       1. Let _resolvedTarget_ be the resolution of _packagePath_ and _target_.
>       1. If _resolvedTarget_ is contained in _packagePath_ then,
>          1. Let _resolved_ be the resolution of _subpath_ and _resolvedTarget_.
>          1. If _resolved_ is contained in _resolvedTarget_, return _"./"_ concatenated with the substring of _resolved_ from the length of _packagePath_.
> 1. Otherwise, if _target_ is an Array then,
>    1. For each item _targetValue_ of _target_,
>       1. If _targetValue_ is not a String or Object, continue the loop.
>       1. Return the result of _RESOLVE_MAP_TARGET(packagePath, targetValue, subpath)_, continuing the loop on a _Module Not Found_ error.
> 1. Otherwise, if _target_ is an Object then,
>    1. For each environment condition _condition_ in priority order,
>       1. Let _targetValue_ be _target[condition]_.
>       1. If _targetValue_ is not a String or Object, continue the loop.
>       1. Return the result of _RESOLVE_MAP_TARGET(packagePath, targetValue, subpath)_, propagating any error on abrupt completion.
> 1. Throw a _Module Not Found_ error.

### Module Resolution Algorithm

Module resolution is always based on resolving `resolve(name, parentPath)` where `name` is the optional unresolved name to resolve and `parentPath` is an absolute file path to resolve relative to.

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

where the first match in order will be picked from conditional branches in resolution configuration.

All NodeJS builtins are accepted as plain name resolutions, corresponding to `{ resolved: builtinName, format: "builtin" }` from the resolver.

`@empty` is a jspm-specific builtin providing an empty module object with an empty object as its default export, and is treated as another builtin module in all builtin module checks.

The resolver will either return a resolved path string, or throw a _Module Not Found_, _Invalid Module Name_ or _Invalid Configuration_ error.

The resolution algorithm breaks down into the following high-level process to get the fully resolved path:

> **JSPM_RESOLVE(name: String, parentPath: String, cjsResolve: Boolean, isMain: Boolean)**
> 1. Assert _parentPath_ is a valid absolute file system path.
> 1. Let _jspmProjectPath_ be the result of _GET_JSPM_PROJECT_PATH(parentPath)_.
> 1. If _IS_PLAIN(name)_ is _false_ then,
>    1. Return the result of _RELATIVE_RESOLVE(name, parentPath, jspmProjectPath, cjsResolve, isMain)_.
> 1. Let _parentScope_ be the result of _GET_PACKAGE_SCOPE(parentPath)_.
> 1. Let _parentConfig_ be the result of _READ_PACKAGE_JSON(parentScope)_, if _parentScope is not _undefined_.
> 1. Let _mapped_ be the value of _RESOLVE_MAP(name, parentScope, parentConfig)_
> 1. If _mapped_ is not _undefined_ then,
>    1. If _mapped_ does not start with _parentScope_ then,
>       1. Set _name_ to _mapped_.
>    1. If _cjsResolve_ is equal to _true_ then,
>       1. Return _CJS_FINALIZE_RESOLVE(mapped, jspmProjectPath)_.
>    1. Otherwise
>       1. Return _FINALIZE_RESOLVE(mapped, jspmProjectPath, isMain)_.
>    1. Otherwise, set _name_ to _mapped_.
> 1. If _jspmProjectPath_ is not _undefined_ then,
>    1. Return the result of _JSPM_PROJECT_RESOLVE(name, parentPath, jspmProjectPath, cjsResolve, isMain)_.
> 1. Otherwise,
>    1. Return the result of _NODE_MODULES_RESOLVE(name, parentPath, cjsResolve, isMain)_.

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
> 1. If _cjsResolve_ is equal to _true_ then,
>    1. Return _CJS_FINALIZE_RESOLVE(resolved, jspmProjectPath)_.
> 1. Otherwise,
>    1. Return _FINALIZE_RESOLVE(resolved, jspmProjectPath, isMain)_.

> **JSPM_PROJECT_RESOLVE(name: String, parentPath: String, jspmProjectPath: String, cjsResolve: Boolean, isMain: Boolean)**
> 1. Let _jspmConfig_ be the parsed contents of _"jspm.json"_ in _jspmProjectPath_, throwing a _Configuration Error_ for not found or invalid JSON.
> 1. Let _parentPackage_ be _PARSE_PACKAGE_PATH(parentPath)_ if _parentPath_ is not _undefined_.
> 1. Let _packageName_ and _packageSubpath_ be the destructured properties of _PARSE_PACKAGE(name)_, throwing on abrupt completion.
> 1. Let _packageResolution_ be _undefined_.
> 1. If _parentPackage_ is not _undefined_ then,
>    1. Set _packageResolution_ to _jspmConfig.dependencies[parentPackage]?.resolve[packageName]_.
> 1. Otherwise,
>    1. Set _packageResolution_ to _jspmConfig.resolve[packageName]_.
> 1. If _packageResolution_ is _undefined_ then,
>    1. Set _packageResolution_ to _jspmConfig.resolvePeer?[packageName]_.
> 1. If _packageResolution_ is _undefined_ then,
>    1. If _name_ is a builtin module, return _{ resolved: name, format: "builtin" }_.
>    1. Throw a _Module Not Found_ error.
> 1. Let _packagePath_ be the result of _PACKAGE_TO_PATH(packageResolution, jspmProjectPath)_.
> 1. Let _packageConfig_ be the result of _READ_PACKAGE_JSON(packagePath)_.
> 1. Let _resolved_ be the result of _RESOLVE_PACKAGE(packagePath, packageSubpath, packageConfig, cjsResolve)_.
> 1. If _cjsResolve_ is *true* then,
>    1. Return the result of _CJS_FINALIZE_RESOLVE(resolved, jspmProjectPath)_.
> 1. Otherwise,
>    1. Return the result of _FINALIZE_RESOLVE(resolved, jspmProjectPath, isMain)_.

> **NODE_MODULES_RESOLVE(name: String, parentPath: String, cjsResolve: Boolean, isMain: Boolean)**
> 1. If _name_ is a builtin module, return _{ resolved: name, format: "builtin" }_.
> 1. Let _packageName_ and _packageSubpath_ be the destructured values of _PARSE_PACKAGE(specifier)_, throwing on abrupt completion.
> 1. While _parentPath_ is not the file system root,
>    1. Let _packagePath_ be the resolution of _"node_modules/"_ concatenated with _name_, relative to _parentPath_.
>    1. Set _parentPath_ to the parent folder of _parentPath_.
>    1. If the folder at _packagePath_ does not exist, then
>       1. Set _parentPath_ to the parent path of _parentPath_.
>       1. Continue the next loop iteration.
>    1. Let _packageConfig_ be the result of _READ_PACKAGE_JSON(packagePath)_.
>    1. Let _resolved_ be the result of _RESOLVE_PACKAGE(packagePath, packageSubpath, packageConfig, cjsResolve)_.
>    1. If _cjsResolve_ then,
>       1. Return the result of _CJS_FINALIZE_RESOLVE(resolved, undefined)_.
>    1. Otherwise,
>       1. Return the result of _FINALIZE_RESOLVE(resolved, undefined, isMain)_.
> 1. Throw a _Module Not Found_ error.

> **FINALIZE_RESOLVE(path: String, jspmProjectPath: String | undefined, isMain: Boolean)**
> 1. Let _realpathBase_ be the value of _PACKAGE_TO_PATH(path)_ or _jspmProjectPath_ if _jspmProjectPath_ is defined, and _undefined_ otherwise.
> 1. Set _resolved_ to the real path of _path_ within _realpathBase_.
> 1. Let _scope_ be the result of _GET_PACKAGE_SCOPE(resolved)_.
> 1. Let _scopeConfig_ be the result of _READ_PACKAGE_JSON(scope + "/package.json")_, if _scope_ is defined.
> 1. If _resolved_ ends with the character _"/"_ then,
>    1. If _resolved_ does not point to an existing directory, throw a _Module Not Found_ error.
>    1. Return _{ resolved, format: "unknown" }_.
> 1. If _resolved_ does not point to an existing file, throw a _Module Not Found_ error.
> 1. If _resolved_ ends in _".mjs"_ then,
>    1. Return _{ resolved, format: "module" }_.
> 1. If _resolved_ ends in _".node"_ then,
>    1. Return _{ resolved, format: "addon" }_.
> 1. If _resolved_ ends in _".json"_ then,
>    1. Return _{ resolved, format: "json" }_.
> 1. If _isMain_ is _false_ and _resolved_ does not end with _".js"_ then,
>    1. Return _{ resolved, format: "unknown" }_.
> 1. If _scopeConfig?.type_ is _"module"_ then,
>    1. Return _{ resolved, format: "module" }_.
> 1. Return _{ resolved, format: "commonjs" }_.

> **CJS_FINALIZE_RESOLVE(path: String, jspmProjectPath: String | undefined)**
> 1. If _path_ ends with the character _"/"_ then,
>    1. If _path_ does not point to an existing directory, throw a _Module Not Found_ error.
>    1. Let _resolved_ be _path_.
> 1. Otherwise,
>    1. Let _resolved_ be _LEGACY_FILE_RESOLVE(path)_.
>    1. If _resolved_ is _undefined_ then,
>       1. Let _pjson_ be the value of _READ_PACKAGE_JSON(path)_.
>       1. Set _resolved_ to _LEGACY_DIR_RESOLVE(path, pjson?.main)_.
>    1. If _resolved_ is _undefined_ then,
>       1. Throw a _Module Not Found_ error.
> 1. Let _realpathBase_ be the value of _PACKAGE_TO_PATH(path)_ or _jspmProjectPath_ if _jspmProjectPath_ is defined, and _undefined_ otherwise.
> 1. Set _resolved_ to the real path of _resolved_ within _realpathBase_.
> 1. Let _scope_ be the result of _GET_PACKAGE_SCOPE(resolved)_.
> 1. Let _scopeConfig_ be the result of _READ_PACKAGE_JSON(scope + "/package.json")_, if _scope_ is defined.
> 1. If _resolved_ ends in _"/"_ then,
>    1. Return _{ resolved, format: "unknown" }_.
> 1. If _resolved_ ends with _".mjs"_ or _resolved_ ends with _".js"_ and _scopeConfig?.type_ is equal to _"module"_ then,
>    1. Throw a _Invalid Module Name_ error.
> 1. If _resolved_ ends in _".node"_ then,
>    1. Return _{ resolved, format: "addon" }_.
> 1. If _resolved_ ends with _".json"_ then,
>    1. Return _{ resolved, format: "json" }_.
> 1. Return _{ resolved, format: "commonjs" }_.

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
