package smtp

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	gosmtp "net/smtp"
	"time"

	"github.com/QosmuratSamat0/pairexx/notification-service/internal/domain"
)

// userPreferences is what GET /internal/users/{id}/preferences returns.
type userPreferences struct {
	Email                     string `json:"email"`
	EmailNotificationsEnabled bool   `json:"email_notifications_enabled"`
}

// Channel delivers HTML email via Gmail SMTP (port 587 / STARTTLS).
// It only acts on notifications of type "exchange_request".
type Channel struct {
	host           string
	port           int
	sender         string
	password       string
	userServiceURL string
	internalToken  string
	httpClient     *http.Client
}

// New constructs an SMTP Channel and immediately logs the resolved credentials
// so misconfigured values are visible at startup before any request arrives.
func New(host string, port int, sender, password, userServiceURL, internalToken string) *Channel {
	// ── Startup verification ─────────────────────────────────────────────────
	// Use stdlib log.Printf here so the lines are always visible in the console
	// regardless of the zerolog global level or ConsoleWriter configuration.
	log.Printf("[smtp-channel] host           = %s", host)
	log.Printf("[smtp-channel] port           = %d", port)
	log.Printf("[smtp-channel] sender         = %q", sender)
	log.Printf("[smtp-channel] password_len   = %d (empty=%v)", len(password), password == "")
	log.Printf("[smtp-channel] user_svc_url   = %s", userServiceURL)
	log.Printf("[smtp-channel] internal_token_set = %v", internalToken != "")

	if sender == "" {
		log.Printf("[smtp-channel] WARNING: SMTP_SENDER is empty — emails will fail at AUTH")
	}
	if password == "" {
		log.Printf("[smtp-channel] WARNING: SMTP_PASSWORD is empty — emails will fail at AUTH")
	}
	if userServiceURL == "" {
		log.Printf("[smtp-channel] WARNING: USER_SERVICE_URL is empty — preference lookups will fail")
	}

	return &Channel{
		host:           host,
		port:           port,
		sender:         sender,
		password:       password,
		userServiceURL: userServiceURL,
		internalToken:  internalToken,
		httpClient:     &http.Client{Timeout: 5 * time.Second},
	}
}

// Send dispatches an email for "exchange_request" notifications only.
// All other notification types are silently ignored (not an error).
func (c *Channel) Send(ctx context.Context, n domain.Notification) error {
	if n.Type != "exchange_request" && n.Type != "exchange_completed" && n.Type != "exchange_completion_triggered" {
		// Not our type — no-op, no log noise.
		return nil
	}

	log.Printf("[smtp] processing %s for user_id=%s", n.Type, n.UserID)

	prefs, err := c.fetchPreferences(ctx, n.UserID)
	if err != nil {
		log.Printf("[smtp] ERROR: could not fetch preferences for user %s: %v", n.UserID, err)
		return nil // best-effort — never block the caller
	}

	log.Printf("[smtp] preferences for user %s — email=%q notifications_enabled=%v",
		n.UserID, prefs.Email, prefs.EmailNotificationsEnabled)

	if !prefs.EmailNotificationsEnabled {
		log.Printf("[smtp] email notifications are OFF for user %s — skipping", n.UserID)
		return nil
	}

	if prefs.Email == "" {
		log.Printf("[smtp] WARNING: user %s has no email address — skipping", n.UserID)
		return nil
	}

	if n.Type == "exchange_completed" {
		subject := "Обмен успешно завершен!"
		body := buildExchangeCompletedHTML()
		log.Printf("[smtp] sending exchange_completed email to %q", prefs.Email)
		if err := c.sendMail(ctx, prefs.Email, subject, body); err != nil {
			log.Printf("[smtp] ERROR: failed to send email to %s: %v", prefs.Email, err)
			return nil
		}
		log.Printf("[smtp] OK: email delivered to %s", prefs.Email)
		return nil
	}

	if n.Type == "exchange_completion_triggered" {
		subject := "Партнер предлагает завершить обмен навыками"
		body := buildExchangeCompletionTriggeredHTML()
		log.Printf("[smtp] sending exchange_completion_triggered email to %q", prefs.Email)
		if err := c.sendMail(ctx, prefs.Email, subject, body); err != nil {
			log.Printf("[smtp] ERROR: failed to send email to %s: %v", prefs.Email, err)
			return nil
		}
		log.Printf("[smtp] OK: email delivered to %s", prefs.Email)
		return nil
	}

	fromName := extractStringPayload(n.Payload, "from_user_name")
	if fromName == "" {
		fromName = "A Pairexx member"
	}

	log.Printf("[smtp] sending exchange_request email to %q (from_name=%q)", prefs.Email, fromName)

	subject := "Новый запрос на обмен навыками — Pairexx"
	body := buildEmailHTML(fromName)

	if err := c.sendMail(ctx, prefs.Email, subject, body); err != nil {
		log.Printf("[smtp] ERROR: failed to send email to %s: %v", prefs.Email, err)
		return nil // best-effort — never block the caller
	}

	log.Printf("[smtp] OK: email delivered to %s", prefs.Email)
	return nil
}

// fetchPreferences calls the user-service internal API to get email + preference flag.
func (c *Channel) fetchPreferences(ctx context.Context, userID string) (*userPreferences, error) {
	url := fmt.Sprintf("%s/internal/users/%s/preferences", c.userServiceURL, userID)
	log.Printf("[smtp] fetching preferences: GET %s", url)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("X-Internal-Token", c.internalToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http GET %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("user-service returned HTTP %d: %s", resp.StatusCode, string(raw))
	}

	var prefs userPreferences
	if err := json.NewDecoder(resp.Body).Decode(&prefs); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	// Safety net: if the DB column is null/missing and JSON decoded it as false,
	// we cannot distinguish "explicitly disabled" from "no row found + zero value".
	// The repository already returns true for the no-row case, but guard here too.
	// (A zero Email AND false notifications almost certainly means no profile row.)
	if prefs.Email == "" && !prefs.EmailNotificationsEnabled {
		log.Printf("[smtp] preference response looks like a zero-value placeholder (email=%q enabled=%v) — defaulting to enabled=true",
			prefs.Email, prefs.EmailNotificationsEnabled)
		prefs.EmailNotificationsEnabled = true
	}

	return &prefs, nil
}

// sendMail opens a fresh SMTP session to Gmail on port 587 using STARTTLS,
// authenticates with PlainAuth, and delivers one message.
//
// The ctx controls the TCP dial deadline; individual SMTP steps also carry
// their own per-operation timeouts via SetDeadline so a stalled server cannot
// block the goroutine indefinitely.
func (c *Channel) sendMail(ctx context.Context, to, subject, htmlBody string) error {
	addr := fmt.Sprintf("%s:%d", c.host, c.port)
	log.Printf("[smtp] dialing %s …", addr)

	// Use DialContext so the TCP handshake respects the caller's context.
	dialer := &net.Dialer{Timeout: 15 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		log.Printf("[smtp] ERROR: TCP dial to %s failed: %v", addr, err)
		return fmt.Errorf("dial %s: %w", addr, err)
	}

	// Give each SMTP step at most 20 seconds individually.
	deadline := time.Now().Add(20 * time.Second)
	_ = conn.SetDeadline(deadline)

	client, err := gosmtp.NewClient(conn, c.host)
	if err != nil {
		conn.Close()
		log.Printf("[smtp] ERROR: SMTP client creation failed: %v", err)
		return fmt.Errorf("smtp new client: %w", err)
	}
	defer client.Quit()

	// ── STARTTLS ──────────────────────────────────────────────────────────────
	tlsCfg := &tls.Config{ServerName: c.host}
	if err := client.StartTLS(tlsCfg); err != nil {
		log.Printf("[smtp] ERROR: STARTTLS upgrade failed: %v", err)
		return fmt.Errorf("starttls: %w", err)
	}
	log.Printf("[smtp] STARTTLS OK")

	// ── AUTH ──────────────────────────────────────────────────────────────────
	auth := gosmtp.PlainAuth("", c.sender, c.password, c.host)
	if err := client.Auth(auth); err != nil {
		log.Printf("[smtp] ERROR: Gmail rejected PlainAuth for sender=%q — check the App Password in config.env: %v",
			c.sender, err)
		return fmt.Errorf("smtp auth: %w", err)
	}
	log.Printf("[smtp] AUTH OK (sender=%s)", c.sender)

	// ── Envelope ─────────────────────────────────────────────────────────────
	if err := client.Mail(c.sender); err != nil {
		log.Printf("[smtp] ERROR: MAIL FROM rejected: %v", err)
		return fmt.Errorf("MAIL FROM: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		log.Printf("[smtp] ERROR: RCPT TO %s rejected: %v", to, err)
		return fmt.Errorf("RCPT TO: %w", err)
	}

	// ── Body ──────────────────────────────────────────────────────────────────
	wc, err := client.Data()
	if err != nil {
		log.Printf("[smtp] ERROR: DATA command failed: %v", err)
		return fmt.Errorf("DATA: %w", err)
	}

	header := fmt.Sprintf(
		"From: Pairexx <%s>\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n",
		c.sender, to, subject,
	)

	var buf bytes.Buffer
	buf.WriteString(header)
	buf.WriteString(htmlBody)

	if _, err := io.Copy(wc, &buf); err != nil {
		log.Printf("[smtp] ERROR: writing message body failed: %v", err)
		return fmt.Errorf("write message body: %w", err)
	}
	if err := wc.Close(); err != nil {
		log.Printf("[smtp] ERROR: closing DATA writer failed: %v", err)
		return fmt.Errorf("close DATA writer: %w", err)
	}

	return nil
}

// buildEmailHTML returns a styled dark-mode HTML email for an exchange request.
func buildEmailHTML(senderName string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Новый запрос на обмен навыками</title>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:Inter,system-ui,sans-serif;">
  <table width="100%%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#18181b;border-radius:16px;border:1px solid rgba(255,255,255,0.05);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1d4ed8,#2563eb);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Pairexx</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Платформа обмена навыками</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 12px;color:#ffffff;font-size:20px;font-weight:600;">
                Новый запрос на обмен навыками
              </h2>
              <p style="margin:0 0 24px;color:#a1a1aa;font-size:15px;line-height:1.6;">
                <strong style="color:#e4e4e7;">%s</strong> хочет обменяться с вами навыками на платформе Pairexx.
              </p>
              <!-- CTA -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:10px;background:#2563eb;">
                    <a href="http://localhost:3000/dashboard"
                       style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:-0.2px;">
                      Просмотреть запрос →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;color:#71717a;font-size:13px;line-height:1.5;">
                Если вы не хотите получать email-уведомления, отключите их в настройках профиля на странице Dashboard.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.05);">
              <p style="margin:0;color:#52525b;font-size:12px;text-align:center;">
                © 2025 Pairexx · Это автоматическое уведомление
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`, senderName)
}

func buildExchangeCompletionTriggeredHTML() string {
	return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Подтвердите завершение обмена</title>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#18181b;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">
          <tr>
            <td style="background:#1d4ed8;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Pairexx</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.78);font-size:13px;">Завершение обмена</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 12px;color:#ffffff;font-size:21px;font-weight:700;">Партнер предлагает завершить обмен</h2>
              <p style="margin:0 0 24px;color:#a1a1aa;font-size:15px;line-height:1.6;">
                Ваш партнер предлагает завершить обмен навыками! Пожалуйста, зайдите в чат и подтвердите завершение.
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:10px;background:#2563eb;">
                    <a href="http://localhost:3000/dashboard/chats" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">
                      Перейти в чат
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;color:#52525b;font-size:12px;text-align:center;">Pairexx automatic notification</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

func buildExchangeCompletedHTML() string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Skill exchange completed</title>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#18181b;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">
          <tr>
            <td style="background:#0f766e;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Pairexx</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.78);font-size:13px;">Skill exchange completed</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 12px;color:#ffffff;font-size:21px;font-weight:700;">You finished a skill exchange!</h2>
              <p style="margin:0 0 24px;color:#a1a1aa;font-size:15px;line-height:1.6;">
                Both participants confirmed the exchange as complete. Thanks for learning together on Pairexx.
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:10px;background:#2563eb;">
                    <a href="http://localhost:3000/dashboard" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">
                      Open dashboard
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;color:#71717a;font-size:13px;line-height:1.5;">
                Keep building your learning streak by starting another exchange from the dashboard.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;color:#52525b;font-size:12px;text-align:center;">Pairexx automatic notification</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// extractStringPayload safely reads a string value from the notification payload map.
func extractStringPayload(payload map[string]any, key string) string {
	if payload == nil {
		return ""
	}
	v, ok := payload[key]
	if !ok {
		return ""
	}
	s, _ := v.(string)
	return s
}
