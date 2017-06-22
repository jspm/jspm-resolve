const assert = require('assert');
const path = require('path');
const URL = require('url').URL;
const jspmResolve = require('../resolve.js');

const fixturesUrl = new URL('file:' + path.resolve(__dirname, 'fixtures') + '/').href;

suite('Standard Cases', () => {
  const sfUrl = fixturesUrl + 'standard-cases/';

  test('Extension cases', async () => {
    var resolved = await jspmResolve('./b', sfUrl);
    assert.equal(resolved.href, sfUrl + 'b.js');

    var resolved = await jspmResolve('./b', sfUrl + 'sub/');
    assert.equal(resolved.href, sfUrl + 'sub/b.js');

    var resolved = await jspmResolve('./c', sfUrl);
    assert.equal(resolved.href, sfUrl + 'c.json');

    var resolved = await jspmResolve('./d', sfUrl);
    assert.equal(resolved.href, sfUrl + 'd/index.js');

    var resolved = await jspmResolve('./e', sfUrl);
    assert.equal(resolved.href, sfUrl + 'e/index.json');
  });

  test('Global map config', async () => {
    var resolved = await jspmResolve('a', sfUrl);
    assert.equal(resolved.href, sfUrl + 'b.js');

    var resolved = await jspmResolve('a/', sfUrl);
    assert.equal(resolved.href, sfUrl + 'b/');

    var resolved = await jspmResolve('a/b', sfUrl);
    assert.equal(resolved.href, sfUrl + 'b/b.js');

    var resolved = await jspmResolve('a/c/b', sfUrl);
    assert.equal(resolved.href, sfUrl + 'b/b.js');

    var resolved = await jspmResolve('./rel', sfUrl);
    assert.equal(resolved.href, sfUrl + 'd/index.js');

    var resolved = await jspmResolve(sfUrl + 'rel', new URL('file:///'));
    assert.equal(resolved.href, sfUrl + 'd/index.js');

    try {
      var resolved = await jspmResolve('./fail', sfUrl);
      assert(false);
    }
    catch (e) {
      assert(true);
    }
  });

  const pUrl = sfUrl + 'jspm_packages/';

  test('Package loading', async () => {
    var resolved = await jspmResolve('ra:pkg@version', sfUrl);
    assert.equal(resolved.href, pUrl + 'ra/pkg@version/index.js');

    var resolved = await jspmResolve('ra:pkg@version/', sfUrl);
    assert.equal(resolved.href, pUrl + 'ra/pkg@version/');

    var resolved = await jspmResolve('ra:pkg@version/a', sfUrl);
    assert.equal(resolved.href, pUrl + 'ra/pkg@version/a.json');

    var resolved = await jspmResolve('pkg', sfUrl);
    assert.equal(resolved.href, pUrl + 'ra/pkg@version/index.js');

    var resolved = await jspmResolve('pkg/', sfUrl);
    assert.equal(resolved.href, pUrl + 'ra/pkg@version/');

    var resolved = await jspmResolve('pkg/a', sfUrl);
    assert.equal(resolved.href, pUrl + 'ra/pkg@version/a.json');

    try {
      var resolved = await jspmResolve('p/a', sfUrl);
      assert(false);
    }
    catch (e) {
      assert(e.toString().includes('pkg/a'));
    }
  });

  test('Package-relative loading', async () => {
    const pkgUrl = await jspmResolve('pkg/', sfUrl);

    var resolved = await jspmResolve('./a', pkgUrl);
    assert.equal(resolved.href, pkgUrl + 'a.json');

    var resolved = await jspmResolve('x', pkgUrl);
    assert.equal(resolved.href, pkgUrl + 'y.js');

    var resolved = await jspmResolve('./z', pkgUrl);
    assert.equal(resolved.href, pkgUrl + 'a.json');

    var resolved = await jspmResolve('./z/a', pkgUrl);
    assert.equal(resolved.href, pkgUrl + 'a/a.js');

    var resolved = await jspmResolve('../z', pkgUrl + 'x/y');
    assert.equal(resolved.href, pkgUrl + 'a.json');

    var resolved = await jspmResolve('../../z', pkgUrl + 'x/y/z');
    assert.equal(resolved.href, pkgUrl + 'a.json');

    var resolved = await jspmResolve(pkgUrl + 'z');
    assert.equal(resolved.href, pkgUrl + 'a.json');

    var resolved = await jspmResolve(pkgUrl + 'z/a');
    assert.equal(resolved.href, pkgUrl + 'a/a.js');

    var resolved = await jspmResolve('p', pkgUrl);
    assert.equal(resolved.href, sfUrl + 'b.js');

    var resolved = await jspmResolve('p/b', pkgUrl);
    assert.equal(resolved.href, sfUrl + 'b/b.js');

    try {
      var resolved = await jspmResolve('./fail/x', pkgUrl);
      assert(false);
    }
    catch (e) {
      assert(true);
    }
  });
});

suite('Standard Cases Sync', () => {
  const sfUrl = fixturesUrl + 'standard-cases/';

  test('Extension cases', () => {
    var resolved = jspmResolve.sync('./b', sfUrl);
    assert.equal(resolved.href, sfUrl + 'b.js');

    var resolved = jspmResolve.sync('./b', sfUrl + 'sub/');
    assert.equal(resolved.href, sfUrl + 'sub/b.js');

    var resolved = jspmResolve.sync('./c', sfUrl);
    assert.equal(resolved.href, sfUrl + 'c.json');

    var resolved = jspmResolve.sync('./d', sfUrl);
    assert.equal(resolved.href, sfUrl + 'd/index.js');

    var resolved = jspmResolve.sync('./e', sfUrl);
    assert.equal(resolved.href, sfUrl + 'e/index.json');
  });

  test('Global map config', () => {
    var resolved = jspmResolve.sync('a', sfUrl);
    assert.equal(resolved.href, sfUrl + 'b.js');

    var resolved = jspmResolve.sync('a/', sfUrl);
    assert.equal(resolved.href, sfUrl + 'b/');

    var resolved = jspmResolve.sync('a/b', sfUrl);
    assert.equal(resolved.href, sfUrl + 'b/b.js');

    var resolved = jspmResolve.sync('a/c/b', sfUrl);
    assert.equal(resolved.href, sfUrl + 'b/b.js');

    var resolved = jspmResolve.sync('./rel', sfUrl);
    assert.equal(resolved.href, sfUrl + 'd/index.js');

    var resolved = jspmResolve.sync(sfUrl + 'rel', new URL('file:///'));
    assert.equal(resolved.href, sfUrl + 'd/index.js');

    try {
      var resolved = jspmResolve.sync('./fail', sfUrl);
      assert(false);
    }
    catch (e) {
      assert(true);
    }
  });

  const pUrl = sfUrl + 'jspm_packages/';

  test('Package loading', () => {
    var resolved = jspmResolve.sync('ra:pkg@version', sfUrl);
    assert.equal(resolved.href, pUrl + 'ra/pkg@version/index.js');

    var resolved = jspmResolve.sync('ra:pkg@version/', sfUrl);
    assert.equal(resolved.href, pUrl + 'ra/pkg@version/');

    var resolved = jspmResolve.sync('ra:pkg@version/a', sfUrl);
    assert.equal(resolved.href, pUrl + 'ra/pkg@version/a.json');

    var resolved = jspmResolve.sync('pkg', sfUrl);
    assert.equal(resolved.href, pUrl + 'ra/pkg@version/index.js');

    var resolved = jspmResolve.sync('pkg/', sfUrl);
    assert.equal(resolved.href, pUrl + 'ra/pkg@version/');

    var resolved = jspmResolve.sync('pkg/a', sfUrl);
    assert.equal(resolved.href, pUrl + 'ra/pkg@version/a.json');

    try {
      var resolved = jspmResolve.sync('p/a', sfUrl);
      assert(false);
    }
    catch (e) {
      assert(e.toString().includes('pkg/a'));
    }
  });

  test('Package-relative loading', () => {
    const pkgUrl = jspmResolve.sync('pkg/', sfUrl);

    var resolved = jspmResolve.sync('./a', pkgUrl);
    assert.equal(resolved.href, pkgUrl + 'a.json');

    var resolved = jspmResolve.sync('x', pkgUrl);
    assert.equal(resolved.href, pkgUrl + 'y.js');

    var resolved = jspmResolve.sync('./z', pkgUrl);
    assert.equal(resolved.href, pkgUrl + 'a.json');

    var resolved = jspmResolve.sync('./z/a', pkgUrl);
    assert.equal(resolved.href, pkgUrl + 'a/a.js');

    var resolved = jspmResolve.sync('../z', pkgUrl + 'x/y');
    assert.equal(resolved.href, pkgUrl + 'a.json');

    var resolved = jspmResolve.sync('../../z', pkgUrl + 'x/y/z');
    assert.equal(resolved.href, pkgUrl + 'a.json');

    var resolved = jspmResolve.sync(pkgUrl + 'z');
    assert.equal(resolved.href, pkgUrl + 'a.json');

    var resolved = jspmResolve.sync(pkgUrl + 'z/a');
    assert.equal(resolved.href, pkgUrl + 'a/a.js');

    var resolved = jspmResolve.sync('p', pkgUrl);
    assert.equal(resolved.href, sfUrl + 'b.js');

    var resolved = jspmResolve.sync('p/b', pkgUrl);
    assert.equal(resolved.href, sfUrl + 'b/b.js');

    try {
      var resolved = jspmResolve.sync('./fail/x', pkgUrl);
      assert(false);
    }
    catch (e) {
      assert(true);
    }
  });
});
