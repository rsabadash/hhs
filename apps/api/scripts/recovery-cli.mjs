import { recover, RecoveryError } from './recovery.mjs';
try {
  await recover(process.argv[2], process.argv[3]);
} catch (error) {
  // Only our validation errors are safe to print; database errors can include data.
  const safe = error instanceof RecoveryError;
  console.error(
    safe
      ? error.message
      : 'Database recovery failed. Check the target configuration.',
  );
  process.exitCode = 1;
}
