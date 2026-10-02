import { useEffect, useId, useState } from "react";
import { hashSeed, mulberry32 } from "../../../src/core/prng.ts";
import type { DotDocument, DotGrid } from "../../../src/core/types.ts";
import { documentToGrid } from "../../../src/io/project.ts";
import { createDoc, listMasks, procgen } from "../../api.ts";
import { Button, Card, Field, PixelCanvas, Segmented, showToast } from "../../components/index.ts";
import { openInEditor } from "../../state.ts";
import { errorMessage, type Loadable } from "./shared.ts";

const COUNT = 8;
const SEED_RANGE = 1_000_000;
/** Target tile canvas size in px; the dot scale is the largest integer that fits. */
const TILE_PX = 96;
const MASK_LABELS: Record<string, string> = { spaceship: "우주선", dragon: "용", robot: "로봇" };

const maskLabel = (mask: string): string => MASK_LABELS[mask] ?? mask;
const tileScale = (grid: DotGrid): number => Math.max(1, Math.floor(TILE_PX / Math.max(grid.width, grid.height)));
/** Seeds come from the engine PRNG, never Math.random: a fresh one per visit, then a deterministic chain. */
const initialSeed = (): number => hashSeed(String(Date.now())) % SEED_RANGE;
const nextSeed = (seed: number): number => Math.floor(mulberry32(seed)() * SEED_RANGE);

interface Batch {
  mask: string;
  seed: number;
  docs: DotDocument[];
  grids: DotGrid[];
}

export interface ProcgenStripProps {
  /** Called with the new document id after a sprite is saved to the gallery. */
  onSaved: (id: string) => void;
}

/** "절차 생성" strip: mask + seed -> eight Bollinger sprites; pick one to save or open. */
export function ProcgenStrip({ onSaved }: ProcgenStripProps) {
  const seedId = useId();
  const [masks, setMasks] = useState<Loadable<string[]>>({ status: "loading" });
  const [mask, setMask] = useState("");
  const [seed, setSeed] = useState(initialSeed);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    listMasks().then(
      (list) => {
        if (!alive) return;
        setMasks({ status: "ready", value: list });
        setMask((current) => current || list[0] || "");
      },
      (error: unknown) => alive && setMasks({ status: "error", message: errorMessage(error) }),
    );
    return () => {
      alive = false;
    };
  }, []);

  const generate = async () => {
    if (!mask) return;
    setGenerating(true);
    try {
      const { documents } = await procgen({ mask, seed, count: COUNT });
      setBatch({ mask, seed, docs: documents, grids: documents.map((doc) => documentToGrid(doc)) });
      setPicked(null);
    } catch (error) {
      showToast(`생성하지 못했어요: ${errorMessage(error)}`, "danger");
    } finally {
      setGenerating(false);
    }
  };

  const pickedDoc = batch !== null && picked !== null ? batch.docs[picked] : undefined;
  const pickedName = batch !== null && picked !== null ? `${maskLabel(batch.mask)} ${batch.seed + picked}` : "";

  const save = async () => {
    if (!pickedDoc) return;
    setSaving(true);
    try {
      const { id } = await createDoc(pickedDoc, pickedName);
      showToast("갤러리에 저장했어요", "ok");
      onSaved(id);
    } catch (error) {
      showToast(`저장하지 못했어요: ${errorMessage(error)}`, "danger");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      as="section"
      title="절차 생성"
      description="마스크와 시드만 고르면 작은 스프라이트 8장을 바로 만들어요. 마음에 드는 하나를 저장하거나 에디터로 가져가세요."
    >
      <div className="procgen_controls">
        <Field label="마스크" group>
          {masks.status === "ready" ? (
            <Segmented
              aria-label="마스크 종류"
              options={masks.value.map((value) => ({ value, label: maskLabel(value) }))}
              value={mask}
              onChange={setMask}
            />
          ) : masks.status === "error" ? (
            <p className="field_error" role="alert">
              마스크 목록을 불러오지 못했어요: {masks.message}
            </p>
          ) : (
            <p className="field_hint">마스크 목록을 불러오는 중…</p>
          )}
        </Field>
        <Field label="시드" htmlFor={seedId}>
          <div className="procgen_seed_row">
            <input
              id={seedId}
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={seed}
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                setSeed(Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);
              }}
            />
            <Button variant="ghost" size="sm" onClick={() => setSeed(nextSeed(seed))}>
              다른 시드
            </Button>
          </div>
        </Field>
        <Button onClick={generate} disabled={generating || !mask}>
          {generating ? "만드는 중…" : `${COUNT}장 만들기`}
        </Button>
      </div>

      {batch ? (
        <>
          <ul className="procgen_results" aria-label={`${maskLabel(batch.mask)} 생성 결과`}>
            {batch.grids.map((grid, index) => (
              <li key={`${batch.mask}-${batch.seed}-${index}`}>
                <button
                  type="button"
                  className="procgen_tile"
                  aria-pressed={picked === index}
                  aria-label={`${maskLabel(batch.mask)} ${index + 1}번, 시드 ${batch.seed + index}`}
                  onClick={() => setPicked(index)}
                >
                  <PixelCanvas grid={grid} scale={tileScale(grid)} />
                </button>
              </li>
            ))}
          </ul>
          <div className="procgen_pick">
            <span className="procgen_pick_label" aria-live="polite">
              {pickedDoc ? `선택: ${pickedName}` : "한 장을 골라 보세요"}
            </span>
            <Button size="sm" disabled={!pickedDoc || saving} onClick={save}>
              갤러리에 저장
            </Button>
            <Button variant="ghost" size="sm" disabled={!pickedDoc} onClick={() => pickedDoc && openInEditor(pickedDoc)}>
              에디터에서 열기
            </Button>
          </div>
        </>
      ) : null}
    </Card>
  );
}
