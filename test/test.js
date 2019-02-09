import Mocha from 'mocha';

const tests = ['edge-cases.js', 'standard-cases.js'];

(async () => {
  const mocha = new Mocha({ ui: 'tdd' });

  for (const test of tests) {
    mocha.suite.emit('pre-require', global, test, mocha);
    await import('./' + test);
  }

  mocha.run();
})()
.catch(e => {
  console.error(e);
});
