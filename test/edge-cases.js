const assert = require('assert');
const path = require('path');
const JspmResolver = require('../resolve.js');

const fixturesPath = path.resolve(__dirname, 'fixtures') + path.sep;
const pbPath = fixturesPath + 'project-boundaries' + path.sep;

suite('jspm project nesting', () => {
  const jspmResolve = new JspmResolver(pbPath);

  test('Custom project folders', async () => {
    var resolved = await jspmResolve.resolve('x', pbPath);
    assert.equal(resolved, path.join(pbPath, 'lib', 'x.js'));

    var resolved = await jspmResolve.resolve('x', pbPath, { production: true });
    assert.equal(resolved, path.join(pbPath, 'lib', 'x.js'));

    var resolved = await jspmResolve.resolve('x', pbPath + 'config' + path.sep);
    assert.equal(resolved, path.join(pbPath, 'lib', 'x.js'));

    var resolved = await jspmResolve.resolve('y', pbPath + 'config' + path.sep);
    assert.equal(resolved, path.join(pbPath, 'config', 'node_modules', 'y', 'index.js'));

    var resolved = await jspmResolve.resolve('y', path.join(pbPath,'config', 'node_modules') + path.sep);
    assert.equal(resolved, path.join(pbPath, 'config', 'node_modules', 'y', 'index.js'));

    var resolved = await jspmResolve.resolve('y', path.join(pbPath,'config', 'node_modules', 'y') + path.sep);
    assert.equal(resolved, path.join(pbPath, 'config', 'node_modules', 'y', 'index.js'));

    try {
      var resolved = await jspmResolve.resolve('y', path.join(pbPath,'config', 'node_modules', 'z') + path.sep)
      assert(false);
    }
    catch (e) {
      assert(e);
    }
  });

  test('Basic nesting rules', () => {
    //- jspm project nesting
    //- file directly in jspm_packages
    //- jspm project in jspm_packages
    //- package.json, jspm.json directly in package
  });
});

suite('Invalidation', () => {
  //- invalidation mid-resolve
});

suite('Mapping edge cases', () => {
  // do we want to support ".." segments in maps?
  // Note that NodeJS effectively permits this via require('x/y/../z') === require('x/z')
  // although not sure how common ecosystem use is... this may well be a deciding factor

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
