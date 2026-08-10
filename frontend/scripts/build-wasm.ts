import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(scriptDirectory, '..');
const repositoryDirectory = resolve(frontendDirectory, '..');
const outputDirectory = join(frontendDirectory, 'pkg');

if (existsSync(outputDirectory)) {
  rmSync(outputDirectory, { recursive: true, force: true });
}

const result = spawnSync(
  'wasm-pack',
  [
    'build',
    repositoryDirectory,
    '--target',
    'web',
    '--release',
    '--out-dir',
    outputDirectory,
    '--out-name',
    'bist',
  ],
  { cwd: repositoryDirectory, stdio: 'inherit' },
);

if (result.error) {
  const errorCode = 'code' in result.error ? result.error.code : undefined;
  const hint = errorCode === 'ENOENT'
    ? 'wasm-pack is required. Install it from https://rustwasm.github.io/wasm-pack/installer/.'
    : result.error.message;
  throw new Error(`Unable to build the WebAssembly package: ${hint}`);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
