import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";

interface DialogCloseButtonProps {
  onClick: () => void;
}

export default function DialogCloseButton({ onClick }: DialogCloseButtonProps) {
  return (
    <IconButton aria-label="Close" onClick={onClick} sx={{ position: "absolute", right: 8, top: 8 }}>
      <CloseIcon />
    </IconButton>
  );
}
