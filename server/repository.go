package server

import (
	"sync"

	"github.com/evan-buss/openbooks/core"
)

// Repository holds data shared across every connected client.
//
// The IRC reader goroutine publishes into it while HTTP handlers read from it,
// so access goes through the accessors below rather than touching the fields
// directly. Reading the server list while it was being replaced produced a
// torn slice header, which could hand a request garbage or panic the process.
type Repository struct {
	mutex   sync.RWMutex
	servers core.IrcServers
}

func NewRepository() *Repository {
	return &Repository{servers: core.IrcServers{}}
}

// SetServers records the most recently parsed IRC server list.
func (r *Repository) SetServers(servers core.IrcServers) {
	r.mutex.Lock()
	defer r.mutex.Unlock()
	r.servers = servers
}

// Servers returns a copy of the IRC server list that stays stable while a
// response is being encoded, even if the reader goroutine publishes a new one.
func (r *Repository) Servers() core.IrcServers {
	r.mutex.RLock()
	defer r.mutex.RUnlock()

	return core.IrcServers{
		ElevatedUsers: append([]string(nil), r.servers.ElevatedUsers...),
		RegularUsers:  append([]string(nil), r.servers.RegularUsers...),
	}
}
