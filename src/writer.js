const chalk = require('chalk');
const fs = require('fs');
const luxon = require('luxon');
const path = require('path');
const requestPromiseNative = require('request-promise-native');
const { spawn } = require('child_process');

const shared = require('./shared');
const settings = require('./settings');

async function writeFilesPromise(posts, config) {
	if (config.json) {
		await writeJsonFilesPromise(posts, config);
	}
	if (config.yaml) {
		await writeYamlFilesPromise(posts, config);
	}
	if (config.html) {
		await writeHtmlFilesPromise(posts, config);
	}
	if (config.pandoc) {
		await writePandocFilesPromise(posts, config);
	}
	else if (config.markdown) {
		await writeMarkdownFilesPromise(posts, config);
	}
	await writeImageFilesPromise(posts, config);
}

async function processPayloadsPromise(payloads, loadFunc, config) {
	const promises = payloads.map(payload => new Promise((resolve, reject) => {
		setTimeout(async () => {
			try {
				const data = await loadFunc(payload.item, config);
				await writeFile(payload.destinationPath, data);
				console.log(chalk.green('[OK]') + ' ' + payload.name);
				resolve();
			} catch (ex) {
				console.log(chalk.red('[FAILED]') + ' ' + payload.name + ' ' + chalk.red('(' + ex.toString() + ')'));
				reject();
			}
		}, payload.delay);
	}));

	const results = await Promise.allSettled(promises);
	const failedCount = results.filter(result => result.status === 'rejected').length;
	if (failedCount === 0) {
		console.log('Done, got them all!');
	} else {
		console.log('Done, but with ' + chalk.red(failedCount + ' failed') + '.');
	}
}

async function writeFile(destinationPath, data) {
	await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
	await fs.promises.writeFile(destinationPath, data);
}

async function writeMarkdownFilesPromise(posts, config) {
	// package up posts into payloads
	const payloads = posts.map((post, index) => ({
		item: post,
		name: post.meta.slug,
		destinationPath: getPostPath(post, config),
		delay: index * settings.markdown_file_write_delay
	}));

	console.log('\nSaving markdown files...');
	await processPayloadsPromise(payloads, loadMarkdownFilePromise, config);
}

async function writePandocFilesPromise(posts, config) {
	// package up posts into payloads
	const payloads = posts.map((post, index) => ({
		item: post,
		name: post.meta.slug,
		destinationPath: getPostPath(post, config),
		delay: index * settings.markdown_file_write_delay
	}));

	console.log('\nSaving markdown files using pandoc...');
	await processPayloadsPromise(payloads, loadPandocFilePromise, config);
}

async function writeJsonFilesPromise(posts, config) {
	// package up posts into payloads
	const payloads = posts.map((post, index) => ({
		item: post,
		name: post.meta.slug,
		destinationPath: getPostJsonPath(post, config),
		delay: index * settings.markdown_file_write_delay
	}));

	console.log('\nSaving JSON files...');
	await processPayloadsPromise(payloads, loadJsonFilePromise, config);
}

async function writeYamlFilesPromise(posts, config) {
	// package up posts into payloads
	const payloads = posts.map((post, index) => ({
		item: post,
		name: post.meta.slug,
		destinationPath: getPostYamlPath(post, config),
		delay: index * settings.markdown_file_write_delay
	}));

	console.log('\nSaving YAML files...');
	await processPayloadsPromise(payloads, loadYamlFilePromise, config);
}

async function writeHtmlFilesPromise(posts, config) {
	// package up posts into payloads
	const payloads = posts.map((post, index) => ({
		item: post,
		name: post.meta.slug,
		destinationPath: getPostHtmlPath(post, config),
		delay: index * settings.markdown_file_write_delay
	}));

	console.log('\nSaving HTML files..');
	await processPayloadsPromise(payloads, loadHtmlFilePromise, config);
}

function formatArray(a) {
	return (a.length === 0 ? "" : "\n  - \"" + a.join("\"\n  - \"") + "\"");
}

function formatValue(v) {
	return (' "' + (v || '').replace(/"/g, '\\"') + '"');
}

function formatYaml(data) {
	let output = "";
	Object.entries(data).forEach(pair => {
		const key = pair[0];
		const value = pair[1];
		if (value != null && value != [] && value != "") {
			const value_formatted = Array.isArray(value)
				? formatArray(value)
				: formatValue(value);
			output += key + ':' + value_formatted + '\n';
		}
	});
	return output;
}

function formatFrontmatter(data) {
	return '---\n' + formatYaml(data) + '---\n\n';
}

async function loadMarkdownFilePromise(post, config) {
	return formatFrontmatter(post.frontmatter) + post.content + '\n';
}

async function loadPandocFilePromise(post, config) {
	const htmlContent = await loadHtmlFilePromise(post, config);
	const command = `pandoc --from=html --to=gfm`;
	const pandoc = spawn(command, { shell: true });
	pandoc.stdin.write(htmlContent);
	pandoc.stdin.end();

	let error = "";
	for await (const chunk of pandoc.stderr) {
		console.error('stderr chunk: ' + chunk);
		error += chunk;
	}
	if (error) {
		process.exit(1);
	}

	let output = "";
	for await (const chunk of pandoc.stdout) {
		output += chunk;
	}

	return formatFrontmatter(post.frontmatter) + output;
}

async function loadJsonFilePromise(post, config) {
	return JSON.stringify(post, null, 2);
}

async function loadYamlFilePromise(post, config) {
	return formatFrontmatter(post.frontmatter);
}

async function loadHtmlFilePromise(post, config) {
	const content = post.contentHtml;
	if (content[content.length - 1] != '\n') {
		return content + '\n';
	}
	return content;
}

async function writeImageFilesPromise(posts, config) {
	// collect image data from all posts into a single flattened array of payloads
	let delay = 0;
	const payloads = posts.flatMap(post => {
		const postPath = getPostPath(post, config);
		const imagesDir = path.join(path.dirname(postPath), 'images');
		return post.meta.imageUrls.map(imageUrl => {
			const filename = shared.getFilenameFromUrl(imageUrl);
			const payload = {
				item: imageUrl,
				name: filename,
				destinationPath: path.join(imagesDir, filename),
				delay
			};
			delay += settings.image_file_request_delay;
			return payload;
		});
	});

	if (payloads.length > 0) {
		console.log('\nDownloading and saving images...');
		await processPayloadsPromise(payloads, loadImageFilePromise);
	} else {
		console.log('\nNo images to download and save...');
	}
}

async function loadImageFilePromise(imageUrl) {
	let buffer;
	try {
		buffer = await requestPromiseNative.get({
			url: imageUrl,
			encoding: null // preserves binary encoding
		});
	} catch (ex) {
		if (ex.name === 'StatusCodeError') {
			// these errors contain a lot of noise, simplify to just the status code
			ex.message = ex.statusCode + " " + ex.options.url;
		}
		throw ex;
	}
	return buffer;
}

function getPostPath(post, config) {
	const dt = luxon.DateTime.fromISO(post.frontmatter.date);

	// start with base output dir
	const pathSegments = [config.output];

	if (config.yearFolders) {
		pathSegments.push(dt.toFormat('yyyy'));
	}

	if (config.monthFolders) {
		pathSegments.push(dt.toFormat('LL'));
	}

	// create slug fragment, possibly date prefixed
	let slugFragment = post.meta.slug;
	if (config.prefixDate) {
		slugFragment = dt.toFormat('yyyy-LL-dd') + '-' + slugFragment;
	}

	// use slug fragment as folder or filename as specified
	if (config.postFolders) {
		pathSegments.push(slugFragment, 'index.md');
	} else {
		pathSegments.push(slugFragment + '.md');
	}

	return path.join(...pathSegments);
}

function getPostJsonPath(post, config) {
	return getPostPath(post, config) + ".json";
}

function getPostYamlPath(post, config) {
	return getPostPath(post, config) + ".frontmatter.yaml";
}

function getPostHtmlPath(post, config) {
	return getPostPath(post, config) + ".html";
}

exports.writeFilesPromise = writeFilesPromise;
