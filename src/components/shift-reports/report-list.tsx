"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResetFiltersButton } from "@/components/ui/reset-filters-button";
import { canUseLiveData, listShiftReports, markReportStatus, type ShiftReportRow } from "@/lib/data/client";
import { appPath, getSupabaseConfigurationState } from "@/lib/supabase/client";
import { areFiltersDefault, getCurrentMonthDateRange } from "@/lib/utils/filters";
import { formatCurrency } from "@/lib/utils";
import { formatSignedCurrency, getDiscrepancyLabel, getDiscrepancyStatus } from "@/lib/analytics/discrepancy";
import { getShiftReportSourceLabel } from "@/lib/domain/source-labels";

type ReportStatusFilter = "all" | "draft" | "submitted" | "reviewed" | "approved";

function getTotalAsNumber(totals: Record<string, unknown>, key: string) {
  const value = totals[key];
  const numeric = Number(value ?? Number.NaN);
  return Number.isFinite(numeric) ? numeric : null;
}

function StatusBadge({ status }: { status: string }) {
  const toneByStatus: Record<string, string> = {
    draft: "border-slate-300 bg-slate-100 text-slate-700",
    submitted: "border-blue-200 bg-blue-50 text-blue-700",
    reviewed: "border-amber-200 bg-amber-50 text-amber-700",
    approved: "border-emerald-200 bg-emerald-50 text-emerald-700"
  };

  return <Badge className={toneByStatus[status] ?? ""}>{status || "-"}</Badge>;
}

export function ReportList() {
  const liveData = canUseLiveData();
  const config = getSupabaseConfigurationState();

  const monthDateRange = getCurrentMonthDateRange();
  const defaultFilters = {
    stationFilter: "all",
    statusFilter: "all" as ReportStatusFilter,
    startDate: monthDateRange.startDate,
    endDate: monthDateRange.endDate,
    searchText: ""
  };
  const [reports, setReports] = useState<ShiftReportRow[]>([]);
  const [loading, setLoading] = useState(liveData);
  const [busyReportId, setBusyReportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stationFilter, setStationFilter] = useState(defaultFilters.stationFilter);
  const [statusFilter, setStatusFilter] = useState<ReportStatusFilter>(defaultFilters.statusFilter);
  const [startDate, setStartDate] = useState(defaultFilters.startDate);
  const [endDate, setEndDate] = useState(defaultFilters.endDate);
  const [searchText, setSearchText] = useState(defaultFilters.searchText);

  async function refresh() {
    if (!liveData) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setReports(await listShiftReports(100));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load reports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [liveData]);

  async function approve(id: string) {
    if (!liveData) {
      setError(config.reason);
      return;
    }

    setBusyReportId(id);
    setError(null);

    try {
      await markReportStatus(id, "approved", "Approved from shift report list");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed.");
    } finally {
      setBusyReportId(null);
    }
  }

  function resetFilters() {
    const nextDefaults = getCurrentMonthDateRange();
    setStationFilter("all");
    setStatusFilter("all");
    setStartDate(nextDefaults.startDate);
    setEndDate(nextDefaults.endDate);
    setSearchText("");
  }

  const filteredReports = useMemo(() => {
    const normalized = searchText.trim().toLowerCase();

    return reports.filter((report) => {
      if (stationFilter !== "all" && report.fuel_stations?.name !== stationFilter) {
        return false;
      }

      if (statusFilter !== "all" && report.status !== statusFilter) {
        return false;
      }

      if (report.report_date) {
        if (startDate && report.report_date < startDate) return false;
        if (endDate && report.report_date > endDate) return false;
      }

      if (!normalized) {
        return true;
      }

      const haystack = `${report.duty_name ?? ""} ${report.shift_time_label ?? ""}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [endDate, reports, searchText, startDate, stationFilter, statusFilter]);
  const currentFilters = { stationFilter, statusFilter, startDate, endDate, searchText };
  const hasActiveFilters = !areFiltersDefault(currentFilters, defaultFilters);
  const stationOptions = useMemo(
    () =>
      Array.from(new Set(reports.map((report) => report.fuel_stations?.name ?? "").filter(Boolean))).filter(
        (name): name is string => Boolean(name)
      ),
    [reports]
  );

  return (
    <div className="rounded-2xl border bg-white p-5">
      {!liveData ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Shift reports cannot load until Supabase is configured. {config.reason}
        </p>
      ) : null}

      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading reports...</p> : null}

      {!loading ? (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Input aria-label="Search by duty cashier" placeholder="Search duty/cashier or shift" value={searchText} onChange={(event) => setSearchText(event.target.value)} />
          <select className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm" value={stationFilter} onChange={(event) => setStationFilter(event.target.value)}>
            <option value="all">All stations</option>
            {stationOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ReportStatusFilter)}>
            <option value="all">All statuses</option><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="reviewed">Reviewed</option><option value="approved">Approved</option>
          </select>
          <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          <ResetFiltersButton className="ml-auto" onClick={resetFilters} visible={hasActiveFilters} />
        </div>
      ) : null}

      {!loading && reports.length === 0 ? (
        <p className="text-sm text-slate-500">
          {liveData ? "No reports found. Create one manually or use future mobile shift submission when available." : "No live report data is available in setup mode."}
        </p>
      ) : null}

      {!loading && reports.length > 0 && filteredReports.length === 0 ? (
        <p className="text-sm text-slate-500">No reports matched your search/filter.</p>
      ) : null}

      {!loading && filteredReports.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">Date</th>
                <th>Duty/Cashier</th>
                <th>Shift</th>
                <th>Station</th>
                <th>Status</th>
                <th>Source</th>
                <th className="text-right">Cash count</th>
                <th className="text-right">Net remittance</th>
                <th className="text-right">Cash over/short</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((report) => {
                const isApproved = report.status === "approved";
                const isBusy = busyReportId === report.id;
                const discrepancyAmount = Number(report.discrepancy_amount ?? 0);
                const totals = report.calculated_totals ?? {};
                const cashCount = getTotalAsNumber(totals, "totalCashCount");
                const netRemittance = getTotalAsNumber(totals, "operationalNetRemittance");

                return (
                  <tr className="border-t" key={report.id}>
                    <td className="py-3">{report.report_date || "-"}</td>
                    <td>{report.duty_name || "-"}</td>
                    <td>{report.shift_time_label || "-"}</td>
                    <td>{report.fuel_stations?.name ?? "-"}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={report.status} />
                        <Badge className={getDiscrepancyStatus(discrepancyAmount).tone === "positive" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : getDiscrepancyStatus(discrepancyAmount).tone === "negative" ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-700"}>{getDiscrepancyLabel(discrepancyAmount)}</Badge>
                      </div>
                    </td>
                    <td>{getShiftReportSourceLabel(report.source)}</td>
                    <td className="text-right">{cashCount === null ? "-" : formatCurrency(cashCount)}</td>
                    <td className="text-right">{netRemittance === null ? "-" : formatCurrency(netRemittance)}</td>
                    <td className="text-right">{formatSignedCurrency(discrepancyAmount)}</td>
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        <a
                          href={appPath(`/shift-reports/view/?id=${report.id}`)}
                          className="inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-medium hover:bg-slate-50"
                        >
                          View
                        </a>
                        <Button variant="outline" onClick={() => approve(report.id)} disabled={isApproved || isBusy}>
                          {isBusy ? "Approving..." : isApproved ? "Approved" : "Approve"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
