import {Injectable} from '@angular/core';
import {CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree} from '@angular/router';
import {Observable} from 'rxjs';
import {AuthService, UserRole} from '../core/services/auth.service';
import {AlertService} from '../services/alert.service'; // Import UserRole

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(private authService: AuthService, private router: Router, private alertService: AlertService) {
    // Constructor logic if needed
  }

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree {
    if (!this.authService.isAuthenticated()) {
      // Redirect to login page if not authenticated
      this.router.navigate(['/login'], {queryParams: {returnUrl: state.url}});
      return false;
    }

    // Check for role-based access
    const allowedRoles = route.data['allowedRoles'] as Array<UserRole>;
    if (allowedRoles && allowedRoles.length > 0) {
      const currentUser = this.authService.getCurrentUserSnapshot();
      if (currentUser && this.authService.hasRole(allowedRoles)) {
        console.log("AUTHENTICATED and ROLE AUTHORIZED");
        return true; // User has one of the allowed roles
      } else {
        console.log("AUTHENTICATED but ROLE NOT AUTHORIZED");
        this.alertService.showAlert("Accesso non autorizzato", "Non disponi dei permessi per poter accedere alla pagina selezionata.").then(() => {
          this.router.navigate(['/home']);
        });
        return false;
      }
    }

    // If no roles are specified for the route, allow access for any authenticated user
    console.log("AUTHENTICATED (no specific roles required for this route)");
    return true;
  }
}
