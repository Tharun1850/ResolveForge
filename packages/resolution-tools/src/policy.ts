import type { EvidenceBundle, JobRecord, Review, VerificationReport } from './types.js';

export type EvidenceGate =
  { kind: 'allowed' } | { kind: 'blocked'; reason: string } | { kind: 'needs_clarification'; reason: string };

export function evaluateEvidenceGate(evidence: EvidenceBundle): EvidenceGate {
  const blocked = evidence.routes.find(route => route.status === 'blocked');
  if (blocked) {
    return { kind: 'blocked', reason: `${blocked.route} requires human review before a fix can start.` };
  }

  const unreproduced = evidence.routes.find(route => route.status === 'not_reproduced');
  if (unreproduced) {
    return { kind: 'needs_clarification', reason: `${unreproduced.route} did not reproduce the reported behavior.` };
  }

  const missingAssertion = evidence.routes.find(route => route.assertions.length === 0);
  if (missingAssertion) {
    return { kind: 'needs_clarification', reason: `${missingAssertion.route} has no acceptance assertion.` };
  }

  return { kind: 'allowed' };
}

export function mayStartPatchAttempt(jobs: JobRecord[], caseId: JobRecord['case_id'], maxAttempts: number): boolean {
  return jobs.filter(job => job.case_id === caseId).length < maxAttempts;
}

export function decideReview(verification: VerificationReport): Review {
  const passed =
    verification.tests_passed && verification.original_scenarios_passed && verification.protected_tests_unchanged;
  if (passed) {
    return {
      decision: 'approve',
      issue_covered: true,
      scope_expanded: false,
      tests_weakened: false,
      destructive_operation: false,
      rationale: 'Independent checks passed and protected acceptance files are unchanged.',
    };
  }

  return {
    decision: 'revise',
    issue_covered: verification.original_scenarios_passed,
    scope_expanded: false,
    tests_weakened: !verification.protected_tests_unchanged,
    destructive_operation: false,
    rationale: 'The patch cannot be approved until every independent verification check passes.',
  };
}
