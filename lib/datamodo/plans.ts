// Plan definitions — the single source of truth for entitlements + pricing.

export type Plan = "free" | "pro" | "max";
export type ComputeMode = "cloud" | "byok";
export type AiProvider = "anthropic" | "openai";

export interface PlanLimits {
  key: Plan;
  label: string;
  priceMonthly: number; // USD; 0 = free
  /** null = unlimited */
  maxAgents: number | null;
  /** Auto (firehose) mode — reads every message. */
  autoMode: boolean;
  /** May use Datamodo-paid cloud compute (vs. only their own API key). */
  cloudCompute: boolean;
  storageMb: number;
  /** null = unlimited */
  rowsPerTable: number | null;
  /** Days of version history retained (null = unlimited). */
  historyDays: number | null;
}

export const PLANS: Record<Plan, PlanLimits> = {
  free: { key: "free", label: "Free", priceMonthly: 0, maxAgents: 3, autoMode: false, cloudCompute: false, storageMb: 100, rowsPerTable: 500, historyDays: 7 },
  pro: { key: "pro", label: "Pro", priceMonthly: 18, maxAgents: 25, autoMode: true, cloudCompute: true, storageMb: 25_000, rowsPerTable: null, historyDays: null },
  max: { key: "max", label: "Max", priceMonthly: 49, maxAgents: null, autoMode: true, cloudCompute: true, storageMb: 250_000, rowsPerTable: null, historyDays: null },
};

export const PLAN_ORDER: Plan[] = ["free", "pro", "max"];

/** Marketing copy for the landing pricing cards. */
export const PLAN_MARKETING: Record<Plan, { tagline: string; features: string[]; cta: string; highlight?: boolean }> = {
  free: {
    tagline: "For trying it out with your own AI key.",
    cta: "Start free",
    features: [
      "Up to 3 agents",
      "On-ping mode (you forward or tag it)",
      "Bring your own key — Claude or OpenAI",
      "100 MB storage · 500 rows / table",
      "Excel export",
      "7-day version history",
    ],
  },
  pro: {
    tagline: "For turning your inbox into a database on autopilot.",
    cta: "Upgrade to Pro",
    highlight: true,
    features: [
      "Up to 25 agents",
      "Auto mode — reads every message",
      "Datamodo cloud compute included, or use your own key",
      "25 GB storage · unlimited rows",
      "Full version history + restore",
      "All channel connectors · priority support",
    ],
  },
  max: {
    tagline: "For power users running many agents at scale.",
    cta: "Go Max",
    features: [
      "Unlimited agents",
      "Everything in Pro",
      "Higher cloud compute quota",
      "250 GB storage",
      "API access + scheduled sync",
    ],
  },
};

export function planLimits(plan: Plan): PlanLimits {
  return PLANS[plan] ?? PLANS.free;
}
