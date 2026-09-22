import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { hashPaths } from '../src/integrity.js';
import { readTargetConfig, TargetConfigSchema } from '../src/target-config.js';

const validConfig = {
  allowed_paths: ['src', 'packages/api/src'],
  diagnostics: {
    backend_api: { command: 'pnpm', args: ['diagnose:api'] },
  },
  verification: {
    commands: [{ command: 'pnpm', args: ['test'] }],
    protected_paths: ['test/acceptance'],
  },
};

test('parses a reusable target configuration', () => {
  const parsed = TargetConfigSchema.parse(validConfig);
  assert.deepEqual(parsed.allowed_paths, ['src', 'packages/api/src']);
  assert.deepEqual(parsed.diagnostics.backend_api?.react_scan_artifacts, []);
});

test('rejects absolute paths and parent traversal', () => {
  assert.throws(() => TargetConfigSchema.parse({ ...validConfig, allowed_paths: ['../outside'] }));
  assert.throws(() => TargetConfigSchema.parse({ ...validConfig, allowed_paths: ['C:\\outside'] }));
  assert.throws(() =>
    TargetConfigSchema.parse({
      ...validConfig,
      verification: { ...validConfig.verification, protected_paths: ['/tmp/tests'] },
    }),
  );
});

test('reads configuration from the target repository', async () => {
  const repository = await mkdtemp(join(tmpdir(), 'resolveforge-config-'));
  await mkdir(join(repository, '.resolveforge'));
  await writeFile(join(repository, '.resolveforge', 'config.json'), JSON.stringify(validConfig));
  assert.deepEqual((await readTargetConfig(repository)).allowed_paths, validConfig.allowed_paths);
});

test('hashes configured protected files and directories', async () => {
  const repository = await mkdtemp(join(tmpdir(), 'resolveforge-hash-'));
  await mkdir(join(repository, 'test'));
  await writeFile(join(repository, 'test', 'acceptance.ts'), 'first');
  const before = await hashPaths(repository, ['test']);
  await writeFile(join(repository, 'test', 'acceptance.ts'), 'second');
  assert.notEqual(await hashPaths(repository, ['test']), before);
});
