export type Database = {
  public: {
    Tables: {
      clubs: {
        Row: {
          id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      club_members: {
        Row: {
          club_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["club_member_role"];
          created_at: string;
        };
        Insert: {
          club_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["club_member_role"];
          created_at?: string;
        };
        Update: {
          club_id?: string;
          user_id?: string;
          role?: Database["public"]["Enums"]["club_member_role"];
          created_at?: string;
        };
        Relationships: [];
      };
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
          blue_result: "win" | "lose" | "draw";
          red_result: "win" | "lose" | "draw";
          time_limit_sec: number;
          points_limit: number;
          remaining_sec: number;
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
          blue_result: "win" | "lose" | "draw";
          red_result: "win" | "lose" | "draw";
          time_limit_sec: number;
          points_limit: number;
          remaining_sec: number;
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
          blue_result?: "win" | "lose" | "draw";
          red_result?: "win" | "lose" | "draw";
          time_limit_sec?: number;
          points_limit?: number;
          remaining_sec?: number;
          started_at?: string;
          finished_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      ensure_own_club: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      is_club_member: {
        Args: { p_club_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      club_member_role: "owner" | "trainer" | "member";
    };
    CompositeTypes: Record<string, never>;
  };
};
