package metrics

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"
)

type healthResponse struct {
	Status    string `json:"status"`
	Service   string `json:"service"`
	Timestamp int64  `json:"timestamp"`
}

func StartServer(port, service string, logger *zap.Logger) *http.Server {
	if port == "" {
		return nil
	}

	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(healthResponse{
			Status:    "ok",
			Service:   service,
			Timestamp: time.Now().Unix(),
		})
	})

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		logger.Info("metrics server listening",
			zap.String("service", service),
			zap.String("address", server.Addr),
		)

		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("metrics server stopped unexpectedly",
				zap.String("service", service),
				zap.Error(err),
			)
		}
	}()

	return server
}

func ShutdownServer(server *http.Server, logger *zap.Logger, service string) {
	if server == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("failed to shutdown metrics server",
			zap.String("service", service),
			zap.Error(err),
		)
	}
}
