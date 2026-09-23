# Hosting Stonefield multiplayer

## What multiplayer needs

Stonefield multiplayer is a small host-authoritative WebRTC room, not a dedicated game server. The player who chooses **Host online** keeps the world, game simulation, mobs, saves, and action validation in their browser. Guests run their own renderer and generate terrain from the shared seed. A signaling service only brokers room creation, approval, and WebRTC connection setup; TURN relays peer traffic when direct connections fail. The current room cap is four people total.

The repository includes the game client and a deployable Node signaling service. The previous “not configured” message appeared because the default runtime URL is intentionally blank; the client now also accepts a `VITE_SIGNALING_URL` build variable, and active signaling sockets send a keepalive every four minutes. This is useful for free hosts that idle WebSocket services. It does not deploy the service or provide a TURN relay by itself.

Single-player is still static and local. Online play needs an HTTPS game site, a public WSS signaling endpoint, and STUN/TURN connectivity. The signaling service now supplies Cloudflare's public STUN endpoint by default; STUN helps peers discover routes, but it cannot relay data when direct connectivity is blocked. For the TURN fallback, run coturn on a public VM or configure a managed TURN service. WebRTC's guide explains the distinct roles of [signaling](https://webrtc.org/getting-started/peer-connections) and [TURN relaying](https://webrtc.org/getting-started/turn-server).

## Free hosting options

There is no free setup that can promise zero lag, uninterrupted uptime, or successful WebRTC traversal on every network. The host's browser still simulates the world; a relay can add latency and consumes bandwidth.

- **Good first try:** Cloudflare Pages for the static site plus the included Render Blueprint (`render.yaml`) for signaling. Pages serves the built client globally and its current Free limits are 20,000 files and 25 MiB per file ([Pages limits](https://developers.cloudflare.com/pages/platform/limits/)). Render accepts WSS and the app keepalive helps its free service remain awake while the host is playing. However, Render's Free service sleeps after 15 minutes without inbound HTTP/WebSocket messages, takes about a minute to wake, has 750 included instance-hours per month, and may restart; an idle/suspended host can lose its in-memory room ([Render Free limits](https://render.com/docs/free), [Render WebSockets](https://render.com/docs/websocket)). Treat this as hobby/testing hosting, not an uptime guarantee.
- **More dependable free-tier experiment:** Cloudflare Pages plus one Oracle Cloud Always Free VM running both the Node signaling service and coturn. Oracle currently lists up to 2 Ampere OCPUs/12 GB RAM and 10 TB/month outbound transfer in Always Free resources ([Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)). New VM capacity can be unavailable in a region, and this is still a free-tier service without a production uptime guarantee. You must open the signaling HTTPS/WSS port and coturn's UDP/TCP ports in the VM firewall.
- **Most predictable:** a small paid VPS for signaling and coturn, with Cloudflare Pages (or another static host) for the client. This avoids free-tier sleep/quotas, but TURN relay traffic and the VM cost money.

Cloudflare's public `stun.cloudflare.com:3478` endpoint is configured as the initial discovery service. A public STUN endpoint doesn't relay game data. Cloudflare's own managed TURN service is billed at $0.05 per GB outbound when used without its Realtime SFU, so it is not a zero-cost relay for this peer-to-peer design ([Cloudflare TURN pricing and ports](https://developers.cloudflare.com/realtime/turn/)). Self-hosted coturn is the no-service-fee alternative if you have a VM and can administer its firewall.

## Quick setup: Cloudflare Pages + Render

1. Push this project to a Git provider and create a Cloudflare Pages project. Use build command `npm ci && npm run build` and output directory `dist`. The first deploy can omit multiplayer configuration; single-player will still work. Cloudflare also supports direct upload of a locally built `dist/` directory ([Pages setup](https://developers.cloudflare.com/pages/get-started/), [direct upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)).
2. Create a Render Blueprint from the repository's `render.yaml`. It creates the free Node signaling service from `server/signaling`, exposes `/health`, and uses the exact Pages origin in `ALLOWED_ORIGINS` (Render prompts for that value). The template uses public STUN only; see the Oracle/coturn instructions below if you need TURN relay fallback.
3. Copy the Render service URL, e.g. `https://stonefield-signaling.onrender.com`, into the Cloudflare Pages build environment variable `VITE_SIGNALING_URL`. Redeploy Pages. The game converts this HTTPS origin into `wss://…/signal` and uses `/ice` for short-lived ICE configuration. This build variable is public endpoint configuration, not a secret.
4. Open the deployed site, choose **Worlds & online play**, and test two browsers on different networks. Render's free instance can wake slowly if idle. The app's four-minute WebSocket keepalive is only sent while the host page is open.

If you run a private coturn relay, set `TURN_URLS` and `TURN_SHARED_SECRET` only on the signaling service, using the same REST shared secret as coturn. The secret is never sent to the browser; the signaling process mints temporary credentials. Keep port ranges and firewall rules aligned with your coturn configuration. Don't use a sample `turn.example.net` value as a real server.

For a self-managed Node service, `docker build -t stonefield-signaling ./server/signaling` builds the included container. Set `HOST=0.0.0.0`, the provider's `PORT`, and `ALLOWED_ORIGINS` to the exact public game-site origin. Terminate TLS at a reverse proxy so clients use HTTPS/WSS. The standalone server exposes `/health`, `/ice`, and WebSocket `/signal`.

## How to create a world and invite friends

1. Everyone opens the same deployed game URL. A player can choose **Create new world** to make a local world, or open one of their saved worlds.
2. The person whose world should be shared opens **Worlds & online play** and clicks **Host online** on that world. The host shares the displayed 12-character invite code and the game URL with friends.
3. Each friend opens **Worlds & online play**, enters the code, and clicks **Join by invite**. The host approves each request. Once approved, everyone clicks **Enter world**.
4. The host stays online while playing. Up to four people can join in total. Friends may create their own separate worlds at any time; to share one of those, that friend hosts their own world and sends a new invite code.

The shared world is the host's world: its save stays in the host's browser and is not uploaded to Render, Cloudflare, or the signaling service. Closing the host ends the room; guests do not get a cloud-persisted copy. The game is peer-to-peer after setup, not a dedicated world server.

The browser-to-browser Playwright test verifies local room creation, host approval, WebRTC data channels, and an authoritative block drop. That is not proof of public cross-network/TURN connectivity. Before inviting others, do the two-network test above; firewall policy and carrier-grade/symmetric NAT can require TURN even when STUN is configured.

## Hardware and network sizing

These are practical starting estimates, not measured service guarantees. All players render the game locally; server RAM does not substitute for the player's graphics hardware. Browser, operating system, resolution, render distance, seed, and connection quality matter. No provider or machine can promise zero lag on every route.

| Use                                            | Starting client hardware                                                                                                      | Hosted service                                                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| One local player / single-player               | Recent 4-core CPU, 8 GB RAM, WebGL 2-capable integrated graphics; 16 GB RAM is a more comfortable target                      | Static files only; no game VM needed                                                                                          |
| One person hosting a room with up to 3 guests  | Prefer a recent 6–8-core CPU, 16 GB RAM, and a modern WebGL 2 GPU; guests each need roughly the single-player client baseline | Signaling-only: about 1 shared vCPU, 1 GB RAM, and 10–25 GB disk is a reasonable small-room starting point                    |
| Signaling plus self-hosted TURN on the same VM | Same host-player requirements as above; each person's upload/download route still matters                                     | Start around 2 vCPU, 2 GB RAM, SSD, and metered transfer; scale by concurrent relayed bandwidth, not by world simulation load |

For a four-person room, the game server does not render four copies or simulate the world; the host's browser does the authority work. Use a stable host connection with at least several Mbps of upload headroom (10 Mbps up is a comfortable initial target) and ideally under about 100 ms round-trip latency between each guest and host. These are estimates for the current low-rate position/action traffic, not stress-test results. If all traffic must go through TURN, count both relay directions and watch the provider's bandwidth quota; TURN can be the dominant recurring cost. WebRTC's [TURN guidance](https://webrtc.org/getting-started/turn-server) explains why relays are needed when a direct peer route cannot be established.

As one current VPS example, DigitalOcean's [Basic Droplet table](https://www.digitalocean.com/pricing/droplets) lists a 1-vCPU/1-GiB tier suitable to evaluate for signaling alone, and a 2-vCPU/2-GiB tier as a more comfortable combined signaling/TURN starting point. That is an estimate for this four-player cap, not a benchmark. Compare included transfer, region, UDP support, persistent public IP, TLS options, and TURN port/firewall rules before buying. A managed TURN provider is another option and removes coturn administration, but its relay traffic is billed separately.

## Local resource snapshot

Measured on 2026-09-23 against the local Vite build in a fresh, isolated headless Chromium profile at 1280×720 after entering a world for five seconds, with SwiftShader software WebGL:

- The HUD and test sample both reported 60 FPS.
- Chromium reported 26.0 MB used JavaScript heap (31.2 MB allocated; 3.76 GB heap limit).
- The complete isolated Chromium process tree used about 716 MiB RSS. That includes the browser, renderer, GPU/software-rendering and helper processes; it is not the game's JS heap and will differ from Safari/normal GPU acceleration.
- The Vite development server process used about 118 MiB RSS in a separate process snapshot. This dev server is not needed when serving the built static files.
- The fresh profile contained one localStorage entry totaling 111 bytes before any player-made block changes. World saves are stored in the browser and are limited to 2 MB each; actual usage grows with saved mutations. The browser's storage-estimate API returned zero usage in this sample despite that localStorage entry, so it is not treated as an accurate save-size reading.
- `dist/` contained 6 files totaling 714,749 bytes on disk (about 698 KiB); their combined gzip size was 184,885 bytes (about 181 KiB). The current checkout's `node_modules/` directory was about 166 MB, which is development dependencies rather than deployed game data.

This is a reproducible local sample, not a measurement of every user's device or of the currently open Safari/Codex tab. In particular, the headless software-renderer RSS should not be used as a minimum hardware requirement. Local single-player worlds remain in that browser profile; hosting an online room does not upload or back them up.

## Known multiplayer limits

- Four participants total; private invite code and host approval.
- Host must remain connected; no migration, accounts, public matchmaking, or cloud saves.
- Clients must use matching generator/content versions.
- Browser-to-browser connectivity is best-effort. Internet play needs deployed public HTTPS/WSS; the default STUN server helps common NAT paths, but restrictive networks still need a deployed and tested TURN relay.
- Direct WebRTC paths may expose network candidate information to other room participants. A relay-only setup can reduce that exposure but increases relay bandwidth and latency.
