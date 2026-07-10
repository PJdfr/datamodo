# Import notes

Mirrored from the Claude Design project **"Datamodo Design System"**
(claude.ai/design project `07247b41-fb81-494a-8a2e-af9a2404998e`) on 2026-07-10.

Included: `SKILL.md`, `readme.md` (brand guide), `styles.css` + `tokens/`,
`assets/logos/`, all 16 components (`.jsx` + `.d.ts` + `.prompt.md`), and both
templates (`landing/`, `app/`).

Deliberately NOT mirrored (they are claude.ai Design-pane infrastructure /
gallery previews, not brand content): `_ds_bundle.js`, `_ds_manifest.json`,
`_adherence.oxlintrc.json`, `uploads/`, the per-component `*.card.html` demos,
and the `guidelines/*.card.html` specimen cards. Everything those specimens
document (colors, type, spacing, shadows, wordmark) is captured in `readme.md`
and `tokens/`. The Claude Design project remains the canonical rendered
gallery; sync with /design-sync if it evolves.

The production landing page (`app/page.tsx` + `components/landing/`) is a
native Next.js port of `templates/landing/`.
