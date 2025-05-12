import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuestionFeedbackComponent } from './question-feedback.component';

describe('QuestionFeedbackComponent', () => {
  let component: QuestionFeedbackComponent;
  let fixture: ComponentFixture<QuestionFeedbackComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuestionFeedbackComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QuestionFeedbackComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
