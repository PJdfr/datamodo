// LOCAL EDITION — per-user LLM config, persisted in the data dir
// (~/.datamodo/llm.json) so it can be set from the dashboard, not just env.
// Model names are stored PER PROVIDER (the wizard's Ollama names must never
// leak into a BYOK provider's requests) plus the Ollama server URL for local
// compute. Server-only (does fs I/O); the pure validators live in ./config.

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  localDataDir,
  sanitizeLlmFile,
  sanitizeLlmModels,
  sanitizeOllamaUrl,
  LOCAL_LLM_FILE,
  type LocalAiProvider,
  type LocalLlmFile,
  type LocalLlmModels,
} from "./config";

/** The saved config, or an empty one when the file is absent/unreadable.
 *  Legacy flat files (pre provider-namespacing) are migrated on read. */
export async function readLocalLlmFile(): Promise<LocalLlmFile> {
  try {
    const raw = await fs.readFile(path.join(localDataDir(), LOCAL_LLM_FILE), "utf8");
    return sanitizeLlmFile(JSON.parse(raw));
  } catch {
    return { providers: {} }; // absent or unreadable → fall through to env / defaults
  }
}

/** One provider's saved model overrides ({} when none). */
export async function readLocalLlmModels(provider: LocalAiProvider): Promise<LocalLlmModels> {
  return (await readLocalLlmFile()).providers[provider] ?? {};
}

/** Persist one provider's model overrides (+ optionally the Ollama URL, which
 *  rides along in the same POST from Settings). Returns the normalized file. */
export async function writeLocalLlmModels(
  provider: LocalAiProvider,
  models: unknown,
  url?: unknown,
): Promise<LocalLlmFile> {
  const current = await readLocalLlmFile();
  const clean = sanitizeLlmModels(models);
  if (Object.keys(clean).length) current.providers[provider] = clean;
  else delete current.providers[provider];
  if (url !== undefined) {
    const cleanUrl = sanitizeOllamaUrl(url);
    if (cleanUrl) current.url = cleanUrl;
    else delete current.url;
  }
  const dir = localDataDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, LOCAL_LLM_FILE), JSON.stringify(current, null, 2));
  return current;
}
