const assert = require('assert');
const path = require('path');
const URL = require('url').URL;
const jspmResolve = require('../resolve.js');

const fixturesUrl = new URL('file:' + path.resolve(__dirname, 'fixtures') + '/').href;

suite('Standard Cases', () => {
  const sfUrl = fixturesUrl + 'standard-cases/';

  test('Extension cases', async () => {
    let resolved = await jspmResolve('./b', sfUrl);
    assert.equal(resolved.href, sfUrl + 'b.js');
  });
  test('Global map config', async () => {
    let resolved = await jspmResolve('a', sfUrl);
    assert.equal(resolved.href, sfUrl + 'b.js');
  });
});
