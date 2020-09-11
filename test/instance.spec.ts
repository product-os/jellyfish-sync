/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

require('dotenv').config();
import * as _ from 'lodash';
import * as nock from 'nock';
const Bluebird = require('bluebird');
const querystring = require('querystring');
const instance = require('../lib/instance');
const errors = require('../lib/errors');

const firstNock = () => {
	nock.disableNetConnect();

	nock('https://api.balena-cloud.com')
		.post('/oauth/token')
		.reply((_uri, request, callback) => {
			const body = querystring.decode(request);

			if (
				_.isEqual(body, {
					grant_type: 'refresh_token',
					client_id: '1T+8uJdHUEzAHz5Z84+tg3HtipfEbzdsXbMmWAnI',
					client_secret: '7Fj+Rf1p/fgXTLR505noNwoq7btJaY8KLyIJWE/r',
					redirect_uri: 'https://jel.ly.fish/oauth/balena-cloud',
					refresh_token: 'POolsdYTlmM2YxOTQ5MGE3YmNmMDFkNTVk',
				})
			) {
				return callback(null, [
					200,
					{
						access_token: 'xgrdUPAZ+nZfz91uxB4Qhv1oDpDp1oQh',
						token_type: 'bearer',
						expires_in: 3600,
						refresh_token: 'hQLGLkzZJ4ft3GLP63Z/ruA8o5YeJNsk3I',
						scope: 'users',
					},
				]);
			}

			return callback(null, [
				400,
				{
					error: 'invalid_request',
					error_description: 'Something went wrong',
				},
			]);
		})
		.persist()
		.get('/users/41')
		.reply(function (_uri, _request, callback) {
			if (
				this.req.headers.authorization ===
				'Bearer xgrdUPAZ+nZfz91uxB4Qhv1oDpDp1oQh'
			) {
				return callback(null, [
					200,
					{
						id: 41,
						name: 'johndoe',
					},
				]);
			}

			return callback(null, [401, 'Invalid access token']);
		});
};

const secondNock = () => {
	nock.disableNetConnect();

	nock('https://api.balena-cloud.com')
		.get('/users/41')
		.reply(function (_uri, _request, callback) {
			if (
				this.req.headers.authorization ===
				'Bearer KSTWMqidua67hjM2NDE1ZTZjNGZmZjI3'
			) {
				return callback(null, [
					200,
					{
						id: 41,
						name: 'johndoe',
					},
				]);
			}

			return callback(null, [401, 'Invalid access token']);
		});
};

beforeEach(() => {
	nock.cleanAll();
});

afterAll(() => {
	nock.cleanAll();
});

const OAuthTokenRefreshTestIntegration = {
	create(options: any) {
		const context = options.context;

		return {
			initialize: async () => {
				return Bluebird.resolve();
			},
			destroy: async () => {
				return Bluebird.resolve();
			},
			translate: async (_event: any, options: { actor: any }) => {
				const result = await context.request(options.actor, {
					method: 'GET',
					baseUrl: 'https://api.balena-cloud.com',
					json: true,
					uri: '/users/41',
				});

				return [result];
			},
		};
	},
	OAUTH_BASE_URL: 'https://api.balena-cloud.com',
	OAUTH_SCOPES: ['users'],
};

const getElementBySlugFromCollection = async (data: any, slug: string) => {
	const [base, version] = slug.split('@');

	if (version !== 'latest') {
		return _.find(_.values(data), {
			slug: base,
			version,
		});
	}

	return _.last(
		_.sortBy(
			_.filter(_.values(data), {
				slug: base,
			}),
			['version'],
		),
	);
};

test('should be able to refresh an expired OAuth token and retry if needed', async () => {
	firstNock();
	const data: any = {
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
						scope: 'users',
					},
				},
			},
		},
	};

	const result = await instance.run(
		OAuthTokenRefreshTestIntegration,
		{
			appId: '1T+8uJdHUEzAHz5Z84+tg3HtipfEbzdsXbMmWAnI',
			appSecret: '7Fj+Rf1p/fgXTLR505noNwoq7btJaY8KLyIJWE/r',
		},
		(object: { translate: (arg0: any, arg1: { actor: string }) => any }) => {
			return object.translate(null, {
				actor: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
			});
		},
		{
			origin: 'https://jel.ly.fish/oauth/balena-cloud',
			provider: 'balena-cloud',
			context: {
				log: {
					info: _.noop,
					warn: _.noop,
				},
				getElementById: async (id: string) => {
					return data[id];
				},
				upsertElement: async (type: any, object: { id: string }) => {
					data[object.id] = object;
					data[object.id].type = type;
					return data[object.id];
				},
			},
		},
	);

	expect(result).toEqual([
		{
			code: 200,
			body: {
				id: 41,
				name: 'johndoe',
			},
		},
	]);

	expect(data).toEqual({
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
						scope: 'users',
					},
				},
			},
		},
	});
});

test('should be able to refresh an expired OAuth token and retry if needed using the default user', async () => {
	firstNock();
	const data: any = {
		'b5fc8487-cd6b-46aa-84ec-2407d5989e92': {
			id: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
			type: 'user',
			slug: 'user-synctest',
			version: '1.0.0',
			data: {},
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
						scope: 'users',
					},
				},
			},
		},
	};

	const result = await instance.run(
		OAuthTokenRefreshTestIntegration,
		{
			appId: '1T+8uJdHUEzAHz5Z84+tg3HtipfEbzdsXbMmWAnI',
			appSecret: '7Fj+Rf1p/fgXTLR505noNwoq7btJaY8KLyIJWE/r',
		},
		(object: { translate: (arg0: any, arg1: { actor: string }) => any }) => {
			return object.translate(null, {
				actor: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
			});
		},
		{
			origin: 'https://jel.ly.fish/oauth/balena-cloud',
			defaultUser: 'jellysync',
			provider: 'balena-cloud',
			context: {
				log: {
					info: _.noop,
					warn: _.noop,
				},
				getElementBySlug: async (slug: string) => {
					return getElementBySlugFromCollection(data, slug);
				},
				getElementById: async (id: string) => {
					return data[id];
				},
				upsertElement: async (type: any, object: { id: string }) => {
					data[object.id] = object;
					data[object.id].type = type;
					return data[object.id];
				},
			},
		},
	);

	expect(result).toEqual([
		{
			code: 200,
			body: {
				id: 41,
				name: 'johndoe',
			},
		},
	]);

	expect(data).toEqual({
		'b5fc8487-cd6b-46aa-84ec-2407d5989e92': {
			id: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
			type: 'user',
			slug: 'user-synctest',
			version: '1.0.0',
			data: {},
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
						scope: 'users',
					},
				},
			},
		},
	});
});

test('should not refresh an OAuth token if not needed', async () => {
	secondNock();
	const data: any = {
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
						scope: 'users',
					},
				},
			},
		},
	};

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

	const result = await instance.run(
		OAuthTokenRefreshTestIntegration,
		{
			appId: '1T+8uJdHUEzAHz5Z84+tg3HtipfEbzdsXbMmWAnI',
			appSecret: '7Fj+Rf1p/fgXTLR505noNwoq7btJaY8KLyIJWE/r',
		},
		(object: { translate: (arg0: any, arg1: { actor: string }) => any }) => {
			return object.translate(null, {
				actor: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
			});
		},
		{
			origin: 'https://jel.ly.fish/oauth/balena-cloud',
			provider: 'balena-cloud',
			context: {
				log: {
					info: _.noop,
					warn: _.noop,
				},
				getElementById: async (id: string) => {
					return data[id];
				},
				upsertElement: async (type: any, object: { id: string }) => {
					data[object.id] = object;
					data[object.id].type = type;
					return data[object.id];
				},
			},
		},
	);

	expect(result).toEqual([
		{
			code: 200,
			body: {
				id: 41,
				name: 'johndoe',
			},
		},
	]);

	expect(data).toEqual({
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
						scope: 'users',
					},
				},
			},
		},
	});
});

test('should not refresh an OAuth token if not needed when using the default user', async () => {
	secondNock();
	const data: any = {
		'b5fc8487-cd6b-46aa-84ec-2407d5989e92': {
			id: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
			type: 'user',
			slug: 'user-synctest',
			version: '1.0.0',
			data: {},
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
						scope: 'users',
					},
				},
			},
		},
	};

	const result = await instance.run(
		OAuthTokenRefreshTestIntegration,
		{
			appId: '1T+8uJdHUEzAHz5Z84+tg3HtipfEbzdsXbMmWAnI',
			appSecret: '7Fj+Rf1p/fgXTLR505noNwoq7btJaY8KLyIJWE/r',
		},
		(object: { translate: (arg0: any, arg1: { actor: string }) => any }) => {
			return object.translate(null, {
				actor: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
			});
		},
		{
			origin: 'https://jel.ly.fish/oauth/balena-cloud',
			defaultUser: 'jellysync',
			provider: 'balena-cloud',
			context: {
				log: {
					info: _.noop,
					warn: _.noop,
				},
				getElementBySlug: async (slug: string) => {
					return getElementBySlugFromCollection(data, slug);
				},
				getElementById: async (id: string) => {
					return data[id];
				},
				upsertElement: async (type: any, object: { id: string }) => {
					data[object.id] = object;
					data[object.id].type = type;
					return data[object.id];
				},
			},
		},
	);

	expect(result).toEqual([
		{
			code: 200,
			body: {
				id: 41,
				name: 'johndoe',
			},
		},
	]);

	expect(data).toEqual({
		'b5fc8487-cd6b-46aa-84ec-2407d5989e92': {
			id: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
			type: 'user',
			slug: 'user-synctest',
			version: '1.0.0',
			data: {},
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
						scope: 'users',
					},
				},
			},
		},
	});
});

test('should throw if actor is not associated with service and there is no default user', async () => {
	firstNock();
	const data: any = {
		'b5fc8487-cd6b-46aa-84ec-2407d5989e92': {
			id: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
			type: 'user',
			slug: 'user-synctest',
			version: '1.0.0',
			data: {},
		},
	};

	await expect(
		instance.run(
			OAuthTokenRefreshTestIntegration,
			{
				appId: '1T+8uJdHUEzAHz5Z84+tg3HtipfEbzdsXbMmWAnI',
				appSecret: '7Fj+Rf1p/fgXTLR505noNwoq7btJaY8KLyIJWE/r',
			},
			(object: { translate: (arg0: any, arg1: { actor: string }) => any }) => {
				return object.translate(null, {
					actor: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
				});
			},
			{
				origin: 'https://jel.ly.fish/oauth/balena-cloud',
				provider: 'balena-cloud',
				context: {
					log: {
						info: _.noop,
						warn: _.noop,
					},
					getElementBySlug: async (slug: string) => {
						return getElementBySlugFromCollection(data, slug);
					},
					getElementById: async (id: string) => {
						return data[id];
					},
					upsertElement: async (type: any, object: { id: string }) => {
						data[object.id] = object;
						data[object.id].type = type;
						return data[object.id];
					},
				},
			},
		),
	).rejects.toThrow(errors.SyncOAuthNoUserError);
});

test('should throw if actor is not associated with service and the default user is invalid', async () => {
	firstNock();
	const data: any = {
		'b5fc8487-cd6b-46aa-84ec-2407d5989e92': {
			id: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
			type: 'user',
			slug: 'user-synctest',
			version: '1.0.0',
			data: {},
		},
	};

	await expect(
		instance.run(
			OAuthTokenRefreshTestIntegration,
			{
				appId: '1T+8uJdHUEzAHz5Z84+tg3HtipfEbzdsXbMmWAnI',
				appSecret: '7Fj+Rf1p/fgXTLR505noNwoq7btJaY8KLyIJWE/r',
			},
			(object: { translate: (arg0: any, arg1: { actor: string }) => any }) => {
				return object.translate(null, {
					actor: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
				});
			},
			{
				origin: 'https://jel.ly.fish/oauth/balena-cloud',
				provider: 'balena-cloud',
				defaultUser: 'foobar',
				context: {
					log: {
						info: _.noop,
						warn: _.noop,
					},
					getElementBySlug: async (slug: any) => {
						return getElementBySlugFromCollection(data, slug);
					},
					getElementById: async (id: string | number) => {
						return data[id];
					},
					upsertElement: async (type: any, object: { id: string | number }) => {
						data[object.id] = object;
						data[object.id].type = type;
						return data[object.id];
					},
				},
			},
		),
	).rejects.toThrow(errors.SyncNoActor);
});

test('should throw if neither the actor nor the default user are associated with the service', async () => {
	firstNock();
	const data: any = {
		'b5fc8487-cd6b-46aa-84ec-2407d5989e92': {
			id: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
			type: 'user',
			slug: 'user-synctest',
			version: '1.0.0',
			data: {},
		},
		'ecc47582-bc08-45dc-ac8b-16072a843835': {
			id: 'ecc47582-bc08-45dc-ac8b-16072a843835',
			type: 'user',
			slug: 'user-jellysync',
			version: '1.0.0',
			data: {},
		},
	};

	await expect(
		instance.run(
			OAuthTokenRefreshTestIntegration,
			{
				appId: '1T+8uJdHUEzAHz5Z84+tg3HtipfEbzdsXbMmWAnI',
				appSecret: '7Fj+Rf1p/fgXTLR505noNwoq7btJaY8KLyIJWE/r',
			},
			(object: { translate: (arg0: any, arg1: { actor: string }) => any }) => {
				return object.translate(null, {
					actor: 'b5fc8487-cd6b-46aa-84ec-2407d5989e92',
				});
			},
			{
				origin: 'https://jel.ly.fish/oauth/balena-cloud',
				provider: 'balena-cloud',
				defaultUser: 'jellysync',
				context: {
					log: {
						info: _.noop,
						warn: _.noop,
					},
					getElementBySlug: async (slug: string) => {
						return getElementBySlugFromCollection(data, slug);
					},
					getElementById: async (id: string) => {
						return data[id];
					},
					upsertElement: async (type: string, object: { id: string }) => {
						data[object.id] = object;
						data[object.id].type = type;
						return data[object.id];
					},
				},
			},
		),
	).rejects.toThrow(errors.SyncOAuthNoUserError);
});
