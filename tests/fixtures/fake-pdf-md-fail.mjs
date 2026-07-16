// Converter that always fails — exercises the seam's fail-soft path.
process.stderr.write("boom");
process.exit(1);
