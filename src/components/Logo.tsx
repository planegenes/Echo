/**
 * 应用 Logo（Echo 文字 SVG）
 * 用于顶部导航栏和 favicon
 */
export interface LogoProps {
  className?: string
  size?: number
}

export function Logo({ className, size = 28 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      className={className}
      aria-label="Echo"
    >
      <text
        x="14"
        y="14"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="16"
        fontWeight="700"
        textLength="16"
        lengthAdjust="spacingAndGlyphs"
      >
        <tspan fill="#41b349">E</tspan>
        <tspan dx="2">c</tspan>
        <tspan dx="2">h</tspan>
        <tspan dx="2">o</tspan>
      </text>
    </svg>
  )
}
