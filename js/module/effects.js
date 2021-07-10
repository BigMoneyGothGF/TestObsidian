import {OBSIDIAN} from '../global.js';
import {determineMode} from '../data/prepare.js';
import {Filters} from '../data/filters.js';
import {bonusToParts} from '../data/bonuses.js';
import {Components} from '../data/effect-schema.js';

export const ObsidianEffects = {
	metadata: {
		components: Object.keys(Components),
		active: new Set(['roll-mod', 'bonus', 'defense', 'setter', 'multiplier', 'condition']),
		linked: ['applied', 'scaling'],
		single: new Set(['applied', 'scaling', 'duration', 'target']),
		rollable: new Set([
			'damage', 'save', 'target', 'duration', 'expression', 'consume', 'produce',
			'description', 'roll-table', 'actors'
		])
	},

	create: function (data = {}, options = {}) {
		const effect = new CONFIG.ActiveEffect.documentClass(mergeObject({
			_id: randomID(),
			label: '',
			transfer: false,
			flags: {obsidian: {components: []}}
		}, data), options);

		return effect.toObject();
	},

	createComponent: function (component) {
		const o = duplicate(Components[component].data);
		o.uuid = OBSIDIAN.uuid();
		return o;
	},

	determineMulti: function (filter) {
		let prop = 'filter';
		let tree = OBSIDIAN.Config.EFFECT_FILTER_IS_MULTI;

		do {
			prop = filter[prop];
			tree = tree[prop];
		} while (typeof tree === 'object');

		return !!tree;
	},

	combineRollMods: mods => {
		if (!mods.length) {
			mods.push(ObsidianEffects.makeModeRollMod('reg'));
		}

		return {
			min: Math.max(...mods.map(mod => mod.min)),
			reroll: Math.max(...mods.map(mod => mod.reroll)),
			ndice: mods.reduce((acc, mod) => acc + mod.ndice, 0),
			mode: mods.flatMap(mod => mod.mode),
			max: mods.some(mod => mod.max),
			mcrit: Math.clamped(Math.min(...mods.map(mod => mod.mcrit)), 0, 20),
		};
	},

	combineSetters: setters => {
		const strict = setters.find(setter => !setter.min);
		if (strict) {
			return strict;
		}

		return setters.reduce((min, setter) => {
			if (setter.score > min.score) {
				return setter;
			}

			return min;
		}, {score: 0, min: true});
	},

	determineRollMods: (actor, globalMod, pred) => {
		// Because roll mods themselves can change the mode of a roll, we have
		// to do two passes over the available modifiers. The first pass
		// collects all the mods that aren't contingent on the mode of the
		// roll. Then, in case one of those roll mods then results in changing
		// the mode of the roll, we do another pass with the updated mode to
		// collect any roll mods that might be contingent on that mode too.

		const mods = actor.data.obsidian.filters.mods;
		const firstPass = mods(pred());
		const mode =
			determineMode(...ObsidianEffects.combineRollMods(firstPass.concat(globalMod)).mode);
		const secondPass = mods(pred(mode));
		return ObsidianEffects.combineRollMods(secondPass.concat(globalMod));
	},

	makeModeRollMod: modes => {
		return {min: 1, reroll: 1, ndice: 0, mcrit: 20, max: false, mode: [].concat(modes)}
	},

	sheetGlobalRollMod: actor =>
		ObsidianEffects.makeModeRollMod(actor.data.flags.obsidian.sheet.roll),

	filterDamage: (actorData, filter, dmg) => {
		let attackPred = filter => Filters.damage.isAttack(filter) && filter.multi === 'any';
		const parentEffect = actorData.obsidian.effects.get(dmg.parentEffect);

		if (parentEffect) {
			const attack = parentEffect.components.find(c => c.type === 'attack');
			if (attack) {
				const key = attack.attack[0] + attack.category[0];
				attackPred = filter =>
					Filters.damage.isAttack(filter)
					&& Filters.inCollection(filter, key)
					&& Filters.usesAbility(filter, attack.ability);
			}
		}

		let damagePred = filter => Filters.damage.isDamage(filter) && filter.multi === 'any';
		if (!OBSIDIAN.notDefinedOrEmpty(dmg.damage)) {
			damagePred = filter =>
				Filters.damage.isDamage(filter) && Filters.inCollection(filter, dmg.damage);
		}

		return filter(filter =>
			Filters.isDamage(filter) && (attackPred(filter) || damagePred(filter)));
	},

	fromMessage: msg => {
		if (!msg) {
			return [];
		}

		const actor = ChatMessage.getSpeakerActor(msg.data.speaker);
		if (!actor) {
			return [];
		}

		const effect = actor.data.obsidian.effects.get(msg.getFlag('obsidian', 'effectId'));
		if (!effect) {
			return [];
		}

		return [actor, effect];
	},

	getLinkedResource: function (actor, consumer) {
		if (['spell', 'qty'].includes(consumer.target)) {
			return [];
		}

		const item =
			actor.items.get(consumer.target === 'feat' ? consumer.featID : consumer.itemID);

		if (!item?.getFlag('obsidian', 'effects.length')) {
			return [];
		}

		let effect;
		let resource;

		outer:
			for (const e of item.data.flags.obsidian.effects) {
				for (const c of e.components) {
					if (c.uuid === consumer.ref) {
						resource = c;
						effect = e;
						break outer;
					}
				}
			}

		if (!effect || !resource) {
			return [];
		}

		return [item, effect, resource];
	},

	getScaling: function (actor, effect, value) {
		const item = actor.items.get(effect.parentItem);
		if (!item) {
			return;
		}

		const scalingEffects =
			item.obsidian.collection.scaling.filter(e => e.scalingComponent.ref === effect.uuid);

		if (scalingEffects.length < 1) {
			return;
		}

		if (scalingEffects.length < 2 && !scalingEffects[0].scalingComponent.threshold) {
			return {mode: 'scaling', effect: scalingEffects[0]};
		}

		// Returns the scaling component with the highest threshold less than
		// the scaling value.
		// Example: Thresholds = {3, 5, 9}, Value = 6, Return = 5

		const scaling = scalingEffects.reduce((min, e) => {
			const threshold = e.scalingComponent.threshold;
			if ((!min || threshold > min.scalingComponent.threshold) && value >= threshold) {
				return e;
			}

			return min;
		});

		if (!scaling) {
			return;
		}

		return {mode: 'breakpoint', effect: scaling};
	},

	isActive: function (item, effect) {
		if (item.type === 'spell' || effect.isApplied) {
			return false;
		}

		if (item.data.flags.obsidian.attunement && !item.data.data.attuned) {
			return false;
		}

		if (item.data.obsidian.equippable && !item.data.data.equipped) {
			return false;
		}

		return true;
	},

	isConcentration: function (actor, effect) {
		if (effect.durationComponent && effect.durationComponent.concentration) {
			return true;
		}

		const item = actor.items.get(effect.parentItem);
		return item && item.type === 'spell' && item.data.data.components.concentration;
	},

	isEmbeddedSpellsComponent: function (component) {
		return component.type === 'spells'
			&& component.source === 'individual'
			&& component.spells.length;
	},

	scaleConstant: function (scaling, value, base, constant) {
		if (scaling.mode === 'scaling') {
			return Math.floor(base + constant * value);
		} else {
			return constant;
		}
	},

	scaleDamage: function (actor, scaling, scaledAmount, damage) {
		if (!damage.length) {
			return [];
		}

		let scalingEffect = scaling.effect;
		if (typeof scalingEffect === 'string') {
			scalingEffect = actor.data.obsidian.effects.get(scalingEffect);
		}

		const damageComponents =
			duplicate(scalingEffect.components.filter(c => c.type === 'damage'));

		if (scaling.mode === 'scaling') {
			for (const dmg of damageComponents) {
				const existing = damage.find(c => c.damage === dmg.damage);
				if (existing) {
					ObsidianEffects.scaleExistingDamage(dmg, existing, scaling, scaledAmount);
				}
			}

			return damage;
		} else {
			return damageComponents;
		}
	},

	scaleExistingDamage: function (dmg, existing, scaling, scaledAmount) {
		const constant = existing.rollParts.find(part => part.constant);
		if (constant && dmg.bonus != null) {
			constant.mod =
				ObsidianEffects.scaleConstant(scaling, scaledAmount, constant.mod, dmg.bonus);
			existing.mod = existing.rollParts.reduce((acc, part) => acc + part.mod, 0);
		}

		existing.derived.ndice =
			ObsidianEffects.scaleConstant(
				scaling, scaledAmount, existing.derived.ndice, dmg.derived.ndice);

		existing.derived.ncrit =
			ObsidianEffects.scaleConstant(
				scaling, scaledAmount, existing.derived.ncrit, dmg.derived.ncrit);
	},

	applyBonuses: function (actor, filter) {
		const derived = actor.data.obsidian;
		const bonuses = derived.filters.bonuses(filter);
		const total =
			bonuses.flatMap(bonus => bonusToParts(actor, bonus))
				.reduce((acc, part) => acc + part.mod, 0);

		return Math.floor(total);
	},

	applyMultipliers: function (actor, filter, score) {
		const derived = actor.data.obsidian;
		const multipliers = derived.filters.multipliers(filter);
		const multiplier = multipliers.reduce((acc, mult) => acc * (mult.multiplier ?? 1), 1);
		return Math.floor(score * multiplier);
	},

	applySetters: function (actor, filter, score) {
		const derived = actor.data.obsidian;
		const setters = derived.filters.setters(filter);

		if (setters.length) {
			const setter = ObsidianEffects.combineSetters(setters);
			if (!setter.min || setter.score > score) {
				return setter.score;
			}
		}

		return score;
	}
};
