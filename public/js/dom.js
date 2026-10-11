const SVG_NS = 'http://www.w3.org/2000/svg';

export function el(tag, { className, text, attrs, on } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  }
  if (on) {
    for (const [event, handler] of Object.entries(on)) node.addEventListener(event, handler);
  }
  for (const child of children) node.append(child);
  return node;
}

export function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function avatar() {
  return el('span', { className: 'avatar' }, [icon('logo')]);
}

export function userMessage(text) {
  return el('article', { className: 'msg user' }, [
    el('div', { className: 'msg-body' }, [
      el('div', { className: 'bubble', text }),
      el('span', { className: 'meta', text: `You · ${formatTime(new Date())}` })
    ])
  ]);
}

export function botMessage(text, { variant = 'answer', note, actions = [] } = {}) {
  const bubble = el('div', { className: 'bubble', text });
  if (note) bubble.append(el('p', { className: 'bubble-note', text: note }));

  const body = el('div', { className: 'msg-body' }, [bubble]);

  if (actions.length) {
    body.append(
      el(
        'div',
        { className: 'msg-actions' },
        actions.map(({ label, iconName, onClick }) =>
          el('button', { className: 'btn btn-secondary', attrs: { type: 'button' }, on: { click: onClick } }, [
            ...(iconName ? [icon(iconName)] : []),
            el('span', { text: label })
          ])
        )
      )
    );
  }

  body.append(el('span', { className: 'meta', text: `Shahane GPT · ${formatTime(new Date())}` }));

  return el('article', { className: `msg bot ${variant}` }, [avatar(), body]);
}

export function typingMessage() {
  const indicator = el('div', { className: 'typing' }, [
    el('span', { className: 'typing-dots', attrs: { 'aria-hidden': 'true' } }, [
      el('span'),
      el('span'),
      el('span')
    ]),
    el('span', { text: 'Finding an answer…' })
  ]);

  return el('article', { className: 'msg bot', attrs: { 'aria-label': 'Shahane GPT is typing' } }, [
    avatar(),
    el('div', { className: 'msg-body' }, [el('div', { className: 'bubble' }, [indicator])])
  ]);
}

export function stateCard({ title, message, iconName = 'alert', actionLabel, onAction }) {
  const card = el('div', { className: 'state-card' }, [
    icon(iconName),
    el('strong', { text: title }),
    el('span', { text: message })
  ]);

  if (actionLabel && onAction) {
    card.append(
      el('button', { className: 'btn btn-secondary', attrs: { type: 'button' }, on: { click: onAction } }, [
        icon('refresh'),
        el('span', { text: actionLabel })
      ])
    );
  }

  return card;
}
