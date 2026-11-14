import {
  getDimensionsCoverage,
  type DimensionsCoverageInput,
} from "./dimensions-coverage.ts";
import {
  createDimensionVariant,
  type CreateDimensionVariantGateway,
} from "../stories/create-dimension-variant.ts";
import { toUnblokError, type UnblokErrorInfo } from "../action-error.ts";
import { CliError } from "../../errors.ts";

export type MissingVariantsGateway = CreateDimensionVariantGateway;
export type MissingVariantOperation = {
  source: string;
  folder: string;
  status: "planned" | "created" | "unchanged" | "failed" | "not_run";
  story?: { id: number; fullSlug: string };
  error?: UnblokErrorInfo;
};
export interface MissingVariantsReport {
  apiVersion: "unblok/missing-variants-v1";
  startsWith: string;
  operations: MissingVariantOperation[];
}

/** Inspect linked variants, and optionally create missing links. Stops on the first failure. */
export async function createMissingVariants(
  gateway: MissingVariantsGateway,
  input: DimensionsCoverageInput & { apply: boolean },
  options?: { onProgress?: (operation: MissingVariantOperation) => void },
): Promise<MissingVariantsReport> {
  if (typeof input?.apply !== "boolean")
    throw toUnblokError(
      new CliError("Provide a boolean apply option.", 2, "INVALID_INPUT"),
    );
  const coverage = await getDimensionsCoverage(gateway, input);
  const operations: MissingVariantOperation[] = coverage.stories.flatMap(
    (story) =>
      story.variants.map((variant) => ({
        source: story.fullSlug,
        folder: variant.folder,
        status:
          variant.status === "linked"
            ? ("unchanged" as const)
            : ("planned" as const),
        ...(variant.story ? { story: variant.story } : {}),
      })),
  );
  if (input.apply) {
    let stopped = false;
    for (const operation of operations) {
      if (operation.status === "planned") {
        if (stopped) operation.status = "not_run";
        else
          try {
            const result = await createDimensionVariant(gateway, {
              spaceId: input.spaceId,
              story: operation.source,
              folder: operation.folder,
            });
            operation.status = result.status;
            operation.story = result.story;
          } catch (error) {
            const classified = toUnblokError(error);
            operation.status = "failed";
            operation.error = {
              code: classified.code,
              message: classified.message,
              ...(classified.status === undefined
                ? {}
                : { status: classified.status }),
            };
            stopped = true;
          }
      }
      options?.onProgress?.(operation);
    }
  }
  return {
    apiVersion: "unblok/missing-variants-v1",
    startsWith: coverage.startsWith,
    operations,
  };
}
