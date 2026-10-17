#!/bin/sh
set -e

echo "Menjalankan migrasi database..."
bunx knex migrate:latest

echo "Menjalankan aplikasi..."
exec bun index.js