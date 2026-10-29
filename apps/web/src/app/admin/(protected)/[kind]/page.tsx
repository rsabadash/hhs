import { notFound } from 'next/navigation';
import { adminApi } from '@/lib/admin-api';
import {
  sections,
  type ReferenceKind,
  type Reference,
  type ReferenceList,
} from '@/lib/references';
import ReferenceManager from '../../reference-manager';
export default async function ReferencesPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { kind } = await params;
  if (!Object.hasOwn(sections, kind)) notFound();
  const raw = await searchParams;
  const query = new URLSearchParams();
  for (const key of [
    'q',
    'page',
    'sort',
    'parentId',
    'attributeId',
    'kind',
    'allowsFraction',
    'hasContact',
    'hasAddress',
  ]) {
    if (typeof raw[key] === 'string' && raw[key]) query.set(key, raw[key]);
  }
  if (kind === 'attribute-values' && !query.has('attributeId')) notFound();
  const [list, attribute, parent] = await Promise.all([
    adminApi<ReferenceList>(`references/${kind}?${query}`),
    kind === 'attribute-values'
      ? adminApi<Reference>(`references/attributes/${query.get('attributeId')}`)
      : null,
    kind === 'categories' &&
    query.has('parentId') &&
    query.get('parentId') !== 'root'
      ? adminApi<Reference>(`references/categories/${query.get('parentId')}`)
      : null,
  ]);
  return (
    <ReferenceManager
      key={`${kind}:${query}`}
      kind={kind as ReferenceKind}
      list={list}
      query={query.toString()}
      attribute={attribute}
      parent={parent}
    />
  );
}
