One-line: The warm datamodo container — cream surface with a tan hairline and soft shadow; also an ink tone for dark sections and an accent-tint tone for highlights.

```jsx
<Card>Feature content…</Card>
<Card tone="ink">On a dark section</Card>
<Card tone="accent" radius={22}>Highlighted</Card>
```

Notes: `elevated` gives the stronger floating-window shadow. `radius` follows the scale — 14 (stat cards), 18 (features), 22 (auth/shell). Compose freely; Card only owns the surface.
