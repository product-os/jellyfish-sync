/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

require('dotenv').config()
const ava = require('ava')
const Sync = require('./index').Sync
const errors = require('./errors')

const sync = new Sync({
	integrations: {}
})

ava('.isValidEvent() should return false for an unknown integration', async (test) => {
	const result = await sync.isValidEvent('helloworld', null, {
		headers: {},
		raw: '....'
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
