import { Anatomy } from "@/components/site/Anatomy";
import { Faq } from "@/components/site/Faq";
import { Hero } from "@/components/site/Hero";
import { Moods } from "@/components/site/Moods";
import { NightShift } from "@/components/site/NightShift";
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
