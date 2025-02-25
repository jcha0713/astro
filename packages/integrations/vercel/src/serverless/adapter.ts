import type { AstroAdapter, AstroConfig, AstroIntegration } from 'astro';

import { getVercelOutput, removeDir, writeJson } from '../lib/fs.js';
import { copyDependenciesToFunction } from '../lib/nft.js';
import { getRedirects } from '../lib/redirects.js';

const PACKAGE_NAME = '@astrojs/vercel/serverless';

function getAdapter(): AstroAdapter {
	return {
		name: PACKAGE_NAME,
		serverEntrypoint: `${PACKAGE_NAME}/entrypoint`,
		exports: ['default'],
	};
}

export default function vercelEdge(): AstroIntegration {
	let _config: AstroConfig;
	let buildTempFolder: URL;
	let functionFolder: URL;
	let serverEntry: string;
	let needsBuildConfig = false;

	return {
		name: PACKAGE_NAME,
		hooks: {
			'astro:config:setup': ({ config, updateConfig }) => {
				needsBuildConfig = !config.build.client;
				const outDir = getVercelOutput(config.root);
				updateConfig({
					outDir,
					build: {
						serverEntry: 'entry.js',
						client: new URL('./static/', outDir),
						server: new URL('./dist/', config.root),
					},
				});
			},
			'astro:config:done': ({ setAdapter, config }) => {
				setAdapter(getAdapter());
				_config = config;
				buildTempFolder = config.build.server;
				functionFolder = new URL('./functions/render.func/', config.outDir);
				serverEntry = config.build.serverEntry;

				if (config.output === 'static') {
					throw new Error(`
		[@astrojs/vercel] \`output: "server"\` is required to use the serverless adapter.
	
	`);
				}
			},
			'astro:build:start': ({ buildConfig }) => {
				if (needsBuildConfig) {
					buildConfig.client = new URL('./static/', _config.outDir);
					buildTempFolder = buildConfig.server = new URL('./dist/', _config.root);
					serverEntry = buildConfig.serverEntry = 'entry.js';
				}
			},
			'astro:build:done': async ({ routes }) => {
				// Copy necessary files (e.g. node_modules/)
				const { handler } = await copyDependenciesToFunction(
					new URL(serverEntry, buildTempFolder),
					functionFolder
				);

				// Remove temporary folder
				await removeDir(buildTempFolder);

				// Enable ESM
				// https://aws.amazon.com/blogs/compute/using-node-js-es-modules-and-top-level-await-in-aws-lambda/
				await writeJson(new URL(`./package.json`, functionFolder), {
					type: 'module',
				});

				// Serverless function config
				// https://vercel.com/docs/build-output-api/v3#vercel-primitives/serverless-functions/configuration
				await writeJson(new URL(`./.vc-config.json`, functionFolder), {
					runtime: getRuntime(),
					handler,
					launcherType: 'Nodejs',
				});

				// Output configuration
				// https://vercel.com/docs/build-output-api/v3#build-output-configuration
				await writeJson(new URL(`./config.json`, _config.outDir), {
					version: 3,
					routes: [
						...getRedirects(routes, _config),
						{ handle: 'filesystem' },
						{ src: '/.*', dest: 'render' },
					],
				});
			},
		},
	};
}

function getRuntime() {
	const version = process.version.slice(1); // 'v16.5.0' --> '16.5.0'
	const major = version.split('.')[0]; // '16.5.0' --> '16'
	return `nodejs${major}.x`;
}
