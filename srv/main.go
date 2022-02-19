package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
)

type val struct {
	value  string
	notify chan<- string
}

type Store struct {
	mu      sync.Mutex
	content map[string]val
}

func NewStore() *Store {
	return &Store{
		content: make(map[string]val),
	}
}

func (s *Store) Add(k string, v string) <-chan string {
	s.mu.Lock()
	defer s.mu.Unlock()

	ch := make(chan string)
	s.content[k] = val{
		value:  v,
		notify: ch,
	}
	return ch
}

func (s *Store) Keys() []string {
	s.mu.Lock()
	defer s.mu.Unlock()

	keys := make([]string, 0, len(s.content)) // return empty slize instead if nil for JSOn serialization.
	for k, _ := range s.content {
		keys = append(keys, k)
	}
	return keys
}

func (s *Store) Get(k string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if v, ok := s.content[k]; !ok {
		return "", false
	} else {
		return v.value, true
	}
}

func (s *Store) Remove(k string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.content, k)
	//TODO: close chan?
}

func (s *Store) RelayAnswer(remoteUID string, answer string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	var val val
	var ok bool
	if val, ok = s.content[remoteUID]; !ok {
		return fmt.Errorf("remoteUID not found")
	}
	val.notify <- answer
	//TODO: cleanup s.content[remoteUID]?

	return nil
}

type offer struct {
	store *Store
}

// Accepts an offer and will reply with an answer. May be a very longrunning connection.
func (s *offer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	log.Printf("%s %s request to %s", r.Proto, r.Method, r.URL)
	ctx := r.Context()

	if err := corsAllow(w, r, []string{"POST"}); err != nil {
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

	answer := s.store.Add(body.Uid, string(offer))
	defer s.store.Remove(body.Uid)

	// echo -e 'POST /offer HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 6\r\n\r\n"yolo"\r\n' | nc -v 127.0.0.1 8080
	// echo -e 'POST /offer HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 28\r\n\r\n{"uid":"yolo","offer":"lol"}\r\n' | nc -v 127.0.0.1 8080
	w.Header().Set("Content-Type", "application/json")
	log.Printf("now waiting for an answer for %q", body.Uid)
	select {
	case a := <-answer:
		fmt.Fprintf(w, `{"answer":%q}`, a)
	case <-ctx.Done():
		log.Printf("waiting on offer: ctx.Done (client closed connection)")
		return
	}
}

type accept struct {
	store *Store
}

func (s *accept) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	log.Printf("%s %s request to %s", r.Proto, r.Method, r.URL)

	if err := corsAllow(w, r, []string{"POST"}); err != nil {
		return
	}

	var body struct {
		UidRemote string
		Answer    interface{}
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, fmt.Sprintf("yo, invalid request: %v", err), http.StatusBadRequest) // leaks data!!
		return
	}
	answer, err := json.Marshal(body.Answer)
	if err != nil {
		http.Error(w, fmt.Sprintf("invalid json request: %v", err), http.StatusBadRequest) // leaks data!!
		return
	}
	log.Printf("relaying answer to %s", body.UidRemote)
	// TODO: improve answer type
	if err := s.store.RelayAnswer(body.UidRemote, string(answer)); err != nil {
		http.Error(w, fmt.Sprintf("could not answer: %v", err), http.StatusNotFound) // leaks data!!
		return
	}
}

type listoffers struct {
	store *Store
}

// Returns the UIDs of offers waiting for an anwser.
func (s *listoffers) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	log.Printf("%s %s request to %s", r.Proto, r.Method, r.URL)

	if err := corsAllow(w, r, []string{"GET"}); err != nil {
		return
	}

	reply, err := json.Marshal(struct {
		UIDs []string `json:"uids"`
	}{UIDs: s.store.Keys()})
	if err != nil {
		http.Error(w, "how does I JSON?", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `%s`, reply)
}

type getoffer struct {
	store *Store
}

// Returns the offer for a UID.
func (s *getoffer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	log.Printf("%s %s request to %s", r.Proto, r.Method, r.URL)

	if err := corsAllow(w, r, []string{"GET"}); err != nil {
		return
	}

	uids, ok := r.URL.Query()["uid"]
	if !ok {
		http.Error(w, "need uid parameter", http.StatusBadRequest)
		return
	}
	if len(uids) != 1 {
		http.Error(w, "need exactly one uid parameter", http.StatusBadRequest)
		return
	}
	uid := uids[0]

	offer, ok := s.store.Get(uid)
	if !ok {
		http.Error(w, "no offer found for this UID", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"offer":%q}`, offer)
}

func main() {
	fmt.Println("Hello, world")
	store := NewStore()
	http.Handle("/offer", &offer{store})
	http.Handle("/listoffers", &listoffers{store})
	http.Handle("/getoffer", &getoffer{store})
	http.Handle("/accept", &accept{store})
	log.Fatal(http.ListenAndServe(":8080", nil))
}

var stop = errors.New("stop")

func contains(needle string, haystack []string) bool {
	for _, s := range haystack {
		if needle == s {
			return true
		}
	}
	return false
}

func corsAllow(w http.ResponseWriter, r *http.Request, methods []string) error {
	if r.Method == "OPTIONS" {
		// preflight cors.
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", strings.Join(methods, ", "))
		return stop
	}
	if !contains(r.Method, methods) {
		http.Error(w, "not accepting this method", http.StatusBadRequest)
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
