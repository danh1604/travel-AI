import type { AccountAdminRepository } from "./account-admin.js";
import type { SavedPlanRepository } from "../trips/repository.js";
import type { KnowledgeRepository } from "../rag/store.js";
import type { ReviewRepository } from "../reviews/repository.js";
export type Role = "USER" | "ADMIN";
export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};
export type AuthUser = PublicUser & { passwordHash: string | null };
export type SessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};
export interface AuthRepository extends AccountAdminRepository, SavedPlanRepository, KnowledgeRepository, ReviewRepository {
  findByEmail(email: string): Promise<AuthUser | null>;
  register(user: AuthUser, session: SessionRecord): Promise<void>;
  createSession(session: SessionRecord, previousHash?: string): Promise<void>;
  findSession(tokenHash: string, now: Date): Promise<PublicUser | null>;
  deleteSession(tokenHash: string): Promise<void>;
  promoteAdmin(email: string): Promise<boolean>;
  countUsers(): Promise<number>;
  close(): Promise<void>;
}
export class DuplicateEmail extends Error {}
export function publicUser(user: AuthUser | PublicUser): PublicUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
