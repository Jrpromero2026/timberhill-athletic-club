"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { INVITE_COOKIE } from "./constants";

/**
 * Authentication server actions. All flows run server-side; role and
 * organization data are never accepted from the client. Error messages are
 * deliberately generic where enumeration matters (password reset never
 * reveals whether an email exists).
 */

export interface AuthFormState {
  error?: string;
  message?: string;
}

/** Only allow same-site relative destinations (no open redirects). */
function safeNext(raw: unknown): string {
  if (typeof raw !== "string") return "/performance-operations/overview";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/auth")) {
    return "/performance-operations/overview";
  }
  return raw;
}

const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export async function signIn(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email address and password." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Authentication is not configured." };

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    return { error: "Invalid email or password." };
  }

  redirect(safeNext(formData.get("next")));
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  // Local scope: signing out of this browser must not revoke the user's
  // sessions on other devices.
  if (supabase) await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

const emailSchema = z.object({ email: z.email() });

export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  // Identical response whether or not the account exists — no enumeration.
  const neutral = {
    message:
      "If an account exists for that address, a password-reset email is on its way.",
  };
  if (!parsed.success) return neutral;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return neutral;

  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/confirm?next=/reset-password`,
  });
  return neutral;
}

const passwordSchema = z.object({
  password: z.string().min(10, "Password must be at least 10 characters."),
  confirm: z.string(),
});

export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = passwordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid password." };
  }
  if (parsed.data.password !== parsed.data.confirm) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Authentication is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error:
        "Your reset link is invalid or has expired. Request a new one from the sign-in page.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) return { error: "Could not update the password. Try again." };

  redirect("/performance-operations/overview");
}

/* ---------------------------------------------------------------------------
 * Invitation acceptance
 * ------------------------------------------------------------------------ */

const acceptSchema = z.object({
  token: z.string().min(20).max(200),
  fullName: z.string().min(1, "Enter your name.").max(200),
  password: z.string().min(10, "Password must be at least 10 characters."),
});

/**
 * Accept an invitation as a NEW user: create the auth account, then activate
 * the invitation (profile + memberships) atomically via app.accept_invitation.
 * If email confirmation is enabled, the invite token is kept in an httpOnly
 * cookie so acceptance completes right after the user confirms and signs in.
 */
export async function acceptInviteSignUp(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = acceptSchema.safeParse({
    token: formData.get("token"),
    fullName: formData.get("fullName"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Authentication is not configured." };

  // Server-side re-validation of the invitation before creating any account.
  const { data: previews } = await supabase.rpc("get_invitation_preview", {
    p_token: parsed.data.token,
  });
  const preview = Array.isArray(previews) ? previews[0] : previews;
  if (!preview || preview.status !== "pending") {
    return { error: "This invitation is invalid, expired, or already used." };
  }
  if (new Date(preview.expires_at) <= new Date()) {
    return { error: "This invitation has expired. Ask your administrator for a new one." };
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: preview.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  });
  if (signUpError) {
    return {
      error:
        "Could not create the account. If you already have one, sign in first and then reopen your invite link.",
    };
  }

  // Keep the token so acceptance can complete after email confirmation.
  const cookieStore = await cookies();
  cookieStore.set(INVITE_COOKIE, parsed.data.token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24,
  });

  if (!signUpData.session) {
    return {
      message:
        "Account created. Check your email to confirm your address — your invitation will activate automatically when you sign in.",
    };
  }

  const { error: acceptError } = await supabase.rpc("accept_invitation", {
    p_token: parsed.data.token,
  });
  if (acceptError) {
    return { error: mapAcceptError(acceptError.message) };
  }
  cookieStore.delete(INVITE_COOKIE);
  redirect("/performance-operations/overview");
}

/** Accept an invitation while already signed in (email must match). */
export async function acceptInviteSignedIn(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const token = formData.get("token");
  if (typeof token !== "string" || token.length < 20) {
    return { error: "Invalid invitation link." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Authentication is not configured." };

  const { error } = await supabase.rpc("accept_invitation", {
    p_token: token,
  });
  if (error) return { error: mapAcceptError(error.message) };

  const cookieStore = await cookies();
  cookieStore.delete(INVITE_COOKIE);
  redirect("/performance-operations/overview");
}

/**
 * Called after /auth/confirm when a pending invite cookie exists: completes
 * acceptance for the freshly confirmed user. Failure is non-fatal (the user
 * can reopen their invite link).
 */
export async function completePendingInvite(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(INVITE_COOKIE)?.value;
  if (!token) return;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return;
  const { error } = await supabase.rpc("accept_invitation", {
    p_token: token,
  });
  if (!error) cookieStore.delete(INVITE_COOKIE);
}

function mapAcceptError(message: string): string {
  if (message.includes("invitation_expired")) {
    return "This invitation has expired. Ask your administrator for a new one.";
  }
  if (message.includes("invitation_not_pending")) {
    return "This invitation was already used or revoked.";
  }
  if (message.includes("invitation_email_mismatch")) {
    return "This invitation was issued for a different email address than the one you are signed in with.";
  }
  if (message.includes("invitation_not_found")) {
    return "This invitation link is invalid.";
  }
  return "Could not accept the invitation. Try again or contact your administrator.";
}
