"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { isLocalMode } from "@/lib/local/config";

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  // Only allow same-site relative paths to avoid open redirects.
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export async function login(formData: FormData) {
  // Local edition has no auth — any attempt just enters the app.
  if (isLocalMode()) redirect("/dashboard");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("redirectTo"));

  const { error } = await auth.signIn.email({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message ?? "Sign in failed")}`);
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signup(formData: FormData) {
  if (isLocalMode()) redirect("/dashboard");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();

  const { error } = await auth.signUp.email({
    email,
    password,
    name: fullName || email.split("@")[0] || "New user",
  });
  if (error) {
    redirect(`/register?error=${encodeURIComponent(error.message ?? "Sign up failed")}`);
  }

  // Email verification is off, so sign-up establishes a session immediately.
  // The personal org is provisioned lazily on first dashboard load
  // (see requireUserOrg), which also covers OAuth sign-ups.
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signout() {
  // Local edition: nothing to sign out of — stay in the app.
  if (isLocalMode()) redirect("/dashboard");
  await auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
