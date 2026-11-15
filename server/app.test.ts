import { afterEach, describe, expect, test } from 'bun:test';
import { makeSignature, verifyPassword } from 'better-auth/crypto';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from './db';
import { createApp } from './app';
import { readConfig } from './config';
import { maxConfigBytes, validateEntries } from '../lib/saved-configs';
import { configStore } from './configs';
import { backupDatabase } from './backup';

const cleanup: (() => void)[] = [];
afterEach(() => { for (const close of cleanup.splice(0)) close(); });

async function fixture(overrides: Record<string, string> = {}) {
  const database = openDatabase(':memory:');
  cleanup.push(() => database.close());
  const config = readConfig({ BETTER_AUTH_SECRET: 'test-secret-for-authentication-tests-only-12345', ...overrides });
  const app = createApp(database, config);
  const context = await app.auth.$context;
  async function identity(email: string) {
    const user = await context.internalAdapter.createUser({ name: email, email, emailVerified: true }, { method: 'oauth', oauth: { providerId: 'github', profile: {} } });
    const session = await context.internalAdapter.createSession(user.id, false);
    const signed = `${session.token}.${await makeSignature(session.token, config.secret)}`;
    return { user, session, cookie: `${context.authCookies.sessionToken.name}=${encodeURIComponent(signed)}` };
  }
  const alice = await identity('alice@example.test');
  const bob = await identity('bob@example.test');
  function request(path = '', method = 'GET', body?: unknown, cookie: string | null = alice.cookie, origin = config.origin) {
    return app.handle(new Request(`${config.origin}/api/configs${path}`, {
      method,
      headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));
  }
  return { ...app, database, config, alice, bob, request };
}

const input = { name: 'Desktop', deviceKey: 'desktop', schemaVersion: 1, entries: { 'GstRender.TextureQuality': '1' } };

describe('localhost test accounts', () => {
  test('registration stores salted hashes and real sessions protect private configs', async () => {
    const f = await fixture({ LOCAL_AUTH_ENABLED: 'true' });
    const password = 'test-only-password-not-for-real-use';
    const local = (path: string, username: string, value = password) => f.handle(new Request(`${f.config.origin}/api/auth/local/${path}`, {
      method: 'POST', headers: { origin: f.config.origin, 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: value }),
    }), '127.0.0.1');
    const registered = await local('sign-up', 'Local_Alice');
    expect(registered.status).toBe(200);
    expect(await registered.json()).toEqual({ success: true });
    const cookie = registered.headers.getSetCookie().find((value) => value.includes('session_token='))!.split(';')[0];
    expect(cookie).toBeTruthy();
    expect(registered.headers.get('set-cookie')).toContain('HttpOnly');
    const second = await local('sign-up', 'local_bob');
    expect(second.status).toBe(200);
    const hashes = f.database.query<{ password: string }, []>('SELECT password FROM account WHERE providerId = \'credential\' ORDER BY id').all();
    expect(hashes).toHaveLength(2);
    expect(hashes[0].password).not.toBe(password);
    expect(hashes[0].password).not.toBe(hashes[1].password);
    expect(await verifyPassword({ password, hash: hashes[0].password })).toBe(true);
    expect(f.database.query('SELECT username FROM user WHERE username = ?').get('local_alice')).not.toBeNull();
    expect((await local('sign-up', 'LOCAL_ALICE')).status).toBeGreaterThanOrEqual(400);
    const saved = await (await f.request('', 'POST', input, cookie)).json();
    const bobCookie = second.headers.getSetCookie().find((value) => value.includes('session_token='))!.split(';')[0];
    expect((await f.request(`/${saved.id}`, 'GET', undefined, bobCookie)).status).toBe(404);
    const wrong = await local('sign-in', 'local_alice', 'wrong-password-for-testing');
    const missing = await local('sign-in', 'no_such_user', 'wrong-password-for-testing');
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(await wrong.json()).toEqual(await missing.json());
    const login = await local('sign-in', 'LOCAL_ALICE');
    expect(login.status).toBe(200);
    const loginCookie = login.headers.getSetCookie().find((value) => value.includes('session_token='))!.split(';')[0];
    expect((await f.request(`/${saved.id}`, 'GET', undefined, loginCookie)).status).toBe(200);

    const disabled = createApp(f.database, { ...f.config, localAuthEnabled: false });
    expect((await disabled.handle(new Request(`${f.config.origin}/api/configs`, { headers: { cookie: loginCookie } }))).status).toBe(401);
    expect(await (await disabled.handle(new Request(`${f.config.origin}/api/auth/get-session`, { headers: { cookie: loginCookie } }))).json()).toBeNull();
  });

  test('local routes fail closed without the flag and enforce localhost, origin and input restrictions', async () => {
    const f = await fixture();
    const request = (path: string, body: unknown, origin = f.config.origin) => new Request(`${f.config.origin}/api/auth/${path}`, {
      method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    expect((await f.handle(request('local/sign-up', { username: 'tester', password: 'valid-test-password' }))).status).toBe(404);
    expect(() => readConfig({ BETTER_AUTH_SECRET: f.config.secret, LOCAL_AUTH_ENABLED: 'true', BETTER_AUTH_URL: 'https://public.example' })).toThrow('localhost');
    expect(() => readConfig({ BETTER_AUTH_SECRET: f.config.secret, LOCAL_AUTH_ENABLED: 'yes' })).toThrow('true or false');
    const enabled = createApp(f.database, { ...f.config, localAuthEnabled: true });
    for (const body of [
      { username: 'ab', password: 'valid-test-password' },
      { username: 'a@example.test', password: 'valid-test-password' },
      { username: 'tester', password: 'short' },
      { username: 'tester', password: 'x'.repeat(129) },
      { username: 'tester', password: 'valid-test-password', email: 'other@example.test' },
    ]) expect((await enabled.handle(request('local/sign-up', body))).status).toBe(400);
    expect((await enabled.handle(request('local/sign-up', { username: 'tester', password: 'valid-test-password' }, 'https://untrusted.example'))).status).toBe(403);
    for (const route of ['sign-up/email', 'sign-in/email', 'sign-in/username', 'request-password-reset']) {
      expect((await enabled.handle(request(route, {}))).status).toBe(404);
    }
  });
});

describe('private config API', () => {
  test('real sessions enforce ownership for every operation, revocation and expiry', async () => {
    const f = await fixture();
    expect((await f.request('', 'GET', undefined, null)).status).toBe(401);
    const created = await f.request('', 'POST', input);
    expect(created.status).toBe(201);
    expect(created.headers.get('cache-control')).toBe('no-store');
    const saved = await created.json();
    expect((await f.request()).status).toBe(200);
    const foreignList = await (await f.request('', 'GET', undefined, f.bob.cookie)).json();
    expect(foreignList.configs).toEqual([]);
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
      expect((await f.request(`/${saved.id}`, method, method === 'GET' ? undefined : { ...input, revision: 1 }, f.bob.cookie)).status).toBe(404);
    }
    expect((await f.request('', 'POST', { ...input, userId: f.bob.user.id })).status).toBe(400);
    expect((await f.handle(new Request(`${f.config.origin}/api/configs`, {
      headers: { cookie: f.alice.cookie, 'x-bf6-account-id': f.bob.user.id },
    }))).status).toBe(401);
    const signOut = await f.handle(new Request(`${f.config.origin}/api/auth/sign-out`, {
      method: 'POST', headers: { cookie: f.alice.cookie, origin: f.config.origin, 'content-type': 'application/json' }, body: '{}',
    }));
    expect(signOut.status).toBe(200);
    expect((await f.request()).status).toBe(401);
    f.database.query('UPDATE session SET expiresAt = ? WHERE userId = ?').run(0, f.bob.user.id);
    expect((await f.request('', 'GET', undefined, f.bob.cookie)).status).toBe(401);
  });

  test('revision comparisons protect updates, renames and deletes', async () => {
    const f = await fixture();
    const saved = await (await f.request('', 'POST', input)).json();
    const results = await Promise.all([
      f.request(`/${saved.id}`, 'PUT', { ...input, revision: 1, name: 'A' }),
      f.request(`/${saved.id}`, 'PUT', { ...input, revision: 1, name: 'B' }),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
    expect((await f.request(`/${saved.id}`, 'DELETE', { revision: 1 })).status).toBe(409);
    expect((await f.request(`/${saved.id}`, 'PATCH', { name: 'Renamed', revision: 2 })).status).toBe(200);
    expect((await f.request(`/${saved.id}`, 'DELETE', { revision: 3 })).status).toBe(204);
    expect((await f.request(`/${saved.id}`)).status).toBe(404);
  });

  test('validates input and exact name/UTF-8 limits, unsafe origins and pagination', async () => {
    const f = await fixture();
    for (const body of [
      { ...input, name: ' ' }, { ...input, name: 'x'.repeat(101) },
      { ...input, entries: { 'GstRender.Value': 'a\nb' } },
      { ...input, entries: { invalid: 'x' } },
      { ...input, schemaVersion: 2 },
    ]) expect((await f.request('', 'POST', body)).status).toBe(400);
    expect((await f.request('', 'POST', { ...input, name: 'x'.repeat(100) })).status).toBe(201);
    const overhead = new TextEncoder().encode(JSON.stringify({ 'GstRender.Value': '' })).length;
    const exact = { 'GstRender.Value': 'x'.repeat(maxConfigBytes - overhead - 2) + '\u00e9' };
    expect((await f.request('', 'POST', { ...input, entries: exact })).status).toBe(201);
    expect((await f.request('', 'POST', { ...input, entries: { 'GstRender.Value': exact['GstRender.Value'] + 'x' } })).status).toBe(400);
    expect((await f.request('', 'POST', input, f.alice.cookie, 'https://attacker.example')).status).toBe(403);
    expect((await f.request('?limit=51')).status).toBe(400);
    const list = await (await f.request('?limit=1')).json();
    expect(list.nextOffset).toBe(1);
    expect(list.configs[0].entries).toBeUndefined();
    expect((await f.request('', 'POST', { ...input, entries: { 'GstRender.Value': 'x'.repeat(300_000) } })).status).toBe(413);
  });

  test('quota checks remain atomic and snapshots survive reopening the database', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf6-db-'));
    const path = join(dir, 'test.sqlite');
    let database = openDatabase(path);
    try {
      database.query('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)').run('owner', 'Owner', 'owner@example.test', 1, 0, 0);
      const store = configStore(database);
      for (let index = 0; index < 49; index++) store.create('owner', input);
      const f = store.create('owner', { ...input, entries: validateEntries({ 'GstRender.Unknown': '42', 'GstRender.ShaderBundleVersion_123': 'original' }) });
      expect(() => store.create('owner', input)).toThrow('50 configs');
      const backup = join(dir, 'backup.sqlite');
      backupDatabase(path, backup);
      const restored = openDatabase(backup);
      try {
        expect(configStore(restored).get('owner', f.id).entries).toEqual(f.entries);
      } finally { restored.close(); }
      database.close();
      database = openDatabase(path);
      expect(configStore(database).get('owner', f.id).entries).toEqual(f.entries);
    } finally {
      database.close();
      await rm(dir, { recursive: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  test('two creates cannot consume the same final quota slot', async () => {
    const f = await fixture();
    const store = configStore(f.database);
    for (let index = 0; index < 49; index++) store.create(f.alice.user.id, input);
    const responses = await Promise.all([f.request('', 'POST', input), f.request('', 'POST', input)]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(store.list(f.alice.user.id, 0, 50)).toHaveLength(50);
    expect((await f.request('', 'POST', input, f.bob.cookie)).status).toBe(201);
  });

  test('auth features stay restricted and public deployment requires HTTPS', async () => {
    const f = await fixture();
    expect(() => readConfig({ BETTER_AUTH_SECRET: f.config.secret, BETTER_AUTH_URL: 'http://public.example' })).toThrow('HTTPS');
    expect(() => readConfig({ BETTER_AUTH_SECRET: f.config.secret, GOOGLE_CLIENT_ID: 'partial' })).toThrow('both credentials');
    expect((await f.handle(new Request(`${f.config.origin}/api/auth/link-social`, {
      method: 'POST', headers: { origin: f.config.origin, 'content-type': 'application/json' }, body: '{}',
    }))).status).toBe(404);
    expect(f.auth.options.account?.accountLinking?.enabled).toBe(false);
  });

  test('providers start server-side OAuth with state, secure cookies and restricted return URLs', async () => {
    const f = await fixture({
      BETTER_AUTH_URL: 'https://configs.example.test',
      GOOGLE_CLIENT_ID: 'test-google', GOOGLE_CLIENT_SECRET: 'test-secret',
      GITHUB_CLIENT_ID: 'test-github', GITHUB_CLIENT_SECRET: 'test-secret',
      MICROSOFT_CLIENT_ID: 'test-microsoft', MICROSOFT_CLIENT_SECRET: 'test-secret',
    });
    for (const provider of ['google', 'github', 'microsoft']) {
      const response = await f.handle(new Request(`${f.config.origin}/api/auth/sign-in/social`, {
        method: 'POST', headers: { origin: f.config.origin, 'content-type': 'application/json' },
        body: JSON.stringify({ provider, callbackURL: '/', errorCallbackURL: '/?signinError=1' }),
      }), '127.0.0.1');
      expect(response.status).toBe(200);
      const data = await response.json();
      const destination = new URL(data.url);
      expect(destination.protocol).toBe('https:');
      expect(destination.searchParams.get('state')).toBeTruthy();
      expect(destination.searchParams.get('redirect_uri')).toBe(`${f.config.origin}/api/auth/callback/${provider}`);
      expect(data.url).not.toContain('test-secret');
      expect(response.headers.get('set-cookie')).toContain('HttpOnly');
      expect(response.headers.get('set-cookie')).toContain('Secure');
      if (provider === 'microsoft') expect(destination.pathname).toContain('/consumers/');
    }
    const throttled = new Request(`${f.config.origin}/api/auth/sign-in/social`, {
      method: 'POST', headers: { origin: f.config.origin, 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'google', callbackURL: '/' }),
    });
    expect((await f.handle(throttled, '127.0.0.1')).status).toBe(429);
    const unsafeRequest = new Request(`${f.config.origin}/api/auth/sign-in/social`, {
      method: 'POST', headers: { origin: f.config.origin, 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'google', callbackURL: 'https://attacker.example' }),
    });
    const badReturn = await f.handle(unsafeRequest, '127.0.0.2');
    expect(badReturn.status).toBe(403);
  });
});
