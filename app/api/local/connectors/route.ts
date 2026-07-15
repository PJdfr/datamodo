import { NextResponse } from "next/server";
import { isLocalMode, localDataDir } from "@/lib/local/config";
import { publicConnectors, addConnector, removeConnector } from "@/lib/local/connectors/imap-poll.mjs";

// Reads/writes ~/.datamodo/connectors.json on the local filesystem.
export const runtime = "nodejs";

// LOCAL-ONLY: manage the IMAP mailboxes the `serve` poller pulls from, straight
// from the dashboard (Settings → Connectors). The poller re-reads the file each
// tick, so adds/removes take effect within one interval — no restart. The cloud
// edition has no such file; this route 404s there. Same-origin dashboard call,
// and the local edition has a single user with no login, so no extra secret.
const notLocal = () => NextResponse.json({ error: "not found" }, { status: 404 });

export async function GET() {
  if (!isLocalMode()) return notLocal();
  return NextResponse.json({ connectors: await publicConnectors(localDataDir()) });
}

export async function POST(req: Request) {
  if (!isLocalMode()) return notLocal();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const host = String(body.host ?? "").trim();
  const user = String(body.user ?? "").trim();
  const password = String(body.password ?? "");
  if (!host || !user || !password) {
    return NextResponse.json({ error: "host, user and password are required" }, { status: 400 });
  }

  try {
    const added = await addConnector(localDataDir(), {
      kind: "imap",
      id: typeof body.id === "string" && body.id.trim() ? body.id.trim() : undefined,
      host,
      port: body.port ? Number(body.port) : undefined,
      secure: body.secure === undefined ? undefined : Boolean(body.secure),
      user,
      password,
      mailbox: typeof body.mailbox === "string" && body.mailbox.trim() ? body.mailbox.trim() : undefined,
    });
    return NextResponse.json(
      { ok: true, added: { id: added.id }, connectors: await publicConnectors(localDataDir()) },
      { status: 201 },
    );
  } catch (e) {
    // parseConnectors throws a pointed message (missing field / duplicate id).
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  if (!isLocalMode()) return notLocal();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const removed = await removeConnector(localDataDir(), id);
  return NextResponse.json(
    { ok: removed, connectors: await publicConnectors(localDataDir()) },
    { status: removed ? 200 : 404 },
  );
}
