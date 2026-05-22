# /post — Instagram publishing

`/post` renders a 1080×1080 image from a template, previews it in Discord with **Approve & Post** / **Cancel** buttons, and on approval publishes it to Instagram via the Graph API.

The image is hosted on Discord's CDN — Instagram fetches it once during container creation, so the short-lived signed Discord URL is fine.

## Subcommands

- `/post meme top:<text> bottom:<text> caption:<text> [template:classic|bonk|disaster-girl]`
- `/post card title:<text> body:<text> caption:<text>`

`caption` is the Instagram caption (≤2200 chars).

## Approval flow

1. Bot renders the PNG and replies with the preview + buttons.
2. Only the user who invoked `/post` can approve or cancel.
3. Pending previews expire after 30 minutes (in-memory; lost on restart, by design).
4. On approve: bot creates the IG media container, publishes it, and edits the message with the permalink.

## One-time Instagram setup

You need an IG **Business or Creator** account linked to a Facebook Page, plus a Meta app with publishing permissions.

1. Convert your meme page to a **Business** account (IG app → Settings → Account type and tools).
2. Create or use a Facebook Page you own and link it to the IG account (Page Settings → Linked accounts → Instagram).
3. Go to <https://developers.facebook.com/apps> and create a new app of type **Business**.
4. Add the **Instagram Graph API** product to the app.
5. Open [Graph API Explorer](https://developers.facebook.com/tools/explorer/), select your app, and request these permissions:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_show_list`
   - `pages_read_engagement`
6. Generate a User Access Token, then exchange it for a **long-lived Page access token** (60 days):
   ```
   GET https://graph.facebook.com/v21.0/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id=<APP_ID>
     &client_secret=<APP_SECRET>
     &fb_exchange_token=<SHORT_LIVED_USER_TOKEN>
   ```
   Then `GET /me/accounts` with that token to find the Page access token, which is what you want — Page tokens minted from a long-lived user token do not expire.
7. Find your **IG Business Account ID** (numeric, not the @handle):
   ```
   GET https://graph.facebook.com/v21.0/<PAGE_ID>?fields=instagram_business_account
     &access_token=<PAGE_TOKEN>
   ```

## Environment variables

Add to [bots/discord/.env](../../../bots/discord/.env):

```
IG_USER_ID=17841400000000000
IG_ACCESS_TOKEN=EAAG...
```

If either is missing, `/post` still registers but replies "Instagram is not configured."

## Image specs

Instagram requires JPEG/PNG, aspect ratio 4:5 to 1.91:1, min 320px, max 8MB. The square templates render at 1080×1080 PNG, well within limits.

## Rate limits

50 published posts per 24h per IG account — not a concern for manual posting.
