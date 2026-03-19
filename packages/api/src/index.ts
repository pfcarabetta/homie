import http from 'http';
import { WebSocketServer } from 'ws';
import app from './app';
import { handleJobsWebSocket } from './ws/jobs';

const PORT = process.env.PORT ?? 3001;

const server = http.createServer(app);

const wss = new WebSocketServer({ noServer: true });
handleJobsWebSocket(wss);

server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/ws/jobs/')) {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});

export default app;
