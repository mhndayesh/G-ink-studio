from __future__ import annotations
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / 'apps/api'
WEB = ROOT / 'apps/web'
sys.path.insert(0, str(API))

from app.main import app  # noqa

backend_routes = set()
for r in app.routes:
    if not hasattr(r, 'methods') or not getattr(r, 'path', '').startswith('/api/v1'):
        continue
    for method in r.methods:
        if method in {'GET','POST','PATCH','DELETE'}:
            backend_routes.add((method, r.path.replace('/api/v1','')))

api_ts = (WEB / 'lib/api.ts').read_text(encoding='utf-8')
used = []
for line in api_ts.splitlines():
    if 'apiFetch' not in line:
        continue
    method = 'GET'
    if 'method: "POST"' in line:
        method = 'POST'
    if 'method: "PATCH"' in line:
        method = 'PATCH'
    m = re.search(r'apiFetch(?:<[^>]+>)?\((`[^`]+`|"[^"]+")', line)
    if not m:
        continue
    raw = m.group(1).strip('`"')
    path = raw.replace('${storyId}', '{story_id}').replace('${questionId}', '{question_id}').replace('${versionId}', '{version_id}')
    used.append((method, path))

missing = sorted([item for item in used if item not in backend_routes])
# Check clean filenames in templates and repo path names.
bad_names = []
for p in ROOT.rglob('*'):
    if re.search(r'\([0-9]+\)', p.name):
        bad_names.append(str(p.relative_to(ROOT)))

required_templates = ['master_story.json','characters.json','plot_outline.json','memory_system.json','plot_workspace.json','chapter_script.json']
template_dir = API / 'app/templates'
missing_templates = [f for f in required_templates if not (template_dir / f).exists()]

report = {
    'passed': not missing and not bad_names and not missing_templates,
    'frontend_api_calls_checked': len(used),
    'backend_routes_available': len(backend_routes),
    'missing_frontend_backend_routes': missing,
    'bad_suffix_names': bad_names[:50],
    'missing_templates': missing_templates,
    'cors_config_present': 'CORSMiddleware' in (API/'app/main.py').read_text(encoding='utf-8'),
    'frontend_env_example_present': (WEB/'.env.example').exists(),
    'backend_env_example_present': (API/'.env.example').exists(),
}
print(json.dumps(report, indent=2))
if not report['passed']:
    sys.exit(1)
