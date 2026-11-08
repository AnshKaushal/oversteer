import { useState } from "react"
import { Info, ChevronDown, ChevronUp } from "lucide-react"

export function UpscalingFaqCard() {
  const [showUpscalingInfo, setShowUpscalingInfo] = useState(false)
  return (
    <>
      <div
        data-anim-item
        className="rounded border border-white/10 bg-white/[0.02] overflow-hidden"
      >
        <button
          onClick={() => setShowUpscalingInfo((prev) => !prev)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition"
        >
          <div className="flex items-center gap-2">
            <Info size={16} className="text-[#51a7d5]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-200">
              Upscaling Tech FAQ (MetalFX / DLSS / FSR)
            </span>
          </div>
          {showUpscalingInfo ? (
            <ChevronUp size={16} className="text-gray-400" />
          ) : (
            <ChevronDown size={16} className="text-gray-400" />
          )}
        </button>

        {showUpscalingInfo && (
          <div className="px-4 pb-4 pt-1 border-t border-white/5 text-xs text-gray-300 space-y-2 leading-relaxed">
            <p>
              <strong className="text-white">How OverSteer Scales:</strong>{" "}
              Lowering the resolution renders the 3D WebGL scene at a lighter
              pixel grid (e.g. 720p or 1080p), and scales it to fullscreen via
              GPU bilinear sampling. Meanwhile, all dials, speedometer, and HUD
              remain pin-sharp at your screen&apos;s full native resolution!
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
              <div className="p-2 rounded bg-black/40 border border-white/10">
                <span className="font-semibold text-[#6ec2f0] block">
                  AMD FSR 1.0
                </span>
                Spatial EASU + RCAS shader pass can run directly in Three.js
                WebGL for edge sharpening.
              </div>
              <div className="p-2 rounded bg-black/40 border border-white/10">
                <span className="font-semibold text-green-400 block">
                  Apple MetalFX
                </span>
                Requires native Metal API hooks outside the webview; available
                if bundled via native WebGPU/C++ surface.
              </div>
              <div className="p-2 rounded bg-black/40 border border-white/10">
                <span className="font-semibold text-emerald-300 block">
                  NVIDIA DLSS
                </span>
                Requires proprietary NVAPI DLLs and Tensor Cores, not directly
                accessible from sandboxed WebGL browsers.
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
