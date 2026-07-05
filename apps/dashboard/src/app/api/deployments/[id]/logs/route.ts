import { type NextRequest, NextResponse } from "next/server";
import { ApiError, getLogs } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Same-origin proxy for the log poller: the browser talks to this route,
 *  this route talks to the control plane with the bearer token. */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const afterRaw = Number(req.nextUrl.searchParams.get("after") ?? "0");
  const after = Number.isFinite(afterRaw) && afterRaw > 0 ? afterRaw : 0;
  try {
    const data = await getLogs(id, after);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status || 502 },
      );
    }
    throw err;
  }
}
