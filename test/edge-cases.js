import assert from 'assert';
import path from 'path';
import jspmResolve from '../resolve.js';
import { fileURLToPath } from 'url';

const winSepRegEx = /\\/g;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fixturesPath = path.resolve(__dirname, 'fixtures').replace(winSepRegEx, '/') + '/';
const nmPath = fixturesPath + 'node_modules/test/';
const pbPath = fixturesPath + 'project-boundaries' + '/';

suite('jspm project nesting', () => {
  test('Different forms', async () => {
    try {
      await jspmResolve('https://not-a-file/file');
    }
    catch (err) {
      assert.equal(err.code, 'MODULE_NAME_URL_NOT_FILE');
    }
  });

  test('Custom project folders', async () => {
    var { resolved } = await jspmResolve('x', pbPath);
    assert.equal(resolved, `${pbPath}x.js`);

    var { resolved } = await jspmResolve('x', pbPath, { env: { production: true } });
    assert.equal(resolved, `${pbPath}x.js`);

    var { resolved } = await jspmResolve('x', `${pbPath}config/`);
    assert.equal(resolved, `${pbPath}config/y.js`);

    var { resolved } = await jspmResolve('y', `${nmPath}config/`);
    assert.equal(resolved, `${nmPath}node_modules/y/index.js`);

    var { resolved } = await jspmResolve('y', `${nmPath}node_modules/`);
    assert.equal(resolved, `${nmPath}node_modules/y/index.js`);

    var { resolved } = await jspmResolve('y', `${nmPath}node_modules/y/path.sep`);
    assert.equal(resolved, `${nmPath}node_modules/y/index.js`);

    var { resolved } = await jspmResolve('y/', `${nmPath}node_modules/z/`);
    assert.equal(resolved, `${nmPath}node_modules/y/`);

    var { resolved } = await jspmResolve('fs', `${pbPath}jspm_packages/r/@a/c@v/index.js`);
    assert.equal(resolved, `${pbPath}jspm_packages/link/standard-cases@master/lib.js`);

    try {
      var { resolved } = await jspmResolve('z/', `${pbPath}config/node_modules/z/`);
      assert(false, 'Should error');
    }
    catch (e) {
      assert.equal(e.code, 'MODULE_NOT_FOUND');
    }

    try {
      var { resolved } = await jspmResolve(`${pbPath}config/node_modules/z/`);
      assert(false, 'Should error');
    }
    catch (e) {
      assert.equal(e.code, 'MODULE_NOT_FOUND');
    }
  });

  test('Linked project', async () => {
    var { resolved } = await jspmResolve('pkg/', pbPath);
    assert.equal(resolved, `${pbPath}jspm_packages/link/standard-cases@master/`);

    var { resolved } = await jspmResolve('pkg', `${pbPath}jspm_packages/link/standard-cases@master/`);
    assert.equal(resolved, `${pbPath}jspm_packages/r/@a/c@v/index.js`);
  });

});
