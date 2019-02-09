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
      assert.equal(err.code, 'MODULE_NAME_URL_NOT_FILE')
    }
  });

  test('Custom project folders', async () => {
    var { resolved } = await jspmResolve('x', pbPath);
    assert.equal(resolved, `${pbPath}x.js`);

    var { resolved } = await jspmResolve('x', pbPath, { env: { production: true } });
    assert.equal(resolved, `${pbPath}x.js`);

    var { resolved } = await jspmResolve('x', `${pbPath}config/`);
    assert.equal(resolved, `${pbPath}x.js`);

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

    var { resolved } = jspmResolve.sync(`${pbPath}config/node_modules/z/`);
    assert.equal(resolved, `${pbPath}config/node_modules/z/`);
  });

  test('Linked project', async () => {
    var { resolved } = await jspmResolve('pkg/', pbPath);
    assert.equal(resolved, `${pbPath}jspm_packages/link/standard-cases@master/`);

    try {
      await jspmResolve('pkg', `${pbPath}jspm_packages/link/standard-cases@master/`);
      assert(false);
    }
    catch (e) {
      assert.equal(e.code, 'INVALID_MODULE_NAME');
    }
  });

  test('Basic nesting rules', () => {
    //- jspm project nesting
    //- file directly in jspm_packages
    //- jspm project in jspm_packages
    //- package.json, jspm.json directly in package
  });
});

suite('Mapping edge cases', () => {

  // ".." and "." segments in package names must not be supported as would enable package boundary backtracking
  // can be detected with a simple validation - first checking \\ and throwing for that, then checking /\/..?(\/|$)/



  //- mapping into an absolute URL
  //- mapping into a backtracking URL
  //- mapping into a /-relative URL
  //- mapping into an exact package with a backtrack path
  //- all map variations with backtracking segments after the match component
  //- empty being returned
});

suite('Relative map edge cases', () => {
  //- testing edge cases around rel maps into './asdf/../../', where reaching into something else (this reaching in the first place is what doesn't go through further rel maps though, direct reaching does)
  //- reaching from one jspm project into another, seeing rel maps apply
  //- including the above case reading into another project
});

suite('Encoding', () => {
  //- registry import with registry as capital case (plus invalid registry characters)
  //- careful encoding tests, ensuring all 4 resolve variations handle surjection of encodings
  //- version encoding through dependencies map handling
});
