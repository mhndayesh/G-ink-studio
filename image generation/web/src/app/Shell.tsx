import { useEffect, useMemo, useState } from 'react';
import type { ProjectView, Stage } from '../lib/types';
import { api } from '../lib/api';
import { useToast } from '../App';
import { StageStepper } from './StageStepper';
import { GatePanel } from '../components/GatePanel';
import { AiButton, JobProgress } from '../components/bits';
import { StoryStage } from '../stages/StoryStage';
import { CastWorldStage } from '../stages/CastWorldStage';
import { PagesStage } from '../stages/PagesStage';
import { RenderStage } from '../stages/RenderStage';
import { LetterExportStage } from '../stages/LetterExportStage';

export interface StageProps {
  view: ProjectView;
  apply: (v: any) => void;
  reload: () => void;
  sel: { pageId: string | null; panelId: string | null };
  setSel: (s: { pageId?: string | null; panelId?: string | null }) => void;
}

export function Shell({ view, reload, applyView, closeProject }: { view: ProjectView; reload: () => void; applyView: (v: any) => void; closeProject: () => void }) {
  const toast = useToast();
  const project = view.project;
  const [pageId, setPageId] = useState<string | null>(null);
  const [panelId, setPanelId] = useState<string | null>(null);
  // viewing stage can be any unlocked stage; defaults to current
  const [viewingStage, setViewingStage] = useState<Stage>(project.currentStage);
  const [autoJob, setAutoJob] = useState<string | null>(null);
  useEffect(() => { setViewingStage(project.currentStage); }, [project.currentStage]);

  // keep a sane default page selection
  useEffect(() => { if (!pageId && project.pages.length) setPageId(project.pages[0].id); }, [project.pages, pageId]);

  const setSel = (s: { pageId?: string | null; panelId?: string | null }) => { if ('pageId' in s) setPageId(s.pageId ?? null); if ('panelId' in s) setPanelId(s.panelId ?? null); };
  const sel = { pageId, panelId };
  const sp: StageProps = { view, apply: applyView, reload, sel, setSel };

  async function advance() {
    try { const v = await api.advance(project.id); applyView(v); toast(`Moved to ${v.stageMeta[v.project.currentStage].title}.`); }
    catch (e: any) { toast(e.gate ? `Can't continue — ${e.gate.blockers.length} item(s) need attention. See the list below.` : e.message, 'bad'); }
  }
  function jumpTo(j: any) {
    if (!j) return;
    if (j.stage && j.stage !== viewingStage) setViewingStage(j.stage);
    if (j.pageId) setPageId(j.pageId);
    if (j.panelId) { const pn = project.panels.find(p => p.id === j.panelId); if (pn) { setPageId(pn.pageId); setPanelId(pn.id); } }
    if (j.characterId || j.locationId) { /* handled inside the cast stage via sel? keep simple */ }
  }

  const isCurrent = viewingStage === project.currentStage;
  const nextTitle = view.nextStage ? view.stageMeta[view.nextStage].title : null;

  const Body = useMemo(() => {
    switch (viewingStage) {
      case 'story': return <StoryStage {...sp} />;
      case 'cast': return <CastWorldStage {...sp} />;
      case 'pages': return <PagesStage {...sp} />;
      case 'render': return <RenderStage {...sp} />;
      case 'letterExport': return <LetterExportStage {...sp} />;
    }
  }, [viewingStage, view, pageId, panelId]);

  return (
    <div className="app">
      <StageStepper view={view} viewingStage={viewingStage} onPick={setViewingStage} onHome={closeProject} apply={applyView} />
      <div className="main">
        <div className="topbar">
          <h1>{project.title}</h1>
          <span className="stage-tag">{view.stageMeta[viewingStage].title}{!isCurrent && ' · (already done — read-only-ish)'}</span>
          <div className="grow" />
          <span className="tiny muted">{view.llm.label} · {view.image.label}</span>
        </div>
        <div className="stage-body">
          {!isCurrent && <div className="gate ok" style={{ marginBottom: 14 }}>You're looking at an earlier step. Changes here will mark later steps as needing rework. <button className="btn sm" onClick={() => setViewingStage(project.currentStage)}>Back to current step</button></div>}
          {Body}
        </div>
        <div className="nextbar">
          <GatePanel gate={view.currentGate} stageTitle={view.stageMeta[project.currentStage].title} onJump={jumpTo} inline />
          {autoJob && <div style={{ minWidth: 220 }}><JobProgress jobId={autoJob} onDone={() => { setAutoJob(null); reload(); }} /></div>}
          <div className="grow" />
          {project.currentStage !== 'letterExport' && (
            <AiButton label="Auto-run the rest" className="btn ai big" disabled={!!autoJob}
              title="Fill every remaining step from your story — cast looks, panel prompts, renders, lettering & approval — and stop with a clear message if anything needs your input."
              onRun={async () => { const v = await api.aiAutoRun(project.id); applyView(v); setAutoJob(v.jobId); toast('Auto-run started — watch the progress bar.'); }} />
          )}
          {view.nextStage
            ? <button className="btn primary big" disabled={!view.currentGate.ok || !!autoJob} onClick={advance} title={view.currentGate.ok ? '' : 'Resolve the items on the left first'}>{view.currentGate.ok ? `Continue to ${nextTitle} →` : `${view.currentGate.blockers.length} thing(s) left before ${nextTitle}`}</button>
            : <span className="pill ok">Final step — export below</span>}
        </div>
      </div>
    </div>
  );
}
