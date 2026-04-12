export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      app_accounts: {
        Row: {
          created_at: string
          id: string
          password_hash: string
          role: string
          username: string
        }
        Insert: {
          created_at?: string
          id: string
          password_hash: string
          role: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          password_hash?: string
          role?: string
          username?: string
        }
        Relationships: []
      }
      assignments: {
        Row: {
          assigned_at: string
          assigned_by: Database["public"]["Enums"]["assignment_method"]
          duty_place_id: string
          id: string
          prefect_id: string
          slot_index: number
        }
        Insert: {
          assigned_at?: string
          assigned_by?: Database["public"]["Enums"]["assignment_method"]
          duty_place_id: string
          id?: string
          prefect_id: string
          slot_index?: number
        }
        Update: {
          assigned_at?: string
          assigned_by?: Database["public"]["Enums"]["assignment_method"]
          duty_place_id?: string
          id?: string
          prefect_id?: string
          slot_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "assignments_duty_place_id_fkey"
            columns: ["duty_place_id"]
            isOneToOne: false
            referencedRelation: "duty_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_prefect_id_fkey"
            columns: ["prefect_id"]
            isOneToOne: false
            referencedRelation: "prefects"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      duty_places: {
        Row: {
          created_at: string
          gender_requirement: string | null
          grade_requirement: string | null
          id: string
          mandatory_slots: number
          max_prefects: number
          name: string
          required_gender_balance: boolean
          same_grade_if_multiple: boolean
          section_id: string | null
          type: Database["public"]["Enums"]["duty_place_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          gender_requirement?: string | null
          grade_requirement?: string | null
          id?: string
          mandatory_slots?: number
          max_prefects?: number
          name: string
          required_gender_balance?: boolean
          same_grade_if_multiple?: boolean
          section_id?: string | null
          type?: Database["public"]["Enums"]["duty_place_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          gender_requirement?: string | null
          grade_requirement?: string | null
          id?: string
          mandatory_slots?: number
          max_prefects?: number
          name?: string
          required_gender_balance?: boolean
          same_grade_if_multiple?: boolean
          section_id?: string | null
          type?: Database["public"]["Enums"]["duty_place_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "duty_places_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      prefects: {
        Row: {
          active: boolean
          created_at: string
          gender: string
          grade: number
          id: string
          name: string
          reg_number: string
          role: Database["public"]["Enums"]["prefect_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          gender: string
          grade: number
          id?: string
          name: string
          reg_number: string
          role?: Database["public"]["Enums"]["prefect_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          gender?: string
          grade?: number
          id?: string
          name?: string
          reg_number?: string
          role?: Database["public"]["Enums"]["prefect_role"]
          updated_at?: string
        }
        Relationships: []
      }
      sections: {
        Row: {
          co_head_prefect_id: string | null
          created_at: string
          head_prefect_id: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          co_head_prefect_id?: string | null
          created_at?: string
          head_prefect_id?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          co_head_prefect_id?: string | null
          created_at?: string
          head_prefect_id?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_co_head_prefect_id_fkey"
            columns: ["co_head_prefect_id"]
            isOneToOne: false
            referencedRelation: "prefects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_head_prefect_id_fkey"
            columns: ["head_prefect_id"]
            isOneToOne: false
            referencedRelation: "prefects"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
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
      assignment_method: "auto" | "manual"
      duty_place_type: "classroom" | "special" | "inspection"
      prefect_role: "prefect" | "head_prefect" | "deputy_head_prefect" | "games_captain"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      assignment_method: ["auto", "manual"],
      duty_place_type: ["classroom", "special", "inspection"],
      prefect_role: ["prefect", "head_prefect", "deputy_head_prefect", "games_captain"],
    },
  },
} as const
