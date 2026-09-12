import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { completePendingInvite } from "@/lib/auth/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Auth confirmation endpoint for emailed links (password recovery, signup
 * confirmation, invite emails). Verifies the one-time token server-side and
 * establishes the session, then routes:
 *   - recovery  → /reset-password (with an authenticated session)
 *   - signup    → completes any pending invitation, then /overview
 * Invalid or expired tokens land on /login with a safe, generic notice.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const rawNext = searchParams.get("next") ?? "/performance-operations/overview";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/performance-operations/overview";

  const redirectTo = (path: string, params?: Record<string, string>) => {
    const url = new URL(path, request.url);
    for (const [k, v] of Object.entries(params ?? {})) {
      url.searchParams.set(k, v);
    }
    return NextResponse.redirect(url);
  };

  if (!tokenHash || !type) {
    return redirectTo("/login", { notice: "invalid_link" });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return redirectTo("/login", { notice: "not_configured" });

  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });
  if (error) {
    return redirectTo("/login", { notice: "expired_link" });
  }

  if (type === "recovery") {
    return redirectTo("/reset-password");
  }

  // Fresh signup or email confirmation: finish a pending invite if one exists.
  await completePendingInvite();
  return redirectTo(next);
}
