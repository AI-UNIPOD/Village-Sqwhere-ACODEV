import type { CSSProperties, ReactNode } from "react";

// The places bar shows the place you are in with a filled icon (onboarding/icons.tsx holds the
// outline ones). Same Lucide shapes on the same 24px grid, so the two swap without a jump. What
// is cut out of a filled shape (the lines on the newspaper, the tick on the shield) is drawn in
// --icon-cut, the colour of the indicator behind the icon (app-frame.module.css).
const cut: CSSProperties = { stroke: "var(--icon-cut)" };
const cutFill: CSSProperties = { ...cut, fill: "var(--icon-cut)" };

function Filled({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-filled=""
    >
      {children}
    </svg>
  );
}

export const HomeFilled = () => (
  <Filled>
    <path fill="currentColor" d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" />
  </Filled>
);

export const NewspaperFilled = () => (
  <Filled>
    <path fill="currentColor" d="M8 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 0 2-2V4a2 2 0 0 1 2-2Z" />
    <path fill="currentColor" d="M6 9H4a2 2 0 0 0-2 2v9a2 2 0 0 0 4 0Z" />
    <path style={cut} d="M15 18h-5M18 14h-8" />
    <rect style={cutFill} x="10" y="6" width="8" height="4" rx="1" />
  </Filled>
);

export const LightbulbFilled = () => (
  <Filled>
    <path
      fill="currentColor"
      d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5Z"
    />
    <path fill="currentColor" d="M9 14h6v4H9Z" />
    <path d="M9 18h6M10 22h4" />
  </Filled>
);

export const UsersFilled = () => (
  <Filled>
    <path fill="currentColor" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2Z" />
    <circle fill="currentColor" cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </Filled>
);

export const ShieldCheckFilled = () => (
  <Filled>
    <path
      fill="currentColor"
      d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
    />
    <path style={cut} d="m9 12 2 2 4-4" />
  </Filled>
);

export const UserFilled = () => (
  <Filled>
    <path fill="currentColor" d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2Z" />
    <circle fill="currentColor" cx="12" cy="7" r="4" />
  </Filled>
);
