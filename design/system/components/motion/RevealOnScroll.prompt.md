Wraps a section (or a list of children) and fades + rises it into view the first time it scrolls into the viewport. Adds fluidity to long landing/app pages.

```jsx
<RevealOnScroll>
  <h2>Ask in plain words. Get answers with receipts.</h2>
</RevealOnScroll>

// stagger a grid of cards in one-by-one
<RevealOnScroll stagger step={90} style={{ display: "grid", gap: 16 }}>
  <SpotlightCard>…</SpotlightCard>
  <SpotlightCard>…</SpotlightCard>
  <SpotlightCard>…</SpotlightCard>
</RevealOnScroll>
```

- With `stagger`, put the layout (grid/flex + gap) on the RevealOnScroll itself; each direct child animates in on its own delay.
- `once={false}` re-hides + replays when the block leaves and re-enters view.
