/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

module.exports = class NoOpIntegration {
	/**
	 * @summary The NoOp sync integration
	 * @class
	 * @public
	 *
	 * @param {Object} options - options
	 *
	 * @description
	 * Mainly for testing purposes.
	 *
	 * @example
	 * const integration = new NoOpIntegration({ ... })
	 */
	constructor (options) {
		this.initialized = false
		this.destroyed = false
		this.options = options
	}

	/**
   * @summary Initialize the integration
   * @function
   * @public
	 *
   * @example
	 * const integration = new NoOpIntegration()
	 * await integration.initialize()
   */
	async initialize () {
		if (this.initialized) {
			throw new Error('The integration is already initialized')
		}

		this.initialized = true
	}

	/**
   * @summary Destroy the integration
   * @function
   * @public
	 *
   * @example
	 * const integration = new NoOpIntegration()
	 * await integration.initialize()
	 * await integration.destroy()
   */
	async destroy () {
		if (!this.initialized) {
			throw new Error('The integration was not initialized')
		}

		if (this.destroyed) {
			throw new Error('The integration was already destroyed')
		}

		this.destroyed = true
	}

	/**
   * @summary Translate an external event
   * @function
   * @public
	 *
	 * @param {Object} event - external event card
	 * @returns {Array} card sequence
   *
   * @example
	 * const integration = new NoOpIntegration()
	 * await integration.initialize()
	 *
	 * const sequence = await integration.translate({ ... })
   */
	// eslint-disable-next-line class-methods-use-this
	async translate (event) {
		if (!this.initialized) {
			throw new Error('The integration is not initialized')
		}

		if (this.destroyed) {
			throw new Error('The integration is destroyed')
		}

		return [
			{
				time: new Date(),
				actor: event.data.payload.actor,
				card: {
					type: 'card@1.0.0',
					slug: event.slug,
					version: '1.0.0',
					data: {
						payload: event.data.payload
					}
				}
			}
		]
	}
}
