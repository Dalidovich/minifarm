(function () {
  const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99];
  const BASS = [130.81, 98.0, 110.0, 87.31];
  let ctx = null;
  let master = null;
  let musicTimer = null;
  let beat = 0;
  let noteIndex = 4;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, delay, slideTo) {
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(dur, vol, freq, delay) {
    const t0 = ctx.currentTime + (delay || 0);
    const length = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  const sounds = {
    till: function () { noise(0.14, 0.5, 500); tone(110, 0.1, 'triangle', 0.2); },
    plant: function () { tone(520, 0.08, 'triangle', 0.22); tone(700, 0.09, 'triangle', 0.18, 0.06); },
    water: function () { noise(0.3, 0.25, 2600); noise(0.2, 0.15, 4200, 0.08); },
    harvest: function () { tone(660, 0.09, 'triangle', 0.25); tone(990, 0.14, 'triangle', 0.22, 0.07); },
    coin: function () { tone(988, 0.06, 'square', 0.07); tone(1319, 0.16, 'square', 0.07, 0.06); },
    egg: function () { tone(880, 0.06, 'sine', 0.25); tone(1175, 0.1, 'sine', 0.2, 0.05); },
    error: function () { tone(170, 0.16, 'sawtooth', 0.1, 0, 120); },
    click: function () { tone(480, 0.04, 'square', 0.06); },
    refill: function () { noise(0.45, 0.3, 900); tone(280, 0.4, 'sine', 0.16, 0, 620); },
    buy: function () { [523, 659, 784].forEach(function (f, i) { tone(f, 0.12, 'square', 0.07, i * 0.07); }); },
    order: function () { [659, 784, 988, 1319].forEach(function (f, i) { tone(f, 0.14, 'triangle', 0.2, i * 0.08); }); },
    level: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.24, i * 0.11); }); },
    ripe: function () { tone(1320, 0.07, 'sine', 0.06); },
    purr: function () { tone(70, 0.45, 'sawtooth', 0.07); tone(74, 0.45, 'sawtooth', 0.05, 0.04); },
    toss: function () { tone(620, 0.16, 'triangle', 0.16, 0, 1100); },
    splash: function () { noise(0.32, 0.3, 1300); noise(0.2, 0.18, 2800, 0.06); },
    plop: function () { tone(320, 0.18, 'sine', 0.2, 0, 140); },
    wind: function () { noise(0.6, 0.25, 700); noise(0.4, 0.15, 1400, 0.15); },
    lucky: function () { [988, 1319, 1568, 2093].forEach(function (f, i) { tone(f, 0.16, 'square', 0.07, i * 0.06); }); }
  };

  function soft(freq, dur, vol, type) {
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function musicTick() {
    if (!ctx || ctx.state !== 'running' || document.hidden) return;
    if (beat % 8 === 0) soft(BASS[(beat / 8) % BASS.length], 4.2, 0.05, 'sine');
    if (Math.random() < 0.55) {
      noteIndex = Math.max(0, Math.min(SCALE.length - 1, noteIndex + Math.floor(Math.random() * 5) - 2));
      soft(SCALE[noteIndex], 1.8, 0.035, 'triangle');
    }
    beat++;
  }

  MF.audio = {
    play: function (name) {
      if (!MF.game.state.settings.sound || !ctx) return;
      if (ctx.state !== 'running') return;
      sounds[name]();
    },
    unlock: function () {
      if (!ensure()) return;
      MF.audio.syncMusic();
    },
    syncMusic: function () {
      const on = MF.game.state.settings.music;
      if (on && ctx && !musicTimer) musicTimer = setInterval(musicTick, 620);
      if (!on && musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
    }
  };
})();
