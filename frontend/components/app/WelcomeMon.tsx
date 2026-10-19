"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAccount } from "wagmi";
import { useAuth } from "@/lib/auth";
import { contracts } from "@/lib/config";
import { useBalances } from "@/lib/hooks";

const key = (a: string) => `daemon-welcome-${a.toLowerCase()}`;

/**
 * Gives a brand-new, empty wallet a little MON for network fees, once, so a first visit never starts with
 * "go find a faucet". The contract decides who qualifies; this only asks. Renders nothing.
 */
export function WelcomeMon() {
  const { address } = useAccount();
  const auth = useAuth();
  const bal = useBalances(address, undefined, undefined, { live: false });
  const asked = useRef<string>("");

  useEffect(() => {
    if (!contracts.welcomeDrip || !address || bal.mon === undefined || bal.mon > BigInt(0)) return;
    if (asked.current === address) return;
    try {
      if (localStorage.getItem(key(address))) return;
    } catch {
      /* private mode: the contract still allows one claim per wallet */
    }
    asked.current = address;

    void (async () => {
      const id = toast.loading("Sending you a little MON for network fees…");
      try {
        const token = auth.getAccessToken ? await auth.getAccessToken() : null;
        const res = await fetch("/api/welcome", {
          method: "POST",
          headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ address }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        try {
          // Remember both outcomes that mean "don't ask again"; a temporary failure may retry on the next visit.
          if (data.ok || res.status === 409) localStorage.setItem(key(address), "1");
        } catch {
          /* ignore */
        }
        if (data.ok) toast.success("Welcome! Your MON is on its way", { id, description: "It covers your first Chog and a few actions." });
        else toast.message(data.error ?? "Couldn't send welcome MON", { id, description: "You can also use the free faucet from the menu." });
      } catch {
        toast.message("Couldn't send welcome MON", { id, description: "You can also use the free faucet from the menu." });
      }
    })();
  }, [address, bal.mon, auth]);

  return null;
}
