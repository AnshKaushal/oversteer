export function ParkIcon() {
  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="M4.6 6.2a8.5 8.5 0 0 0 0 11.6" />
      <path d="M19.4 6.2a8.5 8.5 0 0 1 0 11.6" />
      <circle cx="12" cy="12" r="6.6" />
      <path
        d="M10.1 15.6V8.4h2.4a2.1 2.1 0 0 1 0 4.2h-2.4"
        strokeLinejoin="round"
      />
    </g>
  )
}

export const ICON_SIZE = 22
export const ICON_PITCH = 26

export function CruiseIcon() {
  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 17a8.5 8.5 0 1 1 16 0" />
      <path d="M12 17l4.2-5.4" />
      <circle cx="12" cy="17" r="1.2" fill="currentColor" />
    </g>
  )
}

export function DriftIcon() {
  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 14V11.6l2.2-3.2h7.6l3.2 3.2h3.4V14z" />
      <circle cx="7.2" cy="14.6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16.6" cy="14.6" r="1.5" fill="currentColor" stroke="none" />
      <path d="M3 18.6c2-1.8 4 1.8 6 0s4 1.8 6 0 4 1.8 6 0" />
      <path d="M3 22c2-1.8 4 1.8 6 0s4 1.8 6 0 4 1.8 6 0" />
    </g>
  )
}

export function TextIcon({ label }: { label: string }) {
  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="9" />
      <text
        x="12"
        y="15"
        textAnchor="middle"
        fontSize="8"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        {label}
      </text>
    </g>
  )
}

export function SafetyIcon() {
  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l7 2.6v5.6c0 4.4-3 8-7 9.8-4-1.8-7-5.4-7-9.8V5.6z" />
      <path d="M8.6 12l2.4 2.4 4.4-4.8" />
    </g>
  )
}
