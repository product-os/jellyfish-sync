/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

const pipeline = require('./pipeline')
const _ = require('lodash')
const assert = require('@balena/jellyfish-assert')
const instance = require('./instance')
const oauth = require('./oauth')
const errors = require('./errors')
const syncContext = require('./sync-context')
const metrics = require('@balena/jellyfish-metrics')

/**
 * Jellyfish sync library module.
 *
 * @module sync
 */

exports.Sync = class Sync {
	constructor (options = {}) {
		this.integrations = options.integrations || {}
		this.errors = errors
		this.pipeline = pipeline
	}

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
	getAssociateUrl (integration, token, slug, options) {
		const Integration = this.integrations[integration]
		if (!Integration || !token || !token.appId) {
			return null
		}

		return oauth.getAuthorizeUrl(
			Integration.OAUTH_BASE_URL, Integration.OAUTH_SCOPES, slug, {
				appId: token.appId,
				redirectUri: options.origin
			})
	}

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
	async authorize (integration, token, context, options) {
		const Integration = context.OAUTH_INTEGRATIONS ? context.OAUTH_INTEGRATIONS[integration] : this.integrations[integration]

		assert.INTERNAL(context, Integration,
			errors.SyncNoCompatibleIntegration,
			`There is no compatible integration for provider: ${integration}`)

		assert.INTERNAL(context, token && token.appId && token.appSecret,
			errors.SyncNoIntegrationAppCredentials,
			`No application credentials found for integration: ${integration}`)

		return oauth.getAccessToken(
			Integration.OAUTH_BASE_URL, options.code, {
				appId: token.appId,
				appSecret: token.appSecret,
				redirectUri: options.origin
			})
	}

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
	async whoami (context, integration, credentials) {
		const Integration = context.OAUTH_INTEGRATIONS ? context.OAUTH_INTEGRATIONS[integration] : this.integrations[integration]

		assert.INTERNAL(context, Integration,
			errors.SyncNoCompatibleIntegration,
			`There is no compatible integration for provider: ${integration}`)

		return Integration.whoami(
			context,
			credentials,
			{
				errors
			})
	}

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
	async match (context, integration, externalUser, options) {
		const Integration = context.OAUTH_INTEGRATIONS ? context.OAUTH_INTEGRATIONS[integration] : this.integrations[integration]

		assert.INTERNAL(context, Integration,
			errors.SyncNoCompatibleIntegration,
			`There is no compatible integration for provider: ${integration}`)

		const user = await Integration.match(
			context,
			externalUser,
			{
				errors,
				slug: `${options.slug}@latest`
			})

		if (user) {
			assert.INTERNAL(context, user.slug === options.slug,
				errors.SyncNoMatchingUser,
				`Could not find matching user for provider: ${integration}, slugs do not match ${user.slug} !== ${options.slug}`)
		}

		return user
	}

	async getExternalUserSyncEventData (context, integration, externalUser) {
		const Integration = context.OAUTH_INTEGRATIONS ? context.OAUTH_INTEGRATIONS[integration] : this.integrations[integration]

		assert.INTERNAL(context, Integration,
			errors.SyncNoCompatibleIntegration,
			`There is no compatible integration for provider: ${integration}`)

		const event = await Integration.getExternalUserSyncEventData(
			context,
			externalUser, {
				errors
			}
		)

		assert.INTERNAL(context, event,
			errors.SyncNoMatchingUser,
			'Could not generate external user sync event')

		return event
	}

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
	async associate (integration, userCard, credentials, context) {
		const Integration = context.OAUTH_INTEGRATIONS ? context.OAUTH_INTEGRATIONS[integration] : this.integrations[integration]

		assert.INTERNAL(context, Integration,
			errors.SyncNoCompatibleIntegration,
			`There is no compatible integration: ${integration}`)

		/*
		* Set the access token in the user card.
		*/
		_.set(userCard, [ 'data', 'oauth', integration ], credentials)
		return context.upsertElement(
			userCard.type, _.omit(userCard, [ 'type' ]), {
				timestamp: new Date()
			})
	}

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
	 * @param {Object} context - execution context
	 * @returns {Boolean} whether the external event should be accepted or not
	 */
	async isValidEvent (integration, token, event, context) {
		const Integration = this.integrations[integration]
		if (!Integration || !token) {
			return false
		}

		return Integration.isEventValid(token, event.raw, event.headers, context)
	}

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
	async mirror (integration, token, card, context, options) {
		if (!token) {
			context.log.warn('Ignoring mirror as there is no token', {
				integration
			})

			return []
		}

		const Integration = this.integrations[integration]
		if (!Integration) {
			context.log.warn(
				'Ignoring mirror as there is no compatible integration', {
					integration
				})

			return []
		}

		return pipeline.mirrorCard(Integration, card, {
			actor: options.actor,
			origin: options.origin,
			defaultUser: options.defaultUser,
			provider: integration,
			token,
			context
		})
	}

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
	async translate (integration, token, card, context, options) {
		if (!token) {
			context.log.warn('Ignoring translate as there is no token', {
				integration
			})

			return []
		}

		const Integration = this.integrations[integration]
		if (!Integration) {
			context.log.warn(
				'Ignoring mirror as there is no compatible integration', {
					integration
				})

			return []
		}

		context.log.info('Translating external event', {
			id: card.id,
			slug: card.slug,
			integration
		})

		const cards = await metrics.measureTranslate(integration, async () => {
			return pipeline.translateExternalEvent(
				Integration, card, {
					actor: options.actor,
					origin: options.origin,
					defaultUser: options.defaultUser,
					provider: integration,
					token,
					context
				})
		})

		context.log.info('Translated external event', {
			slugs: cards.map((translatedCard) => {
				return translatedCard.slug
			})
		})

		return cards
	}

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
	getFile (integration, token, file, context, options) {
		if (!token) {
			context.log.warn('Not fetching file as there is no token', {
				integration
			})

			return null
		}

		const Integration = this.integrations[integration]
		if (!Integration) {
			context.log.warn(
				'Ignoring mirror as there is no compatible integration', {
					integration
				})

			return null
		}

		context.log.info('Retrieving external file', {
			file,
			integration
		})

		return instance.run(Integration, token, async (integrationInstance) => {
			return integrationInstance.getFile(file)
		}, {
			actor: options.actor,
			provider: integration,
			context
		})
	}

	// eslint-disable-next-line class-methods-use-this
	getActionContext (provider, workerContext, context, session) {
		return syncContext.getActionContext(provider, workerContext, context, session)
	}
}
