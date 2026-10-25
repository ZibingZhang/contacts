import { useState } from "react";
import type { SyncRequiresVerification } from "../types";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";

interface SyncVerificationModalProps {
  challenge: SyncRequiresVerification;
  onCancel: () => void;
  onSelectDevice: (deviceIndex: number) => Promise<void>;
  onSubmitCode: (code: string) => Promise<void>;
}

export function SyncVerificationModal({
  challenge,
  onCancel,
  onSelectDevice,
  onSubmitCode,
}: SyncVerificationModalProps) {
  const [step, setStep] = useState<"device" | "code">(
    challenge.verification_kind === "device_and_code" ? "device" : "code"
  );
  const [selectedDevice, setSelectedDevice] = useState<number | null>(null);
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendCode() {
    if (selectedDevice === null || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSelectDevice(selectedDevice);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send verification code");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyCode() {
    if (!code.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmitCode(code.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify code");
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog id="sync-verification-modal" open onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>
        iCloud verification required
        <IconButton
          aria-label="Close"
          onClick={onCancel}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {step === "device" ? (
          <>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Pick a trusted device to receive a verification code.
            </Typography>
            <RadioGroup
              value={selectedDevice ?? ""}
              onChange={(event) => setSelectedDevice(Number(event.target.value))}
            >
              {challenge.devices.map((device, index) => (
                <FormControlLabel key={index} value={index} control={<Radio />} label={device} />
              ))}
            </RadioGroup>
          </>
        ) : (
          <>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Enter the verification code sent to your trusted device.
            </Typography>
            <TextField
              id="sync-verification-code"
              fullWidth
              autoFocus
              placeholder="123456"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleVerifyCode();
              }}
            />
          </>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        {step === "device" ? (
          <Button
            variant="contained"
            onClick={handleSendCode}
            disabled={selectedDevice === null || isSubmitting}
          >
            {isSubmitting ? "Sending…" : "Send code"}
          </Button>
        ) : (
          <Button variant="contained" onClick={handleVerifyCode} disabled={!code.trim() || isSubmitting}>
            {isSubmitting ? "Verifying…" : "Verify"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
