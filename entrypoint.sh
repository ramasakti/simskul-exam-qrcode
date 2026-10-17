#!/bin/sh
set -e

echo "Menjalankan migrasi database..."
bunx knex migrate:latest --knexfile ./knexfile.js --env production

echo "Menjalankan aplikasi..."
exec bun index.js