/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

require('dotenv').config();
import * as _ from 'lodash';
import * as nock from 'nock';
const querystring = require('querystring');
const oauth = require('../lib/oauth');

const authorizationNock = () => {
	nock('https://api.balena-cloud.com')
		.post('/oauth/token')
		.reply((_uri, request, callback) => {
			const body = querystring.decode(request);

			if (
				_.isEqual(body, {
					grant_type: 'authorization_code',
					client_id: 'xxxxxxxxxxxx',
					client_secret: 'yyyyyyyy',
					redirect_uri: 'https://jel.ly.fish/oauth/balena',
					code: '123456',
				})
			) {
				return callback(null, [
					200,
					{
						access_token: 'MTQ0NjJkZmQ5OTM2NDE1ZTZjNGZmZjI3',
						token_type: 'bearer',
						expires_in: 3600,
						refresh_token: 'IwOGYzYTlmM2YxOTQ5MGE3YmNmMDFkNTVk',
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
};

const refreshNock = () => {
	nock('https://api.balena-cloud.com')
		.post('/oauth/token')
		.reply((_uri, request, callback) => {
			const body = querystring.decode(request);

			if (
				_.isEqual(body, {
					grant_type: 'refresh_token',
					client_id: 'xxxxxxxxxxxx',
					client_secret: 'yyyyyyyy',
					redirect_uri: 'https://jel.ly.fish/oauth/balena',
					refresh_token: 'IwOGYzYTlmM2YxOTQ5MGE3YmNmMDFkNTVk',
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
};

beforeEach(() => {
	nock.cleanAll();
	nock.disableNetConnect();
});

afterAll(() => {
	nock.cleanAll();
});

test('.getAuthorizeUrl() should generate a url without a state', () => {
	const url = oauth.getAuthorizeUrl(
		'https://api.balena-cloud.com',
		['foo'],
		null,
		{
			appId: 'xxxxxxxxxx',
			redirectUri: 'https://jel.ly.fish/oauth/balena',
		},
	);

	const qs = [
		'response_type=code',
		'client_id=xxxxxxxxxx',
		'redirect_uri=https%3A%2F%2Fjel.ly.fish%2Foauth%2Fbalena',
		'scope=foo',
	];

	expect(url).toBe(
		`https://api.balena-cloud.com/oauth/authorize?${qs.join('&')}`,
	);
});

test('.getAuthorizeUrl() should generate a url with a scalar state', () => {
	const url = oauth.getAuthorizeUrl(
		'https://api.balena-cloud.com',
		['foo'],
		1,
		{
			appId: 'xxxxxxxxxx',
			redirectUri: 'https://jel.ly.fish/oauth/balena',
		},
	);

	const qs = [
		'response_type=code',
		'client_id=xxxxxxxxxx',
		'redirect_uri=https%3A%2F%2Fjel.ly.fish%2Foauth%2Fbalena',
		'scope=foo',
		'state=1',
	];

	expect(url).toBe(
		`https://api.balena-cloud.com/oauth/authorize?${qs.join('&')}`,
	);
});

test('.getAuthorizeUrl() should generate a url with one scope', () => {
	const url = oauth.getAuthorizeUrl(
		'https://api.balena-cloud.com',
		['foo'],
		{
			hello: 'world',
		},
		{
			appId: 'xxxxxxxxxx',
			redirectUri: 'https://jel.ly.fish/oauth/balena',
		},
	);

	const qs = [
		'response_type=code',
		'client_id=xxxxxxxxxx',
		'redirect_uri=https%3A%2F%2Fjel.ly.fish%2Foauth%2Fbalena',
		'scope=foo',
		'state=%7B%22hello%22%3A%22world%22%7D',
	];

	expect(url).toBe(
		`https://api.balena-cloud.com/oauth/authorize?${qs.join('&')}`,
	);
});

test('.getAuthorizeUrl() should generate a url with multiple scopes', () => {
	const url = oauth.getAuthorizeUrl(
		'https://api.balena-cloud.com',
		['foo', 'bar', 'baz'],
		{
			hello: 'world',
		},
		{
			appId: 'xxxxxxxxxx',
			redirectUri: 'https://jel.ly.fish/oauth/balena',
		},
	);

	const qs = [
		'response_type=code',
		'client_id=xxxxxxxxxx',
		'redirect_uri=https%3A%2F%2Fjel.ly.fish%2Foauth%2Fbalena',
		'scope=foo+bar+baz',
		'state=%7B%22hello%22%3A%22world%22%7D',
	];

	expect(url).toBe(
		`https://api.balena-cloud.com/oauth/authorize?${qs.join('&')}`,
	);
});

test('.getAuthorizeUrl() should throw given no appId', () => {
	expect(() => {
		oauth.getAuthorizeUrl(
			'https://api.balena-cloud.com',
			['foo', 'bar', 'baz'],
			{
				hello: 'world',
			},
			{
				redirectUri: 'https://jel.ly.fish/oauth/balena',
			},
		);
	}).toThrow(oauth.OAuthInvalidOption);
});

test('.getAuthorizeUrl() should throw given no redirectUri', () => {
	expect(() => {
		oauth.getAuthorizeUrl(
			'https://api.balena-cloud.com',
			['foo', 'bar', 'baz'],
			{
				hello: 'world',
			},
			{
				appId: 'xxxxxxxxxx',
			},
		);
	}).toThrow(oauth.OAuthInvalidOption);
});

test('.getAuthorizeUrl() should throw given no scopes', () => {
	expect(() => {
		oauth.getAuthorizeUrl(
			'https://api.balena-cloud.com',
			[],
			{
				hello: 'world',
			},
			{
				appId: 'xxxxxxxxxx',
				redirectUri: 'https://jel.ly.fish/oauth/balena',
			},
		);
	}).toThrow(oauth.OAuthInvalidOption);
});

test('.getAuthorizeUrl() should throw given scopes is null', () => {
	expect(() => {
		oauth.getAuthorizeUrl(
			'https://api.balena-cloud.com',
			null,
			{
				hello: 'world',
			},
			{
				appId: 'xxxxxxxxxx',
				redirectUri: 'https://jel.ly.fish/oauth/balena',
			},
		);
	}).toThrow(oauth.OAuthInvalidOption);
});

test('.getAccessToken() should return the access token if successful', async () => {
	authorizationNock();

	const result = await oauth.getAccessToken(
		'https://api.balena-cloud.com',
		'123456',
		{
			appId: 'xxxxxxxxxxxx',
			appSecret: 'yyyyyyyy',
			redirectUri: 'https://jel.ly.fish/oauth/balena',
		},
	);

	expect(result).toEqual({
		access_token: 'MTQ0NjJkZmQ5OTM2NDE1ZTZjNGZmZjI3',
		token_type: 'bearer',
		expires_in: 3600,
		refresh_token: 'IwOGYzYTlmM2YxOTQ5MGE3YmNmMDFkNTVk',
		scope: 'create',
	});
});

test('.getAccessToken() should throw given the wrong code', async () => {
	authorizationNock();

	await expect(
		oauth.getAccessToken('https://api.balena-cloud.com', 'oooooo', {
			appId: 'xxxxxxxxxxxx',
			appSecret: 'yyyyyyyy',
			redirectUri: 'https://jel.ly.fish/oauth/balena',
		}),
	).rejects.toThrow(oauth.OAuthUnsuccessfulResponse);
});

test('.getAccessToken() should throw given no appId', async () => {
	await expect(
		oauth.getAccessToken('https://api.balena-cloud.com', '123456', {
			appSecret: 'yyyyyyyy',
			redirectUri: 'https://jel.ly.fish/oauth/balena',
		}),
	).rejects.toThrow(oauth.OAuthInvalidOption);
});

test('.getAccessToken() should throw given no appSecret', async () => {
	await expect(
		oauth.getAccessToken('https://api.balena-cloud.com', '123456', {
			appId: 'xxxxxxxxxx',
			redirectUri: 'https://jel.ly.fish/oauth/balena',
		}),
	).rejects.toThrow(oauth.OAuthInvalidOption);
});

test('.getAccessToken() should throw given no redirectUri', async () => {
	await expect(
		oauth.getAccessToken('https://api.balena-cloud.com', '123456', {
			appId: 'xxxxxxxxxx',
			appSecret: 'yyyyyyyy',
		}),
	).rejects.toThrow(oauth.OAuthInvalidOption);
});

test('.refreshAccessToken() should return the new access token if successful', async () => {
	refreshNock();

	const result = await oauth.refreshAccessToken(
		'https://api.balena-cloud.com',
		{
			grant_type: 'refresh_token',
			client_id: 'xxxxxxxxxxxx',
			client_secret: 'yyyyyyyy',
			redirect_uri: 'https://jel.ly.fish/oauth/balena',
			refresh_token: 'IwOGYzYTlmM2YxOTQ5MGE3YmNmMDFkNTVk',
		},
		{
			appId: 'xxxxxxxxxxxx',
			appSecret: 'yyyyyyyy',
			redirectUri: 'https://jel.ly.fish/oauth/balena',
		},
	);

	expect(result).toEqual({
		access_token: 'KSTWMqidua67hjM2NDE1ZTZjNGZmZjI3',
		token_type: 'bearer',
		expires_in: 3600,
		refresh_token: 'POolsdYTlmM2YxOTQ5MGE3YmNmMDFkNTVk',
		scope: 'create',
	});
});

test('.refreshAccessToken() should fail if the access token is invalid', async () => {
	authorizationNock();

	await expect(
		oauth.refreshAccessToken(
			'https://api.balena-cloud.com',
			{
				grant_type: 'refresh_token',
				client_id: 'xxxxxxxxxxxx',
				client_secret: 'yyyyyyyy',
				redirect_uri: 'https://jel.ly.fish/oauth/balena',
				refresh_token: '0000000000000000000',
			},
			{
				appId: 'xxxxxxxxxxxx',
				appSecret: 'yyyyyyyy',
				redirectUri: 'https://jel.ly.fish/oauth/balena',
			},
		),
	).rejects.toThrow(oauth.OAuthUnsuccessfulResponse);
});

test('.refreshAccessToken() should fail if no appId', async () => {
	await expect(
		oauth.refreshAccessToken(
			'https://api.balena-cloud.com',
			{
				grant_type: 'refresh_token',
				client_id: 'xxxxxxxxxxxx',
				client_secret: 'yyyyyyyy',
				redirect_uri: 'https://jel.ly.fish/oauth/balena',
				refresh_token: '0000000000000000000',
			},
			{
				appSecret: 'yyyyyyyy',
				redirectUri: 'https://jel.ly.fish/oauth/balena',
			},
		),
	).rejects.toThrow(oauth.OAuthInvalidOption);
});

test('.refreshAccessToken() should fail if no appSecret', async () => {
	await expect(
		oauth.refreshAccessToken(
			'https://api.balena-cloud.com',
			{
				grant_type: 'refresh_token',
				client_id: 'xxxxxxxxxxxx',
				client_secret: 'yyyyyyyy',
				redirect_uri: 'https://jel.ly.fish/oauth/balena',
				refresh_token: '0000000000000000000',
			},
			{
				appId: 'xxxxxxxxxx',
				redirectUri: 'https://jel.ly.fish/oauth/balena',
			},
		),
	).rejects.toThrow(oauth.OAuthInvalidOption);
});

test('.refreshAccessToken() should fail if no redirectUri', async () => {
	await expect(
		oauth.refreshAccessToken(
			'https://api.balena-cloud.com',
			{
				grant_type: 'refresh_token',
				client_id: 'xxxxxxxxxxxx',
				client_secret: 'yyyyyyyy',
				redirect_uri: 'https://jel.ly.fish/oauth/balena',
				refresh_token: '0000000000000000000',
			},
			{
				appId: 'xxxxxxxxxx',
				appSecret: 'yyyyyyyy',
			},
		),
	).rejects.toThrow(oauth.OAuthInvalidOption);
});
