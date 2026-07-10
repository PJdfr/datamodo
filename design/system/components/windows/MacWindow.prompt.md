One-line: The signature macOS window chrome — real traffic-light dots + centered title — that wraps the email and spreadsheet mocks.

```jsx
<MacWindow title="Inbox — Sarah Chen" floaty>
  {/* email body markup */}
</MacWindow>

<MacWindow title="datamodo — Invoices">
  {/* table markup */}
</MacWindow>
```

Notes: for `floaty`, define `@keyframes dm-floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}` and respect `prefers-reduced-motion`. The window owns the chrome only — put toolbars, tables, or email content inside as children.
