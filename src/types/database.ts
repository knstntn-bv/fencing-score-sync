export type Database = {
  public: {
    Tables: {
      fencers: {
        Row: {
          id: string;
          club_id: string;
          name: string;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          club_id: string;
          name: string;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          club_id?: string;
          name?: string;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      matches: {
        Row: {
          id: string;
          club_id: string;
          blue_fencer_id: string;
          red_fencer_id: string;
          blue_name: string;
          red_name: string;
          blue_score: number;
          red_score: number;
          time_limit_sec: number;
          points_limit: number;
          remaining_sec: number;
          winner_fencer_id: string | null;
          winner_name: string | null;
          ended_by: "points" | "time" | "draw";
          started_at: string;
          finished_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          club_id: string;
          blue_fencer_id: string;
          red_fencer_id: string;
          blue_name: string;
          red_name: string;
          blue_score: number;
          red_score: number;
          time_limit_sec: number;
          points_limit: number;
          remaining_sec: number;
          winner_fencer_id?: string | null;
          winner_name?: string | null;
          ended_by: "points" | "time" | "draw";
          started_at: string;
          finished_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          club_id?: string;
          blue_fencer_id?: string;
          red_fencer_id?: string;
          blue_name?: string;
          red_name?: string;
          blue_score?: number;
          red_score?: number;
          time_limit_sec?: number;
          points_limit?: number;
          remaining_sec?: number;
          winner_fencer_id?: string | null;
          winner_name?: string | null;
          ended_by?: "points" | "time" | "draw";
          started_at?: string;
          finished_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
