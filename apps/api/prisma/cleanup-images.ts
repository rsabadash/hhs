import '../src/env.js';
import { Database } from '../src/db.js';
import { ImageService, ImageStore } from '../src/images.js';
const db = new Database();
try {
  console.log(await new ImageService(db, new ImageStore()).cleanup());
} catch {
  console.error(
    'Image cleanup failed. Verify Cloudinary configuration and retry.',
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
