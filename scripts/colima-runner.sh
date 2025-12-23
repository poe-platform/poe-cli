#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mount_target="${COLIMA_RUNNER_MOUNT:-/workspace}"
image="${COLIMA_RUNNER_IMAGE:-node:latest}"
profile="${COLIMA_PROFILE:-default}"
docker_args_env="${COLIMA_DOCKER_ARGS:-}"
export_logs="${COLIMA_RUNNER_EXPORT_LOGS:-1}"
log_export_dir_host="${COLIMA_RUNNER_LOG_EXPORT_DIR:-${repo_root}/.colima-logs}"
log_export_mount="${COLIMA_RUNNER_LOG_EXPORT_MOUNT:-/log-export}"

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

colima_args=(start --profile "${profile}" --mount "${repo_root}:${mount_target}:w")
log_export_volume=()

if [ "${export_logs}" = "1" ]; then
  mkdir -p "${log_export_dir_host}"
  log_export_volume=(-v "${log_export_dir_host}:${log_export_mount}:rw")
fi

colima_running=false
if colima status --profile "${profile}" >/dev/null 2>&1; then
  colima_running=true
fi

if [ "${colima_running}" = true ]; then
  if ! colima ssh --profile "${profile}" "test -f '${mount_target}/package.json' || test -f '${mount_target}/package-lock.json'" >/dev/null 2>&1; then
    echo "Colima profile '${profile}' is running without the required mount. Restarting profile to apply ${repo_root}."
    colima stop --profile "${profile}"
    colima_running=false
  fi
fi

if [ "${colima_running}" != true ]; then
  colima "${colima_args[@]}"
fi

docker_run_common=(docker run --rm -it -v "${mount_target}:${mount_target}:rw" -w "${mount_target}")

if [ "${#log_export_volume[@]}" -gt 0 ]; then
  docker_run_common+=("${log_export_volume[@]}")
fi

if [ "${#docker_args_list[@]}" -gt 0 ]; then
  docker_run_common+=("${docker_args_list[@]}")
fi

if [ $# -eq 0 ]; then
  echo "No command provided. Starting interactive shell..."
  exec "${docker_run_common[@]}" "${image}"
fi

custom_commands=("$@")
container_commands=(
  "workspace_dir=\"${mount_target}\""
  "build_dir=\$(mktemp -d)"
  "cleanup_build_dir() { rm -rf \"\${build_dir}\"; }"
  "trap cleanup_build_dir EXIT"
  "rm -rf /root/.poe-code"
  "mkdir -p /root/.poe-code/logs"
  "tar -C \"\${workspace_dir}\" --exclude=node_modules --exclude=.git -cf - . | tar -C \"\${build_dir}\" -xf -"
  "cd \"\${build_dir}\""
  "npm install"
  "npm run build"
  "npm install -g ."
  "cd \"\${workspace_dir}\""
)
container_commands+=("${custom_commands[@]}")

if [ "${export_logs}" = "1" ]; then
  container_commands+=(
    "mkdir -p \"${log_export_mount}\""
    "cp -a /root/.poe-code/logs/. \"${log_export_mount}/\" || true"
  )
fi

command_string="set -e"
for cmd in "${container_commands[@]}"; do
  command_string+="; ${cmd}"
done

exec "${docker_run_common[@]}" "${image}" sh -lc "${command_string}"
