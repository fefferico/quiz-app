// src/app/app.component.ts
import { Component, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router'; // Import RouterLink
import { DatabaseService } from './core/services/database.service';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faMoon, faSun, IconDefinition } from '@fortawesome/free-solid-svg-icons';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, CommonModule, FontAwesomeModule], // Add RouterLink
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  currentYear = new Date().getFullYear();
  faMoon = faMoon;
  faSun = faSun;
  icon: IconDefinition = faMoon;
  modeString: string = 'Attiva Mode scura';


  constructor(private dbService: DatabaseService) {
    this.icon = faMoon;
    console.log('AppComponent constructor: DatabaseService injected.');
  }

  ngOnInit(): void {
    console.log('AppComponent ngOnInit: DatabaseService is available.');
    this.dbService.getAllQuestions().then(questions => {
      console.log('AppComponent: Initial questions count from DB:', questions.length);
    }).catch(err => {
      console.error('AppComponent: Error fetching initial questions:', err);
    });

    const root = document.documentElement;
    // Get the toggle button
    const toggle = document.getElementById("toggle");
    const toggleIcon = document.getElementById("modeIcon");
    // Get the user's preference from localStorage
    const darkMode = localStorage.getItem("dark-mode");
    // Check if the user has already chosen a theme
    if (darkMode) {
      // If yes, apply it to the root element
      root.classList.add("dark-theme");
      if (toggle) {
        this.modeString = "Attiva modalità chiara";
        this.icon = faSun;
      }
    }
  }

  listenForModeToggleClick(): void {
    const root = document.documentElement;
    const toggle = document.getElementById("toggle");
    const toggleIcon = document.getElementById("modeIcon");
    root.classList.toggle("dark-theme");
    if (root.classList.contains("dark-theme")) {
      localStorage.setItem("dark-mode", "true");
      if (toggle) {
        this.modeString = "Attiva modalità chiara";
      }
      this.icon = faSun;
    } else {
      if (toggle) {
        this.modeString = "Attiva modalità scura";
      }
      localStorage.removeItem("dark-mode");
      this.icon = faMoon;
    }
  }
}