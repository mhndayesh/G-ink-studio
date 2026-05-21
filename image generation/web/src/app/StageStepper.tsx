import type { ProjectView, Stage } from '../lib/types';
import { api } from '../lib/api';
import { useToast } from '../App';

export function StageStepper({ view, viewingStage, onPick, onHome, apply }: { view: ProjectView; viewingStage: Stage; onPick: (s: Stage) => void; onHome: () => void; apply: (v: any) => void }) {
  const toast = useToast();
  const project = view.project;

  async function revertTo(s: Stage) {
    if (!confirm(`Go back to "${view.stageMeta[s].title}"? Everything after it will be marked as needing rework (prompts / renders / lettering / approvals downstream get cleared).`)) return;
    try { const v = await api.revert(project.id, s); apply(v); onPick(s); toast(`Back at ${view.stageMeta[s].title}. Downstream work is marked for rework.`); }
    catch (e: any) { toast(e.message, 'bad'); }
  }

  return (
    <div className="stepper">
      <div className="brand">G-Ink Studio<small>v2 · {project.title}</small></div>
      {view.stages.map(s => {
        const blocked = !s.unlocked;
        const active = viewingStage === s.stage;
        const reasonsForLock = !s.unlocked ? `Finish "${view.stageMeta[project.currentStage].title}" first` : '';
        return (
          <button key={s.stage} className={`step ${active ? 'current' : ''} ${s.done ? 'done' : ''}`} disabled={blocked} title={blocked ? reasonsForLock : (s.done ? 'Already done — click to review (read-only-ish)' : '')} onClick={() => onPick(s.stage)}>
            <span className="num">{s.done ? '✓' : blocked ? '🔒' : s.index + 1}</span>
            <span className="meta"><b>{s.title}</b><span>{s.done ? 'done · review' : s.current ? 'in progress' : blocked ? 'locked' : ''}</span></span>
          </button>
        );
      })}
      <div className="spacer" />
      {project.currentStage !== 'story' && (
        <div className="tiny" style={{ padding: '0 8px 8px' }}>
          <div className="muted" style={{ marginBottom: 4 }}>Go back a step:</div>
          <div className="row">
            {view.stages.filter(s => s.index < view.stages.find(x => x.stage === project.currentStage)!.index).map(s => (
              <button key={s.stage} className="btn sm" onClick={() => revertTo(s.stage)}>↩ {s.title}</button>
            ))}
          </div>
        </div>
      )}
      <div className="statusline">
        AI: <b>{view.llm.label}</b><br />Images: <b>{view.image.label}</b>
        <div style={{ marginTop: 8 }}><button className="btn sm" onClick={onHome}>← All projects</button></div>
      </div>
    </div>
  );
}
