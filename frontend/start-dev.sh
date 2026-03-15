#!/bin/bash
set -eo pipefail

# Load nvm
export NVM_DIR="$HOME/.nvm"
export NVM_NO_USE=1
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" --no-use  # This loads nvm without auto-switch
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

# Ensure nvm is available
if ! command -v nvm >/dev/null 2>&1; then
  echo "nvm is not available. Please install nvm first."
  exit 1
fi

# Use latest LTS Node.js (Next.js 16 needs modern Node)
nvm install --lts
nvm use --lts

echo "Using Node $(node -v) and npm $(npm -v)"

# Install dependencies if they are missing in this environment
if [ ! -d "node_modules" ] || [ ! -d "node_modules/js-cookie" ] || [ ! -d "node_modules/jwt-decode" ]; then
  echo "Installing frontend dependencies..."
  npm install
fi

# Start the development server
npm run dev