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

const makeWorkerContextStub = (cardFixtures) => {
	return {
		query: (_session, schema) => {
			return _.filter(cardFixtures, (card) => {
				return skhema.isValid(schema, card)
			})
		},
		getCardBySlug: (_session, slugWithVersion) => {
			const slug = slugWithVersion.split('@')[0]
			return _.find(cardFixtures, {
				slug
			})
		},
		errors: {
			WorkerNoElement: {}
		},
		defaults: _.identity
	}
}

ava('context.getElementByMirrorId() should match mirrors exactly', async (test) => {
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

	const result = await context.getElementByMirrorId('card', mirrorId)

	test.deepEqual(result, card1)
})

ava('context.getElementByMirrorId() should match by type', async (test) => {
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
		type: 'card',
		data: {
			mirrors: [
				'test://foo/1'
			]
		}
	}

	const card2 = {
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

ava('context.upsertElement() should throw if overwriting an existing card with a different id', async (test) => {
	const typeCard = {
		slug: 'card',
		type: 'type',
		data: {
			schema: {
				type: 'object'
			}
		}
	}

	const existingCard = {
		slug: 'card-foo-bar',
		type: 'card',
		id: '12345',
		data: {
			lorem: 'ipsum'
		}
	}

	const workerContextStub = makeWorkerContextStub([
		typeCard,
		existingCard
	])

	const upsertElementSpy = sinon.spy()

	workerContextStub.upsertElement = upsertElementSpy

	const context = getActionContext({}, workerContextStub, {}, '')

	const inputObject = {
		slug: 'card-foo-bar',
		type: 'card',
		data: {
			lorem: 'dis amet'
		}
	}

	const error = await test.throwsAsync(
		context.upsertElement(
			'card',
			inputObject,
			{
				actor: 'product-os'
			}
		)
	)

	test.is(error.message, `Cannot patch over existing card: ${existingCard.slug}`)

	// Test that upsertElement was not called
	test.is(upsertElementSpy.callCount, 0)
})

ava('context.upsertElement() should create a new card if there is no existing card with the same slug', async (test) => {
	const typeCard = {
		slug: 'card',
		type: 'type',
		data: {
			schema: {
				type: 'object'
			}
		}
	}

	const workerContextStub = makeWorkerContextStub([
		typeCard
	])

	const insertSpy = sinon.spy()

	workerContextStub.insertCard = async (...args) => {
		insertSpy(...args)
	}

	const context = getActionContext({}, workerContextStub, {
		id: 1
	}, '')

	const inputObject = {
		slug: 'card-foo-bar',
		type: 'card',
		data: {
			lorem: 'dis amet'
		}
	}

	await test.notThrowsAsync(
		context.upsertElement(
			'card',
			inputObject,
			{
				actor: 'product-os'
			}
		)
	)

	test.is(insertSpy.firstCall.args[3], inputObject)
})

ava('context.upsertElement() should update an existing card with the same slug and id', async (test) => {
	const typeCard = {
		slug: 'card',
		type: 'type',
		data: {
			schema: {
				type: 'object'
			}
		}
	}

	const existingCard = {
		slug: 'card-foo-bar',
		type: 'card',
		name: null,
		id: '12345',
		data: {
			lorem: 'ipsum'
		}
	}

	const workerContextStub = makeWorkerContextStub([
		typeCard,
		existingCard
	])

	const patchSpy = sinon.spy()

	workerContextStub.patchCard = async (...args) => {
		patchSpy(...args)
	}

	const context = getActionContext({}, workerContextStub, {
		id: 1
	}, '')

	const inputObject = {
		slug: existingCard.slug,
		id: existingCard.id,
		name: null,
		type: 'card',
		data: {
			lorem: 'dis amet'
		}
	}

	await test.notThrowsAsync(
		context.upsertElement(
			'card',
			inputObject,
			{
				actor: 'product-os'
			}
		)
	)

	test.deepEqual(patchSpy.firstCall.lastArg, [ {
		op: 'replace',
		path: '/data/lorem',
		value: inputObject.data.lorem
	} ])
})
