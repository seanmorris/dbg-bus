import esbuild from 'esbuild';
import { writeFile } from 'node:fs/promises';

const outfile = new URL('./hack.js', import.meta.url);

const result = await esbuild.build({
	entryPoints: [new URL('./hack-source.js', import.meta.url).pathname],
	bundle: true,
	format: 'iife',
	platform: 'browser',
	target: 'es2020',
	write: false,
	minify: false,
	globalName: '__dbgBusBundle'
});

const [{ text }] = result.outputFiles;

const wrapped = `(() => {\n${text}\nreturn __dbgBusBundle.default;\n})()`;

await writeFile(outfile, wrapped);
