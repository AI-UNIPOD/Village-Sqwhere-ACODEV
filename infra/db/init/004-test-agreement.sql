-- TEST AGREEMENT. This is NOT legal text. It exists so hubs can be created while we build
-- and test, and it MUST be replaced before launch: publish the real agreement as version 2
-- (a published template cannot be edited) and review this file. See infra/README.md.
--
-- Safe to run twice: version 1 is only inserted when it does not exist yet.

INSERT INTO agreement_templates (version, title, body, published_at)
VALUES (
  1,
  'TEST AGREEMENT (NOT LEGAL TEXT)',
  E'# TEST AGREEMENT, NOT LEGAL TEXT\n\n'
  'This text is a placeholder used while Village Sqwhere is being built. It has no legal '
  'effect and must be replaced before real users sign anything.\n\n'
  '1. Confidentiality (placeholder). Members agree to keep the hub''s idea details private.\n'
  '2. Ownership (placeholder). The hub''s own terms, shown with this text, say how '
  'ownership is shared.\n'
  '3. Signature (placeholder). Typing your legal name records that you accepted this text.',
  now()
)
ON CONFLICT (version) DO NOTHING;
