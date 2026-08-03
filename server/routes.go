package server

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/evan-buss/openbooks/core"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

//go:embed app/dist
var reactClient embed.FS

func (server *server) registerRoutes() *chi.Mux {
	router := chi.NewRouter()
	router.Use(server.ensureSession)
	router.Handle("/*", server.staticFilesHandler("app/dist"))
	router.Get("/ws", server.serveWs())
	router.Get("/stats", server.statsHandler())
	router.Get("/servers", server.serverListHandler())

	router.Group(func(r chi.Router) {
		r.Use(server.requireUser)
		r.Get("/library", server.getAllBooksHandler())
		r.Delete("/library/{fileName}", server.deleteBooksHandler())
		r.Get("/library/*", server.getBookHandler())
	})

	return router
}

// serveWs handles websocket requests from the peer.
func (server *server) serveWs() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// ensureSession guarantees a session on the context and refreshes the
		// cookie here so an actively used session keeps sliding forward.
		session := getUUID(r.Context())
		if session == uuid.Nil {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		http.SetCookie(w, server.sessionCookie(session, r))

		conn, err := upgrader.Upgrade(w, r, w.Header())
		if err != nil {
			server.log.Println(err)
			return
		}

		ctx, cancel := context.WithCancel(context.Background())
		client := &Client{
			conn:       conn,
			send:       make(chan interface{}, 128),
			uuid:       session,
			bookClient: core.NewIrcClient(server.config.UserName, server.config.UserAgent, filepath.Join(server.config.DownloadDir, "books")),
			log:        log.New(os.Stdout, fmt.Sprintf("CLIENT (%s): ", server.config.UserName), log.LstdFlags|log.Lmsgprefix),
			ctx:        ctx,
			cancel:     cancel,
		}

		previous, err := server.registerClient(client)
		if err != nil {
			server.log.Printf("Refusing connection from %s: %s\n", conn.RemoteAddr().String(), err)
			// Tell the browser why before hanging up. Nothing was registered
			// and no pumps were started, so this is the whole teardown.
			conn.WriteControl(
				websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.ClosePolicyViolation, err.Error()),
				time.Now().Add(writeWait),
			)
			cancel()
			conn.Close()
			return
		}

		if previous != nil {
			server.log.Println("Browser reconnected. Replacing the previous connection for this session.")
			previous.close()
		}

		server.log.Printf("Client connected from %s\n", conn.RemoteAddr().String())
		client.log.Println("New client created.")

		go server.writePump(client)
		go server.readPump(client)
	}
}

func (server *server) staticFilesHandler(assetPath string) http.Handler {
	// update the embedded file system's tree so that index.html is at the root
	app, err := fs.Sub(reactClient, assetPath)
	if err != nil {
		server.log.Println(err)
	}

	// strip the predefined base path and serve the static file
	return http.StripPrefix(server.config.Basepath, http.FileServer(http.FS(app)))
}

func (server *server) statsHandler() http.HandlerFunc {
	type statsReponse struct {
		UUID string `json:"uuid"`
		IP   string `json:"ip"`
		Name string `json:"name"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		clients := server.connectedClients()
		result := make([]statsReponse, 0, len(clients))

		for _, client := range clients {
			details := statsReponse{
				UUID: client.uuid.String(),
				Name: client.bookClient.Username(),
				IP:   client.conn.RemoteAddr().String(),
			}

			result = append(result, details)
		}

		json.NewEncoder(w).Encode(result)
	}
}

func (server *server) serverListHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(server.repository.Servers())
	}
}

func (server *server) getAllBooksHandler() http.HandlerFunc {
	type download struct {
		Name         string    `json:"name"`
		DownloadLink string    `json:"downloadLink"`
		Time         time.Time `json:"time"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		if !server.config.Persist {
			w.WriteHeader(http.StatusNotFound)
			return
		}

		libraryDir := filepath.Join(server.config.DownloadDir, "books")
		books, err := os.ReadDir(libraryDir)
		if err != nil {
			server.log.Printf("Unable to list books. %s\n", err)
		}

		output := make([]download, 0)
		for _, book := range books {
			if book.IsDir() || strings.HasPrefix(book.Name(), ".") || filepath.Ext(book.Name()) == ".temp" {
				continue
			}

			info, err := book.Info()
			if err != nil {
				server.log.Println(err)
			}

			dl := download{
				Name:         book.Name(),
				DownloadLink: path.Join("library", book.Name()),
				Time:         info.ModTime(),
			}

			output = append(output, dl)
		}

		w.Header().Add("Content-Type", "application/json")
		json.NewEncoder(w).Encode(output)
	}
}

func (server *server) getBookHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		_, fileName := path.Split(r.URL.Path)
		bookPath := filepath.Join(server.config.DownloadDir, "books", fileName)

		http.ServeFile(w, r, bookPath)

		if !server.config.Persist {
			err := os.Remove(bookPath)
			if err != nil {
				server.log.Printf("Error when deleting book file. %s", err)
			}
		}
	}
}

func (server *server) deleteBooksHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fileName, err := url.PathUnescape(chi.URLParam(r, "fileName"))
		if err != nil {
			server.log.Printf("Error unescaping path: %s\n", err)
			w.WriteHeader(http.StatusInternalServerError)
		}

		err = os.Remove(filepath.Join(server.config.DownloadDir, "books", fileName))
		if err != nil {
			server.log.Printf("Error deleting book file: %s\n", err)
			w.WriteHeader(http.StatusInternalServerError)
		}
	}
}
