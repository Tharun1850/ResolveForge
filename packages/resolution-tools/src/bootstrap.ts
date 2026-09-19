import { z } from 'zod';

import { readConfig } from './config.js';

const AgentListSchema = z.object({
  data: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) }).passthrough()),
});

const TOOL_NAMES = [
  'triage_issue',
  'reproduce_issue',
  'profile_react',
  'start_fix',
  'get_fix_status',
  'cancel_fix',
  'verify_fix',
  'review_patch',
] as const;

async function requestJson(input: { body?: unknown; method: 'GET' | 'POST' | 'PUT'; path: string }): Promise<unknown> {
  const config = readConfig();
  const response = await fetch(new URL(input.path, `${config.trueForgeUrl}/`), {
    method: input.method,
    headers: input.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });
  const text = await response.text();
  const body: unknown = text === '' ? {} : JSON.parse(text);
  if (!response.ok) {
    throw new Error(`TrueForge returned ${String(response.status)} for ${input.method} ${input.path}: ${text}`);
  }
  return body;
}

function resolveForgeManifest(model: string) {
  return {
    model: { name: model },
    instructions: [
      'Use ResolveForge to triage, reproduce, and verify reported behavior before requesting a fix.',
      'Do not call start_fix until every relevant reproduction route has evidence and acceptance assertions.',
      'Ask for human approval before start_fix or cancel_fix. Do not merge, commit, push, or create a pull request.',
      'Call verify_fix and review_patch after every completed patch. Present the review decision and evidence to the human.',
    ].join(' '),
    mcp_servers: [
      {
        name: 'resolveforge-tools',
        enable_tools: ['@all'],
        disable_tools: [],
        preload_tools: [...TOOL_NAMES],
        require_approval_for_tools: ['@destructive', 'start_fix', 'cancel_fix'],
        preload: true,
      },
    ],
    config: {
      iteration_limit: 24,
      sandbox: { enabled: false, file_downloads: false },
      dynamic_sub_agents: { enabled: false },
      web_search: { enabled: false },
    },
  };
}

async function bootstrap(): Promise<void> {
  const config = readConfig();
  if (!config.coordinatorModel) {
    throw new Error('Set RESOLVEFORGE_COORDINATOR_MODEL to a configured TrueForge model FQN before bootstrapping.');
  }
  await requestJson({
    method: 'PUT',
    path: '/api/v1/settings/mcp-servers',
    body: {
      manifest: {
        type: 'remote',
        name: 'resolveforge-tools',
        url: config.mcpUrl,
        description: 'Evidence-driven issue triage, bounded patching, and independent verification.',
      },
    },
  });
  const existing = AgentListSchema.parse(
    await requestJson({ method: 'GET', path: '/api/v1/agents?agent_name=resolveforge' }),
  ).data.find(agent => agent.name === 'resolveforge');
  const manifest = resolveForgeManifest(config.coordinatorModel);
  if (existing) {
    await requestJson({
      method: 'PUT',
      path: `/api/v1/agents/${encodeURIComponent(existing.id)}`,
      body: { description: 'Evidence-driven issue resolution coordinator.', manifest },
    });
    process.stdout.write('Updated TrueForge agent resolveforge.\n');
    return;
  }
  await requestJson({
    method: 'POST',
    path: '/api/v1/agents',
    body: { name: 'resolveforge', description: 'Evidence-driven issue resolution coordinator.', manifest },
  });
  process.stdout.write('Created TrueForge agent resolveforge.\n');
}

void bootstrap().catch(error => {
  const message = error instanceof Error ? error.message : 'ResolveForge bootstrap failed with a non-error value.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
