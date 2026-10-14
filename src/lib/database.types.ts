
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "posts": {
                  Row: {
                    "author_id": string | null,"body": string,"cover_image_path": string | null,"created_at": string,"id": string,"publish_state": Database["public"]['Enums']["publish_state"],"published_at": string | null,"slug": string,"summary": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body"?: string,"cover_image_path"?: string | null,"created_at"?: string,"id"?: string,"publish_state"?: Database["public"]['Enums']["publish_state"],"published_at"?: string | null,"slug": string,"summary"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"cover_image_path"?: string | null,"created_at"?: string,"id"?: string,"publish_state"?: Database["public"]['Enums']["publish_state"],"published_at"?: string | null,"slug"?: string,"summary"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "posts_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_path": string | null,"bio": string,"created_at": string,"full_name": string,"github_url": string | null,"graduation_year": number | null,"headline": string,"id": string,"is_public": boolean,"linkedin_url": string | null,"major": string | null,"role": Database["public"]['Enums']["app_role"],"updated_at": string,"website_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_path"?: string | null,"bio"?: string,"created_at"?: string,"full_name"?: string,"github_url"?: string | null,"graduation_year"?: number | null,"headline"?: string,"id": string,"is_public"?: boolean,"linkedin_url"?: string | null,"major"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"updated_at"?: string,"website_url"?: string | null
                  }
                  Update: {
                    "avatar_path"?: string | null,"bio"?: string,"created_at"?: string,"full_name"?: string,"github_url"?: string | null,"graduation_year"?: number | null,"headline"?: string,"id"?: string,"is_public"?: boolean,"linkedin_url"?: string | null,"major"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"updated_at"?: string,"website_url"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"project_images": {
                  Row: {
                    "alt_text": string,"caption": string,"created_at": string,"id": string,"project_id": string,"sort_order": number,"storage_path": string,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alt_text": string,"caption"?: string,"created_at"?: string,"id"?: string,"project_id": string,"sort_order"?: number,"storage_path": string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "alt_text"?: string,"caption"?: string,"created_at"?: string,"id"?: string,"project_id"?: string,"sort_order"?: number,"storage_path"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_images_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_images_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"project_members": {
                  Row: {
                    "can_edit": boolean,"created_at": string,"id": string,"profile_id": string,"project_id": string,"role_title": string,"sort_order": number,"term": string
                  }
                  ComputedFields: never
                  Insert: {
                    "can_edit"?: boolean,"created_at"?: string,"id"?: string,"profile_id": string,"project_id": string,"role_title": string,"sort_order"?: number,"term"?: string
                  }
                  Update: {
                    "can_edit"?: boolean,"created_at"?: string,"id"?: string,"profile_id"?: string,"project_id"?: string,"role_title"?: string,"sort_order"?: number,"term"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_members_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_members_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "cover_image_path": string | null,"created_at": string,"created_by": string | null,"demo_url": string | null,"description": string,"ended_on": string | null,"id": string,"is_featured": boolean,"publish_state": Database["public"]['Enums']["publish_state"],"published_at": string | null,"repo_url": string | null,"slug": string,"started_on": string | null,"status": Database["public"]['Enums']["project_status"],"summary": string,"tags": (string)[],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cover_image_path"?: string | null,"created_at"?: string,"created_by"?: string | null,"demo_url"?: string | null,"description"?: string,"ended_on"?: string | null,"id"?: string,"is_featured"?: boolean,"publish_state"?: Database["public"]['Enums']["publish_state"],"published_at"?: string | null,"repo_url"?: string | null,"slug": string,"started_on"?: string | null,"status"?: Database["public"]['Enums']["project_status"],"summary"?: string,"tags"?: (string)[],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "cover_image_path"?: string | null,"created_at"?: string,"created_by"?: string | null,"demo_url"?: string | null,"description"?: string,"ended_on"?: string | null,"id"?: string,"is_featured"?: boolean,"publish_state"?: Database["public"]['Enums']["publish_state"],"published_at"?: string | null,"repo_url"?: string | null,"slug"?: string,"started_on"?: string | null,"status"?: Database["public"]['Enums']["project_status"],"summary"?: string,"tags"?: (string)[],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_created_by_fkey"
      columns: ["created_by"]
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
            "hook_before_user_created":
{ Args: { "event": Json }; Returns: Json
                           }
          }
          Enums: {
            "app_role": "student"|"faculty"|"admin","project_status": "proposed"|"ongoing"|"completed","publish_state": "draft"|"in_review"|"published"
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
  "public": {
          Enums: {
            "app_role": ["student", "faculty", "admin"],"project_status": ["proposed", "ongoing", "completed"],"publish_state": ["draft", "in_review", "published"]
          }
        }
} as const
