<script lang="ts">
  import { api } from '../lib/cloud';

  let { onauthenticated, oncancel }: { onauthenticated: () => Promise<void>; oncancel: () => void } = $props();
  let registering = $state(false);
  let username = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state('');

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      await api(`auth/local/${registering ? 'sign-up' : 'sign-in'}`, 'POST', { username, password });
      password = '';
      await onauthenticated();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Local sign-in failed.';
    } finally {
      password = '';
      busy = false;
    }
  }
</script>

<section class="local-auth" aria-labelledby="local-auth-title">
  <h2 id="local-auth-title">{registering ? 'Create a local test account' : 'Local test sign-in'}</h2>
  <p>Testing only. Accounts are stored on this server. Do not reuse a real password.</p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <form onsubmit={submit}>
    <label for="local-username">Username</label>
    <input id="local-username" name="username" autocomplete="username" bind:value={username} pattern={'[a-zA-Z0-9_]{3,30}'} minlength="3" maxlength="30" required disabled={busy} aria-describedby="username-help" />
    <small id="username-help">3-30 letters, numbers or underscores; case-insensitive.</small>
    <label for="local-password">Password</label>
    <input id="local-password" name="password" type="password" autocomplete={registering ? 'new-password' : 'current-password'} bind:value={password} minlength="12" maxlength="128" required disabled={busy} aria-describedby="password-help" />
    <small id="password-help">12-128 characters. Stored as a salted password hash, never plaintext.</small>
    <div class="actions">
      <button class="primary" type="submit" disabled={busy}>{busy ? 'Please wait...' : registering ? 'Create account' : 'Sign in'}</button>
      <button type="button" onclick={() => { registering = !registering; password = ''; error = ''; }} disabled={busy}>{registering ? 'Use existing account' : 'Create test account'}</button>
      <button type="button" onclick={oncancel} disabled={busy}>Cancel</button>
    </div>
  </form>
</section>

<style>
  .local-auth { border: 1px solid var(--border); border-radius: 4px; background: white; padding: 20px; margin-bottom: 24px; }
  h2 { font-family: var(--display); font-size: 26px; margin: 0 0 8px; }
  p, small { font-size: 12px; color: var(--muted); }
  form { display: grid; gap: 8px; max-width: 480px; }
  label { margin-top: 8px; font-size: 12px; }
  input { width: 100%; min-width: 0; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .error { color: #8e3c2c; }
</style>
