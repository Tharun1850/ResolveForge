import assert from 'node:assert/strict';
import test from 'node:test';

import { StartFixInputSchema } from '../src/types.js';

const caseId = 'case_20260919210000000_1';

test('start_fix accepts no model-supplied repository path', () => {
  assert.deepEqual(StartFixInputSchema.parse({ case_id: caseId }), {
    allowed_scope: 'packages/resolveforge-demo/src',
    case_id: caseId,
  });
});

test('start_fix rejects a model-supplied repository path', () => {
  assert.throws(() => StartFixInputSchema.parse({ case_id: caseId, repository_path: '/tmp/untrusted' }));
});
