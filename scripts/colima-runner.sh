#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mount_target="${COLIMA_RUNNER_MOUNT:-/workspace}"
image="${COLIMA_RUNNER_IMAGE:-node:latest}"
profile="${COLIMA_PROFILE:-default}"
docker_args_env="${COLIMA_DOCKER_ARGS:-}"
credentials_path_default="${HOME}/.poe-code/credentials.json"
credentials_path_raw="${COLIMA_CREDENTIALS_PATH:-${credentials_path_default}}"
credentials_path="${credentials_path_raw/#\~/${HOME}}"
credentials_available=false
credentials_dir=""

if [ -f "${credentials_path}" ]; then
  credentials_available=true
  credentials_dir="$(dirname "${credentials_path}")"
fi

credentials_mount_default="/root/.poe-code"
if [ "${credentials_available}" != true ]; then
  credentials_mount_default="${mount_target}/.poe-code"
fi
credentials_mount="${COLIMA_CREDENTIALS_MOUNT:-${credentials_mount_default}}"

docker_args_list=()
if [ -n "${docker_args_env}" ]; then
  # shellcheck disable=SC2206
  docker_args_list=(${docker_args_env})
fi

if ! command -v colima >/dev/null 2>&1; then
  echo "colima command not found. Install Colima first." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker command not found. Install Docker compatible with Colima." >&2
  exit 1
fi

colima_args=(start --profile "${profile}" --mount "${repo_root}:${mount_target}")
credentials_volume=()

if [ "${credentials_available}" = true ]; then
  colima_args+=(--mount "${credentials_dir}:${credentials_dir}")
  credentials_volume=(-v "${credentials_dir}:${credentials_mount}:ro")
else
  echo "Warning: credentials file not found at ${credentials_path}; skipping credentials bind mount." >&2
fi

colima_running=false
if colima status --profile "${profile}" >/dev/null 2>&1; then
  colima_running=true
fi

if [ "${colima_running}" != true ]; then
  colima "${colima_args[@]}"
fi

docker_run_common=(docker run --rm -it -v "${repo_root}:${mount_target}" -v "poe-code-node-modules:${mount_target}/node_modules" -w "${mount_target}")

if [ "${#credentials_volume[@]}" -gt 0 ]; then
  docker_run_common+=("${credentials_volume[@]}")
fi

if [ "${#docker_args_list[@]}" -gt 0 ]; then
  docker_run_common+=("${docker_args_list[@]}")
fi

if [ $# -eq 0 ]; then
  echo "No command provided. Starting interactive shell..."
  exec "${docker_run_common[@]}" "${image}"
fi

custom_commands=("$@")
container_commands=("npm ci" "npm run build" "npm install -g .")
container_commands+=("${custom_commands[@]}")

command_string="set -e"
for cmd in "${container_commands[@]}"; do
  command_string+="; ${cmd}"
done

exec "${docker_run_common[@]}" "${image}" sh -lc "${command_string}"
