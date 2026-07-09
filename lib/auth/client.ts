"use client";

import { createAuthClient } from "@neondatabase/auth/next";

// Browser-side Neon Auth client for client components (form submissions, hooks).
export const authClient = createAuthClient();
