Real content cards joined by animated connectors — use it whenever a "pile of cards" should read as one connected graph (pipelines, entity relationships, how-it-works flows).

```jsx
<LinkedCards
  links={[["inbox", "people"], ["inbox", "invoices"], ["invoices", "amount"]]}
  style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 40 }}
>
  <LinkedCard id="inbox" tone="accent">Your inbox</LinkedCard>
  <LinkedCard id="people">Sarah Chen</LinkedCard>
  <LinkedCard id="invoices">#A-204</LinkedCard>
  <LinkedCard id="amount" tone="ink">$12,000</LinkedCard>
</LinkedCards>
```

- Put your layout (grid/flex, gaps) on `LinkedCards` `style`; the connectors are measured from the live DOM, so leave generous gaps (32–48px) for edges to breathe.
- `id` on each `LinkedCard` must match the ids in `links`. Order of `links` controls draw-in stagger.
- Hover/focus a card to highlight its neighborhood; unrelated cards + edges dim.
- Turn off the marching pulse with `flow={false}`, or the scroll draw-in with `animate={false}`.
- `tone`: "cream" (default) · "ink" · "accent". Pairs well with a `KnowledgeGraph` when you want abstract nodes instead of real content.
