package logger

import (
    "os"

    "go.uber.org/zap"
    "go.uber.org/zap/zapcore"
)

var Log *zap.Logger

// Initialize inicializa o logger global
func Initialize(level string, format string) error {
    var config zap.Config

    // Configurar baseado no ambiente
    if format == "json" {
        config = zap.NewProductionConfig()
    } else {
        config = zap.NewDevelopmentConfig()
        config.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
    }

    // Setar nível de log
    logLevel, err := zapcore.ParseLevel(level)
    if err != nil {
        logLevel = zapcore.InfoLevel
    }
    config.Level = zap.NewAtomicLevelAt(logLevel)

    // Criar logger
    logger, err := config.Build(
        zap.AddCaller(),
        zap.AddStacktrace(zapcore.ErrorLevel),
    )
    if err != nil {
        return err
    }

    Log = logger
    return nil
}

// Info log
func Info(msg string, fields ...zap.Field) {
    Log.Info(msg, fields...)
}

// Error log
func Error(msg string, fields ...zap.Field) {
    Log.Error(msg, fields...)
}

// Debug log
func Debug(msg string, fields ...zap.Field) {
    Log.Debug(msg, fields...)
}

// Warn log
func Warn(msg string, fields ...zap.Field) {
    Log.Warn(msg, fields...)
}

// Fatal log e sai do programa
func Fatal(msg string, fields ...zap.Field) {
    Log.Fatal(msg, fields...)
    os.Exit(1)
}

// Sync faz flush dos logs
func Sync() {
    _ = Log.Sync()
}