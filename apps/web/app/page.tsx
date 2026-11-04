import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <p className={styles.eyebrow}>ACODev 2026</p>
      <h1>Village Sqwhere</h1>
      <p className={styles.tagline}>
        The village square for African developers: share an idea, get matched
        with the right collaborators, and build it together.
      </p>
      <p className={styles.status}>Coming soon.</p>
    </main>
  );
}
