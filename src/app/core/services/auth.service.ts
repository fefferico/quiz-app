// src/app/core/services/auth.service.ts
import { Injectable } from '@angular/core';
import { SupabaseClient, Session, User } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';
import { SupabaseService } from './supabase-service.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase: SupabaseClient;
  private _currentUser = new BehaviorSubject<User | null>(null);
  public currentUser$: Observable<User | null> = this._currentUser.asObservable();
  public currentSession$: Observable<Session | null>;


  constructor(private supabaseService: SupabaseService) {
    this.supabase = this.supabaseService.supabase;

    // Immediately try to get the current session
    this.supabase.auth.getSession().then(({ data: { session } }) => {
      this._currentUser.next(session?.user ?? null);
    });

    // Listen for auth state changes
    this.supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth event:', event, 'Session:', session);
      this._currentUser.next(session?.user ?? null);
    });

    // For convenience, expose session as an observable too
    this.currentSession$ = new Observable(observer => {
        this.supabase.auth.getSession().then(({ data: { session } }) => {
            observer.next(session);
        });
        const { data: { subscription } } = this.supabase.auth.onAuthStateChange(
            (event, session) => {
                observer.next(session);
            }
        );
        return () => subscription.unsubscribe();
    });
  }

  async signUp(credentials: { email: string, password: string }) {
    return this.supabase.auth.signUp(credentials);
  }

  async signIn(credentials: { email: string, password: string }) {
    return this.supabase.auth.signInWithPassword(credentials);
  }

  async signOut() {
    return this.supabase.auth.signOut();
  }

  getCurrentUserSnapshot(): User | null {
    return this._currentUser.value;
  }
}