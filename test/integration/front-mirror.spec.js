/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

/* eslint-disable no-underscore-dangle */

const ava = require('ava')
const _ = require('lodash')
const sinon = require('sinon')
const {
	v4: uuid
} = require('uuid')
const Front = require('front-sdk').Front
const Bluebird = require('bluebird')
const environment = require('@balena/jellyfish-environment')
const TOKEN = environment.integration.front
const mirror = require('../../lib/index').mirror

// Because Front might take a while to process
// message creation requests.
// See: https://dev.frontapp.com/#receive-custom-message
const retryWhile404 = async (fn, times = 5) => {
	try {
		return await fn()
	} catch (error) {
		if (error.status === 404 && times > 0) {
			await Bluebird.delay(500)
			return retryWhile404(fn, times - 1)
		}

		throw error
	}
}

const retryWhile429 = async (fn, times = 100) => {
	try {
		return await fn()
	} catch (error) {
		if (error.name === 'FrontError' && error.status === 429 && times > 0) {
			const delay = _.parseInt(_.first(error.message.match(/(\d+)/))) || 2000
			await Bluebird.delay(delay)
			return retryWhile429(fn, times - 1)
		}

		throw error
	}
}

const wait = async (fn, check, times = 8) => {
	const result = await fn()
	if (check(result)) {
		return result
	}

	if (times <= 0) {
		throw new Error('Timeout while waiting for check condition')
	}

	await Bluebird.delay(1000)
	return wait(fn, check, times - 1)
}

const listResourceUntil = async (fn, id, predicate, retries = 10) => {
	const result = await retryWhile429(() => {
		return fn({
			conversation_id: id
		})
	})

	// eslint-disable-next-line no-underscore-dangle
	const elements = result._results.filter((element) => {
		// Ignore webhook errors, as we know already that
		// we are not listening to them in these tests.
		return element.error_type !== 'webhook_timeout'
	})

	if (predicate(elements)) {
		return elements
	}

	if (retries <= 0) {
		throw new Error('Condition never true')
	}

	await Bluebird.delay(1000)
	return listResourceUntil(fn, id, predicate, retries - 1)
}

const sandbox = sinon.createSandbox()

const testMirroringOfComment = async (test, {
	message
}) => {
	const supportThread = await test.context.startSupportThread(
		`My Issue ${uuid()}`,
		`Foo Bar ${uuid()}`,
		test.context.inboxes[0])

	const messageCard = test.context.constructEvent({
		actor: test.context.mirrorOptions.actor,
		target: supportThread.id,
		message,
		type: 'whisper'
	})

	const getElementById = sandbox.stub()
		.onCall(0).resolves(supportThread)
		.onCall(1).resolves(test.context.user)

	const context = {
		...test.context.mirrorContext,
		getElementById
	}

	const [ syncedMessageCard ] = await mirror(
		'front', TOKEN, messageCard, context, test.context.mirrorOptions)

	test.is(syncedMessageCard.data.payload.message, message)
	test.truthy(syncedMessageCard.data.mirrors[0])

	const comments = await test.context.getFrontCommentsUntil(
		_.last(supportThread.data.mirrors[0].split('/')), (elements) => {
			return elements.length > 0
		})

	test.is(comments.length, 1)

	// Verify that the comments returned contain the expected value
	test.is(comments[0].body, message)
}

const testArchivingOfThread = async (test, {
	status
}) => {
	const supportThread = await test.context.startSupportThread(
		`My Issue ${uuid()}`,
		`Foo Bar ${uuid()}`,
		test.context.inboxes[0])

	const updatedSupportThread = _.merge({}, supportThread, {
		data: {
			status
		}
	})

	const context = {
		...test.context.mirrorContext
	}

	const [ syncedThreadCard ] = await mirror(
		'front', TOKEN, updatedSupportThread, context, test.context.mirrorOptions)

	test.is(syncedThreadCard.id, supportThread.id)

	const result = await wait(() => {
		return retryWhile429(() => {
			return test.context.front.conversation.get({
				conversation_id: _.last(supportThread.data.mirrors[0].split('/'))
			})
		})
	}, (conversation) => {
		return conversation.status === 'archived'
	})

	test.is(result.status, 'archived')
}

ava.serial.before(async (test) => {
	test.context.mirrorContext = {
		log: {
			warn: sandbox.stub().returns(null),
			debug: sandbox.stub().returns(null),
			info: sandbox.stub().returns(null),
			error: sandbox.stub().returns(null)
		},
		upsertElement: async (type, object) => {
			return object
		}
	}

	test.context.user = {
		id: uuid(),
		data: {
			email: 'accounts-front-dev@example.com',
			avatar: null
		},
		name: null,
		slug: 'user-accounts-front-dev',
		type: 'user@1.0.0',
		active: true,
		markers: [],
		version: '1.0.0'
	}

	test.context.mirrorOptions = {
		actor: test.context.user.id,
		defaultUser: 'admin',
		origin: 'https://jel.ly.fish/oauth/front'
	}

	test.context.generateRandomSlug = (options) => {
		const suffix = uuid()
		if (options.prefix) {
			return `${options.prefix}-${suffix}`
		}

		return suffix
	}

	if (TOKEN) {
		test.context.front = new Front(TOKEN.api)
	}

	test.context.inboxes = environment.test.integration.front.inboxes

	const teammates = await retryWhile429(() => {
		return test.context.front.inbox.listTeammates({
			inbox_id: test.context.inboxes[0]
		})
	})

	// Find the first available teammate for the tests
	// eslint-disable-next-line no-underscore-dangle
	const teammate = _.find(teammates._results, {
		is_available: true
	})
	if (!teammate) {
		throw new Error(`No available teammate for inbox ${test.context.inboxes[0]}`)
	}

	test.context.teammate = teammate.username

	test.context.getMessageSlug = () => {
		return test.context.generateRandomSlug({
			prefix: 'message'
		})
	}

	test.context.getWhisperSlug = () => {
		return test.context.generateRandomSlug({
			prefix: 'whisper'
		})
	}

	test.context.startSupportThread = async (title, description, inbox) => {
		// We need a "custom" channel in order to simulate an inbound
		const channels = await retryWhile429(() => {
			return test.context.front.inbox.listChannels({
				inbox_id: inbox
			})
		})

		// eslint-disable-next-line no-underscore-dangle
		const channel = _.find(channels._results, {
			type: 'custom'
		})
		if (!channel) {
			throw new Error('No custom channel to simulate inbound')
		}

		const inboundResult = await retryWhile429(() => {
			return test.context.front.message.receiveCustom({
				channel_id: channel.id,
				subject: title,
				body: description,
				sender: {
					handle: `jellytest-${uuid()}`
				}
			})
		})

		const message = await retryWhile404(async () => {
			return retryWhile429(() => {
				return test.context.front.message.get({
					// The "receive custom" endpoint gives us a uid,
					// while all the other endpoints take an id.
					// Front supports interpreting a uid as an id
					// using this alternate notation.
					message_id: `alt:uid:${inboundResult.message_uid}`
				})
			})
		})

		const remoteInbox = await retryWhile429(() => {
			return test.context.front.inbox.get({
				inbox_id: test.context.inboxes[0]
			})
		})

		const slug = test.context.generateRandomSlug({
			prefix: 'support-thread'
		})

		const supportThread = {
			id: uuid(),
			name: title,
			slug,
			tags: [],
			type: 'support-thread@1.0.0',
			active: true,
			markers: [],
			version: '1.0.0',
			data: {
				environment: 'production',
				inbox: remoteInbox.name,
				status: 'open',
				mirrors: [ message._links.related.conversation ],
				description,
				alertsUser: [],
				mentionsUser: []
			},
			requires: [],
			capabilities: []
		}

		return supportThread
	}

	test.context.getFrontCommentsUntil = async (id, fn) => {
		return listResourceUntil(
			test.context.front.conversation.listComments, id, fn)
	}

	test.context.getFrontMessagesUntil = async (id, filter, fn) => {
		const results = await listResourceUntil(
			test.context.front.conversation.listMessages, id, (elements) => {
				return fn(_.filter(elements, filter))
			})

		return _.filter(results, filter)
	}

	test.context.constructEvent = ({
		type, actor, target, message
	}) => {
		return {
			id: uuid(),
			data: {
				actor,
				target,
				payload: {
					message
				},
				timestamp: (new Date()).toISOString()
			},
			name: null,
			slug: type === 'message' ? test.context.getMessageSlug() : test.context.getWhisperSlug(),
			type: `${type}@1.0.0`,
			active: true,
			version: '1.0.0'
		}
	}
})

ava.serial.beforeEach(async (test) => {
	test.timeout(1000 * 60 * 5)
})

ava.serial.afterEach(() => {
	sandbox.restore()
})

// Skip all tests if there is no Front token
const avaTest = _.some(_.values(TOKEN), _.isEmpty) || environment.test.integration.skip ? ava.serial.skip : ava.serial

avaTest('should be able to comment using a complex code', async (test) => {
	await testMirroringOfComment(test, {
		// eslint-disable-next-line max-len
		message: 'One last piece of the puzzle is to get the image url to pull. To get that you can run this from the browser console or sdk. \n\n`(await sdk.pine.get({ resource: \'release\', id: <release-id>, options: { $expand: { image__is_part_of__release: { $expand: { image: { $select: [\'is_stored_at__image_location\'] } } }} } })).image__is_part_of__release.map(({ image }) => image[0].is_stored_at__image_location )`\n'
	})
})

avaTest('should be able to comment using triple backticks', async (test) => {
	await testMirroringOfComment(test, {
		message: '```Foo\nBar```'
	})
})

avaTest('should be able to comment using brackets', async (test) => {
	await testMirroringOfComment(test, {
		message: 'Hello <world> foo <bar>'
	})
})

avaTest('should be able to reply to a moved inbound message', async (test) => {
	const supportThread = await test.context.startSupportThread(
		`My Issue ${uuid()}`,
		`Foo Bar ${uuid()}`,
		test.context.inboxes[0])

	const conversationId = _.last(supportThread.data.mirrors[0].split('/'))

	await retryWhile429(() => {
		return test.context.front.conversation.update({
			conversation_id: conversationId,
			inbox_id: test.context.inboxes[1]
		})
	})

	const message = 'Message in another inbox'

	const messageCard = test.context.constructEvent({
		actor: test.context.mirrorOptions.actor,
		target: supportThread.id,
		message,
		type: 'message'
	})

	const getElementById = sandbox.stub()
		.onCall(0).resolves(supportThread)
		.onCall(1).resolves(test.context.user)

	const context = {
		...test.context.mirrorContext,
		getElementById
	}

	const [ syncedMessageCard ] = await mirror(
		'front', TOKEN, messageCard, context, test.context.mirrorOptions)

	test.is(syncedMessageCard.data.payload.message, message)
	test.truthy(syncedMessageCard.data.mirrors[0])

	const messages = await test.context.getFrontMessagesUntil(conversationId, {
		is_draft: false
	}, (elements) => {
		return elements.length > 1
	})

	test.is(messages.length, 2)

	// Verify that the messages returned contain the expected value
	test.is(messages[0].body, `<p>${message}</p>\n`)
})

avaTest('should be able to close an inbound message', async (test) => {
	await testArchivingOfThread(test, {
		status: 'closed'
	})
})

avaTest('should be able to archive an inbound message', async (test) => {
	await testArchivingOfThread(test, {
		status: 'archived'
	})
})
