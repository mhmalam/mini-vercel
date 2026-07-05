import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, safeEqual, sessionToken } from "@/lib/auth";

/**
 * Gate the whole dashboard behind the login page. DASHBOARD_PASSWORD unset =
 * open (local dev); provision.md requires it on the VPS. The control plane
 * can start containers on the box — its viewport needs a lock.
 */
export async function middleware(req: NextRequest): Promise<NextResponse> {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

  if (req.nextUrl.pathname === "/login") return NextResponse.next();

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && safeEqual(cookie, await sessionToken(password))) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // everything except Next's own assets
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
