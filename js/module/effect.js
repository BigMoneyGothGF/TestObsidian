import {OBSIDIAN} from '../rules/rules.js';

export const Effect = {
	create: function () {
		return {
			name: game.i18n.localize('OBSIDIAN.NewEffect'),
			uuid: OBSIDIAN.uuid(),
			components: []
		};
	},

	newResource: function () {
		return {
			name: '',
			type: 'resource',
			uuid: OBSIDIAN.uuid(),
			recharge: 'long',
			bonus: 0,
			operator: 'plus',
			key: 'abl',
			min: 0,
			calc: 'fixed',
			fixed: 0
		};
	},

	newAttack: function () {
		return {
			type: 'attack',
			uuid: OBSIDIAN.uuid(),
			attack: 'melee',
			category: 'weapon',
			ability: 'str',
			bonus: 0,
			crit: 20,
			proficient: false
		};
	},

	newDamage: function () {
		return {
			type: 'damage',
			uuid: OBSIDIAN.uuid(),
			calc: 'formula',
			ndice: 1,
			die: 4,
			ability: '',
			bonus: 0,
			damage: '',
			versatile: false
		};
	},

	newSave: function () {
		return {
			type: 'save',
			uuid: OBSIDIAN.uuid(),
			calc: 'fixed',
			fixed: 0,
			bonus: 0,
			prof: 1,
			ability: '',
			target: 'con',
			effect: ''
		};
	}
};