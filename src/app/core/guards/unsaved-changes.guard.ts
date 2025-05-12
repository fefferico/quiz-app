// src/app/core/guards/unsaved-changes.guard.ts
import { CanDeactivateFn } from '@angular/router';
import { Observable } from 'rxjs';

// Define an interface that components wanting to use this guard should implement
export interface CanComponentDeactivate {
  canDeactivate: () => Observable<boolean> | Promise<boolean> | boolean;
}

export const unsavedChangesGuard: CanDeactivateFn<CanComponentDeactivate> = (
  component: CanComponentDeactivate,
  // currentRoute: ActivatedRouteSnapshot,
  // currentState: RouterStateSnapshot,
  // nextState?: RouterStateSnapshot
): Observable<boolean> | Promise<boolean> | boolean => {
  // If the component doesn't have a canDeactivate method, allow deactivation
  if (!component.canDeactivate) {
    return true;
  }
  return component.canDeactivate();
};