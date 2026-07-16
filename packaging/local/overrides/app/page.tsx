import { redirect } from "next/navigation";

// LOCAL EDITION build of app/page.tsx — there is no marketing site; the app
// IS the product. Open localhost → land in the dashboard.
export default function LocalHome() {
  redirect("/dashboard");
}
