import assert from 'node:assert/strict';
import test from 'node:test';

import { mayStartPatchAttempt } from '../src/policy.js';
import { CaseIdSchema, JobIdSchema, type JobRecord } from '../src/types.js';

const caseId = CaseIdSchema.parse('case_20260919210000000_1');

function jobRecord(): JobRecord {
  return {
    job_id: JobIdSchema.parse('job_20260919210000000_1'),
    case_id: caseId,
    issue: 'Invoice CSV export ignores the unpaid filter.',
    repository_path: '/tmp/repository',
    worktree_path: '/tmp/worktree',
    allowed_scope: 'packages/resolveforge-demo/src',
    protected_tests_hash: '0'.repeat(64),
    independent_tests_hash: '0'.repeat(64),
    patch_attempt: 1,
    state: { kind: 'completed', completed_at: '2026-09-19T21:00:00.000Z', summary: 'patched' },
    events: [],
  };
}

test('reserved attempts count toward the patch limit before worktree creation', () => {
  assert.equal(mayStartPatchAttempt({ caseId, jobs: [jobRecord()], maxAttempts: 2, reservedAttempts: 1 }), false);
});
