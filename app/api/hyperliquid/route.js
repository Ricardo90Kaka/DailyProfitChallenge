import { NextResponse } from "next/server";
import { HyperliquidRequestError, postHyperliquid } from "../../../lib/hyperliquid";

function mapStatus(error) {
  if (error?.code === "TIMEOUT") return 504;
  if (error?.status === 429 || (typeof error?.status === "number" && error.status >= 500)) return 503;
  if (typeof error?.status === "number" && error.status >= 400) return 502;
  return 500;
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const data = await postHyperliquid(payload);
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    const normalized =
      error instanceof HyperliquidRequestError
        ? error
        : new HyperliquidRequestError(error?.message ?? "Hyperliquid proxy failed");

    return NextResponse.json(
      {
        error: normalized.message,
        code: normalized.code ?? "PROXY_ERROR",
        upstreamStatus: normalized.status ?? null,
        details: normalized.details ?? null
      },
      { status: mapStatus(normalized) }
    );
  }
}
