import type { EvidenceBundle, JobRecord } from './types.js';

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

export function mayStartPatchAttempt(input: {
  caseId: JobRecord['case_id'];
  jobs: JobRecord[];
  maxAttempts: number;
  reservedAttempts: number;
}): boolean {
  const completedOrRunning = input.jobs.filter(job => job.case_id === input.caseId).length;
  return completedOrRunning + input.reservedAttempts < input.maxAttempts;
}
