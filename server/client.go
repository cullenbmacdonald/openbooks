package server

import (
	"context"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/evan-buss/openbooks/core"
	"github.com/google/uuid"

	"github.com/gorilla/websocket"
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer.
	maxMessageSize = 512
)

// upgrader is shared by every websocket handshake, so it must not be mutated
// per request — concurrent handshakes writing CheckOrigin is a data race.
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// OpenBooks is a single-user self-hosted app whose session cookie, not the
	// Origin header, decides who owns the connection.
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Client is a middleman between the websocket connection and the hub.
type Client struct {
	// Unique ID for the client
	uuid uuid.UUID

	// The websocket connection.
	conn *websocket.Conn

	// Signal to indicate the connection should be terminated.
	// disconnect chan struct{}

	// Message to send to the client ws connection
	send chan interface{}

	// Individual IRC book client per connected websocket client.
	bookClient *core.IrcClient

	log *log.Logger

	// Context is used to signal when this client should close.
	ctx context.Context

	// cancel cancels ctx, tearing down this client's IRC reader/reconnect loop.
	cancel context.CancelFunc

	// closeOnce makes close() idempotent. A client can be torn down from two
	// directions at once: its own read pump noticing the socket died, and the
	// server evicting it because the browser reconnected.
	closeOnce sync.Once
}

// close tears down the client's IRC connection and signals its pumps to stop.
// Safe to call multiple times and from multiple goroutines.
//
// Note that it deliberately does not close c.send. IRC event handlers run on
// their own goroutines and write to that channel, so closing it underneath them
// panics the process with "send on closed channel". Cancelling ctx stops the
// write pump just as well, and trySend keeps the producers from blocking on a
// channel nobody is draining any more.
func (c *Client) close() {
	c.closeOnce.Do(func() {
		c.cancel()
		// Tell the browser the connection is finished so it can reconnect
		// immediately rather than waiting for a read timeout. WriteControl is
		// the one write method gorilla documents as safe to call concurrently
		// with the write pump.
		c.conn.WriteControl(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
			time.Now().Add(writeWait),
		)
		c.bookClient.Disconnect()
		c.conn.Close()
	})
}

// trySend queues a message for the browser. It drops the message instead of
// blocking when the client is shutting down or the send buffer is full, so a
// disconnected browser can never wedge the IRC event handler that produced it.
func (c *Client) trySend(message interface{}) {
	select {
	case <-c.ctx.Done():
	case c.send <- message:
	default:
		c.log.Println("Send buffer full, dropping message.")
	}
}

// readPump pumps messages from the websocket connection to the hub.
//
// The application runs readPump in a per-connection goroutine. The application
// ensures that there is at most one reader on a connection by executing all
// reads from this goroutine.
func (server *server) readPump(c *Client) {
	defer server.unregisterClient(c)
	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error { c.conn.SetReadDeadline(time.Now().Add(pongWait)); return nil })
	for {
		select {
		case <-c.ctx.Done():
			return
		default:
			var request Request
			err := c.conn.ReadJSON(&request)

			if err != nil {
				c.log.Printf("Connection Closed: %v", err)
				return
			}

			c.log.Printf("%s Message Received\n", request.MessageType)

			server.routeMessage(request, c)
		}
	}
}

// writePump pumps messages from the hub to the websocket connection.
//
// A goroutine running writePump is started for each connection. The
// application ensures that there is at most one writer to a connection by
// executing all writes from this goroutine.
func (server *server) writePump(c *Client) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
	}()

	for {
		select {
		case message := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			err := c.conn.WriteJSON(message)
			if err != nil {
				c.log.Printf("Error writing JSON to websocket: %s\n", err)
				return
			}
		case <-c.ctx.Done():
			// close() sends the close frame; this pump just stops writing.
			return
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
