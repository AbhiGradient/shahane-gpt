const express = require('express');
const { EngineError } = require('./engine');

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function createApp(config, engine) {
  const app = express();
  const allowedHosts = new Set([
    `localhost:${config.port}`,
    `127.0.0.1:${config.port}`,
    `[::1]:${config.port}`
  ]);

  config.publicHosts.forEach((host) => allowedHosts.add(host));

  app.disable('x-powered-by');


  app.use((req, res, next) => {
    if (!allowedHosts.has(req.headers.host)) {
      return res.status(403).json({ error: 'Forbidden host.' });
    }

    const origin = req.headers.origin;
    if (origin && req.method !== 'GET' && req.method !== 'HEAD') {
      const host = origin.replace(/^https?:\/\//, '');
      if (!allowedHosts.has(host)) {
        return res.status(403).json({ error: 'Forbidden origin.' });
      }
    }

    res.set({
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
        "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Resource-Policy': 'same-origin'
    });
    next();
  });

  app.use((req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      if (!req.path.startsWith('/api/')) return;
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      console.log(`${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(0)}ms`);
    });
    next();
  });

  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/health', async (req, res) => {
    const base = {
      app: 'Shahane GPT',
      maxQuestionLength: config.maxQuestionLength
    };

    const missing = engine.checkFiles();
    if (missing) {
      return res.status(503).json({ ...base, status: 'error', backend: missing });
    }

    try {
      const questions = await engine.ping();
      res.json({ ...base, status: 'ok', backend: 'ready', questions });
    } catch (err) {
      console.error(`health check failed: ${err.message}`);
      res.status(503).json({ ...base, status: 'error', backend: 'unavailable' });
    }
  });

  app.get('/api/questions', async (req, res, next) => {
    try {
      const questions = await engine.listQuestions();
      res.json({ questions });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/chat', express.json({ limit: config.maxBodyBytes, strict: true }), async (req, res, next) => {
    const question = req.body && req.body.question;

    if (typeof question !== 'string') {
      return res.status(400).json({ error: 'A "question" string is required.' });
    }

    const trimmed = question.trim();

    if (!trimmed) {
      return res.status(400).json({ error: 'The question cannot be empty.' });
    }

    if (trimmed.length > config.maxQuestionLength) {
      return res.status(400).json({
        error: `The question is too long (maximum ${config.maxQuestionLength} characters).`
      });
    }

    if (CONTROL_CHARS.test(trimmed)) {
      return res.status(400).json({ error: 'The question contains unsupported characters.' });
    }

    try {
      const reply = await engine.ask(trimmed);
      res.json({ answer: reply.answer, matched: reply.found === true });
    } catch (err) {
      next(err);
    }
  });

  app.use(express.static(config.publicDir, { index: 'index.html', maxAge: 0 }));

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  app.use((req, res) => {
    res.status(404).type('text/plain').send('Not found');
  });

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'The request body is not valid JSON.' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'The request is too large.' });
    }
    if (err.type === 'charset.unsupported' || err.type === 'encoding.unsupported') {
      return res.status(415).json({ error: 'Unsupported content encoding.' });
    }

    console.error(`request failed: ${err.stack || err.message}`);

    if (err instanceof EngineError) {
      if (err.code === 'timeout') {
        return res.status(504).json({ error: 'The chatbot took too long to respond.', code: 'timeout' });
      }
      if (err.code === 'missing-database') {
        return res.status(503).json({ error: 'The question database is missing.', code: 'missing-database' });
      }
      if (err.code === 'missing-executable') {
        return res.status(503).json({ error: 'The chatbot program has not been built yet.', code: 'missing-executable' });
      }
      return res.status(503).json({ error: 'The chatbot is currently unavailable.', code: 'unavailable' });
    }

    res.status(500).json({ error: 'Something went wrong on the server.', code: 'internal' });
  });

  return app;
}

module.exports = { createApp };
