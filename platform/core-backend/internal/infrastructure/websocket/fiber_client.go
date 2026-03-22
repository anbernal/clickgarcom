package websocket

import (
	"log"
	"time"

	"github.com/gofiber/websocket/v2"
	"github.com/google/uuid"
)

const (
	// Tempo máximo de espera para escrever mensagem
	writeWait = 10 * time.Second

	// Tempo máximo de espera para receber pong do cliente
	pongWait = 60 * time.Second

	// Intervalo de ping (deve ser menor que pongWait)
	pingPeriod = (pongWait * 9) / 10

	// Tamanho máximo da mensagem
	maxMessageSize = 512
)

// FiberClient representa um cliente WebSocket individual usando gofiber/websocket
type FiberClient struct {
	// Hub que gerencia este cliente
	hub *Hub

	// Conexão WebSocket do Fiber
	conn *websocket.Conn

	// Canal para enviar mensagens ao cliente
	send chan []byte

	// ID do tenant deste cliente
	tenantID uuid.UUID

	// Canal para sinalizar encerramento
	done chan struct{}
}

// NewFiberClient cria um novo cliente WebSocket Fiber
func NewFiberClient(hub *Hub, conn *websocket.Conn, tenantID uuid.UUID) *FiberClient {
	return &FiberClient{
		hub:      hub,
		conn:     conn,
		send:     make(chan []byte, 256),
		tenantID: tenantID,
		done:     make(chan struct{}),
	}
}

// GetTenantID retorna o ID do tenant
func (c *FiberClient) GetTenantID() uuid.UUID {
	return c.tenantID
}

// GetSendChannel retorna o canal de envio
func (c *FiberClient) GetSendChannel() chan []byte {
	return c.send
}

// SendMessage envia uma mensagem para o cliente
func (c *FiberClient) SendMessage(data []byte) {
	select {
	case c.send <- data:
	default:
		log.Printf("[WebSocket] Canal de envio cheio, descartando mensagem")
	}
}

// readPump bombeia mensagens da conexão WebSocket para o hub
func (c *FiberClient) readPump() {
	defer func() {
		c.hub.Unregister(c)
		c.conn.Close()
		close(c.done)
	}()

	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		messageType, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[WebSocket] Erro de leitura: %v", err)
			}
			break
		}

		// Processar apenas mensagens de texto
		if messageType == websocket.TextMessage {
			log.Printf("[WebSocket] Mensagem recebida do cliente: %s", string(message))
			// Aqui podemos processar comandos do cliente se necessário
		}
	}
}

// writePump bombeia mensagens do hub para a conexão WebSocket
func (c *FiberClient) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub fechou o canal
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}

		case <-c.done:
			return
		}
	}
}

// Start inicia as goroutines de leitura e escrita
func (c *FiberClient) Start() {
	go c.writePump()
	c.readPump() // Bloqueia até a conexão fechar
}
