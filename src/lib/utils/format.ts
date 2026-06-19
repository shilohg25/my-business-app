function normalizeNumeric(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function trimTrailingZeros(formatted: string) {
  return formatted.replace(/\.0+$/, "").replace(/(\.\d*?[1-9])0+$/, "$1");
}

export function formatDecimal(
  value: unknown,
  fractionDigits = 2,
  fallback = "-",
) {
  if (value == null || value === "") return fallback;

  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;

  return numeric.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function formatFixedLiters(value: unknown, fallback = "-") {
  if (value == null || value === "") return fallback;

  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;

  return numeric.toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
    useGrouping: false,
  });
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
