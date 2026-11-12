import type { Session, TaskStatus, User, VolunteerTask } from "./types";

const apiUrl = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");

interface ApiErrorBody {
  error?: string;
}

async function request<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${apiUrl}${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({})) as ApiErrorBody & T;
  if (!response.ok) throw new Error(body.error || "The request could not be completed.");
  return body;
}

export const api = {
  signIn: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/signin", undefined, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  tasks: (token: string) => request<VolunteerTask[]>("/tasks", token),
  createTask: (token: string, title: string, description: string) =>
    request<VolunteerTask>("/tasks", token, {
      method: "POST",
      body: JSON.stringify({ title, description }),
    }),
  editTask: (token: string, id: string, title: string, description: string) =>
    request<VolunteerTask>(`/tasks/${id}`, token, {
      method: "PUT",
      body: JSON.stringify({ title, description }),
    }),
  deleteTask: (token: string, id: string) =>
    request<{ success: true }>(`/tasks/${id}`, token, { method: "DELETE" }),
  setStatus: (token: string, id: string, status: TaskStatus) =>
    request<VolunteerTask>(`/tasks/${id}/status`, token, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  claim: (token: string, id: string) =>
    request<VolunteerTask>(`/tasks/${id}/claim`, token, { method: "PATCH" }),
  unclaim: (token: string, id: string) =>
    request<VolunteerTask>(`/tasks/${id}/unclaim`, token, { method: "PATCH" }),
};

export type { Session };