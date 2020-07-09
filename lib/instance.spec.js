/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

/* eslint no-unused-vars: [2, { "args": "none" }] */

require('dotenv').config()
const ava = require('ava')
const Bluebird = require('bluebird')
const querystring = require('querystring')
const _ = require('lodash')
const nock = require('nock')
const instance = require('./instance')
const errors = require('./errors')

const firstNock = () => {
	nock.disableNetConnect()

	nock('https://api.balena-cloud.com')
		.post('/oauth/token')
		.reply((uri, request, callback) => {
			const body = querystring.decode(request)

			if (_.isEqual(body, {
				grant_type: 'refresh_token',
				client_id: '1T+8uJdHUEzAHz5Z84+tg3HtipfEbzdsXbMmWAnI',
				client_secret: '7Fj+Rf1p/fgXTLR505noNwoq7btJaY8KLyIJWE/r',
				redirect_uri: 'https://jel.ly.fish/oauth/balena-cloud',
				refresh_token: 'POolsdYTlmM2YxOTQ5MGE3YmNmMDFkNTVk'
			})) {
				return callback(null, [ 200, {
					access_token: 'xgrdUPAZ+nZfz91uxB4Qhv1oDpDp1oQh',
					token_type: 'bearer',
					expires_in: 3600,
					refresh_token: 'hQLGLkzZJ4ft3GLP63Z/ruA8o5YeJNsk3I',
					scope: 'users'
				} ])
			}

			return callback(null, [ 400, {
				error: 'invalid_request',
				error_description: 'Something went wrong'
			} ])
		})
		.persist()
		.get('/users/41')
		.reply(function (uri, request, callback) {
			if (this.req.headers.authorization ===
				'Bearer xgrdUPAZ+nZfz91uxB4Qhv1oDpDp1oQh') {
				return callback(null, [ 200, {
					id: 41,
					name: 'johndoe'
				} ])
			}

			return callback(null, [ 401, 'Invalid access token' ])
		})
}

const secondNock = () => {
	nock.disableNetConnect()

	nock('https://api.balena-cloud.com')
		.get('/users/41')
		.reply(function (uri, request, callback) {
			if (this.req.headers.authorization ===
				'Bearer KSTWMqidua67hjM2NDE1ZTZjNGZmZjI3') {
				return callback(null, [ 200, {
					id: 41,
					name: 'johndoe'
				} ])
			}

			return callback(null, [ 401, 'Invalid access token' ])
		})
}

ava.beforeEach(() => {
	nock.cleanAll()
})

ava.after(() => {
	nock.cleanAll()
})

class OAuthTokenRefreshTestIntegration {
	constructor (options) {
		this.options = options
		this.context = this.options.context
	}

	// eslint-disable-next-line class-methods-use-this
	async initialize () {
		return Bluebird.resolve()
	}

	// eslint-disable-next-line class-methods-use-this
	async destroy () {
		return Bluebird.resolve()
	}

	async translate (event, options) {
		const result = await this.context.request(options.actor, {
			method: 'GET',
			baseUrl: 'https://api.balena-cloud.com',
			json: true,
			uri: '/users/41'
		})

		return [ result ]
	}
}

OAuthTokenRefreshTestIntegration.OAUTH_BASE_URL = 'https://api.balena-cloud.com'
OAuthTokenRefreshTestIntegration.OAUTH_SCOPES = [ 'users' ]

const getElementBySlugFromCollection = async (data, slug) => {
	const [ base, version ] = slug.split('@')

	if (version !== 'latest') {
		return _.find(_.values(data), {
			slug: base,
			version
		})
	}

	return _.last(_.sortBy(_.filter(_.values(data), {
		slug: base
	}), [ 'version' ]))
}

ava.serial('should be able to refresh an expired OAuth token and retry if needed', async (test) => {
	firstNock()
	const data = {
		'b5fc8487-cd6b-46aa-84ec-2407d5989e92': {
			id: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
			version: '1.0.0',
			type: 'user',
			slug: 'user-synctest',
			data: {
				oauth: {
					'balena-cloud': {
						access_token: 'KSTWMqidua67hjM2NDE1ZTZjNGZmZjI3',
						token_type: 'bearer',
						expires_in: 3600,
						refresh_token: 'POolsdYTlmM2YxOTQ5MGE3YmNmMDFkNTVk',
						scope: 'users'
					}
				}
			}
		}
	}

	const result = await instance.run(OAuthTokenRefreshTestIntegration, {
		appId: '1T+8uJdHUEzAHz5Z84+tg3HtipfEbzdsXbMmWAnI',
		appSecret: '7Fj+Rf1p/fgXTLR505noNwoq7btJaY8KLyIJWE/r'
	}, (object) => {
		return object.translate(null, {
			actor: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92'
		})
	}, {
		origin: 'https://jel.ly.fish/oauth/balena-cloud',
		provider: 'balena-cloud',
		context: {
			log: {
				info: _.noop,
				warn: _.noop
			},
			getElementById: async (id) => {
				return data[id]
			},
			upsertElement: async (type, object) => {
				data[object.id] = object
				data[object.id].type = type
				return data[object.id]
			}
		}
	})

	test.deepEqual(result, [
		{
			code: 200,
			body: {
				id: 41,
				name: 'johndoe'
			}
		}
	])

	test.deepEqual(data, {
		'b5fc8487-cd6b-46aa-84ec-2407d5989e92': {
			id: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
			type: 'user',
			slug: 'user-synctest',
			version: '1.0.0',
			data: {
				oauth: {
					'balena-cloud': {
						access_token: 'xgrdUPAZ+nZfz91uxB4Qhv1oDpDp1oQh',
						token_type: 'bearer',
						expires_in: 3600,
						refresh_token: 'hQLGLkzZJ4ft3GLP63Z/ruA8o5YeJNsk3I',
						scope: 'users'
					}
				}
			}
		}
	})
})

ava.serial('should be able to refresh an expired OAuth token and retry if needed using the default user', async (test) => {
	firstNock()
	const data = {
		'b5fc8487-cd6b-46aa-84ec-2407d5989e92': {
			id: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
			type: 'user',
			slug: 'user-synctest',
			version: '1.0.0',
			data: {}
		},
		'ecc47582-bc08-45dc-ac8b-16072a843835': {
			id: 'ecc47582-bc08-45dc-ac8b-16072a843835',
			type: 'user',
			slug: 'user-jellysync',
			version: '1.0.0',
			data: {
				oauth: {
					'balena-cloud': {
						access_token: 'KSTWMqidua67hjM2NDE1ZTZjNGZmZjI3',
						token_type: 'bearer',
						expires_in: 3600,
						refresh_token: 'POolsdYTlmM2YxOTQ5MGE3YmNmMDFkNTVk',
						scope: 'users'
					}
				}
			}
		}
	}

	const result = await instance.run(OAuthTokenRefreshTestIntegration, {
		appId: '1T+8uJdHUEzAHz5Z84+tg3HtipfEbzdsXbMmWAnI',
		appSecret: '7Fj+Rf1p/fgXTLR505noNwoq7btJaY8KLyIJWE/r'
	}, (object) => {
		return object.translate(null, {
			actor: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92'
		})
	}, {
		origin: 'https://jel.ly.fish/oauth/balena-cloud',
		defaultUser: 'jellysync',
		provider: 'balena-cloud',
		context: {
			log: {
				info: _.noop,
				warn: _.noop
			},
			getElementBySlug: async (slug) => {
				return getElementBySlugFromCollection(data, slug)
			},
			getElementById: async (id) => {
				return data[id]
			},
			upsertElement: async (type, object) => {
				data[object.id] = object
				data[object.id].type = type
				return data[object.id]
			}
		}
	})

	test.deepEqual(result, [
		{
			code: 200,
			body: {
				id: 41,
				name: 'johndoe'
			}
		}
	])

	test.deepEqual(data, {
		'b5fc8487-cd6b-46aa-84ec-2407d5989e92': {
			id: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
			type: 'user',
			slug: 'user-synctest',
			version: '1.0.0',
			data: {}
		},
		'ecc47582-bc08-45dc-ac8b-16072a843835': {
			id: 'ecc47582-bc08-45dc-ac8b-16072a843835',
			type: 'user',
			slug: 'user-jellysync',
			version: '1.0.0',
			data: {
				oauth: {
					'balena-cloud': {
						access_token: 'xgrdUPAZ+nZfz91uxB4Qhv1oDpDp1oQh',
						token_type: 'bearer',
						expires_in: 3600,
						refresh_token: 'hQLGLkzZJ4ft3GLP63Z/ruA8o5YeJNsk3I',
						scope: 'users'
					}
				}
			}
		}
	})
})

ava.serial('should not refresh an OAuth token if not needed', async (test) => {
	secondNock()
	const data = {
		'b5fc8487-cd6b-46aa-84ec-2407d5989e92': {
			id: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
			type: 'user',
			slug: 'user-synctest',
			version: '1.0.0',
			data: {
				oauth: {
					'balena-cloud': {
						access_token: 'KSTWMqidua67hjM2NDE1ZTZjNGZmZjI3',
						token_type: 'bearer',
						expires_in: 3600,
						refresh_token: 'POolsdYTlmM2YxOTQ5MGE3YmNmMDFkNTVk',
						scope: 'users'
					}
				}
			}
		}
	}

	/*
	Nock.cleanAll()
	nock.disableNetConnect()

	nock('https://api.balena-cloud.com')
		.get('/users/41')
		.reply(function (uri, request, callback) {
			if (this.req.headers.authorization ===
				'Bearer KSTWMqidua67hjM2NDE1ZTZjNGZmZjI3') {
				return callback(null, [ 200, {
					id: 41,
					name: 'johndoe'
				} ])
			}

			return callback(null, [ 401, 'Invalid access token' ])
		})
		*/

	const result = await instance.run(OAuthTokenRefreshTestIntegration, {
		appId: '1T+8uJdHUEzAHz5Z84+tg3HtipfEbzdsXbMmWAnI',
		appSecret: '7Fj+Rf1p/fgXTLR505noNwoq7btJaY8KLyIJWE/r'
	}, (object) => {
		return object.translate(null, {
			actor: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92'
		})
	}, {
		origin: 'https://jel.ly.fish/oauth/balena-cloud',
		provider: 'balena-cloud',
		context: {
			log: {
				info: _.noop,
				warn: _.noop
			},
			getElementById: async (id) => {
				return data[id]
			},
			upsertElement: async (type, object) => {
				data[object.id] = object
				data[object.id].type = type
				return data[object.id]
			}
		}
	})

	test.deepEqual(result, [
		{
			code: 200,
			body: {
				id: 41,
				name: 'johndoe'
			}
		}
	])

	test.deepEqual(data, {
		'b5fc8487-cd6b-46aa-84ec-2407d5989e92': {
			id: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
			type: 'user',
			slug: 'user-synctest',
			version: '1.0.0',
			data: {
				oauth: {
					'balena-cloud': {
						access_token: 'KSTWMqidua67hjM2NDE1ZTZjNGZmZjI3',
						token_type: 'bearer',
						expires_in: 3600,
						refresh_token: 'POolsdYTlmM2YxOTQ5MGE3YmNmMDFkNTVk',
						scope: 'users'
					}
				}
			}
		}
	})
})

ava.serial('should not refresh an OAuth token if not needed when using the default user', async (test) => {
	secondNock()
	const data = {
		'b5fc8487-cd6b-46aa-84ec-2407d5989e92': {
			id: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
			type: 'user',
			slug: 'user-synctest',
			version: '1.0.0',
			data: {}
		},
		'ecc47582-bc08-45dc-ac8b-16072a843835': {
			id: 'ecc47582-bc08-45dc-ac8b-16072a843835',
			type: 'user',
			slug: 'user-jellysync',
			version: '1.0.0',
			data: {
				oauth: {
					'balena-cloud': {
						access_token: 'KSTWMqidua67hjM2NDE1ZTZjNGZmZjI3',
						token_type: 'bearer',
						expires_in: 3600,
						refresh_token: 'POolsdYTlmM2YxOTQ5MGE3YmNmMDFkNTVk',
						scope: 'users'
					}
				}
			}
		}
	}

	const result = await instance.run(OAuthTokenRefreshTestIntegration, {
		appId: '1T+8uJdHUEzAHz5Z84+tg3HtipfEbzdsXbMmWAnI',
		appSecret: '7Fj+Rf1p/fgXTLR505noNwoq7btJaY8KLyIJWE/r'
	}, (object) => {
		return object.translate(null, {
			actor: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92'
		})
	}, {
		origin: 'https://jel.ly.fish/oauth/balena-cloud',
		defaultUser: 'jellysync',
		provider: 'balena-cloud',
		context: {
			log: {
				info: _.noop,
				warn: _.noop
			},
			getElementBySlug: async (slug) => {
				return getElementBySlugFromCollection(data, slug)
			},
			getElementById: async (id) => {
				return data[id]
			},
			upsertElement: async (type, object) => {
				data[object.id] = object
				data[object.id].type = type
				return data[object.id]
			}
		}
	})

	test.deepEqual(result, [
		{
			code: 200,
			body: {
				id: 41,
				name: 'johndoe'
			}
		}
	])

	test.deepEqual(data, {
		'b5fc8487-cd6b-46aa-84ec-2407d5989e92': {
			id: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
			type: 'user',
			slug: 'user-synctest',
			version: '1.0.0',
			data: {}
		},
		'ecc47582-bc08-45dc-ac8b-16072a843835': {
			id: 'ecc47582-bc08-45dc-ac8b-16072a843835',
			type: 'user',
			slug: 'user-jellysync',
			version: '1.0.0',
			data: {
				oauth: {
					'balena-cloud': {
						access_token: 'KSTWMqidua67hjM2NDE1ZTZjNGZmZjI3',
						token_type: 'bearer',
						expires_in: 3600,
						refresh_token: 'POolsdYTlmM2YxOTQ5MGE3YmNmMDFkNTVk',
						scope: 'users'
					}
				}
			}
		}
	})
})

ava.serial('should throw if actor is not associated with service and there is no default user', async (test) => {
	firstNock()
	const data = {
		'b5fc8487-cd6b-46aa-84ec-2407d5989e92': {
			id: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
			type: 'user',
			slug: 'user-synctest',
			version: '1.0.0',
			data: {}
		}
	}

	await test.throwsAsync(instance.run(OAuthTokenRefreshTestIntegration, {
		appId: '1T+8uJdHUEzAHz5Z84+tg3HtipfEbzdsXbMmWAnI',
		appSecret: '7Fj+Rf1p/fgXTLR505noNwoq7btJaY8KLyIJWE/r'
	}, (object) => {
		return object.translate(null, {
			actor: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92'
		})
	}, {
		origin: 'https://jel.ly.fish/oauth/balena-cloud',
		provider: 'balena-cloud',
		context: {
			log: {
				info: _.noop,
				warn: _.noop
			},
			getElementBySlug: async (slug) => {
				return getElementBySlugFromCollection(data, slug)
			},
			getElementById: async (id) => {
				return data[id]
			},
			upsertElement: async (type, object) => {
				data[object.id] = object
				data[object.id].type = type
				return data[object.id]
			}
		}
	}), {
		instanceOf: errors.SyncOAuthNoUserError
	})
})

ava.serial('should throw if actor is not associated with service and the default user is invalid', async (test) => {
	firstNock()
	const data = {
		'b5fc8487-cd6b-46aa-84ec-2407d5989e92': {
			id: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
			type: 'user',
			slug: 'user-synctest',
			version: '1.0.0',
			data: {}
		}
	}

	await test.throwsAsync(instance.run(OAuthTokenRefreshTestIntegration, {
		appId: '1T+8uJdHUEzAHz5Z84+tg3HtipfEbzdsXbMmWAnI',
		appSecret: '7Fj+Rf1p/fgXTLR505noNwoq7btJaY8KLyIJWE/r'
	}, (object) => {
		return object.translate(null, {
			actor: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92'
		})
	}, {
		origin: 'https://jel.ly.fish/oauth/balena-cloud',
		provider: 'balena-cloud',
		defaultUser: 'foobar',
		context: {
			log: {
				info: _.noop,
				warn: _.noop
			},
			getElementBySlug: async (slug) => {
				return getElementBySlugFromCollection(data, slug)
			},
			getElementById: async (id) => {
				return data[id]
			},
			upsertElement: async (type, object) => {
				data[object.id] = object
				data[object.id].type = type
				return data[object.id]
			}
		}
	}), {
		instanceOf: errors.SyncNoActor
	})
})

ava.serial('should throw if neither the actor nor the default user are associated with the service', async (test) => {
	firstNock()
	const data = {
		'b5fc8487-cd6b-46aa-84ec-2407d5989e92': {
			id: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
			type: 'user',
			slug: 'user-synctest',
			version: '1.0.0',
			data: {}
		},
		'ecc47582-bc08-45dc-ac8b-16072a843835': {
			id: 'ecc47582-bc08-45dc-ac8b-16072a843835',
			type: 'user',
			slug: 'user-jellysync',
			version: '1.0.0',
			data: {}
		}
	}

	await test.throwsAsync(instance.run(OAuthTokenRefreshTestIntegration, {
		appId: '1T+8uJdHUEzAHz5Z84+tg3HtipfEbzdsXbMmWAnI',
		appSecret: '7Fj+Rf1p/fgXTLR505noNwoq7btJaY8KLyIJWE/r'
	}, (object) => {
		return object.translate(null, {
			actor: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92'
		})
	}, {
		origin: 'https://jel.ly.fish/oauth/balena-cloud',
		provider: 'balena-cloud',
		defaultUser: 'jellysync',
		context: {
			log: {
				info: _.noop,
				warn: _.noop
			},
			getElementBySlug: async (slug) => {
				return getElementBySlugFromCollection(data, slug)
			},
			getElementById: async (id) => {
				return data[id]
			},
			upsertElement: async (type, object) => {
				data[object.id] = object
				data[object.id].type = type
				return data[object.id]
			}
		}
	}), {
		instanceOf: errors.SyncOAuthNoUserError
	})
})
