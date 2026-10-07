# ZYRA - Link Shortener (Cloudflare Worker)

## Phone/browser deploy (no PC)
1. dash.cloudflare.com -> Workers & Pages -> Create -> Worker -> Deploy -> Edit code -> paste all of worker.js
2. Storage & Databases -> KV -> create namespace "zyra-db"
3. Worker -> Settings -> Bindings -> Add KV namespace -> variable name: DB
4. Worker -> Settings -> Variables and Secrets: add ADMIN_PASS (secret)
5. Optional ad variables: AD_HEAD (script), AD_VIDEO, AD_BANNER (Adsterra/Monetag code)
6. Add your domain under Domains & Routes

## Pages
/        -> signup/login, shorten, dashboard, payout request
/admin   -> CPM, creator share, min payout, mark payouts paid
/<code>  -> 2-step ads page, then redirect

## Notes
- Payouts are manual (you send UPI/PayPal, then Mark paid).
- Ad network scripts must be added by you (AD_* variables).
- Test signup, link creation and a click yourself after deploying.
