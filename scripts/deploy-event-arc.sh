#!/bin/bash

# Parse command line arguments
DRY_RUN=false
if [[ "$1" == "--dry-run" || "$1" == "--dry-mode" ]]; then
  DRY_RUN=true
fi

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

print_event_categories() {
  echo "Available event categories:"
  echo "  1) Cloud Firestore document events"
  echo "  2) Cloud Datastore entity events"
  echo "  3) API Gateway events"
  echo "  4) Cloud Deploy events"
}

print_firestore_events() {
  print_info "Cloud Firestore document event types:"
  echo "  1) google.cloud.firestore.document.v1.created"
  echo "  2) google.cloud.firestore.document.v1.updated"
  echo "  3) google.cloud.firestore.document.v1.deleted"
  echo "  4) google.cloud.firestore.document.v1.written"
}

print_datastore_events() {
  print_info "Cloud Datastore entity event types:"
  echo "  1) google.cloud.datastore.entity.v1.created"
  echo "  2) google.cloud.datastore.entity.v1.updated"
  echo "  3) google.cloud.datastore.entity.v1.deleted"
  echo "  4) google.cloud.datastore.entity.v1.written"
}

print_apigateway_events() {
  print_info "API Gateway event types:"
  echo "  1) google.cloud.apigateway.api.v1.created"
  echo "  2) google.cloud.apigateway.api.v1.deleted"
  echo "  3) google.cloud.apigateway.api.v1.updated"
  echo "  4) google.cloud.apigateway.apiConfig.v1.created"
  echo "  5) google.cloud.apigateway.apiConfig.v1.deleted"
  echo "  6) google.cloud.apigateway.apiConfig.v1.updated"
  echo "  7) google.cloud.apigateway.gateway.v1.created"
  echo "  8) google.cloud.apigateway.gateway.v1.deleted"
  echo "  9) google.cloud.apigateway.gateway.v1.updated"
}

print_cloudeploy_events() {
  print_info "Cloud Deploy event types:"
  echo "  1) google.cloud.deploy.automation.v1.created"
  echo "  2) google.cloud.deploy.automation.v1.deleted"
  echo "  3) google.cloud.deploy.automation.v1.updated"
  echo "  4) google.cloud.deploy.customTargetType.v1.created"
  echo "  5) google.cloud.deploy.customTargetType.v1.deleted"
  echo "  6) google.cloud.deploy.customTargetType.v1.updated"
  echo "  7) google.cloud.deploy.deliveryPipeline.v1.created"
  echo "  8) google.cloud.deploy.deliveryPipeline.v1.deleted"
  echo "  9) google.cloud.deploy.deliveryPipeline.v1.updated"
  echo " 10) google.cloud.deploy.release.v1.created"
  echo " 11) google.cloud.deploy.rollout.v1.created"
  echo " 12) google.cloud.deploy.target.v1.created"
  echo " 13) google.cloud.deploy.target.v1.deleted"
  echo " 14) google.cloud.deploy.target.v1.updated"
}

print_header "Eventarc Trigger Deployment Tool"

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

# Trigger name
TRIGGER_NAME=$(get_input "Enter Eventarc trigger name")
if [ -z "$TRIGGER_NAME" ]; then
  print_error "Trigger name cannot be empty"
  exit 1
fi

# 1) Choose Eventarc location (global control plane location, e.g., eur3)
print_info "Fetching available Eventarc locations..."
if [ "$DRY_RUN" = false ]; then
  gcloud eventarc locations list --project="$PROJECT_ID" --format="table(locationId,name)" 2>/dev/null || print_warning "Could not list Eventarc locations"
else
  print_warning "[DRY RUN] Would run: gcloud eventarc locations list --project=$PROJECT_ID"
fi
echo ""

EVENTARC_LOCATION=$(get_input "Enter Eventarc location (e.g., eur3)" "eur3")

# 2) Ask Cloud Run service region
RUN_REGION=$(get_input "Enter Cloud Run service region" "europe-west1")
echo ""

# 3) List Cloud Run services in that region (name only)
print_header "Existing Cloud Run Services in $RUN_REGION"
if [ "$DRY_RUN" = false ]; then
  service_names=$(gcloud run services list \
    --region "$RUN_REGION" \
    --project "$PROJECT_ID" \
    --format="value(metadata.name)" 2>/dev/null)
else
  service_names=""
  print_warning "[DRY RUN] Would list Cloud Run services in region '$RUN_REGION'"
fi

services_array=()
if [ -n "$service_names" ]; then
  count=1
  while IFS= read -r svc; do
    if [ -n "$svc" ]; then
      services_array+=("$svc")
      printf "  ${GREEN}%2d)${NC} %s\n" "$count" "$svc"
      count=$((count + 1))
    fi
  done <<< "$service_names"
else
  print_warning "No Cloud Run services found in region '$RUN_REGION'"
fi
echo ""

# Ask destination Cloud Run service
DEST_SERVICE=""
if [ ${#services_array[@]} -gt 0 ]; then
  print_info "Select a Cloud Run service for the trigger destination:"
  while true; do
    read -p "$(echo -e ${YELLOW}Enter service number or name: ${NC})" selection
    if [ -z "$selection" ]; then
      print_error "Selection cannot be empty"
      continue
    fi
    if [[ "$selection" =~ ^[0-9]+$ ]]; then
      if [ "$selection" -ge 1 ] && [ "$selection" -le "${#services_array[@]}" ]; then
        DEST_SERVICE="${services_array[$((selection - 1))]}"
        break
      else
        print_error "Invalid number. Please select between 1 and ${#services_array[@]}"
      fi
    else
      DEST_SERVICE="$selection"
      break
    fi
  done
else
  DEST_SERVICE=$(get_input "Enter Cloud Run service name for trigger destination" "")
fi

if [ -z "$DEST_SERVICE" ]; then
  print_error "Destination Cloud Run service cannot be empty"
  exit 1
fi

echo ""

# 4) Event type selection
print_event_categories
echo ""
EVENT_TYPE=""
CATEGORY_CHOICE=$(get_input "Select event category [1-4]" "1")

case "$CATEGORY_CHOICE" in
  1)
    print_firestore_events
    choice=$(get_input "Select Firestore event type [1-4]" "1")
    case "$choice" in
      1) EVENT_TYPE="google.cloud.firestore.document.v1.created";;
      2) EVENT_TYPE="google.cloud.firestore.document.v1.updated";;
      3) EVENT_TYPE="google.cloud.firestore.document.v1.deleted";;
      4) EVENT_TYPE="google.cloud.firestore.document.v1.written";;
      *) print_error "Invalid Firestore event type choice"; exit 1;;
    esac
    ;;
  2)
    print_datastore_events
    choice=$(get_input "Select Datastore event type [1-4]" "1")
    case "$choice" in
      1) EVENT_TYPE="google.cloud.datastore.entity.v1.created";;
      2) EVENT_TYPE="google.cloud.datastore.entity.v1.updated";;
      3) EVENT_TYPE="google.cloud.datastore.entity.v1.deleted";;
      4) EVENT_TYPE="google.cloud.datastore.entity.v1.written";;
      *) print_error "Invalid Datastore event type choice"; exit 1;;
    esac
    ;;
  3)
    print_apigateway_events
    choice=$(get_input "Select API Gateway event type [1-9]" "1")
    case "$choice" in
      1) EVENT_TYPE="google.cloud.apigateway.api.v1.created";;
      2) EVENT_TYPE="google.cloud.apigateway.api.v1.deleted";;
      3) EVENT_TYPE="google.cloud.apigateway.api.v1.updated";;
      4) EVENT_TYPE="google.cloud.apigateway.apiConfig.v1.created";;
      5) EVENT_TYPE="google.cloud.apigateway.apiConfig.v1.deleted";;
      6) EVENT_TYPE="google.cloud.apigateway.apiConfig.v1.updated";;
      7) EVENT_TYPE="google.cloud.apigateway.gateway.v1.created";;
      8) EVENT_TYPE="google.cloud.apigateway.gateway.v1.deleted";;
      9) EVENT_TYPE="google.cloud.apigateway.gateway.v1.updated";;
      *) print_error "Invalid API Gateway event type choice"; exit 1;;
    esac
    ;;
  4)
    print_cloudeploy_events
    choice=$(get_input "Select Cloud Deploy event type [1-14]" "1")
    case "$choice" in
      1) EVENT_TYPE="google.cloud.deploy.automation.v1.created";;
      2) EVENT_TYPE="google.cloud.deploy.automation.v1.deleted";;
      3) EVENT_TYPE="google.cloud.deploy.automation.v1.updated";;
      4) EVENT_TYPE="google.cloud.deploy.customTargetType.v1.created";;
      5) EVENT_TYPE="google.cloud.deploy.customTargetType.v1.deleted";;
      6) EVENT_TYPE="google.cloud.deploy.customTargetType.v1.updated";;
      7) EVENT_TYPE="google.cloud.deploy.deliveryPipeline.v1.created";;
      8) EVENT_TYPE="google.cloud.deploy.deliveryPipeline.v1.deleted";;
      9) EVENT_TYPE="google.cloud.deploy.deliveryPipeline.v1.updated";;
      10) EVENT_TYPE="google.cloud.deploy.release.v1.created";;
      11) EVENT_TYPE="google.cloud.deploy.rollout.v1.created";;
      12) EVENT_TYPE="google.cloud.deploy.target.v1.created";;
      13) EVENT_TYPE="google.cloud.deploy.target.v1.deleted";;
      14) EVENT_TYPE="google.cloud.deploy.target.v1.updated";;
      *) print_error "Invalid Cloud Deploy event type choice"; exit 1;;
    esac
    ;;
  *)
    print_error "Invalid event category choice"
    exit 1
    ;;
esac

echo ""

# 5) Firestore/Datastore database & document filters (if applicable)
EVENT_FILTERS=()

EVENT_FILTERS+=("type=${EVENT_TYPE}")

if [[ "$EVENT_TYPE" == google.cloud.firestore.document.* ]]; then
  # Ask for Firestore database name (matches the --event-filters=database=... flag)
  DB_NAME=$(get_input "Enter Firestore database name/ID (e.g., serverless-epitech-firestore)" "serverless-epitech-firestore")
  EVENT_FILTERS+=("database=${DB_NAME}")

  if ask_yes_no "Do you want to filter on a specific document/collection path?" "y"; then
    echo ""
    print_info "Enter the document or collection path relative to 'documents/', e.g.:"
    print_info "  canvas_chunks/{docId}"
    USER_DOC_PATH=$(get_input "Enter Firestore document path" "canvas_chunks/{docId}")
    FULL_DOC_PATH="projects/${PROJECT_ID}/databases/${DB_NAME}/documents/${USER_DOC_PATH}"
    EVENT_FILTERS+=("document=${FULL_DOC_PATH}")
  fi
elif [[ "$EVENT_TYPE" == google.cloud.datastore.entity.* ]]; then
  DB_NAME=$(get_input "Enter Datastore database name/ID (leave empty for default)" "")
  if [ -n "$DB_NAME" ]; then
    EVENT_FILTERS+=("database=${DB_NAME}")
  fi
fi

echo ""

# 6) Service account for the trigger
SA_DEFAULT="${DEST_SERVICE}@${PROJECT_ID}.iam.gserviceaccount.com"
SERVICE_ACCOUNT_EMAIL=$(get_input "Enter service account for the trigger" "$SA_DEFAULT")

# 7) Event data content type
EVENT_DATA_CONTENT_TYPE=$(get_input "Enter event data content type" "application/protobuf")

echo ""
print_header "Trigger Configuration Summary"
echo -e "${BLUE}Trigger Name:${NC}          $TRIGGER_NAME"
echo -e "${BLUE}Project ID:${NC}            $PROJECT_ID"
echo -e "${BLUE}Eventarc Location:${NC}     $EVENTARC_LOCATION"
echo -e "${BLUE}Run Region:${NC}            $RUN_REGION"
echo -e "${BLUE}Destination Service:${NC}   $DEST_SERVICE"
echo -e "${BLUE}Event Type:${NC}            $EVENT_TYPE"
if [ ${#EVENT_FILTERS[@]} -gt 0 ]; then
  echo -e "${BLUE}Event Filters:${NC}"
  for f in "${EVENT_FILTERS[@]}"; do
    echo "  - $f"
  done
fi
echo -e "${BLUE}Service Account:${NC}       $SERVICE_ACCOUNT_EMAIL"
echo -e "${BLUE}Data Content Type:${NC}     $EVENT_DATA_CONTENT_TYPE"
echo ""

if ! ask_yes_no "Proceed with Eventarc trigger creation?" "y"; then
  print_info "Trigger creation cancelled by user"
  exit 0
fi

# Build gcloud command
CMD="gcloud eventarc triggers create \"$TRIGGER_NAME\" \
  --project=\"$PROJECT_ID\" \
  --location=\"$EVENTARC_LOCATION\" \
  --destination-run-service=\"$DEST_SERVICE\" \
  --destination-run-region=\"$RUN_REGION\" \
  --service-account=\"$SERVICE_ACCOUNT_EMAIL\" \
  --event-data-content-type=\"$EVENT_DATA_CONTENT_TYPE\""

for f in "${EVENT_FILTERS[@]}"; do
  CMD="$CMD \
  --event-filters=\"$f\""
done

echo ""
if [ "$DRY_RUN" = true ]; then
  print_warning "DRY-RUN MODE - No actual trigger creation will occur"
  echo ""
  echo "Would execute:"
  echo "gcloud eventarc triggers create \"$TRIGGER_NAME\" \\"
  echo "  --project=\"$PROJECT_ID\" \\"
  echo "  --location=\"$EVENTARC_LOCATION\" \\"
  echo "  --destination-run-service=\"$DEST_SERVICE\" \\"
  echo "  --destination-run-region=\"$RUN_REGION\" \\"
  echo "  --service-account=\"$SERVICE_ACCOUNT_EMAIL\" \\"
  echo "  --event-data-content-type=\"$EVENT_DATA_CONTENT_TYPE\""
  for f in "${EVENT_FILTERS[@]}"; do
    echo "  --event-filters=\"$f\""
  done
else
  print_info "Creating Eventarc trigger..."
  echo "Executing:"
  echo "gcloud eventarc triggers create \"$TRIGGER_NAME\" \\"
  echo "  --project=\"$PROJECT_ID\" \\"
  echo "  --location=\"$EVENTARC_LOCATION\" \\"
  echo "  --destination-run-service=\"$DEST_SERVICE\" \\"
  echo "  --destination-run-region=\"$RUN_REGION\" \\"
  echo "  --service-account=\"$SERVICE_ACCOUNT_EMAIL\" \\"
  echo "  --event-data-content-type=\"$EVENT_DATA_CONTENT_TYPE\""
  for f in "${EVENT_FILTERS[@]}"; do
    echo "  --event-filters=\"$f\""
  done
  eval $CMD
  if [ $? -eq 0 ]; then
    print_success "Eventarc trigger '$TRIGGER_NAME' created successfully"
  else
    print_error "Failed to create Eventarc trigger"
    exit 1
  fi
fi


