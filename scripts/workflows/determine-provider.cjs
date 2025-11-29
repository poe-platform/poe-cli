#!/usr/bin/env node

const { appendFileSync } = require('node:fs');
const modelsConfig = require('../../src/config/models.json');

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
const labels = parseLabels(process.env.ISSUE_LABELS);

const providers = new Map([
  ['claude-code', { service: 'claude-code', model: modelsConfig.claudeCode.default }],
  ['codex', { service: 'codex', model: modelsConfig.codex.default }],
  ['open-code', { service: 'opencode', model: modelsConfig.frontier.default }],
  ['opencode', { service: 'opencode', model: modelsConfig.frontier.default }],
  ['poe-code', { service: 'poe-code agent', model: modelsConfig.frontier.default }]
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
const modelOverride = extractModelOverride(labels);
const defaultModel = provider.model;
const resolvedModel = modelOverride ?? defaultModel;

const outputs = [
  `service=${provider.service}`,
  `default_model=${defaultModel}`,
  `model=${resolvedModel}`,
  `model_override=${modelOverride ?? ""}`,
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

function parseLabels(raw) {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    process.stderr.write(`Failed to parse ISSUE_LABELS: ${error.message}\n`);
    return [];
  }
}

function extractModelOverride(labels) {
  for (const label of labels) {
    const name = typeof label.name === 'string' ? label.name.trim() : '';
    if (name.toLowerCase().startsWith('model:')) {
      const value = name.slice('model:'.length).trim();
      if (value) {
        return value;
      }
    }
  }
  return null;
}
