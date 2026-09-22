import { z } from 'zod';

import type { JobRecord, Review, VerificationReport } from './types.js';
import { ReviewSchema } from './types.js';
import { isAllowedChange } from './worktree.js';

const DESTRUCTIVE_PATCH =
  /\b(drop\s+(table|column|database)|truncate\s+table|delete\s+from|rm\s+-rf|curl\s+.+\|\s*sh)\b/i;

interface ReviewInput {
  job: JobRecord;
  patch: string;
  verification: VerificationReport;
}

export interface SemanticReviewClient {
  review(input: ReviewInput): Promise<Review>;
}

function verificationFailureReview(input: ReviewInput): Review | null {
  if (!input.verification.tests_passed) {
    return ReviewSchema.parse({
      decision: 'revise',
      issue_covered: input.verification.original_scenarios_passed,
      scope_expanded: input.verification.changed_files.some(
        changedFile => !isAllowedChange({ allowedScopes: input.job.allowed_scopes, changedFile }),
      ),
      tests_weakened: !input.verification.protected_tests_unchanged || !input.verification.independent_tests_unchanged,
      destructive_operation: DESTRUCTIVE_PATCH.test(input.patch),
      rationale: 'Independent verification did not pass. The patch requires revision before review can approve it.',
    });
  }
  return null;
}

export class UnavailableSemanticReviewClient implements SemanticReviewClient {
  review(input: ReviewInput): Promise<Review> {
    const failure = verificationFailureReview(input);
    if (failure) {
      return Promise.resolve(failure);
    }
    return Promise.resolve(
      ReviewSchema.parse({
        decision: 'handoff',
        issue_covered: input.verification.original_scenarios_passed,
        scope_expanded: false,
        tests_weakened: false,
        destructive_operation: DESTRUCTIVE_PATCH.test(input.patch),
        rationale: 'Live semantic review requires TYPESAFE_API_KEY. A human must review this patch.',
      }),
    );
  }
}

const JevResponseSchema = z
  .object({
    answers: z
      .object({
        decision: z.object({ choice: z.enum(['approve', 'revise', 'handoff']) }),
        issue_covered: z.object({ choice: z.enum(['yes', 'no']) }),
        scope_expanded: z.object({ choice: z.enum(['yes', 'no']) }),
        tests_weakened: z.object({ choice: z.enum(['yes', 'no']) }),
        destructive_operation: z.object({ choice: z.enum(['yes', 'no']) }),
      })
      .strict(),
  })
  .strict();

export class JevSemanticReviewClient implements SemanticReviewClient {
  constructor(private readonly apiKey: string) {}

  async review(input: ReviewInput): Promise<Review> {
    const failure = verificationFailureReview(input);
    if (failure) {
      return failure;
    }
    const response = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        state: JSON.stringify({
          issue: input.job.issue,
          changed_files: input.verification.changed_files,
          patch: input.patch,
          verification: input.verification,
        }),
        model: 'jev-latest',
        questions: {
          decision: {
            type: 'choice',
            instructions: 'Choose the review decision for this patch.',
            criteria: {
              approve: 'The patch fixes the issue with an appropriate bounded change.',
              revise: 'The patch does not yet establish a safe fix.',
              handoff: 'A human must assess risk, scope, or destructive behavior.',
            },
          },
          issue_covered: {
            type: 'choice',
            instructions: 'Decide whether the patch covers the reported issue.',
            criteria: { yes: 'The reported behavior is fixed.', no: 'The reported behavior remains or is unproven.' },
          },
          scope_expanded: {
            type: 'choice',
            instructions: 'Decide whether the patch changes unrelated scope.',
            criteria: {
              yes: 'The patch changes unrelated behavior or files.',
              no: 'The patch stays within the reported scope.',
            },
          },
          tests_weakened: {
            type: 'choice',
            instructions: 'Decide whether any acceptance protection was weakened.',
            criteria: {
              yes: 'Tests or test inputs were changed to hide a failure.',
              no: 'Tests remain independent and unchanged.',
            },
          },
          destructive_operation: {
            type: 'choice',
            instructions: 'Decide whether the patch performs a destructive operation.',
            criteria: {
              yes: 'The patch deletes data or executes an irreversible operation.',
              no: 'The patch does not perform destructive work.',
            },
          },
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`Jev patch review failed with status ${String(response.status)}.`);
    }
    const answers = JevResponseSchema.parse(await response.json()).answers;
    const destructiveOperation = answers.destructive_operation.choice === 'yes' || DESTRUCTIVE_PATCH.test(input.patch);
    const decision =
      destructiveOperation && answers.decision.choice === 'approve' ? 'handoff' : answers.decision.choice;
    return ReviewSchema.parse({
      decision,
      issue_covered: answers.issue_covered.choice === 'yes',
      scope_expanded: answers.scope_expanded.choice === 'yes',
      tests_weakened: answers.tests_weakened.choice === 'yes',
      destructive_operation: destructiveOperation,
      rationale: 'Jev performed the final semantic review of the patch and its independent verification evidence.',
    });
  }
}
