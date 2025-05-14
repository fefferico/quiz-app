import { Injectable } from '@angular/core';
import { Router } from '@angular/router'; // Optional: for redirecting

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Store the HASH of your password, not the password itself.
  // Replace this with the actual hash you generated.
  private readonly SHARED_SECRET_HASH = 'd4c578e2a78db5bab09cb55903eab84db9edaeb10807ddec45dec412c99daf2c';
  private readonly AUTH_STORAGE_KEY = 'quizAppAuthenticated';

  constructor(private router: Router) { } // Inject Router if you want to redirect

  private async clientSideHash(password: string): Promise<string> {
    if (!password) return '';
    const msgUint8 = new TextEncoder().encode(password); // encode as (utf-8) Uint8Array
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8); // hash the message
    const hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join(''); // convert bytes to hex string
    return hashHex;
  }

  isAuthenticated(): boolean {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(this.AUTH_STORAGE_KEY) === 'true';
    }
    return false; // Fallback if localStorage is not available
  }

  async attemptLogin(password: string): Promise<boolean> {
    const enteredHash = await this.clientSideHash(password);
    if (enteredHash === this.SHARED_SECRET_HASH) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.AUTH_STORAGE_KEY, 'true');
      }
      return true;
    }
    return false;
  }

  logout(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.AUTH_STORAGE_KEY);
    }
    // Optional: Redirect to a login page or home page after logout
    // this.router.navigate(['/login']); 
    console.log('User logged out');
  }
}