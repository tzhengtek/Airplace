package proxy

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
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
)

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

var (
	projectId         string
	firestoreDatabase string
	userCollection    string
	rateLimit         string
	rateLimitDuration time.Duration
	drawPixelTopicID  string
)

func init() {
	projectId = os.Getenv("PROJECT_ID")
	firestoreDatabase = os.Getenv("FIRESTORE_DATABASE")
	userCollection = os.Getenv("USER_COLLECTION")
	rateLimit = os.Getenv("RATE_LIMIT")
	drawPixelTopicID = os.Getenv("DRAW_PIXEL_TOPIC")

	functions.HTTP("proxyInterface", publishDraw)
}

func publishDraw(w http.ResponseWriter, r *http.Request) {
	if projectId == "" || firestoreDatabase == "" || userCollection == "" || rateLimit == "" {
		http.Error(w, "Environment variables are not set", http.StatusInternalServerError)
		return
	}

	var err error
	rateLimitDuration, err = time.ParseDuration(rateLimit)
	if err != nil {
		log.Printf("Error parsing rate limit: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	log.Printf("Publish Draw function...")
	ctx := r.Context()
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

	firestoreClient, err := firestore.NewClientWithDatabase(ctx, projectId, firestoreDatabase)
	if err != nil {
		log.Printf("Error creating Firestore client: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	defer firestoreClient.Close()

	userDoc, err := firestoreClient.Collection(userCollection).Doc(pixelInfo.User).Get(ctx)
	if err != nil {
		log.Printf("User document not found, allowing request")
	} else {
		lastUpdated, ok := userDoc.Data()["lastUpdated"]
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
				if timeDiff < rateLimitDuration*time.Second {
					log.Printf("Rate limit exceeded: last update was %v ago (limit: 300s)", timeDiff)
					http.Error(w, "Not allowed: rate limit exceeded", http.StatusForbidden)
					return
				}
			}
		}
	}

	topic := c.Publisher(drawPixelTopicID)
	topic.PublishSettings = pubsub.PublishSettings{
		CountThreshold: 10,
		DelayThreshold: 100 * time.Millisecond,
		ByteThreshold:  1e6,
	}
	defer topic.Stop()

	msgId, err := topic.Publish(ctx, &pubsub.Message{
		Data: body,
	}).Get(ctx)
	if err != nil {
		log.Printf("Error publishing message: %v", err)
		http.Error(w, "Failed to publish message", http.StatusInternalServerError)
		return
	}

	log.Printf("Message published successfully with ID: %s", msgId)
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "Message published: %s", msgId)
}
