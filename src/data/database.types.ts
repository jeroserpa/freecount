// Generated from the Supabase schema (public tables only), then trimmed.
// Regenerate after schema changes (Supabase MCP `generate_typescript_types` or `supabase gen types`).

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.5' }
  public: {
    Tables: {
      categories: {
        Row: {
          archived: boolean
          color: string
          created_at: string
          emoji: string
          household_id: string
          id: string
          monthly_budget_cents: number | null
          name: string
          sort_order: number
        }
        Insert: {
          archived?: boolean
          color?: string
          created_at?: string
          emoji?: string
          household_id: string
          id?: string
          monthly_budget_cents?: number | null
          name: string
          sort_order?: number
        }
        Update: Partial<Database['public']['Tables']['categories']['Insert']>
        Relationships: []
      }
      entries: {
        Row: {
          amount_cents: number
          category_id: string | null
          created_at: string
          created_by: string
          date: string
          household_id: string
          id: string
          kind: string
          note: string
          payer_id: string
          payer_share_cents: number | null
          split_type: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          category_id?: string | null
          created_at?: string
          created_by?: string
          date?: string
          household_id: string
          id?: string
          kind?: string
          note?: string
          payer_id: string
          payer_share_cents?: number | null
          split_type?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['entries']['Insert']>
        Relationships: []
      }
      households: {
        Row: {
          created_at: string
          fixed_ratio: number | null
          fixed_ratio_profile_id: string | null
          id: string
          invite_code: string
          name: string
          ratio_mode: string
        }
        Insert: {
          created_at?: string
          fixed_ratio?: number | null
          fixed_ratio_profile_id?: string | null
          id?: string
          invite_code?: string
          name?: string
          ratio_mode?: string
        }
        Update: Partial<Database['public']['Tables']['households']['Insert']>
        Relationships: []
      }
      monthly_incomes: {
        Row: {
          household_id: string
          income_cents: number
          month: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          household_id: string
          income_cents: number
          month: string
          profile_id: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['monthly_incomes']['Insert']>
        Relationships: []
      }
      periods: {
        Row: {
          closed_at: string
          closed_by: string
          estimated: boolean
          household_id: string
          income_a_cents: number | null
          income_b_cents: number | null
          month: string
          profile_a_id: string
          profile_b_id: string
          ratio_mode: string
          share_a: number
        }
        Insert: {
          closed_at?: string
          closed_by?: string
          estimated?: boolean
          household_id: string
          income_a_cents?: number | null
          income_b_cents?: number | null
          month: string
          profile_a_id: string
          profile_b_id: string
          ratio_mode: string
          share_a: number
        }
        Update: Partial<Database['public']['Tables']['periods']['Insert']>
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          emoji: string
          household_id: string | null
          id: string
          reference_monthly_income_cents: number
        }
        Insert: {
          created_at?: string
          display_name?: string
          emoji?: string
          household_id?: string | null
          id: string
          reference_monthly_income_cents?: number
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
        Relationships: []
      }
      settlements: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string
          date: string
          from_id: string
          household_id: string
          id: string
          note: string
          to_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string
          date?: string
          from_id: string
          household_id: string
          id?: string
          note?: string
          to_id: string
        }
        Update: Partial<Database['public']['Tables']['settlements']['Insert']>
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      create_household: { Args: { p_name?: string }; Returns: string }
      join_household: { Args: { p_code: string }; Returns: string }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicTables = Database['public']['Tables']
export type Row<T extends keyof PublicTables> = PublicTables[T]['Row']
export type Insert<T extends keyof PublicTables> = PublicTables[T]['Insert']
export type Update<T extends keyof PublicTables> = PublicTables[T]['Update']
