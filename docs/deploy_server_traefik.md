# Deploy no servidor (Traefik, sem ngrok)

Este guia cria um ambiente do `clickgarcom` em servidor com Traefik/EasyPanel, usando URL pública fixa para webhook.

## 1) Pré-requisitos

- DNS apontando para o servidor:
  - `TRAEFIK_PUBLIC_HOST`
- Rede Docker externa já existente: `easypanel`
- Arquivos de ambiente:
  - `platform/core-backend/.env`
  - `apps/tenant-admin/api/.env`
  - `deploy/.env.server`

## 2) Preparar variáveis de produção

```bash
cd /opt/clickgarcom
cp deploy/.env.server.example deploy/.env.server
nano deploy/.env.server
```

Obrigatório:
- `PUBLIC_WEBHOOK_BASE_URL=https://<TRAEFIK_PUBLIC_HOST>/clickgarcom-whatsapp`
- senhas de `POSTGRES_PASSWORD`, `RABBITMQ_PASSWORD`
- segredos de `SUPER_ADMIN_*`

## 3) Subir stack sem ngrok

```bash
cd /opt/clickgarcom

docker compose \
  --env-file deploy/.env.server \
  -f deploy/docker-compose.server.yml \
  up -d --build
```

## 4) Validar saúde dos serviços

```bash
docker compose \
  --env-file deploy/.env.server \
  -f deploy/docker-compose.server.yml \
  ps
```

Valide externamente:
- `https://<TRAEFIK_PUBLIC_HOST>/clickgarcom-whatsapp/health`
- `https://<TRAEFIK_PUBLIC_HOST>/clickgarcom/admin/api/health`
- `https://<TRAEFIK_PUBLIC_HOST>/super-admin/health`
- `https://<TRAEFIK_PUBLIC_HOST>/super-admin/admin/api/health`

## 5) Trocar webhook da Meta para URL fixa

Use:
- `https://<TRAEFIK_PUBLIC_HOST>/clickgarcom-whatsapp/webhooks/whatsapp`

A partir daqui não precisa `ngrok`.

## 6) Rollback por tag

Exemplo para voltar ao `2.0.0`:

```bash
cd /opt/clickgarcom
git fetch --tags
git checkout tags/2.0.0 -b rollback-2.0.0

docker compose \
  --env-file deploy/.env.server \
  -f deploy/docker-compose.server.yml \
  up -d --build
```
