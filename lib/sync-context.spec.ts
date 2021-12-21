import _ from 'lodash';
import { getActionContext } from './sync-context';
import { WorkerContext } from './types';
import skhema from 'skhema';
import sinon from 'sinon';
import jsonpatch from 'fast-json-patch';
import * as uuid from 'uuid';
import * as JellyfishTypes from '@balena/jellyfish-types';

const makeWorkerContextStub = (
	contractFixtures: Array<Partial<JellyfishTypes.core.Contract>>,
): WorkerContext => {
	const defaults = (contract: Partial<JellyfishTypes.core.Contract>) => {
		if (!contract.id) {
			contract.id = uuid.v4();
		}
		if (!contract.slug) {
			contract.slug = `${contract.type}-${uuid.v4()}`;
		}

		return contract;
	};

	const store = _.cloneDeep(contractFixtures).map(
		defaults,
	) as JellyfishTypes.core.Contract[];

	return {
		query: async (_session: string, schema: any) => {
			return _.filter(store, (contract) => {
				return skhema.isValid(schema, contract);
			});
		},
		getContractBySlug: async (_session, slugWithVersion) => {
			const slug = slugWithVersion.split('@')[0];
			return (
				_.find(store, {
					slug,
				}) || null
			);
		},
		getContractById: async (_session, id) => {
			return (
				_.find(store, {
					id,
				}) || null
			);
		},
		insertContract: async (_session, _typeContract, _options, object) => {
			if (
				_.find(store, {
					slug: object.slug,
				})
			) {
				throw new Error(`${object.slug} already exists`);
			}
			store.push(defaults(object) as JellyfishTypes.core.Contract);
			return object;
		},
		patchContract: async (
			_session,
			_typeContract,
			_options,
			current,
			patch,
		) => {
			const existing = _.find(store, {
				id: current.id,
			});
			if (!existing) {
				throw new Error(`Can't find contract to patch: ${current.id}`);
			}
			jsonpatch.applyPatch(existing, patch);
			return existing;
		},
		defaults: defaults as any,
		errors: {
			WorkerNoElement: {} as any,
		},
	};
};

describe('context.getElementByMirrorId()', () => {
	test('should match mirrors exactly', async () => {
		const mirrorId = 'test://1';
		const contract1 = {
			id: uuid.v4(),
			slug: `contract-${uuid.v4()}`,
			type: 'contract',
			data: {
				mirrors: [mirrorId],
			},
		};

		const contract2 = {
			id: uuid.v4(),
			slug: `contract-${uuid.v4()}`,
			type: 'contract',
			data: {
				mirrors: ['test://2'],
			},
		};

		const workerContextStub = makeWorkerContextStub([contract1, contract2]);

		const context = getActionContext('foobar', workerContextStub, {}, '');

		const result: any = await context.getElementByMirrorId(
			'contract',
			mirrorId,
		);

		expect(result).toEqual(contract1);
	});

	test('should match by type', async () => {
		const mirrorId = 'test://1';
		const contract1 = {
			id: uuid.v4(),
			slug: `contract-${uuid.v4()}`,
			type: 'contract',
			data: {
				mirrors: [mirrorId],
			},
		};

		const contract2 = {
			id: uuid.v4(),
			slug: `contract-${uuid.v4()}`,
			type: 'foo',
			data: {
				mirrors: [mirrorId],
			},
		};

		const workerContextStub = makeWorkerContextStub([contract1, contract2]);

		const context = getActionContext('foobar', workerContextStub, {}, '');

		const result: any = await context.getElementByMirrorId(
			'contract',
			mirrorId,
		);

		expect(result).toEqual(contract1);
	});

	test('should not return anything if there is no match', async () => {
		const mirrorId = 'test://1';
		const contract1 = {
			type: 'contract',
			data: {
				mirrors: [mirrorId],
			},
		};

		const contract2 = {
			type: 'contract',
			data: {
				mirrors: ['test://2'],
			},
		};

		const workerContextStub = makeWorkerContextStub([contract1, contract2]);

		const context = getActionContext('foobar', workerContextStub, {}, '');

		const result = await context.getElementByMirrorId('contract', 'foobarbaz');

		expect(result).toBeFalsy();
	});

	test('should optionally use a pattern match for the mirror Id', async () => {
		const contract1 = {
			id: uuid.v4(),
			slug: `contract-${uuid.v4()}`,
			type: 'contract',
			data: {
				mirrors: ['test://foo/1'],
			},
		};

		const contract2 = {
			id: uuid.v4(),
			slug: `contract-${uuid.v4()}`,
			type: 'contract',
			data: {
				mirrors: ['test://bar/2'],
			},
		};

		const workerContextStub = makeWorkerContextStub([contract1, contract2]);

		const context = getActionContext('foobar', workerContextStub, {}, '');

		const result: any = await context.getElementByMirrorId(
			'contract',
			'foo/1',
			{
				usePattern: true,
			},
		);

		expect(result).toEqual(contract1);
	});
});

describe('context.upsertElement()', () => {
	test('should create a new element', async () => {
		const typeContract = {
			type: 'type',
			slug: 'contract',
			data: {
				schema: {
					type: 'object',
				},
			},
		};

		const workerContextStub = makeWorkerContextStub([typeContract]);

		const insertSpy = sinon.spy(workerContextStub, 'insertContract');
		const patchSpy = sinon.spy(workerContextStub, 'patchContract');

		const context = getActionContext(
			'foobar',
			workerContextStub,
			{
				id: 1,
			},
			'',
		);

		const newContract = {
			type: 'contract',
			slug: 'contract-foobarbaz',
			data: {
				test: 1,
			},
		};

		const result = await context.upsertElement('contract', newContract, {
			actor: 'ahab',
		});

		expect(insertSpy.calledOnce).toBe(true);
		expect(patchSpy.notCalled).toBe(true);

		expect(result.slug).toBe(newContract.slug);
	});

	test('should patch an element if the slug exists but no id is provided', async () => {
		const typeContract = {
			type: 'type',
			slug: 'contract',
			data: {
				schema: {
					type: 'object',
				},
			},
		};

		const contract1 = {
			type: 'contract',
			slug: 'contract-foobarbaz',
			data: {
				test: 1,
			},
		};

		const newContract = {
			...contract1,
			data: {
				test: 2,
			},
		};

		const workerContextStub = makeWorkerContextStub([typeContract, contract1]);

		const insertSpy = sinon.spy(workerContextStub, 'insertContract');
		const patchSpy = sinon.spy(workerContextStub, 'patchContract');

		const context = getActionContext(
			'foobar',
			workerContextStub,
			{
				id: 1,
			},
			'',
		);

		const result = await context.upsertElement('contract', newContract, {
			actor: 'ahab',
		});

		expect(insertSpy.notCalled).toBe(true);
		expect(patchSpy.calledOnce).toBe(true);

		expect(result.slug).toBe(contract1.slug);
		expect(result.data.test).toBe(newContract.data.test);
	});

	test('should patch an element by id even if the slugs differ', async () => {
		const typeContract = {
			type: 'type',
			slug: 'contract',
			data: {
				schema: {
					type: 'object',
				},
			},
		};

		const contract1 = {
			id: 'f41b64b3-153c-438d-b8f2-0c592f742b4c',
			type: 'contract',
			slug: 'contract-foobarbaz',
			data: {
				test: 1,
			},
		};

		const workerContextStub = makeWorkerContextStub([typeContract, contract1]);

		const insertSpy = sinon.spy(workerContextStub, 'insertContract');
		const patchSpy = sinon.spy(workerContextStub, 'patchContract');

		const context = getActionContext(
			'foobar',
			workerContextStub,
			{
				id: 1,
			},
			'',
		);

		const newContract = {
			...contract1,
			slug: `${contract1.slug}-fuzzbuzzfizz`,
			data: {
				test: 2,
			},
		};

		const result = await context.upsertElement('contract', newContract, {
			actor: 'ahab',
		});

		expect(insertSpy.notCalled).toBe(true);
		expect(patchSpy.calledOnce).toBe(true);

		expect(result.slug).toBe(contract1.slug);
		expect(result.id).toBe(contract1.id);
		expect(result.data.test).toBe(newContract.data.test);
	});

	test('should patch an element by id when the slugs are the same', async () => {
		const typeContract = {
			type: 'type',
			slug: 'contract',
			data: {
				schema: {
					type: 'object',
				},
			},
		};

		const contract1 = {
			id: 'f41b64b3-153c-438d-b8f2-0c592f742b4c',
			type: 'contract',
			slug: 'contract-foobarbaz',
			data: {
				test: 1,
			},
		};

		const workerContextStub = makeWorkerContextStub([typeContract, contract1]);

		const insertSpy = sinon.spy(workerContextStub, 'insertContract');
		const patchSpy = sinon.spy(workerContextStub, 'patchContract');

		const context = getActionContext(
			'foobar',
			workerContextStub,
			{
				id: 1,
			},
			'',
		);

		const newContract = {
			...contract1,
			data: {
				test: 2,
			},
		};

		const result = await context.upsertElement('contract', newContract, {
			actor: 'ahab',
		});

		expect(insertSpy.notCalled).toBe(true);
		expect(patchSpy.calledOnce).toBe(true);

		expect(result.slug).toBe(contract1.slug);
		expect(result.id).toBe(contract1.id);
		expect(result.data.test).toBe(newContract.data.test);
	});

	test('should patch an element using a patch object', async () => {
		const typeContract = {
			type: 'type',
			slug: 'contract',
			data: {
				schema: {
					type: 'object',
				},
			},
		};

		const contract1 = {
			id: 'f41b64b3-153c-438d-b8f2-0c592f742b4c',
			type: 'contract',
			slug: 'contract-foobarbaz',
			data: {
				test: 1,
			},
		};

		const workerContextStub = makeWorkerContextStub([typeContract, contract1]);

		const insertSpy = sinon.spy(workerContextStub, 'insertContract');
		const patchSpy = sinon.spy(workerContextStub, 'patchContract');

		const context = getActionContext(
			'foobar',
			workerContextStub,
			{
				id: 1,
			},
			'',
		);

		const update = {
			id: contract1.id,
			patch: [
				{
					op: 'replace',
					path: '/data/test',
					value: 2,
				},
			],
		};

		const result = await context.upsertElement('contract', update, {
			actor: 'ahab',
		});

		expect(insertSpy.notCalled).toBe(true);
		expect(patchSpy.calledOnce).toBe(true);

		expect(result.slug).toBe(contract1.slug);
		expect(result.id).toBe(contract1.id);
		expect(result.data.test).toBe(update.patch[0].value);
	});
});
