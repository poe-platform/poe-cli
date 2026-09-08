import * as browser from "@poe-platform/safe-bash/browser";
import * as portable from "@poe-platform/safe-bash/portable";

export async function runNestedCommands(entry) {
  const failures = [];
  const shell = new entry.Shell({
    fs: new browser.MemoryFileSystem(),
    onInternalError(error) { failures.push(error.message); },
  }).use(portable.portableAgentCommands({ provider: portable.createBoundedRegexProvider() }));
  try {
    const results = [];
    for (const script of ["env jq -nc '1+1'", "printf '\"1+1\"' | xargs jq -nc", "env env jq -nc '1+1'", "printf '\"1+1\"' | xargs env jq -nc"]) {
      const { exitCode, stdout, stderr } = await shell.exec(script);
      results.push({ script, exitCode, stdout, stderr });
    }
    return { results, failures };
  } finally { await shell.dispose(); }
}

export { browser, portable };
