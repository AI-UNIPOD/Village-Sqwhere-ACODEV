import ideas from "../ideas/ideas.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { AgreementText } from "./agreement-text";
import { copy } from "./copy";
import { FieldError } from "./form-parts";
import { LIMITS, type Agreement } from "./hubs-api";
import styles from "./hubs.module.css";

type Errors = { read?: string; legalName?: string };

// What stops a signature: the box is not ticked, or the name is too short or too long.
export function signatureErrors(read: boolean, legalName: string, t: (typeof copy)[Lang]["errors"]): Errors {
  const errors: Errors = {};
  const length = legalName.trim().length;
  if (!read) errors.read = t.read;
  if (length < LIMITS.legalNameMin || length > LIMITS.legalNameMax) errors.legalName = t.legalName;
  return errors;
}

// The agreement exactly as the server sends it, the box that says it was read and the typed
// name that is the signature. Creating a hub and joining one sign in the same way, so both pages
// show this. `changed` says the text was replaced while the person was reading.
export function AgreementBlock(props: {
  lang: Lang;
  agreement: Agreement;
  changed: boolean;
  read: boolean;
  legalName: string;
  errors: Errors;
  onRead: (read: boolean) => void;
  onLegalName: (legalName: string) => void;
}) {
  const { lang, agreement, changed, read, legalName, errors, onRead, onLegalName } = props;
  const t = copy[lang];
  return (
    <fieldset className={ideas.section}>
      <legend className={ideas.legend}>
        <h2 className={ideas.heading}>{t.agreementHeading}</h2>
      </legend>
      {/* the agreement's own title and version, exactly as the server sends them */}
      <p className={styles.agreementName}>
        {agreement.title}
        <span className={ideas.meta}>{fill(t.version, { n: agreement.version })}</span>
      </p>
      {changed && (
        <p className={`${onboarding.error} ${styles.problem}`} role="alert">
          <AlertCircle />
          {t.errors.changed}
        </p>
      )}
      <div className={styles.agreement} role="region" aria-label={t.agreementRegion} tabIndex={0}>
        <AgreementText body={agreement.body} />
      </div>
      <div className={ideas.field}>
        <label className={styles.check}>
          <input
            id="hub-read"
            type="checkbox"
            checked={read}
            aria-invalid={!!errors.read || undefined}
            aria-describedby={errors.read ? "hub-read-error" : undefined}
            onChange={(event) => onRead(event.target.checked)}
          />
          <span>{t.read}</span>
        </label>
        <FieldError id="hub-read">{errors.read}</FieldError>
      </div>
      <div className={ideas.field}>
        <label htmlFor="hub-legalName" className={ideas.label}>
          {t.legalName.label}
        </label>
        <input
          id="hub-legalName"
          className={onboarding.input}
          value={legalName}
          autoComplete="name"
          aria-invalid={!!errors.legalName || undefined}
          aria-describedby={`hub-legalName-help${errors.legalName ? " hub-legalName-error" : ""}`}
          onChange={(event) => onLegalName(event.target.value)}
        />
        <p id="hub-legalName-help" className={ideas.help}>
          {t.legalName.help}
        </p>
        <FieldError id="hub-legalName">{errors.legalName}</FieldError>
      </div>
    </fieldset>
  );
}
