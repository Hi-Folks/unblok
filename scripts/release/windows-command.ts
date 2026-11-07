export function windowsBatchCommand(path: string, ...args: string[]): string[] {
  return ["cmd", "/d", "/c", "call", path, ...args];
}
