`ChangeReview` — the accept/reject queue for changes datamodo suggests to your database, tables, and knowledge graph (extracted from messages). Use it anywhere the user must review AI-proposed data mutations before they commit.

```jsx
<ChangeReview
  title="Suggested changes"
  onResolve={(id, action) => console.log(id, action)}
/>
```

Each change carries `op` (`new` | `update` | `merge` | `link` | `remove`), the target `entity` + `table`, a `source` (who/channel/when), a `confidence` (0–1), and either a `fields` diff (`{label, from, to}` — `from:null` = added field) or a `summary` string (supports `**bold**` / `*italic*`).

Behavior: hover lifts the card; **Accept** flashes coral then collapses it into a green "committed" strip with **Undo**; **Reject** collapses to a muted "dismissed" strip; **Accept all** resolves the queue staggered. Header shows a live progress bar. Colors map by op (new→green, update/link→coral, merge→amber, remove→red). Defaults to a built-in sample datamodo queue, so it renders fully with no props.
