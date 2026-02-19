package websocket

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/anbernal/clickgarcom/internal/domain/events"
	"github.com/google/uuid"
)

// Client interface para permitir diferentes implementações
type Client interface {
	GetTenantID() uuid.UUID
	GetSendChannel() chan []byte
}

// Hub mantém o conjunto de clientes ativos e transmite mensagens para eles
type Hub struct {
	// Clientes registrados
	clients map[Client]bool

	// Mensagens de broadcast dos clientes
	broadcast chan *BroadcastMessage

	// Registrar requisições dos clientes
	register chan Client

	// Desregistrar requisições dos clientes
	unregister chan Client

	// Mapa de clientes por tenant (para broadcast seletivo)
	tenantClients map[string]map[Client]bool

	// Mutex para proteger tenantClients
	mu sync.RWMutex
}

// BroadcastMessage representa uma mensagem para broadcast
type BroadcastMessage struct {
	TenantID uuid.UUID
	Event    *events.OrderEvent
}

// NewHub cria uma nova instância do Hub
func NewHub() *Hub {
	return &Hub{
		broadcast:     make(chan *BroadcastMessage),
		register:      make(chan Client),
		unregister:    make(chan Client),
		clients:       make(map[Client]bool),
		tenantClients: make(map[string]map[Client]bool),
	}
}

// Run inicia o loop principal do hub
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.registerClient(client)

		case client := <-h.unregister:
			h.unregisterClient(client)

		case message := <-h.broadcast:
			h.broadcastToTenant(message)
		}
	}
}

// Register registra um novo cliente (método exportado)
func (h *Hub) Register(client Client) {
	h.register <- client
}

// Unregister remove um cliente (método exportado)
func (h *Hub) Unregister(client Client) {
	h.unregister <- client
}

// registerClient registra um novo cliente
func (h *Hub) registerClient(client Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.clients[client] = true

	// Adicionar cliente ao mapa de tenants
	tenantID := client.GetTenantID().String()
	if _, ok := h.tenantClients[tenantID]; !ok {
		h.tenantClients[tenantID] = make(map[Client]bool)
	}
	h.tenantClients[tenantID][client] = true

	log.Printf("[WebSocket] Cliente registrado: tenant=%s, total_clients=%d",
		tenantID, len(h.tenantClients[tenantID]))
}

// unregisterClient remove um cliente
func (h *Hub) unregisterClient(client Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.clients[client]; ok {
		delete(h.clients, client)
		close(client.GetSendChannel())

		// Remover do mapa de tenants
		tenantID := client.GetTenantID().String()
		if clients, ok := h.tenantClients[tenantID]; ok {
			delete(clients, client)
			if len(clients) == 0 {
				delete(h.tenantClients, tenantID)
			}
		}

		log.Printf("[WebSocket] Cliente desregistrado: tenant=%s", tenantID)
	}
}

// broadcastToTenant envia mensagem para todos os clientes de um tenant
func (h *Hub) broadcastToTenant(message *BroadcastMessage) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	tenantID := message.TenantID.String()
	clients, ok := h.tenantClients[tenantID]
	if !ok {
		return
	}

	// Serializar evento uma vez
	data, err := json.Marshal(message.Event)
	if err != nil {
		log.Printf("[WebSocket] Erro ao serializar evento: %v", err)
		return
	}

	// Enviar para todos os clientes do tenant
	for client := range clients {
		select {
		case client.GetSendChannel() <- data:
		default:
			// Cliente não conseguiu receber, fechar conexão
			close(client.GetSendChannel())
			delete(h.clients, client)
			delete(clients, client)
		}
	}

	log.Printf("[WebSocket] Broadcast enviado: tenant=%s, tipo=%s, clientes=%d",
		tenantID, message.Event.Type, len(clients))
}

// BroadcastToTenant envia um evento para todos os clientes de um tenant
func (h *Hub) BroadcastToTenant(tenantID uuid.UUID, event *events.OrderEvent) {
	h.broadcast <- &BroadcastMessage{
		TenantID: tenantID,
		Event:    event,
	}
}

// GetClientCount retorna o número total de clientes conectados
func (h *Hub) GetClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// GetTenantClientCount retorna o número de clientes de um tenant específico
func (h *Hub) GetTenantClientCount(tenantID uuid.UUID) int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if clients, ok := h.tenantClients[tenantID.String()]; ok {
		return len(clients)
	}
	return 0
}
