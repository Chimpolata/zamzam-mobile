# Zamzam mobile

Expo/React Native client for Android and iOS. The app caches every active
Tahfiz membership, stores attendance and Qur'an progress in encrypted SQLite,
and synchronizes a durable mutation outbox with the FastAPI backend.

## Development

1. Copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_API_URL`.
2. Install dependencies with `npm install`.
3. Run `npm run typecheck`.
4. Create a development build with `npx eas build --profile development`.
5. Start Metro with `npm start`.

SQLCipher is enabled through the `expo-sqlite` config plugin. Use a development
build rather than Expo Go when testing the encrypted production database.

## Offline contract

- The first login and administrative screens require a connection.
- Open sessions and 90 days of history are cached for every active membership.
- Attendance and Qur'an progress edits are saved immediately to the local
  outbox and survive restarts.
- Session confirmation is online-only and drains the outbox first.
- Concurrent edits to the same row appear in the conflict review screen.
- Foreground/manual sync is authoritative; the OS also receives a best-effort
  hourly background task and may defer it for battery or scheduling reasons.

Management, reporting, invitations, users, saved filters, platform support, and
Tahfiz settings use the existing online API. Administrative changes deliberately
remain online-only so they never bypass server authorization or validation.

## Release

The `apk` EAS profile produces a signed, directly installable Android APK. The
`production` profile produces an AAB for Google Play.

Before the release workflow can run for the first time:

1. Install dependencies: `cd mobile && npm ci`.
2. Sign in to Expo: `npx eas-cli login`.
3. Link or create the EAS project: `npx eas-cli init`. Commit the generated
   `extra.eas.projectId` value in `app.json`; it is a public project identifier,
   not a secret.
4. Run `npx eas-cli build --platform android --profile apk` once interactively.
   This lets EAS create or select the Android signing key.
5. Create an Expo access token and save it in the GitHub repository as the
   Actions secret `EXPO_TOKEN`.

Run the **Mobile APK release** workflow manually to get an Actions artifact
without creating a release. Supply a tag such as `mobile-v1.0.0` to also create
a GitHub Release, or push a `mobile-v*` tag and the workflow will create the
release automatically.

The build embeds `https://zamzam-api.fly.dev` as its API endpoint. EAS manages
the signing key; no keystore or password is stored in Git.
