package rabbitmq

import (
    "context"
    "encoding/json"
    "fmt"
    "time"

    amqp "github.com/rabbitmq/amqp091-go"
    "go.uber.org/zap"
)

type Publisher struct {
    channel *amqp.Channel
    logger  *zap.Logger
}

func NewPublisher(channel *amqp.Channel, logger *zap.Logger) *Publisher {
    return &Publisher{
        channel: channel,
        logger:  logger,
    }
}

func (p *Publisher) Publish(exchange, routingKey string, body []byte) error {
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    err := p.channel.PublishWithContext(
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
            MessageId:    fmt.Sprintf("%d", time.Now().UnixNano()),
        },
    )

    if err != nil {
        p.logger.Error("failed to publish message",
            zap.String("exchange", exchange),
            zap.String("routing_key", routingKey),
            zap.Error(err),
        )
        return err
    }

    p.logger.Debug("message published",
        zap.String("exchange", exchange),
        zap.String("routing_key", routingKey),
    )

    return nil
}

func (p *Publisher) PublishJSON(exchange, routingKey string, data interface{}) error {
    body, err := json.Marshal(data)
    if err != nil {
        return fmt.Errorf("failed to marshal data: %w", err)
    }
    return p.Publish(exchange, routingKey, body)
}