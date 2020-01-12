import {Schema} from './schema.js';
import {ObsidianHeaderDetailsDialog} from '../dialogs/char-header.js';
import {OBSIDIAN} from '../rules/rules.js';
import {Effect} from './effect.js';

export const Migrate = {
	convertActor: function (data) {
		if (!data.flags) {
			data.flags = {};
		}

		data.flags.obsidian =
			mergeObject(Schema.Actor, data.flags.obsidian || {}, {inplace: false});

		return data;
	},

	convertItem: function (data) {
		if (!data.flags) {
			data.flags = {};
		}

		if (!data.flags.obsidian) {
			data.flags.obsidian = {};
		}

		if (data.type === 'class') {
			Migrate.convertClass(data);
		} else if (data.type === 'consumable') {
			data.flags.obsidian =
				mergeObject(Schema.Consumable, data.flags.obsidian || {}, {inplace: false})
		} else if (data.type === 'backpack') {
			data.flags.obsidian =
				mergeObject(Schema.Container, data.flags.obsidian || {}, {inplace: false});
		} else if (data.type === 'equipment') {
			data.flags.obsidian =
				mergeObject(Schema.Equipment, data.flags.obsidian || {}, {inplace: false});
		} else if (data.type === 'feat') {
			data.flags.obsidian =
				mergeObject(Schema.Feature, data.flags.obsidian || {}, {inplace: false});
		} else if (data.type === 'spell') {
			data.flags.obsidian =
				mergeObject(Schema.Spell, data.flags.obsidian || {}, {inplace: false});
		} else if (data.type === 'weapon') {
			data.flags.obsidian =
				mergeObject(Schema.Weapon, data.flags.obsidian || {}, {inplace: false});
		} else if (data.type === 'loot' || data.type === 'tool') {
			data.flags.obsidian = {};
		}

		if ((data.flags.obsidian.version || 0) < Schema.VERSION) {
			if (data.type === 'consumable') {
				Migrate.convertConsumable(data);
			} else if (data.type === 'equipment') {
				Migrate.convertEquipment(data);
			} else if (data.type === 'feat') {
				Migrate.convertFeature(data);
			} else if (data.type === 'spell') {
				Migrate.convertSpell(data);
			} else if (data.type === 'weapon') {
				Migrate.convertWeapon(data);
			}
		}

		return data;
	},

	convertClass: function (data) {
		OBSIDIAN.Rules.CLASSES.forEach(cls => {
			if (data.name === game.i18n.localize(`OBSIDIAN.Class-${cls}`)) {
				data.name = cls;
			} else {
				const name = data.name;
				data.name = 'custom';
				data.flags.obsidian.custom = name;
			}
		});

		data.flags.obsidian.hd = ObsidianHeaderDetailsDialog.determineHD(data.name);
		data.flags.obsidian.spellcasting =
			ObsidianHeaderDetailsDialog.determineSpellcasting(data.name);
	},

	convertConsumable: function (data) {

	},

	convertEquipment: function (data) {

	},

	convertFeature: function (data) {

	},

	convertSpell: function (data) {

	},

	convertWeapon: function (data) {
		if (data.flags.obsidian.type === 'unarmed') {
			data.flags.obsidian.type = 'melee';
			data.flags.obsidian.category = 'unarmed';
		}

		const primaryEffect = Effect.create();
		if (data.flags.obsidian.charges && data.flags.obsidian.charges.enabled) {
			primaryEffect.name = game.i18n.localize('OBSIDIAN.Charges');
			const charges = data.flags.obsidian.charges;
			const component = Effect.newResource();

			component.fixed = charges.max;
			component.recharge.time = charges.recharge;
			component.recharge.calc = charges.rechargeType;
			component.recharge.ndice = charges.ndice;
			component.recharge.die = charges.die;
			component.recharge.bonus = charges.bonus;
			component.remaining = charges.remaining || 0;
			primaryEffect.components.push(component);
		}

		if (data.flags.obsidian.dc && data.flags.obsidian.dc.enabled) {
			const save = data.flags.obsidian.dc;
			const component = Effect.newSave();
			component.target = save.target;
			component.effect = save.effect;

			if (OBSIDIAN.notDefinedOrEmpty(save.fixed)) {
				component.fixed = Number(save.fixed);
			} else {
				component.calc = 'formula';
				component.ability = save.ability;
				component.prof = save.prof;
				component.bonus = save.bonus;
			}

			primaryEffect.components.push(component);
		}

		if (data.flags.obsidian.hit && data.flags.obsidian.hit.enabled) {
			const attack = data.flags.obsidian.hit;
			const component = Effect.newAttack();
			component.attack = data.flags.obsidian.type;
			component.ability = attack.stat;
			component.bonus = attack.bonus;
			component.proficient = attack.proficient;
			primaryEffect.components.push(component);
		}

		let dmgs = [];
		if (data.flags.obsidian.damage && data.flags.obsidian.damage.length) {
			dmgs = dmgs.concat(data.flags.obsidian.damage.map(dmg => [dmg, false]));
		}

		if (data.flags.obsidian.versatile && data.flags.obsidian.versatile.length) {
			dmgs = dmgs.concat(data.flags.obsidian.versatile.map(dmg => [dmg, true]));
		}

		for (const [dmg, versatile] of dmgs) {
			const component = Effect.newDamage();
			component.ndice = dmg.ndice;
			component.die = dmg.die;
			component.ability = dmg.stat;
			component.bonus = dmg.bonus;
			component.damage = dmg.type;
			component.versatile = versatile;
			primaryEffect.components.push(component);
		}

		if (primaryEffect.components.length) {
			data.flags.obsidian.effects.push(primaryEffect);
		}

		if (data.flags.obsidian.special && data.flags.obsidian.special.length) {
			for (const special of data.flags.obsidian.special) {
				const effect = Effect.create();
				const component = Effect.newResource();

				effect.name = special.name;
				data.flags.obsidian.effects.push(effect);
				effect.components.push(component);
				component.fixed = special.uses.max;
				component.remaining = special.uses.remaining;
			}
		}

		if (data.flags.obsidian.tags.custom && data.flags.obsidian.tags.custom.length) {
			data.flags.obsidian.tags.custom = data.flags.obsidian.tags.custom.join(', ');
		}

		if (!data.flags.obsidian.effects || !data.flags.obsidian.effects.length) {
			data.flags.obsidian.effects = [Effect.create()];
			data.flags.obsidian.effects[0].components = [Effect.newAttack(), Effect.newDamage()];
			data.flags.obsidian.effects[0].components[0].proficient = true;
		}
	}
};

async function beginMigration (html) {
	html.find('.obsidian-migrate-buttons').css('display', 'none');
	html.find('.obsidian-migrate-progress').css('display', 'block');
	const bar = html.find('.obsidian-migrate-bar');
	const totalMigrations =
		game.items.entities.length
		+ game.actors.entities.reduce((acc, actor) => acc + actor.items.length, 0)
		+ game.scenes.entities.reduce((acc, scene) => acc + scene.data.tokens.length, 0);

	let item;
	let actor;
	let scene;
	let progress = 0;

	const updateProgress = () => {
		const pct = Math.round((progress / totalMigrations) * 100);
		bar.css('width', `${pct}%`);
	};

	const migrationFailed = () => {
		html.find('p').remove();
		html.find('.obsidian-migrate-box')
			.append(`<p>${game.i18n.localize('OBSIDIAN.MigrateFailed')}</p>`);
	};

	try {
		const updates = [];
		for (item of game.items.entities) {
			const update = Migrate.convertItem(item.data);
			if (Object.keys(update) > 0) {
				updates.push(update);
			}

			progress++;
			updateProgress();
		}

		await Item.updateMany(updates);
	} catch (e) {
		console.error(item, e);
		migrationFailed();
		return;
	}

	try {
		const actorUpdates = [];
		for (actor of game.actors.entities) {
			const itemUpdates = [];
			for (const item of actor.data.items) {
				const update = Migrate.convertItem(item);
				if (Object.keys(update) > 0) {
					update._id = item._id;
					itemUpdates.push(update);
				}

				progress++;
				updateProgress();
			}

			if (itemUpdates.length) {
				await actor.updateManyEmbeddedEntities('OwnedItem', itemUpdates);
			}

			const actorUpdate = Migrate.convertActor(actor.data);
			if (Object.keys(actorUpdate) > 0) {
				actorUpdates.push(actorUpdate);
			}
		}

		await Actor.updateMany(actorUpdates);
	} catch (e) {
		console.error(actor, e);
		migrationFailed();
		return;
	}

	try {
		const updates = [];
		for (scene of game.scenes.entities) {
			const tokens = [];
			let requiresUpdate = false;

			for (const token of scene.data.tokens) {
				const items = [];
				tokens.push(token);

				if (token.actorLink) {
					continue;
				}

				if (token.actorData.items && token.actorData.items.length) {
					for (const item of token.actorData.items) {
						items.push(mergeObject(item, Migrate.convertItem(item), {inplace: false}));
					}

					token.actorData.items = items;
					requiresUpdate = true;
				}
			}

			if (requiresUpdate) {
				updates.push({_id: scene.data._id, tokens: tokens});
			}

			progress++;
			updateProgress();
		}

		await Scene.updateMany(updates);
	} catch (e) {
		console.error(scene, e);
		migrationFailed();
		return;
	}

	await game.settings.set('obsidian', 'version', Schema.VERSION);
	location.reload();
}

function launchMigrationDialog () {
	const html = $(`
		<section class="obsidian-bg">
			<div class="obsidian-migrate-container">
				<div class="obsidian-migrate-box">
					<h3>${game.i18n.localize('OBSIDIAN.MigrateTitle')}</h3>
					<p>${game.i18n.localize('OBSIDIAN.MigrateMessage')}</p>
					<p>${game.i18n.localize('OBSIDIAN.MigrateMessage2')}</p>
					<div class="obsidian-migrate-buttons">
						<button type="button" class="obsidian-btn-positive">
							<i class="fas fa-check-circle"></i>
							${game.i18n.localize('OBSIDIAN.MigrateStart')}
						</button>
						<button type="button" class="obsidian-btn-negative">
							<i class="fas fa-times-circle"></i>
							${game.i18n.localize('OBSIDIAN.MigrateCancel')}
						</button>
					</div>
				</div>
				<div class="obsidian-migrate-progress">
					<div class="obsidian-migrate-bar" style="width: 0;"></div>
				</div>
			</div>
		</section>
	`);

	if (!game.user.isGM) {
		html.find('p').remove();
		html.find('.obsidian-migrate-buttons').remove();
		html.find('.obsidian-migrate-box')
			.append($(`<p>${game.i18n.localize('OBSIDIAN.MigrateNotPermitted')}</p>`));
	}

	html.find('.obsidian-btn-positive').click(() => beginMigration(html));
	html.find('.obsidian-btn-negative').click(() => html.remove());
	$('body').append(html);
}

export function checkVersion () {
	game.settings.register('obsidian', 'version', {
		scope: 'world',
		type: Number,
		default: 0
	});

	if (!game.items.entities.length
		&& !game.actors.entities.length
		&& !game.scenes.entities.length)
	{
		// This is a new world, no need to migrate anything.
		game.settings.set('obsidian', 'version', Schema.VERSION);
		return;
	}

	const currentVersion = game.settings.get('obsidian', 'version');
	if (currentVersion < Schema.VERSION) {
		launchMigrationDialog();
	}
}
