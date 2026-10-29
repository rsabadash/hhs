import type { Assignment, Selection } from './catalog';
export const inventorySections = {
  supplies: 'Постачання',
  counts: 'Інвентаризація',
  balances: 'Залишки',
  movements: 'Рух запасів',
} as const;
export type InventorySection = keyof typeof inventorySections;
export const statuses: Record<string, string> = {
  DRAFT: 'Чернетка',
  RECEIVED: 'Отримано',
  COUNTING: 'Підрахунок',
  POSTED: 'Проведено',
  CANCELLED: 'Скасовано',
};
export const movementLabels: Record<string, string> = {
  RECEIPT: 'Надходження',
  COUNT: 'Інвентаризація',
  SALE: 'Продаж',
  CANCELLATION: 'Скасування замовлення',
};
export type StockVariant = {
  id: string;
  sku: string;
  name: string;
  unit: { symbol: string; allowsFraction: boolean };
  product: { name: string; category: Selection; attributes: Assignment[] };
  attributes: Assignment[];
  quantity?: string;
  revision?: number;
  archivedAt: string | null;
};
export type StockLine = {
  id?: string;
  variantId: string;
  variant: StockVariant;
  quantity: string;
  unitCost: string;
  unitSymbol?: string;
  total?: string;
  expectedQuantity: string;
  actualQuantity: string | null;
  reason: string;
  excluded: boolean;
  difference: string | null;
  stale?: boolean;
};
export type StockDocument = {
  id: string;
  reference: string;
  revision: number;
  warehouseId: string;
  warehouse: Selection;
  supplierId?: string;
  supplier?: Selection;
  notes: string;
  status: string;
  createdAt: string;
  receivedAt?: string;
  startedAt?: string;
  postedAt?: string;
  cancelledAt?: string;
  createdBy?: { email: string };
  receivedBy?: { email: string };
  startedBy?: { email: string };
  postedBy?: { email: string };
  cancelledBy?: { email: string };
  items: StockLine[];
  total?: string;
};
export type StockMovement = {
  id: string;
  kind: string;
  quantity: string;
  createdAt: string;
  actor: { email: string };
  balance: { variant: StockVariant; warehouse: Selection };
  supplyItem?: { supply: { id: string; reference: string } };
  countItem?: { count: { id: string; reference: string } };
  orderItem?: { order: { id: string; reference: string } };
};
export type InventoryList<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
export const variantLabel = (v: StockVariant) =>
  `${v.sku} · ${v.product.name}${v.name ? ` · ${v.name}` : ''} · ${v.unit.symbol}`;
export const attributesLabel = (v: StockVariant) =>
  [...v.product.attributes, ...v.attributes]
    .map(
      (a) =>
        `${a.value?.attribute.name}: ${a.value?.label}${a.value?.attribute.measurementSymbol || ''}`,
    )
    .join(' · ');
export const stockDate = (date: string) =>
  new Intl.DateTimeFormat('uk-UA', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Kyiv',
  }).format(new Date(date));
// Integer arithmetic avoids binary floating-point errors in purchase totals.
export function lineCost(quantity: string, cost: string) {
  if (
    !/^(0|[1-9]\d{0,12})(\.\d{1,3})?$/.test(quantity) ||
    !/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(cost)
  )
    return 0n;
  const scaled = (value: string, places: number) => {
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole + fraction.padEnd(places, '0'));
  };
  return (scaled(quantity, 3) * scaled(cost, 2) + 500n) / 1000n;
}
export const moneyFromCents = (value: bigint) =>
  `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;

export function quantityDifference(actual: string, expected: string) {
  const valid = /^(0|[1-9]\d{0,12})(\.\d{1,3})?$/;
  if (!valid.test(actual) || !valid.test(expected))
    return 'Перевірте кількість';
  const scaled = (v: string) => {
    const [w, f = ''] = v.split('.');
    return BigInt(w + f.padEnd(3, '0'));
  };
  const difference = scaled(actual) - scaled(expected),
    magnitude = difference < 0n ? -difference : difference;
  const fraction = String(magnitude % 1000n)
    .padStart(3, '0')
    .replace(/0+$/, '');
  return `${difference < 0n ? '-' : ''}${magnitude / 1000n}${fraction ? ',' + fraction : ''}`;
}
