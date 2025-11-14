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

# Function to check if a Cloud Run service exists
check_service_exists() {
    local service_name="$1"
    local region="$2"
    local project="$3"
    
    gcloud run services describe "$service_name" \
        --region "$region" \
        --project "$project" \
        --format 'value(metadata.name)' 2>/dev/null
}

# Function to list existing Cloud Run services
list_services() {
    local region="$1"
    local project="$2"
    
    print_info "Fetching existing Cloud Run services..."
    gcloud run services list --region "$region" --project "$project" 2>/dev/null
}

# Function to display deployment summary
show_summary() {
    local mode="$1"
    
    echo ""
    print_header "Deployment Summary"
    echo -e "${BLUE}Mode:${NC} $mode"
    echo -e "${BLUE}Project ID:${NC} $PROJECT_ID"
    if [ -n "$SERVICE_ACCOUNT_NAME" ]; then
        echo -e "${BLUE}Service Account:${NC} ${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
    fi
    if [ -n "$SECRET_NAME" ]; then
        echo -e "${BLUE}Secret:${NC} $SECRET_NAME"
    fi
    if [ -n "$GATEWAY_SA" ]; then
        echo -e "${BLUE}API Gateway SA:${NC} $GATEWAY_SA"
    fi
    echo -e "${BLUE}Function Name:${NC} $FUNCTION_NAME"
    echo -e "${BLUE}Region:${NC} $REGION"
    echo -e "${BLUE}Source Directory:${NC} $SOURCE_DIR"
    echo -e "${BLUE}Base Image:${NC} $BASE_IMAGE"
    echo -e "${BLUE}Min Instances:${NC} $MIN_INSTANCES"
    echo -e "${BLUE}Allow Unauthenticated:${NC} $ALLOW_UNAUTH"
    echo ""
}

# Function to deploy Cloud Run service
deploy_service() {
    local is_update="$1"
    
    if [ "$is_update" = true ]; then
        print_header "Updating Cloud Run Service"
    else
        print_header "Deploying New Cloud Run Service"
        
        # Step 1: Create Service Account (only for new deployments)
        if [ -n "$SERVICE_ACCOUNT_NAME" ]; then
            echo ""
            print_info "Step 1: Creating Service Account"
            
            # Check if service account already exists
            if gcloud iam service-accounts describe "${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" --project="$PROJECT_ID" &>/dev/null; then
                print_warning "Service account '${SERVICE_ACCOUNT_NAME}' already exists"
                if ! ask_yes_no "Do you want to use the existing service account?" "y"; then
                    print_error "Deployment cancelled"
                    return 1
                fi
            else
                if [ "$DRY_RUN" = true ]; then
                    print_warning "[DRY RUN] Would create service account: ${SERVICE_ACCOUNT_NAME}"
                    echo "gcloud iam service-accounts create ${SERVICE_ACCOUNT_NAME} \\"
                    echo "  --display-name=\"Service Account for ${FUNCTION_NAME}\" \\"
                    echo "  --project=${PROJECT_ID}"
                else
                    gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
                        --display-name="Service Account for ${FUNCTION_NAME}" \
                        --project="$PROJECT_ID"
                    
                    if [ $? -ne 0 ]; then
                        print_error "Failed to create service account"
                        return 1
                    fi
                    print_success "Service account created successfully"
                fi
            fi
        fi
        
        # Step 2: Grant Secret Manager access (if secret is specified)
        if [ -n "$SECRET_NAME" ]; then
            echo ""
            print_info "Step 2: Granting Secret Manager access"
            
            if [ "$DRY_RUN" = true ]; then
                print_warning "[DRY RUN] Would grant Secret Manager access"
                echo "gcloud secrets add-iam-policy-binding ${SECRET_NAME} \\"
                echo "  --member=\"serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com\" \\"
                echo "  --role=\"roles/secretmanager.secretAccessor\" \\"
                echo "  --project=${PROJECT_ID}"
            else
                gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
                    --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
                    --role="roles/secretmanager.secretAccessor" \
                    --project="$PROJECT_ID"
                
                if [ $? -ne 0 ]; then
                    print_error "Failed to grant Secret Manager access"
                    return 1
                fi
                print_success "Secret Manager access granted successfully"
            fi
        fi
        
        # Step 3: Grant Logging access (always for new deployments)
        if [ -n "$SERVICE_ACCOUNT_NAME" ]; then
            echo ""
            print_info "Step 3: Granting Logging access"
            
            if [ "$DRY_RUN" = true ]; then
                print_warning "[DRY RUN] Would grant Logging access"
                echo "gcloud projects add-iam-policy-binding ${PROJECT_ID} \\"
                echo "  --member=\"serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com\" \\"
                echo "  --role=\"roles/logging.logWriter\""
            else
                gcloud projects add-iam-policy-binding "$PROJECT_ID" \
                    --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
                    --role="roles/logging.logWriter"
                
                if [ $? -ne 0 ]; then
                    print_error "Failed to grant Logging access"
                    return 1
                fi
                print_success "Logging access granted successfully"
            fi
            
            # Wait for IAM propagation
            if [ "$DRY_RUN" = false ]; then
                echo ""
                print_info "Waiting for IAM policy propagation..."
                sleep 10
            fi
        fi
    fi
    
    # Deploy the service
    echo ""
    if [ "$is_update" = true ]; then
        print_info "Step: Updating Cloud Run Service"
    else
        print_info "Step 4: Deploying Cloud Run Service"
    fi
    
    if [ "$DRY_RUN" = true ]; then
        print_warning "DRY RUN MODE - No actual deployment will occur"
        echo ""
        echo "Would execute:"
        echo "gcloud run deploy $FUNCTION_NAME \\"
        echo "  --source $SOURCE_DIR \\"
        echo "  --base-image $BASE_IMAGE \\"
        echo "  --region $REGION \\"
        if [ -n "$SERVICE_ACCOUNT_NAME" ]; then
            echo "  --service-account ${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com \\"
        fi
        echo "  --project=$PROJECT_ID \\"
        echo "  --cpu-boost \\"
        echo "  --execution-environment gen1 \\"
        echo "  --min-instances $MIN_INSTANCES \\"
        echo "  $ALLOW_UNAUTH"
        return 0
    fi
    
    # Build the deployment command
    local deploy_cmd="gcloud run deploy \"$FUNCTION_NAME\" \
        --source \"$SOURCE_DIR\" \
        --base-image \"$BASE_IMAGE\" \
        --region \"$REGION\" \
        --project=\"$PROJECT_ID\" \
        --cpu-boost \
        --execution-environment gen1 \
        --min-instances \"$MIN_INSTANCES\" \
        $ALLOW_UNAUTH"
    
    # Add service account only for new deployments
    if [ -n "$SERVICE_ACCOUNT_NAME" ]; then
        deploy_cmd="$deploy_cmd --service-account \"${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com\""
    fi
    
    # Execute deployment
    eval $deploy_cmd
    
    if [ $? -eq 0 ]; then
        print_success "Cloud Run service deployed successfully!"
        
        # Step 5: Grant API Gateway invoker access (only for new deployments)
        if [ "$is_update" = false ] && [ -n "$GATEWAY_SA" ]; then
            echo ""
            print_info "Step 5: Granting API Gateway invoker access"
            
            if [ "$DRY_RUN" = true ]; then
                print_warning "[DRY RUN] Would grant API Gateway invoker access"
                echo "gcloud run services add-iam-policy-binding ${FUNCTION_NAME} \\"
                echo "  --member=\"serviceAccount:${GATEWAY_SA}\" \\"
                echo "  --role=\"roles/run.invoker\" \\"
                echo "  --region=${REGION} \\"
                echo "  --project=${PROJECT_ID}"
            else
                gcloud run services add-iam-policy-binding "$FUNCTION_NAME" \
                    --member="serviceAccount:${GATEWAY_SA}" \
                    --role="roles/run.invoker" \
                    --region="$REGION" \
                    --project="$PROJECT_ID"
                
                if [ $? -ne 0 ]; then
                    print_warning "Failed to grant API Gateway invoker access (service deployed successfully)"
                else
                    print_success "API Gateway invoker access granted successfully"
                fi
            fi
        fi
        
        # Fetch function URL
        echo ""
        print_info "Fetching service URL..."
        FUNCTION_URL=$(gcloud run services describe "$FUNCTION_NAME" \
            --region "$REGION" \
            --project="$PROJECT_ID" \
            --format 'value(status.url)' 2>/dev/null)
        
        if [ -n "$FUNCTION_URL" ]; then
            echo ""
            print_success "Service URL: ${FUNCTION_URL}"
        else
            print_warning "Could not retrieve service URL. You can get it later with:"
            echo "gcloud run services describe $FUNCTION_NAME --region $REGION --project=$PROJECT_ID --format 'value(status.url)'"
        fi
        
        return 0
    else
        print_error "Deployment failed!"
        return 1
    fi
}

# Main script starts here
print_header "Cloud Run Deployment Tool"

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

# Ask deployment mode
echo "What would you like to do?"
echo "1) Deploy a new Cloud Run service"
echo "2) Update an existing Cloud Run service"
echo ""

while true; do
    read -p "$(echo -e ${YELLOW}Select option [1-2]: ${NC})" option
    case $option in
        1)
            DEPLOYMENT_MODE="new"
            break
            ;;
        2)
            DEPLOYMENT_MODE="update"
            break
            ;;
        *)
            print_error "Invalid option. Please select 1 or 2."
            ;;
    esac
done

echo ""

# Get region (default to europe-west1)
DEFAULT_REGION="europe-west1"
REGION=$(get_input "Enter deployment region" "$DEFAULT_REGION")

# Handle deployment mode
if [ "$DEPLOYMENT_MODE" = "update" ]; then
    # List existing services
    echo ""
    list_services "$REGION" "$PROJECT_ID"
    echo ""
    
    # Get service name to update
    FUNCTION_NAME=$(get_input "Enter the Cloud Run service name to update" "")
    
    if [ -z "$FUNCTION_NAME" ]; then
        print_error "Service name cannot be empty"
        exit 1
    fi
    
    # Check if service exists
    if ! check_service_exists "$FUNCTION_NAME" "$REGION" "$PROJECT_ID" >/dev/null 2>&1; then
        print_warning "Service '$FUNCTION_NAME' not found in region '$REGION'"
        if ! ask_yes_no "Do you want to create it as a new service instead?"; then
            print_info "Deployment cancelled"
            exit 0
        fi
        DEPLOYMENT_MODE="new"
    else
        print_success "Service '$FUNCTION_NAME' found"
    fi
else
    # Get new service name
    FUNCTION_NAME=$(get_input "Enter Cloud Run service name" "")
    
    if [ -z "$FUNCTION_NAME" ]; then
        print_error "Service name cannot be empty"
        exit 1
    fi
    
    # Check if service already exists
    if check_service_exists "$FUNCTION_NAME" "$REGION" "$PROJECT_ID" >/dev/null 2>&1; then
        print_warning "Service '$FUNCTION_NAME' already exists in region '$REGION'"
        if ask_yes_no "Do you want to update it instead?"; then
            DEPLOYMENT_MODE="update"
        else
            print_error "Please choose a different service name"
            exit 1
        fi
    fi
fi

echo ""

# Get deployment parameters
SOURCE_DIR=$(get_input "Enter source directory path" ".")

# Base image selection with suggestions
echo ""
print_info "Base Image Selection"
echo "Common options:"
echo "  1) nodejs22 (lightweight, latest)"
echo "  2) python313 (lightweight, latest)"
echo "  3) go125 (lightweight, latest)"
echo "  4) java21 (heavier, latest LTS)"
echo "  5) ruby34 (lightweight, latest)"
echo "  6) dotnet8 (heavier, latest LTS)"
echo "  7) php84 (lightweight, latest)"
echo "  8) Custom (enter your own)"
echo ""

while true; do
    read -p "$(echo -e ${YELLOW}Select base image [1-8]: ${NC})" base_image_option
    case $base_image_option in
        1) BASE_IMAGE="nodejs22"; break;;
        2) BASE_IMAGE="python313"; break;;
        3) BASE_IMAGE="go125"; break;;
        4) BASE_IMAGE="java21"; break;;
        5) BASE_IMAGE="ruby34"; break;;
        6) BASE_IMAGE="dotnet8"; break;;
        7) BASE_IMAGE="php84"; break;;
        8) 
            BASE_IMAGE=$(get_input "Enter custom base image" "")
            if [ -n "$BASE_IMAGE" ]; then
                break
            else
                print_error "Base image cannot be empty"
            fi
            ;;
        *)
            print_error "Invalid option. Please select 1-8."
            ;;
    esac
done

print_success "Selected base image: $BASE_IMAGE"
echo ""

MIN_INSTANCES=$(get_input "Enter minimum instances" "1")

# Service account configuration (only for new deployments)
echo ""
if [ "$DEPLOYMENT_MODE" = "new" ]; then
    print_info "Service Account Configuration"
    SERVICE_ACCOUNT_NAME=$(get_input "Enter service account name" "cloud-run-invoker")
    
    # Secret configuration (optional)
    echo ""
    SECRET_NAME=""
    if ask_yes_no "Do you need to use a Secret?" "n"; then
        while true; do
            SECRET_NAME=$(get_input "Enter the Secret name" "")
            
            if [ -z "$SECRET_NAME" ]; then
                print_warning "Secret name is empty"
                if ask_yes_no "Do you want to skip secret binding?" "y"; then
                    SECRET_NAME=""
                    break
                fi
            else
                # Validate secret exists (skip in dry-run mode)
                if [ "$DRY_RUN" = false ]; then
                    if ! gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" &>/dev/null; then
                        print_error "Secret '$SECRET_NAME' does not exist in project"
                        if ! ask_yes_no "Do you want to enter a different secret name?" "y"; then
                            SECRET_NAME=""
                            break
                        fi
                    else
                        print_success "Secret '$SECRET_NAME' found"
                        break
                    fi
                else
                    print_warning "DRY-RUN MODE: Skipping secret existence check"
                    break
                fi
            fi
        done
    fi
    
    # API Gateway invoker configuration
    echo ""
    GATEWAY_SA=""
    if ask_yes_no "Do you need to grant API Gateway invoker access?" "n"; then
        GATEWAY_SA=$(get_input "Enter API Gateway service account email" "api-gateway-invoker@${PROJECT_ID}.iam.gserviceaccount.com")
    fi
else
    print_info "Updating existing service - service account will be preserved"
    SERVICE_ACCOUNT_NAME=""
    SECRET_NAME=""
    GATEWAY_SA=""
fi

# Check authentication (always ask)
echo ""
if ask_yes_no "Allow unauthenticated access?" "n"; then
    ALLOW_UNAUTH="--allow-unauthenticated"
else
    ALLOW_UNAUTH="--no-allow-unauthenticated"
fi

# Show summary and confirm
if [ "$DEPLOYMENT_MODE" = "update" ]; then
    show_summary "Update Existing Service"
else
    show_summary "Deploy New Service"
fi

# Final confirmation
if ! ask_yes_no "Proceed with deployment?" "y"; then
    print_info "Deployment cancelled by user"
    exit 0
fi

# Deploy the service
if deploy_service $([ "$DEPLOYMENT_MODE" = "update" ] && echo true || echo false); then
    echo ""
    print_header "Deployment Complete!"
    if [ -n "$SERVICE_ACCOUNT_NAME" ]; then
        echo -e "${BLUE}Service Account:${NC} ${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
    fi
    echo -e "${BLUE}Function Name:${NC} ${FUNCTION_NAME}"
    echo -e "${BLUE}Region:${NC} ${REGION}"
    if [ -n "$FUNCTION_URL" ]; then
        echo -e "${BLUE}Service URL:${NC} ${FUNCTION_URL}"
    fi
    echo ""
else
    print_error "Deployment failed. Please check the errors above."
    exit 1
fi
