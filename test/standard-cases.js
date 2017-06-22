const assert = require('assert');
const path = require('path');
const URL = require('url').URL;
const jspmResolve = require('../resolve.js');

const fixturesUrl = new URL('file:' + path.resolve(__dirname, 'fixtures') + '/');
const nodeUrl = new URL('file:' + path.resolve(__dirname, '../node_modules'));
const sfUrl = fixturesUrl + 'standard-cases/';
const pUrl = sfUrl + 'jspm_packages/';
const pkgUrl = jspmResolve.sync('pkg/', sfUrl);
const pkg2Url = jspmResolve.sync('ra:pkg@version2/', sfUrl);

suite('Standard Cases', () => {

  test('Extension cases', async () => {
    var resolved = await jspmResolve('./b', sfUrl);
    assert.equal(resolved, sfUrl + 'b.js');

    var resolved = await jspmResolve('./b', sfUrl + 'sub/');
    assert.equal(resolved, sfUrl + 'sub/b.js');

    var resolved = await jspmResolve('./c', sfUrl);
    assert.equal(resolved, sfUrl + 'c.json');

    var resolved = await jspmResolve('./d', sfUrl);
    assert.equal(resolved, sfUrl + 'd/index.js');

    var resolved = await jspmResolve('./e', sfUrl);
    assert.equal(resolved, sfUrl + 'e/index.json');
  });

  test('Global map config', async () => {
    var resolved = await jspmResolve('a', sfUrl);
    assert.equal(resolved, sfUrl + 'b.js');

    var resolved = await jspmResolve('a/', sfUrl);
    assert.equal(resolved, sfUrl + 'b/');

    var resolved = await jspmResolve('a/b', sfUrl);
    assert.equal(resolved, sfUrl + 'b/b.js');

    var resolved = await jspmResolve('a/c/b', sfUrl);
    assert.equal(resolved, sfUrl + 'b/b.js');

    var resolved = await jspmResolve('./rel', sfUrl);
    assert.equal(resolved, sfUrl + 'd/index.js');

    var resolved = await jspmResolve(sfUrl + 'rel', new URL('file:///'));
    assert.equal(resolved, sfUrl + 'd/index.js');

    try {
      var resolved = await jspmResolve('./fail', sfUrl);
      assert(false);
    }
    catch (e) {
      assert(true);
    }
  });

  test('Package loading', async () => {
    var resolved = await jspmResolve('ra:pkg@version', sfUrl);
    assert.equal(resolved, pUrl + 'ra/pkg@version/index.js');

    var resolved = await jspmResolve('ra:pkg@version/', sfUrl);
    assert.equal(resolved, pUrl + 'ra/pkg@version/');

    var resolved = await jspmResolve('ra:pkg@version/a', sfUrl);
    assert.equal(resolved, pUrl + 'ra/pkg@version/a.json');

    var resolved = await jspmResolve('pkg', sfUrl);
    assert.equal(resolved, pUrl + 'ra/pkg@version/index.js');

    var resolved = await jspmResolve('pkg/', sfUrl);
    assert.equal(resolved, pUrl + 'ra/pkg@version/');

    var resolved = await jspmResolve('pkg/a', sfUrl);
    assert.equal(resolved, pUrl + 'ra/pkg@version/a.json');

    try {
      var resolved = await jspmResolve('p/a', sfUrl);
      assert(false);
    }
    catch (e) {
      assert(e.toString().includes('pkg/a'));
    }
  });

  test('Package-relative loading', async () => {
    var resolved = await jspmResolve('./a', pkgUrl);
    assert.equal(resolved, pkgUrl + 'a.json');

    var resolved = await jspmResolve('x', pkgUrl);
    assert.equal(resolved, pkgUrl + 'y.js');

    var resolved = await jspmResolve('./z', pkgUrl);
    assert.equal(resolved, pkgUrl + 'a.json');

    var resolved = await jspmResolve('./z/a', pkgUrl);
    assert.equal(resolved, pkgUrl + 'a/a.js');

    var resolved = await jspmResolve('../z', pkgUrl + 'x/y');
    assert.equal(resolved, pkgUrl + 'a.json');

    var resolved = await jspmResolve('../../z', pkgUrl + 'x/y/z');
    assert.equal(resolved, pkgUrl + 'a.json');

    var resolved = await jspmResolve(pkgUrl + 'z');
    assert.equal(resolved, pkgUrl + 'a.json');

    var resolved = await jspmResolve(pkgUrl + 'z/a');
    assert.equal(resolved, pkgUrl + 'a/a.js');

    var resolved = await jspmResolve('p', pkgUrl);
    assert.equal(resolved, sfUrl + 'b.js');

    var resolved = await jspmResolve('p/b', pkgUrl);
    assert.equal(resolved, sfUrl + 'b/b.js');

    try {
      var resolved = await jspmResolve('./fail/x', pkgUrl);
      assert(false);
    }
    catch (e) {
      assert(true);
    }
  });

  test('Cross-package resolves', async () => {
    var resolved = await jspmResolve('ra:pkg@version2', sfUrl);
    assert.equal(resolved, pkg2Url + 'a.js');

    var resolved = await jspmResolve('pkg2/a', sfUrl);
    assert.equal(resolved, pkg2Url + 'b.js');
  });

  test('Conditional maps', async () => {
    var resolved = await jspmResolve('c', sfUrl);
    assert.equal(resolved, sfUrl + 'c-node.js');

    var resolved = await jspmResolve('c', sfUrl, { browser: true });
    assert.equal(resolved, sfUrl + 'c-browser.js');

    var resolved = await jspmResolve('c/a', sfUrl);
    assert.equal(resolved, sfUrl + 'c-node/a.js');

    var resolved = await jspmResolve('c', pkgUrl);
    assert.equal(resolved, pkgUrl + 'c-node.js');
  });

  test('Node Resolution fallback', async () => {
    var resolved = await jspmResolve('resolve', sfUrl);
    assert.equal(resolved, nodeUrl + '/resolve/index.js');

    try {
      var resolved = jspmResolve.sync('fs', sfUrl);
      assert(false);
    }
    catch (e) {
      assert(e);
    }
  });
});

suite('Standard Cases Sync', () => {

  test('Extension cases', () => {
    var resolved = jspmResolve.sync('./b', sfUrl);
    assert.equal(resolved, sfUrl + 'b.js');

    var resolved = jspmResolve.sync('./b', sfUrl + 'sub/');
    assert.equal(resolved, sfUrl + 'sub/b.js');

    var resolved = jspmResolve.sync('./c', sfUrl);
    assert.equal(resolved, sfUrl + 'c.json');

    var resolved = jspmResolve.sync('./d', sfUrl);
    assert.equal(resolved, sfUrl + 'd/index.js');

    var resolved = jspmResolve.sync('./e', sfUrl);
    assert.equal(resolved, sfUrl + 'e/index.json');
  });

  test('Global map config', () => {
    var resolved = jspmResolve.sync('a', sfUrl);
    assert.equal(resolved, sfUrl + 'b.js');

    var resolved = jspmResolve.sync('a/', sfUrl);
    assert.equal(resolved, sfUrl + 'b/');

    var resolved = jspmResolve.sync('a/b', sfUrl);
    assert.equal(resolved, sfUrl + 'b/b.js');

    var resolved = jspmResolve.sync('a/c/b', sfUrl);
    assert.equal(resolved, sfUrl + 'b/b.js');

    var resolved = jspmResolve.sync('./rel', sfUrl);
    assert.equal(resolved, sfUrl + 'd/index.js');

    var resolved = jspmResolve.sync(sfUrl + 'rel', new URL('file:///'));
    assert.equal(resolved, sfUrl + 'd/index.js');

    try {
      var resolved = jspmResolve.sync('./fail', sfUrl);
      assert(false);
    }
    catch (e) {
      assert(true);
    }
  });

  test('Package loading', () => {
    var resolved = jspmResolve.sync('ra:pkg@version', sfUrl);
    assert.equal(resolved, pUrl + 'ra/pkg@version/index.js');

    var resolved = jspmResolve.sync('ra:pkg@version/', sfUrl);
    assert.equal(resolved, pUrl + 'ra/pkg@version/');

    var resolved = jspmResolve.sync('ra:pkg@version/a', sfUrl);
    assert.equal(resolved, pUrl + 'ra/pkg@version/a.json');

    var resolved = jspmResolve.sync('pkg', sfUrl);
    assert.equal(resolved, pUrl + 'ra/pkg@version/index.js');

    var resolved = jspmResolve.sync('pkg/', sfUrl);
    assert.equal(resolved, pUrl + 'ra/pkg@version/');

    var resolved = jspmResolve.sync('pkg/a', sfUrl);
    assert.equal(resolved, pUrl + 'ra/pkg@version/a.json');

    try {
      var resolved = jspmResolve.sync('p/a', sfUrl);
      assert(false);
    }
    catch (e) {
      assert(e.toString().includes('pkg/a'));
    }
  });

  test('Package-relative loading', () => {
    var resolved = jspmResolve.sync('./a', pkgUrl);
    assert.equal(resolved, pkgUrl + 'a.json');

    var resolved = jspmResolve.sync('x', pkgUrl);
    assert.equal(resolved, pkgUrl + 'y.js');

    var resolved = jspmResolve.sync('./z', pkgUrl);
    assert.equal(resolved, pkgUrl + 'a.json');

    var resolved = jspmResolve.sync('./z/a', pkgUrl);
    assert.equal(resolved, pkgUrl + 'a/a.js');

    var resolved = jspmResolve.sync('../z', pkgUrl + 'x/y');
    assert.equal(resolved, pkgUrl + 'a.json');

    var resolved = jspmResolve.sync('../../z', pkgUrl + 'x/y/z');
    assert.equal(resolved, pkgUrl + 'a.json');

    var resolved = jspmResolve.sync(pkgUrl + 'z');
    assert.equal(resolved, pkgUrl + 'a.json');

    var resolved = jspmResolve.sync(pkgUrl + 'z/a');
    assert.equal(resolved, pkgUrl + 'a/a.js');

    var resolved = jspmResolve.sync('p', pkgUrl);
    assert.equal(resolved, sfUrl + 'b.js');

    var resolved = jspmResolve.sync('p/b', pkgUrl);
    assert.equal(resolved, sfUrl + 'b/b.js');

    try {
      var resolved = jspmResolve.sync('./fail/x', pkgUrl);
      assert(false);
    }
    catch (e) {
      assert(true);
    }
  });

  test('Cross-package resolves', async () => {
    var resolved = jspmResolve.sync('ra:pkg@version2', sfUrl);
    assert.equal(resolved, pkg2Url + 'a.js');

    var resolved = jspmResolve.sync('pkg2/a', sfUrl);
    assert.equal(resolved, pkg2Url + 'b.js');
  });

  test('Conditional maps', () => {
    var resolved = jspmResolve.sync('c', sfUrl);
    assert.equal(resolved, sfUrl + 'c-node.js');

    var resolved = jspmResolve.sync('c', sfUrl, { browser: true });
    assert.equal(resolved, sfUrl + 'c-browser.js');

    var resolved = jspmResolve.sync('c/a', sfUrl);
    assert.equal(resolved, sfUrl + 'c-node/a.js');

    var resolved = jspmResolve.sync('c', pkgUrl);
    assert.equal(resolved, pkgUrl + 'c-node.js');
  });

  test('Node Resolution fallback', () => {
    var resolved = jspmResolve.sync('resolve', sfUrl);
    assert.equal(resolved, nodeUrl + '/resolve/index.js');

    try {
      var resolved = jspmResolve.sync('fs', sfUrl);
      assert(false);
    }
    catch (e) {
      assert(e);
    }
  });
});
