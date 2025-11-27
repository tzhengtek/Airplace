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
    
    print_info "Fetching existing Cloud Run services in region '$region'..."
    echo ""
    
    # Get services with detailed information
    local services_data=$(gcloud run services list \
        --region "$region" \
        --project "$project" \
        --format="value(metadata.name,status.url)" 2>/dev/null)
    
    if [ -z "$services_data" ]; then
        print_warning "No Cloud Run services found in region '$region'"
        return 1
    fi
    
    # Display formatted list
    print_info "Available services in region '$region':"
    echo ""
    local count=1
    while IFS=$'\t' read -r service_name url; do
        if [ -n "$service_name" ]; then
            printf "  ${GREEN}%2d)${NC} %-40s ${BLUE}%s${NC}\n" "$count" "$service_name" "$url"
            count=$((count + 1))
        fi
    done <<< "$services_data"
    echo ""
    return 0
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
        if [ ${#SA_ROLES[@]} -gt 0 ]; then
            echo -e "${BLUE}Service Account Roles:${NC}"
            for role in "${SA_ROLES[@]}"; do
                echo -e "  - ${role}"
            done
        fi
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
    if [ -n "$ENTRYPOINT" ]; then
        echo -e "${BLUE}Entrypoint:${NC} $ENTRYPOINT"
    fi
    if [ -n "$ENV_VARS" ]; then
        echo -e "${BLUE}Environment Variables:${NC} $ENV_VARS"
    fi
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
                    
                    # Wait for Google Cloud to update the service account
                    echo ""
                    print_info "Waiting 10 seconds for Google Cloud to propagate service account changes..."
                    sleep 10
                    print_success "Service account propagation complete"
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
        
        # Step 3b: Grant additional IAM roles to service account
        if [ ${#SA_ROLES[@]} -gt 0 ] && [ -n "$SERVICE_ACCOUNT_NAME" ]; then
            echo ""
            print_info "Step 3b: Granting additional IAM roles to service account"
            
            for role in "${SA_ROLES[@]}"; do
                if [ "$DRY_RUN" = true ]; then
                    print_warning "[DRY RUN] Would grant role to service account"
                    echo "gcloud projects add-iam-policy-binding ${PROJECT_ID} \\"
                    echo "  --member=\"serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com\" \\"
                    echo "  --role=\"${role}\""
                else
                    print_info "Granting ${role} to service account..."
                    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
                        --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
                        --role="$role"
                    
                    if [ $? -eq 0 ]; then
                        print_success "Role granted: ${role}"
                    else
                        print_warning "Failed to grant role: ${role}"
                    fi
                fi
            done
            
            # Wait for IAM propagation after granting roles
            if [ "$DRY_RUN" = false ] && [ ${#SA_ROLES[@]} -gt 0 ]; then
                echo ""
                print_info "Waiting for IAM policy propagation..."
                sleep 5
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
        if [ -n "$SERVICE_ACCOUNT_NAME" ] && [ "$is_update" = false ]; then
            echo "  --service-account ${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com \\"
        fi
        echo "  --project=$PROJECT_ID \\"
        echo "  --cpu-boost \\"
        echo "  --execution-environment gen1 \\"
        echo "  --min-instances $MIN_INSTANCES \\"
        if [ -n "$ENTRYPOINT" ]; then
            echo "  --function $ENTRYPOINT \\"
        fi
        if [ -n "$ENV_VARS" ]; then
            if [ "$is_update" = true ]; then
                echo "  --update-env-vars $ENV_VARS \\"
            else
                echo "  --set-env-vars $ENV_VARS \\"
            fi
        fi
        if [ -n "$SECRET_NAME" ] && [ -n "$SECRET_ENV_KEY" ]; then
            if [ "$is_update" = true ]; then
                echo "  --update-secrets ${SECRET_ENV_KEY}=${SECRET_NAME}:latest \\"
            else
                echo "  --set-secrets ${SECRET_ENV_KEY}=${SECRET_NAME}:latest \\"
            fi
        fi
        echo "  $ALLOW_UNAUTH"
        
        # Show service account roles that would be applied
        if [ ${#SA_ROLES[@]} -gt 0 ] && [ -n "$SERVICE_ACCOUNT_NAME" ]; then
            echo ""
            echo "Would also grant IAM roles to service account:"
            for role in "${SA_ROLES[@]}"; do
                echo "gcloud projects add-iam-policy-binding $PROJECT_ID \\"
                echo "  --member=\"serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com\" \\"
                echo "  --role=\"${role}\""
            done
        fi
        
        return 0
    fi
    
    # Build the deployment command
    local deploy_cmd="gcloud run deploy \"$FUNCTION_NAME\" \
        --source \"$SOURCE_DIR\" \
        --base-image \"$BASE_IMAGE\" \
        --region \"$REGION\" \
        --project=\"$PROJECT_ID\" \
        --cpu-boost \
        --timeout=600 \
        --execution-environment gen1 \
        --min-instances \"$MIN_INSTANCES\" \
        $ALLOW_UNAUTH"
    
    # Add entrypoint if specified
    if [ -n "$ENTRYPOINT" ]; then
        deploy_cmd="$deploy_cmd --function \"$ENTRYPOINT\""
    fi
    
    # Add environment variables if specified
    if [ -n "$ENV_VARS" ]; then
        if [ "$is_update" = true ]; then
            deploy_cmd="$deploy_cmd --update-env-vars \"$ENV_VARS\""
        else
            deploy_cmd="$deploy_cmd --set-env-vars \"$ENV_VARS\""
        fi
    fi
    
    # Add secret environment variable if specified
    if [ -n "$SECRET_NAME" ] && [ -n "$SECRET_ENV_KEY" ]; then
        if [ "$is_update" = true ]; then
            deploy_cmd="$deploy_cmd --update-secrets \"${SECRET_ENV_KEY}=${SECRET_NAME}:latest\""
        else
            deploy_cmd="$deploy_cmd --set-secrets \"${SECRET_ENV_KEY}=${SECRET_NAME}:latest\""
        fi
    fi
    
    # Add service account only for new deployments
    if [ -n "$SERVICE_ACCOUNT_NAME" ] && [ "$is_update" = false ]; then
        deploy_cmd="$deploy_cmd --service-account \"${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com\""
    fi
    
    # Execute deployment
    echo "Executing:"
    echo "gcloud run deploy \"$FUNCTION_NAME\" \\"
    echo "  --source \"$SOURCE_DIR\" \\"
    echo "  --base-image \"$BASE_IMAGE\" \\"
    echo "  --region \"$REGION\" \\"
    echo "  --project=\"$PROJECT_ID\" \\"
    echo "  --cpu-boost \\"
    echo "  --timeout=600 \\"
    echo "  --execution-environment gen1 \\"
    echo "  --min-instances \"$MIN_INSTANCES\""
    if [ -n "$ENTRYPOINT" ]; then
        echo "  --function \"$ENTRYPOINT\""
    fi
    if [ -n "$ENV_VARS" ]; then
        if [ "$is_update" = true ]; then
            echo "  --update-env-vars \"$ENV_VARS\""
        else
            echo "  --set-env-vars \"$ENV_VARS\""
        fi
    fi
    if [ -n "$SECRET_NAME" ] && [ -n "$SECRET_ENV_KEY" ]; then
        if [ "$is_update" = true ]; then
            echo "  --update-secrets \"${SECRET_ENV_KEY}=${SECRET_NAME}:latest\""
        else
            echo "  --set-secrets \"${SECRET_ENV_KEY}=${SECRET_NAME}:latest\""
        fi
    fi
    if [ -n "$SERVICE_ACCOUNT_NAME" ] && [ "$is_update" = false ]; then
        echo "  --service-account \"${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com\""
    fi
    echo "  $ALLOW_UNAUTH"
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
        
        # Step 6: Grant IAM roles to service account (for both new and update)
        if [ ${#SA_ROLES[@]} -gt 0 ] && [ -n "$SERVICE_ACCOUNT_NAME" ]; then
            echo ""
            if [ "$is_update" = true ]; then
                print_info "Step 6: Granting additional IAM roles to service account"
            else
                print_info "Step 6: Granting additional IAM roles to service account"
            fi
            
            for role in "${SA_ROLES[@]}"; do
                if [ "$DRY_RUN" = true ]; then
                    print_warning "[DRY RUN] Would grant role to service account"
                    echo "gcloud projects add-iam-policy-binding ${PROJECT_ID} \\"
                    echo "  --member=\"serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com\" \\"
                    echo "  --role=\"${role}\""
                else
                    print_info "Granting ${role} to service account..."
                    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
                        --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
                        --role="$role"
                    
                    if [ $? -eq 0 ]; then
                        print_success "Role granted: ${role}"
                    else
                        print_warning "Failed to grant role: ${role}"
                    fi
                fi
            done
            
            # Wait for IAM propagation after granting roles
            if [ "$DRY_RUN" = false ] && [ ${#SA_ROLES[@]} -gt 0 ]; then
                echo ""
                print_info "Waiting for IAM policy propagation..."
                sleep 5
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

# Initialize arrays
SA_ROLES=()

# 1) Ask region
DEFAULT_REGION="europe-west1"
REGION=$(get_input "Enter deployment region" "$DEFAULT_REGION")
echo ""

# 2) Fetch and display all existing Cloud Run services in the region
print_header "Existing Cloud Run Services"
services_data=$(gcloud run services list \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --format="value(metadata.name,status.url)" 2>/dev/null)

if [ -z "$services_data" ]; then
    print_warning "No Cloud Run services found in region '$REGION'"
    echo ""
    DEPLOYMENT_MODE="new"
else
    # Display numbered list of services
    count=1
    services_array=()
    print_info "Available services in region '$REGION':"
    echo ""
    while IFS=$'\t' read -r service_name url; do
        if [ -n "$service_name" ]; then
            services_array+=("$service_name")
            printf "  ${GREEN}%2d)${NC} %-40s ${BLUE}%s${NC}\n" "$count" "$service_name" "$url"
            count=$((count + 1))
        fi
    done <<< "$services_data"
    echo ""
    
    # 3) Ask deployment mode (new or update)
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
fi

echo ""

# 4) Handle deployment mode
if [ "$DEPLOYMENT_MODE" = "update" ]; then
    # Get service name to update (from the list already shown above)
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
    # New service: ask for basic parameters
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

# For both new and update, ask deployment parameters in a clear order:
# entrypoint, base image, source, instances, env vars.

# Entrypoint configuration (required)
ENTRYPOINT=""
while [ -z "$ENTRYPOINT" ]; do
    ENTRYPOINT=$(get_input "Enter entrypoint command" "")
    if [ -z "$ENTRYPOINT" ]; then
        print_error "Entrypoint cannot be empty. Please provide a command."
    else
        print_success "Entrypoint set to: $ENTRYPOINT"
    fi
done

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

# Source directory
SOURCE_DIR=$(get_input "Enter source directory path" ".")

# Minimum instances (show existing on update if possible)
DEFAULT_MIN="1"
if [ "$DEPLOYMENT_MODE" = "update" ] && [ "$DRY_RUN" = false ]; then
    EXISTING_MIN=$(gcloud run services describe "$FUNCTION_NAME" \
        --region "$REGION" \
        --project="$PROJECT_ID" \
        --format="value(spec.template.metadata.annotations[\"autoscaling.knative.dev/minScale\"])" 2>/dev/null)
    if [ -n "$EXISTING_MIN" ]; then
        DEFAULT_MIN="$EXISTING_MIN"
        print_info "Current minimum instances for '$FUNCTION_NAME': $EXISTING_MIN"
    fi
fi
MIN_INSTANCES=$(get_input "Enter minimum instances" "$DEFAULT_MIN")

# Environment variables configuration
echo ""
print_info "Environment Variables Configuration"
if [ "$DEPLOYMENT_MODE" = "update" ]; then
    print_info "Existing environment variables for service '$FUNCTION_NAME':"
    gcloud run services describe "$FUNCTION_NAME" \
        --region "$REGION" \
        --project="$PROJECT_ID" \
        --format="yaml(spec.template.spec.containers[0].env)" 2>/dev/null || print_warning "Could not retrieve existing environment variables"
    echo ""
fi
print_info "Enter environment variables. Leave KEY empty to finish."
ENV_VARS=""
ENV_COUNT=0

while true; do
    ENV_COUNT=$((ENV_COUNT + 1))
    echo ""
    ENV_KEY=$(get_input "Enter environment variable KEY (or leave empty to finish)" "")
    
    # If KEY is empty, stop collecting environment variables
    if [ -z "$ENV_KEY" ]; then
        if [ $ENV_COUNT -eq 1 ]; then
            print_info "No additional environment variables configured"
        else
            print_success "Finished configuring environment variables"
        fi
        break
    fi
    
    # Ask for VALUE, showing which KEY we're setting
    ENV_VALUE=$(get_input "Setting $ENV_KEY: Enter value" "")
    
    if [ -z "$ENV_VALUE" ]; then
        print_warning "Value is empty for $ENV_KEY. Skipping this variable."
        ENV_COUNT=$((ENV_COUNT - 1))
        continue
    fi
    
    # Add to ENV_VARS string in format KEY1=VALUE1,KEY2=VALUE2
    if [ -z "$ENV_VARS" ]; then
        ENV_VARS="${ENV_KEY}=${ENV_VALUE}"
    else
        ENV_VARS="${ENV_VARS},${ENV_KEY}=${ENV_VALUE}"
    fi
    
    print_success "Added: $ENV_KEY=$ENV_VALUE"
done

if [ -n "$ENV_VARS" ]; then
    echo ""
    print_success "Environment variables configured: $ENV_VARS"
fi

# Service account configuration (only for new deployments)
echo ""
if [ "$DEPLOYMENT_MODE" = "new" ]; then
    print_info "Service Account Configuration"
    SERVICE_ACCOUNT_NAME=$(get_input "Enter service account name" "cloud-run-invoker")
    
    # Secret configuration (optional)
    echo ""
    SECRET_NAME=""
    SECRET_ENV_KEY=""
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
    
    if [ -n "$SECRET_NAME" ]; then
        SECRET_ENV_KEY=$(get_input "Enter environment variable name to expose this secret (leave empty to only configure IAM)" "")
    fi
    
    # Service Account IAM Roles configuration
    echo ""
    print_info "Service Account IAM Roles Configuration"
    print_info "Grant IAM roles to the service account"
    SA_ROLES=()
    SA_ROLE_COUNT=0
    
    while true; do
        SA_ROLE_COUNT=$((SA_ROLE_COUNT + 1))
        echo ""
        print_info "Common IAM roles for Cloud Run services:"
        echo "  1) roles/pubsub.publisher           – Can publish messages to Pub/Sub topics."
        echo "  2) roles/pubsub.subscriber          – Can pull and consume Pub/Sub messages."
        echo "  3) roles/pubsub.viewer              – Read-only access to Pub/Sub topics and subscriptions."
        echo "  4) roles/pubsub.editor              – Can modify Pub/Sub topics and subscriptions."
        echo "  5) roles/storage.objectViewer       – Read-only access to Cloud Storage objects."
        echo "  6) roles/storage.objectCreator      – Can upload new objects to Cloud Storage."
        echo "  7) roles/firestore.user             – Read/write access to Firestore (native mode)."
        echo "  8) roles/datastore.user             – Read/write access to Firestore in Datastore mode."
        echo "  9) roles/logging.logWriter          – Write logs to Cloud Logging."
        echo "  10) roles/secretmanager.secretAccessor – Read access to secrets from Secret Manager."
        echo "  11) roles/eventarc.eventReceiver    – Allows receiving Eventarc events."
        echo "  12) roles/run.invoker               – Allows invoking Cloud Run services."
        echo "  13) Custom (enter your own role)"
        echo "  14) Skip / Finish (no more roles)"
        echo ""
        
        read -p "$(echo -e ${YELLOW}Select role [1-14]: ${NC})" role_option
        
        # If empty or 14, stop collecting roles
        if [ -z "$role_option" ] || [ "$role_option" = "14" ]; then
            if [ $SA_ROLE_COUNT -eq 1 ]; then
                print_info "No additional IAM roles configured for service account"
            else
                print_success "Finished configuring service account IAM roles"
            fi
            break
        fi
        
        SA_ROLE=""
        case $role_option in
            1) SA_ROLE="roles/pubsub.publisher";;
            2) SA_ROLE="roles/pubsub.subscriber";;
            3) SA_ROLE="roles/pubsub.viewer";;
            4) SA_ROLE="roles/pubsub.editor";;
            5) SA_ROLE="roles/storage.objectViewer";;
            6) SA_ROLE="roles/storage.objectCreator";;
            7) SA_ROLE="roles/firestore.user";;
            8) SA_ROLE="roles/datastore.user";;
            9) SA_ROLE="roles/logging.logWriter";;
            10) SA_ROLE="roles/secretmanager.secretAccessor";;
            11) SA_ROLE="roles/eventarc.eventReceiver";;
            12) SA_ROLE="roles/run.invoker";;
            13) 
                SA_ROLE=$(get_input "Enter custom IAM role" "")
                if [ -z "$SA_ROLE" ]; then
                    print_error "Role cannot be empty"
                    SA_ROLE_COUNT=$((SA_ROLE_COUNT - 1))
                    continue
                fi
                ;;
            *)
                print_error "Invalid option. Please select 1-14."
                SA_ROLE_COUNT=$((SA_ROLE_COUNT - 1))
                continue
                ;;
        esac
        
        if [ -n "$SA_ROLE" ]; then
            # Store the role
            SA_ROLES+=("$SA_ROLE")
            print_success "Added role: $SA_ROLE"
        fi
    done
    
    if [ ${#SA_ROLES[@]} -gt 0 ]; then
        echo ""
        print_success "Service account roles configured: ${#SA_ROLES[@]} role(s)"
    fi
    
    # API Gateway invoker configuration
    echo ""
    GATEWAY_SA=""
    if ask_yes_no "Do you need to grant API Gateway invoker access?" "n"; then
        GATEWAY_SA=$(get_input "Enter API Gateway service account email" "api-gateway-invoker@${PROJECT_ID}.iam.gserviceaccount.com")
    fi
else
    print_info "Updating existing service - retrieving current service account..."
    
    # Retrieve the existing service account from the Cloud Run service
    if [ "$DRY_RUN" = false ]; then
        EXISTING_SA=$(gcloud run services describe "$FUNCTION_NAME" \
            --region "$REGION" \
            --project="$PROJECT_ID" \
            --format='value(spec.template.spec.serviceAccountName)' 2>/dev/null)
        
        if [ -n "$EXISTING_SA" ] && [ "$EXISTING_SA" != "default" ] && [ "$EXISTING_SA" != "${PROJECT_ID}@appspot.gserviceaccount.com" ]; then
            # Extract service account name from email (e.g., "my-sa@project.iam.gserviceaccount.com" -> "my-sa")
            # Handle both formats: "my-sa@project.iam.gserviceaccount.com" and just "my-sa"
            if [[ "$EXISTING_SA" == *"@"* ]]; then
                SERVICE_ACCOUNT_NAME=$(echo "$EXISTING_SA" | sed 's/@.*//')
            else
                SERVICE_ACCOUNT_NAME="$EXISTING_SA"
            fi
            print_success "Found existing service account: ${EXISTING_SA}"
            echo ""
        else
            print_warning "No custom service account configured for this service (using default compute service account)"
            echo ""
            SERVICE_ACCOUNT_NAME=""
        fi
    else
        print_warning "[DRY RUN] Would retrieve service account from existing service"
        SERVICE_ACCOUNT_NAME=""
    fi
    
    SECRET_NAME=""
    SECRET_ENV_KEY=""
    GATEWAY_SA=""
    SA_ROLES=()
    
    # Secret configuration (optional for update – show existing config first)
    echo ""
    print_info "Secret Configuration (existing service)"
    print_info "Current service configuration (including environment and secret references):"
    if [ "$DRY_RUN" = false ]; then
        gcloud run services describe "$FUNCTION_NAME" \
            --region "$REGION" \
            --project="$PROJECT_ID" \
            --format="yaml(spec.template.spec.containers[0].env,spec.template.spec.containers[0].envFrom)" 2>/dev/null || \
        print_warning "Could not retrieve existing secret / env configuration"
    else
        print_warning "[DRY RUN] Would display existing secret and environment configuration for service '$FUNCTION_NAME'"
    fi
    echo ""
    if ask_yes_no "Do you want to add or update a Secret binding?" "n"; then
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
        
        if [ -n "$SECRET_NAME" ]; then
            SECRET_ENV_KEY=$(get_input "Enter environment variable name to expose this secret (leave empty to only configure IAM)" "")
        fi
    fi
    
    # If we have a service account, ask about IAM roles
    if [ -n "$SERVICE_ACCOUNT_NAME" ]; then
        # Service Account IAM Roles configuration
        echo ""
        print_info "Service Account IAM Roles Configuration"
        print_info "Grant additional IAM roles to the service account: ${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
        if [ "$DRY_RUN" = false ]; then
            echo ""
            print_info "Existing IAM roles for this service account (project-level):"
            gcloud projects get-iam-policy "$PROJECT_ID" \
                --flatten="bindings[]" \
                --format="table(bindings.role)" \
                --filter="bindings.members:serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" 2>/dev/null || \
            print_warning "Could not retrieve existing IAM roles for service account"
        else
            print_warning "[DRY RUN] Would display existing IAM roles for service account ${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
        fi
        SA_ROLE_COUNT=0
        
        while true; do
            SA_ROLE_COUNT=$((SA_ROLE_COUNT + 1))
            echo ""
            print_info "Common IAM roles for Cloud Run services:"
            echo "  1) roles/pubsub.publisher           – Can publish messages to Pub/Sub topics."
            echo "  2) roles/pubsub.subscriber          – Can pull and consume Pub/Sub messages."
            echo "  3) roles/pubsub.viewer              – Read-only access to Pub/Sub topics and subscriptions."
            echo "  4) roles/pubsub.editor              – Can modify Pub/Sub topics and subscriptions."
            echo "  5) roles/storage.objectViewer       – Read-only access to Cloud Storage objects."
            echo "  6) roles/storage.objectCreator      – Can upload new objects to Cloud Storage."
            echo "  7) roles/firestore.user             – Read/write access to Firestore (native mode)."
            echo "  8) roles/datastore.user             – Read/write access to Firestore in Datastore mode."
            echo "  9) roles/logging.logWriter          – Write logs to Cloud Logging."
            echo "  10) roles/secretmanager.secretAccessor – Read access to secrets from Secret Manager."
            echo "  11) roles/eventarc.eventReceiver    – Allows receiving Eventarc events."
            echo "  12) roles/run.invoker               – Allows invoking Cloud Run services."
            echo "  13) Custom (enter your own role)"
            echo "  14) Skip / Finish (no more roles)"
            echo ""
            
            read -p "$(echo -e ${YELLOW}Select role [1-14]: ${NC})" role_option
            
            # If empty or 14, stop collecting roles
            if [ -z "$role_option" ] || [ "$role_option" = "14" ]; then
                if [ $SA_ROLE_COUNT -eq 1 ]; then
                    print_info "No additional IAM roles configured for service account"
                else
                    print_success "Finished configuring service account IAM roles"
                fi
                break
            fi
            
            SA_ROLE=""
            case $role_option in
                1) SA_ROLE="roles/pubsub.publisher";;
                2) SA_ROLE="roles/pubsub.subscriber";;
                3) SA_ROLE="roles/pubsub.viewer";;
                4) SA_ROLE="roles/pubsub.editor";;
                5) SA_ROLE="roles/storage.objectViewer";;
                6) SA_ROLE="roles/storage.objectCreator";;
                7) SA_ROLE="roles/firestore.user";;
                8) SA_ROLE="roles/datastore.user";;
                9) SA_ROLE="roles/logging.logWriter";;
                10) SA_ROLE="roles/secretmanager.secretAccessor";;
                11) SA_ROLE="roles/eventarc.eventReceiver";;
                12) SA_ROLE="roles/run.invoker";;
                13) 
                    SA_ROLE=$(get_input "Enter custom IAM role" "")
                    if [ -z "$SA_ROLE" ]; then
                        print_error "Role cannot be empty"
                        SA_ROLE_COUNT=$((SA_ROLE_COUNT - 1))
                        continue
                    fi
                    ;;
                *)
                    print_error "Invalid option. Please select 1-14."
                    SA_ROLE_COUNT=$((SA_ROLE_COUNT - 1))
                    continue
                    ;;
            esac
            
            if [ -n "$SA_ROLE" ]; then
                # Store the role
                SA_ROLES+=("$SA_ROLE")
                print_success "Added role: $SA_ROLE"
            fi
        done
        
        if [ ${#SA_ROLES[@]} -gt 0 ]; then
            echo ""
            print_success "Service account roles configured: ${#SA_ROLES[@]} role(s)"
        fi
    fi
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
        if [ ${#SA_ROLES[@]} -gt 0 ]; then
            echo -e "${BLUE}Service Account Roles Granted:${NC}"
            for role in "${SA_ROLES[@]}"; do
                echo -e "  - ${role}"
            done
        fi
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
