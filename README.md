# Jellyfish Sync

This module contains an integration syncing engine built on top of Jellyfish,
along with a set of integrations with third party services.

# Usage

Below is an example how to use this library:

```js
const sync = require('@balena/jellyfish-sync')

sync.getExternalUserSyncEventData({}, provider, externalUser)
```

# Documentation

Visit the website for complete documentation https://product-os.github.io/jellyfish-sync