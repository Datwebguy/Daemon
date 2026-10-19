import Link from "next/link";
import { Empty } from "@/components/ui";

export default function NotFound() {
  return (
    <Empty emoji="👻" title="Nothing here">
      <Link href="/" className="underline">Back to your Chogs</Link>
    </Empty>
  );
}
