import os
import unittest
from pathlib import Path
from unittest.mock import patch

import scripts.test_runner as test_runner


class RunCommandsTest(unittest.TestCase):
  def test_runs_each_command_group_with_single_subprocess(self) -> None:
    fake_runner = Path("/tmp/colima-runner.sh")
    command_groups = [
      ["cmd one", "cmd two"],
      ["cmd three"],
    ]

    with (
      patch.object(test_runner, "COMMAND_GROUPS", command_groups),
      patch("scripts.test_runner.colima_runner_path", return_value=fake_runner),
      patch("scripts.test_runner.subprocess.run") as mocked_run,
      patch.dict(os.environ, {"COLIMA_DOCKER_ARGS": ""}, clear=True),
    ):
      test_runner.run_commands()

    self.assertEqual(mocked_run.call_count, len(command_groups))

    for call, expected_commands in zip(mocked_run.call_args_list, command_groups):
      args, kwargs = call
      self.assertEqual(args[0], [str(fake_runner), *expected_commands])
      self.assertTrue(kwargs["check"])
      self.assertEqual(kwargs["env"]["COLIMA_DOCKER_ARGS"], "-e POE_CODE_STDERR_LOGS=1")


if __name__ == "__main__":
  unittest.main()
