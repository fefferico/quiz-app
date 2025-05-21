// src/app/core/services/auth.service.ts
import {Injectable} from '@angular/core';
import {SupabaseClient, User} from '@supabase/supabase-js'; // Removed unused Session import
import {BehaviorSubject, Observable} from 'rxjs';
import {SupabaseService} from './supabase-service.service'; // Keep this import

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase: SupabaseClient; // This will be initialized in the constructor
  private _currentUser = new BehaviorSubject<User | null>(null);
  public currentUser$: Observable<User | null> = this._currentUser.asObservable();
  private readonly USER_CACHE_KEY = 'loggedInUser'; // Key for localStorage

  constructor(private supabaseService: SupabaseService) { // supabaseService is used
    // Initialize Supabase client first using the client getter which handles initialization
    this.supabase = this.supabaseService.client;

    // Try to load user from localStorage first
    const cachedUser = this.getUserFromCache();
    if (cachedUser) {
      this._currentUser.next(cachedUser);
      console.log('User loaded from cache.');
    }

    // Then, check Supabase session (this might overwrite cached user if session is different or invalid)
    this.supabase.auth.getSession().then(({data: {session}}) => {
      const user = session?.user ?? null;
      this._currentUser.next(user);
      if (user) {
        this.storeUserInCache(user);
        console.log('User session loaded from Supabase and cached.');
      } else {
        this.removeUserFromCache();
      }
    }).catch(error => {
      console.error("Error getting session:", error);
      if (!this._currentUser.value) {
          this.removeUserFromCache();
      }
    });

    // Listen for auth state changes
    this.supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth event:', event, 'Session:', session);
      const user = session?.user ?? null;
      this._currentUser.next(user);
      if (user) {
        this.storeUserInCache(user);
      } else {
        this.removeUserFromCache();
      }
    });
  }

  private storeUserInCache(user: User): void {
    try {
      localStorage.setItem(this.USER_CACHE_KEY, JSON.stringify(user));
    } catch (e) {
      console.error('Error saving user to localStorage', e);
    }
  }

  private getUserFromCache(): User | null {
    try {
      const cachedUser = localStorage.getItem(this.USER_CACHE_KEY);
      return cachedUser ? JSON.parse(cachedUser) : null;
    } catch (e) {
      console.error('Error reading user from localStorage', e);
      localStorage.removeItem(this.USER_CACHE_KEY); // Clear corrupted cache
      return null;
    }
  }

  private removeUserFromCache(): void {
    try {
      localStorage.removeItem(this.USER_CACHE_KEY);
    } catch (e) {
      console.error('Error removing user from localStorage', e);
    }
  }

  async signUp(credentials: { email: string, password: string }) {
    const { data, error } = await this.supabase.auth.signUp(credentials);
    return { data, error };
  }

  async signIn(credentials: { email: string, password: string }) {
    const { data, error } = await this.supabase.auth.signInWithPassword(credentials);
    if (error || !data?.user) {
        this.removeUserFromCache();
    }
    return { data, error };
  }

  async signOut() {
    const { error } = await this.supabase.auth.signOut();
    return { error };
  }

  getCurrentUserSnapshot(): User | null {
    return this._currentUser.value;
  }

  isAuthenticated(): boolean {
    return this._currentUser.value !== null;
  }

  async attemptLogin(password: string): Promise<boolean> {
    const CORRECT_PASSWORD_HASH = '64938c39f785cd1865f6d1c393afef2125af2b7a9b842d19a5c1c47807f6f6fa';
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    if (hashHex === CORRECT_PASSWORD_HASH) {
      const mockUser: User = {
        id: 'frafers',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: { email: 'user@example.com' },
        aud: 'authenticated',
        created_at: new Date().toISOString(),
        email: 'user@example.com',
      };
      this._currentUser.next(mockUser);
      this.storeUserInCache(mockUser);
      return true;
    }
    this._currentUser.next(null);
    this.removeUserFromCache();
    return false;
  }
}

