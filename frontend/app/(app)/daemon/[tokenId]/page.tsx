import Link from "next/link";
import { DaemonView } from "@/components/daemon/DaemonView";
import { Empty } from "@/components/ui";

export async function generateMetadata({ params }: { params: Promise<{ tokenId: string }> }) {
  const { tokenId } = await params;
  return { title: /^\d{1,78}$/.test(tokenId) ? `Chog #${tokenId}` : "Daemon" };
}

export default async function DaemonPage({ params }: { params: Promise<{ tokenId: string }> }) {
  const { tokenId } = await params;
  if (!/^\d{1,78}$/.test(tokenId)) {
    return (
      <Empty title="That Chog number doesn't look right">
        Chog numbers are whole numbers, like 7 or 128.{" "}
        <Link href="/explore" className="font-semibold text-jelly underline-offset-4 hover:underline">
          Find a Daemon
        </Link>
      </Empty>
    );
  }
  return <DaemonView tokenId={BigInt(tokenId)} />;
}
