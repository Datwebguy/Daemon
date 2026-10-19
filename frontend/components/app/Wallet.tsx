"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useBalance, useSwitchChain } from "wagmi";
import { useAuth } from "@/lib/auth";
import { addressUrl, CHAIN_ID } from "@/lib/config";
import { fmtUnits, shortAddr } from "@/lib/format";
import { Button, cx } from "../ui";
import { STICKER_BTN } from "./color";

/** Sign-in button, or a wallet chip with balance and a small menu. */
export function Wallet({ compact }: { compact?: boolean }) {
  const auth = useAuth();
  const { address, chainId, isConnected } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const { data: mon } = useBalance({ address, chainId: CHAIN_ID, query: { enabled: Boolean(address), refetchInterval: 20_000 } });
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!auth.ready) return <Button variant="ghost" loading size="sm" aria-label="Loading" className="h-10 w-20 !rounded-full border-[3px] border-[color:var(--st-line)]" />;
  if (!auth.authenticated || !address)
    return (
      <Button onClick={auth.login} size={compact ? "sm" : "md"} className={cx("h-10", STICKER_BTN)}>
        Sign in
      </Button>
    );

  if (isConnected && chainId !== CHAIN_ID)
    return (
      <Button variant="spark" size="sm" loading={isPending} onClick={() => switchChain({ chainId: CHAIN_ID })} className={cx("h-10", STICKER_BTN)}>
        Switch network
      </Button>
    );

  const name = auth.label ?? shortAddr(address);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="stk squish flex h-10 items-center gap-2 !rounded-full !shadow-[3px_3px_0_var(--st-shadow)] py-1 pl-1 pr-3 text-sm font-bold transition-transform hover:-translate-y-0.5 sm:gap-2.5 sm:pr-4"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-[color:var(--st-line)] text-xs font-bold text-white" style={{ background: avatarGradient(address) }} aria-hidden>
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="tabular-nums">
          {fmtUnits(mon?.value, 18, 2)}
          <span className="hidden sm:inline"> MON</span>
        </span>
      </button>
      {open && (
        <div role="menu" className="stk absolute right-0 z-50 mt-3 w-64 max-w-[calc(100vw-1.5rem)] p-2 animate-pop">
          <div className="px-3 py-2">
            <div className="text-xs text-dim">Signed in as</div>
            <div className="truncate font-semibold">{name}</div>
          </div>
          <button
            role="menuitem"
            onClick={() => {
              void navigator.clipboard?.writeText(address);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-jelly/15"
          >
            {copied ? "Copied!" : "Copy my wallet address"}
          </button>
          <a role="menuitem" href={addressUrl(address)} target="_blank" rel="noreferrer" className="block rounded-xl px-3 py-2.5 text-sm hover:bg-jelly/15">
            See my activity
          </a>
          <button role="menuitem" onClick={auth.logout} className={cx("w-full rounded-xl px-3 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-500/10 dark:text-rose-400")}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** Deterministic two-tone gradient from an address. */
function avatarGradient(a: string) {
  const h = parseInt(a.slice(2, 8), 16) % 360;
  return `linear-gradient(135deg, hsl(${h} 80% 62%), hsl(${(h + 70) % 360} 75% 52%))`;
}
