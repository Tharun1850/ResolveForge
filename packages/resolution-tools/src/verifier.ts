import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ResolveForgeConfig } from './config.js';
import { EvidenceStore } from './evidence-store.js';
import { hashPaths, hashText } from './integrity.js';
import { runProcess } from './process.js';
import { DiagnosticRunner } from './reproduction.js';
import type { Command, TargetConfig } from './target-config.js';
import type { JobRecord, VerificationReport } from './types.js';
import { isAllowedChange } from './worktree.js';

interface PatchSnapshot {
  changedFiles: string[];
  fingerprint: string;
}

export class IndependentVerifier {
  constructor(
    private readonly config: ResolveForgeConfig,
    private readonly targetConfig: TargetConfig,
    private readonly evidenceStore: EvidenceStore,
    private readonly diagnosticRunner: DiagnosticRunner,
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
    const currentIndependentHash = await hashPaths(job.repository_path, this.targetConfig.verification.protected_paths);
    const independentTestsUnchanged = currentIndependentHash === job.independent_tests_hash;
    const commandResults = await this.runVerificationCommands({
      commands: this.targetConfig.verification.commands,
      job,
    });
    const evidence = await this.evidenceStore.readEvidence(job.case_id);
    const afterRoutes = await Promise.all(
      evidence.routes.map(route =>
        this.diagnosticRunner.run({
          caseId: job.case_id,
          issue: job.issue,
          route: route.route,
          workingDirectory: job.worktree_path,
        }),
      ),
    );
    const scenariosPassed = afterRoutes.every(
      route => route.assertions.length > 0 && route.assertions.every(assertion => assertion.passed),
    );
    const afterProtectedHash = await hashPaths(job.worktree_path, this.targetConfig.verification.protected_paths);
    const protectedTestsUnchanged = afterProtectedHash === job.protected_tests_hash;
    const snapshot = await this.inspectPatch(job);
    const scopeAllowed = snapshot.changedFiles.every(changedFile =>
      isAllowedChange({ allowedScopes: job.allowed_scopes, changedFile }),
    );
    const commandsPassed = commandResults.every(result => result.exit_code === 0);
    const testsPassed =
      commandsPassed && scenariosPassed && scopeAllowed && protectedTestsUnchanged && independentTestsUnchanged;

    return {
      case_id: job.case_id,
      job_id: job.job_id,
      patch_attempt: job.patch_attempt,
      tests_passed: testsPassed,
      original_scenarios_passed: scenariosPassed && independentTestsUnchanged,
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
        diagnostic_routes_before: evidence.routes,
        diagnostic_routes_after: afterRoutes,
      },
      command_results: commandResults,
      created_at: new Date().toISOString(),
    };
  }

  private async runVerificationCommands(input: { commands: Command[]; job: JobRecord }) {
    const results = [];
    for (const [index, command] of input.commands.entries()) {
      const result = await runProcess({
        command: command.command,
        args: command.args,
        cwd: input.job.worktree_path,
        timeoutMs: this.config.commandTimeoutMs,
      });
      const outputPath = await this.evidenceStore.saveArtifact(
        input.job.case_id,
        `${input.job.job_id}-verification-${String(index + 1)}.log`,
        result.output,
      );
      results.push({
        command: [command.command, ...command.args],
        exit_code: result.exitCode,
        output_path: outputPath,
      });
    }
    return results;
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
}
