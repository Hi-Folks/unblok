import { CliError } from "../errors.ts";
import Ajv2020 from "ajv/dist/2020.js";
import schema from "../../space-setup.schema.json";

type Mapping = Record<string, unknown>;
const validateSchema = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

function isObject(value: unknown): value is Mapping { return typeof value === "object" && value !== null && !Array.isArray(value); }
function fail(path: string, message: string): never { throw new CliError(`${path}: ${message}`, 2); }
export function resolveBlueprint(value: unknown, overrides: Record<string, string> = {}): Mapping {
  if (!isObject(value)) fail("setup", "expected an object.");
  const source = value;
  if (source.inputs !== undefined && !isObject(source.inputs)) fail("setup.inputs", "expected an object.");
  const declarations = (source.inputs ?? {}) as Mapping;
  for (const key of Object.keys(overrides)) if (!Object.hasOwn(declarations, key)) fail(`inputs.${key}`, "unknown input.");
  const inputs: Record<string, string> = Object.create(null);
  for (const [key, raw] of Object.entries(declarations)) {
    if (!isObject(raw)) fail(`setup.inputs.${key}`, "expected an object.");
    const declaration = raw;
    const resolved = overrides[key] ?? declaration.default;
    if (typeof resolved !== "string" || !resolved.trim()) fail(`inputs.${key}`, "requires a value (provide --input name=value).");
    inputs[key] = resolved;
  }
  const resolve = (item: unknown, path: string): unknown => {
    if (typeof item === "string") {
      const replaced = item.replace(/\$\{\{\s*([^{}]+?)\s*\}\}/g, (_match, expression: string) => {
        const input = /^inputs\.([a-zA-Z_][a-zA-Z0-9_]*)$/.exec(expression);
        if (input) {
          if (!Object.hasOwn(inputs, input[1]!)) fail(path, `unknown input '${input[1]}'.`);
          return inputs[input[1]!]!;
        }
        if (expression === "space.preview_token") return "${{ space.preview_token }}";
        return fail(path, `unsupported expression '${expression}'.`);
      });
      if (replaced.includes("${{") && replaced.replaceAll("${{ space.preview_token }}", "").includes("${{")) fail(path, "invalid expression.");
      return replaced;
    }
    if (Array.isArray(item)) return item.map((child, index) => resolve(child, `${path}[${index}]`));
    if (isObject(item)) return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, resolve(child, `${path}.${key}`)]));
    return item;
  };
  const resolved = resolve(source, "setup") as Mapping;
  if (!validateSchema(resolved)) {
    const errors = validateSchema.errors ?? [];
    const messages = errors.map((error) => {
      const parts = error.instancePath.split("/").slice(1).map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
      let path = "setup";
      for (const part of parts) path += /^\d+$/.test(part) ? `[${part}]` : `.${part}`;
      if (error.keyword === "required") path += `.${error.params.missingProperty}`;
      if (error.keyword === "additionalProperties") path += `.${error.params.additionalProperty}`;
      return `${path}: ${error.message ?? "invalid value"}`;
    });
    throw new CliError([...new Set(messages)].join("; "), 2);
  }
  return resolved;
}
