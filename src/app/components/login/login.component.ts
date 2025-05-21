import {Component, inject, OnInit} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {AppUser, AuthService, LoginResult} from '../../core/services/auth.service';
import { DatabaseService } from '../../core/services/database.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule], // Add FormsModule here for ngModel
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  private router = inject(Router);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private serviceDB = inject(DatabaseService);

  username = '';
  password = '';
  errorMessage = '';

  ngOnInit() {
    if (this.authService.isAuthenticated()) {
      const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/home';
      this.router.navigateByUrl(returnUrl);
    }
  }

  async onLogin() {
    if (!this.username) {
      this.errorMessage = 'Username obbligatoria.';
      return;
    }
    if (!this.password) {
      this.errorMessage = 'Password obbligatoria.';
      return;
    }
    const result: LoginResult = await this.authService.attemptLogin({username: this.username, password: this.password});
    if (result && result.success) {
      this.errorMessage = '';
      //this.serviceDB.onUserLoggedIn(); // <<< TELL SERVICE TO LOAD DATA
      const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/home';
      this.router.navigateByUrl(returnUrl);
    } else {
      this.errorMessage = 'Password errata, riprovare.';
      this.password = '';
    }
  }
}

