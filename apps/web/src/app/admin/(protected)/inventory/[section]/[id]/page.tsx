import { notFound } from 'next/navigation';
import { adminApi } from '@/lib/admin-api';
import type { StockDocument } from '@/lib/inventory';
import StockEditor from '../../../../stock-editor';
export default async function DocumentPage({
  params,
}: {
  params: Promise<{ section: string; id: string }>;
}) {
  const { section, id } = await params;
  if (section !== 'supplies' && section !== 'counts') notFound();
  if (id !== 'new' && !/^[a-f0-9-]{36}$/.test(id)) notFound();
  const doc =
    id === 'new'
      ? null
      : await adminApi<StockDocument>(`inventory/${section}/${id}`);
  return (
    <StockEditor
      key={`${id}:${doc?.revision ?? 0}`}
      kind={section}
      initial={doc}
    />
  );
}
