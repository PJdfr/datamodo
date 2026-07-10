One-line: The datamodo form field — white input with a tan border and an optional leading glyph; pair with `Field` for the label row.

```jsx
<Field label="Email">
  <Input glyph={<MailIcon/>} placeholder="you@company.com" />
</Field>

<Field label="Password" trailing={<a href="#">Forgot?</a>}>
  <Input glyph={<LockIcon/>} type="password" value="••••••••" />
</Field>
```

Notes: password type auto-tracks letter-spacing. `Field` handles the label + optional trailing link and stacks the input below.
