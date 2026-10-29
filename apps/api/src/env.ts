import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

// Environment variables injected by hosting/CI win, followed by API-local
// overrides, then the files managed by `neon deploy` at the workspace root.
// src/ and dist/ have the same depth, so this also works in production builds.
config({
  path: [
    fileURLToPath(new URL('../.env', import.meta.url)),
    fileURLToPath(new URL('../../../.env.local', import.meta.url)),
    fileURLToPath(new URL('../../../.env', import.meta.url)),
  ],
  quiet: true,
});
