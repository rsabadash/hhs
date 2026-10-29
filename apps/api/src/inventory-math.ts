import { Prisma } from './generated/prisma/client.js';
// Up to 13 quantity digits × 12 cost digits × 100 lines, plus scale.
// Clone instead of changing the ORM's global Decimal configuration.
const StockDecimal = Prisma.Decimal.clone({
  precision: 40,
  rounding: Prisma.Decimal.ROUND_HALF_UP,
});
export const stockDecimal = (value: string | number | Prisma.Decimal) =>
  new StockDecimal(value);
export const purchaseTotal = (
  items: { quantity: Prisma.Decimal; unitCost: Prisma.Decimal }[],
) =>
  items
    .reduce(
      (sum, i) =>
        sum.plus(stockDecimal(i.quantity).times(i.unitCost).toDecimalPlaces(2)),
      stockDecimal(0),
    )
    .toFixed(2);
