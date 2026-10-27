import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import Box from "@mui/material/Box";

const ALPHA_INDEX_LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""), "#"];

interface AlphaIndexProps {
  hidden: boolean;
  lettersPresent: Set<string>;
  onJumpToLetter: (letter: string) => void;
}

function letterFromPoint(clientX: number, clientY: number): string | null {
  const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  const letter = el?.dataset.letter;
  return letter && !el.classList.contains("disabled") ? letter : null;
}

export function AlphaIndex({ hidden, lettersPresent, onJumpToLetter }: AlphaIndexProps) {
  const isDragging = useRef(false);

  function handlePointer(event: ReactPointerEvent) {
    const letter = letterFromPoint(event.clientX, event.clientY);
    if (letter) {
      onJumpToLetter(letter);
    }
  }

  return (
    <Box
      id="alpha-index"
      hidden={hidden}
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: "0 0 16px",
        alignSelf: "flex-start",
        ml: "auto",
        position: "sticky",
        top: "50%",
        transform: "translateY(-50%)",
        py: 0.5,
        touchAction: "none",
        userSelect: "none",
      }}
      onPointerDown={(event) => {
        isDragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        handlePointer(event);
      }}
      onPointerMove={(event) => {
        if (isDragging.current) {
          handlePointer(event);
        }
      }}
      onPointerUp={() => {
        isDragging.current = false;
      }}
      onPointerCancel={() => {
        isDragging.current = false;
      }}
    >
      {ALPHA_INDEX_LETTERS.map((letter) => {
        const disabled = !lettersPresent.has(letter);
        return (
          <Box
            className={disabled ? "disabled" : undefined}
            data-letter={letter}
            key={letter}
            sx={{
              fontSize: "0.6rem",
              lineHeight: 1.2,
              textAlign: "center",
              borderRadius: "2px",
              cursor: disabled ? "default" : "pointer",
              color: disabled ? "divider" : "text.secondary",
              "&:hover": disabled
                ? undefined
                : {
                    color: "common.white",
                    bgcolor: "primary.main",
                  },
            }}
          >
            {letter}
          </Box>
        );
      })}
    </Box>
  );
}
