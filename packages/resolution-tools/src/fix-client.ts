import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { JcodeClient, type ApiEvent } from '@1jehuang/jcode-sdk';

export type FixRun = {
  cancel(): Promise<void>;
  completion: Promise<string>;
};

export interface FixClient {
  start(input: {
    evidencePath: string;
    issue: string;
    workingDir: string;
    recordEvent: (event: string) => void;
  }): Promise<FixRun>;
}

function decisionForPermission(event: Extract<ApiEvent, { ev: 'permission_request' }>): 'allow' | 'deny' {
  const text = `${event.tool_name} ${event.description}`.toLowerCase();
  const denied = ['git commit', 'git push', 'pull request', 'curl ', 'wget ', 'http://', 'https://', '../', 'rm -rf'];
  if (denied.some(token => text.includes(token))) {
    return 'deny';
  }
  return 'allow';
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
    const completion = client
      .run(session.session_id, prompt, {
        autoApprove: false,
        onEvent: event => {
          input.recordEvent(JSON.stringify(event));
          if (event.ev === 'permission_request') {
            const decision = decisionForPermission(event);
            void client.respondToPermission(event.session_id, event.request_id, decision);
          }
        },
      })
      .then(async result => {
        await client.close();
        return result.text || 'JCode completed without a text summary.';
      })
      .catch(async error => {
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
  async start(input: {
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
          from: 'return invoices;',
          to: 'return status ? invoices.filter(invoice => invoice.status === status) : invoices;',
        });
      }
      input.recordEvent(`demo worker used ${input.evidencePath}`);
      return 'Demo patch applied to the seeded invoice defect.';
    })();
    return { cancel: async () => undefined, completion };
  }
}
