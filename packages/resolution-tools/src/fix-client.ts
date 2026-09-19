import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { JcodeClient } from '@1jehuang/jcode-sdk';

export interface FixRun {
  cancel(): Promise<void>;
  completion: Promise<string>;
}

export interface FixClient {
  start(input: {
    evidencePath: string;
    issue: string;
    workingDir: string;
    recordEvent: (event: string) => void;
  }): Promise<FixRun>;
}

export class JcodeFixClient implements FixClient {
  async start(input: {
    evidencePath: string;
    issue: string;
    workingDir: string;
    recordEvent: (event: string) => void;
  }): Promise<FixRun> {
    const client = await JcodeClient.launch({ inheritLogins: true, workingDir: input.workingDir });
    const session = await client.createSession(input.workingDir);
    const prompt = [
      'Resolve the reported issue using the saved evidence.',
      `Issue: ${input.issue}`,
      `Evidence: ${input.evidencePath}`,
      'Edit only files under packages/resolveforge-demo/src.',
      'Do not edit tests, commit, push, create a pull request, access parent paths, or use the network.',
      'Run only focused local validation commands. Return a concise summary of the code change and remaining assumptions.',
    ].join('\n');
    let deniedPermission: string | null = null;
    const completion = client
      .run(session.session_id, prompt, {
        autoApprove: false,
        onEvent: event => {
          input.recordEvent(JSON.stringify(event));
          if (event.ev === 'permission_request') {
            deniedPermission = `${event.tool_name} ${event.description}`;
            input.recordEvent(`Denied JCode permission request: ${event.tool_name} ${event.description}`);
            void client.respondToPermission(event.session_id, event.request_id, 'deny');
          }
        },
      })
      .then(async result => {
        await client.close();
        if (deniedPermission) {
          throw new Error(`JCode requested an unapproved action: ${deniedPermission}`);
        }
        return result.text || 'JCode completed without a text summary.';
      })
      .catch(async (error: unknown) => {
        await client.close();
        throw error;
      });
    return {
      cancel: async () => {
        await client.cancel(session.session_id);
        await client.close();
      },
      completion,
    };
  }
}

async function replaceRequired(input: { path: string; from: string; to: string }): Promise<void> {
  const content = await readFile(input.path, 'utf8');
  if (!content.includes(input.from)) {
    throw new Error(`The expected seeded defect is missing from ${input.path}.`);
  }
  await writeFile(input.path, content.replace(input.from, input.to), 'utf8');
}

export class DemoFixClient implements FixClient {
  start(input: {
    evidencePath: string;
    issue: string;
    workingDir: string;
    recordEvent: (event: string) => void;
  }): Promise<FixRun> {
    const completion = (async () => {
      input.recordEvent('demo worker started');
      const modelPath = join(input.workingDir, 'packages/resolveforge-demo/src/invoice-model.ts');
      const issue = input.issue.toLowerCase();
      if (issue.includes('discount') || issue.includes('tax')) {
        await replaceRequired({
          path: modelPath,
          from: 'return subtotal * (1 + taxRate) - discount;',
          to: 'return (subtotal - discount) * (1 + taxRate);',
        });
      } else {
        await replaceRequired({
          path: modelPath,
          from: [
            'export function exportInvoices(status: InvoiceStatus | null): Invoice[] {',
            '  // Seeded defect. The export ignores an active filter until ResolveForge fixes it.',
            '  void status;',
            '  return invoices;',
            '}',
          ].join('\n'),
          to: [
            'export function exportInvoices(status: InvoiceStatus | null): Invoice[] {',
            '  return status ? invoices.filter(invoice => invoice.status === status) : invoices;',
            '}',
          ].join('\n'),
        });
        await replaceRequired({
          path: modelPath,
          from: [
            'export function displayedInvoices(visibleInvoices: Invoice[]): Invoice[] {',
            '  // Seeded defect. The table renders every invoice after the status filter changes.',
            '  void visibleInvoices;',
            '  return invoices;',
            '}',
          ].join('\n'),
          to: [
            'export function displayedInvoices(visibleInvoices: Invoice[]): Invoice[] {',
            '  return visibleInvoices;',
            '}',
          ].join('\n'),
        });
      }
      input.recordEvent(`demo worker used ${input.evidencePath}`);
      return 'Demo patch applied to the seeded invoice defect.';
    })();
    return Promise.resolve({ cancel: () => Promise.resolve(), completion });
  }
}
