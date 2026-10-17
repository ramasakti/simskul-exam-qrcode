#!/bin/sh
set -e

echo "Menjalankan migrasi database..."
bunx knex migrate:latest --env production

echo "Menjalankan aplikasi..."
exec bun index.js