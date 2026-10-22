
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "advising": {
                  Row: {
                    "faculty_id": string,"project_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "faculty_id": string,"project_id": string
                  }
                  Update: {
                    "faculty_id"?: string,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "advising_faculty_id_fkey"
      columns: ["faculty_id"]
isOneToOne: false
      referencedRelation: "faculty"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "advising_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "carousel_today"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "advising_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"alumni_stories": {
                  Row: {
                    "created_at": string,"employer": string,"grad_year": number | null,"id": string,"job_title": string,"name": string,"photo_path": string | null,"published": boolean,"published_at": string | null,"story": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"employer"?: string,"grad_year"?: number | null,"id"?: string,"job_title"?: string,"name": string,"photo_path"?: string | null,"published"?: boolean,"published_at"?: string | null,"story"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"employer"?: string,"grad_year"?: number | null,"id"?: string,"job_title"?: string,"name"?: string,"photo_path"?: string | null,"published"?: boolean,"published_at"?: string | null,"story"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"details": NonNullable<Json>,"id": number,"target_id": string | null,"target_type": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: never,"target_id"?: string | null,"target_type"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: never,"target_id"?: string | null,"target_type"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"carousel_state": {
                  Row: {
                    "day": string,"generated_at": string,"reshuffles": number
                  }
                  ComputedFields: never
                  Insert: {
                    "day": string,"generated_at"?: string,"reshuffles"?: number
                  }
                  Update: {
                    "day"?: string,"generated_at"?: string,"reshuffles"?: number
                  }
                  Relationships: [
                    
                  ]
                },"categories": {
                  Row: {
                    "id": string,"name": string,"parent_id": string | null,"slug": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"name": string,"parent_id"?: string | null,"slug": string,"sort_order"?: number
                  }
                  Update: {
                    "id"?: string,"name"?: string,"parent_id"?: string | null,"slug"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"consents": {
                  Row: {
                    "granted_at": string,"id": string,"revoked_at": string | null,"scope": Database["public"]['Enums']["consent_scope"],"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"id"?: string,"revoked_at"?: string | null,"scope": Database["public"]['Enums']["consent_scope"],"student_id"?: string
                  }
                  Update: {
                    "granted_at"?: string,"id"?: string,"revoked_at"?: string | null,"scope"?: Database["public"]['Enums']["consent_scope"],"student_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"contributions": {
                  Row: {
                    "can_edit": boolean,"confirmed": boolean,"created_at": string,"external_name": string | null,"id": string,"project_id": string,"role": string,"sort_order": number,"student_id": string | null,"term": string
                  }
                  ComputedFields: never
                  Insert: {
                    "can_edit"?: boolean,"confirmed"?: boolean,"created_at"?: string,"external_name"?: string | null,"id"?: string,"project_id": string,"role": string,"sort_order"?: number,"student_id"?: string | null,"term"?: string
                  }
                  Update: {
                    "can_edit"?: boolean,"confirmed"?: boolean,"created_at"?: string,"external_name"?: string | null,"id"?: string,"project_id"?: string,"role"?: string,"sort_order"?: number,"student_id"?: string | null,"term"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_members_profile_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "listed_students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_members_profile_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_members_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "carousel_today"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_members_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"daily_carousel": {
                  Row: {
                    "day": string,"position": number,"project_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "day": string,"position": number,"project_id": string
                  }
                  Update: {
                    "day"?: string,"position"?: number,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "daily_carousel_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "carousel_today"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "daily_carousel_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"faculty": {
                  Row: {
                    "created_at": string,"email": string | null,"id": string,"name": string,"photo_path": string | null,"profile_id": string | null,"slug": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"id"?: string,"name": string,"photo_path"?: string | null,"profile_id"?: string | null,"slug": string,"title"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"id"?: string,"name"?: string,"photo_path"?: string | null,"profile_id"?: string | null,"slug"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "faculty_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "listed_students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "faculty_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"internships": {
                  Row: {
                    "company": string,"created_at": string,"description": string,"id": string,"student_id": string,"term": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company": string,"created_at"?: string,"description"?: string,"id"?: string,"student_id": string,"term"?: string,"updated_at"?: string
                  }
                  Update: {
                    "company"?: string,"created_at"?: string,"description"?: string,"id"?: string,"student_id"?: string,"term"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "internships_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "listed_students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internships_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"monthly_pool": {
                  Row: {
                    "created_at": string,"month": string,"project_id": string,"selected_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"month": string,"project_id": string,"selected_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"month"?: string,"project_id"?: string,"selected_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "monthly_pool_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "carousel_today"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "monthly_pool_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "monthly_pool_selected_by_fkey"
      columns: ["selected_by"]
isOneToOne: false
      referencedRelation: "listed_students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "monthly_pool_selected_by_fkey"
      columns: ["selected_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "created_at": string,"id": string,"logo_path": string | null,"name": string,"type": Database["public"]['Enums']["organization_type"],"updated_at": string,"url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"logo_path"?: string | null,"name": string,"type": Database["public"]['Enums']["organization_type"],"updated_at"?: string,"url"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"logo_path"?: string | null,"name"?: string,"type"?: Database["public"]['Enums']["organization_type"],"updated_at"?: string,"url"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"pending_changes": {
                  Row: {
                    "action": Database["public"]['Enums']["change_action"],"created_at": string,"id": string,"proposed_data": NonNullable<Json>,"reason": string | null,"reviewed_at": string | null,"reviewer_id": string | null,"status": Database["public"]['Enums']["change_status"],"submitter_id": string,"target_id": string | null,"target_type": Database["public"]['Enums']["change_target"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": Database["public"]['Enums']["change_action"],"created_at"?: string,"id"?: string,"proposed_data"?: NonNullable<Json>,"reason"?: string | null,"reviewed_at"?: string | null,"reviewer_id"?: string | null,"status"?: Database["public"]['Enums']["change_status"],"submitter_id"?: string,"target_id"?: string | null,"target_type": Database["public"]['Enums']["change_target"],"updated_at"?: string
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["change_action"],"created_at"?: string,"id"?: string,"proposed_data"?: NonNullable<Json>,"reason"?: string | null,"reviewed_at"?: string | null,"reviewer_id"?: string | null,"status"?: Database["public"]['Enums']["change_status"],"submitter_id"?: string,"target_id"?: string | null,"target_type"?: Database["public"]['Enums']["change_target"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pending_changes_reviewer_id_fkey"
      columns: ["reviewer_id"]
isOneToOne: false
      referencedRelation: "listed_students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pending_changes_reviewer_id_fkey"
      columns: ["reviewer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pending_changes_submitter_id_fkey"
      columns: ["submitter_id"]
isOneToOne: false
      referencedRelation: "listed_students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pending_changes_submitter_id_fkey"
      columns: ["submitter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"planner_catalogs": {
                  Row: {
                    "catalog_url": string | null,"name": string,"updated_at": string,"year": string
                  }
                  ComputedFields: never
                  Insert: {
                    "catalog_url"?: string | null,"name": string,"updated_at"?: string,"year": string
                  }
                  Update: {
                    "catalog_url"?: string | null,"name"?: string,"updated_at"?: string,"year"?: string
                  }
                  Relationships: [
                    
                  ]
                },"planner_courses": {
                  Row: {
                    "catalog_url": string | null,"catalog_year": string,"code": string,"corequisite_text": string | null,"corequisites": (string)[],"credits": number,"credits_max": number | null,"description": string | null,"id": string,"offered": (string)[],"offered_text": string | null,"offered_years": NonNullable<Json>,"prerequisite_groups": NonNullable<Json>,"prerequisite_text": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "catalog_url"?: string | null,"catalog_year": string,"code": string,"corequisite_text"?: string | null,"corequisites"?: (string)[],"credits": number,"credits_max"?: number | null,"description"?: string | null,"id": string,"offered"?: (string)[],"offered_text"?: string | null,"offered_years"?: NonNullable<Json>,"prerequisite_groups"?: NonNullable<Json>,"prerequisite_text"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "catalog_url"?: string | null,"catalog_year"?: string,"code"?: string,"corequisite_text"?: string | null,"corequisites"?: (string)[],"credits"?: number,"credits_max"?: number | null,"description"?: string | null,"id"?: string,"offered"?: (string)[],"offered_text"?: string | null,"offered_years"?: NonNullable<Json>,"prerequisite_groups"?: NonNullable<Json>,"prerequisite_text"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "planner_courses_catalog_year_fkey"
      columns: ["catalog_year"]
isOneToOne: false
      referencedRelation: "planner_catalogs"
      referencedColumns: ["year"]
    }
                  ]
                },"planner_degrees": {
                  Row: {
                    "auto_generated": boolean,"catalog_url": string | null,"catalog_year": string,"degree": string,"id": string,"kind": string,"name": string,"notes": (string)[],"requirements": NonNullable<Json>,"semesters": NonNullable<Json>,"sort_order": number,"total_credits": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auto_generated"?: boolean,"catalog_url"?: string | null,"catalog_year": string,"degree"?: string,"id": string,"kind"?: string,"name": string,"notes"?: (string)[],"requirements"?: NonNullable<Json>,"semesters": NonNullable<Json>,"sort_order"?: number,"total_credits": number,"updated_at"?: string
                  }
                  Update: {
                    "auto_generated"?: boolean,"catalog_url"?: string | null,"catalog_year"?: string,"degree"?: string,"id"?: string,"kind"?: string,"name"?: string,"notes"?: (string)[],"requirements"?: NonNullable<Json>,"semesters"?: NonNullable<Json>,"sort_order"?: number,"total_credits"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "planner_degrees_catalog_year_fkey"
      columns: ["catalog_year"]
isOneToOne: false
      referencedRelation: "planner_catalogs"
      referencedColumns: ["year"]
    }
                  ]
                },"planner_plans": {
                  Row: {
                    "state": NonNullable<Json>,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "state": NonNullable<Json>,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "state"?: NonNullable<Json>,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"posts": {
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
      referencedRelation: "listed_students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "background": string,"class_year": number | null,"clubs_roles": (string)[],"contact_email": string | null,"contact_phone": string | null,"created_at": string,"github_url": string | null,"headline": string,"id": string,"linkedin_url": string | null,"major": string | null,"name": string,"photo_path": string | null,"role": Database["public"]['Enums']["app_role"],"skills": (string)[],"slug": string,"updated_at": string,"visible": boolean,"website_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "background"?: string,"class_year"?: number | null,"clubs_roles"?: (string)[],"contact_email"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"github_url"?: string | null,"headline"?: string,"id": string,"linkedin_url"?: string | null,"major"?: string | null,"name"?: string,"photo_path"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"skills"?: (string)[],"slug": string,"updated_at"?: string,"visible"?: boolean,"website_url"?: string | null
                  }
                  Update: {
                    "background"?: string,"class_year"?: number | null,"clubs_roles"?: (string)[],"contact_email"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"github_url"?: string | null,"headline"?: string,"id"?: string,"linkedin_url"?: string | null,"major"?: string | null,"name"?: string,"photo_path"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"skills"?: (string)[],"slug"?: string,"updated_at"?: string,"visible"?: boolean,"website_url"?: string | null
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
      referencedRelation: "carousel_today"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_images_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_images_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "listed_students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_images_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"project_organizations": {
                  Row: {
                    "organization_id": string,"project_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "organization_id": string,"project_id": string
                  }
                  Update: {
                    "organization_id"?: string,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_organizations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_organizations_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "carousel_today"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_organizations_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "category_id": string,"created_at": string,"created_by": string | null,"date_finished": string | null,"date_started": string | null,"demo_url": string | null,"description": string,"id": string,"is_pinned": boolean,"open_to_contributors": boolean,"poster_url": string | null,"primary_contact_email": string | null,"primary_contact_phone": string | null,"primary_contact_student_id": string | null,"priority": number,"published": boolean,"published_at": string | null,"repo_url": string | null,"search": unknown,"slug": string,"status": Database["public"]['Enums']["project_status"],"sub_department_id": string,"summary": string,"tags": (string)[],"thumbnail_alt": string | null,"thumbnail_path": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id": string,"created_at"?: string,"created_by"?: string | null,"date_finished"?: string | null,"date_started"?: string | null,"demo_url"?: string | null,"description"?: string,"id"?: string,"is_pinned"?: boolean,"open_to_contributors"?: boolean,"poster_url"?: string | null,"primary_contact_email"?: string | null,"primary_contact_phone"?: string | null,"primary_contact_student_id"?: string | null,"priority"?: number,"published"?: boolean,"published_at"?: string | null,"repo_url"?: string | null,"search"?: never,"slug": string,"status"?: Database["public"]['Enums']["project_status"],"sub_department_id": string,"summary"?: string,"tags"?: (string)[],"thumbnail_alt"?: string | null,"thumbnail_path"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "category_id"?: string,"created_at"?: string,"created_by"?: string | null,"date_finished"?: string | null,"date_started"?: string | null,"demo_url"?: string | null,"description"?: string,"id"?: string,"is_pinned"?: boolean,"open_to_contributors"?: boolean,"poster_url"?: string | null,"primary_contact_email"?: string | null,"primary_contact_phone"?: string | null,"primary_contact_student_id"?: string | null,"priority"?: number,"published"?: boolean,"published_at"?: string | null,"repo_url"?: string | null,"search"?: never,"slug"?: string,"status"?: Database["public"]['Enums']["project_status"],"sub_department_id"?: string,"summary"?: string,"tags"?: (string)[],"thumbnail_alt"?: string | null,"thumbnail_path"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "listed_students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_primary_contact_student_id_fkey"
      columns: ["primary_contact_student_id"]
isOneToOne: false
      referencedRelation: "listed_students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_primary_contact_student_id_fkey"
      columns: ["primary_contact_student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_sub_department_id_fkey"
      columns: ["sub_department_id"]
isOneToOne: false
      referencedRelation: "sub_departments"
      referencedColumns: ["id"]
    }
                  ]
                },"record_draft": {
                  Row: {
                    "base_updated_at": string,"edited_by": string | null,"gallery": Json | null,"patch": NonNullable<Json>,"row_slug": string,"table_name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_updated_at": string,"edited_by"?: string | null,"gallery"?: Json | null,"patch"?: NonNullable<Json>,"row_slug": string,"table_name": string,"updated_at"?: string
                  }
                  Update: {
                    "base_updated_at"?: string,"edited_by"?: string | null,"gallery"?: Json | null,"patch"?: NonNullable<Json>,"row_slug"?: string,"table_name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "record_draft_edited_by_fkey"
      columns: ["edited_by"]
isOneToOne: false
      referencedRelation: "listed_students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "record_draft_edited_by_fkey"
      columns: ["edited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"record_history": {
                  Row: {
                    "before": NonNullable<Json>,"id": number,"replaced_at": string,"replaced_by": string | null,"row_slug": string,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "before": NonNullable<Json>,"id"?: never,"replaced_at"?: string,"replaced_by"?: string | null,"row_slug": string,"table_name": string
                  }
                  Update: {
                    "before"?: NonNullable<Json>,"id"?: never,"replaced_at"?: string,"replaced_by"?: string | null,"row_slug"?: string,"table_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "record_history_replaced_by_fkey"
      columns: ["replaced_by"]
isOneToOne: false
      referencedRelation: "listed_students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "record_history_replaced_by_fkey"
      columns: ["replaced_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"record_photo_history": {
                  Row: {
                    "alt_text": string,"caption": string,"id": number,"kind": string,"project_id": string,"project_slug": string,"replaced_at": string,"replaced_by": string | null,"storage_path": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alt_text"?: string,"caption"?: string,"id"?: never,"kind": string,"project_id": string,"project_slug": string,"replaced_at"?: string,"replaced_by"?: string | null,"storage_path": string
                  }
                  Update: {
                    "alt_text"?: string,"caption"?: string,"id"?: never,"kind"?: string,"project_id"?: string,"project_slug"?: string,"replaced_at"?: string,"replaced_by"?: string | null,"storage_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "record_photo_history_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "carousel_today"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "record_photo_history_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "record_photo_history_replaced_by_fkey"
      columns: ["replaced_by"]
isOneToOne: false
      referencedRelation: "listed_students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "record_photo_history_replaced_by_fkey"
      columns: ["replaced_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"site_content": {
                  Row: {
                    "key": string,"updated_at": string,"value": string
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"value": string
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"value"?: string
                  }
                  Relationships: [
                    
                  ]
                },"site_content_draft": {
                  Row: {
                    "base_updated_at": string | null,"edited_by": string | null,"key": string,"updated_at": string,"value": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_updated_at"?: string | null,"edited_by"?: string | null,"key": string,"updated_at"?: string,"value": string
                  }
                  Update: {
                    "base_updated_at"?: string | null,"edited_by"?: string | null,"key"?: string,"updated_at"?: string,"value"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "site_content_draft_edited_by_fkey"
      columns: ["edited_by"]
isOneToOne: false
      referencedRelation: "listed_students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "site_content_draft_edited_by_fkey"
      columns: ["edited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"site_content_history": {
                  Row: {
                    "id": number,"key": string,"replaced_at": string,"replaced_by": string | null,"value": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: never,"key": string,"replaced_at"?: string,"replaced_by"?: string | null,"value": string
                  }
                  Update: {
                    "id"?: never,"key"?: string,"replaced_at"?: string,"replaced_by"?: string | null,"value"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "site_content_history_replaced_by_fkey"
      columns: ["replaced_by"]
isOneToOne: false
      referencedRelation: "listed_students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "site_content_history_replaced_by_fkey"
      columns: ["replaced_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"sub_departments": {
                  Row: {
                    "id": string,"name": string,"slug": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"name": string,"slug": string,"sort_order"?: number
                  }
                  Update: {
                    "id"?: string,"name"?: string,"slug"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "carousel_today": {
                  Row: {
                    "advisors": Json | null,"id": string | null,"members": Json | null,"position": number | null,"slug": string | null,"status": Database["public"]['Enums']["project_status"] | null,"summary": string | null,"thumbnail_path": string | null,"title": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"listed_students": {
                  Row: {
                    "background": string | null,"class_year": number | null,"clubs_roles": (string)[] | null,"contact_email": string | null,"contact_phone": string | null,"github_url": string | null,"headline": string | null,"id": string | null,"linkedin_url": string | null,"major": string | null,"name": string | null,"photo_path": string | null,"skills": (string)[] | null,"slug": string | null,"updated_at": string | null,"website_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "background"?: string | null,"class_year"?: number | null,"clubs_roles"?: (string)[] | null,"contact_email"?: string | null,"contact_phone"?: string | null,"github_url"?: string | null,"headline"?: string | null,"id"?: string | null,"linkedin_url"?: string | null,"major"?: string | null,"name"?: string | null,"photo_path"?: string | null,"skills"?: (string)[] | null,"slug"?: string | null,"updated_at"?: string | null,"website_url"?: string | null
                         }
                        Update: {
                           "background"?: string | null,"class_year"?: number | null,"clubs_roles"?: (string)[] | null,"contact_email"?: string | null,"contact_phone"?: string | null,"github_url"?: string | null,"headline"?: string | null,"id"?: string | null,"linkedin_url"?: string | null,"major"?: string | null,"name"?: string | null,"photo_path"?: string | null,"skills"?: (string)[] | null,"slug"?: string | null,"updated_at"?: string | null,"website_url"?: string | null
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "account_for_email":
{ Args: { "address": string }; Returns: string
                           },
"account_is_verified":
{ Args: { "account": string }; Returns: boolean
                           },
"allow_verification_request":
{ Args: { "account": string,"request_kind": string }; Returns: boolean
                           },
"carousel_candidates":
{ Args: { "for_day": string }; Returns: {
              "is_pinned": boolean,"priority": number,"project_id": string,"sub_department_id": string,"updated_at": string
            }[]
                           },
"carousel_day":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"complete_password_reset":
{ Args: { "account": string }; Returns: undefined
                           },
"discard_record_drafts":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"discard_site_drafts":
{ Args: { "only_keys"?: (string)[] }; Returns: number
                           },
"dismiss_password_notice":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"firebase_account_for":
{ Args: { "account": string }; Returns: string
                           },
"hook_before_user_created":
{ Args: { "event": Json }; Returns: Json
                           },
"latest_verification_request":
{ Args: { "account": string,"request_kind": string }; Returns: string
                           },
"list_people":
{ Args: Record<PropertyKey, never>; Returns: {
              "email": string,"id": string,"name": string,"role": Database["public"]['Enums']["app_role"],"verified": boolean
            }[]
                           },
"mark_account_verified":
{ Args: { "account": string,"how": string }; Returns: undefined
                           },
"my_verification":
{ Args: Record<PropertyKey, never>; Returns: {
              "method": string,"password_removed": boolean,"verified": boolean,"verified_at": string
            }[]
                           },
"planner_catalog_issues":
{ Args: Record<PropertyKey, never>; Returns: {
              "catalog_year": string,"course_id": string,"degree_id": string,"issue": string,"semester_index": number
            }[]
                           },
"publish_site_drafts":
{ Args: { "only_keys"?: (string)[] }; Returns: Json
                           },
"release_draft_files":
{ Args: { "paths": (string)[] }; Returns: (string)[]
                           },
"remember_firebase_account":
{ Args: { "account": string,"uid": string }; Returns: undefined
                           },
"respond_to_listing":
{ Args: { "accept": boolean,"listing_id": string }; Returns: undefined
                           },
"restore_record_version":
{ Args: { "history_id": number }; Returns: undefined
                           },
"restore_site_text":
{ Args: { "history_id": number }; Returns: undefined
                           },
"review_change":
{ Args: { "change_id": string,"decision": Database["public"]['Enums']["change_status"],"note"?: string }; Returns: {
              "action": Database["public"]['Enums']["change_action"],
"created_at": string,
"id": string,
"proposed_data": NonNullable<Json>,
"reason": string | null,
"reviewed_at": string | null,
"reviewer_id": string | null,
"status": Database["public"]['Enums']["change_status"],
"submitter_id": string,
"target_id": string | null,
"target_type": Database["public"]['Enums']["change_target"],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "pending_changes"
        isOneToOne: true
        isSetofReturn: false
      } },
"save_carousel":
{ Args: { "for_day": string,"project_ids": (string)[],"reshuffled_by"?: string }; Returns: undefined
                           },
"save_record_draft":
{ Args: { "draft_gallery"?: Json,"draft_patch"?: Json,"draft_slug": string,"draft_table": string,"seen_updated_at"?: string }; Returns: undefined
                           },
"save_site_draft":
{ Args: { "draft_key": string,"draft_value": string,"seen_updated_at"?: string }; Returns: undefined
                           }
          }
          Enums: {
            "app_role": "student"|"reviewer"|"admin","change_action": "create"|"update"|"delete","change_status": "pending"|"approved"|"rejected"|"changes_requested"|"withdrawn","change_target": "profile"|"project"|"internship","consent_scope": "directory"|"photo"|"email"|"phone","organization_type": "grant"|"organization","project_status": "planned"|"active"|"completed","publish_state": "draft"|"in_review"|"published"
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
            "app_role": ["student", "reviewer", "admin"],"change_action": ["create", "update", "delete"],"change_status": ["pending", "approved", "rejected", "changes_requested", "withdrawn"],"change_target": ["profile", "project", "internship"],"consent_scope": ["directory", "photo", "email", "phone"],"organization_type": ["grant", "organization"],"project_status": ["planned", "active", "completed"],"publish_state": ["draft", "in_review", "published"]
          }
        }
} as const
