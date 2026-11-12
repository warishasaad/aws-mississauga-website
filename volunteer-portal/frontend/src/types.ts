export type UserRole = "volunteer" | "admin";
export type TaskStatus = "available" | "claimed" | "completed";

export interface User {
  id: string;
  email: string;
  role: UserRole;
}

export interface Session {
  token: string;
  user: User;
}

export interface VolunteerTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  claimedBy: string | null;
}