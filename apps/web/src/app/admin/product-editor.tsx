'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { writeAdmin } from '@/lib/references';
import type {
  CatalogImage,
  CatalogProduct,
  CatalogVariant,
} from '@/lib/catalog';
import ReferencePicker from './reference-picker';
import ProductAttributes from './product-attributes';
import ProductPhotos, { type DraftPhoto } from './product-photos';
import { imageData } from '@/lib/image-upload';
type EditorVariant = CatalogVariant & { key: string };
const newVariant = (key: string): EditorVariant => ({
  key,
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
  const [photos, setPhotos] = useState<DraftPhoto[]>(() =>
    (initial?.images || []).map((image) => ({
      key: image.id,
      scope: image.variantId,
      image,
      alt: image.alt,
      position: image.position,
    })),
  );
  const [removedPhotos, setRemovedPhotos] = useState<CatalogImage[]>([]);
  const [progress, setProgress] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [category, setCategory] = useState(initial?.category || null);
  const [tags, setTags] = useState(
    initial?.tags.map((t) => t.tag.name).join(', ') || '',
  );
  const [attributes, setAttributes] = useState(initial?.attributes || []);
  const [archived, setArchived] = useState(Boolean(initial?.archivedAt));
  const [variants, setVariants] = useState<EditorVariant[]>(
    () =>
      initial?.variants.map((v) => ({ ...v, key: v.id! })) || [
        newVariant('first'),
      ],
  );
  const removePhoto = (key: string) => {
    const photo = photos.find((photo) => photo.key === key);
    if (photo?.image) setRemovedPhotos((items) => [...items, photo.image!]);
    setPhotos((items) => items.filter((photo) => photo.key !== key));
    setSaved(false);
  };
  const photoControls = (
    scope: string | null,
    label: string,
    disabled: boolean,
  ) => (
    <ProductPhotos
      label={label}
      photos={photos.filter((photo) => photo.scope === scope)}
      remaining={20 - photos.length}
      disabled={!imagesConfigured || disabled}
      scopes={variants.map((v, i) => ({
        key: v.key,
        name: v.sku || `Варіант ${i + 1}`,
      }))}
      add={(files) => {
        setPhotos((items) => {
          const position = Math.max(
            -1,
            ...items.map((photo) => photo.position),
          );
          return [
            ...items,
            ...files.map((file, i) => ({
              key: crypto.randomUUID(),
              scope,
              file,
              alt: '',
              position: Math.min(position + i + 1, 999),
            })),
          ];
        });
        setSaved(false);
      }}
      change={(key, patch) => {
        setPhotos((items) =>
          items.map((photo) =>
            photo.key === key ? { ...photo, ...patch } : photo,
          ),
        );
        setSaved(false);
      }}
      remove={removePhoto}
    />
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
      {!imagesConfigured && (
        <p role="status">
          Cloudinary ще не налаштовано. Збереження товарів доступне.
        </p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          setProgress('Збереження товару…');
          setSaved(false);
          let productSaved = false;
          try {
            if (photos.length > 20)
              throw Error('До 20 фото на товар разом із варіантами.');
            const uploads = await Promise.all(
              photos
                .filter((photo) => photo.file)
                .map(async (photo) => {
                  const variant = variants.find((v) => v.key === photo.scope);
                  if (archived || variant?.archivedAt)
                    throw Error(
                      'Приберіть нові фото архівного товару або варіанта.',
                    );
                  return { photo, data: await imageData(photo.file!) };
                }),
            );
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
            const scopeId = (photo: DraftPhoto) => {
              if (photo.scope === null) return null;
              const variant = variants.find((v) => v.key === photo.scope);
              const id = variant && matchingVariant(variant.sku)?.id;
              if (!id) throw Error('Варіант для фото не знайдено.');
              return id;
            };
            // Free slots before uploading replacements. Acknowledged operations
            // are removed from the queue so a partial failure can be retried.
            for (const image of removedPhotos) {
              const result = await writeAdmin(
                `products/${data.id}/images/${image.id}`,
                'DELETE',
                {},
              );
              setRemovedPhotos((items) =>
                items.filter((item) => item.id !== image.id),
              );
              if (result.cleanupPending)
                setNotice(
                  'Фото від’єднано. Видалення файлу зі сховища буде повторено.',
                );
            }
            const updatePhoto = (photo: DraftPhoto, image: CatalogImage) => {
              setPhotos((items) =>
                items.map((item) =>
                  item.key === photo.key
                    ? {
                        ...item,
                        file: undefined,
                        image,
                        alt: image.alt,
                        position: image.position,
                      }
                    : item,
                ),
              );
            };
            for (const photo of photos.filter((photo) => photo.image)) {
              const image = photo.image!;
              const variantId = scopeId(photo);
              if (
                image.alt !== photo.alt ||
                image.position !== photo.position ||
                image.variantId !== variantId
              ) {
                const updated = await writeAdmin(
                  `products/${data.id}/images/${image.id}`,
                  'PUT',
                  {
                    alt: photo.alt,
                    position: photo.position,
                    variantId,
                  },
                );
                updatePhoto(photo, updated);
              }
            }
            for (const [index, { photo, data: image }] of uploads.entries()) {
              setProgress(
                `Завантаження фото ${index + 1} з ${uploads.length}…`,
              );
              const variant = variants.find((v) => v.key === photo.scope);
              const uploaded: CatalogImage = await writeAdmin(
                `products/${data.id}/images`,
                'POST',
                {
                  data: image,
                  alt:
                    photo.alt ||
                    (variant ? `${name} · ${variant.name}` : name).slice(
                      0,
                      250,
                    ),
                  variantId: scopeId(photo),
                },
              );
              // Record the upload before editing its position so retries cannot
              // upload it again when the metadata request fails.
              updatePhoto(photo, uploaded);
              if (uploaded.position !== photo.position) {
                setPhotos((items) =>
                  items.map((item) =>
                    item.key === photo.key
                      ? { ...item, position: photo.position }
                      : item,
                  ),
                );
                const ordered = await writeAdmin(
                  `products/${data.id}/images/${uploaded.id}`,
                  'PUT',
                  {
                    alt: uploaded.alt,
                    position: photo.position,
                    variantId: uploaded.variantId,
                  },
                );
                updatePhoto(photo, ordered);
              }
            }
            setSaved(true);
            router.replace(`/admin/products/${data.id}`);
            router.refresh();
          } catch (e) {
            setError(
              productSaved
                ? `Товар збережено, але не всі фото збережено. ${(e as Error).message} Натисніть «Зберегти товар», щоб повторити незавершені зміни, або приберіть фото.`
                : (e as Error).message,
            );
          } finally {
            setBusy(false);
            setProgress('');
          }
        }}
      >
        <fieldset disabled={busy} className="catalog-fields">
          <div className="catalog-card product-details">
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
            {photoControls(null, 'Фото товару', archived)}
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
            <div key={v.key} className="catalog-card variant-card">
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
              {photoControls(
                v.key,
                `Фото варіанта ${i + 1}`,
                archived || Boolean(v.archivedAt),
              )}
              {!photos.some((photo) => photo.scope === v.key) && (
                <p className="muted">
                  Без власних фото варіант використовує фото товару.
                </p>
              )}
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
                    setPhotos((items) =>
                      items.filter((photo) => photo.scope !== v.key),
                    );
                    setSaved(false);
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
            onClick={() =>
              setVariants([...variants, newVariant(crypto.randomUUID())])
            }
          >
            Додати варіант
          </button>
          <div className="catalog-save">
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {notice && <p role="status">{notice}</p>}
            {progress && <p role="status">{progress}</p>}
            {saved && <p role="status">Товар збережено.</p>}
            <button className="primary" type="submit">
              {busy ? 'Збереження…' : 'Зберегти товар'}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
