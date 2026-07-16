// The deployment's public base URL — used wherever we hand a client an
// absolute URL (MCP connection details, OAuth metadata/endpoints). Explicit
// config wins over the request origin so proxies/tunnels can't skew it.
export function appBaseUrl(req: Request): string {
  const base =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    new URL(req.url).origin;
  return base.replace(/\/$/, "");
}
