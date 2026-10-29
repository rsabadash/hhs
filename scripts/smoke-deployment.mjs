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
