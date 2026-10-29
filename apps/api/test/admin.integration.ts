import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { hashPassword } from '../src/password.js';

if (!process.env.TEST_DATABASE_URL)
  throw Error('An isolated TEST_DATABASE_URL is required.');
const pool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  max: 3,
});
const origin = 'http://127.0.0.1:4101';
const marker = `m2-${randomUUID()}`;
const email = `${marker}@example.test`;
const password = randomUUID();
let api: ChildProcess;
let cookie = '';
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
async function request(
  path: string,
  method = 'GET',
  data?: unknown,
  auth = cookie,
  csrf = true,
) {
  return fetch(`${origin}/admin/${path}`, {
    method,
    headers: {
      ...(auth ? { cookie: auth } : {}),
      ...(method !== 'GET'
        ? {
            'content-type': 'application/json',
            ...(csrf ? { 'x-hhs-csrf': '1' } : {}),
          }
        : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}
async function create(kind: string, data: object) {
  const response = await request(`references/${kind}`, 'POST', data);
  expect(response.status, await response.clone().text()).toBe(201);
  return response.json();
}
beforeAll(async () => {
  await pool.query(
    'INSERT INTO "Admin" (id,email,"passwordHash") VALUES ($1,$2,$3)',
    [randomUUID(), email, await hashPassword(password)],
  );
  api = spawn(process.execPath, ['apps/api/dist/main.js'], {
    env: {
      ...process.env,
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      PORT: '4101',
      NODE_ENV: 'test',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    if (
      await fetch(`${origin}/health/ready`)
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const login = await request('auth/login', 'POST', { email, password }, '');
  expect(login.status).toBe(200);
  cookie = login.headers.get('set-cookie')!.split(';')[0];
}, 30000);
afterAll(async () => {
  api?.kill();
  await pool.query('DELETE FROM "Admin" WHERE email = $1', [email]);
  await pool.query('DELETE FROM "LoginThrottle" WHERE key = $1', [
    `email:${hash(email)}`,
  ]);
  await pool.query(
    'DELETE FROM "AttributeValue" WHERE "attributeId" IN (SELECT id FROM "Attribute" WHERE name LIKE $1)',
    [`%${marker}%`],
  );
  for (const table of ['Attribute', 'Unit', 'Warehouse', 'Supplier'])
    await pool.query(`DELETE FROM "${table}" WHERE name LIKE $1`, [
      `%${marker}%`,
    ]);
  await pool.query(
    'UPDATE "Category" SET "parentId" = NULL WHERE name LIKE $1',
    [`%${marker}%`],
  );
  await pool.query('DELETE FROM "Category" WHERE name LIKE $1', [
    `%${marker}%`,
  ]);
  await pool.end();
});
describe('admin API on PostgreSQL', () => {
  it('denies unauthenticated reads/writes and missing CSRF headers', async () => {
    expect(
      (await request('references/units', 'GET', undefined, '')).status,
    ).toBe(401);
    expect(
      (
        await request(
          'references/units',
          'POST',
          { name: 'x', symbol: 'x', allowsFraction: false },
          '',
        )
      ).status,
    ).toBe(401);
    expect(
      (await request('references/units', 'POST', {}, cookie, false)).status,
    ).toBe(403);
    expect(
      (await request('auth/login', 'POST', { email, password }, '', false))
        .status,
    ).toBe(403);
    const me = await request('auth/me');
    expect(me.headers.get('cache-control')).toBe('no-store');
    expect(Object.keys(await me.json()).sort()).toEqual(['email', 'id']);
  });
  it('creates and updates all reference types; validates numeric values', async () => {
    const unit = await create('units', {
      name: `Штука ${marker}`,
      symbol: marker.slice(0, 20),
      allowsFraction: false,
    });
    expect(
      (
        await request(`references/units/${unit.id}`, 'PUT', {
          name: `Пара ${marker}`,
          symbol: marker.slice(0, 20),
          allowsFraction: true,
        })
      ).status,
    ).toBe(200);
    await create('warehouses', { name: `Склад ${marker}`, address: 'Київ' });
    const supplier = await create('suppliers', {
      name: `Постачальник ${marker}`,
      email: 'test@example.test',
      phone: '+380',
    });
    expect(
      (
        await request(`references/suppliers/${supplier.id}`, 'PUT', {
          name: `Оновлено ${marker}`,
          email: '',
          phone: '',
        })
      ).status,
    ).toBe(200);
    const attribute = await create('attributes', {
      name: `Діаметр ${marker}`,
      kind: 'NUMBER',
      measurementSymbol: 'мм',
    });
    const value = await create('attribute-values', {
      attributeId: attribute.id,
      label: '1.0000',
      numericValue: '1.0000',
    });
    expect(value.label).toBe('1');
    expect(
      (
        await request('references/attribute-values', 'POST', {
          attributeId: attribute.id,
          label: 'one',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request('references/attribute-values', 'POST', {
          attributeId: attribute.id,
          label: '1.0',
          numericValue: '1.0',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(`references/attributes/${attribute.id}`, 'PUT', {
          name: attribute.name,
          kind: 'TEXT',
        })
      ).status,
    ).toBe(409);
    const choice = await create('attributes', {
      name: `Покриття ${marker}`,
      kind: 'CHOICE',
    });
    const option = await create('attribute-values', {
      attributeId: choice.id,
      label: 'Срібло',
    });
    expect(
      (
        await request(`references/attribute-values/${option.id}`, 'PUT', {
          attributeId: choice.id,
          label: 'Золото',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request('references/attribute-values', 'POST', {
          attributeId: choice.id,
          label: '2',
          numericValue: '2',
        })
      ).status,
    ).toBe(400);
    const text = await create('attributes', {
      name: `Опис ${marker}`,
      kind: 'TEXT',
    });
    await create('attribute-values', {
      attributeId: text.id,
      label: 'Гладкий',
    });
  });
  it('serializes concurrent moves so category cycles cannot form', async () => {
    const a = await create('categories', { name: `A ${marker}` });
    const b = await create('categories', { name: `B ${marker}` });
    const moved = await Promise.all([
      request(`references/categories/${a.id}`, 'PUT', {
        name: a.name,
        parentId: b.id,
      }),
      request(`references/categories/${b.id}`, 'PUT', {
        name: b.name,
        parentId: a.id,
      }),
    ]);
    expect(moved.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      (
        await request(`references/categories/${a.id}`, 'PUT', {
          name: a.name,
          parentId: a.id,
        })
      ).status,
    ).toBe(409);
  });
  it('searches Ukrainian text and combines filters with stable pagination', async () => {
    for (let i = 0; i < 3; i++)
      await create('suppliers', {
        name: `Перлини ${i} ${marker}`,
        email: i === 1 ? '' : 'search@example.test',
      });
    const qs = `q=${encodeURIComponent(`перлини`)}&hasContact=true&pageSize=1&sort=asc`;
    const first = await (await request(`references/suppliers?${qs}`)).json();
    const second = await (
      await request(`references/suppliers?${qs}&page=2`)
    ).json();
    expect(first.total).toBe(2);
    expect(first.items).toHaveLength(1);
    expect(first.items[0].id).not.toBe(second.items[0].id);
    expect((await request('references/units?pageSize=999')).status).toBe(400);
  });
  it('protects used units and attribute values from changes in meaning', async () => {
    const unit = await create('units', {
      name: `Used ${marker}`,
      symbol: marker.slice(-20),
      allowsFraction: false,
    });
    const attr = await create('attributes', {
      name: `Used attribute ${marker}`,
      kind: 'CHOICE',
    });
    const value = await create('attribute-values', {
      attributeId: attr.id,
      label: 'Срібло',
    });
    const category = await create('categories', {
      name: `Used category ${marker}`,
    });
    const productId = randomUUID();
    const variantId = randomUUID();
    try {
      await pool.query(
        'INSERT INTO "Product" (id,name,"categoryId","updatedAt") VALUES ($1,$2,$3,NOW())',
        [productId, marker, category.id],
      );
      await pool.query(
        'INSERT INTO "Variant" (id,"productId",sku,name,"unitId","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',
        [variantId, productId, marker, marker, unit.id],
      );
      await pool.query(
        'INSERT INTO "VariantAttributeValue" ("variantId","attributeId","valueId") VALUES ($1,$2,$3)',
        [variantId, attr.id, value.id],
      );
      expect(
        (
          await request(`references/units/${unit.id}`, 'PUT', {
            name: unit.name,
            symbol: unit.symbol,
            allowsFraction: true,
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await request(`references/attribute-values/${value.id}`, 'PUT', {
            attributeId: attr.id,
            label: 'Золото',
          })
        ).status,
      ).toBe(409);
    } finally {
      await pool.query('DELETE FROM "Variant" WHERE id=$1', [variantId]);
      await pool.query('DELETE FROM "Product" WHERE id=$1', [productId]);
    }
  });

  it('expires sessions, rotates tokens at login, and revokes on logout', async () => {
    const login = await request('auth/login', 'POST', { email, password });
    const rotated = login.headers.get('set-cookie')!;
    expect(rotated).toContain('HttpOnly');
    expect(rotated).toContain('SameSite=Strict');
    expect((await request('auth/me')).status).toBe(401);
    cookie = rotated.split(';')[0];
    const tokenHash = hash(cookie.split('=')[1]);
    await pool.query(
      'UPDATE "Session" SET "expiresAt" = NOW() - interval \'1 second\' WHERE "tokenHash"=$1',
      [tokenHash],
    );
    expect((await request('auth/me')).status).toBe(401);
    const next = await request('auth/login', 'POST', { email, password });
    cookie = next.headers.get('set-cookie')!.split(';')[0];
    expect((await request('auth/logout', 'POST', {})).status).toBe(200);
    expect((await request('auth/me')).status).toBe(401);
  });
  it('password recovery invalidates existing sessions and changes the password', async () => {
    const token = randomBytes(32).toString('hex');
    await pool.query(
      'INSERT INTO "Session" ("tokenHash","adminId","expiresAt") SELECT $1,id,NOW()+interval \'1 hour\' FROM "Admin" WHERE email=$2',
      [hash(token), email],
    );
    const nextPassword = randomUUID();
    const result = await new Promise<number | null>((resolve) => {
      const command = spawn(
        process.execPath,
        ['--import', 'tsx', 'prisma/reset-admin.ts'],
        {
          cwd: 'apps/api',
          env: {
            ...process.env,
            DATABASE_URL: process.env.TEST_DATABASE_URL,
            ADMIN_EMAIL: email,
            ADMIN_PASSWORD: nextPassword,
          },
          stdio: 'ignore',
        },
      );
      command.on('exit', resolve);
    });
    expect(result).toBe(0);
    expect(
      (await request('auth/me', 'GET', undefined, `hhs_session=${token}`))
        .status,
    ).toBe(401);
    expect(
      (await request('auth/login', 'POST', { email, password }, '')).status,
    ).toBe(401);
    expect(
      (
        await request(
          'auth/login',
          'POST',
          { email, password: nextPassword },
          '',
        )
      ).status,
    ).toBe(200);
  });

  it('rate limits login attempts even for unknown accounts', async () => {
    const unknown = `${randomUUID()}@example.test`;
    const responses = [];
    for (let i = 0; i < 6; i++)
      responses.push(
        await request(
          'auth/login',
          'POST',
          { email: unknown, password: 'invalid' },
          '',
        ),
      );
    expect(responses.map((r) => r.status)).toEqual([
      401, 401, 401, 401, 401, 429,
    ]);
    await pool.query('DELETE FROM "LoginThrottle" WHERE key=$1', [
      `email:${hash(unknown)}`,
    ]);
  });
});
