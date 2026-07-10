`OrbGraph` — an abstract, interactive 3D graph orb for hero/feature moments where you want to show "your knowledge, connected" without a literal diagram. A sphere of points, each wired to a central hub by a radial spoke; a few points and their spokes glow coral (the facts datamodo just detected). Best on a dark/ink panel.

```jsx
<OrbGraph concepts={["Acme Inc", "#A-204", "$12,000", "Sarah Chen"]} height={360} />
```

- Canvas-rendered so it handles many points smoothly. **Static at rest** — it rotates and tilts toward the pointer on hover, and points repel the cursor.
- `concepts` are the highlighted coral nodes (the "new" facts); every point connects to the centre hub, so it reads as one brain gathering facts.
- Points and spokes are light, so place it on a dark surface (e.g. `var(--dm-ink)`). Give it a wrapper with a max-width; it fills width and uses `height` (default 360). Fully static under prefers-reduced-motion.
- Use it as the "step 2 / linked" visual — the literal, inspectable version is `KnowledgeGraph`; `OrbGraph` is the atmospheric one.
