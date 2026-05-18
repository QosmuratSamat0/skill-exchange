FROM golang:1.25-alpine AS builder
WORKDIR /app

COPY go.work go.work.sum ./
COPY services/api-gateway/go.mod     services/api-gateway/go.sum     ./services/api-gateway/
COPY services/chat-service/go.mod    services/chat-service/go.sum    ./services/chat-service/
COPY services/matchmaking-service/go.mod services/matchmaking-service/go.sum ./services/matchmaking-service/
COPY services/moderation-service/go.mod  services/moderation-service/go.sum  ./services/moderation-service/
COPY services/notification-service/go.mod services/notification-service/go.sum ./services/notification-service/
COPY services/user-service/go.mod    services/user-service/go.sum    ./services/user-service/
COPY libs/shared/go.mod              libs/shared/go.sum              ./libs/shared/
COPY libs/proto/go.mod               libs/proto/go.sum               ./libs/proto/

RUN go mod download

COPY . .

WORKDIR /app/services/api-gateway
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/main ./cmd/main.go

FROM alpine:latest
WORKDIR /root/
COPY --from=builder /app/main .
COPY --from=builder /app/services/api-gateway/docs ./docs
CMD ["./main"]
