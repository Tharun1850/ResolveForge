import { resolve } from 'node:path';

import { z } from 'zod';

const EnvironmentSchema = z
  .object({
    RESOLVEFORGE_COMMAND_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
    RESOLVEFORGE_COORDINATOR_MODEL: z.string().trim().min(1).optional(),
    RESOLVEFORGE_DATA_DIR: z.string().trim().min(1).default('.resolveforge'),
    RESOLVEFORGE_INTEGRATION_MODE: z.enum(['demo', 'live']).default('demo'),
    RESOLVEFORGE_MAX_PATCH_ATTEMPTS: z.coerce.number().int().min(1).max(2).default(2),
    RESOLVEFORGE_PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
    RESOLVEFORGE_TARGET_REPO: z.string().trim().min(1).optional(),
    RESOLVEFORGE_TRUEFORGE_URL: z.url().default('http://localhost:8790'),
    TYPESAFE_API_KEY: z.string().trim().min(1).optional(),
  })
  .strict();

export type ResolveForgeConfig = {
  commandTimeoutMs: number;
  coordinatorModel: string | null;
  dataDir: string;
  integrationMode: 'demo' | 'live';
  maxPatchAttempts: number;
  port: number;
  targetRepo: string | null;
  trueForgeUrl: string;
  typeSafeApiKey: string | null;
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): ResolveForgeConfig {
  const parsed = EnvironmentSchema.parse(env);
  return {
    commandTimeoutMs: parsed.RESOLVEFORGE_COMMAND_TIMEOUT_MS,
    coordinatorModel: parsed.RESOLVEFORGE_COORDINATOR_MODEL ?? null,
    dataDir: resolve(parsed.RESOLVEFORGE_DATA_DIR),
    integrationMode: parsed.RESOLVEFORGE_INTEGRATION_MODE,
    maxPatchAttempts: parsed.RESOLVEFORGE_MAX_PATCH_ATTEMPTS,
    port: parsed.RESOLVEFORGE_PORT,
    targetRepo: parsed.RESOLVEFORGE_TARGET_REPO ? resolve(parsed.RESOLVEFORGE_TARGET_REPO) : null,
    trueForgeUrl: parsed.RESOLVEFORGE_TRUEFORGE_URL,
    typeSafeApiKey: parsed.TYPESAFE_API_KEY ?? null,
  };
}
