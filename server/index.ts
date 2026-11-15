import { readConfig } from './config';
import { openDatabase } from './db';
import { createApp, maxBodyBytes } from './app';

const config = readConfig(process.env);
const database = openDatabase(config.databasePath);
const app = createApp(database, config);
const server = Bun.serve({
  port: config.port,
  hostname: '0.0.0.0',
  maxRequestBodySize: maxBodyBytes,
  fetch(request, server) {
    const clientIp = config.trustProxy
      ? request.headers.get('x-bf6-client-ip') ?? 'proxy'
      : server.requestIP(request)?.address ?? 'local';
    return app.handle(request, clientIp);
  },
});
if (!config.providerNames.length && !config.localAuthEnabled) console.warn('No sign-in providers configured. Saved configs require OAuth credentials or explicit localhost test authentication.');
if (config.localAuthEnabled) console.warn('Local username/password accounts enabled for testing only. Do not expose this API publicly.');
console.info(`Config API listening on port ${server.port}`);

async function shutdown() {
  await server.stop();
  database.close();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
