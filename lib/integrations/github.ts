/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import * as _ from 'lodash';
import * as crypto from 'crypto';
import { throttling } from '@octokit/plugin-throttling';
import { retry } from '@octokit/plugin-retry';
import { Octokit as OctokitRest } from '@octokit/rest';
import * as authApp from '@octokit/auth-app';
import * as Bluebird from 'bluebird';
import * as utils from './utils';
import {
	Card,
	SyncIntegrationInstance,
	SyncIntegrationOptions,
	SyncResult,
} from '../sync-types';

const uuid = require('@balena/jellyfish-uuid');
const assert = require('@balena/jellyfish-assert');
const packageJSON = require('../../package.json');

const Octokit = OctokitRest.plugin(retry, throttling);

const GITHUB_API_REQUEST_LOG_TITLE = 'GitHub API Request';
const GITHUB_API_RETRY_COUNT = 5;

const githubRequest = async (
	fn: any,
	arg: any,
	options: any,
	retries = 5,
): Promise<any> => {
	const result = await fn(arg);

	if (result.status >= 500) {
		assert.USER(
			null,
			retries > 0,
			options.errors.SyncExternalRequestError,
			() => {
				return `GitHub unavailable ${result.status}: ${JSON.stringify(
					result.data,
					null,
					2,
				)}`;
			},
		);

		options.context.log.warn('GitHub unavailable retry', {
			retries,
		});

		await Bluebird.delay(5000);
		return githubRequest(fn, arg, options, retries - 1);
	}

	return result;
};

const getEventRoot = (event: Card) => {
	return event.data.payload.issue || event.data.payload.pull_request;
};

const getEventMirrorId = (event: Card) => {
	return getEventRoot(event).html_url;
};

const getCommentMirrorIdFromEvent = (event: Card) => {
	return event.data.payload.comment.html_url;
};

const revertEventChanges = (event: Card, object: any) => {
	const previousEvent = _.cloneDeep(event);
	_.each(event.data.payload.changes, (value, key) => {
		previousEvent.data.payload[object][key] = value.from;
	});

	Reflect.deleteProperty(previousEvent.data.payload, 'changes');
	return previousEvent;
};

const updateCardFromSequence = (
	sequence: Array<{ time: Date; card: any; actor: string }>,
	index: number,
	changes: {
		data?:
			| { status: string }
			| { timestamp: string; payload: { message: any } }
			| { status: string };
		active?: boolean;
		tags?: string[] | undefined;
	},
) => {
	const card = _.cloneDeep(sequence[index].card);
	_.merge(card, changes);
	card.id = {
		$eval: `cards[${index}].id`,
	};

	return card;
};

const gatherPRInfo = (payload: { pull_request: any }) => {
	const base = payload.pull_request.base;
	const head = payload.pull_request.head;
	return {
		base: {
			branch: base.ref,
			sha: base.sha,
		},
		head: {
			branch: head.ref,
			sha: head.sha,
		},
	};
};

const normaliseRootID = (id: string) => {
	return id.replace(/[=]/g, '').toLowerCase();
};

const eventToCardType = (event: Card) => {
	return event.data.payload.pull_request ||
		(event.data.payload.issue && event.data.payload.issue.pull_request)
		? 'pull-request@1.0.0'
		: 'issue@1.0.0';
};

const makeCard = (card: any, actor: string, time?: string | number) => {
	let date = new Date();
	if (time) {
		date = new Date(time);
	}

	return {
		time: date,
		card,
		actor,
	};
};

const getCommentFromEvent = async (
	_context: SyncIntegrationOptions['context'],
	event: Card,
	options: {
		actor: any;
		time: any;
		target: any;
		targetCard: any;
		offset: any;
		active: any;
	},
) => {
	const date = new Date(event.data.payload.comment.updated_at);

	const data = {
		mirrors: [getCommentMirrorIdFromEvent(event)],
		actor: options.actor,
		target: options.target,
		timestamp: date.toISOString(),
		payload: {
			mentionsUser: [],
			alertsUser: [],
			mentionsGroup: [],
			alertsGroup: [],
			message: event.data.payload.comment.body,
		},
	};

	const id = await uuid.random();
	const slug = `message-${id}`;

	return [
		makeCard(
			{
				slug,
				type: 'message@1.0.0',
				active: options.active,
				data,
			},
			options.actor,
			options.time,
		),
		makeCard(
			{
				slug: `link-${slug}-is-attached-to-${options.targetCard.slug}`,
				type: 'link@1.0.0',
				name: 'is attached to',
				data: {
					inverseName: 'has attached element',
					from: {
						id: {
							$eval: `cards[${options.offset}].id`,
						},
						type: 'message@1.0.0',
					},
					to: {
						id: options.target,
						type: options.targetCard.type,
					},
				},
			},
			options.actor,
			options.time,
		),
	];
};

class GitHubIntegration implements SyncIntegrationInstance {
	options: SyncIntegrationOptions;
	context: SyncIntegrationOptions['context'];

	constructor(options: SyncIntegrationOptions) {
		this.options = options;
		this.context = this.options.context;
	}

	async initialize() {
		return Bluebird.resolve();
	}

	async destroy() {
		return Bluebird.resolve();
	}

	async getOctokit(
		context: SyncIntegrationOptions['context'],
		installationId?: string,
	) {
		const octokitOptions: Record<string, any> = {
			request: {
				retries: GITHUB_API_RETRY_COUNT,
			},
			userAgent: `${packageJSON.name} v${packageJSON.version}`,
			throttle: {
				onRateLimit: (
					_retryAfter: any,
					retryOptions: { request: { retryCount: number } },
				) => {
					return retryOptions.request.retryCount <= GITHUB_API_RETRY_COUNT;
				},
				onAbuseLimit: (
					_retryAfter: any,
					retryOptions: { request: { retryCount: number } },
				) => {
					return retryOptions.request.retryCount <= GITHUB_API_RETRY_COUNT;
				},
			},
		};

		if (installationId && this.options.token.key && this.options.token.appId) {
			context.log.info('Using GitHub App based authentication');
			octokitOptions.authStrategy = authApp.createAppAuth;
			octokitOptions.auth = {
				id: _.parseInt(this.options.token.appId),
				privateKey: Buffer.from(this.options.token.key, 'base64').toString(),
			};

			const github = new Octokit(octokitOptions);
			const { token } = (await github.auth({
				type: 'installation',
				installationId,
			})) as any;

			Reflect.deleteProperty(octokitOptions, 'authStrategy');
			octokitOptions.auth = token;
			return new Octokit(octokitOptions);
		}

		if (this.options.token.api) {
			context.log.info('Using token based authentication');
			octokitOptions.auth = this.options.token.api;
			return new Octokit(octokitOptions);
		}

		return null;
	}

	async mirror(card: Card, options: { actor: string }) {
		if (!this.options.token.api) {
			this.context.log.warn('No token set for github integration');
			return [];
		}

		if (!this.options.token.key) {
			this.context.log.warn('No private key set for github integration');
			return [];
		}

		const github = await this.getOctokit(this.context);
		if (!github) {
			this.context.log.warn('Could not authenticate with GitHub');
			return [];
		}

		const githubUrl = _.find(card.data.mirrors, (mirror) => {
			return _.startsWith(mirror, 'https://github.com');
		});

		this.context.log.info('Mirroring', {
			url: githubUrl,
			remote: card,
		});

		const actorCard = await this.context.getElementById(options.actor);
		const username = _.get(actorCard, ['slug'], 'unknown').replace(
			/^user-/,
			'',
		);
		const prefix = `[${username}]`;
		const baseType = card.type.split('@')[0];

		if (
			(baseType === 'issue' || baseType === 'pull-request') &&
			card.data.repository
		) {
			const [owner, repository] = card.data.repository.split('/');

			if (!githubUrl) {
				this.context.log.debug(GITHUB_API_REQUEST_LOG_TITLE, {
					category: 'issues',
					action: 'create',
				});

				const result = await githubRequest(
					github.issues.create,
					{
						owner,
						repo: repository,
						title: card.name,
						body: `${prefix} ${card.data.description}`,
						labels: card.tags,
					},
					this.options,
				);

				card.data.mirrors = card.data.mirrors || [];
				card.data.mirrors.push(result.data.html_url);

				return [makeCard(card, options.actor)];
			}

			this.context.log.debug(GITHUB_API_REQUEST_LOG_TITLE, {
				category: baseType === 'pull-request' ? 'pulls' : 'issues',
				action: 'get',
			});

			const urlFragments = githubUrl.split('/');
			const entityNumber = _.parseInt(_.last<string>(urlFragments)!);

			assert.INTERNAL(
				null,
				_.isNumber(entityNumber) && !_.isNaN(entityNumber),
				this.options.errors.SyncInvalidEvent,
				`No entity number in GitHub URL: ${githubUrl}`,
			);

			const getOptions = {
				owner: urlFragments[3],
				repo: urlFragments[4],
				[baseType === 'pull-request'
					? 'pull_number'
					: 'issue_number']: entityNumber,
			};
			const result =
				baseType === 'pull-request'
					? await githubRequest(github.pulls.get, getOptions, this.options)
					: await githubRequest(github.issues.get, getOptions, this.options);

			if (
				result.data.state !== card.data.status ||
				result.data.body !== `${prefix} ${card.data.description}` ||
				result.data.title !== card.name ||
				!_.isEqual(_.map(result.data.labels, 'name'), card.tags)
			) {
				const updateOptions = {
					owner: getOptions.owner,
					repo: getOptions.repo,
					issue_number: _.parseInt(_.last(githubUrl.split('/')) as string),
					title: card.name,
					body: card.data.description,
					state: card.data.status,
					labels: card.tags,
				};

				if (baseType === 'issue') {
					this.context.log.debug(GITHUB_API_REQUEST_LOG_TITLE, {
						category: 'issues',
						action: 'update',
					});

					await githubRequest(
						github.issues.update,
						updateOptions,
						this.options,
					);
				}

				if (baseType === 'pull-request') {
					this.context.log.debug(GITHUB_API_REQUEST_LOG_TITLE, {
						category: 'pulls',
						action: 'update',
					});

					await githubRequest(github.pulls.update, updateOptions, this.options);
				}
			}

			return [];
		}

		if (baseType === 'message') {
			const issue = await this.context.getElementById(card.data.target);
			const issueBaseType = issue ? issue.type.split('@')[0] : '';
			if (
				!issue ||
				(issueBaseType !== 'issue' && issueBaseType !== 'pull-request')
			) {
				return [];
			}

			if (!issue.data.repository) {
				return [];
			}

			const issueGithubUrl = _.find(issue.data.mirrors, (mirror) => {
				return _.startsWith(mirror, 'https://github.com');
			});

			const repoDetails = issueGithubUrl
				? {
						owner: issueGithubUrl.split('/')[3],
						repository: issueGithubUrl.split('/')[4],
				  }
				: {
						owner: _.first(issue.data.repository.split('/')),
						repository: _.last(issue.data.repository.split('/')),
				  };

			if (!githubUrl) {
				this.context.log.debug(GITHUB_API_REQUEST_LOG_TITLE, {
					category: 'issues',
					action: 'createComment',
				});

				const result = await githubRequest(
					github.issues.createComment,
					{
						owner: repoDetails.owner,
						repo: repoDetails.repository,
						issue_number: _.parseInt(
							_.last(
								(issueGithubUrl || issue.data.repository).split('/'),
							) as string,
						),
						body: `${prefix} ${card.data.payload.message}`,
					},
					this.options,
				);

				card.data.mirrors = card.data.mirrors || [];
				card.data.mirrors.push(result.data.html_url);

				return [makeCard(card, options.actor)];
			}

			this.context.log.debug(GITHUB_API_REQUEST_LOG_TITLE, {
				category: 'issues',
				action: 'getComment',
			});

			try {
				const result = await githubRequest(
					github.issues.getComment,
					{
						owner: repoDetails.owner,
						repo: repoDetails.repository,
						comment_id: _.parseInt(_.last(githubUrl.split('-')) as string),
					},
					this.options,
				);

				if (result.data.body !== `${prefix} ${card.data.payload.message}`) {
					this.context.log.debug(GITHUB_API_REQUEST_LOG_TITLE, {
						category: 'issues',
						action: 'updateComment',
					});

					await githubRequest(
						github.issues.updateComment,
						{
							owner: repoDetails.owner,
							repo: repoDetails.repository,
							comment_id: result.data.id,
							body: card.data.payload.message,
						},
						this.options,
					);
				}
			} catch (error) {
				if (error.name === 'HttpError' && error.status === 404) {
					return [
						makeCard(
							Object.assign({}, card, {
								active: false,
							}),
							options.actor,
						),
					];
				}

				throw error;
			}

			return [];
		}

		return [];
	}

	async getRepoCard(
		repo: {
			html_url: any;
			owner: { login: any };
			name: any;
			git_url: any;
			created_at: string | number | undefined;
		},
		options: { actor: any; index: any },
	) {
		const mirrorID = repo.html_url;
		const existingCard = await this.getCardByMirrorId(
			mirrorID,
			'repository@1.0.0',
		);

		if (existingCard) {
			return {
				repoInfo: {
					slug: existingCard.slug,
					target: {
						id: existingCard.id,
						type: 'repository@1.0.0',
					},
				},
				card: null,
			};
		}
		const owner = repo.owner.login;
		const name = repo.name;
		const repoSlug = `repository-${owner}-${name}`.toLowerCase();
		const repoCard = {
			name: `${owner}/${name}`,
			slug: repoSlug,
			type: 'repository@1.0.0',
			tags: [],
			data: {
				owner,
				name,
				git_url: repo.git_url,
				html_url: mirrorID,
			},
		};

		return {
			repoInfo: {
				slug: repoSlug,
				target: {
					id: {
						$eval: `cards[${options.index}].id`,
					},
					type: 'repository@1.0.0',
				},
			},
			card: makeCard(repoCard, options.actor, repo.created_at),
		};
	}

	async getPRFromEvent(
		github: any,
		event: Card,
		options: { status: any; id: string | undefined },
	) {
		const root = getEventRoot(event);
		const prData = await this.generatePRDataFromEvent(github, event);
		const type = 'pull-request@1.0.0';

		const pullRequest =
			event.data.payload.pull_request || event.data.payload.issue.pull_request;

		const pr: Partial<Card> = {
			name: root.title,
			slug: `pull-request-${normaliseRootID(root.node_id)}`,
			type,
			tags: root.labels.map((label: { name: any }) => {
				return label.name;
			}),
			data: _.merge(
				{
					repository: event.data.payload.repository.full_name,
					mirrors: [getEventMirrorId(event)],
					mentionsUser: [],
					alertsUser: [],
					description: root.body || '',
					status: options.status,
					archived: false,
					closed_at: pullRequest.closed_at || null,
					merged_at: pullRequest.merged_at || null,
				},
				prData,
			),
		};

		if (options.id) {
			pr.id = options.id;
		}

		return pr;
	}

	async generatePRDataFromEvent(github: { pulls: Promise<any> }, event: Card) {
		let result = {};
		if (event.data.payload.pull_request) {
			result = gatherPRInfo(event.data.payload);
		} else {
			this.context.log.debug(GITHUB_API_REQUEST_LOG_TITLE, {
				category: 'pullRequests',
				action: 'get',
			});

			const pr = await githubRequest(
				github.pulls.get,
				{
					owner: event.data.payload.organization.login,
					repo: event.data.payload.repository.name,
					pull_number: event.data.payload.issue.number,
				},
				this.options,
			);
			result = gatherPRInfo({
				pull_request: pr.data,
			});
		}

		return result;
	}

	async createPRIfNotExists(github: OctokitRest, event: Card, actor: string) {
		const result = await this.createPRorIssueIfNotExists(
			github,
			event,
			actor,
			'pull-request@1.0.0',
		);

		if (_.isEmpty(result)) {
			return [];
		}
		const headPayload = event.data.payload.pull_request.head.repo;
		const basePayload = event.data.payload.pull_request.base.repo;

		let index = 1;
		const head = await this.getRepoCard(headPayload, {
			actor,
			index,
		});

		// If we created the repository, increment the index for links and add
		// the card to the result
		if (head.card) {
			result.push(head.card);
			index++;
		}
		const base = await this.getRepoCard(basePayload, {
			actor,
			index,
		});

		if (base.card) {
			if (_.isEqual(base.card, head.card)) {
				base.repoInfo.target.id = { $eval: `cards[${--index}].id` };
			} else {
				result.push(base.card);
			}
		}

		return result.concat([
			makeCard(
				{
					name: 'has head at',
					slug: `link-${result[0].card.slug}-head-at-${head.repoInfo.slug}`.replace(
						/[@.]/g,
						'-',
					),
					type: 'link@1.0.0',
					data: {
						inverseName: 'is head of',
						from: {
							id: {
								$eval: 'cards[0].id',
							},
							type: {
								$eval: 'cards[0].type',
							},
						},
						to: head.repoInfo.target,
					},
				},
				actor,
			),
			makeCard(
				{
					name: 'has base at',
					slug: `link-${result[0].card.slug}-base-at-${base.repoInfo.slug}`.replace(
						/[@.]/g,
						'-',
					),
					type: 'link@1.0.0',
					data: {
						inverseName: 'is base of',
						from: {
							id: {
								$eval: 'cards[0].id',
							},
							type: {
								$eval: 'cards[0].type',
							},
						},
						to: base.repoInfo.target,
					},
				},
				actor,
			),
		]);
	}

	async createPRWithConnectedIssues(
		github: OctokitRest,
		event: Card,
		actor: string,
	) {
		const mirrorID = getEventMirrorId(event);
		const cards = await this.createPRIfNotExists(github, event, actor);
		if (_.isEmpty(cards)) {
			return [];
		}
		const pr = cards[0].card;

		const connectedIssue = _.chain(pr.data.description)
			.split('\n')
			.map((line) => {
				return _.trim(line, ' \n');
			})
			.filter((line) => {
				return /^[\w-]+:/.test(line);
			})
			.map((line) => {
				return _.split(line, /\s*:\s*/);
			})
			.fromPairs()
			.get(['Connects-to'])
			.value();

		if (connectedIssue) {
			const issueCard = await this.getCardByMirrorId(
				mirrorID,
				'pull-request@1.0.0',
			);
			if (issueCard) {
				cards.push(
					makeCard(
						{
							name: 'is attached to',
							slug: `link-${pr.slug}-is-attached-to-${issueCard.slug}`,
							type: 'link@1.0.0',
							data: {
								inverseName: 'has attached',
								from: {
									id: {
										$eval: 'cards[0].id',
									},
									type: {
										$eval: 'cards[0].type',
									},
								},
								to: {
									id: issueCard.id,
									type: issueCard.type,
								},
							},
						},
						actor,
					),
				);
			}
		}
		return cards;
	}

	async closePR(github: OctokitRest, event: Card, actor: string) {
		return this.closePRorIssue(github, event, actor, 'pull-request@1.0.0');
	}

	async labelEventPR(
		github: OctokitRest,
		event: Card,
		actor: string,
		action: any,
	) {
		return this.labelPRorIssue(
			github,
			event,
			actor,
			action,
			'pull-request@1.0.0',
		);
	}

	async updatePR(github: OctokitRest, event: Card, actor: string) {
		const mirrorID = getEventMirrorId(event);
		const existingPR = await this.getCardByMirrorId(
			mirrorID,
			'pull-request@1.0.0',
		);
		const root = getEventRoot(event);

		if (_.isEmpty(existingPR)) {
			return this.createPRIfNotExists(github, event, actor);
		}

		const pr = await this.getCardFromEvent(github, event, {
			status: 'open',
		});

		return [makeCard(pr, actor, root.updated_at)];
	}

	async getIssueFromEvent(
		event: Card,
		options: { status: any; id: string | undefined | { $eval: string } },
	) {
		const root = getEventRoot(event);
		const type = 'issue@1.0.0';

		const issue: Partial<Card> = {
			name: root.title,
			slug: `issue-${normaliseRootID(root.node_id)}`,
			type,
			tags: root.labels.map((label: { name: any }) => {
				return label.name;
			}),
			data: {
				repository: event.data.payload.repository.full_name,
				mirrors: [getEventMirrorId(event)],
				mentionsUser: [],
				alertsUser: [],
				description: root.body || '',
				status: options.status,
				archived: false,
			},
		};

		if (options.id) {
			issue.id = options.id as string;
		}

		return issue;
	}

	async createIssueIfNotExists(github: OctokitRest, event: any, actor: string) {
		return this.createPRorIssueIfNotExists(github, event, actor, 'issue@1.0.0');
	}

	async closeIssue(github: OctokitRest, event: any, actor: string) {
		return this.closePRorIssue(github, event, actor, 'issue@1.0.0');
	}

	async updateIssue(
		github: OctokitRest,
		event: Card,
		actor: string,
		action: string,
	) {
		const issueMirrorId = getEventMirrorId(event);
		const issue = await this.getCardByMirrorId(issueMirrorId, 'issue@1.0.0');
		const root = getEventRoot(event);

		if (issue) {
			const issueCard = await this.getCardFromEvent(github, event, {
				id: issue.id,
				status: 'open',
			});

			return [makeCard(issueCard, actor, root.updated_at)];
		}

		const issueCard = await this.getCardFromEvent(
			github,
			revertEventChanges(event, 'issue'),
			{
				status: 'open',
			},
		);

		const sequence = [makeCard(issueCard, actor, root.created_at)];

		if (action === 'reopened') {
			const time = root.closed_at
				? root.closed_at
				: new Date(root.updated_at).valueOf();

			const closedCard = await this.getCardFromEvent(
				github,
				revertEventChanges(event, 'issue'),
				{
					status: 'closed',
					id: {
						$eval: 'cards[0].id',
					},
				},
			);

			sequence.push(makeCard(closedCard, actor, time));
		}

		const openCard = await this.getCardFromEvent(github, event, {
			status: 'open',
			id: {
				$eval: 'cards[0].id',
			},
		});

		return sequence.concat([makeCard(openCard, actor, root.updated_at)]);
	}

	async labelEventIssue(
		github: OctokitRest,
		event: any,
		actor: string,
		action: any,
	) {
		return this.labelPRorIssue(github, event, actor, action, 'issue@1.0.0');
	}

	async createIssueComment(github: OctokitRest, event: Card, actor: string) {
		const issueMirrorId = getEventMirrorId(event);
		const type = eventToCardType(event);

		const issue = await this.getCardByMirrorId(issueMirrorId, type);
		const root = getEventRoot(event);

		if (await this.getCommentByMirrorId(getCommentMirrorIdFromEvent(event))) {
			return [];
		}

		if (issue) {
			return getCommentFromEvent(this.context, event, {
				actor,
				time: event.data.payload.comment.updated_at,
				target: issue.id,
				targetCard: issue,
				offset: 0,
				active: true,
			});
		}

		// PR comments are treated as issue comments by github
		const openCard = await this.getCardFromEvent(github, event, {
			status: 'open',
		});

		const sequence = [makeCard(openCard, actor, root.created_at)];

		if (root.state === 'closed') {
			const closedCard = updateCardFromSequence(sequence, 0, {
				data: {
					status: 'closed',
				},
			});

			sequence.push(makeCard(closedCard, actor, root.closed_at));
		}

		const upserts = sequence.concat(
			(await this.getCommentsFromIssue(
				github,
				this.context,
				event,
				{
					$eval: 'cards[0].id',
				},
				[getCommentMirrorIdFromEvent(event)],
				{
					actor,
				},
			)) as any,
		);

		return upserts.concat(
			await getCommentFromEvent(this.context, event, {
				actor,
				time: event.data.payload.comment.created_at,
				offset: upserts.length,
				target: {
					$eval: 'cards[0].id',
				},
				targetCard: sequence[0].card,
				active: true,
			}),
		);
	}

	async editIssueComment(github: OctokitRest, event: Card, actor: string) {
		const updateTime = event.data.payload.comment.updated_at;

		const changes = {
			active: !event.data.payload.comment.deleted,
			data: {
				timestamp: new Date(updateTime).toISOString(),
				payload: {
					message: event.data.payload.comment.body,
				},
			},
		};

		const commentMirrorId = getCommentMirrorIdFromEvent(event);
		const comment = await this.getCommentByMirrorId(commentMirrorId);
		if (comment) {
			return [makeCard(_.merge(comment, changes), actor, updateTime)];
		}

		const issueMirrorId = getEventMirrorId(event);
		const type = eventToCardType(event);
		const issue = await this.getCardByMirrorId(issueMirrorId, type);
		const root = getEventRoot(event);
		const sequence = [];

		if (!issue) {
			const openCard = await this.getCardFromEvent(github, event, {
				status: 'open',
			});

			sequence.push(makeCard(openCard, actor, root.created_at));
		}

		const target = issue
			? issue.id
			: {
					$eval: `cards[${sequence.length - 1}].id`,
			  };

		const result = await this.getCommentsFromIssue(
			github,
			this.context,
			event,
			target,
			[],
			{
				actor,
			},
		);

		for (const item of result) {
			const githubUrl = _.find(item.card.data!.mirrors, (mirror) => {
				return _.startsWith(mirror, 'https://github.com');
			});

			if (!githubUrl) {
				continue;
			}

			if (!(await this.getCommentByMirrorId(githubUrl))) {
				sequence.push(item);
			}
		}

		const index = _.findIndex(sequence, (element) => {
			return element.card.data.mirrors.includes(commentMirrorId);
		});

		if (index === -1) {
			const upserts = await getCommentFromEvent(this.context, event, {
				actor,
				time: event.data.payload.comment.updated_at,
				active: true,
				offset: sequence.length,
				target,
				targetCard: issue || sequence[0].card,
			});

			_.merge(upserts[0].card, changes);
			sequence.push(...upserts);
		} else {
			const time = event.data.payload.comment.updated_at;
			sequence.push(
				makeCard(
					updateCardFromSequence(sequence as any, index, changes),
					actor,
					time,
				),
			);
		}

		return sequence;
	}

	async createPush(event: Card, actor: string) {
		const beforeSHA = event.data.payload.before;
		const afterSHA = event.data.payload.after;

		const pushSlug = `gh-push-from-${beforeSHA}-to-${afterSHA}`;
		const push = await this.context.getElementBySlug(`${pushSlug}@latest`);

		if (push) {
			return [];
		}

		const result = [
			makeCard(
				{
					slug: pushSlug,
					type: 'gh-push@1.0.0',
					name: 'Push Event',
					data: {
						branch: event.data.payload.ref.replace(/^refs\/heads\//, ''),
						before: beforeSHA,
						after: afterSHA,
						author: event.data.payload.pusher.name,
						commits: event.data.payload.commits,
					},
				},
				actor,
				event.data.payload.repository.updated_at,
			),
		];

		const targetRepo = event.data.payload.repository;

		const repo = await this.getRepoCard(targetRepo, {
			actor,
			index: 1,
		});

		// If we created a repository add it to the result
		if (repo.card) {
			result.push(repo.card);
		}

		// Link the push to the repository
		return result.concat([
			makeCard(
				{
					name: 'refers to',
					slug: `link-gh-push-${afterSHA}-to-${repo.repoInfo.slug.replace(
						/_/g,
						'-',
					)}`,
					type: 'link@1.0.0',
					data: {
						inverseName: 'is referenced by',
						from: {
							id: {
								$eval: 'cards[0].id',
							},
							type: {
								$eval: 'cards[0].type',
							},
						},
						to: repo.repoInfo.target,
					},
				},
				actor,
			),
		]);
	}

	async closePRorIssue(github: any, event: Card, actor: string, type: string) {
		const issueMirrorId = getEventMirrorId(event);
		const issue = await this.getCardByMirrorId(issueMirrorId, type);
		const root = getEventRoot(event);

		if (issue) {
			if (issue.data.status === 'closed') {
				return [];
			}

			issue.data.status = 'closed';

			return [makeCard(issue, actor, root.closed_at)];
		}

		const prOpened = await this.getCardFromEvent(github, event, {
			status: 'open',
		});

		const prClosed = await this.getCardFromEvent(github, event, {
			status: 'closed',
			id: {
				$eval: 'cards[0].id',
			},
		});
		return [makeCard(prOpened, actor, root.created_at)]
			.concat(
				(await this.getCommentsFromIssue(
					github,
					this.context,
					event,
					{
						$eval: 'cards[0].id',
					},
					[],
					{
						actor,
					},
				)) as any,
			)
			.concat([makeCard(prClosed, actor, root.closed_at)]);
	}

	async createPRorIssueIfNotExists(
		github: any,
		event: Card,
		actor: string,
		type: string,
	) {
		const mirrorID = getEventMirrorId(event);
		const existingCard = await this.getCardByMirrorId(mirrorID, type);
		const root = getEventRoot(event);

		if (existingCard) {
			return [];
		}

		const card = await this.getCardFromEvent(github, event, {
			status: 'open',
		});

		return [makeCard(card, actor, root.created_at)];
	}

	async labelPRorIssue(
		github: any,
		event: Card,
		actor: string,
		action: string,
		type: string,
	) {
		const issueMirrorId = getEventMirrorId(event);
		const issue = await this.getCardByMirrorId(issueMirrorId, type);
		const root = getEventRoot(event);

		if (issue) {
			const card = await this.getCardFromEvent(github, event, {
				status: root.state,
			});

			if (!_.isEqual(_.sortBy(card.tags), _.sortBy(issue.tags))) {
				card.id = issue.id;
				return [makeCard(card, actor, root.updated_at)];
			}

			return [];
		}

		const sequence = [];
		const card = await this.getCardFromEvent(github, event, {
			status: 'open',
		});

		const originalTags = _.clone(card.tags);

		if (action === 'labeled') {
			if (root.created_at === root.updated_at) {
				return [makeCard(card, actor, root.created_at)];
			}

			card.tags = _.without(card.tags, event.data.payload.label.name);

			sequence.push(makeCard(card, actor, root.created_at));

			if (root.state === 'closed') {
				const closedCard = makeCard(
					updateCardFromSequence(sequence, 0, {
						data: {
							status: 'closed',
						},
					}),
					actor,
					root.closed_at,
				);

				sequence.push(closedCard);
			}

			const updatedCard = updateCardFromSequence(
				sequence,
				sequence.length - 1,
				{
					tags: originalTags,
				},
			);

			return sequence.concat([makeCard(updatedCard, actor, root.updated_at)]);
		}

		sequence.push(makeCard(card, actor, root.created_at));

		if (event.data.payload.label) {
			sequence.push(
				makeCard(
					updateCardFromSequence(sequence, 0, {
						tags: card.tags!.concat(event.data.payload.label.name),
					}),
					actor,
					new Date(root.updated_at).valueOf(),
				),
			);
		}

		return sequence.concat([
			makeCard(
				updateCardFromSequence(sequence, 0, {
					tags: originalTags,
				}),
				actor,
				root.updated_at,
			),
		]);
	}

	async translate(event: Card) {
		if (!this.options.token.api) {
			this.context.log.warn('No token set for github integration');
			return [];
		}

		const github = await this.getOctokit(
			this.context,
			event.data.payload.installation && event.data.payload.installation.id,
		);
		if (!github) {
			this.context.log.warn('Could not authenticate with GitHub');
			return [];
		}

		const type =
			event.data.headers['X-GitHub-Event'] ||
			event.data.headers['x-github-event'];
		const action = event.data.payload.action;
		const actor = (await this.getLocalUser(github, event)) as string;
		assert.INTERNAL(null, actor, this.options.errors.SyncNoActor, () => {
			return `No actor id for ${JSON.stringify(event)}`;
		});

		switch (type) {
			case 'pull_request':
				switch (action) {
					case 'review_requested':
						return this.createPRIfNotExists(github, event, actor);
					case 'opened':
					case 'assigned':
						return this.createPRWithConnectedIssues(github, event, actor);
					case 'closed':
						return this.closePR(github, event, actor);
					case 'labeled':
					case 'unlabeled':
						return this.labelEventPR(github, event, actor, action);
					case 'synchronize':
						return this.updatePR(github, event, actor);
					default:
						return [];
				}
			case 'issues':
				switch (action) {
					case 'opened':
					case 'assigned':
						return this.createIssueIfNotExists(github, event, actor);
					case 'closed':
						return this.closeIssue(github, event, actor);
					case 'reopened':
					case 'edited':
						return this.updateIssue(github, event, actor, action);
					case 'labeled':
					case 'unlabeled':
						return this.labelEventIssue(github, event, actor, action);
					default:
						return [];
				}

			case 'pull_request_review':
				switch (action) {
					case 'submitted':
						return this.createPRIfNotExists(github, event, actor);
					default:
						return [];
				}

			case 'issue_comment':
				event.data.payload.comment.deleted = action === 'deleted';
				switch (action) {
					case 'created':
						return this.createIssueComment(github, event, actor);
					case 'deleted':
						// Refactor a delete event to look like an edit on a
						// "deleted" property
						event.data.payload.comment.changes = {
							deleted: {
								from: false,
							},
						};

					// Falls through
					case 'edited':
						return this.editIssueComment(github, event, actor);
					default:
						return [];
				}

			case 'push':
				return this.createPush(event, actor);

			default:
				return [];
		}
	}

	async getCardByMirrorId(id: string, type: string) {
		return this.context.getElementByMirrorId(type, id);
	}

	async getCommentByMirrorId(id: string) {
		return this.context.getElementByMirrorId('message@1.0.0', id);
	}

	async getCardFromEvent(
		github: any,
		event: Card,
		options: {
			status: any;
			id?: string | { $eval: string };
		},
	) {
		switch (eventToCardType(event)) {
			case 'issue@1.0.0':
				return this.getIssueFromEvent(event, options as any);
			case 'pull-request@1.0.0':
				return this.getPRFromEvent(github, event, options as any);
			default:
				throw new Error('Unknown type');
		}
	}
	getRepoFromEvent(_event: any, _options: any) {
		throw new Error('Method not implemented.');
	}

	async queryComments(
		github: { issues: { listComments: any } },
		owner: any,
		repository: any,
		issue: any,
		page = 1,
	) {
		this.context.log.debug(GITHUB_API_REQUEST_LOG_TITLE, {
			category: 'issues',
			action: 'listComments',
		});

		const response = await githubRequest(
			github.issues.listComments,
			{
				owner,
				repo: repository,
				issue_number: issue,
				per_page: 100,
				page,
			},
			this.options,
		);

		return response.data;
	}

	async getCommentsFromIssue(
		github: any,
		_context: SyncIntegrationOptions['context'],
		event: Card,
		target: string | { $eval: string },
		mirrorBlacklist: string | any[],
		options: { actor: any },
	) {
		const root = getEventRoot(event);
		const response = await this.queryComments(
			github,
			event.data.payload.repository.owner.login,
			event.data.payload.repository.name,
			root.number,
		);

		return Bluebird.reduce<any, SyncResult[]>(
			response,
			async (accumulator, payload: any) => {
				const mirrorId = payload.html_url;
				if (mirrorBlacklist.includes(mirrorId)) {
					return accumulator;
				}

				const date = new Date(payload.updated_at);
				const card = await this.getCommentByMirrorId(mirrorId);
				const data = {
					mirrors: _.get(card, ['data', 'mirrors']) || [mirrorId],
					actor: _.get(card, ['data', 'actor']) || options.actor,
					target,
					timestamp: date.toISOString(),
					payload: {
						mentionsUser: [],
						alertsUser: [],
						mentionsGroup: [],
						alertsGroup: [],
						message: payload.body,
					},
				};

				const id = await uuid.random();
				const comment: Partial<Card> = {
					slug: `message-${id}`,
					type: 'message@1.0.0',
					active: !payload.deleted,
					data,
				};

				if (card) {
					comment.id = card.id;
				}

				return accumulator.concat([
					makeCard(comment, options.actor, payload.updated_at),
				]);
			},
			[],
		);
	}

	async getLocalUser(github: OctokitRest, event: Card) {
		const remoteUser = await githubRequest(
			github.users.getByUsername,
			{
				username: event.data.payload.sender.login,
			},
			this.options,
		);

		const email =
			remoteUser.data.email &&
			remoteUser.data.email

				// Try to deal with emails such as
				// - "foo (at) gmail.com"
				// - "bar (a) hotmail.com"
				.replace(/\s*\(at?\)\s*/g, '@');

		return this.context.getActorId({
			// This is pretty much a free-form field.
			email: utils.isEmail(email) ? email : null,

			handle: remoteUser.data.login,
			company: remoteUser.data.company,
		});
	}
}

export const create = (options: SyncIntegrationOptions) => {
	return new GitHubIntegration(options);
};

// See https://developer.github.com/webhooks/securing/
export const isEventValid = async (
	token: any,
	rawEvent: string,
	headers: any,
) => {
	const signature = headers['x-hub-signature'];
	if (!signature || !token || !token.signature) {
		return false;
	}

	const hash = crypto
		.createHmac('sha1', token.signature)
		.update(rawEvent)
		.digest('hex');
	return signature === `sha1=${hash}`;
};
