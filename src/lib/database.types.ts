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
      series_breakouts: {
        Row: {
          series_id: string
          detected_date: string
          signal: string
          value: number
          baseline_mean: number
          baseline_std: number
          pct_over_baseline: number
          reason: string
          created_at: string | null
        }
        Insert: {
          series_id: string
          detected_date: string
          signal: string
          value: number
          baseline_mean: number
          baseline_std: number
          pct_over_baseline: number
          reason: string
          created_at?: string | null
        }
        Update: {
          series_id?: string
          detected_date?: string
          signal?: string
          value?: number
          baseline_mean?: number
          baseline_std?: number
          pct_over_baseline?: number
          reason?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "series_breakouts_series_id_fkey"
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
      daily_challenges: {
        Row: {
          date: string
          series_ids: string[]
          created_at: string | null
        }
        Insert: {
          date: string
          series_ids: string[]
          created_at?: string | null
        }
        Update: {
          date?: string
          series_ids?: string[]
          created_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          username: string
          display_name: string | null
          current_streak: number
          best_streak: number
          last_played_date: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          username: string
          display_name?: string | null
          current_streak?: number
          best_streak?: number
          last_played_date?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          username?: string
          display_name?: string | null
          current_streak?: number
          best_streak?: number
          last_played_date?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_scores: {
        Row: {
          id: string
          user_id: string
          mode: string
          challenge_date: string | null
          score: number
          best_streak: number
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          mode: string
          challenge_date?: string | null
          score: number
          best_streak?: number
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          mode?: string
          challenge_date?: string | null
          score?: number
          best_streak?: number
          created_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      submit_daily_score: {
        Args: {
          p_date: string
          p_answers: Json
        }
        Returns: Json
      }
      daily_leaderboard: {
        Args: {
          p_date: string
        }
        Returns: Json
      }
      streak_leaderboard: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
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
