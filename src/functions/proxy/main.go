package proxy

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"

	proxy_pb "proxy/proxy-pb"

	"google.golang.org/protobuf/proto"
)

func main() {
	log.Printf("Starting Proxy server...")
	http.HandleFunc("/pixel-draw", publishDraw)
	http.HandleFunc("/pixel-update", publishUpdate)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
		log.Printf("defaulting to port %s", port)
	}

	log.Printf("listening on port %s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}

func publishUpdate(w http.ResponseWriter, r *http.Request) {
	log.Printf("Publish Update function...")
}

func publishDraw(w http.ResponseWriter, r *http.Request) {
	log.Printf("Publish Draw function...")

	body, err := io.ReadAll(r.Body)
	if err != nil {
		fmt.Printf("")
	}

	var response proxy_pb.AirplaceBody
	if err := proto.Unmarshal(body, &response); err != nil {
		log.Fatalf("Failed to unmarshal response : %v", err)
	}

	fmt.Fprint(w, &response)
}
