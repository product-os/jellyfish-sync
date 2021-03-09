/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

const _ = require('lodash')
const ava = require('ava')
const pipeline = require('./pipeline')
const sinon = require('sinon')

ava('pipeline.importCards() should work with card partials', async (test) => {
	const upsertElementSpy = sinon.spy(_.constant({
		foo: 'bar'
	}))

	const sequence = [
		{
			time: Date.now(),
			actor: '46a045b8-95f6-42b5-bf7f-aa0a1365b9ee',
			card: {
				type: 'card',
				slug: 'card-78a1dfd7-21ea-405a-b269-de0b0e587975'
			}
		}
	]

	const context = {
		upsertElement: upsertElementSpy
	}

	const results = await pipeline.importCards(context, sequence, {})

	test.is(results.length, 1)
	test.true(upsertElementSpy.calledOnce)
	test.deepEqual(upsertElementSpy.args[0][0], 'card')
	test.deepEqual(upsertElementSpy.args[0][1], {
		active: true,
		version: '1.0.0',
		tags: [],
		markers: [],
		links: {},
		requires: [],
		capabilities: [],
		data: {},
		type: 'card',
		slug: 'card-78a1dfd7-21ea-405a-b269-de0b0e587975'
	})
})

ava('pipeline.importCards() should work with JSONpatch', async (test) => {
	const upsertElementSpy = sinon.spy(_.constant({
		foo: 'bar'
	}))

	const sequence = [
		{
			time: Date.now(),
			actor: '46a045b8-95f6-42b5-bf7f-aa0a1365b9ee',
			card: {
				id: '78a1dfd7-21ea-405a-b269-de0b0e587975',
				type: 'card',
				patch: [ {
					op: 'replace',
					path: '/name',
					value: 'foobar'
				} ]
			}
		}
	]

	const context = {
		upsertElement: upsertElementSpy
	}

	const results = await pipeline.importCards(context, sequence, {})

	test.is(results.length, 1)
	test.true(upsertElementSpy.calledOnce)
	test.deepEqual(upsertElementSpy.args[0][0], 'card')
	test.deepEqual(upsertElementSpy.args[0][1], {
		id: '78a1dfd7-21ea-405a-b269-de0b0e587975',
		type: 'card',
		patch: [
			{
				op: 'replace',
				path: '/name',
				value: 'foobar'
			}
		]
	})
})
