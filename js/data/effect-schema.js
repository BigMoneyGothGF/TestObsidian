export const Categories = ['rolls', 'resources', 'modifiers', 'special'];

export const Components = {
	applied: {
		data: {
			type: 'applied',
			ref: '',
			on: 'target'
		},
		metadata: {
			category: 'special',
			tray: 'AppliedEffect'
		}
	},
	attack: {
		data: {
			type: 'attack',
			attack: 'melee',
			category: 'weapon',
			ability: '',
			bonus: 0,
			crit: 20,
			proficient: false,
			reach: null,
			range1: null,
			range2: null,
			target: ''
		},
		metadata: {
			category: 'rolls',
			tray: 'AddAttack',
			addons: ['roll-mod', 'bonus']
		}
	},
	bonus: {
		data: {
			type: 'bonus',
			name: '',
			bonus: 0,
			prof: 0,
			ability: '',
			level: '',
			class: '',
			text: '',
			ndice: 0,
			die: 4,
			constant: 0,
			operator: 'plus',
			value: '',
			formula: false,
			dmg: {enabled: false, type: 'wpn'},
			method: 'dice'
		},
		metadata: {
			category: 'modifiers',
			addon: 'extraBonus',
			tray: ['AddBonus', 'RemoveBonus']
		}
	},
	check: {
		data: {
			type: 'check',
			calc: 'fixed',
			fixed: 0,
			bonus: 8,
			prof: 1,
			ability: '',
			target: 'str',
			skill: '',
			custom: ''
		},
		metadata: {
			category: 'rolls',
			tray: 'AbilityCheck'
		}
	},
	condition: {
		data: {
			type: 'condition',
			condition: 'blinded',
			temp: false
		},
		metadata: {
			category: 'special',
			tray: 'ConditionTitle'
		}
	},
	consume: {
		data: {
			type: 'consume',
			target: 'this-effect',
			itemID: '',
			featID: '',
			ref: '',
			fixed: 1,
			slots: 'any',
			class: '',
			slot: 1
		},
		metadata: {
			category: 'resources',
			tray: 'ConsumesResource'
		}
	},
	damage: {
		data: {
			type: 'damage',
			calc: 'formula',
			ndice: 1,
			die: 4,
			ability: '',
			bonus: 0,
			damage: '',
			versatile: false,
			ncrit: ''
		},
		metadata: {
			category: 'rolls',
			tray: 'DamageHeal',
			addons: ['roll-mod', 'bonus', 'extra-crit']
		}
	},
	defense: {
		data: {
			type: 'defense',
			disease: false,
			sleep: false,
			defense: '',
			damage: {level: 'res', dmg: 'acid', magic: '', material: ''},
			condition: {level: 'imm', condition: 'charmed'},
			dr: null
		},
		metadata: {
			category: 'modifiers',
			tray: 'AddDefense'
		}
	},
	description: {
		data: {
			type: 'description',
			raw: ''
		},
		metadata: {
			category: 'special',
			tray: 'AddDescription'
		}
	},
	duration: {
		data: {
			type: 'duration',
			duration: 1,
			ndice: null,
			die: 4,
			concentration: false
		},
		metadata: {
			category: 'special',
			tray: 'CombatDuration'
		}
	},
	expression: {
		data: {
			type: 'expression',
			expr: '',
			flavour: ''
		},
		metadata: {
			category: 'rolls',
			tray: 'DiceExpression'
		}
	},
	'extra-crit': {
		data: {
			type: 'extra-crit',
			ndice: 1,
			die: 4,
			bonus: 0
		},
		metadata: {
			addon: 'extraCrit',
			tray: ['CritDamage', 'CritDamage']
		}
	},
	filter: {
		data: {
			type: 'filter',
			filter: 'roll',
			score: 'ability',
			roll: 'attack',
			check: 'ability',
			dmg: 'damage',
			multi: 'any',
			some: '',
			collection: [],
			mode: ''
		},
		metadata: {
			category: 'modifiers',
			tray: 'AddFilter',
			addons: ['uses-ability']
		}
	},
	multiplier: {
		data: {
			type: 'multiplier',
			multiplier: 1
		},
		metadata: {
			category: 'modifiers',
			tray: 'MultiplyScore'
		}
	},
	produce: {
		data: {
			type: 'produce',
			target: 'this-effect',
			itemID: '',
			featID: '',
			ref: '',
			calc: 'fixed',
			fixed: 1,
			unlimited: false,
			slot: 1
		},
		metadata: {
			category: 'resources',
			tray: 'ProducesResource'
		}
	},
	resource: {
		data: {
			type: 'resource',
			name: '',
			recharge: {time: 'long', calc: 'all', ndice: 0, die: 2, bonus: 0, roll: null},
			bonus: 0,
			operator: 'plus',
			key: 'abl',
			min: 0,
			calc: 'fixed',
			fixed: 0,
			pool: false,
			die: 4
		},
		metadata: {
			category: 'resources',
			tray: 'AddResource'
		}
	},
	'roll-mod': {
		data: {
			type: 'roll-mod',
			min: 1,
			reroll: 1,
			mode: 'reg',
			ndice: 0,
			max: false,
			mcrit: 20
		},
		metadata: {
			category: 'modifiers',
			addon: 'rollMod',
			tray: ['RollModifier', 'RollModifier']
		}
	},
	'roll-table': {
		data: {
			type: 'roll-table',
			tables: [],
			nrolls: 1,
			reset: true
		},
		metadata: {
			category: 'rolls',
			tray: 'RollOnTable'
		}
	},
	save: {
		data: {
			type: 'save',
			calc: 'fixed',
			fixed: 0,
			bonus: 8,
			prof: 1,
			ability: '',
			target: 'con',
			effect: '',
			save: ''
		},
		metadata: {
			category: 'rolls',
			tray: 'AddSave'
		}
	},
	scaling: {
		data: {
			type: 'scaling',
			method: 'spell',
			class: '',
			text: '',
			threshold: null,
			ref: ''
		},
		metadata: {
			category: 'special',
			tray: 'AddScaling'
		}
	},
	setter: {
		data: {
			type: 'setter',
			score: 0,
			min: false
		},
		metadata: {
			category: 'modifiers',
			tray: 'SetScore'
		}
	},
	spells: {
		data: {
			type: 'spells',
			source: 'list',
			list: 'clr',
			spells: [],
			method: 'innate',
			class: '',
			ability: 'cha',
			upcast: false,
			level: 0,
			noSlot: false
		},
		metadata: {
			category: 'special',
			tray: 'ProvidesSpells'
		}
	},
	summon: {
		data: {
			type: 'summon',
			actors: [],
			prof: false,
			ac: {enabled: false},
			hp: {enabled: false},
			tmp: {enabled: false},
			dmg: {enabled: false},
			attack: '',
			save: ''
		},
		metadata: {
			category: 'special',
			tray: 'AddSummons'
		}
	},
	target: {
		data: {
			type: 'target',
			target: 'individual',
			count: 1,
			area: 'cone',
			distance: 0
		},
		metadata: {
			category: 'special',
			tray: 'AddTargets'
		}
	},
	'uses-ability': {
		data: {
			type: 'uses-ability',
			abilities: {}
		},
		metadata: {
			addon: 'usesAbility',
			tray: ['UsesAbility', 'UsesAbility']
		}
	}
};
