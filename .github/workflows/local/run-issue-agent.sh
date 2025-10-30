#!/usr/bin/env bash

set -euo pipefail

export DOCKER_HOST="unix://${HOME}/.colima/default/docker.sock"
export GIT_CONFIG_PARAMETERS=$'url.git@github.com:.insteadOf=https://github.com/\nurl.git@github.com:.insteadOf=git://github.com/'
export GIT_SSH_COMMAND='ssh -F /root/.ssh/config'

container_opts="-v ${HOME}/.ssh:/root/.ssh:ro"
if [[ -f "${HOME}/.gitconfig" ]]; then
  container_opts+=" -v ${HOME}/.gitconfig:/root/.gitconfig:ro"
fi

exec act \
  --container-architecture linux/amd64 \
  --platform ubuntu-latest=ghcr.io/catthehacker/ubuntu:act-latest \
  -W .github/workflows/issue-resolution-agent.yml \
  --secret-file .github/workflows/local/.secrets \
  --eventpath .github/workflows/local/issue-labeled-codex.json \
  --container-daemon-socket - \
  --container-options "${container_opts}" \
  -j resolve \
  "$@"
