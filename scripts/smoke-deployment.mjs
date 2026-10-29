const { API_URL, WEB_URL } = process.env;
for (const [name, value, path] of [
  ['API', API_URL, '/health/ready'],
  ['web', WEB_URL, '/api/health'],
]) {
  const url = new URL(path, value);
  if (url.protocol !== 'https:') throw new Error(`${name} must use HTTPS.`);
  const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (!response.ok || (await response.json()).status !== 'ok')
    throw new Error(`${name} readiness failed.`);
  console.log(`${name} readiness passed.`);
}

const catalog = await fetch(new URL('/catalog?pageSize=1', API_URL), {
  signal: AbortSignal.timeout(90000),
});
if (!catalog.ok || !Array.isArray((await catalog.json()).items))
  throw new Error('Public catalog API failed.');
console.log('Public catalog API passed.');
const storefront = await fetch(new URL('/', WEB_URL), {
  signal: AbortSignal.timeout(90000),
});
if (
  !storefront.ok ||
  !(await storefront.text()).includes('Деталі, з яких починається краса.')
)
  throw new Error('Public storefront failed.');
console.log('Public storefront passed.');
