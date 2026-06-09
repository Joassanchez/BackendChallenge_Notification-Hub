#!/bin/sh
set -e

echo "=== Notification Hub API starting ==="

echo "Running database migrations..."
npx prisma migrate deploy
echo "Migrations complete."

echo "Starting API server..."
exec "$@"
