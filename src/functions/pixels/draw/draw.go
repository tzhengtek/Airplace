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
	"time"

	"example.com/logging"

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
	X         int32  `firestore:"x" json:"x"`
	Y         int32  `firestore:"y" json:"y"`
	Color     uint8  `firestore:"color" json:"color"`
	User      string `firestore:"user" json:"user"`
	Timestamp string `firestore:"timestamp" json:"timestamp"`
}

type ChunkData struct {
	StartX int32          `firestore:"startX" json:"startX"`
	StartY int32          `firestore:"startY" json:"startY"`
	Size   int32          `firestore:"size" json:"size"`
	Pixels map[string]any `firestore:"pixels" json:"pixels"`
}

type UserInfo struct {
	UserID string `firestore:"userID" json:"userID"`
}

var (
	projectId         string
	firestoreDatabase string
	chunkSizeEnv      string
	topicID           string
	addUserTopicID    string
	triggerResetName  string
)

func init() {
	projectId = os.Getenv("PROJECT_ID")
	firestoreDatabase = os.Getenv("FIRESTORE_DATABASE")
	chunkSizeEnv = os.Getenv("CHUNK_SIZE")
	topicID = os.Getenv("PIXEL_UPDATE_TOPIC")
	addUserTopicID = os.Getenv("ADD_USER_TOPIC")
	triggerResetName = os.Getenv("TRIGGER_RESET_NAME")
	log.SetFlags(0)

	functions.HTTP("drawPixel", drawPixel)
}

func drawPixel(w http.ResponseWriter, r *http.Request) {
	if projectId == "" || firestoreDatabase == "" || chunkSizeEnv == "" || topicID == "" {
		http.Error(w, "Environement variable are not set", http.StatusInternalServerError)
		return
	}

	logging.Info("draw", "Calling draw Pixel service...")
	chunkSize, err := strconv.Atoi(chunkSizeEnv)
	if err != nil {
		logging.Error("draw", "Error parsing chunk size", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		logging.Error("draw", "Error while reading the request body", err)
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	logging.InfoF("draw", "Request body: %s", body)

	// Read and deserialize the PubSubMessage
	var msg PubSubMessage
	if err := json.Unmarshal(body, &msg); err != nil {
		logging.Error("draw", "Error while retrieving Pub Sub Message", err)
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	logging.InfoF("draw", "PubSubMessage: %+v", msg)

	// Decode the base64 data
	decodedData, err := base64.StdEncoding.DecodeString(msg.Message.Data)
	if err != nil {
		logging.Error("draw", "Error decoding base64", err)
		http.Error(w, "Bad request: invalid base64", http.StatusBadRequest)
		return
	}

	logging.InfoF("draw", "Decoded data: %s", decodedData)

	// Deserialize the PixelInfo
	var pixelInfo PixelInfo
	if err := json.Unmarshal(decodedData, &pixelInfo); err != nil {
		logging.Error("draw", "Error while deserialize pixel info from body", err)
		http.Error(w, "Bad Request: invalid body", http.StatusBadRequest)
		return
	}

	logging.InfoF("draw", "PixelInfo: %+v", pixelInfo)

	// Save to Firestore
	if err := savePixelToFirestore([]PixelInfo{pixelInfo}, projectId, firestoreDatabase, chunkSize, topicID); err != nil {
		logging.Error("draw", "Error saving pixel", err)
		http.Error(w, "Internal Error", http.StatusBadRequest)
		return
	}

	logging.InfoF("draw", "Pixel inserted successfully: x=%d, y=%d", pixelInfo.X, pixelInfo.Y)
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "Pixel inserted successfully")
}

func savePixelToFirestore(pixelInfo []PixelInfo, projectId string, firestoreDatabase string, chunkSize int, topicID string) error {
	ctx := context.Background()
	client, err := firestore.NewClientWithDatabase(ctx, projectId, firestoreDatabase)
	if err != nil {
		return fmt.Errorf("error connecting to Firestore: %w", err)
	}
	defer client.Close()

	c, err := pubsub.NewClient(ctx, projectId)
	if err != nil {
		logging.Error("draw", "Error while retrieving Gcloud Profile", err)
		return fmt.Errorf("error connecting to PubSub: %w", err)
	}
	defer c.Close()

	topic := c.Publisher(addUserTopicID)
	topic.PublishSettings = pubsub.PublishSettings{
		CountThreshold: 10,
		DelayThreshold: 100 * time.Millisecond,
		ByteThreshold:  1e6,
	}
	defer topic.Stop()

	chunkUpdates := make(map[string]map[string]any)
	for _, pixel := range pixelInfo {
		localX := int(pixel.X) % chunkSize
		localY := int(pixel.Y) % chunkSize
		userID, err := strconv.ParseInt(pixel.User, 10, 64)
		if err != nil {
			return fmt.Errorf("error parsing user ID: %w", err)
		}
		pixelKey := fmt.Sprintf("%d_%d", localX, localY)

		body, err := json.Marshal(UserInfo{
			UserID: pixel.User,
		})
		if err != nil {
			return fmt.Errorf("error marshalling user info: %w", err)
		}
		if _, err := topic.Publish(ctx, &pubsub.Message{
			Data: body,
		}).Get(ctx); err != nil {
			logging.Error("draw", "Error publishing user message", err)
			continue
		}

		chunkId := fmt.Sprintf("canvas_chunks_%d_%d", int(pixel.X)/chunkSize, int(pixel.Y)/chunkSize)
		if chunkUpdates[chunkId] == nil {
			chunkUpdates[chunkId] = map[string]any{
				"size": int32(chunkSize),
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

	triggerRef := client.Collection(triggerResetName).Doc(triggerResetName)
	if _, err := batch.Set(triggerRef, map[string]any{
		"lastTriggered": firestore.ServerTimestamp,
	}); err != nil {
		return fmt.Errorf("error queuing trigger-reset document: %w", err)
	}

	batch.End()
	return nil
}
