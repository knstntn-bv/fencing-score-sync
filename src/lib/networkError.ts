export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  if (code === "23505" || code === "42501" || code === "PGRST116") return false;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  if (/failed to fetch|networkerror|network request failed|load failed|offline|err_internet|fetch/i.test(message)) {
    return true;
  }
  return error instanceof TypeError;
}

export function isDuplicateMatchError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}
