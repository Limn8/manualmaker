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
}: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  return (
    <aside className="step-list">
      <div className="step-list-head">
        스텝 <span className="count">{steps.length}</span>
      </div>
      <div className="step-list-scroll">
        {steps.map((step, i) => (
          <div
            key={step.id}
            className={
              'step-card' +
              (step.id === selectedId ? ' selected' : '') +
              (overIndex === i && dragIndex !== null && dragIndex !== i ? ' drag-over' : '')
            }
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOverIndex(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null && dragIndex !== i) onReorder(dragIndex, i);
              setDragIndex(null);
              setOverIndex(null);
            }}
            onClick={() => onSelect(step.id)}
          >
            <div className="step-thumb">
              <img src={step.image} alt={`스텝 ${i + 1}`} draggable={false} />
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
                  if (confirm(`스텝 ${i + 1}을(를) 삭제할까요?`)) onDelete(step.id);
                }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        <div className="step-add-row">
          <button className="step-add" onClick={onCapture} title="화면 캡처로 스텝 추가">
            🖥️ 캡처
          </button>
          <button className="step-add" onClick={onPaste} title="클립보드 이미지로 스텝 추가">
            📋 붙여넣기
          </button>
          <button className="step-add" onClick={onFile} title="이미지 파일로 스텝 추가">
            📁 파일
          </button>
        </div>
      </div>
    </aside>
  );
}
