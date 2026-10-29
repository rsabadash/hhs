import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z
    .url()
    .refine(
      (value) => /^postgres(?:ql)?:\/\//.test(value),
      'Use a PostgreSQL URL',
    ),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
});

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    // Report variable names only: connection strings may contain credentials.
    throw new Error(
      `Invalid configuration: ${[...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`,
    );
  }
  return result.data;
}
