// src/app/core/services/auth.service.ts
import {Injectable} from '@angular/core';
import {SupabaseClient, User as SupabaseUser} from '@supabase/supabase-js'; // Renamed User to SupabaseUser
import {BehaviorSubject, Observable} from 'rxjs';
import {SupabaseService} from './supabase-service.service';
import { DatabaseService } from './database.service';
import { User } from '../../models/user.model';

// Define User Roles and AppUser interface
export enum UserRole {
  QuizTaker = 'quiz_taker', // Francesco
  StatsViewer = 'stats_viewer', // Fabrizio
  Admin = 'admin', // Federico
  None = 'none' // Default for other users or unauthenticated
}

export interface AppUser {
  id: string; // username for local users, or Supabase ID
  userId?: number;
  role: UserRole;
  email?: string;
  // Include other fields if needed, mirroring SupabaseUser for potential compatibility
  app_metadata?: { provider?: string, providers?: string[] };
  user_metadata?: { [key: string]: any };
  aud?: string;
  created_at?: string;
}

export interface LoginResult {
  success: boolean,
  user: AppUser | null,
  error?: string
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase: SupabaseClient;
  // Updated to use AppUser
  private _currentUser = new BehaviorSubject<AppUser | null>(null);
  public currentUser$: Observable<AppUser | null> = this._currentUser.asObservable();
  private readonly USER_CACHE_KEY = 'loggedInUser'; // Key for localStorage

  // Hardcoded credentials for the special users with SHA-256 hashed passwords
  private specialUsers = {
    francesco: { hashedPassword: '64938c39f785cd1865f6d1c393afef2125af2b7a9b842d19a5c1c47807f6f6fa', role: UserRole.QuizTaker, email: 'francesco@example.com' },
    fabrizio: { hashedPassword: 'a8e44816212c4178c7e6e45e530821c4062e12ebcb1b1c8aa92b7e9593fcfc04', role: UserRole.StatsViewer, email: 'fabrizio@example.com' },
    federico: { hashedPassword: 'c254d572ea30ad1e1a51082304a0ffc46fc25baff396f655a5cfd85f578c6e62', role: UserRole.Admin, email: 'federico@example.com' },
  };

  constructor(private supabaseService: SupabaseService, private dbService: DatabaseService) {
    this.supabase = this.supabaseService.client;

    const cachedUser = this.getUserFromCache();
    if (cachedUser) {
      this._currentUser.next(cachedUser);
      console.log('User loaded from cache:', cachedUser);
    }

    // Supabase session check - this might override a cached local user if a Supabase session is active.
    this.supabase.auth.getSession().then(({data: {session}}) => {
      const supabaseUser = session?.user ?? null;
      if (supabaseUser) {
        // If a Supabase session exists, it takes precedence or merges.
        // For now, map Supabase user to AppUser with a default role.
        const appUserFromSupabase = this.mapSupabaseUserToAppUser(supabaseUser);
        if (!this._currentUser.value || this._currentUser.value?.id !== appUserFromSupabase.id) {
          console.log('Supabase session loaded, updating current user.');
          this._currentUser.next(appUserFromSupabase);
          this.storeUserInCache(appUserFromSupabase);
        }
      } else {
        // No Supabase session. If cached user was a Supabase user, clear it.
        // If cached user is one of our special local users, it might persist if not cleared by onAuthStateChange.
        // This logic ensures that if Supabase says "no session", non-Supabase cached users are not immediately cleared here.
        // They will be cleared if onAuthStateChange confirms no session.
      }
    }).catch(error => {
      console.error("Error getting session:", error);
      // Potentially clear cache if session check fails critically
      // if (!this._currentUser.value) { this.removeUserFromCache(); }
    });

    this.supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth event:', event, 'Session:', session);
      const supabaseUser = session?.user ?? null;
      const currentAppUser = this._currentUser.value;

      if (supabaseUser) {
        // A Supabase user is now active (e.g., signed in via Supabase, or session restored).
        const appUserFromSupabase = this.mapSupabaseUserToAppUser(supabaseUser);
        this._currentUser.next(appUserFromSupabase);
        this.storeUserInCache(appUserFromSupabase);
      } else {
        // No active Supabase session (e.g., signed out from Supabase, token expired, or initial state).
        // We should only clear the current user if they are:
        // 1. A Supabase user (i.e., not a 'local_special_user').
        // 2. Or if there was no user logged in at all.
        if (currentAppUser && currentAppUser.app_metadata?.provider === 'local_special_user') {
          // The current user is a special local user. Do nothing, let them stay logged in.
          // This case is important for when a special user logs in, which calls supabase.auth.signOut().
          console.log('Supabase session ended/null, but a local special user is active. No change to current user state by onAuthStateChange.');
        } else {
          // The current user was a Supabase user, or no user was logged in. It's safe to clear.
          console.log('Supabase session ended/null. Clearing current non-special user or if no user was active.');
          this._currentUser.next(null);
          this.removeUserFromCache();
        }
      }
    });
  }

  private async _hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  private mapSupabaseUserToAppUser(supabaseUser: SupabaseUser): AppUser {
    // Basic mapping. Roles for Supabase users would typically come from a 'profiles' table.
    // For now, assign a default role.
    return {
      id: supabaseUser.id,
      email: supabaseUser.email,
      app_metadata: supabaseUser.app_metadata,
      user_metadata: supabaseUser.user_metadata,
      aud: supabaseUser.aud,
      created_at: supabaseUser.created_at,
      role: UserRole.None // Or fetch role from a profiles table based on supabaseUser.id
    };
  }

  private storeUserInCache(user: AppUser): void {
    try {
      localStorage.setItem(this.USER_CACHE_KEY, JSON.stringify(user));
    } catch (e) {
      console.error('Error saving user to localStorage', e);
    }
  }

  private getUserFromCache(): AppUser | null {
    try {
      const cachedUser = localStorage.getItem(this.USER_CACHE_KEY);
      return cachedUser ? JSON.parse(cachedUser) as AppUser : null;
    } catch (e) {
      console.error('Error reading user from localStorage', e);
      localStorage.removeItem(this.USER_CACHE_KEY);
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

  // New attemptLogin for special users
  async attemptLogin(credentials: { username: string, password?: string }): Promise<LoginResult> {
    const username = credentials.username.toLowerCase();
    const password = credentials.password;

    if (!password) {
      return { success: false, user: null, error: 'Password is required' };
    }

    // @ts-ignore
    const specialUserEntry = this.specialUsers[username];

    const foundUser: User = await this.dbService.getUserByUsername(username);

    if (foundUser) {
      const hashedPassword = await this._hashPassword(password);
      if (foundUser.hashedPassword === hashedPassword) {
        const user: AppUser = {
          id: username,
          userId: foundUser.id,
          role: specialUserEntry.role,
          email: specialUserEntry.email,
          app_metadata: { provider: 'local_special_user' },
          user_metadata: { name: username },
          aud: 'authenticated_local',
          created_at: new Date().toISOString(),
        };
        // Sign out any existing Supabase session to avoid conflicts
        await this.supabase.auth.signOut().catch(e => console.warn("Error signing out supabase user during special login", e));
        this._currentUser.next(user);
        this.storeUserInCache(user);
        return { success: true, user };
      }
    }

    return { success: false, user: null, error: 'Invalid username or password' };
  }

  // Supabase sign-up
  async signUp(credentials: { email: string, password: string }) {
    const { data, error } = await this.supabase.auth.signUp(credentials);
    if (data.user) {
      const appUser = this.mapSupabaseUserToAppUser(data.user);
      this._currentUser.next(appUser); // Set current user, onAuthStateChange will also fire
      this.storeUserInCache(appUser);
    } else if (error) {
        this.removeUserFromCache(); // Ensure cache is clean on error
    }
    return { data, error };
  }

  // Supabase sign-in
  async signIn(credentials: { email: string, password: string }) {
    const { data, error } = await this.supabase.auth.signInWithPassword(credentials);
    if (data.user) {
      const appUser = this.mapSupabaseUserToAppUser(data.user);
      this._currentUser.next(appUser); // Set current user, onAuthStateChange will also fire
      this.storeUserInCache(appUser);
    } else if (error || !data?.user) { // Added !data?.user for robustness
        this.removeUserFromCache();
    }
    return { data, error };
  }

  async signOut() {
    // This will sign out both local special users and Supabase users
    const { error } = await this.supabase.auth.signOut(); // This will trigger onAuthStateChange
    this._currentUser.next(null);
    this.removeUserFromCache();
    if (error) {
        console.error("Error signing out from Supabase:", error);
        // Even if Supabase signout fails, ensure local state is cleared
        this._currentUser.next(null);
        this.removeUserFromCache();
    }
    return { error };
  }

  getCurrentUserSnapshot(): AppUser | null {
    return this._currentUser.value;
  }

  getCurrentUserId(): number {
    return this.getCurrentUserSnapshot()?.userId ?? -1;
  }

  isAuthenticated(): boolean {
    return this._currentUser.value !== null;
  }

  // Helper methods for role checking
  public hasRole(roles: UserRole | UserRole[]): boolean {
    const user = this._currentUser.value;
    if (!user) return false;
    if (Array.isArray(roles)) {
      return roles.includes(user.role);
    }
    return user.role === roles;
  }

  public isAdmin(): boolean {
    return this.hasRole(UserRole.Admin);
  }

  public isQuizTaker(): boolean {
    return this.hasRole(UserRole.QuizTaker);
  }

  public isStatsViewer(): boolean {
    return this.hasRole(UserRole.StatsViewer);
  }
}
