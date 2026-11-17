/** Observed owner cumulative earned income, in milli-credits. */
export type RecentHaulerIncome = {
 amount: bigint;
 fromTick: number;
 toTick: number;
 windowTicks: number;
 coverage: 'partial' | 'full';
};

type IncomeSample = {tick: number; income: bigint};
const TICKS_PER_SECOND = 20;
const WINDOW_TICKS = 60 * TICKS_PER_SECOND;

/**
 * Presentation history for one disclosed player and session/runtime key.
 * Call reset before an explicit load, replay seek or reset, including forward seeks.
 * Unknown income clears history so later disclosure cannot expose a hidden interval.
 */
export class HaulerIncomeWindow {
 private key: string | undefined;
 private player: number | undefined;
 private samples: IncomeSample[] = [];
 private value: RecentHaulerIncome | undefined;

 observe(key: string, player: number, tick: number, income: bigint | undefined): RecentHaulerIncome | undefined {
  if (typeof key !== 'string' || !Number.isSafeInteger(player) || player < 0 ||
      !Number.isSafeInteger(tick) || tick < 0 || typeof income !== 'bigint' || income < 0n) {
   this.reset();
   return undefined;
  }

  const previous = this.samples[this.samples.length - 1];
  if (key !== this.key || player !== this.player || previous && (
      tick < previous.tick || income < previous.income ||
      tick === previous.tick && income !== previous.income)) {
   this.reset();
  }
  this.key = key;
  this.player = player;

  // Repeated snapshots have no simulation-time duration and add no sample.
  const latest = this.samples[this.samples.length - 1];
  if (latest?.tick === tick) return this.value;
  this.samples.push({tick, income});

  // Retain one real boundary sample. Non-divisor snapshot cadences may
  // span slightly over 60 seconds; never invent an interpolated income value.
  // One predecessor plus at most 1,200 recent integer ticks bounds history.
  const cutoff = tick - WINDOW_TICKS;
  let expired = 0;
  while (expired + 1 < this.samples.length && this.samples[expired + 1].tick <= cutoff) expired++;
  if (expired) this.samples.splice(0, expired);

  const first = this.samples[0];
  const windowTicks = tick - first.tick;
  if (windowTicks === 0) {
   this.value = undefined;
  } else {
   const model: RecentHaulerIncome = {
    amount: income - first.income,
    fromTick: first.tick,
    toTick: tick,
    windowTicks,
    coverage: windowTicks >= WINDOW_TICKS ? 'full' : 'partial',
   };
   this.value = Object.freeze(model);
  }
  return this.value;
 }

 reset(): void {
  this.key = undefined;
  this.player = undefined;
  this.samples = [];
  this.value = undefined;
 }

 get current(): RecentHaulerIncome | undefined { return this.value; }
}

/** A minute rate only after a complete observed window; no startup extrapolation. */
export function incomeWindowLabel(model: RecentHaulerIncome | undefined): string {
 if (!model || model.coverage !== 'full' || model.windowTicks < WINDOW_TICKS || model.amount < 0n) return 'Income starting up — observing the first minute';
 const rate = model.amount * BigInt(WINDOW_TICKS) / BigInt(model.windowTicks);
 const whole = (rate / 1000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
 const fraction = (rate % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
 return `${fraction ? `${whole}.${fraction}` : whole} credits/min · observed income`;
}
