const path = require('node:path');

const root = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';

module.exports = {
  root,
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT) || 3000,
  publicDir: path.join(root, 'public'),
  executablePath: path.join(root, 'bin', isWindows ? 'ShahaneBot.exe' : 'ShahaneBot'),
  databasePath: path.join(root, 'data', 'qa_database.txt'),
  maxQuestionLength: 500,
  maxBodyBytes: '10kb',
  startupTimeoutMs: 5000,
  requestTimeoutMs: 5000,
  publicHosts: [process.env.RENDER_EXTERNAL_HOSTNAME, ...(process.env.ALLOWED_HOSTS || '').split(',')]
    .map((host) => (host || '').trim())
    .filter(Boolean),
};
