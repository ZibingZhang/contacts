import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { runQuery, runReadonlyQuery, ApiError } from "../api";
import type { QueryResult } from "../types";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import InputBase from "@mui/material/InputBase";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";

type Mode = "readonly" | "write";

interface LogEntry {
  id: number;
  mode: Mode;
  sql: string;
  result?: QueryResult;
  error?: string;
}

interface AdminConsoleModalProps {
  onClose: () => void;
}

let nextEntryId = 0;

export function AdminConsoleModal({ onClose }: AdminConsoleModalProps) {
  const [mode, setMode] = useState<Mode>("readonly");
  const [confirmingWriteMode, setConfirmingWriteMode] = useState(false);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-focuses the input once it stops being disabled -- being disabled while
  // a query runs blurs it, and nothing else would put focus back afterward.
  useEffect(() => {
    if (!isRunning) {
      inputRef.current?.focus();
    }
  }, [isRunning]);

  function scrollLogToBottom() {
    requestAnimationFrame(() => {
      logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
    });
  }

  async function runCurrentInput() {
    const sql = input.trim();
    if (!sql || isRunning) return;

    setHistory((prev) => [...prev, sql]);
    setHistoryIndex(null);
    setInput("");
    setIsRunning(true);

    const entryId = nextEntryId++;
    const entryMode = mode;
    setEntries((prev) => [...prev, { id: entryId, mode: entryMode, sql }]);
    scrollLogToBottom();

    try {
      const result = entryMode === "write" ? await runQuery(sql) : await runReadonlyQuery(sql);
      setEntries((prev) => prev.map((entry) => (entry.id === entryId ? { ...entry, result } : entry)));
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Request failed";
      setEntries((prev) => prev.map((entry) => (entry.id === entryId ? { ...entry, error: message } : entry)));
    } finally {
      setIsRunning(false);
      scrollLogToBottom();
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      runCurrentInput();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (history.length === 0) return;
      const nextIndex = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInput(history[nextIndex]);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (historyIndex === null) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= history.length) {
        setHistoryIndex(null);
        setInput("");
      } else {
        setHistoryIndex(nextIndex);
        setInput(history[nextIndex]);
      }
    }
  }

  function handleModeChange(_event: unknown, newMode: Mode | null) {
    if (newMode === null || newMode === mode) return;
    if (newMode === "write") {
      setConfirmingWriteMode(true);
    } else {
      setMode("readonly");
    }
  }

  const prompt = mode === "write" ? "#" : ">";

  return (
    <Dialog
      id="admin-console-modal"
      open
      onClose={onClose}
      fullScreen
      // Dialog's own focus-trap management runs on open and can steal focus
      // back from the input's `autoFocus` -- onEntered fires once that's
      // settled, so focusing here actually sticks.
      slotProps={{ transition: { onEntered: () => inputRef.current?.focus() } }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Box sx={{ flexGrow: 1 }}>Admin console</Box>
        <ToggleButtonGroup size="small" value={mode} exclusive onChange={handleModeChange}>
          <ToggleButton value="readonly">Read-only</ToggleButton>
          <ToggleButton value="write">Write</ToggleButton>
        </ToggleButtonGroup>
        <IconButton aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      {mode === "write" && (
        <Box sx={{ px: 2, py: 0.5, bgcolor: "warning.main", color: "warning.contrastText" }}>
          <Typography variant="body2">
            Write mode is on — queries can modify or delete data permanently.
          </Typography>
        </Box>
      )}

      <DialogContent sx={{ display: "flex", flexDirection: "column", p: 0, bgcolor: "background.default" }}>
        <Box ref={logRef} sx={{ flexGrow: 1, overflow: "auto", p: 2, fontFamily: "monospace" }}>
          {entries.map((entry) => (
            <Box key={entry.id} sx={{ mb: 2 }}>
              <Typography
                component="div"
                sx={{ color: entry.mode === "write" ? "error.main" : "success.main", whiteSpace: "pre-wrap" }}
              >
                {entry.mode === "write" ? "#" : ">"} {entry.sql}
              </Typography>
              {entry.error && (
                <Typography component="div" color="error.main" sx={{ whiteSpace: "pre-wrap" }}>
                  {entry.error}
                </Typography>
              )}
              {entry.result && <QueryResultView result={entry.result} />}
              {!entry.error && !entry.result && (
                <Typography component="div" color="text.secondary">
                  Running…
                </Typography>
              )}
            </Box>
          ))}
        </Box>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            borderTop: 1,
            borderColor: "divider",
            px: 2,
            py: 1,
          }}
        >
          <Typography component="span" sx={{ color: mode === "write" ? "error.main" : "success.main", fontFamily: "monospace" }}>
            {prompt}
          </Typography>
          <InputBase
            id="admin-console-input"
            inputRef={inputRef}
            autoFocus
            fullWidth
            disabled={isRunning}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleInputKeyDown}
            sx={{ fontFamily: "monospace", fontSize: "0.95rem" }}
          />
        </Box>
      </DialogContent>

      <Dialog id="admin-console-write-mode-confirm" open={confirmingWriteMode} onClose={() => setConfirmingWriteMode(false)} maxWidth="sm">
        <DialogTitle>Enable write mode?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">Queries can modify or delete data permanently.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmingWriteMode(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => {
              setMode("write");
              setConfirmingWriteMode(false);
            }}
          >
            Enable write mode
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}

function QueryResultView({ result }: { result: QueryResult }) {
  if (result.columns === null) {
    return (
      <Typography component="div" color="text.primary">
        {result.rowcount} row{result.rowcount === 1 ? "" : "s"} affected
      </Typography>
    );
  }

  return (
    <Box sx={{ overflowX: "auto" }}>
      <Box component="table" sx={{ borderCollapse: "collapse", fontSize: "0.85rem", mt: 0.5 }}>
        <Box component="thead">
          <Box component="tr">
            {result.columns.map((column) => (
              <Box
                component="th"
                key={column}
                sx={{ border: 1, borderColor: "divider", px: 1, py: 0.5, textAlign: "left", color: "primary.main" }}
              >
                {column}
              </Box>
            ))}
          </Box>
        </Box>
        <Box component="tbody">
          {(result.rows ?? []).map((row, rowIndex) => (
            <Box component="tr" key={rowIndex}>
              {row.map((value, columnIndex) => (
                <Box
                  component="td"
                  key={columnIndex}
                  sx={{ border: 1, borderColor: "divider", px: 1, py: 0.5, color: "text.primary" }}
                >
                  {formatCellValue(value)}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {result.truncated ? `Showing first ${result.rows?.length ?? 0} rows.` : `${result.rowcount} row${result.rowcount === 1 ? "" : "s"}`}
      </Typography>
    </Box>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null) return "NULL";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
