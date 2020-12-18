# Jellyfish Sync

This module contains an integration syncing engine built on top of Jellyfish.

[Balena API flowchart](https://docs.google.com/drawings/d/162ZuOsj-d_U0mw6YaWgCl7SmkApN3-4UL0O5WK9PkOw/edit?usp=sharing)

# Usage

Below is an example how to use this library:

```js
const Sync = require('@balena/jellyfish-sync').Sync

const sync = new Sync({
	integrations: { /* key/value lookup of integrations */ }
})

sync.getExternalUserSyncEventData({}, provider, externalUser)
```


# Documentation

Jellyfish sync library module.

