// The palaver tree V, drawn exactly as docs/design-system/logo/*.svg. logo.test.tsx checks
// the paths still match. It takes its colour from --logo, so it follows the theme.
export const LOGO_PATHS = [
  "M2.5 14Q2 10.4 5.6 10Q6.6 6.8 10.6 7Q13 4 16.4 4.6Q20.4 4.2 22.4 7Q26.6 7 27 10Q30.2 10.6 29.5 14Z",
  "M12 30Q13.8 29.6 14 28L7 13.5H11.4L16 23.4L20.6 13.5H25L18 28Q18.2 29.6 20 30Z",
];

type LogoProps = {
  /** Rendered size in pixels. 16 is the minimum (docs/design-system/logo.md). */
  size?: number;
  className?: string;
};

export function Logo({ size = 32, className }: LogoProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="var(--logo)"
      aria-hidden="true"
      focusable="false"
    >
      {LOGO_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
