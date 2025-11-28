package reset

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"cloud.google.com/go/pubsub/v2"
	pubsubadmin "cloud.google.com/go/pubsub/v2/apiv1"
	adminpb "cloud.google.com/go/pubsub/v2/apiv1/pubsubpb"
	"example.com/logging"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
	"github.com/cloudevents/sdk-go/v2/event"
	"google.golang.org/api/iterator"
	"google.golang.org/protobuf/types/known/timestamppb"
)

var (
	projectID string
	topicName string
)

func init() {
	topicName = os.Getenv("PIXEL_UPDATE_TOPIC")
	projectID = os.Getenv("PROJECT_ID")
	log.SetFlags(0)

	functions.CloudEvent("resetPixel", resetPixel)
}

func resetPixel(ctx context.Context, e event.Event) error {
	if projectID == "" || topicName == "" {
		return fmt.Errorf("environment variables are not set")
	}

	if err := seekAllSubscriptionsToNow(ctx, topicName); err != nil {
		return fmt.Errorf("failed to seek subscriptions: %v", err)
	}

	logging.InfoF("reset", "Successfully cleared messages from topic: %s", topicName)
	return nil
}

func seekAllSubscriptionsToNow(ctx context.Context, topicName string) error {
	client, err := pubsub.NewClient(ctx, projectID)
	if err != nil {
		return fmt.Errorf("pubsub.NewClient: %v", err)
	}
	defer client.Close()

	subAdmin, err := pubsubadmin.NewSubscriptionAdminClient(ctx)
	if err != nil {
		return fmt.Errorf("apiv1.NewSubscriptionAdminClient: %v", err)
	}
	defer subAdmin.Close()

	req := &adminpb.ListTopicSubscriptionsRequest{
		Topic: fmt.Sprintf("projects/%s/topics/%s", projectID, topicName),
	}
	it := client.TopicAdminClient.ListTopicSubscriptions(ctx, req)

	now := timestamppb.New(time.Now())

	for {
		subName, err := it.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return fmt.Errorf("error listing topic subscriptions: %w", err)
		}

		logging.InfoF("reset", "Seeking subscription %s to %v", subName, now.AsTime())

		_, err = subAdmin.Seek(ctx, &adminpb.SeekRequest{
			Subscription: subName,
			Target: &adminpb.SeekRequest_Time{
				Time: now,
			},
		})
		if err != nil {
			// Decide whether to continue on error or fail fast.
			return fmt.Errorf("failed to seek subscription %s: %w", subName, err)
		}
	}

	return nil
}
