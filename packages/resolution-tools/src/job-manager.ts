import { join } from 'node:path';

import type { ResolveForgeConfig } from './config.js';
import { EvidenceStore } from './evidence-store.js';
import type { FixClient, FixRun } from './fix-client.js';
import { ACCEPTANCE_DIRECTORY, hashDirectory } from './integrity.js';
import { mayStartPatchAttempt } from './policy.js';
import { makeJobId, type CaseId, type EvidenceBundle, type JobId, type JobRecord } from './types.js';
import { createWorktree } from './worktree.js';

export class JobManager {
  private readonly jobs = new Map<JobId, JobRecord>();
  private readonly pendingAttempts = new Map<CaseId, number>();
  private readonly running = new Map<JobId, FixRun>();
  private ordinal = 0;

  constructor(
    private readonly config: ResolveForgeConfig,
    private readonly evidenceStore: EvidenceStore,
    private readonly fixClient: FixClient,
  ) {}

  all(): JobRecord[] {
    return [...this.jobs.values()];
  }

  get(jobId: JobId): JobRecord {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Unknown fix job ${jobId}.`);
    }
    return job;
  }

  async start(input: {
    caseId: CaseId;
    evidence: EvidenceBundle;
    issue: string;
    repositoryPath: string;
    allowedScope: string;
  }): Promise<JobRecord> {
    const reservedAttempts = this.pendingAttempts.get(input.caseId) ?? 0;
    if (
      !mayStartPatchAttempt({
        caseId: input.caseId,
        jobs: this.all(),
        maxAttempts: this.config.maxPatchAttempts,
        reservedAttempts,
      })
    ) {
      throw new Error(`Case ${input.caseId} has reached the patch attempt limit.`);
    }
    this.pendingAttempts.set(input.caseId, reservedAttempts + 1);
    try {
      return await this.startReserved(input);
    } finally {
      const remaining = (this.pendingAttempts.get(input.caseId) ?? 1) - 1;
      if (remaining === 0) {
        this.pendingAttempts.delete(input.caseId);
      } else {
        this.pendingAttempts.set(input.caseId, remaining);
      }
    }
  }

  private async startReserved(input: {
    caseId: CaseId;
    evidence: EvidenceBundle;
    issue: string;
    repositoryPath: string;
    allowedScope: string;
  }): Promise<JobRecord> {
    this.ordinal += 1;
    const jobId = makeJobId(new Date(), this.ordinal);
    const worktreePath = await createWorktree({
      caseId: jobId,
      dataDir: this.config.dataDir,
      repositoryPath: input.repositoryPath,
      timeoutMs: this.config.commandTimeoutMs,
    });
    const [protectedTestsHash, independentTestsHash] = await Promise.all([
      hashDirectory(join(worktreePath, ACCEPTANCE_DIRECTORY)),
      hashDirectory(join(input.repositoryPath, ACCEPTANCE_DIRECTORY)),
    ]);
    const job: JobRecord = {
      job_id: jobId,
      case_id: input.caseId,
      issue: input.issue,
      repository_path: input.repositoryPath,
      worktree_path: worktreePath,
      allowed_scope: input.allowedScope,
      protected_tests_hash: protectedTestsHash,
      independent_tests_hash: independentTestsHash,
      patch_attempt: this.all().filter(existing => existing.case_id === input.caseId).length + 1,
      state: { kind: 'queued', created_at: new Date().toISOString() },
      events: [],
    };
    this.jobs.set(jobId, job);
    const evidencePath = await this.evidenceStore.saveEvidence(input.evidence);
    const run = await this.fixClient.start({
      evidencePath,
      issue: input.issue,
      workingDir: worktreePath,
      recordEvent: event => {
        this.appendEvent(jobId, event);
      },
    });
    this.running.set(jobId, run);
    this.setState(jobId, { kind: 'running', started_at: new Date().toISOString() });
    void run.completion.then(
      summary => {
        const latest = this.get(jobId);
        if (latest.state.kind !== 'cancelled') {
          this.setState(jobId, { kind: 'completed', completed_at: new Date().toISOString(), summary });
        }
        this.running.delete(jobId);
      },
      (error: unknown) => {
        const latest = this.get(jobId);
        if (latest.state.kind !== 'cancelled') {
          const message = error instanceof Error ? error.message : 'Fix worker failed with a non-error value.';
          this.setState(jobId, { kind: 'failed', failed_at: new Date().toISOString(), message });
        }
        this.running.delete(jobId);
      },
    );
    return this.get(jobId);
  }

  async cancel(jobId: JobId): Promise<JobRecord> {
    const run = this.running.get(jobId);
    if (run) {
      await run.cancel();
      this.running.delete(jobId);
    }
    this.setState(jobId, { kind: 'cancelled', cancelled_at: new Date().toISOString() });
    return this.get(jobId);
  }

  private appendEvent(jobId: JobId, event: string): void {
    const job = this.get(jobId);
    this.jobs.set(jobId, { ...job, events: [...job.events, event] });
  }

  private setState(jobId: JobId, state: JobRecord['state']): void {
    const job = this.get(jobId);
    this.jobs.set(jobId, { ...job, state });
  }
}
