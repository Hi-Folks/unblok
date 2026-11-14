import type { DimensionsFolder } from "../../actions/apps/list-dimensions.ts";
import { formatColumns } from "../../cli/columns.ts";

export function formatDimensionsFolders(
  folders: DimensionsFolder[],
  width?: number,
): string {
  return formatColumns(
    ["FOLDER", "ID", "AI LANGUAGE"],
    folders.map((folder) => [
      folder.path,
      String(folder.id),
      folder.aiTranslationCode || "—",
    ]),
    width,
    { wrapColumn: 0 },
  );
}
