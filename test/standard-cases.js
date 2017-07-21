const assert = require('assert');
const path = require('path');
const JspmResolver = require('../resolve.js');
const jspmResolve = new JspmResolver(path.resolve(__dirname, 'fixtures', 'standard-cases'));

const fixturesPath = path.resolve(__dirname, 'fixtures') + path.sep;
const nodePath = path.resolve(__dirname, '../node_modules');
const sfPath = fixturesPath + 'standard-cases' + path.sep;
const pPath = sfPath + 'jspm_packages' + path.sep;
const pkgPath = path.join(sfPath, 'jspm_packages', 'ra', 'pkg@version', path.sep);
const pkg2Path = path.join(sfPath, 'jspm_packages', 'ra', 'pkg@version2', path.sep);

suite('Standard Cases', () => {
  test('Extension cases', async () => {
    var resolved = await jspmResolve.resolve('./b', sfPath);
    assert.equal(resolved, path.join(sfPath, 'b.js'));

    var resolved = await jspmResolve.resolve('./b', sfPath + 'sub/');
    assert.equal(resolved, path.join(sfPath, 'sub', 'b.js'));

    var resolved = await jspmResolve.resolve('./c', sfPath);
    assert.equal(resolved, path.join(sfPath, 'c.json'));

    var resolved = await jspmResolve.resolve('./d', sfPath);
    assert.equal(resolved, path.join(sfPath, 'd', 'index.js'));

    var resolved = await jspmResolve.resolve('./e', sfPath);
    assert.equal(resolved, path.join(sfPath, 'e', 'index.json'));
  });

  test('Global map config', async () => {
    var resolved = await jspmResolve.resolve('a', sfPath);
    assert.equal(resolved, path.join(sfPath, 'b.js'));

    var resolved = await jspmResolve.resolve('a/', sfPath);
    assert.equal(resolved, path.join(sfPath, 'b') + path.sep);

    var resolved = await jspmResolve.resolve('a/b', sfPath);
    assert.equal(resolved, path.join(sfPath, 'b', 'b.js'));

    var resolved = await jspmResolve.resolve('a/c/b', sfPath);
    assert.equal(resolved, path.join(sfPath, 'b', 'b.js'));

    var resolved = await jspmResolve.resolve('./rel', sfPath);
    assert.equal(resolved, path.join(sfPath, 'd', 'index.js'));

    var resolved = await jspmResolve.resolve(path.join(sfPath, 'rel'), 'file:///');
    assert.equal(resolved, path.join(sfPath, 'd', 'index.js'));

    try {
      var resolved = await jspmResolve.resolve('./fail', sfPath);
      assert(false);
    }
    catch (e) {
      assert(true);
    }
  });

  test('Package loading', async () => {
    var resolved = await jspmResolve.resolve('ra:pkg@version', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version', 'index.js'));

    var resolved = await jspmResolve.resolve('ra:pkg@version/', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version') + path.sep);

    var resolved = await jspmResolve.resolve('ra:pkg@version/a', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version', 'a.json'));

    var resolved = await jspmResolve.resolve('pkg', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version', 'index.js'));

    var resolved = await jspmResolve.resolve('pkg/', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version') + path.sep);

    var resolved = await jspmResolve.resolve('pkg/a', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version', 'a.json'));

    try {
      var resolved = await jspmResolve.resolve('p/b', sfPath);
      assert(false);
    }
    catch (e) {
      assert(e.toString().includes('pkg@version/b not found.'));
    }
  });

  test('Package-relative loading', async () => {
    var resolved = await jspmResolve.resolve('./a', pkgPath);
    assert.equal(resolved, pkgPath + 'a.json');

    var resolved = await jspmResolve.resolve('x', pkgPath);
    assert.equal(resolved, pkgPath + 'y.js');

    var resolved = await jspmResolve.resolve('./z', pkgPath);
    assert.equal(resolved, pkgPath + 'a.json');

    var resolved = await jspmResolve.resolve('./z/a', pkgPath);
    assert.equal(resolved, path.join(pkgPath, 'a', 'a.js'));

    var resolved = await jspmResolve.resolve('../z', pkgPath + 'x/y');
    assert.equal(resolved, pkgPath + 'a.json');

    var resolved = await jspmResolve.resolve('../../z', pkgPath + 'x/y/z');
    assert.equal(resolved, pkgPath + 'a.json');

    var resolved = await jspmResolve.resolve(pkgPath + 'z');
    assert.equal(resolved, pkgPath + 'a.json');

    var resolved = await jspmResolve.resolve(pkgPath + 'z/a');
    assert.equal(resolved, path.join(pkgPath, 'a', 'a.js'));

    var resolved = await jspmResolve.resolve('p', pkgPath);
    assert.equal(resolved, path.join(pkg2Path, 'a.js'));

    var resolved = await jspmResolve.resolve('p/b', pkgPath);
    assert.equal(resolved, path.join(pkg2Path, 'b.js'));

    try {
      var resolved = await jspmResolve.resolve('./fail/x', pkgPath);
      assert(false);
    }
    catch (e) {
      assert(true);
    }
  });

  test('Cross-package resolves', async () => {
    var resolved = await jspmResolve.resolve('ra:pkg@version2', sfPath);
    assert.equal(resolved, pkg2Path + 'a.js');

    var resolved = await jspmResolve.resolve('pkg2/a', sfPath);
    assert.equal(resolved, pkg2Path + 'b.js');
  });

  test('Conditional maps', async () => {
    var resolved = await jspmResolve.resolve('c', sfPath);
    assert.equal(resolved, sfPath + 'c-node.js');

    var resolved = await jspmResolve.resolve('c', sfPath, { browser: true });
    assert.equal(resolved, sfPath + 'c-browser.js');

    try {
      var resolved = await jspmResolve.resolve('c', sfPath, { browser: false, node: false });
    }
    catch (e) {
      assert(e.message.indexOf('Cannot find module \'c\'') !== -1);
    }

    var resolved = await jspmResolve.resolve('c/a', sfPath);
    assert.equal(resolved, path.join(sfPath, 'c-node', 'a.js'));

    var resolved = await jspmResolve.resolve('c', pkgPath);
    assert.equal(resolved, pkgPath + 'c-node.js');
  });

  test('Node Resolution fallback', async () => {
    var resolved = await jspmResolve.resolve('resolve', sfPath);
    assert.equal(resolved, path.join(nodePath, 'resolve', 'index.js'));

    var resolved = await jspmResolve.resolve('resolve/index', sfPath);
    assert.equal(resolved, path.join(nodePath, 'resolve', 'index.js'));

    try {
      var resolved = await jspmResolve.resolve('resolve/', sfPath);
      assert(false);
    }
    catch (e) {
      assert(e);
    }

    try {
      var resolved = await jspmResolve.resolve('fs', sfPath);
      assert(false);
    }
    catch (e) {
      assert(e);
    }
  });

  test('Empty module', async () => {
    var resolved = await jspmResolve.resolve('@empty', sfPath);
    assert.equal(resolved, undefined);
  });

  test('Cross-project resolution', async () => {
    let subResolve = new JspmResolver(path.join(sfPath, 'sub'));
    var resolved = await subResolve.resolve(sfPath + 'sub/c', sfPath);
    assert.equal(resolved, path.join(sfPath, 'sub', 'b.js'));

    var resolved = await subResolve.resolve('sr:p@1/main', sfPath + 'sub/');
    assert.equal(resolved, path.join(sfPath, 'sub', 'jspm_packages', 'sr', 'p@1', 'main.js'));

    var resolved = await subResolve.resolve('pkg', sfPath);
    assert.equal(resolved, path.join(sfPath, 'jspm_packages', 'ra', 'pkg@version', 'index.js'));
  });
});

suite('Standard Cases Sync', () => {

  test('Extension cases', () => {
    var resolved = jspmResolve.resolveSync('./b', sfPath);
    assert.equal(resolved, path.join(sfPath, 'b.js'));

    var resolved = jspmResolve.resolveSync('./b', sfPath + 'sub/');
    assert.equal(resolved, path.join(sfPath, 'sub', 'b.js'));

    var resolved = jspmResolve.resolveSync('./c', sfPath);
    assert.equal(resolved, path.join(sfPath, 'c.json'));

    var resolved = jspmResolve.resolveSync('./d', sfPath);
    assert.equal(resolved, path.join(sfPath, 'd', 'index.js'));

    var resolved = jspmResolve.resolveSync('./e', sfPath);
    assert.equal(resolved, path.join(sfPath, 'e', 'index.json'));
  });

  test('Global map config', () => {
    var resolved = jspmResolve.resolveSync('a', sfPath);
    assert.equal(resolved, path.join(sfPath, 'b.js'));

    var resolved = jspmResolve.resolveSync('a/', sfPath);
    assert.equal(resolved, path.join(sfPath, 'b') + path.sep);

    var resolved = jspmResolve.resolveSync('a/b', sfPath);
    assert.equal(resolved, path.join(sfPath, 'b', 'b.js'));

    var resolved = jspmResolve.resolveSync('a/c/b', sfPath);
    assert.equal(resolved, path.join(sfPath, 'b', 'b.js'));

    var resolved = jspmResolve.resolveSync('./rel', sfPath);
    assert.equal(resolved, path.join(sfPath, 'd', 'index.js'));

    var resolved = jspmResolve.resolveSync(path.join(sfPath, 'rel'), 'file:///');
    assert.equal(resolved, path.join(sfPath, 'd', 'index.js'));

    try {
      var resolved = jspmResolve.resolveSync('./fail', sfPath);
      assert(false);
    }
    catch (e) {
      assert(true);
    }
  });

  test('Package loading', () => {
    var resolved = jspmResolve.resolveSync('ra:pkg@version', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version', 'index.js'));

    var resolved = jspmResolve.resolveSync('ra:pkg@version/', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version') + path.sep);

    var resolved = jspmResolve.resolveSync('ra:pkg@version/a', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version', 'a.json'));

    var resolved = jspmResolve.resolveSync('pkg', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version', 'index.js'));

    var resolved = jspmResolve.resolveSync('pkg/', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version') + path.sep);

    var resolved = jspmResolve.resolveSync('pkg/a', sfPath);
    assert.equal(resolved, path.join(pPath, 'ra', 'pkg@version', 'a.json'));

    try {
      var resolved = jspmResolve.resolveSync('p/b', sfPath);
      assert(false);
    }
    catch (e) {
      assert(e.toString().includes('pkg@version/b not found.'));
    }
  });

  test('Package-relative loading', () => {
    var resolved = jspmResolve.resolveSync('./a', pkgPath);
    assert.equal(resolved, pkgPath + 'a.json');

    var resolved = jspmResolve.resolveSync('x', pkgPath);
    assert.equal(resolved, pkgPath + 'y.js');

    var resolved = jspmResolve.resolveSync('./z', pkgPath);
    assert.equal(resolved, pkgPath + 'a.json');

    var resolved = jspmResolve.resolveSync('./z/a', pkgPath);
    assert.equal(resolved, path.join(pkgPath, 'a', 'a.js'));

    var resolved = jspmResolve.resolveSync('../z', pkgPath + 'x/y');
    assert.equal(resolved, pkgPath + 'a.json');

    var resolved = jspmResolve.resolveSync('../../z', pkgPath + 'x/y/z');
    assert.equal(resolved, pkgPath + 'a.json');

    var resolved = jspmResolve.resolveSync(pkgPath + 'z');
    assert.equal(resolved, pkgPath + 'a.json');

    var resolved = jspmResolve.resolveSync(pkgPath + 'z/a');
    assert.equal(resolved, path.join(pkgPath, 'a', 'a.js'));

    var resolved = jspmResolve.resolveSync('p', pkgPath);
    assert.equal(resolved, path.join(pkg2Path, 'a.js'));

    var resolved = jspmResolve.resolveSync('p/b', pkgPath);
    assert.equal(resolved, path.join(pkg2Path, 'b.js'));

    try {
      var resolved = jspmResolve.resolveSync('./fail/x', pkgPath);
      assert(false);
    }
    catch (e) {
      assert(true);
    }
  });

  test('Cross-package resolves', () => {
    var resolved = jspmResolve.resolveSync('ra:pkg@version2', sfPath);
    assert.equal(resolved, pkg2Path + 'a.js');

    var resolved = jspmResolve.resolveSync('pkg2/a', sfPath);
    assert.equal(resolved, pkg2Path + 'b.js');
  });

  test('Conditional maps', () => {
    var resolved = jspmResolve.resolveSync('c', sfPath);
    assert.equal(resolved, sfPath + 'c-node.js');

    var resolved = jspmResolve.resolveSync('c', sfPath, { browser: true });
    assert.equal(resolved, sfPath + 'c-browser.js');

    try {
      var resolved = jspmResolve.resolveSync('c', sfPath, { browser: false, node: false });
    }
    catch (e) {
      assert(e.message.indexOf('Cannot find module \'c\'') !== -1);
    }

    var resolved = jspmResolve.resolveSync('c/a', sfPath);
    assert.equal(resolved, path.join(sfPath, 'c-node', 'a.js'));

    var resolved = jspmResolve.resolveSync('c', pkgPath);
    assert.equal(resolved, pkgPath + 'c-node.js');
  });

  test('Node Resolution fallback', () => {
    var resolved = jspmResolve.resolveSync('resolve', sfPath);
    assert.equal(resolved, path.join(nodePath, 'resolve', 'index.js'));

    var resolved = jspmResolve.resolveSync('resolve/index', sfPath);
    assert.equal(resolved, path.join(nodePath, 'resolve', 'index.js'));

    try {
      var resolved = jspmResolve.resolveSync('resolve/', sfPath);
      assert(false);
    }
    catch (e) {
      assert(e);
    }

    try {
      var resolved = jspmResolve.resolveSync('fs', sfPath);
      assert(false);
    }
    catch (e) {
      assert(e);
    }
  });

  test('Empty module', () => {
    var resolved = jspmResolve.resolveSync('@empty', sfPath);
    assert.equal(resolved, undefined);
  });

  test('Cross-project resolution', () => {
    let subResolve = new JspmResolver(path.join(sfPath, 'sub'));
    var resolved = subResolve.resolveSync(sfPath + 'sub/c', sfPath);
    assert.equal(resolved, path.join(sfPath, 'sub', 'b.js'));

    var resolved = subResolve.resolveSync('sr:p@1/main', sfPath + 'sub/');
    assert.equal(resolved, path.join(sfPath, 'sub', 'jspm_packages', 'sr', 'p@1', 'main.js'));

    var resolved = subResolve.resolveSync('pkg', sfPath);
    assert.equal(resolved, path.join(sfPath, 'jspm_packages', 'ra', 'pkg@version', 'index.js'));
  });
});