(function () {
  const canvas = document.getElementById('gameCanvas');
  if (!canvas || !window.LEVELS || window.LEVELS.length === 0) {
    return;
  }

  const ctx = canvas.getContext('2d');

  const levelNameEl = document.getElementById('levelName');
  const levelSizeEl = document.getElementById('levelSize');
  const levelProgressEl = document.getElementById('levelProgress');
  const scoreValueEl = document.getElementById('scoreValue');

  const timeValueEl = document.getElementById('timeValue');
  const movesValueEl = document.getElementById('movesValue');

  const startBtn = document.getElementById('startBtn');
  const startScreenBtn = document.getElementById('startScreenBtn');
  const resetBtn = document.getElementById('resetBtn');
  const levelSelect = document.getElementById('levelSelect');
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  const reduceEffectsBtn = document.getElementById('reduceEffectsBtn');

  const startScreen = document.getElementById('startScreen');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayMessage = document.getElementById('overlayMessage');
  const overlayAction = document.getElementById('overlayAction');

  const PHYSICS = {
    acceleration: 0.4,
    friction: 0.92,
    maxSpeed: 4.8
  };

  const COLLISION_MARGIN = 2.8;
  const CELEBRATION_DURATION_MS = 1700;
  const FIREWORK_INTERVAL_MS = 170;
  const MOVE_DISTANCE_STEP = 9;

  const WALL_MATERIALS = [
    { top: '#ead6ac', mid: '#dcbf8d', low: '#cdaa7d', accent: '#e4c77a', moss: 0.1, wood: false },
    { top: '#f0ddb9', mid: '#e4c77a', low: '#cdaa7d', accent: '#ffd700', moss: 0.05, wood: false },
    { top: '#e8d2ad', mid: '#d4b488', low: '#b7885f', accent: '#f7dfa0', moss: 0.22, wood: false },
    { top: '#efd3a9', mid: '#cda26f', low: '#aa7b4f', accent: '#f3d79f', moss: 0.06, wood: true },
    { top: '#ecd9bc', mid: '#d2b184', low: '#b98d62', accent: '#f6dfaf', moss: 0.3, wood: false }
  ];

  const FIREWORK_COLORS = ['#ffd700', '#fff1aa', '#85e9ff', '#bfff00', '#fcbf5d', '#9ce8ff'];

  const MUSIC_SCALE = [0, 2, 3, 5, 7, 8, 10, 12, 10, 8, 7, 5, 3, 2];
  const MUSIC_ROOTS = [45, 48, 50, 43];

  const state = {
    levelIndex: 0,
    fish: {
      x: 0,
      y: 0,
      radius: 8,
      vx: 0,
      vy: 0,
      safeX: 0,
      safeY: 0
    },
    fishHeading: 0,
    fishReaction: 0,
    keys: {
      ArrowUp: false,
      ArrowDown: false,
      ArrowLeft: false,
      ArrowRight: false
    },
    started: false,
    paused: true,
    score: 0,
    timerMs: 0,
    moves: 0,
    moveDistanceBank: 0,
    highContrast: false,
    reduceEffects: false,
    wallLayerCache: new Map(),
    waterParticles: [],
    ripples: [],
    splashes: [],
    fireworks: [],
    celebration: null,
    rippleCooldownMs: 0,
    lastFrameTs: 0,
    timeNow: 0
  };

  const audioState = {
    initialized: false,
    enabled: true,
    ctx: null,
    masterGain: null,
    musicGain: null,
    sfxGain: null,
    musicStep: 0,
    musicNextTime: 0,
    swimCooldownMs: 0,
    wallCooldownMs: 0,
    fireworkCooldownMs: 0
  };

  function bootSoundEnabledOnStartup() {
    ensureAudioInitialized();
    if (!audioState.initialized) {
      return;
    }

    const now = audioState.ctx.currentTime;
    audioState.enabled = true;
    audioState.masterGain.gain.cancelScheduledValues(now);
    audioState.masterGain.gain.setTargetAtTime(0.9, now, 0.06);
    audioState.musicNextTime = Math.max(audioState.musicNextTime, now + 0.05);

    if (audioState.ctx.state === 'suspended') {
      audioState.ctx.resume();
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function midiToFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function hexToRgba(hex, alpha) {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function formatTime(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function cleanLevelName(name) {
    return name.replace(/^(Easy|Medium|Hard)\s*[IVX0-9]+\s*-\s*/i, '').trim();
  }

  function clearKeys() {
    Object.keys(state.keys).forEach(function (key) {
      state.keys[key] = false;
    });
  }

  function deterministicNoise(seed) {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  function roundedRectPath(g, x, y, width, height, radius) {
    const r = Math.min(radius, width * 0.5, height * 0.5);
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + width - r, y);
    g.arcTo(x + width, y, x + width, y + r, r);
    g.lineTo(x + width, y + height - r);
    g.arcTo(x + width, y + height, x + width - r, y + height, r);
    g.lineTo(x + r, y + height);
    g.arcTo(x, y + height, x, y + height - r, r);
    g.lineTo(x, y + r);
    g.arcTo(x, y, x + r, y, r);
    g.closePath();
  }

  function circleRectCollision(circle, rect) {
    const effectiveRadius = Math.max(3, circle.radius - COLLISION_MARGIN);
    const closestX = clamp(circle.x, rect.x, rect.x + rect.width);
    const closestY = clamp(circle.y, rect.y, rect.y + rect.height);
    const dx = circle.x - closestX;
    const dy = circle.y - closestY;
    return dx * dx + dy * dy < effectiveRadius * effectiveRadius;
  }

  function ensureAudioInitialized() {
    if (audioState.initialized) {
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      return;
    }

    const audioCtx = new AudioCtx();
    const masterGain = audioCtx.createGain();
    const musicGain = audioCtx.createGain();
    const sfxGain = audioCtx.createGain();

    masterGain.gain.value = 0;
    musicGain.gain.value = 0.42;
    sfxGain.gain.value = 0.78;

    musicGain.connect(masterGain);
    sfxGain.connect(masterGain);
    masterGain.connect(audioCtx.destination);

    audioState.ctx = audioCtx;
    audioState.masterGain = masterGain;
    audioState.musicGain = musicGain;
    audioState.sfxGain = sfxGain;
    audioState.musicStep = 0;
    audioState.musicNextTime = audioCtx.currentTime + 0.05;
    audioState.initialized = true;
  }

  function updateSoundButtonUi() {
    if (!soundToggleBtn) {
      return;
    }

    if (audioState.enabled) {
      soundToggleBtn.textContent = 'Sound: On';
      soundToggleBtn.classList.add('is-on');
      soundToggleBtn.classList.remove('is-off');
    } else {
      soundToggleBtn.textContent = 'Sound: Off';
      soundToggleBtn.classList.add('is-off');
      soundToggleBtn.classList.remove('is-on');
    }
  }

  function playTone(freq, startTime, duration, type, volume, slideToFreq, channel) {
    if (!audioState.initialized) {
      return;
    }

    const output = channel === 'music' ? audioState.musicGain : audioState.sfxGain;
    const osc = audioState.ctx.createOscillator();
    const gain = audioState.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(45, freq), startTime);
    if (slideToFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(45, slideToFreq), startTime + duration);
    }

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), startTime + Math.min(0.03, duration * 0.35));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(output);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.04);
  }

  function scheduleAmbientMusic() {
    if (!audioState.enabled || !audioState.initialized) {
      return;
    }

    const now = audioState.ctx.currentTime;
    while (audioState.musicNextTime < now + 0.32) {
      const stepInScale = audioState.musicStep % MUSIC_SCALE.length;
      const root = MUSIC_ROOTS[Math.floor(audioState.musicStep / MUSIC_SCALE.length) % MUSIC_ROOTS.length];
      const midi = root + MUSIC_SCALE[stepInScale];
      const isAccent = audioState.musicStep % 4 === 0;

      playTone(
        midiToFrequency(midi),
        audioState.musicNextTime,
        isAccent ? 0.34 : 0.28,
        'triangle',
        isAccent ? 0.065 : 0.048,
        midiToFrequency(midi + 0.25),
        'music'
      );

      if (isAccent) {
        playTone(
          midiToFrequency(midi - 12),
          audioState.musicNextTime,
          0.3,
          'sine',
          0.03,
          midiToFrequency(midi - 12),
          'music'
        );
      }

      audioState.musicNextTime += 0.3;
      audioState.musicStep += 1;
    }
  }

  function playSwimSfx(speed) {
    if (!audioState.enabled || !audioState.initialized || audioState.swimCooldownMs > 0) {
      return;
    }

    const now = audioState.ctx.currentTime;
    const baseFreq = 420 + clamp(speed * 70, 0, 280);
    playTone(baseFreq, now, 0.07, 'sine', 0.028, baseFreq * 0.7, 'sfx');
    audioState.swimCooldownMs = 110;
  }

  function playWallSfx() {
    if (!audioState.enabled || !audioState.initialized || audioState.wallCooldownMs > 0) {
      return;
    }

    const now = audioState.ctx.currentTime;
    playTone(190, now, 0.09, 'triangle', 0.06, 120, 'sfx');
    audioState.wallCooldownMs = 100;
  }

  function playPortalSfx() {
    if (!audioState.enabled || !audioState.initialized) {
      return;
    }

    const now = audioState.ctx.currentTime;
    playTone(520, now, 0.12, 'sine', 0.06, 700, 'sfx');
    playTone(780, now + 0.08, 0.18, 'triangle', 0.058, 980, 'sfx');
    playTone(1040, now + 0.18, 0.24, 'sine', 0.05, 1180, 'sfx');
  }

  function playFireworkSfx() {
    if (!audioState.enabled || !audioState.initialized || audioState.fireworkCooldownMs > 0) {
      return;
    }

    const now = audioState.ctx.currentTime;
    const freq = 220 + Math.random() * 320;
    playTone(freq, now, 0.16, 'sawtooth', 0.055, freq * 0.62, 'sfx');
    audioState.fireworkCooldownMs = 90;
  }

  function playToggleOnSfx() {
    if (!audioState.enabled || !audioState.initialized) {
      return;
    }

    const now = audioState.ctx.currentTime;
    playTone(540, now, 0.09, 'sine', 0.05, 720, 'sfx');
    playTone(760, now + 0.07, 0.12, 'triangle', 0.04, 900, 'sfx');
  }

  function setSoundEnabled(enabled) {
    if (enabled) {
      ensureAudioInitialized();
      if (!audioState.initialized) {
        return;
      }

      audioState.enabled = true;
      audioState.ctx.resume();
      audioState.masterGain.gain.cancelScheduledValues(audioState.ctx.currentTime);
      audioState.masterGain.gain.setTargetAtTime(0.9, audioState.ctx.currentTime, 0.06);
      audioState.musicNextTime = Math.max(audioState.musicNextTime, audioState.ctx.currentTime + 0.05);
      playToggleOnSfx();
    } else if (audioState.initialized) {
      audioState.enabled = false;
      audioState.masterGain.gain.cancelScheduledValues(audioState.ctx.currentTime);
      audioState.masterGain.gain.setTargetAtTime(0.0001, audioState.ctx.currentTime, 0.06);
    } else {
      audioState.enabled = false;
    }

    updateSoundButtonUi();
  }

  function toggleSound() {
    setSoundEnabled(!audioState.enabled);
  }

  function updateAudio(dt) {
    if (!audioState.initialized) {
      return;
    }

    audioState.swimCooldownMs = Math.max(0, audioState.swimCooldownMs - dt);
    audioState.wallCooldownMs = Math.max(0, audioState.wallCooldownMs - dt);
    audioState.fireworkCooldownMs = Math.max(0, audioState.fireworkCooldownMs - dt);

    if (!audioState.enabled) {
      return;
    }

    if (audioState.ctx.state === 'suspended') {
      audioState.ctx.resume();
    }

    scheduleAmbientMusic();
  }

  function setGamePaused(paused) {
    state.paused = paused;
    if (paused) {
      clearKeys();
    }
  }

  function showOverlay(title, message, buttonText, onClick) {
    overlayTitle.textContent = title;
    overlayMessage.textContent = message;
    overlayAction.textContent = buttonText;
    overlayAction.onclick = onClick;
    overlay.classList.remove('hidden');
    setGamePaused(true);
  }

  function hideOverlay(shouldResume) {
    overlay.classList.add('hidden');
    if (shouldResume && state.started) {
      setGamePaused(false);
    }
  }

  function showStartScreen() {
    if (!startScreen) {
      return;
    }
    startScreen.classList.remove('hidden');
    setGamePaused(true);
  }

  function hideStartScreen() {
    if (!startScreen) {
      return;
    }
    startScreen.classList.add('hidden');
  }

  function getCurrentLevel() {
    return window.LEVELS[state.levelIndex];
  }

  function setCanvasDisplaySize(levelSize) {
    const maxW = window.innerWidth * 0.985;
    const maxH = window.innerHeight * 0.84;
    const display = Math.min(levelSize, maxW, maxH);
    canvas.style.width = `${display}px`;
    canvas.style.height = `${display}px`;
  }

  function getExitGate(level) {
    const expandedHeight = Math.max(level.goal.height * 2, level.cellSize * 1.8);
    const offsetY = (expandedHeight - level.goal.height) * 0.5;
    const gateY = clamp(level.goal.y - offsetY, 0, level.size - expandedHeight);

    return {
      x: level.size - 4,
      y: gateY,
      width: 16,
      height: expandedHeight
    };
  }

  function isInExitBand(y, radius, level) {
    const gate = getExitGate(level);
    const padding = Math.max(radius + 8, gate.height * 0.35);
    return y + radius > gate.y - padding && y - radius < gate.y + gate.height + padding;
  }

  function resetFish() {
    const level = getCurrentLevel();
    state.fish.x = level.start.x;
    state.fish.y = level.start.y;
    state.fish.radius = level.start.radius;
    state.fish.vx = 0;
    state.fish.vy = 0;
    state.fish.safeX = level.start.x;
    state.fish.safeY = level.start.y;
    state.fishHeading = 0;
    state.fishReaction = 0;
  }

  function resetRunStats() {
    state.timerMs = 0;
    state.moves = 0;
    state.moveDistanceBank = 0;
  }

  function refreshHud() {
    if (scoreValueEl) {
      scoreValueEl.textContent = `Score: ${state.score}`;
    }
    if (levelProgressEl) {
      levelProgressEl.textContent = `${state.levelIndex + 1} / ${window.LEVELS.length}`;
    }
    if (timeValueEl) {
      timeValueEl.textContent = formatTime(state.timerMs);
    }
    if (movesValueEl) {
      movesValueEl.textContent = String(state.moves);
    }
  }

  function refreshAccessibilityButtons() {
    if (reduceEffectsBtn) {
      reduceEffectsBtn.classList.toggle('is-on', state.reduceEffects);
      reduceEffectsBtn.textContent = state.reduceEffects ? 'Reduce Effects: On' : 'Reduce Effects';
    }
  }

  function updateLevelInfoPreview(index) {
    const level = window.LEVELS[index];
    if (levelNameEl) {
      levelNameEl.textContent = cleanLevelName(level.name);
    }
    if (levelSizeEl) {
      levelSizeEl.textContent = `${level.size} x ${level.size}px`;
    }
  }

  function spawnWaterParticles(level) {
    const baseCount = Math.max(36, Math.floor(level.size / 12));
    const count = state.reduceEffects ? Math.floor(baseCount * 0.45) : baseCount;
    state.waterParticles = [];

    for (let i = 0; i < count; i += 1) {
      state.waterParticles.push({
        x: Math.random() * level.size,
        y: Math.random() * level.size,
        radius: 0.8 + Math.random() * 2.8,
        vx: (Math.random() - 0.5) * 0.15,
        vy: -0.03 - Math.random() * 0.2,
        alpha: 0.08 + Math.random() * 0.24,
        drift: Math.random() * Math.PI * 2
      });
    }
  }

  function populateLevelSelect() {
    levelSelect.innerHTML = '';

    window.LEVELS.forEach(function (level, index) {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `Stage ${index + 1} - ${cleanLevelName(level.name)}`;
      levelSelect.appendChild(option);
    });
  }

  function loadLevel(index, options) {
    const opts = options || {};

    state.levelIndex = clamp(index, 0, window.LEVELS.length - 1);
    levelSelect.value = String(state.levelIndex);

    const level = getCurrentLevel();
    canvas.width = level.size;
    canvas.height = level.size;
    setCanvasDisplaySize(level.size);

    updateLevelInfoPreview(state.levelIndex);

    state.fireworks = [];
    state.celebration = null;
    state.ripples = [];
    state.splashes = [];
    state.rippleCooldownMs = 0;

    if (opts.resetRun !== false) {
      resetRunStats();
    }

    resetFish();
    spawnWaterParticles(level);
    hideOverlay(false);

    if (state.started && !opts.keepPaused) {
      setGamePaused(false);
    } else {
      setGamePaused(true);
    }

    refreshHud();
  }

  function startAdventure() {
    if (!state.started) {
      state.started = true;
    }

    hideStartScreen();
    hideOverlay(false);
    setGamePaused(false);
  }

  function nextLevel() {
    if (state.levelIndex < window.LEVELS.length - 1) {
      loadLevel(state.levelIndex + 1, { resetRun: true });
      return;
    }

    showOverlay(
      'Royal Champion',
      'You cleared all 9 Medieval Golden Fish labyrinth stages.',
      'Play Again',
      function () {
        state.score = 0;
        loadLevel(0, { resetRun: true });
        startAdventure();
      }
    );
  }

  function startCelebration(nextAction) {
    state.celebration = {
      elapsed: 0,
      intervalElapsed: 0,
      nextAction,
      stageTime: formatTime(state.timerMs),
      stageMoves: state.moves
    };

    state.fireworks = [];
    setGamePaused(true);

    const level = getCurrentLevel();
    playPortalSfx();

    const initialBursts = state.reduceEffects ? 2 : 4;
    for (let i = 0; i < initialBursts; i += 1) {
      launchFirework(level, true);
    }
  }

  function launchFirework(level, initialBurst) {
    const centerX = (0.16 + Math.random() * 0.68) * level.size;
    const centerY = (initialBurst ? 0.18 : 0.12 + Math.random() * 0.38) * level.size;
    const count = state.reduceEffects ? 14 + Math.floor(Math.random() * 10) : 28 + Math.floor(Math.random() * 20);

    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.25;
      const speed = 0.08 + Math.random() * 0.24;

      state.fireworks.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 640 + Math.random() * 540,
        color: FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)],
        radius: 1.2 + Math.random() * 2.3
      });
    }

    playFireworkSfx();
  }

  function updateFireworks(level, dt) {
    if (!state.celebration) {
      return;
    }

    state.celebration.elapsed += dt;
    state.celebration.intervalElapsed += dt;

    if (state.celebration.intervalElapsed >= FIREWORK_INTERVAL_MS) {
      state.celebration.intervalElapsed = 0;
      launchFirework(level, false);
    }

    for (let i = state.fireworks.length - 1; i >= 0; i -= 1) {
      const particle = state.fireworks[i];
      particle.life += dt;

      if (particle.life >= particle.maxLife) {
        state.fireworks.splice(i, 1);
        continue;
      }

      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 0.00095 * dt;
      particle.vx *= 0.994;
      particle.vy *= 0.994;
    }

    if (state.celebration.elapsed >= CELEBRATION_DURATION_MS) {
      const nextAction = state.celebration.nextAction;
      const stageTime = state.celebration.stageTime;
      const stageMoves = state.celebration.stageMoves;
      state.celebration = null;

      showOverlay(
        'Level Complete',
        `Time: ${stageTime} | Moves: ${stageMoves}`,
        'Next Level',
        nextAction
      );
    }
  }

  function checkExitWin() {
    if (state.celebration) {
      return false;
    }

    const level = getCurrentLevel();
    const fish = state.fish;
    const inExitBand = isInExitBand(fish.y, fish.radius, level);
    const crossedBoundary = fish.x + fish.radius >= level.size + 0.5;
    const touchedPortalEdge = fish.x + fish.radius >= level.size - fish.radius * 0.55;

    if (inExitBand && (crossedBoundary || touchedPortalEdge)) {
      state.score += 140;
      refreshHud();
      startCelebration(nextLevel);
      return true;
    }

    return false;
  }

  function applyInput() {
    if (state.keys.ArrowUp) state.fish.vy -= PHYSICS.acceleration;
    if (state.keys.ArrowDown) state.fish.vy += PHYSICS.acceleration;
    if (state.keys.ArrowLeft) state.fish.vx -= PHYSICS.acceleration;
    if (state.keys.ArrowRight) state.fish.vx += PHYSICS.acceleration;
  }

  function applyFrictionAndCap() {
    state.fish.vx *= PHYSICS.friction;
    state.fish.vy *= PHYSICS.friction;

    state.fish.vx = clamp(state.fish.vx, -PHYSICS.maxSpeed, PHYSICS.maxSpeed);
    state.fish.vy = clamp(state.fish.vy, -PHYSICS.maxSpeed, PHYSICS.maxSpeed);

    if (Math.abs(state.fish.vx) < 0.02) state.fish.vx = 0;
    if (Math.abs(state.fish.vy) < 0.02) state.fish.vy = 0;
  }

  function keepInsideBoard() {
    const level = getCurrentLevel();
    const fish = state.fish;

    if (fish.x - fish.radius < 0) {
      fish.x = fish.radius;
      fish.vx = 0;
    }

    if (fish.x + fish.radius > level.size) {
      if (!isInExitBand(fish.y, fish.radius, level)) {
        fish.x = level.size - fish.radius;
        fish.vx = 0;
      } else {
        const maxOutsideX = level.size + fish.radius * 4;
        if (fish.x > maxOutsideX) {
          fish.x = maxOutsideX;
          fish.vx = 0;
        }
      }
    }

    if (fish.y - fish.radius < 0) {
      fish.y = fish.radius;
      fish.vy = 0;
    }

    if (fish.y + fish.radius > level.size) {
      fish.y = level.size - fish.radius;
      fish.vy = 0;
    }
  }

  function hitAnyWall() {
    const level = getCurrentLevel();
    const fish = state.fish;
    const nearExit = isInExitBand(fish.y, fish.radius, level) && fish.x > level.size - fish.radius * 1.55;

    for (let i = 0; i < level.walls.length; i += 1) {
      const wall = level.walls[i];
      if (nearExit && wall.x + wall.width >= level.size - 2) {
        continue;
      }

      if (circleRectCollision(fish, wall)) {
        return true;
      }
    }

    return false;
  }

  function spawnRipple(x, y, strength) {
    state.ripples.push({
      x,
      y,
      radius: state.fish.radius * 0.4,
      maxRadius: state.fish.radius * (2.2 + strength * 0.35),
      life: 0,
      maxLife: 460,
      alpha: 0.35
    });

    if (state.ripples.length > 90) {
      state.ripples.shift();
    }
  }

  function spawnSplash(x, y, intensity) {
    const count = state.reduceEffects ? 5 : 10;

    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.03 + Math.random() * 0.12) * intensity;
      state.splashes.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 280 + Math.random() * 220,
        radius: 0.9 + Math.random() * 1.7
      });
    }

    if (state.splashes.length > 260) {
      state.splashes.splice(0, state.splashes.length - 260);
    }
  }

  function updateFishPosition(dt) {
    const fish = state.fish;
    const prevX = fish.x;
    const prevY = fish.y;
    let collided = false;

    fish.x += fish.vx;
    keepInsideBoard();
    if (hitAnyWall()) {
      fish.x -= fish.vx;
      fish.vx = 0;
      collided = true;
    }

    fish.y += fish.vy;
    keepInsideBoard();
    if (hitAnyWall()) {
      fish.y -= fish.vy;
      fish.vy = 0;
      collided = true;
    }

    if (hitAnyWall()) {
      fish.x = fish.safeX;
      fish.y = fish.safeY;
      fish.vx *= 0.25;
      fish.vy *= 0.25;
      collided = true;
    } else {
      fish.safeX = fish.x;
      fish.safeY = fish.y;
    }

    const speed = Math.hypot(fish.vx, fish.vy);
    if (speed > 0.06) {
      state.fishHeading = Math.atan2(fish.vy, fish.vx);
    }

    const travel = Math.hypot(fish.x - prevX, fish.y - prevY);
    if (travel > 0) {
      state.moveDistanceBank += travel;
      while (state.moveDistanceBank >= MOVE_DISTANCE_STEP) {
        state.moveDistanceBank -= MOVE_DISTANCE_STEP;
        state.moves += 1;
      }
    }

    state.rippleCooldownMs = Math.max(0, state.rippleCooldownMs - dt);

    if (collided) {
      state.fishReaction = 1;
      spawnSplash(fish.x, fish.y, 1.2);
      playWallSfx();
    } else if (speed > 0.95 && state.rippleCooldownMs <= 0) {
      spawnRipple(fish.x, fish.y, clamp(speed, 1, 4));
      state.rippleCooldownMs = state.reduceEffects ? 145 : 85;
      playSwimSfx(speed);
    }
  }

  function updateRipplesAndSplashes(dt) {
    for (let i = state.ripples.length - 1; i >= 0; i -= 1) {
      const ripple = state.ripples[i];
      ripple.life += dt;
      const ratio = ripple.life / ripple.maxLife;

      if (ratio >= 1) {
        state.ripples.splice(i, 1);
        continue;
      }

      ripple.radius = ripple.maxRadius * ratio;
      ripple.alpha = (1 - ratio) * 0.3;
    }

    for (let i = state.splashes.length - 1; i >= 0; i -= 1) {
      const splash = state.splashes[i];
      splash.life += dt;
      if (splash.life >= splash.maxLife) {
        state.splashes.splice(i, 1);
        continue;
      }

      splash.x += splash.vx * dt;
      splash.y += splash.vy * dt;
      splash.vy += 0.00055 * dt;
      splash.vx *= 0.992;
      splash.vy *= 0.992;
    }
  }

  function updateWaterParticles(level, dt) {
    for (let i = 0; i < state.waterParticles.length; i += 1) {
      const p = state.waterParticles[i];
      p.drift += 0.0015 * dt;
      p.x += p.vx * dt + Math.cos(p.drift) * 0.03;
      p.y += p.vy * dt;

      if (p.y < -5) p.y = level.size + Math.random() * 40;
      if (p.x < -5) p.x = level.size + 2;
      if (p.x > level.size + 5) p.x = -2;
    }
  }

  function update(dt) {
    state.fishReaction = Math.max(0, state.fishReaction - dt * 0.0052);
    updateRipplesAndSplashes(dt);

    if (state.paused) {
      return;
    }

    state.timerMs += dt;
    applyInput();
    applyFrictionAndCap();
    updateFishPosition(dt);
    checkExitWin();
    refreshHud();
  }

  function wallMaterialForWall(level, wall) {
    const index =
      Math.abs(
        Math.floor(wall.x / level.cellSize) * 3 +
          Math.floor(wall.y / level.cellSize) * 5 +
          Math.floor((wall.width + wall.height) / level.cellSize)
      ) % WALL_MATERIALS.length;

    return WALL_MATERIALS[index];
  }

  function drawWallTexture(g, wall, material, seed) {
    const lineCount = Math.max(1, Math.floor((wall.width + wall.height) / 26));

    for (let i = 0; i < lineCount; i += 1) {
      const noise = deterministicNoise(seed + i * 1.37);
      const alpha = 0.05 + noise * 0.09;
      const px = wall.x + noise * wall.width;
      const py = wall.y + deterministicNoise(seed + i * 3.91) * wall.height;

      if (material.wood) {
        g.strokeStyle = `rgba(121, 85, 44, ${alpha.toFixed(3)})`;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(wall.x + 2, py);
        g.lineTo(wall.x + wall.width - 2, py + (noise - 0.5) * 2);
        g.stroke();
      } else {
        g.fillStyle = `rgba(255, 255, 255, ${Math.min(0.1, alpha).toFixed(3)})`;
        g.fillRect(px, py, 2, 2);
      }

      if (deterministicNoise(seed + i * 7.77) < material.moss) {
        g.fillStyle = 'rgba(191, 255, 0, 0.18)';
        g.fillRect(wall.x + noise * (wall.width - 4), wall.y + (1 - noise) * (wall.height - 4), 3, 3);
      }
    }
  }

  function createWallLayer(level) {
    const key = `${level.id}-${state.highContrast ? 'hc' : 'std'}`;
    if (state.wallLayerCache.has(key)) {
      return state.wallLayerCache.get(key);
    }

    const layer = document.createElement('canvas');
    layer.width = level.size;
    layer.height = level.size;
    const g = layer.getContext('2d');

    const borderGrad = g.createLinearGradient(0, 0, 0, level.size);
    borderGrad.addColorStop(0, state.highContrast ? '#fae7be' : '#e9cf96');
    borderGrad.addColorStop(1, state.highContrast ? '#d4ab6b' : '#b9874f');

    g.fillStyle = borderGrad;
    g.fillRect(0, 0, level.size, 8);
    g.fillRect(0, level.size - 8, level.size, 8);
    g.fillRect(0, 0, 8, level.size);
    g.fillRect(level.size - 8, 0, 8, level.size);

    level.walls.forEach(function (wall, idx) {
      const material = wallMaterialForWall(level, wall);
      const radius = Math.max(3, Math.min(level.cellSize * 0.38, Math.min(wall.width, wall.height) * 0.38));

      const topColor = state.highContrast ? '#f5e3bf' : material.top;
      const midColor = state.highContrast ? '#e4c98f' : material.mid;
      const lowColor = state.highContrast ? '#cca16e' : material.low;

      const wallGradient =
        wall.width >= wall.height
          ? g.createLinearGradient(wall.x, wall.y, wall.x, wall.y + wall.height)
          : g.createLinearGradient(wall.x, wall.y, wall.x + wall.width, wall.y);

      wallGradient.addColorStop(0, topColor);
      wallGradient.addColorStop(0.56, midColor);
      wallGradient.addColorStop(1, lowColor);

      roundedRectPath(g, wall.x, wall.y, wall.width, wall.height, radius);
      g.fillStyle = wallGradient;
      g.fill();

      g.fillStyle = 'rgba(255, 255, 255, 0.24)';
      roundedRectPath(g, wall.x + 0.5, wall.y + 0.5, wall.width - 1, Math.max(2, wall.height * 0.2), radius * 0.8);
      g.fill();

      g.fillStyle = 'rgba(117, 80, 39, 0.24)';
      roundedRectPath(g, wall.x + 0.5, wall.y + wall.height * 0.68, wall.width - 1, wall.height * 0.3, radius * 0.7);
      g.fill();

      g.strokeStyle = hexToRgba(material.accent, 0.22);
      g.lineWidth = 1;
      roundedRectPath(g, wall.x + 0.5, wall.y + 0.5, wall.width - 1, wall.height - 1, radius * 0.9);
      g.stroke();

      drawWallTexture(g, wall, material, idx + wall.x * 0.12 + wall.y * 0.18);
    });

    state.wallLayerCache.set(key, layer);
    return layer;
  }

  function drawWater(level, timestamp) {
    const wave = timestamp * 0.00032;

    const waterTop = state.highContrast ? '#8be1ff' : '#66ccff';
    const waterMid = state.highContrast ? '#6de0ff' : '#4dd2ff';
    const waterBottom = state.highContrast ? '#b9f2ff' : '#9de8ff';

    const grad = ctx.createLinearGradient(0, 0, 0, level.size);
    grad.addColorStop(0, waterTop);
    grad.addColorStop(0.56, waterMid);
    grad.addColorStop(1, waterBottom);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, level.size, level.size);

    ctx.save();
    ctx.globalAlpha = state.reduceEffects ? 0.12 : 0.19;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.58)';
    ctx.lineWidth = Math.max(1.2, level.cellSize * 0.08);

    for (let y = -20; y < level.size + 26; y += 18) {
      const amplitude = 6 + Math.sin(y * 0.01 + wave) * 3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= level.size; x += 20) {
        const yy = y + Math.sin(x * 0.02 + wave * 4 + y * 0.04) * amplitude;
        ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();

    const sheen = ctx.createRadialGradient(
      level.size * 0.48,
      level.size * 0.33,
      level.size * 0.06,
      level.size * 0.48,
      level.size * 0.33,
      level.size * 0.75
    );
    sheen.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
    sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, level.size, level.size);
  }

  function drawWalls(level) {
    const layer = createWallLayer(level);
    ctx.drawImage(layer, 0, 0);
  }

  function drawGoldenFish(timestamp) {
    const fish = state.fish;
    const heading = state.fishHeading;
    const speed = Math.hypot(fish.vx, fish.vy);
    const bobbing = Math.sin(timestamp * 0.0078) * fish.radius * 0.16;
    const finWave = Math.sin(timestamp * 0.023 + speed * 0.4);
    const reaction = state.fishReaction;

    const bodyLength = fish.radius * 3.2;
    const bodyHeight = fish.radius * 2.0;

    ctx.save();

    ctx.translate(fish.x, fish.y + fish.radius * 0.9);
    ctx.scale(1.15, 0.62);
    ctx.beginPath();
    ctx.ellipse(0, 0, fish.radius * 1.25, fish.radius * 0.92, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(30, 72, 115, 0.27)';
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(fish.x, fish.y + bobbing);
    ctx.rotate(heading);
    ctx.scale(1 - reaction * 0.1, 1 + reaction * 0.08);

    const bodyGrad = ctx.createLinearGradient(-bodyLength * 0.6, -bodyHeight * 0.45, bodyLength * 0.54, bodyHeight * 0.45);
    bodyGrad.addColorStop(0, '#f58b23');
    bodyGrad.addColorStop(0.3, '#ffbc42');
    bodyGrad.addColorStop(0.58, '#ffd878');
    bodyGrad.addColorStop(0.82, '#ffab2d');
    bodyGrad.addColorStop(1, '#d9761c');

    ctx.beginPath();
    ctx.moveTo(-bodyLength * 0.58, 0);
    ctx.bezierCurveTo(-bodyLength * 0.25, -bodyHeight * 0.78, bodyLength * 0.58, -bodyHeight * 0.52, bodyLength * 0.58, 0);
    ctx.bezierCurveTo(bodyLength * 0.58, bodyHeight * 0.52, -bodyLength * 0.25, bodyHeight * 0.78, -bodyLength * 0.58, 0);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(133, 76, 21, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    for (let i = -3; i <= 3; i += 1) {
      ctx.beginPath();
      ctx.ellipse(i * fish.radius * 0.24, 0, fish.radius * 0.29, fish.radius * 0.14, 0, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 230, 146, 0.34)' : 'rgba(248, 169, 63, 0.25)';
      ctx.fill();
    }

    const tailSwing = (0.36 + finWave * 0.2) * (1 + reaction * 0.2);
    ctx.beginPath();
    ctx.moveTo(-bodyLength * 0.54, 0);
    ctx.lineTo(-bodyLength * 1.03, -bodyHeight * tailSwing);
    ctx.lineTo(-bodyLength * 1.03, bodyHeight * tailSwing);
    ctx.closePath();
    const tailGrad = ctx.createLinearGradient(-bodyLength * 1.03, 0, -bodyLength * 0.52, 0);
    tailGrad.addColorStop(0, '#df7e22');
    tailGrad.addColorStop(1, '#ffd478');
    ctx.fillStyle = tailGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(128, 70, 18, 0.4)';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-bodyLength * 0.08, -bodyHeight * 0.52);
    ctx.lineTo(bodyLength * 0.16, -bodyHeight * (1 + 0.14 * finWave));
    ctx.lineTo(bodyLength * 0.35, -bodyHeight * 0.36);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 196, 89, 0.93)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-bodyLength * 0.04, bodyHeight * 0.2);
    ctx.lineTo(bodyLength * 0.2, bodyHeight * (0.96 - 0.1 * finWave));
    ctx.lineTo(bodyLength * 0.34, bodyHeight * 0.24);
    ctx.closePath();
    ctx.fillStyle = 'rgba(244, 151, 62, 0.91)';
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(bodyLength * 0.08, -bodyHeight * 0.2, bodyLength * 0.26, bodyHeight * 0.16, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 248, 220, 0.5)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(bodyLength * 0.3, -bodyHeight * 0.11, fish.radius * 0.31, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(bodyLength * 0.35, -bodyHeight * 0.1, fish.radius * 0.17, 0, Math.PI * 2);
    ctx.fillStyle = '#2d3448';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(bodyLength * 0.31, -bodyHeight * 0.15, fish.radius * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.fill();

    ctx.strokeStyle = reaction > 0.12 ? 'rgba(168, 87, 23, 0.9)' : 'rgba(168, 87, 23, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (reaction > 0.12) {
      ctx.arc(bodyLength * 0.2, bodyHeight * 0.06, fish.radius * 0.24, Math.PI * 0.2, Math.PI * 0.85, true);
    } else {
      ctx.arc(bodyLength * 0.2, bodyHeight * 0.06, fish.radius * 0.24, Math.PI * 0.18, Math.PI * 0.82);
    }
    ctx.stroke();

    const crownX = bodyLength * 0.07;
    const crownY = -bodyHeight * 0.62;
    ctx.beginPath();
    ctx.moveTo(crownX - fish.radius * 0.34, crownY + fish.radius * 0.22);
    ctx.lineTo(crownX - fish.radius * 0.2, crownY - fish.radius * 0.16);
    ctx.lineTo(crownX, crownY + fish.radius * 0.06);
    ctx.lineTo(crownX + fish.radius * 0.2, crownY - fish.radius * 0.16);
    ctx.lineTo(crownX + fish.radius * 0.34, crownY + fish.radius * 0.22);
    ctx.closePath();
    ctx.fillStyle = '#ffd700';
    ctx.fill();
    ctx.strokeStyle = 'rgba(143, 95, 24, 0.95)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }

  function drawRipples() {
    ctx.save();
    for (let i = 0; i < state.ripples.length; i += 1) {
      const ripple = state.ripples[i];
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(235, 248, 255, ${clamp(ripple.alpha, 0, 0.34).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWaterParticles() {
    for (let i = 0; i < state.waterParticles.length; i += 1) {
      const p = state.waterParticles[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(235, 249, 255, ${p.alpha.toFixed(3)})`;
      ctx.fill();
    }
  }

  function drawSplashes() {
    for (let i = 0; i < state.splashes.length; i += 1) {
      const splash = state.splashes[i];
      const lifeRatio = 1 - splash.life / splash.maxLife;
      if (lifeRatio <= 0) {
        continue;
      }

      ctx.beginPath();
      ctx.arc(splash.x, splash.y, splash.radius * (0.5 + lifeRatio), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(218, 247, 255, ${Math.min(0.62, lifeRatio).toFixed(3)})`;
      ctx.fill();
    }
  }

  function drawFireworks() {
    if (state.fireworks.length === 0) {
      return;
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < state.fireworks.length; i += 1) {
      const p = state.fireworks[i];
      const lifeRatio = 1 - p.life / p.maxLife;
      if (lifeRatio <= 0) {
        continue;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * (0.6 + lifeRatio), 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(p.color, clamp(lifeRatio, 0.05, 1));
      ctx.fill();
    }

    ctx.restore();
  }

  function drawEffects() {
    drawRipples();
    drawWaterParticles();
    drawSplashes();
    drawFireworks();
  }

  function drawPortal(level, timestamp) {
    const gate = getExitGate(level);
    const centerX = level.size - 5;
    const centerY = gate.y + gate.height * 0.5;

    const distance = Math.hypot(state.fish.x - centerX, state.fish.y - centerY);
    const nearFactor = clamp(1 - distance / (level.size * 0.42), 0, 1);
    const pulse = 0.7 + Math.sin(timestamp * 0.008) * 0.2 + nearFactor * 0.45;

    const ringRadius = gate.height * 0.76 + pulse * 3;
    const glowRadius = ringRadius * (2.1 + nearFactor * 0.55);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const glow = ctx.createRadialGradient(centerX - 4, centerY, ringRadius * 0.15, centerX - 2, centerY, glowRadius);
    glow.addColorStop(0, `rgba(0, 191, 255, ${(0.42 + nearFactor * 0.26).toFixed(3)})`);
    glow.addColorStop(1, 'rgba(0, 191, 255, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(centerX - 2, centerY, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    const inner = ctx.createRadialGradient(centerX - 3, centerY, ringRadius * 0.14, centerX - 2, centerY, ringRadius * 0.95);
    inner.addColorStop(0, `rgba(198, 250, 255, ${(0.9 + nearFactor * 0.1).toFixed(3)})`);
    inner.addColorStop(0.52, `rgba(0, 191, 255, ${(0.48 + nearFactor * 0.24).toFixed(3)})`);
    inner.addColorStop(1, 'rgba(0, 191, 255, 0.08)');

    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.arc(centerX - 2, centerY, ringRadius * 0.9, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3.2 + nearFactor * 1.1;
    ctx.beginPath();
    ctx.arc(centerX - 2, centerY, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 246, 198, 0.88)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(centerX - 2, centerY, ringRadius - 3.2, Math.PI * 0.16, Math.PI * 1.86);
    ctx.stroke();

    const particleCount = state.reduceEffects ? 5 : 10;
    for (let i = 0; i < particleCount; i += 1) {
      const angle = timestamp * 0.003 + (Math.PI * 2 * i) / particleCount;
      const orbit = ringRadius + 4 + Math.sin(timestamp * 0.004 + i) * 3;
      const px = centerX - 2 + Math.cos(angle) * orbit;
      const py = centerY + Math.sin(angle) * orbit;
      const r = 1 + (i % 3) * 0.45;

      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? '#ffd700' : '#00bfff';
      ctx.fill();
    }

    ctx.restore();
  }

  function drawBoard(level, timestamp) {
    ctx.clearRect(0, 0, level.size, level.size);
    drawWater(level, timestamp);
    drawWalls(level);
    drawGoldenFish(timestamp);
    drawEffects();
    drawPortal(level, timestamp);
  }

  function frame(timestamp) {
    if (!state.lastFrameTs) {
      state.lastFrameTs = timestamp;
    }

    const dt = Math.min(34, timestamp - state.lastFrameTs);
    state.lastFrameTs = timestamp;
    state.timeNow = timestamp;

    updateAudio(dt);
    update(dt);

    const level = getCurrentLevel();
    updateWaterParticles(level, dt);
    updateFireworks(level, dt);

    drawBoard(level, timestamp);

    requestAnimationFrame(frame);
  }

  function toggleReduceEffects() {
    state.reduceEffects = !state.reduceEffects;
    document.body.classList.toggle('reduce-effects', state.reduceEffects);
    spawnWaterParticles(getCurrentLevel());
    refreshAccessibilityButtons();
  }

  function resetCurrentLevel() {
    resetFish();
    resetRunStats();
    state.ripples = [];
    state.splashes = [];
    state.fireworks = [];
    state.celebration = null;
    hideOverlay(false);

    if (state.started) {
      setGamePaused(false);
    }

    refreshHud();
  }

  function setupInput() {
    document.addEventListener('keydown', function (event) {
      if (event.key in state.keys) {
        state.keys[event.key] = true;
        event.preventDefault();
      }
    });

    document.addEventListener('keyup', function (event) {
      if (event.key in state.keys) {
        state.keys[event.key] = false;
        event.preventDefault();
      }
    });

    window.addEventListener('blur', function () {
      clearKeys();
    });

    window.addEventListener('resize', function () {
      setCanvasDisplaySize(getCurrentLevel().size);
    });

    levelSelect.addEventListener('change', function () {
      const selectedIndex = Number(levelSelect.value);
      loadLevel(selectedIndex, { resetRun: true });
      if (state.started) {
        setGamePaused(false);
      }
    });

    if (startBtn) {
      startBtn.addEventListener('click', function () {
        startAdventure();
      });
    }

    if (startScreenBtn) {
      startScreenBtn.addEventListener('click', function () {
        startAdventure();
      });
    }

    resetBtn.addEventListener('click', function () {
      resetCurrentLevel();
    });

    if (soundToggleBtn) {
      soundToggleBtn.addEventListener('click', function () {
        toggleSound();
      });
    }

    if (reduceEffectsBtn) {
      reduceEffectsBtn.addEventListener('click', function () {
        toggleReduceEffects();
      });
    }
  }

  function init() {
    bootSoundEnabledOnStartup();
    updateSoundButtonUi();
    refreshAccessibilityButtons();
    populateLevelSelect();
    setupInput();

    const initialLevel = 0;
    state.started = true;
    loadLevel(initialLevel, { resetRun: true });
    setGamePaused(false);
    refreshHud();

    requestAnimationFrame(frame);
  }

  init();
})();
