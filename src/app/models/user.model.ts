// src/app/models/question.model.ts

export interface User {
  id?: number;
  username?: string;
  hashedPassword?: string;
  displayName?: string;
  isActive?: boolean;
  roles?: Role[]
}


export interface Role {
  id?: number;
  name?: string;
  createdAt?: Date;
  isActive?: boolean;
}