import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SetupModalComponent } from './setup-modal.component';

describe('SetupModalComponent', () => {
  let component: SetupModalComponent;
  let fixture: ComponentFixture<SetupModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SetupModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SetupModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
