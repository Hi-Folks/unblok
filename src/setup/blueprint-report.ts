import { formatStatus } from "../reporting.ts";
import { errorInfo, type UnblokErrorInfo } from "../actions/action-error.ts";

export interface BlueprintOperation {
  operation: string;
  key: string;
  status: string;
  error?: string;
  errorInfo?: UnblokErrorInfo;
  failures?: Array<{
    language: string;
    phase: "translation" | "review";
    error: UnblokErrorInfo;
  }>;
  reason?: string;
}

export class BlueprintOperationError extends Error {
  constructor(
    readonly operation: string,
    readonly key: string,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : "Unexpected error", {
      cause,
    });
  }
}

export function blueprintFailure(error: unknown): {
  error: string;
  errorInfo: UnblokErrorInfo;
} {
  const source = error instanceof BlueprintOperationError ? error.cause : error;
  const info = errorInfo(source);
  return {
    error:
      info.status !== undefined
        ? info.message
        : error instanceof Error
          ? error.message
          : "Unexpected error",
    errorInfo: info,
  };
}

const unchangedReasons: Record<string, string> = {
  "create-story": "Story already exists; its content was preserved.",
  "ensure-story-folder": "Content folder already exists.",
  "create-release": "Release already exists; its schedule was preserved.",
  "publish-release": "Release is already published.",
  "create-pipeline-branch": "Pipeline stage already exists.",
  "install-app": "App is already installed.",
  "install-ai-translations": "App is already installed.",
  "accept-ai-translation-disclaimer": "Disclaimer is already accepted.",
  "ensure-language": "Language already exists.",
  "configure-preview": "Preview settings already match.",
  "remove-demo-mode": "Demo mode is already disabled.",
  "ensure-component-field": "Component field already matches.",
  "upload-asset": "Existing asset content matches.",
  "translate-story-slugs": "Translated slugs already match.",
  "assign-workflow": "Story is already in the requested stage.",
  "assign-unstaged": "No unstaged stories require assignment.",
  "ensure-workflow-stage": "Workflow stage already exists.",
  "assign-tags": "Story already has the requested tags.",
};

export function finishBlueprintReport(
  spaceId: number | undefined,
  operations: BlueprintOperation[],
  notRun: Array<{ operation: string; key: string }> = [],
) {
  const result: BlueprintOperation[] = operations.map((item) => ({
    ...item,
    ...(item.status === "unchanged" && !item.reason
      ? {
          reason:
            unchangedReasons[item.operation] ??
            "Already matches the requested state.",
        }
      : {}),
    ...(item.status === "failed" && !item.reason && item.error
      ? { reason: item.error }
      : {}),
  }));
  result.push(
    ...notRun.map((item) => ({
      ...item,
      status: "not_run",
      reason: "Stopped after an earlier failure.",
    })),
  );
  const summary = { completed: 0, skipped: 0, failed: 0, notRun: 0 };
  for (const item of result) {
    if (item.status === "failed") summary.failed++;
    else if (item.status === "not_run") summary.notRun++;
    else if (item.status === "unchanged" || item.status === "skipped")
      summary.skipped++;
    else summary.completed++;
  }
  return {
    apiVersion: "unblok/blueprint-apply-v1" as const,
    target: spaceId === undefined ? {} : { spaceId },
    operations: result,
    summary,
    failed: summary.failed > 0,
    ...(summary.failed
      ? {
          recovery: {
            ...(spaceId === undefined ? {} : { spaceId }),
            message:
              spaceId === undefined
                ? "Fix the failure before rerunning the setup."
                : `Fix the failure and rerun with --space-id ${spaceId}.`,
          },
        }
      : {}),
  };
}

export function formatBlueprintReport(
  report: ReturnType<typeof finishBlueprintReport>,
  style: (
    color: "green" | "yellow" | "red" | "gray",
    text: string,
  ) => string = (_color, text) => text,
): string {
  const lines = report.operations.map((item) => {
    return formatStatus(
      item.status,
      `${item.operation} ${item.key}`,
      item.reason,
      style,
    );
  });
  if ("spaceId" in report.target && report.target.spaceId !== undefined)
    lines.unshift(`Space  ${report.target.spaceId}`, "");
  const { completed, skipped, failed, notRun } = report.summary;
  lines.push(
    "",
    `${completed} completed · ${skipped} skipped · ${failed} failed · ${notRun} not run`,
  );
  if (report.recovery) lines.push(report.recovery.message);
  return lines.join("\n");
}
