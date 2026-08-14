# Zamzam API guide for mobile

This guide covers the integration details that are easy to miss when building
the React Native client. The complete, machine-readable contract is in
[`openapi.json`](./openapi.json), and an import-ready collection is in
[`Zamzam-Mobile.postman_collection.json`](./Zamzam-Mobile.postman_collection.json).

The contract currently describes API version 2.0.0, with 135 operations and 82
schemas. FastAPI also serves interactive Swagger documentation at `/docs` and
ReDoc at `/redoc` on a running API instance.

## Base URLs

| Target | Base URL |
| --- | --- |
| Production | `https://zamzam-api.fly.dev` |
| Android emulator | `http://10.0.2.2:8000` |
| iOS simulator | `http://127.0.0.1:8000` |
| Physical device | `http://<development-machine-LAN-IP>:8000` |

Do not add a trailing slash to the configured base URL. Android and iOS release
builds should use HTTPS. Local HTTP development may require platform-specific
cleartext transport configuration.

## Authentication flow

The native app should use bearer tokens, not the browser cookie/CSRF flow.

1. Generate a stable random `device_id` for this app installation. It must be
   between 8 and 100 characters. Store it locally and reuse it after logout.
2. Call `POST /auth/login` with the username, password, `device_id`, and a
   human-readable `device_name`.
3. Store `access_token` and `refresh_token` in Keychain/Keystore-backed secure
   storage. Never store them in AsyncStorage, source code, logs, analytics, or
   crash reports.
4. Send `Authorization: Bearer <access_token>` on protected requests.
5. Use the returned `expires_in` value to refresh shortly before expiry. If a
   request receives `401`, attempt one refresh and retry it once.
6. `POST /auth/refresh` rotates the refresh token. Persist both returned tokens
   atomically; the old refresh token stops being valid.
7. On sign-out, call `POST /auth/revoke-device` with the refresh token, then
   erase both tokens locally. `POST /auth/logout` revokes every device session
   for the user, so reserve it for an explicit “sign out everywhere” action.

Login request:

```json
{
  "username": "developer",
  "password": "correct horse battery staple",
  "device_id": "550e8400-e29b-41d4-a716-446655440000",
  "device_name": "Ahmed's Pixel 9"
}
```

Token response:

```json
{
  "access_token": "...",
  "token_type": "bearer",
  "refresh_token": "...",
  "expires_in": 28800
}
```

Refresh request:

```json
{
  "refresh_token": "...",
  "device_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

Use a single-flight refresh mechanism: while one refresh is running, other
failed requests should await it instead of rotating the same refresh token in
parallel.

## Tenant selection and permissions

Zamzam is multi-tenant. After login, call `GET /auth/me` and use:

- `memberships` to populate the Tahfiz/workspace picker;
- `tahfiz_id` and `tahfiz` for the active workspace;
- `role` and `capabilities` to control available UI actions;
- tenant settings such as `attendance_statuses`, `present_status`,
  `absent_status`, colors, session-name options, and progress flags.

Send the selected workspace on tenant-scoped calls:

```http
Authorization: Bearer <access-token>
X-Tahfiz-ID: 42
```

The server still enforces membership and role checks. Hiding a button in the UI
is not authorization. A `sheikh` may receive a filtered student dataset when
`restrict_sheikh_student_access` is enabled; the client must not assume all
students are visible. Use `POST /auth/default-tahfiz` when the user explicitly
chooses a new default workspace.

## Recommended startup sequence

1. Load the device ID and tokens from secure storage.
2. Refresh if the access token is missing or close to expiry.
3. Call `GET /auth/me`.
4. Resolve the active Tahfiz and set `X-Tahfiz-ID`.
5. If the device has no local dataset, call `GET /sync/v1/bootstrap`.
6. Otherwise push queued mutations, then pull `/sync/v1/changes` until
   `has_more` is false.
7. Start normal screen queries and background synchronization.

If token refresh fails with `401`, clear credentials and return to login. If a
selected membership no longer exists, return to workspace selection instead of
repeatedly retrying tenant requests.

## Endpoint map

| Area | Important endpoints | Mobile use |
| --- | --- | --- |
| Health | `GET /health` | Connectivity/server health check |
| Auth | `/auth/login`, `/auth/refresh`, `/auth/revoke-device`, `/auth/me`, `/auth/default-tahfiz` | Session and workspace setup |
| Mobile sync | `/sync/v1/bootstrap`, `/sync/v1/changes`, `/sync/v1/mutations` | Offline-first local database sync |
| Sessions | `/sessions/all`, `/sessions/upcoming`, `/sessions/{id}/attendance`, confirm/reopen routes | Session lifecycle and roster |
| Attendance | `/attendance/{id}`, `/attendance/upsert`, `/attendance/batch` | Attendance editing |
| Qur'an progress | `/sessions/{id}/progress`, progress batch, student plans/goals/history | Memorization tracking |
| Students/sheikhs | `/students`, `/students/{id}/profile`, `/sheikhs` | Directory and profiles |
| Reports | `/reports/dashboard-summary`, circle/student reports, attendance grid | Dashboards and reporting |
| Invitations | preview, register, accept, list, resend | Account onboarding |
| Subscriptions/finance | `/subscriptions/*`, `/finance/*` | Fees, payments, receipts, expenses |
| Feedback | `POST /feedback` | In-app feedback |
| Uploads | `GET /uploads/{path}?token=...`, student picture upload | Signed media access |

Use the OpenAPI file or Postman collection for all paths, request schemas,
query parameters, and role-specific administration endpoints.

## Offline synchronization

### Bootstrap

`GET /sync/v1/bootstrap?history_days=90` returns a tenant-scoped snapshot:

- `schema_version`, `cursor`, and `server_time`;
- Tahfiz settings required to interpret records;
- visible sheikhs and students;
- open sessions plus confirmed sessions inside the history window;
- attendance and Qur'an progress for those sessions.

Replace the local tenant dataset and cursor in one database transaction. Do not
mix data from different `tahfiz_id` values in an unscoped cache.

### Pull changes

Call `GET /sync/v1/changes?cursor=<last-cursor>&limit=200`. Apply each item in
cursor order and persist `next_cursor` in the same transaction. Continue while
`has_more` is true. A change contains:

```json
{
  "cursor": 1234,
  "entity_type": "attendance",
  "entity_key": "987",
  "operation": "upsert",
  "payload": {}
}
```

For `operation: "delete"`, remove the local record identified by
`entity_type`/`entity_key`. The payload is `null`.

### Push mutations

`POST /sync/v1/mutations` accepts 1–500 attendance or `quran_progress`
mutations. Every mutation needs:

- a globally unique `mutation_id` (8–64 characters), retained across retries;
- the stable installation `device_id`;
- an `entity_type` and deterministic `entity_key`;
- the local record's `base_revision` (`0` for a new record);
- `values` and an optional ISO-8601 `client_changed_at` timestamp.

Example attendance mutation:

```json
{
  "mutations": [
    {
      "mutation_id": "01J5Z9H7J91E7JYPHQGZ71CX8M",
      "device_id": "550e8400-e29b-41d4-a716-446655440000",
      "entity_type": "attendance",
      "entity_key": "session:12:student:34",
      "base_revision": 2,
      "values": {
        "session_id": 12,
        "student_id": 34,
        "status": "حاضر",
        "notes": null,
        "sheikh_id": 7
      },
      "client_changed_at": "2026-08-14T16:30:00Z"
    }
  ]
}
```

The server stores mutation receipts, so retrying the same `mutation_id` is
idempotent and returns `replayed: true`. Handle each result independently:

- `applied`: replace the local entity with the returned server entity;
- `conflict` / `revision_conflict`: retain both `server` and `local` values and
  present or apply a deliberate conflict policy;
- `rejected`: keep a user-visible failure reason and do not retry forever.

Common rejection codes include `entity_not_found`, `session_locked`,
`invalid_attendance_status`, `invalid_sheikh`, `progress_tracking_disabled`,
and `session_progress_disabled`.

## Direct attendance writes

For an online-only interaction, the standard attendance endpoints are also
available. `POST /attendance/batch` requires an `Idempotency-Key` header. Reuse
the same key only when retrying the exact same logical batch. Supply
`expected_version` to detect concurrent edits. A version mismatch returns `409`
with `detail.code = "session_version_conflict"` and `current_version`.

Confirmed sessions are locked. Treat `409` as a state change, refresh the
session, and explain it to the user instead of blindly retrying. Attendance
status values are tenant-configured strings; always use the options returned by
`/auth/me` or bootstrap rather than hard-coding the Arabic defaults.

## Errors and retry policy

FastAPI errors usually have this shape:

```json
{"detail": "Human-readable message"}
```

Validation errors (`422`) return `detail` as an array. Some domain conflicts use
an object such as `{"detail":{"code":"session_version_conflict"}}`. Normalize
all three forms before showing a message.

| Status | Client behavior |
| --- | --- |
| `400` / `422` | Fix the request; do not automatically retry |
| `401` | Refresh once, retry once, otherwise sign out |
| `403` | Show insufficient permissions; do not retry |
| `404` | Remove/refresh stale local data where appropriate |
| `409` | Resolve a domain or revision conflict |
| `429` | Respect `Retry-After` if present and back off |
| `500` / `502` / `503` / `504` | Retry safe/idempotent requests with capped exponential backoff and jitter |

Set request timeouts and support cancellation when screens unmount. Do not retry
non-idempotent writes unless they have a stable mutation ID or idempotency key.

## Data conventions

- Dates are `YYYY-MM-DD`; timestamps are ISO 8601 and should be stored/compared
  in UTC, then formatted in the user's locale.
- IDs and revisions are integers unless the schema says otherwise.
- Currency amounts ending in `_minor` are integer minor units, never floats.
- Arabic names, statuses, and notes are UTF-8 strings. Preserve them exactly.
- Signed media URLs can expire. Store the underlying entity, not the signed URL
  as a permanent identifier; fetch a fresh entity when media returns `401`.
- A successful `DELETE` may return `204` with no JSON body.

## Postman quick start

1. Import `Zamzam-Mobile.postman_collection.json` into Postman.
2. Set collection variables `username` and `password`.
3. Choose `baseUrl` (production is the default).
4. Run **auth → Login**. Its test script stores `bearerToken` and
   `refreshToken` automatically.
5. Run **auth → Get Me**, copy a membership's `tahfiz_id` into the collection
   variable `tahfizId`, then call tenant-scoped endpoints.

The collection contains generated examples for the entire OpenAPI contract.
Replace placeholder request values before sending writes.

## Updating these artifacts

From the API repository, export the latest contract:

```sh
PYTHONPATH=. .venv/bin/python scripts/export_openapi.py ../mobile/docs/openapi.json
```

From this mobile repository, regenerate and configure the collection:

```sh
npx --yes openapi-to-postmanv2 openapi2postmanv2 \
  -s docs/openapi.json \
  -o docs/Zamzam-Mobile.postman_collection.json \
  -p -O folderStrategy=Tags,includeAuthInfoInExample=false
node scripts/configure-postman.mjs
```
