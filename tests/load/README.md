# Stress Tests

Arquivos de carga baseados em `k6` para validar a cadeia principal da aplicacao:

- `k6/tenant-admin-read.js`: leituras pesadas no `tenant-admin/api`
- `k6/webhook-ingest.js`: burst de entrada no webhook WhatsApp
- `k6/kds-websocket.js`: conexoes WebSocket no KDS
- `k6/super-admin-read.js`: leituras pesadas no `super-admin/api`
- `k6/platform-combined.js`: mistura das trilhas acima no mesmo teste

## Preparacao

1. Copie:

```bash
cp tests/load/.env.example tests/load/.env
```

2. Preencha:

- `TENANT_EMAIL`
- `TENANT_PASSWORD`
- `TENANT_ID`
- `SUPER_ADMIN_PASSWORD`

3. Garanta que os servicos estejam no ar:

```bash
make rebuild
```

## Execucao rapida

Use os alvos do `Makefile`:

```bash
make stress-tenant-read
make stress-webhook
make stress-kds
make stress-super-admin
make stress-combined
```

Os resumos JSON sao gravados em `tests/load/results/`.

