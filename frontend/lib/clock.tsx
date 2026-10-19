"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * One shared clock for the whole app instead of a setInterval per component.
 * `useNow()` ticks every second (countdowns on the active Daemon page);
 * `useSlowNow()` ticks every 30s (cheap "is boosted?" checks on list cards).
 * Neither triggers RPC calls; they only re-render their consumers.
 */
const nowSec = () => Math.floor(Date.now() / 1000);

const FastClock = createContext<number | null>(null);
const SlowClock = createContext<number | null>(null);

export function ClockProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(nowSec);
  const [slow, setSlow] = useState(nowSec);
  useEffect(() => {
    let ticks = 0;
    const t = setInterval(() => {
      const n = nowSec();
      setNow(n);
      ticks += 1;
      if (ticks % 30 === 0) setSlow(n);
    }, 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <SlowClock.Provider value={slow}>
      <FastClock.Provider value={now}>{children}</FastClock.Provider>
    </SlowClock.Provider>
  );
}

/** Unix seconds, updated every second by the shared ClockProvider. */
export function useNow(): number {
  return useContext(FastClock) ?? nowSec();
}

/** Unix seconds, updated every 30 seconds by the shared ClockProvider. */
export function useSlowNow(): number {
  return useContext(SlowClock) ?? nowSec();
}
