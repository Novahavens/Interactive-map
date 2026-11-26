---
name: email-submission
description: Prepares housing options for adjusters who take submissions by email (CRS, Example Insurance outside Nearsite, and every other company), filling each company's own option template from verified homes and drafting the email for a person to send. Use this whenever someone wants to send options to an adjuster, fill the CRS or option template, email housing options for a claim, or submit a non-Nearsite claim.
---

# Email submission

Each company gives us its own option template. Getting the template right matters more than the email around it.

## Steps

1. Pick the template: `template_for(company)`: CRS uses the CRS template (fully and partially furnished columns); every other company, Example Insurance included, uses the master "all other companies" template. Both PDFs are in `/mnt/project-files/nearsite-agent/submission-templates/`. A new company's template goes in `config.email_templates` and `lib/nearsite_core/templates.py`.
2. Run the checker for each home (`ns.py check-submit`). Email claims have no platform fee, so the quote is owner rent plus the monthly markup target, capped at the FRV.
3. Fill one option per home: `ns.py email-option --claim c.json --home h.json --option N`. Fix anything in `missing` before going on.
4. Draft the email with `templates.email_draft` (to the adjuster on the claim, subject "Housing options - claim <ref>"). Up to 5 options on a first send, 3 on follow-ups (SOP).
5. **A person sends it.** Save the draft to the run folder. Creating a Gmail draft or sending is gated (`email_send`); a send needs a ticket from `ns.py issue-ticket --action email_send`.

## Never

Don't change a template's field order or labels; adjusters read them by position. Don't put the landlord's phone or email in an option.
