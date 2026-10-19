/**
 * STAND-IN for the types `envio codegen` writes to `.envio/types.d.ts`.
 *
 * Envio's CLI ships native binaries for Linux and macOS only, so codegen cannot run
 * on Windows without WSL or Docker. This file hand-mirrors config.yaml and schema.graphql,
 * following the format of Envio 3.13's generated types, so `npm run typecheck:shim`
 * can type-check src/ on Windows anyway.
 * It is NOT used by the real indexer. After running `envio codegen` (Linux, macOS,
 * WSL or Docker), use `npm run typecheck`. That uses the generated types and ignores this file.
 * Keep it in sync with config.yaml and schema.graphql until then.
 */
import type { Address, SingleOrMultiple } from "envio";

type EvmBlock = {
  readonly number: number;
  readonly timestamp: number;
  readonly hash: string;
};
type EvmTransaction = {
  readonly hash: string;
  readonly from: string | undefined;
};

type Ev<C extends string, E extends string, P> = {
  readonly eventName: E;
  readonly contractName: C;
  readonly chainId: 10143;
  readonly params: P;
  readonly block: EvmBlock;
  readonly transaction: EvmTransaction;
  readonly logIndex: number;
  readonly srcAddress: Address;
};

type Enums = {};
type Entities = {
  Daemon: {
    readonly id: string;
    readonly tokenId: bigint;
    readonly tokenContract: string;
    readonly implementation: string;
    readonly createdAtBlock: number;
    readonly createdAtTimestamp: number;
    readonly createdTxHash: string;
    readonly lifetimeYield: bigint;
    readonly grossHarvest: bigint;
    readonly totalBounties: bigint;
    readonly compoundCount: number;
    readonly hypeCount: number;
    readonly totalHypeMon: bigint;
    readonly totalHypeToken: bigint;
    readonly updateCount: number;
    readonly lastMood: number;
    readonly lastMoodName: string;
    readonly lastMessage: string;
    readonly lastUpdateAt: number | undefined;
    readonly lastCompoundAt: number | undefined;
    readonly lastCompoundBlock: number | undefined;
    readonly boostMultiplierBps: bigint;
    readonly boostExpiresAt: bigint;
    readonly allocatedAssets: bigint;
    readonly sweptCount: number;
    readonly lastSweptAt: number | undefined;
    readonly lastSweptTo: string | undefined;
  };
  DaemonUpdate: {
    readonly id: string;
    readonly daemon_id: string;
    readonly tokenId: bigint;
    readonly mood: number;
    readonly moodName: string;
    readonly message: string;
    readonly yieldAmount: bigint;
    readonly blockNumber: number;
    readonly logIndex: number;
    readonly timestamp: number;
    readonly txHash: string;
  };
  Compounded: {
    readonly id: string;
    readonly daemon_id: string;
    readonly tokenId: bigint;
    readonly keeper_id: string;
    readonly profit: bigint;
    readonly bounty: bigint;
    readonly txFrom: string;
    readonly blockNumber: number;
    readonly logIndex: number;
    readonly timestamp: number;
    readonly txHash: string;
  };
  Hyped: {
    readonly id: string;
    readonly daemon_id: string;
    readonly tokenId: bigint;
    readonly hyper: string;
    readonly token: string;
    readonly isMon: boolean;
    readonly amount: bigint;
    readonly blockNumber: number;
    readonly logIndex: number;
    readonly timestamp: number;
    readonly txHash: string;
  };
  BoostApplied: {
    readonly id: string;
    readonly daemon_id: string;
    readonly tokenId: bigint;
    readonly multiplierBps: bigint;
    readonly expiresAt: bigint;
    readonly blockNumber: number;
    readonly logIndex: number;
    readonly timestamp: number;
    readonly txHash: string;
  };
  Allocation: {
    readonly id: string;
    readonly daemon_id: string;
    readonly tokenId: bigint;
    readonly kind: string;
    readonly source: string;
    readonly assets: bigint;
    readonly shares: bigint;
    readonly recipient: string;
    readonly blockNumber: number;
    readonly logIndex: number;
    readonly timestamp: number;
    readonly txHash: string;
  };
  Chog: {
    readonly id: string;
    readonly tokenId: bigint;
    readonly owner: string;
    readonly mintedAtBlock: number;
    readonly mintedAtTimestamp: number;
    readonly transferCount: number;
  };
  Keeper: {
    readonly id: string;
    readonly totalBounties: bigint;
    readonly compounds: number;
    readonly totalProfitCompounded: bigint;
    readonly firstCompoundAt: number;
    readonly lastCompoundAt: number;
  };
  Hyper: {
    readonly id: string;
    readonly hypeCount: number;
    readonly totalMon: bigint;
    readonly totalToken: bigint;
    readonly lastHypeAt: number;
  };
  Stats: {
    readonly id: string;
    readonly daemonCount: number;
    readonly totalYield: bigint;
    readonly totalGrossHarvest: bigint;
    readonly totalBounties: bigint;
    readonly compoundCount: number;
    readonly hypeCount: number;
    readonly keeperCount: number;
  };
};

declare module "envio" {
  interface Global {
    config: {
      evm: {
        chains: { monadTestnet: { id: 10143 } };
        contracts: {
          ERC6551Registry: {
            ERC6551AccountCreated: Ev<
              "ERC6551Registry",
              "ERC6551AccountCreated",
              {
                readonly account: Address;
                readonly implementation: Address;
                readonly salt: string;
                readonly chainId: bigint;
                readonly tokenContract: Address;
                readonly tokenId: bigint;
              }
            >;
          };
          MockChog: {
            Transfer: Ev<"MockChog", "Transfer", { readonly from: Address; readonly to: Address; readonly tokenId: bigint }>;
          };
          DaemonAccount: {
            Allocated: Ev<"DaemonAccount", "Allocated", { readonly tokenId: bigint; readonly source: Address; readonly assets: bigint; readonly shares: bigint }>;
            Deallocated: Ev<"DaemonAccount", "Deallocated", { readonly tokenId: bigint; readonly source: Address; readonly shares: bigint; readonly assets: bigint }>;
            Compounded: Ev<"DaemonAccount", "Compounded", { readonly tokenId: bigint; readonly caller: Address; readonly profit: bigint; readonly bounty: bigint }>;
            DaemonUpdate: Ev<"DaemonAccount", "DaemonUpdate", { readonly tokenId: bigint; readonly mood: bigint; readonly message: string; readonly yieldAmount: bigint }>;
            Hyped: Ev<"DaemonAccount", "Hyped", { readonly tokenId: bigint; readonly from: Address; readonly token: Address; readonly amount: bigint }>;
            BoostApplied: Ev<"DaemonAccount", "BoostApplied", { readonly tokenId: bigint; readonly multiplierBps: bigint; readonly expiresAt: bigint }>;
            Swept: Ev<"DaemonAccount", "Swept", { readonly tokenId: bigint; readonly to: Address }>;
          };
        };
        eventFilters: {
          ERC6551Registry: {
            ERC6551AccountCreated: {
              readonly params: {
                readonly implementation?: SingleOrMultiple<Address>;
                readonly tokenContract?: SingleOrMultiple<Address>;
                readonly tokenId?: SingleOrMultiple<bigint>;
              };
            };
          };
          MockChog: {
            Transfer: { readonly params: { readonly from?: SingleOrMultiple<Address>; readonly to?: SingleOrMultiple<Address>; readonly tokenId?: SingleOrMultiple<bigint> } };
          };
          DaemonAccount: {
            Allocated: { readonly params: { readonly tokenId?: SingleOrMultiple<bigint>; readonly source?: SingleOrMultiple<Address> } };
            Deallocated: { readonly params: { readonly tokenId?: SingleOrMultiple<bigint>; readonly source?: SingleOrMultiple<Address> } };
            Compounded: { readonly params: { readonly tokenId?: SingleOrMultiple<bigint>; readonly caller?: SingleOrMultiple<Address> } };
            DaemonUpdate: { readonly params: { readonly tokenId?: SingleOrMultiple<bigint> } };
            Hyped: { readonly params: { readonly tokenId?: SingleOrMultiple<bigint>; readonly from?: SingleOrMultiple<Address> } };
            BoostApplied: { readonly params: { readonly tokenId?: SingleOrMultiple<bigint> } };
            Swept: { readonly params: { readonly tokenId?: SingleOrMultiple<bigint>; readonly to?: SingleOrMultiple<Address> } };
          };
        };
      };
      entities: Entities;
      perChainEntities: never;
      enums: Enums;
    };
  }

  export type Daemon = Entities["Daemon"];
  export type DaemonUpdate = Entities["DaemonUpdate"];
  export type Compounded = Entities["Compounded"];
  export type Hyped = Entities["Hyped"];
  export type BoostApplied = Entities["BoostApplied"];
  export type Allocation = Entities["Allocation"];
  export type Chog = Entities["Chog"];
  export type Keeper = Entities["Keeper"];
  export type Hyper = Entities["Hyper"];
  export type Stats = Entities["Stats"];
}
