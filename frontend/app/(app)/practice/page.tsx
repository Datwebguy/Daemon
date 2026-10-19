import type { Metadata } from "next";
import { PracticeDaemon } from "@/components/PracticeDaemon";

export const metadata: Metadata = { title: "Practice mode" };

export default function PracticePage() {
  return <PracticeDaemon />;
}
