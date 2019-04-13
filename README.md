# JSPM 2 Resolver

This implements the `jspm_packages/[registry]/[name]@[version]/` module resolution lookup while checking the rules defined in `package.json` and `json.json` for jspm.

For the full detailed specification of jspm resolution, see the [jspm 2.0 resolver specification](https://github.com/jspm/jspm-resolve/blob/master/resolver-spec.md).

The resolver is fully backwards-compatible with the Node.js --experimental-modules resolver, which in turn is fully-backwards compatible with the traditional CommonJS resolver.

### Usage

Install with:

```
npm install @jspm/resolve
```

Then basic usage is:

```js
import jspmResolve from '@jspm/resolve';

const { resolved, format } = await jspmResolve('specifier', '/path/to/parent/module.js');
```

The jspm resolver works on file paths that are `/`-separated. It will still correctly handle the URL normalization rules of the ES Module resolver though, but works on file paths for convenience and performance.

Format, like the Node.js --experimental-modules resolver, is one of `commonjs`, `module`, `json`, `builtin`, `addon` or `unknown` for asset files.

### API

#### Cache

A cache object can be passed to the resolution function that will maintain all the lookup state for fast resolution:

```js
const cache = {};
jspmResolve(name, parent, { cache });
```

#### Environment

A custom environment can be provided to `jspmResolve`, representing the conditional paths to take in the resolver.

The default environment is the Node.js development environment:

```js
{
  browser: false,
  node: true,
  production: false,
  dev: true,
  'react-native': false,
  electron: false,
  deno: false,
  default: true
}
```

So a browser production resolution can be made with eg:

```js
jspmResolve(name, parent, {
  env: {
    browser: true,
    production: true
  }
});
```

The `browser` main and map will then be respected, as well as any custom production mappings.

#### CommonJS Resolve

By default the jspm resolver assumes resolution is coming from an ES module context.

CommonJS modules in Node.js always load all dependencies as CommonJS and this can also be supported in the jspm resolve options by passing the `cjsResolve: true` option.

This then implements automatic file extension searching as well as always loading the CommonJS format if not an addon or json path.

#### Synchronous Resolution

`jspmResolve.sync` can be used to perform synchronous resolution, with an otherwise identical API.

#### Loader

A `loader.mjs` file is provided which supports the Node.js `--experimental-modules` loader API:

```
node --experimental-modules --loader @jspm/resolve/loader.mjs x.js
```

This applies the jspm resolution to Node.js.

### License

Apache 2.0