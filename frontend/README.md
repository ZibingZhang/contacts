# Contacts web UI

A vanilla JS + Bootstrap frontend for the `contacts` app. View-only for now.

## Running

From the repo root:

```bash
./start.sh
```

This starts the Flask API and a static file server for this directory (the
frontend can't be opened directly via `file://` — browsers block `fetch()`
calls to `http://` origins from `file://` pages), using the ports in
`config.yaml`. It also regenerates `js/config.js` so the frontend points at
the configured backend port. Then open http://localhost:8080/ (or whatever
port `frontend.port` is set to) in a browser. Ctrl-C stops both processes.

### Running manually

1. From the repo root, start the API:

   ```bash
   python -m contacts serve --port <backend.port from config.yaml>
   ```

2. From this directory, serve the frontend:

   ```bash
   python -m http.server <frontend.port from config.yaml>
   ```

3. Make sure `js/config.js` has `API_BASE_URL` pointing at the backend's
   host/port (edit it by hand, since `start.sh` is what normally generates
   it).
