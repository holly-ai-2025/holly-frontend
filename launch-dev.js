import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function run(command, options = {}) {
  return spawn(command, { stdio: 'inherit', shell: true, ...options });
}

const processes = [
  run('ssh -L 11111:localhost:11434 -p 50015 root@99.243.100.183'),
  run('node server.js', { cwd: path.resolve(__dirname, '../holly-backend') }),
  run('npm run dev', { cwd: __dirname })
];

function shutdown() {
  for (const p of processes) {
    if (!p.killed) {
      p.kill('SIGINT');
    }
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit();
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit();
});

process.on('exit', shutdown);
