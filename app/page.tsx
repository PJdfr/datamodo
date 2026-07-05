import Link from "next/link";

export default function Home() {
  return (
    <main className="landing">
      <nav className="landing-nav">
        <span className="brand">Datamodo</span>
        <div className="landing-nav-actions">
          <Link href="/login">Log in</Link>
          <Link href="/register" className="btn btn-primary">
            Get started
          </Link>
        </div>
      </nav>

      <section className="hero">
        <h1>Forward your email. Get structured data back.</h1>
        <p className="lede">
          Forward any email to your personal Datamodo address. We store it,
          make sense of the mess, and turn it into a queryable memory — then
          proactively suggest structured datasets (clients, invoices, research)
          built straight from your inbox.
        </p>
        <div className="hero-actions">
          <Link href="/register" className="btn btn-primary btn-lg">
            Create your account
          </Link>
          <Link href="/login" className="btn btn-outline btn-lg">
            Log in
          </Link>
        </div>
        <p className="muted small">
          Placeholder landing page — full design coming in a dedicated session.
        </p>
      </section>
    </main>
  );
}
