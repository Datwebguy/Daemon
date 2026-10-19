import { createConfig as createPrivyConfig } from "@privy-io/wagmi";
import { http } from "viem";
import { createConfig, injected } from "wagmi";
import { chain, env } from "./config";

const transports = { [chain.id]: http(env.rpcUrl, { batch: true }) } as const;

/** Used when NEXT_PUBLIC_PRIVY_APP_ID is set: Privy injects its own connectors. */
export const privyWagmiConfig = createPrivyConfig({
  chains: [chain],
  transports,
  ssr: true,
});

/** Fallback without Privy: any injected browser wallet. */
export const injectedWagmiConfig = createConfig({
  chains: [chain],
  connectors: [injected()],
  transports,
  ssr: true,
});
