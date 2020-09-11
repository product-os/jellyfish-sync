/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

require('dotenv').config();
import * as _ from 'lodash';
import * as nock from 'nock';
import * as randomstring from 'randomstring';
import * as querystring from 'querystring';
import * as jws from 'jsonwebtoken';
import * as jose from 'node-jose';
import * as sync from '../lib/index';
import * as oauth from '../lib/oauth';
import * as outreach from '../lib/integrations/outreach';
import * as errors from '../lib/errors';

test.only('.isValidEvent() should return true for Front given anything', async () => {
	const result = await sync.isValidEvent(
		'front',
		{
			api: 'xxxxxxx',
		},
		{
			headers: {},
			raw: '....',
		},
	);

	expect(result).toBe(true);
});

test('.isValidEvent() should return false for an unknown integration', async () => {
	const result = await sync.isValidEvent('helloworld', null, {
		headers: {},
		raw: '....',
	});

	expect(result).toBe(false);
});

test('.isValidEvent() should return false given GitHub and no signature header', async () => {
	const result = await sync.isValidEvent(
		'github',
		{
			api: 'xxxxx',
			signature: 'secret',
		},
		{
			headers: {},
			raw: '....',
		},
	);

	expect(result).toBe(false);
});

test('.isValidEvent() should return false given GitHub and a signature but no key', async () => {
	const result = await sync.isValidEvent('github', null, {
		raw: '....',
		headers: {
			'x-hub-signature': 'sha1=aaaabbbbcccc',
		},
	});

	expect(result).toBe(false);
});

test('.isValidEvent() should return false given GitHub and a signature mismatch', async () => {
	const result = await sync.isValidEvent(
		'github',
		{
			api: 'xxxxx',
			signature: 'secret',
		},
		{
			raw: '{"foo":"bar"}',
			headers: {
				'x-hub-signature': 'sha1=foobarbaz',
			},
		},
	);

	expect(result).toBe(false);
});

test('.isValidEvent() should return true given GitHub and a signature match', async () => {
	const result = await sync.isValidEvent(
		'github',
		{
			api: 'xxxxx',
			signature: 'secret',
		},
		{
			raw: '{"foo":"bar"}',
			headers: {
				'x-hub-signature': 'sha1=52b582138706ac0c597c315cfc1a1bf177408a4d',
			},
		},
	);

	expect(result).toBe(true);
});

test('.isValidEvent() should return true given Discourse and no signature header', async () => {
	const result = await sync.isValidEvent(
		'discourse',
		{
			api: 'xxxxx',
			signature: 'secret',
		},
		{
			raw: '....',
			headers: {},
		},
	);

	expect(result).toBe(true);
});

test('.isValidEvent() should return false given Discourse and a signature but no key', async () => {
	const result = await sync.isValidEvent('discourse', null, {
		raw: '....',
		headers: {
			'x-discourse-event-signature': 'sha256=aaaabbbbcccc',
		},
	});

	expect(result).toBe(false);
});

test('.isValidEvent() should return false given Discourse and a signature mismatch', async () => {
	const result = await sync.isValidEvent(
		'discourse',
		{
			api: 'xxxxx',
			signature: 'secret',
		},
		{
			raw: '{"foo":"bar"}',
			headers: {
				'x-discourse-event-signature': 'sha256=foobarbaz',
			},
		},
	);

	expect(result).toBe(false);
});

test('.isValidEvent() should return true given Discourse and a signature match', async () => {
	const result = await sync.isValidEvent(
		'discourse',
		{
			api: 'xxxxx',
			signature: 'secret',
		},
		{
			raw: '{"foo":"bar"}',
			headers: {
				'x-discourse-event-signature':
					'sha256=3f3ab3986b656abb17af3eb1443ed6c08ef8fff9fea83915909d1b421aec89be',
			},
		},
	);

	expect(result).toBe(true);
});

// eslint-disable-next-line max-len
const TEST_BALENA_API_PRIVATE_KEY =
	'LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1JR0hBZ0VBTUJNR0J5cUdTTTQ5QWdFR0NDcUdTTTQ5QXdFSEJHMHdhd0lCQVFRZ0lGM1M3TkNkV1MyZXJEU0YKbEcxSnBFTEZid0pNckVURUR0d3ZRMFVSUFh5aFJBTkNBQVNDR1pPcmhZTmhoY1c5YTd5OHNTNStINVFFY2tEaApGK0ZVZUV4Si9UcEtCS256RVBMNVBGNGt0L0JwZVlFNmpoQ3UvUmpjWEhXdE1DOXdRTGpQU1ZXaQotLS0tLUVORCBQUklWQVRFIEtFWS0tLS0tCg==';
// eslint-disable-next-line max-len
const TEST_BALENA_API_PUBLIC_KEY =
	'LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUZrd0V3WUhLb1pJemowQ0FRWUlLb1pJemowREFRY0RRZ0FFZ2htVHE0V0RZWVhGdld1OHZMRXVmaCtVQkhKQQo0UmZoVkhoTVNmMDZTZ1NwOHhEeStUeGVKTGZ3YVhtQk9vNFFydjBZM0Z4MXJUQXZjRUM0ejBsVm9nPT0KLS0tLS1FTkQgUFVCTElDIEtFWS0tLS0tCg==';

test('.isValidEvent() should return false given Balena API and invalid JSON', async () => {
	const result = await sync.isValidEvent(
		'balena-api',
		{
			api: 'xxxxx',
			production: {
				publicKey: TEST_BALENA_API_PUBLIC_KEY,
			},
			privateKey: TEST_BALENA_API_PRIVATE_KEY,
		},
		{
			raw: '{"foo":"bar"}',
			headers: {
				'content-type': 'application/jose',
			},
		},
	);

	expect(result).toBe(false);
});

test('.isValidEvent() should return false given Balena API and invalid payload', async () => {
	const result = await sync.isValidEvent(
		'balena-api',
		{
			api: 'xxxxx',
			production: {
				publicKey: TEST_BALENA_API_PUBLIC_KEY,
			},
			privateKey: TEST_BALENA_API_PRIVATE_KEY,
		},
		{
			raw: 'xxxxxxxxxxxxxx',
			headers: {
				'content-type': 'application/jose',
			},
		},
	);

	expect(result).toBe(false);
});

const encryptPayload = async (payload: { id: any; foo?: string }) => {
	const signedToken = jws.sign(
		{
			data: payload,
		},
		Buffer.from(TEST_BALENA_API_PRIVATE_KEY, 'base64'),
		{
			algorithm: 'ES256',
			expiresIn: 10 * 60 * 1000,
			audience: 'jellyfish',
			issuer: 'api.balena-cloud.com',
			jwtid: randomstring.generate(20),
			subject: `${payload.id}`,
		},
	);

	const keyValue = Buffer.from(TEST_BALENA_API_PUBLIC_KEY, 'base64');
	const encryptionKey = await jose.JWK.asKey(keyValue, 'pem');

	const cipher = jose.JWE.createEncrypt(
		{
			format: 'compact',
		},
		encryptionKey,
	);
	cipher.update(signedToken);

	const result = await cipher.final();
	return result;
};

test('.isValidEvent() should return true given Balena API and a key match', async () => {
	const payload = await encryptPayload({
		id: 666,
		foo: 'bar',
	});

	const result = await sync.isValidEvent(
		'balena-api',
		{
			api: 'xxxxx',
			production: {
				publicKey: TEST_BALENA_API_PUBLIC_KEY,
			},
			privateKey: TEST_BALENA_API_PRIVATE_KEY,
		},
		{
			raw: payload,
			headers: {
				'content-type': 'application/jose',
			},
		},
	);

	expect(result).toBe(true);
});

test('.isValidEvent() should return false given Balena API and no public key', async () => {
	const payload = await encryptPayload({
		id: 666,
		foo: 'bar',
	});

	const result = await sync.isValidEvent(
		'balena-api',
		{
			api: 'xxxxx',
			privateKey: TEST_BALENA_API_PRIVATE_KEY,
		},
		{
			raw: payload,
			headers: {
				'content-type': 'application/jose',
			},
		},
	);

	expect(result).toBe(false);
});

test('.isValidEvent() should return true given Balena API and no private key', async () => {
	const payload = await encryptPayload({
		id: 666,
		foo: 'bar',
	});

	const result = await sync.isValidEvent(
		'balena-api',
		{
			api: 'xxxxx',
			production: {
				publicKey: TEST_BALENA_API_PUBLIC_KEY,
			},
		},
		{
			raw: payload,
			headers: {
				'content-type': 'application/jose',
			},
		},
	);

	expect(result).toBe(false);
});

test('.getAssociateUrl() should return null given an invalid integration', () => {
	const result = sync.getAssociateUrl(
		'helloworld',
		{
			appId: 'xxxxx',
		},
		'user-jellyfish',
		{
			origin: 'https://jel.ly.fish/oauth/helloworld',
		},
	);

	expect(result).toBe(null);
});

test('.getAssociateUrl() should return null given no token', () => {
	const result = sync.getAssociateUrl('outreach', null, 'user-jellyfish', {
		origin: 'https://jel.ly.fish/oauth/outreach',
	});

	expect(result).toBe(null);
});

test('.getAssociateUrl() should return null given no appId', () => {
	const result = sync.getAssociateUrl(
		'outreach',
		{
			api: 'xxxxxx',
		} as any,
		'user-jellyfish',
		{
			origin: 'https://jel.ly.fish/oauth/outreach',
		},
	);

	expect(result).toBe(null);
});

test('.getAssociateUrl() should be able to generate an Outreach URL', () => {
	const result = sync.getAssociateUrl(
		'outreach',
		{
			appId: 'dJyXQHeh8PLKUr4gdsoUYQ8vFvqJ1D20lnFMxBLg',
		},
		'user-jellyfish',
		{
			origin: 'https://jel.ly.fish/oauth/outreach',
		},
	);

	const qs = [
		'response_type=code',
		'client_id=dJyXQHeh8PLKUr4gdsoUYQ8vFvqJ1D20lnFMxBLg',
		'redirect_uri=https%3A%2F%2Fjel.ly.fish%2Foauth%2Foutreach',
		`scope=${outreach.OAUTH_SCOPES.join('+')}`,
		'state=user-jellyfish',
	].join('&');

	expect(result).toBe(`https://api.outreach.io/oauth/authorize?${qs}`);
});

test('.OAUTH_INTEGRATIONS should be an array of strings', () => {
	expect(_.isArray(sync.OAUTH_INTEGRATIONS)).toBe(true);
	expect(_.every(sync.OAUTH_INTEGRATIONS, _.isString)).toBe(true);
});

test('.OAUTH_INTEGRATIONS should contain no duplicates', () => {
	expect(sync.OAUTH_INTEGRATIONS).toEqual(_.uniq(sync.OAUTH_INTEGRATIONS));
});

test('.OAUTH_INTEGRATIONS should contain outreach and balena-api', () => {
	expect(['balena-api', 'outreach']).toEqual(_.sortBy(sync.OAUTH_INTEGRATIONS));
});

test('.authorize() should throw given an invalid integration', async () => {
	await expect(
		sync.authorize(
			'helloworld',
			{
				appId: 'dJyXQHeh8PLKUr4gdsoUYQ8vFvqJ1D20lnFMxBLg',
				appSecret: 'NlfY38rTt5xxa+Ehi2kV/2rA85C98iDdMF7xD9xr',
			},
			{
				OAUTH_INTEGRATIONS: {},
			},
			{
				code: '12345',
				origin: 'https://jel.ly.fish/oauth/helloworld',
			},
		),
	).rejects.toThrow(errors.SyncNoCompatibleIntegration);
});

test('.authorize() should throw given no token', async () => {
	await expect(
		sync.authorize(
			'helloworld',
			null as any,
			{
				OAUTH_INTEGRATIONS: {
					helloworld: {},
				},
			},
			{
				code: '12345',
				origin: 'https://jel.ly.fish/oauth/helloworld',
			},
		),
	).rejects.toThrow(errors.SyncNoIntegrationAppCredentials);
});

test('.authorize() should throw given no appId', async () => {
	await expect(
		sync.authorize(
			'helloworld',
			{
				appSecret: 'NlfY38rTt5xxa+Ehi2kV/2rA85C98iDdMF7xD9xr',
			} as any,
			{
				OAUTH_INTEGRATIONS: {
					helloworld: {},
				},
			},
			{
				code: '12345',
				origin: 'https://jel.ly.fish/oauth/helloworld',
			},
		),
	).rejects.toThrow(errors.SyncNoIntegrationAppCredentials);
});

test('.authorize() should throw given no appSecret', async () => {
	await expect(
		sync.authorize(
			'helloworld',
			{
				appId: 'dJyXQHeh8PLKUr4gdsoUYQ8vFvqJ1D20lnFMxBLg',
			},
			{
				OAUTH_INTEGRATIONS: {
					helloworld: {},
				},
			},
			{
				code: '12345',
				origin: 'https://jel.ly.fish/oauth/helloworld',
			},
		),
	).rejects.toThrow(errors.SyncNoIntegrationAppCredentials);
});

test('.authorize() should throw given a code mismatch', async () => {
	nock.cleanAll();
	nock.disableNetConnect();

	await nock('https://api.outreach.io')
		.post('/oauth/token')
		.reply((_uri: any, request: any, callback) => {
			const body = querystring.decode(request);

			if (
				_.isEqual(body, {
					grant_type: 'authorization_code',
					client_id: 'dJyXQHeh8PLKUr4gdsoUYQ8vFvqJ1D20lnFMxBLg',
					client_secret: 'NlfY38rTt5xxa+Ehi2kV/2rA85C98iDdMF7xD9xr',
					redirect_uri: 'https://jel.ly.fish/oauth/outreach',
					code: '12345',
				})
			) {
				return callback(null, [
					200,
					{
						access_token: 'KSTWMqidua67hjM2NDE1ZTZjNGZmZjI3',
						token_type: 'bearer',
						expires_in: 3600,
						refresh_token: 'POolsdYTlmM2YxOTQ5MGE3YmNmMDFkNTVk',
						scope: 'create',
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
		});

	await expect(
		sync.authorize(
			'outreach',
			{
				appId: 'dJyXQHeh8PLKUr4gdsoUYQ8vFvqJ1D20lnFMxBLg',
				appSecret: 'NlfY38rTt5xxa+Ehi2kV/2rA85C98iDdMF7xD9xr',
			},
			{} as any,
			{
				code: 'invalidcode',
				origin: 'https://jel.ly.fish/oauth/outreach',
			},
		),
	).rejects.toThrow(oauth.OAuthUnsuccessfulResponse);

	nock.cleanAll();
});

test('.associate() should throw given an invalid integration', async () => {
	const data: any = {
		'user-johndoe': {
			type: 'user',
			version: '1.0.0',
			slug: 'user-johndoe',
			data: {
				email: 'johndoe@test.com',
			},
		},
	};

	await expect(
		sync.associate(
			'helloworld',
			data['user-johndoe'],
			{
				token_type: 'Bearer',
				access_token: 'NlfY38rTt5xxa+Ehi2kV/2rA85C98iDdMF7xD9xr',
			},
			{
				OAUTH_INTEGRATIONS: {},
				upsertElement: async (type: any, object: { slug: string }) => {
					data[object.slug] = Object.assign({}, object, {
						type,
					});

					return data[object.slug] as any;
				},
			} as any,
		),
	).rejects.toThrow(errors.SyncNoCompatibleIntegration);
});

test('.associate() should set the access token in the user card', async () => {
	const data: any = {
		'user-johndoe': {
			type: 'user',
			version: '1.0.0',
			slug: 'user-johndoe',
			data: {
				email: 'johndoe@test.com',
			},
		},
	};

	await sync.associate(
		'helloworld',
		data['user-johndoe'],
		{
			token_type: 'Bearer',
			access_token: 'NlfY38rTt5xxa+Ehi2kV/2rA85C98iDdMF7xD9xr',
		},
		{
			OAUTH_INTEGRATIONS: {
				helloworld: {},
			},
			upsertElement: async (type: any, object: { slug: string | number }) => {
				data[object.slug] = Object.assign({}, object, {
					type,
				});
			},
		} as any,
	);

	expect(data['user-johndoe']).toEqual({
		type: 'user',
		version: '1.0.0',
		slug: 'user-johndoe',
		data: {
			email: 'johndoe@test.com',
			oauth: {
				helloworld: {
					token_type: 'Bearer',
					access_token: 'NlfY38rTt5xxa+Ehi2kV/2rA85C98iDdMF7xD9xr',
				},
			},
		},
	});
});

test('.associate() should not replace other integrations', async () => {
	const data: any = {
		'user-johndoe': {
			type: 'user',
			version: '1.0.0',
			slug: 'user-johndoe',
			data: {
				email: 'johndoe@test.com',
				oauth: {
					'other-integration': {
						token_type: 'Bearer',
						access_token: 'HjShbdbsd+Ehi2kV/723ib4njksndrtv',
					},
				},
			},
		},
	};

	await sync.associate(
		'helloworld',
		data['user-johndoe'],
		{
			token_type: 'Bearer',
			access_token: 'NlfY38rTt5xxa+Ehi2kV/2rA85C98iDdMF7xD9xr',
		},
		{
			OAUTH_INTEGRATIONS: {
				helloworld: {},
			},
			upsertElement: async (type: any, object: { slug: string | number }) => {
				data[object.slug] = Object.assign({}, object, {
					type,
				});
			},
		} as any,
	);

	expect(data['user-johndoe']).toEqual({
		type: 'user',
		version: '1.0.0',
		slug: 'user-johndoe',
		data: {
			email: 'johndoe@test.com',
			oauth: {
				'other-integration': {
					token_type: 'Bearer',
					access_token: 'HjShbdbsd+Ehi2kV/723ib4njksndrtv',
				},
				helloworld: {
					token_type: 'Bearer',
					access_token: 'NlfY38rTt5xxa+Ehi2kV/2rA85C98iDdMF7xD9xr',
				},
			},
		},
	});
});

test('.associate() should replace previous integration data', async () => {
	const data: any = {
		'user-johndoe': {
			type: 'user',
			version: '1.0.0',
			slug: 'user-johndoe',
			data: {
				email: 'johndoe@test.com',
				oauth: {
					helloworld: {
						token_type: 'Bearer',
						access_token: 'HjShbdbsd+Ehi2kV/723ib4njksndrtv',
					},
				},
			},
		},
	};

	await sync.associate(
		'helloworld',
		data['user-johndoe'],
		{
			token_type: 'Bearer',
			access_token: 'NlfY38rTt5xxa+Ehi2kV/2rA85C98iDdMF7xD9xr',
		},
		{
			OAUTH_INTEGRATIONS: {
				helloworld: {},
			},
			upsertElement: async (type: any, object: { slug: string }) => {
				data[object.slug] = Object.assign({}, object, {
					type,
				});
			},
		} as any,
	);

	expect(data['user-johndoe']).toEqual({
		type: 'user',
		version: '1.0.0',
		slug: 'user-johndoe',
		data: {
			email: 'johndoe@test.com',
			oauth: {
				helloworld: {
					token_type: 'Bearer',
					access_token: 'NlfY38rTt5xxa+Ehi2kV/2rA85C98iDdMF7xD9xr',
				},
			},
		},
	});
});
