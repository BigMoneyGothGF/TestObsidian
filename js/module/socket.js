import {OBSIDIAN} from '../global.js';
import {ObsidianActor} from './actor.js';

export function addSocketListener () {
	game.socket.on('module.obsidian', handleMsg);
}

async function handleMsg (payload) {
	if (!isPrimaryGM()) {
		return;
	}

	if (payload.action === 'SET.WORLD') {
		setWorld(payload);
	} else if (payload.action === 'DELETE.TOKENS') {
		OBSIDIAN.deleteManyTokens(payload.tokens);
	} else {
		const actor = await ObsidianActor.fromUUID(payload.uuid);
		if (actor) {
			const data = Array.isArray(payload.data) ? payload.data : [payload.data];
			actor[`${payload.action.toLowerCase()}EmbeddedDocuments`](payload.entity, data);
		}
	}
}

function setWorld (payload) {
	game.settings.set('obsidian', payload.key, payload.value);
}

function isPrimaryGM () {
	// We must route certain operations through a GM, but if there is more than
	// one GM connected then we don't want each GM to perform the same
	// operation. We must use a deterministic way of choosing the 'primary' GM.
	let id;
	const ids = Array.from(game.users.keys()).sort();

	for (let i = 0; i < ids.length; i++) {
		const user = game.users.get(ids[i]);
		if (user.active && user.isGM) {
			id = ids[i];
			break;
		}
	}

	return game.user.id === id;
}
