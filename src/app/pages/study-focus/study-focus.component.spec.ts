import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StudyFocusComponent } from './study-focus.component';

describe('StudyFocusComponent', () => {
  let component: StudyFocusComponent;
  let fixture: ComponentFixture<StudyFocusComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudyFocusComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StudyFocusComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
