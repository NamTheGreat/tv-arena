import { createClient } from '@supabase/supabase-js';
import type { Database, Tables } from './database.types';

export interface SeriesEvent {
  id?: number;
  series_id: string;
  event_date: string;
  kind: 'premiere' | 'finale' | 'season_premiere' | 'season_finale';
  label: string;
  source?: string;
}

export type SeriesRow = Tables<'series'>;
export type SeriesDailyTelemetryRow = Tables<'series_daily_telemetry'>;

// Thin app-level type for derived frontend fields
export interface SeriesItem extends SeriesRow {
  daily_series: number[];
  daily_dates?: string[];
  events?: SeriesEvent[];
  is_breakout?: boolean;
  breakout_reason?: string;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabaseAnonKey)
  : null;
