import type { Gate } from '../lib/types';

export function GatePanel({ gate, stageTitle, onJump, inline }: { gate: Gate; stageTitle: string; onJump: (j: any) => void; inline?: boolean }) {
  if (gate.ok) {
    return <div className={`gate ok ${inline ? 'tiny' : ''}`} style={inline ? { padding: '6px 10px' } : undefined}>✓ <b>{stageTitle}</b> is complete — you can continue.</div>;
  }
  const shown = gate.blockers.slice(0, inline ? 4 : 50);
  return (
    <div className="gate" style={inline ? { padding: '8px 10px', maxWidth: 560 } : undefined}>
      <h4>{gate.blockers.length} thing{gate.blockers.length === 1 ? '' : 's'} to finish in <b>{stageTitle}</b></h4>
      <ul>
        {shown.map((b, i) => (
          <li key={i}><b>{b.label}</b> — {b.reason} {b.jump && <button className="btn ghost sm" onClick={() => onJump(b.jump)}>jump →</button>}</li>
        ))}
        {gate.blockers.length > shown.length && <li className="muted">…and {gate.blockers.length - shown.length} more</li>}
      </ul>
    </div>
  );
}
