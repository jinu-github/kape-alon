// Fail a deployment build early if native bcrypt was blocked or cannot load.
import bcrypt from 'bcrypt';
import { readFile } from 'node:fs/promises';
const manifest = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);
if (manifest.allowScripts?.['bcrypt@6.0.0'] !== true) {
  throw new Error(
    'Review and approve the locked bcrypt install script before deploying.',
  );
}
const password = 'deployment-native-module-check';
if (!(await bcrypt.compare(password, await bcrypt.hash(password, 4)))) {
  throw new Error('bcrypt native verification failed.');
}
console.log('bcrypt native hashing and comparison passed.');
