import type { ResolveForgeConfig } from './config.js';
import { EvidenceStore } from './evidence-store.js';
import { JcodeFixClient } from './fix-client.js';
import { JobManager } from './job-manager.js';
import { evaluateEvidenceGate } from './policy.js';
import { DiagnosticRunner } from './reproduction.js';
import {
  JevSemanticReviewClient,
  UnavailableSemanticReviewClient,
  type SemanticReviewClient,
} from './semantic-review.js';
import { readTargetConfig } from './target-config.js';
import { TypeSafeTriageClient, UnavailableTriageClient, type TriageClient } from './triage.js';
import {
  CaseIdSchema,
  CaseRecordSchema,
  makeCaseId,
  ReviewSchema,
  TriageResponseSchema,
  type CaseId,
  type CaseRecord,
  type DiagnosticRoute,
  type JobId,
  type Review,
  type TriageResponse,
  type VerificationReport,
} from './types.js';
import { IndependentVerifier } from './verifier.js';

export class ResolveForgeService {
  private readonly cases = new Map<CaseId, CaseRecord>();
  private readonly reports = new Map<JobId, VerificationReport>();
  private caseOrdinal = 0;

  constructor(
    private readonly config: ResolveForgeConfig,
    private readonly evidenceStore: EvidenceStore,
    private readonly triageClient: TriageClient,
    private readonly diagnosticRunner: DiagnosticRunner,
    private readonly jobManager: JobManager,
    private readonly verifier: IndependentVerifier,
    private readonly reviewClient: SemanticReviewClient,
  ) {}

  async triage(input: { context: string | undefined; issue: string }): Promise<TriageResponse> {
    const triage = await this.triageClient.triage({ context: input.context ?? null, issue: input.issue });
    this.caseOrdinal += 1;
    const timestamp = new Date();
    const base = makeCaseId(timestamp);
    const caseId = CaseIdSchema.parse(`${base}_${String(this.caseOrdinal)}`);
    const record = CaseRecordSchema.parse({ case_id: caseId, issue: input.issue, triage });
    this.cases.set(caseId, record);
    return TriageResponseSchema.parse({ case_id: caseId, triage });
  }

  async reproduce(input: { caseId: CaseId; issue: string; routes: DiagnosticRoute[] }) {
    const triage = this.cases.get(input.caseId);
    if (!triage) {
      throw new Error('Run triage_issue before reproducing this case.');
    }
    if (triage.triage.routes.some(route => !input.routes.includes(route))) {
      throw new Error('Reproduction must include every route selected during triage.');
    }
    if (input.issue !== triage.issue) {
      throw new Error('The provided issue does not match the triaged case.');
    }
    const repositoryPath = this.requireTargetRepository();
    const evidence = await this.diagnosticRunner.reproduce({
      ...input,
      workingDirectory: repositoryPath,
    });
    await this.evidenceStore.saveEvidence(evidence);
    return evidence;
  }

  async profileReact(input: { caseId: CaseId; issue: string }) {
    const evidence = await this.evidenceStore.readEvidence(input.caseId);
    if (evidence.issue !== input.issue) {
      throw new Error('The provided issue does not match the evidence recorded for this case.');
    }
    const reactEvidence = evidence.routes.filter(route => route.route === 'react_ui');
    if (reactEvidence.length === 0) {
      throw new Error('No React diagnostic route was recorded for this case.');
    }
    return reactEvidence;
  }

  async startFix(input: { caseId: CaseId }) {
    const repositoryPath = this.requireTargetRepository();
    const evidence = await this.evidenceStore.readEvidence(input.caseId);
    const gate = evaluateEvidenceGate(evidence);
    if (gate.kind !== 'allowed') {
      throw new Error(`Fix is not permitted: ${gate.reason}`);
    }
    return this.jobManager.start({
      caseId: input.caseId,
      evidence,
      issue: evidence.issue,
      repositoryPath,
    });
  }

  getFixStatus(jobId: JobId) {
    return this.jobManager.get(jobId);
  }

  async cancelFix(jobId: JobId) {
    return this.jobManager.cancel(jobId);
  }

  async verifyFix(input: { caseId: CaseId; jobId: JobId }): Promise<VerificationReport> {
    const job = this.jobManager.get(input.jobId);
    if (job.case_id !== input.caseId) {
      throw new Error('The job does not belong to the supplied case.');
    }
    if (job.state.kind !== 'completed') {
      throw new Error('A fix must complete before independent verification can run.');
    }
    const report = await this.verifier.verify(job);
    this.reports.set(input.jobId, report);
    return report;
  }

  async reviewPatch(input: { caseId: CaseId; jobId: JobId }): Promise<Review> {
    const job = this.jobManager.get(input.jobId);
    const report = this.reports.get(input.jobId);
    if (report?.case_id !== input.caseId) {
      throw new Error('Run verify_fix for this case before requesting a review.');
    }
    if (job.state.kind !== 'completed') {
      return ReviewSchema.parse({
        decision: 'revise',
        issue_covered: false,
        scope_expanded: false,
        tests_weakened: false,
        destructive_operation: false,
        rationale: 'The job changed state after verification. Run verification again before review.',
      });
    }
    if ((await this.verifier.fingerprint(job)) !== report.patch_fingerprint) {
      return ReviewSchema.parse({
        decision: 'revise',
        issue_covered: false,
        scope_expanded: true,
        tests_weakened: false,
        destructive_operation: false,
        rationale: 'The worktree changed after verification. Run independent verification again before review.',
      });
    }
    return this.reviewClient.review({ job, patch: await this.verifier.patchText(job), verification: report });
  }

  private requireTargetRepository(): string {
    if (!this.config.targetRepo) {
      throw new Error('RESOLVEFORGE_TARGET_REPO must be configured.');
    }
    return this.config.targetRepo;
  }
}

export async function createResolveForgeService(config: ResolveForgeConfig): Promise<ResolveForgeService> {
  if (!config.targetRepo) {
    throw new Error('RESOLVEFORGE_TARGET_REPO must be configured before the ResolveForge service starts.');
  }
  const targetConfig = await readTargetConfig(config.targetRepo);
  const evidenceStore = new EvidenceStore(config.dataDir);
  const triageClient = config.typeSafeApiKey
    ? new TypeSafeTriageClient(config.typeSafeApiKey)
    : new UnavailableTriageClient();
  const diagnosticRunner = new DiagnosticRunner(targetConfig, config.commandTimeoutMs);
  const reviewClient: SemanticReviewClient = config.typeSafeApiKey
    ? new JevSemanticReviewClient(config.typeSafeApiKey)
    : new UnavailableSemanticReviewClient();
  const jobManager = new JobManager(config, targetConfig, evidenceStore, new JcodeFixClient());
  return new ResolveForgeService(
    config,
    evidenceStore,
    triageClient,
    diagnosticRunner,
    jobManager,
    new IndependentVerifier(config, targetConfig, evidenceStore, diagnosticRunner),
    reviewClient,
  );
}
