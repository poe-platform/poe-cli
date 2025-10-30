#!/usr/bin/env bash

set -euo pipefail

SSH_DIR="${HOME}/.ssh"
GITCONFIG="${HOME}/.gitconfig"

if [[ ! -d "${SSH_DIR}" ]]; then
  echo "Missing SSH directory at ${SSH_DIR}" >&2
  exit 1
fi

container_opts="-v ${SSH_DIR}:/root/.ssh:ro"

if [[ -f "${GITCONFIG}" ]]; then
  container_opts+=" -v ${GITCONFIG}:/root/.gitconfig:ro"
else
  echo "Warning: ${GITCONFIG} not found. https->ssh rewrite may be missing." >&2
fi

exec env GIT_SSH_COMMAND='ssh -F /root/.ssh/config' act \
  --container-architecture linux/amd64 \
  -W .github/workflows/issue-resolution-agent.yml \
  --secret-file .github/workflows/local/.secrets \
  --eventpath .github/workflows/local/issue-labeled-codex.json \
  --container-daemon-socket - \
  --container-options "${container_opts}" \
  -j resolve \
  "$@"
