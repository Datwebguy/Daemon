import Link from "next/link";
import { ChogFace } from "@/components/ChogFace";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="text-center">
        <ChogFace className="mx-auto h-48 w-48 animate-float" />
        <h1 className="mt-6 font-display text-4xl font-extrabold">This page wandered off.</h1>
        <p className="mt-3 text-dim">Nothing lives here. Let&apos;s get you back to the Daemons.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/" className="rounded-full bg-jelly px-6 py-3 font-semibold text-white">
            Home
          </Link>
          <Link href="/app" className="rounded-full border border-line px-6 py-3 font-semibold">
            Open the app
          </Link>
        </div>
      </div>
    </main>
  );
}
