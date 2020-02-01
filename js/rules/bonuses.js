import {Filters} from './filters.js';
import {OBSIDIAN} from './rules.js';

export function applyBonuses (actorData) {
	const data = actorData.data;
	const flags = actorData.flags.obsidian;

	for (const speed of OBSIDIAN.Rules.SPEEDS) {
		if (!flags.attributes.speed[speed]) {
			flags.attributes.speed[speed] = {};
		}

		const bonuses = actorData.obsidian.filters.bonuses(Filters.appliesTo.speedScores(speed));
		if (bonuses.length) {
			flags.attributes.speed[speed].derived =
				(flags.attributes.speed[speed].override || 0)
				+ bonuses.reduce((acc, bonus) =>
					acc + bonusToParts(actorData, bonus)
						.reduce((acc, part) => acc + part.mod, 0), 0);
		} else {
			delete flags.attributes.speed[speed].derived;
		}
	}

	const initBonuses =
		actorData.obsidian.filters.bonuses(
			Filters.appliesTo.initiative(flags.attributes.init.ability));

	if (initBonuses.length && OBSIDIAN.notDefinedOrEmpty(flags.attributes.init.override)) {
		flags.attributes.init.rollParts.push(
			...initBonuses.flatMap(bonus => bonusToParts(actorData, bonus)));
		data.attributes.init.mod +=
			flags.attributes.init.rollParts.reduce((acc, part) => acc + part.mod, 0);
	}

	const acBonuses = actorData.obsidian.filters.bonuses(Filters.isAC);
	if (acBonuses.length && OBSIDIAN.notDefinedOrEmpty(flags.attributes.ac.override)) {
		data.attributes.ac.min +=
			acBonuses.reduce((acc, bonus) =>
				acc + bonusToParts(actorData, bonus).reduce((acc, part) => acc + part.mod, 0), 0);
	}

	const hpBonuses = actorData.obsidian.filters.bonuses(Filters.isHP);
	if (hpBonuses.length) {
		data.attributes.hp.maxAdjusted +=
			hpBonuses.reduce((acc, bonus) =>
				acc + bonusToParts(actorData, bonus).reduce((acc, part) => acc + part.mod, 0), 0);
	}

	[['spellAttacks', 'attacks'], ['spellDCs', 'saves']].forEach(([filter, key]) => {
		const bonuses = actorData.obsidian.filters.bonuses(Filters.appliesTo[filter]);
		if (bonuses.length) {
			const total =
				bonuses.flatMap(bonus => bonusToParts(actorData, bonus))
					.reduce((acc, part) => acc + part.mod, 0);

			flags.attributes.spellcasting[key] =
				flags.attributes.spellcasting[key].map(val => val + total);
		}
	});
}

function bonusName (actorData, bonus) {
	if (bonus.name.length) {
		return bonus.name;
	}

	const effect = actorData.obsidian.effects.get(bonus.parentEffect);
	if (effect.name.length) {
		return effect.name;
	}

	const item = actorData.obsidian.itemsByID.get(effect.parentItem);
	return item.name;
}

export function bonusToParts (actorData, bonus) {
	const parts = [];
	if (bonus.ndice !== 0) {
		parts.push({mod: 0, ndice: bonus.ndice, die: bonus.die});
	}

	if (bonus.bonus !== 0) {
		parts.push({mod: bonus.bonus, name: bonusName(actorData, bonus)});
	}

	if (!OBSIDIAN.notDefinedOrEmpty(bonus.prof)) {
		parts.push({
			mod: Math.floor(bonus.prof * actorData.data.attributes.prof),
			name: game.i18n.localize('OBSIDIAN.ProfAbbr'),
			proficiency: true,
			value: Number(bonus.prof)
		});
	}

	if (!OBSIDIAN.notDefinedOrEmpty(bonus.ability)) {
		parts.push({
			mod: actorData.data.abilities[bonus.ability].mod,
			name: game.i18n.localize(`OBSIDIAN.AbilityAbbr-${bonus.ability}`)
		});
	}

	if (!OBSIDIAN.notDefinedOrEmpty(bonus.level)) {
		let level;
		if (bonus.level === 'chr') {
			level = actorData.data.details.level.value;
		} else if (bonus.level === 'cls') {
			const cls = actorData.obsidian.classes.find(cls => cls._id === bonus.class);
			if (cls) {
				level = cls.flags.obsidian.level;
			}
		}

		if (level !== undefined) {
			parts.push({mod: level, name: bonusName(actorData, bonus)});
		}
	}

	return parts;
}

export function highestProficiency (parts) {
	const highest = parts.reduce((acc, part) =>
		part.proficiency && part.mod > acc.mod ? part : acc, {mod: -Infinity});

	const newParts = [];
	let hasProficiency = false;

	for (const part of parts) {
		if (!part.proficiency) {
			newParts.push(part);
			continue;
		}

		if (part.mod >= highest.mod && !hasProficiency) {
			newParts.push(part);
			hasProficiency = true;
		}
	}

	return newParts;
}