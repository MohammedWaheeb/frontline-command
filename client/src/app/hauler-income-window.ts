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

  // Never interpolate a boundary or include an interval older than 60 seconds.
  // Integer ticks and one sample per tick bound retained history to 1,201 entries.
  const cutoff = tick - WINDOW_TICKS;
  let expired = 0;
  while (expired < this.samples.length && this.samples[expired].tick < cutoff) expired++;
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
    coverage: windowTicks === WINDOW_TICKS ? 'full' : 'partial',
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

/** Amount over the declared simulation interval, without extrapolating a rate. */
export function incomeWindowLabel(model: RecentHaulerIncome | undefined): string {
 if (!model) return 'Income observations pending';
 const whole = (model.amount / 1000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
 const fraction = (model.amount % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
 const amount = fraction ? `${whole}.${fraction}` : whole;
 const seconds = model.windowTicks / TICKS_PER_SECOND;
 return `${amount} credits observed over ${seconds}s of simulation${model.coverage === 'partial' ? ' (partial 60s window)' : ' (full 60s window)'}`;
}
