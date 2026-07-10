/* global React, ReactDOM */
const P1 = window.LandingParts1;
const P2 = window.LandingParts2;
const { RevealOnScroll: Reveal } = window.DatamodoDesignSystem_07247b;
const P3 = window.LandingSteps;
const P4 = window.LandingSources;
const P5 = window.LandingReview;

function Landing() {
  return (
    <div>
      <P1.Nav />
      <P1.Hero />
      <Reveal><P3.ThreeSteps /></Reveal>
      <Reveal><P4.SourceGraph /></Reveal>
      <Reveal><P5.ReviewFlow /></Reveal>
      <Reveal><P2.UseCases /></Reveal>
      <Reveal><P2.AskAnything /></Reveal>
      <Reveal><P2.Trust /></Reveal>
      <Reveal><P2.FinalCTA /></Reveal>
      <P2.Footer />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Landing />);
