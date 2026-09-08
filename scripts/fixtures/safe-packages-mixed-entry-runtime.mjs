import * as defaultEntry from "@poe-platform/safe-bash";

export const expectedAgentCommandNames = Object.freeze([
  "true", "false", "echo", "pwd", "basename", "dirname", "printf", "mkdir", "touch",
  "cp", "mv", "rm", "rmdir", "ln", "readlink", "realpath", "ls", "cat", "head", "tail",
  "wc", "tee", "tr", "sort", "uniq", "cut", "grep", "test", "[", "env", "xargs", "find",
  "sed", "awk", "jq", "rg", "base64", "base32", "xxd", "od", "sha512sum", "sha384sum", "sha256sum", "sha224sum", "sha1sum",
  "md5sum", "cksum", "gzip", "gunzip", "zcat", "diff", "patch", "chmod", "stat", "mktemp", "tar",
  "paste", "comm", "join", "tac", "expand", "fold", "strings", "seq", "nl", "rev", "unexpand", "split",
  "date", "sleep", "printenv", "tree", "file", "egrep", "fgrep", "column", "html-to-markdown", "du", "expr", "which", "timeout", "apply_patch",
].sort());

export const checksumWorkflows = Object.freeze([
  ["sha512sum", "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f"],
  ["sha384sum", "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7"],
  ["sha224sum", "23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7"],
].flatMap(([name, digest]) => [
  [`printf abc | ${name}`, `${digest}  -\n`],
  [`printf abc > /sha-data; ${name} --tag /sha-data`, `${name.slice(0, -3).toUpperCase()} (/sha-data) = ${digest}\n`],
  [`printf abc > /sha-data; ${name} --tag /sha-data > /sha-manifest; ${name} --check /sha-manifest`, "/sha-data: OK\n"],
  [`printf abc > /sha-data; ${name} -z /sha-data`, `${digest}  /sha-data\0`],
]));

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
