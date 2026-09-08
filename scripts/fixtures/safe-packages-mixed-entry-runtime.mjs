import * as defaultEntry from "@poe-platform/safe-bash";

export const expectedAgentCommandNames = Object.freeze([
  "true", "false", "echo", "pwd", "basename", "dirname", "printf", "mkdir", "touch",
  "cp", "mv", "rm", "rmdir", "ln", "readlink", "realpath", "ls", "cat", "head", "tail",
  "wc", "tee", "tr", "sort", "uniq", "cut", "grep", "test", "[", "env", "xargs", "find",
  "sed", "awk", "jq", "rg", "base64", "base32", "xxd", "od", "sha256sum", "sha1sum",
  "md5sum", "cksum", "gzip", "gunzip", "zcat", "diff", "patch", "chmod", "stat", "mktemp", "tar",
  "paste", "comm", "join", "tac", "expand", "fold", "strings", "seq", "nl", "rev", "unexpand", "split",
  "date", "sleep", "printenv", "tree", "file", "egrep", "fgrep", "column", "html-to-markdown", "du", "expr", "which", "timeout", "apply_patch",
].sort());

export async function runNestedCommands(entry = defaultEntry, options = {}) {
  const failures = [];
  const shell = new entry.Shell({
    fs: new defaultEntry.MemoryFileSystem(),
    onInternalError(error) { failures.push(error.message); },
  }).use(defaultEntry.agentCommands(options));
  try {
    const results = [];
    for (const script of ["env jq -nc '1+1'", "printf '\"1+1\"' | xargs jq -nc", "env env jq -nc '1+1'", "printf '\"1+1\"' | xargs env jq -nc"]) {
      const { exitCode, stdout, stderr } = await shell.exec(script);
      results.push({ script, exitCode, stdout, stderr });
    }
    return { results, failures };
  } finally { await shell.dispose(); }
}

export { defaultEntry };
