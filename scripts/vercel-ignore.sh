#!/bin/bash

# This script is for Vercel "Ignored Build Step"
# It ensures that Vercel only triggers a build if files in the 'frontend/' directory have changed.

echo "VERCEL_GIT_COMMIT_REF: $VERCEL_GIT_COMMIT_REF"

# Check if there are changes in the frontend folder
# git diff --quiet returns 0 if there are NO changes (ignore build)
# git diff --quiet returns 1 if there ARE changes (proceed with build)

if git diff --quiet HEAD^ HEAD ./frontend; then
  echo "✅ No changes detected in frontend/. Ignoring build."
  exit 0
else
  echo "🚀 Changes detected in frontend/. Starting build..."
  exit 1
fi
