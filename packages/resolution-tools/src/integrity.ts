import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

export const ACCEPTANCE_DIRECTORY = join('packages', 'resolution-tools', 'test', 'acceptance');
export const ACCEPTANCE_SCRIPT = join(ACCEPTANCE_DIRECTORY, 'invoice.acceptance.ts');

async function filesBelow(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async entry => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return filesBelow(path);
      }
      return entry.isFile() ? [path] : [];
    }),
  );
  return nested.flat().sort();
}

export async function hashDirectory(directory: string): Promise<string> {
  const hash = createHash('sha256');
  for (const path of await filesBelow(directory)) {
    hash.update(relative(directory, path));
    hash.update('\0');
    hash.update(await readFile(path));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
