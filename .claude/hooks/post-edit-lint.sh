#!/bin/bash
# PostToolUse hook: auto-lint JS/TS files after every Write/Edit
# Runs Biome check on the edited file to catch issues immediately.

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only trigger on file modification tools
if [[ "$TOOL" != "Write" && "$TOOL" != "Edit" ]]; then
  exit 0
fi

# Only lint JS/TS/JSX/TSX files
if [[ ! "$FILE_PATH" =~ \.(ts|tsx|js|jsx)$ ]]; then
  exit 0
fi

# Skip node_modules and generated files
if [[ "$FILE_PATH" == *"node_modules"* || "$FILE_PATH" == *".next"* || "$FILE_PATH" == *"dist"* ]]; then
  exit 0
fi

npx biome check "$FILE_PATH" 2>&1
