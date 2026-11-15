# Self-hosted accounts and private configs

The optional browser account feature uses Better Auth, a Bun API, and SQLite.
Google, GitHub, and personal Microsoft accounts handle sign-in by default. An
optional localhost-only test flow stores salted password hashes, never plaintext
passwords. No managed authentication or database subscription is required.
Provider registrations, hosting, backups, and maintenance are still required.

The existing standalone browser build, Tauri app, CLI, and anonymous drafts remain
local. Account support is enabled in the browser build with
`VITE_ENABLE_ACCOUNTS=true`. It is always disabled inside Tauri.

## Behavior

- Save as creates a private named snapshot of the current device profile.
- Save updates the loaded snapshot; edits are never automatically uploaded.
- Saved configs can be loaded, renamed, deleted, or exported. Loading never writes
  to the game directory.
- Snapshots include unknown and engine-managed settings and do not change when
  bundled presets change. Read-only settings remain non-editable.
- Limits: 50 configs/account, 100 Unicode code points/name, 256 KiB UTF-8 JSON
  entries/config. Duplicate names are permitted.
- Concurrent updates require reload or Save as. There is no implicit merge,
  sharing, account linking, or revision history.
- Keep using the same sign-in provider. If another provider has the same email,
  linking is refused rather than merging accounts.
- Anonymous drafts retain their existing `bf6-configurator.workspace.v1` storage.
  Account working copies use separate version-2, user-scoped storage. Sign-out
  offers a chance to preserve unsaved work before removing the account copy.
  Browser-profile access still exposes locally stored drafts; this is not local
  encryption. Server sessions use HttpOnly cookies, not localStorage tokens.

## Native local development

Requires Bun and provider registrations. Do not use real provider credentials in
tests.

1. Copy [the environment template](../.env.example) to `.env` (ignored by Git).
2. Generate a secret with `bun -e "console.log(crypto.randomUUID() + crypto.randomUUID())"`
   and put it in `BETTER_AUTH_SECRET`. Keep it stable across restarts and back it
   up securely, separately from the database.
3. Set `BETTER_AUTH_URL=http://localhost:1420`, the URL visible in the browser.
   Keep `TRUST_PROXY=false` when connecting directly to Bun.
4. Configure provider client IDs/secrets as described below.
5. Run `bun install --frozen-lockfile`, then `bun run server`.
6. In a second terminal run `bun run dev`, then open `http://localhost:1420`.

`BF6_API_TARGET` tells Vite where to proxy `/api`. `VITE_ENABLE_ACCOUNTS` is public
build configuration. Never prefix secrets with `VITE_`.
With no provider credentials, the server reports that sign-in is not configured;
partial provider credentials fail startup. A missing/short auth secret also fails
startup. Only explicitly configured providers appear in the UI.

## Local username/password testing

For testing without OAuth registrations, explicitly set `LOCAL_AUTH_ENABLED=true`
in `.env` and restart the API. The browser must be built with accounts enabled as
above. Choose **Local test sign-in**, then **Create test account**.

- Usernames are case-insensitive and contain 3-30 ASCII letters, digits, or
  underscores. Passwords contain 12-128 characters; do not reuse real passwords.
- Better Auth's username plugin handles authentication and its default salted
  scrypt implementation hashes passwords. Hashes are stored in the credential
  account rows in SQLite on the same persistent volume as saved configs.
- The library requires an internal email field; it is synthesized as
  `username@local.invalid`. No email address is requested or mail sent.
- Sign-in creates the same HttpOnly-cookie sessions used by OAuth. Config
  ownership, quotas, conflicts, and sign-out behavior are unchanged.
- No passwords are stored in localStorage, logged, or returned by the API. There
  are no default accounts, recovery endpoints, or links to OAuth accounts.
- The setting defaults to false. Enabling it with a non-localhost
  `BETTER_AUTH_URL` fails startup. Turning it off blocks both local login routes
  and existing local-account sessions; account data remains for later testing.
- The localhost-origin check is not a network firewall. Keep the API private and
  port-forward bound to localhost. Never expose this mode publicly.

For the local Kubernetes deployment, after deploying images containing this
feature:

```powershell
kubectl --context docker-desktop -n battlefield-configurator patch configmap bf6-config --type merge --patch '{"data":{"LOCAL_AUTH_ENABLED":"true"}}'
kubectl --context docker-desktop -n battlefield-configurator rollout restart statefulset/bf6-api
kubectl --context docker-desktop -n battlefield-configurator rollout status statefulset/bf6-api
```

Refresh the browser afterward. Use `"false"` and restart again to disable it.
This does not require replacing the existing auth secret. The additive username
migration preserves existing users and configs.

## OAuth registrations

For each provider register the exact browser-facing callback:

| Provider | Callback path | Requirements |
| --- | --- | --- |
| Google | `/api/auth/callback/google` | OAuth web application; configure consent screen and test users while the app is in testing |
| GitHub | `/api/auth/callback/github` | GitHub OAuth app; use a separate registration when local and public callback URLs differ |
| Microsoft | `/api/auth/callback/microsoft` | Entra app registration with **Personal Microsoft accounts only**, Web callback, consumer tenant; record secret expiration |

For native development the full callback starts with `http://localhost:1420`.
For Compose/local Kubernetes below it starts with `http://localhost:8080`.
Use the same hostname consistently; `localhost` and `127.0.0.1` are different
origins/cookie hosts. Public deployments require HTTPS and exact public callbacks.

Use only identity/email permissions, not repository access or unrelated Graph
permissions. Test Google consent, GitHub private-email accounts, and Microsoft
personal-account login against the actual registrations before inviting users.
Provider unavailability or denied consent must return an error, not create an
authenticated local fallback.

Better Auth handles OAuth state, callback validation, and session issuance.
Automatic account linking and unnecessary auth routes are disabled. Password
authentication is available only through the gated local test routes above.
Provider tokens retained by the library are encrypted using
the auth secret. Auth secret rotation requires the library's documented migration
procedure; simply replacing it may invalidate sessions or encrypted tokens.

## Docker Compose

Requires a Docker engine. Set `BETTER_AUTH_URL=http://localhost:8080` in `.env`.

```powershell
docker compose -f docker-compose.yml -f docker-compose.accounts.yml up --build -d
```

The accounts override enables the browser UI, adds the internal `bf6-api` service,
mounts the nginx API proxy, and stores SQLite in a named volume. No API host port is
published. The original `docker compose up --build` remains standalone/local-only.
Do not use `down -v` unless intentionally deleting all account and config data.

Three CI image variants are published: the original standalone image, its
`-accounts` frontend variant, and its `-api` backend variant. The accounts frontend
still needs the API proxy fragment mounted at `/etc/nginx/bf6-api.conf`.
The default fragment fails API requests explicitly instead of serving SPA HTML.

## Local Kubernetes

Requires an existing local cluster, an image runtime, and a default storage class
backed by a local or block filesystem. No cluster or Azure resources are
automatically provisioned.

```powershell
docker build --build-arg VITE_ENABLE_ACCOUNTS=true -t bf6-configurator:local .
docker build -f docker\api.Dockerfile -t bf6-configurator-api:local .
```

For subsequent updates, use fresh image tags and `kubectl set image` for the
Deployment/StatefulSet. Rebuilding the same `:local` tag alone does not replace
images cached by Kubernetes with `IfNotPresent`.

Make those image tags available in the local cluster's runtime. Docker Desktop
kind requires **Settings > General > Use containerd for pulling and storing
images**. Images built into Docker's classic image store are not available to
that cluster and produce `ImagePullBackOff`. After switching stores, rebuild both
images. Switching stores can temporarily hide existing Docker images/containers;
it does not delete them. Do not switch a shared engine without coordinating with
its users. Standalone kind/k3d clusters need their image-import commands.

Create an ignored `.env.auth` containing **only** `BETTER_AUTH_SECRET` and the
provider client IDs/secrets. Do not include the database path, origin, or Vite
variables; those belong in the ConfigMap.

```powershell
kubectl create namespace battlefield-configurator
kubectl -n battlefield-configurator create secret generic bf6-auth --from-env-file=.env.auth
kubectl apply -f k8s\local.yaml
kubectl -n battlefield-configurator rollout status statefulset/bf6-api
kubectl -n battlefield-configurator rollout status deployment/bf6-web
kubectl -n battlefield-configurator port-forward service/bf6-web 8080:80
```

If the namespace already exists, skip its creation. Open `http://localhost:8080`.
If another local app uses 8080, use a free port such as 8081 for both the port
forward and `BETTER_AUTH_URL` in the ConfigMap, then restart the API to load the
changed origin. Provider registrations must use that same browser-facing port.
No ingress controller is needed for this local workflow. Treat Kubernetes Secrets
as sensitive API resources, not encrypted plaintext files: restrict RBAC, protect
cluster storage, and do not commit secret manifests.

### Single-writer constraint

The API StatefulSet has exactly one replica and a PVC mounted at `/data`.
Never scale it above one, add an API HPA, or force-delete a live pod to work around
storage attachment. ReadWriteOnce alone is not a single-writer guarantee.
Normal StatefulSet replacement terminates the old pod before its replacement.
Expect a brief API outage during upgrades; local editing/export continues.

SQLite WAL must not use NFS, SMB, or a shared network filesystem. Check the local
cluster's storage class before using the manifest. Host-path storage may be lost
when the cluster/node is deleted; a PVC is not a backup.

The stable internal API Service prevents nginx from retaining a replaced pod's
old IP. The headless Service is reserved for StatefulSet identity.

Migrations run under an exclusive write transaction before the API starts.
Startup/readiness probes validate database availability; liveness does not depend
on external identity providers. Migrations and backup tools are server-only.

The API trusts the nginx-overwritten client-IP header only when `TRUST_PROXY=true`.
Do not expose the API directly in that mode. Behind another ingress, all clients
may share one rate-limit bucket until trusted proxy/real-IP handling is configured.
Never trust arbitrary forwarded headers. Public deployment also needs appropriate
network restrictions, HTTPS termination, resource monitoring, and backup storage.

## Backups, restore, and upgrades

Create a consistent live SQLite snapshot with `VACUUM INTO`, not a file copy that
misses WAL data:

```powershell
# Native API: DATABASE_PATH must point at the running database.
bun run server\backup.ts data\backup-new.sqlite

# Kubernetes: use a new destination name each time.
kubectl -n battlefield-configurator exec bf6-api-0 -- bun run server/backup.ts /data/backup-new.sqlite
kubectl -n battlefield-configurator cp bf6-api-0:/data/backup-new.sqlite .\backup-new.sqlite
```

The destination must not already contain data. Copy backups off the application
volume to protected storage; encrypt them and the separately retained auth secret.
Backups contain user identities, sessions, provider tokens, and private configs.
Set a retention policy appropriate to the deployment and honor deletion requests
in retained backups according to that policy. Account deletion is an operator
task in this initial version; deleting an auth user cascades to their configs.

To restore: stop the API, restore into a **clean volume** with the correct
ownership, retain the original auth secret, and restart with the matching
application/schema version. Never put an older database alongside stale WAL/SHM
files or restore over a running writer. Verify account access, isolation, and
config exports after restoration.

Before upgrading Better Auth, generate and review schema changes against the
pinned package. `server/generate-auth-schema.ts` regenerates the initial schema
for comparison only; do not rewrite applied migrations. Add a new numbered
migration and include it in the migration runner, back up first, and test upgrade
and rollback on a restored database.

## Verification

```powershell
bun run check
bun run check:server
bun run test
bun run test:server
bun run test:e2e
bun run build
```

Browser tests start a separate test-only server which creates real database
sessions without contacting social providers. Its fixture route is not copied
into the production image or mounted by the production server. Automated tests
cover ownership, revision conflicts, validation/quotas, persistence, and browser
account workflows. They do not certify real OAuth registrations.

Before exposing the deployment:

1. Sign in and out with each configured real provider.
2. Use two accounts and check that neither can retrieve/update/delete the other's
   configs, even by ID.
3. Save a config, replace the API pod normally, and verify it remains available.
4. Restore a backup into a clean volume and verify sessions/config exports.
5. Check private API responses, HttpOnly/Secure cookie flags on HTTPS, failed
   origin requests, and that nginx never serves SPA HTML for API endpoints.

## Later: AKS and Postgres

AKS is optional and not free: its free cluster-management tier still charges for
underlying nodes, storage, networking, logs, and other resources. Approve a budget
and architecture separately before provisioning.

Before horizontal API scaling, migrate both Better Auth and config data to
Postgres, replace SQLite quota transactions with per-owner database locking, and
use shared rate-limit storage. Preserve user/config IDs and validate ownership
and contents during migration. Use a write-freeze window and a tested rollback
procedure; account for writes accepted after cutover.

Add production HTTPS callbacks, secret management, restricted network access,
monitoring, restore tests, and backups before admitting users. The current local
Kubernetes manifest is not an AKS production deployment template.
