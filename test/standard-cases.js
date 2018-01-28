const assert = require('assert');
const path = require('path');
const jspmResolve = require('../resolve.js');

const winSepRegEx = /\\/g;
const fixturesPath = path.resolve(__dirname, 'fixtures').replace(winSepRegEx, '/') + '/';
const nodePath = path.resolve(__dirname, '../node_modules').replace(winSepRegEx, '/') + '/';
const sfPath = `${fixturesPath}standard-cases/`;
const pPath = `${sfPath}jspm_packages/`;
const pkgPath = `${sfPath}jspm_packages/ra/pkg@version/`;
const pkg2Path = `${sfPath}jspm_packages/ra/pkg@version2/`;
const browserBuiltinsPath = path.resolve(__dirname, '../node-browser-builtins').replace(winSepRegEx, '/') + '/';

suite('Standard Cases', () => {
  const cache = {};

  test('Extension cases', async () => {
    var { resolved } = await jspmResolve('./b', sfPath, { cache });
    assert.equal(resolved, `${sfPath}b.js`);

    var { resolved } = await jspmResolve('./b', sfPath + 'sub/', { cache });
    assert.equal(resolved, `${sfPath}sub/b.js`);

    var { resolved } = await jspmResolve('./c', sfPath, { cache });
    assert.equal(resolved, `${sfPath}c.json`);

    var { resolved } = await jspmResolve('./d', sfPath, { cache });
    assert.equal(resolved, `${sfPath}d/index.js`);

    var { resolved } = await jspmResolve('./e', sfPath, { cache });
    assert.equal(resolved, `${sfPath}e/index.json`);
  });

  test('Global map config', async () => {
    var { resolved } = await jspmResolve('a', sfPath, { cache });
    assert.equal(resolved, `${sfPath}b.js`);

    var { resolved } = await jspmResolve('a/', sfPath, { cache });
    assert.equal(resolved, `${sfPath}b/`);

    var { resolved } = await jspmResolve('a/b', sfPath, { cache });
    assert.equal(resolved, `${sfPath}b/b.js`);

    var { resolved } = await jspmResolve('a/c/b', sfPath, { cache });
    assert.equal(resolved, `${sfPath}b/b.js`);

    var { resolved } = await jspmResolve('./rel', sfPath, { cache });
    assert.equal(resolved, `${sfPath}d/index.js`);

    var { resolved } = await jspmResolve(`/${sfPath}rel`, 'file:///', { cache });
    assert.equal(resolved, `${sfPath}d/index.js`);

    try {
      var { resolved } = await jspmResolve('./fail', sfPath, { cache });
      assert(false);
    }
    catch (e) {
      assert(true);
    }
  });

  
  test('Package loading', async () => {
    var { resolved } = await jspmResolve('ra:pkg@version', sfPath, { cache });
    assert.equal(resolved, `${pPath}ra/pkg@version/index.js`);

    var { resolved } = await jspmResolve('ra:pkg@version/', sfPath, { cache });
    assert.equal(resolved, `${pPath}ra/pkg@version/`);

    var { resolved } = await jspmResolve('ra:pkg@version/a', sfPath, { cache });
    assert.equal(resolved, `${pPath}ra/pkg@version/a.json`);

    var { resolved } = await jspmResolve('pkg', sfPath, { cache });
    assert.equal(resolved, `${pPath}ra/pkg@version/index.js`);

    var { resolved } = await jspmResolve('pkg/', sfPath, { cache });
    assert.equal(resolved, `${pPath}ra/pkg@version/`);

    var { resolved } = await jspmResolve('pkg/a', sfPath, { cache });
    assert.equal(resolved, `${pPath}ra/pkg@version/a.json`);

    try {
      var { resolved } = await jspmResolve('p/b', sfPath, { cache });
      assert(false);
    }
    catch (e) {
      assert(e.toString().includes('Cannot find module'));
    }
  });

  test('Package-relative loading', async () => {
    var { resolved } = await jspmResolve('./a', pkgPath, { cache });
    assert.equal(resolved, `${pkgPath}a.json`);

    var { resolved } = await jspmResolve('x', pkgPath, { cache });
    assert.equal(resolved, `${pkgPath}y.js`);

    var { resolved } = await jspmResolve('./z', pkgPath, { cache });
    assert.equal(resolved, `${pkgPath}a.json`);

    var { resolved } = await jspmResolve('./z/a', pkgPath, { cache });
    assert.equal(resolved, `${pkgPath}a/a.js`);

    var { resolved } = await jspmResolve('../z', pkgPath + 'x/y', { cache });
    assert.equal(resolved, `${pkgPath}a.json`);

    var { resolved } = await jspmResolve('../../z', pkgPath + 'x/y/z', { cache });
    assert.equal(resolved, `${pkgPath}a.json`);

    var { resolved } = await jspmResolve('/' + pkgPath + 'z', undefined, { cache });
    assert.equal(resolved, `${pkgPath}a.json`);

    var { resolved } = await jspmResolve('/' + pkgPath + 'z/a', undefined, { cache });
    assert.equal(resolved, `${pkgPath}a/a.js`);

    var { resolved } = await jspmResolve('p', pkgPath, { cache });
    assert.equal(resolved, `${pkg2Path}a.js`);

    var { resolved } = await jspmResolve('p/b', pkgPath, { cache });
    assert.equal(resolved, `${pkg2Path}b.js`);

    try {
      var { resolved } = await jspmResolve('./fail/x', pkgPath, { cache });
      assert(false);
    }
    catch (e) {
      assert(true);
    }

    var { resolved } = await jspmResolve('../', pkgPath + 'sub/path.js', { cache });
    assert.equal(resolved, `${pkgPath}index.js`);
  });
  
  test('Cross-package resolves', async () => {
    var { resolved } = await jspmResolve('ra:pkg@version2', sfPath, { cache });
    assert.equal(resolved, pkg2Path + 'a.js');

    var { resolved } = await jspmResolve('pkg2/a', sfPath, { cache });
    assert.equal(resolved, pkg2Path + 'b.js');
  });

  test('Conditional maps', async () => {
    var { resolved } = await jspmResolve('c', sfPath, { cache });
    assert.equal(resolved, sfPath + 'c-node.js');

    var { resolved } = await jspmResolve('c', sfPath, { cache, env: { browser: true } });
    assert.equal(resolved, sfPath + 'c-browser.js');

    var { resolved } = await jspmResolve(pkgPath.substr(0, pkgPath.length - 1), undefined, { cache, env: { browser: true }});
    assert.equal(resolved, pkgPath + 'c-browser.js');

    try {
      var { resolved } = await jspmResolve('c', sfPath, { cache, env: { browser: false, node: false } });
    }
    catch (e) {
      assert(e.message.indexOf('Cannot find module c') !== -1);
    }

    var { resolved } = await jspmResolve('c/a', sfPath, { cache });
    assert.equal(resolved, `${sfPath}c-node/a.js`);

    var { resolved } = await jspmResolve('c', pkgPath, { cache });
    assert.equal(resolved, pkgPath + 'c-node.js');
  });

  test('Node Resolution fallback', async () => {
    var { resolved } = await jspmResolve('mocha', sfPath, { cache });
    assert.equal(resolved, `${nodePath}mocha/index.js`);

    var { resolved } = await jspmResolve('mocha/index', sfPath, { cache });
    assert.equal(resolved, `${nodePath}mocha/index.js`);

    var { resolved } = await jspmResolve('mocha/', sfPath, { cache });
    assert.equal(resolved, `${nodePath}mocha/`);

    var { resolved, format } = await jspmResolve('fs', sfPath, { cache });
    assert.equal(resolved, 'fs');
    assert.equal(format, 'builtin');

    try {
      var { resolved } = await jspmResolve('thing', sfPath, { cache });
    }
    catch (e) {
      assert.equal(e.code, 'MODULE_NOT_FOUND');
      return false;
    }
    assert(false);
  });

  test('Empty module', async () => {
    var { resolved } = await jspmResolve('@empty', sfPath, { cache });
    assert.equal(resolved, undefined);
  });

  test('Cross-project resolution', async () => {
    var { resolved } = await jspmResolve(`/${sfPath}sub/c`, sfPath, { cache });
    assert.equal(resolved, `${sfPath}sub/b.js`);

    var { resolved } = await jspmResolve('sr:p@1/main', sfPath + 'sub/', { cache });
    assert.equal(resolved, `${sfPath}sub/jspm_packages/sr/p@1/main.js`);

    var { resolved } = await jspmResolve('pkg', sfPath, { cache });
    assert.equal(resolved, `${sfPath}jspm_packages/ra/pkg@version/index.js`);
  });
  
  test('Module format', async () => {
    var { resolved, format } = await jspmResolve('pkg', sfPath, { cache });
    assert.equal(format, 'commonjs');

    var { resolved, format } = await jspmResolve('pkg2', sfPath, { cache });
    assert.equal(format, 'esm');

    assert.equal(await jspmResolve.format(resolved), 'esm');

    var { resolved, format } = await jspmResolve('../../../resolve.js', sfPath, { cache });
    assert.equal(format, 'commonjs');
  });

  test('Package name', async () => {
    var packageName = await jspmResolve.packagePath(pkgPath + 'test', { cache });
    assert.equal(packageName, pkgPath.substr(0, pkgPath.length - 1));

    var packageName = await jspmResolve.packagePath(sfPath, { cache });
    assert.equal(packageName, undefined);
  });
});

suite('Standard Cases Sync', () => {
  const syncCache = {};

  test('Extension cases', () => {
    var { resolved } = jspmResolve.sync('./b', sfPath, { cache: syncCache });
    assert.equal(resolved, `${sfPath}b.js`);

    var { resolved } = jspmResolve.sync('./b', sfPath + 'sub/', { cache: syncCache });
    assert.equal(resolved, `${sfPath}sub/b.js`);

    var { resolved } = jspmResolve.sync('./c', sfPath, { cache: syncCache });
    assert.equal(resolved, `${sfPath}c.json`);

    var { resolved } = jspmResolve.sync('./d', sfPath, { cache: syncCache });
    assert.equal(resolved, `${sfPath}d/index.js`);

    var { resolved } = jspmResolve.sync('./e', sfPath, { cache: syncCache });
    assert.equal(resolved, `${sfPath}e/index.json`);
  });

  test('Global map config', () => {
    var { resolved } = jspmResolve.sync('a', sfPath, { cache: syncCache });
    assert.equal(resolved, `${sfPath}b.js`);

    var { resolved } = jspmResolve.sync('a/', sfPath, { cache: syncCache });
    assert.equal(resolved, `${sfPath}b/`);

    var { resolved } = jspmResolve.sync('a/b', sfPath, { cache: syncCache });
    assert.equal(resolved, `${sfPath}b/b.js`);

    var { resolved } = jspmResolve.sync('a/c/b', sfPath, { cache: syncCache });
    assert.equal(resolved, `${sfPath}b/b.js`);

    var { resolved } = jspmResolve.sync('./rel', sfPath, { cache: syncCache });
    assert.equal(resolved, `${sfPath}d/index.js`);

    var { resolved } = jspmResolve.sync(`/${sfPath}rel`, 'file:///', { cache: syncCache });
    assert.equal(resolved, `${sfPath}d/index.js`);

    try {
      var { resolved } = jspmResolve.sync('./fail', sfPath, { cache: syncCache });
      assert(false);
    }
    catch (e) {
      assert(true);
    }
  });

  
  test('Package loading', () => {
    var { resolved } = jspmResolve.sync('ra:pkg@version', sfPath, { cache: syncCache });
    assert.equal(resolved, `${pPath}ra/pkg@version/index.js`);

    var { resolved } = jspmResolve.sync('ra:pkg@version/', sfPath, { cache: syncCache });
    assert.equal(resolved, `${pPath}ra/pkg@version/`);

    var { resolved } = jspmResolve.sync('ra:pkg@version/a', sfPath, { cache: syncCache });
    assert.equal(resolved, `${pPath}ra/pkg@version/a.json`);

    var { resolved } = jspmResolve.sync('pkg', sfPath, { cache: syncCache });
    assert.equal(resolved, `${pPath}ra/pkg@version/index.js`);

    var { resolved } = jspmResolve.sync('pkg/', sfPath, { cache: syncCache });
    assert.equal(resolved, `${pPath}ra/pkg@version/`);

    var { resolved } = jspmResolve.sync('pkg/a', sfPath, { cache: syncCache });
    assert.equal(resolved, `${pPath}ra/pkg@version/a.json`);

    try {
      var { resolved } = jspmResolve.sync('p/b', sfPath, { cache: syncCache });
      assert(false);
    }
    catch (e) {
      assert(e.toString().includes('Cannot find module'));
    }
  });

  test('Package-relative loading', () => {
    var { resolved } = jspmResolve.sync('./a', pkgPath, { cache: syncCache });
    assert.equal(resolved, `${pkgPath}a.json`);

    var { resolved } = jspmResolve.sync('x', pkgPath, { cache: syncCache });
    assert.equal(resolved, `${pkgPath}y.js`);

    var { resolved } = jspmResolve.sync('./z', pkgPath, { cache: syncCache });
    assert.equal(resolved, `${pkgPath}a.json`);

    var { resolved } = jspmResolve.sync('./z/a', pkgPath, { cache: syncCache });
    assert.equal(resolved, `${pkgPath}a/a.js`);

    var { resolved } = jspmResolve.sync('../z', pkgPath + 'x/y', { cache: syncCache });
    assert.equal(resolved, `${pkgPath}a.json`);

    var { resolved } = jspmResolve.sync('../../z', pkgPath + 'x/y/z', { cache: syncCache });
    assert.equal(resolved, `${pkgPath}a.json`);

    var { resolved } = jspmResolve.sync('/' + pkgPath + 'z', undefined, { cache: syncCache });
    assert.equal(resolved, `${pkgPath}a.json`);

    var { resolved } = jspmResolve.sync('/' + pkgPath + 'z/a', undefined, { cache: syncCache });
    assert.equal(resolved, `${pkgPath}a/a.js`);

    var { resolved } = jspmResolve.sync('p', pkgPath, { cache: syncCache });
    assert.equal(resolved, `${pkg2Path}a.js`);

    var { resolved } = jspmResolve.sync('p/b', pkgPath, { cache: syncCache });
    assert.equal(resolved, `${pkg2Path}b.js`);

    try {
      var { resolved } = jspmResolve.sync('./fail/x', pkgPath, { cache: syncCache });
      assert(false);
    }
    catch (e) {
      assert(true);
    }

    var { resolved } = jspmResolve.sync('../', pkgPath + 'sub/path.js', { cache: syncCache });
    assert.equal(resolved, `${pkgPath}index.js`);
  });
  
  test('Cross-package resolves', () => {
    var { resolved } = jspmResolve.sync('ra:pkg@version2', sfPath, { cache: syncCache });
    assert.equal(resolved, pkg2Path + 'a.js');

    var { resolved } = jspmResolve.sync('pkg2/a', sfPath, { cache: syncCache });
    assert.equal(resolved, pkg2Path + 'b.js');
  });

  test('Conditional maps', () => {
    var { resolved } = jspmResolve.sync('c', sfPath, { cache: syncCache });
    assert.equal(resolved, sfPath + 'c-node.js');

    var { resolved } = jspmResolve.sync('c', sfPath, { env: { browser: true }, cache: syncCache });
    assert.equal(resolved, sfPath + 'c-browser.js');

    var { resolved } = jspmResolve.sync(pkgPath.substr(0, pkgPath.length - 1), undefined, { cache: syncCache, env: { browser: true }});
    assert.equal(resolved, pkgPath + 'c-browser.js');

    try {
      var { resolved } = jspmResolve.sync('c', sfPath, { env: { browser: false, node: false }, cache: syncCache });
    }
    catch (e) {
      assert(e.message.indexOf('Cannot find module c') !== -1);
    }

    var { resolved } = jspmResolve.sync('c/a', sfPath, { cache: syncCache });
    assert.equal(resolved, `${sfPath}c-node/a.js`);

    var { resolved } = jspmResolve.sync('c', pkgPath, { cache: syncCache });
    assert.equal(resolved, pkgPath + 'c-node.js');
  });

  test('Node Resolution fallback', () => {
    var { resolved } = jspmResolve.sync('mocha', sfPath, { cache: syncCache });
    assert.equal(resolved, `${nodePath}mocha/index.js`);

    var { resolved } = jspmResolve.sync('mocha/index', sfPath, { cache: syncCache });
    assert.equal(resolved, `${nodePath}mocha/index.js`);

    var { resolved } = jspmResolve.sync('mocha/', sfPath, { cache: syncCache });
    assert.equal(resolved, `${nodePath}mocha/`);

    var { resolved, format } = jspmResolve.sync('fs', sfPath, { cache: syncCache });
    assert.equal(resolved, 'fs');
    assert.equal(format, 'builtin');

    try {
      var { resolved } = jspmResolve.sync('thing', sfPath, { cache: syncCache });
    }
    catch (e) {
      assert.equal(e.code, 'MODULE_NOT_FOUND');
      return false;
    }
    assert(false);
  });

  test('Builtins', () => {
    var { resolved } = jspmResolve.sync('process', sfPath, { env: { browser: true } });
    assert.equal(resolved, `${browserBuiltinsPath}process.js`);

    var { resolved } = jspmResolve.sync('process', sfPath, { env: { browser: true }, browserBuiltins: false });
    assert.equal(resolved, 'process');

    var { resolved } = jspmResolve.sync('child_process', sfPath, { env: { browser: true } });
    assert.equal(resolved, undefined);
  });

  test('Empty module', () => {
    var { resolved } = jspmResolve.sync('@empty', sfPath, { cache: syncCache });
    assert.equal(resolved, undefined);
  });

  test('Cross-project resolution', () => {
    var { resolved } = jspmResolve.sync(`/${sfPath}sub/c`, sfPath, { cache: syncCache });
    assert.equal(resolved, `${sfPath}sub/b.js`);

    var { resolved } = jspmResolve.sync('sr:p@1/main', sfPath + 'sub/', { cache: syncCache });
    assert.equal(resolved, `${sfPath}sub/jspm_packages/sr/p@1/main.js`);

    var { resolved } = jspmResolve.sync('pkg', sfPath, { cache: syncCache });
    assert.equal(resolved, `${sfPath}jspm_packages/ra/pkg@version/index.js`);
  });
  
  test('Module format', () => {
    var { resolved, format } = jspmResolve.sync('pkg', sfPath, { cache: syncCache });
    assert.equal(format, 'commonjs');

    var { resolved, format } = jspmResolve.sync('pkg2', sfPath, { cache: syncCache });
    assert.equal(format, 'esm');

    assert.equal(jspmResolve.formatSync(resolved), 'esm');

    var { resolved, format } = jspmResolve.sync('../../../resolve.js', sfPath, { cache: syncCache });
    assert.equal(format, 'commonjs');
  });

  test('Package name', async () => {
    var packageName = jspmResolve.packagePathSync(pkgPath + 'test', { cache: syncCache });
    assert.equal(packageName, pkgPath.substr(0, pkgPath.length - 1));

    var packageName = jspmResolve.packagePathSync(sfPath, { cache: syncCache });
    assert.equal(packageName, undefined);
  });
});
