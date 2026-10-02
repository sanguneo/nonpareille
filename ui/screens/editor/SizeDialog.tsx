import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Button, Field } from "../../components/index.ts";
import { MAX_EDIT_SIZE } from "./store.ts";

const QUICK_SIZES = [8, 16, 32, 64] as const;

export interface SizeDialogProps {
  width: number;
  height: number;
  onClose: () => void;
  onCreate: (width: number, height: number) => void;
}

function parseSize(value: string): number | null {
  const size = Number(value);
  return Number.isInteger(size) && size >= 1 && size <= MAX_EDIT_SIZE ? size : null;
}

/** Modal "new canvas" dialog; mount it to open, it closes itself through onClose. */
export function SizeDialog({ width, height, onClose, onCreate }: SizeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [w, setW] = useState(String(width));
  const [h, setH] = useState(String(height));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextWidth = parseSize(w);
    const nextHeight = parseSize(h);
    if (nextWidth === null || nextHeight === null) {
      setError(`가로·세로는 1부터 ${MAX_EDIT_SIZE}까지의 정수여야 해요.`);
      return;
    }
    onCreate(nextWidth, nextHeight);
  };

  return (
    <dialog ref={dialogRef} className="editor_dialog" aria-labelledby={titleId} onClose={onClose}>
      <form className="editor_dialog_card" onSubmit={submit}>
        <div className="card_head_text">
          <h2 id={titleId} className="card_title">
            새 캔버스
          </h2>
          <p className="card_desc">가로·세로 도트 수를 정합니다. 지금 그림은 지워지고 팔레트는 그대로 남아요.</p>
        </div>
        <div className="cluster" role="group" aria-label="자주 쓰는 크기">
          {QUICK_SIZES.map((size) => (
            <Button
              key={size}
              variant="ghost"
              size="sm"
              aria-pressed={w === String(size) && h === String(size)}
              onClick={() => {
                setW(String(size));
                setH(String(size));
                setError(null);
              }}
            >
              {size} × {size}
            </Button>
          ))}
        </div>
        <div className="editor_dialog_fields">
          <Field label="가로 (W)">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_EDIT_SIZE}
              value={w}
              onChange={(event) => setW(event.target.value)}
              required
            />
          </Field>
          <Field label="세로 (H)">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_EDIT_SIZE}
              value={h}
              onChange={(event) => setH(event.target.value)}
              required
            />
          </Field>
        </div>
        {error ? (
          <p className="field_error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="cluster editor_dialog_actions">
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button type="submit">만들기</Button>
        </div>
      </form>
    </dialog>
  );
}
