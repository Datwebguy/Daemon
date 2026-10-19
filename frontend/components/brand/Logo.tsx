import Link from "next/link";
import { cx } from "@/lib/cx";

/** Plain text wordmark. A proper logo will replace this later. */
export function Logo({ href = "/", className, light }: { href?: string; className?: string; light?: boolean }) {
  return (
    <Link href={href} className={cx("group inline-flex items-center", className)} aria-label="Daemon home">
      <span className={cx("font-display text-[1.7rem] leading-none tracking-tight transition-transform duration-300 group-hover:-rotate-2", light ? "text-white" : "text-fg")}>daemon</span>
    </Link>
  );
}
