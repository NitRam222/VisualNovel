const progressBar = document.querySelector('.progress-bar');
const menuButton = document.querySelector('.menu-toggle');
const menu = document.querySelector('.chapter-menu');
const soundButton = document.querySelector('.sound-toggle');
const soundLabel = soundButton.querySelector('.sound-label');
const homeScreen = document.querySelector('.home-screen');
const storyViews = [...document.querySelectorAll('.story-view')];
const storyMenuGroups = [...document.querySelectorAll('.story-nav__group')];

let activeStory = null;
let soundEnabled = true;
let audioContext;
let masterGain;
let ambienceTimer;

const safeStorage = {
  get(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, value); } catch { /* Storage can be blocked in preview contexts. */ }
  },
  remove(key) {
    try { window.localStorage.removeItem(key); } catch { /* Storage can be blocked in preview contexts. */ }
  }
};

function safePushState(state, hash) {
  try { history.pushState(state, '', hash); } catch { /* Some embedded previews block history changes. */ }
}

/* ------------------------------
   Reveal animations
------------------------------ */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.16, rootMargin: '0px 0px -7% 0px' });

document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));

/* ------------------------------
   Reading progress
------------------------------ */
function updateProgress() {
  if (!activeStory) {
    progressBar.style.width = '0%';
    return;
  }

  const scrollTop = window.scrollY;
  const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
  const progress = documentHeight > 0 ? (scrollTop / documentHeight) * 100 : 0;
  progressBar.style.width = `${Math.min(Math.max(progress, 0), 100)}%`;
}

window.addEventListener('scroll', updateProgress, { passive: true });

/* ------------------------------
   Main menu and story switching
------------------------------ */
function scrollToTarget(targetId, smooth = false) {
  const target = targetId ? document.getElementById(targetId) : null;
  window.requestAnimationFrame(() => {
    if (target) {
      target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
    }
    updateProgress();
  });
}

function markCurrentStory(story) {
  storyMenuGroups.forEach((group) => {
    const isCurrent = group.dataset.menuStory === story;
    group.classList.toggle('is-current', isCurrent);
    if (isCurrent) setStoryDropdown(group, true);
  });
}

function openStory(story, targetId = '', options = {}) {
  const selectedView = storyViews.find((view) => view.dataset.story === story);
  if (!selectedView) return;

  activeStory = story;
  homeScreen.hidden = true;
  storyViews.forEach((view) => { view.hidden = view !== selectedView; });
  document.body.classList.remove('is-home');
  markCurrentStory(story);
  safeStorage.set('encounters-last-story', story);

  const destination = targetId || selectedView.querySelector('.scene')?.id || '';
  if (options.updateHistory !== false && destination) {
    safePushState({ story, targetId: destination }, `#${destination}`);
  }

  scrollToTarget(destination, Boolean(options.smooth));
  if (soundEnabled) startAmbience();
}

function showHome(options = {}) {
  activeStory = null;
  homeScreen.hidden = false;
  storyViews.forEach((view) => { view.hidden = true; });
  document.body.classList.add('is-home');
  storyMenuGroups.forEach((group) => group.classList.remove('is-current'));

  if (options.updateHistory !== false) {
    safePushState({ home: true }, '#home');
  }

  scrollToTarget(options.targetId || 'home', Boolean(options.smooth));
}

document.querySelectorAll('[data-open-story]').forEach((button) => {
  button.addEventListener('click', () => openStory(button.dataset.openStory));
});

document.querySelectorAll('[data-show-home]').forEach((button) => {
  button.addEventListener('click', () => {
    setMenu(false);
    showHome();
  });
});

/* ------------------------------
   Expandable burger menu
------------------------------ */
function setMenu(open) {
  menu.classList.toggle('is-open', open);
  menu.setAttribute('aria-hidden', String(!open));
  menuButton.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('is-menu-open', open);
}

function setStoryDropdown(group, open) {
  const toggle = group.querySelector('.story-nav__toggle');
  const chapters = group.querySelector('.story-nav__chapters');
  toggle.setAttribute('aria-expanded', String(open));
  chapters.hidden = !open;
}

menuButton.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
menu.addEventListener('click', (event) => {
  if (event.target === menu) setMenu(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setMenu(false);
});

storyMenuGroups.forEach((group) => {
  group.querySelector('.story-nav__toggle').addEventListener('click', () => {
    const isOpen = group.querySelector('.story-nav__toggle').getAttribute('aria-expanded') === 'true';
    setStoryDropdown(group, !isOpen);
  });
});

document.querySelectorAll('[data-story-link]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    const story = link.dataset.storyLink;
    const targetId = link.getAttribute('href').slice(1);
    setMenu(false);
    openStory(story, targetId);
  });
});

/* ------------------------------
   Ambient sound, enabled by default
   Browsers begin playback on the first tap or key press.
------------------------------ */
const chordSets = {
  emmaus: [
    [146.83, 220.00, 293.66],
    [130.81, 196.00, 261.63],
    [164.81, 246.94, 329.63],
    [110.00, 164.81, 220.00]
  ],
  storm: [
    [98.00, 146.83, 196.00],
    [87.31, 130.81, 174.61],
    [110.00, 164.81, 220.00],
    [82.41, 123.47, 164.81]
  ],
  garden: [
    [174.61, 261.63, 349.23],
    [196.00, 293.66, 392.00],
    [164.81, 246.94, 329.63],
    [220.00, 329.63, 440.00]
  ],
  shore: [
    [146.83, 220.00, 329.63],
    [164.81, 246.94, 369.99],
    [130.81, 196.00, 293.66],
    [174.61, 261.63, 392.00]
  ],
  lazarus: [
    [110.00, 164.81, 246.94],
    [123.47, 185.00, 277.18],
    [98.00, 146.83, 220.00],
    [130.81, 196.00, 293.66]
  ],
  home: [
    [130.81, 196.00, 261.63],
    [146.83, 220.00, 293.66],
    [164.81, 246.94, 329.63]
  ]
};

function createTone(frequency, duration, delay = 0, volume = 0.018) {
  if (!audioContext || !masterGain) return;
  const now = audioContext.currentTime + delay;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.985, now + duration);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.85);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.1);
}

function playAmbiencePhrase() {
  if (!soundEnabled || !audioContext || audioContext.state !== 'running') return;
  const palette = chordSets[activeStory || 'home'];
  const chord = palette[Math.floor(Math.random() * palette.length)];
  chord.forEach((note, index) => createTone(note, 7.8, index * 0.14, activeStory === 'storm' ? 0.014 : 0.017));

  if (activeStory === 'storm') {
    createTone(49, 8.4, 0, 0.009);
  }
  if (activeStory === 'lazarus') {
    createTone(55, 8.8, 0, 0.006);
  }
  if (activeStory === 'shore') {
    createTone(293.66, 5.4, 1.1, 0.006);
  }
}

function prepareAudio() {
  if (audioContext) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  audioContext = new AudioContextClass();
  masterGain = audioContext.createGain();
  masterGain.gain.value = 0.0001;
  masterGain.connect(audioContext.destination);
}

function startAmbience() {
  if (!soundEnabled) return;
  prepareAudio();
  if (!audioContext || !masterGain) return;

  audioContext.resume().then(() => {
    masterGain.gain.cancelScheduledValues(audioContext.currentTime);
    masterGain.gain.setTargetAtTime(0.58, audioContext.currentTime, 0.3);
    if (!ambienceTimer) {
      playAmbiencePhrase();
      ambienceTimer = window.setInterval(playAmbiencePhrase, 7400);
    }
  }).catch(() => {
    // Playback will be attempted again after the next user interaction.
  });
}

function stopAmbience() {
  window.clearInterval(ambienceTimer);
  ambienceTimer = null;
  if (masterGain && audioContext) {
    masterGain.gain.cancelScheduledValues(audioContext.currentTime);
    masterGain.gain.setTargetAtTime(0.0001, audioContext.currentTime, 0.12);
  }
}

function renderSoundState() {
  soundButton.setAttribute('aria-pressed', String(soundEnabled));
  soundLabel.textContent = soundEnabled ? 'On' : 'Off';
}

soundButton.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  renderSoundState();
  if (soundEnabled) startAmbience();
  else stopAmbience();
});

function beginDefaultSound(event) {
  if (event.target.closest?.('.sound-toggle')) return;
  if (soundEnabled) startAmbience();
}

document.addEventListener('pointerdown', beginDefaultSound, { passive: true });
document.addEventListener('keydown', beginDefaultSound);
renderSoundState();

/* ------------------------------
   Story choices and endings
------------------------------ */
const endings = {
  emmaus: {
    stay: {
      result: 'You ask Him to stay. Hospitality becomes revelation.',
      final: 'You chose to make room. Recognition came after an invitation: stay with us.'
    },
    leave: {
      result: 'You hesitate. Yet grace is patient, and the invitation remains open.',
      final: 'You chose hesitation. The road is not closed. Christ still meets people inside their fear and waits for the heart to invite Him in.'
    },
    default: 'Every journey reaches the same invitation: make room, listen closely, and ask Him to remain.',
    next: 'emmaus-table'
  },
  storm: {
    waves: {
      result: 'You watch the waves. Fear grows around whatever receives your full attention.',
      final: 'You looked first at the waves. Christ did not shame the frightened disciples or abandon the boat. He spoke peace into the place they could not control.'
    },
    jesus: {
      result: 'You look toward Jesus. The storm remains real, but it is no longer the only reality.',
      final: 'You looked toward Jesus. Faith did not pretend the storm was small. It remembered that the One in the boat was greater.'
    },
    default: 'The question is not whether storms are powerful. It is whether their power is the greatest power present.',
    next: 'storm-stillness'
  },
  garden: {
    answers: {
      result: 'You seek an explanation. The mind wants a map through pain.',
      final: 'You searched for an explanation. Jesus answered more deeply by revealing Himself. Resurrection is not merely an idea that makes grief reasonable, but a Person who calls us by name.'
    },
    person: {
      result: 'You seek the Person. Love keeps looking when explanations run out.',
      final: 'You searched for the Lord Himself. Recognition came when He called your name, turning grief into witness and the mourner into a messenger.'
    },
    default: 'The risen Christ does not only reveal what happened. He reveals Himself and calls each disciple personally.',
    next: 'garden-name'
  },
  shore: {
    verdict: {
      result: 'You hear a verdict. Shame expects every question to become an accusation.',
      final: 'You first heard a verdict. Yet Jesus did not ask Peter to crush him. He asked because love was still present, and He gave that love a mission: feed My sheep.'
    },
    invitation: {
      result: 'You hear an invitation. Jesus is not trapping Peter in the past; He is leading him through it.',
      final: 'You heard an invitation. Christ returned Peter to the place of memory, restored his love, and trusted him with a future larger than his failure.'
    },
    default: 'Jesus does not define Peter by the worst night of his life. He restores him personally, then calls him forward.',
    next: 'shore-follow'
  },
  lazarus: {
    finality: {
      result: 'You bring what you can see. The stone and the silence feel more certain than any promise.',
      final: 'You brought the finality you could see. Jesus did not despise that fear. He wept beside it, then spoke into the darkness with an authority the tomb could not resist.'
    },
    promise: {
      result: 'You bring His promise. Nothing visible has changed, but you make room for His voice.',
      final: 'You held to His promise before the stone moved. Faith did not deny death; it listened for the One who is the resurrection and the life.'
    },
    default: 'At Bethany, Jesus reveals both the tenderness that weeps and the divine authority that calls life out of death.',
    next: 'lazarus-come-out'
  }
};

function applyChoice(story, choice, shouldScroll = false) {
  const storyEnding = endings[story];
  if (!storyEnding || !storyEnding[choice]) return;

  safeStorage.set(`encounters-choice-${story}`, choice);
  document.querySelectorAll(`[data-choice-story="${story}"]`).forEach((button) => {
    const selected = button.dataset.choice === choice;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });

  const result = document.querySelector(`[data-choice-result="${story}"]`);
  const personalEnding = document.querySelector(`[data-personal-ending="${story}"]`);
  if (result) result.textContent = storyEnding[choice].result;
  if (personalEnding) personalEnding.textContent = storyEnding[choice].final;

  if (shouldScroll) {
    window.setTimeout(() => scrollToTarget(storyEnding.next, true), 600);
  }
}

document.querySelectorAll('[data-choice-story]').forEach((button) => {
  button.addEventListener('click', () => applyChoice(button.dataset.choiceStory, button.dataset.choice, true));
});

Object.keys(endings).forEach((story) => {
  const savedChoice = safeStorage.get(`encounters-choice-${story}`);
  const personalEnding = document.querySelector(`[data-personal-ending="${story}"]`);
  if (savedChoice && endings[story][savedChoice]) applyChoice(story, savedChoice);
  else if (personalEnding) personalEnding.textContent = endings[story].default;
});

document.querySelectorAll('[data-restart-story]').forEach((button) => {
  button.addEventListener('click', () => {
    const story = button.dataset.restartStory;
    safeStorage.remove(`encounters-choice-${story}`);
    document.querySelectorAll(`[data-choice-story="${story}"]`).forEach((choiceButton) => {
      choiceButton.classList.remove('is-selected');
      choiceButton.setAttribute('aria-pressed', 'false');
    });
    const result = document.querySelector(`[data-choice-result="${story}"]`);
    const personalEnding = document.querySelector(`[data-personal-ending="${story}"]`);
    if (result) result.textContent = '';
    if (personalEnding) personalEnding.textContent = endings[story].default;
    const firstScene = document.querySelector(`[data-story="${story}"] .scene`);
    openStory(story, firstScene?.id || '');
  });
});

/* ------------------------------
   Cinematic parallax
------------------------------ */
const parallaxItems = [
  ['.moon', 0.06], ['.sun-glow', 0.035], ['.mountains', 0.025], ['.figure--jesus', 0.02], ['.cross-light', 0.03],
  ['.storm-sunset', 0.04], ['.deep-moon', 0.04], ['.calm-moon', 0.035],
  ['.garden-path', 0.018], ['.garden-sun', 0.035], ['.name-radiance', 0.02],
  ['.shore-dawn', 0.035], ['.charcoal-fire', 0.018], ['.sun-path', 0.03],
  ['.sealed-tomb', 0.018], ['.weeping-light', 0.024], ['.resurrection-beam', 0.018]
].flatMap(([selector, speed]) => [...document.querySelectorAll(selector)].map((element) => ({ element, speed })));

let parallaxTicking = false;
function updateParallax() {
  parallaxItems.forEach(({ element, speed }) => {
    if (!element.offsetParent) return;
    const section = element.closest('.scene');
    if (!section) return;
    const rect = section.getBoundingClientRect();
    const offset = (window.innerHeight - rect.top) * speed;
    element.style.translate = `0 ${Math.max(-40, Math.min(60, offset))}px`;
  });
  parallaxTicking = false;
}

window.addEventListener('scroll', () => {
  if (!parallaxTicking) {
    window.requestAnimationFrame(updateParallax);
    parallaxTicking = true;
  }
}, { passive: true });

/* ------------------------------
   Initial route and browser history
------------------------------ */
function routeFromHash(updateHistory = false) {
  const targetId = window.location.hash.replace('#', '');
  const target = targetId ? document.getElementById(targetId) : null;
  const storyView = target?.closest('.story-view');

  if (storyView) {
    openStory(storyView.dataset.story, targetId, { updateHistory });
  } else {
    showHome({ updateHistory, targetId: targetId === 'story-library' ? 'story-library' : 'home' });
  }
}

window.addEventListener('popstate', () => routeFromHash(false));
routeFromHash(false);
updateParallax();
