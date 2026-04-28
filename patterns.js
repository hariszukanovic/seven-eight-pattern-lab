window.PatternArchive = {
  current: {
    id: "time-7-8-halftime-v2",
    name: "Time 7/8 half-time - sparse 3-anchor hats",
    bpm: 140,
    beats: 7,
    beatUnit: 8,
    subdivisions: 2,
    ticksPerQuarter: 480,
    swing: 0,
    notes: {
      kick: 36,
      snare: 38,
      hat: 42
    },
    breathSteps: [5],
    bars: [
      {
        name: "A - answer after 4",
        tracks: {
          kick: [
            { step: 0, velocity: 0.95 },
            { step: 4, velocity: 0.7 },
            { step: 8, velocity: 0.78 },
            { step: 12, velocity: 0.88 }
          ],
          snare: [
            { step: 7, velocity: 0.86 }
          ],
          hat: "generated-sparse-3s"
        }
      },
      {
        name: "B - later half-time weight",
        tracks: {
          kick: [
            { step: 0, velocity: 0.95 },
            { step: 4, velocity: 0.67 },
            { step: 8, velocity: 0.76 },
            { step: 12, velocity: 0.9 }
          ],
          snare: [
            { step: 10, velocity: 0.9 }
          ],
          hat: "generated-sparse-3s"
        }
      }
    ]
  }
};
