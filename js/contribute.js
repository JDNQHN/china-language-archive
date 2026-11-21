import { LANGUAGES } from '../data/languages.js';
import { PROMPTS } from '../data/prompts.js';
import { backend, isLive } from './backend.js';

// "Record a word": contribute.html?lang=<language id>
// Steps: about you → agreement → sign in (live only) → record words → done.
// Text is shown in English and Chinese, because most speakers will read Chinese.

const MAX_SECONDS = 20;
const AGE_GROUPS = [
  { id: 'under-20', en: 'Under 20', zh: '20岁以下' },
  { id: '20-39', en: '20–39', zh: '20–39岁' },
  { id: '40-59', en: '40–59', zh: '40–59岁' },
  { id: '60-79', en: '60–79', zh: '60–79岁' },
  { id: '80+', en: '80 or over', zh: '80岁以上' },
];
const STATUS = {
  pending: { en: 'Waiting for review', zh: '等待审核' },
  approved: { en: 'Approved', zh: '已通过' },
  rejected: { en: 'Not accepted', zh: '未通过' },
};

const root = document.getElementById('contribute');
const params = new URLSearchParams(location.search);
const langById = new Map(LANGUAGES.map((l) => [l.id, l]));
const promptById = new Map(PROMPTS.map((p) => [p.id, p]));

const state = {
  user: null,
  profile: { language_id: '', variety: '', hometown: '', age_group: '' },
  done: new Set(),
  index: 0,
  take: null,      // { blob, url, durationMs } – the recording not yet sent
  sentCount: 0,
};

// ─────────────────────────────────────────────────────────────── helpers ──
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}

// English text with its Chinese translation underneath (or beside, inline).
function bi(en, zh, { inline = false } = {}) {
  return el('span', { class: inline ? 'bi bi-inline' : 'bi' },
    el('span', { class: 'bi-en', text: en }),
    el('span', { class: 'bi-zh', lang: 'zh-Hans', text: zh }));
}

function store(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify(value));
  } catch { return undefined; }
  return value;
}

function show(...children) {
  root.replaceChildren(
    isLive ? '' : el('p', { class: 'demo-banner' },
      bi('Demo mode — nothing is saved, recordings disappear when you leave the page.',
        '演示模式——录音不会被保存，离开页面后即消失。', { inline: true })),
    el('div', { class: 'flow' }, ...children));
  const focusTarget = root.querySelector('[data-autofocus]') || root.querySelector('h1');
  if (focusTarget) focusTarget.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

function stepLabel(n, total = isLive ? 4 : 3) {
  return el('p', { class: 'label step-label', text: `Step ${n} of ${total} · 第${n}步` });
}

function errorBox(err) {
  const msg = (err && err.message) || String(err);
  return el('p', { class: 'form-error', role: 'alert' },
    bi('Something went wrong. Please try again.', '出错了，请再试一次。'),
    el('span', { class: 'xsmall muted', text: msg }));
}

const langName = (id) => {
  const l = langById.get(id);
  return l ? `${l.name} · ${l.zh}` : id;
};

// ──────────────────────────────────────────────────────── step: about you ──
function renderAbout() {
  const p = state.profile;
  const select = el('select', { id: 'f-lang', required: true, 'data-autofocus': true },
    el('option', { value: '', text: 'Choose… 请选择…' }));
  for (const [group, label] of [['chinese', 'Chinese languages · 汉语方言'], ['other', 'Other languages · 其他语言']]) {
    const og = el('optgroup', { label });
    for (const l of LANGUAGES.filter((x) => (group === 'chinese') === (x.group === 'chinese'))) {
      og.append(el('option', { value: l.id, text: `${l.name} · ${l.zh}`, selected: l.id === p.language_id }));
    }
    select.append(og);
  }

  const variety = el('input', { id: 'f-variety', type: 'text', value: p.variety, autocomplete: 'off',
    placeholder: 'e.g. Meixian, Teochew, 梅县话, 潮州话' });
  const hometown = el('input', { id: 'f-hometown', type: 'text', value: p.hometown, autocomplete: 'off',
    placeholder: 'e.g. 广东梅县松口镇' });

  const ages = el('div', { class: 'choice-row', role: 'radiogroup', 'aria-labelledby': 'age-label' });
  for (const a of AGE_GROUPS) {
    ages.append(el('label', { class: 'choice' },
      el('input', { type: 'radio', name: 'age', value: a.id, checked: a.id === p.age_group }),
      bi(a.en, a.zh)));
  }

  const errorSlot = el('div');
  const form = el('form', { class: 'card form', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    if (!select.value) {
      errorSlot.replaceChildren(el('p', { class: 'form-error', role: 'alert' },
        bi('Please choose the language you speak.', '请选择您说的语言。')));
      select.focus();
      return;
    }
    state.profile = {
      language_id: select.value,
      variety: variety.value.trim(),
      hometown: hometown.value.trim(),
      age_group: (form.querySelector('input[name=age]:checked') || {}).value || '',
    };
    store('da-profile', state.profile);
    next('about');
  } },
    el('div', { class: 'field' },
      el('label', { for: 'f-lang' }, bi('Which language do you speak at home?', '您在家说什么语言？')),
      select),
    el('div', { class: 'field' },
      el('label', { for: 'f-variety' }, bi('What do you call your dialect?', '您怎么称呼自己的方言？'),
        el('span', { class: 'optional', text: 'Optional · 选填' })),
      variety),
    el('div', { class: 'field' },
      el('label', { for: 'f-hometown' }, bi('Where did you grow up?', '您在哪里长大？'),
        el('span', { class: 'optional', text: 'Optional · 选填' })),
      el('p', { class: 'hint', text: 'Town or village is most useful · 写到镇或村最好' }),
      hometown),
    el('fieldset', { class: 'field' },
      el('legend', { id: 'age-label' }, bi('Your age', '您的年龄'), el('span', { class: 'optional', text: 'Optional · 选填' })),
      ages),
    errorSlot,
    el('button', { class: 'btn btn-primary btn-block', type: 'submit' }, bi('Next', '下一步', { inline: true })));

  show(
    el('header', { class: 'flow-head' },
      stepLabel(1),
      el('h1', { tabindex: '-1' }, bi('Record your dialect', '录下您的方言')),
      el('p', { class: 'lede' }, bi(
        'We’ll show you everyday words. Say each one the way you would at home. It takes about a minute to start.',
        '我们会给您看一些日常用语，请用您在家里说话的方式读出来。一分钟就能开始。'))),
    form);
}

// ─────────────────────────────────────────────────────── step: agreement ──
function renderConsent() {
  const box = el('input', { type: 'checkbox', id: 'f-agree' });
  const errorSlot = el('div');
  show(
    el('header', { class: 'flow-head' },
      stepLabel(2),
      el('h1', { tabindex: '-1' }, bi('Before you record', '录音之前'))),
    el('div', { class: 'card form' },
      el('ul', { class: 'consent-list' },
        el('li', {}, bi('Your recordings will be public on this website once a reviewer has checked them.',
          '录音经审核后会公开在本网站上。')),
        el('li', {}, bi('We keep your town and age group with each recording, but never your email or name.',
          '我们会保存录音者的家乡和年龄段，但不会公开您的邮箱或姓名。')),
        el('li', {}, bi('Anyone may reuse the recordings, as long as they credit the archive and share in the same way (CC BY-SA 4.0).',
          '任何人都可以使用这些录音，但需注明出处并以相同方式共享（CC BY-SA 4.0）。')),
        el('li', {}, bi('You can delete a recording until it has been reviewed.',
          '审核之前，您可以随时删除自己的录音。'))),
      el('label', { class: 'agree', for: 'f-agree' }, box,
        bi('I agree, and these are my own voice recordings.', '我同意，并且录音是我本人的声音。')),
      errorSlot,
      el('div', { class: 'btn-row' },
        el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => renderAbout() }, bi('Back', '返回', { inline: true })),
        el('button', { class: 'btn btn-primary', type: 'button', 'data-autofocus': true, onclick: () => {
          if (!box.checked) {
            errorSlot.replaceChildren(el('p', { class: 'form-error', role: 'alert' },
              bi('Please tick the box to continue.', '请勾选后继续。')));
            return;
          }
          store('da-consent', true);
          next('consent');
        } }, bi('Continue', '继续', { inline: true })))));
}

// ───────────────────────────────────────────────────────── step: sign in ──
function renderSignin(email = '') {
  const input = el('input', { id: 'f-email', type: 'email', value: email, autocomplete: 'email', inputmode: 'email',
    'data-autofocus': true, placeholder: 'name@example.com' });
  const errorSlot = el('div');
  const send = el('button', { class: 'btn btn-primary btn-block', type: 'submit' }, bi('Send me a code', '发送验证码', { inline: true }));
  show(
    el('header', { class: 'flow-head' },
      stepLabel(3),
      el('h1', { tabindex: '-1' }, bi('Your email', '您的邮箱')),
      el('p', { class: 'lede' }, bi('We’ll email you a 6-digit code. No password needed.', '我们会发送一个6位数验证码，不需要密码。'))),
    el('form', { class: 'card form', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const value = input.value.trim();
      if (!/^\S+@\S+\.\S+$/.test(value)) {
        errorSlot.replaceChildren(el('p', { class: 'form-error', role: 'alert' }, bi('Please enter your email address.', '请输入邮箱地址。')));
        return;
      }
      send.disabled = true;
      try {
        await backend.sendCode(value);
        renderCode(value);
      } catch (err) {
        send.disabled = false;
        errorSlot.replaceChildren(errorBox(err));
      }
    } },
      el('div', { class: 'field' }, el('label', { for: 'f-email' }, bi('Email address', '邮箱地址')), input),
      errorSlot,
      send));
}

function renderCode(email) {
  const input = el('input', { id: 'f-code', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code',
    maxlength: '6', pattern: '[0-9]*', class: 'code-input', 'data-autofocus': true });
  const errorSlot = el('div');
  const go = el('button', { class: 'btn btn-primary btn-block', type: 'submit' }, bi('Sign in', '登录', { inline: true }));
  show(
    el('header', { class: 'flow-head' },
      stepLabel(3),
      el('h1', { tabindex: '-1' }, bi('Enter the code', '输入验证码')),
      el('p', { class: 'lede' }, bi(`We sent it to ${email}.`, `验证码已发送至 ${email}。`))),
    el('form', { class: 'card form', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const code = input.value.replace(/\D/g, '');
      if (code.length !== 6) {
        errorSlot.replaceChildren(el('p', { class: 'form-error', role: 'alert' }, bi('The code has 6 digits.', '验证码是6位数字。')));
        return;
      }
      go.disabled = true;
      try {
        state.user = await backend.verifyCode(email, code);
        next('signin');
      } catch (err) {
        go.disabled = false;
        errorSlot.replaceChildren(errorBox(err));
      }
    } },
      el('div', { class: 'field' }, el('label', { for: 'f-code' }, bi('6-digit code', '6位验证码')), input),
      errorSlot,
      go,
      el('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => renderSignin(email) },
        bi('Use a different email / send again', '换个邮箱 / 重新发送', { inline: true }))));
}

// ─────────────────────────────────────────────────────────── step: record ──
const recorder = {
  media: null, stream: null, chunks: [], startedAt: 0, timer: null, audioCtx: null, raf: null,

  pickType() {
    const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
    return (window.MediaRecorder && types.find((t) => MediaRecorder.isTypeSupported(t))) || '';
  },

  async start({ onTick, onLevel, onStop }) {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const type = this.pickType();
    this.media = new MediaRecorder(this.stream, type ? { mimeType: type } : undefined);
    this.chunks = [];
    this.media.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.media.onstop = () => {
      const durationMs = Math.round(performance.now() - this.startedAt);
      const blob = new Blob(this.chunks, { type: this.media.mimeType || type || 'audio/webm' });
      this.release();
      onStop({ blob, durationMs, url: URL.createObjectURL(blob) });
    };
    this.media.start();
    this.startedAt = performance.now();
    this.timer = setInterval(() => {
      const s = (performance.now() - this.startedAt) / 1000;
      onTick(s);
      if (s >= MAX_SECONDS) this.stop();
    }, 200);
    this.meter(onLevel);
  },

  // A ring that grows with the voice, so people can see the microphone hears them.
  meter(onLevel) {
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 512;
      this.audioCtx.createMediaStreamSource(this.stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const loop = () => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        onLevel(Math.min(1, peak / 64));
        this.raf = requestAnimationFrame(loop);
      };
      loop();
    } catch { /* level meter is optional */ }
  },

  stop() {
    if (this.media && this.media.state !== 'inactive') this.media.stop();
  },

  release() {
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    if (this.audioCtx) this.audioCtx.close().catch(() => {});
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.audioCtx = null;
    this.stream = null;
  },
};

function firstUndone(from = 0) {
  for (let i = from; i < PROMPTS.length; i++) if (!state.done.has(PROMPTS[i].id)) return i;
  for (let i = 0; i < from; i++) if (!state.done.has(PROMPTS[i].id)) return i;
  return -1;
}

// One button: tap to start, tap again to stop.
function toggleRecording() {
  if (recorder.media && recorder.media.state === 'recording') recorder.stop();
  else startRecording();
}

async function startRecording() {
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    renderRecord({ error: 'unsupported' });
    return;
  }
  const ring = root.querySelector('.rec-ring');
  const time = root.querySelector('.rec-time');
  const btn = root.querySelector('.rec-btn');
  try {
    await recorder.start({
      onTick: (s) => { time.textContent = `${Math.floor(s)}s / ${MAX_SECONDS}s`; },
      onLevel: (v) => { ring.style.setProperty('--level', v.toFixed(2)); },
      onStop: (take) => { state.take = take; renderRecord(); },
    });
  } catch (err) {
    renderRecord({ error: err && err.name === 'NotAllowedError' ? 'denied' : 'mic', detail: err });
    return;
  }
  btn.classList.add('recording');
  btn.setAttribute('aria-pressed', 'true');
  btn.querySelector('.rec-btn-text').replaceChildren(bi('Stop', '停止', { inline: true }));
  time.textContent = `0s / ${MAX_SECONDS}s`;
}

function renderRecord({ error, detail, flash } = {}) {
  const prompt = PROMPTS[state.index];
  const lang = langById.get(state.profile.language_id);
  const doneCount = PROMPTS.filter((p) => state.done.has(p.id)).length;

  const head = el('header', { class: 'rec-head' },
    el('div', { class: 'rec-lang' },
      el('span', { class: 'rec-lang-bar', style: `background:${lang ? lang.color : 'var(--accent)'}` }),
      el('span', { text: langName(state.profile.language_id) }),
      el('button', { class: 'link-btn', type: 'button', onclick: () => { discardTake(); renderAbout(); } }, bi('Change', '更改', { inline: true }))),
    el('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(PROMPTS.length),
      'aria-valuenow': String(doneCount), 'aria-label': 'Words recorded' },
      el('span', { class: 'progress-fill', style: `width:${(doneCount / PROMPTS.length) * 100}%` })),
    el('p', { class: 'xsmall muted', text: `${doneCount} of ${PROMPTS.length} recorded · 已录 ${doneCount}/${PROMPTS.length}` }));

  const card = el('section', { class: 'card prompt-card', 'aria-labelledby': 'prompt-word' },
    el('p', { class: 'label', text: 'How do you say… · 您怎么说…' }),
    el('h1', { id: 'prompt-word', class: 'prompt-word', tabindex: '-1' },
      el('span', { class: 'prompt-zh', lang: 'zh-Hans', text: prompt.zh }),
      el('span', { class: 'prompt-en', text: prompt.en })),
    el('p', { class: 'hint', text: 'Say it the way you would at home — not in Mandarin. · 请用家乡话说，不要说普通话。' }));

  if (flash) card.prepend(el('p', { class: 'flash', role: 'status' }, bi('Sent — thank you! It will appear after review.', '已发送，谢谢！审核后会显示出来。', { inline: true })));

  if (error) {
    const messages = {
      denied: ['The microphone is blocked. Allow microphone access in your browser settings, then try again.', '麦克风被禁止。请在浏览器设置中允许使用麦克风，然后再试一次。'],
      unsupported: ['This browser can’t record audio. Please try Chrome, Safari or Firefox.', '此浏览器无法录音，请使用 Chrome、Safari 或 Firefox。'],
      mic: ['We couldn’t start the microphone.', '无法启动麦克风。'],
    };
    const [en, zh] = messages[error] || messages.mic;
    card.append(el('p', { class: 'form-error', role: 'alert' }, bi(en, zh),
      detail ? el('span', { class: 'xsmall muted', text: detail.message || String(detail) }) : null));
  }

  if (!state.take) {
    card.append(
      el('div', { class: 'rec-area' },
        el('button', { class: 'rec-btn', type: 'button', 'aria-pressed': 'false', 'data-autofocus': true, onclick: toggleRecording },
          el('span', { class: 'rec-ring', 'aria-hidden': 'true' }),
          el('span', { class: 'rec-icon', 'aria-hidden': 'true' }),
          el('span', { class: 'rec-btn-text' }, bi('Record', '录音', { inline: true }))),
        el('p', { class: 'rec-time xsmall muted', 'aria-live': 'off', text: 'Tap to start · 点击开始' })),
      el('div', { class: 'btn-row btn-row-split' },
        el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => goTo(state.index + 1) }, bi('Skip this one', '跳过', { inline: true })),
        doneCount ? el('button', { class: 'btn btn-ghost', type: 'button', onclick: renderDone }, bi('Finish for now', '先到这里', { inline: true })) : null));
  } else {
    const transcription = el('input', { id: 'f-chars', type: 'text', autocomplete: 'off', placeholder: 'e.g. 食饭' });
    const romanisation = el('input', { id: 'f-roman', type: 'text', autocomplete: 'off', placeholder: 'e.g. sik6 faan6' });
    const errorSlot = el('div');
    const sendBtn = el('button', { class: 'btn btn-primary', type: 'submit', 'data-autofocus': true }, bi('Send', '发送', { inline: true }));
    card.append(
      el('form', { class: 'take', onsubmit: async (e) => {
        e.preventDefault();
        sendBtn.disabled = true;
        sendBtn.replaceChildren(bi('Sending…', '发送中…', { inline: true }));
        try {
          await backend.submitRecording({
            blob: state.take.blob,
            durationMs: state.take.durationMs,
            promptId: prompt.id,
            languageId: state.profile.language_id,
            variety: state.profile.variety,
            hometown: state.profile.hometown,
            ageGroup: state.profile.age_group,
            transcription: transcription.value.trim(),
            romanisation: romanisation.value.trim(),
          });
          state.done.add(prompt.id);
          state.sentCount += 1;
          store(`da-done-${state.profile.language_id}`, [...state.done]);
          discardTake();
          const nextIndex = firstUndone(state.index + 1);
          if (nextIndex === -1) renderDone();
          else { state.index = nextIndex; renderRecord({ flash: true }); }
        } catch (err) {
          sendBtn.disabled = false;
          sendBtn.replaceChildren(bi('Send', '发送', { inline: true }));
          errorSlot.replaceChildren(errorBox(err));
        }
      } },
        el('p', { class: 'label', text: 'Listen back · 回放' }),
        el('audio', { controls: true, src: state.take.url, preload: 'auto' }),
        el('details', { class: 'write-it' },
          el('summary', {}, bi('Write it down too (optional)', '也可以写下来（选填）', { inline: true })),
          el('div', { class: 'field' }, el('label', { for: 'f-chars' }, bi('In characters', '用汉字写')), transcription),
          el('div', { class: 'field' }, el('label', { for: 'f-roman' }, bi('In romanisation (e.g. Jyutping, Pe̍h-ōe-jī)', '拼音 / 罗马字')), romanisation)),
        errorSlot,
        el('div', { class: 'btn-row btn-row-split' },
          el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { discardTake(); renderRecord(); } },
            bi('Record again', '重录', { inline: true })),
          sendBtn)));
  }

  show(head, card);
}

function discardTake() {
  if (recorder.media) { recorder.media.onstop = null; recorder.stop(); recorder.media = null; }
  recorder.release();
  if (state.take) URL.revokeObjectURL(state.take.url);
  state.take = null;
}

function goTo(i) {
  discardTake();
  state.index = ((i % PROMPTS.length) + PROMPTS.length) % PROMPTS.length;
  renderRecord();
}

// ───────────────────────────────────────────────────────────── step: done ──
async function renderDone() {
  discardTake();
  const list = el('ul', { class: 'mine' }, el('li', { class: 'muted small', text: 'Loading… 加载中…' }));
  show(
    el('header', { class: 'flow-head' },
      el('h1', { tabindex: '-1' }, bi('Thank you!', '谢谢您！')),
      el('p', { class: 'lede' }, bi(
        'A reviewer will listen to your recordings. Once approved, they appear on the language’s page for anyone to hear.',
        '审核员会听您的录音。通过后，录音会出现在该语言的页面上，所有人都能听到。'))),
    el('div', { class: 'btn-stack' },
      firstUndone() !== -1
        ? el('button', { class: 'btn btn-primary', type: 'button', 'data-autofocus': true, onclick: () => goTo(firstUndone()) }, bi('Record more words', '继续录音', { inline: true }))
        : null,
      el('a', { class: 'btn btn-ghost', href: `language.html?id=${encodeURIComponent(state.profile.language_id)}` },
        bi(`Go to the ${langById.get(state.profile.language_id)?.name || 'language'} page`, '查看语言页面', { inline: true }))),
    el('section', { class: 'card' },
      el('h2', { class: 'label', text: 'Your recordings · 您的录音' }),
      list));
  try {
    const rows = await backend.listMine();
    list.replaceChildren(...(rows.length ? rows.map((r) => {
      const p = promptById.get(r.prompt_id);
      const s = STATUS[r.status] || STATUS.pending;
      return el('li', {},
        el('span', { class: 'mine-word' },
          el('span', { lang: 'zh-Hans', text: p ? p.zh : r.prompt_id }),
          el('span', { class: 'muted small', text: `${p ? p.en : ''} · ${langName(r.language_id)}` })),
        el('span', { class: `status status-${r.status}` }, bi(s.en, s.zh, { inline: true })));
    }) : [el('li', { class: 'muted small', text: 'None yet · 暂无' })]));
  } catch (err) {
    list.replaceChildren(el('li', {}, errorBox(err)));
  }
}

// ─────────────────────────────────────────────────────────────── routing ──
async function loadDone() {
  const local = store(`da-done-${state.profile.language_id}`) || [];
  state.done = new Set(local);
  try {
    const rows = await backend.listMine();
    for (const r of rows) if (r.language_id === state.profile.language_id) state.done.add(r.prompt_id);
  } catch { /* fall back to what this browser remembers */ }
}

async function enterRecording() {
  if (isLive || state.user) {
    try { await backend.saveProfile(state.profile); } catch { /* not essential */ }
  }
  await loadDone();
  const i = firstUndone(0);
  if (i === -1) { renderDone(); return; }
  state.index = i;
  renderRecord();
}

// Decide what comes after a finished step.
function next(after) {
  const consented = store('da-consent') === true;
  if (after === 'about' && !consented) return renderConsent();
  if (isLive && !state.user) return renderSignin();
  return enterRecording();
}

async function init() {
  root.replaceChildren(el('p', { class: 'muted', text: 'Loading… 加载中…' }));
  const saved = store('da-profile');
  if (saved) Object.assign(state.profile, saved);
  try {
    state.user = await backend.getUser();
    if (state.user) {
      const prof = await backend.getProfile();
      if (prof) for (const k of Object.keys(state.profile)) if (prof[k]) state.profile[k] = prof[k];
    }
  } catch (err) {
    root.replaceChildren(errorBox(err));
    return;
  }
  const fromLink = params.get('lang');
  if (fromLink && langById.has(fromLink)) state.profile.language_id = fromLink;

  // Returning speakers with everything set go straight to the words.
  if (state.profile.language_id && store('da-consent') === true && (!isLive || state.user) && !fromLink) {
    enterRecording();
  } else {
    renderAbout();
  }
}

window.addEventListener('beforeunload', () => recorder.release());
init();
