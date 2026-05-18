package client

import (
	"time"

	"github.com/QosmuratSamat0/pairexx/pkg/metrics"
	pbMatch "github.com/QosmuratSamat0/pairexx/proto/matchmaking/v1"
	pbUser "github.com/QosmuratSamat0/pairexx/proto/user/v1"
	"github.com/sony/gobreaker"
	"go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/keepalive"
)

type GRPCClients struct {
	User  pbUser.UserServiceClient
	Match pbMatch.MatchmakingServiceClient

	// Circuit Breakers
	UserBreaker  *gobreaker.CircuitBreaker
	MatchBreaker *gobreaker.CircuitBreaker
}

func NewGRPCClients(userAddr, matchAddr string) (*GRPCClients, error) {
	uConn, err := grpc.Dial(userAddr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithStatsHandler(otelgrpc.NewClientHandler()),
		grpc.WithChainUnaryInterceptor(metrics.UnaryClientInterceptor("api-gateway")),
		grpc.WithChainStreamInterceptor(metrics.StreamClientInterceptor("api-gateway")),
		grpc.WithKeepaliveParams(keepalive.ClientParameters{
			Time:                2 * time.Minute,
			Timeout:             3 * time.Second,
			PermitWithoutStream: false,
		}),
	)
	if err != nil {
		return nil, err
	}
	mConn, err := grpc.Dial(matchAddr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithStatsHandler(otelgrpc.NewClientHandler()),
		grpc.WithChainUnaryInterceptor(metrics.UnaryClientInterceptor("api-gateway")),
		grpc.WithChainStreamInterceptor(metrics.StreamClientInterceptor("api-gateway")),
		grpc.WithKeepaliveParams(keepalive.ClientParameters{
			Time:                2 * time.Minute,
			Timeout:             3 * time.Second,
			PermitWithoutStream: false,
		}),
	)
	if err != nil {
		return nil, err
	}

	// Init Circuit Breakers
	userBreaker := gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        "user-service",
		MaxRequests: 5,
		Interval:    10 * time.Second,
		Timeout:     30 * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
			return counts.Requests >= 10 && failureRatio >= 0.6
		},
	})

	matchBreaker := gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        "matchmaking-service",
		MaxRequests: 5,
		Interval:    10 * time.Second,
		Timeout:     30 * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
			return counts.Requests >= 10 && failureRatio >= 0.6
		},
	})

	return &GRPCClients{
		User:         pbUser.NewUserServiceClient(uConn),
		Match:        pbMatch.NewMatchmakingServiceClient(mConn),
		UserBreaker:  userBreaker,
		MatchBreaker: matchBreaker,
	}, nil
}
