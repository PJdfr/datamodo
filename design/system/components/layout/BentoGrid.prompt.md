Asymmetric bento layout — tiles of mixed sizes packed with dense auto-flow — to replace an even, monotonous card grid. Compose `BentoTile`s inside a `BentoGrid`.

```jsx
<BentoGrid columns={4} rowHeight={168}>
  <BentoTile colSpan={2} rowSpan={2} tone="ink">
    <h3>A junk drawer that sorts itself.</h3>
  </BentoTile>
  <BentoTile colSpan={2}>…</BentoTile>
  <BentoTile>…</BentoTile>
  <BentoTile tone="accent">…</BentoTile>
  <BentoTile colSpan={2} bare>
    <KnowledgeGraph />   {/* bare = no card chrome, drop media straight in */}
  </BentoTile>
</BentoGrid>
```

- `BentoTile` is a styled surface by default (cream / ink / accent). Pass `bare` to drop in a graph, MacWindow, or DataTable without double chrome.
- Combine with `SpotlightCard` inside a `bare` tile for hover-reactive bento cells.
- Dense auto-flow means later small tiles backfill gaps — reorder for the composition you want.
