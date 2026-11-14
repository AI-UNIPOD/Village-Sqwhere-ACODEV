import styles from "./landing-page.module.css";

// A section title whose full stop is drawn in the logo colour: the page's one recurring brand
// mark. The stop stays part of the text, so the heading reads and is named the same.
export function HeadingText({ text }: { text: string }) {
  if (!text.endsWith(".")) return text;
  return (
    <>
      {text.slice(0, -1)}
      <span className={styles.stop}>.</span>
    </>
  );
}
