export interface IndicatorZone {
  end: "front" | "rear"
  mesh?: string
  dx?: [number, number]
  y?: [number, number]
  minVerts?: number
  cdx?: [number, number]
  idle?: number
  paint?: boolean
  glow?: number
  brake?: boolean
  amber?: boolean
  head?: boolean
}

const AMBER_LENS = 0x6a3300

export const INDICATOR_ZONES: Record<string, IndicatorZone[]> = {
  "ferrari_f12.glb": [
    { end: "front", mesh: "^Indicator_Amber", idle: 0x141414 },
    { end: "rear", mesh: "^Indicator_Amber", idle: 0x2d2d2d },
  ],
  "jaguar_f_type.glb": [
    { end: "front", mesh: "^Indicator_Amber", glow: 0xffffff, head: true },
    { end: "rear", mesh: "^Indicator_Amber", paint: true },
  ],
  "mitsubishi_lancer_evo_x.glb": [
    { end: "front", mesh: "^Indicator_Amber", idle: 0x141414 },
    { end: "rear", mesh: "^Indicator_Amber", idle: 0x141414 },
  ],
  "aston_martin_db12.glb": [
    { end: "front", mesh: "^Indicator_Amber", idle: 0x141414 },
    { end: "rear", mesh: "^Tail_Lamp$", glow: 0xff0000, brake: true },
  ],
  "bugatti_chiron_pur_sport.glb": [
    {
      end: "rear",
      mesh: "^Indicator_Amber_Rear$",
      glow: 0xff0000,
      brake: true,
    },
  ],
  "mercedes_benz_w124.glb": [
    { end: "front", mesh: "^Indicator_Amber", idle: AMBER_LENS },
    { end: "rear", mesh: "^Indicator_Amber", idle: AMBER_LENS },
  ],
  "ford_mustang_1969.glb": [
    { end: "front", mesh: "^Indicator_Amber", idle: 0x2d2d2d },
    { end: "rear", mesh: "^Indicator_Amber", glow: 0xff0000, brake: true },
  ],
  "dodge_challenger_srt_hellcat.glb": [
    { end: "front", mesh: "^Indicator_Amber", glow: 0xffffff, head: true },
    { end: "rear", mesh: "^Indicator_Amber", glow: 0xff0000, brake: true },
  ],
  "nissan_350z.glb": [
    { end: "front", mesh: "^Indicator_Amber", idle: 0x141414 },
    { end: "rear", mesh: "^Indicator_Amber", idle: 0x141414 },
  ],
  "porsche_911.glb": [
    { end: "front", mesh: "^Indicator_Amber", idle: 0x141414 },
    { end: "rear", mesh: "^Indicator_Amber", idle: 0x141414 },
  ],
  "audi_r8.glb": [
    { end: "front", mesh: "^Indicator_Amber", idle: 0xb4b8c0 },
    { end: "rear", mesh: "^Indicator_Amber", glow: 0xff0000, brake: true },
  ],

  "lamborghini_aventador.glb": [
    { end: "front", mesh: "^Indicator", amber: true },
    { end: "rear", mesh: "^Tail_Lamp$", amber: true },
  ],

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
