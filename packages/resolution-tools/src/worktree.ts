import { mkdir } from 'node:fs/promises';
import { join, posix, resolve } from 'node:path';

import { runProcess } from './process.js';

export async function createWorktree(input: {
  caseId: string;
  dataDir: string;
  repositoryPath: string;
  timeoutMs: number;
}): Promise<string> {
  const repository = resolve(input.repositoryPath);
  const rootResult = await runProcess({
    command: 'git',
    args: ['-C', repository, 'rev-parse', '--show-toplevel'],
    cwd: repository,
    timeoutMs: input.timeoutMs,
  });
  if (rootResult.exitCode !== 0) {
    throw new Error(`ResolveForge requires a Git repository. ${rootResult.output}`);
  }
  const worktreePath = join(input.dataDir, 'worktrees', input.caseId);
  await mkdir(join(input.dataDir, 'worktrees'), { recursive: true });
  const addResult = await runProcess({
    command: 'git',
    args: ['-C', repository, 'worktree', 'add', '--detach', worktreePath, 'HEAD'],
    cwd: repository,
    timeoutMs: input.timeoutMs,
  });
  if (addResult.exitCode !== 0) {
    throw new Error(`Could not create an isolated checkout. ${addResult.output}`);
  }
  return worktreePath;
}

export function isAllowedChange(input: { allowedScope: string; changedFile: string }): boolean {
  const scope = posix.normalize(input.allowedScope.replaceAll('\\', '/'));
  const file = posix.normalize(input.changedFile.replaceAll('\\', '/'));
  if (
    scope === '.' ||
    file === '.' ||
    posix.isAbsolute(scope) ||
    posix.isAbsolute(file) ||
    scope === '..' ||
    file === '..' ||
    scope.startsWith('../') ||
    file.startsWith('../')
  ) {
    return false;
  }
  return file === scope || file.startsWith(`${scope}/`);
}
