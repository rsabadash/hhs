export function listQuery(
  query: string,
  changes: Record<string, string>,
  remove: readonly string[] = [],
) {
  const params = new URLSearchParams(query);
  params.delete('page');
  for (const key of remove) params.delete(key);
  for (const [key, value] of Object.entries(changes)) {
    if (value.trim()) params.set(key, value.trim());
    else params.delete(key);
  }
  return params.toString();
}

export function filterValues(data: FormData) {
  const values: Record<string, string> = {};
  for (const key of new Set(data.keys())) {
    values[key] = data.getAll(key).map(String).filter(Boolean).join(',');
  }
  return values;
}
