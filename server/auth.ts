import { betterAuth } from 'better-auth';
import { username } from 'better-auth/plugins';
import type { Database } from 'bun:sqlite';
import type { ServerConfig } from './config';

export function createAuth(database: Database, config: ServerConfig) {
  return betterAuth({
    database,
    secret: config.secret,
    baseURL: config.origin,
    trustedOrigins: [config.origin],
    onAPIError: { errorURL: `${config.origin}/?signinError=1` },
    socialProviders: config.providers,
    emailAndPassword: { enabled: config.localAuthEnabled, minPasswordLength: 12, maxPasswordLength: 128 },
    plugins: config.localAuthEnabled ? [username({
      minUsernameLength: 3,
      maxUsernameLength: 30,
      usernameValidator: (value) => /^[a-z0-9_]+$/.test(value),
    })] : [],
    account: { accountLinking: { enabled: false }, encryptOAuthTokens: true },
    session: { cookieCache: { enabled: false } },
    advanced: {
      useSecureCookies: config.origin.startsWith('https:'),
      ipAddress: { ipAddressHeaders: ['x-bf6-client-ip'] },
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
    },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 60 },
  });
}
