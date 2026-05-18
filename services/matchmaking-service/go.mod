module github.com/QosmuratSamat0/pairexx/matchmaking-service

go 1.25.0

replace (
	github.com/QosmuratSamat0/pairexx/pkg => ../../libs/shared
	github.com/QosmuratSamat0/pairexx/proto => ../../libs/proto
)

require (
	github.com/QosmuratSamat0/pairexx/pkg v0.0.0-00010101000000-000000000000
	github.com/QosmuratSamat0/pairexx/proto v0.0.0-00010101000000-000000000000
	github.com/alicebob/miniredis/v2 v2.37.0
	github.com/go-chi/chi/v5 v5.2.5
	github.com/go-playground/validator/v10 v10.30.2
	github.com/google/uuid v1.6.0
	github.com/prometheus/client_golang v1.23.2
	github.com/redis/go-redis/v9 v9.18.0
	github.com/rs/zerolog v1.35.1
	github.com/sony/gobreaker/v2 v2.4.0
	github.com/stretchr/testify v1.11.1
	golang.org/x/time v0.15.0
	google.golang.org/grpc v1.81.0
)

require (
	github.com/beorn7/perks v1.0.1 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/davecgh/go-spew v1.1.2-0.20180830191138-d8f796af33cc // indirect
	github.com/dgryski/go-rendezvous v0.0.0-20200823014737-9f7001d12a5f // indirect
	github.com/gabriel-vasile/mimetype v1.4.13 // indirect
	github.com/go-playground/locales v0.14.1 // indirect
	github.com/go-playground/universal-translator v0.18.1 // indirect
	github.com/klauspost/compress v1.18.5 // indirect
	github.com/kr/text v0.2.0 // indirect
	github.com/leodido/go-urn v1.4.0 // indirect
	github.com/mattn/go-colorable v0.1.14 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/munnerz/goautoneg v0.0.0-20191010083416-a7dc8b61c822 // indirect
	github.com/nats-io/nats.go v1.51.0 // indirect
	github.com/nats-io/nkeys v0.4.15 // indirect
	github.com/nats-io/nuid v1.0.1 // indirect
	github.com/pmezard/go-difflib v1.0.1-0.20181226105442-5d4384ee4fb2 // indirect
	github.com/prometheus/client_model v0.6.2 // indirect
	github.com/prometheus/common v0.66.1 // indirect
	github.com/prometheus/procfs v0.16.1 // indirect
	github.com/yuin/gopher-lua v1.1.1 // indirect
	go.uber.org/atomic v1.11.0 // indirect
	go.yaml.in/yaml/v2 v2.4.2 // indirect
	golang.org/x/crypto v0.50.0 // indirect
	golang.org/x/net v0.52.0 // indirect
	golang.org/x/sys v0.43.0 // indirect
	golang.org/x/text v0.36.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20260401024825-9d38bb4040a9 // indirect
	google.golang.org/protobuf v1.36.11 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)
