/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

const crypto = require('crypto')
const Bluebird = require('bluebird')
const _ = require('lodash')

module.exports = class TypeformIntegration {
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

	// eslint-disable-next-line class-methods-use-this
	async mirror (card, options) {
		return []
	}

	// eslint-disable-next-line class-methods-use-this
	async translate (event) {
		if (!this.options.token || !this.options.token.signature) {
			return []
		}
		const adminActorId = await this.context.getActorId({
			handle: this.options.defaultUser
		})
		const formResponse = event.data.payload.form_response
		const formId = formResponse.form_id
		const responseId = formResponse.token
		const slug = `form-response-${formId}-${responseId}`
		const formResponseMirrorId = `https://api.typeform.com/forms/${formId}/responses?included_response_ids=${responseId}`
		const username = /\s/.test(formResponse.hidden.user) ? null : formResponse.hidden.user
		const timestamp = new Date(formResponse.submitted_at).toISOString()
		const questionsToProps = {
			'How did you first hear about balenaCloud?': 'howDidYouFirstHearAboutBalenaCloud',
			'How would you describe your role?': 'howWouldYouDescribeYourRole',
			'Could you briefly describe your use case?': 'couldYouBrieflyDescribeYourUsecase',
			// eslint-disable-next-line max-len
			'How has your experience been so far? What can we improve? We count on your honest feedback to make balenaCloud better.': 'howHasYourExperienceBeenSoFar',
			'How likely are you to recommend balenaCloud to a friend or co-worker?': 'howLikelyAreYouToRecommendBalenaCloud'
		}
		const data = _.chain(_.zip(formResponse.definition.fields, formResponse.answers))
			.map((pair) => {
				if (!questionsToProps[pair[0].title]) {
					// The only questions we currently support are the ones in questionsToProps keys.
					// Any other question is ommited
					return []
				}
				return [ questionsToProps[pair[0].title], pair[1][pair[1].type] ]
			})
			.filter(_.size)
			.fromPairs()
			.assign({
				mirrors: [ formResponseMirrorId ],
				user: username,
				timestamp
			})
			.value()
		return [ {
			time: timestamp,
			actor: adminActorId,
			card: {
				name: '',
				type: 'user-feedback@1.0.0',
				slug,
				active: true,
				tags: [],
				requires: [],
				capabilities: [],
				data
			}
		} ]
	}
}

module.exports.isEventValid = (token, rawEvent, headers) => {
	const signature = headers['typeform-signature']
	if (!signature || !token || !token.signature) {
		return false
	}

	const hash = crypto.createHmac('sha256', token.signature)
		.update(rawEvent)
		.digest('base64')
	return signature === `sha256=${hash}`
}
