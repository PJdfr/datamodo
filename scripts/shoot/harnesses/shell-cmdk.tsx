// Harness: the shell with the ⌘K command palette summoned (keydown dispatched
// after mount) — verifies the frosted sheet, sections, and selection state.
// Run: npm run shoot -- shell-cmdk
import "./shell";

setTimeout(() => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
}, 900);
