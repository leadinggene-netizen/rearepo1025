"""Export authored source files without local tools, secrets or third-party code."""
from pathlib import Path

root = Path(__file__).resolve().parent.parent
paths = [
    'BridgeDemo.csproj', 'global.json', 'NuGet.Config', 'Models.cs', 'StateStore.cs', 'Program.cs',
    'wwwroot/index.html', 'wwwroot/style.css', 'wwwroot/app.js', 'mt5/RelayDemo.mq5',
    'scripts/run.ps1', 'scripts/test.ps1', 'scripts/check-publish.mjs', 'scripts/prepare-client.ps1', 'scripts/export-file-guide.py',
    'tests/integration.mjs', 'Dockerfile', '.dockerignore', '.gitignore', '.gitattributes',
    '.github/workflows/ci.yml', '.github/workflows/container.yml',
]
parts = ['# Authored file contents\n\nPaths are relative to the repository root. Generated data, local tools and third-party dependency code are deliberately excluded. See FILES.md and the dependency license.\n']
for name in paths:
    parts.append(f'\n## {name}\n\n`````text\n{(root / name).read_text(encoding="utf-8")}\n`````\n')
(root / 'docs' / 'FILE-CONTENTS.md').write_text(''.join(parts), encoding='utf-8')
print(f'Exported {len(paths)} source/config files')
