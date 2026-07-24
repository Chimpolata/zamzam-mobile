# Zamzam API contracts

`openapi.json` is exported from FastAPI and `src/api.ts` is generated from it.
The generated file is the transport-level contract shared by the web and mobile
clients. Local SQLite models remain mobile-specific because they include sync
metadata that is intentionally absent from the public API.

Regenerate after changing backend routes or schemas:

```bash
cd backend
python -m scripts.export_openapi ../packages/contracts/openapi.json
cd ..
npx -p typescript@5 -p openapi-typescript openapi-typescript \
  packages/contracts/openapi.json -o packages/contracts/src/api.ts
```
