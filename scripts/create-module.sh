#!/bin/bash

# Script to create a new module from the _example-entity template
# Usage: ./scripts/create-module.sh <module-name>
#
# Example: ./scripts/create-module.sh billing
#          This creates src/modules/billing/ from the template

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if module name provided
if [ -z "$1" ]; then
  echo -e "${RED}Error: Module name required${NC}"
  echo -e "Usage: ${BLUE}./scripts/create-module.sh <module-name>${NC}"
  echo -e "Example: ${BLUE}./scripts/create-module.sh billing${NC}"
  exit 1
fi

MODULE_NAME=$1
TEMPLATE_DIR="src/modules/_example-entity"
TARGET_DIR="src/modules/${MODULE_NAME}"

# Validate module name (lowercase, alphanumeric, dashes allowed)
if ! [[ "$MODULE_NAME" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo -e "${RED}Error: Invalid module name${NC}"
  echo "Module name must:"
  echo "  - Start with a lowercase letter"
  echo "  - Contain only lowercase letters, numbers, and dashes"
  echo -e "Example: ${BLUE}billing${NC} or ${BLUE}user-profiles${NC}"
  exit 1
fi

# Check if template exists
if [ ! -d "$TEMPLATE_DIR" ]; then
  echo -e "${RED}Error: Template directory not found: $TEMPLATE_DIR${NC}"
  exit 1
fi

# Check if target already exists
if [ -d "$TARGET_DIR" ]; then
  echo -e "${RED}Error: Module already exists: $TARGET_DIR${NC}"
  echo "Please choose a different name or delete the existing module."
  exit 1
fi

echo -e "${BLUE}Creating new module: ${GREEN}${MODULE_NAME}${NC}"
echo ""

# Copy template directory
echo -e "${YELLOW}📁 Copying template...${NC}"
cp -r "$TEMPLATE_DIR" "$TARGET_DIR"

# Remove template README
rm -f "${TARGET_DIR}/README.md"

# Update constants.ts with the new service name
CONSTANTS_FILE="src/config/constants.ts"
if [ -f "$CONSTANTS_FILE" ]; then
  echo -e "${YELLOW}📝 Updating service name in constants.ts...${NC}"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/DEFAULT_SERVICE_NAME = '.*'/DEFAULT_SERVICE_NAME = '${MODULE_NAME}'/" "$CONSTANTS_FILE"
  else
    sed -i "s/DEFAULT_SERVICE_NAME = '.*'/DEFAULT_SERVICE_NAME = '${MODULE_NAME}'/" "$CONSTANTS_FILE"
  fi
  echo -e "${GREEN}✓${NC} Set DEFAULT_SERVICE_NAME to '${MODULE_NAME}'"
fi

# Rename files
echo -e "${YELLOW}📝 Renaming files...${NC}"
cd "$TARGET_DIR"
mv entity.schema.ts "${MODULE_NAME}.schema.ts"
mv entity.service.ts "${MODULE_NAME}.service.ts"
mv entity.controller.ts "${MODULE_NAME}.controller.ts"
mv entity.routes.ts "${MODULE_NAME}.routes.ts"

echo -e "${GREEN}✓${NC} Module created at: ${BLUE}${TARGET_DIR}${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo -e "1. ${BLUE}Update Zod schemas${NC} in ${MODULE_NAME}.schema.ts"
echo "   - Define your domain fields"
echo "   - Update validation rules"
echo ""
echo -e "2. ${BLUE}Add Prisma model${NC} to prisma/schema.prisma"
echo "   - Define database schema"
echo "   - Run: ${GREEN}npx prisma migrate dev --name add_${MODULE_NAME}${NC}"
echo ""
echo -e "3. ${BLUE}Update service logic${NC} in ${MODULE_NAME}.service.ts"
echo "   - Replace 'entity' references with '${MODULE_NAME}'"
echo "   - Add business logic"
echo "   - Update table name: ${GREEN}getTableName('${MODULE_NAME}s')${NC}"
echo ""
echo -e "4. ${BLUE}Update controller${NC} in ${MODULE_NAME}.controller.ts"
echo "   - Replace 'entity' references with '${MODULE_NAME}'"
echo ""
echo -e "5. ${BLUE}Update routes${NC} in ${MODULE_NAME}.routes.ts"
echo "   - Replace 'entity' references with '${MODULE_NAME}'"
echo "   - Update permissions: ${GREEN}read:${MODULE_NAME}${NC}, ${GREEN}write:${MODULE_NAME}${NC}"
echo ""
echo -e "6. ${BLUE}Register routes${NC} in src/app.ts"
echo "   - Import: ${GREEN}import ${MODULE_NAME}Routes from './modules/${MODULE_NAME}/${MODULE_NAME}.routes.js'${NC}"
echo "   - Register: ${GREEN}app.use('/api/v1/${MODULE_NAME}', ${MODULE_NAME}Routes)${NC}"
echo ""
echo -e "7. ${BLUE}Add environment variables${NC} (if needed)"
echo "   - Update src/config/env.ts"
echo "   - Update .env"
echo "   - Example: ${GREEN}SNS_TOPIC_ARN_$(echo ${MODULE_NAME} | tr '[:lower:]' '[:upper:]' | tr '-' '_')${NC}"
echo ""
echo -e "8. ${BLUE}Write tests${NC} in tests/integration/${MODULE_NAME}.test.ts"
echo ""
echo -e "${GREEN}Documentation:${NC}"
echo "  - Step-by-step guide: ${BLUE}docs/creating-new-module.md${NC}"
echo "  - Architecture docs: ${BLUE}docs/architecture.md${NC}"
echo ""
echo -e "${GREEN}✨ Module scaffolding complete!${NC}"
