// src/app/core/services/supabase.service.ts
import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {environment} from '../../../../environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  public supabase: SupabaseClient;
  private initialized: boolean = false;

  constructor() {
    if (!environment.supabaseUrl || !environment.supabaseKey) {
      // It's better to throw an error here if the app cannot function without Supabase
      throw new Error("Supabase URL and Key must be provided in environment files and are missing.");
    }
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
    console.log('Supabase client initialized.'); // Good to confirm initialization
  }

  initialize(): SupabaseClient {
    if (this.initialized && this.supabase) {
      console.log('Supabase client already initialized.');
      return this.supabase;
    }
    if (!environment.supabaseUrl || !environment.supabaseKey) {
      throw new Error("Supabase URL and Key must be provided in environment files and are missing.");
    }
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
    this.initialized = true;
    console.log('Supabase client initialized via initialize() method.');
    return this.supabase;
  }

  // Added: Getter to safely access the client, ensuring it's initialized
  get client(): SupabaseClient {
    if (!this.initialized || !this.supabase) {
      // Initialize on demand if not already done.
      console.warn('Supabase client accessed before explicit initialization or was not initialized. Initializing now.');
      return this.initialize();
    }
    return this.supabase;
  }
}
