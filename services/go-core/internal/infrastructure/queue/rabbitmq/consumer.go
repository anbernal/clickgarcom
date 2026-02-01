package rabbitmq

import (
    "context"
    "fmt"

    amqp "github.com/rabbitmq/amqp091-go"
    "go.uber.org/zap"
)

type Consumer struct {
    channel *amqp.Channel
    logger  *zap.Logger
}

type MessageHandler func(ctx context.Context, body []byte) error

func NewConsumer(channel *amqp.Channel, logger *zap.Logger) *Consumer {
    return &Consumer{
        channel: channel,
        logger:  logger,
    }
}

func (c *Consumer) Consume(queueName string, handler MessageHandler) error {
    msgs, err := c.channel.Consume(
        queueName,
        "",    // consumer tag
        false, // auto-ack (manual para controle)
        false, // exclusive
        false, // no-local
        false, // no-wait
        nil,   // args
    )
    if err != nil {
        return fmt.Errorf("failed to register consumer: %w", err)
    }

    c.logger.Info("consumer started",
        zap.String("queue", queueName),
    )

    // Processar mensagens
    go func() {
        for msg := range msgs {
            ctx := context.Background()

            c.logger.Debug("message received",
                zap.String("queue", queueName),
                zap.String("message_id", msg.MessageId),
            )

            // Processar mensagem
            if err := handler(ctx, msg.Body); err != nil {
                c.logger.Error("error processing message",
                    zap.String("queue", queueName),
                    zap.String("message_id", msg.MessageId),
                    zap.Error(err),
                )

                // Nack e requeue (até 3 tentativas)
                if msg.Headers == nil {
                    msg.Headers = make(amqp.Table)
                }

                retries, _ := msg.Headers["x-retry-count"].(int32)
                retries++

                if retries >= 3 {
                    c.logger.Warn("max retries reached, sending to DLQ",
                        zap.String("queue", queueName),
                        zap.String("message_id", msg.MessageId),
                    )
                    // Nack sem requeue (vai para DLQ)
                    msg.Nack(false, false)
                } else {
                    msg.Headers["x-retry-count"] = retries
                    // Nack e requeue
                    msg.Nack(false, true)
                }
            } else {
                // Ack manual
                msg.Ack(false)
                c.logger.Debug("message processed successfully",
                    zap.String("queue", queueName),
                    zap.String("message_id", msg.MessageId),
                )
            }
        }
    }()

    return nil
}