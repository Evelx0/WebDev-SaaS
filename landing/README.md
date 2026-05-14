# Landing Site Starter

This folder contains the optional public landing page that can be served on your root domain.

It is intentionally:

- plain static HTML, CSS, and JavaScript
- separate from the React admin app in `client/`
- free of secrets, API keys, and admin links
- generic placeholder content for public open-source distribution

## Files

| File | Purpose |
|---|---|
| `index.html` | Generic example landing page |
| `styles.css` | Landing-page styling |
| `main.js` | Small progressive enhancement for reveal effects and footer year |

## Deployment

If you use the included Ubuntu script, this folder is synced to the landing web root, which defaults to:

```text
/var/www/lead-panel-landing
```

Typical domain mapping:

- `https://example.com` -> static landing page from this folder
- `https://www.example.com` -> optional alias of the landing page
- `https://panel.example.com` -> Lead Panel admin app reverse proxied to Node

Replace the placeholder copy, contact details, and domain values before using this landing page publicly.
