import { notFound } from 'next/navigation';
import { adminApi } from '@/lib/admin-api';
import type { CatalogProduct } from '@/lib/catalog';
import ProductEditor from '../../../product-editor';
export default async function EditProduct({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id)) notFound();
  const [product, images] = await Promise.all([
    adminApi<CatalogProduct>(`products/${id}`),
    adminApi<{ configured: boolean }>('products/image-settings'),
  ]);
  return (
    <ProductEditor
      key={product.updatedAt}
      initial={product}
      imagesConfigured={images.configured}
    />
  );
}
