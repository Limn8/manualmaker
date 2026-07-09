import { useEffect, useRef, useState } from 'react';

interface Props {
  image: string;
  onDone: (image: string) => void;
  onClose: () => void;
}

interface Sel {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export default function CropModal({ image, onDone, onClose }: Props) {
  const [sel, setSel] = useState<Sel | null>(null);
  const [dragging, setDragging] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function norm(e: React.PointerEvent): { x: number; y: number } {
    const rect = wrapRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointer capture is best-effort (can fail for synthetic events)
    }
    const p = norm(e);
    setSel({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || !sel) return;
    const p = norm(e);
    setSel({ ...sel, x2: p.x, y2: p.y });
  }

  function onPointerUp() {
    setDragging(false);
    if (sel) {
      const w = Math.abs(sel.x2 - sel.x1);
      const h = Math.abs(sel.y2 - sel.y1);
      if (w < 0.02 || h < 0.02) setSel(null);
    }
  }

  function confirm(cropped: boolean) {
    if (!cropped || !sel) {
      onDone(image);
      return;
    }
    const img = imgRef.current!;
    const x = Math.min(sel.x1, sel.x2) * img.naturalWidth;
    const y = Math.min(sel.y1, sel.y2) * img.naturalHeight;
    const w = Math.abs(sel.x2 - sel.x1) * img.naturalWidth;
    const h = Math.abs(sel.y2 - sel.y1) * img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);
    onDone(canvas.toDataURL('image/png'));
  }

  const selStyle = sel
    ? {
        left: `${Math.min(sel.x1, sel.x2) * 100}%`,
        top: `${Math.min(sel.y1, sel.y2) * 100}%`,
        width: `${Math.abs(sel.x2 - sel.x1) * 100}%`,
        height: `${Math.abs(sel.y2 - sel.y1) * 100}%`,
      }
    : undefined;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal capture-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>사용할 영역 선택</h3>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="crop-hint">
          드래그해서 사용할 영역을 선택하세요. 선택하지 않으면 전체 이미지가 사용됩니다.
        </p>
        <div
          className="crop-stage"
          ref={wrapRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <img ref={imgRef} src={image} alt="캡처" draggable={false} />
          {sel && selStyle && <div className="crop-sel" style={selStyle} />}
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>
            취소
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={() => confirm(false)}>
            전체 사용
          </button>
          <button className="btn primary" disabled={!sel} onClick={() => confirm(true)}>
            선택 영역 사용
          </button>
        </div>
      </div>
    </div>
  );
}
