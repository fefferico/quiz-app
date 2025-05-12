import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuizStudyComponent } from './quiz-study.component';

describe('QuizStudyComponent', () => {
  let component: QuizStudyComponent;
  let fixture: ComponentFixture<QuizStudyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuizStudyComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QuizStudyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
