export type Selection = {
  id: string;
  name?: string;
  label?: string;
  symbol?: string;
};
export type Assignment = {
  attributeId: string;
  valueId: string;
  value?: {
    label: string;
    attribute: { name: string; measurementSymbol: string | null };
  };
};
export type CatalogImage = {
  id: string;
  url: string;
  alt: string;
  variantId: string | null;
  position: number;
};
export type CatalogVariant = {
  id?: string;
  name: string;
  sku: string;
  unitId: string;
  unit?: Selection;
  status: 'DRAFT' | 'PUBLISHED';
  sellPrice: string | null;
  archivedAt?: string | null;
  attributes: Assignment[];
};
export type CatalogProduct = {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  category: Selection;
  updatedAt: string;
  archivedAt: string | null;
  tags: { tag: { name: string } }[];
  attributes: Assignment[];
  variants: CatalogVariant[];
  images: CatalogImage[];
};
export const priceLabel = (value: string | null) =>
  value === null
    ? 'Без ціни'
    : new Intl.NumberFormat('uk-UA', {
        style: 'currency',
        currency: 'UAH',
      }).format(Number(value));
