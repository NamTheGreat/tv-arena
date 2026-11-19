import type { SeriesItem } from './supabase';

export interface SignalStatus {
  source: 'wikipedia' | 'reddit';
  label: string;
  scoreDisplay: string;
  coverageLabel: string;
  observedDays: number;
  totalDays: number;
  latestDate: string | null;
  status: 'fresh' | 'stale' | 'unobserved';
  statusLabel: string;
  isMeasuredZero: boolean;
  isUnobserved: boolean;
  isStale: boolean;
}

export interface ShowSignalFreshness {
  wiki: SignalStatus;
  reddit: SignalStatus;
  hasTelemetry: boolean;
}

export const SIGNAL_WINDOW_DAYS = 7;
export const STALE_LAG_DAYS = 2; // > 2 calendar days difference from anchor = stale

/**
 * Calculates freshness, coverage, and score formatting for individual telemetry signals.
 * Missing/unobserved observations are explicitly distinguished from measured zeros.
 */
export function getSignalFreshness(
  show: Partial<SeriesItem>,
  referenceDateInput?: string | Date
): ShowSignalFreshness {
  const contributions = show.signal_contributions;
  const historyDates = show.daily_dates || [];
  const latestTelemetryDate = historyDates.length > 0 ? historyDates[historyDates.length - 1] : null;

  // Determine reference date:
  // 1. Explicit referenceDateInput parameter (for testing / deterministic runs)
  // 2. If telemetry is historical (>14 days in the past), anchor to latestTelemetryDate to avoid false staleness in snapshots
  // 3. Otherwise current UTC date
  let referenceDate: Date;
  if (referenceDateInput) {
    referenceDate = typeof referenceDateInput === 'string'
      ? new Date(referenceDateInput + (referenceDateInput.length === 10 ? 'T00:00:00Z' : ''))
      : referenceDateInput;
  } else if (latestTelemetryDate) {
    const latestDateObj = new Date(latestTelemetryDate + 'T00:00:00Z');
    const ageFromNowMs = Date.now() - latestDateObj.getTime();
    if (ageFromNowMs > 14 * 86_400_000) {
      referenceDate = latestDateObj;
    } else {
      referenceDate = new Date();
    }
  } else {
    referenceDate = new Date();
  }

  const telemetryDays = contributions ? Math.max(0, Number(contributions.telemetry_days ?? 0)) : 0;
  const wikiObservedDays = contributions ? Math.max(0, Number(contributions.wiki_observed_days ?? 0)) : 0;
  const redditObservedDays = contributions ? Math.max(0, Number(contributions.reddit_observed_days ?? 0)) : 0;
  const hasTelemetry = telemetryDays > 0;

  // --- Wikipedia Signal ---
  const wikiLatestDate = contributions?.last_wiki_date ?? null;
  const wikiUnobserved = wikiObservedDays === 0 || !wikiLatestDate;
  let wikiStale = false;
  if (!wikiUnobserved && wikiLatestDate) {
    const wikiDateObj = new Date(wikiLatestDate + 'T00:00:00Z');
    const diffMs = referenceDate.getTime() - wikiDateObj.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    wikiStale = diffDays > STALE_LAG_DAYS;
  }

  const wikiStatus: SignalStatus['status'] = wikiUnobserved ? 'unobserved' : wikiStale ? 'stale' : 'fresh';
  const wikiStatusLabel = wikiUnobserved ? 'Not observed' : wikiStale ? 'Stale' : 'Fresh';
  const wikiContribution = contributions ? Number(contributions.wiki_contribution ?? 0) : 0;
  const wikiMeasuredZero = !wikiUnobserved && wikiContribution === 0;

  const wiki: SignalStatus = {
    source: 'wikipedia',
    label: 'Wikipedia',
    scoreDisplay: wikiUnobserved ? 'No data' : wikiContribution.toLocaleString(),
    coverageLabel: `${wikiObservedDays} of ${SIGNAL_WINDOW_DAYS} days`,
    observedDays: wikiObservedDays,
    totalDays: SIGNAL_WINDOW_DAYS,
    latestDate: wikiLatestDate,
    status: wikiStatus,
    statusLabel: wikiStatusLabel,
    isMeasuredZero: wikiMeasuredZero,
    isUnobserved: wikiUnobserved,
    isStale: wikiStale,
  };

  // --- Reddit Signal ---
  const redditLatestDate = contributions?.last_reddit_date ?? null;
  const redditUnobserved = redditObservedDays === 0 || !redditLatestDate;
  let redditStale = false;
  if (!redditUnobserved && redditLatestDate) {
    const redditDateObj = new Date(redditLatestDate + 'T00:00:00Z');
    const diffMs = referenceDate.getTime() - redditDateObj.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    redditStale = diffDays > STALE_LAG_DAYS;
  }

  const redditStatus: SignalStatus['status'] = redditUnobserved ? 'unobserved' : redditStale ? 'stale' : 'fresh';
  const redditStatusLabel = redditUnobserved ? 'Not observed' : redditStale ? 'Stale' : 'Fresh';
  const redditContribution = contributions ? Number(contributions.reddit_contribution ?? 0) : 0;
  const redditMeasuredZero = !redditUnobserved && redditContribution === 0;

  const reddit: SignalStatus = {
    source: 'reddit',
    label: 'Reddit',
    scoreDisplay: redditUnobserved ? 'No data' : redditContribution.toLocaleString(),
    coverageLabel: `${redditObservedDays} of ${SIGNAL_WINDOW_DAYS} days`,
    observedDays: redditObservedDays,
    totalDays: SIGNAL_WINDOW_DAYS,
    latestDate: redditLatestDate,
    status: redditStatus,
    statusLabel: redditStatusLabel,
    isMeasuredZero: redditMeasuredZero,
    isUnobserved: redditUnobserved,
    isStale: redditStale,
  };

  return {
    wiki,
    reddit,
    hasTelemetry,
  };
}
