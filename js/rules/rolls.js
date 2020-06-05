import {OBSIDIAN} from '../global.js';
import {determineAdvantage} from './prepare.js';
import {Effect} from '../module/effect.js';
import {Filters} from './filters.js';
import AbilityTemplate from '../../../../systems/dnd5e/module/pixi/ability-template.js';
import {bonusToParts, highestProficiency} from './bonuses.js';
import {applyEffects, handleDurations} from '../module/duration.js';
import {ObsidianActor} from '../module/actor.js';
import {hpAfterDamage} from './defenses.js';

export const Rolls = {
	abilityCheck: function (actor, ability, skill, mods = [], rollMod) {
		if (!skill) {
			rollMod = Effect.determineRollMods(actor, rollMod, mode =>
				Filters.appliesTo.abilityChecks(ability, mode));

			mods.push({
				mod: actor.data.data.abilities[ability].mod,
				name: game.i18n.localize(`OBSIDIAN.AbilityAbbr-${ability}`)
			}, ...actor.data.flags.obsidian.abilities[ability].rollParts);
		}

		return Rolls.simpleRoll(actor, {
			type: 'abl',
			title: game.i18n.localize(`OBSIDIAN.Ability-${ability}`),
			parens: skill,
			subtitle: game.i18n.localize('OBSIDIAN.AbilityCheck'),
			mods: mods,
			rollMod: rollMod
		});
	},

	abilityRecharge: function (item, effect, component) {
		const recharge = component.recharge;
		const roll = new Die(6).roll(1);
		const success = roll.total >= recharge.roll;

		return {
			flags: {
				obsidian: {
					type: 'item',
					title: component.name.length
						? component.name
						: effect.name.length ? effect.name : item.name,
					subtitle: `${game.i18n.localize('OBSIDIAN.Recharge')} ${recharge.roll}&mdash;6`,
					results: [[{
						total: roll.total,
						breakdown: `1d6 = ${roll.total}`
					}]],
					addendum: {
						success: success,
						label: game.i18n.localize(`OBSIDIAN.${success ? 'Recharged' : 'Failure'}`)
					}
				}
			}
		};
	},

	annotateAdvantage: function (adv, results) {
		if (adv === 0 || results.length < 2) {
			results[0].active = true;
			return;
		}

		let max = {total: -Infinity};
		let min = {total: Infinity};

		results.forEach(r => {
			if (r.total > max.total) {
				max = r;
			}

			if (r.total < min.total) {
				min = r;
			}
		});

		if (adv > 0) {
			max.active = true;
			results.filter(r => r !== max).forEach(r => r.grey = true);
		} else {
			min.active = true;
			results.filter(r => r !== min).forEach(r => r.grey = true);
		}
	},

	annotateCrits: function (pos, neg, results) {
		for (const result of results) {
			if (result.roll >= pos) {
				result.positive = true;
			} else if (result.roll <= neg) {
				result.negative = true;
			}
		}
	},

	applyDamage: async function (evt) {
		const target = $(evt.currentTarget);
		const damage = new Map();
		const accumulate = (key, value) => damage.set(key, (damage.get(key) || 0) + Number(value));

		if (target.data('apply-all')) {
			target.closest('.obsidian-msg-row-dmg').parent().find('[data-dmg]').each((i, el) =>
				accumulate(el.dataset.type, el.dataset.dmg));
		} else {
			accumulate(target.data('type'), target.data('dmg'));
		}

		const mult = evt.ctrlKey ? .5 : evt.shiftKey ? 2 : 1;
		for (const [type, dmg] of damage.entries()) {
			damage.set(type, Math.floor(dmg * mult));
		}

		let attack;
		const message = game.messages.get(target.closest('.message').data('message-id'));0

		if (message) {
			attack = message.data.flags.obsidian.damage?.attack;
		}

		for (const token of game.user.targets) {
			await token.actor.update(
				{'data.attributes.hp.value': hpAfterDamage(token.actor, damage, attack)});
		}
	},

	applyRollModifiers: function (roll, rolls, rollMod) {
		const mult = rolls[0][0] < 0 ? -1 : 1;
		if (rollMod.reroll > 1) {
			rolls.forEach(r => {
				if (Math.abs(r.last()) < rollMod.reroll) {
					r.push(roll._roll().roll * mult);
				}
			});
		}

		if (rollMod.min > 1) {
			rolls.forEach(r => {
				if (Math.abs(r.last()) < rollMod.min) {
					r.push(rollMod.min * mult);
				}
			});
		}
	},

	applySave: async function (evt) {
		const autoFail = evt.ctrlKey;
		const idx = Number(evt.currentTarget.dataset.index);
		const msgID = evt.currentTarget.closest('[data-message-id]').dataset.messageId;
		const msg = game.messages.get(msgID);

		if (!msg) {
			return;
		}

		// Only apply effects if there are targeted tokens. Otherwise we just
		// roll for the selected tokens and do nothing else.
		const apply = game.user.targets.size > 0;
		const flags = msg.data.flags.obsidian;
		const tokens = apply ? Array.from(game.user.targets) : canvas.tokens.controlled;
		const save = flags.saves[idx];
		const rolls = [];

		if (!autoFail) {
			rolls.push(...tokens.map(t => Rolls.savingThrow(t.actor, save.ability)));
			Rolls.sendMessages(tokens.map((t, i) => [rolls[i], t.actor]));
		}

		if (!apply) {
			return;
		}

		const attack = flags.damage?.hit.attack;
		const totalDamage = Rolls.getDamageFromMessage(msg, 'hit');
		let actor;

		if (flags.realToken) {
			actor = ObsidianActor.fromSceneTokenPair(flags.realScene, flags.realToken);
		} else {
			actor = game.actors.get(msg.data.speaker.actor);
		}

		if (!actor) {
			return;
		}

		const effect = actor.data.obsidian.effects.get(flags.uuid);
		if (!effect) {
			return;
		}

		const targets = [];
		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			const damage = new Map(Array.from(totalDamage.entries()));

			let failed = true;
			if (!autoFail) {
				const roll = rolls[i].flags.obsidian.results[0].find(r => r.active).total;
				failed = roll < save.dc;
			}

			if (failed) {
				targets.push(token);
			} else {
				if (save.save === 'none') {
					continue;
				}

				for (const [type, dmg] of damage.entries()) {
					damage.set(type, Math.max(1, Math.floor(dmg / 2)));
				}
			}

			await token.actor.update(
				{'data.attributes.hp.value': hpAfterDamage(token.actor, damage, attack)});
		}

		await applyEffects(actor, effect, targets, 'save');
	},

	compileBreakdown: mods =>
		mods.filter(mod => mod.mod)
			.map(mod => `${mod.mod.sgnex()} ${mod.name.length ? `[${mod.name}]` : ''}`).join(''),

	compileExpression: function (roll) {
		return roll.parts.map(part => {
			if (part instanceof Die) {
				return part.total;
			}

			if (part instanceof DicePool) {
				return `{${part.rolls.map(r => Rolls.compileExpression(r)).join(', ')}}`;
			}

			return part;
		}).join(' ');
	},

	compileRerolls: (rolls, max, min = 1) => {
		const annotated = [];
		for (let i = 0; i < rolls.length; i++) {
			const roll = rolls[i];
			let cls;

			if (i === rolls.length - 1) {
				if (roll >= max) {
					cls = 'positive';
				} else if (roll <= min) {
					cls = 'negative';
				}
			} else {
				cls = 'grey';
			}

			if (cls) {
				annotated.push(`<span class="obsidian-${cls}">${roll}</span>`);
			} else {
				annotated.push(roll.toString());
			}
		}

		if (rolls.length > 1) {
			return `[${annotated.join(',')}]`;
		}

		return annotated[0];
	},

	compileSave: function (actor, save) {
		const result = {
			effect: save.effect,
			ability: save.target,
			save: save.save,
			target: game.i18n.localize(`OBSIDIAN.AbilityAbbr-${save.target}`)
		};

		if (save.calc === 'formula') {
			let bonus = 8;
			if (!OBSIDIAN.notDefinedOrEmpty(save.bonus)) {
				bonus = Number(save.bonus);
			}

			result.dc = save.value;
			result.breakdown = bonus + Rolls.compileBreakdown(save.rollParts);
		} else {
			result.dc = save.fixed;
			result.breakdown = `${result.dc} [${game.i18n.localize('OBSIDIAN.Fixed')}]`;
		}

		return result;
	},

	create: function (actor, options) {
		if (!options.roll || options.suppressCard) {
			return;
		}

		if (!actor) {
			if (options.actor) {
				actor = game.actors.get(options.actor);
			} else if (options.scene && options.token) {
				actor = ObsidianActor.fromSceneTokenPair(options.scene, options.token);
			}
		}

		if (!actor) {
			return;
		}

		const roll = options.roll;
		if (roll === 'item') {
			if (options.id === undefined) {
				return;
			}

			const item = actor.getEmbeddedEntity('OwnedItem', options.id);
			if (!item) {
				return;
			}

			Rolls.toChat(actor,
				...Rolls.itemRoll(actor, item, Number(options.scaling), options.withDuration));
		} else if (roll === 'fx') {
			if (options.uuid === undefined) {
				return;
			}

			const effect = actor.data.obsidian.effects.get(options.uuid);
			if (!effect) {
				return;
			}

			Rolls.toChat(actor, ...Rolls.effectRoll(actor, effect, {
				scaledAmount: Number(options.scaling),
				withDuration: options.withDuration
			}));
		} else if (roll === 'save') {
			if (!options.save) {
				return;
			}

			if (options.save === 'death') {
				Rolls.toChat(actor, Rolls.death(actor));
			} else {
				Rolls.toChat(actor, Rolls.savingThrow(actor, options.save));
			}
		} else if (roll === 'abl') {
			if (!options.abl) {
				return;
			}

			if (options.abl === 'init') {
				Rolls.toChat(actor, Rolls.initiative(actor));
			} else {
				Rolls.toChat(actor,
					Rolls.abilityCheck(
						actor, options.abl, false, [], Effect.sheetGlobalRollMod(actor)));
			}
		} else if (roll === 'skl') {
			if (!options.skl) {
				return;
			}

			const skill = getProperty(actor.data.flags.obsidian.skills, options.skl);
			if (!skill) {
				return;
			}

			Rolls.toChat(actor, Rolls.skillCheck(actor, skill, options.skl));
		} else if (roll === 'tool') {
			if (options.tool === undefined) {
				return;
			}

			const tool = actor.data.flags.obsidian.skills.tools[Number(options.tool)];
			if (!tool) {
				return;
			}

			Rolls.toChat(actor, Rolls.skillCheck(actor, tool));
		} else if (roll === 'dmg') {
			if (options.effect === undefined) {
				return;
			}

			const effect = actor.data.obsidian.effects.get(options.effect);
			if (!effect) {
				return;
			}

			Rolls.toChat(
				actor,
				...Rolls.damage(
					actor, effect, Number(options.count), Number(options.scaling)));
		}
	},

	d20Breakdown: function (r, crit, total, mods) {
		const extraRolls = mods.filter(mod => mod.roll);
		if (!extraRolls.length) {
			// Simplified breakdown.
			return Rolls.compileRerolls(r, crit) + Rolls.compileBreakdown(mods);
		}

		const rollsTotal = extraRolls.reduce((acc, mod) =>
			acc + mod.roll.total * (mod.sgn === '-' ? -1 : 1), 0);

		return '1d20 '
			+ extraRolls.map(mod => `${mod.ndice.sgnex()}d${mod.die}`).join(' ')
			+ Rolls.compileBreakdown(mods) + ' = '
			+ Rolls.compileRerolls(r, crit)
			+ extraRolls.map(mod => ` ${mod.sgn} (${mod.roll.results.join('+')})`).join('')
			+ (total - rollsTotal).sgnex();
	},

	d20Roll: function (actor, mods = [], crit = 20, fail = 1, rollMod) {
		let n = 2;
		if (rollMod) {
			n += rollMod.ndice;
		}

		const roll = new Die(20).roll(n);
		const rolls = roll.results.map(r => [r]);
		let adv = [];

		if (rollMod) {
			Rolls.applyRollModifiers(roll, rolls, rollMod);
			adv = adv.concat(rollMod.mode);
		}

		const total = mods.reduce((acc, mod) => {
			if (mod.ndice !== undefined) {
				let mult = 1;
				if (mod.ndice < 0) {
					mod.sgn = '-';
					mult = -1;
				} else {
					mod.sgn = '+';
				}

				mod.roll = new Die(mod.die).roll(mod.ndice * mult);
				return acc + mod.roll.total * mult;
			}

			return acc + mod.mod;
		}, 0);

		const results = rolls.map(r => {
			return {
				data3d: {formula: '1d20', results: [r.last()]},
				roll: r.last(),
				total: r.last() + total,
				breakdown: Rolls.d20Breakdown(r, crit, total, mods)
			}
		});

		Rolls.annotateCrits(crit, fail, results);
		Rolls.annotateAdvantage(determineAdvantage(...adv), results);

		return results;
	},

	damage: function (actor, effect, count, scaledAmount) {
		if (isNaN(scaledAmount)) {
			scaledAmount = undefined;
		}

		if (count === undefined || isNaN(count)) {
			count = 1;
		}

		const item = actor.data.obsidian.itemsByID.get(effect.parentItem);
		const isVersatile =
			effect.components.some(c => c.type === 'attack' && c.mode === 'versatile');
		const damage =
			effect.components.filter(c => c.type === 'damage' && c.versatile === isVersatile);
		const scaling =
			item.obsidian.collection.scaling.find(e => e.scalingComponent.ref === effect.uuid);

		if (!item || !damage.length) {
			return [];
		}

		applyEffects(actor, effect, game.user.targets, 'hit');

		const msgs = [];
		for (let i = 0; i < count; i++) {
			msgs.push({
				flags: {
					obsidian: {
						type: 'dmg',
						title: item.name,
						damage: Rolls.rollDamage(actor, damage, {
							item: item,
							scaledAmount: scaledAmount, scaling: scaling
						})
					}
				}
			});
		}

		return msgs;
	},

	death: function (actor) {
		const data = actor.data.data;
		const flags = actor.data.flags.obsidian;
		let mods = [{
			mod: (flags.saves.bonus || 0) + (flags.attributes.death.bonus || 0),
			name: game.i18n.localize('OBSIDIAN.Bonus')
		}];

		const bonuses = actor.data.obsidian.filters.bonuses(Filters.appliesTo.deathSaves);
		if (bonuses.length) {
			mods.push(...bonuses.flatMap(bonus => bonusToParts(actor.data, bonus)));
			mods = highestProficiency(mods);
		}

		const rollMod =
			Effect.determineRollMods(
				actor,
				Effect.makeModeRollMod([
					flags.sheet.roll, flags.saves.roll, flags.attributes.death.roll]),
				mode => Filters.appliesTo.deathSaves(mode));

		const roll = Rolls.simpleRoll(actor, {
			type: 'save',
			title: game.i18n.localize('OBSIDIAN.DeathSave'),
			subtitle: game.i18n.localize('OBSIDIAN.SavingThrow'),
			mods: mods,
			rollMod: rollMod
		});

		// If no advantage or disadvantage, take the first roll, otherwise find
		// the highest or lowest roll, respectively.
		const result = roll.flags.obsidian.results[0].find(r => r.active);
		const success = result.total >= flags.attributes.death.threshold;
		const key = success ? 'success' : 'failure';
		let tally = data.attributes.death[key] + 1;

		if (result.roll === 1) {
			tally++;
		}

		if (tally > 3) {
			tally = 3;
		}

		roll.flags.obsidian.addendum = {success: success};
		roll.flags.obsidian.addendum.label =
			game.i18n.localize(`OBSIDIAN.${success ? 'Success' : 'Failure'}`);

		if (tally > 2) {
			if (success) {
				roll.flags.obsidian.addendum.label = game.i18n.localize('OBSIDIAN.Stable');
			} else {
				roll.flags.obsidian.addendum.label = game.i18n.localize('OBSIDIAN.Deceased');
			}
		}

		if (result.roll === 20) {
			let hp = data.attributes.hp.value;
			if (hp < 1) {
				hp = 1;
			}

			actor.update({
				'data.attributes.death.success': 0,
				'data.attributes.death.failure': 0,
				'data.attributes.hp.value': hp,
				'flags.obsidian.attributes.conditions.unconscious': false
			});
		} else {
			actor.update({[`data.attributes.death.${key}`]: tally});
		}

		return roll;
	},

	effectRoll: function (actor, effect, {name, scaledAmount, isFirst = true, withDuration = true}) {
		const item = actor.data.obsidian.itemsByID.get(effect.parentItem);
		const attacks = effect.components.filter(c => c.type === 'attack');
		const damage = effect.components.filter(c => c.type === 'damage');
		const saves = effect.components.filter(c => c.type === 'save');
		const expr = effect.components.filter(c => c.type === 'expression');
		const targets =
			effect.components.filter(c => c.type === 'target' && c.target === 'individual');
		const scaling =
			item.obsidian.collection.scaling.find(e => e.scalingComponent.ref === effect.uuid);
		const results = [];

		if (withDuration) {
			handleDurations(actor, item, effect, scaledAmount);
		}

		let scaledTargets = 0;
		if (scaledAmount > 0 && scaling) {
			const targetScaling =
				scaling.components.find(c => c.type === 'target' && c.target === 'individual');

			if (targetScaling) {
				scaledTargets = Math.floor(targetScaling.count * scaledAmount);
			}
		}

		let multiDamage = scaledTargets;
		if (targets.length) {
			multiDamage += targets[0].count;
		}

		if (!damage.length || attacks.length || multiDamage < 1 || saves.length) {
			results.push({
				type: item.type === 'spell' ? 'spl' : 'fx',
				title: name ? name : effect.name.length ? effect.name : item.name,
				uuid: effect.uuid
			});
		}

		if (attacks.length) {
			let count = attacks[0].targets + scaledTargets;
			results[0].results = [];

			for (let i = 0; i < count; i++) {
				results[0].results.push(Rolls.toHitRoll(actor, attacks[0]));
			}

			results[0].hit = true;
			results[0].dmgBtn = effect.uuid;
			results[0].dmgCount = count;
			results[0].dmgScaling = scaledAmount;
			results[0].subtitle = game.i18n.localize(attacks[0].attackType);
		} else if (damage.length && multiDamage < 1) {
			results[0].damage = Rolls.rollDamage(actor, damage, {
				scaledAmount: scaledAmount,
				scaling: scaling,
				item: item
			});
		}

		if (saves.length) {
			results[0].saves = saves.map(save => Rolls.compileSave(actor, save));
		}

		if (expr.length) {
			results[0].exprs = expr.map(expr => Rolls.rollExpression(actor, expr, scaledAmount));
		}

		if (damage.length && !attacks.length && multiDamage > 0) {
			for (let i = 0; i < multiDamage; i++) {
				results.push({
					type: item.type === 'spell' ? 'spl' : 'fx',
					title: name ? name : effect.name.length ? effect.name : item.name,
					damage: Rolls.rollDamage(actor, damage, {
						scaledAmount: scaledAmount,
						scaling: scaling,
						item: item
					})
				});
			}
		}

		if (isFirst) {
			results[0].upcast = scaledAmount;
			results[0].details = item;
			results[0].open = !attacks.length && !damage.length;

			if (effect.components.some(c => c.type === 'target' && c.target === 'area')) {
				results[0].aoe = effect.uuid;
			}
		}

		return results.map(result => {
			return {flags: {obsidian: result}}
		});
	},

	fromClick: function (actor, evt) {
		if (!evt.currentTarget.dataset) {
			return;
		}

		Rolls.create(actor, evt.currentTarget.dataset);
	},

	getDamageFromMessage: function (msg, hit) {
		const damage = new Map();
		if (!getProperty(msg.data, `flags.obsidian.damage.${hit}`)?.results.length) {
			return damage;
		}

		const accumulate = (key, value) => damage.set(key, (damage.get(key) || 0) + value);
		msg.data.flags.obsidian.damage[hit].results.forEach(dmg => accumulate(dmg.type, dmg.total));
		return damage;
	},

	hd: function (actor, rolls, conBonus) {
		const results = rolls.map(([n, d]) => new Die(d).roll(n));
		Rolls.toChat(actor, {
			flags: {
				obsidian: {
					type: 'hd',
					title: game.i18n.localize('OBSIDIAN.HD'),
					results: [[{
						data3d: {
							formula: results.map(d => `${d.rolls.length}d${d.faces}`).join('+'),
							results: results.flatMap(d => d.rolls.flatMap(r => r.roll))
						},
						total: results.reduce((acc, die) => acc + die.total, 0) + conBonus,
						breakdown:
							`${rolls.map(([n, d]) => `${n}d${d}`).join('+')}${conBonus.sgn()} = `
							+ results.map(die => `(${die.results.join('+')})`).join(' + ')
							+ conBonus.sgnex()
					}]]
				}
			}
		});

		return results;
	},

	initiative: function (actor) {
		const data = actor.data.data;
		const flags = actor.data.flags.obsidian;
		const mods = duplicate(flags.attributes.init.rollParts);
		const rollMod =
			Effect.determineRollMods(
				actor,
				Effect.makeModeRollMod([flags.sheet.roll, flags.attributes.init.roll]),
				mode => Filters.appliesTo.initiative(flags.attributes.init.ability, mode));

		if (OBSIDIAN.notDefinedOrEmpty(flags.attributes.init.override)) {
			mods.push({
				mod: data.abilities[flags.attributes.init.ability].mod,
				name: game.i18n.localize(`OBSIDIAN.AbilityAbbr-${flags.attributes.init.ability}`)
			});

			if (flags.skills.joat) {
				mods.push({
					mod: Math.floor(data.attributes.prof / 2),
					name: game.i18n.localize('OBSIDIAN.ProfAbbr')
				});
			}

			mods.push({
				mod: data.attributes.init.value,
				name: game.i18n.localize('OBSIDIAN.Bonus')
			});
		} else {
			mods.push({
				mod: Number(flags.attributes.init.override),
				name: game.i18n.localize('OBSIDIAN.Override')
			});
		}

		return Rolls.abilityCheck(
			actor, flags.attributes.init.ability, game.i18n.localize('OBSIDIAN.Initiative'), mods,
			rollMod);
	},

	itemRoll: function (actor, item, scaling, withDuration) {
		if (!item.flags.obsidian || !item.flags.obsidian.effects) {
			return [];
		}

		const itemFlags = item.flags.obsidian;
		if (!itemFlags.effects.length) {
			return [{
				flags: {
					obsidian: {
						type: item.type === 'spell' ? 'spl' : 'fx',
						title: item.name,
						details: item,
						open: true
					}
				}
			}];
		}


		return itemFlags.effects
			.filter(effect => !effect.isLinked)
			.flatMap((effect, i) => Rolls.effectRoll(actor, effect, {
				name: item.name,
				scaledAmount: scaling,
				isFirst: i === 0,
				withDuration: withDuration
			}));
	},

	placeTemplate: function (evt) {
		let actor = game.actors.get(evt.currentTarget.dataset.actor);
		if (!actor) {
			actor =
				ObsidianActor.fromSceneTokenPair(
					evt.currentTarget.dataset.scene,
					evt.currentTarget.dataset.token);

			if (!actor) {
				return;
			}
		}

		const effect = actor.data.obsidian.effects.get(evt.currentTarget.dataset.effect);
		if (!effect) {
			return;
		}

		const aoe = effect.components.find(c => c.type === 'target' && c.target === 'area');
		if (!aoe) {
			return;
		}

		const item = actor.items.find(item => item.data._id === effect.parentItem);
		if (!item) {
			return;
		}

		// Temporarily set the core data to the AoE so we can interface with
		// AbilityTemplate.
		if (!item.data.data.target) {
			item.data.data.target = {};
		}

		item.data.data.target.type = aoe.area;
		item.data.data.target.value = aoe.distance;

		const template = AbilityTemplate.fromItem(item);
		template.drawPreview();
	},

	recharge: function (item, effect, component) {
		const recharge = component.recharge;
		const roll = new Die(recharge.die).roll(recharge.ndice);

		return {
			flags: {
				obsidian: {
					type: 'item',
					title: item.name,
					subtitle: component.label,
					results: [[{
						total: roll.results.reduce((acc, val) => acc + val, 0) + recharge.bonus,
						breakdown:
							`${recharge.ndice}d${recharge.die}${recharge.bonus.sgnex()} = `
							+ `(${roll.results.join('+')})${recharge.bonus.sgnex()}`
					}]]
				}
			}
		};
	},

	rollDamage: function (actor, damage, {scaledAmount = 0, scaling = null, item = null}) {
		damage = damage.concat(
			damage.flatMap(dmg => dmg.rollParts)
				.filter(mod => mod.ndice !== undefined)
				.map(mod => {
					mod.derived = {ncrit: Math.abs(mod.ndice)};
					mod.calc = 'formula';
					mod.addMods = false;
					mod.rollParts = [];
					mod.damage = damage[0].damage;
					return mod;
				}));

		if (scaledAmount > 0 && scaling != null && scaling.scalingComponent.method !== 'cantrip') {
			const damageComponents = scaling.components.filter(c => c.type === 'damage');
			if (damageComponents) {
				damage = damage.concat(duplicate(damageComponents).map(dmg => {
					if (dmg.calc === 'fixed') {
						const constant = dmg.rollParts.find(part => part.constant);
						if (constant) {
							constant.mod = Math.floor(constant.mod * scaledAmount);
						}
					} else {
						dmg.ndice = Math.floor(dmg.ndice * scaledAmount);
						dmg.derived.ncrit = Math.floor(dmg.derived.ncrit * scaledAmount);
					}

					return dmg;
				}));
			}
		}

		if (scaling != null && scaling.scalingComponent.method === 'cantrip') {
			const damageComponents = scaling.components.filter(c => c.type === 'damage');
			if (damageComponents) {
				damage = damage.concat(duplicate(damageComponents).map(dmg => {
					dmg.ndice = Math.floor(dmg.ndice * dmg.scaledDice);
					dmg.derived.ncrit = Math.floor(dmg.derived.ncrit * dmg.scaledDice);
					return dmg;
				}).filter(dmg => dmg.ndice > 0));
			}
		}

		const rolls = damage.map(dmg => {
			if (dmg.calc === 'fixed' || !dmg.ndice) {
				return null;
			}

			const mult = dmg.ndice < 0 ? -1 : 1;
			const ndice = Math.abs(dmg.ndice);
			const hitRoll = new Die(dmg.die).roll(ndice);
			const critRoll = new Die(dmg.die).roll(dmg.derived.ncrit || ndice);
			const hitRolls = hitRoll.results.map(r => [r * mult]);
			const allRolls = hitRolls.concat(critRoll.results.map(r => [r * mult]));
            const numRolls = ndice + (dmg.derived.ncrit || ndice);

			if (dmg.addMods === false) {
				return {
					hit: hitRolls,
					crit: allRolls,
					data3d: {
						formula: `${numRolls}d${dmg.die}`,
						results: allRolls.map(r => Math.abs(r.last()))
					}
				};
			}

			const rollMods = Effect.filterDamage(actor.data, actor.data.obsidian.filters.mods, dmg);
			if (dmg.rollMod) {
				rollMods.push(dmg.rollMod);
			}

			const rollMod = Effect.combineRollMods(rollMods);
			Rolls.applyRollModifiers(hitRoll, allRolls, rollMod);

			return {
				hit: hitRolls,
				crit: allRolls,
				data3d: {
					formula: `${numRolls}d${dmg.die}`,
					results: allRolls.map(r => Math.abs(r.last()))
				}
			};
		});

		const total = mode => rolls.reduce((acc, rolls) => {
			if (rolls && rolls[mode]) {
				return acc + rolls[mode].reduce((acc, r) => acc + r.last(), 0);
			}

			return acc;
		}, 0) + damage.flatMap(dmg => dmg.rollParts).reduce((acc, mod) => acc + mod.mod, 0);

		const results = mode => damage.map((dmg, i) => {
			let subRolls = rolls[i];
			if (subRolls) {
				subRolls = subRolls[mode];
			}

			const subTotal = dmg.rollParts.reduce((acc, mod) => acc + mod.mod, 0);
			let total = subTotal;
			let breakdown;

			if (subRolls) {
				total += subRolls.reduce((acc, r) => acc + r.last(), 0);
				breakdown =
					`${subRolls.length}d${dmg.die}${Rolls.compileBreakdown(dmg.rollParts)} = `
					+ `(${subRolls.map(r => Rolls.compileRerolls(r, dmg.die)).join('+')})`
					+ subTotal.sgnex();
			} else {
				breakdown =
					`${Rolls.compileBreakdown(dmg.rollParts)} = ${total}`.substring(3);
			}

			return {
				type: dmg.damage,
				total: total,
				breakdown: breakdown
			};
		});

		let attack;
		if (item) {
			attack = {};
			if (item.type === 'spell') {
				attack.magical = true;
			} else if (item.type === 'weapon') {
				attack.magical = item.flags.obsidian.magical;
				attack.silver = item.flags.obsidian.tags.silver;
				attack.adamantine = item.flags.obsidian.tags.adamantine;
			}
		}

		return {
			attack: attack,
			hit: {total: total('hit'), results: results('hit')},
			crit: {total: total('crit'), results: results('crit')},
			data3d: {
				formula: rolls.filter(_ => _).map(r => r.data3d.formula).join('+'),
				results: rolls.filter(_ => _).reduce((acc, r) => {
					acc.push(...r.data3d.results);
					return acc;
				}, [])
			}
		};
	},

	rollExpression: function (actor, expr, scaledAmount) {
		const data = actor.getRollData();
		data.scaling = scaledAmount || 0;

		const roll = new Roll(expr.expr, data).roll();

		return {
			total: roll.total,
			flavour: expr.flavour,
			breakdown: `${roll.formula} = ${Rolls.compileExpression(roll)}`
		};
	},

	savingThrow: function (actor, save) {
		const flags = actor.data.flags.obsidian;
		const saveData = flags.saves[save];
		const adv = [flags.saves.roll];

		if (saveData.roll) {
			adv.push(saveData.roll);
		}

		const rollMod =
			Effect.determineRollMods(
				actor,
				Effect.makeModeRollMod([flags.sheet.roll, ...adv]),
				mode => Filters.appliesTo.savingThrows(save, mode));

		return Rolls.simpleRoll(actor, {
			type: 'save',
			title: game.i18n.localize(`OBSIDIAN.Ability-${save}`),
			subtitle: game.i18n.localize('OBSIDIAN.SavingThrow'),
			mods: saveData.rollParts, rollMod: rollMod
		});
	},

	sendMessages: function (messageActorTuple, dice3d = false) {
		ChatMessage.create(messageActorTuple.map(([msg, actor], i) => {
			const data = Rolls.toMessage(actor);
			if (i > 0 || dice3d) {
				data.sound = null;
			}

			if (actor.isToken) {
				msg.flags.obsidian.realToken = actor.token.data._id;
				msg.flags.obsidian.realScene = actor.token.scene.data._id;
			}

			msg.flags.obsidian.npc = actor.data.type === 'npc';
			return mergeObject(data, msg);
		}));
	},

	simpleRoll: function (actor, {type, title, parens, subtitle, mods = [], rollMod}) {
		return {
			flags: {
				obsidian: {
					type: type,
					title: title,
					parens: parens,
					subtitle: subtitle,
					results: [Rolls.d20Roll(actor, mods, 20, 1, rollMod)]
				}
			}
		}
	},

	skillCheck: function (actor, skill, id) {
		const flags = actor.data.flags.obsidian;
		const skillName = skill.custom ? skill.label : game.i18n.localize(`OBSIDIAN.Skill-${id}`);
		let tool = false;
		let key = id;

		if (!key) {
			let list = 'custom';
			let idx = flags.skills.custom.indexOf(skill);

			if (idx < 0) {
				tool = true;
				list = 'tools';
				idx = flags.skills.tools.indexOf(skill);
			}

			key = `${list}.${idx}`;
		}

		const rollMod =
			Effect.determineRollMods(
				actor,
				Effect.makeModeRollMod([flags.sheet.roll, flags.skills.roll, skill.roll]),
				mode => Filters.appliesTo.skillChecks(tool, key, skill.ability, mode));

		return Rolls.abilityCheck(actor, skill.ability, skillName, skill.rollParts, rollMod);
	},

	toChat: async function (actor, ...msgs) {
		const dice3d = game.modules.get('dice-so-nice')?.active;
        if (dice3d) {
        	// Collect all the dice data.
	        const data3d = {formula: [], results: []};
	        msgs.forEach(msg => {
		        if (getProperty(msg, 'flags.obsidian.results')) {
		        	msg.flags.obsidian.results.forEach(result => result.forEach(roll => {
				        if (roll.data3d) {
					        data3d.formula.push(roll.data3d.formula);
					        data3d.results.push(...roll.data3d.results);
				        }
			        }))
		        }

		        if (getProperty(msg, 'flags.obsidian.damage.data3d')) {
			        data3d.formula.push(msg.flags.obsidian.damage.data3d.formula);
			        data3d.results.push(...msg.flags.obsidian.damage.data3d.results);
		        }
	        });

	        data3d.formula = data3d.formula.join('+');
	        await game.dice3d.show(data3d);
        }

		Rolls.sendMessages(msgs.map(msg => [msg, actor]), dice3d);
	},

	toMessage: function (actor, rollMode) {
		if (!rollMode) {
			rollMode = game.settings.get('core', 'rollMode');
		}

		const chatData = {
			speaker: ChatMessage.getSpeaker({actor: actor}),
			user: game.user.data._id,
			rollMode: rollMode,
			sound: CONFIG.sounds.dice,
			content: 'N/A' // This can't be blank for some reason.
		};

		if (['gmroll', 'blindroll'].includes(chatData.rollMode)) {
			chatData.whisper = game.users.entities.filter(user => user.isGM).map(user => user._id);
			if (chatData.rollMode === 'blindroll') {
				chatData.blind = true;
				AudioHelper.play({src: chatData.sound});
			}
		}

		if (chatData.rollMode === 'selfroll') {
			chatData.whisper = [game.user.data._id];
		}

		return chatData;
	},

	toHitRoll: function (actor, hit, extraMods = []) {
		const rollMods = [Effect.sheetGlobalRollMod(actor)];
		if (hit.rollMod) {
			rollMods.push(hit.rollMod);
		}

		const rollMod = Effect.determineRollMods(actor, Effect.combineRollMods(rollMods), mode =>
			Filters.appliesTo.attackRolls(hit, mode));

		return Rolls.d20Roll(actor, [...hit.rollParts, ...extraMods], hit.crit, 1, rollMod);
	}
};
