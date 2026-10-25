"""Export authored source files without local tools, secrets or third-party code."""
from pathlib import Path

root = Path(__file__).resolve().parent.parent
paths = [
    'BridgeDemo.csproj', 'global.json', 'NuGet.Config', 'packages.lock.json', 'Models.cs', 'StateStore.cs', 'Program.cs', 'BridgeMaintenance.cs',
    'wwwroot/index.html', 'wwwroot/style.css', 'wwwroot/app.js', 'mt5/RelayDemoRemote.mq5',
    'deploy/relay.service', 'deploy/relay.nginx.conf', 'deploy/install-release.sh', 'deploy/relay-backup.service', 'deploy/relay-backup.timer',
    'scripts/db-maintenance.py', 'scripts/package-release.ps1',
    'scripts/run.ps1', 'scripts/test.ps1', 'scripts/check-publish.mjs', 'scripts/prepare-client.ps1', 'scripts/export-file-guide.py',
    'scripts/validation-manifest.mjs', 'tests/integration.mjs', 'tests/pentagi/offline-flow.json',
    'Dockerfile', '.dockerignore', '.gitignore', '.gitattributes',
    '.github/workflows/ci.yml', '.github/workflows/container.yml',
]
parts = ['# Authored file contents\n\nPaths are relative to the repository root. Generated data, local tools and third-party dependency code are deliberately excluded. See FILES.md and the dependency license.\n']
for name in paths:
    parts.append(f'\n## {name}\n\n`````text\n{(root / name).read_text(encoding="utf-8")}\n`````\n')
(root / 'docs' / 'FILE-CONTENTS.md').write_text(''.join(parts), encoding='utf-8', newline='\n')
print(f'Exported {len(paths)} source/config files')
