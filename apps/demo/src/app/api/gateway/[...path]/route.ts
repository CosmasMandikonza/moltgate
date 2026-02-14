import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Runtime reverse proxy  /api/gateway/*  →  $GATEWAY_URL/*
//
// Unlike next.config rewrites (which are baked at build), this route handler
// reads GATEWAY_URL on every request — works in Docker, local dev, prod.
// ---------------------------------------------------------------------------

function gateway(): string {
  return process.env.GATEWAY_URL ?? "http://localhost:3000";
}

async function proxy(req: NextRequest, path: string): Promise<NextResponse> {
  const target = `${gateway()}/${path}${req.nextUrl.search}`;

  // Strip internal headers, forward the rest
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    if (!["host", "connection", "transfer-encoding"].includes(k.toLowerCase())) {
      headers[k] = v;
    }
  });

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? await req.arrayBuffer() : undefined,
      cache: "no-store",
    });

    // Relay status + all headers from gateway
    const resHeaders = new Headers();
    upstream.headers.forEach((v, k) => {
      // Skip hop-by-hop headers
      if (!["transfer-encoding", "connection", "keep-alive"].includes(k.toLowerCase())) {
        resHeaders.set(k, v);
      }
    });

    // Allow browser to read x402 payment headers
    resHeaders.set("Access-Control-Expose-Headers", "payment-required, payment-response");

    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: resHeaders,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Gateway unreachable", target, detail: String(err) },
      { status: 502 },
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxy(req, path.join("/"));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxy(req, path.join("/"));
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxy(req, path.join("/"));
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxy(req, path.join("/"));
}
