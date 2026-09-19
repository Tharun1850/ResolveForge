import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import type { ResolveForgeConfig } from './config.js';
import { EvidenceStore } from './evidence-store.js';
import { runProcess } from './process.js';
import type { JobRecord, VerificationReport } from './types.js';
import { isAllowedChange } from './worktree.js';

const ACCEPTANCE_DIRECTORY = join('packages', 'resolution-tools', 'test', 'acceptance');
const ACCEPTANCE_SCRIPT = join(ACCEPTANCE_DIRECTORY, 'invoice.acceptance.ts');

async function filesBelow(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async entry => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return filesBelow(path);
      }
      return entry.isFile() ? [path] : [];
    }),
  );
  return nested.flat().sort();
}

async function hashDirectory(directory: string): Promise<string> {
  const hash = createHash('sha256');
  for (const path of await filesBelow(directory)) {
    hash.update(relative(directory, path));
    hash.update('\0');
    hash.update(await readFile(path));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function scenarioForIssue(issue: string): 'export' | 'tax' {
  const text = issue.toLowerCase();
  return text.includes('discount') || text.includes('tax') ? 'tax' : 'export';
}

export class IndependentVerifier {
  constructor(
    private readonly config: ResolveForgeConfig,
    private readonly evidenceStore: EvidenceStore,
  ) {}

  async verify(job: JobRecord): Promise<VerificationReport> {
    const protectedTests = join(job.worktree_path, ACCEPTANCE_DIRECTORY);
    const beforeHash = await hashDirectory(protectedTests);
    const status = await runProcess({
      command: 'git',
      args: ['-C', job.worktree_path, 'status', '--porcelain=v1', '--untracked-files=all', '--no-renames', '-z'],
      cwd: job.repository_path,
      timeoutMs: this.config.commandTimeoutMs,
    });
    if (status.exitCode !== 0) {
      throw new Error(`Could not inspect the patch. ${status.output}`);
    }
    const changedFiles = status.output
      .split('\0')
      .map(entry => entry.slice(3))
      .filter(Boolean);
    const scopeAllowed = changedFiles.every(changedFile =>
      isAllowedChange({ allowedScope: job.allowed_scope, changedFile }),
    );
    const acceptanceScript = join(job.repository_path, ACCEPTANCE_SCRIPT);
    const scenario = scenarioForIssue(job.issue);
    const acceptance = await runProcess({
      command: process.execPath,
      args: ['--import', 'tsx', acceptanceScript, job.worktree_path, scenario],
      cwd: job.repository_path,
      timeoutMs: this.config.commandTimeoutMs,
    });
    const afterHash = await hashDirectory(protectedTests);
    const outputPath = await this.evidenceStore.saveArtifact(
      job.case_id,
      `${job.job_id}-verification.log`,
      acceptance.output,
    );
    const protectedTestsUnchanged = beforeHash === afterHash;
    const testsPassed = acceptance.exitCode === 0 && scopeAllowed && protectedTestsUnchanged;

    return {
      case_id: job.case_id,
      job_id: job.job_id,
      patch_attempt: job.patch_attempt,
      tests_passed: testsPassed,
      original_scenarios_passed: acceptance.exitCode === 0,
      protected_tests_unchanged: protectedTestsUnchanged,
      changed_files: changedFiles,
      before_after: {
        protected_test_hash_before: beforeHash,
        protected_test_hash_after: afterHash,
        changed_files_within_allowed_scope: scopeAllowed,
        scenario,
      },
      command_results: [
        {
          command: [process.execPath, '--import', 'tsx', acceptanceScript, job.worktree_path, scenario],
          exit_code: acceptance.exitCode,
          output_path: outputPath,
        },
      ],
      created_at: new Date().toISOString(),
    };
  }
}
