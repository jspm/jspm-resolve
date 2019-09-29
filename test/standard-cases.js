import assert from 'assert';
import path from 'path';
import jspmResolve from '../resolve.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const winSepRegEx = /\\/g;
const fixturesPath = path.resolve(__dirname, 'fixtures').replace(winSepRegEx, '/') + '/';
const sfPath = `${fixturesPath}standard-cases/`;
const pPath = `${sfPath}jspm_packages/`;
const pkgPath = `${sfPath}jspm_packages/ra/pkg@version/`;
const pkg2Path = `${sfPath}jspm_packages/ra/pkg@version2/`;
const nmPath = fixturesPath + 'node_modules/test/';

suite('Standard Cases', () => {
  const cache = {};

  test('Legacy Extension cases', async () => {
    var { resolved } = await jspmResolve('./b', sfPath, { cache, cjsResolve: true });
    assert.equal(resolved, `${sfPath}b.js`);

    try {
      var { resolved } = await jspmResolve('./b', sfPath + 'sub/', { cache });
      assert(false, 'Should error');
    }
    catch (e) {
      assert.equal(e.code, 'MODULE_NOT_FOUND');
    }

    var { resolved } = await jspmResolve('./c', sfPath, { cache, cjsResolve: true });
    assert.equal(resolved, `${sfPath}c.json`);

    var { resolved } = await jspmResolve('./d', sfPath, { cache, cjsResolve: true });
    assert.equal(resolved, `${sfPath}d/index.js`);

    var { resolved } = await jspmResolve('./e', sfPath, { cache, cjsResolve: true });
    assert.equal(resolved, `${sfPath}e/index.json`);
  });

  test('Global map config', async () => {
    var { resolved } = await jspmResolve('a', sfPath, { cache });
    assert.equal(resolved, `${sfPath}b.js`);

    var { resolved } = await jspmResolve('a/', sfPath, { cache });
    assert.equal(resolved, `${sfPath}b/`);

    var { resolved } = await jspmResolve('a/b.js', sfPath, { cache });
    assert.equal(resolved, `${sfPath}b/b.js`);

    var { resolved } = await jspmResolve('a/c/b.js', sfPath, { cache });
    assert.equal(resolved, `${sfPath}b/b.js`);
  });
  
  test('Package loading', async () => {
    var { resolved } = await jspmResolve('pkg', sfPath, { cache });
    assert.equal(resolved, `${pPath}ra/pkg@version/index.js`);

    var { resolved } = await jspmResolve('pkg/', sfPath, { cache });
    assert.equal(resolved, `${pPath}ra/pkg@version/`);

    var { resolved } = await jspmResolve('pkg/a/a.js', sfPath, { cache });
    assert.equal(resolved, `${pPath}ra/pkg@version/a/a.js`);
  });

  test('Self import', async () => {
    var { resolved } = await jspmResolve('@', pkgPath, { cache });
    assert.equal(resolved, `${pPath}ra/pkg@version/index.js`);

    var { resolved } = await jspmResolve('@/custom.ext', pkgPath, { cache });
    assert.equal(resolved, `${pPath}ra/pkg@version/custom.ext`);
  });

  test('Package-relative loading', async () => {
    var { resolved } = await jspmResolve('./a.json', pkgPath, { cache });
    assert.equal(resolved, `${pkgPath}a.json`);

    var { resolved } = await jspmResolve('x', pkgPath, { cache });
    assert.equal(resolved, `${pkgPath}y.js`);
  
    var { resolved } = await jspmResolve('self/z/a.js', pkgPath, { cache });
    assert.equal(resolved, `${pkgPath}a/a.js`);

    var { resolved } = await jspmResolve('p', pkgPath, { cache });
    assert.equal(resolved, `${pkg2Path}a.js`);

    var { resolved } = await jspmResolve('p/a.js', pkgPath, { cache });
    assert.equal(resolved, `${pkg2Path}b.js`);

    var { resolved } = await jspmResolve('p/b.js', pkgPath, { cache });
    assert.equal(resolved, `${pkg2Path}b.js`);

    var { resolved } = await jspmResolve('../', pkgPath + 'sub/path.js', { cache });
    assert.equal(resolved, pkgPath);

    try {
      await jspmResolve('..', pkgPath + 'sub/path.js', { cache: cache });
      assert.fail();
    }
    catch (e) {
      assert.ok(e);
    }
  });

  test('Package scope-relative loading', async () => {
    var { resolved } = await jspmResolve('@', sfPath, { cache });
    assert.equal(resolved, sfPath + 'lib.js');

    var { resolved } = await jspmResolve('@/lib.js', sfPath, { cache });
    assert.equal(resolved, sfPath + 'lib.js');

    var { resolved } = await jspmResolve('@/lib.js', sfPath, { cache });
    assert.equal(resolved, sfPath + 'lib.js');

    var { resolved } = await jspmResolve('@/rel', sfPath, { cache, cjsResolve: true });
    assert.equal(resolved, sfPath + 'd/index.js');
  });

  test('Custom extensions', async () => {
    var { resolved } = await jspmResolve('pkg2/custom.ext', sfPath, { cache });
    assert.equal(resolved, pkg2Path + 'custom.ext');

    var { resolved } = await jspmResolve('pkg2/custom.ext', sfPath, { cache });
    assert.equal(resolved, pkg2Path + 'custom.ext');
  });
  
  test('Cross-package resolves', async () => {
    var { resolved } = await jspmResolve('pkg2', sfPath, { cache });
    assert.equal(resolved, pkg2Path + 'a.js');

    var { resolved } = await jspmResolve('pkg2/a.js', sfPath, { cache });
    assert.equal(resolved, pkg2Path + 'b.js');
  });

  test('Conditional maps', async () => {
    var { resolved } = await jspmResolve('c', sfPath, { cache });
    assert.equal(resolved, sfPath + 'c-node.js');

    var { resolved } = await jspmResolve('c', sfPath, { cache, targets: ['browser', 'main'] });
    assert.equal(resolved, sfPath + 'c-browser.js');

    var { resolved } = await jspmResolve('pkg', sfPath, { cache, targets: ['browser', 'main'] });
    assert.equal(resolved, pkgPath + 'c-browser.js');

    try {
      var { resolved } = await jspmResolve('c', sfPath, { cache, env: { browser: false, node: false } });
    }
    catch (e) {
      assert(e.message.indexOf('Cannot find module c') !== -1);
    }

    var { resolved } = await jspmResolve('c/a.js', sfPath, { cache });
    assert.equal(resolved, `${sfPath}c-node/a.js`);

    var { resolved } = await jspmResolve('c', pkgPath, { cache });
    assert.equal(resolved, pkgPath + 'c-node.js');
  });

  test('Node Resolution', async () => {
    try {
      var { resolved } = await jspmResolve('mochaa', sfPath, { cache });
      assert(false);
    }
    catch (e) {
      assert.equal(e.code, 'MODULE_NOT_FOUND');
    }

    var { resolved, format } = await jspmResolve('y/index', nmPath, { cache, cjsResolve: true });
    assert.equal(resolved, `${nmPath}node_modules/y/index.js`);
    assert.equal(format, 'commonjs');

    var { resolved, format } = await jspmResolve('y/index.js', nmPath, { cache });
    assert.equal(resolved, `${nmPath}node_modules/y/index.js`);
    assert.equal(format, 'commonjs');

    var { resolved, format } = await jspmResolve('y', nmPath, { cache });
    assert.equal(resolved, `${nmPath}node_modules/y/index.js`);
    assert.equal(format, 'commonjs');

    var { resolved } = await jspmResolve('y/', nmPath, { cache });
    assert.equal(resolved, `${nmPath}node_modules/y/`);

    try {
      var { resolved, format } = await jspmResolve('z', nmPath, { cache });
      assert(false);
    }
    catch (e) {
      assert.equal(e.code, 'MODULE_NOT_FOUND');
    }

    var { resolved, format } = await jspmResolve('z/index.js', nmPath, { cache });
    assert.equal(resolved, `${nmPath}node_modules/z/index.js`);
    assert.equal(format, 'module');

    var { resolved, format } = await jspmResolve('fs', sfPath, { cache });
    assert.equal(resolved, 'fs');
    assert.equal(format, 'builtin');
  });

  test('peerDependency fallback', async () => {
    var { resolved } = await jspmResolve('pkg', pkg2Path, { cache });
    assert.equal(resolved, `${pkgPath}index.js`);

    try {
      var { resolved } = await jspmResolve('pkg2', pkg2Path, { cache });
      assert(false);
    }
    catch (e) {
      assert.equal(e.code, 'MODULE_NOT_FOUND');
    }
  });

  test('Empty module', async () => {
    var { resolved, format } = await jspmResolve('@empty', sfPath, { cache });
    assert.equal(resolved, '@empty');
    assert.equal(format, 'builtin');
  });

  test('Cross-project resolution', async () => {
    var { resolved } = await jspmResolve('./jspm_packages/sr/p@1/main.js', sfPath + 'sub/', { cache });
    assert.equal(resolved, `${sfPath}sub/jspm_packages/sr/p@1/main.js`);

    var { resolved } = await jspmResolve('pkg', sfPath, { cache });
    assert.equal(resolved, `${sfPath}jspm_packages/ra/pkg@version/index.js`);
  });
  
  test('Module format', async () => {
    var { format } = await jspmResolve('pkg', sfPath, { cache });
    assert.equal(format, 'commonjs');

    var { format } = await jspmResolve('pkg2', sfPath, { cache });
    assert.equal(format, 'module');

    var { format } = await jspmResolve('./b.js', sfPath, { cache });
    assert.equal(format, 'commonjs');

    var { format } = await jspmResolve('pkg/custom.ext', sfPath, { cache });
    assert.equal(format, 'unknown');

    var { format } = await jspmResolve('../../../resolve.js', sfPath, { cache });
    assert.equal(format, 'commonjs');
  });
});

suite('Standard Cases Sync', () => {
  const cache = {};

  test('Legacy Extension cases', () => {
    var { resolved } = jspmResolve.sync('./b', sfPath, { cache, cjsResolve: true });
    assert.equal(resolved, `${sfPath}b.js`);

    try {
      var { resolved } = jspmResolve.sync('./b', sfPath + 'sub/', { cache });
      assert(false, 'Should error');
    }
    catch (e) {
      assert.equal(e.code, 'MODULE_NOT_FOUND');
    }

    var { resolved } = jspmResolve.sync('./c', sfPath, { cache, cjsResolve: true });
    assert.equal(resolved, `${sfPath}c.json`);

    var { resolved } = jspmResolve.sync('./d', sfPath, { cache, cjsResolve: true });
    assert.equal(resolved, `${sfPath}d/index.js`);

    var { resolved } = jspmResolve.sync('./e', sfPath, { cache, cjsResolve: true });
    assert.equal(resolved, `${sfPath}e/index.json`);
  });

  test('Global map config', () => {
    var { resolved } = jspmResolve.sync('a', sfPath, { cache });
    assert.equal(resolved, `${sfPath}b.js`);

    var { resolved } = jspmResolve.sync('a/', sfPath, { cache });
    assert.equal(resolved, `${sfPath}b/`);

    var { resolved } = jspmResolve.sync('a/b.js', sfPath, { cache });
    assert.equal(resolved, `${sfPath}b/b.js`);

    var { resolved } = jspmResolve.sync('a/c/b.js', sfPath, { cache });
    assert.equal(resolved, `${sfPath}b/b.js`);
  });
  
  test('Package loading', () => {
    var { resolved } = jspmResolve.sync('pkg', sfPath, { cache });
    assert.equal(resolved, `${pPath}ra/pkg@version/index.js`);

    var { resolved } = jspmResolve.sync('pkg/', sfPath, { cache });
    assert.equal(resolved, `${pPath}ra/pkg@version/`);

    var { resolved } = jspmResolve.sync('pkg/a/a.js', sfPath, { cache });
    assert.equal(resolved, `${pPath}ra/pkg@version/a/a.js`);
  });

  test('Self import', () => {
    var { resolved } = jspmResolve.sync('@', pkgPath, { cache });
    assert.equal(resolved, `${pPath}ra/pkg@version/index.js`);

    var { resolved } = jspmResolve.sync('@/custom.ext', pkgPath, { cache });
    assert.equal(resolved, `${pPath}ra/pkg@version/custom.ext`);

    var { resolved } = jspmResolve.sync('pkg/', pkgPath, { cache });
    assert.equal(resolved, `${pPath}ra/pkg@version/`);
  });

  test('Package-relative loading', () => {
    var { resolved } = jspmResolve.sync('./a.json', pkgPath, { cache });
    assert.equal(resolved, `${pkgPath}a.json`);

    var { resolved } = jspmResolve.sync('x', pkgPath, { cache });
    assert.equal(resolved, `${pkgPath}y.js`);
  
    var { resolved } = jspmResolve.sync('self/z/a.js', pkgPath, { cache });
    assert.equal(resolved, `${pkgPath}a/a.js`);

    var { resolved } = jspmResolve.sync('p', pkgPath, { cache });
    assert.equal(resolved, `${pkg2Path}a.js`);

    var { resolved } = jspmResolve.sync('p/a.js', pkgPath, { cache });
    assert.equal(resolved, `${pkg2Path}b.js`);

    var { resolved } = jspmResolve.sync('p/b.js', pkgPath, { cache });
    assert.equal(resolved, `${pkg2Path}b.js`);

    var { resolved } = jspmResolve.sync('../', pkgPath + 'sub/path.js', { cache });
    assert.equal(resolved, pkgPath);

    try {
      jspmResolve.sync('..', pkgPath + 'sub/path.js', { cache: cache });
      assert.fail();
    }
    catch (e) {
      assert.ok(e);
    }
  });

  test('Package scope-relative loading', () => {
    var { resolved } = jspmResolve.sync('@', sfPath, { cache });
    assert.equal(resolved, sfPath + 'lib.js');

    var { resolved } = jspmResolve.sync('@/lib.js', sfPath, { cache });
    assert.equal(resolved, sfPath + 'lib.js');

    var { resolved } = jspmResolve.sync('@/lib.js', sfPath, { cache });
    assert.equal(resolved, sfPath + 'lib.js');

    var { resolved } = jspmResolve.sync('@/rel', sfPath, { cache, cjsResolve: true });
    assert.equal(resolved, sfPath + 'd/index.js');
  });

  test('Custom extensions', () => {
    var { resolved } = jspmResolve.sync('pkg2/custom.ext', sfPath, { cache });
    assert.equal(resolved, pkg2Path + 'custom.ext');

    var { resolved } = jspmResolve.sync('pkg2/custom.ext', sfPath, { cache });
    assert.equal(resolved, pkg2Path + 'custom.ext');
  });
  
  test('Cross-package resolves', () => {
    var { resolved } = jspmResolve.sync('pkg2', sfPath, { cache });
    assert.equal(resolved, pkg2Path + 'a.js');

    var { resolved } = jspmResolve.sync('pkg2/a.js', sfPath, { cache });
    assert.equal(resolved, pkg2Path + 'b.js');
  });

  test('Conditional maps', () => {
    var { resolved } = jspmResolve.sync('c', sfPath, { cache });
    assert.equal(resolved, sfPath + 'c-node.js');

    var { resolved } = jspmResolve.sync('c', sfPath, { cache, targets: ['browser', 'main'] });
    assert.equal(resolved, sfPath + 'c-browser.js');

    var { resolved } = jspmResolve.sync('pkg', sfPath, { cache, targets: ['browser', 'main'] });
    assert.equal(resolved, pkgPath + 'c-browser.js');

    try {
      var { resolved } = jspmResolve.sync('c', sfPath, { cache, env: { browser: false, node: false } });
    }
    catch (e) {
      assert(e.message.indexOf('Cannot find module c') !== -1);
    }

    var { resolved } = jspmResolve.sync('c/a.js', sfPath, { cache });
    assert.equal(resolved, `${sfPath}c-node/a.js`);

    var { resolved } = jspmResolve.sync('c', pkgPath, { cache });
    assert.equal(resolved, pkgPath + 'c-node.js');
  });

  test('Node Resolution', () => {
    try {
      var { resolved } = jspmResolve.sync('mochaa', sfPath, { cache });
      assert(false);
    }
    catch (e) {
      assert.equal(e.code, 'MODULE_NOT_FOUND');
    }

    var { resolved, format } = jspmResolve.sync('y/index', nmPath, { cache, cjsResolve: true });
    assert.equal(resolved, `${nmPath}node_modules/y/index.js`);
    assert.equal(format, 'commonjs');

    var { resolved, format } = jspmResolve.sync('y/index.js', nmPath, { cache });
    assert.equal(resolved, `${nmPath}node_modules/y/index.js`);
    assert.equal(format, 'commonjs');

    var { resolved, format } = jspmResolve.sync('y', nmPath, { cache });
    assert.equal(resolved, `${nmPath}node_modules/y/index.js`);
    assert.equal(format, 'commonjs');

    var { resolved } = jspmResolve.sync('y/', nmPath, { cache });
    assert.equal(resolved, `${nmPath}node_modules/y/`);

    try {
      var { resolved, format } = jspmResolve.sync('z', nmPath, { cache });
      assert(false);
    }
    catch (e) {
      assert.equal(e.code, 'MODULE_NOT_FOUND');
    }

    var { resolved, format } = jspmResolve.sync('z/index.js', nmPath, { cache });
    assert.equal(resolved, `${nmPath}node_modules/z/index.js`);
    assert.equal(format, 'module');

    var { resolved, format } = jspmResolve.sync('fs', sfPath, { cache });
    assert.equal(resolved, 'fs');
    assert.equal(format, 'builtin');
  });

  test('peerDependency fallback', () => {
    var { resolved } = jspmResolve.sync('pkg', pkg2Path, { cache });
    assert.equal(resolved, `${pkgPath}index.js`);

    try {
      var { resolved } = jspmResolve.sync('pkg2', pkg2Path, { cache });
      assert(false);
    }
    catch (e) {
      assert.equal(e.code, 'MODULE_NOT_FOUND');
    }
  });

  test('Empty module', () => {
    var { resolved, format } = jspmResolve.sync('@empty', sfPath, { cache });
    assert.equal(resolved, '@empty');
    assert.equal(format, 'builtin');
  });

  test('Cross-project resolution', () => {
    var { resolved } = jspmResolve.sync('./jspm_packages/sr/p@1/main.js', sfPath + 'sub/', { cache });
    assert.equal(resolved, `${sfPath}sub/jspm_packages/sr/p@1/main.js`);

    var { resolved } = jspmResolve.sync('pkg', sfPath, { cache });
    assert.equal(resolved, `${sfPath}jspm_packages/ra/pkg@version/index.js`);
  });
  
  test('Module format', () => {
    var { format } = jspmResolve.sync('pkg', sfPath, { cache });
    assert.equal(format, 'commonjs');

    var { format } = jspmResolve.sync('pkg2', sfPath, { cache });
    assert.equal(format, 'module');

    var { format } = jspmResolve.sync('./b.js', sfPath, { cache });
    assert.equal(format, 'commonjs');

    var { format } = jspmResolve.sync('pkg/custom.ext', sfPath, { cache });
    assert.equal(format, 'unknown');

    var { format } = jspmResolve.sync('../../../resolve.js', sfPath, { cache });
    assert.equal(format, 'commonjs');
  });
});
