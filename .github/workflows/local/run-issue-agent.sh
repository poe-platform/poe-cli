#!/usr/bin/env bash

set -euo pipefail

exec GIT_SSH_COMMAND='ssh -F /root/.ssh/config' act \
  --container-architecture linux/amd64 \
  -W .github/workflows/issue-resolution-agent.yml \
  --secret-file .github/workflows/local/.secrets \
  --eventpath .github/workflows/local/issue-labeled-codex.json \
  --container-daemon-socket - \
  --container-options "-v ${HOME}/.ssh:/root/.ssh:ro" \
  -j resolve \
  "$@"
