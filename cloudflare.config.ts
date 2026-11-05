// The Cloudflare Worker (SPEC v3.0 §2, §12, §14): the built app plus the sync API, on workers.dev.
// Deploy: npm run worker:deploy (after `cf auth login`). The static assets are Vite's client
// build (dist). Access is turned on in the dashboard, not here (docs/reviews/H5-spike.md); the
// API checks Access's token against the team and app below. The first deploy creates the D1
// database and R2 bucket by name; the Worker makes its tables on first use (worker/store.ts).
import { bindings, defineConfig, triggers } from "cf/config";

export default defineConfig({
	worker: {
		name: "hiebert-home-inventory",
		compatibilityDate: "2026-11-01",
		entrypoint: "worker/index.ts",
		workersDev: true,
		previewUrls: false,
		assets: {
			notFoundHandling: "single-page-application",
			runWorkerFirst: ["/api/*"],
		},
		env: {
			ASSETS: bindings.assets(),
			DB: bindings.d1({ name: "hiebert-home-inventory" }),
			FILES: bindings.r2({ name: "hiebert-home-inventory-files" }),
			// The Zero Trust team and the Access app "Hiebert Home Inventory". The AUD tag isn't a
			// secret: it is in every token Access issues.
			ACCESS_TEAM: bindings.text("hiebert-personal"),
			ACCESS_AUD: bindings.text("fc3cd268db3db5dd4353e4d93bcdcbe3544c4090f225dbb2dd6cf59d2ee0d0e0"),
		},
		// Daily at 09:00 UTC: purge deletes older than 90 days and activity older than 2 years.
		triggers: [triggers.scheduled({ schedule: "0 9 * * *" })],
	},
});
