.PHONY: help

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
	cd services/go-core && go run cmd/migrate/main.go up

migrate-down: ## Reverte última migration
	cd services/go-core && go run cmd/migrate/main.go down

migrate-create: ## Cria nova migration (use: make migrate-create name=add_users)
	cd services/go-core && migrate create -ext sql -dir migrations -seq $(name)

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

rabbitmq-queues: ## Lista filas do RabbitMQ
	docker exec clickgarcom-rabbitmq rabbitmqctl list_queues name messages consumers

rabbitmq-reset: ## Reseta filas do RabbitMQ (CUIDADO!)
	docker exec clickgarcom-rabbitmq rabbitmqctl purge_queue whatsapp.messages
	docker exec clickgarcom-rabbitmq rabbitmqctl purge_queue payment.webhooks
	docker exec clickgarcom-rabbitmq rabbitmqctl purge_queue notifications.send

# ============ GO COMMANDS ============
run-api: ## Roda API localmente
	cd services/go-core && go run cmd/api/main.go

run-worker: ## Roda Worker localmente
	cd services/go-core && go run cmd/worker/main.go

run-outbox: ## Roda Outbox Worker localmente
	cd services/go-core && go run cmd/outbox-worker/main.go

run-realtime: ## Roda servidor WebSocket
	cd services/go-core && go run cmd/realtime/main.go

test: ## Roda testes
	cd services/go-core && go test -v ./...

test-coverage: ## Testes com coverage
	cd services/go-core && go test -coverprofile=coverage.out ./... && go tool cover -html=coverage.out

lint: ## Roda linter
	cd services/go-core && golangci-lint run

fmt: ## Formata código
	cd services/go-core && go fmt ./...

tidy: ## Limpa dependências
	cd services/go-core && go mod tidy

# ============ DEVELOPMENT ============
dev: ## Modo desenvolvimento com hot-reload (precisa air instalado)
	cd services/go-core && air

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
	cd services/node-admin && npm run start:dev

install-admin: ## Instala dependências do Admin Panel
	cd services/node-admin && npm install

build-admin: ## Builda Admin Panel
	cd services/node-admin && npm run build

# ============ PRODUCTION ============
build-api: ## Builda API para produção
	cd services/go-core && CGO_ENABLED=0 GOOS=linux go build -o bin/api cmd/api/main.go

build-worker: ## Builda Worker para produção
	cd services/go-core && CGO_ENABLED=0 GOOS=linux go build -o bin/worker cmd/worker/main.go

clean: ## Limpa arquivos buildados
	rm -rf services/go-core/bin/

# ============ MONITORING ============
grafana: ## Abre Grafana
	@echo "Opening Grafana at http://localhost:3001"
	@echo "User: admin | Pass: admin123"
	@open http://localhost:3001 2>/dev/null || xdg-open http://localhost:3001 2>/dev/null || echo "Please open http://localhost:3001 manually"

prometheus: ## Abre Prometheus
	@echo "Opening Prometheus at http://localhost:9090"
	@open http://localhost:9090 2>/dev/null || xdg-open http://localhost:9090 2>/dev/null || echo "Please open http://localhost:9090 manually"
