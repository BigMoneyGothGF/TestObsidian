let dnd5eDrop;

export function addMacroHook () {
	// This function is encapsulated behind dnd5e.js module scope so this
	// is the only way we can get to it.
	dnd5eDrop = Hooks._hooks.hotbarDrop[0];
	Hooks.off('hotbarDrop', dnd5eDrop);
	Hooks.on('hotbarDrop', onHotbarDrop);
}

async function onHotbarDrop (bar, data, slot) {
	const actor = game.actors.get(data.actorId);
	if (data.type !== 'Item'
		|| !getProperty(data.data, 'flags.obsidian.effects')
		|| !actor || actor.data.type === 'npc')
	{
		dnd5eDrop(bar, data, slot);
		return;
	}

	let command;
	let name;

	if (data.effectUUID) {
		command = `OBSIDIAN.Items.effectMacro('${data.actorId}', '${data.effectUUID}')`;
		const effect =
			data.data.flags.obsidian.effects.find(effect => effect.uuid === data.effectUUID);

		if (effect) {
			name = OBSIDIAN.notDefinedOrEmpty(effect.name) ? data.data.name : effect.name;
		}
	} else {
		command = `OBSIDIAN.Items.itemMacro('${data.actorId}', '${data.data._id}')`;
		name = data.data.name;
	}

	let macro =
		game.macros.entities.find(macro => macro.name === name && macro.command === command);

	if (!macro) {
		macro = await Macro.create({
			name: name,
			type: 'script',
			img: data.data.img,
			command: command
		}, {displaySheet: false});
	}

	game.user.assignHotbarMacro(macro, slot);
	return false;
}
