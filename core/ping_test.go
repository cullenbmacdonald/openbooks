package core

import (
	"bufio"
	"context"
	"net"
	"testing"
	"time"

	"github.com/evan-buss/openbooks/irc"
)

// TestPongEchoesToken drives the real reader + Ping handler over an in-memory
// pipe and asserts we reply to "PING :<token>" with "PONG :<token>" using the
// exact token the server sent. Replying with anything else (e.g. a fixed server
// address) fails the server's ping check and drops the IRC link.
func TestPongEchoesToken(t *testing.T) {
	serverSide, clientSide := net.Pipe()
	defer serverSide.Close()
	defer clientSide.Close()

	client := &IrcClient{
		Conn:       &irc.Conn{Conn: clientSide},
		serverName: "irc.irchighway.net:6697",
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	client.StartReader(ctx, Handlers{})

	serverSide.SetDeadline(time.Now().Add(2 * time.Second))

	if _, err := serverSide.Write([]byte("PING :abc123\r\n")); err != nil {
		t.Fatalf("writing PING: %v", err)
	}

	reply, err := bufio.NewReader(serverSide).ReadString('\n')
	if err != nil {
		t.Fatalf("reading PONG: %v", err)
	}

	if got, want := reply, "PONG :abc123\r\n"; got != want {
		t.Fatalf("PONG mismatch:\n got: %q\nwant: %q", got, want)
	}
}
