import type { BetterAuthOptions } from 'better-auth';

export interface ServerConfig {
  origin: string;
  secret: string;
  databasePath: string;
  port: number;
  trustProxy: boolean;
  localAuthEnabled: boolean;
  providers: NonNullable<BetterAuthOptions['socialProviders']>;
  providerNames: string[];
}

export function readConfig(env: Record<string, string | undefined>): ServerConfig {
  const url = new URL(env.BETTER_AUTH_URL ?? 'http://localhost:1420');
  if (url.origin !== url.href.replace(/\/$/, '') || url.username || url.password) throw new Error('BETTER_AUTH_URL must be an origin without a path.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('BETTER_AUTH_URL requires HTTPS except on localhost.');
  }
  if (env.LOCAL_AUTH_ENABLED && !['true', 'false'].includes(env.LOCAL_AUTH_ENABLED)) throw new Error('LOCAL_AUTH_ENABLED must be true or false.');
  const localAuthEnabled = env.LOCAL_AUTH_ENABLED === 'true';
  if (localAuthEnabled && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Local test accounts require a localhost BETTER_AUTH_URL. Disable LOCAL_AUTH_ENABLED for public deployments.');
  }
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('Set BETTER_AUTH_SECRET to a random secret of at least 32 characters.');
  const port = Number(env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  const providers: ServerConfig['providers'] = {};
  const providerNames: string[] = [];
  for (const provider of ['google', 'github', 'microsoft'] as const) {
    const clientId = env[`${provider.toUpperCase()}_CLIENT_ID`];
    const clientSecret = env[`${provider.toUpperCase()}_CLIENT_SECRET`];
    if (!!clientId !== !!clientSecret) throw new Error(`Configure both credentials for ${provider}.`);
    if (clientId && clientSecret) {
      providers[provider] = { clientId, clientSecret, ...(provider === 'microsoft' ? { tenantId: 'consumers' } : {}) };
      providerNames.push(provider);
    }
  }
  return {
    origin: url.origin, secret, port, providers, providerNames, localAuthEnabled,
    databasePath: env.DATABASE_PATH ?? 'data/configurator.sqlite',
    trustProxy: env.TRUST_PROXY === 'true',
  };
}
