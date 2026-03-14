#!/bin/bash

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

# Ensure nvm is available
if ! command -v nvm >/dev/null 2>&1; then
  echo "nvm is not available. Please install nvm first."
  exit 1
fi

# Use latest Node.js
nvm install node
nvm use node

# Start the development server
npm run dev 