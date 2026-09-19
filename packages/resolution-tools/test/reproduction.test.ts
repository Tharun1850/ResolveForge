import assert from 'node:assert/strict';
import test from 'node:test';

import { reproduceDemoIssue, reproduceLiveIssue } from '../src/reproduction.js';
import { CaseIdSchema } from '../src/types.js';

const caseId = CaseIdSchema.parse('case_20260919210000000_1');

test('demo reproduction records the selected routes as observed evidence', () => {
  const evidence = reproduceDemoIssue({
    caseId,
    issue: 'Invoice CSV export ignores the unpaid filter.',
    routes: ['react_ui', 'backend_api'],
  });

  assert.deepEqual(
    evidence.routes.map(route => [route.route, route.status]),
    [
      ['react_ui', 'reproduced'],
      ['backend_api', 'reproduced'],
    ],
  );
});

test('live reproduction does not manufacture evidence without an adapter', () => {
  const evidence = reproduceLiveIssue({
    caseId,
    issue: 'Invoice CSV export ignores the unpaid filter.',
    routes: ['backend_api'],
  });

  assert.equal(evidence.routes[0]?.status, 'not_reproduced');
  assert.equal(evidence.routes[0]?.assertions.length, 0);
});
