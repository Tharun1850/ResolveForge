import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ResolveForgeConfig } from './config.js';
import { EvidenceStore } from './evidence-store.js';
import { ACCEPTANCE_DIRECTORY, ACCEPTANCE_SCRIPT, hashDirectory, hashText } from './integrity.js';
import { runProcess } from './process.js';
import type { JobRecord, VerificationReport } from './types.js';
import { isAllowedChange } from './worktree.js';

const TSX_LOADER = join('packages', 'resolution-tools', 'node_modules', 'tsx', 'dist', 'loader.mjs');

interface PatchSnapshot {
  changedFiles: string[];
  fingerprint: string;
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

  async fingerprint(job: JobRecord): Promise<string> {
    return (await this.inspectPatch(job)).fingerprint;
  }

  async patchText(job: JobRecord): Promise<string> {
    const diff = await runProcess({
      command: 'git',
      args: ['-C', job.worktree_path, 'diff', '--no-ext-diff', 'HEAD'],
      cwd: job.repository_path,
      timeoutMs: this.config.commandTimeoutMs,
    });
    if (diff.exitCode !== 0) {
      throw new Error(`Could not read the patch. ${diff.output}`);
    }
    const status = await runProcess({
      command: 'git',
      args: ['-C', job.worktree_path, 'status', '--porcelain=v1', '--untracked-files=all', '--no-renames', '-z'],
      cwd: job.repository_path,
      timeoutMs: this.config.commandTimeoutMs,
    });
    if (status.exitCode !== 0) {
      throw new Error(`Could not inspect untracked patch files. ${status.output}`);
    }
    const untrackedFiles = status.output
      .split('\0')
      .filter(entry => entry.startsWith('?? '))
      .map(entry => entry.slice(3));
    const untrackedContent = await Promise.all(
      untrackedFiles.map(
        async path => `\n--- untracked ${path}\n${await readFile(join(job.worktree_path, path), 'utf8')}`,
      ),
    );
    return `${diff.output}${untrackedContent.join('')}`;
  }

  async verify(job: JobRecord): Promise<VerificationReport> {
    const protectedTests = join(job.worktree_path, ACCEPTANCE_DIRECTORY);
    const snapshot = await this.inspectPatch(job);
    const currentIndependentHash = await hashDirectory(join(job.repository_path, ACCEPTANCE_DIRECTORY));
    const independentTestsUnchanged = currentIndependentHash === job.independent_tests_hash;
    const scopeAllowed = snapshot.changedFiles.every(changedFile =>
      isAllowedChange({ allowedScope: job.allowed_scope, changedFile }),
    );
    const scenario = scenarioForIssue(job.issue);
    const acceptance = await this.runAcceptance({ independentTestsUnchanged, job, scenario });
    const afterProtectedHash = await hashDirectory(protectedTests);
    const protectedTestsUnchanged = afterProtectedHash === job.protected_tests_hash;
    const outputPath = await this.evidenceStore.saveArtifact(
      job.case_id,
      `${job.job_id}-verification.log`,
      acceptance.output,
    );
    const testsPassed =
      acceptance.exitCode === 0 && scopeAllowed && protectedTestsUnchanged && independentTestsUnchanged;

    return {
      case_id: job.case_id,
      job_id: job.job_id,
      patch_attempt: job.patch_attempt,
      tests_passed: testsPassed,
      original_scenarios_passed: acceptance.exitCode === 0 && independentTestsUnchanged,
      protected_tests_unchanged: protectedTestsUnchanged,
      independent_tests_unchanged: independentTestsUnchanged,
      patch_fingerprint: snapshot.fingerprint,
      changed_files: snapshot.changedFiles,
      before_after: {
        protected_test_hash_before: job.protected_tests_hash,
        protected_test_hash_after: afterProtectedHash,
        independent_test_hash_before: job.independent_tests_hash,
        independent_test_hash_after: currentIndependentHash,
        changed_files_within_allowed_scope: scopeAllowed,
        scenario,
      },
      command_results: [
        {
          command: [
            process.execPath,
            '--import',
            join(job.repository_path, TSX_LOADER),
            join(job.repository_path, ACCEPTANCE_SCRIPT),
            job.worktree_path,
            scenario,
          ],
          exit_code: acceptance.exitCode,
          output_path: outputPath,
        },
      ],
      created_at: new Date().toISOString(),
    };
  }

  private async inspectPatch(job: JobRecord): Promise<PatchSnapshot> {
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
    return { changedFiles, fingerprint: hashText(`${status.output}\0${await this.patchText(job)}`) };
  }

  private async runAcceptance(input: {
    independentTestsUnchanged: boolean;
    job: JobRecord;
    scenario: 'export' | 'tax';
  }) {
    if (!input.independentTestsUnchanged) {
      return {
        exitCode: 1,
        output:
          'Independent acceptance files changed after the patch attempt started. The scenario was not executed.\n',
      };
    }
    const acceptanceScript = join(input.job.repository_path, ACCEPTANCE_SCRIPT);
    const tsxLoader = join(input.job.repository_path, TSX_LOADER);
    return runProcess({
      command: process.execPath,
      args: ['--import', tsxLoader, acceptanceScript, input.job.worktree_path, input.scenario],
      cwd: input.job.repository_path,
      timeoutMs: this.config.commandTimeoutMs,
    });
  }
}
