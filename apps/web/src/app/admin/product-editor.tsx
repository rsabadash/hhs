'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { writeAdmin } from '@/lib/references';
import type { CatalogProduct, CatalogVariant } from '@/lib/catalog';
import ReferencePicker from './reference-picker';
import ProductAttributes from './product-attributes';
import ProductGallery from './product-gallery';
import { imageData } from '@/lib/image-upload';
const newVariant = (): CatalogVariant => ({
  name: '',
  sku: '',
  unitId: '',
  status: 'DRAFT',
  sellPrice: null,
  attributes: [],
});
export default function ProductEditor({
  initial,
  imagesConfigured = false,
}: {
  initial?: CatalogProduct;
  imagesConfigured?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [persisted, setPersisted] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [imageScope, setImageScope] = useState('');
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [category, setCategory] = useState(initial?.category || null);
  const [tags, setTags] = useState(
    initial?.tags.map((t) => t.tag.name).join(', ') || '',
  );
  const [attributes, setAttributes] = useState(initial?.attributes || []);
  const [archived, setArchived] = useState(Boolean(initial?.archivedAt));
  const [variants, setVariants] = useState<CatalogVariant[]>(
    initial?.variants || [newVariant()],
  );
  const change = (index: number, patch: Partial<CatalogVariant>) => {
    setSaved(false);
    setVariants((v) =>
      v.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  };
  return (
    <section className="catalog-page">
      <Link href="/admin/products">← Товари</Link>
      <p className="eyebrow">Каталог · UAH</p>
      <h1>{persisted ? 'Редагувати товар' : 'Новий товар'}</h1>
      <p className="muted">
        Спільні властивості описують товар. Кожен варіант має власний SKU та
        одиницю продажу.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          setSaved(false);
          let productSaved = false;
          try {
            // Validate/read the file before creating a product. Upload only once
            // its product and variant IDs exist.
            const upload = file ? await imageData(file) : null;
            const imageVariant =
              imageScope === '' ? null : variants[Number(imageScope)];
            if (upload && (archived || imageVariant?.archivedAt))
              throw Error('Оберіть активний товар або варіант для зображення.');
            const data: CatalogProduct = await writeAdmin(
              persisted ? `products/${persisted.id}` : 'products',
              persisted ? 'PUT' : 'POST',
              {
                name,
                description,
                categoryId: category?.id || '',
                archived,
                updatedAt: persisted?.updatedAt,
                tags: tags
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean),
                attributes: attributes.map(({ attributeId, valueId }) => ({
                  attributeId,
                  valueId,
                })),
                variants: variants.map((v) => ({
                  id: v.id,
                  name: v.name,
                  sku: v.sku,
                  unitId: v.unitId,
                  status: archived || v.archivedAt ? 'DRAFT' : v.status,
                  sellPrice: v.sellPrice?.replace(',', '.') || null,
                  archived: Boolean(v.archivedAt),
                  attributes: v.attributes.map(({ attributeId, valueId }) => ({
                    attributeId,
                    valueId,
                  })),
                })),
              },
            );
            productSaved = true;
            setPersisted(data);
            // Preserve form order and IDs on an upload failure so retrying
            // updates this product rather than creating duplicate SKUs.
            const matchingVariant = (sku: string) =>
              data.variants.find(
                (v) => v.sku === sku.trim().normalize('NFC').toUpperCase(),
              );
            setVariants(
              variants.map((v) => ({ ...v, id: matchingVariant(v.sku)?.id })),
            );
            if (upload) {
              const variantId = imageVariant
                ? matchingVariant(imageVariant.sku)?.id
                : null;
              if (imageVariant && !variantId)
                throw Error('Варіант для зображення не знайдено.');
              await writeAdmin(`products/${data.id}/images`, 'POST', {
                data: upload,
                alt: (imageVariant
                  ? `${name} · ${imageVariant.name}`
                  : name
                ).slice(0, 250),
                variantId,
              });
              setFile(null);
              setFileKey((key) => key + 1);
            }
            setSaved(true);
            router.replace(`/admin/products/${data.id}`);
            router.refresh();
          } catch (e) {
            setError(
              productSaved
                ? `Товар збережено, але зображення не завантажено. ${(e as Error).message} Натисніть «Зберегти товар», щоб повторити, або приберіть файл.`
                : (e as Error).message,
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="catalog-fields">
          <div className="catalog-card">
            <h2>Про товар</h2>
            <label>
              Назва товару
              <input
                required
                maxLength={160}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <ReferencePicker
              kind="categories"
              label="Категорія"
              value={category?.id || ''}
              initialLabel={category?.name}
              onChange={setCategory}
            />
            <label>
              Опис
              <textarea
                rows={5}
                maxLength={10000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label>
              Теги через кому
              <input
                maxLength={1800}
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="перлини, натуральні матеріали"
              />
            </label>
            <h3>Спільні атрибути</h3>
            <ProductAttributes value={attributes} onChange={setAttributes} />
            <label className="check-label">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => setArchived(e.target.checked)}
              />
              Архівувати товар (зняти всі варіанти з публікації)
            </label>
          </div>
          <h2>Варіанти · {variants.length}</h2>
          <p className="muted">
            Варіанти відрізняються комбінаціями атрибутів. Ціна в гривнях за
            обрану одиницю. Залишки змінюються через складські документи.
          </p>
          {variants.map((v, i) => (
            <div key={v.id || `new-${i}`} className="catalog-card variant-card">
              <h3>
                Варіант {i + 1}
                {v.archivedAt ? ' · Архівний' : ''}
              </h3>
              <div className="catalog-grid">
                <label>
                  Назва варіанта
                  <input
                    required
                    maxLength={160}
                    value={v.name}
                    onChange={(e) => change(i, { name: e.target.value })}
                  />
                </label>
                <label>
                  SKU
                  <input
                    required
                    maxLength={80}
                    value={v.sku}
                    onChange={(e) => change(i, { sku: e.target.value })}
                  />
                </label>
                <ReferencePicker
                  kind="units"
                  label="Одиниця продажу"
                  value={v.unitId}
                  initialLabel={v.unit?.name}
                  onChange={(item) =>
                    change(i, {
                      unitId: item?.id || '',
                      unit: item || undefined,
                    })
                  }
                />
                <label>
                  Ціна продажу, грн
                  <input
                    inputMode="decimal"
                    value={v.sellPrice || ''}
                    onChange={(e) => change(i, { sellPrice: e.target.value })}
                  />
                </label>
                <label>
                  Публікація
                  <select
                    value={v.status}
                    disabled={archived || Boolean(v.archivedAt)}
                    onChange={(e) =>
                      change(i, {
                        status: e.target.value as CatalogVariant['status'],
                      })
                    }
                  >
                    <option value="DRAFT">Чернетка</option>
                    <option value="PUBLISHED">Опубліковано</option>
                  </select>
                </label>
              </div>
              <h4>Атрибути варіанта</h4>
              <ProductAttributes
                value={v.attributes}
                onChange={(a) => change(i, { attributes: a })}
              />
              {v.id ? (
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={Boolean(v.archivedAt)}
                    onChange={(e) =>
                      change(i, {
                        archivedAt: e.target.checked
                          ? new Date().toISOString()
                          : null,
                        status: 'DRAFT',
                      })
                    }
                  />
                  Архівний варіант
                </label>
              ) : (
                <button
                  type="button"
                  disabled={variants.length === 1}
                  onClick={() => {
                    setVariants(variants.filter((_, n) => n !== i));
                    if (imageScope !== '') {
                      const scope = Number(imageScope);
                      if (scope === i) {
                        setFile(null);
                        setFileKey((key) => key + 1);
                        setImageScope('');
                      } else if (scope > i) setImageScope(String(scope - 1));
                    }
                  }}
                >
                  Прибрати варіант
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            disabled={variants.length >= 50}
            onClick={() => setVariants([...variants, newVariant()])}
          >
            Додати варіант
          </button>
          <div className="catalog-save">
            <div className="catalog-card">
              <h2>Додати зображення</h2>
              <p className="muted">
                Оберіть фото — воно завантажиться разом зі збереженням товару.
                JPEG, PNG або WebP до 3 МБ.
              </p>
              {!imagesConfigured && (
                <p role="status">
                  Cloudinary ще не налаштовано. Збереження товарів доступне.
                </p>
              )}
              <div className="catalog-grid">
                <label>
                  Фото до збереження
                  <input
                    key={fileKey}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={!imagesConfigured || archived}
                    onChange={(e) => {
                      setFile(e.target.files?.[0] || null);
                      setSaved(false);
                    }}
                  />
                </label>
                <label>
                  Зображення для
                  <select
                    value={imageScope}
                    disabled={!imagesConfigured || archived}
                    onChange={(e) => setImageScope(e.target.value)}
                  >
                    <option value="">Спільне для товару</option>
                    {variants.map(
                      (v, i) =>
                        !v.archivedAt && (
                          <option key={i} value={String(i)}>
                            {v.sku || `Варіант ${i + 1}`} · {v.name}
                          </option>
                        ),
                    )}
                  </select>
                </label>
              </div>
              {file && (
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setFileKey((key) => key + 1);
                  }}
                >
                  Прибрати файл
                </button>
              )}
            </div>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {saved && <p role="status">Товар збережено.</p>}
            <button className="primary" type="submit">
              {busy ? 'Збереження…' : 'Зберегти товар'}
            </button>
          </div>
        </fieldset>
      </form>
      {persisted && (
        <ProductGallery product={persisted} configured={imagesConfigured} />
      )}
    </section>
  );
}
