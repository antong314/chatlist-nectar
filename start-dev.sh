#!/bin/bash

# Script to ensure development always runs on port 8080
echo "🔍 Checking for processes on port 8080..."

# Kill any existing processes on port 8080
pid=$(lsof -ti:8080)
if [ -n "$pid" ]; then
  echo "🔴 Found process using port 8080 (PID: $pid) - killing it"
  kill -9 $pid
  echo "✅ Process killed"
else
  echo "✅ No processes found on port 8080"
fi

# Start the dev server on port 8080
echo "🚀 Starting development server on port 8080..."
npm run dev
