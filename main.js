const { createCanvas, loadImage } = require('canvas');
const crypto = require('crypto');
const fs = require('fs');
const config = require('./config.json');

const IMAGE_W = config.WIDTH;
const IMAGE_H = config.HEIGHT;

let layers = config.layers;
let required = config.required;

const AssetsFolder = 'Assets';
const BuildFolder = 'Builds';

let processedCombos = new Map();
let combos = [];
let images = [];

function checkExists(combo) {
	const hash = crypto.createHash('md5').update(JSON.stringify(combo)).digest('hex');
	return processedCombos.get(hash) != undefined;
}

async function loadImages() {
	for (const layer of layers) {
		for (const element of layer.elements) {
			const path = AssetsFolder + '/' + layer.name + '/' + element;
			
			try {
				const img = await loadImage(path);
				images[element] = img;
			}
			catch (e) {
				console.log(`Failed to load: ${path}`);
				return false;
			}
		}
	}
	
	return true;
}

function getAllCombos(layers) {
	let combos = [];

	for (const layer of layers) {
		if (combos.length <= 0) {
			for (const ele of layer.elements)
				combos.push([{id:layer.id, rarity: layer.rarity, element:ele}]);
			continue;
		}

		let newCombos = [];
		for (const combo of combos) {
			for (let ele of layer.elements) {
				newCombos.push(combo.concat([{id:layer.id, rarity: layer.rarity, element:ele}]));
			}
		}

		for (let ele of layer.elements) {
			newCombos.push([{id:layer.id, rarity: layer.rarity, element:ele}]);
		}

		combos = combos.concat(newCombos);
	}
	
	return combos;
}

function addRequired(combos, reqCombos) {
	for (let j = combos.length - 1; j >= 0; j--) {
		const combo = combos[j];
		let newCombos = [];

		for (const reqCombo of reqCombos) {
			let idx = combo.length;
			for (let k = 0; k < combo.length; k++) {
				const ele = combo[k];
				if (ele.id > reqCombo[0].id) {
					idx = k;
					break;
				}
			}

			let copy = combo.slice();
			for (const reqEle of reqCombo) {
				copy.splice(idx, 0, {id:reqEle.id, rarity: 1, element:reqEle.element});
				idx++;
			}
			
			if (checkExists(copy)) continue;
			
			newCombos.push(copy);
		}

		if (newCombos.length > 0)
			combos.splice(j, 1, newCombos);
		else
			combos.splice(j, 1);
	}
}

function initializeCombos() {
	combos = getAllCombos(layers)
	let reqCombos = getAllCombos(required);

	// remove if they dont have a partner and more than 1 req
	if (required.length > 1) {
		for (let i = reqCombos.length - 1; i >= 0; i--) {
			if (reqCombos[i].length < required.length)
				reqCombos.splice(i, 1);
		}
	}

	addRequired(combos, reqCombos);
	layers = layers.concat(required);
	return true;
}

async function renderCombo(combo, comboNum, width, height) {
	if (checkExists(combo)) return false;
	
	const maxCombos = combos.length * required.length;
	let comboRarity = 1;
	
	const canvas = createCanvas(width, height)
	const ctx = canvas.getContext('2d')
	
	for (const layer of combo) {
		const layerIdx = layers.findIndex(x => x.id == layer.id);
		const layerType = layers[layerIdx];
		
		if (layer.rarity < 1) {
			const maxRares = Math.floor(maxCombos * layer.rarity);
			if (maxRares == 0 || (layerType.count && layerType.count + 1 > maxRares)) {
				return false;
			}
			else if (layerType.count == undefined)
				layerType.count = 0;
			
			comboRarity *= layer.rarity;
			layerType.count++;
		}

		// render layer on canvas
		const img = images[layer.element];
		
		if (!img) {
			throw `Image was not loaded for ${layerType.name}/${layer.element}`;
			return false;
		}
		
		ctx.drawImage(img, layerType.dimensions[0], layerType.dimensions[1], layerType.dimensions[2], layerType.dimensions[3]);
	}
	
	try {
		const buffer = canvas.toBuffer('image/png')
		fs.writeFileSync(BuildFolder + '/' + comboNum.toString() + '.png', buffer);
	}
	catch (e) {
		throw `Failed to save an image to disk`;
		return false;
	}
	
	processedCombos.set(crypto.createHash('md5').update(JSON.stringify(combo)).digest('hex'), comboRarity);
	return true;
}

async function renderCombos(width, height) {
	let promises = [];
	
	let comboCount = processedCombos.size + 1;
	for (const comboList of combos) {
		for (const combo of comboList) {
			promises.push(renderCombo(combo, comboCount, width, height));
			comboCount++;
		}
	}
	
	try {
		await Promise.all(promises);
	}
	catch (e) {
		console.log(e);
		return false;
	}
	
	try {
		fs.writeFileSync(BuildFolder + '/' + 'metadata.json', JSON.stringify(Object.fromEntries(processedCombos)));
	}
	catch (e) {
		console.log("Failed to update metadata file!");
	}
	
	return true;
}

function readMetadata() {
	try {
		processedCombos = new Map(Object.entries(JSON.parse(fs.readFileSync(BuildFolder + '/' + 'metadata.json'))));
	}
	catch (e) {}
}

async function main() {
	readMetadata();
	const processedCount = processedCombos.size;
	
	if (initializeCombos()) {
		console.log(`Successfully found ${combos.length * required.length} possible combinations!`);
	}
	
	if (combos.length <= 0) {
		console.log("There are no unique combinations to process! Ending Program...");
		return;
	}
	
	const imagesLoaded = await loadImages();
	if (!imagesLoaded) {
		console.log("Failed to load Images! Ending Program...");
		return;
	}

	const start = Date.now();
	if (renderCombos(IMAGE_W, IMAGE_H)) {
		const end = Date.now();
		console.log(`Successfully processed ${processedCombos.size - processedCount} combos!`);
		console.log("Time Taken: %s ms", end-start);
	}
}

main();