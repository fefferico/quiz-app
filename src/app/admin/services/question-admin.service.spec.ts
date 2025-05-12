import { TestBed } from '@angular/core/testing';

import { QuestionAdminService } from './question-admin.service';

describe('QuestionAdminService', () => {
  let service: QuestionAdminService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(QuestionAdminService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
