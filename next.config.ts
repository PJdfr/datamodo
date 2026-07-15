import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Scanned-PDF OCR rasterizes pages with a NATIVE canvas binary
  // (@napi-rs/canvas). Keep it + unpdf/pdf.js as external server packages so
  // the bundler never tries to pack the .node binary into a serverless chunk.
  serverExternalPackages: ["@napi-rs/canvas", "unpdf", "pdfjs-dist", "mailparser"],
};

export default nextConfig;
