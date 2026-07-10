Infinite horizontal strip that streams its children past with edge fades; pauses on hover. Use for the "works with" channel row or a streaming ticker of extracted entities.

```jsx
<Marquee duration={28}>
  <ChannelPill channel="gmail" />
  <ChannelPill channel="whatsapp" />
  <ChannelPill channel="slack" />
  <ChannelPill channel="outlook" />
</Marquee>
```

- Children are duplicated internally for a seamless loop — just pass the single set once.
- `direction="right"` reverses; `duration` is seconds per loop (lower is faster).
- Works with any inline-flex children (pills, chips, logos, badges), not just ChannelPill.
