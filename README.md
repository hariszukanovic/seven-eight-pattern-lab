# 7/8 Half-Time Pattern Lab

Open `index.html` in a browser to play and visualize the pattern.

The musical material lives in `patterns.js`. For most future changes, edit:

- `bpm`
- `beatUnit`
- `subdivisions`
- `breathSteps`
- `bars[].tracks.kick`
- `bars[].tracks.snare`
- `bars[].tracks.hat`
- `notes` if you want different General MIDI drum notes

The current pattern uses a true 7/8 bar: 7 eighth-note pulses, each split into two 16ths.
`bpm` is the eighth-note pulse tempo for this pattern.

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
- Use `Download JSON` and place the downloaded file in `archive/`.

`Export MIDI` creates a General MIDI drum file using channel 10.
