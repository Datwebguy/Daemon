"use client";

import { usePrivy } from "@privy-io/react-auth";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { toast } from "sonner";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { errorMessage } from "./format";

export type AuthState = {
  provider: "privy" | "injected";
  ready: boolean;
  authenticated: boolean;
  login: () => void;
  logout: () => void;
  /** e.g. the Privy email, if any */
  label?: string;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <Providers>");
  return ctx;
}

export function PrivyAuthBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const value = useMemo<AuthState>(
    () => ({
      provider: "privy",
      ready,
      authenticated,
      login: () => login(),
      logout: () => void logout(),
      label: user?.email?.address ?? user?.google?.email ?? user?.twitter?.username ?? undefined,
    }),
    [ready, authenticated, login, logout, user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function InjectedAuthBridge({ children }: { children: ReactNode }) {
  const { isConnected, status } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const value = useMemo<AuthState>(
    () => ({
      provider: "injected",
      ready: status !== "reconnecting",
      authenticated: isConnected,
      login: () => {
        const c = connectors[0];
        if (!c) {
          toast.error("No browser wallet found", { description: "Install a wallet extension (e.g. MetaMask) and reload." });
          return;
        }
        connectAsync({ connector: c }).catch((err: unknown) => {
          const msg = errorMessage(err);
          if (/reject|denied|cancel/i.test(msg)) toast.error("Wallet connection cancelled");
          else toast.error("Couldn't connect wallet", { description: msg.slice(0, 280) });
        });
      },
      logout: () => disconnect(),
    }),
    [isConnected, status, connectAsync, connectors, disconnect],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
