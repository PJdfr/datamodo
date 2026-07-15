import "./landing.css";
import { redirect } from "next/navigation";
import { isLocalMode } from "@/lib/local/config";
import { AskAnything, FinalCTA, Footer, Hero, Nav, Trust, UseCases } from "@/components/landing/sections";
import { ThreeSteps } from "@/components/landing/steps";
import { SourceGraph } from "@/components/landing/sources";
import { ReviewFlow } from "@/components/landing/review";
import { Reveal } from "@/components/landing/reveal";

const TITLE = "datamodo — Forward the mess. Get back a spreadsheet.";
const DESCRIPTION =
  "The invoices, contacts, deal terms, files and to-dos that run your work are scattered across email, WhatsApp and Slack. Forward them to datamodo and get them back as clean tables and neatly filed folders — no assistant, no data entry, no formulas.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "datamodo",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function LandingPage() {
  // Local edition: there is no marketing site — the app IS the product. Open
  // localhost and land straight in the dashboard.
  if (isLocalMode()) redirect("/dashboard");
  return (
    <div className="lp-landing">
      <Nav />
      <Hero />
      <Reveal>
        <ThreeSteps />
      </Reveal>
      <Reveal>
        <SourceGraph />
      </Reveal>
      <Reveal>
        <ReviewFlow />
      </Reveal>
      <Reveal>
        <UseCases />
      </Reveal>
      <Reveal>
        <AskAnything />
      </Reveal>
      <Reveal>
        <Trust />
      </Reveal>
      <Reveal>
        <FinalCTA />
      </Reveal>
      <Footer />
    </div>
  );
}
