import { loadDocument } from "../config/document.ts";
import { CliError } from "../errors.ts";
import { parseSpaceSetup, SetupValidationError } from "./schema.ts";

export async function loadSpaceSetup(path: string) {
  const document = await loadDocument(path, "Setup");

  try {
    return parseSpaceSetup(document);
  } catch (error) {
    if (error instanceof SetupValidationError) {
      throw new CliError(error.message, 2);
    }
    throw error;
  }
}
