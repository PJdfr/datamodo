Interactive feature card that lifts, tilts toward the pointer, and shows a coral spotlight on hover — use in place of a plain `Card` when a grid of tiles feels static.

```jsx
<SpotlightCard style={{ maxWidth: 320 }}>
  <div style={{ fontFamily: "var(--dm-font-display)", fontSize: 20 }}>One email in.</div>
  <p style={{ color: "var(--dm-text-body)" }}>A connected brain out.</p>
</SpotlightCard>

<SpotlightCard tone="ink" tilt={0}>…</SpotlightCard>  {/* spotlight + lift, no tilt */}
```

- `tone="ink"` gives the dark-section variant with a brighter coral glow.
- Set `tilt={0}` to keep the lift and spotlight but drop the 3D rotation (calmer, good for dense lists).
- It's a drop-in surface — put any content inside; it owns its own padding, border, radius and shadow.
