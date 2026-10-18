export function isConditionalCheckFailed(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "ConditionalCheckFailedException";
}

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") throw new Error(`missing ${name}`);
  return value;
}
