import { parseDesiredComponent } from "../../actions/components/component.ts";
import { loadDocument } from "../../config/document.ts";

export async function loadComponentDefinition(path: string) {
  return parseDesiredComponent(
    await loadDocument(path, "Component definition"),
    "component",
  );
}
