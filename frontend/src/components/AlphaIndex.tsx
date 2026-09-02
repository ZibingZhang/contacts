import { useRef, type PointerEvent as ReactPointerEvent } from "react";

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
    <div
      id="alpha-index"
      className="d-flex flex-column"
      hidden={hidden}
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
      {ALPHA_INDEX_LETTERS.map((letter) => (
        <div
          className={`alpha-index-letter${lettersPresent.has(letter) ? "" : " disabled"}`}
          data-letter={letter}
          key={letter}
        >
          {letter}
        </div>
      ))}
    </div>
  );
}
