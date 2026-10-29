'use client';
/* eslint-disable @next/next/no-img-element -- Cloudinary stores images resized to 2000px; admin previews use the provider URL directly. */
import { useState } from 'react';
import type { CatalogImage, CatalogProduct } from '@/lib/catalog';
import { writeAdmin } from '@/lib/references';
import { imageData } from '@/lib/image-upload';
export default function ProductGallery({
  product,
  configured,
}: {
  product: CatalogProduct;
  configured: boolean;
}) {
  const [images, setImages] = useState(product.images);
  const [scope, setScope] = useState('');
  const [alt, setAlt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fileKey, setFileKey] = useState(0);
  const [preview, setPreview] = useState('');
  const ownImages = images.filter((i) => i.variantId === (preview || null));
  const shown = ownImages.length
    ? ownImages
    : images.filter((i) => i.variantId === null);
  async function edit(image: CatalogImage) {
    setBusy(true);
    setError('');
    try {
      const saved = await writeAdmin(
        `products/${product.id}/images/${image.id}`,
        'PUT',
        {
          alt: image.alt,
          variantId: image.variantId,
          position: image.position,
        },
      );
      setImages((items) =>
        items
          .map((i) => (i.id === saved.id ? saved : i))
          .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
      );
      setNotice('Зміни зображення збережено.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="catalog-card">
      <h2>Зображення</h2>
      <p className="muted">
        JPEG, PNG або WebP до 3 МБ. До 20 зображень на товар. Якщо варіант не
        має власних фото, він використовує спільні.
      </p>
      {!configured && (
        <p role="status">
          Cloudinary ще не налаштовано. Збереження товарів доступне.
        </p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!file) return;
          setBusy(true);
          setError('');
          setNotice('');
          try {
            const data = await imageData(file);
            const image = await writeAdmin(
              `products/${product.id}/images`,
              'POST',
              { data, alt, variantId: scope || null },
            );
            setImages([...images, image]);
            setFile(null);
            setAlt('');
            setFileKey(fileKey + 1);
            setNotice('Зображення завантажено.');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset
          disabled={busy || !configured || Boolean(product.archivedAt)}
          className="catalog-fields"
        >
          <div className="catalog-grid">
            <label>
              Файл зображення
              <input
                key={fileKey}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
            <label>
              Для кого
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="">Спільне для товару</option>
                {product.variants
                  .filter((v) => !v.archivedAt)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.sku} · {v.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Опис зображення
              <input
                maxLength={250}
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
              />
            </label>
          </div>
          <button type="submit" disabled={images.length >= 20}>
            {busy ? 'Завантаження…' : 'Завантажити зображення'}
          </button>
        </fieldset>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="image-grid">
        {images.map((image) => (
          <ImageCard
            key={image.id}
            image={image}
            product={product}
            busy={busy}
            save={edit}
            remove={async () => {
              setBusy(true);
              setError('');
              try {
                const result = await writeAdmin(
                  `products/${product.id}/images/${image.id}`,
                  'DELETE',
                  {},
                );
                setImages(images.filter((i) => i.id !== image.id));
                setNotice(
                  result.cleanupPending
                    ? 'Зображення від’єднано. Файл очікує повторного очищення.'
                    : 'Зображення видалено.',
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        ))}
      </div>
      <h3>Перегляд галереї</h3>
      <label>
        Показати для
        <select value={preview} onChange={(e) => setPreview(e.target.value)}>
          <option value="">Товару</option>
          {product.variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.sku}
            </option>
          ))}
        </select>
      </label>
      {preview && !ownImages.length && (
        <p>Використовуються спільні зображення товару.</p>
      )}
      <div className="gallery-preview">
        {shown.map((i) => (
          <img
            key={i.id}
            src={i.url}
            alt={i.alt || product.name}
            width={160}
            height={160}
            loading="lazy"
          />
        ))}
        {!shown.length && <p>Зображення ще не додано.</p>}
      </div>
    </section>
  );
}
function ImageCard({
  image,
  product,
  busy,
  save,
  remove,
}: {
  image: CatalogImage;
  product: CatalogProduct;
  busy: boolean;
  save: (image: CatalogImage) => Promise<void>;
  remove: () => Promise<void>;
}) {
  const [alt, setAlt] = useState(image.alt);
  const [position, setPosition] = useState(image.position);
  const [scope, setScope] = useState(image.variantId || '');
  return (
    <form
      className="image-card"
      onSubmit={(e) => {
        e.preventDefault();
        void save({ ...image, alt, position, variantId: scope || null });
      }}
    >
      <fieldset disabled={busy} className="catalog-fields">
        <img
          src={image.url}
          alt={image.alt || product.name}
          width={240}
          height={180}
          loading="lazy"
        />
        <label>
          Опис фото
          <input
            maxLength={250}
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
          />
        </label>
        <label>
          Порядок
          <input
            type="number"
            min={0}
            max={999}
            required
            value={position}
            onChange={(e) => setPosition(Number(e.target.value))}
          />
        </label>
        <label>
          Прив’язка
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">Спільне фото</option>
            {product.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.sku}
              </option>
            ))}
          </select>
        </label>
        <div className="catalog-actions">
          <button type="submit">Зберегти фото</button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Видалити це зображення?')) void remove();
            }}
          >
            Видалити фото
          </button>
        </div>
      </fieldset>
    </form>
  );
}
