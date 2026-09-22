import { spawn } from 'node:child_process';

export interface ProcessResult {
  exitCode: number;
  output: string;
  stderr: string;
  stdout: string;
}

export function runProcess(input: {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  timeoutMs: number;
}): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: input.env === undefined ? process.env : { ...process.env, ...input.env },
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += String(chunk);
    });
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
    });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${input.command} timed out.`));
    }, input.timeoutMs);
    child.once('error', error => {
      clearTimeout(timer);
      reject(new Error(`Could not start ${input.command}.`, { cause: error }));
    });
    child.once('close', code => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1, output: `${stdout}${stderr}`, stderr, stdout });
    });
  });
}
