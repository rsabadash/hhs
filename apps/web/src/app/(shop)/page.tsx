import Link from 'next/link';
import { storefrontApi, CatalogError } from '../../lib/storefront-api';
import {
  catalogParams,
  uah,
  type CatalogPage,
  type PublicFilters,
  type SearchParams,
} from '../../lib/storefront';
import { Filters } from './filters';
import { Photo } from './photo';
export const dynamic = 'force-dynamic';
export default async function Catalog({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = catalogParams(await searchParams);
  const [result, facets] = await Promise.allSettled([
    storefrontApi<CatalogPage>(`?${params}`),
    storefrontApi<PublicFilters>('/filters'),
  ]);
  if (
    facets.status === 'rejected' ||
    (result.status === 'rejected' &&
      !(result.reason instanceof CatalogError && result.reason.status === 400))
  )
    throw new Error('Catalog unavailable');
  const data = result.status === 'fulfilled' ? result.value : null;
  const pageLink = (page: number) => {
    const query = new URLSearchParams(params);
    query.set('page', String(page));
    return `/?${query}`;
  };
  return (
    <main id="main" className="shop-main">
      <section className="catalog-intro">
        <p className="eyebrow">Для ваших особливих ідей</p>
        <h1>Деталі, з яких починається краса.</h1>
        <p>
          Перлини, конектори та фурнітура для ваших прикрас. Оберіть матеріали й
          напишіть нам в Instagram.
        </p>
      </section>
      <div className="catalog-layout">
        <aside aria-label="Фільтри каталогу">
          <Filters filters={facets.value} params={params} />
        </aside>
        <section aria-label="Товари" className="catalog-results">
          {!data ? (
            <div role="alert" className="shop-notice">
              Перевірте фільтри: ціни мають бути додатними числами або нулем, а
              мінімальна ціна — не більшою за максимальну.{' '}
              <Link href="/">Скинути фільтри</Link>
            </div>
          ) : (
            <>
              <p className="result-count">Знайдено товарів: {data.total}</p>
              {data.items.length ? (
                <div className="product-grid">
                  {data.items.map((p) => (
                    <article className="product-card" key={p.id}>
                      <Link
                        href={`/products/${p.id}?variant=${p.variantId}`}
                        prefetch={false}
                      >
                        <Photo image={p.image} name={p.name} />
                        <div className="card-copy">
                          <span className="card-category">
                            {p.category.name}
                          </span>
                          <h2>{p.name}</h2>
                          <p className="card-price">
                            {p.matchingVariants > 1 ? 'від ' : ''}
                            {uah(p.price)} <small>/ {p.unit.symbol}</small>
                          </p>
                          <span
                            className={`availability ${p.inStock ? 'available' : ''}`}
                          >
                            {p.inStock ? 'Є в наявності' : 'Немає в наявності'}
                          </span>
                        </div>
                      </Link>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="shop-notice">
                  <h2>
                    {params.size
                      ? 'Нічого не знайдено'
                      : 'Готуємо нові матеріали'}
                  </h2>
                  <p>
                    {params.size
                      ? 'Спробуйте змінити або скинути фільтри.'
                      : 'Опубліковані товари з’являться тут.'}
                  </p>
                  <Link href="/">Показати всі товари</Link>
                </div>
              )}
              <nav className="shop-pagination" aria-label="Сторінки каталогу">
                {data.page > 1 ? (
                  <Link href={pageLink(data.page - 1)}>← Назад</Link>
                ) : null}
                <span>
                  Сторінка {data.page} з{' '}
                  {Math.max(1, Math.ceil(data.total / data.pageSize))}
                </span>
                {data.page * data.pageSize < data.total ? (
                  <Link href={pageLink(data.page + 1)}>Далі →</Link>
                ) : null}
              </nav>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
