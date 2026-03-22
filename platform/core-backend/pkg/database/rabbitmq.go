package database

import (
	"context"
	"fmt"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"go.uber.org/zap"
)

type RabbitMQClient struct {
	conn    *amqp.Connection
	channel *amqp.Channel
	url     string
	logger  *zap.Logger
}

// NewRabbitMQConnection cria conexão com RabbitMQ
func NewRabbitMQConnection(url string, logger *zap.Logger) (*RabbitMQClient, error) {
	conn, err := amqp.Dial(url)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to rabbitmq: %w", err)
	}

	channel, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to open channel: %w", err)
	}

	// Configurar QoS (quantas mensagens processar por vez)
	if err := channel.Qos(10, 0, false); err != nil {
		channel.Close()
		conn.Close()
		return nil, fmt.Errorf("failed to set QoS: %w", err)
	}

	client := &RabbitMQClient{
		conn:    conn,
		channel: channel,
		url:     url,
		logger:  logger,
	}

	// Iniciar goroutine para reconectar em caso de erro
	go client.handleReconnect()

	return client, nil
}

// Publish publica mensagem em uma exchange
func (r *RabbitMQClient) Publish(ctx context.Context, exchange, routingKey string, body []byte) error {
	return r.channel.PublishWithContext(
		ctx,
		exchange,
		routingKey,
		false, // mandatory
		false, // immediate
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent,
			Timestamp:    time.Now(),
			Body:         body,
		},
	)
}

// Consume consome mensagens de uma fila
func (r *RabbitMQClient) Consume(queueName string, handler func([]byte) error) error {
	msgs, err := r.channel.Consume(
		queueName,
		"",    // consumer tag
		false, // auto-ack (desabilitado para controle manual)
		false, // exclusive
		false, // no-local
		false, // no-wait
		nil,   // args
	)
	if err != nil {
		return fmt.Errorf("failed to register consumer: %w", err)
	}

	go func() {
		for msg := range msgs {
			if err := handler(msg.Body); err != nil {
				r.logger.Error("error processing message",
					zap.Error(err),
					zap.String("queue", queueName),
				)
				// Nack e reenfileirar
				msg.Nack(false, true)
			} else {
				// Ack manual
				msg.Ack(false)
			}
		}
	}()

	return nil
}

// Close fecha canal e conexão
func (r *RabbitMQClient) Close() error {
	if err := r.channel.Close(); err != nil {
		return err
	}
	return r.conn.Close()
}

// GetChannel retorna o channel atual
func (r *RabbitMQClient) GetChannel() *amqp.Channel {
	return r.channel
}

// HealthCheck verifica se a conexão está ativa
func (r *RabbitMQClient) HealthCheck() error {
	if r.conn.IsClosed() {
		return fmt.Errorf("rabbitmq connection is closed")
	}
	return nil
}

// handleReconnect reconecta automaticamente em caso de erro
func (r *RabbitMQClient) handleReconnect() {
	for {
		reason, ok := <-r.conn.NotifyClose(make(chan *amqp.Error))
		if !ok {
			r.logger.Info("rabbitmq connection closed normally")
			break
		}

		r.logger.Error("rabbitmq connection closed, reconnecting...",
			zap.String("reason", reason.Error()),
		)

		// Tentar reconectar
		for {
			time.Sleep(5 * time.Second)

			conn, err := amqp.Dial(r.url)
			if err != nil {
				r.logger.Error("failed to reconnect to rabbitmq",
					zap.Error(err),
				)
				continue
			}

			channel, err := conn.Channel()
			if err != nil {
				conn.Close()
				r.logger.Error("failed to open channel on reconnect",
					zap.Error(err),
				)
				continue
			}

			r.conn = conn
			r.channel = channel
			r.logger.Info("successfully reconnected to rabbitmq")
			break
		}
	}
}
