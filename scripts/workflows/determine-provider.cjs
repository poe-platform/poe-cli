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

const rawLabel = readEnv('LABEL_NAME');
const issueNumber = readEnv('ISSUE_NUMBER');
const outputPath = readEnv('GITHUB_OUTPUT');

const providers = new Map([
  ['claude-code', { service: 'claude-code', model: 'Claude-Sonnet-4.5' }],
  ['codex', { service: 'codex', model: 'Claude-Sonnet-4.5' }],
  ['open-code', { service: 'opencode', model: 'Claude-Sonnet-4.5' }],
  ['opencode', { service: 'opencode', model: 'Claude-Sonnet-4.5' }],
  ['poe-code', { service: 'poe-code agent', model: 'Claude-Sonnet-4.5' }]
]);

const normalizedLabel = normalizeLabel(rawLabel);
const provider = providers.get(normalizedLabel);
if (!provider) {
  process.stderr.write(`Unsupported provider label: ${rawLabel}\n`);
  process.exit(1);
}

const branchService = provider.service.split(' ').join('-');
const trimmedLabel = rawLabel.trim();
const prLabel = trimmedLabel.startsWith('agent:')
  ? trimmedLabel
  : `agent:${provider.service}`;
const outputs = [
  `service=${provider.service}`,
  `model=${provider.model}`,
  `branch=agent/${branchService}/issue-${issueNumber}`,
  `pr_label=${prLabel}`,
  `exclude_reviewer=${provider.service}`
];

appendFileSync(outputPath, `${outputs.join('\n')}\n`);

function normalizeLabel(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('agent:')) {
    return trimmed.slice('agent:'.length);
  }
  return trimmed;
}
