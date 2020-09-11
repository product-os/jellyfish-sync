/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */
import { SyncIntegration } from '../sync-types';
/*
import * as github from "./github";
import * as front from "./front";
import * as discourse from "./discourse";
import * as outreach from "./outreach";
import * as balenaAPI from "./balena-api";
import * as flowdock from "./flowdock";
import * as typeform from "./typeform";
*/

const integrations: Record<string, SyncIntegration> = {
	/*
	github,
	front,
	discourse,
	outreach,
	"balena-api": balenaAPI,
	flowdock,
	typeform,
	*/
};

export default integrations;
