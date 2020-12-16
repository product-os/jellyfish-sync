/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

require('dotenv').config()
const ava = require('ava')
const _ = require('lodash')
const randomstring = require('randomstring')
const querystring = require('querystring')
const nock = require('nock')
const jws = require('jsonwebtoken')
const jose = require('node-jose')
const Sync = require('./index').Sync
const oauth = require('./oauth')
const errors = require('./errors')

const sync = new Sync({
	integrations: {}
})

// TODO: Move this test to relevant plugin repo
ava.skip('.isValidEvent() should return true for Front given anything', async (test) => {
	const result = await sync.isValidEvent('front', {
		api: 'xxxxxxx'
	}, {
		headers: {},
		raw: '....'
	})

	test.true(result)
})

ava('.isValidEvent() should return false for an unknown integration', async (test) => {
	const result = await sync.isValidEvent('helloworld', null, {
		headers: {},
		raw: '....'
	})

	test.false(result)
})

// TODO: Move this test to relevant plugin repo
ava.skip('.isValidEvent() should return false given GitHub and no signature header', async (test) => {
	const result = await sync.isValidEvent('github', {
		api: 'xxxxx',
		signature: 'secret'
	}, {
		headers: {},
		raw: '....'
	})

	test.false(result)
})

// TODO: Move this test to relevant plugin repo
ava.skip('.isValidEvent() should return false given GitHub and a signature but no key', async (test) => {
	const result = await sync.isValidEvent('github', null, {
		raw: '....',
		headers: {
			'x-hub-signature': 'sha1=aaaabbbbcccc'
		}
	})

	test.false(result)
})

// TODO: Move this test to relevant plugin repo
ava.skip('.isValidEvent() should return false given GitHub and a signature mismatch', async (test) => {
	const result = await sync.isValidEvent('github', {
		api: 'xxxxx',
		signature: 'secret'
	}, {
		raw: '{"foo":"bar"}',
		headers: {
			'x-hub-signature': 'sha1=foobarbaz'
		}
	})

	test.false(result)
})

// TODO: Move this test to relevant plugin repo
ava.skip('.isValidEvent() should return true given GitHub and a signature match', async (test) => {
	const result = await sync.isValidEvent('github', {
		api: 'xxxxx',
		signature: 'secret'
	}, {
		raw: '{"foo":"bar"}',
		headers: {
			'x-hub-signature': 'sha1=52b582138706ac0c597c315cfc1a1bf177408a4d'
		}
	})

	test.true(result)
})

// TODO: Move this test to relevant plugin repo
ava.skip('.isValidEvent() should return true given Discourse and no signature header', async (test) => {
	const result = await sync.isValidEvent('discourse', {
		api: 'xxxxx',
		signature: 'secret'
	}, {
		raw: '....',
		headers: {}
	})

	test.true(result)
})

// TODO: Move this test to relevant plugin repo
ava.skip('.isValidEvent() should return false given Discourse and a signature but no key', async (test) => {
	const result = await sync.isValidEvent('discourse', null, {
		raw: '....',
		headers: {
			'x-discourse-event-signature': 'sha256=aaaabbbbcccc'
		}
	})

	test.false(result)
})

// TODO: Move this test to relevant plugin repo
ava.skip('.isValidEvent() should return false given Discourse and a signature mismatch', async (test) => {
	const result = await sync.isValidEvent('discourse', {
		api: 'xxxxx',
		signature: 'secret'
	}, {
		raw: '{"foo":"bar"}',
		headers: {
			'x-discourse-event-signature': 'sha256=foobarbaz'
		}
	})

	test.false(result)
})

// TODO: Move this test to relevant plugin repo
ava.skip('.isValidEvent() should return true given Discourse and a signature match', async (test) => {
	const result = await sync.isValidEvent('discourse', {
		api: 'xxxxx',
		signature: 'secret'
	}, {
		raw: '{"foo":"bar"}',
		headers: {
			'x-discourse-event-signature': 'sha256=3f3ab3986b656abb17af3eb1443ed6c08ef8fff9fea83915909d1b421aec89be'
		}
	})

	test.true(result)
})

// eslint-disable-next-line max-len
const TEST_BALENA_API_PRIVATE_KEY = 'LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1JR0hBZ0VBTUJNR0J5cUdTTTQ5QWdFR0NDcUdTTTQ5QXdFSEJHMHdhd0lCQVFRZ0lGM1M3TkNkV1MyZXJEU0YKbEcxSnBFTEZid0pNckVURUR0d3ZRMFVSUFh5aFJBTkNBQVNDR1pPcmhZTmhoY1c5YTd5OHNTNStINVFFY2tEaApGK0ZVZUV4Si9UcEtCS256RVBMNVBGNGt0L0JwZVlFNmpoQ3UvUmpjWEhXdE1DOXdRTGpQU1ZXaQotLS0tLUVORCBQUklWQVRFIEtFWS0tLS0tCg=='
// eslint-disable-next-line max-len
const TEST_BALENA_API_PUBLIC_KEY = 'LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUZrd0V3WUhLb1pJemowQ0FRWUlLb1pJemowREFRY0RRZ0FFZ2htVHE0V0RZWVhGdld1OHZMRXVmaCtVQkhKQQo0UmZoVkhoTVNmMDZTZ1NwOHhEeStUeGVKTGZ3YVhtQk9vNFFydjBZM0Z4MXJUQXZjRUM0ejBsVm9nPT0KLS0tLS1FTkQgUFVCTElDIEtFWS0tLS0tCg=='

// TODO: Move this test to relevant plugin repo
ava.skip('.isValidEvent() should return false given Balena API and invalid JSON', async (test) => {
	const result = await sync.isValidEvent('balena-api', {
		api: 'xxxxx',
		production: {
			publicKey: TEST_BALENA_API_PUBLIC_KEY
		},
		privateKey: TEST_BALENA_API_PRIVATE_KEY
	}, {
		raw: '{"foo":"bar"}',
		headers: {
			'content-type': 'application/jose'
		}
	})

	test.false(result)
})

// TODO: Move this test to relevant plugin repo
ava.skip('.isValidEvent() should return false given Balena API and invalid payload', async (test) => {
	const result = await sync.isValidEvent('balena-api', {
		api: 'xxxxx',
		production: {
			publicKey: TEST_BALENA_API_PUBLIC_KEY
		},
		privateKey: TEST_BALENA_API_PRIVATE_KEY
	}, {
		raw: 'xxxxxxxxxxxxxx',
		headers: {
			'content-type': 'application/jose'
		}
	})

	test.false(result)
})

const encryptPayload = async (payload) => {
	const signedToken = jws.sign({
		data: payload
	}, Buffer.from(TEST_BALENA_API_PRIVATE_KEY, 'base64'), {
		algorithm: 'ES256',
		expiresIn: 10 * 60 * 1000,
		audience: 'jellyfish',
		issuer: 'api.balena-cloud.com',
		jwtid: randomstring.generate(20),
		subject: `${payload.id}`
	})

	const keyValue = Buffer.from(TEST_BALENA_API_PUBLIC_KEY, 'base64')
	const encryptionKey = await jose.JWK.asKey(keyValue, 'pem')

	const cipher = jose.JWE.createEncrypt({
		format: 'compact'
	}, encryptionKey)
	cipher.update(signedToken)

	const result = await cipher.final()
	return result
}

// TODO: Move this test to relevant plugin repo
ava.skip('balena.mergeCardWithPayload() should translate user resource', async (test) => {
	const payload = {
		resource: 'user',
		type: 'update',
		timestamp: '2020-10-22T13:52:37.535Z',
		source: '127.0.0.1',
		payload: {
			has_legacy_link_to__organization: [
				{
					company_name: 'Legacy Balena'
				}
			],
			id: 15,
			username: 'newusername',
			first_name: null,
			last_name: null,
			email: 'newemail@example.org',
			account_type: null,
			ip: '::ffff:127.0.0.1'
		}
	}

	const expected = {
		active: true,
		data: {
			mirrors: [ 'https://127.0.0.1/v5/user(15)' ],
			profile: {
				company: 'Legacy Balena'
			},
			translateDate: '2020-10-22T13:52:37.535Z',
			roles: [ 'user-external-support' ],
			hash: 'PASSWORDLESS',
			email: 'newemail@example.org'
		},
		type: 'user@1.0.0',
		slug: 'user-newusername',
		name: 'newusername'
	}

	// eslint-disable-next-line no-undefined, no-undef
	const result = await balena.mergeCardWithPayload(undefined, payload, 'user', 'user@1.0.0')
	test.deepEqual(result, expected)
})

// TODO: Move this test to relevant plugin repo
ava.skip('balena.mergeCardWithPayload() should translate organization resource', async (test) => {
	const payload = {
		resource: 'organization',
		type: 'update',
		timestamp: '2020-10-20T13:05:40.923Z',
		source: '127.0.0.1',
		payload: {
			id: 19,
			name: 'newusername',
			company_name: 'Balena',
			internal_company_name: 'fake balena',
			internal_note: 'long note about the history of fake balena and real balena',
			industry: 'IoT',
			website: 'https://www.balena.co.uk.jp',
			handle: 'newusername'
		}
	}

	const expected = {
		active: true,
		data: {
			mirrors: [ 'https://127.0.0.1/v5/organization(19)' ],
			translateDate: '2020-10-20T13:05:40.923Z',
			internal_company_name: 'fake balena',
			internal_note: 'long note about the history of fake balena and real balena',
			industry: 'IoT',
			website: 'https://www.balena.co.uk.jp',
			username: 'newusername'
		},
		type: 'account@1.0.0',
		slug: 'account-balena',
		name: 'Balena'
	}

	// eslint-disable-next-line no-undefined, no-undef
	const result = await balena.mergeCardWithPayload(undefined, payload, 'organization', 'account@1.0.0')
	test.deepEqual(result, expected)
})

// TODO: Move this test to relevant plugin repo
ava.skip('balena.mergeCardWithPayload() should translate organization with nested subscription resource', async (test) => {
	const payload = {
		resource: 'organization',
		type: 'update',
		timestamp: '2020-10-20T13:05:40.923Z',
		source: '127.0.0.1',
		payload: {
			subscription: [
				{
					id: 25,
					billing_cycle: 'monthly',
					starts_on__date: '2020-10-20T13:05:39.976Z',
					ends_on__date: '2020-12-20T13:05:39.976Z',
					discount_percentage: 0,
					bills_base_with__recurly_id: 'abcde12345',
					bills_addons_with__recurly_id: '54321edcba',
					is_agreed_upon_on__date: '2020-10-20T13:05:39.976Z',
					internal_note: 'Note about why this subscription'
				}
			],
			id: 19,
			name: 'newusername',
			company_name: 'Balena',
			internal_company_name: 'fake balena',
			internal_note: 'long note about the history of fake balena and real balena',
			industry: 'IoT',
			website: 'https://www.balena.co.uk.jp',
			handle: 'newusername'
		}
	}

	const expected = {
		active: true,
		data: {
			mirrors: [ 'https://127.0.0.1/v5/organization(19)', 'https://127.0.0.1/v5/subscription(25)' ],
			translateDate: '2020-10-20T13:05:40.923Z',
			internal_company_name: 'fake balena',
			internal_note: 'long note about the history of fake balena and real balena',
			industry: 'IoT',
			website: 'https://www.balena.co.uk.jp',
			username: 'newusername',
			discountPercentage: 0,
			startsOnDate: '2020-10-20T13:05:39.976Z',
			endsOnDate: '2020-12-20T13:05:39.976Z',
			subscriptionNote: 'Note about why this subscription',
			billingCycle: 'monthly',
			isAgreedUponOnDate: '2020-10-20T13:05:39.976Z'
		},
		type: 'account@1.0.0',
		slug: 'account-balena'
	}

	// eslint-disable-next-line no-undefined, no-undef
	const result = await balena.mergeCardWithPayload(undefined, payload, 'organization', 'account@1.0.0')
	test.deepEqual(result, expected)
})

// TODO: Move this test to relevant plugin repo
// eslint-disable-next-line max-len
ava.skip('balena.mergeCardWithPayload() should translate organization with nested subscription and plan resource', async (test) => {
	const payload = {
		resource: 'organization',
		type: 'update',
		timestamp: '2020-10-20T13:05:40.923Z',
		source: '127.0.0.1',
		payload: {
			subscription: [
				{
					is_for__plan: [
						{
							id: 1,
							title: 'Free',
							billing_code: 'free',
							generation: 2,
							monthly_price: 0,
							annual_price: 0,
							can_self_serve: true,
							is_legacy: false
						}
					],
					id: 25,
					billing_cycle: 'monthly',
					starts_on__date: '2020-10-20T13:05:39.976Z',
					ends_on__date: '2020-12-20T13:05:39.976Z',
					discount_percentage: 0,
					bills_base_with__recurly_id: 'abcde12345',
					bills_addons_with__recurly_id: '54321edcba',
					is_agreed_upon_on__date: '2020-10-20T13:05:39.976Z',
					internal_note: 'Note about why this subscription'
				}
			],
			id: 19,
			name: 'newusername',
			company_name: 'Balena',
			internal_company_name: 'fake balena',
			internal_note: 'long note about the history of fake balena and real balena',
			industry: 'IoT',
			website: 'https://www.balena.co.uk.jp',
			handle: 'newusername'
		}
	}

	const expected = {
		active: true,
		data: {
			annualPrice: 0,
			billingCode: 'free',
			billingCycle: 'monthly',
			canSelfServe: true,
			discountPercentage: 0,
			endsOnDate: '2020-12-20T13:05:39.976Z',
			generation: 2,
			industry: 'IoT',
			internal_company_name: 'fake balena',
			internal_note: 'long note about the history of fake balena and real balena',
			isAgreedUponOnDate: '2020-10-20T13:05:39.976Z',
			mirrors: [
				'https://127.0.0.1/v5/organization(19)',
				'https://127.0.0.1/v5/subscription(25)',
				'https://127.0.0.1/v5/plan(1)'
			],
			monthlyPrice: 0,
			plan: 'Free',
			startsOnDate: '2020-10-20T13:05:39.976Z',
			subscriptionNote: 'Note about why this subscription',
			translateDate: '2020-10-20T13:05:40.923Z',
			username: 'newusername',
			website: 'https://www.balena.co.uk.jp'
		},
		slug: 'account-balena',
		type: 'account@1.0.0'
	}

	// eslint-disable-next-line no-undefined, no-undef
	const result = await balena.mergeCardWithPayload(undefined, payload, 'organization', 'account@1.0.0')
	test.deepEqual(result, expected)
})

// TODO: Move this test to relevant plugin repo
ava.skip('.isValidEvent() should return true given Balena API and a key match', async (test) => {
	const payload = await encryptPayload({
		id: 666,
		foo: 'bar'
	})

	const result = await sync.isValidEvent('balena-api', {
		api: 'xxxxx',
		production: {
			publicKey: TEST_BALENA_API_PUBLIC_KEY
		},
		privateKey: TEST_BALENA_API_PRIVATE_KEY
	}, {
		raw: payload,
		headers: {
			'content-type': 'application/jose'
		}
	})

	test.true(result)
})

// TODO: Move this test to relevant plugin repo
ava.skip('.isValidEvent() should return false given Balena API and no public key', async (test) => {
	const payload = await encryptPayload({
		id: 666,
		foo: 'bar'
	})

	const result = await sync.isValidEvent('balena-api', {
		api: 'xxxxx',
		privateKey: TEST_BALENA_API_PRIVATE_KEY
	}, {
		raw: payload,
		headers: {
			'content-type': 'application/jose'
		}
	})

	test.false(result)
})

// TODO: Move this test to relevant plugin repo
ava.skip('.isValidEvent() should return true given Balena API and no private key', async (test) => {
	const payload = await encryptPayload({
		id: 666,
		foo: 'bar'
	})

	const result = await sync.isValidEvent('balena-api', {
		api: 'xxxxx',
		production: {
			publicKey: TEST_BALENA_API_PUBLIC_KEY
		}
	}, {
		raw: payload,
		headers: {
			'content-type': 'application/jose'
		}
	})

	test.false(result)
})

ava('.getAssociateUrl() should return null given an invalid integration', (test) => {
	const result = sync.getAssociateUrl('helloworld', {
		appId: 'xxxxx'
	}, 'user-jellyfish', {
		origin: 'https://jel.ly.fish/oauth/helloworld'
	})

	test.falsy(result)
})

ava('.getAssociateUrl() should return null given no token', (test) => {
	const result = sync.getAssociateUrl('outreach', null, 'user-jellyfish', {
		origin: 'https://jel.ly.fish/oauth/outreach'
	})

	test.falsy(result)
})

ava('.getAssociateUrl() should return null given no appId', (test) => {
	const result = sync.getAssociateUrl('outreach', {
		api: 'xxxxxx'
	}, 'user-jellyfish', {
		origin: 'https://jel.ly.fish/oauth/outreach'
	})

	test.falsy(result)
})

// TODO: Move this test to relevant plugin repo
ava.skip('.getAssociateUrl() should be able to generate an Outreach URL', (test) => {
	const result = sync.getAssociateUrl('outreach', {
		appId: 'dJyXQHeh8PLKUr4gdsoUYQ8vFvqJ1D20lnFMxBLg'
	}, 'user-jellyfish', {
		origin: 'https://jel.ly.fish/oauth/outreach'
	})

	const qs = [
		'response_type=code',
		'client_id=dJyXQHeh8PLKUr4gdsoUYQ8vFvqJ1D20lnFMxBLg',
		'redirect_uri=https%3A%2F%2Fjel.ly.fish%2Foauth%2Foutreach',
		// eslint-disable-next-line no-undef
		`scope=${outreach.OAUTH_SCOPES.join('+')}`,
		'state=user-jellyfish'
	].join('&')

	test.is(result, `https://api.outreach.io/oauth/authorize?${qs}`)
})

ava('.authorize() should throw given an invalid integration', async (test) => {
	await test.throwsAsync(sync.authorize('helloworld', {
		appId: 'dJyXQHeh8PLKUr4gdsoUYQ8vFvqJ1D20lnFMxBLg',
		appSecret: 'NlfY38rTt5xxa+Ehi2kV/2rA85C98iDdMF7xD9xr'
	}, {
		OAUTH_INTEGRATIONS: {}
	}, {
		code: '12345',
		origin: 'https://jel.ly.fish/oauth/helloworld'
	}), {
		instanceOf: errors.SyncNoCompatibleIntegration
	})
})

ava('.authorize() should throw given no token', async (test) => {
	await test.throwsAsync(sync.authorize('helloworld', null, {
		OAUTH_INTEGRATIONS: {
			helloworld: {}
		}
	}, {
		code: '12345',
		origin: 'https://jel.ly.fish/oauth/helloworld'
	}), {
		instanceOf: errors.SyncNoIntegrationAppCredentials
	})
})

ava('.authorize() should throw given no appId', async (test) => {
	await test.throwsAsync(sync.authorize('helloworld', {
		appSecret: 'NlfY38rTt5xxa+Ehi2kV/2rA85C98iDdMF7xD9xr'
	}, {
		OAUTH_INTEGRATIONS: {
			helloworld: {}
		}
	}, {
		code: '12345',
		origin: 'https://jel.ly.fish/oauth/helloworld'
	}), {
		instanceOf: errors.SyncNoIntegrationAppCredentials
	})
})

ava('.authorize() should throw given no appSecret', async (test) => {
	await test.throwsAsync(sync.authorize('helloworld', {
		appId: 'dJyXQHeh8PLKUr4gdsoUYQ8vFvqJ1D20lnFMxBLg'
	}, {
		OAUTH_INTEGRATIONS: {
			helloworld: {}
		}
	}, {
		code: '12345',
		origin: 'https://jel.ly.fish/oauth/helloworld'
	}), {
		instanceOf: errors.SyncNoIntegrationAppCredentials
	})
})

// TODO: Move this test to relevant plugin repo
ava.skip('.authorize() should throw given a code mismatch', async (test) => {
	nock.cleanAll()
	nock.disableNetConnect()

	await nock('https://api.outreach.io')
		.post('/oauth/token')
		.reply((uri, request, callback) => {
			const body = querystring.decode(request)

			if (_.isEqual(body, {
				grant_type: 'authorization_code',
				client_id: 'dJyXQHeh8PLKUr4gdsoUYQ8vFvqJ1D20lnFMxBLg',
				client_secret: 'NlfY38rTt5xxa+Ehi2kV/2rA85C98iDdMF7xD9xr',
				redirect_uri: 'https://jel.ly.fish/oauth/outreach',
				code: '12345'
			})) {
				return callback(null, [ 200, {
					access_token: 'KSTWMqidua67hjM2NDE1ZTZjNGZmZjI3',
					token_type: 'bearer',
					expires_in: 3600,
					refresh_token: 'POolsdYTlmM2YxOTQ5MGE3YmNmMDFkNTVk',
					scope: 'create'
				} ])
			}

			return callback(null, [ 400, {
				error: 'invalid_request',
				error_description: 'Something went wrong'
			} ])
		})

	await test.throwsAsync(sync.authorize('outreach', {
		appId: 'dJyXQHeh8PLKUr4gdsoUYQ8vFvqJ1D20lnFMxBLg',
		appSecret: 'NlfY38rTt5xxa+Ehi2kV/2rA85C98iDdMF7xD9xr'
	}, {}, {
		code: 'invalidcode',
		origin: 'https://jel.ly.fish/oauth/outreach'
	}), {
		instanceOf: oauth.OAuthUnsuccessfulResponse
	})

	nock.cleanAll()
})

ava('.associate() should throw given an invalid integration', async (test) => {
	const data = {
		'user-johndoe': {
			type: 'user',
			version: '1.0.0',
			slug: 'user-johndoe',
			data: {
				email: 'johndoe@test.com'
			}
		}
	}

	await test.throwsAsync(sync.associate('helloworld', data['user-johndoe'], {
		token_type: 'Bearer',
		access_token: 'NlfY38rTt5xxa+Ehi2kV/2rA85C98iDdMF7xD9xr'
	}, {
		OAUTH_INTEGRATIONS: {},
		upsertElement: async (type, object, options) => {
			data[object.slug] = Object.assign({}, object, {
				type
			})
		}
	}), {
		instanceOf: errors.SyncNoCompatibleIntegration
	})
})

ava('.associate() should set the access token in the user card', async (test) => {
	const data = {
		'user-johndoe': {
			type: 'user',
			version: '1.0.0',
			slug: 'user-johndoe',
			data: {
				email: 'johndoe@test.com'
			}
		}
	}

	await sync.associate('helloworld', data['user-johndoe'], {
		token_type: 'Bearer',
		access_token: 'NlfY38rTt5xxa+Ehi2kV/2rA85C98iDdMF7xD9xr'
	}, {
		OAUTH_INTEGRATIONS: {
			helloworld: {}
		},
		upsertElement: async (type, object, options) => {
			data[object.slug] = Object.assign({}, object, {
				type
			})
		}
	})

	test.deepEqual(data['user-johndoe'], {
		type: 'user',
		version: '1.0.0',
		slug: 'user-johndoe',
		data: {
			email: 'johndoe@test.com',
			oauth: {
				helloworld: {
					token_type: 'Bearer',
					access_token: 'NlfY38rTt5xxa+Ehi2kV/2rA85C98iDdMF7xD9xr'
				}
			}
		}
	})
})

ava('.associate() should not replace other integrations', async (test) => {
	const data = {
		'user-johndoe': {
			type: 'user',
			version: '1.0.0',
			slug: 'user-johndoe',
			data: {
				email: 'johndoe@test.com',
				oauth: {
					'other-integration': {
						token_type: 'Bearer',
						access_token: 'HjShbdbsd+Ehi2kV/723ib4njksndrtv'
					}
				}
			}
		}
	}

	await sync.associate('helloworld', data['user-johndoe'], {
		token_type: 'Bearer',
		access_token: 'NlfY38rTt5xxa+Ehi2kV/2rA85C98iDdMF7xD9xr'
	}, {
		OAUTH_INTEGRATIONS: {
			helloworld: {}
		},
		upsertElement: async (type, object, options) => {
			data[object.slug] = Object.assign({}, object, {
				type
			})
		}
	})

	test.deepEqual(data['user-johndoe'], {
		type: 'user',
		version: '1.0.0',
		slug: 'user-johndoe',
		data: {
			email: 'johndoe@test.com',
			oauth: {
				'other-integration': {
					token_type: 'Bearer',
					access_token: 'HjShbdbsd+Ehi2kV/723ib4njksndrtv'
				},
				helloworld: {
					token_type: 'Bearer',
					access_token: 'NlfY38rTt5xxa+Ehi2kV/2rA85C98iDdMF7xD9xr'
				}
			}
		}
	})
})

ava('.associate() should replace previous integration data', async (test) => {
	const data = {
		'user-johndoe': {
			type: 'user',
			version: '1.0.0',
			slug: 'user-johndoe',
			data: {
				email: 'johndoe@test.com',
				oauth: {
					helloworld: {
						token_type: 'Bearer',
						access_token: 'HjShbdbsd+Ehi2kV/723ib4njksndrtv'
					}
				}
			}
		}
	}

	await sync.associate('helloworld', data['user-johndoe'], {
		token_type: 'Bearer',
		access_token: 'NlfY38rTt5xxa+Ehi2kV/2rA85C98iDdMF7xD9xr'
	}, {
		OAUTH_INTEGRATIONS: {
			helloworld: {}
		},
		upsertElement: async (type, object, options) => {
			data[object.slug] = Object.assign({}, object, {
				type
			})
		}
	})

	test.deepEqual(data['user-johndoe'], {
		type: 'user',
		version: '1.0.0',
		slug: 'user-johndoe',
		data: {
			email: 'johndoe@test.com',
			oauth: {
				helloworld: {
					token_type: 'Bearer',
					access_token: 'NlfY38rTt5xxa+Ehi2kV/2rA85C98iDdMF7xD9xr'
				}
			}
		}
	})
})
