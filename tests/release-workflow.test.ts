import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const releaseWorkflowPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../.github/workflows/release.yml',
);

describe('release workflow', () => {
  it('publishes via trusted publisher without tokens', () => {
    const fileContents = readFileSync(releaseWorkflowPath, 'utf8');
    const workflow = parse(fileContents);

    expect(workflow?.permissions?.['id-token']).toBe('write');

    const publishJob = workflow?.jobs?.publish;
    expect(publishJob).toBeDefined();

    const publishStep = publishJob.steps.find(
      (step: { name?: string }) => step?.name === 'Publish to npm',
    );
    expect(publishStep).toBeDefined();
    expect(publishStep.run).toBe('npm publish --provenance --access public');
    expect(publishStep.env ?? {}).not.toHaveProperty('NODE_AUTH_TOKEN');
  });
});
