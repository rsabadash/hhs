'use client';
import { useState } from 'react';
import Link from 'next/link';
import { inquiry, uah, type PublicProduct } from '../../lib/storefront';
import { Photo } from './photo';
export function ProductDetail({
  product,
  requestedVariant,
  instagram,
}: {
  product: PublicProduct;
  requestedVariant?: string;
  instagram: string | null;
}) {
  const [variantId, setVariantId] = useState(
    requestedVariant ?? product.variants[0]?.id ?? '',
  );
  const [imageIndex, setImageIndex] = useState(0);
  const [copyStatus, setCopyStatus] = useState('');
  const [message, setMessage] = useState('');
  const variant = product.variants.find((v) => v.id === variantId);
  const images = variant?.images ?? product.images;
  function select(id: string) {
    setVariantId(id);
    setImageIndex(0);
    setMessage('');
    setCopyStatus('');
    const url = new URL(window.location.href);
    url.searchParams.set('variant', id);
    window.history.replaceState(null, '', url);
  }
  async function copy() {
    if (!variant) return;
    const url = new URL(`/products/${product.id}`, window.location.origin);
    url.searchParams.set('variant', variant.id);
    const text = inquiry(product, variant, url.toString());
    setMessage(text);
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('Повідомлення скопійовано. Вставте його в Instagram.');
    } catch {
      setCopyStatus(
        'Не вдалося скопіювати автоматично. Виділіть і скопіюйте текст нижче.',
      );
    }
  }
  return (
    <>
      <div className="product-detail">
        <section aria-label="Фотографії товару" className="product-gallery">
          <Photo
            image={images[imageIndex] ?? null}
            name={product.name}
            sizes="(max-width: 800px) 90vw, 50vw"
          />
          {images.length > 1 ? (
            <div className="gallery-controls">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  aria-label={`Фото ${i + 1}`}
                  aria-pressed={imageIndex === i}
                  onClick={() => setImageIndex(i)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          ) : null}
        </section>
        <section className="product-info">
          <p className="eyebrow">{product.category.name}</p>
          <h1>{product.name}</h1>
          <label>
            Варіант
            <select value={variantId} onChange={(e) => select(e.target.value)}>
              {!variant ? (
                <option value={variantId}>Оберіть доступний варіант</option>
              ) : null}
              {product.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ·{' '}
                  {v.attributes
                    .map(
                      (a) =>
                        `${a.attribute.name}: ${a.label}${a.attribute.measurementSymbol ? ` ${a.attribute.measurementSymbol}` : ''}`,
                    )
                    .join(', ')}{' '}
                  · {v.sku}
                </option>
              ))}
            </select>
          </label>
          {variant ? (
            <div aria-live="polite">
              <p className="sku">SKU: {variant.sku}</p>
              <p className="detail-price">
                {uah(variant.price)} <small>/ {variant.unit.symbol}</small>
              </p>
              <p
                className={`availability ${variant.inStock ? 'available' : ''}`}
              >
                {variant.inStock ? 'Є в наявності' : 'Немає в наявності'}
              </p>
              <dl className="product-attributes">
                {[...product.attributes, ...variant.attributes].map((a) => (
                  <div key={a.attribute.id}>
                    <dt>{a.attribute.name}</dt>
                    <dd>
                      {a.label}
                      {a.attribute.measurementSymbol
                        ? ` ${a.attribute.measurementSymbol}`
                        : ''}
                    </dd>
                  </div>
                ))}
                <div>
                  <dt>Одиниця продажу</dt>
                  <dd>
                    {variant.unit.name} ({variant.unit.symbol})
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <p role="alert" className="shop-notice">
              Цей варіант більше недоступний. Оберіть інший зі списку.
            </p>
          )}
          {variant ? (
            <div className="contact-box">
              <h2>
                {variant.inStock
                  ? 'Замовити через Instagram'
                  : 'Дізнатися про надходження'}
              </h2>
              <p>
                Скопіюйте повідомлення та надішліть його нам в Instagram.
                Наявність і кількість уточнимо перед замовленням.
              </p>
              <button onClick={copy}>Скопіювати повідомлення</button>
              {instagram ? (
                <a
                  className="shop-button secondary"
                  href={instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Відкрити Instagram ↗
                </a>
              ) : (
                <p>Контакт магазину ще налаштовується.</p>
              )}
              <p role="status">{copyStatus}</p>
              {message ? (
                <label>
                  Текст повідомлення
                  <textarea
                    readOnly
                    value={message}
                    rows={7}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </label>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
      <section className="product-description">
        <h2>Про матеріал</h2>
        <p>{product.description || 'Опис незабаром.'}</p>
        <div className="product-tags">
          {product.tags.map((tag) => (
            <Link key={tag} href={`/?tag=${encodeURIComponent(tag)}`}>
              {tag}
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
