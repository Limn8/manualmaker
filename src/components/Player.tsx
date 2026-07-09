import { useEffect, useState } from 'react';
import type { Project } from '../types';
import {
  ACTION_HINTS,
  ACTION_LABELS,
  DEFAULT_BOX_COLOR,
  DEFAULT_BOX_SHAPE,
  DEFAULT_INFO_DELAY_SEC,
  actionIconSvg,
} from '../types';

interface Props {
  project: Project;
  onClose: () => void;
}

export default function Player({ project, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [wrong, setWrong] = useState(false);
  const steps = project.steps;
  const done = index >= steps.length;
  const step = done ? null : steps[index];
  const boxColor = step?.boxColor ?? DEFAULT_BOX_COLOR;
  const boxShape = step?.boxShape ?? DEFAULT_BOX_SHAPE;
  const boxRadius = boxShape === 'circle' ? '999px' : boxShape === 'rounded' ? '12px' : '2px';
  const infoDelaySec = step?.infoDelaySec ?? DEFAULT_INFO_DELAY_SEC;
  const actionHint =
    step?.action === 'info'
      ? `${infoDelaySec}초 뒤 다음 단계로 넘어갑니다`
      : step
        ? ACTION_HINTS[step.action]
        : '';

  useEffect(() => {
    setTyped('');
    setWrong(false);
  }, [index]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(steps.length, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [steps.length, onClose]);

  useEffect(() => {
    if (!step || step.action !== 'info') return;
    const timeout = window.setTimeout(advance, infoDelaySec * 1000);
    return () => window.clearTimeout(timeout);
  }, [infoDelaySec, step]);

  function advance() {
    setIndex((i) => Math.min(steps.length, i + 1));
  }

  function onBoxAction(e: React.MouseEvent, kind: 'click' | 'dblclick' | 'contextmenu') {
    if (!step) return;
    if (kind === 'contextmenu') e.preventDefault();
    if (
      (step.action === 'click' && kind === 'click') ||
      (step.action === 'doubleclick' && kind === 'dblclick') ||
      (step.action === 'rightclick' && kind === 'contextmenu')
    ) {
      e.stopPropagation();
      advance();
    }
  }

  function submitTyped() {
    if (!step) return;
    const expected = (step.typeText ?? '').trim();
    if (expected && typed.trim() !== expected) {
      setWrong(true);
      return;
    }
    if (!typed.trim() && expected) {
      setWrong(true);
      return;
    }
    advance();
  }

  return (
    <div className="player-overlay">
      <div className="player-top">
        <span className="player-title">{project.title}</span>
        <span className="player-count">
          {done ? '완료' : `${index + 1} / ${steps.length}`}
        </span>
        <button className="icon-btn" onClick={onClose} title="닫기 (Esc)">
          ✕
        </button>
      </div>
      <div className="player-progress">
        <div
          className="player-progress-fill"
          style={{ width: `${(Math.min(index, steps.length) / steps.length) * 100}%` }}
        />
      </div>

      {done ? (
        <div className="player-done">
          <div className="player-done-icon">🎉</div>
          <h2>매뉴얼 완료!</h2>
          <p>{steps.length}개 단계를 모두 마쳤습니다.</p>
          <div className="player-done-btns">
            <button className="btn" onClick={() => setIndex(0)}>
              처음부터 다시
            </button>
            <button className="btn primary" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
      ) : (
        step && (
          <>
            <div className="player-stage">
              <div className="player-image-wrap">
                <img src={step.image} alt={`단계 ${index + 1}`} draggable={false} />
                {step.box && (
                  <div
                    className={
                      'player-box' +
                      (step.action === 'click' ||
                      step.action === 'doubleclick' ||
                      step.action === 'rightclick'
                        ? ' clickable'
                        : '')
                    }
                    style={{
                      left: `${step.box.x * 100}%`,
                      top: `${step.box.y * 100}%`,
                      width: `${step.box.w * 100}%`,
                      height: `${step.box.h * 100}%`,
                      borderColor: boxColor,
                      borderRadius: boxRadius,
                    }}
                    onClick={(e) => onBoxAction(e, 'click')}
                    onDoubleClick={(e) => onBoxAction(e, 'dblclick')}
                    onContextMenu={(e) => onBoxAction(e, 'contextmenu')}
                    onWheel={() => {
                      if (step.action === 'scroll') advance();
                    }}
                  >
                    {step.showBoxLabel !== false && (
                      <span
                        className="box-tag"
                        style={{ backgroundColor: boxColor }}
                        dangerouslySetInnerHTML={{
                          __html:
                            actionIconSvg(step.action, 13) +
                            '<span>' +
                            ACTION_LABELS[step.action] +
                            '</span>',
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="player-caption">
              <span className={`action-badge a-${step.action}`}>
                {ACTION_LABELS[step.action]}
              </span>
              <div className="player-caption-text">
                <div className="player-desc">{step.description || actionHint}</div>
                {step.description && (
                  <div className="player-hint">{actionHint}</div>
                )}
              </div>
              {step.action === 'type' && (
                <div className="player-type">
                  <input
                    className={'text-input' + (wrong ? ' wrong' : '')}
                    autoFocus
                    value={typed}
                    placeholder={step.typeText || '텍스트 입력 후 Enter'}
                    onChange={(e) => {
                      setTyped(e.target.value);
                      setWrong(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitTyped();
                    }}
                  />
                  {wrong && <span className="wrong-msg">입력이 일치하지 않습니다</span>}
                </div>
              )}
              <div className="player-nav">
                <button
                  className="btn ghost"
                  disabled={index === 0}
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                >
                  ← 이전
                </button>
                {(step.action === 'info' || step.action === 'scroll' || !step.box) && (
                  <button className="btn primary" onClick={advance}>
                    다음 →
                  </button>
                )}
                {step.box && step.action !== 'info' && step.action !== 'scroll' && (
                  <button className="btn ghost" onClick={advance} title="동작 없이 건너뛰기">
                    건너뛰기
                  </button>
                )}
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}
