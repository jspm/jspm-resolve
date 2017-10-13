const assert = require('assert');
const path = require('path');
const JspmResolver = require('../resolve.js');
const jspmResolve = new JspmResolver(path.resolve(__dirname, 'fixtures', 'standard-cases'));

const winSepRegEx = /\\/g;
const fixturesPath = path.resolve(__dirname, 'fixtures').replace(winSepRegEx, '/') + '/';
const nodePath = path.resolve(__dirname, '../node_modules').replace(winSepRegEx, '/') + '/';
const sfPath = `${fixturesPath}standard-cases/`;
const pPath = `${sfPath}jspm_packages/`;
const pkgPath = `${sfPath}jspm_packages/ra/pkg@version/`;
const pkg2Path = `${sfPath}jspm_packages/ra/pkg@version2/`;

suite('Standard Cases', () => {
  test.skip('Extension cases', async () => {
    var { resolved } = await jspmResolve.resolve('./b', sfPath);
    assert.equal(resolved, `${sfPath}b.js`);

    var { resolved } = await jspmResolve.resolve('./b', sfPath + 'sub/');
    assert.equal(resolved, `${sfPath}sub/b.js`);

    var { resolved } = await jspmResolve.resolve('./c', sfPath);
    assert.equal(resolved, `${sfPath}c.json`);

    var { resolved } = await jspmResolve.resolve('./d', sfPath);
    assert.equal(resolved, `${sfPath}d/index.js`);

    var { resolved } = await jspmResolve.resolve('./e', sfPath);
    assert.equal(resolved, `${sfPath}e/index.json`);
  });

  test.skip('Global map config', async () => {
    var { resolved } = await jspmResolve.resolve('a', sfPath);
    assert.equal(resolved, `${sfPath}b.js`);

    var { resolved } = await jspmResolve.resolve('a/', sfPath);
    assert.equal(resolved, `${sfPath}b/`);

    var { resolved } = await jspmResolve.resolve('a/b', sfPath);
    assert.equal(resolved, `${sfPath}b/b.js`);

    var { resolved } = await jspmResolve.resolve('a/c/b', sfPath);
    assert.equal(resolved, `${sfPath}b/b.js`);

    var { resolved } = await jspmResolve.resolve('./rel', sfPath);
    assert.equal(resolved, `${sfPath}d/index.js`);

    var { resolved } = await jspmResolve.resolve(`/${sfPath}rel`, 'file:///');
    assert.equal(resolved, `${sfPath}d/index.js`);

    try {
      var { resolved } = await jspmResolve.resolve('./fail', sfPath);
      assert(false);
    }
    catch (e) {
      assert(true);
    }
  });

  
  test.skip('Package loading', async () => {
    var { resolved } = await jspmResolve.resolve('ra:pkg@version', sfPath);
    assert.equal(resolved, `${pPath}ra/pkg@version/index.js`);

    var { resolved } = await jspmResolve.resolve('ra:pkg@version/', sfPath);
    assert.equal(resolved, `${pPath}ra/pkg@version/`);

    var { resolved } = await jspmResolve.resolve('ra:pkg@version/a', sfPath);
    assert.equal(resolved, `${pPath}ra/pkg@version/a.json`);

    var { resolved } = await jspmResolve.resolve('pkg', sfPath);
    assert.equal(resolved, `${pPath}ra/pkg@version/index.js`);

    var { resolved } = await jspmResolve.resolve('pkg/', sfPath);
    assert.equal(resolved, `${pPath}ra/pkg@version/`);

    var { resolved } = await jspmResolve.resolve('pkg/a', sfPath);
    assert.equal(resolved, `${pPath}ra/pkg@version/a.json`);

    try {
      var { resolved } = await jspmResolve.resolve('p/b', sfPath);
      assert(false);
    }
    catch (e) {
      assert(e.toString().includes('pkg@version/b not found.'));
    }
  });

  test.skip('Package-relative loading', async () => {
    var { resolved } = await jspmResolve.resolve('./a', pkgPath);
    assert.equal(resolved, `${pkgPath}a.json`);

    var { resolved } = await jspmResolve.resolve('x', pkgPath);
    assert.equal(resolved, `${pkgPath}y.js`);

    var { resolved } = await jspmResolve.resolve('./z', pkgPath);
    assert.equal(resolved, `${pkgPath}a.json`);

    var { resolved } = await jspmResolve.resolve('./z/a', pkgPath);
    assert.equal(resolved, `${pkgPath}a/a.js`);

    var { resolved } = await jspmResolve.resolve('../z', pkgPath + 'x/y');
    assert.equal(resolved, `${pkgPath}a.json`);

    var { resolved } = await jspmResolve.resolve('../../z', pkgPath + 'x/y/z');
    assert.equal(resolved, `${pkgPath}a.json`);

    var { resolved } = await jspmResolve.resolve('/' + pkgPath + 'z');
    assert.equal(resolved, `${pkgPath}a.json`);

    var { resolved } = await jspmResolve.resolve('/' + pkgPath + 'z/a');
    assert.equal(resolved, `${pkgPath}a/a.js`);

    var { resolved } = await jspmResolve.resolve('p', pkgPath);
    assert.equal(resolved, `${pkg2Path}a.js`);

    var { resolved } = await jspmResolve.resolve('p/b', pkgPath);
    assert.equal(resolved, `${pkg2Path}b.js`);

    try {
      var { resolved } = await jspmResolve.resolve('./fail/x', pkgPath);
      assert(false);
    }
    catch (e) {
      assert(true);
    }
  });
  
  test.skip('Cross-package resolves', async () => {
    var { resolved } = await jspmResolve.resolve('ra:pkg@version2', sfPath);
    assert.equal(resolved, pkg2Path + 'a.js');

    var { resolved } = await jspmResolve.resolve('pkg2/a', sfPath);
    assert.equal(resolved, pkg2Path + 'b.js');
  });

  test.skip('Conditional maps', async () => {
    var { resolved } = await jspmResolve.resolve('c', sfPath);
    assert.equal(resolved, sfPath + 'c-node.js');

    var { resolved } = await jspmResolve.resolve('c', sfPath, { browser: true });
    assert.equal(resolved, sfPath + 'c-browser.js');

    try {
      var { resolved } = await jspmResolve.resolve('c', sfPath, { browser: false, node: false });
    }
    catch (e) {
      assert(e.message.indexOf('Cannot find module c') !== -1);
    }

    var { resolved } = await jspmResolve.resolve('c/a', sfPath);
    assert.equal(resolved, `${sfPath}c-node/a.js`);

    var { resolved } = await jspmResolve.resolve('c', pkgPath);
    assert.equal(resolved, pkgPath + 'c-node.js');
  });

  test.skip('Node Resolution fallback', async () => {
    var { resolved } = await jspmResolve.resolve('mocha', sfPath);
    assert.equal(resolved, `${nodePath}mocha/index.js`);

    var { resolved } = await jspmResolve.resolve('mocha/index', sfPath);
    assert.equal(resolved, `${nodePath}mocha/index.js`);

    var { resolved } = await jspmResolve.resolve('mocha/', sfPath);
    assert.equal(resolved,  `${nodePath}mocha/`);

    var { resolved, format } = await jspmResolve.resolve('fs', sfPath);
    assert.equal(resolved, 'fs');
    assert.equal(format, 'builtin');

    try {
      var { resolved } = await jspmResolve.resolve('thing', sfPath);
    }
    catch (e) {
      assert.equal(e.code, 'MODULE_NOT_FOUND');
      return false;
    }
    assert(false);
  });

  test.skip('Empty module', async () => {
    var { resolved } = await jspmResolve.resolve('@empty', sfPath);
    assert.equal(resolved, undefined);
  });

  test('Cross-project resolution', async () => {
    let subResolve = new JspmResolver(path.join(sfPath, 'sub'));
    /*var { resolved } = await subResolve.resolve(`/${sfPath}sub/c`, sfPath);
    assert.equal(resolved, `${sfPath}sub/b.js`);

    var { resolved } = await subResolve.resolve('sr:p@1/main', sfPath + 'sub/');
    assert.equal(resolved, `${sfPath}sub/jspm_packages/sr/p@1/main.js`); */

    var { resolved } = await subResolve.resolve('pkg', sfPath);
    assert.equal(resolved, `${sfPath}jspm_packages/ra/pkg@version/index.js`);
  });
  
  test.skip('Module format', async () => {
    var { resolved, format } = await jspmResolve.resolve('pkg');
    assert.equal(format, 'cjs');

    var { resolved, format } = await jspmResolve.resolve('pkg2');
    assert.equal(format, 'esm');

    var { resolved, format } = await jspmResolve.resolve('../../../resolve.js');
    assert.equal(format, 'cjs');
  });
});

suite.skip('Standard Cases Sync', () => {

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

  test('Module format', async () => {
    let pkgAModule = jspmResolve.resolveSync('pkg');
    assert.equal(jspmResolve.isCommonJSSync(pkgAModule), true);

    let pkgBModule = jspmResolve.resolveSync('pkg2');
    assert.equal(jspmResolve.isCommonJSSync(pkgBModule), false);

    let outerModule = jspmResolve.resolveSync('../../../resolve.js');
    assert.equal(jspmResolve.isCommonJSSync(outerModule), true);
  });
});