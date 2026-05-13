# Runbook: Migracao Local -> Producao (Servidor Novo)

Este runbook evita perder migration e drift de schema ao mover o sistema para outro servidor.

## 1) Preparacao

1. Suba o banco local do projeto.
2. Garanta que todas as migrations novas estao commitadas no repositorio.
3. Confirme no local:
   - `schema_migrations` na ultima versao esperada.
   - fluxo critico funcionando (login, webhook, fila, resposta WhatsApp).

Comandos uteis:

```bash
docker compose up -d postgres redis rabbitmq
docker compose run --rm --no-deps go-migrate
docker exec -i clickgarcom-postgres psql -U postgres -d clickgarcom_db -c "SELECT version, dirty FROM schema_migrations;"
```

## 2) Backup no servidor de destino (obrigatorio)

Antes de qualquer migrate:

```bash
docker exec -i deploy-postgres-1 pg_dump -U postgres -d clickgarcom_db > /root/backup_clickgarcom_$(date +%F_%H%M).sql
```

## 3) Sincronizar migrations no servidor

No servidor, confirme que os arquivos mais novos estao em:

`/opt/clickgarcom/platform/core-backend/cmd/migrate`

Se faltar arquivo, copie do repositório local (scp/rsync/git pull).

## 4) Aplicar migrations no servidor (jeito canonico)

Use `go-migrate` com bind mount do diretório de migrations:

```bash
cd /opt/clickgarcom
docker compose --env-file deploy/.env.server -f deploy/docker-compose.server.yml run --rm \
  -v /opt/clickgarcom/platform/core-backend/cmd/migrate:/app/cmd/migrate \
  go-migrate
```

## 5) Validacao imediata pos-migrate

```bash
docker exec -i deploy-postgres-1 psql -U postgres -d clickgarcom_db -c "SELECT version, dirty FROM schema_migrations;"
docker exec -i deploy-rabbitmq-1 rabbitmqctl list_queues name consumers messages_ready messages_unacknowledged
docker compose --env-file deploy/.env.server -f deploy/docker-compose.server.yml ps
```

Criticos:

1. `dirty` precisa ser `false`.
2. `whatsapp.messages` precisa ter consumidor (`consumers >= 1`).
3. APIs e workers precisam estar `healthy`.

## 6) Smoke tests funcionais obrigatorios

1. Login no super-admin.
2. Listagem/criacao de tenant.
3. Envio de mensagem WhatsApp real:
   - mensagem entra no webhook
   - vai para `whatsapp.messages`
   - worker consome
   - resposta sai para cliente
4. Fluxo `Solicitar mesa` (table request sem quebrar).

## 7) Checklist de drift de schema (quando suspeitar de quebra)

Comparar local vs servidor para:

1. Colunas (`information_schema.columns`)
2. Constraints (`pg_constraint`)
3. Indices (`pg_indexes`)

Se houver drift:

1. Criar migration de reconciliacao nova (nao editar antiga).
2. Rodar local.
3. Rodar no servidor com backup previo.

## 8) Rollback

Se falhar em producao:

1. Pausar alteracoes funcionais.
2. Restaurar backup do Postgres.
3. Voltar tag/commit da aplicacao.
4. Revalidar `schema_migrations` + smoke tests.

## 9) Regra de ouro

Nunca aplicar SQL manual em producao sem transformar em migration no repositorio na sequencia.
