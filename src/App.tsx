import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project, Step } from './types';
import {
  DEFAULT_BOX_COLOR,
  DEFAULT_BOX_SHAPE,
  DEFAULT_INFO_DELAY_SEC,
  DEFAULT_VIDEO_DUBBING_ENABLED,
  DEFAULT_VIDEO_STEP_SEC,
  DEFAULT_VIDEO_TTS_VOICE,
  GEMINI_TTS_VOICES,
  newProject,
  uid,
} from './types';
import { loadProject, saveProject } from './store';
import { downloadBlob, sanitizeFilename } from './utils';
import CropModal from './components/CropModal';
import { blobToDataUrl, captureScreen, readClipboardImage } from './capture';
import StepList from './components/StepList';
import StepEditor from './components/StepEditor';
import Player from './components/Player';
import { exportHtml } from './export/html';
import { exportPdf } from './export/pdf';
import { exportVideo } from './export/video';

export default function App() {
  const [project, setProject] = useState<Project>(newProject);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [recropId, setRecropId] = useState<string | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [showVideoExportDialog, setShowVideoExportDialog] = useState(false);
  const [videoGeminiApiKey, setVideoGeminiApiKey] = useState(
    () => window.localStorage.getItem('manualmaker.geminiApiKey') ?? '',
  );
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const importRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load saved project once
  useEffect(() => {
    loadProject()
      .then((p) => {
        if (p && p.steps) {
          setProject(p);
          if (p.steps.length > 0) setSelectedId(p.steps[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Debounced autosave
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      saveProject(project).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [project, loaded]);

  const addStep = useCallback((image: string) => {
    const step: Step = {
      id: uid(),
      image,
      box: null,
      action: 'click',
      boxColor: DEFAULT_BOX_COLOR,
      boxShape: DEFAULT_BOX_SHAPE,
      showBoxLabel: true,
      infoDelaySec: DEFAULT_INFO_DELAY_SEC,
      description: '',
    };
    setProject((p) => ({ ...p, steps: [...p.steps, step] }));
    setSelectedId(step.id);
    setCropImage(null);
  }, []);

  // Handle a finished crop: either replace an existing step's image or add new
  const handleCropDone = useCallback(
    (image: string) => {
      if (recropId) {
        setProject((p) => ({
          ...p,
          steps: p.steps.map((s) => (s.id === recropId ? { ...s, image } : s)),
        }));
        setRecropId(null);
        setCropImage(null);
      } else {
        addStep(image);
      }
    },
    [recropId, addStep],
  );

  function closeCrop() {
    setCropImage(null);
    setRecropId(null);
  }

  function handleRecrop() {
    if (selected) {
      setRecropId(selected.id);
      setCropImage(selected.image);
    }
  }

  // Ctrl+V anywhere: paste an image straight into the crop dialog
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            blobToDataUrl(file).then(setCropImage);
            return;
          }
        }
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  async function handleCaptureScreen() {
    try {
      const img = await captureScreen();
      if (img) setCropImage(img);
    } catch (err) {
      alert('화면 캡처에 실패했습니다: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function handlePasteClipboard() {
    try {
      const img = await readClipboardImage();
      if (img) {
        setCropImage(img);
      } else {
        alert('클립보드에 이미지가 없습니다. 먼저 화면을 캡처(예: Win+Shift+S)한 뒤 다시 시도하세요.');
      }
    } catch {
      alert('클립보드를 읽을 수 없습니다. 이 창에서 Ctrl+V 로 직접 붙여넣어 보세요.');
    }
  }

  function handlePickFile() {
    fileRef.current?.click();
  }

  const updateStep = useCallback((id: string, patch: Partial<Step>) => {
    setProject((p) => ({
      ...p,
      steps: p.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  }, []);

  const deleteStep = useCallback(
    (id: string) => {
      setProject((p) => {
        const steps = p.steps.filter((s) => s.id !== id);
        return { ...p, steps };
      });
      setSelectedId((cur) => {
        if (cur !== id) return cur;
        const idx = project.steps.findIndex((s) => s.id === id);
        const rest = project.steps.filter((s) => s.id !== id);
        if (rest.length === 0) return null;
        return rest[Math.min(idx, rest.length - 1)].id;
      });
    },
    [project.steps],
  );

  const duplicatePreviousStep = useCallback(() => {
    const sourceIndex =
      selectedId === null ? project.steps.length - 1 : project.steps.findIndex((s) => s.id === selectedId);
    if (sourceIndex < 0) return;
    const source = project.steps[sourceIndex];
    const duplicate: Step = {
      ...source,
      id: uid(),
      description: source.description,
    };
    setProject((p) => {
      const steps = [...p.steps];
      steps.splice(sourceIndex + 1, 0, duplicate);
      return { ...p, steps };
    });
    setSelectedId(duplicate.id);
  }, [project.steps, selectedId]);

  const reorderStep = useCallback((from: number, to: number) => {
    setProject((p) => {
      if (to < 0 || to > p.steps.length || from === to || from + 1 === to) return p;
      const steps = [...p.steps];
      const [moved] = steps.splice(from, 1);
      const targetIndex = from < to ? to - 1 : to;
      steps.splice(targetIndex, 0, moved);
      return { ...p, steps };
    });
  }, []);

  const selected = project.steps.find((s) => s.id === selectedId) ?? null;
  const videoStepSec = project.videoStepSec ?? DEFAULT_VIDEO_STEP_SEC;
  const videoDubbingEnabled = project.videoDubbingEnabled ?? DEFAULT_VIDEO_DUBBING_ENABLED;
  const videoTtsVoice = project.videoTtsVoice ?? DEFAULT_VIDEO_TTS_VOICE;

  function updateVideoStepSec(value: number) {
    const next = Math.min(30, Math.max(1, Number.isFinite(value) ? value : DEFAULT_VIDEO_STEP_SEC));
    setProject((p) => ({ ...p, videoStepSec: next }));
  }

  function updateVideoDubbingEnabled(enabled: boolean) {
    setProject((p) => ({ ...p, videoDubbingEnabled: enabled }));
  }

  function updateVideoTtsVoice(value: string) {
    setProject((p) => ({ ...p, videoTtsVoice: value }));
  }

  function updateVideoGeminiApiKey(value: string) {
    setVideoGeminiApiKey(value);
    window.localStorage.setItem('manualmaker.geminiApiKey', value);
  }

  function openVideoExportDialog() {
    if (project.steps.length === 0) {
      alert('내보낼 단계가 없습니다. 먼저 화면을 캡처하세요.');
      return;
    }
    setShowVideoExportDialog(true);
  }

  async function startVideoExport() {
    setShowVideoExportDialog(false);
    await handleExport('video');
  }

  async function handleExport(kind: 'html' | 'pdf' | 'video') {
    if (project.steps.length === 0) {
      alert('내보낼 단계가 없습니다. 먼저 화면을 캡처하세요.');
      return;
    }
    setExporting(kind);
    setExportProgress(0);
    try {
      if (kind === 'html') {
        await exportHtml(project);
      } else if (kind === 'pdf') {
        await exportPdf(project, setExportProgress);
      } else {
        await exportVideo({ ...project, videoGeminiApiKey }, setExportProgress);
      }
    } catch (err) {
      console.error(err);
      alert('내보내기에 실패했습니다: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExporting(null);
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(project, null, 2)], {
      type: 'application/json',
    });
    downloadBlob(sanitizeFilename(project.title) + '.json', blob);
  }

  function importJson(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const p = JSON.parse(String(reader.result)) as Project;
        if (!p || !Array.isArray(p.steps)) throw new Error('invalid');
        setProject(p);
        setSelectedId(p.steps.length > 0 ? p.steps[0].id : null);
      } catch {
        alert('올바른 프로젝트 파일이 아닙니다.');
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          ManualMaker
        </div>
        <textarea
          className="title-input"
          rows={2}
          value={project.title}
          onChange={(e) => setProject((p) => ({ ...p, title: e.target.value }))}
          placeholder="매뉴얼 제목"
        />
        <div className="topbar-actions">
          <button className="btn primary" onClick={handleCaptureScreen} title="브라우저 화면 공유로 원하는 창/화면을 캡처">
            🖥️ 화면 캡처
          </button>
          <button className="btn" onClick={handlePasteClipboard} title="클립보드의 이미지 가져오기 (Ctrl+V도 가능)">
            📋 클립보드
          </button>
          <button className="btn" onClick={handlePickFile} title="이미지 파일 업로드">
            📁 파일
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) blobToDataUrl(f).then(setCropImage);
              e.target.value = '';
            }}
          />
          <div className="divider" />
          <button
            className="btn"
            disabled={project.steps.length === 0}
            onClick={() => setShowPlayer(true)}
          >
            ▶ 미리보기
          </button>
          <div className="divider" />
          <button className="btn" disabled={!!exporting} onClick={() => handleExport('html')}>
            HTML
          </button>
          <button className="btn" disabled={!!exporting} onClick={() => handleExport('pdf')}>
            PDF
          </button>
          <button className="btn" disabled={!!exporting} onClick={openVideoExportDialog}>
            영상
          </button>
          <div className="divider" />
          <button className="btn ghost" onClick={exportJson} title="프로젝트를 JSON 파일로 저장">
            저장
          </button>
          <button
            className="btn ghost"
            onClick={() => importRef.current?.click()}
            title="JSON 프로젝트 파일 불러오기"
          >
            열기
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <div className="main">
        <StepList
          steps={project.steps}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onDelete={deleteStep}
          onReorder={reorderStep}
          onCapture={handleCaptureScreen}
          onPaste={handlePasteClipboard}
          onFile={handlePickFile}
          onDuplicatePrevious={duplicatePreviousStep}
        />
        <div className="editor-area">
          {selected ? (
            <StepEditor
              key={selected.id}
              step={selected}
              index={project.steps.findIndex((s) => s.id === selected.id)}
              total={project.steps.length}
              onChange={(patch) => updateStep(selected.id, patch)}
              onRecrop={handleRecrop}
            />
          ) : (
            <div className="empty-state">
              <div className="empty-card">
                <div className="empty-icon">🖼️</div>
                <h2>첫 단계를 만들어보세요</h2>
                <p>
                  화면을 캡처하거나 이미지를 붙여넣어 매뉴얼 단계를 추가합니다.
                  <br />
                  이미지 위에 강조 박스를 그리고, 클릭·입력 등의 동작을 지정하면
                  <br />
                  단계별로 진행되는 인터랙티브 매뉴얼이 완성됩니다.
                </p>
                <div className="empty-btns">
                  <button className="btn primary big" onClick={handleCaptureScreen}>
                    🖥️ 화면 캡처
                  </button>
                  <button className="btn big" onClick={handlePasteClipboard}>
                    📋 클립보드
                  </button>
                  <button className="btn big" onClick={handlePickFile}>
                    📁 파일 업로드
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="fixed-badges" aria-label="도움말과 제작 정보">
        <a className="fixed-badge manual-badge" href="/manual-maker-manual.html" target="_blank" rel="noreferrer">
          매뉴얼 메이커 매뉴얼
        </a>
        <a className="fixed-badge creator-link" href="https://litt.ly/limn8" target="_blank" rel="noreferrer">
          제작: 경기이음온학교 임현우
        </a>
      </div>

      {cropImage && (
        <CropModal
          image={cropImage}
          editing={!!recropId}
          onDone={handleCropDone}
          onClose={closeCrop}
        />
      )}
      {showPlayer && <Player project={project} onClose={() => setShowPlayer(false)} />}
      {showVideoExportDialog && (
        <div className="modal-overlay" onClick={() => setShowVideoExportDialog(false)}>
          <div className="modal video-export-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>영상 내보내기</h3>
              <button className="icon-btn" onClick={() => setShowVideoExportDialog(false)}>
                ✕
              </button>
            </div>
            <div className="video-export-options">
              <label className="video-export-row">
                <span>화면당 시간</span>
                <div className="video-export-number">
                  <input
                    type="number"
                    min={1}
                    max={30}
                    step={0.5}
                    value={videoStepSec}
                    onChange={(e) => updateVideoStepSec(Number(e.target.value))}
                  />
                  <span>초</span>
                </div>
              </label>
              <label className="video-export-row check-row">
                <span>더빙 포함</span>
                <input
                  type="checkbox"
                  checked={videoDubbingEnabled}
                  onChange={(e) => updateVideoDubbingEnabled(e.target.checked)}
                />
              </label>
              {videoDubbingEnabled && (
                <>
                  <label className="video-export-field">
                    <span>Gemini API key</span>
                    <input
                      type="password"
                      value={videoGeminiApiKey}
                      onChange={(e) => updateVideoGeminiApiKey(e.target.value)}
                      placeholder="AIza..."
                    />
                  </label>
                  <label className="video-export-field compact">
                    <span>TTS 음성</span>
                    <select
                      value={videoTtsVoice}
                      onChange={(e) => updateVideoTtsVoice(e.target.value)}
                    >
                      {GEMINI_TTS_VOICES.map((voice) => (
                        <option key={voice.value} value={voice.value}>
                          {voice.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setShowVideoExportDialog(false)}>
                취소
              </button>
              <div style={{ flex: 1 }} />
              <button className="btn primary" onClick={startVideoExport}>
                내보내기
              </button>
            </div>
          </div>
        </div>
      )}
      {exporting && (
        <div className="export-overlay">
          <div className="export-box">
            <div className="spinner" />
            <div>
              {exporting === 'video'
                ? '영상 생성 중… 화면을 닫지 마세요'
                : exporting === 'pdf'
                  ? 'PDF 생성 중…'
                  : 'HTML 생성 중…'}
            </div>
            {exporting !== 'html' && (
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${Math.round(exportProgress * 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
