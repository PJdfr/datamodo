import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

type Organization = {
  id: string;
  name: string;
  slug: string;
  is_personal: boolean;
};

type ForwardingAddress = {
  id: string;
  address: string;
  label: string | null;
  org_id: string;
  owner_user_id: string | null;
};

export default async function DashboardPage() {
  const supabase = createClient(await cookies());

  const [orgsRes, addrRes] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, slug, is_personal")
      .order("is_personal", { ascending: false }),
    supabase
      .from("forwarding_addresses")
      .select("id, address, label, org_id, owner_user_id"),
  ]);

  // Before the database migration is applied, these tables don't exist yet.
  const schemaMissing =
    orgsRes.error?.code === "42P01" || addrRes.error?.code === "42P01";

  const orgs = (orgsRes.data ?? []) as Organization[];
  const addresses = (addrRes.data ?? []) as ForwardingAddress[];

  return (
    <main className="dashboard">
      <h1>Dashboard</h1>

      {schemaMissing && (
        <div className="notice">
          <strong>Database not set up yet.</strong> Apply the migration in{" "}
          <code>supabase/migrations/</code> (via the Supabase SQL editor or{" "}
          <code>supabase db push</code>) to create your organizations and
          forwarding addresses.
        </div>
      )}

      <section className="card">
        <h2>Organizations</h2>
        {orgs.length === 0 && !schemaMissing && (
          <p className="muted">No organizations yet.</p>
        )}
        <ul className="list">
          {orgs.map((org) => (
            <li key={org.id}>
              <span>{org.name}</span>
              <span className="tag">
                {org.is_personal ? "personal" : "team"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Forwarding addresses</h2>
        <p className="muted small">
          Forward any email to one of these addresses and we&apos;ll start
          organizing it.
        </p>
        {addresses.length === 0 && !schemaMissing && (
          <p className="muted">No addresses provisioned yet.</p>
        )}
        <ul className="list">
          {addresses.map((addr) => (
            <li key={addr.id}>
              <code>{addr.address}</code>
              <span className="tag">
                {addr.owner_user_id ? "personal" : "shared"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
