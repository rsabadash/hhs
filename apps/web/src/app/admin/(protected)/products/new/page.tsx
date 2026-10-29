import ProductEditor from '../../../product-editor';
import { adminApi } from '@/lib/admin-api';
export default async function NewProduct() {
  const images = await adminApi<{ configured: boolean }>(
    'products/image-settings',
  );
  return <ProductEditor imagesConfigured={images.configured} />;
}
