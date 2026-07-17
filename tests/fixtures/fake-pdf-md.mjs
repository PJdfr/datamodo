// Fake PDF→markdown converter for tests: honors the seam's contract (last
// arg = PDF path, markdown on stdout) without any real PDF work.
import { existsSync } from "node:fs";

const file = process.argv[process.argv.length - 1];
if (!file || !existsSync(file)) {
  console.error("no input file");
  process.exit(2);
}
process.stdout.write(
  [
    "# Invoice INV-9",
    "",
    "Issued by **Acme Group** for January consulting.",
    "",
    "## Payment",
    "",
    "Amount **$100**, due 2026-01-02. Terms: net 30.",
    "",
  ].join("\n"),
);
