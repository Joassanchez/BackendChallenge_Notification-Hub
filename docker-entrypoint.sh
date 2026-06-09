#!/bin/sh
set -e

echo "=== Notification Hub API starting ==="

echo "Running database migrations..."
npx prisma migrate deploy
echo "Migrations complete."

echo "Seeding database..."
npm run db:seed
echo "Seed complete."

echo "Setting up provider connections..."
npx tsx scripts/setup-provider-connections.ts
echo "Provider connections ready."

echo "Starting API server..."
exec "$@"
