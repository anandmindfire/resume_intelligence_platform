/** `catch` bindings are `unknown`: anything can be thrown, so narrow before reading Error fields. */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}
