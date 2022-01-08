import _ from 'lodash';
import Bluebird from 'bluebird';
import jsone from 'json-e';
import * as errors from './errors';
import * as instance from './instance';
import * as assert from '@balena/jellyfish-assert';
import * as JellyfishTypes from '@balena/jellyfish-types';
import {
	Integration,
	IntegrationConstructor,
	PipelineOpts,
	SequenceItem,
} from './types';

const runIntegration = async (
	integration: IntegrationConstructor,
	options: PipelineOpts,
	fn: 'translate' | 'mirror',
	contract: JellyfishTypes.core.Contract,
): Promise<JellyfishTypes.core.Contract[]> => {
	return instance.run(
		integration,
		options.token,
		async (integrationInstance: Integration) => {
			const sequence = await integrationInstance[fn](contract, {
				actor: options.actor,
			});

			options.context.log.debug('Processing pipeline sequence', {
				type: fn,
				sequence,
			});

			return importContracts(options.context, sequence, {
				origin: contract,
			});
		},
		{
			actor: options.actor,
			origin: options.origin,
			defaultUser: options.defaultUser,
			provider: options.provider,
			context: options.context,
		},
	);
};

/**
 * @summary Evaluate an object template
 * @function
 * @private
 *
 * @param {Object} object - object
 * @param {Object} environment - evaluation context
 * @returns {(Object|Null)} evaluated object
 *
 * @example
 * const result = evaluateObject({
 *   foo: {
 *     $eval: 'hello'
 *   }
 * }, {
 *   hello: 1
 * })
 *
 * console.log(result)
 * > {
 * >   foo: 1
 * > }
 */
const evaluateObject = (object: any, environment: any) => {
	if (!object) {
		return object;
	}

	if (object.$eval) {
		try {
			return jsone(object, environment);
		} catch (error: any) {
			if (error.name === 'InterpreterError') {
				return null;
			}

			throw error;
		}
	}

	for (const key of Object.keys(object)) {
		// For performance reasons
		// eslint-disable-next-line lodash/prefer-lodash-typecheck
		if (typeof object[key] !== 'object' || object[key] === null) {
			continue;
		}

		const result = evaluateObject(object[key], environment);
		if (!result) {
			return null;
		}

		object[key] = result;
	}

	return object;
};

/**
 * @summary Import a sequence of contracts
 * @function
 * @public
 *
 * @param {Object} context - worker execution context
 * @param {Array} sequence - contract sequence
 * @param {Object} options - options
 * @param {String} options.origin - origin id
 * @returns {Object[]} inserted contracts
 *
 * @example
 * const result = await pipeline.importContracts({ ... }, [
 *   {
 *     time: new Date(),
 *     contract: { ... }
 *   },
 *   {
 *     time: new Date(),
 *     contract: { ... }
 *   },
 *   {
 *     time: new Date(),
 *     contract: { ... }
 *   }
 * ], {
 *   origin: 'e9b74e2a-3553-4188-8ab8-a67e92aedbe2'
 * })
 */
export const importContracts = async (
	context: PipelineOpts['context'],
	sequence: Array<SequenceItem | SequenceItem[]>,
	options: any = {},
) => {
	// TODO: AFAICT the references option is never provided and can probably be removed
	const references = options.references || {};
	const insertedContracts: JellyfishTypes.core.Contract[] = [];

	for (const [index, value] of sequence.entries()) {
		const step = _.castArray(value);
		await Bluebird.map(
			step,
			async (segment, subindex, length) => {
				const path = ['contracts', index];
				if (length !== 1) {
					path.push(subindex);
				}

				let object = {};
				let finalObject: Partial<JellyfishTypes.core.Contract> = {};
				const type = segment.contract.type;

				// Check if this is a JSONpatch or a slug-based upsert
				if ('patch' in segment.contract) {
					// If the patch doesn't update the origin, add it now
					if (
						!_.find(segment.contract.patch, {
							path: '/data/origin',
						})
					) {
						if (
							options.origin &&
							options.origin.type === 'external-event@1.0.0'
						) {
							segment.contract.patch.push({
								op: 'add',
								path: '/data/origin',
								value: `${options.origin.slug}@${options.origin.version}`,
							});
						}
					}
					finalObject = evaluateObject(
						_.omit(segment.contract, ['links']),
						references,
					);
				} else {
					object = evaluateObject(
						_.omit(segment.contract, ['links']),
						references,
					);
					assert.INTERNAL(context, !!object, errors.SyncInvalidTemplate, () => {
						return `Could not evaluate template in: ${JSON.stringify(
							segment.contract,
							null,
							2,
						)}`;
					});

					finalObject = Object.assign(
						{
							active: true,
							version: '1.0.0',
							tags: [],
							markers: [],
							links: {},
							requires: [],
							capabilities: [],
							data: {},
						},
						object,
					);

					if (
						options.origin &&
						options.origin.type === 'external-event@1.0.0' &&
						!segment.skipOriginator
					) {
						finalObject.data!.origin = `${options.origin.slug}@${options.origin.version}`;
					}
				}

				assert.INTERNAL(context, !!segment.actor, errors.SyncNoActor, () => {
					return `No actor in segment: ${JSON.stringify(segment)}`;
				});

				const result = await context.upsertElement(type, finalObject, {
					timestamp: segment.time,
					actor: segment.actor,
					originator: segment.skipOriginator
						? null
						: _.get(options, ['origin', 'id']),
				});

				if (result) {
					insertedContracts.push(result);
				}

				_.set(references, path, result);
			},
			{
				concurrency: 3,
			},
		);
	}

	return insertedContracts;
};

/**
 * @summary Translate an external event
 * @function
 * @public
 *
 * @param {Object} integration - integration class
 * @param {Object} externalEvent - external event contract
 * @param {Object} options - options
 * @param {Object} options.context - execution context
 * @returns {Object[]} inserted contracts
 *
 * @example
 * const contracts = await pipeline.translateExternalEvent(MyIntegration, {
 *   type: 'external-event',
 *   ...
 * }, {
 *   context: { ... }
 * })
 */
export const translateExternalEvent = async (
	integration: IntegrationConstructor,
	externalEvent: JellyfishTypes.core.Contract,
	options: PipelineOpts,
) => {
	return runIntegration(integration, options, 'translate', externalEvent);
};

/**
 * @summary Mirror a contract back
 * @function
 * @public
 *
 * @param {Object} integration - integration class
 * @param {Object} contract - local contract
 * @param {Object} options - options
 * @param {Object} options.context - execution context
 * @param {String} options.actor - actor id
 * @returns {Object[]} inserted contracts
 *
 * @example
 * const contracts = await pipeline.mirrorContract(MyIntegration, {
 *   type: 'contract',
 *   ...
 * }, {
 *   context: { ... },
 *   actor: 'b76a4589-cac6-4293-b448-0440b5c66498'
 * })
 */
export const mirrorContract = async (
	integration: IntegrationConstructor,
	contract: JellyfishTypes.core.Contract,
	options: PipelineOpts,
) => {
	return runIntegration(integration, options, 'mirror', contract);
};
