#!/usr/bin/env node

const { appendFileSync } = require("node:fs");
const { execSync, spawnSync } = require("node:child_process");

function run(command, stdio = "pipe") {
  return execSync(command, { encoding: "utf8", stdio });
}

function truncate(text, limit) {
  return text.length <= limit ? text : `${text.slice(0, limit)}\n...`;
}

function ensureValue(value, message) {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

function parseMetadata(payload) {
  const start = payload.indexOf("{");
  const end = payload.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Agent response did not include JSON payload.");
  }

  let metadata;
  try {
    metadata = JSON.parse(payload.slice(start, end + 1));
  } catch (error) {
    throw new Error(`Failed to parse agent response: ${error.message}`);
  }

  if (!metadata || typeof metadata !== "object") {
    throw new Error("Agent response is not an object.");
  }

  const title = ensureValue(
    typeof metadata.title === "string" ? metadata.title.trim() : "",
    "Agent response missing title."
  );
  const body = ensureValue(
    typeof metadata.body === "string" ? metadata.body.trim() : "",
    "Agent response missing body."
  );

  return { title, body };
}

function main() {
  const { SERVICE, ISSUE_NUMBER, ISSUE_TITLE, ISSUE_BODY, GITHUB_OUTPUT } =
    process.env;

  ensureValue(GITHUB_OUTPUT, "Missing GITHUB_OUTPUT path");
  const service = ensureValue(
    SERVICE,
    "Missing service configuration for PR metadata generation."
  );

  run("git fetch origin main", "inherit");

  const diffStat = run("git diff origin/main --stat").trim();
  const diffPatch = run("git diff origin/main");

  const segments = [
    "You generate GitHub pull request metadata.",
    ISSUE_NUMBER ? `Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE ?? ""}`.trim() : null,
    ISSUE_BODY ? `Issue details:\n${ISSUE_BODY}` : null,
    diffStat ? `Diff summary:\n${diffStat}` : null,
    diffPatch
      ? `Full diff compared to main:\n${truncate(diffPatch, 12_000)}`
      : null,
    "Respond with JSON containing keys title and body."
  ].filter(Boolean);

  const prompt = segments.join("\n\n");

  const result = spawnSync("poe-setup", ["spawn", service, prompt], {
    encoding: "utf8"
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(
      `poe-setup exited with ${result.status}${
        detail ? `: ${detail}` : ""
      }`
    );
  }

  const metadata = parseMetadata((result.stdout || "").trim());

  appendFileSync(
    GITHUB_OUTPUT,
    `title<<EOF\n${metadata.title}\nEOF\n`
  );
  appendFileSync(
    GITHUB_OUTPUT,
    `body<<EOF\n${metadata.body}\nEOF\n`
  );
}

main();
