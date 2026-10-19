"use client";

import { usePrivy } from "@privy-io/react-auth";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { toast } from "sonner";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { friendlyError, isUserRejection } from "./errors";

export type AuthState = {
  provider: "privy" | "injected";
  ready: boolean;
  authenticated: boolean;
  login: () => void;
  logout: () => void;
  /** e.g. the Privy email, if any */
  label?: string;
  /** Privy access token for calling our own server routes (undefined with a plain wallet). */
  getAccessToken?: () => Promise<string | null>;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <Providers>");
  return ctx;
}

export function PrivyAuthBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout, user, getAccessToken } = usePrivy();
  const value = useMemo<AuthState>(
    () => ({
      provider: "privy",
      ready,
      authenticated,
      login: () => login(),
      logout: () => void logout(),
      label: user?.email?.address ?? user?.google?.email ?? user?.twitter?.username ?? undefined,
      getAccessToken,
    }),
    [ready, authenticated, login, logout, user, getAccessToken],
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
          toast.error("No wallet found", { description: "Install a wallet like MetaMask, then reload the page." });
          return;
        }
        connectAsync({ connector: c }).catch((err: unknown) => {
          if (isUserRejection(err)) toast.message("Sign-in cancelled");
          else toast.error("Couldn't sign you in", { description: friendlyError(err) });
        });
      },
      logout: () => disconnect(),
    }),
    [isConnected, status, connectAsync, connectors, disconnect],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
