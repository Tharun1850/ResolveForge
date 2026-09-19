import { z } from 'zod';

import { TriageResultSchema, type TriageResult } from './types.js';

export interface TriageClient {
  triage(input: { issue: string; context: string | null }): Promise<TriageResult>;
}

function demoResult(input: { issue: string }): TriageResult {
  const text = input.issue.toLowerCase();
  if (text.includes('migration') || text.includes('drop') || text.includes('column')) {
    return TriageResultSchema.parse({
      issue_type: 'bug',
      severity: 'high',
      routes: ['database'],
      route_confidence: 0.97,
      reproduction_ready: 0.9,
      missing_information: [],
    });
  }
  if (text.includes('discount') || text.includes('tax')) {
    return TriageResultSchema.parse({
      issue_type: 'bug',
      severity: 'high',
      routes: ['backend_api'],
      route_confidence: 0.94,
      reproduction_ready: 0.95,
      missing_information: [],
    });
  }
  if (text.includes('filter') || text.includes('freeze') || text.includes('invoice') || text.includes('csv')) {
    return TriageResultSchema.parse({
      issue_type: text.includes('freeze') ? 'performance' : 'bug',
      severity: 'high',
      routes: ['react_ui', 'backend_api'],
      route_confidence: 0.91,
      reproduction_ready: 0.92,
      missing_information: [],
    });
  }
  if (text.includes('config') || text.includes('environment')) {
    return TriageResultSchema.parse({
      issue_type: 'configuration',
      severity: 'medium',
      routes: ['configuration'],
      route_confidence: 0.86,
      reproduction_ready: 0.7,
      missing_information: ['Expected startup command or environment values.'],
    });
  }
  if (text.includes('document') || text.includes('readme')) {
    return TriageResultSchema.parse({
      issue_type: 'how_to',
      severity: 'low',
      routes: ['documentation'],
      route_confidence: 0.79,
      reproduction_ready: 0.65,
      missing_information: [],
    });
  }
  return TriageResultSchema.parse({
    issue_type: 'unknown',
    severity: 'medium',
    routes: ['unknown'],
    route_confidence: 0.3,
    reproduction_ready: 0.2,
    missing_information: ['Expected behavior and reproduction steps.'],
  });
}

export class DemoTriageClient implements TriageClient {
  async triage(input: { issue: string; context: string | null }): Promise<TriageResult> {
    return demoResult(input);
  }
}

const TypeSafeResponseSchema = z
  .object({
    answers: z
      .object({
        issue_type: z.object({ choice: z.string(), confidence: z.number() }),
        severity: z.object({ choice: z.string(), confidence: z.number() }),
        primary_route: z.object({ choice: z.string(), confidence: z.number() }),
        reproduction_ready: z.object({ score: z.number() }),
        requires_backend: z.object({ noul: z.number() }),
      })
      .strict(),
  })
  .strict();

export class TypeSafeTriageClient implements TriageClient {
  constructor(private readonly apiKey: string) {}

  async triage(input: { issue: string; context: string | null }): Promise<TriageResult> {
    const state = input.context ? `${input.issue}\n\nContext:\n${input.context}` : input.issue;
    const response = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        state,
        model: 'jev-latest',
        questions: {
          issue_type: {
            type: 'choice',
            instructions: 'Classify the request.',
            criteria: {
              bug: 'Incorrect current product behavior.',
              performance: 'Current behavior is too slow or consumes excess resources.',
              configuration: 'Setup, environment, or deployment configuration problem.',
              how_to: 'Question about supported usage.',
              feature_request: 'Request for new behavior.',
              unknown: 'The report does not provide enough evidence.',
            },
          },
          severity: {
            type: 'choice',
            instructions: 'Estimate customer impact.',
            criteria: {
              low: 'Minor impact or a clear workaround.',
              medium: 'Noticeable impact for a limited workflow.',
              high: 'Broken core workflow or many affected users.',
              critical: 'Data loss, security risk, or service unavailable.',
            },
          },
          primary_route: {
            type: 'choice',
            instructions: 'Choose the subsystem that should be diagnosed first.',
            criteria: {
              react_ui: 'React rendering or client state.',
              web_ui: 'Non-React browser interface.',
              backend_api: 'HTTP API or server business logic.',
              database: 'Schema, SQL, query, or migration.',
              configuration: 'Runtime configuration or startup.',
              documentation: 'Documentation mismatch.',
              unknown: 'No reliable subsystem.',
            },
          },
          reproduction_ready: {
            type: 'score',
            instructions: 'Assess whether the report contains enough information to reproduce the defect.',
            criteria: [
              'Missing a target or expected behavior.',
              'Has partial expected behavior or steps.',
              'Has target, steps, expected behavior, and observed behavior.',
            ],
          },
          requires_backend: {
            type: 'noul',
            instructions: 'The report likely also requires backend or API diagnostics.',
          },
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`TypeSafe triage failed with status ${String(response.status)}.`);
    }
    const body = TypeSafeResponseSchema.parse(await response.json());
    const routes =
      body.answers.requires_backend.noul >= 0.5 && body.answers.primary_route.choice !== 'backend_api'
        ? [body.answers.primary_route.choice, 'backend_api']
        : [body.answers.primary_route.choice];
    return TriageResultSchema.parse({
      issue_type: body.answers.issue_type.choice,
      severity: body.answers.severity.choice,
      routes,
      route_confidence: Math.min(
        body.answers.primary_route.confidence,
        body.answers.issue_type.confidence,
        body.answers.severity.confidence,
      ),
      reproduction_ready: Math.max(0, Math.min(1, body.answers.reproduction_ready.score / 2)),
      missing_information: [],
    });
  }
}
