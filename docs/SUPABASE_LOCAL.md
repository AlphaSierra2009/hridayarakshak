Local Supabase & Mock Setup

Overview

This project can run against a real Supabase project or a built-in mock client used for local development when env vars are not set. The mock prevents DNS/network errors and provides helpers for emitting realtime events during development.

1) Use real Supabase (recommended)

- Create a `.env` file at the project root with these variables:

VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key"

- Restart the dev server after creating `.env`.

- (Optional) Use the Supabase CLI to run a local emulator for functions and Postgres:

# install (if needed)
npm install -g supabase

# run the local emulator (in project root)
supabase start

See: https://supabase.com/docs/guides/cli

2) Use the built-in mock (no env vars required)

If `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are not set, the app uses a safe mock client at `src/integrations/supabase/client.ts`.

The mock implements common methods used by the app (`from`, `functions.invoke`, `auth.*`, `channel`, `removeChannel`) and exposes a debug helper `__mock.__emit` that lets you simulate realtime events.

How to simulate a realtime `INSERT` for the `alerts-channel` from the browser console:

1. Open the app in the browser (e.g. http://localhost:5174/).
2. Open DevTools Console and run the helper initializer:

window.__supabaseMockEmit = (name, payload) => {
  import('/src/integrations/supabase/client').then(m => {
    if (m && m.supabase && m.supabase.__mock && typeof m.supabase.__mock.__emit === 'function') {
      m.supabase.__mock.__emit(name, payload);
    } else {
      console.warn('Supabase mock not available.');
    }
  });
};

3. Emit a sample alert insert:

window.__supabaseMockEmit('alerts-channel', {
  eventType: 'INSERT',
  new: {
    id: 'mock-1',
    alert_type: 'STEMI',
    stemi_level: 2,
    triggered_at: new Date().toISOString(),
  }
});

You should see the app's realtime handlers react (they call `fetchAlerts` and show notifications if permitted).

3) Notes & troubleshooting

- If you see `useNavigate() may be used only in the context of a <Router>` that means `BrowserRouter` isn't wrapping components that call `useNavigate`. This repo was updated to wrap `App` with `BrowserRouter` (see `src/App.tsx`).

- If you see DNS errors like `net::ERR_NAME_NOT_RESOLVED` pointing at your Supabase URL, confirm the host in `.env` or use the mock to avoid network calls.

Files changed in this fix:
- src/App.tsx (moved BrowserRouter to top-level and added ErrorBoundary)
- src/integrations/supabase/client.ts (now reads env vars and provides a mock fallback)
- src/components/ErrorBoundary.tsx (new ErrorBoundary)

If you'd like, I can also add a small UI button to emit mock events from the app (handy for demos).