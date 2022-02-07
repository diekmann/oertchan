package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
)

type Store struct {
	mu      sync.Mutex
	content map[string]struct{}
}

func (s *Store) Add(e string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.content[e] = struct{}{}
}

func (s *Store) Remove(e string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.content, e)
}

func handler(w http.ResponseWriter, r *http.Request) {
	log.Printf("%s %s request to %s", r.Proto, r.Method, r.URL)
	if r.Method == "OPTIONS" {
		// preflight cors.
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "POST")
		return
	}
	if r.Method != "POST" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	ct, ok := r.Header["Content-Type"]
	if !ok {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintf(w, "Yo peasant, what about setting Content-Type?")
		return
	}
	if len(ct) != 1 {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintf(w, `got unexpected amount of Content-Type`)
		return
	}
	// echo -e 'POST /offer HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/jsonX\r\n\r\n"yolo"' | nc -v 127.0.0.1 8080
	if ct[0] != "application/json" {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintf(w, `want Content-Type "application/json"`)
		return
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	var body interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintf(w, "yo, invalid request: %v", err)
		return
	}
	v, err := json.Marshal(body)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintf(w, "invalid json request: %v", err)
		return
	}
	payload := string(v)

	// echo -e 'POST /offer HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 6\r\n\r\n"yolo"\r\n' | nc -v 127.0.0.1 8080
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"request": %q, "body":%s}`, r.URL.Path[1:], payload)
}

func main() {
	fmt.Println("Hello, world")
	http.HandleFunc("/offer", handler)
	log.Fatal(http.ListenAndServe(":8080", nil))
}
