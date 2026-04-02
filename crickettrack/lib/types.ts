export type User = {
  id: string
  email: string
  full_name?: string
}

export type SessionStatus = 'uploaded' | 'processing' | 'complete' | 'failed'

export type Session = {
  id: string
  user_id: string
  bowler_name: string
  notes: string | null
  video_url: string
  status: SessionStatus
  created_at: string
}

export type LengthType = 'yorker' | 'full' | 'good_length' | 'short'
export type LineType = 'on_line' | 'off_line'

export type BallPathPoint = {
  frame: number
  x: number
  y: number
  confidence?: number
}

export type Delivery = {
  id: string
  session_id: string
  delivery_number: number
  pitch_x: number
  pitch_y: number
  length_type: LengthType
  line_type: LineType
  speed_estimate: number
  ball_path: BallPathPoint[]
  clip_url: string | null
  created_at: string
}

export type LengthDistribution = {
  yorker: number
  full: number
  good_length: number
  short: number
}

export type Analytics = {
  id: string
  session_id: string
  total_deliveries: number
  line_consistency_pct: number
  length_distribution: LengthDistribution
  avg_speed: number
  max_speed: number
  min_speed: number
  summary_text: string | null
  created_at: string
}
