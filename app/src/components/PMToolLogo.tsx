/**
 * PMTool Logo · 简化文字标（Notion / Linear 风）
 * - 不依赖图标库
 * - 主题色自适应
 */
interface PMToolLogoProps {
  size?: number
  showText?: boolean
}

export function PMToolLogo({ size = 24, showText = true }: PMToolLogoProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        userSelect: 'none',
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        <rect x="2" y="2" width="20" height="20" rx="5" fill="var(--color-accent)" />
        <path
          d="M7 8.5h10M7 12h7M7 15.5h10"
          stroke="var(--color-text-on-accent)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      {showText && (
        <span
          style={{
            fontSize: '15px',
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: 'var(--color-text)',
          }}
        >
          PMTool
        </span>
      )}
    </div>
  )
}
