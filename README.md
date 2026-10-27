# Contacts

A project to help me store and track my contacts.

## Running

```bash
./start.sh
```

This starts the Flask API and serves the frontend, using the ports in
`config.yaml`. It also regenerates `frontend/.env.local` so the frontend
points at the configured backend port. Then open http://localhost:8902/ (or
whatever port `frontend.port` is set to) in a browser. Ctrl-C stops both
processes.

By default this runs in `dev` mode: the Vite dev server (hot reload, React
StrictMode) and the backend with `--debug` (auto-reloads on code changes).
Pass `--env prod` to instead build the frontend and serve it via
`vite preview`, with the backend running without `--debug`:

```bash
./start.sh --env prod
```

The first time you set this up (or after pulling changes that touch
`frontend/package.json`), install dependencies once:

```bash
cd frontend && npm install
```

### Running manually

1. Start the API:

   ```bash
   python -m contacts serve --port <backend.port from config.yaml>
   ```

2. From `frontend/`, start the dev server:

   ```bash
   npm run dev -- --port <frontend.port from config.yaml>
   ```

3. Make sure `frontend/.env.local` has `VITE_API_BASE_URL` pointing at the
   backend's host/port (edit it by hand, since `start.sh` is what normally
   generates it).
