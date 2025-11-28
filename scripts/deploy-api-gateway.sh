#!/usr/bin/env bash

# Ensure we're using bash (not sh)
if [ -z "$BASH_VERSION" ]; then
    echo "This script requires bash. Please run with: bash $0"
    exit 1
fi

# Colors for better readability
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}API Gateway Deployment Script${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Check if api-config.yaml exists
if [ ! -f "api-config.yaml" ]; then
    echo -e "${RED}Error: api-config.yaml not found in current directory${NC}"
    exit 1
fi

# Get current GCP configuration from gcloud
echo -e "${YELLOW}Getting GCP Configuration from gcloud...${NC}"
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
REGION=$(gcloud config get-value run/region 2>/dev/null)

if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: No default project set in gcloud config${NC}"
    read -p "Enter Project ID: " PROJECT_ID
else
    echo -e "${GREEN}✓${NC} Project ID: ${BLUE}$PROJECT_ID${NC}"
fi

if [ -z "$REGION" ]; then
    echo -e "${YELLOW}Warning: No default Cloud Run region set in gcloud config${NC}"
    read -p "Enter Region (e.g., us-central1): " REGION
else
    echo -e "${GREEN}✓${NC} Region: ${BLUE}$REGION${NC}"
fi

echo ""

# Extract all unique variables from the YAML file (pattern: ${VAR_NAME})
echo -e "${YELLOW}Scanning api-config.yaml for variables...${NC}\n"
VARIABLES=$(grep -oE '\$\{[A-Z_][A-Z0-9_]*\}' api-config.yaml | sort -u | sed 's/[${}]//g')

if [ -z "$VARIABLES" ]; then
    echo -e "${RED}No variables found in api-config.yaml${NC}"
    echo "Variables should be in the format: \${VARIABLE_NAME}"
    exit 1
fi

echo -e "${GREEN}Found the following variables:${NC}"
for var in $VARIABLES; do
    echo "  - $var"
done
echo ""

# For each variable, ask the user for the corresponding Cloud Run service name
echo -e "${YELLOW}Map each variable to a Cloud Run service:${NC}"
echo -e "${BLUE}(Enter the Cloud Run service name for each variable)${NC}\n"

# Store mappings in temporary file to avoid associative arrays
MAPPING_FILE=$(mktemp)
trap "rm -f $MAPPING_FILE" EXIT

for var in $VARIABLES; do
    read -p "$var => Cloud Run Service Name: " service_name
    echo "$var|$service_name" >> "$MAPPING_FILE"
done

echo ""
echo -e "${YELLOW}Retrieving Cloud Run URLs...${NC}\n"

# Retrieve URLs and export as environment variables
ERROR_OCCURRED=false

while IFS='|' read -r var service_name; do
    echo -e "Fetching URL for ${BLUE}$service_name${NC}..."
    
    url=$(gcloud run services describe "$service_name" \
        --region "$REGION" \
        --project "$PROJECT_ID" \
        --format='value(status.url)' 2>&1)
    
    if [ $? -eq 0 ] && [ -n "$url" ]; then
        export "$var"="$url"
        echo -e "  ${GREEN}✓${NC} $var = $url"
    else
        echo -e "  ${RED}✗${NC} Failed to retrieve URL for service: $service_name"
        echo -e "    Error: $url"
        ERROR_OCCURRED=true
    fi
    echo ""
done < "$MAPPING_FILE"

# Exit if any errors occurred
if [ "$ERROR_OCCURRED" = true ]; then
    echo -e "${RED}Deployment aborted due to errors retrieving Cloud Run URLs${NC}"
    exit 1
fi

# Substitute variables in the YAML file
echo -e "${YELLOW}Generating api-config-deployed.yaml...${NC}"

# Temporarily replace $ref with a placeholder to protect it from envsubst
# Use a unique placeholder that won't appear in the actual content
sed 's/\$ref/__REF_PLACEHOLDER__/g' api-config.yaml > api-config-temp.yaml

# Now use envsubst to substitute only our variables
# envsubst will substitute all ${VAR} patterns, but our $ref is now protected
envsubst < api-config-temp.yaml > api-config-deployed.yaml

# Restore $ref from the placeholder
sed -i '' 's/__REF_PLACEHOLDER__/$ref/g' api-config-deployed.yaml 2>/dev/null || \
sed -i 's/__REF_PLACEHOLDER__/$ref/g' api-config-deployed.yaml

# Clean up temporary file
rm -f api-config-temp.yaml

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Successfully generated api-config-deployed.yaml${NC}\n"
else
    echo -e "${RED}✗ Failed to generate deployment config${NC}"
    exit 1
fi

# Show summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}========================================${NC}"
for var in $VARIABLES; do
    # Get the value of the variable by name
    url_value=$(eval echo \$var)
    echo -e "${GREEN}$var${NC} = $url_value"
done
echo ""

# Ask for API ID
read -p "Enter API ID (name of your API Gateway API): " API_ID

# Check if API exists
echo -e "\n${YELLOW}Checking if API exists...${NC}"
API_EXISTS=$(gcloud api-gateway apis describe "$API_ID" --project="$PROJECT_ID" 2>&1)

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} API '${BLUE}$API_ID${NC}' exists"
    
    # Get the latest config number
    echo -e "${YELLOW}Retrieving latest config version...${NC}"
    LATEST_CONFIG=$(gcloud api-gateway api-configs list \
        --api="$API_ID" \
        --project="$PROJECT_ID" \
        --format="value(name)" \
        --sort-by="~create_time" \
        --limit=1 2>/dev/null)
    
    if [ -n "$LATEST_CONFIG" ]; then
        # Extract number from config name (assumes format like "config-1", "config-2", etc.)
        LATEST_NUM=$(echo "$LATEST_CONFIG" | grep -oE '[0-9]+$')
        if [ -n "$LATEST_NUM" ]; then
            NEW_CONFIG_NUM=$((LATEST_NUM + 1))
            echo -e "${GREEN}✓${NC} Latest config: ${BLUE}$LATEST_CONFIG${NC}"
            echo -e "${GREEN}✓${NC} New config will be: ${BLUE}config-$NEW_CONFIG_NUM${NC}"
        else
            NEW_CONFIG_NUM=$(date +%s)
            echo -e "${YELLOW}Warning: Could not parse config number, using timestamp${NC}"
        fi
    else
        NEW_CONFIG_NUM=1
        echo -e "${YELLOW}No existing configs found, starting with config-1${NC}"
    fi
    
    CONFIG_ID="config-$NEW_CONFIG_NUM"
else
    echo -e "${YELLOW}API '${BLUE}$API_ID${NC}' does not exist. It will be created.${NC}"
    CONFIG_ID="config-1"
fi

echo ""

# Ask for Gateway ID
read -p "Enter Gateway ID (name of your API Gateway): " GATEWAY_ID

# Check if Gateway exists
echo -e "\n${YELLOW}Checking if Gateway exists...${NC}"
GATEWAY_EXISTS=$(gcloud api-gateway gateways describe "$GATEWAY_ID" \
    --location="$REGION" \
    --project="$PROJECT_ID" 2>&1)

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Gateway '${BLUE}$GATEWAY_ID${NC}' exists in region ${BLUE}$REGION${NC}"
    GATEWAY_ACTION="update"
else
    echo -e "${YELLOW}Gateway '${BLUE}$GATEWAY_ID${NC}' does not exist. It will be created.${NC}"
    GATEWAY_ACTION="create"
fi
# Execute commands one by one with individual confirmations
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}Executing Deployment${NC}"
echo -e "${BLUE}========================================${NC}\n"

STEP_NUM=1
DEPLOYMENT_FAILED=false

# Helper function to prompt yes/no with retry
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

# Step 1: Create API (if needed)
if [ "$API_EXISTS_BOOL" = false ]; then
    echo -e "${YELLOW}[$STEP_NUM] Create API:${NC}"
    echo ""
    echo -e "${GREEN}gcloud api-gateway apis create \"$API_ID\" \\"
    echo -e "${GREEN}    --project=\"$PROJECT_ID\""
    echo ""
    
    if prompt_yes_no "Execute this command?"; then
        echo -e "${YELLOW}Creating API '${BLUE}$API_ID${NC}'...${NC}"
        gcloud api-gateway apis create "$API_ID" \
            --project="$PROJECT_ID"
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓${NC} API created successfully\n"
        else
            echo -e "${RED}✗${NC} Failed to create API\n"
            DEPLOYMENT_FAILED=true
        fi
    else
        echo -e "${YELLOW}Command cancelled. Exiting script.${NC}"
        exit 0
    fi
    STEP_NUM=$((STEP_NUM + 1))
    echo ""
fi

# Step 2: Create API Config
if [ "$DEPLOYMENT_FAILED" = false ]; then
    echo -e "${YELLOW}[$STEP_NUM] Create API Config:${NC}"
    echo ""
    echo -e "${GREEN}gcloud api-gateway api-configs create \"$CONFIG_ID\" \\${NC}"
    echo -e "${GREEN}    --api=\"$API_ID\" \\${NC}"
    echo -e "${GREEN}    --openapi-spec=api-config-deployed.yaml \\${NC}"
    echo -e "${GREEN}    --backend-auth-service-account=api-gateway-invoker@serveless-epitech-dev.iam.gserviceaccount.com \\${NC}"
    echo -e "${GREEN}    --project=\"$PROJECT_ID\"${NC}"
    echo ""
    
    if prompt_yes_no "Execute this command?"; then
        echo -e "${YELLOW}Creating API Config '${BLUE}$CONFIG_ID${NC}'...${NC}"
        gcloud api-gateway api-configs create "$CONFIG_ID" \
            --api="$API_ID" \
            --openapi-spec=api-config-deployed.yaml \
            --backend-auth-service-account=api-gateway-invoker@serveless-epitech-dev.iam.gserviceaccount.com \
            --project="$PROJECT_ID"
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓${NC} API Config created successfully\n"
        else
            echo -e "${RED}✗${NC} Failed to create API Config\n"
            DEPLOYMENT_FAILED=true
        fi
    else
        echo -e "${YELLOW}Command cancelled. Exiting script.${NC}"
        exit 0
    fi
    STEP_NUM=$((STEP_NUM + 1))
    echo ""
fi

# Step 3: Create or Update Gateway
if [ "$DEPLOYMENT_FAILED" = false ]; then
    if [ "$GATEWAY_ACTION" = "create" ]; then
        echo -e "${YELLOW}[$STEP_NUM] Create Gateway:${NC}"
        echo ""
        echo -e "${GREEN}gcloud api-gateway gateways create \"$GATEWAY_ID\" \\"
        echo -e "${GREEN}    --api=\"$API_ID\" \\"
        echo -e "${GREEN}    --api-config=\"$CONFIG_ID\" \\"
        echo -e "${GREEN}    --location=\"$REGION\" \\"
        echo -e "${GREEN}    --project=\"$PROJECT_ID\""
        echo ""
        
        if prompt_yes_no "Execute this command?"; then
            echo -e "${YELLOW}Creating Gateway '${BLUE}$GATEWAY_ID${NC}'...${NC}"
            gcloud api-gateway gateways create "$GATEWAY_ID" \
                --api="$API_ID" \
                --api-config="$CONFIG_ID" \
                --location="$REGION" \
                --project="$PROJECT_ID"
            
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✓${NC} Gateway created successfully\n"
            else
                echo -e "${RED}✗${NC} Failed to create Gateway\n"
                DEPLOYMENT_FAILED=true
            fi
        else
            echo -e "${YELLOW}Command cancelled. Exiting script.${NC}"
            exit 0
        fi
    else
        echo -e "${YELLOW}[$STEP_NUM] Update Gateway:${NC}"
        echo ""
        echo -e "${GREEN}gcloud api-gateway gateways update \"$GATEWAY_ID\" \\${NC}"
        echo -e "${GREEN}    --api=\"$API_ID\" \\${NC}"
        echo -e "${GREEN}    --api-config=\"$CONFIG_ID\" \\${NC}"
        echo -e "${GREEN}    --location=\"$REGION\" \\${NC}"
        echo -e "${GREEN}    --project=\"$PROJECT_ID\"${NC}"
        echo ""
        
        if prompt_yes_no "Execute this command?"; then
            echo -e "${YELLOW}Updating Gateway '${BLUE}$GATEWAY_ID${NC}'...${NC}"
            gcloud api-gateway gateways update "$GATEWAY_ID" \
                --api="$API_ID" \
                --api-config="$CONFIG_ID" \
                --location="$REGION" \
                --project="$PROJECT_ID"
            
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✓${NC} Gateway updated successfully\n"
            else
                echo -e "${RED}✗${NC} Failed to update Gateway\n"
                DEPLOYMENT_FAILED=true
            fi
        else
            echo -e "${YELLOW}Command cancelled. Exiting script.${NC}"
            exit 0
        fi
    fi
    STEP_NUM=$((STEP_NUM + 1))
fi

# Final status
echo -e "${BLUE}========================================${NC}"
if [ "$DEPLOYMENT_FAILED" = true ]; then
    echo -e "${RED}Deployment Failed${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo -e "${RED}Some commands failed. Please check the errors above.${NC}"
    exit 1
else
    echo -e "${GREEN}Deployment Successful!${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo -e "${GREEN}All commands executed successfully!${NC}"
    echo -e "\nAPI Gateway Details:"
    echo -e "  - API ID: ${BLUE}$API_ID${NC}"
    echo -e "  - Config ID: ${BLUE}$CONFIG_ID${NC}"
    echo -e "  - Gateway ID: ${BLUE}$GATEWAY_ID${NC}"
    echo -e "  - Region: ${BLUE}$REGION${NC}"
    
    # Try to get gateway URL
    echo -e "\n${YELLOW}Fetching Gateway URL...${NC}"
    GATEWAY_URL=$(gcloud api-gateway gateways describe "$GATEWAY_ID" \
        --location="$REGION" \
        --project="$PROJECT_ID" \
        --format='value(defaultHostname)' 2>/dev/null)
    
    if [ -n "$GATEWAY_URL" ]; then
        echo -e "${GREEN}✓${NC} Gateway URL: ${BLUE}https://$GATEWAY_URL${NC}"
    fi
fi

echo -e "\n${GREEN}Done!${NC}"
