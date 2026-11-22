const RING = 6

export class GpuTimer {
  private readonly gl: WebGL2RenderingContext | null
  private readonly ext: {
    TIME_ELAPSED_EXT: number
    GPU_DISJOINT_EXT: number
  } | null
  private readonly pending: WebGLQuery[] = []
  private readonly free: WebGLQuery[] = []
  private active: WebGLQuery | null = null
  private last: number | null = null

  constructor(gl: WebGLRenderingContext | WebGL2RenderingContext) {
    const g = gl as WebGL2RenderingContext
    this.gl = typeof g.createQuery === "function" ? g : null
    this.ext = this.gl
      ? (this.gl.getExtension("EXT_disjoint_timer_query_webgl2") as GpuTimer["ext"])
      : null
  }

  get supported() {
    return !!this.ext
  }

  get ms(): number | null {
    return this.last
  }

  begin() {
    const { gl, ext } = this
    if (!gl || !ext || this.active) return
    if (this.pending.length >= RING) return
    const q = this.free.pop() ?? gl.createQuery()
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q)
    this.active = q
  }

  end() {
    const { gl, ext } = this
    if (!gl || !ext || !this.active) return
    gl.endQuery(ext.TIME_ELAPSED_EXT)
    this.pending.push(this.active)
    this.active = null
  }

  poll() {
    const { gl, ext } = this
    if (!gl || !ext) return
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
    while (this.pending.length) {
      const q = this.pending[0]
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break
      this.pending.shift()
      if (!disjoint) {
        const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number
        this.last = ns / 1e6
      }
      this.free.push(q)
    }
  }

  dispose() {
    const { gl } = this
    if (!gl) return
    if (this.active) gl.endQuery(this.ext!.TIME_ELAPSED_EXT)
    for (const q of [...this.pending, ...this.free]) gl.deleteQuery(q)
    this.pending.length = 0
    this.free.length = 0
    this.active = null
  }
}
