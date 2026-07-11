// Harness: the unified Tables surface's schema view (Supabase-style diagram).
// Run: npm run shoot -- schema

import { createRoot } from "react-dom/client";
import { SchemaView } from "@/app/dashboard/schema-view";
import { DEFAULT_KINDS } from "@/lib/datamodo/ontology";

const counts = new Map<string, number>([
  ["person", 12], ["company", 4], ["invoice", 5], ["document", 9], ["concept", 3],
]);
const tables = [{ id: "ds1", name: "Invoices" }, { id: "ds2", name: "People" }];
// An explicit dataset_relations link — renders as a DASHED line between cards.
const tableLinks = [{ fromDatasetId: "ds1", fromColumn: "client", toDatasetId: "ds2", toColumn: "name", label: null }];

const flags = window as unknown as { __mounted: boolean };
flags.__mounted = false;
createRoot(document.getElementById("root")!).render(
  <SchemaView
    kinds={DEFAULT_KINDS.map((k, i) => ({ ...k, id: `k${i}` }))}
    countByKind={counts}
    tables={tables}
    tableLinks={tableLinks}
    selectedKind="invoice"
    onSelectKind={() => {}}
    onOpenTable={() => {}}
    onMaterialized={() => {}}
  />,
);
flags.__mounted = true;
