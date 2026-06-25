package core

import (
	"context"
	"net"
	"testing"
	"time"
)

// TestAutoReconnect verifies that when the IRC link drops, the client
// re-establishes it on its own — the behavior every interface (web, CLI,
// Discord) relies on to stay connected without intervention.
func TestAutoReconnect(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer ln.Close()

	accepts := make(chan net.Conn, 4)
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			accepts <- conn
		}
	}()

	client := NewIrcClient("tester", "OpenBooks test", t.TempDir())
	if err := client.Connect(ln.Addr().String(), false); err != nil {
		t.Fatalf("initial connect: %v", err)
	}

	reconnected := make(chan struct{}, 1)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	client.StartReader(ctx, Handlers{
		Reconnected: func() { reconnected <- struct{}{} },
	})

	// Drop the first connection to simulate a lost link.
	select {
	case conn := <-accepts:
		conn.Close()
	case <-time.After(5 * time.Second):
		t.Fatal("server never received the initial connection")
	}

	// The client should reconnect on its own.
	select {
	case conn := <-accepts:
		defer conn.Close()
	case <-time.After(15 * time.Second):
		t.Fatal("client did not reconnect after the link dropped")
	}

	select {
	case <-reconnected:
	case <-time.After(5 * time.Second):
		t.Fatal("Reconnected callback was not invoked")
	}
}
