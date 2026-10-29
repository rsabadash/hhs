import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
// Disposable gallery assets for browser behavior; no provider writes.
export async function galleryFixture(
  productId: string,
  variantId: string,
  marker: string,
) {
  if (
    !process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
  )
    throw Error('Isolated database required');
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try {
    for (const [name, variant] of [
      ['Спільне фото', null],
      ['Варіантне фото', variantId],
      ['Друге фото', variantId],
    ] as const)
      await pool.query(
        'INSERT INTO "Image" (id,"publicId",url,alt,position,"productId","variantId") VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [
          randomUUID(),
          `${marker}-${name}`,
          `https://res.cloudinary.com/demo/image/upload/${encodeURIComponent(marker + name)}.png`,
          name,
          name === 'Друге фото' ? 1 : 0,
          productId,
          variant,
        ],
      );
  } finally {
    await pool.end();
  }
}
