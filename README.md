# 7/8 Half-Time Pattern Lab

Open `index.html` in a browser to play and visualize the pattern.

The musical material lives in `patterns.js`. For most future changes, edit:

- `bpm`
- `beatUnit`
- `subdivisions`
- `swing`
- `groove`
- `breathSteps`
- `bars[].tracks.kick`
- `bars[].tracks.bass`
- `bars[].tracks.snare`
- `bars[].tracks.hat`
- `bars[].tracks.cymbal`
- `bars[].tracks.*[].velocity`
- `bars[].tracks.*[].nudgeSteps`
- `bars[].tracks.bass[].note`
- `bars[].tracks.bass[].durationSteps`
- `notes` if you want different General MIDI drum notes

The current pattern uses a true 7/8 bar: 7 eighth-note pulses, each split into two 16ths.
`bpm` is the eighth-note pulse tempo for this pattern.
`swing` delays the off-16ths by a fraction of one step. `groove` adds small Money-ish timing offsets: snare slightly late, hats loose, kicks/cymbals mostly anchored, plus tiny velocity movement.

```text
0  = 1
1  = 1&
2  = 2
3  = 2&
4  = 3
5  = 3&
6  = 4
7  = 4&
8  = 5
9  = 5&
10 = 6
11 = 6&
12 = 7
13 = 7&
```

`generated-sparse-3s` creates sparse hi-hats that support the 3-anchor phrasing:

```text
1 strong, 2& light, 4 strong, 5& light, 7 strong, 7& light
```

Web MIDI note playback requires a MIDI output device or virtual synth exposed by the browser. If there is no MIDI output, use the built-in Web Audio drums or export a `.mid` file.

Good versions can be kept in two ways:

- Use `Save Version` in the app. This stores versions in the browser's local storage.
- Use `Download Version` and place the downloaded file in `archive/`.

Click any kick, snare, hat, or cymbal cell in the grid to toggle that note on or off. Drag an active note left/right to push or delay its timing, and drag up/down to change velocity. Playback keeps running while you edit.
For bass notes, the block width shows note length and the left edge shifts with timing nudge. Length is shown in eighth-note units, so `1 eighth` equals two 16th-grid steps in the default 7/8 pattern. Drag pitch vertically, drag length or the block's right edge horizontally, drag nudge horizontally, and drag velocity vertically.
Use each row's mute button to audition tracks without changing the saved pattern data.
Use `Add Bar` to duplicate the last bar and start shaping a variation. Use `Remove Bar` to drop the last bar; the app always keeps at least one bar.

`Export MIDI` creates bass on MIDI channel 1 and General MIDI drums on channel 10.
