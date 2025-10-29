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
  it('publishes on release publication with required permissions and auth', () => {
    const fileContents = readFileSync(releaseWorkflowPath, 'utf8');
    const workflow = parse(fileContents);

    const releaseTypes = Array.isArray(workflow?.on?.release?.types)
      ? workflow?.on?.release?.types
      : workflow?.on?.release?.types
        ? [workflow?.on?.release?.types]
        : [];
    expect(releaseTypes).toContain('published');

    const publishJob = workflow?.jobs?.publish;
    expect(publishJob).toBeDefined();
    expect(publishJob?.permissions?.contents).toBe('read');
    expect(publishJob?.permissions?.['id-token']).toBe('write');

    const publishStep = publishJob.steps.find(
      (step: { run?: string }) => step?.run === 'npm publish --provenance --access public',
    );
    expect(publishStep).toBeDefined();
    expect(publishStep?.env?.NODE_AUTH_TOKEN).toBe('${{ secrets.NPM_TOKEN }}');
  });
});
