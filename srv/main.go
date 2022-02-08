package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"sync"
)

type Store struct {
	mu      sync.Mutex
	content map[string]struct {
		value  string
		notify chan<- string
	}
}

func (s *Store) Add(k string, v string) <-chan string {
	s.mu.Lock()
	defer s.mu.Unlock()

	ch := make(chan string)
	s.content[k] = struct {
		value  string
		notify chan<- string
	}{
		value:  v,
		notify: ch,
	}
	return ch
}

func (s *Store) Remove(k string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.content, k)
    //TODO: close chan?
}

func handler(w http.ResponseWriter, r *http.Request) {
	log.Printf("%s %s request to %s", r.Proto, r.Method, r.URL)
	ctx := r.Context()

	if err := corsPost(w, r); err != nil {
		return
	}

	var body struct {
		Uid   string
		Offer interface{}
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, fmt.Sprintf("yo, invalid request: %v", err), http.StatusBadRequest) // leaks data!!
		return
	}
	offer, err := json.Marshal(body.Offer)
	if err != nil {
		http.Error(w, fmt.Sprintf("invalid json request: %v", err), http.StatusBadRequest) // leaks data!!
		return
	}
	_ = string(offer)

	// echo -e 'POST /offer HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 6\r\n\r\n"yolo"\r\n' | nc -v 127.0.0.1 8080
	// echo -e 'POST /offer HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 28\r\n\r\n{"uid":"yolo","offer":"lol"}\r\n' | nc -v 127.0.0.1 8080
	w.Header().Set("Content-Type", "application/json")
	//fmt.Fprintf(w, `{"request": %q, "body":%s}`, r.URL.Path[1:], payload)
	select {
	case <-ctx.Done():
		log.Printf("ctx.Done (client closed connection)")
		return
	}
}

func main() {
	fmt.Println("Hello, world")
	http.HandleFunc("/offer", handler)
	log.Fatal(http.ListenAndServe(":8080", nil))
}

var stop = errors.New("stop")

func corsPost(w http.ResponseWriter, r *http.Request) error {
	log.Printf("%s %s request to %s", r.Proto, r.Method, r.URL)
	if r.Method == "OPTIONS" {
		// preflight cors.
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "POST")
		return stop
	}
	if r.Method != "POST" {
		http.Error(w, "want POST", http.StatusBadRequest)
		return stop
	}

	ct, ok := r.Header["Content-Type"]
	if !ok {
		http.Error(w, "Yo peasant, what about setting Content-Type?", http.StatusBadRequest)
		return stop
	}
	if len(ct) != 1 {
		http.Error(w, `got unexpected amount of Content-Type`, http.StatusBadRequest)
		return stop
	}
	// echo -e 'POST /offer HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/jsonX\r\n\r\n"yolo"' | nc -v 127.0.0.1 8080
	if ct[0] != "application/json" {
		http.Error(w, `want Content-Type "application/json"`, http.StatusBadRequest)
		return stop
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	return nil
}
