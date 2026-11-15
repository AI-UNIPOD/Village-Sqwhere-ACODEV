import styles from "./landing-page.module.css";

// The footer renders once, so a fixed id is safe; a page kept hidden in memory would point at
// an identical gradient.
const WIND = "ng-flag-wind";

// Drawn inline so it looks the same everywhere: Windows shows flag emoji as two letters.
// The flag's 1:2 ratio: a green field with the white band over its middle third. When motion
// is allowed the white band ripples and a soft light and shade passes over it like wind
// (landing-page.module.css); otherwise the wind layer is hidden and the flag is still.
export function NigeriaFlag({ label }: { label: string }) {
  return (
    <svg className={styles.flag} viewBox="0 0 6 3" role="img" aria-label={label}>
      <defs>
        {/* two periods of shade and light, so sliding it one period loops without a seam */}
        <linearGradient id={WIND} gradientUnits="userSpaceOnUse" x1="-6" x2="6" y1="0" y2="0">
          <stop className={styles.windClear} offset="0" />
          <stop className={styles.windShade} offset="0.125" />
          <stop className={styles.windClear} offset="0.25" />
          <stop className={styles.windLight} offset="0.375" />
          <stop className={styles.windClear} offset="0.5" />
          <stop className={styles.windShade} offset="0.625" />
          <stop className={styles.windClear} offset="0.75" />
          <stop className={styles.windLight} offset="0.875" />
          <stop className={styles.windClear} offset="1" />
        </linearGradient>
      </defs>
      <rect className={styles.flagGreen} width="6" height="3" />
      <rect className={styles.flagWhite} x="2" width="2" height="3" />
      <rect className={styles.flagWind} x="-6" width="12" height="3" fill={`url(#${WIND})`} />
    </svg>
  );
}
