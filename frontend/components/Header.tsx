"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { parseEventLogs, parseUnits } from "viem";
import { useAccount, useBalance, useSwitchChain } from "wagmi";
import { simulateContract, writeContract } from "wagmi/actions";
import { erc20Abi, mockChogAbi } from "@/lib/abis";
import { useAuth } from "@/lib/auth";
import { CHAIN_ID, contracts, FAUCET_URL } from "@/lib/config";
import { fmtUnits, shortAddr } from "@/lib/format";
import { rememberChog, useProtocol } from "@/lib/hooks";
import { useTx } from "@/lib/tx";
import { useTheme } from "./ThemeProvider";
import { Button, cx } from "./ui";

const NAV = [
  { href: "/", label: "My Chogs" },
  { href: "/explore", label: "Explore" },
  { href: "/feed", label: "Feed" },
];

function NetworkBadge() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  if (!isConnected) return null;
  if (chainId === CHAIN_ID)
    return (
      <span className="hidden items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 sm:inline-flex dark:text-emerald-300">
        <span className="h-2 w-2 rounded-full bg-emerald-500" /> Monad Testnet
      </span>
    );
  return (
    <Button variant="danger" className="!px-3 !py-1 text-xs" loading={isPending} onClick={() => switchChain({ chainId: CHAIN_ID })}>
      Wrong network: switch to Monad
    </Button>
  );
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const { address, isConnected } = useAccount();
  const { data: mon } = useBalance({ address, chainId: CHAIN_ID, query: { enabled: Boolean(address) } });
  const { asset } = useProtocol();
  const { theme, toggle } = useTheme();
  const { run, pending } = useTx();
  const [menu, setMenu] = useState(false);

  const mintChog = () =>
    contracts.mockChog &&
    address &&
    run(
      "Mint Test Chog",
      async (config) => {
        const { request } = await simulateContract(config, {
          address: contracts.mockChog!,
          abi: mockChogAbi,
          functionName: "freeMint",
          account: address,
          chainId: CHAIN_ID,
        });
        return writeContract(config, request);
      },
      {
        onSuccess: (receipt) => {
          const logs = parseEventLogs({ abi: mockChogAbi, eventName: "Transfer", logs: receipt.logs });
          const minted = logs.find(
            (l) => l.address.toLowerCase() === contracts.mockChog!.toLowerCase() && l.args.to.toLowerCase() === address.toLowerCase(),
          );
          if (minted) {
            rememberChog(address, minted.args.tokenId);
            router.push(`/daemon/${minted.args.tokenId.toString()}`);
          }
        },
      },
    );

  const getDusd = () =>
    asset &&
    address &&
    run(`Get test ${asset.symbol}`, async (config) => {
      const { request } = await simulateContract(config, {
        address: asset.address,
        abi: erc20Abi,
        functionName: "mint",
        args: [address, parseUnits("1000", asset.decimals)],
        account: address,
        chainId: CHAIN_ID,
      });
      return writeContract(config, request);
    });

  const actions = (
    <>
      <Button variant="secondary" disabled={!isConnected || !contracts.mockChog} loading={pending === "Mint Test Chog"} onClick={mintChog} title={!contracts.mockChog ? "MockChog not deployed yet" : undefined}>
        🐸 Mint Test Chog
      </Button>
      <Button variant="secondary" disabled={!isConnected || !asset} loading={pending?.startsWith("Get test") ?? false} onClick={getDusd} title={!asset ? "Test dUSD not deployed yet" : undefined}>
        💵 Get test {asset?.symbol ?? "dUSD"}
      </Button>
      <a href={FAUCET_URL} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-2xl border border-line px-4 py-2 text-sm font-semibold hover:bg-muted">
        ⛽ MON faucet ↗
      </a>
    </>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-black tracking-tight">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-monad text-lg text-white shadow-md shadow-monad/40">😈</span>
          <span className="text-lg">Daemon</span>
        </Link>
        <nav className="ml-2 hidden gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cx(
                "rounded-xl px-3 py-1.5 text-sm font-semibold",
                pathname === n.href ? "bg-monad/15 text-monad-700 dark:text-monad-200" : "text-dim hover:text-fg",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <NetworkBadge />
          <div className="hidden items-center gap-2 lg:flex">{actions}</div>
          <button onClick={toggle} className="grid h-9 w-9 place-items-center rounded-xl border border-line hover:bg-muted" aria-label="Toggle theme">
            {theme === "dark" ? "🌙" : "☀️"}
          </button>
          {!auth.ready ? (
            <Button variant="ghost" loading>
              …
            </Button>
          ) : auth.authenticated && address ? (
            <Button variant="ghost" onClick={auth.logout} title="Sign out">
              <span className="tabular-nums">{fmtUnits(mon?.value, 18, 2)} MON</span>
              <span className="hidden font-mono text-xs text-dim sm:inline">{auth.label ?? shortAddr(address)}</span>
            </Button>
          ) : (
            <Button onClick={auth.login}>{auth.provider === "privy" ? "Sign in" : "Connect wallet"}</Button>
          )}
          <button onClick={() => setMenu((m) => !m)} className="grid h-9 w-9 place-items-center rounded-xl border border-line lg:hidden" aria-label="Menu" aria-expanded={menu}>
            ☰
          </button>
        </div>
      </div>
      {menu && (
        <div className="border-t border-line px-4 py-3 lg:hidden">
          <nav className="mb-3 flex gap-1 md:hidden">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setMenu(false)} className={cx("rounded-xl px-3 py-1.5 text-sm font-semibold", pathname === n.href ? "bg-monad/15" : "text-dim")}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-wrap gap-2">{actions}</div>
        </div>
      )}
    </header>
  );
}
