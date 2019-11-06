Obsidian.Rolls = {
	abilityCheck: function (actor, ability, skill, adv = [], extraMods = []) {
		const mods = [
			{mod: actor.data.data.abilities[ability].mod, name: game.i18n.localize('OBSIDIAN.Mod')},
			...extraMods
		];

		return Obsidian.Rolls.d20Roll(actor, {
			type: 'abl',
			title: game.i18n.localize(`OBSIDIAN.Ability-${ability}`),
			parens: skill,
			subtitle: game.i18n.localize('OBSIDIAN.AbilityCheck'),
			adv: adv,
			mods: mods
		});
	},

	annotateAdvantage: function (adv, results) {
		if (adv === 0 || results.length < 2) {
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
			results.filter(r => r !== max).forEach(r => r.grey = true);
		} else {
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

	attackRoll: function (actor, item) {

	},

	d20Roll: function (actor, {type, title, parens, subtitle, adv = [], mods = []}) {
		const roll = new Die(20).roll(2);
		const total = mods.reduce((acc, mod) => acc + mod.mod, 0);
		const results = roll.results.map(r => {
			return {
				roll: r,
				total: r + total,
				breakdown:
					r + mods.filter(mod => mod.mod)
						.map(mod => `${mod.mod.sgnex()} [${mod.name}]`)
						.join('')
			}
		});

		Obsidian.Rolls.annotateCrits(20, 1, results);
		Obsidian.Rolls.annotateAdvantage(
			Obsidian.Rules.determineAdvantage(actor.data.flags.obsidian.sheet.roll, ...adv),
			results);

		return {
			flags: {
				obsidian: {
					type: type,
					title: title,
					parens: parens,
					subtitle: subtitle,
					results: results
				}
			}
		}
	},

	death: function (actor) {
		const data = actor.data.data;
		const flags = actor.data.flags.obsidian;
		const advantageComponents = [flags.saves.roll, flags.attributes.death.roll];
		const mods = [{
			mod: (flags.saves.bonus || 0) + (flags.attributes.death.bonus || 0),
			name: game.i18n.localize('OBSIDIAN.Bonus')
		}];

		const roll = Obsidian.Rolls.d20Roll(actor, {
			type: 'save',
			title: game.i18n.localize('OBSIDIAN.DeathSave'),
			subtitle: game.i18n.localize('OBSIDIAN.SavingThrow'),
			adv: advantageComponents,
			mods: mods
		});

		const adv =
			Obsidian.Rules.determineAdvantage(
				flags.sheet.roll, flags.saves.roll, flags.attributes.death.roll);

		// If no advantage or disadvantage, take the first roll, otherwise find
		// the highest or lowest roll, respectively.
		const result =
			adv === 0
				? roll.flags.obsidian.results[0]
				: adv > 0
					? roll.flags.obsidian.results.reduce((acc, r) => r.total > acc.total ? r : acc)
					: roll.flags.obsidian.results.reduce((acc, r) => r.total < acc.total ? r : acc);

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

	feature: function (actor, feat) {

	},

	fromClick: function (actor, evt) {
		if (!evt.currentTarget.dataset) {
			return;
		}

		const dataset = evt.currentTarget.dataset;
		if (!dataset.roll) {
			return;
		}

		const roll = dataset.roll;
		if (roll === 'atk') {
			if (dataset.atk === undefined) {
				return;
			}

			const id = Number(dataset.atk);
			const atk = actor.data.items.find(item => item.id === id);

			if (!atk) {
				return;
			}

			Obsidian.Rolls.toChat(actor, Obsidian.Rolls.attackRoll(actor, atk));
		} else if (roll === 'save') {
			if (!dataset.save) {
				return;
			}

			if (dataset.save === 'death') {
				Obsidian.Rolls.toChat(actor, Obsidian.Rolls.death(actor));
			} else {
				Obsidian.Rolls.toChat(actor, Obsidian.Rolls.savingThrow(actor, dataset.save));
			}
		} else if (roll === 'abl') {
			if (!dataset.abl) {
				return;
			}

			if (dataset.abl === 'init') {
				Obsidian.Rolls.toChat(actor, Obsidian.Rolls.initiative(actor));
			} else {
				Obsidian.Rolls.toChat(actor, Obsidian.Rolls.abilityCheck(actor, dataset.abl));
			}
		} else if (roll === 'skl') {
			if (!dataset.skl) {
				return;
			}

			const skill = getProperty(actor.data.flags.obsidian.skills, dataset.skl);
			if (!skill) {
				return;
			}

			Obsidian.Rolls.toChat(actor, Obsidian.Rolls.skillCheck(actor, skill, dataset.skl));
		} else if (roll === 'tool') {
			if (dataset.tool === undefined) {
				return;
			}

			const tool = actor.data.flags.obsidian.skills.tools[Number(dataset.tool)];
			if (!tool) {
				return;
			}

			Obsidian.Rolls.toChat(actor, Obsidian.Rolls.skillCheck(actor, tool));
		} else if (roll === 'feat') {
			if (dataset.feat === undefined) {
				return;
			}

			const id = Number(dataset.feat);
			const feat = actor.data.items.find(item => item.id === id);

			if (!feat) {
				return;
			}

			Obsidian.Rolls.toChat(actor, Obsidian.Rolls.feature(actor, feat));
		} else if (roll === 'spl') {
			if (dataset.spl === undefined) {
				return;
			}

			const id = Number(dataset.spl);
			const spell = actor.data.items.find(item => item.id === id);

			if (!spell) {
				return;
			}

			Obsidian.Rolls.toChat(actor, Obsidian.Rolls.spell(actor, spell));
		}
	},

	hd: function (actor, rolls, conBonus) {
		const results = rolls.map(([n, d]) => new Die(d).roll(n));
		Obsidian.Rolls.toChat(actor, {
			flags: {
				obsidian: {
					type: 'hd',
					title: game.i18n.localize('OBSIDIAN.HD'),
					results: [{
						total: results.reduce((acc, die) => acc + die.total, 0) + conBonus,
						breakdown:
							`${rolls.map(([n, d]) => `${n}d${d}`).join('+')}${conBonus.sgn()} = `
							+ results.map(die => `(${die.results.join('+')})`).join(' + ')
							+ conBonus.sgnex()
					}]
				}
			}
		});

		return results;
	},

	initiative: function (actor) {
		const data = actor.data.data;
		const flags = actor.data.flags.obsidian;

		if (Obsidian.notDefinedOrEmpty(flags.attributes.init.override)) {
			return Obsidian.Rolls.abilityCheck(
				actor,
				flags.attributes.init.ability,
				game.i18n.localize('OBSIDIAN.Initiative'),
				[flags.attributes.init.roll],
				[{mod: data.attributes.init.value, name: game.i18n.localize('OBSIDIAN.Bonus')}]);
		} else {
			return Obsidian.Rolls.overriddenRoll(
				actor,
				'abl',
				game.i18n.localize('OBSIDIAN.Initiative'),
				game.i18n.localize('OBSIDIAN.AbilityCheck'),
				[flags.attributes.init.roll],
				data.attributes.init.mod);
		}
	},

	overriddenRoll: function (actor, type, title, subtitle, adv = [], override) {
		return Obsidian.Rolls.d20Roll(actor, {
			type: type,
			title: title,
			subtitle: subtitle,
			adv: adv,
			mods: [{mod: Number(override), name: game.i18n.localize('OBSIDIAN.Override')}]
		});
	},

	savingThrow: function (actor, save) {
		const data = actor.data.data;
		const flags = actor.data.flags.obsidian;
		const saveData = flags.saves[save];
		const adv = [flags.saves.roll];

		if (saveData) {
			adv.push(saveData.roll);
		}

		if (!saveData || Obsidian.notDefinedOrEmpty(saveData.override)) {
			const saveBonus = saveData ? (saveData.bonus || 0) : 0;
			const mods = [
				{
					mod: data.abilities[save].mod,
					name: game.i18n.localize('OBSIDIAN.Mod')
				}, {
					mod: (flags.saves.bonus || 0) + saveBonus,
					name: game.i18n.localize('OBSIDIAN.Bonus')
				}, {
					mod: data.attributes.prof.value * data.abilities[save].proficient,
					name: game.i18n.localize('OBSIDIAN.ProfAbbr')
				}
			];

			return Obsidian.Rolls.d20Roll(actor, {
				type: 'save',
				title: game.i18n.localize(`OBSIDIAN.Ability-${save}`),
				subtitle: game.i18n.localize('OBSIDIAN.SavingThrow'),
				adv: adv,
				mods: mods
			});
		} else {
			return Obsidian.Rolls.overriddenRoll(
				actor,
				'save',
				game.i18n.localize(`OBSIDIAN.Ability-${save}`),
				game.i18n.localize('OBSIDIAN.SavingThrow'),
				adv,
				saveData.override);
		}
	},

	skillCheck: function (actor, skill, id) {
		const data = actor.data.data;
		const flags = actor.data.flags.obsidian;
		const skillName = skill.custom ? skill.label : game.i18n.localize(`OBSIDIAN.Skill-${id}`);

		if (Obsidian.notDefinedOrEmpty(skill.override)) {
			let prof = skill.custom ? skill.value : data.skills[id].value;
			const mods = [{
				mod: (flags.skills.bonus || 0) + (skill.bonus || 0),
				name: game.i18n.localize('OBSIDIAN.Bonus')
			}];

			if (prof === 0 && flags.skills.joat) {
				prof = .5;
			}

			if (prof > 0) {
				mods.push({
					mod: data.attributes.prof.value * prof,
					name: game.i18n.localize('OBSIDIAN.ProfAbbr')
				});
			}

			return Obsidian.Rolls.abilityCheck(
				actor,
				skill.ability,
				skillName,
				[flags.skills.roll, skill.roll],
				mods);
		} else {
			return Obsidian.Rolls.overriddenRoll(
				actor,
				'abl',
				skillName,
				game.i18n.localize('OBSIDIAN.AbilityCheck'),
				[flags.skills.roll, skill.roll],
				skill.override);
		}
	},

	spell: function (actor, spell) {

	},

	toChat: async function (actor, ...msgs) {
		const chatData = {
			speaker: ChatMessage.getSpeaker({actor: actor}),
			user: game.user._id,
			rollMode: game.settings.get('core', 'rollMode'),
			sound: CONFIG.sounds.dice
		};

		if (['gmroll', 'blindroll'].includes(chatData.rollMode)) {
			chatData.whisper = game.users.entities.filter(user => user.isGM).map(user => user._id);
			if (chatData.rollMode === 'blindroll') {
				chatData.blind = true;
				AudioHelper.play({src: chatData.sound});
			}
		}

		for (const msg of msgs) {
			await ChatMessage.create(mergeObject(chatData, msg));
		}
	}
};

ChatMessage.prototype.render = (function () {
	const cached = ChatMessage.prototype.render;
	return async function () {
		if (!this.data.flags || !this.data.flags.obsidian) {
			return cached.apply(this, arguments);
		}

		const messageData = {
			user: game.user,
			author: this.user,
			alias: this.alias,
			message: duplicate(this.data),
			isWhisper: this.data.whisper.length,
			whisperTo:
				this.data.whisper
					.map(user => game.users.get(user))
					.filter(_ => _)
					.map(user => user.name).join(', '),
			visible:
				!this.data.whisper.length
				|| game.user.isGM
				|| (this.data.rollMode !== 'blindroll'
					&& this.data.whisper.contains(game.user.data._id))
		};

		let html = await renderTemplate('public/modules/obsidian/html/message.html', messageData);
		html = $(html);

		html.find('.obsidian-msg-roll-box').hover(evt => {
			const rect = evt.currentTarget.getBoundingClientRect();
			let topLevel = evt.currentTarget._tt;

			if (!topLevel) {
				topLevel = $(evt.currentTarget).next().clone().appendTo($('body'));
				evt.currentTarget._tt = topLevel;
			}

			topLevel.css({
				display: 'block',
				left: `${rect.left}px`,
				top: `${rect.top - topLevel.height() - 12}px`
			});
		}, evt => {
			if (evt.currentTarget._tt) {
				evt.currentTarget._tt.css('display', 'none');
			}
		});

		return html;
	};
})();
