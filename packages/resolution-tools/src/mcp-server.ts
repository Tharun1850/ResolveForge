import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { ResolveForgeService } from './service.js';
import { CaseIdSchema, DiagnosticRouteSchema, JobIdSchema, StartFixInputSchema } from './types.js';

interface ToolResult {
  [key: string]: unknown;
  content: [{ type: 'text'; text: string }];
  isError?: true;
}

function textResult(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function errorResult(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : 'ResolveForge tool failed with a non-error value.';
  return { content: [{ type: 'text', text: message }], isError: true };
}

async function safely(run: () => unknown): Promise<ToolResult> {
  try {
    return textResult(await run());
  } catch (error) {
    return errorResult(error);
  }
}

export function createResolveForgeMcpServer(service: ResolveForgeService): McpServer {
  const server = new McpServer({ name: 'resolveforge-tools', version: '0.1.0' });

  server.registerTool(
    'triage_issue',
    {
      description: 'Classify an issue and return diagnostic routes plus confidence.',
      inputSchema: { issue: z.string().trim().min(1), context: z.string().trim().optional() },
      annotations: { readOnlyHint: true },
    },
    input => safely(() => service.triage(input)),
  );
  server.registerTool(
    'reproduce_issue',
    {
      description: 'Collect route-specific reproduction evidence and acceptance assertions.',
      inputSchema: {
        case_id: CaseIdSchema,
        issue: z.string().trim().min(1),
        routes: z.array(DiagnosticRouteSchema).min(1),
      },
      annotations: { readOnlyHint: true },
    },
    input => safely(() => service.reproduce({ caseId: input.case_id, issue: input.issue, routes: input.routes })),
  );
  server.registerTool(
    'profile_react',
    {
      description: 'Return recorded React render diagnostics for a reproduced case.',
      inputSchema: { case_id: CaseIdSchema, issue: z.string().trim().min(1) },
      annotations: { readOnlyHint: true },
    },
    input => safely(() => service.profileReact({ caseId: input.case_id, issue: input.issue })),
  );
  server.registerTool(
    'start_fix',
    {
      description:
        'Create an isolated worktree in the server-configured target repository and begin a bounded patch attempt after evidence is complete.',
      inputSchema: StartFixInputSchema.shape,
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    input =>
      safely(() =>
        service.startFix({
          caseId: input.case_id,
        }),
      ),
  );
  server.registerTool(
    'get_fix_status',
    {
      description: 'Read the current state, worktree location, and event log for a patch attempt.',
      inputSchema: { job_id: JobIdSchema },
      annotations: { readOnlyHint: true },
    },
    input => safely(() => service.getFixStatus(input.job_id)),
  );
  server.registerTool(
    'cancel_fix',
    {
      description: 'Cancel a running patch attempt without merging or committing its worktree changes.',
      inputSchema: { job_id: JobIdSchema },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    input => safely(() => service.cancelFix(input.job_id)),
  );
  server.registerTool(
    'verify_fix',
    {
      description: 'Run protected, independent acceptance checks against a completed worktree patch.',
      inputSchema: { case_id: CaseIdSchema, job_id: JobIdSchema },
      annotations: { readOnlyHint: true },
    },
    input => safely(() => service.verifyFix({ caseId: input.case_id, jobId: input.job_id })),
  );
  server.registerTool(
    'review_patch',
    {
      description: 'Return the independent approval, revise, or handoff decision for a verified patch.',
      inputSchema: { case_id: CaseIdSchema, job_id: JobIdSchema },
      annotations: { readOnlyHint: true },
    },
    input => safely(() => service.reviewPatch({ caseId: input.case_id, jobId: input.job_id })),
  );
  return server;
}
