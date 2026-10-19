import { CHAIN_ID, contracts, env, missingCore } from "@/lib/config";

/** Shown whenever core addresses are missing from env (contracts not deployed yet). */
export function ContractsBanner() {
  // An empty NEXT_PUBLIC_CHAIN_ID is treated as unset (defaults to Monad Testnet).
  const configured = env.configuredChainId;
  const chainMismatch = configured !== undefined && Number(configured) !== CHAIN_ID;
  if (missingCore.length === 0 && !chainMismatch) return null;
  return (
    <div className="border-b border-amber-400/40 bg-amber-400/10">
      <div className="mx-auto max-w-6xl px-4 py-3 text-sm">
        {missingCore.length > 0 && (
          <p>
            <span className="font-semibold">🚧 Contracts not deployed yet.</span>{" "}
            <span className="text-dim">
              Missing <code className="font-mono text-xs">{missingCore.join(", ")}</code>
              {!contracts.mockChog ? ". Daemons can't be loaded until the deployment addresses are set." : ". Some actions are disabled."}
            </span>
          </p>
        )}
        {chainMismatch && (
          <p className="mt-1 text-dim">
            NEXT_PUBLIC_CHAIN_ID is {configured}; this app only supports Monad Testnet ({CHAIN_ID}).
          </p>
        )}
      </div>
    </div>
  );
}
