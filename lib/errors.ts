/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import * as _ from 'lodash';
import * as typedErrors from 'typed-errors';

export const SyncExternalRequestError = typedErrors.makeTypedError(
	'SyncExternalRequestError',
);
export const SyncInvalidArg = typedErrors.makeTypedError('SyncInvalidArg');
export const SyncInvalidEvent = typedErrors.makeTypedError('SyncInvalidEvent');
export const SyncInvalidRequest = typedErrors.makeTypedError(
	'SyncInvalidRequest',
);
export const SyncInvalidTemplate = typedErrors.makeTypedError(
	'SyncInvalidTemplate',
);
export const SyncInvalidType = typedErrors.makeTypedError('SyncInvalidType');
export const SyncNoActor = typedErrors.makeTypedError('SyncNoActor');
export const SyncNoCompatibleIntegration = typedErrors.makeTypedError(
	'SyncNoCompatibleIntegration',
);
export const SyncNoElement = typedErrors.makeTypedError('SyncNoElement');
export const SyncNoExternalResource = typedErrors.makeTypedError(
	'SyncNoExternalResource',
);
export const SyncNoIntegrationAppCredentials = typedErrors.makeTypedError(
	'SyncNoIntegrationAppCredentials',
);
export const SyncNoMatchingUser = typedErrors.makeTypedError(
	'SyncNoMatchingUser',
);
export const SyncOAuthError = typedErrors.makeTypedError('SyncOAuthError');
export const SyncOAuthNoUserError = typedErrors.makeTypedError(
	'SyncOAuthNoUserError',
);
export const SyncPermissionsError = typedErrors.makeTypedError(
	'SyncPermissionsError',
);
export const SyncRateLimit = typedErrors.makeTypedError('SyncRateLimit');
