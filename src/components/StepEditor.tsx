import { useRef, useState } from 'react';
import type { ActionType, Box, BoxShape, Step } from '../types';
import {
  ACTION_LABELS,
  BOX_COLOR_PRESETS,
  BOX_SHAPE_LABELS,
  DEFAULT_BOX_COLOR,
  DEFAULT_BOX_SHAPE,
  DEFAULT_INFO_DELAY_SEC,
  actionIconSvg,
} from '../types';

interface Props {
  step: Step;
  index: number;
  total: number;
  onChange: (patch: Partial<Step>) => void;
  onRecrop: () => void;
}

interface Edges {
  l: boolean;
  r: boolean;
  t: boolean;
  b: boolean;
}

type Drag =
  | { mode: 'draw'; sx: number; sy: number }
  | { mode: 'move'; offX: number; offY: number; box: Box }
  | { mode: 'resize'; edges: Edges; box: Box };

const HANDLE_PX = 10;

export default function StepEditor({ step, index, total, onChange, onRecrop }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [, forceRender] = useState(0);

  function norm(e: React.PointerEvent): { x: number; y: number } {
    const rect = wrapRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  /** Which resize edges is the pointer near? null if not near any handle. */
  function hitHandle(p: { x: number; y: number }, box: Box): Edges | null {
    const rect = wrapRef.current!.getBoundingClientRect();
    const thX = HANDLE_PX / rect.width;
    const thY = HANDLE_PX / rect.height;
    const nearL = Math.abs(p.x - box.x) < thX;
    const nearR = Math.abs(p.x - (box.x + box.w)) < thX;
    const nearT = Math.abs(p.y - box.y) < thY;
    const nearB = Math.abs(p.y - (box.y + box.h)) < thY;
    const insideX = p.x > box.x - thX && p.x < box.x + box.w + thX;
    const insideY = p.y > box.y - thY && p.y < box.y + box.h + thY;
    const midX = Math.abs(p.x - (box.x + box.w / 2)) < thX;
    const midY = Math.abs(p.y - (box.y + box.h / 2)) < thY;

    // corners
    if (nearL && nearT) return { l: true, t: true, r: false, b: false };
    if (nearR && nearT) return { r: true, t: true, l: false, b: false };
    if (nearL && nearB) return { l: true, b: true, r: false, t: false };
    if (nearR && nearB) return { r: true, b: true, l: false, t: false };
    // edge midpoints
    if (nearL && insideY && midY) return { l: true, r: false, t: false, b: false };
    if (nearR && insideY && midY) return { r: true, l: false, t: false, b: false };
    if (nearT && insideX && midX) return { t: true, l: false, r: false, b: false };
    if (nearB && insideX && midX) return { b: true, l: false, r: false, t: false };
    return null;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointer capture is best-effort (can fail for synthetic events)
    }
    const p = norm(e);
    const box = step.box;
    if (box) {
      const edges = hitHandle(p, box);
      if (edges) {
        dragRef.current = { mode: 'resize', edges, box };
        return;
      }
      if (p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h) {
        dragRef.current = { mode: 'move', offX: p.x - box.x, offY: p.y - box.y, box };
        return;
      }
    }
    dragRef.current = { mode: 'draw', sx: p.x, sy: p.y };
    onChange({ box: { x: p.x, y: p.y, w: 0, h: 0 } });
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const p = norm(e);
    if (drag.mode === 'draw') {
      onChange({
        box: {
          x: Math.min(drag.sx, p.x),
          y: Math.min(drag.sy, p.y),
          w: Math.abs(p.x - drag.sx),
          h: Math.abs(p.y - drag.sy),
        },
      });
    } else if (drag.mode === 'move') {
      const { box } = drag;
      onChange({
        box: {
          ...box,
          x: Math.min(1 - box.w, Math.max(0, p.x - drag.offX)),
          y: Math.min(1 - box.h, Math.max(0, p.y - drag.offY)),
        },
      });
    } else {
      const { box, edges } = drag;
      let x1 = edges.l ? p.x : box.x;
      let x2 = edges.r ? p.x : box.x + box.w;
      let y1 = edges.t ? p.y : box.y;
      let y2 = edges.b ? p.y : box.y + box.h;
      onChange({
        box: {
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          w: Math.abs(x2 - x1),
          h: Math.abs(y2 - y1),
        },
      });
    }
    forceRender((n) => n + 1);
  }

  function onPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    // discard boxes too small to be intentional
    if (step.box && (step.box.w < 0.01 || step.box.h < 0.01)) {
      onChange({ box: drag.mode === 'draw' ? null : drag.box });
    }
  }

  const box = step.box;
  const boxColor = step.boxColor ?? DEFAULT_BOX_COLOR;
  const boxShape = step.boxShape ?? DEFAULT_BOX_SHAPE;
  const boxRadius = boxShape === 'circle' ? '999px' : boxShape === 'rounded' ? '12px' : '2px';
  const showBoxLabel = step.showBoxLabel !== false;

  return (
    <div className="step-editor">
      <div className="editor-toolbar">
        <span className="editor-title">
          단계 {index + 1} / {total}
        </span>
        <span className="editor-hint">
          {box
            ? '박스를 드래그해 이동하거나 모서리로 크기를 조절하세요'
            : '이미지 위에 드래그해서 강조할 영역을 그리세요'}
        </span>
        <button className="btn ghost small" onClick={onRecrop} title="이미지를 확대·축소하여 다시 자르기">
          🔍 이미지 편집
        </button>
        {box && (
          <button className="btn ghost small" onClick={() => onChange({ box: null })}>
            박스 제거
          </button>
        )}
      </div>

      <div className="editor-canvas">
        <div
          className="image-wrap"
          ref={wrapRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <img src={step.image} alt={`단계 ${index + 1}`} draggable={false} />
          {box && box.w > 0 && box.h > 0 && (
            <div
              className="hl-box"
              style={{
                left: `${box.x * 100}%`,
                top: `${box.y * 100}%`,
                width: `${box.w * 100}%`,
                height: `${box.h * 100}%`,
                borderColor: boxColor,
                borderRadius: boxRadius,
                boxShadow: `0 0 0 4px ${boxColor}2e`,
              }}
            >
              <span className="h h-tl" />
              <span className="h h-tr" />
              <span className="h h-bl" />
              <span className="h h-br" />
              <span className="h h-t" />
              <span className="h h-b" />
              <span className="h h-l" />
              <span className="h h-r" />
              {showBoxLabel && (
                <span
                  className="box-tag"
                  style={{ backgroundColor: boxColor }}
                  dangerouslySetInnerHTML={{
                    __html: actionIconSvg(step.action, 13) + '<span>' + ACTION_LABELS[step.action] + '</span>',
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>

      <div className="editor-fields">
        <div className="field">
          <label>동작</label>
          <div className="action-picker">
            {(Object.keys(ACTION_LABELS) as ActionType[]).map((a) => (
              <button
                key={a}
                className={'chip' + (step.action === a ? ' active' : '')}
                onClick={() =>
                  onChange({
                    action: a,
                    infoDelaySec: a === 'info' ? (step.infoDelaySec ?? DEFAULT_INFO_DELAY_SEC) : step.infoDelaySec,
                  })
                }
              >
                {ACTION_LABELS[a]}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>박스 색</label>
          <div className="color-controls">
            {BOX_COLOR_PRESETS.map((color) => (
              <button
                key={color}
                className={'color-swatch' + (boxColor === color ? ' active' : '')}
                style={{ backgroundColor: color }}
                title={color}
                onClick={() => onChange({ boxColor: color })}
              />
            ))}
            <input
              className="color-input"
              type="color"
              value={boxColor}
              onChange={(e) => onChange({ boxColor: e.target.value })}
              title="직접 색 선택"
            />
          </div>
        </div>
        <div className="field">
          <label>박스 모양</label>
          <div className="action-picker">
            {(Object.keys(BOX_SHAPE_LABELS) as BoxShape[]).map((shape) => (
              <button
                key={shape}
                className={'chip' + (boxShape === shape ? ' active' : '')}
                onClick={() => onChange({ boxShape: shape })}
              >
                {BOX_SHAPE_LABELS[shape]}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>설명탭</label>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={showBoxLabel}
              onChange={(e) => onChange({ showBoxLabel: e.target.checked })}
            />
            <span>박스 우측하단 아이콘과 문구 표시</span>
          </label>
        </div>
        {step.action === 'info' && (
          <div className="field">
            <label>대기 시간</label>
            <div className="delay-control">
              <input
                className="delay-input"
                type="number"
                min={1}
                max={30}
                value={step.infoDelaySec ?? DEFAULT_INFO_DELAY_SEC}
                onChange={(e) =>
                  onChange({
                    infoDelaySec: Math.min(30, Math.max(1, Number(e.target.value) || DEFAULT_INFO_DELAY_SEC)),
                  })
                }
              />
              <span>초 뒤 다음 단계</span>
            </div>
          </div>
        )}
        {step.action === 'type' && (
          <div className="field">
            <label>입력할 텍스트</label>
            <input
              className="text-input"
              value={step.typeText ?? ''}
              onChange={(e) => onChange({ typeText: e.target.value })}
              placeholder="사용자가 입력해야 하는 텍스트 (비워두면 아무 텍스트나 허용)"
            />
          </div>
        )}
        <div className="field">
          <label>설명</label>
          <textarea
            className="text-input"
            rows={2}
            value={step.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="이 단계에서 할 일을 설명하세요 (예: 로그인 버튼을 클릭합니다)"
          />
        </div>
      </div>
    </div>
  );
}
