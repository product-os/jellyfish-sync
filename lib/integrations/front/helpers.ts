/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import * as LRU from 'lru-cache';
import * as _ from 'lodash';
import * as Bluebird from 'bluebird';
import { Front } from 'front-sdk';
import * as Intercom from 'intercom-client';
import { User as IntercomUser } from 'intercom-client/User';
import {
	Card,
	PartialBy,
	SyncIntegrationOptions,
	SyncResult,
} from '../../sync-types';
import * as utils from '../utils';

const url = require('native-url');
const assert = require('@balena/jellyfish-assert');

type Context = SyncIntegrationOptions['context'];

type Instance = {
	context: Context;
	options: SyncIntegrationOptions;
};

export const handleRateLimit = async (
	context: Context,
	fn: () => Promise<any>,
	times = 100,
): Promise<any> => {
	try {
		return await fn();
	} catch (error) {
		if (error.name === 'FrontError' && error.status === 429 && times > 0) {
			// The error message suggest how many milliseconds to retry,
			// but the number is embedded in the message string. For example:
			//   Rate limit exceeded. Please retry in 42504 milliseconds.
			const delay =
				_.parseInt(_.first(error.message!.match(/(\d+)/)) as string) || 2000;

			context.log.warn('Front rate limiting exceeded', {
				message: error.message,
				delay,
				times,
			});

			await Bluebird.delay(delay);
			return handleRateLimit(context, fn, times - 1);
		}

		throw error;
	}
};

export const getThreadType = (inbox: string): string | null => {
	if (
		[
			'S/Paid_Support',
			'S/Forums',
			'D/Security',
			'Test_Contracts',
			'Demo Inbox',
		].includes(inbox)
	) {
		return 'support-thread@1.0.0';
	}

	if (['Z/Solutions', 'Z/Revenue'].includes(inbox)) {
		return 'sales-thread@1.0.0';
	}

	return null;
};

/**
 * @summary Get the mirror id of a conversation
 * @function
 * @private
 *
 * @param {Object} event - external event
 * @returns {String} mirror id
 */
const getConversationMirrorId = (event: Card): string => {
	return event.data.payload.conversation._links.self;
};

/*
 * Front contact cache, for rate limiting purposes.
 */
const FRONT_CONTACT_CACHE = new LRU(200);

export const getFrontContact = async (
	context: SyncIntegrationOptions['context'],
	front: Front,
	id: string,
) => {
	const cachedContact = FRONT_CONTACT_CACHE.get(id);
	if (cachedContact) {
		return cachedContact;
	}

	const contact = await handleRateLimit(context, () => {
		context.log.info('Front API request', {
			type: 'contact.get',
			id,
		});

		return front.contact.get({
			contact_id: id,
		});
	});

	FRONT_CONTACT_CACHE.set(id, contact);
	return contact;
};

/**
 * @summary Get the actor id of a message
 * @function
 * @private
 *
 * @param {Object} context - execution context
 * @param {Object} front - front instance
 * @param {Object} intercom - intercom instance
 * @param {Object} payload - event payload
 * @returns {String} actor id
 */
export const getMessageActor = async (
	context: SyncIntegrationOptions['context'],
	front: Front,
	intercom: Intercom.Client | null,
	payload: any,
) => {
	if (!payload) {
		return null;
	}

	/*
	 * Handle S/Community_Custom forums actor weirdness.
	 */
	if (
		payload.target &&
		payload.target.data &&
		payload.target.data.type === 'custom' &&
		payload.target.data.recipients.length > 1
	) {
		/*
		 * In forum messages the "from" is really "to" (?)
		 */
		const from = _.find(payload.target.data.recipients, {
			role: 'to',
		});

		/*
		 * If this is the case then we can patch the event accordingly.
		 */
		if (from) {
			payload.target.data.recipients = [from];
			payload.target.data.recipients[0].role = 'from';
		}
	}

	if (payload.author) {
		context.log.info('Getting actor id from payload author', {
			author: payload.author,
		});

		return context.getActorId({
			// Some old Front conversations (>4 year old) report back
			// the username and email with an odd "id"-like prefix.
			// For example:
			//
			// "email": "x-d36e915006::juan@balena.io",
			// "username": "x-22df0a21b2::jviotti",
			//
			// Its unclear what these mean. They are not documented
			// anywhere and are not present in any new conversations.
			handle: payload.author.username.replace(/^.*::/, ''),
			email: payload.author.email.replace(/^.*::/, ''),

			name: {
				first: payload.author.first_name,
				last: payload.author.last_name,
			},
		});
	}

	const from = _.find(payload.recipients, {
		role: 'from',
	});

	if (from && payload.type === 'intercom' && intercom) {
		const intercomUser = await getIntercomUser(context, intercom, from.handle);
		if (intercomUser) {
			context.log.info('Found Intercom user', intercomUser);
			const customAttributes: Record<string, any> =
				intercomUser.custom_attributes || {};
			const locationData: Record<string, any> =
				intercomUser.location_data || {};
			return context.getActorId({
				handle: intercomUser.user_id,
				email: intercomUser.email,
				title: customAttributes['Account Type'],
				company: customAttributes.Company,
				country: locationData.country_name,
				city: locationData.city_name,
				name: {
					first: customAttributes['First Name'],
					last: customAttributes['Last Name'],
				},
			});
		}
	}

	// Sometimes even the contact link is null. In this case, we
	// have no information whatsoever from the contact, so we have
	// to default to making an e-mail up.
	if (!from._links.related.contact) {
		if (utils.isEmail(from.handle)) {
			return context.getActorId({
				email: from.handle,
			});
		}

		return context.getActorId({
			handle: from.handle,
		});
	}

	const id = _.last(_.split(from._links.related.contact, '/'));
	let contact = await getFrontContact(context, front, id!);

	if (contact.name === 'S/Community_Custom') {
		const to = _.find(payload.recipients, {
			role: 'to',
		});

		contact = await getFrontContact(
			context,
			front,
			_.last(_.split(to._links.related.contact, '/'))!,
		);
	}

	if (utils.isEmail(contact.name)) {
		return context.getActorId({
			email: contact.name,
		});
	}

	const name = contact.name
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, '-')
		.replace(/-{1,}/g, '-');

	const email = _.find(contact.handles, {
		source: 'email',
	});

	if (email && utils.isEmail(email.handle)) {
		return context.getActorId({
			email: email.handle,
		});
	}

	return context.getActorId({
		handle: name,
	});
};

const getMessageText = (payload: any) => {
	/*
	 * This means that the body is plain text and not HTML.
	 */
	if (payload.body && _.isNil(payload.text)) {
		return _.trim(payload.body, ' \n');
	}

	if (
		payload.attachments &&
		payload.attachments.length > 0 &&
		payload.text.trim().length === 0
	) {
		return '';
	}

	// If the text payload is empty, then return an empty string, even though the
	// HTML representation might exist, it won't have meaningful content
	if (payload.text && payload.text.trim().length === 0) {
		return '';
	}

	/*
	 * We always look at the HTML alternative because if we post a message
	 * two new lines (i.e. "Hello\n\nWorld"), then Front will internally
	 * convert it to HTML as "Hello<br>\nWorld", and then attempt to derive
	 * the text representation from it, which will end up being "Hello\nWorld"
	 * as "\n" is meaningless on an HTML string.
	 * The final result is that we lose double new lines.
	 *
	 * See https://github.com/product-os/jellyfish/issues/1601
	 */
	if (payload.body) {
		return payload.body;
	}

	return _.trim(payload.text, ' \n');
};

/**
 * @summary Get message from an event payload
 * @function
 * @private
 *
 * @param {Object} instance - sync instance
 * @param {Object} front - front instance
 * @param {Object} intercom - intercom instance
 * @param {Array} sequence - current upsert sequence
 * @param {Object} payload - event payload
 * @param {String} threadId - thread id
 * @param {Date} emittedDate - emitter date
 * @param {Array} remoteMessages - remote messages
 * @returns {Object} message card
 */
export const getMessage = async (
	instance: Instance,
	front: Front,
	intercom: Intercom.Client | null,
	sequence: SyncResult[],
	payload: any,
	threadId: string | { $eval: string },
	emittedDate: Date,
	remoteMessages: any[],
): Promise<Partial<Card> | null> => {
	const message = getMessageText(payload);

	const attachments = (payload.attachments || []).reduce(
		(accumulator: any[], attachment: any) => {
			// Inline attachments, like <img> tags, are already
			// handled by the HTML to markdown conversion step.
			if (attachment.metadata.is_inline) {
				return accumulator;
			}

			accumulator.push({
				url: attachment.url,
				name: attachment.filename,
				mime: attachment.content_type,
				bytesize: attachment.size,
			});

			return accumulator;
		},
		[],
	);

	if (payload.is_draft || !payload._links) {
		return null;
	}

	if (!payload.posted_at && !payload.created_at) {
		return null;
	}

	// For some reason, in Front <-> Discourse integration we get
	// pointless whispers that look like this:
	//
	//   Username: jviotti
	//   Email: juan@resin.io
	//   Signed up: 4 years ago
	//   Written: 147 posts
	//   Read: 509 posts
	//
	// I haven't found a better way to match these.
	if (
		_.isEqual(
			_.chain(message)
				.split('\n')
				.initial()
				.map((line) => {
					return _.first(line.split(':'));
				})
				.value(),
			['Username', 'Email', 'Signed up', 'Written', 'Read'],
		)
	) {
		return null;
	}

	const mirrorId = payload._links.self;
	const type = mirrorId.startsWith('https://api2.frontapp.com/comments/')
		? 'whisper@1.0.0'
		: 'message@1.0.0';

	const date = utils.getDateFromEpoch(payload.posted_at || payload.created_at);
	const currentMessage = await instance.context.getElementByMirrorId(
		type,
		mirrorId,
	);
	const isEmpty = message.length <= 0 && attachments.length === 0;
	if (isEmpty && !currentMessage) {
		return null;
	}

	if (!isEmpty && !currentMessage && attachments.length === 0) {
		const remoteMessage = _.find(remoteMessages, {
			_links: {
				self: mirrorId,
			},
		});

		if (remoteMessage && getMessageText(remoteMessage).trim().length === 0) {
			const remoteDate = utils.getDateFromEpoch(
				remoteMessage.posted_at || remoteMessage.created_at,
			);
			if (remoteDate >= date) {
				return null;
			}
		}
	}

	const object: Partial<Card> = {
		/*
		 * Encoding the mirror id in the slug ensures that we don't
		 * try to insert the same event twice when failing to determine
		 * that there is already an element with the same mirror id
		 * on the database.
		 */
		slug: `${type}-front-${(_.last<string>(mirrorId.split('/')) || '').replace(
			/_/g,
			'-',
		)}`.replace(/[@.]/g, '-'),

		type,
		tags: [],
		links: {},
		markers: [],
		active: !isEmpty || !currentMessage,
		data: {
			timestamp: date.toISOString(),
			target: threadId,
			translateDate: emittedDate.toISOString(),

			mirrors: [mirrorId],
			payload: {
				mentionsUser: [],
				alertsUser: [],
				mentionsGroup: [],
				alertsGroup: [],
				message,
			},
		},
	};

	if (attachments.length > 0) {
		object.data!.payload.attachments = attachments;
	}

	if (currentMessage) {
		// Edited comments
		if (
			emittedDate >
				new Date(
					currentMessage.data.translateDate || currentMessage.data.timestamp,
				) &&
			currentMessage.data.payload.message !== object.data!.payload.message
		) {
			object.slug = currentMessage.slug;
			object.data!.translateDate = emittedDate.toISOString();
		} else {
			return null;
		}
	}

	const actor = await getMessageActor(
		instance.context,
		front,
		intercom,
		payload,
	);
	assert.INTERNAL(null, actor, instance.options.errors.SyncNoActor, () => {
		return `Not actor id for message ${JSON.stringify(payload)}`;
	});

	object.data!.actor = actor;

	for (const element of sequence) {
		if (!element.card.data!.mirrors) {
			continue;
		}

		// Looks like we're already inserting this same event
		if (
			element.card.data!.mirrors.includes(mirrorId) &&
			_.isEqual(object.data!.payload, element.card.data!.payload)
		) {
			return null;
		}
	}

	return object;
};

/**
 * @summary Get the last message from a conversation
 * @function
 * @private
 *
 * @param {Object} instance - sync instance
 * @param {Object} front - front instance
 * @param {Object} intercom - intercom instance
 * @param {Array} sequence - current upsert sequence
 * @param {Object} event - external event
 * @param {Object} targetCard - partial target card
 * @param {Array} remoteMessages - remote messages
 * @returns {Array} new sequence upserts
 */
export const getConversationLastMessage = async (
	instance: Instance,
	front: Front,
	intercom: Intercom.Client,
	sequence: SyncResult[],
	event: any,
	targetCard: any,
	remoteMessages: any[],
) => {
	if (
		!event.data.payload.conversation ||
		!event.data.payload.conversation.last_message
	) {
		return [];
	}

	const root = event.data.payload.conversation.last_message;
	const message = await getMessage(
		instance,
		front,
		intercom,
		sequence,
		root,
		targetCard.id,
		utils.getDateFromEpoch(event.data.payload.emitted_at),
		remoteMessages,
	);
	return utils.postEvent(sequence, message!, targetCard, {
		actor: message ? message!.data!.actor : null,
	});
};

/**
 * @summary Get the message from an event
 * @function
 * @private
 *
 * @param {Object} instance - sync instance
 * @param {Object} front - front instance
 * @param {Object} intercom - intercom instance
 * @param {Array} sequence - current upsert sequence
 * @param {Object} event - external event
 * @param {Object} targetCard - partial target card
 * @param {Array} remoteMessages - remote messages
 * @returns {Array} new sequence upserts
 */
export const getEventMessage = async (
	instance: Instance,
	front: Front,
	intercom: Intercom.Client | null,
	sequence: SyncResult[],
	event: Card,
	targetCard: Card,
	remoteMessages: any[],
) => {
	if (!event.data.payload.target) {
		return [];
	}

	const root = event.data.payload.target.data;
	const message = await getMessage(
		instance,
		front,
		intercom,
		sequence,
		root,
		targetCard.id,
		utils.getDateFromEpoch(event.data.payload.emitted_at),
		remoteMessages,
	);
	return utils.postEvent(sequence, message!, targetCard, {
		actor: message ? message!.data!.actor : null,
	});
};

/**
 * @summary Get the inbox an event belongs to
 * @function
 * @private
 *
 * @param {Object} context - execution context
 * @param {Object} front - front instance
 * @param {Object} event - external event
 * @returns {String} inbox name
 */
export const getEventInbox = async (
	context: SyncIntegrationOptions['context'],
	front: Front,
	event: Card,
) => {
	if (event.data.payload.source._meta.type === 'inboxes') {
		// We don't care about private inboxes, such as a personal inbox
		// which happened to be managed by Front
		const publicInboxes = _.map(
			_.filter(event.data.payload.source.data, {
				is_private: false,
			}),
			'name',
		);

		return findValidInbox(publicInboxes);
	}

	const response = await handleRateLimit(context, () => {
		context.log.info('Front API request', {
			type: 'conversation.listInboxes',
			id: event.data.payload.conversation.id,
		});

		return front.conversation.listInboxes({
			conversation_id: event.data.payload.conversation.id,
		});
	});

	const publicInboxes = _.map(response._results, 'name');

	return findValidInbox(publicInboxes);
};

/**
 * @summary Find and return first valid thread inbox
 * @function
 * @private
 *
 * @param {Array} inboxes - collection of inboxes
 * @returns {Object} found inbox
 */
const findValidInbox = (inboxes: string[]) => {
	return (
		_.find(inboxes, (inbox) => {
			return !_.isNil(getThreadType(inbox));
		}) || _.first(inboxes)
	);
};

/**
 * @summary Get a delta to apply to the thread card
 * @function
 * @private
 *
 * @param {Object} event - external event
 * @returns {Object} delta
 */
export const getThreadDeltaFromEvent = (event: Card) => {
	const delta: Record<string, any> = {};

	if (event.data.payload.type === 'trash') {
		delta.data = delta.data || {};
		delta.data.status = 'archived';
	} else if (
		event.data.payload.type === 'archive' ||
		event.data.payload.conversation.status === 'archived'
	) {
		delta.data = delta.data || {};
		delta.data.status = 'closed';
	} else if (
		event.data.payload.type === 'restore' ||
		event.data.payload.type === 'reopen' ||
		event.data.payload.conversation.status === 'unassigned' ||
		event.data.payload.conversation.status === 'assigned'
	) {
		delta.data = delta.data || {};
		delta.data.status = 'open';
	}

	delta.tags = event.data.payload.conversation.tags.map(
		(tag: { name: string }) => {
			return tag.name;
		},
	);

	return delta;
};

/**
 * @summary Get thread from an event payload
 * @function
 * @private
 *
 * @param {Object} context - execution context
 * @param {Object} front - front instance
 * @param {Object} event - event payload
 * @param {String} inbox - thread inbox
 * @param {String} threadType - thread type
 * @returns {Object} thread card
 */
export const getThread = async (
	context: SyncIntegrationOptions['context'],
	_front: Front,
	event: Card,
	inbox: string,
	threadType: string,
): Promise<
	| Card
	| PartialBy<
			Card,
			| 'active'
			| 'capabilities'
			| 'created_at'
			| 'id'
			| 'links'
			| 'markers'
			| 'requires'
			| 'version'
			| 'updated_at'
	  >
> => {
	const mirrorId = getConversationMirrorId(event);
	const threadCard = await context.getElementByMirrorId(threadType, mirrorId);
	if (threadCard) {
		return threadCard;
	}

	return {
		name: event.data.payload.conversation.subject.replace(/^Re:\s/, ''),
		tags: [],
		links: {},
		markers: [],
		active: true,
		type: threadType,
		slug: `${threadType}-front-${_.last(mirrorId.split('/'))!.replace(
			/_/g,
			'-',
		)}`.replace(/[@.]/g, '-'),
		data: {
			translateDate: utils
				.getDateFromEpoch(event.data.payload.conversation.created_at)
				.toISOString(),
			environment: 'production',
			inbox,
			mirrors: [mirrorId],
			mentionsUser: [],
			alertsUser: [],
			description: '',
			status: 'open',
		},
	};
};

/**
 * @summary Paginate over a Front SDK collection
 * @function
 * @private
 *
 * @param {Object} context - context
 * @param {Function} fn - Front SDK function
 * @param {Object} args - arguments to the function
 * @param {String} [pageToken] - page token
 * @returns {Object[]} results
 */
const frontPaginate = async (
	context: SyncIntegrationOptions['context'],
	fn: (options: Record<string, any>) => Promise<any>,
	args: any,
	pageToken?: string,
): Promise<any[]> => {
	const limit = 100;
	const response = await handleRateLimit(context, () => {
		const options: Record<string, any> = {
			limit,
		};

		if (pageToken) {
			options.page_token = pageToken;
		}

		return fn(Object.assign({}, args, options));
	});

	const results = response._results;

	if (!response._pagination.next) {
		return results;
	}

	const nextPageToken = url.parse(response._pagination.next, true).query
		.page_token;
	const next: any[] = await frontPaginate(context, fn, args, nextPageToken);
	return results.concat(next);
};

/**
 * @summary Get all the whispers from a Front thread
 * @function
 * @private
 *
 * @param {Object} front - front instance
 * @param {Object} context - execution context
 * @param {String} conversationId - conversation id
 * @returns {Object[]} whispers
 */
const getThreadWhispers = async (
	front: Front,
	context: SyncIntegrationOptions['context'],
	conversationId: string,
) => {
	return frontPaginate(
		context,
		(options) => {
			context.log.info('Front API request', {
				type: 'conversation.listComments',
				id: conversationId,
			});

			return front.conversation.listComments(options as any);
		},
		{
			conversation_id: conversationId,
		},
	);
};

/**
 * @summary Get all the messages from a Front thread
 * @function
 * @private
 *
 * @param {Object} front - front instance
 * @param {Object} context - execution context
 * @param {String} conversationId - conversation id
 * @returns {Object[]} messages
 */
const getThreadMessages = async (
	front: Front,
	context: SyncIntegrationOptions['context'],
	conversationId: string,
) => {
	return frontPaginate(
		context,
		(options: any) => {
			context.log.info('Front API request', {
				type: 'conversation.listMessages',
				id: conversationId,
			});

			return front.conversation.listMessages(options);
		},
		{
			conversation_id: conversationId,
		},
	);
};

/**
 * @summary Get Intercom user
 * @function
 * @private
 *
 * @param {Object} context - context
 * @param {Object} intercom - intercom instance
 * @param {String} id - intercom user id
 * @param {Number} retries - retries
 * @returns {Object} user
 */
export const getIntercomUser = async (
	context: SyncIntegrationOptions['context'],
	intercom: Intercom.Client,
	id: string,
	retries = 10,
): Promise<null | IntercomUser> => {
	context.log.info('Getting Intercom User', {
		id,
		retries,
	});

	return new Bluebird<IntercomUser | null>((resolve, reject) => {
		intercom.users.find(
			{
				id,
			},
			(error, user) => {
				if (error) {
					if (error.statusCode === 404) {
						return resolve(null);
					}

					return reject(error);
				}

				return resolve(user.body);
			},
		);
	}).catch((error) => {
		if (error.statusCode === 503 || error.statusCode === 500) {
			return Bluebird.delay(2000).then(() => {
				return getIntercomUser(context, intercom, id, retries - 1);
			});
		}

		error.retries = retries;
		throw error;
	});
};

export const getConversationChannel = async (
	context: Context,
	errors: any,
	front: Front,
	conversationId: string,
	_inboxId: string,
) => {
	/*
	 * (1) Fetch the conversation from the Front API so we can inspect
	 * its last message and determine the last address involved, as
	 * that's the one we should reply as.
	 */
	const conversationResponse = await handleRateLimit(context, () => {
		context.log.info('Front API request', {
			type: 'conversation.get',
			id: conversationId,
		});

		return front.conversation.get({
			conversation_id: conversationId,
		});
	});

	/*
	 * (2) List all the available channels account-wide, to account
	 * for cases where a conversation is moved between inboxes, and
	 * the original channel doesn't exist in the new inbox anymore.
	 */
	const channelsResponse = await handleRateLimit(context, () => {
		context.log.info('Front API request', {
			type: 'channels.get',
		});

		// TODO: Add a method for getting channels to the front SDK so
		// we don't have to use this private method
		// https://github.com/balena-io-modules/front-sdk/blob/master/lib/index.ts#L239
		return front['httpCall'](
			{
				method: 'GET',
				path: 'channels',
			},
			{},
		);
	});

	/*
	 * (3) Lets use the addresses involved in the conversation's
	 * last message as a heuristic to pick the right channels from
	 * that inbox.
	 */
	const lastMessageAddresses = _.reduce<any, string[]>(
		conversationResponse.last_message.recipients,
		(handles, recipient) => {
			// Looks like this can happen in some cases, even though its
			// still unclear why.
			if (!recipient.handle) {
				return handles;
			}

			handles.push(recipient.handle);

			// TODO: This is a temporary solution to cope with the
			// company name change in the support inboxes. The issue
			// is that we look at the handles of the last message in
			// order to find the right channel, but these are still
			// the old handles unless the conversation was updated
			// since then.
			// This should be unnecessary after all conversations
			// to @resin.io are updated.
			if (/@resin\.io$/i.test(recipient.handle)) {
				handles.push(recipient.handle.replace(/@resin\.io$/i, '@balena.io'));
			}

			return handles;
		},
		[],
	);

	const channel = _.find(channelsResponse._results, (result) => {
		return (
			lastMessageAddresses.includes(result.address) ||
			lastMessageAddresses.includes(result.name) ||
			lastMessageAddresses.includes(result.send_as)
		);
	});

	assert.INTERNAL(null, channel, errors.SyncNoExternalResource, () => {
		return [
			`Could not find channel to respond to ${conversationId}`,
			`using message ${conversationResponse.last_message.id}`,
			`and addresses ${lastMessageAddresses.join(', ')}`,
		].join(' ');
	});

	context.log.info('Front channel found', {
		channel: _.omit(channel, ['_links']),
		addresses: lastMessageAddresses,
		conversation: conversationId,
	});

	return channel;
};

/**
 * @summary Get all the whispers and comments from a Front thread
 * @function
 * @private
 *
 * @param {Object} front - front instance
 * @param {Object} context - execution context
 * @param {String} conversationId - conversation id
 * @returns {Object[]} all messages
 */
export const getAllThreadMessages = async (
	front: Front,
	context: Context,
	conversationId: string,
) => {
	return _.flatten(
		await Bluebird.all([
			getThreadWhispers(front, context, conversationId),
			getThreadMessages(front, context, conversationId),
		]),
	);
};
