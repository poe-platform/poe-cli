#!/usr/bin/env node

const { env, stderr } = process;

async function main() {
  const repo = env.GITHUB_REPOSITORY;
  const token = env.GITHUB_TOKEN;
  const issueNumber = Number.parseInt(env.ISSUE_NUMBER ?? "", 10);

  if (!repo || !token || !Number.isInteger(issueNumber)) {
    fail("GITHUB_REPOSITORY, GITHUB_TOKEN, and ISSUE_NUMBER are required.");
  }

  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName) {
    fail(`Invalid GITHUB_REPOSITORY value: ${repo}`);
  }

  const issue = await fetchIssue(owner, repoName, issueNumber, token);
  const comments = await fetchAllComments(
    owner,
    repoName,
    issueNumber,
    token
  );

  const lines = [];
  lines.push(`You are resolving GitHub issue #${issueNumber}: ${issue.title}.`);
  lines.push("Implement the required changes and commit them.");

  const conversation = [
    {
      author: issue.user?.login ?? "unknown",
      body: issue.body ?? "",
      created_at: issue.created_at,
      kind: "issue"
    },
    ...comments.map((comment) => ({
      author: comment.user?.login ?? "unknown",
      body: comment.body ?? "",
      created_at: comment.created_at,
      kind: "comment"
    }))
  ];

  if (conversation.length > 0) {
    lines.push("");
    lines.push("Conversation:");
    for (const entry of conversation) {
      lines.push(
        `@${entry.author} (${formatDate(entry.created_at)}):`
      );
      lines.push(entry.body.trim() ? entry.body.trim() : "_No content provided._");
      lines.push("");
    }
  }

  process.stdout.write(lines.join("\n").trim() + "\n");
}

async function fetchIssue(owner, repo, number, token) {
  const response = await githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/issues/${number}`,
    token
  );
  return await response.json();
}

async function fetchAllComments(owner, repo, number, token) {
  const results = [];
  let url = `https://api.github.com/repos/${owner}/${repo}/issues/${number}/comments?per_page=100`;

  while (url) {
    const response = await githubRequest(url, token);
    const page = await response.json();
    results.push(...page);
    url = parseNextLink(response.headers.get("link"));
  }

  return results;
}

function parseNextLink(linkHeader) {
  if (!linkHeader) {
    return null;
  }
  const parts = linkHeader.split(",").map((part) => part.trim());
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match && match[2] === "next") {
      return match[1];
    }
  }
  return null;
}

async function githubRequest(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "poe-code",
      Accept: "application/vnd.github+json"
    }
  });
  if (!response.ok) {
    const message = await safeReadError(response);
    fail(`GitHub request failed: ${message}`);
  }
  return response;
}

async function safeReadError(response) {
  try {
    const data = await response.json();
    if (data && data.message) {
      return `${response.status} ${response.statusText}: ${data.message}`;
    }
  } catch {
    // ignore
  }
  return `${response.status} ${response.statusText}`;
}

function formatDate(value) {
  if (!value) {
    return "unknown date";
  }
  try {
    return new Date(value).toISOString();
  } catch {
    return value;
  }
}

function fail(message) {
  stderr.write(`${message}\n`);
  process.exit(1);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
