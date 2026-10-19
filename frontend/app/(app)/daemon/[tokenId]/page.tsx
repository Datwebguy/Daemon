import Link from "next/link";
import { DaemonView } from "@/components/daemon/DaemonView";
import { StateScreen } from "@/components/daemon/StateScreen";

export async function generateMetadata({ params }: { params: Promise<{ tokenId: string }> }) {
  const { tokenId } = await params;
  return { title: /^\d{1,78}$/.test(tokenId) ? `Chog #${tokenId}` : "Daemon" };
}

export default async function DaemonPage({ params }: { params: Promise<{ tokenId: string }> }) {
  const { tokenId } = await params;
  if (!/^\d{1,78}$/.test(tokenId)) {
    return (
      <StateScreen
        title="That Chog number doesn't look right"
        mood={2}
        seed={1}
        action={
          <Link
            href="/explore"
            className="inline-flex items-center rounded-2xl border-4 border-[var(--st-line)] bg-[var(--jelly)] px-5 py-3 font-display text-lg text-white shadow-[5px_5px_0_var(--st-shadow)] dark:text-[#0d0b14]"
          >
            Find a Daemon
          </Link>
        }
      >
        Chog numbers are whole numbers, like 7 or 128.
      </StateScreen>
    );
  }
  return <DaemonView tokenId={BigInt(tokenId)} />;
}
