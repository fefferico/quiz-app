// src/app/core/services/supabase.service.ts
import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../../environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  public supabase: SupabaseClient;

  constructor() {
    if (!environment.supabaseUrl || !environment.supabaseKey) {
      // It's better to throw an error here if the app cannot function without Supabase
      throw new Error("Supabase URL and Key must be provided in environment files and are missing.");
    }
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
    console.log('Supabase client initialized.'); // Good to confirm initialization
  }
}