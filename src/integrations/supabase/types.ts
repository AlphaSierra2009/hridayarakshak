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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      alert_notifications: {
        Row: {
          alert_id: string
          delivered_at: string | null
          error_message: string | null
          id: string
          notification_method: string
          recipient_id: string
          recipient_type: string
          sent_at: string | null
          status: string | null
        }
        Insert: {
          alert_id: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          notification_method: string
          recipient_id: string
          recipient_type: string
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          alert_id?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          notification_method?: string
          recipient_id?: string
          recipient_type?: string
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_notifications_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "emergency_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string | null
          device_name: string
          device_token: string
          id: string
          is_active: boolean | null
          last_seen: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_name: string
          device_token: string
          id?: string
          is_active?: boolean | null
          last_seen?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_name?: string
          device_token?: string
          id?: string
          is_active?: boolean | null
          last_seen?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ecg_readings: {
        Row: {
          device_id: string
          heart_rate: number | null
          id: string
          latitude: number | null
          longitude: number | null
          reading_timestamp: string | null
          reading_value: number
          st_elevation_detected: boolean | null
          user_id: string
        }
        Insert: {
          device_id: string
          heart_rate?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          reading_timestamp?: string | null
          reading_value: number
          st_elevation_detected?: boolean | null
          user_id: string
        }
        Update: {
          device_id?: string
          heart_rate?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          reading_timestamp?: string | null
          reading_value?: number
          st_elevation_detected?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ecg_readings_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_alerts: {
        Row: {
          alert_type: string
          ecg_reading_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          notes: string | null
          resolved_at: string | null
          status: string
          triggered_at: string | null
          user_id: string
        }
        Insert: {
          alert_type?: string
          ecg_reading_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          resolved_at?: string | null
          status?: string
          triggered_at?: string | null
          user_id: string
        }
        Update: {
          alert_type?: string
          ecg_reading_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          resolved_at?: string | null
          status?: string
          triggered_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_alerts_ecg_reading_id_fkey"
            columns: ["ecg_reading_id"]
            isOneToOne: false
            referencedRelation: "ecg_readings"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_contacts: {
        Row: {
          created_at: string | null
          id: string
          name: string
          phone_number: string
          priority: number | null
          relationship: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          phone_number: string
          priority?: number | null
          relationship?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          phone_number?: string
          priority?: number | null
          relationship?: string | null
          user_id?: string
        }
        Relationships: []
      }
      hospitals: {
        Row: {
          address: string | null
          created_at: string | null
          has_ambulance: boolean | null
          has_cardiac_unit: boolean | null
          id: string
          is_multi_facility: boolean | null
          latitude: number
          longitude: number
          name: string
          phone_number: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          has_ambulance?: boolean | null
          has_cardiac_unit?: boolean | null
          id?: string
          is_multi_facility?: boolean | null
          latitude: number
          longitude: number
          name: string
          phone_number?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          has_ambulance?: boolean | null
          has_cardiac_unit?: boolean | null
          id?: string
          is_multi_facility?: boolean | null
          latitude?: number
          longitude?: number
          name?: string
          phone_number?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          full_name: string | null
          id: string
          phone_number: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          full_name?: string | null
          id: string
          phone_number?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          full_name?: string | null
          id?: string
          phone_number?: string | null
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
    Enums: {},
  },
} as const
