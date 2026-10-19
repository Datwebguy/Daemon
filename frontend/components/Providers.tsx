"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider as PrivyWagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { WagmiProvider } from "wagmi";
import { InjectedAuthBridge, PrivyAuthBridge } from "@/lib/auth";
import { ClockProvider } from "@/lib/clock";
import { chain, env } from "@/lib/config";
import { injectedWagmiConfig, privyWagmiConfig } from "@/lib/wagmi";
import { ThemeProvider, useTheme } from "./ThemeProvider";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 4_000, refetchOnWindowFocus: false, retry: 1 },
    },
  });
}

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster theme={theme} position="bottom-right" richColors closeButton />;
}

function PrivyTree({ appId, queryClient, children }: { appId: string; queryClient: QueryClient; children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google", "twitter", "wallet"],
        appearance: { theme, accentColor: "#836EF9", showWalletLoginFirst: false },
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        defaultChain: chain,
        supportedChains: [chain],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <PrivyWagmiProvider config={privyWagmiConfig}>
          <PrivyAuthBridge>
            {children}
            <ThemedToaster />
          </PrivyAuthBridge>
        </PrivyWagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  if (env.privyAppId) {
    return (
      <ThemeProvider>
        <ClockProvider>
          <PrivyTree appId={env.privyAppId} queryClient={queryClient}>
            {children}
          </PrivyTree>
        </ClockProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <ClockProvider>
        <WagmiProvider config={injectedWagmiConfig}>
          <QueryClientProvider client={queryClient}>
            <InjectedAuthBridge>
              {children}
              <ThemedToaster />
            </InjectedAuthBridge>
          </QueryClientProvider>
        </WagmiProvider>
      </ClockProvider>
    </ThemeProvider>
  );
}
