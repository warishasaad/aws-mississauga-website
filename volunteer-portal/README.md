# Volunteer Portal

An isolated React/Vite frontend and Express API for volunteer task management. Both applications use in-memory mock data; restarting the backend resets task changes and sessions.

## Requirements

- Node.js 20 or newer
- npm

## Start the backend

```bash
cd backend
npm install
npm run dev
```

The API listens on `http://localhost:3001` by default. Override the port with `PORT` and the allowed frontend origin with `FRONTEND_ORIGIN`.

## Start the frontend

In a second terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`). Set `VITE_API_URL` in `.env` to the backend base URL if it differs from `http://localhost:3001`.

## Mock accounts

| Role | Email | Password |
|---|---|---|
| Volunteer | `alex.volunteer@example.com` | `Volunteer123!` |
| Volunteer | `sam.volunteer@example.com` | `Volunteer123!` |
| Admin | `admin@example.com` | `Admin123!` |

This mock authentication is for local development only. Tokens are opaque in-memory session identifiers, not production credentials or a production authentication design.

## API

- `POST /auth/signin`
- `GET /tasks`
- `POST /tasks` (admin)
- `PUT /tasks/:id` (admin)
- `DELETE /tasks/:id` (admin)
- `PATCH /tasks/:id/claim` (volunteer)
- `PATCH /tasks/:id/unclaim` (volunteer)
- `PATCH /tasks/:id/status` (admin)

All task endpoints except sign-in require `Authorization: Bearer <token>`. Volunteer task lists are filtered by the authenticated user. Admins can transition an already-claimed task to `claimed`, but cannot turn an unassigned task into a claimed task; the claimed status always requires a volunteer identity.