import '../src/env.js';
import { randomUUID } from 'node:crypto';
import { ImageStore } from '../src/images.js';
const store = new ImageStore();
const publicId = `hhs/smoke/${randomUUID()}`;
if (!store.configured()) {
  console.error(
    'Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in the ignored API environment.',
  );
  process.exitCode = 1;
} else {
  try {
    const bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNQ8bX9DwAC9QGuYeB4NwAAAABJRU5ErkJggg==',
      'base64',
    );
    const url = await store.upload(publicId, bytes);
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (
      !response.ok ||
      !response.headers.get('content-type')?.startsWith('image/')
    )
      throw Error('Delivery failed');
    console.log('Cloudinary upload and HTTPS image delivery passed.');
  } catch {
    console.error(
      'Cloudinary smoke failed. Verify credentials and provider availability.',
    );
    process.exitCode = 1;
  } finally {
    try {
      await store.destroy(publicId);
      console.log('Disposable smoke asset deleted.');
    } catch {
      console.error(
        `Cleanup failed; remove the disposable Cloudinary asset: ${publicId}`,
      );
      process.exitCode = 1;
    }
  }
}
