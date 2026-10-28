# CLAUDE.md

Guidance for Claude Code when working in this repo.

## Testing / running the app locally

The user often has their own dev instance running via `./start.sh`, using
the ports from `config.yaml` (backend `8901`, frontend `8902`). When you
need to run or test the app yourself:

- Use different ports than the ones in `config.yaml`, so you don't collide
  with the user's running session (e.g. backend `18901`, frontend `18902`).
- Never kill processes on the user's dev ports. `start.sh` kills whatever is
  listening on the configured ports before starting (`kill_port`) — don't
  run it against the default ports, and don't use `lsof`/`kill` yourself to
  free `8901`/`8902`. Assume anything already running there is the user's
  and leave it alone.
- Start the backend directly on an alternate port instead of using
  `start.sh`:
  ```bash
  python -m contacts serve --port 18901
  ```
- Start the frontend directly on an alternate port, pointing it at the
  alternate backend port (don't overwrite `frontend/.env.local` — that's
  what `start.sh` generates for the user's own session):
  ```bash
  VITE_API_BASE_URL=http://127.0.0.1:18901/api \
    npm --prefix frontend run dev -- --port 18902 --strictPort
  ```
- When done testing, stop only the processes you started yourself (by PID),
  never a blanket kill on a port that might belong to the user's session.
