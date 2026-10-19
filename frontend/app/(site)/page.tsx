import { Anatomy } from "@/components/site/Anatomy";
import { ChogStrip } from "@/components/site/ChogStrip";
import { Faq } from "@/components/site/Faq";
import { Hero } from "@/components/site/Hero";
import { Moods } from "@/components/site/Moods";
import { NightShift } from "@/components/site/NightShift";
import { DayInLife } from "@/components/site/DayInLife";
import { RevealObserver } from "@/components/site/Reveal";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { Story } from "@/components/site/Story";
import { Ticker } from "@/components/site/Ticker";

export default function Landing() {
  return (
    <>
      <SiteNav />
      <main>
        <Hero />
        <Ticker />
        <ChogStrip />
        <DayInLife />
        <Anatomy />
        <Story />
        <Moods />
        <NightShift />
        <Faq />
      </main>
      <SiteFooter />
      <RevealObserver />
    </>
  );
}
