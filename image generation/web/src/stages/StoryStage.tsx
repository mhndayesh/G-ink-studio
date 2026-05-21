import type { StageProps } from '../app/Shell';
import { api } from '../lib/api';
import { useToast } from '../App';
import { AiButton, EditField } from '../components/bits';

export function StoryStage({ view, apply }: StageProps) {
  const toast = useToast();
  const p = view.project;
  const empty = p.chapters.length === 0;

  return (
    <div>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="sec">Story</h2>
          <AiButton label="Clean up & normalize" onRun={async () => { const v = await api.aiCleanupStory(p.id); apply(v); toast(`Tidied ${v.project._lastCleanup?.fixed ?? 0} thing(s).`); }} title="De-dupe characters, fill blank scene labels, copy a usable visual into any blank panel." />
        </div>
        <p className="muted tiny" style={{ marginTop: 0 }}>This is your imported manga. Review it below. When everything has a chapter, a page, a panel and some source text, you can continue to <b>Cast &amp; World</b>.</p>
        {empty && <div className="gate" style={{ marginBottom: 12 }}><b>This project has no story.</b> Re-import your <code>*-story.md</code> / <code>*-visuals.md</code> bundle from the projects screen to populate it.</div>}
        <div className="grid2">
          <EditField label="Title" value={p.title} onSave={v => api.patchMeta(p.id, { title: v }).then(apply)} />
          <EditField label="Genre" value={p.genre || ''} onSave={v => api.patchMeta(p.id, { genre: v }).then(apply)} />
        </div>
        <EditField label="Synopsis" value={p.synopsis || ''} onSave={v => api.patchMeta(p.id, { synopsis: v }).then(apply)} textarea rows={4} />
        <EditField label="World notes" value={p.worldNotes || ''} onSave={v => api.patchMeta(p.id, { worldNotes: v }).then(apply)} textarea rows={4} hint="background the AI can use later" />
      </div>

      <div className="grid2">
        <div className="card">
          <h3 className="sub">Cast — {p.characters.length}</h3>
          {p.characters.map(c => <div key={c.id} className="row tiny" style={{ justifyContent: 'space-between', padding: '3px 0' }}><span><b>{c.name}</b> <span className="muted">{c.role}</span></span>{c.imagePrompt ? <span className="pill ok">has look</span> : <span className="pill warn">needs look</span>}</div>)}
          {!p.characters.length && <p className="muted">No characters parsed.</p>}
        </div>
        <div className="card">
          <h3 className="sub">Locations — {p.locations.length}</h3>
          {p.locations.map(l => <div key={l.id} className="row tiny" style={{ justifyContent: 'space-between', padding: '3px 0' }}><span><b>{l.name}</b> <span className="muted">{l.type}</span></span>{l.imagePrompt ? <span className="pill ok">has look</span> : <span className="pill warn">needs look</span>}</div>)}
          {!p.locations.length && <p className="muted">No locations parsed.</p>}
        </div>
      </div>

      <div className="card">
        <h3 className="sub">Chapters · {p.pages.length} pages · {p.panels.length} panels</h3>
        {p.chapters.map(ch => {
          const pages = p.pages.filter(pg => pg.chapterId === ch.id).sort((a, b) => a.number - b.number);
          return (
            <div key={ch.id} style={{ marginBottom: 10 }}>
              <b>Chapter {ch.number}: {ch.title}</b>
              <div className="tiny muted" style={{ marginLeft: 12 }}>
                {pages.map(pg => { const n = p.panels.filter(x => x.pageId === pg.id).length; return <span key={pg.id} style={{ marginRight: 14 }}>Page {pg.number} ({pg.sceneLabel}) — {n} panels</span>; })}
              </div>
            </div>
          );
        })}
        {!p.chapters.length && <p className="muted">No chapters.</p>}
      </div>
    </div>
  );
}
