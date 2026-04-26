export const resettableFilterButtonLabel = "Reset filters";

function normalizeFilterValue(value: unknown) {
  if (value == null || value === "") {
    return null;
  }

  return value;
}

export function getCurrentMonthDateRange() {
  const now = new Date();
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const endDate = now.toISOString().slice(0, 10);

  return { startDate, endDate };
}

export function areFiltersDefault<T extends Record<string, unknown>>(current: T, defaults: T) {
  const keys = new Set([...Object.keys(defaults), ...Object.keys(current)]);

  for (const key of keys) {
    if (normalizeFilterValue(current[key]) !== normalizeFilterValue(defaults[key])) {
      return false;
    }
  }

  return true;
}
