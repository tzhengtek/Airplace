#!/bin/bash

# Parse command line arguments
DRY_RUN=false
if [[ "$1" == "--dry-run" ]] || [[ "$1" == "--dry-mode" ]]; then
    DRY_RUN=true
fi

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored messages
print_header() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}$1${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
}

print_info() {
    echo -e "${BLUE}ℹ ${NC}$1"
}

print_success() {
    echo -e "${GREEN}✓ ${NC}$1"
}

print_warning() {
    echo -e "${YELLOW}⚠ ${NC}$1"
}

print_error() {
    echo -e "${RED}✗ ${NC}$1"
}

# Function to ask yes/no questions
ask_yes_no() {
    local prompt="$1"
    local default="${2:-n}"
    local yn
    
    if [ "$default" = "y" ]; then
        prompt="$prompt [Y/n]: "
    else
        prompt="$prompt [y/N]: "
    fi
    
    while true; do
        read -p "$(echo -e ${YELLOW}${prompt}${NC})" yn
        yn=${yn:-$default}
        case $yn in
            [Yy]* ) return 0;;
            [Nn]* ) return 1;;
            * ) echo "Please answer yes or no.";;
        esac
    done
}

# Function to get user input with default value
get_input() {
    local prompt="$1"
    local default="$2"
    local value
    
    if [ -n "$default" ]; then
        read -p "$(echo -e ${BLUE}${prompt} [${default}]: ${NC})" value
        value=${value:-$default}
    else
        read -p "$(echo -e ${BLUE}${prompt}: ${NC})" value
    fi
    
    echo "$value"
}

# Function to check if a Pub/Sub topic exists
check_topic_exists() {
    local topic_id="$1"
    local project="$2"
    
    gcloud pubsub topics describe "$topic_id" \
        --project "$project" \
        --format 'value(name)' 2>/dev/null
}

# Function to check if a Pub/Sub subscription exists
check_subscription_exists() {
    local subscription_id="$1"
    local project="$2"
    
    gcloud pubsub subscriptions describe "$subscription_id" \
        --project "$project" \
        --format 'value(name)' 2>/dev/null
}

# Function to check if a Cloud Run service exists and get its URL
check_cloud_run_service() {
    local service_name="$1"
    local region="$2"
    local project="$3"
    
    # Check if service exists
    if ! gcloud run services describe "$service_name" \
        --region "$region" \
        --project "$project" \
        --format 'value(metadata.name)' 2>/dev/null | grep -q "$service_name"; then
        return 1
    fi
    
    # Get the service URL
    gcloud run services describe "$service_name" \
        --region "$region" \
        --project "$project" \
        --format 'value(status.url)' 2>/dev/null
}

# Function to list existing Pub/Sub subscriptions
list_subscriptions() {
    local project="$1"
    
    print_info "Fetching existing Pub/Sub subscriptions..."
    local subscriptions=$(gcloud pubsub subscriptions list --project "$project" --format 'value(name)' 2>/dev/null)
    
    if [ -z "$subscriptions" ]; then
        print_info "No existing subscriptions found"
    else
        echo "$subscriptions" | while read -r sub; do
            # Extract just the subscription name (last part after /)
            local sub_name=$(echo "$sub" | awk -F'/' '{print $NF}')
            echo "  - $sub_name"
        done
    fi
}

# Function to list existing Pub/Sub topics
list_topics() {
    local project="$1"
    
    print_info "Fetching existing Pub/Sub topics..."
    gcloud pubsub topics list --project "$project" 2>/dev/null
}

# Function to display deployment summary
show_summary() {
    echo ""
    print_header "Deployment Summary"
    echo -e "${BLUE}Mode:${NC} $1"
    echo -e "${BLUE}Project ID:${NC} $PROJECT_ID"
    echo -e "${BLUE}Subscription Name:${NC} $SUBSCRIPTION_NAME"
    echo -e "${BLUE}Topic Name:${NC} $TOPIC_NAME"
    echo -e "${BLUE}Ack Deadline:${NC} $ACK_DEADLINE seconds"
    if [ -n "$PUSH_ENDPOINT" ]; then
        echo -e "${BLUE}Push Endpoint:${NC} $PUSH_ENDPOINT"
        echo -e "${BLUE}Push Auth Service Account:${NC} $PUSH_AUTH_SA"
    else
        echo -e "${BLUE}Subscription Type:${NC} Pull"
    fi
    echo ""
}

# Function to deploy Pub/Sub subscription
deploy_subscription() {
    print_header "Creating Pub/Sub Subscription"
    
    # Check if subscription already exists
    if check_subscription_exists "$SUBSCRIPTION_NAME" "$PROJECT_ID" >/dev/null 2>&1; then
        print_warning "Subscription '$SUBSCRIPTION_NAME' already exists"
        if ! ask_yes_no "Do you want to continue anyway?" "n"; then
            print_info "Deployment cancelled"
            return 1
        fi
    fi
    
    # Check if topic exists (should already be validated, but double-check)
    if ! check_topic_exists "$TOPIC_NAME" "$PROJECT_ID" >/dev/null 2>&1; then
        print_error "Topic '$TOPIC_NAME' does not exist in project '$PROJECT_ID'"
        print_info "Please create the topic first using: ./deploy-pubsub-topic.sh"
        return 1
    fi
    
    if [ "$DRY_RUN" = true ]; then
        print_warning "DRY RUN MODE - No actual deployment will occur"
        echo ""
        echo "Would execute:"
        echo "gcloud pubsub subscriptions create $SUBSCRIPTION_NAME \\"
        echo "  --topic=$TOPIC_NAME \\"
        echo "  --ack-deadline=$ACK_DEADLINE \\"
        if [ -n "$PUSH_ENDPOINT" ]; then
            echo "  --push-endpoint=$PUSH_ENDPOINT \\"
            echo "  --push-auth-service-account=$PUSH_AUTH_SA \\"
        fi
        echo "  --project=$PROJECT_ID"
        if [ -n "$PUSH_ENDPOINT" ] && [ -n "$SERVICE_NAME" ] && [ -n "$REGION" ]; then
            echo ""
            echo "Would also execute:"
            echo "gcloud run services add-iam-policy-binding $SERVICE_NAME \\"
            echo "  --member=serviceAccount:${PUSH_AUTH_SA} \\"
            echo "  --role=roles/run.invoker \\"
            echo "  --region=$REGION \\"
            echo "  --project=$PROJECT_ID"
        fi
        return 0
    fi
    
    # Build the subscription creation command
    local create_cmd="gcloud pubsub subscriptions create \"$SUBSCRIPTION_NAME\" \
        --topic=\"$TOPIC_NAME\" \
        --ack-deadline=\"$ACK_DEADLINE\" \
        --project=\"$PROJECT_ID\""
    
    # Add push endpoint if specified
    if [ -n "$PUSH_ENDPOINT" ]; then
        create_cmd="$create_cmd --push-endpoint=\"$PUSH_ENDPOINT\""
        create_cmd="$create_cmd --push-auth-service-account=\"$PUSH_AUTH_SA\""
    fi
    
    # Create the subscription
    print_info "Creating Pub/Sub subscription: $SUBSCRIPTION_NAME"
    eval $create_cmd
    
    if [ $? -eq 0 ]; then
        print_success "Pub/Sub subscription created successfully!"
        
        # Fetch subscription details
        echo ""
        print_info "Subscription details:"
        gcloud pubsub subscriptions describe "$SUBSCRIPTION_NAME" \
            --project="$PROJECT_ID" \
            --format="table(name,topic,ackDeadlineSeconds,pushConfig.pushEndpoint)" 2>/dev/null
        
        # If this is a push subscription, grant IAM permissions to the service account
        if [ -n "$PUSH_ENDPOINT" ] && [ -n "$SERVICE_NAME" ] && [ -n "$REGION" ]; then
            echo ""
            print_info "Granting IAM permissions to service account for Cloud Run service..."
            
            gcloud run services add-iam-policy-binding "$SERVICE_NAME" \
                --member="serviceAccount:${PUSH_AUTH_SA}" \
                --role="roles/run.invoker" \
                --region="$REGION" \
                --project="$PROJECT_ID"
            
            if [ $? -eq 0 ]; then
                print_success "IAM policy binding added successfully!"
                print_info "Service account '${PUSH_AUTH_SA}' can now invoke Cloud Run service '$SERVICE_NAME'"
            else
                print_warning "Failed to add IAM policy binding (subscription created successfully)"
                print_warning "You may need to manually grant the 'roles/run.invoker' role to '${PUSH_AUTH_SA}' on service '$SERVICE_NAME'"
            fi
        fi
        
        return 0
    else
        print_error "Failed to create Pub/Sub subscription!"
        return 1
    fi
}

# Main script starts here
print_header "Pub/Sub Subscription Deployment Tool"

# Display execution mode
if [ "$DRY_RUN" = true ]; then
    print_warning "Running in DRY-RUN MODE - commands will be displayed but not executed"
else
    print_success "Running in EXECUTE MODE - commands will be executed"
fi
echo ""

# Get current project
CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null)
if [ -z "$CURRENT_PROJECT" ]; then
    print_error "No GCP project configured. Please run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

PROJECT_ID="$CURRENT_PROJECT"
print_info "Using GCP Project: $PROJECT_ID"
echo ""

# List existing subscriptions
list_subscriptions "$PROJECT_ID"
echo ""

# Get subscription name
SUBSCRIPTION_NAME=$(get_input "Enter subscription name" "")

if [ -z "$SUBSCRIPTION_NAME" ]; then
    print_error "Subscription name cannot be empty"
    exit 1
fi

# Validate subscription name format
if [[ ! "$SUBSCRIPTION_NAME" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    print_error "Invalid subscription name format. Subscription names can only contain letters, numbers, hyphens, and underscores."
    exit 1
fi

echo ""

# List existing topics
list_topics "$PROJECT_ID"
echo ""

# Get topic name and validate it exists
TOPIC_NAME=""
while true; do
    TOPIC_NAME=$(get_input "Enter topic name" "")
    
    if [ -z "$TOPIC_NAME" ]; then
        print_error "Topic name cannot be empty"
        continue
    fi
    
    # Check if topic exists
    if [ "$DRY_RUN" = false ]; then
        if check_topic_exists "$TOPIC_NAME" "$PROJECT_ID" >/dev/null 2>&1; then
            print_success "Topic '$TOPIC_NAME' found"
            break
        else
            print_error "Topic '$TOPIC_NAME' does not exist in project '$PROJECT_ID'"
            print_info "Please create the topic first using: ./deploy-pubsub-topic.sh"
            if ! ask_yes_no "Do you want to try another topic name?" "y"; then
                print_info "Deployment cancelled"
                exit 0
            fi
            echo ""
        fi
    else
        # In dry-run mode, just accept the topic name
        print_warning "[DRY RUN] Would check if topic '$TOPIC_NAME' exists"
        break
    fi
done

echo ""

# Get ack deadline
ACK_DEADLINE=$(get_input "Enter acknowledgment deadline (in seconds)" "60")

# Validate ack deadline is a number
if ! [[ "$ACK_DEADLINE" =~ ^[0-9]+$ ]]; then
    print_error "Acknowledgment deadline must be a positive number"
    exit 1
fi

# Validate ack deadline range (Pub/Sub allows 10-600 seconds)
if [ "$ACK_DEADLINE" -lt 10 ] || [ "$ACK_DEADLINE" -gt 600 ]; then
    print_warning "Acknowledgment deadline should be between 10 and 600 seconds (got: $ACK_DEADLINE)"
    if ! ask_yes_no "Do you want to continue with this value?" "n"; then
        print_info "Deployment cancelled"
        exit 0
    fi
fi

echo ""

# Ask if this is a push subscription
PUSH_ENDPOINT=""
PUSH_AUTH_SA="cloud-run-pubsub-invoker@serveless-epitech-dev.iam.gserviceaccount.com"

if ask_yes_no "Is this a push subscription (messages pushed to Cloud Run)?" "n"; then
    echo ""
    print_info "Push Subscription Configuration"
    
    # Get Cloud Run service name
    SERVICE_NAME=$(get_input "Enter Cloud Run service name" "")
    
    if [ -z "$SERVICE_NAME" ]; then
        print_error "Cloud Run service name cannot be empty for push subscription"
        exit 1
    fi
    
    # Get region (default to europe-west1)
    DEFAULT_REGION="europe-west1"
    REGION=$(get_input "Enter Cloud Run service region" "$DEFAULT_REGION")
    
    # Check if Cloud Run service exists and get URL
    print_info "Checking if Cloud Run service '$SERVICE_NAME' exists in region '$REGION'..."
    
    if [ "$DRY_RUN" = false ]; then
        PUSH_ENDPOINT=$(check_cloud_run_service "$SERVICE_NAME" "$REGION" "$PROJECT_ID")
        
        if [ -z "$PUSH_ENDPOINT" ]; then
            print_error "Cloud Run service '$SERVICE_NAME' not found in region '$REGION' for project '$PROJECT_ID'"
            print_info "Please verify the service name and region, or create the service first using: ./deploy-cloud-run.sh"
            exit 1
        fi
        
        print_success "Found Cloud Run service: $PUSH_ENDPOINT"
    else
        # In dry-run mode, construct a sample URL
        PUSH_ENDPOINT="https://${SERVICE_NAME}-${REGION}-${PROJECT_ID}.a.run.app"
        print_warning "[DRY RUN] Would check for Cloud Run service and use URL: $PUSH_ENDPOINT"
    fi
    
    echo ""
    print_info "Push authentication service account: $PUSH_AUTH_SA"
    print_warning "Make sure this service account has the 'roles/run.invoker' role on the Cloud Run service"
fi

# Show summary and confirm
show_summary "Create New Subscription"

# Final confirmation
if ! ask_yes_no "Proceed with subscription creation?" "y"; then
    print_info "Deployment cancelled by user"
    exit 0
fi

# Deploy the subscription
if deploy_subscription; then
    echo ""
    print_header "Deployment Complete!"
    echo -e "${BLUE}Project ID:${NC} ${PROJECT_ID}"
    echo -e "${BLUE}Subscription Name:${NC} ${SUBSCRIPTION_NAME}"
    echo -e "${BLUE}Topic Name:${NC} ${TOPIC_NAME}"
    echo -e "${BLUE}Ack Deadline:${NC} ${ACK_DEADLINE} seconds"
    if [ -n "$PUSH_ENDPOINT" ]; then
        echo -e "${BLUE}Push Endpoint:${NC} ${PUSH_ENDPOINT}"
        echo -e "${BLUE}Cloud Run Service:${NC} ${SERVICE_NAME} (${REGION})"
    fi
    echo ""
    print_success "Subscription created successfully!"
    echo ""
else
    print_error "Deployment failed. Please check the errors above."
    exit 1
fi

