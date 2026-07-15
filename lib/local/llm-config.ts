// LOCAL EDITION — per-user LLM model overrides, persisted in the data dir
// (~/.datamodo/llm.json) so they can be set from the dashboard, not just env.
// Server-only (does fs I/O); the pure validator lives in ./config so it can be
// unit-tested and shared with the route.

import { promises as fs } from "node:fs";
import path from "node:path";
import { localDataDir, sanitizeLlmModels, LOCAL_LLM_FILE, type LocalLlmModels } from "./config";

/** The saved model overrides, or {} when none are set / the file is absent. */
export async function readLocalLlmModels(): Promise<LocalLlmModels> {
  try {
    const raw = await fs.readFile(path.join(localDataDir(), LOCAL_LLM_FILE), "utf8");
    return sanitizeLlmModels(JSON.parse(raw));
  } catch {
    return {}; // absent or unreadable → fall through to env / defaults
  }
}

/** Persist model overrides (validated); returns the normalized set that was written. */
export async function writeLocalLlmModels(models: unknown): Promise<LocalLlmModels> {
  const clean = sanitizeLlmModels(models);
  const dir = localDataDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, LOCAL_LLM_FILE), JSON.stringify(clean, null, 2));
  return clean;
}
