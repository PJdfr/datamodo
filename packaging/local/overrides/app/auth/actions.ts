"use server";

import { redirect } from "next/navigation";

// LOCAL EDITION build of app/auth/actions.ts — there is no login. Any auth
// action just enters the app as the one local user. (The cloud edition's Neon
// Auth calls are closed-layer; scripts/build-local-package.mjs swaps this in.)

export async function login(_formData: FormData) {
  redirect("/dashboard");
}

export async function signup(_formData: FormData) {
  redirect("/dashboard");
}

export async function signout() {
  redirect("/dashboard");
}
