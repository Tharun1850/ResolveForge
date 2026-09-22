import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

import { runProcess, type ProcessResult } from './process.js';
import type { TargetConfig } from './target-config.js';
import {
  RouteEvidenceSchema,
  type CaseId,
  type DiagnosticRoute,
  type EvidenceBundle,
  type RouteEvidence,
} from './types.js';

function unavailableEvidence(input: {
  route: DiagnosticRoute;
  reason: string;
  diagnostics?: Record<string, unknown>;
}): RouteEvidence {
  return RouteEvidenceSchema.parse({
    route: input.route,
    status: 'not_reproduced',
    expected_behavior: 'The configured diagnostic adapter records the expected behavior.',
    actual_behavior: input.reason,
    steps: [],
    assertions: [],
    artifacts: [],
    diagnostics: input.diagnostics ?? {},
  });
}

export class DiagnosticRunner {
  constructor(
    private readonly config: TargetConfig,
    private readonly timeoutMs: number,
  ) {}

  async run(input: {
    caseId: CaseId;
    issue: string;
    route: DiagnosticRoute;
    workingDirectory: string;
  }): Promise<RouteEvidence> {
    const adapter = this.config.diagnostics[input.route];
    if (!adapter) {
      return unavailableEvidence({
        route: input.route,
        reason: `No diagnostic adapter is configured for ${input.route}.`,
        diagnostics: { adapter_configured: false },
      });
    }
    let result: ProcessResult;
    try {
      result = await runProcess({
        command: adapter.command,
        args: adapter.args,
        cwd: input.workingDirectory,
        env: {
          RESOLVEFORGE_CASE_ID: input.caseId,
          RESOLVEFORGE_ISSUE: input.issue,
          RESOLVEFORGE_ROUTE: input.route,
        },
        timeoutMs: this.timeoutMs,
      });
    } catch (error) {
      return unavailableEvidence({
        route: input.route,
        reason: `The ${input.route} diagnostic adapter could not run.`,
        diagnostics: { adapter_configured: true, error: error instanceof Error ? error.message : String(error) },
      });
    }
    if (result.exitCode !== 0) {
      return unavailableEvidence({
        route: input.route,
        reason: `The ${input.route} diagnostic adapter exited with code ${String(result.exitCode)}.`,
        diagnostics: { adapter_configured: true, exit_code: result.exitCode, stderr: result.stderr },
      });
    }
    let value: unknown;
    try {
      value = JSON.parse(result.stdout);
    } catch (error) {
      return unavailableEvidence({
        route: input.route,
        reason: `The ${input.route} diagnostic adapter did not return valid JSON.`,
        diagnostics: { adapter_configured: true, parse_error: error instanceof Error ? error.message : String(error) },
      });
    }
    const parsed = RouteEvidenceSchema.safeParse(value);
    if (!parsed.success || parsed.data.route !== input.route) {
      return unavailableEvidence({
        route: input.route,
        reason: `The ${input.route} diagnostic adapter returned evidence that failed validation.`,
        diagnostics: {
          adapter_configured: true,
          validation_error: parsed.success
            ? 'The evidence route did not match the requested route.'
            : parsed.error.message,
        },
      });
    }
    const configuredArtifacts = [];
    for (const artifactPath of adapter.react_scan_artifacts) {
      const absolutePath = resolve(input.workingDirectory, artifactPath);
      try {
        await access(absolutePath);
      } catch {
        return unavailableEvidence({
          route: input.route,
          reason: `The configured React Scan artifact ${artifactPath} was not produced.`,
          diagnostics: { adapter_configured: true, missing_react_scan_artifact: artifactPath },
        });
      }
      configuredArtifacts.push({ kind: 'react_scan', path: artifactPath });
    }
    return RouteEvidenceSchema.parse({
      ...parsed.data,
      artifacts: [...parsed.data.artifacts, ...configuredArtifacts],
    });
  }

  async reproduce(input: {
    caseId: CaseId;
    issue: string;
    routes: DiagnosticRoute[];
    workingDirectory: string;
  }): Promise<EvidenceBundle> {
    const routes: RouteEvidence[] = [];
    for (const route of input.routes) {
      routes.push(await this.run({ ...input, route }));
    }
    return {
      case_id: input.caseId,
      issue: input.issue,
      routes,
      created_at: new Date().toISOString(),
    };
  }
}
