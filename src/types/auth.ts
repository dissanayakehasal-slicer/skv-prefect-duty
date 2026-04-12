export type UserRole = 'admin' | 'duty_editor' | 'viewer';

export interface AuthSession {
  userId: string;
  username: string;
  role: UserRole;
}

export interface StoredAccount {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
}
