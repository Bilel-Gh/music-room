import 'dotenv/config';
import { createServer } from 'http';
import app from './app.js';
import { initSocketServer } from './config/socket.js';

const port = process.env.PORT || 3001;

const httpServer = createServer(app);
initSocketServer(httpServer);

httpServer.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
