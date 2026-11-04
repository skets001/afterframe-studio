# Afterframe — Living paintings

A GitHub Pages prototype for turning paintings into QR-accessible video and image-tracked AR experiences, using an Android phone's existing Gemini subscription through an experimental browser userscript. No Gemini API key, paid backend, or USB connection is required by this prototype.

## Quick start

1. Open the deployed GitHub Pages site. Upload a painting or try the sample.
2. Open **Connect a phone**. Scan its setup QR on your Android, then open the URL in **Firefox for Android**.
3. Install **Tampermonkey**, then use the setup page's **Install Afterframe script** button. Confirm installation.
4. Tap **Open Gemini & pair**. Sign into your Google AI Pro account in Firefox. If automatic pairing does not happen, paste the `AF1...` code into the Afterframe panel inside Gemini.
5. Select **video generation** in Gemini. Leave Gemini open, with your phone unlocked.
6. In the studio, choose/edit your prompt and press **Bring this painting to life**. On the phone, press **Run job**. Auto-run is optional and off initially. **Insert prompt only** tests the editor without submitting a generation.
7. The script attempts to attach the painting, insert the prompt, submit it, detect a new video, and transfer the video back. **These Gemini UI steps require real-device testing. They are not an official Google integration.** The script reports missing controls and stops rather than claiming success.
8. If capture fails, download the result using Gemini and select it under **Send downloaded video** in the phone panel. Alternatively, transfer it to the PC and use **Import video**.
9. Press **Prepare camera tracking** once. This compiles a MindAR target locally; detailed images work best.
10. Use **Exhibition → Live visitor QR** to test on another phone, or export a permanent exhibition.

## Permanent exhibition hosting

Live viewer links need the creator's studio open. For an independent exhibition:

1. In **Exhibition**, export the painting's exhibition ZIP.
2. Extract it. Upload its `exhibitions/<painting-slug>/` folder into this repository, retaining the folder structure.
3. Commit to `main` and wait for the GitHub Pages workflow to succeed.
4. Use the app's **Permanent visitor QR**. The address is `<your-site>/exhibitions/<painting-slug>/`.

The export includes the image, video, optional tracking target, and a standalone viewer. No Google session or pairing code is exported. The viewer uses pinned MindAR/Three.js CDN modules for AR. Use H.264 MP4 for broad phone compatibility. Browser support and tracking quality must be tested on your actual iPhone/Android targets. The web upload limit on GitHub is 25 MB per file; use Git for larger videos (this prototype accepts videos up to 64 MB).

## Connection model and limitations

- A hosted QR opens a setup page; it does not itself grant browser control. The installed userscript runs only on `https://gemini.google.com/*` and operates visible UI controls.
- PeerJS's public service provides free signaling over HTTPS/WSS. Paintings and videos travel over a direct encrypted WebRTC data channel. Public signaling is an external dependency with no uptime guarantee.
- There is **no TURN relay**. Corporate firewalls, UDP restrictions, carrier NAT, or proxy policies may prevent pairing. Use manual handoff in that case. This project does not alter Zscaler, corporate browser policies, or Google account restrictions.
- The studio and phone must remain open during a job. This is not a durable cloud queue, and phone background suspension can interrupt work. No unsupported always-on service is claimed.
- Pairing uses a random 192-bit capability token and a separate visitor token per painting. Visitor access is restricted to that painting's image/video/target. Tokens are private invitations: do not publish phone pairing links or commit them.
- Google passwords and cookies remain in Firefox; they are not requested or extracted. Pairing is saved in Tampermonkey storage until you press Disconnect. Auto-run is opt-in. Stop halts subsequent automation; a request already submitted to Gemini may continue and consume your allowance.
- Google AI Pro limits still apply. The subscription is not converted into a Gemini API subscription, and no additional generation allowance is provided.
- Gemini UI selectors, synthetic image attachment, and downloadable video URLs can change. Logs intentionally omit the prompt, image, pairing token, and Google session. Update `src/userscript.js` when needed and reinstall/update the script.
- Images/videos are stored only in this site's IndexedDB on the current browser, until explicitly transferred/exported. Browser data clearing can remove them. Keep backups. Generated media is not committed to this repository automatically.
- Camera access requires HTTPS or localhost. MindAR compilation and AR need access to jsDelivr. Fonts use Google Fonts; system fonts are the fallback.

## Local development

Node.js 22+:

```sh
npm ci
npm run build
npm run dev
```

The build bundles the userscript into `public/afterframe.user.js` and creates `dist/`. Run `npm run build` after changing the userscript. `npm run preview` serves the built site. `npm test` verifies invitation validation, bounded jobs, allowed media URLs, and binary transfer integrity/failure handling.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` runs tests, builds the site, copies any committed `exhibitions/`, and deploys `dist/`. In repository **Settings → Pages**, choose **GitHub Actions** as the source. No repository secrets or cloud API keys are needed.

## Dependencies

PeerJS (signaling/data channels), QRCode (local QR creation), JSZip (exhibition export), Vite/esbuild (build), MindAR (image tracking/compilation), Three.js (AR rendering). See `THIRD-PARTY.md` and `package-lock.json`.

## Verification boundary

Automated tests and desktop browser checks cover the studio and transport logic. End-to-end Gemini generation requires a signed-in Android browser with the extension installed and must be tested by the account owner. No successful Gemini video generation is claimed by a build or simulated test.
