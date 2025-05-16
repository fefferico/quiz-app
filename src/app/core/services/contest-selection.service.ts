// src/app/core/services/contest-selection.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ContestSelectionService {
  private selectedContestSubject = new BehaviorSubject<string | null>(this.loadInitialContest());
  public selectedContest$: Observable<string | null> = this.selectedContestSubject.asObservable();

  constructor() {}

  private loadInitialContest(): string | null {
    return sessionStorage.getItem('selectedPublicContest');
    // Or localStorage.getItem if you want it to persist across browser sessions
  }

  setSelectedContest(contestId: string | null): void {
    if (contestId) {
      sessionStorage.setItem('selectedPublicContest', contestId);
      // Or localStorage.setItem
    } else {
      sessionStorage.removeItem('selectedPublicContest');
      // Or localStorage.removeItem
    }
    this.selectedContestSubject.next(contestId);
  }

  getCurrentSelectedContest(): string {
    return this.selectedContestSubject.getValue() || '';
  }
}