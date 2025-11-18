#!/usr/bin/env python3

"""Run poe-code install/configure flows for each supported coding assistant."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import List


COMMAND_GROUPS: List[List[str]] = [
  [
    "poe-code install claude-code",
    "poe-code configure claude-code --verbose --yes",
  ],
  [
    "poe-code install codex",
    "poe-code configure codex --verbose --yes",
  ],
  [
    "poe-code install opencode",
    "poe-code configure opencode --verbose --yes",
  ],
]


def repo_root() -> Path:
  return Path(__file__).resolve().parents[1]


def colima_runner_path() -> Path:
  path = repo_root() / "scripts" / "colima-runner.sh"
  if not path.exists():
    raise FileNotFoundError(f"colima runner not found at {path}")
  return path


def run_commands() -> None:
  runner = str(colima_runner_path())
  for index, commands in enumerate(COMMAND_GROUPS, start=1):
    print(f"\n=== Command group {index} ===", flush=True)
    for command in commands:
      print(f"\n>>> {command}", flush=True)
      subprocess.run([runner, command], check=True)


def main() -> int:
  try:
    run_commands()
  except subprocess.CalledProcessError as exc:
    print(f"\nCommand failed with exit code {exc.returncode}: {exc.cmd}", file=sys.stderr)
    return exc.returncode
  except Exception as exc:  # pragma: no cover - defensive
    print(f"\nUnexpected error: {exc}", file=sys.stderr)
    return 1
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
