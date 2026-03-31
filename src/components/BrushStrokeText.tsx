import { ReactNode } from "react";

interface BrushStrokeTextProps {
  children: ReactNode;
  className?: string;
}

export function BrushStrokeText({ children, className = "" }: BrushStrokeTextProps) {
  return (
    <span className={`relative inline-block overflow-visible ${className}`} style={{ isolation: 'isolate' }}>
      <svg
        className="absolute pointer-events-none"
        style={{
          left: '-12px',
          right: '-12px',
          top: '-8px',
          bottom: '-8px',
          width: 'calc(100% + 24px)',
          height: 'calc(100% + 16px)',
          zIndex: 0,
        }}
        viewBox="0 0 200 60"
        preserveAspectRatio="none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M8 35C3 32 2 28 4 24C6 18 12 14 22 12C35 9 55 8 80 10C105 12 130 11 155 13C175 15 190 18 195 24C198 28 197 33 192 37C185 42 170 45 150 46C125 47 95 48 65 46C40 44 20 43 10 40C6 39 4 37 8 35Z"
          fill="hsl(var(--primary) / 0.7)"
        />
        <path
          d="M15 33C10 31 8 28 12 24C16 19 28 16 48 14C75 11 110 12 145 14C170 16 188 20 190 26C192 31 185 35 170 38C148 42 115 43 80 42C50 41 25 39 15 33Z"
          fill="hsl(var(--primary) / 0.5)"
        />
        <path
          d="M25 30C20 28 22 24 35 22C55 18 90 17 130 19C160 21 182 24 183 28C184 32 170 35 145 37C115 39 75 40 45 38C30 37 22 34 25 30Z"
          fill="hsl(var(--primary) / 0.4)"
        />
      </svg>
      <span className="relative" style={{ zIndex: 1 }}>{children}</span>
    </span>
  );
}

export default BrushStrokeText;
