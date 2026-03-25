.PHONY: help deploy-check deploy-sync deploy-remote redeploy validate-migration-baseline validate-layout-paths validate-compose validate-tenant-admin-api validate-tenant-admin-web validate-super-admin-api validate-super-admin-web validate-core-backend stress-check stress-tenant-read stress-webhook stress-kds stress-super-admin stress-combined

-include .deploy.env

DEPLOY_USER ?=
DEPLOY_HOST ?=
DEPLOY_PORT ?= 22
DEPLOY_PATH ?= /opt/clickgarcom
DEPLOY_COMPOSE_CMD ?= docker compose
DEPLOY_APP_SERVICES ?= go-migrate go-setup-rabbitmq go-api go-worker go-outbox node-admin web-admin super-admin-api super-admin

CORE_BACKEND_DIR ?= platform/core-backend
TENANT_ADMIN_API_DIR ?= apps/tenant-admin/api
TENANT_ADMIN_WEB_DIR ?= apps/tenant-admin/web
SUPER_ADMIN_API_DIR ?= apps/super-admin/api
SUPER_ADMIN_WEB_DIR ?= apps/super-admin/web
DOCS_DIR ?= docs
GO_TEST_CACHE_DIR ?= /tmp/clickgarcom-gocache
GO_TEST_TMP_DIR ?= /tmp/clickgarcom-gotmp
LOAD_TEST_DIR ?= tests/load
LOAD_TEST_ENV_FILE ?= $(LOAD_TEST_DIR)/.env
LOAD_TEST_RESULTS_DIR ?= $(LOAD_TEST_DIR)/results
K6_BIN ?= k6

help: ## Mostra este menu de ajuda
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ============ DOCKER ============
up: ## Sobe todos os containers
	docker-compose up -d

down: ## Para todos os containers
	docker-compose down

logs: ## Mostra logs dos containers
	docker-compose logs -f

logs-api: ## Logs apenas da API
	docker-compose logs -f go-api

logs-worker: ## Logs apenas do Worker
	docker-compose logs -f go-worker

logs-rabbitmq: ## Logs do RabbitMQ
	docker-compose logs -f rabbitmq

logs-super-admin: ## Logs do Super Admin
	docker-compose logs -f super-admin

logs-super-admin-api: ## Logs da API do Super Admin
	docker-compose logs -f super-admin-api

logs-pgadmin: ## Logs do pgAdmin
	docker-compose logs -f pgadmin

ps: ## Lista containers rodando
	docker-compose ps

rebuild: ## Rebuilda e sobe containers
	docker-compose up -d --build

restart: ## Reinicia containers
	docker-compose restart

ngrok-up: ## Sobe o tunnel ngrok (exporte NGROK_AUTHTOKEN antes)
	@if docker-compose --profile tunnel up -d ngrok; then \
		echo "ngrok em container iniciado."; \
	elif command -v ngrok >/dev/null 2>&1; then \
		set -a; \
		[ -f ./.env ] && . ./.env; \
		set +a; \
		if [ -z "$$NGROK_AUTHTOKEN" ] || [ "$$NGROK_AUTHTOKEN" = "coloque_seu_token_aqui" ]; then \
			echo "Defina NGROK_AUTHTOKEN no arquivo .env da raiz antes de subir o ngrok."; \
			exit 1; \
		fi; \
		if [ -f .pid-ngrok ] && kill -0 "$$(cat .pid-ngrok)" 2>/dev/null; then \
			echo "ngrok local ja esta rodando (PID $$(cat .pid-ngrok))."; \
		else \
			rm -f .pid-ngrok; \
			nohup ngrok http 8080 --authtoken "$$NGROK_AUTHTOKEN" --log stdout > .ngrok.log 2>&1 & echo $$! > .pid-ngrok; \
			sleep 3; \
			if [ -f .pid-ngrok ] && kill -0 "$$(cat .pid-ngrok)" 2>/dev/null; then \
				echo "ngrok local iniciado (PID $$(cat .pid-ngrok))."; \
			else \
				echo "Falha ao iniciar o ngrok local. Veja .ngrok.log"; \
				exit 1; \
			fi; \
		fi; \
	else \
		echo "Docker falhou ao baixar a imagem e o ngrok local nao esta instalado."; \
		exit 1; \
	fi

ngrok-down: ## Para o tunnel ngrok
	@docker-compose stop ngrok >/dev/null 2>&1 || true
	@if [ -f .pid-ngrok ]; then \
		kill "$$(cat .pid-ngrok)" >/dev/null 2>&1 || true; \
		rm -f .pid-ngrok; \
		echo "ngrok local parado."; \
	fi

ngrok-logs: ## Logs do ngrok
	@if docker ps --format '{{.Names}}' | rg -x 'clickgarcom-ngrok' >/dev/null 2>&1; then \
		docker-compose logs -f ngrok; \
	elif [ -f .ngrok.log ]; then \
		tail -f .ngrok.log; \
	else \
		echo "Nenhum log de ngrok encontrado."; \
	fi

ngrok-url: ## Mostra a URL publica do ngrok para o webhook
	@curl -fsS http://localhost:4040/api/tunnels | node -e "let data='';process.stdin.on('data',c=>data+=c);process.stdin.on('end',()=>{const parsed=JSON.parse(data);const tunnels=Array.isArray(parsed.tunnels)?parsed.tunnels:[];const tunnel=tunnels.find(t=>String(t.public_url||'').startsWith('https://'))||tunnels[0];if(!tunnel){process.exit(1)}console.log(String(tunnel.public_url).replace(/\\/+$$/,'') + '/webhooks/whatsapp');})"

# ============ DATABASE ============
migrate-up: ## Executa migrations
	cd $(CORE_BACKEND_DIR) && go run cmd/migrate/main.go -direction up

migrate-down: ## Reverte última migration
	cd $(CORE_BACKEND_DIR) && go run cmd/migrate/main.go -direction down

migrate-create: ## Cria nova migration (use: make migrate-create name=add_users)
	cd $(CORE_BACKEND_DIR) && migrate create -ext sql -dir cmd/migrate -seq $(name)

db-reset: ## Reseta database (CUIDADO!)
	docker-compose down -v
	docker-compose up -d postgres redis rabbitmq
	sleep 5
	$(MAKE) migrate-up

db-shell: ## Abre shell do Postgres
	docker exec -it clickgarcom-postgres psql -U postgres -d clickgarcom_db

redis-cli: ## Abre Redis CLI
	docker exec -it clickgarcom-redis redis-cli

# ============ RABBITMQ ============
rabbitmq-ui: ## Abre RabbitMQ Management UI
	@echo "Opening RabbitMQ Management at http://localhost:15672"
	@echo "User: clickgarcom | Pass: clickgarcom123"
	@open http://localhost:15672 2>/dev/null || xdg-open http://localhost:15672 2>/dev/null || echo "Please open http://localhost:15672 manually"

pgadmin-ui: ## Abre o pgAdmin local
	@echo "Opening pgAdmin at http://localhost:$${PGADMIN_PORT:-5050}"
	@echo "User: $${PGADMIN_DEFAULT_EMAIL:-admin@clickgarcom.dev} | Pass: $${PGADMIN_DEFAULT_PASSWORD:-admin123}"
	@open http://localhost:$${PGADMIN_PORT:-5050} 2>/dev/null || xdg-open http://localhost:$${PGADMIN_PORT:-5050} 2>/dev/null || echo "Please open http://localhost:$${PGADMIN_PORT:-5050} manually"

rabbitmq-queues: ## Lista filas do RabbitMQ
	docker exec clickgarcom-rabbitmq rabbitmqctl list_queues name messages consumers

rabbitmq-reset: ## Reseta filas do RabbitMQ (CUIDADO!)
	docker exec clickgarcom-rabbitmq rabbitmqctl purge_queue whatsapp.messages
	docker exec clickgarcom-rabbitmq rabbitmqctl purge_queue payment.webhooks
	docker exec clickgarcom-rabbitmq rabbitmqctl purge_queue notifications.send

# ============ GO COMMANDS ============
run-api: ## Roda API localmente
	cd $(CORE_BACKEND_DIR) && go run cmd/api/main.go

run-worker: ## Roda Worker localmente
	cd $(CORE_BACKEND_DIR) && go run cmd/worker/main.go

run-outbox: ## Roda Outbox Worker localmente
	cd $(CORE_BACKEND_DIR) && go run cmd/outbox-worker/main.go

run-realtime: ## Roda a API com o hub WebSocket integrado
	cd $(CORE_BACKEND_DIR) && go run cmd/api/main.go

test: ## Roda testes
	cd $(CORE_BACKEND_DIR) && GOCACHE=$(GO_TEST_CACHE_DIR) GOTMPDIR=$(GO_TEST_TMP_DIR) go test -v ./...

test-coverage: ## Testes com coverage
	cd $(CORE_BACKEND_DIR) && GOCACHE=$(GO_TEST_CACHE_DIR) GOTMPDIR=$(GO_TEST_TMP_DIR) go test -coverprofile=coverage.out ./... && go tool cover -html=coverage.out

lint: ## Roda linter
	cd $(CORE_BACKEND_DIR) && golangci-lint run

fmt: ## Formata código
	cd $(CORE_BACKEND_DIR) && go fmt ./...

tidy: ## Limpa dependências
	cd $(CORE_BACKEND_DIR) && go mod tidy

# ============ DEVELOPMENT ============
dev: ## Modo desenvolvimento com hot-reload (precisa air instalado)
	cd $(CORE_BACKEND_DIR) && air

install-tools: ## Instala ferramentas de desenvolvimento
	go install github.com/cosmtrek/air@latest
	go install github.com/golang-migrate/migrate/v4/cmd/migrate@latest
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest

clean-all: ## Limpa TUDO (banco + filas)
	@echo "🧹 Limpando banco de dados..."
	docker exec -it clickgarcom-postgres psql -U postgres -d clickgarcom_db -c "DELETE FROM inbox_events; DELETE FROM outbox_messages;"
	@echo "🧹 Limpando filas RabbitMQ..."
	docker exec clickgarcom-rabbitmq rabbitmqctl purge_queue whatsapp.messages
	docker exec clickgarcom-rabbitmq rabbitmqctl purge_queue payment.webhooks
	docker exec clickgarcom-rabbitmq rabbitmqctl purge_queue notifications.send
	docker exec clickgarcom-rabbitmq rabbitmqctl purge_queue orders.dlq
	@echo "✅ Tudo limpo!"

# ============ ADMIN PANEL ============
run-admin: ## Roda Admin Panel localmente
	cd $(TENANT_ADMIN_API_DIR) && npm run start:dev

install-admin: ## Instala dependências do Admin Panel
	cd $(TENANT_ADMIN_API_DIR) && npm install

build-admin: ## Builda Admin Panel
	cd $(TENANT_ADMIN_API_DIR) && npm run build

run-super-admin: ## Roda frontend do Super Admin localmente
	cd $(SUPER_ADMIN_WEB_DIR) && PORT=3003 node server.js

run-super-admin-api: ## Roda API do Super Admin localmente
	cd $(SUPER_ADMIN_API_DIR) && npm run start:dev

# ============ PRODUCTION ============
build-api: ## Builda API para produção
	cd $(CORE_BACKEND_DIR) && CGO_ENABLED=0 GOOS=linux go build -o bin/api cmd/api/main.go

build-worker: ## Builda Worker para produção
	cd $(CORE_BACKEND_DIR) && CGO_ENABLED=0 GOOS=linux go build -o bin/worker cmd/worker/main.go

deploy-check: ## Valida configuracao minima para redeploy remoto
	@test -n "$(DEPLOY_USER)" || (echo "Defina DEPLOY_USER em .deploy.env ou na linha de comando."; exit 1)
	@test -n "$(DEPLOY_HOST)" || (echo "Defina DEPLOY_HOST em .deploy.env ou na linha de comando."; exit 1)
	@command -v ssh >/dev/null 2>&1 || (echo "ssh nao encontrado."; exit 1)
	@command -v rsync >/dev/null 2>&1 || (echo "rsync nao encontrado."; exit 1)

deploy-sync: deploy-check ## Sincroniza codigo com o servidor sem sobrescrever .env do servidor
	@ssh -p $(DEPLOY_PORT) $(DEPLOY_USER)@$(DEPLOY_HOST) 'mkdir -p "$(DEPLOY_PATH)"'
	@rsync -az --delete \
		--exclude '.git/' \
		--exclude 'node_modules/' \
		--exclude 'dist/' \
		--exclude '.env' \
		--exclude '.deploy.env' \
		--exclude '.pid-*' \
		--exclude '.ngrok.log' \
		--exclude '$(CORE_BACKEND_DIR)/.env' \
		--exclude '$(TENANT_ADMIN_API_DIR)/.env' \
		./ $(DEPLOY_USER)@$(DEPLOY_HOST):$(DEPLOY_PATH)/

deploy-remote: deploy-check ## Rebuilda e reinicia servicos de aplicacao no servidor
	@ssh -p $(DEPLOY_PORT) $(DEPLOY_USER)@$(DEPLOY_HOST) 'set -e; cd "$(DEPLOY_PATH)"; $(DEPLOY_COMPOSE_CMD) up -d --build --force-recreate $(DEPLOY_APP_SERVICES); $(DEPLOY_COMPOSE_CMD) ps'

redeploy: deploy-sync deploy-remote ## Sincroniza codigo e faz redeploy completo da aplicacao no servidor

clean: ## Limpa arquivos buildados
	rm -rf $(CORE_BACKEND_DIR)/bin/

validate-migration-baseline: validate-layout-paths validate-compose validate-tenant-admin-api validate-tenant-admin-web validate-super-admin-api validate-super-admin-web validate-core-backend ## Valida baseline antes e depois de mover diretorios

validate-layout-paths: ## Valida os diretorios atuais do layout alvo
	@test -d "$(CORE_BACKEND_DIR)" || (echo "Diretorio ausente: $(CORE_BACKEND_DIR)"; exit 1)
	@test -d "$(TENANT_ADMIN_API_DIR)" || (echo "Diretorio ausente: $(TENANT_ADMIN_API_DIR)"; exit 1)
	@test -d "$(TENANT_ADMIN_WEB_DIR)" || (echo "Diretorio ausente: $(TENANT_ADMIN_WEB_DIR)"; exit 1)
	@test -d "$(SUPER_ADMIN_API_DIR)" || (echo "Diretorio ausente: $(SUPER_ADMIN_API_DIR)"; exit 1)
	@test -d "$(SUPER_ADMIN_WEB_DIR)" || (echo "Diretorio ausente: $(SUPER_ADMIN_WEB_DIR)"; exit 1)

validate-compose: ## Valida resolucao do docker compose para a migracao
	docker compose config >/tmp/clickgarcom-compose-config.out
	tail -n 20 /tmp/clickgarcom-compose-config.out

# ============ STRESS TEST ============
stress-check: ## Valida pre-requisitos para rodar os testes de estresse
	@command -v $(K6_BIN) >/dev/null 2>&1 || (echo "k6 nao encontrado. Instale em https://grafana.com/docs/k6/latest/set-up/install-k6/"; exit 1)
	@test -f "$(LOAD_TEST_ENV_FILE)" || (echo "Arquivo $(LOAD_TEST_ENV_FILE) ausente. Copie tests/load/.env.example."; exit 1)
	@mkdir -p "$(LOAD_TEST_RESULTS_DIR)"

stress-tenant-read: stress-check ## Estressa leituras do tenant-admin
	@set -a; . "$(LOAD_TEST_ENV_FILE)"; set +a; \
	$(K6_BIN) run --summary-export "$(LOAD_TEST_RESULTS_DIR)/tenant-admin-read-summary.json" "$(LOAD_TEST_DIR)/k6/tenant-admin-read.js"

stress-webhook: stress-check ## Estressa entrada do webhook WhatsApp
	@set -a; . "$(LOAD_TEST_ENV_FILE)"; set +a; \
	$(K6_BIN) run --summary-export "$(LOAD_TEST_RESULTS_DIR)/webhook-ingest-summary.json" "$(LOAD_TEST_DIR)/k6/webhook-ingest.js"

stress-kds: stress-check ## Estressa conexoes WebSocket do KDS
	@set -a; . "$(LOAD_TEST_ENV_FILE)"; set +a; \
	$(K6_BIN) run --summary-export "$(LOAD_TEST_RESULTS_DIR)/kds-websocket-summary.json" "$(LOAD_TEST_DIR)/k6/kds-websocket.js"

stress-super-admin: stress-check ## Estressa leituras do super-admin
	@set -a; . "$(LOAD_TEST_ENV_FILE)"; set +a; \
	$(K6_BIN) run --summary-export "$(LOAD_TEST_RESULTS_DIR)/super-admin-read-summary.json" "$(LOAD_TEST_DIR)/k6/super-admin-read.js"

stress-combined: stress-check ## Estressa a aplicacao com trafego combinado
	@set -a; . "$(LOAD_TEST_ENV_FILE)"; set +a; \
	$(K6_BIN) run --summary-export "$(LOAD_TEST_RESULTS_DIR)/platform-combined-summary.json" "$(LOAD_TEST_DIR)/k6/platform-combined.js"

validate-tenant-admin-api: ## Build do tenant admin API
	cd $(TENANT_ADMIN_API_DIR) && npm run build

validate-tenant-admin-web: ## Verifica o entrypoint do tenant admin web
	cd $(TENANT_ADMIN_WEB_DIR) && node --check server.js

validate-super-admin-api: ## Build da API do super admin
	cd $(SUPER_ADMIN_API_DIR) && npm run build

validate-super-admin-web: ## Verifica o entrypoint do frontend do super admin
	@test -f "$(SUPER_ADMIN_WEB_DIR)/server.js" || (echo "Arquivo ausente: $(SUPER_ADMIN_WEB_DIR)/server.js"; exit 1)
	@test -f "$(SUPER_ADMIN_WEB_DIR)/public/index.html" || (echo "Arquivo ausente: $(SUPER_ADMIN_WEB_DIR)/public/index.html"; exit 1)

validate-core-backend: ## Testa o core backend
	@mkdir -p "$(GO_TEST_CACHE_DIR)" "$(GO_TEST_TMP_DIR)"
	cd $(CORE_BACKEND_DIR) && GOCACHE=$(GO_TEST_CACHE_DIR) GOTMPDIR=$(GO_TEST_TMP_DIR) go test ./...

# ============ MONITORING ============
grafana: ## Abre Grafana
	@echo "Opening Grafana at http://localhost:3001"
	@echo "User: admin | Pass: admin123"
	@open http://localhost:3001 2>/dev/null || xdg-open http://localhost:3001 2>/dev/null || echo "Please open http://localhost:3001 manually"

prometheus: ## Abre Prometheus
	@echo "Opening Prometheus at http://localhost:9090"
	@open http://localhost:9090 2>/dev/null || xdg-open http://localhost:9090 2>/dev/null || echo "Please open http://localhost:9090 manually"
