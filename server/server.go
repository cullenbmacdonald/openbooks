package server

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"github.com/evan-buss/openbooks/discord"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/rs/cors"
)

type server struct {
	// Shared app configuration
	config *Config

	// Shared data
	repository *Repository

	// clientsMutex guards clients. The map is mutated when websocket
	// connections come and go and read from unrelated HTTP handler goroutines
	// (/ws, /stats, /library), so every access has to hold it. Reading a map
	// while another goroutine writes it is a data race that can hand back
	// garbage or panic the whole process with "concurrent map read and map
	// write".
	clientsMutex sync.RWMutex

	// Registered clients, keyed by the browser's session UUID.
	clients map[uuid.UUID]*Client

	log *log.Logger

	// Mutex to guard the lastSearch timestamp
	lastSearchMutex sync.Mutex

	// The time the last search was performed. Used to rate limit searches.
	lastSearch time.Time
}

// errSessionBusy is returned when a different browser session already holds the
// single shared IRC connection.
var errSessionBusy = errors.New("another session is already connected")

// Config contains settings for server
type Config struct {
	Log                     bool
	Port                    string
	UserName                string
	Persist                 bool
	DownloadDir             string
	Basepath                string
	Server                  string
	EnableTLS               bool
	SearchTimeout           time.Duration
	SearchBot               string
	DisableBrowserDownloads bool
	UserAgent               string

	// Discord bot (optional). When both DiscordToken and DiscordGuildID are
	// set, a Discord bot runs alongside the web server.
	DiscordToken   string
	DiscordGuildID string
	Debug          bool
}

func New(config Config) *server {
	return &server{
		repository: NewRepository(),
		config:     &config,
		clients:    make(map[uuid.UUID]*Client),
		log:        log.New(os.Stdout, "SERVER: ", log.LstdFlags|log.Lmsgprefix),
	}
}

// Start instantiates the web server and opens the browser
func Start(config Config) {
	createBooksDirectory(config)
	router := chi.NewRouter()
	router.Use(middleware.RequestID)
	router.Use(middleware.RealIP)
	router.Use(middleware.Recoverer)

	corsConfig := cors.Options{
		AllowCredentials: true,
		AllowedOrigins:   []string{"http://127.0.0.1:5173"},
		AllowedHeaders:   []string{"*"},
		AllowedMethods:   []string{"GET", "DELETE"},
	}
	router.Use(cors.New(corsConfig).Handler)

	server := New(config)
	routes := server.registerRoutes()

	ctx, cancel := context.WithCancel(context.Background())
	go server.startClientHub(ctx)
	server.startDiscordBot(ctx)
	server.registerGracefulShutdown(cancel)
	router.Mount(config.Basepath, routes)

	server.log.Printf("Base Path: %s\n", config.Basepath)
	server.log.Printf("OpenBooks is listening on port %v", config.Port)
	server.log.Printf("Download Directory: %s\n", config.DownloadDir)
	server.log.Printf("Open http://localhost:%v%s in your browser.", config.Port, config.Basepath)
	server.log.Fatal(http.ListenAndServe(":"+config.Port, router))
}

// The client hub is to be run in a goroutine. It tears every client down when
// the server shuts down.
func (server *server) startClientHub(ctx context.Context) {
	<-ctx.Done()
	for _, client := range server.connectedClients() {
		server.unregisterClient(client)
	}
}

// registerClient claims the single connection slot for the client's session.
//
// A browser that reconnects (page refresh, wake from sleep, flaky network)
// races its own previous connection: the old socket usually isn't reaped until
// its read deadline expires, up to pongWait later. Rejecting the new
// connection in that window locks the user out of their own session and looks
// exactly like being logged out, so the newest connection wins and the stale
// one is returned to the caller for teardown.
//
// A connection from a *different* session is still refused, because all
// clients share one IRC link.
func (server *server) registerClient(client *Client) (*Client, error) {
	server.clientsMutex.Lock()
	defer server.clientsMutex.Unlock()

	for session := range server.clients {
		if session != client.uuid {
			return nil, errSessionBusy
		}
	}

	previous := server.clients[client.uuid]
	server.clients[client.uuid] = client
	return previous, nil
}

// unregisterClient tears the client down and drops it from the registry.
//
// It deliberately does nothing to the registry when the session has already
// been handed to a newer connection, so a slow disconnect can't evict its own
// replacement. Tearing down the client itself is idempotent.
func (server *server) unregisterClient(client *Client) {
	server.clientsMutex.Lock()
	if current, ok := server.clients[client.uuid]; ok && current == client {
		delete(server.clients, client.uuid)
	}
	server.clientsMutex.Unlock()

	client.close()
}

// connectedClients returns a snapshot of the currently registered clients.
func (server *server) connectedClients() []*Client {
	server.clientsMutex.RLock()
	defer server.clientsMutex.RUnlock()

	clients := make([]*Client, 0, len(server.clients))
	for _, client := range server.clients {
		clients = append(clients, client)
	}
	return clients
}

func (server *server) registerGracefulShutdown(cancel context.CancelFunc) {
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-c
		server.log.Println("Graceful shutdown.")
		// Close the shutdown channel. Triggering all reader/writer WS handlers to close.
		cancel()
		time.Sleep(time.Second)
		os.Exit(0)
	}()
}

// startDiscordBot launches the Discord bot alongside the web server when a
// token and guild are configured. It connects with a distinct IRC nick to avoid
// colliding with the web server's per-browser connections, and shares the same
// download directory and search rate limit.
func (server *server) startDiscordBot(ctx context.Context) {
	cfg := server.config
	if cfg.DiscordToken == "" || cfg.DiscordGuildID == "" {
		return
	}

	discordCfg := discord.Config{
		Token:       cfg.DiscordToken,
		GuildID:     cfg.DiscordGuildID,
		DownloadDir: cfg.DownloadDir,
		RateLimit:   cfg.SearchTimeout,
		Debug:       cfg.Debug,
		Log:         cfg.Log,
		UserName:    cfg.UserName + "-bot",
		Server:      cfg.Server,
		EnableTLS:   cfg.EnableTLS,
		SearchBot:   cfg.SearchBot,
		Version:     cfg.UserAgent,
	}

	go func() {
		if err := discord.Run(ctx, discordCfg); err != nil {
			server.log.Printf("Discord bot stopped: %v", err)
		}
	}()
}

func createBooksDirectory(config Config) {
	err := os.MkdirAll(filepath.Join(config.DownloadDir, "books"), os.FileMode(0755))
	if err != nil {
		panic(err)
	}
}
