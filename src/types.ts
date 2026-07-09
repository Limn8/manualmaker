export type ActionType =
  | 'click'
  | 'doubleclick'
  | 'rightclick'
  | 'type'
  | 'scroll'
  | 'info';

export const ACTION_LABELS: Record<ActionType, string> = {
  click: '클릭',
  doubleclick: '더블클릭',
  rightclick: '우클릭',
  type: '텍스트 입력',
  scroll: '스크롤',
  info: '안내',
};

/** Inner SVG markup for each action, drawn with stroke=currentColor. */
export const ACTION_ICON: Record<ActionType, string> = {
  click: '<path d="M5 3v16l4-4 3 6 2-1-3-6h6z"/>',
  doubleclick: '<path d="M5 3v16l4-4 3 6 2-1-3-6h6z"/>',
  rightclick: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 2v8"/>',
  type: '<path d="M6 7V5h12v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
  scroll: '<path d="M12 4v16"/><path d="M7 9l5-5 5 5"/><path d="M7 15l5 5 5-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.6h0"/>',
};

export function actionIconSvg(action: ActionType, size = 14): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    ACTION_ICON[action] +
    `</svg>`
  );
}

export const ACTION_HINTS: Record<ActionType, string> = {
  click: '강조된 영역을 클릭하세요',
  doubleclick: '강조된 영역을 더블클릭하세요',
  rightclick: '강조된 영역을 우클릭하세요',
  type: '텍스트를 입력하고 Enter를 누르세요',
  scroll: '강조된 영역에서 스크롤하세요',
  info: '내용을 확인하면 자동으로 다음 단계로 넘어갑니다',
};

export type BoxShape = 'rect' | 'rounded' | 'circle';

export const BOX_SHAPE_LABELS: Record<BoxShape, string> = {
  rect: '네모',
  rounded: '둥근네모',
  circle: '동그라미',
};

export const BOX_COLOR_PRESETS = ['#3182f6', '#f04452', '#00a661', '#8b5cf6', '#e8830c'] as const;
export const DEFAULT_BOX_COLOR = BOX_COLOR_PRESETS[0];
export const DEFAULT_BOX_SHAPE: BoxShape = 'rounded';
export const DEFAULT_INFO_DELAY_SEC = 3;
export const DEFAULT_VIDEO_STEP_SEC = 5;
export const DEFAULT_VIDEO_DUBBING_ENABLED = false;
export const DEFAULT_VIDEO_TTS_VOICE = 'Kore';
export const GEMINI_TTS_VOICES = [
  { value: 'Kore', label: 'Kore - 또렷하고 단단한 톤' },
  { value: 'Puck', label: 'Puck - 밝고 경쾌한 톤' },
  { value: 'Aoede', label: 'Aoede - 산뜻하고 부드러운 톤' },
  { value: 'Leda', label: 'Leda - 젊고 자연스러운 톤' },
  { value: 'Callirrhoe', label: 'Callirrhoe - 편안한 설명 톤' },
  { value: 'Charon', label: 'Charon - 차분한 안내 톤' },
  { value: 'Achird', label: 'Achird - 친근한 톤' },
  { value: 'Laomedeia', label: 'Laomedeia - 활기 있는 톤' },
  { value: 'Vindemiatrix', label: 'Vindemiatrix - 온화한 톤' },
  { value: 'Sulafat', label: 'Sulafat - 따뜻한 톤' },
] as const;

/** Normalized rectangle, all values 0..1 relative to image size */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Step {
  id: string;
  /** data URL of the screenshot */
  image: string;
  box: Box | null;
  action: ActionType;
  boxColor?: string;
  boxShape?: BoxShape;
  showBoxLabel?: boolean;
  infoDelaySec?: number;
  /** expected text when action === 'type' */
  typeText?: string;
  description: string;
}

export interface Project {
  title: string;
  steps: Step[];
  videoStepSec?: number;
  videoDubbingEnabled?: boolean;
  videoTtsVoice?: string;
  videoGeminiApiKey?: string;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function newProject(): Project {
  return {
    title: '새 매뉴얼',
    steps: [],
    videoStepSec: DEFAULT_VIDEO_STEP_SEC,
    videoDubbingEnabled: DEFAULT_VIDEO_DUBBING_ENABLED,
    videoTtsVoice: DEFAULT_VIDEO_TTS_VOICE,
  };
}
