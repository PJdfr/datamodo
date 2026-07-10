---
name: datamodo-design
description: Use this skill to design or build ANY user-facing datamodo surface — landing/marketing pages, app/dashboard UI, emails, mocks, prototypes, illustrations. Contains the datamodo brand guide (colors, type, voice), CSS tokens, React component library, and full-page templates. Trigger whenever work involves datamodo visuals, branding, UI copy, or new front-end surfaces.
---

The datamodo design system lives in **`design/system/`** at the repo root.
Read these, in order, before designing anything:

1. `design/system/SKILL.md` — quick orientation (brand in one line, do/don't).
2. `design/system/readme.md` — the full brand guide: voice & copywriting rules,
   colors, type, spacing/radius/shadow, motion, iconography, the wordmark.
3. `design/system/tokens/` — the `--dm-*` CSS custom properties (link
   `design/system/styles.css` in standalone HTML artifacts).
4. `design/system/components/` — React primitives (`.jsx` reference
   implementations + `.d.ts` props + `.prompt.md` usage). For production code,
   port into the repo's conventions (TypeScript, next/font variables) — see
   `components/landing/` for how the landing page did it.
5. `design/system/templates/` — full-page starting points (`landing/`, `app/`).

Hard rules (violations are bugs):
- The brand name is always lowercase: **datamodo**. Sentence case headlines.
- One accent only: coral `#E4593B`. Cream canvas `#F6F2E9`, warm ink `#211E18`.
  Never pure-white pages, never a second accent, no gradients-as-decoration.
- All data (amounts, emails, IDs, kickers) in Geist Mono. Display type is
  Bricolage Grotesque. Caveat is ONLY for the "data" half of the wordmark.
- The wordmark is live text via the `Logo` component, never an image; no
  standalone logo mark exists — don't invent one.
- Essentially no emoji in UI chrome; unicode glyphs (✦ ▦ ✓ ↓) over icon sets.
- Respect `prefers-reduced-motion`; animated elements' base state is the
  visible end-state.

In production code the fonts come from `next/font` variables set in
`app/layout.tsx` (`--font-bricolage`, `--font-geist-sans`, `--font-geist-mono`,
`--font-caveat`) — don't add Google Fonts `@import`s. Landing-page tokens are
scoped under `.lp-landing` in `app/landing.css`; the signed-in app keeps its own
styles in `app/globals.css` (`.dm-app`, `.dm-auth`).
