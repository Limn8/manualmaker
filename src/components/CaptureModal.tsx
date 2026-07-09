import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  onDone: (image: string) => void;
  onClose: () => void;
}

interface Sel {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export default function CaptureModal({ onDone, onClose }: Props) {
  const [image, setImage] = useState<string | null>(null);
  const [sel, setSel] = useState<Sel | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Paste handler (works in both stages: replaces current image)
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            readFile(file);
            e.preventDefault();
            return;
          }
        }
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const readFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setImage(String(reader.result));
      setSel(null);
    };
    reader.readAsDataURL(file);
  }, []);

  async function captureScreen() {
    setBusy(true);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      // give the stream a moment to deliver a clean frame
      await new Promise((r) => setTimeout(r, 400));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0);
      stream.getTracks().forEach((t) => t.stop());
      setImage(canvas.toDataURL('image/png'));
      setSel(null);
    } catch (err) {
      if ((err as DOMException)?.name !== 'NotAllowedError') {
        alert('화면 캡처에 실패했습니다: ' + (err instanceof Error ? err.message : String(err)));
      }
    } finally {
      setBusy(false);
    }
  }

  async function pasteFromClipboard() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) {
          const blob = await item.getType(type);
          readFile(new File([blob], 'clipboard.png', { type }));
          return;
        }
      }
      alert('클립보드에 이미지가 없습니다. 먼저 화면을 캡처(예: Win+Shift+S)한 뒤 다시 시도하세요.');
    } catch {
      alert('클립보드를 읽을 수 없습니다. 이 창에서 Ctrl+V 로 직접 붙여넣어 보세요.');
    }
  }

  // --- Crop selection ---
  function norm(e: React.PointerEvent): { x: number; y: number } {
    const rect = wrapRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!image) return;
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
    if (!image) return;
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
          <h3>{image ? '사용할 영역 선택' : '스크린샷 가져오기'}</h3>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {!image ? (
          <div
            className="capture-pick"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f && f.type.startsWith('image/')) readFile(f);
            }}
          >
            <button className="capture-card" onClick={captureScreen} disabled={busy}>
              <span className="capture-emoji">🖥️</span>
              <b>화면 캡처</b>
              <span>브라우저의 화면 공유로 원하는 창/화면을 캡처합니다</span>
            </button>
            <button className="capture-card" onClick={pasteFromClipboard}>
              <span className="capture-emoji">📋</span>
              <b>클립보드 붙여넣기</b>
              <span>
                Win+Shift+S 등으로 캡처 후 클릭하거나
                <br />이 창에서 Ctrl+V
              </span>
            </button>
            <label className="capture-card">
              <span className="capture-emoji">📁</span>
              <b>파일 업로드</b>
              <span>이미지 파일을 선택하거나 여기로 드래그</span>
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) readFile(f);
                }}
              />
            </label>
          </div>
        ) : (
          <>
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
              <button className="btn ghost" onClick={() => setImage(null)}>
                ← 다시 가져오기
              </button>
              <div style={{ flex: 1 }} />
              <button className="btn" onClick={() => confirm(false)}>
                전체 사용
              </button>
              <button className="btn primary" disabled={!sel} onClick={() => confirm(true)}>
                선택 영역 사용
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
