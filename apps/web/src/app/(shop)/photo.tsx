'use client';
import Image from 'next/image';
import { useState } from 'react';
import type { PublicImage } from '../../lib/storefront';
export function Photo({
  image,
  name,
  sizes = '(max-width: 640px) 90vw, 33vw',
}: {
  image: PublicImage | null;
  name: string;
  sizes?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className="shop-photo">
      {image && failed !== image.url ? (
        <Image
          src={image.url}
          alt={image.alt || name}
          fill
          sizes={sizes}
          onError={() => setFailed(image.url)}
        />
      ) : (
        <span
          className="photo-placeholder"
          role="img"
          aria-label={`Фото відсутнє: ${name}`}
        >
          <span aria-hidden="true">◌</span>Фото незабаром
        </span>
      )}
    </div>
  );
}
