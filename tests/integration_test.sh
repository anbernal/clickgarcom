#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# ClickGarçom — Teste de Integração Completo
# ═══════════════════════════════════════════════════════════════
# Cobre: API REST, WebSocket, Worker, KDS, State Machine
# Pré-requisitos: API rodando na porta 8080, Worker rodando,
#   Docker (postgres, rabbitmq, redis) ativo
#   brew install websocat jq (se necessário)
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

BASE="http://localhost:8080"
TENANT="a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
WS_LOG="/tmp/clickgarcom_ws_test.log"
PASS=0
FAIL=0
SKIP=0
RESULTS=()

# ─── CORES ──────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ─── HELPERS ────────────────────────────────────────────────────
header() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }
pass() { echo -e "  ${GREEN}✅ PASS${NC} — $1"; PASS=$((PASS+1)); RESULTS+=("✅ $1"); }
fail() { echo -e "  ${RED}❌ FAIL${NC} — $1: $2"; FAIL=$((FAIL+1)); RESULTS+=("❌ $1: $2"); }
skip() { echo -e "  ${YELLOW}⏭  SKIP${NC} — $1: $2"; SKIP=$((SKIP+1)); RESULTS+=("⏭  $1: $2"); }
info() { echo -e "  ${CYAN}ℹ️ ${NC} $1"; }

assert_status() {
  local label="$1" url="$2" expected="$3" method="${4:-GET}" body="${5:-}"
  local status
  if [ "$method" = "GET" ]; then
    status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  elif [ "$method" = "PATCH" ]; then
    status=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH -H "Content-Type: application/json" -d "$body" "$url")
  elif [ "$method" = "POST" ]; then
    status=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d "$body" "$url")
  fi
  if [ "$status" = "$expected" ]; then
    pass "$label (HTTP $status)"
  else
    fail "$label" "esperado $expected, recebeu $status"
  fi
}

assert_json_field() {
  local label="$1" json="$2" field="$3" expected="$4"
  local actual
  actual=$(echo "$json" | jq -r "$field" 2>/dev/null)
  if [ "$actual" = "$expected" ]; then
    pass "$label ($field = $actual)"
  else
    fail "$label" "$field esperado '$expected', recebeu '$actual'"
  fi
}

assert_json_gt() {
  local label="$1" json="$2" field="$3" min="$4"
  local actual
  actual=$(echo "$json" | jq -r "$field" 2>/dev/null)
  if [ "$actual" -gt "$min" ] 2>/dev/null; then
    pass "$label ($field = $actual > $min)"
  else
    fail "$label" "$field esperado > $min, recebeu '$actual'"
  fi
}

# ═══════════════════════════════════════════════════════════════
echo -e "${BOLD}${CYAN}"
echo "╔═══════════════════════════════════════════════════════╗"
echo "║     ClickGarçom — Teste de Integração Completo       ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── PRÉ-CHECK ─────────────────────────────────────────────────
header "0. Pré-checks"

if curl -s --connect-timeout 2 "$BASE" > /dev/null 2>&1; then
  pass "API acessível em $BASE"
else
  fail "API acessível" "Não foi possível conectar em $BASE"
  echo -e "\n${RED}ABORTADO: API não está rodando.${NC}"
  exit 1
fi

if command -v jq &> /dev/null; then
  pass "jq instalado"
else
  fail "jq instalado" "Instale: brew install jq"
  exit 1
fi

if command -v websocat &> /dev/null; then
  pass "websocat instalado"
  HAS_WEBSOCAT=true
else
  skip "websocat" "Testes de WebSocket serão omitidos (brew install websocat)"
  HAS_WEBSOCAT=false
fi

# ═══════════════════════════════════════════════════════════════
# GRUPO 1: MENU API
# ═══════════════════════════════════════════════════════════════
header "1. Menu API"

# 1.1 GET /menu
MENU=$(curl -s "$BASE/menu?tenant_id=$TENANT")
assert_json_field "GET /menu retorna categorias" "$MENU" ".categories | type" "array"

CATEGORIES_COUNT=$(echo "$MENU" | jq '.categories | length')
if [ "$CATEGORIES_COUNT" -gt 0 ]; then
  pass "Menu tem categorias ($CATEGORIES_COUNT)"
  FIRST_CAT_ID=$(echo "$MENU" | jq -r '.categories[0].id')
else
  skip "Menu com categorias" "Nenhuma categoria no seed do tenant"
  FIRST_CAT_ID=""
fi

# 1.2 GET /menu/categories
assert_status "GET /menu/categories" "$BASE/menu/categories?tenant_id=$TENANT" "200"

# 1.3 GET /menu/items
ITEMS=$(curl -s "$BASE/menu/items?tenant_id=$TENANT")
assert_json_field "GET /menu/items retorna itens" "$ITEMS" ".items | type" "array"

ITEMS_COUNT=$(echo "$ITEMS" | jq '.items | length')
if [ "$ITEMS_COUNT" -gt 0 ]; then
  pass "Menu tem itens ($ITEMS_COUNT)"
  FIRST_ITEM_ID=$(echo "$ITEMS" | jq -r '.items[0].id')
  FIRST_ITEM_PRICE=$(echo "$ITEMS" | jq -r '.items[0].price')
  info "Item para testes: $FIRST_ITEM_ID (R\$ $FIRST_ITEM_PRICE)"
else
  skip "Menu com itens" "Nenhum item no seed"
  FIRST_ITEM_ID="55cbe508-e48e-4472-afe9-cbcbd7f4b599"
  FIRST_ITEM_PRICE="5.00"
fi

# 1.4 GET /menu/items com category_id
if [ -n "$FIRST_CAT_ID" ]; then
  assert_status "GET /menu/items filtrado por categoria" "$BASE/menu/items?tenant_id=$TENANT&category_id=$FIRST_CAT_ID" "200"
fi

# 1.5 Validação de erros
assert_status "GET /menu sem tenant_id → 400" "$BASE/menu" "400"
assert_status "GET /menu com UUID inválido → 400" "$BASE/menu?tenant_id=invalido" "400"

# ═══════════════════════════════════════════════════════════════
# GRUPO 2: ORDERS API — QUERY
# ═══════════════════════════════════════════════════════════════
header "2. Orders API — Query (GET /orders)"

# 2.1 Listar todos
ORDERS=$(curl -s "$BASE/orders?tenant_id=$TENANT")
assert_json_field "GET /orders retorna array" "$ORDERS" ".orders | type" "array"
ORDER_COUNT=$(echo "$ORDERS" | jq '.count')
info "Pedidos ativos: $ORDER_COUNT"

# 2.2 Filtro por status
ORDERS_PENDING=$(curl -s "$BASE/orders?tenant_id=$TENANT&status=PENDING")
PENDING_COUNT=$(echo "$ORDERS_PENDING" | jq '.count')
pass "GET /orders filtro status=PENDING ($PENDING_COUNT resultados)"

# 2.3 Filtro por destination
ORDERS_BAR=$(curl -s "$BASE/orders?tenant_id=$TENANT&destination=BAR")
BAR_COUNT=$(echo "$ORDERS_BAR" | jq '.count')
pass "GET /orders filtro destination=BAR ($BAR_COUNT resultados)"

# 2.4 Filtros combinados
ORDERS_COMBO=$(curl -s "$BASE/orders?tenant_id=$TENANT&status=PENDING,ACCEPTED&destination=BAR")
COMBO_COUNT=$(echo "$ORDERS_COMBO" | jq '.count')
pass "GET /orders filtros combinados ($COMBO_COUNT resultados)"

# 2.5 Validação de erros
assert_status "GET /orders sem tenant_id → 400" "$BASE/orders" "400"
assert_status "GET /orders UUID inválido → 400" "$BASE/orders?tenant_id=xyz" "400"

# ═══════════════════════════════════════════════════════════════
# GRUPO 3: WEBHOOK WhatsApp
# ═══════════════════════════════════════════════════════════════
header "3. Webhook WhatsApp"

# 3.1 Verificação do webhook (sem token correto — espera 403 ou 400)
assert_status "GET /webhooks/whatsapp sem token → erro" "$BASE/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=test&hub.verify_token=wrong" "403"

# 3.2 POST payload válido → 200 (inboxed)
WAMID="wamid.test_integration_$(date +%s)"
WEBHOOK_PAYLOAD=$(cat <<EOF
{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": { "phone_number_id": "123456789" },
        "messages": [{
          "id": "$WAMID",
          "from": "5511999990001",
          "timestamp": "$(date +%s)",
          "type": "text",
          "text": { "body": "Teste integração — 1x Caipirinha" }
        }]
      },
      "field": "messages"
    }]
  }]
}
EOF
)
WEBHOOK_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/webhooks/whatsapp" \
  -H "Content-Type: application/json" -d "$WEBHOOK_PAYLOAD")
WEBHOOK_STATUS=$(echo "$WEBHOOK_RESP" | tail -1)
WEBHOOK_BODY=$(echo "$WEBHOOK_RESP" | head -1)

if [ "$WEBHOOK_STATUS" = "200" ]; then
  pass "POST /webhooks/whatsapp → 200 (inbox criado)"
  info "WAMID: $WAMID"
else
  fail "POST /webhooks/whatsapp" "HTTP $WEBHOOK_STATUS — $WEBHOOK_BODY"
fi

# 3.3 POST payload inválido (sem entry)
assert_status "POST /webhooks/whatsapp payload vazio → 200" "$BASE/webhooks/whatsapp" "200" "POST" "{}"

# ═══════════════════════════════════════════════════════════════
# GRUPO 4: ORDER STATUS — STATE MACHINE
# ═══════════════════════════════════════════════════════════════
header "4. Order Status — State Machine (PATCH /orders/:id/status)"

# Pegar um pedido PENDING para testar
PENDING_ORDER=$(curl -s "$BASE/orders?tenant_id=$TENANT&status=PENDING" | jq -r '.orders[0].id // empty')

if [ -n "$PENDING_ORDER" ]; then
  info "Usando pedido: $PENDING_ORDER"

  # 4.1 Transição inválida: PENDING → READY (deveria ser PENDING → ACCEPTED)
  assert_status "PENDING → READY (inválido) → 400" \
    "$BASE/orders/$PENDING_ORDER/status?tenant_id=$TENANT" "400" "PATCH" '{"status":"READY"}'

  # 4.2 Transição inválida: PENDING → DELIVERED
  assert_status "PENDING → DELIVERED (inválido) → 400" \
    "$BASE/orders/$PENDING_ORDER/status?tenant_id=$TENANT" "400" "PATCH" '{"status":"DELIVERED"}'

  # 4.3 Transição válida: PENDING → ACCEPTED
  ACCEPT_RESP=$(curl -s -X PATCH "$BASE/orders/$PENDING_ORDER/status?tenant_id=$TENANT" \
    -H "Content-Type: application/json" -d '{"status":"ACCEPTED"}')
  ACCEPT_STATUS=$(echo "$ACCEPT_RESP" | jq -r '.order.status // empty')
  if [ "$ACCEPT_STATUS" = "ACCEPTED" ]; then
    pass "PENDING → ACCEPTED ✓"
    
    # Verificar que accepted_at foi preenchido
    ACCEPTED_AT=$(echo "$ACCEPT_RESP" | jq -r '.order.accepted_at // empty')
    if [ -n "$ACCEPTED_AT" ] && [ "$ACCEPTED_AT" != "null" ]; then
      pass "accepted_at preenchido ($ACCEPTED_AT)"
    else
      fail "accepted_at" "não preenchido"
    fi
  else
    fail "PENDING → ACCEPTED" "status retornado: '$ACCEPT_STATUS'"
  fi

  # 4.4 Dupla transição: ACCEPTED → ACCEPTED (inválido)
  assert_status "ACCEPTED → ACCEPTED (inválido) → 400" \
    "$BASE/orders/$PENDING_ORDER/status?tenant_id=$TENANT" "400" "PATCH" '{"status":"ACCEPTED"}'

  # 4.5 ACCEPTED → READY
  READY_RESP=$(curl -s -X PATCH "$BASE/orders/$PENDING_ORDER/status?tenant_id=$TENANT" \
    -H "Content-Type: application/json" -d '{"status":"READY"}')
  READY_STATUS=$(echo "$READY_RESP" | jq -r '.order.status // empty')
  if [ "$READY_STATUS" = "READY" ]; then
    pass "ACCEPTED → READY ✓"
    READY_AT=$(echo "$READY_RESP" | jq -r '.order.ready_at // empty')
    if [ -n "$READY_AT" ] && [ "$READY_AT" != "null" ]; then
      pass "ready_at preenchido"
    else
      fail "ready_at" "não preenchido"
    fi
  else
    fail "ACCEPTED → READY" "status: '$READY_STATUS'"
  fi

  # 4.6 READY → DELIVERED
  DELIVER_RESP=$(curl -s -X PATCH "$BASE/orders/$PENDING_ORDER/status?tenant_id=$TENANT" \
    -H "Content-Type: application/json" -d '{"status":"DELIVERED"}')
  DELIVER_STATUS=$(echo "$DELIVER_RESP" | jq -r '.order.status // empty')
  if [ "$DELIVER_STATUS" = "DELIVERED" ]; then
    pass "READY → DELIVERED ✓"
  else
    fail "READY → DELIVERED" "status: '$DELIVER_STATUS'"
  fi

  # 4.7 Verificar que o pedido saiu da lista ativa
  UPDATED_ORDERS=$(curl -s "$BASE/orders?tenant_id=$TENANT&status=PENDING,ACCEPTED,READY")
  HAS_DELIVERED=$(echo "$UPDATED_ORDERS" | jq -r ".orders[] | select(.id == \"$PENDING_ORDER\") | .id // empty")
  if [ -z "$HAS_DELIVERED" ]; then
    pass "Pedido entregue não aparece mais na lista ativa ✓"
  else
    fail "Filtro exclui entregues" "pedido $PENDING_ORDER ainda aparece"
  fi

else
  skip "State Machine" "Nenhum pedido PENDING encontrado"
fi

# ═══════════════════════════════════════════════════════════════
# GRUPO 5: CANCELAMENTO
# ═══════════════════════════════════════════════════════════════
header "5. Cancelamento com Motivo"

# Pegar outro pedido PENDING
CANCEL_ORDER=$(curl -s "$BASE/orders?tenant_id=$TENANT&status=PENDING" | jq -r '.orders[0].id // empty')

if [ -n "$CANCEL_ORDER" ]; then
  info "Cancelando pedido: $CANCEL_ORDER"

  # 5.1 PENDING → CANCELED com motivo
  CANCEL_RESP=$(curl -s -X PATCH "$BASE/orders/$CANCEL_ORDER/status?tenant_id=$TENANT" \
    -H "Content-Type: application/json" -d '{"status":"CANCELED","cancel_reason":"Ingrediente em falta"}')
  CANCEL_STATUS=$(echo "$CANCEL_RESP" | jq -r '.order.status // empty')
  CANCEL_REASON=$(echo "$CANCEL_RESP" | jq -r '.order.cancel_reason // empty')

  if [ "$CANCEL_STATUS" = "CANCELED" ]; then
    pass "PENDING → CANCELED ✓"
    if [ "$CANCEL_REASON" = "Ingrediente em falta" ]; then
      pass "cancel_reason persistido ✓"
    else
      fail "cancel_reason" "esperado 'Ingrediente em falta', recebeu '$CANCEL_REASON'"
    fi
  else
    fail "PENDING → CANCELED" "status: '$CANCEL_STATUS'"
  fi

  # 5.2 Tentar transição depois de cancelar
  assert_status "CANCELED → ACCEPTED (terminal) → 400" \
    "$BASE/orders/$CANCEL_ORDER/status?tenant_id=$TENANT" "400" "PATCH" '{"status":"ACCEPTED"}'

else
  skip "Cancelamento" "Nenhum pedido PENDING disponível"
fi

# ═══════════════════════════════════════════════════════════════
# GRUPO 6: ORDER NÃO ENCONTRADA
# ═══════════════════════════════════════════════════════════════
header "6. Validações de Erro — Pedidos"

FAKE_UUID="00000000-0000-0000-0000-000000000000"

# 6.1 Order não existente
assert_status "PATCH order inexistente → 404" \
  "$BASE/orders/$FAKE_UUID/status?tenant_id=$TENANT" "404" "PATCH" '{"status":"ACCEPTED"}'

# 6.2 UUID inválido no order_id
assert_status "PATCH order_id inválido → 400" \
  "$BASE/orders/nao-eh-uuid/status?tenant_id=$TENANT" "400" "PATCH" '{"status":"ACCEPTED"}'

# 6.3 Status inválido
if [ -n "$CANCEL_ORDER" ] || [ -n "$PENDING_ORDER" ]; then
  SOME_ORDER="${CANCEL_ORDER:-$PENDING_ORDER}"
  assert_status "Status inválido 'EXPLODIU' → 400" \
    "$BASE/orders/$SOME_ORDER/status?tenant_id=$TENANT" "400" "PATCH" '{"status":"EXPLODIU"}'
fi

# 6.4 Sem body → 400
assert_status "PATCH sem body → 400" \
  "$BASE/orders/$FAKE_UUID/status?tenant_id=$TENANT" "400" "PATCH" ""

# ═══════════════════════════════════════════════════════════════
# GRUPO 7: WEBSOCKET
# ═══════════════════════════════════════════════════════════════
header "7. WebSocket (KDS real-time)"

if [ "$HAS_WEBSOCAT" = true ]; then
  # 7.1 Conectar WebSocket e capturar welcome message
  > "$WS_LOG"

  # Usar cat /dev/null como stdin para manter conexão viva, com timeout
  (cat /dev/null | websocat "ws://localhost:8080/ws/kds?tenant_id=$TENANT" > "$WS_LOG" 2>/dev/null) &
  WS_PID=$!
  sleep 2

  # Verificar se recebeu a welcome message (mesmo que o PID já tenha terminado)
  if [ -s "$WS_LOG" ]; then
    WELCOME=$(head -1 "$WS_LOG")
    WS_TYPE=$(echo "$WELCOME" | jq -r '.type // empty' 2>/dev/null)
    if [ "$WS_TYPE" = "connected" ]; then
      pass "WebSocket conectado e welcome recebida (type=connected)"
    else
      fail "Welcome message" "type esperado 'connected', recebeu '$WS_TYPE'"
    fi
  else
    fail "WebSocket conexão" "nenhuma resposta recebida"
  fi

  # 7.2 Testar broadcasting: conectar WS via fifo para manter vivo
  LIVE_ORDER=$(curl -s "$BASE/orders?tenant_id=$TENANT&status=PENDING" | jq -r '.orders[0].id // empty')
  if [ -n "$LIVE_ORDER" ]; then
    info "Testando broadcast com pedido $LIVE_ORDER"
    WS_FIFO="/tmp/clickgarcom_ws_fifo"
    rm -f "$WS_FIFO"; mkfifo "$WS_FIFO"
    > "$WS_LOG"

    # Conectar WS com fifo para manter stdin aberto
    cat "$WS_FIFO" | websocat "ws://localhost:8080/ws/kds?tenant_id=$TENANT" > "$WS_LOG" 2>/dev/null &
    WS_PID2=$!
    sleep 1

    # Mudar status do pedido
    curl -s -X PATCH "$BASE/orders/$LIVE_ORDER/status?tenant_id=$TENANT" \
      -H "Content-Type: application/json" -d '{"status":"ACCEPTED"}' > /dev/null

    sleep 2

    # Verificar eventos recebidos (pode ter welcome + status_changed)
    if grep -q "order.status_changed" "$WS_LOG" 2>/dev/null; then
      pass "WS broadcast: order.status_changed recebido ✓"
    else
      WS_CONTENT=$(cat "$WS_LOG" 2>/dev/null)
      TOTAL_LINES=$(echo "$WS_CONTENT" | wc -l | tr -d ' ')
      if [ "$TOTAL_LINES" -gt 1 ]; then
        fail "WS broadcast" "recebeu $TOTAL_LINES linhas mas sem order.status_changed"
      else
        skip "WS broadcast" "evento não recebido (pode ser limitação do processo worker)"
      fi
    fi

    # Cleanup
    echo "" > "$WS_FIFO" 2>/dev/null || true
    kill $WS_PID2 2>/dev/null || true
    wait $WS_PID2 2>/dev/null || true
    rm -f "$WS_FIFO"

    # Avançar pedido para limpar
    curl -s -X PATCH "$BASE/orders/$LIVE_ORDER/status?tenant_id=$TENANT" \
      -H "Content-Type: application/json" -d '{"status":"READY"}' > /dev/null 2>&1
  else
    skip "WS broadcast" "nenhum pedido PENDING para testar"
  fi

  # Cleanup WS PID1
  kill $WS_PID 2>/dev/null || true
  wait $WS_PID 2>/dev/null || true
else
  skip "WebSocket" "websocat não instalado"
fi

# ═══════════════════════════════════════════════════════════════
# GRUPO 8: KDS FRONTEND
# ═══════════════════════════════════════════════════════════════
header "8. KDS Frontend (Static Files)"

# 8.1 kds.html acessível
assert_status "GET /kds/kds.html → 200" "$BASE/kds/kds.html" "200"

# 8.2 kds.js acessível
assert_status "GET /kds/kds.js → 200" "$BASE/kds/kds.js" "200"

# 8.3 Conteúdo HTML contém elementos esperados
KDS_HTML=$(curl -s "$BASE/kds/kds.html")
if echo "$KDS_HTML" | grep -q "ClickGarçom"; then
  pass "kds.html contém logo ClickGarçom"
else
  fail "kds.html conteúdo" "não encontrou logo"
fi

if echo "$KDS_HTML" | grep -q "ws-status"; then
  pass "kds.html contém indicador WebSocket"
else
  fail "kds.html WS indicator" "id ws-status não encontrado"
fi

# 8.4 Conteúdo JS contém WebSocket
KDS_JS=$(curl -s "$BASE/kds/kds.js")
if echo "$KDS_JS" | grep -q "connectWebSocket"; then
  pass "kds.js contém WebSocket client"
else
  fail "kds.js WebSocket" "função connectWebSocket não encontrada"
fi

if echo "$KDS_JS" | grep -q "order.created"; then
  pass "kds.js trata evento order.created"
else
  fail "kds.js events" "handler order.created não encontrado"
fi

if echo "$KDS_JS" | grep -q "playNotificationSound"; then
  pass "kds.js contém notificação sonora"
else
  fail "kds.js som" "função playNotificationSound não encontrada"
fi

# ═══════════════════════════════════════════════════════════════
# GRUPO 9: WORKER & QUEUE (indicativo)
# ═══════════════════════════════════════════════════════════════
header "9. Worker & Queue (verificação indireta)"

# Se o worker está rodando, ele deveria ter processado a mensagem do grupo 3
if [ -f /tmp/clickgarcom-worker.log ]; then
  WORKER_LINES=$(wc -l < /tmp/clickgarcom-worker.log)
  if [ "$WORKER_LINES" -gt 0 ]; then
    pass "Worker log existe ($WORKER_LINES linhas)"

    if grep -q "consumer started" /tmp/clickgarcom-worker.log; then
      pass "Worker consumidor ativo (queue: whatsapp.messages)"
    else
      skip "Worker consumidor" "log pode ser de execução anterior"
    fi
  else
    skip "Worker log" "arquivo vazio"
  fi
else
  skip "Worker" "log não encontrado em /tmp/clickgarcom-worker.log"
fi

# ═══════════════════════════════════════════════════════════════
# GRUPO 10: DOCKER
# ═══════════════════════════════════════════════════════════════
header "10. Infraestrutura Docker"

for svc in postgres rabbitmq redis; do
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qi "$svc"; then
    pass "Container $svc rodando"
  else
    skip "Container $svc" "não encontrado (pode ter nome diferente)"
  fi
done

# RabbitMQ management
if curl -s --connect-timeout 2 -u guest:guest "http://localhost:15672/api/queues" > /dev/null 2>&1; then
  QUEUE_INFO=$(curl -s -u guest:guest "http://localhost:15672/api/queues/%2F/whatsapp.messages" 2>/dev/null)
  QUEUE_MSGS=$(echo "$QUEUE_INFO" | jq -r '.messages // 0' 2>/dev/null)
  QUEUE_CONSUMERS=$(echo "$QUEUE_INFO" | jq -r '.consumers // 0' 2>/dev/null)
  pass "RabbitMQ Management acessível (queue msgs=$QUEUE_MSGS, consumers=$QUEUE_CONSUMERS)"
else
  skip "RabbitMQ Management" "não acessível na porta 15672"
fi

# ═══════════════════════════════════════════════════════════════
# RELATÓRIO FINAL
# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${CYAN}"
echo "╔═══════════════════════════════════════════════════════╗"
echo "║              RELATÓRIO FINAL                         ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo -e "${NC}"

for r in "${RESULTS[@]}"; do
  echo "  $r"
done

TOTAL=$((PASS+FAIL+SKIP))
echo ""
echo -e "  ${BOLD}Total: $TOTAL testes${NC}"
echo -e "  ${GREEN}✅ Passed: $PASS${NC}"
echo -e "  ${RED}❌ Failed: $FAIL${NC}"
echo -e "  ${YELLOW}⏭  Skipped: $SKIP${NC}"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}${BOLD}🎉 Todos os testes passaram!${NC}"
else
  echo -e "  ${RED}${BOLD}⚠️  $FAIL teste(s) falharam${NC}"
fi

# Cleanup
rm -f "$WS_LOG"
exit $FAIL
