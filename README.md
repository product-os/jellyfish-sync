**Notice: This utility has been discontinued. The functionality provided by this module has been merged into [`jellyfish-worker`](https://github.com/product-os/jellyfish-worker).**

# Jellyfish Sync

This module contains an integration syncing engine built on top of Jellyfish.

[Balena API flowchart](https://docs.google.com/drawings/d/162ZuOsj-d_U0mw6YaWgCl7SmkApN3-4UL0O5WK9PkOw/edit?usp=sharing)

# Usage

Below is an example how to use this library:

```js
const Sync = require('@balena/jellyfish-sync').Sync;

const sync = new Sync({
	integrations: {
		/* key/value lookup of integrations */
	},
});

sync.getExternalUserSyncEventData({}, provider, externalUser);
```

# Documentation

[![Publish Documentation](https://github.com/product-os/jellyfish-sync/actions/workflows/publish-docs.yml/badge.svg)](https://github.com/product-os/jellyfish-sync/actions/workflows/publish-docs.yml)

Visit the website for complete documentation: https://product-os.github.io/jellyfish-sync
