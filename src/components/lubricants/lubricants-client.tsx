"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canUseLiveData } from "@/lib/data/client";
import { fetchLubricantControlData } from "@/lib/data/lubricants";
import { getSupabaseConfigurationState } from "@/lib/supabase/client";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonthIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? Number.NaN);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number | string | null | undefined, digits = 2) {
  const numericValue = Number(value ?? Number.NaN);
  return Number.isFinite(numericValue)
    ? numericValue.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : "—";
}

function displayText(value: string | null | undefined) {
  return value?.trim() ? value : "—";
}

type LubricantsData = Awaited<ReturnType<typeof fetchLubricantControlData>>;
type StationInventoryRow = LubricantsData["stationInventory"][number];
type MovementRow = LubricantsData["movements"][number];

interface StationInventoryGroupData {
  stationId: string;
  stationName: string;
  rows: StationInventoryRow[];
  totalSkus: number;
  totalUnits: number;
  lowStockCount: number;
}

type StockStatus = "healthy" | "low" | "out";

function getStockStatus(quantityOnHand: number | string | null | undefined, reorderLevel: number | string | null | undefined): StockStatus {
  const quantity = asNumber(quantityOnHand);
  const reorder = asNumber(reorderLevel);
  if (quantity <= 0) return "out";
  if (quantity <= reorder) return "low";
  return "healthy";
}

function groupInventoryByStation(rows: StationInventoryRow[]): StationInventoryGroupData[] {
  const grouped = new Map<string, StationInventoryRow[]>();
  for (const row of rows) {
    const key = row.station_id || "unknown";
    const existing = grouped.get(key);
    if (existing) {
      existing.push(row);
    } else {
      grouped.set(key, [row]);
    }
  }

  return Array.from(grouped.entries())
    .map(([stationId, stationRows]) => ({
      stationId,
      stationName: stationRows[0]?.station_name?.trim() || "Unknown station",
      rows: stationRows,
      totalSkus: stationRows.length,
      totalUnits: stationRows.reduce((sum, row) => sum + asNumber(row.quantity_on_hand), 0),
      lowStockCount: stationRows.filter((row) => asNumber(row.quantity_on_hand) <= asNumber(row.reorder_level)).length
    }))
    .sort((a, b) => a.stationName.localeCompare(b.stationName));
}

function StockStatusBadge({ status }: { status: StockStatus }) {
  const styleByStatus: Record<StockStatus, { label: string; className: string }> = {
    healthy: { label: "Healthy", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    low: { label: "Low", className: "border-amber-200 bg-amber-50 text-amber-700" },
    out: { label: "Out", className: "border-rose-200 bg-rose-50 text-rose-700" }
  };

  const style = styleByStatus[status];
  return <Badge className={style.className}>{style.label}</Badge>;
}

function StationSummaryChips({ totalSkus, totalUnits, lowStockCount }: Pick<StationInventoryGroupData, "totalSkus" | "totalUnits" | "lowStockCount">) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Badge>Total SKUs: {totalSkus}</Badge>
      <Badge>Total Units: {formatNumber(totalUnits)}</Badge>
      <Badge className={lowStockCount > 0 ? "border-amber-200 bg-amber-50 text-amber-700" : undefined}>Low Stock: {lowStockCount}</Badge>
    </div>
  );
}

function StationInventoryTable({ rows }: { rows: StationInventoryRow[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>SKU</TableHead>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Quantity on hand</TableHead>
            <TableHead className="text-right">Reorder level</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const stockStatus = getStockStatus(row.quantity_on_hand, row.reorder_level);
            return (
              <TableRow key={row.id}>
                <TableCell>{displayText(row.sku)}</TableCell>
                <TableCell>{displayText(row.product_name)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(row.quantity_on_hand)}</TableCell>
                <TableCell className="text-right tabular-nums text-slate-600">{formatNumber(row.reorder_level)}</TableCell>
                <TableCell>
                  <StockStatusBadge status={stockStatus} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function StationInventoryGroup({ group }: { group: StationInventoryGroupData }) {
  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{group.stationName}</CardTitle>
        <StationSummaryChips totalSkus={group.totalSkus} totalUnits={group.totalUnits} lowStockCount={group.lowStockCount} />
      </CardHeader>
      <CardContent>
        <StationInventoryTable rows={group.rows} />
      </CardContent>
    </Card>
  );
}

function MovementTypeBadge({ movementType }: { movementType: string }) {
  const normalized = movementType.toLowerCase();
  if (normalized === "purchase") return <Badge className="border-blue-200 bg-blue-50 text-blue-700">Purchase</Badge>;
  if (normalized === "transfer") return <Badge className="border-violet-200 bg-violet-50 text-violet-700">Transfer</Badge>;
  if (normalized === "adjustment") return <Badge className="border-slate-300 bg-slate-100 text-slate-700">Adjustment</Badge>;
  return <Badge>{movementType}</Badge>;
}

function LubricantMovementTable({ movements }: { movements: MovementRow[] }) {
  if (!movements.length) {
    return <p className="text-sm text-slate-500">No movement history found for the current filter.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Date</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead>From</TableHead>
            <TableHead>To</TableHead>
            <TableHead>Reference</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap text-slate-600">{displayText(row.created_at?.slice(0, 10))}</TableCell>
              <TableCell>{displayText(row.product_name)}</TableCell>
              <TableCell>
                <MovementTypeBadge movementType={row.movement_type} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(row.quantity)}</TableCell>
              <TableCell className="text-slate-600">{displayText(row.from_location_name)}</TableCell>
              <TableCell className="text-slate-600">{displayText(row.to_location_name)}</TableCell>
              <TableCell className="text-slate-600">{displayText(row.reference)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ReconciliationWarningsCard({ warnings }: { warnings: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reconciliation warnings</CardTitle>
      </CardHeader>
      <CardContent>
        {warnings.length ? (
          <ul className="space-y-2 pl-5 text-sm text-amber-800">
            {warnings.map((warning) => (
              <li key={warning} className="list-disc">
                {warning}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No warnings found. Inventory records are currently consistent.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function LubricantsClient() {
  const liveData = canUseLiveData();
  const config = getSupabaseConfigurationState();
  const [result, setResult] = useState<LubricantsData | null>(null);
  const [stationFilter, setStationFilter] = useState("all");

  useEffect(() => {
    fetchLubricantControlData({ startDate: startOfMonthIso(), endDate: todayIso() })
      .then(setResult)
      .catch(() => setResult(null));
  }, [liveData]);

  const filteredStationInventory = useMemo(
    () => (result?.stationInventory ?? []).filter((row) => stationFilter === "all" || row.station_id === stationFilter),
    [result, stationFilter]
  );

  const filteredMovements = useMemo(
    () =>
      (result?.movements ?? []).filter(
        (row) => stationFilter === "all" || row.from_location_id === stationFilter || row.to_location_id === stationFilter
      ),
    [result, stationFilter]
  );

  const groupedInventory = useMemo(() => groupInventoryByStation(filteredStationInventory), [filteredStationInventory]);
  const selectedStationName = useMemo(
    () => result?.stations.find((station) => station.id === stationFilter)?.name ?? "Selected station",
    [result, stationFilter]
  );
  const selectedStationGroup = groupedInventory[0];

  return (
    <div className="space-y-6">
      {!liveData ? <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{config.reason}</div> : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="station-filter">
            Station
          </label>
          <select
            id="station-filter"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            value={stationFilter}
            onChange={(e) => setStationFilter(e.target.value)}
          >
            <option value="all">All stations</option>
            {(result?.stations ?? []).map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Station lubricant inventory</CardTitle>
          <p className="text-sm text-slate-500">Grouped stock visibility with low-stock indicators by station.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!groupedInventory.length ? (
            <p className="text-sm text-slate-500">No station inventory found for the current filter.</p>
          ) : stationFilter === "all" ? (
            <div className="space-y-4">
              {groupedInventory.map((group) => (
                <StationInventoryGroup key={group.stationId} group={group} />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{selectedStationGroup?.stationName ?? selectedStationName}</h3>
                {selectedStationGroup ? (
                  <StationSummaryChips
                    totalSkus={selectedStationGroup.totalSkus}
                    totalUnits={selectedStationGroup.totalUnits}
                    lowStockCount={selectedStationGroup.lowStockCount}
                  />
                ) : null}
              </div>
              {selectedStationGroup ? (
                <StationInventoryTable rows={selectedStationGroup.rows} />
              ) : (
                <p className="text-sm text-slate-500">No station inventory found for the selected station.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Movement history</CardTitle>
          <p className="text-sm text-slate-500">Recent lubricant inventory movements across locations.</p>
        </CardHeader>
        <CardContent>
          <LubricantMovementTable movements={filteredMovements} />
        </CardContent>
      </Card>

      <ReconciliationWarningsCard warnings={result?.warnings ?? []} />
    </div>
  );
}
