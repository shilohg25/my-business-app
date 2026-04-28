import { z } from "zod";

const requiredText = (label: string) => z.string().trim().min(1, `${label} is required.`);

export const shiftReportSaveSchema = z.object({
  stationId: z.string().uuid("Select a valid station.").optional(),
  reportDate: requiredText("Report date").refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Report date must be a valid date."
  }),
  dutyName: requiredText("Duty / cashier"),
  shiftTimeLabel: requiredText("Shift"),
  prices: z
    .array(
      z.object({
        productCode: requiredText("Product code"),
        price: z.coerce.number().min(0, "Price must be 0 or more.")
      })
    )
    .min(1, "Add at least one product price."),
  meterReadings: z
    .array(
      z.object({
        pumpLabel: requiredText("Pump label"),
        productCode: requiredText("Product code"),
        beforeReading: z.coerce.number().min(0, "Before reading must be 0 or more."),
        afterReading: z.coerce.number().min(0, "After reading must be 0 or more."),
        calibrationLiters: z.coerce.number().min(0, "Calibration liters must be 0 or more.").default(0)
      })
    )
    .min(1, "Add at least one meter reading."),
  expenses: z.array(
    z.object({
      description: requiredText("Expense description"),
      amount: z.coerce.number().min(0, "Expense amount must be 0 or more.")
    })
  ),
  creditReceipts: z.array(
    z.object({
      companyName: requiredText("Customer or company"),
      productCode: requiredText("Product code"),
      liters: z.coerce.number().min(0, "Receipt liters must be 0 or more."),
      amount: z.coerce.number().min(0, "Receipt amount must be 0 or more.").optional(),
      externalReference: z.string().optional().nullable()
    })
  ),
  editReason: z.string().trim().optional()
});

export const adminActionExplanationSchema = z
  .string()
  .trim()
  .min(5, "Please add a short explanation (at least 5 characters).");
