export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      series: {
        Row: {
          id: string
          tmdb_id: number
          slug: string
          title: string
          network: string
          genre_group: string
          release_years: string
          chart_color: string | null
          wiki_slug: string
          reddit_query: string
          buzz_score: number
          delta_pct: number
          updated_at: string | null
        }
        Insert: {
          id?: string
          tmdb_id: number
          slug: string
          title: string
          network: string
          genre_group?: string
          release_years?: string
          chart_color?: string | null
          wiki_slug: string
          reddit_query: string
          buzz_score?: number
          delta_pct?: number
          updated_at?: string | null
        }
        Update: {
          id?: string
          tmdb_id?: number
          slug?: string
          title?: string
          network?: string
          genre_group?: string
          release_years?: string
          chart_color?: string | null
          wiki_slug?: string
          reddit_query?: string
          buzz_score?: number
          delta_pct?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      series_daily_telemetry: {
        Row: {
          id: number
          series_id: string
          recorded_date: string
          daily_score: number
          wiki_views: number | null
          reddit_comments: number | null
        }
        Insert: {
          id?: number
          series_id: string
          recorded_date?: string
          daily_score: number
          wiki_views?: number | null
          reddit_comments?: number | null
        }
        Update: {
          id?: number
          series_id?: string
          recorded_date?: string
          daily_score?: number
          wiki_views?: number | null
          reddit_comments?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "series_daily_telemetry_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          }
        ]
      }
      score_weights: {
        Row: {
          id: number
          wiki_weight: number
          comment_weight: number
          upvote_weight: number
          updated_at: string | null
        }
        Insert: {
          id?: number
          wiki_weight?: number
          comment_weight?: number
          upvote_weight?: number
          updated_at?: string | null
        }
        Update: {
          id?: number
          wiki_weight?: number
          comment_weight?: number
          upvote_weight?: number
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never
