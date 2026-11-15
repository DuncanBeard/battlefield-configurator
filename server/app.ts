import type { Database } from 'bun:sqlite';
import { isRecord, validateConfigInput, validateName } from '../lib/saved-configs';
import { createAuth } from './auth';
import type { ServerConfig } from './config';
import { configStore, HttpError } from './configs';

const maxBodyBytes = 280 * 1024;
export { maxBodyBytes };

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Expected JSON body.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) {
        await reader.cancel();
        throw new HttpError(413, 'Request is too large.');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!isRecord(parsed)) throw new HttpError(400, 'Expected JSON object.');
    return parsed;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof SyntaxError || error instanceof TypeError) throw new HttpError(400, 'Invalid JSON body.');
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function revision(body: Record<string, unknown>): number {
  if (!Number.isSafeInteger(body.revision) || typeof body.revision !== 'number' || body.revision < 1) {
    throw new HttpError(400, 'A positive revision is required.');
  }
  return body.revision;
}

function validate<T>(action: () => T): T {
  try { return action(); }
  catch (error) {
    if (error instanceof Error) throw new HttpError(400, error.message);
    throw error;
  }
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function createApp(database: Database, config: ServerConfig) {
  const auth = createAuth(database, config);
  const store = configStore(database);
  function sessionAllowed(userId: string) {
    return config.localAuthEnabled || !database.query('SELECT id FROM account WHERE userId = ? AND providerId = ?').get(userId, 'credential');
  }
  const limits = new Map<string, { expires: number; count: number }>();
  function rateLimit(key: string, max: number) {
    const now = Date.now();
    for (const [id, entry] of limits) if (entry.expires <= now) limits.delete(id);
    const entry = limits.get(key) ?? { expires: now + 60_000, count: 0 };
    if (!limits.has(key) && limits.size >= 10_000) throw new HttpError(503, 'Server is busy. Retry shortly.');
    entry.count++;
    limits.set(key, entry);
    if (entry.count > max) throw new HttpError(429, 'Too many requests. Retry in a minute.');
  }

  async function handle(request: Request, clientIp = 'local') {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/api/health/live') return json({ status: 'ok' });
      if (url.pathname === '/api/health/ready') {
        database.query('SELECT count(*) FROM saved_configs').get();
        return json({ status: 'ok' });
      }
      rateLimit(`ip:${clientIp}`, 240);
      const mutation = !['GET', 'HEAD'].includes(request.method);
      if (mutation) {
        if (request.headers.get('origin') !== config.origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'Untrusted request origin.');
        if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new HttpError(415, 'Use application/json.');
        const length = request.headers.get('content-length');
        if (length && Number(length) > maxBodyBytes) throw new HttpError(413, 'Request is too large.');
      }
      if (url.pathname === '/api/providers' && request.method === 'GET') return json({ providers: config.providerNames, localAuthEnabled: config.localAuthEnabled });
      if (url.pathname.startsWith('/api/auth/')) {
        const route = url.pathname.slice('/api/auth/'.length);
        const localRoute = config.localAuthEnabled && ['local/sign-up', 'local/sign-in'].includes(route) && request.method === 'POST';
        const allowed = (['sign-in/social', 'sign-out'].includes(route) && request.method === 'POST')
          || (route === 'get-session' && request.method === 'GET')
          || (/^callback\/(google|github|microsoft)$/.test(route) && request.method === 'GET')
          || localRoute;
        if (!allowed) throw new HttpError(404, 'Auth endpoint not available.');
        if (route === 'get-session' && !config.localAuthEnabled) {
          const session = await auth.api.getSession({ headers: request.headers });
          if (session && !sessionAllowed(session.user.id)) return json(null);
        }
        if (route === 'sign-in/social') {
          const body = await readBody(request.clone());
          if (Object.keys(body).some((key) => !['provider', 'callbackURL', 'errorCallbackURL'].includes(key))) throw new HttpError(400, 'Unsupported sign-in option.');
          if (typeof body.provider !== 'string' || !config.providerNames.includes(body.provider)) throw new HttpError(400, 'Sign-in provider is not configured.');
          for (const key of ['callbackURL', 'errorCallbackURL']) {
            if (body[key] === undefined) continue;
            if (typeof body[key] !== 'string') throw new HttpError(400, 'Invalid return URL.');
            let destination: URL;
            try { destination = new URL(body[key], config.origin); }
            catch { throw new HttpError(400, 'Invalid return URL.'); }
            if (destination.origin !== config.origin || destination.username || destination.password) throw new HttpError(403, 'Untrusted return URL.');
          }
        }
        const headers = new Headers(request.headers);
        headers.set('x-bf6-client-ip', clientIp);
        let authRequest: Request;
        if (localRoute) {
          rateLimit(`local-auth:${clientIp}`, 10);
          const body = await readBody(request);
          if (Object.keys(body).some((key) => !['username', 'password'].includes(key))) throw new HttpError(400, 'Unsupported local sign-in option.');
          if (typeof body.username !== 'string' || !/^[a-zA-Z0-9_]{3,30}$/.test(body.username)) throw new HttpError(400, 'Username must contain 3-30 letters, numbers or underscores.');
          if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) throw new HttpError(400, 'Use a password between 12 and 128 characters.');
          const username = body.username.toLowerCase();
          const signup = route === 'local/sign-up';
          headers.delete('content-length');
          authRequest = new Request(new URL(signup ? '/api/auth/sign-up/email' : '/api/auth/sign-in/username', config.origin), {
            method: 'POST', headers,
            body: JSON.stringify(signup
              ? { username, name: username, email: `${username}@local.invalid`, password: body.password }
              : { username, password: body.password }),
          });
        } else authRequest = new Request(request, { headers });
        const response = await auth.handler(authRequest);
        response.headers.set('Cache-Control', 'no-store');
        if (localRoute && response.ok) {
          const headers = new Headers(response.headers);
          headers.delete('content-length');
          return Response.json({ success: true }, { status: response.status, headers });
        }
        return response;
      }
      const match = /^\/api\/configs(?:\/([A-Za-z0-9-]+))?$/.exec(url.pathname);
      if (!match) throw new HttpError(404, 'Endpoint not found.');
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session || !sessionAllowed(session.user.id)) throw new HttpError(401, 'Sign in to access saved configs.');
      const userId = session.user.id;
      const expectedAccount = request.headers.get('x-bf6-account-id');
      if (expectedAccount && expectedAccount !== userId) throw new HttpError(401, 'Your account changed. Reload before accessing saved configs.');
      rateLimit(`user:${userId}:${mutation ? 'write' : 'read'}`, mutation ? 60 : 240);
      const id = match[1];
      if (request.method === 'GET') {
        if (id) return json(store.get(userId, id));
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const limit = Number(url.searchParams.get('limit') ?? 20);
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > 50 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new HttpError(400, 'Invalid pagination.');
        const configs = store.list(userId, offset, limit);
        return json({ configs, nextOffset: configs.length === limit && offset + limit < 50 ? offset + limit : null });
      }
      const body = await readBody(request);
      if ('userId' in body || 'user_id' in body || 'ownerId' in body) throw new HttpError(400, 'Ownership cannot be specified.');
      if (request.method === 'POST' && !id) return json(store.create(userId, validate(() => validateConfigInput(body))), 201);
      if (id && request.method === 'PUT') return json(store.update(userId, id, revision(body), validate(() => validateConfigInput(body))));
      if (id && request.method === 'PATCH') return json(store.update(userId, id, revision(body), { name: validate(() => validateName(body.name)) }));
      if (id && request.method === 'DELETE') {
        store.delete(userId, id, revision(body));
        return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
      }
      throw new HttpError(405, 'Method not allowed.');
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error('API request failed', { errorType: error instanceof Error ? error.name : 'UnknownError' });
      return json({ error: 'Server could not complete the request. Your local draft has not been saved.' }, 500);
    }
  }
  return { auth, handle };
}
