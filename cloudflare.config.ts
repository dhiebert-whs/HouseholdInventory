// The Cloudflare Worker (SPEC v3.0 §2, §14): the built app plus the API, on workers.dev.
// Deploy: npm run worker:deploy (after `cf auth login`). The static assets are Vite's client
// build (dist). Access is turned on in the dashboard, not here (docs/reviews/H5-spike.md).
import { bindings, defineConfig } from "cf/config";

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
		},
	},
});
