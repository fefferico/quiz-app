import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-simple-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './simple-modal.component.html',
  styleUrls: ['./simple-modal.component.scss']
})
export class SimpleModalComponent {
  @Input() modalId: string = 'simpleModal'; // Unique ID for the modal
  @Input() modalTitle: string = 'Finestra di Dialogo';
  @Input() isOpen: boolean = false;
  @Output() close = new EventEmitter<void>();

  constructor() {}

  closeModal(): void {
    this.isOpen = false;
    this.close.emit();
  }

  // Prevent click inside modal content from closing it
  onContentClick(event: MouseEvent): void {
    event.stopPropagation();
  }
}