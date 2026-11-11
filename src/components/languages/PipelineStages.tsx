import { type DotState, StatusDot } from '@/components/StatusDot';
import { type Cefr, type StageStatus, pipelineStages } from '@/lib/tui/languages';

export const STAGE_DOT: Record<StageStatus, DotState> = {
  passed: 'done',
  running: 'running',
  pending: 'pending',
  skipped: 'off',
};

export function PipelineStages({ level, target }: { level?: Cefr; target?: Cefr }) {
  // No level means a native language: one finished stage in place of A1 to C2.
  if (!level || !target) {
    return (
      <span className="stages">
        <span className="stage">
          <StatusDot state="done" /> native
        </span>
      </span>
    );
  }
  return (
    <span className="stages">
      {pipelineStages(level, target).map((s) => (
        <span key={s.stage} className={`stage ${s.status === 'skipped' ? 'text-dim' : ''}`}>
          <StatusDot state={STAGE_DOT[s.status]} /> {s.stage}
          <span className="sr-only"> {s.status}</span>
        </span>
      ))}
    </span>
  );
}
