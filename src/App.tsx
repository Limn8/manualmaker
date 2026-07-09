import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project, Step } from './types';
import { newProject, uid } from './types';
import { loadProject, saveProject } from './store';
import { downloadBlob, sanitizeFilename } from './utils';
import CaptureModal from './components/CaptureModal';
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
  const [showCapture, setShowCapture] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const importRef = useRef<HTMLInputElement>(null);

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
      description: '',
    };
    setProject((p) => ({ ...p, steps: [...p.steps, step] }));
    setSelectedId(step.id);
    setShowCapture(false);
  }, []);

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

  const reorderStep = useCallback((from: number, to: number) => {
    setProject((p) => {
      if (to < 0 || to >= p.steps.length || from === to) return p;
      const steps = [...p.steps];
      const [moved] = steps.splice(from, 1);
      steps.splice(to, 0, moved);
      return { ...p, steps };
    });
  }, []);

  const selected = project.steps.find((s) => s.id === selectedId) ?? null;

  async function handleExport(kind: 'html' | 'pdf' | 'video') {
    if (project.steps.length === 0) {
      alert('내보낼 스텝이 없습니다. 먼저 화면을 캡처하세요.');
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
        await exportVideo(project, setExportProgress);
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
          <span className="brand-icon">📸</span> ManualMaker
        </div>
        <input
          className="title-input"
          value={project.title}
          onChange={(e) => setProject((p) => ({ ...p, title: e.target.value }))}
          placeholder="튜토리얼 제목"
        />
        <div className="topbar-actions">
          <button className="btn primary" onClick={() => setShowCapture(true)}>
            ＋ 캡처 추가
          </button>
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
          <button className="btn" disabled={!!exporting} onClick={() => handleExport('video')}>
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
          onAdd={() => setShowCapture(true)}
        />
        <div className="editor-area">
          {selected ? (
            <StepEditor
              key={selected.id}
              step={selected}
              index={project.steps.findIndex((s) => s.id === selected.id)}
              total={project.steps.length}
              onChange={(patch) => updateStep(selected.id, patch)}
            />
          ) : (
            <div className="empty-state">
              <div className="empty-card">
                <div className="empty-icon">🖼️</div>
                <h2>첫 스텝을 만들어보세요</h2>
                <p>
                  화면을 캡처하거나 이미지를 붙여넣어 튜토리얼 스텝을 추가합니다.
                  <br />
                  이미지 위에 강조 박스를 그리고, 클릭·입력 등의 동작을 지정하면
                  <br />
                  단계별로 진행되는 인터랙티브 튜토리얼이 완성됩니다.
                </p>
                <button className="btn primary big" onClick={() => setShowCapture(true)}>
                  📸 화면 캡처로 시작하기
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showCapture && (
        <CaptureModal onDone={addStep} onClose={() => setShowCapture(false)} />
      )}
      {showPlayer && <Player project={project} onClose={() => setShowPlayer(false)} />}
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
