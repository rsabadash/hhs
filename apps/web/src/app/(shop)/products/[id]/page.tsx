import Link from 'next/link';
import { notFound } from 'next/navigation';
import { storefrontApi, CatalogError } from '../../../../lib/storefront-api';
import {
  instagramProfile,
  type PublicProduct,
  type SearchParams,
} from '../../../../lib/storefront';
import { ProductDetail } from '../../product-detail';
export const dynamic = 'force-dynamic';
export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  let product: PublicProduct;
  try {
    product = await storefrontApi<PublicProduct>(`/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof CatalogError && [400, 404].includes(error.status))
      notFound();
    throw error;
  }
  return (
    <main id="main" className="shop-main">
      <nav className="breadcrumbs" aria-label="Навігація">
        <Link href="/">Каталог</Link>
        <span>/</span>
        <Link href={`/?categoryId=${product.category.id}`}>
          {product.category.name}
        </Link>
      </nav>
      <ProductDetail
        key={product.id}
        product={product}
        requestedVariant={
          typeof search.variant === 'string' ? search.variant : undefined
        }
        instagram={instagramProfile(process.env.NEXT_PUBLIC_INSTAGRAM_USERNAME)}
      />
    </main>
  );
}
