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
      profiles: {
        Row: {
          user_id: string;
          name: string;
          public_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          name: string;
          public_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          name?: string;
          public_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      fencers: {
        Row: {
          id: string;
          club_id: string | null;
          user_id: string | null;
          role: Database["public"]["Enums"]["club_member_role"] | null;
          name: string;
          public_id: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          club_id?: string | null;
          user_id?: string | null;
          role?: Database["public"]["Enums"]["club_member_role"] | null;
          name: string;
          public_id?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          club_id?: string | null;
          user_id?: string | null;
          role?: Database["public"]["Enums"]["club_member_role"] | null;
          name?: string;
          public_id?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tournaments: {
        Row: {
          id: string;
          club_id: string;
          name: string;
          status: Database["public"]["Enums"]["tournament_status"];
          format: Database["public"]["Enums"]["tournament_format"] | null;
          points_scheme: Database["public"]["Enums"]["tournament_points_scheme"] | null;
          time_limit_sec: number;
          points_limit: number;
          group_count: number | null;
          advancers_per_group: number | null;
          swiss_rounds: number | null;
          koth_exit_limit: number;
          created_at: string;
          updated_at: string;
          live_at: string | null;
          finished_at: string | null;
        };
        Insert: {
          id?: string;
          club_id: string;
          name: string;
          status?: Database["public"]["Enums"]["tournament_status"];
          format?: Database["public"]["Enums"]["tournament_format"] | null;
          points_scheme?: Database["public"]["Enums"]["tournament_points_scheme"] | null;
          time_limit_sec: number;
          points_limit: number;
          group_count?: number | null;
          advancers_per_group?: number | null;
          swiss_rounds?: number | null;
          koth_exit_limit?: number;
          created_at?: string;
          updated_at?: string;
          live_at?: string | null;
          finished_at?: string | null;
        };
        Update: {
          id?: string;
          club_id?: string;
          name?: string;
          status?: Database["public"]["Enums"]["tournament_status"];
          format?: Database["public"]["Enums"]["tournament_format"] | null;
          points_scheme?: Database["public"]["Enums"]["tournament_points_scheme"] | null;
          time_limit_sec?: number;
          points_limit?: number;
          group_count?: number | null;
          advancers_per_group?: number | null;
          swiss_rounds?: number | null;
          koth_exit_limit?: number;
          created_at?: string;
          updated_at?: string;
          live_at?: string | null;
          finished_at?: string | null;
        };
        Relationships: [];
      };
      tournament_participants: {
        Row: {
          tournament_id: string;
          fencer_id: string;
          club_id: string;
          name: string;
          club_name: string | null;
          is_guest: boolean;
          group_no: number | null;
        };
        Insert: {
          tournament_id: string;
          fencer_id: string;
          club_id: string;
          name: string;
          club_name?: string | null;
          is_guest?: boolean;
          group_no?: number | null;
        };
        Update: {
          tournament_id?: string;
          fencer_id?: string;
          club_id?: string;
          name?: string;
          club_name?: string | null;
          is_guest?: boolean;
          group_no?: number | null;
        };
        Relationships: [];
      };
      tournament_bouts: {
        Row: {
          id: string;
          tournament_id: string;
          club_id: string;
          stage: Database["public"]["Enums"]["tournament_bout_stage"];
          group_no: number | null;
          round_code: string | null;
          sort_order: number;
          blue_fencer_id: string | null;
          red_fencer_id: string | null;
          blue_placeholder: string | null;
          red_placeholder: string | null;
          winner_next_id: string | null;
          loser_next_id: string | null;
          blue_name: string | null;
          red_name: string | null;
          blue_score: number | null;
          red_score: number | null;
          blue_result: "win" | "lose" | "draw" | null;
          red_result: "win" | "lose" | "draw" | null;
          time_limit_sec: number | null;
          points_limit: number | null;
          remaining_sec: number | null;
          started_at: string | null;
          finished_at: string | null;
          created_at: string;
          koth_king_id: string | null;
        };
        Insert: {
          id?: string;
          tournament_id: string;
          club_id: string;
          stage: Database["public"]["Enums"]["tournament_bout_stage"];
          group_no?: number | null;
          round_code?: string | null;
          sort_order: number;
          blue_fencer_id?: string | null;
          red_fencer_id?: string | null;
          blue_placeholder?: string | null;
          red_placeholder?: string | null;
          winner_next_id?: string | null;
          loser_next_id?: string | null;
          blue_name?: string | null;
          red_name?: string | null;
          blue_score?: number | null;
          red_score?: number | null;
          blue_result?: "win" | "lose" | "draw" | null;
          red_result?: "win" | "lose" | "draw" | null;
          time_limit_sec?: number | null;
          points_limit?: number | null;
          remaining_sec?: number | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_at?: string;
          koth_king_id?: string | null;
        };
        Update: {
          id?: string;
          tournament_id?: string;
          club_id?: string;
          stage?: Database["public"]["Enums"]["tournament_bout_stage"];
          group_no?: number | null;
          round_code?: string | null;
          sort_order?: number;
          blue_fencer_id?: string | null;
          red_fencer_id?: string | null;
          blue_placeholder?: string | null;
          red_placeholder?: string | null;
          winner_next_id?: string | null;
          loser_next_id?: string | null;
          blue_name?: string | null;
          red_name?: string | null;
          blue_score?: number | null;
          red_score?: number | null;
          blue_result?: "win" | "lose" | "draw" | null;
          red_result?: "win" | "lose" | "draw" | null;
          time_limit_sec?: number | null;
          points_limit?: number | null;
          remaining_sec?: number | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_at?: string;
          koth_king_id?: string | null;
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
      save_own_profile: {
        Args: { p_name: string };
        Returns: string;
      };
      create_own_club: {
        Args: { p_name: string };
        Returns: string;
      };
      rename_own_club: {
        Args: { p_name: string };
        Returns: string;
      };
      is_club_member: {
        Args: { p_club_id: string };
        Returns: boolean;
      };
      is_club_owner: {
        Args: { p_club_id: string };
        Returns: boolean;
      };
      lookup_checkin_by_public_id: {
        Args: { p_public_id: string; p_club_id: string };
        Returns: {
          user_id: string;
          name: string;
          club_name: string | null;
          fencer_id: string | null;
        }[];
      };
      link_fencer_to_profile: {
        Args: { p_fencer_id: string; p_public_id: string };
        Returns: string;
      };
      unlink_and_archive: {
        Args: { p_fencer_id: string };
        Returns: string;
      };
      add_linked_fencer: {
        Args: { p_public_id: string };
        Returns: string;
      };
    };
    Enums: {
      club_member_role: "owner" | "trainer" | "member";
      tournament_status: "setup" | "live" | "done";
      tournament_format:
        | "round_robin"
        | "playoff"
        | "groups_playoff"
        | "swiss"
        | "king_of_hill";
      tournament_points_scheme: "half" | "binary" | "football";
      tournament_bout_stage: "rr" | "group" | "swiss" | "playoff" | "koth";
    };
    CompositeTypes: Record<string, never>;
  };
};
