import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  experimentConfigurationToUiState,
  parseExperimentBundle,
} from '../src/utils/experimentBundle';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultManifest = resolve(scriptDirectory, '../../examples/reference-experiments.txt');

const fail = (message: string): never => {
  throw new Error(`Release experiment import check failed: ${message}`);
};

const packageArgument = process.argv[2];
const manifestArgument = process.argv[3] ?? defaultManifest;
if (!packageArgument) {
  fail('usage: verify-release-experiments.ts PACKAGE_DIRECTORY [MANIFEST]');
}

const packageDirectory = realpathSync(resolve(packageArgument));
if (!statSync(packageDirectory).isDirectory()) {
  fail(`${packageDirectory} is not a directory`);
}

const manifestPath = realpathSync(resolve(manifestArgument));
const referencePaths = readFileSync(manifestPath, 'utf8')
  .split(/\r?\n/u)
  .map(line => line.trim())
  .filter(line => line.length > 0 && !line.startsWith('#'));

if (referencePaths.length === 0) fail('the reference manifest is empty');
if (new Set(referencePaths).size !== referencePaths.length) {
  fail('the reference manifest contains duplicate paths');
}

for (const referencePath of referencePaths) {
  if (isAbsolute(referencePath) || referencePath.split('/').includes('..')) {
    fail(`unsafe manifest path: ${referencePath}`);
  }
  if (!referencePath.startsWith('examples/experiments/') || !referencePath.endsWith('.json')) {
    fail(`reference path must name an experiment JSON file: ${referencePath}`);
  }
}

const shippedExperimentDirectory = resolve(packageDirectory, 'examples/experiments');
const shippedJsonPaths = readdirSync(shippedExperimentDirectory, { withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
  .map(entry => `examples/experiments/${entry.name}`)
  .sort();
const expectedPaths = [...referencePaths].sort();

if (JSON.stringify(shippedJsonPaths) !== JSON.stringify(expectedPaths)) {
  fail(
    `archive experiment inventory differs from the manifest; expected ${expectedPaths.join(', ')}, `
      + `found ${shippedJsonPaths.join(', ')}`,
  );
}

const experiments = referencePaths.map(referencePath => {
  const candidate = realpathSync(resolve(packageDirectory, referencePath));
  const packageRelativePath = relative(packageDirectory, candidate);
  if (packageRelativePath.startsWith(`..${sep}`) || packageRelativePath === '..') {
    fail(`reference resolves outside the unpacked package: ${referencePath}`);
  }

  const contents = readFileSync(candidate, 'utf8');
  const bundle = parseExperimentBundle(contents);
  const uiState = experimentConfigurationToUiState(bundle.configuration);
  if (uiState.dynamicSystem !== bundle.configuration.system.id) {
    fail(`${referencePath} changed system identity during UI-state import`);
  }

  return {
    path: referencePath,
    sha256: createHash('sha256').update(contents).digest('hex'),
    schemaVersion: bundle.schemaVersion,
    systemId: uiState.dynamicSystem,
    systemType: bundle.configuration.system.type,
    importPipeline: 'parseExperimentBundle -> experimentConfigurationToUiState',
    imported: true,
  };
});

process.stdout.write(`${JSON.stringify({
  manifest: relative(packageDirectory, manifestPath).startsWith('..')
    ? 'source:examples/reference-experiments.txt'
    : relative(packageDirectory, manifestPath),
  count: experiments.length,
  experiments,
}, null, 2)}\n`);
