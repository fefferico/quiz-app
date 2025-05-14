import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms'; // Import FormsModule
import { AuthService } from '../../core/services/auth.service';
import { DatabaseService } from '../../core/services/database.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule], // Add FormsModule here for ngModel
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  password = '';
  errorMessage = '';

  constructor(private authService: AuthService, private router: Router, private serviceDB: DatabaseService) {}

async onLogin() {
    if (!this.password) {
      this.errorMessage = 'Password obbligatoria.';
      return;
    }
    const success = await this.authService.attemptLogin(this.password);
    if (success) {
      this.errorMessage = '';
      this.serviceDB.onUserLoggedIn(); // <<< TELL SERVICE TO LOAD DATA
      this.router.navigate(['/home']); 
    } else {
      this.errorMessage = 'Incorrect password.';
      this.password = '';
    }
  }
}