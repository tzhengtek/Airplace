package add_user

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"

	"cloud.google.com/go/firestore"
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

type UserInfo struct {
	UserID string `firestore:"userID" json:"userID"`
}

var (
	projectId         string
	firestoreDatabase string
)

func init() {
	projectId = os.Getenv("PROJECT_ID")
	firestoreDatabase = os.Getenv("FIRESTORE_DATABASE")

	functions.HTTP("addUser", addUser)
}

func addUser(w http.ResponseWriter, r *http.Request) {
	log.Printf("Adding user...")
	ctx := context.Background()
	client, err := firestore.NewClientWithDatabase(ctx, projectId, firestoreDatabase)
	if err != nil {
		log.Printf("error connecting to Firestore: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	defer client.Close()

	if projectId == "" || firestoreDatabase == "" {
		log.Printf("Environment variables are not set")
		http.Error(w, "Environment variables are not set", http.StatusInternalServerError)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("Error while reading the request body: %v", err)
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

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

	// Deserialize the UserInfo
	var userInfo UserInfo
	if err := json.Unmarshal(decodedData, &userInfo); err != nil {
		log.Printf("Error while deserialize pixel info from body: %v", err)
		http.Error(w, "Bad Request: invalid body", http.StatusBadRequest)
		return
	}

	log.Printf("UserInfo: %+v", userInfo)

	if _, err := client.Collection("users").Doc(userInfo.UserID).Set(ctx, map[string]any{
		"lastUpdated": firestore.ServerTimestamp,
	}); err != nil {
		log.Printf("error queuing user document: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	log.Printf("User added successfully")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "User added successfully")
}
