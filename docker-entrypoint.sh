#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/app/data}"
mkdir -p "$DATA_DIR/uploads/guild-avatars" "$DATA_DIR/uploads/level-bg"
chown -R node:node "$DATA_DIR"

exec runuser -u node -- node src/index.js
