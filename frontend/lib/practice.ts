/**
 * Practice mode: a pretend Daemon that follows the same rules as the real contracts, with no wallet, no network
 * and no real money. All numbers are in pretend dUSD / MON. Time only moves when the player fast-forwards.
 *
 * The rules deliberately mirror DaemonAccount: a harvest is possible after a cooldown, the harvester's tip starts at
 * 5% and rises to 10% over a day, a boost is paid only from the hype jar (never invented), each MON hype adds
 * +0.05x up to 1.25x for 3 hours, and the mood follows the same priority (Tired > Flexing > Chaotic > Smug > Chill).
 */

export const HOUR = 3600;
export const COOLDOWN = 10 * 60; // seconds between harvests
export const TIP_START = 0.05;
export const TIP_MAX = 0.1;
export const TIP_RAMP = 24 * HOUR;
export const BOOST_STEP = 0.05;
export const BOOST_MAX = 0.25;
export const BOOST_DURATION = 3 * HOUR;
export const NEGLECT_AFTER = 3 * 24 * HOUR;
export const MON_PRICE = 1; // dUSD per MON (pretend)

export type VaultId = "stable" | "degen";
/** Hourly reward as a share of what is deposited (pretend numbers, readable in a short session). */
export const VAULTS: Record<VaultId, { name: string; blurb: string; rate: number; swing: number }> = {
  stable: { name: "Stable vault", blurb: "Calm, steady rewards", rate: 0.004, swing: 0 },
  degen: { name: "Degen vault", blurb: "Bigger swings, more fun", rate: 0.009, swing: 0.8 },
};

export type Practice = {
  /** pretend seconds since the Daemon was woken */
  now: number;
  wallet: number; // dUSD in the player's pretend wallet
  deposits: Record<VaultId, number>;
  pending: number; // rewards waiting to be harvested (dUSD)
  lifetime: number; // total harvested into savings (dUSD)
  lastProfit: number;
  prevProfit: number;
  jar: number; // MON in the hype jar
  boostMult: number; // 1 = no boost
  boostEndsAt: number;
  lastCompoundAt: number;
  lastActivityAt: number;
  harvests: number;
  hypes: number;
  log: string[];
  /** a tiny deterministic counter so the Degen vault swings the same way every time for the same session */
  tick: number;
};

export const fresh = (): Practice => ({
  now: 0,
  wallet: 1_000,
  deposits: { stable: 0, degen: 0 },
  pending: 0,
  lifetime: 0,
  lastProfit: 0,
  prevProfit: 0,
  jar: 0,
  boostMult: 1,
  boostEndsAt: 0,
  lastCompoundAt: 0,
  lastActivityAt: 0,
  harvests: 0,
  hypes: 0,
  log: ["Your Daemon is awake. Put some dUSD to work."],
  tick: 0,
});

export const saved = (p: Practice) => p.deposits.stable + p.deposits.degen;
export const boostActive = (p: Practice) => p.boostEndsAt > p.now && p.boostMult > 1;
export const readyAt = (p: Practice) => p.lastCompoundAt + COOLDOWN;
export const tipShare = (p: Practice): number => {
  const waited = Math.max(0, p.now - readyAt(p));
  return TIP_START + (TIP_MAX - TIP_START) * Math.min(1, waited / TIP_RAMP);
};

/** Mood id (same order as on-chain: 0 Chill, 1 Smug, 2 Chaotic, 3 Flexing, 4 Tired). */
export function moodId(p: Practice): number {
  if (saved(p) > 0 && p.now - p.lastActivityAt > NEGLECT_AFTER) return 4;
  const boosted = boostActive(p);
  const compounded = p.harvests > 0;
  if (boosted && compounded && p.lastProfit > p.prevProfit) return 3;
  if (boosted && p.boostMult >= 1 + BOOST_MAX) return 2;
  if (p.prevProfit > 0 && (p.lastProfit * 2 < p.prevProfit || p.lastProfit > p.prevProfit * 2)) return 2;
  if (compounded && p.lastProfit >= p.prevProfit) return 1;
  return 0;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
const push = (p: Practice, line: string): string[] => [line, ...p.log].slice(0, 6);

/** Moves time forward and accrues rewards (the Degen vault's rate swings around its average, deterministically). */
export function fastForward(p: Practice, seconds: number): Practice {
  let next = { ...p };
  let remaining = seconds;
  while (remaining > 0) {
    const step = Math.min(remaining, HOUR);
    const hours = step / HOUR;
    const swing = 1 + VAULTS.degen.swing * Math.sin(next.tick * 1.7 + 0.6);
    next = {
      ...next,
      now: next.now + step,
      tick: next.tick + 1,
      pending: round(next.pending + hours * (next.deposits.stable * VAULTS.stable.rate + next.deposits.degen * VAULTS.degen.rate * swing)),
    };
    remaining -= step;
  }
  const hrs = Math.round(seconds / HOUR);
  return { ...next, log: push(next, `${hrs >= 24 ? `${hrs / 24} day${hrs === 24 ? "" : "s"}` : `${hrs} hour${hrs === 1 ? "" : "s"}`} pass…`) };
}

export function deposit(p: Practice, vault: VaultId, amount: number): Practice {
  const a = Math.min(amount, p.wallet);
  if (a <= 0) return p;
  return {
    ...p,
    wallet: round(p.wallet - a),
    deposits: { ...p.deposits, [vault]: round(p.deposits[vault] + a) },
    lastActivityAt: p.now,
    log: push(p, `${a} dUSD goes into the ${VAULTS[vault].name}.`),
  };
}

export function withdrawAll(p: Practice): Practice {
  const total = saved(p) + p.pending + p.jar * MON_PRICE;
  if (total <= 0) return p;
  return {
    ...fresh(),
    now: p.now,
    wallet: round(p.wallet + saved(p) + p.pending + p.jar * MON_PRICE),
    lifetime: p.lifetime,
    harvests: p.harvests,
    hypes: p.hypes,
    log: push(p, "You took everything back to your wallet. It's always one tap."),
  };
}

/** What a harvester would keep right now (0 if it can't be harvested yet or the rewards are too small). */
export function harvestPreview(p: Practice): { ok: boolean; reason?: string; profit: number; tip: number; share: number } {
  const share = tipShare(p);
  if (saved(p) <= 0) return { ok: false, reason: "Put something to work first.", profit: 0, tip: 0, share };
  if (p.now < readyAt(p)) return { ok: false, reason: "Still resting. Fast-forward a little.", profit: p.pending, tip: 0, share };
  const tip = round(p.pending * share);
  if (p.pending < 0.05) return { ok: false, reason: "Not enough has grown yet.", profit: p.pending, tip, share };
  return { ok: true, profit: p.pending, tip, share };
}

/** Harvest: the harvester keeps the tip, a boost tops up from the jar only, the rest goes back to work. */
export function harvest(p: Practice): Practice {
  const v = harvestPreview(p);
  if (!v.ok) return p;
  const wantTopUp = boostActive(p) ? round(v.profit * (p.boostMult - 1)) : 0;
  const jarValue = p.jar * MON_PRICE;
  const topUp = Math.min(wantTopUp, jarValue); // paid from the jar, never invented
  const net = round(v.profit + topUp - v.tip);
  // the Degen/Stable split stays as it is: new savings go where most of the savings already are
  const into: VaultId = p.deposits.degen > p.deposits.stable ? "degen" : "stable";
  const next: Practice = {
    ...p,
    pending: 0,
    jar: round(p.jar - topUp / MON_PRICE),
    wallet: round(p.wallet + v.tip),
    deposits: { ...p.deposits, [into]: round(p.deposits[into] + net) },
    lifetime: round(p.lifetime + net),
    prevProfit: p.lastProfit,
    lastProfit: v.profit,
    lastCompoundAt: p.now,
    lastActivityAt: p.now,
    harvests: p.harvests + 1,
  };
  const boostLine = topUp > 0 ? ` The hype jar added ${topUp.toFixed(2)}.` : "";
  return { ...next, log: push(next, `Harvested ${v.profit.toFixed(2)}. You kept a ${(v.share * 100).toFixed(1)}% tip (${v.tip.toFixed(2)}).${boostLine}`) };
}

/** Hype with MON: the payment goes into the jar, the boost grows by one step and lasts a full duration. */
export function hype(p: Practice, mon: number): Practice {
  if (mon < 0.01) return p;
  const base = boostActive(p) ? p.boostMult : 1;
  const next: Practice = {
    ...p,
    jar: round(p.jar + mon),
    boostMult: Math.min(round(base + BOOST_STEP), 1 + BOOST_MAX),
    boostEndsAt: p.now + BOOST_DURATION,
    lastActivityAt: p.now,
    hypes: p.hypes + 1,
  };
  return { ...next, log: push(next, `A friend hyped it with ${mon} MON. Boost is on for 3 hours.`) };
}
