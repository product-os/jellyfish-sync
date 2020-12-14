/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

/* eslint-disable no-underscore-dangle */

const mirror = require('../index').mirror

console.warn('test', {
	name: 'josh'
})

const token = {
	api: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzY29wZXMiOlsic2hhcmVkOioiLCJwcml2YXRlOioiXSwiaXNzIjoiZnJvbnQiLCJzdWIiOiJyZXNpbl9pb19kZXYifQ.dF4eIPT3v9OjHk70EzneVdjqVShOFBnbl5_7_L6xHc4',
	intercom: 'foobar'
}

const card = {
	id: '890d9db2-483c-4497-933d-b60538da1dbc',
	data: {
		inbox: 'Jellyfish Testfront',
		status: 'open',
		mirrors: [
			'https://resin-io-dev.api.frontapp.com/conversations/cnv_9ze5fgm'
		],
		alertsUser: [

		],
		description: 'Foo Bar 1ae52d32-8b79-417e-9e94-dc2d619e51b7',
		environment: 'production',
		mentionsUser: [

		]
	},
	name: 'My Issue 0de4b704-1cbd-4607-9a07-7c767a5dcbe0',
	slug: 'support-thread-da7ec740-1a4b-45f3-bc2c-1cf333c75c26',
	tags: [

	],
	type: 'support-thread@1.0.0',
	links: {},
	active: true,
	markers: [

	],
	version: '1.0.0',
	requires: [

	],
	linked_at: {},
	created_at: '2020-12-14T04:30:07.645Z',
	updated_at: null,
	capabilities: [

	]
}

const context = {
	log: {
		warn: console.warn,
		debug: console.debug,
		info: console.info,
		error: console.error
	},
	upsertElement: async (type, object) => {
		return object
	}
}

const options = {
	actor: '13a68ea3-8560-4cbb-af9e-8d6d0949e9c4',
	defaultUser: 'admin',
	origin: 'https://jel.ly.fish/oauth/front'
}

const run = async () => {
	const results = await mirror('front', token, card, context, options)
	console.dir(results)
}

run()
