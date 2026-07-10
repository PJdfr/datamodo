import "./landing.css";
import { AskAnything, FinalCTA, Footer, Hero, Nav, Trust, UseCases } from "@/components/landing/sections";
import { ThreeSteps } from "@/components/landing/steps";
import { SourceGraph } from "@/components/landing/sources";
import { ReviewFlow } from "@/components/landing/review";
import { Reveal } from "@/components/landing/reveal";

export const metadata = {
  title: "datamodo — Forward the mess. Get back a spreadsheet.",
  description:
    "The invoices, contacts, deal terms, files and to-dos that run your work are scattered across email, WhatsApp and Slack. Forward them to datamodo and get them back as clean tables and neatly filed folders — no assistant, no data entry, no formulas.",
};

export default function LandingPage() {
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
