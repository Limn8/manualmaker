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
  type: '입력',
  scroll: '스크롤',
  info: '안내',
};

export const ACTION_HINTS: Record<ActionType, string> = {
  click: '강조된 영역을 클릭하세요',
  doubleclick: '강조된 영역을 더블클릭하세요',
  rightclick: '강조된 영역을 우클릭하세요',
  type: '텍스트를 입력하고 Enter를 누르세요',
  scroll: '강조된 영역에서 스크롤하세요',
  info: '내용을 확인하고 다음으로 진행하세요',
};

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
  /** expected text when action === 'type' */
  typeText?: string;
  description: string;
}

export interface Project {
  title: string;
  steps: Step[];
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function newProject(): Project {
  return { title: '새 튜토리얼', steps: [] };
}
