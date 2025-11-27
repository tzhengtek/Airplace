package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"cloud.google.com/go/firestore"
	"cloud.google.com/go/pubsub/v2"
)

func main() {
	log.Printf("Starting Proxy server...")
	http.HandleFunc("POST /pixel-draw", publishDraw)
	http.HandleFunc("POST /pixel-update", publishUpdate)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
		log.Printf("defaulting to port %s", port)
	}

	log.Printf("listening on port %s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}

type PubSubMessage struct {
	Message struct {
		Data       string            `json:"data"`
		Attributes map[string]string `json:"attributes"`
		MessageID  string            `json:"messageId"`
	} `json:"message"`
	Subscription string `json:"subscription"`
}

type PixelInfo struct {
	X         int32  `json:"x"`
	Y         int32  `json:"y"`
	Color     uint32 `json:"color"`
	User      string `json:"user"`
	Timestamp string `json:"timestamp"`
}

func publishUpdate(w http.ResponseWriter, r *http.Request) {
	log.Printf("Publish Update function...")
	ctx := r.Context()
	projectId := "serveless-epitech-dev"
	c, err := pubsub.NewClient(ctx, projectId)
	if err != nil {
		log.Printf("Error while retrieving Gcloud Profile: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	defer c.Close()

	body, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("Error while reading the request body: %v", err)
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if !json.Valid(body) {
		log.Printf("Error: messageData is not valid JSON: %s", string(body))
		http.Error(w, "Invalid JSON data", http.StatusBadRequest)
		return
	}

	var pixelInfo PixelInfo
	if err := json.Unmarshal(body, &pixelInfo); err != nil {
		log.Printf("Error while deserialize pixel info from body: %v", err)
		http.Error(w, "Bad Request: invalid body", http.StatusBadRequest)
		return
	}

	// Check rate limit: retrieve user document and compare lastupdated with current time
	firestoreClient, err := firestore.NewClientWithDatabase(ctx, projectId, "serverless-epitech-firestore")
	if err != nil {
		log.Printf("Error creating Firestore client: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	defer firestoreClient.Close()

	// Retrieve user document by ID (PixelInfo.User)
	userDoc, err := firestoreClient.Collection("users").Doc(pixelInfo.User).Get(ctx)
	if err != nil {
		log.Printf("Error retrieving user document: %v", err)
		// If document doesn't exist, allow the request (first time user)
		log.Printf("User document not found, allowing request")
	} else {
		// Get lastupdated field
		lastUpdated, ok := userDoc.Data()["lastupdated"]
		if ok {
			var lastUpdatedTime time.Time
			switch v := lastUpdated.(type) {
			case time.Time:
				lastUpdatedTime = v
			case *time.Time:
				if v != nil {
					lastUpdatedTime = *v
				}
			default:
				log.Printf("Unexpected type for lastupdated: %T, value: %v", v, v)
			}

			if !lastUpdatedTime.IsZero() {
				timeDiff := time.Since(lastUpdatedTime)
				if timeDiff < 300*time.Second {
					log.Printf("Rate limit exceeded: last update was %v ago (limit: 300s)", timeDiff)
					http.Error(w, "Not allowed: rate limit exceeded", http.StatusForbidden)
					return
				}
			}
		}
	}

	topic := c.Publisher("pixel.draw")
	topic.PublishSettings = pubsub.PublishSettings{
		CountThreshold: 10,
		DelayThreshold: 100 * time.Millisecond,
		ByteThreshold:  1e6,
	}
	defer topic.Stop()

	// Publish raw JSON bytes - Pub/Sub will base64 encode when pushing to HTTP endpoint
	log.Printf("Publishing raw JSON: %s", string(body))

	msgId, err := topic.Publish(ctx, &pubsub.Message{
		Data: body,
	}).Get(ctx)
	if err != nil {
		log.Printf("Error publishing message: %v", err)
		http.Error(w, "Failed to publish message", http.StatusInternalServerError)
		return
	}

	// pubsubMsg.Subscription = "projects/serveless-epitech-dev/subscriptions/pixel.draw"

	// msgID, err := res.Get(ctx)
	// if err != nil {
	// 	log.Printf("Error publishing message: %v", err)
	// 	http.Error(w, "Failed to publish message", http.StatusInternalServerError)
	// 	return
	// }

	log.Printf("Message published successfully with ID: %s", msgId)
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "Message published: %s", msgId)
}

func publishDraw(w http.ResponseWriter, r *http.Request) {
	log.Printf("Publish Draw function...")
}
