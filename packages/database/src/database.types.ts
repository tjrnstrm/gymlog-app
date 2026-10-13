
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "admin_invites": {
                  Row: {
                    "created_at": string,"id": string,"invited_by": string | null,"invited_user_id": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"invited_by"?: string | null,"invited_user_id": string,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"invited_by"?: string | null,"invited_user_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "admin_invites_invited_by_profiles_id_fk"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "admin_invites_invited_user_id_profiles_id_fk"
      columns: ["invited_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"coach_access_requests": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "coach_access_requests_user_id_profiles_id_fk"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"coach_client_links": {
                  Row: {
                    "accepted_at": string | null,"client_id": string,"coach_id": string,"created_at": string,"ended_at": string | null,"ended_by": string | null,"id": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"client_id": string,"coach_id": string,"created_at"?: string,"ended_at"?: string | null,"ended_by"?: string | null,"id"?: string,"status"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"client_id"?: string,"coach_id"?: string,"created_at"?: string,"ended_at"?: string | null,"ended_by"?: string | null,"id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "coach_client_links_client_id_profiles_id_fk"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coach_client_links_coach_id_profiles_id_fk"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coach_client_links_ended_by_fkey"
      columns: ["ended_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"coach_subscriptions": {
                  Row: {
                    "created_at": string,"expires_at": string | null,"granted_by": string | null,"source": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string | null,"granted_by"?: string | null,"source": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string | null,"granted_by"?: string | null,"source"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "coach_subscriptions_granted_by_profiles_id_fk"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coach_subscriptions_user_id_profiles_id_fk"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"exercises": {
                  Row: {
                    "base_exercise_id": string | null,"brand": string | null,"category": (string)[],"created_at": string,"id": string,"is_global": boolean,"muscle_groups": (string)[],"name": string,"owner_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_exercise_id"?: string | null,"brand"?: string | null,"category"?: (string)[],"created_at"?: string,"id"?: string,"is_global"?: boolean,"muscle_groups"?: (string)[],"name": string,"owner_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "base_exercise_id"?: string | null,"brand"?: string | null,"category"?: (string)[],"created_at"?: string,"id"?: string,"is_global"?: boolean,"muscle_groups"?: (string)[],"name"?: string,"owner_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "exercises_base_exercise_id_exercises_id_fk"
      columns: ["base_exercise_id"]
isOneToOne: false
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exercises_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"legacy_import_map": {
                  Row: {
                    "collection": string,"imported_at": string,"owner_id": string,"source": string,"source_hash": string,"source_id": string,"target_id": string,"target_table": string
                  }
                  ComputedFields: never
                  Insert: {
                    "collection": string,"imported_at"?: string,"owner_id": string,"source": string,"source_hash": string,"source_id": string,"target_id": string,"target_table": string
                  }
                  Update: {
                    "collection"?: string,"imported_at"?: string,"owner_id"?: string,"source"?: string,"source_hash"?: string,"source_id"?: string,"target_id"?: string,"target_table"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "legacy_import_map_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "age": number | null,"avatar_url": string | null,"bio": string | null,"coach_tags": (string)[],"created_at": string,"id": string,"is_admin": boolean,"name": string | null,"updated_at": string,"username": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "age"?: number | null,"avatar_url"?: string | null,"bio"?: string | null,"coach_tags"?: (string)[],"created_at"?: string,"id": string,"is_admin"?: boolean,"name"?: string | null,"updated_at"?: string,"username"?: string | null
                  }
                  Update: {
                    "age"?: number | null,"avatar_url"?: string | null,"bio"?: string | null,"coach_tags"?: (string)[],"created_at"?: string,"id"?: string,"is_admin"?: boolean,"name"?: string | null,"updated_at"?: string,"username"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"program_days": {
                  Row: {
                    "id": string,"name": string,"position": number,"program_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"name": string,"position": number,"program_id": string
                  }
                  Update: {
                    "id"?: string,"name"?: string,"position"?: number,"program_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "program_days_program_id_programs_id_fk"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                },"program_exercises": {
                  Row: {
                    "comment": string | null,"day_id": string,"feeder": string | null,"id": string,"link": string | null,"name": string,"position": number,"reps": string | null,"rest": string | null,"sets": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "comment"?: string | null,"day_id": string,"feeder"?: string | null,"id"?: string,"link"?: string | null,"name": string,"position": number,"reps"?: string | null,"rest"?: string | null,"sets"?: number | null
                  }
                  Update: {
                    "comment"?: string | null,"day_id"?: string,"feeder"?: string | null,"id"?: string,"link"?: string | null,"name"?: string,"position"?: number,"reps"?: string | null,"rest"?: string | null,"sets"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "program_exercises_day_id_program_days_id_fk"
      columns: ["day_id"]
isOneToOne: false
      referencedRelation: "program_days"
      referencedColumns: ["id"]
    }
                  ]
                },"programs": {
                  Row: {
                    "client_id": string | null,"coach_id": string,"created_at": string,"id": string,"message": string | null,"name": string,"sent_at": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id"?: string | null,"coach_id": string,"created_at"?: string,"id"?: string,"message"?: string | null,"name": string,"sent_at"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "client_id"?: string | null,"coach_id"?: string,"created_at"?: string,"id"?: string,"message"?: string | null,"name"?: string,"sent_at"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "programs_client_id_profiles_id_fk"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "programs_coach_id_profiles_id_fk"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"push_subscriptions": {
                  Row: {
                    "created_at": string,"id": string,"subscription": NonNullable<Json>,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"subscription": NonNullable<Json>,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"subscription"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_user_id_profiles_id_fk"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"sets": {
                  Row: {
                    "created_at": string,"id": string,"reps": number,"weight": number,"workout_exercise_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"reps": number,"weight": number,"workout_exercise_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"reps"?: number,"weight"?: number,"workout_exercise_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sets_workout_exercise_id_workout_exercises_id_fk"
      columns: ["workout_exercise_id"]
isOneToOne: false
      referencedRelation: "workout_exercises"
      referencedColumns: ["id"]
    }
                  ]
                },"workout_exercises": {
                  Row: {
                    "created_at": string,"exercise_id": string,"exercise_name": string,"id": string,"workout_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"exercise_id": string,"exercise_name": string,"id"?: string,"workout_id": string
                  }
                  Update: {
                    "created_at"?: string,"exercise_id"?: string,"exercise_name"?: string,"id"?: string,"workout_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workout_exercises_exercise_id_exercises_id_fk"
      columns: ["exercise_id"]
isOneToOne: false
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workout_exercises_workout_id_workouts_id_fk"
      columns: ["workout_id"]
isOneToOne: false
      referencedRelation: "workouts"
      referencedColumns: ["id"]
    }
                  ]
                },"workouts": {
                  Row: {
                    "created_at": string,"date": string,"duration_seconds": number | null,"gym": string | null,"id": string,"is_template": boolean,"name": string,"notes": string | null,"rating": number | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"date": string,"duration_seconds"?: number | null,"gym"?: string | null,"id"?: string,"is_template"?: boolean,"name": string,"notes"?: string | null,"rating"?: number | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"date"?: string,"duration_seconds"?: number | null,"gym"?: string | null,"id"?: string,"is_template"?: boolean,"name"?: string,"notes"?: string | null,"rating"?: number | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workouts_user_id_profiles_id_fk"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_cancel_admin_invite":
{ Args: { "p_username": string }; Returns: undefined
                           },
"admin_create_global_exercise":
{ Args: { "p_base_exercise_id"?: string,"p_brand"?: string,"p_category"?: (string)[],"p_muscle_groups"?: (string)[],"p_name": string }; Returns: string
                           },
"admin_grant_coach":
{ Args: { "p_username": string }; Returns: undefined
                           },
"admin_invite_admin":
{ Args: { "p_username": string }; Returns: undefined
                           },
"admin_list_admins":
{ Args: Record<PropertyKey, never>; Returns: {
              "id": string,"name": string,"status": string,"username": string
            }[]
                           },
"admin_list_users":
{ Args: { "p_search"?: string }; Returns: {
              "coach_active": boolean,"coach_source": string,"id": string,"is_admin": boolean,"is_client": boolean,"name": string,"requested": boolean,"username": string
            }[]
                           },
"admin_overview":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_remove_admin":
{ Args: { "p_username": string }; Returns: undefined
                           },
"admin_revoke_coach":
{ Args: { "p_username": string }; Returns: undefined
                           },
"can_read_training":
{ Args: { "p_owner": string }; Returns: boolean
                           },
"cancel_invite":
{ Args: { "p_link_id": string }; Returns: undefined
                           },
"duplicate_program":
{ Args: { "p_program": string }; Returns: string
                           },
"end_relationship":
{ Args: { "p_link_id": string }; Returns: undefined
                           },
"exercise_visible_via_training":
{ Args: { "p_exercise": string }; Returns: boolean
                           },
"has_coach_access":
{ Args: { "p_uid"?: string }; Returns: boolean
                           },
"invite_client":
{ Args: { "p_username": string }; Returns: undefined
                           },
"is_admin":
{ Args: { "p_uid"?: string }; Returns: boolean
                           },
"list_coaches":
{ Args: Record<PropertyKey, never>; Returns: {
              "avatar_url": string,"bio": string,"coach_tags": (string)[],"id": string,"name": string,"username": string
            }[]
                           },
"my_access":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_clients":
{ Args: Record<PropertyKey, never>; Returns: {
              "accepted_at": string,"client_id": string,"created_at": string,"id": string,"name": string,"status": string,"username": string
            }[]
                           },
"my_coaches":
{ Args: Record<PropertyKey, never>; Returns: {
              "accepted_at": string,"avatar_url": string,"bio": string,"coach_id": string,"coach_tags": (string)[],"created_at": string,"id": string,"name": string,"status": string,"username": string
            }[]
                           },
"request_coach_access":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"respond_admin_invite":
{ Args: { "p_accept": boolean }; Returns: undefined
                           },
"respond_to_invite":
{ Args: { "p_accept": boolean,"p_link_id": string }; Returns: undefined
                           },
"save_program":
{ Args: { "p": Json }; Returns: string
                           },
"send_program":
{ Args: { "p_client_id": string,"p_message": string,"p_program": string }; Returns: undefined
                           },
"set_username":
{ Args: { "p_username": string }; Returns: undefined
                           },
"username_available":
{ Args: { "p_username": string }; Returns: boolean
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
