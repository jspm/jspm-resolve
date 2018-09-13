# JSPM Resolver Specification

This is the primary specification of the jspm 2.0 resolver algorithm.

## jspm Resolver Principles

All module names in the WhatWG module script resolution are treated as URLs with the encoding rules that apply. When using an ES module loader running in NodeJS, File URLs are the preferable way to maintain compatilibity, to ensure that the handling of resolution and encoding cases is shared between the browser and Node.

For the purposes of practicality though, the jspm resolution algorithm is specified as a specification on paths. Normalization from URL into path space is handled as a pre-resolution transform on the specifier which is defined in the main resolver algorithm here, before returning the correct valid absolute file path for the system.

### Plain Names

`plain names` or `bare names` as they are referred to in the WhatWG loader specification are module names
that do not start with `/` or `./` or `../` and do not parse as valid URLs.

Plain names are the module names that run through multiple remapping phases, although absolute URL names can be remapped as well
through contextual relative map configuration.

### Package Boundaries

Package boundaries are considered to exist for all subfolders of a given folder whenever there is a package.json file.

All modules within that group of folders, down to the next package boundary, are considered within that package's package boundary.

#### Module Format Handling

Each package boundary is interpreted based on its "mode" being either "cjs" or "esm".

By default jspm treats all package boundaries as `"mode": "esm"` unless (a) they are explicitly `"mode": "cjs"` or (b) they are packages located in a node_modules path.

The resolver itself will return both the resolved path and the module format for any resolution.

The return value of the resolver itself is both resolved path and the module format string of the form `"esm"`, `"cjs"`,  `"json"`, `"addon"` for Node addons and `"builtin"` for builtins.

Custom assets can also be resolved through the jspm resolver, which will return `"format": "unknown"`.

ES modules cannot resolve to `.json` or `.node` files currently.

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

In addition if there is a `"bin"` string, or object with exactly one entry, or an entry exactly matching the `"name"` field in the package.json file,
then that will be treated as a bin map with the highest precedence:

```json
{
  "name": "pkg",
  "main": "x",
  "browser": "y",
  "bin": {
    "pkg": "./bin.js"
  }
}
```

is interpreted as:

```json
{
  "main": "x",
  "map": {
    "./x": {
      "bin": "./bin.js",
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

jspm resolution information is provided through a `jspm.lock` file which must be in the same folder as the package.json file forming the package boundary.

The `jspm.lock` jspm configuration file stores jspm configuration and version lock information for jspm projects.

The following properties are the only ones which affect the jspm resolution of a module:

`jspm.lock`:
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

> **PACKAGE_TO_PATH(name: String, path: String, jspmPackagesPath: String): String**
> 1. Assert _name_ satisfies the valid package name regular expression.
> 1. Assert _path_ starts with _"/"_.
> 1. Replace in _name_ the first _":"_ character with _"/"_.
> 1. Return the result of the path resolution of _"${name}"_ within parent _jspmPackagesParent_.

The parse functions return undefined if not a valid package canonical name form, while the package to URL function must
always be called against a valid package canonical name form.

### Path Resolution

All paths are resolved using the OS-specific resolver handling, using the `/` separator, replacing any instances of the `\\` separator on resolution.

When resolving paths in Windows, we ensure that resolution uses the `/` separator for greater consistency between platforms.
The reason for this is that `/` is supported fine as a path separator in Windows APIs (eg for `C:/some/path`), which is enough of
a change to remove a lot of the pain in working with cross-platform path handling.

### Reading jspm Configuration

The jspm resolver configuration for a given package is taken based on checking both the first (inner) and second (outer) package boundaries for a given path.

If the inner package boundary is within the jspm_packages of the outer package boundary then the outer package configuration is returned to supported linked jspm_packages.

Given a file path, we can determine the base project folder, jspm packages path and jspm configuration with the following algorithm:

> **GET_JSPM_CONFIG(modulePath: String)**
> 1. Let _innerConfig_ be _undefined_.
> 1. Let _parentPaths_ be the array of parent paths of _modulePath_ ordered by length decreasing, excluding a trailing separator.
> 1. For each _projectPath_ of _parentPaths_,
>    1. If the last path segment of _projectPath_ is equal to _"node_modules"_ then,
>       1. Return _innerConfig_.
>    1. If the file at _"package.json"_ within the folder _projectPath_ does not exist then,
>       1. Continue the loop.
>    1. Let _jspmConfigPath_ be the resolved path of _"jspm.lock"_ within parent folder _projectPath_.
>    1. Let _jspmConfig_ be set to _undefined_.
>    1. If the file at _jspmConfigPath_ exists,
>       1. Set _jspmConfig_ to the output of the JSON parser applied to the contents of _jspmConfigPath_, throwing a _Configuration Error_ on invalid JSON.
>    1. If _jspmConfig_ is not _undefined_ then,
>       1. Let _projectPath_ be the real path of _projectPath_.
>       1. Set _jspmPackagesPath_ to the resolved path of _"jspm_packages/"_ within parent folder _projectPath_.
>       1. If _innerConfig_ is not _undefined_ then,
>          1. If _innerConfig.projectPath_ is not an exact package name path contained in _jspmPackagesPath_ then,
>             1. Return the value of _innerConfig_.
>          1. Return the object with values _{ projectPath, jspmConfig, jspmPackagesPath }_.
>       1. Set _innerConfig_ to the object with values _{ projectPath, jspmConfig, jspmPackagesPath }_.
> 1. Return the value of _innerConfig_.

The return value of the above method is either `undefined` or an object of the form `{ projectPath, jspmConfig }`.

This algorithm only needs to be applied once per given path, and can cache all file system checks.

### Reading Package Configuration

The process of reading the main, map and mode for a given module's package boundary is based on the following algorithm.

Like the jspm configuration lookup this check also checks the outer package boundary, and if it is a jspm project, then the mode of the package defaults to "esm".

> **GET_PACKAGE_CONFIG(modulePath: String)**
> 1. For each parent path _path_ of _modulePath_ including _modulePath_ in descending order,
>    1. If _path_ ends in a _"node_modules"_ segment then,
>       1. Break the loop.
>    1. If the file at _"${path}/package.json"_ does not exist then,
>       1. Continue the next loop iteration.
>    1. Let _pjson_ be set to the cached output of the JSON parser applied to the contents of _"${path}/package.json"_, throwing a _Configuration Error_ on invalid JSON.
>    1. Let _main_ be equal to the value of _pjson.main_ if a string or _undefined_ otherwise.
>    1. Let _map_ be set to the value of _pjson.map_ if an object or _undefined_ otherwise.
>    1. Let _mode_ be set to _undefined_.
>    1. If _pjson.mode_ is equal to _"cjs"_ or _"esm"_ then,
>       1. Set _mode_ to _pjson.mode_.
>    1. If _pjson.react-native_ is a _string_ then,
>       1. Set _map_ to an object if _undefined_.
>       1. Call _ADD_MAP_CONDITION(map, pjson.main, "react-native", pjson.react-native)_.
>    1. If _pjson.electron_ is a _string_ then,
>       1. Set _map_ to an object if _undefined_.
>       1. Call _ADD_MAP_CONDITION(map, pjson.main, "electron", pjson.electron)_.
>    1. If _pjson.browser_ is a _string_ then,
>       1. Set _map_ to an object if _undefined_.
>       1. Call _ADD_MAP_CONDITION(map, pjson.main, "browser", pjson.browser)_.
>    1. If _pjson.browser_ is an _object_ then,
>       1. Set _map_ to an object if _undefined_.
>       1. For each key _name_ in _pjson.browser_,
>          1. Let _target_ be the value of _pjson.browser[name]_.
>          1. If _target_ is equal to _false_ then,
>             1. Set _target_ to _"@empty"_.
>          1. Call _ADD_MAP_CONDITION(map, name, "browser", pjson.browser[name])_.
>    1. If the property _pjson.main_ exists and is a string then,
>       1. Set _main_ to _pjson.main_.
>       1. If _main_ starts with _"./"_ then,
>          1. Set _main_ to the substring of _main_ after _"./"_.
>    1. Return the object with properties _{ path, main, map, mode }_.
> 1. Return the object with undefined properties _{ path, main, map, mode }_.

The responses of this method can be cached for the resolver lifecycle, with package.json caching shared with _GET_JSPM_CONFIG_ as well.

The following utility method is used in the above algorithm:

> **ADD_MAP_CONDITION(map: MapConfiguration, match: String, condition: String, target: String)**
> 1. If _map_ does not contain an entry for _match_ then,
>    1. Set _map[match]_ to an empty object.
> 1. If _map[match]_ is a string then.
>    1. Set _map[match]_ to the object _{ default: map[match] }_.
> 1. Assert _map[match]_ is an object.
> 1. Set _map[match][condition]_ to _target_.

### Matching and Applying Map Resolution

jspm configurations use resolve maps to match a plain name and direct it to a new module name.
Matching a map is based on finding the longest map target that matches the start of the plain name.

Map configurations in the jspm configurations also support conditional objects which represent map branches based
on environment conditionals.

Match boundaries are taken to be the `/` separator or the end of the name. In this way the map `{ 'x/y': 'z' }` can match both `x/y` and `x/y/path`.

Maps can also enforce a trailing separator to match directories separately to exact paths, for example with `{ 'x': './y/main.js', 'x/': './y/' }`.

The root directory map of `{ './': './root/' }` is permitted, while a single `.` match is not supported as this is handled via the main configuration.

Applying the map is then the process of adding back the subpath after the match (`x/y/path` mapping into `z/path` for the `{ 'x/y': 'z' }` map), including support for condition branches:

> **APPLY_MAP(name: String, resolveMap: Object)**
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
> 1. If _mapped_ is equal to _"@empty"_ then return _"@empty"_.
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

### File Extension and Directory Index Handling

Automatic file extensions and directory indices are only provided for packages that are in the CommonJS mode.

Packages in the ESM mode get no automatic extensions. If no package.json main is present, importing the package without an explicit subpath will throw a resolution error.

Instead, map configuration is designed to allow customizing internal package resolutions.

In addition, jspm does not implement the real path lookup for modules loaded. This allows globally and locally linked packages to be scoped to the project they are loaded in, so the entire resolution for the project is managed through a single jspm configuration file despite many packages possibly being linked in.

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

`@empty` and `@notfound` are jspm-specific builtins providing an empty module object and a module that throws a not found error on import respectively.

The resolver will either return a resolved path string, or throw a _Module Not Found_, _Invalid Module Name_ or _Invalid Configuration_ error.

Package name requests and plain name requests are both considered unescaped - that is URL decoding will not be applied. URL decoding is only applied to URL-like requests.

The parent pathname is assumed a valid fully-resolved path in the environment. Any `\\` in Windows paths are converted into `/` for consistency within this resolver. Absolute paths, URLs, URL-encoding, and relative segments are not supported in the parent path.

While jspm_packages should always be "mode": "esm", support for CommonJS packages in jspm_packages is included as the package "mode" is always respected. This is tracked in the third argument to the resolver.

The resolution algorithm breaks down into the following high-level process to get the fully resolved path:

> **JSPM_RESOLVE(name: String, parentPath: String, esmResolve: true)**
> 1. Assert _parentPath_ is a valid absolute file system path.
> 1. If _name_ contains the substring _"%2F"_ or _"%5C"_ then,
>    1. Throw an _Invalid Module Name_ error.
> 1. If _IS_PLAIN(name)_ is _false_ then,
>    1. Let _resolved_ be equal to _undefined_.
>    1. Replace in _name_ any _"\"_ character with _"/"_.
>    1. Replace in _name_ all percent-encoded values with their URI-decodings.
>    1. If _name_ starts with _"//"_ and _name_ does not start with _"///"_ then,
>       1. Throw an _Invalid Module Name_ error.
>    1. Otherwise if _name_ starts with _"/"_ or _name_ starts with _"/"_ then,
>       1. If in a Windows environment,
>          1. Set _resolved_ to the resolved file path of the substring of _name_ from the index after the last leading _"/"_.
>       1. Otherwise,
>          1. Set _resolved_ to the resolved file path of the substring of _name_ from the index of the last leading _"/"_.
>    1. Otherwise if _name_ starts with _"."_ then,
>       1. Set _resolved_ to the path resolution of _name_ relative to _parentPath_.
>    1. Otherwise if running in Windows, and _name_ starts with a letter (uppercase or lowercase) in the a-z range followed by _":"_ then,
>       1. Set _resolved_ to the value of _name_.
>    1. Otherwise,
>       1. If _name_ is not a valid file URL then,
>          1. Throw an _Invalid Module Name_ error.
>       1. Set _resolved_ to the absolute file system path of the file URL _name_.
>    1. Return _FINALIZE_RESOLVE(resolved, esmResolve)_.
> 1. Let _config_ be the return value of _GET_JSPM_CONFIG(parentPath)_.
> 1. If _config_ is not _undefined_ then,
>    1. Let _jspmConfig_, _jspmPackagesPath_, _projectPath_ be the destructured values of _config_.
> 1. If _name_ contains any _"\"_ character then,
>    1. Throw an _Invalid Module Name_ error.
> 1. Let _parentPackageMap_, _parentPackagePath_ be the _map_ and _path_ keys of the result of _GET_PACKAGE_CONFIG(parentPath)_ respectively.
> 1. If _parentPackageMap_ is not _undefined_ then,
>    1. Let _mapped_ be the value of _APPLY_MAP(name, parentPackageMap)_
>    1. If _mapped_ is not _undefined_ then,
>       1. If _mapped_ starts with _"./"_ then,
>          1. Let _resolved_ be _undefined_.
>          1. If _jspmConfig_ is not _undefined_ and _parentPackagePath_ is equal to _projectPath_ then,
>             1. Set _resolved_ to the path resolution of _mapped_ relative to base _projectPath_.
>          1. Otherwise,
>             1. Set _resolved_ to the path resolution of _mapped_ relative to base _parentPackagePath_.
>          1. Return _FINALIZE_RESOLVE(resolved, esmResolve)_.
>       1. Otherwise, set _name_ to _mapped_.
>       1. If _IS_PLAIN(name)_ is _false_ then,
>          1. Throw an _Invalid Configuration_ error.
>       1. If _name_ contins any _"\"_ character then,
>          1. Throw an _Invalid Configuration_ error.
> 1. If _jspmConfig_ is not _undefined_ then,
>    1. Let _packagePath_ be _undefined_.
>    1. Let _parentPackage_ be the result of _PARSE_PACKAGE_PATH(parentPath, jspmPackagesPath)_.
>    1. If _parentPackage_ is not _undefined_ then,
>       1. Let _parentPackageResolveMap_ be set to _jspmConfig.dependencies[parentPackage.name]?.resolve_.
>       1. If _parentPackageResolveMap_ is not _undefined_ then,
>          1. Let _mapped_ be the value of _APPLY_MAP(name, parentPackageResolveMap)_
>          1. If _mapped_ is not _undefined_ then,
>             1. If _mapped_ is not a valid exact package name,
>                1. Throw an _Invalid Configuration_ error.
>             1. Set _packagePath_ to _mapped_.
>    1. If _packagePath_ is _undefined_ and _jspmConfig?.resolve_ is not _undefined_ then,
>       1. Let _mapped_ be the value of _APPLY_MAP(name, jspmConfig.resolve)_.
>       1. If _mapped_ is not _undefined_ then,
>          1. If _mapped_ is not a valid exact package name,
>             1. Throw an _Invalid Configuration_ error.
>          1. Set _packagePath_ to _mapped_.
>    1. If _packagePath_ is not _undefined_ then,
>       1. Let _resolvedPackage_ be the result of _PARSE_PACKAGE_CANONICAL(name)_.
>       1. Assert _resolvedPackage_ is not _undefined_ due to previous checks.
>       1. Let _resolved_ be the result of _PACKAGE_TO_PATH(resolvedPackage.name, resolvedPackage.path, jspmPackagesPath)_.
>       1. Let _packagePath_,_packageMain_, _packageMap_ and _packageMode_ be the destructured keys of _path_, _main_, _map_ and _mode_ respectively of the result of _GET_PACKAGE_CONFIG(resolved + "/")_.
>       1. Let _esm_ be _esmResolve_.
>       1. If _packageConfig.mode_ is not _undefined_ then,
>          1. Assert _packageConfig.mode_ is either _"esm"_ or _"cjs"_.
>          1. If _packageConfig.mode_ is equal to _"esm"_ then,
>             1. Set _esm_ to _true_.
>          1. Otherwise,
>             1. Set _esm_ to _false_
>       1. If _esm_ is _false_ then,
>          1. Return _LEGACY_PACKAGE_RESOLVE(resolved, packagePath, packageMain, packageMap)_.
>       1. If _packagePath_ is not _undefined_ then,
>          1. If _resolved_ is equal to _packagePath_ then,
>             1. If _main_ is _undefined_ then,
>                1. Throw a _Module Not Found_ error.
>             1. Set _resolved_ to _"${packagePath}/${main}"_.
>          1. If _packageMap_ is not _undefined_ and _resolved_ is contained in _packagePath_ then,
>             1. Let _relPath_ be the string _"."_ concatenated with the substring of _resolved_ of length _packagePath_.
>             1. Let _mapped_ be the value of  _APPLY_MAP(relPath, packageMap)_.
>             1. If _mapped_ is not _undefined_ then,
>                1. If _mapped_ is equal to _"@empty"_ then,
>                   1. Return _{ resolved: "@empty", format: "builtin" }_.
>                1. Set _resolved_ to the path resolution of _mapped_ relative to base _packagePath_.
>       1. Return _FINALIZE_RESOLVE(resolved, esmResolve)_.
> 1. Return the result of _NODE_MODULES_RESOLVE(name, parentPath)_.

> **FINALIZE_RESOLVE(resolved: String, esmDefault: Boolean)**
> 1. If _resolved_ is a NodeJS builtin or is equal to `@empty` or `@notfound` then,
>    1. Return _{ resolved, format: "builtin" }_.
> 1. Let _packageConfig_ be _GET_PACKAGE_CONFIG(modulePath)_.
> 1. Let _esm_ be _esmDefault_.
> 1. If _packageConfig.mode_ is not _undefined_ then,
>    1. Assert _packageConfig.mode_ is either _"esm"_ or _"cjs"_.
>    1. If _packageConfig.mode_ is equal to _"esm"_ then,
>       1. Set _esm_ to _true_.
>    1. Otherwise,
>       1. Set _esm_ to _false_.
> 1. If _esm_ is _true_ then,
>    1. If _resolved_ does not end with _".js"_ or _".mjs"_ then,
>       1. Return _{ resolved, format: "unknown" }_.
>    1. Return _{ resolved, format: "esm" }_.
> 1. Otherwise,
>    1. Return _LEGACY_FINALIZE_RESOLVE(LEGACY_FILE_RESOLVE(resolved))_.

> **NODE_MODULES_RESOLVE(name: String, parentPath: String): String**
> 1. If _name_ is a NodeJS core module then, _"@empty"_ or _"@notfound"_ then,
>    1.  Return the object _{ resolved, format: "builtin" }_.
> 1. For each parent folder _modulesPath_ of _parentPath_ in descending order of length,
>    1. Let _resolved_ be set to _"${modulesPath}/node_modules/${name}"_.
>    1. Let _packagePath_, _packageMain_ and _packageMap_ be the destructured keys of _path_, _main_ and _map_ respectively of the result of _GET_PACKAGE_CONFIG(resolved + "/")_.
>    1. If _packagePath_ is not _undefined_ then,
>       1. Return _LEGACY_PACKAGE_RESOLVE(resolved, packagePath, packageMain, packageMap)_.
>    1. Return the result of _LEGACY_FINALIZE_RESOLVE(LEGACY_FILE_RESOLVE(resolved))_, continuing the loop for a _Module Not Found_ error, and propagating the error otherwise.
> 1. Throw a _Module Not Found_ error.

> **LEGACY_PACKAGE_RESOLVE(resolved: String, packagePath: String, packageMain: String, packageMap: Object)**
> 1. If _resolved_ is equal to _packagePath_ then,
>    1. If _packageMain_ is not _undefined_ and 
>       1. Set _resolved_ to _LEGACY_FILE_RESOLVE("${packagePath}/${main}")_.
>    1. Otherwise,
>       1. Set _resolved_ to _LEGACY_DIR_RESOLVE(packagePath)_.
> 1. If _packageMap_ is not _undefined_ and _resolved_ is contained in _packagePath_ then,
>    1. Let _relPath_ be the string _"."_ concatenated with the substring of _resolved_ of length _packagePath_.
>    1. Let _mapped_ be the value of  _APPLY_MAP(relPath, packageMap)_.
>    1. If _mapped_ is not _undefined_ then,
>       1. If _mapped_ is equal to _"@empty"_ then,
>          1. Return _{ resolved: "@empty", format: "builtin" }_.
>       1. Set _resolved_ to the path resolution of _mapped_ relative to base _packagePath_.
> 1. Return the result of _LEGACY_FINALIZE_RESOLVE(LEGACY_FILE_RESOLVE(resolved))_.

> **LEGACY_DIR_RESOLVE(dir: String)**
> 1. If the file at _"${path}/index.mjs"_ exists,
>    1. Return _${path}/index.mjs"_.
> 1. Otherwise if the file at _"${path}/index.js"_ exists,
>    1. Return _"${path}/index.js"_.
> 1. Otherwise if the file at _"${path}/index.json"_ exists,
>    1. Return _"${path}/index.json"_.
> 1. Otherwise if the file at _"${path}/index.node"_ exists,
>    1. Return _"${path}/index.node"_.
> 1. Throw a _Module Not Found_ error.

> **LEGACY_FILE_RESOLVE(path: String)**
> 1. Assert _path_ is a valid file path.
> 1. Let _resolved_ be equal to _undefined_.
> 1. If _path_ ends with the character _"/"_ then,
>    1. If the directory at _path_ does not exist then,
>       1. Throw a _Module Not Found_ error.
>    1. Set _resolved_ to _path_.
> 1. Otherwise if the file at _path_ exists,
>    1. Set _resolved_ to _path_.
> 1. Otherwise if the file at _${path}.mjs"_ exists,
>    1. Set _resolved_ to _${path}.mjs"_.
> 1. Otherwise if the file at _"${path}.js"_ exists,
>    1. Set _resolved_ to _"${path}.js"_.
> 1. Otherwise if the file at _"${path}.json"_ exists,
>    1. Set _resolved_ to _"${path}.json"_.
> 1. Otherwise if the file at _"${path}.node"_ exists,
>    1. Set _resolved_ to _"${path}.node"_.
> 1. Otherwise,
>    1. Set _resolved_ to _LEGACY_DIR_RESOLVE(path)_.
> 1. Return _resolved_.

> **LEGACY_FINALIZE_RESOLVE(resolved: String)**
> 1. Let _format_ be equal to _"unknown"_.
> 1. If _resolved_ ends with _".mjs"_ then,
>    1. Set _format_ to _"esm"_.
> 1. Otherwise if _resolved_ ends with _".js"_ then,
>    1. Set _format_ to _"cjs"_.
> 1. Otherwise if _resolved_ ends with _".json"_ then,
>    1. Set _format_ to _"json"_.
> 1. Otherwise if _resolved_ ends with _".node"_ then,
>    1. Set _format_ to _"addon"_.
> 1. Set _resolved_ to the real path of _resolved_.
> 1. Return the object with properties _{ resolved, format }_.
