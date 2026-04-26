import { describe, expect, it } from "vitest";
import { buildExpenseAnalytics } from "@/lib/analytics/expenses";
import { type StationExpenseRow } from "@/lib/data/expenses";

const rows: StationExpenseRow[] = [
  {
    id: "e1",
    shift_report_id: "r1",
    station_id: "s1",
    station_name: "AKY North",
    report_date: "2026-04-10",
    duty_name: "Cashier A",
    shift_time_label: "AM",
    category: "Utilities",
    description: "Generator",
    receipt_reference: "R-1",
    amount: 100,
    created_at: "2026-05-01T10:00:00Z"
  },
  {
    id: "e2",
    shift_report_id: "r2",
    station_id: "s2",
    station_name: "AKY South",
    report_date: "2026-04-10",
    duty_name: "Cashier B",
    shift_time_label: "PM",
    category: "",
    description: "Snacks",
    receipt_reference: "R-2",
    amount: "50",
    created_at: "2026-04-11T10:00:00Z"
  },
  {
    id: "e3",
    shift_report_id: "r3",
    station_id: "s1",
    station_name: "AKY North",
    report_date: "2026-05-02",
    duty_name: "Cashier C",
    shift_time_label: "AM",
    category: "Repairs",
    description: "Pump fix",
    receipt_reference: "R-3",
    amount: 25,
    created_at: "2026-04-01T10:00:00Z"
  }
];

describe("expenses analytics", () => {
  it("groups expenses by report_date, not created_at", () => {
    const analytics = buildExpenseAnalytics(rows);
    expect(analytics.byDay[0].report_date).toBe("2026-05-02");
    expect(analytics.byDay.some((row) => row.report_date === "2026-04-01")).toBe(false);
  });

  it("groups expenses by station correctly", () => {
    const analytics = buildExpenseAnalytics(rows);
    const north = analytics.byStation.find((row) => row.station_name === "AKY North");
    const south = analytics.byStation.find((row) => row.station_name === "AKY South");
    expect(north?.count).toBe(2);
    expect(south?.count).toBe(1);
  });

  it("aggregates monthly expenses correctly", () => {
    const analytics = buildExpenseAnalytics(rows);
    expect(analytics.byMonth.find((row) => row.month === "2026-04" && row.station_name === "AKY North")?.amount).toBe(100);
    expect(analytics.byMonth.find((row) => row.month === "2026-05" && row.station_name === "AKY North")?.amount).toBe(25);
  });

  it("maps blank category to Uncategorized", () => {
    const analytics = buildExpenseAnalytics(rows);
    expect(analytics.byCategory.find((row) => row.category === "Uncategorized")?.amount).toBe(50);
  });

  it("preserves shift_report_id in detail rows", () => {
    const analytics = buildExpenseAnalytics(rows);
    expect(analytics.detailRows.find((row) => row.id === "e1")?.shift_report_id).toBe("r1");
  });

  it("sums total expenses correctly", () => {
    const analytics = buildExpenseAnalytics(rows);
    expect(analytics.totalExpenses).toBe(175);
  });

  it("all-stations view includes multiple stations", () => {
    const analytics = buildExpenseAnalytics(rows);
    expect(analytics.byStation.length).toBeGreaterThan(1);
  });

  it("station-filtered rows contain only that station", () => {
    const filteredRows = rows.filter((row) => row.station_id === "s1");
    const analytics = buildExpenseAnalytics(filteredRows);
    expect(analytics.byStation).toHaveLength(1);
    expect(analytics.byStation[0].station_id).toBe("s1");
  });
});
