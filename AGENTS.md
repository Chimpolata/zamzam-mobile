# Zamzam Mobile Agent Guide

Zamzam Mobile is the Arabic-first, RTL Expo/React Native client. It stores
offline attendance and Qur'an progress in encrypted SQLite and synchronizes
tenant-scoped mutations with `ZamzamApplication/zamzam-api`.

- Preserve Arabic copy, RTL behavior, touch-friendly layouts, dark mode,
  accessibility, biometric locking, and safe-area support.
- Keep offline mutations durable and conflict handling explicit.
- Keep generated API types in `contracts/` aligned with
  `ZamzamApplication/zamzam-api`.
- Do not weaken authentication, tenant isolation, secure storage, SQLCipher, or
  remote session confirmation/version checks.
- Validate with `npm run typecheck`, `npx expo-doctor`, and an Android export.
- APK releases are manually triggered through the release workflow.
