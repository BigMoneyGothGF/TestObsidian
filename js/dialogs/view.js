import {ObsidianDialog} from './dialog.js';
import {OBSIDIAN} from '../rules/rules.js';

export class ObsidianViewDialog extends ObsidianDialog {
	constructor (itemID, parent, options = {}) {
		const item = parent.actor.data.items.find(item => item.id === itemID);
		if (item.type === 'backpack') {
			options.width = 578;
			options.register = true;
		}

		super(parent, options);
		this.item = item;
		this._hook = Hooks.on('updateOwnedItem', (item, actorID, data) => {
			if (actorID === this.parent.actor.id && data.id === this.item.id) {
				const remaining = this.element.find('.obsidian-titlebar-uses input');
				if (remaining.length > 0) {
					remaining.val(data.flags.obsidian.uses.remaining);
				}

				this.render(false);
			}
		});

		const allPins = game.settings.get('obsidian', 'pins');
		const actorPins = allPins[this.parent.actor.id];

		if (actorPins) {
			const state = actorPins.find(state => state.itemID === itemID);
			if (state) {
				this._pinned = state.pinned;
			} else {
				actorPins.push({itemID: itemID, pinned: false});
				game.settings.set('obsidian', 'pins', allPins);
			}
		} else {
			allPins[this.parent.actor.id] = [{itemID: itemID, pinned: false}];
			game.settings.set('obsidian', 'pins', allPins);
		}
	}

	static get defaultOptions () {
		const options = super.defaultOptions;
		options.width = 520;
		options.modal = false;
		return options;
	}

	get template () {
		return `modules/obsidian/html/dialogs/${this.item.type}-view.html`;
	}

	get title () {
		return this.item.name;
	}

	/**
	 * @param {JQuery} html
	 * @returns undefined
	 */
	activateListeners (html) {
		super.activateListeners(html);

		html.on('dragend', () => {
			if (this.element) {
				this.element.find('.obsidian-drag-indicator').css('display', 'none');
			}
		});

		html.find('.obsidian-tr').each((i, row) => {
			row.setAttribute('draggable', 'true');
			row.addEventListener('dragstart', OBSIDIAN.Reorder.dragStart, false);
		});

		this.form.ondragover = OBSIDIAN.Reorder.dragOver;
		this.form.ondrop = () => OBSIDIAN.Reorder.drop(this.parent.actor, event);

		html.find('.obsidian-feature-use').click(async evt => {
			await this.parent._onUseClicked.bind(this.parent)(evt);
			this.render(false);
		});

		html.find('[data-sheet]').click(() => {
			const Item = CONFIG.Item.entityClass;
			const item = new Item(this.item, {actor: this.parent.actor});
			item.sheet.render(true);
		});

		if (this.item.type === 'backpack') {
			ObsidianDialog.recalculateHeight(html);
		}
	}

	async close () {
		if (this._hook != null) {
			Hooks.off('updateOwnedItem', this._hook);
		}

		return super.close();
	}

	getData () {
		const data = super.getData();
		data.item = this.item;
		return data;
	}

	async minimize () {
		await super.minimize();
		this.element
			.css('width', 250)
			.find('.obsidian-pin, .obsidian-roll, .obsidian-titlebar-uses')
			.show();

	}

	/**
	 * @private
	 */
	async _renderOuter (options) {
		const html = await super._renderOuter(options);
		const pin = $('<a class="obsidian-pin"><i class="fas fa-thumbtack"></i></a>');
		const close = html.find('a.close');
		close.html('<i class="fas fa-times"></i>');
		pin.insertBefore(close);

		if (this._pinned) {
			pin.css('color', 'red');
		}

		pin.click(() => {
			this._pinned = !this._pinned;
			const pins = game.settings.get('obsidian', 'pins');
			const state =
				pins[this.parent.actor.id].find(state => state.itemID === this.item.id);

			if (state) {
				state.pinned = this._pinned;
				state.x = this.position.left;
				state.y = this.position.top;
				game.settings.set('obsidian', 'pins', pins);
			}

			if (this._pinned) {
				pin.css('color', 'red');
			} else {
				pin.css('color', pin.next().css('color'));
			}
		});

		let rollType = null;
		switch (this.item.type) {
			case 'weapon': rollType = 'atk'; break;
			case 'feat': rollType = 'feat'; break;
			case 'spell': rollType = 'spl'; break;
		}

		if (rollType) {
			const roll =
				$('<a class="obsidian-roll"><i class="fas fa-dice-d20"></i></a>')
					.insertBefore(pin);

			if (this.item.type === 'spell') {
				roll.click(this.parent._onCastSpell.bind(this.parent));
			} else {
				roll.click(evt => OBSIDIAN.Rolls.fromClick(this.parent.actor, evt));
			}

			roll[0].dataset.roll = rollType;
			roll[0].dataset[rollType] = this.item.id;

			if (this.item.type === 'feat' && this.item.flags.obsidian.uses.enabled) {
				this._renderUses().insertBefore(roll);
			}
		}

		return html;
	}

	/**
	 * @private
	 * @return {JQuery}
	 */
	_renderUses () {
		const uses = $('<div class="obsidian-titlebar-uses"></div>');
		const remaining =
			$('<input type="text" data-dtype="Number">')
				.val(this.item.flags.obsidian.uses.remaining);

		uses.append(remaining)
			.append($('<span>&sol;</span>'))
			.append($(`<strong>${this.item.flags.obsidian.uses.max}</strong>`));

		remaining.focusout(async () => {
			const n = Number(remaining.val());
			await this.parent.actor.updateOwnedItem({
				id: this.item.id,
				flags: {obsidian: {uses: {remaining: n}}}
			});
			this.render(false);
		});

		remaining.keyup(evt => {
			if (evt.key === 'Enter') {
				remaining.blur();
			}
		});

		return uses;
	}
}

export function restoreViewPins () {
	game.settings.register('obsidian', 'pins', {
		name: 'pins',
		default: {},
		scope: 'client'
	});

	const pins = game.settings.get('obsidian', 'pins');
	Object.entries(pins).forEach(([actorID, pinned]) => {
		if (!pinned.length) {
			return;
		}

		const actor = game.actors.get(actorID);
		if (!actor) {
			return;
		}

		const sheet = actor.sheet;
		if (!sheet) {
			return;
		}

		pinned.filter(state => state.pinned).forEach(async (state) => {
			const dialog = new ObsidianViewDialog(state.itemID, sheet);
			await dialog._render(true);
			dialog.minimize();
			dialog.setPosition({top: state.y, left: state.x});
		});
	});
}

export function patchDraggable_onDragMouseUp () {
	Draggable.prototype._onDragMouseUp = (function () {
		const cached = Draggable.prototype._onDragMouseUp;
		return function () {
			cached.apply(this, arguments);
			if (!this.app || this.app.constructor.name !== 'ObsidianViewDialog') {
				return;
			}

			const pins = game.settings.get('obsidian', 'pins');
			const pinned = pins[this.app.parent.actor.id];

			if (pinned) {
				const state = pinned.find(state => state.itemID === this.app.item.id);
				if (state) {
					state.x = this.app.position.left;
					state.y = this.app.position.top;
					game.settings.set('obsidian', 'pins', pins);
				}
			}
		};
	})();
}
