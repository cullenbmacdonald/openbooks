package core

import (
	"errors"
	"testing"
	"time"
)

// TestOfferTimeoutFires verifies that a download request which gets no response
// reports ErrNoDownloadOffer instead of hanging — the fast-fail that lets a user
// retry a dead #ebooks server.
func TestOfferTimeoutFires(t *testing.T) {
	defer withOfferTimeout(50 * time.Millisecond)()

	erred := make(chan error, 1)
	c := &IrcClient{erred: func(e error) { erred <- e }}
	c.armOfferTimeout()

	select {
	case err := <-erred:
		if !errors.Is(err, ErrNoDownloadOffer) {
			t.Fatalf("got %v, want ErrNoDownloadOffer", err)
		}
	case <-time.After(time.Second):
		t.Fatal("offer timeout never fired")
	}
}

// TestOfferTimeoutDisarmed verifies that when the server responds (transfer
// starts or bad-server notice), the pending timeout does not also fire.
func TestOfferTimeoutDisarmed(t *testing.T) {
	defer withOfferTimeout(50 * time.Millisecond)()

	erred := make(chan error, 1)
	c := &IrcClient{erred: func(e error) { erred <- e }}
	c.armOfferTimeout()
	c.disarmOfferTimeout()

	select {
	case err := <-erred:
		t.Fatalf("disarmed timeout still fired: %v", err)
	case <-time.After(200 * time.Millisecond):
		// no spurious error — correct
	}
}

func withOfferTimeout(d time.Duration) func() {
	old := offerTimeout
	offerTimeout = d
	return func() { offerTimeout = old }
}
