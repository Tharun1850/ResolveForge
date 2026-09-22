import { readFile } from 'node:fs/promises';
import { posix, resolve, win32 } from 'node:path';

import { z } from 'zod';

import { DiagnosticRouteSchema } from './types.js';

const RelativePathSchema = z
  .string()
  .trim()
  .min(1)
  .refine(value => {
    const normalized = posix.normalize(value.replaceAll('\\', '/'));
    return (
      normalized !== '.' &&
      normalized !== '..' &&
      !normalized.startsWith('../') &&
      !posix.isAbsolute(normalized) &&
      !win32.isAbsolute(value)
    );
  }, 'Path must stay within the target repository.');

export const CommandSchema = z
  .object({
    command: z.string().trim().min(1),
    args: z.array(z.string()).default([]),
  })
  .strict();

const DiagnosticAdapterSchema = CommandSchema.extend({
  react_scan_artifacts: z.array(RelativePathSchema).default([]),
}).strict();

export const TargetConfigSchema = z
  .object({
    allowed_paths: z.array(RelativePathSchema).min(1),
    diagnostics: z.partialRecord(DiagnosticRouteSchema, DiagnosticAdapterSchema).default({}),
    verification: z
      .object({
        commands: z.array(CommandSchema).min(1),
        protected_paths: z.array(RelativePathSchema).min(1),
      })
      .strict(),
  })
  .strict();

export type Command = z.infer<typeof CommandSchema>;
export type TargetConfig = z.infer<typeof TargetConfigSchema>;

export async function readTargetConfig(repositoryPath: string): Promise<TargetConfig> {
  const path = resolve(repositoryPath, '.resolveforge', 'config.json');
  let content: string;
  try {
    content = await readFile(path, 'utf8');
  } catch (error) {
    throw new Error(`Could not read target configuration at ${path}.`, { cause: error });
  }
  try {
    return TargetConfigSchema.parse(JSON.parse(content));
  } catch (error) {
    throw new Error(`Invalid target configuration at ${path}.`, { cause: error });
  }
}
