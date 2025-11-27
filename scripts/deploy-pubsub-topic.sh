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
    echo -e "${BLUE}Topic ID:${NC} $TOPIC_ID"
    echo ""
}

# Function to deploy Pub/Sub topic
deploy_topic() {
    print_header "Creating Pub/Sub Topic"
    
    # Check if topic already exists
    if check_topic_exists "$TOPIC_ID" "$PROJECT_ID" >/dev/null 2>&1; then
        print_warning "Topic '$TOPIC_ID' already exists"
        if ! ask_yes_no "Do you want to continue anyway?" "n"; then
            print_info "Deployment cancelled"
            return 1
        fi
    fi
    
    if [ "$DRY_RUN" = true ]; then
        print_warning "DRY RUN MODE - No actual deployment will occur"
        echo ""
        echo "Would execute:"
        echo "gcloud pubsub topics create $TOPIC_ID \\"
        echo "  --project=$PROJECT_ID"
        return 0
    fi
    
    # Create the topic
    print_info "Creating Pub/Sub topic: $TOPIC_ID"
    echo "Executing:"
    echo "gcloud pubsub topics create \"$TOPIC_ID\" \\"
    echo "  --project=\"$PROJECT_ID\""
    gcloud pubsub topics create "$TOPIC_ID" \
        --project="$PROJECT_ID"
    
    if [ $? -eq 0 ]; then
        print_success "Pub/Sub topic created successfully!"
        
        # Fetch topic details
        echo ""
        print_info "Topic details:"
        gcloud pubsub topics describe "$TOPIC_ID" \
            --project="$PROJECT_ID" \
            --format="table(name,labels)" 2>/dev/null
        
        return 0
    else
        print_error "Failed to create Pub/Sub topic!"
        return 1
    fi
}

# Main script starts here
print_header "Pub/Sub Topic Deployment Tool"

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

# List existing topics
list_topics "$PROJECT_ID"
echo ""

# Get topic ID
TOPIC_ID=$(get_input "Enter Pub/Sub topic ID" "")

if [ -z "$TOPIC_ID" ]; then
    print_error "Topic ID cannot be empty"
    exit 1
fi

# Validate topic ID format (alphanumeric, hyphens, underscores, dots)
if [[ ! "$TOPIC_ID" =~ ^[a-zA-Z0-9_.-]+$ ]]; then
    print_error "Invalid topic ID format. Topic IDs can only contain letters, numbers, hyphens, underscores, and dots."
    exit 1
fi

# Show summary and confirm
show_summary "Create New Topic"

# Final confirmation
if ! ask_yes_no "Proceed with topic creation?" "y"; then
    print_info "Deployment cancelled by user"
    exit 0
fi

# Deploy the topic
if deploy_topic; then
    echo ""
    print_header "Deployment Complete!"
    echo -e "${BLUE}Project ID:${NC} ${PROJECT_ID}"
    echo -e "${BLUE}Topic ID:${NC} ${TOPIC_ID}"
    echo ""
    print_success "Topic created successfully. You can now create subscriptions for this topic."
    echo ""
else
    print_error "Deployment failed. Please check the errors above."
    exit 1
fi

