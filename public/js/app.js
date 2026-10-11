import { ApiError, getHealth, getQuestions, sendQuestion } from './api.js';
import { botMessage, el, icon, stateCard, typingMessage, userMessage } from './dom.js';

const $ = (id) => document.getElementById(id);

const ui = {
  app: $('app'),
  sidebar: $('sidebar'),
  scrim: $('scrim'),
  conversation: $('conversation'),
  welcome: $('welcome'),
  messages: $('messages'),
  suggestionGrid: $('suggestionGrid'),
  welcomeActions: $('welcomeActions'),
  sidebarQuestions: $('sidebarQuestions'),
  input: $('input'),
  sendBtn: $('sendBtn'),
  clearInput: $('clearInput'),
  clearChat: $('clearChat'),
  counter: $('counter'),
  statusPill: $('statusPill'),
  sidebarStatus: $('sidebarStatus'),
  browseDialog: $('browseDialog'),
  browseSearch: $('browseSearch'),
  browseList: $('browseList'),
  browseCount: $('browseCount'),
  browseState: $('browseState'),
  toast: $('toast'),
  toastText: $('toastText'),
  toastAction: $('toastAction')
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const state = {
  busy: false,
  backend: 'checking',
  maxLength: 500,
  questions: [],
  questionsStatus: 'loading',
  questionsProblem: null,
  order: [],
  snapshot: null,
  toastTimer: null
};

const STATUS = {
  checking: { tone: 'checking', label: 'Checking engine…' },
  starting: { tone: 'starting', label: 'Starting up…' },
  ready: { tone: 'ready', label: 'Local engine ready' },
  'missing-executable': { tone: 'error', label: 'Chatbot not built' },
  'missing-database': { tone: 'error', label: 'Database missing' },
  unavailable: { tone: 'error', label: 'Backend unavailable' },
  unreachable: { tone: 'error', label: 'Server unreachable' }
};

function setStatus(key) {
  state.backend = key;
  const { tone, label } = STATUS[key] || STATUS.unavailable;
  for (const node of [ui.statusPill, ui.sidebarStatus]) {
    node.dataset.state = tone;
    node.querySelector('.status-text').textContent = label;
  }
}

function shuffle(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scrollToEnd() {
  ui.conversation.scrollTo({
    top: ui.conversation.scrollHeight,
    behavior: reducedMotion.matches ? 'auto' : 'smooth'
  });
}

function hasMessages() {
  return ui.messages.childElementCount > 0;
}

function syncView() {
  ui.welcome.hidden = hasMessages();
  ui.clearChat.disabled = !hasMessages();
}

function syncComposer() {
  const value = ui.input.value;
  ui.sendBtn.disabled = state.busy || !value.trim();
  ui.clearInput.hidden = value.length === 0;

  const nearLimit = value.length >= state.maxLength * 0.8;
  ui.counter.hidden = !nearLimit;
  ui.counter.textContent = `${value.length} / ${state.maxLength}`;
  ui.counter.classList.toggle('near', value.length >= state.maxLength * 0.95);

  ui.input.style.height = 'auto';
  ui.input.style.height = `${Math.min(ui.input.scrollHeight, 168)}px`;
}

function setBusy(value) {
  state.busy = value;
  syncComposer();
  document.querySelectorAll('.suggestion-card, .question-item').forEach((node) => {
    node.disabled = value;
  });
}

function showToast(message, action) {
  clearTimeout(state.toastTimer);
  ui.toastText.textContent = message;
  ui.toastAction.hidden = !action;
  ui.toastAction.onclick = action || null;
  ui.toast.hidden = false;
  state.toastTimer = setTimeout(hideToast, 7000);
}

function hideToast() {
  clearTimeout(state.toastTimer);
  ui.toast.hidden = true;
}

function visibleSuggestions(count, offset = 0) {
  return state.order.slice(offset, offset + count).map((index) => state.questions[index]);
}

function renderSuggestions() {
  ui.suggestionGrid.replaceChildren();
  ui.sidebarQuestions.replaceChildren();
  ui.welcomeActions.hidden = true;

  if (state.questionsStatus === 'loading') {
    ui.suggestionGrid.append(...Array.from({ length: 4 }, () => el('div', { className: 'skeleton' })));
    return;
  }

  if (state.questionsStatus === 'error') {
    const problem = state.questionsProblem;
    ui.suggestionGrid.append(
      stateCard({
        title: problem === 'missing-database' ? 'Question database missing' : 'Suggestions unavailable',
        message:
          problem === 'missing-database'
            ? 'The file data/qa_database.txt could not be found.'
            : 'The local chatbot did not return its question list.',
        actionLabel: 'Try again',
        onAction: () => initialize()
      })
    );
    ui.sidebarQuestions.append(el('li', { className: 'bubble-note', text: 'Questions could not be loaded.' }));
    return;
  }

  if (!state.questions.length) {
    ui.suggestionGrid.append(
      stateCard({
        title: 'No questions available',
        message: 'The knowledge base does not contain any questions yet.',
        iconName: 'list'
      })
    );
    ui.sidebarQuestions.append(el('li', { className: 'bubble-note', text: 'No questions available.' }));
    return;
  }

  visibleSuggestions(4).forEach((question) => {
    ui.suggestionGrid.append(
      el('button', { className: 'suggestion-card', attrs: { type: 'button' }, on: { click: () => send(question) } }, [
        el('span', { text: question }),
        icon('arrow')
      ])
    );
  });

  visibleSuggestions(6, 4).forEach((question) => {
    ui.sidebarQuestions.append(
      el('li', {}, [
        el('button', {
          className: 'question-item',
          text: question,
          attrs: { type: 'button', title: question },
          on: {
            click: () => {
              closeDrawer();
              send(question);
            }
          }
        })
      ])
    );
  });

  ui.welcomeActions.hidden = false;
}

function reshuffle() {
  state.order = shuffle(state.questions.map((_, index) => index));
  renderSuggestions();
}

async function loadQuestions() {
  state.questionsStatus = 'loading';
  renderSuggestions();

  try {
    state.questions = await getQuestions();
    state.questionsStatus = 'ready';
    state.order = shuffle(state.questions.map((_, index) => index));
  } catch (error) {
    state.questionsStatus = 'error';
    state.questionsProblem = error instanceof ApiError ? error.code : null;
  }

  renderSuggestions();
}

async function checkHealth({ retries = 0 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const health = await getHealth();
      if (typeof health.maxQuestionLength === 'number') {
        state.maxLength = health.maxQuestionLength;
        ui.input.maxLength = health.maxQuestionLength;
      }
      setStatus(health.backend === 'ready' ? 'ready' : STATUS[health.backend] ? health.backend : 'unavailable');
      return health.backend === 'ready';
    } catch {
      if (attempt >= retries) {
        setStatus('unreachable');
        return false;
      }
      setStatus('starting');
      await sleep(700);
    }
  }
}

async function initialize() {
  setStatus('checking');
  state.questionsStatus = 'loading';
  renderSuggestions();

  const ready = await checkHealth({ retries: 4 });

  if (ready) {
    await loadQuestions();
    return;
  }

  state.questionsStatus = 'error';
  state.questionsProblem = state.backend === 'missing-database' ? 'missing-database' : null;
  renderSuggestions();
}

function friendlyError(error) {
  if (error.kind === 'timeout') {
    return { message: 'The request timed out before the chatbot answered.', note: 'Please try again in a moment.' };
  }
  if (error.kind === 'network') {
    return { message: 'I could not reach the local server.', note: 'Check that the terminal running npm start is still open.' };
  }
  if (error.status === 400) {
    return { message: error.message, note: null };
  }
  if (error.code === 'missing-executable') {
    return { message: 'The chatbot program has not been built yet.', note: 'Run npm run build:cpp, then restart the server.' };
  }
  if (error.code === 'missing-database') {
    return { message: 'The question database could not be found.', note: 'Make sure data/qa_database.txt exists.' };
  }
  return { message: error.message || 'Something went wrong while finding an answer.', note: 'Please try again.' };
}

async function runQuery(text) {
  setBusy(true);
  const typing = typingMessage();
  ui.messages.append(typing);
  scrollToEnd();

  try {
    const reply = await sendQuestion(text);
    typing.remove();

    if (reply.matched) {
      ui.messages.append(botMessage(reply.answer));
    } else {
      ui.messages.append(
        botMessage(reply.answer, {
          variant: 'nomatch',
          note: 'Try different keywords, or browse the questions I know.',
          actions: [{ label: 'Browse questions', iconName: 'list', onClick: openBrowse }]
        })
      );
    }
  } catch (error) {
    typing.remove();
    const { message, note } = friendlyError(error instanceof ApiError ? error : new ApiError('Unexpected error'));

    const row = botMessage(message, {
      variant: 'error',
      note,
      actions:
        error.status === 400
          ? []
          : [
              {
                label: 'Try again',
                iconName: 'refresh',
                onClick: () => {
                  row.remove();
                  runQuery(text);
                }
              }
            ]
    });

    ui.messages.append(row);
    checkHealth();
  } finally {
    setBusy(false);
    syncView();
    scrollToEnd();
    if (!ui.browseDialog.open && !ui.sidebar.classList.contains('open')) ui.input.focus();
  }
}

function send(raw) {
  const text = String(raw).trim();

  if (!text || state.busy) return;

  if (text.length > state.maxLength) {
    showToast(`Please keep questions under ${state.maxLength} characters.`);
    return;
  }

  state.snapshot = null;
  hideToast();

  ui.messages.append(userMessage(text));
  ui.input.value = '';
  syncComposer();
  syncView();
  runQuery(text);
}

function clearConversation() {
  if (state.busy || !hasMessages()) return;

  const nodes = Array.from(ui.messages.childNodes);
  state.snapshot = nodes;
  ui.messages.replaceChildren();
  syncView();
  ui.conversation.scrollTo({ top: 0 });

  showToast('Conversation cleared', () => {
    if (!state.snapshot) return;
    ui.messages.replaceChildren(...state.snapshot);
    state.snapshot = null;
    hideToast();
    syncView();
    scrollToEnd();
  });
}

function openDrawer() {
  ui.sidebar.classList.add('open');
  ui.scrim.hidden = false;
  ui.sidebar.querySelector('button').focus();
}

function closeDrawer() {
  if (!ui.sidebar.classList.contains('open')) return;
  ui.sidebar.classList.remove('open');
  ui.scrim.hidden = true;
}

function renderBrowseList() {
  const term = ui.browseSearch.value.trim().toLowerCase();
  ui.browseList.replaceChildren();
  ui.browseState.replaceChildren();
  ui.browseState.hidden = true;

  if (state.questionsStatus !== 'ready') {
    ui.browseCount.textContent = '';
    ui.browseState.hidden = false;
    ui.browseState.append(
      stateCard({
        title: 'Questions unavailable',
        message: 'The question list could not be loaded from the local chatbot.',
        actionLabel: 'Try again',
        onAction: async () => {
          await initialize();
          renderBrowseList();
        }
      })
    );
    return;
  }

  if (!state.questions.length) {
    ui.browseCount.textContent = '';
    ui.browseState.hidden = false;
    ui.browseState.append(
      stateCard({ title: 'No questions available', message: 'The knowledge base is empty.', iconName: 'list' })
    );
    return;
  }

  const matches = term ? state.questions.filter((question) => question.toLowerCase().includes(term)) : state.questions;

  if (!matches.length) {
    ui.browseCount.textContent = '0 results';
    ui.browseState.hidden = false;
    ui.browseState.append(
      stateCard({
        title: 'No matching questions',
        message: `Nothing in the knowledge base matches “${ui.browseSearch.value.trim()}”.`,
        iconName: 'search'
      })
    );
    return;
  }

  ui.browseCount.textContent = term
    ? `${matches.length} of ${state.questions.length} questions`
    : `${state.questions.length} questions`;

  const fragment = document.createDocumentFragment();
  matches.forEach((question) => {
    fragment.append(
      el('li', {}, [
        el('button', {
          className: 'browse-item',
          text: question,
          attrs: { type: 'button' },
          on: {
            click: () => {
              ui.browseDialog.close();
              send(question);
            }
          }
        })
      ])
    );
  });
  ui.browseList.append(fragment);
}

function openBrowse() {
  closeDrawer();
  ui.browseSearch.value = '';
  renderBrowseList();
  if (!ui.browseDialog.open) ui.browseDialog.showModal();
  ui.browseSearch.focus();
}

ui.input.addEventListener('input', syncComposer);

ui.input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    send(ui.input.value);
  }
});

ui.sendBtn.addEventListener('click', () => send(ui.input.value));

ui.clearInput.addEventListener('click', () => {
  ui.input.value = '';
  syncComposer();
  ui.input.focus();
});

$('newChat').addEventListener('click', () => {
  closeDrawer();
  if (hasMessages()) clearConversation();
  ui.input.focus();
});

ui.clearChat.addEventListener('click', () => {
  closeDrawer();
  clearConversation();
});

$('menuBtn').addEventListener('click', openDrawer);
$('drawerClose').addEventListener('click', closeDrawer);
ui.scrim.addEventListener('click', closeDrawer);

$('shuffleSidebar').addEventListener('click', reshuffle);
$('shuffleWelcome').addEventListener('click', reshuffle);
$('browseBtn').addEventListener('click', openBrowse);
$('browseWelcome').addEventListener('click', openBrowse);
$('browseClose').addEventListener('click', () => ui.browseDialog.close());
ui.browseSearch.addEventListener('input', renderBrowseList);

ui.browseDialog.addEventListener('click', (event) => {
  if (event.target === ui.browseDialog) ui.browseDialog.close();
});

ui.browseDialog.addEventListener('close', () => ui.input.focus());

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeDrawer();
});

window.matchMedia('(min-width: 901px)').addEventListener('change', (event) => {
  if (event.matches) closeDrawer();
});

setInterval(() => {
  if (document.hidden || state.busy) return;
  const wasReady = state.backend === 'ready';
  checkHealth().then((ready) => {
    if (ready && !wasReady && state.questionsStatus !== 'ready') loadQuestions();
  });
}, 20000);

syncView();
syncComposer();
initialize().then(() => ui.input.focus());
