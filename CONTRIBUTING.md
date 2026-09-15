# Contributing

This repository is open-core. Core proprietary logic is not in this tree.
Do not open issues or PRs that ask us to publish the Phase 3 pack, legal
templates, IRS/EDGAR connectors, or the commercial compliance engine.

## Developer Certificate of Origin

We use DCO, not a full CLA. Every commit must be signed off:

    git commit -s -m "your message"

The `-s` flag adds:

    Signed-off-by: Your Name <you@example.com>

By signing off you certify that:

1. The contribution is yours, or you have the right to submit it under the
   licenses in NOTICE.md.
2. You grant DIBS Financial a perpetual, irrevocable license to use, relicense,
   and distribute the contribution as part of both the MIT and commercial products.
3. You will not submit counsel templates, client PII, or All Rights Reserved
   Phase 3 pack sources.

## Pull requests

- Base branch: `main`
- Keep legal overclaim out of README (no "legal record substitute"; no unqualified 72-hour formation)
- Do not add files under `/legal_templates`, `/proprietary`, or `/private-services` on a public branch
