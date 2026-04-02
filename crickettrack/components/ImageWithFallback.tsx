'use client'

import { useState } from 'react'

interface Props {
  src: string
  alt: string
  className?: string
  fallbackSrc?: string
}

export function ImageWithFallback({ src, alt, className, fallbackSrc }: Props) {
  const [errored, setErrored] = useState(false)

  if (errored || !src) {
    return (
      <div className={`bg-[#1e1e1e] flex items-center justify-center ${className ?? ''}`}>
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" opacity="0.3">
          <circle cx="24" cy="24" r="22" stroke="white" strokeWidth="2" />
          <path d="M 10 24 Q 24 18 38 24" stroke="white" strokeWidth="1.5" fill="none" />
          <path d="M 10 24 Q 24 30 38 24" stroke="white" strokeWidth="1.5" fill="none" />
        </svg>
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={fallbackSrc && errored ? fallbackSrc : src}
      alt={alt}
      className={className}
      onError={() => setErrored(true)}
    />
  )
}
