import type { DiagnosticRoute, EvidenceBundle, RouteEvidence } from './types.js';

function evidenceForDemoRoute(input: { issue: string; route: DiagnosticRoute }): RouteEvidence {
  const text = input.issue.toLowerCase();
  switch (input.route) {
    case 'react_ui':
      return {
        route: 'react_ui',
        status: 'reproduced',
        expected_behavior: 'Changing the invoice status filter shows only matching invoice rows.',
        actual_behavior: 'The seeded invoice view renders paid rows after selecting Unpaid.',
        steps: ['Open the invoice page.', 'Select Unpaid in the status filter.'],
        assertions: [{ name: 'visible invoice rows', passed: false, detail: 'The table contains paid invoice rows.' }],
        artifacts: [],
        diagnostics: { selected_status: 'unpaid', contains_paid_invoice: true, route: 'react_ui' },
      };
    case 'backend_api':
      if (text.includes('discount') || text.includes('tax')) {
        return {
          route: 'backend_api',
          status: 'reproduced',
          expected_behavior: 'Discount is applied before tax.',
          actual_behavior: 'The seeded API applies discount after tax.',
          steps: ['Request a quote with subtotal 100, tax 10%, and discount 10.'],
          assertions: [{ name: 'invoice total', passed: false, detail: 'Expected 99, received 100.' }],
          artifacts: [],
          diagnostics: { expected_total: 99, actual_total: 100 },
        };
      }
      return {
        route: 'backend_api',
        status: 'reproduced',
        expected_behavior: 'The export endpoint honors the active invoice status filter.',
        actual_behavior: 'The seeded export endpoint returns paid invoices for an unpaid filter.',
        steps: ['Request /api/export?status=unpaid.'],
        assertions: [{ name: 'CSV status filter', passed: false, detail: 'CSV contains a paid invoice.' }],
        artifacts: [],
        diagnostics: { response_status: 200, contains_paid_invoice: true },
      };
    case 'database':
      return {
        route: 'database',
        status: 'blocked',
        expected_behavior: 'A rename migration preserves existing invoice data.',
        actual_behavior: 'The seeded migration uses DROP COLUMN and requires human review.',
        steps: ['Inspect the migration plan without executing SQL.'],
        assertions: [{ name: 'destructive migration check', passed: false, detail: 'DROP COLUMN detected.' }],
        artifacts: [],
        diagnostics: { destructive_tokens: ['DROP COLUMN'], execution_blocked: true },
      };
    case 'configuration':
      return {
        route: 'configuration',
        status: 'not_reproduced',
        expected_behavior: 'The configured target starts with its documented environment values.',
        actual_behavior: 'No startup command or target configuration was supplied.',
        steps: [],
        assertions: [],
        artifacts: [],
        diagnostics: {},
      };
    case 'documentation':
      return {
        route: 'documentation',
        status: 'not_reproduced',
        expected_behavior: 'Documentation matches the implemented behavior.',
        actual_behavior: 'No document path or expected behavior was supplied.',
        steps: [],
        assertions: [],
        artifacts: [],
        diagnostics: {},
      };
    case 'web_ui':
      return {
        route: 'web_ui',
        status: 'not_reproduced',
        expected_behavior: 'The browser flow completes.',
        actual_behavior: 'No browser target was supplied.',
        steps: [],
        assertions: [],
        artifacts: [],
        diagnostics: {},
      };
    case 'unknown':
      return {
        route: 'unknown',
        status: 'not_reproduced',
        expected_behavior: 'The report identifies an observable behavior.',
        actual_behavior: 'The report has no diagnostic route.',
        steps: [],
        assertions: [],
        artifacts: [],
        diagnostics: {},
      };
    default: {
      const exhaustive: never = input.route;
      return exhaustive;
    }
  }
}

export function reproduceDemoIssue(input: {
  caseId: EvidenceBundle['case_id'];
  issue: string;
  routes: DiagnosticRoute[];
}): EvidenceBundle {
  return {
    case_id: input.caseId,
    issue: input.issue,
    routes: input.routes.map(route => evidenceForDemoRoute({ issue: input.issue, route })),
    created_at: new Date().toISOString(),
  };
}

export function reproduceLiveIssue(input: {
  caseId: EvidenceBundle['case_id'];
  issue: string;
  routes: DiagnosticRoute[];
}): EvidenceBundle {
  return {
    case_id: input.caseId,
    issue: input.issue,
    routes: input.routes.map(route => ({
      route,
      status: 'not_reproduced',
      expected_behavior: 'A configured live diagnostic adapter records the observed behavior.',
      actual_behavior: 'No live diagnostic adapter is configured for this route.',
      steps: [],
      assertions: [],
      artifacts: [],
      diagnostics: { integration_mode: 'live', adapter_configured: false },
    })),
    created_at: new Date().toISOString(),
  };
}
