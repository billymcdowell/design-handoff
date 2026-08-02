#!/bin/sh
set -e

cd /pb

echo "Applying database migrations..."
./pocketbase migrate up
echo "Migrations complete."

# Optional: non-interactive bootstrap (CI / automation only).
# If unset, PocketBase prints a one-time installer URL in the logs on first boot.
if [ -n "${PB_SUPERUSER_EMAIL:-}" ] && [ -n "${PB_SUPERUSER_PASSWORD:-}" ]; then
  ./pocketbase superuser upsert "$PB_SUPERUSER_EMAIL" "$PB_SUPERUSER_PASSWORD"
fi

echo ""
echo "Fresh install? Look for a line starting with '(!) Launch the URL' in the logs,"
echo "then open it with 0.0.0.0 replaced by localhost:"
echo "  docker compose logs | grep 'Launch the URL' -A1"
echo ""

exec ./pocketbase serve --http=0.0.0.0:8090 --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations --hooksDir=/pb/pb_hooks --publicDir=/pb/pb_public "$@"
