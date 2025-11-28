package update

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	pubsub "cloud.google.com/go/pubsub/v2"
	"example.com/logging"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
	"github.com/cloudevents/sdk-go/v2/event"
	"github.com/googleapis/google-cloudevents-go/cloud/firestoredata"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

var (
	projectID string
	topicID   string
)

func init() {
	projectID = os.Getenv("PROJECT_ID")
	topicID = os.Getenv("PIXEL_UPDATE_TOPIC")
	log.SetFlags(0)

	functions.CloudEvent("updatedPixel", updatedPixel)
}

func updatedPixel(ctx context.Context, event event.Event) error {
	if projectID == "" || topicID == "" {
		return fmt.Errorf("environment variables are not set")
	}

	var data firestoredata.DocumentEventData

	options := proto.UnmarshalOptions{
		DiscardUnknown: true,
	}
	err := options.Unmarshal(event.Data(), &data)

	if err != nil {
		return fmt.Errorf("proto.Unmarshal: %w", err)
	}

	logging.InfoF("update", "Function triggered by change to: %v", event.Source())

	doc := data.GetValue()
	if doc == nil {
		logging.Info("update", "No new document value; nothing to publish")
		return nil
	}

	jsonBytes, err := protojson.Marshal(doc)
	if err != nil {
		return fmt.Errorf("protojson.Marshal: %w", err)
	}

	payload, err := buildChunkPayload(jsonBytes)
	if err != nil {
		return fmt.Errorf("buildChunkPayload: %w", err)
	}

	logging.InfoF("update", "Payload: %s", payload)

	if err := publishChunk(ctx, payload, projectID, topicID); err != nil {
		return fmt.Errorf("publishChunk: %w", err)
	}

	return nil
}

func parseChunkName(name string) (int, int, error) {
	base := strings.TrimPrefix(name, "canvas_chunks_")
	parts := strings.Split(base, "_")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("invalid chunk name: %s", name)
	}

	x, err := strconv.Atoi(parts[0])
	if err != nil {
		return 0, 0, fmt.Errorf("invalid x in chunk name: %w", err)
	}
	y, err := strconv.Atoi(parts[1])
	if err != nil {
		return 0, 0, fmt.Errorf("invalid y in chunk name: %w", err)
	}

	return x, y, nil
}

func buildChunkPayload(docJSON []byte) ([]byte, error) {
	var root map[string]any
	if err := json.Unmarshal(docJSON, &root); err != nil {
		return nil, fmt.Errorf("json.Unmarshal docJSON: %w", err)
	}

	docName, _ := root["name"].(string)
	var chunkX, chunkY int
	if docName != "" {
		lastSlash := strings.LastIndex(docName, "/")
		shortName := docName
		if lastSlash != -1 && lastSlash+1 < len(docName) {
			shortName = docName[lastSlash+1:]
		}

		if x, y, err := parseChunkName(shortName); err == nil {
			chunkX, chunkY = x, y
		}
	}

	fields, ok := root["fields"].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("missing fields in document JSON")
	}

	var size int32
	if sField, ok := fields["size"].(map[string]any); ok {
		if val, err := toInt64(sField["integerValue"]); err == nil && val != 0 {
			size = int32(val)
		} else if val, err := toInt64(sField["integer_value"]); err == nil && val != 0 {
			size = int32(val)
		}
	}

	pixels := map[string]any{}
	if pField, ok := fields["pixels"].(map[string]any); ok {
		mv, ok := pField["mapValue"].(map[string]any)
		if !ok {
			mv, _ = pField["map_value"].(map[string]any)
		}
		if mv != nil {
			if pf, ok := mv["fields"].(map[string]any); ok {
				for key, v := range pf {
					pm, ok := v.(map[string]any)
					if !ok {
						continue
					}
					subMV, ok := pm["mapValue"].(map[string]any)
					if !ok {
						subMV, _ = pm["map_value"].(map[string]any)
					}
					if subMV == nil {
						continue
					}
					subFields, ok := subMV["fields"].(map[string]any)
					if !ok {
						continue
					}

					var colorVal, userVal int64
					if c, ok := subFields["color"].(map[string]any); ok {
						if v, err := toInt64(c["integerValue"]); err == nil && v != 0 {
							colorVal = v
						} else if v, err := toInt64(c["integer_value"]); err == nil && v != 0 {
							colorVal = v
						}
					}
					if u, ok := subFields["user"].(map[string]any); ok {
						if v, err := toInt64(u["integerValue"]); err == nil && v != 0 {
							userVal = v
						} else if v, err := toInt64(u["integer_value"]); err == nil && v != 0 {
							userVal = v
						}
					}

					pixels[key] = map[string]any{
						"color": colorVal,
						"user":  userVal,
					}
				}
			}
		}
	}

	lastUpdated := ""
	if lv, ok := fields["lastUpdated"].(map[string]any); ok {
		if ts, ok := lv["timestampValue"].(string); ok {
			lastUpdated = ts
		} else if tsMap, ok := lv["timestamp_value"].(map[string]any); ok {
			sec, _ := toInt64(tsMap["seconds"])
			nanos, _ := toInt64(tsMap["nanos"])
			if sec != 0 {
				t := time.Unix(sec, nanos).UTC()
				lastUpdated = t.Format(time.RFC3339Nano)
			}
		}
	}

	out := map[string]any{
		"size":   size,
		"pixels": pixels,
		"chunkX": chunkX,
		"chunkY": chunkY,
	}

	if lastUpdated != "" {
		out["lastUpdated"] = lastUpdated
	}

	return json.Marshal(out)
}

func toInt64(v any) (int64, error) {
	switch t := v.(type) {
	case float64:
		return int64(t), nil
	case int64:
		return t, nil
	case int:
		return int64(t), nil
	case string:
		if t == "" {
			return 0, nil
		}
		return strconv.ParseInt(t, 10, 64)
	default:
		return 0, fmt.Errorf("unsupported numeric type %T", v)
	}
}

func publishChunk(ctx context.Context, payload []byte, projectID string, topicID string) error {
	client, err := pubsub.NewClient(ctx, projectID)
	if err != nil {
		return fmt.Errorf("pubsub.NewClient: %w", err)
	}
	defer client.Close()

	logging.InfoF("update", "Publishing chunk to topic %s", topicID)

	topic := client.Publisher(topicID)
	defer topic.Stop()

	msgID, err := topic.Publish(ctx, &pubsub.Message{
		Data: payload,
	}).Get(ctx)
	if err != nil {
		return fmt.Errorf("topic.Publish: %w", err)
	}

	logging.InfoF("update", "Published chunk with message ID: %s", msgID)
	return nil
}
