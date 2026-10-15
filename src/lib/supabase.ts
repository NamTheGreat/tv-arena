import { createClient } from '@supabase/supabase-js';

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
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

// Built-in fallback catalog matching your 4 Stitch HTML screens so the app works immediately out of the box
export const FALLBACK_SERIES: SeriesItem[] = [
  {
    id: '1',
    slug: 'stranger-things',
    title: 'Stranger Things',
    network: 'Netflix',
    genre_group: 'Drama & Sci-Fi',
    release_years: '2024–2025',
    chart_color: '#C66A3D',
    viewers_premiere_28d: 9530000,
    viewers_finale: 11200000,
    delta_pct: 4.0,
    daily_series: [1200000, 1330000, 1470000, 1280000, 1230000, 1440000, 1550000],
  },
  {
    id: '2',
    slug: 'wednesday',
    title: 'Wednesday',
    network: 'Netflix',
    genre_group: 'Drama & Sci-Fi',
    release_years: '2024–2025',
    chart_color: '#5C828C',
    viewers_premiere_28d: 6900000,
    viewers_finale: 7450000,
    delta_pct: -8.4,
    daily_series: [1000000, 1060000, 1120000, 930000, 840000, 900000, 990000],
  },
  {
    id: '3',
    slug: 'house-of-the-dragon',
    title: 'House of the Dragon',
    network: 'HBO',
    genre_group: 'Drama & Sci-Fi',
    release_years: '2024–2025',
    chart_color: '#C59A44',
    viewers_premiere_28d: 6765000,
    viewers_finale: 8900000,
    delta_pct: 19.9,
    daily_series: [910000, 935000, 865000, 1010000, 1090000, 1020000, 960000],
  },
  {
    id: '4',
    slug: 'severance',
    title: 'Severance',
    network: 'Apple TV+',
    genre_group: 'Drama & Sci-Fi',
    release_years: '2024–2025',
    chart_color: '#C66A3D',
    viewers_premiere_28d: 6320000,
    viewers_finale: 7100000,
    delta_pct: 24.8,
    daily_series: [780000, 820000, 860000, 910000, 940000, 980000, 1030000],
  },
  {
    id: '5',
    slug: 'the-last-of-us',
    title: 'The Last of Us',
    network: 'HBO',
    genre_group: 'Drama & Sci-Fi',
    release_years: '2024–2025',
    chart_color: '#886F99',
    viewers_premiere_28d: 5185000,
    viewers_finale: 8200000,
    delta_pct: 19.2,
    daily_series: [750000, 775000, 750000, 790000, 880000, 820000, 850000],
  },
  {
    id: '6',
    slug: 'the-bear',
    title: 'The Bear',
    network: 'FX / Hulu',
    genre_group: 'Comedy & Drama',
    release_years: '2024–2025',
    chart_color: '#5C828C',
    viewers_premiere_28d: 4820000,
    viewers_finale: 5300000,
    delta_pct: 6.2,
    daily_series: [660000, 670000, 690000, 700000, 710000, 725000, 740000],
  },
  {
    id: '7',
    slug: 'bridgerton',
    title: 'Bridgerton',
    network: 'Netflix',
    genre_group: 'Drama',
    release_years: '2024–2025',
    chart_color: '#6E8761',
    viewers_premiere_28d: 4600000,
    viewers_finale: 5100000,
    delta_pct: -6.8,
    daily_series: [810000, 790000, 760000, 720000, 690000, 760000, 800000],
  },
  {
    id: '8',
    slug: 'the-white-lotus',
    title: 'The White Lotus',
    network: 'HBO',
    genre_group: 'Drama',
    release_years: '2024–2025',
    chart_color: '#A65D67',
    viewers_premiere_28d: 4557000,
    viewers_finale: 6200000,
    delta_pct: 21.7,
    daily_series: [610000, 650000, 665000, 705000, 755000, 720000, 735000],
  },
  {
    id: '9',
    slug: 'the-boys',
    title: 'The Boys',
    network: 'Prime Video',
    genre_group: 'Drama & Sci-Fi',
    release_years: '2024–2025',
    chart_color: '#C59A44',
    viewers_premiere_28d: 4543000,
    viewers_finale: 5400000,
    delta_pct: 17.1,
    daily_series: [600000, 620000, 640000, 660000, 675000, 690000, 705000],
  },
  {
    id: '10',
    slug: 'fallout',
    title: 'Fallout',
    network: 'Prime Video',
    genre_group: 'Drama & Sci-Fi',
    release_years: '2024–2025',
    chart_color: '#6E8761',
    viewers_premiere_28d: 4537000,
    viewers_finale: 5050000,
    delta_pct: 0.1,
    daily_series: [640000, 645000, 650000, 648000, 652000, 650000, 652000],
  },
  {
    id: '11',
    slug: 'succession',
    title: 'Succession',
    network: 'HBO',
    genre_group: 'Drama',
    release_years: '2023–2024',
    chart_color: '#886F99',
    viewers_premiere_28d: 4120000,
    viewers_finale: 5900000,
    delta_pct: -2.1,
    daily_series: [580000, 590000, 585000, 595000, 600000, 585000, 585000],
  },
  {
    id: '12',
    slug: 'silo',
    title: 'Silo',
    network: 'Apple TV+',
    genre_group: 'Drama & Sci-Fi',
    release_years: '2024–2025',
    chart_color: '#5C828C',
    viewers_premiere_28d: 2082000,
    viewers_finale: 2650000,
    delta_pct: 11.4,
    daily_series: [280000, 290000, 295000, 300000, 305000, 310000, 315000],
  },
];
