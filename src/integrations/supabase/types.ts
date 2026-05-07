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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          booking_source: string
          client_id: string | null
          client_user_id: string | null
          created_at: string
          deleted_at: string | null
          end_time: string
          id: string
          notes: string | null
          professional_id: string | null
          service_id: string | null
          start_time: string
          status: string
          tenant_id: string | null
          total_value: number | null
        }
        Insert: {
          booking_source?: string
          client_id?: string | null
          client_user_id?: string | null
          created_at?: string
          deleted_at?: string | null
          end_time: string
          id?: string
          notes?: string | null
          professional_id?: string | null
          service_id?: string | null
          start_time: string
          status?: string
          tenant_id?: string | null
          total_value?: number | null
        }
        Update: {
          booking_source?: string
          client_id?: string | null
          client_user_id?: string | null
          created_at?: string
          deleted_at?: string | null
          end_time?: string
          id?: string
          notes?: string | null
          professional_id?: string | null
          service_id?: string | null
          start_time?: string
          status?: string
          tenant_id?: string | null
          total_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          closed_at: string | null
          closing_balance: number | null
          created_at: string
          created_by: string | null
          difference: number | null
          expected_balance: number | null
          id: string
          notes: string | null
          opened_at: string
          opening_balance: number
          status: string
          tenant_id: string | null
        }
        Insert: {
          closed_at?: string | null
          closing_balance?: number | null
          created_at?: string
          created_by?: string | null
          difference?: number | null
          expected_balance?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opening_balance?: number
          status?: string
          tenant_id?: string | null
        }
        Update: {
          closed_at?: string | null
          closing_balance?: number | null
          created_at?: string
          created_by?: string | null
          difference?: number | null
          expected_balance?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opening_balance?: number
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_accounts: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          preferred_professional_id: string | null
          tenant_id: string
          terms_accepted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          preferred_professional_id?: string | null
          tenant_id: string
          terms_accepted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          preferred_professional_id?: string | null
          tenant_id?: string
          terms_accepted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_accounts_preferred_professional_id_fkey"
            columns: ["preferred_professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_preferred_services: {
        Row: {
          client_account_id: string
          created_at: string
          id: string
          service_id: string
        }
        Insert: {
          client_account_id: string
          created_at?: string
          id?: string
          service_id: string
        }
        Update: {
          client_account_id?: string
          created_at?: string
          id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_preferred_services_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_preferred_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          birth_date: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          photo_url: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          appointment_id: string | null
          base_value: number
          commission_rate: number
          commission_value: number
          created_at: string
          id: string
          paid_at: string | null
          professional_id: string
          status: string
          tenant_id: string | null
          transaction_id: string | null
          type: string
        }
        Insert: {
          appointment_id?: string | null
          base_value: number
          commission_rate: number
          commission_value: number
          created_at?: string
          id?: string
          paid_at?: string | null
          professional_id: string
          status?: string
          tenant_id?: string | null
          transaction_id?: string | null
          type: string
        }
        Update: {
          appointment_id?: string | null
          base_value?: number
          commission_rate?: number
          commission_value?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          professional_id?: string
          status?: string
          tenant_id?: string | null
          transaction_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          batch_number: string | null
          category: string | null
          cost_price: number
          created_at: string
          deleted_at: string | null
          description: string | null
          expiry_date: string | null
          id: string
          is_active: boolean
          last_purchase_date: string | null
          last_purchase_price: number | null
          location: string | null
          min_stock: number | null
          name: string
          sale_price: number
          sku: string | null
          stock_quantity: number
          supplier_id: string | null
          tenant_id: string | null
          type: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          batch_number?: string | null
          category?: string | null
          cost_price?: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          expiry_date?: string | null
          id?: string
          is_active?: boolean
          last_purchase_date?: string | null
          last_purchase_price?: number | null
          location?: string | null
          min_stock?: number | null
          name: string
          sale_price: number
          sku?: string | null
          stock_quantity?: number
          supplier_id?: string | null
          tenant_id?: string | null
          type?: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          batch_number?: string | null
          category?: string | null
          cost_price?: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          expiry_date?: string | null
          id?: string
          is_active?: boolean
          last_purchase_date?: string | null
          last_purchase_price?: number | null
          location?: string | null
          min_stock?: number | null
          name?: string
          sale_price?: number
          sku?: string | null
          stock_quantity?: number
          supplier_id?: string | null
          tenant_id?: string | null
          type?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          commission_product: number
          commission_service: number
          created_at: string
          deleted_at: string | null
          email: string | null
          has_schedule: boolean
          id: string
          is_active: boolean
          name: string
          nickname: string
          phone: string | null
          photo_url: string | null
          schedule_color: string
          specialty: string | null
          tenant_id: string | null
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          commission_product?: number
          commission_service?: number
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          has_schedule?: boolean
          id?: string
          is_active?: boolean
          name: string
          nickname: string
          phone?: string | null
          photo_url?: string | null
          schedule_color?: string
          specialty?: string | null
          tenant_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          commission_product?: number
          commission_service?: number
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          has_schedule?: boolean
          id?: string
          is_active?: boolean
          name?: string
          nickname?: string
          phone?: string | null
          photo_url?: string | null
          schedule_color?: string
          specialty?: string | null
          tenant_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professionals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_products: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          product_id: string
          quantity: number
          service_id: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          product_id: string
          quantity?: number
          service_id: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          service_id?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_products_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_professionals: {
        Row: {
          assistant_commission_rate: number
          commission_rate: number
          created_at: string
          duration_minutes: number | null
          id: string
          professional_id: string
          service_id: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          assistant_commission_rate?: number
          commission_rate?: number
          created_at?: string
          duration_minutes?: number | null
          id?: string
          professional_id: string
          service_id: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          assistant_commission_rate?: number
          commission_rate?: number
          created_at?: string
          duration_minutes?: number | null
          id?: string
          professional_id?: string
          service_id?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_professionals_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_professionals_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_professionals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          allow_online_booking: boolean
          break_time_minutes: number
          category: string | null
          cost_price: number
          created_at: string
          default_price: number
          deleted_at: string | null
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          name: string
          price_type: Database["public"]["Enums"]["service_price_type"]
          suggested_return_days: number | null
          tenant_id: string | null
        }
        Insert: {
          allow_online_booking?: boolean
          break_time_minutes?: number
          category?: string | null
          cost_price?: number
          created_at?: string
          default_price: number
          deleted_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name: string
          price_type?: Database["public"]["Enums"]["service_price_type"]
          suggested_return_days?: number | null
          tenant_id?: string | null
        }
        Update: {
          allow_online_booking?: boolean
          break_time_minutes?: number
          category?: string | null
          cost_price?: number
          created_at?: string
          default_price?: number
          deleted_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          price_type?: Database["public"]["Enums"]["service_price_type"]
          suggested_return_days?: number | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          appointment_id: string | null
          batch_number: string | null
          created_at: string
          created_by: string | null
          expiry_date: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          movement_type: string
          new_stock: number
          notes: string | null
          previous_stock: number
          product_id: string
          quantity: number
          reason: string | null
          supplier_id: string | null
          tenant_id: string | null
          total_value: number | null
          transaction_id: string | null
          unit_price: number | null
        }
        Insert: {
          appointment_id?: string | null
          batch_number?: string | null
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          movement_type: string
          new_stock: number
          notes?: string | null
          previous_stock: number
          product_id: string
          quantity: number
          reason?: string | null
          supplier_id?: string | null
          tenant_id?: string | null
          total_value?: number | null
          transaction_id?: string | null
          unit_price?: number | null
        }
        Update: {
          appointment_id?: string | null
          batch_number?: string | null
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          movement_type?: string
          new_stock?: number
          notes?: string | null
          previous_stock?: number
          product_id?: string
          quantity?: number
          reason?: string | null
          supplier_id?: string | null
          tenant_id?: string | null
          total_value?: number | null
          transaction_id?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admins: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          city: string | null
          cnpj: string | null
          contact_name: string | null
          cpf: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          state: string | null
          tenant_id: string | null
          trade_name: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          cnpj?: string | null
          contact_name?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          tenant_id?: string | null
          trade_name?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          cnpj?: string | null
          contact_name?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          tenant_id?: string | null
          trade_name?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          accent_color: string | null
          created_at: string
          id: string
          logo_url: string | null
          primary_color: string | null
          salon_name: string | null
          secondary_color: string | null
          tenant_id: string
          updated_at: string
          working_hours_end: number
          working_hours_start: number
        }
        Insert: {
          accent_color?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          salon_name?: string | null
          secondary_color?: string | null
          tenant_id: string
          updated_at?: string
          working_hours_end?: number
          working_hours_start?: number
        }
        Update: {
          accent_color?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          salon_name?: string | null
          secondary_color?: string | null
          tenant_id?: string
          updated_at?: string
          working_hours_end?: number
          working_hours_start?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          booking_slug: string | null
          cnpj: string | null
          cpf: string | null
          created_at: string
          id: string
          name: string
          package_type: string
          payment_method: Database["public"]["Enums"]["payment_method_type"]
          status: Database["public"]["Enums"]["tenant_status"]
          subscription_due_date: string | null
          updated_at: string
        }
        Insert: {
          booking_slug?: string | null
          cnpj?: string | null
          cpf?: string | null
          created_at?: string
          id?: string
          name: string
          package_type?: string
          payment_method?: Database["public"]["Enums"]["payment_method_type"]
          status?: Database["public"]["Enums"]["tenant_status"]
          subscription_due_date?: string | null
          updated_at?: string
        }
        Update: {
          booking_slug?: string | null
          cnpj?: string | null
          cpf?: string | null
          created_at?: string
          id?: string
          name?: string
          package_type?: string
          payment_method?: Database["public"]["Enums"]["payment_method_type"]
          status?: Database["public"]["Enums"]["tenant_status"]
          subscription_due_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          cash_session_id: string | null
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          payment_method: string | null
          reference_id: string | null
          reference_type: string | null
          tenant_id: string | null
          type: string
        }
        Insert: {
          amount: number
          cash_session_id?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          payment_method?: string | null
          reference_id?: string | null
          reference_type?: string | null
          tenant_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          cash_session_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          payment_method?: string | null
          reference_id?: string | null
          reference_type?: string | null
          tenant_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          created_at: string
          id: string
          permission: Database["public"]["Enums"]["permission_type"]
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission: Database["public"]["Enums"]["permission_type"]
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission?: Database["public"]["Enums"]["permission_type"]
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_tenant_modify: { Args: { _tenant_id: string }; Returns: boolean }
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      has_permission: {
        Args: {
          _permission: Database["public"]["Enums"]["permission_type"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _email: string }; Returns: boolean }
      is_tenant_active: { Args: { _tenant_id: string }; Returns: boolean }
      is_tenant_booking_active: {
        Args: { _tenant_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "professional"
      payment_method_type: "pix" | "boleto" | "cartao" | "transferencia"
      permission_type:
        | "view_schedule"
        | "edit_schedule"
        | "view_clients"
        | "view_commissions"
        | "manage_cash_flow"
      service_price_type: "fixed" | "variable" | "starting_at"
      tenant_status: "active" | "readonly" | "blocked"
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
      app_role: ["admin", "professional"],
      payment_method_type: ["pix", "boleto", "cartao", "transferencia"],
      permission_type: [
        "view_schedule",
        "edit_schedule",
        "view_clients",
        "view_commissions",
        "manage_cash_flow",
      ],
      service_price_type: ["fixed", "variable", "starting_at"],
      tenant_status: ["active", "readonly", "blocked"],
    },
  },
} as const
