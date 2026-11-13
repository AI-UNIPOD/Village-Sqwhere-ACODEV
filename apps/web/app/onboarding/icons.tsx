import type { ReactNode } from "react";

// Lucide shapes, outline, 1.75 stroke (docs/design-system/components.md, Icons).
function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const Check = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);

export const ArrowLeft = () => (
  <Icon>
    <path d="m12 19-7-7 7-7M19 12H5" />
  </Icon>
);

export const ArrowRight = () => (
  <Icon>
    <path d="M5 12h14M12 5l7 7-7 7" />
  </Icon>
);

export const Clock = () => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </Icon>
);

export const AlertCircle = () => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
  </Icon>
);

export const SearchX = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3M8.5 8.5l5 5M13.5 8.5l-5 5" />
  </Icon>
);

export const X = () => (
  <Icon>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);

export const Ban = () => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <path d="m4.9 4.9 14.2 14.2" />
  </Icon>
);

export const BadgeCheck = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);

export const TriangleAlert = () => (
  <Icon>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4M12 17h.01" />
  </Icon>
);

export const Bot = () => (
  <Icon>
    <path d="M12 8V4H8M2 14h2M20 14h2M15 13v2M9 13v2" />
    <rect width="16" height="12" x="4" y="8" rx="2" />
  </Icon>
);

export const ShieldCheck = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zM9 12l2 2 4-4" />
  </Icon>
);

export const Inbox = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </Icon>
);
