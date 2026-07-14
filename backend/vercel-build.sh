#!/bin/bash

# Exit on error
set -e

echo "Starting build process..."

# Install dependencies
echo "Installing Python dependencies..."
pip install -r requirements.txt

# NOTE: Database migrations are intentionally NOT run here.
# Vercel build machines have ephemeral IPs and the build should not depend
# on reaching RDS. Migrations run via the GitHub Actions workflow
# (.github/workflows/db-migrate.yml) on push to release/prod.

echo "Build completed successfully" 