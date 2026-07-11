// Unit tests for the audio tier's pure parts: the audio gate + transcript body
// composer (document-extraction.ts) and the player node shape (node-shapes.ts).
// The transcription call itself is fail-soft I/O (lib/llm/transcription.ts),
// same contract as embeddings. Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attachmentAudioType,
  buildTranscriptBody,
  MAX_AUDIO_BYTES,
  MAX_TRANSCRIPT_BODY_CHARS,
  TRANSCRIPT_HEADING,
} from "../lib/datamodo/document-extraction.ts";
import { entityAudioType } from "../lib/datamodo/node-shapes.ts";
import type { KnowledgeEntityView, KnowledgeFactView } from "../lib/datamodo/types.ts";

// --- attachmentAudioType ------------------------------------------------------

test("attachmentAudioType: extension wins and normalizes vague content types", () => {
  assert.equal(attachmentAudioType("memo.m4a", "application/octet-stream"), "audio/mp4");
  assert.equal(attachmentAudioType("voice.M4A", "audio/x-m4a"), "audio/mp4");
  assert.equal(attachmentAudioType("note.OGG", null), "audio/ogg");
  assert.equal(attachmentAudioType("song.mp3", ""), "audio/mpeg");
  assert.equal(attachmentAudioType("take.flac", null), "audio/flac");
});

test("attachmentAudioType: content-type fallback, charset suffix tolerated", () => {
  assert.equal(attachmentAudioType("blob", "audio/mpeg; charset=binary"), "audio/mpeg");
  assert.equal(attachmentAudioType(null, "audio/wav"), "audio/wav");
  // Uncommon audio containers pass through — the transcriber gets to try.
  assert.equal(attachmentAudioType("clip.bin", "audio/aac"), "audio/aac");
});

test("attachmentAudioType: non-audio stays null (other tiers keep their paths)", () => {
  assert.equal(attachmentAudioType("doc.pdf", "application/pdf"), null);
  assert.equal(attachmentAudioType("photo.png", "image/png"), null);
  assert.equal(attachmentAudioType("movie.mp4", "video/mp4"), null);
  assert.equal(attachmentAudioType(null, null), null);
});

test("MAX_AUDIO_BYTES stays under the 25 MB Whisper-shaped upload cap", () => {
  assert.ok(MAX_AUDIO_BYTES < 25_000_000);
});

// --- buildTranscriptBody --------------------------------------------------------

test("buildTranscriptBody: summary first, transcript under its heading", () => {
  const body = buildTranscriptBody("A call about the **Q3 renewal**.", "We agreed to renew in August.");
  assert.equal(body, `A call about the **Q3 renewal**.\n\n${TRANSCRIPT_HEADING}\n\nWe agreed to renew in August.`);
});

test("buildTranscriptBody: degrades to whichever side exists", () => {
  assert.equal(buildTranscriptBody(null, "Just the words."), `${TRANSCRIPT_HEADING}\n\nJust the words.`);
  assert.equal(buildTranscriptBody("Only a summary.", "  "), "Only a summary.");
  assert.equal(buildTranscriptBody(null, ""), null);
});

test("buildTranscriptBody: caps the page and says so honestly", () => {
  const long = "word ".repeat(3000); // ~15k chars
  const body = buildTranscriptBody(null, long)!;
  assert.ok(body.length < long.length, "body is capped");
  assert.match(body, /transcript truncated here/);
  assert.ok(body.includes(long.slice(0, MAX_TRANSCRIPT_BODY_CHARS).trimEnd()));
});

// --- entityAudioType ------------------------------------------------------------

const fact = (predicate: string, value: string): KnowledgeFactView => ({
  predicate, value, ref: false, refId: null, sources: 1, provenance: [], confidence: 0.9, validFrom: null,
});
const ent = (kind: string, facts: KnowledgeFactView[] = [], key?: string): KnowledgeEntityView => ({
  id: "e1", kind, label: "x", naturalKeys: key ? { id: key } : {}, facts, edges: 0, bodyMd: null, graphPin: null,
});

test("entityAudioType: audio documents detected via file_type fact or filename", () => {
  assert.equal(entityAudioType(ent("document", [fact("file_type", "audio/mpeg")])), "audio/mpeg");
  assert.equal(entityAudioType(ent("document", [], "doc:abc:memo.m4a")), "audio/mp4");
});

test("entityAudioType: non-audio and non-documents stay null", () => {
  assert.equal(entityAudioType(ent("document", [fact("file_type", "application/pdf")], "doc:abc:report.pdf")), null);
  assert.equal(entityAudioType(ent("person", [fact("file_type", "audio/mpeg")])), null);
  assert.equal(entityAudioType(ent("document")), null);
});
