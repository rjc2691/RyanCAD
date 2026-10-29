"""Generate a Codex stdio configuration without embedding the server token."""
import json
import os
from pathlib import Path
import sys


def codex_setup(port: int, workspace: str, design: str, name: str):
    cwd = Path.cwd().resolve()
    connection = cwd / 'runtime' / ('connection.json' if port == 8790 else f'connection-{port}.json')
    args = ['-m', 'ryancad.mcp_server', '--connection', str(connection), '--name', 'Codex',
            '--workspace', workspace, '--design', design]
    quote = lambda value: json.dumps(value, ensure_ascii=False)
    config = ('[mcp_servers.ryancad]\n' + f'command = {quote(sys.executable)}\n' +
              f'cwd = {quote(str(cwd))}\nargs = [\n' +
              ''.join(f'  {quote(arg)},\n' for arg in args) +
              ']\nstartup_timeout_sec = 30\ntool_timeout_sec = 120\n')
    return {'format':'toml', 'config':config, 'config_path':str(Path(os.environ.get('CODEX_HOME', Path.home()/'.codex'))/'config.toml'),
            'connection_file':str(connection), 'connection_ready':connection.is_file(),
            'design_name':name, 'design_id':design}
