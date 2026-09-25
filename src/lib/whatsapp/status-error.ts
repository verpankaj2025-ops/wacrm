export function formatMetaStatusErrors(
  errors: unknown,
): string | null {
  if (!Array.isArray(errors) || errors.length === 0) {
    return null
  }

  const parts = errors
    .map((raw) => {
      if (!raw || typeof raw !== "object") {
        return null
      }

      const error =
        raw as Record<string, unknown>

      const code =
        error.code !== undefined &&
        error.code !== null
          ? `code ${String(error.code)}`
          : ""

      const title =
        typeof error.title === "string"
          ? error.title
          : typeof error.message === "string"
            ? error.message
            : ""

      const errorData =
        error.error_data

      const details =
        errorData &&
        typeof errorData === "object" &&
        typeof (
          errorData as Record<string, unknown>
        ).details === "string"
          ? String(
              (
                errorData as Record<string, unknown>
              ).details,
            )
          : ""

      const message =
        [code, title, details]
          .filter(Boolean)
          .join(": ")

      return message || null
    })
    .filter(
      (value): value is string =>
        Boolean(value),
    )

  return parts.length
    ? parts.join("; ")
    : null
}
