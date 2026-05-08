import { NextResponse } from "next/server";
import { requireOwnerFromRequest } from "@/lib/auth/server-owner";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";

export async function POST(request: Request) {
  try {
    await requireOwnerFromRequest(request);

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.rpc("fuel_ensure_verified_tank_calibration_profiles");

    if (error) {
      const message = error.message ?? "Unknown Supabase RPC error";
      const rpcMissing = message.includes("function") || message.includes("does not exist") || error.code === "42883";

      if (rpcMissing) {
        return NextResponse.json(
          { error: "Tank calibration RPC is not installed. Apply the Supabase tank calibration migrations." },
          { status: 501 }
        );
      }

      return NextResponse.json({ error: message }, { status: 500 });
    }

    return NextResponse.json({ profiles: data ?? [] });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
