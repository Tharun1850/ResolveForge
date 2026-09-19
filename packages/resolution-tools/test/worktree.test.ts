import assert from 'node:assert/strict';
import test from 'node:test';

import { isAllowedChange } from '../src/worktree.js';

test('allows a changed file below the approved scope', () => {
  assert.equal(
    isAllowedChange({
      allowedScope: 'packages/resolveforge-demo/src',
      changedFile: 'packages/resolveforge-demo/src/invoice-model.ts',
    }),
    true,
  );
});

test('rejects a changed file outside the approved scope', () => {
  assert.equal(
    isAllowedChange({
      allowedScope: 'packages/resolveforge-demo/src',
      changedFile: 'packages/resolveforge-demo/test/invoice-model.test.ts',
    }),
    false,
  );
});

test('rejects absolute paths and parent-directory traversal', () => {
  const allowedScope = 'packages/resolveforge-demo/src';
  for (const changedFile of [
    '/packages/resolveforge-demo/src/invoice-model.ts',
    'packages/resolveforge-demo/src/../../resolution-tools/src/config.ts',
  ]) {
    assert.equal(isAllowedChange({ allowedScope, changedFile }), false);
  }
});
