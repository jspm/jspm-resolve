const assert = require('assert');
const path = require('path');
const jspmResolve = require('../resolve.js');

const fixturesPath = path.resolve(__dirname, 'fixtures') + path.sep;
const nodePath = path.resolve(__dirname, '../node_modules');
const sfPath = fixturesPath + 'standard-cases' + path.sep;
const pPath = sfPath + 'jspm_packages' + path.sep;
const pkgPath = path.join(sfPath, 'jspm_packages', 'ra', 'pkg@version', path.sep);
const pkg2Path = path.join(sfPath, 'jspm_packages', 'ra', 'pkg@version2', path.sep);

suite('Standard Cases', () => {

  test('Extension cases', async () => {
    var resolved = await jspmResolve('./b', sfPath);
    assert.equal(resolved, path.join(sfPath, 'b.js'));

    var resolved = await jspmResolve('./b', sfPath + 'sub/');
    assert.equal(resolved, path.join(sfPath, 'sub', 'b.js'));

    var resolved = await jspmResolve('./c', sfPath);
    assert.equal(resolved, path.join(sfPath, 'c.json'));

    var resolved = await jspmResolve('./d', sfPath);
    assert.equal(resolved, path.join(sfPath, 'd', 'index.js'));

    var resolved = await jspmResolve('./e', sfPath);
    assert.equal(resolved, path.join(sfPath, 'e', 'index.json'));
  });

  test('Global map config', async () => {
    var resolved = await jspmResolve('a', sfPath);
    assert.equal(resolved, path.join(sfPath, 'b.js'));

    var resolved = await jspmResolve('a/', sfPath);
    assert.equal(resolved, path.join(sfPath, 'b') + path.sep);

    var resolved = await jspmResolve('a/b', sfPath);
    assert.equal(resolved, path.join(sfPath, 'b', 'b.js'));

    var resolved = await jspmResolve('a/c/b', sfPath);
    assert.equal(resolved, path.join(sfPath, 'b', 'b.js'));

    var resolved = await jspmResolve('./rel', sfPath);
    assert.equal(resolved, path.join(sfPath, 'd', 'index.js'));

    var resolved = await jspmResolve(path.join(sfPath, 'rel'), 'file:///');
    assert.equal(resolved, path.join(sfPath, 'd', 'index.js'));

    try {
      var resolved = await jspmResolve('./fail', sfPath);
      assert(false);
    }
    catch (e) {
      assert(true);
    }
  });

  test('Package loading', async () => {
    var resolved = await jspmResolve('ra:pkg@version', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version', 'index.js'));

    var resolved = await jspmResolve('ra:pkg@version/', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version') + path.sep);

    var resolved = await jspmResolve('ra:pkg@version/a', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version', 'a.json'));

    var resolved = await jspmResolve('pkg', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version', 'index.js'));

    var resolved = await jspmResolve('pkg/', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version') + path.sep);

    var resolved = await jspmResolve('pkg/a', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version', 'a.json'));

    try {
      var resolved = await jspmResolve('p/a', sfPath);
      assert(false);
    }
    catch (e) {
      assert(e.toString().includes('pkg' + path.sep + 'a'));
    }
  });

  test('Package-relative loading', async () => {
    var resolved = await jspmResolve('./a', pkgPath);
    assert.equal(resolved, pkgPath + 'a.json');

    var resolved = await jspmResolve('x', pkgPath);
    assert.equal(resolved, pkgPath + 'y.js');

    var resolved = await jspmResolve('./z', pkgPath);
    assert.equal(resolved, pkgPath + 'a.json');

    var resolved = await jspmResolve('./z/a', pkgPath);
    assert.equal(resolved, path.join(pkgPath, 'a', 'a.js'));

    var resolved = await jspmResolve('../z', pkgPath + 'x/y');
    assert.equal(resolved, pkgPath + 'a.json');

    var resolved = await jspmResolve('../../z', pkgPath + 'x/y/z');
    assert.equal(resolved, pkgPath + 'a.json');

    var resolved = await jspmResolve(pkgPath + 'z');
    assert.equal(resolved, pkgPath + 'a.json');

    var resolved = await jspmResolve(pkgPath + 'z/a');
    assert.equal(resolved, path.join(pkgPath, 'a', 'a.js'));

    var resolved = await jspmResolve('p', pkgPath);
    assert.equal(resolved, sfPath + 'b.js');

    var resolved = await jspmResolve('p/b', pkgPath);
    assert.equal(resolved, path.join(sfPath, 'b', 'b.js'));

    try {
      var resolved = await jspmResolve('./fail/x', pkgPath);
      assert(false);
    }
    catch (e) {
      assert(true);
    }
  });

  test('Cross-package resolves', async () => {
    var resolved = await jspmResolve('ra:pkg@version2', sfPath);
    assert.equal(resolved, pkg2Path + 'a.js');

    var resolved = await jspmResolve('pkg2/a', sfPath);
    assert.equal(resolved, pkg2Path + 'b.js');
  });

  test('Conditional maps', async () => {
    var resolved = await jspmResolve('c', sfPath);
    assert.equal(resolved, sfPath + 'c-node.js');

    var resolved = await jspmResolve('c', sfPath, { browser: true });
    assert.equal(resolved, sfPath + 'c-browser.js');

    try {
      var resolved = await jspmResolve('c', sfPath, { browser: false, node: false });
    }
    catch (e) {
      assert(e.message.indexOf('Cannot find module \'c\'') !== -1);
    }

    var resolved = await jspmResolve('c/a', sfPath);
    assert.equal(resolved, path.join(sfPath, 'c-node', 'a.js'));

    var resolved = await jspmResolve('c', pkgPath);
    assert.equal(resolved, pkgPath + 'c-node.js');
  });

  test('Node Resolution fallback', async () => {
    var resolved = await jspmResolve('resolve', sfPath);
    assert.equal(resolved, path.join(nodePath, 'resolve', 'index.js'));

    var resolved = await jspmResolve('resolve/index', sfPath);
    assert.equal(resolved, path.join(nodePath, 'resolve', 'index.js'));

    try {
      var resolved = await jspmResolve('resolve/', sfPath);
      assert(false);
    }
    catch (e) {
      assert(e);
    }

    try {
      var resolved = await jspmResolve('fs', sfPath);
      assert(false);
    }
    catch (e) {
      assert(e);
    }
  });

  test('Empty module', async () => {
    var resolved = await jspmResolve('@empty', sfPath);
    assert.equal(resolved, undefined);
  });

  test('Cross-project resolution', async () => {
    var resolved = await jspmResolve(sfPath + 'sub/c', sfPath);
    assert.equal(resolved, path.join(sfPath, 'sub', 'b.js'));

    var resolved = await jspmResolve('sr:p@1/main', sfPath + 'sub/');
    assert.equal(resolved, path.join(sfPath, 'sub', 'jspm_packages', 'sr', 'p@1', 'main.js'));
  });
});

suite('Standard Cases Sync', () => {

  test('Extension cases', () => {
    var resolved = jspmResolve.sync('./b', sfPath);
    assert.equal(resolved, path.join(sfPath, 'b.js'));

    var resolved = jspmResolve.sync('./b', sfPath + 'sub/');
    assert.equal(resolved, path.join(sfPath, 'sub', 'b.js'));

    var resolved = jspmResolve.sync('./c', sfPath);
    assert.equal(resolved, path.join(sfPath, 'c.json'));

    var resolved = jspmResolve.sync('./d', sfPath);
    assert.equal(resolved, path.join(sfPath, 'd', 'index.js'));

    var resolved = jspmResolve.sync('./e', sfPath);
    assert.equal(resolved, path.join(sfPath, 'e', 'index.json'));
  });

  test('Global map config', () => {
    var resolved = jspmResolve.sync('a', sfPath);
    assert.equal(resolved, path.join(sfPath, 'b.js'));

    var resolved = jspmResolve.sync('a/', sfPath);
    assert.equal(resolved, path.join(sfPath, 'b') + path.sep);

    var resolved = jspmResolve.sync('a/b', sfPath);
    assert.equal(resolved, path.join(sfPath, 'b', 'b.js'));

    var resolved = jspmResolve.sync('a/c/b', sfPath);
    assert.equal(resolved, path.join(sfPath, 'b', 'b.js'));

    var resolved = jspmResolve.sync('./rel', sfPath);
    assert.equal(resolved, path.join(sfPath, 'd', 'index.js'));

    var resolved = jspmResolve.sync(path.join(sfPath, 'rel'), 'file:///');
    assert.equal(resolved, path.join(sfPath, 'd', 'index.js'));

    try {
      var resolved = jspmResolve.sync('./fail', sfPath);
      assert(false);
    }
    catch (e) {
      assert(true);
    }
  });

  test('Package loading', () => {
    var resolved = jspmResolve.sync('ra:pkg@version', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version', 'index.js'));

    var resolved = jspmResolve.sync('ra:pkg@version/', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version') + path.sep);

    var resolved = jspmResolve.sync('ra:pkg@version/a', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version', 'a.json'));

    var resolved = jspmResolve.sync('pkg', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version', 'index.js'));

    var resolved = jspmResolve.sync('pkg/', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version') + path.sep);

    var resolved = jspmResolve.sync('pkg/a', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version', 'a.json'));

    try {
      var resolved = jspmResolve.sync('p/a', sfPath);
      assert(false);
    }
    catch (e) {
      assert(e.toString().includes('pkg' + path.sep + 'a'));
    }
  });

  test('Package-relative loading', () => {
    var resolved = jspmResolve.sync('./a', pkgPath);
    assert.equal(resolved, pkgPath + 'a.json');

    var resolved = jspmResolve.sync('x', pkgPath);
    assert.equal(resolved, pkgPath + 'y.js');

    var resolved = jspmResolve.sync('./z', pkgPath);
    assert.equal(resolved, pkgPath + 'a.json');

    var resolved = jspmResolve.sync('./z/a', pkgPath);
    assert.equal(resolved, path.join(pkgPath, 'a', 'a.js'));

    var resolved = jspmResolve.sync('../z', pkgPath + 'x/y');
    assert.equal(resolved, pkgPath + 'a.json');

    var resolved = jspmResolve.sync('../../z', pkgPath + 'x/y/z');
    assert.equal(resolved, pkgPath + 'a.json');

    var resolved = jspmResolve.sync(pkgPath + 'z');
    assert.equal(resolved, pkgPath + 'a.json');

    var resolved = jspmResolve.sync(pkgPath + 'z/a');
    assert.equal(resolved, path.join(pkgPath, 'a', 'a.js'));

    var resolved = jspmResolve.sync('p', pkgPath);
    assert.equal(resolved, sfPath + 'b.js');

    var resolved = jspmResolve.sync('p/b', pkgPath);
    assert.equal(resolved, path.join(sfPath, 'b', 'b.js'));

    try {
      var resolved = jspmResolve.sync('./fail/x', pkgPath);
      assert(false);
    }
    catch (e) {
      assert(true);
    }
  });

  test('Cross-package resolves', () => {
    var resolved = jspmResolve.sync('ra:pkg@version2', sfPath);
    assert.equal(resolved, pkg2Path + 'a.js');

    var resolved = jspmResolve.sync('pkg2/a', sfPath);
    assert.equal(resolved, pkg2Path + 'b.js');
  });

  test('Conditional maps', () => {
    var resolved = jspmResolve.sync('c', sfPath);
    assert.equal(resolved, sfPath + 'c-node.js');

    var resolved = jspmResolve.sync('c', sfPath, { browser: true });
    assert.equal(resolved, sfPath + 'c-browser.js');

    try {
      var resolved = jspmResolve.sync('c', sfPath, { browser: false, node: false });
    }
    catch (e) {
      assert(e.message.indexOf('Cannot find module \'c\'') !== -1);
    }

    var resolved = jspmResolve.sync('c/a', sfPath);
    assert.equal(resolved, path.join(sfPath, 'c-node', 'a.js'));

    var resolved = jspmResolve.sync('c', pkgPath);
    assert.equal(resolved, pkgPath + 'c-node.js');
  });

  test('Node Resolution fallback', () => {
    var resolved = jspmResolve.sync('resolve', sfPath);
    assert.equal(resolved, path.join(nodePath, 'resolve', 'index.js'));

    var resolved = jspmResolve.sync('resolve/index', sfPath);
    assert.equal(resolved, path.join(nodePath, 'resolve', 'index.js'));

    try {
      var resolved = jspmResolve.sync('resolve/', sfPath);
      assert(false);
    }
    catch (e) {
      assert(e);
    }

    try {
      var resolved = jspmResolve.sync('fs', sfPath);
      assert(false);
    }
    catch (e) {
      assert(e);
    }
  });

  test('Empty module', () => {
    var resolved = jspmResolve.sync('@empty', sfPath);
    assert.equal(resolved, undefined);
  });

  test('Cross-project resolution', () => {
    var resolved = jspmResolve.sync(sfPath + 'sub/c', sfPath);
    assert.equal(resolved, path.join(sfPath, 'sub', 'b.js'));

    var resolved = jspmResolve.sync('sr:p@1/main', sfPath + 'sub/');
    assert.equal(resolved, path.join(sfPath, 'sub', 'jspm_packages', 'sr', 'p@1', 'main.js'));
  });
});
