#!/usr/bin/env bash

set -euo pipefail

act --container-architecture linux/amd64 \
  -W .github/workflows/issue-resolution-agent.yml \
  --secret-file .github/workflows/local/.secrets \
  --eventpath .github/workflows/local/issue-labeled-codex.json \
  --container-daemon-socket - \
  -j resolve \
  "$@"
