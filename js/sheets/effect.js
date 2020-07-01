import {ObsidianItemSheet} from './item-sheet.js';
import {Categories, Components, Effect} from '../module/effect.js';
import {OBSIDIAN} from '../global.js';
import {Schema} from '../module/schema.js';
import {ObsidianCurrencyDialog} from '../dialogs/currency.js';
import {Rules} from '../rules/rules.js';
import {ObsidianStandaloneDialog} from '../dialogs/standalone.js';

const TRAY_STATES = Object.freeze({START: 1, EFFECT: 2, COMPONENT: 3});
const FILTER_SELECTIONS = {
	score: {
		ability: ['ABILITIES', 'Ability'],
		speed: ['SPEEDS', 'Speed'],
		passive: ['SKILLS', 'Skill'],
		dc: ['EFFECT_ABILITIES', 'Ability']
	},
	roll: {
		attack: ['EFFECT_FILTER_ATTACKS', 'Attack'],
		save: ['EFFECT_FILTER_SAVES', 'Ability'],
		check: {
			ability: ['ABILITIES', 'Ability'],
			skill: ['SKILLS', 'Skill']
		},
		damage: {
			damage: ['EFFECT_DAMAGE_TYPES', 'Damage'],
			attack: ['EFFECT_FILTER_ATTACKS', 'Attack']
		}
	}
};

let categories = null;
function lazyInitialiseCategories () {
	if (categories != null) {
		return categories;
	}

	categories = new Map(Categories.map(cat => [cat, {
		label: game.i18n.localize(`OBSIDIAN.${cat.capitalise()}`),
		components: []
	}]));

	categories.set('none', {components: []});
	Object.entries(Components).forEach(([type, component]) => {
		let labels =
			Array.isArray(component.metadata.tray)
				? component.metadata.tray
				: [component.metadata.tray];

		labels = labels.map(i18n => game.i18n.localize(`OBSIDIAN.${i18n}`));

		const category = component.metadata.category || 'none';
		const components = categories.get(category).components;
		components.push({type: type, mode: 'add', label: labels[0]});

		if (labels.length > 1) {
			components.push({type: type, mode: 'rm', label: labels[1]});
		}
	});

	return categories;
}

export class ObsidianEffectSheet extends ObsidianItemSheet {
	constructor (...args) {
		super(...args);
		this._interacting = false;
		this._addedClickHandler = false;
		this._anywhereClickHandler = evt => this._onClickAnywhere(evt);
		game.settings.register('obsidian', 'effects-categories', {default: [], scope: 'client'});
	}

	static get defaultOptions () {
		const options = super.defaultOptions;
		options.classes.push('obsidian-effects-window');
		options.width = 560;
		options.height = 768;
		options.template = 'modules/obsidian/html/sheets/effect.html';
		options.scrollY = options.scrollY.concat('.obsidian-effects-tray');
		return options;
	}

	get _categories () {
		return lazyInitialiseCategories();
	}

	/**
	 * @param {JQuery} html
	 * @return undefined
	 */
	activateListeners (html) {
		super.activateListeners(html);
		Effect.metadata.components.forEach(type => {
			const component = Components[type];
			html.find(`.obsidian-add-${type}, .obsidian-rm-${type}`)
				.mousedown(this._preventSubmit.bind(this));

			const addon = component.metadata.addon;
			html.find(`.obsidian-rm-${type}`).click(this._onRemoveSelected.bind(this, addon));
			html.find(`.obsidian-add-${type}`).click(this._onAddComponent.bind(this, type, addon));
		});

		html.find('.obsidian-add-effect, .obsidian-rm-effect')
			.mousedown(this._preventSubmit.bind(this));

		html.find('.obsidian-add-effect').click(this._onAddEffect.bind(this));
		html.find('.obsidian-rm-effect').click(this._onRemoveSelected.bind(this));
		html.find('.obsidian-effect').click(evt =>
			this._onEffectSelected(evt.currentTarget.dataset.uuid));
		html.find('.obsidian-effect legend').click(evt => {
			evt.stopPropagation();
			this._onComponentSelected(evt.currentTarget.parentNode.dataset.uuid);
		});

		html.find('.fancy-checkbox').mousedown(this._preventSubmit.bind(this));
		html.find('.fancy-checkbox').click(() => {
			this._onCheckBoxClicked(this);
			this._interacting = false;
		});

		html.find('legend .obsidian-edit').click(this._editDescription.bind(this));
		html.find('.obsidian-add-remove').keypress(ObsidianCurrencyDialog.onAddRemove);
		html.find('.obsidian-spell-drop').on('dragover', evt => evt.preventDefault());
		html.find('.obsidian-spell-drop').each((i, el) => el.ondrop = this._onDropSpell.bind(this));
		html.find('.obsidian-rm-provide-spell').click(this._onRemoveSpell.bind(this));
		html.find('.obsidian-provide-spell-body').click(this._onEditSpell.bind(this));
		html.find('summary').click(this._saveCategoryStates.bind(this));

		this._onCheckBoxClicked();
		if (!this._addedClickHandler) {
			document.addEventListener('click', this._anywhereClickHandler);
			this._addedClickHandler = true;
		}

		if (this._selectedEffect != null) {
			this._onEffectSelected(this._selectedEffect);
		} else if (this._selectedComponent != null) {
			this._onComponentSelected(this._selectedComponent);
		} else {
			this._setTrayState(TRAY_STATES.START);
		}
	}

	async close () {
		if (this._addedClickHandler) {
			document.removeEventListener('click', this._anywhereClickHandler);
			this._addedClickHandler = false;
		}

		super.close();
	}

	getData () {
		const data = super.getData();
		data.equipTypes = Schema.EquipTypes;
		data.spellLists = Object.keys(OBSIDIAN.Data.SPELLS_BY_CLASS);
		data.categories = this._categories;
		data.uncategorised = data.categories.get('none').components;

		if (data.actor && data.item.flags?.obsidian?.effects) {
			const hasResource = item =>
				item.flags?.obsidian?.effects?.some(e =>
					e.components.some(c => c.type === 'resource'));

			data.itemsWithResources =
				data.actor.data.obsidian.itemsByType.not('class', 'spell', 'feat')
					.filter(hasResource);

			data.featsWithResources =
				data.actor.data.obsidian.itemsByType.get('feat').filter(hasResource);

			data.item.flags.obsidian.effects
				.flatMap(e => e.components)
				.filter(c => c.type === 'spells')
				.forEach(component =>
					component.spells = component.spells.map(id =>
						this.actor.data.obsidian.itemsByID.get(id)));
		}

		data.item.flags?.obsidian?.effects
			.flatMap(e => e.components)
			.filter(c => c.type === 'consume' || c.type === 'produce')
			.forEach(component => {
				let item = data.item;
				if (data.actor) {
					item =
						data.actor.data.obsidian.itemsByID.get(
							component.target === 'feat' ? component.featID : component.itemID);
				}

				if (item) {
					component.itemResourceComponents =
						item.flags.obsidian.effects
							.flatMap(e => e.components)
							.filter(c => c.type === 'resource');
				}

				if (!data.actor) {
					component.itemResourceComponents.forEach(c =>
						c.label = c.name.length ? c.name : game.i18n.localize('OBSIDIAN.Unnamed'));
				}
			});

		data.item.flags?.obsidian?.effects
			.flatMap(e => e.components)
			.filter(c => c.type === 'filter')
			.forEach(component => {
				component.isMulti = Effect.determineMulti(component);
				component.isCollection = component.isMulti && component.multi === 'some';
				component.availableSelections = this._generateFilterSelections(component);
			});

		data.usesAbilities = {};
		Rules.ABILITIES.forEach(abl =>
			data.usesAbilities[abl] = `OBSIDIAN.Ability-${abl}`);

		return data;
	}

	async maximize () {
		Application.prototype.maximize.apply(this, arguments);
	}

	/**
	 * @private
	 */
	_createEditor (target, editorOptions, initialContent) {
		editorOptions.content_css =
			`${CONFIG.TinyMCE.css.join(',')},modules/obsidian/css/obsidian-mce.css`;
		TextEditor.create(editorOptions, initialContent)
			.then(mce => mce[0].on('change', () => this.editors[target].changed = true));
	}

	_delaySubmit (evt) {
		if (this._interacting) {
			return;
		}

		this._submitTimeout = setTimeout(() => {
			if (!this.element.find('input:focus, select:focus').length) {
				this._onSubmit(evt);
			}
		}, 50);
	}

	_editDescription (evt) {
		const target = evt.currentTarget;
		const effects = duplicate(this.item.data.flags.obsidian.effects);
		const effect =
			effects.find(e => e.uuid === target.closest('.obsidian-effect').dataset.uuid);

		if (!effect) {
			return;
		}

		const component =
			effect.components.find(c => c.uuid === target.closest('fieldset').dataset.uuid);

		if (!component) {
			return;
		}

		const dialog = new ObsidianStandaloneDialog({}, {
			width: 560,
			height: 300,
			title: game.i18n.localize('OBSIDIAN.EditDescription'),
			template: 'modules/obsidian/html/dialogs/description.html'
		});

		dialog._createEditor = super._createEditor;

		dialog.editors = {};

		dialog.activateListeners = html => {
			html.find('.editor-content[data-edit]').each((i, div) =>
				FormApplication.prototype._activateEditor.apply(dialog, [div]));
		};

		dialog.close = async () => {
			const editors = Object.values(dialog.editors);
			if (editors.length) {
				const ed = editors[0];
				if (ed.mce) {
					component.raw = ed.mce.getContent();
					await this.item.update(
						OBSIDIAN.updateArrays(this.item.data, {'flags.obsidian.effects': effects}));
				}
			}

			this.render(false);
			Application.prototype.close.apply(dialog, arguments);
		};

		dialog.getData = () => {
			return {existingContent: component.raw};
		};

		dialog.render(true);
	}

	get _formData () {
		const expanded = OBSIDIAN.updateArrays(this.item.data, super._formData);
		if (!expanded['flags.obsidian.effects']) {
			return expanded;
		}

		for (const effect of expanded['flags.obsidian.effects']) {
			for (const component of effect.components) {
				if (component.type !== 'filter' || !component.collection) {
					continue;
				}

				const collection = [];
				for (const prop in component.collection) {
					if (component.collection.hasOwnProperty(prop)
						&& !Number.isNumeric(prop)
						&& component.collection[prop])
					{
						const lookup = `${component.check}s`;
						if (prop === 'custom') {
							collection.push(
								...Object.entries(component.collection[prop])
								.filter(([_, v]) => v)
								.map(([k, _]) => {
									return {
										key: `${prop}.${k}`,
										label: this.actor.data.flags.obsidian[lookup][prop][k].label
									};
								}));
						} else {
							collection.push({key: prop});
						}
					}
				}

				component.collection = collection;
			}
		}

		return expanded;
	}

	/**
	 * @private
	 */
	_generateFilterSelections (component) {
		const selections = {};
		let current = FILTER_SELECTIONS;
		let filter = component.filter;

		do {
			current = current[filter];
			filter = component[filter] || component.dmg;
		} while (!Array.isArray(current) && current !== undefined);

		const [rule, i18n] = current || [];
		if (rule && i18n) {
			Rules[rule].forEach(k => selections[k] = game.i18n.localize(`OBSIDIAN.${i18n}-${k}`));
		}

		if (this.actor
			&& getProperty(this.actor, 'data.flags.obsidian.skills.custom.length')
			&& ((component.filter === 'score' && component.score === 'passive')
				|| (component.filter === 'roll'
					&& component.roll === 'check'
					&& component.check === 'skill')))
		{
			this.actor.data.flags.obsidian.skills.custom.forEach((v, i) =>
				selections[`custom.${i}`] = v.label);
		}

		if (this.actor
			&& component.filter === 'roll'
			&& component.roll === 'check'
			&& component.check === 'tool')
		{
			const tools = Rules.PROF_TOOLS
				.concat(Rules.PROF_TOOLS_GAME)
				.concat(Rules.PROF_TOOLS_ARTISAN)
				.concat(Rules.PROF_TOOLS_INSTRUMENT)
				.map(key => [key, game.i18n.localize(`OBSIDIAN.ToolProf-${key}`)]);

			tools.sort((a, b) => a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
			tools.forEach(([key, label]) => selections[key] = label);

			if (this.actor.data.flags.obsidian.tools.custom.length) {
				this.actor.data.flags.obsidian.tools.custom.forEach((v, i) =>
					selections[`custom.${i}`] = v.label);
			}
		}

		return selections;
	}

	/**
	 * @private
	 */
	async _onAddEffect () {
		const formData = this._formData;
		let effects = formData['flags.obsidian.effects'];

		if (!effects) {
			effects = [];
			formData['flags.obsidian.effects'] = effects;
		}

		effects.push(Effect.create());
		this.item.update(formData);
		this._interacting = false;
	}

	/**
	 * @private
	 */
	async _onAddComponent (type, prop) {
		if (this._selectedEffect == null && this._selectedComponent == null) {
			return;
		}

		const formData = this._formData;
		const effects = formData['flags.obsidian.effects'];
		const effect = effects.find(effect => effect.uuid === this._selectedEffect);

		if (effect) {
			effect.components.push(Effect.createComponent(type));
		} else {
			const component =
				effects.flatMap(e => e.components).find(c => c.uuid === this._selectedComponent);

			if (component) {
				component[prop] = Effect.createComponent(type);
			} else {
				return;
			}
		}

		this.item.update(formData);
		this._interacting = false;
	}

	/**
	 * @private
	 */
	_onClickAnywhere (evt) {
		const closestEffect = evt.target.closest('.obsidian-effect');
		const closestPill = evt.target.closest('.obsidian-effects-pill');
		const closestSummary = evt.target.closest('.obsidian-effects-cat > summary');

		if (closestEffect == null && closestSummary == null
			&& (closestPill == null || closestPill.classList.contains('obsidian-rm-effect')))
		{
			this._selectedEffect = null;
			this._selectedComponent = null;
			this.element.find('.obsidian-effect, .obsidian-effect fieldset')
				.removeClass('obsidian-selected');
			this._setTrayState(TRAY_STATES.START);
		}
	}

	/**
	 * @private
	 */
	_onCheckBoxClicked () {
		if (this.item.type !== 'weapon') {
			return;
		}

		const range = this.element.find('.obsidian-range-part');
		const consume = this.element.find('[data-bound="flags.obsidian.consumeThrown"]');
		const magic = this.element.find('[data-bound="flags.obsidian.magical"]');

		range.addClass('obsidian-hidden');
		consume.addClass('obsidian-hidden');
		magic.attr('style', 'margin-left: 0;')
		const thrown = this.element.find('input[name="flags.obsidian.tags.thrown"]');

		if (thrown.length && thrown.prop('checked')) {
			range.removeClass('obsidian-hidden');
			consume.removeClass('obsidian-hidden');
			magic.attr('style', '');
		}

		if (this.item.data.flags.obsidian.type === 'ranged') {
			range.removeClass('obsidian-hidden');
			magic.attr('style', '');
		}
	}

	/**
	 * @private
	 */
	_onComponentSelected (uuid) {
		this._selectedEffect = null;
		this._selectedComponent = uuid;
		this.element.find('.obsidian-effect, .obsidian-effect fieldset')
			.removeClass('obsidian-selected');

		this.element.find(`[data-uuid="${uuid}"]`).addClass('obsidian-selected');
		this._setTrayState(TRAY_STATES.COMPONENT);
	}

	/**
	 * @private
	 */
	async _onDropSpell (evt) {
		evt.preventDefault();
		let data;

		try {
			data = JSON.parse(evt.dataTransfer.getData('text/plain'));
		} catch (ignored) {}

		if (!data || !data.pack) {
			return false;
		}

		const pack = game.packs.find(pack => pack.collection === data.pack);
		if (!pack) {
			return false;
		}

		const item = await pack.getEntity(data.id);
		if (!item || item.type !== 'spell') {
			return false;
		}

		const effects = duplicate(this.item.data.flags.obsidian.effects);
		const fieldset = evt.target.closest('fieldset');
		const effectDiv = fieldset.closest('.obsidian-effect');
		const effect = effects.find(e => e.uuid === effectDiv.dataset.uuid);

		if (!effect) {
			return false;
		}

		const component = effect.components.find(c => c.uuid === fieldset.dataset.uuid);
		if (!component) {
			return false;
		}

		if (!item.data.flags) {
			item.data.flags = {};
		}

		if (!item.data.flags.obsidian) {
			item.data.flags.obsidian = {};
		}

		item.data.flags.obsidian.isEmbedded = true;
		item.data.flags.obsidian.parentComponent = component.uuid;
		item.data.flags.obsidian.source = {
			type: 'item',
			item: this.item.data._id,
			display: this.item.data.name
		};

		if (this.actor) {
			const created = await this.actor.createEmbeddedEntity('OwnedItem', item.data);
			if (this.actor.isToken) {
				// For some reason, if this is a token, we get the entire token
				// back from createEmbeddedEntity instead of the actual entity
				// we tried to create. Instead we assume the last item in the
				// items array is what was just created. This might be a race
				// condition but also perhaps not because of how the event loop
				// works.
				component.spells.push(created.actorData.items.last()._id);
			} else {
				component.spells.push(created._id);
			}
		} else {
			component.spells.push(item.data);
		}

		this.item.update({'flags.obsidian.effects': effects});
	}

	/**
	 * @private
	 */
	_onEditSpell (evt) {
		if (this.actor) {
			const item =
				this.actor.items.find(item =>
					item.id === evt.currentTarget.closest('.obsidian-item-drop-pill').dataset.id);

			if (!item) {
				return;
			}

			item.sheet.render(true);
		} else {
			const pill = evt.currentTarget.closest('.obsidian-item-drop-pill');
			const fieldset = pill.closest('fieldset');
			const component =
				this.item.data.flags.obsidian.effects
					.flatMap(e => e.components)
					.find(c => c.uuid === fieldset.dataset.uuid);

			if (!component) {
				return;
			}

			const spell = component.spells.find(spell => spell._id === pill.dataset.id);
			if (!spell) {
				return;
			}

			const item = new CONFIG.Item.entityClass(spell, {
				parentComponent: component.uuid,
				parentItem: this.item
			});

			item.sheet.render(true);
		}
	}

	/**
	 * @private
	 */
	_onEffectSelected (uuid) {
		this._selectedEffect = uuid;
		this._selectedComponent = null;
		this.element.find('.obsidian-effect, .obsidian-effect fieldset')
			.removeClass('obsidian-selected');

		this.element.find(`[data-uuid="${uuid}"]`).addClass('obsidian-selected');
		this._setTrayState(TRAY_STATES.EFFECT);
	}

	/**
	 * @private
	 */
	async _onRemoveSelected (prop) {
		if (this._selectedEffect == null && this._selectedComponent == null) {
			return;
		}

		const formData = this._formData;
		const effects = formData['flags.obsidian.effects'];

		if (!effects) {
			return;
		}

		const orphanedSpells = [];
		if (this._selectedEffect != null) {
			const idx = effects.findIndex(effect => effect.uuid === this._selectedEffect);
			if (idx < 0) {
				return;
			}

			const effect = effects[idx];
			effects.splice(idx, 1);
			orphanedSpells.push(
				...effect.components.filter(c => c.type === 'spells').flatMap(c => c.spells));
		} else if (this._selectedComponent != null) {
			const effectUUID =
				this.element.find(`[data-uuid="${this._selectedComponent}"]`).parent().data('uuid');

			const effect = effects.find(effect => effect.uuid === effectUUID);
			if (!effect) {
				return;
			}

			const idx = effect.components.findIndex(component =>
				component.uuid === this._selectedComponent);

			if (idx < 0) {
				return;
			}

			if (typeof prop === 'string') {
				delete effect.components[idx][prop];
			} else {
				const component = effect.components[idx];
				effect.components.splice(idx, 1);

				if (component.type === 'spells') {
					orphanedSpells.push(...component.spells);
				}
			}
		}

		if (orphanedSpells.length && this.actor) {
			await this.actor.deleteEmbeddedEntity('OwnedItem', orphanedSpells);
		}

		this.item.update(formData);
		this._interacting = false;
	}

	/**
	 * @private
	 */
	async _onRemoveSpell (evt) {
		const effects = duplicate(this.item.data.flags.obsidian.effects);
		const pill = evt.currentTarget.closest('.obsidian-item-drop-pill');
		const fieldset = pill.closest('fieldset');
		const effectDiv = fieldset.closest('.obsidian-effect');
		const effect = effects.find(e => e.uuid === effectDiv.dataset.uuid);
		const component = effect.components.find(c => c.uuid === fieldset.dataset.uuid);

		if (this.actor) {
			component.spells = component.spells.filter(spell => spell !== pill.dataset.id);
		} else {
			component.spells = component.spells.filter(spell => spell._id !== pill.dataset.id);
		}

		await this.item.update({'flags.obsidian.effects': effects});

		if (this.actor) {
			this.actor.deleteEmbeddedEntity('OwnedItem', pill.dataset.id);
		}
	}

	_preventSubmit () {
		clearTimeout(this._submitTimeout);
		this._interacting = true;
	}

	/**
	 * @private
	 */
	async _render (force = false, options = {}) {
		await super._render(force, options);
		this._restoreCategoryStates();
	}

	/**
	 * @private
	 */
	_saveCategoryStates (evt) {
		const key = evt.currentTarget.closest('details').dataset.key;
		const state = game.settings.get('obsidian', 'effects-categories');
		const idx = state.indexOf(key);

		if (idx < 0) {
			state.push(key);
		} else {
			state.splice(idx, 1);
		}

		game.settings.set('obsidian', 'effects-categories', state);
	}

	/**
	 * @private
	 */
	_restoreCategoryStates () {
		this.element.find('details').prop('open', false);
		const state = game.settings.get('obsidian', 'effects-categories');
		state.forEach(key => this.element.find(`details[data-key="${key}"]`).prop('open', true));
	}

	/**
	 * @private
	 */
	_setTrayState (newState) {
		this.element.find('details').prop('open', true);
		this.element.find('summary').addClass('obsidian-hidden');
		this.element.find('.obsidian-effects-pill').addClass('obsidian-hidden');
		this.element.find('.obsidian-add-effect').removeClass('obsidian-hidden');

		if (newState === TRAY_STATES.EFFECT) {
			this.element.find('summary').removeClass('obsidian-hidden');
			this.element.find('details .obsidian-effects-pill:not(.obsidian-effects-pill-rm)')
				.removeClass('obsidian-hidden');
			this.element.find('.obsidian-rm-effect').removeClass('obsidian-hidden');
			this._restoreCategoryStates();
		} else if (newState === TRAY_STATES.COMPONENT) {
			this.element.find('.obsidian-rm-effect').removeClass('obsidian-hidden');
			const component =
				this.item.data.flags.obsidian.effects
					.flatMap(e => e.components)
					.find(c => c.uuid === this._selectedComponent);

			if (!component) {
				return;
			}

			const addons = Components[component.type].metadata.addons;
			if (!addons) {
				return;
			}

			addons.forEach(sub => {
				const addon = Components[sub].metadata.addon;
				if (component[addon] === undefined) {
					this.element.find(`.obsidian-add-${sub}`).removeClass('obsidian-hidden');
					this.element.find(`.obsidian-rm-${sub}`).addClass('obsidian-hidden');
				} else {
					this.element.find(`.obsidian-add-${sub}`).addClass('obsidian-hidden');
					this.element.find(`.obsidian-rm-${sub}`).removeClass('obsidian-hidden');
				}
			});
		}
	}

	/**
	 * @private
	 */
	async _updateObject (event, formData) {
		formData = this._formData;
		if (getProperty(this.item, 'data.flags.obsidian.isEmbedded')
			&& this.item.options.parentItem
			&& this.item.options.parentComponent
			&& !this.actor)
		{
			const newData = mergeObject(this.item.data, expandObject(formData), {inplace: false});
			const effects = duplicate(this.item.options.parentItem.data.flags.obsidian.effects);
			const component =
				effects
					.flatMap(e => e.components)
					.find(c => c.uuid === this.item.options.parentComponent);

			const idx = component.spells.findIndex(spell => spell._id === this.item.data._id);
			component.spells[idx] = newData;

			await this.item.options.parentItem.update({'flags.obsidian.effects': effects});
			this.item.data = newData;
			this.render(false);
		} else {
			super._updateObject(event, formData);
		}
	}
}
