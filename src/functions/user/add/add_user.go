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
	"example.com/logging"
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
	log.SetFlags(0)

	functions.HTTP("addUser", addUser)
}

func addUser(w http.ResponseWriter, r *http.Request) {
	logging.Info("add_user", "Adding user...")

	if projectId == "" || firestoreDatabase == "" {
		logging.Error("add_user", "Environment variables are not set", nil)
		http.Error(w, "Environment variables are not set", http.StatusInternalServerError)
		return
	}

	ctx := context.Background()
	client, err := firestore.NewClientWithDatabase(ctx, projectId, firestoreDatabase)
	if err != nil {
		logging.Error("add_user", "Error connecting to Firestore", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	defer client.Close()

	body, err := io.ReadAll(r.Body)
	if err != nil {
		logging.Error("add_user", "Error while reading the request body", err)
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// Read and deserialize the PubSubMessage
	var msg PubSubMessage
	if err := json.Unmarshal(body, &msg); err != nil {
		logging.Error("add_user", "Error while retrieving Pub Sub Message", err)
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	logging.InfoF("add_user", "PubSubMessage: %+v", msg)

	// Decode the base64 data
	decodedData, err := base64.StdEncoding.DecodeString(msg.Message.Data)
	if err != nil {
		logging.Error("add_user", "Error decoding base64", err)
		http.Error(w, "Bad request: invalid base64", http.StatusBadRequest)
		return
	}

	logging.InfoF("add_user", "Decoded data: %s", decodedData)

	// Deserialize the UserInfo
	var userInfo UserInfo
	if err := json.Unmarshal(decodedData, &userInfo); err != nil {
		logging.Error("add_user", "Error while deserialize user info from body", err)
		http.Error(w, "Bad Request: invalid body", http.StatusBadRequest)
		return
	}

	logging.InfoF("add_user", "UserInfo: %+v", userInfo)

	if _, err := client.Collection("users").Doc(userInfo.UserID).Set(ctx, map[string]any{
		"lastUpdated": firestore.ServerTimestamp,
	}); err != nil {
		logging.Error("add_user", "Error queuing user document", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	logging.Info("add_user", "User added successfully")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "User added successfully")
}
