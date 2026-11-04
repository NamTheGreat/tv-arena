import { SeriesItem } from '../lib/supabase';

export type ChartRange = '7D' | '30D' | '90D' | 'All-Time';
export type ActiveChartShow = SeriesItem & { assignedColor: string; slotIndex: number };
export interface ChartEvent {
  id: string;
  title: string;
  color: string;
  label: string;
  date: string;
  xDesktop: number;
  xMobile: number;
}

export const WORKBENCH_PALETTE = [
  '#C66A3D',
  '#5C828C',
  '#C59A44',
  '#886F99',
  '#6E8761',
  '#A65D67',
  '#3D5A80',
  '#B25B30',
];
