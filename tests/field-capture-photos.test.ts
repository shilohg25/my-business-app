import { describe, expect, it } from "vitest";
import {
  buildCapturePhotoObjectPath,
  FIELD_CAPTURE_ALLOWED_MIME_TYPES,
  FIELD_CAPTURE_PHOTO_MAX_BYTES,
  sanitizeFileName,
  validateCapturePhotoFile
} from "@/lib/data/field-capture-photos";

describe("field capture photo helpers", () => {
  it("sanitizeFileName removes unsafe characters", () => {
    expect(sanitizeFileName("  Meter Read #1 (Final).JPG  ")).toBe("meter-read-1-final-.jpg");
    expect(sanitizeFileName("../../unsafe\\name.png")).toBe("unsafe-name.png");
  });

  it("buildCapturePhotoObjectPath includes station_id/session_id/photo_type/photo_id", () => {
    const path = buildCapturePhotoObjectPath({
      stationId: "11111111-1111-1111-1111-111111111111",
      captureSessionId: "22222222-2222-2222-2222-222222222222",
      photoType: "meter_reading",
      photoId: "33333333-3333-3333-3333-333333333333",
      originalFileName: "Meter 1.jpg"
    });

    expect(path).toContain("11111111-1111-1111-1111-111111111111/");
    expect(path).toContain("/22222222-2222-2222-2222-222222222222/");
    expect(path).toContain("/meter_reading/");
    expect(path).toContain("33333333-3333-3333-3333-333333333333-meter-1.jpg");
  });

  it("rejects unsupported MIME type", () => {
    expect(() => validateCapturePhotoFile({ type: "application/pdf", size: 1024 } as File)).toThrow(/Unsupported file type/);
  });

  it("rejects files over size limit", () => {
    expect(() => validateCapturePhotoFile({ type: "image/jpeg", size: FIELD_CAPTURE_PHOTO_MAX_BYTES + 1 } as File)).toThrow(/10MB/);
  });

  it("accepts jpg/png/webp", () => {
    FIELD_CAPTURE_ALLOWED_MIME_TYPES.forEach((type) => {
      expect(() => validateCapturePhotoFile({ type, size: FIELD_CAPTURE_PHOTO_MAX_BYTES } as File)).not.toThrow();
    });
  });
});
