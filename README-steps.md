# Sabre site: set up (5 steps)

1. Cloudflare: Storage & databases > D1 > Create database. Name it: sabre-brand-rooms. Copy its Database ID.
2. Put that ID into wrangler.jsonc (replace PASTE_DATABASE_ID_HERE). Claude can do this for you if you send the ID.
3. Cloudflare: Workers & Pages > sabre > Deployments > Retry build (it reads the repo).
4. Add the domain: sabre > Settings > Domains & Routes > Add > Custom domain > sabre.sixunderground.net.au
5. Email for @tags: Compute > Email Service > Email Sending > Onboard Domain (sixunderground.net.au).

Pages:
- /            Sabre hub (overview, progress, approvals, directory, brand book, people)
- /actyva/  /kemon/  /solfine/  /hanz-de-fuko/   Brand Rooms
- /joico/      Brand page (no scheduling)
Client view link: add ?client to any Brand Room, e.g. /kemon/?client
