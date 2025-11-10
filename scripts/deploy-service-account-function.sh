#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check for dry-run mode
DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
    DRY_RUN=true
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}DRY RUN MODE: Commands will be displayed but not executed${NC}"
    echo -e "${YELLOW}========================================${NC}"
    echo ""
fi

# Helper function to prompt for yes/no with retry
prompt_yes_no() {
    local prompt_text="$1"
    local response=""
    
    while true; do
        echo -e "${BLUE}${prompt_text} (y/n):${NC}"
        read -p "> " response
        
        if [[ "$response" =~ ^[Yy]$ ]]; then
            return 0  # true
        elif [[ "$response" =~ ^[Nn]$ ]]; then
            return 1  # false
        else
            echo -e "${YELLOW}Please enter 'y' for yes or 'n' for no${NC}"
        fi
    done
}

# Helper function to execute command (with dry-run support)
execute_command() {
    local command="$1"
    local description="$2"
    
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}[DRY RUN] Would execute: ${command}${NC}"
        return 0
    else
        eval "$command"
        local exit_code=$?
        if [ $exit_code -eq 0 ]; then
            if [ ! -z "$description" ]; then
                echo -e "${GREEN}✓ ${description}${NC}"
            fi
            return 0
        else
            if [ ! -z "$description" ]; then
                echo -e "${RED}✗ Failed: ${description}${NC}"
                echo -e "${YELLOW}Command that failed: ${command}${NC}"
            fi
            return $exit_code
        fi
    fi
}

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}GCP Cloud Function Deployment Script${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Get current project ID from gcloud
echo -e "${YELLOW}Getting current GCP project...${NC}"
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)

if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}ERROR: No project is set in gcloud. Please run: gcloud config set project YOUR_PROJECT_ID${NC}"
    exit 1
fi

echo -e "${GREEN}Using project: ${PROJECT_ID}${NC}"
echo ""

# Prompt for Service Account details
echo -e "${BLUE}Enter Service Account name (e.g., my-function-sa):${NC}"
read -p "> " SERVICE_ACCOUNT_NAME

if [ -z "$SERVICE_ACCOUNT_NAME" ]; then
    echo -e "${RED}ERROR: Service Account name cannot be empty${NC}"
    exit 1
fi

# Validate service account name format (alphanumeric and hyphens only)
if [[ ! "$SERVICE_ACCOUNT_NAME" =~ ^[a-z0-9-]+$ ]]; then
    echo -e "${RED}ERROR: Service Account name must contain only lowercase letters, numbers, and hyphens${NC}"
    exit 1
fi

# Check if service account already exists
SKIP_SA_CREATE=false
if gcloud iam service-accounts describe ${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com --project=$PROJECT_ID &>/dev/null; then
    echo -e "${YELLOW}Service account '${SERVICE_ACCOUNT_NAME}' already exists.${NC}"
    if prompt_yes_no "Do you want to skip creation and use the existing one?"; then
        SKIP_SA_CREATE=true
        echo -e "${GREEN}Using existing service account${NC}"
    else
        echo -e "${YELLOW}Cancelled. Exiting script.${NC}"
        exit 0
    fi
fi

echo -e "${BLUE}Enter Service Account display name/description:${NC}"
read -p "> " SA_DESCRIPTION

if [ -z "$SA_DESCRIPTION" ]; then
    SA_DESCRIPTION="Service Account for Cloud Function"
fi

# Prompt for Secret (optional)
SECRET_NAME=""
if prompt_yes_no "Do you need to use a Secret?"; then
    while true; do
        echo -e "${BLUE}Enter the Secret name:${NC}"
        read -p "> " SECRET_NAME
        
        if [ -z "$SECRET_NAME" ]; then
            echo -e "${YELLOW}Warning: Secret name is empty${NC}"
            if prompt_yes_no "Do you want to skip secret binding?"; then
                SECRET_NAME=""
                break
            fi
        else
            # Validate secret exists
            if [ "$DRY_RUN" = false ]; then
                if ! gcloud secrets describe $SECRET_NAME --project=$PROJECT_ID &>/dev/null; then
                    echo -e "${RED}ERROR: Secret '$SECRET_NAME' does not exist in project${NC}"
                    if ! prompt_yes_no "Do you want to enter a different secret name?"; then
                        SECRET_NAME=""
                        break
                    fi
                else
                    echo -e "${GREEN}Secret '$SECRET_NAME' found${NC}"
                    break
                fi
            else
                echo -e "${YELLOW}[DRY RUN] Skipping secret existence check${NC}"
                break
            fi
        fi
    done
fi

# Prompt for Cloud Run Function name
echo -e "${BLUE}Enter Cloud Run service name (e.g., my-http-function):${NC}"
read -p "> " FUNCTION_NAME

if [ -z "$FUNCTION_NAME" ]; then
    echo -e "${RED}ERROR: Function name cannot be empty${NC}"
    exit 1
fi

# Validate function name format (alphanumeric and hyphens only)
if [[ ! "$FUNCTION_NAME" =~ ^[a-z0-9-]+$ ]]; then
    echo -e "${RED}ERROR: Function name must contain only lowercase letters, numbers, and hyphens${NC}"
    exit 1
fi

# Prompt for source directory
echo -e "${BLUE}Enter source directory (default: .):${NC}"
read -p "> " SOURCE_DIR
SOURCE_DIR=${SOURCE_DIR:-.}

# Validate source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
    echo -e "${RED}ERROR: Source directory '$SOURCE_DIR' does not exist${NC}"
    exit 1
fi

# Prompt for region
echo -e "${BLUE}Enter region (default: europe-west1):${NC}"
read -p "> " REGION
REGION=${REGION:-europe-west1}

# Prompt for function entry point
echo -e "${BLUE}Enter function entry point (e.g., HelloGet):${NC}"
read -p "> " ENTRY_POINT

if [ -z "$ENTRY_POINT" ]; then
    echo -e "${RED}ERROR: Entry point cannot be empty${NC}"
    exit 1
fi

# Prompt for base image with validation
while true; do
    echo ""
    echo -e "${BLUE}Select base image:${NC}"
    echo "1) nodejs22 (lightweight, latest)"
    echo "2) python313 (lightweight, latest)"
    echo "3) go125 (lightweight, latest)"
    echo "4) java21 (heavier, latest LTS)"
    echo "5) ruby34 (lightweight, latest)"
    echo "6) dotnet8 (heavier, latest LTS)"
    echo "7) php84 (lightweight, latest)"
    echo "8) Enter custom base image"
    read -p "> " IMAGE_CHOICE
    
    case $IMAGE_CHOICE in
        1) BASE_IMAGE="nodejs22"; break ;;
        2) BASE_IMAGE="python313"; break ;;
        3) BASE_IMAGE="go125"; break ;;
        4) BASE_IMAGE="java21"; break ;;
        5) BASE_IMAGE="ruby34"; break ;;
        6) BASE_IMAGE="dotnet8"; break ;;
        7) BASE_IMAGE="php84"; break ;;
        8) 
            echo -e "${BLUE}Enter custom base image name:${NC}"
            read -p "> " BASE_IMAGE
            if [ ! -z "$BASE_IMAGE" ]; then
                break
            else
                echo -e "${RED}Base image name cannot be empty${NC}"
            fi
            ;;
        *) 
            echo -e "${RED}Invalid choice. Please enter a number between 1-8${NC}"
            ;;
    esac
done

echo -e "${GREEN}Selected base image: ${BASE_IMAGE}${NC}"

echo ""
echo -e "${GREEN}Configuration Summary:${NC}"
echo -e "Project ID: ${PROJECT_ID}"
echo -e "Service Account: ${SERVICE_ACCOUNT_NAME}"
echo -e "Description: ${SA_DESCRIPTION}"
echo -e "Secret: ${SECRET_NAME:-None}"
echo -e "Function Name: ${FUNCTION_NAME}"
echo -e "Source: ${SOURCE_DIR}"
echo -e "Region: ${REGION}"
echo -e "Entry Point: ${ENTRY_POINT}"
echo -e "Base Image: ${BASE_IMAGE}"
echo ""

if ! prompt_yes_no "Proceed with deployment?"; then
    echo -e "${YELLOW}Deployment cancelled${NC}"
    exit 0
fi

echo ""

# Step 1: Create Service Account
if [ "$SKIP_SA_CREATE" = false ]; then
    echo -e "${YELLOW}Step 1: Service Account Creation${NC}"
    echo ""
    echo "Command to execute:"
    echo ""
    echo "gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \\"
    echo "    --display-name \"$SA_DESCRIPTION\" \\"
    echo "    --project=$PROJECT_ID"
    echo ""
    
    if prompt_yes_no "Execute this command?"; then
        execute_command \
            "gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME --display-name \"$SA_DESCRIPTION\" --project=$PROJECT_ID" \
            "Service account created successfully"
        
        if [ $? -ne 0 ] && [ "$DRY_RUN" = false ]; then
            exit 1
        fi
    else
        echo -e "${YELLOW}Cancelled. Exiting script.${NC}"
        exit 0
    fi
    echo ""
else
    echo -e "${YELLOW}Step 1: Skipping Service Account Creation (using existing)${NC}"
    echo ""
fi

# Step 2: Grant Secret Manager access (Optional)
if [ ! -z "$SECRET_NAME" ]; then
    echo -e "${YELLOW}Step 2: Secret Manager IAM Policy${NC}"
    echo ""
    echo "Command to execute:"
    echo ""
    echo "gcloud secrets add-iam-policy-binding $SECRET_NAME \\"
    echo "    --member=\"serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com\" \\"
    echo "    --role=\"roles/secretmanager.secretAccessor\" \\"
    echo "    --project=$PROJECT_ID"
    echo ""
    
    if prompt_yes_no "Execute this command?"; then
        execute_command \
            "gcloud secrets add-iam-policy-binding $SECRET_NAME --member=\"serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com\" --role=\"roles/secretmanager.secretAccessor\" --project=$PROJECT_ID" \
            "Secret Manager access granted successfully"
        
        if [ $? -ne 0 ] && [ "$DRY_RUN" = false ]; then
            exit 1
        fi
    else
        echo -e "${YELLOW}Cancelled. Exiting script.${NC}"
        exit 0
    fi
else
    echo -e "${YELLOW}Step 2: Skipping Secret Manager access (no secret specified)${NC}"
fi

echo ""

# Step 3: Grant Logging access (Required)
echo -e "${YELLOW}Step 3: Logging IAM Policy${NC}"
echo ""
echo "Command to execute:"
echo ""
echo "gcloud projects add-iam-policy-binding $PROJECT_ID \\"
echo "    --member=\"serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com\" \\"
echo "    --role=\"roles/logging.logWriter\""
echo ""

if prompt_yes_no "Execute this command?"; then
    execute_command \
        "gcloud projects add-iam-policy-binding $PROJECT_ID --member=\"serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com\" --role=\"roles/logging.logWriter\"" \
        "Logging access granted successfully"
    
    if [ $? -ne 0 ] && [ "$DRY_RUN" = false ]; then
        exit 1
    fi
else
    echo -e "${YELLOW}Cancelled. Exiting script.${NC}"
    exit 0
fi

echo ""

# Wait a bit for IAM propagation with progress indicator
if [ "$DRY_RUN" = false ]; then
    echo -ne "${YELLOW}Waiting for IAM policy propagation"
    for i in {1..10}; do
        sleep 1
        echo -ne "."
    done
    echo -e " Done!${NC}"
else
    echo -e "${YELLOW}[DRY RUN] Would wait 10 seconds for IAM policy propagation${NC}"
fi
echo ""

# Step 4: Deploy Cloud Function
echo -e "${YELLOW}Step 4: Cloud Function Deployment${NC}"
echo ""
echo "Command to execute:"
echo ""
echo "gcloud run deploy $FUNCTION_NAME \\"
echo "    --source $SOURCE_DIR \\"
echo "    --function $ENTRY_POINT \\"
echo "    --base-image $BASE_IMAGE \\"
echo "    --region $REGION \\"
echo "    --service-account ${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com \\"
echo "    --project=$PROJECT_ID \\"
echo "    --cpu-boost \\"
echo "    --execution-environment gen1 \\"
echo "    --no-allow-unauthenticated"
echo ""

if prompt_yes_no "Execute this command?"; then
    execute_command \
        "gcloud run deploy $FUNCTION_NAME --source $SOURCE_DIR --function $ENTRY_POINT --base-image $BASE_IMAGE --region $REGION --service-account ${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com --project=$PROJECT_ID --cpu-boost --execution-environment gen1 --no-allow-unauthenticated" \
        "Cloud Function deployed successfully"
    
    if [ $? -eq 0 ] || [ "$DRY_RUN" = true ]; then
        # Fetch function URL if deployment succeeded
        if [ "$DRY_RUN" = false ]; then
            echo ""
            echo -e "${YELLOW}Fetching function URL...${NC}"
            FUNCTION_URL=$(gcloud run services describe ${FUNCTION_NAME} --region ${REGION} --project=$PROJECT_ID --format 'value(status.url)' 2>/dev/null)
            if [ ! -z "$FUNCTION_URL" ]; then
                echo -e "${GREEN}Function URL: ${FUNCTION_URL}${NC}"
            else
                echo -e "${YELLOW}Could not retrieve function URL. You can get it later with:${NC}"
                echo -e "gcloud run services describe ${FUNCTION_NAME} --region ${REGION} --format 'value(status.url)'"
            fi
        fi
    else
        exit 1
    fi
else
    echo -e "${YELLOW}Deployment skipped.${NC}"
fi

echo ""

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "Service Account: ${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
echo -e "Function Name: ${FUNCTION_NAME}"
echo -e "Region: ${REGION}"
if [ ! -z "$FUNCTION_URL" ]; then
    echo -e "Function URL: ${FUNCTION_URL}"
fi
echo ""
echo -e "Get function URL with:"
echo -e "gcloud run services describe ${FUNCTION_NAME} --region ${REGION} --project=$PROJECT_ID --format 'value(status.url)'"
echo ""
