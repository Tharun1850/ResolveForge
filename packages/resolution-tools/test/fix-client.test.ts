import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFixPrompt } from '../src/fix-client.js';
import { CaseIdSchema } from '../src/types.js';

test('JCode receives target-owned paths and validation commands', () => {
  const prompt = buildFixPrompt({
    allowedPaths: ['src', 'packages/api/src'],
    evidence: {
      case_id: CaseIdSchema.parse('case_20260919210000000_1'),
      issue: 'The API returns a stale value.',
      routes: [
        {
          route: 'backend_api',
          status: 'reproduced',
          expected_behavior: 'The API returns the current value.',
          actual_behavior: 'The API returns a stale value.',
          steps: ['Request the endpoint.'],
          assertions: [{ name: 'current value', passed: false, detail: 'Received a stale value.' }],
          artifacts: [],
          diagnostics: {},
        },
      ],
      created_at: '2026-09-19T21:00:00.000Z',
    },
    issue: 'The API returns a stale value.',
    validationCommands: [{ command: 'pnpm', args: ['test:api'] }],
  });
  assert.match(prompt, /src, packages\/api\/src/);
  assert.match(prompt, /pnpm test:api/);
  assert.doesNotMatch(prompt, /invoice/i);
});
