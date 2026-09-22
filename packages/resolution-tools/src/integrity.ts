import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

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

async function filesAt(path: string): Promise<string[]> {
  const metadata = await stat(path);
  return metadata.isDirectory() ? filesBelow(path) : [path];
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

export async function hashPaths(root: string, paths: string[]): Promise<string> {
  const hash = createHash('sha256');
  for (const configuredPath of [...paths].sort()) {
    const absolutePath = join(root, configuredPath);
    for (const path of await filesAt(absolutePath)) {
      hash.update(relative(root, path));
      hash.update('\0');
      hash.update(await readFile(path));
      hash.update('\0');
    }
  }
  return hash.digest('hex');
}

export function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
