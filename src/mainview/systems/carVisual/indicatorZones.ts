export interface IndicatorZone {
  end: "front" | "rear"
  mesh?: string
  dx?: [number, number]
  y?: [number, number]
  /** Only connected pieces of the mesh with at least this many vertices. */
  minVerts?: number
  /** Only connected pieces whose centre sits in this |x| fraction of body width. */
  cdx?: [number, number]
  idle?: number
  /** Emissive colour while not flashing (e.g. a red tail lamp). */
  glow?: number
  /** The zone is the tail lamp itself: dim at rest, bright while braking. */
  brake?: boolean
  /** The zone is a headlight: lit with the headlights, amber when flashing. */
  head?: boolean
}

const AMBER_LENS = 0x6a3300

export const INDICATOR_ZONES: Record<string, IndicatorZone[]> = {
  "cheetah_84.glb": [
    { end: "front", mesh: "Blinkers" },
    { end: "rear", mesh: "Blinkers" },
  ],
  "mitsubishi_lancer_evolution_6.glb": [
    { end: "front", mesh: "^Object_5$", idle: AMBER_LENS },
  ],
  // DB12 rear: the whole tail-lamp strip (the "Tail_Lamp" material made by
  // scripts/prepare-aston-martin-db12.ts) is the indicator: dim red at rest,
  // bright when braking, amber when flashing
  "aston_martin_db12.glb": [
    { end: "rear", mesh: "^Tail_Lamp$", glow: 0xff0000, brake: true },
  ],
  // Chiron rear: the red lamp strip is the indicator, like the DB12's
  "bugatti_chiron_pur_sport.glb": [
    { end: "rear", mesh: "^Tail_Lamp$", glow: 0xff0000, brake: true },
  ],
  // W124: the orange corner lenses are the indicators, front and rear; the
  // red tail lamps stay separate and glow on braking
  "mercedes_benz_w124.glb": [
    { end: "front", mesh: "^Indicator_Amber", idle: AMBER_LENS },
    { end: "rear", mesh: "^Indicator_Amber", idle: AMBER_LENS },
  ],
  // Mustang front: the housing ring round each headlight is the indicator;
  // rear: the outer of the three red bars (dim red, bright on braking)
  "ford_mustang_1969.glb": [
    { end: "front", mesh: "^Indicator_Amber", idle: 0x2d2d2d },
    { end: "rear", mesh: "^Indicator_Amber", glow: 0xff0000, brake: true },
  ],
  // Hellcat front: the outer of the two lamp rings (lit with the headlights);
  // rear: the lower of the two red bars (dim red, bright on braking)
  "dodge_challenger_srt_hellcat.glb": [
    { end: "front", mesh: "^Indicator_Amber", glow: 0xffffff, head: true },
    { end: "rear", mesh: "^Indicator_Amber", glow: 0xff0000, brake: true },
  ],
  "nissan_350z.glb": [
    { end: "front", mesh: "^Object_6$", dx: [0.3, 0.42], y: [0.15, 0.42] },
  ],
  "porsche_997.1_gt2.glb": [
    { end: "front", mesh: "^Object_23$", dx: [0.23, 0.35], y: [0.27, 0.325] },
    { end: "front", mesh: "^Object_23$", dx: [0.42, 0.5], y: [0.39, 0.45] },
  ],
  // R8 rear: the thin lines are the indicator and glow red like the brake boxes
  "audi_r8.glb": [
    { end: "front", mesh: "headlightGlass", dx: [0, 0.3] },
    { end: "rear", mesh: "rearlight", glow: 0xff0000 },
  ],

  // Aventador rear: only the two upper strips (glass013 right, glass016 left)
  // are the indicators; the lower hex lamps (glass015, glass021) stay tail lamps.
  "lamborghini_aventador.glb": [
    { end: "front", mesh: "^glasses_glass0(17|18|20|24)" },
    { end: "rear", mesh: "^glasses_glass0(13|16)", glow: 0xff0000 },
  ],

  // M3 rear: the black bars above the red lamps are the indicators
  // M3 front: the outer headlight's DRL outline (not the inner lamps/pills)
  "bmw_m3.glb": [
    {
      end: "front",
      mesh: "^Plane002_Material019_0$",
      minVerts: 10,
      cdx: [0.33, 0.5],
      glow: 0xffffff,
    },
    {
      end: "rear",
      mesh: "^Plane002_Material016_0$",
      dx: [0.14, 0.36],
      y: [0.58, 0.7],
      idle: 0x000000,
    },
  ],
}
