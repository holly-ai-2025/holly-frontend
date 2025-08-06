import { Router } from 'express';
import { spawn } from 'child_process';

const router = Router();

router.post('/', (req, res) => {
  const { prompt } = req.body ?? {};

  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Transfer-Encoding': 'chunked',
    'Connection': 'keep-alive',
  });

  const tts = spawn('python', ['tts.py'], { stdio: ['pipe', 'pipe', 'inherit'] });
  if (prompt) {
    tts.stdin.write(prompt);
  }
  tts.stdin.end();

  tts.stdout.on('data', (chunk) => {
    res.write(chunk);
  });

  tts.on('close', () => {
    res.end();
  });
});

export default router;
