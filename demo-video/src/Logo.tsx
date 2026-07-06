import React from "react";

/**
 * The mini-vercel mark: an inverted triangle built from three descending
 * bars — the build pipeline funneling down into a deploy. Amber on dark.
 * `progress` (0..1 per bar) lets the intro drop the bars in one by one.
 */
export const LogoMark: React.FC<{
  size?: number;
  barProgress?: [number, number, number];
}> = ({ size = 120, barProgress = [1, 1, 1] }) => {
  const bars = [
    { x: 10, y: 16, w: 100, c: "#ffc554" },
    { x: 28, y: 48, w: 64, c: "#ffb224" },
    { x: 46, y: 80, w: 28, c: "#e89a0c" },
  ];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      style={{ display: "block" }}
    >
      {bars.map((b, i) => {
        const p = Math.max(0, Math.min(1, barProgress[i] ?? 1));
        return (
          <rect
            key={i}
            x={b.x + (b.w * (1 - p)) / 2}
            y={b.y}
            width={Math.max(0.001, b.w * p)}
            height={24}
            rx={7}
            fill={b.c}
            opacity={p}
          />
        );
      })}
    </svg>
  );
};

export const Wordmark: React.FC<{ size?: number; opacity?: number }> = ({
  size = 64,
  opacity = 1,
}) => (
  <div
    style={{
      fontFamily: "system-ui, 'Segoe UI', sans-serif",
      fontWeight: 650,
      fontSize: size,
      letterSpacing: "-0.02em",
      color: "#f2f2f2",
      opacity,
    }}
  >
    mini-vercel
  </div>
);
