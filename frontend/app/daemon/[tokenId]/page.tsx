import Link from "next/link";
import { DaemonView } from "@/components/daemon/DaemonView";
import { Empty } from "@/components/ui";

export default async function DaemonPage({ params }: { params: Promise<{ tokenId: string }> }) {
  const { tokenId } = await params;
  if (!/^\d{1,78}$/.test(tokenId)) {
    return (
      <Empty emoji="🤔" title="That's not a token ID">
        Token IDs are whole numbers. <Link href="/explore" className="underline">Explore Daemons</Link>.
      </Empty>
    );
  }
  return <DaemonView tokenId={BigInt(tokenId)} />;
}
