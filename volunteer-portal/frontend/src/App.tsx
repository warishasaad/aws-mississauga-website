import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
import type { Session, TaskStatus, VolunteerTask } from "./types";

const SESSION_KEY = "volunteer-portal-session";

function readSession(): Session | null {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    return stored ? JSON.parse(stored) as Session : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(readSession);

  function signOut() {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }

  if (!session) {
    return <SignIn onSignedIn={(nextSession) => {
      localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
    }} />;
  }

  return session.user.role === "admin"
    ? <AdminDashboard session={session} onSignOut={signOut} />
    : <VolunteerDashboard session={session} onSignOut={signOut} />;
}

function SignIn({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onSignedIn(await api.signIn(email.trim(), password));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="signin-screen">
      <div className="signin-glow" aria-hidden="true" />
      <section className="signin-wrap">
        <a className="wordmark" href="/" aria-label="AWS User Group Mississauga volunteer portal">
          <span className="wordmark-mark">M</span>
          <span><b>AWS User Group</b><small>MISSISSAUGA · VOLUNTEER PORTAL</small></span>
        </a>
        <div className="signin-content">
          <p className="eyebrow">A little help goes a long way</p>
          <h1>Good things<br /><span>happen together.</span></h1>
          <p className="signin-lede">Sign in to find your next way to make the community stronger.</p>
          <form className="signin-form" onSubmit={submit}>
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-primary signin-submit" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<span aria-hidden="true">↗</span></button>
          </form>
          <p className="signin-foot">Community work, made easier.</p>
        </div>
      </section>
      <aside className="signin-art" aria-label="Volunteer community message">
        <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
        <div className="art-note note-top"><span className="note-dot" /> PEOPLE FIRST <span>01 / 03</span></div>
        <div className="art-copy"><span className="art-index">VOLUNTEER / 2026</span><p>Small acts.<br /><em>Lasting</em><br />community.</p><span className="art-rule" /></div>
        <div className="art-note note-bottom"><span>MISSISSAUGA, ONTARIO</span><span>BUILT BY THE COMMUNITY</span></div>
      </aside>
    </main>
  );
}

function DashboardShell({ session, onSignOut, children, eyebrow, title, description }: {
  session: Session;
  onSignOut: () => void;
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="dashboard">
      <header className="app-header">
        <a className="wordmark" href="/" aria-label="AWS User Group Mississauga home">
          <span className="wordmark-mark">M</span>
          <span><b>AWS User Group</b><small>MISSISSAUGA</small></span>
        </a>
        <div className="account"><span className="avatar">{session.user.email[0].toUpperCase()}</span><span className="account-details"><b>{session.user.email}</b><small>{session.user.role}</small></span><button className="button button-quiet" type="button" onClick={onSignOut}>Sign out</button></div>
      </header>
      <main className="dashboard-main">
        <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div><div className="heading-mark" aria-hidden="true">M<span>·</span></div></div>
        {children}
      </main>
      <footer className="app-footer"><span>AWS USER GROUP MISSISSAUGA</span><span>Show up. Make a difference.</span></footer>
    </div>
  );
}

function useTasks(token: string) {
  const [tasks, setTasks] = useState<VolunteerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      setError("");
      setTasks(await api.tasks(token));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load tasks.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, [token]);
  return { tasks, loading, error, refresh };
}

function VolunteerDashboard({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const { tasks, loading, error, refresh } = useTasks(session.token);
  const [busyTask, setBusyTask] = useState("");
  const [actionError, setActionError] = useState("");
  const available = tasks.filter((task) => task.status === "available");
  const backlog = tasks.filter((task) => task.status === "claimed" && task.claimedBy === session.user.id);

  async function updateTask(task: VolunteerTask, action: "claim" | "unclaim") {
    setBusyTask(task.id);
    setActionError("");
    try {
      await (action === "claim" ? api.claim(session.token, task.id) : api.unclaim(session.token, task.id));
      await refresh();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "The task could not be updated.");
    } finally {
      setBusyTask("");
    }
  }

  return (
    <DashboardShell session={session} onSignOut={onSignOut} eyebrow="Volunteer space" title="Make it happen." description="Choose a task that feels right, or pick up where you left off.">
      {actionError && <p className="alert alert-error" role="alert">{actionError}</p>}
      <div className="volunteer-grid">
        <section className="task-section">
          <SectionHeading index="01" title="Available tasks" count={available.length} />
          {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={() => void refresh()} /> : available.length ? <div className="task-list">{available.map((task) => <VolunteerTaskRow key={task.id} task={task} action="claim" busy={busyTask === task.id} onAction={() => void updateTask(task, "claim")} />)}</div> : <EmptyState title="All caught up" text="There are no open tasks right now. Check back soon." />}
        </section>
        <section className="task-section backlog-section">
          <SectionHeading index="02" title="My backlog" count={backlog.length} />
          {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={() => void refresh()} /> : backlog.length ? <div className="task-list">{backlog.map((task) => <VolunteerTaskRow key={task.id} task={task} action="unclaim" busy={busyTask === task.id} onAction={() => void updateTask(task, "unclaim")} />)}</div> : <EmptyState title="Room to pitch in" text="Claimed tasks will show up here while you work on them." />}
        </section>
      </div>
    </DashboardShell>
  );
}

function VolunteerTaskRow({ task, action, busy, onAction }: { task: VolunteerTask; action: "claim" | "unclaim"; busy: boolean; onAction: () => void }) {
  return (
    <article className="task-row">
      <div className="task-copy"><div className="task-meta"><span className={`status status-${task.status}`}>{task.status}</span><span className="task-id">TASK / {task.id.slice(-4).toUpperCase()}</span></div><h3>{task.title}</h3><p>{task.description}</p></div>
      <button className={`button ${action === "claim" ? "button-primary" : "button-outline"}`} type="button" disabled={busy} onClick={onAction}>{busy ? "Updating…" : action === "claim" ? "Claim task" : "Unclaim"}</button>
    </article>
  );
}

function AdminDashboard({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const { tasks, loading, error, refresh } = useTasks(session.token);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VolunteerTask | null>(null);
  const [actionError, setActionError] = useState("");
  const [busyTask, setBusyTask] = useState("");

  function openCreate() { setEditing(null); setFormOpen(true); }
  function openEdit(task: VolunteerTask) { setEditing(task); setFormOpen(true); }

  async function saveTask(title: string, description: string): Promise<string | null> {
    setActionError("");
    try {
      if (editing) await api.editTask(session.token, editing.id, title, description);
      else await api.createTask(session.token, title, description);
      setFormOpen(false);
      await refresh();
      return null;
    } catch (reason) {
      return reason instanceof Error ? reason.message : "The task could not be saved.";
    }
  }

  async function deleteTask(task: VolunteerTask) {
    if (!window.confirm(`Delete “${task.title}”? This cannot be undone.`)) return;
    setBusyTask(task.id);
    setActionError("");
    try {
      await api.deleteTask(session.token, task.id);
      await refresh();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "The task could not be deleted.");
    } finally {
      setBusyTask("");
    }
  }

  async function changeStatus(task: VolunteerTask, status: TaskStatus) {
    setBusyTask(task.id);
    setActionError("");
    try {
      await api.setStatus(session.token, task.id, status);
      await refresh();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "The status could not be changed.");
      await refresh();
    } finally {
      setBusyTask("");
    }
  }

  const counts = {
    available: tasks.filter((task) => task.status === "available").length,
    claimed: tasks.filter((task) => task.status === "claimed").length,
    completed: tasks.filter((task) => task.status === "completed").length,
  };

  return (
    <DashboardShell session={session} onSignOut={onSignOut} eyebrow="Organizer space" title="Keep good work moving." description="A clear view of every task, from first idea to done.">
      <div className="admin-toolbar"><div className="stat-strip"><Stat label="Available" value={counts.available} tone="available" /><Stat label="Claimed" value={counts.claimed} tone="claimed" /><Stat label="Completed" value={counts.completed} tone="completed" /></div><button className="button button-primary create-button" type="button" onClick={openCreate}><span aria-hidden="true">＋</span> New task</button></div>
      {actionError && <p className="alert alert-error" role="alert">{actionError}</p>}
      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={() => void refresh()} /> : tasks.length ? <section className="admin-task-table" aria-label="All volunteer tasks"><div className="table-head"><span>Task</span><span>Status</span><span>Volunteer</span><span>Actions</span></div>{tasks.map((task) => <article className="admin-task-row" key={task.id}><div className="admin-task-copy"><span className="task-id">TASK / {task.id.slice(-4).toUpperCase()}</span><h3>{task.title}</h3><p>{task.description}</p></div><label className="status-select-label"><span className="visually-hidden">Status for {task.title}</span><select value={task.status} disabled={busyTask === task.id} onChange={(event) => void changeStatus(task, event.target.value as TaskStatus)}><option value="available">Available</option><option value="claimed" disabled={!task.claimedBy}>Claimed</option><option value="completed">Completed</option></select></label><span className="volunteer-name">{task.claimedBy ? task.claimedBy === session.user.id ? "You" : task.claimedBy : "—"}</span><div className="admin-actions"><button className="text-action" type="button" onClick={() => openEdit(task)}>Edit</button><button className="text-action danger-action" type="button" disabled={busyTask === task.id} onClick={() => void deleteTask(task)}>Delete</button></div></article>)}</section> : <EmptyState title="No tasks yet" text="Create the first task to get the community moving." action={<button className="button button-primary" type="button" onClick={openCreate}>Create a task</button>} />}
      {formOpen && <TaskForm task={editing} onClose={() => setFormOpen(false)} onSave={saveTask} />}
    </DashboardShell>
  );
}

function TaskForm({ task, onClose, onSave }: { task: VolunteerTask | null; onClose: () => void; onSave: (title: string, description: string) => Promise<string | null> }) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(await onSave(title.trim(), description.trim()) || "");
    setBusy(false);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="task-modal" role="dialog" aria-modal="true" aria-labelledby="task-form-title">
        <div className="modal-heading"><div><p className="eyebrow">{task ? "Task details" : "Add to the board"}</p><h2 id="task-form-title">{task ? "Edit task" : "Create a task"}</h2></div><button className="close-button" type="button" aria-label="Close" onClick={onClose}>×</button></div>
        <form className="task-form" onSubmit={(event) => void submit(event)}><label htmlFor="task-title">Title</label><input id="task-title" required maxLength={120} value={title} onChange={(event) => { setTitle(event.target.value); setError(""); }} placeholder="What needs doing?" /><label htmlFor="task-description">Description</label><textarea id="task-description" required maxLength={1000} rows={5} value={description} onChange={(event) => { setDescription(event.target.value); setError(""); }} placeholder="Add a little context for the volunteer…" />{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : task ? "Save changes" : "Create task"}</button></div></form>
      </section>
    </div>
  );
}

function SectionHeading({ index, title, count }: { index: string; title: string; count: number }) {
  return <div className="section-heading"><span className="section-index">{index}</span><h2>{title}</h2><span className="count-badge">{count}</span></div>;
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="stat"><span className={`stat-dot status-${tone}`} /><span className="stat-value">{value}</span><span className="stat-label">{label}</span></div>;
}

function Loading() {
  return <div className="loading-state" role="status"><span className="spinner" /> Loading tasks…</div>;
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="empty-state error-state"><p>{message}</p><button className="text-action" type="button" onClick={onRetry}>Try again</button></div>;
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return <div className="empty-state"><span className="empty-mark" aria-hidden="true">✳</span><h3>{title}</h3><p>{text}</p>{action}</div>;
}