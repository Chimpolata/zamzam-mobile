# Zamzam API contracts

`openapi.json` is exported from the Zamzam API and `src/api.ts` is generated
from it. The generated file is the transport-level contract consumed by this
mobile client. Local SQLite models remain mobile-specific because they include
sync metadata that is intentionally absent from the public API.

Regenerate after changing backend routes or schemas:

```bash
git clone git@github.com:ZamzamApplication/zamzam-api.git ../zamzam-api
cd ../zamzam-api
python -m scripts.export_openapi ../zamzam-mobile/contracts/openapi.json
cd ../zamzam-mobile
npx -p typescript@5 -p openapi-typescript openapi-typescript \
  contracts/openapi.json -o contracts/src/api.ts
```
