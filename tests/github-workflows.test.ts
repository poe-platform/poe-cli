import path from "node:path";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type WorkflowJob = {
  readonly steps?: ReadonlyArray<Record<string, unknown>>;
  readonly permissions?: Record<string, unknown>;
  readonly if?: unknown;
};

type WorkflowFile = {
  readonly name?: unknown;
  readonly on?: Record<string, unknown>;
  readonly jobs?: Record<string, WorkflowJob>;
};

const WORKFLOW_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".github",
  "workflows"
);

const PROVIDER_LABELS = [
  "claude-code",
  "codex",
  "opencode",
  "roo-code"
];

async function loadWorkflow(filename: string): Promise<WorkflowFile> {
  const filePath = path.join(WORKFLOW_DIR, filename);
  const serialized = await readFile(filePath, "utf8");
  const document = parse(serialized);
  if (!document || typeof document !== "object") {
    throw new Error(`Workflow ${filename} did not parse to an object.`);
  }
  return document as WorkflowFile;
}

function findStep(
  steps: ReadonlyArray<Record<string, unknown>> | undefined,
  predicate: (step: Record<string, unknown>) => boolean
): Record<string, unknown> | undefined {
  if (!steps) {
    return undefined;
  }
  return steps.find(predicate);
}

function expectPermission(
  job: WorkflowJob,
  permission: string,
  value: string
): void {
  expect(job.permissions, "Job permissions should exist").toBeTruthy();
  const current = job.permissions?.[permission];
  expect(current, `Expected permission ${permission}`).toBe(value);
}

describe("GitHub workflows", () => {
  it("defines an issue resolution workflow for labeled issues", async () => {
    const workflow = await loadWorkflow("issue-resolution-agent.yml");

    expect(workflow.name).toBe("Issue Resolution Agent");

    const trigger = workflow.on?.issues as Record<string, unknown>;
    expect(trigger, "issues trigger").toBeTruthy();
    const types = trigger?.types as ReadonlyArray<unknown>;
    expect(types).toContain("labeled");

    const job = workflow.jobs?.resolve;
    expect(job, "resolve job").toBeTruthy();
    expect(job?.if, "job guard should reference label name").toSatisfy(
      (value: unknown) =>
        typeof value === "string" && value.includes("github.event.label.name")
    );
    for (const label of PROVIDER_LABELS) {
      expect(job?.if as string).toContain(label);
    }

    for (const permission of ["issues", "pull-requests", "contents"]) {
      expectPermission(job as WorkflowJob, permission, "write");
    }

    const steps = job?.steps;
    expect(
      findStep(steps, (step) => step.uses === "actions/checkout@v4")
    ).toBeTruthy();
    expect(
      findStep(steps, (step) => step.uses === "actions/setup-node@v4")
    ).toBeTruthy();
    expect(
      findStep(steps, (step) => typeof step.run === "string" && step.run.includes("npm ci"))
    ).toBeTruthy();
    expect(
      findStep(steps, (step) => typeof step.run === "string" && step.run.includes("npm run build"))
    ).toBeTruthy();
    expect(
      findStep(steps, (step) => step.id === "provider")
    ).toBeTruthy();
    expect(
      findStep(
        steps,
        (step) =>
          typeof step.run === "string" &&
          step.run.includes("poe-setup configure") &&
          step.run.includes("steps.provider.outputs.service")
      )
    ).toBeTruthy();
    expect(
      findStep(
        steps,
        (step) =>
          typeof step.uses === "string" &&
          step.uses.startsWith("peter-evans/create-pull-request@")
      )
    ).toBeTruthy();
  });

  it("defines a reviewer workflow that assigns a different agent", async () => {
    const workflow = await loadWorkflow("pull-request-reviewer.yml");

    expect(workflow.name).toBe("Pull Request Reviewer");

    const trigger = workflow.on?.pull_request as Record<string, unknown>;
    expect(trigger, "pull_request trigger").toBeTruthy();
    const types = trigger?.types as ReadonlyArray<unknown>;
    expect(types).toEqual(
      expect.arrayContaining(["opened", "ready_for_review", "synchronize"])
    );

    const job = workflow.jobs?.review;
    expect(job, "review job").toBeTruthy();
    expect(job?.if, "review job guard").toSatisfy((value: unknown) =>
      typeof value === "string" && value.includes("draft == false")
    );

    expectPermission(job as WorkflowJob, "pull-requests", "write");
    expectPermission(job as WorkflowJob, "contents", "read");

    const steps = job?.steps;
    expect(
      findStep(steps, (step) => step.id === "reviewer")
    ).toBeTruthy();
    expect(
      findStep(steps, (step) => step.uses === "actions/checkout@v4")
    ).toBeTruthy();
    expect(
      findStep(steps, (step) => step.uses === "actions/setup-node@v4")
    ).toBeTruthy();
    expect(
      findStep(steps, (step) => typeof step.run === "string" && step.run.includes("npm ci"))
    ).toBeTruthy();
    expect(
      findStep(steps, (step) =>
        typeof step.run === "string" &&
        step.run.includes("poe-setup agent") &&
        step.run.includes("review")
      )
    ).toBeTruthy();
  });
});
