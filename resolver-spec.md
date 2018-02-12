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

`"mode": "esm"` can be set to indicate packages which should load `".js"` extension files
as ES modules.

No support is provided for the package.json "module" property as these workflows are untested against these interop patterns so may not work anyway.

In addition, a module which ends in `.mjs`, is always loaded as an ES module.

CommonJS modules are resolved using the same jspm resolver here, except for when loading CommonJS from node_modules, when the NodeJS resolver is used.

The return value of the resolver itself is both resolved path and the module format string of the form `"esm"`, `"cjs"`,  `"json"`, `"addon"` for Node addons and `"builtin"` for Node builtins.

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
* `directories.packages`: Configures the location of jspm packages folder. Defaults to `"jspm_packages"`.
* `configFiles.jspm`: The path to the `jspm.json` file. Defaults to `"jspm.json"`.

#### Map Configuration

In addition to project configuration, the `package.json` file is used to configure mappings both for installed dependencies and for the local project, based on supporting the following `mains` and `map` property structure:

`package.json`:
```js
{
  "mains": ConditionalMap,
  "map": {
    [name: RelOrPlain]: RelOrPlain | ConditionalMap
  }
}
```

where:

* `RelOrPlain` is as above, a `/`-separated name that either starts with `./` or is a plain name.
* `ConditionalMap` is an object mapping condition value strings to map values (`{ [ConditionName: string]: RelOrPlain | ConditionalMap }`). Condition names can take values `"browser" | "node" | "dev" | "production" | "module" | "react-native" | "electron" | "default"`, with the first matching condition map recursively taken to be the resultant map. `"default"` is always set to true, `"module"` is true when the parent module is an ES module only, and the others are resolver environment specific.

Module is deemed to be `true` only when resolving a dependency from an ES module.

The resolve object is a map configuration that replaces the best matched starting prefix of the name.

In addition the following constraint is placed:

> Package-relative resolutions (starting with `./`) can only resolve to other package-relative resolutions. This is to ensure a well-defined staged resolution process without circularity edge cases. The assumption here is that `"./x": "y"` is treated as
`"./x": "./y"`, while `"x": "y"` truly is an external mapping, just like the existing `browser` field spec.

If using the `"react-native"`, `"electron"`, `"browser"` or `"main"` package.json properties, these will be internally desugared into map
in this listed order of precedence.

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
  "mains": {
    "browser": "./y",
    "default": "./x"
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
  "mains": {
    "bin": "./bin.js",
    "browser": "./y",
    "default": "./x"
  }
}
```

The `"./"` map can be used to map the entire root.

Relative browser maps that map a non-JS or JSON extension are taken to map a JS extension:

```json
{
  "browser": {
    "./x": "./z",
    "./y.js": "./z"
  }
}
```

is interpreted as:

```json
{
  "map": {
    "./x.js": {
      "browser": "./z"
    },
    "./y.js": {
      "browser": "./z"
    }
  }
}
```

#### JS Extension Module Format Configuration

The package.json file is also used to specify which packages treat `.js` extensions as CommonJS modules as opposed
to ES modules. This is set via the `esm` boolean package.json property:

```json
{
  "mode": String
}
```

By default, this property is assumed to be `"cjs"` so we have a backwards-compatible default value.

Setting `"mode": "esm"` allows `.js` extensions in the package to be loaded as ES modules.

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

A jspm project boundary is detected by the package.json configuration and jspm.json configuration match. The boundary detection also takes into account nested projects where the inner project is an exact package name of the outer project. This is in order to support the inner package being linked as a package of the outer one.

Given a file path, we can determine the base project folder, jspm packages path and jspm configuration with the following algorithm:

> **GET_JSPM_CONFIG(modulePath: String)**
> 1. Let _innerConfig_ be _undefined_.
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
>       1. Set _jspmPackagesPath_ to its realpath applied to all segments except for the last.
>       1. Let _localPackagePath_ be set to _path_.
>       1. If _pjson.directories?.lib is a relative path without backtracking,
>          1. Set _localPackagePath_ to the path resolution of _pjson.directories.lib_ to _path_.
>       1. If _pjson.directories?.dist is a relative path without backtracking,
>          1. If the environment conditional _production_ is _true_,
>             1. Set _localPackagePath_ to the path resolution of _pjson.directories.dist_ to _path_.
>       1. If _localPackagePath_ has a trailing path separator, then remove it.
>       1. If _localPackagePath_ is equal to or a subpath of _jspmPackagesPath_ then,
>          1. Set _localPackagePath_ to _path_.
>       1. Set _localPackagePath_ to its realpath.
>       1. Let _projectBasePath_ be set to the realpath of _path_.
>       1. If _innerConfig_ is not _undefined_ then,
>          1. If _innerConfig.projectBasePath_ is not exact package name path conatined in _jspmPackagesPath_ then,
>             1. Return the value of _innerConfig_.
>          1. Return the object with values _{ projectBasePath, jspmConfig, jspmPackagesPath, localPackagePath }_.
>       1. Set _innerConfig_ to the object with values _{ projectBasePath, jspmConfig, jspmPackagesPath, localPackagePath }_.
> 1. Return the value of _innerConfig_.

The return value of the above method is either `undefined` or an object of the form `{ jspmConfig, jspmPackagesPath, localPackagePath }`.

This algorithm only needs to be applied once per given path, and can cache all file system checks.

### Reading Package Configuration

For resolving map configurations within packages, the resolver reads the `package.json` file for each package loaded. This is done with the following algorithm:

> **GET_PACKAGE_CONFIG(packagePath: String)**
> 1. For each parent path _path_ of _packagePath_ including _packagePath_ in descending order,
>    1. If _path_ ends in a _"node_modules"_ segment then,
>       1. Break the loop.
>    1. If the file at _"${path}/package.json"_ does not exist then,
>       1. Continue the next loop iteration.
>    1. Let _pjson_ be set to the cached output of the JSON parser applied to the contents of _"${path}/package.json"_, throwing a _Configuration Error_ on invalid JSON.
>    1. Let _mains_ be equal to the value of _pjson.mains_ if an object or _undefined_ otherwise.
>    1. Let _map_ be set to the value of _pjson.map_ if an object or _undefined_ otherwise.
>    1. Let _esm_ be set _true_ if _pjson.mode is equal to _"esm"_ or _false_ otherwise.
>    1. If _pjson.react-native_ is a _string_ then,
>       1. Set _mains_ to an object if _undefined_.
>       1. If _mains.react-native_ is _undefined_ then,
>          1. Set _mains.react-native_ to _pjson.react-native_.
>    1. If _pjson.electron_ is a _string_ then,
>       1. Set _mains_ to an object if _undefined_.
>       1. If _mains.electron_ is _undefined_ then,
>          1. Set _mains.electron_ to _pjson.electron_.
>    1. If _pjson.browser_ is a _string_ then,
>       1. Set _mains_ to an object if _undefined_.
>       1. If _mains.browser_ is _undefined_ then,
>          1. Set _mains.browser_ to _pjson.browser_.
>    1. If _pjson.browser_ is an _object_ then,
>       1. Set _map_ to an object if _undefined_.
>       1. For each key _name_ in _pjson.browser_,
>          1. If _map[name]_ is _undefined_ then,
>             1. Let _mapping_ be the value of _pjson.browser[name]_.
>             1. If _mapping_ is equal to _false_ then,
>                1. Set _mapping_ to _"@empty"_.
>             1. Set _map[name]_ to _mapping_.
>    1. If the property _pjson.main_ exists and is a string then,
>       1. Set _mains_ to an object if _undefined_.
>       1. If _mains.default_ is _undefined_ then,
>          1. Set _mains.default_ to _pjson.main_
>    1. Return the object with properties _{ path, mains, map, esm }_.
> 1. Return the object with undefined properties _{ path, mains, map, esm: false }_.

The responses of this method can be cached for the resolver lifecycle, with package.json caching shared with _GET_JSPM_CONFIG_ as well.

### Matching and Applying Map Resolution

jspm configurations use resolve maps to match a plain name and direct it to a new module name.
Matching a map is based on finding the longest map target that matches the start of the plain name.

Map configurations in the jspm configurations also support conditional objects which represent map branches based
on environment conditionals.

Match boundaries are taken to be the `/` separator or the end of the name. In this way the map `{ 'x/y': 'z' }` can match both `x/y` and `x/y/path`.

Maps can also enforce a trailing separator to match directories separately to exact paths, for example with `{ 'x': './y/main.js', 'x/': './y/' }`.

The root directory map of `{ './': './root/' }` is permitted, while a single `.` match is not supported as this is handled via main configuration.

Applying the map is then the process of adding back the subpath after the match (`x/y/path` mapping into `z/path` for the `{ 'x/y': 'z' }` map), including support for condition branches:

> **APPLY_MAP(name: String, resolveMap: Object)**
> 1. Let _parentNames_ be the set of parent paths of _name_ (_"/"_ separated), including _name_ itself, in descending order of length alternating between including the trailing _"/"_ and not (each item without the either the last separator or segment from the previous).
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
> 1. Return _mapped_ concatenated with the substring of _name_ from the index at the length of _match_ to the end of the string.

> **APPLY_MAIN(mainMap: Object)**
> 1. Let _mapped_ be  the result of _MAP_CONDITIONS(mainMap)_
> 1. If _mapped_ is equal to _"@empty"_ then return _"@empty"_.
> 1. If _mapped_ does not start with _"./"_,
>    1. Set _mapped_ to _"./${mapped}"_.
> 1. If _mapped_ contains any _".."_ or _"."_ segments, any _"\"_ character, any _"%2F" or _"%5C"_ substring, or parses as a URL,
>    1. Throw an _Invalid Configuration_ error.
> 1. Return mapped.

> **MAP_CONDITIONS(mapped: String | Object)**
> 1. While _mapped_ is an _Object_,
>    1. For each property _condition_ of _mapped_,
>       1. If _condition_ is the name of an environment conditional that is _true_.
>          1. Set _mapped_ to the value of _mapped[condition]_.
>          1. Continue the next outer loop iteration.
>    1. Return _undefined_.
> 1. If _mapped_ is not a _string_, throw an _Invalid Configuration_ error.
> 1. Return _mapped_.

### Extension and Directory Index Handling

Like the NodeJS module resolution, jspm 2.0 supports automatic extension and directory index handling.

There is one exception added to this which is that if a path ends in a separator character it is allowed not to resolve at all,
in order to support directory resolution utility functions.

In addition, jspm does not implement the real path lookup for modules loaded. This allows globally and locally linked packages to be scoped to the project they are loaded in, so the entire resolution for the project is managed through a single jspm configuration file despite many packages possibly being linked in.

The full algorithm applied with this directory addition is:

> **FILE_RESOLVE(path: String, cjsResolve: Boolean, realpath: Boolean)**
> 1. Assert _path_ is a valid file path.
> 1. Let _resolved_ be equal to _undefined_.
> 1. If _path_ ends with the character _"/"_ then,
>    1. If the directory at _path_ does not exist then,
>       1. Throw a _Module Not Found_ error.
>    1. Set _resolved_ to _path_.
> 1. Otherwise if the file at _path_ exists,
>    1. Set _resolved_ to _path_.
>    1. If _resolved_ ends with _".mjs"_ and _cjsResolve_ is _true_ then,
>       1. Throw an _Invalid Module Name_ error.
> 1. Otherwise if _cjsResolve_ is _false_ and the file at _${path}.mjs"_ exists,
>    1. Set _resolved_ to _${path}.mjs"_.
> 1. Otherwise if the file at _"${path}.js"_ exists,
>    1. Set _resolved_ to _"${path}.js"_.
> 1. Otherwise if the file at _"${path}.json"_ exists,
>    1. Set _resolved_ to _"${path}.json"_.
> 1. Otherwise if the file at _"${path}.node"_ exists,
>    1. Set _resolved_ to _"${path}.node"_.
> 1. Otherwise if _cjsResolve_ is _false_ and the file at _"${path}/index.mjs"_ exists,
>    1. Set _resolved_ to _${path}/index.mjs"_.
> 1. Otherwise if the file at _"${path}/index.js"_ exists,
>    1. Set _resolved_ to _"${path}/index.js"_.
> 1. Otherwise if the file at _"${path}/index.json"_ exists,
>    1. Set _resolved_ to _"${path}/index.json"_.
> 1. Otherwise if the file at _"${path}/index.node"_ exists,
>    1. Set _resolved_ to _"${path}/index.node"_.
> 1. Otherwise,
>    1. Throw a _Module Not Found_ error.
> 1. Let _esmPackage_ be the _esm_ key of the result of _GET_PACKAGE_CONFIG(resolved)_.
> 1. Let _format_ be equal to _undefined_.
> 1. If _resolved_ ends with _".mjs"_ then,
>    1. Set _format_ to _"esm"_.
> 1. Otherwise if _resolved_ ends with _".js"_ then,
>    1. If _cjsResolve_ is _true_ or _esmPackage_ is not _true_ then,
>       1. Set _format_ to _"cjs"_.
>    1. Otherwise,
>       1. Set _format_ to _"esm"_.
> 1. Otherwise if _resolved_ ends with _".json"_ then,
>    1. Set _format_ to _"json"_.
> 1. Otherwise if _resolved_ ends with _".node"_ then,
>    1. Set _format_ to _"addon"_.
> 1. Otherwise if _cjsResolve_ is _false_ and _resolved_ does not end with _"/"_ then,
>    1. Throw an _Invalid Module Name_ error.
> 1. If _realpath_ is _true_ then,
>    1. Set _resolved_ to the real path of _resolved_.
> 1. Return the object with properties _{ resolved, format }_.

As with the other algorithms, all fs operations can be cached and shared for the lifetime of the resolver instance.

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

`@empty` is a special name in maps, which will return `{ resolved: undefined, format: undefined }` from the resolver (in addition this is the only way `undefined` can be returned by the resolver). All other core module name matching needs to be handled outside of this resolver.

The resolver will either return undefined or a resolved path string, or throw a _Module Not Found_, _Invalid Module Name_ or _Invalid Configuration_ error.

Package name requests and plain name requests are both considered unescaped - that is URL decoding will not be applied. URL decoding is only applied to URL-like requests.

The parent pathname is assumed a valid fully-resolved path in the environment. Any `\\` in Windows paths are converted into `/` for consistency within this resolver. Absolute paths, URLs, URL-encoding, and relative segments are not supported in the parent path.

The resolver has two modes - ES module resolution for loading ES modules, top-level modules and dynamic `import` resolution,
and legacy CommonJS resolution for running a CommonJS `require` resolution. This mode is tracked by a `cjsResolve` argument.

If two jspm projects are nested, the inner one will be used for resolution, unless the `basePath` of the inner one is exactly a valid package name of the outer project, in which case the outer project is used for resolution. This is to ensure that linking use cases work out correctly.

The resolution algorithm breaks down into the following high-level process to get the fully resolved path:

> **JSPM_RESOLVE(name: String, parentPath: String, cjsResolve: Boolean)**
> 1. Assert _parentPath_ is a valid absolute file system path.
> 1. If _name_ contains the substring _"%2F"_ or _"%5C"_ then,
>    1. Throw an _Invalid Module Name_ error.
> 1. Let _config_ be the return value of _GET_JSPM_CONFIG(parentPath)_.
> 1. If _config_ is not _undefined_ then,
>    1. Let _jspmConfig_, _jspmPackagesPath_, _localPackagePath_, _projectBasePath_ be the destructured values of _config_.
> 1. If _IS_PLAIN(name)_ then,
>    1. If _name_ contains any _"\"_ character then,
>       1. Throw an _Invalid Module Name_ error.
>    1. Let _parentPackageMap_, _parentPackagePath_ be the _map_ and _path_ keys of the result of _GET_PACKAGE_CONFIG(parentPath)_ respectively.
>    1. If _parentPackageMap_ is not _undefined_ then,
>       1. Let _mapped_ be the value of _APPLY_MAP(name, parentPackageMap)_
>       1. If _mapped_ is not _undefined_ then,
>          1. If _mapped_ starts with _"./"_ then,
>             1. Let _resolved_ be _undefined_.
>             1. If _jspmConfig_ is not _undefined_ and _parentPackagePath_ is equal to _projectBasePath_ then,
>                1. Set _resolved_ to the path resolution of _mapped_ relative to base _localPackagePath_.
>             1. Otherwise,
>                1. Set _resolved_ to the path resolution of _mapped_ relative to base _parentPackagePath_.
>             1. Return _FILE_RESOLVE(resolved, cjsResolve, false)_.
>          1. Otherwise, set _name_ to _mapped_.
>          1. If _IS_PLAIN(name)_ is _false_ then,
>             1. Throw an _Invalid Configuration_ error.
>    1. If _jspmConfig_ is not _undefined_ then,
>       1. Let _parentPackage_ be the result of _PARSE_PACKAGE_PATH(parentPath, jspmPackagesPath)_.
>       1. If _parentPackage_ is not _undefined_ then,
>          1. Let _parentPackageResolveMap_ be set to _jspmConfig.dependencies[parentPackage.name]?.resolve_.
>          1. If _parentPackageResolveMap_ is not _undefined_ then,
>             1. Let _mapped_ be the value of _APPLY_MAP(name, parentPackageResolveMap)_
>             1. If _mapped_ is not _undefined_ then,
>                1. If _mapped_ is not a valid exact package name,
>                   1. Throw an _Invalid Configuration_ error.
>                1. Set _name_ to _mapped_.
>       1. If _IS_PLAIN(name)_ then,
>          1. If _jspmConfig?.resolve_ is not _undefined_ then,
>             1. Let _mapped_ be the value of _APPLY_MAP(name, jspmConfig.resolve)_.
>             1. If _mapped_ is not _undefined_ then,
>                1. If _mapped_ is not a valid exact package name,
>                   1. Throw an _Invalid Configuration_ error.
>                1. Set _name_ to _mapped_.
>    1. If _IS_PLAIN(name)_ then,
>       1. If _name_ is equal to the string _"@empty"_ then,
>          1. Return _{ resolved: undefined, format: undefined }_.
>       1. Return the result of _NODE_MODULES_RESOLVE(name, parentPath, cjsResolve)_.
> 1. Let _resolved_ be equal to _undefined_.
> 1. Let _resolvedPackage_ be the result of _PARSE_PACKAGE_CANONICAL(name)_.
> 1. If _resolvedPackage_ is not _undefined_ then,
>    1. If _name_ contins any _"\"_ character then,
>       1. Throw an _Invalid Configuration_ error.
>    1. If _jspmConfig_ is _undefined_ then,
>       1. Throw an _Invalid Module Name_ error.
>    1. Set _resolved_ to the result of _PACKAGE_TO_PATH(resolvedPackage.name, resolvedPackage.path, jspmPackagesPath)_.
> 1. Otherwise,
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
> 1. Let _realpath_ be set to _false_.
> 1. Set _config_ to the return value of _GET_JSPM_CONFIG(resolved)_.
> 1. If _config_ is not _undefined_ then,
>    1. Set _jspmConfig_, _jspmPackagesPath_, _localPackagePath_, _projectBasePath_ to the destructured values of _config_.
> 1. Otherwise if _resolved_ contains a _"node_modules"_ path segment then,
>    1. Set _realpath_ to _true_.
> 1. If _resolved_ ends with _"/"_ then,
>    1. Return the result of _FILE_RESOLVE(resolved, cjsResolve, realpath)_.
> 1. Let _resolvedPackagePath_, _resolvedPackageMains_ and _resolvedPackageMap_ be the destructured keys of _path_, _mains_ and _map_ respectively of the result of _GET_PACKAGE_CONFIG(resolved)_.
> 1. If _resolvedPackagePath_ is not _undefined_ then,
>    1. If _jspmConfig_ is not _undefined_ and _resolvedPackagePath_ is equal to _projectBasePath_ then,
>       1. If _resolved_ is equal to or contained in _jspmPackagesPath_ then,
>          1. Return the result of _FILE_RESOLVE_(resolved, cjsResolve, realpath)_.
>       1. Set _resolvedPackagePath_ to _localProjectPath_.
>    1. If _resolvedPackageMains_ is not _undefined_ and _resolved_ is equal to _resolvedPackagePath_ then,
>       1. Let _mapped_ be the value of _APPLY_MAIN(resolvedPackageMains)_.
>       1. If _mapped_ is not _undefined_ then,
>          1. If _mapped_ is equal to _"@empty"_ then,
>             1. Return _{ resolved: undefined, format: undefined }_.
>          1. Set _resolved_ to the path resolution of _mapped_ to base _resolvedPackagePath_.
>    1. Otherwise if _resolvedPackageMap_ is not _undefined_ and _resolved_ is contained in _resolvedPackagePath_ then,
>       1. Let _relPath_ be the string _"./"_ concatenated with the substring of _resolved_ of length _resolvedPackagePath_.
>       1. Let _mapped_ be the value of  _APPLY_MAP(relPath, resolvedPackageMap)_.
>       1. If _mapped_ is not _undefined_ then,
>          1. If _mapped_ is equal to _"@empty"_ then,
>             1. Return _{ resolved: undefined, format: undefined }_.
>          1. Set _resolved_ to the path resolution of _mapped_ relative to base _resolvedPackagePath_.
> 1. Return the result of _FILE_RESOLVE(resolved, cjsResolve, realpath)_.

If NodeJS were to support any of these package.json resolution features in future, then the node resolve function can be more closely integrated with the above resolve algorithm.

> **NODE_MODULES_RESOLVE(name: String, parentPath: String, cjsResolve: Boolean): String**
> 1. If _name_ is a NodeJS core module then,
>    1.  Return the object _{ resolved, format: "builtin" }_.
> 1. For each parent folder _modulesPath_ of _parentPath_ in descending order of length,
>    1. Let _resolved_ be set to _"${modulesPath}/node_modules/${name}"_.
>    1. Let _packagePath_,_packageMains_ and _packageMap_ be the destructured keys of _path_, _mains_ and _map_ respectively of the result of _GET_PACKAGE_CONFIG(resolved + _"/"_)_.
>    1. If _packagePath_ is not _undefined_ then,
>       1. If _packageMains_ is not _undefined_ and _resolved_ is equal to _packagePath_ then,
>          1. Let _mapped_ be the value of _APPLY_MAIN(packageMains)_.
>          1. If _mapped_ is not _undefined_ then,
>             1. If _mapped_ is equal to _"@empty"_ then,
>                1. Return _{ resolved: undefined, format: undefined }_.
>             1. Set _resolved_ to the path resolution of _mapped_ to base _packagePath_.
>       1. Otherwise if _packageMap_ is not _undefined_ and _resolved_ is contained in _packagePath_ then,
>          1. Let _relPath_ be the string _"."_ concatenated with the substring of _resolved_ of length _packagePath_.
>          1. Let _mapped_ be the value of  _APPLY_MAP(relPath, packageMap)_.
>          1. If _mapped_ is not _undefined_ then,
>             1. If _mapped_ is equal to _"@empty"_ then,
>                1. Return _{ resolved: undefined, format: undefined }_.
>             1. Set _resolved_ to the path resolution of _mapped_ relative to base _packagePath_.
>    1. Return the result of _FILE_RESOLVE(resolved, cjsResolve, true)_, continuing the loop for a _Module Not Found_ error, and propagating the otherwise.
> 1. Throw a _Module Not Found_ error.
