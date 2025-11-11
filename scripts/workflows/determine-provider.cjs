#!/usr/bin/env node

const { appendFileSync } = require('node:fs');

function readEnv(name) {
  const value = process.env[name];
  if (!value) {
    process.stderr.write(`Missing ${name} environment variable.\n`);
    process.exit(1);
  }
  return value;
}

const label = readEnv('LABEL_NAME');
const issueNumber = readEnv('ISSUE_NUMBER');
const outputPath = readEnv('GITHUB_OUTPUT');

const providers = new Map([
  ['claude-code', { service: 'claude-code', model: 'Claude-Sonnet-4.5' }],
  ['codex', { service: 'codex', model: 'Claude-Sonnet-4.5' }],
  ['open-code', { service: 'opencode', model: 'Claude-Sonnet-4.5' }],
  ['opencode', { service: 'opencode', model: 'Claude-Sonnet-4.5' }],
  ['poe-code', { service: 'poe-code agent', model: 'Claude-Sonnet-4.5' }]
]);

const provider = providers.get(label);
if (!provider) {
  process.stderr.write(`Unsupported provider label: ${label}\n`);
  process.exit(1);
}

const branchService = provider.service.split(' ').join('-');
const outputs = [
  `service=${provider.service}`,
  `model=${provider.model}`,
  `branch=agent/${branchService}/issue-${issueNumber}`,
  `pr_label=agent:${provider.service}`,
  `exclude_reviewer=${provider.service}`
];

appendFileSync(outputPath, `${outputs.join('\n')}\n`);
