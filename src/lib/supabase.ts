import { createClient } from '@supabase/supabase-js';

export interface SeriesEvent {
  id?: number;
  series_id: string;
  event_date: string;
  kind: 'premiere' | 'finale' | 'season_premiere' | 'season_finale';
  label: string;
  source?: string;
}

export interface SeriesItem {
  id: string;
  slug: string;
  title: string;
  network: string;
  genre_group: string;
  release_years: string;
  chart_color: string;
  viewers_premiere_28d: number;
  viewers_finale: number;
  delta_pct: number;
  daily_series: number[];
  daily_dates?: string[];
  events?: SeriesEvent[];
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
