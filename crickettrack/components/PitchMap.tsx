interface Dot { x: number; y: number; color: string }
interface PitchMapProps { dots?: Dot[] }

export function PitchMap({ dots: propDots }: PitchMapProps = {}) {
  const defaultDots: Dot[] = [
    { x: 45, y: 18, color: '#ef4444' }, { x: 48, y: 22, color: '#ef4444' },
    { x: 43, y: 26, color: '#ef4444' }, { x: 46, y: 30, color: '#ef4444' },
    { x: 50, y: 35, color: '#f97316' }, { x: 52, y: 40, color: '#f97316' },
    { x: 49, y: 45, color: '#f97316' }, { x: 51, y: 48, color: '#f97316' },
    { x: 53, y: 52, color: '#f97316' }, { x: 50, y: 56, color: '#22c55e' },
    { x: 48, y: 60, color: '#22c55e' }, { x: 52, y: 64, color: '#22c55e' },
    { x: 50, y: 68, color: '#22c55e' }, { x: 49, y: 72, color: '#22c55e' },
    { x: 51, y: 75, color: '#22c55e' }, { x: 55, y: 58, color: '#3b82f6' },
    { x: 57, y: 62, color: '#3b82f6' }, { x: 56, y: 66, color: '#3b82f6' },
    { x: 58, y: 70, color: '#3b82f6' },
  ]
  const dots = propDots ?? defaultDots

  return (
    <div className="relative w-full max-w-[300px] mx-auto">
      <svg viewBox="0 0 100 100" className="w-full h-auto drop-shadow-2xl">
        <rect x="15" y="8" width="70" height="84" fill="none" stroke="#2c2c2e" strokeWidth="0.3" opacity="0.5" />
        <rect x="38" y="12" width="24" height="76" fill="#121214" stroke="#2c2c2e" strokeWidth="1" opacity="0.8" />
        <line x1="38" y1="22" x2="62" y2="22" stroke="#3a3a3c" strokeWidth="0.8" opacity="0.6" />
        <line x1="38" y1="78" x2="62" y2="78" stroke="#3a3a3c" strokeWidth="0.8" opacity="0.6" />
        <circle cx="50" cy="22" r="1.5" fill="#FF3B30" opacity="0.2" />
        <circle cx="50" cy="78" r="1.5" fill="#FF3B30" opacity="0.2" />
        {dots.map((dot, i) => (
          <g key={i}>
            <circle cx={dot.x} cy={dot.y} r="3" fill={dot.color} opacity="0.3" />
            <circle cx={dot.x} cy={dot.y} r="1.5" fill={dot.color} opacity="1">
              <animate attributeName="opacity" values="1;0.7;1" dur="3s" begin={`${i * 0.15}s`} repeatCount="indefinite" />
            </circle>
          </g>
        ))}
      </svg>
    </div>
  )
}
