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
  /** At rest the lamp takes the live body paint colour (follows repaints). */
  paint?: boolean
  /** Emissive colour while not flashing (e.g. a red tail lamp). */
  glow?: number
  /** The zone is the tail lamp itself: dim at rest, bright while braking. */
  brake?: boolean
  /** Flash by turning the lamp's own red texture amber (no flat overlay). */
  amber?: boolean
  /** The zone is a headlight: lit with the headlights, amber when flashing. */
  head?: boolean
}

const AMBER_LENS = 0x6a3300

export const INDICATOR_ZONES: Record<string, IndicatorZone[]> = {
  // F12: the dark housing round the headlight lens is the front indicator; the dark
  // disc inside each round tail lamp is the rear indicator (both dark at rest)
  "ferrari_f12.glb": [
    { end: "front", mesh: "^Indicator_Amber", idle: 0x141414 },
    { end: "rear", mesh: "^Indicator_Amber", idle: 0x2d2d2d },
  ],
  // F-Type: the white housing round the headlight is the front indicator (white, glowing
  // with the headlights; amber while flashing, never white while indicating);
  // rear: the housing beside each tail lamp, body-coloured at rest
  "jaguar_f_type.glb": [
    { end: "front", mesh: "^Indicator_Amber", glow: 0xffffff, head: true },
    { end: "rear", mesh: "^Indicator_Amber", paint: true },
  ],
  // Evo X: the dark housing round each headlight and tail lamp is the
  // indicator (front and rear), like the Mustang's front ring
  "mitsubishi_lancer_evo_x.glb": [
    { end: "front", mesh: "^Indicator_Amber", idle: 0x141414 },
    { end: "rear", mesh: "^Indicator_Amber", idle: 0x141414 },
  ],
  // DB12 rear: the whole tail-lamp strip (the "Tail_Lamp" material made by
  // scripts/prepare-aston-martin-db12.ts) is the indicator: dim red at rest,
  // bright when braking, amber when flashing
  "aston_martin_db12.glb": [
    // front: the dark housing round each headlight (not the headlight itself)
    { end: "front", mesh: "^Indicator_Amber", idle: 0x141414 },
    { end: "rear", mesh: "^Tail_Lamp$", glow: 0xff0000, brake: true },
  ],
  // Chiron rear: the upper red lamps are the indicators
  "bugatti_chiron_pur_sport.glb": [
    // only the two upper lamps flash; the low strip stays a plain tail lamp
    {
      end: "rear",
      mesh: "^Indicator_Amber_Rear$",
      glow: 0xff0000,
      brake: true,
    },
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
    { end: "front", mesh: "^Indicator_Amber", idle: 0x141414 },
    { end: "rear", mesh: "^Indicator_Amber", idle: 0x141414 },
  ],
  // 911 Turbo S: dark housing round the headlight (front) and the model's
  // own indicator strip (rear)
  "porsche_911.glb": [
    { end: "front", mesh: "^Indicator_Amber", idle: 0x141414 },
    { end: "rear", mesh: "^Indicator_Amber", idle: 0x141414 },
  ],
  // R8 rear: the thin lines are the indicator and glow red like the brake boxes
  "audi_r8.glb": [
    { end: "front", mesh: "headlightGlass", dx: [0, 0.3] },
    { end: "rear", mesh: "rearlight", glow: 0xff0000 },
  ],

  // Aventador: the amber lens in each headlight (front, flashes amber) and the
  // tail-lamp bar (rear: the lamp's own artwork, turned amber while flashing)
  "lamborghini_aventador.glb": [
    { end: "front", mesh: "^Indicator", amber: true },
    { end: "rear", mesh: "^Tail_Lamp$", amber: true },
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
