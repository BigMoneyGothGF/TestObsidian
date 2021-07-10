export default class ObsidianEffect extends ActiveEffect {
	get components () {
		return this.data.flags?.obsidian?.components || [];
	}

	static async createDocuments (data = [], context = {}) {
		if (context.temporary || !context.parent || !context.parent.parent) {
			return super.createDocuments(data, context);
		}

		const effects = context.parent.effects.toObject();
		effects.push(...data);
		return context.parent.update({effects}, {diff: false, recursive: false});
	}

	static async updateDocuments (updates = [], context = {}) {
		if (!context.parent || !context.parent.parent) {
			return super.updateDocuments(data, context);
		}

		const effects = context.parent.effects.toObject();
		const existing = new Map(effects.map(e => [e._id, e]));

		updates.forEach(update => {
			const original = existing.get(update._id);
			if (original) {
				mergeObject(original, update, {inplace: true});
			}
		});

		return context.parent.update({effects}, {diff: false, recursive: false});
	}

	static async deleteDocuments (ids = [], context = {}) {
		if (!context.parent || !context.parent.parent) {
			return super.deleteDocuments(ids, context);
		}

		const effects = context.parent.effects.toObject();
		return context.parent.update(
			{effects: effects.filter(e => !ids.includes(e._id))},
			{diff: false, recursive: false});
	}
}
