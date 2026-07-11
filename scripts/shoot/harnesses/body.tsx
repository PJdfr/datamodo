// Harness: the Obsidian-flavored node body (MarkdownBody) with every feature
// exercised — tables, tasks, quotes, code, wikilinks (resolved + unresolved),
// highlight/strike, math (KaTeX → MathML, lazy-loaded).
// Run: npm run shoot -- body

import { createRoot } from "react-dom/client";
import { MarkdownBody, type ResolveNode } from "@/app/dashboard/markdown";

const MD = `## Brightwave renewal — decision note

Renew **Brightwave**, but ==consolidate billing== before the *Aug 31* deadline (~~separate invoices~~).

> Elena is open to a **12-month commit discount** — her words, from the dinner.

| Option | Monthly | Commitment |
|:-------|--------:|:----------:|
| Status quo | $1,540 | none |
| 12-mo commit | $1,417 | 1 year |

- [x] Confirm the ~8% discount with [[Elena Ruiz]]
- [ ] Fold [[INV-4417|the open invoice]] into the MSA schedule
- [ ] Ping [[Nonexistent Node]] about terms
  - subtask: check \`payment_terms\` = net 45

Savings math: $\\Delta = 1540 - 1417 = 123$ per month, so

$$12 \\cdot 123 = 1476 \\text{ USD/year}$$

\`\`\`sql
select sum(amount) from invoices where client = 'Brightwave';
\`\`\`

---
Full context in [the MSA](https://example.com/msa.pdf).`;

const resolve: ResolveNode = (target) => {
  const known: Record<string, { id: string; label: string }> = {
    "elena ruiz": { id: "e1", label: "Elena Ruiz" },
    "inv-4417": { id: "e2", label: "INV-4417" },
  };
  return known[target.trim().toLowerCase()] ?? null;
};

const flags = window as unknown as { __mounted: boolean };
flags.__mounted = false;
createRoot(document.getElementById("root")!).render(
  <div style={{ maxWidth: 560, margin: "24px auto", background: "#fff", border: "1px solid #ECE5D8", borderRadius: 12, padding: "14px 18px" }}>
    <MarkdownBody md={MD} resolveNode={resolve} onOpen={() => {}} />
  </div>,
);
flags.__mounted = true;
