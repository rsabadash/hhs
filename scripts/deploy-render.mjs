import { setTimeout as delay } from 'node:timers/promises';

const { RENDER_API_KEY, RENDER_SERVICE_ID, GITHUB_SHA } = process.env;
if (
  !RENDER_API_KEY ||
  !/^srv-[a-z0-9]+$/.test(RENDER_SERVICE_ID ?? '') ||
  !/^[a-f0-9]{40}$/.test(GITHUB_SHA ?? '')
) {
  throw new Error('Missing or invalid Render deployment configuration.');
}
const base = `https://api.render.com/v1/services/${RENDER_SERVICE_ID}/deploys`;
async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${RENDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(
      `Render request failed (${response.status}). Check provider logs.`,
    );
  return response.json();
}
const deploy = await request(base, {
  method: 'POST',
  body: JSON.stringify({ commitId: GITHUB_SHA }),
});
if (typeof deploy.id !== 'string' || !/^dep-[a-z0-9]+$/.test(deploy.id))
  throw new Error('Unexpected Render deployment response.');
const deadline = Date.now() + 20 * 60 * 1000;
let live = false;
while (Date.now() < deadline) {
  const result = await request(`${base}/${deploy.id}`);
  if (result.status === 'live') {
    if (result.commit?.id !== GITHUB_SHA)
      throw new Error('Deployed commit differs from the checked revision.');
    live = true;
    console.log('Checked API revision is live.');
    break;
  }
  if (
    [
      'build_failed',
      'update_failed',
      'pre_deploy_failed',
      'canceled',
      'deactivated',
    ].includes(result.status)
  ) {
    throw new Error(
      `Render deployment ended with status ${result.status}. Check provider logs.`,
    );
  }
  await delay(10000);
}
if (!live) throw new Error('Timed out waiting for Render deployment.');
