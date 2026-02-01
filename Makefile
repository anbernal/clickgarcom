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