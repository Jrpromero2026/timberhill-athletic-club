import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Route protection + session refresh (Next 16 "proxy" convention — the
 * successor to middleware.ts).
 *
 * When Supabase is configured, every non-public route requires a signed-in
 * user; unauthenticated requests are redirected to /login with the intended
 * destination preserved, and authenticated users are bounced away from
 * /login. When Supabase is NOT configured, routing falls through to the app
 * shell, which renders either the explicit offline preview or the
 * setup-required page — never real data.
 */

const PUBLIC_PATHS = new Set([
  "/login",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
]);

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname) || pathname.startsWith("/auth/");
}

/**
 * Public marketing routes — the Personal Training hub and everything beneath
 * it, served by the `(marketing)` route group.
 *
 * These are the ONLY paths in this application open to the world. They are
 * matched by exact segment rather than loose prefix, so a path such as
 * `/personal-training-internal` can never fall through as public.
 *
 * They are answered before any Supabase work below, for two reasons: they need
 * no session at all, and they are statically prerendered pages whose hero
 * image is the LCP element — a `getUser()` round trip on every request would
 * be pure latency against the < 2.5s target in the build brief §9.
 */
const PUBLIC_MARKETING_PREFIXES = ["/personal-training"] as const;

function isPublicMarketing(pathname: string): boolean {
  // The root is public because it is the public front door: it redirects to
  // the marketing hub, and an anonymous visitor must reach that redirect
  // rather than being bounced to /login on the way.
  if (pathname === "/") return true;

  return PUBLIC_MARKETING_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function proxy(request: NextRequest) {
  if (isPublicMarketing(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refreshes the session when needed; the ONLY trustworthy signal is
  // getUser() (validates the JWT against the auth server).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    const next = pathname === "/" ? "" : `${pathname}${search}`;
    if (next) loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    const nextParam = request.nextUrl.searchParams.get("next");
    const dest = request.nextUrl.clone();
    dest.pathname =
      nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
        ? nextParam
        : "/overview";
    dest.search = "";
    return NextResponse.redirect(dest);
  }

  return response;
}

export const config = {
  // Everything except static assets and files with extensions.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\..*).*)"],
};
