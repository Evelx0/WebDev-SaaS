#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

exec "${SCRIPT_DIR}/scripts/deploy-ubuntu-24-pm2.sh" "$@"
