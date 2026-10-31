/** Netcode tuning: send rate, interpolation timing, remote-body control, wire ranges. */
export const NET = {
  /** Wire format version; peers on another version cannot talk. */
  protocolVersion: 2,
  /** State packets per second, sent from the fixed physics tick. */
  sendHz: 60,
  /** Receive timeline. */
  interp: {
    /** Lowest and highest adaptive interpolation delay (ms). */
    minDelayMs: 50,
    maxDelayMs: 250,
    /** Delay covers this many send intervals (two lost packets in a row is 3). */
    intervals: 2,
    /** Extra intervals of cover once loss is seen. */
    lossIntervals: 1,
    /** Jitter deviations added on top. */
    jitterGain: 3,
    /** The delay moves at most this fast (ms per second) so retiming never reads as a jump; it falls at a fifth of the rate. */
    riseMsPerS: 150,
    /** Longest extrapolation past the newest snapshot (ms); velocity fades to zero over it. */
    extrapMaxMs: 120,
    snapshotCap: 32,
  },
  clock: {
    /** Samples in the minimum filter that finds the sender clock offset. */
    window: 240,
    /** The applied offset moves at most this much per sample (ms). */
    slewMs: 0.5,
    /** A gap in sender time above this restarts the timeline (ms). */
    resyncGapMs: 1000,
    /** Per-packet decay of the worst queueing seen; the delay covers it (about 8 s to halve at 60 Hz). */
    peakDecay: 0.9985,
  },
  /** Remote body control. */
  remote: {
    /** Position error pulled out per second, as a gain on velocity. */
    posGain: 4.5,
    correctionMax: 10,
    maxDriveSpeed: 120,
    maxDriveAngVel: 8,
    warpDist: 15,
    /** Seconds of velocity carried past a packet's age while it waits. */
    driveExtrapS: 0.15,
    /** Ghost mass over the real car's: stands in for tyre grip and driver authority that a free box lacks. */
    massScale: 1.5,
    /** Clearance (m) the ghost needs from other bodies before it turns solid. */
    clearMargin: 0.25,
  },
  /** Collision handling. */
  correction: {
    accelMax: 25,
    contactGraceMs: 300,
    hardImpactGraceMs: 400,
    impactImpulse: 2000,
    recoverRampMs: 400,
    recoverFollowErrM: 0.65,
    recoverWarpM: 30,
    recoverCorrMax: 3,
    supportDescentDy: -0.5,
  },
  /** Accepted ranges on received values. */
  limits: {
    posAbs: 100_000,
    velComp: 150,
    angVelComp: 32,
    wheelOmega: 600,
    steer: 2,
    speedKmh: 500,
    rpmMax: 30_000,
    gearMin: -1,
    gearMax: 8,
  },
  pingIntervalMs: 2000,
} as const
