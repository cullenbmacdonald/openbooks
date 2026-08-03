package server

import (
	"context"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

type userCtxKeyType string
type uuidCtxKeyType string

const (
	userCtxKey userCtxKeyType = "user-client"
	uuidCtxKey uuidCtxKeyType = "user-uuid"

	// sessionCookieName identifies the browser session that owns an IRC
	// connection and its downloaded books.
	sessionCookieName = "OpenBooks"

	// sessionDuration is how long an idle session stays valid. It is refreshed
	// whenever the browser opens a websocket, so an active session never
	// expires out from under the user.
	sessionDuration = time.Hour * 24 * 30
)

// ensureSession resolves the caller's session from the OpenBooks cookie and
// mints a new one when it is missing or unparseable.
//
// The session has to be established here, on ordinary HTTP responses, rather
// than on the websocket handshake. Browsers do not reliably persist a
// Set-Cookie delivered with a 101 Switching Protocols response, so a session
// that only ever existed on the handshake would vanish on the next page load
// and every /library request would come back 401.
//
// The resolved UUID is put on the request context so handlers running during
// the very first request — before the browser has echoed the cookie back — see
// the same identity that was just handed out.
func (server *server) ensureSession(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		session, ok := readSessionID(r)
		if !ok {
			session = uuid.New()
			http.SetCookie(w, server.sessionCookie(session, r))
		}

		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), uuidCtxKey, session)))
	})
}

// requireUser rejects requests that reached a handler without a session. With
// ensureSession installed this should never trigger; it stays as a guard so
// session-scoped handlers can't be mounted without one.
func (server *server) requireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if getUUID(r.Context()) == uuid.Nil {
			server.log.Println("Request reached a session-scoped handler with no session.")
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// readSessionID parses the session UUID out of the request's cookie.
func readSessionID(r *http.Request) (uuid.UUID, bool) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		return uuid.Nil, false
	}

	session, err := uuid.Parse(cookie.Value)
	if err != nil {
		return uuid.Nil, false
	}

	return session, true
}

// sessionCookie builds the session cookie for a request.
func (server *server) sessionCookie(session uuid.UUID, r *http.Request) *http.Cookie {
	path := server.config.Basepath
	if path == "" {
		path = "/"
	}

	return &http.Cookie{
		Name:  sessionCookieName,
		Value: session.String(),
		// Scope the cookie to the whole app. Without an explicit path the
		// browser derives one from the request URI, which breaks as soon as
		// OpenBooks is mounted under a --basepath.
		Path:   path,
		MaxAge: int(sessionDuration.Seconds()),
		// Secure can only be set when the browser reached us over HTTPS;
		// setting it on a plain http:// origin makes the browser drop the
		// cookie entirely.
		Secure:   isSecureRequest(r),
		HttpOnly: true,
		// Lax rather than Strict: Strict withholds the cookie on any top-level
		// navigation that originated elsewhere, so following a link or a
		// bookmark into OpenBooks presents as a logged-out session even though
		// the cookie is sitting right there in the jar.
		SameSite: http.SameSiteLaxMode,
	}
}

// isSecureRequest reports whether the browser reached the server over HTTPS,
// accounting for the common case of a TLS-terminating reverse proxy.
func isSecureRequest(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}

	proto := r.Header.Get("X-Forwarded-Proto")
	if index := strings.Index(proto, ","); index != -1 {
		proto = proto[:index]
	}

	return strings.EqualFold(strings.TrimSpace(proto), "https")
}

// getClient should only be called when requireUser is in the middleware chain.
func (server *server) getClient(ctx context.Context) *Client {

	user := getUUID(ctx)
	if user == uuid.Nil {
		return nil
	}

	server.clientsMutex.RLock()
	defer server.clientsMutex.RUnlock()

	if client, ok := server.clients[user]; ok {
		return client
	}

	return nil
}

func getUUID(ctx context.Context) uuid.UUID {
	uid, ok := ctx.Value(uuidCtxKey).(uuid.UUID)
	if !ok {
		log.Println("Unable to find user.")
		return uuid.Nil
	}
	return uid
}
