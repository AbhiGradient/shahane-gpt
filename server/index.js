const config = require('./config');
const { ChatbotEngine } = require('./engine');
const { createApp } = require('./app');

const engine = new ChatbotEngine(config);
const app = createApp(config, engine);

const missing = engine.checkFiles();
if (missing === 'missing-executable') {
  console.warn('Chatbot executable not found. Run "npm run build:cpp" first.');
} else if (missing === 'missing-database') {
  console.warn('Question database not found at data/qa_database.txt.');
}

const server = app.listen(config.port, config.host, () => {
  console.log(`Shahane GPT is running at http://localhost:${config.port}`);
  console.log(`Listening on ${config.host}:${config.port} (local only). Press Ctrl+C to stop.`);

  if (!missing) {
    engine.ping().catch((err) => console.error(`Chatbot warm-up failed: ${err.message}`));
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} is already in use.`);
    console.error('Close the other program using it, or start on another port with PORT=3001 (see README).');
  } else {
    console.error(`Server failed to start: ${err.message}`);
  }
  process.exit(1);
});

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\nShutting down...');
  engine.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
