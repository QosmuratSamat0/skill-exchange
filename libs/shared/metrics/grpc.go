package metrics

import (
	"context"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"google.golang.org/grpc"
	"google.golang.org/grpc/status"
)

var (
	grpcServerRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "grpc_server_requests_total",
			Help: "Total number of gRPC requests handled by a server.",
		},
		[]string{"service", "method", "code"},
	)
	grpcServerRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "grpc_server_request_duration_seconds",
			Help:    "gRPC server request latency in seconds.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"service", "method", "code"},
	)
	grpcClientRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "grpc_client_requests_total",
			Help: "Total number of outbound gRPC requests made by a client.",
		},
		[]string{"client", "method", "code"},
	)
	grpcClientRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "grpc_client_request_duration_seconds",
			Help:    "Outbound gRPC client request latency in seconds.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"client", "method", "code"},
	)
)

func UnaryServerInterceptor(serviceName string) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		start := time.Now()
		resp, err := handler(ctx, req)
		code := status.Code(err).String()

		grpcServerRequestsTotal.WithLabelValues(serviceName, info.FullMethod, code).Inc()
		grpcServerRequestDuration.WithLabelValues(serviceName, info.FullMethod, code).Observe(time.Since(start).Seconds())

		return resp, err
	}
}

func StreamServerInterceptor(serviceName string) grpc.StreamServerInterceptor {
	return func(srv any, stream grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
		start := time.Now()
		err := handler(srv, stream)
		code := status.Code(err).String()

		grpcServerRequestsTotal.WithLabelValues(serviceName, info.FullMethod, code).Inc()
		grpcServerRequestDuration.WithLabelValues(serviceName, info.FullMethod, code).Observe(time.Since(start).Seconds())

		return err
	}
}

func UnaryClientInterceptor(clientName string) grpc.UnaryClientInterceptor {
	return func(ctx context.Context, method string, req any, reply any, cc *grpc.ClientConn, invoker grpc.UnaryInvoker, opts ...grpc.CallOption) error {
		start := time.Now()
		err := invoker(ctx, method, req, reply, cc, opts...)
		code := status.Code(err).String()

		grpcClientRequestsTotal.WithLabelValues(clientName, method, code).Inc()
		grpcClientRequestDuration.WithLabelValues(clientName, method, code).Observe(time.Since(start).Seconds())

		return err
	}
}

func StreamClientInterceptor(clientName string) grpc.StreamClientInterceptor {
	return func(ctx context.Context, desc *grpc.StreamDesc, cc *grpc.ClientConn, method string, streamer grpc.Streamer, opts ...grpc.CallOption) (grpc.ClientStream, error) {
		start := time.Now()
		stream, err := streamer(ctx, desc, cc, method, opts...)
		code := status.Code(err).String()

		grpcClientRequestsTotal.WithLabelValues(clientName, method, code).Inc()
		grpcClientRequestDuration.WithLabelValues(clientName, method, code).Observe(time.Since(start).Seconds())

		return stream, err
	}
}
