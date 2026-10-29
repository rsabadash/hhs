export type PublicImage = { id: string; url: string; alt: string };
export type PublicValue = {
  id: string;
  label: string;
  attribute: { id: string; name: string; measurementSymbol: string | null };
};
export type PublicVariant = {
  id: string;
  name: string;
  sku: string;
  price: string;
  unit: { name: string; symbol: string };
  inStock: boolean;
  images: PublicImage[];
  attributes: PublicValue[];
};
export type PublicProduct = {
  id: string;
  name: string;
  description: string;
  category: { id: string; name: string };
  tags: string[];
  attributes: PublicValue[];
  images: PublicImage[];
  variants: PublicVariant[];
};
export type CatalogPage = {
  total: number;
  page: number;
  pageSize: number;
  items: {
    id: string;
    name: string;
    category: { id: string; name: string };
    image: PublicImage | null;
    price: string;
    unit: { name: string; symbol: string };
    variantId: string;
    inStock: boolean;
    matchingVariants: number;
  }[];
};
export type PublicFilters = {
  categories: { id: string; name: string; parentId: string | null }[];
  tags: string[];
  values: PublicValue[];
};
export type SearchParams = Record<string, string | string[] | undefined>;
const filterKeys = [
  'q',
  'page',
  'sort',
  'categoryId',
  'tag',
  'minPrice',
  'maxPrice',
  'inStock',
  'valueIds',
];
export function catalogParams(input: SearchParams) {
  const params = new URLSearchParams();
  for (const key of filterKeys) {
    const value = input[key];
    if (key === 'valueIds') {
      const joined = (Array.isArray(value) ? value : [value])
        .filter(Boolean)
        .join(',');
      if (joined) params.set(key, joined);
    } else if (typeof value === 'string' && value.trim())
      params.set(key, value.trim());
  }
  return params;
}
export function uah(value: string) {
  // Deterministic Ukrainian formatting avoids server/browser ICU currency differences.
  const [integer, fraction = ''] = value.split('.');
  const grouped = integer
    .replace(/^0+(?=\d)/, '')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return `${grouped},${fraction.padEnd(2, '0')}\u00a0₴`;
}
export function instagramProfile(value: string | undefined) {
  const handle = value?.trim().replace(/^@/, '');
  return handle &&
    /^[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?$/.test(handle)
    ? `https://www.instagram.com/${handle}/`
    : null;
}
export function inquiry(
  product: PublicProduct,
  variant: PublicVariant,
  url: string,
) {
  const attributes = [...product.attributes, ...variant.attributes]
    .map(
      (a) =>
        `${a.attribute.name}: ${a.label}${a.attribute.measurementSymbol ? ` ${a.attribute.measurementSymbol}` : ''}`,
    )
    .join(', ');
  return `Вітаю! Цікавить ${product.name} — ${variant.name}.\nSKU: ${variant.sku}\n${attributes ? `${attributes}\n` : ''}Ціна: ${uah(variant.price)} / ${variant.unit.symbol}\n${variant.inStock ? 'Підкажіть, будь ласка, як замовити.' : 'Підкажіть, будь ласка, коли очікується надходження.'}\n${url}`;
}
