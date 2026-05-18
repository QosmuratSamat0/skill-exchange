package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/QosmuratSamat0/pairexx/matchmaking-service/internal/client"
	"github.com/QosmuratSamat0/pairexx/matchmaking-service/internal/config"
	grpcDelivery "github.com/QosmuratSamat0/pairexx/matchmaking-service/internal/delivery/grpc"
	delivery "github.com/QosmuratSamat0/pairexx/matchmaking-service/internal/delivery/http"
	"github.com/QosmuratSamat0/pairexx/matchmaking-service/internal/domain"
	gwMiddleware "github.com/QosmuratSamat0/pairexx/matchmaking-service/internal/middleware"
	"github.com/QosmuratSamat0/pairexx/matchmaking-service/internal/repository/redis"
	"github.com/QosmuratSamat0/pairexx/matchmaking-service/internal/usecase"
	"github.com/QosmuratSamat0/pairexx/pkg/mq"
	pb "github.com/QosmuratSamat0/pairexx/proto/matchmaking/v1"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"
	"net"
)

func main() {
	// Configure zerolog
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	cfg := config.Load()
	validateConfig(cfg)

	var repo domain.MatchRepository
	var redisRepo *redis.RedisMatchRepository
	if cfg.RepoDriver == "redis" || true { // Force redis for now
		var err error
		redisRepo, err = redis.NewRedisMatchRepository(cfg.RedisURL)
		if err != nil {
			log.Fatal().Err(err).Msg("failed to init redis repo")
		}
		defer redisRepo.Close()
		repo = redisRepo
	}
	chatCli := client.NewChatClient(cfg.ChatServiceURL, cfg.InternalToken)

	js, err := mq.NewJetStream(cfg.NATSURL)
	if err != nil {
		log.Warn().Err(err).Msg("failed to init NATS JetStream, using dummy publisher")
	} else {
		defer js.Close()
	}

	uc := usecase.NewMatchUsecase(repo, chatCli, js)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(gwMiddleware.Metrics)

	delivery.NewMatchHandler(r, uc, cfg)

	// Prometheus metrics
	r.Handle("/metrics", promhttp.Handler())

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	server := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: r,
	}

	go func() {
		log.Info().Str("port", cfg.Port).Msg("matchmaking-service HTTP starting")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("failed to start HTTP server")
		}
	}()

	// gRPC enabled
	lis, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to listen for gRPC")
	}
	grpcServer := grpc.NewServer()
	pb.RegisterMatchmakingServiceServer(grpcServer, grpcDelivery.NewMatchmakingHandler(uc))

	go func() {
		log.Info().Str("port", cfg.GRPCPort).Msg("matchmaking-service gRPC starting")
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatal().Err(err).Msg("failed to start gRPC server")
		}
	}()

	<-ctx.Done()
	log.Info().Msg("shutting down matchmaking-service...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Fatal().Err(err).Msg("HTTP server shutdown failed")
	}
	log.Info().Msg("matchmaking-service stopped")
}

func validateConfig(cfg *config.Config) {
	if cfg.AppEnv != "development" {
		if cfg.InternalToken == "" || cfg.InternalToken == "dev-internal-token" {
			log.Fatal().Msg("INTERNAL_TOKEN must be set to a strong random value in non-development environments")
		}
	}
}
