package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

func newTestServer(t *testing.T) (*server, *httptest.Server) {
	t.Helper()

	srv := New(Config{
		Basepath:    "/",
		DownloadDir: t.TempDir(),
		UserName:    "tester",
		UserAgent:   "OpenBooks Test",
	})

	httpServer := httptest.NewServer(srv.registerRoutes())
	t.Cleanup(httpServer.Close)

	return srv, httpServer
}

func sessionCookieFrom(resp *http.Response) *http.Cookie {
	for _, cookie := range resp.Cookies() {
		if cookie.Name == sessionCookieName {
			return cookie
		}
	}
	return nil
}

func TestSessionCookieIssuedOnOrdinaryRequest(t *testing.T) {
	_, httpServer := newTestServer(t)

	// A browser must get its session from a normal response. Browsers don't
	// reliably persist a Set-Cookie delivered on a 101 handshake, so a session
	// that only existed there would disappear on the next page load.
	resp, err := http.Get(httpServer.URL + "/servers")
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	cookie := sessionCookieFrom(resp)
	if cookie == nil {
		t.Fatal("no session cookie was issued")
	}

	if _, err := uuid.Parse(cookie.Value); err != nil {
		t.Errorf("session cookie is not a UUID: %v", err)
	}
	if cookie.Path != "/" {
		t.Errorf("Path = %q, want %q", cookie.Path, "/")
	}
	if !cookie.HttpOnly {
		t.Error("cookie should be HttpOnly")
	}
	if cookie.SameSite != http.SameSiteLaxMode {
		t.Errorf("SameSite = %v, want Lax", cookie.SameSite)
	}
	if cookie.MaxAge <= 0 {
		t.Errorf("MaxAge = %d, want a positive lifetime", cookie.MaxAge)
	}
	if cookie.Secure {
		t.Error("cookie must not be Secure over plain http, or the browser drops it")
	}
}

func TestSessionCookieScopedToBasepath(t *testing.T) {
	srv := New(Config{Basepath: "/openbooks/", DownloadDir: t.TempDir()})

	cookie := srv.sessionCookie(uuid.New(), httptest.NewRequest(http.MethodGet, "/openbooks/ws", nil))

	// Without an explicit Path the browser derives one from the request URI,
	// which scopes the session to the wrong subtree under a basepath.
	if cookie.Path != "/openbooks/" {
		t.Errorf("Path = %q, want %q", cookie.Path, "/openbooks/")
	}
}

func TestSessionCookieSecureBehindTLSProxy(t *testing.T) {
	srv := New(Config{Basepath: "/", DownloadDir: t.TempDir()})

	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("X-Forwarded-Proto", "https, http")

	if !srv.sessionCookie(uuid.New(), request).Secure {
		t.Error("cookie should be Secure when the browser reached us over https")
	}
}

func TestExistingSessionIsPreserved(t *testing.T) {
	_, httpServer := newTestServer(t)

	existing := uuid.New()
	request, err := http.NewRequest(http.MethodGet, httpServer.URL+"/servers", nil)
	if err != nil {
		t.Fatalf("building request: %v", err)
	}
	request.AddCookie(&http.Cookie{Name: sessionCookieName, Value: existing.String()})

	resp, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if cookie := sessionCookieFrom(resp); cookie != nil && cookie.Value != existing.String() {
		t.Errorf("session was rotated to %s, want %s", cookie.Value, existing)
	}
}

func TestLibraryIsReachableOnFirstRequest(t *testing.T) {
	srv, httpServer := newTestServer(t)
	srv.config.Persist = true

	// The session is minted by the same request that needs it, so a browser
	// must not get a 401 before it has echoed a cookie back.
	resp, err := http.Get(httpServer.URL + "/library")
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want %d", resp.StatusCode, http.StatusOK)
	}
}

// dialWebsocket opens a websocket connection carrying the given session.
func dialWebsocket(t *testing.T, httpServer *httptest.Server, session uuid.UUID) (*websocket.Conn, *http.Response, error) {
	t.Helper()

	header := http.Header{}
	header.Set("Cookie", (&http.Cookie{Name: sessionCookieName, Value: session.String()}).String())

	url := "ws" + strings.TrimPrefix(httpServer.URL, "http") + "/ws"
	return websocket.DefaultDialer.Dial(url, header)
}

func TestReconnectingBrowserReplacesItsOwnConnection(t *testing.T) {
	srv, httpServer := newTestServer(t)
	session := uuid.New()

	first, _, err := dialWebsocket(t, httpServer, session)
	if err != nil {
		t.Fatalf("first connection failed: %v", err)
	}
	defer first.Close()

	// A refresh races the previous connection, which usually isn't reaped
	// until its read deadline expires up to a minute later. The reconnect has
	// to win, otherwise the user is locked out of their own session.
	second, _, err := dialWebsocket(t, httpServer, session)
	if err != nil {
		t.Fatalf("reconnect was rejected: %v", err)
	}
	defer second.Close()

	waitFor(t, func() bool { return len(srv.connectedClients()) == 1 })

	clients := srv.connectedClients()
	if clients[0].uuid != session {
		t.Errorf("registered session = %s, want %s", clients[0].uuid, session)
	}

	// The stale connection should have been closed rather than left dangling.
	first.SetReadDeadline(time.Now().Add(5 * time.Second))
	if _, _, err := first.ReadMessage(); err == nil {
		t.Error("the replaced connection is still open")
	}
}

func TestSecondSessionIsRefusedWhileOneIsConnected(t *testing.T) {
	srv, httpServer := newTestServer(t)

	first, _, err := dialWebsocket(t, httpServer, uuid.New())
	if err != nil {
		t.Fatalf("first connection failed: %v", err)
	}
	defer first.Close()

	waitFor(t, func() bool { return len(srv.connectedClients()) == 1 })

	// OpenBooks multiplexes a single IRC connection, so a different browser
	// has to wait its turn.
	second, _, err := dialWebsocket(t, httpServer, uuid.New())
	if err == nil {
		defer second.Close()
		second.SetReadDeadline(time.Now().Add(5 * time.Second))
		if _, _, err := second.ReadMessage(); err == nil {
			t.Fatal("a second session was allowed to connect")
		}
	}

	if got := len(srv.connectedClients()); got != 1 {
		t.Errorf("connected clients = %d, want 1", got)
	}
}

func TestDisconnectFreesTheSlotForAnotherSession(t *testing.T) {
	srv, httpServer := newTestServer(t)

	first, _, err := dialWebsocket(t, httpServer, uuid.New())
	if err != nil {
		t.Fatalf("first connection failed: %v", err)
	}
	waitFor(t, func() bool { return len(srv.connectedClients()) == 1 })

	first.Close()
	waitFor(t, func() bool { return len(srv.connectedClients()) == 0 })

	second, _, err := dialWebsocket(t, httpServer, uuid.New())
	if err != nil {
		t.Fatalf("a new session could not connect after the previous one left: %v", err)
	}
	defer second.Close()
}

func waitFor(t *testing.T, condition func() bool) {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}

	t.Fatal("timed out waiting for the server to reach the expected state")
}
