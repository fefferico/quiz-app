import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuizSetupComponent } from './quiz-setup.component';

describe('QuizSetupComponent', () => {
  let component: QuizSetupComponent;
  let fixture: ComponentFixture<QuizSetupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuizSetupComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QuizSetupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
