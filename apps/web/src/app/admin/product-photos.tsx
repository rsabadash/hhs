'use client';
/* eslint-disable @next/next/no-img-element -- Local file previews and bounded Cloudinary thumbnails. */
import { useEffect, useRef, useState } from 'react';
import type { CatalogImage } from '@/lib/catalog';
import { validateImageFile } from '@/lib/image-upload';

export type DraftPhoto = {
  key: string;
  scope: string | null;
  file?: File;
  image?: CatalogImage;
  alt: string;
  position: number;
};

export default function ProductPhotos({
  label,
  photos,
  remaining,
  disabled,
  scopes,
  add,
  change,
  remove,
}: {
  label: string;
  photos: DraftPhoto[];
  remaining: number;
  disabled: boolean;
  scopes: { key: string; name: string }[];
  add: (files: File[]) => void;
  change: (key: string, patch: Partial<DraftPhoto>) => void;
  remove: (key: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  return (
    <div className="product-photos">
      <div className="photo-toolbar">
        <h4>{label}</h4>
        <button
          type="button"
          disabled={disabled || remaining <= 0}
          onClick={() => input.current?.click()}
        >
          Додати фото
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          aria-label={label}
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled || remaining <= 0}
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = '';
            setError('');
            try {
              if (files.length > remaining)
                throw Error(
                  `До 20 фото на товар разом із варіантами. Можна додати ще ${remaining}.`,
                );
              files.forEach(validateImageFile);
              add(files);
            } catch (error) {
              setError((error as Error).message);
            }
          }}
        />
      </div>
      <p className="muted photo-help">
        Можна вибрати кілька фото. JPEG, PNG або WebP до 3 МБ кожне. Зміни
        збережуться кнопкою «Зберегти товар».
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="photo-grid">
        {photos.map((photo) => (
          <div className="photo-item" key={photo.key}>
            <PhotoPreview photo={photo} />
            {photo.file && <span className="status-pill">До збереження</span>}
            <button type="button" onClick={() => remove(photo.key)}>
              Прибрати фото
            </button>
            <details>
              <summary>Налаштування фото</summary>
              <label>
                Опис фото
                <input
                  maxLength={250}
                  value={photo.alt}
                  onChange={(e) => change(photo.key, { alt: e.target.value })}
                />
              </label>
              <label>
                Порядок
                <input
                  type="number"
                  min={0}
                  max={999}
                  required
                  value={photo.position}
                  onChange={(e) =>
                    change(photo.key, { position: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Прив’язка
                <select
                  value={photo.scope || ''}
                  onChange={(e) =>
                    change(photo.key, { scope: e.target.value || null })
                  }
                >
                  <option value="">Спільне фото</option>
                  {scopes.map((scope) => (
                    <option key={scope.key} value={scope.key}>
                      {scope.name}
                    </option>
                  ))}
                </select>
              </label>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
}

function PhotoPreview({ photo }: { photo: DraftPhoto }) {
  const preview = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!photo.file) return;
    const url = URL.createObjectURL(photo.file);
    if (preview.current) preview.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [photo.file]);
  return (
    <img
      ref={preview}
      src={photo.image?.url}
      alt={photo.alt || photo.file?.name || 'Фото товару'}
      width={180}
      height={140}
    />
  );
}
