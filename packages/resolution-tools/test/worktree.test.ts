import assert from 'node:assert/strict';
import test from 'node:test';

import { isAllowedChange } from '../src/worktree.js';

test('allows changed files below any configured path', () => {
  assert.equal(isAllowedChange({ allowedScopes: ['src', 'packages/api/src'], changedFile: 'src/index.ts' }), true);
  assert.equal(
    isAllowedChange({ allowedScopes: ['src', 'packages/api/src'], changedFile: 'packages/api/src/server.ts' }),
    true,
  );
});

test('rejects files outside configured paths', () => {
  assert.equal(isAllowedChange({ allowedScopes: ['src'], changedFile: 'test/index.test.ts' }), false);
});

test('rejects absolute paths and parent-directory traversal', () => {
  for (const changedFile of ['/src/index.ts', 'src/../../secrets.txt']) {
    assert.equal(isAllowedChange({ allowedScopes: ['src'], changedFile }), false);
  }
});
