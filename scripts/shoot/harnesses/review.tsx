// Harness: the Review Studio in its simulated-preview state (fetch stubbed to
// return no real reviews, so the SIMULATED set renders — including the
// category-proposal card, growth loop ⑤).
// Run: npm run shoot -- review

import { createRoot } from "react-dom/client";
import { ReviewStudio } from "@/app/dashboard/review-studio";

// No real reviews → the component falls back to its labelled simulated data.
window.fetch = (async () => ({
  ok: true,
  json: async () => ({ reviews: [] }),
})) as unknown as typeof fetch;

const flags = window as unknown as { __mounted: boolean };
flags.__mounted = false;
createRoot(document.getElementById("root")!).render(<ReviewStudio />);
flags.__mounted = true;
