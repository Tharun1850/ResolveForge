import { JcodeClient } from '@1jehuang/jcode-sdk';

import type { Command } from './target-config.js';
import type { EvidenceBundle } from './types.js';

export interface FixRun {
  cancel(): Promise<void>;
  completion: Promise<string>;
}

export interface FixClient {
  start(input: {
    allowedPaths: string[];
    evidence: EvidenceBundle;
    issue: string;
    recordEvent: (event: string) => void;
    validationCommands: Command[];
    workingDir: string;
  }): Promise<FixRun>;
}

export function buildFixPrompt(input: {
  allowedPaths: string[];
  evidence: EvidenceBundle;
  issue: string;
  validationCommands: Command[];
}): string {
  return [
    'Resolve the reported issue using the supplied evidence.',
    `Issue: ${input.issue}`,
    `Evidence: ${JSON.stringify(input.evidence)}`,
    `Edit only these repository-relative paths: ${input.allowedPaths.join(', ')}.`,
    `Use these validation commands when relevant: ${input.validationCommands
      .map(command => [command.command, ...command.args].join(' '))
      .join('; ')}.`,
    'Do not edit protected tests, commit, push, create a pull request, access parent paths, or use the network.',
    'Run only focused local validation commands. Return a concise summary of the code change and remaining assumptions.',
  ].join('\n');
}

export class JcodeFixClient implements FixClient {
  async start(input: {
    allowedPaths: string[];
    evidence: EvidenceBundle;
    issue: string;
    recordEvent: (event: string) => void;
    validationCommands: Command[];
    workingDir: string;
  }): Promise<FixRun> {
    const client = await JcodeClient.launch({ inheritLogins: true, workingDir: input.workingDir });
    const session = await client.createSession(input.workingDir);
    const prompt = buildFixPrompt(input);
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
