One-line: The datamodo spreadsheet grid — mono uppercase header, hairline dividers, an index column, rich cells, and interactivity: click-to-sort headers, row hover, optional checkbox selection.

```jsx
<DataTable
  selectable
  defaultSort={{ key: "amount", dir: "desc" }}
  columns={[
    { key: "client", label: "Client", flex: "1.1fr" },
    { key: "amount", label: "Amount", mono: true, accent: true, align: "right" },
    { key: "source", label: "Source", sortable: false },
    { key: "conf", label: "Confidence", sortable: false },
    { key: "status", label: "Status" },
  ]}
  rows={[
    { id: 1, cells: { client: "Northwind", amount: "$3,400", source: { source: "Gmail" }, conf: { confidence: 0.99 }, status: { badge: "success", text: "Paid" } } },
    { id: 2, cells: { client: "Acme Inc", amount: "$12,000", source: { source: "WhatsApp" }, conf: { confidence: 0.93 }, status: { badge: "accent", text: "Approved" } }, highlight: true },
  ]}
  onRowClick={(row) => console.log(row)}
/>
```

Notes: usually placed inside a `MacWindow`. Mark data columns `mono`; `align:"right"` for numerics. Cell types: plain, `{ badge, text }` (status pill), `{ confidence: 0..1 }` (coral meter + %, turns amber under 70%), `{ source }` (channel tag). A `highlight` row gets the accent left-border + tint. `selectable` adds checkboxes + select-all; headers sort on click (▲/▼/off) unless the column sets `sortable:false`. Give rows stable `id`s when using selection.
