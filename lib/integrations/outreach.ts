/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import * as _ from 'lodash';
import * as crypto from 'crypto';
import * as Bluebird from 'bluebird';
import {
	Card,
	SyncIntegrationOptions,
	SyncIntegrationInstance,
	SyncResult,
	SyncContext,
} from '../sync-types';
const assert = require('@balena/jellyfish-assert');
const isUUID = require('is-uuid').v4;

type Context = SyncIntegrationOptions['context'];

type OutreachProspect = {
	type: string;
	id: number;
	attributes: {
		createdAt: string;
		emails: string[];
		firstName: string;
		lastName: string;
		title: string;
		updatedAt: string;
	};
	relationships: any;
};

const MAX_NAME_LENGTH = 50;

const USER_PROSPECT_MAPPING = [
	{
		prospect: ['addressCity'],
		user: ['data', 'profile', 'city'],
	},
	{
		prospect: ['occupation'],
		user: ['data', 'profile', 'company'],
	},
	{
		prospect: ['addressCountry'],
		user: ['data', 'profile', 'country'],
	},
	{
		prospect: ['title'],
		user: ['data', 'profile', 'type'],
	},
	{
		prospect: ['firstName'],
		user: ['data', 'profile', 'name', 'first'],
		fn: (value: string) => {
			return _.truncate(value, {
				length: MAX_NAME_LENGTH,
			});
		},
	},
	{
		prospect: ['lastName'],
		user: ['data', 'profile', 'name', 'last'],
		fn: (value: string) => {
			return _.truncate(value, {
				length: MAX_NAME_LENGTH,
			});
		},
	},
	{
		prospect: ['tags'],
		user: ['tags'],
	},
];

// TODO: Create an account for each company we know about
// if it doesn't already exist, and associate the prospect
// with the right company resource.
const getProspectAttributes = (contact: Card) => {
	const githubUsername = contact.slug.startsWith('contact-gh-')
		? contact.slug.replace(/^contact-gh-/g, '')
		: null;

	const attributes = {
		// As we may still have users around with these
		// auto-generated emails that Outreach doesn't
		// like as it claims they were taken already.
		emails: _.flatten([
			contact.data.profile && contact.data.profile.email,
		]).filter((email) => {
			return email && !email.endsWith('@change.me');
		}),

		githubUsername,
		nickname: contact.slug.replace(/^contact-/g, ''),
		custom1: `https://jel.ly.fish/${contact.id}`,
	};

	for (const mapping of USER_PROSPECT_MAPPING) {
		const value = _.get(contact, mapping.user);
		const fn = mapping.fn || _.identity;
		_.set(attributes, mapping.prospect, fn(value));
	}

	return attributes;
};

const getProspectByEmail = async (
	context: Context,
	actor: string,
	errors: any,
	baseUrl: string,
	emails: string[],
): Promise<null | OutreachProspect> => {
	if (!emails || _.isEmpty(emails)) {
		return null;
	}

	for (const email of _.castArray(emails)) {
		context.log.info('Searching for propect by email', {
			email,
		});

		const searchResult: {
			code: number;
			body: {
				data: OutreachProspect[];
			};
		} = await context
			.request(actor, {
				method: 'GET',
				json: true,
				uri: `${baseUrl}/api/v2/prospects`,
				qs: {
					'filter[emails]': email,
				},
			})
			.catch((error) => {
				if (error.expected && error.name === 'SyncOAuthNoUserError') {
					return null;
				}

				throw error;
			});

		if (!searchResult) {
			continue;
		}

		assert.INTERNAL(
			null,
			searchResult.code === 200 || searchResult.code === 404,
			errors.SyncExternalRequestError,
			`Cannot find prospect by email ${emails}: ${searchResult.code}`,
		);

		const result = _.first(searchResult.body.data);

		if (result) {
			context.log.info('Found prospect by email', {
				email,
				prospect: result,
			});

			return result;
		}
	}

	context.log.info('Could not find prospect by emails', {
		emails,
	});

	return null;
};

const getByIdOrSlug = async (context: Context, idOrSlug: string) => {
	return (
		(isUUID(idOrSlug) && (await context.getElementById(idOrSlug))) ||
		context.getElementBySlug(`${idOrSlug}@latest`)
	);
};

const upsertProspect = async (
	context: Context,
	actor: string,
	errors: any,
	baseUrl: string,
	card: Card,
	retries = 5,
): Promise<SyncResult[]> => {
	const contactEmail = card.data.profile && card.data.profile.email;
	const prospect = await getProspectByEmail(
		context,
		actor,
		errors,
		baseUrl,
		contactEmail,
	);

	const outreachUrl =
		_.get(prospect, ['links', 'self']) ||
		_.find(card.data.mirrors, (mirror) => {
			return _.startsWith(mirror, baseUrl);
		});

	const method = outreachUrl ? 'PATCH' : 'POST';
	const uri = outreachUrl || `${baseUrl}/api/v2/prospects`;

	context.log.info('Mirroring', {
		url: uri,
		remote: card,
	});

	const body: any = {
		data: {
			type: 'prospect',
			attributes: getProspectAttributes(card),
		},
	};

	if (card.data.origin) {
		const origin = await getByIdOrSlug(context, card.data.origin);
		if (
			origin &&
			origin.type &&
			origin.type.split('@')[0] === 'external-event' &&
			origin.data.source
		) {
			body.data.attributes.tags = body.data.attributes.tags || [];
			if (!body.data.attributes.tags.includes(origin.data.source)) {
				body.data.attributes.tags.push(origin.data.source);
			}
		}
	}

	if (outreachUrl) {
		body.data.id = _.parseInt(_.last(outreachUrl.split('/')) as string);
	}

	const result = await context
		.request(actor, {
			method,
			json: true,
			uri,
			body,
		})
		.catch((error) => {
			if (error.expected && error.name === 'SyncOAuthNoUserError') {
				return null;
			}

			throw error;
		});

	if (!result) {
		return [];
	}

	// This usually means that the email's domain belongs
	// to the company managing the Outreach account.
	if (
		result.code === 422 &&
		result.body.errors[0] &&
		result.body.errors[0].id === 'validationError' &&
		result.body.errors[0].detail ===
			'Contacts contact is using an excluded email address.'
	) {
		context.log.info('Omitting excluded prospect by email address', {
			prospect: card,
			url: outreachUrl,
		});

		return [];
	}

	// When creating prospect, we first ask Outreach if it knows about an
	// email address in order decide if we have to insert or update.
	// If there are multiple requests coming in at the same time, one
	// may create the prospect after the other process asked Outreach about
	// it, causing a race condition where a prospect will be inserted twice,
	// resulting in an "already taken" error.
	if (
		result.code === 422 &&
		result.body.errors[0] &&
		result.body.errors[0].id === 'validationError' &&
		result.body.errors[0].detail ===
			'Contacts email hash has already been taken.'
	) {
		context.log.info('Retrying taken address', {
			prospect: card,
			url: outreachUrl,
		});

		assert.INTERNAL(null, retries > 0, errors.SyncExternalRequestError, () => {
			return `Prospect validation error: ${JSON.stringify(body, null, 2)}`;
		});

		return upsertProspect(context, actor, errors, baseUrl, card, retries - 1);
	}

	if (outreachUrl) {
		if (result.code === 404) {
			context.log.warn('Remote prospect not found', {
				url: outreachUrl,
				prospect: card,
			});

			return [];
		}

		// This means that the update didn't bring any new
		// information to the prospect. The remote resource
		// was up to date with what we were trying to update.
		if (
			result.code === 422 &&
			result.body.errors[0] &&
			result.body.errors[0].id === 'validationDuplicateValueError' &&
			result.body.errors[0].detail ===
				'A Contact with this email_hash already exists.'
		) {
			return [];
		}

		assert.INTERNAL(
			null,
			result.code === 200,
			errors.SyncExternalRequestError,
			() => {
				return [
					`Could not update prospect: Got ${result.code} ${JSON.stringify(
						result.body,
						null,
						2,
					)}`,
					`when sending ${JSON.stringify(body, null, 2)} to ${outreachUrl}`,
				].join('\n');
			},
		);

		context.log.info('Updated prospect', {
			contacts: card,
			url: outreachUrl,
			data: result.body,
		});

		if (
			prospect &&
			(!card.data.mirrors || !card.data.mirrors.includes(outreachUrl))
		) {
			card.data.mirrors = (card.data.mirrors || []).filter((mirror: string) => {
				return !mirror.startsWith(baseUrl);
			});
			card.data.mirrors.push(outreachUrl);
			for (const mapping of USER_PROSPECT_MAPPING) {
				const prospectProperty = _.get(prospect.attributes, mapping.prospect);
				if (prospectProperty && !_.get(card, mapping.user)) {
					_.set(card, mapping.user, prospectProperty);
				}
			}

			context.log.info('Adding missing mirror url', {
				slug: card.slug,
				url: outreachUrl,
			});

			return [
				{
					time: new Date(),
					actor,
					card,
				},
			];
		}

		return [];
	}

	assert.INTERNAL(
		null,
		result.code === 201,
		errors.SyncExternalRequestError,
		() => {
			return [
				`Could not create prospect: Got ${result.code} ${JSON.stringify(
					result.body,
					null,
					2,
				)}`,
				`when sending ${JSON.stringify(body, null, 2)} to ${outreachUrl}`,
			].join('\n');
		},
	);

	card.data.mirrors = card.data.mirrors || [];
	card.data.mirrors.push(result.body.data.links.self);

	context.log.info('Created prospect', {
		contact: card,
		url: outreachUrl,
		data: result.body,
	});

	return [
		{
			time: new Date(),
			actor,
			card,
		},
	];
};

const getSequenceCard = (
	url: string,
	attributes: { name: any },
	options: { id: any; active: any; translateDate: any; orgId: any },
) => {
	return {
		name: attributes.name,
		tags: [],
		links: {},
		markers: [],
		active: options.active,
		type: 'email-sequence@1.0.0',
		slug: `email-sequence-${options.orgId}-${options.id}`,
		data: {
			translateDate: options.translateDate.toISOString(),
			mirrors: [url],
		},
	};
};

class OutreachIntegration implements SyncIntegrationInstance {
	options: SyncIntegrationOptions;
	context: Context;
	baseUrl: string;

	constructor(options: SyncIntegrationOptions) {
		this.options = options;
		this.context = this.options.context;
		this.baseUrl = 'https://api.outreach.io';
	}

	async initialize() {
		return Bluebird.resolve();
	}

	async destroy() {
		return Bluebird.resolve();
	}

	async mirror(card: Card, options: any) {
		const baseType = card.type.split('@')[0];
		if (baseType !== 'contact') {
			return [];
		}

		if (!this.options.token.appId || !this.options.token.appSecret) {
			return [];
		}

		return upsertProspect(
			this.context,
			options.actor,
			this.options.errors,
			this.baseUrl,
			card,
		);
	}

	async translate(event: Card) {
		if (!this.options.token.appId || !this.options.token.appSecret) {
			return [];
		}

		const data = event.data.payload.data;
		const orgId = event.data.headers['outreach-org-id'];

		// Lets only translate sequences for now
		if (data.type !== 'sequence') {
			return [];
		}

		// A no-op update
		if (_.isEmpty(data.attributes)) {
			return [];
		}

		const eventType = event.data.payload.meta.eventName;

		// The Balena API doesn't emit actors in events, so most
		// of them will be done by the admin user.
		const adminActorId = await this.context.getActorId({
			handle: this.options.defaultUser,
		});

		assert.INTERNAL(
			null,
			adminActorId,
			this.options.errors.SyncNoActor,
			`Not such actor: ${this.options.defaultUser}`,
		);

		const url = `https://api.outreach.io/api/v2/sequences/${data.id}`;
		const eventCard = await this.context.getElementByMirrorId(
			'email-sequence@1.0.0',
			url,
		);

		if (eventCard) {
			data.attributes.name = data.attributes.name || eventCard.name;
		}

		if (eventType === 'sequence.updated' && !eventCard) {
			const remoteSequence = await this.context
				.request(adminActorId, {
					method: 'GET',
					json: true,
					uri: url,
				})
				.catch((error) => {
					if (error.expected && error.name === 'SyncOAuthNoUserError') {
						return null;
					}

					throw error;
				});

			if (!remoteSequence) {
				return [];
			}

			assert.INTERNAL(
				null,
				remoteSequence.code === 200,
				this.options.errors.SyncExternalRequestError,
				() => {
					return `Could not get sequence from ${url}: ${JSON.stringify(
						remoteSequence,
						null,
						2,
					)}`;
				},
			);

			data.attributes.name =
				data.attributes.name || remoteSequence.body.data.attributes.name;
			data.attributes.shareType =
				data.attributes.shareType ||
				remoteSequence.body.data.attributes.shareType;
		}

		const isPublic =
			data.attributes.shareType === 'shared' ||
			_.isNil(data.attributes.shareType);

		const sequenceCard = getSequenceCard(url, data.attributes, {
			id: data.id,
			active: eventType !== 'sequence.destroyed' && isPublic,
			translateDate: new Date(event.data.payload.meta.deliveredAt),
			orgId,
		});

		if (eventCard && eventCard.data.translateDate) {
			if (
				new Date(eventCard.data.translateDate) >=
				new Date(sequenceCard.data.translateDate)
			) {
				return [];
			}
		}

		const updateTimestamp =
			data.attributes.updatedAt &&
			data.attributes.updatedAt !== data.attributes.createdAt
				? data.attributes.updatedAt
				: event.data.payload.meta.deliveredAt;

		const date =
			eventType === 'sequence.created'
				? new Date(data.attributes.createdAt)
				: new Date(updateTimestamp);

		return [
			{
				time: date,
				actor: adminActorId,
				card: sequenceCard,
			},
		];
	}
}

export const create = (options: SyncIntegrationOptions) => {
	return new OutreachIntegration(options);
};

export const OAUTH_BASE_URL = 'https://api.outreach.io';
export const OAUTH_SCOPES = [
	'prospects.all',
	'sequences.all',
	'sequenceStates.all',
	'sequenceSteps.all',
	'sequenceTemplates.all',
	'mailboxes.all',
	'webhooks.all',
];

export const isEventValid = async (
	token: any,
	rawEvent: string,
	headers: any,
) => {
	const signature = headers['outreach-webhook-signature'];
	if (!signature) {
		return false;
	}

	if (!token || !token.signature) {
		return false;
	}

	const hash = crypto
		.createHmac('sha256', token.signature)
		.update(rawEvent)
		.digest('hex');

	return hash === signature;
};

/*
 * There's no way to get user info by credentials from outreach.
 */
export const whoami = async () => {
	return null;
};

/*
 * Since there's no way to get external user,
 * falling back to using the slug.
 */
export const match = async (
	context: SyncContext,
	_externalUser: any,
	options: any,
) => {
	assert.INTERNAL(
		context,
		options.slug,
		options.errors.SyncInvalidArg,
		'Slug is a required argument',
	);

	const user = await context.getElementBySlug(options.slug);

	assert.INTERNAL(
		context,
		user,
		options.errors.SyncNoMatchingUser,
		`Could not find user matching outreach user by slug "${options.slug}"`,
	);

	return user;
};

export const getExternalUserSyncEventData = async (
	_context: any,
	_externalUser: any,
	_options: any,
) => {
	throw new Error('Not implemented');
};
