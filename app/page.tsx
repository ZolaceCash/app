import { Closing } from "@/components/landing/closing";
import { Flow } from "@/components/landing/flow";
import { Hero } from "@/components/landing/hero";
import { How } from "@/components/landing/how";
import { Privacy } from "@/components/landing/privacy";
import { Rules } from "@/components/landing/rules";
import { Shelves } from "@/components/landing/shelves";
import { Ticker } from "@/components/landing/ticker";
import { Token } from "@/components/landing/token";
import { Footer } from "@/components/site/footer";
import { Nav } from "@/components/site/nav";

// One dark page built as a grid of blocks: graphite tiles on a near-black ground, with indigo or
// white where something should stand out.
export default function Home() {
  return (
    <div className="flex-1">
      <Nav />
      <main>
        <Hero />
        <Ticker />
        <Shelves />
        <How />
        <Flow />
        <Privacy />
        <Rules />
        <Token />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}
