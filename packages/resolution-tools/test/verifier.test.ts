import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { ResolveForgeConfig } from '../src/config.js';
import { EvidenceStore } from '../src/evidence-store.js';
import { hashPaths } from '../src/integrity.js';
import { runProcess } from '../src/process.js';
import { DiagnosticRunner } from '../src/reproduction.js';
import { TargetConfigSchema } from '../src/target-config.js';
import { CaseIdSchema, JobIdSchema, type JobRecord, type RouteEvidence } from '../src/types.js';
import { IndependentVerifier } from '../src/verifier.js';

const caseId = CaseIdSchema.parse('case_20260919210000000_1');
const jobId = JobIdSchema.parse('job_20260919210000000_1');

const passingEvidence: RouteEvidence = {
  route: 'backend_api',
  status: 'not_reproduced',
  expected_behavior: 'The endpoint returns the current value.',
  actual_behavior: 'The stale value is no longer returned.',
  steps: ['Request the endpoint.'],
  assertions: [{ name: 'current value', passed: true, detail: 'The current value was returned.' }],
  artifacts: [],
  diagnostics: {},
};

async function git(input: { args: string[]; cwd: string }): Promise<void> {
  const result = await runProcess({ command: 'git', args: input.args, cwd: input.cwd, timeoutMs: 5_000 });
  assert.equal(result.exitCode, 0, result.output);
}

async function fixture(input: { changedPath?: string; modifyProtected?: boolean; verificationExitCode?: number }) {
  const root = await mkdtemp(join(tmpdir(), 'resolveforge-verifier-'));
  const repositoryPath = join(root, 'repository');
  const worktreePath = join(root, 'worktree');
  const dataDir = join(root, 'data');
  await mkdir(join(repositoryPath, 'src'), { recursive: true });
  await mkdir(join(repositoryPath, 'test'), { recursive: true });
  await writeFile(join(repositoryPath, 'src', 'value.ts'), 'export const value = "old";\n');
  await writeFile(join(repositoryPath, 'test', 'acceptance.txt'), 'protected\n');
  await git({ args: ['init'], cwd: repositoryPath });
  await git({ args: ['config', 'user.email', 'resolveforge@example.com'], cwd: repositoryPath });
  await git({ args: ['config', 'user.name', 'ResolveForge'], cwd: repositoryPath });
  await git({ args: ['add', '.'], cwd: repositoryPath });
  await git({ args: ['commit', '-m', 'fixture'], cwd: repositoryPath });
  await git({ args: ['worktree', 'add', '--detach', worktreePath, 'HEAD'], cwd: repositoryPath });
  const changedPath = input.changedPath ?? 'src/value.ts';
  await writeFile(join(worktreePath, changedPath), 'changed\n');
  if (input.modifyProtected) {
    await writeFile(join(worktreePath, 'test', 'acceptance.txt'), 'weakened\n');
  }

  const targetConfig = TargetConfigSchema.parse({
    allowed_paths: ['src'],
    diagnostics: {
      backend_api: {
        command: process.execPath,
        args: ['-e', `process.stdout.write(${JSON.stringify(JSON.stringify(passingEvidence))})`],
      },
    },
    verification: {
      commands: [
        {
          command: process.execPath,
          args: ['-e', `process.exit(${String(input.verificationExitCode ?? 0)})`],
        },
      ],
      protected_paths: ['test'],
    },
  });
  const config: ResolveForgeConfig = {
    commandTimeoutMs: 5_000,
    coordinatorModel: null,
    dataDir,
    maxPatchAttempts: 2,
    mcpUrl: 'http://127.0.0.1:8787/mcp',
    port: 8787,
    targetRepo: repositoryPath,
    trueForgeUrl: 'http://127.0.0.1:8790',
    typeSafeApiKey: null,
  };
  const protectedTestsHash = await hashPaths(worktreePath, ['test']);
  const independentTestsHash = await hashPaths(repositoryPath, ['test']);
  const job: JobRecord = {
    job_id: jobId,
    case_id: caseId,
    issue: 'The API returns a stale value.',
    repository_path: repositoryPath,
    worktree_path: worktreePath,
    allowed_scopes: ['src'],
    protected_tests_hash: input.modifyProtected ? independentTestsHash : protectedTestsHash,
    independent_tests_hash: independentTestsHash,
    patch_attempt: 1,
    state: { kind: 'completed', completed_at: new Date().toISOString(), summary: 'patched' },
    events: [],
  };
  const evidenceStore = new EvidenceStore(dataDir);
  await evidenceStore.saveEvidence({
    case_id: caseId,
    issue: job.issue,
    routes: [
      {
        ...passingEvidence,
        status: 'reproduced',
        assertions: [{ name: 'current value', passed: false, detail: 'Received a stale value.' }],
      },
    ],
    created_at: new Date().toISOString(),
  });
  return {
    job,
    verifier: new IndependentVerifier(
      config,
      targetConfig,
      evidenceStore,
      new DiagnosticRunner(targetConfig, config.commandTimeoutMs),
    ),
  };
}

test('passes configured commands and the original diagnostic route', async () => {
  const { job, verifier } = await fixture({});
  const report = await verifier.verify(job);
  assert.equal(report.tests_passed, true);
  assert.deepEqual(report.changed_files, ['src/value.ts']);
});

test('rejects an out-of-scope patch', async () => {
  const { job, verifier } = await fixture({ changedPath: 'README.md' });
  const report = await verifier.verify(job);
  assert.equal(report.tests_passed, false);
  assert.equal(report.before_after['changed_files_within_allowed_scope'], false);
});

test('rejects modified protected tests', async () => {
  const { job, verifier } = await fixture({ modifyProtected: true });
  const report = await verifier.verify(job);
  assert.equal(report.tests_passed, false);
  assert.equal(report.protected_tests_unchanged, false);
});

test('rejects a failed verification command', async () => {
  const { job, verifier } = await fixture({ verificationExitCode: 1 });
  const report = await verifier.verify(job);
  assert.equal(report.tests_passed, false);
  assert.equal(report.command_results[0]?.exit_code, 1);
});
