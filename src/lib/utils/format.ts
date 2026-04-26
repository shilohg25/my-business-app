function normalizeNumeric(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function trimTrailingZeros(formatted: string) {
  return formatted.replace(/\.0+$/, "").replace(/(\.\d*?[1-9])0+$/, "$1");
}

export function formatLiters(value: unknown) {
  const numeric = normalizeNumeric(value);
  return trimTrailingZeros(numeric.toFixed(3));
}

export function formatVariance(value: unknown) {
  const numeric = normalizeNumeric(value);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${formatLiters(numeric)}`;
}
