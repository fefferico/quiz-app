// src/app/core/services/contest-selection.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Contest } from '../../models/contes.model';
import { AlertService } from '../../services/alert.service';

@Injectable({
  providedIn: 'root'
})
export class ContestSelectionService {
  private selectedContestSubject = new BehaviorSubject<Contest | null>(this.loadInitialContest());
  public selectedContest$: Observable<Contest | null> = this.selectedContestSubject.asObservable();

  constructor(private alertService: AlertService) { }

  private loadInitialContest(): Contest | null {
    const contestString = sessionStorage.getItem('selectedPublicContest');
    if (!contestString) {
      return null;
    }
    try {
      const parsed = JSON.parse(contestString);
      // Basic validation for Contest structure
      if (parsed && typeof parsed.id === 'number' && typeof parsed.name === 'string') {
        return parsed as Contest;
      }
      console.warn('Parsed contest from sessionStorage is not a valid Contest object:', parsed);
      sessionStorage.removeItem('selectedPublicContest'); // Clean up invalid entry
      return null;
    } catch (e) {
      console.error('Failed to parse contest from sessionStorage:', e);
      sessionStorage.removeItem('selectedPublicContest'); // Clean up invalid entry
      return null;
    }
  }

  setSelectedContest(contest: Contest | null): void { // Parameter changed to 'contest' for clarity
    if (contest) {
      sessionStorage.setItem('selectedPublicContest', JSON.stringify(contest));
    } else {
      sessionStorage.removeItem('selectedPublicContest');
    }
    this.selectedContestSubject.next(contest);
  }

  getCurrentSelectedContest(): Contest | null { // Return type changed
    return this.selectedContestSubject.getValue();
  }

  checkForContest(): Contest | null{
    const contest = this.selectedContestSubject.getValue();
    if (contest === null) {
      this.alertService.showAlert("Errore", "Non è stata selezionata alcuna banca dati valida.");
    }
    return contest;
  }
}