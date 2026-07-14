// Harness: the in-app Chat channel with a fixture thread (fetch is stubbed —
// no server needed). Shows day separators, text/attachment bubbles, live
// processing state, and the composer.
// Run: npm run shoot -- chat

import { createRoot } from "react-dom/client";
import { ChatView } from "@/app/dashboard/chat-view";

const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60000).toISOString();
const messages = [
  {
    id: "m1",
    text: "note: met Elena from Brightwave — open to an 8% discount on a 12-month commit. Decide before Aug 31.",
    status: "analyzed", error: null, at: iso(60 * 26), attachments: [],
  },
  {
    id: "m2", text: null, status: "analyzed", error: null, at: iso(60 * 25),
    attachments: [{ filename: "receipt-figma-jun.jpg", contentType: "image/jpeg", bytes: 412330 }],
  },
  {
    id: "m3",
    text: "Contract from Copperfield attached — goes with the NDA project.",
    status: "analyzed", error: null, at: iso(34),
    attachments: [{ filename: "Copperfield-NDA.pdf", contentType: "application/pdf", bytes: 90210 }],
  },
  {
    id: "m4", text: null, status: "analyzing", error: null, at: iso(1),
    attachments: [{ filename: "voice-note-101532.webm", contentType: "audio/webm", bytes: 288401 }],
  },
];

// The pull request rides the thread as datamodo's own bubble (tap-to-approve).
const questions = [
  { id: "q1", question: 'Merge "ACME Incorporated" into "Acme Group"?' },
  { id: "q2", question: 'Create the category "Subscription" (3 things waiting)?' },
];

// Recipients for the composer's "to" picker / @mentions.
const agents = [
  { id: "a1", name: "Invoices", purposeText: "billing docs, amounts, due dates" },
  { id: "a2", name: "Recruiting", purposeText: "candidates, interviews, offers" },
];

window.fetch = (async () =>
  new Response(JSON.stringify({ messages, questions, agents }), { headers: { "content-type": "application/json" } })) as typeof fetch;

const flags = window as unknown as { __mounted: boolean };
flags.__mounted = false;
createRoot(document.getElementById("root")!).render(<ChatView />);
flags.__mounted = true;
