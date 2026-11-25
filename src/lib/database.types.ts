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
          network_group: string
          genre_group: string
          release_years: string
          chart_color: string | null
          wiki_slug: string
          reddit_query: string
          buzz_score: number
          delta_pct: number | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tmdb_id: number
          slug: string
          title: string
          network: string
          network_group?: string
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
          network_group?: string
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
          daily_viewers?: number | null
          wiki_views: number | null
          reddit_comments: number | null
          reddit_upvotes: number | null
          reddit_observed: boolean
          social_mentions: number | null
          imdb_rating: number | null
          imdb_votes: number | null
          imdb_episode: string | null
        }
        Insert: {
          id?: number
          series_id: string
          recorded_date?: string
          daily_score: number
          daily_viewers?: number | null
          wiki_views?: number | null
          reddit_comments?: number | null
          reddit_upvotes?: number | null
          reddit_observed?: boolean
          social_mentions?: number | null
          imdb_rating?: number | null
          imdb_votes?: number | null
          imdb_episode?: string | null
        }
        Update: {
          id?: number
          series_id?: string
          recorded_date?: string
          daily_score?: number
          daily_viewers?: number | null
          wiki_views?: number | null
          reddit_comments?: number | null
          reddit_upvotes?: number | null
          reddit_observed?: boolean
          social_mentions?: number | null
          imdb_rating?: number | null
          imdb_votes?: number | null
          imdb_episode?: string | null
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
      series_events: {
        Row: {
          id: number
          series_id: string
          event_date: string
          kind: string
          label: string
          source: string | null
          created_at: string | null
        }
        Insert: {
          id?: number
          series_id: string
          event_date: string
          kind: string
          label: string
          source?: string | null
          created_at?: string | null
        }
        Update: {
          id?: number
          series_id?: string
          event_date?: string
          kind?: string
          label?: string
          source?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "series_events_series_id_fkey"
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
      sync_runs: {
        Row: {
          id: number
          started_at: string
          completed_at: string | null
          status: string
          shows_total: number | null
          shows_updated: number | null
          shows_failed: number | null
          wiki_failures: number | null
          reddit_failures: number | null
          error_log: string | null
          duration_ms: number | null
        }
        Insert: {
          id?: number
          started_at?: string
          completed_at?: string | null
          status: string
          shows_total?: number | null
          shows_updated?: number | null
          shows_failed?: number | null
          wiki_failures?: number | null
          reddit_failures?: number | null
          error_log?: string | null
          duration_ms?: number | null
        }
        Update: {
          id?: number
          started_at?: string
          completed_at?: string | null
          status?: string
          shows_total?: number | null
          shows_updated?: number | null
          shows_failed?: number | null
          wiki_failures?: number | null
          reddit_failures?: number | null
          error_log?: string | null
          duration_ms?: number | null
        }
        Relationships: []
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
          series_scores: Json | null
          created_at: string | null
        }
        Insert: {
          date: string
          series_ids: string[]
          series_scores?: Json | null
          created_at?: string | null
        }
        Update: {
          date?: string
          series_ids?: string[]
          series_scores?: Json | null
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
          stats_visibility: 'public' | 'followers'
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
          stats_visibility?: 'public' | 'followers'
        }
        Relationships: []
      }
      user_follows: {
        Row: {
          follower_id: string
          followee_id: string
          status: 'pending' | 'accepted'
          created_at: string
        }
        Insert: {
          follower_id: string
          followee_id: string
        }
        Update: {
          status?: 'pending' | 'accepted'
        }
        Relationships: [
          {
            foreignKeyName: "user_follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_follows_followee_id_fkey"
            columns: ["followee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      series_comments: {
        Row: {
          id: string
          series_id: string
          user_id: string
          body: string
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          series_id: string
          user_id: string
          body: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          body?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_comments_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          }
        ]
      }
      user_watchlist: {
        Row: {
          user_id: string
          series_id: string
          created_at: string
        }
        Insert: {
          user_id: string
          series_id: string
          created_at?: string
        }
        Update: {
          user_id?: string
          series_id?: string
          created_at?: string
        }
        Relationships: []
      }
      user_scores: {
        Row: {
          user_id: string
          date: string
          score: number
          answers: Json
          correctness: boolean[] | null
          completed_at: string | null
        }
        Insert: {
          user_id: string
          date: string
          score: number
          answers?: Json
          correctness?: boolean[] | null
          completed_at?: string | null
        }
        Update: {
          user_id?: string
          date?: string
          score?: number
          answers?: Json
          correctness?: boolean[] | null
          completed_at?: string | null
        }
        Relationships: []
      }
      daily_score_shares: {
        Row: {
          share_token: string
          user_id: string
          date: string
          created_at: string
        }
        Insert: {
          share_token?: string
          user_id: string
          date: string
          created_at?: string
        }
        Update: {
          share_token?: string
          user_id?: string
          date?: string
          created_at?: string
        }
        Relationships: []
      }
      mover_predictions: {
        Row: {
          week_start: string
          user_id: string
          series_id: string
          points: number | null
          actual_rank: number | null
          created_at: string
          graded_at: string | null
        }
        Insert: {
          week_start: string
          user_id: string
          series_id: string
          points?: number | null
          actual_rank?: number | null
          created_at?: string
          graded_at?: string | null
        }
        Update: {
          week_start?: string
          user_id?: string
          series_id?: string
          points?: number | null
          actual_rank?: number | null
          created_at?: string
          graded_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      series_leaderboard: {
        Row: {
          id: string
          tmdb_id: number
          slug: string
          title: string
          network: string
          network_group: string
          genre_group: string
          release_years: string
          chart_color: string | null
          current_7d_score: number
          buzz_score: number
          previous_7d_score: number
          delta_pct: number | null
          rank: number
        }
        Relationships: []
      }
      series_daily_scores: {
        Row: {
          telemetry_id: string
          series_id: string
          recorded_date: string
          wiki_views: number
          reddit_comments: number
          reddit_upvotes: number
          daily_score: number
        }
        Relationships: []
      }
      series_premiere_impact: {
        Row: {
          event_id: number
          series_id: string
          slug: string
          title: string
          genre_group: string
          event_date: string
          label: string
          premiere_number: number
          pre_days: number
          post_days: number
          pre_avg: number
          post_avg: number
          delta: number
          multiplier: number | null
        }
        Relationships: []
      }
      series_signal_contributions: {
        Row: {
          series_id: string
          wiki_contribution: number
          reddit_contribution: number
          telemetry_days: number
          reddit_observed_days: number
          last_wiki_date: string | null
          last_reddit_date: string | null
          wiki_observed_days: number
        }
        Relationships: []
      }
      series_deck_candidates: {
        Row: {
          id: string
          current_7d_score: number
          telemetry_days: number
        }
        Relationships: []
      }
      series_recent_telemetry: {
        Row: {
          series_id: string
          daily_series: number[]
          daily_dates: string[]
          daily_ranks: number[]
        }
        Relationships: []
      }
      insights_platform_share_weekly: {
        Row: {
          week_start: string
          network_group: string
          shows: number
          share_pct: number
          score_share_pct: number
          ranked_shows: number
        }
        Relationships: []
      }
      insights_genre_share_weekly: {
        Row: {
          week_start: string
          genre_group: string
          shows: number
          total_daily_score: number
          avg_score_per_show: number
          share_pct: number
        }
        Relationships: []
      }
      insights_signal_points: {
        Row: {
          series_id: string
          slug: string
          title: string
          network_group: string
          genre_group: string
          observed_days: number
          avg_wiki_views: number | null
          avg_reddit_comments: number | null
          avg_reddit_upvotes: number | null
          avg_daily_score: number | null
        }
        Relationships: []
      }
      series_hall_of_fame: {
        Row: {
          category: string
          place: number
          record_rank: number
          series_id: string
          slug: string
          title: string
          chart_color: string | null
          value: number
          start_date: string
          end_date: string
        }
        Relationships: []
      }
      series_weekly_movers: {
        Row: {
          period_start: string
          series_id: string
          slug: string
          title: string
          network: string
          current_7d_score: number
          previous_7d_score: number
          delta_pct: number
          mover_rank: number
          faller_rank: number
        }
        Relationships: []
      }
    }
    Functions: {
      submit_daily_score: {
        Args: {
          p_date: string
          p_answers: Json
        }
        Returns: Json
      }
      create_daily_score_share: {
        Args: { p_date: string }
        Returns: Json
      }
      get_daily_score_share: {
        Args: { p_share_token: string }
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
      friends_leaderboard: {
        Args: { p_date: string }
        Returns: Json
      }
      head_to_head: {
        Args: { p_username: string; p_date: string }
        Returns: Json
      }
      get_profile_stats: {
        Args: { p_user_ids: string[] }
        Returns: Json
      }
      submit_mover_prediction: {
        Args: {
          p_week_start: string
          p_series_id: string
        }
        Returns: Database['public']['Tables']['mover_predictions']['Row']
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
