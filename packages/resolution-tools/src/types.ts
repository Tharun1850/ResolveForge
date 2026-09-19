import { z } from 'zod';

export const CaseIdSchema = z
  .string()
  .regex(/^case_[a-z0-9_]+$/)
  .brand<'CaseId'>();
export const JobIdSchema = z
  .string()
  .regex(/^job_[a-z0-9_]+$/)
  .brand<'JobId'>();

export type CaseId = z.infer<typeof CaseIdSchema>;
export type JobId = z.infer<typeof JobIdSchema>;

export const IssueTypeSchema = z.enum(['bug', 'performance', 'configuration', 'how_to', 'feature_request', 'unknown']);
export const SeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export const DiagnosticRouteSchema = z.enum([
  'react_ui',
  'web_ui',
  'backend_api',
  'database',
  'configuration',
  'documentation',
  'unknown',
]);

export const TriageResultSchema = z
  .object({
    issue_type: IssueTypeSchema,
    severity: SeveritySchema,
    routes: z.array(DiagnosticRouteSchema).min(1),
    route_confidence: z.number().min(0).max(1),
    reproduction_ready: z.number().min(0).max(1),
    missing_information: z.array(z.string()),
  })
  .strict();

export type TriageResult = z.infer<typeof TriageResultSchema>;

export const AssertionSchema = z
  .object({
    name: z.string().min(1),
    passed: z.boolean(),
    detail: z.string().min(1),
  })
  .strict();

export const ArtifactSchema = z
  .object({
    kind: z.string().min(1),
    path: z.string().min(1),
  })
  .strict();

export const RouteEvidenceSchema = z
  .object({
    route: DiagnosticRouteSchema,
    status: z.enum(['reproduced', 'not_reproduced', 'blocked']),
    expected_behavior: z.string().min(1),
    actual_behavior: z.string().min(1),
    steps: z.array(z.string()),
    assertions: z.array(AssertionSchema),
    artifacts: z.array(ArtifactSchema),
    diagnostics: z.record(z.string(), z.unknown()),
  })
  .strict();

export const EvidenceBundleSchema = z
  .object({
    case_id: CaseIdSchema,
    issue: z.string().min(1),
    routes: z.array(RouteEvidenceSchema).min(1),
    created_at: z.string().datetime(),
  })
  .strict();

export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;

export const CommandResultSchema = z
  .object({
    command: z.array(z.string()).min(1),
    exit_code: z.number().int(),
    output_path: z.string().min(1),
  })
  .strict();

export const VerificationReportSchema = z
  .object({
    case_id: CaseIdSchema,
    job_id: JobIdSchema,
    patch_attempt: z.number().int().positive(),
    tests_passed: z.boolean(),
    original_scenarios_passed: z.boolean(),
    protected_tests_unchanged: z.boolean(),
    changed_files: z.array(z.string()),
    before_after: z.record(z.string(), z.unknown()),
    command_results: z.array(CommandResultSchema),
    created_at: z.string().datetime(),
  })
  .strict();

export type VerificationReport = z.infer<typeof VerificationReportSchema>;

export const ReviewSchema = z
  .object({
    decision: z.enum(['approve', 'revise', 'handoff']),
    issue_covered: z.boolean(),
    scope_expanded: z.boolean(),
    tests_weakened: z.boolean(),
    destructive_operation: z.boolean(),
    rationale: z.string().min(1),
  })
  .strict();

export type Review = z.infer<typeof ReviewSchema>;

const QueuedJobSchema = z
  .object({
    kind: z.literal('queued'),
    created_at: z.string().datetime(),
  })
  .strict();
const RunningJobSchema = z
  .object({
    kind: z.literal('running'),
    started_at: z.string().datetime(),
  })
  .strict();
const WaitingJobSchema = z
  .object({
    kind: z.literal('waiting_for_permission'),
    request_id: z.string().min(1),
    description: z.string().min(1),
  })
  .strict();
const CompletedJobSchema = z
  .object({
    kind: z.literal('completed'),
    completed_at: z.string().datetime(),
    summary: z.string().min(1),
  })
  .strict();
const FailedJobSchema = z
  .object({
    kind: z.literal('failed'),
    failed_at: z.string().datetime(),
    message: z.string().min(1),
  })
  .strict();
const CancelledJobSchema = z
  .object({
    kind: z.literal('cancelled'),
    cancelled_at: z.string().datetime(),
  })
  .strict();

export const JobStateSchema = z.discriminatedUnion('kind', [
  QueuedJobSchema,
  RunningJobSchema,
  WaitingJobSchema,
  CompletedJobSchema,
  FailedJobSchema,
  CancelledJobSchema,
]);

export const JobRecordSchema = z
  .object({
    job_id: JobIdSchema,
    case_id: CaseIdSchema,
    repository_path: z.string().min(1),
    worktree_path: z.string().min(1),
    allowed_scope: z.string().min(1),
    patch_attempt: z.number().int().positive(),
    state: JobStateSchema,
    events: z.array(z.string()),
  })
  .strict();

export type JobRecord = z.infer<typeof JobRecordSchema>;

export const TriageIssueInputSchema = z
  .object({
    issue: z.string().trim().min(1),
    context: z.string().trim().optional(),
  })
  .strict();

export const ReproduceIssueInputSchema = z
  .object({
    case_id: CaseIdSchema,
    issue: z.string().trim().min(1),
    routes: z.array(DiagnosticRouteSchema).min(1),
  })
  .strict();

export const StartFixInputSchema = z
  .object({
    case_id: CaseIdSchema,
    repository_path: z.string().trim().min(1),
    allowed_scope: z.string().trim().min(1).default('packages/resolveforge-demo/src'),
  })
  .strict();

export const JobIdInputSchema = z.object({ job_id: JobIdSchema }).strict();
export const VerifyFixInputSchema = z.object({ case_id: CaseIdSchema, job_id: JobIdSchema }).strict();
export const ReviewPatchInputSchema = z.object({ case_id: CaseIdSchema, job_id: JobIdSchema }).strict();

export function makeCaseId(now: Date): CaseId {
  return CaseIdSchema.parse(
    `case_${now
      .toISOString()
      .replace(/[-:.TZ]/g, '')
      .toLowerCase()}`,
  );
}

export function makeJobId(now: Date, ordinal: number): JobId {
  return JobIdSchema.parse(
    `job_${now
      .toISOString()
      .replace(/[-:.TZ]/g, '')
      .toLowerCase()}_${String(ordinal)}`,
  );
}
