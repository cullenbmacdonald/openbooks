package dcc

import (
	"encoding/binary"
	"errors"
	"io"
	"net"
	"regexp"
	"strconv"
	"time"
)

// dialTimeout bounds how long we wait to establish the DCC connection.
const dialTimeout = 45 * time.Second

// queueTimeout bounds how long we wait for the *first* byte. IRC Highway bots
// commonly accept the connection immediately but then queue you, sending no
// bytes until your slot opens. That wait is normal and can be long, so this
// deadline only needs to be generous enough to outlast a typical queue.
const queueTimeout = 20 * time.Minute

// idleTimeout is the maximum time to wait for more data once the transfer has
// actually started. It is reset after every successful read, so it only fires
// when a sender stalls mid-transfer rather than limiting the total duration.
// It can be short because a healthy sender, once sending, never goes quiet for
// long — the long silence we must tolerate is the pre-first-byte queue wait,
// handled separately by queueTimeout.
const idleTimeout = 60 * time.Second

// There are two types of DCC strings this program accepts.
// Download contains all of the necessary DCC info parsed from the DCC SEND string

var (
	ErrInvalidDCCString = errors.New("invalid dcc send string")
	ErrInvalidIP        = errors.New("unable to convert int IP to string")
	ErrMissingBytes     = errors.New("download size didn't match dcc file size. data could be missing")
)

var dccRegex = regexp.MustCompile(`DCC SEND "?(.+[^"])"?\s(\d+)\s+(\d+)\s+(\d+)\s*`)

type Download struct {
	Filename string
	IP       string
	Port     string
	Size     int64
}

// ParseString parses the important data of a DCC SEND string
func ParseString(text string) (*Download, error) {
	groups := dccRegex.FindStringSubmatch(text)

	if len(groups) == 0 {
		return nil, ErrInvalidDCCString
	}

	ip, err := stringToIP(groups[2])
	if err != nil {
		return nil, err
	}

	size, err := strconv.ParseInt(groups[4], 10, 64)
	if err != nil {
		return nil, err
	}

	return &Download{
		Filename: groups[1],
		IP:       ip,
		Port:     groups[3],
		Size:     size,
	}, nil
}

// Download writes the data contained in the DCC Download
func (download Download) Download(writer io.Writer) error {
	conn, err := net.DialTimeout("tcp", download.IP+":"+download.Port, dialTimeout)
	if err != nil {
		return err
	}
	defer conn.Close()

	// NOTE: Not using the idiomatic io.Copy or io.CopyBuffer because they are
	// much slower in real world tests than the manual way. I suspect it has to
	// do with the way the DCC server is sending data. I don't think it ever sends
	// an EOF like the io.* methods expect.

	// Benchmark: 2.36MB File
	// CopyBuffer - 4096 - 2m32s, 2m18s, 2m32s
	// Copy - 2m35s
	// Custom - 1024 - 35s
	// Custom - 4096 - 46s, 14s
	received := 0
	bytes := make([]byte, 4096)
	for int64(received) < download.Size {
		// Before any bytes arrive we may be sitting in the sender's queue, which
		// is normal and can last many minutes; afterwards a long silence means a
		// stalled transfer. Use the generous queue deadline until the first byte,
		// then the tight idle deadline so a real stall fails fast.
		timeout := idleTimeout
		if received == 0 {
			timeout = queueTimeout
		}
		if err := conn.SetReadDeadline(time.Now().Add(timeout)); err != nil {
			return err
		}

		n, err := conn.Read(bytes)
		if err != nil {
			return err
		}

		_, err = writer.Write(bytes[:n])
		if err != nil {
			return err
		}
		received += n
	}

	if int64(received) != download.Size {
		return ErrMissingBytes
	}

	return nil
}

// Convert a given 32 bit IP integer to an IP string
// Ex) 2907707975 -> 192.168.1.1
func stringToIP(nn string) (string, error) {
	temp, err := strconv.ParseUint(nn, 10, 32)
	if err != nil {
		return "", ErrInvalidIP
	}
	intIP := uint32(temp)

	ip := make(net.IP, 4)
	binary.BigEndian.PutUint32(ip, intIP)
	return ip.String(), nil
}
