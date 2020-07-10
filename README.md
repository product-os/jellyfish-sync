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

Jellyfish sync library module.


* [sync](#module_sync)
    * [.OAUTH_INTEGRATIONS](#module_sync.OAUTH_INTEGRATIONS) : <code>Array.&lt;String&gt;</code>
    * [.getAssociateUrl(integration, token, slug, options)](#module_sync.getAssociateUrl) ⇒ <code>String</code>
    * [.authorize(integration, token, context, options)](#module_sync.authorize) ⇒ <code>Object</code>
    * [.whoami(context, integration, credentials)](#module_sync.whoami) ⇒ <code>Object</code>
    * [.match(context, integration, externalUser, options)](#module_sync.match) ⇒ <code>Object</code>
    * [.associate(integration, userCard, credentials, context)](#module_sync.associate) ⇒ <code>Object</code>
    * [.isValidEvent(integration, token, event)](#module_sync.isValidEvent) ⇒ <code>Boolean</code>
    * [.mirror(integration, token, card, context, options)](#module_sync.mirror) ⇒ <code>Array.&lt;Object&gt;</code>
    * [.translate(integration, token, card, context, options)](#module_sync.translate) ⇒ <code>Array.&lt;Object&gt;</code>
    * [.getFile(integration, token, file, context, options)](#module_sync.getFile) ⇒ <code>Buffer</code>

<a name="module_sync.OAUTH_INTEGRATIONS"></a>

### sync.OAUTH\_INTEGRATIONS : <code>Array.&lt;String&gt;</code>
**Kind**: static property of [<code>sync</code>](#module_sync)  
**Summary**: OAuth capable integrations  
**Access**: public  
<a name="module_sync.getAssociateUrl"></a>

### sync.getAssociateUrl(integration, token, slug, options) ⇒ <code>String</code>
**Kind**: static method of [<code>sync</code>](#module_sync)  
**Summary**: Get an external authorize URL  
**Returns**: <code>String</code> - Authorize URL  
**Access**: public  

| Param | Type | Description |
| --- | --- | --- |
| integration | <code>String</code> | integration name |
| token | <code>Object</code> | token details |
| slug | <code>String</code> | user slug |
| options | <code>Object</code> | options |
| options.origin | <code>String</code> | The callback URL |

<a name="module_sync.authorize"></a>

### sync.authorize(integration, token, context, options) ⇒ <code>Object</code>
**Kind**: static method of [<code>sync</code>](#module_sync)  
**Summary**: Authorize a user with an external OAuth service  
**Returns**: <code>Object</code> - external provider's access token  
**Access**: public  

| Param | Type | Description |
| --- | --- | --- |
| integration | <code>String</code> | integration name |
| token | <code>Object</code> | token details |
| context | <code>Object</code> | execution context |
| options | <code>Object</code> | options |
| options.code | <code>String</code> | short lived OAuth code |
| options.origin | <code>String</code> | The callbac URL |

<a name="module_sync.whoami"></a>

### sync.whoami(context, integration, credentials) ⇒ <code>Object</code>
**Kind**: static method of [<code>sync</code>](#module_sync)  
**Summary**: Gets external user  
**Returns**: <code>Object</code> - external user  
**Access**: public  

| Param | Type | Description |
| --- | --- | --- |
| context | <code>Object</code> | execution context |
| integration | <code>String</code> | integration name |
| credentials | <code>String</code> | access token for external provider api |

<a name="module_sync.match"></a>

### sync.match(context, integration, externalUser, options) ⇒ <code>Object</code>
**Kind**: static method of [<code>sync</code>](#module_sync)  
**Summary**: Gets local user matching the external user  
**Returns**: <code>Object</code> - external user  
**Access**: public  

| Param | Type | Description |
| --- | --- | --- |
| context | <code>Object</code> | execution context |
| integration | <code>String</code> | integration name |
| externalUser | <code>Object</code> | external user |
| options | <code>Object</code> | options |
| options.slug | <code>String</code> | slug to be used as a fallback to get a user |

<a name="module_sync.associate"></a>

### sync.associate(integration, userCard, credentials, context) ⇒ <code>Object</code>
**Kind**: static method of [<code>sync</code>](#module_sync)  
**Summary**: Associate a user with an external OAuth service  
**Returns**: <code>Object</code> - Upserted user card  
**Access**: public  

| Param | Type | Description |
| --- | --- | --- |
| integration | <code>String</code> | integration name |
| userCard | <code>Object</code> | user to associate external token to |
| credentials | <code>Object</code> | external provider's api token |
| context | <code>Object</code> | execution context |

<a name="module_sync.isValidEvent"></a>

### sync.isValidEvent(integration, token, event) ⇒ <code>Boolean</code>
**Kind**: static method of [<code>sync</code>](#module_sync)  
**Summary**: Check if an external event request is valid  
**Returns**: <code>Boolean</code> - whether the external event should be accepted or not  
**Access**: public  

| Param | Type | Description |
| --- | --- | --- |
| integration | <code>String</code> | integration name |
| token | <code>Object</code> | token details |
| event | <code>Object</code> | event |
| event.raw | <code>String</code> | raw event payload |
| event.headers | <code>Object</code> | request headers |

<a name="module_sync.mirror"></a>

### sync.mirror(integration, token, card, context, options) ⇒ <code>Array.&lt;Object&gt;</code>
**Kind**: static method of [<code>sync</code>](#module_sync)  
**Summary**: Mirror back a card insert coming from Jellyfish  
**Returns**: <code>Array.&lt;Object&gt;</code> - inserted cards  
**Access**: public  

| Param | Type | Description |
| --- | --- | --- |
| integration | <code>String</code> | integration name |
| token | <code>Object</code> | token details |
| card | <code>Object</code> | action target card |
| context | <code>Object</code> | execution context |
| options | <code>Object</code> | options |
| options.actor | <code>String</code> | actor id |
| [options.origin] | <code>String</code> | OAuth origin URL |

<a name="module_sync.translate"></a>

### sync.translate(integration, token, card, context, options) ⇒ <code>Array.&lt;Object&gt;</code>
**Kind**: static method of [<code>sync</code>](#module_sync)  
**Summary**: Translate an external event into Jellyfish  
**Returns**: <code>Array.&lt;Object&gt;</code> - inserted cards  
**Access**: public  

| Param | Type | Description |
| --- | --- | --- |
| integration | <code>String</code> | integration name |
| token | <code>Object</code> | token details |
| card | <code>Object</code> | action target card |
| context | <code>Object</code> | execution context |
| options | <code>Object</code> | options |
| options.actor | <code>String</code> | actor id |
| options.timestamp | <code>String</code> | timestamp |
| [options.origin] | <code>String</code> | OAuth origin URL |

<a name="module_sync.getFile"></a>

### sync.getFile(integration, token, file, context, options) ⇒ <code>Buffer</code>
**Kind**: static method of [<code>sync</code>](#module_sync)  
**Summary**: Fetch a file synced in an external service  
**Returns**: <code>Buffer</code> - file  
**Access**: public  

| Param | Type | Description |
| --- | --- | --- |
| integration | <code>String</code> | integration name |
| token | <code>Object</code> | token details |
| file | <code>String</code> | file id |
| context | <code>Object</code> | execution context |
| options | <code>Object</code> | options |
| options.actor | <code>String</code> | actor id |

