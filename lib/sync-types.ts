/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import * as errors from './errors';

export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type UpsertElementOptions = {
	actor?: string;
	timestamp: string | Date;
	originator?: string;
};

export type Token = {
	appId: string;
	appSecret?: string;
	username?: string;
	api?: any;
	signature?: any;
	intercom?: any;
	key?: any;
};

export interface TranslateOptions {
	actor: string;
	defaultUser: string;
	origin: string;
	timestamp: string;
}

export interface Card {
	active: boolean;
	capabilities: any;
	created_at: string;
	data: Record<string, any>;
	id: string;
	links: Record<string, Card[]>;
	markers: string[];
	name: string;
	requires: any;
	slug: string;
	tags: string[];
	type: string;
	updated_at: string | null;
	version: string;
}

export type SyncResult = {
	card: Partial<Card>;
	actor: string | null;
	time: string | Date;
};

export interface SyncIntegrationInstance {
	initialize(): void | Promise<void>;
	destroy(): void | Promise<void>;
	translate(event: Card, options: { actor: string }): Promise<SyncResult[]>;

	mirror(card: Card, options: { actor: string }): Promise<SyncResult[]>;
}

export interface SyncIntegrationOptions {
	errors: typeof errors;
	token: Token;
	defaultUser: any;
	context: Pick<
		SyncContext,
		| 'log'
		| 'getRemoteUsername'
		| 'getLocalUsername'
		| 'getElementBySlug'
		| 'getElementById'
		| 'getElementByMirrorId'
	> & {
		request: (actor: any, requestOptions: any) => Promise<any>;
		getActorId: (information: {
			active?: any;
			city?: any;
			company?: any;
			country?: any;
			email?: any;
			handle?: any;
			name?: any;
			title?: any;
		}) => Promise<string | null>;
	};
}

export interface SyncIntegration {
	OAUTH_BASE_URL?: string;
	OAUTH_SCOPES?: string[];

	getExternalUserSyncEventData?: (
		context: SyncContext,
		externalUser: any,
		options: { errors: any },
	) => Promise<any>;

	whoami?: (
		context: SyncContext,
		credentials: any,
		options: { errors: any },
	) => Promise<any>;

	match?: (
		context: SyncContext,
		externalUser: any,
		options: any,
	) => Promise<Card | null>;

	isEventValid: (
		token: any,
		rawEvent: any,
		headers: Record<string, any>,
	) => Promise<boolean>;

	create(options: SyncIntegrationOptions): SyncIntegrationInstance;
}

export type WorkerResponse = Pick<Card, 'id' | 'slug' | 'version' | 'type'>;

// Defined here https://github.com/product-os/jellyfish-action-library/blob/master/lib/handlers/sync-context.js
// TODO: detangle the context generation into something less tightly coupled
export interface SyncContext {
	log: {
		warn(message: string, data?: any): void;
		error(message: string, data?: any): void;
		debug(message: string, data?: any): void;
		info(message: string, data?: any): void;
	};
	getLocalUsername(username: string): string;
	getRemoteUsername(username: string): string;
	upsertElement(
		type: string,
		object: Partial<Card>,
		options: UpsertElementOptions,
	): Promise<WorkerResponse>;
	getElementBySlug(slug: string): Promise<Card | null>;
	getElementById(id: string): Promise<Card | null>;
	getElementByMirrorId(type: string, mirrorId: string): Promise<Card | null>;
	// TODO: This value is expected by the match, getExternalUserSyncEventData, associate,
	// authorize and whoami methods, but is never provided by worker/action code.
	// In all of these methods, if the value is not present, it defaults to using the
	// INTEGRATIONS object declared in this module.
	// The intention behind this needs to be understood and the code cleaned up.
	OAUTH_INTEGRATIONS: Record<string, SyncIntegration>;
}
