(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const els = {
    play: $("playBtn"),
    stop: $("stopBtn"),
    exportMidi: $("exportMidiBtn"),
    bpm: $("bpmInput"),
    loopBars: $("loopBarsInput"),
    addBar: $("addBarBtn"),
    removeBar: $("removeBarBtn"),
    master: $("masterInput"),
    soundMode: $("soundModeSelect"),
    midiOutput: $("midiOutputSelect"),
    refreshMidi: $("refreshMidiBtn"),
    archiveSelect: $("archiveSelect"),
    saveVersion: $("saveVersionBtn"),
    downloadPattern: $("downloadPatternBtn"),
    format: $("formatBtn"),
    apply: $("applyBtn"),
    editor: $("patternEditor"),
    status: $("status"),
    grid: $("grid")
  };

  const archiveKey = "sevenEightPatternArchive";
  const tracks = ["kick", "snare", "hat", "cymbal"];
  let pattern = clone(window.PatternArchive.current);
  let ctx = null;
  let masterGain = null;
  let playing = false;
  let scheduler = null;
  let nextNoteTime = 0;
  let nextStep = 0;
  let nextBar = 0;
  let stepCells = [];
  let midiAccess = null;
  let selectedMidiOutput = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function setStatus(text, isError) {
    els.status.textContent = text;
    els.status.style.color = isError ? "#a8332d" : "";
  }

  function labelsFor(p) {
    const labels = [];
    const subLabels = {
      1: [""],
      2: ["", "&"],
      3: ["", "trip", "let"],
      4: ["", "e", "&", "a"]
    };
    const subs = subLabels[p.subdivisions] || Array.from({ length: p.subdivisions }, (_, i) => i === 0 ? "" : "." + i);
    for (let beat = 1; beat <= p.beats; beat += 1) {
      for (const sub of subs) labels.push(String(beat) + sub);
    }
    return labels;
  }

  function stepsPerBar(p) {
    return p.beats * p.subdivisions;
  }

  function secondsPerStep(p) {
    return (60 / p.bpm) / p.subdivisions;
  }

  function ticksPerStep(p) {
    const beatUnit = p.beatUnit || 4;
    return (p.ticksPerQuarter || 480) * (4 / beatUnit) / p.subdivisions;
  }

  function quarterNoteBpm(p) {
    return p.bpm * (4 / (p.beatUnit || 4));
  }

  function velocityText(v) {
    return Math.round(v * 100);
  }

  function defaultVelocity(track) {
    if (track === "kick") return 0.82;
    if (track === "snare") return 0.86;
    if (track === "hat") return 0.26;
    if (track === "cymbal") return 0.72;
    return 0.75;
  }

  function generatedSparseHatEvents(p) {
    const breath = new Set(p.breathSteps || []);
    const steps = [
      { step: 0, velocity: 0.48 },
      { step: 3, velocity: 0.18 },
      { step: 6, velocity: 0.42 },
      { step: 9, velocity: 0.16 },
      { step: 12, velocity: 0.5 },
      { step: 13, velocity: 0.14 }
    ];
    return steps.filter((event) => event.step < stepsPerBar(p) && !breath.has(event.step));
  }

  function eventsForTrack(bar, track, p) {
    const value = bar.tracks[track];
    if (value === "generated-sparse-3s" && track === "hat") return generatedSparseHatEvents(p);
    if (value === "generated-3s" && track === "hat") return generatedSparseHatEvents(p);
    return Array.isArray(value) ? value : [];
  }

  function editableEventsForTrack(bar, track) {
    if (!bar.tracks) bar.tracks = {};
    if (!Array.isArray(bar.tracks[track])) {
      bar.tracks[track] = eventsForTrack(bar, track, pattern).map((event) => ({ ...event }));
    }
    return bar.tracks[track];
  }

  function toggleEvent(barIndex, track, step) {
    const bar = pattern.bars[barIndex];
    if (!bar || !track) return;
    const events = editableEventsForTrack(bar, track);
    const existingIndex = events.findIndex((event) => event.step === step);

    if (existingIndex >= 0) {
      events.splice(existingIndex, 1);
      setStatus("Removed " + track + " at " + labelsFor(pattern)[step] + ".");
    } else {
      events.push({ step, velocity: defaultVelocity(track) });
      events.sort((a, b) => a.step - b.step);
      setStatus("Added " + track + " at " + labelsFor(pattern)[step] + ".");
    }

    normalizePlaybackCursor();
    renderEditor();
    renderGrid();
  }

  function normalizePlaybackCursor() {
    if (!playing || !pattern.bars.length) return;
    nextBar %= pattern.bars.length;
    nextStep %= stepsPerBar(pattern);
  }

  function renamedBarCopy(bar, number) {
    const copy = clone(bar);
    copy.name = "Bar " + number + " variation";
    return copy;
  }

  function addBar() {
    const source = pattern.bars[pattern.bars.length - 1] || {
      name: "Bar 1",
      tracks: Object.fromEntries(tracks.map((track) => [track, []]))
    };
    pattern.bars.push(renamedBarCopy(source, pattern.bars.length + 1));
    normalizePlaybackCursor();
    renderEditor();
    renderGrid();
    setStatus("Added bar " + pattern.bars.length + " by duplicating the previous bar.");
  }

  function removeBar() {
    if (pattern.bars.length <= 1) {
      setStatus("Keep at least one bar.", true);
      return;
    }
    const removed = pattern.bars.pop();
    normalizePlaybackCursor();
    renderEditor();
    renderGrid();
    setStatus("Removed " + removed.name + ".");
  }

  function renderEditor() {
    els.editor.value = JSON.stringify(pattern, null, 2);
    els.bpm.value = pattern.bpm;
  }

  function renderArchiveSelect() {
    const saved = readArchive();
    els.archiveSelect.innerHTML = '<option value="">Saved versions</option>';
    saved.forEach((entry, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = entry.name + " (" + entry.savedAt + ")";
      els.archiveSelect.appendChild(option);
    });
  }

  function renderGrid() {
    const labels = labelsFor(pattern);
    const breath = new Set(pattern.breathSteps || []);
    els.grid.innerHTML = "";
    els.grid.style.setProperty("--steps-per-bar", String(stepsPerBar(pattern)));
    stepCells = [];

    const topLeft = document.createElement("div");
    topLeft.className = "cell rowLabel";
    topLeft.textContent = "step";
    els.grid.appendChild(topLeft);

    labels.forEach((label, i) => {
      const cell = document.createElement("div");
      cell.className = "cell beatLabel" + (breath.has(i) ? " breath" : "");
      cell.textContent = label;
      els.grid.appendChild(cell);
    });

    pattern.bars.forEach((bar, barIndex) => {
      const barLabel = document.createElement("div");
      barLabel.className = "cell barLabel";
      barLabel.textContent = "Bar " + (barIndex + 1) + ": " + bar.name;
      els.grid.appendChild(barLabel);

      tracks.forEach((track) => {
        const rowLabel = document.createElement("div");
        rowLabel.className = "cell rowLabel";
        rowLabel.textContent = track;
        els.grid.appendChild(rowLabel);

        const events = new Map();
        eventsForTrack(bar, track, pattern).forEach((event) => {
          events.set(event.step, event);
        });

        for (let i = 0; i < stepsPerBar(pattern); i += 1) {
          const event = events.get(i);
          const cell = document.createElement("div");
          cell.className = "cell" + (breath.has(i) ? " breath" : "");

          if (event) {
            cell.classList.add("event", track);
            cell.dataset.vel = velocityText(event.velocity);
            cell.textContent = track === "kick" ? "K" : track === "snare" ? "S" : track === "cymbal" ? "C" : "H";
            if (track === "hat" || track === "cymbal") {
              cell.style.opacity = String(0.35 + event.velocity * 1.8);
            }
          }

          cell.dataset.bar = String(barIndex);
          cell.dataset.step = String(i);
          cell.dataset.track = track;
          els.grid.appendChild(cell);
        }
      });
    });

    stepCells = Array.from(els.grid.querySelectorAll("[data-step]"));
  }

  function ensureAudio() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;
    masterGain.gain.value = Number(els.master.value);
    masterGain.connect(compressor).connect(ctx.destination);
  }

  function envGain(time, start, end, dur, curve) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(start, time);
    if (curve === "linear") {
      gain.gain.linearRampToValueAtTime(end, time + dur);
    } else {
      gain.gain.exponentialRampToValueAtTime(end, time + dur);
    }
    return gain;
  }

  function playKick(time, velocity) {
    const body = ctx.createOscillator();
    const bodyGain = envGain(time, 0.001 + velocity * 0.95, 0.001, 0.22);
    body.type = "sine";
    body.frequency.setValueAtTime(150, time);
    body.frequency.exponentialRampToValueAtTime(42, time + 0.18);
    body.connect(bodyGain).connect(masterGain);
    body.start(time);
    body.stop(time + 0.24);

    const click = ctx.createOscillator();
    const clickGain = envGain(time, 0.001 + velocity * 0.16, 0.001, 0.018);
    click.type = "square";
    click.frequency.value = 1200;
    click.connect(clickGain).connect(masterGain);
    click.start(time);
    click.stop(time + 0.025);
  }

  function noiseBuffer(duration) {
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function playSnare(time, velocity) {
    const noise = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = envGain(time, 0.001 + velocity * 0.46, 0.001, 0.16);
    noise.buffer = noiseBuffer(0.18);
    filter.type = "bandpass";
    filter.frequency.value = 2100;
    filter.Q.value = 0.95;
    noise.connect(filter).connect(gain).connect(masterGain);
    noise.start(time);
    noise.stop(time + 0.18);

    const body = ctx.createOscillator();
    const bodyGain = envGain(time, 0.001 + velocity * 0.16, 0.001, 0.12);
    body.type = "triangle";
    body.frequency.setValueAtTime(230, time);
    body.frequency.exponentialRampToValueAtTime(160, time + 0.1);
    body.connect(bodyGain).connect(masterGain);
    body.start(time);
    body.stop(time + 0.13);
  }

  function playHat(time, velocity) {
    const noise = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = envGain(time, 0.001 + velocity * 0.32, 0.001, 0.052);
    noise.buffer = noiseBuffer(0.06);
    filter.type = "highpass";
    filter.frequency.value = 7200;
    noise.connect(filter).connect(gain).connect(masterGain);
    noise.start(time);
    noise.stop(time + 0.06);

    const metal = ctx.createOscillator();
    const metalGain = envGain(time, 0.001 + velocity * 0.035, 0.001, 0.035);
    metal.type = "square";
    metal.frequency.value = 9300;
    metal.connect(metalGain).connect(masterGain);
    metal.start(time);
    metal.stop(time + 0.04);
  }

  function playCymbal(time, velocity) {
    const noise = ctx.createBufferSource();
    const highpass = ctx.createBiquadFilter();
    const shelf = ctx.createBiquadFilter();
    const gain = envGain(time, 0.001 + velocity * 0.38, 0.001, 0.75);
    noise.buffer = noiseBuffer(0.85);
    highpass.type = "highpass";
    highpass.frequency.value = 4200;
    shelf.type = "highshelf";
    shelf.frequency.value = 8000;
    shelf.gain.value = 5;
    noise.connect(highpass).connect(shelf).connect(gain).connect(masterGain);
    noise.start(time);
    noise.stop(time + 0.85);

    [5200, 7100, 9600].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const oscGain = envGain(time, 0.001 + velocity * (0.028 - index * 0.005), 0.001, 0.38);
      osc.type = "square";
      osc.frequency.value = freq;
      osc.connect(oscGain).connect(masterGain);
      osc.start(time);
      osc.stop(time + 0.42);
    });
  }

  function midiTimestamp(time) {
    if (!ctx) return undefined;
    return window.performance.now() + Math.max(0, time - ctx.currentTime) * 1000;
  }

  function sendMidiDrum(track, time, velocity) {
    if (!selectedMidiOutput || !pattern.notes || !pattern.notes[track]) return;
    const note = pattern.notes[track];
    const vel = Math.max(1, Math.min(127, Math.round(velocity * 127)));
    const start = midiTimestamp(time);
    selectedMidiOutput.send([0x99, note, vel], start);
    selectedMidiOutput.send([0x89, note, 0], start + (track === "hat" ? 45 : track === "cymbal" ? 600 : 120));
  }

  function scheduleEvent(track, time, velocity) {
    const mode = els.soundMode.value;
    if (mode === "audio" || mode === "both" || !selectedMidiOutput) {
      if (track === "kick") playKick(time, velocity);
      if (track === "snare") playSnare(time, velocity);
      if (track === "hat") playHat(time, velocity);
      if (track === "cymbal") playCymbal(time, velocity);
    }
    if ((mode === "midi" || mode === "both") && selectedMidiOutput) {
      sendMidiDrum(track, time, velocity);
    }
  }

  function showStep(barIndex, stepIndex, time) {
    const delay = Math.max(0, (time - ctx.currentTime) * 1000);
    window.setTimeout(() => {
      stepCells.forEach((cell) => cell.classList.remove("now"));
      stepCells
        .filter((cell) => Number(cell.dataset.bar) === barIndex && Number(cell.dataset.step) === stepIndex)
        .forEach((cell) => cell.classList.add("now"));
    }, delay);
  }

  function scheduleStep(barIndex, stepIndex, time) {
    const bar = pattern.bars[barIndex % pattern.bars.length];
    tracks.forEach((track) => {
      eventsForTrack(bar, track, pattern)
        .filter((event) => event.step === stepIndex)
        .forEach((event) => scheduleEvent(track, time, event.velocity));
    });
    showStep(barIndex % pattern.bars.length, stepIndex, time);
  }

  function advanceStep() {
    nextNoteTime += secondsPerStep(pattern);
    nextStep += 1;
    if (nextStep >= stepsPerBar(pattern)) {
      nextStep = 0;
      nextBar = (nextBar + 1) % pattern.bars.length;
    }
  }

  function tickScheduler() {
    while (nextNoteTime < ctx.currentTime + 0.12) {
      scheduleStep(nextBar, nextStep, nextNoteTime);
      advanceStep();
    }
  }

  async function start() {
    stop();
    ensureAudio();
    await ctx.resume();
    masterGain.gain.value = Number(els.master.value);
    pattern.bpm = Number(els.bpm.value);
    playing = true;
    nextStep = 0;
    nextBar = 0;
    nextNoteTime = ctx.currentTime + 0.08;
    scheduler = window.setInterval(tickScheduler, 25);
    setStatus("Playing " + pattern.name);
  }

  function stop() {
    playing = false;
    if (scheduler) window.clearInterval(scheduler);
    scheduler = null;
    stepCells.forEach((cell) => cell.classList.remove("now"));
  }

  function readArchive() {
    try {
      return JSON.parse(localStorage.getItem(archiveKey) || "[]");
    } catch (_) {
      return [];
    }
  }

  function writeArchive(entries) {
    localStorage.setItem(archiveKey, JSON.stringify(entries));
  }

  function saveVersion() {
    const entries = readArchive();
    entries.unshift({
      name: pattern.name,
      savedAt: new Date().toISOString().slice(0, 19),
      pattern: clone(pattern)
    });
    writeArchive(entries.slice(0, 50));
    renderArchiveSelect();
    setStatus("Saved version to browser archive.");
  }

  function loadVersion(index) {
    const entries = readArchive();
    const entry = entries[index];
    if (!entry) return;
    pattern = clone(entry.pattern);
    normalizePlaybackCursor();
    renderEditor();
    renderGrid();
    setStatus("Loaded archive version: " + entry.name);
  }

  function applyPatternFromEditor() {
    try {
      const next = JSON.parse(els.editor.value);
      validatePattern(next);
      pattern = next;
      normalizePlaybackCursor();
      renderEditor();
      renderGrid();
      setStatus("Pattern applied.");
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  function validatePattern(p) {
    if (!p || typeof p !== "object") throw new Error("Pattern must be a JSON object.");
    if (!Array.isArray(p.bars) || p.bars.length === 0) throw new Error("Pattern needs at least one bar.");
    if (!p.beats || !p.subdivisions) throw new Error("Pattern needs beats and subdivisions.");
    const total = stepsPerBar(p);
    p.bars.forEach((bar, barIndex) => {
      tracks.forEach((track) => {
        const events = eventsForTrack(bar, track, p);
        events.forEach((event) => {
          if (event.step < 0 || event.step >= total) {
            throw new Error("Bar " + (barIndex + 1) + " " + track + " step out of range.");
          }
        });
      });
    });
  }

  function downloadBlob(filename, mime, bytes) {
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadPattern() {
    downloadBlob(pattern.id + ".json", "application/json", JSON.stringify(pattern, null, 2));
  }

  function varLen(value) {
    let buffer = value & 0x7f;
    const bytes = [];
    while ((value >>= 7)) {
      buffer <<= 8;
      buffer |= ((value & 0x7f) | 0x80);
    }
    while (true) {
      bytes.push(buffer & 0xff);
      if (buffer & 0x80) buffer >>= 8;
      else break;
    }
    return bytes;
  }

  function textBytes(text) {
    return Array.from(new TextEncoder().encode(text));
  }

  function pushMeta(track, delta, type, data) {
    track.push(...varLen(delta), 0xff, type, ...varLen(data.length), ...data);
  }

  function exportMidi() {
    const ppq = pattern.ticksPerQuarter || 480;
    const stepTicks = ticksPerStep(pattern);
    const repeats = Math.max(1, Number(els.loopBars.value) || 8);
    const tempo = Math.round(60000000 / quarterNoteBpm({ ...pattern, bpm: Number(els.bpm.value) || pattern.bpm }));
    const events = [];

    for (let repeat = 0; repeat < repeats; repeat += 1) {
      const bar = pattern.bars[repeat % pattern.bars.length];
      const barStart = repeat * stepsPerBar(pattern) * stepTicks;
      tracks.forEach((track) => {
        const note = pattern.notes[track];
        if (!note) return;
        eventsForTrack(bar, track, pattern).forEach((event) => {
          const start = barStart + event.step * stepTicks;
          const dur = track === "hat" ? stepTicks * 0.45 : track === "cymbal" ? stepTicks * 3 : stepTicks * 0.9;
          const velocity = Math.max(1, Math.min(127, Math.round(event.velocity * 127)));
          events.push({ tick: start, bytes: [0x99, note, velocity] });
          events.push({ tick: start + dur, bytes: [0x89, note, 0] });
        });
      });
    }

    events.sort((a, b) => a.tick - b.tick || a.bytes[0] - b.bytes[0]);

    const track = [];
    pushMeta(track, 0, 0x03, textBytes(pattern.name));
    pushMeta(track, 0, 0x51, [(tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff]);
    pushMeta(track, 0, 0x58, [pattern.beats, Math.log2(pattern.beatUnit || 4), 24, 8]);

    let lastTick = 0;
    events.forEach((event) => {
      const delta = Math.round(event.tick - lastTick);
      track.push(...varLen(delta), ...event.bytes);
      lastTick = Math.round(event.tick);
    });
    pushMeta(track, 0, 0x2f, []);

    const header = [
      0x4d, 0x54, 0x68, 0x64,
      0x00, 0x00, 0x00, 0x06,
      0x00, 0x00,
      0x00, 0x01,
      (ppq >> 8) & 0xff, ppq & 0xff
    ];
    const len = track.length;
    const chunk = [
      0x4d, 0x54, 0x72, 0x6b,
      (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff,
      ...track
    ];
    downloadBlob(pattern.id + ".mid", "audio/midi", new Uint8Array([...header, ...chunk]));
    setStatus("Exported MIDI with " + repeats + " bars.");
  }

  async function refreshMidiOutputs() {
    els.midiOutput.innerHTML = '<option value="">No MIDI output</option>';
    selectedMidiOutput = null;

    if (!navigator.requestMIDIAccess) {
      setStatus("This browser does not expose Web MIDI. Built-in Web Audio drums are available.");
      return;
    }

    try {
      midiAccess = await navigator.requestMIDIAccess();
      const outputs = Array.from(midiAccess.outputs.values());
      outputs.forEach((output) => {
        const option = document.createElement("option");
        option.value = output.id;
        option.textContent = output.name || output.manufacturer || output.id;
        els.midiOutput.appendChild(option);
      });

      if (outputs.length > 0) {
        els.midiOutput.value = outputs[0].id;
        selectedMidiOutput = outputs[0];
        setStatus("MIDI output ready: " + els.midiOutput.options[els.midiOutput.selectedIndex].textContent);
      } else {
        setStatus("Web MIDI is available, but no MIDI output device is visible. Use Web Audio or export MIDI.");
      }

      midiAccess.onstatechange = refreshMidiOutputs;
    } catch (error) {
      setStatus("MIDI access was not available: " + error.message, true);
    }
  }

  els.play.addEventListener("click", start);
  els.stop.addEventListener("click", stop);
  els.exportMidi.addEventListener("click", exportMidi);
  els.addBar.addEventListener("click", addBar);
  els.removeBar.addEventListener("click", removeBar);
  els.grid.addEventListener("click", (event) => {
    const cell = event.target.closest("[data-track][data-step]");
    if (!cell || !els.grid.contains(cell)) return;
    toggleEvent(Number(cell.dataset.bar), cell.dataset.track, Number(cell.dataset.step));
  });
  els.refreshMidi.addEventListener("click", refreshMidiOutputs);
  els.midiOutput.addEventListener("change", () => {
    if (!midiAccess) return;
    selectedMidiOutput = midiAccess.outputs.get(els.midiOutput.value) || null;
    setStatus(selectedMidiOutput ? "MIDI output selected: " + selectedMidiOutput.name : "Using Web Audio drums.");
  });
  els.soundMode.addEventListener("change", () => {
    if (els.soundMode.value !== "audio" && !selectedMidiOutput) {
      refreshMidiOutputs();
    }
  });
  els.saveVersion.addEventListener("click", saveVersion);
  els.downloadPattern.addEventListener("click", downloadPattern);
  els.format.addEventListener("click", () => {
    try {
      els.editor.value = JSON.stringify(JSON.parse(els.editor.value), null, 2);
      setStatus("Formatted JSON.");
    } catch (error) {
      setStatus(error.message, true);
    }
  });
  els.apply.addEventListener("click", applyPatternFromEditor);
  els.archiveSelect.addEventListener("change", (event) => {
    if (event.target.value !== "") loadVersion(Number(event.target.value));
  });
  els.master.addEventListener("input", () => {
    if (masterGain) masterGain.gain.value = Number(els.master.value);
  });
  els.bpm.addEventListener("change", () => {
    pattern.bpm = Number(els.bpm.value) || pattern.bpm;
    renderEditor();
  });

  renderArchiveSelect();
  renderEditor();
  renderGrid();
  setStatus("Ready. Edit the JSON, apply changes, then save good versions to the archive.");
})();
