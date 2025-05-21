// src/app/core/services/supabase.service.ts
import { Injectable } from '@angular/core';
// Updated import to include SupabaseClientOptions
import { createClient, SupabaseClient, SupabaseClientOptions } from '@supabase/supabase-js';
import {environment} from '../../../environments/environment.prod';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  // Make supabase readonly and initialize in constructor
  public readonly supabase: SupabaseClient;

  constructor() {
    if (!environment.supabaseUrl || !environment.supabaseKey) {
      // It's better to throw an error here if the app cannot function without Supabase
      throw new Error("Supabase URL and Key must be provided in environment files and are missing.");
    }

    // Define Supabase client options for clarity and potential future configuration
    // The <"public"> generic refers to your database schema name.
    const options: SupabaseClientOptions<"public"> = {
      auth: {
        // autoRefreshToken: true, // Default is true
        persistSession: true, // Default is true, ensures session persists across browser tabs/reloads
        // detectSessionInUrl: true, // Default is true for client-side, handles OAuth redirects
        // storage: localStorage, // Default is localStorage, explicitly stating it can be useful
        // flowType: 'implicit', // Default flow type. Consider 'pkce' for enhanced security if your setup supports it.
      },
      // global: {
      //   fetch: fetch.bind(globalThis) // Default fetch implementation.
      // }
    };

    // createClient is called only ONCE here
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, options);
    console.log('Supabase client initialized in SupabaseService constructor.');
  }

  // The client getter provides a clean way to access the Supabase client instance.
  // As `supabase` is initialized in the constructor, this getter will always return the initialized client.
  get client(): SupabaseClient {
    return this.supabase;
  }
}
