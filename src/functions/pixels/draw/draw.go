package draw

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"

	"cloud.google.com/go/firestore"
	pubsub "cloud.google.com/go/pubsub/v2"
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
	X         int32  `firestore:"x" json:"x"`
	Y         int32  `firestore:"y" json:"y"`
	Color     uint8  `firestore:"color" json:"color"`
	User      string `firestore:"user" json:"user"`
	Timestamp string `firestore:"timestamp" json:"timestamp"`
}

func init() {
	functions.HTTP("drawPixel", drawPixel)
}

func processMessage(w http.ResponseWriter, r *http.Request) {
	projectId := os.Getenv("PROJECT_ID")
	subscriptionName := os.Getenv("SUBSCRIPTION_NAME")

	if projectId == "" {
		http.Error(w, "PROJECT_ID environment variable is not set", http.StatusInternalServerError)
		return
	}

	if subscriptionName == "" {
		http.Error(w, "SUBSCRIPTION_NAME environment variable is not set", http.StatusInternalServerError)
		return
	}

	ctx := r.Context()
	client, err := pubsub.NewClient(ctx, projectId)
	if err != nil {
		log.Printf("Error while creating PubSub client: %v", err)
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	defer client.Close()

	// if subscriptionName == "" {
	// subscriptionName = "sub-pixel-draw"
	// }

	// maxPullingMessages := 3
	// pixelsInfos := make([]PixelInfo, 0, maxPullingMessages)

	// log.Printf("Max pulling messages: %d", maxPullingMessages)
	// sub := client.Subscriber(subscriptionName)
	// var i int32 = 0
	// sub.ReceiveSettings.MaxOutstandingMessages = maxPullingMessages
	// sub.ReceiveSettings.NumGoroutines = 1

	// cctx, cancel := context.WithCancel(ctx)
	// defer cancel()
	// // pullCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	// // defer cancel()

	// log.Printf("Receiving messages...")
	// err = sub.Receive(cctx, func(ctx context.Context, m *pubsub.Message) {
	// 	if atomic.AddInt32(&i, 1) > int32(maxPullingMessages) {
	// 		log.Printf("Max pulling messages reached, stopping...")
	// 		cancel()
	// 		return
	// 	}
	// 	// Decode message
	// 	// var pixel PixelInfo
	// 	// if err := json.Unmarshal(m.Data, &pixel); err != nil {
	// 	// 	log.Printf("Error unmarshaling message ID %s: %v", m.ID, err)
	// 	// 	m.Nack()
	// 	// 	return
	// 	// }

	// 	// pixelsInfos = append(pixelsInfos, pixel)

	// 	i++
	// 	log.Printf("%d - Received message: %v", i, m)
	// 	m.Ack()
	// })

	// log.Printf("Done receiving messages...")
	// if err != nil {
	// 	log.Printf("Error receiving messages: %v", err)
	// 	http.Error(w, "Error processing messages", http.StatusInternalServerError)
	// 	return
	// }

	// log.Printf("Pixels infos: %v", pixelsInfos)
	// w.WriteHeader(http.StatusOK)
	// fmt.Fprintf(w, "Message processed successfully")
}

func drawPixel(w http.ResponseWriter, r *http.Request) {
	projectId := os.Getenv("PROJECT_ID")
	firestoreDatabase := os.Getenv("FIRESTORE_DATABASE")

	if projectId == "" || firestoreDatabase == "" {
		http.Error(w, "Environment variables are not set", http.StatusInternalServerError)
		return
	}
	log.Printf("Calling draw Pixel service...")

	body, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("Error while reading the request body: %v", err)
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	log.Printf("Request body: %s", body)

	// Read and deserialize the PubSubMessage
	var msg PubSubMessage
	if err := json.Unmarshal(body, &msg); err != nil {
		log.Printf("Error while retrieving Pub Sub Message: %v", err)
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	log.Printf("PubSubMessage: %+v", msg)

	// Decode the base64 data
	decodedData, err := base64.StdEncoding.DecodeString(msg.Message.Data)
	if err != nil {
		log.Printf("Error decoding base64: %v", err)
		http.Error(w, "Bad request: invalid base64", http.StatusBadRequest)
		return
	}

	log.Printf("Decoded data: %s", decodedData)

	// Deserialize the PixelInfo
	var pixelInfo PixelInfo
	if err := json.Unmarshal(decodedData, &pixelInfo); err != nil {
		log.Printf("Error while deserialize pixel info from body: %v", err)
		http.Error(w, "Bad Request: invalid body", http.StatusBadRequest)
		return
	}

	log.Printf("PixelInfo: %+v", pixelInfo)

	// Save to Firestore
	if err := savePixelToFirestore([]PixelInfo{pixelInfo}, projectId, firestoreDatabase); err != nil {
		log.Printf("Error saving pixel: %v", err)
		http.Error(w, "Internal Error", http.StatusBadRequest)
		return
	}

	log.Printf("Pixel inserted successfully: x=%d, y=%d", pixelInfo.X, pixelInfo.Y)
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "Pixel inserted successfully")
}

type ChunkData struct {
	StartX int32 `firestore:"startX" json:"startX"`
	StartY int32
	Size   int32
	Pixels []byte
}

func savePixelToFirestore(pixelInfo []PixelInfo, projectId string, firestoreDatabase string) error {
	ctx := context.Background()
	client, err := firestore.NewClientWithDatabase(ctx, projectId, firestoreDatabase)
	if err != nil {
		return fmt.Errorf("error connecting to Firestore: %w", err)
	}
	defer client.Close()

	chunkSize := 100

	chunkUpdates := make(map[string]map[string]any)
	for _, pixel := range pixelInfo {
		localX := int(pixel.X) % chunkSize
		localY := int(pixel.Y) % chunkSize
		userID, err := strconv.ParseInt(pixel.User, 10, 64)
		pixelKey := fmt.Sprintf("%d_%d", localX, localY)

		if err != nil {
			return fmt.Errorf("error parsing user ID: %w", err)
		}
		chunkId := fmt.Sprintf("canvas_chunks_%d_%d", int(pixel.X)/chunkSize, int(pixel.Y)/chunkSize)
		if chunkUpdates[chunkId] == nil {
			chunkUpdates[chunkId] = map[string]any{
				"startX": int32(localX),
				"startY": int32(localY),
				"size":   int32(chunkSize),
				"pixels": map[string]any{pixelKey: map[string]any{
					"color": pixel.Color,
					"user":  userID,
				},
				},
				"lastUpdated": firestore.ServerTimestamp,
			}
		}
	}

	batch := client.BulkWriter(ctx)

	for chunkId, chunkData := range chunkUpdates {
		docRef := client.Collection("canvas_chunks").Doc(chunkId)
		if _, err := batch.Set(docRef, chunkData, firestore.MergeAll); err != nil {
			return fmt.Errorf("error queuing chunk %s: %w", chunkId, err)
		}
	}
	batch.End()
	return nil
}
