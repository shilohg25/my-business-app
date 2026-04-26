import fs from "node:fs";
import { describe, expect, it } from "vitest";

const bodegaClientSource = fs.readFileSync("src/components/bodega/bodega-client.tsx", "utf8");

describe("bodega modal action UI", () => {
  it("keeps action buttons visible and removes inline receive/transfer cards", () => {
    expect(bodegaClientSource).toContain("New Bodega");
    expect(bodegaClientSource).toContain("Receive Supplier Order");
    expect(bodegaClientSource).toContain("Transfer to Station");
    expect(bodegaClientSource).not.toContain("<CardTitle>Receive supplier order</CardTitle>");
    expect(bodegaClientSource).not.toContain("<CardTitle>Transfer to station</CardTitle>");
  });

  it("uses receive and transfer modals", () => {
    expect(bodegaClientSource).toContain('title="Receive Supplier Order"');
    expect(bodegaClientSource).toContain('title="Transfer Lubricants to Station"');
    expect(bodegaClientSource).toContain("receiveModalOpen");
    expect(bodegaClientSource).toContain("transferModalOpen");
  });
});

describe("bodega transfer validation", () => {
  it("blocks empty from and to locations", () => {
    expect(bodegaClientSource).toContain('setTransferError("Select the bodega to transfer from.")');
    expect(bodegaClientSource).toContain('setTransferError("Select the station to transfer to.")');
  });

  it("blocks quantity that exceeds available source stock", () => {
    expect(bodegaClientSource).toContain("requestedQty > availableQty");
    expect(bodegaClientSource).toContain('setTransferError("Transfer quantity exceeds available bodega stock.")');
  });
});

describe("bodega transfer product filtering", () => {
  it("only shows products with positive stock from selected source bodega", () => {
    expect(bodegaClientSource).toContain("row.location_id === transferFromBodegaId && asNumber(row.quantity_on_hand) > 0");
    expect(bodegaClientSource).toContain("No available lubricant stock in this bodega.");
  });
});
