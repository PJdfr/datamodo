One-line: Small pill labels — `Badge` for row status (Paid/Sent/Approved) and `Eyebrow` for the mono section kicker.

```jsx
<Badge variant="success">Paid</Badge>
<Badge variant="warning">Sent</Badge>
<Badge variant="accent">Approved</Badge>
<Badge variant="neutral" mono>+ 1 row added</Badge>

<Eyebrow>watch it work</Eyebrow>
<Eyebrow onDark>how it works</Eyebrow>
```

Notes: status cells in tables use `success`/`warning`/`accent`. `mono` switches to Geist Mono for data-style chips. `Eyebrow` is always uppercase mono in accent; `onDark` strips the tint pill for dark sections.
