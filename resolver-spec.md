# JSPM Resolver Specification

This page is the primary specification of the jspm 2.0 NodeJS-compatible resolver.

jspm 2.0 separates the browser and NodeJS resolvers into two separate resolvers. The reason for this is that one of the greatest points of difficulty in the project before this version was the lack of support with the NodeJS module resolution system, so the goal of trying to support a unified universal browser and NodeJS resolver has been abandoned.

The jspm resolver specified here is now fully compatible with the NodeJS resolution algorithm,
while the SystemJS browser resolver which allows custom browser resolution configuration is specified at the SystemJS project
page at https://github.com/systemjs/systemjs/blob/0.20.14/docs/production-build.md#resolution-algorithm.

## jspm Resolver Principles

All module names in jspm are treated as URLs. To represent file system paths we use `file:///` URLs (https://blogs.msdn.microsoft.com/ie/2006/12/06/file-uris-in-windows/).

### Plain Names

`plain names` or `bare names` as they are referred to in the WhatWG loader specification are module names
that do not start with `/` or `./` or `../` and do not parse as valid URLs.

Plain names are the module names that run through multiple remapping phases, although absolute URL names can be remapped as well
through contextual relative map configuration.

### Distinguishing between jspm Modules and Node Modules

The jspm resolver relies on the ability to know whether a given module path should be treated as a jspm module or a NodeJS module in order
to provide full compatibility.

This detection is based on detecting a `jspm.json` jspm configuration as indicating a jspm package boundary, and a `node_modules` folder as indicating a NodeJS package boundary. The jspm package boundary then extends from the `jspm.json` configuration file folder through all subfolders, stopping at any `node_modules` subfolders. When a nested jspm configuration is found, the nested configuration take precedence over the lower-level configuration, only if the nested jspm boundary `package.json` file folder path does not exactly correspond to a package path of the parent project. Modules without any `jspm.json` in all their parent folder paths are treated as NodeJS modules.

### jspm Config File

The `jspm.json` jspm configuration file stores dependency and resolution information associated with the a jspm project.

The full jspm configuration file will have its own specification page in future. For the resolver, the following
properties are the only ones which affect the jspm resolution for a module:

`jspm.json`:
```js
{
  // Top-level resolutions
  "resolve": {
    [name: Relative | Plain]: Relative | Plain | PackageName | Conditional
  },
  // Installed dependency (contextual) configurations
  "dependencies": {
    [exactName: ExactPackageName]: {
      // Contextual dependency resolutions
      "resolve": {
        [name: Relative | Plain]: Relative | Plain | PackageName | Conditional
      }
    }
  }
}
```

In addition the following constraint is placed:

> Package-relative resolutions (starting with `./`) can only resolve to other package-relative resolutions.

This is in order to avoid recursive mapping cases and ensure a well-defined single-pass resolver.

The above type definitions are:

* `Relative`: A string `s`, `/`-separated (if any), starting with `./` or equal to `.`.
* `Plain`: A string `s` satisfying `isPlainName(s)`.
* `PackageName`: A string `s` satisfying `isPackageName(s)`.
* `Conditional`: An object of type `{ [ConditionName]: Relative | Plain | PackageName }`, where `ConditionName` is a string with value `"browser" | "node" | "dev" | "production" | "default"` corresponding to the environment setting. The `"default"` environment conditional is always `true`, and additional environment conditionals may be suported in future.

When these configuration type assertions are broken, the configuration is considered invalid, and the entire resolution will
abort on the assertion error.

The resolve object is a map configuration that replaces the best matched starting prefix of the name.

Condition maps are object maps setting resolutions based on environment conditionals. These conditions are checked in property order on the object with the first matching environment conditional corresponding to the replacement resolution string. For example, a package.json browser property:

```js
{
  "browser": {
    "./x": "./y"
  }
}
```

can be represented by a conditional resolve as:

```js
resolve: {
  "./x": {
    "browser": "./y"
  }
}
```

these resolve values themselves are originally set from reading the dependency package.json files as packages are installed.

### Package.json Configuration

The following package.json properties affect the resolution process (this is not a comprehensive spec of the jspm package.json properties):

`package.json`:
```js
{
  "directories": {
    "lib": RelOrPlain,
    "dist": RelOrPlain
  },
  "configFiles": {
    "jspm": RelOrPlain
  }
}
```

* `directories.lib`: Configures the default `parentUrl` (`baseUrl`) path under the `dev` environment conditional. Defaults to `"."`.
* `directories.dist`: Configures the default `parentUrl` (`baseUrl`) path under the `production` environment conditional. Defaults to the value of `lib`.
* `configFiles.jspm`: The path to the `jspm.json` file. Defaults to `"jspm.json"`.

## Algorithms

All URL operations here are handled exactly as in the WhatWG URL specification, including the handling of encodings and errors.

Any error in any operation, including assertion errors, should be fully propagated as a top-level resolve error abrupt completion.

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
/^[a-z]+:[@\-_\.a-zA-Z\d][-_\.a-zA-Z\d]*(\/[-_\.a-zA-Z\d]+)*@[^\/\\]+$/
```

Any instances of `\` or `/` in versions can be supported, but require being URL encoded within the canonical form.
All other encodings, except for these two, should be unescaped when in this canonical form.

Note that each registry can have its own more restrictive requirements for sanitization of package names and versions,
through the registry `parse` implementation.

A package called `registry:package@version` in jspm is stored in `file:///path/to/jspm_packages/registry/package@version/`. When converting from a package name into a URL we apply URL encoding to the package version only.

To convert a package between these forms, the following methods are defined:

> **PARSE_PACKAGE_CANONICAL(canonical: String): { name: String, path: String }**
> 1. Let _name_ be the unique substring of _name_ starting from the first index, that satisfies the package name regular expression.
> 1. If _name_ is _undefined_ then,
>    1. Return _undefined_.
> 1. Let _path_ be the substring of _canonical_ starting from the index of the length of _name_.
> 1. If _path_ is not the empty string and does not start with _"/"_
>    1. Return _undefined_.
> 1. Return the object with values _{ name, path }_.

> **PARSE_PACKAGE_URL(url: String, jspmPackagesUrl: String): { name: String, path: String }**
> 1. Assert _jspmPackagesUrl_ is a valid URL.
> 1. Assert _jspmPackagesUrl_ ends with the string _"/jspm_packages/"_.
> 1. If _url_ does not start with the string _jspmPackagesUrl_ then,
>    1. Return _undefined_.
> 1. Let _relPackagePath_ be the substring of _url_ starting at the index of the length of _jspmPackagesUrl_.
> 1. Let _registrySep_ be the first index of _"/"_ in _relPackagePath_.
> 1. _If _registrySep_ is not defined then,
>    1. Return _undefined_.
> 1. Let _canonical_ be the result of replacing the character at _registrySep_ with _":"_.
> 1. If _canonical_ does not contain a zero-indexed substring matching the package name regular expression then,
>    1. Return _undefined_.
> 1. Let _registry_, _name_ and _version_ be the canonical components of the unique substring of _canonical_ starting from the first character, matched against the package name regular expression.
> 1. Let _path_ be the substring of _canonical_ from the first index after the package name regular expression match.
> 1. If _path_ is defined and _path_ does not start with _"/"_ then,
>    1. Return _undefined_.
> 1. Set _version_ to the result of _decodeURIComponent_ applied to _version_, with the exception of _"/"_ and _"\\"_ characters remaining as their encoded URI components _"%2F"_ and _"%5C"_ respectively.
> 1. If _version_ contains any instance of _"/"_ or _"\\"_, then replace these characters with their URL encodings.
> 1. Return the string _"${registry}:${name}@${version}$path"_

> **PACKAGE_TO_URL(name: String, jspmPackagesUrl: String): String**
> 1. Assert _jspmPackagesUrl_ is a valid URL.
> 1. Assert _jspmPackagesUrl_ ends with the string _"/jspm_packages/"_.
> 1. Let _packageName_ be the unique substring of _name_ starting from the first index that satisfies the package name regular expression.
> 1. Assert _packageName_ is defined.
> 1. Let _packagePath_ be the substring of _name_ starting from the index of the length of _packageName_.
> 1. Assert _packagePath_ is empty or it does not start with _"/"_.
> 1. Replace in _packageName_ the first _":"_ character with _"/"_.
> 1. Replace in _packageName_ the substring from the last index of _"@"_ in _packageName_ to the end of _packageName_ with the result of _encodeURIComponent_ method applied to that substring, with the exception of not encoding any instance of _"%"_ that is followed by either the characters _"2F"_ or _"5C"_.
> 1. Return the result of the URL resolution of _"${packageName}${packagePath}"_ to _jspmPackagesUrl_.

The parse functions return undefined if not a valid package canonical name form, while the package to URL function must
always be called against a valid package canonical name form.

These methods are designed to work on paths within the canonicals (`PACKAGE_TO_URL(npm:@scope/x@v/y.js)` -> `file:///path/to/jspm_packages/npm/@scope/x@v/y.js`).

Escaping of path segments other than the encoding of the package version is entirely delegated to the URL resolver.

### Reading Configuration

For a given module we need to know its jspm configuration from reading both the `jspm.json` and the `package.json` files.

This can be handled by a get configuration function along the following lines:

> **GET_JSPM_CONFIG(moduleUrl: String)**
> 1. Let _parentPaths_ be the array of parent paths of _moduleUrl_ ordered by length increasing, excluding a trailing separator.
> 1. Let _config_ be set to _undefined_.
> 1. For each _path_ of _parentPaths_,
>    1. If the last path segment of _path_ is equal to _"node_modules"_ then,
>       1. Set _config_ to _undefined_.
>       1. Continue the loop.
>    1. If _config_ is not _undefined_ then,
>       1. Let _parsedPackage_ be the value of _PARSE_PACKAGE_URL(path, config.jspmPackagesUrl)_.
>       1. If _parsedPackage_ is not _undefined_ and _parsedPackage.path_ is equal to the empty string then,
>          1. Continue the loop.
>    1. Let _jspmConfigPath_ be set to _"${path}/json.json"_.
>    1. Let _jspmConfig_ be set to _undefined_.
>    1. Let _baseUrl_ be set to _path_.
>    1. Let _jspmPackagesUrl_ be set to _"${path}/jspm_packages/"_.
>    1. Let _pjson_ be set to _undefined_.
>    1. If the file at _"${path}/package.json"_ exists,
>       1. Set _pjson_ to the output of the JSON parser applied to the contents of _"${path}/package.json"_, continuing on abrupt completion.
>       1. If _pjson?.configFiles?.jspm_ is a relative URL without backtracking,
>          1. Set _jspmConfigPath_ to the URL resolution of _pjson.configFiles.jspm_ to _path_.
>       1. If _pjson?.directories?.lib is a relative URL without backtracking,
>          1. Set _baseUrl_ to the URL resolution of _pjson.directories.lib_ to _path_.
>       1. If _pjson?.directories?.dist is a relative URL without backtracking,
>          1. If the environment conditional _production_ is _true_,
>             1. Set _baseUrl_ to the URL resolution of _pjson.directories.dist_ to _path_.
>       1. If _baseUrl_ has a trailing _"/"_, then remove it.
>       1. If _baseUrl_ is equal to or a subpath of _jspmPackagesUrl_ then,
>          1. Set _baseUrl_ to _path_.
>    1. If the file at _jspmConfigPath_ exists,
>       1. Set _jspmConfig_ to the output of the JSON parser applied to the contents of _jspmConfigPath_, continuing on abrupt completion.
>       1. If _jspmConfig_ is not _undefined_ then,
>          1. Set _config_ to the object with values _{ jspmConfig, jspmPackagesUrl, baseUrl }_.
> 1. Return _config_.

The return value of the above method is either `undefined` or an object of the form `{ jspmConfig, jspmPackagesUrl, baseUrl }`.

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
> 1. Let _parentNames_ be the set of parent names of _name_, including _name_ itself, in descending order (each item without the last separated segment from the previous one and without a trailing separator).
> 1. If the last item of _parentNames_ is the string _"."_ then,
>    1. If this is the only item of _parentNames_ then,
>       1. Return _resolveMap["."]_ if set or _undefined_.
>    1. Otherwise, remove the last item from _parentNames_.
> 1. For each _parentName_ of _parentNames_,
>    1. If _resolveMap_ has an entry for _parentName_ then,
>       1. Set _match_ to _parentName_.
>       1. Break the loop.
> 1. If _match_ is _undefined_ then,
>    1. Return _undefined_.
> 1. Assert _IS_RELATIVE(match)_ or _IS_PLAIN(match)_.
> 1. Let _replacement_ be the value of _resolveMap[match]_.
> 1. If _replacement_ is an _Object_ then,
>    1. For each property _condition_ of _replacement_,
>       1. If _condition_ is the name of an environment conditional that is _true_.
>          1. Let _replacement_ be the value of _replacement[condition]_.
>          1. Assert _replacement_ is a _string_.
>          1. Break the loop.
>    1. If _replacement_ is not a _string_,
>       1. Return _undefined_.
> 1. Otherwise, assert _replacement_ is a _string_.
> 1. If _IS_RELATIVE(match)_ then,
>    1. Assert _IS_RELATIVE(replacement)_.
> 1. Otherwise,
>    1. Assert _IS_RELATIVE(replacement)_ or _IS_PLAIN(replacement)_ or _PARSE_PACKAGE_CANONICAL(replacement)_ is not _undefined_.
> 1. Return _replacement_ concatenated with the substring of _name_ from the index at the length of _match_ to the end of the string.


### Extension and Directory Index Handling

Like the NodeJS module resolution, jspm 2.0 supports automatic extension and directory index handling through the following:

> **FILE_RESOLVE(url: string)**
> 1. Assert _url_ is a valid URL.
> 1. If _url_ is not using the _"file:"_ protocol then,
>    1. Return _url_.
> 1. If the file at _url_ exists,
>    1. Return _url_.
> 1. If the file at _"${url}.js"_ exists,
>    1. Return _"${url}.js"_.
> 1. If the file at _"${url}.json"_ exists,
>    1. Return _"${url}.json"_.
> 1. If the file at _"${url}.node"_ exists,
>    1. Return _"${url}.node"_.
> 1. If the file at _"${url}/index.js"_ exists,
>    1. Return _"${url}/index.js"_.
> 1. If the file at _"${url}/index.json"_ exists,
>    1. Return _"${url}/index.json"_.
> 1. If the file at _"${url}/index.node"_ exists,
>    1. Return _"${url}/index.node"_.
> 1. Throw a _"Module not found"_ error.

### Module Resolution Algorithm

Module resolution is always based on resolving `resolve(name, parentUrl)` where `name` is the optional unresolved
name to resolve, `parentUrl` must be a fully-resolved absolute URL to resolve relative to.

The resolver is based on two main parts - plain name resolution, and relative resolution.

Plain name resolution runs through contextual package resolution (jspm dependency configurations) and global package resolution
(top-level jspm installs) before falling back to delegating entirely to the `node_modules` NodeJS resolution. If no plain
resolution is in the NodeJS resolution, an error is thrown.

Relative resolution is applied after jspm plain configuration and first resolves the name as a URL against the parent. The full URL then runs through relative contextual map resolution, and finally global relative map configuration. The final name is then converted from a package name into a URL if it is not already a URL.

When handling conditional resolution, the environment conditional state is required to be known, an object of the form:

```js
{
  browser: boolean,
  node: boolean,
  production: boolean,
  dev: boolean,
  default: true
}
```

Where `production` and `dev` must be mutually exclusive, while `browser` and `node` can intersect for environments like Electron.

The resolution algorithm breaks down into the following high-level process to get the fully resolved URL:

> **JSPM_RESOLVE(name: string, parentUrl: string)**
> 1. Assert _parentUrl_ is a valid URL.
> 1. Let _config_ be the result of _GET_JSPM_CONFIG(parentUrl)_.
> 1. If _config_ is undefined then,
>    1. Return the result of _NODE_RESOLVE(name, parentUrl)_.
> 1. Let _jspmConfig_, _jspmPackagesUrl_, _baseUrl_ be the values of the respective properties of _config_.
> 1. If _IS_PLAIN(name)_,
>    1. Let _parentPackage_ be the result of _PARSE_PACKAGE_URL(parentUrl, jspmPackagesUrl)_.
>    1. If _parentPackage_ is not _undefined_ then,
>       1. Let _parentPackageMap_ be the value of _jspmConfig.dependencies[parentPackage.name]?.map_.
>       1. If _parentPackageMap_ is not _undefined_ then,
>          1. Let _mapped_ be the value of _APPLY_MAP(name, parentPackageMap)_
>          1. If _mapped_ is not _undefined_ then,
>             1. If _mapped_ starts with _"./"_ then,
>                1. Let _parentPackageUrl_ be the result of _PACKAGE_TO_URL(parentPackage.name, jspmPackagesUrl)_.
>                1. Let _resolved_ be the URL resolution of _name_ to _parentPackageUrl_.
>                1. Return _FILE_RESOLVE(resolved)_.
>             1. Otherwise, set _name_ to _mapped_.
> 1. If _IS_PLAIN(name)_ then,
>    1. Let _mapped_ be the value of _APPLY_MAP(name, jspmConfig.map)_.
>    1. If _mapped_ is not _undefined_ then,
>       1. If _mapped_ starts with _"./"_ then,
>          1. Let _resolved_ be the URL resolution of _mapped_ to _"${baseUrl}/"_.
>          1. Return _FILE_RESOLVE(resolved)_.
>       1. Otherwise, set _name_ to _mapped_.
> 1. If _IS_PLAIN(name)_ then,
>    1. Return _NODE_RESOLVE(name, parentUrl)_.
> 1. Let _resolvedPackage_ be the result of _PARSE_PACKAGE_CANONICAL(name)_.
> 1. Let _resolved_ be equal to _undefined_.
> 1. If _resolvedPackage_ is _undefined_ then,
>    1. Set _resolved_ to the result of the URL resolution of _name_ to _parentUrl_.
>    1. Let _resolvedPackage_ be the result of _PARSE_PACKAGE_URL(resolved)_.
> 1. If _resolvedPackage_ is not _undefined_ then,
>    1. Let _resolvedPackageMap_ be the value of _jspmConfig.dependencies[resolvedPackage.name]?.map_.
>    1. If _resolvedPackageMap_ is not _undefined_ then,
>       1. Let _relPath_ be the string _"."_ concatenated with _resolvedPackage.path_.
>       1. Let _mapped_ be the value of _APPLY_MAP(relPath, resolvedPackageMap)_.
>       1. If _mapped_ is not _undefined_ then,
>          1. Let _resolvedPackageUrl_ be the result of _PACKAGE_TO_URL(resolvedPackage.name, jspmPackagesUrl)_.
>          1. Let _resolved_ be the URL resolution of _mapped_ to _resolvedPackageUrl_.
>          1. Return _FILE_RESOLVE(resolved)_.
> 1. Otherwise, if _resolved_ starts with _baseUrl_ and either has the same length as _baseUrl_ or has a _"/"_ at the index of the length of _baseUrl_ then,
>    1. Let _relPath_ be the string _"."_ concatenated with the substring of _resolved_ from the index of the length of _baseUrl_ to the end of the string.
>    1. Let _mapped_ be the value of _APPLY_MAP(relPath, jspmConfig.map)_.
>    1. If _mapped_ is not _undefined_ then,
>       1. Let _resolved_ be the URL resolution of _mapped_ to _"${baseUrl}/"_.
>       1. Return _FILE_RESOLVE(resolved)_.
> 1. Return _FILE_RESOLVE(resolved)_.

The implementation of `NODE_RESOLVE` is exactly the NodeJS module resolution algorithm, as applied to file URLs.
