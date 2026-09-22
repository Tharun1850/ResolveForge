import assert from 'node:assert/strict';
import test from 'node:test';

import { StartFixInputSchema } from '../src/types.js';

const caseId = 'case_20260919210000000_1';

test('start_fix accepts only a case ID', () => {
  assert.deepEqual(StartFixInputSchema.parse({ case_id: caseId }), { case_id: caseId });
});

test('start_fix rejects model-supplied repository paths and edit scopes', () => {
  assert.throws(() => StartFixInputSchema.parse({ case_id: caseId, repository_path: '/tmp/untrusted' }));
  assert.throws(() => StartFixInputSchema.parse({ case_id: caseId, allowed_scope: 'src' }));
});
