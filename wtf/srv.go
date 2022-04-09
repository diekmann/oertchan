package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)


func foobar(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	w.Header().Set("Content-Type", "application/json")
	log.Printf("now waiting ...")
	select {
	case <-ctx.Done():
		reason := fmt.Sprintf("%v", ctx.Err())
		if errors.Is(ctx.Err(), context.Canceled) {
			reason += ", client closed connection"
		}
		log.Printf("waiting: ctx.Done (reason: %v)", reason)
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			http.Error(w, "yolo, please retry", http.StatusRequestTimeout)
		}
		return
	}
}

func main() {
	port := os.Getenv("PORT") // Heroku
	if port == "" {
		port = "8080"
	}
	fmt.Printf("Hello, world, starting to serve on %s", port)
	http.Handle("/foobar", &corsHTTPHandler{[]string{"POST"}, foobar})
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

type corsHTTPHandler struct {
	wantMethod []string
	serve      func(w http.ResponseWriter, r *http.Request)
}

func (h *corsHTTPHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	log.Printf("%s %s request to %s", r.Proto, r.Method, r.URL)

	if err := corsAllow(w, r, h.wantMethod); err != nil {
		return
	}
	h.serve(w, r)
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
	if ct[0] != "application/json" {
		http.Error(w, `want Content-Type "application/json"`, http.StatusBadRequest)
		return stop
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	return nil
}
