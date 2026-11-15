import { makeSignature } from 'better-auth/crypto';
import { createApp } from '../server/app';
import { openDatabase } from '../server/db';
import { readConfig } from '../server/config';

// Test-only session fixture. Neither this file nor its route is included in the API image.
const config = readConfig({ BETTER_AUTH_URL: 'http://127.0.0.1:1422', BETTER_AUTH_SECRET: 'browser-tests-only-never-use-in-production-12345', LOCAL_AUTH_ENABLED: 'true' });
const database = openDatabase(':memory:');
const app = createApp(database, config);
const context = await app.auth.$context;
Bun.serve({
  hostname: '127.0.0.1',
  port: 1423,
  async fetch(request) {
    if (new URL(request.url).pathname === '/api/__test/session' && request.method === 'POST') {
      const id = crypto.randomUUID();
      const user = await context.internalAdapter.createUser({ email: `${id}@example.test`, name: 'Test player', emailVerified: true }, { method: 'oauth', oauth: { providerId: 'github', profile: {} } });
      const session = await context.internalAdapter.createSession(user.id, false);
      const signed = `${session.token}.${await makeSignature(session.token, config.secret)}`;
      return Response.json({ user }, { headers: { 'Set-Cookie': `${context.authCookies.sessionToken.name}=${encodeURIComponent(signed)}; Path=/; HttpOnly; SameSite=Lax` } });
    }
    return app.handle(request, request.headers.get('x-bf6-test-ip') ?? '127.0.0.1');
  },
});
