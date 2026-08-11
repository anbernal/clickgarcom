package deliveryrealtime

import (
	"log"
	"sync"
	"time"

	fiberws "github.com/gofiber/websocket/v2"
)

const (
	deliveryWriteWait      = 10 * time.Second
	deliveryPongWait       = 60 * time.Second
	deliveryPingPeriod     = (deliveryPongWait * 9) / 10
	deliveryMaxMessageSize = 512
)

// FiberClient adapts a Fiber WebSocket connection to the room-isolated Hub.
// The send queue is bounded; Hub removes a client when Send reports it is full.
type FiberClient struct {
	hub       *Hub
	conn      *fiberws.Conn
	scope     Scope
	send      chan []byte
	done      chan struct{}
	closeOnce sync.Once
}

func NewFiberClient(hub *Hub, conn *fiberws.Conn, scope Scope) *FiberClient {
	return &FiberClient{
		hub: hub, conn: conn, scope: scope,
		send: make(chan []byte, 256), done: make(chan struct{}),
	}
}

func (c *FiberClient) Scope() Scope { return c.scope }

func (c *FiberClient) Send(data []byte) bool {
	select {
	case <-c.done:
		return false
	case c.send <- data:
		return true
	default:
		return false
	}
}

func (c *FiberClient) Close() error {
	c.closeOnce.Do(func() {
		close(c.done)
		if c.conn != nil {
			_ = c.conn.Close()
		}
	})
	return nil
}

func (c *FiberClient) Start() {
	go c.writePump()
	c.readPump()
}

func (c *FiberClient) readPump() {
	defer func() {
		c.hub.Unregister(c)
		_ = c.Close()
	}()
	if c.conn == nil {
		return
	}
	c.conn.SetReadLimit(deliveryMaxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(deliveryPongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(deliveryPongWait))
	})
	for {
		messageType, _, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		// Tracking sockets are read-only. Text commands are ignored rather than
		// forwarded to the delivery domain.
		if messageType != fiberws.TextMessage {
			continue
		}
	}
}

func (c *FiberClient) writePump() {
	if c.conn == nil {
		return
	}
	ticker := time.NewTicker(deliveryPingPeriod)
	defer ticker.Stop()
	for {
		select {
		case <-c.done:
			return
		case message := <-c.send:
			if err := c.conn.SetWriteDeadline(time.Now().Add(deliveryWriteWait)); err != nil {
				return
			}
			if err := c.conn.WriteMessage(fiberws.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			if err := c.conn.SetWriteDeadline(time.Now().Add(deliveryWriteWait)); err != nil {
				return
			}
			if err := c.conn.WriteMessage(fiberws.PingMessage, nil); err != nil {
				log.Printf("[DeliveryWebSocket] ping failed: %v", err)
				return
			}
		}
	}
}
