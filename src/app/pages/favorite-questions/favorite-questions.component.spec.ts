import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FavoriteQuestionsComponent } from './favorite-questions.component';

describe('FavoriteQuestionsComponent', () => {
  let component: FavoriteQuestionsComponent;
  let fixture: ComponentFixture<FavoriteQuestionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FavoriteQuestionsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FavoriteQuestionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
