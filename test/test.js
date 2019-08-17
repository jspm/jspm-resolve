import Mocha from 'mocha';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { promises as fsPromises } from 'fs';

const { mkdir, readdir, symlink } = fsPromises;

(async () => {
  const __dirname = dirname(fileURLToPath(import.meta.url));

  try {
    await mkdir(__dirname + '/fixtures/project-boundaries/jspm_packages/link');
    await symlink('../../../standard-cases', __dirname + '/fixtures/project-boundaries/jspm_packages/link/standard-cases@master', 'junction');
  }
  catch (e) {
    if (e.code !== 'EEXIST')
      throw e;
  }

  const tests = (await readdir(__dirname)).filter(name => name.endsWith('.js'));
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
