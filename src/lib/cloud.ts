import { isRecord, validateConfigInput } from '$lib/saved-configs';
import type { ConfigInput, ConfigMetadata, SavedConfig } from '$lib/saved-configs';

export interface Account { id: string; name: string }
let expectedAccount: string | null = null;
export function expectAccount(id: string | null) { expectedAccount = id; }
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api(path: string, method = 'GET', body?: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(path.startsWith('configs') && expectedAccount ? { 'X-BF6-Account-ID': expectedAccount } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, 'Server unavailable. Your local work is unchanged; export it or retry.');
  }
  if (response.status === 204) return null;
  if (!response.headers.get('content-type')?.includes('application/json')) throw new ApiError(response.status, 'Saved configs are unavailable on this server.');
  const data: unknown = await response.json();
  if (!response.ok) {
    const message = isRecord(data) && typeof data.error === 'string' ? data.error
      : isRecord(data) && typeof data.message === 'string' ? data.message : 'Request failed. Retry or export your draft.';
    throw new ApiError(response.status, message);
  }
  return data;
}

export function metadata(value: unknown): ConfigMetadata {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string'
    || typeof value.deviceKey !== 'string' || value.schemaVersion !== 1
    || typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 1
    || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') throw new Error('Invalid saved config response.');
  return { id: value.id, name: value.name, deviceKey: value.deviceKey, schemaVersion: 1, revision: value.revision, createdAt: value.createdAt, updatedAt: value.updatedAt };
}

export function savedConfig(value: unknown): SavedConfig {
  return { ...metadata(value), ...validateConfigInput(value) };
}

export async function getAccount(): Promise<Account | null> {
  const data = await api('auth/get-session');
  if (data === null) return null;
  if (!isRecord(data) || !isRecord(data.user) || typeof data.user.id !== 'string' || typeof data.user.name !== 'string') throw new Error('Invalid session response.');
  return { id: data.user.id, name: data.user.name };
}

export async function signIn(provider: string) {
  const data = await api('auth/sign-in/social', 'POST', { provider, callbackURL: '/', errorCallbackURL: '/?signinError=1' });
  if (!isRecord(data) || typeof data.url !== 'string' || !data.url.startsWith('https://')) throw new Error('Invalid sign-in redirect.');
  window.location.assign(data.url);
}

export async function saveConfig(input: ConfigInput, previous?: ConfigMetadata) {
  return savedConfig(await api(previous ? `configs/${previous.id}` : 'configs', previous ? 'PUT' : 'POST', {
    ...input, ...(previous ? { revision: previous.revision } : {}),
  }));
}
