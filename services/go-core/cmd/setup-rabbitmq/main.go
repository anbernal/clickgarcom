package main

import (
    "fmt"
    "log"
    "os"

    amqp "github.com/rabbitmq/amqp091-go"
    "github.com/spf13/viper"
)

func main() {
    // Carregar .env
    viper.SetConfigFile(".env")
    if err := viper.ReadInConfig(); err != nil {
        log.Fatalf("Error reading config file: %v", err)
    }

    // Conectar ao RabbitMQ
    url := fmt.Sprintf(
        "amqp://%s:%s@%s:%s%s",
        viper.GetString("RABBITMQ_USER"),
        viper.GetString("RABBITMQ_PASSWORD"),
        viper.GetString("RABBITMQ_HOST"),
        viper.GetString("RABBITMQ_PORT"),
        viper.GetString("RABBITMQ_VHOST"),
    )

    conn, err := amqp.Dial(url)
    if err != nil {
        log.Fatalf("Failed to connect to RabbitMQ: %v", err)
    }
    defer conn.Close()

    channel, err := conn.Channel()
    if err != nil {
        log.Fatalf("Failed to open channel: %v", err)
    }
    defer channel.Close()

    fmt.Println("🔧 Setting up RabbitMQ...")

    // 1. Declarar Exchange principal
    err = channel.ExchangeDeclare(
        "clickgarcom.events", // name
        "topic",              // type
        true,                 // durable
        false,                // auto-deleted
        false,                // internal
        false,                // no-wait
        nil,                  // arguments
    )
    if err != nil {
        log.Fatalf("Failed to declare exchange: %v", err)
    }
    fmt.Println("✅ Exchange 'clickgarcom.events' created")

    // 2. Declarar DLX (Dead Letter Exchange)
    err = channel.ExchangeDeclare(
        "clickgarcom.dlx",
        "fanout",
        true,
        false,
        false,
        false,
        nil,
    )
    if err != nil {
        log.Fatalf("Failed to declare DLX: %v", err)
    }
    fmt.Println("✅ Exchange 'clickgarcom.dlx' created")

    // 3. Declarar filas
    queues := []struct {
        name       string
        routingKey string
        quorum     bool
    }{
        {"whatsapp.messages", "whatsapp.message.received", true},
        {"payment.webhooks", "payment.webhook.received", true},
        {"notifications.send", "notification.*", true},
        {"orders.dlq", "", false}, // DLQ não precisa de routing key
    }

    for _, q := range queues {
        args := amqp.Table{}
        
        if q.quorum {
            args["x-queue-type"] = "quorum"
            args["x-dead-letter-exchange"] = "clickgarcom.dlx"
        }

        _, err = channel.QueueDeclare(
            q.name,
            true,  // durable
            false, // delete when unused
            false, // exclusive
            false, // no-wait
            args,
        )
        if err != nil {
            log.Fatalf("Failed to declare queue %s: %v", q.name, err)
        }
        fmt.Printf("✅ Queue '%s' created\n", q.name)

        // Bind queue to exchange (exceto DLQ)
        if q.routingKey != "" {
            err = channel.QueueBind(
                q.name,
                q.routingKey,
                "clickgarcom.events",
                false,
                nil,
            )
            if err != nil {
                log.Fatalf("Failed to bind queue %s: %v", q.name, err)
            }
            fmt.Printf("✅ Queue '%s' bound to routing key '%s'\n", q.name, q.routingKey)
        }
    }

    // 4. Bind DLQ ao DLX
    err = channel.QueueBind(
        "orders.dlq",
        "",
        "clickgarcom.dlx",
        false,
        nil,
    )
    if err != nil {
        log.Fatalf("Failed to bind DLQ: %v", err)
    }
    fmt.Println("✅ DLQ bound to DLX")

    fmt.Println("\n🎉 RabbitMQ setup completed successfully!")
    os.Exit(0)
}