import { NextResponse, type NextRequest } from "next/server";

/**
 * HTTP Basic Auth for the whole dashboard. The control plane can start
 * containers on the box, so its viewport needs a lock before it's exposed.
 * DASHBOARD_PASSWORD unset = open (local dev); provision.md requires it on
 * the VPS. Single user, so the username is fixed and only the password counts.
 */
export function middleware(req: NextRequest): NextResponse {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const supplied = decoded.slice(decoded.indexOf(":") + 1);
    if (timingSafeEqual(supplied, password)) return NextResponse.next();
  }
  return new NextResponse("authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="mini-vercel"' },
  });
}

/** Constant-time compare (edge runtime has no node:crypto timingSafeEqual). */
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  let diff = bufA.length ^ bufB.length;
  const len = Math.max(bufA.length, bufB.length);
  for (let i = 0; i < len; i++) {
    diff |= (bufA[i % bufA.length] ?? 0) ^ (bufB[i % bufB.length] ?? 0);
  }
  return diff === 0;
}
