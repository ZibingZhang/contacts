# Contacts

A project to help me store and track my contacts.

## Running

```bash
./start.sh
```

This starts the Flask API and the Vite dev server for the frontend, using
the ports in `config.yaml`. It also regenerates `frontend/.env.local` so the
frontend points at the configured backend port. Then open
http://localhost:8080/ (or whatever port `frontend.port` is set to) in a
browser. Ctrl-C stops both processes.

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
