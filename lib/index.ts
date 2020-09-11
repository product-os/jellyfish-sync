/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import * as _ from 'lodash';
import * as assert from '@balena/jellyfish-assert';
import * as pipeline from './pipeline';
import {
	Token,
	Card,
	SyncContext,
	WorkerResponse,
	TranslateOptions,
} from './sync-types';
import * as errors from './errors';
import INTEGRATIONS from './integrations';
import * as integrationUtils from './integrations/utils';

import * as instance from './instance';
import * as oauth from './oauth';
const metrics = require('@balena/jellyfish-metrics');

/**
 * Jellyfish sync library module.
 *
 * @module sync
 */
export { INTEGRATIONS };
export { errors };
export { integrationUtils };
export { pipeline };

/**
 * @summary OAuth capable integrations
 * @public
 * @type {String[]}
 */
export const OAUTH_INTEGRATIONS: string[] = _.reduce<any, string[]>(
	INTEGRATIONS,
	(accumulator, value, key) => {
		if (value.OAUTH_BASE_URL && value.OAUTH_SCOPES) {
			accumulator.push(key);
		}

		return accumulator;
	},
	[],
);

/**
 * @summary Get an external authorize URL
 * @function
 * @public
 *
 * @param {String} integration - integration name
 * @param {Object} token - token details
 * @param {String} slug - user slug
 * @param {Object} options - options
 * @param {String} options.origin - The callback URL
 * @returns {String} Authorize URL
 */
export const getAssociateUrl = (
	integration: string,
	token: Token | null,
	slug: string,
	options: { origin: string },
): string | null => {
	const Integration = INTEGRATIONS[integration];
	if (!Integration || !token || !token.appId) {
		return null;
	}

	if (Integration.OAUTH_BASE_URL && Integration.OAUTH_SCOPES) {
		return oauth.getAuthorizeUrl(
			Integration.OAUTH_BASE_URL,
			Integration.OAUTH_SCOPES,
			slug,
			{
				appId: token.appId,
				redirectUri: options.origin,
			},
		);
	}
	return null;
};

/**
 * @summary Authorize a user with an external OAuth service
 * @function
 * @public
 *
 * @param {String} integration - integration name
 * @param {Object} token - token details
 * @param {Object} context - execution context
 * @param {Object} options - options
 * @param {String} options.code - short lived OAuth code
 * @param {String} options.origin - The callbac URL
 * @returns {Object} external provider's access token
 */
export const authorize = async (
	integration: string,
	token: Token,
	context: { OAUTH_INTEGRATIONS: { [x: string]: any } },
	options: { code: string; origin: string },
): Promise<string> => {
	const Integration = context.OAUTH_INTEGRATIONS
		? context.OAUTH_INTEGRATIONS[integration]
		: INTEGRATIONS[integration];

	assert.INTERNAL(
		context,
		Integration,
		errors.SyncNoCompatibleIntegration,
		`There is no compatible integration for provider: ${integration}`,
	);

	assert.INTERNAL(
		context,
		!!(token && token.appId && token.appSecret),
		errors.SyncNoIntegrationAppCredentials,
		`No application credentials found for integration: ${integration}`,
	);

	return oauth.getAccessToken(Integration.OAUTH_BASE_URL, options.code, {
		appId: token.appId,
		appSecret: token.appSecret,
		redirectUri: options.origin,
	});
};

/**
 * @summary Gets external user
 * @function
 * @public
 *
 * @param {Object} context - execution context
 * @param {String} integration - integration name
 * @param {String} credentials - access token for external provider api
 * @returns {Object} external user
 */
export const whoami = async (
	context: SyncContext,
	integration: string | number,
	credentials: any,
): Promise<any> => {
	const Integration = context.OAUTH_INTEGRATIONS
		? context.OAUTH_INTEGRATIONS[integration]
		: INTEGRATIONS[integration];

	assert.INTERNAL(
		context,
		!!Integration,
		errors.SyncNoCompatibleIntegration,
		`There is no compatible integration for provider: ${integration}`,
	);

	// TODO: Once the "jellyfish-assert" module is typed, move this check to the assert above
	if (!Integration.whoami) {
		throw new errors.SyncNoCompatibleIntegration();
	}

	return Integration.whoami(context, credentials, {
		errors,
	});
};

/**
 * @summary Gets local user matching the external user
 * @function
 * @public
 *
 * @param {Object} context - execution context
 * @param {String} integration - integration name
 * @param {Object} externalUser - external user
 * @param {Object} options - options
 * @param {String} options.slug - slug to be used as a fallback to get a user
 * @returns {Object} external user
 */
export const match = async (
	context: SyncContext,
	integration: string,
	externalUser: any,
	options: { slug: any },
): Promise<Card | null> => {
	const Integration = context.OAUTH_INTEGRATIONS
		? context.OAUTH_INTEGRATIONS[integration]
		: INTEGRATIONS[integration];

	assert.INTERNAL(
		context,
		!!Integration,
		errors.SyncNoCompatibleIntegration,
		`There is no compatible integration for provider: ${integration}`,
	);

	// TODO: Once the "jellyfish-assert" module is typed, move this check to the assert above
	if (!Integration.match) {
		throw new errors.SyncNoCompatibleIntegration();
	}

	const user = await Integration.match(context, externalUser, {
		errors,
		slug: `${options.slug}@latest`,
	});

	if (user) {
		assert.INTERNAL(
			context,
			user.slug === options.slug,
			errors.SyncNoMatchingUser,
			`Could not find matching user for provider: ${integration}, slugs do not match ${user.slug} !== ${options.slug}`,
		);
	}

	return user;
};

export const getExternalUserSyncEventData = async (
	context: SyncContext,
	integration: string,
	externalUser: any,
): Promise<any> => {
	const Integration = context.OAUTH_INTEGRATIONS
		? context.OAUTH_INTEGRATIONS[integration]
		: INTEGRATIONS[integration];

	assert.INTERNAL(
		context,
		!!Integration,
		errors.SyncNoCompatibleIntegration,
		`There is no compatible integration for provider: ${integration}`,
	);

	// TODO: Once the "jellyfish-assert" module is typed, move this check to the assert above
	if (!Integration.getExternalUserSyncEventData) {
		throw new errors.SyncNoCompatibleIntegration();
	}

	const event = await Integration.getExternalUserSyncEventData(
		context,
		externalUser,
		{
			errors,
		},
	);

	assert.INTERNAL(
		context,
		event,
		errors.SyncNoMatchingUser,
		'Could not generate external user sync event',
	);

	return event;
};

/**
 * @summary Associate a user with an external OAuth service
 * @function
 * @public
 *
 * @param {String} integration - integration name
 * @param {Object} userCard - user to associate external token to
 * @param {Object} credentials - external provider's api token
 * @param {Object} context - execution context
 * @returns {Object} Upserted user card
 */
export const associate = async (
	integration: string,
	userCard: Card,
	credentials: any,
	context: SyncContext,
): Promise<WorkerResponse> => {
	const Integration = context.OAUTH_INTEGRATIONS
		? context.OAUTH_INTEGRATIONS[integration]
		: INTEGRATIONS[integration];

	assert.INTERNAL(
		context,
		!!Integration,
		errors.SyncNoCompatibleIntegration,
		`There is no compatible integration: ${integration}`,
	);

	/*
	 * Set the access token in the user card.
	 */
	_.set(userCard, ['data', 'oauth', integration], credentials);
	return context.upsertElement(userCard.type, _.omit(userCard, ['type']), {
		timestamp: new Date(),
	});
};

/**
 * @summary Check if an external event request is valid
 * @function
 * @public
 *
 * @param {String} integration - integration name
 * @param {Object} token - token details
 * @param {Object} event - event
 * @param {String} event.raw - raw event payload
 * @param {Object} event.headers - request headers
 * @returns {Boolean} whether the external event should be accepted or not
 */
export const isValidEvent = async (
	integration: string,
	token: any,
	event: { raw: any; headers: any },
): Promise<boolean> => {
	const Integration = INTEGRATIONS[integration];
	if (!Integration || !token) {
		return false;
	}

	return Integration.isEventValid(token, event.raw, event.headers);
};

/**
 * @summary Mirror back a card insert coming from Jellyfish
 * @function
 * @public
 *
 * @param {String} integration - integration name
 * @param {Object} token - token details
 * @param {Object} card - action target card
 * @param {Object} context - execution context
 * @param {Object} options - options
 * @param {String} options.actor - actor id
 * @param {String} [options.origin] - OAuth origin URL
 * @returns {Object[]} inserted cards
 */
export const mirror = async (
	integration: string | number,
	token: any,
	card: any,
	context: {
		log: { warn: (arg0: string, arg1: { integration: any }) => void };
	},
	options: { actor: any; origin: any; defaultUser: any },
) => {
	if (!token) {
		context.log.warn('Ignoring mirror as there is no token', {
			integration,
		});

		return [];
	}

	const Integration = INTEGRATIONS[integration];
	if (!Integration) {
		context.log.warn('Ignoring mirror as there is no compatible integration', {
			integration,
		});

		return [];
	}

	return pipeline.mirrorCard(Integration, card, {
		actor: options.actor,
		origin: options.origin,
		defaultUser: options.defaultUser,
		provider: integration,
		token,
		context,
	});
};

/**
 * @summary Translate an external event into Jellyfish
 * @function
 * @public
 *
 * @param {String} integration - integration name
 * @param {Object} token - token details
 * @param {Object} card - action target card
 * @param {Object} context - execution context
 * @param {Object} options - options
 * @param {String} options.actor - actor id
 * @param {String} options.timestamp - timestamp
 * @param {String} [options.origin] - OAuth origin URL
 * @returns {Object[]} inserted cards
 */
export const translate = async (
	integration: number,
	token: any,
	card: Card,
	context: SyncContext,
	options: TranslateOptions,
): Promise<object[]> => {
	if (!token) {
		context.log.warn('Ignoring translate as there is no token', {
			integration,
		});

		return [];
	}

	const Integration = INTEGRATIONS[integration];
	if (!Integration) {
		context.log.warn('Ignoring mirror as there is no compatible integration', {
			integration,
		});

		return [];
	}

	context.log.info('Translating external event', {
		id: card.id,
		slug: card.slug,
		integration,
	});

	const cards = await metrics.measureTranslate(integration, async () => {
		return pipeline.translateExternalEvent(Integration, card, {
			actor: options.actor,
			origin: options.origin,
			defaultUser: options.defaultUser,
			provider: integration,
			token,
			context,
		});
	});

	context.log.info('Translated external event', {
		slugs: cards.map((translatedCard: { slug: any }) => {
			return translatedCard.slug;
		}),
	});

	return cards;
};

/**
 * @summary Fetch a file synced in an external service
 * @function
 * @public
 *
 * @param {String} integration - integration name
 * @param {Object} token - token details
 * @param {String} file - file id
 * @param {Object} context - execution context
 * @param {Object} options - options
 * @param {String} options.actor - actor id
 * @returns {Buffer} file
 */
export const getFile = (
	integration: string | number,
	token: any,
	file: any,
	context: SyncContext,
	options: { actor: any },
) => {
	if (!token) {
		context.log.warn('Not fetching file as there is no token', {
			integration,
		});

		return null;
	}

	const Integration = INTEGRATIONS[integration];
	if (!Integration) {
		context.log.warn('Ignoring mirror as there is no compatible integration', {
			integration,
		});

		return null;
	}

	context.log.info('Retrieving external file', {
		file,
		integration,
	});

	return instance.run(
		Integration,
		token,
		async (integrationInstance: { getFile: (arg0: any) => any }) => {
			return integrationInstance.getFile(file);
		},
		{
			actor: options.actor,
			provider: integration,
			context,
		},
	);
};
