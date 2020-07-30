/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import * as assert from "@balena/jellyfish-assert";
import * as _ from "lodash";
import * as Bluebird from "bluebird";
import * as utils from "../utils";
import * as marked from "marked";
import { Front } from "front-sdk";
import * as Intercom from "intercom-client";
import * as request from "request-promise";
import {
	Card,
	SyncIntegrationOptions,
	SyncIntegrationInstance,
} from "../../sync-types";
import {
	getAllThreadMessages,
	getConversationLastMessage,
	getConversationChannel,
	getEventInbox,
	getEventMessage,
	getFrontContact,
	getIntercomUser,
	getMessage,
	getThread,
	getThreadDeltaFromEvent,
	getThreadType,
	handleRateLimit,
	getMessageActor,
} from "./helpers";

/**
 * @summary All the thread types we support
 * @constant
 * @private
 */
const ALL_THREAD_TYPES = [
	"sales-thread",
	"support-thread",
	"sales-thread@1.0.0",
	"support-thread@1.0.0",
];

class FrontIntegration implements SyncIntegrationInstance {
	context: SyncIntegrationOptions["context"];
	options: SyncIntegrationOptions;

	front: Front;
	intercom: Intercom.Client | null = null;

	constructor(options: SyncIntegrationOptions) {
		this.options = options;
		this.context = this.options.context;
		this.front = new Front(this.options.token.api);

		if (this.options.token.intercom) {
			this.intercom = new Intercom.Client({
				token: this.options.token.intercom,
			});
		}
	}

	async initialize() {
		return Bluebird.resolve();
	}

	async destroy() {
		return Bluebird.resolve();
	}

	async translate(event: Card) {
		if (!this.options.token.api || !this.options.token.intercom) {
			return [];
		}

		// In Front, these events can happen even before the conversation actually
		// starts, so if we process the events before the actual conversation,
		// then we will correctly detect and sync an empty conversation, which
		// makes little practical sense.
		if (event.data.payload.conversation.status === "invisible") {
			this.context.log.info("Ignoring invisible conversation");
			return [];
		}

		const inbox = await getEventInbox(this.context, this.front, event);
		if (!inbox) {
			this.context.log.info("No event inbox found", {
				event: event.id,
			});

			return [];
		}

		const threadType = getThreadType(inbox);
		if (!threadType) {
			this.context.log.info("No thread type for inbox", {
				inbox,
			});

			return [];
		}

		assert.INTERNAL(
			null,
			ALL_THREAD_TYPES.includes(threadType),
			this.options.errors.SyncInvalidType,
			`Invalid thread type: ${threadType} for inbox ${inbox}`
		);

		const cards = [];

		const actor = await this.getLocalUser(event);
		assert.INTERNAL(null, !!actor, this.options.errors.SyncNoActor, () => {
			return `No actor id for ${JSON.stringify(event)}`;
		});

		const threadActor = await this.getThreadActor(event);
		assert.INTERNAL(
			null,
			!!threadActor,
			this.options.errors.SyncNoActor,
			() => {
				return `No thread actor id for ${JSON.stringify(event)}`;
			}
		);

		const threadCard: Omit<Partial<Card>, "id"> & {
			id?: string | { $eval: string };
			slug: string;
		} = await getThread(this.context, this.front, event, inbox, threadType);
		if (!threadCard.id) {
			this.context.log.info("Creating thread", {
				slug: threadCard.slug,
			});

			cards.push({
				time: utils.getDateFromEpoch(
					event.data.payload.conversation.created_at
				),
				actor: threadActor,
				card: _.cloneDeep(threadCard),
			});
			threadCard.id = {
				$eval: "cards[0].id",
			};
		}

		// Do a recap using the API
		const remoteMessages = await getAllThreadMessages(
			this.front,
			this.context,
			_.last(threadCard.data!.mirrors[0].split("/")) as string
		);

		this.context.log.info("Inserting remote messages", {
			count: remoteMessages.length,
		});

		for (const remoteMessage of remoteMessages) {
			const comment: Partial<Card> | null = await getMessage(
				this,
				this.front,
				this.intercom,
				cards as any,
				remoteMessage,
				threadCard.id,
				utils.getDateFromEpoch(event.data.payload.emitted_at),
				remoteMessages
			);
			cards.push(
				...utils.postEvent(cards, comment as any, threadCard as any, {
					actor: comment ? comment!.data!.actor : null,
				})
			);
		}

		// We still extract any message mentioned in the event itself,
		// just in case the API is not updated by the time we query
		const eventMessage = await getEventMessage(
			this,
			this.front,
			this.intercom,
			cards,
			event,
			threadCard as Card,
			remoteMessages
		);
		if (eventMessage.length > 0) {
			this.context.log.info("Inserting event message");
		}
		cards.push(...eventMessage);

		const lastMessage = await getConversationLastMessage(
			this,
			this.front,
			this.intercom as any,
			cards,
			event,
			threadCard,
			remoteMessages
		);
		if (lastMessage.length > 0) {
			this.context.log.info("Inserting last message");
		}
		cards.push(...lastMessage);

		const date = utils.getDateFromEpoch(event.data.payload.emitted_at);
		const delta = getThreadDeltaFromEvent(event);
		const updatedThreadCard = utils.patchObject(threadCard, delta);

		if (
			updatedThreadCard.data.translateDate &&
			date < new Date(updatedThreadCard.data.translateDate)
		) {
			this.context.log.info("Translate date is a future date");
			return cards;
		}

		if (_.isEqual(updatedThreadCard, threadCard)) {
			this.context.log.info("Thread card remains the same", {
				slug: threadCard.slug,
			});

			if (
				updatedThreadCard.data.translateDate &&
				date > new Date(updatedThreadCard.data.translateDate)
			) {
				if (!_.isEmpty(cards)) {
					const index = _.findLastIndex(cards, {
						card: {
							type: threadType,
						},
					});

					if (index > -1) {
						cards[index].card.data.translateDate = date.toISOString();
						return cards;
					}
				}

				updatedThreadCard.data.translateDate = date.toISOString();
				return cards.concat([
					{
						time: date,
						actor,
						card: updatedThreadCard,
					},
				]);
			}

			return cards;
		}

		updatedThreadCard.data.translateDate = date.toISOString();

		// We make a good enough approximation if we didn't know about the head
		// card, as Front won't tell us precisely when the event happened.
		const creationDate = utils.getDateFromEpoch(
			event.data.payload.conversation.created_at + 1
		);

		return cards.concat([
			{
				time: _.isString(threadCard.id) ? date : creationDate,
				actor,
				card: updatedThreadCard,
			},
		]);
	}

	async mirror(card: Card, options: any) {
		if (!this.options.token.api || !this.options.token.intercom) {
			return [];
		}

		const frontUrl = _.find(card.data.mirrors, (mirror) => {
			return _.startsWith(mirror, "https://api2.frontapp.com");
		});

		this.context.log.info("Mirroring", {
			url: frontUrl,
			remote: card,
		});

		if (ALL_THREAD_TYPES.includes(card.type) && frontUrl) {
			const id = _.last<string>(frontUrl.split("/"));
			const conversation = await handleRateLimit(this.context, () => {
				this.context.log.info("Front API request", {
					type: "conversation.get",
					id,
				});

				return this.front.conversation.get({
					conversation_id: id!,
				});
			});

			let status = "open";
			if (conversation.status === "deleted") {
				status = "archived";
			}

			if (conversation.status === "archived") {
				status = "closed";
			}

			if (
				conversation.subject.replace(/^Re:\s/, "") !== card.name ||
				status !== card.data.status ||
				!_.isEqual(
					_.sortBy(card.tags),
					_.sortBy(_.map(conversation.tags, "name"))
				)
			) {
				let newStatus = conversation.status;
				if (card.data.status === "closed" || card.data.status === "archived") {
					newStatus = "archived";
				}
				if (card.data.status === "open") {
					newStatus = "open";
				}

				this.context.log.info("Updating front thread", {
					conversation: id,
					status: newStatus,
					tags: card.tags,
				});

				const updateOptions: Record<string, any> = {
					conversation_id: id,
					tags: card.tags,
				};

				// Oddly enough Front doesn't like `status=unassigned`,
				// or `status=assigned` and expects this instead.
				if (newStatus === "unassigned") {
					updateOptions.assignee_id = null;
				} else if (newStatus === "assigned") {
					updateOptions.assignee_id = conversation.assignee.id;
				} else {
					updateOptions.status = newStatus;
				}

				this.context.log.info("Updating front conversation", updateOptions);
				await handleRateLimit(this.context, () => {
					this.context.log.info("Front API request", {
						type: "conversation.update",
						id,
					});

					return this.front.conversation.update(updateOptions as any);
				});

				return [
					{
						time: new Date(),
						actor: options.actor,
						card,
					},
				];
			}

			return [];
		}

		// Only external people may create conversations from Front
		if (ALL_THREAD_TYPES.includes(card.type) && !frontUrl) {
			return [];
		}

		const baseType = card.type.split("@")[0];
		if (baseType === "message" || baseType === "whisper") {
			const thread = await this.context.getElementById(card.data.target);
			if (!thread || !ALL_THREAD_TYPES.includes(thread.type)) {
				return [];
			}

			// We have no way to update Front comments or messages
			if (frontUrl) {
				return [];
			}

			const threadFrontUrl = _.find(thread.data.mirrors, (mirror) => {
				return _.startsWith(mirror, "https://api2.frontapp.com");
			});
			if (!threadFrontUrl) {
				return [];
			}

			const response = await handleRateLimit(this.context, () => {
				this.context.log.info("Front API request", {
					type: "teammate.list",
				});

				return this.front.teammate.list();
			});

			const actor = await this.context.getElementById(options.actor);
			if (!actor) {
				return [];
			}

			const author = _.find(response._results, {
				// Front automatically transforms hyphens to
				// underscores in the UI
				username: actor.slug.replace(/^user-/g, "").replace(/-/g, "_"),
			});

			assert.USER(
				null,
				author,
				this.options.errors.SyncExternalRequestError,
				`No Front author that corresponds to ${actor.slug}`
			);

			card.data.mirrors = card.data.mirrors || [];

			if (baseType === "whisper") {
				const conversation = _.last<string>(threadFrontUrl.split("/"));
				const message = card.data.payload.message || "[Empty content]";

				this.context.log.info("Creating front whisper", {
					conversation,
					author: author.id,
					body: message,
				});

				const createResponse = await handleRateLimit(this.context, () => {
					this.context.log.info("Front API request", {
						type: "comment.create",
						id: conversation,
					});

					return this.front.comment.create({
						conversation_id: conversation!,
						author_id: author.id,
						body: message,
					});
				});

				card.data.mirrors.push(createResponse._links.self);
			}

			if (baseType === "message") {
				const conversation = _.last<string>(threadFrontUrl.split("/"));
				const message = card.data.payload.message;
				const html = marked(message, {
					// Enable github flavored markdown
					gfm: true,
					breaks: true,
					headerIds: false,
					sanitize: true,
				});

				this.context.log.info("Creating front message", {
					conversation,
					author: author.id,
					text: message,
					body: html,
				});

				const channel = await getConversationChannel(
					this.context,
					this.options.errors,
					this.front,
					conversation!,
					thread.data.inbox
				);
				const createResponse = await handleRateLimit(this.context, () => {
					this.context.log.info("Front API request", {
						type: "message.reply",
						id: conversation,
					});

					return this.front.message.reply({
						conversation_id: conversation!,
						author_id: author.id,
						body: html,
						channel_id: channel.id,

						/*
						 * Front seems to mess up back ticks by replacing them
						 * with "<br>\n", but for some reason it doesn't mangle
						 * the data if we also pass a plain text version of the
						 * message (?)
						 */
						text: message,

						options: {
							archive: false,
						},
					});
				});

				card.data.mirrors.push(createResponse._links.self);
			}

			return [
				{
					time: new Date(),
					actor: options.actor,
					card,
				},
			];
		}

		return [];
	}

	async getLocalUser(event: Card) {
		if (event.data.payload.source._meta.type === "teammate") {
			// An action done by a rule
			if (!event.data.payload.source.data) {
				return this.context.getActorId({
					handle: this.options.defaultUser,
				});
			}

			this.context.log.info("Getting actor id from payload source", {
				source: event.data.payload.source.data,
			});

			return this.context.getActorId({
				handle: event.data.payload.source.data.username,
				email: event.data.payload.source.data.email,
				name: {
					first: event.data.payload.source.data.first_name,
					last: event.data.payload.source.data.last_name,
				},
			});
		}

		// This seems to be true when there is an event caused
		// by a rule, and not by anyone in particular.
		if (
			event.data.payload.source._meta.type === "api" ||
			event.data.payload.source._meta.type === "gmail" ||
			event.data.payload.source._meta.type === "reminder"
		) {
			if (
				!event.data.payload.target ||
				!event.data.payload.target.data ||
				(event.data.payload.target &&
					!event.data.payload.target.data.author &&
					!event.data.payload.target.data.recipients)
			) {
				return this.context.getActorId({
					handle: this.options.defaultUser,
				});
			}
		}

		return getMessageActor(
			this.context,
			this.front,
			this.intercom,
			event.data.payload.target.data
		);
	}

	async getThreadActor(event: Card) {
		if (
			event.data.payload.conversation &&
			event.data.payload.conversation.recipient
		) {
			if (
				event.data.payload.conversation.recipient._links &&
				event.data.payload.conversation.recipient._links.related
			) {
				const contactUrl =
					event.data.payload.conversation.recipient._links.related.contact;

				if (contactUrl) {
					const id = _.last(_.split(contactUrl, "/"));
					const contact = await getFrontContact(this.context, this.front, id!);

					if (contact) {
						const intercomData = _.find(contact.handles, {
							source: "intercom",
						});

						if (intercomData && this.intercom) {
							const intercomUser = await getIntercomUser(
								this.context,
								this.intercom,
								intercomData.handle
							);
							if (intercomUser) {
								this.context.log.info("Found Intercom user", intercomUser);
								const customAttributes = intercomUser.custom_attributes || {};

								return this.context.getActorId({
									handle: intercomUser.user_id,
									email: intercomUser.email,
									title: customAttributes["Account Type"],
									company: customAttributes.Company,
									country: (intercomUser.location_data as any).country_name,
									city: (intercomUser.location_data as any).city_name,
									name: {
										first: customAttributes["First Name"],
										last: customAttributes["Last Name"],
									},
								});
							}
						}

						if (utils.isEmail(contact.name)) {
							return this.context.getActorId({
								email: contact.name,
							});
						}

						const email = _.find(contact.handles, {
							source: "email",
						});

						if (email && utils.isEmail(email.handle)) {
							return this.context.getActorId({
								email: email.handle,
							});
						}

						return this.context.getActorId({
							handle: contact.name,
						});
					}
				}

				if (
					event.data.payload.conversation.recipient.handle &&
					event.data.payload.conversation.last_message.type !== "intercom"
				) {
					return this.context.getActorId({
						email: event.data.payload.conversation.recipient.handle,
					});
				}
			}

			if (
				this.intercom &&
				event.data.payload.conversation.recipient.role === "from" &&
				event.data.payload.conversation.recipient.handle &&
				!event.data.payload.conversation.recipient._links.related.contact &&
				!event.data.payload.conversation.recipient.handle.includes("@")
			) {
				const intercomUser = await getIntercomUser(
					this.context,
					this.intercom,
					event.data.payload.conversation.recipient.handle
				);

				if (intercomUser) {
					this.context.log.info("Found Intercom user", intercomUser);
					const customAttributes = intercomUser.custom_attributes || {};
					return this.context.getActorId({
						handle: intercomUser.user_id,
						email: intercomUser.email,
						title: customAttributes["Account Type"],
						company: customAttributes.Company,
						country: (intercomUser.location_data as any).country_name,
						city: (intercomUser.location_data as any).city_name,
						name: {
							first: customAttributes["First Name"],
							last: customAttributes["Last Name"],
						},
					});
				}
			}
		}

		if (
			event.data.payload.target &&
			event.data.payload.target._meta &&
			event.data.payload.target._meta.type === "message" &&
			event.data.payload.target.data &&
			!event.data.payload.target.data.is_inbound
		) {
			const target = _.find(event.data.payload.target.data.recipients, {
				role: "to",
			});

			if (target) {
				const id = _.last(
					_.split(target._links.related.contact, "/")
				) as string;
				const contact = await getFrontContact(this.context, this.front, id);

				if (contact && contact.name) {
					return this.context.getActorId({
						handle: contact.name,
					});
				}
			}
		}

		// Fallback to the event actor
		return this.getLocalUser(event);
	}

	/**
	 * @summary Fetches a file from the front API and returns it as a buffer
	 * @public
	 * @function
	 *
	 * @param {String} file - The slug of the file to download
	 * @returns {Buffer}
	 */
	async getFile(file: string) {
		if (!this.options.token.api) {
			return null;
		}

		const requestOpts = {
			headers: {
				Authorization: `Bearer ${this.options.token.api}`,
			},
			url: `https://api2.frontapp.com/download/${file}`,

			// Setting encoding to null is very important for downloading the full
			// file as it makes the 'request' package expect binary data; without it
			// the file ends up corrupted
			encoding: null,
		};

		try {
			const response = await request(requestOpts);
			return Buffer.from(response, "utf8");
		} catch (error) {
			assert.USER(
				null,
				error.statusCode !== 500,
				this.options.errors.SyncExternalRequestError,
				`Front crashed with ${error.statusCode} when fetching attachment ${file}`
			);

			// Because the response is a buffer, the error is sent as a buffer as well
			if (_.isBuffer(error.error)) {
				const errorMessage = Buffer.from(error.error, "utf8").toString();
				let parsedError: Record<string, any> = {};
				try {
					parsedError = JSON.parse(errorMessage);
				} catch (parseError) {
					throw new Error(`Unable to parse response payload: ${errorMessage}`);
				}

				if (parsedError._error) {
					parsedError = parsedError._error;
					let newErrorMessage = `Received error from Front API: ${parsedError.status} - ${parsedError.title}`;
					if (parsedError.message) {
						newErrorMessage = `${newErrorMessage}: ${parsedError.message}`;
					}
					throw new Error(newErrorMessage);
				} else {
					throw new Error(
						`Received unknown error response from from Front API: ${errorMessage}`
					);
				}
			}

			// Get the original request error object
			// See https://github.com/request/request-promise
			if (_.isError(error.error)) {
				throw error.error;
			} else if (_.isError(error.cause)) {
				throw error.cause;
			}

			throw error;
		}
	}
}

export const create = (options: SyncIntegrationOptions) => {
	return new FrontIntegration(options);
};

// TODO: Validate incoming front webhooks - https://dev.frontapp.com/docs/channels-security
export const isEventValid = async () => true;
