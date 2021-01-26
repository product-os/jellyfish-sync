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

const makeWorkerContextStub = (cardFixtures) => {
	return {
		query: (_session, schema) => {
			return _.filter(cardFixtures, (card) => {
				return skhema.isValid(schema, card)
			})
		}
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
