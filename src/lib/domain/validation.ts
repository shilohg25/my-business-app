import { z } from "zod";

export const entrySourceSchema = z.enum(["web_manual", "excel_import", "mobile_submission"]);

export const productPriceSchema = z.object({
  productCode: z.string().min(1),
  price: z.coerce.number().nonnegative()
});

export const meterReadingSchema = z.object({
  pumpId: z.string().uuid().optional(),
  pumpLabel: z.string().min(1),
  productCode: z.string().min(1),
  beforeReading: z.coerce.number(),
  afterReading: z.coerce.number(),
  calibrationLiters: z.coerce.number().optional().default(0)
});

export const creditReceiptSchema = z.object({
  productCode: z.string().min(1),
  companyName: z.string().min(1),
  receiptNumber: z.string().optional(),
  liters: z.coerce.number(),
  amount: z.coerce.number().optional(),
  externalCustomerId: z.string().uuid().optional().nullable(),
  externalReference: z.string().optional().nullable(),
  attachmentPath: z.string().optional().nullable()
});

export const expenseSchema = z.object({
  description: z.string().min(1),
  category: z.string().optional().nullable(),
  amount: z.coerce.number()
});

export const cashCountSchema = z.object({
  denomination: z.coerce.number().positive(),
  quantity: z.coerce.number(),
  lineAmount: z.coerce.number().optional()
});

export const lubricantSaleSchema = z.object({
  productName: z.string().min(1),
  quantity: z.coerce.number(),
  unitPrice: z.coerce.number()
});

export const shiftReportSchema = z.object({
  stationId: z.string().uuid().optional(),
  reportDate: z.string().min(1),
  dutyName: z.string().min(1),
  shiftTimeLabel: z.string().min(1),
  source: entrySourceSchema,
  prices: z.array(productPriceSchema).min(1),
  meterReadings: z.array(meterReadingSchema).min(1),
  creditReceipts: z.array(creditReceiptSchema).default([]),
  expenses: z.array(expenseSchema).default([]),
  cashCounts: z.array(cashCountSchema).default([]),
  coinsAmount: z.coerce.number().optional().default(0),
  lubricantSales: z.array(lubricantSaleSchema).default([]),
  editReason: z.string().optional()
});
