import fs from 'node:fs';

const collectionPath = new URL('../docs/Zamzam-Mobile.postman_collection.json', import.meta.url);
const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));

collection.info.name = 'Zamzam Mobile API';
collection.info.description = [
  'Generated from the Zamzam FastAPI OpenAPI contract.',
  '',
  'Start with auth / Login. Its test script stores the access and refresh tokens.',
  'Select a tenant by setting tahfizId after calling auth / Get Me.',
  'See docs/API.md for the mobile integration and offline-sync guidance.',
].join('\n');

collection.variable = [
  {key: 'baseUrl', value: 'https://zamzam-api.fly.dev', type: 'string'},
  {key: 'bearerToken', value: '', type: 'string'},
  {key: 'refreshToken', value: '', type: 'string'},
  {key: 'deviceId', value: 'postman-device-0001', type: 'string'},
  {key: 'deviceName', value: 'Postman', type: 'string'},
  {key: 'tahfizId', value: '', type: 'string'},
  {key: 'username', value: '', type: 'string'},
  {key: 'password', value: '', type: 'string'},
];

const tokenCaptureScript = {
  listen: 'test',
  script: {
    type: 'text/javascript',
    exec: [
      'if (pm.response.code >= 200 && pm.response.code < 300) {',
      '  const body = pm.response.json();',
      "  if (body.access_token) pm.collectionVariables.set('bearerToken', body.access_token);",
      "  if (body.refresh_token) pm.collectionVariables.set('refreshToken', body.refresh_token);",
      '}',
    ],
  },
};

function pathOf(request) {
  return `/${(request?.url?.path ?? []).join('/')}`;
}

function setJsonBody(item, value) {
  item.request.body = {
    mode: 'raw',
    raw: JSON.stringify(value, null, 2),
    options: {raw: {headerFamily: 'json', language: 'json'}},
  };
}

function configure(items) {
  for (const item of items ?? []) {
    if (item.request) {
      const path = pathOf(item.request);
      for (const header of item.request.header ?? []) {
        if (header.key.toLowerCase() === 'x-tahfiz-id') {
          header.value = '{{tahfizId}}';
          header.disabled = false;
        }
        if (header.key.toLowerCase() === 'idempotency-key') {
          header.value = '{{$guid}}';
        }
      }

      if (path === '/auth/login') {
        setJsonBody(item, {
          username: '{{username}}',
          password: '{{password}}',
          device_id: '{{deviceId}}',
          device_name: '{{deviceName}}',
        });
        item.event = [tokenCaptureScript];
      } else if (path === '/auth/refresh') {
        setJsonBody(item, {
          refresh_token: '{{refreshToken}}',
          device_id: '{{deviceId}}',
        });
        item.event = [tokenCaptureScript];
      } else if (path === '/auth/revoke-device') {
        setJsonBody(item, {refresh_token: '{{refreshToken}}'});
      }
    }
    configure(item.item);
  }
}

configure(collection.item);
fs.writeFileSync(collectionPath, `${JSON.stringify(collection, null, 2)}\n`);
