/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import * as _ from "lodash";
import { Card } from "../sync-types";

/**
 * @summary Convert to slug-compatible string
 * @function
 * @private
 *
 * @param {String} string - string to convert
 * @returns {String} slugified string
 */
export const slugify = (string: string): string => {
	return string
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-{1,}/g, "-");
};

/**
 * @summary Get a date object from an epoch number
 * @function
 * @private
 *
 * @param {Number} epoch - epoch date
 * @returns {Date} date object
 */
export const getDateFromEpoch = (epoch: number): Date => {
	return new Date(epoch * 1000);
};

/**
 * @summary Patch an object
 * @function
 * @private
 *
 * @param {Object} object - source object
 * @param {Object} delta - change delta
 * @returns {Object} patched object
 */
export const patchObject = (
	object: object,
	delta: object
): Record<string, any> => {
	return _.mergeWith(
		_.cloneDeep(object),
		delta,
		(_objectValue, sourceValue) => {
			// Always do array overrides
			if (_.isArray(sourceValue)) {
				return sourceValue;
			}

			// _.mergeWith expected undefined
			return undefined;
		}
	);
};

export const attachCards = (
	date: any,
	fromCard: { slug: any; id: any; type: any },
	toCard: { slug: any; id: any; type: any },
	options: { actor: any }
) => {
	return {
		time: date,
		actor: options.actor,
		card: {
			slug: `link-${fromCard.slug}-is-attached-to-${toCard.slug}`,
			type: "link@1.0.0",
			name: "is attached to",
			data: {
				inverseName: "has attached element",
				from: {
					id: fromCard.id,
					type: fromCard.type,
				},
				to: {
					id: toCard.id,
					type: toCard.type,
				},
			},
		},
	};
};

export const postEvent = (
	sequence: string | any[],
	eventCard: Partial<Card>,
	targetCard: Partial<Card>,
	options: { actor: any }
) => {
	if (!eventCard) {
		return [];
	}

	const date = new Date((eventCard.data as any).timestamp);
	return [
		{
			time: date,
			actor: options.actor,
			card: eventCard,
		},
		exports.attachCards(
			date,
			{
				id: {
					$eval: `cards[${sequence.length}].id`,
				},
				slug: eventCard.slug,
				type: eventCard.type,
			},
			{
				id: (eventCard.data as any).target,
				slug: targetCard.slug,
				type: targetCard.type,
			},
			{
				actor: options.actor,
			}
		),
	];
};

export const isEmail = (string: string) => {
	return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(string);
};
