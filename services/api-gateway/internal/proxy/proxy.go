package proxy

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
)

type Proxy struct {
	targets map[string]*httputil.ReverseProxy
	// Track target URLs separately for WebSocket proxy
	targetURLs map[string]*url.URL
	wsDialer   *websocket.Dialer
}

func NewProxy() *Proxy {
	return &Proxy{
		targets:    make(map[string]*httputil.ReverseProxy),
		targetURLs: make(map[string]*url.URL),
		wsDialer: &websocket.Dialer{
			Proxy:            http.ProxyFromEnvironment,
			HandshakeTimeout: 10 * time.Second,
		},
	}
}

func (p *Proxy) AddTarget(pathPrefix, targetURL string) error {
	target, err := url.Parse(targetURL)
	if err != nil {
		return err
	}

	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.FlushInterval = -1 // Flush immediately for SSE/streaming

	// Store target URL for WebSocket proxy
	p.targetURLs[pathPrefix] = target

	// Customize the director to strip the prefix if needed
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)

		// Set the host header to the target host
		req.Host = target.Host

		// Propagate Request ID
		if reqID := req.Header.Get("X-Request-ID"); reqID != "" {
			req.Header.Set("X-Request-ID", reqID)
		}

		// Strip the /api/v1 prefix
		if strings.HasPrefix(req.URL.Path, "/api/v1") {
			req.URL.Path = strings.TrimPrefix(req.URL.Path, "/api/v1")
			if req.URL.Path == "" {
				req.URL.Path = "/"
			}
		}
	}

	p.targets[pathPrefix] = proxy
	return nil
}

func (p *Proxy) Handler(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path

	// Find the longest matching prefix for more accurate routing
	var bestPrefix string
	var bestProxy *httputil.ReverseProxy
	var bestTarget *url.URL

	for prefix, proxy := range p.targets {
		if strings.HasPrefix(path, prefix) {
			if len(prefix) > len(bestPrefix) {
				bestPrefix = prefix
				bestProxy = proxy
				bestTarget = p.targetURLs[prefix]
			}
		}
	}

	if bestProxy != nil {
		// Special handling for WebSocket upgrade requests
		if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") &&
			strings.Contains(strings.ToLower(r.Header.Get("Connection")), "upgrade") {

			log.Debug().
				Str("path", path).
				Str("target_prefix", bestPrefix).
				Msg("Upgrading WebSocket connection")

			if bestTarget != nil {
				p.handleWebSocket(w, r, bestTarget, path)
				return
			}

			http.Error(w, "target not found", http.StatusNotFound)
			return
		}

		log.Debug().Str("path", path).Str("prefix", bestPrefix).Msg("Proxying HTTP request")
		bestProxy.ServeHTTP(w, r)
		return
	}

	log.Warn().Str("path", path).Msg("No proxy target found")
	http.Error(w, "not found", http.StatusNotFound)
}

// handleWebSocket proxies WebSocket connections by:
// 1. Dialing the backend service
// 2. Upgrading the frontend connection
// 3. Copying data bidirectionally between connections
func (p *Proxy) handleWebSocket(w http.ResponseWriter, r *http.Request, target *url.URL, path string) {
	// Dial the backend WebSocket service
	backendURL := url.URL{
		Scheme:   "ws",
		Host:     target.Host,
		Path:     path,
		RawQuery: r.URL.RawQuery,
	}

	// If the original connection was wss, try wss backend too
	if r.Header.Get("X-Forwarded-Proto") == "https" || strings.HasPrefix(r.Host, "https") {
		backendURL.Scheme = "wss"
	}

	// Copy important headers to backend request
	header := make(http.Header)
	if origin := r.Header.Get("Origin"); origin != "" {
		header.Add("Origin", origin)
	}

	// Copy forwarded authentication headers
	if auth := r.Header.Get("Authorization"); auth != "" {
		header.Add("Authorization", auth)
	}
	if userID := r.Header.Get("X-User-ID"); userID != "" {
		header.Add("X-User-ID", userID)
	}
	if reqID := r.Header.Get("X-Request-ID"); reqID != "" {
		header.Add("X-Request-ID", reqID)
	}

	log.Debug().
		Str("backend_url", backendURL.String()).
		Msg("Dialing backend WebSocket")

	// Dial backend
	backend, _, err := p.wsDialer.Dial(backendURL.String(), header)
	if err != nil {
		log.Error().Err(err).
			Str("backend_url", backendURL.String()).
			Msg("Failed to dial backend WebSocket")
		http.Error(w, "failed to connect to backend", http.StatusBadGateway)
		return
	}
	defer backend.Close()

	// Upgrade frontend connection
	upgrader := websocket.Upgrader{
		ReadBufferSize:  4096,
		WriteBufferSize: 4096,
		CheckOrigin: func(r *http.Request) bool {
			// Allow all origins here; auth/validation already happened at gateway level
			return true
		},
	}

	frontend, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Error().Err(err).Msg("Failed to upgrade frontend WebSocket")
		backend.Close()
		return
	}
	defer frontend.Close()

	log.Info().
		Str("remote_addr", r.RemoteAddr).
		Str("path", path).
		Msg("WebSocket connection established")

	// Copy messages bidirectionally
	done := make(chan struct{})

	// Frontend -> Backend
	go func() {
		defer close(done)
		for {
			msgType, data, err := frontend.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Error().Err(err).Msg("Frontend WebSocket error")
				}
				return
			}
			if err := backend.WriteMessage(msgType, data); err != nil {
				log.Error().Err(err).Msg("Failed to write to backend")
				return
			}
		}
	}()

	// Backend -> Frontend
	go func() {
		for {
			msgType, data, err := backend.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Error().Err(err).Msg("Backend WebSocket error")
				}
				frontend.Close()
				return
			}
			if err := frontend.WriteMessage(msgType, data); err != nil {
				log.Error().Err(err).Msg("Failed to write to frontend")
				return
			}
		}
	}()

	<-done
	log.Debug().Str("remote_addr", r.RemoteAddr).Msg("WebSocket connection closed")
}
