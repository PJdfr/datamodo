Animated, **interactive** node-link graph showing how datamodo links extracted people, companies, invoices and messages — use it as a hero/section centerpiece to break up stacked cards, not as a small inline element. Drag nodes to rearrange, click a node to pin an inspector panel.

```jsx
<KnowledgeGraph style={{ maxWidth: 620 }} onSelect={(node) => console.log(node)} />

// custom graph
<KnowledgeGraph
  nodes={[
    { id: "inbox", label: "your inbox", x: 250, y: 170, type: "hub" },
    { id: "acme", label: "Acme Inc", x: 120, y: 80, type: "company", facts: ["Domain · acme.co", "2 open invoices"] },
    { id: "amt", label: "$12,000", x: 130, y: 270, type: "amount" },
  ]}
  edges={[{ from: "inbox", to: "acme" }, { from: "acme", to: "amt" }]}
/>
```

- Coordinates are in a fixed 500×340 viewBox; the SVG scales to `width` (default 100%). Give the wrapper a max-width so it stays legible.
- Node `type` sets the chip color: `hub` (coral), `company` (ink), `person` (cream), `invoice` (sunk mono), `amount` (coral tint mono), `message` (cream).
- **Drag** any node (hold + move) to rearrange — edges follow live. **Click** a node to pin the inspector (its `facts` + connected nodes, which are themselves clickable). Click empty canvas to close. Set `draggable={false}` to lock positions.
- Nodes are keyboard-focusable — tab lights connections like hover, Enter/Space pins the inspector. `onSelect` fires with the pinned node (or null).
- Set `play={false}` for a static render (e.g. inside another animation you control).
