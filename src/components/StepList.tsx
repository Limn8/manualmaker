import { useState } from 'react';
import type { Step } from '../types';
import { ACTION_LABELS } from '../types';

interface Props {
  steps: Step[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  onCapture: () => void;
  onPaste: () => void;
  onFile: () => void;
  onDuplicatePrevious: () => void;
}

export default function StepList({
  steps,
  selectedId,
  onSelect,
  onDelete,
  onReorder,
  onCapture,
  onPaste,
  onFile,
  onDuplicatePrevious,
}: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);

  return (
    <aside className="step-list">
      <div className="step-list-head">
        단계 <span className="count">{steps.length}</span>
      </div>
      <div className="step-list-scroll">
        {steps.map((step, i) => (
          <div
            key={step.id}
            className={
              'step-card' +
              (step.id === selectedId ? ' selected' : '') +
              (insertIndex === i && dragIndex !== null ? ' insert-before' : '') +
              (insertIndex === i + 1 && dragIndex !== null ? ' insert-after' : '')
            }
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragEnd={() => {
              setDragIndex(null);
              setInsertIndex(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              const nextIndex = e.clientY < rect.top + rect.height / 2 ? i : i + 1;
              setInsertIndex(nextIndex);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null && insertIndex !== null) onReorder(dragIndex, insertIndex);
              setDragIndex(null);
              setInsertIndex(null);
            }}
            onClick={() => onSelect(step.id)}
          >
            <div className="step-thumb">
              <img src={step.image} alt={`단계 ${i + 1}`} draggable={false} />
              <span className="step-num">{i + 1}</span>
            </div>
            <div className="step-meta">
              <span className={`action-badge a-${step.action}`}>
                {ACTION_LABELS[step.action]}
              </span>
              <div className="step-desc">{step.description || '설명 없음'}</div>
            </div>
            <div className="step-btns">
              <button
                className="icon-btn"
                title="위로"
                disabled={i === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  onReorder(i, i - 1);
                }}
              >
                ↑
              </button>
              <button
                className="icon-btn"
                title="아래로"
                disabled={i === steps.length - 1}
                onClick={(e) => {
                  e.stopPropagation();
                  onReorder(i, i + 1);
                }}
              >
                ↓
              </button>
              <button
                className="icon-btn danger"
                title="삭제"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`${i + 1}단계를 삭제할까요?`)) onDelete(step.id);
                }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        <div className="step-add-row">
          <button className="step-add" onClick={onCapture} title="화면 캡처로 단계 추가">
            🖥️ 화면 캡처
          </button>
          <button className="step-add" onClick={onPaste} title="클립보드 이미지로 단계 추가">
            📋 클립보드
          </button>
          <button className="step-add" onClick={onFile} title="이미지 파일로 단계 추가">
            📁 파일
          </button>
          <button
            className="step-add"
            onClick={onDuplicatePrevious}
            disabled={steps.length === 0}
            title="현재 단계 또는 마지막 단계를 복사"
          >
            ⧉ 페이지 복사
          </button>
        </div>
      </div>
      <div className="fixed-badges" aria-label="도움말과 제작 정보">
        <a className="fixed-badge manual-badge" href="/manual-maker-manual.html" target="_blank" rel="noreferrer">
          매뉴얼 메이커 매뉴얼
        </a>
        <a className="fixed-badge privacy-link" href="/privacy.html" target="_blank" rel="noreferrer">
          개인정보처리방침
        </a>
        <a className="fixed-badge creator-link" href="https://litt.ly/limn8" target="_blank" rel="noreferrer">
          제작: 경기이음온학교 임현우
        </a>
      </div>
    </aside>
  );
}
