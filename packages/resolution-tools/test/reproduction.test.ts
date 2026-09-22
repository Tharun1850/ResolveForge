import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { DiagnosticRunner } from '../src/reproduction.js';
import { TargetConfigSchema } from '../src/target-config.js';
import { CaseIdSchema, type RouteEvidence } from '../src/types.js';

const caseId = CaseIdSchema.parse('case_20260919210000000_1');

function evidence(route: RouteEvidence['route']): RouteEvidence {
  return {
    route,
    status: 'reproduced',
    expected_behavior: 'The response contains the current value.',
    actual_behavior: 'The response contains a stale value.',
    steps: ['Request the endpoint.'],
    assertions: [{ name: 'current value', passed: false, detail: 'Received a stale value.' }],
    artifacts: [],
    diagnostics: { source: 'target-adapter' },
  };
}

function targetConfig(diagnostics: Record<string, unknown>) {
  return TargetConfigSchema.parse({
    allowed_paths: ['src'],
    diagnostics,
    verification: {
      commands: [{ command: process.execPath, args: ['-e', 'process.exit(0)'] }],
      protected_paths: ['test'],
    },
  });
}

test('missing adapters return not_reproduced evidence', async () => {
  const repository = await mkdtemp(join(tmpdir(), 'resolveforge-reproduction-'));
  const runner = new DiagnosticRunner(targetConfig({}), 5_000);
  const result = await runner.run({
    caseId,
    issue: 'stale API value',
    route: 'backend_api',
    workingDirectory: repository,
  });
  assert.equal(result.status, 'not_reproduced');
  assert.equal(result.assertions.length, 0);
});

test('malformed adapter output cannot become evidence', async () => {
  const repository = await mkdtemp(join(tmpdir(), 'resolveforge-reproduction-'));
  const runner = new DiagnosticRunner(
    targetConfig({ backend_api: { command: process.execPath, args: ['-e', "process.stdout.write('invalid')"] } }),
    5_000,
  );
  const result = await runner.run({
    caseId,
    issue: 'stale API value',
    route: 'backend_api',
    workingDirectory: repository,
  });
  assert.equal(result.status, 'not_reproduced');
  assert.match(result.actual_behavior, /valid JSON/);
});

test('valid adapters return evidence and collect configured React Scan artifacts', async () => {
  const repository = await mkdtemp(join(tmpdir(), 'resolveforge-reproduction-'));
  const routeEvidence = evidence('react_ui');
  const script = [
    "require('node:fs').writeFileSync('.react-scan.json', '{}')",
    `process.stdout.write(${JSON.stringify(JSON.stringify(routeEvidence))})`,
  ].join(';');
  const runner = new DiagnosticRunner(
    targetConfig({
      react_ui: {
        command: process.execPath,
        args: ['-e', script],
        react_scan_artifacts: ['.react-scan.json'],
      },
    }),
    5_000,
  );
  const result = await runner.run({ caseId, issue: 'slow render', route: 'react_ui', workingDirectory: repository });
  assert.equal(result.status, 'reproduced');
  assert.deepEqual(result.artifacts, [{ kind: 'react_scan', path: '.react-scan.json' }]);
});
