import { CEFR } from '@/lib/content/schemas';

export type Cefr = (typeof CEFR)[number];
export type StageStatus = 'passed' | 'running' | 'pending' | 'skipped';

export function pipelineStages(level: Cefr, target: Cefr): { stage: Cefr; status: StageStatus }[] {
  const current = CEFR.indexOf(level);
  const goal = CEFR.indexOf(target);
  return CEFR.map((stage, i) => ({
    stage,
    status: i <= current ? 'passed' : i > goal ? 'skipped' : i === current + 1 ? 'running' : 'pending',
  }));
}

export function pipelineStatus(level: Cefr, target: Cefr): 'running' | 'passed' {
  return level === target ? 'passed' : 'running';
}

// A native language has no stages to run, so it counts as passed.
export function languageStatus(lang: { native: boolean; level?: Cefr; target?: Cefr }): 'running' | 'passed' {
  if (lang.native || !lang.level || !lang.target) return 'passed';
  return pipelineStatus(lang.level, lang.target);
}
