export function isBlank(value: string | null | undefined) {
  return !value || value.trim().length === 0;
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  return "Something went wrong";
}
