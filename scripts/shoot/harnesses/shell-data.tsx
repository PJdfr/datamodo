// Harness: the shell on the Data tab with the topbar "Build ▾" menu open —
// verifies the contextual action moved out of the toggle row into the topbar.
// Run: npm run shoot -- shell-data
import "./shell";

setTimeout(() => {
  const nav = [...document.querySelectorAll<HTMLButtonElement>(".cc-nav-item")].find((b) => b.textContent?.includes("Data"));
  nav?.click();
  setTimeout(() => {
    const build = [...document.querySelectorAll<HTMLButtonElement>(".cc-chip")].find((b) => b.textContent?.includes("Build"));
    build?.click();
  }, 400);
}, 800);
