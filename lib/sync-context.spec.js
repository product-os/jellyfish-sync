/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

const _ = require('lodash')
const ava = require('ava')
const {
	getActionContext
} = require('./sync-context')
const skhema = require('skhema')
const sinon = require('sinon')
const jsonpatch = require('fast-json-patch')
const uuid = require('uuid')

const makeWorkerContextStub = (cardFixtures) => {
	const defaults = (contract) => {
		if (!contract.id) {
			contract.id = uuid.v4()
		}
		if (!contract.slug) {
			contract.slug = `${contract.type}-${uuid.v4()}`
		}

		return contract
	}

	const store = _.cloneDeep(cardFixtures).map(defaults)

	return {
		query: async (_session, schema) => {
			return _.filter(store, (card) => {
				return skhema.isValid(schema, card)
			})
		},
		getCardBySlug: async (_session, slugWithVersion) => {
			const slug = slugWithVersion.split('@')[0]
			return _.find(store, {
				slug
			}) || null
		},
		getCardById: async (_session, id) => {
			return _.find(store, {
				id
			}) || null
		},
		insertCard: async (_session, _typeCard, _options, object) => {
			if (_.find(store, {
				slug: object.slug
			})) {
				throw new Error(`${object.slug} already exists`)
			}
			store.push(defaults(object))
			return object
		},
		patchCard: async (_session, _typeCard, _options, current, patch) => {
			const existing = _.find(store, {
				id: current.id
			})
			jsonpatch.applyPatch(existing, patch)
			return existing
		},
		defaults,
		errors: {
			WorkerNoElement: {}
		}
	}
}

ava('context.getElementByMirrorId() should match mirrors exactly', async (test) => {
	const mirrorId = 'test://1'
	const card1 = {
		id: uuid.v4(),
		slug: `card-${uuid.v4()}`,
		type: 'card',
		data: {
			mirrors: [
				mirrorId
			]
		}
	}

	const card2 = {
		id: uuid.v4(),
		slug: `card-${uuid.v4()}`,
		type: 'card',
		data: {
			mirrors: [
				'test://2'
			]
		}
	}

	const workerContextStub = makeWorkerContextStub([
		card1,
		card2
	])

	const context = getActionContext({}, workerContextStub, {}, '')

	const result = await context.getElementByMirrorId('card', mirrorId)

	test.deepEqual(result, card1)
})

ava('context.getElementByMirrorId() should match by type', async (test) => {
	const mirrorId = 'test://1'
	const card1 = {
		id: uuid.v4(),
		slug: `card-${uuid.v4()}`,
		type: 'card',
		data: {
			mirrors: [
				mirrorId
			]
		}
	}

	const card2 = {
		id: uuid.v4(),
		slug: `card-${uuid.v4()}`,
		type: 'foo',
		data: {
			mirrors: [
				mirrorId
			]
		}
	}

	const workerContextStub = makeWorkerContextStub([
		card1,
		card2
	])

	const context = getActionContext({}, workerContextStub, {}, '')

	const result = await context.getElementByMirrorId('card', mirrorId)

	test.deepEqual(result, card1)
})

ava('context.getElementByMirrorId() should not return anything if there is no match', async (test) => {
	const mirrorId = 'test://1'
	const card1 = {
		type: 'card',
		data: {
			mirrors: [
				mirrorId
			]
		}
	}

	const card2 = {
		type: 'card',
		data: {
			mirrors: [
				'test://2'
			]
		}
	}

	const workerContextStub = makeWorkerContextStub([
		card1,
		card2
	])

	const context = getActionContext({}, workerContextStub, {}, '')

	const result = await context.getElementByMirrorId('card', 'foobarbaz')

	test.falsy(result)
})

ava('context.getElementByMirrorId() should optionally use a pattern match for the mirror Id', async (test) => {
	const card1 = {
		id: uuid.v4(),
		slug: `card-${uuid.v4()}`,
		type: 'card',
		data: {
			mirrors: [
				'test://foo/1'
			]
		}
	}

	const card2 = {
		id: uuid.v4(),
		slug: `card-${uuid.v4()}`,
		type: 'card',
		data: {
			mirrors: [
				'test://bar/2'
			]
		}
	}

	const workerContextStub = makeWorkerContextStub([
		card1,
		card2
	])

	const context = getActionContext({}, workerContextStub, {}, '')

	const result = await context.getElementByMirrorId('card', 'foo/1', {
		usePattern: true
	})

	test.deepEqual(result, card1)
})

ava('context.upsertElement() should create a new element', async (test) => {
	const typeCard = {
		type: 'type',
		slug: 'card',
		data: {
			schema: {
				type: 'object'
			}
		}
	}

	const workerContextStub = makeWorkerContextStub([
		typeCard
	])

	const insertSpy = sinon.spy(workerContextStub, 'insertCard')
	const patchSpy = sinon.spy(workerContextStub, 'patchCard')

	const context = getActionContext({}, workerContextStub, {
		id: 1
	}, '')

	const newCard = {
		type: 'card',
		slug: 'card-foobarbaz',
		data: {
			test: 1
		}
	}

	const result = await context.upsertElement('card', newCard, {
		actor: 'ahab'
	})

	test.true(insertSpy.calledOnce)
	test.true(patchSpy.notCalled)

	test.is(result.slug, newCard.slug)
})

ava('context.upsertElement() should patch an element if the slug exists but no id is provided', async (test) => {
	const typeCard = {
		type: 'type',
		slug: 'card',
		data: {
			schema: {
				type: 'object'
			}
		}
	}

	const card1 = {
		type: 'card',
		slug: 'card-foobarbaz',
		data: {
			test: 1
		}
	}

	const newCard = {
		...card1,
		data: {
			test: 2
		}
	}

	const workerContextStub = makeWorkerContextStub([
		typeCard,
		card1
	])

	const insertSpy = sinon.spy(workerContextStub, 'insertCard')
	const patchSpy = sinon.spy(workerContextStub, 'patchCard')

	const context = getActionContext({}, workerContextStub, {
		id: 1
	}, '')

	const result = await context.upsertElement('card', newCard, {
		actor: 'ahab'
	})

	test.true(insertSpy.notCalled)
	test.true(patchSpy.calledOnce)

	test.is(result.slug, card1.slug)
	test.is(result.data.test, newCard.data.test)
})

ava('context.upsertElement() should patch an element by id even if the slugs differ', async (test) => {
	const typeCard = {
		type: 'type',
		slug: 'card',
		data: {
			schema: {
				type: 'object'
			}
		}
	}

	const card1 = {
		id: 'f41b64b3-153c-438d-b8f2-0c592f742b4c',
		type: 'card',
		slug: 'card-foobarbaz',
		data: {
			test: 1
		}
	}

	const workerContextStub = makeWorkerContextStub([
		typeCard,
		card1
	])

	const insertSpy = sinon.spy(workerContextStub, 'insertCard')
	const patchSpy = sinon.spy(workerContextStub, 'patchCard')

	const context = getActionContext({}, workerContextStub, {
		id: 1
	}, '')

	const newCard = {
		...card1,
		slug: `${card1.slug}-fuzzbuzzfizz`,
		data: {
			test: 2
		}
	}

	const result = await context.upsertElement('card', newCard, {
		actor: 'ahab'
	})

	test.true(insertSpy.notCalled)
	test.true(patchSpy.calledOnce)

	test.is(result.slug, card1.slug)
	test.is(result.id, card1.id)
	test.is(result.data.test, newCard.data.test)
})

ava('context.upsertElement() should patch an element by id when the slugs are the same', async (test) => {
	const typeCard = {
		type: 'type',
		slug: 'card',
		data: {
			schema: {
				type: 'object'
			}
		}
	}

	const card1 = {
		id: 'f41b64b3-153c-438d-b8f2-0c592f742b4c',
		type: 'card',
		slug: 'card-foobarbaz',
		data: {
			test: 1
		}
	}

	const workerContextStub = makeWorkerContextStub([
		typeCard,
		card1
	])

	const insertSpy = sinon.spy(workerContextStub, 'insertCard')
	const patchSpy = sinon.spy(workerContextStub, 'patchCard')

	const context = getActionContext({}, workerContextStub, {
		id: 1
	}, '')

	const newCard = {
		...card1,
		data: {
			test: 2
		}
	}

	const result = await context.upsertElement('card', newCard, {
		actor: 'ahab'
	})

	test.true(insertSpy.notCalled)
	test.true(patchSpy.calledOnce)

	test.is(result.slug, card1.slug)
	test.is(result.id, card1.id)
	test.is(result.data.test, newCard.data.test)
})
