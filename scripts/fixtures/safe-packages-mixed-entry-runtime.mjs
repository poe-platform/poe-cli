import * as defaultEntry from "@poe-platform/safe-bash";

export const expectedAgentCommandNames = Object.freeze([
  "true", "false", "echo", "pwd", "basename", "dirname", "printf", "mkdir", "touch",
  "cp", "mv", "rm", "rmdir", "ln", "readlink", "realpath", "ls", "cat", "head", "tail",
  "wc", "tee", "tr", "sort", "uniq", "cut", "grep", "test", "[", "env", "xargs", "find",
  "sed", "awk", "jq", "rg", "base64", "base32", "xxd", "od", "sha512sum", "sha384sum", "sha256sum", "sha224sum", "sha1sum",
  "md5sum", "cksum", "gzip", "gunzip", "zcat", "diff", "patch", "chmod", "stat", "mktemp", "tar",
  "paste", "comm", "join", "tac", "expand", "fold", "strings", "seq", "nl", "rev", "unexpand", "split",
  "date", "sleep", "printenv", "tree", "file", "egrep", "fgrep", "column", "html-to-markdown", "du", "expr", "which", "timeout", "apply_patch", "xq", "xmllint",
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

export const nullDeviceWorkflows = Object.freeze([
  ["cat /dev/null", ""],
  ["printf discarded > /dev/null; printf appended >> /dev/null; cat /dev/null", ""],
  ["printf copied | tee /dev/null; cat /dev/null", "copied"],
  ["printf source > /device-input; cp /device-input /dev/null; cp /dev/null /device-output; cat /device-output", ""],
  ["test -c /dev/null && test ! -f /dev/null && stat -c '%F %s' /dev/null", "character special file 0\n"],
  ["cd /dev; printf relative > ./null; cat null", ""],
]);

export async function verifyNullDeviceView(filesystem) {
  const backing = filesystem.createMemoryFileSystem();
  await backing.mkdir("/dev");
  await backing.writeFile("/dev/null", new TextEncoder().encode("historical"));
  await backing.writeFile("/dev/sibling", new TextEncoder().encode("sibling"));
  const device = filesystem.createDeviceFileSystem(backing);
  if (device === backing || filesystem.createDeviceFileSystem(device) !== device) {
    throw new Error("Public device view is not an idempotent wrapper");
  }
  const stat = await device.stat("/dev/null");
  if (stat.type !== "character" || stat.size !== 0 || stat.allocatedBytes !== 0) {
    throw new Error("Public null-device metadata is incorrect");
  }
  await device.writeFile("/dev/./null", new TextEncoder().encode("discarded"));
  await device.appendFile("/dev/null", new TextEncoder().encode("discarded"));
  if ((await device.readFile("/dev/null")).length !== 0) throw new Error("Public null-device read is not EOF");
  if (new TextDecoder().decode(await backing.readFile("/dev/null")) !== "historical") {
    throw new Error("Public device view changed the historical backing row");
  }
  const entries = await device.readdir("/dev");
  if (entries.filter(entry => entry.name === "null" && entry.type === "character").length !== 1
    || !entries.some(entry => entry.name === "sibling" && entry.type === "file")) {
    throw new Error("Public device directory did not merge and mask entries");
  }
  let exclusiveError;
  try { await device.writeFile("/dev/null", new Uint8Array(), { flag: "wx" }); }
  catch (error) { exclusiveError = error; }
  if (exclusiveError?.code !== "EEXIST") throw new Error("Public null-device exclusive creation did not reject");
}

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
